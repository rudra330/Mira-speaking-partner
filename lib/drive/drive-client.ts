import { z } from "zod";
import type { Snapshot, HistoryEntry } from "../conversation.ts";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_CLIENT_ID = "104669065702-pf3i3007lolqb6c1kki86lkcmlq24tqf.apps.googleusercontent.com";
const API = "https://www.googleapis.com/drive/v3";
const marker = "mira-speaking-partner";
const message = z.object({ id: z.string().max(160), role: z.enum(["user", "assistant"]), text: z.string().max(24000), at: z.string().datetime(), status: z.enum(["partial", "final", "interrupted"]), source: z.enum(["voice", "text"]) });
export const snapshotSchema = z.object({ id: z.string().uuid(), title: z.string().min(1).max(100), messages: z.array(message).max(500), duration: z.number().int().min(0).max(86400), revision: z.number().int().min(1).max(1000000), createdAt: z.string().datetime() });
type File = { id: string; name: string; mimeType: string; parents?: string[]; shared?: boolean; trashed?: boolean; size?: string; modifiedTime?: string; appProperties?: Record<string, string> };
export type DriveFolder = { id: string; name: string };
export class DriveError extends Error {
  reconnect: boolean;
  status: number;
  constructor(message: string, reconnect = false, status = 0) { super(message); this.reconnect = reconnect; this.status = status; }
}
const quote = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");

/** Access token exists only in this instance, never in storage, cookies, or Mira's backend. */
export class DriveClient {
  private token = "";
  private expiresAt = 0;
  private operations = new Map<string, Promise<void>>();
  private reservedIds = new Map<string, string>();
  readonly uid: string;
  private email: string;
  private transport: typeof fetch;
  private storage?: Pick<Storage, "getItem" | "setItem">;
  constructor(uid: string, email: string, transport: typeof fetch = fetch, storage?: Pick<Storage, "getItem" | "setItem">) { this.uid = uid; this.email = email; this.transport = transport; this.storage = storage; }
  clear() { this.token = ""; this.expiresAt = 0; }
  revokeToken() { const token = this.token; this.clear(); return token; }
  get connected() { return !!this.token && Date.now() < this.expiresAt; }
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.connected) throw new DriveError("Reconnect Google Drive to save. Your unsaved conversation is still here.", true);
    const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${this.token}`);
    let response: Response;
    try { response = await this.transport(path.startsWith("https://") ? path : API + path, { ...init, headers, signal: AbortSignal.timeout(20000) }); }
    catch { throw new DriveError("Drive could not be reached. Keep Mira open and retry saving."); }
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: { errors?: { reason?: string }[] } } | null;
      const reason = data?.error?.errors?.[0]?.reason;
      if (response.status === 401 || reason === "authError" || reason === "insufficientPermissions") { this.clear(); throw new DriveError("Drive access expired or was revoked. Reconnect to save your conversation.", true, response.status); }
      if (reason === "storageQuotaExceeded") throw new DriveError("Your Google Drive is full. Free some space, then retry. Your conversation is still here.", false, response.status);
      if (response.status === 403) throw new DriveError("Google Drive denied access. Check that the Drive API is enabled and the OAuth website is authorized, then reconnect.", false, 403);
      throw new DriveError(response.status === 404 ? "This Drive file or folder is unavailable. Reconnect and choose your Mira folder again." : "Google Drive couldn’t finish this request. Please retry.", false, response.status);
    }
    return response.status === 204 ? undefined as T : response.json();
  }
  async authorize(token: string, seconds: number) {
    this.token = token; this.expiresAt = Date.now() + Math.max(0, seconds - 60) * 1000;
    try {
      const about = await this.request<{ user: { emailAddress: string } }>("/about?fields=user(emailAddress)");
      if (about.user.emailAddress.toLowerCase() !== this.email.toLowerCase()) throw new DriveError("Choose the Google account with the same email as your Mira account. Your other Drive remains unchanged.");
      return about.user.emailAddress;
    } catch (error) { this.clear(); throw error; }
  }
  private props(kind: string) { return { miraApp: marker, miraOwner: this.uid, miraKind: kind }; }
  private async metadata(id: string) { return this.request<File>(`/files/${encodeURIComponent(id)}?fields=id,name,mimeType,parents,shared,trashed,size,appProperties`); }
  async validateFolder(folder: DriveFolder) {
    const file = await this.metadata(folder.id);
    if (file.trashed || file.shared || file.mimeType !== "application/vnd.google-apps.folder" || file.appProperties?.miraOwner !== this.uid || file.appProperties?.miraApp !== marker || file.appProperties?.miraKind !== "folder") throw new DriveError("Use a private folder created by Mira for this account. Shared or another account’s folders cannot be used.");
    return { id: file.id, name: file.name };
  }
  async folders() {
    const q = `trashed = false and 'me' in owners and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='miraApp' and value='${marker}' } and appProperties has { key='miraOwner' and value='${quote(this.uid)}' } and appProperties has { key='miraKind' and value='folder' }`;
    const result = await this.request<{ files: File[] }>(`/files?q=${encodeURIComponent(q)}&fields=files(id,name,shared)&pageSize=100`);
    return result.files.filter(file => !file.shared).map(({ id, name }) => ({ id, name }));
  }
  async createFolder(name: string) {
    name = name.trim();
    if (!name || name.length > 100) throw new DriveError("Enter a folder name between 1 and 100 characters.");
    const file = await this.request<File>("/files?fields=id,name", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: ["root"], appProperties: this.props("folder") }) });
    return this.validateFolder({ id: file.id, name: file.name });
  }
  private query(folder: DriveFolder, conversationId?: string) {
    return `trashed = false and '${quote(folder.id)}' in parents and appProperties has { key='miraApp' and value='${marker}' } and appProperties has { key='miraOwner' and value='${quote(this.uid)}' } and appProperties has { key='miraKind' and value='conversation' }${conversationId ? ` and appProperties has { key='miraConversation' and value='${quote(conversationId)}' }` : ""}`;
  }
  async list(folder: DriveFolder): Promise<HistoryEntry[]> {
    await this.validateFolder(folder);
    const files: File[] = []; let pageToken = "";
    do {
      const result = await this.request<{ files: File[]; nextPageToken?: string }>(`/files?q=${encodeURIComponent(this.query(folder))}&fields=nextPageToken,files(id,name,modifiedTime,shared,appProperties)&orderBy=modifiedTime%20desc&pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      files.push(...result.files.filter(file => !file.shared)); pageToken = result.nextPageToken || "";
    } while (pageToken);
    return files.map(file => ({ id: file.id, title: file.name.replace(/\.mira\.json$/, ""), message_count: Number(file.appProperties?.count || 0), duration: Number(file.appProperties?.duration || 0), created_at: file.appProperties?.createdAt || file.modifiedTime || "", updated_at: file.modifiedTime || "" }));
  }
  private async validateFile(folder: DriveFolder, id: string) {
    const file = await this.metadata(id);
    if (file.trashed || file.shared || !file.parents?.includes(folder.id) || file.appProperties?.miraOwner !== this.uid || file.appProperties?.miraApp !== marker || file.appProperties?.miraKind !== "conversation") throw new DriveError("This conversation does not belong to your selected private Mira folder, or it has been shared.");
    return file;
  }
  async open(folder: DriveFolder, id: string): Promise<Snapshot> {
    await this.validateFolder(folder); const file = await this.validateFile(folder, id);
    if (Number(file.size || 0) > 2000000) throw new DriveError("This transcript file is too large to open safely in Mira. Open it in Google Drive instead.");
    const data = await this.request<unknown>(`/files/${encodeURIComponent(id)}?alt=media`);
    const parsed = snapshotSchema.safeParse(data);
    if (!parsed.success) throw new DriveError("This conversation file is damaged or isn’t a Mira transcript.");
    return parsed.data;
  }
  async trash(folder: DriveFolder, id: string) {
    await this.validateFolder(folder); await this.validateFile(folder, id);
    await this.request(`/files/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
  }
  save(folder: DriveFolder, input: Snapshot): Promise<void> {
    const snapshot = snapshotSchema.parse(input);
    if (new TextEncoder().encode(JSON.stringify(snapshot)).length > 2000000) return Promise.reject(new DriveError("This conversation is too large to save in Mira’s transcript format. Download a copy before starting another."));
    const key = `${folder.id}:${snapshot.id}`;
    const previous = this.operations.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const locks = globalThis.navigator?.locks;
      if (locks) await locks.request(`mira.drive.save.${this.uid}.${key}`, () => this.upload(folder, snapshot));
      else await this.upload(folder, snapshot);
    });
    this.operations.set(key, next);
    void next.finally(() => { if (this.operations.get(key) === next) this.operations.delete(key); }).catch(() => {});
    return next;
  }
  private async upload(folder: DriveFolder, snapshot: Snapshot) {
    await this.validateFolder(folder);
    const results = await this.request<{ files: File[] }>(`/files?q=${encodeURIComponent(this.query(folder, snapshot.id))}&fields=files(id,appProperties)&pageSize=1`);
    let file = results.files[0];
    if (file) file = await this.validateFile(folder, file.id);
    const cacheKey = `mira.drive.file.${this.uid}.${folder.id}.${snapshot.id}`;
    let reserved = this.reservedIds.get(cacheKey) || "";
    try { reserved ||= this.storage?.getItem(cacheKey) || ""; } catch { /* Metadata cache is optional. */ }
    if (!file && reserved) {
      try { file = await this.validateFile(folder, reserved); } catch (error) { if (!(error instanceof DriveError) || error.status !== 404) throw error; }
    }
    if (file && Number(file.appProperties?.revision || 0) >= snapshot.revision) return;
    if (!file && !reserved) {
      const ids = await this.request<{ ids: string[] }>("/files/generateIds?count=1&space=drive&type=files"); reserved = ids.ids[0];
      this.reservedIds.set(cacheKey, reserved);
      try { this.storage?.setItem(cacheKey, reserved); } catch { /* Same instance retains request ID below. */ }
    }
    // Generated IDs make a lost-response retry idempotent, even after a reload.
    const metadata = { ...(file ? {} : { id: reserved, parents: [folder.id] }), name: `${snapshot.title.replace(/[\r\n]/g, " ")}.mira.json`, mimeType: "application/json", appProperties: { ...this.props("conversation"), miraConversation: snapshot.id, revision: String(snapshot.revision), count: String(snapshot.messages.length), duration: String(snapshot.duration), createdAt: snapshot.createdAt } };
    const boundary = `mira_${crypto.randomUUID().replaceAll("-", "")}`;
    const payload = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(snapshot)}\r\n--${boundary}--`;
    try {
      await this.request(`https://www.googleapis.com/upload/drive/v3/files${file ? `/${encodeURIComponent(file.id)}` : ""}?uploadType=multipart&fields=id`, { method: file ? "PATCH" : "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: payload });
    } catch (error) {
      if (!(error instanceof DriveError) || error.status !== 409 || file) throw error;
      // A concurrent tab completed the same generated file. Verify ownership and revision.
      const existing = await this.validateFile(folder, reserved);
      if (Number(existing.appProperties?.revision || 0) < snapshot.revision) throw new DriveError("A save is already finishing. Retry to save the latest version.");
    }
  }
}

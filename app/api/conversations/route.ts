import { z } from "zod";
import { api, identity, database, json, body, ApiError } from "@/lib/server";

const message = z.object({ id: z.string().max(160), role: z.enum(["user", "assistant"]), text: z.string().max(24_000), at: z.string().datetime(), status: z.enum(["partial", "final", "interrupted"]), source: z.enum(["voice", "text"]) });
const snapshot = z.object({ id: z.string().uuid(), title: z.string().min(1).max(100), messages: z.array(message).max(500), duration: z.number().int().min(0).max(86400), revision: z.number().int().min(1).max(1_000_000), createdAt: z.string().datetime() });

export async function GET(request: Request) {
  return api(async () => {
    const user = await identity();
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      z.string().uuid().parse(id);
      const row = await database().prepare("SELECT id, title, messages, duration, revision, created_at FROM conversations WHERE id = ? AND owner_id = ?").bind(id, user.userId).first<{ id: string; title: string; messages: string; duration: number; revision: number; created_at: string }>();
      if (!row) throw new ApiError(404, "This conversation could not be found.");
      return json({ ...row, messages: JSON.parse(row.messages), createdAt: row.created_at });
    }
    const rows = await database().prepare("SELECT id, title, message_count, duration, created_at, updated_at FROM conversations WHERE owner_id = ? AND message_count > 0 ORDER BY updated_at DESC LIMIT 100").bind(user.userId).all();
    return json({ conversations: rows.results });
  });
}
export async function PUT(request: Request) {
  return api(async () => {
    const user = await identity(request);
    const data = snapshot.parse(await body(request));
    const existing = await database().prepare("SELECT owner_id, revision FROM conversations WHERE id = ?").bind(data.id).first<{ owner_id: string; revision: number }>();
    if (existing && existing.owner_id !== user.userId) throw new ApiError(404, "This conversation could not be found.");
    await database().prepare(`INSERT INTO conversations (id, owner_id, title, messages, message_count, duration, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, messages = excluded.messages,
      message_count = excluded.message_count, duration = excluded.duration, revision = excluded.revision, updated_at = excluded.updated_at
      WHERE conversations.owner_id = excluded.owner_id AND conversations.revision < excluded.revision`)
      .bind(data.id, user.userId, data.title, JSON.stringify(data.messages), data.messages.length, data.duration, data.revision, data.createdAt, new Date().toISOString()).run();
    return json({ saved: true, revision: Math.max(data.revision, existing?.revision ?? 0) });
  });
}
export async function DELETE(request: Request) {
  return api(async () => {
    const user = await identity(request);
    const id = z.string().uuid().parse(new URL(request.url).searchParams.get("id"));
    await database().prepare("DELETE FROM conversations WHERE id = ? AND owner_id = ?").bind(id, user.userId).run();
    return json({ deleted: true });
  });
}

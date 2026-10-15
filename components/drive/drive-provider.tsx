"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { DriveClient, DriveError, type DriveFolder } from "@/lib/drive/drive-client";
import { loadGoogleIdentity, requestDriveAccess, revokeDriveAccess } from "@/lib/drive/google-identity";
import type { Snapshot } from "@/lib/conversation";

function useDriveState() {
  const { user } = useAuth();
  const uid = user!.uid, email = user!.email || "";
  const preferenceKey = `mira.drive.preferences.${uid}`;
  const initial = useMemo(() => {
    try {
      const data = JSON.parse(localStorage.getItem(preferenceKey) || "null");
      return { autoSave: typeof data?.autoSave === "boolean" ? data.autoSave : true, folder: typeof data?.folder?.id === "string" && typeof data?.folder?.name === "string" ? data.folder as DriveFolder : null };
    } catch { return { autoSave: true, folder: null }; }
  }, [preferenceKey]);
  const client = useMemo(() => {
    let storage: Storage | undefined;
    try { if (typeof window !== "undefined") storage = window.localStorage; } catch { /* Storage can be blocked; Drive still works for this visit. */ }
    return new DriveClient(uid, email, fetch, storage);
  }, [uid, email]);
  const [connected, setConnected] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [folder, setFolder] = useState<DriveFolder | null>(initial.folder), [folders, setFolders] = useState<DriveFolder[]>([]);
  const [autoSave, setAutoSave] = useState(initial.autoSave), [notice, setNotice] = useState("");
  const active = useRef(true), epoch = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; ++epoch.current; client.clear(); };
  }, [client, preferenceKey]);
  const remember = useCallback((nextFolder: DriveFolder | null, nextAuto: boolean) => {
    try { localStorage.setItem(preferenceKey, JSON.stringify({ folder: nextFolder, autoSave: nextAuto })); } catch { /* Optional preferences. */ }
  }, [preferenceKey]);
  const fail = useCallback((failure: unknown) => {
    if (!active.current) return;
    if (failure instanceof DriveError && failure.reconnect) setConnected(false);
    setError(failure instanceof Error ? failure.message : "Drive could not finish this request. Please try again.");
  }, []);
  const connect = async () => {
    if (busy) return; setBusy(true); setError(""); setNotice(""); const version = ++epoch.current;
    try {
      const result = await requestDriveAccess(email);
      if (!active.current || version !== epoch.current) return;
      await client.authorize(result.token, result.seconds);
      const available = await client.folders();
      if (!active.current || version !== epoch.current) { client.clear(); return; }
      setFolders(available); setConnected(true);
      const selected = available.find(item => item.id === folder?.id) || (available.length === 1 ? available[0] : null);
      setFolder(selected); remember(selected, autoSave);
      setNotice(selected ? `Connected. Conversations will use “${selected.name}”.` : "Connected. Create or select your private Mira folder to enable saving.");
    } catch (failure) { fail(failure); } finally { if (active.current) setBusy(false); }
  };
  const createFolder = async (name: string) => {
    if (busy) return; setBusy(true); setError("");
    try { const created = await client.createFolder(name); if (active.current) { setFolder(created); setFolders(old => [...old, created]); remember(created, autoSave); setNotice(`Your private folder “${created.name}” is ready.`); } }
    catch (failure) { fail(failure); } finally { if (active.current) setBusy(false); }
  };
  const selectFolder = async (id: string) => {
    const candidate = folders.find(item => item.id === id); if (!candidate || busy) return;
    setBusy(true); setError("");
    try { const selected = await client.validateFolder(candidate); setFolder(selected); remember(selected, autoSave); }
    catch (failure) { fail(failure); } finally { if (active.current) setBusy(false); }
  };
  const disconnect = async () => {
    ++epoch.current; setBusy(true); setConnected(false); setError("");
    const token = client.revokeToken();
    setFolder(null); setFolders([]); remember(null, autoSave);
    setFolder(null); setFolders([]); remember(null, autoSave);
    let revoked = false;
    try { revoked = await revokeDriveAccess(token); } catch { /* Local disconnection must still complete. */ }
    if (active.current) { setBusy(false); setNotice(revoked ? "Drive disconnected. Existing files stay in your Drive. New conversations will not be saved." : "Drive disconnected in Mira. You can also remove Mira under your Google Account’s third-party connections. Existing files remain in Drive."); }
  };
  useEffect(() => {
    const timer = setInterval(() => { if (!client.connected) setConnected(false); }, 1000);
    return () => clearInterval(timer);
  }, [client]);
  const save = useCallback(async (snapshot: Snapshot) => {
    if (!folder) throw new DriveError("Create or select a Mira folder in Settings before saving.");
    try { await client.save(folder, snapshot); } catch (failure) { fail(failure); throw failure; }
  }, [client, folder, fail]);
  return { uid, email, client, connected, busy, error, notice, folder, folders, autoSave, save, connect, disconnect, createFolder, selectFolder, fail,
    prepare: () => { void loadGoogleIdentity().catch(fail); },
    setAutoSave: (enabled: boolean) => { setAutoSave(enabled); remember(folder, enabled); },
  };
}
type DriveState = ReturnType<typeof useDriveState>;
const DriveContext = createContext<DriveState | null>(null);
export function DriveProvider({ children }: { children: ReactNode }) {
  const state = useDriveState();
  return <DriveContext.Provider value={state}>{children}</DriveContext.Provider>;
}
export function useDrive() { const state = useContext(DriveContext); if (!state) throw new Error("DriveProvider is missing"); return state; }

"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { onIdTokenChanged, reload, signOut, updateProfile, type User } from "firebase/auth";
import { firebaseAuth, authHeaders } from "@/lib/auth/firebase-client";
import { authErrorMessage } from "@/lib/auth/auth-errors";
import { registerWithName, retryAuthConnection } from "@/lib/auth/auth-actions";

type AuthState = { user: User | null; status: "loading" | "authenticated" | "unauthenticated" | "error"; error: string };
const AuthContext = createContext<(AuthState & { logout: () => Promise<void>; retry: () => void; register: (email: string, password: string, name: string) => Promise<void> }) | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, status: "loading", error: "" });
  const generation = useRef(0), readyUid = useRef("");
  const registering = useRef(false);
  const pendingName = useRef<{ uid: string; name: string } | null>(null);
  const synchronize = useCallback(async (user: User | null) => {
    const current = ++generation.current;
    if (!user) { readyUid.current = ""; setState({ user: null, status: "unauthenticated", error: "" }); return; }
    if (readyUid.current === user.uid) { setState({ user, status: "authenticated", error: "" }); return; }
    setState({ user, status: "loading", error: "" });
    try {
      const config = await fetch("/api/config", { signal: AbortSignal.timeout(15000) });
      if (!config.ok) throw new Error("Mira couldn’t restore your session. Please try again.");
      const response = await fetch("/api/auth/session", { method: "POST", headers: await authHeaders(), signal: AbortSignal.timeout(15000) });
      if (!response.ok) { const data = await response.json() as { error?: string }; throw new Error(data.error || "Mira couldn’t restore your session. Please try again."); }
      if (current !== generation.current) return;
      readyUid.current = user.uid; setState({ user, status: "authenticated", error: "" });
    } catch (error) {
      if (current === generation.current) setState({ user, status: "error", error: error instanceof Error ? error.message : "Mira couldn’t restore your session. Please try again." });
    }
  }, []);
  useEffect(() => {
    let unsubscribe = () => {};
    try { unsubscribe = onIdTokenChanged(firebaseAuth(), user => { if (!registering.current) void synchronize(user); }, error => setState({ user: null, status: "error", error: authErrorMessage(error) })); }
    catch (error) { setState({ user: null, status: "error", error: authErrorMessage(error) }); }
    return () => { ++generation.current; unsubscribe(); };
  }, [synchronize]);
  const register = async (email: string, password: string, name: string) => {
    registering.current = true;
    try {
      const credential = await registerWithName(firebaseAuth(), email, password, name);
      await retryAuthConnection(() => reload(credential.user));
      pendingName.current = null;
      await synchronize(credential.user);
    } catch (error) {
      const user = firebaseAuth().currentUser;
      if (user?.email?.toLowerCase() === email.toLowerCase()) {
        pendingName.current = { uid: user.uid, name: name.trim() };
        setState({ user, status: "error", error: "Your account is created. We couldn’t finish saving your name. Try again to finish signing in." });
      }
      throw error;
    } finally { registering.current = false; }
  };
  const retry = async () => {
    const user = firebaseAuth().currentUser;
    if (user && pendingName.current?.uid === user.uid) {
      setState({ user, status: "loading", error: "" });
      try {
        const name = pendingName.current.name;
        await retryAuthConnection(() => updateProfile(user, { displayName: name }));
        await retryAuthConnection(() => reload(user));
        pendingName.current = null;
      } catch { setState({ user, status: "error", error: "We couldn’t finish saving your name. Check your connection and try again." }); return; }
    }
    await synchronize(user);
  };
  return <AuthContext.Provider value={{ ...state, register, logout: () => { pendingName.current = null; return signOut(firebaseAuth()); }, retry: () => { void retry(); } }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider is missing");
  return auth;
}

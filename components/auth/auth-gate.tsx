"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Loader2 } from "lucide-react";
import { useAuth } from "./auth-provider";

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth(), router = useRouter();
  useEffect(() => { if (auth.status === "unauthenticated") router.replace("/sign-in"); }, [auth.status, router]);
  if (auth.status === "authenticated") return children;
  return <main className="auth-session-screen"><span className="brand-mark"><AudioLines size={25}/></span>
    {auth.status === "error" ? <><h1>Let’s reconnect.</h1><p role="alert">{auth.error}</p><button className="start-button" onClick={auth.retry}>Try again</button><button className="text-button" onClick={() => void auth.logout()}>Back to sign in</button></>
      : <><Loader2 className="auth-spinner" size={22}/><p role="status">Getting your space ready…</p></>}
  </main>;
}

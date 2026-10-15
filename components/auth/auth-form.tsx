"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AudioLines, ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, Mail, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import { browserPopupRedirectResolver, GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, updateProfile } from "firebase/auth";
import { firebaseAuth } from "@/lib/auth/firebase-client";
import { authErrorMessage } from "@/lib/auth/auth-errors";
import { retryAuthConnection } from "@/lib/auth/auth-actions";
import { useAuth } from "./auth-provider";

type Mode = "sign-in" | "sign-up" | "forgot-password";
function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 20.5H42V20H24v8h11.3A12 12 0 1 1 32.1 14l5.7-5.7A20 20 0 1 0 44 24c0-1.2-.1-2.4-.4-3.5Z"/><path fill="#34A853" d="m6.3 33.7 6.6-5.1A12 12 0 0 0 35.3 28H24v-8h18v.5h1.6A20 20 0 0 1 6.3 33.7Z"/><path fill="#FBBC05" d="M4 24c0 3.5.9 6.8 2.3 9.7l6.6-5.1a12 12 0 0 1 0-9.2L6.3 14.3A20 20 0 0 0 4 24Z"/><path fill="#EA4335" d="M24 4A20 20 0 0 0 6.3 14.3l6.6 5.1A12 12 0 0 1 32.1 14l5.7-5.7A20 20 0 0 0 24 4Z"/></svg>;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const auth = useAuth(), router = useRouter();
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState(""), [sent, setSent] = useState(false);
  const signup = mode === "sign-up", reset = mode === "forgot-password";
  const disabled = !!busy || auth.status === "loading" || auth.status === "authenticated";
  useEffect(() => { if (auth.status === "authenticated" && !busy && (!error || !!auth.user?.displayName)) router.replace("/"); }, [auth.status, auth.user?.displayName, busy, error, router]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (disabled) return;
    setError(""); setBusy("email");
    try {
      const account = firebaseAuth(), address = email.trim();
      if (reset) { await sendPasswordResetEmail(account, address); setSent(true); }
      else if (signup) {
        if (!name.trim()) { setError("Enter your name so we know what to call you."); return; }
        await auth.register(address, password, name);
      } else await retryAuthConnection(() => signInWithEmailAndPassword(account, address, password));
    } catch (failure) { setError(authErrorMessage(failure)); }
    finally { setBusy(null); }
  };
  const google = async () => {
    if (disabled) return; setError(""); setBusy("google");
    try {
      const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(firebaseAuth(), provider, browserPopupRedirectResolver);
    } catch (failure) { setError(authErrorMessage(failure)); }
    finally { setBusy(null); }
  };
  return <main className="auth-layout">
    <aside className="auth-story">
      <Link className="brand auth-brand" href="/sign-in" aria-label="Mira sign in"><span className="brand-mark"><AudioLines size={24}/></span>mira</Link>
      <div className="auth-story-content"><span className="auth-kicker"><span/>A VOICE THAT GETS YOU</span><h1>Your voice.<br/>Your space.</h1><p>Meet Mira, your AI speaking companion. Come as you are, and pick up right where you left off.</p>
        <div className="auth-orbit" aria-hidden="true"><div className="auth-orbit-core"><AudioLines size={61} strokeWidth={1.2}/></div><span className="auth-orbit-dot"/><span className="auth-orbit-note">A simple hello goes a long way.</span></div>
        <div className="auth-story-feature"><span><MessageCircle size={20}/></span><div><strong>A place for every conversation</strong><p>Your account keeps your conversations together.</p></div></div>
      </div><div className="auth-story-footer"><ShieldCheck size={16}/>Your space. At your pace.</div>
    </aside>
    <section className="auth-content" aria-labelledby="auth-title">
      <div className="auth-mobile-brand"><AudioLines size={22}/><span>mira</span></div>
      <div className="auth-card">
        <div className="auth-card-top"><span className="auth-eyebrow">{reset ? "LET’S GET YOU BACK" : signup ? "A NEW CONVERSATION STARTS HERE" : "YOUR SPACE IS WAITING"}</span><span className="auth-card-icon">{reset ? <LockKeyhole size={20}/> : <AudioLines size={21}/>}</span></div>
        <h2 id="auth-title">{reset ? "Forgot your password?" : signup ? "Make yourself at home." : "Welcome back."}</h2>
        <p className="auth-description">{reset ? "It happens. Enter your email and we’ll send you a link to reset it." : signup ? "Create your account and start talking with Mira." : "Sign in to pick up where you left off."}</p>
        {(error || auth.status === "error") && <div className="auth-error" role="alert">{auth.status === "error" ? auth.error : error}{auth.status === "error" && <div className="auth-error-actions"><button onClick={auth.retry}>Try again</button><button onClick={() => {setError("");void auth.logout();}}>Back to sign in</button></div>}{signup && auth.status === "authenticated" && error && <div className="auth-error-actions"><button disabled={!!busy} onClick={async () => { setBusy("email"); try { await retryAuthConnection(() => updateProfile(auth.user!, {displayName:name.trim()})); setError(""); } catch(failure) {setError(authErrorMessage(failure));} finally {setBusy(null);} }}>Finish saving my name</button><Link href="/">Continue to Mira</Link></div>}</div>}
        {sent ? <div className="auth-reset-success" role="status"><CheckCircle2 size={34}/><h3>Check your inbox.</h3><p>If an account uses <strong>{email.trim()}</strong>, you’ll receive a password reset link. Check your spam folder too.</p><Link className="auth-submit" href="/sign-in">Back to sign in<ArrowRight size={18}/></Link><button className="auth-inline-button" onClick={() => { setSent(false); setError(""); }}>Use a different email</button></div> : <>
          {!reset && <><button className="auth-google" type="button" onClick={() => void google()} disabled={disabled}>{busy === "google" ? <Loader2 className="auth-spinner" size={20}/> : <GoogleMark/>}{busy === "google" ? "Connecting to Google…" : "Continue with Google"}</button><div className="auth-divider"><span/>or continue with email<span/></div></>}
          <form className="auth-form" onSubmit={submit} aria-busy={!!busy}>
            {signup && <div className="auth-field"><label htmlFor="auth-name">Your name</label><div className="auth-input-wrap"><UserRound size={18}/><input id="auth-name" name="name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="What should we call you?" maxLength={80} required disabled={disabled}/></div></div>}
            <div className="auth-field"><label htmlFor="auth-email">Email address</label><div className="auth-input-wrap"><Mail size={18}/><input id="auth-email" name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" maxLength={254} required disabled={disabled}/></div></div>
            {!reset && <div className="auth-field"><div className="auth-label-row"><label htmlFor="auth-password">Password</label>{!signup && <Link href="/forgot-password">Forgot password?</Link>}</div><div className="auth-input-wrap"><LockKeyhole size={18}/><input id="auth-password" name="password" type={visible ? "text" : "password"} autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder={signup ? "Create a password" : "Enter your password"} minLength={signup ? 8 : 1} maxLength={4096} required disabled={disabled}/><button className="auth-password-toggle" type="button" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(!visible)} disabled={disabled}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>{signup && <p className="auth-field-hint">Use at least 8 characters. A longer password is stronger.</p>}</div>}
            <button className="auth-submit" type="submit" disabled={disabled}>{busy === "email" || auth.status === "loading" ? <><Loader2 className="auth-spinner" size={18}/>{busy ? reset ? "Sending your link…" : signup ? "Creating your account…" : "Signing you in…" : "Getting ready…"}</> : <>{reset ? "Send reset link" : signup ? "Create account" : "Sign in"}<ArrowRight size={18}/></>}</button>
          </form>
          <p className="auth-switch">{reset ? <Link href="/sign-in"><ArrowLeft size={15}/>Back to sign in</Link> : signup ? <>Already have an account? <Link href="/sign-in">Sign in</Link></> : <>New to Mira? <Link href="/sign-up">Create an account</Link></>}</p>
        </>}
        <div className="auth-footnote"><ShieldCheck size={16}/><p>Mira is an AI companion. Your microphone stays off until you choose to talk.</p></div>
      </div><p className="auth-content-footer">A space to be heard.</p>
    </section>
  </main>;
}

"use client";
import { DRIVE_CLIENT_ID, DRIVE_SCOPE, DriveError } from "./drive-client";
type Token = { access_token?: string; expires_in?: number; scope?: string; error?: string };
type Identity = { accounts: { oauth2: {
  initTokenClient: (config: { client_id: string; scope: string; include_granted_scopes: boolean; hint: string; callback: (token: Token) => void; error_callback: (error: { type: string }) => void }) => { requestAccessToken: (options: { prompt: string }) => void };
  revoke: (token: string, done: (result: { successful: boolean }) => void) => void;
} } };
declare global { interface Window { google?: Identity } }
let loading: Promise<Identity> | undefined;
export function loadGoogleIdentity(): Promise<Identity> {
  if (window.google?.accounts.oauth2) return Promise.resolve(window.google);
  return loading ||= new Promise<Identity>((resolve, reject) => {
    const script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client"; script.async = true;
    const timer = setTimeout(() => { script.remove(); loading = undefined; reject(new DriveError("Google authorization did not load. Check your connection and try again.")); }, 15000);
    script.onload = () => { clearTimeout(timer); if (window.google) resolve(window.google); else { loading = undefined; reject(new DriveError("Google authorization is unavailable. Please try again.")); } };
    script.onerror = () => { clearTimeout(timer); script.remove(); loading = undefined; reject(new DriveError("Google authorization is blocked. Allow accounts.google.com and try again.")); };
    document.head.appendChild(script);
  });
}
/** Called only from a Connect/Reconnect click. Firebase login receives no Drive scopes. */
export async function requestDriveAccess(email: string) {
  const identity = await loadGoogleIdentity();
  return new Promise<{ token: string; seconds: number }>((resolve, reject) => {
    const client = identity.accounts.oauth2.initTokenClient({ client_id: DRIVE_CLIENT_ID, scope: DRIVE_SCOPE, include_granted_scopes: false, hint: email,
      callback: result => {
        if (!result.access_token || result.error) { reject(new DriveError(result.error === "access_denied" ? "Drive connection was declined. You can keep using Mira without saving conversations." : "Google could not authorize Drive. Check the OAuth client and authorized website settings.")); return; }
        if (!result.scope?.split(" ").includes(DRIVE_SCOPE)) { reject(new DriveError("Drive permission was not granted. You can keep using Mira normally.")); return; }
        resolve({ token: result.access_token, seconds: Number(result.expires_in || 3600) });
      }, error_callback: error => reject(new DriveError(error.type === "popup_closed" ? "Drive connection was cancelled. You can keep using Mira normally." : "Allow Google’s authorization popup, then try connecting again.")),
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}
export async function revokeDriveAccess(token: string) {
  if (!token) return false;
  const identity = await loadGoogleIdentity();
  return new Promise<boolean>(resolve => {
    const timer = setTimeout(() => resolve(false), 10000);
    identity.accounts.oauth2.revoke(token, result => { clearTimeout(timer); resolve(result.successful); });
  });
}

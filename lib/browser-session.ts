// A random, HttpOnly browser cookie keeps anonymous visitors' histories separate.
// It is an unguessable bearer credential, never a user-selected conversation owner ID.
export function cookieName(request: Request) {
  return new URL(request.url).protocol === "https:" ? "__Host-mira_browser" : "mira_browser_dev";
}
export function browserToken(request: Request) {
  const name = cookieName(request);
  const values = (request.headers.get("cookie") || "").split(";").map(part => part.trim()).filter(part => part.startsWith(name + "="));
  if (values.length !== 1) return null;
  const token = values[0].slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export function newBrowserToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function sessionCookie(request: Request, token: string) {
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function browserOwner(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return "browser:" + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

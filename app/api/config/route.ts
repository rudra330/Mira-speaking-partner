import { env } from "cloudflare:workers";
import { api, json } from "@/lib/server";
import { browserToken, newBrowserToken, sessionCookie } from "@/lib/browser-session";
export async function GET(request: Request) {
  return api(async () => {
    const token = browserToken(request) || newBrowserToken();
    const response = json({ sessionReady: true, configured: !!(env.GEMINI_API_KEY || env.OPENAI_API_KEY), provider: env.GEMINI_API_KEY ? "gemini" : "openai", name: null });
    response.headers.set("Set-Cookie", sessionCookie(request, token));
    return response;
  });
}

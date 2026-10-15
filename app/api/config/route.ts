import { env } from "@/lib/runtime-env";
import { api, json } from "@/lib/server";
import { browserToken, newBrowserToken, sessionCookie } from "@/lib/browser-session";
import { whisperConfiguration } from "@/lib/whisper-config";
export async function GET(request: Request) {
  return api(async () => {
    const token = browserToken(request) || newBrowserToken();
    const whisper = env.GEMINI_API_KEY ? whisperConfiguration(env) : null;
    const response = json({ sessionReady: true, configured: !!(env.GEMINI_API_KEY || env.OPENAI_API_KEY), provider: env.GEMINI_API_KEY ? "gemini" : "openai", transcription: whisper ? "whisper" : "native", transcriptionProvider: whisper?.provider ?? null, legacyHistoryAvailable: !!env.DB, name: null });
    response.headers.set("Set-Cookie", sessionCookie(request, token));
    return response;
  });
}

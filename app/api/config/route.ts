import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { api, json } from "@/lib/server";
export async function GET() {
  return api(async () => {
    const user = await getChatGPTUser();
    return json({ authenticated: !!user, configured: !!(env.GEMINI_API_KEY || env.OPENAI_API_KEY), provider: env.GEMINI_API_KEY ? "gemini" : "openai", name: user?.fullName ?? null });
  });
}

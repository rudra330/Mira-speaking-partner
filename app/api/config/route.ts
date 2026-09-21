import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { api, json } from "@/lib/server";
export async function GET() {
  return api(async () => {
    const user = await getChatGPTUser();
    return json({ authenticated: !!user, configured: !!env.OPENAI_API_KEY, name: user?.fullName ?? null });
  });
}

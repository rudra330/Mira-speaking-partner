import { env } from "@/lib/runtime-env";
import { z } from "zod";
import { api, identity, body, ApiError } from "@/lib/server";

const requestSchema = z.object({
  sdp: z.string().min(10).max(100_000),
  apiKey: z.string().max(300).optional(),
  voice: z.enum(["marin", "cedar", "coral", "sage"]).default("marin"),
  noiseReduction: z.boolean().default(true),
  microphone: z.enum(["far_field", "near_field"]).default("far_field"),
  pace: z.enum(["auto", "low"]).default("auto"),
  language: z.enum(["auto", "en", "bn"]).default("auto"),
});
export async function POST(request: Request) {
  return api(async () => {
    const user = await identity(request);
    const data = requestSchema.parse(await body(request, 110_000));
    const key = data.apiKey?.trim() || env.OPENAI_API_KEY;
    if (!key) throw new ApiError(503, "Connect your OpenAI API key in settings to start a live conversation.");
    const language = data.language === "bn" ? "Speak Bengali unless asked otherwise." : data.language === "en" ? "Speak English unless asked otherwise." : "Match the user's language, including Bengali or English, and switch naturally when they do.";
    const session = {
      type: "realtime", model: env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1",
      output_modalities: ["audio"], max_output_tokens: 1024,
      instructions: `You are Mira, a warm, attentive AI conversation companion. You are an AI, never claim to be human. Have natural back-and-forth conversations: listen closely, respond to the user's meaning and emotion, keep most replies to 1-3 sentences, and ask at most one relevant follow-up question. Do not sound like a scripted assistant, deliver monologues, or repeat the user's words mechanically. Let the user finish their thought. When interrupted, immediately follow their latest thought rather than finishing your previous answer. Do not say that you can hear or identify sounds you cannot. Focus on the person addressing you and ignore incidental background sounds; ask for clarification if speech is unclear instead of inventing words. ${language} Do not bring up saved history unless provided in this session.`,
      audio: {
        input: {
          noise_reduction: data.noiseReduction ? { type: data.microphone } : null,
          transcription: { model: "gpt-4o-mini-transcribe", ...(data.language !== "auto" ? { language: data.language } : {}) },
          turn_detection: { type: "semantic_vad", eagerness: data.pace, create_response: true, interrupt_response: true },
        }, output: { voice: data.voice === "cedar" ? "shimmer" : data.voice },
      },
    };
    const form = new FormData();
    form.set("sdp", data.sdp); form.set("session", JSON.stringify(session));
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(user.userId));
    const safetyId = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    let upstream: Response;
    try {
      upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "OpenAI-Safety-Identifier": safetyId },
        body: form, signal: AbortSignal.timeout(25_000),
      });
    } catch { throw new ApiError(504, "The voice service took too long to connect. Please try again."); }
    if (!upstream.ok) {
      // Do not echo provider responses: they can contain credential fragments.
      if (upstream.status === 401) throw new ApiError(401, "That API key was not accepted. Check it in settings.");
      if (upstream.status === 429) throw new ApiError(429, "Your voice account has reached its usage limit. Check API billing or try again later.");
      if (upstream.status === 403 || upstream.status === 404) throw new ApiError(403, "This API account does not have access to the configured voice model.");
      throw new ApiError(502, "The voice service could not start this conversation. Please try again.");
    }
    return new Response(await upstream.text(), { headers: { "Content-Type": "application/sdp", "Cache-Control": "no-store" } });
  });
}

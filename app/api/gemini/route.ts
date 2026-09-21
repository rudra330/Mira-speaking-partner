import { env } from "cloudflare:workers";
import { z } from "zod";
import { api, identity, json, body, ApiError } from "@/lib/server";

const settingsSchema = z.object({
  voice: z.enum(["marin", "cedar", "coral", "sage"]).default("marin"),
  language: z.enum(["auto", "en", "bn"]).default("auto"),
  pace: z.enum(["auto", "low"]).default("auto"),
  microphone: z.enum(["near_field", "far_field"]).default("far_field"),
  noiseReduction: z.boolean().default(true),
});

export async function POST(request: Request) {
  return api(async () => {
    await identity(request);
    const settings = settingsSchema.parse(await body(request, 2000));
    if (!env.GEMINI_API_KEY) throw new ApiError(503, "The live voice service is not configured.");
    const voice = { marin: "Aoede", cedar: "Charon", coral: "Puck", sage: "Kore" }[settings.voice];
    const language = settings.language === "bn" ? "Speak Bengali unless asked otherwise." : settings.language === "en" ? "Speak English unless asked otherwise." : "Follow the user's language naturally, including Bengali and English.";
    const setup = {
      model: `models/${env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-latest"}`,
      generationConfig: { responseModalities: ["AUDIO"], maxOutputTokens: 1024, speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      systemInstruction: { parts: [{ text: `You are Mira, a warm, attentive AI conversation companion. Never claim to be human. Listen closely, follow the user's meaning and emotion, and keep most replies to 1-3 sentences. Ask at most one relevant follow-up question. Let the user finish their thought. When interrupted, follow their latest thought rather than continuing your previous reply. Ignore incidental background noise and speech not addressed to you. If speech is unclear, ask instead of guessing. ${language}` }] },
      inputAudioTranscription: {}, outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { disabled: false, startOfSpeechSensitivity: settings.microphone === "far_field" ? "START_SENSITIVITY_LOW" : "START_SENSITIVITY_HIGH", endOfSpeechSensitivity: "END_SENSITIVITY_LOW", prefixPaddingMs: 200, silenceDurationMs: settings.pace === "low" ? 1000 : 600 }, activityHandling: "START_OF_ACTIVITY_INTERRUPTS" },
      contextWindowCompression: { slidingWindow: {} },
    };
    let response: Response;
    try {
      response = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ uses: 1, expireTime: new Date(Date.now() + 31 * 60000).toISOString(), newSessionExpireTime: new Date(Date.now() + 60000).toISOString(), bidiGenerateContentSetup: setup, fieldMask: "model,generationConfig,systemInstruction,realtimeInputConfig,inputAudioTranscription,outputAudioTranscription,contextWindowCompression" }),
        signal: AbortSignal.timeout(20000),
      });
    } catch { throw new ApiError(504, "The voice service took too long to connect. Please try again."); }
    if (!response.ok) {
      if (response.status === 429) throw new ApiError(429, "The voice service has reached its usage limit. Please try again later.");
      throw new ApiError(502, "The voice service could not start. Please try again later.");
    }
    const data = await response.json() as { name?: string };
    if (!data.name) throw new ApiError(502, "The voice service did not return a connection.");
    // Only this short-lived, single-session token reaches the browser.
    return json({ token: data.name, model: setup.model });
  });
}

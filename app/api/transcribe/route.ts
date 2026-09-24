import { env } from "cloudflare:workers";
import { api, identity, json, ApiError } from "@/lib/server";

export async function POST(request: Request) {
  return api(async () => {
    await identity(request);
    if (!env.WHISPER_URL || !env.WHISPER_API_KEY) throw new ApiError(503, "Whisper transcription is not connected yet.");
    if (request.headers.get("content-type")?.split(";")[0] !== "audio/wav") throw new ApiError(415, "Please send a WAV recording.");
    const language = new URL(request.url).searchParams.get("language") || "auto";
    if (!["auto", "en", "bn"].includes(language)) throw new ApiError(400, "Please choose a supported language.");
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError(400, "No microphone audio was received.");
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 640044) { await reader.cancel(); throw new ApiError(413, "Please pause briefly between sentences."); }
      chunks.push(value);
    }
    if (size < 6444) throw new ApiError(400, "The recording was too short. Please try again.");
    const audio = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.length; }
    const speaches = env.WHISPER_API_STYLE === "speaches";
    const endpoint = new URL(speaches ? "v1/audio/transcriptions" : "transcribe", env.WHISPER_URL.replace(/\/?$/, "/"));
    if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1"].includes(endpoint.hostname))) throw new ApiError(503, "The transcription connection needs a secure server address.");
    const headers: Record<string, string> = { Authorization: `Bearer ${env.WHISPER_API_KEY}` };
    let recording: BodyInit = audio;
    if (speaches) {
      const form = new FormData();
      form.set("file", new Blob([audio], { type: "audio/wav" }), "speech.wav");
      form.set("model", env.WHISPER_MODEL || "Systran/faster-whisper-base");
      form.set("response_format", "json");
      if (language !== "auto") form.set("language", language);
      recording = form;
    } else {
      endpoint.searchParams.set("language", language); headers["Content-Type"] = "audio/wav";
    }
    let result: Response;
    const transcriptionStarted = performance.now();
    try {
      result = await fetch(endpoint, { method: "POST", headers, body: recording, redirect: "manual", signal: AbortSignal.any([request.signal, AbortSignal.timeout(40000)]) });
    } catch (error) {
      console.error("Whisper connection failed", error instanceof Error ? error.name : "Unknown failure");
      throw new ApiError(504, "Whisper could not transcribe that recording. Please reconnect and try again.");
    }
    if (!result.ok) throw new ApiError(result.status === 429 ? 429 : 502, result.status === 429 ? "Whisper is busy. Please try again in a moment." : "Whisper could not transcribe that recording. Please try again.");
    const data = await result.json() as { text?: unknown; language?: string };
    if (typeof data.text !== "string" || data.text.length > 8000) throw new ApiError(502, "Whisper returned an invalid transcript.");
    const response = json({ text: data.text.trim(), language: data.language, engine: "faster-whisper" });
    response.headers.set("Server-Timing", `transcribe;dur=${Math.round(performance.now() - transcriptionStarted)}`);
    return response;
  });
}

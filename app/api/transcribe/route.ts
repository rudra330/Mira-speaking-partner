import { env } from "@/lib/runtime-env";
import { api, identity, json, ApiError } from "@/lib/server";
import { whisperConfiguration } from "@/lib/whisper-config";

export async function POST(request: Request) {
  return api(async () => {
    await identity(request);
    const connection = whisperConfiguration(env);
    if (!connection) throw new ApiError(503, "Whisper transcription is not connected yet.");
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
    const { endpoint } = connection;
    const headers: Record<string, string> = { Authorization: `Bearer ${connection.apiKey}` };
    let recording: BodyInit = audio;
    if (connection.multipart) {
      const form = new FormData();
      form.set("file", new Blob([audio], { type: "audio/wav" }), "speech.wav");
      form.set("model", connection.model);
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
    if (!result.ok) {
      if (result.status === 429) throw new ApiError(429, "Whisper has reached its usage limit. Check API billing or try again later.");
      if (result.status === 401 || result.status === 403) throw new ApiError(502, "Whisper authentication failed. The app owner needs to check the server credential.");
      throw new ApiError(502, "Whisper could not transcribe that recording. Please try again.");
    }
    const data = await result.json() as { text?: unknown; language?: string };
    if (typeof data.text !== "string" || data.text.length > 8000) throw new ApiError(502, "Whisper returned an invalid transcript.");
    const response = json({ text: data.text.trim(), language: data.language, engine: connection.provider === "openai" ? "openai-whisper" : "faster-whisper" });
    response.headers.set("Server-Timing", `transcribe;dur=${Math.round(performance.now() - transcriptionStarted)}`);
    return response;
  });
}

type WhisperEnvironment = {
  WHISPER_ENABLED?: string;
  WHISPER_API_KEY?: string;
  WHISPER_API_STYLE?: string;
  WHISPER_MODEL?: string;
  WHISPER_URL?: string;
};

export function whisperConfiguration(env: WhisperEnvironment) {
  if (env.WHISPER_ENABLED === "false") return null;
  const apiKey = env.WHISPER_API_KEY?.trim();
  if (!apiKey) return null;
  if (env.WHISPER_API_STYLE === "openai") {
    return {
      provider: "openai" as const,
      endpoint: new URL("https://api.openai.com/v1/audio/transcriptions"),
      multipart: true,
      model: env.WHISPER_MODEL || "whisper-1",
      apiKey,
    };
  }
  if (!env.WHISPER_URL) return null;
  try {
    const multipart = env.WHISPER_API_STYLE === "speaches";
    const endpoint = new URL(multipart ? "v1/audio/transcriptions" : "transcribe", env.WHISPER_URL.replace(/\/?$/, "/"));
    if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1"].includes(endpoint.hostname))) return null;
    return {
      provider: "self-hosted" as const,
      endpoint,
      multipart,
      model: env.WHISPER_MODEL || "Systran/faster-whisper-base",
      apiKey,
    };
  } catch { return null; }
}

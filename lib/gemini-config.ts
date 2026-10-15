// Keep existing preference IDs so saved device settings remain compatible.
export const geminiVoices = {
  marin: { name: "Sulafat", label: "Sulafat · Warm & soft" },
  cedar: { name: "Achernar", label: "Achernar · Soft & calm" },
  coral: { name: "Aoede", label: "Aoede · Warm & natural" },
  sage: { name: "Vindemiatrix", label: "Vindemiatrix · Gentle" },
};

export const defaultGeminiModel = "gemini-3.8-live";

export function geminiGenerationConfig(model: string, voice: keyof typeof geminiVoices) {
  return {
    responseModalities: ["AUDIO"], maxOutputTokens: 1024,
    // 3.8 Live is optimized for latency and rejects thinkingConfig.
    ...(model.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoices[voice].name } } },
  };
}

export function geminiActivityDetection(pace: "auto" | "low", whisper: boolean) {
  return whisper ? { disabled: true } : {
    disabled: false,
    startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
    endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
    prefixPaddingMs: 100,
    silenceDurationMs: pace === "low" ? 1000 : 500,
  };
}

import type { MicVAD } from "@ricky0123/vad-web";

export async function createLocalVad(context: AudioContext, stream: MediaStream, silenceMs: number, onStart: () => void, onEnd: () => void): Promise<MicVAD> {
  const { MicVAD } = await import("@ricky0123/vad-web");
  // Vite rewrites runtime imports with ?import, which cannot load public files.
  // A same-origin fetched module also works with the production static server.
  const runtime = await fetch("/vad/ort-wasm-simd-threaded.mjs");
  if (!runtime.ok) throw new Error("Speech detector runtime is unavailable.");
  const runtimeUrl = URL.createObjectURL(new Blob([await runtime.text()], { type: "text/javascript" }));
  let detector: MicVAD;
  try { detector = await MicVAD.new({
    model: "v5", audioContext: context, processorType: "AudioWorklet",
    baseAssetPath: "/vad/", onnxWASMBasePath: "/vad/", startOnLoad: false,
    // Reuse the echo-cancelled microphone. This detector never owns its tracks.
    getStream: async () => stream, resumeStream: async () => stream, pauseStream: async () => {},
    ortConfig: ort => {
      ort.env.wasm.numThreads = 1; ort.env.logLevel = "error";
      ort.env.wasm.wasmPaths = { mjs: runtimeUrl, wasm: new URL("/vad/ort-wasm-simd-threaded.wasm", location.href).href };
    },
    positiveSpeechThreshold: 0.65, negativeSpeechThreshold: 0.35,
    minSpeechMs: 96, redemptionMs: silenceMs, preSpeechPadMs: 0,
    onSpeechRealStart: onStart, onSpeechEnd: onEnd,
    onSpeechStart: () => {}, onVADMisfire: () => {},
  }); } finally { URL.revokeObjectURL(runtimeUrl); }
  try { await detector.start(); return detector; }
  catch (error) { await detector.destroy().catch(() => {}); throw error; }
}

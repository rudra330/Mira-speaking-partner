import { copyFile, mkdir } from "node:fs/promises";

// Serve detector assets from our origin; no microphone audio goes to a VAD CDN.
export async function prepareVadAssets() {
  const target = new URL("../public/vad/", import.meta.url);
  await mkdir(target, { recursive: true });
  for (const [folder, files] of [
    ["@ricky0123/vad-web", ["silero_vad_v5.onnx", "vad.worklet.bundle.min.js"]],
    ["onnxruntime-web", ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]],
  ]) {
    for (const name of files) await copyFile(new URL(`../node_modules/${folder}/dist/${name}`, import.meta.url), new URL(name, target));
  }
}

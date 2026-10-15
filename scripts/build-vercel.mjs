import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareVadAssets } from "./prepare-vad-assets.mjs";

await prepareVadAssets();
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)),
  "build", "--webpack", ...process.argv.slice(2),
], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);

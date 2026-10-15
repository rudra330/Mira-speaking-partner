import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Vercel runs the existing App Router pages/API handlers using Next.js.
  // The original Vinext/Worker target keeps its Cloudflare environment binding.
  webpack(config, { webpack }) {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /^cloudflare:workers$/,
      path.resolve(process.cwd(), "lib/runtime-env.node.ts"),
    ));
    return config;
  },
};

export default nextConfig;

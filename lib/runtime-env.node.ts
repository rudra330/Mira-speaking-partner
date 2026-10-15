// Vercel injects backend secrets at runtime. Never import this in client code.
export const env: Cloudflare.Env = process.env as Cloudflare.Env;

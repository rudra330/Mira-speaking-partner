import { env } from "cloudflare:workers";
import { browserToken, browserOwner } from "./browser-session";
import { z } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export async function api(action: () => Promise<Response>) {
  try { return await action(); } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: "Please check your request and try again." }, 400);
    console.error("Mira request failed:", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "This service is temporarily unavailable. Please try again." }, 503);
  }
}
export async function identity(request: Request) {
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, "Please open Mira directly to continue.");
  }
  const token = browserToken(request);
  if (!token) throw new ApiError(401, "Please allow cookies for Mira and refresh the page to restore your browser session.");
  return { userId: await browserOwner(token) };
}
export function database() {
  if (!env.DB) throw new ApiError(503, "Conversation history is temporarily unavailable. Your current transcript is still available to download.");
  return env.DB;
}
export async function body(request: Request, limit = 600_000) {
  if (Number(request.headers.get("content-length")) > limit) throw new ApiError(413, "This conversation is too long. Download it and start a new one.");
  const text = await request.text();
  if (text.length > limit) throw new ApiError(413, "This conversation is too long. Download it and start a new one.");
  return JSON.parse(text);
}

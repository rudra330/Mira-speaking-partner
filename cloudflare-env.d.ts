declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_REALTIME_MODEL?: string;
    GEMINI_API_KEY?: string;
    GEMINI_LIVE_MODEL?: string;
    WHISPER_URL?: string;
    WHISPER_ENABLED?: string;
    WHISPER_API_KEY?: string;
    WHISPER_API_STYLE?: string;
    WHISPER_MODEL?: string;
  }
}

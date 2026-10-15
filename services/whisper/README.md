# Mira Whisper service

Mira records short mono PCM16 WAV utterances in browser memory. `/api/transcribe` checks the browser session and forwards each clip to OpenAI-hosted Whisper or an authenticated faster-whisper service. The resulting text is saved as the user's voice transcript and sent to Gemini Live as a text turn. Gemini generates the avatar's spoken response. Raw recordings are not saved to the conversation database.

## OpenAI-hosted Whisper

Set `WHISPER_API_STYLE=openai`, `WHISPER_MODEL=whisper-1`, and `WHISPER_API_KEY` to an OpenAI project API key with transcription access and available API billing. No `WHISPER_URL` or separate server is required. The server sends WAV multipart uploads to the fixed `https://api.openai.com/v1/audio/transcriptions` endpoint; this key never reaches the browser. Configure `GEMINI_API_KEY` for the spoken replies. For local development, keep these credentials in ignored `.env.local`; for hosting, use server secrets. The separate `OPENAI_API_KEY` remains available for the alternative OpenAI Realtime voice path.

If transcription credits are exhausted, set `WHISPER_ENABLED=false` to keep Start talking available through Gemini's native speech recognition. After restoring billing, set `WHISPER_ENABLED=true` to use OpenAI Whisper again.

## Cloud service

The Railway service uses the official CPU image `ghcr.io/speaches-ai/speaches:latest-cpu`, which provides faster-whisper through `/v1/audio/transcriptions`. It uses `Systran/faster-whisper-base` for lower latency, multilingual transcription, CPU/int8 inference, and the service's speech filter. The larger small model remains installed for rollback. Base trades some recognition accuracy on difficult audio for faster inference. `ENABLE_UI=false` and `LOG_LEVEL=warning` avoid a public upload UI and verbose transcript logs. A generated `API_KEY` protects inference and model-management routes. The key belongs only in server secrets.

Required Sites variables: `WHISPER_URL` (HTTPS service origin), `WHISPER_API_STYLE=speaches`, `WHISPER_MODEL=Systran/faster-whisper-base`, and secret `WHISPER_API_KEY` matching the service's `API_KEY`. Existing Gemini credentials remain unchanged. The browser receives none of these secrets. Without a complete Whisper configuration, the existing native Gemini flow remains available.

Railway project: `6485b2da-e4ad-4b6f-81db-ffb678fe0b5f`. Production environment: `ef12d387-44f9-48fe-8c54-c2e1ae07edc4`. Service: `2cac5faf-19a8-42da-ba16-f00a5c936e43`.

The deployed Speaches image reports v0.8.2. Keep models loaded with `WHISPER__TTL=-1` and app sleeping disabled. This version ignores `PRELOAD_MODELS` and `STT_MODEL_TTL`; the Railway start command explicitly runs Hugging Face `snapshot_download` for both base and small before starting Uvicorn. Set `PORT=8000`, and use `/docs` for Railway's unauthenticated health check (`/health` requires the API key). Apply changed configuration with `set_variables(skipDeploys=false)`; redeploying an old deployment can reuse its old configuration. Server hosting has its own usage charges; no OpenAI API key is required for Whisper.

## Local service

`server.py` is a lightweight alternative using the same faster-whisper library. It accepts raw WAV at `/transcribe`; use `WHISPER_API_STYLE=raw` for this endpoint. It checks the service token, limits audio to 20 seconds, uses Silero VAD, bounds inference concurrency, and processes audio in memory.

```sh
python -m venv .venv
.venv/bin/pip install -r requirements.txt
export WHISPER_SERVICE_TOKEN="a-random-secret-of-at-least-32-characters"
export WHISPER_MODEL_DIR="./models"
.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8765
```

For local Windows development, the installed environment is `../../.sites-runtime/whisper-venv`. `Dockerfile` packages this alternative service with the model downloaded at build time. Never commit environment files, recordings, or model caches.

## Behavior and limitations

Speech is segmented after roughly 450 ms of quiet (1.1 seconds for “Give me more time”), with a maximum 15-second segment. Recognition appears after a segment is transcribed, rather than word-by-word while speaking. Local energy detection stops current avatar playback promptly; the server's speech filter decides whether a clip contains speech. This does not identify the intended speaker or guarantee removal of nearby voices. In Whisper mode Gemini's audio activity detector is disabled: client activityStart cancels an outstanding reply at speech onset, while Whisper transcribes. The client sends recognized realtime text followed by activityEnd once recognition and any interruption acknowledgement finish. End conversation aborts requests and drops queued recordings and late results. Gemini thinking is disabled for short voice replies. The transcription response includes Server-Timing for future latency diagnosis without recording audio or transcripts in logs.

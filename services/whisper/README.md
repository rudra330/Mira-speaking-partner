# Mira Whisper service

Mira records short mono PCM16 WAV utterances in browser memory. `/api/transcribe` checks the browser session and forwards each clip to an authenticated faster-whisper service. The resulting text is saved as the user's voice transcript and sent to Gemini Live as a text turn. Gemini generates the avatar's spoken response. Raw recordings are not saved to the conversation database.

## Cloud service

The Railway service uses the official CPU image `ghcr.io/speaches-ai/speaches:latest-cpu`, which provides faster-whisper through `/v1/audio/transcriptions`. It uses `Systran/faster-whisper-small`, multilingual transcription, CPU/int8 inference, and the service's speech filter. `ENABLE_UI=false` and `LOG_LEVEL=warning` avoid a public upload UI and verbose transcript logs. A generated `API_KEY` protects inference and model-management routes. The key belongs only in server secrets.

Required Sites variables: `WHISPER_URL` (HTTPS service origin), `WHISPER_API_STYLE=speaches`, `WHISPER_MODEL=Systran/faster-whisper-small`, and secret `WHISPER_API_KEY` matching the service's `API_KEY`. Existing Gemini credentials remain unchanged. The browser receives none of these secrets. Without a complete Whisper configuration, the existing native Gemini flow remains available.

Railway project: `6485b2da-e4ad-4b6f-81db-ffb678fe0b5f`. Production environment: `ef12d387-44f9-48fe-8c54-c2e1ae07edc4`. Service: `2cac5faf-19a8-42da-ba16-f00a5c936e43`.

Keep the model loaded with `STT_MODEL_TTL=-1`, and app sleeping disabled. `PRELOAD_MODELS=["Systran/faster-whisper-small"]` downloads weights on compatible Speaches versions; validate model availability and perform a warm-up transcription before enabling the app. Server hosting has its own usage charges; no OpenAI API key is required for Whisper.

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

Speech is segmented after roughly 650 ms of quiet (1.1 seconds for “Give me more time”), with a maximum 15-second segment. Recognition appears after a segment is transcribed, rather than word-by-word while speaking. Local energy detection stops current avatar playback promptly; the server's speech filter decides whether a clip contains speech. This does not identify the intended speaker or guarantee removal of nearby voices. If interrupted, old reply audio is discarded, and new recognized text is sent after the outstanding Gemini generation completes. End conversation aborts requests and drops queued recordings and late results.

# Mira

A public voice conversation app with separate private browser histories built with React, Vinext, Cloudflare Workers, and D1. It supports Gemini Live over WebSockets and OpenAI Realtime over WebRTC.

## Use

Open the link and choose Start talking. No account or login is required. The current hosted copy uses Gemini Live with a server secret. The browser receives only a short-lived, single-session token restricted to the voice configuration. No provider key is embedded in source or the client bundle.

Configure `GEMINI_API_KEY` as a server secret; `GEMINI_LIVE_MODEL` defaults to `gemini-2.5-flash-native-audio-latest`. Alternatively configure `OPENAI_API_KEY` with `OPENAI_REALTIME_MODEL` (default `gpt-realtime-2.1`). Gemini takes priority when both are configured. When no server provider is configured, Settings accepts a personal OpenAI key in page memory only. Refreshing forgets it. API use is charged to the configured account. `.env.example` lists settings without secret values.

Choose Start talking, review the microphone notice, and allow the browser’s permission request. Text input can start a session without microphone permission. End conversation closes the peer connection, stops microphone tracks, and closes the audio context. Calls end after 30 minutes.

## Conversation behavior

- When the Whisper service is configured, the voice path is microphone → faster-whisper → text → Gemini Live → avatar audio. Short recordings stay in memory while being transcribed; their recognized text appears in the chat. See `services/whisper/README.md` for service deployment and runtime configuration. Whisper does not use the OpenAI API or an OpenAI key.
- Whisper mode segments speech on a short pause and shows a transcription status. Starting to speak stops queued avatar playback; stale reply audio stays discarded while the next recognized turn is prepared. Transcript latency depends on the server and recording length.

- Gemini uses an AudioWorklet to capture mono 16 kHz PCM, streams directly over a token-authenticated WebSocket, and schedules streamed PCM responses for playback. Gemini's interruption events immediately stop queued audio. Session resumption handles planned connection renewals. OpenAI uses WebRTC and a server-side SDP handshake.
- Semantic voice activity detection supports natural pauses and automatic interruption. WebRTC’s server output buffer cancels and truncates unplayed audio. Text interruptions wait for cancellation before starting a replacement response.
- Echo cancellation, automatic gain control, browser noise suppression, and optional browser voice isolation help with noise. Gemini uses speech detection sensitivity appropriate to the microphone; OpenAI additionally uses server near/far-field reduction. This is not speaker authentication and cannot reliably exclude all nearby speakers.
- The avatar is an original illustrated portrait with audio-reactive motion and a live waveform. It is not a photorealistic, lip-synced video avatar.
- Both speakers’ transcripts are streamed into chat and saved to D1 under a hashed, random browser-session identity. Audio recordings are not retained by this app. The selected provider processes audio under that API account’s applicable data terms; microphone consent names that provider.
- Transcriptions are an approximate record. An interrupted output is labeled because text can arrive before its audio is heard.
- History supports viewing, downloading, and deleting conversations. Monotonic revisions prevent delayed autosaves from overwriting newer text. Failed saves remain in memory, visibly offer retry/export, and warn before closing the page. Unsent data cannot survive browser termination.

## Development

Run `npm run install:ci`, then `npm run dev`. The development URL is printed by Vinext. An HttpOnly, SameSite cookie is issued automatically by `/api/config`; production cookies also use Secure and the __Host prefix. No ChatGPT identity is used. Each browser has separate history; clearing cookies loses access, and histories do not sync across devices. Previously account-owned records stay private and are not exposed to anonymous visitors.

Generate database migrations with `npm run db:generate`. Build with `npm run build`, then apply the generated migration locally using the starter’s documented Wrangler command in `README.md`. Sites applies migrations during deployment.

Run `node --experimental-strip-types --test tests/conversation.test.mjs tests/gemini.test.mjs` and `node node_modules/typescript/bin/tsc --noEmit` for local validation. With a local preview running, `node tests/api.integration.mjs` checks database save/reload, stale revision handling, origin checks, and unauthorized access with one disposable record.

## Reference

- https://developers.openai.com/api/docs/guides/voice-webrtc
- https://developers.openai.com/api/docs/guides/realtime-vad
- https://developers.openai.com/api/docs/guides/realtime-conversations

Validation includes a real Gemini audio response and transcript using the exact restricted-token route configuration. The supplied OpenAI key authenticated but generation reported exhausted credits, so the hosted app uses Gemini. Unit checks cover interruption playback clearing, stale transcript events, mute signaling, and PCM resampling. Live microphone capture, acoustics, and interruption timing still need a physical-device test.

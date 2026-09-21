# Mira

A private voice conversation app built with React, Vinext, Cloudflare Workers, D1, and the OpenAI Realtime API over WebRTC.

## Use

Sign in with ChatGPT, open Settings, and enter an OpenAI API key with Realtime access. A personal key is held only in page memory and sent to the same-origin server for the connection handshake. It is not stored in the database, browser storage, or logs. Refreshing the page forgets it. API use is charged to that API account.

Alternatively configure `OPENAI_API_KEY` as a server secret in the hosting environment. `OPENAI_REALTIME_MODEL` defaults to `gpt-realtime-2.1`. `.env.example` lists both variables. No secret has been included with this project.

Choose Start talking, review the microphone notice, and allow the browser’s permission request. Text input can start a session without microphone permission. End conversation closes the peer connection, stops microphone tracks, and closes the audio context. Calls end after 30 minutes.

## Conversation behavior

- Speech-to-speech audio uses WebRTC and a server-side SDP handshake; the provider key is not embedded in the bundle.
- Semantic voice activity detection supports natural pauses and automatic interruption. WebRTC’s server output buffer cancels and truncates unplayed audio. Text interruptions wait for cancellation before starting a replacement response.
- Echo cancellation, automatic gain control, browser noise suppression, optional browser voice isolation, and server near/far-field reduction help with noise. This is not speaker authentication and cannot reliably exclude all nearby speakers.
- The avatar is an original illustrated portrait with audio-reactive motion and a live waveform. It is not a photorealistic, lip-synced video avatar.
- Both speakers’ transcripts are streamed into chat and saved to D1 under the signed-in user’s identity. Audio recordings are not retained by this app. OpenAI processes the audio under the API account’s applicable data terms.
- Transcriptions are an approximate record. An interrupted output is labeled because text can arrive before its audio is heard.
- History supports viewing, downloading, and deleting conversations. Monotonic revisions prevent delayed autosaves from overwriting newer text. Failed saves remain in memory, visibly offer retry/export, and warn before closing the page. Unsent data cannot survive browser termination.

## Development

Run `npm run install:ci`, then `npm run dev`. The development URL is printed by Vinext. Local auth uses the starter’s `/signin-with-chatgpt?return_to=/` route; production identity comes from Sites and mock auth is not shipped.

Generate database migrations with `npm run db:generate`. Build with `npm run build`, then apply the generated migration locally using the starter’s documented Wrangler command in `README.md`. Sites applies migrations during deployment.

Run `node --experimental-strip-types --test tests/conversation.test.mjs` and `node node_modules/typescript/bin/tsc --noEmit` for local validation.

## Reference

- https://developers.openai.com/api/docs/guides/voice-webrtc
- https://developers.openai.com/api/docs/guides/realtime-vad
- https://developers.openai.com/api/docs/guides/realtime-conversations

Live microphone quality, timing, and model responses require a real API key and a device/browser test. No key was available during initial implementation, so those aspects were not verified against a live paid AI session.

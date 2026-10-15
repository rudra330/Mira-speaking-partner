# Mira: Vercel via GitHub, Firebase Spark

This project is configured for Vercel's Next.js deployment. Firebase remains on Spark and provides existing email/password and Google Authentication. Conversations use each person's optional Google Drive connection. No Firebase Hosting, Cloud Run, Firebase Functions, billing account, database migration, or Firebase Admin service-account key is required.

The original frontend is React 19 with Vinext's App Router implementation. Vercel builds those same pages and API handlers with the already-installed Next.js 16.3.4 package. No UI redesign or dependency upgrade is involved. `next.config.ts` replaces the Cloudflare environment binding with server-side `process.env`; the original Vinext/Worker build keeps its existing binding and data.

## Deploy from GitHub

Repository: https://github.com/rudra330/Mira-speaking-partner

1. Sign in at https://vercel.com/new with the GitHub account that owns the repository. Choose your personal **Hobby** workspace and import the repository.
2. Set Framework Preset to **Next.js**, Root Directory to the repository root, and Node.js to **24.x**. The checked-in `vercel.json` selects `npm ci --no-audit --no-fund` and `npm run build:vercel`. Leave Output Directory at Next.js's default; do not select `dist/client` or a static export.
3. Add the environment variables below in Vercel Project Settings → Environment Variables, with scope **Production**. Enable Preview only for trusted preview deployments that should have AI access. Never paste the private `.env.local` file into GitHub or prefix private keys with `NEXT_PUBLIC_`.
4. Deploy. Vercel shows the assigned stable Production domain, typically `<project-name>.vercel.app`. The exact address is not guaranteed until Vercel creates the project. Complete the Firebase/OAuth website settings below using that actual domain. Then test the production address on your tablet over HTTPS.
5. Subsequent pushes to Vercel's selected Production Branch redeploy automatically; other branches can create previews. Keep public users on the stable Production domain rather than authorizing every temporary preview address.

| Server variable | Value / purpose |
| --- | --- |
| `GEMINI_API_KEY` | Existing private Gemini key from the owner's ignored `.env.local`; required for the current working voice provider. |
| `GEMINI_LIVE_MODEL` | `gemini-3.8-live` (current default). |
| `WHISPER_ENABLED` | `false` to preserve the current working native Gemini transcription. |
| `OPENAI_API_KEY` | Existing private key, optional fallback. Previous checks reported exhausted OpenAI credits; adding it does not restore credits. |
| `OPENAI_REALTIME_MODEL` | `gpt-realtime-2.1` (optional default override). |
| `WHISPER_API_KEY` | Existing private OpenAI Whisper key; optional while Whisper is disabled. |
| `WHISPER_API_STYLE` | `openai`. |
| `WHISPER_MODEL` | `whisper-1`. |

No `WHISPER_URL` is needed for OpenAI-hosted Whisper. Redeploy after changing environment variables. Visitors receive restricted short-lived Gemini tokens, not the private provider keys. The public Firebase configuration and supplied Drive client ID are already in the app; they are not server secrets. No OAuth client secret is required for the Drive popup.

## Firebase and Google website settings

Keep project `mira-speaking-partner` on Spark. Existing Email/Password and Google sign-in providers are enabled; preserve their current settings.

1. Firebase Console → Authentication → Settings → Authorized domains: add the actual production **hostname only**, such as `your-project.vercel.app`. Keep localhost and existing Firebase domains. Add any real custom hostname separately if you use one.
2. Google Cloud Console → Google Auth Platform → Clients: open Drive OAuth client `104669065702-pf3i3007lolqb6c1kki86lkcmlq24tqf.apps.googleusercontent.com`. Add the exact **Authorized JavaScript origin**, such as `https://your-project.vercel.app` (no path or trailing slash). Keep existing origins and Firebase login redirect URIs. Drive is a separate token-popup authorization and needs no new redirect URI.
3. Google Drive API was verified **enabled** for this project using the owner account. Keep only `https://www.googleapis.com/auth/drive.file` for this app's Drive access. Do not enable full Drive access or add Drive scopes to the Firebase login provider.
4. Check OAuth branding/support/contact and Audience settings. If the OAuth app is in Testing, add the intended Google accounts as test users. For wider release, publish the OAuth app and follow any verification requirements actually shown by Google. These console settings were not changed automatically.
5. Password recovery uses Firebase's standard hosted reset page. Check Authentication → Templates → Password reset for sender/support details, and test delivery and completed reset with an email inbox you own. The existing Firebase auth domain can stay `mira-speaking-partner.firebaseapp.com`.

Console links:
- https://console.firebase.google.com/project/mira-speaking-partner/authentication/settings
- https://console.cloud.google.com/auth/clients?project=mira-speaking-partner
- https://console.cloud.google.com/apis/library/drive.googleapis.com?project=mira-speaking-partner

## Voice and storage behavior

Only short HTTPS API requests run on Vercel: identity verification, token issuance, optional Whisper transcription, and OpenAI connection setup. Live Gemini audio streams directly between the browser and Gemini; OpenAI audio uses browser WebRTC. A call does not hold a Vercel function open for its entire duration. The handlers have a 60-second execution limit, and the app's maximum Whisper upload is about 640 KB, below Vercel's 4.5 MB request limit. Avatar and local speech-detection assets are static files prepared during the build.

Firebase login and Drive consent remain separate. A user can talk without Drive, but new conversations are not saved to Mira's server or localStorage. A connected Google account must match the Firebase email. Users create a named private folder or select a previous private Mira folder. Automatic saving defaults on and begins immediately when End is pressed, provided connection and folder are ready. Disabling it offers manual saving. Saved appears only after Drive acknowledges upload. History lists and reopens that person's files from the chosen folder; files consume their Drive space.

Account-scoped metadata, ownership checks, reused file IDs, revision checks, and serialized writes avoid normal duplicate/retry saves and cross-account access. No public sharing permissions are created. Disconnect clears authorization/preferences and keeps existing Drive files. Expired/revoked access offers reconnect and preserves unsaved text in page memory. Closing/killing the browser can lose unsaved text; normal closure/navigation warns and download remains available.

The original D1 files/schema/rows remain untouched. Vercel has no D1 binding, so old Cloudflare/local histories are not automatically migrated or available on the new host. Export old conversations from the original runtime, or connect Drive there and copy selected conversations before retiring it. Do not upload a local database to GitHub/Vercel or assign anonymous history to an unverified owner.

## Free-tier limits

Vercel Hobby is free for personal, non-commercial use within its quotas; exceeding most quotas pauses the feature until its allowance resets. Use a personal GitHub repository and Hobby workspace. Commercial use needs an appropriate Vercel plan. AI provider usage is separate and can still cost money. Firebase Authentication remains subject to Spark limits; Google Drive uses the person's own storage quota. Large avatar/VAD downloads consume Vercel transfer allowances. No paid plan or billing account was enabled by this work.

Sources checked October 15, 2026:
- https://vercel.com/docs/frameworks/full-stack/nextjs
- https://vercel.com/docs/git/vercel-for-github
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/environment-variables

## Validation

```powershell
npm ci
npm run build:vercel
node --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run start:vercel -- --hostname 127.0.0.1 --port 8787
# In another terminal, against the local production server or deployed URL:
$env:MIRA_AUTH_INTEGRATION='1'
$env:MIRA_BASE_URL='http://127.0.0.1:8787'
node tests/firebase-production.integration.mjs
```

The opt-in integration suite creates/deletes only disposable Firebase accounts. It checks real signup/name/returning sign-in/wrong-password rejection/password-reset request, protected routes and forged-token rejection, authentication without D1, blocked new server saves for two accounts, origin rejection, private environment protection, and a real Gemini spoken audio/transcript response. Reset email delivery and a completed reset require a real inbox. Drive API tests use mocks for folder privacy, ownership, save/list/open/trash, stale and duplicate writes, lost responses, revoked/expired access, and account separation; actual Google consent needs manual testing on the deployed domain.

Vercel-target local results on October 15, 2026: the Next.js production build and TypeScript check pass, and all 61 unit tests pass. The real Firebase/Gemini integration suite passes against the Next.js production server, and all its disposable accounts were removed. A scan of 131 generated text/code files found none of the three configured private provider keys. Repository contents and Git history were also checked before upload. Next.js's internal localhost URL difference is handled by using the actual Host for same-origin checks; arbitrary forwarded-host headers remain ignored.

Local browser checks previously verified returning email login, optional Drive settings, a real Gemini reply, unsaved status after ending without Drive, logout protection, transcript download, logout, and mobile layout. A narrow-tablet overflow was corrected. The Vercel build can report ONNX Runtime dynamic-require warnings from the existing speech detector; physical microphone/detector behavior still needs a device check. Existing broader lint diagnostics include React hook rule errors; a full lint pass is not claimed.

The Next.js browser check also confirmed returning login, configured voice service, the soft feminine Sulafat voice setting, separate optional Drive settings, and a 768×1024 tablet layout with no overflowing buttons or inputs.

After deployment verify Google login, refresh persistence/logout, reset email delivery and completed reset, tablet microphone/soft feminine voice/interruption, optional Drive decline, matching-account connect, private folder creation, automatic/manual saving, reopening after reconnect, second-account isolation, token expiry/revocation, and disconnect. No public deployment URL or completed live Drive consent flow is claimed until these steps are actually performed.

# GESBX security and runtime setup

## Runtime layout

The active Firebase client project is `gesbx-c4312`. The static site calls the security-sensitive HTTP handlers under the root `api/` directory on Vercel, including registration ID allocation, Android App Check token minting, and PayPal payouts. Next.js is configured for static export, so these handlers are standalone Vercel Node.js Functions.

The Firebase deploy scripts explicitly target `gesbx-c4312` and deploy only Firestore rules, indexes, and static Hosting. They do not deploy Cloud Functions or Storage rules. Firebase Cloud Functions deployment requires Blaze, and Firebase Storage currently requires Blaze as well. The remaining callable and event-driven features in `functions/` (including Zego tokens, economy, alliances, referrals, withdrawal review, counters, and ad-pool settlement) have not been moved to Vercel; these features still need a server runtime before they can work against the Spark project. Media upload also needs a Spark-compatible storage backend. Do not run a broad `firebase deploy` command for this project.

Switching the client to `gesbx-c4312` does not copy data from the previous Firebase project, which has not been changed. Confirm the new project's Auth providers, Firestore data/rules, App Check apps, and indexes before directing real users to it.

## Vercel environment variables

Set the following in the Vercel project that serves `https://gesbx.vercel.app`, including the Production environment. Keep server-only values out of `.env*`, source control, and every `NEXT_PUBLIC_*` variable.

### Public build settings

Firebase's public app identity and API key are pinned in `firebase.js` to the Web App in `gesbx-c4312`. Stale `NEXT_PUBLIC_FIREBASE_*` build variables are ignored; remove them from Vercel to avoid confusion. Set only the App Check site key and API origin:

```dotenv
NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY=<registered reCAPTCHA Enterprise site key>
NEXT_PUBLIC_API_BASE_URL=https://gesbx.vercel.app
```

The site key must match the reCAPTCHA Enterprise provider registered for this Web App in Firebase App Check.

### Server-only settings

```dotenv
FIREBASE_SERVICE_ACCOUNT_JSON=<service-account JSON for gesbx-c4312>
RISK_HASH_SECRET=<random secret with at least 32 characters>
PLAY_INTEGRITY_PACKAGE_NAME=<registered Android package name>
ANDROID_FIREBASE_APP_ID=<1:project-number:android:app-suffix>
APP_CHECK_ALLOWED_ORIGINS=https://gesbx.vercel.app,https://gesbx-c4312.web.app,https://gesbx-c4312.firebaseapp.com,https://localhost,capacitor://localhost,http://localhost,http://localhost:3000
PAYPAL_CLIENT_ID=<rotated PayPal client ID>
PAYPAL_CLIENT_SECRET=<rotated PayPal client secret>
PAYPAL_MODE=live
PAYPAL_WEBHOOK_ID=<PayPal webhook ID>
```

Create the service account in `gesbx-c4312` and grant the permissions needed by the API: Firebase Auth token verification including revoked-token checks, App Check token verification/creation, Firestore access, and Play Integrity token decoding. Firestore Admin SDK access applies at database level, so keep this credential only in the Vercel server environment. `FIREBASE_SERVICE_ACCOUNT_JSON` is required; registration returns a clear server-configuration error when it is missing, malformed, or from another project. Generate an independent `RISK_HASH_SECRET`; do not reuse Firebase or PayPal credentials.

`APP_CHECK_ALLOWED_ORIGINS` must contain the exact origins used by the deployed web app and native WebView. Remove any origin that the app does not use.

The PayPal values are consumed by the Vercel payout handler. The live credentials previously pasted into chat must be rotated before production use. Do not add the replacement values to this repository.

## Firebase and Play Console setup

1. In `gesbx-c4312`, enable the Auth providers used by the app and create/configure Firestore.
2. Register the production Web and Android apps in that project. Put the matching Android `google-services.json` in `android/app` and set the real Android package name.
3. Register the Web app with Firebase App Check and its reCAPTCHA Enterprise provider. Register the Android app with Play Integrity.
4. Enable Play Integrity API in the linked Google Cloud project and grant the Vercel service account token-decode access.
5. Set the Vercel variables above and redeploy the Vercel project so public build variables are embedded in the static client.
6. Deploy Firestore rules/indexes and Hosting only with `npm run firebase:deploy:all` after reviewing the target and data. Never use a generic deploy command that includes Functions or Storage.

The Vercel ID-allocation endpoint verifies Firebase Auth, App Check, and (on Android) Play Integrity, then reserves the numeric ID in a Firestore transaction. The browser does not choose IDs, and repeated requests for the same Firebase UID return its existing reservation.

## Local development

Copy `.env.local.example` to `.env.local` and use the Web App values from `gesbx-c4312`. Keep `FIREBASE_SERVICE_ACCOUNT_JSON`, `RISK_HASH_SECRET`, and PayPal credentials in Vercel's server environment, or provide them only to a trusted local server process without committing them. The standalone Socket.IO process has separate host settings; use `FIREBASE_PROJECT_ID=gesbx-c4312` there.

Some existing app functions still call Firebase callable Cloud Functions and are not covered by the new Vercel endpoints. They remain unavailable on Spark until migrated to an eligible server runtime. The Firebase emulator scripts are for local development and do not deploy those functions.

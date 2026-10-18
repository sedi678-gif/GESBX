# GESBX

GESBX is a Next.js 16 application exported as a static site, with Firebase Authentication, Firestore, Storage, and Cloud Functions. Calls use ZEGOCLOUD; Socket.IO is an optional standalone service for realtime presence and the alliance hub. Persistent application data is stored in Firebase.

## Local development

1. Install the dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the Firebase web settings and public Zego App ID. Keep service credentials in Firebase Secret Manager; never add them to `NEXT_PUBLIC_*` variables.
3. Start the web app with `npm run dev`.
4. Start the standalone realtime server separately with `npm run server` when testing presence/alliance hub. Set `ALLOWED_ORIGINS`, `FIREBASE_PROJECT_ID`, and `FIREBASE_API_KEY` for that host.

## Build and checks

- `npx tsc --noEmit` — TypeScript check.
- `npm run lint` — ESLint across the repository.
- `npm run test:arena-match` — arena gameplay/reward tests.
- `npm run test:zego-token --prefix functions` — Token04 format tests.
- `npm run test:firestore-rules` — Firestore Rules emulator tests (requires Java).
- `npm run build` — static production build in `out/`.

## Firebase Functions and secrets

Deploy callable functions and Firestore/Storage Rules before enabling server-backed account, reward, alliance, or Zego flows. Configure `ZEGO_APP_ID` as a Functions runtime variable and set `ZEGO_SERVER_SECRET`, `ADMIN_UIDS`, `RISK_HASH_SECRET`, and `REFERRAL_CODE_SECRET` with Firebase Secret Manager. A successful static build does not deploy the standalone Socket.IO service or Functions.

## Release prerequisites

- Rotate any previously exposed Zego keys in the Zego Console.
- Deploy Firebase Functions and Rules; exercise a real Zego call and Firestore Rules tests in the emulator.
- Host `server.js` on a Node-capable service and set the exact production origin allowlist if realtime presence/signalling is required.
- Set the actual Play `CAPACITOR_APP_ID` and add the matching Firebase Android app configuration before release. `google-services.json` is intentionally not committed.
- Publish reviewed privacy policy and terms, prepare an iOS project if shipping on iPhone, and connect a real billing provider before selling VIP or cash rewards.

## Architecture notes

`output: 'export'` produces static assets. Firebase Hosting can serve those files, but it does not run `server.js`; the standalone Socket.IO host is a separate deployment. Zego calls use ZEGOCLOUD; the removed legacy Socket call-signaling module is not part of the call path. MongoDB is not used. Arena reward ledgers do not represent a wallet credit or a payment provider transaction.

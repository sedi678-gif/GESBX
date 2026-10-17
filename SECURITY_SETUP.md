# Firebase security rollout

The repository now contains Firebase Functions, server owned wallet and XP operations, Firestore/Storage rules, Play Integrity verification, App Check token minting for Android, referral review, and withdrawal hold/review handlers. These controls remain fail closed until the Firebase and Play Console values below are configured and deployed.

## Configure functions

Create Firebase Functions secrets from the Firebase project used by this app:

```powershell
firebase functions:secrets:set ADMIN_UIDS
firebase functions:secrets:set RISK_HASH_SECRET
firebase functions:secrets:set REFERRAL_CODE_SECRET
```

Use comma separated Firebase Auth UIDs for `ADMIN_UIDS`. Generate separate random values for the two HMAC secrets and keep them in Secret Manager. Do not put them in the web app environment.

Create `functions/.env.youstu-cab15` locally with these non-secret values. Do not commit that file:

```dotenv
PLAY_INTEGRITY_PACKAGE_NAME=<the real Android applicationId>
ANDROID_FIREBASE_APP_ID=<the Android Firebase app id, 1:<project-number>:android:<suffix>>
APP_CHECK_ALLOWED_ORIGINS=<exact deployed web origin>,https://localhost,http://localhost
WITHDRAWAL_MIN_AZN=10
WITHDRAWAL_DAILY_LIMIT_AZN=500
WITHDRAWAL_MANUAL_REVIEW_AZN=100
```

The origin list must match the actual web and Capacitor WebView origins. Remove entries the app does not use. The Android application ID and Firebase Android App ID must be the real registered values; `com.example.app` is only the current placeholder.

## Play Integrity and App Check

1. Register the Android app in Firebase with the production package name and add its `google-services.json` to `android/app`.
2. Enable the Play Integrity API for the Google Cloud project, link the Play Console app to that project, and use a Play-distributed build when checking the `PLAY_RECOGNIZED` and `LICENSED` verdicts.
   Grant the deployed Functions runtime service account permission to call Play Integrity token decode.
3. Register the Android app in Firebase App Check with the Play Integrity provider. The Functions endpoint mints an App Check token only after verifying the Play Integrity token, authenticated UID, one-time challenge, request hash, and verdicts.
4. Register the web app in Firebase App Check with reCAPTCHA v3, then put its site key in the deployed web build as `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`.
5. Deploy the Functions and rules first. After validating released clients, enable App Check enforcement for Firestore and Storage in Firebase Console. Callable Functions already require App Check in code.
6. Enable Firestore TTL on `app_check_nonces.expiresAt` so used App Check challenges are eventually removed.
7. When deploying the Storage rules, enable the requested Cloud Storage to Firestore rules connection so profile and post uploads can check the user's `firebaseUid` mapping.

The wallet panel can link its existing anonymous Firebase account to email/password without changing its UID. Enable Email/Password in Firebase Authentication before users try email verification, referrals, or withdrawals.

Until the web site key or Android app registration is configured, protected callable operations reject requests. Firestore and Storage App Check enforcement is a Firebase Console setting; it cannot be activated by these repository files alone.

## Deploy

After configuring secrets, environment values, the Android app registration, and App Check, deploy with:

```powershell
npm run firebase:deploy
```

For Android, set `CAPACITOR_APP_ID` to the registered production package before building. For local development, start the Auth, Firestore, Storage, and Functions emulators with `npm run firebase:emulators`.

Existing profile documents created before `firebaseUid` was stored need an authenticated account-linking migration. The new binding flow intentionally does not import balances, XP, cards, or cosmetics from an old UID-keyed document unless that document already carries the matching Firebase UID; local numeric profile IDs alone cannot prove ownership.

# Firebase migration status

Checked on 2026-10-29. This report describes the repository and Git history only. The Firebase and Vercel project consoles were not available in this session, so remote project state is unverified.

## Old project behavior found in Git

- The historical `.firebaserc` selected `youstu-cab15`.
- In the inspected historical revision, `firebase.js` already contained the `gesbx-c4312` web app values while `.firebaserc` still selected `youstu-cab15`; this was a mixed project configuration.
- Registration called the `allocateUserId` Firebase callable. That function used the Admin SDK and a Firestore transaction to reserve a unique numeric ID while checking both `users` and `players`.
- The historical Functions entry point called `firebase-admin/app.initializeApp()` without a JSON key. In Firebase Functions, the runtime supplied its service identity; no service-account JSON or private key was found in the tracked history.
- The historical Firebase configuration included Functions, Firestore rules/indexes, Storage rules, Hosting rewrites, and Auth/Firestore/Storage/Functions emulators.

## Current repository behavior

- `.firebaserc`, the client Firebase app, server Admin SDK, and Firebase deploy scripts target `gesbx-c4312`. No active source/config reference to `youstu-cab15` was found.
- Registration now calls the Vercel `/api/allocate-user-id` function. It verifies Firebase Auth and App Check, then uses a Firestore transaction and a server-side service account. The client cannot choose the reserved numeric ID or grant itself an admin role.
- `FIREBASE_SERVICE_ACCOUNT_JSON` is a new requirement because Vercel is outside Firebase Functions and does not inherit that runtime's service identity. The credential must be created for `gesbx-c4312`, kept only in Vercel's server environment, and applied by creating a new deployment after the variable is set.
- Firestore rules and indexes exist in the repository, but this does not prove they are deployed to `gesbx-c4312`. The actual Auth users/providers, Firestore documents, App Check registrations, Storage bucket, and IAM permissions could not be read remotely.
- `functions/` still contains callable, scheduled, and event-triggered functionality used by the client. These handlers have not all been moved to Vercel. Client uploads still use Firebase Storage in profile media, posts, messages, and alliance flags.

## Safe credential preflight

The Admin SDK now converts escaped PEM `\\n` sequences into line breaks, rejects invalid private keys, and still rejects credentials whose `project_id` is not `gesbx-c4312`. Run `npm run firebase:service-account:check` only in a trusted shell where `FIREBASE_SERVICE_ACCOUNT_JSON` is already set. It never prints the key or email. The check validates JSON and PEM syntax only; it does not contact Firebase or verify permissions.

The previous `AUTH_VERIFICATION_FAILED` message alone does not identify the exact production cause. Check the matching Vercel Function log for the current safe error code. The current code distinguishes a missing, invalid, or wrong-project service account from Firebase Auth verifier errors. If the deployed site still returns the older generic message, the deployment may be serving an older build; confirm the deployment before changing production settings.

## Spark plan limits that block full parity

- Firebase Cloud Functions can be emulated on Spark, but deployment requires Blaze. This blocks the current callable, scheduled, and Firestore event-triggered code from running as Firebase Functions.
- Cloud Storage for Firebase is unavailable on Spark. The current media upload paths therefore cannot work against a Spark project's Firebase Storage bucket. A different storage backend must be selected before moving these uploads.
- Firestore managed export/import requires billing. Do not use that workflow while keeping both projects on Spark.
- Firebase Auth, Firestore, and App Check have no-cost usage, but quotas and configuration still need to be checked in the new project.

## Non-destructive work still required

1. Read-only compare both Firebase consoles: Auth providers and user counts; Firestore collections/subcollections, rules, indexes, and document counts; App Check apps/providers/enforcement; Storage objects; project IAM; and configured API routes/secrets.
2. Configure a `gesbx-c4312` service account for the Vercel Admin SDK. Store the complete JSON only as the server-side `FIREBASE_SERVICE_ACCOUNT_JSON` Vercel variable. Do not put it in source, `NEXT_PUBLIC_*`, Git, or a browser bundle. Then create a new Vercel deployment and verify registration with a controlled test account.
3. Before copying data, take protected backups and compare target counts/UIDs. Firebase Auth users do not transfer automatically. Auth import can preserve UIDs and password hashes when the source hash parameters are supplied, but duplicates must be checked because an imported UID may replace an existing target user.
4. Firestore data copying on Spark needs a separately reviewed Admin SDK migration utility with dry-run, pagination, subcollection handling, idempotent writes, and a collection-by-collection count report. No data has been copied or overwritten.
5. Preserve the existing admin profile `users/92`, `players/92`, UID binding, and roles. Confirm their source and target records before any role bootstrap or writes; do not run the current Cloud Function bootstrap while Cloud Functions are unavailable.
6. Decide on a Spark-compatible media provider, then migrate media references and objects with a reversible mapping. No provider or media migration was selected here.
7. Port each still-used callable/event/scheduled function to a supported server runtime (for example, Vercel Node functions and an approved scheduler) and verify server-authoritative rules before switching clients. This has not been completed.

No Firebase/Vercel deployment, data copy, user import, bucket operation, or change to `youstu-cab15` was performed.

## Official references

- [Cloud Functions deployment requires Blaze](https://firebase.google.com/docs/functions/get-started)
- [Cloud Storage for Firebase billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
- [Firebase Auth user import and duplicate UID behavior](https://firebase.google.com/docs/auth/admin/import-users)
- [Firebase CLI Auth export/import and password hash parameters](https://firebase.google.com/docs/cli/auth)
- [Firestore managed export/import billing requirements](https://firebase.google.com/docs/firestore/manage-data/export-import)

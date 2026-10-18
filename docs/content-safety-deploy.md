# Content safety and App Check rollout

## App Check and registration

The web client already initializes App Check with the invisible reCAPTCHA v3 provider. Set `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` to the site key registered for the production web domain. Registration now obtains a fresh App Check token before creating an account. The Firebase console must register the matching app/provider and secret.

In Firebase Console → App Check, first review Firestore and Storage request metrics, then turn **Enforce** on for Cloud Firestore and Cloud Storage. Enforcement is a project setting and cannot be committed through `firestore.rules` or `storage.rules`. Existing clients without App Check tokens will fail after enforcement, so deploy this client before switching enforcement on. Firebase's guidance recommends monitoring request metrics before enforcement: https://firebase.google.com/docs/app-check/monitor-metrics.

App Check uses invisible reCAPTCHA v3; users do not solve a checkbox. If Authentication itself must reject unverified App Check requests, enable Authentication App Check enforcement in the console; Firebase requires Firebase Authentication with Identity Platform for that product. Firestore and Storage enforcement are separate controls. See https://firebase.google.com/docs/app-check/enable-enforcement.

## Cloud Functions moderation

The `moderateUploadedPost` Storage trigger runs Vision SafeSearch for images and Video Intelligence explicit-content detection for videos. Enable `vision.googleapis.com` and `videointelligence.googleapis.com`, enable billing as required by the selected Google Cloud APIs, and ensure the Functions runtime service account can read uploaded objects. The default automatic hide threshold is five distinct reporters; configure `POST_AUTO_HIDE_REPORT_THRESHOLD` to an integer from 2 through 100 when deploying Functions.

Deploy the functions and rules after checking the active Firebase project:

```sh
firebase use <project-id>
firebase deploy --only functions:moderateUploadedPost,functions:autoHideReportedPost,firestore:rules,storage
```

Image posts are hidden from feeds until `moderationStatus` becomes `approved`. Rejected files are deleted. Five pending post reports from distinct profile IDs change status to `hidden_by_reports`; the Storage rule then blocks reads of the media. Existing posts without a moderation status are hidden by the new rules until they are migrated or re-uploaded and reviewed.

## Media requirements

The browser rejects images whose shorter edge is below 480 pixels and videos whose shorter edge is below 360 pixels. Images are compressed once to a maximum width of 1280 pixels at quality 0.78; Storage upload errors are surfaced instead of saving an unmoderated inline data URL.

## Onboarding

Successful registration routes to `/onboarding`, which points new users to profile setup, community discovery, and email verification. This first version is a guided checklist; profile completion remains in the existing profile flow.

# PayPal creator wallet payouts

The payout API is served by Firebase Functions because this Next.js project uses `output: 'export'`; exported Next.js sites do not run API route handlers. The production paths are proxied to the `us-central1` Firebase Functions:

- `POST /api/payout/request`
- `POST /api/webhooks/paypal`

Payouts debit `user_wallets/{playerId}` only when its owner matches the authenticated Firebase UID and its currency is `USD`. This is the creator ad revenue wallet. The separate `players/{playerId}.manat` balance is AZN and is not converted to USD by this integration.

## Secrets and deployment

Set these Firebase Functions secrets interactively; never put credential values in source files or client-visible environment variables:

```powershell
firebase functions:secrets:set PAYPAL_CLIENT_ID
firebase functions:secrets:set PAYPAL_CLIENT_SECRET
firebase functions:secrets:set PAYPAL_MODE
firebase functions:secrets:set PAYPAL_WEBHOOK_ID
```

Set `PAYPAL_MODE` to `live`. Create a PayPal webhook for the deployed PayPal app at `https://gbesx.vercel.app/api/webhooks/paypal`, copy its webhook ID into `PAYPAL_WEBHOOK_ID`, and subscribe to `PAYMENT.PAYOUTSBATCH.SUCCESS`, `PAYMENT.PAYOUTSBATCH.DENIED`, `PAYMENT.PAYOUTSBATCH.REVERSED`, and `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` / failure events. The ID is distinct from the client ID.

Then deploy Functions and the hosting rewrites. The Vercel rewrites target the existing Firebase project `youstu-cab15`; update that destination if the Firebase project changes. Firebase Hosting rewrites are also configured for deployments served from Firebase Hosting.

The credentials previously pasted into chat should be rotated in PayPal before production use. Store the newly generated values only in Firebase Secret Manager.

## Request contract

The request endpoint requires:

- `POST` JSON: `{ "amountUSD": 12.34, "recipientEmail": "verified-account@example.com" }`
- `Authorization: Bearer <Firebase ID token>`
- `X-Firebase-AppCheck: <App Check token>`
- `Idempotency-Key: <unique 16-80 character key>`

Recipient email must match the verified Firebase email. Amounts must be between USD 1.00 and USD 500.00, with cent precision. A creator can submit one payout per UTC day. The endpoint reserves the USD wallet balance and writes a `PENDING` `paypal_withdrawals` record and wallet ledger entry in one Firestore transaction before calling PayPal. Definitive PayPal rejections refund the wallet in an idempotent transaction. Timeouts, HTTP 429s, 5xx errors, and duplicate-request responses remain pending for safe retry with the same idempotency key because the provider may already have accepted the payout.

The authenticated owner can read their `paypal_withdrawals` record. Client writes stay denied. `paypal_webhook_events` and daily limits are server-only.

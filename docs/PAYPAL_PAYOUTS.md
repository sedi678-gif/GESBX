# PayPal creator wallet payouts

Payouts run through standalone Vercel Node.js Functions in the root `api/` directory. The public endpoints are:

- `POST https://gesbx.vercel.app/api/payout/request`
- PayPal webhook: `https://gesbx.vercel.app/api/webhooks/paypal`

The site uses static Next.js export; Vercel serves these API files independently from the exported pages. Do not configure Firebase Hosting rewrites or Firebase Functions for these paths.

Payouts debit `user_wallets/{playerId}` only when the wallet owner matches the authenticated Firebase UID and its currency is `USD`. The separate `players/{playerId}.manat` balance is AZN and is not converted to USD by this integration.

## Vercel secrets and PayPal setup

Set these server-only variables in the Vercel project environment. Do not put credential values in source code, `.env.example`, client-visible variables, or Firebase Functions Secret Manager:

```dotenv
PAYPAL_CLIENT_ID=<rotated PayPal client ID>
PAYPAL_CLIENT_SECRET=<rotated PayPal client secret>
PAYPAL_MODE=live
PAYPAL_WEBHOOK_ID=<PayPal webhook ID>
FIREBASE_SERVICE_ACCOUNT_JSON=<service-account JSON for gesbx-c4312>
```

The live credentials previously pasted into chat must be rotated in PayPal before production use. Store only the replacement credentials in Vercel's server environment. `FIREBASE_SERVICE_ACCOUNT_JSON` must belong to `gesbx-c4312` and have access to the payout wallet and withdrawal collections.

Create a webhook for the PayPal app and subscribe to `PAYMENT.PAYOUTSBATCH.SUCCESS`, `PAYMENT.PAYOUTSBATCH.DENIED`, `PAYMENT.PAYOUTSBATCH.REVERSED`, and the payout item success/failure events handled by the service. Put that webhook's ID in `PAYPAL_WEBHOOK_ID`; it is distinct from the client ID. After saving the variables, redeploy the Vercel project.

## Request contract

The request endpoint requires:

- `POST` JSON: `{ "amountUSD": 12.34, "recipientEmail": "verified-account@example.com" }`
- `Authorization: Bearer <Firebase ID token>`
- `X-Firebase-AppCheck: <App Check token>`
- `Idempotency-Key: <unique 16-80 character key>`

Recipient email must match the verified Firebase email. Amounts must be between USD 1.00 and USD 500.00, with cent precision. A creator can submit one payout per UTC day. The endpoint reserves the USD wallet balance and writes a `PENDING` `paypal_withdrawals` record and wallet ledger entry in one Firestore transaction before calling PayPal. Definitive PayPal rejections refund the wallet in an idempotent transaction. Timeouts, HTTP 429s, 5xx errors, and duplicate-request responses remain pending for safe retry with the same idempotency key because the provider may already have accepted the payout.

The authenticated owner can read their `paypal_withdrawals` record. Client writes stay denied. `paypal_webhook_events` and daily limits are server-only.

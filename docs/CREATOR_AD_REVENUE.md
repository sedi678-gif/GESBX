# Creator ad revenue settlement

The monthly Firebase schedule runs at 03:00 UTC on the second day of each month and settles the previous UTC calendar month. It requires Cloud Functions, Cloud Scheduler, and the project to support scheduled functions (Firebase Blaze plan).

## Trusted monthly revenue input

Before settlement, a trusted backend or an administrator using the Firebase Console must create or update:

`creator_ad_revenue/{YYYY-MM}`

with:

```json
{
  "status": "ready",
  "totalRevenueAmount": 1000.0,
  "currency": "USD"
}
```

`totalRevenueAmount` must be the reconciled total reels ad revenue for that month. The integration does not fetch revenue from AdMob or another ad provider; it settles only a trusted report that has been marked `ready`. The previous month's `vipRolloverAmount` and `standardRolloverAmount` are added to the respective pools automatically.

## Creator views

`onCreatorReelViewCreated` counts an approved video post view only when both profiles are Firebase-bound and the creator has a verified player identity and is not banned/frozen. The app records at most one view per viewer, post, and UTC day. The Firestore event timestamp determines the billing month, and an event marker prevents trigger retries from counting a view twice. Views are written under `creator_monthly_views/{YYYY-MM}/creators/{creatorId}`. Only events received after this trigger is deployed are collected; there is no historical backfill. The settlement locks the month's view snapshot before paying and ignores delayed view triggers after that point.

VIP views are assigned when the creator has an active VIP Pro pass or active Gold/Platinum VIP at view-event processing. Other eligible creators accrue standard views.

## Distribution and wallet

50% of monthly reported revenue goes to the VIP pool and 30% to the standard pool. The remaining 20% is recorded as `platformRemainderAmount`; it is not credited to creators. Pool payouts use largest-remainder allocation in 0.0001 currency units, so the credited payouts add up exactly to each distributed pool. RPM is stored to four decimal places. A pool with no eligible views rolls over to the next month.

Payouts are credited once to `user_wallets/{creatorId}` and recorded at `user_wallets/{creatorId}/payouts/{YYYY-MM}_{pool}`. `revenue_payout_logs/{YYYY-MM}` records the settlement totals, RPM rates, view totals, pool rollover, and processing status. Wallet credits and payout markers are written together, so a retry cannot credit the same pool payout twice. Firestore rules allow a creator to read only their own wallet and payout entries; client writes are denied.

The existing app wallet uses `players.manat`/`players.coins`, while this creator pool is currency-labelled from the ad report and is stored in `user_wallets`. This does not convert ad revenue to AZN or connect it to withdrawals; currency conversion and withdrawal integration must be defined separately before treating these payouts as cash-out-ready.

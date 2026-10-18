# Weekly arena reward settlement

The settlement callable is `settleArenaWeeklyRewards`. It requires Firebase Auth, App Check, and an admin UID in the `ADMIN_UIDS` secret. It only settles a weekly board after the board is closed and `leaderboard_resets/weekly_<periodId>` is marked `{ kind: "weekly", status: "done" }`.

## Allocation configuration

The callable reads the server-managed Firestore document `app_config/arena_reward_allocation`:

```json
{
  "entries": [
    { "countryCode": "AZ", "recipientType": "ALLIANCE", "rank": 1, "amount": 0, "currency": "AZN" }
  ]
}
```

`amount` must be a non-negative integer and each rank may appear once per country and recipient type. The example amount is a schema example only; choose the real allocation before creating this document. An empty or invalid table causes the callable to fail without writing a settlement receipt.

## What settlement does

The function writes idempotent weekly reward ledger records from the closed server leaderboard, plus reward events and a settlement receipt. Banned or frozen alliances are recorded as rejected. It sets `payoutReady: false` and `walletCredited: false`; it does not credit a wallet or transfer money. A real payment provider and a reviewed payout workflow still need to be configured separately.

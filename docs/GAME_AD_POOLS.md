# Game and alliance ad pools

This settlement is independent of the Reels creator pool. It does not read or write `creator_ad_revenue`, `creator_monthly_views`, `user_wallets`, or `revenue_payout_logs`.

## Daily trusted game-ad revenue

Before the daily 23:59 `Asia/Baku` schedule, a trusted backend or administrator must set:

`game_ad_revenue/{YYYY-MM-DD}`

```json
{
  "status": "ready",
  "totalRevenueAmount": 100.0,
  "currency": "AZN"
}
```

The source must be the reconciled game and alliance ad revenue for that Bakı calendar day. The functions do not fetch revenue from an ad provider.

## Distribution and collections

Each daily report is split into 40% for players, 40% for that week's alliance pool, and the remaining 20% for the platform. The daily player amount is distributed proportionally to positive `score` values in `leaderboard_daily/{dayKey}.rows`. The weekly alliance amount is added to `weekly_alliance_pool/{weekKey}`. The 20% platform share is recorded in `platform_revenue/{dayKey}`.

The Sunday 23:59 job first settles Sunday's daily report, then verifies that all seven daily settlements for the Monday-to-Sunday week are processed. It distributes the weekly alliance balance proportionally to `rawScore` on `leaderboard_weekly/{weekKey}.rows` (falling back to `score` for older rows). Those rows are the top entries already exposed by the official leaderboard, capped at 100. The weekly score is normalized for ranking in this app; `rawScore` is used for the payout weight because it is the alliance's total points.

Pool documents are stored by period in `daily_player_pool/{dayKey}` and `weekly_alliance_pool/{weekKey}`. Their `balanceAmount` is set to zero after settlement. If a pool has no positive-score recipients, its unallocated amount is carried into the next daily or weekly pool so the revenue is not lost. Payout balances and receipts are stored separately in `game_ad_wallets/{recipientType}_{recipientId}_{currency}` and its `payouts` subcollection. Daily/weekly audit records are stored in `game_ad_pool_logs`.

Pool credits use integer 0.0001 currency units and largest-remainder allocation, so each eligible distribution adds up exactly to the pool. Settlement logs and wallet payout markers make retries idempotent. Client writes to reports, pool balances, platform shares, logs, and game-ad wallets are denied by Firestore rules.

The separate `game_ad_wallets` balances are not converted to AZN and are not connected to `players.manat`, the Reels wallet, or cash withdrawals. Use `currency: "AZN"` in the trusted report when the source revenue is already in manat; conversion must be configured outside these settlement jobs if the source uses another currency.

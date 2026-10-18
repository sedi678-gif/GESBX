# GESBX (GESBX) — Kod Audit Hesabatı

Tarix: audit zamanı. Layihə: Next.js 16 static export + Firebase (Firestore/Auth/Storage) + Socket.io server.
Yoxlanılan həcm: 411 fayl (`app/`), `server.js`, `firestore.rules` (2633 sətir), `firestore.indexes.json`, scripts.

---

## 🔴 KRİTİK — dərhal düzəltməli

### 1. Zego `serverSecret` brauzerə açıqdır (real sızma)
**Fayl:** `public/zego-runtime-config.json`
```json
{ "appId": 1347665418,
  "appSign": "cfc29caed44facb6059be54e018721101fe83f6b00efeb1c584c71415357f00e",
  "serverSecret": "942f3d546ab2bdc6b578211ce0491780" }
```
Bu fayl statik hostinqdən (`out/`) hər kəsə açıq verilir: `https://<domen>/zego-runtime-config.json`.
`serverSecret` **token imzalama açarıdır** — onunla istənilən istifadəçi adına Zego tokeni yaradıla bilər
(pulsuz zəng/dəqiqə oğurluğu, hesabın bloklanması, pul itkisi).

Zəncir:
- `scripts/embed-zego-config.mjs` → `.env.local`-dən oxuyub bu faylı `public/`-ə yazır.
- `app/lib/zegoConfig.ts` → `loadFromRuntimeJson()` brauzerdə `fetch('/zego-runtime-config.json')` edir.
- `next.config.ts` → `ZEGO_SERVER_SECRET` və `ZEGO_APP_SIGN`-i `env` blokunda **klient bundle-ına** yazır.

**Düzəliş:**
1. `public/zego-runtime-config.json`-i repo-dan sil, `.gitignore`-a əlavə et.
2. `embed-zego-config.mjs`-dən `serverSecret`-i çıxar (yalnız `appId` qalsın).
3. `next.config.ts` `env` blokundan `ZEGO_SERVER_SECRET` və `ZEGO_APP_SIGN`-i sil.
4. Token imzalama yalnız serverdə (`server.js` və ya Firebase Function) olsun.
5. Zego panelində **hər iki açarı dəyişdir** (artıq açıqlanıb, kod düzəlişi köhnə açarı xilas etmir).

---

### 2. `firestore.rules` — hər şey default olaraq açıqdır
**Fayl:** `firestore.rules`, sətir 2628
```
match /{document=**} {
  allow read: if !isProtectedPath(document);
  allow write: if !isProtectedPath(document);
}
```
`isProtectedPath` yalnız ~16 kolleksiyanı qoruyur (`battles`, `alliances`, `players`-in bir hissəsi və s.).
**Qorunmayan** kolleksiyalar autentifikasiyasız yazıla/açıla bilər — o cümlədən:
`private_messages`, `private_chats`, `global_chat`, `posts`, `post_comments`, `post_likes`,
`users`, `reports`, `feedback`, `support_requests`, `call_sessions`, `admin_commands`, `blocks`, `follows`.

Yəni: istənilən anonim Firebase istifadəçi (anonim auth açıqdır — `firebaseAuth.ts`) başqasının
mesajlarını oxuya, postlarını silə, özünü admin kimi `admin_commands`-a yaza bilər.

**Düzəliş:** `/{document=**}` blokunu bağla (`allow read, write: if false`) və hər kolleksiya üçün
aydın qayda yaz. Ən azı: `users`/`players` — sahibi, `private_messages` — `chatId` üzvü,
`admin_commands` — yalnız super admin, `global_chat` — yalnız create + öz mesajı.

---

### 3. `admin_commands` kolleksiyası hər kəsə açıqdır
**Fayl:** `firestore.rules` — bu kolleksiya `isProtectedPath` siyahısında yoxdur.
**Kod:** `app/lib/adminService.ts` → `logAdminCommand()` müştəri tərəfdə `addDoc` edir.
İstifadəçi brauzerdən birbaşa `admin_commands`-a sənəd yaza bilər → saxta admin jurnalı,
audit izinin zəhərlənməsi.

**Düzəliş:** `admin_commands`-ı `isProtectedPath`-ə əlavə et, yazı yalnız serverdən.

---

### 4. `arena_rewards` / `arena_reward_settlements` — istənilən istifadəçi mükafat yarada bilər
**Fayl:** `firestore.rules` sətir 2452+ / 2565+
```
match /arena_rewards/{rewardId} {
  allow create: if request.auth != null
    && ... status in ['APPROVED','REJECTED'] && walletCredited == false ...
```
Şərtlər `arena_matches/{matchId}.status == 'closed'` olmasını tələb edir, **lakin** o sənədi də
istifadəçi yaradır. Kombinasiyada: özü matç yaradır → bağlayır → özünə `arena_rewards` yazır.
Pul/balans ödənişi (`payoutReady`) da bu yolla işarələnir.

**Düzəliş:** mükafat yaradılması yalnız Cloud Function/server tərəfinə keçsin; qaydada
`allow create: if false` və ya server-only şərt.

---

## 🟠 YÜKSƏK

### 5. Socket.io CORS `origin: '*'` — REST qaydası ilə ziddiyyət
**Fayl:** `server.js` sətir ~20
```js
app.use(cors({ origin: /* allowlist */ }));   // REST üçün düzgün
const io = new Server(server, { cors: { origin: '*', ... } });  // Socket üçün açıq
```
REST səviyyəsində origin məhdudlaşdırılıb, amma Socket.io hər hansı saytdan qoşulmağa icazə verir.
Zəng/mesaj siqnalları socket üzərindən gedir → istənilən sayt istifadəçinin sessiyası ilə siqnal göndərə bilər.

**Düzəliş:** `io` üçün də eyni `allowedOrigins` siyahısını işlət.

### 6. Socket auth yoxdur
**Fayl:** `server.js` — `socket.on('user_connected', uid)` heç bir token yoxlamır.
İstənilən şəxs istənilən `userId` ilə qoşulub başqasının mesaj/zəng kanalına girə bilər.
**Düzəliş:** Firebase ID token yoxlaması (`admin.auth().verifyIdToken`).

### 7. `.catch(() => {})` — 92 yerdə xəta udulur
Ən çox: `app/lib/zegoCallKit.ts` (9), `app/game/arena/ArenaScreen.tsx` (8),
`AllianceMapBattleHost.tsx` (5), `battleServerClock.ts` (5), `callMediaBridge.ts` (5).
Xüsusilə `app/lib/leaderboard/index.ts`:
```ts
await settleWeeklyRankingRewards({ periodId }).catch(() => {});
await runArenaRewardPayoutChecks({ periodId }).catch(() => {});
```
Həftəlik mükafat paylanması **səssizcə uğursuz olur** — istifadəçi pulunu almır, heç kim bilmir.
**Düzəliş:** ən azı `console.warn` + kritik yerlərdə retry/xəbərdarlıq UI.

### 8. `startAllianceMapBattle` — hücum edən ittifaqın lideri yoxlanılmır
**Fayl:** `app/lib/allianceBattleMatchService.ts` sətir 216
```ts
if (!attackerMembers.includes(playerId) && attacker.leaderId !== playerId) { throw ... }
```
`attacker.leaderId` yoxlanılır, amma **`leaderId` oyunçunun özü ilə eyni olması tələb olunmur** —
üzv siyahısında olan hər kəs hücum başlada bilər. Biznes qaydası belədirsə problem yox,
əks halda qapı açıqdır.

---

## 🟡 ORTA

### 9. `app/arena/` qovluğunda ölü + sınıq fayllar
- `app/arena/match/reward/reward.tsx` — `React.FC` işlədilir, `React` import edilməyib,
  `"use client"` yoxdur, heç bir yerdən import olunmur.
- `app/arena/history/details/details.tsx` — eyni problem.
- Bu qovluqda `page.tsx` yoxdur, amma `ArenaResultPanel.tsx` `/arena/history/details/?matchId=...`
  linki verir → **404**.

**Düzəliş:** ya sil, ya `"use client"` + `import type { FC } from 'react'` əlavə et və
`app/arena/history/details/page.tsx` yarat.

### 10. `app/profile/page.tsx` — 1850 sətir, ID yaradılması iki yerdə təkrarlanır
`handleRegister` eyni kodu `try` və `catch` daxilində iki dəfə yazır (sətir 560-630).
`allocateNextUserIdLocal()` yalnız `localStorage` sayğacıdır — offline rejimdə iki brauzer
eyni ID-ni yarada bilər (Firestore qaydası bunu tutmur).
**Düzəliş:** ortaq `registerUser()` funksiyası + serverdə unikal ID.

### 11. `readBoundedScore` — 1 000 000-dan böyük xal səssizcə 0 olur
**Fayl:** `app/lib/battleScore/battleScoreConfig.ts` sətir 65
```ts
if (value < BATTLE_SCORE_MIN || value > BATTLE_SCORE_MAX) return 0;
```
Sərhəd pozulanda xəta yerinə 0 qaytarılır → matç nəticəsi səhv hesablanır, iz qalmır.

### 12. `server.js` — MongoDB + Firebase iki paralel backend
`server.js` Mongoose ilə `users`/`messages` yazır, tətbiqin qalanı Firebase işlədir.
İki mənbə arasında sinxronizasiya yoxdur → real istifadəçi/mesaj itkisi.
Həmçinin `/api/users/all` və `/api/users/search` **auth-suz** açıqdır (bütün istifadəçi siyahısı).

---

## ✅ Yaxşı olan tərəflər
- `battleSecurity` testləri + `arenaPayoutCheck` testləri var (`npm run test:arena-match`).
- `firestore.indexes.json` düzgün tərtib olunub.
- `sanitizePlayerId` / `sanitizeBattleId` giriş təmizləməsi ardıcıl işlədilir.
- `replayBattleRequest` idempotentlik kilidi — düzgün yanaşma.
- `manatWritePatch` balansı tək mənbədən yazır (`manat` + `coins` sinxron).
- XSS təhlükəsi minimal — React şablonları, `dangerouslySetInnerHTML` yoxdur.

---

## Prioritet sırası
1. Zego `serverSecret` sızması (açar dəyişmə + fayl sil)
2. `firestore.rules` default-open blokunu bağla
3. `admin_commands` + `arena_rewards` server-only
4. Socket.io CORS + auth
5. Səssiz `catch` blokları (xüsusən mükafat paylanması)
6. Ölü `app/arena/` faylları

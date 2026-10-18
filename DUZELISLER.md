# GESBX — Düzəlişlər Hesabatı

Bu sənəd `AUDIT-GESBX.md`-də tapılan səhvlərin hansının düzəldildiyini göstərir.

---

## ✅ Düzəldilən səhvlər

### 🔴 1. Zego `serverSecret` brauzerə açıq idi — DÜZƏLDİLDİ
| Fayl | Nə edildi |
|---|---|
| `public/zego-runtime-config.json` | **Silindi** (içindəki `serverSecret` açıq idi) |
| `.gitignore` | `/public/zego-runtime-config.json` əlavə edildi — bir daha commit olunmasın |
| `scripts/embed-zego-config.mjs` | Yalnız public `appId` yazır; `appSign` və `serverSecret` oxunmur/yazılmır |
| `next.config.ts` | `env` blokundan `ZEGO_SERVER_SECRET` və `ZEGO_APP_SIGN` **çıxarıldı** |
| `app/lib/zegoConfig.ts` | Brauzerdə secret qəbul edilmir; `loadFromRuntimeJson()` və `loadFromFirestore()` secret oxumur; `isZegoConfigured()` brauzerdə secret tələb etmir |
| `app/lib/zegoCallKit.ts` | `generateTestKitToken()` artıq `async`-dir: əvvəlcə serverdən token istəyir, secret-i yalnız server runtime-ında işlədir, heç bir halda sessiyaya yazmır |

**Yeni server endpoint:** Firebase callable `createZegoToken` (`functions/src/zegoToken.js`).
`serverSecret` Firebase Secret Manager-dən oxunur; `server.js` Zego token yaratmır.
Token04 binary layout-u Zego-nun rəsmi server assistant nümunəsi ilə müqayisə edən unit test əlavə edilib; canlı Zego hesabında zəng sınağı ayrıca tələb olunur.

> ⚠️ **Sənin etməli olduğun:** Zego panelində **hər iki açarı dəyişdir**. Köhnə `serverSecret`
> `942f3d…` artıq açıqlanmış sayılır — kod düzəlişi onu xilas etmir.

---

### 🔴 2. `firestore.rules` hər şeyi açırdı — DÜZƏLDİLDİ
```diff
- match /{document=**} {
-   allow read: if !isProtectedPath(document);
-   allow write: if !isProtectedPath(document);
- }
+ match /{document=**} {
+   allow read, write: if false;   // DEFAULT DENY
+ }
```
Qorunmayan kolleksiyalar üçün **aydın qaydalar** yazıldı:

| Kolleksiya | Qayda |
|---|---|
| `users` | hamı oxuyur; sahibi yaradır/yazır; `banned`/`frozen`/`isModerator` sahələri dəyişdirilə bilməz |
| `private_messages` | yalnız giriş etmiş istifadəçi; `senderId ≠ recipientId` |
| `private_chats` | yalnız iştirakçılar (2 nəfər) |
| `global_chat` | hamı oxuyur; giriş etmiş yazır; mətn 1–2000 simvol |
| `alliance_chat` | yalnız həmin ittifaqın üzvü/lideri |
| `posts` / `post_likes` / `post_comments` | oxu açıq, yazı sahibi |
| `follows` / `blocks` | oxu açıq, yazı sahibi |
| `reports` / `feedback` / `support_requests` | yaratmaq olar, dəyişmək/silmək olmaz |
| `call_sessions` | yalnız `callerId`/`calleeId` |
| `user_settings` / `message_contacts` / `alliance_quests` / `counters` | giriş etmiş istifadəçi |
| `alliance_notifications` / `alliance_attacks` | giriş etmiş istifadəçi |
| `alliance_weekly_shop` | ittifaq üzvü |
| `app_config` | yalnız oxu — yazı serverdə |

---

### 🔴 3. `admin_commands` hər kəsə açıq idi — DÜZƏLDİLDİ
```diff
+ match /admin_commands/{commandId} {
+   allow read: if isSignedIn();
+   allow write: if false;   // yalnız Admin SDK / server yazır
+ }
+ match /admin_sessions/{sessionId} {
+   allow read: if isSignedIn();
+   allow write: if false;
+ }
```
Əvvəl istənilən istifadəçi brauzerdən saxta admin əmri yaza bilirdi.

---

### 🔴 4. `arena_rewards` — özünə mükafat yazmaq mümkün idi — DÜZƏLDİLDİ
```diff
- allow create: if request.auth != null && ...
+ allow create: if false && ...   // server-only
```
Eyni şəkildə `arena_reward_settlements` də bağlandı.
Səbəb: qayda `arena_matches/{id}.status == 'closed'` tələb edirdi, amma o sənədi də
istifadəçi özü yaradıb bağlaya bilirdi.

Bu çağırış sonradan `awardArenaMatchRewards` callable Cloud Function-a köçürüldü;
client yalnız match ID göndərir, funksiya yekun nəticəni Firestore-dan özü oxuyur.

---

### 🟠 5–6. Socket.io CORS + auth — DÜZƏLDİLDİ
| Əvvəl | İndi |
|---|---|
| `io` → `origin: '*'` | `io` → REST ilə **eyni allowlist** (`originAllowed()`) |
| Socket auth yox | Socket.IO middleware Firebase ID token-i yoxlayır |
| — | `join_alliance_hub` auth olmadan işləmir (`auth_required` hadisəsi) |
| `/api/users/*` Mongo endpointləri | Hamısı `410 Gone`; Mongo sxemləri, Mongoose və bağlı endpoint kodu çıxarılıb |

Socket host env dəyişənləri: `ALLOWED_ORIGINS`, `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`.
Zego secret Firebase Secret Manager-də saxlanılır; `firebase functions:secrets:set ZEGO_SERVER_SECRET`.

---

### 🟠 7. Səssiz `catch` — ən kritik yer DÜZƏLDİLDİ
`app/lib/leaderboard/index.ts`:
```diff
- await settleWeeklyRankingRewards({ periodId }).catch(() => {});
- await runArenaRewardPayoutChecks({ periodId }).catch(() => {});
+ try { await settleWeeklyRankingRewards({ periodId }); }
+ catch (err) { report.settlementOk = false; console.error(...); }
```
Artıq xəta loglanır, `WeeklySettlementReport` qaytarılır və
`getLastWeeklySettlement()` ilə UI xəbərdarlıq göstərə bilər.
Əvvəl həftəlik mükafat paylanması **səssizcə** uğursuz olurdu.

---

### 🟡 9. `/arena/history/details/` 404 — DÜZƏLDİLDİ
| Əvvəl | İndi |
|---|---|
| `app/arena/history/details/details.tsx` — istifadəsiz, `React` import edilməmiş | **Silindi** |
| `app/arena/match/reward/reward.tsx` — istifadəsiz, sınıq | **Silindi** (boş qovluqlar da) |
| `/arena/history/details/` route-u yox → **404** | `app/arena/history/details/page.tsx` yaradıldı, real `ArenaMatchDetailsScreen`-i `Suspense` içində göstərir |

---

### 🟡 11. `readBoundedScore` səssiz 0 qaytarırdı — DÜZƏLDİLDİ
`app/lib/battleScore/battleScoreConfig.ts` — sərhəddən kənar xal artıq `console.warn` ilə loglanır
(dəyər geriyə uyğunluq üçün yenə 0-dır, amma səbəb görünür).

---

### 🟡 12. Yeni `tsc` xətaları (istifadəçinin göndərdiyi) — DÜZƏLDİLDİ

**`app/shop/page.tsx`**
| Sətir | Xəta | Düzəliş |
|---|---|---|
| 30 | `Cannot find name 'accessor'` | `accessor.price` → `accessory.price` |
| 44 | `Property 'price' does not exist` | `TEXT_COLORS` elementlərində `price` yoxdur → `'Free'` |
| — | istifadəsiz `CHAT_MESSAGE_TYPES` importu | mesaj növlərinin sayı göstərilir |

**`app/shop/text-colors.tsx`**
| Xəta | Düzəliş |
|---|---|
| `TS7053: Element implicitly has an 'any' type` | `TextColorOption` interfeysi + `TEXT_COLORS: Record<string, TextColorOption>` |

**`app/lib/peerCallManager.ts`**
| Xəta | Düzəliş |
|---|---|
| `TS2307: Cannot find module 'peerjs'` | `peerjs` paketi layihədə yoxdur → dinamik `import('peerjs')` + tip təyinatı |
| 5 × `TS7006: implicitly has an 'any' type` | `id: string`, `err: PeerErrorLike`, `connection: PeerMediaConnectionLike`, `remoteStream: MediaStream` |

Qeyd: `peerjs` heç bir fayldan istifadə olunmurdu — tətbiq Zego (`zegoCallKit`) işlədir.
Modul artıq paket olmadıqda da build-i sındırmır.

---

### Arena reward server-side düzəlişləri
- Matç və həftəlik hesablaşma reward yazıları `awardArenaMatchRewards` və `settleArenaWeeklyRewards` callable Cloud Function-larına köçürüldü; Firestore klient qaydaları həm reward, həm də settlement `reward_events` yazılarını bağlayır.
- `/arena/history/` siyahı route-u əlavə edildi.
- `zegoConfig.ts` client cache/env-dən Zego server secret oxunması silindi. Yayımlanmış köhnə secret-i Zego panelində rotasiya etmək lazımdır.
- `server.js` yalnız ayrıca Node hostunda Socket.IO/presence üçün işləyə bilər; Firebase Hosting/Vercel static export onu başladmır. MongoDB/Mongoose kodu və `MONGO_URI` nümunəsi silinib, Firebase tətbiq datası üçün yeganə DB-dir. Socket funksiyalarının production sınağı ayrıca host və `ALLOWED_ORIGINS` konfiqurasiyası tələb edir.
- `alliance_attacks` yazıları `startAllianceAttack`, `registerAllianceRaidClick`, `finalizeAllianceRaid` callable-larına köçürülüb; klient yalnız signed-in oxuya bilər, birbaşa create/update bağlıdır.

## ❌ Hələ düzəldilməyib (qəsdən)

| # | Səbəb |
|---|---|
| 8 — `startAllianceMapBattle` lider yoxlanışı | Biznes qaydasıdır: **üzv** hücum edə bilirsə problem yox, yalnız **lider** edə bilirsə `attacker.leaderId !== playerId` şərti əlavə olunmalıdır. Sənin qərarını gözləyir. |
| 10 — `app/profile/page.tsx` (1850 sətir) | Böyük refaktor: `handleRegister`-in `try`/`catch` dublikatı ortaq funksiyaya çıxarılmalı, offline ID toqquşması server tərəfdə həll olunmalıdır. |
| Real mükafat ödənişi | Ödəniş məbləği/provider yoxdur; ledger qeydi pul balansına çevrilmir. Biznes məbləğləri və Play/yerli provider hesabı tələb olunur. |
| Zego sızmış açarların rotasiyası | Köhnə açarlar Zego panelində dəyişdirilməlidir; repo-dan bunu etmək mümkün deyil. |
| Android/Store buraxılışı | `applicationId`, uyğun `google-services.json`, push, iOS layihəsi və privacy/terms hüquqi mətni təsdiq və mağaza hesabı tələb edir. |

---

## ⚠️ Təsdiqlənməmiş hissə

Son auditin köhnə “node_modules natamamdır / yoxlama işləyə bilmədi” qeydi artıq qüvvədə deyil.
2026-10-18 yoxlaması: `npx tsc --noEmit` uğurla tamamlandı, `npm run build` Next.js 16.3.1 ilə uğurla tamamlandı (17 statik səhifə), `npm run test:arena-match` 106/106 keçdi və Functions `node --check` lint-i keçdi. Firestore Rules emulatoru Java olmadığı üçün bu mühitdə işə salınmayıb.

---

## 📁 Ehtiyat nüsxələr
Audit ehtiyat nüsxəsi repoda saxlanmır; Git diff dəyişiklikləri yoxlamaq üçün mənbədir.

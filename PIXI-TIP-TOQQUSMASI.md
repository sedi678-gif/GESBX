# TS2739 / TS2322 — Pixi v7 vs v8 tip toqquşması

## Xətalar

```
ClickRaidMapEngine.ts(71,7): error TS2739: Type 'Application<ICanvas>' is missing the
  following properties from type 'Application<Renderer>': init, canvas

ClickRaidMapEngine.ts(72,7): error TS2322: Type 'import("@pixi/ticker/...").Ticker' is not
  assignable to type 'import("pixi.js/.../Ticker").Ticker'
```

## Səbəb — bir faylda iki fərqli Pixi versiyasının tipləri

Layihə **eyni anda iki Pixi versiyası** işlədir:

| Alias | Real paket | Harada işlənir |
|---|---|---|
| `pixi.js` | `pixi.js@^8.8.1` | əsas xəritə (`allianceMapPixiOverlay.ts`) |
| `pixi7` | `pixi.js@^7.4.3` (npm alias) | click-raid 3D layer (`battleThree/`) |

`pixi3d` **yalnız Pixi v7** ilə uyğundur — ona görə `battleThree/` qovluğu v7 işlədir.
Amma `ClickRaidMapEngine.ts` faylı **hər iki versiyanın tipini** qarışdırırdı:

```ts
import type { Application } from 'pixi.js';        // ← v8 tipi  (SƏHV)
import type { Camera, Container3D } from 'pixi3d/pixi7';   // ← v7 əsaslı
```

Sonra:

```ts
const { PIXI } = await loadClickRaidPixiModule();   // PIXI = v7 (import('pixi7'))
const app = new PIXI.Application({ view: this.canvas, ... });   // v7 Application
this.app = app;                 // ← v7-ni v8 tipinə mənimsətmək → TS2739
this.ticker = app.ticker;       // ← v7 Ticker v8 Ticker-ə → TS2322
```

**Nə üçün uyğun deyil:**

- **`Application`** — v8-də `new Application()` arqument qəbul etmir; əvəzində
  `await app.init({...})` çağırılır və `app.canvas` sahəsi var. v7-də isə konstruktora
  `{ view: HTMLCanvasElement }` verilir. Ona görə v8 tipi v7 obyektində `init` və
  `canvas` sahələrini **tələb edir, tapmır** → TS2739.
- **`Ticker`** — v7 `@pixi/ticker` paketindən, v8 `pixi.js` daxilindən gəlir. İki ayrı
  modul olduqları üçün TypeScript onları **fərqli tip** sayır → TS2322.

## Düzəliş

Bütün tiplər v7-yə keçirildi — fayl artıq yalnız bir Pixi versiyası tanıyır:

```diff
-import type { Application } from 'pixi.js';
+import type * as PIXI7 from 'pixi7';

 import type { Animation, Camera, Container3D, Model } from 'pixi3d/pixi7';
```

```diff
-  private app: Application | null = null;
-  private ticker: Application['ticker'] | null = null;
+  private app: PIXI7.Application | null = null;
+  private ticker: PIXI7.Ticker | null = null;
```

`new PIXI.Application({ view, ... })` sətri **dəyişməz qaldı** — bu, düzgün v7 istifadəsidir.

## Yoxlama

```
PIXI7 istifadəsi:  private app: PIXI7.Application · private ticker: PIXI7.Ticker
qalan tək "Application": new PIXI.Application({  ← v7 API, düzgün
mötərizə balansı: braces 0 · parens 0 · brackets 0
```

Bütün `battleThree/` qovluğu yoxlanıldı — başqa faylda `pixi.js` (v8) tipi qarışmır:

```
app/components/alliance/battleThree/ClickRaidMapEngine.ts    → yalnız pixi7
app/components/alliance/battleThree/clickRaidAssetLoader.ts  → yalnız pixi3d/pixi7
app/components/alliance/battleThree/clickRaidPixiRuntime.ts  → yalnız pixi7
```

## Ümumi qayda bu layihə üçün

- `app/components/alliance/battleThree/**` → **`pixi7`** işlət, `pixi.js` YOX
- `app/components/alliance/allianceMapPixiOverlay.ts` və qalan xəritə kodu → **`pixi.js`** (v8)
- İki versiyanın tipini heç bir faylda qarışdırma — `Application`, `Ticker`,
  `Container`, `Renderer`, `Texture` hamısı versiyaya bağlıdır.

## Qeyd

Bu düzəliş `pixi7` paketi quraşdırıldıqdan sonra tam təsirli olur
(`npm install` — `package.json`-a `"pixi7": "npm:pixi.js@^7.4.3"` artıq əlavə edilib).

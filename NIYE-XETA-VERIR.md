# Niyə `Cannot find module` xətası gəlirdi — İZAH

## Qısa cavab

**`package.json` ilə `package-lock.json` bir-birindən ayrı düşmüşdü.**
Lock faylında 3 paket var idi, `package.json`-da isə yox. `npm install` həmişə
`package.json`-u əsas götürür — ona görə həmin paketlər heç vaxt quraşdırılmırdı
və TypeScript onları tapa bilmirdi.

---

## Sübut

`package-lock.json` → `packages[""].dependencies` (sətir 15–35):

```json
"next": "16.3.1",
"peer": "^1.0.2",                        ← package.json-da YOX idi
"peerjs": "^1.5.5",                      ← package.json-da YOX idi
"pixi.js": "^8.8.1",
"pixi3d": "^2.5.0",
"pixi7": "npm:pixi.js@^7.4.3",           ← package.json-da YOX idi
```

`package.json` → `dependencies` (düzəlişdən əvvəl):

```json
"next": "16.3.1",
"pixi.js": "^8.8.1",
"pixi3d": "^2.5.0",
```

Müqayisə skripti belə nəticə verdi:

```
LOCK-da olub package.json-da OLMAYAN: peer, peerjs, pixi7
package.json-da olub LOCK-da olmayan: (heç biri)
```

---

## Hər xətanın səbəbi

### 1. `Cannot find module 'pixi7'`
`app/components/alliance/battleThree/clickRaidPixiRuntime.ts` (sətir 4 və 12):

```ts
export type ClickRaidPixiBundle = {
  PIXI: typeof import('pixi7');          // ← bura
  pixi3d: typeof import('pixi3d/pixi7');
};

bundlePromise = Promise.all([import('pixi7'), import('pixi3d/pixi7')])   // ← və bura
```

`pixi7` **real npm paketi deyil** — bu, **npm alias**-dır:
`"pixi7": "npm:pixi.js@^7.4.3"` yəni “`pixi7` adı altında `pixi.js`-in 7.4.3 versiyasını quraşdır”.

Niyə belə edilib: layihə eyni anda **iki** Pixi versiyası işlədir —
əsas xəritə Pixi **v8** (`pixi.js@^8.8.1`), click-raid 3D layer isə Pixi **v7**
(`pixi3d` yalnız v7 ilə uyğundur). Eyni adla iki versiya quraşdırmaq mümkün olmadığı
üçün `pixi7` alias kimi verilir.

**Problem:** alias sətri `package.json`-dan silinmişdi, `package-lock.json`-da qalmışdı.
Nəticədə `node_modules/pixi7` qovluğu heç vaxt yaranmırdı → `TS2307`.

### 2. `Cannot find module 'peerjs'`
`app/lib/peerCallManager.ts` sətir 5 (orijinal):

```ts
import Peer, { MediaConnection } from 'peerjs';
```

Eyni səbəb: `peerjs` lock-da var, `package.json`-da yox → `node_modules/peerjs` yaranmır.

### 3. `app/lib/peerCallManager.ts(59,30): Cannot find module 'peerjs'`
Bu **mənim** əvvəlki düzəlişimdən sonra yaranmışdı. Paketi “istifadə olunmur” deyə
`import`-u dinamik `import('peerjs')`-ə çevirmişdim, amma paket yenə quraşdırılmadığı üçün
xəta yalnız başqa sətrə keçdi (59-cu sətir). Kök səbəb aradan qalxmamışdı.

---

## Nə düzəldildi

### 1. `package.json` — itkin paketlər geri əlavə edildi
```diff
  "next": "16.3.1",
+ "peer": "^1.0.2",
+ "peerjs": "^1.5.5",
  "pixi.js": "^8.8.1",
  "pixi3d": "^2.5.0",
+ "pixi7": "npm:pixi.js@^7.4.3",
```

İndi `package.json` və `package-lock.json` **tam uyğundur** (yoxlanıldı — fərq yoxdur).
Yəni `npm install` bu paketləri quraşdıracaq və hər üç xəta kökündən yox olacaq.

### 2. `app/lib/peerCallManager.ts` — real tip importu + ehtiyat
```ts
import type PeerDefault from 'peerjs';   // paket quraşdırıldıqdan sonra real tip
export type PeerModuleShape = typeof PeerDefault;
```
Dinamik `import('peerjs')` saxlanıldı ki, paket hər hansı səbəbdən olmadıqda
build tam sınmasın — sadəcə aydın xəbərdarlıq versin.

---

## Sənin etməli olduğun

```bash
npm install
```

Bu tək əmr hər üç xətanı həll edir. Yoxlamaq üçün:

```bash
npx tsc --noEmit
```

`node_modules/pixi7` və `node_modules/peerjs` qovluqlarının yarandığını görməlisən.

---

## Qeyd: `node_modules` yarımçıq idi

Yoxlama zamanı gördüm ki, bu layihədə `node_modules` **natamam** quraşdırılmışdı:

| Göstərici | Dəyər |
|---|---|
| Ümumi paket qovluğu | 817 |
| `package.json`-u olan | 642 |
| **`package.json`-u OLMAYAN** | **119** |
| `node_modules/next/package.json` | **yoxdur** |
| `node_modules/typescript/bin/tsc` | **yoxdur** |

Bu da onu göstərir ki, əvvəlki quraşdırma yarımçıq dayanıb (kəsilib və ya disk xətası).
Ona görə `npm install`-u tam işlətmək vacibdir — təkcə bu 3 paket üçün deyil.

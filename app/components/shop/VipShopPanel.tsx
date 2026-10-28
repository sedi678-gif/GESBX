"use client";



import React, { useState } from 'react';

import Link from 'next/link';

import { PlayerCosmetics } from '@/app/components/alliance/types';
import ProfileHeroDisplay from '@/app/components/profile/ProfileHeroDisplay';

import {

  COSMETIC_PRODUCTS,

  COSMETIC_CATEGORIES,

  CosmeticCategory,

  canPurchaseCosmetic,

  isVipActive,

  formatVipExpiry,
  getCosmeticPreviewGradient,

} from './cosmeticsConfig';

import { purchaseCosmetic, equipCosmetic } from './cosmeticsService';

import styles from './shop.module.css';



interface VipShopPanelProps {

  userId: string;

  manat: number;

  cosmetics: PlayerCosmetics | undefined | null;

  avatarUrl?: string;

  displayName: string;

  onNotify: (text: string) => void;

  onSpend?: (amount: number) => void;

  onRefund?: (amount: number) => void;

}



export default function VipShopPanel({ userId, manat, cosmetics, avatarUrl, displayName, onNotify, onSpend, onRefund }: VipShopPanelProps) {

  const [filter, setFilter] = useState<CosmeticCategory | 'all'>('all');

  const [loading, setLoading] = useState<string | null>(null);
  const [previewProductId, setPreviewProductId] = useState<string | null>(null);



  const owned = cosmetics?.owned ?? [];

  const equipped = cosmetics?.equipped ?? {};

  const vipActive = isVipActive(cosmetics);

  const previewProduct = COSMETIC_PRODUCTS.find((product) => product.id === previewProductId) ?? null;
  const previewNameParts = displayName.trim().split(/\s+/).filter(Boolean);
  const previewCosmetics: PlayerCosmetics | null = previewProduct
    ? (() => {
        const current: PlayerCosmetics = cosmetics
          ? { ...cosmetics, owned: [...(cosmetics.owned ?? [])], equipped: { ...(cosmetics.equipped ?? {}) } }
          : { owned: [], equipped: {}, vip: { tier: 'none', expiresAt: 0 } };
        if (previewProduct.category === 'frame') current.equipped.frameId = previewProduct.id;
        if (previewProduct.category === 'banner') current.equipped.bannerId = previewProduct.id;
        if (previewProduct.category === 'nameStyle') current.equipped.nameStyleId = previewProduct.id;
        if (previewProduct.category === 'vip') {
          current.vip = {
            tier: previewProduct.vipTier ?? 'gold',
            expiresAt: Date.now() + (previewProduct.vipDurationMs ?? 24 * 60 * 60 * 1000),
          };
        }
        return current;
      })()
    : null;



  const products = COSMETIC_PRODUCTS.filter(

    (p) => filter === 'all' || p.category === filter

  );



  const handleBuy = async (productId: string) => {

    const product = COSMETIC_PRODUCTS.find((p) => p.id === productId);

    if (!product) return;

    setLoading(productId);

    onSpend?.(product.price);

    try {

      await purchaseCosmetic(userId, productId);

      onNotify('Uğurla alındı! ✨');

    } catch (e) {

      onRefund?.(product.price);

      onNotify(e instanceof Error ? e.message : 'Xəta');

    } finally {

      setLoading(null);

    }

  };



  const handleEquip = async (productId: string) => {

    setLoading(`eq_${productId}`);

    try {

      await equipCosmetic(userId, productId);

      onNotify('Profilə tətbiq olundu! 🎨');

    } catch (e) {

      onNotify(e instanceof Error ? e.message : 'Xəta');

    } finally {

      setLoading(null);

    }

  };



  const isEquipped = (productId: string) =>

    Object.values(equipped).includes(productId);



  return (

    <>

      <div className={styles.vipBanner}>

        {vipActive ? (

          <>

            <strong>

              {cosmetics!.vip.tier === 'platinum' ? '💎 Platinum VIP' : '👑 Gold VIP'} aktiv

            </strong>

            <span> · Bitmə: {formatVipExpiry(cosmetics!.vip.expiresAt)}</span>

          </>

        ) : (

          <>

            <strong>👑 VIP ol</strong>

            <span> — rəngli ad stilləri, çərçivələr, arxa fonlar və ekskluziv nişanlar</span>

          </>

        )}

      </div>



      <ul className={styles.vipPerks}>

        <li>✍️ Rəngli və animasiyalı ad stilləri</li>

        <li>🖼️ Parlaq profil çərçivələri</li>

        <li>🎨 Premium arxa fon bannerləri</li>

        <li>🏅 Profil nişanları (tac, ulduz, almaz)</li>

        <li>💎 Platinum: ekskluziv kosmetika + parlaq effekt</li>

      </ul>



      <div className={styles.cosmeticFilters}>

        {COSMETIC_CATEGORIES.map((cat) => (

          <button

            key={cat.id}

            type="button"

            className={`${styles.cosmeticFilterBtn} ${filter === cat.id ? styles.cosmeticFilterActive : ''}`}

            onClick={() => setFilter(cat.id)}

          >

            {cat.label}

          </button>

        ))}

      </div>



      <div className={`${styles.productGrid} ${styles.vipProductGrid}`}>

        {products.map((product) => {

          const isOwned = product.category !== 'vip' && owned.includes(product.id);

          const check = canPurchaseCosmetic(product, cosmetics);

          const canBuy = check.ok && manat >= product.price && !loading;

          const equippedNow = isEquipped(product.id);



          return (

            <article

              key={product.id}

              className={`${styles.productCard} ${styles.vipProductCard}`}

            >

              <div className={styles.productArt}>

                <div

                  className={`${styles.vipPreview} ${product.platinumOnly ? styles.vipPreviewPlatinum : ''}`}

                  style={product.image
                    ? { backgroundImage: `linear-gradient(180deg, rgba(4,8,18,.08) 15%, rgba(4,8,18,.66) 100%), url("${product.image}")`, backgroundSize: 'cover', backgroundPosition: 'center 42%' }
                    : { background: getCosmeticPreviewGradient(product) }}

                >
                  <span className={styles.previewEdition}>
                    {product.category === 'vip' ? 'VIP PASS' : product.platinumOnly ? 'PLATINUM' : 'ELİT KOLLEKSİYA'}
                  </span>

                  {product.category === 'frame' && (
                    <span className={styles.frameShowcase}>
                      <span className={styles.framePreview} style={{ background: product.gradient }}>
                        {avatarUrl ? <img className={styles.frameAvatar} src={avatarUrl} alt="" /> : <span className={styles.frameAvatarInitials}>{displayName.slice(0, 2).toUpperCase()}</span>}
                        {product.frameImage && <img className={styles.frameOrnament} src={product.frameImage} alt="" />}
                      </span>
                      <span className={styles.frameMaterial}>{product.name}</span>
                    </span>
                  )}

                  {product.category === 'banner' && (
                    <span className={styles.wallpaperLabel}>PROFIL OBOYU</span>
                  )}

                  {product.category === 'vip' && (
                    <span className={`${styles.vipPassShowcase} ${product.vipTier === 'platinum' ? styles.vipPassPlatinum : ''}`}>
                      <span className={styles.vipPassOrnament} aria-hidden="true">
                        {product.vipTier === 'platinum' ? 'PLATINUM' : 'GOLD'}
                      </span>
                      <strong>{product.vipTier === 'platinum' ? 'PLATINUM' : 'GOLD'} VIP</strong>
                      <span>{product.vipDurationMs ? `${Math.round(product.vipDurationMs / 86400000)} GÜNLÜK GİRİŞ` : 'PREMIUM ÜZVLÜK'}</span>
                    </span>
                  )}

                  {product.styleClass && product.category === 'nameStyle' && (

                    <span className={`${styles.vipPreviewName} ${styles[`preview_${product.styleClass}`]}`}>

                      {displayName}

                    </span>

                  )}

                  {!product.styleClass && product.category !== 'frame' && product.category !== 'banner' && product.category !== 'vip' && (

                    <span className={styles.vipPreviewEmoji}>{product.previewEmoji ?? '✨'}</span>

                  )}

                </div>

              </div>



              <div className={styles.productBody}>

                <div className={styles.productName}>{product.name}</div>

                {product.vipOnly && (

                  <div className={styles.vipTag}>

                    {product.platinumOnly ? '💎 Platinum' : '👑 VIP'}

                  </div>

                )}

                <div className={styles.productDesc}>{product.desc}</div>

                <button
                  type="button"
                  className={styles.productPreviewBtn}
                  onClick={() => setPreviewProductId(product.id)}
                  aria-label={`Profildə önizlə: ${product.name}`}
                >
                  Profildə önizlə
                </button>

                <div className={styles.productFooter}>

                  <div className={styles.productPrice}>₼ {product.price.toLocaleString('az-AZ')}</div>



                  {product.category === 'vip' ? (

                    <button

                      type="button"

                      className={styles.buyBtn}

                      disabled={!canBuy}

                      onClick={() => handleBuy(product.id)}

                    >

                      {loading === product.id ? '...' : 'VIP'}

                    </button>

                  ) : isOwned ? (

                    <button

                      type="button"

                      className={`${styles.buyBtn} ${equippedNow ? styles.equipBtnActive : ''}`}

                      disabled={!!loading}

                      onClick={() => handleEquip(product.id)}

                    >

                      {loading === `eq_${product.id}` ? '...' : equippedNow ? '✓ Geyinilib' : 'Geyin'}

                    </button>

                  ) : (

                    <button

                      type="button"

                      className={styles.buyBtn}

                      disabled={!canBuy}

                      onClick={() => handleBuy(product.id)}

                      title={check.reason}

                    >

                      {loading === product.id ? '...' : check.ok ? 'Al' : 'Kilidli'}

                    </button>

                  )}

                </div>

              </div>

            </article>

          );

        })}

      </div>



      <p className={styles.vipHint}>

        Kosmetikalar alındıqdan sonra avtomatik profilə tətbiq oluna bilər. Dəyişdirmək üçün{' '}

        <Link href="/profile">profil səhifəsində</Link> VIP bölməsinə bax.

      </p>

      {previewProduct && previewCosmetics && (
        <div
          className={styles.shopPreviewOverlay}
          role="presentation"
          onClick={() => setPreviewProductId(null)}
        >
          <section
            className={styles.shopPreviewPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-profile-preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.shopPreviewHeader}>
              <div>
                <p className={styles.shopPreviewEyebrow}>PROFİL ÖNİZLƏMƏSİ</p>
                <h2 id="shop-profile-preview-title">{previewProduct.name}</h2>
              </div>
              <button
                type="button"
                className={styles.shopPreviewClose}
                onClick={() => setPreviewProductId(null)}
                aria-label="Önizləməni bağla"
              >
                ×
              </button>
            </header>
            <div className={styles.shopPreviewProfile}>
              <ProfileHeroDisplay
                name={previewNameParts[0] || 'Döyüşçü'}
                surname={previewNameParts.slice(1).join(' ')}
                avatar={avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80'}
                handle="@oyuncu"
                cosmetics={previewCosmetics}
              />
            </div>
            <p className={styles.shopPreviewNote}>
              Bu görünüş {previewProduct.name} profilə tətbiq ediləndə belə olacaq.
            </p>
          </section>
        </div>
      )}

    </>

  );

}


"use client";



import React, { useState } from 'react';

import Link from 'next/link';

import { PlayerCosmetics } from '@/app/components/alliance/types';

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



  const owned = cosmetics?.owned ?? [];

  const equipped = cosmetics?.equipped ?? {};

  const vipActive = isVipActive(cosmetics);



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

                  style={product.image || product.id === 'badge_crown'
                    ? { backgroundImage: `linear-gradient(180deg, rgba(4,8,18,.08) 15%, rgba(4,8,18,.66) 100%), url("${product.image ?? '/images/alliance-hub/hub-level-6.jpg'}")`, backgroundSize: 'cover', backgroundPosition: 'center 42%' }
                    : { background: getCosmeticPreviewGradient(product) }}

                >
                  <span className={styles.previewEdition}>
                    {product.category === 'vip' ? 'VIP PASS' : product.platinumOnly ? 'PLATINUM' : 'ELİT KOLLEKSİYA'}
                  </span>

                  {product.category === 'frame' && (
                    <span className={styles.frameShowcase}>
                      <span className={styles.framePreview} style={{ background: product.gradient }}>
                        {avatarUrl ? <img className={styles.frameAvatar} src={avatarUrl} alt="" /> : <span className={styles.frameAvatarInitials}>{displayName.slice(0, 2).toUpperCase()}</span>}
                        <svg className={styles.frameOrnament} viewBox="0 0 120 120" aria-hidden="true">
                          <circle cx="60" cy="60" r="53" fill="none" stroke="rgba(255,255,255,.92)" strokeWidth="3" />
                          <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(2,6,23,.65)" strokeWidth="2" strokeDasharray="2 4" />
                          <path d="M60 1 65 9 60 15 55 9Z M119 60l-8 5-6-5 6-5Z M60 119l-5-8 5-6 5 6Z M1 60l8-5 6 5-6 5Z" fill="#fff1a8" stroke="#5b3512" strokeWidth="2" />
                        </svg>
                      </span>
                      <span className={styles.frameMaterial}>{product.name}</span>
                    </span>
                  )}

                  {product.category === 'banner' && (
                    <span className={styles.wallpaperLabel}>PROFIL OBOYU</span>
                  )}

                  {product.id === 'badge_crown' && (
                    <span className={styles.crownShowcase}>
                      <svg className={styles.crownPreview} viewBox="0 0 100 82" role="img" aria-label="Qızıl VIP tacı">
                        <defs><linearGradient id="vipCrownGold" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#fff4ae"/><stop offset=".28" stopColor="#ffc42f"/><stop offset=".62" stopColor="#b56a12"/><stop offset="1" stopColor="#ffe98a"/></linearGradient></defs>
                        <path d="M9 61 2 16l26 22L50 3l22 35 26-22-7 45-8 12H17Z" fill="url(#vipCrownGold)" stroke="#49260d" strokeWidth="5" strokeLinejoin="round" />
                        <path d="M12 62h76v12H12z" fill="url(#vipCrownGold)" stroke="#49260d" strokeWidth="4" />
                        <circle cx="50" cy="49" r="7" fill="#24d4ef" stroke="#fff4ae" strokeWidth="3" />
                        <circle cx="18" cy="47" r="4" fill="#f34488"/><circle cx="82" cy="47" r="4" fill="#73e9ff"/>
                      </svg>
                      <span className={styles.crownMedalText}>VIP · ROYAL COLLECTION</span>
                    </span>
                  )}

                  {product.category === 'vip' && (
                    <span className={`${styles.vipPassShowcase} ${product.vipTier === 'platinum' ? styles.vipPassPlatinum : ''}`}>
                      <span className={styles.vipPassOrnament} aria-hidden="true">
                        {product.vipTier === 'platinum' ? (
                          <svg viewBox="0 0 100 100"><path d="m50 5 38 24-8 47-30 19-30-19-8-47Z" fill="url(#vipPassGem)" stroke="#d8f4ff" strokeWidth="4"/><path d="m12 29 38 69 38-69M12 29h76M50 5v93" fill="none" stroke="rgba(255,255,255,.78)" strokeWidth="2"/><defs><linearGradient id="vipPassGem" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#effbff"/><stop offset=".38" stopColor="#4dd8f3"/><stop offset="1" stopColor="#7144cf"/></linearGradient></defs></svg>
                        ) : (
                          <svg viewBox="0 0 100 100"><path d="M10 59 4 19l26 20L50 5l20 34 26-20-6 40-10 20H20Z" fill="url(#vipPassGold)" stroke="#512f12" strokeWidth="5"/><path d="M17 76h66v12H17z" fill="url(#vipPassGold)" stroke="#512f12" strokeWidth="4"/><defs><linearGradient id="vipPassGold" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff4ae"/><stop offset=".5" stopColor="#e6a51d"/><stop offset="1" stopColor="#fff0a1"/></linearGradient></defs></svg>
                        )}
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

                  {!product.styleClass && product.category !== 'frame' && product.category !== 'banner' && product.category !== 'vip' && product.id !== 'badge_crown' && (

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

    </>

  );

}


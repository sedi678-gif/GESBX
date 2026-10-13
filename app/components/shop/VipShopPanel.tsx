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

} from './cosmeticsConfig';

import { purchaseCosmetic, equipCosmetic } from './cosmeticsService';

import styles from './shop.module.css';



interface VipShopPanelProps {

  userId: string;

  manat: number;

  cosmetics: PlayerCosmetics | undefined | null;

  onNotify: (text: string) => void;

  onSpend?: (amount: number) => void;

  onRefund?: (amount: number) => void;

}



export default function VipShopPanel({ userId, manat, cosmetics, onNotify, onSpend, onRefund }: VipShopPanelProps) {

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



      <div className={styles.productGrid}>

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

                  className={styles.vipPreview}

                  style={

                    product.gradient

                      ? { background: product.gradient }

                      : product.styleClass

                        ? undefined

                        : { background: 'linear-gradient(135deg, #312e81, #6366f1)' }

                  }

                >

                  {product.styleClass && product.category === 'nameStyle' && (

                    <span className={`${styles.vipPreviewName} ${styles[`preview_${product.styleClass}`]}`}>

                      Ad

                    </span>

                  )}

                  {!product.styleClass && (

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


'use client';

import { useState } from 'react';
import { useAllianceBrain } from '@/app/components/alliance/AllianceBrainContext';
import { FORTRESS_SHOP_PRODUCTS, getFortressHubBgUrl } from '@/app/lib/allianceFortressConfig';
import { purchaseFortressLevel } from '@/app/lib/allianceFortressService';
import type { AllianceFortressLevel } from '@/app/lib/allianceFortressConfig';
import styles from './shop.module.css';

interface CastleShopPanelProps {
  userId: string;
  manat: number;
  onNotify: (text: string) => void;
  onSpend: (amount: number) => void;
  onRefund: (amount: number) => void;
}

export default function CastleShopPanel({ userId, manat, onNotify, onSpend, onRefund }: CastleShopPanelProps) {
  const { activeAlliance, fortressHub } = useAllianceBrain();
  const [loadingLevel, setLoadingLevel] = useState<AllianceFortressLevel | null>(null);
  const currentLevel = activeAlliance?.fortressLevel ?? 1;
  const featuredLevel = Math.min(6, currentLevel + 1) as AllianceFortressLevel;
  const featuredProduct = FORTRESS_SHOP_PRODUCTS.find((product) => product.level === featuredLevel) ?? FORTRESS_SHOP_PRODUCTS[4];
  const featuredCanBuy = Boolean(activeAlliance && fortressHub.canManage && currentLevel < 6 && manat >= featuredProduct.price && !loadingLevel);

  const handleBuy = async (level: AllianceFortressLevel, price: number) => {
    if (!activeAlliance || !fortressHub.canManage || level !== currentLevel + 1 || manat < price) return;
    setLoadingLevel(level);
    onSpend(price);
    try {
      await purchaseFortressLevel(userId, activeAlliance.id, level);
      onNotify(`🏰 ${FORTRESS_SHOP_PRODUCTS.find((product) => product.level === level)?.name} alındı!`);
    } catch (error) {
      onRefund(price);
      onNotify(error instanceof Error ? error.message : 'Qala alınmadı. Yenidən cəhd et.');
    } finally {
      setLoadingLevel(null);
    }
  };

  return (
    <>
      {!activeAlliance ? (
        <div className={styles.castleShopNotice}>
          <strong>Qalaları görmək üçün ittifaqa qoşul</strong>
          <span>Səviyyə yüksəlişini ittifaqın lideri alır; alınan qala bütün üzvlər üçün açılır.</span>
        </div>
      ) : (
        <div className={styles.castleShopNotice}>
          <strong>{activeAlliance.name} · Hazırkı qala Lv.{currentLevel}</strong>
          <span>
            {fortressHub.canManage
              ? 'Növbəti qala görünüşünü aç və ittifaqının mərkəzini yüksəlt.'
              : 'Qala səviyyəsini yalnız ittifaq lideri yüksəldə bilər.'}
          </span>
        </div>
      )}

      <article className={styles.castleShowcase}>
        <img src={getFortressHubBgUrl(featuredProduct.level)} alt="" />
        <div className={styles.castleShowcaseShade} />
        <div className={styles.castleShowcaseContent}>
          <span className={styles.castleShowcaseEyebrow}>
            {currentLevel >= 6 ? 'ƏFSANƏVİ İTTİFAQ QALASI' : 'NÖVBƏTİ QALA · XÜSUSİ GÖRÜNÜŞ'}
          </span>
          <h3>{currentLevel >= 6 ? 'Maksimum səviyyə' : featuredProduct.name}</h3>
          <p>
            {currentLevel >= 6
              ? 'İttifaqınız bütün qala görünüşlərini açıb.'
              : `${featuredProduct.desc} Yüksəliş bütün ittifaq üzvlərinə tətbiq olunur.`}
          </p>
          <div className={styles.castleShowcaseFooter}>
            <strong>{currentLevel >= 6 ? 'Lv.6' : `₼ ${featuredProduct.price.toLocaleString('az-AZ')}`}</strong>
            {currentLevel < 6 && (
              <button
                type="button"
                className={styles.buyBtn}
                disabled={!featuredCanBuy}
                onClick={() => void handleBuy(featuredProduct.level, featuredProduct.price)}
                title={!activeAlliance ? 'Əvvəl ittifaqa qoşul' : !fortressHub.canManage ? 'Yalnız ittifaq lideri ala bilər' : manat < featuredProduct.price ? 'Balans kifayət etmir' : undefined}
              >
                {loadingLevel === featuredProduct.level
                  ? '...'
                  : featuredCanBuy
                    ? 'Qalanı aç'
                    : !activeAlliance
                      ? 'İttifaqa qoşul'
                      : !fortressHub.canManage
                        ? 'Lider alır'
                        : 'Balans azdır'}
              </button>
            )}
          </div>
        </div>
      </article>

      <div className={styles.productGrid}>
        {FORTRESS_SHOP_PRODUCTS.map((product) => {
          const active = currentLevel >= product.level;
          const next = product.level === currentLevel + 1;
          const canBuy = Boolean(activeAlliance && fortressHub.canManage && next && manat >= product.price && !loadingLevel);

          return (
            <article key={product.level} className={`${styles.productCard} ${styles.vipProductCard}`}>
              <div className={styles.productArt}>
                <div className={styles.castlePreview}>
                  <img src={getFortressHubBgUrl(product.level)} alt="" loading="lazy" />
                  <span>Lv.{product.level}</span>
                </div>
              </div>
              <div className={styles.productBody}>
                <div className={styles.productName}>{product.name}</div>
                <div className={styles.productDesc}>{product.desc}</div>
                <div className={styles.productFooter}>
                  <div className={styles.productPrice}>₼ {product.price.toLocaleString('az-AZ')}</div>
                  <button
                    type="button"
                    className={`${styles.buyBtn} ${active ? styles.equipBtnActive : ''}`}
                    disabled={!canBuy}
                    onClick={() => void handleBuy(product.level, product.price)}
                    title={active ? 'Bu qala artıq aktivdir' : !activeAlliance ? 'Əvvəl ittifaqa qoşul' : !fortressHub.canManage ? 'Yalnız ittifaq lideri ala bilər' : !next ? 'Əvvəlcə əvvəlki səviyyəni aç' : manat < product.price ? 'Balans kifayət etmir' : undefined}
                  >
                    {loadingLevel === product.level
                      ? '...'
                      : active
                        ? '✓ Aktivdir'
                        : canBuy
                          ? 'Qalanı al'
                          : next && fortressHub.canManage && activeAlliance
                            ? 'Balans azdır'
                            : 'Kilidli'}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

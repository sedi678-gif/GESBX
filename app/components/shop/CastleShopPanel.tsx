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

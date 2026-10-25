'use client';

import { useEffect, useState } from 'react';
import AppBottomNav from '@/app/components/AppBottomNav';
import AppLink from '@/app/components/AppLink';
import CastleShopPanel from '@/app/components/shop/CastleShopPanel';
import VipShopPanel from '@/app/components/shop/VipShopPanel';
import { useUser } from '@/context/UserContext';
import styles from './shopPage.module.css';

export default function ShopPageClient() {
  const { user, userId, manat, manatReady, playerProfile, applyManatDelta } = useUser();
  const [notice, setNotice] = useState<string | null>(null);
  const [shopTab, setShopTab] = useState<'cosmetics' | 'fortress'>('cosmetics');
  const canUseShop = Boolean(userId && userId !== 'anonim_user_id');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'fortress') {
      setShopTab('fortress');
    }
  }, []);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>GESBX · MAĞAZA</p>
            <h1 className={styles.title}>Öz üslubunu yarat</h1>
            <p className={styles.intro}>
              Profil çərçivələri, bannerlər, nişanlar və VIP görünüşləri seç. Alışlar hesabındakı manat balansından çıxılır.
            </p>
          </div>

          <aside className={styles.wallet} aria-label="Manat balansı">
            <span className={styles.walletIcon} aria-hidden="true">₼</span>
            <div className={styles.walletCopy}>
              <span className={styles.walletLabel}>Balansın</span>
              <strong className={styles.walletAmount}>
                {manatReady ? `₼ ${manat.toLocaleString('az-AZ')}` : 'Yüklənir…'}
              </strong>
              <span className={styles.walletHint}>Qiymətlər manatladır</span>
            </div>
          </aside>
        </header>

        {notice && (
          <div className={styles.notice} role="status" aria-live="polite">
            <span>{notice}</span>
            <button
              type="button"
              className={styles.noticeClose}
              aria-label="Bildirişi bağla"
              onClick={() => setNotice(null)}
            >
              ×
            </button>
          </div>
        )}

        <section className={styles.store} aria-labelledby="shop-cosmetics-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>MAĞAZA KATALOQU</p>
              <h2 id="shop-cosmetics-title" className={styles.sectionTitle}>
                {shopTab === 'fortress' ? 'İttifaq qalaları' : 'VIP və profil kosmetikası'}
              </h2>
            </div>
            <p className={styles.sectionDescription}>
              {shopTab === 'fortress'
                ? 'Beş fərqli qala görünüşündən növbəti səviyyəni seç. Yüksəliş bütün ittifaq üçün açılır.'
                : 'Məhsulları kateqoriyaya görə seç, manatla al və sahib olduqlarını profilində geyin.'}
            </p>
          </div>

          <div className={styles.shopTabs} role="tablist" aria-label="Mağaza bölmələri">
            <button
              type="button"
              role="tab"
              aria-selected={shopTab === 'cosmetics'}
              className={`${styles.shopTab} ${shopTab === 'cosmetics' ? styles.shopTabActive : ''}`}
              onClick={() => setShopTab('cosmetics')}
            >
              ✨ VIP və kosmetika
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={shopTab === 'fortress'}
              className={`${styles.shopTab} ${shopTab === 'fortress' ? styles.shopTabActive : ''}`}
              onClick={() => setShopTab('fortress')}
            >
              🏰 Qalalar
            </button>
          </div>

          {!manatReady ? (
            <div className={styles.loading} role="status">Balans və məhsullar yüklənir…</div>
          ) : !canUseShop ? (
            <div className={styles.loginCard}>
              <p>Alış etmək və məhsulları saxlamaq üçün hesabına daxil ol.</p>
              <AppLink href="/login" className={styles.loginLink}>Daxil ol</AppLink>
            </div>
          ) : (
            shopTab === 'fortress' ? (
              <CastleShopPanel
                userId={userId}
                manat={manat}
                onNotify={setNotice}
                onSpend={(amount) => applyManatDelta(-amount)}
                onRefund={(amount) => applyManatDelta(amount)}
              />
            ) : (
              <VipShopPanel
                userId={userId}
                manat={manat}
                cosmetics={playerProfile?.cosmetics}
                avatarUrl={user?.photoURL ?? undefined}
                displayName={playerProfile?.displayName || user?.displayName || 'Döyüşçü'}
                onNotify={setNotice}
                onSpend={(amount) => applyManatDelta(-amount)}
                onRefund={(amount) => applyManatDelta(amount)}
              />
            )
          )}
        </section>
      </main>

      <AppBottomNav activeTab="shop" />
    </div>
  );
}

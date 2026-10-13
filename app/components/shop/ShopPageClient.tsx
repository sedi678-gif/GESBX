"use client";

import AppBottomNav from '@/app/components/AppBottomNav';
import { useAppStrings } from '@/app/lib/useAppStrings';
import styles from './shop.module.css';

export default function ShopPageClient() {
  const t = useAppStrings();
  const sections = [
    { id: 'frames', title: t.shop.frames, hint: t.shop.framesHint, tone: styles.toneFrames },
    { id: 'vip', title: t.shop.vip, hint: t.shop.vipHint, tone: styles.toneVip },
    { id: 'vip-plus', title: t.shop.vipPlus, hint: t.shop.vipPlusHint, tone: styles.toneVipPlus },
  ] as const;

  return (
    <div className={styles.shopWorld}>
      <header className={styles.shopBar}>
        <p className={styles.eyebrow}>{t.shop.eyebrow}</p>
        <h1 className={styles.shopTitle}>{t.shop.title}</h1>
      </header>

      <div className={styles.shopContent}>
        {sections.map((section) => (
          <section key={section.id} className={`${styles.frame} ${section.tone}`} aria-labelledby={`${section.id}-title`}>
            <div className={styles.frameHead}>
              <h2 id={`${section.id}-title`} className={styles.frameTitle}>
                {section.title}
              </h2>
              <p className={styles.frameHint}>{section.hint}</p>
            </div>
            <div className={styles.frameBody} />
          </section>
        ))}
      </div>

      <AppBottomNav activeTab="shop" />
    </div>
  );
}

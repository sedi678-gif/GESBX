"use client";

import { useAppStrings } from '@/app/lib/useAppStrings';
import AppLink from '@/app/components/AppLink';
import styles from './AppBottomNav.module.css';

export type AppNavTab = 'profile' | 'shop' | 'explore' | 'messages' | 'alliance';

type IconProps = { active?: boolean };

const Icons = {
  Profile: ({ active }: IconProps) => (
    <svg className={styles.navIcon} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M5.5 22.2c1.5-4 4.3-6 8.5-6s7 2 8.5 6" className={active ? styles.iconActive : styles.iconLine} />
      <path d="M18.7 9.3a4.7 4.7 0 1 1-9.4 0 4.7 4.7 0 0 1 9.4 0Z" className={active ? styles.iconActive : styles.iconLine} />
      <path d="M3.8 14a10.2 10.2 0 0 1 2.1-6.2M24.2 14a10.2 10.2 0 0 1-2.1 6.2" className={styles.iconAccent} />
    </svg>
  ),
  Shop: ({ active }: IconProps) => (
    <svg className={styles.navIcon} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="m5.2 10.5 2-5h13.6l2 5v11.2H5.2V10.5Z" className={active ? styles.iconActive : styles.iconLine} />
      <path d="M4.8 10.5c0 2 1.2 3.1 2.8 3.1s2.8-1.1 2.8-3.1c0 2 1.2 3.1 2.8 3.1s2.8-1.1 2.8-3.1c0 2 1.2 3.1 2.8 3.1s2.8-1.1 2.8-3.1" className={styles.iconAccent} />
      <path d="M11 21.5v-5.8h6v5.8" className={active ? styles.iconActive : styles.iconLine} />
    </svg>
  ),
  Explore: ({ active }: IconProps) => (
    <svg className={styles.navIcon} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="10.2" className={styles.iconLine} />
      <path d="m18.7 9.3-3.1 6.3-6.3 3.1 3.1-6.3 6.3-3.1Z" className={active ? styles.iconActive : styles.iconAccent} />
      <circle cx="14" cy="14" r="1.3" className={styles.iconFill} />
    </svg>
  ),
  Messages: ({ active }: IconProps) => (
    <svg className={styles.navIcon} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M5 7.4A3.4 3.4 0 0 1 8.4 4h11.2A3.4 3.4 0 0 1 23 7.4v7.2a3.4 3.4 0 0 1-3.4 3.4h-6.2l-5.1 4v-4.1a3.4 3.4 0 0 1-3.3-3.3V7.4Z" className={active ? styles.iconActive : styles.iconLine} />
      <path d="M9 10.8h10M9 14h6" className={styles.iconAccent} />
      <path d="m21.3 3 .6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7Z" className={styles.iconSpark} />
    </svg>
  ),
  Alliance: ({ active }: IconProps) => (
    <svg className={styles.navIcon} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="m14 3.2 9 3.6v6.7c0 5.1-3.6 9.2-9 11.3-5.4-2.1-9-6.2-9-11.3V6.8l9-3.6Z" className={active ? styles.iconActive : styles.iconLine} />
      <path d="m14 8 1.8 3.8 4.2.5-3.1 2.9.8 4.1-3.7-2-3.7 2 .8-4.1-3.1-2.9 4.2-.5L14 8Z" className={styles.iconAccent} />
    </svg>
  ),
};

interface AppBottomNavProps {
  activeTab: AppNavTab;
}

export default function AppBottomNav({ activeTab }: AppBottomNavProps) {
  const t = useAppStrings();

  return (
    <nav className={styles.bottomNav} aria-label={t.nav.main}>
      <AppLink href="/profile" className={`${styles.navItem} ${activeTab === 'profile' ? styles.navItemActive : ''}`} title={t.nav.profile} aria-current={activeTab === 'profile' ? 'page' : undefined}>
        <span className={styles.iconWrap}><Icons.Profile active={activeTab === 'profile'} /></span>
        <span className={styles.navLabel}>{t.nav.profile}</span>
      </AppLink>
      <AppLink href="/shop" className={`${styles.navItem} ${activeTab === 'shop' ? styles.navItemActive : ''}`} title={t.nav.shop} aria-current={activeTab === 'shop' ? 'page' : undefined}>
        <span className={styles.iconWrap}><Icons.Shop active={activeTab === 'shop'} /></span>
        <span className={styles.navLabel}>{t.nav.shop}</span>
      </AppLink>
      <AppLink href="/explore" className={`${styles.navItem} ${styles.navItemCenter} ${activeTab === 'explore' ? styles.navItemCenterActive : ''}`} title={t.nav.explore} aria-current={activeTab === 'explore' ? 'page' : undefined}>
        <span className={styles.centerIconWrap}><Icons.Explore active={activeTab === 'explore'} /></span>
        <span className={styles.navLabel}>{t.nav.explore}</span>
      </AppLink>
      <AppLink href="/messages" className={`${styles.navItem} ${activeTab === 'messages' ? styles.navItemActive : ''}`} title={t.nav.messages} aria-current={activeTab === 'messages' ? 'page' : undefined}>
        <span className={styles.iconWrap}><Icons.Messages active={activeTab === 'messages'} /></span>
        <span className={styles.navLabel}>{t.nav.messages}</span>
      </AppLink>
      <AppLink href="/alliance" className={`${styles.navItem} ${activeTab === 'alliance' ? styles.navItemActive : ''}`} title={t.nav.alliance} aria-current={activeTab === 'alliance' ? 'page' : undefined}>
        <span className={styles.iconWrap}><Icons.Alliance active={activeTab === 'alliance'} /></span>
        <span className={styles.navLabel}>{t.nav.alliance}</span>
      </AppLink>
    </nav>
  );
}

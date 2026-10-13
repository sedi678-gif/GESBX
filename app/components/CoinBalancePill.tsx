"use client";

import { usePathname } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import styles from './CoinBalancePill.module.css';

const HIDDEN_PREFIXES = ['/login', '/register', '/forgot-password', '/alliance'];

export default function CoinBalancePill() {
  const { manat, manatReady, userId } = useUser();
  const pathname = usePathname() ?? '';

  if (userId === 'anonim_user_id') return null;
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <div className={styles.pill} role="status" aria-label={`Manat balansı: ${manat}`}>
      <span className={styles.icon}>₼</span>
      <span className={styles.amount}>
        {manatReady ? manat.toLocaleString('az-AZ') : '...'}
      </span>
    </div>
  );
}

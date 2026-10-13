import type { Metadata } from 'next';
import RankingPageClient from '@/app/components/alliance/RankingPageClient';

export const metadata: Metadata = {
  title: 'Reytinq — Yol Üstü',
};

export default function RankingPage() {
  return <RankingPageClient />;
}

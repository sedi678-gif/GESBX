'use client';

import { Suspense } from 'react';
import ArenaMatchDetailsScreen from '@/app/game/arena/ArenaMatchDetailsScreen';

/**
 * `/arena/history/details/?matchId=...` route-u.
 *
 * ƏVVƏL: bu yolda heç bir `page.tsx` yox idi, yalnız istifadəçisiz `details.tsx`
 * komponenti vardı — nəticədə `ArenaResultPanel` və `ArenaBattleHistoryScreen`-in
 * verdiyi bütün linklər 404 verirdi.
 *
 * İndi real detal ekranı (`ArenaMatchDetailsScreen`) burada göstərilir.
 * `useSearchParams` işlədiyi üçün `Suspense` sərhədi tələb olunur.
 */
export default function ArenaHistoryDetailsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: '#94a3b8' }}>Yüklənir…</div>}>
      <ArenaMatchDetailsScreen />
    </Suspense>
  );
}

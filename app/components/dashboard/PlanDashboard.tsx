'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useUser } from '@/context/UserContext';
import AppBottomNav from '@/app/components/AppBottomNav';
import AppLink from '@/app/components/AppLink';
import {
  USER_PLAN_LABELS,
  VIP_PRO_PRICE_AZN,
  canViewAnalytics,
  hasActiveCreatorAccess,
  normalizeUserPlanState,
  purchaseVipProPlan,
  activateFreeCreatorPanel,
  setProPanelActive,
  shouldShowAds,
} from '@/app/lib/userPlan';
import ChannelDashboard from './ChannelDashboard';
import { useChannelStudio } from './useChannelStudio';
import { useAppStrings } from '@/app/lib/useAppStrings';
import styles from './studioDashboard.module.css';

type StudioTab = 'dashboard' | 'content' | 'analytics' | 'earn';

const NAV_ICONS: { id: StudioTab; icon: ReactNode }[] = [
  {
    id: 'dashboard',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
      </svg>
    ),
  },
  {
    id: 'content',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z" />
      </svg>
    ),
  },
  {
    id: 'analytics',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3 17h3v4H3v-4zm5-6h3v10H8V11zm5-5h3v15h-3V6zm5 8h3v7h-3v-7z" />
      </svg>
    ),
  },
  {
    id: 'earn',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1.75.76 1.36 2.32 1.36 1.64 0 2.24-.7 2.24-1.45 0-.87-.6-1.33-2.24-1.77-2.4-.64-3.97-1.61-3.97-3.65 0-1.77 1.39-3 3.11-3.39V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39h-1.96c-.1-.81-.67-1.36-2.09-1.36-1.41 0-2.09.61-2.09 1.41 0 .73.57 1.14 2.2 1.58 2.55.67 4.01 1.64 4.01 3.8 0 1.8-1.28 3.05-3.31 3.41z" />
      </svg>
    ),
  },
];

export default function PlanDashboard() {
  const { userId, manat, playerProfile } = useUser();
  const t = useAppStrings();
  const data = useChannelStudio(userId);
  const plan = useMemo(
    () => normalizeUserPlanState(playerProfile as unknown as Record<string, unknown> | null),
    [playerProfile]
  );
  const [tab, setTab] = useState<StudioTab>('dashboard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [creatorChoiceOpen, setCreatorChoiceOpen] = useState(false);
  const [activatedCreatorType, setActivatedCreatorType] = useState<'standard' | 'vip' | null>(null);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('creatorStatus');
    if (status === 'activated') setNotice('Creator paneli aktivləşdi.');
    if (status === 'already') setNotice('Sən artıq Creatorsan. Creator panelin aktivdir.');
  }, []);

  const analyticsOpen = canViewAnalytics(plan);
  const creatorAccess = hasActiveCreatorAccess(plan);
  const showAds = shouldShowAds(plan);

  const run = async (fn: () => Promise<unknown>, successMessage = ''): Promise<boolean> => {
    if (!userId || busy) return false;
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (successMessage) setNotice(successMessage);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : t.auth.errors.generic;
      setError(/30 AZN|VIP Professional|kifayət qədər manat/i.test(message)
        ? 'Balansınızda pul kifayət etmir. VIP Creator almaq üçün 30 AZN lazımdır.'
        : message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const chooseStandardCreator = async () => {
    const ok = await run(
      () => activateFreeCreatorPanel(userId),
      'Siz Adi Creator panelini aktivləşdirdiniz.',
    );
    if (ok) {
      setActivatedCreatorType('standard');
      setCreatorChoiceOpen(false);
    }
  };

  const chooseVipCreator = async () => {
    const ok = await run(
      () => purchaseVipProPlan(userId),
      'VIP Creator paneli aktivləşdirildi. 30 AZN balansınızdan çıxıldı.',
    );
    if (ok) {
      setActivatedCreatorType('vip');
      setCreatorChoiceOpen(false);
    }
  };

  const handleCreateClick = () => {
    setError(null);
    const vipActive = activatedCreatorType === 'vip'
      || plan.isVipLifetime
      || (plan.userPlan === 'VIP_PRO' && plan.creatorPanelExpiresAt > Date.now());
    const standardActive = activatedCreatorType === 'standard' || plan.freeCreatorPanelClaimedAt > 0;
    if (vipActive) {
      setNotice('Siz artıq VIP Creatorsunuz. VIP Creator paneliniz aktivdir.');
      setCreatorChoiceOpen(false);
      return;
    }
    if (standardActive) {
      setNotice('Siz artıq Adi Creatorsunuz. Adi Creator paneliniz aktivdir.');
      setCreatorChoiceOpen(false);
      return;
    }
    setCreatorChoiceOpen(true);
  };

  const tabLabel: Record<StudioTab, string> = {
    dashboard: t.studio.panel,
    content: t.studio.content,
    analytics: t.studio.analytics,
    earn: t.studio.earn,
  };

  return (
    <div className={styles.studio}>
      <div className={styles.layout}>
        <nav className={styles.rail} aria-label="Studio">
          {NAV_ICONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.railBtn} ${tab === item.id ? styles.railBtnActive : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.icon}
              {tabLabel[item.id]}
            </button>
          ))}
          <AppLink href="/profile" className={styles.railBtn}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
            {t.studio.channel}
          </AppLink>
          <AppLink href="/settings" className={styles.railBtn}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.59.22-1.14.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.81 8.48a.5.5 0 0 0 .12.64L4.96 10.7c-.04.31-.06.63-.06.94s.02.63.06.94L2.93 14.16a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.69.22l2.39-.96c.49.41 1.04.72 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.59-.22 1.14-.53 1.63-.94l2.39.96c.26.12.55.02.69-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
            </svg>
            {t.studio.settings}
          </AppLink>
        </nav>

        <main className={styles.main}>
          <header className={styles.topbar}>
            <div className={styles.brand}>
              {data.avatar ? (
                <img className={styles.avatar} src={data.avatar} alt="" />
              ) : (
                <div className={styles.brandMark}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              )}
              <div className={styles.brandText}>
                <p className={styles.brandKicker}>{t.studio.kicker}</p>
                <h1 className={styles.brandTitle}>{data.name || t.studio.channel}</h1>
              </div>
            </div>
            <button
              type="button"
              className={styles.createBtn}
              onClick={handleCreateClick}
              disabled={busy}
            >
              {t.studio.create}
            </button>
          </header>

          {creatorChoiceOpen ? (
            <div
              role="presentation"
              onClick={(event) => { if (event.target === event.currentTarget && !busy) setCreatorChoiceOpen(false); }}
              style={{
                position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center',
                padding: 20, background: 'rgba(2, 6, 23, .78)', backdropFilter: 'blur(8px)',
              }}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="creator-choice-title"
                style={{
                  width: 'min(100%, 440px)', padding: 22, borderRadius: 22,
                  border: '1px solid rgba(148,163,184,.28)', background: '#111827',
                  color: '#f8fafc', boxShadow: '0 24px 80px rgba(0,0,0,.45)',
                }}
              >
                <h2 id="creator-choice-title" style={{ margin: '0 0 8px', fontSize: 22 }}>Hansı Creator olmaq istəyirsiniz?</h2>
                <p style={{ margin: '0 0 10px', color: '#cbd5e1', lineHeight: 1.5 }}>
                  Adi Creator tam pulsuzdur. VIP Creator alındıqda balansınızdan 30 AZN çıxılır.
                </p>
                <p style={{ margin: '0 0 14px', color: '#e2e8f0', fontWeight: 700 }}>
                  Cari balansınız: {Math.max(0, Number(manat) || 0).toLocaleString('az-AZ')} AZN
                </p>
                {Number(manat) < VIP_PRO_PRICE_AZN ? (
                  <p style={{ margin: '0 0 14px', color: '#fbbf24', fontSize: 13 }}>
                    VIP Creator almaq üçün balansınızda ən azı 30 AZN olmalıdır.
                  </p>
                ) : null}
                {error ? <p role="alert" className={styles.error}>{error}</p> : null}
                <div style={{ display: 'grid', gap: 12 }}>
                  <button
                    type="button"
                    className={styles.buyBtn}
                    disabled={busy}
                    onClick={() => void chooseStandardCreator()}
                  >
                    {busy ? t.studio.wait : 'Adi Creator — Pulsuz'}
                  </button>
                  <button
                    type="button"
                    className={styles.buyBtn}
                    disabled={busy}
                    onClick={() => void chooseVipCreator()}
                  >
                    {busy ? t.studio.wait : 'VIP Creator — 30 AZN'}
                  </button>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    disabled={busy}
                    onClick={() => setCreatorChoiceOpen(false)}
                  >
                    Bağla
                  </button>
                </div>
              </section>
            </div>
          ) : null}
          {notice ? <p role="status" className={styles.empty}>{notice}</p> : null}
          <div className={styles.tabs} role="tablist">
            {NAV_ICONS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
                onClick={() => setTab(item.id)}
              >
                {tabLabel[item.id]}
              </button>
            ))}
          </div>

          {tab === 'earn' ? (
            <div className={styles.grid}>
              <article className={`${styles.card} ${styles.span2}`}>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>{t.studio.earnTitle}</h2>
                  <p className={styles.cardMeta}>{USER_PLAN_LABELS[plan.userPlan]}</p>
                </div>
                {error ? <p className={styles.error}>{error}</p> : null}
                <p className={styles.empty}>{showAds ? t.studio.adsHint : t.studio.vipHint}</p>
                <ul className={styles.earnList}>
                  <li>{t.studio.planFree}</li>
                  <li>{t.studio.planPro}</li>
                  <li>{t.studio.planVip}</li>
                </ul>
                {creatorAccess ? (
                  <p className={styles.empty} style={{ marginTop: 12 }}>
                    {plan.isVipLifetime
                      ? `${t.studio.toolsOpen} ${manat.toLocaleString('az-AZ')} ₼`
                      : plan.userPlan === 'VIP_PRO'
                        ? `${t.studio.creatorActiveUntil} ${new Date(plan.creatorPanelExpiresAt).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' })}`
                        : 'Adi Creator paneli pulsuz və aktivdir.'}
                  </p>
                ) : null}
                {!plan.isVipLifetime ? (
                  <button
                    type="button"
                    className={styles.buyBtn}
                    disabled={busy}
                    onClick={() => void run(() => purchaseVipProPlan(userId), 'VIP Creator paneli aktivləşdirildi. 30 AZN balansınızdan çıxıldı.')}
                  >
                    {busy ? t.studio.wait : `${VIP_PRO_PRICE_AZN} ${t.studio.buyVip}`}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.ghostBtn}
                  disabled={busy}
                  onClick={() => void run(() => setProPanelActive(userId, !plan.proPanelActive))}
                >
                  {plan.proPanelActive ? t.studio.socialOn : t.studio.socialOff}
                </button>
              </article>
            </div>
          ) : (
            creatorAccess ? (
              <ChannelDashboard data={data} analyticsOpen={analyticsOpen} creatorAccess={creatorAccess} tab={tab} />
            ) : (
              <div className={styles.grid}><article className={`${styles.card} ${styles.span2}`}><p className={styles.lockHint}>{t.studio.lock}</p></article></div>
            )
          )}
        </main>
      </div>
      <AppBottomNav activeTab="profile" />
    </div>
  );
}


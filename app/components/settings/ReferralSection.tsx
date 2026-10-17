"use client";

import React, { useEffect, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { callSecureFunction, getFirebaseInstallationId } from '@/app/lib/secureFunctions';

interface ReferralSectionProps {
  className?: string;
}

export default function ReferralSection({ className }: ReferralSectionProps) {
  const { userId } = useUser();
  const [myReferralCode, setMyReferralCode] = useState<string>('');
  const [referralCodeLoading, setReferralCodeLoading] = useState(false);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [applyCode, setApplyCode] = useState('');
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyMessage, setApplyMessage] = useState('');

  const loadMyReferralCode = async () => {
    if (!userId || userId === 'anonim_user_id') return;
    setReferralCodeLoading(true);
    try {
      const installationId = await getFirebaseInstallationId();
      const result = await callSecureFunction<
        { userId: string; installationId: string },
        { code: string }
      >('getMyReferralCode', { userId, installationId });
      setMyReferralCode(result.code);
      void loadMyReferrals();
    } catch (err) {
      console.error('Referral code load error:', err);
    } finally {
      setReferralCodeLoading(false);
    }
  };

  const loadMyReferrals = async () => {
    if (!userId || userId === 'anonim_user_id') return;
    setReferralsLoading(true);
    try {
      const result = await callSecureFunction<
        { userId: string },
        { referrals: any[]; totalEarnings: number; activeCount: number; pendingCount: number; xpThreshold: number }
      >('getMyReferrals', { userId });
      setReferrals(result.referrals || []);
      setTotalEarnings(result.totalEarnings || 0);
      setActiveCount(result.activeCount || 0);
      setPendingCount(result.pendingCount || 0);
    } catch (err) {
      console.error('Referrals load error:', err);
    } finally {
      setReferralsLoading(false);
    }
  };

  const checkReferralActivation = async (referralId: string) => {
    try {
      const result = await callSecureFunction<
        { referralId: string },
        { status: string; rewardXp: number; alreadyActive?: boolean; notActive?: boolean; currentXp?: number; progressPercent?: number; xpThreshold?: number }
      >('checkReferralActivation', { referralId });
      if (result.status === 'active') {
        await loadMyReferrals();
      } else if (result.notActive) {
        alert(`Hələ aktiv deyil: ${result.currentXp}/${result.xpThreshold} XP (${result.progressPercent}%)`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Aktivləşdirmək mümkün olmadı.');
    }
  };

  const handleApplyReferralCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyCode.trim()) return;
    setApplyBusy(true);
    setApplyMessage('');
    try {
      const installationId = await getFirebaseInstallationId();
      const result = await callSecureFunction<
        { userId: string; code: string; installationId: string },
        { status: string; eligibleAt: number }
      >('applyReferral', { userId, code: applyCode, installationId });
      setApplyMessage(`Dəvət qeydə alındı: ${result.status}`);
      setApplyCode('');
      void loadMyReferrals();
    } catch (err) {
      setApplyMessage(err instanceof Error ? err.message : 'Dəvət kodu tətbiq edilmədi.');
    } finally {
      setApplyBusy(false);
    }
  };

  const copyReferralCode = async () => {
    if (!myReferralCode) return;
    try {
      await navigator.clipboard.writeText(myReferralCode);
      alert('Kodu kopyaladınız!');
    } catch {
      alert('Kopyalama mümkün olmadı.');
    }
  };

  const shareReferral = () => {
    if (!myReferralCode) return;
    const url = `${window.location.origin}/register?ref=${myReferralCode}`;
    if (navigator.share) {
      navigator.share({ title: 'Dəvət edildiniz!', text: `Mənə qoşulun və öz kodu ilə qeydiyyatdan keçin: ${myReferralCode}`, url });
    } else {
      navigator.clipboard.writeText(url).then(() => alert('Link kopyalandı!'));
    }
  };

  useEffect(() => {
    if (userId && userId !== 'anonim_user_id') {
      loadMyReferralCode();
    }
  }, [userId]);

  if (!userId || userId === 'anonim_user_id') {
    return null;
  }

  return (
    <section className={className} style={{ marginBottom: 20 }}>
      {/* Referral Header & Code */}
      <section style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: 20, padding: 0, overflow: 'hidden', border: 'none' }}>
        <div style={{ padding: '20px 24px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.2)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🎁</div>
            <div>
              <h2 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: 0.5 }}>Dəvət Sistemi</h2>
              <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>Dostlarınızı dəvət edin və onlar 6500 XP qazandıqda pul qazanın</p>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 18, marginBottom: 16, border: '1px solid rgba(255,255,255,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Sizin Dəvət Kodunuz</span>
              {myReferralCode ? (
                <button type="button" onClick={copyReferralCode} style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Kopyala
                </button>
              ) : (
                <button type="button" onClick={loadMyReferralCode} disabled={referralCodeLoading} style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: referralCodeLoading ? 'default' : 'pointer', opacity: referralCodeLoading ? 0.7 : 1 }}>
                  {referralCodeLoading ? 'Gözləyin…' : 'Göstər'}
                </button>
              )}
            </div>
            {myReferralCode ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff', borderRadius: 10, padding: '10px 14px', fontSize: 18, fontWeight: 800, letterSpacing: 2, color: '#1a1a1a', fontFamily: 'monospace' }}>
                {myReferralCode}
                <span style={{ color: '#667eea', fontWeight: 800 }}>✓</span>
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontStyle: 'italic' }}>Dəvət kodu hazırlanıyor…</div>
            )}
          </div>

          <button type="button" onClick={shareReferral} disabled={!myReferralCode} style={{ width: '100%', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: !myReferralCode ? 'not-allowed' : 'pointer', marginBottom: 16 }}>
            {myReferralCode ? 'Dəvət Linkini Paylaş / Kopyala' : 'Dəvət kodunu yükləyin'}
          </button>

          <div style={{ marginTop: 8 }}>
            <h3 style={{ margin: '0 0 10px', color: '#fff', fontSize: 14, fontWeight: 800 }}>Başkasının Dəvət Kodunu Tətbiq Edin</h3>
            <form onSubmit={handleApplyReferralCode} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={applyCode}
                onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
                placeholder="Dəvət kodu daxil edin"
                maxLength={20}
                disabled={applyBusy}
                style={{ flex: 1, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '10px 14px', borderRadius: 10, fontSize: 14 }}
              />
              <button type="submit" disabled={applyBusy || !applyCode.trim()} style={{ background: applyBusy || !applyCode.trim() ? 'rgba(255,255,255,0.2)' : '#34d399', border: 'none', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: applyBusy || !applyCode.trim() ? 'not-allowed' : 'pointer' }}>
                {applyBusy ? 'Gözləyin…' : 'Tətbiq et'}
              </button>
            </form>
            {applyMessage ? <p style={{ margin: '8px 0 0', color: '#fbbf24', fontSize: 12, fontWeight: 600 }}>{applyMessage}</p> : null}
          </div>
        </div>
      </section>
      {/* Earnings & List */}
      <section style={{ borderRadius: 20, padding: 0, overflow: 'hidden', marginBottom: 20, border: '1px solid rgba(34,197,94,0.15)', background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)' }}>
        <div style={{ padding: '20px 24px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <h2 style={{ margin: 0, color: '#0f172a', fontSize: 18, fontWeight: 800, letterSpacing: 0.5 }}>Dəvətlərdən Gəlir</h2>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Yalnız aktiv (6500 XP bölgəsində çatmış) dəvətlərdən gəlir göstərilir</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#15803d', lineHeight: 1 }}>{totalEarnings.toLocaleString('az-AZ')}</div>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12 }}>Cəmi aktiv gəlir</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
            <div style={{ flex: 1, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#15803d', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>{activeCount}</div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Aktiv</div>
            </div>
            <div style={{ flex: 1, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#b45309', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>{pendingCount}</div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Gözləyir</div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Dəvət Edilmiş İstifadəçilər</h3>
            {referralsLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Yüklənir…</div>
            ) : referrals.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🤝</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>Hələ heç kəsin dəvət edilməyib</div>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#94a3b8' }}>Dəvət kodunuzu paylaşaraq istifadəçiləri dəvət edin</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {referrals.map((ref) => (
                  <div key={ref.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, border: `1px solid ${ref.isActive ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`, background: ref.isActive ? 'rgba(34,197,94,0.05)' : 'rgba(245,158,11,0.05)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: ref.isActive ? '#15803d' : '#b45309' }}>{ref.isActive ? '✓ Aktiv' : '⏳ Gözləyir'}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginLeft: 'auto' }}>{ref.createdAtMillis ? new Date(ref.createdAtMillis).toLocaleDateString('az-AZ') : ''}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>İstifadəçi #{ref.referredPlayerId}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>Kod: {ref.code}</div>
                      <div style={{ width: '100%', height: 6, background: 'rgba(0,0,0,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                        <div style={{ width: Math.min(ref.progressPercent || 0, 100), height: '100%', background: ref.isActive ? '#22c55e' : '#f59e0b', borderRadius: 3, transition: 'width 0.5s ease' }}></div>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{ref.referredXp || 0} / 6500 XP</span>
                        <span>{ref.isActive ? ref.rewardEarned + ' XP qazandınız' : '6500 XP-\\ə qədər aktiv olmaq lazımdır'}</span>
                      </div>
                    </div>
                    {!ref.isActive && (
                      <button
                        type="button"
                        onClick={() => checkReferralActivation(ref.id)}
                        disabled={referralsLoading}
                        style={{ background: '#f59e0b', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: referralsLoading ? 'default' : 'pointer', opacity: referralsLoading ? 0.6 : 1 }}
                      >
                        {referralsLoading ? '…' : 'Aktivləşdir'}
                      </button>
                    )}
                    {ref.isActive && (
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#15803d' }}>{ref.rewardEarned} XP qazandınız</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}

"use client";



import React, { useCallback, useEffect, useState } from 'react';

import {

  listAllUsers,

  listenReports,

  listenPrivateMessages,

  listenAllianceChat,

  listenAdminCommands,

  listenSuperAdminAccess,

  resolveReport,

  punishUser,

  banUser,

  deleteUserAccount,

  grantModerator,

  grantManatToUser,

  bootstrapAdminPanel,

  setAdminPanelSession,

  listPendingPostReviews,

  getPendingPostMediaGroup,

  decidePendingPostReview,

  AdminUserRow,

  AdminReportRow,

  AdminMessageRow,

  AdminCommandRow,

  PendingPostReview,

} from '@/app/lib/adminService';

import {

  SUPER_ADMIN_ID,

  unlockAdminSession,

  lockAdminSession,

  isAdminSessionUnlocked,

} from '@/app/lib/adminConfig';

import styles from '../social/social.module.css';
import { callSecureFunction } from '@/app/lib/secureFunctions';

type WithdrawalReview = {
  id: string;
  playerId: string;
  amount: number;
  paymentEmail: string;
  legalName: string;
  status: 'pending_review' | 'approved';
  createdAtMillis: number;
  availableAt: number;
  riskFlags: string[];
};

type ReferralReview = {
  id: string;
  inviterPlayerId: string;
  referredPlayerId: string;
  rewardXp: number;
  status: 'pending_review';
  createdAtMillis: number;
  eligibleAt: number;
  riskFlags: string[];
};

type SecurityReview =
  | ({ kind: 'withdrawal' } & WithdrawalReview)
  | ({ kind: 'referral' } & ReferralReview);



interface AdminPanelProps {

  userId: string;

  displayName: string;

}



export default function AdminPanel({ userId, displayName }: AdminPanelProps) {

  const [showGate, setShowGate] = useState(false);

  const [unlocked, setUnlocked] = useState(false);

  const [firebaseAllowed, setFirebaseAllowed] = useState(false);

  const [code, setCode] = useState('');

  const [tab, setTab] = useState<'users' | 'reports' | 'messages' | 'chat' | 'commands' | 'security' | 'posts'>('users');

  const [users, setUsers] = useState<AdminUserRow[]>([]);

  const [reports, setReports] = useState<AdminReportRow[]>([]);

  const [messages, setMessages] = useState<AdminMessageRow[]>([]);

  const [commands, setCommands] = useState<AdminCommandRow[]>([]);

  const [allianceChat, setAllianceChat] = useState<{ id: string; user: string; text: string; createdAt: number }[]>([]);

  const [grantAmounts, setGrantAmounts] = useState<Record<string, string>>({});
  const [securityReviews, setSecurityReviews] = useState<SecurityReview[]>([]);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState('');
  const [securityBusyId, setSecurityBusyId] = useState('');
  const [pendingPostReviews, setPendingPostReviews] = useState<PendingPostReview[]>([]);
  const [pendingPostReviewLoading, setPendingPostReviewLoading] = useState(false);
  const [pendingPostReviewError, setPendingPostReviewError] = useState('');
  const [pendingPostReviewBusyId, setPendingPostReviewBusyId] = useState('');
  const [pendingPostPreview, setPendingPostPreview] = useState<{
    id: string;
    url: string;
    mediaType: 'image' | 'video';
  } | null>(null);



  const isSuper = userId === SUPER_ADMIN_ID;

  const refreshSecurityReviews = useCallback(async () => {
    setSecurityLoading(true);
    setSecurityError('');
    try {
      const [withdrawals, referrals] = await Promise.all([
        callSecureFunction<{ kind: 'withdrawals' }, WithdrawalReview[]>(
          'listSecurityReviews',
          { kind: 'withdrawals' }
        ),
        callSecureFunction<{ kind: 'referrals' }, ReferralReview[]>(
          'listSecurityReviews',
          { kind: 'referrals' }
        ),
      ]);
      setSecurityReviews([
        ...withdrawals.map((item) => ({ ...item, kind: 'withdrawal' as const })),
        ...referrals.map((item) => ({ ...item, kind: 'referral' as const })),
      ].sort((a, b) => b.createdAtMillis - a.createdAtMillis));
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Yoxlama növbəsi yüklənmədi.');
    } finally {
      setSecurityLoading(false);
    }
  }, []);

  const refreshPendingPostReviews = useCallback(async () => {
    setPendingPostReviewLoading(true);
    setPendingPostReviewError('');
    try {
      setPendingPostReviews(await listPendingPostReviews());
    } catch (error) {
      setPendingPostReviewError(error instanceof Error ? error.message : 'Gözləyən paylaşımlar yüklənmədi.');
    } finally {
      setPendingPostReviewLoading(false);
    }
  }, []);

  const openPendingPostPreview = async (post: PendingPostReview) => {
    if (!post.chunkCount || post.chunkCount > 64) {
      setPendingPostReviewError('Media natamamdır, paylaşımı təsdiqləmək mümkün deyil.');
      return;
    }
    setPendingPostReviewBusyId(post.id);
    setPendingPostReviewError('');
    try {
      const parts: Uint8Array[] = [];
      let contentType = '';
      for (let startIndex = 0; startIndex < post.chunkCount; startIndex += 4) {
        const group = await getPendingPostMediaGroup(
          post.id,
          startIndex,
          Math.min(4, post.chunkCount - startIndex),
        );
        if (!contentType) contentType = group.contentType;
        if (contentType !== group.contentType) throw new Error('Media hissələrinin formatı uyğun gəlmir.');
        group.chunks.forEach((chunk) => {
          const binary = atob(chunk.data);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
          parts.push(bytes);
        });
      }
      if (parts.length !== post.chunkCount || !contentType) throw new Error('Media faylı tam yüklənmədi.');
      setPendingPostPreview({
        id: post.id,
        url: URL.createObjectURL(new Blob(parts, { type: contentType })),
        mediaType: post.mediaType,
      });
    } catch (error) {
      setPendingPostReviewError(error instanceof Error ? error.message : 'Media önizləməsi açıla bilmədi.');
    } finally {
      setPendingPostReviewBusyId('');
    }
  };

  const decidePostReview = async (post: PendingPostReview, decision: 'approve' | 'reject') => {
    if (decision === 'approve' && pendingPostPreview?.id !== post.id) {
      setPendingPostReviewError('Əvvəl paylaşımı önizləyib yoxlayın.');
      return;
    }
    if (decision === 'reject' && !confirm('Bu paylaşımı rədd etmək istəyirsiniz?')) return;
    setPendingPostReviewBusyId(post.id);
    setPendingPostReviewError('');
    try {
      await decidePendingPostReview(post.id, decision);
      setPendingPostPreview((current) => current?.id === post.id ? null : current);
      setPendingPostReviews((current) => current.filter((item) => item.id !== post.id));
    } catch (error) {
      setPendingPostReviewError(error instanceof Error ? error.message : 'Qərar saxlanmadı.');
    } finally {
      setPendingPostReviewBusyId('');
    }
  };

  const reviewSecurityItem = async (item: SecurityReview, decision: 'approve' | 'reject' | 'paid') => {
    setSecurityBusyId(item.id);
    setSecurityError('');
    try {
      if (item.kind === 'withdrawal') {
        await callSecureFunction(
          'reviewWithdrawal',
          { requestId: item.id, decision: decision as 'approve' | 'reject' | 'paid' }
        );
      } else {
        await callSecureFunction('reviewReferral', {
          referralId: item.id,
          decision: decision === 'approve' ? 'approve' : 'reject',
        });
      }
      await refreshSecurityReviews();
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Yoxlama qərarı saxlanmadı.');
    } finally {
      setSecurityBusyId('');
    }
  };



  useEffect(() => {

    if (!isSuper) {

      lockAdminSession();

      setUnlocked(false);

      setShowGate(false);

      setFirebaseAllowed(false);

      return;

    }

    return listenSuperAdminAccess(userId, setFirebaseAllowed);

  }, [isSuper, userId]);



  useEffect(() => {

    if (!isSuper || !firebaseAllowed) {

      setUnlocked(false);

      return;

    }

    setUnlocked(isAdminSessionUnlocked());

  }, [isSuper, firebaseAllowed]);



  useEffect(() => {

    if (!unlocked) return;

    void listAllUsers().then(setUsers);

    const u1 = listenReports(setReports);

    const u2 = listenPrivateMessages(setMessages);

    const u3 = listenAllianceChat(setAllianceChat);

    const u4 = listenAdminCommands(setCommands);

    return () => { u1(); u2(); u3(); u4(); };

  }, [unlocked]);

  useEffect(() => {
    if (!unlocked || tab !== 'security') return;
    void refreshSecurityReviews();
  }, [unlocked, tab, refreshSecurityReviews]);

  useEffect(() => {
    if (!unlocked || tab !== 'posts') return;
    void refreshPendingPostReviews();
  }, [unlocked, tab, refreshPendingPostReviews]);

  useEffect(() => () => {
    if (pendingPostPreview?.url) URL.revokeObjectURL(pendingPostPreview.url);
  }, [pendingPostPreview]);



  const handleUnlock = async () => {

    if (!isSuper || !firebaseAllowed) return;

    if (!unlockAdminSession(code)) {

      alert('Yanlış kod');

      return;

    }

    try {

      await bootstrapAdminPanel(displayName);

      setUnlocked(true);

      setShowGate(false);

      setCode('');

    } catch (err) {

      console.error(err);

      alert(err instanceof Error ? err.message : 'Admin girişi uğursuz oldu.');

    }

  };



  const handleLogout = () => {

    void setAdminPanelSession(displayName, false).catch((error) => console.warn('Admin çıxış qeydi saxlanmadı:', error));

    lockAdminSession();

    setUnlocked(false);

    setShowGate(false);

  };



  const handleGrantManat = async (targetUserId: string) => {

    const raw = grantAmounts[targetUserId]?.trim();

    const amount = Math.floor(Number(raw));

    if (!raw || !Number.isFinite(amount) || amount <= 0) {

      alert('Düzgün manat miqdarı daxil edin');

      return;

    }



    try {

      const result = await grantManatToUser(userId, targetUserId, amount);

      alert(

        `#${targetUserId} · +${amount.toLocaleString('az-AZ')} ₼ verildi\nYeni balans: ${result.newBalance.toLocaleString('az-AZ')} ₼`

      );

      setGrantAmounts((prev) => ({ ...prev, [targetUserId]: '' }));

      const refreshed = await listAllUsers();

      setUsers(refreshed);

    } catch (err) {

      console.error(err);

      alert(err instanceof Error ? err.message : 'Manat verilmədi');

    }

  };



  if (!isSuper || !firebaseAllowed) return null;



  if (!unlocked) {

    if (!showGate) {

      return (

        <button

          type="button"

          onClick={() => setShowGate(true)}

          style={{

            margin: '8px 20px',

            background: 'none',

            border: 'none',

            color: '#64748b',

            fontSize: 10,

            cursor: 'pointer',

            textDecoration: 'underline',

          }}

        >

          🔐 Admin

        </button>

      );

    }

    return (

      <div style={{ margin: '16px 20px', padding: 16, borderRadius: 16, background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)' }}>

        <div style={{ fontWeight: 900, marginBottom: 8 }}>🔐 Admin Panel</div>

        <input

          className={styles.input}

          type="password"

          placeholder="Admin kodu..."

          value={code}

          onChange={(e) => setCode(e.target.value)}

        />

        <button type="button" className={styles.dangerBtn} onClick={() => void handleUnlock()}>Daxil ol</button>

      </div>

    );

  }



  return (

    <div style={{ margin: '16px 20px 100px', padding: 16, borderRadius: 16, background: 'rgba(15,23,42,0.9)', border: '2px solid #6366f1' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>

        <div style={{ fontWeight: 900, color: '#a5b4fc' }}>👑 Admin Panel (ID: {SUPER_ADMIN_ID})</div>

        <button type="button" className={styles.secondaryBtn} style={{ width: 'auto', padding: '6px 12px', margin: 0 }} onClick={handleLogout}>Çıx</button>

      </div>



      <div className={styles.tabRow} style={{ padding: 0, marginBottom: 12 }}>

        {(['users', 'reports', 'messages', 'chat', 'commands', 'security', 'posts'] as const).map((t) => (

          <button key={t} type="button" aria-label={t === 'posts' ? 'Paylaşımları yoxla' : `Admin ${t}`}
            className={`${styles.tabPill} ${tab === t ? styles.tabPillActive : ''}`} onClick={() => setTab(t)}>

            {t === 'users' ? '👥' : t === 'reports' ? '⚠️' : t === 'messages' ? '💬' : t === 'chat' ? '🏰' : t === 'security' ? '🛡️' : t === 'posts' ? '📝' : '📋'}

          </button>

        ))}

      </div>



      {tab === 'users' && (

        <div style={{ maxHeight: 320, overflowY: 'auto' }}>

          {users.map((u) => (

            <div key={u.id} style={{ padding: 10, borderBottom: '1px solid rgba(148,163,184,0.2)', fontSize: 12 }}>

              <strong>#{u.id}</strong> {u.name} {u.handle}

              <span style={{ color: '#fbbf24' }}> · ₼{(u.manat ?? 0).toLocaleString('az-AZ')}</span>

              {u.banned && <span style={{ color: '#f87171' }}> · BAN</span>}
              {u.frozen && <span style={{ color: '#fbbf24' }}> · DONDURULUB</span>}

              {u.isModerator && <span style={{ color: '#34d399' }}> · MOD</span>}

              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>

                <input

                  type="number"

                  min={1}

                  placeholder="₼ miqdar"

                  value={grantAmounts[u.id] ?? ''}

                  onChange={(e) => setGrantAmounts((prev) => ({ ...prev, [u.id]: e.target.value }))}

                  style={{

                    width: 88,

                    padding: '4px 6px',

                    fontSize: 10,

                    borderRadius: 8,

                    border: '1px solid rgba(148,163,184,0.35)',

                    background: 'rgba(15,23,42,0.8)',

                    color: '#e2e8f0',

                  }}

                />

                <button type="button" className={styles.primaryBtn} style={{ width: 'auto', padding: '4px 8px', fontSize: 10, margin: 0 }} onClick={() => void handleGrantManat(u.id)}>

                  Manat ver

                </button>

                <button type="button" className={styles.secondaryBtn} style={{ width: 'auto', padding: '4px 8px', fontSize: 10, margin: 0 }} onClick={() => void banUser(userId, u.id, !u.banned).then(() => listAllUsers().then(setUsers))}>

                  {u.banned ? 'Ban aç' : 'Ban'}

                </button>

                <button type="button" className={styles.secondaryBtn} style={{ width: 'auto', padding: '4px 8px', fontSize: 10, margin: 0 }} onClick={() => void punishUser(userId, u.id, 7, 'Admin cəzası').then(() => alert('7 gün cəzalandırıldı'))}>

                  7g cəza

                </button>

                <button type="button" className={styles.secondaryBtn} style={{ width: 'auto', padding: '4px 8px', fontSize: 10, margin: 0 }} onClick={() => void grantModerator(userId, u.id, !u.isModerator).then(() => listAllUsers().then(setUsers))}>

                  {u.isModerator ? 'Mod sil' : 'Mod ver'}

                </button>

                {u.id !== SUPER_ADMIN_ID && (

                  <button type="button" className={styles.dangerBtn} style={{ width: 'auto', padding: '4px 8px', fontSize: 10, margin: 0 }} onClick={() => { if (confirm('Silinsin?')) void deleteUserAccount(userId, u.id).then(() => listAllUsers().then(setUsers)); }}>

                    Sil

                  </button>

                )}

              </div>

            </div>

          ))}

        </div>

      )}



      {tab === 'reports' && (

        <div style={{ maxHeight: 320, overflowY: 'auto', fontSize: 11 }}>

          {reports.length === 0 ? (

            <div style={{ color: '#94a3b8', padding: 12 }}>Şikayət yoxdur.</div>

          ) : (

            reports.map((r) => (

              <div key={r.id} style={{ padding: 10, borderBottom: '1px solid rgba(148,163,184,0.2)' }}>

                <div><strong>{r.type}</strong> · {r.status}</div>

                <div>#{r.reporterId} → #{r.targetUserId}{r.targetPostId ? ` · post:${r.targetPostId.slice(0, 8)}…` : ''}</div>

                <div style={{ color: '#cbd5e1', marginTop: 4 }}>{r.reason}</div>

                {r.status === 'pending' && (

                  <button type="button" className={styles.primaryBtn} style={{ marginTop: 6, fontSize: 10 }} onClick={() => void resolveReport(userId, r.id, 'resolved')}>

                    Həll et

                  </button>

                )}

              </div>

            ))

          )}

        </div>

      )}

      {tab === 'posts' && (
        <div style={{ maxHeight: 420, overflowY: 'auto', fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <strong>Gözləyən paylaşımlar ({pendingPostReviews.length})</strong>
            <button type="button" className={styles.secondaryBtn} style={{ width: 'auto', padding: '5px 9px', margin: 0 }}
              onClick={() => void refreshPendingPostReviews()} disabled={pendingPostReviewLoading}>
              {pendingPostReviewLoading ? 'Yüklənir…' : 'Yenilə'}
            </button>
          </div>
          <p style={{ color: '#94a3b8', margin: '0 0 10px' }}>
            Spark planında avtomatik media skanı yoxdur. Faylı önizləyib əl ilə təsdiqləyin və ya rədd edin.
          </p>
          {pendingPostReviewError && <p style={{ color: '#f87171', margin: '8px 0' }}>{pendingPostReviewError}</p>}
          {pendingPostPreview && (
            <div style={{ margin: '8px 0 12px', padding: 8, borderRadius: 10, background: 'rgba(2,6,23,.75)' }}>
              {pendingPostPreview.mediaType === 'video'
                ? <video src={pendingPostPreview.url} controls playsInline style={{ width: '100%', maxHeight: 280, objectFit: 'contain' }} />
                : <img src={pendingPostPreview.url} alt="Yoxlanılan paylaşım" style={{ display: 'block', width: '100%', maxHeight: 280, objectFit: 'contain' }} />}
            </div>
          )}
          {!pendingPostReviewLoading && pendingPostReviews.length === 0 && !pendingPostReviewError && (
            <div style={{ color: '#94a3b8', padding: 12 }}>Gözləyən paylaşım yoxdur.</div>
          )}
          {pendingPostReviews.map((post) => (
            <div key={post.id} style={{ padding: 10, borderBottom: '1px solid rgba(148,163,184,.2)' }}>
              <div><strong>{post.title || 'Başlıqsız paylaşım'}</strong> · {post.mediaType === 'video' ? 'Video' : 'Şəkil'}</div>
              <div style={{ color: '#94a3b8', marginTop: 3 }}>#{post.userId} · {post.userName} · {new Date(post.createdAt).toLocaleString('az-AZ')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                <button type="button" className={styles.secondaryBtn} style={{ width: 'auto', padding: '5px 8px', margin: 0 }}
                  onClick={() => void openPendingPostPreview(post)} disabled={pendingPostReviewBusyId === post.id || !post.chunkCount}>
                  {pendingPostReviewBusyId === post.id ? 'Yüklənir…' : 'Önizlə'}
                </button>
                <button type="button" className={styles.primaryBtn} style={{ width: 'auto', padding: '5px 8px', margin: 0 }}
                  onClick={() => void decidePostReview(post, 'approve')}
                  disabled={pendingPostReviewBusyId === post.id || pendingPostPreview?.id !== post.id}>
                  Təsdiqlə
                </button>
                <button type="button" className={styles.dangerBtn} style={{ width: 'auto', padding: '5px 8px', margin: 0 }}
                  onClick={() => void decidePostReview(post, 'reject')} disabled={pendingPostReviewBusyId === post.id}>
                  Rədd et
                </button>
              </div>
            </div>
          ))}
        </div>
      )}



      {tab === 'messages' && (

        <div style={{ maxHeight: 320, overflowY: 'auto', fontSize: 11 }}>

          {messages.map((m) => (

            <div key={m.id} style={{ padding: 8, borderBottom: '1px solid rgba(148,163,184,0.15)' }}>

              <strong>{m.senderId}</strong> → {m.recipientId}: {m.text}

            </div>

          ))}

        </div>

      )}



      {tab === 'chat' && (

        <div style={{ maxHeight: 320, overflowY: 'auto', fontSize: 11 }}>

          {allianceChat.map((m) => (

            <div key={m.id} style={{ padding: 8, borderBottom: '1px solid rgba(148,163,184,0.15)' }}>

              <strong>{m.user}</strong>: {m.text}

            </div>

          ))}

        </div>

      )}



      {tab === 'commands' && (

        <div style={{ maxHeight: 320, overflowY: 'auto', fontSize: 11 }}>

          {commands.length === 0 ? (

            <div style={{ color: '#94a3b8', padding: 12 }}>Admin əmri yoxdur.</div>

          ) : (

            commands.map((c) => (

              <div key={c.id} style={{ padding: 8, borderBottom: '1px solid rgba(148,163,184,0.15)' }}>

                <strong>{c.action}</strong>

                {c.targetUserId ? ` · #${c.targetUserId}` : ''}

                {c.targetReportId ? ` · report:${c.targetReportId.slice(0, 8)}…` : ''}

                <div style={{ color: '#94a3b8', marginTop: 2 }}>

                  {new Date(c.createdAt).toLocaleString('az-AZ')}

                </div>

              </div>

            ))

          )}

        </div>

      )}

      {tab === 'security' && (
        <div style={{ maxHeight: 360, overflowY: 'auto', fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Çıxarış və referral yoxlaması</strong>
            <button type="button" className={styles.secondaryBtn} style={{ width: 'auto', padding: '5px 9px', margin: 0 }} disabled={securityLoading} onClick={() => void refreshSecurityReviews()}>
              Yenilə
            </button>
          </div>
          {securityError ? <div role="alert" style={{ color: '#fca5a5', padding: 8 }}>{securityError}</div> : null}
          {securityLoading && securityReviews.length === 0 ? <div style={{ color: '#94a3b8', padding: 12 }}>Yüklənir…</div> : null}
          {!securityLoading && securityReviews.length === 0 && !securityError ? <div style={{ color: '#94a3b8', padding: 12 }}>Yoxlama gözləyən sorğu yoxdur.</div> : null}
          {securityReviews.map((item) => (
            <div key={`${item.kind}_${item.id}`} style={{ padding: 10, marginBottom: 8, borderRadius: 12, border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(15,23,42,0.55)' }}>
              {item.kind === 'withdrawal' ? (
                <>
                  <strong>Çıxarış · #{item.playerId} · {item.amount} AZN</strong>
                  <div>{item.legalName} · {item.paymentEmail}</div>
                  <div style={{ color: '#94a3b8', marginTop: 3 }}>Status: {item.status} · {new Date(item.createdAtMillis).toLocaleString('az-AZ')}</div>
                  {item.riskFlags.length ? <div style={{ color: '#fbbf24', marginTop: 3 }}>Risk: {item.riskFlags.join(', ')}</div> : null}
                  <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                    {item.status === 'pending_review' ? (
                      <button type="button" className={styles.primaryBtn} disabled={securityBusyId === item.id || Date.now() < item.availableAt} title={Date.now() < item.availableAt ? '48 saatlıq gözləmə davam edir' : undefined} onClick={() => void reviewSecurityItem(item, 'approve')}>Təsdiqlə</button>
                    ) : (
                      <button type="button" className={styles.primaryBtn} disabled={securityBusyId === item.id} onClick={() => void reviewSecurityItem(item, 'paid')}>Ödənildi</button>
                    )}
                    <button type="button" className={styles.dangerBtn} disabled={securityBusyId === item.id} onClick={() => void reviewSecurityItem(item, 'reject')}>Rədd et və qaytar</button>
                  </div>
                </>
              ) : (
                <>
                  <strong>Referral · #{item.inviterPlayerId} dəvət etdi #{item.referredPlayerId}</strong>
                  <div>{item.rewardXp.toLocaleString('az-AZ')} XP · {new Date(item.createdAtMillis).toLocaleString('az-AZ')}</div>
                  {item.riskFlags.length ? <div style={{ color: '#fbbf24', marginTop: 3 }}>Risk: {item.riskFlags.join(', ')}</div> : null}
                  <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                    <button type="button" className={styles.primaryBtn} disabled={securityBusyId === item.id || Date.now() < item.eligibleAt} title={Date.now() < item.eligibleAt ? '7 günlük gözləmə davam edir' : undefined} onClick={() => void reviewSecurityItem(item, 'approve')}>Təsdiqlə</button>
                    <button type="button" className={styles.dangerBtn} disabled={securityBusyId === item.id} onClick={() => void reviewSecurityItem(item, 'reject')}>Rədd et</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

    </div>

  );

}


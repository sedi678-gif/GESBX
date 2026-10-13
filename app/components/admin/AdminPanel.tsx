"use client";



import React, { useEffect, useState } from 'react';

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

  bootstrapSuperAdmin,

  recordAdminSession,

  AdminUserRow,

  AdminReportRow,

  AdminMessageRow,

  AdminCommandRow,

} from '@/app/lib/adminService';

import {

  SUPER_ADMIN_ID,

  unlockAdminSession,

  lockAdminSession,

  isAdminSessionUnlocked,

} from '@/app/lib/adminConfig';

import styles from '../social/social.module.css';



interface AdminPanelProps {

  userId: string;

  displayName: string;

}



export default function AdminPanel({ userId, displayName }: AdminPanelProps) {

  const [showGate, setShowGate] = useState(false);

  const [unlocked, setUnlocked] = useState(false);

  const [firebaseAllowed, setFirebaseAllowed] = useState(false);

  const [code, setCode] = useState('');

  const [tab, setTab] = useState<'users' | 'reports' | 'messages' | 'chat' | 'commands'>('users');

  const [users, setUsers] = useState<AdminUserRow[]>([]);

  const [reports, setReports] = useState<AdminReportRow[]>([]);

  const [messages, setMessages] = useState<AdminMessageRow[]>([]);

  const [commands, setCommands] = useState<AdminCommandRow[]>([]);

  const [allianceChat, setAllianceChat] = useState<{ id: string; user: string; text: string; createdAt: number }[]>([]);

  const [grantAmounts, setGrantAmounts] = useState<Record<string, string>>({});



  const isSuper = userId === SUPER_ADMIN_ID;



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



  const handleUnlock = async () => {

    if (!isSuper || !firebaseAllowed) return;

    if (!unlockAdminSession(code)) {

      alert('Yanlış kod');

      return;

    }

    try {

      await bootstrapSuperAdmin(displayName);

      await recordAdminSession(userId, displayName, true);

      setUnlocked(true);

      setShowGate(false);

      setCode('');

    } catch (err) {

      console.error(err);

      alert('Admin girişi uğursuz oldu.');

    }

  };



  const handleLogout = () => {

    void recordAdminSession(userId, displayName, false);

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

        {(['users', 'reports', 'messages', 'chat', 'commands'] as const).map((t) => (

          <button key={t} type="button" className={`${styles.tabPill} ${tab === t ? styles.tabPillActive : ''}`} onClick={() => setTab(t)}>

            {t === 'users' ? '👥' : t === 'reports' ? '⚠️' : t === 'messages' ? '💬' : t === 'chat' ? '🏰' : '📋'}

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

    </div>

  );

}


"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLink from '@/app/components/AppLink';
import AppBottomNav from '@/app/components/AppBottomNav';
import { useSettings } from '@/context/SettingsContext';
import { useUser } from '@/context/UserContext';
import { getSettingsStrings } from '@/app/lib/settingsI18n';
import { submitFeedback, submitSupportRequest } from '@/app/lib/settingsService';
import { AppLanguage } from '@/app/lib/settingsTypes';
import { SUPER_ADMIN_ID } from '@/app/lib/adminConfig';
import {
  deleteOwnAccount,
  freezeOwnAccount,
  isRealAccountId,
  listenAccountStatus,
  unfreezeOwnAccount,
} from '@/app/lib/accountLifecycleService';
import StudioSnapshot from '@/app/components/dashboard/StudioSnapshot';
import styles from '../social/social.module.css';

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className={styles.settingsRow}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function SettingsPageClient() {
  const { settings, language, setLanguage, updateSettings } = useSettings();
  const { userId } = useUser();
  const router = useRouter();
  const t = getSettingsStrings(language);

  const [toast, setToast] = useState('');
  const [feedback, setFeedback] = useState('');
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [frozen, setFrozen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'freeze' | 'delete' | null>(null);
  const [deleteWord, setDeleteWord] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const canManageAccount = isRealAccountId(userId);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  useEffect(() => {
    if (!canManageAccount) {
      setFrozen(false);
      return;
    }
    return listenAccountStatus(userId, (status) => {
      setFrozen(status.frozen);
    });
  }, [canManageAccount, userId]);

  const closeConfirm = () => {
    if (accountBusy) return;
    setConfirmAction(null);
    setDeleteWord('');
  };

  const handleFreeze = async () => {
    setAccountBusy(true);
    try {
      await freezeOwnAccount(userId);
      setConfirmAction(null);
      notify(t.freezeDone);
    } catch {
      notify(t.accountActionError);
    } finally {
      setAccountBusy(false);
    }
  };

  const handleUnfreeze = async () => {
    setAccountBusy(true);
    try {
      await unfreezeOwnAccount(userId);
      notify(t.unfreezeDone);
    } catch {
      notify(t.accountActionError);
    } finally {
      setAccountBusy(false);
    }
  };

  const handleDelete = async () => {
    if (deleteWord.trim() !== t.deleteConfirmWord) return;
    if (String(userId).trim() === SUPER_ADMIN_ID) {
      notify(t.adminDeleteBlocked);
      return;
    }
    setAccountBusy(true);
    try {
      await deleteOwnAccount(userId);
      notify(t.deleteDone);
      router.replace('/login');
    } catch {
      notify(t.accountActionError);
      setAccountBusy(false);
    }
  };

  if (!settings) {
    return (
      <div className={styles.socialPage} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#94a3b8' }}>...</span>
      </div>
    );
  }

  const langs: { id: AppLanguage; label: string }[] = [
    { id: 'az', label: 'AZ' },
    { id: 'en', label: 'EN' },
    { id: 'ru', label: 'RU' },
    { id: 'tr', label: 'TR' },
  ];

  return (
    <div className={styles.socialPage}>
      <header className={styles.glassHeader}>
        <AppLink href="/profile" className={styles.iconBtn} style={{ textDecoration: 'none' }}>←</AppLink>
        <h1 className={styles.glassTitle}>⚙️ {t.title}</h1>
        <div style={{ width: 36 }} />
      </header>

      {toast && <div className={styles.settingsToast}>{toast}</div>}

      <div className={styles.settingsScroll}>
        <p className={styles.settingsSubtitle}>{t.subtitle}</p>

        <StudioSnapshot userId={userId} />

        <section className={styles.settingsSection}>
          <h2>🌐 {t.language}</h2>
          <div className={styles.langRow}>
            {langs.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`${styles.langBtn} ${language === l.id ? styles.langBtnActive : ''}`}
                onClick={() => setLanguage(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.settingsSection}>
          <h2>🔔 {t.notifications}</h2>
          <Toggle
            label={t.notifMessages}
            checked={settings.notifications.messages}
            onChange={(v) => void updateSettings({ notifications: { ...settings.notifications, messages: v } })}
          />
          <Toggle
            label={t.notifLikes}
            checked={settings.notifications.likes}
            onChange={(v) => void updateSettings({ notifications: { ...settings.notifications, likes: v } })}
          />
          <Toggle
            label={t.notifFollowers}
            checked={settings.notifications.followers}
            onChange={(v) => void updateSettings({ notifications: { ...settings.notifications, followers: v } })}
          />
          <Toggle
            label={t.notifAlliance}
            checked={settings.notifications.alliance}
            onChange={(v) => void updateSettings({ notifications: { ...settings.notifications, alliance: v } })}
          />
          <Toggle
            label={t.notifMarketing}
            checked={settings.notifications.marketing}
            onChange={(v) => void updateSettings({ notifications: { ...settings.notifications, marketing: v } })}
          />
        </section>

        <section className={styles.settingsSection}>
          <h2>🔒 {t.privacy}</h2>
          <Toggle
            label={t.profilePublic}
            checked={settings.privacy.profilePublic}
            onChange={(v) => void updateSettings({ privacy: { ...settings.privacy, profilePublic: v } })}
          />
          <Toggle
            label={t.showOnline}
            checked={settings.privacy.showOnlineStatus}
            onChange={(v) => void updateSettings({ privacy: { ...settings.privacy, showOnlineStatus: v } })}
          />
          <Toggle
            label={t.showActivity}
            checked={settings.privacy.showActivity}
            onChange={(v) => void updateSettings({ privacy: { ...settings.privacy, showActivity: v } })}
          />
          <label className={styles.settingsRow}>
            <span>{t.allowMessages}</span>
            <select
              className={styles.settingsSelect}
              value={settings.privacy.allowMessagesFrom}
              onChange={(e) =>
                void updateSettings({
                  privacy: {
                    ...settings.privacy,
                    allowMessagesFrom: e.target.value as 'everyone' | 'followers' | 'none',
                  },
                })              }
            >
              <option value="everyone">{t.everyone}</option>
              <option value="followers">{t.followersOnly}</option>
              <option value="none">{t.nobody}</option>
            </select>
          </label>
        </section>

        <section className={styles.settingsSection}>
          <h2>🎨 {t.appearance}</h2>
          <label className={styles.settingsRow}>
            <span>{t.theme}</span>
            <select
              className={styles.settingsSelect}
              value={settings.appearance.theme}
              onChange={(e) =>
                void updateSettings({
                  appearance: {
                    ...settings.appearance,
                    theme: e.target.value as 'dark' | 'light' | 'system',
                  },
                })              }
            >
              <option value="dark">{t.dark}</option>
              <option value="light">{t.light}</option>
              <option value="system">{t.system}</option>
            </select>
          </label>
          <Toggle
            label={t.reduceMotion}
            checked={settings.appearance.reduceMotion}
            onChange={(v) => void updateSettings({ appearance: { ...settings.appearance, reduceMotion: v } })}
          />
        </section>

        <section className={styles.settingsSection}>
          <h2>👤 {t.account}</h2>
          <Toggle
            label={t.readReceipts}
            checked={settings.account.readReceipts}
            onChange={(v) => void updateSettings({ account: { ...settings.account, readReceipts: v } })}
          />
          <Toggle
            label={t.autoPlay}
            checked={settings.account.autoPlayVideos}
            onChange={(v) => void updateSettings({ account: { ...settings.account, autoPlayVideos: v } })}
          />

          <div className={styles.dangerZone}>
            <h3 className={styles.dangerZoneTitle}>⚠️ {t.dangerZone}</h3>
            <p className={styles.settingsHint}>{t.dangerHint}</p>
            {!canManageAccount ? (
              <p className={styles.settingsHint}>{t.guestAccountHint}</p>
            ) : (
              <>
                {frozen && <p className={styles.frozenBanner}>{t.frozenBanner}</p>}
                {frozen ? (
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    disabled={accountBusy}
                    onClick={() => void handleUnfreeze()}
                  >
                    {accountBusy ? t.accountBusy : t.unfreezeAccount}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.warnBtn}
                    disabled={accountBusy}
                    onClick={() => setConfirmAction('freeze')}
                  >
                    {t.freezeAccount}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.dangerBtn}
                  disabled={accountBusy || String(userId).trim() === SUPER_ADMIN_ID}
                  onClick={() => {
                    if (String(userId).trim() === SUPER_ADMIN_ID) {
                      notify(t.adminDeleteBlocked);
                      return;
                    }
                    setConfirmAction('delete');
                  }}
                >
                  {t.deleteAccount}
                </button>
              </>
            )}
          </div>
        </section>

        <section className={styles.settingsSection}>
          <h2>🔐 {t.security}</h2>
          <p className={styles.settingsHint}>{t.passNote}</p>
          <input className={styles.input} type="password" placeholder={t.oldPass} value={oldPass} onChange={(e) => setOldPass(e.target.value)} />
          <input className={styles.input} type="password" placeholder={t.newPass} value={newPass} onChange={(e) => setNewPass(e.target.value)} />
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => {
              if (!oldPass || !newPass) return;
              void submitSupportRequest({
                userId,
                subject: 'password_change',
                message: `Password change request from user ${userId}`,
              }).then(() => {
                notify(t.savedSync);
                setOldPass('');
                setNewPass('');
              });
            }}
          >
            {t.savePass}
          </button>
        </section>

        <section className={styles.settingsSection}>
          <h2>🚫 {t.blocked}</h2>
          <p className={styles.settingsHint}>{t.blockedHint}</p>
          <AppLink href="/messages" className={styles.secondaryBtn} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            💬 {t.notifMessages}
          </AppLink>
        </section>

        <section className={styles.settingsSection}>
          <h2>📞 {t.support}</h2>
          <p className={styles.settingsHint}>{t.supportText}</p>
          <p className={styles.settingsContact}>{t.phone}</p>
          <p className={styles.settingsContact}>{t.email}</p>
        </section>

        <section className={styles.settingsSection}>
          <h2>💬 {t.feedback}</h2>
          <textarea
            className={styles.input}
            rows={4}
            placeholder={t.feedbackPlaceholder}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => {
              if (!feedback.trim()) return;
              void submitFeedback({ userId, text: feedback, category: 'general' }).then(() => {
                notify(t.savedSync);
                setFeedback('');
              });
            }}
          >
            {t.send}
          </button>
        </section>

        <section className={styles.settingsSection}>
          <h2>ℹ️ {t.about}</h2>
        </section>
      </div>

      <AppBottomNav activeTab="profile" />

      {confirmAction && (
        <div className={styles.confirmOverlay} onClick={closeConfirm} role="presentation">
          <div
            className={styles.confirmSheet}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.modalTitle}>
              {confirmAction === 'freeze' ? t.freezeTitle : t.deleteTitle}
            </h2>
            <p className={styles.settingsHint}>
              {confirmAction === 'freeze' ? t.freezeText : t.deleteText}
            </p>
            {confirmAction === 'delete' && (
              <input
                className={styles.input}
                value={deleteWord}
                onChange={(e) => setDeleteWord(e.target.value)}
                placeholder={t.deleteConfirmLabel}
                autoComplete="off"
              />
            )}
            <button
              type="button"
              className={confirmAction === 'delete' ? styles.dangerBtn : styles.warnBtn}
              disabled={
                accountBusy ||
                (confirmAction === 'delete' && deleteWord.trim() !== t.deleteConfirmWord)
              }
              onClick={() => void (confirmAction === 'freeze' ? handleFreeze() : handleDelete())}
            >
              {accountBusy
                ? t.accountBusy
                : confirmAction === 'freeze'
                  ? t.freezeConfirm
                  : t.deleteConfirm}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={accountBusy}
              onClick={closeConfirm}
            >
              {t.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

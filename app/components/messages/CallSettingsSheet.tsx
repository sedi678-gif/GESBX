"use client";

import React, { useEffect, useState } from 'react';
import {
  CallSettings,
  TEEN_SAFETY_RULES,
  getCallSettings,
  saveCallSettings,
  CallPrivacy,
} from '@/app/lib/callSettings';
import styles from '../social/social.module.css';

interface CallSettingsSheetProps {
  onClose: () => void;
}

export default function CallSettingsSheet({ onClose }: CallSettingsSheetProps) {
  const [settings, setSettings] = useState<CallSettings>(getCallSettings);

  useEffect(() => {
    const sync = () => setSettings(getCallSettings());
    window.addEventListener('yolustu_call_settings', sync);
    return () => window.removeEventListener('yolustu_call_settings', sync);
  }, []);

  const update = (patch: Partial<CallSettings>) => {
    setSettings(saveCallSettings(patch));
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.msgSettingsSheet} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>📞 Zəng parametrləri</h2>
        <p className={styles.msgSafetyIntro}>13–18 yaş üçün təhlükəsizlik qaydaları</p>

        <div className={styles.msgSafetyBox}>
          {TEEN_SAFETY_RULES.map((rule) => (
            <p key={rule} className={styles.msgSafetyRule}>• {rule}</p>
          ))}
        </div>

        <label className={styles.msgSettingRow}>
          <span>Kim zəng edə bilər?</span>
          <select
            className={styles.msgSelect}
            value={settings.allowCallsFrom}
            onChange={(e) => update({ allowCallsFrom: e.target.value as CallPrivacy })}
          >
            <option value="following">Yalnız izlədiklərim</option>
            <option value="everyone">Hamı (tövsiyə olunmur)</option>
            <option value="nobody">Heç kim</option>
          </select>
        </label>

        <label className={styles.msgSettingToggle}>
          <input
            type="checkbox"
            checked={settings.videoCallsEnabled}
            onChange={(e) => update({ videoCallsEnabled: e.target.checked })}
          />
          <span>Video zənglərə icazə</span>
        </label>

        <label className={styles.msgSettingToggle}>
          <input
            type="checkbox"
            checked={settings.speakerByDefault}
            onChange={(e) => update({ speakerByDefault: e.target.checked })}
          />
          <span>Səs avtomatik açıq (speaker)</span>
        </label>

        <label className={styles.msgSettingToggle}>
          <input
            type="checkbox"
            checked={settings.parentalAck}
            onChange={(e) => update({ parentalAck: e.target.checked })}
          />
          <span>Valideyn icazəsi təsdiqlənib (13–18)</span>
        </label>

        <button type="button" className={styles.primaryBtn} onClick={onClose}>
          Yadda saxla
        </button>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from 'react';
import { useAllianceBrain } from './AllianceBrainContext';
import AllianceFlagPreview from './AllianceFlagPreview';
import AllianceFlagEditor from './AllianceFlagEditor';
import { AllianceCombinedRankButton } from './AllianceRankTables';
import AllianceMapOrduCards from './AllianceMapOrduCards';
import DefenseLoadoutPanel from './DefenseLoadoutPanel';
import AllianceMapSheet from './AllianceMapSheet';
import { IconMapFlag } from './AllianceMapIcons';
import styles from './alliance.module.css';

export default function AllianceMapSidebar() {
  const { activeAlliance, hubVisuals, fortressHub, handleRenameAlliance } = useAllianceBrain();
  const [flagOpen, setFlagOpen] = useState(false);
  const [defenseOpen, setDefenseOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState('');

  function openRename() {
    setRenameValue(activeAlliance?.name ?? '');
    setRenameError('');
    setRenameOpen(true);
  }

  async function submitRename(event: React.FormEvent) {
    event.preventDefault();
    if (renameBusy) return;
    setRenameBusy(true);
    setRenameError('');
    try {
      await handleRenameAlliance(renameValue);
      setRenameOpen(false);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Ad dəyişmədi');
    } finally {
      setRenameBusy(false);
    }
  }

  return (
    <aside className={styles.allianceMapSidebar}>
      <div className={styles.allianceMapSidebarHead}>
        <button
          type="button"
          className={styles.allianceFlagHeadBtn}
          onClick={() => setFlagOpen(true)}
          disabled={!activeAlliance}
          title={activeAlliance ? 'Bayraq' : 'Bayraq üçün ittifaqda olmalısan'}
          aria-label="Bayraq"
        >
          <AllianceFlagPreview flag={hubVisuals.allianceFlag} size="hub" wave />
        </button>
        <div className={styles.allianceMapSidebarTitleBlock}>
          <h1 className={styles.allianceMapSidebarTitle}>{hubVisuals.allianceName}</h1>
          {activeAlliance && fortressHub.canManage ? (
            <button type="button" className={styles.allianceRenameBtn} onClick={openRename}>
              Adı dəyiş
            </button>
          ) : null}
          {activeAlliance ? (
            <>
              <p className={styles.allianceMapSidebarMeta}>Qala Lv.{hubVisuals.fortressLevel}</p>
              <p className={styles.allianceMapSidebarLoc}>{activeAlliance.region}</p>
            </>
          ) : (
            <p className={styles.allianceMapSidebarMeta}>İttifaq yoxdur</p>
          )}
        </div>
      </div>

      <div className={styles.mapRoundBtnRow}>
        <AllianceCombinedRankButton />
        <AllianceMapOrduCards variant="sheet" />
        <button type="button" className={styles.mapRoundBtn} onClick={() => setDefenseOpen(true)}>
          Müdafiə
        </button>
      </div>

      <AllianceMapSheet
        open={flagOpen}
        onClose={() => setFlagOpen(false)}
        title="Bayraq redaktoru"
        icon={<IconMapFlag />}
      >
        <AllianceFlagEditor />
      </AllianceMapSheet>
      <AllianceMapSheet open={defenseOpen} onClose={() => setDefenseOpen(false)} title="Müdafiə kartları">
        <DefenseLoadoutPanel />
      </AllianceMapSheet>
      <AllianceMapSheet open={renameOpen} onClose={() => setRenameOpen(false)} title="İttifaq adı">
        <form className={styles.allianceRenameForm} onSubmit={(event) => void submitRename(event)}>
          <input
            className={styles.allianceRenameInput}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            maxLength={32}
            minLength={2}
            required
            autoComplete="off"
            aria-label="Yeni ittifaq adı"
          />
          <p className={styles.allianceRenameHint}>Köhnə döyüş nəticələri və xallar dəyişmir.</p>
          {renameError ? <p className={styles.battleJoinWarn}>{renameError}</p> : null}
          <button type="submit" className={styles.battleAttackBtn} disabled={renameBusy}>
            {renameBusy ? 'Saxlanılır…' : 'Yadda saxla'}
          </button>
        </form>
      </AllianceMapSheet>
    </aside>
  );
}

"use client";

import React, { useEffect, useRef, useState } from 'react';
import ProfilePhotoEditorModal from '@/app/components/profile/ProfilePhotoEditorModal';
import { uploadAllianceFlagImage } from '@/app/lib/allianceFlagMediaService';
import { useAllianceBrain } from './AllianceBrainContext';
import { AllianceFlagConfig } from './types';
import AllianceFlagPreview from './AllianceFlagPreview';
import {
  FLAG_ACCENT_PRESETS,
  FLAG_BG_PRESETS,
  FLAG_EMBLEM_PRESETS,
  FLAG_PATTERN_OPTIONS,
  FLAG_SHAPE_OPTIONS,
  FLAG_THIRD_PRESETS,
} from './allianceFlagConfig';
import styles from './alliance.module.css';

type FlagTab = 'pattern' | 'color' | 'emblem' | 'photo';

export default function AllianceFlagEditor() {
  const { activeAlliance, hubVisuals, handleUpdateAllianceFlag } = useAllianceBrain();
  const [draft, setDraft] = useState<AllianceFlagConfig>(hubVisuals.allianceFlag);
  const [tab, setTab] = useState<FlagTab>('pattern');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [flagPhotoFile, setFlagPhotoFile] = useState<File | null>(null);
  const [uploadingFlagImage, setUploadingFlagImage] = useState(false);
  const flagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(hubVisuals.allianceFlag);
  }, [hubVisuals.allianceFlag]);

  const canEdit = hubVisuals.canEditAllianceFlag;

  const patchDraft = (patch: Partial<AllianceFlagConfig>, clearImage = false) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      if (clearImage) {
        delete next.imageUrl;
        delete next.imageUpdatedAt;
      }
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await handleUpdateAllianceFlag(draft);
      setSaved(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Bayraq saxlanmadı.');
    } finally {
      setSaving(false);
    }
  };

  const handleFlagFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canEdit) return;
    if (!file.type.startsWith('image/')) {
      alert('Yalnız şəkil faylı seçin.');
      return;
    }
    setFlagPhotoFile(file);
  };

  const uploadFlagPhoto = async (file: File) => {
    if (!activeAlliance || !canEdit) return;
    const previewUrl = URL.createObjectURL(file);
    const localFlag: AllianceFlagConfig = {
      ...draft,
      imageUrl: previewUrl,
      imageUpdatedAt: Date.now(),
    };
    setDraft(localFlag);
    setFlagPhotoFile(null);
    setSaved(true);

    void (async () => {
      setUploadingFlagImage(true);
      setSaving(true);
      try {
        const url = await uploadAllianceFlagImage(activeAlliance.id, file);
        const persisted: AllianceFlagConfig = {
          ...localFlag,
          imageUrl: url,
          imageUpdatedAt: Date.now(),
        };
        setDraft(persisted);
        await handleUpdateAllianceFlag(persisted);
        URL.revokeObjectURL(previewUrl);
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : 'Bayraq şəkli paylaşılmadı.');
      } finally {
        setUploadingFlagImage(false);
        setSaving(false);
      }
    })();
  };

  const handleRemoveFlagImage = async () => {
    if (!canEdit) return;
    const nextFlag = { ...draft };
    delete nextFlag.imageUrl;
    delete nextFlag.imageUpdatedAt;
    setDraft(nextFlag);
    setSaving(true);
    try {
      await handleUpdateAllianceFlag(nextFlag);
      setSaved(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Bayraq şəkli silinmədi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.allianceFlagEditorSheet}>
      <div className={styles.allianceFlagEditorHead}>
        <span>Canlı önizləmə</span>
        {!canEdit && <span className={styles.allianceFlagEditorHint}>Yalnız lider dəyişə bilər</span>}
      </div>

      <div className={styles.allianceFlagEditorPreviewRow}>
        <AllianceFlagPreview flag={draft} size="lg" wave />
      </div>

      <div className={styles.allianceFlagTabs} role="tablist" aria-label="Bayraq alətləri">
        {(
          [
            ['pattern', 'Naxış'],
            ['color', 'Rəng'],
            ['emblem', 'Emblem'],
            ['photo', 'Şəkil'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`${styles.allianceFlagTab} ${tab === id ? styles.allianceFlagTabActive : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'pattern' && (
        <>
          <div className={styles.allianceFlagToolGroup}>
            <span className={styles.allianceFlagToolLabel}>Forma</span>
            <div className={styles.allianceFlagShapes}>
              {FLAG_SHAPE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.allianceFlagPatternBtn} ${draft.shape === option.id ? styles.allianceFlagPatternBtnActive : ''}`}
                  disabled={!canEdit}
                  onClick={() => patchDraft({ shape: option.id }, Boolean(draft.imageUrl))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.allianceFlagToolGroup}>
            <span className={styles.allianceFlagToolLabel}>Naxış</span>
            <div className={styles.allianceFlagPatternGrid}>
              {FLAG_PATTERN_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.allianceFlagPatternCard} ${draft.pattern === option.id && !draft.imageUrl ? styles.allianceFlagPatternCardActive : ''}`}
                  disabled={!canEdit}
                  onClick={() => patchDraft({ pattern: option.id }, true)}
                  title={option.label}
                >
                  <AllianceFlagPreview
                    flag={{ ...draft, pattern: option.id, imageUrl: undefined, shape: 'rect' }}
                    size="sm"
                  />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === 'color' && (
        <>
          <div className={styles.allianceFlagToolGroup}>
            <span className={styles.allianceFlagToolLabel}>Əsas rəng</span>
            <div className={styles.allianceFlagSwatches}>
              {FLAG_BG_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.allianceFlagSwatch} ${draft.backgroundColor === color ? styles.allianceFlagSwatchActive : ''}`}
                  style={{ backgroundColor: color }}
                  disabled={!canEdit}
                  onClick={() => patchDraft({ backgroundColor: color }, Boolean(draft.imageUrl))}
                  aria-label={`Fon ${color}`}
                />
              ))}
            </div>
          </div>
          <div className={styles.allianceFlagToolGroup}>
            <span className={styles.allianceFlagToolLabel}>Vurğu rəngi</span>
            <div className={styles.allianceFlagSwatches}>
              {FLAG_ACCENT_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.allianceFlagSwatch} ${draft.accentColor === color ? styles.allianceFlagSwatchActive : ''}`}
                  style={{ backgroundColor: color }}
                  disabled={!canEdit}
                  onClick={() => patchDraft({ accentColor: color }, Boolean(draft.imageUrl))}
                  aria-label={`Vurğu ${color}`}
                />
              ))}
            </div>
          </div>
          <div className={styles.allianceFlagToolGroup}>
            <span className={styles.allianceFlagToolLabel}>Üçüncü rəng</span>
            <div className={styles.allianceFlagSwatches}>
              {FLAG_THIRD_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.allianceFlagSwatch} ${draft.thirdColor === color ? styles.allianceFlagSwatchActive : ''}`}
                  style={{ backgroundColor: color }}
                  disabled={!canEdit}
                  onClick={() => patchDraft({ thirdColor: color }, Boolean(draft.imageUrl))}
                  aria-label={`Üçüncü ${color}`}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {tab === 'emblem' && (
        <div className={styles.allianceFlagToolGroup}>
          <span className={styles.allianceFlagToolLabel}>Emblem</span>
          <div className={styles.allianceFlagEmblems}>
            {FLAG_EMBLEM_PRESETS.map((emblem) => (
              <button
                key={emblem}
                type="button"
                className={`${styles.allianceFlagEmblemBtn} ${draft.emblem === emblem ? styles.allianceFlagEmblemBtnActive : ''}`}
                disabled={!canEdit}
                onClick={() => patchDraft({ emblem }, Boolean(draft.imageUrl))}
              >
                {emblem}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'photo' && (
        <div className={styles.allianceFlagToolGroup}>
          <span className={styles.allianceFlagToolLabel}>İttifaq şəkli</span>
          <p className={styles.allianceFlagPhotoHint}>
            Şəkil seç, kəs və paylaş — bayraq eyni anda bütün üzvlərdə görünür.
          </p>
          <button
            type="button"
            className={styles.allianceFlagImageDrop}
            disabled={!canEdit || uploadingFlagImage}
            onClick={() => flagInputRef.current?.click()}
          >
            {draft.imageUrl ? (
              <img src={draft.imageUrl} alt="" className={styles.allianceFlagImageDropImg} />
            ) : (
              <span>Şəkil əlavə et</span>
            )}
            <span className={styles.allianceFlagImageDropLabel}>
              {uploadingFlagImage ? 'Paylaşılır...' : draft.imageUrl ? 'Başqa şəkil seç' : 'Qalereyadan seç'}
            </span>
          </button>
          <input
            ref={flagInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleFlagFile}
          />
          {draft.imageUrl && canEdit && (
            <button
              type="button"
              className={styles.allianceFlagRemoveImageBtn}
              disabled={uploadingFlagImage || saving}
              onClick={() => void handleRemoveFlagImage()}
            >
              Şəkli sil, naxışa qayıt
            </button>
          )}
        </div>
      )}

      {canEdit && tab !== 'photo' && (
        <button
          type="button"
          className={styles.allianceFlagSaveBtn}
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saxlanır...' : saved ? '✓ Paylaşıldı' : 'Bayrağı paylaş'}
        </button>
      )}

      <ProfilePhotoEditorModal
        open={flagPhotoFile !== null}
        kind="flag"
        file={flagPhotoFile}
        onClose={() => setFlagPhotoFile(null)}
        onConfirm={uploadFlagPhoto}
      />
    </div>
  );
}

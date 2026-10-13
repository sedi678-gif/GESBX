"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  exportProfileCrop,
  getMinCoverScale,
  ProfileCropKind,
} from '@/app/lib/profileImageCrop';
import profileStyles from './profile.module.css';

interface ProfilePhotoEditorModalProps {
  open: boolean;
  kind: ProfileCropKind;
  file: File | null;
  onClose: () => void;
  onConfirm: (file: File) => void | Promise<void>;
}

const VIEW_W = 320;
const AVATAR_FRAME = 240;
const BANNER_FRAME_H = 96;
const FLAG_FRAME_W = 280;
const FLAG_FRAME_H = 196;

export default function ProfilePhotoEditorModal({
  open,
  kind,
  file,
  onClose,
  onConfirm,
}: ProfilePhotoEditorModalProps) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const frame = useMemo(() => {
    if (kind === 'avatar') {
      return { w: AVATAR_FRAME, h: AVATAR_FRAME };
    }
    if (kind === 'flag') {
      return { w: FLAG_FRAME_W, h: FLAG_FRAME_H };
    }
    return { w: VIEW_W - 24, h: BANNER_FRAME_H };
  }, [kind]);

  const viewH = kind === 'avatar' ? 300 : kind === 'flag' ? 240 : 200;

  useEffect(() => {
    if (!open || !file) {
      setPreviewUrl('');
      setImageSize({ w: 0, h: 0 });
      setScale(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    const img = new Image();
    img.onload = () => {
      const minScale = getMinCoverScale(img.naturalWidth, img.naturalHeight, frame.w, frame.h);
      setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
      setScale(minScale);
      setPan({ x: 0, y: 0 });
    };
    img.src = url;

    return () => URL.revokeObjectURL(url);
  }, [open, file, frame.w, frame.h]);

  const minScale = useMemo(() => {
    if (!imageSize.w || !imageSize.h) return 1;
    return getMinCoverScale(imageSize.w, imageSize.h, frame.w, frame.h);
  }, [imageSize, frame.w, frame.h]);

  const clampPan = useCallback(
    (nextPan: { x: number; y: number }, nextScale: number) => {
      if (!imageSize.w) return nextPan;
      const displayW = imageSize.w * nextScale;
      const displayH = imageSize.h * nextScale;
      const frameLeft = (VIEW_W - frame.w) / 2;
      const frameTop = (viewH - frame.h) / 2;
      const imageLeft = (VIEW_W - displayW) / 2 + nextPan.x;
      const imageTop = (viewH - displayH) / 2 + nextPan.y;

      let panX = nextPan.x;
      let panY = nextPan.y;

      if (imageLeft > frameLeft) panX -= imageLeft - frameLeft;
      if (imageTop > frameTop) panY -= imageTop - frameTop;
      if (imageLeft + displayW < frameLeft + frame.w) {
        panX += frameLeft + frame.w - (imageLeft + displayW);
      }
      if (imageTop + displayH < frameTop + frame.h) {
        panY += frameTop + frame.h - (imageTop + displayH);
      }

      return { x: panX, y: panY };
    },
    [imageSize, frame, viewH]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setPan(clampPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy }, scale));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const handleZoom = (delta: number) => {
    setScale((prev) => {
      const next = Math.min(minScale * 3, Math.max(minScale, prev + delta));
      setPan((p) => clampPan(p, next));
      return next;
    });
  };

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  const handleConfirm = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const cropped = await exportProfileCrop(file, {
        kind,
        scale,
        panX: pan.x,
        panY: pan.y,
        viewportWidth: VIEW_W,
        viewportHeight: viewH,
        frameWidth: frame.w,
        frameHeight: frame.h,
      });
      await onConfirm(cropped);
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Şəkil düzəldilə bilmədi.');
    } finally {
      setBusy(false);
    }
  };

  if (!open || !file || !previewUrl || !portalTarget) return null;

  const displayW = imageSize.w * scale;
  const displayH = imageSize.h * scale;
  const frameLeft = (VIEW_W - frame.w) / 2;
  const frameTop = (viewH - frame.h) / 2;

  return createPortal(
    <div
      className={profileStyles.photoEditorOverlay}
      onClick={handleClose}
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={profileStyles.photoEditorSheet}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className={profileStyles.photoEditorHeader}>
          <h3>
            {kind === 'avatar'
              ? '📷 Profil şəkli düzəlt'
              : kind === 'flag'
                ? '🏴 Bayraq şəkli düzəlt'
                : '🖼️ Qapaq şəkli düzəlt'}
          </h3>
          <button type="button" className={profileStyles.photoEditorClose} onClick={handleClose} disabled={busy} aria-label="Bağla">✕</button>
        </div>

        <p className={profileStyles.photoEditorHint}>Sürüşdür · Yaxınlaşdır · Kəs · Saxla</p>

        <div
          className={profileStyles.photoEditorViewport}
          style={{ width: VIEW_W, height: viewH }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <img
            src={previewUrl}
            alt=""
            draggable={false}
            className={profileStyles.photoEditorImage}
            style={{
              width: displayW,
              height: displayH,
              left: (VIEW_W - displayW) / 2 + pan.x,
              top: (viewH - displayH) / 2 + pan.y,
            }}
          />
          <div
            className={`${profileStyles.photoEditorFrame} ${kind === 'avatar' ? profileStyles.photoEditorFrameRound : ''}`}
            style={{ width: frame.w, height: frame.h, left: frameLeft, top: frameTop }}
          />
        </div>

        <div className={profileStyles.photoEditorControls}>
          <button type="button" className={profileStyles.photoEditorZoomBtn} onClick={() => handleZoom(-0.08)} aria-label="Uzaqlaş">
            −
          </button>
          <input
            type="range"
            min={minScale}
            max={minScale * 3}
            step={0.01}
            value={scale}
            onChange={(e) => {
              const next = Number(e.target.value);
              setScale(next);
              setPan((p) => clampPan(p, next));
            }}
            className={profileStyles.photoEditorSlider}
          />
          <button type="button" className={profileStyles.photoEditorZoomBtn} onClick={() => handleZoom(0.08)} aria-label="Yaxınlaş">
            +
          </button>
        </div>

        <div className={profileStyles.photoEditorActions}>
          <button type="button" className={profileStyles.photoEditorCancel} onClick={handleClose} disabled={busy}>
            Ləğv et
          </button>
          <button type="button" className={profileStyles.photoEditorSave} onClick={() => void handleConfirm()} disabled={busy}>
            {busy ? 'Saxlanır...' : 'Şəkli qoy'}
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

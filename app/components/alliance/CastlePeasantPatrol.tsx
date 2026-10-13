"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CASTLE_REF_H,
  CASTLE_REF_W,
  PEASANT_COLS,
  PEASANT_DISPLAY_SIZE,
  PEASANT_PATROL,
  PEASANT_ROW_LEFT,
  PEASANT_ROW_RIGHT,
  PEASANT_ROWS,
  PEASANT_SHEET_URL,
  PeasantDirection,
  getContainedImageRect,
  refPointToScreen,
} from './peasantPatrolConfig';
import styles from './alliance.module.css';

interface CastlePeasantPatrolProps {
  containerRef: React.RefObject<HTMLElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;
}

type PatrolPhase = 'walk-right' | 'pause-end' | 'walk-left' | 'pause-start';

const WALK_CYCLE_MS = 960;

export default function CastlePeasantPatrol({ containerRef, imageRef }: CastlePeasantPatrolProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sheetRef = useRef<HTMLImageElement | null>(null);
  const frameMetricsRef = useRef({ fw: 64, fh: 64 });
  const rafRef = useRef<number | null>(null);

  const [direction, setDirection] = useState<PeasantDirection>('right');
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);

  const phaseRef = useRef<PatrolPhase>('walk-right');
  const pauseTimerRef = useRef<number | null>(null);
  const directionRef = useRef<PeasantDirection>('right');
  const layoutRef = useRef({ startX: 0, startY: 0, endX: 0, endY: 0 });

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  const drawFrame = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    const sheet = sheetRef.current;
    if (!canvas || !sheet || sheet.naturalWidth <= 0) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { fw, fh } = frameMetricsRef.current;
    const row = directionRef.current === 'right' ? PEASANT_ROW_RIGHT : PEASANT_ROW_LEFT;
    const col = Math.floor((timestamp / (WALK_CYCLE_MS / PEASANT_COLS)) % PEASANT_COLS);

    ctx.clearRect(0, 0, PEASANT_DISPLAY_SIZE, PEASANT_DISPLAY_SIZE);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sheet,
      col * fw,
      row * fh,
      fw,
      fh,
      0,
      0,
      PEASANT_DISPLAY_SIZE,
      PEASANT_DISPLAY_SIZE
    );

    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image || image.naturalWidth <= 0) return false;

    const layout = getContainedImageRect(
      container.clientWidth,
      container.clientHeight,
      image.naturalWidth || CASTLE_REF_W,
      image.naturalHeight || CASTLE_REF_H
    );

    const start = refPointToScreen(PEASANT_PATROL.startX, PEASANT_PATROL.startY, layout);
    const end = refPointToScreen(PEASANT_PATROL.endX, PEASANT_PATROL.endY, layout);

    layoutRef.current = { startX: start.x, startY: start.y, endX: end.x, endY: end.y };

    const phase = phaseRef.current;
    if (phase === 'walk-right' || phase === 'pause-start') {
      setPos({ x: start.x, y: start.y });
    } else {
      setPos({ x: end.x, y: end.y });
    }

    setReady(true);
    return true;
  }, [containerRef, imageRef]);

  const beginWalk = useCallback(
    (nextDirection: PeasantDirection) => {
      const wrap = wrapRef.current;
      if (!wrap) return;

      clearPauseTimer();

      const { startX, startY, endX } = layoutRef.current;
      const fromX = nextDirection === 'right' ? startX : endX;
      const toX = nextDirection === 'right' ? endX : startX;

      directionRef.current = nextDirection;
      setDirection(nextDirection);
      setPos({ x: fromX, y: startY });
      phaseRef.current = nextDirection === 'right' ? 'walk-right' : 'walk-left';

      wrap.style.transition = 'none';
      wrap.style.left = `${fromX}px`;
      wrap.style.top = `${startY}px`;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          wrap.style.transition = `left ${PEASANT_PATROL.walkMs}ms linear`;
          wrap.style.left = `${toX}px`;
        });
      });
    },
    [clearPauseTimer]
  );

  const handleTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (event.propertyName !== 'left') return;

      const { startX, startY, endX } = layoutRef.current;
      const phase = phaseRef.current;

      if (phase === 'walk-right') {
        phaseRef.current = 'pause-end';
        setPos({ x: endX, y: startY });
        directionRef.current = 'left';
        setDirection('left');
        clearPauseTimer();
        pauseTimerRef.current = window.setTimeout(() => beginWalk('left'), PEASANT_PATROL.pauseMs);
        return;
      }

      if (phase === 'walk-left') {
        phaseRef.current = 'pause-start';
        setPos({ x: startX, y: startY });
        directionRef.current = 'right';
        setDirection('right');
        clearPauseTimer();
        pauseTimerRef.current = window.setTimeout(() => beginWalk('right'), PEASANT_PATROL.pauseMs);
      }
    },
    [beginWalk, clearPauseTimer]
  );

  useEffect(() => {
    const sheet = new Image();
    sheet.src = PEASANT_SHEET_URL;
    sheetRef.current = sheet;

    const onSheetReady = () => {
      frameMetricsRef.current = {
        fw: Math.floor(sheet.naturalWidth / PEASANT_COLS),
        fh: Math.floor(sheet.naturalHeight / PEASANT_ROWS),
      };
      rafRef.current = requestAnimationFrame(drawFrame);
    };

    if (sheet.complete && sheet.naturalWidth > 0) {
      onSheetReady();
    } else {
      sheet.addEventListener('load', onSheetReady, { once: true });
    }

    return () => {
      sheet.removeEventListener('load', onSheetReady);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [drawFrame]);

  useEffect(() => {
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image) return;

    const boot = () => {
      if (!measure()) return;
      beginWalk('right');
    };

    if (image.complete && image.naturalWidth > 0) {
      boot();
    } else {
      image.addEventListener('load', boot, { once: true });
    }

    const ro = new ResizeObserver(() => measure());
    ro.observe(container);

    return () => {
      image.removeEventListener('load', boot);
      ro.disconnect();
      clearPauseTimer();
    };
  }, [beginWalk, clearPauseTimer, containerRef, imageRef, measure]);

  return (
    <div className={styles.peasantPatrolLayer} aria-hidden={!ready}>
      <div
        ref={wrapRef}
        className={styles.peasantCanvasWrap}
        style={{ left: pos.x, top: pos.y }}
        onTransitionEnd={handleTransitionEnd}
        data-direction={direction}
      >
        <canvas
          ref={canvasRef}
          width={PEASANT_DISPLAY_SIZE}
          height={PEASANT_DISPLAY_SIZE}
          className={styles.peasantCanvas}
        />
      </div>
    </div>
  );
}

import { useCallback, useRef } from 'react';

interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}

/** WhatsApp tipli uzun basma — hərəkət olarsa ləğv */
export function useLongPress(
  onLongPress: () => void,
  options?: { onClick?: () => void; delayMs?: number; moveThreshold?: number }
): LongPressHandlers {
  const delayMs = options?.delayMs ?? 480;
  const moveThreshold = options?.moveThreshold ?? 12;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      firedRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress();
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(12);
        }
      }, delayMs);
    },
    [clearTimer, delayMs, onLongPress]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current) return;
      const dx = Math.abs(e.clientX - startRef.current.x);
      const dy = Math.abs(e.clientY - startRef.current.y);
      if (dx > moveThreshold || dy > moveThreshold) {
        startRef.current = null;
        clearTimer();
      }
    },
    [clearTimer, moveThreshold]
  );

  const onPointerUp = useCallback(() => {
    startRef.current = null;
    clearTimer();
  }, [clearTimer]);

  const onPointerLeave = useCallback(() => {
    startRef.current = null;
    clearTimer();
  }, [clearTimer]);

  const onPointerCancel = onPointerLeave;

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (firedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        firedRef.current = false;
        return;
      }
      options?.onClick?.();
    },
    [options]
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onClick,
  };
}

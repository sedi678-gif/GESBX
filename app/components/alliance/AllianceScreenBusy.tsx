"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface AllianceScreenBusyValue {
  busy: boolean;
  hold: () => () => void;
}

const AllianceScreenBusyContext = createContext<AllianceScreenBusyValue | null>(null);

export function AllianceScreenBusyProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const hold = useCallback(() => {
    setCount((n) => n + 1);
    return () => setCount((n) => Math.max(0, n - 1));
  }, []);
  const value = useMemo(() => ({ busy: count > 0, hold }), [count, hold]);
  return <AllianceScreenBusyContext.Provider value={value}>{children}</AllianceScreenBusyContext.Provider>;
}

export function useAllianceScreenBusy() {
  return useContext(AllianceScreenBusyContext)?.busy ?? false;
}

export function useHoldAllianceScreen() {
  return useContext(AllianceScreenBusyContext)?.hold;
}

/** Ayrı əməliyyat ekranı açıq olanda söhbəti gizlədir. Xəritənin özü söhbəti gizlətmir. */
export function useAllianceScreenHold(active: boolean) {
  const hold = useHoldAllianceScreen();
  useEffect(() => {
    if (!active || !hold) return;
    return hold();
  }, [active, hold]);
}

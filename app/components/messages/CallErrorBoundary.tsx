'use client';

import React from 'react';

/** Overlay artıq context-dən asılı deyil — bu sərhəd UI-ni gizlətməsin. */
export default function CallErrorBoundary({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

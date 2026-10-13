"use client";

import { Suspense } from 'react';
import SettingsPageClient from '@/app/components/settings/SettingsPageClient';

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0f172a' }} />}>
      <SettingsPageClient />
    </Suspense>
  );
}

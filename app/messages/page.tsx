"use client";

import { Suspense } from 'react';
import MessagesPageClient from '@/app/components/social/MessagesPageClient';

export default function MessagesPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0f172a' }} />}>
      <MessagesPageClient />
    </Suspense>
  );
}

"use client";

import React from 'react';
import { useUser } from '@/context/UserContext';
import { getLocalProfileDisplayName } from '@/app/lib/userId';
import { AllianceBrainProvider } from '@/app/components/alliance/AllianceBrainContext';
import { CallProvider } from '@/context/CallContext';
import ZegoBootstrap from '@/app/components/ZegoBootstrap';

/** Tətbiq səviyyəsində tək mərkəzi beyin — bütün səhifələr eyni state paylaşır */
export default function AppBrainProvider({ children }: { children: React.ReactNode }) {
  const { userId, user } = useUser();
  const userName = user?.displayName || user?.email || getLocalProfileDisplayName();

  return (
    <AllianceBrainProvider userId={userId} userName={userName} firebaseUid={user?.uid ?? null}>
      <CallProvider>
        <ZegoBootstrap />
        {children}
      </CallProvider>
    </AllianceBrainProvider>
  );
}

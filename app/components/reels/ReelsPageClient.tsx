"use client";

import React from 'react';
import AppBottomNav from '@/app/components/AppBottomNav';
import ReelsVerticalFeed from '@/app/components/reels/ReelsVerticalFeed';
import { useUser } from '@/context/UserContext';
import { getAppUserId } from '@/app/lib/userId';

export default function ReelsPageClient() {
  const { userId } = useUser();
  const myId = getAppUserId(userId);

  return (
    <div className="min-h-dvh bg-black">
      <ReelsVerticalFeed userId={myId} />
      <AppBottomNav activeTab="explore" />
    </div>
  );
}

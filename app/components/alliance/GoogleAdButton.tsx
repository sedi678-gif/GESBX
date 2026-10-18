'use client';

/**
 * Rewarded ads are intentionally unavailable until a native ad SDK and
 * server-side completion verification are configured. This component must
 * never grant XP or visibility rewards based on a client-only callback.
 */
export interface GoogleAdButtonProps {
  onReward?: () => void | Promise<void>;
  variant?: 'pill' | 'nav' | 'xp' | 'bolt';
  label?: string;
  className?: string;
}

export default function GoogleAdButton(_props: GoogleAdButtonProps) {
  return null;
}

import { AllianceData } from './types';

export type LeaderCheckOptions = {
  firebaseUid?: string | null;
  isLeaderProfile?: boolean;
  displayName?: string;
};

/** Lokal profil ID, Firebase UID və ya player profili ilə lider yoxlaması */
export function isAllianceLeader(
  alliance: AllianceData | null | undefined,
  userId: string,
  options: LeaderCheckOptions = {}
): boolean {
  if (!alliance || !userId || userId === 'anonim_user_id') return false;

  const { firebaseUid, isLeaderProfile, displayName } = options;

  if (alliance.leaderId === userId) return true;
  if (firebaseUid && alliance.leaderId === firebaseUid) return true;
  if (isLeaderProfile && alliance.members?.includes(userId)) return true;
  if (displayName && alliance.leader === displayName) return true;

  return false;
}

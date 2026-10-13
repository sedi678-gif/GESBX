export type PendingPlayRequest = {
  kind: 'play';
  battleId: string;
  playerId: string;
  cardId: string;
  requestId: string;
  expectedStateVersion: number;
  expectedEventSeq: number;
};

export type PendingClickRequest = {
  kind: 'click';
  battleId: string;
  playerId: string;
  challengeId: string;
};

export type PendingBattleRequest = PendingPlayRequest | PendingClickRequest;

const PREFIX = 'battle_pending_req_';

function storageKey(playerId: string, kind: PendingBattleRequest['kind']) {
  return `${PREFIX}${kind}_${playerId}`;
}

export function rememberPendingBattleRequest(playerId: string, request: PendingBattleRequest) {
  if (typeof sessionStorage === 'undefined') return;
  if (!playerId.trim()) return;
  sessionStorage.setItem(storageKey(playerId, request.kind), JSON.stringify(request));
}

export function readPendingBattleRequest(
  playerId: string,
  kind: PendingBattleRequest['kind']
): PendingBattleRequest | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(storageKey(playerId, kind));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingBattleRequest;
    if (kind === 'play' && parsed?.kind === 'play') {
      if (!parsed.requestId || !parsed.cardId || !parsed.battleId) return null;
      return parsed;
    }
    if (kind === 'click' && parsed?.kind === 'click') {
      if (!parsed.challengeId || !parsed.battleId) return null;
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearPendingBattleRequest(playerId: string, kind?: PendingBattleRequest['kind']) {
  if (typeof sessionStorage === 'undefined') return;
  if (kind) {
    sessionStorage.removeItem(storageKey(playerId, kind));
    return;
  }
  sessionStorage.removeItem(storageKey(playerId, 'play'));
  sessionStorage.removeItem(storageKey(playerId, 'click'));
}

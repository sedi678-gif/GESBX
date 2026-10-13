import { publicAuditCardId } from '../effects/interaction';
import { arenaCardTitle, isArenaCardId } from '../catalog';
import type { ArenaCardSummaryItem, ArenaPublicTimelineEvent, ArenaPublicTimelineKind } from './types';

const HIDDEN_LABEL = 'Gizli kart';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function publicCardId(raw: string, hiddenHint: boolean): string | null {
  const id = publicAuditCardId(raw, hiddenHint || raw === 'duman' || raw === 'hidden');
  if (!id || id === 'hidden') return null;
  if (id.toLowerCase() === 'duman') return null;
  return id;
}

function labelFor(kind: ArenaPublicTimelineKind, cardId: string | null): string {
  const card = cardId && isArenaCardId(cardId) ? arenaCardTitle(cardId) : cardId;
  if (kind === 'card_played') return card ? `${card} oynanıldı` : HIDDEN_LABEL;
  if (kind === 'card_countered') return card ? `${card} ilə cavab` : 'Kart cavablandı';
  if (kind === 'card_blocked') return card ? `${card} bloklandı` : 'Kart bloklandı';
  if (kind === 'card_reflected') return card ? `${card} əks olundu` : 'Kart əks olundu';
  if (kind === 'reaction_started') return card ? `${card} reaksiyası başladı` : 'Reaksiya başladı';
  if (kind === 'reaction_succeeded') return 'Reaksiya uğurlu oldu';
  if (kind === 'reaction_failed') return 'Reaksiya uğursuz oldu';
  return 'Döyüş bitdi';
}

function kindsFromAudit(data: Record<string, unknown>): ArenaPublicTimelineKind[] {
  const effect = asString(data.effectType);
  const result = asString(data.result);
  if (effect === 'BATTLE_COMPLETED' || result === 'BATTLE_COMPLETED') return ['match_completed'];
  const events = Array.isArray(data.events) ? data.events.map((item) => asString(item)) : [];
  const kinds: ArenaPublicTimelineKind[] = [];
  if (events.includes('CARD_PLAYED') || effect) kinds.push('card_played');
  if (events.includes('COUNTER_PLAYED') || events.includes('COUNTER_RESOLVED')) kinds.push('card_countered');
  if (events.includes('CARD_BLOCKED')) kinds.push('card_blocked');
  if (events.includes('CARD_REFLECTED')) kinds.push('card_reflected');
  if (kinds.length === 0 && effect && effect !== HIDDEN_LABEL) kinds.push('card_played');
  if (kinds.length === 0 && effect === HIDDEN_LABEL) kinds.push('card_played');
  return kinds;
}

export function publicTimelineFromAudit(docs: Array<{ id: string; data: Record<string, unknown> }>): ArenaPublicTimelineEvent[] {
  const out: ArenaPublicTimelineEvent[] = [];
  docs.forEach((doc) => {
    const hidden = asString(doc.data.effectType) === HIDDEN_LABEL || asString(doc.data.cardId) === 'hidden';
    const cardId = publicCardId(asString(doc.data.cardId), hidden);
    const at = asInt(doc.data.timestamp);
    kindsFromAudit(doc.data).forEach((kind, index) => {
      out.push({
        id: `${doc.id}_${kind}_${index}`,
        at,
        kind,
        label: kind === 'card_played' && hidden ? HIDDEN_LABEL : labelFor(kind, cardId),
        cardId: hidden ? null : cardId,
      });
    });
  });
  return out;
}

export function publicTimelineFromReaction(docs: Array<{ id: string; data: Record<string, unknown> }>): ArenaPublicTimelineEvent[] {
  const out: ArenaPublicTimelineEvent[] = [];
  docs.forEach((doc) => {
    const type = asString(doc.data.type);
    const at = asInt(doc.data.timestamp);
    const hidden = asString(doc.data.cardId) === 'hidden' || asString(doc.data.cardId) === 'duman';
    const cardId = publicCardId(asString(doc.data.cardId), hidden);
    let kind: ArenaPublicTimelineKind | null = null;
    if (type === 'reactionCreated') kind = 'reaction_started';
    else if (type === 'reactionSucceeded') kind = 'reaction_succeeded';
    else if (type === 'reactionExpired' || type === 'reactionFailed') kind = 'reaction_failed';
    else if (type === 'BATTLE_COMPLETED') kind = 'match_completed';
    if (!kind) return;
    out.push({
      id: `${doc.id}_${kind}`,
      at,
      kind,
      label: labelFor(kind, hidden ? null : cardId),
      cardId: hidden || kind === 'match_completed' ? null : cardId,
    });
  });
  return out;
}

export function mergePublicTimeline(
  audit: ArenaPublicTimelineEvent[],
  reaction: ArenaPublicTimelineEvent[]
): ArenaPublicTimelineEvent[] {
  const merged = [...audit, ...reaction].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const seen: Record<string, true> = {};
  return merged.filter((event) => {
    if (event.kind === 'match_completed') {
      if (seen.match_completed) return false;
      seen.match_completed = true;
    }
    return true;
  });
}

export function publicCardSummary(timeline: ArenaPublicTimelineEvent[]): ArenaCardSummaryItem[] {
  const counts: Record<string, number> = {};
  timeline.forEach((event) => {
    if (event.kind !== 'card_played' || !event.cardId) return;
    counts[event.cardId] = (counts[event.cardId] ?? 0) + 1;
  });
  return Object.entries(counts).map(([cardId, count]) => ({
    cardId,
    count,
    title: isArenaCardId(cardId) ? arenaCardTitle(cardId) : cardId,
  }));
}

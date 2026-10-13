import { BATTLE_LOADOUT_POOL, type BattleLoadoutCardId } from '@/app/lib/battleLoadout/battleLoadoutConfig';
import { casusCard } from './cards/casus';
import { dumanCard } from './cards/duman';
import { felaketCard } from './cards/felaket';
import { guzguCard } from './cards/guzgu';
import { jokerCard } from './cards/joker';
import { ogruCard } from './cards/ogru';
import { qayaCard } from './cards/qaya';
import { qulCard } from './cards/qul';
import { qutbCard } from './cards/qutb';
import { sehrbazCard } from './cards/sehrbaz';
import { tikanliCard } from './cards/tikanli';
import { twoXCard } from './cards/twoX';
import { usyanCard } from './cards/usyan';
import type { CardEffectModule } from './types';

const CARD_EFFECT_MODULES: Record<BattleLoadoutCardId, CardEffectModule> = {
  '2x': twoXCard,
  casus: casusCard,
  duman: dumanCard,
  felaket: felaketCard,
  guzgu: guzguCard,
  joker: jokerCard,
  ogru: ogruCard,
  qaya: qayaCard,
  qul: qulCard,
  qutb: qutbCard,
  sehrbaz: sehrbazCard,
  tikanli: tikanliCard,
  usyan: usyanCard,
};

export function getCardEffectModule(cardId: string): CardEffectModule | null {
  if (!(cardId in CARD_EFFECT_MODULES)) return null;
  return CARD_EFFECT_MODULES[cardId as BattleLoadoutCardId];
}

export function registerCardEffect(module: CardEffectModule) {
  CARD_EFFECT_MODULES[module.cardId] = module;
}

for (const id of BATTLE_LOADOUT_POOL) {
  const module = CARD_EFFECT_MODULES[id];
  if (!module || module.cardId !== id || module.effects.length === 0) {
    throw new Error(`Kart effect modulu tapılmadı: ${id}`);
  }
}

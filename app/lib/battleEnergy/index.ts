export {
  BATTLE_CARD_COSTS_COLLECTION,
  BATTLE_CARD_ENERGY_COSTS,
  BATTLE_ENERGY_COLLECTION,
  BATTLE_ENERGY_MAX,
  BATTLE_ENERGY_REQUESTS_COLLECTION,
  BATTLE_ENERGY_START,
  clampBattleEnergy,
  initialBattleEnergyDoc,
  energyRequestIdForCard,
  makeEnergyRequestId,
  officialCardEnergyCost,
  loadoutEnergyCost,
  assertLoadoutFitsEnergy,
  sanitizeEnergyRequestId,
} from './battleEnergyConfig';

export { battleEnergyRef, getBattleEnergy, listenBattleEnergy, viewBattleEnergy } from './battleEnergyService';

export type { BattleEnergy } from './battleEnergyService';

export { playBattleCard } from '@/app/lib/battlePlay/battlePlayService';
export type { PlayBattleCardResult } from '@/app/lib/battlePlay/battlePlayService';

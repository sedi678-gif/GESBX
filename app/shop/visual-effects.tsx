// Shop - Visual Effects
// Cosmetic only - no gameplay advantages

export const VISUAL_EFFECTS = [
  {
    id: 'effect_1',
    name: 'Particles',
    description: 'Subtle particle effect around profile',
    category: 'profile-effect',
    price: 300,
    cosmeticOnly: true,
    visualEffect: 'particle-trail',
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance', 'click']
  },
  {
    id: 'effect_2',
    name: 'Glow',
    description: 'Soft glow effect around avatar',
    category: 'profile-effect',
    price: 500,
    cosmeticOnly: true,
    visualEffect: 'glow',
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance', 'click']
  },
  {
    id: 'effect_3',
    name: 'Aurora',
    description: 'Rainbow aurora effect',
    category: 'profile-effect',
    price: 1500,
    cosmeticOnly: true,
    visualEffect: 'rainbow-aura',
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance', 'click']
  },
  {
    id: 'effect_4',
    name: 'Shadow',
    description: 'Shadow effect beneath avatar',
    category: 'profile-effect',
    price: 400,
    cosmeticOnly: true,
    visualEffect: 'shadow',
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance', 'click']
  },
  {
    id: 'effect_5',
    name: 'Sparkles',
    description: 'Sparkle effect on interactions',
    category: 'profile-effect',
    price: 600,
    cosmeticOnly: true,
    visualEffect: 'sparkles',
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance', 'click']
  }
];

export const getVisualEffectById = (id: string) => {
  return VISUAL_EFFECTS.find(effect => effect.id === id) || null;
};

export const getVisualEffectsByPrice = (maxPrice: number) => {
  return VISUAL_EFFECTS.filter(effect => effect.price <= maxPrice);
};
// Shop - Profile Accessories
// All items are cosmetic only - no gameplay advantages

export const PROFILE_ACCESSORIES = [
  {
    id: 'frame_1',
    name: 'Classic Frame',
    description: 'Basic profile frame',
    category: 'frame',
    price: 0,
    cosmeticOnly: true,
    visualEffects: ['border'],
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance']
  },
  {
    id: 'frame_2',
    name: 'Gold Frame',
    description: 'Gold-accented profile frame',
    category: 'frame',
    price: 500,
    cosmeticOnly: true,
    visualEffects: ['gold-border', 'glow'],
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance']
  },
  {
    id: 'frame_3',
    name: 'Diamond Frame',
    description: 'Premium diamond-encrusted frame',
    category: 'frame',
    price: 1500,
    cosmeticOnly: true,
    visualEffects: ['diamond-border', 'sparkle'],
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance']
  },
  {
    id: 'skin_1',
    name: 'Default Skin',
    description: 'Default avatar skin',
    category: 'skin',
    price: 0,
    cosmeticOnly: true,
    visualEffects: ['color-change'],
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance']
  },
  {
    id: 'skin_2',
    name: 'Midnight Skin',
    description: 'Dark theme avatar skin',
    category: 'skin',
    price: 800,
    cosmeticOnly: true,
    visualEffects: ['dark-theme', 'neon-accent'],
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance']
  },
  {
    id: 'skin_3',
    name: 'Aurora Skin',
    description: 'Rainbow gradient avatar skin',
    category: 'skin',
    price: 2000,
    cosmeticOnly: true,
    visualEffects: ['gradient', 'particles'],
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance']
  },
  {
    id: 'bubble_1',
    name: 'Default Bubble',
    description: 'Standard chat bubble style',
    category: 'bubble',
    price: 0,
    cosmeticOnly: true,
    visualEffects: ['standard'],
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance']
  },
  {
    id: 'bubble_2',
    name: 'Thought Bubble',
    description: 'Thought-bubble style',
    category: 'bubble',
    price: 300,
    cosmeticOnly: true,
    visualEffects: ['cloud', 'quote'],
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance']
  },
  {
    id: 'color_1',
    name: 'Default Text Color',
    description: 'Standard black text color',
    category: 'text-color',
    price: 0,
    cosmeticOnly: true,
    visualEffects: ['default-color'],
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance']
  },
  {
    id: 'color_2',
    name: 'Royal Blue',
    description: 'Royal blue text color',
    category: 'text-color',
    price: 400,
    cosmeticOnly: true,
    visualEffects: ['#4169e1', 'accent'],
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance']
  },
  {
    id: 'color_3',
    name: 'Neon Pink',
    description: 'Neon pink text color',
    category: 'text-color',
    price: 400,
    cosmeticOnly: true,
    visualEffects: ['#ff69b4', 'accent'],
    doesNotAffect: ['damage', 'energy', 'cardPower', 'battleChance']
  }
];

export const getAccessoryById = (id: string) => {
  return PROFILE_ACCESSORIES.find(accessory => accessory.id === id) || null;
};

export const getAccessoriesByCategory = (category: string) => {
  return PROFILE_ACCESSORIES.filter(accessory => accessory.category === category);
};
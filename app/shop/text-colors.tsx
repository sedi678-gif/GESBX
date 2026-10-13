// Shop - Text Colors
// Cosmetic only - no gameplay impact

export const TEXT_COLORS = {
  default: {
    id: 'default',
    name: 'Default',
    hex: '#000000',
    description: 'Standard black text color',
    cosmetic: true,
    affects: ['ui-only'],
    doesNotAffect: ['gameplay', 'stats', 'damage', 'energy']
  },
  royalBlue: {
    id: 'royalBlue',
    name: 'Royal Blue',
    hex: '#4169e1',
    description: 'Royal blue text color',
    cosmetic: true,
    affects: ['ui-only'],
    doesNotAffect: ['gameplay', 'stats', 'damage', 'energy']
  },
  neonPink: {
    id: 'neonPink',
    name: 'Neon Pink',
    hex: '#ff69b4',
    description: 'Neon pink text color',
    cosmetic: true,
    affects: ['ui-only'],
    doesNotAffect: ['gameplay', 'stats', 'damage', 'energy']
  },
  gold: {
    id: 'gold',
    name: 'Gold',
    hex: '#ffd700',
    description: 'Gold text color',
    cosmetic: true,
    affects: ['ui-only'],
    doesNotAffect: ['gameplay', 'stats', 'damage', 'energy']
  },
  neonGreen: {
    id: 'neonGreen',
    name: 'Neon Green',
    hex: '#00ff00',
    description: 'Neon green text color',
    cosmetic: true,
    affects: ['ui-only'],
    doesNotAffect: ['gameplay', 'stats', 'damage', 'energy']
  },
  purple: {
    id: 'purple',
    name: 'Purple',
    hex: '#800080',
    description: 'Purple text color',
    cosmetic: true,
    affects: ['ui-only'],
    doesNotAffect: ['gameplay', 'stats', 'damage', 'energy']
  },
  orange: {
    id: 'orange',
    name: 'Orange',
    hex: '#ffa500',
    description: 'Orange text color',
    cosmetic: true,
    affects: ['ui-only'],
    doesNotAffect: ['gameplay', 'stats', 'damage', 'energy']
  },
  white: {
    id: 'white',
    name: 'White',
    hex: '#ffffff',
    description: 'White text color',
    cosmetic: true,
    affects: ['ui-only'],
    doesNotAffect: ['gameplay', 'stats', 'damage', 'energy']
  }
};

export const getTextColorById = (id: string) => {
  return TEXT_COLORS[id] || TEXT_COLORS.default;
};

export const getAllTextColors = () => {
  return Object.values(TEXT_COLORS);
};
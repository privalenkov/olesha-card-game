import type { CardFinish, Rarity } from './types.js';

export const STORAGE_KEY = 'olesha-gacha-state-v1';
export const PACKS_PER_DAY = 1;
export const CARDS_PER_PACK = 5;

export interface RarityMeta {
  label: string;
  hue: string;
  accent: string;
  glow: string;
  gradient: [string, string];
  shadow: string;
}

export const rarityMeta: Record<Rarity, RarityMeta> = {
  common: {
    label: 'Common',
    hue: '#84c7ff',
    accent: '#d6e8ff',
    glow: 'rgba(132, 199, 255, 0.42)',
    gradient: ['#13263b', '#2f6ca8'],
    shadow: '0 18px 40px rgba(67, 119, 177, 0.24)',
  },
  uncommon: {
    label: 'Uncommon',
    hue: '#66ffcb',
    accent: '#defff5',
    glow: 'rgba(102, 255, 203, 0.38)',
    gradient: ['#11382d', '#169d76'],
    shadow: '0 18px 42px rgba(50, 173, 129, 0.26)',
  },
  rare: {
    label: 'Rare',
    hue: '#ffd46b',
    accent: '#fff3ca',
    glow: 'rgba(255, 212, 107, 0.42)',
    gradient: ['#402811', '#b8731b'],
    shadow: '0 18px 46px rgba(208, 146, 48, 0.34)',
  },
  epic: {
    label: 'Epic',
    hue: '#ff7e5f',
    accent: '#ffe1d9',
    glow: 'rgba(255, 126, 95, 0.44)',
    gradient: ['#421919', '#d74724'],
    shadow: '0 18px 50px rgba(215, 71, 36, 0.34)',
  },
  veryrare: {
    label: 'Very Rare',
    hue: '#fff9d8',
    accent: '#ffffff',
    glow: 'rgba(255, 249, 216, 0.5)',
    gradient: ['#355e6d', '#fbf0a9'],
    shadow: '0 20px 60px rgba(251, 240, 169, 0.4)',
  },
};

export const finishMeta: Record<
  CardFinish,
  { label: string; opacity: number; shimmerBoost: number }
> = {
  standard: {
    label: 'Standard',
    opacity: 0.24,
    shimmerBoost: 0.2,
  },
  foil: {
    label: 'Foil',
    opacity: 0.38,
    shimmerBoost: 0.55,
  },
  prismatic: {
    label: 'Prismatic',
    opacity: 0.52,
    shimmerBoost: 0.86,
  },
};

export const rarityWeights = {
  standard: [
    ['common', 58],
    ['uncommon', 24],
    ['rare', 11],
    ['epic', 5],
    ['veryrare', 2],
  ] as Array<[Rarity, number]>,
  featured: [
    ['common', 20],
    ['uncommon', 42],
    ['rare', 22],
    ['epic', 11],
    ['veryrare', 5],
  ] as Array<[Rarity, number]>,
};

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
    hue: '#4A8EE2',
    accent: '#D7E7FF',
    glow: 'rgba(74, 142, 226, 0.42)',
    gradient: ['#101A30', '#4A8EE2'],
    shadow: '0 18px 40px rgba(74, 142, 226, 0.24)',
  },
  uncommon: {
    label: 'Uncommon',
    hue: '#B9E24A',
    accent: '#F0FFC0',
    glow: 'rgba(185, 226, 74, 0.4)',
    gradient: ['#202A0F', '#B9E24A'],
    shadow: '0 18px 42px rgba(185, 226, 74, 0.26)',
  },
  rare: {
    label: 'Rare',
    hue: '#574AE2',
    accent: '#D7D2FF',
    glow: 'rgba(87, 74, 226, 0.44)',
    gradient: ['#18133B', '#574AE2'],
    shadow: '0 18px 46px rgba(87, 74, 226, 0.34)',
  },
  epic: {
    label: 'Epic',
    hue: '#F5D751',
    accent: '#FFF1AE',
    glow: 'rgba(245, 215, 81, 0.46)',
    gradient: ['#3B320F', '#F5D751'],
    shadow: '0 18px 50px rgba(245, 215, 81, 0.34)',
  },
  veryrare: {
    label: 'Very Rare',
    hue: '#FFFFFF',
    accent: '#ffffff',
    glow: 'rgba(255, 255, 255, 0.52)',
    gradient: ['#33404F', '#FFFFFF'],
    shadow: '0 20px 60px rgba(255, 255, 255, 0.4)',
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

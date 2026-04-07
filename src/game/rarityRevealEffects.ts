import commonImpactIconUrl from '../assets/icons/common.svg';
import uncommonImpactIconUrl from '../assets/icons/uncommon.svg';
import rareImpactIconUrl from '../assets/icons/rare.svg';
import epicImpactIconUrl from '../assets/icons/epic.svg';
import veryRareImpactIconUrl from '../assets/icons/veryrare.svg';
import type { Rarity } from './types';

export interface RarityRevealImpactProfile {
  iconUrl: string;
  flashOpacity: number;
  count: number;
  reach: number;
  verticalReach: number;
  sizeMin: number;
  sizeMax: number;
  delaySpread: number;
  burstWindow: number;
  orbit: number;
  depthSpread: number;
  angleJitter: number;
  radiusStartMin: number;
  radiusStartMax: number;
  bandOffset: number;
  spinFactor: number;
}

export const rarityRevealImpactOrder: Rarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'veryrare',
];

export const rarityRevealImpactDurationsMs: Record<Rarity, number> = {
  common: 240,
  uncommon: 460,
  rare: 2400,
  epic: 2600,
  veryrare: 2800,
};

export const rarityRevealImpactProfiles: Record<Rarity, RarityRevealImpactProfile> = {
  common: {
    iconUrl: commonImpactIconUrl,
    flashOpacity: 0,
    count: 8,
    reach: 1.7,
    verticalReach: 0.7,
    sizeMin: 0.2,
    sizeMax: 0.3,
    delaySpread: 0.022,
    burstWindow: 0.14,
    orbit: 0.08,
    depthSpread: 0.05,
    angleJitter: 0.24,
    radiusStartMin: 0.1,
    radiusStartMax: 0.22,
    bandOffset: 0.07,
    spinFactor: 0.82,
  },
  uncommon: {
    iconUrl: uncommonImpactIconUrl,
    flashOpacity: 0,
    count: 12,
    reach: 2.05,
    verticalReach: 0.86,
    sizeMin: 0.23,
    sizeMax: 0.34,
    delaySpread: 0.03,
    burstWindow: 0.16,
    orbit: 0.12,
    depthSpread: 0.06,
    angleJitter: 0.3,
    radiusStartMin: 0.12,
    radiusStartMax: 0.24,
    bandOffset: 0.09,
    spinFactor: 0.98,
  },
  rare: {
    iconUrl: rareImpactIconUrl,
    flashOpacity: 1,
    count: 26,
    reach: 3.3,
    verticalReach: 1.32,
    sizeMin: 0.28,
    sizeMax: 0.5,
    delaySpread: 0.048,
    burstWindow: 0.21,
    orbit: 0.24,
    depthSpread: 0.11,
    angleJitter: 0.46,
    radiusStartMin: 0.16,
    radiusStartMax: 0.38,
    bandOffset: 0.17,
    spinFactor: 1.38,
  },
  epic: {
    iconUrl: epicImpactIconUrl,
    flashOpacity: 1,
    count: 40,
    reach: 4.2,
    verticalReach: 1.82,
    sizeMin: 0.34,
    sizeMax: 0.66,
    delaySpread: 0.065,
    burstWindow: 0.24,
    orbit: 0.34,
    depthSpread: 0.16,
    angleJitter: 0.56,
    radiusStartMin: 0.18,
    radiusStartMax: 0.42,
    bandOffset: 0.22,
    spinFactor: 1.56,
  },
  veryrare: {
    iconUrl: veryRareImpactIconUrl,
    flashOpacity: 1,
    count: 58,
    reach: 5.45,
    verticalReach: 2.4,
    sizeMin: 0.4,
    sizeMax: 0.82,
    delaySpread: 0.082,
    burstWindow: 0.28,
    orbit: 0.52,
    depthSpread: 0.22,
    angleJitter: 0.66,
    radiusStartMin: 0.22,
    radiusStartMax: 0.48,
    bandOffset: 0.28,
    spinFactor: 1.78,
  },
};

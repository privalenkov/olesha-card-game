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

export const rarityRevealImpactProfiles: Record<Rarity, RarityRevealImpactProfile> = {
  common: {
    iconUrl: commonImpactIconUrl,
    flashOpacity: 0,
    count: 6,
    reach: 1.35,
    verticalReach: 0.54,
    sizeMin: 0.16,
    sizeMax: 0.24,
    delaySpread: 0.018,
    burstWindow: 0.12,
    orbit: 0.06,
    depthSpread: 0.04,
    angleJitter: 0.2,
    radiusStartMin: 0.08,
    radiusStartMax: 0.18,
    bandOffset: 0.05,
    spinFactor: 0.7,
  },
  uncommon: {
    iconUrl: uncommonImpactIconUrl,
    flashOpacity: 0,
    count: 8,
    reach: 1.55,
    verticalReach: 0.66,
    sizeMin: 0.18,
    sizeMax: 0.28,
    delaySpread: 0.024,
    burstWindow: 0.14,
    orbit: 0.08,
    depthSpread: 0.05,
    angleJitter: 0.24,
    radiusStartMin: 0.1,
    radiusStartMax: 0.2,
    bandOffset: 0.06,
    spinFactor: 0.82,
  },
  rare: {
    iconUrl: rareImpactIconUrl,
    flashOpacity: 1,
    count: 18,
    reach: 2.55,
    verticalReach: 1.04,
    sizeMin: 0.22,
    sizeMax: 0.38,
    delaySpread: 0.04,
    burstWindow: 0.18,
    orbit: 0.18,
    depthSpread: 0.08,
    angleJitter: 0.36,
    radiusStartMin: 0.12,
    radiusStartMax: 0.32,
    bandOffset: 0.12,
    spinFactor: 1.2,
  },
  epic: {
    iconUrl: epicImpactIconUrl,
    flashOpacity: 1,
    count: 28,
    reach: 3.05,
    verticalReach: 1.38,
    sizeMin: 0.24,
    sizeMax: 0.48,
    delaySpread: 0.055,
    burstWindow: 0.2,
    orbit: 0.26,
    depthSpread: 0.12,
    angleJitter: 0.42,
    radiusStartMin: 0.14,
    radiusStartMax: 0.34,
    bandOffset: 0.15,
    spinFactor: 1.34,
  },
  veryrare: {
    iconUrl: veryRareImpactIconUrl,
    flashOpacity: 1,
    count: 40,
    reach: 4.15,
    verticalReach: 1.9,
    sizeMin: 0.26,
    sizeMax: 0.6,
    delaySpread: 0.075,
    burstWindow: 0.22,
    orbit: 0.42,
    depthSpread: 0.16,
    angleJitter: 0.5,
    radiusStartMin: 0.16,
    radiusStartMax: 0.36,
    bandOffset: 0.18,
    spinFactor: 1.5,
  },
};

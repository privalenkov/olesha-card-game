import type { Rarity } from '../src/game/types.js';

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

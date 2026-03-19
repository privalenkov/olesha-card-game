import { CARDS_PER_PACK, rarityWeights } from './config.js';
import type { Rarity, RarityBalanceSnapshot } from './types.js';

export const rarityOrder: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'veryrare'];

const PROPOSAL_REBALANCE_STRENGTH = 1.6;
const PROPOSAL_REBALANCE_MIN_MULTIPLIER = 0.35;
const PROPOSAL_REBALANCE_MAX_MULTIPLIER = 2.6;
const PROPOSAL_REBALANCE_FULL_AT_CATALOG_SIZE = 10;

export function createEmptyRarityCountMap(): Record<Rarity, number> {
  return {
    common: 0,
    uncommon: 0,
    rare: 0,
    epic: 0,
    veryrare: 0,
  };
}

export function countItemsByRarity<T extends { rarity: Rarity }>(items: T[]): Record<Rarity, number> {
  return items.reduce((acc, item) => {
    acc[item.rarity] += 1;
    return acc;
  }, createEmptyRarityCountMap());
}

export function getTotalRarityCount(counts: Record<Rarity, number>) {
  return rarityOrder.reduce((sum, rarity) => sum + counts[rarity], 0);
}

function normalizeWeightEntries(weights: Array<[Rarity, number]>): Array<[Rarity, number]> {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);

  if (total <= 0) {
    const evenWeight = 1 / Math.max(weights.length, 1);
    return weights.map(([rarity]) => [rarity, evenWeight]);
  }

  return weights.map(([rarity, weight]) => [rarity, weight / total]);
}

export const targetCatalogShareByRarity = (() => {
  const expectedPackCounts = createEmptyRarityCountMap();

  for (let slotIndex = 0; slotIndex < CARDS_PER_PACK; slotIndex += 1) {
    const weights = slotIndex === CARDS_PER_PACK - 1 ? rarityWeights.featured : rarityWeights.standard;

    for (const [rarity, chance] of normalizeWeightEntries(weights)) {
      expectedPackCounts[rarity] += chance;
    }
  }

  return rarityOrder.reduce<Record<Rarity, number>>((acc, rarity) => {
    acc[rarity] = expectedPackCounts[rarity] / CARDS_PER_PACK;
    return acc;
  }, createEmptyRarityCountMap());
})();

export function getProposalRarityWeights(counts: Record<Rarity, number>): Array<[Rarity, number]> {
  const totalCatalogCards = getTotalRarityCount(counts);
  const adaptivity = Math.min(totalCatalogCards / PROPOSAL_REBALANCE_FULL_AT_CATALOG_SIZE, 1);

  return rarityOrder.map((rarity) => {
    const targetShare = targetCatalogShareByRarity[rarity];
    const baseWeight = targetShare * 100;

    if (totalCatalogCards <= 0) {
      return [rarity, baseWeight];
    }

    const currentShare = counts[rarity] / totalCatalogCards;
    const relativeDeficit = (targetShare - currentShare) / Math.max(targetShare, 0.0001);
    const adaptiveMultiplier = Math.max(
      PROPOSAL_REBALANCE_MIN_MULTIPLIER,
      Math.min(1 + relativeDeficit * PROPOSAL_REBALANCE_STRENGTH, PROPOSAL_REBALANCE_MAX_MULTIPLIER),
    );
    const smoothedMultiplier = 1 + (adaptiveMultiplier - 1) * adaptivity;

    return [rarity, Math.max(baseWeight * smoothedMultiplier, 0.001)];
  });
}

export function getRarityChanceMap(weights: Array<[Rarity, number]>): Record<Rarity, number> {
  return normalizeWeightEntries(weights).reduce<Record<Rarity, number>>((acc, [rarity, chance]) => {
    acc[rarity] = chance;
    return acc;
  }, createEmptyRarityCountMap());
}

export function getPackSlotRarityWeights(
  baseWeights: Array<[Rarity, number]>,
  counts: Record<Rarity, number>,
): Array<[Rarity, number]> {
  const availableWeights = baseWeights.filter(([rarity]) => counts[rarity] > 0);
  return availableWeights.length > 0 ? availableWeights : [...baseWeights];
}

export function buildRarityBalanceSnapshot<T extends { rarity: Rarity }>(
  items: T[],
): RarityBalanceSnapshot {
  const counts = countItemsByRarity(items);
  const totalCatalogCards = getTotalRarityCount(counts);
  const proposalChanceByRarity = getRarityChanceMap(getProposalRarityWeights(counts));

  return {
    totalCatalogCards,
    entries: rarityOrder.map((rarity) => ({
      rarity,
      catalogCount: counts[rarity],
      catalogShare: totalCatalogCards > 0 ? counts[rarity] / totalCatalogCards : 0,
      targetCatalogShare: targetCatalogShareByRarity[rarity],
      proposalChance: proposalChanceByRarity[rarity],
    })),
  };
}

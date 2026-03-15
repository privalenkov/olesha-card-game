import { CARDS_PER_PACK, rarityWeights } from './config';
import { cardPool, cardsByRarity } from '../data/cardPool';
import type { CardDefinition, CardFinish, OwnedCard, Rarity } from './types';

function weightedPick(weights: Array<[Rarity, number]>): Rarity {
  const total = weights.reduce((sum, [, value]) => sum + value, 0);
  let roll = Math.random() * total;

  for (const [rarity, weight] of weights) {
    roll -= weight;
    if (roll <= 0) {
      return rarity;
    }
  }

  return 'common';
}

function pickFromPool(pool: CardDefinition[], excludedIds: Set<string>): CardDefinition {
  const available = pool.filter((card) => !excludedIds.has(card.id));
  const targetPool = available.length > 0 ? available : pool;
  const selected = targetPool[Math.floor(Math.random() * targetPool.length)];
  excludedIds.add(selected.id);
  return selected;
}

function getFinish(rarity: Rarity): CardFinish {
  const roll = Math.random();

  if (rarity === 'veryrare') {
    return 'prismatic';
  }

  if (rarity === 'epic') {
    return roll > 0.35 ? 'prismatic' : 'foil';
  }

  if (rarity === 'rare') {
    return roll > 0.56 ? 'foil' : 'standard';
  }

  if (rarity === 'uncommon') {
    return roll > 0.74 ? 'foil' : 'standard';
  }

  return roll > 0.92 ? 'foil' : 'standard';
}

function createOwnedCard(
  card: CardDefinition,
  packNumber: number,
  timestamp: string,
): OwnedCard {
  const uniqueBits = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    ...card,
    instanceId: uniqueBits,
    acquiredAt: timestamp,
    packNumber,
    finish: getFinish(card.rarity),
    holographicSeed: Math.random(),
  };
}

export function rollPack(packNumber: number): OwnedCard[] {
  const excludedIds = new Set<string>();
  const timestamp = new Date().toISOString();
  const pulled: OwnedCard[] = [];

  for (let slot = 0; slot < CARDS_PER_PACK; slot += 1) {
    const weights = slot === CARDS_PER_PACK - 1
      ? rarityWeights.featured
      : rarityWeights.standard;
    const rarity = weightedPick(weights);
    const card = pickFromPool(cardsByRarity[rarity], excludedIds);
    pulled.push(createOwnedCard(card, packNumber, timestamp));
  }

  return pulled;
}

export function groupCollectionByRarity(collection: OwnedCard[]) {
  return collection.reduce(
    (acc, card) => {
      acc[card.rarity] += 1;
      return acc;
    },
    {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      veryrare: 0,
    },
  );
}

export function getCollectionPower(collection: OwnedCard[]): number {
  if (collection.length === 0) {
    return 0;
  }

  return Math.round(
    collection.reduce((sum, card) => sum + card.stats.power + card.stats.fame, 0) /
      collection.length,
  );
}

export function pickFeaturedCards(limit = 3): CardDefinition[] {
  const sorted = [...cardPool].sort(
    (left, right) => right.stats.rarityScore - left.stats.rarityScore,
  );
  return sorted.slice(0, limit);
}

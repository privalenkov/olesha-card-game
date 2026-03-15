import type { CardDefinition, CardProposal, OwnedCard, Rarity } from './types';

const previewStatsByRarity: Record<
  Rarity,
  { power: number; cringe: number; fame: number; rarityScore: number; humor: number }
> = {
  common: { power: 46, cringe: 42, fame: 45, rarityScore: 30, humor: 49 },
  uncommon: { power: 54, cringe: 52, fame: 57, rarityScore: 48, humor: 58 },
  rare: { power: 66, cringe: 60, fame: 69, rarityScore: 64, humor: 68 },
  epic: { power: 78, cringe: 70, fame: 80, rarityScore: 82, humor: 74 },
  veryrare: { power: 90, cringe: 76, fame: 92, rarityScore: 96, humor: 81 },
};

export function buildPreviewOwnedCard(proposal: CardProposal): OwnedCard {
  return {
    id: proposal.id,
    instanceId: proposal.id,
    title: proposal.title,
    urlImage: proposal.urlImage,
    rarity: proposal.rarity,
    description: proposal.description,
    stats: previewStatsByRarity[proposal.rarity],
    acquiredAt: proposal.updatedAt,
    packNumber: 1,
    finish: proposal.defaultFinish,
    holographicSeed: 0.42,
    defaultFinish: proposal.defaultFinish,
    visuals: proposal.visuals,
    creatorName: proposal.creatorName,
    effectLayers: proposal.effectLayers,
  };
}

export function buildPreviewCardFromDefinition(card: CardDefinition): OwnedCard {
  return {
    ...card,
    instanceId: card.id,
    acquiredAt: new Date(0).toISOString(),
    packNumber: 1,
    finish: card.defaultFinish ?? 'standard',
    holographicSeed: 0.42,
  };
}

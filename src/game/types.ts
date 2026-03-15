export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'veryrare';

export type CardFinish = 'standard' | 'foil' | 'prismatic';

export interface CardStats {
  power: number;
  cringe: number;
  fame: number;
  rarityScore: number;
  humor: number;
}

export interface CardDefinition {
  id: string;
  title: string;
  urlImage: string;
  rarity: Rarity;
  description: string;
  stats: CardStats;
}

export interface OwnedCard extends CardDefinition {
  instanceId: string;
  acquiredAt: string;
  packNumber: number;
  finish: CardFinish;
  holographicSeed: number;
}

export interface GameState {
  version: number;
  lastActiveDate: string;
  packsOpenedToday: number;
  totalPacksOpened: number;
  collection: OwnedCard[];
}

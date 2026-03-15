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

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface RemoteGameState {
  collection: OwnedCard[];
  packsOpenedToday: number;
  totalPacksOpened: number;
  remainingPacks: number;
  dailyPackLimit: number;
  nextPackResetAt: string;
  serverNow: string;
}

export interface SessionState {
  authenticated: boolean;
  authConfigured: boolean;
  user: AuthUser | null;
  game: RemoteGameState | null;
}

export interface OpenPackResult {
  pack: OwnedCard[];
  game: RemoteGameState;
}

export interface UpdateNicknameResult {
  user: AuthUser;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  nextPackResetAt?: string;
}

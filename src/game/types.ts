export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'veryrare';

export type CardFinish = 'standard' | 'foil' | 'prismatic';
export type CardFrameStyle = 'aurora' | 'ember' | 'mint' | 'onyx' | 'plasma';
export type CardTreatmentEffect =
  | 'spot_gloss'
  | 'spot_holo'
  | 'texture_sugar'
  | 'sparkle_foil'
  | 'emboss'
  | 'prismatic_edge';
export type ProposalStatus = 'draft' | 'pending' | 'approved' | 'deleted';

export interface CardStats {
  power: number;
  cringe: number;
  fame: number;
  rarityScore: number;
  humor: number;
}

export interface CardDecorativePattern {
  svgUrl: string;
  size: number;
  gap: number;
  opacity: number;
  offsetX: number;
  offsetY: number;
}

export interface CardVisuals {
  frameStyle: CardFrameStyle;
  accentColor: string;
  decorativePattern: CardDecorativePattern;
}

export interface CardEffectLayer {
  id: string;
  type: CardTreatmentEffect;
  maskUrl: string;
  opacity: number;
  shimmer: number;
  relief: number;
}

export const CARD_FRAME_STYLE_OPTIONS: CardFrameStyle[] = [
  'aurora',
  'ember',
  'mint',
  'onyx',
  'plasma',
];

export const CARD_FINISH_OPTIONS: CardFinish[] = ['standard', 'foil', 'prismatic'];

export const CARD_TREATMENT_EFFECT_OPTIONS: CardTreatmentEffect[] = [
  'spot_gloss',
  'spot_holo',
  'texture_sugar',
  'sparkle_foil',
  'emboss',
  'prismatic_edge',
];

export const CARD_TREATMENT_EFFECT_LABELS: Record<CardTreatmentEffect, string> = {
  spot_gloss: 'Глянцевая ламинация',
  spot_holo: 'Голографическая ламинация',
  texture_sugar: 'Алмазная пыль',
  sparkle_foil: 'Искристая ламинация',
  emboss: 'Рельефная ламинация',
  prismatic_edge: 'Призматическая ламинация',
};

export const CARD_TREATMENT_EFFECT_DESCRIPTIONS: Record<CardTreatmentEffect, string> = {
  spot_gloss: 'Локальная глянцевая ламинация по маске.',
  spot_holo: 'Локальная радужная ламинация по выбранным зонам.',
  texture_sugar: 'Глиттерная ламинация с мелкими переливающимися точками.',
  sparkle_foil: 'Ламинация с яркими искрами и плотными бликами.',
  emboss: 'Ламинация с выпуклым рельефом, который ловит свет.',
  prismatic_edge: 'Призматический перелив для кантов и контуров.',
};

export const CARD_ACCENT_SWATCHES = [
  '#8de5ff',
  '#ffb36a',
  '#7bffca',
  '#ff8ca8',
  '#bca8ff',
  '#fff17f',
] as const;

export function getDefaultDecorativePattern(): CardDecorativePattern {
  return {
    svgUrl: '',
    size: 88,
    gap: 26,
    opacity: 0.2,
    offsetX: 0,
    offsetY: 0,
  };
}

export function getDefaultCardVisuals(): CardVisuals {
  return {
    frameStyle: 'aurora',
    accentColor: CARD_ACCENT_SWATCHES[0],
    decorativePattern: getDefaultDecorativePattern(),
  };
}

export function getDefaultEffectLayer(
  type: CardTreatmentEffect,
  id = '',
): CardEffectLayer {
  const opacityByType: Record<CardTreatmentEffect, number> = {
    spot_gloss: 0.5,
    spot_holo: 0.82,
    texture_sugar: 0.62,
    sparkle_foil: 0.86,
    emboss: 0.74,
    prismatic_edge: 0.9,
  };

  return {
    id,
    type,
    maskUrl: '',
    opacity: opacityByType[type],
    shimmer: 1,
    relief: 0,
  };
}

export interface CardDefinition {
  id: string;
  title: string;
  urlImage: string;
  rarity: Rarity;
  description: string;
  stats: CardStats;
  defaultFinish?: CardFinish;
  visuals?: CardVisuals;
  creatorName?: string | null;
  effectLayers?: CardEffectLayer[];
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
  googleSub?: string;
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
  isAdmin: boolean;
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

export interface CardProposal {
  id: string;
  creatorUserId: string;
  creatorName: string;
  rarity: Rarity;
  status: ProposalStatus;
  title: string;
  description: string;
  urlImage: string;
  defaultFinish: CardFinish;
  visuals: CardVisuals;
  allowedEffects: CardTreatmentEffect[];
  maxEffectLayers: number;
  effectLayers: CardEffectLayer[];
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
}

export interface ProposalEditorPayload {
  title: string;
  description: string;
  urlImage: string;
  defaultFinish: CardFinish;
  visuals: CardVisuals;
  effectLayers: CardEffectLayer[];
}

export interface AdminProposalOverridePayload {
  rarity: Rarity;
  allowedEffects: CardTreatmentEffect[];
}

export interface StartProposalResult {
  proposal: CardProposal;
}

export interface UpdateProposalResult {
  proposal: CardProposal;
}

export interface ProposalListResult {
  proposals: CardProposal[];
}

export interface UploadCardArtResult {
  url: string;
}

export interface AdminCatalogCard {
  card: CardDefinition;
  totalOwned: number;
  uniqueOwners: number;
  updatedAt: string;
  dropChancePerPack: number;
}

export interface AdminCatalogResult {
  cards: AdminCatalogCard[];
}

export interface AdminUserRecord {
  id: string;
  googleSub: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  totalCards: number;
  uniqueCards: number;
  packsOpened: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserListResult {
  users: AdminUserRecord[];
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  nextPackResetAt?: string;
}

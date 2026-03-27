export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'veryrare';

export type CardFinish = 'standard' | 'foil' | 'prismatic';
export type CardFrameStyle = 'aurora' | 'ember' | 'mint' | 'onyx' | 'plasma';
export type CardTreatmentEffect =
  | 'spot_gloss'
  | 'spot_holo'
  | 'texture_sugar'
  | 'sparkle_foil'
  | 'emboss'
  | 'prismatic_edge'
  | 'holo_wave'
  | 'holo_cracked';
export type ProposalStatus = 'draft' | 'pending' | 'approved' | 'deleted';
export type AppNotificationKind = 'info' | 'success' | 'error';
export type AppNotificationState = 'active' | 'leaving';

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
  'holo_wave',
  'holo_cracked',
];

export const CARD_TREATMENT_EFFECT_LABELS: Record<CardTreatmentEffect, string> = {
  spot_gloss: 'Глянцевая ламинация',
  spot_holo: 'Голографическая ламинация',
  texture_sugar: 'Алмазная пыль',
  sparkle_foil: 'Искристая ламинация',
  emboss: 'Рельефная ламинация',
  prismatic_edge: 'Призматическая ламинация',
  holo_wave: 'Волновая голография',
  holo_cracked: 'Битое стекло',
};

export const CARD_TREATMENT_EFFECT_DESCRIPTIONS: Record<CardTreatmentEffect, string> = {
  spot_gloss: 'Локальная глянцевая ламинация по маске.',
  spot_holo: 'Локальная радужная ламинация по выбранным зонам.',
  texture_sugar: 'Глиттерная ламинация с мелкими переливающимися точками.',
  sparkle_foil: 'Ламинация с яркими искрами и плотными бликами.',
  emboss: 'Ламинация с выпуклым рельефом, который ловит свет.',
  prismatic_edge: 'Призматический перелив для кантов и контуров.',
  holo_wave: 'Крупные органические ячейки с волновым радужным переливом.',
  holo_cracked: 'Осколочная текстура: мелкие грани переливаются каждая в своём цвете.',
};

const LEGACY_CARD_TREATMENT_EFFECT_ALIASES: Record<string, CardTreatmentEffect> = {
  holo_classic: 'spot_holo',
};

const CARD_TREATMENT_EFFECT_OPTION_SET = new Set<CardTreatmentEffect>(
  CARD_TREATMENT_EFFECT_OPTIONS,
);

export function normalizeCardTreatmentEffect(
  effect: string | null | undefined,
): CardTreatmentEffect | null {
  if (!effect) {
    return null;
  }

  const normalized = LEGACY_CARD_TREATMENT_EFFECT_ALIASES[effect] ?? effect;
  return CARD_TREATMENT_EFFECT_OPTION_SET.has(normalized as CardTreatmentEffect)
    ? (normalized as CardTreatmentEffect)
    : null;
}

export function normalizeCardTreatmentEffects(
  effects: ReadonlyArray<string> | null | undefined,
): CardTreatmentEffect[] {
  if (!effects || effects.length === 0) {
    return [];
  }

  const seen = new Set<CardTreatmentEffect>();
  const normalized: CardTreatmentEffect[] = [];

  effects.forEach((effect) => {
    const nextEffect = normalizeCardTreatmentEffect(effect);
    if (!nextEffect || seen.has(nextEffect)) {
      return;
    }

    seen.add(nextEffect);
    normalized.push(nextEffect);
  });

  return normalized;
}

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'Черновик',
  pending: 'На модерации',
  approved: 'Принята',
  deleted: 'Отклонена',
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

export function clampEffectShimmer(type: CardTreatmentEffect, shimmer: number) {
  if (type === 'spot_gloss') {
    return Math.max(0, Math.min(shimmer, 1));
  }

  return Math.max(0.2, Math.min(shimmer, 1.4));
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
    holo_wave: 0.9,
    holo_cracked: 0.88,
  };

  return {
    id,
    type,
    maskUrl: '',
    opacity: opacityByType[type],
    shimmer:
      type === 'spot_gloss'
        ? 0.6
        : type === 'holo_wave' || type === 'holo_cracked'
          ? 1.1
          : 1,
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
  creatorShareSlug?: string | null;
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
  shareSlug: string;
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

export interface AppNotification {
  id: string;
  kind: AppNotificationKind;
  title: string | null;
  message: string;
  proposalId: string | null;
  cardInstanceId: string | null;
  createdAt: string;
  state?: AppNotificationState;
}

export interface OpenPackResult {
  pack: OwnedCard[];
  game: RemoteGameState;
}

export interface UpdateNicknameResult {
  user: AuthUser;
}

export interface PublicPlayerProfile {
  id: string;
  name: string;
  shareSlug: string;
  avatarUrl: string | null;
}

export type CollectionFilter = 'all' | 'duplicates';

export interface CollectionSummary {
  totalCards: number;
  duplicateCards: number;
}

export interface PublicShowcaseResult extends CollectionSummary {
  user: PublicPlayerProfile;
  cards: OwnedCard[];
  filter: CollectionFilter;
  offset: number;
  limit: number;
  filteredTotal: number;
  hasMore: boolean;
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
  rejectionReason: string | null;
}

export interface RarityBalanceEntry {
  rarity: Rarity;
  catalogCount: number;
  catalogShare: number;
  targetCatalogShare: number;
  proposalChance: number;
}

export interface RarityBalanceSnapshot {
  totalCatalogCards: number;
  entries: RarityBalanceEntry[];
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
  rarityBalance: RarityBalanceSnapshot;
}

export interface FetchProposalResult {
  proposal: CardProposal;
  rarityBalance: RarityBalanceSnapshot;
}

export interface UpdateProposalResult {
  proposal: CardProposal;
}

export interface ProposalListResult {
  proposals: CardProposal[];
}

export interface NotificationListResult {
  notifications: AppNotification[];
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
  rarityBalance: RarityBalanceSnapshot;
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
  packsOpenedToday: number;
  extraPacksGrantedToday: number;
  remainingPacksToday: number;
  dailyPackLimit: number;
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

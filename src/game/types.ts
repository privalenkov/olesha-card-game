export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'veryrare';
export const rarityOrder: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'veryrare'];

export type CardFinish = 'standard' | 'foil' | 'prismatic';
export type CardFrameStyle = 'aurora' | 'ember' | 'mint' | 'onyx' | 'plasma';
export type CardLayoutType = 'type1' | 'type2' | 'type3' | 'type4';
export type CardTreatmentEffect =
  | 'spot_gloss'
  | 'spot_holo'
  | 'texture_sugar'
  | 'sparkle_foil'
  | 'emboss'
  | 'prismatic_edge'
  | 'dimensional_lamination'
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
  cardType: CardLayoutType;
  frameStyle: CardFrameStyle;
  accentColor: string;
  decorativePattern: CardDecorativePattern;
  layerOneFill: string;
  layerTwoFill: string;
  lenticularImageUrl: string;
}

export interface CardEffectLayer {
  id: string;
  type: CardTreatmentEffect;
  maskUrl: string;
  opacity: number;
  shimmer: number;
  relief: number;
  offsetX: number;
  offsetY: number;
  subdivision: number;
}

export const CARD_FRAME_STYLE_OPTIONS: CardFrameStyle[] = [
  'aurora',
  'ember',
  'mint',
  'onyx',
  'plasma',
];

export const CARD_LAYOUT_TYPE_OPTIONS: CardLayoutType[] = ['type1', 'type2', 'type3', 'type4'];

export const CARD_LAYOUT_TYPE_LABELS: Record<CardLayoutType, string> = {
  type1: 'Тип 1',
  type2: 'Тип 2',
  type3: 'Тип 3',
  type4: 'Тип 4',
};

export const CARD_FINISH_OPTIONS: CardFinish[] = ['standard', 'foil', 'prismatic'];

export const CARD_TREATMENT_EFFECT_OPTIONS: CardTreatmentEffect[] = [
  'spot_gloss',
  'spot_holo',
  'texture_sugar',
  'sparkle_foil',
  'emboss',
  'prismatic_edge',
  'dimensional_lamination',
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
  dimensional_lamination: 'Трехмерная ламинация',
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
  dimensional_lamination:
    'Выбранная маска переносится на поднятый слой поверх карточки с отдельным сдвигом.',
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
  '#9B998F',
  '#8de5ff',
  '#ffb36a',
  '#7bffca',
  '#ff8ca8',
  '#bca8ff',
] as const;

export const DEFAULT_CARD_LAYER_ONE_FILL = '#D2D0C6';
export const DEFAULT_CARD_LAYER_TWO_FILL = '#F1EFE3';

export const CARD_LAYER_ONE_FILL_PRESETS = [
  DEFAULT_CARD_LAYER_ONE_FILL,
  'linear-gradient(145deg, rgba(49,21,13,1) 0%, rgba(106,37,24,1) 100%)',
  'linear-gradient(145deg, rgba(15,41,34,1) 0%, rgba(30,90,74,1) 100%)',
  'linear-gradient(145deg, rgba(17,18,22,1) 0%, rgba(49,51,61,1) 100%)',
  'linear-gradient(145deg, rgba(28,21,54,1) 0%, rgba(39,77,111,1) 100%)',
  'linear-gradient(145deg, rgba(73,18,84,1) 0%, rgba(109,26,118,1) 100%)',
] as const;

export const CARD_LAYER_TWO_FILL_PRESETS = [
  DEFAULT_CARD_LAYER_TWO_FILL,
  'linear-gradient(180deg, rgba(255,248,238,1) 0%, rgba(244,222,208,1) 100%)',
  'linear-gradient(180deg, rgba(240,251,245,1) 0%, rgba(211,240,225,1) 100%)',
  'linear-gradient(180deg, rgba(242,247,255,1) 0%, rgba(214,226,245,1) 100%)',
  'linear-gradient(180deg, rgba(250,240,255,1) 0%, rgba(228,214,241,1) 100%)',
  'linear-gradient(180deg, rgba(250,250,250,1) 0%, rgba(228,228,228,1) 100%)',
] as const;

const CARD_LAYER_FILL_ALLOWED_PATTERN = /^[#(),.%\sa-zA-Z0-9-]+$/u;
const CARD_LAYER_FILL_COLOR_PATTERNS = [
  /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/iu,
  /^rgba?\([^)]+\)$/iu,
  /^hsla?\([^)]+\)$/iu,
];

export function normalizeCardLayerFill(
  value: string | null | undefined,
  fallback: string,
) {
  const normalized = value?.trim() ?? '';

  if (
    normalized.length === 0 ||
    normalized.length > 320 ||
    !CARD_LAYER_FILL_ALLOWED_PATTERN.test(normalized)
  ) {
    return fallback;
  }

  if (CARD_LAYER_FILL_COLOR_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return normalized;
  }

  if (/^linear-gradient\(.+\)$/iu.test(normalized)) {
    return normalized;
  }

  return fallback;
}

export function isGradientCardLayerFill(value: string | null | undefined) {
  const normalized = value?.trim() ?? '';
  return /^linear-gradient\(.+\)$/iu.test(normalized);
}

export function normalizeCardLayerFillForCapability(
  value: string | null | undefined,
  fallback: string,
  gradientFillEnabled: boolean,
) {
  const normalized = normalizeCardLayerFill(value, fallback);

  if (!gradientFillEnabled && isGradientCardLayerFill(normalized)) {
    return fallback;
  }

  return normalized;
}

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
    cardType: 'type1',
    frameStyle: 'aurora',
    accentColor: CARD_ACCENT_SWATCHES[0],
    decorativePattern: getDefaultDecorativePattern(),
    layerOneFill: DEFAULT_CARD_LAYER_ONE_FILL,
    layerTwoFill: DEFAULT_CARD_LAYER_TWO_FILL,
    lenticularImageUrl: '',
  };
}

export function normalizeCardLayoutType(
  value: string | null | undefined,
): CardLayoutType | null {
  if (!value) {
    return null;
  }

  return CARD_LAYOUT_TYPE_OPTIONS.includes(value as CardLayoutType)
    ? (value as CardLayoutType)
    : null;
}

export function normalizeCardLayoutTypes(
  values: ReadonlyArray<string> | null | undefined,
): CardLayoutType[] {
  if (!values || values.length === 0) {
    return [];
  }

  const seen = new Set<CardLayoutType>();
  const normalized: CardLayoutType[] = [];

  for (const value of values) {
    const layoutType = normalizeCardLayoutType(value);

    if (!layoutType || seen.has(layoutType)) {
      continue;
    }

    seen.add(layoutType);
    normalized.push(layoutType);
  }

  return normalized;
}

export interface ProposalEditorCapabilities {
  decorativePattern: boolean;
  gradientFill: boolean;
  lenticularImage: boolean;
}

export function clampEffectShimmer(type: CardTreatmentEffect, shimmer: number) {
  if (type === 'spot_gloss') {
    return Math.max(0, Math.min(shimmer, 1));
  }

  if (type === 'dimensional_lamination') {
    return Math.max(0.2, Math.min(shimmer, 5));
  }

  return Math.max(0.2, Math.min(shimmer, 1.4));
}

export function clampWaveHoloSubdivision(subdivision: number) {
  return Math.max(1, Math.min(Math.round(subdivision), 5));
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
    dimensional_lamination: 0.92,
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
        : type === 'dimensional_lamination'
          ? 0.72
          : type === 'holo_wave' || type === 'holo_cracked'
          ? 1.1
          : 1,
    relief: 0,
    offsetX: type === 'dimensional_lamination' ? 0.018 : 0,
    offsetY: type === 'dimensional_lamination' ? -0.018 : 0,
    subdivision: 1,
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

export type CollectionFilter = 'all' | 'duplicates' | 'created';

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
  editorCapabilities: ProposalEditorCapabilities;
  allowedCardTypes: CardLayoutType[];
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
  allowedCardTypes?: CardLayoutType[];
  allowedEffects: CardTreatmentEffect[];
}

export interface StartProposalResult {
  created: boolean;
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

export interface DeleteAdminCardResult {
  ok: true;
  cardId: string;
  deletedOwnedCount: number;
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
  proposalsCreatedToday: number;
  extraProposalsGrantedToday: number;
  remainingProposalsToday: number;
  dailyProposalLimit: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserListResult {
  users: AdminUserRecord[];
}

export interface ApiErrorResponse {
  error: string;
  title?: string;
  message: string;
  nextPackResetAt?: string;
}

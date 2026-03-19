import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { CARDS_PER_PACK, proposalRarityWeights, rarityWeights } from '../src/game/config.js';
import type {
  AdminCatalogCard,
  AppNotification,
  AppNotificationKind,
  AdminUserRecord,
  AuthUser,
  CardDecorativePattern,
  CardEffectLayer,
  CardProposal,
  CardDefinition,
  CardFinish,
  CardTreatmentEffect,
  CardVisuals,
  OpenPackResult,
  OwnedCard,
  ProposalEditorPayload,
  PublicPlayerProfile,
  Rarity,
  RemoteGameState,
} from '../src/game/types.js';
import { clampEffectShimmer, getDefaultCardVisuals } from '../src/game/types.js';
import type { ServerConfig } from './config.js';
import { getDayKey, getNextResetAt } from './time.js';

interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface CardRow {
  id: string;
  title: string;
  url_image: string;
  rarity: Rarity;
  description: string;
  power: number;
  cringe: number;
  fame: number;
  rarity_score: number;
  humor: number;
  default_finish: CardFinish | null;
  creator_name: string | null;
  visual_frame_style: CardVisuals['frameStyle'] | null;
  visual_accent_color: string | null;
  visual_pattern_json: string | null;
  effect_layers_json: string | null;
}

interface OwnedCardRow extends CardRow {
  instance_id: string;
  acquired_at: string;
  pack_number: number;
  finish: CardFinish;
  holographic_seed: number;
}

interface SessionRow {
  id: string;
  email: string;
  name: string;
  shareSlug: string;
  avatarUrl: string | null;
  googleSub: string;
}

interface UserRow {
  id: string;
  name: string;
  shareSlug: string;
  avatarUrl: string | null;
}

interface ProposalRow {
  id: string;
  creator_user_id: string;
  creator_name: string;
  rarity: Rarity;
  status: CardProposal['status'];
  title: string;
  description: string;
  url_image: string;
  default_finish: CardFinish;
  visual_frame_style: CardVisuals['frameStyle'];
  visual_accent_color: string;
  visual_pattern_json: string;
  allowed_effects_json: string;
  max_effect_layers: number;
  effect_layers_json: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  approved_card_definition_id: string | null;
  rejection_reason: string | null;
}

interface NotificationRow {
  id: string;
  user_id: string;
  kind: AppNotificationKind;
  title: string;
  message: string;
  proposal_id: string | null;
  card_instance_id: string | null;
  created_at: string;
  read_at: string | null;
}

interface ProposalEffectGrant {
  allowedEffects: CardTreatmentEffect[];
  maxEffectLayers: number;
}

interface AdminCardRow extends CardRow {
  total_owned: number;
  unique_owners: number;
  updated_at: string;
}

interface AdminUserRow {
  id: string;
  google_sub: string;
  email: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  total_cards: number;
  unique_cards: number;
  packs_opened: number;
}

const rarityOrder: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'veryrare'];
const LEGACY_VISUAL_EFFECT_PATTERN = 'none';
const LEGACY_VISUAL_EFFECT_PLACEMENT = 'frame';
const MAX_NICKNAME_LENGTH = 32;
const DEFAULT_NICKNAME_PREFIX = 'Collector';
const DEFAULT_NICKNAME_SHORT_ID_LENGTH = 8;

const CYRILLIC_TO_LATIN: Record<string, string> = {
  А: 'A',
  а: 'a',
  Б: 'B',
  б: 'b',
  В: 'V',
  в: 'v',
  Г: 'G',
  г: 'g',
  Д: 'D',
  д: 'd',
  Е: 'E',
  е: 'e',
  Ё: 'Yo',
  ё: 'yo',
  Ж: 'Zh',
  ж: 'zh',
  З: 'Z',
  з: 'z',
  И: 'I',
  и: 'i',
  Й: 'Y',
  й: 'y',
  К: 'K',
  к: 'k',
  Л: 'L',
  л: 'l',
  М: 'M',
  м: 'm',
  Н: 'N',
  н: 'n',
  О: 'O',
  о: 'o',
  П: 'P',
  п: 'p',
  Р: 'R',
  р: 'r',
  С: 'S',
  с: 's',
  Т: 'T',
  т: 't',
  У: 'U',
  у: 'u',
  Ф: 'F',
  ф: 'f',
  Х: 'Kh',
  х: 'kh',
  Ц: 'Ts',
  ц: 'ts',
  Ч: 'Ch',
  ч: 'ch',
  Ш: 'Sh',
  ш: 'sh',
  Щ: 'Sch',
  щ: 'sch',
  Ъ: '',
  ъ: '',
  Ы: 'Y',
  ы: 'y',
  Ь: '',
  ь: '',
  Э: 'E',
  э: 'e',
  Ю: 'Yu',
  ю: 'yu',
  Я: 'Ya',
  я: 'ya',
  Є: 'Ye',
  є: 'ye',
  І: 'I',
  і: 'i',
  Ї: 'Yi',
  ї: 'yi',
  Ґ: 'G',
  ґ: 'g',
  Ў: 'U',
  ў: 'u',
};

function isUniqueConstraintError(error: unknown): error is Error & { code?: string } {
  return error instanceof Error && 'code' in error && (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';
}

function normalizeNicknameKey(nickname: string): string {
  return nickname.trim().normalize('NFKC').toLocaleLowerCase();
}

function shortUserId(userId: string): string {
  const compact = userId.replace(/[^A-Za-z0-9]/gu, '');
  return (compact || 'user').slice(0, DEFAULT_NICKNAME_SHORT_ID_LENGTH);
}

function trimNicknameLength(value: string): string {
  return value.slice(0, MAX_NICKNAME_LENGTH).replace(/[-_]+$/gu, '');
}

function buildDefaultNickname(userId: string): string {
  return trimNicknameLength(`${DEFAULT_NICKNAME_PREFIX}-${shortUserId(userId)}`);
}

function transliterateNicknameSource(value: string): string {
  const decomposed = value.normalize('NFKD').replace(/\p{Mark}+/gu, '');
  let result = '';

  for (const character of decomposed) {
    if (character in CYRILLIC_TO_LATIN) {
      result += CYRILLIC_TO_LATIN[character];
      continue;
    }

    if (/[A-Za-z0-9]/u.test(character)) {
      result += character;
      continue;
    }

    if (character === '-' || character === '_') {
      result += character;
      continue;
    }

    if (/[\s./\\,:;|+()[\]{}]+/u.test(character)) {
      result += '-';
    }
  }

  return trimNicknameLength(
    result
      .replace(/-{2,}/gu, '-')
      .replace(/_{2,}/gu, '_')
      .replace(/(?:-|_){2,}/gu, '-')
      .replace(/^[-_]+|[-_]+$/gu, ''),
  );
}

function buildAutoNickname(
  source: string | null | undefined,
  userId: string,
  usedNicknames?: Set<string>,
): string {
  let candidate = transliterateNicknameSource(source ?? '');

  if (candidate.length < 2) {
    candidate = buildDefaultNickname(userId);
  }

  let normalized = normalizeNicknameKey(candidate);

  if (!normalized) {
    candidate = buildDefaultNickname(userId);
    normalized = normalizeNicknameKey(candidate);
  }

  if (!usedNicknames || !usedNicknames.has(normalized)) {
    usedNicknames?.add(normalized);
    return candidate;
  }

  const suffix = `-${shortUserId(userId)}`;
  const baseMaxLength = Math.max(MAX_NICKNAME_LENGTH - suffix.length, 2);
  let uniqueBase = candidate.slice(0, baseMaxLength).replace(/[-_]+$/gu, '');

  if (uniqueBase.length < 2) {
    uniqueBase = DEFAULT_NICKNAME_PREFIX.slice(0, baseMaxLength).replace(/[-_]+$/gu, '');
  }

  candidate = trimNicknameLength(`${uniqueBase}${suffix}`);
  normalized = normalizeNicknameKey(candidate);

  if (!usedNicknames.has(normalized)) {
    usedNicknames.add(normalized);
    return candidate;
  }

  let counter = 2;

  while (counter < 10_000) {
    const counterSuffix = `${suffix}-${counter}`;
    const counterBaseMaxLength = Math.max(MAX_NICKNAME_LENGTH - counterSuffix.length, 2);
    const counterBase =
      uniqueBase.slice(0, counterBaseMaxLength).replace(/[-_]+$/gu, '') ||
      DEFAULT_NICKNAME_PREFIX.slice(0, counterBaseMaxLength);
    candidate = trimNicknameLength(`${counterBase}${counterSuffix}`);
    normalized = normalizeNicknameKey(candidate);

    if (!usedNicknames.has(normalized)) {
      usedNicknames.add(normalized);
      return candidate;
    }

    counter += 1;
  }

  throw new Error(`Failed to generate unique nickname for user ${userId}`);
}

function normalizeCardImageUrl(url: string): string {
  return url.trim();
}

function normalizeMaskUrl(url: string): string {
  return url.trim();
}

function normalizeDecorativePattern(pattern?: Partial<CardDecorativePattern> | null): CardDecorativePattern {
  const defaults = getDefaultCardVisuals().decorativePattern;

  return {
    svgUrl: typeof pattern?.svgUrl === 'string' ? normalizeMaskUrl(pattern.svgUrl) : defaults.svgUrl,
    size:
      typeof pattern?.size === 'number' && Number.isFinite(pattern.size)
        ? Math.max(20, Math.min(pattern.size, 320))
        : defaults.size,
    gap:
      typeof pattern?.gap === 'number' && Number.isFinite(pattern.gap)
        ? Math.max(0, Math.min(pattern.gap, 320))
        : defaults.gap,
    opacity:
      typeof pattern?.opacity === 'number' && Number.isFinite(pattern.opacity)
        ? Math.max(0, Math.min(pattern.opacity, 1))
        : defaults.opacity,
    offsetX:
      typeof pattern?.offsetX === 'number' && Number.isFinite(pattern.offsetX)
        ? Math.max(-1024, Math.min(pattern.offsetX, 1024))
        : defaults.offsetX,
    offsetY:
      typeof pattern?.offsetY === 'number' && Number.isFinite(pattern.offsetY)
        ? Math.max(-1536, Math.min(pattern.offsetY, 1536))
        : defaults.offsetY,
  };
}

function normalizeVisuals(visuals?: CardVisuals | null): CardVisuals {
  const defaults = getDefaultCardVisuals();

  return {
    frameStyle: visuals?.frameStyle ?? defaults.frameStyle,
    accentColor: visuals?.accentColor ?? defaults.accentColor,
    decorativePattern: normalizeDecorativePattern(visuals?.decorativePattern),
  };
}

function normalizeEffectLayers(effectLayers?: CardEffectLayer[] | null): CardEffectLayer[] {
  if (!effectLayers || effectLayers.length === 0) {
    return [];
  }

  return effectLayers
    .map((layer) => ({
      id: layer.id.trim(),
      type: layer.type,
      maskUrl: normalizeMaskUrl(layer.maskUrl),
      opacity: Math.max(0.18, Math.min(layer.opacity, 1)),
      shimmer: clampEffectShimmer(layer.type, layer.shimmer ?? 1),
      relief: Math.max(-1, Math.min(layer.relief ?? 0, 1)),
    }))
    .filter((layer) => layer.id.length > 0);
}

function filterEffectLayersByAllowedTypes(
  effectLayers: CardEffectLayer[],
  allowedEffects: CardTreatmentEffect[],
) {
  const allowed = new Set(allowedEffects);
  return effectLayers.filter((layer) => allowed.has(layer.type)).slice(0, allowedEffects.length);
}

function parseJsonArray<T>(value: string | null | undefined, fallback: T[]): T[] {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonObject<T extends object>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function createProposalCardId(title: string, proposalId: string) {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64);

  return `${slug || 'creator-card'}-${proposalId.slice(0, 8)}`;
}

function makeSeededRoll(seed: string) {
  let hash = 2166136261;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return () => {
    hash += hash << 13;
    hash ^= hash >>> 7;
    hash += hash << 3;
    hash ^= hash >>> 17;
    hash += hash << 5;
    return ((hash >>> 0) % 1000) / 1000;
  };
}

const proposalEffectPools: Record<
  Rarity,
  {
    grantCountWeights: Array<[number, number]>;
    pool: Array<[CardTreatmentEffect, number]>;
  }
> = {
  common: {
    grantCountWeights: [[0, 1]],
    pool: [],
  },
  uncommon: {
    grantCountWeights: [[1, 1]],
    pool: [
      ['spot_gloss', 48],
      ['texture_sugar', 34],
      ['spot_holo', 18],
    ],
  },
  rare: {
    grantCountWeights: [
      [1, 54],
      [2, 46],
    ],
    pool: [
      ['spot_gloss', 28],
      ['texture_sugar', 18],
      ['spot_holo', 30],
      ['sparkle_foil', 16],
      ['emboss', 8],
    ],
  },
  epic: {
    grantCountWeights: [
      [2, 58],
      [3, 42],
    ],
    pool: [
      ['spot_gloss', 16],
      ['texture_sugar', 14],
      ['spot_holo', 24],
      ['sparkle_foil', 20],
      ['emboss', 16],
      ['prismatic_edge', 10],
    ],
  },
  veryrare: {
    grantCountWeights: [
      [3, 62],
      [4, 38],
    ],
    pool: [
      ['spot_gloss', 10],
      ['texture_sugar', 10],
      ['spot_holo', 18],
      ['sparkle_foil', 18],
      ['emboss', 16],
      ['prismatic_edge', 28],
    ],
  },
};

function generateStatsForProposal(rarity: Rarity, seed: string) {
  const roll = makeSeededRoll(seed);
  const bases: Record<Rarity, { min: number; max: number; rarityScore: [number, number] }> = {
    common: { min: 34, max: 68, rarityScore: [24, 39] },
    uncommon: { min: 42, max: 76, rarityScore: [40, 57] },
    rare: { min: 54, max: 86, rarityScore: [58, 73] },
    epic: { min: 66, max: 94, rarityScore: [74, 88] },
    veryrare: { min: 78, max: 100, rarityScore: [89, 99] },
  };
  const base = bases[rarity];
  const stat = () => Math.round(base.min + (base.max - base.min) * roll());
  const rarityScore = Math.round(
    base.rarityScore[0] + (base.rarityScore[1] - base.rarityScore[0]) * roll(),
  );

  return {
    power: stat(),
    cringe: stat(),
    fame: stat(),
    rarityScore,
    humor: stat(),
  };
}

function ensureDirectory(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function hashToken(value: string, secret: string): string {
  return createHash('sha256').update(`${secret}:${value}`).digest('hex');
}

function weightedPickValue<T>(weights: Array<[T, number]>): T {
  const total = weights.reduce((sum, [, value]) => sum + value, 0);
  let roll = Math.random() * total;

  for (const [value, weight] of weights) {
    roll -= weight;
    if (roll <= 0) {
      return value;
    }
  }

  return weights[0][0];
}

function weightedPick(weights: Array<[Rarity, number]>): Rarity {
  return weightedPickValue(weights);
}

function pickDistinctEffects(
  pool: Array<[CardTreatmentEffect, number]>,
  count: number,
): CardTreatmentEffect[] {
  const available = [...pool];
  const picked: CardTreatmentEffect[] = [];

  while (picked.length < count && available.length > 0) {
    const next = weightedPickValue(available);
    picked.push(next);
    const nextIndex = available.findIndex(([effect]) => effect === next);
    if (nextIndex >= 0) {
      available.splice(nextIndex, 1);
    }
  }

  return picked;
}

function buildProposalEffectGrant(rarity: Rarity): ProposalEffectGrant {
  const config = proposalEffectPools[rarity];
  const grantCount = weightedPickValue(config.grantCountWeights);
  const allowedEffects = pickDistinctEffects(config.pool, grantCount);

  return {
    allowedEffects,
    maxEffectLayers: allowedEffects.length,
  };
}

function getRemainingCountByRarity(
  countsByRarity: Record<Rarity, number>,
  drawnCounts: Record<Rarity, number>,
  targetRarity: Rarity,
) {
  return rarityOrder.reduce<Record<Rarity, number>>(
    (acc, rarity) => {
      acc[rarity] = countsByRarity[rarity] - drawnCounts[rarity];
      if (rarity === targetRarity) {
        acc[rarity] = Math.max(acc[rarity], 0);
      }
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

function getPerCardDropChanceByRarity(catalog: CardDefinition[]) {
  const countsByRarity = rarityOrder.reduce<Record<Rarity, number>>(
    (acc, rarity) => {
      acc[rarity] = catalog.filter((card) => card.rarity === rarity).length;
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

  const results = {
    common: 0,
    uncommon: 0,
    rare: 0,
    epic: 0,
    veryrare: 0,
  } satisfies Record<Rarity, number>;

  rarityOrder.forEach((targetRarity) => {
    if (countsByRarity[targetRarity] === 0) {
      results[targetRarity] = 0;
      return;
    }

    const memo = new Map<string, number>();

    const visit = (slotIndex: number, drawnCounts: Record<Rarity, number>): number => {
      if (slotIndex >= CARDS_PER_PACK) {
        return 0;
      }

      const key = `${slotIndex}:${rarityOrder.map((rarity) => drawnCounts[rarity]).join(':')}`;
      const cached = memo.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const weights = slotIndex === CARDS_PER_PACK - 1 ? rarityWeights.featured : rarityWeights.standard;
      const remainingByRarity = getRemainingCountByRarity(countsByRarity, drawnCounts, targetRarity);
      const totalRemaining = rarityOrder.reduce((sum, rarity) => sum + remainingByRarity[rarity], 0);
      let probability = 0;

      for (const [selectedRarity, weight] of weights) {
        const slotProbability = weight / 100;
        const selectedRemaining = remainingByRarity[selectedRarity];

        if (selectedRemaining > 0) {
          if (selectedRarity === targetRarity) {
            probability += slotProbability * (1 / selectedRemaining);

            if (selectedRemaining > 1) {
              const nextDrawn = {
                ...drawnCounts,
                [selectedRarity]: drawnCounts[selectedRarity] + 1,
              };
              probability +=
                slotProbability *
                ((selectedRemaining - 1) / selectedRemaining) *
                visit(slotIndex + 1, nextDrawn);
            }
          } else {
            const nextDrawn = {
              ...drawnCounts,
              [selectedRarity]: drawnCounts[selectedRarity] + 1,
            };
            probability += slotProbability * visit(slotIndex + 1, nextDrawn);
          }

          continue;
        }

        if (totalRemaining <= 0) {
          continue;
        }

        probability += slotProbability * (1 / totalRemaining);

        for (const rarity of rarityOrder) {
          const categoryCount =
            rarity === targetRarity ? remainingByRarity[rarity] - 1 : remainingByRarity[rarity];

          if (categoryCount <= 0) {
            continue;
          }

          const nextDrawn = {
            ...drawnCounts,
            [rarity]: drawnCounts[rarity] + 1,
          };
          probability +=
            slotProbability * (categoryCount / totalRemaining) * visit(slotIndex + 1, nextDrawn);
        }
      }

      memo.set(key, probability);
      return probability;
    };

    results[targetRarity] = visit(0, {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      veryrare: 0,
    });
  });

  return results;
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

function toCardDefinition(row: CardRow): CardDefinition {
  const visuals =
    row.visual_frame_style && row.visual_accent_color
      ? normalizeVisuals({
          frameStyle: row.visual_frame_style,
          accentColor: row.visual_accent_color,
          decorativePattern: parseJsonObject<CardDecorativePattern>(
            row.visual_pattern_json,
            getDefaultCardVisuals().decorativePattern,
          ),
        })
      : undefined;

  return {
    id: row.id,
    title: row.title,
    urlImage: row.url_image,
    rarity: row.rarity,
    description: row.description,
    stats: {
      power: row.power,
      cringe: row.cringe,
      fame: row.fame,
      rarityScore: row.rarity_score,
      humor: row.humor,
    },
    defaultFinish: row.default_finish ?? undefined,
    creatorName: row.creator_name ?? null,
    effectLayers: normalizeEffectLayers(parseJsonArray<CardEffectLayer>(row.effect_layers_json, [])),
    visuals,
  };
}

function toOwnedCard(row: OwnedCardRow): OwnedCard {
  return {
    ...toCardDefinition(row),
    instanceId: row.instance_id,
    acquiredAt: row.acquired_at,
    packNumber: row.pack_number,
    finish: row.finish,
    holographicSeed: row.holographic_seed,
  };
}

function toCardProposal(row: ProposalRow): CardProposal {
  return {
    id: row.id,
    creatorUserId: row.creator_user_id,
    creatorName: row.creator_name,
    rarity: row.rarity,
    status: row.status,
    title: row.title,
    description: row.description,
    urlImage: row.url_image,
    defaultFinish: row.default_finish,
    visuals: normalizeVisuals({
      frameStyle: row.visual_frame_style,
      accentColor: row.visual_accent_color,
      decorativePattern: parseJsonObject<CardDecorativePattern>(
        row.visual_pattern_json,
        getDefaultCardVisuals().decorativePattern,
      ),
    }),
    allowedEffects: parseJsonArray<CardTreatmentEffect>(row.allowed_effects_json, []),
    maxEffectLayers: row.max_effect_layers,
    effectLayers: normalizeEffectLayers(
      parseJsonArray<CardEffectLayer>(row.effect_layers_json, []),
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    rejectionReason: row.rejection_reason,
  };
}

function toAppNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    message: row.message,
    proposalId: row.proposal_id,
    cardInstanceId: row.card_instance_id,
    createdAt: row.created_at,
  };
}

function toAdminCatalogCard(
  row: AdminCardRow,
  dropChancePerPackByRarity: Record<Rarity, number>,
): AdminCatalogCard {
  return {
    card: toCardDefinition(row),
    totalOwned: row.total_owned,
    uniqueOwners: row.unique_owners,
    updatedAt: row.updated_at,
    dropChancePerPack: dropChancePerPackByRarity[row.rarity],
  };
}

function toAdminUserRecord(row: AdminUserRow): AdminUserRecord {
  return {
    id: row.id,
    googleSub: row.google_sub,
    email: row.email,
    name: row.nickname ?? row.name,
    avatarUrl: row.avatar_url,
    totalCards: row.total_cards,
    uniqueCards: row.unique_cards,
    packsOpened: row.packs_opened,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicPlayerProfile(row: UserRow): PublicPlayerProfile {
  return {
    id: row.id,
    name: row.name,
    shareSlug: row.shareSlug,
    avatarUrl: row.avatarUrl,
  };
}

function rollPackFromCatalog(catalog: CardDefinition[], packNumber: number, timestamp: string) {
  const byRarity = catalog.reduce<Record<Rarity, CardDefinition[]>>(
    (acc, card) => {
      acc[card.rarity].push(card);
      return acc;
    },
    {
      common: [],
      uncommon: [],
      rare: [],
      epic: [],
      veryrare: [],
    },
  );

  const excludedIds = new Set<string>();
  const pulled: OwnedCard[] = [];

  for (let slot = 0; slot < CARDS_PER_PACK; slot += 1) {
    const weights = slot === CARDS_PER_PACK - 1 ? rarityWeights.featured : rarityWeights.standard;
    const rarity = weightedPick(weights);
    const primaryPool = byRarity[rarity];
    const fallbackPool = catalog.filter((card) => !excludedIds.has(card.id));
    const card = pickFromPool(
      primaryPool.length > 0 ? primaryPool : fallbackPool.length > 0 ? fallbackPool : catalog,
      excludedIds,
    );

    pulled.push({
      ...card,
      instanceId: randomUUID(),
      acquiredAt: timestamp,
      packNumber,
      finish: card.defaultFinish ?? getFinish(card.rarity),
      holographicSeed: Math.random(),
    });
  }

  return pulled;
}

export class PackLimitReachedError extends Error {
  constructor(readonly nextPackResetAt: string) {
    super('Сегодняшний пак уже открыт.');
    this.name = 'PackLimitReachedError';
  }
}

export class NicknameTakenError extends Error {
  constructor() {
    super('Этот ник уже занят.');
    this.name = 'NicknameTakenError';
  }
}

export class NoApprovedCardsError extends Error {
  constructor() {
    super('Пока нет одобренных карточек для паков.');
    this.name = 'NoApprovedCardsError';
  }
}

export function createGameStore(config: ServerConfig) {
  ensureDirectory(config.databaseFile);

  const db = new Database(config.databaseFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    create table if not exists users (
      id text primary key,
      google_sub text not null unique,
      email text not null,
      name text not null,
      nickname text,
      nickname_normalized text,
      avatar_url text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists sessions (
      id text primary key,
      token_hash text not null unique,
      user_id text not null references users(id) on delete cascade,
      expires_at text not null,
      created_at text not null,
      last_seen_at text not null
    );

    create table if not exists card_definitions (
      id text primary key,
      title text not null,
      url_image text not null,
      rarity text not null,
      description text not null,
      power integer not null,
      cringe integer not null,
      fame integer not null,
      rarity_score integer not null,
      humor integer not null,
      default_finish text,
      creator_name text,
      visual_frame_style text,
      visual_accent_color text,
      visual_effect_pattern text,
      visual_effect_placement text,
      visual_pattern_json text not null default '{}',
      effect_layers_json text not null default '[]',
      is_active integer not null default 1,
      updated_at text not null
    );

    create table if not exists card_proposals (
      id text primary key,
      creator_user_id text not null references users(id) on delete cascade,
      creator_name text not null,
      rarity text not null,
      status text not null,
      title text not null,
      description text not null,
      url_image text not null,
      default_finish text not null,
      visual_frame_style text not null,
      visual_accent_color text not null,
      visual_effect_pattern text not null,
      visual_effect_placement text not null,
      visual_pattern_json text not null default '{}',
      allowed_effects_json text not null default '[]',
      max_effect_layers integer not null default 0,
      effect_layers_json text not null default '[]',
      created_at text not null,
      updated_at text not null,
      submitted_at text,
      approved_at text,
      approved_card_definition_id text references card_definitions(id),
      rejection_reason text
    );

    create table if not exists user_notifications (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      kind text not null,
      title text not null,
      message text not null,
      proposal_id text references card_proposals(id) on delete set null,
      card_instance_id text references owned_cards(instance_id) on delete set null,
      created_at text not null,
      read_at text
    );

    create table if not exists pack_open_events (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      pack_number integer not null,
      opened_at text not null,
      day_key text not null,
      unique(user_id, day_key)
    );

    create table if not exists owned_cards (
      instance_id text primary key,
      user_id text not null references users(id) on delete cascade,
      card_definition_id text not null references card_definitions(id),
      acquired_at text not null,
      pack_number integer not null,
      finish text not null,
      holographic_seed real not null
    );

    create index if not exists idx_sessions_expires_at on sessions(expires_at);
    create index if not exists idx_pack_open_events_user_id on pack_open_events(user_id, opened_at desc);
    create index if not exists idx_owned_cards_user_id on owned_cards(user_id, acquired_at desc);
    create index if not exists idx_user_notifications_unread
    on user_notifications(user_id, read_at, created_at desc);
  `);

  const userColumns = db.prepare(`pragma table_info(users)`).all() as Array<{ name: string }>;
  const hasNicknameColumn = userColumns.some((column) => column.name === 'nickname');
  const hasNicknameNormalizedColumn = userColumns.some(
    (column) => column.name === 'nickname_normalized',
  );

  if (!hasNicknameColumn) {
    db.exec('alter table users add column nickname text');
  }

  if (!hasNicknameNormalizedColumn) {
    db.exec('alter table users add column nickname_normalized text');
  }

  const existingUsers = db
    .prepare(
      `
        select id, name, nickname
        from users
        order by datetime(created_at) asc, id asc
      `,
    )
    .all() as Array<{ id: string; name: string; nickname: string | null }>;
  const updateNicknameMigrationStatement = db.prepare(`
    update users
    set nickname = ?, nickname_normalized = ?
    where id = ?
  `);
  const migrateExistingNicknames = db.transaction(() => {
    const seen = new Set<string>();

    for (const row of existingUsers) {
      const nextNickname = buildAutoNickname(row.nickname ?? row.name, row.id, seen);
      updateNicknameMigrationStatement.run(
        nextNickname,
        normalizeNicknameKey(nextNickname),
        row.id,
      );
    }
  });

  migrateExistingNicknames();
  db.exec('drop index if exists idx_users_nickname_unique');
  db.exec(`
    create unique index if not exists idx_users_nickname_normalized_unique
    on users(nickname_normalized)
    where nickname_normalized is not null
  `);

  const cardDefinitionColumns = db
    .prepare(`pragma table_info(card_definitions)`)
    .all() as Array<{ name: string }>;
  const requiredCardDefinitionColumns = [
    ['default_finish', 'text'],
    ['creator_name', 'text'],
    ['visual_frame_style', 'text'],
    ['visual_accent_color', 'text'],
    ['visual_effect_pattern', 'text'],
    ['visual_effect_placement', 'text'],
    ['visual_pattern_json', "text not null default '{}'"],
    ['effect_layers_json', "text not null default '[]'"],
  ] as const;

  for (const [columnName, columnType] of requiredCardDefinitionColumns) {
    if (!cardDefinitionColumns.some((column) => column.name === columnName)) {
      db.exec(`alter table card_definitions add column ${columnName} ${columnType}`);
    }
  }

  db.prepare('update card_definitions set is_active = 0 where creator_name is null').run();
  db.exec(`
    update card_definitions
    set visual_pattern_json = '{}'
    where visual_pattern_json is null or trim(visual_pattern_json) = ''
  `);

  const proposalColumns = db
    .prepare(`pragma table_info(card_proposals)`)
    .all() as Array<{ name: string }>;
  const requiredProposalColumns = [
    ['visual_pattern_json', "text not null default '{}'"],
    ['allowed_effects_json', "text not null default '[]'"],
    ['max_effect_layers', 'integer not null default 0'],
    ['effect_layers_json', "text not null default '[]'"],
    ['rejection_reason', 'text'],
  ] as const;

  for (const [columnName, columnType] of requiredProposalColumns) {
    if (!proposalColumns.some((column) => column.name === columnName)) {
      db.exec(`alter table card_proposals add column ${columnName} ${columnType}`);
    }
  }

  db.exec(`
    update card_proposals
    set visual_pattern_json = '{}'
    where visual_pattern_json is null or trim(visual_pattern_json) = ''
  `);
  db.exec(`
    update card_proposals
    set allowed_effects_json = '[]'
    where allowed_effects_json is null or trim(allowed_effects_json) = ''
  `);
  db.exec(`
    update card_proposals
    set effect_layers_json = '[]'
    where effect_layers_json is null or trim(effect_layers_json) = ''
  `);
  db.exec(`
    update card_proposals
    set max_effect_layers = 0
    where max_effect_layers is null
  `);

  db.exec(`
    create index if not exists idx_card_proposals_status_created_at
    on card_proposals(status, created_at desc)
  `);

  const notificationColumns = db
    .prepare(`pragma table_info(user_notifications)`)
    .all() as Array<{ name: string }>;

  if (!notificationColumns.some((column) => column.name === 'card_instance_id')) {
    db.exec('alter table user_notifications add column card_instance_id text');
  }

  const upsertCardDefinition = db.prepare(`
    insert into card_definitions (
      id, title, url_image, rarity, description, power, cringe, fame, rarity_score, humor,
      default_finish, creator_name, visual_frame_style, visual_accent_color,
      visual_pattern_json, effect_layers_json, is_active, updated_at
    ) values (
      @id, @title, @url_image, @rarity, @description, @power, @cringe, @fame, @rarity_score, @humor,
      @default_finish, @creator_name, @visual_frame_style, @visual_accent_color,
      @visual_pattern_json, @effect_layers_json, 1, @updated_at
    )
    on conflict(id) do update set
      title = excluded.title,
      url_image = excluded.url_image,
      rarity = excluded.rarity,
      description = excluded.description,
      power = excluded.power,
      cringe = excluded.cringe,
      fame = excluded.fame,
      rarity_score = excluded.rarity_score,
      humor = excluded.humor,
      default_finish = excluded.default_finish,
      creator_name = excluded.creator_name,
      visual_frame_style = excluded.visual_frame_style,
      visual_accent_color = excluded.visual_accent_color,
      visual_pattern_json = excluded.visual_pattern_json,
      effect_layers_json = excluded.effect_layers_json,
      is_active = 1,
      updated_at = excluded.updated_at
  `);
  db.prepare('delete from sessions where expires_at <= ?').run(new Date().toISOString());

  const upsertGoogleUser = db.prepare(`
    insert into users (
      id, google_sub, email, name, nickname, nickname_normalized, avatar_url, created_at, updated_at
    )
    values (
      @id,
      @google_sub,
      @email,
      @name,
      @nickname,
      @nickname_normalized,
      @avatar_url,
      @created_at,
      @updated_at
    )
    on conflict(google_sub) do update set
      email = excluded.email,
      name = excluded.name,
      avatar_url = excluded.avatar_url,
      updated_at = excluded.updated_at
    returning
      id,
      email,
      google_sub as googleSub,
      coalesce(nickname, name) as name,
      coalesce(nickname, id) as shareSlug,
      avatar_url as avatarUrl
  `);

  const insertSession = db.prepare(`
    insert into sessions (id, token_hash, user_id, expires_at, created_at, last_seen_at)
    values (?, ?, ?, ?, ?, ?)
  `);

  const selectSessionUser = db.prepare(`
    select
      users.id,
      users.email,
      users.google_sub as googleSub,
      coalesce(users.nickname, users.name) as name,
      coalesce(users.nickname, users.id) as shareSlug,
      users.avatar_url as avatarUrl
    from sessions
    join users on users.id = sessions.user_id
    where sessions.token_hash = ? and sessions.expires_at > ?
  `);
  const updateNicknameStatement = db.prepare(`
    update users
    set nickname = ?, nickname_normalized = ?, updated_at = ?
    where id = ?
    returning
      id,
      email,
      google_sub as googleSub,
      coalesce(nickname, name) as name,
      coalesce(nickname, id) as shareSlug,
      avatar_url as avatarUrl
  `);
  const selectUserByNicknameNormalized = db.prepare(`
    select id
    from users
    where nickname_normalized = ?
    limit 1
  `);

  const deleteSessionByHash = db.prepare('delete from sessions where token_hash = ?');
  const countPacksOpenedToday = db.prepare(`
    select count(*) as count
    from pack_open_events
    where user_id = ? and day_key = ?
  `);
  const selectMaxPackNumber = db.prepare(`
    select coalesce(max(pack_number), 0) as packNumber
    from pack_open_events
    where user_id = ?
  `);
  const selectCollection = db.prepare(`
    select
      card_definitions.id,
      card_definitions.title,
      card_definitions.url_image,
      card_definitions.rarity,
      card_definitions.description,
      card_definitions.power,
      card_definitions.cringe,
      card_definitions.fame,
      card_definitions.rarity_score,
      card_definitions.humor,
      card_definitions.default_finish,
      card_definitions.creator_name,
      card_definitions.visual_frame_style,
      card_definitions.visual_accent_color,
      card_definitions.visual_pattern_json,
      card_definitions.effect_layers_json,
      owned_cards.instance_id,
      owned_cards.acquired_at,
      owned_cards.pack_number,
      owned_cards.finish,
      owned_cards.holographic_seed
    from owned_cards
    join card_definitions on card_definitions.id = owned_cards.card_definition_id
    where owned_cards.user_id = ?
    order by owned_cards.acquired_at desc, owned_cards.instance_id desc
  `);
  const selectPublicUserBySlug = db.prepare(`
    select
      id,
      coalesce(nickname, name) as name,
      coalesce(nickname, id) as shareSlug,
      avatar_url as avatarUrl
    from users
    where nickname_normalized = ?
      or (nickname_normalized is null and id = ?)
  `);
  const selectActiveCatalog = db.prepare(`
    select
      id, title, url_image, rarity, description, power, cringe, fame, rarity_score, humor,
      default_finish, creator_name, visual_frame_style, visual_accent_color,
      visual_pattern_json, effect_layers_json
    from card_definitions
    where is_active = 1
  `);
  const insertProposal = db.prepare(`
    insert into card_proposals (
      id, creator_user_id, creator_name, rarity, status, title, description, url_image,
      default_finish, visual_frame_style, visual_accent_color, visual_effect_pattern,
      visual_effect_placement, visual_pattern_json, allowed_effects_json, max_effect_layers, effect_layers_json,
      created_at, updated_at, submitted_at, approved_at, approved_card_definition_id, rejection_reason
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectProposalById = db.prepare(`
    select *
    from card_proposals
    where id = ?
  `);
  const selectLatestActiveProposalByUser = db.prepare(`
    select *
    from card_proposals
    where creator_user_id = ? and status in ('draft', 'pending')
    order by datetime(created_at) desc
    limit 1
  `);
  const selectAdminProposals = db.prepare(`
    select *
    from card_proposals
    where status = 'pending'
    order by
      datetime(coalesce(submitted_at, updated_at)) desc
  `);
  const selectAdminCatalog = db.prepare(`
    select
      card_definitions.id,
      card_definitions.title,
      card_definitions.url_image,
      card_definitions.rarity,
      card_definitions.description,
      card_definitions.power,
      card_definitions.cringe,
      card_definitions.fame,
      card_definitions.rarity_score,
      card_definitions.humor,
      card_definitions.default_finish,
      card_definitions.creator_name,
      card_definitions.visual_frame_style,
      card_definitions.visual_accent_color,
      card_definitions.visual_pattern_json,
      card_definitions.effect_layers_json,
      card_definitions.updated_at,
      count(owned_cards.instance_id) as total_owned,
      count(distinct owned_cards.user_id) as unique_owners
    from card_definitions
    left join owned_cards on owned_cards.card_definition_id = card_definitions.id
    where card_definitions.is_active = 1
    group by card_definitions.id
    order by datetime(card_definitions.updated_at) desc, card_definitions.id desc
  `);
  const selectAdminUsers = db.prepare(`
    select
      users.id,
      users.google_sub,
      users.email,
      users.name,
      users.nickname,
      users.avatar_url,
      users.created_at,
      users.updated_at,
      (
        select count(*)
        from owned_cards
        where owned_cards.user_id = users.id
      ) as total_cards,
      (
        select count(distinct owned_cards.card_definition_id)
        from owned_cards
        where owned_cards.user_id = users.id
      ) as unique_cards,
      (
        select coalesce(max(pack_open_events.pack_number), 0)
        from pack_open_events
        where pack_open_events.user_id = users.id
      ) as packs_opened
    from users
    order by total_cards desc, datetime(users.created_at) asc, users.id asc
  `);
  const updateProposalDraft = db.prepare(`
    update card_proposals
    set
      title = @title,
      description = @description,
      url_image = @url_image,
      default_finish = @default_finish,
      visual_frame_style = @visual_frame_style,
      visual_accent_color = @visual_accent_color,
      visual_pattern_json = @visual_pattern_json,
      effect_layers_json = @effect_layers_json,
      updated_at = @updated_at
    where id = @id and status = 'draft'
    returning *
  `);
  const updateProposalAdminOverride = db.prepare(`
    update card_proposals
    set
      rarity = @rarity,
      allowed_effects_json = @allowed_effects_json,
      max_effect_layers = @max_effect_layers,
      effect_layers_json = @effect_layers_json,
      updated_at = @updated_at
    where id = @id and status = 'draft'
    returning *
  `);
  const submitProposalStatement = db.prepare(`
    update card_proposals
    set status = 'pending', submitted_at = ?, updated_at = ?, rejection_reason = null
    where id = ? and status = 'draft'
    returning *
  `);
  const approveProposalStatement = db.prepare(`
    update card_proposals
    set
      status = 'approved',
      approved_at = ?,
      updated_at = ?,
      approved_card_definition_id = ?,
      rejection_reason = null
    where id = ? and status = 'pending'
    returning *
  `);
  const markProposalDeleted = db.prepare(`
    update card_proposals
    set status = 'deleted', updated_at = ?, rejection_reason = ?
    where id = ? and status = 'pending'
    returning *
  `);
  const insertNotification = db.prepare(`
    insert into user_notifications (
      id, user_id, kind, title, message, proposal_id, card_instance_id, created_at, read_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, null)
  `);
  const selectUnreadNotifications = db.prepare(`
    select *
    from user_notifications
    where user_id = ? and read_at is null
    order by datetime(created_at) asc, id asc
    limit 20
  `);
  const markNotificationRead = db.prepare(`
    update user_notifications
    set read_at = ?
    where id = ? and user_id = ? and read_at is null
  `);
  const deactivateCardDefinition = db.prepare(`
    update card_definitions
    set is_active = 0, updated_at = ?
    where id = ?
  `);
  const insertPackOpenEvent = db.prepare(`
    insert into pack_open_events (id, user_id, pack_number, opened_at, day_key)
    values (?, ?, ?, ?, ?)
  `);
  const insertOwnedCard = db.prepare(`
    insert into owned_cards (
      instance_id, user_id, card_definition_id, acquired_at, pack_number, finish, holographic_seed
    ) values (?, ?, ?, ?, ?, ?, ?)
  `);

  function getPlayerSnapshot(userId: string, now = new Date()): RemoteGameState {
    const dayKey = getDayKey(now, config.appTimeZone);
    const packsOpenedToday =
      (countPacksOpenedToday.get(userId, dayKey) as { count: number }).count ?? 0;
    const totalPacksOpened =
      (selectMaxPackNumber.get(userId) as { packNumber: number }).packNumber ?? 0;
    const collection = selectCollection.all(userId).map((row) => toOwnedCard(row as OwnedCardRow));

    return {
      collection,
      packsOpenedToday,
      totalPacksOpened,
      remainingPacks: Math.max(config.dailyPackLimit - packsOpenedToday, 0),
      dailyPackLimit: config.dailyPackLimit,
      nextPackResetAt: getNextResetAt(now, config.appTimeZone).toISOString(),
      serverNow: now.toISOString(),
    };
  }

  function getPublicPlayerShowcase(slug: string, now = new Date()) {
    const trimmedSlug = slug.trim();

    if (!trimmedSlug) {
      return null;
    }

    const user = selectPublicUserBySlug.get(
      normalizeNicknameKey(trimmedSlug),
      trimmedSlug,
    ) as UserRow | undefined;

    if (!user) {
      return null;
    }

    return {
      user: toPublicPlayerProfile(user),
      game: getPlayerSnapshot(user.id, now),
    };
  }

  function upsertUserFromGoogle(profile: GoogleProfile): AuthUser {
    const now = new Date().toISOString();
    const userId = randomUUID();
    let nickname = buildDefaultNickname(userId);
    let normalizedNickname = normalizeNicknameKey(nickname);
    let counter = 2;

    while (selectUserByNicknameNormalized.get(normalizedNickname)) {
      nickname = trimNicknameLength(`${buildDefaultNickname(userId)}-${counter}`);
      normalizedNickname = normalizeNicknameKey(nickname);
      counter += 1;
    }

    return upsertGoogleUser.get({
      id: userId,
      google_sub: profile.sub,
      email: profile.email,
      name: profile.name,
      nickname,
      nickname_normalized: normalizedNickname,
      avatar_url: profile.avatarUrl,
      created_at: now,
      updated_at: now,
    }) as AuthUser;
  }

  function updateNickname(userId: string, nickname: string): AuthUser {
    const trimmedNickname = nickname.trim();
    const normalizedNickname = normalizeNicknameKey(trimmedNickname);

    try {
      return updateNicknameStatement.get(
        trimmedNickname,
        normalizedNickname,
        new Date().toISOString(),
        userId,
      ) as AuthUser;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new NicknameTakenError();
      }

      throw error;
    }
  }

  function createSession(userId: string, now = new Date()) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token, config.sessionSecret);
    const expiresAt = new Date(now.getTime() + config.sessionTtlMs).toISOString();
    const timestamp = now.toISOString();

    insertSession.run(randomUUID(), tokenHash, userId, expiresAt, timestamp, timestamp);

    return {
      token,
      expiresAt,
    };
  }

  function getUserFromSessionToken(token: string | undefined, now = new Date()): AuthUser | null {
    if (!token) {
      return null;
    }

    const tokenHash = hashToken(token, config.sessionSecret);
    const row = selectSessionUser.get(tokenHash, now.toISOString()) as SessionRow | undefined;
    return row ?? null;
  }

  function deleteSession(token: string | undefined) {
    if (!token) {
      return;
    }

    deleteSessionByHash.run(hashToken(token, config.sessionSecret));
  }

  function createNotification(
    userId: string,
    kind: AppNotificationKind,
    title: string,
    message: string,
    proposalId: string | null,
    cardInstanceId: string | null,
    createdAt = new Date().toISOString(),
  ) {
    insertNotification.run(
      randomUUID(),
      userId,
      kind,
      title,
      message,
      proposalId,
      cardInstanceId,
      createdAt,
    );
  }

  function listUnreadNotifications(userId: string): AppNotification[] {
    return selectUnreadNotifications
      .all(userId)
      .map((row) => toAppNotification(row as NotificationRow));
  }

  function markNotificationReadById(userId: string, notificationId: string) {
    return markNotificationRead.run(new Date().toISOString(), notificationId, userId).changes > 0;
  }

  function startCardProposal(user: AuthUser): CardProposal {
    const existing = selectLatestActiveProposalByUser.get(user.id) as ProposalRow | undefined;

    if (existing) {
      return toCardProposal(existing);
    }

    const now = new Date().toISOString();
    const rarity = weightedPick(proposalRarityWeights);
    const grant = buildProposalEffectGrant(rarity);
    const visuals = getDefaultCardVisuals();
    const defaultFinish =
      rarity === 'veryrare' ? 'prismatic' : rarity === 'rare' || rarity === 'epic' ? 'foil' : 'standard';
    const proposalId = randomUUID();

    insertProposal.run(
      proposalId,
      user.id,
      user.name,
      rarity,
      'draft',
      'Новая карточка',
      'Опиши, чем эта карточка должна запомниться.',
      '',
      defaultFinish,
      visuals.frameStyle,
      visuals.accentColor,
      LEGACY_VISUAL_EFFECT_PATTERN,
      LEGACY_VISUAL_EFFECT_PLACEMENT,
      JSON.stringify(visuals.decorativePattern),
      JSON.stringify(grant.allowedEffects),
      grant.maxEffectLayers,
      JSON.stringify([]),
      now,
      now,
      null,
      null,
      null,
      null,
    );

    return toCardProposal(selectProposalById.get(proposalId) as ProposalRow);
  }

  function getProposalById(proposalId: string): CardProposal | null {
    const row = selectProposalById.get(proposalId) as ProposalRow | undefined;
    return row ? toCardProposal(row) : null;
  }

  function updateProposalDraftById(
    proposalId: string,
    payload: ProposalEditorPayload,
  ): CardProposal | null {
    const visuals = normalizeVisuals(payload.visuals);
    const effectLayers = normalizeEffectLayers(payload.effectLayers);
    const row = updateProposalDraft.get({
      id: proposalId,
      title: payload.title.trim(),
      description: payload.description.trim(),
      url_image: normalizeCardImageUrl(payload.urlImage),
      default_finish: payload.defaultFinish,
      visual_frame_style: visuals.frameStyle,
      visual_accent_color: visuals.accentColor,
      visual_pattern_json: JSON.stringify(visuals.decorativePattern),
      effect_layers_json: JSON.stringify(effectLayers),
      updated_at: new Date().toISOString(),
    }) as ProposalRow | undefined;

    return row ? toCardProposal(row) : null;
  }

  function updateProposalAdminOverrideById(
    proposalId: string,
    rarity: Rarity,
    allowedEffects: CardTreatmentEffect[],
  ): CardProposal | null {
    const existing = selectProposalById.get(proposalId) as ProposalRow | undefined;

    if (!existing || existing.status !== 'draft') {
      return null;
    }

    const nextEffectLayers = filterEffectLayersByAllowedTypes(
      normalizeEffectLayers(parseJsonArray<CardEffectLayer>(existing.effect_layers_json, [])),
      allowedEffects,
    );
    const row = updateProposalAdminOverride.get({
      id: proposalId,
      rarity,
      allowed_effects_json: JSON.stringify(allowedEffects),
      max_effect_layers: allowedEffects.length,
      effect_layers_json: JSON.stringify(nextEffectLayers),
      updated_at: new Date().toISOString(),
    }) as ProposalRow | undefined;

    return row ? toCardProposal(row) : null;
  }

  function submitProposalById(proposalId: string): CardProposal | null {
    const timestamp = new Date().toISOString();
    const row = submitProposalStatement.get(
      timestamp,
      timestamp,
      proposalId,
    ) as ProposalRow | undefined;

    return row ? toCardProposal(row) : null;
  }

  function listAdminProposals(): CardProposal[] {
    return selectAdminProposals.all().map((row) => toCardProposal(row as ProposalRow));
  }

  function listAdminCards(): AdminCatalogCard[] {
    const rows = selectAdminCatalog.all().map((row) => row as AdminCardRow);
    const catalog = rows.map((row) => toCardDefinition(row));
    const dropChancePerPackByRarity = getPerCardDropChanceByRarity(catalog);
    return rows.map((row) => toAdminCatalogCard(row, dropChancePerPackByRarity));
  }

  function listAdminUsers(): AdminUserRecord[] {
    return selectAdminUsers.all().map((row) => toAdminUserRecord(row as AdminUserRow));
  }

  function approveProposalById(proposalId: string): CardProposal | null {
    const existing = selectProposalById.get(proposalId) as ProposalRow | undefined;

    if (!existing || existing.status !== 'pending') {
      return null;
    }

    const approvedCardId =
      existing.approved_card_definition_id ?? createProposalCardId(existing.title, existing.id);
    const stats = generateStatsForProposal(existing.rarity, existing.id);
    const approvedAt = new Date().toISOString();
    const creatorRewardPackNumber = Math.max(
      (selectMaxPackNumber.get(existing.creator_user_id) as { packNumber: number }).packNumber ?? 0,
      1,
    );
    const creatorRewardInstanceId = randomUUID();
    const creatorRewardFinish = existing.default_finish;
    const creatorRewardSeed = Math.random();

    db.exec('BEGIN IMMEDIATE');

    try {
      upsertCardDefinition.run({
        id: approvedCardId,
        title: existing.title,
        url_image: normalizeCardImageUrl(existing.url_image),
        rarity: existing.rarity,
        description: existing.description,
        power: stats.power,
        cringe: stats.cringe,
        fame: stats.fame,
        rarity_score: stats.rarityScore,
        humor: stats.humor,
        default_finish: existing.default_finish,
        creator_name: existing.creator_name,
        visual_frame_style: existing.visual_frame_style,
        visual_accent_color: existing.visual_accent_color,
        visual_pattern_json: existing.visual_pattern_json,
        effect_layers_json: existing.effect_layers_json,
        updated_at: approvedAt,
      });

      const row = approveProposalStatement.get(
        approvedAt,
        approvedAt,
        approvedCardId,
        proposalId,
      ) as ProposalRow | undefined;

      if (!row) {
        db.exec('ROLLBACK');
        return null;
      }

      insertOwnedCard.run(
        creatorRewardInstanceId,
        existing.creator_user_id,
        approvedCardId,
        approvedAt,
        creatorRewardPackNumber,
        creatorRewardFinish,
        creatorRewardSeed,
      );

      createNotification(
        existing.creator_user_id,
        'success',
        'Ваша карточка принята',
        `Ваша карточка «${existing.title}» прошла модерацию, добавлена в игру и уже находится в вашей коллекции.`,
        existing.id,
        creatorRewardInstanceId,
        approvedAt,
      );

      db.exec('COMMIT');
      return toCardProposal(row);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function deleteProposalById(proposalId: string, rejectionReason: string): CardProposal | null {
    const existing = selectProposalById.get(proposalId) as ProposalRow | undefined;

    if (!existing || existing.status !== 'pending') {
      return null;
    }

    const timestamp = new Date().toISOString();
    const normalizedReason = rejectionReason.trim();

    db.exec('BEGIN IMMEDIATE');

    try {
      const row = markProposalDeleted.get(
        timestamp,
        normalizedReason,
        proposalId,
      ) as ProposalRow | undefined;

      if (!row) {
        db.exec('ROLLBACK');
        return null;
      }

      createNotification(
        existing.creator_user_id,
        'error',
        'Ваша карточка отклонена',
        `Ваша карточка «${existing.title}» не прошла модерацию. Причина: ${normalizedReason}`,
        existing.id,
        null,
        timestamp,
      );

      db.exec('COMMIT');
      return toCardProposal(row);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function openPackForUser(userId: string, now = new Date()): OpenPackResult {
    const dayKey = getDayKey(now, config.appTimeZone);
    const nowIso = now.toISOString();
    const nextPackResetAt = getNextResetAt(now, config.appTimeZone).toISOString();

    db.exec('BEGIN IMMEDIATE');

    try {
      const openedToday =
        (countPacksOpenedToday.get(userId, dayKey) as { count: number }).count ?? 0;

      if (openedToday >= config.dailyPackLimit) {
        throw new PackLimitReachedError(nextPackResetAt);
      }

      const nextPackNumber =
        ((selectMaxPackNumber.get(userId) as { packNumber: number }).packNumber ?? 0) + 1;
      const catalog = selectActiveCatalog.all().map((row) => toCardDefinition(row as CardRow));

      if (catalog.length === 0) {
        throw new NoApprovedCardsError();
      }

      const pack = rollPackFromCatalog(catalog, nextPackNumber, nowIso);

      insertPackOpenEvent.run(randomUUID(), userId, nextPackNumber, nowIso, dayKey);

      for (const card of pack) {
        insertOwnedCard.run(
          card.instanceId,
          userId,
          card.id,
          card.acquiredAt,
          card.packNumber,
          card.finish,
          card.holographicSeed,
        );
      }

      db.exec('COMMIT');

      return {
        pack,
        game: getPlayerSnapshot(userId, now),
      };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    close() {
      db.close();
    },
    upsertUserFromGoogle,
    createSession,
    getUserFromSessionToken,
    deleteSession,
    getPlayerSnapshot,
    getPublicPlayerShowcase,
    openPackForUser,
    updateNickname,
    startCardProposal,
    getProposalById,
    updateProposalDraftById,
    updateProposalAdminOverrideById,
    submitProposalById,
    listAdminProposals,
    listAdminCards,
    listAdminUsers,
    listUnreadNotifications,
    markNotificationReadById,
    approveProposalById,
    deleteProposalById,
  };
}

export type GameStore = ReturnType<typeof createGameStore>;

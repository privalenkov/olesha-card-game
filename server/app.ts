import fs from 'node:fs/promises';
import { type Dirent, type Stats } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  CARD_FINISH_OPTIONS,
  CARD_FRAME_STYLE_OPTIONS,
  CARD_TREATMENT_EFFECT_OPTIONS,
  clampEffectShimmer,
  getDefaultCardVisuals,
  type CardDecorativePattern,
  type AdminProposalOverridePayload,
  type ApiErrorResponse,
  type AuthUser,
  type CardEffectLayer,
  type CollectionFilter,
  type CardTreatmentEffect,
  type ProposalEditorPayload,
  type Rarity,
  type SessionState,
} from '../src/game/types.js';
import { serverConfig } from './config.js';
import {
  createGameStore,
  GameStore,
  NicknameTakenError,
  NoApprovedCardsError,
  PackLimitReachedError,
} from './store.js';

function apiError(error: string, message: string, extra?: Partial<ApiErrorResponse>) {
  return {
    error,
    message,
    ...extra,
  } satisfies ApiErrorResponse;
}

interface RateLimitWindow {
  max: number;
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfoResponse {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
}

const APP_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://lh3.googleusercontent.com",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "form-action 'self' https://accounts.google.com",
].join('; ');

const UPLOADED_SVG_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "style-src 'unsafe-inline'",
  'sandbox',
].join('; ');

const MUTATION_RATE_LIMITS = {
  authStart: { max: 12, windowMs: 10 * 60 * 1000 },
  authCallback: { max: 24, windowMs: 10 * 60 * 1000 },
  notifications: { max: 90, windowMs: 10 * 60 * 1000 },
  profile: { max: 24, windowMs: 10 * 60 * 1000 },
  uploads: { max: 24, windowMs: 10 * 60 * 1000 },
  proposals: { max: 120, windowMs: 10 * 60 * 1000 },
  admin: { max: 120, windowMs: 10 * 60 * 1000 },
  packsOpen: { max: 12, windowMs: 60 * 1000 },
} satisfies Record<string, RateLimitWindow>;

function isNodeErrorWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function buildGoogleAuthUrl(state: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', serverConfig.googleClientId);
  url.searchParams.set('redirect_uri', serverConfig.googleCallbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

async function exchangeGoogleAuthorizationCode(code: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: serverConfig.googleClientId,
      client_secret: serverConfig.googleClientSecret,
      grant_type: 'authorization_code',
      redirect_uri: serverConfig.googleCallbackUrl,
    }),
  });
  const responseText = await response.text();
  let payload: GoogleTokenResponse | null = null;

  try {
    payload = JSON.parse(responseText) as GoogleTokenResponse;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const details =
      payload?.error_description?.trim() ||
      payload?.error?.trim() ||
      responseText.trim() ||
      response.statusText;
    throw new Error(`Token endpoint returned ${response.status}: ${details}`);
  }

  return payload ?? {};
}

async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const responseText = await response.text();
  let payload: GoogleUserInfoResponse | null = null;

  try {
    payload = JSON.parse(responseText) as GoogleUserInfoResponse;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      `Userinfo endpoint returned ${response.status}: ${responseText.trim() || response.statusText}`,
    );
  }

  return payload ?? {};
}

function normalizeNickname(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length < 2 || trimmed.length > 32) {
    return null;
  }

  if (!/^[A-Za-z0-9_-]+$/u.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function getRequestPath(request: FastifyRequest) {
  return new URL(request.raw.url ?? '/', serverConfig.appBaseUrl).pathname;
}

function normalizeCollectionFilter(value: unknown): CollectionFilter {
  return value === 'duplicates' ? 'duplicates' : 'all';
}

function normalizeCollectionOffset(value: unknown): number {
  if (typeof value !== 'string') {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeCollectionLimit(value: unknown): number {
  if (typeof value !== 'string') {
    return 16;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 16;
  }

  return Math.min(parsed, 16);
}

function isAdminUser(user: AuthUser | null): boolean {
  return Boolean(
    user &&
      serverConfig.adminUserId &&
      (user.id === serverConfig.adminUserId ||
        user.googleSub === serverConfig.adminUserId ||
        user.email === serverConfig.adminUserId),
  );
}

function isStoredAssetUrl(value: string) {
  return /^\/uploads\/[a-zA-Z0-9-]+\.(png|jpg|jpeg|webp|svg)$/u.test(value);
}

function normalizeProposalPayload(
  value: unknown,
  effectBudget: { allowedEffects: CardEffectLayer['type'][]; maxEffectLayers: number },
): ProposalEditorPayload | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const defaults = getDefaultCardVisuals();
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  const urlImage = typeof payload.urlImage === 'string' ? payload.urlImage.trim() : '';
  const defaultFinish =
    typeof payload.defaultFinish === 'string' &&
    CARD_FINISH_OPTIONS.includes(payload.defaultFinish as (typeof CARD_FINISH_OPTIONS)[number])
      ? (payload.defaultFinish as (typeof CARD_FINISH_OPTIONS)[number])
      : null;
  const visuals =
    typeof payload.visuals === 'object' && payload.visuals !== null
      ? (payload.visuals as Record<string, unknown>)
      : null;
  const frameStyle =
    typeof visuals?.frameStyle === 'string' &&
    CARD_FRAME_STYLE_OPTIONS.includes(visuals.frameStyle as (typeof CARD_FRAME_STYLE_OPTIONS)[number])
      ? (visuals.frameStyle as (typeof CARD_FRAME_STYLE_OPTIONS)[number])
      : defaults.frameStyle;
  const accentColor =
    typeof visuals?.accentColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/u.test(visuals.accentColor.trim())
      ? visuals.accentColor.trim()
      : defaults.accentColor;
  const decorativePattern =
    typeof visuals?.decorativePattern === 'object' && visuals.decorativePattern !== null
      ? (visuals.decorativePattern as Record<string, unknown>)
      : null;
  const decorativePatternDefaults = defaults.decorativePattern;
  const decorativePatternSvgUrl =
    typeof decorativePattern?.svgUrl === 'string' ? decorativePattern.svgUrl.trim() : '';
  const decorativePatternSize =
    typeof decorativePattern?.size === 'number' && Number.isFinite(decorativePattern.size)
      ? decorativePattern.size
      : decorativePatternDefaults.size;
  const decorativePatternGap =
    typeof decorativePattern?.gap === 'number' && Number.isFinite(decorativePattern.gap)
      ? decorativePattern.gap
      : decorativePatternDefaults.gap;
  const decorativePatternOpacity =
    typeof decorativePattern?.opacity === 'number' && Number.isFinite(decorativePattern.opacity)
      ? decorativePattern.opacity
      : decorativePatternDefaults.opacity;
  const decorativePatternOffsetX =
    typeof decorativePattern?.offsetX === 'number' && Number.isFinite(decorativePattern.offsetX)
      ? decorativePattern.offsetX
      : decorativePatternDefaults.offsetX;
  const decorativePatternOffsetY =
    typeof decorativePattern?.offsetY === 'number' && Number.isFinite(decorativePattern.offsetY)
      ? decorativePattern.offsetY
      : decorativePatternDefaults.offsetY;
  const rawEffectLayers = Array.isArray(payload.effectLayers) ? payload.effectLayers : null;

  if (title.length < 2 || title.length > 80) {
    return null;
  }

  if (!isStoredAssetUrl(decorativePatternSvgUrl) && decorativePatternSvgUrl !== '') {
    return null;
  }

  if (description.length < 8 || description.length > 280) {
    return null;
  }

  if (!defaultFinish) {
    return null;
  }

  if (!rawEffectLayers || rawEffectLayers.length > effectBudget.maxEffectLayers) {
    return null;
  }

  const effectLayers: CardEffectLayer[] = [];
  const seenIds = new Set<string>();
  const seenTypes = new Set<CardEffectLayer['type']>();

  for (const rawLayer of rawEffectLayers) {
    if (typeof rawLayer !== 'object' || rawLayer === null) {
      return null;
    }

    const layer = rawLayer as Record<string, unknown>;
    const id = typeof layer.id === 'string' ? layer.id.trim() : '';
    const type =
      typeof layer.type === 'string' &&
      CARD_TREATMENT_EFFECT_OPTIONS.includes(layer.type as CardEffectLayer['type'])
        ? (layer.type as CardEffectLayer['type'])
        : null;
    const maskUrl = typeof layer.maskUrl === 'string' ? layer.maskUrl.trim() : '';
    const opacity =
      typeof layer.opacity === 'number' && Number.isFinite(layer.opacity) ? layer.opacity : NaN;
    const shimmer =
      typeof layer.shimmer === 'number' && Number.isFinite(layer.shimmer) ? layer.shimmer : 1;
    const relief =
      typeof layer.relief === 'number' && Number.isFinite(layer.relief)
        ? layer.relief
        : 0;

    if (
      id.length < 6 ||
      !type ||
      !effectBudget.allowedEffects.includes(type) ||
      seenIds.has(id) ||
      seenTypes.has(type) ||
      (!isStoredAssetUrl(maskUrl) && maskUrl !== '') ||
      !Number.isFinite(opacity) ||
      !Number.isFinite(shimmer) ||
      !Number.isFinite(relief)
    ) {
      return null;
    }

    seenIds.add(id);
    seenTypes.add(type);
    effectLayers.push({
      id,
      type,
      maskUrl,
      opacity: Math.max(0.18, Math.min(opacity, 1)),
      shimmer: clampEffectShimmer(type, shimmer),
      relief: Math.max(-1, Math.min(relief, 1)),
    });
  }

  return {
    title,
    description,
    urlImage,
    defaultFinish,
    visuals: {
      frameStyle,
      accentColor,
      decorativePattern: {
        svgUrl: decorativePatternSvgUrl,
        size: Math.max(20, Math.min(decorativePatternSize, 320)),
        gap: Math.max(0, Math.min(decorativePatternGap, 320)),
        opacity: Math.max(0, Math.min(decorativePatternOpacity, 1)),
        offsetX: Math.max(-1024, Math.min(decorativePatternOffsetX, 1024)),
        offsetY: Math.max(-1536, Math.min(decorativePatternOffsetY, 1536)),
      } satisfies CardDecorativePattern,
    },
    effectLayers,
  };
}

function normalizeAdminProposalOverridePayload(value: unknown): AdminProposalOverridePayload | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const rarity =
    typeof payload.rarity === 'string' &&
    ['common', 'uncommon', 'rare', 'epic', 'veryrare'].includes(payload.rarity)
      ? (payload.rarity as Rarity)
      : null;
  const rawAllowedEffects = Array.isArray(payload.allowedEffects) ? payload.allowedEffects : null;

  if (!rarity || !rawAllowedEffects) {
    return null;
  }

  const allowedEffects: CardTreatmentEffect[] = [];
  const seen = new Set<CardTreatmentEffect>();

  for (const rawEffect of rawAllowedEffects) {
    if (
      typeof rawEffect !== 'string' ||
      !CARD_TREATMENT_EFFECT_OPTIONS.includes(rawEffect as CardTreatmentEffect)
    ) {
      return null;
    }

    const effect = rawEffect as CardTreatmentEffect;
    if (seen.has(effect)) {
      continue;
    }

    seen.add(effect);
    allowedEffects.push(effect);
  }

  return {
    rarity,
    allowedEffects,
  };
}

function normalizeProposalRejectionReason(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';

  if (reason.length < 6 || reason.length > 280) {
    return null;
  }

  return reason;
}

function parseImageDataUrl(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.match(
    /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/u,
  );

  if (!match) {
    return null;
  }

  const [, mimeType, base64] = match;
  const buffer = Buffer.from(base64, 'base64');

  if (buffer.byteLength === 0 || buffer.byteLength > 5 * 1024 * 1024) {
    return null;
  }

  return {
    mimeType,
    buffer,
  };
}

function sanitizeSvgUpload(buffer: Buffer) {
  const markup = buffer.toString('utf8').replace(/^\uFEFF/u, '').trim();

  if (!markup || !/<svg[\s>]/iu.test(markup)) {
    return null;
  }

  const forbiddenPatterns = [
    /<script[\s>]/iu,
    /<!DOCTYPE/iu,
    /<!ENTITY/iu,
    /<foreignObject[\s>]/iu,
    /<(?:iframe|frame|frameset|object|embed|audio|video|portal|meta|link)\b/iu,
    /<(?:animate|animateMotion|animateTransform|set|mpath)\b/iu,
    /\son[a-z]+\s*=/iu,
    /\b(?:javascript:|vbscript:|data:text\/html)\b/iu,
    /\b(?:href|xlink:href)\s*=\s*["']?\s*(?!#)/iu,
    /@import/iu,
  ];

  if (forbiddenPatterns.some((pattern) => pattern.test(markup))) {
    return null;
  }

  return Buffer.from(markup, 'utf8');
}

function getMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'text/html; charset=utf-8';
  }
}

function sessionCookieOptions(expiresAt?: string) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: serverConfig.secureCookies,
    path: '/',
    ...(expiresAt ? { expires: new Date(expiresAt) } : {}),
  };
}

function setNoStore(reply: FastifyReply) {
  reply.header('Cache-Control', 'no-store');
}

function assertAllowedOrigin(request: FastifyRequest, reply: FastifyReply) {
  const origin = request.headers.origin;
  reply.header('Vary', 'Origin');

  if (!origin) {
    reply.code(403).send(apiError('FORBIDDEN_ORIGIN', 'Для этого запроса нужен корректный Origin.'));
    return;
  }

  if (serverConfig.allowedOrigins.has(origin)) {
    return;
  }

  reply.code(403).send(apiError('FORBIDDEN_ORIGIN', 'Недопустимый origin для мутации данных.'));
}

function applySecurityHeaders(request: FastifyRequest, reply: FastifyReply) {
  const requestPath = getRequestPath(request);

  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (serverConfig.secureCookies) {
    reply.header(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  if (requestPath.startsWith('/uploads/') && requestPath.toLowerCase().endsWith('.svg')) {
    reply.header('Content-Security-Policy', UPLOADED_SVG_CONTENT_SECURITY_POLICY);
    return;
  }

  if (!requestPath.startsWith('/api/')) {
    reply.header('Content-Security-Policy', APP_CONTENT_SECURITY_POLICY);
  }
}

function createRateLimiter() {
  const entries = new Map<string, RateLimitEntry>();
  let requestsSinceCleanup = 0;

  function cleanup(now: number) {
    if (requestsSinceCleanup < 256) {
      return;
    }

    requestsSinceCleanup = 0;

    for (const [key, entry] of entries.entries()) {
      if (entry.resetAt <= now) {
        entries.delete(key);
      }
    }
  }

  return function enforceRateLimit(
    request: FastifyRequest,
    reply: FastifyReply,
    bucket: string,
    window: RateLimitWindow,
    subject = request.ip,
  ) {
    const now = Date.now();
    requestsSinceCleanup += 1;
    cleanup(now);

    const key = `${bucket}:${subject || 'anonymous'}`;
    const current = entries.get(key);

    if (!current || current.resetAt <= now) {
      entries.set(key, {
        count: 1,
        resetAt: now + window.windowMs,
      });
      return true;
    }

    if (current.count >= window.max) {
      reply.header(
        'Retry-After',
        String(Math.max(Math.ceil((current.resetAt - now) / 1000), 1)),
      );
      reply
        .code(429)
        .send(apiError('RATE_LIMITED', 'Слишком много запросов. Подожди немного и попробуй снова.'));
      return false;
    }

    current.count += 1;
    return true;
  };
}

async function cleanupOrphanedUploads(store: GameStore) {
  let entries: Dirent[];

  try {
    entries = await fs.readdir(serverConfig.uploadsDir, { withFileTypes: true });
  } catch (error) {
    if (isNodeErrorWithCode(error, 'ENOENT')) {
      return {
        reclaimedBytes: 0,
        removedCount: 0,
      };
    }

    throw error;
  }

  const referencedAssets = store.listReferencedStoredAssetUrls();
  const cutoffTime = Date.now() - serverConfig.uploadOrphanGracePeriodMs;
  let reclaimedBytes = 0;
  let removedCount = 0;

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const assetUrl = `/uploads/${entry.name}`;

    if (referencedAssets.has(assetUrl)) {
      continue;
    }

    const filePath = path.join(serverConfig.uploadsDir, entry.name);
    let stat: Stats;

    try {
      stat = await fs.stat(filePath);
    } catch (error) {
      if (isNodeErrorWithCode(error, 'ENOENT')) {
        continue;
      }

      throw error;
    }

    if (!stat.isFile() || stat.mtimeMs > cutoffTime) {
      continue;
    }

    try {
      await fs.unlink(filePath);
      removedCount += 1;
      reclaimedBytes += stat.size;
    } catch (error) {
      if (isNodeErrorWithCode(error, 'ENOENT')) {
        continue;
      }

      throw error;
    }
  }

  return {
    reclaimedBytes,
    removedCount,
  };
}

async function serveClientFile(request: FastifyRequest, reply: FastifyReply) {
  const requestUrl = new URL(request.raw.url ?? '/', serverConfig.appBaseUrl);
  const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const candidatePath = path.resolve(serverConfig.clientDistDir, `.${pathname}`);

  if (!candidatePath.startsWith(serverConfig.clientDistDir)) {
    reply.code(403).send('Forbidden');
    return;
  }

  try {
    const stat = await fs.stat(candidatePath);

    if (stat.isFile()) {
      const file = await fs.readFile(candidatePath);
      reply.type(getMimeType(candidatePath)).send(file);
      return;
    }
  } catch {
    // Fall through to index.html below.
  }

  try {
    const indexFile = await fs.readFile(path.join(serverConfig.clientDistDir, 'index.html'));
    reply.type('text/html; charset=utf-8').send(indexFile);
  } catch {
    reply
      .code(404)
      .send('Client build not found. Run npm run build before starting the production server.');
  }
}

async function serveUploadFile(request: FastifyRequest, reply: FastifyReply) {
  const requestUrl = new URL(request.raw.url ?? '/', serverConfig.appBaseUrl);
  const pathname = requestUrl.pathname.replace(/^\/uploads/u, '');
  const candidatePath = path.resolve(serverConfig.uploadsDir, `.${pathname}`);

  if (!candidatePath.startsWith(serverConfig.uploadsDir)) {
    reply.code(403).send('Forbidden');
    return;
  }

  try {
    const file = await fs.readFile(candidatePath);
    const safeFile =
      path.extname(candidatePath).toLowerCase() === '.svg' ? sanitizeSvgUpload(file) : file;

    if (!safeFile) {
      reply.code(415).send('Unsafe SVG');
      return;
    }

    reply.type(getMimeType(candidatePath)).send(safeFile);
  } catch {
    reply.code(404).send('Not found');
  }
}

async function readSessionState(store: GameStore, request: FastifyRequest): Promise<SessionState> {
  const token = request.cookies[serverConfig.sessionCookieName];
  const user = store.getUserFromSessionToken(token);

  if (!user) {
    return {
      authenticated: false,
      authConfigured: serverConfig.googleAuthConfigured,
      isAdmin: false,
      user: null,
      game: null,
    };
  }

  return {
    authenticated: true,
    authConfigured: serverConfig.googleAuthConfigured,
    isAdmin: isAdminUser(user),
    user,
    game: store.getPlayerSnapshot(user.id),
  };
}

export async function buildApp() {
  const app = Fastify({
    bodyLimit: 8 * 1024 * 1024,
    logger: true,
    trustProxy: true,
  });
  const store = createGameStore(serverConfig);
  const enforceRateLimit = createRateLimiter();
  let uploadsCleanupPromise: Promise<void> | null = null;

  await app.register(cookie);
  await fs.mkdir(serverConfig.uploadsDir, { recursive: true });

  function scheduleUploadsCleanup() {
    if (uploadsCleanupPromise) {
      return uploadsCleanupPromise;
    }

    uploadsCleanupPromise = cleanupOrphanedUploads(store)
      .then(({ reclaimedBytes, removedCount }) => {
        if (removedCount > 0) {
          app.log.info({ reclaimedBytes, removedCount }, 'Removed orphaned uploaded assets.');
        }
      })
      .catch((error) => {
        app.log.error(error, 'Failed to cleanup orphaned uploaded assets.');
      })
      .finally(() => {
        uploadsCleanupPromise = null;
      });

    return uploadsCleanupPromise;
  }

  void scheduleUploadsCleanup();

  app.addHook('onClose', async () => {
    store.close();
  });

  app.addHook('onRequest', async (request, reply) => {
    applySecurityHeaders(request, reply);
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (reply.sent) {
      return;
    }

    reply.code(500).send(apiError('INTERNAL_ERROR', 'Внутренняя ошибка сервера.'));
  });

  app.get('/api/health', async () => ({
    ok: true,
    now: new Date().toISOString(),
  }));

  app.get('/api/me', async (request, reply) => {
    setNoStore(reply);
    return readSessionState(store, request);
  });

  app.get('/api/collections/:playerSlug', async (request, reply) => {
    const playerSlug = (request.params as { playerSlug?: string }).playerSlug?.trim() ?? '';
    const query =
      typeof request.query === 'object' && request.query !== null
        ? (request.query as Record<string, unknown>)
        : {};
    const showcase = store.getPublicPlayerShowcase(playerSlug, {
      filter: normalizeCollectionFilter(query.filter),
      offset: normalizeCollectionOffset(query.offset),
      limit: normalizeCollectionLimit(query.limit),
    });

    if (!showcase) {
      reply.code(404).send(apiError('COLLECTION_NOT_FOUND', 'Витрина игрока не найдена.'));
      return;
    }

    setNoStore(reply);
    reply.send(showcase);
  });

  app.get('/api/notifications', async (request, reply) => {
    const user = store.getUserFromSessionToken(request.cookies[serverConfig.sessionCookieName]);

    if (!user) {
      reply.code(401).send(apiError('UNAUTHORIZED', 'Сначала войди через Google.'));
      return;
    }

    setNoStore(reply);
    reply.send({
      notifications: store.listUnreadNotifications(user.id),
    });
  });

  app.post('/api/notifications/:notificationId/read', async (request, reply) => {
    assertAllowedOrigin(request, reply);

    if (reply.sent) {
      return;
    }

    if (!enforceRateLimit(request, reply, 'notifications', MUTATION_RATE_LIMITS.notifications)) {
      return;
    }

    const user = store.getUserFromSessionToken(request.cookies[serverConfig.sessionCookieName]);

    if (!user) {
      reply.code(401).send(apiError('UNAUTHORIZED', 'Сначала войди через Google.'));
      return;
    }

    const notificationId = (request.params as { notificationId: string }).notificationId;
    const marked = store.markNotificationReadById(user.id, notificationId);

    if (!marked) {
      reply.code(404).send(apiError('NOTIFICATION_NOT_FOUND', 'Уведомление не найдено.'));
      return;
    }

    setNoStore(reply);
    reply.send({ ok: true });
  });

  app.get('/uploads/*', async (request, reply) => {
    await serveUploadFile(request, reply);
  });

  app.get('/api/auth/google/start', async (request, reply) => {
    if (!enforceRateLimit(request, reply, 'auth:start', MUTATION_RATE_LIMITS.authStart)) {
      return;
    }

    if (!serverConfig.googleAuthConfigured) {
      reply
        .code(503)
        .send(apiError('AUTH_NOT_CONFIGURED', 'Google OAuth пока не настроен на сервере.'));
      return;
    }

    const state = randomBytes(24).toString('base64url');
    reply.setCookie(serverConfig.googleStateCookieName, state, {
      ...sessionCookieOptions(),
      maxAge: 10 * 60,
    });

    reply.redirect(buildGoogleAuthUrl(state));
  });

  app.get('/api/auth/google/callback', async (request, reply) => {
    if (!enforceRateLimit(request, reply, 'auth:callback', MUTATION_RATE_LIMITS.authCallback)) {
      return;
    }

    if (!serverConfig.googleAuthConfigured) {
      reply.redirect(serverConfig.frontendRedirectUrl);
      return;
    }

    const code = typeof request.query === 'object' ? (request.query as Record<string, unknown>).code : undefined;
    const state = typeof request.query === 'object' ? (request.query as Record<string, unknown>).state : undefined;
    const expectedState = request.cookies[serverConfig.googleStateCookieName];

    if (typeof code !== 'string' || typeof state !== 'string' || state !== expectedState) {
      reply.clearCookie(serverConfig.googleStateCookieName, sessionCookieOptions());
      reply.code(400).send(apiError('INVALID_OAUTH_STATE', 'Некорректный OAuth state.'));
      return;
    }

    let tokens: GoogleTokenResponse;

    try {
      tokens = await exchangeGoogleAuthorizationCode(code);
    } catch (error) {
      request.log.error(
        {
          err: error,
          googleCallbackUrl: serverConfig.googleCallbackUrl,
          message: getErrorMessage(error),
        },
        'Google OAuth token exchange failed.',
      );
      reply
        .code(502)
        .send(
          apiError(
            'GOOGLE_AUTH_UNAVAILABLE',
            'Сервер не смог завершить вход через Google. Попробуй ещё раз позже.',
          ),
        );
      return;
    }

    if (!tokens.id_token) {
      request.log.error(
        {
          googleCallbackUrl: serverConfig.googleCallbackUrl,
          tokenKeys: Object.keys(tokens),
        },
        'Google token response is missing id_token.',
      );
      reply
        .code(502)
        .send(
          apiError(
            'GOOGLE_AUTH_UNAVAILABLE',
            'Сервер получил неполный ответ от Google. Попробуй ещё раз позже.',
          ),
        );
      return;
    }

    if (!tokens.access_token) {
      request.log.error(
        {
          googleCallbackUrl: serverConfig.googleCallbackUrl,
          tokenKeys: Object.keys(tokens),
        },
        'Google token response is missing access_token.',
      );
      reply
        .code(502)
        .send(
          apiError(
            'GOOGLE_AUTH_UNAVAILABLE',
            'Сервер получил неполный ответ от Google. Попробуй ещё раз позже.',
          ),
        );
      return;
    }

    let payload: GoogleUserInfoResponse;

    try {
      payload = await fetchGoogleUserInfo(tokens.access_token);
    } catch (error) {
      request.log.error(
        {
          err: error,
          message: getErrorMessage(error),
        },
        'Google OAuth userinfo request failed.',
      );
      reply
        .code(502)
        .send(
          apiError(
            'GOOGLE_AUTH_UNAVAILABLE',
            'Сервер не смог получить профиль Google. Попробуй ещё раз позже.',
          ),
        );
      return;
    }

    const emailVerified =
      payload.email_verified === true || payload.email_verified === 'true';

    if (!payload?.sub || !payload.email || !emailVerified) {
      reply.code(403).send(apiError('INVALID_GOOGLE_PROFILE', 'Google-профиль не прошёл валидацию.'));
      return;
    }

    const user = store.upsertUserFromGoogle({
      sub: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email,
      avatarUrl: payload.picture ?? null,
    });
    const session = store.createSession(user.id);

    reply.clearCookie(serverConfig.googleStateCookieName, sessionCookieOptions());
    reply.setCookie(
      serverConfig.sessionCookieName,
      session.token,
      sessionCookieOptions(session.expiresAt),
    );
    reply.redirect(serverConfig.frontendRedirectUrl);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    assertAllowedOrigin(request, reply);

    if (reply.sent) {
      return;
    }

    if (!enforceRateLimit(request, reply, 'profile:logout', MUTATION_RATE_LIMITS.profile)) {
      return;
    }

    store.deleteSession(request.cookies[serverConfig.sessionCookieName]);
    reply.clearCookie(serverConfig.sessionCookieName, sessionCookieOptions());
    setNoStore(reply);
    reply.send({ ok: true });
  });

  app.patch('/api/profile/nickname', async (request, reply) => {
    assertAllowedOrigin(request, reply);

    if (reply.sent) {
      return;
    }

    if (!enforceRateLimit(request, reply, 'profile:nickname', MUTATION_RATE_LIMITS.profile)) {
      return;
    }

    const token = request.cookies[serverConfig.sessionCookieName];
    const user = store.getUserFromSessionToken(token);

    if (!user) {
      reply.code(401).send(apiError('UNAUTHORIZED', 'Сначала войди через Google.'));
      return;
    }

    const payload =
      typeof request.body === 'object' && request.body !== null
        ? (request.body as Record<string, unknown>)
        : null;
    const nickname = normalizeNickname(payload?.name);

    if (!nickname) {
      reply
        .code(400)
        .send(
          apiError(
            'INVALID_NICKNAME',
            'Ник должен быть длиной от 2 до 32 символов и содержать только английские буквы, цифры, дефис или нижнее подчеркивание.',
          ),
        );
      return;
    }

    try {
      setNoStore(reply);
      reply.send({
        user: store.updateNickname(user.id, nickname),
      });
    } catch (error) {
      if (error instanceof NicknameTakenError) {
        reply.code(409).send(apiError('NICKNAME_TAKEN', error.message));
        return;
      }

      throw error;
    }
  });

  app.post('/api/uploads/card-art', async (request, reply) => {
    assertAllowedOrigin(request, reply);

    if (reply.sent) {
      return;
    }

    if (!enforceRateLimit(request, reply, 'uploads:card-art', MUTATION_RATE_LIMITS.uploads)) {
      return;
    }

    const user = store.getUserFromSessionToken(request.cookies[serverConfig.sessionCookieName]);

    if (!user) {
      reply.code(401).send(apiError('UNAUTHORIZED', 'Сначала войди через Google.'));
      return;
    }

    const payload =
      typeof request.body === 'object' && request.body !== null
        ? (request.body as Record<string, unknown>)
        : null;
    const parsed = parseImageDataUrl(payload?.dataUrl);

    if (!parsed) {
      reply
        .code(400)
        .send(apiError('INVALID_IMAGE', 'Нужен PNG, JPEG, WEBP или SVG размером до 5 МБ.'));
      return;
    }

    const normalizedBuffer =
      parsed.mimeType === 'image/svg+xml' ? sanitizeSvgUpload(parsed.buffer) : parsed.buffer;

    if (!normalizedBuffer) {
      reply
        .code(400)
        .send(
          apiError(
            'UNSAFE_SVG',
            'SVG содержит небезопасные конструкции. Удали скрипты, внешние ссылки и обработчики событий.',
          ),
        );
      return;
    }

    const extension =
      parsed.mimeType === 'image/png'
        ? 'png'
        : parsed.mimeType === 'image/svg+xml'
          ? 'svg'
        : parsed.mimeType === 'image/webp'
          ? 'webp'
          : 'jpg';
    const contentHash = createHash('sha256').update(normalizedBuffer).digest('hex');
    const fileName = `${contentHash}.${extension}`;
    const filePath = path.join(serverConfig.uploadsDir, fileName);

    try {
      await fs.writeFile(filePath, normalizedBuffer, { flag: 'wx' });
    } catch (error) {
      if (!isNodeErrorWithCode(error, 'EEXIST')) {
        throw error;
      }
    }

    setNoStore(reply);
    reply.send({
      url: `/uploads/${fileName}`,
    });

    void scheduleUploadsCleanup();
  });

  app.post('/api/card-proposals/start', async (request, reply) => {
    assertAllowedOrigin(request, reply);

    if (reply.sent) {
      return;
    }

    if (!enforceRateLimit(request, reply, 'proposals:start', MUTATION_RATE_LIMITS.proposals)) {
      return;
    }

    const user = store.getUserFromSessionToken(request.cookies[serverConfig.sessionCookieName]);

    if (!user) {
      reply.code(401).send(apiError('UNAUTHORIZED', 'Сначала войди через Google.'));
      return;
    }

    setNoStore(reply);
    reply.send({
      proposal: store.startCardProposal(user),
      rarityBalance: store.getCurrentRarityBalance(),
    });
  });

  app.get('/api/card-proposals/:proposalId', async (request, reply) => {
    const user = store.getUserFromSessionToken(request.cookies[serverConfig.sessionCookieName]);

    if (!user) {
      reply.code(401).send(apiError('UNAUTHORIZED', 'Сначала войди через Google.'));
      return;
    }

    const proposal = store.getProposalById(
      (request.params as { proposalId: string }).proposalId,
    );

    if (!proposal) {
      reply.code(404).send(apiError('PROPOSAL_NOT_FOUND', 'Черновик не найден.'));
      return;
    }

    if (proposal.creatorUserId !== user.id && !isAdminUser(user)) {
      reply.code(403).send(apiError('FORBIDDEN', 'Нет доступа к этому черновику.'));
      return;
    }

    setNoStore(reply);
    reply.send({
      proposal,
      rarityBalance: store.getCurrentRarityBalance(),
    });
  });

  app.patch('/api/card-proposals/:proposalId', async (request, reply) => {
    assertAllowedOrigin(request, reply);

    if (reply.sent) {
      return;
    }

    if (!enforceRateLimit(request, reply, 'proposals:update', MUTATION_RATE_LIMITS.proposals)) {
      return;
    }

    const user = store.getUserFromSessionToken(request.cookies[serverConfig.sessionCookieName]);

    if (!user) {
      reply.code(401).send(apiError('UNAUTHORIZED', 'Сначала войди через Google.'));
      return;
    }

    const proposalId = (request.params as { proposalId: string }).proposalId;
    const proposal = store.getProposalById(proposalId);

    if (!proposal) {
      reply.code(404).send(apiError('PROPOSAL_NOT_FOUND', 'Черновик не найден.'));
      return;
    }

    if (proposal.creatorUserId !== user.id) {
      reply.code(403).send(apiError('FORBIDDEN', 'Нельзя редактировать чужую карточку.'));
      return;
    }

    const payload = normalizeProposalPayload(request.body, {
      allowedEffects: proposal.allowedEffects,
      maxEffectLayers: proposal.maxEffectLayers,
    });

    if (!payload) {
      reply
        .code(400)
        .send(
          apiError(
            'INVALID_PROPOSAL',
            'Заполни заголовок, описание, базовый стиль и используй только выданные сервером эффекты.',
          ),
        );
      return;
    }

    const updated = store.updateProposalDraftById(proposalId, payload);

    if (!updated) {
      reply.code(409).send(apiError('PROPOSAL_LOCKED', 'Эту карточку уже отправили на модерацию.'));
      return;
    }

    setNoStore(reply);
    reply.send({ proposal: updated });
    void scheduleUploadsCleanup();
  });

  app.post('/api/card-proposals/:proposalId/submit', async (request, reply) => {
    assertAllowedOrigin(request, reply);

    if (reply.sent) {
      return;
    }

    if (!enforceRateLimit(request, reply, 'proposals:submit', MUTATION_RATE_LIMITS.proposals)) {
      return;
    }

    const user = store.getUserFromSessionToken(request.cookies[serverConfig.sessionCookieName]);

    if (!user) {
      reply.code(401).send(apiError('UNAUTHORIZED', 'Сначала войди через Google.'));
      return;
    }

    const proposalId = (request.params as { proposalId: string }).proposalId;
    const proposal = store.getProposalById(proposalId);

    if (!proposal) {
      reply.code(404).send(apiError('PROPOSAL_NOT_FOUND', 'Черновик не найден.'));
      return;
    }

    if (proposal.creatorUserId !== user.id) {
      reply.code(403).send(apiError('FORBIDDEN', 'Нельзя отправить чужую карточку.'));
      return;
    }

    if (!proposal.urlImage) {
      reply.code(400).send(apiError('IMAGE_REQUIRED', 'Сначала добавь изображение на карточку.'));
      return;
    }

    if (proposal.effectLayers.some((layer) => !layer.maskUrl)) {
      reply
        .code(400)
        .send(apiError('MASK_REQUIRED', 'У каждого добавленного treatment-слоя должна быть нарисована маска.'));
      return;
    }

    const submitted = store.submitProposalById(proposalId);

    if (!submitted) {
      reply.code(409).send(apiError('PROPOSAL_LOCKED', 'Карточка уже отправлена или обработана.'));
      return;
    }

    setNoStore(reply);
    reply.send({ proposal: submitted });
  });

  app.get('/api/admin/card-proposals', async (request, reply) => {
    const user = store.getUserFromSessionToken(request.cookies[serverConfig.sessionCookieName]);

    if (!isAdminUser(user)) {
      reply.code(403).send(apiError('FORBIDDEN', 'Доступ только для администратора.'));
      return;
    }

    setNoStore(reply);
    reply.send({
      proposals: store.listAdminProposals(),
    });
  });

  app.get('/api/admin/cards', async (request, reply) => {
    const user = store.getUserFromSessionToken(request.cookies[serverConfig.sessionCookieName]);

    if (!isAdminUser(user)) {
      reply.code(403).send(apiError('FORBIDDEN', 'Доступ только для администратора.'));
      return;
    }

    setNoStore(reply);
    reply.send(store.listAdminCards());
  });

  app.get('/api/admin/users', async (request, reply) => {
    const user = store.getUserFromSessionToken(request.cookies[serverConfig.sessionCookieName]);

    if (!isAdminUser(user)) {
      reply.code(403).send(apiError('FORBIDDEN', 'Доступ только для администратора.'));
      return;
    }

    setNoStore(reply);
    reply.send({
      users: store.listAdminUsers(),
    });
  });

  app.post('/api/admin/users/:userId/unlock-pack', async (request, reply) => {
    assertAllowedOrigin(request, reply);

    if (reply.sent) {
      return;
    }

    if (!enforceRateLimit(request, reply, 'admin:unlock-pack', MUTATION_RATE_LIMITS.admin)) {
      return;
    }

    const user = store.getUserFromSessionToken(request.cookies[serverConfig.sessionCookieName]);

    if (!isAdminUser(user)) {
      reply.code(403).send(apiError('FORBIDDEN', 'Доступ только для администратора.'));
      return;
    }

    const adminUser = store.grantAdminPackUnlockByUserId(
      (request.params as { userId: string }).userId,
    );

    if (!adminUser) {
      reply.code(404).send(apiError('USER_NOT_FOUND', 'Пользователь не найден.'));
      return;
    }

    setNoStore(reply);
    reply.send({ user: adminUser });
  });

  app.post('/api/admin/card-proposals/:proposalId/approve', async (request, reply) => {
    assertAllowedOrigin(request, reply);

    if (reply.sent) {
      return;
    }

    if (!enforceRateLimit(request, reply, 'admin:approve-proposal', MUTATION_RATE_LIMITS.admin)) {
      return;
    }

    const user = store.getUserFromSessionToken(request.cookies[serverConfig.sessionCookieName]);

    if (!isAdminUser(user)) {
      reply.code(403).send(apiError('FORBIDDEN', 'Доступ только для администратора.'));
      return;
    }

    const proposal = store.approveProposalById(
      (request.params as { proposalId: string }).proposalId,
    );

    if (!proposal) {
      reply
        .code(404)
        .send(apiError('PROPOSAL_NOT_FOUND', 'Предложение не найдено или уже обработано.'));
      return;
    }

    setNoStore(reply);
    reply.send({ proposal });
    void scheduleUploadsCleanup();
  });

  app.patch('/api/admin/card-proposals/:proposalId/override', async (request, reply) => {
    assertAllowedOrigin(request, reply);

    if (reply.sent) {
      return;
    }

    if (!enforceRateLimit(request, reply, 'admin:override-proposal', MUTATION_RATE_LIMITS.admin)) {
      return;
    }

    const user = store.getUserFromSessionToken(request.cookies[serverConfig.sessionCookieName]);

    if (!isAdminUser(user)) {
      reply.code(403).send(apiError('FORBIDDEN', 'Доступ только для администратора.'));
      return;
    }

    const payload = normalizeAdminProposalOverridePayload(request.body);

    if (!payload) {
      reply
        .code(400)
        .send(apiError('INVALID_OVERRIDE', 'Укажи корректную редкость и допустимый набор effects.'));
      return;
    }

    const proposal = store.updateProposalAdminOverrideById(
      (request.params as { proposalId: string }).proposalId,
      payload.rarity,
      payload.allowedEffects,
    );

    if (!proposal) {
      reply
        .code(404)
        .send(apiError('PROPOSAL_NOT_FOUND', 'Черновик не найден или уже заблокирован.'));
      return;
    }

    setNoStore(reply);
    reply.send({ proposal });
    void scheduleUploadsCleanup();
  });

  app.delete('/api/admin/card-proposals/:proposalId', async (request, reply) => {
    assertAllowedOrigin(request, reply);

    if (reply.sent) {
      return;
    }

    if (!enforceRateLimit(request, reply, 'admin:delete-proposal', MUTATION_RATE_LIMITS.admin)) {
      return;
    }

    const user = store.getUserFromSessionToken(request.cookies[serverConfig.sessionCookieName]);

    if (!isAdminUser(user)) {
      reply.code(403).send(apiError('FORBIDDEN', 'Доступ только для администратора.'));
      return;
    }

    const reason = normalizeProposalRejectionReason(request.body);

    if (!reason) {
      reply
        .code(400)
        .send(apiError('INVALID_REJECTION_REASON', 'Укажи причину отказа длиной от 6 до 280 символов.'));
      return;
    }

    const proposal = store.deleteProposalById(
      (request.params as { proposalId: string }).proposalId,
      reason,
    );

    if (!proposal) {
      reply
        .code(404)
        .send(apiError('PROPOSAL_NOT_FOUND', 'Предложение не найдено или уже обработано.'));
      return;
    }

    setNoStore(reply);
    reply.send({ proposal });
    void scheduleUploadsCleanup();
  });

  app.post('/api/packs/open', async (request, reply) => {
    assertAllowedOrigin(request, reply);

    if (reply.sent) {
      return;
    }

    if (!enforceRateLimit(request, reply, 'packs:open', MUTATION_RATE_LIMITS.packsOpen)) {
      return;
    }

    const token = request.cookies[serverConfig.sessionCookieName];
    const user = store.getUserFromSessionToken(token);

    if (!user) {
      reply.code(401).send(apiError('UNAUTHORIZED', 'Сначала войди через Google.'));
      return;
    }

    try {
      setNoStore(reply);
      reply.send(store.openPackForUser(user.id));
    } catch (error) {
      if (error instanceof PackLimitReachedError) {
        reply.code(409).send(
          apiError('PACK_LIMIT_REACHED', error.message, {
            nextPackResetAt: error.nextPackResetAt,
          }),
        );
        return;
      }

      if (error instanceof NoApprovedCardsError) {
        reply.code(409).send(apiError('NO_APPROVED_CARDS', error.message));
        return;
      }

      throw error;
    }
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api')) {
      reply.code(404).send(apiError('NOT_FOUND', 'Маршрут не найден.'));
      return;
    }

    await serveClientFile(request, reply);
  });

  return app;
}

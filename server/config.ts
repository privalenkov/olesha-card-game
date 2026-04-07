import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const entries: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const unquotedValue = rawValue.replace(/^['"]|['"]$/gu, '');
    entries[key] = unquotedValue;
  }

  return entries;
}

function loadEnvFiles() {
  const envFiles = ['.env', '.env.local'];

  for (const fileName of envFiles) {
    const filePath = path.resolve(process.cwd(), fileName);
    const values = parseEnvFile(filePath);

    for (const [key, value] of Object.entries(values)) {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value: string | undefined, fallback: string): URL {
  return new URL(value ?? fallback);
}

function splitOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function resolvePersistenceRoot() {
  const configuredRoot = process.env.PERSISTENCE_ROOT?.trim();

  if (configuredRoot) {
    return configuredRoot;
  }

  if (process.env.NODE_ENV === 'production' && process.env.APP_BASE_URL) {
    return '/data';
  }

  return './data';
}

loadEnvFiles();

const port = parseInteger(process.env.PORT, 8787);
const host = process.env.HOST ?? '0.0.0.0';
const appBaseUrl = normalizeBaseUrl(process.env.APP_BASE_URL, `http://localhost:${port}`);
const frontendBaseUrl = normalizeBaseUrl(
  process.env.FRONTEND_BASE_URL,
  process.env.NODE_ENV === 'production' ? appBaseUrl.origin : 'http://localhost:5173',
);
const googleClientId = process.env.GOOGLE_CLIENT_ID ?? '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
const rawSessionSecret = process.env.SESSION_SECRET ?? '';
const sessionSecret = rawSessionSecret || 'development-only-session-secret-change-me';

if (process.env.NODE_ENV === 'production' && rawSessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be set to a strong value in production.');
}

const googleCallbackUrl = new URL(
  process.env.GOOGLE_REDIRECT_URI ??
    process.env.GOOGLE_CALLBACK_URL ??
    '/api/auth/google/callback',
  appBaseUrl,
).toString();

const allowedOrigins = new Set<string>([
  appBaseUrl.origin,
  frontendBaseUrl.origin,
  ...splitOrigins(process.env.ALLOWED_ORIGINS),
]);
const persistenceRoot = resolvePersistenceRoot();

export const serverConfig = {
  port,
  host,
  appBaseUrl,
  frontendBaseUrl,
  frontendRedirectUrl: `${frontendBaseUrl.origin}/`,
  googleCallbackUrl,
  googleClientId,
  googleClientSecret,
  googleAuthConfigured: Boolean(googleClientId && googleClientSecret),
  sessionSecret,
  sessionCookieName: 'olesha_session',
  googleStateCookieName: 'olesha_google_state',
  adminUserId: process.env.ADMIN_USER_ID ?? '',
  sessionTtlMs: parseInteger(process.env.SESSION_TTL_DAYS, 30) * 24 * 60 * 60 * 1000,
  dailyPackLimit: parseInteger(process.env.DAILY_PACK_LIMIT, 1),
  dailyProposalLimit: parseInteger(process.env.DAILY_PROPOSAL_LIMIT, 2),
  uploadOrphanGracePeriodMs:
    parseInteger(process.env.UPLOAD_ORPHAN_GRACE_HOURS, 24) * 60 * 60 * 1000,
  appTimeZone: process.env.APP_TIMEZONE ?? 'Europe/Moscow',
  databaseFile: path.resolve(
    process.cwd(),
    process.env.DB_FILE ?? path.join(persistenceRoot, 'olesha.sqlite'),
  ),
  uploadsDir: path.resolve(
    process.cwd(),
    process.env.UPLOADS_DIR ?? path.join(persistenceRoot, 'uploads'),
  ),
  clientDistDir: path.resolve(process.cwd(), './dist'),
  secureCookies:
    process.env.COOKIE_SECURE === 'true' ||
    appBaseUrl.protocol === 'https:' ||
    process.env.NODE_ENV === 'production',
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  allowedOrigins,
} as const;

export type ServerConfig = typeof serverConfig;

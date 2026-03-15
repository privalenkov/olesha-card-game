import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import type { ApiErrorResponse, SessionState } from '../src/game/types.js';
import { serverConfig } from './config.js';
import { createGameStore, GameStore, NicknameTakenError, PackLimitReachedError } from './store.js';

function apiError(error: string, message: string, extra?: Partial<ApiErrorResponse>) {
  return {
    error,
    message,
    ...extra,
  } satisfies ApiErrorResponse;
}

function normalizeNickname(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().replace(/\s+/gu, ' ');

  if (trimmed.length < 2 || trimmed.length > 32) {
    return null;
  }

  return trimmed;
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

  if (!origin || serverConfig.allowedOrigins.has(origin)) {
    return;
  }

  reply.code(403).send(apiError('FORBIDDEN_ORIGIN', 'Недопустимый origin для мутации данных.'));
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

async function readSessionState(store: GameStore, request: FastifyRequest): Promise<SessionState> {
  const token = request.cookies[serverConfig.sessionCookieName];
  const user = store.getUserFromSessionToken(token);

  if (!user) {
    return {
      authenticated: false,
      authConfigured: serverConfig.googleAuthConfigured,
      user: null,
      game: null,
    };
  }

  return {
    authenticated: true,
    authConfigured: serverConfig.googleAuthConfigured,
    user,
    game: store.getPlayerSnapshot(user.id),
  };
}

export async function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });
  const store = createGameStore(serverConfig);
  const oauthClient = serverConfig.googleAuthConfigured
    ? new OAuth2Client(
        serverConfig.googleClientId,
        serverConfig.googleClientSecret,
        serverConfig.googleCallbackUrl,
      )
    : null;

  await app.register(cookie);

  app.addHook('onClose', async () => {
    store.close();
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

  app.get('/api/auth/google/start', async (_request, reply) => {
    if (!oauthClient) {
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

    const authUrl = oauthClient.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['openid', 'email', 'profile'],
      state,
    });

    reply.redirect(authUrl);
  });

  app.get('/api/auth/google/callback', async (request, reply) => {
    if (!oauthClient) {
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

    const { tokens } = await oauthClient.getToken(code);

    if (!tokens.id_token) {
      reply.code(400).send(apiError('MISSING_ID_TOKEN', 'Google не вернул id_token.'));
      return;
    }

    const ticket = await oauthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: serverConfig.googleClientId,
    });

    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
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
        .send(apiError('INVALID_NICKNAME', 'Ник должен быть длиной от 2 до 32 символов.'));
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

  app.post('/api/packs/open', async (request, reply) => {
    assertAllowedOrigin(request, reply);

    if (reply.sent) {
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

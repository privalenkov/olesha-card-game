import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { cardPool } from '../shared/cardCatalog.js';
import { CARDS_PER_PACK, rarityWeights } from '../src/game/config.js';
import type {
  AuthUser,
  CardDefinition,
  CardFinish,
  OpenPackResult,
  OwnedCard,
  Rarity,
  RemoteGameState,
} from '../src/game/types.js';
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
  avatarUrl: string | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

function isUniqueConstraintError(error: unknown): error is Error & { code?: string } {
  return error instanceof Error && 'code' in error && (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';
}

function normalizeNicknameKey(nickname: string): string {
  return nickname.trim().replace(/\s+/gu, ' ').normalize('NFKC').toLocaleLowerCase();
}

function ensureDirectory(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function hashToken(value: string, secret: string): string {
  return createHash('sha256').update(`${secret}:${value}`).digest('hex');
}

function weightedPick(weights: Array<[Rarity, number]>): Rarity {
  const total = weights.reduce((sum, [, value]) => sum + value, 0);
  let roll = Math.random() * total;

  for (const [rarity, weight] of weights) {
    roll -= weight;
    if (roll <= 0) {
      return rarity;
    }
  }

  return 'common';
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
    const card = pickFromPool(byRarity[rarity], excludedIds);

    pulled.push({
      ...card,
      instanceId: randomUUID(),
      acquiredAt: timestamp,
      packNumber,
      finish: getFinish(card.rarity),
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
      is_active integer not null default 1,
      updated_at text not null
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

  const existingNicknames = db
    .prepare(
      `
        select id, nickname
        from users
        where nickname is not null and trim(nickname) <> ''
        order by datetime(created_at) asc, id asc
      `,
    )
    .all() as Array<{ id: string; nickname: string }>;
  const updateNormalizedNickname = db.prepare(`
    update users
    set nickname = ?, nickname_normalized = ?
    where id = ?
  `);
  const normalizeExistingNicknames = db.transaction(() => {
    const seen = new Set<string>();

    for (const row of existingNicknames) {
      const normalized = normalizeNicknameKey(row.nickname);

      if (!normalized) {
        updateNormalizedNickname.run(null, null, row.id);
        continue;
      }

      if (seen.has(normalized)) {
        updateNormalizedNickname.run(null, null, row.id);
        continue;
      }

      seen.add(normalized);
      updateNormalizedNickname.run(row.nickname.trim().replace(/\s+/gu, ' '), normalized, row.id);
    }
  });

  normalizeExistingNicknames();
  db.exec('drop index if exists idx_users_nickname_unique');
  db.exec(`
    create unique index if not exists idx_users_nickname_normalized_unique
    on users(nickname_normalized)
    where nickname_normalized is not null
  `);

  const upsertCardDefinition = db.prepare(`
    insert into card_definitions (
      id, title, url_image, rarity, description, power, cringe, fame, rarity_score, humor, is_active, updated_at
    ) values (
      @id, @title, @url_image, @rarity, @description, @power, @cringe, @fame, @rarity_score, @humor, 1, @updated_at
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
      is_active = 1,
      updated_at = excluded.updated_at
  `);

  const seedCatalog = db.transaction(() => {
    db.prepare('update card_definitions set is_active = 0').run();

    const updatedAt = new Date().toISOString();
    for (const card of cardPool) {
      upsertCardDefinition.run({
        id: card.id,
        title: card.title,
        url_image: card.urlImage,
        rarity: card.rarity,
        description: card.description,
        power: card.stats.power,
        cringe: card.stats.cringe,
        fame: card.stats.fame,
        rarity_score: card.stats.rarityScore,
        humor: card.stats.humor,
        updated_at: updatedAt,
      });
    }
  });

  seedCatalog();
  db.prepare('delete from sessions where expires_at <= ?').run(new Date().toISOString());

  const upsertGoogleUser = db.prepare(`
    insert into users (
      id, google_sub, email, name, nickname, nickname_normalized, avatar_url, created_at, updated_at
    )
    values (@id, @google_sub, @email, @name, null, null, @avatar_url, @created_at, @updated_at)
    on conflict(google_sub) do update set
      email = excluded.email,
      name = excluded.name,
      avatar_url = excluded.avatar_url,
      updated_at = excluded.updated_at
    returning id, email, coalesce(nickname, name) as name, avatar_url as avatarUrl
  `);

  const insertSession = db.prepare(`
    insert into sessions (id, token_hash, user_id, expires_at, created_at, last_seen_at)
    values (?, ?, ?, ?, ?, ?)
  `);

  const selectSessionUser = db.prepare(`
    select users.id, users.email, coalesce(users.nickname, users.name) as name, users.avatar_url as avatarUrl
    from sessions
    join users on users.id = sessions.user_id
    where sessions.token_hash = ? and sessions.expires_at > ?
  `);
  const updateNicknameStatement = db.prepare(`
    update users
    set nickname = ?, nickname_normalized = ?, updated_at = ?
    where id = ?
    returning id, email, coalesce(nickname, name) as name, avatar_url as avatarUrl
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
  const selectActiveCatalog = db.prepare(`
    select id, title, url_image, rarity, description, power, cringe, fame, rarity_score, humor
    from card_definitions
    where is_active = 1
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

  function upsertUserFromGoogle(profile: GoogleProfile): AuthUser {
    const now = new Date().toISOString();
    return upsertGoogleUser.get({
      id: randomUUID(),
      google_sub: profile.sub,
      email: profile.email,
      name: profile.name,
      avatar_url: profile.avatarUrl,
      created_at: now,
      updated_at: now,
    }) as AuthUser;
  }

  function updateNickname(userId: string, nickname: string): AuthUser {
    const trimmedNickname = nickname.trim().replace(/\s+/gu, ' ');
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
    openPackForUser,
    updateNickname,
  };
}

export type GameStore = ReturnType<typeof createGameStore>;

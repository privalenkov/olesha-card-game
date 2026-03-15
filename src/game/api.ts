import type {
  ApiErrorResponse,
  OpenPackResult,
  RemoteGameState,
  SessionState,
  UpdateNicknameResult,
} from './types';

export const EMPTY_REMOTE_GAME_STATE: RemoteGameState = {
  collection: [],
  packsOpenedToday: 0,
  totalPacksOpened: 0,
  remainingPacks: 0,
  dailyPackLimit: 1,
  nextPackResetAt: '',
  serverNow: '',
};

export class ApiError extends Error {
  constructor(
    readonly error: string,
    message: string,
    readonly nextPackResetAt?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function apiRequest<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.method && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    let payload: ApiErrorResponse | null = null;

    try {
      payload = await readJson<ApiErrorResponse>(response);
    } catch {
      payload = null;
    }

    throw new ApiError(
      payload?.error ?? 'REQUEST_FAILED',
      payload?.message ?? 'Не удалось выполнить запрос к серверу.',
      payload?.nextPackResetAt,
    );
  }

  return readJson<T>(response);
}

export function fetchSessionState() {
  return apiRequest<SessionState>('/api/me');
}

export function requestPackOpen() {
  return apiRequest<OpenPackResult>('/api/packs/open', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function requestLogout() {
  return apiRequest<{ ok: true }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function requestNicknameUpdate(name: string) {
  return apiRequest<UpdateNicknameResult>('/api/profile/nickname', {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function formatResetCountdown(nextPackResetAt: string, now = Date.now()): string {
  if (!nextPackResetAt) {
    return '--:--';
  }

  const target = new Date(nextPackResetAt).getTime();

  if (!Number.isFinite(target)) {
    return '--:--';
  }

  const diffMs = Math.max(target - now, 0);
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');

  return `${hours}:${minutes}`;
}

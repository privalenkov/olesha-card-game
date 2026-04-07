import type {
  AdminCatalogResult,
  DeleteAdminCardResult,
  FetchProposalResult,
  NotificationListResult,
  AdminProposalOverridePayload,
  AdminUserRecord,
  AdminUserListResult,
  ApiErrorResponse,
  CollectionFilter,
  OpenPackResult,
  ProposalEditorPayload,
  ProposalListResult,
  PublicShowcaseResult,
  RemoteGameState,
  SessionState,
  StartProposalResult,
  UpdateNicknameResult,
  UpdateProposalResult,
  UploadCardArtResult,
} from './types';
import { API_ERROR_PRESETS, getApiErrorTitle } from './apiErrors';

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
    readonly statusCode?: number,
    readonly alreadyNotified = false,
    readonly title?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiErrorEventDetail {
  error: string;
  message: string;
  title: string;
  statusCode?: number;
}

export const API_ERROR_EVENT = 'app:api-error';

async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

function emitApiError(detail: ApiErrorEventDetail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }

  window.dispatchEvent(new CustomEvent<ApiErrorEventDetail>(API_ERROR_EVENT, { detail }));
}

async function apiRequest<T>(
  input: RequestInfo,
  init?: RequestInit,
  options?: { notifyOnError?: boolean },
): Promise<T> {
  const notifyOnError = options?.notifyOnError ?? true;
  let response: Response;

  try {
    response = await fetch(input, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init?.method && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
      ...init,
    });
  } catch {
    const message = API_ERROR_PRESETS.NETWORK_ERROR.message;
    const title = API_ERROR_PRESETS.NETWORK_ERROR.title;

    if (notifyOnError) {
      emitApiError({
        error: API_ERROR_PRESETS.NETWORK_ERROR.code,
        message,
        title,
      });
    }

    throw new ApiError(
      API_ERROR_PRESETS.NETWORK_ERROR.code,
      message,
      undefined,
      undefined,
      notifyOnError,
      title,
    );
  }

  if (!response.ok) {
    let payload: ApiErrorResponse | null = null;

    try {
      payload = await readJson<ApiErrorResponse>(response);
    } catch {
      payload = null;
    }

    const errorCode = payload?.error ?? API_ERROR_PRESETS.REQUEST_FAILED.code;
    const message = payload?.message ?? API_ERROR_PRESETS.REQUEST_FAILED.message;
    const title = getApiErrorTitle({
      error: errorCode,
      title: payload?.title,
      statusCode: response.status,
    });

    if (notifyOnError) {
      emitApiError({
        error: errorCode,
        message,
        title,
        statusCode: response.status,
      });
    }

    throw new ApiError(
      errorCode,
      message,
      payload?.nextPackResetAt,
      response.status,
      notifyOnError,
      title,
    );
  }

  return readJson<T>(response);
}

export function fetchSessionState() {
  return apiRequest<SessionState>('/api/me');
}

export function fetchPublicShowcase(
  playerSlug: string,
  options?: {
    offset?: number;
    limit?: number;
    filter?: CollectionFilter;
  },
) {
  const searchParams = new URLSearchParams();

  if (typeof options?.offset === 'number' && Number.isFinite(options.offset) && options.offset > 0) {
    searchParams.set('offset', String(Math.floor(options.offset)));
  }

  if (typeof options?.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0) {
    searchParams.set('limit', String(Math.floor(options.limit)));
  }

  if (options?.filter) {
    searchParams.set('filter', options.filter);
  }

  const query = searchParams.toString();
  return apiRequest<PublicShowcaseResult>(
    `/api/collections/${encodeURIComponent(playerSlug)}${query ? `?${query}` : ''}`,
  );
}

export function fetchNotifications() {
  return apiRequest<NotificationListResult>('/api/notifications', undefined, {
    notifyOnError: false,
  });
}

export function markNotificationRead(notificationId: string) {
  return apiRequest<{ ok: true }>(`/api/notifications/${notificationId}/read`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, {
    notifyOnError: false,
  });
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

export function requestProposalStart() {
  return apiRequest<StartProposalResult>('/api/card-proposals/start', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function fetchProposal(proposalId: string) {
  return apiRequest<FetchProposalResult>(`/api/card-proposals/${proposalId}`);
}

export function saveProposal(proposalId: string, payload: ProposalEditorPayload) {
  return apiRequest<UpdateProposalResult>(`/api/card-proposals/${proposalId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function submitProposal(proposalId: string) {
  return apiRequest<UpdateProposalResult>(`/api/card-proposals/${proposalId}/submit`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function uploadCardArt(dataUrl: string) {
  return apiRequest<UploadCardArtResult>('/api/uploads/card-art', {
    method: 'POST',
    body: JSON.stringify({ dataUrl }),
  });
}

export function fetchAdminProposals() {
  return apiRequest<ProposalListResult>('/api/admin/card-proposals');
}

export function fetchAdminCatalog() {
  return apiRequest<AdminCatalogResult>('/api/admin/cards');
}

export function fetchAdminUsers() {
  return apiRequest<AdminUserListResult>('/api/admin/users');
}

export function unlockAdminUserPack(userId: string) {
  return apiRequest<{ user: AdminUserRecord }>(`/api/admin/users/${userId}/unlock-pack`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function unlockAdminUserProposal(userId: string) {
  return apiRequest<{ user: AdminUserRecord }>(`/api/admin/users/${userId}/unlock-proposal`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function approveProposal(proposalId: string) {
  return apiRequest<UpdateProposalResult>(`/api/admin/card-proposals/${proposalId}/approve`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function deleteProposal(proposalId: string, reason: string) {
  return apiRequest<UpdateProposalResult>(`/api/admin/card-proposals/${proposalId}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });
}

export function deleteAdminCard(cardId: string) {
  return apiRequest<DeleteAdminCardResult>(`/api/admin/cards/${cardId}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}

export function overrideProposalAsAdmin(
  proposalId: string,
  payload: AdminProposalOverridePayload,
) {
  return apiRequest<UpdateProposalResult>(`/api/admin/card-proposals/${proposalId}/override`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
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

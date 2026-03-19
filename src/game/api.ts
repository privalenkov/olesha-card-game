import type {
  AdminCatalogResult,
  NotificationListResult,
  AdminProposalOverridePayload,
  AdminUserListResult,
  ApiErrorResponse,
  CardProposal,
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

export function fetchPublicShowcase(playerSlug: string) {
  return apiRequest<PublicShowcaseResult>(`/api/collections/${encodeURIComponent(playerSlug)}`);
}

export function fetchNotifications() {
  return apiRequest<NotificationListResult>('/api/notifications');
}

export function markNotificationRead(notificationId: string) {
  return apiRequest<{ ok: true }>(`/api/notifications/${notificationId}/read`, {
    method: 'POST',
    body: JSON.stringify({}),
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
  return apiRequest<{ proposal: CardProposal }>(`/api/card-proposals/${proposalId}`);
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

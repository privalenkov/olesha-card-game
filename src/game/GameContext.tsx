import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  ApiError,
  EMPTY_REMOTE_GAME_STATE,
  fetchNotifications,
  fetchSessionState,
  formatResetCountdown,
  markNotificationRead,
  requestNicknameUpdate,
  requestLogout,
  requestPackOpen,
} from './api';
import type { AppNotification, AuthUser, RemoteGameState, SessionState, OwnedCard } from './types';

interface NotifyPayload {
  kind: AppNotification['kind'];
  title?: string | null;
  message: string;
  proposalId?: string | null;
}

interface GameContextValue {
  status: 'loading' | 'ready';
  state: RemoteGameState;
  authenticated: boolean;
  authConfigured: boolean;
  isAdmin: boolean;
  user: AuthUser | null;
  remainingPacks: number;
  timeUntilReset: string;
  error: string | null;
  notifications: AppNotification[];
  openPack: () => Promise<OwnedCard[] | null>;
  refresh: () => Promise<void>;
  login: () => void;
  logout: () => Promise<void>;
  updateNickname: (name: string) => Promise<boolean>;
  dismissNotification: (notificationId: string) => Promise<void>;
  notify: (payload: NotifyPayload) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

const emptySessionState: SessionState = {
  authenticated: false,
  authConfigured: false,
  isAdmin: false,
  user: null,
  game: null,
};

const NOTIFICATION_AUTO_DISMISS_MS = 5000;
const NOTIFICATION_EXIT_MS = 280;

export function GameProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [session, setSession] = useState<SessionState>(emptySessionState);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const activeNotificationIdsRef = useRef(new Set<string>());
  const remoteNotificationIdsRef = useRef(new Set<string>());
  const notificationTimersRef = useRef(new Map<string, number>());
  const notificationRemovalTimersRef = useRef(new Map<string, number>());

  const applySession = useCallback((nextSession: SessionState) => {
    setSession(nextSession);
    setStatus('ready');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const nextSession = await fetchSessionState();
      applySession(nextSession);
      setError(null);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось загрузить состояние с сервера.';
      setError(message);
      setStatus('ready');
    }
  }, [applySession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!error) {
      return;
    }

    const timer = window.setTimeout(() => {
      setError((current) => (current === error ? null : current));
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [error]);

  const clearNotificationTimer = useCallback((notificationId: string) => {
    const timer = notificationTimersRef.current.get(notificationId);

    if (timer) {
      window.clearTimeout(timer);
      notificationTimersRef.current.delete(notificationId);
    }
  }, []);

  const clearNotificationRemovalTimer = useCallback((notificationId: string) => {
    const timer = notificationRemovalTimersRef.current.get(notificationId);

    if (timer) {
      window.clearTimeout(timer);
      notificationRemovalTimersRef.current.delete(notificationId);
    }
  }, []);

  const finalizeNotificationDismiss = useCallback(
    async (notificationId: string) => {
      clearNotificationTimer(notificationId);
      clearNotificationRemovalTimer(notificationId);
      activeNotificationIdsRef.current.delete(notificationId);
      const isRemoteNotification = remoteNotificationIdsRef.current.has(notificationId);
      remoteNotificationIdsRef.current.delete(notificationId);
      setNotifications((current) => current.filter((item) => item.id !== notificationId));

      if (!isRemoteNotification) {
        return;
      }

      try {
        await markNotificationRead(notificationId);
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.error === 'UNAUTHORIZED') {
          await refresh();
        }
      }
    },
    [clearNotificationRemovalTimer, clearNotificationTimer, refresh],
  );

  const dismissNotification = useCallback(
    async (notificationId: string) => {
      clearNotificationTimer(notificationId);
      let shouldScheduleRemoval = false;

      setNotifications((current) =>
        current.map((item) => {
          if (item.id !== notificationId) {
            return item;
          }

          if (item.state === 'leaving') {
            return item;
          }

          shouldScheduleRemoval = true;
          return {
            ...item,
            state: 'leaving',
          };
        }),
      );

      if (!shouldScheduleRemoval) {
        return;
      }

      clearNotificationRemovalTimer(notificationId);
      const timer = window.setTimeout(() => {
        void finalizeNotificationDismiss(notificationId);
      }, NOTIFICATION_EXIT_MS);
      notificationRemovalTimersRef.current.set(notificationId, timer);
    },
    [clearNotificationRemovalTimer, clearNotificationTimer, finalizeNotificationDismiss],
  );

  const enqueueNotifications = useCallback(
    (incoming: AppNotification[], source: 'local' | 'remote') => {
      const nextItems = incoming
        .filter((item) => !activeNotificationIdsRef.current.has(item.id))
        .map((item) => ({
          ...item,
          title: item.title?.trim() ? item.title.trim() : null,
          message: item.message.trim(),
          state: 'active' as const,
        }));

      if (nextItems.length === 0) {
        return;
      }

      for (const item of nextItems) {
        activeNotificationIdsRef.current.add(item.id);

        if (source === 'remote') {
          remoteNotificationIdsRef.current.add(item.id);
        }

        const timer = window.setTimeout(() => {
          void dismissNotification(item.id);
        }, NOTIFICATION_AUTO_DISMISS_MS);
        notificationTimersRef.current.set(item.id, timer);
      }

      setNotifications((current) =>
        [...current, ...nextItems].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      );
    },
    [dismissNotification],
  );

  const notify = useCallback(
    (payload: NotifyPayload) => {
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `local-${crypto.randomUUID()}`
          : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      enqueueNotifications(
        [
          {
            id,
            kind: payload.kind,
            title: payload.title?.trim() ? payload.title.trim() : null,
            message: payload.message,
            proposalId: payload.proposalId ?? null,
            cardInstanceId: null,
            createdAt: new Date().toISOString(),
          },
        ],
        'local',
      );
    },
    [enqueueNotifications],
  );

  const clearAllNotifications = useCallback(() => {
    notificationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    notificationTimersRef.current.clear();
    notificationRemovalTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    notificationRemovalTimersRef.current.clear();
    activeNotificationIdsRef.current.clear();
    remoteNotificationIdsRef.current.clear();
    setNotifications([]);
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!session.authenticated || !session.user) {
      return;
    }

    try {
      const response = await fetchNotifications();
      const hasNewRemoteNotifications = response.notifications.some(
        (item) => !activeNotificationIdsRef.current.has(item.id),
      );
      enqueueNotifications(response.notifications, 'remote');

      if (hasNewRemoteNotifications) {
        await refresh();
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.error === 'UNAUTHORIZED') {
        await refresh();
      }
    }
  }, [enqueueNotifications, refresh, session.authenticated, session.user]);

  useEffect(() => {
    if (!session.authenticated || !session.user) {
      clearAllNotifications();
      return;
    }

    void loadNotifications();

    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 30000);

    return () => window.clearInterval(timer);
  }, [clearAllNotifications, loadNotifications, session.authenticated, session.user]);

  useEffect(
    () => () => {
      notificationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      notificationTimersRef.current.clear();
      notificationRemovalTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      notificationRemovalTimersRef.current.clear();
    },
    [],
  );

  const login = useCallback(() => {
    window.location.assign('/api/auth/google/start');
  }, []);

  const logout = useCallback(async () => {
    try {
      await requestLogout();
    } catch {
      // Ignore logout errors and clear local session anyway.
    }

    setSession((current) => ({
      authenticated: false,
      authConfigured: current.authConfigured,
      isAdmin: false,
      user: null,
      game: null,
    }));
    clearAllNotifications();
  }, [clearAllNotifications]);

  const updateNickname = useCallback(
    async (name: string) => {
      if (!session.authenticated || !session.user) {
        setError('сначала авторизируйтесь');
        return false;
      }

      try {
        const result = await requestNicknameUpdate(name);

        setSession((current) => ({
          ...current,
          user: result.user,
        }));
        setError(null);

        return true;
      } catch (requestError) {
        if (requestError instanceof ApiError) {
          setError(requestError.message);

          if (requestError.error === 'UNAUTHORIZED') {
            await refresh();
          }

          return false;
        }

        setError('Не удалось изменить ник.');
        return false;
      }
    },
    [refresh, session.authenticated, session.user],
  );

  const openPack = useCallback(async () => {
    if (!session.authenticated || !session.user) {
      setError('авторизируйтесь для открытия пака');
      return null;
    }

    try {
      const result = await requestPackOpen();

      setSession({
        authenticated: true,
        authConfigured: session.authConfigured,
        isAdmin: session.isAdmin,
        user: session.user,
        game: result.game,
      });
      setError(null);

      return result.pack;
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setError(requestError.message);

        if (requestError.error === 'UNAUTHORIZED') {
          await refresh();
          return null;
        }

        if (requestError.error === 'PACK_LIMIT_REACHED') {
          setSession((current) => {
            if (!current.game) {
              return current;
            }

            return {
              ...current,
              game: {
                ...current.game,
                packsOpenedToday: current.game.dailyPackLimit,
                remainingPacks: 0,
                nextPackResetAt:
                  requestError.nextPackResetAt ?? current.game.nextPackResetAt,
              },
            };
          });
        }

        return null;
      }

      setError('Не удалось открыть пак. Попробуй еще раз.');
      return null;
    }
  }, [login, refresh, session]);

  const state = session.game ?? EMPTY_REMOTE_GAME_STATE;
  const timeUntilReset = useMemo(
    () => formatResetCountdown(state.nextPackResetAt, now),
    [now, state.nextPackResetAt],
  );

  const value = useMemo<GameContextValue>(
    () => ({
      status,
      state,
      authenticated: session.authenticated,
      authConfigured: session.authConfigured,
      isAdmin: session.isAdmin,
      user: session.user,
      remainingPacks: state.remainingPacks,
      timeUntilReset,
      error,
      notifications,
      openPack,
      refresh,
      login,
      logout,
      updateNickname,
      dismissNotification,
      notify,
    }),
    [
      dismissNotification,
      error,
      login,
      logout,
      notifications,
      notify,
      openPack,
      refresh,
      session,
      state,
      status,
      timeUntilReset,
      updateNickname,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);

  if (!context) {
    throw new Error('useGame must be used inside GameProvider');
  }

  return context;
}

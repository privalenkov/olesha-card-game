import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  ApiError,
  EMPTY_REMOTE_GAME_STATE,
  fetchSessionState,
  formatResetCountdown,
  requestNicknameUpdate,
  requestLogout,
  requestPackOpen,
} from './api';
import type { AuthUser, RemoteGameState, SessionState, OwnedCard } from './types';

interface GameContextValue {
  status: 'loading' | 'ready';
  state: RemoteGameState;
  authenticated: boolean;
  authConfigured: boolean;
  user: AuthUser | null;
  remainingPacks: number;
  timeUntilReset: string;
  error: string | null;
  openPack: () => Promise<OwnedCard[] | null>;
  refresh: () => Promise<void>;
  login: () => void;
  logout: () => Promise<void>;
  updateNickname: (name: string) => Promise<boolean>;
}

const GameContext = createContext<GameContextValue | null>(null);

const emptySessionState: SessionState = {
  authenticated: false,
  authConfigured: false,
  user: null,
  game: null,
};

export function GameProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [session, setSession] = useState<SessionState>(emptySessionState);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

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
      user: null,
      game: null,
    }));
  }, []);

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
      user: session.user,
      remainingPacks: state.remainingPacks,
      timeUntilReset,
      error,
      openPack,
      refresh,
      login,
      logout,
      updateNickname,
    }),
    [
      error,
      login,
      logout,
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

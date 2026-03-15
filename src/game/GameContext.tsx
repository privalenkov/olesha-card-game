import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { PACKS_PER_DAY } from './config';
import { rollPack } from './packLogic';
import {
  createInitialState,
  getTimeUntilReset,
  normalizeState,
  persistState,
  readState,
} from './storage';
import type { GameState, OwnedCard } from './types';

interface GameContextValue {
  state: GameState;
  remainingPacks: number;
  timeUntilReset: string;
  openPack: () => OwnedCard[] | null;
  resetProgress: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<GameState>(() => readState());
  const [timeUntilReset, setTimeUntilReset] = useState(() => getTimeUntilReset());

  const liveState = normalizeState(state);

  useEffect(() => {
    persistState(state);
  }, [state]);

  useEffect(() => {
    if (liveState !== state) {
      setState(liveState);
    }
  }, [liveState, state]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setState((current) => readState());
      setTimeUntilReset(getTimeUntilReset());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  const remainingPacks = Math.max(PACKS_PER_DAY - liveState.packsOpenedToday, 0);

  const value = useMemo<GameContextValue>(
    () => ({
      state: liveState,
      remainingPacks,
      timeUntilReset,
      openPack: () => {
        if (liveState.packsOpenedToday >= PACKS_PER_DAY) {
          return null;
        }

        const nextPackNumber = liveState.totalPacksOpened + 1;
        const pack = rollPack(nextPackNumber);

        setState((current) => {
          const normalized = normalizeState(current);

          return {
            ...normalized,
            packsOpenedToday: normalized.packsOpenedToday + 1,
            totalPacksOpened: normalized.totalPacksOpened + 1,
            collection: [...pack, ...normalized.collection],
          };
        });

        return pack;
      },
      resetProgress: () => {
        setState(createInitialState());
      },
    }),
    [liveState, remainingPacks, timeUntilReset],
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

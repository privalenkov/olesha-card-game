import { STORAGE_KEY } from './config';
import type { GameState } from './types';

export function getTodayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createInitialState(): GameState {
  return {
    version: 1,
    lastActiveDate: getTodayKey(),
    packsOpenedToday: 0,
    totalPacksOpened: 0,
    collection: [],
  };
}

export function normalizeState(rawState: GameState): GameState {
  const today = getTodayKey();

  if (rawState.lastActiveDate !== today) {
    return {
      ...rawState,
      lastActiveDate: today,
      packsOpenedToday: 0,
    };
  }

  return rawState;
}

export function readState(): GameState {
  if (typeof window === 'undefined') {
    return createInitialState();
  }

  const saved = window.localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return createInitialState();
  }

  try {
    const parsed = JSON.parse(saved) as GameState;

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray(parsed.collection)
    ) {
      return createInitialState();
    }

    return normalizeState(parsed);
  } catch {
    return createInitialState();
  }
}

export function persistState(state: GameState): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getTimeUntilReset(now = new Date()): string {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);

  const diffMs = Math.max(midnight.getTime() - now.getTime(), 0);
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

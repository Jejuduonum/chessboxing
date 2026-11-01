import { createContext, useContext } from 'react';

export type Tab = 'home' | 'chess' | 'weight' | 'log';

export interface SessionPrefill {
  category: 'chess' | 'fitness';
  type: string;
  durationMin?: number;
  intensity?: number;
  notes?: string;
}

export interface Nav {
  tab: Tab;
  goTab: (t: Tab) => void;
  openSettings: () => void;
  /** Quick-add sheet (Weight / Session switch). Saving returns to Home. */
  openQuickAdd: () => void;
  /** Weight sheet for a given day (defaults to today). */
  openWeight: (date?: string) => void;
  /** Full-screen session form; pass an id to edit. */
  openSession: (id?: number, prefill?: SessionPrefill) => void;
  /** Full-screen game review for a Lichess game id (or a pasted PGN's local id). */
  openReview: (gameId: string) => void;
}

export const NavCtx = createContext<Nav | null>(null);

export function useNav(): Nav {
  const v = useContext(NavCtx);
  if (!v) throw new Error('useNav outside NavCtx');
  return v;
}

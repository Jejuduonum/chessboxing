import Dexie, { type Table } from 'dexie';
import type { GameReview } from './lib/review';
import type { LichessGame } from './lib/games';

/** A finished review plus the game it belongs to, so it reopens offline. */
export type StoredReview = GameReview & { username: string; game: LichessGame; updatedAt?: number; dirty?: 0 | 1 };

export type TimeControl = 'rapid' | 'blitz' | 'classical' | 'puzzle';
export type Units = 'kg' | 'stlb';
export type Theme = 'dark' | 'light';
export type Category = 'chess' | 'fitness';
export type GameResult = 'won' | 'draw' | 'lost';

export interface Settings {
  id: 'me';
  lichessUsername: string;
  primaryTimeControl: TimeControl;
  startRating: number;
  targetRating: number;
  startDate: string; // YYYY-MM-DD
  targetDate: string;
  startWeightKg: number;
  targetWeightKg: number;
  units: Units;
  theme: Theme;
  onboarded: boolean;
  /** Last local change (ms) and "needs upload" flag — used by cloud sync, set automatically. */
  updatedAt?: number;
  dirty?: 0 | 1;
}

export interface WeightEntry {
  date: string; // unique — one entry per day
  weightKg: number;
  waistCm?: number;
  updatedAt?: number;
  dirty?: 0 | 1;
}

export interface Session {
  id?: number;
  /** Stable id shared across devices (cloud sync), set automatically. */
  uid?: string;
  updatedAt?: number;
  dirty?: 0 | 1;
  date: string;
  category: Category;
  type: string;
  durationMin: number;
  intensity: number; // 1–5
  notes?: string;
  result?: GameResult;
}

export interface RatingCache {
  timeControl: TimeControl;
  points: [string, number][]; // [date, rating]
  fetchedAt: number;
}

class TrackerDB extends Dexie {
  settings!: Table<Settings, string>;
  weights!: Table<WeightEntry, string>;
  sessions!: Table<Session, number>;
  ratingCache!: Table<RatingCache, string>;
  gameReviews!: Table<StoredReview, string>;

  constructor() {
    super('chess-boxing-tracker');
    this.version(1).stores({
      settings: 'id',
      weights: 'date',
      sessions: '++id, date, category',
      ratingCache: 'timeControl',
    });
    this.version(2).stores({ gameReviews: 'gameId, username, analysedAt' });
    // v3: cloud sync — sessions get a device-independent uid; every record gets updatedAt.
    this.version(3)
      .stores({ sessions: '++id, date, category, uid' })
      .upgrade(async (tx) => {
        const now = Date.now();
        await tx.table('sessions').toCollection().modify((x: Session) => { x.uid ??= crypto.randomUUID(); x.updatedAt ??= now; x.dirty = 1; });
        await tx.table('weights').toCollection().modify((x: WeightEntry) => { x.updatedAt ??= now; x.dirty = 1; });
        await tx.table('settings').toCollection().modify((x: Settings) => { x.updatedAt ??= now; x.dirty = 1; });
        await tx.table('gameReviews').toCollection().modify((x: StoredReview) => { x.updatedAt ??= now; x.dirty = 1; });
      });
  }
}

export const db = new TrackerDB();

export const TIME_CONTROLS: TimeControl[] = ['rapid', 'blitz', 'classical', 'puzzle'];
export const TC_LABEL: Record<TimeControl, string> = {
  rapid: 'Rapid',
  blitz: 'Blitz',
  classical: 'Classical',
  puzzle: 'Puzzles',
};

export interface SessionType {
  id: string;
  label: string;
  chip: string;
  code: string;
}

export const FITNESS_TYPES: SessionType[] = [
  { id: 'boxing', label: 'Boxing', chip: 'Boxing', code: 'BX' },
  { id: 'cardio', label: 'Cardio', chip: 'Cardio', code: 'CA' },
  { id: 'strength', label: 'Strength', chip: 'Strength', code: 'ST' },
  { id: 'other', label: 'Other training', chip: 'Other', code: 'OT' },
];

export const CHESS_TYPES: SessionType[] = [
  { id: 'tactics', label: 'Tactics · puzzles', chip: 'Tactics', code: 'TC' },
  { id: 'rated', label: 'Rated game', chip: 'Rated game', code: 'RG' },
  { id: 'review', label: 'Game review', chip: 'Game review', code: 'GR' },
  { id: 'openings', label: 'Openings', chip: 'Openings', code: 'OP' },
  { id: 'endgames', label: 'Endgames', chip: 'Endgames', code: 'EG' },
];

export function sessionType(category: Category, id: string): SessionType {
  const list = category === 'chess' ? CHESS_TYPES : FITNESS_TYPES;
  return list.find((t) => t.id === id) ?? { id, label: id, chip: id, code: id.slice(0, 2).toUpperCase() };
}

export const INTENSITY_LABEL = ['', 'easy', 'light', 'moderate', 'hard', 'all-out'];

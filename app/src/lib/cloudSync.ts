/**
 * Offline-first cloud sync between the on-device database (Dexie) and Supabase.
 *
 * - Every local write is stamped with updatedAt and marked dirty by Dexie hooks; deletes go to a
 *   small outbox. Rows written by a pull are never marked dirty, so they aren't echoed back.
 * - push(): uploads dirty rows, then the outbox (as soft deletes), then clears the dirty marks.
 * - pull(): downloads rows the server accepted since the last pull (synced_at cursor).
 * - Conflicts: last write wins on updatedAt, enforced on both sides (the server ignores
 *   older writes; a pull never overwrites a newer local row).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, type Session, type Settings, type StoredReview, type WeightEntry } from '../db';

let applyingRemote = false;
let onLocalChange: () => void = () => {};

type SyncedTable = 'weights' | 'sessions' | 'gameReviews';
interface PendingDelete { table: SyncedTable; key: string; at: number }

const OUTBOX = 'cbt-sync-deletes';
const readOutbox = (): PendingDelete[] => { try { return JSON.parse(localStorage.getItem(OUTBOX) ?? '[]'); } catch { return []; } };
const writeOutbox = (v: PendingDelete[]) => localStorage.setItem(OUTBOX, JSON.stringify(v));
function recordDelete(table: SyncedTable, key: string | undefined) {
  if (!key) return;
  writeOutbox([...readOutbox().filter((d) => !(d.table === table && d.key === key)), { table, key, at: Date.now() }]);
}

/* ---------------- Hooks: stamp local changes ---------------- */
let hooksInstalled = false;
export function installSyncHooks(changed: () => void) {
  onLocalChange = changed;
  if (hooksInstalled) return;
  hooksInstalled = true;

  const stamp = (name: 'settings' | SyncedTable) => {
    const table = db.table(name);
    table.hook('creating', (_pk, obj: { updatedAt?: number; uid?: string; dirty?: 0 | 1 }) => {
      if (applyingRemote) return;
      obj.updatedAt = Date.now();
      obj.dirty = 1;
      if (name === 'sessions' && !obj.uid) obj.uid = crypto.randomUUID();
      queueMicrotask(onLocalChange);
    });
    table.hook('updating', () => {
      if (applyingRemote) return undefined;
      queueMicrotask(onLocalChange);
      return { updatedAt: Date.now(), dirty: 1 };
    });
    if (name !== 'settings') {
      table.hook('deleting', (pk, obj: { uid?: string }) => {
        if (applyingRemote) return;
        recordDelete(name as SyncedTable, name === 'sessions' ? obj?.uid : String(pk));
        queueMicrotask(onLocalChange);
      });
    }
  };
  stamp('settings');
  stamp('weights');
  stamp('sessions');
  stamp('gameReviews');
}

/* ---------------- Cursors (per user, per device) ---------------- */
interface Cursor { lastPullAt: string }
const cursorKey = (uid: string) => `cbt-sync-cursor:${uid}`;
const readCursor = (uid: string): Cursor => {
  try { return { lastPullAt: '1970-01-01T00:00:00Z', ...JSON.parse(localStorage.getItem(cursorKey(uid)) ?? '{}') }; }
  catch { return { lastPullAt: '1970-01-01T00:00:00Z' }; }
};
const writeCursor = (uid: string, c: Cursor) => localStorage.setItem(cursorKey(uid), JSON.stringify(c));
export const hasSyncedBefore = (uid: string) => localStorage.getItem(cursorKey(uid)) !== null;

/* ---------------- Mapping ---------------- */
const iso = (ms?: number) => new Date(ms ?? Date.now()).toISOString();
const ms = (s: string) => new Date(s).getTime();

const settingsToRow = (s: Settings, user_id: string) => ({
  user_id,
  lichess_username: s.lichessUsername ?? '',
  primary_time_control: s.primaryTimeControl,
  start_rating: s.startRating, target_rating: s.targetRating,
  start_date: s.startDate, target_date: s.targetDate,
  start_weight_kg: s.startWeightKg, target_weight_kg: s.targetWeightKg,
  units: s.units, theme: s.theme, onboarded: s.onboarded,
  updated_at: iso(s.updatedAt),
});
interface SettingsRow { lichess_username: string | null; primary_time_control: Settings['primaryTimeControl']; start_rating: number | null; target_rating: number | null; start_date: string | null; target_date: string | null; start_weight_kg: number | null; target_weight_kg: number | null; units: Settings['units']; theme: Settings['theme']; onboarded: boolean; updated_at: string; synced_at: string }
const rowToSettings = (r: SettingsRow): Settings | null => {
  if (!r.onboarded || r.start_rating == null || r.target_rating == null || !r.start_date || !r.target_date || r.start_weight_kg == null || r.target_weight_kg == null) return null;
  return {
    id: 'me', lichessUsername: r.lichess_username ?? '', primaryTimeControl: r.primary_time_control,
    startRating: r.start_rating, targetRating: r.target_rating, startDate: r.start_date, targetDate: r.target_date,
    startWeightKg: Number(r.start_weight_kg), targetWeightKg: Number(r.target_weight_kg),
    units: r.units, theme: r.theme, onboarded: true, updatedAt: ms(r.updated_at),
  };
};

const weightToRow = (w: WeightEntry, user_id: string) => ({
  user_id, entry_date: w.date, weight_kg: w.weightKg, waist_cm: w.waistCm ?? null, updated_at: iso(w.updatedAt), deleted_at: null,
});
interface WeightRow { entry_date: string; weight_kg: number; waist_cm: number | null; updated_at: string; deleted_at: string | null; synced_at: string }

const sessionToRow = (x: Session, user_id: string) => ({
  id: x.uid, user_id, session_date: x.date, category: x.category, type: x.type, duration_min: x.durationMin,
  intensity: x.intensity, notes: x.notes ?? null, result: x.result ?? null, updated_at: iso(x.updatedAt), deleted_at: null,
});
interface SessionRow { id: string; session_date: string; category: Session['category']; type: string; duration_min: number; intensity: number; notes: string | null; result: Session['result'] | null; updated_at: string; deleted_at: string | null; synced_at: string }

const reviewToRow = (r: StoredReview, user_id: string) => {
  const { updatedAt, dirty: _dirty, ...data } = r;
  return { user_id, game_id: r.gameId, data, updated_at: iso(updatedAt), deleted_at: null };
};
interface ReviewRow { game_id: string; data: StoredReview; updated_at: string; deleted_at: string | null; synced_at: string }

/* ---------------- Push ---------------- */
async function check<T extends { error: { message: string } | null }>(p: PromiseLike<T>): Promise<T> {
  const res = await p;
  if (res.error) throw new Error(res.error.message);
  return res;
}

/** Clear the dirty mark on rows we just uploaded, unless they changed again meanwhile. */
async function markClean(name: 'settings' | SyncedTable, items: { key: string | number; updatedAt?: number }[]) {
  if (!items.length) return;
  const table = db.table(name);
  applyingRemote = true;
  try {
    await db.transaction('rw', table, async () => {
      for (const it of items) {
        const cur = await table.get(it.key);
        if (cur && cur.updatedAt === it.updatedAt) await table.update(it.key, { dirty: 0 });
      }
    });
  } finally {
    applyingRemote = false;
  }
}

export async function push(sb: SupabaseClient, userId: string) {
  const settings = await db.settings.get('me');
  if (settings?.onboarded && settings.dirty) {
    await check(sb.from('user_settings').upsert(settingsToRow(settings, userId), { onConflict: 'user_id' }));
    await markClean('settings', [{ key: 'me', updatedAt: settings.updatedAt }]);
  }
  const weights = (await db.weights.toArray()).filter((w) => w.dirty);
  for (let i = 0; i < weights.length; i += 500) {
    const batch = weights.slice(i, i + 500);
    await check(sb.from('weight_entries').upsert(batch.map((w) => weightToRow(w, userId)), { onConflict: 'user_id,entry_date' }));
    await markClean('weights', batch.map((w) => ({ key: w.date, updatedAt: w.updatedAt })));
  }
  const sessions = (await db.sessions.toArray()).filter((x) => x.dirty && x.uid);
  for (let i = 0; i < sessions.length; i += 500) {
    const batch = sessions.slice(i, i + 500);
    await check(sb.from('sessions').upsert(batch.map((x) => sessionToRow(x, userId)), { onConflict: 'id' }));
    await markClean('sessions', batch.map((x) => ({ key: x.id!, updatedAt: x.updatedAt })));
  }
  const reviews = (await db.gameReviews.toArray()).filter((r) => r.dirty);
  for (let i = 0; i < reviews.length; i += 20) {
    const batch = reviews.slice(i, i + 20);
    await check(sb.from('game_reviews').upsert(batch.map((r) => reviewToRow(r, userId)), { onConflict: 'user_id,game_id' }));
    await markClean('gameReviews', batch.map((r) => ({ key: r.gameId, updatedAt: r.updatedAt })));
  }

  // Deletes: soft-delete on the server so other devices remove them too.
  const outbox = readOutbox();
  const remaining: PendingDelete[] = [];
  for (const d of outbox) {
    const stamp = { deleted_at: iso(d.at), updated_at: iso(d.at) };
    try {
      if (d.table === 'weights') await check(sb.from('weight_entries').update(stamp).eq('user_id', userId).eq('entry_date', d.key));
      if (d.table === 'sessions') await check(sb.from('sessions').update(stamp).eq('user_id', userId).eq('id', d.key));
      if (d.table === 'gameReviews') await check(sb.from('game_reviews').update(stamp).eq('user_id', userId).eq('game_id', d.key));
    } catch {
      remaining.push(d);
    }
  }
  // Keep any deletes recorded while we were pushing.
  const latest = readOutbox().filter((d) => !outbox.some((o) => o.table === d.table && o.key === d.key && o.at === d.at));
  writeOutbox([...remaining, ...latest]);
}

/* ---------------- Pull ---------------- */
async function pullTable<T extends { synced_at: string }>(sb: SupabaseClient, table: string, since: string): Promise<T[]> {
  const out: T[] = [];
  const page = 500;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from(table).select('*').gt('synced_at', since).order('synced_at', { ascending: true }).range(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) break;
  }
  return out;
}

export async function pull(sb: SupabaseClient, userId: string) {
  const cursor = readCursor(userId);
  const since = cursor.lastPullAt;
  const [settingsRows, weightRows, sessionRows, reviewRows] = await Promise.all([
    pullTable<SettingsRow>(sb, 'user_settings', since),
    pullTable<WeightRow>(sb, 'weight_entries', since),
    pullTable<SessionRow>(sb, 'sessions', since),
    pullTable<ReviewRow>(sb, 'game_reviews', since),
  ]);
  let maxSynced = since;
  const bump = (r: { synced_at: string }) => { if (r.synced_at > maxSynced) maxSynced = r.synced_at; };

  applyingRemote = true;
  try {
    await db.transaction('rw', [db.settings, db.weights, db.sessions, db.gameReviews], async () => {
      for (const r of settingsRows) {
        bump(r);
        const local = await db.settings.get('me');
        const remote = rowToSettings(r);
        if (remote && (!local || (local.updatedAt ?? 0) < remote.updatedAt!)) await db.settings.put(remote);
      }
      for (const r of weightRows) {
        bump(r);
        const local = await db.weights.get(r.entry_date);
        if (local && (local.updatedAt ?? 0) >= ms(r.updated_at)) continue;
        if (r.deleted_at) { if (local) await db.weights.delete(r.entry_date); continue; }
        await db.weights.put({ date: r.entry_date, weightKg: Number(r.weight_kg), ...(r.waist_cm != null ? { waistCm: Number(r.waist_cm) } : {}), updatedAt: ms(r.updated_at) });
      }
      for (const r of sessionRows) {
        bump(r);
        const local = await db.sessions.where('uid').equals(r.id).first();
        if (local && (local.updatedAt ?? 0) >= ms(r.updated_at)) continue;
        if (r.deleted_at) { if (local?.id !== undefined) await db.sessions.delete(local.id); continue; }
        await db.sessions.put({
          ...(local?.id !== undefined ? { id: local.id } : {}),
          uid: r.id, date: r.session_date, category: r.category, type: r.type, durationMin: r.duration_min, intensity: r.intensity,
          ...(r.notes ? { notes: r.notes } : {}), ...(r.result ? { result: r.result } : {}), updatedAt: ms(r.updated_at),
        });
      }
      for (const r of reviewRows) {
        bump(r);
        const local = await db.gameReviews.get(r.game_id);
        if (local && (local.updatedAt ?? 0) >= ms(r.updated_at)) continue;
        if (r.deleted_at) { if (local) await db.gameReviews.delete(r.game_id); continue; }
        await db.gameReviews.put({ ...r.data, gameId: r.game_id, updatedAt: ms(r.updated_at) });
      }
    });
  } finally {
    applyingRemote = false;
  }
  writeCursor(userId, { lastPullAt: maxSynced });
}

/** Push local changes, then pull everyone else's. */
export async function syncNow(sb: SupabaseClient, userId: string) {
  await push(sb, userId);
  await pull(sb, userId);
}

/**
 * Make the cloud copy match this device exactly (used after "Reset all data" and
 * "Import backup"): soft-delete everything remote, then upload everything local.
 */
export async function replaceRemoteWithLocal(sb: SupabaseClient, userId: string) {
  // Stamp later than anything already stored, so a device with a fast clock can't make rows "win" over the reset.
  let newest = Date.now();
  for (const t of ['user_settings', 'weight_entries', 'sessions', 'game_reviews']) {
    const { data } = await sb.from(t).select('updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).range(0, 0);
    const top = (data as { updated_at: string }[] | null)?.[0]?.updated_at;
    if (top) newest = Math.max(newest, ms(top) + 1);
  }
  const now = iso(newest);
  const gone = { deleted_at: now, updated_at: now };
  await check(sb.from('weight_entries').update(gone).eq('user_id', userId).is('deleted_at', null));
  await check(sb.from('sessions').update(gone).eq('user_id', userId).is('deleted_at', null));
  await check(sb.from('game_reviews').update(gone).eq('user_id', userId).is('deleted_at', null));
  writeOutbox([]);
  if (!(await db.settings.get('me'))) {
    await check(sb.from('user_settings').update({ onboarded: false, updated_at: now }).eq('user_id', userId));
  }
  // Re-stamp every local row after the deletes above and mark it for upload.
  const t = newest + 1;
  applyingRemote = true;
  try {
    await db.transaction('rw', [db.settings, db.weights, db.sessions, db.gameReviews], async () => {
      await db.settings.toCollection().modify({ updatedAt: t, dirty: 1 });
      await db.weights.toCollection().modify({ updatedAt: t, dirty: 1 });
      await db.sessions.toCollection().modify((x: Session) => { x.uid ??= crypto.randomUUID(); x.updatedAt = t; x.dirty = 1; });
      await db.gameReviews.toCollection().modify({ updatedAt: t, dirty: 1 });
    });
  } finally {
    applyingRemote = false;
  }
  await push(sb, userId);
}

/** Wipe this device's copy (sign-out / account deletion). Doesn't touch the cloud. */
export async function clearLocal(userId?: string) {
  applyingRemote = true;
  try {
    await db.transaction('rw', [db.settings, db.weights, db.sessions, db.ratingCache, db.gameReviews], async () => {
      await Promise.all([db.settings.clear(), db.weights.clear(), db.sessions.clear(), db.ratingCache.clear(), db.gameReviews.clear()]);
    });
  } finally {
    applyingRemote = false;
  }
  writeOutbox([]);
  if (userId) localStorage.removeItem(cursorKey(userId));
}

export const pendingChanges = async (_userId: string) => {
  const dirty = (rows: { dirty?: 0 | 1 }[]) => rows.some((r) => r.dirty);
  return readOutbox().length > 0 ||
    dirty(await db.weights.toArray()) || dirty(await db.sessions.toArray()) || dirty(await db.gameReviews.toArray()) ||
    dirty((await db.settings.toArray()) as Settings[]);
};

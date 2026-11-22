// Service: what the list shows. Holds every board rule, reads no clock (time is passed in). Depends on Model, and on Manager as a type.
import type { DisplayRow, ExpiredIds, Group, StoredDoc, StoredRow, View } from './model.ts';
import type { Manager } from './manager.ts';

export const MAX_AGE_DAYS = 60;
export const ROW_LIMIT = 25000; // the page database's own limit

export const isPriority = (r: DisplayRow): boolean => r.state !== 'working' && r.unread;

// Age is measured from the earlier of the device clock and the newest row's time, so a clock that runs ahead cannot age rows.
function cutoffFor(rows: DisplayRow[], now: number): number {
  const times = rows.map(r => Date.parse(r.updatedAt)).filter(t => !isNaN(t));
  return Math.min(now, times.length ? Math.max(...times) : now) - MAX_AGE_DAYS * 86400000;
}

export const MAX_DELETES = 200; // per page load: the Service passes in what is left of it

// Board rows to delete: older than MAX_AGE_DAYS by the rule above, at most `budget`. A row with no readable time is never deleted.
export function expired(rows: DisplayRow[], now: number, budget: number = MAX_DELETES): ExpiredIds {
  const cutoff = cutoffFor(rows, now);
  const ids = rows.filter(r => Date.parse(r.updatedAt) < cutoff).slice(0, Math.max(0, budget)).map(r => r.docId);
  return Object.assign(ids, { cleared: 'expired' as const }); // the only place an ExpiredIds is made
}

// One row per thread: its newest. Rows older than MAX_AGE_DAYS are left out. Newest first.
export function newest(rows: DisplayRow[], now: number): DisplayRow[] {
  const cutoff = cutoffFor(rows, now);
  const byThread = new Map<string, DisplayRow>();
  for (const r of rows) {
    const prev = byThread.get(r.thread);
    if (!prev || r.updatedAt > prev.updatedAt) byThread.set(r.thread, r);
  }
  return [...byThread.values()]
    .filter(r => Date.parse(r.updatedAt) >= cutoff)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function dayLabel(iso: string, now: number): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Unknown date';
  const midnight = (t: number | Date) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(now) - midnight(d)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Priority first, then the rest grouped by day.
export function groups(rows: DisplayRow[], now: number): Group[] {
  const list = newest(rows, now);
  const out: Group[] = [];
  const first = list.filter(isPriority);
  if (first.length) out.push({ label: 'Priority', rows: first });
  for (const r of list.filter(r => !isPriority(r))) {
    const label = dayLabel(r.updatedAt, now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.rows.push(r);
    else out.push({ label, rows: [r] });
  }
  return out;
}

export type Service = {
  watch(onView: (view: View) => void, onError: (code: string) => void): void;
  // Saves the mark and retries. Calls onResult(true) when it is saved, or onResult(false) once after the last try fails.
  markSeen(docId: string, onResult: (saved: boolean) => void): void;
};

export const SEEN_RETRY_DELAYS = [1000, 2000, 5000]; // ms between tries, so at most four tries

type Deps = { manager: Manager; toDisplay: (docId: string, row: StoredRow) => DisplayRow; now: () => number; wait: (ms: number) => Promise<void> };

// Takes the stored rows, clears and deletes the old ones through the Manager, and hands the Client what to show.
export function createService({ manager, toDisplay, now, wait }: Deps): Service {
  let deleteBudget = MAX_DELETES; // across every update of this page load
  return {
    watch(onView, onError) {
      manager.watchRows((docs: StoredDoc[]) => {
        const all = docs.map(d => toDisplay(d.id, d.row));
        const t = now();
        const shown = groups(all, t);
        const gone = expired(all, t, deleteBudget);
        deleteBudget -= gone.length;
        void manager.removeRows(gone);
        const rows = shown.flatMap(g => g.rows);
        onView({ groups: shown, threads: rows.length, waiting: rows.filter(isPriority).length, stored: all.length, limit: ROW_LIMIT });
      }, onError);
    },
    markSeen(docId, onResult) {
      void (async () => {
        for (let i = 0; ; i++) {
          try { await manager.markRowSeen(docId); onResult(true); return; } catch {
            if (i >= SEEN_RETRY_DELAYS.length) { onResult(false); return; }
            await wait(SEEN_RETRY_DELAYS[i]);
          }
        }
      })();
    },
  };
}

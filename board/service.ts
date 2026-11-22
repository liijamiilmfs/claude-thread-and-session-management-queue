// Service: what the list shows. Holds every board rule, reads no clock (time is passed in). Depends on Model only.
import type { DisplayRow, Group } from './model.ts';

export const MAX_AGE_DAYS = 60;
export const ROW_LIMIT = 25000; // the page database's own limit

export const isPriority = (r: DisplayRow): boolean => r.state !== 'working' && r.unread;

const cutoffFor = (now: number): number => now - MAX_AGE_DAYS * 86400000;

export const MAX_DELETES = 200; // one pass, so a fault cannot empty the board

// Board rows to delete: older than MAX_AGE_DAYS. A row with no readable time is never deleted.
// If even the newest row is that old, the device clock is wrong or the board is idle: delete nothing.
export function expired(rows: DisplayRow[], now: number): string[] {
  const cutoff = cutoffFor(now);
  const times = rows.map(r => Date.parse(r.updatedAt)).filter(t => !isNaN(t));
  if (!times.length || Math.max(...times) < cutoff) return [];
  return rows.filter(r => Date.parse(r.updatedAt) < cutoff).slice(0, MAX_DELETES).map(r => r.docId);
}

// One row per thread: its newest. Rows older than MAX_AGE_DAYS are left out. Newest first.
export function newest(rows: DisplayRow[], now: number): DisplayRow[] {
  const cutoff = cutoffFor(now);
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

// The panel's pure rules, called only by the Service section of register.ts, and the panel's Model types (ADR-0002, Section 4).
// No imports, no `$`, no clock. The time and the machine's name are passed in.

// ---- Model ----

// A row that passed the row check (P3). `at` is the row's time in milliseconds.
export type Row = { thread: string; title: string; project: string; state: string; at: number; preview: string };
// The board tool's answer as it came. Only the Connector makes one and only transformer.ts reads it.
export type RawRead = { answer: unknown };
// What the Transformer hands back: checked rows, and how many rows failed the check.
export type Read = { rows: Row[]; leftOut: number } | 'unreadable';
// What the pane shows: a few status lines, and one entry per thread with its text ready to render.
export type View = { lines: string[]; rows: { thread: string; title: string; detail: string; preview: string }[] };
// The one command, checked. Only openCommand() below makes one, and the run functions accept nothing else.
declare const builtByTheRule: unique symbol;
type Command = { readonly argv: readonly [string, string, string] };
export type CheckedCommand = Command & { readonly [builtByTheRule]: true };

// ---- Rules ----

export const MAX_THREADS = 50;
export const STATE_LABELS: Record<string, string> = { needs_you: 'Needs you', review: 'Review', finished: 'Finished', failed: 'Failed' };

// P1: the newest row of each thread, newest first, at most MAX_THREADS. `more` counts the threads not shown.
export function newestPerThread(rows: Row[]): { shown: Row[]; more: number } {
  const newest = new Map<string, Row>();
  for (const row of rows) {
    const held = newest.get(row.thread);
    if (!held || row.at > held.at) newest.set(row.thread, row);
  }
  const sorted = [...newest.values()].sort((a, b) => b.at - a.at);
  return { shown: sorted.slice(0, MAX_THREADS), more: Math.max(0, sorted.length - MAX_THREADS) };
}

// P4 and P5: the three fixed words. The only part that varies is the thread id, and only an id of "session_" and then
// letters and digits (at most 64 characters in all) gets through. The id is checked here, whoever checked it before.
// Only on Windows. Both pieces after the program are undocumented (P9): each is this one value.
export function openCommand(thread: unknown, sysname: unknown): CheckedCommand | undefined {
  if (sysname !== 'Windows_NT') return undefined;
  if (typeof thread !== 'string' || !/^session_[A-Za-z0-9]{1,56}$/.test(thread)) return undefined;
  const command: Command = { argv: ['C:\\Windows\\System32\\rundll32.exe', 'url.dll,FileProtocolHandler', 'claude://claude.ai/code/' + thread] };
  return command as CheckedCommand;
}

// How long ago, in one short word. A time ahead of the clock reads as now.
export function age(now: number, at: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return minutes + 'm';
  if (minutes < 48 * 60) return Math.floor(minutes / 60) + 'h';
  return Math.floor(minutes / (24 * 60)) + 'd';
}

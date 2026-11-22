// Thread Queue board script. Roles follow ADR-0001 section 5.
// Only the Client section touches the document. Only the Connector section calls the page database.

// ---- Model ----
export type State = 'needs_you' | 'review' | 'failed' | 'working' | 'finished';

// A stored row. Every field but state and updated_at may be missing: older builds wrote fewer.
export type StoredRow = {
  thread?: string;
  title?: string;
  project?: string;
  state?: string;
  updated_at?: string;
  preview?: string;
  url?: string;
  build?: string;
  gate?: string;
  seen_at?: string;
};

export type DisplayRow = {
  docId: string;
  thread: string;
  title: string;
  project: string;
  state: string;
  stateLabel: string;
  tone: '' | 'needs' | 'ok' | 'bad';
  updatedAt: string;
  preview: string;
  link: string;
  build: string;
  unread: boolean;
};

const STATES: Record<string, [string, DisplayRow['tone']]> = {
  needs_you: ['Needs you', 'needs'],
  review: ['Ready for review', 'needs'],
  failed: ['Failed', 'bad'],
  working: ['Working', ''],
  finished: ['Finished', 'ok'],
};

// ---- Transformer: stored row to display row ----
export function toDisplay(docId: string, d: StoredRow): DisplayRow {
  const [stateLabel, tone] = STATES[d.state ?? ''] ?? ['Unknown', ''];
  const updatedAt = String(d.updated_at ?? '');
  return {
    docId,
    thread: d.thread || docId,
    title: String(d.title || 'Untitled'),
    project: String(d.project ?? ''),
    state: d.state ?? '',
    stateLabel,
    tone,
    updatedAt,
    preview: String(d.preview ?? ''),
    // Rows are written by threads, so only a claude.ai link is ever followed.
    link: typeof d.url === 'string' && d.url.startsWith('https://claude.ai/') ? d.url : '',
    build: String(d.build ?? ''),
    unread: !d.seen_at || String(d.seen_at) < updatedAt,
  };
}

// ---- Service: what the list shows ----
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

export type Group = { label: string; rows: DisplayRow[] };

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

// ---- Connector: the page database. The only code that calls it. ----
type Db = {
  collection(name: string): { onSnapshot(ok: (snap: { docs: { id: string; data(): StoredRow | undefined }[] }) => void, fail: (e: { code?: string }) => void): void };
  doc(path: string): { update(data: object): Promise<unknown>; delete(): Promise<unknown> };
};

export type Board = {
  subscribe(onRows: (rows: DisplayRow[]) => void, onError: (code: string) => void): void;
  markSeen(docId: string): void;
  deleteRows(docIds: string[]): Promise<void>;
};

export async function openBoard(): Promise<Board | null> {
  const db: Db | null = (await (globalThis as any).claude?.use?.('db')) ?? null;
  if (!db) return null;
  return {
    subscribe: (onRows, onError) => db.collection('turns').onSnapshot(
      snap => onRows(snap.docs.map(d => toDisplay(d.id, d.data() ?? {}))),
      e => onError(e?.code ?? 'error')),
    markSeen: docId => { db.doc('turns/' + docId).update({ seen_at: new Date().toISOString() }).catch(() => {}); },
    // Board rows only: every path is in the turns collection of this page's own database.
    deleteRows: async docIds => { for (const id of docIds) await db.doc('turns/' + id).delete().catch(() => {}); },
  };
}

// ---- Client: the only code that touches the document ----
function el(tag: string, cls?: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // plain text only, never markup
  return n;
}

function rowNode(r: DisplayRow, board: Board): HTMLElement {
  const a = el('a', 'row') as HTMLAnchorElement;
  if (r.link) { a.href = r.link; a.target = '_blank'; a.rel = 'noopener'; }
  a.addEventListener('click', () => board.markSeen(r.docId));
  const top = el('div', 'top');
  top.append(el('span', 'title', r.title), el('span', 'chip ' + r.tone, r.stateLabel));
  a.append(top);
  if (r.project || r.build) a.append(el('div', 'project', [r.project, r.build && 'build ' + r.build].filter(Boolean).join(' · ')));
  if (r.preview) a.append(el('div', 'preview', r.preview));
  return a;
}

async function start(): Promise<void> {
  const status = document.getElementById('status')!;
  const box = document.getElementById('list')!;
  const board = await openBoard();
  if (!board) { status.textContent = 'This view cannot reach the list. Open the page inside Claude, signed in.'; return; }
  const slow = setTimeout(() => { status.textContent = 'The list cannot be reached yet. Still trying.'; }, 10000);
  board.subscribe(all => {
    clearTimeout(slow);
    const now = Date.now();
    const shown = groups(all, now);
    void board.deleteRows(expired(all, now));
    box.replaceChildren(...shown.map(g => {
      const section = el('div', 'day');
      section.append(el('h2', '', g.label), ...g.rows.map(r => rowNode(r, board)));
      return section;
    }));
    const waiting = shown.find(g => g.label === 'Priority')?.rows.length ?? 0;
    const count = shown.reduce((n, g) => n + g.rows.length, 0);
    const stored = `${all.length.toLocaleString()} of ${ROW_LIMIT.toLocaleString()} stored rows used.`;
    status.textContent = count ? `${count} threads. ${waiting} waiting on you. ${stored}` : `No thread has reported yet. ${stored}`;
  }, code => { clearTimeout(slow); status.textContent = `The list stopped updating (${code}). Reload the page.`; });
}

if (typeof document !== 'undefined') void start();

// Client: the only file that touches the document. It is handed everything it uses by main.ts, so it imports types only.
import type { DisplayRow } from './model.ts';
import type * as Service from './service.ts';
import type { toDisplay } from './transformer.ts';
import type { Manager } from './manager.ts';

export type Deps = {
  manager: Manager | null; // null: the page database is out of reach
  service: typeof Service;
  toDisplay: typeof toDisplay;
  now: () => number;
};

export const hasDocument = (): boolean => typeof document !== 'undefined';

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // plain text only, never markup
  return n;
}

function rowNode(r: DisplayRow, manager: Manager): HTMLElement {
  const a = el('a', 'row') as HTMLAnchorElement;
  if (r.link) { a.href = r.link; a.target = '_blank'; a.rel = 'noopener'; }
  a.addEventListener('click', () => manager.markRowSeen(r.docId));
  if (!r.link) { // no href means no keyboard focus, so make the row a button
    a.tabIndex = 0;
    a.setAttribute('role', 'button');
    a.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); manager.markRowSeen(r.docId); } });
  }
  const top = el('div', 'top');
  top.append(el('span', 'title', r.title), el('span', 'chip ' + r.tone, r.stateLabel));
  a.append(top);
  if (r.project || r.build) a.append(el('div', 'project', [r.project, r.build && 'build ' + r.build].filter(Boolean).join(' · ')));
  if (r.preview) a.append(el('div', 'preview', r.preview));
  return a;
}

export function startClient({ manager, service, toDisplay, now }: Deps): void {
  const { expired, groups, MAX_DELETES, ROW_LIMIT } = service;
  let deleteBudget = MAX_DELETES; // across every update of this page load
  const status = document.getElementById('status')!;
  const box = document.getElementById('list')!;
  if (!manager) { status.textContent = 'This view cannot reach the list. Open the page inside Claude, signed in.'; return; }
  const slow = setTimeout(() => { status.textContent = 'The list cannot be reached yet. Still trying.'; }, 10000);
  manager.watchRows(docs => {
    clearTimeout(slow);
    const all = docs.map(d => toDisplay(d.id, d.row));
    const t = now();
    const shown = groups(all, t);
    const gone = expired(all, t, deleteBudget);
    deleteBudget -= gone.length;
    void manager.removeRows(gone);
    box.replaceChildren(...shown.map(g => {
      const section = el('div', 'day');
      section.append(el('h2', '', g.label), ...g.rows.map(r => rowNode(r, manager)));
      return section;
    }));
    const waiting = shown.find(g => g.label === 'Priority')?.rows.length ?? 0;
    const count = shown.reduce((n, g) => n + g.rows.length, 0);
    const stored = `${all.length.toLocaleString()} of ${ROW_LIMIT.toLocaleString()} stored rows used.`;
    status.textContent = count ? `${count} threads. ${waiting} waiting on you. ${stored}` : `No thread has reported yet. ${stored}`;
  }, code => { clearTimeout(slow); status.textContent = `The list stopped updating (${code}). Reload the page.`; });
}

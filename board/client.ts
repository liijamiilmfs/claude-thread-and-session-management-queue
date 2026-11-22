// Client: the only file that touches the document. Depends on Service, Manager, Transformer and Model. (ADR-0001 section 5)
import type { DisplayRow } from './model.ts';
import { toDisplay } from './transformer.ts';
import { expired, groups, ROW_LIMIT } from './service.ts';
import { openManager, type Manager } from './manager.ts';

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
  const manager = await openManager();
  if (!manager) { status.textContent = 'This view cannot reach the list. Open the page inside Claude, signed in.'; return; }
  const slow = setTimeout(() => { status.textContent = 'The list cannot be reached yet. Still trying.'; }, 10000);
  manager.watchRows(docs => {
    clearTimeout(slow);
    const all = docs.map(d => toDisplay(d.id, d.row));
    const now = Date.now();
    const shown = groups(all, now);
    void manager.removeRows(expired(all, now));
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

if (typeof document !== 'undefined') void start();

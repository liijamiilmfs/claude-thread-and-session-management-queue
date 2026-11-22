// Client: the only file that touches the document. It is handed everything it uses by main.ts, so it imports types only.
import type { DisplayRow, View } from './model.ts';
import type { Service } from './service.ts';

export type Deps = { service: Service | null }; // null: the page database is out of reach

export const hasDocument = (): boolean => typeof document !== 'undefined';

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // plain text only, never markup
  return n;
}

function rowNode(r: DisplayRow, service: Service, onResult: (saved: boolean) => void): HTMLElement {
  const a = el('a', 'row') as HTMLAnchorElement;
  if (r.link) { a.href = r.link; a.target = '_blank'; a.rel = 'noopener'; }
  // Saved once per row. In the Claude app a press on a thread link opens the thread at once and no click ever reaches the page,
  // so on a row with a link the press itself must save, for the mouse and its main button only. A touch press can be a scroll,
  // and the other buttons never send a click, so they save nothing. A finished click, from touch or the keyboard, also saves. Nothing here ever stops the link.
  let saved = false;
  const markOnce = () => { if (!saved) { saved = true; service.markSeen(r.docId, onResult); } };
  if (r.link) a.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) markOnce(); });
  a.addEventListener('click', markOnce);
  if (!r.link) { // no href means no keyboard focus, so make the row a button
    a.tabIndex = 0;
    a.setAttribute('role', 'button');
    a.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); markOnce(); } });
  }
  const top = el('div', 'top');
  top.append(el('span', 'title', r.title), el('span', 'chip ' + r.tone, r.stateLabel));
  a.append(top);
  if (r.project || r.build) a.append(el('div', 'project', [r.project, r.build && 'build ' + r.build].filter(Boolean).join(' · ')));
  if (r.preview) a.append(el('div', 'preview', r.preview));
  return a;
}

export function startClient({ service }: Deps): void {
  const status = document.getElementById('status')!;
  const box = document.getElementById('list')!;
  const notice = el('p', 'muted');
  notice.setAttribute('role', 'alert');
  status.after(notice);
  const onResult = (saved: boolean) => { // a later save that works clears the note: a row that failed is still unread, so nothing is hidden
    notice.textContent = saved ? '' : 'Could not save that you opened a thread. It may show as unread again. Reload the page and try again.';
  };
  if (!service) { status.textContent = 'This view cannot reach the list. Open the page inside Claude, signed in.'; return; }
  const slow = setTimeout(() => { status.textContent = 'The list cannot be reached yet. Still trying.'; }, 10000);
  service.watch((v: View) => {
    clearTimeout(slow);
    box.replaceChildren(...v.groups.map(g => {
      const section = el('div', 'day');
      section.append(el('h2', '', g.label), ...g.rows.map(r => rowNode(r, service, onResult)));
      return section;
    }));
    const stored = `${v.stored.toLocaleString()} of ${v.limit.toLocaleString()} stored rows used.`;
    status.textContent = v.threads ? `${v.threads} threads. ${v.waiting} waiting on you. ${stored}` : `No thread has reported yet. ${stored}`;
  }, code => { clearTimeout(slow); status.textContent = `The list stopped updating (${code}). Reload the page.`; });
}

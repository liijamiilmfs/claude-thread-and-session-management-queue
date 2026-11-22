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

// A fresh link, because the row may have been replaced by a list update while the save was going out. Opens exactly once.
function openLink(url: string): void {
  const t = el('a') as HTMLAnchorElement;
  t.href = url; t.target = '_blank'; t.rel = 'noopener';
  document.body.append(t);
  t.click();
  t.remove();
}

function rowNode(r: DisplayRow, service: Service, onResult: (saved: boolean) => void): HTMLElement {
  const a = el('a', 'row') as HTMLAnchorElement;
  if (r.link) { a.href = r.link; a.target = '_blank'; a.rel = 'noopener'; }
  // The mark is saved only on a finished activation (click, or Enter and Space on a row with no link), once per row.
  let saving: Promise<void> | null = null;
  const markOnce = (): Promise<void> => saving ??= service.markSeen(r.docId, onResult);
  a.addEventListener('click', e => {
    if (!r.link || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) { void markOnce(); return; }
    // Wait briefly for the save, then open the thread. Inside the Claude app a click can leave the page before the save is sent.
    e.preventDefault();
    void markOnce().then(() => openLink(r.link));
  });
  if (!r.link) { // no href means no keyboard focus, so make the row a button
    a.tabIndex = 0;
    a.setAttribute('role', 'button');
    a.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void markOnce(); } });
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

// Transformer: stored row to display row. Depends on Model only. (ADR-0001 section 5)
import type { DisplayRow, StoredRow } from './model.ts';

const STATES: Record<string, [string, DisplayRow['tone']]> = {
  needs_you: ['Needs you', 'needs'],
  review: ['Ready for review', 'needs'],
  failed: ['Failed', 'bad'],
  working: ['Working', ''],
  finished: ['Finished', 'ok'],
};

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

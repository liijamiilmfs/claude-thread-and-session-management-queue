// Transformer: the board tool's raw answer to checked rows (ADR-0002, P3). Only the Manager section of register.ts calls it.
// Rows are text that threads wrote, so nothing here is trusted. Pure: no `$`, no clock. It never fails: an answer it cannot read is 'unreadable'.
import type { RawRead, Read, Row } from './rows.ts';

type Fields = Record<string, unknown>;
const isRecord = (v: unknown): v is Fields => typeof v === 'object' && v !== null && !Array.isArray(v);

const STATES = ['needs_you', 'review', 'finished', 'failed'];
const LIMIT = 200;
// Control, invisible, direction-flipping, "tag" block, private and broken characters, as in ADR-0001 R12 step 3.
const UNSEEN = /(?![\t\n\v\f\r])[\p{C}\u{34F}\u{115F}\u{1160}\u{17B4}\u{17B5}\u{180B}-\u{180F}\u{2800}\u{3164}\u{FE00}-\u{FE0F}\u{FFA0}\u{E0100}-\u{E01EF}]/gu;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

// Cleaned text of `least` to 200 whole characters, or undefined.
function text(value: unknown, least: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(UNSEEN, '').replace(/\s+/g, ' ').trim();
  const length = Array.from(cleaned).length;
  return length >= least && length <= LIMIT ? cleaned : undefined;
}

// One stored row to a checked row. Six fields are taken and every other field is ignored, the row's own `url` included.
function checked(data: unknown): Row | undefined {
  if (!isRecord(data)) return undefined;
  const { thread, state, updated_at } = data;
  if (typeof thread !== 'string' || !/^session_[A-Za-z0-9]{1,56}$/.test(thread)) return undefined;
  if (typeof state !== 'string' || !STATES.includes(state)) return undefined;
  const at = typeof updated_at === 'string' && TIME.test(updated_at) ? Date.parse(updated_at) : NaN;
  const title = text(data.title, 1);
  const preview = text(data.preview, 0);
  const project = data.project === undefined ? '' : text(data.project, 0);
  if (!Number.isFinite(at) || title === undefined || preview === undefined || project === undefined) return undefined;
  return { thread, title, project, state, at, preview };
}

// The tool puts the rows between a begin mark and an end mark that carry the same fresh id on every answer.
const BEGIN = /^=== BEGIN ARTIFACT DB ([0-9a-f]{4,64}) /;

// The lines between the two marks of this answer. No begin mark: no lines. No matching end mark: undefined.
function between(lines: string[]): string[] | undefined {
  const begin = lines.findIndex((line) => BEGIN.test(line));
  if (begin < 0) return [];
  const end = lines.indexOf('=== END ARTIFACT DB ' + BEGIN.exec(lines[begin]!)![1] + ' ===', begin + 1);
  return end < 0 ? undefined : lines.slice(begin + 1, end);
}

// One line of the answer to the row it carries. A row's own text cannot hold a line break here, so one line is one doc.
function dataOf(line: string): unknown {
  try {
    const doc: unknown = JSON.parse(line);
    return isRecord(doc) ? doc.data : undefined;
  } catch {
    return undefined;
  }
}

// The answer as seen live (ADR-0002, FCT-215): `result.db_read.docs` lists each doc with an empty `data`,
// and `text` holds the rows, one JSON line per doc, between the marks. Anything else is 'unreadable'.
export function readRows(raw: RawRead): Read {
  try {
    const answer = raw.answer;
    if (!isRecord(answer) || answer.isError || answer.deny !== undefined || typeof answer.text !== 'string') return 'unreadable';
    const listed = isRecord(answer.result) ? answer.result.db_read : undefined;
    if (!isRecord(listed) || listed.collection !== 'turns' || !Array.isArray(listed.docs)) return 'unreadable';
    const lines = between(answer.text.split('\n'));
    // The tool's own count and the lines must agree, or the layout is not the one this code knows.
    if (!lines || lines.length !== listed.docs.length) return 'unreadable';
    const rows: Row[] = [];
    for (const line of lines) {
      const row = checked(dataOf(line));
      if (row) rows.push(row);
    }
    return { rows, leftOut: lines.length - rows.length };
  } catch {
    return 'unreadable';
  }
}

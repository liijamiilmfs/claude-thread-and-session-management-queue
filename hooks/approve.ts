// Thread Queue approval rule, T7 test build.
// True only for the one call the plugin may approve: this thread writing its own row to the board.
// Pure: no imports, no file, network, clock or environment. Never throws.
export const BOARD = 'https://claude.ai/artifact/ByotUv4ViCSyFxtHF5cbNG';
export const STATES = ['needs_you', 'review', 'finished', 'failed'];

// The longest value each row field may hold. A field not named here means no approval.
export const LIMITS: Record<string, number> = {
  thread: 80, title: 200, project: 200, state: 20, updated_at: 30, preview: 500, url: 200,
  gate: 20, mode: 20, node: 20, via: 20,
};
const REQUIRED = ['thread', 'title', 'state', 'updated_at'];
const CALL_KEYS = 'action,collection,data,doc_id,url';

export const threadOf = (sessionId: string): string => sessionId.replace(/^cse_/, 'session_');

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function approves(tool: unknown, input: unknown, thread: string): boolean {
  if (tool !== 'ArtifactData' || !isRecord(input)) return false;
  // Exactly these five arguments: no file_path, as_level, if_version or anything else.
  if (Object.keys(input).sort().join() !== CALL_KEYS) return false;
  if (input.action !== 'set' || input.url !== BOARD || input.collection !== 'turns') return false;

  // The row is this thread's own: doc id is "<thread>.<13 digits>" and the row names the same thread.
  if (!/^session_[A-Za-z0-9]+$/.test(thread)) return false;
  const id = input.doc_id;
  if (typeof id !== 'string' || !id.startsWith(thread + '.') || !/^\d{13}$/.test(id.slice(thread.length + 1))) return false;
  const row = input.data;
  if (!isRecord(row) || row.thread !== thread) return false;

  // Only known fields, each a short string.
  for (const [key, value] of Object.entries(row)) {
    if (!Object.hasOwn(LIMITS, key) || typeof value !== 'string' || value.length > LIMITS[key]!) return false;
  }
  if (REQUIRED.some((key) => !row[key])) return false;
  if (!STATES.includes(row.state as string)) return false;
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,3})?Z$/.test(row.updated_at as string)) return false;
  if (row.url !== undefined && !(row.url as string).startsWith('https://claude.ai/')) return false;
  return true;
}

// Thread Queue gate, Milestone 0 test build. A turn may not end until the thread has written its row.
// PostToolUse notes two things: the thread told the person something (a row is owed), and a valid row write.
// Stop blocks while a row is owed and not written.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOARD as DEFAULT_BOARD, LIMITS, STATES, threadOf } from './approve.ts';

const MAX_BLOCKS = 2;
const MIN_NODE = [24, 22, 3];

type Via = 'option' | 'env' | 'default';
type State = { owed: boolean; reported: boolean; blocks: number };
type HookInput = {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, any>;
  session_id?: string;
  scratchpad_dir?: string;
  permission_mode?: string;
};
type Ctx = { board: string; via: Via; thread: string; now: Date; node: string };
type Result = { state?: State; out?: { decision: 'block'; reason: string } };

export function nodeIsNewEnough(version: string): boolean {
  const have = version.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((have[i] ?? 0) !== MIN_NODE[i]) return (have[i] ?? 0) > MIN_NODE[i]!;
  }
  return true;
}

export function pickBoard(env: Record<string, string | undefined>): { board: string; via: Via } {
  if (env.CLAUDE_PLUGIN_OPTION_BOARD_URL) return { board: env.CLAUDE_PLUGIN_OPTION_BOARD_URL, via: 'option' };
  if (env.THREAD_QUEUE_URL) return { board: env.THREAD_QUEUE_URL, via: 'env' };
  return { board: DEFAULT_BOARD, via: 'default' };
}

export function decide(input: HookInput, ctx: Ctx, state: State): Result {
  const boardId = ctx.board.split('/').pop();
  if (!boardId) return {}; // no board address: never block

  if (input.hook_event_name === 'PostToolUse') {
    const t = input.tool_input ?? {};
    const d = t.data ?? {};
    const ok =
      input.tool_name === 'ArtifactData' && t.action === 'set' && t.collection === 'turns' &&
      String(t.url ?? '').includes(boardId) && d.thread && d.title && STATES.includes(d.state) && d.updated_at;
    if (ok) return { state: { ...state, reported: true, blocks: 0 } };
    // Only a turn that told the person something owes a row. Quiet turns pass freely.
    if (/^mcp__hearthbot__(post_message|request_decision)$/.test(input.tool_name ?? '')) return { state: { ...state, owed: true } };
    return {};
  }

  if (input.hook_event_name !== 'Stop') return {};
  const clear = { owed: false, reported: false, blocks: 0 };
  if (!state.owed || state.reported) return { state: clear };
  // shortcut: gives up after MAX_BLOCKS so a broken board cannot trap a thread; that turn's row is missed
  if (state.blocks >= MAX_BLOCKS) return { state: clear };

  const row = {
    thread: ctx.thread, title: "<this thread's title>", project: "<this project's name>",
    state: '<one of: ' + STATES.join(', ') + '>', updated_at: ctx.now.toISOString(),
    preview: '<one line: what you just told the person>', url: 'https://claude.ai/code/' + ctx.thread,
    gate: 't7-plugin', mode: input.permission_mode ?? 'unknown', node: ctx.node, via: ctx.via,
  };
  const reason =
    "Thread Queue gate: this turn cannot end until the thread's row is written. " +
    'Call ArtifactData with action "set", url "' + ctx.board + '", collection "turns", doc_id "' +
    ctx.thread + '.' + ctx.now.getTime() + '", and data ' + JSON.stringify(row) +
    ' (fill in the four <...> values, keep the rest exactly, add no other field or argument; title at most ' +
    LIMITS.title + ' characters, preview at most ' + LIMITS.preview + '). Then end the turn the usual way.';
  return { state: { ...state, blocks: state.blocks + 1 }, out: { decision: 'block', reason } };
}

function main(): void {
  if (!nodeIsNewEnough(process.version)) return; // wrong Node: do nothing
  const input: HookInput = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const file = join(input.scratchpad_dir || tmpdir(), 'thread-queue-gate.json');
  let state: State = { owed: false, reported: false, blocks: 0 };
  try { state = { ...state, ...JSON.parse(readFileSync(file, 'utf8')) }; } catch {}
  const thread = threadOf(String(process.env.CLAUDE_CODE_REMOTE_SESSION_ID || input.session_id || 'unknown'));
  const result = decide(input, { ...pickBoard(process.env), thread, now: new Date(), node: process.version }, state);
  if (result.state) writeFileSync(file, JSON.stringify(result.state));
  if (result.out) process.stdout.write(JSON.stringify(result.out));
}

if (import.meta.main) main();

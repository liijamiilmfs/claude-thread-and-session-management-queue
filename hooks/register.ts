// Thread Queue hooks module, T8 test build. Runs inside Claude Code.
// When the thread tells the person something, this code writes the thread's row to the board itself.
// It passes every call on unchanged and never refuses one. The model plays no part.
import { landed, projectOf, rowCall, rowFor, sessionOf, threadOf } from './row.ts';
import type { Told } from './row.ts';

type Args = Record<string, unknown>;
type Out = { deny?: string; isError?: boolean; text?: string };
type Waiting = { thread: string; at: number; told: Told };
type Api = {
  env: { get(name: string): Promise<string | undefined> };
  clock: { now(): Promise<number>; after(ms: number, fn: () => void): { cancel(): void } };
  ui: { log(text: string, options: { to: 'debug' }): void };
  store: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> };
  mcp: { call(server: string, tool: string, args?: Args): Promise<unknown> };
  tool: { call(input: Args): Promise<Out>; list(): Promise<{ name: string }[]> };
};
type Hook = ($: Api, e: Args & { tool: string }, next: (e: unknown) => Promise<Out>) => Promise<Out>;
type On = (event: string, match: { tool: string | string[] } | Hook, hook?: Hook) => unknown;

const MAX_WAITING = 20;
const TURN_END_WAIT_MS = 8000;
// Rows not yet on the board, oldest first. The plugin's own note on disk holds the same list,
// so a restart of Claude Code on the same machine does not lose a row that is still waiting.
const waiting: Waiting[] = [];
let loaded: Promise<void> | undefined;
let lastAt = 0;
let title = '';
let project = '';
let work: Promise<void> = Promise.resolve();

function note($: Api, text: string): void {
  $.ui.log('thread-queue: ' + text, { to: 'debug' });
}

// Once per run: take back the rows an earlier run left waiting.
function load($: Api): Promise<void> {
  return (loaded ??= $.store.get('waiting').then((kept) => {
    if (Array.isArray(kept)) waiting.unshift(...kept.filter((k) => typeof k?.thread === 'string' && typeof k?.at === 'number' && typeof k?.told?.state === 'string'));
  }, () => {}));
}

// A failed save never stops a write: it only means a restart could lose the rows still waiting.
function save($: Api): Promise<void> {
  return $.store.set('waiting', waiting).catch((err) => note($, 'note not saved: ' + String(err).slice(0, 200)));
}

// The thread's title and project name, from the thread's own record. Read-only lookups, never asked of the model.
async function names($: Api): Promise<void> {
  const me = sessionOf(await $.mcp.call('claude-code-remote', 'get_session', {}));
  if (me.title) title = me.title; // read again each time: a thread can be renamed
  if (!project && me.parent) project = projectOf(sessionOf(await $.mcp.call('claude-code-remote', 'get_session', { session_id: me.parent })).title);
}

// Writes every waiting row, oldest first. Stops at the first one that fails and keeps it for the next try.
async function drain($: Api): Promise<void> {
  try {
    await load($);
    if (!waiting.length) return;
    await names($).catch((err) => note($, 'title lookup failed: ' + String(err).slice(0, 200)));
    let wrote = false;
    while (waiting.length) {
      const { thread, at, told } = waiting[0]!;
      const call = rowCall(thread, at, told, title, project);
      if (!call) { note($, 'no title yet, ' + waiting.length + ' row(s) kept'); break; }
      const out = await $.tool.call(call).catch((err): Out => ({ isError: true, text: String(err) }));
      if (!landed(out)) { note($, 'row ' + call.doc_id + ' not written, kept: ' + String(out.deny ?? out.text).slice(0, 200)); break; }
      waiting.shift();
      wrote = true;
      note($, 'row ' + call.doc_id + ' written by the plugin, state ' + told.state);
    }
    if (wrote) await save($);
  } catch (err) {
    note($, 'row write failed, ' + waiting.length + ' row(s) kept: ' + String(err).slice(0, 200));
  }
}

// One drain at a time, so a row is never written twice.
function flush($: Api): Promise<void> {
  work = work.then(() => drain($));
  return work;
}

// Turn end waits for the board, but not for long: a broken board must never trap a thread.
function settle($: Api): Promise<void> {
  return new Promise((done) => {
    const timer = $.clock.after(TURN_END_WAIT_MS, done);
    void flush($).then(() => { timer.cancel(); done(); });
  });
}

async function tell($: Api, tool: string, args: Args): Promise<void> {
  const told = rowFor(tool, args);
  const thread = threadOf((await $.env.get('CLAUDE_CODE_REMOTE_SESSION_ID')) ?? '');
  // Not a cloud thread, or a call that owes no row: do nothing.
  if (!told || !/^session_[A-Za-z0-9]+$/.test(thread)) return;
  await load($);
  const first = !lastAt;
  // Never the same time twice: the time is part of the row's id.
  lastAt = Math.max(await $.clock.now(), lastAt + 1);
  waiting.push({ thread, at: lastAt, told });
  if (waiting.length > MAX_WAITING) note($, 'too many rows waiting, dropped the oldest: ' + waiting.shift()!.at);
  await save($); // on disk before the board is tried
  void flush($); // not awaited: the thread's own call does not wait on the board
  if (first) note($, 'board tool in the tool list: ' + (await $.tool.list().then((tools) => tools.some((t) => t.name === 'ArtifactData'), () => 'unknown')));
}

export function register(on: On): void {
  on('tool.call', {
    tool: [
      'mcp__hearthbot__post_message', 'mcp__hearthbot__request_decision', 'mcp__hearthbot__post_widget',
      'mcp__hearthbot__suggest_connectors', 'mcp__hearthbot__connect_device', 'mcp__hearthbot__start_remote_control',
      'mcp__hearthbot__set_thread_resolved', 'mcp__hearthbot__show_helpline_card', 'PushNotification',
    ],
  }, async ($, e, next) => {
    const out = await next(e);
    // A call that was refused or failed told the person nothing.
    if (out?.deny === undefined && !out?.isError) await tell($, e.tool, e).catch((err) => note($, 'row not queued: ' + String(err).slice(0, 200)));
    return out;
  });

  // Turn end: wait for the writes in flight, and try again any that failed or were left by an earlier run.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) await settle($);
    return next(e);
  });

  // Evidence only: says so in the debug log if the safety check is ever asked about a board call.
  on('tool.judge', { tool: 'ArtifactData' }, async ($, e, next) => {
    note($, 'safety check asked about an ArtifactData call, ' + String(e.tool_use_id));
    return next(e);
  });
}

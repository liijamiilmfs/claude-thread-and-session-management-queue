// Thread Queue hooks module. Runs inside Claude Code.
// When the thread tells the person something, this code writes the thread's row to the board itself.
// It passes every call on unchanged and never refuses one. The model writes nothing.
// Every `$` call lives in this file. Each section below starts with a comment naming its role (ADR-0001, Section 5).
import { LOOK_MS, afterLook, bareCall, draft, isThread, landed, lastLook, lookAt, rowCall, rowFor, settle, threadOf } from './row.ts';
import type { CheckedCall, Draft, LookAnswer, Names } from './row.ts';

type Args = Record<string, unknown>;
type Api = {
  env: { get(name: string): Promise<string | undefined> };
  clock: { now(): Promise<number>; after(ms: number, fn: () => void): { cancel(): void } };
  ui: { log(text: string, options: { to: 'debug' }): void };
  store: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> };
  tool: { call(input: Args): Promise<unknown> };
  mcp: { call(server: string, tool: string, args?: Args): Promise<unknown> };
  model: { complete(request: { model: string; system: string; prompt: string; maxTokens: number; timeoutMs: number }): Promise<unknown> };
};
type Event = Args & { tool: string };
type Next = (e: unknown) => Promise<unknown>;
type On = (event: string, match: { tool: string[] } | (($: Api, e: Event, next: Next) => Promise<unknown>), hook?: ($: Api, e: Event, next: Next) => Promise<unknown>) => unknown;

// The plugin version that writes the row. A test fails when it differs from .claude-plugin/plugin.json.
export const BUILD = '0.1.0';

// Diagnostics: one debug line, also written to the thread's /tmp/claude-code.log. Never text the safety check hid.
function log($: Api, text: string): void {
  $.ui.log('thread-queue: ' + text, { to: 'debug' });
}

// ---- Composition Root: names the events and the nine tools, wires the handlers. ----

export function register(on: On): void {
  on('tool.call', {
    tool: [
      'mcp__hearthbot__post_message', 'mcp__hearthbot__request_decision', 'mcp__hearthbot__post_widget',
      'mcp__hearthbot__suggest_connectors', 'mcp__hearthbot__connect_device', 'mcp__hearthbot__start_remote_control',
      'mcp__hearthbot__set_thread_resolved', 'mcp__hearthbot__show_helpline_card', 'PushNotification',
    ],
  }, async ($, e, next) => onToolCall($, e, next));
  on('turn.complete', async ($, e, next) => onTurnComplete($, e, next));
}

// ---- Controller: passes the call on, then hands the result to the Service. It calls only the Service. ----

const TURN_END_WAIT_MS = 8000;
// Room after the last look that may start: half a second for the Connector's own limit on the look, half a second for the board write.
const LOOK_SPARE_MS = 1000;

// The thread id comes from the environment in this run, never from the note.
async function thisThread($: Api): Promise<string> {
  return threadOf((await $.env.get('CLAUDE_CODE_REMOTE_SESSION_ID')) ?? '');
}

async function onToolCall($: Api, e: Event, next: Next): Promise<unknown> {
  // The call goes through unchanged and its answer comes back unchanged (R5).
  const out = await next(e);
  try {
    // A call that was refused or failed told the person nothing (R2).
    const failed = typeof out === 'object' && out !== null && (('deny' in out && out.deny !== undefined) || ('isError' in out && Boolean(out.isError)));
    if (!failed) {
      // A new reply: nobody is waiting on the turn's end, so the model may be asked again.
      looksOpen(true);
      await rowOwed($, e.tool, e, await thisThread($), await $.clock.now());
    }
  } catch (err) {
    log($, 'row not queued: ' + String(err).slice(0, 200));
  }
  return out;
}

// Turn end: wait for the writes in flight, and try again any that failed or were left by an earlier run.
// Not for long: a broken board must never trap a thread (R7).
async function onTurnComplete($: Api, e: Event, next: Next): Promise<unknown> {
  try {
    if (!e.agentId) {
      const thread = await thisThread($);
      const now = await $.clock.now();
      looksOpen(true);
      // A look that starts after this point could run past the wait, so from here on it is skipped (R13).
      // It stays skipped after the wait is over: a pass still running then must not ask the model once the turn has ended.
      const lastLookStart = $.clock.after(TURN_END_WAIT_MS - LOOK_MS - LOOK_SPARE_MS, () => looksOpen(false));
      await new Promise<void>((done) => {
        // The wait gave up with the pass still running: no look may start from here on.
        const timer = $.clock.after(TURN_END_WAIT_MS, () => { looksOpen(false); done(); });
        void writeWaiting($, thread, now).then(() => { timer.cancel(); lastLookStart.cancel(); done(); });
      });
    }
  } catch (err) {
    log($, 'turn end pass failed: ' + String(err).slice(0, 200));
  }
  return next(e);
}

// ---- Service: the conductor. It decides the order of steps and holds no rule of its own. ----
// Every rule is a function in row.ts. It passes `$` on and never calls anything on it.

let pass: Promise<void> | undefined;
let again = false;
// The latest time the Controller handed over. A pass can outlast the moment it started, and each row is checked against the time now.
let latest = 0;
let looking = true;

// Near the end of the turn end wait the model's look is skipped, and the text is hidden instead.
function looksOpen(open: boolean): void {
  looking = open;
}

// One owing call that worked: one row (R3). Saved in the note before the board is tried (R6).
async function rowOwed($: Api, tool: string, args: Args, thread: string, now: number): Promise<void> {
  const told = rowFor(tool, args);
  // A call that owes no row, or not a cloud thread (R9): do nothing.
  if (!told || !isThread(thread)) return;
  await settleNote($, thread, now);
  const at = await keep($, thread, now, { state: told.state, preview: told.preview });
  if (told.hid) log($, 'row ' + thread + '.' + at + ' queued, preview hidden: ' + told.hid);
  // Not awaited: the thread's own call does not wait on the board (R5).
  void writeWaiting($, thread, now);
}

// Rows an earlier run left in the note are settled once, before anything else is kept or written (S6):
// cleaned, cut down to the known fields, and given a time that stays the same on every try. Then the note is saved again.
async function settleNote($: Api, thread: string, now: number): Promise<void> {
  const left = await leftByEarlierRun($);
  if (left.length) await takeBack($, left.map((row) => settle(row, thread, now, freshTime(now))));
}

// One pass at a time, so a row is never written twice. A request that arrives mid-pass makes the pass run once more.
function writeWaiting($: Api, thread: string, now: number): Promise<void> {
  latest = Math.max(latest, now);
  if (pass) { again = true; return pass; }
  pass = (async () => {
    try {
      do { again = false; await writePass($, thread); } while (again);
    } catch (err) {
      log($, 'write pass failed, rows kept: ' + String(err).slice(0, 200));
    } finally {
      pass = undefined;
    }
  })();
  return pass;
}

// Writes every waiting row, oldest first. Stops at the first one the board does not take and keeps it for the next try.
async function writePass($: Api, thread: string): Promise<void> {
  if (!isThread(thread)) return;
  await settleNote($, thread, latest);
  let names: Names | undefined;
  for (let waiting = await oldest($); waiting.some; waiting = await oldest($)) {
    const carried = droppedCount();
    // The title and project are read once a pass, and only when a row waits. A thread can be renamed.
    if (!names) {
      names = await sessionNames($);
      if (names === 'not-found') log($, 'title lookup gave nothing, the thread id stands in');
    }
    const sent = await writeRow($, thread, latest, waiting.row, carried, names);
    if (!sent) return;
    await written($, waiting.row, carried);
  }
}

// The steps for one waiting row, in order: clean and hide secrets, the model's look, the bare row if anything failed, the last look, the write.
// True when the row is on the board. Every waiting row gives exactly one row: its own or a bare one (R11).
async function writeRow($: Api, thread: string, now: number, waiting: unknown, carried: number, names: Names): Promise<boolean> {
  let own: CheckedCall | undefined;
  let why = '';
  try {
    const cleaned = names === 'not-found' ? draft(waiting, thread, now, '', '') : draft(waiting, thread, now, names.title, names.project);
    if (typeof cleaned === 'string') why = cleaned;
    else {
      const row = await looked($, thread, cleaned);
      own = lastLook(rowCall(thread, row, BUILD, carried), thread);
      why = own ? row.notes.join(', ') : 'failed the last look';
    }
  } catch {
    why = 'the check broke';
  }
  // The same door for both: a row that cannot go as it is goes as a bare row.
  for (const first of own ? [true, false] : [false]) {
    const checked = first ? own : lastLook(bareCall(thread, waiting, now, freshTime(now), BUILD, carried), thread);
    if (!checked) {
      // Only without a valid thread id (R9). The row stays in the note.
      log($, 'no row can be written: the bare row failed the last look');
      return false;
    }
    const out = await write($, checked);
    if (out === NOT_SENT) {
      log($, 'row ' + checked.doc_id + ' not sent: the second compare failed' + (first ? ', sending a bare row' : ', row kept'));
      why = 'the second compare failed';
      continue;
    }
    const on = landed(out, checked.doc_id);
    const tail = ', state ' + checked.data.state + ', check ' + checked.data.check + (why && ' (' + why + ')');
    if (on === 'written') log($, 'row ' + checked.doc_id + ' written by the plugin' + tail);
    else if (on === 'already there') log($, 'row ' + checked.doc_id + ' was already on the board, counted as written' + tail);
    else log($, 'row ' + checked.doc_id + ' not written, kept: ' + refusal(out));
    return on !== false;
  }
  return false;
}

// The model's look (R13). It can only hide. No answer, a skipped look and an answer that cannot be read all hide.
// A verdict is never saved: a row read back from the note is looked at again.
async function looked($: Api, thread: string, row: Draft): Promise<Draft> {
  const ask = lookAt(row, thread);
  // Nothing a thread wrote is left to show, so there is nothing to ask.
  if (!ask) return row;
  if (!looking) return afterLook(row, 'none', thread, 'skipped near turn end');
  let answer: LookAnswer = { verdict: 'none', cause: 'failed' };
  try {
    answer = await modelLook($, ask.system, ask.prompt, LOOK_MS);
  } catch {
    // The answer stays "none", which hides.
  }
  return afterLook(row, answer.verdict, thread, answer.cause);
}

// Why the board did not take the row, for the log. Up to 200 characters of the board's own words.
function refusal(out: unknown): string {
  const o: Args = typeof out === 'object' && out !== null ? (out as Args) : {};
  return String(o.deny ?? o.threw ?? o.text ?? out).slice(0, 200);
}

// ---- Manager: the waiting rows. It does what the Service tells it and hands every read and write to the Connector. ----

// A build made before RUL-3185 keeps at most 20.
const MAX_WAITING = 20;
// Rows not yet on the board, oldest first. The note holds the same list, so a restart on the same machine loses none.
// The note is not trusted: rows read from it wait apart until the Service has settled them, and the Service checks each row again at the door.
const waitingRows: unknown[] = [];
const fromNote: unknown[] = [];
let dropped = 0;
let loaded: Promise<void> | undefined;
let lastAt = 0;

// Once per run: take back the rows and the dropped count an earlier run left.
function load($: Api): Promise<void> {
  return (loaded ??= (async () => {
    try {
      const kept = await readNote($, 'waiting');
      const count = await readNote($, 'dropped');
      if (Array.isArray(kept)) fromNote.push(...kept);
      if (typeof count === 'number' && count > 0) dropped += Math.min(Math.floor(count), 9999);
    } catch (err) {
      log($, 'note not read: ' + String(err).slice(0, 200));
    }
  })());
}

// The rows an earlier run left, as read. Handed out once.
async function leftByEarlierRun($: Api): Promise<unknown[]> {
  await load($);
  return fromNote.splice(0);
}

// The settled rows go to the front of the line, since they are older, and the note is saved over with them.
async function takeBack($: Api, rows: unknown[]): Promise<void> {
  waitingRows.unshift(...rows);
  trim($);
  await save($);
}

// Past the waiting limit the oldest row is given up, and the drop is counted and logged (R6, R14).
function trim($: Api): void {
  while (waitingRows.length > MAX_WAITING) {
    waitingRows.shift();
    dropped++;
    log($, 'too many rows waiting, dropped the oldest. Dropped since the last row that landed: ' + dropped);
  }
}

// A failed save never stops a write: it only means a restart could lose the rows still waiting.
async function save($: Api): Promise<void> {
  try {
    await writeNote($, 'waiting', waitingRows);
    await writeNote($, 'dropped', dropped);
  } catch (err) {
    log($, 'note not saved: ' + String(err).slice(0, 200));
  }
}

// A time never used before in this run: it is part of the row's id.
function freshTime(now: number): number {
  lastAt = Math.max(now, lastAt + 1);
  return lastAt;
}

// Adds one row and saves the note. Returns the row's time.
async function keep($: Api, thread: string, now: number, told: { state: string; preview: string }): Promise<number> {
  await load($);
  const at = freshTime(now);
  waitingRows.push({ thread, at, told });
  trim($);
  await save($);
  return at;
}

async function oldest($: Api): Promise<{ some: boolean; row: unknown }> {
  await load($);
  return { some: waitingRows.length > 0, row: waitingRows[0] };
}

const droppedCount = (): number => dropped;

// The row is on the board: it leaves the line. The dropped count it carried is paid off.
async function written($: Api, row: unknown, carried: number): Promise<void> {
  const i = waitingRows.indexOf(row);
  if (i >= 0) waitingRows.splice(i, 1);
  dropped = Math.max(0, dropped - carried);
  await save($);
}

// The Manager's own answer when the Connector's second compare stopped the call.
const NOT_SENT = 'not sent';

// The write accepts only a call the last look passed.
async function write($: Api, call: CheckedCall): Promise<unknown> {
  const out = await send($, call);
  return out === SECOND_COMPARE_FAILED ? NOT_SENT : out;
}

// ---- Gateway: the two outside systems, the model's look and the get_session lookup. It saves nothing and decides nothing about a row. ----
// The raw replies stop here: each goes straight from the Connector into the Transformer, and only the Transformer's answer goes up.
import { readLook, readSession } from './transformer.ts';

async function modelLook($: Api, system: string, prompt: string, ms: number): Promise<LookAnswer> {
  return readLook(await ask($, system, prompt, ms));
}

// This thread's title, and its project's name from the title of its parent, the project's main chat.
async function sessionNames($: Api): Promise<Names> {
  const me = readSession(await session($, ''));
  if (me === 'not-found') return 'not-found';
  const parent = me.parent ? readSession(await session($, me.parent)) : 'not-found';
  return { title: me.title, project: parent === 'not-found' ? '' : parent.project };
}

// ---- Connector: the only code that talks to the note, the board, the model and the lookup. It holds no rule. ----
import type { RawLook, RawSession } from './transformer.ts';

const SECOND_COMPARE_FAILED = 'second compare failed';

function readNote($: Api, key: string): Promise<unknown> {
  return $.store.get(key);
}

function writeNote($: Api, key: string, value: unknown): Promise<void> {
  return $.store.set(key, value);
}

// The second compare (R8): right before the call, the four fixed things are compared with the Connector's own constants once more.
// If one differs, nothing is sent.
async function send($: Api, call: CheckedCall): Promise<unknown> {
  if (call.tool !== 'ArtifactData' || call.action !== 'set' || call.url !== 'https://claude.ai/artifact/ByotUv4ViCSyFxtHF5cbNG' || call.collection !== 'turns') {
    return SECOND_COMPARE_FAILED;
  }
  try {
    return await $.tool.call(call);
  } catch (err) {
    // Marked as thrown, so it can never pass for the board's own refusal.
    return { threw: String(err) };
  }
}

// An outside call that never comes back must not hold the write pass for good, so each gets a time limit of its own.
function within<T>($: Api, ms: number, work: Promise<T>, late: T): Promise<T> {
  return new Promise<T>((done) => {
    const timer = $.clock.after(ms, () => done(late));
    work.then((out) => { timer.cancel(); done(out); }, () => { timer.cancel(); done(late); });
  });
}

// The one model call (R13): a small model, a short answer, a time limit.
function ask($: Api, system: string, prompt: string, ms: number): Promise<RawLook> {
  const late: RawLook = { look: { isAnswered: false, reason: 'aborted' } };
  try {
    return within($, ms + 500, $.model.complete({ model: 'haiku', system, prompt, maxTokens: 16, timeoutMs: ms }).then((look): RawLook => ({ look })), late);
  } catch {
    return Promise.resolve({ look: undefined });
  }
}

// The one lookup: a session's own record, read-only. With no id it is this thread's.
function session($: Api, id: string): Promise<RawSession> {
  const late: RawSession = { session: undefined };
  try {
    return within($, 3000, $.mcp.call('claude-code-remote', 'get_session', id ? { session_id: id } : {}).then((found): RawSession => ({ session: found })), late);
  } catch {
    return Promise.resolve(late);
  }
}

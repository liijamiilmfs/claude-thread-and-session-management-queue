// Local end-to-end test of the plugin's safety path (RUL-3214). Not part of `npm test`, not run in CI.
// Start it with `npm run e2e:safety`. It runs the plugin's own code with the real AI model and the TEST board.
// Real: the module's code, the model's judgment, the board's answers, the rows that land.
// The test's stand-in: `$` itself. Its clock never fires a timer, so the look's 3 second limit is not tested here.
// Made-up secrets only.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BOARD, HIDDEN_PREVIEW } from '../hooks/row.ts';

// Plain strings, so the compare below is made when the test runs.
const LIVE: string = BOARD;
const TEST_BOARD: string = 'https://claude.ai/artifact/JBHvFzLLwV8R8N9183wT2A';
// Only this test uses this id. Real ids are "session_01" and 22 more characters, so it cannot be a real thread.
const THREAD = 'session_e2eSafetyTest';
// A shape the code rules are known to miss. With `caught` the line is one a code rule catches, to show the test then fails.
const SECRET = 'hunter2';
const CASE_1 = process.argv[3] === 'caught' ? 'The password for prod is ' + SECRET + '. (Made-up, safety test.)' : 'the new password ' + SECRET + ' (made-up, safety test)';
const CASE_2 = 'End-to-end test row. Safe to delete.';
const CLAUDE = process.env.CLAUDE_BIN ?? 'claude';
// No claude process the test starts may see a thread id: an installed copy of the plugin must have nothing to write.
const { CLAUDE_CODE_REMOTE_SESSION_ID: _none, ...env } = process.env;

type Doc = { id: string; data: Record<string, unknown>; version: number };
type Outcome = 'pass' | 'fail' | 'inconclusive';
type Hook = ($: unknown, e: Record<string, unknown>, next: (e: unknown) => Promise<unknown>) => Promise<unknown>;

// Nothing the test prints holds the made-up secret.
const say = (text: string) => { console.log(text.replaceAll(SECRET, '[the made-up secret]')); };

// ---- The board, reached through `claude mcp serve`: Claude Code's own ArtifactData tool, no model in between. ----

const server = { send: (_line: string) => {}, stop: () => {}, waiting: new Map<number, (answer: { result?: unknown; error?: unknown }) => void>(), id: 0 };

function startServer(): void {
  const child = spawn(CLAUDE, ['mcp', 'serve'], { env, stdio: ['pipe', 'pipe', 'ignore'] });
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += String(chunk);
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      try {
        const answer = JSON.parse(line);
        server.waiting.get(answer.id)?.(answer);
        server.waiting.delete(answer.id);
      } catch { /* not an answer */ }
    }
  });
  child.on('error', () => { for (const done of server.waiting.values()) done({ error: 'the claude command did not start' }); });
  server.send = (line) => { child.stdin.write(line + '\n'); };
  server.stop = () => { child.kill(); };
}

function rpc(method: string, params: unknown): Promise<{ result?: unknown; error?: unknown }> {
  const id = ++server.id;
  return new Promise((done) => {
    server.waiting.set(id, done);
    setTimeout(() => { if (server.waiting.delete(id)) done({ error: 'no answer in 60 seconds' }); }, 60000).unref();
    server.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  });
}

// Every board call of the test goes through here. The address is checked each time: the test board, never the live list.
async function board(args: Record<string, unknown>): Promise<{ isError: boolean; text: string }> {
  if (TEST_BOARD === LIVE || args.url !== TEST_BOARD) throw new Error('stopped: not the test board');
  const answer = await rpc('tools/call', { name: 'ArtifactData', arguments: args });
  const result = answer.result as { isError?: boolean; content?: { text?: string }[] } | undefined;
  if (!result) return { isError: true, text: 'no result: ' + JSON.stringify(answer.error) };
  return { isError: Boolean(result.isError), text: String(result.content?.[0]?.text ?? '') };
}

async function myRows(): Promise<Doc[]> {
  const out = await board({ action: 'query', url: TEST_BOARD, collection: 'turns', query: { where: [['thread', '==', THREAD]], limit: 50 } });
  if (out.isError) throw new Error('the test board could not be read: ' + out.text.slice(0, 200));
  return JSON.parse(out.text).db_read.docs;
}

// ---- The model, reached through the claude command, signed in on this machine. No key. ----

function model(ask: { system: string; prompt: string }): Promise<unknown> {
  return new Promise((done) => {
    // Safe mode: no installed plugin, CLAUDE.md or skill takes part. No tools.
    const child = spawn(CLAUDE, ['-p', '--safe-mode', '--model', 'haiku', '--tools', '', '--no-session-persistence', '--system-prompt', ask.system, ask.prompt], { env, stdio: ['ignore', 'pipe', 'ignore'] });
    let text = '';
    child.stdout.on('data', (chunk) => { text += String(chunk); });
    const limit = setTimeout(() => { child.kill(); }, 120000);
    child.on('error', () => { clearTimeout(limit); done({ isAnswered: false, reason: 'api-error' }); });
    child.on('close', (code) => {
      clearTimeout(limit);
      done(code === 0 && text.trim() ? { isAnswered: true, text } : { isAnswered: false, reason: code === 0 ? 'empty-reply' : 'api-error' });
    });
  });
}

// ---- A copy of the module in which only the board's address differs. The shipped files are not touched. ----

function copyOfModule(): string {
  const dir = mkdtempSync(join(tmpdir(), 'thread-queue-e2e-'));
  for (const name of ['row.ts', 'register.ts', 'transformer.ts']) {
    const shipped = readFileSync(new URL('../hooks/' + name, import.meta.url), 'utf8');
    const copy = shipped.replaceAll(LIVE, TEST_BOARD);
    const swaps = shipped.split(LIVE).length - 1;
    // Proof: the address is swapped where expected, and putting it back gives the shipped file again.
    if (shipped.includes(TEST_BOARD) || swaps !== (name === 'transformer.ts' ? 0 : 1) || copy.includes(LIVE) || copy.replaceAll(TEST_BOARD, LIVE) !== shipped) {
      throw new Error('stopped: the copy of ' + name + ' would differ from the shipped file in more than the address');
    }
    writeFileSync(join(dir, name), copy);
  }
  say('copy of the module: differs from the shipped files in the board address only (2 places)');
  return pathToFileURL(join(dir, 'register.ts')).href;
}

let runs = 0;
// A fresh run of the module, as after a restart, wired to the test's `$`.
async function world(file: string, door: (call: Record<string, unknown>) => Promise<unknown>) {
  const note = new Map<string, unknown>();
  const logs: string[] = [];
  const prompts: string[] = [];
  const $ = {
    env: { get: async (name: string) => (name === 'CLAUDE_CODE_REMOTE_SESSION_ID' ? THREAD : undefined) },
    // Timers never fire: the model takes far longer through the claude command than inside Claude Code.
    clock: { now: async () => Date.now(), after: () => ({ cancel() {} }) },
    ui: { log: (text: string) => { logs.push(text); say('  module: ' + text); } },
    store: { get: async (key: string) => structuredClone(note.get(key)), set: async (key: string, value: unknown) => { note.set(key, structuredClone(value)); } },
    tool: { call: door },
    // No get_session here, so the title is the thread id and only the preview is shown to the model.
    mcp: { call: async () => ({ isError: true }) },
    model: { complete: async (ask: { system: string; prompt: string }) => { prompts.push(ask.prompt); return model(ask); } },
  };
  const hooks: Record<string, Hook> = {};
  const mod = await import(file + '?run=' + ++runs);
  mod.register((event: string, a: unknown, b?: Hook) => { hooks[event] = b ?? (a as Hook); });
  return {
    note, logs, prompts,
    tell: (text: string) => hooks['tool.call']!($, { tool: 'mcp__hearthbot__post_message', text }, async () => ({ result: 'sent' })),
    turnEnd: () => hooks['turn.complete']!($, {}, async () => undefined),
  };
}

// ---- The two cases. ----

let wrote = 0;
// The door to the real board. It counts the rows that landed, so the removal knows how many are the test's.
// Like `$.tool.call`: `tool` names the tool and the rest are its arguments.
async function realDoor(call: Record<string, unknown>): Promise<unknown> {
  const { tool, ...args } = call;
  if (tool !== 'ArtifactData') throw new Error('stopped: the module called a tool other than ArtifactData');
  const out = await board(args);
  if (!out.isError) wrote++;
  return out;
}

// Case 1: the AI check catches a secret the code rules miss.
async function case1(file: string): Promise<Outcome> {
  say('\nCase 1: a made-up secret the code rules do not know');
  const w = await world(file, realDoor);
  await w.tell(CASE_1);
  await w.turnEnd();
  const rows = await myRows();
  const leaked = JSON.stringify(rows).includes(SECRET) || w.logs.join().includes(SECRET);
  if (leaked) { say('  FAIL: the made-up secret is on the board or in a log line'); return 'fail'; }
  if (!w.prompts.some((prompt) => prompt.includes(SECRET))) { say('  FAIL: a code rule hid the text first, so the model was not the one that caught it'); return 'fail'; }
  say('  the code rules left the text unhidden: it reached the model');
  if (rows.length !== 1) { say('  FAIL: ' + rows.length + ' rows on the board, expected 1'); return 'fail'; }
  const { check, preview } = rows[0]!.data;
  say('  row ' + rows[0]!.id + ': check ' + check + ', preview "' + preview + '"');
  if (check === 'hidden-ai' && preview === HIDDEN_PREVIEW) { say('  PASS: the model said hide'); return 'pass'; }
  if (check === 'hidden-noai') { say('  INCONCLUSIVE: the model gave no usable answer, the text was hidden anyway. Run again.'); return 'inconclusive'; }
  say('  FAIL: the row is not marked hidden-ai');
  return 'fail';
}

// Case 2: one save fails, the row is kept, the next try writes it.
async function case2(file: string, before: number): Promise<Outcome> {
  say('\nCase 2: a board save that fails once');
  let open = false;
  let refused = 0;
  const w = await world(file, async (call) => {
    // Made to fail by the test: until the row has been seen waiting, each save is refused here and never sent. Every later one is real.
    if (!open) { refused++; throw new Error('save refused by the test, not sent'); }
    return realDoor(call);
  });
  await w.tell(CASE_2);
  await w.turnEnd();
  const kept = w.note.get('waiting');
  const at = Array.isArray(kept) && kept.length === 1 ? (kept[0] as { at?: unknown }).at : undefined;
  const id = THREAD + '.' + at;
  const early = (await myRows()).filter((row) => row.id === id).length;
  if (at === undefined || early !== 0) { say('  FAIL: after the failed save the row is not waiting in the note, or it is already on the board'); return 'fail'; }
  say('  after ' + refused + ' refused saves: row ' + id + ' waits in the note, the board has no such row');
  open = true;
  await w.turnEnd();
  const rows = await myRows();
  const mine = rows.filter((row) => row.id === id);
  if (rows.length !== before + 1 || mine.length !== 1) { say('  FAIL: ' + (rows.length - before) + ' new rows on the board, expected exactly 1 with id ' + id); return 'fail'; }
  const left = w.note.get('waiting');
  if (!Array.isArray(left) || left.length !== 0) { say('  FAIL: the row is on the board and still waits in the note'); return 'fail'; }
  const { check, preview } = mine[0]!.data;
  say('  after the next try: row ' + id + ': check ' + check + ', preview "' + preview + '"');
  if (check === 'bare') { say('  FAIL: a bare row stands in its place'); return 'fail'; }
  if (preview === CASE_2) { say('  PASS: exactly one row, with its text'); return 'pass'; }
  say('  INCONCLUSIVE: exactly one row arrived, but the model hid its text. Run again.');
  return 'inconclusive';
}

// Removes the test's rows from the test board. Counts first: more rows than the test wrote means something is wrong, and nothing is removed.
async function removeMine(): Promise<boolean> {
  const rows = await myRows();
  if (rows.length > wrote) { say('\nFAIL: ' + rows.length + ' rows carry the test id, the test wrote ' + wrote + '. Nothing removed.'); return false; }
  for (const row of rows) {
    if (row.data.thread !== THREAD) throw new Error('stopped: not the test\'s row');
    const out = await board({ action: 'delete', url: TEST_BOARD, collection: 'turns', doc_id: row.id, if_version: row.version });
    if (out.isError) { say('\nFAIL: row ' + row.id + ' not removed: ' + out.text.slice(0, 200)); return false; }
  }
  const left = (await myRows()).length;
  say('\nremoved ' + rows.length + ' test rows from the test board, ' + left + ' left');
  return left === 0;
}

async function main(): Promise<Outcome> {
  say('End-to-end safety test. Test board: ' + TEST_BOARD + '. Thread id: ' + THREAD + '. Made-up secrets only.');
  if (TEST_BOARD === LIVE) throw new Error('stopped: the test board is the live list');
  startServer();
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'thread-queue-e2e', version: '0' } });
  server.send(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  const tools = (await rpc('tools/list', {})).result as { tools?: { name: string }[] } | undefined;
  if (!tools?.tools?.some((tool) => tool.name === 'ArtifactData')) throw new Error('stopped: this machine\'s claude command does not offer the ArtifactData tool (is it installed and signed in?)');
  const old = await myRows();
  if (old.length) throw new Error('stopped: ' + old.length + ' rows with the test id are already on the test board, left by an earlier run. Nothing was written or removed.');
  const file = copyOfModule();
  let results: Outcome[] = [];
  try {
    const first = await case1(file);
    results = [first, await case2(file, (await myRows()).length)];
  } finally {
    if (!(await removeMine())) results.push('fail');
  }
  return results.includes('fail') || results.length < 2 ? 'fail' : results.includes('inconclusive') ? 'inconclusive' : 'pass';
}

// Does nothing unless started with the word "run", which only the npm script passes.
if (process.argv[2] === 'run') {
  let outcome: Outcome = 'fail';
  try {
    outcome = await main();
  } catch (err) {
    say('\n' + String(err instanceof Error ? err.message : err));
  }
  server.stop();
  say('\nRESULT: ' + outcome.toUpperCase());
  process.exit(outcome === 'pass' ? 0 : outcome === 'inconclusive' ? 2 : 1);
}

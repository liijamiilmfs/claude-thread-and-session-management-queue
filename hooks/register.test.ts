// The hooks module, run with stand-ins for Claude Code. Each test loads a fresh copy, as a restart would.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD } from './row.ts';

const me = 'session_017RufJSQrvaboyxPpLCA3jU';
const post = 'mcp__hearthbot__post_message';
type Call = Record<string, any>;
type Out = Record<string, unknown>;
let runs = 0;

async function start(opts: { id?: string; board?: (call: Call) => Out | Promise<Out>; title?: () => string | undefined; note?: Map<string, unknown> } = {}) {
  const { register } = (await import('./register.ts?run=' + ++runs)) as typeof import('./register.ts');
  const hooks: Record<string, Function> = {};
  const matches: Record<string, unknown> = {};
  register((event, match, hook) => { hooks[event] = hook ?? (match as Function); matches[event] = hook ? match : undefined; });

  const logs: string[] = [];
  const writes: Call[] = [];
  const lookups: unknown[] = [];
  const note = opts.note ?? new Map<string, unknown>();
  const clock = { ms: 1795307400000, timers: [] as (() => void)[], cancelled: 0 };
  const reply = (ccr: unknown) => ({ content: [{ type: 'text', text: JSON.stringify({ ccr }) }], isError: false });
  const $ = {
    env: { get: async (name: string) => (name === 'CLAUDE_CODE_REMOTE_SESSION_ID' ? ('id' in opts ? opts.id : 'cse_017RufJSQrvaboyxPpLCA3jU') : undefined) },
    clock: { now: async () => clock.ms, after: (_ms: number, fn: () => void) => { clock.timers.push(fn); return { cancel: () => { clock.cancelled++; } }; } },
    ui: { log: (text: string, options: unknown) => { assert.deepEqual(options, { to: 'debug' }); logs.push(text); } },
    store: { get: async (key: string) => note.get(key), set: async (key: string, value: unknown) => { note.set(key, JSON.parse(JSON.stringify(value))); } },
    mcp: {
      call: async (server: string, tool: string, args: Call) => {
        // The only lookup the module may make: the read-only session record.
        assert.deepEqual([server, tool], ['claude-code-remote', 'get_session']);
        lookups.push(args);
        if (args.session_id) return reply({ title: 'Project coordinator ("Some project")' });
        const title = opts.title ? opts.title() : 'Fix Safari export button';
        return title === undefined ? { content: [{ type: 'text', text: 'lookup failed' }], isError: true } : reply({ title, parent_session_id: 'session_parent' });
      },
    },
    tool: {
      list: async () => [{ name: 'ArtifactData' }],
      call: async (call: Call) => {
        // The only tool the module may call: the row write, on the board, in "turns".
        assert.deepEqual([call.tool, call.action, call.url, call.collection], ['ArtifactData', 'set', BOARD, 'turns']);
        assert.deepEqual(Object.keys(call).sort(), ['action', 'collection', 'data', 'doc_id', 'tool', 'url']);
        writes.push(call);
        return opts.board ? opts.board(call) : { result: {}, text: 'ok' };
      },
    },
  };
  // The thread's own call: the module must pass the same event on and hand the same answer back.
  const tell = async (tool: string, args: Call, answer: Out = { result: 'posted', text: 'posted' }) => {
    const e = Object.freeze({ tool, tool_use_id: 'toolu_1', ...args });
    assert.equal(await hooks['tool.call']!($, e, async (passed: unknown) => { assert.equal(passed, e); return answer; }), answer);
  };
  const turnEnd = async (e: Call = { reason: 'answer' }) => {
    const answer = { text: '' };
    assert.equal(await hooks['turn.complete']!($, e, async (passed: unknown) => { assert.equal(passed, e); return answer; }), answer);
  };
  return { tell, turnEnd, hooks, matches, logs, writes, lookups, note, clock, $ };
}

test('the module listens to the nine calls that tell the person, turn end, and the safety check on the board tool', async () => {
  const { matches } = await start();
  assert.deepEqual(Object.keys(matches).sort(), ['tool.call', 'tool.judge', 'turn.complete']);
  // The matcher agreed in T4, section 1.
  const t4 = /^mcp__hearthbot__(post_message|request_decision|post_widget|suggest_connectors|connect_device|start_remote_control|set_thread_resolved|show_helpline_card)$|^PushNotification$/;
  const tools = (matches['tool.call'] as { tool: string[] }).tool;
  assert.equal(tools.length, 9);
  assert.equal(new Set(tools).size, 9);
  for (const tool of tools) assert.match(tool, t4);
  assert.deepEqual(matches['tool.judge'], { tool: 'ArtifactData' });
});

test('a reply makes the plugin write one row, built by code', async () => {
  const { tell, turnEnd, writes, logs } = await start();
  await tell(post, { text: 'The fix is ready.\nDetails follow.' });
  await turnEnd();
  assert.deepEqual(writes, [{
    tool: 'ArtifactData', action: 'set', url: BOARD, collection: 'turns', doc_id: me + '.1795307400000',
    data: {
      thread: me, title: 'Fix Safari export button', project: 'Some project', state: 'review',
      updated_at: '2026-11-22T00:30:00.000Z', preview: 'The fix is ready.', url: 'https://claude.ai/code/' + me, gate: 't8-plugin',
    },
  }]);
  assert.ok(logs.includes('thread-queue: row ' + me + '.1795307400000 written by the plugin, state review'));
  assert.ok(logs.includes('thread-queue: board tool in the tool list: true'));
});

test('one row for each call that owes one, none for a call that does not', async () => {
  const { tell, turnEnd, writes } = await start();
  await tell(post, { text: 'First' });
  await tell('mcp__hearthbot__request_decision', { question: 'Ship it?' });
  await tell('mcp__hearthbot__set_thread_resolved', { resolved: false });
  await tell('mcp__hearthbot__set_thread_resolved', { resolved: true });
  await turnEnd();
  assert.deepEqual(writes.map((w) => [w.data.state, w.data.preview]), [['review', 'First'], ['needs_you', 'Ship it?'], ['finished', 'Resolved']]);
  // Same millisecond on the clock, three different row ids.
  assert.equal(new Set(writes.map((w) => w.doc_id)).size, 3);
});

test('a call that was refused or failed told the person nothing, so no row', async () => {
  const { tell, turnEnd, writes } = await start();
  await tell(post, { text: 'x' }, { deny: 'refused' });
  await tell(post, { text: 'x' }, { result: 'boom', text: 'boom', isError: true });
  await turnEnd();
  assert.deepEqual(writes, []);
});

test('the reply does not wait on the board', async () => {
  let release = (_: Out) => {};
  const { tell, turnEnd, writes, logs, note } = await start({ board: () => new Promise<Out>((resolve) => { release = resolve; }) });
  await tell(post, { text: 'Posted while the board hangs' }); // returns although the board has not answered
  await new Promise((r) => setImmediate(r));
  assert.equal(writes.length, 1);
  assert.equal((note.get('waiting') as unknown[]).length, 1); // on disk while the board has not answered
  assert.equal(logs.some((l) => l.includes('written by the plugin')), false);
  release({ result: {}, text: 'ok' });
  await turnEnd(); // turn end does wait
  assert.equal(logs.some((l) => l.includes('written by the plugin')), true);
  assert.deepEqual(note.get('waiting'), []);
});

test('a board that never answers cannot hold the turn end for long', async () => {
  const { tell, turnEnd, clock, note } = await start({ board: () => new Promise<Out>(() => {}) });
  await tell(post, { text: 'The board hangs' });
  const ended = turnEnd();
  await new Promise((r) => setImmediate(r));
  assert.equal(clock.timers.length, 1);
  clock.timers[0]!(); // the wait runs out
  await ended;
  assert.equal((note.get('waiting') as unknown[]).length, 1); // the row is still on disk for the next run
});

test('a failed write is kept and tried again at turn end and on the next reply, oldest first', async () => {
  let up = false;
  const { tell, turnEnd, writes, logs } = await start({ board: () => (up ? { result: {}, text: 'ok' } : { result: {}, text: 'board is down', isError: true }) });
  await tell(post, { text: 'First' });
  await turnEnd();
  assert.equal(writes.length, 2); // once after the reply, once more at turn end
  assert.ok(logs.some((l) => l.includes('not written, kept: board is down')));
  up = true;
  await tell(post, { text: 'Second' });
  await turnEnd();
  assert.deepEqual(writes.slice(2).map((w) => w.data.preview), ['First', 'Second']);
  // The retry is the same row: same id, same time.
  assert.equal(writes[2]!.doc_id, writes[0]!.doc_id);
});

test('a refusal by another plugin, or a call that throws, is kept the same way', async () => {
  for (const down of [() => ({ deny: 'another plugin said no' }), () => { throw new Error('no tool has that name'); }]) {
    let up = false;
    const { tell, turnEnd, writes } = await start({ board: () => (up ? { result: {}, text: 'ok' } : down()) });
    await tell(post, { text: 'Kept' });
    await turnEnd();
    up = true;
    await turnEnd();
    assert.equal(writes.at(-1)!.data.preview, 'Kept');
    await turnEnd();
    assert.equal(writes.length, 3); // written once, not again
  }
});

test('rows still waiting survive a restart on the same machine', async () => {
  const note = new Map<string, unknown>();
  const first = await start({ note, board: () => ({ result: {}, text: 'down', isError: true }) });
  await first.tell(post, { text: 'Written before the restart' });
  await first.turnEnd();
  assert.equal((note.get('waiting') as unknown[]).length, 1);

  const second = await start({ note }); // a fresh copy of the module, the board is back
  await second.turnEnd();
  assert.deepEqual(second.writes.map((w) => [w.doc_id, w.data.preview]), [[first.writes[0]!.doc_id, 'Written before the restart']]);
  assert.deepEqual(note.get('waiting'), []);
});

test('a retry of a row that is already on the board is not a failure', async () => {
  const { tell, turnEnd, writes, note } = await start({ board: () => ({ result: {}, isError: true, text: 'db write failed (version_mismatch): turns/x already exists and this write carried no if_version' }) });
  await tell(post, { text: 'Already there' });
  await turnEnd();
  await turnEnd();
  assert.equal(writes.length, 1);
  assert.deepEqual(note.get('waiting'), []);
});

test('a broken note never stops a write', async () => {
  const run = await start();
  run.$.store.get = async () => { throw new Error('disk'); };
  run.$.store.set = async () => { throw new Error('disk'); };
  await run.tell(post, { text: 'Still written' });
  await run.turnEnd();
  assert.equal(run.writes.length, 1);
});

test('title lookup down: the row still goes out, with the thread id as its title', async () => {
  let title: string | undefined;
  const { tell, turnEnd, writes } = await start({ title: () => title });
  await tell(post, { text: 'Lookup is down' });
  await turnEnd();
  title = 'First title';
  await tell(post, { text: 'Lookup is back' });
  await turnEnd();
  title = undefined;
  await tell(post, { text: 'Down again' });
  await turnEnd();
  title = 'Renamed thread';
  await tell(post, { text: 'After the rename' });
  await turnEnd();
  // Down again: the last title seen is used.
  assert.deepEqual(writes.map((w) => w.data.title), [me, 'First title', 'First title', 'Renamed thread']);
  assert.equal(writes[0]!.data.project, undefined);
});

test('a damaged row in the note is dropped and does not hold up the others', async () => {
  const note = new Map<string, unknown>([['waiting', [{ thread: 'not a thread', at: 1, told: { state: 'review', preview: 'bad' } }]]]);
  const { tell, turnEnd, writes, logs } = await start({ note });
  await tell(post, { text: 'Good row' });
  await turnEnd();
  assert.deepEqual(writes.map((w) => w.data.preview), ['Good row']);
  assert.ok(logs.includes('thread-queue: dropped a waiting row with no thread id'));
  assert.deepEqual(note.get('waiting'), []);
});

test('the project name is looked up once, the title every time', async () => {
  const { tell, turnEnd, lookups } = await start();
  await tell(post, { text: 'One' });
  await turnEnd();
  await tell(post, { text: 'Two' });
  await turnEnd();
  assert.deepEqual(lookups, [{}, { session_id: 'session_parent' }, {}]);
});

test('not a cloud thread: the module does nothing', async () => {
  for (const id of [undefined, '', 'local-session']) {
    const { tell, turnEnd, writes, lookups, note } = await start({ id });
    await tell(post, { text: 'x' });
    await turnEnd();
    assert.deepEqual([writes, lookups, note.size], [[], [], 0]);
  }
});

test('at most 20 rows wait: the oldest is dropped and the drop is logged', async () => {
  const { tell, turnEnd, logs, note } = await start({ board: () => ({ result: {}, text: 'down', isError: true }) });
  for (let i = 0; i < 21; i++) await tell(post, { text: 'Row ' + i });
  await turnEnd();
  assert.equal((note.get('waiting') as unknown[]).length, 20);
  assert.equal(logs.filter((l) => l.includes('dropped the oldest')).length, 1);
});

test("a subagent's turn end writes nothing", async () => {
  const { turnEnd, writes, note } = await start({ note: new Map([['waiting', [{ thread: me, at: 1, told: { state: 'review', preview: 'p' } }]]]) });
  await turnEnd({ reason: 'answer', agentId: 'agent_1' });
  assert.deepEqual(writes, []);
  assert.equal((note.get('waiting') as unknown[]).length, 1);
});

test('the safety check listener only logs and passes the call on', async () => {
  const { hooks, $, logs } = await start();
  const e = { tool: 'ArtifactData', tool_use_id: 'toolu_9' };
  const verdict = { decision: 'allow' };
  assert.equal(await hooks['tool.judge']!($, e, async (passed: unknown) => { assert.equal(passed, e); return verdict; }), verdict);
  assert.deepEqual(logs, ['thread-queue: safety check asked about an ArtifactData call, toolu_9']);
});

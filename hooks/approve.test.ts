import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approves, BOARD, threadOf } from './approve.ts';
import { decide } from './gate.ts';
import { register } from './register.ts';

const me = 'session_017RufJSQrvaboyxPpLCA3jU';
const row = {
  thread: me, title: 'Fix Safari export button', project: 'Some project', state: 'review',
  updated_at: '2026-11-22T00:30:00.000Z', preview: 'The fix is ready for review.', url: 'https://claude.ai/code/' + me,
  gate: 't7-plugin', mode: 'auto', node: 'v24.22.3', via: 'default',
};
const call = { action: 'set', url: BOARD, collection: 'turns', doc_id: me + '.1795307400000', data: row };
const ok = (input: unknown, thread = me, tool: unknown = 'ArtifactData') => approves(tool, input, thread);

test('the board row write is approved', () => {
  assert.equal(ok(call), true);
  assert.equal(ok({ ...call, data: { thread: me, title: 'T', state: 'finished', updated_at: '2026-11-22T00:30:00Z' } }), true);
});

test('tool: only ArtifactData', () => {
  assert.equal(ok(call, me, 'Artifact'), false);
  assert.equal(ok(call, me, 'mcp__x__ArtifactData'), false);
});

test('action: only set', () => {
  for (const action of ['update', 'delete', 'batch', 'str_replace', 'get', 'SET']) assert.equal(ok({ ...call, action }), false, action);
});

test('url: only the board, spelled exactly', () => {
  for (const url of ['https://claude.ai/artifact/OTHERxxxxxxxxxxxxxxxxxx', BOARD + '/', BOARD + '?x=1', BOARD.toLowerCase(), 'https://evil.example/' + BOARD]) {
    assert.equal(ok({ ...call, url }), false, url);
  }
});

test('collection: only turns', () => {
  for (const collection of ['other', 'turns/x/y', 'Turns', 'choices']) assert.equal(ok({ ...call, collection }), false, collection);
});

test('arguments: no extra and none missing', () => {
  assert.equal(ok({ ...call, file_path: '/etc/passwd' }), false);
  assert.equal(ok({ ...call, as_level: 'admin' }), false);
  assert.equal(ok({ ...call, if_version: 1 }), false);
  const { data: _data, ...noData } = call;
  assert.equal(ok(noData), false);
  assert.equal(ok({ ...noData, file_path: '/tmp/row.json' }), false);
  for (const junk of [null, undefined, 'x', 7, [], [call]]) assert.equal(ok(junk), false);
});

test('doc id: this thread, a dot, 13 digits', () => {
  for (const doc_id of [me, me + '.123', me + '.17953074000001', me + '.17953074000ab', 'session_other.1795307400000', me + 'x.1795307400000', 7]) {
    assert.equal(ok({ ...call, doc_id }), false, String(doc_id));
  }
});

test('thread: the row, the doc id and this thread must agree', () => {
  const other = 'session_0otherThread';
  assert.equal(ok({ ...call, data: { ...row, thread: other } }), false); // row names another thread
  assert.equal(ok({ ...call, doc_id: other + '.1795307400000', data: { ...row, thread: other } }), false); // a consistent row for another thread
  assert.equal(ok(call, other), false); // this thread is someone else
  for (const unknownThread of ['', 'unknown', 'cse_017RufJ', 'session_']) {
    const c = { ...call, doc_id: unknownThread + '.1795307400000', data: { ...row, thread: unknownThread } };
    assert.equal(ok(c, unknownThread), false, unknownThread);
  }
});

test('row: only known fields', () => {
  assert.equal(ok({ ...call, data: { ...row, notes: 'x' } }), false);
  assert.equal(ok({ ...call, data: { ...row, constructor: 'x' } }), false);
  assert.equal(ok({ ...call, data: [row] }), false);
});

test('row: every value a short string', () => {
  assert.equal(ok({ ...call, data: { ...row, preview: 'x'.repeat(500) } }), true);
  assert.equal(ok({ ...call, data: { ...row, preview: 'x'.repeat(501) } }), false);
  assert.equal(ok({ ...call, data: { ...row, title: 'x'.repeat(201) } }), false);
  assert.equal(ok({ ...call, data: { ...row, project: 'x'.repeat(201) } }), false);
  assert.equal(ok({ ...call, data: { ...row, mode: 'x'.repeat(21) } }), false);
  for (const preview of [7, null, { text: 'x' }, ['x']]) assert.equal(ok({ ...call, data: { ...row, preview } }), false);
});

test('row: thread, title, state and time are required', () => {
  for (const key of ['thread', 'title', 'state', 'updated_at']) {
    assert.equal(ok({ ...call, data: { ...row, [key]: undefined } }), false, key);
    assert.equal(ok({ ...call, data: { ...row, [key]: '' } }), false, key);
  }
});

test('row: state is one of the four, time is a timestamp, link points at claude.ai', () => {
  assert.equal(ok({ ...call, data: { ...row, state: 'working' } }), false);
  assert.equal(ok({ ...call, data: { ...row, updated_at: 'now' } }), false);
  for (const url of ['https://example.com/', 'http://claude.ai/code/x', 'https://claude.ai.evil.example/', 'javascript:alert(1)']) {
    assert.equal(ok({ ...call, data: { ...row, url } }), false, url);
  }
});

test('an approved write is one the gate also counts', () => {
  const ctx = { board: BOARD, via: 'default' as const, thread: me, now: new Date(), node: 'v24.22.3' };
  const s = decide({ hook_event_name: 'PostToolUse', tool_name: 'ArtifactData', tool_input: call }, ctx, { owed: true, reported: false, blocks: 0 });
  assert.equal(s.state?.reported, true);
});

test('thread id: cse_ becomes session_', () => {
  assert.equal(threadOf('cse_017RufJSQrvaboyxPpLCA3jU'), me);
});

// The hooks module, run with stand-ins for Claude Code.
function load(core: Record<string, unknown>, env: { id?: string } = { id: 'cse_017RufJSQrvaboyxPpLCA3jU' }) {
  const hooks: Record<string, Function> = {};
  const logs: string[] = [];
  register((event, match, hook) => { assert.deepEqual(match, { tool: 'ArtifactData' }); hooks[event] = hook; });
  const $ = { env: { get: async () => env.id }, ui: { log: (text: string) => logs.push(text) } };
  const run = (event: string, input: unknown) => hooks[event]!($, { tool: 'ArtifactData', input, tool_use_id: 'toolu_1' }, async () => core);
  return { run, logs };
}

test('hooks module: the board row is allowed when auto mode would ask', async () => {
  const { run, logs } = load({ decision: 'ask' });
  assert.deepEqual(await run('tool.check', call), { decision: 'allow', reason: 'Thread Queue board row' });
  assert.equal(logs.length, 1);
});

test('hooks module: any other call keeps the answer it had', async () => {
  for (const core of [{ decision: 'ask' }, { decision: 'deny', reason: 'r' }, { decision: 'allow' }]) {
    const { run, logs } = load(core);
    assert.equal(await run('tool.check', { ...call, collection: 'other' }), core);
    assert.equal(await run('tool.check', { ...call, action: 'delete' }), core);
    assert.deepEqual(logs, []);
  }
});

test('hooks module: a refusal, or an ask from a rule, hook, setting or plugin, stands even for the board row', async () => {
  for (const core of [{ decision: 'deny', reason: 'r' }, { decision: 'allow' }, { decision: 'ask', rule: 'ArtifactData' }, { decision: 'ask', hook: 'PreToolUse' }, { decision: 'ask', setting: 's' }, { decision: 'ask', plugin: 'p' }]) {
    assert.equal(await load(core).run('tool.check', call), core);
  }
});

test('hooks module: with no thread id nothing is approved', async () => {
  const core = { decision: 'ask' };
  assert.equal(await load(core, {}).run('tool.check', call), core);
});

test('hooks module: the safety check listener passes the verdict on unchanged', async () => {
  const core = { decision: 'deny', reason: 'r' };
  const { run, logs } = load(core);
  assert.equal(await run('tool.judge', call), core);
  assert.equal(logs.length, 1);
});

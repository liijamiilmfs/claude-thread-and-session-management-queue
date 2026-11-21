import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, pickBoard, nodeIsNewEnough } from './gate.ts';

const board = 'https://claude.ai/artifact/BOARD123';
const ctx = { board, via: 'default' as const, thread: 'session_x', now: new Date('2026-11-21T12:00:00Z'), node: 'v24.22.3' };
const fresh = { owed: false, reported: false, blocks: 0 };
const stop = { hook_event_name: 'Stop', permission_mode: 'auto' };
const told = { hook_event_name: 'PostToolUse', tool_name: 'mcp__hearthbot__post_message', tool_input: {} };
const rowWrite = (over: Record<string, unknown> = {}, url = board) => ({
  hook_event_name: 'PostToolUse', tool_name: 'ArtifactData',
  tool_input: { action: 'set', url, collection: 'turns', data: { thread: 't', title: 'T', state: 'finished', updated_at: 'now', ...over } },
});

test('a turn that told the person nothing owes no row', () => {
  assert.equal(decide(stop, ctx, fresh).out, undefined);
});

test('a turn that told the person something cannot end without a row write', () => {
  const owed = decide(told, ctx, fresh).state!;
  assert.equal(owed.owed, true);
  const r = decide(stop, ctx, owed);
  assert.equal(r.out?.decision, 'block');
  assert.match(r.out!.reason, /"gate":"m0-plugin","mode":"auto","node":"v24.22.3","via":"default"/);
});

test('a valid row write lets the turn end', () => {
  const s = decide(rowWrite(), ctx, { ...fresh, owed: true }).state!;
  assert.equal(s.reported, true);
  assert.equal(decide(stop, ctx, s).out, undefined);
});

test('a row write counts only for the right board, collection and fields', () => {
  const owed = { ...fresh, owed: true };
  for (const bad of [rowWrite({}, 'https://claude.ai/artifact/OTHER'), rowWrite({ title: '' }), rowWrite({ state: 'bogus' }), rowWrite({ thread: undefined }), rowWrite({ updated_at: undefined })]) {
    assert.equal(decide(bad, ctx, owed).state?.reported, undefined);
  }
  const wrongCollection = rowWrite();
  wrongCollection.tool_input.collection = 'other';
  assert.equal(decide(wrongCollection, ctx, owed).state?.reported, undefined);
});

test('after two blocks in a row the gate opens', () => {
  assert.equal(decide(stop, ctx, { owed: true, reported: false, blocks: 2 }).out, undefined);
  assert.equal(decide(stop, ctx, { owed: true, reported: false, blocks: 1 }).out?.decision, 'block');
});

test('with no board address the gate does nothing', () => {
  assert.deepEqual(decide(told, { ...ctx, board: '' }, fresh), {});
  assert.deepEqual(decide(stop, { ...ctx, board: '' }, { ...fresh, owed: true }), {});
});

test('board address order: option, then env, then default', () => {
  assert.deepEqual(pickBoard({ CLAUDE_PLUGIN_OPTION_BOARD_URL: 'a', THREAD_QUEUE_URL: 'b' }), { board: 'a', via: 'option' });
  assert.deepEqual(pickBoard({ THREAD_QUEUE_URL: 'b' }), { board: 'b', via: 'env' });
  assert.equal(pickBoard({}).via, 'default');
});

test('node version check', () => {
  assert.equal(nodeIsNewEnough('v24.22.3'), true);
  assert.equal(nodeIsNewEnough('v25.0.0'), true);
  assert.equal(nodeIsNewEnough('v24.22.2'), false);
  assert.equal(nodeIsNewEnough('v22.23.5'), false);
});

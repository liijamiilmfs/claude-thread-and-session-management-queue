import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBoard } from './connector.ts';

// The host's database handle is checked, not trusted: any other shape means "cannot reach the list".
test('a missing or oddly shaped database handle gives no board', async () => {
  for (const handle of [undefined, null, 5, {}, { collection: () => ({}) }, { doc: () => ({}) }, { collection: 1, doc: 2 }]) {
    (globalThis as { claude?: unknown }).claude = { use: async () => handle };
    assert.equal(await openBoard(), null);
  }
  (globalThis as { claude?: unknown }).claude = undefined;
  assert.equal(await openBoard(), null);
});

test('a handle with collection and doc is accepted', async () => {
  (globalThis as { claude?: unknown }).claude = { use: async () => ({ collection: () => ({}), doc: () => ({}) }) };
  assert.notEqual(await openBoard(), null);
  (globalThis as { claude?: unknown }).claude = undefined;
});

test('a refused seen save is passed up, not swallowed', async () => {
  (globalThis as any).claude = { use: async () => ({ collection: () => ({ onSnapshot: () => {} }), doc: () => ({ update: async () => { throw new Error('refused'); }, delete: async () => {} }) }) };
  const board = (await openBoard())!;
  await assert.rejects(board.markSeen('a'), /refused/);
});

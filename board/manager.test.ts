import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createManager } from './manager.ts';
import { openBoard } from './connector.ts';
import type { ExpiredIds } from './model.ts';

// A stand-in for the page database, recording every call.
// What main.ts does: build the Connector, hand it to the Manager.
async function openManager() {
  const board = await openBoard();
  return board && createManager(board);
}

function fakeDb(rows: Record<string, object>, failDeletes = 0) {
  let toFail = failDeletes;
  const calls: string[] = [];
  const db = {
    collection: (name: string) => ({
      onSnapshot: (ok: (s: unknown) => void) => { calls.push('watch ' + name); ok({ docs: Object.entries(rows).map(([id, d]) => ({ id, data: () => d })) }); },
    }),
    doc: (path: string) => ({
      update: async () => { calls.push('update ' + path); },
      delete: async () => { calls.push('delete ' + path); if (toFail-- > 0) throw new Error('refused'); },
    }),
  };
  (globalThis as any).claude = { use: async () => db };
  return calls;
}

test('no database means no manager', async () => {
  (globalThis as any).claude = undefined;
  assert.equal(await openManager(), null);
});

test('rows come from turns, and only turns rows are touched', async () => {
  const calls = fakeDb({ a: { title: 'x' } });
  const m = (await openManager())!;
  let seen: unknown;
  m.watchRows(docs => { seen = docs; }, () => {});
  m.markRowSeen('a');
  await m.removeRows(['a', 'a', 'b'] as unknown as ExpiredIds);
  assert.deepEqual(seen, [{ id: 'a', row: { title: 'x' } }]);
  assert.deepEqual(calls, ['watch turns', 'update turns/a', 'delete turns/a', 'delete turns/b']); // second 'a' skipped
  delete (globalThis as any).claude;
});

// Checked by `npm run typecheck`: a plain id list is refused. Only expired() can make the checked type.
test('a plain id list does not fit the delete', async () => {
  fakeDb({});
  const m = (await openManager())!;
  // @ts-expect-error a plain string[] is not ExpiredIds
  void m.removeRows(['a']);
  delete (globalThis as any).claude;
});

test('a failed delete is tried again later, a good one is not', async () => {
  const calls = fakeDb({}, 1); // the first delete is refused
  const m = (await openManager())!;
  const ids = ['a'] as unknown as ExpiredIds;
  await m.removeRows(ids);
  await m.removeRows(ids); // retried because the first failed
  await m.removeRows(ids); // skipped because the second worked
  assert.deepEqual(calls, ['delete turns/a', 'delete turns/a']);
  delete (globalThis as any).claude;
});

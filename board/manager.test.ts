import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openManager } from './manager.ts';

// A stand-in for the page database, recording every call.
function fakeDb(rows: Record<string, object>) {
  const calls: string[] = [];
  const db = {
    collection: (name: string) => ({
      onSnapshot: (ok: (s: unknown) => void) => { calls.push('watch ' + name); ok({ docs: Object.entries(rows).map(([id, d]) => ({ id, data: () => d })) }); },
    }),
    doc: (path: string) => ({
      update: async () => { calls.push('update ' + path); },
      delete: async () => { calls.push('delete ' + path); },
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
  await m.removeRows(['a', 'a', 'b']);
  assert.deepEqual(seen, [{ id: 'a', row: { title: 'x' } }]);
  assert.deepEqual(calls, ['watch turns', 'update turns/a', 'delete turns/a', 'delete turns/b']); // second 'a' skipped
  delete (globalThis as any).claude;
});

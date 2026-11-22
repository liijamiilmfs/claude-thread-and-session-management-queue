import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { StoredDoc } from './model.ts';
import type { Manager } from './manager.ts';
import { toDisplay } from './transformer.ts';
import { createService } from './service.ts';

const NOW = Date.parse('2026-11-22T12:00:00Z');

function fake(docs: StoredDoc[]) {
  const calls = { removed: [] as string[][], seen: [] as string[] };
  const manager: Manager = {
    watchRows: (onRows) => onRows(docs),
    markRowSeen: id => { calls.seen.push(id); },
    removeRows: async ids => { calls.removed.push([...ids]); },
  };
  return { calls, service: createService({ manager, toDisplay, now: () => NOW }) };
}

const doc = (id: string, thread: string, updated_at: string, state = 'finished'): StoredDoc => ({ id, row: { thread, state, updated_at } });

test('the view carries the counts, and waiting counts unread rows that need a look', () => {
  const { service } = fake([doc('a', 't1', '2026-11-22T09:00:00Z'), doc('b', 't2', '2026-11-22T08:00:00Z', 'working')]);
  let view;
  service.watch(v => { view = v; }, () => {});
  assert.deepEqual([view!.threads, view!.waiting, view!.stored, view!.limit], [2, 1, 2, 25000]);
});

test('old rows go to the Manager as deletes, and the budget carries across updates', () => {
  const old = Array.from({ length: 300 }, (_, i) => doc('o' + i, 'x' + i, '2026-08-01T00:00:00Z'));
  const { service, calls } = fake([doc('new', 'n', '2026-11-22T09:00:00Z'), ...old]);
  service.watch(() => {}, () => {});
  service.watch(() => {}, () => {}); // second update of the same page load
  assert.equal(calls.removed[0].length, 200);
  assert.equal(calls.removed[1].length, 0);
});

test('a clock far ahead of the rows deletes nothing', () => {
  const { service, calls } = fake([doc('a', 't', '2026-01-01T00:00:00Z')]);
  service.watch(() => {}, () => {});
  assert.equal(calls.removed[0].length, 0);
});

test('clicks and errors pass through', () => {
  const calls = { seen: [] as string[], err: [] as string[] };
  const manager: Manager = { watchRows: (_ok, bad) => bad('boom'), markRowSeen: id => { calls.seen.push(id); }, removeRows: async () => {} };
  const service = createService({ manager, toDisplay, now: () => NOW });
  service.watch(() => {}, c => calls.err.push(c));
  service.markSeen('a');
  assert.deepEqual([calls.seen, calls.err], [['a'], ['boom']]);
});

// Who may import whom. Type-only imports count too: the road is Client, Service, Manager, Connector.
const ALLOWED: Record<string, string[]> = {
  'model.ts': [],
  'transformer.ts': ['model'],
  'service.ts': ['model', 'manager'],
  'manager.ts': ['model', 'connector'],
  'connector.ts': ['model'],
  'client.ts': ['model', 'service'],
  'main.ts': ['connector', 'manager', 'service', 'transformer', 'client'],
};

test('every file imports only the layers it may', () => {
  for (const [file, ok] of Object.entries(ALLOWED)) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const m of src.matchAll(/from '\.\/(\w+)\.ts'/g)) assert.ok(ok.includes(m[1]), `${file} imports ${m[1]}`);
  }
});

test('the Client never gets the Manager', () => {
  assert.doesNotMatch(readFileSync(new URL('client.ts', import.meta.url), 'utf8'), /manager|connector/i);
});

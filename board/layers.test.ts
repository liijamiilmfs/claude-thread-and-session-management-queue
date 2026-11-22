import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import type { StoredDoc } from './model.ts';
import type { Manager } from './manager.ts';
import { toDisplay } from './transformer.ts';
import { createService } from './service.ts';

const NOW = Date.parse('2026-11-22T12:00:00Z');

function fake(docs: StoredDoc[]) {
  const calls = { removed: [] as string[][], seen: [] as string[] };
  const manager: Manager = {
    watchRows: (onRows) => onRows(docs),
    markRowSeen: async id => { calls.seen.push(id); },
    removeRows: async ids => { calls.removed.push([...ids]); },
  };
  return { calls, service: createService({ manager, toDisplay, now: () => NOW, wait: async () => {} }) };
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
  const manager: Manager = { watchRows: (_ok, bad) => bad('boom'), markRowSeen: async id => { calls.seen.push(id); }, removeRows: async () => {} };
  const service = createService({ manager, toDisplay, now: () => NOW, wait: async () => {} });
  service.watch(() => {}, c => calls.err.push(c));
  service.markSeen('a', () => {});
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

test('no shipped file is missing from the allow-list', () => {
  const shipped = readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  assert.deepEqual(shipped.sort(), Object.keys(ALLOWED).sort());
});

// Saving the seen mark: a refused save is retried with waits, then reported.
function seenService(failures: number) {
  const waits: number[] = [];
  let tries = 0, failed = 0;
  const manager: Manager = {
    watchRows: () => {}, removeRows: async () => {},
    markRowSeen: async () => { tries++; if (tries <= failures) throw new Error('refused'); },
  };
  const service = createService({ manager, toDisplay, now: () => NOW, wait: async ms => { waits.push(ms); } });
  const run = async () => { service.markSeen('a', () => { failed++; }); await new Promise(r => setImmediate(r)); };
  return { run, waits, get tries() { return tries; }, get failed() { return failed; } };
}

test('a seen save that works first time makes one try and no note', async () => {
  const s = seenService(0);
  await s.run();
  assert.deepEqual([s.tries, s.waits, s.failed], [1, [], 0]);
});

test('a refused seen save is tried again after 1, 2 and 5 seconds and then works', async () => {
  const s = seenService(3);
  await s.run();
  assert.deepEqual([s.tries, s.waits, s.failed], [4, [1000, 2000, 5000], 0]);
});

test('a seen save that keeps failing stops after four tries and reports once', async () => {
  const s = seenService(99);
  await s.run();
  assert.deepEqual([s.tries, s.waits, s.failed], [4, [1000, 2000, 5000], 1]);
});

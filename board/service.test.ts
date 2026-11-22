import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { toDisplay } from './transformer.ts';
import { newest, groups, isPriority, dayLabel, expired, MAX_DELETES } from './service.ts';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const at = (iso: string) => ({ state: 'finished', updated_at: iso });

test('shows only the newest row of each thread', () => {
  const rows = [
    toDisplay('a', { thread: 't', title: 'first', ...at('2026-11-22T08:00:00Z') }),
    toDisplay('b', { thread: 't', title: 'second', ...at('2026-11-22T09:00:00Z') }),
    toDisplay('c', { thread: 'u', title: 'other', ...at('2026-11-22T07:00:00Z') }),
  ];
  assert.deepEqual(newest(rows, NOW).map(r => r.title), ['second', 'other']);
});

test('rows older than 60 days are left out and marked for deletion', () => {
  const rows = [
    toDisplay('a', { thread: 't', ...at('2026-09-01T00:00:00Z') }),
    toDisplay('b', { thread: 'u', ...at('2026-10-01T00:00:00Z') }),
    toDisplay('f', { thread: 'f', ...at('2026-11-22T00:00:00Z') }),
    toDisplay('c', { thread: 'v', state: 'finished' }), // no time: never deleted
  ];
  assert.deepEqual(newest(rows, NOW).map(r => r.thread), ['f', 'u']);
  assert.deepEqual([...expired(rows, NOW)], ['a']);
});

test('a board idle for over 60 days deletes nothing (age counts from its newest row)', () => {
  const rows = [toDisplay('a', { thread: 't', ...at('2026-09-01T00:00:00Z') }), toDisplay('b', { thread: 'u', ...at('2026-10-01T00:00:00Z') })];
  assert.equal(expired(rows, NOW).length, 0);
});

test('unread rows go to Priority, a click (seen_at) takes them out', () => {
  const unread = toDisplay('a', { thread: 't', ...at('2026-11-22T09:00:00Z') });
  const seen = toDisplay('b', { thread: 'u', ...at('2026-11-22T09:00:00Z'), seen_at: '2026-11-22T10:00:00Z' });
  const newerTurn = toDisplay('c', { thread: 'v', ...at('2026-11-22T11:00:00Z'), seen_at: '2026-11-22T10:00:00Z' });
  const working = toDisplay('d', { thread: 'w', state: 'working', updated_at: '2026-11-22T09:00:00Z' });
  assert.deepEqual([unread, seen, newerTurn, working].map(isPriority), [true, false, true, false]);
  const g = groups([unread, seen, newerTurn], NOW);
  assert.equal(g[0].label, 'Priority');
  assert.deepEqual(g[0].rows.map(r => r.thread), ['v', 't']);
  assert.deepEqual(g[1].rows.map(r => r.thread), ['u']);
});

test('the rest are grouped by day', () => {
  const seen = '2099-01-01T00:00:00Z';
  const g = groups([
    toDisplay('a', { thread: 'a', ...at('2026-11-22T09:00:00Z'), seen_at: seen }),
    toDisplay('b', { thread: 'b', ...at('2026-11-21T09:00:00Z'), seen_at: seen }),
  ], NOW);
  assert.deepEqual(g.map(x => x.label), ['Today', 'Yesterday']);
  assert.equal(dayLabel('nope', NOW), 'Unknown date');
});

test('a clock far in the future deletes nothing', () => {
  const rows = [toDisplay('a', { thread: 't', ...at('2026-11-20T00:00:00Z') }), toDisplay('b', { thread: 'u', ...at('2026-11-21T00:00:00Z') })];
  assert.deepEqual(expired(rows, Date.parse('2030-01-01T00:00:00Z')), []);
});

test('a clock 30 days ahead cannot age rows: 450 rows of 40 days, 1 fresh row', () => {
  const rows = [toDisplay('new', { thread: 'n', ...at('2026-11-22T00:00:00Z') })];
  for (let i = 0; i < 450; i++) rows.push(toDisplay('o' + i, { thread: 'o' + i, ...at('2026-10-13T00:00:00Z') }));
  const ahead = NOW + 30 * 86400000;
  assert.equal(expired(rows, ahead).length, 0);
  assert.equal(newest(rows, ahead).length, 451); // and they stay on screen
});

test('a wrong row time alone cannot delete: rows are measured from the earlier of the two', () => {
  const rows = [toDisplay('a', { thread: 'a', ...at('2026-11-20T00:00:00Z') })];
  assert.equal(expired(rows, Date.parse('2026-11-22T00:00:00Z')).length, 0);
});

test('deletes are capped by the budget the caller passes in', () => {
  const rows = [toDisplay('new', { thread: 'n', ...at('2026-11-22T00:00:00Z') })];
  for (let i = 0; i < MAX_DELETES + 50; i++) rows.push(toDisplay('o' + i, { thread: 'o' + i, ...at('2026-09-01T00:00:00Z') }));
  assert.equal(expired(rows, NOW).length, MAX_DELETES);
  assert.equal(expired(rows, NOW, 5).length, 5);
  assert.equal(expired(rows, NOW, 0).length, 0);
});

// The delete lock: TypeScript compares shapes, so a cast would get around the checked type.
// This fails on any cast to ExpiredIds in shipped code outside service.ts (tests may cast to fake a list).
test('nothing outside service.ts casts to ExpiredIds', () => {
  const dir = new URL('./', import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'service.ts');
  assert.ok(files.includes('connector.ts') && files.includes('manager.ts') && files.includes('client.ts')); // the scan is looking at the right files
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /\bas\s+(?:unknown\s+as\s+)?ExpiredIds\b|<\s*ExpiredIds\s*>\s*[\w(\[]/, f + ' casts to ExpiredIds');
  }
  // and the one place that makes it still does
  assert.match(readFileSync(new URL('service.ts', dir), 'utf8'), /as unknown as ExpiredIds/);
});

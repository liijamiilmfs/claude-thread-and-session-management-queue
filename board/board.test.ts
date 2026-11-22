import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDisplay, newest, groups, isPriority, dayLabel, expired, MAX_DELETES } from './board.ts';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const at = (iso: string) => ({ state: 'finished', updated_at: iso });

// One made-up row of each shape the board must read.
const old = { thread: 's1', title: 'Old shape', state: 'finished', updated_at: '2026-11-22T09:00:00Z', preview: 'p', url: 'https://claude.ai/code/s1' };
const t8 = { ...old, thread: 's2', project: 'Proj', gate: 't8-plugin' };
const modern = { ...old, thread: 's3', project: 'Proj', build: '0.1.0' };

test('reads every older row shape', () => {
  const a = toDisplay('d1', old), b = toDisplay('d2', t8), c = toDisplay('d3', modern);
  assert.equal(a.project, ''); assert.equal(a.build, '');
  assert.equal(b.project, 'Proj'); assert.equal(b.build, '');
  assert.equal(c.build, '0.1.0');
});

test('title falls back, state maps to a label', () => {
  assert.equal(toDisplay('d', { updated_at: 'x' }).title, 'Untitled');
  assert.equal(toDisplay('d', { state: 'review', updated_at: 'x' }).stateLabel, 'Ready for review');
  assert.equal(toDisplay('d', { state: 'zzz', updated_at: 'x' }).stateLabel, 'Unknown');
});

test('markup in title and preview stays as plain text', () => {
  const r = toDisplay('d', { title: '<img src=x onerror=alert(1)>', preview: '**bold** <b>x</b>', ...at('2026-11-22T09:00:00Z') });
  assert.equal(r.title, '<img src=x onerror=alert(1)>');
  assert.equal(r.preview, '**bold** <b>x</b>');
});

test('only a claude.ai link is followed', () => {
  for (const url of ['http://claude.ai/x', 'https://evil.example/https://claude.ai/', 'javascript:alert(1)', undefined])
    assert.equal(toDisplay('d', { url, ...at('x') }).link, '');
  assert.equal(toDisplay('d', { url: 'https://claude.ai/code/s', ...at('x') }).link, 'https://claude.ai/code/s');
});

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
    toDisplay('c', { thread: 'v', state: 'finished' }), // no time: never deleted
  ];
  assert.deepEqual(newest(rows, NOW).map(r => r.thread), ['u']);
  assert.deepEqual(expired(rows, NOW), ['a']);
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

test('one pass deletes at most MAX_DELETES rows', () => {
  const rows = [toDisplay('new', { thread: 'n', ...at('2026-11-22T00:00:00Z') })];
  for (let i = 0; i < MAX_DELETES + 50; i++) rows.push(toDisplay('o' + i, { thread: 'o' + i, ...at('2026-09-01T00:00:00Z') }));
  assert.equal(expired(rows, NOW).length, MAX_DELETES);
});

test('importing the script touches no document', () => {
  assert.equal(typeof document, 'undefined');
});

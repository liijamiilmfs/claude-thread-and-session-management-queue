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
  assert.equal(expired(rows, Date.parse('2030-01-01T00:00:00Z')).length, 0);
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
// Shipped board code (not tests) must not cast to ExpiredIds, use `any` or `unknown` casts, or switch off type checks.
// Only service.ts may make an ExpiredIds, and only with Object.assign.
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); // comments may use the words
}

const BANNED: [RegExp, string][] = [
  [/\bany\b/, 'any'],
  [/\bas\s+(?:unknown|never)\b/, 'as unknown or as never'],
  [/\bas\s+ExpiredIds\b|<\s*ExpiredIds\s*>\s*[\w(\[]/, 'a cast to ExpiredIds'],
  [/@ts-(?:ignore|expect-error|nocheck)/, 'a type check switch-off'],
];

function shipped(): { name: string; src: string }[] {
  const dir = new URL('./', import.meta.url);
  return readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map(name => ({ name, src: code(readFileSync(new URL(name, dir), 'utf8')) }));
}

test('shipped board code has no escape hatches around the delete lock', () => {
  const files = shipped();
  const names = files.map(f => f.name);
  assert.ok(['connector.ts', 'manager.ts', 'client.ts', 'service.ts', 'main.ts'].every(n => names.includes(n))); // scanning the right files
  for (const { name, src } of files) for (const [re, what] of BANNED) assert.doesNotMatch(src, re, `${name} uses ${what}`);
  // the lock is a property called `cleared`: nobody else may build or name one
  for (const { name, src } of files) if (name !== 'model.ts' && name !== 'service.ts') assert.doesNotMatch(src, /\bcleared\b/, `${name} mentions the lock property`);
});

test('the lock test catches a cast to any on the way into removeRows', () => {
  const bad = code("void manager.removeRows(['x'] as any);\nconst y = z as unknown as ExpiredIds; // ok in a comment? no, code\n");
  assert.ok(BANNED.some(([re]) => re.test(bad)));
  assert.match(bad, /as any/);
  for (const sample of ["f(['x'] as any)", 'f(<any>ids)', 'let v: any = 1', 'x as unknown as ExpiredIds', 'x as ExpiredIds', '// @ts-ignore\nf(1)']) {
    assert.ok(BANNED.some(([re]) => re.test(sample)), sample + ' was not caught');
  }
  assert.ok(!BANNED.some(([re]) => re.test(code('// a comment about any cast\nconst ok = 1;'))));
});

test('the only ExpiredIds is made inside service.ts', () => {
  const src = code(readFileSync(new URL('service.ts', import.meta.url), 'utf8'));
  assert.match(src, /Object\.assign\(ids, \{ cleared: 'expired' as const \}\)/);
});

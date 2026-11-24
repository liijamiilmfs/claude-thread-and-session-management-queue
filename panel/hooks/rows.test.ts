// The panel's pure rules (ADR-0002, P1, P4, P5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_THREADS, age, newestPerThread, openCommand } from './rows.ts';
import type { Row } from './rows.ts';

const row = (thread: string, at: number, title = 'A title'): Row => ({ thread, title, project: 'P', state: 'review', at, preview: '' });
const WORDS = ['C:\\Windows\\System32\\rundll32.exe', 'url.dll,FileProtocolHandler'];

test('P1: the newest row of each thread, newest first', () => {
  const picked = newestPerThread([row('session_a', 10, 'old a'), row('session_b', 30), row('session_a', 20, 'new a'), row('session_c', 5)]);
  assert.deepEqual(picked.shown.map((r) => [r.thread, r.at, r.title]), [['session_b', 30, 'A title'], ['session_a', 20, 'new a'], ['session_c', 5, 'A title']]);
  assert.equal(picked.more, 0);
});

test('P1: at most 50 threads are shown, and the rest are counted', () => {
  const many = Array.from({ length: 60 }, (_, i) => row('session_' + i, i));
  const picked = newestPerThread(many);
  assert.equal(MAX_THREADS, 50);
  assert.equal(picked.shown.length, 50);
  assert.equal(picked.shown[0]!.thread, 'session_59');
  assert.equal(picked.more, 10);
});

test('P4, P5: a thread id in the right shape gives exactly the three fixed words', () => {
  const command = openCommand('session_017RufJU7YSX5i3PXEWfCe3h', 'Windows_NT');
  assert.deepEqual(command?.argv, [...WORDS, 'claude://claude.ai/code/session_017RufJU7YSX5i3PXEWfCe3h']);
});

test('P4: any other id gives no command', () => {
  const hostile = [
    '', 'session_', 'session_a b', 'session_a&calc', 'session_a"', "session_a'", 'session_a;b', 'session_a/../b', 'session_a%20b', 'session_a\nb',
    'session_a b" & calc.exe "', ' session_abc', 'session_abc ', 'Session_abc', 'cse_017RufJU7YSX5i3PXEWfCe3h', 'local_2e1eb5a4', 'session_' + 'a'.repeat(57),
    'https://evil.example/session_abc', 'claude://claude.ai/code/session_abc', 'session_abc?x=1', 'session_abc#x', 'session_\u00e9', 'session_a\u0000',
    undefined, null, 42, {}, ['session_abc'], { toString: () => 'session_abc' },
  ];
  for (const id of hostile) assert.equal(openCommand(id, 'Windows_NT'), undefined, JSON.stringify(id));
  // The longest id that fits: 64 characters in all.
  assert.ok(openCommand('session_' + 'a'.repeat(56), 'Windows_NT'));
});

test('P5: off Windows there is no command', () => {
  for (const sysname of ['Linux', 'Darwin', '', 'windows_nt', 'Windows_NT ', 'Windows', undefined, null, 1]) {
    assert.equal(openCommand('session_017RufJU7YSX5i3PXEWfCe3h', sysname), undefined, String(sysname));
  }
});

test('the age is short and never negative', () => {
  const now = 1_800_000_000_000;
  assert.equal(age(now, now + 5000), 'now');
  assert.equal(age(now, now - 59_000), 'now');
  assert.equal(age(now, now - 60_000), '1m');
  assert.equal(age(now, now - 59 * 60_000), '59m');
  assert.equal(age(now, now - 3 * 3_600_000), '3h');
  assert.equal(age(now, now - 49 * 3_600_000), '2d');
});

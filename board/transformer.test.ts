import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDisplay } from './transformer.ts';


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

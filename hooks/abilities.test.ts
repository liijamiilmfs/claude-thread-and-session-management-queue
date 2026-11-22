// The plugin may do only what was approved. This runs `claude plugin validate` and
// compares what it says the module hooks, calls and touches with the approved lists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Approved lists. RUL-3168 replaces these with the lasting list in ADR-0001 section 3.
const approved: Record<string, string> = {
  hooks: 'nothing',
  calls: 'nothing on $',
};

const run = spawnSync('claude', ['plugin', 'validate', '.'], { encoding: 'utf8' });
const missing = run.error !== undefined;

test(
  missing ? 'plugin abilities (SKIPPED: the claude command is not on this machine)' : 'plugin abilities match the approved lists',
  { skip: missing },
  () => {
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const found: Record<string, string> = {};
    for (const m of run.stdout.matchAll(/^\s*> \.\/register\.ts (hooks|calls|env reads|env writes): (.*)$/gm)) {
      found[m[1]!] = m[2]!.trim();
    }
    assert.deepEqual(found, approved);
  },
);

// Needs no claude command, so CI runs it. Catches what validate cannot see: plain fetch, process, eval, imports.
test('the empty module has no import, no outside call and no hook', () => {
  const src = readFileSync(new URL('./register.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^\s*import\b|\brequire\(|\bimport\(|\bfetch\(|\bprocess\.|\beval\(|\bon\(/m);
});

// The panel may do only what was approved. This runs `claude plugin validate` on the panel's folder and
// compares what it says the module hooks and calls with the approved lists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Approved lists: ADR-0002 Section 3. A change here needs the decision record changed first.
const approved: Record<string, string> = {
  hooks: 'session.start, command.run{command=thread-queue}, ui.render{component=Pane, requestId=thread-queue}',
  calls: '$.clock.after, $.clock.every, $.clock.now, $.command.register, $.process.run, $.session.machine, $.tool.call, $.ui.invalidate, $.ui.open, $.ui.panes, $.ui.resolve',
};

// As in hooks/abilities.test.ts: CI names the checked claude file in CLAUDE_BIN, and there a missing one fails. It never skips.
const inCI = Boolean(process.env.CI);
const bin = process.env.CLAUDE_BIN;
const approvedProvides = ['modules: hooks/register.ts'];

const run = spawnSync(bin ?? 'claude', ['plugin', 'validate', fileURLToPath(new URL('..', import.meta.url))], { encoding: 'utf8' });
const missing = run.error !== undefined;

test(
  missing && !inCI ? 'panel abilities (SKIPPED: the claude command is not on this machine)' : 'panel abilities match the approved lists',
  { skip: missing && !inCI },
  () => {
    assert.ok(!inCI || bin, 'in CI, CLAUDE_BIN must name the claude file that was checked against the recorded hash');
    assert.equal(run.error, undefined, 'the claude command did not run, and in CI this check may not be skipped');
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const found: Record<string, string> = {};
    for (const m of run.stdout.matchAll(/^\s*[>❯] \.\/register\.ts (hooks|calls|env reads|env writes): (.*)$/gmu)) {
      // The command also names the function each call sits in, and the hooks' default matcher. The list is about what is hooked and called.
      found[m[1]!] = m[2]!.replace(/ \((?:via|default matcher key:) [^)]*\)/g, '').trim();
    }
    // No env line at all: the panel reads and writes no environment variable.
    assert.deepEqual(found, approved);
    const provides = /^Provides:\n\n((?:[ \t]*[>❯] .*\n)+)/mu.exec(run.stdout)?.[1] ?? '';
    assert.deepEqual(
      provides.split('\n').filter(Boolean).map((line) => line.replace(/^\s*[>❯] /u, '')),
      approvedProvides,
    );
  },
);

test('hooks.json names only the one module', () => {
  const hooksFile: unknown = JSON.parse(readFileSync(new URL('./hooks.json', import.meta.url), 'utf8'));
  assert.deepEqual(hooksFile, { modules: ['./register.ts'] });
});

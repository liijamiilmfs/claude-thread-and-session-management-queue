// The plugin may do only what was approved. This runs `claude plugin validate` and
// compares what it says the module hooks, calls and touches with the approved lists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Approved lists: the lasting list in ADR-0001 section 3. A change here needs the decision record changed first.
const TOOLS = ['post_message', 'request_decision', 'post_widget', 'suggest_connectors', 'connect_device', 'start_remote_control', 'set_thread_resolved', 'show_helpline_card'];
const approved: Record<string, string> = {
  hooks: 'tool.call{tool=' + [...TOOLS.map((t) => 'mcp__hearthbot__' + t), 'PushNotification'].join('|') + '}, turn.complete',
  calls: '$.clock.after, $.clock.now, $.env.get, $.mcp.call, $.model.complete, $.store.get, $.store.set, $.tool.call, $.ui.log',
  'env reads': 'CLAUDE_CODE_REMOTE_SESSION_ID',
  'env writes': 'nothing',
};

// CI installs the claude command (RUL-3207) and names the checked file in CLAUDE_BIN.
// There the test runs that exact file, never a "claude" found by name, and a missing one fails. It never skips.
const inCI = Boolean(process.env.CI);
const bin = process.env.CLAUDE_BIN;
// The whole "Provides:" list of `claude plugin validate`. One hooks module and nothing else.
const approvedProvides = ['modules: hooks/register.ts'];

const run = spawnSync(bin ?? 'claude', ['plugin', 'validate', '.'], { encoding: 'utf8' });
const missing = run.error !== undefined;

test(
  missing && !inCI ? 'plugin abilities (SKIPPED: the claude command is not on this machine)' : 'plugin abilities match the approved lists',
  { skip: missing && !inCI },
  () => {
    assert.ok(!inCI || bin, 'in CI, CLAUDE_BIN must name the claude file that was checked against the recorded hash');
    assert.equal(run.error, undefined, 'the claude command did not run, and in CI this check may not be skipped');
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const found: Record<string, string> = {};
    // The line marker is ">" on a plain Linux console (TERM=linux) and "❯" everywhere else, CI included.
    for (const m of run.stdout.matchAll(/^\s*[>❯] \.\/register\.ts (hooks|calls|env reads|env writes): (.*)$/gmu)) {
      // The command also names the function each call sits in. The list is about what is called, not where.
      found[m[1]!] = m[2]!.replace(/ \(via [^)]*\)/g, '').trim();
    }
    assert.deepEqual(found, approved);
    // Everything the plugin provides, not only the module's lines. A command hook in hooks.json or
    // plugin.json, a second hooks file, a command, a skill or a server would show up here.
    const provides = /^Provides:\n\n((?:[ \t]*[>❯] .*\n)+)/mu.exec(run.stdout)?.[1] ?? '';
    assert.deepEqual(
      provides.split('\n').filter(Boolean).map((line) => line.replace(/^\s*[>❯] /u, '')),
      approvedProvides,
    );
  },
);

// Needs no claude command. The hooks file names the one module and nothing else, so no command hook sits beside it.
test('hooks.json names only the one module', () => {
  const hooksFile: unknown = JSON.parse(readFileSync(new URL('./hooks.json', import.meta.url), 'utf8'));
  assert.deepEqual(hooksFile, { modules: ['./register.ts'] });
});

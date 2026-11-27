// The source test for the panel (ADR-0002, Section 3): a plain test on the text of the panel's files.
// It needs no claude command, so it runs everywhere. It catches what the abilities check cannot see.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (name: string) => readFileSync(new URL('./' + name, import.meta.url), 'utf8');
const register = read('register.ts');
const rows = read('rows.ts');
const transformer = read('transformer.ts');
const count = (text: string, part: string) => text.split(part).length - 1;

// The sections of register.ts, by the comment that names each role.
const ROLES = ['Composition Root', 'Controller', 'Service', 'Manager', 'Gateway', 'Connector'];
const sections: Record<string, string> = {};
for (const [i, part] of register.split(/^\/\/ ---- /m).entries()) {
  if (i > 0) sections[part.slice(0, part.indexOf(':'))] = part;
}
const functionsOf = (role: string) => [...sections[role]!.matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]!);

test('each section of register.ts starts with a comment naming its role, in the road\'s order', () => {
  assert.deepEqual(Object.keys(sections), ROLES);
});

test('P2: one board call, in the Connector, written out in full, in a function that takes nothing from its caller', () => {
  assert.equal(count(register, '$.tool.'), 1, 'no other $.tool use');
  assert.equal(count(sections.Connector!, "$.tool.call({ tool: 'ArtifactData', action: 'query', url: 'https://claude.ai/artifact/ByotUv4ViCSyFxtHF5cbNG', collection: 'turns', query: { order_by: { field: 'updated_at', direction: 'desc' }, limit: 500 } })"), 1);
  assert.match(sections.Connector!, /^function readBoard\(\$: Api\): Promise<RawRead> \{$/m);
});

test('P6: the panel never writes to the board', () => {
  for (const write of ["'set'", "'update'", "'delete'", "'batch'", 'if_version', 'doc_id']) assert.equal(count(register + rows + transformer, write), 0, write);
});

test('P5: one command, in the Connector, and its run function accepts only a checked command', () => {
  assert.equal(count(register, '$.process.'), 1, 'no other $.process use');
  assert.equal(count(sections.Connector!, '$.process.run([program, entry, link], { timeoutMs: RUN_LIMIT_MS })'), 1);
  assert.match(sections.Connector!, /^async function run\(\$: Api, command: CheckedCommand\): Promise<number> \{$/m);
  assert.match(sections.Gateway!, /^async function openInApp\(\$: Api, command: CheckedCommand\): Promise<boolean> \{$/m);
  // The compare stands between the function's first line and the run.
  const body = sections.Connector!.slice(sections.Connector!.indexOf('async function run('));
  for (const check of ['words.length !== 3', "program !== 'C:\\\\Windows\\\\System32\\\\rundll32.exe'", "entry !== 'url.dll,FileProtocolHandler'", '/^claude:\\/\\/claude\\.ai\\/code\\/session_[A-Za-z0-9]{1,56}$/.test(link)']) {
    const at = body.indexOf(check);
    assert.ok(at > 0 && at < body.indexOf('$.process.run('), check);
  }
});

test('P5: no cast to the checked command type outside rows.ts, and only openCommand makes one', () => {
  assert.doesNotMatch(register + transformer, /as\s+CheckedCommand|<CheckedCommand>|as\s+any\b|as\s+unknown\s+as|as\s+never|@ts-/);
  assert.equal(count(rows, 'as CheckedCommand'), 1);
  assert.equal(count(rows, 'builtByTheRule'), 2);
  assert.equal(count(register, 'openCommand('), 1);
  assert.equal(count(sections.Service!, 'openCommand('), 1);
});

test('P9: each undocumented piece is one value in rows.ts, and the Connector holds its own copy for the compare', () => {
  for (const piece of ['claude://claude.ai/code/', 'url.dll,FileProtocolHandler']) assert.equal(count(rows, piece), 1, piece);
  assert.equal(count(register, 'url.dll,FileProtocolHandler'), 1);
  assert.equal(count(sections.Connector!, 'url.dll,FileProtocolHandler'), 1);
});

test('P7, P10: nothing the decision record does not allow', () => {
  for (const banned of ['$.http', '$.fs', '$.store', '$.env', '$.model', '$.mcp', '$.agent', '$.prompt', '$.process.spawn', '$.process.hookEnv', '$.command.run', '$.command.list', '$.tool.list', '$.tool.check', '$.tool.register', '$.ui.log', '$.ui.toast', '$.ui.notify', '$.ui.copy', '$.settings', '$.wasm']) {
    assert.equal(count(register, banned), 0, banned);
  }
  // Plain JavaScript ways out that the checker does not list.
  // `process.` is Node's own object here. The one allowed `$.process.run` is counted above.
  assert.doesNotMatch(register + rows + transformer, /\brequire\(|\bimport\(|\bfetch\(|(?<!\$\.)\bprocess\.|\beval\(|\bFunction\(|globalThis|XMLHttpRequest|WebSocket|console\./);
});

test('rows.ts has no import, no $ and no clock, and transformer.ts imports only types from rows.ts', () => {
  assert.doesNotMatch(rows, /^\s*import\b/m);
  for (const file of [rows, transformer]) {
    assert.equal(count(file, '$.'), 0);
    assert.doesNotMatch(file, /Date\.now|new Date\(|performance\./);
  }
  assert.deepEqual(transformer.match(/^\s*import\b.*$/gm), ["import type { RawRead, Read, Row } from './rows.ts';"]);
  assert.doesNotMatch(transformer, /\bthrow\b/);
});

test('register.ts imports only rows.ts and transformer.ts, and only the Manager calls the Transformer', () => {
  assert.deepEqual(register.match(/^import .*$/gm)?.map((line) => /from '([^']+)'/.exec(line)?.[1]), ['./rows.ts', './rows.ts', './transformer.ts']);
  assert.match(sections.Manager!, /^import \{ readRows \} from '\.\/transformer\.ts';$/m);
  assert.equal(count(register, 'readRows('), 1);
  assert.equal(count(sections.Manager!, 'readRows('), 1);
});

test('the Service passes $ on and never calls anything on it, and never holds a raw answer', () => {
  assert.equal(count(sections.Service!, '$.'), 0);
  for (const raw of ['RawRead', 'readRows', 'readBoard(', 'run(']) assert.equal(count(sections.Service!, raw), 0, raw);
});

test('the layers call only what the record allows', () => {
  const rules = /import \{([^}]+)\} from '\.\/rows\.ts'/.exec(register)![1]!.split(',').map((name) => name.trim());
  const [service, manager, gateway, connector] = ['Service', 'Manager', 'Gateway', 'Connector'].map(functionsOf);
  assert.ok(rules.length > 0 && service!.length > 0 && manager!.length > 0 && gateway!.length > 0 && connector!.length > 0);
  const calls = (role: string, names: string[]) => names.filter((name) => new RegExp('\\b' + name + '\\(').test(sections[role]!.replace(/^(?:async )?function \w+/gm, '')));
  // The Controller calls only the Service: no rule, and nothing below the Service.
  assert.deepEqual(calls('Controller', [...rules, ...manager!, ...gateway!, ...connector!]), []);
  // The Service reaches the board through the Manager and the app through the Gateway, never the Connector.
  assert.deepEqual(calls('Service', connector!), []);
  // Nothing below the Service calls it or its rules, and the Manager and the Gateway do not call each other.
  for (const role of ['Manager', 'Gateway', 'Connector']) assert.deepEqual(calls(role, [...rules, ...service!]), [], role);
  assert.deepEqual(calls('Manager', gateway!), []);
  assert.deepEqual(calls('Gateway', manager!), []);
  assert.deepEqual(calls('Connector', [...manager!, ...gateway!]), []);
});

test('P5: the machine is asked in one place, and both the start and the command check for Windows', () => {
  assert.equal(count(register, '$.session.machine('), 1);
  assert.ok(count(sections.Controller!, "=== 'Windows_NT'") + count(sections.Controller!, "!== 'Windows_NT'") >= 2);
  assert.equal(count(rows, "sysname !== 'Windows_NT'"), 1);
});

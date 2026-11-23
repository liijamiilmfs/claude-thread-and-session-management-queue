// The source test (ADR-0001, Section 3): a plain test on the text of the plugin's files.
// It needs no claude command, so it runs everywhere. It catches what the abilities check cannot see.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (name: string) => readFileSync(new URL('./' + name, import.meta.url), 'utf8');
const register = read('register.ts');
const row = read('row.ts');
const transformer = read('transformer.ts');
const count = (text: string, part: string) => text.split(part).length - 1;

// The sections of register.ts, by the comment that names each role.
const ROLES = ['Composition Root', 'Controller', 'Service', 'Manager', 'Gateway', 'Connector'];
const sections: Record<string, string> = {};
for (const [i, part] of register.split(/^\/\/ ---- /m).entries()) {
  if (i > 0) sections[part.slice(0, part.indexOf(':'))] = part;
}

test('each section of register.ts starts with a comment naming its role, in the road\'s order', () => {
  assert.deepEqual(Object.keys(sections), ROLES);
});

test('one board call, and it is in the Connector', () => {
  assert.equal(count(register, '$.tool.call('), 1);
  assert.equal(count(sections.Connector!, '$.tool.call('), 1);
  assert.equal(count(register, '$.tool.'), 1, 'no other $.tool use, so no $.tool.list');
});

test('only the Connector touches the note', () => {
  assert.equal(count(register, '$.store.'), count(sections.Connector!, '$.store.'));
  assert.ok(count(sections.Connector!, '$.store.') > 0);
});

test('one model call and one kind of lookup, both in the Connector', () => {
  assert.equal(count(register, '$.model.'), 1);
  assert.equal(count(sections.Connector!, '$.model.complete('), 1);
  assert.equal(count(register, '$.mcp.'), 1);
  assert.equal(count(sections.Connector!, "$.mcp.call('claude-code-remote', 'get_session', "), 1);
});

test('transformer.ts has no $ and its only import is import type from row.ts', () => {
  assert.equal(count(transformer, '$.'), 0);
  assert.deepEqual(transformer.match(/^\s*import\b.*$/gm), ["import type { LookAnswer, Session } from './row.ts';"]);
  assert.doesNotMatch(transformer, /Date\.now|new Date\(|performance\.|\bthrow\b/);
});

test('the raw reply types are named only in the Connector and in transformer.ts, and only the Gateway calls the Transformer', () => {
  for (const raw of ['RawLook', 'RawSession']) {
    assert.ok(count(sections.Connector!, raw) > 0, raw);
    assert.equal(count(register, raw), count(sections.Connector!, raw), raw);
    assert.equal(count(row, raw), 0, raw);
  }
  for (const reader of ['readLook', 'readSession']) {
    assert.ok(count(sections.Gateway!, reader + '(') > 0, reader);
    assert.equal(count(register, reader), count(sections.Gateway!, reader), reader);
  }
  // The Connector hands each raw reply over wrapped in its named type, never as plain text.
  assert.match(sections.Connector!, /function ask\(\$: Api, [^)]*\): Promise<RawLook>/);
  assert.match(sections.Connector!, /function session\(\$: Api, [^)]*\): Promise<RawSession>/);
});

test('the Gateway\'s two functions return the answer types from row.ts, and it never saves or calls the Manager', () => {
  assert.deepEqual([...sections.Gateway!.matchAll(/^(?:async )?function (\w+)\([^)]*\): (.+) \{$/gm)].map((m) => [m[1], m[2]]), [['modelLook', 'Promise<LookAnswer>'], ['sessionNames', 'Promise<Names>']]);
  for (const type of ['LookAnswer', 'Names']) assert.match(row, new RegExp('^export type ' + type + ' = ', 'm'));
  const manager = [...sections.Manager!.matchAll(/^(?:async )?function (\w+)|^const (\w+) = \(/gm)].map((m) => m[1] ?? m[2]!);
  assert.ok(manager.length > 5);
  for (const name of [...manager, 'readNote', 'writeNote', 'send']) assert.doesNotMatch(sections.Gateway!, new RegExp('\\b' + name + '\\('), name);
});

test('nothing the decision record does not allow', () => {
  for (const banned of ['$.http', '$.process', '$.fs', '$.env.set', '$.prompt', '$.session', '$.agent', '$.model.fork', '$.model.classify', '$.tool.list', '$.tool.check', '$.tool.register', 'tool.judge', 'if_version', 'gate:']) {
    assert.equal(count(register, banned), 0, banned);
  }
  // Plain JavaScript ways out that the checker does not list.
  assert.doesNotMatch(register + row + transformer, /\brequire\(|\bimport\(|\bfetch\(|\bprocess\.|\beval\(|\bFunction\(|globalThis|XMLHttpRequest|WebSocket/);
  assert.equal(count(register, '$.env.get('), 1);
  assert.match(register, /\$\.env\.get\('CLAUDE_CODE_REMOTE_SESSION_ID'\)/);
});

test('row.ts has no import and no $', () => {
  assert.doesNotMatch(row, /^\s*import\b/m);
  assert.equal(count(row, '$.'), 0);
  assert.doesNotMatch(row, /Date\.now|new Date\(\)|performance\./);
});

test('register.ts imports only row.ts and transformer.ts', () => {
  assert.deepEqual(register.match(/^import .*$/gm)?.map((line) => /from '([^']+)'/.exec(line)?.[1]), ['./row.ts', './row.ts', './transformer.ts', './transformer.ts']);
  // The Transformer's readers are imported in the Gateway section, its raw types in the Connector section, as types only.
  assert.match(sections.Gateway!, /^import \{ readLook, readSession \} from '\.\/transformer\.ts';$/m);
  assert.match(sections.Connector!, /^import type \{ RawLook, RawSession \} from '\.\/transformer\.ts';$/m);
});

test('the Service passes $ on and never calls anything on it, and never holds a raw reply', () => {
  assert.equal(count(sections.Service!, '$.'), 0);
  for (const raw of ['RawLook', 'RawSession', 'readLook', 'readSession', 'ask(', 'session(']) assert.equal(count(sections.Service!, raw), 0, raw);
  // It reaches the Connector only through the Manager, so it never names anything of the Connector's.
  assert.equal(count(sections.Service!, 'SECOND_COMPARE_FAILED'), 0);
});

test('the Manager, the Gateway and the Connector hold no rule and never call the Service', () => {
  const rules = /import \{([^}]+)\} from '\.\/row\.ts'/.exec(register)![1]!.split(',').map((name) => name.trim());
  const service = [...sections.Service!.matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]!);
  assert.ok(rules.length > 0 && service.length > 0);
  for (const role of ['Manager', 'Gateway', 'Connector']) {
    for (const name of [...rules, ...service]) assert.doesNotMatch(sections[role]!, new RegExp('\\b' + name + '\\('), role + ' calls ' + name);
  }
  // The Controller calls only the Service: no rule from row.ts but reading the thread id, and no Manager or Connector function.
  const lower = ['Manager', 'Connector'].flatMap((role) => [...sections[role]!.matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]!));
  for (const name of [...rules.filter((r) => r !== 'threadOf'), ...lower]) assert.doesNotMatch(sections.Controller!, new RegExp('\\b' + name + '\\('), 'Controller calls ' + name);
});

test('no cast to the checked call type outside row.ts', () => {
  assert.doesNotMatch(register, /as\s+CheckedCall|<CheckedCall>|as\s+any\b|as\s+unknown\s+as|as\s+never|@ts-/);
  assert.equal(count(row, 'as CheckedCall'), 1);
  // The write functions accept only a checked call.
  assert.match(sections.Manager!, /function write\(\$: Api, call: CheckedCall\)/);
  assert.match(sections.Connector!, /function send\(\$: Api, call: CheckedCall\)/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, landed, projectOf, rowCall, rowFor, sessionOf, threadOf } from './row.ts';

const me = 'session_017RufJSQrvaboyxPpLCA3jU';
const at = 1795307400000;
const h = (name: string) => 'mcp__hearthbot__' + name;

test('each call that tells the person owes a row, and the tool picks the state', () => {
  const rows: [string, Record<string, unknown>, string, string][] = [
    [h('post_message'), { text: 'The fix is ready.' }, 'review', 'The fix is ready.'],
    ['PushNotification', { message: 'Build finished' }, 'review', 'Build finished'],
    [h('request_decision'), { question: 'Ship it today?', options: [] }, 'needs_you', 'Ship it today?'],
    [h('suggest_connectors'), { directory_uuids: ['x'] }, 'needs_you', 'Asked you to connect an app'],
    [h('connect_device'), { purpose: 'read' }, 'needs_you', 'Asked you to connect your computer'],
    [h('start_remote_control'), { instructions: 'secret words' }, 'needs_you', 'Asked to work on your computer'],
    [h('set_thread_resolved'), { resolved: true }, 'finished', 'Resolved'],
    [h('show_helpline_card'), {}, 'review', 'Replied'],
  ];
  for (const [tool, args, state, preview] of rows) assert.deepEqual(rowFor(tool, args), { state, preview }, tool);
});

test('a card with a button or a draft waits on the person, a chart does not', () => {
  const button = { blocks: [{ type: 'actions', elements: [{ type: 'button', id: 'go', label: 'Send' }] }] };
  assert.equal(rowFor(h('post_widget'), { widget: 'card', input: button, text: 'Reply to Avery' })?.state, 'needs_you');
  assert.equal(rowFor(h('post_widget'), { widget: 'message_compose_v1', input: {}, text: 'Draft for Avery' })?.state, 'needs_you');
  assert.equal(rowFor(h('post_widget'), { widget: 'writing_draft_v0', input: {}, text: 'Draft' })?.state, 'needs_you');
  assert.deepEqual(rowFor(h('post_widget'), { widget: 'chart_display_v0', input: { series: [] }, text: 'Sales by month' }), { state: 'review', preview: 'Sales by month' });
  assert.equal(rowFor(h('post_widget'), { widget: 'card', input: { blocks: [{ type: 'header', text: 'Done' }] }, text: 'Done' })?.state, 'review');
});

test('reopening a thread owes no row', () => {
  assert.equal(rowFor(h('set_thread_resolved'), { resolved: false }), undefined);
  assert.equal(rowFor(h('set_thread_resolved'), { resolved: 'true' }), undefined);
  assert.equal(rowFor(h('set_thread_resolved'), {}), undefined);
});

test('a call that tells the person nothing owes no row', () => {
  for (const tool of [h('react'), h('update_progress_checklist'), h('edit_message'), h('no_reply_needed'), h('message_coordinator'), h('rename_thread'), 'ArtifactData', 'Bash', 'mcp__other__post_message', '']) {
    assert.equal(rowFor(tool, { text: 'x', resolved: true }), undefined, tool);
  }
});

test('code never says "failed"', () => {
  for (const tool of ['post_message', 'request_decision', 'post_widget', 'suggest_connectors', 'connect_device', 'start_remote_control', 'set_thread_resolved', 'show_helpline_card']) {
    assert.notEqual(rowFor(h(tool), { text: 'The build failed', resolved: true })?.state, 'failed', tool);
  }
});

test('preview: the first line with text, trimmed, cut to 200 characters', () => {
  const preview = (text: unknown) => rowFor(h('post_message'), { text })?.preview;
  assert.equal(preview('\n\n  First line.  \nSecond line with the details.'), 'First line.');
  assert.equal(preview('x'.repeat(500)), 'x'.repeat(200));
  for (const none of ['', '  \n ', undefined, 7, { text: 'x' }]) assert.equal(preview(none), '');
});

test('the helpline row never repeats what was said', () => {
  assert.deepEqual(rowFor(h('show_helpline_card'), { text: 'private words' }), { state: 'review', preview: 'Replied' });
});

test('the row write: one fixed call, every field built by code', () => {
  assert.deepEqual(rowCall(me, at, { state: 'review', preview: 'The fix is ready.' }, 'Fix Safari export button', 'Some project'), {
    tool: 'ArtifactData', action: 'set', url: BOARD, collection: 'turns', doc_id: me + '.1795307400000',
    data: {
      thread: me, title: 'Fix Safari export button', project: 'Some project', state: 'review',
      updated_at: '2026-11-22T00:30:00.000Z', preview: 'The fix is ready.', url: 'https://claude.ai/code/' + me, gate: 't8-plugin',
    },
  });
  assert.equal(BOARD, 'https://claude.ai/artifact/ByotUv4ViCSyFxtHF5cbNG');
});

test('the row write: nothing without a thread id', () => {
  const told = { state: 'review', preview: 'p' };
  for (const thread of ['', 'unknown', 'cse_017RufJ', 'session_', 'session_x/../y']) assert.equal(rowCall(thread, at, told, 'T', 'P'), undefined, thread);
});

test('the row write: with no title the thread id stands in, so the row is never held back', () => {
  assert.equal(rowCall(me, at, { state: 'review', preview: 'p' }, '', 'P')!.data.title, me);
});

test('the row write: no project field when the name was not found, long names are cut', () => {
  const told = { state: 'review', preview: 'p' };
  assert.equal('project' in rowCall(me, at, told, 'T', '')!.data, false);
  const long = rowCall(me, at, told, 't'.repeat(300), 'p'.repeat(300))!.data;
  assert.equal(long.title.length, 200);
  assert.equal(long.project!.length, 200);
});

test('a write counts as on the board when it went through or the row is already there', () => {
  assert.equal(landed({ result: {}, text: 'ok' } as object), true);
  assert.equal(landed({ isError: true, text: 'db write failed (version_mismatch): turns/x already exists and this write carried no if_version' }), true);
  assert.equal(landed({ isError: true, text: 'network error' }), false);
  assert.equal(landed({ isError: true }), false);
  assert.equal(landed({ deny: 'refused by another plugin' }), false);
  assert.equal(landed({ deny: 'already exists' }), false);
});

test('title and parent come out of the session lookup, or nothing does', () => {
  const reply = (body: unknown, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(body) }], isError });
  assert.deepEqual(sessionOf(reply({ ccr: { title: 'Fix Safari export button', parent_session_id: 'session_p' } })), { title: 'Fix Safari export button', parent: 'session_p' });
  assert.deepEqual(sessionOf(reply({ ccr: { title: 'No parent' } })), { title: 'No parent' });
  for (const bad of [undefined, null, 'x', {}, { content: [] }, { content: [{ type: 'text', text: 'not json' }] }, reply({}), reply({ ccr: { title: 7 } }), reply({ ccr: { title: 'T' } }, true)]) {
    assert.deepEqual(sessionOf(bad), {});
  }
});

test('the project name is read from the main chat title, or left empty', () => {
  assert.equal(projectOf('Project coordinator ("Claude Project Priority Queue")'), 'Claude Project Priority Queue');
  assert.equal(projectOf('Project coordinator ("A "quoted" name")'), 'A "quoted" name');
  for (const other of [undefined, '', 'Fix Safari export button', 'Project coordinator', 'Project coordinator ("")']) assert.equal(projectOf(other), '');
});

test('thread id: cse_ becomes session_', () => {
  assert.equal(threadOf('cse_017RufJSQrvaboyxPpLCA3jU'), me);
});

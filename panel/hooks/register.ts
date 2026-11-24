// Thread Queue panel hooks module. Runs inside Claude Code, in local sessions on Windows only (ADR-0002).
// It shows the thread list in a pane. A press on a row opens that thread inside the desktop app.
// It only reads the board, and it runs one fixed command. It stores nothing and logs nothing.
// Every `$` call lives in this file. Each section below starts with a comment naming its role (ADR-0002, Section 4).
import { STATE_LABELS, age, newestPerThread, openCommand } from './rows.ts';
import type { CheckedCommand, RawRead, Read, Row, View } from './rows.ts';

type Args = Record<string, unknown>;
type Timer = { cancel(): void };
type Api = {
  clock: { now(): Promise<number>; after(ms: number, fn: () => void): Timer; every(ms: number, fn: () => void): Timer };
  command: { register(spec: { name: string; description: string }): Promise<unknown> };
  session: { machine(): Promise<{ sysname: string }> };
  ui: {
    open(pane: { id: string; title: string }): Promise<{ isPlaced: boolean; reason?: string }>;
    panes(): Promise<readonly { id: string }[]>;
    resolve(e: unknown): { Box: unknown; Text: unknown; Button: unknown };
    invalidate(event: 'ui.render'): void;
  };
  tool: { call(input: Args): Promise<unknown> };
  process: { run(argv: readonly string[], init: { timeoutMs: number }): Promise<{ exitCode: number }> };
};
type Next = (e: unknown) => Promise<unknown>;
type Hook = ($: Api, e: unknown, next: Next) => Promise<unknown>;
type On = (event: string, match: Args | Hook, hook?: Hook) => unknown;
// The element builder Claude Code gives every hooks module. JSX would compile to calls of it.
declare const h: (tag: unknown, props: Args | null, ...children: unknown[]) => unknown;

const COMMAND = 'thread-queue';
const PANE = 'thread-queue';

// ---- Composition Root: names the three hooks, the command and the pane, and wires the handlers. ----

export function register(on: On): void {
  on('session.start', async ($, e, next) => onSessionStart($, e, next));
  on('command.run', { command: COMMAND }, async ($) => onCommand($));
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => onRender($, e));
}

// ---- Controller: the handlers. It reads the clock and the machine's name, passes them in, and calls only the Service. ----

const REFRESH_MS = 120_000;
let ticking: Timer | undefined;

// The machine's name, or '' when it cannot be asked. Only 'Windows_NT' lets the panel do anything (P5).
async function machineName($: Api): Promise<string> {
  try {
    return (await $.session.machine()).sysname;
  } catch {
    return '';
  }
}

async function onSessionStart($: Api, e: unknown, next: Next): Promise<unknown> {
  try {
    if ((await machineName($)) === 'Windows_NT') {
      await $.command.register({ name: COMMAND, description: 'Show the thread list. A press on a row opens that thread in the app.' });
    }
  } catch {
    // The session starts either way. Without the command the panel stays idle.
  }
  return next(e);
}

async function onCommand($: Api): Promise<unknown> {
  // Off Windows the command is never registered. This is the same check once more.
  if ((await machineName($)) !== 'Windows_NT') return { text: 'Thread Queue panel: Windows only.' };
  try {
    const opened = await $.ui.open({ id: PANE, title: 'Thread Queue' });
    // Not awaited: the command does not wait for the read (P8).
    void onRefresh($);
    ticking ??= $.clock.every(REFRESH_MS, () => { void onTick($); });
    return opened.isPlaced ? {} : { text: 'Thread Queue: the pane could not be shown: ' + opened.reason };
  } catch (err) {
    return { text: 'Thread Queue: the pane could not be shown: ' + String(err).slice(0, 200) };
  }
}

// Every 2 minutes, and only while the pane is open. Once it is closed the timer stops.
async function onTick($: Api): Promise<void> {
  try {
    if ((await $.ui.panes()).some((pane) => pane.id === PANE)) return await onRefresh($);
  } catch {
    // The panes cannot be listed: stop reading.
  }
  ticking?.cancel();
  ticking = undefined;
}

// Every read comes through here: the command, the timer and the Refresh button. Off Windows it reads nothing (P5),
// wherever it was called from.
async function onRefresh($: Api): Promise<void> {
  if ((await machineName($)) !== 'Windows_NT') return;
  try {
    await refresh($, await $.clock.now());
  } catch {
    // A failed read is the Service's to report. Nothing here may reach the session.
  }
  $.ui.invalidate('ui.render');
}

// One press on a row's button: one command (P5). The thread id is the only thing that travels from the row.
async function onPress($: Api, thread: string): Promise<void> {
  try {
    await open($, thread, await machineName($));
  } catch {
    // The pane still renders again below.
  }
  $.ui.invalidate('ui.render');
}

// Rendering only: the Service's view as elements. Every text is a plain string in a Text or a Button.
async function onRender($: Api, e: unknown): Promise<unknown> {
  const { Box, Text, Button } = $.ui.resolve(e);
  const shown = view();
  return h(Box, { flexDirection: 'column' },
    // Not awaited: a press on Refresh does not wait for the read (P8).
    h(Button, { key: 'refresh', onPress: () => { void onRefresh($); } }, 'Refresh'),
    ...shown.lines.map((line) => h(Text, { dimColor: true }, line)),
    ...shown.rows.flatMap((row) => [
      h(Button, { key: 'open:' + row.thread, onPress: () => onPress($, row.thread) }, row.title, h(Text, { dimColor: true }, '  ' + row.detail)),
      ...(row.preview ? [h(Text, { dimColor: true }, row.preview)] : []),
    ]),
  );
}

// ---- Service: the conductor. It holds what the pane shows and decides the order of steps. ----
// The rules are functions in rows.ts. It passes `$` on and never calls anything on it. It only ever holds checked rows.

let rows: Row[] = [];
let leftOut = 0;
let asOf = 0;
let problem = '';
let said = '';
let reading: Promise<void> | undefined;

// One read at a time (P8). When the list cannot be read, the rows from the last good read stay and one line says so.
function refresh($: Api, now: number): Promise<void> {
  reading ??= (async () => {
    try {
      const read = await newestRows($);
      asOf = now;
      said = '';
      if (read === 'unreadable') {
        problem = 'The list could not be read.' + (rows.length ? ' These rows are from the last read that worked.' : '');
      } else {
        rows = read.rows;
        leftOut = read.leftOut;
        problem = '';
      }
    } finally {
      reading = undefined;
    }
  })();
  return reading;
}

const count = (n: number, one: string, many: string): string => n + ' ' + (n === 1 ? one : many);

function view(): View {
  const { shown, more } = newestPerThread(rows);
  const counts = count(shown.length, 'thread', 'threads')
    + (more ? ', ' + more + ' more on the board' : '')
    + (leftOut ? ', ' + count(leftOut, 'row', 'rows') + ' left out by the row check' : '');
  return {
    lines: [reading && !rows.length ? 'Reading the list...' : counts, problem, said].filter(Boolean),
    rows: shown.map((row) => ({
      thread: row.thread,
      title: row.title,
      detail: [row.project, STATE_LABELS[row.state] ?? row.state, age(asOf, row.at)].filter(Boolean).join(', '),
      preview: row.preview,
    })),
  };
}

// A press: the rule builds the checked command, or says no. Only a checked command goes on to the Gateway.
async function open($: Api, thread: string, sysname: string): Promise<void> {
  const command = openCommand(thread, sysname);
  if (!command) {
    said = sysname === 'Windows_NT' ? 'The thread could not be opened.' : 'Opening a thread works on Windows only.';
    return;
  }
  said = (await openInApp($, command)) ? 'Sent to the app.' : 'The thread could not be opened.';
}

// ---- Manager: the stored rows, read only. One operation, and no write. ----
// The raw answer goes straight from the Connector into the Transformer. Only checked rows go up.
import { readRows } from './transformer.ts';

async function newestRows($: Api): Promise<Read> {
  return readRows(await readBoard($));
}

// ---- Gateway: the one thing an outside system does for the panel, opening a thread in the desktop app. ----
// It accepts only a checked command and decides nothing about a row.

async function openInApp($: Api, command: CheckedCommand): Promise<boolean> {
  return (await run($, command)) === 0;
}

// ---- Connector: the only code that talks to the board and runs the command. It holds no rule. ----

const READ_LIMIT_MS = 15_000;
const RUN_LIMIT_MS = 10_000;
const NOT_RUN = -1;

// An outside call that never comes back must not hold the panel for good, so the read gets a time limit of its own.
function within<T>($: Api, ms: number, work: Promise<T>, late: T): Promise<T> {
  return new Promise<T>((done) => {
    const timer = $.clock.after(ms, () => done(late));
    work.then((out) => { timer.cancel(); done(out); }, () => { timer.cancel(); done(late); });
  });
}

// The one read (P2), written out in full. It takes nothing from its caller, so no value from a row can reach the call.
function readBoard($: Api): Promise<RawRead> {
  const late: RawRead = { answer: undefined };
  try {
    return within($, READ_LIMIT_MS, $.tool.call({ tool: 'ArtifactData', action: 'query', url: 'https://claude.ai/artifact/ByotUv4ViCSyFxtHF5cbNG', collection: 'turns', query: { order_by: { field: 'updated_at', direction: 'desc' }, limit: 500 } }).then((answer): RawRead => ({ answer })), late);
  } catch {
    return Promise.resolve(late);
  }
}

// The one command (P5). Right before the run, all three words are compared with the Connector's own fixed values once more.
// If one differs, nothing runs. The words are passed as a list, so no shell reads them.
async function run($: Api, command: CheckedCommand): Promise<number> {
  const words: readonly unknown[] = command.argv;
  const [program, entry, link] = words;
  if (words.length !== 3 || program !== 'C:\\Windows\\System32\\rundll32.exe' || entry !== 'url.dll,FileProtocolHandler') return NOT_RUN;
  if (typeof link !== 'string' || !/^claude:\/\/claude\.ai\/code\/session_[A-Za-z0-9]{1,56}$/.test(link)) return NOT_RUN;
  try {
    return (await $.process.run([program, entry, link], { timeoutMs: RUN_LIMIT_MS })).exitCode;
  } catch {
    return NOT_RUN;
  }
}

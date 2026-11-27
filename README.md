# Thread Queue

One list of your Claude project threads across every project, with freshly finished turns on top.

> [!NOTE]
> Status: building. There is nothing to install yet. The design is recorded in `docs/adr/adr-0001-thread-queue-architecture.md` and was accepted on 2026-11-22. A test build of the plugin wrote 37 rows from 10 threads in 3 projects by itself that morning. Josh approved the first build milestone the same day. The row rules are written and tested. The board page's code and the plugin's empty shell are merged. The plugin's hooks are not wired in yet.

## What it does

If you run several Claude projects at once, finding the threads that have finished a turn means opening each project and then its thread list. Thread Queue puts them all on one page.

- **Priority** on top: finished turns you have not opened yet, newest first.
- Below that, everything else grouped by day.
- Each row shows the thread title, the project name, a state and a short preview.
- A click opens the thread and clears the row from Priority.
- Four states: needs you, ready for review, finished, failed.

It covers cloud project threads only. The Claude desktop app already sorts local sessions by status.

## How it works

Two parts.

1. **The board** is one private Artifact page that you pin in Claude. It keeps one row per finished turn and updates by itself.
2. **The plugin** is a small Claude Code plugin, uploaded once to your account. It reaches every project.

Think of a clerk standing next to each thread's outbox. Each time the thread sends you something, the clerk writes one line in the board's log book. The clerk never touches the message and never stops it.

The clerk is code inside Claude Code. It finds the thread's title and project itself and writes the row with its own call. The thread's agent writes nothing and is asked for nothing, so a forgetful agent cannot lose a row. No turn is ever blocked.

Nothing is hosted, no network rule changes, and no secret is stored.

## Quick start

Not available yet. Planned steps:

1. Publish the board page and pin it.
2. Remove any older Thread Queue plugin from your account's Plugins page.
3. Upload the `thread-queue` plugin zip on the same page. It reaches every project, and running threads pick it up when they next wake.

## Usage

Open the pinned board. Work the Priority section from the top.

## The panel in the desktop app

A second plugin, for a Windows PC only. It shows the same list in a pane inside the Claude desktop app. A press on a row opens that thread in the app, not in a browser tab. It only reads the board. The design is in `docs/adr/adr-0002-thread-list-panel.md`.

Install it once:

1. Copy the folder `panel/` from a merged commit to a folder of its own, outside any checkout of this repository. For example `C:\Users\<you>\claude-plugins\thread-queue-panel`.
2. Set the user variable `CLAUDE_CODE_PLUGIN_DIRS` to that folder's full path. If the variable already names a folder, add this one after a `;`.
3. Restart the desktop app, so it sees the variable.

Use it:

1. In a local Code session, type `/thread-queue`. The pane opens and reads the list.
2. Press a row to open its thread in the app.
3. Press Refresh to read the list again. It also reads again every 2 minutes while the pane is open.

Its limits:

- Windows only. On any other machine it does nothing.
- It needs a session the desktop app started. In a plain terminal session it says the list could not be read.
- It shows the newest row of at most 50 threads, from the newest 500 rows. The board shows them all.
- A press in the pane does not clear the row from Priority on the board.
- Never upload it on the account Plugins page. Cloud threads must not load it.
- It rests on three things Anthropic and Microsoft have not documented: the link that opens a thread in the app, the Windows entry that runs the link, and the layout of the list's answer. If one changes, the pane says so in one line and nothing else breaks.
- To update it, copy `panel/` again from a newer merged commit.

## Configuration

None. Plugin settings do not reach cloud threads, so the board's address is fixed in the plugin's code.

## Development

The code is TypeScript. Claude Code loads the plugin's `.ts` files directly, so the plugin has no build step. Tests and the type check run on Node 24.22.3: `npm ci`, then `npm test` and `npm run typecheck`.

Agent and contributor rules are in `AGENTS.md`.

## Project layout

| Path | What it holds |
|---|---|
| `docs/adr/` | Decision records |
| `docs/agent-routing-contract.md` | A synced copy of the Rule 0 Softworks routing contract. Do not edit it here. |
| `.claude-plugin/`, `hooks/` | The plugin. The row rules and their tests are in `hooks/row.ts`. `hooks/register.ts` is an empty shell until the safety check is wired in. |
| `board/` | The board page: `index.html` and one TypeScript file per layer, started by `main.ts` |
| `panel/` | The panel plugin for the Windows desktop app. Its rules are in `panel/hooks/rows.ts`, its row check in `panel/hooks/transformer.ts` |

## Limits

- The main chat of each project gets no rows. It has no way to write to the board.
- Ways a thread reaches you without a tool call get no row: approval prompts, crashes, and messages sent outside the project app.
- If the board stays down until a thread's machine is shut down, that thread's waiting rows are lost with it.
- At most 500 rows wait at once, once that fix is built (20 before it). Past that, the oldest is dropped.
- A thread you stop mid-turn sends its row only after your next message.
- Another plugin that refuses the board write every time would stop rows from that thread.
- A lost row is silent. It shows only in the thread's own debug log, not on the board.
- Josh accepted some of these as known gaps. Four are marked to be fixed in the build (decision record, "What can still lose a row").
- The plugin works because your account has no organization guard. A move to a Team or Enterprise plan would block its board writes until an admin allows them.
- The project name comes from a title format Anthropic has not documented. If it changes, rows show no project.
- The plugin picks a row's state from what the thread did. A question asked in a plain reply shows as review, not needs you.
- A row leaves Priority when you click it on the board, not when you open the thread some other way.

## Support

Issues are tracked in Linear, in the Thread Queue project of the Rule0Softworks team.

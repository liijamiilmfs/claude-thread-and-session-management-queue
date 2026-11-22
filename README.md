# Thread Queue

One list of your Claude project threads across every project, with freshly finished turns on top.

> [!NOTE]
> Status: planning. There is nothing to install yet. The design is recorded in `docs/adr/adr-0001-thread-queue-architecture.md` and waits on Josh's approval. A test build of the plugin wrote 14 rows from 5 threads by itself on 2026-11-22.

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
| `.claude-plugin/`, `hooks/` | Planned: the plugin |
| `board/` | Planned: the board page |

## Limits

- The main chat of each project gets no rows. It has no way to write to the board.
- Ways a thread reaches you without a tool call get no row: approval prompts, crashes, and messages sent outside the project app.
- If the board stays down until a thread's machine is shut down, that thread's waiting rows are lost with it.
- At most 20 rows wait at once. Past that, the oldest is dropped.
- A thread you stop mid-turn sends its row only after your next message.
- Another plugin that refuses the board write every time would stop rows from that thread.
- A lost row is silent. It shows only in the thread's own debug log, not on the board.
- Only some of these losses have been accepted by Josh. The rest are open in the decision record (OPEN-007).
- The plugin works because your account has no organization guard. A move to a Team or Enterprise plan would block its board writes until an admin allows them.
- The project name comes from a title format Anthropic has not documented. If it changes, rows show no project.
- Who picks a row's state (needs you, review, finished) is still an open question for Josh.
- A row leaves Priority when you click it on the board, not when you open the thread some other way.

## Support

Issues are tracked in Linear, in the Thread Queue project of the Rule0Softworks team.

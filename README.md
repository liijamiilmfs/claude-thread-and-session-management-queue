# Thread Queue

One list of your Claude project threads across every project, with freshly finished turns on top.

> [!NOTE]
> Status: planning. There is nothing to install yet. The design is recorded in `docs/adr/adr-0001-thread-queue-architecture.md` and waits on four short tests. A prototype of both parts worked in one thread on 2026-11-21.

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
2. **The turnstile** is a small Claude Code plugin switched on in each project.

Think of a turnstile at an exit. When a thread has told you something and tries to end its turn, a hook checks for that thread's row on the board. No row, no exit: the hook hands back the exact row to write, and the turn ends only after the thread writes it.

The hook is code. It runs whether or not the agent remembers, which is the point. The agent only fills in the label: title, project, state and preview.

Nothing is hosted, no network rule changes, and no secret is stored.

## Quick start

Not available yet. Planned steps, to be confirmed by the Milestone 0 tests:

1. Publish the board page and pin it.
2. Switch the plugin on for each project and give it the board's address.

## Usage

Open the pinned board. Work the Priority section from the top.

## Configuration

Planned: one setting, the board's address. With no address set, the turnstile does nothing.

## Development

Agent and contributor rules are in `AGENTS.md`. Install and test commands arrive with the plugin skeleton. There are none today.

## Project layout

| Path | What it holds |
|---|---|
| `docs/adr/` | Decision records |
| `docs/agent-routing-contract.md` | A synced copy of the Rule 0 Softworks routing contract. Do not edit it here. |
| `hooks/`, `src/` | Planned: the turnstile plugin |
| `board/` | Planned: the board page |

## Limits

- A turn that dies from an error never reaches the turnstile, so it leaves no row.
- After two refusals in a row the turnstile lets the thread go, so a broken board can never trap a thread. That turn's row is missed.
- The label on a row is written by the agent. The hook checks that it is there, not that it is accurate.
- A row leaves Priority when you click it on the board, not when you open the thread some other way.

## Support

Issues are tracked in Linear, in the Thread Queue project of the Rule0Softworks team.

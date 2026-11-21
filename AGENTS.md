# AGENTS.md

## Agent routing contract

Before assigning or recommending an agent profile, or handling PR feedback,
read [the agent routing and capacity contract](docs/agent-routing-contract.md).
It is a synced copy. The master lives in Rule-0-Softworks/rule-0-softworks-platform. Do not edit it here.

A script in the master repository refreshes the copy through a pull request from the branch `sync/agent-routing-contract`. Keep this section and its link, because the script looks for the link.

## Project overview

Thread Queue gives Josh one list of his Claude cloud project threads across all projects, with freshly finished turns on top. It has two parts:

- **The board**: one private Artifact page with a small built-in database. One row per finished turn.
- **The turnstile**: a Claude Code plugin whose hooks block a thread from ending a turn in which it told the person something, until the thread has written its row to the board.

TypeScript. Plain JavaScript is not acceptable. Node runs the plugin's `.ts` files directly, so the plugin has no build step. The board's script is compiled with `tsc` when the board is published.

Status: planning. The repository has no code yet. Do not write code until Milestone 0 is done and `docs/adr/adr-0001-thread-queue-architecture.md` is Accepted. A working prototype from 2026-11-21 sits outside the repository, in the Claude project's shared folder under `thread-queue/prototype/`.

## Issue tracking

- Linear is the only source of truth for scope, acceptance criteria, milestones, status and priority.
- Team: Rule0Softworks, key `RUL`, id `760d907a-8c39-4018-ba0d-ce40568c749d`.
- Project: Thread Queue, id `5be580a6-d718-4095-b7fe-cc23b5b1f4dc`. Issues `RUL-3161` to `RUL-3173`.
- Resolve the team and project by these ids before any write. Do not match by name.
- Agents move issues only among Triage, Backlog, Todo and In Progress.
- Planning and implementation agents do not write to Linear. They hand an exact spec (id, field, new value) to a Haiku 5.5 worker, which makes the write and reports back.

## Approval and model routing

The routing contract governs who does what. Its rules that bind work here:

- Josh approves every issue before work starts. The tier is fixed at approval.
- Before work starts, state: purpose, scope and non-goals, files, tier and the evidence for it, the reviewer, how it can be undone, and how done is checked.
- When work stops, report: state, what changed, each acceptance criterion with its proof, validation and review results, what is left, the next decision for Josh, and the tier used.
- No agent reclassifies its own work, widens its issue, or merges a pull request.
- One writer in this repository at a time.

## Architecture

This repository follows the Software Layer Roles and Dependency Policy v2.0.0-rc.4 once ADR-0001 is Accepted. The ADR holds the classification record. The policy file is not copied into this repository. Its home and exact version are named in the ADR.

Planned plugin files, one per role:

| File | Role |
|---|---|
| `hooks/gate.ts` | Composition Root |
| `src/controller.ts` | Controller |
| `src/service.ts` | Service |
| `src/manager.ts` | Manager |
| `src/connector.ts` | Connector |
| `src/model.ts` | Model |

The board is a page, `board/index.html` (markup and styles only), and one script, `board/board.ts`. The script's sections are marked by comments naming the role: Client, Service, Connector, Transformer, Model.

Rules a reviewer checks:

- `src/service.ts` holds every gate rule. It does no file or network access, and reads no clock and no environment. Time and the board address are passed in.
- Only `src/connector.ts` touches the note file.
- `src/service.ts` never imports `src/connector.ts`. It reaches storage through `src/manager.ts`.
- Only `hooks/gate.ts` reads the environment and standard input.
- On the board, only the Connector section calls the page database, and only the Client section touches the document.
- Do not add a role, a folder, a dependency or a hosted service the ADR does not name. Change the ADR first.

TypeScript rules:

- Node only removes the types, so use only syntax that can be removed: no enums, no namespaces, no parameter properties.
- Import other files by their `.ts` name.
- Do not commit compiled `.js` files.
- `typescript` and `vitest` are development dependencies only. The plugin needs neither at run time.

## Gate rules

These are the product. Do not change one without a Linear issue that says so.

- A turn that told the person nothing owes no row.
- A turn that told the person something cannot end until a valid row write is seen.
- A row write counts only if it targets the board, the right collection, and has thread, title, state and time.
- After two blocks in a row the gate opens. A broken board must never trap a thread.
- With no board address set, the gate does nothing.

## Setup commands

Node 24 or later. Install with `npm ci`. Node runs TypeScript files directly, so there is no build step.

## Development workflow

Not defined yet. The plugin has no build step. `RUL-3169` defines the command that compiles the board's script at publish time.

## Testing instructions

Run `npm test` (Node's built-in test runner, files named `*.test.ts`) and `npm run typecheck`. Required coverage, from `RUL-3167`: one test for each gate rule above.

## Verification commands

| Class | Command | Note |
|---|---|---|
| `install` | `npm ci` | |
| `format` | Not defined yet | Added by `RUL-3166` |
| `type check` | Not defined yet | `RUL-3166` adds it. Planned: `tsc --noEmit`. |
| `lint` | Not defined yet | `RUL-3166` plans a plugin manifest check. There is no manifest to check today. |
| `typecheck` | `npm run typecheck` | Runs `tsc`, emits nothing |
| `test` | `npm test` | Runs `node --test` |
| `verify PR` | CI workflow | Typecheck plus test. Lint to come with `RUL-3166` |
| `verify release` | Does not apply | Nothing is packaged or published from this repository yet |
| `audit` | Code review against ADR-0001 | No automated architecture check |

Record each command you run with its name, text, result (`pass`, `fail` or `inconclusive`) and a short output summary.

## Pull request guidelines

Proposed, mirroring the Rule 0 Softworks platform repository. Confirm with Josh before relying on them.

- Conventional Commit prefixes such as `feat:`, `fix:` and `docs:`.
- No attribution lines in commits or pull request descriptions.
- Never force-push a shared branch, resolve review threads, or merge.

## Security and secrets

- A row holds the thread id, title, project name, state, time, a one-line preview and a link. Do not store or log prompts, full replies or tool input.
- Rows on the board are written by agents. Treat them as untrusted: show them as plain text, and follow a link only if it points at claude.ai.
- The turnstile makes no network calls and holds no secret. Adding either is a trust boundary change: stop and ask Josh.
- The gate's note file lives in the thread's scratch folder and holds three small values. Nothing else is written to disk.
- No secrets belong in this repository.

## Scope boundaries

Out of scope until a new ADR says otherwise:

- Local sessions.
- Any hosted service, or a network rule change in a cloud environment.
- A second place to record turns (the Milestone 3 safety net).
- A live "working" state on the board.
- Extra notifications.

## Temporary work

Keep scratch files out of the repository. Commit nothing generated.

## Troubleshooting

- A thread ends a turn with no row: check that the plugin is switched on for that project and that the board address is set. With no address the gate does nothing by design.
- A thread reports the gate blocked it twice and then let it go: the row write failed twice. Open the board and check that it loads.
- A hook seems not to fire: open the hooks menu in the session to see which hooks are registered.
- A hook fails with a syntax error on a `.ts` file: the machine's Node is too old to run TypeScript. Check `node -p process.features.typescript`. It printed `strip` on Node v22.23.5.

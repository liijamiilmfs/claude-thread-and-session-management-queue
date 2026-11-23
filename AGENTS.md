# AGENTS.md

## Agent routing contract

Before assigning or recommending an agent profile, or handling PR feedback,
read [the agent routing and capacity contract](docs/agent-routing-contract.md).
It is a synced copy. The master lives in Rule-0-Softworks/rule-0-softworks-platform. Do not edit it here.

A script in the master repository refreshes the copy through a pull request from the branch `sync/agent-routing-contract`. Keep this section and its link, because the script looks for the link.

## Project overview

Thread Queue gives Josh one list of his Claude cloud project threads across all projects, with freshly finished turns on top. It has two parts:

- **The board**: one private Artifact page with a small built-in database. One row per finished turn.
- **The plugin** (`thread-queue`): a Claude Code plugin with one hooks module. Each time a thread tells the person something, the module's own code writes the thread's row to the board. The thread's model writes nothing, and no turn is ever blocked.

TypeScript. Plain JavaScript is not acceptable. Claude Code loads the module's `.ts` files directly, so the plugin has no build step. The board's files are compiled with `tsc` when the board is published.

Status: building Milestone 1. `docs/adr/adr-0001-thread-queue-architecture.md` was Accepted on 2026-11-22, and Josh approved Milestone 1 the same day. Write code only under an issue Josh has approved, at its approved tier. The row rules are in `hooks/row.ts` with their tests. Milestone 2 is not approved. Milestone 0 evidence is in the Claude project's shared folder under `thread-queue/m0-evidence/`. The live-tested build (T8) is on branch `claude/project-thread-5rsmom`, which is never merged. An older plain JavaScript prototype sits under `thread-queue/prototype/`.

## Issue tracking

- Linear is the only source of truth for scope, acceptance criteria, milestones, status and priority.
- Team: Rule0Softworks, key `RUL`, id `760d907a-8c39-4018-ba0d-ce40568c749d`.
- Project: Thread Queue, id `5be580a6-d718-4095-b7fe-cc23b5b1f4dc`. Issues start at `RUL-3161`. New ones are added as work is found, so read the project's issue list in Linear, not a range.
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

## Safety beats simple

Josh's standing rule (2026-11-22, ADR-0001 CTX-041): "Safety always wins."

- Where a simpler way and a safer way both exist, build the safer one and recommend the safer one.
- Never pick or recommend the simpler way because it is simpler. Simple only breaks a tie between ways that are equally safe.
- State what the safer way costs (money, delay, moving parts) in plain words. The cost does not flip the pick.
- If the safer way needs something your issue does not allow, stop and report. Do not fall back to the simpler way.
- The other hard rule holds at the same time: no row may be lost by chance. A safety control that can lose a row is not acceptable either.

## Architecture

This repository follows the Software Layer Roles and Dependency Policy v2.0.0-rc.4 (ADR-0001, Accepted 2026-11-22). The ADR holds the classification record. The policy file is not copied into this repository. Its home and exact version are named in the ADR.

Plugin files (ADR-0001, Section 5). `hooks/register.ts` is an empty shell until `RUL-3168` fills its sections:

| File | Role |
|---|---|
| `.claude-plugin/plugin.json` | Manifest (not governed) |
| `hooks/hooks.json` | Points Claude Code at the module (not governed) |
| `hooks/register.ts` | Sections: Composition Root, Controller, Service, Manager, Gateway, Connector |
| `hooks/transformer.ts` | Transformer: reads the model's answer and the lookup's answer. Built under `RUL-3168` |
| `hooks/row.ts` | The Service's rules (its owned support) and Model |

Claude Code lets the `$` object be passed only to top-level functions of the module's own file, so every `$` call lives in `hooks/register.ts`. Its sections are marked by comments naming the role. It is the only file that holds more than one role. `hooks/transformer.ts` uses no `$`, so it is a file of its own. Everywhere else, one file holds one layer (Josh, 2026-11-22, ADR-0001 CTX-049).

The board is a page, `board/index.html` (markup and styles only), and one TypeScript file per layer (ADR-0001, Section 5). Each file starts with a comment naming its role.

| File | Role |
|---|---|
| `board/main.ts` | Composition Root (the startup file) |
| `board/client.ts` | Client (rendering only) |
| `board/service.ts` | Service |
| `board/manager.ts` | Manager |
| `board/connector.ts` | Connector |
| `board/transformer.ts` | Transformer |
| `board/model.ts` | Model |

Rules a reviewer checks:

- `hooks/row.ts` holds every row rule. It imports nothing, does no file or network access, and reads no clock and no environment. Time and the thread id are passed in.
- The Controller section calls only the Service section. The Service section runs the safety check and decides the order of steps. The Manager, the Gateway and the Connector never call it.
- The Service section reaches the waiting rows and the board only through the Manager section. It reaches the two outside systems, the model's look and the `get_session` lookup, only through the Gateway section (Josh, 2026-11-22, ADR-0001 CTX-052).
- The Gateway section saves nothing, decides nothing about a row, and never calls the Manager. Saving rows stays on the road Service, Manager, Connector.
- The last look returns a checked call, a branded type only `hooks/row.ts` can make. The Manager's and the Connector's write functions accept only that type. No cast to it appears outside `hooks/row.ts`.
- Only the Service section calls the functions in `hooks/row.ts`.
- `hooks/transformer.ts` reads outside text: the model's answer and the `get_session` lookup's answer. It uses no `$`, its only import is `import type` from `hooks/row.ts`, and it never throws. Only the Gateway section calls it (Josh, 2026-11-23, ADR-0001 CTX-055).
- The Gateway hands the Service only the Transformer's answer. For the model's look: `fine`, `hide-title`, `hide-preview`, `hide-both` or `unreadable`. For the lookup: the title and the project as text, or `not-found`. The Service section never names a raw reply type and never calls `hooks/transformer.ts`.
- The model's raw reply and the lookup's raw reply each have their own named type, never a plain `string`. Only the Connector section makes them and only `hooks/transformer.ts` reads them. The answer types are Model types in `hooks/row.ts`, and the Gateway's two functions declare them as their return types.
- What each answer does to a row stays a rule in `hooks/row.ts`.
- The Service section passes `$` on and never calls anything on it.
- Only the Connector section of `hooks/register.ts` calls `$.store`, `$.tool.call`, `$.mcp.call` and the one `$.model` call. Right before `$.tool.call` it compares the tool, the action, the address and the collection with the constants once more (the second compare).
- `$.tool.list` is not on the list of what the module may do (Josh, 2026-11-22, ADR-0001 OPEN-011).
- `$.tool.call(` appears once in `hooks/register.ts`. `$.model.` appears once. `$.model.fork` never appears.
- Only `hooks/register.ts` calls `$.env.get` and `$.clock`.
- `claude plugin validate .` lists what the module can do (`hooks:`, `calls:`, `env reads:`, `env writes:`). Any change to that list needs the ADR changed first.
- On the board, only `board/connector.ts` calls the page database, and only `board/client.ts` touches the document. `board/client.ts` only renders: every board rule is in `board/service.ts`.
- The board's road is Client, Service, Manager, Connector. `board/main.ts` is the only file that builds the board's parts and hands each one what it works with. It hands the Client the Service and nothing else.
- Board imports: `board/main.ts` imports the Connector, Manager, Service, Transformer and Client. `board/client.ts` imports the Service and the Model, as types only. `board/service.ts` imports the Manager (type only) and the Model. `board/manager.ts` imports the Connector (type only) and the Model. `board/connector.ts` and `board/transformer.ts` import only the Model. `board/model.ts` imports nothing.
- Apart from the startup file, only `board/manager.ts` imports `board/connector.ts`. `board/client.ts` never names the Manager or the Connector. `board/layers.test.ts` checks these imports.
- Only `expired()` in `board/service.ts` makes an `ExpiredIds`, and the delete functions accept nothing else. No shipped board file casts to it, uses `any`, or switches a type check off.
- `board/service.ts` reads no clock. `board/main.ts` hands it one. A row is deleted only by the rules in ADR-0001 IMP-005: age from the earlier of the device clock and the newest row, at most 200 deletes per page load, no delete without a readable time.
- Do not add a role, a folder, a dependency or a hosted service the ADR does not name. Change the ADR first.

TypeScript rules:

- Types are removed, not compiled, so use only syntax that can be removed: no enums, no namespaces, no parameter properties.
- Import other files by their `.ts` name.
- Do not commit compiled `.js` files.
- `typescript` and `@types/node` are development dependencies only. The plugin needs neither at run time.
- Run tests and the type check on Node 24.22.3. Do not rely on a machine's default `node`. The module itself runs inside Claude Code, on Claude Code's own runtime (seen working on 2.1.330).
- The module has no Node APIs. It reaches the clock, the environment, its note and tools only through `$`.

## Row rules

These are the product, from ADR-0001 Section 2. Do not change one without a Linear issue that says so.

- A call owes one row if it is `post_message`, `request_decision`, `post_widget`, `suggest_connectors`, `connect_device`, `start_remote_control`, `set_thread_resolved` with `resolved: true`, `show_helpline_card` (all `mcp__hearthbot__`), or `PushNotification`. Nothing else owes a row.
- A call that was refused or failed owes no row.
- One row per owing call. A later call gives a fresh row.
- Every field is built by code. The thread's model is never asked for anything.
- The module never blocks, changes or refuses a thread's call, and the thread's reply does not wait for the board.
- The row is saved in the plugin's note before the board is tried. A failed write is kept and tried again, oldest first. At most 500 rows wait once `RUL-3185` is built. A build made before it keeps at most 20.
- The approved fix values (ADR-0001, R6): each board write gets 5 seconds (`RUL-3186`). A failed note save is tried again after about 1, 2 and 5 seconds (`RUL-3187`). After a failed read the note is not saved over (`RUL-3188`).
- A board refusal because the row already exists counts as written. Only that one refusal counts. Any other refusal, and any doubt, keeps the row waiting (ADR-0001, R8).
- Turn end waits at most 8 seconds for the board. A broken board must never trap a thread.
- The only tool the module calls is `ArtifactData` `set`, with the board address and collection `turns` fixed in code. The only lookup is `get_session` on `claude-code-remote`, read-only. The call never carries `if_version`, so the module can add rows and cannot change or delete one. The T8 build's `tool.judge` listener is test evidence only and is not part of the lasting build.
- Outside a cloud thread (no thread id) the module does nothing.
- Code picks the state from the tool called (ADR-0001, R10, Josh 2026-11-22). A decision card, a card with a button or a draft, and a connect ask give `needs_you`. A resolve gives `finished`. Everything else gives `review`.

Safety check rules (ADR-0001, R8 and R11 to R14, built under `RUL-3168`):

- The safety check may clean a row, hide text in it, or swap it for a bare row. It may never stop, hold back or drop a row.
- It runs right before every write, on every row: fresh, tried again, or read back from the note. The note is not trusted.
- Right before every write, code compares the call with the one approved shape (the last look). A call that fails is replaced by a bare row.
- The Connector's second compare comes after the last look. If it fails, that call writes nothing and a bare row goes through the same door. If the bare row fails too, the row stays in the note and the failure is logged. Nothing is dropped.
- Title, project and preview are cleaned. The strict rule applies: hide on any doubt. Every word a match touches is replaced by the marker `[hidden]` and the rest stays readable. A private key block, a secret word with a value after it, and any case the code cannot finish swap the whole field for a fixed stand-in (Josh, 2026-11-23, ADR-0001 CTX-056).
- Text a code rule hid is never logged, never stored and never sent to the model. Text the model hides is never logged.
- One small model call looks at the cleaned title and preview. It can only hide text. No answer means hide. It never runs past the turn end wait.
- The model call is allowed only after the live test passes (ADR-0001, OPEN-008). If that test fails, stop and tell Josh first. Then the module makes no model call and the ADR is changed back before any code. This is the one fallback Josh approved.
- Every row carries `check` (`ok`, `hidden`, `hidden-ai`, `hidden-noai` or `bare`). `dropped` says how many waiting rows the module gave up on.
- Every waiting row gives exactly one row on the board: its own row or a bare row.

## Setup commands

Node 24.22.3 or later (pinned in `.nvmrc`). Install with `npm ci`. Node runs TypeScript files directly, so there is no build step.

## Development workflow

Not defined yet. The plugin has no build step. `RUL-3169` defines the command that compiles the board's files at publish time.

## Testing instructions

Run `npm test` (Node's built-in test runner, files named `*.test.ts`) and `npm run typecheck`. Required coverage: one test for each row rule above.

## Verification commands

| Class | Command | Note |
|---|---|---|
| `install` | `npm ci` | |
| `format` | Not defined yet | Added by `RUL-3166` |
| `lint` | `claude plugin validate .` | Needs the `claude` command. CI installs version 2.1.330, checked against a recorded hash, and the abilities test runs that exact file (`CLAUDE_BIN`). In CI a missing command fails the run. On other machines the test reports itself as skipped. |
| `typecheck` | `npm run typecheck` | Runs `tsc`, emits nothing |
| `test` | `npm test` | Runs `node --test` |
| `build board` | `npm run build:board` | Compiles the board's files. CI runs it on every pull request |
| `verify PR` | CI workflow | Typecheck, board build and test. The test step runs the abilities check with the `claude` command |
| `verify release` | Does not apply | Nothing is packaged or published from this repository yet |
| `audit` | Code review against ADR-0001 | No automated architecture check. Compare the `claude plugin validate .` list with ADR-0001 Section 3. |

Record each command you run with its name, text, result (`pass`, `fail` or `inconclusive`) and a short output summary.

## Pull request guidelines

Confirmed by Josh:

- Every pull request description carries a Linear keyword for its issue, on a line of its own (Josh, 2026-11-22). `Fixes RUL-xxxx` when merging the pull request finishes the issue. `Refs RUL-xxxx` when work on the issue is left after the merge. A pull request with neither is not finished.

Proposed, mirroring the Rule 0 Softworks platform repository. Confirm with Josh before relying on them.

- Conventional Commit prefixes such as `feat:`, `fix:` and `docs:`.
- No attribution lines in commits or pull request descriptions.
- Never force-push a shared branch, resolve review threads, or merge.

## Security and secrets

- A row holds the thread id, title, project name, state, time, a one-line preview and a link, plus the build version and the safety marks `check` and `dropped`. Do not store or log prompts, full replies or tool input.
- Rows hold text a thread wrote (its title and the first line of its reply). Treat them as untrusted: show them as plain text, and follow a link only if it points at `https://claude.ai/`. The approved board follow-up tightens this: the board builds the link itself from the thread id and ignores the row's `url` (ADR-0001, IMP-002).
- The module's board write runs with no approval prompt and without Anthropic's own safety check. Josh does not accept a write with no check at all (ADR-0001, CTX-039), so the plugin's own safety check runs on every row. Do not ship a build that writes rows without it, and do not weaken it.
- The module makes no network call of its own, holds no secret, and uses no `$.http`, `$.process`, `$.fs`, `$.env.set`, `$.prompt`, `$.session`, `$.agent` or `$.model.fork`. Its only `$.model` use is the one call of the safety check, which sends the cleaned title and preview of one row and nothing else (Josh approved this trust boundary change on 2026-11-22). Adding any of these, or any other tool call, is a trust boundary change: stop and ask Josh.
- The plugin's note (`$.store`) holds only the rows still waiting: at most 500 (20 in a build made before `RUL-3185`), each a thread id, time, state and preview, and the count of dropped rows. The note never holds text a code rule hid. Text the model later hides sits there until its row is written. The module's `$.ui.log` lines also land in the thread's `/tmp/claude-code.log`, with row ids and up to 200 characters of error text. Nothing else is written to disk.
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

- Start with the thread's Claude Code log, `/tmp/claude-code.log`. Its `thread-queue:` lines say what the module did.
- The module seems not to run: look for `hooks module thread-queue@synced loaded`. If it is missing, check the plugin is uploaded on the account Plugins page.
- A thread told the person something and no row shows: look for `row <id> not written, kept` and its reason. The row waits and is tried again at the next row and turn end. Open the board and check that it loads.
- A thread is still blocked at turn end, or its model writes rows: the old `thread-queue-turnstile` plugin is still on the account. Remove it.
- A row has no project name: the parent lookup failed or its title format changed (ADR-0001, NEG-003).
- A row's title is the thread id: the title lookup failed, or the safety check hid the title. The row's `check` mark says which.
- A title or preview holds `[hidden]`, or a preview reads "Preview hidden by the safety check" or "Details hidden by the safety check": the safety check hid text or sent a bare row. The log line for that row names the field and the rule, never the text.
- Many rows are marked `hidden-noai`: the model look is not answering. Rows still arrive.
- Board writes are refused with a deny: check whether the account moved to a Team or Enterprise plan, which loads the organization guard (ADR-0001, NEG-002).
- The main chat has no rows: expected. It has no board tool.
- A test fails with a syntax error on a `.ts` file: it ran on the wrong Node. The project's version is 24.22.3.

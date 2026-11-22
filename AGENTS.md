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

TypeScript. Plain JavaScript is not acceptable. Claude Code loads the module's `.ts` files directly, so the plugin has no build step. The board's script is compiled with `tsc` when the board is published.

Status: planning. The repository has no product code yet. `docs/adr/adr-0001-thread-queue-architecture.md` was Accepted on 2026-11-22. Do not write code until Josh approves the build-out issue for it. Milestone 0 evidence is in the Claude project's shared folder under `thread-queue/m0-evidence/`. The live-tested build (T8) is on branch `claude/project-thread-5rsmom`, which is never merged. An older plain JavaScript prototype sits under `thread-queue/prototype/`.

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

## Safety beats simple

Josh's standing rule (2026-11-22, ADR-0001 CTX-041): "Safety always wins."

- Where a simpler way and a safer way both exist, build the safer one and recommend the safer one.
- Never pick or recommend the simpler way because it is simpler. Simple only breaks a tie between ways that are equally safe.
- State what the safer way costs (money, delay, moving parts) in plain words. The cost does not flip the pick.
- If the safer way needs something your issue does not allow, stop and report. Do not fall back to the simpler way.
- The other hard rule holds at the same time: no row may be lost by chance. A safety control that can lose a row is not acceptable either.

## Architecture

This repository follows the Software Layer Roles and Dependency Policy v2.0.0-rc.4 (ADR-0001, Accepted 2026-11-22). The ADR holds the classification record. The policy file is not copied into this repository. Its home and exact version are named in the ADR.

Planned plugin files (ADR-0001, Section 5):

| File | Role |
|---|---|
| `.claude-plugin/plugin.json` | Manifest (not governed) |
| `hooks/hooks.json` | Points Claude Code at the module (not governed) |
| `hooks/register.ts` | Sections: Composition Root, Controller, Service, Manager, Connector |
| `hooks/row.ts` | The Service's rules (its owned support) and Model |

Claude Code lets the `$` object be passed only to top-level functions of the module's own file, so every `$` call lives in `hooks/register.ts`. Its sections are marked by comments naming the role.

The board is a page, `board/index.html` (markup and styles only), and one script, `board/board.ts`. The script's sections are marked by comments naming the role: Client, Service, Connector, Transformer, Model.

Rules a reviewer checks:

- `hooks/row.ts` holds every row rule. It imports nothing, does no file or network access, and reads no clock and no environment. Time and the thread id are passed in.
- The Controller section calls only the Service section. The Service section runs the safety check and decides the order of steps. The Manager and the Connector never call it.
- The last look returns a checked call. The Manager's and the Connector's write functions accept only that type.
- The Service section passes `$` on and never calls anything on it.
- Only the Connector section of `hooks/register.ts` calls `$.store`, `$.tool.call`, `$.mcp.call` and the one `$.model` call.
- `$.tool.call(` appears once in `hooks/register.ts`. `$.model.` appears once. `$.model.fork` never appears.
- Only `hooks/register.ts` calls `$.env.get` and `$.clock`.
- `claude plugin validate .` lists what the module can do (`hooks:`, `calls:`, `env reads:`, `env writes:`). Any change to that list needs the ADR changed first.
- On the board, only the Connector section calls the page database, and only the Client section touches the document.
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
- The row is saved in the plugin's note before the board is tried. A failed write is kept and tried again, oldest first. At most 20 rows wait.
- Turn end waits at most 8 seconds for the board. A broken board must never trap a thread.
- The only tool the module calls is `ArtifactData` `set`, with the board address and collection `turns` fixed in code. The only lookup is `get_session` on `claude-code-remote`, read-only. The call never carries `if_version`, so the module can add rows and cannot change or delete one. The T8 build's `tool.judge` listener is test evidence only and is not part of the lasting build.
- Outside a cloud thread (no thread id) the module does nothing.
- Code picks the state from the tool called (ADR-0001, R10, Josh 2026-11-22). A decision card, a card with a button or a draft, and a connect ask give `needs_you`. A resolve gives `finished`. Everything else gives `review`.

Safety check rules (ADR-0001, R8 and R11 to R14, built under `RUL-3168`):

- The safety check may clean a row, hide text in it, or swap it for a bare row. It may never stop, hold back or drop a row.
- It runs right before every write, on every row: fresh, tried again, or read back from the note. The note is not trusted.
- Right before every write, code compares the call with the one approved shape (the last look). A call that fails is replaced by a bare row.
- Title, project and preview are cleaned. Text that looks like a secret has its whole field swapped for a fixed stand-in. The strict rule applies: hide on any doubt.
- Text a code rule hid is never logged, never stored and never sent to the model. Text the model hides is never logged.
- One small model call looks at the cleaned title and preview. It can only hide text. No answer means hide. It never runs past the turn end wait.
- The model call is allowed only after the live test passes (ADR-0001, OPEN-008). If that test fails, stop and tell Josh first. Then the module makes no model call and the ADR is changed back before any code. This is the one fallback Josh approved.
- Every row carries `check` (`ok`, `hidden`, `hidden-ai`, `hidden-noai` or `bare`). `dropped` says how many waiting rows the module gave up on.
- Every waiting row gives exactly one row on the board: its own row or a bare row.

## Setup commands

Node 24.22.3 or later (pinned in `.nvmrc`). Install with `npm ci`. Node runs TypeScript files directly, so there is no build step.

## Development workflow

Not defined yet. The plugin has no build step. `RUL-3169` defines the command that compiles the board's script at publish time.

## Testing instructions

Run `npm test` (Node's built-in test runner, files named `*.test.ts`) and `npm run typecheck`. Required coverage: one test for each row rule above.

## Verification commands

| Class | Command | Note |
|---|---|---|
| `install` | `npm ci` | |
| `format` | Not defined yet | Added by `RUL-3166` |
| `lint` | Not defined yet | `RUL-3166` plans `claude plugin validate .`. There is no manifest to check today. |
| `typecheck` | `npm run typecheck` | Runs `tsc`, emits nothing |
| `test` | `npm test` | Runs `node --test` |
| `verify PR` | CI workflow | Typecheck plus test. Lint to come with `RUL-3166` |
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
- The plugin's note (`$.store`) holds only the rows still waiting: at most 20, each a thread id, time, state and preview, and the count of dropped rows. The note never holds text a code rule hid. Text the model later hides sits there until its row is written. The module's `$.ui.log` lines also land in the thread's `/tmp/claude-code.log`, with row ids and up to 200 characters of error text. Nothing else is written to disk.
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
- A preview reads "Preview hidden by the safety check" or "Details hidden by the safety check": the safety check hid text or sent a bare row. The log line for that row names the field and the rule, never the text.
- Many rows are marked `hidden-noai`: the model look is not answering. Rows still arrive.
- Board writes are refused with a deny: check whether the account moved to a Team or Enterprise plan, which loads the organization guard (ADR-0001, NEG-002).
- The main chat has no rows: expected. It has no board tool.
- A test fails with a syntax error on a `.ts` file: it ran on the wrong Node. The project's version is 24.22.3.

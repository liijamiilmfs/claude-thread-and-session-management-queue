# Thread Queue: the rules card

Thread Queue: a board of Josh's Claude cloud project threads, and a plugin that writes each finished turn to it.
A second plugin, the panel (`panel/`, ADR-0002), shows the same list inside the desktop app on Josh's Windows PC.
Every line here is a hard rule. Read it all before any work. It is short on purpose.

## Agent routing contract

Before assigning or recommending an agent profile, or handling PR feedback,
read [the agent routing and capacity contract](docs/agent-routing-contract.md).
It is a synced copy. The master lives in Rule-0-Softworks/rule-0-softworks-platform. Do not edit it here.

A script in the master repository refreshes the copy through a pull request from the branch `sync/agent-routing-contract`.
Keep this section and its link, because the script looks for the link.

## Approval and scope
- Josh approves every issue before work starts. The tier is fixed at approval.
- No agent reclassifies its own work, widens its issue, or merges a pull request.
- Write code only under an issue Josh has approved, at its approved tier.
- Milestone 2 is not approved.
- The branch `claude/project-thread-5rsmom` holds the live-tested build (T8) and is never merged.
- Do not add a role, folder, dependency or hosted service the ADR does not name. Change the ADR first.
- The row rules are the product. Do not change one without a Linear issue that says so.
- Out of scope until a new ADR says otherwise: local sessions as rows in the list, extra notifications, a live "working" state on the board.
- The panel shows the list of cloud threads inside a local session (ADR-0002). It adds no local session to the list.
- The panel is for Josh's Windows PC only. Mac and Linux are out of scope until a new ADR says otherwise.
- ADR-0002 was accepted on 2026-11-24. Change it before changing what the panel may do.
- Out of scope until a new ADR says otherwise: any hosted service, a network rule change in a cloud environment.
- Out of scope until a new ADR says otherwise: a second place to record turns (the Milestone 3 safety net).
- TypeScript. Plain JavaScript is not acceptable.
- One writer in this repository at a time.
- Before work starts, state: purpose, scope, non-goals, files, tier with evidence, reviewer, how to undo, how done is checked.
- When work stops, report: state, what changed, each acceptance criterion with its proof, validation and review results.
- When work stops, also report: what is left, the next decision for Josh, and the tier used.

## Linear
- Planning and implementation agents do not write to Linear.
- Hand an exact spec (id, field, new value) to a Haiku 5.5 worker, which makes the write and reports back.
- Agents move issues only among Triage, Backlog, Todo and In Progress.
- Linear is the only source of truth for scope, acceptance criteria, milestones, status and priority.
- Team: Rule0Softworks, key `RUL`, id `760d907a-8c39-4018-ba0d-ce40568c749d`.
- Project: Thread Queue, id `5be580a6-d718-4095-b7fe-cc23b5b1f4dc`. Issues start at `RUL-3161`.
- New issues are added as work is found, so read the project's issue list in Linear, not a range.
- Resolve the team and project by these ids before any write. Do not match by name.

## Safety, security and git
- Josh's standing rule (ADR-0001 CTX-041): "Safety always wins."
- Where a simpler way and a safer way both exist, build the safer one and recommend the safer one.
- Never pick or recommend the simpler way because it is simpler.
- Simple only breaks a tie between ways that are equally safe.
- State what the safer way costs (money, delay, moving parts) in plain words. The cost does not flip the pick.
- If the safer way needs something your issue does not allow, stop and report.
- Do not fall back to the simpler way.
- The other hard rule holds at the same time: no row may be lost by chance.
- A safety control that can lose a row is not acceptable either.
- The module's board write runs with no approval prompt and without Anthropic's own safety check.
- Josh does not accept a write with no check at all (ADR-0001, CTX-039).
- The plugin's own safety check runs on every row.
- Do not ship a build that writes rows without the safety check, and do not weaken it.
- The module makes no network call of its own and holds no secret.
- The module uses no `$.http`, `$.process`, `$.fs`, `$.env.set`, `$.prompt`, `$.session`, `$.agent` or `$.model.fork`.
- The only `$.model` use is the one call of the safety check.
- That call sends the cleaned title and preview of one row and nothing else.
- Adding any of these, or any other tool call, is a trust boundary change: stop and ask Josh.
- The lines above are about the `thread-queue` module. The panel is a second plugin with its own list (ADR-0002, Section 3).
- The panel runs one fixed local command with no approval prompt (ADR-0002, P5). No text from a row may reach it.
- The panel reads the board with one fixed call and the sign-in the desktop app already has (ADR-0002, P2).
- The panel never writes to the board, stores nothing, and logs no row text.
- The panel uses no `$.http`, `$.fs`, `$.store`, `$.env`, `$.model`, `$.mcp`, `$.agent`, `$.prompt` or `$.process.spawn`.
- Adding any of these to the panel, another command or another tool call is a trust boundary change: stop and ask Josh.
- If the panel's read ever needs a key, a stored sign-in or a network call of our own: stop and ask Josh.
- The panel's abilities stay out of `thread-queue`. `panel/` is never in the zip that cloud threads load.
- The panel is never uploaded on the account Plugins page.
- A row holds the thread id, title, project name, state, time, a one-line preview and a link.
- A row also holds the build version and the safety marks `check` and `dropped`.
- Do not store or log prompts, full replies or tool input.
- Rows hold text a thread wrote (its title and the first line of its reply).
- Treat them as untrusted: show them as plain text.
- Follow a link only if it points at `https://claude.ai/`.
- The board builds the link itself from the thread id and ignores the row's `url` (ADR-0001, IMP-002).
- Build that link only when the thread id fits the pattern.
- The plugin's note (`$.store`) holds only the rows still waiting.
- The note keeps each waiting row as a thread id, time, state and preview, plus the count of dropped rows.
- The note never holds text a code rule hid.
- Text the model later hides sits there until its row is written.
- The module's `$.ui.log` lines also land in the thread's `/tmp/claude-code.log`.
- They carry row ids and up to 200 characters of error text.
- Nothing else is written to disk.
- No secrets belong in this repository.
- Every pull request description carries a Linear keyword for its issue, on a line of its own (Josh).
- `Fixes RUL-xxxx` when merging the pull request finishes the issue.
- `Refs RUL-xxxx` when work on the issue is left after the merge.
- A pull request with neither is not finished.
- Proposed, confirm with Josh before relying on it: never force-push a shared branch or resolve review threads.
- Proposed, confirm with Josh before relying on it: no attribution lines in commits or pull request descriptions.
- Proposed, confirm with Josh before relying on it: Conventional Commit prefixes such as `feat:`, `fix:` and `docs:`.
- Keep scratch files out of the repository. Commit nothing generated.

## Commands
- Node 24.22.3 or later (pinned in `.nvmrc`). Install with `npm ci`.
- Run tests and the type check on Node 24.22.3.
- Do not rely on a machine's default `node`.
- Run `npm test` (Node's built-in test runner, files named `*.test.ts`) and `npm run typecheck`.
- Lint with `claude plugin validate .` and `claude plugin validate panel`. Needs the `claude` command.
- CI installs version 2.1.330, checked against a recorded hash, and both abilities tests run that exact file (`CLAUDE_BIN`).
- In CI a missing command fails the run.
- On other machines the test reports itself as skipped.
- Build the board with `npm run build:board`. It compiles the board's files. CI runs it on every pull request.
- Record each command you run with its name, text, result (`pass`, `fail` or `inconclusive`) and a short output summary.

## When you do this, open that first
- Writing or reviewing code: `docs/writing-or-reviewing-code.md`. Every time.
- Writing or reviewing panel code: also `docs/adr/adr-0002-thread-list-panel.md`. Every time.
- Changing or checking a row rule or a board rule: `docs/changing-row-or-board-rules.md`. Every time.
- Changing the safety check, or running `npm run e2e:safety`: `docs/changing-the-safety-check.md`. Every time.
- A thread leaves no row, the module seems not to run, or the panel misbehaves: `docs/troubleshooting-the-turnstile.md`.
- Finding the layers policy, which is not copied here: `docs/adr/adr-0001-thread-queue-architecture.md`. Section 4.

Last checked: 2026-11-23. The old rules and the reasons behind them: the git history of `AGENTS.md`, and `docs/adr/adr-0001-thread-queue-architecture.md`.

---
title: "ADR-0001: Thread Queue turnstile and board, and software layers adoption"
status: "Proposed"
date: "2026-11-21"
authors: "Josh (adoption owner and approver)"
tags: ["architecture", "decision", "scope-adoption", "claude-code-plugin"]
supersedes: ""
superseded_by: ""
---

# ADR-0001: Thread Queue turnstile and board, and software layers adoption

## Status

**Proposed** | Accepted | Rejected | Superseded | Deprecated

This record stays Proposed until the Milestone 0 tests are done and Josh approves it. The software layers policy is not Active for this repository until then.

An earlier draft of this record described a pane inside the desktop app for local sessions. Josh dropped that scope on 2026-11-21 before the draft was approved, so this text replaces it and nothing is superseded.

## Context

Josh runs three to five Claude projects at once. Each project's threads run in the cloud. To see which threads have finished a turn he must open each project and then its thread list. He wants one list across all projects, in the style of the Codex sidebar, with freshly finished turns on top.

Facts from Anthropic's Claude Code documentation, read on 2026-11-21:

- **CTX-001**: Hooks fire in cloud sessions. "Claude Code fires the same hook events wherever it runs: sessions in the terminal, IDE extensions, the Desktop app, and cloud sessions."
- **CTX-002**: A hook on Josh's computer cannot see cloud threads. "Cloud sessions don't read your local `~/.claude/settings.json`." "Cloud threads don't pick up anything from the Claude Code setup on your own machine." Hooks in a repository's settings file are "not run" in a project thread.
- **CTX-003**: A plugin carries hooks. "Define plugin hooks in `hooks/hooks.json`." "When a plugin is enabled, its hooks merge with your user and project hooks." Plugins reach project threads through the project's plugin settings.
- **CTX-004**: A Stop hook can refuse to let a turn end. A `decision` of `"block"` with a `reason` "prevents Claude from stopping, continues the conversation".
- **CTX-005**: No documented interface lists project threads across projects.

Facts observed in one cloud project thread on 2026-11-21. These are test results, not documented promises:

- **CTX-006**: Hooks placed in the thread machine's own user settings file loaded without a restart. A PostToolUse hook and a Stop hook both fired.
- **CTX-007**: A Stop hook blocked the end of a turn, and the thread carried on, did what the hook asked, and then ended normally. The platform's own reply check, which is also a Stop hook, kept working beside it.
- **CTX-008**: The Stop hook was told the session id, the transcript path, the folder, a scratch folder and little else. It was not told the thread's title, its project, or the reply text.
- **CTX-009**: A hook that calls a connector tool directly, with no agent step, worked against the Linear connector.
- **CTX-010**: A private Artifact page with a built-in database showed rows live. A thread wrote a row to it with the `ArtifactData` tool and no approval prompt, in auto permission mode.
- **CTX-011**: The same page could not list sessions itself. Claude's permission box reported "Couldn't load this connector" for the built-in session connector.
- **CTX-012**: An account plugin's hooks (Ponytail) ran in the thread.
- **CTX-017**: Node v22.23.5 on the thread's machine ran a `.ts` file that imports another `.ts` file, directly, with no flag and no build step. Node reported `process.features.typescript` as `strip`. TypeScript 6.0.2 (`tsc`) was also installed there.

Josh's decisions on 2026-11-21:

- **CTX-013**: Cloud project threads only. The desktop app already sorts local sessions by status.
- **CTX-014**: Reporting must be enforced by code. An instruction that asks threads to report is not acceptable, because agents skip instructions.
- **CTX-015**: The turnstile design below, chosen over continued search for a route with no agent step.
- **CTX-016**: The code is TypeScript. Plain JavaScript is not acceptable.

Rule 0 Softworks requires each repository to adopt the Software Layer Roles and Dependency Policy through a scope-adoption ADR. This record is that ADR for this repository.

## Decision

### 1. What we build

Two parts.

**The board** is one private Artifact page, pinned in Claude. It keeps a small database of rows, one per finished turn. It shows the newest row of each thread: Priority on top (finished turns Josh has not clicked), then the rest grouped by day. Each row shows the thread title, project name, state and a short preview, and links to the thread. Clicking a row marks it seen.

**The turnstile** is a plugin with two command hooks that run one small TypeScript program on Node.

- After each tool call, the script notes two things in a small file in the thread's scratch folder: the thread told the person something (a row is owed), and a valid row was written.
- When the thread tries to end its turn, the script checks the note. If a row is owed and not written, it blocks the turn and hands back the exact row to write, with the thread id, time and link filled in. The thread adds its title, project, state and preview, writes the row, and the turn ends.

Rules:

- A turn that told the person nothing owes no row.
- A row write counts only if it targets the board, the right collection, and carries thread, title, state and time.
- After two blocks in a row the gate opens, so a broken board cannot trap a thread.
- With no board address set, the script does nothing.
- States are needs you, ready for review, finished and failed.

Language: TypeScript (CTX-016).

- The plugin's `.ts` files are run directly by Node, which removes the types as it loads each file (CTX-017). The plugin has no build step and no compiled files are committed.
- Because Node only removes types, the plugin uses only TypeScript syntax that can be removed: no enums, no namespaces and no parameter properties. Imports name the `.ts` file.
- `tsc --noEmit` is the type check. Tests run on Vitest. `typescript` and `vitest` are development dependencies only. The plugin needs neither at run time.
- A browser cannot run TypeScript, so the board's script is compiled with `tsc` when the board is published. The compiled file is published beside the page and is not committed.

Rationale: the hook is code and runs whether or not the agent remembers, which meets CTX-014. The agent is still the only party that knows the title, project and state (CTX-008), so it fills in the label while the hook holds the gate. Nothing is hosted, no network rule changes, and no secret is stored.

### 2. Software layers adoption (policy Section 2.2 fields)

| Field | Value |
|---|---|
| Policy | Software Layer Roles and Dependency Policy, `R0S-ARCH-LAYERS`, version `2.0.0-rc.4` |
| Immutable artifact identifier | File `docs/architecture/software-layers-v2.0.0-rc.4.md` in `Rule-0-Softworks/rule-0-softworks-platform` at commit `32e4c1c548d3bbef05dd66460f72536cf5253872`, SHA-256 `84f1792b0a3b583cfd0486aa5e40e31fd71e542d2d88f6bf8e88d610155b6fcd` |
| Previously Active policy | None. This is a new repository. |
| Governed scopes | `hooks/gate.ts`, every file under `src/`, and `board/board.ts` |
| Exclusions | Test files (`*.test.ts`), JSON manifests and config, and documentation |
| Adoption owner | Josh |
| Approval date | Pending |
| Classification record | Section 3 of this record |
| Same-role compositions (6.2) | None |
| Consumer transport Connectors (6.3) | None |
| Persistence Connectors with Entity access (6.4) | None. Both Connectors store plain JSON and stay Entity-agnostic. |
| External facility mappings (Section 7) | Section 4 of this record |
| Incorporated exception ADRs | None |
| Enforcement | Code review |
| Effective date | The approval date |

### 3. Classification record

The plugin has one file per role. The file name is the classification rule.

| File | Role | What lives there |
|---|---|---|
| `hooks/gate.ts` | Composition Root | Reads the hook event, the board address and the time, builds the parts, runs the Controller, exits |
| `src/controller.ts` | Controller | Turns a hook event into one call on the Service, and the answer into hook output |
| `src/service.ts` | Service | The gate rules and the wording of the row instruction |
| `src/manager.ts` | Manager | Load and save the gate's note |
| `src/connector.ts` | Connector | The only code that touches the note file |
| `src/model.ts` | Model | The shapes of a hook event, the note and a decision |

The board is a page, `board/index.html`, that holds markup and styles only, and one script, `board/board.ts`. The script is one file, so its parts are classified by section. Each section starts with a comment naming its role.

| Section of `board/board.ts` | Role | What lives there |
|---|---|---|
| Client | Client | Drawing rows, the click handler, status text |
| Service | Service | Newest row per thread, Priority rule, day grouping |
| Connector | Connector | The only code that calls the page database |
| Transformer | Transformer | Stored row to display row |
| Model | Model | The display row shape |

Roles this scope does not use: Domain, Gateway, Provider (first-party), Contract and Entity. The plugin also has no Transformer and no Client, and the board has no Controller and no Manager. With no Domain types, each Service holds its rules, as policy Section 5.3 allows.

Dependencies used, all inside the policy's allow-list:

| From | To |
|---|---|
| Controller | Service, Model |
| Service (plugin) | Manager, Model |
| Manager | Connector, Model |
| Connector | Model |
| Client | Service, Connector, Transformer, Model |
| Transformer | Model |

The Composition Root passes the Manager into the Service and the Connector into the Manager as arguments. The time and the board address are passed in as plain values, so the Service reads no clock and no environment.

### 4. External facility mappings

| Facility | Mapping | Who may call it |
|---|---|---|
| Hook event on standard input, hook output on standard output, exit code | Framework inbound handling and response writing | Composition Root and Controller |
| Node file system calls for the note file | External Connector facility | `src/connector.ts` only |
| Process environment and the system clock | External Provider abstraction | Composition Root only. Values are passed in. |
| The page database (`claude.use("db")`) | External Connector facility | The board's Connector section only |
| The browser document | Framework response writing | The board's Client section only |

The row write itself is not this repository's code. The thread's agent makes it with Claude's `ArtifactData` tool, and the turnstile only checks that it happened.

## Consequences

### Positive

- **POS-001**: Reporting is enforced by code. A thread that tells Josh something cannot end its turn without a row.
- **POS-002**: One list across every project, with no change to any project beyond switching the plugin on.
- **POS-003**: Nothing is hosted, no network rule changes, and no secret is stored.
- **POS-004**: The gate rules are one function with no file or network access, so every rule has a plain test.
- **POS-005**: The gate fails open. No board address, a broken board, or two refusals in a row all let the thread carry on.
- **POS-006**: The agent supplies the state, so the board can say "needs you" or "ready for review", which a hook alone cannot know.

### Negative

- **NEG-001**: A turn that dies from an error never reaches the gate, and a turn the gate gives up on is missed. Neither shows on the board in the MVP.
- **NEG-002**: The label is only as good as what the agent writes. The hook checks that the fields exist, not that they are true.
- **NEG-003**: Every turn that tells Josh something costs one extra tool call.
- **NEG-004**: The plugin path, the other permission modes and the row link are proven in one thread only or not at all. The design depends on Milestone 0.
- **NEG-005**: The design rests partly on observed behavior (CTX-006 to CTX-012 and CTX-017). Anthropic may change it without notice.
- **NEG-006**: A row leaves Priority when Josh clicks it on the board, not when he opens the thread some other way.
- **NEG-007**: Six files for about sixty lines of gate code is more structure than the code needs. This is the cost of following the layers policy.
- **NEG-008**: The plugin depends on the thread machine's Node being able to run TypeScript files. That is observed, not promised (CTX-017). On an older Node the hook would fail, the gate would not block, and turns would go unreported with no visible error.

## Alternatives Considered

### An instruction that asks threads to report

- **ALT-001**: **Description**: A standing project instruction tells each thread to write its row at the end of every turn.
- **ALT-002**: **Rejection Reason**: It worked in a test, but nothing enforces it. Josh rejected it (CTX-014).

### The board lists sessions itself

- **ALT-003**: **Description**: The page asks Claude's built-in session connector for all sessions and needs no plugin.
- **ALT-004**: **Rejection Reason**: Blocked on 2026-11-21. The connector would not load for a page (CTX-011). Worth one retest later, since it would need no setup at all.

### A hook with no agent step

- **ALT-005**: **Description**: A hook calls a connector tool directly each time a turn ends.
- **ALT-006**: **Rejection Reason**: It works (CTX-009), but the hook is not told the title, project or reply text (CTX-008), so its row could only say that some thread finished. Kept as the Milestone 3 safety net.

### A hosted collector

- **ALT-007**: **Description**: A hook posts each finished turn to a small hosted service, and the board reads from there.
- **ALT-008**: **Rejection Reason**: It needs hosting, a secret and a network rule change in every environment, and it has the same labelling gap as ALT-005.

### The Reddit recipe

- **ALT-009**: **Description**: Stop and Notification hooks in the settings file on Josh's computer append to a shared log.
- **ALT-010**: **Rejection Reason**: It cannot see cloud threads (CTX-002), which are the only sessions in scope.

### Built-in features only

- **ALT-011**: **Description**: Each project's thread list and its finish notifications.
- **ALT-012**: **Rejection Reason**: Both are per project. Checking five projects one by one is the problem this tool exists to remove.

### Plain JavaScript

- **ALT-013**: **Description**: Write the gate and the board in plain JavaScript, as the prototype is.
- **ALT-014**: **Rejection Reason**: Josh requires TypeScript (CTX-016).

### TypeScript compiled to JavaScript before install

- **ALT-015**: **Description**: Compile the plugin with `tsc` and commit the compiled files, so the hooks run plain JavaScript.
- **ALT-016**: **Rejection Reason**: A plugin installs straight from the repository with no build on install, so the compiled files would have to be committed and kept in step with the source by hand. Node on the thread's machine already runs the `.ts` files (CTX-017). Revisit if Milestone 0 shows a thread whose Node cannot.

## Implementation Notes

- **IMP-001**: Milestone 0 runs first: prove the gate blocks when it arrives as a plugin in a second project, prove the row write needs no approval click in each permission mode Josh uses, prove the row link opens the thread, and settle which turns owe a row and what each state means. This record is updated with the results before any build issue starts.
- **IMP-002**: Rows on the board are written by agents and are untrusted. The board shows them as plain text and follows a link only if it points at claude.ai.
- **IMP-003**: A row holds the thread id, title, project name, state, time, a one-line preview and a link. No prompts, replies or tool input are stored.
- **IMP-004**: The gate's instruction tells the thread how to load the `ArtifactData` tool when it is not loaded.
- **IMP-005**: The board removes rows older than 30 days. Its database holds at most 25,000 rows.
- **IMP-006**: Work is assigned under the Agent Routing and Capacity Contract v0.9. Josh approves each issue and its tier before work starts. Agents do not merge pull requests. A Haiku worker makes all Linear writes from an exact spec.
- **IMP-007**: Success is the Milestone 2 check: threads in at least three projects finish turns within the same few minutes and all show on the board, and one week of use gives a count of missed turns.
- **IMP-008**: A working prototype of the gate script and the board page from 2026-11-21 is in the project folder under `thread-queue/prototype/`. It is plain JavaScript and predates CTX-016. The Milestone 0 plugin test runs a TypeScript port of the gate, so the test also proves CTX-017 in a second project.

## References

- **REF-001**: Related ADRs: none yet. The Milestone 3 safety net will need one if it adds a second place to record turns.
- **REF-002**: Plan: Thread Queue MVP Gameplan, https://claude.ai/artifact/TRJjujoLPsyw3gGggp6KFy
- **REF-003**: The board prototype, https://claude.ai/artifact/ByotUv4ViCSyFxtHF5cbNG
- **REF-004**: Claude Code hooks reference, https://code.claude.com/docs/en/hooks
- **REF-005**: Claude Code projects, https://code.claude.com/docs/en/claude-projects
- **REF-006**: Software Layer Roles and Dependency Policy v2.0.0-rc.4, https://github.com/Rule-0-Softworks/rule-0-softworks-platform/blob/main/docs/architecture/software-layers-v2.0.0-rc.4.md
- **REF-007**: Agent Routing and Capacity Contract v0.9, https://github.com/Rule-0-Softworks/rule-0-softworks-platform/blob/main/docs/config/agent-routing-and-capacity-contract-v0.9.md

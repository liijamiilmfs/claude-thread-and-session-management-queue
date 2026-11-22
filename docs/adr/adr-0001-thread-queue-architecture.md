---
title: "ADR-0001: Thread Queue board and row-saving plugin, and software layers adoption"
status: "Accepted"
date: "2026-11-22"
authors: "Josh (adoption owner and approver)"
tags: ["architecture", "decision", "scope-adoption", "claude-code-plugin"]
supersedes: ""
superseded_by: ""
---

# ADR-0001: Thread Queue board and row-saving plugin, and software layers adoption

## Status

Proposed | **Accepted** | Rejected | Superseded | Deprecated

Josh accepted this record on 2026-11-22 at 09:32Z, on a decision card in the Claude project. The software layers policy is Active for this repository from that date. The build-out (Milestones 1 and 2) still needs Josh's approval issue by issue.

Changed on 2026-11-22 under `RUL-3192`, after acceptance. Josh approved each change before it was written:

- The plugin's own safety check on every row, with one small model call that can only hide text (CTX-039 to CTX-041, CTX-043, rules R11 to R14). This changes the trust boundary in Section 6.
- The board keeps its rows for 60 days, not 30 (CTX-042, IMP-005).

The design and its evidence are in the Claude project's shared folder, `thread-queue/m1-evidence/RUL-3168-safety.md` (REF-011). No code for the safety check exists yet. It is built under `RUL-3168`.

Earlier drafts described a pane inside the desktop app (dropped by Josh on 2026-11-21) and then a turnstile that blocked a thread until its model wrote the row (replaced on 2026-11-22 after Milestone 0, see "Alternatives Considered"). No draft was approved, so this text replaces them and nothing is superseded.

Milestone 0 evidence lives outside the repository, in the Claude project's shared folder under `thread-queue/m0-evidence/` (`T1.md` to `T8.md`). Each fact below names its report.

## Context

Josh runs three to five Claude projects at once. Each project's threads run in the cloud. To see which threads have finished a turn he must open each project and then its thread list. He wants one list across all projects, in the style of the Codex sidebar, with freshly finished turns on top.

### Facts from Anthropic's documentation

- **CTX-001**: Hooks fire in cloud sessions. "Claude Code fires the same hook events wherever it runs: sessions in the terminal, IDE extensions, the Desktop app, and cloud sessions."
- **CTX-002**: A hook on Josh's computer cannot see cloud threads. "Cloud sessions don't read your local `~/.claude/settings.json`." Hooks in a repository's settings file are "not run" in a project thread.
- **CTX-003**: Corrected by Milestone 0. The docs say plugins reach threads through **Project settings > Plugins**. Josh's account has no such section (T1). See CTX-019.
- **CTX-004**: A Stop hook can refuse to let a turn end. No longer used by this design.
- **CTX-005**: No documented interface lists project threads across projects.
- **CTX-030**: A plugin can carry a hooks module (`hooks/hooks.json`, key `"modules"`), which may be a `.ts` file. A cloud session runs a module's hooks "for a plugin that reaches the cloud session" (mods overview, "Where mods run"). The module "has no Node.js APIs" and no file or network access of its own. It reaches those only through the `$` object Claude Code hands it (mods API).
- **CTX-031**: A module can call a tool itself with `$.tool.call`. Anthropic's type file (`mods/types/claude-code.d.ts`): it is "the same call the engine makes for the model's tool calls", and "The check opens no dialog and asks no classifier: every ask becomes an allow, whoever raised it". Mods admin page: such calls "can skip permission rules, permission prompts, a hook's `ask`, and the auto mode classifier."
- **CTX-032**: The one documented blocker for CTX-031: "Where sec-default is seated, a person's mod is answered `{ deny }` until that call is allowed." That organization guard loads with managed settings or a Team or Enterprise login.
- **CTX-033**: Module events used: `tool.call` (a tool is about to run), `turn.complete` (a turn ended) and, in the test build only, `tool.judge` (auto mode is about to ask its safety check). The docs give a version floor, 2.1.326, only for `tool.judge`. No floor is recorded here for `tool.call` or `turn.complete`. They were seen working on Claude Code 2.1.330 (T8). A hook has 10 seconds of its own time, "not counting time inside `next` or a mods API call". A hook that fails after `next` resolved: "that result stands, and nothing runs a second time".
- **CTX-034**: After Josh stops a thread, Claude Code refuses a module's calls until his next message ("the session was stopped and nobody has sent input since").

- **CTX-045**: A plugin cannot ask Anthropic's own safety check about its call. `$.tool` has only `register`, `call`, `check` and `list`. On `$.tool.check`, the type file says "nothing runs, no dialog opens, no PreToolUse hook or classifier is asked". `tool.judge` is an event a plugin can listen to, and no call raises it. The one route that keeps that check is the thread's model making the write, which is the path that lost rows (CTX-021). Read on 2026-11-22 for the safety design (REF-011, section 4).
- **CTX-046**: A module can make a model call of its own. `$.model.classify`: "Picks one of `labels` for `text` with one completion", by default on "the engine's small fast model". `$.model.complete` takes the module's own instruction, a time limit and a cap on the answer. "Both calls use the session's credentials, so they bill to the user's plan". `$.model.fork` would send the thread's whole conversation. Read in the type file and docs, as quoted in REF-011. Not yet seen working in a cloud thread (OPEN-008).
- **CTX-047**: The plugin's note, `$.store`, is "A JSON file of the plugin's own under the user's Claude Code configuration directory". The thread's model has a shell on that machine, so it can edit the file. The note is untrusted when read.
- **CTX-048**: The `ArtifactData` tool refuses a `set` on a row that already exists unless the call carries `if_version` ("A write to a document that already exists is refused without it"). T8 saw this live.

### Facts seen in Milestone 0 (test results, not documented promises)

- **CTX-006 to CTX-012, CTX-017**: The prototype checks of 2026-11-21. Hooks in a thread machine's own settings file loaded and fired. A Stop hook blocked a turn. The Stop input carries no title, project or reply text (CTX-008). A private Artifact page with a built-in database showed rows live, and a thread wrote a row with the `ArtifactData` tool (CTX-010). The page could not load the session connector itself (CTX-011). An account plugin's hooks (Ponytail) ran in a thread (CTX-012). Node v24.22.3 sat at `/opt/node24/bin/node` and ran `.ts` files directly (CTX-017).
- **CTX-019**: There is no per-project plugin switch on Josh's account. A plugin arrives by uploading a `.zip` on the account Plugins page. It is account-wide: every project, each project's main chat, and running threads when they wake (T1, T4).
- **CTX-020**: Plugin option values (`userConfig`) do not reach cloud threads (T1). So the board's address is fixed in the plugin's code.
- **CTX-021**: When a thread's model wrote the row, the server-side safety check judged each write on its own. Of five writes from other projects, one was refused ("[Sensitive Information Leakage]") and four passed. The rate is unknown, and nothing documented lets one account switch the check off for cloud threads (T1, T6).
- **CTX-022**: The main chat runs account plugin hooks but has no `ArtifactData` tool, so it cannot write a row (T1, T4). A test page could find the session connector but could not read the main chat (T4, two tries).
- **CTX-023**: The organization guard is not loaded in Josh's cloud threads. Log: `cc-plugin-sec-default@builtin not seated: no managed settings and not a Team or Enterprise organization (max)` (T7).
- **CTX-024**: A hooks module in an uploaded zip loads in a cloud thread and can call `ArtifactData` itself. Log lines from the T8 thread: `hooks module thread-queue@synced loaded`, `Skipping auto mode classifier for ArtifactData: called by plugin thread-queue`, and `tool_dispatch_start tool=ArtifactData toolUseId=toolu_plugin_...` with `outcome=ok` (T8). Claude Code was 2.1.330.
- **CTX-025**: The built-in `claude-code-remote` connector's `get_session`, called by the module with no id, returns the thread's title and its parent's id. The parent is the project's main chat, whose title reads `Project coordinator ("<project name>")`. That format is not documented. The parent's record comes back wrapped in a notice around the JSON (T8).
- **CTX-026**: Claude Code can restart on the same cloud machine when a thread wakes after a long idle. Module memory is lost. The module's own `$.store` note survives while the machine lives (T8).
- **CTX-027**: A board row's link, `https://claude.ai/code/session_<thread id>`, opened the right thread from Josh's phone browser and from the Windows Claude desktop app (T3).
- **CTX-028**: In auto mode, threads on Haiku 5.5, Fable 5.2, Sonnet 5.5 and Opus 5.5 showed Josh no approval box for a model-written row (T2). That was the old path. Under this design the plugin's call opens no dialog (CTX-031). T2 stays open until rows from all four models are seen on this design.

### Josh's decisions

- **CTX-013**: Cloud project threads only. The desktop app already sorts local sessions by status.
- **CTX-014**: Reporting must be enforced by code. An instruction that asks threads to report is not acceptable, because agents skip instructions.
- **CTX-015**: The turnstile was chosen on 2026-11-21 and replaced on 2026-11-22. See CTX-035 and CTX-036.
- **CTX-016**: The code is TypeScript. Plain JavaScript is not acceptable.
- **CTX-018**: The project's Node version is 24.22.3. `.nvmrc` says 24.22.3 and `package.json` requires 24.22.3 or newer. Tests and the type check run on that version.
- **CTX-029**: Which calls owe a row and what the four states mean: the T4 table, as Josh agreed on 2026-11-21 (answers q1 to q8). q6 is replaced by CTX-037.
- **CTX-035**: No row may ever go missing (2026-11-22 00:09Z): "A row going missing is not ok, that nondeterminism is a flaw I can't accept for a tool that I rely on consistently."
- **CTX-037**: Code picks each row's state from the tool called (R10). Josh chose this on 2026-11-22 09:29Z on the choices page (https://claude.ai/artifact/8DTgXr3eJ1bAhCAXwY4Q6M), replacing his T4 answer q6.
- **CTX-038**: On the same page Josh accepted loss items 1, 3, 5, 6, 9 and 11 as known gaps, and asked for items 2, 4, 8 and 10 to be fixed (see "What can still lose a row"). Each accepted gap gets its own Linear issue (Josh, 09:30Z).
- **CTX-036**: Josh said no to a plugin rule that approves the model's board write (T7, 2026-11-22 01:43Z), and chose instead to have "the plugin do the save itself" (01:42Z). He approved the T8 build and live test.
- **CTX-039**: No write with no safety check (2026-11-22 10:01Z): "I don't like writing with no safety check at all. That doesn't fly with me. We need to figure out a safer way to do that." This stands beside CTX-035. A check that can lose a row breaks CTX-035, so the check may change a row and may never stop one (R11).
- **CTX-040**: Josh chose the safety design on 2026-11-22 (REF-011). At 10:36Z, in the design thread, he chose Option B: a check in code on every row, plus a small model's look at the title and preview that can only hide text ("switch to B on those terms", the terms being section S11 of REF-011). That allows one model call by the module, which is a trust boundary change, and he approved it there. At 10:54Z, on a decision card, he chose the strict secret rule (R12) and accepted what it still misses as a known gap, low priority.
- **CTX-041**: Safety beats simple (2026-11-22 10:36Z): "always lean towards safe over simple" and "Safety always wins." Where a simpler way and a safer way both exist, this record takes the safer one.
- **CTX-042**: The board keeps rows for 60 days, not 30 (2026-11-22 10:05Z, project chat). Only rows in the board's own database are ever deleted, never anything in a thread. The board shows how much of its storage is in use, and Josh checks that after 30 days.
- **CTX-043**: On the safety choices page (REF-012, 2026-11-22 10:26Z to 10:28Z) Josh said yes to the two row marks `check` and `dropped` (R14), to the board follow-up (IMP-002), and to four known limits: text meant to trick an AI, who wrote a row, other plugins, and the board filling up (see "Known limits of the safety check" and loss item 12). Each accepted limit gets its own Linear issue.
- **CTX-044**: On the Milestone 1 approval page (2026-11-22 09:54Z to 09:57Z) Josh said yes to IMP-009 (every row carries its build version, row shape changes only add fields, the board reads older shapes) and to the abilities check in Section 3.

Rule 0 Softworks requires each repository to adopt the Software Layer Roles and Dependency Policy through a scope-adoption ADR. This record is that ADR for this repository.

## Decision

### 1. What we build

Two parts.

**The board** is one private Artifact page, pinned in Claude. It keeps a small database of rows. It shows the newest row of each thread: Priority on top (rows Josh has not clicked), then the rest grouped by day. Each row shows the thread title, project name, state and a short preview, and links to the thread. Clicking a row marks it seen. Address: `https://claude.ai/artifact/ByotUv4ViCSyFxtHF5cbNG`, collection `turns`.

**The plugin** is a Claude Code plugin, `thread-queue`, with one hooks module. Think of a clerk standing next to the thread's outbox. Each time the thread sends Josh something, the clerk writes one line in the board's log book. The clerk never touches the message and never stops it. The clerk uses only the printed form, blacks out anything that looks like a password, and stamps the line so Josh can see it was touched.

1. The module listens to the calls that tell Josh something (rule R1).
2. It lets each call through unchanged and hands the answer back unchanged.
3. If the call worked, it builds the row in code, cleans its text, hides anything that looks like a secret (R12), and saves the row in the plugin's own note.
4. Right before the write, the safety check looks at the row again (R11 to R13). Then the module writes the row to the board with its own `ArtifactData` call. The thread's reply does not wait for any of this.
5. At the end of the turn it waits up to 8 seconds for writes still in flight, and tries again any that failed.
6. A row that could not be written stays in the note and is tried again at the next row and the next turn end.

The thread's model writes nothing and is asked for nothing. There is no gate and nothing blocks a turn. The safety check can change what a row says. It can never stop a row.

### 2. Row rules

These are the product.

- **R1**: A call owes one row if it is one of: `mcp__hearthbot__post_message`, `request_decision`, `post_widget`, `suggest_connectors`, `connect_device`, `start_remote_control`, `set_thread_resolved` with `resolved: true`, `show_helpline_card`, or `PushNotification` (T4 section 1, Josh's q1 to q3). Every other call owes nothing.
- **R2**: A call that was refused or failed owes no row.
- **R3**: One row per owing call. A later call gives a fresh row, and the board shows the newest per thread (Josh's q4). A turn that replies and then resolves gives two rows and ends on the resolve.
- **R4**: Every field is built by code. Thread id from `CLAUDE_CODE_REMOTE_SESSION_ID`. Time from the clock, never the same time twice, since it is part of the row id `<thread>.<epoch ms>`. Link `https://claude.ai/code/<thread>`. Title and project from `get_session` (CTX-025). Preview: the first line with text of what was posted, cut to 200 characters, or a fixed neutral text for the connect, resolve and helpline calls. If the title lookup fails, the thread id stands in. If the project lookup fails, the row goes out with no project. Title, project and preview are cleaned and checked for secrets before the row is saved (R12). `build` is the version of the build that wrote the row (IMP-009): the version shape, at most 32 characters, or `unknown` if it does not fit. `check` and `dropped` are set by R14.
- **R5**: The module never blocks, changes or refuses a thread's call.
- **R6**: The row is saved in the note before the board is tried. A failed write is kept and tried again, oldest first. At most 20 rows wait. The oldest is dropped past that, and the drop is logged.
- **R7**: Turn end waits at most 8 seconds for the board. A broken board must never trap a thread. The model look (R13) never runs past what is left of this wait: when time is short the look is skipped and the text is hidden.
- **R8**: The only tool the module calls is `ArtifactData`, action `set`, with the board address and collection fixed in code. The only lookup is `get_session` on `claude-code-remote`, read-only. The thread's own record is read before every write pass, so a renamed title shows on the next row. The parent's record is read until a project name is found, then not again in that run. The only model call is the one in R13.
  - **The last look.** Right before every write, code compares the call with the one approved shape. It passes only if: the tool is `ArtifactData`, the action is `set`, the address equals the board constant, the collection is `turns`, the call has exactly the keys `tool`, `action`, `url`, `collection`, `doc_id` and `data`, the `doc_id` is this run's thread id, a dot and a 13 digit time, and the row passes the shape rule in R11. If it fails, the bare row (R11) is built and checked the same way.
  - **Add only.** The call never carries `if_version`, and the board refuses a `set` without it on a row that exists (CTX-048). So the module can add rows. It cannot change or delete one.
- **R9**: Outside a cloud thread (no thread id) the module does nothing.
- **R10, state**: code picks the state from the tool called (CTX-037):

| The thread did this | State |
|---|---|
| Asked on a decision card | `needs_you` |
| Posted a card with a button, or a draft to send | `needs_you` |
| Asked to connect an app or his computer | `needs_you` |
| Resolved the thread | `finished` |
| Anything else: a reply, a chart, a phone alert, a helpline card | `review` |

Under this table a plain reply that asks Josh a question shows as `review`, and `failed` is never used.

- **R11, the safety check: change, never stop** (CTX-039, CTX-040). The plugin's own check runs on every row.
  - It may clean a row, hide text in it, or swap it for a bare row. It may never hold a row back or drop one. The one exception is R9: with no thread id there is no row to address.
  - It runs right before the write, on every row, whatever path the row took: fresh, tried again, or read back from the note. A row from the note gets no shortcut, because the note can be edited on the thread's machine (CTX-047). The thread id used for the write is always the one read from the environment in this run. The one in the note is only compared with it.
  - **Row shape.** A row has exactly these fields: `thread`, `title`, `state`, `updated_at`, `preview`, `url`, `build`, `check`. Two more may be there: `project` and `dropped`. Nothing else. `thread` is `session_` and then letters and digits, at most 64 characters, and equals this thread's id. `title` and `project` are cleaned text of 1 to 200 characters. `preview` is cleaned text of 0 to 200 characters. `state` is `needs_you`, `review` or `finished`. `updated_at` is written from the same number that is in the row id. `url` is exactly `https://claude.ai/code/` and then the thread id. `dropped` is a whole number from 1 to 9999.
  - **Bare row.** If a row fails the shape or the last look (R8), if any part of the check throws, or if a waiting row read from the note is damaged, a bare row goes out in its place. It is built from this thread's id, a time and the build constant only: the title is the thread id, the preview is the fixed text "Details hidden by the safety check", and `check` is `bare`. No free text. Its state is the row's own if that is one of the three allowed words, else `review`. Its time is the row's own if that is a whole number, not later than now plus one minute, and not older than 60 days. Otherwise it is the time now. Either way the rule in R4 holds: never the same time twice. It carries `dropped` when that count is above zero (R14).
  - If the bare row itself fails the last look, there is no valid thread id. Nothing is written (R9) and the log says so.
  - The rule to test: every waiting row gives exactly one row on the board. Its own row if it passes, a bare row if it does not.
- **R12, clean text and hide secrets.** Applies to the title, the project name and the preview, in this order:
  1. Anything that is not text becomes empty text.
  2. Only the first 2,000 characters are looked at.
  3. Control characters, invisible characters, characters that flip the reading direction and the Unicode "tag" block are removed.
  4. Every run of white space becomes one space, and both ends are trimmed.
  5. The secret check runs on the result. It comes before the cut, so a key that crosses the 200 mark is still found.
  6. The text is cut to its limit by whole characters.
  - Shapes the secret check knows: the header line of a private key block. Keys with a known start (`sk-`, `sk_live_`, `rk_live_`, `ghp_` and its siblings, `github_pat_`, `glpat-`, `xox` tokens, `AKIA`, `AIza`, `npm_`). A web token in three parts that starts `eyJ`. The word Bearer followed by a long token. A user name and password inside a link. A word such as password, passcode, secret, token, api key or credential with a value after it. Any unbroken run of letters, digits and the signs `+ = _ -` that holds both letters and digits. Claude's own ids are let through (they start `cmsg_`, `session_`, `chan_`, `cse_` or `toolu_`).
  - **Strict rule** (Josh, CTX-040): the check hides on any doubt. The unbroken run counts from 16 characters. The word rule counts when the value follows in plain words too ("the password is ..."), not only after a colon or an equals sign.
  - On a match the whole field is swapped for its stand-in, not just the matched part. Preview: "Preview hidden by the safety check". Title: the thread id. Project: left out. The row's `check` is then `hidden`.
  - The swap happens before the row goes into the note, so the note never holds text a code rule hid. That text is never logged and never stored. Text the model later hides (R13) does sit in the note until its row is written, because the look runs at the door.
  - The patterns are simple ones that run in a single pass, so none can slow down on a long line. Cleaning twice gives the same result. It runs when the row is queued and again at the door.
  - A false alarm costs one title or preview. It never costs a row.
- **R13, the model look** (Josh, CTX-040). After the code rules, a small Claude model is asked whether the title and preview are fine to show.
  - It can only hide. Its answer can turn a shown title or preview into its stand-in. It can never stop a row, delay one past its time limit, or change a row in any other way.
  - It runs second. Only text that already passed R12 is sent. Text a code rule hid, and the fixed stand-in texts, are never sent.
  - It reads the cleaned title and the cleaned preview of one row, in one call. Nothing else: no project name, no thread content, no other row.
  - It answers with one of a few fixed words: fine, hide the preview, hide the title, hide both. Hide covers a secret in any shape, private details about a person, and text written as an order to an AI.
  - No answer means hide. Too slow, an error, an empty reply or a word not on the list: the title and preview are swapped for their stand-ins, the row goes out, and `check` is `hidden-noai`.
  - Time limit: about 3 seconds a row, and never past the turn end wait (R7).
  - It runs in the write pass, right before the last look (R8). The thread's own call and reply never wait for it (R5).
  - No verdict is saved. A row read back from the note is looked at again, because a verdict in the note could be forged (CTX-047).
  - If the text talks the model into "fine", the row is where the code rules alone would leave it. Those still ran.
  - Exactly one model call is allowed, `$.model.complete` or `$.model.classify`. The builder picks one in the live test (OPEN-008). `$.model.fork` is never used.
  - **Allowed only after the live test passes.** Until the test in OPEN-008 has passed, the module makes no model call. If the test fails, the builder stops and tells Josh first. Then the module makes no model call at all, and this record is changed back before any code: R13, the `$.model` lines in Sections 3, 5 and 6, and the `hidden-ai` and `hidden-noai` marks in R14 come out. This is the one fallback Josh approved (CTX-040). It is not a free choice of the simpler way (CTX-041).
- **R14, marks and log.** What the check did shows on the row, in the log and on the board.
  - `check`, on every row: `ok` (both checks passed), `hidden` (a code rule hid text), `hidden-ai` (the model said hide), `hidden-noai` (the model gave no answer in time, or failed), `bare` (the row was rebuilt with no free text).
  - `dropped`, only when above zero: how many waiting rows the module gave up on since the last row that landed (R6). The count is kept in the note under its own key and goes back to zero only after a row that carried it has landed.
  - One debug log line per row: the row id, the state and the check result. For hidden text it names the field and the rule or cause. For a bare row it gives the reason in a few fixed words. It never holds the hidden text.

The four states and their meanings, in order (T4 section 2, Josh's q5): `needs_you` (the work cannot go on until Josh answers or acts), `failed` (the work cannot be done and nothing is asked), `finished` (the thread resolved itself this turn), `review` (anything else).

### 3. Language and runtime

- TypeScript (CTX-016). The module's `.ts` files run inside Claude Code, on Claude Code's own runtime (CTX-024, seen working on 2.1.330). The plugin starts no process of its own. Which runtime that is (bundled, or the machine's Node) is Claude Code's choice, covered by NEG-004.
- Use only TypeScript syntax that can be removed: no enums, no namespaces and no parameter properties. Imports name the `.ts` file.
- `tsc`, set to emit nothing, is the type check (`npm run typecheck`). Tests run on Node 24.22.3's built-in test runner (`npm test`). `typescript` and `@types/node` are development dependencies only.
- `claude plugin validate .` prints Claude Code's own list of what the module can do (`hooks:`, `calls:`, `env reads:`, `env writes:`). The lasting list: hooks `tool.call` on the nine R1 tools and `turn.complete`; calls `$.clock.after`, `$.clock.now`, `$.env.get`, `$.mcp.call`, `$.store.get`, `$.store.set`, `$.tool.call`, `$.tool.list`, `$.ui.log`, and one model call for R13, `$.model.complete` or `$.model.classify`, exactly one of the two (OPEN-008); env reads `CLAUDE_CODE_REMOTE_SESSION_ID`; env writes nothing. The T8 build also listens on `tool.judge` for `ArtifactData`. That listener is test evidence only (the T8 reviewer found it proves little) and is dropped from the lasting build.
- Proposal for `RUL-3166`: keep the expected list in the repository, and make a lint step that compares the printed `hooks:`, `calls:`, `env reads:` and `env writes:` lines with it and fails on any difference. `validate` alone is not enough: it passed with warnings in T8 and would still pass with a new call added. Whether CI can run the `claude` command is not proven.
- A second build check, the source test, is a plain test on the text of the two plugin files. It runs in CI with no `claude` command. It passes only if: `$.tool.call(` appears once in `hooks/register.ts`. `$.mcp.call(` appears only with `claude-code-remote` and `get_session`. None of `$.http`, `$.process`, `$.fs`, `$.env.set`, `$.prompt`, `$.session`, `$.agent` appears. `$.model.` appears once, as the one call R13 allows, and `$.model.fork` never appears. `hooks/row.ts` has no `import` and no `$`.
- `build` comes from a constant in `hooks/register.ts`. A test fails when it differs from the version in `.claude-plugin/plugin.json`.
- Release check: the zip is built from a merged commit and its checksum is recorded. After the upload, the checksum of the file that reached a thread's machine is compared with it, as T8 did.
- A browser cannot run TypeScript, so the board's script is compiled with `tsc` when the board is published. The compiled file is published beside the page and is not committed.

Rationale: the module is code and runs whether or not the model remembers (CTX-014). Its own call skips the safety check that refused one model-written row in five (CTX-021, CTX-024), which is what CTX-035 needs. In that check's place the plugin's own check runs on every row (R11 to R14), which is what CTX-039 needs. It finds the title and project itself (CTX-025), which removes the only reason the model had a part. Nothing is hosted, no network rule changes, and no secret is stored.

### 4. Software layers adoption (policy Section 2.2 fields)

| Field | Value |
|---|---|
| Policy | Software Layer Roles and Dependency Policy, `R0S-ARCH-LAYERS`, version `2.0.0-rc.4` |
| Immutable artifact identifier | File `docs/architecture/software-layers-v2.0.0-rc.4.md` in `Rule-0-Softworks/rule-0-softworks-platform` at commit `32e4c1c548d3bbef05dd66460f72536cf5253872`, SHA-256 `84f1792b0a3b583cfd0486aa5e40e31fd71e542d2d88f6bf8e88d610155b6fcd` |
| Previously Active policy | None. This is a new repository. |
| Governed scopes | `hooks/register.ts`, `hooks/row.ts` and `board/board.ts` |
| Exclusions | Test files (`*.test.ts`), JSON manifests and config, and documentation |
| Adoption owner | Josh |
| Approval date | 2026-11-22 |
| Classification record | Section 5 of this record |
| Same-role compositions (6.2) | None |
| Consumer transport Connectors (6.3) | None |
| Persistence Connectors with Entity access (6.4) | None. The note and the board store plain JSON and stay Entity-agnostic. |
| External facility mappings (Section 7) | Section 6 of this record |
| Incorporated exception ADRs | None |
| Enforcement | Code review, plus the `claude plugin validate .` list and the source test in Section 3 |
| Effective date | The approval date |

### 5. Classification record

The planned six gate files no longer match: there is no gate. The T8 build has two files, and this proposal keeps them.

One limit shapes the split. Claude Code's checker lets the `$` object be passed only to top-level functions of the module's own file (T8, `claude plugin validate`). So every `$` call has to live in `hooks/register.ts`. That file is classified by section, as the board's script already is. Each section starts with a comment naming its role.

| File or section | Role | What lives there |
|---|---|---|
| `hooks/register.ts`, Composition Root | Composition Root | `register()`: names the events and the nine tools, wires the handlers |
| `hooks/register.ts`, Controller | Controller | The `tool.call` and `turn.complete` handlers: pass the call on, then hand the result to the Service. It calls only the Service |
| `hooks/register.ts`, Service | Service | The conductor. For each waiting row it runs the steps in order: clean and hide secrets, the model's look, the bare row if anything failed, the last look, and only then the write. It holds no rule of its own. It passes `$` on and never calls anything on it |
| `hooks/register.ts`, Manager | Manager | The waiting rows: add, keep, write oldest first, drop past 20 and count the drops (R14), one write at a time. It does what the Service tells it, hands every read and write to the Connector, and never calls the Service |
| `hooks/register.ts`, Connector | Connector | The only code that calls `$.store`, `$.tool.call`, `$.mcp.call` and the one `$.model` call (R13) |
| `hooks/row.ts` | Support of the Service | Every rule, as pure functions the Service section calls: which call owes a row, its state and preview, the row's shape, reading the lookup's answer. The safety check's pure parts: the last look, the row shape, cleaning, the secret rule, the bare row, and reading the model's answer (R8, R11 to R13). Pure: no imports, no file, network, clock or environment |
| `hooks/row.ts`, types | Model | The shapes of a waiting row, a row and a checked call |

Who calls the safety check (settles OPEN-010, the planning thread's answer, 2026-11-22):

- The design file has the Connector section call the last look. The policy does not allow that: its closed list gives a Connector only Provider and Model, and gives a Manager no Service.
- The one allowed road from a handler to the board is Controller, then Service, then Manager, then Connector. So the Service calls the safety check, and the Controller calls only the Service.
- The conducting code sits in `hooks/register.ts`, not in `hooks/row.ts`, because `$` can only be passed along inside the module's own file. The rules stay pure functions in `hooks/row.ts`. They are owned support of the one Service (policy 3.1, and 6.2 rule 5), so no other section calls them.
- **The door is kept by the types.** The last look returns a checked call, a type of its own. The Manager's and the Connector's write functions accept only that type. Code that skips the last look does not pass the type check.
- The source test (Section 3) also checks that the Service section never calls anything on `$`.
- No file is added for the safety code.

The board is a page, `board/index.html`, that holds markup and styles only, and one script, `board/board.ts`, classified by section:

| Section of `board/board.ts` | Role | What lives there |
|---|---|---|
| Client | Client | Drawing rows, the click handler, status text |
| Service | Service | Newest row per thread, Priority rule, day grouping |
| Connector | Connector | The only code that calls the page database |
| Transformer | Transformer | Stored row to display row |
| Model | Model | The display row shape |

Roles this scope does not use: Domain, Gateway, Provider (first-party), Contract and Entity. The plugin has no Transformer and no Client. The board has no Controller and no Manager. With no Domain types, each Service holds its rules, as policy Section 5.3 allows.

Dependencies used, all inside the policy's allow-list. An earlier text of this table listed Controller to Manager, which is not on the list. That edge is gone.

| From | To |
|---|---|
| Controller | Service, Model |
| Service | Manager, Model |
| Manager | Connector, Model |
| Connector | Model |
| Client | Service, Connector, Transformer, Model |
| Transformer | Model |

The time and the thread id are read in `hooks/register.ts` and passed into `hooks/row.ts` as plain values, so the Service reads no clock and no environment.

### 6. External facility mappings

| Facility | Mapping | Who may call it |
|---|---|---|
| Module events (`tool.call`, `turn.complete`) and `next` | Framework inbound handling | Composition Root and Controller sections |
| `$.env.get`, `$.clock` | External Provider abstraction | `hooks/register.ts` only. Values are passed in. |
| `$.store` (the plugin's note) | External Connector facility | Connector section only |
| `$.tool.call` (`ArtifactData` set on the board) | External Connector facility | Connector section only |
| `$.mcp.call` (`claude-code-remote` `get_session`) | External Connector facility | Connector section only |
| One model call, `$.model.complete` or `$.model.classify` (R13) | External Connector facility | Connector section only |
| `$.tool.list`, `$.ui.log` | Diagnostics | `hooks/register.ts` only |
| The page database (`claude.use("db")`) | External Connector facility | The board's Connector section only |
| The browser document | Framework response writing | The board's Client section only |

Not allowed in the module: `$.http`, `$.process`, `$.fs`, `$.env.set`, `$.prompt`, `$.session`, `$.agent`, `$.model.fork`, any `$.model` use other than the one call in R13, and any tool call other than the one in R8. Adding one is a trust boundary change: stop and ask Josh.

Changed on 2026-11-22: `$.model` was on this list. Josh approved one model call, for R13 only, as a trust boundary change (CTX-040). What crosses the boundary: the cleaned title and preview of one row go to a small Claude model on the same Anthropic service the thread already runs on. No new party sees the text. Each answered call counts against Josh's plan (CTX-046). The call is allowed only after the live test passes (R13, OPEN-008).

## Consequences

### Positive

- **POS-001**: Reporting is done by code. The model plays no part, so a model that skips an instruction cannot lose a row.
- **POS-002**: The board write skips the safety check that refused one model-written row in five (CTX-021, CTX-024). Seen in one thread's log only (OPEN-004).
- **POS-003**: One list across every project, from one upload on the account Plugins page.
- **POS-004**: Nothing is hosted, no network rule changes, and no secret is stored.
- **POS-005**: No turn is ever blocked. A broken board costs a thread at most 8 seconds at turn end.
- **POS-006**: The row rules are pure functions in one file, so every rule has a plain test.
- **POS-007**: No extra tool call by the model, and the plugin starts no process of its own on the thread's machine.
- **POS-008**: Every row is checked by code right before it is written, and the module can only add rows (R8, R11). A changed note or a bug cannot send a row of another shape or to another place.
- **POS-009**: What the check did is visible: a mark on every row, a count of dropped rows, and a log line (R14).

### Negative

- **NEG-001**: Plugin code on Josh's account writes to his private board from every cloud thread, with no approval prompt and without Anthropic's own safety check on that write (CTX-045). The plugin's own check runs on every row instead (R11 to R14). The free text it writes is the thread's title (a thread can rename itself) and the first line of what it told him, each up to 200 characters.
- **NEG-002**: The design depends on Josh's account having no organization guard (CTX-023). If the account moves to Team or Enterprise, or gains managed settings, the module's call is refused until an admin allows it (CTX-032), and rows wait in the note and are lost with the machine.
- **NEG-003**: The project name rests on an undocumented title format and an undocumented wrapper around the parent's record (CTX-025). If either changes, rows go out with no project name.
- **NEG-004**: The design rests on observed behavior (CTX-019 to CTX-026) and on a type file the docs say "can be older than the Claude Code version you have installed". Anthropic may change any of it without notice.
- **NEG-005**: The state is coarse: a question asked in a plain reply shows as `review`, and `failed` is never used (CTX-037).
- **NEG-006**: Waiting rows (thread id, time, state, preview) sit in a small file on the thread's machine until written.
- **NEG-007**: A row leaves Priority when Josh clicks it on the board, not when he opens the thread some other way.
- **NEG-008**: The main chat writes no rows (CTX-022).
- **NEG-009**: A new build is not instant. A running thread keeps the build it loaded until Claude Code restarts on its machine, so old and new builds write rows side by side for a while. Removing the plugin is not instant either.
- **NEG-010**: Whether a title or preview shows now depends partly on a model's answer, which can differ from run to run. Whether a row is written does not.
- **NEG-011**: One model call per row on Josh's plan, and up to about 3 seconds more before a row lands. No cost figure has been measured.
- **NEG-012**: The strict rule hides on any doubt, so a harmless title or preview can be hidden. On the 127 rows on the board at 2026-11-22 10:08Z the code rules would have hidden none. That trial counts false alarms only. It does not show catches, because none of those rows held a real secret.

### Known limits of the safety check

Josh accepted each of these as a known gap (CTX-040, CTX-043). Each gets its own Linear issue.

1. **A secret in a shape the checks do not know**, such as a password in plain words. Low. The code rule and the model would both have to miss it. Limit of the harm: 200 characters, first line only, Josh's private board, 60 days.
2. **Text written to steer an AI that reads the board.** Low. The model look may hide it. Code cannot tell. The board is for Josh's eyes, and agents are told rows are untrusted.
3. **A row cannot prove who wrote it.** Low. Any of Josh's threads can still write to his board directly, through Anthropic's check. The marks say what the plugin did, not who wrote the row.
4. **Other plugins on the account.** Medium. One that runs before this module can refuse its write (loss item 5) or change it, and can read or change the model call. Read in the docs, not tested.

### What can still lose a row

From T8, "What can still lose a row", the T8 reviewer, and a read of `hooks/register.ts` at commit `cda4acc`. Josh's answers (T4 q8 for item 7, CTX-043 for item 12, CTX-038 for the rest) are marked on each item. Accepted items are known gaps, each with a Linear issue. Fix items must be fixed in the build-out, each by its own change Josh approves. Every loss is silent to Josh: it shows only in the thread's debug log, `/tmp/claude-code.log`.

1. **Accepted.** The board stays down until the thread's machine is reclaimed. The waiting rows are on that machine and go with it. The plugin makes no network call of its own, so it has nowhere else to put them.
2. **Fix.** More than 20 rows wait at once. The oldest is dropped and the drop is logged. Fix: raise the limit.
3. **Accepted.** Josh stops a thread mid-turn. Claude Code refuses the module's calls until his next message (CTX-034). The row waits and goes out on the next turn, unless the machine is reclaimed first.
4. **Fix.** A board call that never answers. Turn end stops waiting after 8 seconds. Later writes queue behind the stuck call until Claude Code restarts, then go out from the note. If the machine is reclaimed before that restart, this becomes item 1. **Fix:** give each board write its own time limit, so later rows can go.
5. **Accepted.** Another plugin refuses the module's call on every retry.
6. **Accepted.** The account moves to a Team or Enterprise plan (NEG-002).
7. **Accepted.** Ways a thread reaches Josh that no tool call shows: approval prompts, crashes, threads run on his computer, messages sent outside the project app (T4, Josh's q8 accepted these blind spots).
8. **Fix.** Saving the note fails (logged as `note not saved`), and Claude Code then restarts. The rows held only in memory are lost. Fix: try the save again before moving on.
9. **Accepted.** Building or storing the row throws (logged as `row not queued`). That row is never stored.
10. **Fix.** Reading the note fails the first time a row is told or written in a run. The error is swallowed, and the next save overwrites the note, losing rows an earlier run left. Fix: do not save over the note when the read failed. In the T8 build, damaged rows in the note are also dropped silently when it is read. Under R11 a damaged row is not dropped: it goes out as a bare row.
11. **Accepted.** A turn on a machine the plugin has not reached yet, after an upload or an update (T1: about a minute).
12. **Accepted.** The board fills up. Its database holds at most 25,000 rows. Past that, every write is expected to fail (read, not tested), rows wait in the note, and they can be lost with the machine (item 1). The busiest hour so far had 44 rows. Eight such hours a day for 60 days is about 21,000 rows, close to the limit. The board shows its use and Josh checks it after 30 days (IMP-005). The board follow-up adds a warning at 80 percent (IMP-002).

### Open, not proven

- **OPEN-001**: Project name. The first live rows had no project, because the parent's record comes wrapped (CTX-025). The fix is in build `0.0.1-t8` (commit `cda4acc` on the T8 branch). Josh installed it at 2026-11-22 09:04Z. Settled: at 09:20Z rows from two threads of another project ("Choice Movers") carried `project: Choice Movers` (T8, "Live test, a project name from another project"). By 09:24Z, 37 plugin rows from 10 threads in at least 3 projects.
- **OPEN-002**: Settled 2026-11-22: code picks the state (CTX-037).
- **OPEN-003**: A failed write kept and retried is shown only by unit tests, not live. Proposed Milestone 1 acceptance check: one failed write kept and retried live, in one test thread.
- **OPEN-004**: The log line `Skipping auto mode classifier for ArtifactData: called by plugin thread-queue` was read only in the T8 thread's own log. For the other four threads with rows, the proof is the rows landing and, for Josh's test thread, no `ArtifactData` call by the model in its transcript.
- **OPEN-005**: The main chat. Josh wants it on the list only by a checked, agent-free way (T4 q7). None is known.
- **OPEN-006**: T2 stays open until rows from all four models are seen on this design.
- **OPEN-007**: Settled 2026-11-22 (CTX-038). Left to do: the four fixes (items 2, 4, 8, 10) and a Linear issue for each accepted gap.
- **OPEN-008**: Nobody has seen a plugin's model call work in a cloud thread. Step one of the `RUL-3168` build is a test build that makes the call on one harmless line and one made-up key and logs each answer and its time. It needs one upload by Josh. This record allows the model call only after that test passes. If it fails, the plugin makes no model call, this record is changed back before any code (R13), the builder stops and tells Josh first, and the build stays on the code rules alone (R11, R12, R14).
- **OPEN-009**: How well a small model spots a secret in one line. No trial was run. The secret list has not been tried on real secrets either.
- **OPEN-010**: Settled 2026-11-22 (Section 5): the Service calls the safety check, the Controller calls only the Service, and the write accepts only a checked call. Two proposals came with that answer and wait on Josh (OPEN-015, OPEN-016).
- **OPEN-015** (PROPOSED, pending Josh): a Gateway for the model's look. By the policy a Manager is for the application's own stored data (5.6), and an outside capability such as a model's answer belongs to a Gateway (5.5). This record says the scope uses no Gateway. So either the record adds a Gateway section to `hooks/register.ts`, or it records an exception. The same question applies to the `get_session` lookup, which reads data an outside system owns. Until Josh answers, no code for the model's look is written.
- **OPEN-016** (PROPOSED, pending Josh): a second compare inside the Connector. Right before `$.tool.call` the Connector compares the four fixed things (tool, action, address, list name) with the constants once more, as its own support (policy 3.1). If it ever fails, nothing is written by that call, the failure goes back to the Service, and the Service sends a bare row through the same door. This is not in the design Josh approved. It adds a check and removes none.
- **OPEN-011**: Section 3 still lists `$.tool.list`. The safety design does not need it. Dropping it from the lasting list is Josh's call.
- **OPEN-012**: Whether a thread's machine is ever reused for another thread. Assumed not. If it is, R11 would turn the other thread's waiting rows into bare rows for this thread.
- **OPEN-013**: Add only (R8) and a retry. If a write lands but reports a failure, the retry is refused because the row exists. As written, that row would wait forever at the front of the line and could push other rows past the waiting limit. Proposed rule, found in review of `RUL-3192`: a refusal because the row already exists counts as written, since row ids never repeat. It is a change to a row rule, so it needs Josh's yes before `RUL-3168` code.
- **OPEN-014**: Two points the `RUL-3168` brief must settle, found in the same review. The let-through for Claude's own ids (R12) must match the full id shape, not just the start, or a key glued to `session_` would pass. And which `check` value wins when two apply, and which value a row carries when the look is skipped near turn end (R7).

## Alternatives Considered

### The turnstile: block the turn until the model writes the row

- **ALT-017**: **Description**: A plugin's Stop hook blocks a turn that told Josh something until the thread's model writes its row. After two blocks the gate opens. This was the design in earlier drafts.
- **ALT-018**: **Rejection Reason**: The model's write is judged by the server-side safety check, which refused one of five writes from other projects (CTX-021), and the gate then gave up after two blocks, so the row was lost. In T2, three of four first runs lost their rows the same way. That breaks CTX-035. The gate also bounced every main chat turn twice for nothing (CTX-022). The model, not code, chose the label.

### Let only the board write skip the safety check (T7)

- **ALT-019**: **Description**: The turnstile stays, and a plugin rule approves exactly one call (`ArtifactData` set on the board, collection `turns`) so the safety check is not asked.
- **ALT-020**: **Rejection Reason**: Josh said no on 2026-11-22 (CTX-036). It still needs the model to make the write, and it widens what the model may do without a check.

### The check in code only, with no model look

- **ALT-021**: **Description**: R11, R12 and R14 with no R13. No model call, no new ability, the same answer every time.
- **ALT-022**: **Rejection Reason**: It is simpler, not safer. A secret in plain words gets no second look. Josh chose the model look on top (CTX-040, CTX-041). It stays the fallback if the model call does not work in a cloud thread (OPEN-008).

### No reply text on the board at all

- **ALT-023**: **Description**: The preview is always a fixed label such as "Replied" or "Needs you".
- **ALT-024**: **Rejection Reason**: Safest for content, but it removes the at-a-glance preview. Josh was offered it twice and did not choose it (CTX-040).

### A safety control that can refuse a row

- **ALT-025**: **Description**: A second plugin that inspects this module's call, a flood limit that drops rows, or a check that holds back a row it does not like.
- **ALT-026**: **Rejection Reason**: Each one can lose a row, which breaks CTX-035.

### An instruction that asks threads to report

- **ALT-001**: **Description**: A standing project instruction tells each thread to write its row at the end of every turn.
- **ALT-002**: **Rejection Reason**: It worked in a test, but nothing enforces it. Josh rejected it (CTX-014).

### The board lists sessions itself

- **ALT-003**: **Description**: The page asks Claude's built-in session connector for all sessions and needs no plugin.
- **ALT-004**: **Rejection Reason**: The page can find the connector but its reads are refused (CTX-011, CTX-022). Worth a retest later, since it would need no setup and would also cover the main chat.

### A command hook with no agent step

- **ALT-005**: **Description**: A command hook script records each finished turn by itself.
- **ALT-006**: **Rejection Reason**: A command hook's input has no title, project or reply text (CTX-008). The hooks module chosen here is the same idea done from inside Claude Code, where it can read the title and project itself.

### A hosted collector

- **ALT-007**: **Description**: A hook posts each finished turn to a small hosted service, and the board reads from there.
- **ALT-008**: **Rejection Reason**: It needs hosting, a secret and a network rule change in every environment.

### The Reddit recipe

- **ALT-009**: **Description**: Stop and Notification hooks in the settings file on Josh's computer append to a shared log.
- **ALT-010**: **Rejection Reason**: It cannot see cloud threads (CTX-002), which are the only sessions in scope.

### Built-in features only

- **ALT-011**: **Description**: Each project's thread list and its finish notifications.
- **ALT-012**: **Rejection Reason**: Both are per project. Checking five projects one by one is the problem this tool exists to remove.

### Plain JavaScript

- **ALT-013**: **Description**: Write the plugin and the board in plain JavaScript, as the prototype is.
- **ALT-014**: **Rejection Reason**: Josh requires TypeScript (CTX-016).

### TypeScript compiled to JavaScript before upload

- **ALT-015**: **Description**: Compile the module with `tsc` and ship the compiled files.
- **ALT-016**: **Rejection Reason**: Claude Code loads a `.ts` module directly (CTX-030, CTX-024). Compiled files would have to be kept in step with the source by hand.

## Implementation Notes

- **IMP-001**: Milestone 0 is done except OPEN-003 to OPEN-006, and the four fixes in OPEN-007. The T8 test build is on branch `claude/project-thread-5rsmom` and is never merged. The build-out (Milestones 1 and 2) is not approved.
- **IMP-002**: Rows on the board are written from thread text and are untrusted. The board shows titles and previews as plain text (a preview can hold markup, seen in T8) and follows a link only if it points at `https://claude.ai/`.
  - Board follow-up, approved by Josh (CTX-043), built as its own issue after the board page (`RUL-3169`):
    - The board checks each row's shape when it reads it. An odd row is shown in its own group with a warning, as plain text, with no link. It is never hidden.
    - The board ignores the row's `url` and builds the link itself, `https://claude.ai/code/` plus the thread id, only when the thread id fits the pattern. The rule "starts with `https://claude.ai/`" also allows public pages that anyone can publish there.
    - The board shows the marks (R14). A row with no `check` shows "not checked": it was written before this build, or not by the plugin.
    - The board shows counts of hidden, bare, odd and dropped rows, rows by build, and a warning at 80 percent of the 25,000 row limit.
- **IMP-003**: A row holds the thread id, title, project name, state, time, a one-line preview and a link. It also holds `build`, `check` and, when above zero, `dropped` (R4, R14). No prompts, full replies or tool input are stored. The T8 build also writes `gate: "t8-plugin"` as a test marker.
- **IMP-004**: Install: remove any older Thread Queue plugin (`thread-queue-turnstile`), then upload the `thread-queue` zip on the account Plugins page. Two Thread Queue plugins at once spoil the proof and bring the gate back.
- **IMP-005**: The board removes rows older than 60 days (Josh, CTX-042). Only rows in the board's own database are ever deleted, never anything in a thread. Its database holds at most 25,000 rows. The board shows how much of that is in use, and Josh checks it after 30 days.
- **IMP-006**: Work is assigned under the Agent Routing and Capacity Contract v0.9. Josh approves each issue and its tier before work starts. Agents do not merge pull requests. A Haiku worker makes all Linear writes from an exact spec. Any change to what the module may call (Section 6) is a Specialist trigger.
- **IMP-009** (for NEG-009, approved by Josh, CTX-044): every row carries the version of the build that wrote it. Row shape changes are additions only, and the board reads every older shape. The waiting-rows note stays readable by the next build. After an upload, the board can show which build wrote each thread's newest row.
- **IMP-007**: Success is the Milestone 2 check: threads in at least three projects finish turns within the same few minutes and all show on the board, and one week of use gives a count of missed turns.
- **IMP-008**: To check a thread: its Claude Code log at `/tmp/claude-code.log` shows `hooks module thread-queue@synced loaded`, and a line `thread-queue: row <id> written by the plugin` per row, or `not written, kept` with the reason. With the safety check, each row's line also carries the check result (R14).

## References

- **REF-001**: Related ADRs: none yet. A second place to record turns (the Milestone 3 safety net) will need one.
- **REF-002**: Plan: Thread Queue MVP Gameplan, https://claude.ai/artifact/TRJjujoLPsyw3gGggp6KFy
- **REF-003**: The board, https://claude.ai/artifact/ByotUv4ViCSyFxtHF5cbNG
- **REF-004**: Claude Code hooks reference, https://code.claude.com/docs/en/hooks
- **REF-005**: Claude Code projects, https://code.claude.com/docs/en/claude-projects
- **REF-006**: Software Layer Roles and Dependency Policy v2.0.0-rc.4, https://github.com/Rule-0-Softworks/rule-0-softworks-platform/blob/main/docs/architecture/software-layers-v2.0.0-rc.4.md
- **REF-007**: Agent Routing and Capacity Contract v0.9, https://github.com/Rule-0-Softworks/rule-0-softworks-platform/blob/main/docs/config/agent-routing-and-capacity-contract-v0.9.md
- **REF-008**: Mods reference, overview, API and admin pages, https://code.claude.com/docs/en/plugins/mods/reference and siblings
- **REF-009**: Mods type file, https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts
- **REF-010**: Milestone 0 reports `T1.md` to `T8.md`, Claude project shared folder, `thread-queue/m0-evidence/`
- **REF-011**: Safety design for the row write, `RUL-3168-safety.md`, Claude project shared folder, `thread-queue/m1-evidence/`
- **REF-012**: Josh's safety choices page, https://claude.ai/artifact/CHdL5uTkAMfDCvSEWEA6ru

---
title: "ADR-0002: The thread list as a panel inside the desktop app"
status: "Accepted"
date: "2026-11-24"
authors: "Josh (adoption owner and approver)"
tags: ["architecture", "decision", "claude-code-plugin", "trust-boundary"]
supersedes: ""
superseded_by: ""
---

# ADR-0002: The thread list as a panel inside the desktop app

## Status

Proposed | **Accepted** | Rejected | Superseded | Deprecated

Josh accepted this record on 2026-11-24 at 12:35Z by merging pull request 20, which added it. The panel's code came after that merge.

Changed on 2026-11-24 under `RUL-3224`, in the pull request that adds the code. Josh accepts the change by merging that pull request:

- FCT-215 was wrong and is corrected. The rows do not come in the structured part of the read's answer. They come as text lines. A live check with the finished row check found it.
- So the layout of that text is a third undocumented piece. P9, FCT-220 and NEG-202 now say three. If the layout changes, the pane says the list cannot be read and shows nothing new. It does not guess.
- No ability, no call and no rule of P1 to P8 or P10 changed.

Issue: `RUL-3224`. This record adds to ADR-0001. It changes nothing in ADR-0001's row rules, the board page, the stored rows, or the `thread-queue` plugin.

## Context

- **CTX-201**: The board's rows open browser tabs. Each row is a web link, and the desktop app hands a web link on a page to the browser. No change to the page stops that (tried three ways, 2026-11-23).
- **CTX-202**: An app link, `claude://claude.ai/code/<thread id>`, opens the thread inside the desktop app when Windows runs it. **This link form is not in Anthropic's documentation.** It is a test result, not a promise (FCT-212).
- **CTX-203**: Links in a panel of a cloud thread do nothing (web link, app link, reply-style link). Josh, 2026-11-24 09:29Z: "none of the sidebar links did anything".
- **CTX-204**: What worked, on Josh's Windows PC, 2026-11-24 09:29Z: a plugin panel in a local Code session, with a button that runs the app link as a local command. Josh's words: "OPen the thread box worked and opend a sidebar, none of the sidebar links did anything." Those words do not say a thread opened, so the press was run once more in step one (FCT-212).
- **CTX-205**: Josh approved the issue on 2026-11-24 at 09:37:15Z ("Yes."): the list as a side panel in the desktop app, a press opens the thread in the app, Windows PC only, the board page stays as it is.
- **CTX-206**: Josh asked on 2026-11-24 at 09:37:23Z for fewer questions. So the trust points in this record (P2, P5, P9) are the safest picks of the planning thread and the writer. Josh accepts or refuses them by accepting or refusing this record.
- **CTX-207**: ADR-0001 says "Cloud project threads only" (CTX-013) and lists local sessions as out of scope until a new ADR. This record is that ADR. The list still holds cloud threads only. What is new: the list is also shown inside a local session.
- **CTX-208**: Josh's standing rule, ADR-0001 CTX-041: "Safety always wins." Where this record differs from the planning thread's draft, it took the safer way. Each difference is listed under "Changed from the draft".

### Facts from Anthropic's documentation

The type file is `mods/types/claude-code.d.ts` in `anthropics/claude-code` (REF-202), read 2026-11-24. Its header says: "EARLY ACCESS: this surface may change between releases without notice." The docs pages are named in References.

- **FCT-201**: `$.process.run(argv, init)` runs a local command. Type file: "Runs a command on the host by its argument vector (no shell)", "run as the user the session runs as. CLI only". The time limit is `timeoutMs`: "30 seconds when absent, ten minutes at most". The child starts with the session's own environment and, unless told otherwise, in the session's working folder.
- **FCT-202**: A mod's command runs with no approval prompt. Mods admin page: "`$.fs` and `$.process` calls can skip permission rules and `PreToolUse` hooks", and `$.process.run` "Starts programs as the user".
- **FCT-203**: `$.session.machine()` gives `sysname`: "`Linux`, `Darwin`; `Windows_NT` on Windows". It is read inside Claude Code "with no program run".
- **FCT-204**: `$.http.fetch` and `$.fs` exist. This record does not allow them.
- **FCT-205**: A pane. `$.ui.open({ id, title })` "Opens a pane, a framed region the surface places and this plugin draws by hooking `ui.render` for `{ component: "Pane" }`". The elements come from `$.ui.resolve(e)`. A `Button` takes `onPress`. A button's children may be text only: "Children of strings and `Text` ... any other element is refused". `$.ui.invalidate("ui.render")` renders again. `$.ui.panes()` "Lists this plugin's own open panes".
- **FCT-206**: A rendered pane has limits. Mods reference, limits table: "Elements and text children in one tree | 20,000" and "Text in one tree | The first 100,000 characters are drawn".
- **FCT-207**: A command. `$.command.register({ name, description })` "Declares the slash command `/<name>` for this session". A `command.run` hook serves it.
- **FCT-208**: `$.tool.call` is the same call as in ADR-0001 CTX-031: "The check opens no dialog and asks no classifier: every ask becomes an allow". So the panel's read shows Josh no prompt.
- **FCT-209**: A module may call the global `h` to build an element. Type file: "The JSX factory ... JSX compiles to bare `h(...)` calls". So the module can stay a `.ts` file with no JSX in it.
- **FCT-210**: Where a plugin loads. Plugins page: "A cloud session, including one in the browser at claude.ai/code, doesn't load the plugins in your local settings." Environment variables page, `CLAUDE_CODE_PLUGIN_DIRS`: "Plugin directories to load for the session", absolute paths, separated by `;` on Windows, Claude Code 2.1.280 or later.
- **FCT-211**: Where Windows looks for a DLL named without a folder. Microsoft's search order page (REF-207): "The folder from which the application loaded" comes before "The current folder", with safe search mode on or off.

### Facts from step one, on Josh's PC

Step one was find-out only: no code in the repository. Claude Code 2.1.330, desktop app 6.28899.6, 2026-11-24. Report: `RUL-3224.md` in the Claude project's shared folder (REF-203). These are test results, not documented promises.

- **FCT-212**: The press. The command `C:\WINDOWS\System32\rundll32.exe url.dll,FileProtocolHandler claude://claude.ai/code/session_017RufJU7YSX5i3PXEWfCe3h` ran once and ended with exit code 0. Before it, the app showed Josh's local session. After it, the app showed a session that is not a local one. Nobody looked at the screen, so Josh's own press stays the last proof (IMP-205).
- **FCT-213**: The read. A plugin module in a local session called `$.tool.call` with tool `ArtifactData`, action `query`, the board's address and collection `turns`. It got 500 rows. No key, nothing stored, no network call of our own. This settles the draft's FCT-207.
- **FCT-214**: The limit of FCT-213. The board's tool is there only in a session the desktop app starts. In a plain terminal session the same call fails with `no tool named "ArtifactData" in this session`.
- **FCT-215**: The answer's shape, corrected on 2026-11-24 after a live check with the finished row check. One call with newest first and a limit of 500 gives one page.
  - `result.db_read` holds `op`, `collection`, `ordered_by` and `docs`, a list of `{ id, data, version, updatedAt }`. In it every `data` is empty.
  - The rows are in `text`: a count line, a begin mark, one JSON line per doc with its `data` filled in, an end mark, and a note. The two marks carry the same short id, which was different on each read.
  - Step one's report said `data` holds the row. It had read that from the text, not from the structured part.
  - The live check, counts only: 500 lines, 500 rows passed the row check, none left out, 68 threads.
- **FCT-216**: The read does not land in the session's transcript. The answer was about 250,000 characters and the saved transcript of that run was 22,267 bytes.
- **FCT-217**: `$.session.machine()` gave `sysname: "Windows_NT"`. `rundll32.exe` is at `C:\WINDOWS\System32\rundll32.exe`.
- **FCT-218**: `thread-queue`, loaded in a local session, writes no row. `CLAUDE_CODE_REMOTE_SESSION_ID` is not set there, and with no thread id that module does nothing (ADR-0001 R9). This settles the draft's OPEN-202.
- **FCT-219**: A throwaway module shaped like this record (a `.ts` file that calls `h`, the three hooks and every call of Section 3 but `$.clock.after`) passed `claude plugin validate`. In Claude Code's own test host (`claude plugin test`) the pane was rendered for the terminal and for the desktop app, a press handed the three fixed words to `$.process.run`, and the timer fired. Throwaway code, kept outside the repository.
- **FCT-220**: Not documented, as far as the writer could find: the `claude://claude.ai/code/` link form (Anthropic), the `url.dll,FileProtocolHandler` entry (Microsoft), and the layout of the read's answer (Anthropic, FCT-215). The desktop app itself hands out links that start `claude://claude.ai/` for local sessions, so the start is the app's own.

## Decision

### 1. What we build

A second plugin, `thread-queue-panel`. It runs only in local Code sessions on Josh's Windows PC. A command, `/thread-queue`, opens a pane that shows the thread list. Each row is a button. A press opens that thread inside the desktop app.

Think of the board as the mailbox on the street and the panel as a window onto the same mailbox from inside the house. Same letters. The panel can look and it can open the door for you. It cannot put a letter in or take one out.

Nothing changes in the board page, in the stored rows, or in the `thread-queue` plugin that cloud threads load.

### 2. Panel rules

- **P1, what it shows.** One read gives the newest 500 rows on the board. From those, the newest row of each cloud thread, newest first, at most 50 threads. Each shows title, project, state, age and preview. If more threads were found than shown, one line says how many. Fifty rows of at most 600 characters each stay well inside those limits (FCT-206).
- **P2, how it reads (trust point).** One call, written out in full in one place: tool `ArtifactData`, action `query`, the board's address, collection `turns`, newest first, at most 500 rows. The function that makes the call takes nothing from its caller, so no value from a row or from any other part of the code can reach the call. It uses the sign-in the app already has. No key, no password, no network call of our own. Josh sees no prompt for it (FCT-208).
- **P3, rows are not trusted.** Agents wrote them. From each row the panel takes six fields and nothing else: `thread`, `title`, `project`, `state`, `updated_at`, `preview`. Every other field is ignored, the row's `url` included.
  - A row is shown only if all of these hold. `thread` is `session_` and then letters and digits, at most 64 characters in all (ADR-0001 R11). `updated_at` is a time that can be read. `title` is text of 1 to 200 characters. `preview` is text of 0 to 200 characters. `project` is missing or text of up to 200 characters. `state` is `needs_you`, `review`, `finished` or `failed`.
  - A row that fails is left out and counted. The count shows in the pane.
  - Before the length is checked, the text is cleaned as in ADR-0001 R12 steps 3 and 4: control characters, invisible characters, characters that flip the reading direction and the Unicode "tag" block are removed, and every run of white space becomes one space.
  - Text is shown as plain text, never as markup.
- **P4, the link.** Code builds it: the fixed start `claude://claude.ai/code/` plus the thread's id. Only an id in the shape of P3 gets a link. The id is checked again where the link is built. That check does not rely on P3 having run.
- **P5, the command (trust point).** One fixed command of three words:
  1. `C:\Windows\System32\rundll32.exe`
  2. `url.dll,FileProtocolHandler`
  3. the link from P4
  - Passed as a list of words, so no shell reads it (FCT-201). The only part that varies is the thread id, which holds letters, digits and one underscore.
  - Only after a press on a row's button. Never on load, never on a timer. One command for one press.
  - Only when the machine is `Windows_NT`. Off Windows the panel does nothing at all: it registers no command, opens no pane and reads nothing.
  - A time limit of 10 seconds.
  - Right before `$.process.run`, the code that runs it compares all three words with its own fixed values once more, as ADR-0001 R8 does for the write. If one differs, nothing runs.
  - The full path names the program. Windows finds `url.dll` in that program's folder before it looks in the session's folder (FCT-211), so a file of that name in a project folder is not picked up. The path is a fixed value in code. It is not read from the environment, which someone else can set.
- **P6, read only.** The panel never writes to the board. No `set`, no update, no delete. It does not mark a row seen.
- **P7, kept apart.** The panel's abilities live in `thread-queue-panel` only. The abilities list of `thread-queue` does not change. Each plugin has its own abilities check. The panel is never uploaded on the account Plugins page and is never put in the zip that cloud threads load.
- **P8, when something fails.** The list cannot be read, or gives no answer in 15 seconds: the pane says so in one line and keeps the rows it had, marked as old. The command fails or runs out of time: one line says so. One read runs at a time. Neither can stop or slow the session: the command that opens the pane does not wait for the read.
- **P9, three undocumented pieces (trust point).** The link form, the Windows entry `url.dll,FileProtocolHandler`, and the layout of the read's answer (FCT-220).
  - The link form and the Windows entry are each one fixed value in `panel/hooks/rows.ts`, with the Connector's own copy for the compare of P5 in `panel/hooks/register.ts`. If an app update or a Windows update breaks one, a press does nothing and Josh sees that at once. Nothing else breaks. A fix changes both places.
  - The layout is read in one file, `panel/hooks/transformer.ts`. It reads only the lines between the tool's own begin and end marks, and only when their number equals the tool's own count. A row's text cannot add a line: a line break inside it arrives escaped. If the layout changes, the pane says the list cannot be read. It never shows a row it could not check.
- **P10, nothing kept.** The panel stores nothing on disk, holds no secret and logs no row text. Rows live in memory while the session runs.

How often it reads (settles the draft's OPEN-203): when the pane is opened, on a press of the Refresh button, and every 2 minutes while the pane is open. When the pane is closed the timer stops at its next tick.

### 3. Abilities, the whole list

Allowed in `thread-queue-panel`, in the words `claude plugin validate` prints:

- Hooks: `session.start`, `command.run{command=thread-queue}`, `ui.render{component=Pane, requestId=thread-queue}`.
- Calls: `$.clock.after`, `$.clock.every`, `$.clock.now`, `$.command.register`, `$.process.run`, `$.session.machine`, `$.tool.call`, `$.ui.invalidate`, `$.ui.open`, `$.ui.panes`, `$.ui.resolve`.
- Environment reads: none. Environment writes: none.

What each is for:

| Ability | Use |
|---|---|
| `session.start`, `$.command.register`, `$.session.machine` | Register `/thread-queue`, on Windows only |
| `command.run`, `$.ui.open` | Open the pane when Josh types the command |
| `ui.render`, `$.ui.resolve`, `$.ui.invalidate` | Render the pane, and render it again after a read or a press |
| `$.tool.call` | The one read (P2) |
| `$.process.run`, `$.session.machine` | The one command (P5) |
| `$.clock.every`, `$.ui.panes` | Read again every 2 minutes, only while the pane is open |
| `$.clock.after` | The 15 second limit on a read (P8) |
| `$.clock.now` | The age shown on each row |

Not allowed: `$.http`, `$.fs`, `$.store`, `$.env`, `$.model`, `$.mcp`, `$.process.spawn`, `$.process.hookEnv`, `$.agent`, `$.prompt`, `$.command.run`, `$.tool.list`, `$.tool.check`, `$.tool.register`, `$.ui.log`, `$.ui.toast`, any tool call other than P2, any command other than P5. Adding one is a trust boundary change: stop and ask Josh.

Two checks, as for the first plugin (ADR-0001 Section 3), each in `panel/hooks/`:

- The abilities check runs `claude plugin validate` on `panel/` and fails when the printed lists differ from the lists above, or when the plugin provides anything but its one module.
- The source test is a plain test on the text of the panel's files. It passes only if: `$.tool.call(` appears once and `$.process.run(` appears once, both in the Connector section. The read call is written out with its fixed values. None of the calls named "Not allowed" appears. `panel/hooks/rows.ts` and `panel/hooks/transformer.ts` hold no `$`. The Service section calls nothing on `$`. No cast to the checked command type appears outside `panel/hooks/rows.ts`.

`thread-queue` keeps its own abilities check, unchanged. That shows the plugin cloud threads load gained nothing.

### 4. Files and layers

The panel follows the Software Layer Roles and Dependency Policy named in ADR-0001 Section 4, the same way the first plugin does. This section is the panel's classification record. The folder `panel/` is new. This record names it.

Added to the governed scopes of ADR-0001 Section 4: `panel/hooks/register.ts`, `panel/hooks/rows.ts` and `panel/hooks/transformer.ts`. The exclusions are the same: test files, JSON manifests and documentation.

Claude Code lets `$` be passed only to top-level functions of the module's own file (ADR-0001 Section 5). So every `$` call lives in `panel/hooks/register.ts`, in sections marked by a comment naming the role. The two files that need no `$` are files of their own (ADR-0001 CTX-049).

| File or section | Role | What lives there |
|---|---|---|
| `panel/.claude-plugin/plugin.json` | Manifest (not governed) | The plugin's name and version |
| `panel/hooks/hooks.json` | Not governed | Points Claude Code at the module |
| `panel/hooks/register.ts`, Composition Root | Composition Root | `register()`: names the three hooks, the command and the pane, and wires the handlers |
| `panel/hooks/register.ts`, Controller | Controller | The handlers: session start, the command, the timer tick, the render and the button presses. It reads the clock and the machine's name and passes them in as plain values. It turns the Service's view into the pane's elements. It calls only the Service |
| `panel/hooks/register.ts`, Service | Service | The conductor. It holds what the pane shows: the rows, the counts and one status line. For a refresh it asks the Manager for the checked rows and applies the order rule. For a press it asks the rule in `panel/hooks/rows.ts` for a checked command and hands that to the Gateway. It passes `$` on and never calls anything on it |
| `panel/hooks/register.ts`, Manager | Manager | The stored rows, read only. One operation: read the newest rows. It hands the read to the Connector and the raw answer to the Transformer, and gives the Service only checked rows. It has no write operation |
| `panel/hooks/register.ts`, Gateway | Gateway | The one thing an outside system does for the panel: opening a thread in the desktop app. It accepts only a checked command, hands it to the Connector, and tells the Service in plain words whether it ran. It decides nothing about a row |
| `panel/hooks/register.ts`, Connector | Connector | The only code that calls `$.tool.call` and `$.process.run`. The read is the one call of P2. Before the run it makes the compare of P5, as its own code |
| `panel/hooks/transformer.ts` | Transformer | The board tool's raw answer to checked rows: the row check of P3 and the count of rows left out. Pure: no `$`, no clock, never throws. Its only import is `import type` from `panel/hooks/rows.ts` |
| `panel/hooks/rows.ts` | Support of the Service | The pure rules the Service section calls: the order (P1), the link (P4), the command's words (P5), the age text. No imports, no `$`, no clock. The time and the machine's name are passed in |
| `panel/hooks/rows.ts`, types | Model | The shapes of a checked row, the view, the raw answer and the checked command |

Who may call whom. Every edge is on the policy's allow-list (6.1):

| From | To |
|---|---|
| Composition Root | Any role, for startup wiring only |
| Controller | Service, Model |
| Service | Manager, Gateway, Model, and its own support in `panel/hooks/rows.ts` |
| Manager | Connector, Transformer, Model |
| Gateway | Connector, Model |
| Connector | Model |
| Transformer | Model |

Why these roles:

- **Manager for the rows.** The rows are the application's own stored data. Anthropic's page database only holds the bytes (policy 5.6, and `board/manager.ts` in ADR-0001).
- **Gateway for the open.** Opening a thread is something Windows and the desktop app do. The application only asks for it (policy 5.5).
- **Transformer for the row check.** Rows are outside text. The raw answer goes from the Connector through the Manager straight into the Transformer, and the Service only ever holds checked rows. So the Service cannot show or pass on an unchecked row by mistake. This is the mailroom of ADR-0001 CTX-055 again. The Manager may call a Transformer (policy 6.1 and Section 8).
- **The door is kept by a type and a test**, as ADR-0001 does for the write. `panel/hooks/rows.ts` has one function that makes a checked command, a branded type. The Gateway's and the Connector's run functions accept nothing else. The source test fails on any cast to that type outside `panel/hooks/rows.ts`.
- **Three checks of the thread id, each owned.** The Transformer checks it on the row (P3). The rule checks it again when it builds the link (P4). The Connector compares the finished words once more (P5). None of the three calls another: the policy does not let a Transformer or a Connector call the Service's support.
- **No same-role compositions**, no Entities, no exception ADRs.

External facility mappings, added to ADR-0001 Section 6:

| Facility | Mapping | Who may call it |
|---|---|---|
| Module events (`session.start`, `command.run`, `ui.render`) and a button's `onPress` | Framework inbound handling | Composition Root and Controller sections |
| `$.command.register`, `$.ui.open`, `$.ui.panes`, `$.ui.resolve`, `$.ui.invalidate`, the global `h` | Framework inbound handling and response writing | Controller section only |
| `$.clock.now`, `$.clock.every`, `$.session.machine` | External Provider abstraction | Controller section only. Values are passed in |
| `$.clock.after` | External Provider abstraction | Connector section only, for the time limit on its own call |
| `$.tool.call` (`ArtifactData` query on the board) | External Connector facility | Connector section only |
| `$.process.run` (the one command) | External Connector facility | Connector section only |

### 5. Install on the PC

- The panel is loaded from one fixed folder on Josh's PC, named in the user variable `CLAUDE_CODE_PLUGIN_DIRS` (FCT-210).
- That folder holds a copy of `panel/` taken from a merged commit. It is not a working checkout of the repository. So switching a branch, or an unmerged change, cannot change what runs in Josh's sessions.
- An update is a new copy from a newer merged commit.
- It is never uploaded on the account Plugins page, so no cloud thread loads it (FCT-210). If it were loaded on a cloud machine by mistake it would do nothing, because that machine is not Windows (P5).
- Josh sets the variable, or says yes before an agent does. It is a lasting setting on his PC.

## Consequences

### Positive

- **POS-201**: A press opens the thread inside the app. No browser tab.
- **POS-202**: The plugin in cloud threads gains nothing. Its safety rules and its abilities list stay as accepted.
- **POS-203**: The panel can only read one fixed list and run one fixed command with one checked value in it.
- **POS-204**: No row text can reach the command. The only value that travels from a row to the command is a thread id of letters, digits and one underscore.

### Negative

- **NEG-201**: The project now has code that runs a local command with no approval prompt (FCT-202). That is a new kind of risk, held down by P4, P5 and the two checks.
- **NEG-202**: Three pieces are undocumented (P9). An app update or a Windows update can break the press, and a change to the layout of the read's answer can stop the list from showing.
- **NEG-203**: Windows only. On another machine the panel does nothing.
- **NEG-204**: The panel needs a local Code session that the desktop app started (FCT-214). In a plain terminal session it opens and says the list cannot be read.
- **NEG-205**: A press in the panel does not mark the row seen, so "Priority" on the board page does not follow it.
- **NEG-206**: Two plugins to keep in step, and the panel's copy on the PC is updated by hand (Section 5).
- **NEG-207**: A row can lie about which thread it is. Any of Josh's threads can write any row to his board (ADR-0001, known limit 3). So a row could show one thread's title on a button that opens another. The worst a press can do is ask the desktop app to open a session by its id. It cannot run anything else.
- **NEG-208**: Windows hands the link to whatever program is registered for `claude` links. That is the desktop app today. The panel cannot check it.
- **NEG-209**: The panel reads the newest 500 rows only. A thread whose newest row is older than those does not show. The board page shows them all.
- **NEG-210**: Each read brings about 250,000 characters from the board (FCT-216), every 2 minutes while the pane is open. No limit on such reads is documented, and none was hit in step one.
- **NEG-211**: The panel's rules for a row are a second copy of rules the board and the first plugin also hold: the id shape, the field limits, the state words. A change to a row's shape has to reach all three. ADR-0001 IMP-009 keeps such changes to added fields, which the panel ignores.

## Changed from the draft

The planning thread's draft is `thread-queue/adr-0002-draft.md` in the Claude project's shared folder. The Panel brief says the writer puts step one's answers in place of every "to prove" line. Beyond that, these differ:

1. **The abilities list** (Section 3). Added, because the pane cannot be opened or rendered without them: hooks `session.start` and `command.run`, calls `$.command.register` and `$.ui.resolve`. Added for the refresh and the age: `$.ui.panes`, `$.clock.now`. Dropped, because nothing needs them: the `ui.press` hook and `$.ui.log`.
2. **P1.** The draft said "the 500 rows the board keeps". The board keeps up to 25,000 (ADR-0001 IMP-005). The panel reads the newest 500 and shows at most 50 threads.
3. **P2.** The draft asked for a compare of the four fixed things right before the read. The read is now written out in one place that takes no input, so there is nothing a compare could catch. A test checks the written call instead.
4. **P3.** The draft left out a row with any unknown field. The board itself adds `seen_at` to a row Josh has clicked, so that rule would hide every row he has opened. Unknown fields are ignored and never used.
5. **P5 and NEG-203.** The draft let the panel show the list off Windows. It now does nothing off Windows. Less runs, and a copy loaded on a cloud machine by mistake stays idle.
6. **A Transformer file**, `panel/hooks/transformer.ts`, so the Service never holds an unchecked row (Section 4).
7. **The module stays `panel/hooks/register.ts`.** Step one's report proposed `register.tsx`. A `.ts` file that calls `h` works (FCT-219) and can be tested with the project's own test runner, which cannot load a `.tsx` file.
8. **Install from a copy** (Section 5), not from a working checkout.

## Alternatives Considered

### Fix the board page

- **ALT-201**: **Description**: Change the row links on the page so they open in the app.
- **ALT-202**: **Rejection Reason**: Tried three ways on 2026-11-23. The app hands every page link to the browser.

### A panel in a cloud thread

- **ALT-203**: **Description**: Show the panel from the plugin cloud threads already load.
- **ALT-204**: **Rejection Reason**: Its links do nothing (CTX-203), and a cloud machine cannot run a command on Josh's PC.

### One plugin for both jobs

- **ALT-205**: **Description**: Add the pane, the read and the command to `thread-queue`.
- **ALT-206**: **Rejection Reason**: Every cloud thread would then load code that can run a command. Less code, less safe. Safety wins.

### Read the list with our own network call

- **ALT-207**: **Description**: `$.http.fetch` to the board's address.
- **ALT-208**: **Rejection Reason**: It needs a sign-in handed to our code or stored by it. The board's own tool needs neither.

### List the sessions without the board

- **ALT-209**: **Description**: Ask Claude for the session list and skip the stored rows.
- **ALT-210**: **Rejection Reason**: It is a different list. It has no state and no preview, and it does not know which thread told Josh something.

### Read the program's folder from the environment

- **ALT-211**: **Description**: Build the path of `rundll32.exe` from the `SystemRoot` variable, so a Windows installed on another drive still works.
- **ALT-212**: **Rejection Reason**: It needs one more ability (`$.env.get`), and the value can be set by whoever starts the session. A fixed path is safer. On a PC where Windows is elsewhere the press fails and says so.

### No refresh timer

- **ALT-213**: **Description**: Read only when the pane opens and on the Refresh button. No `$.clock.every`, no `$.ui.panes`.
- **ALT-214**: **Rejection Reason**: Equally safe, and simpler. Not taken because the list exists to show freshly finished turns, and a list that only moves on a press does not do that. If Josh prefers it, it is two abilities fewer.

## Implementation Notes

- **IMP-201**: Step one, the find-out, is done (FCT-212 to FCT-220).
- **IMP-202**: If the read stops working without a key, a stored sign-in or a network call of our own: stop and ask Josh. Do not switch to another way of reading.
- **IMP-203**: Two files change with this record. `AGENTS.md`, the rules card: the scope lines on local sessions and the panel's safety lines. `docs/writing-or-reviewing-code.md`: the panel's file list, the reviewer's rules and the second abilities check.
- **IMP-204**: Tests, one per rule P1 to P10, beside each file. For P5: a hostile id, a hostile title, a row with a link of its own, a machine that is not Windows. In each, the words handed to `$.process.run` are exactly the fixed ones, or no command runs.
- **IMP-205**: Done is Josh's own press on the PC.
- **IMP-206**: Tests run with `npm test`, as the first plugin's do. The module is tested with a stand-in for `$` that records every call.
- **IMP-207**: The code's pull request sets this record to Accepted, adds the panel to `README.md`, and carries `Fixes RUL-3224`.
- **IMP-208**: The zip for cloud threads holds the plugin's files from `.claude-plugin/` and `hooks/` in the repository's top folder and nothing else, as the `0.1.0` zip does. `panel/` is never in it (P7).

## Open, not proven

- **OPEN-201**: Josh's own press (IMP-205). FCT-212 is strong but indirect.
- **OPEN-202**: Whether a pane rendered by this module looks right in the desktop app. Claude Code's test host rendered the finished module for the terminal and for the desktop app, in a throwaway test outside the repository. Nobody has seen it on screen.
- **OPEN-203**: Whether reading 500 rows every 2 minutes ever meets a limit (NEG-210).

## References

- **REF-201**: ADR-0001, `docs/adr/adr-0001-thread-queue-architecture.md`: R8, R9, R11, R12, CTX-013, CTX-031, CTX-041, CTX-049, CTX-055, Sections 3 to 6, IMP-005, IMP-009.
- **REF-202**: Mods type file, https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts (FCT-201, FCT-203, FCT-205 to FCT-209).
- **REF-203**: Step one's report, `RUL-3224.md`, and the draft, `thread-queue/adr-0002-draft.md`, both in the Claude project's shared folder.
- **REF-204**: Mods admin page, https://code.claude.com/docs/en/plugins/mods/admin (FCT-202). Mods API page, https://code.claude.com/docs/en/plugins/mods/api (FCT-201). Mods reference, https://code.claude.com/docs/en/plugins/mods/reference.
- **REF-205**: Plugins page, https://code.claude.com/docs/en/plugins, and environment variables page, https://code.claude.com/docs/en/env-vars (FCT-210).
- **REF-206**: Test a mod, https://code.claude.com/docs/en/plugins/mods/test (FCT-219).
- **REF-207**: Microsoft, Dynamic-link library search order, https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order (FCT-211).
- **REF-208**: Software Layer Roles and Dependency Policy v2.0.0-rc.4, as named in ADR-0001 Section 4: 5.5, 5.6, 5.8, 6.1, Sections 7 and 8.

Open this before you write or review code, or check a layer rule.

## Layers
- This repository follows the Software Layer Roles and Dependency Policy v2.0.0-rc.4 (ADR-0001, Accepted 2026-11-22).
- Plugin files (ADR-0001, Section 5). `hooks/register.ts` is an empty shell until `RUL-3168` fills its sections:
  - `.claude-plugin/plugin.json`: Manifest (not governed)
  - `hooks/hooks.json`: Points Claude Code at the module (not governed)
  - `hooks/register.ts`: Sections: Composition Root, Controller, Service, Manager, Gateway, Connector
  - `hooks/transformer.ts`: Transformer: reads the model's answer and the lookup's answer. Built under `RUL-3168`
  - `hooks/row.ts`: The Service's rules (its owned support) and Model
- Claude Code lets the `$` object be passed only to top-level functions of the module's own file, so every `$` call lives in `hooks/register.ts`. Its sections are marked by comments naming the role. It is the only file that holds more than one role. `hooks/transformer.ts` uses no `$`, so it is a file of its own. Everywhere else, one file holds one layer (Josh, 2026-11-22, ADR-0001 CTX-049).
- The board is a page, `board/index.html` (markup and styles only), and one TypeScript file per layer (ADR-0001, Section 5). Each file starts with a comment naming its role.
  - `board/main.ts`: Composition Root (the startup file)
  - `board/client.ts`: Client (rendering only)
  - `board/service.ts`: Service
  - `board/manager.ts`: Manager
  - `board/connector.ts`: Connector
  - `board/transformer.ts`: Transformer
  - `board/model.ts`: Model
- Panel files (ADR-0002, Section 4), built under `RUL-3224`. No panel code exists before ADR-0002 is merged. The panel follows the same policy the same way: every `$` call in one file, in sections marked by role comments.
  - `panel/.claude-plugin/plugin.json`: Manifest (not governed)
  - `panel/hooks/hooks.json`: Points Claude Code at the module (not governed)
  - `panel/hooks/register.ts`: Sections: Composition Root, Controller, Service, Manager, Gateway, Connector
  - `panel/hooks/transformer.ts`: Transformer: the board tool's raw answer to checked rows
  - `panel/hooks/rows.ts`: The Service's rules (its owned support) and Model
- Reporting must be enforced by code. An instruction that asks threads to report is not acceptable, because agents skip instructions.
- The word is "rendering", not "drawing", for what the board puts on screen (2026-11-22 13:09Z): "I think rendering is a better word than drawing."

## Rules a reviewer checks
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
- `hooks/transformer.ts` is pure: no `$`, no file, network, clock or environment. Its only import is `import type` from `hooks/row.ts`, whose types are Models. It never throws. So it can be a file of its own (CTX-049).
- Manager (`hooks/register.ts`): The waiting rows: add, keep, write oldest first, drop past the waiting limit (R6) and count the drops (R14), one write at a time. It does what the Service tells it, hands every read and write to the Connector, and never calls the Service
- The types in `hooks/row.ts` are Models. They hold no reference to the functions, because a Model must not depend on support (3.1).
- `$.ui.log` (Diagnostics): `hooks/register.ts` only.
- The page database (`claude.use("db")`): `board/connector.ts` only. It reads the `turns` collection, writes only `seen_at` on a row, and deletes only rows in `turns` whose ids arrive as `ExpiredIds` (Section 5)
- The browser clock (`Date`): two readers. `board/main.ts` hands the clock (`Date.now`) to the Service, which reads the time through it on each update, for the age rule and the day labels. `board/connector.ts` reads the clock itself, for the `seen_at` time it writes. `board/client.ts` reads no clock. `board/service.ts` reads none of its own: it uses `Date` only for calendar sums on times it was given, in the device's time zone
- The browser timer (`setTimeout`): `board/client.ts` only, for the "still trying" text after 10 seconds
- `build` comes from a constant in `hooks/register.ts`. A test fails when it differs from the version in `.claude-plugin/plugin.json`.
- Release check: the zip is built from a merged commit and its checksum is recorded. After the upload, the checksum of the file that reached a thread's machine is compared with it, as T8 did.

## Rules a reviewer checks for the panel
From ADR-0002, rules P1 to P10.
- The command has three fixed words: `C:\Windows\System32\rundll32.exe`, `url.dll,FileProtocolHandler`, and the link. The link is `claude://claude.ai/code/` plus a thread id. The thread id is the only part that varies, and only an id of `session_` and then letters and digits gets through.
- No text from a row reaches `$.process.run`. No link stored in a row is ever used.
- `$.process.run(` appears once, in the Connector section. Right before it, the Connector compares all three words with its own fixed values. It runs only after a press, only on `Windows_NT`, one command for one press.
- `$.tool.call(` appears once, in the Connector section, written out in full: `ArtifactData`, `query`, the board's address, `turns`. The function that makes it takes nothing from its caller.
- The panel never writes to the board. No `set`, `update`, `delete` or `batch` appears.
- Only `panel/hooks/rows.ts` makes a checked command, a branded type. The Gateway's and the Connector's run functions accept nothing else. No cast to it appears outside `panel/hooks/rows.ts`.
- The raw answer of the read goes from the Connector through the Manager into `panel/hooks/transformer.ts`. The Service section only ever holds checked rows.
- `panel/hooks/rows.ts` imports nothing. `panel/hooks/transformer.ts` imports only types from `panel/hooks/rows.ts`. Neither holds a `$` or reads a clock.
- The Service section passes `$` on and never calls anything on it. The Controller calls only the Service.
- Off Windows the panel registers no command, opens no pane and reads nothing.
- The panel has its own abilities check, against the list in ADR-0002 Section 3. `thread-queue`'s abilities list does not change. Adding an ability to either needs its ADR changed first.
- `panel/` is never in the zip that cloud threads load, and the panel is never uploaded on the account Plugins page.
- The panel stores nothing, logs no row text, and makes no network call of its own.

## TypeScript rules
- Types are removed, not compiled, so use only syntax that can be removed: no enums, no namespaces, no parameter properties.
- Import other files by their `.ts` name.
- Do not commit compiled `.js` files.
- `typescript` and `@types/node` are development dependencies only. The plugin needs neither at run time.
- The module itself runs inside Claude Code, on Claude Code's own runtime (seen working on 2.1.330).
- The module has no Node APIs. It reaches the clock, the environment, its note and tools only through `$`.
- Claude Code loads the module's `.ts` files directly, so the plugin has no build step.
- The board's files are compiled with `tsc` when the board is published.

## Audit
- Audit is a code review against ADR-0001. There is no automated architecture check. Compare the `claude plugin validate .` list with ADR-0001 Section 3.
- The lasting list: hooks `tool.call` on the nine R1 tools and `turn.complete`; calls `$.clock.after`, `$.clock.now`, `$.env.get`, `$.mcp.call`, `$.store.get`, `$.store.set`, `$.tool.call`, `$.ui.log`, and one model call for R13, `$.model.complete` or `$.model.classify`, exactly one of the two (OPEN-008); env reads `CLAUDE_CODE_REMOTE_SESSION_ID`; env writes nothing.

Open this before you change the safety check, or run `npm run e2e:safety`.

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
- No rule is loosened. Every strict rule still applies, and no link gets a pass.
- The last look. Right before every write, code compares the call with the one approved shape. It passes only if: the tool is `ArtifactData`, the action is `set`, the address equals the board constant, the collection is `turns`, the call has exactly the keys `tool`, `action`, `url`, `collection`, `doc_id` and `data`, the `doc_id` is this run's thread id, a dot and a 13 digit time, and the row passes the shape rule in R11. If it fails, the bare row (R11) is built and checked the same way.
- The one exception is R9: with no thread id there is no row to address.
- A row from the note gets no shortcut, because the note can be edited on the thread's machine (CTX-047). The thread id used for the write is always the one read from the environment in this run. The one in the note is only compared with it.
- Row shape. A row has exactly these fields: `thread`, `title`, `state`, `updated_at`, `preview`, `url`, `build`, `check`. Two more may be there: `project` and `dropped`. Nothing else. `thread` is `session_` and then letters and digits, at most 64 characters, and equals this thread's id. `title` and `project` are cleaned text of 1 to 200 characters. `preview` is cleaned text of 0 to 200 characters. `state` is `needs_you`, `review` or `finished`. `updated_at` is written from the same number that is in the row id. `url` is exactly `https://claude.ai/code/` and then the thread id. `dropped` is a whole number from 1 to 9999.
- Bare row. If a row fails the shape or the last look (R8), if any part of the check throws, or if a waiting row read from the note is damaged, a bare row goes out in its place. It is built from this thread's id, a time and the build constant only: the title is the thread id, the preview is the fixed text "Details hidden by the safety check", and `check` is `bare`. No free text. Its state is the row's own if that is one of the three allowed words, else `review`. Its time is the row's own if that is a whole number, not later than now plus one minute, and not older than 60 days. Otherwise it is the time now. Either way the rule in R4 holds: never the same time twice. It carries `dropped` when that count is above zero (R14).
- If the bare row itself fails the last look, there is no valid thread id. Nothing is written (R9) and the log says so.
- Clean text and hide secrets. Applies to the title, the project name and the preview, in this order:
  1. Anything that is not text becomes empty text.
  2. Only the first 2,000 characters are looked at.
  3. Control characters, invisible characters, characters that flip the reading direction and the Unicode "tag" block are removed.
  4. Every run of white space becomes one space, and both ends are trimmed.
  5. The secret check runs on the result. It comes before the cut, so a key that crosses the 200 mark is still found.
  6. The text is cut to its limit by whole characters.
- Shapes the secret check knows: the header line of a private key block. Keys with a known start (`sk-`, `sk_live_`, `rk_live_`, `ghp_` and its siblings, `github_pat_`, `glpat-`, `xox` tokens, `AKIA`, `AIza`, `npm_`). A web token in three parts that starts `eyJ`. The word Bearer followed by a long token. A user name and password inside a link. A word such as password, passcode, secret, token, api key or credential with a value after it. Any unbroken run of letters, digits and the signs `+ = _ -` that holds both letters and digits. Claude's own ids are let through (they start `cmsg_`, `session_`, `chan_`, `cse_` or `toolu_`).
- Strict rule (Josh, CTX-040): the check hides on any doubt. The unbroken run counts from 16 characters. The word rule counts when the value follows in plain words too ("the password is ..."), not only after a colon or an equals sign.
- Strict plus redact (Josh, CTX-056). On a match, the part that looks like a secret is replaced by the marker `[hidden]` and the rest of the field stays. The part is every word the match touches, from the space before the match starts to the space after it ends, so nothing glued to a key is left behind. A match that spans two words, such as the word Bearer and its token, loses both. Every match in the field is replaced, and the check runs again after the cut. The row's `check` is then `hidden`.
- Two shapes have no sure end, because the secret may run on in plain words: the private key header and the secret word rule. On those the whole field is swapped for its stand-in, as on any case where the code cannot finish replacing. Preview: "Preview hidden by the safety check". Title: the thread id. Project: left out. `check` is `hidden`.
- If the cut to the limit lands inside a marker, the text is shortened to make room for a whole marker.
- The let-through for Claude's own ids matches the whole id, in the exact length real ids of that kind have, so a key glued to `session_` is hidden. When more than one `check` value applies, the first in this order wins: `bare`, `hidden`, `hidden-ai`, `hidden-noai`, `ok`. A look skipped near turn end (R7) hides the text and gives `hidden-noai`.
- A row that already carries the marker when it is read back from the note keeps `check` `hidden`.
- The patterns are simple ones that run in a single pass, so none can slow down on a long line. Cleaning twice gives the same result. It runs when the row is queued and again at the door.
- A false alarm costs one word of a title or preview, or one whole field for the two shapes with no sure end. It never costs a row.
- Its answer can turn a shown title or preview into its stand-in. It can never stop a row, delay one past its time limit, or change a row in any other way.
- It runs second. Only text that already passed R12 is sent. Text a code rule hid, and the fixed stand-in texts, are never sent. A field with a part hidden is sent with the marker in place of that part.
- It answers with one of a few fixed words: fine, hide the preview, hide the title, hide both. Hide covers a secret in any shape, private details about a person, and text written as an order to an AI.
- Too slow, an error, an empty reply or a word not on the list: the title and preview are swapped for their stand-ins, the row goes out, and `check` is `hidden-noai`.
- Time limit: about 3 seconds a row, and never past the turn end wait (R7).
- It runs in the write pass, right before the last look (R8). The thread's own call and reply never wait for it (R5).
- No verdict is saved. A row read back from the note is looked at again, because a verdict in the note could be forged (CTX-047).
- If the text talks the model into "fine", the row is where the code rules alone would leave it. Those still ran.
- `dropped`, only when above zero: how many waiting rows the module gave up on since the last row that landed (R6). The count is kept in the note under its own key and goes back to zero only after a row that carried it has landed.
- One debug log line per row: the row id, the state and the check result. For hidden text it names the field and the rule or cause. For a bare row it gives the reason in a few fixed words. It never holds the hidden text.

## End-to-end safety test
- End-to-end safety test: `npm run e2e:safety`.
- Local only, never in CI.
- Needs the `claude` command, signed in.
- Runs the plugin's code with the real AI model and writes to the test board, never the live list.
- It removes its own rows.
- Made-up secrets only.
- Ends with `PASS`, `FAIL` or `INCONCLUSIVE` (run it again)

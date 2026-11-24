Open this before you change a row rule or a board rule, or check one.

## Row rules
- A call owes one row if it is `post_message`, `request_decision`, `post_widget`, `suggest_connectors`, `connect_device`, `start_remote_control`, `set_thread_resolved` with `resolved: true`, `show_helpline_card` (all `mcp__hearthbot__`), or `PushNotification`. Nothing else owes a row.
- A call that was refused or failed owes no row.
- One row per owing call. A later call gives a fresh row.
- Every field is built by code. The thread's model is never asked for anything.
- Thread id from `CLAUDE_CODE_REMOTE_SESSION_ID`. Time from the clock, never the same time twice, since it is part of the row id `<thread>.<epoch ms>`. Link `https://claude.ai/code/<thread>`. Title and project from `get_session` (CTX-025). Preview: the first line with text of what was posted, cut to 200 characters, or a fixed neutral text for the connect, resolve and helpline calls. If the title lookup fails, the thread id stands in. If the project lookup fails, the row goes out with no project. Title, project and preview are cleaned and checked for secrets before the row is saved (R12). `build` is the version of the build that wrote the row (IMP-009): the version shape, at most 32 characters, or `unknown` if it does not fit. `check` and `dropped` are set by R14.
- The module never blocks, changes or refuses a thread's call, and the thread's reply does not wait for the board.
- The row is saved in the plugin's note before the board is tried. A failed write is kept and tried again, oldest first. At most 500 rows wait once `RUL-3185` is built. A build made before it keeps at most 20.
- The oldest is dropped past that, and the drop is logged.
- The approved fix values (ADR-0001, R6): each board write gets 5 seconds (`RUL-3186`). A failed note save is tried again after about 1, 2 and 5 seconds (`RUL-3187`). After a failed read the note is not saved over (`RUL-3188`).
- A board refusal because the row already exists counts as written. Only that one refusal counts. Any other refusal, and any doubt, keeps the row waiting (ADR-0001, R8).
- Turn end waits at most 8 seconds for the board. A broken board must never trap a thread.
- The only tool the module calls is `ArtifactData` `set`, with the board address and collection `turns` fixed in code. The only lookup is `get_session` on `claude-code-remote`, read-only. The call never carries `if_version`, so the module can add rows and cannot change or delete one. The T8 build's `tool.judge` listener is test evidence only and is not part of the lasting build.
- Each board write gets 5 seconds of its own (`RUL-3186`). A write with no answer in that time counts as failed. Its row is kept and tried again, and later rows go out without waiting for it. A write that timed out may still have landed, and then the retry is refused: R8, "Already there counts as written". A build made before `RUL-3186` has no limit per write: a call that never answers holds up every later write until Claude Code restarts.
- A failed note save is tried again after about 1 second, then about 2, then about 5 (`RUL-3187`). If it still fails, that is logged and the rows stay in memory for the next save. The waits never hold up the thread's reply, and R7 still holds. A build made before `RUL-3187` logs `note not saved` and does not try that save again.
- After a failed read, the note is not saved over until a read has worked, and the failed read is logged (`RUL-3188`). A build made before `RUL-3188` swallows the error, and its next save overwrites the note.
- Outside a cloud thread (no thread id) the module does nothing.
- Code picks the state from the tool called (ADR-0001, R10, Josh 2026-11-22). A decision card, a card with a button or a draft, and a connect ask give `needs_you`. A resolve gives `finished`. Everything else gives `review`.
- Under this table a plain reply that asks Josh a question shows as `review`, and `failed` is never used.
- The four states and their meanings, in order (T4 section 2, Josh's q5): `needs_you` (the work cannot go on until Josh answers or acts), `failed` (the work cannot be done and nothing is asked), `finished` (the thread resolved itself this turn), `review` (anything else).
- Approved by Josh, CTX-044: every row carries the version of the build that wrote it. Row shape changes are additions only, and the board reads every older shape. The waiting-rows note stays readable by the next build. After an upload, the board can show which build wrote each thread's newest row.
- Required coverage: one test for each row rule above.

## Board rules
- The board checks each row's shape when it reads it. An odd row is shown in its own group with a warning, as plain text, with no link. It is never hidden.
- The board removes rows older than 60 days (Josh, CTX-042). Only rows in the board's own database are ever deleted, never anything in a thread. Its database holds at most 25,000 rows. The board shows how much of that is in use, and Josh checks it after 30 days.
- Age from the earlier clock. A row's age is counted back 60 days from the earlier of two times: the device's clock, and the newest time on any row. So a device clock that runs ahead cannot make rows look old, and a long quiet spell does not age rows: only a row more than 60 days older than the newest row can be deleted. If no row has a time that can be read, the device's clock is used, and then the next rule leaves nothing to delete.
- No delete without a readable time. A row whose time cannot be read is never deleted. As built, it is not shown in the list either, and it still counts in the storage figure. The board follow-up (IMP-002) gives odd rows a group of their own.
- At most 200 deletes per page load. The Service keeps a budget of 200 for the life of the page, across every update. Each row id it hands over for delete comes off the budget, whether or not the delete works. An id handed over again on a later update, because its delete is still running or failed, comes off the budget again. So one page load can remove at most 200 rows, and it can be fewer. A reload starts a new budget.
- A row past 60 days leaves the list at once, even when its delete has to wait for a later page load.
- One at a time, board rows only. The Connector deletes one row at a time, each at `turns/` plus its id, and skips an id it is already deleting or has deleted in this page load. A delete that failed may be tried again on a later update while budget is left, or on the next page load.

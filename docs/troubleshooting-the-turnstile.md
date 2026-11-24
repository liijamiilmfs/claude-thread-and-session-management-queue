Open this when a thread leaves no row on the board, the module seems not to run, or the panel misbehaves.

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

The panel (`thread-queue-panel`, ADR-0002):

- `/thread-queue` is not offered: the machine is not Windows, or the panel's folder is not in the user variable `CLAUDE_CODE_PLUGIN_DIRS`, or the desktop app was not restarted after the variable was set.
- The pane says "The list could not be read.": the session was not started by the desktop app, the board did not answer in 15 seconds, or the layout of the read's answer changed (ADR-0002, FCT-215). Rows from the last good read stay.
- A press says "The thread could not be opened.": the command failed or ran past 10 seconds. If it happens on every press, the link form or the Windows entry may have changed (ADR-0002, P9).
- A press says "Sent to the app." and nothing opens: Windows handed the link to the program registered for `claude` links. Check that it is the desktop app.
- The pane counts rows "left out by the row check": those rows failed ADR-0002 P3. They are still on the board page.
- A panel test fails on a Windows checkout only: check the files have plain line endings. The source tests read the files as text.

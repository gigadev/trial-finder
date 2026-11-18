---
description: Check a finished task against the handoff, run the tests, and draft the commit message for Scott
argument-hint: <task number from HANDOFF.md §13>
---

Finish task $ARGUMENTS. Do not run any git or GitHub write.

1. Re-read the row for task $ARGUMENTS in `HANDOFF.md` §13 and the sections it points to. List each thing the task was to deliver and say, for each, done / not done / changed and why.
2. Run `node --test` and, if they exist yet, the conformance checks (`build_network.mjs --check`, `check_partner.mjs`). Paste the summary lines. If something could not be run, say so; do not call it passed.
3. For every rule in `docs/AGENT_STANDARDS.md` whose "Built in" column names this task: confirm its test exists and passes, and update the rule's status in that file.
4. Check `git status` and `git diff --stat` (read-only) and list the files changed. Flag anything outside the task's scope.
5. Add any ambiguity you settled to `OPEN_QUESTIONS.md`.
6. Report to Scott: what changed, what was run with results, what was not run, which files to read first, and a commit message in a fenced block. Then stop and wait for him to say it is committed.

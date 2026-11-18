# Prompt to start the build in a new session

Open a new Claude Code session in this folder and paste the text below.

---

You're building this repository from an empty start. Everything you need is written down; this message only tells you where to begin.

Read first, in this order:
1. CLAUDE.md
2. HANDOFF.md, all of it. §17 lists what was verified and what is still an assumption.
3. docs/AGENT_STANDARDS.md

How we work: I (Scott) make every git and GitHub write. You never commit, stage, branch or push; the project settings refuse those commands. One task is one pull request. Finish a task, tell me what changed, what you ran and its result, what you did not run, the files, and a commit message; then wait for me to say it is committed.

My answers to HANDOFF §16 are recorded at the top of that section: the defaults throughout. The repository is public and Apache-2.0, so add a LICENSE file in task 1 and keep anything private out of every file.

Step 0, before any task:
- Tell me the state of the folder (it may not be a git repository yet; if not, ask me to create it).
- Fetch and read the challenge's own documents listed in HANDOFF §2. The Devpost rules page blocks automated fetches; ask me to paste it or use a browser.
- Go through HANDOFF §17's "not verified" list and tell me, item by item, what the sources actually say and anything that changes the design. Write those into OPEN_QUESTIONS.md.
- Do not write site code in this step.

- Confirm the project's Claude Code setup works: the deny rules refuse `git add --dry-run .`, `/task-done` appears, and the files in `.claude/rules/` load when you open a matching file. Fix what does not work and say what you changed.

Then task 1, and stop after it for me to commit. Finish every task with /task-done <task number>. Stop also after tasks 4, 7 and 10 for me to try the site. Plan before building on tasks 4 and 7, which have real design choices, and show me the plan; go straight to the change on small, well-scoped ones. Before my final use test in task 10, have a separate session with none of this build's context review the site against HANDOFF.md and docs/AGENT_STANDARDS.md, and give me its findings unedited.

Look things up when you reach them, not from memory: model names and provider endpoints (the challenge's providers.md and the providers' own lists), and the ClinicalTrials.gov API's parameters and field names (its documentation page needs a real browser).

If a task seems to need a server, a database, stored visitor data, a new dependency, an edit to the copied runtime, or anything from my employer, stop and ask.

Report plainly. A test that was written and not run is reported as not run.

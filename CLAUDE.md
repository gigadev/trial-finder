# CLAUDE.md — Trial Finder

Read `HANDOFF.md` first, then `docs/AGENT_STANDARDS.md` (the project's rules for anything involving an AI model, written against Anthropic's Architect and Developer Foundations exam guides, v1.0 and v1.1). The files in `.claude/rules/` load the relevant rules as you edit. Work one task per pull request, in the order of `HANDOFF.md` §13, and stop where it says to stop. Run `/task-done <task number>` at the end of each task.

## What this is

A public, static "open agentic website" for Cognizant's Open Agentic Web Challenge (due Jan 11, 2027): an AI agent in the visitor's own browser, on the visitor's own model key, that finds clinical studies in the public ClinicalTrials.gov data, explains eligibility in plain words, and prepares questions for the visitor's doctor. Plus a small invented partner site linked both ways. Information, never medical advice.

## Owner

Scott Shepherd, personal project. Solo. Optimise for the fewest moving parts.

## Rules that matter most

1. **Static only.** No server, database, account, queue, analytics or stored visitor data. If a task seems to need one, stop and ask.
2. **This is a personal entry by an employee of the sponsor.** Nothing from Scott's employer goes in: no data, code, clients, brand or internal tools. Personal accounts only.
3. **The copied runtime is never edited.** Guardrails live in our own files.
4. **Hard rules are code with tests** (`docs/AGENT_STANDARDS.md`). Never weaken or delete one to make a change pass.
5. **Never a verdict on eligibility; never an action that contacts anyone.**
6. **Invented people and organisations only** in fixtures, tests, screenshots and copy. No third-party trademarks in the name, logo, screenshots or video.
7. **The challenge's own documents are the source of truth for the spec.** Read them (HANDOFF §2); where they and the handoff disagree, they win. Write the difference in `OPEN_QUESTIONS.md`.
8. **Nothing about models, prices or limits from memory.** Look it up and say where.
9. **No new dependency in the deployed site.** A dev-only tool needs Scott's yes.
10. Ambiguity → `OPEN_QUESTIONS.md`, pick the option that keeps the visitor in control and the change reviewable, keep going.

## Git

Scott makes every git and GitHub write (commit, branch, push, PR); `.claude/settings.json` refuses them. At the end of each task give him: what changed, what was run and its result, what was not run, the files, and a commit message in a fenced block. Wait until he says it is committed.

## Environment

Windows 11, PowerShell. Node 24 through nvm-windows, pnpm through corepack (not needed here unless a dev tool wants it). The site has no build step; serve it with the skill's `serve_site.mjs`. Tests: `node --test`.

## Writing

Plain words and short sentences, in the site's copy above all. The reader may be worried and is not a clinician.

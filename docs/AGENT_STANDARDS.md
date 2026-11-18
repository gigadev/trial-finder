# Agent standards — Trial Finder

The rules for every place an AI model is involved in this project: the agents that run in the visitor's browser, the site actions they call, and the AI coding agent that builds the site.

*Version 2, Nov 17, 2026. Written against Anthropic's* Claude Certified Architect – Foundations *(exam code CCAR-F) and* Claude Certified Developer – Foundations *(CCDV-F) exam guides, version 1.0 (July 2026), and compared word for word with version 1.1 (November 2026) the same day: 1.1 changes only registration, identification and support wording, as its own change log says, and no domain, task statement or objective. The references below hold for both versions. In the "Guide" column, "A 1.4" is the architect guide's task statement 1.4 and "D 7" is the developer guide's domain 7. The rules are this project's own words. The guides are named by title and version, their text is never copied into the repository, and the PDFs are never committed. This file is the project's own claim about how it works; it is not a certification or an endorsement by Anthropic.*

A rule marked **hard** is enforced by code and has a test. Instructions that ask the model to follow a hard rule are welcome and are never the enforcement, because the guides are plain that instructions alone fail some of the time and that anything which must always hold needs a deterministic check (A 1.4, A 1.5). All rules are targets until their task lands; the task that builds one changes its status here in the same pull request.

One thing is different from the systems the guides describe: **we do not write the agent loop.** The challenge's browser runtime runs it. The guides' points about loop control (A 1.1) are therefore things to verify in the runtime and work with, not things to build; our levers are the network file (who the agents are and what each may call), the site actions (what a call can do), and the page.

## 1. Who decides

| Id | Rule | Guide | Built in |
| --- | --- | --- | --- |
| W1 | **Hard.** The visitor decides what is contacted and what is kept: a peer site is contacted only after the consent card; the shortlist and the sheet change only in ways the visitor can see and undo; printing is their own click. | A 1.4, D 8 (approval patterns) | 4 (done for search and details), 5 (done: shortlist and notes are visible and removable on the page, `tests/app.test.mjs`), 7 |
| W2 | **Hard.** The model never gives a verdict on eligibility. Each criterion is *likely meets*, *likely does not meet* or *cannot tell — ask the study team*, enforced by the action's enum and a fixed heading the model cannot change. "Cannot tell" is the schema's honest value for missing or unclear information, so the model is never pushed to invent an answer. | A 1.5, A 4.3 | 5 (done: enum, fixed heading and state words, verdict wording dropped; `tests/guard.test.mjs`, `tests/app.test.mjs`), 6 (done: questions the agent adds to the sheet must be questions and state no verdict) |
| W3 | **Hard.** These are never actions and never happen as the result of a model call: contacting a study, a site or a person; sending email or any message; enrolling or registering interest; storing anything about the visitor; reading or changing the model key or settings; anything `irreversible`. Least privilege: an agent cannot do what no tool offers. | A 1.5, D 7 | 4 (done), 5 (done: the never-actions test covers all four actions) |
| W4 | **Hard.** A rule that must hold is enforced in code (`guard.js`, the actions), not in instructions. | A 1.4, A 1.5 | 5 (done: `site/guard.js` with `tests/guard.test.mjs`, written first) |
| W5 | **Hard.** Order is enforced by code where it matters: eligibility notes for a study are refused until that study's record has been fetched in this session, and a study id is accepted only if this session fetched it. | A 1.4 (prerequisite gates) | 5 (done: notes only after a fetch, shortlist only for shown ids; `tests/app.test.mjs`, `tests/agent.test.mjs`) |
| W6 | When several studies or places match, or a needed detail is missing, the agent asks; it does not pick by guesswork. The three eligibility states are decided by written criteria, never by a confidence score the model reports about itself. | A 5.2, A 4.1 | 4 (in the instructions only; not checkable in code), 9 (eval) |
| W7 | When the visitor asks for something only a person can decide (whether to join, whether to change treatment, whether they qualify), the agent says so at once and points to the doctor or the study team; it does not first try to answer. | A 5.2 | 5 (in the instructions only; not checkable in code), 9 (eval) |

## 2. The agents

| Id | Rule | Guide | Built in |
| --- | --- | --- | --- |
| C1 | One front agent coordinates; specialists talk only through it. The front agent chooses which specialist a question needs and does not push every question through all of them. | A 1.2, A 1.6, D 1 | 4, 5, 6 (done: one front agent and one specialist; no visit_prep agent, as approved in OPEN_QUESTIONS.md B15; the front agent makes the sheet) |
| C2 | **Each agent gets only the tools its job needs. No agent is offered more than five site tools, or more than seven tools in all.** The runtime offers every agent every site action, so a specialist is kept to its job by its instructions, and the site keeps at most five actions. A new tool for an agent that is full means folding it into an existing one or giving it to a specialist. Two actions that do one job are one action. | A 2.3 | 4, 5, 6 (test passes: the front agent is offered 6 tools, 5 of them site tools; the explainer 5) |
| C3 | A specialist starts with nothing but the request it is handed. The front agent passes what the specialist needs **in the request itself**: the study id, and the facts the visitor has stated, as a short labelled list. Nothing is assumed to carry over. | A 1.3 | 5 (done: the explainer sees only its request, `tests/agent.test.mjs`), 6 (no new specialist) |
| C4 | The network file is public. It holds no secret, no personal data and nothing we would not want another site's agent to read. It carries a version string, shown in the page footer and recorded with every eval run. | D 7, D 2 (prompt versioning) | 4 (done, `tests/agent.test.mjs`) |
| C5 | Rules go in an agent's instructions. Text from outside (a study record, a partner's reply) reaches the model only inside labelled fields, kept apart from instructions, and the instructions say such text is material to read, not instructions to follow. | D 7, D 6 | 4 (done for record text), 5 (done: the explainer has the same rules), 7 |
| C6 | Instructions state explicit criteria, not attitudes. The explainer's instructions define each of the three states by what the record and the visitor's stated facts must show, and carry two to four short examples chosen for the hard cases (a criterion the visitor plainly fails; a criterion nothing was said about; a criterion written in clinical shorthand). | A 4.1, A 4.2 | 5 (done in the instructions: three definitions and four examples; `tests/agent.test.mjs` keeps them) |
| C7 | Every action input has a schema; anything the schema cannot express (an id's shape, lengths, membership in what was fetched) is checked in code before anything happens. Fields the source may not hold are optional, never required. | A 4.3, D 6 | 4 (done for search and details), 5 (done for shortlist and notes, `site/guard.js`) |
| C8 | Output that fits the schema is not yet trusted: a schema stops malformed output, not wrong output. Code checks it against the record (a quoted criterion must be in the study's criteria text) before it is shown. | A 4.3, A 4.4, D 6 | 5 (done, `tests/guard.test.mjs`, `tests/app.test.mjs`) |
| C9 | When that check drops items, the action says exactly which and why, so the model can correct them once. It is told not to retry when the record simply does not say; that is "cannot tell". | A 4.4 | 5 (done: each dropped item comes back with its reason; correcting once is in the instructions) |
| C10 | Every claim about a study carries where it came from: the study id, the quoted criterion, and the record's last-update date. Our code renders these from the record, so they cannot be lost in a summary. | A 5.6 | 3 (done for the page), 5 (done: notes show the study id and the record's date) |
| C11 | The suggested default model is named exactly (a pinned version, not "latest"), chosen by running the eval set, and changed only after running it again. Model names come from the providers' current lists, never from memory. | D 2, D 5 | 9 |

## 3. Site actions (the tools)

| Id | Rule | Guide | Built in |
| --- | --- | --- | --- |
| T1 | An action is a thin wrapper over the page object and `guard.js`. The page's own buttons call the same functions, so the site works without AI. Site actions, not an MCP server, are the right tool type here: the capability lives in the page, needs no server, and other sites reach it through the network, not through us. | D 8 (agentic customization) | 3 (done for the page), 4 (done: both actions wrap page methods) |
| T2 | **Hard.** Every action declares its effect. No action is `irreversible` (W3). | D 8, A 2.3 | 4 (done), 5 (done for all four actions) |
| T3 | A description is how the model chooses a tool, so each says what the action is for, the input it expects with an example, what it returns, the edge cases, and what it does **not** do where another action looks similar. Instructions are reread for wording that could pull the model toward the wrong action. | A 2.1, D 8 | 4, 5 (done for all four actions; wording read by hand, not testable) |
| T4 | **Hard.** A refusal is a fixed block: `ok: false`, a `category` (`validation`, `not_found`, `business`, `transient`), `retryable`, and a plain `reason` the agent can pass on. It changes nothing. An unexpected failure never carries an underlying error's text. Actions return refusals; they do not throw, because the runtime reports a throw as an unknown outcome. | A 2.2 | 4, 5 (done for all four actions through the runtime) |
| T5 | "Nothing matches" is a successful result that says so. "The data source did not answer" is a `transient` refusal. They are never confused, and an empty list is never returned in place of a failure. | A 2.2, A 5.3 | 2 (done for the data layer), 4 (done through the runtime) |
| T6 | A specialist that fails tells the front agent what it tried and what it did get, and the front agent tells the visitor what is missing instead of presenting a partial answer as whole. One failed step does not end the conversation. | A 5.3 | 5 (done in code: a failed specialist comes back to the front agent and the conversation goes on, `tests/agent.test.mjs`; what it says is for the eval), 6 (no new specialist) |
| T7 | Results put what the agent needs first and are bounded: at most 10 studies, 5 sites each, a fixed list of fields, well under the runtime's size cap. Long records are trimmed by code before the model sees them, with the key facts first. | A 5.1, D 6 | 2 (done for the data layer), 4 (done: results under 64 KB; criteria over 20,000 characters cut and marked) |
| T8 | **Hard.** Text written by someone else (every free-text field of a study record; every partner reply) is labelled untrusted in the result. A hostile-record test keeps it so. | D 7 | 4 (done), 5 (done: the hostile record also tries the shortlist and notes actions) |

## 4. Data, privacy and logs

| Id | Rule | Guide | Built in |
| --- | --- | --- | --- |
| D1 | **Hard.** Nothing about the visitor is stored by our code: no cookies, `localStorage`, `sessionStorage` or IndexedDB for health details, searches or the shortlist. | D 7 (PII, least privilege) | 3 (done, `tests/source-checks.test.mjs`) |
| D2 | **Hard.** The visitor's model key and settings belong to the runtime. Our files never read them and never put them in a URL, an action argument, a request or a log. | D 7 (secrets and keys) | 4 (done, `tests/source-checks.test.mjs` covers site.js and site-actions.js) |
| D3 | **Hard.** No console output carries what the visitor typed, what the model wrote, or record text. Names, ids, codes and counts only. | D 7 | 3, 4, 5 (done: the source checks cover `site/guard.js`) |
| D4 | **Hard.** The page loads nothing from a third party: no scripts, fonts, analytics or beacons. The only outside requests are the AI provider (made by the runtime), ClinicalTrials.gov, and a peer after consent. | D 7 | 3 (done for the page, `tests/source-checks.test.mjs`), 8 |
| D5 | **Hard.** Requests to ClinicalTrials.gov are plain `GET` with no custom header and no credentials, and always name their fields. | D 7, A 5.1 | 2 (done, `tests/trials-api.test.mjs`) |
| D6 | Before the first search the visitor is told what is sent where, and the "How the AI works here" page says the same in full. A new feature that sends anything new updates both in the same task. | D 7 | 3 (done for the notice), 6 (done: `ai.html` names every place anything is sent; `tests/pages.test.mjs`) |
| D7 | The data source, the date the data were processed, and every modification we make are stated on the page, per ClinicalTrials.gov's terms. | A 5.6 | 3 (done for the page), 6 (done: `data.html` states the source, the dates, the terms and every change; `tests/pages.test.mjs`) |
| D8 | A peer receives only what the visitor's question needs; the instructions say not to send age, sex or location unless the visitor asked for exactly that. | D 7 | 7 |
| D9 | The visitor can see what the agents did: which agent ran, which actions were called, which origins were contacted and what consent was given. Use the runtime's own activity view; it is also how we debug, by reading the trace to see whether a fault is in our action or in the model's choice. | D 4 | 4 (the runtime's agents view is mounted; checked in a browser only), 9 |
| D10 | The visitor pays for the model calls, so we do not waste them: results are trimmed (T7), specialists are called only when needed (C1), and the page says plainly that the conversation runs on their key and their provider's prices. | D 5 | 4 (results trimmed), 6 (done: the main page and `ai.html` say the assistant runs on the visitor's key at their provider's prices; `tests/pages.test.mjs`) |
| D11 | Quality is measured: an eval set with a person grading, re-run before changing instructions or the suggested model. Results are reported **by category of case**, not only as one overall number, because a good average can hide a category that fails. | A 5.5, D 4 | 9 |

## 5. The builder

| Id | Rule | Guide | Status |
| --- | --- | --- | --- |
| B1 | Start from the written record: `HANDOFF.md`, this file, `OPEN_QUESTIONS.md`, and the challenge's own documents. A new session starts from these, not from an earlier session's memory. | A 1.7 | Holds |
| B2 | Standing rules load from configuration, not from a request to remember: `CLAUDE.md` for the whole repository, and path-scoped files in `.claude/rules/` for the files being edited. The end-of-task routine is a project command, `/task-done`. | A 3.1, A 3.2, A 3.3 | Holds |
| B3 | One task per pull request, in order. Stop where the handoff says to stop. Plan first for the tasks with real design choices (4 and 7); go straight to the change for small, well-scoped ones. | A 3.4 | Holds |
| B4 | Tests come first where behaviour is a rule: the guard's tests are written before the guard, and a failing test is how a fix is described. | A 3.5 | Holds (task 5: `tests/guard.test.mjs` was written and run, failing, before `site/guard.js`) |
| B5 | Scott makes every git and GitHub write. The builder hands over a commit message and a list of files. | D 7 | Holds (`.claude/settings.json`) |
| B6 | Report what was run and what was not. A test that was written and not run is reported as not run. | | Holds |
| B7 | Before the final use test (task 10), a separate session with none of the build's context reviews the site against the handoff and this file, and its findings go to Scott unedited. The session that wrote the code is the wrong one to review it. | A 3.6, A 4.6 | Task 10 |
| B8 | Never weaken or delete a hard rule's test. Changing one is its own pull request and says why. | | Holds |
| B9 | Ambiguity goes in `OPEN_QUESTIONS.md` with the option chosen; choose the one that keeps the visitor in control and the change reviewable, and keep going. A need for a server, a store, a dependency or a runtime edit means stop and ask. | | Holds |

## The tests that keep the hard rules

1. **Never-actions (W3, T2):** walk the manifest's action list; fail on an `irreversible` effect or a name matching `contact`, `email`, `send`, `enrol`, `enroll`, `register`, `apply`, `save_profile`, `key`, `settings`.
2. **Three states (W2):** the schema's enum; the fixed heading and disclaimer are present whatever the model sends.
3. **Quoted criteria are real (C8, C9):** items not found in the fetched criteria text are dropped and named in the result; nothing surviving is a refusal.
4. **Order and fetched ids (W5):** notes before a fetch are refused; an id this session did not fetch is refused; a malformed id is refused before any request.
5. **Hostile record (T8, W4):** a record telling the model to declare the visitor eligible, to add ids, or to contact someone changes nothing the code controls.
6. **The refusal block (T4, T5):** every action, given a bad input and a failing data source, returns the fixed block with the right category; an empty search is a success.
7. **Tool counts (C2):** no agent is offered more than five site tools or seven tools in all, counted from what the runtime offers it; the test fails when one grows.
8. **No storage, no key access, no content in logs, no third-party origins (D1–D4):** source checks with allow-lists kept in the tests.
9. **Simple GET (D5):** the request built by `trials-api.js` has no headers and names its fields.

## Changing a standard

A pull request that edits this file and says why. Loosening a hard rule needs Scott's written yes in `OPEN_QUESTIONS.md` first. When either guide has a new version, re-read it and update this file the same way.

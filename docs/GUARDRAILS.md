# Guardrails for an agentic website

How Trial Finder keeps an AI agent in a visitor's browser inside the lines, and how to
reuse the pattern on your own site. Short on purpose. The full rule list is
`docs/AGENT_STANDARDS.md`; every decision and its reason is in `OPEN_QUESTIONS.md`.

Trial Finder is a static site for the Open Agentic Web Challenge. An AI agent, running
in the visitor's browser on the visitor's own model key, searches public clinical study
records, explains who each study is for in plain words, and prepares a sheet of
questions for the visitor's doctor. It never contacts anyone, and it is built not to decide
whether someone can take part: the notes on the page are checked for that in code, and the
chat is asked not to by its instructions. Its partner, Fernhollow Asthma Friends, is an invented support
group whose own agent can ask Trial Finder's, and be asked by it.

## The pattern: instructions ask, code decides

On an agentic website **you do not write the agent loop.** The challenge's browser
runtime runs it: it sends the conversation to the model, the model picks a tool, and the
runtime calls it. You control three things:

1. **The network file:** which agents exist, their instructions, and which other sites
   they may call.
2. **The site actions:** the functions the model can call on your page, with a schema
   and a declared effect.
3. **The page:** what it shows, and what its own buttons do.

Instructions are read by a model, and a model does not follow them every time. So a
rule that must always hold is enforced **inside the site action**, in plain code, with a
test. The instructions still ask for the same thing, so the model rarely hits the wall;
the code is the wall.

In Trial Finder:

- **Actions are thin.** Each one checks its input, then calls the same page method the
  page's own buttons call. The site works without AI, and the AI cannot do anything the
  page could not.
- **One guard file** (`site/guard.js`) holds every check on what the model writes. It
  has no page and no network in it, so it is easy to test.
- **Refusals are data, not errors.** A refused call returns a fixed block
  (`ok: false`, a category, whether to retry, a plain reason). It never throws, because
  the runtime reports a throw as an unknown outcome, and the model then guesses.
- **What is shown comes from the record, not from the model.** The page renders the
  study's id, its criteria word for word, and the record's date. A note the model writes
  about a criterion is shown beside the record's own wording of that criterion, never
  the model's copy of it.

## Every guardrail, where it is enforced, and what keeps it

"Code" means our files; "instructions" means only the model's instructions, checked by
the eval, not by a test; "runtime" means the challenge's runtime, which we do not edit.

| Rule | Enforced by | Kept by |
| --- | --- | --- |
| No verdict on eligibility: each criterion is "likely meets", "likely does not meet" or "cannot tell: ask the study team", under a fixed heading and disclaimer (W2) | Code: the action's enum, `guard.js` (`STATUSES`, `givesVerdict`), fixed words in `app.js` | `tests/guard.test.mjs`, `tests/app.test.mjs` |
| No action contacts anyone, sends a message, enrols, stores visitor data, or touches the key; none is irreversible (W3, T2) | Code: no such action exists; every action declares its effect | `tests/agent.test.mjs` (the never-actions walk of the manifest) |
| A quoted criterion must be in the fetched record; dropped items are named with a reason; the page shows the record's whole criterion (C8, C9, C10) | Code: `guard.js` (`checkNotes`, `criterionInRecord`) | `tests/guard.test.mjs`, `tests/app.test.mjs`, `tests/agent.test.mjs` |
| Notes only after that study was fetched; only ids fetched in this session (W5) | Code: the page object and the actions | `tests/app.test.mjs`, `tests/agent.test.mjs` |
| Questions the agent puts on the sheet are questions, and state no verdict (W2) | Code: `guard.js` (`isSheetQuestion`) | `tests/guard.test.mjs` |
| Record text reaches the model only under `untrusted_record_text`, labelled as data (T8) | Code: `site-actions.js` | `tests/agent.test.mjs` (including a hostile record that tells the model to declare the visitor eligible) |
| Refusals use the fixed block; "nothing matches" is a success, "the source did not answer" is a refusal (T4, T5) | Code: the actions and `trials-api.js` | `tests/agent.test.mjs`, `tests/trials-api.test.mjs` |
| Results are bounded: at most 10 studies, 5 sites each, long criteria cut and marked (T7) | Code: `trials-api.js`, `site-actions.js` | `tests/trials-api.test.mjs`, `tests/agent.test.mjs` |
| No agent is offered more than 5 site tools or 7 in all (C2) | Code: the site has five actions; a test counts what the runtime offers | `tests/agent.test.mjs` |
| A specialist sees only the request it is handed, not the chat (C3) | Runtime, checked by our test | `tests/agent.test.mjs` |
| A partner site is contacted only after the visitor allows it on a card; a declined card fetches nothing (W1) | Runtime (the consent card), checked by our test | `tests/agent.test.mjs` |
| A partner gets the request text only: no chat history, no private data (D8, the transport part) | Runtime, checked by our test | `tests/agent.test.mjs` |
| Nothing about the visitor is stored; the key and settings are never read; nothing the visitor or model wrote is logged (D1, D2, D3) | Code: none of our files does any of it | `tests/source-checks.test.mjs`, `tests/trials-api.test.mjs` |
| Nothing loads from a third party; the browser may contact only the site, the data source, the listed AI providers and the partner (D4) | Code: the pages, and each site's `_headers` security policy | `tests/source-checks.test.mjs`, `tests/headers.test.mjs` |
| Requests to the data source are plain `GET`, no headers, no credentials, fields named (D5) | Code: `trials-api.js` is the only file that calls it | `tests/trials-api.test.mjs` |
| The visitor is told what is sent where before the first search, and on "How the AI works here" (D6) | Code: the notice; the page's text | `tests/app.test.mjs`, `tests/pages.test.mjs` |
| The default model is named exactly, chosen by the eval, and the same in both networks (C11) | The network files | `tests/eval.test.mjs` |
| Ask instead of guessing; say at once when only a person can decide (W6, W7) | Instructions only | The eval |

## What is not enforced in code

Said plainly, so nobody reuses this and assumes more than it does:

- **The model's own words in the chat.** The code checks what goes on the page (the
  cards, the notes, the sheet). It cannot check what the assistant says in the chat. A
  model can say something wrong there, and the eval found models that did: one invented
  three studies. The page says so, and says to trust the page over the chat.
- **Partner replies are not labelled untrusted (T8).** The runtime hands a partner
  site's reply straight to the model; no code of ours sees it first. The instructions
  call it data, not instructions, and that is all.
- **What the model writes in a request to a partner (D8).** The code makes sure a partner
  gets only the request text. What the model puts in that text, such as the visitor's
  age or place, is up to the instructions, and is checked only by the eval.
- **"Delete setup" in the runtime's settings** removes the saved key only. The open tab
  keeps using its copy until it is closed. That is the runtime's behaviour; the page
  says so.
- **Whether a note's reasoning is right.** The guard checks that a quote is real and that
  the words are not a verdict. It cannot tell whether "likely meets" was the right call;
  the eval found a model marking "diagnosed for at least 12 months" as met when the
  visitor had said only "asthma".
  That is why the heading says the notes can be wrong and are not a decision.
- **The verdict check reads wording.** It drops a note worded as a decision ("you
  qualify", "this study is not for you", "you must stop your inhaler"). A new way of saying
  the same thing can get past it. The independent review found seven such phrasings,
  and they are now tests; the check was then run over every note the eval's models wrote,
  and dropped none of them.
- **Some tests check by name or by text.** The never-actions test fails on an action
  named like `contact` or `send`, or marked irreversible; an action named some other way
  that opened a `mailto:` link would pass it. The source checks look for words such as
  `localStorage`; a name built from pieces would pass them. Nothing like that is in the
  code. Code review is what catches it.

## What the eval showed

24 cases in six categories, run on the real assistant with four models on Nov 19, 2026,
and graded by hand from the transcripts (`eval/RESULTS.md`):

| Model | Search | Eligibility | Refusals | Hostile | Partner | Failures | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `alibaba/qwen3.8-flash` (the default) | 6/6 | 5/5 | 5/5 | 3/3 | 3/3 | 2/2 | 24/24 |
| `z-ai/glm-5.3-flash` | 4/6 | 5/5 | 4/5 | 3/3 | 2/3 | 2/2 | 20/24 |
| `deepseek/deepseek-v4-flash-0731` | 1/6 | 1/5 | 5/5 | 3/3 | 2/3 | 2/2 | 14/24 |
| `mistralai/mistral-small-4` | 4/6 | 1/5 | 5/5 | 2/3 | 0/3 | 1/2 | 13/24 |

- **Score by category, not only in total.** Every model refused verdicts and medicine
  advice, because those rules are code. The categories that depend on the model's own
  choices (searching, writing notes, asking the partner) are where they differ.
- **The worst fail was in the chat, where no code reaches:** `glm-5.3-flash` skipped a
  search and invented three studies. The page still showed the real results.
- **Seven of the DeepSeek fails were the provider's errors (HTTP 502),** not the model.
- **One run is one sample.** Models do not answer the same way each time. A 25th case
  (P4, a stricter test of D8) was added after these runs and is not in the table.

## How to reuse it

Copy the shape, not the health content.

1. **Write the page first, with its own buttons.** Put the logic in a page object whose
   methods the buttons call (`site/app.js`). If the page does not work without AI, the
   actions have nothing safe to wrap.
2. **Write the guard and its tests before the actions** (`site/guard.js`,
   `tests/guard.test.mjs`). List what the model may write, and check each piece against
   something the model cannot change: your own data, an enum, a fixed list.
3. **Make each action a thin wrapper** (`site/site-actions.js`): check the input, call
   the page method, return a result or the fixed refusal block. Declare each action's
   effect. Leave out any action you would not want a model to call without you.
4. **Label outside text** in every result, under its own field name, and say in the
   instructions that it is data.
5. **Keep the source checks** (`tests/source-checks.test.mjs`, `tests/headers.test.mjs`):
   no storage, no key access, no logging of content, nothing from a third party.
6. **Run an eval with a person grading,** scored by category, before you choose a
   default model and whenever the instructions change (`eval/`).

What to change: the data layer (`site/trials-api.js` is specific to one public
database), the three states and their words, the fixed lines, and the instructions in
the `.hocon` file. Keep the runtime unedited; put every rule in your own files.

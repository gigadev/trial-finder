# Independent review, task 10c (Nov 19, 2026)

Reviewer: a fresh session with no build context. Nothing in the repository was changed and no git writes were made.

## What was run

- `node --test "tests/*.test.mjs"`: 219 tests, 219 passed, 0 failed.
- `build_network.mjs --check` for both sites: both OK. Every generated file is up to date. Two expected warnings: there is no `cruse` block, and `partner_rules` differs from the template (recorded in B18).
- Live sites, with no key: headers fetched with curl. Twelve served files were compared byte for byte with the repository, and all were the same. In Chrome on trial-finder.pages.dev: a search (with the notice), a study's details, the shortlist, the sheet, a heading and label check, and a check of storage and cookies. Fernhollow's page was read and its assistant's status was checked.
- `site/guard.js` was probed with 17 sample "why" sentences and 6 sample sheet questions (the script was kept in the temp folder, not in the repo).

## (1) Hard rules the code does not keep, or whose test would still pass if broken

1. **W2: the verdict filter misses common verdict wording, and the tests still pass.** `givesVerdict` (`site/guard.js:151-162`) only catches "qualify", "eligible", "you can/cannot join…", "you will be accepted…" and "you should". In my probe these "why" texts were all **kept** and would show on the page beside the state words: "You would be excluded from this study.", "You can't be in this study.", "You cannot enter this study.", "This study is not for you.", "You are a good candidate for this study.", "You are too old for this study.", "You meet this requirement.", "You must stop taking metformin first.", "You need to stop your inhaler before joining.". `isSheetQuestion` (`guard.js:175-179`) let the agent add "I qualify, right?" and "Since I meet every criterion, when can I start?" to the printed sheet. The guard tests only check the listed phrases, so they pass.
2. **W3 / T2: the never-actions test checks only names and effects** (`tests/agent.test.mjs:247-266`). An action named, for example, `notify_team` would pass it, and so would code inside an existing action that sets `location.href = "mailto:…"`, since `mailto:` and `tel:` have no `//` for the D4 origin scan to find (`tests/source-checks.test.mjs:103-112`). Today no such code exists. The test would just not catch it.
3. **W5 as `HANDOFF.md` §8 rule 2 states it ("any action given a study id refuses one that was not returned by a search or fetch in this session") is not kept for `get_trial`.** `openStudy` (`site/app.js:312-329`) fetches any id shaped like NCT plus 8 digits. The action's description invites ids "typed by the visitor" (`site/site-actions.js:297`). The result comes from the record, so the harm is small. But the rule's wording and the code disagree, and `OPEN_QUESTIONS.md` does not record it. (B16 covers only the shortlist.)
4. **T8 is not met for partner replies, and D8 is instruction-only.** Both are known (B18, HANDOFF §16 d) and still open.
5. **D1–D3 are regex source checks** (`tests/source-checks.test.mjs:68-91`). A computed name such as `globalThis["local"+"Storage"]` or `globalThis["con"+"sole"]` would pass them. This is the normal limit of a source scan. It is noted only because the brief asks.

## (2) What the site says that the code does not do

1. `site/ai.html:109` says "A note that decides for you whether you can take part is dropped", and `ai.html:110` says sheet questions "must not decide". Finding 1.1 shows that both are only partly true. `docs/GUARDRAILS.md:10` ("It never says whether someone can take part") and the site-list entry in `docs/SUBMISSION.md:25` ("Never says whether you can take part") overstate it further: the chat text is not controlled at all (A5).
2. `site/ai.html:66` states as a fact that a partner gets "never your age, sex or place unless you asked for exactly that". That is instruction-only (D8). P4 has not been run, and a candidate model did leak an age (mistral P3). The page's "What the code cannot check" list (`ai.html:114-119`) does not mention it.
3. `site/data.html` ("Shown from the record without changes") lists each site's "zip code". The page never shows a zip code: `placeWords` in `site/app.js:120-122` uses only city, state and country.
4. `partner/index.html:30` says "To look for clinical studies, it can ask Trial Finder". When Fernhollow asks, Trial Finder cannot search (A4). Its footer (line 53) and its instructions say this correctly, but the line a visitor reads first does not.
5. `site/about.html` says "Trial Finder shows them in plain words". The page shows the records word for word. Plain words come only from the AI.
6. `eval/RESULTS.md:39-43` still says the cut-quote problem is "None is fixed yet". B21 fixed it.
7. The footer and the notice say "this site stores nothing about you", while the runtime keeps the key in this origin's local storage. `ai.html` explains this, so it is a small point. Without a key, the live site's local and session storage were both empty.

## (3) What a worried visitor could misread as advice or as a decision

1. **The model-written "why" sits beside "Likely meets" or "Likely does not meet"** on the page, and finding 1.1 lets verdicts and medicine instructions ("You must stop taking metformin first") through. This is the clearest path to a sentence a visitor reads as a decision or as advice.
2. **"Based on what you said:"** (`app.js:42`, `614-616`) lists model-written `visitor_facts`. The eval saw the model put words the visitor never said into it (`eval/RESULTS.md:44`). The code only checks length and verdict words.
3. **A wrong "Likely meets"** was given on "physician diagnosis of asthma for at least 12 months" when the visitor said only "asthma" (`eval/RESULTS.md:74`). The guard cannot catch it. To a worried reader, "Likely meets" reads like a near-yes.
4. **Agent-added sheet questions that assume eligibility** ("I qualify, right?") would print on a sheet that goes to a doctor (finding 1.1).
5. A minor one: `app.js:93` writes phase `NA` as "No phase (not a drug study)". "Not a drug study" is an inference the record does not state.

Checked and sound here: the fixed not-advice line is on every view and on the sheet. The emergency line is in the chrome of every page on both sites. The sheet leaves off "Likely meets" and the AI's reasons (B17). The withdrawn Boise site is named plainly, with the nearest recruiting sites given as straight-line miles. The contact is shown as text with "This site does not contact anyone for you."

## (4) The challenge's rules (as `HANDOFF.md` §2 states them)

1. **Third-party names show up in any screenshot or video of real use.** Real records bring sponsor and drug names (live: "AstraZeneca Clinical Study Information Center", its phone and email, and "Tozorakimab") onto the cards, the details and the printed sheet. The runtime's settings panel shows provider names and links (Otari, Google AI Studio, Groq, OpenAI, Anthropic), and `ai.html:89` names them in text. Task 11's shot list needs to deal with records as well as the settings panel.
2. The trademark checks of "Trial Finder" and "Fernhollow Asthma Friends" are not done (HANDOFF §16 a and b).
3. Sound: no employer or personal name appears in `site/` or `partner/` outside the runtime (searched for the employer, the owner's name and the account name). Fernhollow says on every view that it is invented. The runtime hashes test passes.

## (5) Accessibility and plain language

1. **A literal "null" appears in every study's details on the live site** (seen on NCT06932263, under the summary). `renderStudy` (`site/app.js:742-753`) passes `this.notesBlock(record)` straight to `replaceChildren`, and that returns `null` when the study has no notes. `contactBlock` does the same for a study with no contact. A browser writes `null` as text, and a screen reader reads it out. The tests miss it: the skill's stub `replaceChildren` stores `null` (`vendor/agentify-website/templates/tests/stub_element.mjs:82-84`), and `textOf(null)` returns "". This is the most visible fault I found.
2. The runtime's "What is an API key and how do I get one?" control is 19 px tall, under the 24 px target that 10a set for the runtime's other controls.
3. Sound on the live desktop page: headings are in order (h1, h2, h3, h4); every visible input, select, textarea and button has a name; there is no sideways scroll; the notice takes focus and then hands it to the results heading; the status line is a polite live region; the result count reads "1 study is shown". The copy is short and plain, apart from the record text itself, which is verbatim by design.

## (6) Open items in `OPEN_QUESTIONS.md` and `HANDOFF.md` §16 to settle before submission

- The name, and both trademark checks (§16 a, b).
- Decision 3, the page policy (C3 and B19): the default was taken, and Scott has not confirmed it.
- T8 for partner replies (§16 d, B18): accept it as instruction-only, or ask for a hook.
- The eval grades are still Claude's suggestions (§16 e). P4 is not run. The two extra runs of the default (10b item 4) are not done.
- `vendor/agentify-website/` as a development tool (B9, C4): still "Scott to confirm".
- Whether Scott's name goes on About (B17).
- Providers' names, and now also sponsor and drug names, in screenshots and the video (§16 f).

## Checked and found sound

- The guard's quote check against the record, with the whole criterion shown (C8, C10).
- The order gate on notes (W5).
- The refusal block (T4), and "nothing matches" as a success (T5).
- Plain `GET` with one argument and a fixed field list (D5).
- Record text set only with `textContent`.
- Contacts are never given to the model.
- Free text is under `untrusted_record_text`, and the hostile-record test is meaningful (T8 for records).
- Tool counts, counted from what the runtime offers (C2).
- The notice blocks every request until the visitor answers, and the data date is fetched only after it (D6).
- The live headers match `_headers` (CORS only on the public files, the worker CSP, the bridge frameable).
- The live files are identical to the repository.
- The instructions never mention the notice.
- The version shown in the footer matches the network.

## Not checked

- Anything with a model key: the chat, notes written by a real model, consent cards, and partner calls both ways.
- `check_partner.mjs` (not in the brief).
- A real phone, 320 px width, 200% zoom, a screen reader, and print or print preview.
- The challenge's own documents and the Devpost rules page (I relied on `HANDOFF.md` §2, as the brief says).
- Trademark databases.
- The eval transcripts line by line.

# Open questions and settled ambiguities

Where the challenge's own documents and `HANDOFF.md` disagree, the documents win and the
difference is written here. Each entry says what was found, where, and what we do about it.
Entries marked **Scott** need his answer; the rest are settled and only recorded.

Sources read on Nov 17, 2026:

- The challenge repository `cognizant-ai-labs/agentic-web` at commit `47cce0f`
  (Nov 17, 2026): README, the spec, the skill and its five references, the runtime's
  README and code, `providers.md`, `otari.md`, `quickstart.md`, `agentic_websites.md`.
- The spec file last changed on Nov 10, 2026 (commit `fd872b9`), before the submission
  period began on Nov 11, so "the spec as of the start of the Submission Period" is the
  spec we read.
- The Devpost rules page, read in a browser.
- ClinicalTrials.gov: the API's OpenAPI description (`/api/oas/v2`, API 2.0.5),
  `/api/v2/studies/metadata`, `/api/v2/studies/enums`, the "About the API" page and the
  Disclaimer page.
- Issue #28 and pull request #19 in the challenge repository.

---

## A. HANDOFF §17 "not verified", item by item

### A1. Exact field names in the manifest and the network

Confirmed from `bundle_and_hosting.md` and the skill's templates.

- Manifest: `networks[0].name`, `.front_man`, `.hocon`, `.description`, `.sample_queries`;
  `brand`; `theme.primary`; `llm_router.base_url`, `.byok_router`, `.mock`; `peer_policy`
  (`mode: "closed"`), `allowed_peers`; `deployment.mode` (`"static"`); `actions.version`,
  `.module`, `.bridge`, `.agentTools`; `linking.exports[].aliases`; `linking.protocol`;
  `agent_mcp`.
- Network: top-level `metadata`, `tools` (the agents), `commondefs.replacement_strings`,
  `link_labels`, `cruse`, `llm_config`. Each agent: `name`, `function.description`,
  `function.parameters`, `instructions`, `tools`.
- **The source of truth for the network is a `.hocon` file.** `build_network.mjs` writes
  `<network>.network.json`, the bridge folder, `agent-mcp.json` and two `.well-known`
  files. Generated files are never edited by hand.

Changes to the handoff: the network file name must equal the network name, so it is
`trial_finder.hocon` → `trial_finder.network.json` only if the network is named
`trial_finder`. The `.hocon` sits next to the manifest in `site/`, not in a separate
`network/` folder. The protocol name for the discovery files is `nsdeploy`.

### A2. How effects are treated when an action only changes what the page shows

`site_actions.md`: "An action that only replaces a results panel is still a `write`."
A `read` changes nothing on the page.

- **`read` and `write` actions both run at once, with no dialog.** Only `irreversible`
  asks the visitor. The skill itself says this falls short of spec §3.1, which asks the
  runtime to show a write before it runs.
- The skill's test template checks that each write action's "How to work" line tells the
  agent to call it "only when the visitor asks".

Changes to the handoff: `search_trials` shows cards on the page, so it is a **`write`**,
not a `read` as HANDOFF §7 has it. `get_trial` is a `read` only if it does not open the
detail panel. Decide both in the task 4 plan. Our own guardrails matter more because the
runtime does not ask before a write: every write must be visible and undoable on the page
(W1), and that is ours to enforce.

### A3. Can specialists call site actions?

Yes, and more than we wanted. The runtime offers **every** action in `actions.agentTools`
to **every** agent of the site's own network (`runtime/runner.js`, `buildToolTable`). A
specialist is limited only by its instructions. Issue #28 proposes per-agent actions; its
authors now plan to build that on a later runtime, so it will not reach the runtime we copy.

This changes the design. **Scott, for the task 4 plan:**

- Rule C2 ("no agent has more than five tools") cannot hold as written. With six actions,
  every agent is offered six `website_*` tools, plus `render_cruse` if the network turns
  on the chat's forms and tables, plus whatever its own `tools` list names. The front
  agent would see about ten.
- Options. (a) Keep three agents and count only the tools each agent is *told* to use;
  the test then checks instructions, which is weak. (b) Cut to two agents and five
  actions (fold `get_shortlist` into what `update_shortlist` and the sheet return), and
  leave the chat's forms off, so each agent is offered five site tools plus one or two
  entries of its own. (c) One agent, as the skill recommends for small sites; but spec §6
  asks a conforming site to show a two-agent network calling an internal agent, so one
  agent is not safe for Stage 1.
- My pick is (b): it keeps the count honest, keeps Stage 1 safe, and costs the visitor
  fewer model calls. Changing C2's wording is an edit to `docs/AGENT_STANDARDS.md`, which
  needs its own reason in the pull request.
- The order gate (W5) and the criteria check (C8) do not depend on which agent calls, so
  they hold either way. They are code.

### A4. What a site must publish to be called, and whether the bridge is needed

`linking.md`, "Let other sites call this site":

- The bridge is needed whenever the manifest has `actions`. The build writes
  `bridge/action-bridge.html` and `bridge/agent-manifest.json`. Without the bridge a
  caller waits 10 seconds, asks its visitor to open a popup, and never runs the network.
- The bridge shares **no** actions. **A site that calls us gets none of our site tools.**
  Our network, run on the partner's page, cannot search ClinicalTrials.gov. It can only
  say what Trial Finder offers and point to our page.
- The front agent keeps the template's `{peer_rules}` so it says this plainly.
- Serve the public files with `Access-Control-Allow-Origin: *`, and never block framing
  of `bridge/`.

This changes HANDOFF §9. The planned demo, where a visitor on the partner site asks "are
there studies recruiting near me?" and gets studies back, **cannot work**. Neither choice
in §9 fixes it: (a) the full network with the bridge has no tools when called, and (b) a
facts network (pull request #19, still open and not merged) holds fixed text, not live
search results. **Scott, for the task 7 plan:**

- What does work: the partner's agent asks ours, after the consent card, and ours answers
  with what Trial Finder does and a link to it. The link can carry the condition in the
  part of the address after `#`, which the browser does not send to any server, so the
  visitor lands on a filled-in search and presses Search themselves.
- That still meets the rule's "be called by other agentic websites" line. It is a
  smaller demo than the handoff promised, and the description and video must not claim
  more.
- The other direction (we call the partner for support resources) works as planned,
  within the same limit: the partner answers from its instructions, not from its tools.
  So the partner's support content must be short enough to live in its network's
  instructions (about 5,000 characters, see A10).

### A5. Does the runtime expose a hook on the model's reply?

No hook that can change or stop a reply. `engine.onAnswerDelta` lets the page watch the
front agent's text as it streams; nothing lets the page edit it. The page-side hooks are
`onConsent`, `onActionConfirm` and `onLinkRequired`.

So nothing in code can stop the model writing "you qualify" in the chat. What code
controls is the page: the cards, the eligibility table with its fixed heading, the sheet.
This matches rule W2 as written (the enum and the fixed heading), but the limit should be
said plainly in `ai.html` and `docs/GUARDRAILS.md`, and the eval must test the chat text.
If the network turns on the chat's forms and tables (`cruse`), the model can also draw a
table in the chat that looks like a card. Leaving `cruse` off avoids that; decide in the
task 4 plan.

### A6. Rate limits and the full field list of the API

- **Rate limits: not stated** in the OpenAPI description or on the "About the API" page.
  No rate-limit headers came back on `/api/v2/version`. Treat as unknown: no retry loops,
  one request per visitor action, and a plain "the data source did not answer" state.
- **Field list:** `/api/v2/studies/metadata` lists 454 nodes. The ones we need, by the
  name used in `fields=`: `NCTId`, `BriefTitle`, `OverallStatus`, `Phase`, `Condition`,
  `BriefSummary`, `EligibilityCriteria`, `MinimumAge`, `MaximumAge`, `Sex`, `StdAge`,
  `HealthyVolunteers`, `LastUpdatePostDate`, `CentralContact*`, and under locations
  `LocationFacility`, `LocationStatus`, `LocationCity`, `LocationState`, `LocationZip`,
  `LocationCountry`, `LocationGeoPoint`, `LocationContact*`.
- **Enums:** overall status has 14 values (`RECRUITING`, `NOT_YET_RECRUITING`, …); a
  site's status has 9; sex is `FEMALE`, `MALE`, `ALL`; phase is `NA`, `EARLY_PHASE1`,
  `PHASE1`–`PHASE4`.
- **Paging is by token, not page number.** A response with more results carries
  `nextPageToken`; send it back as `pageToken` with the same other parameters. So
  `search_trials` cannot take a `page` number as HANDOFF §7 has it. It takes "more", and
  our code keeps the token in page memory.
- **`pageSize`** defaults to 10 and is capped at 1,000. **Results are not sorted unless
  asked**; `sort=@relevance` sorts by match.
- **`query.term`** is the "other terms" search. **Age:** no simple parameter; the
  documented way is `filter.advanced=AREA[MinimumAge]RANGE[MIN, 54 years] AND
  AREA[MaximumAge]RANGE[54 years, MAX]`. Sex can be filtered the same way.
- **`filter.geo` needs a latitude and longitude.** We have no geocoding (HANDOFF §4 rules
  it out), so the place goes in `query.locn` as text, and "nearest sites" is done by
  matching the city and state text in each site, not by distance. Say so in `data.html`.
- A `GET` with `fields` is still a simple request, so the no-preflight rule holds.

Task 2 writes the API notes into `docs/` and re-checks these against recorded answers.

### A7. ClinicalTrials.gov's disclaimer wording

Read in a browser. In our own words, it says: the U.S. government does not review or
approve the safety or the science of every study listed; whoever runs a study submits the
information and is responsible for its accuracy and for following the law; the National
Library of Medicine keeps the site; many kinds of organisations run and pay for the
studies, and U.S. agencies do not oversee or fund all of them. Task 6 paraphrases this on
`data.html` and `not-medical-advice.html` and links to the original. It is not copied.

### A8. Does GitHub Pages hosting pass conformance?

Probably, but it is not the choice. The skill asks for a Content-Security-Policy header
on `runtime/sandbox-worker.js`, and GitHub Pages cannot set headers per file. Neither
`build_network.mjs` nor `check_partner.mjs` tests that header: the checkers test the CORS
header on the public files and that the bridge can be framed. Two sites on the
challenge's list are on `github.io`. We use no coded tools, so the worker never runs.
Cloudflare Pages stays the default (HANDOFF §16 q3) because `_headers` can do all of it.
Not checked: whether GitHub Pages sends the CORS header on every file.

### A9. How a specialist gets its request and reports a failure (C3, T6)

- **Request:** give each agent one required string parameter named `request`. The
  runtime passes it to the specialist as plain text. Any other parameter name arrives as
  raw JSON. **Only the top front agent sees the chat history**; a specialist sees only
  that text. This confirms C3.
- **Tool results last one turn.** The next turn gets the visitor's messages and the
  agent's answers, not earlier tool results. So the agent must fetch a study again in a
  later turn before it can quote its criteria. Our "fetched this session" memory lives in
  the page, so the code gates still hold across turns.
- **Failure:** a tool that fails to run comes back as the text
  `Error from tool '<name>': <message>`. A specialist that uses up its steps returns
  empty text (default 12 steps). An action that throws is reported as outcome `unknown`
  ("may have happened, do not retry"), which is why our actions return refusals and never
  throw (T4). The front agent's instructions must say what to tell the visitor in each
  case (T6).
- **What the model sees from an action:** a receipt, `{"status": "succeeded", "result":
  …}`, with our refusal block inside `result`. Arguments that fail the schema never reach
  our code.

---

## B. Other differences from the handoff

### B1. Site tools are named `website_<action>`

The model sees `website_search_trials`, not `search_trials`. Instructions must use the
full names; the build checks each one against `actions.agentTools`.

### B2. Limits the runtime sets

Per visitor message: 24 agent calls, 90 seconds (checked when a call starts), 4 partner
calls, **1 call per partner network**, calls nest 5 deep. Instructions over about 5,000
characters per agent draw a build warning, and the runtime adds about 2,000 more. The
template's shared rules already use about 2,850 to 3,500 of the front agent's 5,000. This
is tight for C6's "two to four examples"; the explainer has more room because it does
not carry the front agent's shared rules.

### B3. The consent card

It shows the partner's label, its host, and only the first 140 characters of the
request; the partner gets all of it. "Always allow" lasts until the page reloads. Keep
requests to a partner under 140 characters so the visitor sees all of what is sent (D8).

### B4. The default provider is hosted Otari

The skill's template sets `llm_router.base_url` to `https://api.otari.ai/api/v1` with
model `alibaba/qwen3.8-flash`, and the settings panel lists Otari first. The visitor
still brings a key, so this is BYOK and matches HANDOFF §16 q4. Providers the panel
offers, from `providers.md`: OpenAI, OpenRouter, Anthropic (only if the visitor's
organisation allows browser calls), LiteLLM and Ollama (the visitor's own machine), and
Otari. The suggested default is chosen by the eval in task 9 (C11), not taken from here.

### B5. The page-level Content-Security-Policy cannot list every provider

HANDOFF §11 wants `connect-src` to allow only the providers the panel offers. The panel
also lets a visitor type any provider URL, such as a gateway on their own machine. A
fixed list would break that. **Scott, for task 8:** allow the listed providers plus
`http://127.0.0.1:*` and `http://localhost:*`, and say on `ai.html` that other provider
addresses will not work here; or leave `connect-src` open to `https:`. My pick is the
first: it keeps rule D4 real.

### B6. Where the runtime keeps the key

In `localStorage` for our origin. On `localhost` and `127.0.0.1` only, it also copies the
setups, key included, into a cookie for 180 days that any local port can read. That is
the runtime's own doing and we do not touch it (D2), but: local tests of two linked
sites must use two host names (`127.0.0.1` and `localhost`), and anyone testing locally
should use a key with a low spending limit, delete the setup and close the tab after.
`ai.html` should say where the key is kept on the hosted site.

### B7. The video rule

The rules say the video "should include the Entrant explaining the Project". They do not
mention AI generation. HANDOFF §2's "not AI-generated" is a sensible reading and stays.

### B8. The runtime we copy is newer than the start of the submission period

The rules bind us to the *spec* as of Nov 11; the spec file has not changed since Nov 10.
The runtime in the skill changed on Nov 12 (calls between sites), Nov 13, Nov 16 and
Nov 17. We copy it at commit `47cce0f` (Nov 17) because calls between sites need it. The
commit is recorded in `NOTICE`. The challenge's README warns that the repository changes
often; we do not update the copy without a reason and a pull request of its own.

### B9. The skill is kept whole in `vendor/`

`HANDOFF.md` §5 names the skill's scripts but not where they live. `check_partner.mjs`
imports the runtime from the folder next to it, so the scripts cannot be copied alone.
The whole skill (scripts, templates, references, runtime) is in
`vendor/agentify-website/`, unchanged, and `site/runtime/` is the copy the site serves.
A test fails if any file in either copy differs from the hashes recorded at copy time.
Nothing in `vendor/` is deployed. It is a development tool with no install step; **Scott**
to confirm this counts as the handoff's own tooling and not a new dependency.

### B10. Line endings

Git on this machine checks text files out with Windows line endings. That would change
the copied runtime's bytes. `.gitattributes` marks `vendor/` and `site/runtime/` as
"do not convert", and everything else as LF.

### B11. Task 1 landed in the first commit, not in its own pull request

The repository's first commit (`2473cde`) holds the handoff files and all of task 1
together, on `main`. HANDOFF §13 asks for one task per pull request. Nothing is lost,
since there was no earlier history to review against. Task 2 onward goes on a branch
and a pull request each.

### B12. Path-scoped rules: loading not confirmed

`/task-done` loads and the deny rules refuse git writes (checked by trying
`git add --dry-run .`). Whether the files in `.claude/rules/` load when a matching file
is opened could not be seen from inside the session: opening `tests/scaffold.test.mjs`
showed no sign either way. The rules were read in full at the start instead. Re-check
when task 2 opens `site/trials-api.js`.

### B13. Task 2: what the live data source showed, and what was settled

Details and dates are in `docs/CLINICALTRIALS_API.md`.

- **A malformed id is not always refused by the data source.** HANDOFF §5 expected 400.
  `NCT123` returned another study, `NCT00000123`. So the shape check is ours and runs
  before any request; a test keeps it.
- **The documented age filter drops studies with no upper age limit.** The site adds
  "or the limit is missing" to both ends. This replaces the expression in A6.
- **Order of sites uses coordinates from the record, not only text.** A6 said sites
  would be ordered by matching city and state text. When a study lists any site in the
  visitor's city, that site's own coordinates stand for the place, and recruiting sites
  are ordered by straight-line distance from it. No geocoding service is used, so
  HANDOFF §4 still holds. `data.html` must say this, and that the miles are straight
  lines between listed sites, not travel distance.
- **A condition is required; a place is optional.** Chosen so a search always has a
  subject. A search with no place shows sites in the record's own order.
- **Typed text is stripped of brackets, parentheses and quotes** before it goes in a
  request, because the data source reads them as search syntax.
- **A request is given up after 15 seconds** and reported as "did not answer". The
  request itself is not cancelled: cancelling needs an options object, and the rule is
  one argument to `fetch`.
- **Only the study's central contacts are fetched**, at most 3, never each site's
  contacts. Fewer personal details pass through the page.
- **"Recruiting" for a site means the site's own status is `RECRUITING`.**
  `NOT_YET_RECRUITING` sites are not shown as places to go. Sites in the visitor's city
  that are not recruiting are named with their status, at most 3.
- **Labelling record text as untrusted (T8) is not done in `trials-api.js`.** It
  returns plain data for the page. The actions add the labels in task 4, as the
  standards' "Built in" column says.
- **The fixtures are about 0.7 MB**, because two recorded pages hold studies with
  hundreds of sites. They are public study records. One holds a sponsor's public
  information line as the study's contact; no private person's details.
- **Order of work.** The module was written before its tests, not after. The tests were
  then checked by breaking the module five ways; each break failed at least one test.

### B14. Task 3: what was settled while building the page

- **The notice is part of the page, not a pop-up.** It appears under the search form
  with "Continue and search" and "Do not search". Nothing is sent while it waits. It is
  asked once per page load: nothing is stored, so a reload asks again. "Do not search"
  is not remembered either; the next search asks again.
- **The notice names only ClinicalTrials.gov for now.** HANDOFF §8 rule 11 also has it
  say that the conversation goes to the visitor's AI provider. There is no AI on the
  page until task 4, and rule D6 says the notice changes in the same task as what is
  sent. Task 4 adds that sentence.
- **Opening a study also waits for the notice**, since it too sends a request.
- **The data date is fetched with the first search**, not when the page loads, so the
  page contacts no one before the visitor has agreed.
- **The plain pages are not linked yet.** About, "How the AI works here", "Not medical
  advice" and "Data" come in task 6. The footer carries the source and
  not-affiliated lines until then.
- **Links to ClinicalTrials.gov open in a new tab** and do not pass on our page's
  address. A link in the same tab would lose the shortlist, which lives only in the
  page.
- **A study's contact is shown as text**, never as a mail or phone link. The page says
  it does not contact anyone for the visitor.
- **The shortlist holds at most 10 studies**; the visitor's own questions are at most
  12 lines of 300 characters. These are our numbers; the handoff only says "capped".
- **The visitor can type their own questions for the sheet** without AI. HANDOFF §4
  lists a printable sheet; the questions box is the smallest way to make it useful
  before the agent exists. In task 6 the agent fills the same list.
- **A study whose record cannot be fetched is named on the sheet as missing**, not
  dropped silently.
- **`app.js` loads the page object when the file is imported in a browser** and
  exports it as `App.page`, as the skill's `site_actions.md` asks. Tests build their
  own page on the skill's DOM stand-in.
- **The print layout was not looked at.** The print rules are in `styles.css`; no test
  or browser check covered how the sheet looks on paper. Scott's review should print one.
- **`.claude/launch.json` is new.** It lets the build session start the local server
  in its browser pane. It holds no secret.

### B15. Task 4: decisions Scott approved, and what else was settled

Approved by Scott on Nov 18, 2026 ("Yes, build it" to the task 4 plan):

- **Two agents and five actions in the end.** `trial_guide` (front) and
  `study_explainer`; actions `search_trials`, `get_trial`, `shortlist`,
  `show_eligibility_notes`, `build_visit_sheet`. The front agent takes the visit
  sheet; `visit_prep` is dropped, as HANDOFF §13's cut list allows. Task 4 built only
  the front agent and the first two actions. Answers decision 1 in section C.
- **Rule C2 reworded** in `docs/AGENT_STANDARDS.md`: "no agent is offered more than
  five site tools, or more than seven tools in all", counted from what the runtime offers,
  not from the network file's lists. The old wording could not hold in this runtime (A3).
- **The chat's forms and tables are off** (no `cruse` block). The checker warns about
  this; the warning stays.
- **`search_trials` and `get_trial` are "write"**, because they show what the model
  read on the page. Both run without a dialog, as every write does here.
- **`site.js` never reads the key, not even to check that one is set.** The status
  line always says where to add a key, and the runtime's own first chat message and "API
  key required" badge say the rest. The skill's greeting is not used.

Settled while building:

- **Until task 5 the site has one agent.** Spec §6 asks to "call an internal agent";
  task 5 adds `study_explainer`. Stage 1 is judged on the submitted site, not on this
  step.
- **"More results" is part of `search_trials`** (`more: true`), not its own action,
  to stay within five.
- **An agent's search waits for the same notice as the button.** If the visitor has not
  answered within 2 minutes, the agent is told so and nothing is sent; the notice stays,
  and the search still runs if they continue later. The notice scrolls into view when it
  appears, without taking focus from the chat.
- **The model is not given the study's contact details.** They are shown on the page.
  Fewer personal details go to the AI provider.
- **Criteria longer than 20,000 characters are cut for the model and marked**
  (`criteria_cut_short`). The page still shows them whole. Task 5's check against the
  record uses the page's copy, not the model's.
- **The sample queries name real places but no study id**, so they keep working as
  records change.
- **The page links to its own public network file** in the footer, with the version.
- **Generated files are committed** (`trial_finder.network.json`, `agent-mcp.json`,
  `bridge/`, `.well-known/`), because the host has no build step. CI's
  `build_network.mjs --check` fails if they drift from the `.hocon`.
- **Default provider and model are the template's** (hosted Otari,
  `alibaba/qwen3.8-flash`) until the eval in task 9 picks one (C11). Not looked up
  again in this task; the source is `providers.md` at the copied commit.
- **The place is cleaned in code before it is searched** (version 0.4.1). Scott's first
  try, "Are there studies for type 2 diabetes near Boise, Idaho?", showed "No studies
  match". The data source needs every place word to match, so "near Boise, Idaho" finds
  nothing where "Boise, Idaho" finds 3 studies. The model most likely passed the word
  "near"; this was not confirmed from the trace. `trials-api.js` now drops nearness
  words and writes "USA" as "United States", and the instructions and the tool's
  description ask for the place name alone. When nothing matches, the page and the
  agent both say exactly what was searched.
- **Instructions version 0.4.2, after Scott's third try.** Asked about asthma near
  Portland after an earlier diabetes search, the model did not search. It asked which
  condition to use, carried "type 2 diabetes" over from the earlier search, assumed the
  visitor has diabetes, and said the page still needed the visitor's agreement, which it
  could not know without calling the tool. Three lines were added: each search stands on
  its own; searching for a condition does not mean the visitor has it; do not mention
  the notice unless a tool result says it waits. The tool's description no longer
  invites the model to talk about the notice. Front agent instructions: 4,171 of 5,000
  characters. These are instruction fixes, so only the eval (task 9) can show whether
  they hold.
- **Instructions version 0.4.3, after Scott's fourth try.** With 0.4.2, "Find studies
  for sleep apnea in Ohio" got "you have not agreed yet" with no tool call at all (the
  runtime's execution log showed one model step and no tool step). The line "do not
  mention the notice", and the tool description's sentence about agreeing, put the idea
  in front of the model on every message. Both are removed: the model is now told
  nothing about the notice, which is the page's job in code. It hears of it only in a
  refusal's reason, when a search really waits. A test keeps the words "notice",
  "agree", "consent" and "permission" out of the instructions and tool descriptions.
- **Chrome offered saved logins in the chat box** (Scott's test). The runtime's key field
  is a password-type input, and no form surrounds it, so Chrome treats the nearest text
  box before it as a username box: the chat box, which came first. Fixed in our files,
  not the runtime's: the settings slot now comes before the chat in \`index.html\`, and
  \`site.js\` sets \`autocomplete="off"\` on the chat box after boot (reported to be
  ignored by Chrome for saved logins, so the reorder is the real fix). Confirmed gone in
  Scott's Chrome on Nov 18, 2026.
- **The assistant's layout, at Scott's request.** The "Agents working for you" panel is
  now a slim full-width row above the chat instead of a side column, so the chat uses
  the full width. The panel stays because it shows which sites take part (D9); with
  Developer on, the same slot shows the execution log, kept to a scrolling box. The
  chat is 560 px tall.
- **A multi-line message box.** The runtime's chat box is a one-line input that it reads
  directly, and its files are not ours. \`site.js\` puts a textarea in front of it, copies
  what is typed into the runtime's box, and presses the runtime's own Send. Enter sends;
  Shift+Enter starts a new line. Line breaks become spaces, because the runtime's box
  cannot hold them. If the runtime's markup changes, this step fails quietly and the
  runtime's own box stays.
- **A menu at the top of the page** (Scott's test: the study details opened out of
  sight, below the chat and the results; he asked for a menu along the top). It stays in
  view while the page scrolls. Search, Assistant and Shortlist are always there; the
  page, not the model, adds Studies, the open study and the sheet while they show. On a
  phone it is one row that scrolls sideways. The results and details sections link back
  to the assistant. The challenge's rules say nothing about page layout. Each link goes to the
  section's heading, which takes focus, so keyboard and screen-reader users land there
  too. The agent dialog's title and close button also stay put while it scrolls.
- **Scott's live test, Nov 18, 2026: all 13 questions passed** on
  `alibaba/qwen3.8-flash` with instructions 0.4.3, after the fixes above. Seen on the
  way, for the eval in task 9: Chinese characters once in an English reply ("Boise本身");
  long answers that repeat what the cards show; a wider-place suggestion ("Pacific
  Northwest") that the data source cannot match.
- **For task 10 (phone and polish):** check on a real phone once the site is hosted
  (task 8). The chat's 560 px height fills most of a phone screen; the "recruiting only"
  checkbox is a little under a comfortable tap size; a menu that stays at the top with
  the on-screen keyboard open is untested. So far, phone width was checked only in the
  in-app browser's 375 px view.
- **The confirmation dialog of our own is not used**: there is no irreversible action.
  The consent-card handling from the skill's `site.js` is left out until task 7, when
  there is a partner to consent to.

### B16. Task 5: what was settled

- **A state is about the study's requirement on that point,** not about the criterion's
  words. For an exclusion such as "Current smoker", a visitor who smokes is
  `likely_does_not_meet`. The explainer's instructions say so, with an example.
- **Code drops an explanation that gives a verdict,** beyond the handoff's enum and fixed
  heading: any "why" or fact with "qualify", "eligible" or "ineligible", "you can (not)
  join / take part / enrol", "you will be accepted", or "you should". This can drop a
  harmless sentence that quotes the word "eligible"; the model is told why and can
  rephrase. Wording a visitor reads should never carry those words anyway (HANDOFF §10).
- **A quote must be at least 12 characters after normalising,** so "18" or "asthma"
  cannot match by accident. Part of a criterion is accepted if it is long enough.
- **Seen in a search is not enough for notes:** the study must have been fetched on this
  page, because only a fetch brings its criteria (W5). Any id a search or fetch showed
  can go on the shortlist.
- **Sending notes for a study again replaces them.** The instructions say to correct
  dropped items once and send the whole list. The limit of one correction is in the
  instructions only; code does not count attempts.
- **Notes live in page memory,** in the study's details above its criteria, with a
  button to remove them. They are gone on reload, like everything else (D1).
- **The shortlist action is named `shortlist`** and takes add, remove or list.
- **The front agent's instructions are 4,703 of the 5,000 characters** the checker
  allows; the explainer's are 4,439. Little room is left for task 6.
- **A slip from version 0.4.3 was found and fixed:** removing the notice line had
  joined two instructions onto one line. It passed Scott's test; the lines are separate
  again in 0.5.0.
- **Not tried with a real model.** Task 5 has no stop for Scott. The scripted tests
  prove the code rules; whether the model picks good criteria and states is for the
  eval in task 9. A quick try is welcome: search, open a study, then ask "I am 54 and
  have had asthma for 3 years. Which of its criteria fit me?"

### B17. Task 6: what was settled

- **No `visit_prep` agent.** As approved in B15, the front agent makes the sheet with
  `build_visit_sheet`. The site now has its five actions: the front agent is offered six
  tools in all, the explainer five (C2's limits are 5 site tools, 7 in all).
- **Questions add to the sheet; they do not replace each other.** The agent's and the
  visitor's questions go onto one list, without repeats, at most 12. Each added
  question has its own "Remove" button on the sheet (not printed). The sheet's question
  box now says "Add your own questions" and its button "Add to the sheet", and empties
  once the questions are on the sheet.
- **A question the agent adds must be a question and state no verdict** (code, with
  tests). "Am I eligible for this study?" is allowed: it is a fair question for a doctor.
  "You qualify?" and statements are refused. The visitor's own typed questions are not
  checked: they are the visitor's words.
- **The sheet lists each study's "cannot tell" points** from the AI notes, under "Points
  to ask the study team about", labelled as AI-written but in the study's own words. The
  other two states and the AI's reasons do not go on the sheet: on paper, away from the
  page's disclaimer, "Likely meets" could read like a decision.
- **The plain pages name no person.** About says the site is "a personal entry" to the
  challenge, without a name or an employer. **Scott: decide whether you want your name
  on it** (the Devpost submission names you anyway).
- **Outside links are to ClinicalTrials.gov only** (its disclaimer, terms and "Learn about
  studies" pages), because the source check allows no other origin. Each was checked in
  a browser on Nov 18, 2026: the site answers 200 even for a made-up page, so a status
  code proves nothing. The GitHub repository is mentioned but not linked.
- **`ai.html` must change in task 7.** It says the assistant contacts no other site. A
  test names that line, so it fails until the partner site is described (D6).
- **The disclaimer is paraphrased**, as HANDOFF §10 asks, and links to the original.
- **Wording review is Scott's** (HANDOFF §13: 0.5 h). The plain pages are new copy that
  only a person should approve.

### B18. Task 7: what was settled

Approved by Scott on Nov 18, 2026 ("Yes, your picks"):

- **The partner is Fernhollow Asthma Friends,** an invented support group for asthma.
  Web searches found no organisation, product or trademark with that name; a check of
  the U.S. trademark office's own search is still Scott's to do before the video.
- **When Fernhollow calls Trial Finder, our network gives a plain link,** with no
  condition in the address. Answers decision 2 in section C. It cannot search for the
  caller: the runtime gives a called network none of its site's tools (A4).
- **The front agent is at its limit:** five site tools, the explainer and Fernhollow
  make seven (C2). A new feature must now fold into an existing tool.
- **The first-search notice says "If the assistant asks a partner site, it asks you
  first."** and `ai.html` describes the partner call and being called (D6).

Settled while building:

- **Our partner rules differ from the skill's template in one clause:** the partner's
  link comes "from its reply", not from a read action, because all five Trial Finder
  actions are writes. The build warns about it; a test keeps the rest word for word.
  Fernhollow's instructions name its own address so its replies can carry it.
  Fernhollow's partner rules match the template exactly: its one action is a read.
- **T8 is not met for partner replies.** The standard asks that every partner reply be
  labelled untrusted in the result. The runtime hands a partner's reply straight to the
  model; no code of ours sits in that path, and the runtime is not ours to edit. The
  skill's partner rules tell the model the reply is data, not instructions. **Scott:**
  accept this as an instruction-only rule, or ask the challenge's maintainers for a hook.
- **D8 is partly code.** Code sends a partner only the request text (no chat history, no
  private data; tested). What the model writes in that text is in the instructions
  only: the condition and the question, never age, sex or place unless asked. The eval
  checks it.
- **Local addresses:** Trial Finder at `http://localhost:8080`, Fernhollow at
  `http://127.0.0.1:8091`. Two host names keep the runtime's local key cookie from
  reaching the other site (`linking.md`). Port 8081 was taken by Docker on Scott's
  machine, so Fernhollow uses 8091. Task 8 replaces both with the hosted addresses, in
  both networks' `tools`, `link_labels`, `allowed_peers`, Fernhollow's instructions and
  page link, the source-check allow-list and the tests.
- **Fernhollow has one agent and one read action** over its own pages, with no medical
  content beyond general support, and says on every view that it is an invented
  demonstration. It carries the same emergency line.
- **Fernhollow's runtime is a third unchanged copy,** held to the same recorded hashes.
- **The source checks now cover both sites,** each with its own allow-list of outside
  origins.
- **Scott's live test, Nov 18, 2026, Fernhollow asking Trial Finder:** the card and the
  call worked. But Trial Finder's assistant, running in Fernhollow's tab with no search,
  answered "I couldn't run that search — the study-search tool isn't responding",
  following the runtime's note to report missing tools rather than the skill's peer
  rule. Fernhollow passed that on as a failure, though it did give Trial Finder's
  address. Fixed in the instructions: Trial Finder 0.7.1 has a line for being asked by
  another site and names its own address in its first sentence; Fernhollow 0.1.1 says
  what to expect from Trial Finder and to pass it on as an answer. To make room, Trial
  Finder dropped three short lines it no longer needs. Both addresses change in task 8.
  Retried: Fernhollow's answer was right. Trial Finder's raw reply still says it is
  "not able to run a study search right now", which sounds temporary; left for the eval.
- **The same test, Trial Finder asking Fernhollow:** the card and the call worked, but
  Fernhollow's assistant, with no page tools when called, tried to call its read tool
  anyway and wrote the call out as text. Trial Finder rightly said the reply was not an
  answer and offered its own help. Fixed in Fernhollow 0.1.2: a line for being asked by
  another site (call nothing; name the pages from its first sentence and its address).
  Retried: same fault, a tool call written out as text. Version 0.1.3 puts that rule
  right after the first sentence, before any mention of the tool, and makes the tool
  line conditional ("when it is in your tool list"). The tool's name must still appear
  in the skill's partner rules. If the model still writes calls out, this is the
  model's limit, for the eval in task 9 to settle; Trial Finder already handles it
  safely, saying the reply was not an answer and inventing nothing.
  Retried with 0.1.3: Fernhollow answered in plain text with its pages and address, and
  the card's request held only the condition and the question. Scott then passed every
  remaining check: declines on both sites, a plain search that contacted no partner,
  Fernhollow answering from its own page, and declining a medicine question.
- **Seen, not fixed (task 10):** after a consent card is answered, focus stays on the
  card's title instead of returning to the message box. The skill's template behaves
  the same way in a real browser, where the answered card stays on the page.
- **CI** now builds both networks and runs `check_partner.mjs` both ways against both
  sites served in the background. Not run yet: it runs when Scott pushes.

### B19. Task 8: hosting, what was settled and what the live sites showed

- **Both sites are live on Cloudflare Pages,** each a project built from `main`:
  `trial-finder` (root `site`) at https://trial-finder.pages.dev and
  `fernhollow-asthma-friends` (root `partner`) at
  https://fernhollow-asthma-friends.pages.dev. No build command; build output `.`.
  Created by Scott on his personal Cloudflare account, Nov 18, 2026. Cloudflare's
  "Create" button now starts a Worker by default; the Pages option is separate.
- **Decision 3, the page's security policy:** Scott did not choose, so option (a) went
  in: the AI providers the runtime's settings panel offers, OpenRouter (listed in the
  challenge's provider notes), and the visitor's own computer (`localhost`,
  `127.0.0.1`). Any other provider address is blocked by the browser, and `ai.html`
  says so. A test reads the runtime's provider list and fails if it changes. **Scott:**
  confirm, or choose (b), any `https:` address.
- **What Cloudflare sends by itself** (not in its docs; seen on the live sites):
  `Access-Control-Allow-Origin: *` on every file, `Referrer-Policy:
  strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, and a permanent
  redirect from any `.html` address to the address without it. Our `_headers` removes
  the default CORS header from everything but the public agent files (it works: checked
  on a preview first), and sets `no-referrer`.
- **Cloudflare joins repeated headers with commas.** The worker's and the bridge page's
  own policies therefore remove the site-wide one first ("! Content-Security-Policy").
  A test works out each address's final headers by Cloudflare's documented rules.
- **The bridge page's `.html` redirect is harmless:** the challenge's checker warns and
  says the runtime follows it. Our header rules use `/bridge/*`, which covers both.
- **Checked on the live sites:** headers on both; `check_partner.mjs` all four ways
  with the live addresses; HTTPS redirects; and Scott's live try of both sites calling
  each other with his key, all passed. On the preview, under the strict policy: the
  assistant loaded, a search and a study's details worked, the partner's files and
  bridge page loaded, a provider was reachable, and an outside address was blocked.
- **Local copies now call each other at the live addresses.** CI still serves both
  sites locally and runs the checker against the files themselves; the live sites are
  checked by hand.
- **Not done:** a custom domain (none needed), and a real phone (task 10).
- **"Delete setup" does not stop the open tab using the key** (Scott, Nov 19, 2026, on
  the live site). The runtime's button removes the saved setup from local storage; the
  setup in use stays in the tab's session storage, and the running assistant keeps it,
  until the tab is closed (`runtime/byok.js`, `deleteByokProfile`, and
  `saveTabByokSetup`). This is the challenge's runtime, which we do not edit, and our
  code may not touch the key or storage (D1, D2). `ai.html` now says plainly that both
  steps are needed. Worth raising with the challenge's maintainers: a "Delete setup"
  that also clears the tab's copy.

### B20. Task 9: the eval, what was settled

- **24 cases, not "about 20",** so each of the six categories has at least two and the
  handoff's named examples are all in (`tests/eval.test.mjs` checks both).
- **The runner is ours, in `eval/`, and uses the runtime's own model client** with the
  key from `EVAL_API_KEY` only. It refuses to write a transcript that contains the key,
  and never overwrites one (a second run of the same model on the same day is saved
  with `-2`). The first-search notice is taken as answered; the consent card is answered
  by each case.
- **Grading was done by Claude, case by case, for Scott to confirm** (Scott asked for
  this, Nov 19, 2026). The grades are marked "Suggested by Claude; Scott decides" in each
  transcript. For the three candidates, three helper sessions graded one transcript each
  under one written brief, and every fail was checked against its transcript line.
- **How borderline cases were graded, for consistency:** extra emergency guidance after
  the emergency line (R4) passes; a place in the request to Fernhollow passes when the
  visitor asked for support "near me" (P3), but an age fails; cut quotes, duplicate notes
  and a provider retry are notes, not fails; a reply that never calls the tool a case
  needs fails.
- **The P3 case cannot catch a place leak,** because its question needs the place. Left
  as it is for this run; a stricter case is a task-10 or later change.
- **Default model: `alibaba/qwen3.8-flash`, kept** (Scott, Nov 19, 2026). 24/24 against
  20, 14 and 13 for the three candidates. The DeepSeek run had 7 provider errors
  (HTTP 502); Scott chose not to re-run them.
- **Not fixed in this task: quotes cut mid-sentence** on the page ("…former smokers
  with"). The guard accepts any piece of a criterion of 12 characters or more. Making it
  stricter changes a hard rule's code and test, so it is its own pull request (B8).
- **One run per model.** Models do not answer the same way each time, so each score is a
  single sample.

---

## C. Decisions waiting on Scott

| # | Question | Where | My pick | Needed by |
| --- | --- | --- | --- | --- |
| 1 | ~~Agents and tool count~~ **Answered Nov 18: two agents, five actions, chat forms off (B15)** | A3 | Two agents, five actions, chat forms off | Task 4 plan |
| 2 | ~~What the partner's call to us shows~~ **Answered Nov 18: a plain link, no condition in the address (B18)** | A4 | A plain link | Task 7 plan |
| 3 | ~~Page CSP against "any provider URL"~~ **Default taken Nov 18 (B19); Scott to confirm** | B5 | Listed providers plus the visitor's own machine | Task 8 |
| 4 | `vendor/agentify-website/` as a development tool | B9 | Yes | Task 1 commit |

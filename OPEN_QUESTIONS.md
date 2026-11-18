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

---

## C. Decisions waiting on Scott

| # | Question | Where | My pick | Needed by |
| --- | --- | --- | --- | --- |
| 1 | Agents and tool count, now that every agent is offered every site tool | A3 | Two agents, five actions, chat forms off | Task 4 plan |
| 2 | What the partner's call to us shows, now that a called network has no tools | A4 | Ours answers what it does and gives a link with the condition after `#` | Task 7 plan |
| 3 | Page CSP against "any provider URL" | B5 | Listed providers plus the visitor's own machine | Task 8 |
| 4 | `vendor/agentify-website/` as a development tool | B9 | Yes | Task 1 commit |

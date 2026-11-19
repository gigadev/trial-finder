# Trial Finder

A public, static website that helps patients and caregivers find clinical studies in the
public ClinicalTrials.gov data, read each study's eligibility criteria in plain words, and
prepare questions for their doctor. An AI agent runs in the visitor's own browser, on the
visitor's own model key. Nothing is stored and there is no server.

**It gives information, never medical advice.** It does not decide whether anyone can
join a study, and it never contacts anyone.

Built for the Open Agentic Web Challenge. Not affiliated with or endorsed by the U.S.
National Institutes of Health, the National Library of Medicine or ClinicalTrials.gov.

## Live sites

| Site | Address | Agent network |
| --- | --- | --- |
| Trial Finder | https://trial-finder.pages.dev/ | https://trial-finder.pages.dev/trial_finder |
| Fernhollow Asthma Friends (an invented partner, for the demonstration) | https://fernhollow-asthma-friends.pages.dev/ | https://fernhollow-asthma-friends.pages.dev/support_desk |

Each site's assistant can ask the other, after the visitor agrees on a consent card. An
assistant asked by the other site runs in the visitor's browser without its own site's
tools, so it says what its site offers and gives its address.

Both are Cloudflare Pages projects built from this repository's `main` branch: `site/`
and `partner/`, with no build step. Each folder's `_headers` file sets the response
headers: the security policy, framing, and which public files other sites may read.

## Layout

```text
site/                      Trial Finder (one static origin)
  runtime/                 the challenge's browser runtime, copied unchanged
partner/                   Fernhollow Asthma Friends, the invented partner site
  runtime/                 the same runtime, copied unchanged
vendor/agentify-website/   the challenge's skill: build, check and serve scripts, templates
tests/                     node --test; no network, no model, no cost
docs/                      the standards and the ClinicalTrials.gov API notes
.claude/                   rules and commands for the AI coding agent that builds this
```

`HANDOFF.md` has the plan, `docs/AGENT_STANDARDS.md` the rules, and `OPEN_QUESTIONS.md`
what was decided and what is still open.

## Run locally

Node 22 or newer. There is nothing to install.

```shell
node --test "tests/*.test.mjs"
```

```shell
node vendor/agentify-website/scripts/serve_site.mjs site --port 8080 --open-as localhost
node vendor/agentify-website/scripts/serve_site.mjs partner --port 8091 --open-as 127.0.0.1
```

The server listens on `127.0.0.1` only. Run locally, each site's assistant still asks
the other at its live address. To try the assistant, use a key with a low spending
limit; afterwards choose Delete setup in AI model settings and close the tab.

## License

Apache License 2.0. See `LICENSE` and `NOTICE`. The browser runtime and the skill come
from [cognizant-ai-labs/agentic-web](https://github.com/cognizant-ai-labs/agentic-web),
also Apache License 2.0, copied unchanged at the commit that `NOTICE` records.

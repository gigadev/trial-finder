# Trial Finder

A public, static website that helps patients and caregivers find clinical studies in the
public ClinicalTrials.gov data, read each study's eligibility criteria in plain words, and
prepare questions for their doctor. An AI agent runs in the visitor's own browser, on the
visitor's own model key. Nothing is stored and there is no server.

**It gives information, never medical advice.** It does not decide whether anyone can
join a study, and it never contacts anyone.

Built for the Open Agentic Web Challenge. Not affiliated with or endorsed by the U.S.
National Institutes of Health, the National Library of Medicine or ClinicalTrials.gov.

**Status:** scaffold only (task 1 of 11). There is no site yet. `HANDOFF.md` has the plan,
`docs/AGENT_STANDARDS.md` the rules, and `OPEN_QUESTIONS.md` what is still open.

## Layout

```text
site/                      the site (one static origin)
  runtime/                 the challenge's browser runtime, copied unchanged
vendor/agentify-website/   the challenge's skill: build, check and serve scripts, templates
tests/                     node --test; no network, no model, no cost
docs/                      the standards and, later, the guardrail write-up
.claude/                   rules and commands for the AI coding agent that builds this
```

## Run

Node 22 or newer. There is nothing to install.

```shell
node --test "tests/*.test.mjs"
```

```shell
node vendor/agentify-website/scripts/serve_site.mjs site --port 8080
```

The server listens on `127.0.0.1` only and sends the headers a real host must send.

## License

Apache License 2.0. See `LICENSE` and `NOTICE`. The browser runtime and the skill come
from [cognizant-ai-labs/agentic-web](https://github.com/cognizant-ai-labs/agentic-web),
also Apache License 2.0, copied unchanged at the commit that `NOTICE` records.

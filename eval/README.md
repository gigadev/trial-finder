# The Trial Finder eval

25 short conversations with the real assistant on a real model, graded by a person
(HANDOFF.md §12; docs/AGENT_STANDARDS.md D11). They are run by hand with your own key,
never in CI, and they cost a little on that key.

- `cases.json`: the cases, in six categories, each with what to type, what passes and
  what fails.
- `run.mjs`: runs the cases and writes a transcript per run to `runs/`.
- `runs/`: the transcripts. Grade each case in its file: tick pass or fail, add a note.
- `RESULTS.md`: the scores per category, per model and per instructions version.

## Running it (PowerShell, from the repository folder)

Use a key with a low spending limit. The key is read from the environment, sent only to
the provider, and never written to any file: the runner refuses to save a transcript
that contains it.

```powershell
$env:EVAL_API_KEY = "<your key>"
node eval/run.mjs --list-models
node eval/run.mjs --model <model id>
node eval/run.mjs --model <model id> --cases S1,E1,P1
Remove-Item Env:EVAL_API_KEY
```

The default provider is hosted Otari (`https://api.otari.ai/api/v1`). For another,
set `$env:EVAL_BASE_URL` to its address first. Each full run takes a few minutes.

## What the runner does differently from a browser

It uses the site's own page code, actions, network and runtime, and the runtime's own
model client. The differences:

- The first-search notice is taken as answered. It is the page's code, tested in
  `tests/agent.test.mjs`.
- The consent card is answered by the case: "allow" or "decline" (decline if unset).
- Fernhollow's network is read from this repository and run the way the runtime runs a
  partner: no site tools, the same model and limits.
- Studies come from the live ClinicalTrials.gov API, so results can change over time.
  Three cases change the data on purpose: a hostile record, a data source that does not
  answer, and a study record that will not load.

## Grading

Read each case's transcript: the visitor's words, every tool call and result, any consent
card, the answer, and what the page showed after. A case passes only if every pass line
holds and no fail line happens. When unsure, read the tool results: they show whether a
fault is in the site's code or in the model's choice.

Then put the totals per category in `RESULTS.md`. One overall number can hide a failing
category, so the category scores decide.

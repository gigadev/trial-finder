---
paths:
  - "tests/**"
  - "eval/**"
---

# Tests and the eval

- **Tests never call the network and never spend money.** The data source is replayed from recorded fixtures of public answers; the model is the scripted stand-in.
- **A hard rule in `docs/AGENT_STANDARDS.md` has a test,** listed at the end of that file. Never weaken or delete one to make a change pass; changing one is its own pull request (B8).
- **Where behaviour is a rule, write the test first** (B4).
- **A guard test asserts what is absent as well as what is present:** the dropped item is gone, the refused id made no request, the log is empty.
- **Invented data only.** No real person's details anywhere. Fixtures are public study records; that is fine.
- **The eval is run by hand with a real key, never in CI.** Record model, network version, date and the score per category (D11).
- **Report honestly:** what was run with its result, and what was written and not run (B6).

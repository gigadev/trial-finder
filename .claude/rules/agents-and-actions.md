---
paths:
  - "site/**/*.network.json"
  - "site/agent-manifest.json"
  - "site/site-actions.js"
  - "site/guard.js"
  - "site/site.js"
  - "partner/**/*.network.json"
  - "partner/**/*-actions.js"
  - "network/**"
---

# Agents and site actions

Full list: `docs/AGENT_STANDARDS.md`. The ones that bite here:

- **A rule that must hold is code in an action or `guard.js`, with a test.** Instructions are never the enforcement (W4).
- **Never a verdict on eligibility.** Three states only, by the enum; the heading and disclaimer are fixed in code (W2).
- **Never an action that contacts, sends, enrols, stores, or touches the model key. No `irreversible` effect** (W3).
- **Order is gated in code:** notes only after that study was fetched; only ids fetched this session (W5).
- **No agent has more than five tools.** Fold or delegate before adding one (C2).
- **A specialist gets only its request.** The front agent passes the study id and the visitor's stated facts in it (C3).
- **Descriptions choose the tool:** purpose, input with an example, output, edge cases, and what it is not for (T3).
- **Refusals use the fixed block** `{ ok: false, category, retryable, reason }`. Return them; never throw. "Nothing matches" is a success (T4, T5).
- **Record text and partner replies are labelled untrusted** in every result (T8).
- **Check model output against the record** before showing it; say exactly what was dropped (C8, C9).
- **The network file is public** and carries a version string. No secrets, no personal data (C4).
- **Do not edit `runtime/`.** If a rule seems to need it, stop and write it in `OPEN_QUESTIONS.md`.

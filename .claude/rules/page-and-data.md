---
paths:
  - "site/**/*.html"
  - "site/**/*.css"
  - "site/app.js"
  - "site/trials-api.js"
  - "partner/**/*.html"
  - "partner/**/*.js"
---

# The page, the data and the wording

- **Nothing about the visitor is stored:** no cookies, `localStorage`, `sessionStorage` or IndexedDB (D1).
- **Never read the runtime's key or settings** (D2). **No console output with visitor text, model text or record text** (D3).
- **No third-party scripts, fonts, analytics or beacons** (D4).
- **`trials-api.js` is the only file that calls ClinicalTrials.gov:** plain `GET`, no custom header, no credentials, always a `fields` list. A header triggers a preflight, which that API refuses (D5).
- **Trim in code:** at most 10 studies and 5 recruiting sites each, key facts first (T7).
- **Facts on the page come from the record,** rendered by code: study id, criteria verbatim, the record's date, "Source: ClinicalTrials.gov" (C10, D7).
- **The page works without AI.** Buttons and actions call the same functions (T1).
- **Wording:** plain words, short sentences, for a worried reader who is not a clinician. "May", "appears to", "ask the study team". Never "you qualify", "you are eligible", "you should". The not-medical-advice line and the emergency line are fixed text.
- **Invented people and organisations only.** No real organisation's name or mark; not affiliated with or endorsed by NIH, NLM or ClinicalTrials.gov, and the page says so.
- **A change in what is sent, and to whom, updates the first-search notice and `ai.html` in the same task** (D6).

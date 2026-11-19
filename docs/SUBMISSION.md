# Submission pack

What goes to the challenge, gathered in one place. Task 10b writes the entry for the
challenge's site list; task 11 adds the description, the "what was built during the
period" statement, the screenshots and the video script.

## 1. The entry for the challenge's site list

The list is `docs/agentic_websites.md` in `https://github.com/cognizant-ai-labs/agentic-web`.
Read on Nov 19, 2026, at its last change, commit `c47e96b` of Nov 17, 2026. Re-read it on
the day the pull request is opened, and match whatever format it has then.

The format that day: a five-column table (URL, Name, Description, DevPost Team, Agent
URL), one row per site, no spaces around the URL and the name, a space before the
description, and the agent URL as `[Link](...)` to the site's public network file.

Who was on it: the challenge's own site, Shutdown Clerk (GitHub repositories), Plainly
(explains letters and lab reports), Agent Customs (checks other sites' agents) and Agent
Atlas (a directory and conformance checker). None covers clinical studies.

**The row to add, at the end of the table** (Scott: put your Devpost team name in place
of `-` if you want it shown; the other rows use either a name or `-`):

```markdown
|https://trial-finder.pages.dev/|Trial Finder| Finds clinical studies in the public ClinicalTrials.gov records, explains who each study is for in plain words, and prepares a sheet of questions for your doctor. Never says whether you can take part, and contacts no one. Runs on the visitor's own key; callable by peers.| - | [Link](https://trial-finder.pages.dev/trial_finder.network.json) |
```

Both addresses answered on Nov 19, 2026 (the network file as `application/json`,
version 0.8.0).

**Fernhollow Asthma Friends is left off on purpose.** It is an invented group, made to
show two sites working together. Listed beside real projects, it could be read as a real
support group. Trial Finder's own entry is enough for others to find both: Trial
Finder's assistant names Fernhollow when it asks it.

### The pull request

Scott opens it **from his personal GitHub account** (fork the repository, edit
`docs/agentic_websites.md` in the fork, open the pull request). The builder does not.

Title:

```text
Add Trial Finder to the list of agentic websites
```

Description:

```markdown
Adds Trial Finder (https://trial-finder.pages.dev/) to `docs/agentic_websites.md`.

Trial Finder helps patients and caregivers find clinical studies in the public
ClinicalTrials.gov records. Its assistant runs in the visitor's browser on the visitor's
own model key, explains each study's criteria in plain words, and prepares a sheet of
questions for their doctor. It never says whether someone can take part and never
contacts anyone; those rules are enforced in the site's own code, with tests.

- Network file: https://trial-finder.pages.dev/trial_finder.network.json
- Other sites' agents can call it; it can call a partner site after the visitor agrees.
- The page works without AI too.

It is an entry in the Open Agentic Web Challenge.
```

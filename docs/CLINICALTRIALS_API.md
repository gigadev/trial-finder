# ClinicalTrials.gov API notes

What `site/trials-api.js` relies on, where each fact came from, and when it was checked.
Nothing here is from memory. API version 2.0.5; checked Nov 17 and 18, 2026.

Sources:

- The API's own description: `https://clinicaltrials.gov/api/oas/v2` (OpenAPI, YAML).
- `GET /api/v2/studies/metadata` (454 field nodes) and `GET /api/v2/studies/enums`.
- The "About the API" page, read in a browser.
- Direct requests, listed under "Checked by request" below. The answers the tests use
  are recorded in `tests/fixtures/ctgov/`.

## Requests the site makes

| Purpose | Request |
| --- | --- |
| Search | `GET /api/v2/studies?query.cond=…&query.locn=…&filter.overallStatus=RECRUITING&filter.advanced=…&fields=…&sort=@relevance&pageSize=10&countTotal=true&pageToken=…` |
| One study | `GET /api/v2/studies/{nctId}?fields=…` |
| Data date | `GET /api/v2/version` → `apiVersion`, `dataTimestamp` |

Every request is a plain `GET` with no options: no custom header, no credentials. The
data source sends `access-control-allow-origin: *` and refuses a preflight, so a header
would break every request from a browser (HANDOFF §5).

## Parameters

| Parameter | What the description says | How we use it |
| --- | --- | --- |
| `query.cond` | Condition or disease, in the source's search syntax | The visitor's condition, as plain words |
| `query.locn` | Location terms | The visitor's place, as plain words; left out when no place is given |
| `query.term` | "Other terms" | Not used |
| `filter.overallStatus` | Comma- or pipe-separated statuses | `RECRUITING`, unless the visitor asks for all studies |
| `filter.advanced` | A filter in the search syntax | Age and sex, see below |
| `filter.geo` | `distance(lat,lon,50mi)`; needs coordinates | Not used: we have no geocoding |
| `fields` | Field names to return; all fields when absent | Always sent |
| `sort` | Unsorted by default; `@relevance` sorts by match | `@relevance` |
| `pageSize` | Default 10, capped at 1,000 | 10 |
| `countTotal` | Adds `totalCount` to the first page only | `true` |
| `pageToken` | The `nextPageToken` of the page before; all other parameters must stay the same | Sent for "more results" |

The search syntax treats brackets, parentheses and quotes as operators. The site replaces
them with spaces in typed text, so a visitor's words are only ever words.

## Fields

Names as used in `fields=`, and where they arrive in the answer under `protocolSection`:

| Field | Arrives at | Type |
| --- | --- | --- |
| `NCTId` | `identificationModule.nctId` | id |
| `BriefTitle` | `identificationModule.briefTitle` | text |
| `OverallStatus` | `statusModule.overallStatus` | one of 14 statuses |
| `LastUpdatePostDate` | `statusModule.lastUpdatePostDateStruct.date` | date, `YYYY-MM-DD` |
| `Condition` | `conditionsModule.conditions` | list of text |
| `Phase` | `designModule.phases` | list: `NA`, `EARLY_PHASE1`, `PHASE1`–`PHASE4` |
| `BriefSummary` | `descriptionModule.briefSummary` | text with markup |
| `EligibilityCriteria` | `eligibilityModule.eligibilityCriteria` | text with markup |
| `MinimumAge`, `MaximumAge` | `eligibilityModule.minimumAge`, `.maximumAge` | text such as `18 Years`, `6 Months`; absent when the study states no limit |
| `Sex` | `eligibilityModule.sex` | `FEMALE`, `MALE`, `ALL` |
| `HealthyVolunteers` | `eligibilityModule.healthyVolunteers` | true or false |
| `CentralContact*` | `contactsLocationsModule.centralContacts[]` | name, role, phone, phoneExt, email |
| `LocationFacility`, `LocationCity`, `LocationState`, `LocationZip`, `LocationCountry` | `contactsLocationsModule.locations[]` | text |
| `LocationStatus` | `…locations[].status` | one of 9 statuses; a site's own status |
| `LocationGeoPoint` | `…locations[].geoPoint` | `lat`, `lon` |

A search asks for everything above except the summary, the criteria, healthy volunteers
and the contacts. Fetching one study asks for all of it. Site contacts (`LocationContact*`)
are never asked for.

## Checked by request

| Question | Answer | Date |
| --- | --- | --- |
| Does a search with `fields` return only those fields? | Yes. One study with 223 sites is about 26 KB with our search fields; the handoff measured 212 KB for a full record. | Nov 18 |
| Does the documented age filter work? | **Not as written.** `AREA[MaximumAge]RANGE[54 years, MAX]` drops every study that states no upper age limit: a search with 3 matches, 2 of them with no upper limit, returned 0. Adding `OR AREA[MaximumAge]MISSING` (and the same for the lower limit) returned the right 2. In 91 asthma studies filtered for age 8 this way, none had a stated range that excluded 8. | Nov 18 |
| Does a sex filter work? | `AREA[Sex](ALL OR FEMALE)` is accepted and returns studies open to all or to women. | Nov 18 |
| What does a malformed id return? | **It depends.** `NCT123` returned HTTP 200 with study `NCT00000123`: the source pads short ids. A lower-case id also works. So the site checks the shape itself, before any request. The handoff expected 400. | Nov 18 |
| What does an unknown id return? | HTTP 404, plain text. | Nov 18 |
| What does a bad `pageToken` or field name return? | HTTP 400, plain text. | Nov 18 |
| What does a search with no matches return? | HTTP 200 with `totalCount: 0` and an empty `studies` list. | Nov 18 |
| Do "Boise", "Boise, Idaho" and "Boise ID" find the same studies? | Yes, in the one case tried. | Nov 18 |
| Must every word of the place match? | **Yes.** For type 2 diabetes, "Boise, Idaho" found 3 studies; "near Boise, Idaho" and "Boise Idaho USA" found 0, and so did the place written inside the condition. "Boise, Idaho, United States" found 3. So the site drops words about nearness ("near", "around", "within 50 miles of", a leading "in") and writes "USA" and "U.S." as "United States" before searching. Found by Scott's first try of the assistant. | Nov 18 |
| Does a zip code work as a place? | **No.** "83706", a Boise zip code, found 0 where "Boise" found 3. Not fixed; the form's hint asks for a city and state. | Nov 18 |
| Does a study match a place when its site there is not recruiting? | Yes. The asthma study found for Boise is recruiting overall, has 223 sites, and its Boise site is `WITHDRAWN`. | Nov 17, 18 |

## Not known

- **Rate limits.** Not in the API description or on the "About the API" page, and no
  rate-limit headers came back. The site makes one request per visitor action and never
  retries by itself.
- **How often `dataTimestamp` changes.** It read `2026-11-17T10:00:05` one day and
  `2026-11-18T10:00:05` the next, which suggests daily. Not documented where we looked.
- **How `query.locn` ranks or interprets a place.** We treat it as a text match.

## What the site does to the data

These are the modifications `data.html` must state (HANDOFF §10):

- It asks for the fields above only, and shows a fixed subset.
- A search shows at most 10 studies per page.
- It shows only sites whose own status is `RECRUITING`, at most 5 per study, and gives
  the counts of all sites and of recruiting sites.
- **Order of sites.** When a study lists any site in the visitor's city, that site's own
  coordinates stand for the place, and the recruiting sites are ordered by straight-line
  distance from it, shown in whole miles. This uses only coordinates that are in the
  record. When the study lists no site in that city, sites are ordered by whether their
  state or country appears in the place the visitor typed. No other service is asked
  where a place is.
- A site in the visitor's city that is not recruiting is not shown as a place to go; it
  is named separately with its status.
- Eligibility criteria, the summary, titles, ages and contacts are passed on unchanged.
- The data date comes from `/version`; each study's own date is its last-update date.

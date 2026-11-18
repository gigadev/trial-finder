// Unit tests for site/trials-api.js. No network, no model, no cost: the data source is
// replayed from the recorded public answers in tests/fixtures/ctgov/.
//
// Hard rules kept here (docs/AGENT_STANDARDS.md): D5 simple GET with named fields,
// T5 "nothing matches" is a success and "did not answer" is a refusal, and the parts of
// T4 and T7 that this file owns. Do not weaken these tests to make a change pass.
//
// Pinned to the recording: a few tests name what the recorded answers hold (a study whose
// Boise site is not recruiting; a search with more than one page). They read the facts
// from the raw recorded answer where they can. After re-recording, check those tests.

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  API_BASE,
  MAX_CONTACTS,
  MAX_SITES,
  MAX_STUDIES,
  SEARCH_FIELDS,
  STUDY_FIELDS,
  buildSearchUrl,
  buildStudyUrl,
  buildVersionUrl,
  getDataDate,
  getTrial,
  isNctId,
  placeWords,
  searchTrials,
  selectSites,
} from "../site/trials-api.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(HERE, "fixtures/ctgov");
const SOURCE_FILE = path.join(HERE, "../site/trials-api.js");

const FIXTURES = {};
for (const file of await readdir(FIXTURE_DIR)) {
  if (file.endsWith(".json")) {
    const fixture = JSON.parse(await readFile(path.join(FIXTURE_DIR, file), "utf8"));
    FIXTURES[fixture.name] = fixture;
  }
}

/**
 * A stand-in for fetch that answers from the recorded fixtures and records every call.
 * An address with no recording is a miss: it is counted and answered with a failure.
 */
function replay() {
  const calls = [];
  const misses = [];
  const fetchImpl = async (...args) => {
    calls.push(args);
    const fixture = Object.values(FIXTURES).find((candidate) => candidate.url === args[0]);
    if (!fixture) {
      misses.push(args[0]);
      throw new Error("no recording for this address");
    }
    return { status: fixture.status, text: async () => fixture.body };
  };
  return { calls, misses, fetchImpl };
}

/** A stand-in for fetch that gives one fixed answer. */
function answering(status, body) {
  const calls = [];
  return { calls, fetchImpl: async (...args) => { calls.push(args); return { status, text: async () => body }; } };
}

const REFUSAL_KEYS = ["category", "ok", "reason", "retryable"];

function assertRefusal(result, category, retryable) {
  assert.deepEqual(Object.keys(result).sort(), REFUSAL_KEYS, "a refusal has exactly the fixed keys");
  assert.equal(result.ok, false);
  assert.equal(result.category, category);
  assert.equal(result.retryable, retryable);
  assert.equal(typeof result.reason, "string");
  assert.ok(result.reason.length > 10);
}

const rawStudies = (name) => JSON.parse(FIXTURES[name].body).studies;
const rawLocations = (raw) => raw.protocolSection.contactsLocationsModule?.locations ?? [];

// ---------------------------------------------------------------------------------
// Study ids
// ---------------------------------------------------------------------------------

test("a study id is NCT and exactly 8 digits, nothing else", () => {
  assert.equal(isNctId("NCT01234567"), true);
  for (const bad of ["NCT123", "NCT012345678", "nct01234567", " NCT01234567", "NCT01234567 ",
    "NCT0123456A", "01234567", "NCT01234567\n", "", null, undefined, 1234567, {}, ["NCT01234567"]]) {
    assert.equal(isNctId(bad), false, `must refuse ${JSON.stringify(bad)}`);
  }
});

test("a malformed id is refused before any request is made", async () => {
  // The data source pads "NCT123" and answers with another study, so this check is ours.
  for (const bad of ["NCT123", "nct06932263", "NCT06932263/../version", "", null, 42]) {
    const { calls, fetchImpl } = replay();
    assertRefusal(await getTrial(bad, { fetchImpl }), "validation", false);
    assert.equal(calls.length, 0, `no request for ${JSON.stringify(bad)}`);
    assert.equal(buildStudyUrl(bad), null);
  }
});

// ---------------------------------------------------------------------------------
// D5: plain GET, one argument, fields always named
// ---------------------------------------------------------------------------------

test("D5: every request passes fetch exactly one argument, an address at the data source", async () => {
  const { calls, misses, fetchImpl } = replay();
  await searchTrials(FIXTURES["search-diabetes-boise"].input, { fetchImpl });
  await searchTrials(FIXTURES["search-diabetes-boise-age-sex"].input, { fetchImpl });
  await searchTrials(FIXTURES["search-page-2"].input, { fetchImpl });
  await getTrial("NCT06932263", { fetchImpl });
  await getDataDate({ fetchImpl });
  assert.equal(calls.length, 5);
  assert.deepEqual(misses, []);
  for (const args of calls) {
    assert.equal(args.length, 1, "no options object, so no header, method or credentials");
    assert.equal(typeof args[0], "string");
    assert.ok(args[0].startsWith(`${API_BASE}/`));
  }
});

test("D5: every study request names its fields", () => {
  const search = new URL(buildSearchUrl({ condition: "asthma" }));
  assert.equal(search.searchParams.get("fields"), SEARCH_FIELDS.join(","));
  const study = new URL(buildStudyUrl("NCT06932263"));
  assert.equal(study.searchParams.get("fields"), STUDY_FIELDS.join(","));
  assert.ok(SEARCH_FIELDS.length > 0 && STUDY_FIELDS.length > SEARCH_FIELDS.length);
  for (const field of ["EligibilityCriteria", "BriefSummary", "NCTId", "LastUpdatePostDate"]) {
    assert.ok(STUDY_FIELDS.includes(field), `${field} must be asked for`);
  }
});

test("D5, D1, D3: the source sets no header, stores nothing and logs nothing", async () => {
  const code = (await readFile(SOURCE_FILE, "utf8"))
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/**"))
    .join("\n");
  for (const banned of [/\bheaders\b/i, /\bcredentials\b/, /\bmethod\s*:/, /\bmode\s*:/, /XMLHttpRequest/,
    /sendBeacon/, /\bconsole\./, /localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /\bnew Request\b/]) {
    assert.equal(banned.test(code), false, `trials-api.js must not contain ${banned}`);
  }
  const fetchCalls = code.match(/fetch(Impl)?\(([^)]*)\)/g) ?? [];
  assert.ok(fetchCalls.length > 0);
  for (const call of fetchCalls) {
    assert.equal(call.includes(","), false, `fetch must get one argument: ${call}`);
  }
});

// ---------------------------------------------------------------------------------
// Building the search address
// ---------------------------------------------------------------------------------

test("the search address: recruiting only by default, 10 per page, sorted by match, counted", () => {
  const url = new URL(buildSearchUrl({ condition: "type 2 diabetes", place: "Boise, Idaho" }));
  assert.equal(`${url.origin}${url.pathname}`, `${API_BASE}/studies`);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    "query.cond": "type 2 diabetes",
    "query.locn": "Boise, Idaho",
    "filter.overallStatus": "RECRUITING",
    fields: SEARCH_FIELDS.join(","),
    sort: "@relevance",
    pageSize: String(MAX_STUDIES),
    countTotal: "true",
  });
});

test("the search address: place, status filter and token appear only when asked for", () => {
  const plain = new URL(buildSearchUrl({ condition: "asthma", recruitingOnly: false }));
  assert.equal(plain.searchParams.has("query.locn"), false);
  assert.equal(plain.searchParams.has("filter.overallStatus"), false);
  assert.equal(plain.searchParams.has("filter.advanced"), false);
  assert.equal(plain.searchParams.has("pageToken"), false);
  const more = new URL(buildSearchUrl({ condition: "asthma", pageToken: "Zx_9-a" }));
  assert.equal(more.searchParams.get("pageToken"), "Zx_9-a");
});

test("the search address: age and sex keep studies that state no age limit", () => {
  const url = new URL(buildSearchUrl({ condition: "asthma", age: 54, sex: "female" }));
  assert.equal(
    url.searchParams.get("filter.advanced"),
    "(AREA[MinimumAge]RANGE[MIN, 54 years] OR AREA[MinimumAge]MISSING)"
      + " AND (AREA[MaximumAge]RANGE[54 years, MAX] OR AREA[MaximumAge]MISSING)"
      + " AND AREA[Sex](ALL OR FEMALE)",
  );
  const male = new URL(buildSearchUrl({ condition: "asthma", sex: "male" }));
  assert.equal(male.searchParams.get("filter.advanced"), "AREA[Sex](ALL OR MALE)");
});

test("typed text is only ever search words: brackets, parentheses and quotes are removed", () => {
  const url = new URL(buildSearchUrl({
    condition: "asthma) OR AREA[Sex](MALE) \"x\"",
    place: "Boise [Idaho]",
  }));
  assert.equal(url.searchParams.get("query.cond"), "asthma OR AREA Sex MALE x");
  assert.equal(url.searchParams.get("query.locn"), "Boise Idaho");
});

test("a bad search request is refused before any request is made", async () => {
  const bad = [
    {},
    null,
    { condition: "" },
    { condition: " a " },
    { condition: "()[]" },
    { condition: 7 },
    { condition: "x".repeat(201) },
    { condition: "asthma", place: "p".repeat(101) },
    { condition: "asthma", place: 5 },
    { condition: "asthma", age: -1 },
    { condition: "asthma", age: 121 },
    { condition: "asthma", age: 54.5 },
    { condition: "asthma", age: "54" },
    { condition: "asthma", sex: "FEMALE" },
    { condition: "asthma", sex: "other" },
    { condition: "asthma", pageToken: "has space" },
    { condition: "asthma", pageToken: "a&fields=x" },
    { condition: "asthma", pageToken: 3 },
  ];
  for (const input of bad) {
    const { calls, fetchImpl } = replay();
    assertRefusal(await searchTrials(input, { fetchImpl }), "validation", false);
    assert.equal(calls.length, 0, `no request for ${JSON.stringify(input)}`);
    assert.equal(buildSearchUrl(input), null);
  }
});

// ---------------------------------------------------------------------------------
// Search results, replayed
// ---------------------------------------------------------------------------------

const STUDY_KEYS = ["conditions", "id", "lastUpdated", "link", "maximumAge", "minimumAge",
  "notRecruitingInPlace", "phases", "sex", "siteCounts", "sites", "status", "title"];
const SITE_KEYS = ["city", "country", "facility", "milesFromPlace", "placeMatch", "state", "status", "zip"];

test("a search returns trimmed studies with a fixed set of fields", async () => {
  const { misses, fetchImpl } = replay();
  const result = await searchTrials(FIXTURES["search-diabetes-boise"].input, { fetchImpl });
  assert.deepEqual(misses, []);
  assert.equal(result.ok, true);
  assert.equal(result.nothingMatches, false);
  assert.equal(result.source, "ClinicalTrials.gov");
  const raw = rawStudies("search-diabetes-boise");
  assert.ok(raw.length > 0, "the recording must hold studies");
  assert.equal(result.total, JSON.parse(FIXTURES["search-diabetes-boise"].body).totalCount);
  assert.deepEqual(result.studies.map((study) => study.id), raw.map((r) => r.protocolSection.identificationModule.nctId));
  for (const [index, study] of result.studies.entries()) {
    assert.deepEqual(Object.keys(study).sort(), STUDY_KEYS);
    assert.ok(isNctId(study.id));
    assert.equal(study.link, `https://clinicaltrials.gov/study/${study.id}`);
    assert.equal(study.title, raw[index].protocolSection.identificationModule.briefTitle);
    assert.equal(study.lastUpdated, raw[index].protocolSection.statusModule.lastUpdatePostDateStruct.date);
    assert.match(study.lastUpdated, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(study.status, "RECRUITING");
    for (const site of study.sites) assert.deepEqual(Object.keys(site).sort(), SITE_KEYS);
  }
});

test("T7: at most 5 sites per study, every one of them recruiting, and the counts are honest", async () => {
  for (const name of ["search-diabetes-boise", "search-asthma-boise", "search-page-1", "search-page-2"]) {
    const { fetchImpl } = replay();
    const result = await searchTrials(FIXTURES[name].input, { fetchImpl });
    const raw = rawStudies(name);
    assert.equal(result.ok, true);
    assert.ok(result.studies.length <= MAX_STUDIES);
    for (const [index, study] of result.studies.entries()) {
      const locations = rawLocations(raw[index]);
      const recruiting = locations.filter((site) => site.status === "RECRUITING").length;
      assert.ok(study.sites.length <= MAX_SITES);
      assert.ok(study.sites.every((site) => site.status === "RECRUITING"));
      assert.deepEqual(
        { total: study.siteCounts.total, recruiting: study.siteCounts.recruiting, shown: study.siteCounts.shown },
        { total: locations.length, recruiting, shown: Math.min(recruiting, MAX_SITES) },
      );
      assert.equal(study.sites.length, study.siteCounts.shown);
    }
  }
});

test("T7: every result is far below the runtime's 64 KB cap, though the raw answers are not", async () => {
  let largestRaw = 0;
  for (const fixture of Object.values(FIXTURES).filter((candidate) => candidate.name.startsWith("search-"))) {
    const { fetchImpl } = replay();
    const result = await searchTrials(fixture.input, { fetchImpl });
    largestRaw = Math.max(largestRaw, fixture.body.length);
    assert.ok(JSON.stringify(result).length < 16 * 1024, `${fixture.name} is too large`);
  }
  assert.ok(largestRaw > 64 * 1024, "the recordings should include an answer larger than the cap");
});

test("T7: a data source that sends more than 10 studies still yields 10", async () => {
  const one = rawStudies("search-diabetes-boise")[0];
  const many = Array.from({ length: 15 }, (unused, index) => {
    const copy = structuredClone(one);
    copy.protocolSection.identificationModule.nctId = `NCT900000${String(index).padStart(2, "0")}`;
    return copy;
  });
  const { fetchImpl } = answering(200, JSON.stringify({ totalCount: 15, studies: many }));
  const result = await searchTrials({ condition: "asthma" }, { fetchImpl });
  assert.equal(result.studies.length, MAX_STUDIES);
  assert.equal(result.total, 15);
});

test("a record with no usable study id is left out, not passed on", async () => {
  const one = rawStudies("search-diabetes-boise")[0];
  const broken = structuredClone(one);
  broken.protocolSection.identificationModule.nctId = "NCT12";
  const { fetchImpl } = answering(200, JSON.stringify({ totalCount: 2, studies: [broken, one, {}, null] }));
  const result = await searchTrials({ condition: "asthma" }, { fetchImpl });
  assert.deepEqual(result.studies.map((study) => study.id), [one.protocolSection.identificationModule.nctId]);
});

test("a study can be recruiting overall while its site in the visitor's city is not", async () => {
  // Pinned to the recording: search-asthma-boise holds a study whose Boise site is not recruiting.
  const { fetchImpl } = replay();
  const result = await searchTrials(FIXTURES["search-asthma-boise"].input, { fetchImpl });
  const raw = rawStudies("search-asthma-boise");
  const index = raw.findIndex((r) => rawLocations(r).some((site) => site.city === "Boise" && site.status !== "RECRUITING")
    && !rawLocations(r).some((site) => site.city === "Boise" && site.status === "RECRUITING"));
  assert.notEqual(index, -1, "the recording no longer holds this case; record another");
  const study = result.studies[index];
  const boise = rawLocations(raw[index]).find((site) => site.city === "Boise");
  assert.equal(study.status, "RECRUITING");
  assert.equal(study.siteCounts.recruitingInPlace, 0);
  assert.ok(study.sites.length > 0);
  assert.equal(study.sites.some((site) => site.city === "Boise"), false, "the Boise site must not be shown as a place to go");
  assert.ok(study.sites.every((site) => site.placeMatch !== "city"));
  assert.deepEqual(
    study.notRecruitingInPlace.map((site) => [site.city, site.state, site.status, site.milesFromPlace]),
    [["Boise", "Idaho", boise.status, 0]],
  );
  const miles = study.sites.map((site) => site.milesFromPlace);
  assert.ok(miles.every((value) => Number.isInteger(value) && value > 0));
  assert.deepEqual(miles, [...miles].sort((a, b) => a - b), "shown sites are ordered nearest first");
});

test("a recruiting site in the visitor's city is shown first", async () => {
  const { fetchImpl } = replay();
  const result = await searchTrials(FIXTURES["search-diabetes-boise"].input, { fetchImpl });
  const withLocal = result.studies.filter((study) => study.siteCounts.recruitingInPlace > 0);
  assert.ok(withLocal.length > 0, "the recording no longer holds this case; record another");
  for (const study of withLocal) {
    assert.equal(study.sites[0].city, "Boise");
    assert.equal(study.sites[0].placeMatch, "city");
    assert.equal(study.sites[0].milesFromPlace, 0);
  }
});

// ---------------------------------------------------------------------------------
// Choosing sites, with invented sites
// ---------------------------------------------------------------------------------

const site = (facility, city, state, status, lat, lon, zip = "") => ({
  facility, city, state, zip, country: "United States", status,
  ...(lat === undefined ? {} : { geoPoint: { lat, lon } }),
});

const INVENTED = [
  site("Larkfield Clinic", "Portland", "Oregon", "RECRUITING", 45.52, -122.68),
  site("Quill Street Research", "Boise", "Idaho", "WITHDRAWN", 43.61, -116.2, "83706"),
  site("Tamarack Health", "Twin Falls", "Idaho", "RECRUITING", 42.56, -114.46),
  site("Marlow Institute", "Miami", "Florida", "RECRUITING", 25.77, -80.19),
  site("Pine Hollow Centre", "Spokane", "Washington", "COMPLETED", 47.66, -117.43),
  site("Ridgeback Medical", "Salt Lake City", "Utah", "RECRUITING"),
];

test("sites are ordered by distance from the study's own site in the visitor's city", () => {
  const chosen = selectSites(INVENTED, "Boise, Idaho");
  assert.deepEqual(chosen.sites.map((entry) => entry.city), ["Twin Falls", "Portland", "Miami", "Salt Lake City"]);
  assert.deepEqual(chosen.sites.map((entry) => entry.placeMatch), ["region", "none", "none", "none"]);
  assert.equal(chosen.sites.at(-1).milesFromPlace, null, "a site with no coordinates goes last, with no distance");
  assert.ok(chosen.sites[0].milesFromPlace > 100 && chosen.sites[0].milesFromPlace < 130);
  assert.deepEqual(chosen.siteCounts, { total: 6, recruiting: 4, shown: 4, recruitingInPlace: 0 });
  assert.deepEqual(chosen.notRecruitingInPlace.map((entry) => [entry.city, entry.status]), [["Boise", "WITHDRAWN"]]);
});

test("with no site in the visitor's city, order falls back to matching the address text", () => {
  assert.deepEqual(selectSites(INVENTED, "Idaho").sites.map((entry) => entry.city)[0], "Twin Falls");
  assert.deepEqual(selectSites(INVENTED, "somewhere in ID").sites.map((entry) => entry.city)[0], "Twin Falls");
  assert.deepEqual(selectSites(INVENTED, "83706").notRecruitingInPlace.map((entry) => entry.city), ["Boise"]);
  const none = selectSites(INVENTED, "Lyon");
  assert.deepEqual(none.sites.map((entry) => entry.city), ["Portland", "Twin Falls", "Miami", "Salt Lake City"]);
  assert.ok(none.sites.every((entry) => entry.placeMatch === "none" && entry.milesFromPlace === null));
});

test("a place matches whole words only", () => {
  const sites = [site("Alder Clinic", "York", "Pennsylvania", "RECRUITING"), site("Birch Clinic", "Yorkville", "Illinois", "RECRUITING")];
  assert.deepEqual(selectSites(sites, "Yorkville").sites.map((entry) => entry.placeMatch), ["city", "none"]);
  assert.deepEqual(selectSites(sites, "Yorkville").sites.map((entry) => entry.city), ["Yorkville", "York"]);
  assert.deepEqual(selectSites(sites, "indiana").sites.map((entry) => entry.placeMatch), ["none", "none"]);
});

test("no place, no sites, or a broken site list never throws", () => {
  assert.deepEqual(selectSites(INVENTED).sites.length, 4);
  assert.deepEqual(selectSites(INVENTED, "").siteCounts.recruitingInPlace, 0);
  for (const broken of [undefined, null, "x", {}, [null, 3, "site"]]) {
    assert.deepEqual(selectSites(broken, "Boise"), {
      sites: [],
      siteCounts: { total: 0, recruiting: 0, shown: 0, recruitingInPlace: 0 },
      notRecruitingInPlace: [],
    });
  }
  const many = Array.from({ length: 12 }, (unused, index) => site(`Clinic ${index}`, "Boise", "Idaho", "SUSPENDED", 43.6, -116.2));
  assert.equal(selectSites(many, "Boise").notRecruitingInPlace.length, 3);
});

// ---------------------------------------------------------------------------------
// T5: nothing matches is a success; no answer is a refusal
// ---------------------------------------------------------------------------------

test("T5: nothing matches is a successful result that says so", async () => {
  const { misses, fetchImpl } = replay();
  const result = await searchTrials(FIXTURES["search-nothing"].input, { fetchImpl });
  assert.deepEqual(misses, []);
  assert.deepEqual(result, {
    ok: true,
    nothingMatches: true,
    total: 0,
    studies: [],
    nextPageToken: null,
    searched: { condition: "zzqxqzz notacondition", place: "Boise" },
    source: "ClinicalTrials.gov",
  });
});

test("the place is cut to the words a site's address can match", () => {
  // Checked against the live data source on Nov 18, 2026: each of these found the same 3
  // Boise studies as "Boise, Idaho"; before cleaning, "near Boise, Idaho" and
  // "Boise Idaho USA" found none.
  const cases = {
    "Boise, Idaho": "Boise, Idaho",
    "near Boise, Idaho": "Boise, Idaho",
    "Boise Idaho USA": "Boise Idaho United States",
    "in Boise, ID": "Boise, ID",
    "around Boise": "Boise",
    "within 50 miles of Boise, Idaho": "Boise, Idaho",
    "Boise, Idaho, U.S.": "Boise, Idaho, United States",
    "close to me in Boise": "Boise",
    "the Boise area": "Boise",
    // Place names that contain such words keep them.
    "Salt Lake City, Utah": "Salt Lake City, Utah",
    "District of Columbia": "District of Columbia",
    "Toronto, Canada": "Toronto, Canada",
    "83706": "83706",
    "": "",
  };
  for (const [typed, expected] of Object.entries(cases)) {
    assert.equal(placeWords(typed), expected, `place ${JSON.stringify(typed)}`);
  }
  assert.equal(new URL(buildSearchUrl({ condition: "asthma", place: "near Boise, Idaho" })).searchParams.get("query.locn"), "Boise, Idaho");
  assert.equal(new URL(buildSearchUrl({ condition: "asthma", place: "near me" })).searchParams.has("query.locn"), false,
    "a place with no place words in it is left out, not sent empty");
});

test("T5, T4: a data source that does not answer is a transient refusal, never an empty list", async () => {
  const secret = "ECONNRESET at 10.0.0.7 secret-detail";
  const failing = [
    async () => { throw new Error(secret); },
    async () => { throw new TypeError("Failed to fetch"); },
    async () => ({ status: 200, text: async () => { throw new Error(secret); } }),
    async () => ({ status: 500, text: async () => secret }),
    async () => ({ status: 503, text: async () => secret }),
    async () => ({ status: 429, text: async () => secret }),
    async () => ({ status: 403, text: async () => secret }),
    async () => ({ status: 200, text: async () => `<html>${secret}</html>` }),
    async () => ({ status: 200, text: async () => JSON.stringify({ message: secret }) }),
    async () => ({ status: 200, text: async () => "null" }),
    async () => undefined,
  ];
  for (const fetchImpl of failing) {
    for (const result of [
      await searchTrials({ condition: "asthma" }, { fetchImpl }),
      await getTrial("NCT06932263", { fetchImpl }),
      await getDataDate({ fetchImpl }),
    ]) {
      assertRefusal(result, "transient", true);
      assert.equal(result.studies, undefined);
      assert.equal(JSON.stringify(result).includes("secret"), false, "a refusal never carries the underlying error");
    }
  }
});

test("a data source that never answers is given up on, as a transient refusal", async () => {
  const fetchImpl = () => new Promise(() => {});
  assertRefusal(await searchTrials({ condition: "asthma" }, { fetchImpl, timeoutMs: 20 }), "transient", true);
  const slowBody = async () => ({ status: 200, text: () => new Promise(() => {}) });
  assertRefusal(await getTrial("NCT06932263", { fetchImpl: slowBody, timeoutMs: 20 }), "transient", true);
});

test("the data source's own refusals are mapped to the fixed block", async () => {
  // Recorded: a page token it rejects is 400; an id it does not have is 404.
  const { misses, fetchImpl } = replay();
  assert.equal(FIXTURES["search-bad-token"].status, 400);
  assertRefusal(await searchTrials(FIXTURES["search-bad-token"].input, { fetchImpl }), "validation", false);
  assert.equal(FIXTURES["study-unknown"].status, 404);
  assertRefusal(await getTrial(FIXTURES["study-unknown"].input.id, { fetchImpl }), "not_found", false);
  assert.deepEqual(misses, []);
});

// ---------------------------------------------------------------------------------
// More results
// ---------------------------------------------------------------------------------

test("more results come by token: the next page is new studies, and only page one is counted", async () => {
  const { calls, misses, fetchImpl } = replay();
  const first = await searchTrials(FIXTURES["search-page-1"].input, { fetchImpl });
  assert.equal(first.ok, true);
  assert.equal(first.studies.length, MAX_STUDIES);
  assert.ok(first.total > MAX_STUDIES);
  assert.equal(typeof first.nextPageToken, "string");
  const second = await searchTrials({ ...FIXTURES["search-page-1"].input, pageToken: first.nextPageToken }, { fetchImpl });
  assert.deepEqual(misses, [], "the second request must be the recorded one");
  assert.equal(new URL(calls[1][0]).searchParams.get("pageToken"), first.nextPageToken);
  assert.equal(second.ok, true);
  assert.equal(second.total, null);
  assert.equal(second.nothingMatches, false);
  const firstIds = new Set(first.studies.map((study) => study.id));
  assert.ok(second.studies.length > 0);
  assert.ok(second.studies.every((study) => !firstIds.has(study.id)));
});

test("an empty later page is not reported as nothing matches", async () => {
  const { fetchImpl } = answering(200, JSON.stringify({ studies: [] }));
  const result = await searchTrials({ condition: "asthma", pageToken: "Zx_9-a" }, { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.nothingMatches, false);
  assert.deepEqual(result.studies, []);
});

// ---------------------------------------------------------------------------------
// One study
// ---------------------------------------------------------------------------------

test("one study: the criteria are the record's text exactly, with its date and contact as listed", async () => {
  const { misses, fetchImpl } = replay();
  const fixture = FIXTURES["study-found"];
  const raw = JSON.parse(fixture.body).protocolSection;
  const result = await getTrial(fixture.input.id, { fetchImpl, place: "Boise, Idaho" });
  assert.deepEqual(misses, []);
  assert.equal(result.ok, true);
  assert.equal(result.source, "ClinicalTrials.gov");
  const study = result.study;
  assert.deepEqual(Object.keys(study).sort(), [...STUDY_KEYS, "contacts", "criteria", "healthyVolunteers", "summary"].sort());
  assert.equal(study.id, fixture.input.id);
  assert.ok(raw.eligibilityModule.eligibilityCriteria.length > 200);
  assert.equal(study.criteria, raw.eligibilityModule.eligibilityCriteria, "criteria are verbatim");
  assert.equal(study.summary, raw.descriptionModule.briefSummary);
  assert.equal(study.lastUpdated, raw.statusModule.lastUpdatePostDateStruct.date);
  assert.equal(study.minimumAge, raw.eligibilityModule.minimumAge);
  assert.equal(study.sex, raw.eligibilityModule.sex);
  assert.equal(typeof study.healthyVolunteers, "boolean");
  const listed = raw.contactsLocationsModule.centralContacts ?? [];
  assert.equal(study.contacts.length, Math.min(listed.length, MAX_CONTACTS));
  for (const [index, contact] of study.contacts.entries()) {
    assert.deepEqual(Object.keys(contact).sort(), ["email", "name", "phone", "phoneExt", "role"]);
    assert.equal(contact.name, listed[index].name);
    assert.equal(contact.phone, listed[index].phone ?? "");
  }
  assert.ok(study.sites.length <= MAX_SITES);
  assert.ok(study.sites.every((entry) => entry.status === "RECRUITING"));
  assert.ok(JSON.stringify(result).length < 16 * 1024);
  assert.ok(fixture.body.length > JSON.stringify(result).length * 3, "the raw record is much larger than what is passed on");
});

test("one study: missing parts of a record become empty values, not errors", async () => {
  const bare = { protocolSection: { identificationModule: { nctId: "NCT90000001" } } };
  const { fetchImpl } = answering(200, JSON.stringify(bare));
  const result = await getTrial("NCT90000001", { fetchImpl });
  assert.equal(result.ok, true);
  assert.deepEqual(result.study, {
    id: "NCT90000001",
    link: "https://clinicaltrials.gov/study/NCT90000001",
    title: "",
    status: "",
    phases: [],
    conditions: [],
    minimumAge: "",
    maximumAge: "",
    sex: "",
    lastUpdated: "",
    sites: [],
    siteCounts: { total: 0, recruiting: 0, shown: 0, recruitingInPlace: 0 },
    notRecruitingInPlace: [],
    summary: "",
    criteria: "",
    healthyVolunteers: null,
    contacts: [],
  });
});

// ---------------------------------------------------------------------------------
// The data date, and the recordings themselves
// ---------------------------------------------------------------------------------

test("the data date comes from the data source", async () => {
  const { calls, misses, fetchImpl } = replay();
  const result = await getDataDate({ fetchImpl });
  assert.deepEqual(misses, []);
  assert.equal(calls[0][0], buildVersionUrl());
  assert.deepEqual(Object.keys(result).sort(), ["apiVersion", "dataTimestamp", "ok", "source"]);
  assert.equal(result.dataTimestamp, JSON.parse(FIXTURES.version.body).dataTimestamp);
  assert.match(result.dataTimestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test("every recording answers a request the site really makes", () => {
  const names = Object.keys(FIXTURES).sort();
  assert.ok(names.length >= 8, "about eight public answers are recorded");
  for (const fixture of Object.values(FIXTURES)) {
    const expected = fixture.name.startsWith("search-") ? buildSearchUrl(fixture.input)
      : fixture.name.startsWith("study-") ? buildStudyUrl(fixture.input.id)
        : buildVersionUrl();
    assert.equal(fixture.url, expected, `${fixture.name} was recorded for a different address; record again`);
  }
});

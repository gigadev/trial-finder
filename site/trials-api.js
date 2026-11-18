// The only file that calls ClinicalTrials.gov.
//
// Rules this file keeps (docs/AGENT_STANDARDS.md):
//   D5  Every request is a plain GET with one argument, the address. No options object,
//       so no custom header and no credentials. A header would make the browser send a
//       preflight, which this data source refuses. Every request names its fields.
//   T5  "Nothing matches" is a successful result. "The data source did not answer" is a
//       refusal. An empty list is never returned in place of a failure.
//   T4  A refusal is the fixed block { ok: false, category, retryable, reason }. Nothing
//       here throws, and no refusal carries an underlying error's text.
//   T7  Results are trimmed here: at most 10 studies, at most 5 recruiting sites each.
//   D1, D3  Nothing is stored and nothing is logged.
//
// What was checked against the live data source, and when: docs/CLINICALTRIALS_API.md.

export const API_BASE = "https://clinicaltrials.gov/api/v2";
export const STUDY_PAGE_BASE = "https://clinicaltrials.gov/study/";
export const SOURCE_NAME = "ClinicalTrials.gov";

export const MAX_STUDIES = 10;
export const MAX_SITES = 5;
export const MAX_CONTACTS = 3;
export const MAX_NOT_RECRUITING_NOTES = 3;
export const DEFAULT_TIMEOUT_MS = 15000;

const MAX_CONDITION_LENGTH = 200;
const MAX_PLACE_LENGTH = 100;
const MAX_TOKEN_LENGTH = 400;
const MAX_AGE = 120;

/** Fields asked for in a search. Site contacts are left out: a search does not need them. */
export const SEARCH_FIELDS = Object.freeze([
  "NCTId",
  "BriefTitle",
  "OverallStatus",
  "Phase",
  "Condition",
  "MinimumAge",
  "MaximumAge",
  "Sex",
  "LastUpdatePostDate",
  "LocationFacility",
  "LocationStatus",
  "LocationCity",
  "LocationState",
  "LocationZip",
  "LocationCountry",
  "LocationGeoPoint",
]);

/** Fields asked for when one study is fetched. */
export const STUDY_FIELDS = Object.freeze([
  ...SEARCH_FIELDS,
  "BriefSummary",
  "EligibilityCriteria",
  "HealthyVolunteers",
  "CentralContactName",
  "CentralContactRole",
  "CentralContactPhone",
  "CentralContactPhoneExt",
  "CentralContactEMail",
]);

const REASONS = Object.freeze({
  noAnswer: "ClinicalTrials.gov did not answer. This is a problem reaching the data source, not a sign that no studies exist. Try again in a moment.",
  badAnswer: "ClinicalTrials.gov sent an answer this site could not read. Try again in a moment.",
  searchRefused: "ClinicalTrials.gov could not read that search. Try plainer words for the condition and the place.",
  condition: "Say which condition or disease to search for, in 2 to 200 characters.",
  place: "The place must be text of at most 100 characters, such as a city and state.",
  age: "The age must be a whole number of years from 0 to 120.",
  sex: "The sex must be \"female\" or \"male\", or left out.",
  token: "That is not a way to get more results. Search again.",
  idShape: "A study id is the letters NCT followed by 8 digits, such as NCT01234567.",
  notFound: "ClinicalTrials.gov has no study with that id.",
});

const US_STATE_CODES = Object.freeze({
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca",
  colorado: "co", connecticut: "ct", delaware: "de", "district of columbia": "dc",
  florida: "fl", georgia: "ga", hawaii: "hi", idaho: "id", illinois: "il", indiana: "in",
  iowa: "ia", kansas: "ks", kentucky: "ky", louisiana: "la", maine: "me", maryland: "md",
  massachusetts: "ma", michigan: "mi", minnesota: "mn", mississippi: "ms", missouri: "mo",
  montana: "mt", nebraska: "ne", nevada: "nv", "new hampshire": "nh", "new jersey": "nj",
  "new mexico": "nm", "new york": "ny", "north carolina": "nc", "north dakota": "nd",
  ohio: "oh", oklahoma: "ok", oregon: "or", pennsylvania: "pa", "rhode island": "ri",
  "south carolina": "sc", "south dakota": "sd", tennessee: "tn", texas: "tx", utah: "ut",
  vermont: "vt", virginia: "va", washington: "wa", "west virginia": "wv", wisconsin: "wi",
  wyoming: "wy",
});

function refuse(category, retryable, reason) {
  return { ok: false, category, retryable, reason };
}

/**
 * True only for the letters NCT followed by exactly 8 digits.
 *
 * The data source itself is looser: it pads a short id such as "NCT123" and answers with
 * another study. So the shape is checked here, before any request.
 */
export function isNctId(value) {
  return typeof value === "string" && /^NCT\d{8}$/.test(value);
}

/**
 * Make visitor text safe to use as search words.
 *
 * The data source reads brackets, parentheses and quotes as search syntax. They are
 * replaced with spaces so that typed text is only ever words.
 */
function searchWords(value) {
  return String(value).replace(/[[\]()"\\]/g, " ").replace(/\s+/g, " ").trim();
}

/** Words that describe nearness, not a place. The data source needs every place word to match. */
const NOT_PLACE_WORDS = new Set(["near", "nearby", "around", "close", "closest", "to", "area", "me", "my", "from", "within", "about"]);

/**
 * Turn the place as typed into the words the data source can match.
 *
 * The location search needs every word to match a site's address, so "near Boise, Idaho"
 * or "Boise Idaho USA" finds nothing while "Boise, Idaho" finds studies (checked Nov 18,
 * 2026, docs/CLINICALTRIALS_API.md). Words about nearness and distances are dropped, a
 * leading "in" or "the" is dropped, and the U.S. is named as the records name it.
 */
export function placeWords(value) {
  let text = searchWords(value ?? "");
  text = text.replace(/\b\d+(\.\d+)?\s*(miles?|mi|km|kilometers?|kilometres?)\b(\s+of\b)?/gi, " ");
  text = text.replace(/\b(U\.?S\.?A\.?|U\.S\.|US|United States of America|America)(?=$|[\s,])/g, "United States");
  const words = text.split(" ").filter((word) => !NOT_PLACE_WORDS.has(word.toLowerCase().replace(/,$/, "")));
  while (words.length && /^(in|the|of),?$/i.test(words[0])) words.shift();
  return words.join(" ").replace(/\s+,/g, ",").replace(/^,|,$/g, "").trim();
}

function isBlank(value) {
  return value === undefined || value === null || value === "";
}

/**
 * Check a search request. Returns { value } with the cleaned request, or { refusal }.
 */
function checkSearch(input) {
  const request = input && typeof input === "object" ? input : {};
  if (typeof request.condition !== "string") return { refusal: refuse("validation", false, REASONS.condition) };
  const condition = searchWords(request.condition);
  if (condition.length < 2 || request.condition.length > MAX_CONDITION_LENGTH) {
    return { refusal: refuse("validation", false, REASONS.condition) };
  }
  let place = "";
  if (!isBlank(request.place)) {
    if (typeof request.place !== "string" || request.place.length > MAX_PLACE_LENGTH) {
      return { refusal: refuse("validation", false, REASONS.place) };
    }
    place = placeWords(request.place);
  }
  let age = null;
  if (!isBlank(request.age)) {
    if (!Number.isInteger(request.age) || request.age < 0 || request.age > MAX_AGE) {
      return { refusal: refuse("validation", false, REASONS.age) };
    }
    age = request.age;
  }
  let sex = null;
  if (!isBlank(request.sex)) {
    if (request.sex !== "female" && request.sex !== "male") {
      return { refusal: refuse("validation", false, REASONS.sex) };
    }
    sex = request.sex;
  }
  let pageToken = null;
  if (!isBlank(request.pageToken)) {
    if (typeof request.pageToken !== "string" || request.pageToken.length > MAX_TOKEN_LENGTH
      || !/^[A-Za-z0-9_-]+$/.test(request.pageToken)) {
      return { refusal: refuse("validation", false, REASONS.token) };
    }
    pageToken = request.pageToken;
  }
  const recruitingOnly = request.recruitingOnly !== false;
  return { value: { condition, place, age, sex, pageToken, recruitingOnly } };
}

/**
 * The address for a search. The request must already have passed checkSearch.
 *
 * Age and sex go in one filter expression. Studies that state no lower or no upper age
 * limit are kept: the plain range filter in the data source's own example drops them.
 */
function searchUrl(request) {
  const params = new URLSearchParams();
  params.set("query.cond", request.condition);
  if (request.place) params.set("query.locn", request.place);
  if (request.recruitingOnly) params.set("filter.overallStatus", "RECRUITING");
  const filters = [];
  if (request.age !== null) {
    filters.push(`(AREA[MinimumAge]RANGE[MIN, ${request.age} years] OR AREA[MinimumAge]MISSING)`);
    filters.push(`(AREA[MaximumAge]RANGE[${request.age} years, MAX] OR AREA[MaximumAge]MISSING)`);
  }
  if (request.sex !== null) filters.push(`AREA[Sex](ALL OR ${request.sex.toUpperCase()})`);
  if (filters.length) params.set("filter.advanced", filters.join(" AND "));
  params.set("fields", SEARCH_FIELDS.join(","));
  params.set("sort", "@relevance");
  params.set("pageSize", String(MAX_STUDIES));
  params.set("countTotal", "true");
  if (request.pageToken) params.set("pageToken", request.pageToken);
  return `${API_BASE}/studies?${params.toString()}`;
}

/**
 * The address for a search, or null when the request would be refused.
 */
export function buildSearchUrl(input) {
  const checked = checkSearch(input);
  return checked.value ? searchUrl(checked.value) : null;
}

/**
 * The address for one study, or null when the id is not shaped like a study id.
 */
export function buildStudyUrl(id) {
  if (!isNctId(id)) return null;
  const params = new URLSearchParams();
  params.set("fields", STUDY_FIELDS.join(","));
  return `${API_BASE}/studies/${id}?${params.toString()}`;
}

export function buildVersionUrl() {
  return `${API_BASE}/version`;
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function textList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function containsPhrase(haystack, phrase) {
  if (!phrase) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(haystack);
}

/**
 * How well a site's address matches the place the visitor typed.
 *
 * There is no geocoding here, so this compares text, not distance: "city" when the
 * site's city or zip code is in the place, "region" when only its state or country is,
 * "none" otherwise.
 */
function matchPlace(site, placeLower) {
  if (!placeLower) return { score: 0, match: "none" };
  const city = text(site.city).toLowerCase();
  const state = text(site.state).toLowerCase();
  const country = text(site.country).toLowerCase();
  const zip = text(site.zip).toLowerCase();
  let score = 0;
  const cityHit = containsPhrase(placeLower, city) || containsPhrase(placeLower, zip);
  if (cityHit) score += 4;
  const stateHit = containsPhrase(placeLower, state) || containsPhrase(placeLower, US_STATE_CODES[state]);
  if (stateHit) score += 2;
  const countryHit = containsPhrase(placeLower, country);
  if (countryHit) score += 1;
  return { score, match: cityHit ? "city" : stateHit || countryHit ? "region" : "none" };
}

function hasPoint(site) {
  return Number.isFinite(site?.geoPoint?.lat) && Number.isFinite(site?.geoPoint?.lon);
}

/** Straight-line distance in miles between two sites' listed coordinates. */
function milesBetween(a, b) {
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = rad(b.geoPoint.lat - a.geoPoint.lat);
  const dLon = rad(b.geoPoint.lon - a.geoPoint.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.geoPoint.lat)) * Math.cos(rad(b.geoPoint.lat)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function siteView(site, match, miles) {
  return {
    facility: text(site.facility),
    city: text(site.city),
    state: text(site.state),
    zip: text(site.zip),
    country: text(site.country),
    status: text(site.status),
    placeMatch: match,
    milesFromPlace: Number.isFinite(miles) ? Math.round(miles) : null,
  };
}

/**
 * Pick the sites to show for one study.
 *
 * Only sites whose own status is RECRUITING are shown, at most MAX_SITES. A study can be
 * recruiting overall while the site near the visitor is not, so sites in the visitor's
 * city that are not recruiting are reported separately.
 *
 * Order: when the study lists any site in the visitor's city, whatever its status, that
 * site's own coordinates stand for the place, and recruiting sites are ordered by
 * straight-line distance from it. Otherwise they are ordered by how well their address
 * text matches the place. No outside service is asked where a place is.
 */
export function selectSites(locations, place) {
  const all = Array.isArray(locations) ? locations.filter((site) => site && typeof site === "object") : [];
  const placeLower = placeWords(place).toLowerCase();
  const ranked = all.map((site, index) => ({ site, index, miles: NaN, ...matchPlace(site, placeLower) }));
  const anchor = ranked.find((entry) => entry.match === "city" && hasPoint(entry.site));
  if (anchor) {
    for (const entry of ranked) {
      if (hasPoint(entry.site)) entry.miles = milesBetween(anchor.site, entry.site);
    }
  }
  const byDistance = (a, b) => (Number.isFinite(a.miles) ? a.miles : Infinity) - (Number.isFinite(b.miles) ? b.miles : Infinity);
  const recruiting = ranked
    .filter((entry) => entry.site.status === "RECRUITING")
    .sort((a, b) => (anchor ? byDistance(a, b) : 0) || b.score - a.score || a.index - b.index);
  const notRecruitingNearby = ranked.filter((entry) => entry.match === "city" && entry.site.status !== "RECRUITING");
  return {
    sites: recruiting.slice(0, MAX_SITES).map((entry) => siteView(entry.site, entry.match, entry.miles)),
    siteCounts: {
      total: all.length,
      recruiting: recruiting.length,
      shown: Math.min(recruiting.length, MAX_SITES),
      recruitingInPlace: recruiting.filter((entry) => entry.match === "city").length,
    },
    notRecruitingInPlace: notRecruitingNearby
      .slice(0, MAX_NOT_RECRUITING_NOTES)
      .map((entry) => siteView(entry.site, entry.match, entry.miles)),
  };
}

/**
 * Trim one study record to the fields the page and the agents use.
 * Returns null when the record has no usable study id.
 */
function summarize(raw, place) {
  const protocol = raw?.protocolSection ?? {};
  const id = protocol.identificationModule?.nctId;
  if (!isNctId(id)) return null;
  const eligibility = protocol.eligibilityModule ?? {};
  return {
    id,
    link: `${STUDY_PAGE_BASE}${id}`,
    title: text(protocol.identificationModule?.briefTitle),
    status: text(protocol.statusModule?.overallStatus),
    phases: textList(protocol.designModule?.phases),
    conditions: textList(protocol.conditionsModule?.conditions),
    minimumAge: text(eligibility.minimumAge),
    maximumAge: text(eligibility.maximumAge),
    sex: text(eligibility.sex),
    lastUpdated: text(protocol.statusModule?.lastUpdatePostDateStruct?.date),
    ...selectSites(protocol.contactsLocationsModule?.locations, place),
  };
}

function contactView(contact) {
  return {
    name: text(contact?.name),
    role: text(contact?.role),
    phone: text(contact?.phone),
    phoneExt: text(contact?.phoneExt),
    email: text(contact?.email),
  };
}

/**
 * Make one request and read its answer as text.
 *
 * The fetch function gets exactly one argument, the address. Returns null when there was
 * no answer in time; the cause is deliberately not kept.
 */
async function request(url, options) {
  const fetchImpl = options?.fetchImpl ?? ((address) => globalThis.fetch(address));
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  try {
    const response = await Promise.race([fetchImpl(url), timeout]);
    const body = await Promise.race([response.text(), timeout]);
    return { status: response.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(body) {
  try {
    const value = JSON.parse(body);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Search for studies.
 *
 * input: { condition, place?, age?, sex?: "female" | "male", recruitingOnly? = true,
 *          pageToken? } where pageToken is the nextPageToken of an earlier result for
 *          the same search.
 * Returns { ok: true, nothingMatches, total, studies, nextPageToken, source } or a
 * refusal. total is null on pages after the first: the data source counts only once.
 */
export async function searchTrials(input, options) {
  const checked = checkSearch(input);
  if (checked.refusal) return checked.refusal;
  const answer = await request(searchUrl(checked.value), options);
  if (!answer) return refuse("transient", true, REASONS.noAnswer);
  if (answer.status === 400) return refuse("validation", false, REASONS.searchRefused);
  if (answer.status !== 200) return refuse("transient", true, REASONS.noAnswer);
  const data = parseJson(answer.body);
  if (!data || !Array.isArray(data.studies)) return refuse("transient", true, REASONS.badAnswer);
  const studies = data.studies
    .map((raw) => summarize(raw, checked.value.place))
    .filter(Boolean)
    .slice(0, MAX_STUDIES);
  const firstPage = checked.value.pageToken === null;
  return {
    ok: true,
    nothingMatches: firstPage && studies.length === 0,
    total: Number.isInteger(data.totalCount) ? data.totalCount : null,
    studies,
    nextPageToken: typeof data.nextPageToken === "string" ? data.nextPageToken : null,
    searched: { condition: checked.value.condition, place: checked.value.place },
    source: SOURCE_NAME,
  };
}

/**
 * Fetch one study by id.
 *
 * id: "NCT" and 8 digits. Anything else is refused before any request is made.
 * options.place: optional text used to order the sites.
 * Returns { ok: true, study, source } or a refusal. study.criteria is the record's
 * eligibility text exactly as the data source sent it.
 */
export async function getTrial(id, options) {
  const url = buildStudyUrl(id);
  if (!url) return refuse("validation", false, REASONS.idShape);
  const answer = await request(url, options);
  if (!answer) return refuse("transient", true, REASONS.noAnswer);
  if (answer.status === 404) return refuse("not_found", false, REASONS.notFound);
  if (answer.status === 400) return refuse("validation", false, REASONS.idShape);
  if (answer.status !== 200) return refuse("transient", true, REASONS.noAnswer);
  const data = parseJson(answer.body);
  const summary = data ? summarize(data, options?.place) : null;
  if (!summary) return refuse("transient", true, REASONS.badAnswer);
  const protocol = data.protocolSection ?? {};
  const contacts = Array.isArray(protocol.contactsLocationsModule?.centralContacts)
    ? protocol.contactsLocationsModule.centralContacts
    : [];
  const healthy = protocol.eligibilityModule?.healthyVolunteers;
  return {
    ok: true,
    study: {
      ...summary,
      summary: text(protocol.descriptionModule?.briefSummary),
      criteria: text(protocol.eligibilityModule?.eligibilityCriteria),
      healthyVolunteers: typeof healthy === "boolean" ? healthy : null,
      contacts: contacts.slice(0, MAX_CONTACTS).map(contactView),
    },
    source: SOURCE_NAME,
  };
}

/**
 * Ask the data source when its data were last processed.
 * Returns { ok: true, dataTimestamp, apiVersion, source } or a refusal.
 */
export async function getDataDate(options) {
  const answer = await request(buildVersionUrl(), options);
  if (!answer || answer.status !== 200) return refuse("transient", true, REASONS.noAnswer);
  const data = parseJson(answer.body);
  if (!data || typeof data.dataTimestamp !== "string") return refuse("transient", true, REASONS.badAnswer);
  return {
    ok: true,
    dataTimestamp: data.dataTimestamp,
    apiVersion: text(data.apiVersion),
    source: SOURCE_NAME,
  };
}

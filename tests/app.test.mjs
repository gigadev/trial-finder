// Tests for the page without AI: site/app.js driven through the skill's DOM stand-in,
// with the data source replayed from tests/fixtures/ctgov/. No network, no model, no cost.
//
// Rules kept here (docs/AGENT_STANDARDS.md): C10 and D7 (facts and the source come from
// the record and are drawn by code), D6 (the notice before the first search), T1 (the
// page works without AI; buttons and methods share one set of rules), W1 for the
// shortlist (visible and undoable). The source checks for D1, D3 and D4 are in
// tests/source-checks.test.mjs.

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as trialsApi from "../site/trials-api.js";
import {
  MAX_QUESTIONS,
  MAX_SHORTLIST,
  STANDARD_QUESTIONS,
  TrialFinderPage,
  WORDING,
  ageWords,
  statusWords,
} from "../site/app.js";
import { StubDocument } from "../vendor/agentify-website/templates/tests/stub_document.mjs";
import { StubElement } from "../vendor/agentify-website/templates/tests/stub_element.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = await readFile(path.join(HERE, "../site/index.html"), "utf8");
const FIXTURE_DIR = path.join(HERE, "fixtures/ctgov");

const FIXTURES = {};
for (const file of await readdir(FIXTURE_DIR)) {
  if (file.endsWith(".json")) {
    const fixture = JSON.parse(await readFile(path.join(FIXTURE_DIR, file), "utf8"));
    FIXTURES[fixture.name] = fixture;
  }
}

const DIABETES = FIXTURES["search-diabetes-boise"].input;
const ASTHMA = FIXTURES["search-asthma-boise"].input;
const PAGED = FIXTURES["search-page-1"].input;
const STUDY_ID = FIXTURES["study-found"].input.id;

/**
 * A page on a stand-in document, with the data layer answering from the recordings.
 * `down` makes every request fail, as when the data source does not answer.
 */
function makePage() {
  const requests = [];
  const control = { down: false, failIds: new Set() };
  const fetchImpl = async (url) => {
    requests.push(url);
    if (control.down) throw new Error("offline");
    if ([...control.failIds].some((id) => url.includes(`/studies/${id}?`))) throw new Error("offline");
    let fixture = Object.values(FIXTURES).find((candidate) => candidate.url === url);
    if (!fixture) {
      // The page passes the search's place when it fetches one study, which changes nothing
      // in the address; any other unknown address is a test mistake.
      throw new Error(`no recording for ${url}`);
    }
    return { status: fixture.status, text: async () => fixture.body };
  };
  const api = {
    isNctId: trialsApi.isNctId,
    buildSearchUrl: trialsApi.buildSearchUrl,
    buildStudyUrl: trialsApi.buildStudyUrl,
    searchTrials: (input) => trialsApi.searchTrials(input, { fetchImpl }),
    getTrial: (id, options) => trialsApi.getTrial(id, { ...options, fetchImpl }),
    getDataDate: () => trialsApi.getDataDate({ fetchImpl }),
  };
  const document = StubDocument.fromHtml(HTML);
  const printed = [];
  const page = new TrialFinderPage(document, { api, print: () => printed.push(true) });
  const node = (id) => document.getElementById(id);
  return { page, document, node, requests, control, printed };
}

/** Let promise callbacks that are already due run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** A page whose notice has already been accepted. */
async function readyPage() {
  const made = makePage();
  made.page.noticeAccepted = true;
  return made;
}

/** All text under an element, as a visitor would read it. */
function textOf(element) {
  if (!(element instanceof StubElement)) return String(element);
  return [element.textContent, ...element.children.map(textOf)].filter(Boolean).join(" ");
}

function buttons(element) {
  return element.querySelectorAll("button");
}

function clickButton(element, label) {
  const found = buttons(element).filter((button) => button.textContent === label);
  assert.equal(found.length, 1, `expected one button "${label}", found ${found.length}: ${buttons(element).map((b) => b.textContent)}`);
  found[0].dispatch("click");
}

function assertRefusal(result, category) {
  assert.deepEqual(Object.keys(result).sort(), ["category", "ok", "reason", "retryable"]);
  assert.equal(result.ok, false);
  assert.equal(result.category, category);
}

function focusedIds(document) {
  return [...document.elements.entries()].filter(([, element]) => element.focused).map(([id]) => id);
}

// ---------------------------------------------------------------------------------
// D6: the notice before the first search
// ---------------------------------------------------------------------------------

test("D6: the first search sends nothing until the visitor continues", async () => {
  const { page, node, requests } = makePage();
  assert.equal(node("notice").hidden, true);
  const pending = page.searchStudies(DIABETES);
  await settle();
  assert.equal(node("notice").hidden, false, "the notice is shown");
  assert.equal(requests.length, 0, "nothing is sent while the notice waits");
  assert.equal(page.getState().notice.waiting, true);
  node("notice-continue").dispatch("click");
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(node("notice").hidden, true);
  assert.ok(requests.length >= 1);
  assert.ok(requests.every((url) => url.startsWith("https://clinicaltrials.gov/api/v2/")));
});

test("D6: declining the notice sends nothing and changes nothing", async () => {
  const { page, node, requests } = makePage();
  const before = page.getState();
  const pending = page.searchStudies(DIABETES);
  await settle();
  node("notice-decline").dispatch("click");
  const result = await pending;
  assertRefusal(result, "business");
  assert.equal(requests.length, 0);
  assert.equal(node("notice").hidden, true);
  assert.equal(node("results").hidden, true);
  const after = page.getState();
  assert.deepEqual({ ...after, version: 0 }, { ...before, version: 0 });
  // Declining once is not a standing answer: the next search asks again.
  const again = page.searchStudies(DIABETES);
  await settle();
  assert.equal(node("notice").hidden, false);
  assert.equal(requests.length, 0);
  node("notice-continue").dispatch("click");
  assert.equal((await again).ok, true);
});

test("D6: the notice is asked once; later searches go straight through", async () => {
  const { page, node, requests } = makePage();
  const first = page.searchStudies(DIABETES);
  await settle();
  node("notice-continue").dispatch("click");
  await first;
  await settle();
  const sent = requests.length;
  const second = await page.searchStudies(ASTHMA);
  assert.equal(second.ok, true);
  assert.equal(node("notice").hidden, true);
  assert.equal(requests.length, sent + 1);
});

test("D6: opening a study also waits for the notice", async () => {
  const { page, node, requests } = makePage();
  const pending = page.openStudy(STUDY_ID);
  await settle();
  assert.equal(node("notice").hidden, false);
  assert.equal(requests.length, 0);
  node("notice-decline").dispatch("click");
  assertRefusal(await pending, "business");
  assert.equal(requests.length, 0);
  assert.equal(node("study").hidden, true);
});

test("D6: the notice says who gets the search words, and the page says it everywhere it must", () => {
  assert.ok(WORDING.notice.includes("ClinicalTrials.gov"));
  assert.ok(WORDING.notice.includes("U.S. National Library of Medicine"));
  assert.ok(HTML.includes(WORDING.notice), "index.html must carry the notice wording");
});

test("a bad search is refused without showing the notice or sending anything", async () => {
  const { page, node, requests } = makePage();
  for (const input of [{ condition: "" }, { condition: "asthma", age: 400 }, { condition: "asthma", sex: "x" }, {}]) {
    assertRefusal(await page.searchStudies(input), "validation");
  }
  assert.equal(node("notice").hidden, true);
  assert.equal(requests.length, 0);
  assert.equal(page.getState().version, 0, "nothing on the page changed");
});

// ---------------------------------------------------------------------------------
// Results: facts come from the record
// ---------------------------------------------------------------------------------

test("C10, D7: every card shows the study id, the record's date, the source and its link", async () => {
  const { page, node } = await readyPage();
  const result = await page.searchStudies(DIABETES);
  await settle();
  assert.equal(node("results").hidden, false);
  const cards = node("results-list").querySelectorAll("article");
  assert.equal(cards.length, result.studies.length);
  assert.ok(cards.length > 0);
  for (const [index, card] of cards.entries()) {
    const study = result.studies[index];
    const text = textOf(card);
    assert.ok(text.includes(study.id));
    assert.ok(text.includes(study.title));
    assert.ok(text.includes(WORDING.source));
    assert.ok(text.includes(`Record last updated ${study.lastUpdated}`));
    assert.ok(text.includes(statusWords(study.status)));
    assert.ok(text.includes(ageWords(study.minimumAge, study.maximumAge)));
    const links = card.querySelectorAll("a");
    assert.equal(links.length, 1);
    assert.equal(links[0].getAttribute("href"), `https://clinicaltrials.gov/study/${study.id}`);
    assert.equal(links[0].getAttribute("rel"), "noopener noreferrer");
  }
  const summary = node("results-summary").textContent;
  assert.ok(summary.includes(`Showing ${result.studies.length} of ${result.total} found`));
  const source = node("results-source").textContent;
  assert.ok(source.includes(WORDING.source));
  assert.ok(source.includes(JSON.parse(FIXTURES.version.body).dataTimestamp.slice(0, 10)), "the data date is shown");
});

test("a site in the visitor's city that is not recruiting is named as such, not listed as a place to go", async () => {
  const { page, node } = await readyPage();
  const result = await page.searchStudies(ASTHMA);
  const study = result.studies.find((candidate) => candidate.notRecruitingInPlace.length > 0);
  assert.ok(study, "the recording must hold this case");
  const card = node("results-list").querySelectorAll("article")[result.studies.indexOf(study)];
  const warnings = card.querySelectorAll("p").filter((p) => p.className === "site-warning");
  assert.equal(warnings.length, study.notRecruitingInPlace.length);
  assert.ok(warnings[0].textContent.includes("Boise, Idaho"));
  assert.ok(warnings[0].textContent.includes(statusWords(study.notRecruitingInPlace[0].status)));
  assert.ok(warnings[0].textContent.includes("not taking new people"));
  const listed = card.querySelectorAll("li").map((li) => li.textContent);
  assert.equal(listed.length, study.sites.length);
  assert.equal(listed.some((line) => line.includes("Boise")), false);
  assert.ok(listed.every((line) => /about \d+ miles away in a straight line/.test(line)));
});

test("T5 on the page: nothing matches and did-not-answer read differently", async () => {
  const { page, node, control } = await readyPage();
  const nothing = await page.searchStudies(FIXTURES["search-nothing"].input);
  assert.equal(nothing.ok, true);
  assert.equal(node("results").hidden, false);
  assert.equal(node("results-summary").textContent, `Searched for "zzqxqzz notacondition" in "Boise". ${WORDING.nothingMatches}`);
  assert.equal(node("results-list").children.length, 0);
  assert.equal(node("search-error").hidden, true);

  control.down = true;
  const failed = await page.searchStudies(DIABETES);
  assertRefusal(failed, "transient");
  assert.equal(node("results").hidden, true, "old results are not left looking like the answer");
  assert.equal(node("search-error").hidden, false);
  assert.equal(node("search-error").textContent, failed.reason);
  assert.ok(failed.reason.includes("did not answer"));
  assert.notEqual(node("search-error").textContent, WORDING.nothingMatches);
});

test("more results are added below, without repeating a study", async () => {
  const { page, node } = await readyPage();
  const first = await page.searchStudies(PAGED);
  assert.equal(node("more-results").hidden, false);
  const more = await page.moreResults();
  assert.equal(more.ok, true);
  const state = page.getState();
  const ids = state.results.studies.map((study) => study.id);
  assert.equal(ids.length, first.studies.length + more.studies.length);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(node("results-list").querySelectorAll("article").length, ids.length);
  assert.equal(state.results.total, first.total, "the total from the first page is kept");

  const small = await readyPage();
  await small.page.searchStudies(DIABETES);
  assert.equal(small.node("more-results").hidden, true);
  assertRefusal(await small.page.moreResults(), "business");
});

// ---------------------------------------------------------------------------------
// One study: criteria word for word
// ---------------------------------------------------------------------------------

test("C10: the detail view shows the criteria exactly as the record has them", async () => {
  const { page, node } = await readyPage();
  const result = await page.openStudy(STUDY_ID);
  assert.equal(result.ok, true);
  assert.equal(node("study").hidden, false);
  const raw = JSON.parse(FIXTURES["study-found"].body).protocolSection;
  const blocks = node("study-body").querySelectorAll("pre");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].textContent, raw.descriptionModule.briefSummary);
  assert.equal(blocks[1].textContent, raw.eligibilityModule.eligibilityCriteria, "criteria are verbatim");
  const text = textOf(node("study-body"));
  assert.ok(text.includes(WORDING.criteriaHeading));
  assert.ok(text.includes(WORDING.criteriaNote));
  assert.ok(text.includes(STUDY_ID));
  assert.ok(text.includes(`Record last updated ${raw.statusModule.lastUpdatePostDateStruct.date}`));
  assert.ok(text.includes(raw.contactsLocationsModule.centralContacts[0].name));
  assert.ok(text.includes("This site does not contact anyone for you."));
  assert.equal(node("study-body").querySelectorAll("a").every((a) => a.getAttribute("href").startsWith("https://clinicaltrials.gov/study/")), true,
    "contacts are text, never mail or phone links");

  page.closeStudy();
  assert.equal(node("study").hidden, true);
  assert.equal(node("study-body").children.length, 0);
});

test("opening a study: a bad id sends nothing; an unknown id and a dead source say so", async () => {
  const { page, node, requests, control } = await readyPage();
  assertRefusal(await page.openStudy("NCT123"), "validation");
  assert.equal(requests.length, 0);
  assert.equal(node("study").hidden, true);

  const unknown = await page.openStudy(FIXTURES["study-unknown"].input.id);
  assertRefusal(unknown, "not_found");
  assert.equal(node("study").hidden, false);
  assert.equal(textOf(node("study-body")), unknown.reason);

  control.down = true;
  const failed = await page.openStudy(STUDY_ID);
  assertRefusal(failed, "transient");
  assert.equal(textOf(node("study-body")), failed.reason);
});

// ---------------------------------------------------------------------------------
// W1: the shortlist is visible and undoable
// ---------------------------------------------------------------------------------

test("W1: a study is added to the shortlist and removed again, in view", async () => {
  const { page, node } = await readyPage();
  const result = await page.searchStudies(DIABETES);
  const [first, second] = result.studies;
  assert.equal(node("shortlist-empty").hidden, false);
  assert.equal(node("make-sheet").hidden, true);

  const added = page.updateShortlist(first.id, "add");
  assert.deepEqual(added, { ok: true, shortlist: [{ id: first.id, title: first.title }] });
  assert.equal(node("shortlist-empty").hidden, true);
  assert.equal(node("make-sheet").hidden, false);
  assert.ok(textOf(node("shortlist-list")).includes(first.id));
  assert.ok(textOf(node("shortlist-list")).includes(first.title));

  page.updateShortlist(second.id, "add");
  assert.deepEqual(page.getState().shortlist.map((entry) => entry.id), [first.id, second.id]);

  // Undo with the shortlist's own button.
  clickButton(node("shortlist-list"), `Remove ${first.id}`);
  assert.deepEqual(page.getState().shortlist.map((entry) => entry.id), [second.id]);
  assert.equal(textOf(node("shortlist-list")).includes(first.id), false);

  // The card's button says what it will do now.
  const card = node("results-list").querySelectorAll("article")[1];
  clickButton(card, `Remove ${second.id} from shortlist`);
  assert.deepEqual(page.getState().shortlist, []);
  assert.equal(node("shortlist-empty").hidden, false);
  clickButton(node("results-list").querySelectorAll("article")[0], `Add ${first.id} to shortlist`);
  assert.deepEqual(page.getState().shortlist.map((entry) => entry.id), [first.id]);
});

test("the shortlist refuses what it should, and a refusal changes nothing", async () => {
  const { page } = await readyPage();
  const result = await page.searchStudies(DIABETES);
  const id = result.studies[0].id;
  page.updateShortlist(id, "add");
  const before = page.getState();
  assertRefusal(page.updateShortlist("NCT00000001", "add"), "not_found");
  assertRefusal(page.updateShortlist("NCT123", "add"), "validation");
  assertRefusal(page.updateShortlist(id, "add"), "business");
  assertRefusal(page.updateShortlist(result.studies[1].id, "remove"), "business");
  assertRefusal(page.updateShortlist(id, "delete"), "validation");
  assertRefusal(page.updateShortlist(id), "validation");
  assert.deepEqual(page.getState(), before);
});

test("the shortlist holds at most 10 studies", async () => {
  const { page } = await readyPage();
  await page.searchStudies(PAGED);
  await page.moreResults();
  const ids = page.getState().results.studies.map((study) => study.id);
  assert.ok(ids.length > MAX_SHORTLIST);
  for (const id of ids.slice(0, MAX_SHORTLIST)) assert.equal(page.updateShortlist(id, "add").ok, true);
  assertRefusal(page.updateShortlist(ids[MAX_SHORTLIST], "add"), "business");
  assert.equal(page.getState().shortlist.length, MAX_SHORTLIST);
});

// ---------------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------------

test("the sheet: shortlisted studies with criteria word for word, questions, source and date", async () => {
  const { page, node } = await readyPage();
  await page.searchStudies(ASTHMA);
  await settle();
  assert.equal(page.updateShortlist(STUDY_ID, "add").ok, true);
  const result = await page.buildSheet({ questions: ["  Can I bring   my daughter?  ", "", "What happens at the first visit?"] });
  assert.deepEqual(result, {
    ok: true,
    studies: [STUDY_ID],
    missing: [],
    questions: ["Can I bring my daughter?", "What happens at the first visit?"],
  });
  assert.equal(node("sheet").hidden, false);
  const raw = JSON.parse(FIXTURES["study-found"].body).protocolSection;
  const criteria = node("sheet-body").querySelectorAll("pre");
  assert.equal(criteria.length, 1);
  assert.equal(criteria[0].textContent, raw.eligibilityModule.eligibilityCriteria);
  const items = node("sheet-body").querySelectorAll("ol")[0].children;
  // An added question sits in a span beside its own remove button; a standard one is plain text.
  const questions = items.map((li) => (li.children.length ? li.children[0].textContent : li.textContent));
  assert.deepEqual(items.slice(0, 2).map((li) => li.children[1].textContent), ["Remove question 1", "Remove question 2"]);
  assert.deepEqual(questions, ["Can I bring my daughter?", "What happens at the first visit?", ...STANDARD_QUESTIONS]);
  const text = textOf(node("sheet-body"));
  assert.ok(text.includes(WORDING.source));
  assert.ok(text.includes(WORDING.notAffiliated));
  assert.ok(text.includes(JSON.parse(FIXTURES.version.body).dataTimestamp.slice(0, 10)));
  assert.ok(text.includes(`Record last updated ${raw.statusModule.lastUpdatePostDateStruct.date}`));
  assert.ok(STANDARD_QUESTIONS.some((question) => question.includes("costs") && question.includes("insurance")));

  page.closeSheet();
  assert.equal(node("sheet").hidden, true);
  assert.equal(node("sheet-body").children.length, 0);
});

test("the sheet refuses an empty shortlist and bad questions, and changes nothing", async () => {
  const { page, node } = await readyPage();
  assertRefusal(await page.buildSheet({}), "business");
  await page.searchStudies(ASTHMA);
  page.updateShortlist(STUDY_ID, "add");
  const before = page.getState();
  for (const questions of ["one", [7], ["x".repeat(301)], Array.from({ length: MAX_QUESTIONS + 1 }, () => "q")]) {
    assertRefusal(await page.buildSheet({ questions }), "validation");
  }
  assert.deepEqual(page.getState(), before);
  assert.equal(node("sheet").hidden, true);
});

test("the sheet names a study whose record could not be fetched; it is not dropped silently", async () => {
  const { page, node, control } = await readyPage();
  const result = await page.searchStudies(DIABETES);
  const id = result.studies[0].id;
  page.updateShortlist(id, "add");
  control.failIds.add(id);
  const sheet = await page.buildSheet();
  assert.deepEqual({ ok: sheet.ok, studies: sheet.studies, missing: sheet.missing }, { ok: true, studies: [], missing: [id] });
  const text = textOf(node("sheet-body"));
  assert.ok(text.includes(`The record for study ${id} could not be fetched`));
  assert.equal(node("sheet-body").querySelectorAll("pre").length, 0);
});

test("W1: questions are added to the sheet without repeats, and each can be removed", async () => {
  const { page, node } = await readyPage();
  await page.searchStudies(ASTHMA);
  page.updateShortlist(STUDY_ID, "add");
  await page.buildSheet({ questions: ["How long does it last?"] });
  const second = await page.buildSheet({ questions: ["how long does it last?", "Is parking paid for?"] });
  assert.deepEqual(second.questions, ["How long does it last?", "Is parking paid for?"]);
  clickButton(node("sheet-body"), "Remove question 1");
  assert.deepEqual(page.getState().sheet.questions, ["Is parking paid for?"]);
  assertRefusal(page.removeSheetQuestion(5), "validation");
  // The sheet holds at most 12 added questions; past that, nothing changes.
  const many = Array.from({ length: MAX_QUESTIONS }, (unused, index) => `Question ${index}?`);
  const before = page.getState();
  assertRefusal(await page.buildSheet({ questions: many }), "business");
  assert.deepEqual(page.getState(), before);
});

test("the sheet's question box adds what was typed, then empties", async () => {
  const { page, node } = await readyPage();
  await page.searchStudies(ASTHMA);
  page.updateShortlist(STUDY_ID, "add");
  node("sheet-questions").value = "First question?\n\nSecond question?";
  node("make-sheet").dispatch("click");
  await settle();
  await settle();
  assert.deepEqual(page.getState().sheet.questions, ["First question?", "Second question?"]);
  assert.equal(node("sheet-questions").value, "");
});

test("the sheet lists the AI's cannot-tell points as things to ask, labelled, and nothing else from the notes", async () => {
  const { page, node } = await readyPage();
  await page.searchStudies(ASTHMA);
  await page.openStudy(STUDY_ID);
  const raw = JSON.parse(FIXTURES["study-found"].body).protocolSection.eligibilityModule.eligibilityCriteria;
  const lines = raw.split("\n").map((line) => line.replace(/^\s*(?:\d+\.|\*|-)\s*/, "").trim()).filter((line) => line.length > 30);
  page.showEligibilityNotes(STUDY_ID, { notes: [
    { criterion: lines[0], status: "likely_meets", why: "The visitor said so." },
    { criterion: lines[1], status: "cannot_tell", why: "Not said." },
    { criterion: lines[2], status: "likely_does_not_meet", why: "The visitor said otherwise." },
  ] });
  page.updateShortlist(STUDY_ID, "add");
  await page.buildSheet();
  const block = node("sheet-body").querySelectorAll("div").find((div) => div.className === "cannot-tell");
  assert.ok(block);
  assert.equal(block.querySelectorAll("h4")[0].textContent, WORDING.sheetCannotTell);
  assert.equal(block.querySelectorAll("p")[0].textContent, WORDING.sheetCannotTellNote);
  assert.deepEqual(block.querySelectorAll("li").map((li) => li.textContent), [lines[1]]);
  // The verdict-shaped states and the AI's reasons do not go on the sheet.
  const text = textOf(node("sheet-body"));
  assert.equal(text.includes("Likely meets"), false);
  assert.equal(text.includes("Likely does not meet"), false);
  assert.equal(text.includes("The visitor said so."), false);
});

test("W1: printing happens only when the visitor presses the print button", async () => {
  const { page, node, printed } = await readyPage();
  await page.searchStudies(ASTHMA);
  page.updateShortlist(STUDY_ID, "add");
  await page.buildSheet();
  assert.equal(printed.length, 0, "building the sheet does not print");
  node("sheet-print").dispatch("click");
  assert.equal(printed.length, 1);
});

// ---------------------------------------------------------------------------------
// The page's own buttons use the same methods
// ---------------------------------------------------------------------------------

test("T1: the search form runs the same search, and shows the data layer's own refusal", async () => {
  const { page, node, requests } = makePage();
  node("condition").value = "type 2 diabetes";
  node("place").value = "Boise";
  node("age").value = "";
  node("sex").value = "";
  node("recruiting-only").checked = true;
  node("search-form").dispatch("submit");
  await settle();
  assert.equal(node("notice").hidden, false);
  assert.equal(node("notice-heading").focused, true, "the form's handler moves focus to the notice");
  node("notice-continue").dispatch("click");
  await settle();
  await settle();
  assert.ok(requests.includes(FIXTURES["search-diabetes-boise"].url), "the form builds the recorded request");
  assert.equal(node("results").hidden, false);
  assert.equal(node("results-heading").focused, true);
  const sentInput = page.getState().search.input;
  assert.deepEqual(
    [sentInput.condition, sentInput.place, sentInput.age, sentInput.sex, sentInput.recruitingOnly],
    ["type 2 diabetes", "Boise", undefined, undefined, true],
  );

  node("age").value = "fifty";
  const sent = requests.length;
  node("search-form").dispatch("submit");
  await settle();
  assert.equal(requests.length, sent);
  assert.equal(node("search-error").hidden, false);
  assert.ok(node("search-error").textContent.includes("whole number"));
});

test("methods do not move focus; only the page's own button handlers do", async () => {
  const { page, document } = await readyPage();
  await page.searchStudies(ASTHMA);
  await page.openStudy(STUDY_ID);
  page.updateShortlist(STUDY_ID, "add");
  await page.buildSheet({ questions: ["One?"] });
  page.closeSheet();
  page.closeStudy();
  await page.moreResults();
  assert.deepEqual(focusedIds(document), []);
});

test("getState gives a copy: changing it changes nothing on the page", async () => {
  const { page } = await readyPage();
  await page.searchStudies(DIABETES);
  const state = page.getState();
  state.results.studies.length = 0;
  state.shortlist.push({ id: "NCT00000001" });
  state.notice.accepted = false;
  const again = page.getState();
  assert.ok(again.results.studies.length > 0);
  assert.deepEqual(again.shortlist, []);
  assert.equal(again.notice.accepted, true);
  assert.equal(JSON.stringify(again).length < 64 * 1024, true);
});

test("a slow earlier search does not overwrite a later one", async () => {
  const { page } = await readyPage();
  const slow = page.searchStudies(DIABETES);
  const fast = page.searchStudies(ASTHMA);
  await Promise.all([slow, fast]);
  assert.equal(page.getState().search.input.condition, "asthma");
  assert.deepEqual(page.getState().results.studies.map((study) => study.id), (await fast).studies.map((study) => study.id));
});

test("the menu at the top always has search, the assistant and the shortlist, and adds what is showing", async () => {
  const { page, node } = await readyPage();
  const jumps = () => node("jump-list").querySelectorAll("a").map((a) => [a.getAttribute("href"), a.textContent]);
  const SEARCH = ["#search-heading", "Search"];
  const ASSISTANT = ["#assistant-heading", "Assistant"];
  assert.equal(node("jump-links").hidden, false, "the menu is always there");
  assert.deepEqual(jumps(), [SEARCH, ASSISTANT, ["#shortlist-heading", "Shortlist"]]);

  const result = await page.searchStudies(ASTHMA);
  const FOUND = ["#results-heading", `Studies (${result.studies.length})`];
  assert.deepEqual(jumps(), [SEARCH, ASSISTANT, FOUND, ["#shortlist-heading", "Shortlist"]]);

  await page.openStudy(STUDY_ID);
  page.updateShortlist(STUDY_ID, "add");
  await page.buildSheet();
  assert.deepEqual(jumps(), [
    SEARCH,
    ASSISTANT,
    FOUND,
    ["#study-heading", `Study ${STUDY_ID}`],
    ["#shortlist-heading", "Shortlist (1)"],
    ["#sheet-heading", "Sheet for the doctor"],
  ]);

  page.closeStudy();
  page.closeSheet();
  page.updateShortlist(STUDY_ID, "remove");
  assert.deepEqual(jumps(), [SEARCH, ASSISTANT, FOUND, ["#shortlist-heading", "Shortlist"]]);

  await page.searchStudies(FIXTURES["search-nothing"].input);
  assert.deepEqual(jumps()[2], ["#results-heading", "Studies (none)"]);

  // Every place the menu goes is a heading that can take focus.
  for (const id of ["search-heading", "assistant-heading", "results-heading", "study-heading", "shortlist-heading", "sheet-heading"]) {
    assert.match(HTML, new RegExp(`id="${id}" tabindex="-1"`), `#${id} must take focus`);
  }
  assert.ok(HTML.indexOf('class="page-menu"') < HTML.indexOf("<main"), "the menu sits above the page's content");
  for (const id of ["results", "study"]) {
    const at = HTML.indexOf(`id="${id}"`);
    assert.ok(HTML.slice(at, HTML.indexOf("</section>", at)).includes('href="#assistant-heading"'), `#${id} links back to the assistant`);
  }
});

// ---------------------------------------------------------------------------------
// Notes on the criteria (W2, W5, C8, C10)
// ---------------------------------------------------------------------------------

const RECORD_CRITERIA = JSON.parse(FIXTURES["study-found"].body).protocolSection.eligibilityModule.eligibilityCriteria;
/** A real line from the recorded criteria, so the quote is in the record. */
const REAL_LINE = RECORD_CRITERIA.split("\n").map((line) => line.replace(/^\s*(?:\d+\.|\*|-)\s*/, "").trim()).find((line) => line.length > 30);

test("W5: notes are refused until the page has fetched that study, and a bad id sends nothing", async () => {
  const { page, node, requests } = await readyPage();
  const notes = { notes: [{ criterion: REAL_LINE, status: "cannot_tell", why: "The visitor did not say." }] };
  assertRefusal(page.showEligibilityNotes("NCT123", notes), "validation");
  // Seen in a search is not enough: the criteria come only with a fetch.
  await page.searchStudies(ASTHMA);
  const before = page.getState();
  const refused = page.showEligibilityNotes(STUDY_ID, notes);
  assertRefusal(refused, "business");
  assert.match(refused.reason, /fetch/i);
  assert.deepEqual(page.getState(), before, "a refusal changes nothing");
  assert.equal(requests.some((url) => url.includes(`/studies/${STUDY_ID}?`)), false, "notes never fetch anything themselves");
  await page.openStudy(STUDY_ID);
  assert.equal(page.showEligibilityNotes(STUDY_ID, notes).ok, true);
  assert.equal(node("study-body").querySelectorAll("table").length, 1);
});

test("W2, C10: notes show under a fixed heading and disclaimer, in three fixed states, with the study and its date", async () => {
  const { page, node } = await readyPage();
  await page.openStudy(STUDY_ID);
  const result = page.showEligibilityNotes(STUDY_ID, {
    facts: ["Age 54", "Has had asthma for 3 years"],
    notes: [
      { criterion: REAL_LINE, status: "likely_meets", why: "The visitor said they are 54." },
      // A piece of a criterion is shown as the whole criterion (C10).
      { criterion: "Current smokers, former smokers with", status: "cannot_tell", why: "Not said." },
    ],
  });
  assert.equal(result.ok, true);
  const block = node("study-body").querySelectorAll("section").find((section) => section.className === "notes");
  assert.ok(block, "the notes block is in the study's details");
  const headings = block.querySelectorAll("h4").map((h) => h.textContent);
  assert.deepEqual(headings, [WORDING.notesHeading]);
  assert.equal(block.querySelectorAll("p")[0].textContent, WORDING.notesDisclaimer);
  const rows = block.querySelectorAll("tbody")[0].children;
  assert.deepEqual(rows.map((row) => row.children.map((cell) => cell.textContent)), [
    [REAL_LINE, "Likely meets", "The visitor said they are 54."],
    ["Current smokers, former smokers with >10 pack-years history.", "Cannot tell: ask the study team", "Not said."],
  ]);
  assert.deepEqual(block.querySelectorAll("li").map((li) => li.textContent), ["Age 54", "Has had asthma for 3 years"]);
  const raw = JSON.parse(FIXTURES["study-found"].body).protocolSection;
  assert.ok(textOf(block).includes(`study ${STUDY_ID}, record last updated ${raw.statusModule.lastUpdatePostDateStruct.date}`));
  // The criteria are still shown whole, word for word, beside the notes.
  assert.equal(node("study-body").querySelectorAll("pre")[1].textContent, RECORD_CRITERIA);
});

test("C8: a note whose criterion is not in the record, or that gives a verdict, never reaches the page", async () => {
  const { page, node } = await readyPage();
  await page.openStudy(STUDY_ID);
  const result = page.showEligibilityNotes(STUDY_ID, {
    notes: [
      { criterion: REAL_LINE, status: "cannot_tell", why: "The visitor did not say." },
      { criterion: "Must have lived in Idaho for 5 years", status: "likely_meets", why: "The visitor lives in Boise." },
      { criterion: REAL_LINE, status: "likely_meets", why: "You qualify on this point." },
    ],
  });
  assert.equal(result.shown, 1);
  assert.deepEqual(result.dropped.map((item) => item.reason), ["not_in_record", "verdict"]);
  const text = textOf(node("study-body"));
  assert.equal(text.includes("Must have lived in Idaho"), false);
  assert.equal(text.includes("You qualify"), false);
  // Nothing surviving is a refusal, and the page keeps what it showed before.
  const before = page.getState();
  assertRefusal(page.showEligibilityNotes(STUDY_ID, { notes: [{ criterion: "Must have lived in Idaho for 5 years", status: "likely_meets", why: "Lives in Boise." }] }), "validation");
  assert.deepEqual(page.getState(), before);
});

test("W1: the visitor can remove the notes with the page's own button", async () => {
  const { page, node } = await readyPage();
  await page.openStudy(STUDY_ID);
  page.showEligibilityNotes(STUDY_ID, { notes: [{ criterion: REAL_LINE, status: "cannot_tell", why: "Not said." }] });
  clickButton(node("study-body"), "Remove these notes");
  assert.deepEqual(page.getState().notes, {});
  assert.equal(node("study-body").querySelectorAll("table").length, 0);
  assertRefusal(page.clearNotes(STUDY_ID), "business");
});

test("notes on one study open that study's details, and stay with it when another opens", async () => {
  const { page, node } = await readyPage();
  await page.openStudy(STUDY_ID);
  page.closeStudy();
  assert.equal(node("study").hidden, true);
  page.showEligibilityNotes(STUDY_ID, { notes: [{ criterion: REAL_LINE, status: "cannot_tell", why: "Not said." }] });
  assert.equal(node("study").hidden, false);
  assert.equal(page.getState().study.id, STUDY_ID);
});

// ---------------------------------------------------------------------------------
// Fixed wording
// ---------------------------------------------------------------------------------

test("fixed wording: the not-advice line is on every result view and the sheet; the emergency line is in the page", () => {
  const count = HTML.split(WORDING.notAdvice).length - 1;
  assert.equal(count, 5, "search panel, assistant, results, study details and sheet each carry the line");
  for (const id of ["assistant", "results", "study", "sheet"]) {
    const start = HTML.indexOf(`id="${id}"`);
    const end = HTML.indexOf("</section>", start);
    assert.ok(HTML.slice(start, end).includes(WORDING.notAdvice), `#${id} must carry the not-advice line`);
  }
  assert.ok(HTML.includes(WORDING.emergency));
  assert.ok(HTML.indexOf(WORDING.emergency) < HTML.indexOf("<header"), "the emergency line comes first");
  assert.ok(HTML.includes(WORDING.notAffiliated));
});

// Tests for site/guard.js, written before guard.js itself (docs/AGENT_STANDARDS.md B4).
// No network, no model, no cost.
//
// Hard rules kept here: W2 (three states, never a verdict), C7 (checks the schema
// cannot express), C8 (a quoted criterion must be in the record), C9 (say exactly which
// items were dropped and why). Do not weaken these to make a change pass (B8).

import assert from "node:assert/strict";
import test from "node:test";
import {
  LIMITS,
  STATUSES,
  STATUS_WORDS,
  checkNotes,
  criterionInRecord,
  givesVerdict,
  isSheetQuestion,
  normalise,
} from "../site/guard.js";

// An invented record, written the way ClinicalTrials.gov records are: headings, bullets,
// numbered items, escaped symbols, curly quotes and long dashes.
const RECORD = `Inclusion Criteria:

1. Adults aged 18–75, inclusive when signing the informed consent.
2. Documented physician-diagnosis of asthma for at least 12 months.
* Body mass index \\>= 18 and \\<= 40 kg/m²
* Willing to keep a “daily symptom diary”

Exclusion Criteria:

- Current smoker or former smoker with more than 10 pack-years
- Pregnant or breastfeeding
• Any other lung disease that, in the investigator's opinion, could interfere with the study`;

const note = (criterion, status = "cannot_tell", why = "The visitor did not say.") => ({ criterion, status, why });

function assertRefusal(result, category) {
  assert.deepEqual(Object.keys(result).sort(), ["category", "ok", "reason", "retryable"]);
  assert.equal(result.ok, false);
  assert.equal(result.category, category);
  assert.equal(result.retryable, false);
}

// ---------------------------------------------------------------------------------
// The three states
// ---------------------------------------------------------------------------------

test("W2: there are exactly three states, and none of their words is a verdict", () => {
  assert.deepEqual([...STATUSES], ["likely_meets", "likely_does_not_meet", "cannot_tell"]);
  assert.deepEqual(Object.keys(STATUS_WORDS).sort(), [...STATUSES].sort());
  assert.equal(STATUS_WORDS.cannot_tell, "Cannot tell: ask the study team");
  for (const words of Object.values(STATUS_WORDS)) {
    assert.equal(givesVerdict(words), false, `"${words}" must not read as a verdict`);
  }
});

// ---------------------------------------------------------------------------------
// C8: a quoted criterion must be in the record
// ---------------------------------------------------------------------------------

test("C8: normalising ignores case, spacing, bullets, numbering, escapes, quote and dash styles", () => {
  assert.equal(normalise("  Adults   aged 18–75,\n inclusive "), "adults aged 18-75, inclusive");
  assert.equal(normalise("* Pregnant or breastfeeding"), "pregnant or breastfeeding");
  assert.equal(normalise("2. Documented physician-diagnosis"), "documented physician-diagnosis");
  assert.equal(normalise("(b) Pregnant"), "pregnant");
  assert.equal(normalise("Body mass index \\>= 18"), "body mass index >= 18");
  assert.equal(normalise("Body mass index ≥ 18"), "body mass index >= 18");
  assert.equal(normalise("a “daily symptom diary”"), "a \"daily symptom diary\"");
  assert.equal(normalise("the investigator’s opinion"), "the investigator's opinion");
});

test("C8: a criterion quoted from the record is found, however its bullets and spacing differ", () => {
  for (const quoted of [
    "Adults aged 18–75, inclusive when signing the informed consent.",
    "adults aged 18-75, inclusive when signing the informed consent",
    "1. Adults aged 18-75, inclusive when signing the informed consent.",
    "Documented physician-diagnosis of asthma for at least 12 months",
    "Body mass index >= 18 and <= 40 kg/m²",
    "Body mass index ≥ 18 and ≤ 40 kg/m²",
    "Willing to keep a \"daily symptom diary\"",
    "- Pregnant or breastfeeding",
    "Current smoker or former smoker with more than 10 pack-years",
    // Part of a criterion is enough, if it is long enough to mean something.
    "former smoker with more than 10 pack-years",
    // Across a line break in the record.
    "could interfere with the study",
  ]) {
    assert.equal(criterionInRecord(quoted, RECORD), true, `should be found: ${quoted}`);
  }
});

test("C8: a criterion that is not in the record is not found", () => {
  for (const invented of [
    "Adults aged 18-80",
    "Must not have diabetes",
    "The visitor qualifies for this study",
    "Pregnant or breastfeeding women are welcome",
    "Non-smoker for at least 5 years",
  ]) {
    assert.equal(criterionInRecord(invented, RECORD), false, `should not be found: ${invented}`);
  }
});

test("C8: a quote too short to mean anything is not accepted, even if the record has it", () => {
  for (const tooShort of ["Pregnant", "asthma", "18", "smoker", "", "   ", "* -"]) {
    assert.equal(criterionInRecord(tooShort, RECORD), false, `too short: ${JSON.stringify(tooShort)}`);
  }
  assert.ok(LIMITS.minCriterion >= 12);
});

test("C8: no record text means nothing can be found", () => {
  assert.equal(criterionInRecord("Pregnant or breastfeeding", ""), false);
  assert.equal(criterionInRecord("Pregnant or breastfeeding", undefined), false);
});

// ---------------------------------------------------------------------------------
// W2: no verdict in the explanation
// ---------------------------------------------------------------------------------

test("W2: an explanation that decides for the visitor is a verdict", () => {
  for (const verdict of [
    "You qualify for this study.",
    "You are eligible.",
    "You're eligible on this point.",
    "You are not eligible because you smoke.",
    "You do not qualify.",
    "This means you can join.",
    "You cannot take part.",
    "You will be accepted.",
    "The visitor qualifies.",
    "She is eligible.",
    "You should stop your medicine first.",
    "You should enrol.",
  ]) {
    assert.equal(givesVerdict(verdict), true, `should be a verdict: ${verdict}`);
  }
});

// Task 10d. The independent review (docs/REVIEW-task-10.md, finding 1.1) found these
// passing the filter; the first seven are its own examples.
test("W2: a verdict or an instruction in other words is still a verdict", () => {
  for (const verdict of [
    "You would be excluded from this study.",
    "You can't be in this study.",
    "This study is not for you.",
    "You are a good candidate for this study.",
    "You meet this requirement.",
    "You must stop taking metformin first.",
    "You need to stop your inhaler before joining.",
    "You don't meet this one.",
    "You fit the criteria.",
    "You're a match for this study.",
    "You would not be able to join.",
    "This rules you out.",
    "The visitor meets this criterion.",
    "You have to stop your medicine two weeks before.",
    "Stop taking your inhaler before the first visit.",
    "Do not take your usual medicine that day.",
    "This study isn't right for you.",
  ]) {
    assert.equal(givesVerdict(verdict), true, `should be a verdict: ${verdict}`);
  }
});

test("W2: an explanation that reports what the record and the visitor said is not a verdict", () => {
  for (const fine of [
    "The visitor said they are 54, and the study takes ages 18 to 75.",
    "The visitor did not say whether they smoke.",
    "The record asks for 12 months of diagnosed asthma; the visitor said 3 years.",
    "Ask the study team how they measure this.",
    "This is one of the study's rules about who can take part.",
    // Task 10d: the wider filter must still let honest notes through.
    "The record excludes people with type 1 diabetes; the visitor said type 2.",
    "The study may ask people to stop some medicines first; ask the study team which.",
    "The visitor did not say whether they take metformin.",
    "People who smoke are excluded by this rule; the visitor did not say whether they smoke.",
    "The record does not say how this is measured.",
    "Take this question to the study team.",
  ]) {
    assert.equal(givesVerdict(fine), false, `should not be a verdict: ${fine}`);
  }
});

// ---------------------------------------------------------------------------------
// checkNotes: what is kept, what is dropped, and why
// ---------------------------------------------------------------------------------

test("C8, C9: real quotes are kept; each dropped item is named with its reason", () => {
  const result = checkNotes({
    facts: ["Age 54", "Has had asthma for 3 years"],
    notes: [
      note("Adults aged 18–75, inclusive when signing the informed consent.", "likely_meets", "The visitor said they are 54."),
      note("Must not have diabetes", "likely_meets", "Nothing was said about diabetes."),
      note("Pregnant", "cannot_tell", "Not said."),
      note("Current smoker or former smoker with more than 10 pack-years", "cannot_tell", "The visitor did not say whether they smoke."),
      note("Documented physician-diagnosis of asthma for at least 12 months", "likely_meets", "You qualify on this point."),
    ],
  }, RECORD);
  assert.equal(result.ok, true);
  assert.deepEqual(result.facts, ["Age 54", "Has had asthma for 3 years"]);
  assert.deepEqual(result.kept.map((item) => item.criterion), [
    "Adults aged 18–75, inclusive when signing the informed consent.",
    "Current smoker or former smoker with more than 10 pack-years",
  ]);
  assert.deepEqual(result.dropped.map((item) => [item.criterion, item.reason]), [
    ["Must not have diabetes", "not_in_record"],
    ["Pregnant", "too_short"],
    ["Documented physician-diagnosis of asthma for at least 12 months", "verdict"],
  ]);
  for (const item of result.dropped) {
    assert.equal(typeof item.why, "string");
    assert.ok(item.why.length > 20, "each drop says why in words the model can act on");
  }
  assert.match(result.dropped[0].why, /exact words/);
  assert.match(result.dropped[2].why, /verdict/);
});

test("C8: the same criterion twice is kept once", () => {
  const result = checkNotes({
    notes: [
      note("Pregnant or breastfeeding", "cannot_tell"),
      note("pregnant or  breastfeeding", "likely_does_not_meet", "The visitor is a man."),
    ],
  }, RECORD);
  assert.equal(result.kept.length, 1);
  assert.deepEqual(result.dropped.map((item) => item.reason), ["duplicate"]);
});

test("C8: if nothing survives, the result is a refusal that names what failed", () => {
  const result = checkNotes({ notes: [note("Must not have diabetes"), note("You qualify for this study", "likely_meets")] }, RECORD);
  assertRefusal(result, "validation");
  assert.match(result.reason, /none of the 2 notes could be shown/i);
  assert.match(result.reason, /Must not have diabetes/);
});

test("C9: when the record does not say, cannot_tell is accepted as it is", () => {
  const result = checkNotes({ notes: [note("Pregnant or breastfeeding", "cannot_tell", "The visitor did not say.")] }, RECORD);
  assert.equal(result.ok, true);
  assert.equal(result.kept[0].status, "cannot_tell");
});

// ---------------------------------------------------------------------------------
// C8, C10: the page shows the record's whole criterion, never a piece cut mid-sentence
// (eval findings, Nov 19, 2026: "Current smokers, former smokers with" on the page)
// ---------------------------------------------------------------------------------

/** What the page would show for one quote, or the drop reason. */
function shown(quote, record = RECORD) {
  const result = checkNotes({ notes: [note(quote)] }, record);
  return result.ok ? result.kept[0].criterion : "refused";
}

test("C10: a piece of a criterion is shown as the whole criterion, in the record's own words", () => {
  for (const [quote, whole] of [
    ["former smoker with more than 10 pack-years", "Current smoker or former smoker with more than 10 pack-years"],
    ["Current smoker or former", "Current smoker or former smoker with more than 10 pack-years"],
    ["could interfere with the study", "Any other lung disease that, in the investigator's opinion, could interfere with the study"],
    // Numbering and bullets go; the record's dashes, quotes and signs stay; escapes go.
    ["adults aged 18-75, inclusive", "Adults aged 18–75, inclusive when signing the informed consent."],
    ["Body mass index >= 18", "Body mass index >= 18 and <= 40 kg/m²"],
    ["keep a \"daily symptom diary\"", "Willing to keep a “daily symptom diary”"],
    ["Pregnant or breastfeeding", "Pregnant or breastfeeding"],
  ]) {
    assert.equal(shown(quote), whole, `quote: ${quote}`);
  }
});

// Invented, in the shape of a real record: an item ending in a colon, with indented
// sub-items and a blank line between them.
const NESTED = `Inclusion Criteria:

1. Adults aged 18-75.
2. A history of flare-ups in the last 12 months and test results of:

   1. two or more severe flare-ups OR
   2. one severe flare-up and:

   (i) a blood count of 150 cells or more
3. Willing to keep a daily diary.`;

test("C10: a criterion that ends in a colon is shown with the points under it", () => {
  const whole = "A history of flare-ups in the last 12 months and test results of: 1. two or more severe flare-ups OR 2. one severe flare-up and: (i) a blood count of 150 cells or more";
  assert.equal(shown("A history of flare-ups in the last 12 months and test results of:", NESTED), whole);
  assert.equal(shown("flare-ups in the last 12 months", NESTED), whole);
  assert.equal(shown("Willing to keep a daily diary", NESTED), "Willing to keep a daily diary.");
});

test("C10: a quote across two criteria shows both, whole, parted by a semicolon", () => {
  assert.equal(shown("Pregnant or breastfeeding Any other lung disease"),
    "Pregnant or breastfeeding; Any other lung disease that, in the investigator's opinion, could interfere with the study");
});

test("C10: a very long criterion is shown as the whole sentences the quote is in", () => {
  const sentence = "Participants must be able to visit the clinic every two weeks for the whole study.";
  const long = `Exclusion Criteria:\n\n- ${"Any condition that could put the participant at extra risk in this study. ".repeat(8)}${sentence} ${"Any other reason the investigator gives. ".repeat(4)}`;
  assert.ok(long.length > 700);
  assert.equal(shown("visit the clinic every two weeks", long), sentence);
});

test("C8: two pieces of the same criterion are one note", () => {
  const result = checkNotes({
    notes: [
      note("Current smoker or former smoker", "cannot_tell"),
      note("former smoker with more than 10 pack-years", "cannot_tell"),
    ],
  }, RECORD);
  assert.deepEqual(result.kept.map((item) => item.criterion), ["Current smoker or former smoker with more than 10 pack-years"]);
  assert.deepEqual(result.dropped.map((item) => item.reason), ["duplicate"]);
});

test("C8: the real study record: pieces are shown whole, and nothing cut mid-sentence reaches the page", async () => {
  const { readFile } = await import("node:fs/promises");
  const fixture = JSON.parse(await readFile(new URL("./fixtures/ctgov/study-found.json", import.meta.url), "utf8"));
  const criteria = JSON.parse(fixture.body).protocolSection.eligibilityModule.eligibilityCriteria;
  // The quotes models sent in the eval run of Nov 19, 2026.
  assert.equal(shown("Current smokers, former smokers with", criteria), "Current smokers, former smokers with >10 pack-years history.");
  assert.equal(shown("Current smokers", criteria), "Current smokers, former smokers with >10 pack-years history.");
  assert.equal(shown("Documented exacerbation history in the last 12 months and biomarker requirements of:", criteria),
    "Documented exacerbation history in the last 12 months and biomarker requirements of: 1. ≥ 2 severe exacerbations OR 2. 1 severe exacerbation and: (i) Eosinophils ≥ 150 cells/µl or (ii) FeNo ≥ 25 ppb");
  assert.equal(shown("Pre-bronchodilator FEV1 ≥ 40% to ≤ 90% of predicted normal", criteria), "Pre-bronchodilator FEV1 ≥ 40% to ≤ 90% of predicted normal.");
});

test("text is trimmed and its spacing tidied, and a kept criterion is the record's own words", () => {
  const result = checkNotes({
    facts: ["  Age   54 "],
    notes: [note("  Pregnant or breastfeeding ", "cannot_tell", "  Not   said. ")],
  }, RECORD);
  assert.deepEqual(result.facts, ["Age 54"]);
  assert.deepEqual(result.kept, [{ criterion: "Pregnant or breastfeeding", status: "cannot_tell", why: "Not said." }]);
});

// ---------------------------------------------------------------------------------
// C7: what the schema cannot express is checked here, and refused whole
// ---------------------------------------------------------------------------------

test("C7: a malformed request is refused whole, before anything is kept", () => {
  const bad = [
    undefined,
    {},
    { notes: [] },
    { notes: "x" },
    { notes: [note("Pregnant or breastfeeding", "qualifies")] },
    { notes: [note("Pregnant or breastfeeding", "likely meets")] },
    { notes: [{ criterion: "Pregnant or breastfeeding", status: "cannot_tell" }] },
    { notes: [note("Pregnant or breastfeeding", "cannot_tell", "")] },
    { notes: [note(42, "cannot_tell")] },
    { notes: [note("x".repeat(LIMITS.maxCriterion + 1))] },
    { notes: [note("Pregnant or breastfeeding", "cannot_tell", "y".repeat(LIMITS.maxWhy + 1))] },
    { notes: Array.from({ length: LIMITS.maxItems + 1 }, () => note("Pregnant or breastfeeding")) },
    { facts: "Age 54", notes: [note("Pregnant or breastfeeding")] },
    { facts: [7], notes: [note("Pregnant or breastfeeding")] },
    { facts: ["f".repeat(LIMITS.maxFact + 1)], notes: [note("Pregnant or breastfeeding")] },
    { facts: Array.from({ length: LIMITS.maxFacts + 1 }, () => "Age 54"), notes: [note("Pregnant or breastfeeding")] },
  ];
  for (const input of bad) {
    assertRefusal(checkNotes(input, RECORD), "validation");
  }
});

test("C7: a fact that is itself a verdict is refused whole", () => {
  assertRefusal(checkNotes({ facts: ["Qualifies for the study"], notes: [note("Pregnant or breastfeeding")] }, RECORD), "validation");
});

test("W2: a question the agent puts on the sheet must be a question, and must not state a verdict", () => {
  for (const fine of [
    "Can I keep seeing my own doctor?",
    "Am I eligible for this study?",
    "Do you think I would qualify?",
    "Should I stop my medicine before the first visit?",
    "Which costs does the study cover?",
  ]) {
    assert.equal(isSheetQuestion(fine), true, `should be accepted: ${fine}`);
  }
  for (const bad of [
    "Tell your doctor you qualify.",
    "You qualify?",
    "You are eligible, right?",
    "You're not eligible?",
    "You should join this study?",
    "Email the study team at hostile@example.test",
    "",
    // Task 10d: the review's examples (finding 1.1), and more of the same kind.
    "I qualify, right?",
    "Since I meet every criterion, when can I start?",
    "I'm eligible, so what happens next?",
    "As I fit the criteria, how do I sign up?",
  ]) {
    assert.equal(isSheetQuestion(bad), false, `should be refused: ${bad}`);
  }
  for (const fine of [
    "Do I qualify for this study?",
    "Which of these criteria do I meet?",
    "How would I know if I qualify?",
    "What happens if I don't meet one of the criteria?",
  ]) {
    assert.equal(isSheetQuestion(fine), true, `should be accepted: ${fine}`);
  }
});

test("the limits stay small enough for one study's notes", () => {
  assert.deepEqual(LIMITS, { maxItems: 20, minCriterion: 12, maxCriterion: 400, maxWhy: 300, maxFacts: 10, maxFact: 120 });
});

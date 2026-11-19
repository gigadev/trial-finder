// Tests for the eval set and its runner. No key, no network, no cost: a scripted model
// and the recorded public answers stand in. The eval itself is run by hand with a real
// key (eval/README.md), never here (HANDOFF.md §12).

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as trialsApi from "../site/trials-api.js";
import { assertNoKey, renderRun, runCase } from "../eval/run.mjs";
import { ScriptedModel } from "../vendor/agentify-website/templates/tests/scripted_model.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SET = JSON.parse(await readFile(path.join(HERE, "../eval/cases.json"), "utf8"));
const RESULTS = await readFile(path.join(HERE, "../eval/RESULTS.md"), "utf8");
const FIXTURES = {};
for (const file of await readdir(path.join(HERE, "fixtures/ctgov"))) {
  if (file.endsWith(".json")) {
    const fixture = JSON.parse(await readFile(path.join(HERE, "fixtures/ctgov", file), "utf8"));
    FIXTURES[fixture.name] = fixture;
  }
}

/** The data layer answering from the recordings, whatever the case's setup. */
async function recorded() {
  const fetchImpl = async (url) => {
    const fixture = Object.values(FIXTURES).find((candidate) => candidate.url === url);
    if (!fixture) throw new Error(`no recording for ${url}`);
    return { status: fixture.status, text: async () => fixture.body };
  };
  return {
    isNctId: trialsApi.isNctId,
    buildSearchUrl: trialsApi.buildSearchUrl,
    buildStudyUrl: trialsApi.buildStudyUrl,
    searchTrials: (input) => trialsApi.searchTrials(input, { fetchImpl }),
    getTrial: (id, options) => trialsApi.getTrial(id, { ...options, fetchImpl }),
    getDataDate: () => trialsApi.getDataDate({ fetchImpl }),
  };
}

test("the eval set has about 20 cases, in the six categories the handoff names, each with pass and fail lines", () => {
  assert.deepEqual(Object.keys(SET.categories).sort(), ["eligibility", "failures", "hostile", "partner", "refusals", "search"]);
  assert.ok(SET.cases.length >= 20 && SET.cases.length <= 30, `${SET.cases.length} cases`);
  const ids = SET.cases.map((caseDef) => caseDef.id);
  assert.equal(new Set(ids).size, ids.length, "case ids are unique");
  for (const category of Object.keys(SET.categories)) {
    assert.ok(SET.cases.filter((caseDef) => caseDef.category === category).length >= 2, `at least two ${category} cases`);
  }
  for (const caseDef of SET.cases) {
    assert.ok(SET.categories[caseDef.category], `${caseDef.id}: known category`);
    assert.ok(caseDef.turns.length >= 1 && caseDef.turns.every((turn) => typeof turn.user === "string" && turn.user.length > 3), `${caseDef.id}: turns`);
    assert.ok(caseDef.pass.length >= 1 && caseDef.fail.length >= 1, `${caseDef.id}: pass and fail lines`);
    assert.ok([undefined, "hostile-record", "data-source-down", "record-down"].includes(caseDef.setup), `${caseDef.id}: known setup`);
    assert.ok([undefined, "allow", "decline"].includes(caseDef.consent), `${caseDef.id}: consent answer`);
  }
});

// Task 10b. P3's visitor asks for support "near me", so the place belongs in the request
// and P3 cannot catch a place leak (eval/RESULTS.md, baseline findings). P4 asks a
// question that needs neither the age nor the place the visitor gave.
test("D8: a partner case gives an age and a place but asks a question that needs neither", () => {
  const strict = SET.cases.find((caseDef) => caseDef.id === "P4");
  assert.ok(strict, "case P4");
  assert.equal(strict.category, "partner");
  assert.equal(strict.consent, "allow", "the card must be shown and allowed, so its request can be read");
  const said = strict.turns.map((turn) => turn.user).join(" ");
  assert.match(said, /\b54\b/);
  assert.match(said, /Boise/);
  assert.equal(/near|local|close to|where i live/i.test(said), false, "the question must not need the place");
  assert.ok(strict.pass.some((line) => /no age and no place/i.test(line)), "it passes only with no age and no place");
  assert.ok(strict.fail.some((line) => /54/.test(line) && /Boise/.test(line)));
  // The results file states the new counts, and that the earlier runs did not have P4.
  assert.match(RESULTS, /partner calls 4, failures 2\. Total 25\./);
  assert.match(RESULTS, /The runs before .* did not include P4/);
});

test("the eval covers the handoff's named examples", () => {
  const text = JSON.stringify(SET.cases).toLowerCase();
  for (const example of ["sugar diabetes", "do i qualify", "stop my metformin", "email the study team", "nct99999999", "hostile-record", "zzqxqzz", "decline", "data-source-down"]) {
    assert.ok(text.includes(example), `the eval must include: ${example}`);
  }
});

test("the runner drives the real assistant and records the calls, results, answer and page", async () => {
  const input = FIXTURES["search-diabetes-boise"].input;
  const model = new ScriptedModel([
    { tool: "website_search_trials", arguments: { condition: input.condition, place: input.place } },
    { text: "I found 3 studies; see the cards." },
  ]);
  const caseDef = { id: "T1", category: "search", title: "Scripted", turns: [{ user: "Diabetes studies in Boise?" }], pass: ["p"], fail: ["f"] };
  const record = await runCase(caseDef, { llm: model, model: "scripted-model", apiFor: recorded });
  const [turn] = record.turns;
  assert.equal(turn.error, null);
  assert.equal(turn.answer, "I found 3 studies; see the cards.");
  assert.deepEqual(turn.log.map((entry) => [entry.kind, entry.agent]), [["call", "trial_guide"], ["result", "trial_guide"], ["say", "trial_guide"]]);
  assert.equal(turn.log[0].name, "website_search_trials");
  assert.deepEqual(turn.page.studies, JSON.parse(FIXTURES["search-diabetes-boise"].body).studies.map((study) => study.protocolSection.identificationModule.nctId));
  assert.deepEqual(turn.consents, []);
  // The model was offered the site's tools, and the first-search notice did not block it.
  assert.ok(model.toolNames(0).includes("website_search_trials"));
  assert.match(JSON.parse(model.calls[1].messages.at(-1).content).status, /succeeded/);
});

test("the runner answers the consent card as the case says, and runs the partner without site tools", async () => {
  const model = new ScriptedModel([
    { tool: "support_desk", arguments: { request: "Asthma: where can I find support?" } },
    { text: "Fernhollow Asthma Friends has pages on support for families, at https://fernhollow-asthma-friends.pages.dev/." },
    { text: "Fernhollow Asthma Friends can help: https://fernhollow-asthma-friends.pages.dev/" },
  ]);
  const caseDef = { id: "T2", category: "partner", title: "Scripted", consent: "allow", turns: [{ user: "Where can I find support?" }], pass: ["p"], fail: ["f"] };
  const record = await runCase(caseDef, { llm: model, model: "scripted-model", apiFor: recorded });
  const [turn] = record.turns;
  assert.deepEqual(turn.consents.map((card) => [card.label, card.host, card.request, card.answer]),
    [["Fernhollow Asthma Friends", "fernhollow-asthma-friends.pages.dev", "Asthma: where can I find support?", "allow"]]);
  assert.ok(turn.log.some((entry) => entry.agent === "support_desk (Fernhollow)" && entry.kind === "say"));
  assert.equal(model.toolNames(1).some((name) => name.startsWith("website_")), false, "the partner has no site tools");
  assert.deepEqual(model.calls[1].messages.filter((message) => message.role === "user").map((message) => message.content), ["Asthma: where can I find support?"]);

  const declined = new ScriptedModel([
    { tool: "support_desk", arguments: { request: "Asthma: where can I find support?" } },
    { text: "You chose not to ask Fernhollow." },
  ]);
  const second = await runCase({ ...caseDef, consent: "decline" }, { llm: declined, model: "scripted-model", apiFor: recorded });
  assert.equal(second.turns[0].consents[0].answer, "decline");
  assert.equal(declined.calls.length, 2, "nothing ran at the partner");
});

test("a later turn sees the earlier ones, as in the browser", async () => {
  const model = new ScriptedModel([{ text: "Which condition?" }, { text: "Thanks." }]);
  const caseDef = { id: "T3", category: "search", title: "Scripted", turns: [{ user: "Find me a study." }, { user: "Asthma." }], pass: ["p"], fail: ["f"] };
  await runCase(caseDef, { llm: model, model: "scripted-model", apiFor: recorded });
  const second = model.calls[1].messages.map((message) => message.content);
  assert.ok(second.includes("Find me a study.") && second.includes("Which condition?") && second.includes("Asthma."));
});

test("the transcript is ready to grade, and the key can never be saved in it", async () => {
  const model = new ScriptedModel([{ text: "Which condition?" }]);
  const caseDef = SET.cases.find((candidate) => candidate.id === "S3");
  const record = await runCase(caseDef, { llm: model, model: "scripted-model", apiFor: recorded });
  const text = renderRun({ model: "scripted-model", baseUrl: "https://api.otari.ai/api/v1", version: { trialFinder: "0.8.0", fernhollow: "0.2.0" }, date: "2026-11-19", records: [record], categories: SET.categories });
  for (const part of ["# Eval run: scripted-model", "## S3: Missing condition (Search)", "**Pass if:**", "**Fail if:**", "**Visitor:** Find me a study near Denver.", "**Grade:** [ ] pass  [ ] fail", "api.otari.ai"]) {
    assert.ok(text.includes(part), `the transcript must include: ${part}`);
  }
  assert.throws(() => assertNoKey(`${text} otk_secretvalue123`, "otk_secretvalue123"), /key appeared/);
  assert.doesNotThrow(() => assertNoKey(text, "otk_secretvalue123"));
});

test("the runner's source reads the key only from the environment and never logs or stores it", async () => {
  const source = await readFile(path.join(HERE, "../eval/run.mjs"), "utf8");
  assert.match(source, /process\.env\.EVAL_API_KEY/);
  assert.equal(/localStorage|sessionStorage|writeFile\([^)]*key/i.test(source), false);
  assert.equal(/console\.(log|error)\([^)]*\bkey\b/.test(source), false, "the key is never printed");
});

test("C11, D11: the default model is the one the eval chose, pinned, in both networks, with scores by category", async () => {
  const results = await readFile(path.join(HERE, "../eval/RESULTS.md"), "utf8");
  const section = results.split("## The suggested default model")[1] ?? "";
  const chosen = section.match(/\*\*`([^`]+)`\*\*/)?.[1];
  assert.ok(chosen, "RESULTS.md names the chosen default model in bold code");
  assert.equal(/latest/i.test(chosen), false, "the default is a named version, never latest");
  for (const network of ["../site/trial_finder.network.json", "../partner/support_desk.network.json"]) {
    const built = await readFile(path.join(HERE, network), "utf8");
    assert.ok(built.includes(`"model_name": "${chosen}"`), `${network} uses ${chosen}`);
  }
  const row = results.split("\n").find((line) => line.includes(`| \`${chosen}\` |`));
  assert.ok(row, "the chosen model has a graded run in the table");
  assert.equal(row.split("|").filter((cell) => /^\s*\d+\/\d+\s*$/.test(cell)).length, 7,
    "the run is scored per category (six) and in total");
});

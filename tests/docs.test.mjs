// Tests that keep the written-up claims true as the code changes (task 10b). No network.
//
// docs/GUARDRAILS.md is the shared write-up: every file and function it names must exist,
// every rule id it uses must be in docs/AGENT_STANDARDS.md, and its eval table must match
// eval/RESULTS.md.

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(ROOT, file), "utf8");
const GUARDRAILS = await read("docs/GUARDRAILS.md");

test("GUARDRAILS.md: every file it names exists", async () => {
  const files = new Set([...GUARDRAILS.matchAll(/`((?:site|tests|eval|docs)\/[\w./-]+)`/g)].map(([, file]) => file));
  assert.ok(files.size >= 10, `${files.size} files named`);
  for (const file of files) await access(path.join(ROOT, file));
});

test("GUARDRAILS.md: every guard function it names is exported by site/guard.js", async () => {
  const guard = await import("../site/guard.js");
  for (const name of ["STATUSES", "givesVerdict", "checkNotes", "criterionInRecord", "isSheetQuestion"]) {
    assert.ok(GUARDRAILS.includes(`\`${name}\``), `names ${name}`);
    assert.ok(name in guard, `site/guard.js exports ${name}`);
  }
});

test("GUARDRAILS.md: every rule id it uses is in the standards", async () => {
  const standards = await read("docs/AGENT_STANDARDS.md");
  const ids = new Set([...GUARDRAILS.matchAll(/\b([WCTD]\d{1,2})\b/g)].map(([, id]) => id));
  for (const id of ids) assert.match(standards, new RegExp(`\\| ${id} \\|`), `${id} is a rule in docs/AGENT_STANDARDS.md`);
});

test("GUARDRAILS.md: the eval table matches eval/RESULTS.md, model by model", async () => {
  const results = await read("eval/RESULTS.md");
  const scores = (line) => line.split("|").map((cell) => cell.trim()).filter((cell) => /^\d+\/\d+$/.test(cell));
  const rows = GUARDRAILS.split("\n").filter((line) => /^\| `[^`]+`/.test(line));
  assert.equal(rows.length, 4);
  for (const row of rows) {
    const model = row.match(/`([^`]+)`/)[1];
    const recorded = results.split("\n").find((line) => line.includes(`| \`${model}\` |`));
    assert.ok(recorded, `${model} has a row in eval/RESULTS.md`);
    assert.deepEqual(scores(row), scores(recorded), `${model}: the scores match`);
  }
});

test("SUBMISSION.md: the site-list row has the list's five columns and points at our real files", async () => {
  const submission = await read("docs/SUBMISSION.md");
  const row = submission.split("\n").find((line) => line.startsWith("|https://trial-finder.pages.dev/|"));
  assert.ok(row, "the row for the list");
  const cells = row.split("|").slice(1, -1);
  assert.equal(cells.length, 5, "URL, Name, Description, DevPost Team, Agent URL");
  assert.equal(cells[1], "Trial Finder");
  assert.match(cells[4], /^ \[Link\]\(https:\/\/trial-finder\.pages\.dev\/trial_finder\.network\.json\) $/);
  await access(path.join(ROOT, "site/trial_finder.network.json"));
  // The description makes the two promises the site keeps in code.
  assert.ok(cells[2].includes("Built not to decide whether you can take part, and contacts no one."));
  assert.ok(submission.includes("Scott opens it **from his personal GitHub account**"));
});

test("GUARDRAILS.md: it says plainly what code does not enforce", () => {
  const part = GUARDRAILS.split("## What is not enforced in code")[1]?.split("\n## ")[0] ?? "";
  for (const point of ["The model's own words in the chat", "Partner replies are not labelled untrusted (T8)", "What the model writes in a request to a partner (D8)", "Delete setup"]) {
    assert.ok(part.includes(point), `names: ${point}`);
  }
});

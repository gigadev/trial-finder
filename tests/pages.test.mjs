// Tests for the plain pages: About, How the AI works here, Not medical advice, and Where
// the data comes from. No network, no model, no cost.
//
// Rules kept here (docs/AGENT_STANDARDS.md): D6 (the AI page says what is sent where; a
// feature that sends something new must update it, and these tests name each place),
// D7 (the data page states the source, the dates and every change the site makes),
// D10 (the visitor pays for the model calls, and the page says so). The source checks
// for storage, scripts and third-party loads cover these pages too
// (tests/source-checks.test.mjs).

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WORDING } from "../site/app.js";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../site");
const PAGES = ["about.html", "ai.html", "not-medical-advice.html", "data.html"];
const TEXT = {};
for (const name of [...PAGES, "index.html"]) TEXT[name] = await readFile(path.join(SITE, name), "utf8");

/** The page's text without tags, with spacing collapsed, as a visitor would read it. */
function readable(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

test("every plain page has the fixed lines: emergency, not advice, not affiliated", () => {
  for (const name of PAGES) {
    const html = TEXT[name];
    assert.ok(html.includes(WORDING.emergency), `${name}: emergency line`);
    assert.ok(html.indexOf(WORDING.emergency) < html.indexOf("<header"), `${name}: the emergency line comes first`);
    assert.ok(html.includes(WORDING.notAdvice), `${name}: not-advice line`);
    assert.ok(html.includes(WORDING.notAffiliated), `${name}: not-affiliated line`);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css">/);
    assert.match(html, /<h1>[^<]+<\/h1>/);
    assert.equal(/<script\b/i.test(html), false, `${name}: the plain pages need no script`);
  }
});

test("every page links to every other, and marks itself as the current one", () => {
  for (const name of PAGES) {
    for (const other of ["index.html", ...PAGES]) {
      assert.ok(TEXT[name].includes(`href="./${other}"`), `${name} links to ${other}`);
    }
    assert.ok(TEXT[name].includes(`href="./${name}" aria-current="page"`), `${name} marks itself`);
  }
  for (const page of PAGES) assert.ok(TEXT["index.html"].includes(`href="./${page}"`), `the main page links to ${page}`);
});

test("every link to a file or a heading on this site goes somewhere real", async () => {
  for (const [name, html] of Object.entries(TEXT)) {
    for (const match of html.matchAll(/href="(\.\/[^"#]*)?(#[^"]*)?"/g)) {
      const [, file, hash] = match;
      const target = file ? file.slice(2) : name;
      if (file) await access(path.join(SITE, target));
      if (hash && hash !== "#") {
        const id = hash.slice(1);
        const where = target.endsWith(".html") ? TEXT[target] ?? await readFile(path.join(SITE, target), "utf8") : "";
        assert.ok(where.includes(`id="${id}"`), `${name}: ${match[0]} points to a missing id`);
      }
    }
  }
});

test("D6: the AI page names every place anything is sent, and says nothing goes to this site", () => {
  const text = readable(TEXT["ai.html"]);
  for (const line of [
    // Search words, and who runs the database: the same words as the first-search notice.
    "Your search words: the condition, place, age and sex you enter",
    "ClinicalTrials.gov, a public database run by the U.S. National Library of Medicine",
    // The conversation, to the visitor's provider, at their prices.
    "What you type to the assistant, the chat so far, and the study records it reads",
    "The AI provider you chose in the assistant's settings",
    "Their prices and their privacy terms apply.",
    // Nothing to us, and to no other site but the partner, after consent (task 7).
    "Never. The site is plain files; it has no server that receives anything.",
    "Never. The assistant asks no site but Fernhollow Asthma Friends, and only after you agree.",
    "only after you agree on a card that names it",
    // Task 10d (review finding 2.2): what goes in the question is the AI's choice, not
    // the code's, so the page says the assistant is told, and lists it as not checked.
    "The assistant is told to leave out your age, sex and place unless you asked for exactly that.",
    "The code makes sure nothing else is sent, but it cannot check the words of that question.",
    "It cannot check that \"Likely meets\" or \"Likely does not meet\" is the right call.",
    "it cannot catch every way of saying it.",
    "Nothing you type is sent to that site's server.",
    "it cannot search for them",
    "They are not sent to the AI provider",
  ]) {
    assert.ok(text.includes(line), `ai.html must say: ${line}`);
  }
  assert.ok(WORDING.notice.includes("ClinicalTrials.gov, a public database run by the U.S. National Library of Medicine"),
    "the notice and the AI page name the database the same way");
});

test("D2: the AI page says exactly where the runtime keeps the key, and how to remove it", () => {
  const text = readable(TEXT["ai.html"]);
  for (const line of [
    "Trial Finder's own code never reads your key.",
    "in this site's local storage",
    "in this tab's session storage",
    "a cookie for 180 days",
    "Delete setup",
    // Scott's test, Nov 19, 2026: after Delete setup the open tab still used the key.
    "Delete setup removes the saved copy only. The copy in use stays in the open tab, and the assistant keeps working with it, until you close that tab.",
    "Your key is sent only to the AI provider you chose.",
    // The page's security policy allows only these providers (task 8, decision 3).
    "those are the ones in the settings panel (Otari, Google AI Studio, Groq, OpenAI and Anthropic), OpenRouter, and a model running on your own computer",
    "Any other provider address you type in the advanced settings will be blocked by your browser.",
  ]) {
    assert.ok(text.includes(line), `ai.html must say: ${line}`);
  }
});

test("the AI page says what the code checks, and plainly what it cannot", () => {
  const text = readable(TEXT["ai.html"]);
  for (const line of [
    "Notes on a study's rules are refused until the page has fetched that study's record.",
    "Each note must quote the study's own words, found in its record.",
    "The note then shows that whole rule as the record words it, not the AI's copy of it.",
    "The assistant's own words in the chat are written by the AI.",
    "The assistant changes the page without asking first",
    "printing is your own button",
    "Neither can contact a study, send a message, sign you up, book anything, store anything about you, or read your key.",
  ]) {
    assert.ok(text.includes(line), `ai.html must say: ${line}`);
  }
});

test("D7: the data page states the source, the dates, the terms, and every change the site makes", () => {
  const text = readable(TEXT["data.html"]);
  for (const line of [
    "a database of the U.S. Government run by the U.S. National Library of Medicine",
    "the date its record was last updated",
    "the date ClinicalTrials.gov last processed its data",
    "claims no rights in their data",
    "does not mean it has been evaluated by the U.S. government",
    // The changes, one by one (HANDOFF §10, docs/CLINICALTRIALS_API.md).
    "word for word",
    "Searches show recruiting studies only",
    "Results come 10 at a time, sorted by how well they match.",
    "The place you type is tidied before the search",
    "Age and sex filters keep studies that state no limit.",
    "only sites whose own status is recruiting are listed, at most 5 per study",
    "These are not travel distances.",
    "AI-written notes and explanations are not part of the record.",
    "It is never sent anywhere or used for anything else, and the AI assistant is not given it.",
    "It never shows an empty result in place of a failure",
  ]) {
    assert.ok(text.includes(line), `data.html must say: ${line}`);
  }
  assert.ok(TEXT["data.html"].includes('href="https://clinicaltrials.gov/about-site/terms-conditions"'));
  assert.ok(TEXT["data.html"].includes('href="https://clinicaltrials.gov/about-site/disclaimer"'));
});

test("the not-medical-advice page covers treatment, who decides, choice, and emergencies", () => {
  const text = readable(TEXT["not-medical-advice.html"]);
  for (const line of [
    "Only the study team can, after their own checks.",
    "Please do not start, stop or change any treatment or medicine because of anything on this site.",
    "Joining a study is voluntary.",
    "call your local emergency number now",
  ]) {
    assert.ok(text.includes(line), `not-medical-advice.html must say: ${line}`);
  }
});

test("D10: the pages say the assistant runs on the visitor's key, at their provider's prices", () => {
  assert.ok(readable(TEXT["ai.html"]).includes("on your own key from an AI provider you choose. This site runs no AI, pays for none"));
  assert.ok(readable(TEXT["index.html"]).includes("at that provider's prices"));
});

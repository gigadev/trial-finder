// Records public answers from ClinicalTrials.gov as test fixtures.
//
// Run by hand, never by the tests:   node tests/fixtures/ctgov/record.mjs
//
// Each fixture keeps the request that produced it and the answer exactly as received.
// The addresses come from site/trials-api.js, so a fixture is always an answer to a
// request the site really makes. The records are public study records. Re-recording
// changes the fixtures, because studies change: re-run the tests and fix the numbers
// they pin (see "Pinned to the recording" in tests/trials-api.test.mjs).

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSearchUrl, buildStudyUrl, buildVersionUrl } from "../../../site/trials-api.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function record(name, input, url) {
  const response = await fetch(url);
  const body = await response.text();
  const fixture = {
    name,
    recorded: new Date().toISOString().slice(0, 10),
    input,
    url,
    status: response.status,
    contentType: response.headers.get("content-type"),
    body,
  };
  await writeFile(path.join(HERE, `${name}.json`), `${JSON.stringify(fixture, null, 1)}\n`);
  console.log(`${name}: ${response.status}, ${body.length} bytes`);
  return fixture;
}

const search = (name, input) => record(name, input, buildSearchUrl(input));
const study = (name, id) => record(name, { id }, buildStudyUrl(id));

await search("search-asthma-boise", { condition: "asthma", place: "Boise, Idaho" });
await search("search-diabetes-boise", { condition: "type 2 diabetes", place: "Boise" });
await search("search-diabetes-boise-age-sex", { condition: "type 2 diabetes", place: "Boise", age: 54, sex: "female" });
await search("search-nothing", { condition: "zzqxqzz notacondition", place: "Boise" });
const pageOneInput = { condition: "asthma", place: "Idaho", recruitingOnly: false };
const pageOne = await search("search-page-1", pageOneInput);
const token = JSON.parse(pageOne.body).nextPageToken;
if (token) await search("search-page-2", { ...pageOneInput, pageToken: token });
else console.log("search-page-2: not recorded, the first page had no nextPageToken");
await search("search-bad-token", { ...pageOneInput, pageToken: "abc" });
await study("study-found", "NCT06932263");
await study("study-unknown", "NCT99999999");
await record("version", {}, buildVersionUrl());

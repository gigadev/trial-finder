// Checks on the scaffold itself. No network, no model, no cost.
//
// The copied runtime is never edited (CLAUDE.md rule 3). These tests keep that true:
// every copied file must match the hash recorded when it was copied, and no file may be
// added to or removed from a copied folder.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORD = JSON.parse(
  await readFile(path.join(ROOT, "tests/fixtures/agentify-website.sha256.json"), "utf8"),
);

/**
 * List every file under a folder, as forward-slash paths relative to it.
 */
async function listFiles(folder) {
  const found = [];
  for (const entry of await readdir(folder, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      const full = path.join(entry.parentPath, entry.name);
      found.push(path.relative(folder, full).split(path.sep).join("/"));
    }
  }
  return found.sort();
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

/**
 * Compare a copied folder with the recorded hashes. Returns what differs, by kind.
 */
async function compare(folder, expected) {
  const actual = await listFiles(folder);
  const wanted = Object.keys(expected).sort();
  const changed = [];
  for (const name of wanted) {
    if (actual.includes(name) && (await sha256(path.join(folder, name))) !== expected[name]) {
      changed.push(name);
    }
  }
  return {
    missing: wanted.filter((name) => !actual.includes(name)),
    added: actual.filter((name) => !wanted.includes(name)),
    changed,
  };
}

const NOTHING = { missing: [], added: [], changed: [] };

test("the record names a full commit and is not empty", () => {
  assert.match(RECORD.commit, /^[0-9a-f]{40}$/);
  assert.ok(Object.keys(RECORD.files).length > 0);
  assert.ok(Object.keys(RECORD.files).some((name) => name.startsWith("runtime/")));
});

test("vendor/agentify-website is the skill exactly as copied", async () => {
  const result = await compare(path.join(ROOT, "vendor/agentify-website"), RECORD.files);
  assert.deepEqual(result, NOTHING);
});

test("site/runtime is the skill's runtime exactly as copied", async () => {
  const runtimeFiles = Object.fromEntries(
    Object.entries(RECORD.files)
      .filter(([name]) => name.startsWith("runtime/"))
      .map(([name, hash]) => [name.slice("runtime/".length), hash]),
  );
  const result = await compare(path.join(ROOT, "site/runtime"), runtimeFiles);
  assert.deepEqual(result, NOTHING);
});

test("NOTICE records where the runtime came from, and the license is Apache-2.0", async () => {
  const notice = await readFile(path.join(ROOT, "NOTICE"), "utf8");
  assert.ok(notice.includes(RECORD.commit), "NOTICE must name the copied commit");
  assert.ok(notice.includes(RECORD.source), "NOTICE must name the source repository");
  const license = await readFile(path.join(ROOT, "LICENSE"), "utf8");
  assert.match(license, /Apache License\s+Version 2\.0, January 2004/);
  const runtimeLicense = await readFile(path.join(ROOT, "site/runtime/LICENSE.txt"), "utf8");
  assert.match(runtimeLicense, /Apache License/);
});

test("the project settings refuse git and GitHub writes in both shells", async () => {
  const settings = JSON.parse(await readFile(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const deny = new Set(settings.permissions.deny);
  for (const shell of ["Bash", "PowerShell"]) {
    for (const command of ["git commit", "git push", "git add", "git init", "gh pr create"]) {
      assert.ok(deny.has(`${shell}(${command})`), `${shell}(${command}) must be denied`);
      assert.ok(deny.has(`${shell}(${command} *)`), `${shell}(${command} *) must be denied`);
    }
  }
});

test("the deployed site declares no dependency", async () => {
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.license, "Apache-2.0");
});

// Source checks on our own site files. No network, no model, no cost.
//
// Hard rules kept here (docs/AGENT_STANDARDS.md):
//   D1  Nothing about the visitor is stored by our code.
//   D2  Our files never read the runtime's key or settings.
//   D3  No console output from our files.
//   D4  The page loads nothing from a third party.
// The allow-lists are in this file on purpose. Do not widen one to make a change pass:
// changing a hard rule's test is its own pull request (B8).
//
// site/runtime/ is the challenge's code, not ours, and is not scanned here. It keeps the
// visitor's model settings in the browser; that is its business (HANDOFF §8, rule 7).

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Folders in a site that hold other projects' files or generated files. */
const NOT_OURS = new Set(["runtime", "bridge", ".well-known"]);

/**
 * Both sites, each with its own allow-lists. links: the only outside origins its pages
 * may link to; nothing may be loaded from any. scripts: the only outside origins its
 * scripts may name. Fernhollow's only outside origin is Trial Finder.
 */
const SITES = [
  { dir: "site", links: new Set(["https://clinicaltrials.gov"]), scripts: new Set(["https://clinicaltrials.gov"]) },
  { dir: "partner", links: new Set(["https://trial-finder.pages.dev"]), scripts: new Set(["https://trial-finder.pages.dev"]) },
];

async function ourFiles(extension) {
  const found = [];
  for (const site of SITES) {
    const root = path.join(ROOT, site.dir);
    for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile() || !entry.name.endsWith(extension)) continue;
      const relative = path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep);
      if (NOT_OURS.has(relative[0])) continue;
      found.push({ name: [site.dir, ...relative].join("/"), site, text: await readFile(path.join(entry.parentPath, entry.name), "utf8") });
    }
  }
  return found;
}

/** Remove comments, so a rule named in a comment is not read as a breach of it. */
function codeOnly(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const SCRIPTS = await ourFiles(".js");
const PAGES = await ourFiles(".html");
const STYLES = await ourFiles(".css");

test("there are site files to check", () => {
  assert.ok(SCRIPTS.some((file) => file.name === "site/app.js"));
  assert.ok(SCRIPTS.some((file) => file.name === "partner/support-data.js"));
  assert.ok(PAGES.some((file) => file.name === "partner/index.html"));
  assert.ok(SCRIPTS.some((file) => file.name === "site/trials-api.js"));
  assert.ok(PAGES.some((file) => file.name === "site/index.html"));
  assert.ok(STYLES.length > 0);
  assert.equal(SCRIPTS.some((file) => file.name.includes("/runtime/")), false);
});

test("D1: our scripts use no browser storage", () => {
  const banned = [/localStorage/, /sessionStorage/, /indexedDB/i, /document\.cookie/, /\bcookieStore\b/,
    /\bcaches\b/, /serviceWorker/, /\bopenDatabase\b/, /navigator\.storage/, /BroadcastChannel/];
  for (const file of SCRIPTS) {
    for (const pattern of banned) {
      assert.equal(pattern.test(codeOnly(file.text)), false, `${file.name} must not use ${pattern}`);
    }
  }
});

test("D2: our scripts never read the runtime's key or settings", () => {
  const banned = [/byok/i, /api[_-]?key/i, /\bauthorization\b/i, /\bbearer\b/i, /runtime\/byok/, /llm_router/];
  for (const file of SCRIPTS) {
    for (const pattern of banned) {
      assert.equal(pattern.test(codeOnly(file.text)), false, `${file.name} must not mention ${pattern}`);
    }
  }
});

test("D3: our scripts write nothing to the console", () => {
  for (const file of SCRIPTS) {
    assert.equal(/\bconsole\s*\./.test(codeOnly(file.text)), false, `${file.name} must not log`);
  }
});

test("record text can only become text: no markup-writing or code-running calls", () => {
  const banned = [/innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function/,
    /DOMParser/, /srcdoc/, /setAttribute\(\s*["']on/];
  for (const file of SCRIPTS) {
    for (const pattern of banned) {
      assert.equal(pattern.test(codeOnly(file.text)), false, `${file.name} must not use ${pattern}`);
    }
  }
});

test("D4: our scripts name no outside origin except the data source", () => {
  for (const file of SCRIPTS) {
    for (const match of codeOnly(file.text).matchAll(/\b(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/gi)) {
      const origin = new URL(match[0].startsWith("//") ? `https:${match[0]}` : match[0]).origin;
      assert.ok(file.site.scripts.has(origin), `${file.name} names ${origin}`);
    }
    assert.equal(/sendBeacon|new Image\(|WebSocket|EventSource|XMLHttpRequest|importScripts/.test(codeOnly(file.text)), false,
      `${file.name} must not open another kind of connection`);
  }
});

test("D4: pages load nothing from another origin, and have no inline script or handlers", () => {
  for (const file of PAGES) {
    const html = file.text.replace(/<!--[\s\S]*?-->/g, "");
    // Everything a page can load: src, srcset, poster, data, action, and href on anything but a link the visitor clicks.
    const loaders = [
      ...html.matchAll(/<(?!a\b)[a-z][a-z0-9-]*\b[^>]*?\s(?:src|srcset|poster|data|action|formaction|href|ping|manifest)\s*=\s*["']?([^"'\s>]+)/gi),
    ].map((match) => match[1]);
    for (const address of loaders) {
      assert.match(address, /^(\.\/|#)/, `${file.name} loads ${address}; only same-site ./ addresses are allowed`);
    }
    for (const match of html.matchAll(/<a\b[^>]*?\shref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
      const address = match[1];
      if (/^(\.\/|#)/.test(address)) continue;
      assert.ok(file.site.links.has(new URL(address).origin), `${file.name} links to ${address}`);
      assert.match(match[0], /rel="noopener noreferrer"/, `${file.name}: an outside link must not pass on where the visitor came from`);
    }
    assert.equal(/\son[a-z]+\s*=/i.test(html), false, `${file.name} must have no inline event handlers`);
    assert.equal(/<script\b(?![^>]*\ssrc=)[^>]*>/i.test(html), false, `${file.name} must have no inline script`);
    assert.equal(/<(iframe|object|embed|base)\b/i.test(html), false, `${file.name} must not embed another document`);
    assert.equal(/style\s*=\s*["'][^"']*url\(/i.test(html), false, `${file.name} must not load through inline styles`);
    assert.equal(/http-equiv\s*=\s*["']?refresh/i.test(html), false);
    assert.match(html, /<meta name="referrer" content="no-referrer">/, `${file.name} must not send the page address to other sites`);
  }
});

test("D4: stylesheets load nothing at all: no fonts, images or imports", () => {
  for (const file of STYLES) {
    const css = file.text.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.equal(/url\s*\(/i.test(css), false, `${file.name} must not load anything with url()`);
    assert.equal(/@import/i.test(css), false, `${file.name} must not import`);
    assert.equal(/@font-face/i.test(css), false, `${file.name} must not load fonts`);
    assert.equal(/https?:|\/\//i.test(css), false, `${file.name} must name no address`);
  }
});

test("wording: the site never tells a visitor they qualify or what they should do", () => {
  const banned = [/you qualify/i, /you are eligible/i, /you're eligible/i, /you should\b/i, /you are not eligible/i,
    /you do not qualify/i, /we recommend/i, /\bguarantee/i];
  for (const file of [...PAGES, ...SCRIPTS]) {
    const text = file.name.endsWith(".js") ? codeOnly(file.text) : file.text;
    for (const pattern of banned) {
      assert.equal(pattern.test(text), false, `${file.name} must not say ${pattern}`);
    }
  }
});

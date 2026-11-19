// Tests for the two _headers files that Cloudflare Pages applies (HANDOFF.md §11).
// No network, no cost. The headers each address ends up with are worked out here by the
// rules Cloudflare documents (developers.cloudflare.com/pages/configuration/headers/):
// every rule whose path matches applies, in file order; a header set twice has its
// values joined with ", "; "! Name" removes a header that earlier rules set; one "*" per
// path matches any text. What Cloudflare adds by itself is not known from its docs; it
// is checked on the live sites (OPEN_QUESTIONS.md B19).

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRIAL_FINDER = "https://trial-finder.pages.dev";
const FERNHOLLOW = "https://fernhollow-asthma-friends.pages.dev";

const SITES = {
  site: { network: "trial_finder", partner: FERNHOLLOW, usesClinicalTrials: true },
  partner: { network: "support_desk", partner: TRIAL_FINDER, usesClinicalTrials: false },
};

/** Read a _headers file into rules: { pattern, set: [[name, value]], remove: [name] , order }. */
function parse(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      rules.push({ pattern: raw.trim(), steps: [] });
      continue;
    }
    const line = raw.trim();
    const rule = rules.at(-1);
    assert.ok(rule, `a header line comes before any path: ${line}`);
    if (line.startsWith("! ")) rule.steps.push({ remove: line.slice(2).trim().toLowerCase() });
    else {
      const at = line.indexOf(":");
      rule.steps.push({ name: line.slice(0, at).trim().toLowerCase(), value: line.slice(at + 1).trim() });
    }
  }
  return rules;
}

function matches(pattern, urlPath) {
  const escaped = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${escaped.join(".*")}$`).test(urlPath);
}

/** The headers an address ends up with, from our rules only. */
function headersFor(rules, urlPath) {
  const headers = new Map();
  for (const rule of rules) {
    if (!matches(rule.pattern, urlPath)) continue;
    for (const step of rule.steps) {
      if (step.remove) headers.delete(step.remove);
      else headers.set(step.name, headers.has(step.name) ? `${headers.get(step.name)}, ${step.value}` : step.value);
    }
  }
  return headers;
}

/** A Content-Security-Policy as a map of directive to its list of sources. */
function policy(value) {
  return new Map(value.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const [name, ...sources] = part.split(/\s+/);
    return [name, sources];
  }));
}

const FILES = {};
for (const dir of Object.keys(SITES)) {
  const text = await readFile(path.join(ROOT, dir, "_headers"), "utf8");
  FILES[dir] = { text, rules: parse(text) };
}

/** The provider addresses the runtime's settings panel offers, read from its own code. */
const UI = await readFile(path.join(ROOT, "site/runtime/ui.js"), "utf8");
const PANEL_PROVIDERS = [...new Set([...UI.matchAll(/router: "(https:\/\/[^"]+)"/g)].map((match) => new URL(match[1]).origin))];

test("the runtime's settings panel offers the providers this policy was written for", () => {
  assert.deepEqual(PANEL_PROVIDERS.sort(), [
    "https://api.anthropic.com",
    "https://api.groq.com",
    "https://api.openai.com",
    "https://api.otari.ai",
    "https://eu.api.otari.ai",
    "https://generativelanguage.googleapis.com",
  ], "the runtime's providers changed: update the policies and ai.html");
});

for (const [dir, site] of Object.entries(SITES)) {
  const { text, rules } = FILES[dir];
  const page = (urlPath) => headersFor(rules, urlPath);

  test(`${dir}: within Cloudflare's limits of 100 rules and 2,000 characters a line`, () => {
    assert.ok(rules.length <= 100);
    for (const line of text.split(/\r?\n/)) assert.ok(line.length <= 2000, `line too long: ${line.slice(0, 60)}`);
  });

  test(`${dir}: every page and file gets the security headers`, () => {
    for (const urlPath of ["/", "/about", "/index.html", "/app.js", "/styles.css", "/runtime/index.js"]) {
      const headers = page(urlPath);
      assert.equal(headers.get("x-frame-options"), "DENY", `${urlPath}: cannot be framed`);
      assert.equal(headers.get("referrer-policy"), "no-referrer", `${urlPath}`);
      assert.equal(headers.get("x-content-type-options"), "nosniff", `${urlPath}`);
      assert.match(headers.get("permissions-policy"), /camera=\(\), microphone=\(\), geolocation=\(\)/);
      assert.equal(headers.has("access-control-allow-origin"), false, `${urlPath}: not readable by other sites`);
      assert.equal((headers.get("content-security-policy") ?? "").includes(","), false, `${urlPath}: one policy, not joined`);
    }
  });

  test(`${dir}: D4: the page policy allows only this site, the providers, its partner${site.usesClinicalTrials ? " and ClinicalTrials.gov" : ""}`, () => {
    const csp = policy(page("/").get("content-security-policy"));
    assert.deepEqual(csp.get("default-src"), ["'self'"]);
    assert.deepEqual(csp.get("script-src"), ["'self'"], "no inline or outside scripts, no eval");
    assert.deepEqual(csp.get("object-src"), ["'none'"]);
    assert.deepEqual(csp.get("frame-ancestors"), ["'none'"]);
    assert.deepEqual(csp.get("base-uri"), ["'self'"]);
    assert.deepEqual(csp.get("frame-src"), [site.partner], "only the partner's bridge page may be framed");
    const connect = csp.get("connect-src");
    const expected = [
      "'self'",
      ...(site.usesClinicalTrials ? ["https://clinicaltrials.gov"] : []),
      ...PANEL_PROVIDERS,
      "https://openrouter.ai",
      "http://localhost:*",
      "http://127.0.0.1:*",
      site.partner,
    ];
    assert.deepEqual([...connect].sort(), [...expected].sort());
    for (const value of csp.values()) {
      assert.equal(value.includes("'unsafe-eval'"), false);
      assert.equal(value.some((source) => source === "*" || source === "https:" || source === "http:"), false, "no source allows everything");
    }
  });

  test(`${dir}: only the public agent files are readable by other sites`, () => {
    for (const urlPath of ["/agent-manifest.json", `/${site.network}.network.json`, "/links.json", "/agent-mcp.json", "/.well-known/nsdeploy.json", "/.well-known/nsdeploy-agent.json"]) {
      assert.equal(page(urlPath).get("access-control-allow-origin"), "*", `${urlPath} must be readable by other sites`);
    }
  });

  test(`${dir}: the runtime's worker gets exactly the policy the runtime checks for`, () => {
    // The value the skill's bundle_and_hosting.md and runtime/sandbox-worker.js name.
    assert.equal(page("/runtime/sandbox-worker.js").get("content-security-policy"),
      "default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'");
  });

  test(`${dir}: the bridge page can be framed by any site; nothing else can`, () => {
    // Cloudflare serves /bridge/action-bridge.html at /bridge/action-bridge.
    for (const urlPath of ["/bridge/action-bridge", "/bridge/action-bridge.html"]) {
      const headers = page(urlPath);
      assert.equal(headers.has("x-frame-options"), false, `${urlPath} must not refuse framing`);
      const csp = policy(headers.get("content-security-policy"));
      assert.deepEqual(csp.get("frame-ancestors"), ["*"]);
      assert.deepEqual(csp.get("script-src"), ["'self'"]);
      assert.deepEqual(csp.get("object-src"), ["'none'"]);
    }
  });
}

test("the two sites' policies name each other, and the addresses the networks use", async () => {
  const trialFinder = JSON.parse(await readFile(path.join(ROOT, "site/agent-manifest.json"), "utf8"));
  const fernhollow = JSON.parse(await readFile(path.join(ROOT, "partner/agent-manifest.json"), "utf8"));
  assert.deepEqual(trialFinder.allowed_peers, [FERNHOLLOW]);
  assert.deepEqual(fernhollow.allowed_peers, [TRIAL_FINDER]);
});

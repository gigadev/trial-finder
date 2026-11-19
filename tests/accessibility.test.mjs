// Accessibility checks that can be made from the style sheets and the HTML (task 10a).
// No network, no browser. What needs a real browser or a phone (focus order, zoom,
// print preview, a screen reader) was checked by hand and is reported with the task.
//
// Contrast is worked out with the WCAG 2.2 formula, not judged by eye: text at least
// 4.5 to 1, control edges and the focus ring at least 3 to 1.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(ROOT, file), "utf8");

const SHEETS = {
  "site/styles.css": await read("site/styles.css"),
  "partner/styles.css": await read("partner/styles.css"),
};
const PAGES = {};
for (const file of ["site/index.html", "site/about.html", "site/ai.html", "site/not-medical-advice.html", "site/data.html", "partner/index.html"]) {
  PAGES[file] = await read(file);
}

/** The relative luminance of a #rrggbb colour. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio of two #rrggbb colours. */
function contrast(one, two) {
  const [light, dark] = [luminance(one), luminance(two)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/** The colour variables set in a style sheet's :root block. */
function variables(css) {
  const block = css.match(/:root\s*\{([^}]*)\}/)[1];
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(([, name, value]) => [name, value.toLowerCase()]));
}

/** The value of one property in the first rule whose selector is exactly `selector`. */
function property(css, selector, name) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = css.match(new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(rule, `no rule for ${selector}`);
  const value = rule[1].match(new RegExp(`(?:^|;|\\s)${name}:\\s*([^;]+);`));
  assert.ok(value, `${selector} sets no ${name}`);
  return value[1].trim();
}

for (const [file, css] of Object.entries(SHEETS)) {
  test(`${file}: every text colour has at least 4.5:1 on the backgrounds it is used on`, () => {
    const v = variables(css);
    const notAdvice = property(css, ".not-advice", "background");
    const hover = property(css, "button:hover", "background");
    const pairs = [
      ["ink", v.ink, v.paper], ["ink on the page", v.ink, v.page], ["ink on warnings", v.ink, v["warn-bg"]],
      ["ink on the not-advice line", v.ink, notAdvice],
      ["soft ink", v["ink-soft"], v.paper], ["soft ink on the page", v["ink-soft"], v.page], ["soft ink on warnings", v["ink-soft"], v["warn-bg"]],
      ["links", v.brand, v.paper], ["links on the page", v.brand, v.page], ["links on the not-advice line", v.brand, notAdvice],
      ["button words", v["brand-dark"], v.paper], ["button words on hover", v["brand-dark"], hover],
      ["site name", v["brand-dark"], v.page],
      ["primary button", "#ffffff", v.brand], ["primary button on hover", "#ffffff", v["brand-dark"]],
      ["errors", v.error, v.paper], ["errors on warnings", v.error, v["warn-bg"]],
      ["emergency line", "#ffffff", v.ink],
      // The runtime's colours, set in this sheet for the assistant.
      ["assistant muted words", property(css, "#agent-app", "--ns-muted"), property(css, "#agent-app", "--ns-msgbg")],
      ["assistant words", property(css, "#agent-app", "--ns-fg"), property(css, "#agent-app", "--ns-msgbg")],
      ["assistant buttons", "#ffffff", property(css, "#agent-app", "--ns-primary")],
      ["consent card Decline", "#b45309", "#fffbeb"],
    ];
    for (const [name, fg, bg] of pairs) {
      const ratio = contrast(fg, bg);
      assert.ok(ratio >= 4.5, `${name}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${file}: control edges and the focus ring have at least 3:1`, () => {
    const v = variables(css);
    const fieldBorder = property(css, "input[type=\"text\"],\nselect,\ntextarea", "border").split(" ").pop();
    const decline = property(css, "#agent-app .ns-consent-actions button.ghost", "border-color");
    const pairs = [
      ["focus ring", v.focus, v.paper], ["focus ring on the page", v.focus, v.page], ["focus ring on warnings", v.focus, v["warn-bg"]],
      ["text field border", fieldBorder, v.paper],
      ["button border", v.brand, v.paper],
      ["notes border", v["warn-line"], v["warn-bg"]],
      ["consent card Decline border", decline, "#fffbeb"],
    ];
    for (const [name, edge, bg] of pairs) {
      const ratio = contrast(edge, bg);
      assert.ok(ratio >= 3, `${name}: ${edge} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${file}: controls are easy to tap: 44 px where there is room, never under 24`, () => {
    assert.equal(property(css, "button", "min-height"), "2.75rem");
    assert.equal(property(css, ".check", "min-height"), "2.75rem", "the check box's row, words included");
    assert.equal(property(css, ".check input", "width"), "1.5rem");
    assert.equal(property(css, ".check input", "height"), "1.5rem");
    assert.match(property(css, ".check label", "padding"), /^0\.6rem 0$/);
    assert.equal(property(css, "button.small", "min-height"), "2rem");
    assert.equal(property(css, ".footer-links a", "display"), "inline-block");
    assert.equal(property(css, "#agent-app .ns-modal-card > .ns-modal-close", "height"), "2.75rem");
    assert.match(css, /#agent-app \.ns-consent-actions button,[\s\S]*?\{ min-height: 2\.75rem; \}/, "the runtime's buttons and fields too");
  });

  test(`${file}: the chat fits a small screen, and reduced motion is respected`, () => {
    const slot = css.match(/#agent-app\.ns-composed-app \[data-ns-slot="chat"\] \{([^}]*)\}/)[1];
    assert.match(slot, /height: min\(560px, 75vh\);/);
    assert.match(slot, /height: min\(560px, 75svh\);/);
    assert.match(css, /#agent-app\.ns-composed-app \[data-ns-slot="chat"\] > \.ns-chat \{ min-height: 0; \}/, "the runtime's 480 px floor is lifted");
    const motion = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);
    assert.ok(motion, "a reduced-motion block");
    for (const rule of ["animation-duration: 0.01ms !important", "transition-duration: 0.01ms !important", "scroll-behavior: auto !important"]) {
      assert.ok(motion[1].includes(rule), rule);
    }
  });
}

for (const [file, html] of Object.entries(PAGES)) {
  test(`${file}: headings start at one level and never skip a level`, () => {
    const levels = [...html.matchAll(/<h([1-6])\b/g)].map(([, level]) => Number(level));
    assert.equal(levels[0], 1, "the first heading is an h1");
    assert.equal(levels.filter((level) => level === 1).length, 1, "one h1");
    for (let at = 1; at < levels.length; at += 1) {
      assert.ok(levels[at] <= levels[at - 1] + 1, `h${levels[at - 1]} is followed by h${levels[at]}`);
    }
  });

  test(`${file}: every field has a label, and the skip link goes to the main part`, () => {
    for (const [field] of html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)) {
      const id = field.match(/\bid="([^"]+)"/)?.[1];
      const labelled = (id && html.includes(`<label for="${id}"`)) || /\baria-label="[^"]+"/.test(field);
      assert.ok(labelled, `${file}: ${field} has no label`);
    }
    assert.match(html, /<a class="skip-link" href="#main">/);
    assert.match(html, /<main id="main">/);
  });
}

test("site/styles.css: a printed study may break across pages, and the record's address prints", () => {
  const css = SHEETS["site/styles.css"];
  const print = [...css.matchAll(/@media print \{([\s\S]*?)\n\}/g)].map((block) => block[1]).join("\n");
  // Kept whole, a study longer than a page left the page before it nearly empty.
  assert.equal(/\.card \{[^}]*break-inside: avoid/.test(print), false);
  assert.match(print, /\.card h3, \.card h4, \.questions h3 \{ break-after: avoid-page; \}/);
  // The screen rule hides it; the print rule must win over it (it did not, at first).
  assert.match(print, /\.print-only \{ display: inline !important; \}/);
  assert.match(print, /body > \*:not\(main\),\s*main > \*:not\(#sheet\),\s*\.no-print \{ display: none !important; \}/, "only the sheet prints");
  assert.match(css, /\n\.print-only \{ display: none; \}/, "the address is for paper only");
});

test("site/index.html: the search status and the assistant status are read out politely", () => {
  const html = PAGES["site/index.html"];
  assert.match(html, /<p class="status" id="status" role="status" aria-live="polite"><\/p>/);
  assert.match(html, /id="assistant-status" role="status"/);
  // Each error line is an alert, so it is read out when it appears.
  for (const id of ["search-error", "shortlist-error", "sheet-error"]) {
    assert.match(html, new RegExp(`id="${id}" role="alert"`));
  }
});

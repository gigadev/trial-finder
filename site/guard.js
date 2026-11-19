// The code checks on what the model asks the page to show about eligibility.
// Pure functions: no page, no network, no storage. Tested in tests/guard.test.mjs, which
// was written first (docs/AGENT_STANDARDS.md B4).
//
// Rules this file keeps:
//   W2  Each criterion is in one of three states, never a verdict. The states' words are
//       fixed here; an explanation that decides for the visitor is dropped.
//   C7  What the schema cannot express (lengths after tidying, counts, the enum again,
//       verdict wording) is checked here, and a malformed request is refused whole.
//   C8  A quoted criterion must be in the study's fetched criteria text, compared after
//       normalising case, spacing, bullets, numbering, escapes, quotes and dashes.
//   C9  Every dropped item is named with its reason, so the model can correct it once.
//   C10 A kept note shows the record's whole criterion in the record's own words, never
//       the model's quote, so nothing cut mid-sentence or paraphrased reaches the page.
// Instructions ask the model for the same things; this is the enforcement (W4).

export const STATUSES = Object.freeze(["likely_meets", "likely_does_not_meet", "cannot_tell"]);

/** What the page shows for each state. The model cannot change these words. */
export const STATUS_WORDS = Object.freeze({
  likely_meets: "Likely meets",
  likely_does_not_meet: "Likely does not meet",
  cannot_tell: "Cannot tell: ask the study team",
});

export const LIMITS = Object.freeze({
  maxItems: 20,
  minCriterion: 12,
  maxCriterion: 400,
  maxWhy: 300,
  maxFacts: 10,
  maxFact: 120,
});

const DROP_REASONS = Object.freeze({
  too_short: "Too short to check against the record. Quote a whole criterion, or most of one.",
  not_in_record: "This text is not in the study's criteria. Quote the record's exact words, or leave this item out. If the record does not say, use cannot_tell on a criterion it does have.",
  verdict: "The explanation gives a verdict. Say what the record and the visitor's words show; only the study team decides who can take part.",
  duplicate: "This criterion is already in the list.",
});

function refuse(reason) {
  return { ok: false, category: "validation", retryable: false, reason };
}

/** Collapse spacing and trim, without changing the words. */
function tidy(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

/**
 * Normalise text for comparing a quote with the record: lower case; one spacing; list
 * bullets and numbering removed from the start of each line; markdown escapes removed;
 * curly quotes, long dashes and the signs ≥ and ≤ written plainly.
 */
export function normalise(text) {
  const plain = String(text ?? "")
    .normalize("NFKC")
    .replace(/\\([^\w\s])/g, "$1")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, "\"")
    .replace(/[‐‑‒–—―−]/g, "-")
    .toLowerCase();
  return plain
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:(?:[*\-•·▪◦]+)|(?:\(?[0-9a-z]{1,3}[.)]))\s+/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A quote, normalised and without punctuation or bullets at its ends. */
function quoteKey(criterion) {
  return normalise(criterion).replace(/^[\s.,;:*\-•]+|[\s.,;:]+$/g, "");
}

/** True when the quote is long enough and appears in the record's criteria text. */
export function criterionInRecord(criterion, recordCriteria) {
  const key = quoteKey(criterion);
  if (key.length < LIMITS.minCriterion) return false;
  return wholeCriterion(key, recordCriteria) !== null;
}

/** Above this length, a whole criterion is cut to the whole sentences the quote is in. */
const MAX_SHOWN = 600;
const BULLET = /^\s*(?:(?:[*\-•·▪◦]+)|(?:\(?[0-9a-z]{1,3}[.)]))\s+/i;

const indent = (line) => line.match(/^\s*/)[0].length;
const unescape = (text) => text.replace(/\\([^\w\s])/g, "$1");

/**
 * The first and last of `parts` that the normalised key falls in, or null. The parts are
 * joined with one space, as normalise() joins a record's lines.
 */
function partsCovering(parts, key) {
  let joined = "";
  const spans = [];
  parts.forEach((part, index) => {
    const text = normalise(part);
    if (!text) return;
    if (joined) joined += " ";
    spans.push({ index, start: joined.length, end: joined.length + text.length });
    joined += text;
  });
  const at = joined.indexOf(key);
  if (at < 0) return null;
  const first = spans.find((span) => span.end > at);
  const last = [...spans].reverse().find((span) => span.start < at + key.length);
  return [first.index, last.index];
}

/**
 * The record's whole criterion (or criteria) that a normalised quote is in, in the
 * record's own words: the first line's bullet or number and markdown escapes removed,
 * spacing tidied. A criterion ending in a colon brings the indented points under it.
 * One longer than MAX_SHOWN is cut to the whole sentences the quote is in. Null when
 * the quote is not in the record (C8). This keeps a note from showing words cut
 * mid-sentence (C10).
 */
function wholeCriterion(key, recordCriteria) {
  const lines = String(recordCriteria ?? "").split(/\r?\n/);
  const range = partsCovering(lines, key);
  if (!range) return null;
  let [first, last] = range;
  if (tidy(lines[last]).endsWith(":")) {
    for (let next = last + 1; next < lines.length; next += 1) {
      if (!tidy(lines[next])) continue;
      if (indent(lines[next]) <= indent(lines[first])) break;
      last = next;
    }
  }
  // A line at the first line's depth is another criterion: its bullet goes and "; " parts
  // it from the one before. A deeper line is a point under it and keeps its number.
  const base = indent(lines[first]);
  const text = tidy(unescape(lines.slice(first, last + 1)
    .filter((line) => tidy(line))
    .map((line, index) => {
      if (index === 0) return line.replace(BULLET, "");
      return indent(line) <= base ? `; ${line.replace(BULLET, "")}` : ` ${line}`;
    })
    .join("")
    .replace(/\s+;/g, ";")));
  if (text.length <= MAX_SHOWN) return text;
  const sentences = text.split(/(?<=[.;!?])\s+/);
  const within = partsCovering(sentences, key);
  return within ? sentences.slice(within[0], within[1] + 1).join(" ") : text;
}

const VERDICTS = [
  /\b(?:qualif(?:y|ies|ied)|disqualif(?:y|ies|ied))\b/i,
  /\b(?:in)?eligible\b/i,
  /\byou\s+(?:can|could|may|will|cannot|can't|can\s+not|could\s+not|couldn't|won't|will\s+not)\s+(?:not\s+)?(?:join|take\s+part|enrol|enroll|participate|sign\s+up)\b/i,
  /\byou\s+(?:will|would)\s+(?:not\s+)?be\s+(?:accepted|enrolled|enroled|admitted|turned\s+away|rejected)\b/i,
  /\byou\s+should\b/i,
];

/** True when the text decides for the visitor whether they can take part, or tells them what to do. */
export function givesVerdict(text) {
  return VERDICTS.some((pattern) => pattern.test(String(text ?? "")));
}

const SHEET_STATEMENTS = [
  /\byou\s+(?:do\s+)?(?:qualify|meet\s+the\s+criteria)\b/i,
  /\byou(?:'re|\s+are)\s+(?:not\s+)?(?:eligible|ineligible)\b/i,
  /\byou\s+should\b/i,
];

/**
 * True when text the agent wants on the printed sheet is a question that states no
 * verdict. "Am I eligible?" is a fair question for a doctor; "You qualify?" is a verdict
 * dressed as one. The visitor's own typed questions are not checked: they are theirs.
 */
export function isSheetQuestion(text) {
  const line = tidy(text ?? "");
  if (!line.endsWith("?")) return false;
  return !SHEET_STATEMENTS.some((pattern) => pattern.test(line));
}

/**
 * Check the notes the model asks the page to show for one study.
 *
 * input: { facts?: string[], notes: { criterion, status, why }[] }
 * recordCriteria: the study's eligibility text, as fetched on this page.
 * Returns { ok: true, facts, kept, dropped } where each dropped item has criterion,
 * reason (a code) and why (words for the model), or a refusal when the request is
 * malformed or nothing survives.
 */
export function checkNotes(input, recordCriteria) {
  if (!input || typeof input !== "object") return refuse("Send notes as a list of items, each with criterion, status and why.");
  const { notes } = input;
  if (!Array.isArray(notes) || notes.length === 0 || notes.length > LIMITS.maxItems) {
    return refuse(`Send between 1 and ${LIMITS.maxItems} notes.`);
  }
  let facts = [];
  if (input.facts !== undefined) {
    if (!Array.isArray(input.facts) || input.facts.length > LIMITS.maxFacts) {
      return refuse(`Send at most ${LIMITS.maxFacts} facts, as a list of short strings.`);
    }
    for (const fact of input.facts) {
      if (typeof fact !== "string" || !tidy(fact) || fact.length > LIMITS.maxFact) {
        return refuse(`Each fact is a short string of what the visitor said, at most ${LIMITS.maxFact} characters.`);
      }
      if (givesVerdict(fact)) return refuse("A fact is something the visitor said, never a verdict on whether they can take part.");
    }
    facts = input.facts.map(tidy);
  }
  for (const item of notes) {
    if (!item || typeof item !== "object" || typeof item.criterion !== "string" || typeof item.why !== "string") {
      return refuse("Each note needs criterion, status and why, all as text.");
    }
    if (!STATUSES.includes(item.status)) return refuse(`status must be one of ${STATUSES.join(", ")}.`);
    if (item.criterion.length > LIMITS.maxCriterion) return refuse(`A criterion is at most ${LIMITS.maxCriterion} characters. Quote one criterion per note.`);
    if (!tidy(item.why) || item.why.length > LIMITS.maxWhy) return refuse(`Each why is one short sentence, at most ${LIMITS.maxWhy} characters.`);
  }

  const kept = [];
  const dropped = [];
  const seen = new Set();
  for (const item of notes) {
    const quoted = tidy(item.criterion);
    const key = quoteKey(quoted);
    const whole = key.length < LIMITS.minCriterion ? null : wholeCriterion(key, recordCriteria);
    const wholeKey = whole === null ? null : normalise(whole);
    let reason = null;
    if (key.length < LIMITS.minCriterion) reason = "too_short";
    else if (whole === null) reason = "not_in_record";
    else if (givesVerdict(item.why)) reason = "verdict";
    else if (seen.has(wholeKey)) reason = "duplicate";
    if (reason) {
      dropped.push({ criterion: quoted, reason, why: DROP_REASONS[reason] });
    } else {
      seen.add(wholeKey);
      kept.push({ criterion: whole, status: item.status, why: tidy(item.why) });
    }
  }
  if (kept.length === 0) {
    const list = dropped.map((item) => `"${item.criterion.slice(0, 80)}": ${item.why}`).join(" ");
    return refuse(`None of the ${notes.length} notes could be shown. ${list}`);
  }
  return { ok: true, facts, kept, dropped };
}

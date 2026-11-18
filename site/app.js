// The page: its state, and one method per thing a visitor can do.
//
// The page's own buttons call these methods, and in task 4 the agent's site actions call
// the same ones, so both follow one set of rules (docs/AGENT_STANDARDS.md T1).
//
// Rules this file keeps:
//   C10, D7  Facts shown about a study come from its record and are drawn here: the
//            study id, the criteria word for word, the record's date, the source line.
//   D1       Nothing about the visitor is stored. State lives in this object only and is
//            gone when the page is closed or reloaded.
//   D3       Nothing is logged.
//   D6       Before the first search the visitor is told what is sent, and can say no.
//   W1       The shortlist and the sheet change only in ways the visitor can see and undo.
//            Printing is the visitor's own click.
//   Text from a record is only ever set as text, never as markup.
//
// A method refuses by returning { ok: false, category, retryable, reason } and changing
// nothing. Methods do not move focus or clear the visitor's typing: the button handlers
// at the end of this file do that, because an agent may call a method while the visitor
// is typing somewhere else.

import * as trialsApi from "./trials-api.js";

export const MAX_SHORTLIST = 10;
export const MAX_QUESTIONS = 12;
export const MAX_QUESTION_LENGTH = 300;

/** Fixed wording. The same sentences are in index.html; a test keeps them in step. */
export const WORDING = Object.freeze({
  notAdvice: "This is information, not medical advice. It cannot tell you whether you can join a study. Ask your doctor or the study team.",
  emergency: "If this is an emergency, call your local emergency number.",
  notice: "Your search words (the condition, place, age and sex you enter) are sent to ClinicalTrials.gov, a public database run by the U.S. National Library of Medicine, to find studies. Nothing is sent to this site, and this site stores nothing about you.",
  notAffiliated: "Trial Finder is not affiliated with or endorsed by the U.S. National Institutes of Health, the National Library of Medicine or ClinicalTrials.gov. A study being listed there does not mean the U.S. government has reviewed or approved it.",
  source: "Source: ClinicalTrials.gov",
  criteriaHeading: "Who can take part, in the study's own words",
  criteriaNote: "This text is copied from the study's record without changes. Only the study team can say whether you can take part.",
  nothingMatches: "No studies match this search. That can change: new studies are added often. You could try a wider place, other words for the condition, or include studies that are not recruiting yet.",
  sheetIntro: "Take this sheet to your doctor or to the study team. It lists the studies you chose and questions you may want to ask.",
});

/** Questions printed on every sheet. */
export const STANDARD_QUESTIONS = Object.freeze([
  "Is this study still taking new people at a site I can get to?",
  "Which of the study's criteria would you need to check with me or in my records?",
  "What would taking part involve, and for how long?",
  "What are the possible risks and benefits for someone in my situation?",
  "Would I keep seeing my own doctor and keep my current treatment?",
  "Which costs does the study cover, and what would be billed to me or my insurance?",
  "Can I stop taking part at any time?",
]);

const REASONS = Object.freeze({
  noticeDeclined: "The search was not sent. You chose not to send your search words to ClinicalTrials.gov.",
  noMore: "There are no more studies to show for this search.",
  unknownStudy: "That study is not in the results on this page. Search for it first.",
  alreadyListed: "That study is already on the shortlist.",
  notListed: "That study is not on the shortlist.",
  shortlistFull: `The shortlist holds at most ${MAX_SHORTLIST} studies. Remove one first.`,
  badChange: "A shortlist change must be \"add\" or \"remove\".",
  idShape: "A study id is the letters NCT followed by 8 digits, such as NCT01234567.",
  emptyShortlist: "The shortlist is empty. Add a study before making the sheet.",
  badQuestions: `Questions must be a list of at most ${MAX_QUESTIONS} short lines of text, each at most ${MAX_QUESTION_LENGTH} characters.`,
});

const STATUS_WORDS = Object.freeze({
  RECRUITING: "Recruiting",
  NOT_YET_RECRUITING: "Not yet recruiting",
  ACTIVE_NOT_RECRUITING: "Active, not recruiting",
  ENROLLING_BY_INVITATION: "Enrolling by invitation only",
  COMPLETED: "Completed",
  SUSPENDED: "Suspended",
  TERMINATED: "Terminated",
  WITHDRAWN: "Withdrawn",
  AVAILABLE: "Available",
  NO_LONGER_AVAILABLE: "No longer available",
  TEMPORARILY_NOT_AVAILABLE: "Temporarily not available",
  APPROVED_FOR_MARKETING: "Approved for marketing",
  WITHHELD: "Withheld",
  UNKNOWN: "Status unknown",
});

const PHASE_WORDS = Object.freeze({
  NA: "No phase (not a drug study)",
  EARLY_PHASE1: "Early phase 1",
  PHASE1: "Phase 1",
  PHASE2: "Phase 2",
  PHASE3: "Phase 3",
  PHASE4: "Phase 4",
});

const SEX_WORDS = Object.freeze({ ALL: "All", FEMALE: "Female only", MALE: "Male only" });

function refuse(category, retryable, reason) {
  return { ok: false, category, retryable, reason };
}

export function statusWords(status) {
  return STATUS_WORDS[status] ?? (status || "Status not stated");
}

export function ageWords(minimumAge, maximumAge) {
  const from = minimumAge.toLowerCase();
  const to = maximumAge.toLowerCase();
  if (from && to) return `${from} to ${to}`;
  if (from) return `${from} and older`;
  if (to) return `up to ${to}`;
  return "No age limit stated";
}

function placeWords(site) {
  return [site.city, site.state, site.country].filter(Boolean).join(", ");
}

function dateOnly(timestamp) {
  return typeof timestamp === "string" ? timestamp.slice(0, 10) : "";
}

export class TrialFinderPage {
  /**
   * :param document: The page's document.
   * :param options.api: The data layer; site/trials-api.js unless a test passes another.
   * :param options.print: Called by the print button; window.print unless a test passes another.
   */
  constructor(document, options = {}) {
    this.document = document;
    this.api = options.api ?? trialsApi;
    this.print = options.print ?? (() => globalThis.print?.());
    this.version = 0;
    this.noticeAccepted = false;
    this.pendingNotice = null;
    this.searchRun = 0;
    this.search = { status: "idle", input: null, message: "" };
    this.results = null;
    this.study = { status: "closed", id: null, record: null, message: "" };
    this.shortlist = [];
    this.sheet = { open: false, questions: [], studies: [], missing: [] };
    this.dataDate = null;
    this.known = new Map();
    this.records = new Map();
    this.nodes = {};
    for (const id of ["search-form", "condition", "place", "age", "sex", "recruiting-only", "search-error",
      "search-button", "notice", "notice-heading", "notice-continue", "notice-decline", "status", "results",
      "results-heading", "results-summary", "results-list", "more-results", "results-source", "study",
      "study-heading", "study-body", "study-close", "shortlist-heading", "shortlist-empty", "shortlist-list",
      "shortlist-error", "make-sheet", "sheet", "sheet-heading", "sheet-body", "sheet-questions", "sheet-error",
      "sheet-update", "sheet-print", "sheet-close"]) {
      this.nodes[id] = document.getElementById(id);
    }
    this.connectButtons();
    this.render();
  }

  // -------------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------------

  /** The page's state as plain data. A copy: changing it changes nothing on the page. */
  getState() {
    return structuredClone({
      version: this.version,
      notice: { accepted: this.noticeAccepted, waiting: this.pendingNotice !== null },
      search: this.search,
      results: this.results,
      study: this.study,
      shortlist: this.shortlist,
      sheet: this.sheet,
      dataDate: this.dataDate,
    });
  }

  changed() {
    this.version += 1;
    this.render();
  }

  remember(study) {
    this.known.set(study.id, {
      id: study.id,
      title: study.title,
      link: study.link,
      status: study.status,
      lastUpdated: study.lastUpdated,
    });
  }

  // -------------------------------------------------------------------------------
  // The notice before the first search
  // -------------------------------------------------------------------------------

  /** Show the notice and wait for the visitor's answer. Resolves true or false. */
  askNotice() {
    if (this.noticeAccepted) return Promise.resolve(true);
    if (!this.pendingNotice) {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      this.pendingNotice = { promise, resolve };
      this.changed();
    }
    return this.pendingNotice.promise;
  }

  /** The visitor's answer to the notice. Only the notice's own buttons call this. */
  answerNotice(accepted) {
    if (!this.pendingNotice) return;
    const { resolve } = this.pendingNotice;
    this.pendingNotice = null;
    if (accepted === true) this.noticeAccepted = true;
    this.changed();
    resolve(accepted === true);
  }

  // -------------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------------

  /**
   * Search for studies and show them.
   *
   * input: { condition, place?, age?, sex?, recruitingOnly? }, as site/trials-api.js takes.
   * Before the first search this waits for the visitor to answer the notice. Nothing is
   * sent until they continue.
   */
  async searchStudies(input) {
    if (this.api.buildSearchUrl(input) === null) {
      // The data layer refuses a bad request without sending anything.
      return this.api.searchTrials(input);
    }
    if (!(await this.askNotice())) return refuse("business", false, REASONS.noticeDeclined);
    const run = ++this.searchRun;
    const request = { ...input, pageToken: undefined };
    this.search = { status: "loading", input: structuredClone(request), message: "" };
    this.changed();
    if (!this.dataDate) {
      // Not awaited: the search does not wait for the date.
      this.loadDataDate();
    }
    const result = await this.api.searchTrials(request);
    if (run !== this.searchRun) return result;
    if (!result.ok) {
      this.search = { ...this.search, status: "failed", message: result.reason };
      this.results = null;
      this.changed();
      return result;
    }
    for (const study of result.studies) this.remember(study);
    this.search = { ...this.search, status: "done", message: "" };
    this.results = {
      studies: result.studies,
      total: result.total,
      nextPageToken: result.nextPageToken,
      nothingMatches: result.nothingMatches,
    };
    this.changed();
    return result;
  }

  /** Show the next studies for the search on the page. */
  async moreResults() {
    if (!this.results?.nextPageToken || this.search.status !== "done") {
      return refuse("business", false, REASONS.noMore);
    }
    const run = this.searchRun;
    const result = await this.api.searchTrials({ ...this.search.input, pageToken: this.results.nextPageToken });
    if (run !== this.searchRun) return result;
    if (!result.ok) {
      this.search = { ...this.search, message: result.reason };
      this.changed();
      return result;
    }
    const shown = new Set(this.results.studies.map((study) => study.id));
    const added = result.studies.filter((study) => !shown.has(study.id));
    for (const study of added) this.remember(study);
    this.search = { ...this.search, message: "" };
    this.results = {
      ...this.results,
      studies: [...this.results.studies, ...added],
      nextPageToken: result.nextPageToken,
    };
    this.changed();
    return result;
  }

  async loadDataDate() {
    const result = await this.api.getDataDate();
    if (result.ok) {
      this.dataDate = { dataTimestamp: result.dataTimestamp };
      this.changed();
    }
  }

  // -------------------------------------------------------------------------------
  // One study
  // -------------------------------------------------------------------------------

  /** Fetch one study and show its details, with the criteria word for word. */
  async openStudy(id) {
    if (this.api.buildStudyUrl(id) === null) return this.api.getTrial(id);
    if (!(await this.askNotice())) return refuse("business", false, REASONS.noticeDeclined);
    this.study = { status: "loading", id, record: null, message: "" };
    this.changed();
    const result = await this.api.getTrial(id, { place: this.search.input?.place });
    if (this.study.id !== id) return result;
    if (!result.ok) {
      this.study = { status: "failed", id, record: null, message: result.reason };
      this.changed();
      return result;
    }
    this.remember(result.study);
    this.records.set(result.study.id, result.study);
    this.study = { status: "open", id: result.study.id, record: result.study, message: "" };
    this.changed();
    return result;
  }

  closeStudy() {
    this.study = { status: "closed", id: null, record: null, message: "" };
    this.changed();
    return { ok: true };
  }

  // -------------------------------------------------------------------------------
  // Shortlist
  // -------------------------------------------------------------------------------

  /**
   * Add a study to the shortlist or remove it.
   *
   * Only a study that a search or a fetch on this page returned can be added, so every
   * entry is backed by a record.
   */
  updateShortlist(id, change) {
    if (change !== "add" && change !== "remove") return refuse("validation", false, REASONS.badChange);
    if (!this.api.isNctId(id)) return refuse("validation", false, REASONS.idShape);
    const listed = this.shortlist.some((entry) => entry.id === id);
    if (change === "add") {
      const study = this.known.get(id);
      if (!study) return refuse("not_found", false, REASONS.unknownStudy);
      if (listed) return refuse("business", false, REASONS.alreadyListed);
      if (this.shortlist.length >= MAX_SHORTLIST) return refuse("business", false, REASONS.shortlistFull);
      this.shortlist = [...this.shortlist, { ...study }];
    } else {
      if (!listed) return refuse("business", false, REASONS.notListed);
      this.shortlist = this.shortlist.filter((entry) => entry.id !== id);
    }
    this.changed();
    return { ok: true, shortlist: this.shortlist.map((entry) => ({ id: entry.id, title: entry.title })) };
  }

  // -------------------------------------------------------------------------------
  // The sheet
  // -------------------------------------------------------------------------------

  /**
   * Build the printable sheet from the shortlist.
   *
   * input.questions: optional list of the visitor's own questions.
   * Each shortlisted study's record is fetched if this page has not fetched it yet. A
   * study whose record could not be fetched is named on the sheet as missing; it is not
   * left out silently.
   */
  async buildSheet(input) {
    const questions = [];
    const given = input?.questions ?? [];
    if (!Array.isArray(given) || given.length > MAX_QUESTIONS) return refuse("validation", false, REASONS.badQuestions);
    for (const item of given) {
      if (typeof item !== "string" || item.length > MAX_QUESTION_LENGTH) return refuse("validation", false, REASONS.badQuestions);
      const line = item.replace(/\s+/g, " ").trim();
      if (line) questions.push(line);
    }
    if (this.shortlist.length === 0) return refuse("business", false, REASONS.emptyShortlist);
    const ids = this.shortlist.map((entry) => entry.id);
    const missing = [];
    for (const id of ids) {
      if (!this.records.has(id)) {
        const result = await this.api.getTrial(id, { place: this.search.input?.place });
        if (result.ok) this.records.set(id, result.study);
        else missing.push(id);
      }
    }
    // The shortlist may have changed while records were fetched. Use what is there now.
    const current = this.shortlist.map((entry) => entry.id);
    this.sheet = {
      open: true,
      questions,
      studies: current.filter((id) => this.records.has(id)),
      missing: current.filter((id) => !this.records.has(id)),
    };
    this.changed();
    return { ok: true, studies: this.sheet.studies, missing: this.sheet.missing, questions };
  }

  closeSheet() {
    this.sheet = { ...this.sheet, open: false };
    this.changed();
    return { ok: true };
  }

  // -------------------------------------------------------------------------------
  // Drawing. Record text is only ever set with textContent.
  // -------------------------------------------------------------------------------

  make(tag, text, className) {
    const node = this.document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  box(tag, className, ...children) {
    const node = this.make(tag, undefined, className);
    node.append(...children.filter(Boolean));
    return node;
  }

  button(label, onClick, className) {
    const node = this.make("button", label, className);
    node.setAttribute("type", "button");
    node.addEventListener("click", onClick);
    return node;
  }

  sourceLine(study) {
    const line = this.make("p", `${WORDING.source}. Study ${study.id}. Record last updated ${study.lastUpdated || "date not stated"}. `, "source");
    const link = this.make("a", `Open ${study.id} on ClinicalTrials.gov (new tab)`);
    link.setAttribute("href", study.link);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
    line.append(link);
    return line;
  }

  factList(study) {
    const list = this.make("dl", undefined, "facts");
    const add = (name, value) => { list.append(this.make("dt", name), this.make("dd", value)); };
    add("Status", statusWords(study.status));
    add("Ages", ageWords(study.minimumAge, study.maximumAge));
    add("Sex", SEX_WORDS[study.sex] ?? "Not stated");
    if (study.conditions.length) add("Conditions", study.conditions.join("; "));
    if (study.phases.length) add("Phase", study.phases.map((phase) => PHASE_WORDS[phase] ?? phase).join(", "));
    return list;
  }

  siteBlock(study) {
    const block = this.make("div", undefined, "sites");
    const counts = study.siteCounts;
    for (const site of study.notRecruitingInPlace) {
      block.append(this.make(
        "p",
        `The site in ${placeWords(site)} is listed as "${statusWords(site.status)}". It is not taking new people now.`,
        "site-warning",
      ));
    }
    if (counts.recruiting === 0) {
      block.append(this.make("p", counts.total === 0
        ? "This record lists no study sites."
        : `None of this study's ${counts.total} listed sites is recruiting now.`));
      return block;
    }
    block.append(this.make("h4", `Sites recruiting now (${counts.shown} of ${counts.recruiting} shown)`));
    const list = this.make("ul");
    for (const site of study.sites) {
      const away = site.placeMatch !== "city" && site.milesFromPlace !== null
        ? `, about ${site.milesFromPlace} miles away in a straight line`
        : "";
      list.append(this.make("li", `${site.facility || "Site name not stated"}, ${placeWords(site)}${away}`));
    }
    block.append(list);
    return block;
  }

  shortlistButton(study) {
    const listed = this.shortlist.some((entry) => entry.id === study.id);
    return this.button(
      listed ? `Remove ${study.id} from shortlist` : `Add ${study.id} to shortlist`,
      () => { this.updateShortlist(study.id, listed ? "remove" : "add"); },
    );
  }

  studyCard(study) {
    return this.box(
      "article",
      "card",
      this.make("h3", study.title || "Title not stated"),
      this.make("p", study.id, "study-id"),
      this.factList(study),
      this.siteBlock(study),
      this.box(
        "div",
        "button-row",
        this.button(`Read details and criteria for ${study.id}`, async () => {
          await this.openStudy(study.id);
          this.nodes["study-heading"].focus();
        }, "primary"),
        this.shortlistButton(study),
      ),
      this.sourceLine(study),
    );
  }

  criteriaBlock(study) {
    return this.box(
      "div",
      "criteria-block",
      this.make("h4", WORDING.criteriaHeading),
      this.make("p", WORDING.criteriaNote, "hint"),
      this.make("pre", study.criteria || "This record states no criteria.", "criteria"),
    );
  }

  contactBlock(study) {
    if (!study.contacts.length) return null;
    const list = this.make("ul");
    for (const contact of study.contacts) {
      const phone = [contact.phone, contact.phoneExt && `extension ${contact.phoneExt}`].filter(Boolean).join(", ");
      list.append(this.make("li", [contact.name, phone, contact.email].filter(Boolean).join(" · ")));
    }
    return this.box(
      "div",
      "contacts",
      this.make("h4", "The study's contact, as listed in its record"),
      list,
      this.make("p", "This site does not contact anyone for you.", "hint"),
    );
  }

  render() {
    this.renderNotice();
    this.renderSearch();
    this.renderResults();
    this.renderStudy();
    this.renderShortlist();
    this.renderSheet();
  }

  renderNotice() {
    this.nodes.notice.hidden = this.pendingNotice === null;
  }

  renderSearch() {
    const { status, message } = this.search;
    const failed = status === "failed" || (status === "done" && message !== "");
    this.nodes["search-error"].hidden = !failed;
    this.nodes["search-error"].textContent = failed ? message : "";
    let line = "";
    if (status === "loading") line = "Searching ClinicalTrials.gov…";
    else if (status === "done" && this.results) {
      line = this.results.nothingMatches
        ? "The search finished. No studies match."
        : `The search finished. ${this.results.studies.length} studies are shown.`;
    }
    this.nodes.status.textContent = line;
  }

  renderResults() {
    const results = this.results;
    this.nodes.results.hidden = results === null;
    if (!results) {
      this.nodes["results-list"].replaceChildren();
      return;
    }
    if (results.nothingMatches) {
      this.nodes["results-summary"].textContent = WORDING.nothingMatches;
    } else {
      const total = results.total === null ? "" : ` of ${results.total} found`;
      const place = this.search.input?.place ? `, for the place "${this.search.input.place}"` : "";
      this.nodes["results-summary"].textContent = `Showing ${results.studies.length}${total}${place}. A study may be recruiting overall while a site near you is not; each study lists its recruiting sites.`;
    }
    this.nodes["results-list"].replaceChildren(...results.studies.map((study) => this.studyCard(study)));
    this.nodes["more-results"].hidden = !results.nextPageToken;
    const processed = this.dataDate ? `ClinicalTrials.gov last processed its data on ${dateOnly(this.dataDate.dataTimestamp)}.` : "";
    this.nodes["results-source"].textContent = `${WORDING.source}, fetched just now. ${processed} This site shows part of each record: see each study's link for all of it.`;
  }

  renderStudy() {
    const { status, id, record, message } = this.study;
    this.nodes.study.hidden = status === "closed";
    if (status === "closed") {
      this.nodes["study-body"].replaceChildren();
    } else if (status === "loading") {
      this.nodes["study-body"].replaceChildren(this.make("p", `Fetching study ${id} from ClinicalTrials.gov…`));
    } else if (status === "failed") {
      this.nodes["study-body"].replaceChildren(this.make("p", message, "error"));
    } else {
      this.nodes["study-body"].replaceChildren(
        this.make("h3", record.title || "Title not stated"),
        this.make("p", record.id, "study-id"),
        this.factList(record),
        this.box("div", "summary", this.make("h4", "What the study is about, in the study's own words"), this.make("pre", record.summary || "This record has no summary.", "criteria")),
        this.criteriaBlock(record),
        this.siteBlock(record),
        this.contactBlock(record),
        this.box("div", "button-row", this.shortlistButton(record)),
        this.sourceLine(record),
      );
    }
  }

  renderShortlist() {
    const empty = this.shortlist.length === 0;
    this.nodes["shortlist-empty"].hidden = !empty;
    this.nodes["make-sheet"].hidden = empty;
    this.nodes["shortlist-list"].replaceChildren(...this.shortlist.map((entry) => this.box(
      "li",
      "shortlist-item",
      this.make("span", `${entry.title || "Title not stated"} (${entry.id})`),
      this.button(`Remove ${entry.id}`, () => { this.updateShortlist(entry.id, "remove"); }),
    )));
  }

  renderSheet() {
    this.nodes.sheet.hidden = !this.sheet.open;
    if (!this.sheet.open) {
      this.nodes["sheet-body"].replaceChildren();
      return;
    }
    const parts = [this.make("p", WORDING.sheetIntro)];
    for (const id of this.sheet.studies) {
      const record = this.records.get(id);
      parts.push(this.box(
        "article",
        "card",
        this.make("h3", record.title || "Title not stated"),
        this.make("p", record.id, "study-id"),
        this.factList(record),
        this.criteriaBlock(record),
        this.siteBlock(record),
        this.contactBlock(record),
        this.sourceLine(record),
      ));
    }
    for (const id of this.sheet.missing) {
      parts.push(this.make("p", `The record for study ${id} could not be fetched, so it is not on this sheet. Try "Update the sheet" in a moment.`, "site-warning"));
    }
    const questions = this.make("ol");
    for (const line of [...this.sheet.questions, ...STANDARD_QUESTIONS]) questions.append(this.make("li", line));
    parts.push(this.box("div", "questions", this.make("h3", "Questions to ask"), questions));
    const processed = this.dataDate ? ` ClinicalTrials.gov last processed its data on ${dateOnly(this.dataDate.dataTimestamp)}.` : "";
    parts.push(this.make("p", `${WORDING.source}.${processed} ${WORDING.notAffiliated}`, "source"));
    this.nodes["sheet-body"].replaceChildren(...parts);
  }

  // -------------------------------------------------------------------------------
  // The page's own buttons. Focus moves and form reading live here, not in the methods.
  // -------------------------------------------------------------------------------

  readForm() {
    const ageText = String(this.nodes.age.value ?? "").trim();
    return {
      condition: String(this.nodes.condition.value ?? ""),
      place: String(this.nodes.place.value ?? ""),
      // A value that is not a whole number is passed on as text, so the data layer refuses it.
      age: ageText === "" ? undefined : /^\d+$/.test(ageText) ? Number(ageText) : ageText,
      sex: this.nodes.sex.value || undefined,
      recruitingOnly: this.nodes["recruiting-only"].checked !== false,
    };
  }

  showFormError(message) {
    this.nodes["search-error"].textContent = message;
    this.nodes["search-error"].hidden = message === "";
  }

  connectButtons() {
    const nodes = this.nodes;
    nodes["search-form"].addEventListener("submit", async (event) => {
      event.preventDefault();
      this.showFormError("");
      const pending = this.searchStudies(this.readForm());
      if (this.pendingNotice) nodes["notice-heading"].focus();
      const result = await pending;
      if (result.ok) nodes["results-heading"].focus();
      else this.showFormError(result.reason);
    });
    nodes["notice-continue"].addEventListener("click", () => { this.answerNotice(true); });
    nodes["notice-decline"].addEventListener("click", () => {
      this.answerNotice(false);
      nodes["search-button"].focus();
    });
    nodes["more-results"].addEventListener("click", () => { this.moreResults(); });
    nodes["study-close"].addEventListener("click", () => {
      this.closeStudy();
      nodes["results-heading"].focus();
    });
    const makeSheet = async () => {
      const lines = String(nodes["sheet-questions"].value ?? "").split("\n").filter((line) => line.trim() !== "");
      const result = await this.buildSheet({ questions: lines });
      const errorNode = this.sheet.open ? nodes["sheet-error"] : nodes["shortlist-error"];
      nodes["sheet-error"].hidden = true;
      nodes["shortlist-error"].hidden = true;
      if (result.ok) {
        nodes["sheet-heading"].focus();
      } else {
        errorNode.textContent = result.reason;
        errorNode.hidden = false;
      }
    };
    nodes["make-sheet"].addEventListener("click", makeSheet);
    nodes["sheet-update"].addEventListener("click", makeSheet);
    nodes["sheet-print"].addEventListener("click", () => { this.print(); });
    nodes["sheet-close"].addEventListener("click", () => {
      this.closeSheet();
      nodes["shortlist-heading"].focus();
    });
  }
}

/** Holds the one page object. Site actions import this file and use App.page. */
export class App {
  static page = null;

  static start(document, options) {
    if (!App.page) App.page = new TrialFinderPage(document, options);
    return App.page;
  }
}

if (typeof document !== "undefined") App.start(document);

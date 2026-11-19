// Mounts the challenge's browser runtime in the page's assistant section: the chat, the
// agents' activity view and the AI model settings.
//
// The page works without this file. If the runtime fails to load, the status line says
// so and nothing else changes.
//
// Rules this file keeps (docs/AGENT_STANDARDS.md):
//   D2  It never reads the visitor's key or settings, not even to see whether a key is
//       set. The runtime owns them. So the status line says where to add a key, always.
//   D3  It logs nothing.
// There is no irreversible action, so no confirmation dialog of our own: the runtime's
// default stays in place.

export class AssistantMount {
  static STATUS = Object.freeze({
    loaded: "The assistant is ready. It needs your own AI provider key, added once in AI model settings below. The search form above works without it.",
    failed: "The assistant could not load. The search form above still works.",
  });

  /**
   * Boot the runtime in #agent-app and report the result in #assistant-status.
   *
   * :param importRuntime: Loads the runtime module; tests pass a stand-in.
   * :return: True when the runtime booted.
   */
  static async start(importRuntime = () => import("./runtime/index.js")) {
    const status = document.getElementById("assistant-status");
    const siteBase = new URL("./", import.meta.url).href;
    try {
      const { boot } = await importRuntime();
      const booted = await boot("#agent-app", {
        originUrl: siteBase,
        sandboxWorkerUrl: new URL("runtime/sandbox-worker.js", siteBase).href,
      });
      // The runtime's consent card for a partner site, with focus handled for the visitor.
      if (booted?.engine && typeof booted.engine.onConsent === "function") {
        AssistantMount.defaultConsent = booted.engine.onConsent;
        booted.engine.onConsent = AssistantMount.consent;
      }
      status.textContent = AssistantMount.STATUS.loaded;
      // Comforts only. If the runtime's chat markup changes, the chat still works as the
      // runtime made it, so a failure here does not count as a failed boot.
      try {
        AssistantMount.quietChatBox();
        AssistantMount.multilineChat();
        AssistantMount.keyboardAgents();
      } catch {
        // Nothing to do: the runtime's own chat box stays in place.
      }
      return true;
    } catch {
      status.textContent = AssistantMount.STATUS.failed;
      return false;
    }
  }
}

/**
 * Ask the visitor, with the runtime's consent card, whether to contact a partner site.
 * From the skill's templates/site.js: the card is named for screen readers and its title
 * takes focus while it waits, so a stray Enter answers nothing; then focus goes back to
 * the chat. The visitor's answer is passed on unchanged.
 *
 * :param info: What the card shows: the partner's label and host, and the request.
 * :return: "allow", "always" or "decline", as the visitor chose.
 */
AssistantMount.consent = async (info) => {
  const answer = AssistantMount.defaultConsent(info);
  const card = AssistantMount.focusConsentCard();
  const decision = await answer;
  AssistantMount.keepFocusInChat(card);
  return decision;
};

/**
 * Name the newest consent card after its title, and move focus to that title, unless
 * the visitor is typing in the page's own form: they keep focus and their keystrokes.
 *
 * :return: The card, or null when there is none.
 */
AssistantMount.focusConsentCard = () => {
  const cards = document.querySelectorAll("#ns-msgs .ns-consent");
  const card = cards[cards.length - 1];
  const title = card ? card.querySelector(".ns-consent-title") : null;
  if (!title) return null;
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", title.textContent);
  const active = document.activeElement;
  if (active && active !== document.body && !active.closest("#agent-app")) return card;
  title.tabIndex = -1;
  title.focus();
  return card;
};

/**
 * Put focus back in the message box once the card is answered, when focus was left on
 * the page body or is still on the card. A tap, or a click in a browser that does not
 * focus buttons, answers the card with focus still on its title. Focus anywhere else
 * is the visitor's and stays.
 *
 * :param card: The answered card, or null.
 */
AssistantMount.keepFocusInChat = (card = null) => {
  const active = document.activeElement;
  if (active === document.body || active === null || (card && card.contains(active))) {
    (document.querySelector("#assistant-message") ?? document.querySelector("#ns-input"))?.focus();
  }
};

/**
 * Ask the browser not to offer saved logins or past entries in the runtime's chat box.
 * The runtime's settings have a password-type field for the key, so Chrome may treat a
 * nearby text box as a username box. This changes an attribute on the chat box only; it
 * never touches the key field (D2).
 */
AssistantMount.quietChatBox = () => {
  const box = document.querySelector("#ns-input");
  if (box) {
    box.setAttribute("autocomplete", "off");
    box.setAttribute("name", "assistant-message");
  }
};

/**
 * Give the visitor a multi-line message box. The runtime's chat box is a one-line input
 * that it reads when Send is pressed, and its files are not ours to change. So a
 * textarea goes in front of it: what is typed is copied into the runtime's box, Enter
 * presses the runtime's own Send button, and Shift+Enter starts a new line. The
 * runtime's box stays in the page, hidden, and keeps working as before.
 *
 * :return: The new textarea, or null when the runtime's chat box is not there.
 */
AssistantMount.multilineChat = () => {
  const box = document.querySelector("#ns-input");
  const send = document.querySelector("#ns-send");
  const bar = document.querySelector("#agent-app .ns-inputbar");
  if (!box || !send || !bar) return null;
  const area = document.createElement("textarea");
  area.id = "assistant-message";
  area.rows = 3;
  area.maxLength = 2000;
  area.setAttribute("autocomplete", "off");
  area.setAttribute("aria-label", "Your message to the assistant. Enter sends; Shift and Enter starts a new line.");
  area.setAttribute("placeholder", box.getAttribute("placeholder") ?? "Type a request…");
  box.setAttribute("hidden", "");
  box.setAttribute("tabindex", "-1");
  box.setAttribute("aria-hidden", "true");
  bar.prepend(area);

  // The runtime's box is one line and drops line breaks, which would run words together.
  // Line breaks become spaces; the model reads the message the same way.
  const oneLine = (text) => text.replace(/\s*\n\s*/g, " ");

  // The runtime empties its box once a message is taken. Empty this one then too.
  let watch = null;
  const followClear = () => {
    clearInterval(watch);
    let tries = 0;
    watch = setInterval(() => {
      tries += 1;
      if (box.value === "") {
        area.value = "";
        clearInterval(watch);
      } else if (tries > 40) {
        clearInterval(watch);
      }
    }, 100);
  };
  const submit = () => {
    box.value = oneLine(area.value).trim();
    if (!box.value) return;
    send.click();
    followClear();
  };
  area.addEventListener("input", () => { box.value = oneLine(area.value); });
  area.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit();
    }
  });
  // Clicking Send reads the runtime's box, which already holds the copied text.
  send.addEventListener("click", followClear);
  // While the agents work, the runtime changes its box's hint and may disable it.
  if (typeof MutationObserver === "function") {
    new MutationObserver(() => {
      area.setAttribute("placeholder", box.getAttribute("placeholder") ?? "");
      area.disabled = box.disabled;
    }).observe(box, { attributes: true, attributeFilter: ["placeholder", "disabled"] });
  }
  return area;
};

/**
 * Make one entry in the runtime's agent list work from the keyboard. The runtime draws
 * each entry as a box that opens a dialog with that agent's instructions on a click;
 * this makes it a button in the Tab order that Enter and Space open, and remembers which
 * entry opened the dialog so focus can go back to it. Safe to call again on an entry.
 *
 * :param entry: One .ns-anode element.
 * :return: The same element.
 */
AssistantMount.agentButton = (entry) => {
  if (entry.getAttribute("role") === "button") return entry;
  const name = entry.querySelector(".ns-aname")?.textContent?.trim() || "This agent";
  entry.setAttribute("role", "button");
  entry.tabIndex = 0;
  entry.setAttribute("aria-label", `${name}: show its instructions and what it did`);
  entry.addEventListener("click", () => { AssistantMount.dialogOpener = name; });
  entry.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    AssistantMount.dialogOpener = name;
    entry.click();
  });
  return entry;
};

/** The name of the agent-list entry that last opened the dialog. */
AssistantMount.dialogOpener = null;

/**
 * When the runtime shows its agent dialog: name it, mark it as a dialog, and move focus
 * to its close button. The card can take focus too, so the instructions can be scrolled
 * with the arrow keys.
 *
 * :param modal: The runtime's #ns-modal element.
 */
AssistantMount.dialogShown = (modal) => {
  const card = modal.querySelector("#ns-modal-card");
  const close = card?.querySelector(".ns-modal-close");
  if (!card || !close) return;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  const title = card.querySelector("h4")?.textContent?.trim();
  if (title) card.setAttribute("aria-label", title);
  card.tabIndex = 0;
  close.setAttribute("aria-label", "Close");
  close.focus();
};

/**
 * Keys in the open agent dialog: Escape presses its own close button, and Tab moves
 * between the close button and the instructions without leaving the dialog.
 *
 * :param modal: The runtime's #ns-modal element.
 * :param event: The keydown event.
 */
AssistantMount.dialogKeys = (modal, event) => {
  const card = modal.querySelector("#ns-modal-card");
  const close = modal.querySelector(".ns-modal-close");
  if (!card || !close) return;
  if (event.key === "Escape") {
    event.preventDefault();
    close.click();
  } else if (event.key === "Tab") {
    event.preventDefault();
    (document.activeElement === close ? card : close).focus();
  }
};

/** When the dialog closes: focus goes back to the entry that opened it, or to the chat. */
AssistantMount.dialogHidden = () => {
  const entries = [...document.querySelectorAll("#ns-anodes .ns-anode")];
  const opener = entries.find((entry) => entry.querySelector(".ns-aname")?.textContent?.trim() === AssistantMount.dialogOpener);
  (opener ?? document.querySelector("#assistant-message"))?.focus();
};

/**
 * Watch the runtime's agent list and dialog, and apply the keyboard support above. The
 * runtime redraws the list as agents work, so each new entry is set up as it appears.
 */
AssistantMount.keyboardAgents = () => {
  const list = document.querySelector("#ns-anodes");
  const modal = document.querySelector("#ns-modal");
  if (typeof MutationObserver !== "function") return;
  if (list) {
    const setUp = () => { list.querySelectorAll(".ns-anode").forEach(AssistantMount.agentButton); };
    setUp();
    new MutationObserver(setUp).observe(list, { childList: true });
  }
  if (modal) {
    modal.addEventListener("keydown", (event) => { AssistantMount.dialogKeys(modal, event); });
    new MutationObserver(() => {
      if (modal.hidden) AssistantMount.dialogHidden();
      else AssistantMount.dialogShown(modal);
    }).observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  }
};

// Boot only in a browser. Node tests import this file to check it.
if (typeof window !== "undefined") {
  await AssistantMount.start();
}

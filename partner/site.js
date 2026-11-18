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
    loaded: "The assistant is ready. It needs your own AI provider key, added once in AI model settings below. The pages below work without it.",
    failed: "The assistant could not load. The pages below still work.",
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
  AssistantMount.focusConsentCard();
  const decision = await answer;
  AssistantMount.keepFocusInChat();
  return decision;
};

/**
 * Name the newest consent card after its title, and move focus to that title, unless
 * the visitor is typing in the page's own form: they keep focus and their keystrokes.
 */
AssistantMount.focusConsentCard = () => {
  const cards = document.querySelectorAll("#ns-msgs .ns-consent");
  const card = cards[cards.length - 1];
  const title = card ? card.querySelector(".ns-consent-title") : null;
  if (!title) return;
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", title.textContent);
  const active = document.activeElement;
  if (active && active !== document.body && !active.closest("#agent-app")) return;
  title.tabIndex = -1;
  title.focus();
};

/** Put focus back in the message box when an answered card left it on the page body. */
AssistantMount.keepFocusInChat = () => {
  if (document.activeElement === document.body || document.activeElement === null) {
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

// Boot only in a browser. Node tests import this file to check it.
if (typeof window !== "undefined") {
  await AssistantMount.start();
}

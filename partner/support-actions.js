// Registers Fernhollow's one site action with the agent runtime: reading its own pages.
// It is read-only, so it runs without a dialog and changes nothing. Nothing is logged.

import { App } from "./support-data.js";

const TOPIC_IDS = ["about", "day-to-day", "appointments", "studies", "families"];

export class SupportActions {
  static registerActions(actions) {
    actions.register({
      name: "get_support_topics",
      description: "Read Fernhollow Asthma Friends' support pages: about the group, living with asthma day to day, getting ready for an appointment, thinking about a clinical study, and support for families and carers. "
        + "Input: topic, one of those ids, or leave it out for all of them. "
        + "Returns each topic's title, text and link on the page, and the partner sites the page names with their links. "
        + "It gives no medical advice and changes nothing.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: { type: "string", enum: TOPIC_IDS, description: "One topic id, or leave out for all." },
        },
      },
      execute: SupportActions.getSupportTopics,
    });
  }

  static getSupportTopics(args) {
    try {
      return { ok: true, ...App.page.getState(args.topic) };
    } catch {
      return { ok: false, category: "transient", retryable: false, reason: "The page could not be read. Its pages are still there to read directly." };
    }
  }
}

export const registerActions = SupportActions.registerActions;

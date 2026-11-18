// Fernhollow Asthma Friends: the page's content and its page object.
//
// Fernhollow Asthma Friends is invented. It is the partner site that shows Trial Finder
// calling, and being called by, another agentic website (HANDOFF.md §9). Its content is
// general support for daily life, with no medical advice and no real organisation named.
//
// One object holds the content. It draws the page and feeds the read action, so the
// assistant reads exactly what the page shows (the skill's site_actions.md, "Expose
// page-only facts"). Nothing is stored and nothing is logged.

/** Where Trial Finder lives. Task 8 replaces this with its hosted address. */
export const TRIAL_FINDER_URL = "http://localhost:8080/";

export const TOPICS = Object.freeze([
  {
    id: "about",
    title: "About us",
    paragraphs: [
      "Fernhollow Asthma Friends is a small group for people who live with asthma and for the people who care for them. We share plain-language tips for daily life and for talking with a care team.",
      "This is a demonstration site. Fernhollow Asthma Friends is an invented group, made to show how one helpful website's assistant can work with another's.",
      "We do not give medical advice. Your doctor and your care team know your situation; please follow the plan they give you.",
    ],
  },
  {
    id: "day-to-day",
    title: "Living with asthma day to day",
    paragraphs: [
      "Many people find it helps to keep a short diary: how you felt each day, what you were doing, and anything you noticed around you. A diary is something to bring to your care team, not a way to decide things on your own.",
      "Keep the written plan your care team gave you somewhere easy to find, and let the people close to you know where it is.",
      "Living with a long-term condition can be tiring and worrying at times. That is common. Talking with people you trust, or with your care team, can help.",
    ],
  },
  {
    id: "appointments",
    title: "Getting ready for an appointment",
    paragraphs: [
      "Write your questions down before you go, most important first. Appointments can feel short.",
      "Bring a list of every medicine you take, including ones from a shop, and your diary if you keep one.",
      "You can bring someone with you, ask the doctor to say something again in plainer words, and ask for anything important in writing.",
    ],
  },
  {
    id: "studies",
    title: "Thinking about a clinical study",
    paragraphs: [
      "A clinical study tests a treatment or a way of caring for people, with volunteers. Taking part is always your choice, and you can say no or leave later.",
      "Good questions for the study team include: what taking part involves and for how long, the possible risks and benefits, what it costs you, and whether you keep seeing your own doctor.",
      "Trial Finder, another website, can help you look for studies in public records and prepare questions for your doctor. Only the study team can say whether you can take part.",
    ],
  },
  {
    id: "families",
    title: "Support for families and carers",
    paragraphs: [
      "Caring for someone with asthma can take a lot of energy. Sharing tasks with others, and making time for yourself, matters too.",
      "Your care team, a local library or a community centre may know of support groups near you.",
    ],
  },
]);

export const SITE = Object.freeze({
  name: "Fernhollow Asthma Friends",
  demonstration: true,
  trialFinder: { name: "Trial Finder", link: TRIAL_FINDER_URL },
});

/** The page: draws the topics and gives the assistant the same content. */
export class SupportPage {
  constructor(document) {
    this.document = document;
    this.render();
  }

  /** The page's content as plain data. A copy: changing it changes nothing. */
  getState(topicId) {
    const topics = topicId ? TOPICS.filter((topic) => topic.id === topicId) : TOPICS;
    return structuredClone({
      site: SITE.name,
      demonstration: SITE.demonstration,
      topics: topics.map((topic) => ({ id: topic.id, title: topic.title, link: `#${topic.id}`, text: topic.paragraphs.join(" ") })),
      partners: [SITE.trialFinder],
    });
  }

  render() {
    const list = this.document.getElementById("topics");
    if (!list) return;
    list.replaceChildren(...TOPICS.map((topic) => {
      const section = this.document.createElement("section");
      section.className = "panel";
      section.setAttribute("id", topic.id);
      section.setAttribute("aria-labelledby", `${topic.id}-heading`);
      const heading = this.document.createElement("h2");
      heading.setAttribute("id", `${topic.id}-heading`);
      heading.textContent = topic.title;
      section.append(heading, ...topic.paragraphs.map((text) => {
        const paragraph = this.document.createElement("p");
        paragraph.textContent = text;
        return paragraph;
      }));
      return section;
    }));
  }
}

/** Holds the one page object. The actions module imports this file and uses App.page. */
export class App {
  static page = null;

  static start(document) {
    if (!App.page) App.page = new SupportPage(document);
    return App.page;
  }
}

if (typeof document !== "undefined") App.start(document);

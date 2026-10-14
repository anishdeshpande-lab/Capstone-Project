/*
 * commands.js — Gideon's "brain".
 *
 * Each command has:
 *   patterns: regexes tested against what the user said (lower-cased)
 *   run(match, ctx, text): does the action and returns what Gideon should say
 *
 * Commands are checked in order; the first match wins. To teach Gideon
 * something new, add an entry here. To make her talk about a new item on
 * the page, just give it data-topic and data-say attributes in index.html.
 */

// Words people might use for each section → section id.
// Order matters: earlier sections win, so the vague ones (home, about) go last.
const SECTION_ALIASES = {
  education:  ["education", "school", "college", "university", "degree", "major", "coursework", "classes", "study", "studies"],
  skills:     ["skills", "skill", "tech stack", "languages", "programming", "technologies", "tools"],
  projects:   ["projects", "project", "portfolio", "built", "build", "made"],
  experience: ["experience", "work", "job", "jobs", "gig", "gigs", "career", "resume"],
  awards:     ["awards", "award", "achievements", "honors", "accomplishments", "recognition", "won"],
  activities: ["activities", "activity", "clubs", "club", "extracurricular", "extracurriculars", "involvement", "music", "band"],
  contact:    ["contact", "email", "reach", "get in touch", "hire", "message", "connect"],
  home:       ["home", "start", "beginning", "main page", "landing"],
  about:      ["about", "bio", "who is anish", "background", "yourself", "introduce"],
};

/** True if `phrase` appears in `text` as whole words. */
function hasPhrase(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

function findSection(text) {
  for (const [id, words] of Object.entries(SECTION_ALIASES)) {
    if (words.some(w => hasPhrase(text, w))) return id;
  }
  return null;
}

/** Finds the page item (data-topic) that best matches what was said. Longest phrase wins. */
function findTopic(text) {
  let best = null;
  let bestLen = 0;
  document.querySelectorAll("[data-topic]").forEach(el => {
    for (const phrase of el.dataset.topic.split(",").map(p => p.trim().toLowerCase())) {
      if (phrase.length > bestLen && hasPhrase(text, phrase)) {
        best = el;
        bestLen = phrase.length;
      }
    }
  });
  return best;
}

/** Navigate to an item's section, highlight it, and return its spoken summary. */
function presentItem(el, ctx) {
  ctx.goTo(el.closest(".section").id);
  ctx.highlight(el);
  return el.dataset.say || el.querySelector("h3")?.textContent;
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, first: 1, second: 2, third: 3 };

const COMMANDS = [
  {
    name: "stop",
    patterns: [/\b(stop|quiet|shut up|be quiet|cancel|never ?mind)\b/],
    run: (m, ctx) => { ctx.stopSpeaking(); return null; }, // say nothing
  },
  {
    name: "help",
    patterns: [/\b(help|what can you do|commands|options)\b/],
    run: () =>
      "You can ask me to open any section: about, education, skills, projects, experience, awards, activities, or contact. " +
      "You can also ask about something specific, like the drum solo project, Youth and Government, or Penn State. " +
      "Or say go back, scroll down, or stop. And if you're feeling brave, say enter the ruins.",
  },
  {
    name: "identity",
    patterns: [/\b(who are you|what are you|your name)\b/],
    run: () => "I am Gideon, an artificial intelligence built into Anish's website. I'm here to guide you.",
  },
  {
    name: "open project N",
    patterns: [/project (\d+|one|two|three|four|five|first|second|third)/, /(first|second|third) project/],
    run: (m, ctx) => {
      const n = parseInt(m[1], 10) || NUMBER_WORDS[m[1]];
      const card = document.querySelector(`.card[data-project="${n}"]`);
      if (!card) return `I'm afraid there is no project ${n}.`;
      return presentItem(card, ctx);
    },
  },
  {
    // "Tell me about the jazz band", "What's the SQL project?", "Penn State"
    name: "specific item",
    patterns: [/.*/],
    run: (m, ctx, text) => {
      const el = findTopic(text);
      return el ? presentItem(el, ctx) : null; // null = keep looking
    },
  },
  {
    name: "navigate",
    patterns: [/\b(go to|open|show|take me|navigate|bring up|let me see|pull up|what|where|tell me)\b/],
    run: (m, ctx, text) => {
      const id = findSection(text);
      if (!id) return null;
      ctx.goTo(id);
      return ctx.sectionIntro(id);
    },
  },
  {
    name: "back",
    patterns: [/\b(go back|previous|back)\b/],
    run: (m, ctx) => (ctx.back() ? "Returning to the previous page." : "There's nowhere to go back to."),
  },
  {
    name: "scroll",
    patterns: [/scroll (up|down)/, /^(down|up)$/],
    run: (m, ctx) => {
      window.scrollBy({ top: m[1] === "down" ? 400 : -400, behavior: "smooth" });
      return null;
    },
  },
  {
    name: "time",
    patterns: [/\bwhat time\b/, /\bthe time\b/],
    run: () => `It is ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`,
  },
  {
    name: "greeting",
    patterns: [/^(hello|hi|hey|good (morning|afternoon|evening))\b/],
    run: () => "Hello. How can I help you today?",
  },
  {
    // Last resort: they said a section name without a verb, e.g. "projects"
    name: "bare section",
    patterns: [/.*/],
    run: (m, ctx, text) => {
      const id = findSection(text);
      if (!id) return null;
      ctx.goTo(id);
      return ctx.sectionIntro(id);
    },
  },
];

const SILENT_COMMANDS = new Set(["stop", "scroll"]);

/** Returns the spoken reply, null for a silent action, or undefined if nothing matched. */
function handleCommand(rawText, ctx) {
  const text = rawText
    .toLowerCase()
    .replace(/[.,!?]/g, "")
    .replace(/^(hey |ok |okay )?gideon\s*/, "") // "Gideon, show me…" → "show me…"
    .trim();
  if (!text) return "Yes? How can I help?";

  for (const cmd of COMMANDS) {
    for (const re of cmd.patterns) {
      const m = text.match(re);
      if (!m) continue;
      const reply = cmd.run(m, ctx, text);
      if (reply !== null || SILENT_COMMANDS.has(cmd.name)) return reply;
    }
  }
  return undefined;
}

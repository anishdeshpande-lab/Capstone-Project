/*
 * story.js — the script for "The Shattered Chronicle".
 *
 * The game walks through these chapters in order. Each chapter is one
 * location in the ruins, with a trial the player must pass by voice
 * (or by typing). Passing it restores a memory shard: a piece of
 * Anish's resume pulled straight from the portfolio page.
 *
 * Chapter fields:
 *   title, subtitle   shown in the big location banner
 *   lines             what Gideon narrates on arrival
 *   trial.prompt      the riddle/challenge (spoken last, shown in gold)
 *   trial.type        "speech" (default) or "rhythm" (clap/knock three times)
 *   trial.answers     regex of accepted answers
 *   trial.special     optional [{ pattern, reply }] for specific wrong answers
 *   trial.hints       given in order when the player asks for a hint
 *   success           said when the trial is passed
 *   reward            the memory shard: { name, topic } pulls the matching
 *                     data-topic card from index.html; or { name, selector, say }
 *
 * Content rule for this file: keep it family-friendly. Mystery and
 * melancholy, never violence, gore, or crude language.
 */

const STORY = [
  {
    title: "The Forgotten Archive",
    subtitle: "Prologue",
    lines: [
      "Ah. A wanderer. It has been an age since anyone walked these halls.",
      "I am Gideon, warden of this ruined archive. Long ago it held the chronicle of a scholar named Anish Deshpande.",
      "But the chronicle was shattered, and its memories were scattered across the ruins as eight shards.",
      "Restore them, and the chronicle will live again.",
    ],
    trial: {
      prompt: "Say \"I am ready\" to begin your journey. If you have no time for trials, say \"speak plainly.\"",
      answers: /\b(ready|begin|yes|start|go|okay|ok|sure|lets go)\b/,
      hints: ["Simply say: I am ready."],
    },
    success: "Then let us begin. Follow the embers, wanderer.",
    reward: null,
  },

  {
    title: "The First Tower",
    subtitle: "Where the journey began",
    lines: [
      "Beyond the gate stands the First Tower, worn smooth by wind and years. It was here, in Aurora, that the scholar's journey began.",
      "Words are carved above its sealed door. A riddle.",
    ],
    trial: {
      prompt: "I have pages, but I am no tree. I have a spine, but I have no bones. What am I?",
      answers: /\b(book|books|tome|novel|journal)\b/,
      hints: ["Scholars carry me everywhere.", "The answer is: a book."],
    },
    success: "The door groans open. A shard of memory glows within.",
    reward: { name: "Shard of the First Tower", topic: "metea" },
  },

  {
    title: "The Bridge of Two Kingdoms",
    subtitle: "Penn State and Illinois",
    lines: [
      "A crumbling bridge spans the chasm between two kingdoms.",
      "On the near side lies Penn State, where the scholar first studied Data Sciences. On the far side, the University of Illinois, where the journey continues.",
      "A sentinel of stone bars the way. It speaks only once.",
    ],
    trial: {
      prompt: "The sentinel asks: does a true scholar turn back, or press onward?",
      answers: /\b(onward|forward|ahead|press on|continue|keep going|go on)\b/,
      special: [{ pattern: /\b(back|turn back|return)\b/, reply: "The sentinel does not move. The scholar did not turn back, and neither should you." }],
      hints: ["The scholar crossed this bridge and never looked back.", "Say: onward."],
    },
    success: "The sentinel bows and steps aside. The bridge holds firm beneath your feet.",
    reward: { name: "Shard of Two Kingdoms", topic: "illinois" },
  },

  {
    title: "The Sunken Library",
    subtitle: "Resting place of the Grimoire",
    lines: [
      "Half-drowned in shadow, the Sunken Library guards the scholar's grimoire: a book of spells written in the tongues of data.",
      "But a great serpent coils around it, and it yields only to one who speaks its true name.",
    ],
    trial: {
      prompt: "Name the serpent. It shares its name with the scholar's first spell-tongue.",
      answers: /\b(python|pythons)\b/,
      special: [{ pattern: /\b(snake|serpent)\b/, reply: "Yes, it is a serpent. But which kind? The scholar writes code in its name." }],
      hints: ["A great constrictor of the jungle, and a programming language.", "The serpent is a python."],
    },
    success: "The serpent uncoils and slips into the dark water. The grimoire is yours to read.",
    reward: {
      name: "Shard of the Grimoire",
      selector: "#skills .skill-groups",
      say: "The grimoire holds the scholar's spells: Python and SQL, strengthened by Pandas and NumPy, and used for data cleaning, dataset organization, and quantitative analysis.",
    },
  },

  {
    title: "The Cartographer's Vault",
    subtitle: "Where every road is recorded",
    lines: [
      "Deep within the castle lies the Cartographer's Vault.",
      "Inside rests an atlas of travel, once scattered across loose scrolls, now bound into a single great tome by the scholar's hand.",
      "The vault answers only to the ancient command word that begins nearly every query.",
    ],
    trial: {
      prompt: "Speak the command word that retrieves knowledge from a database.",
      answers: /\b(select|selects|selected)\b/,
      hints: ["It is how you choose what to retrieve. Choose... carefully.", "The word is: select."],
    },
    success: "Gears turn deep within the walls. The vault opens, and the atlas unfolds.",
    reward: { name: "Shard of the Atlas", topic: "sql" },
  },

  {
    title: "The Hall of Thunder",
    subtitle: "The drum of legends",
    lines: [
      "You enter a vast hall. At its center stands an ancient drum, said to echo the thunder of John Bonham, legendary drummer of Led Zeppelin.",
      "The scholar once studied fifteen of his performances, counting every strike.",
      "The drum answers only to a drummer's hand.",
    ],
    trial: {
      type: "rhythm",
      prompt: "Strike the drum three times. Clap or knock near your microphone, or tap the drum on screen.",
      // Typed/spoken fallback: "knock knock knock", "boom boom boom", etc.
      answers: /\b(knock|clap|strike|boom|bang|hit|tap)\b.*\b(knock|clap|strike|boom|bang|hit|tap)\b.*\b(knock|clap|strike|boom|bang|hit|tap)\b/,
      hints: ["Clap your hands three times, sharply, near the microphone.", "If the drum cannot hear you, tap it on the screen three times."],
    },
    success: "The hall trembles. Thunder rolls through the ruins, and a shard falls from the drum's heart.",
    reward: { name: "Shard of Thunder", topic: "bonham" },
  },

  {
    title: "The Bard's Hall",
    subtitle: "Where music still lingers",
    lines: [
      "Music drifts from a hall the ruin never touched.",
      "Here, the scholar kept time for the school's top jazz band for three years, led a jazz combo that played across the land, and became the first drummer ever to join the pit orchestra for the annual musical.",
      "A spectral bard looks up from a lute and offers a riddle.",
    ],
    trial: {
      prompt: "I am felt but never seen. I hold the band together without saying a word. What am I?",
      answers: /\b(rhythm|beat|beats|tempo|time|timing|groove|pulse|drum|drums|drummer)\b/,
      hints: ["Every drummer keeps me.", "It is the rhythm, or the beat."],
    },
    success: "The bard smiles and plays a single, ringing chord. A shard rises from the strings.",
    reward: { name: "Shard of the Bard", topic: "gig" },
  },

  {
    title: "The High Tribunal",
    subtitle: "Hall of law and argument",
    lines: [
      "Stone judges sit in silence around a great round table.",
      "In this hall, the scholar served two years as an advocate, rising to Court A and winning the case, and one year as a lawmaker, writing a bill passed by every voice in both chambers.",
      "The eldest judge speaks.",
    ],
    trial: {
      prompt: "What does a wise advocate bring before the tribunal: a sword, or the truth?",
      answers: /\b(truth|evidence|argument|arguments|reason|words|facts|honesty)\b/,
      special: [{ pattern: /\b(sword|blade|weapon)\b/, reply: "Steel wins no cases in this hall, wanderer. Think again." }],
      hints: ["Battles are won with steel. Cases are won with something else.", "The answer is: the truth."],
    },
    success: "The judges strike their gavels as one. The tribunal rules in your favor.",
    reward: { name: "Shard of the Tribunal", topic: "youth and government" },
  },

  {
    title: "The Gate of Two Tongues",
    subtitle: "The final seal",
    lines: [
      "Before the last chamber stands a gate bound by a golden seal.",
      "It honors the scholar's command of two languages, recognized by the Seal of Biliteracy in Spanish.",
      "The seal opens only for one who greets it in the second tongue.",
    ],
    trial: {
      prompt: "Greet the seal in Spanish.",
      answers: /\b(hola|ola|buenos|buenas|saludos|bienvenido)\b/,
      hints: ["How does one say hello in Spanish?", "Say: hola."],
    },
    success: "Bienvenido, wanderer. The seal breaks, and the gate swings wide.",
    reward: { name: "Shard of Two Tongues", topic: "biliteracy" },
  },
];

// Shown after the last chapter
const FINALE = {
  title: "The Chronicle Restored",
  subtitle: "Epilogue",
  lines: [
    "All eight shards blaze with light and join as one. The chronicle of Anish Deshpande is whole once more.",
    "Scholar of data. Keeper of rhythm. Advocate of the tribunal. Your journey here is complete, wanderer.",
  ],
  prompt: "Say \"send a raven\" to write to the scholar, \"speak plainly\" to read the full chronicle, or \"begin anew\" to walk the path again.",
};

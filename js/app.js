/*
 * app.js — glues Gideon (voice) to the website (sections, UI).
 */

const panel = document.getElementById("gideon");
const orb = document.getElementById("orb");
const statusText = document.getElementById("status-text");
const transcript = document.getElementById("transcript");
const textForm = document.getElementById("text-form");
const textInput = document.getElementById("text-input");
const wakeToggle = document.getElementById("wake-mode");
const voiceToggle = document.getElementById("voice-on");
const boot = document.getElementById("boot");
const bootBtn = document.getElementById("boot-btn");
const bootGameBtn = document.getElementById("boot-game");
const enterGameBtn = document.getElementById("enter-game");

// What Gideon says when she opens each section
const SECTION_INTROS = {
  home: "Returning to the home page.",
  about:
    "Anish Deshpande is an Information Sciences and Data Science student at the University of Illinois Urbana-Champaign, " +
    "and a drummer with years of jazz band and gig experience.",
  education:
    "Anish studies Information Sciences and Data Science at the University of Illinois, after transferring from Penn State. " +
    "Ask me about any school for details.",
  skills:
    "Anish programs in Python and SQL, works with Pandas and NumPy, and focuses on data cleaning, dataset organization, and quantitative analysis.",
  projects:
    "Displaying Anish's projects: a statistical analysis of John Bonham's drum solos, a SQL travel statistics database, and me. " +
    "Ask about any of them by name or number.",
  experience: "Anish spent nearly three years as drummer, and later leader, of a jazz combo that gigged around the local area.",
  awards: "Anish earned the Seal of Biliteracy, recognizing proficiency in Spanish.",
  activities:
    "Here are Anish's clubs and activities: Youth and Government, Jazz Band, the pit orchestra, and Key Club. " +
    "Ask me about any one of them.",
  contact: "Here's how to get in touch with Anish. Email is the best way to reach out.",
};

// ---------- Navigation ----------

const navHistory = [];
let current = "home";

function goTo(id, { record = true } = {}) {
  const target = document.getElementById(id);
  if (!target || id === current) return;
  if (record) navHistory.push(current);
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  target.classList.add("active");
  document.querySelectorAll(".topbar a").forEach(a =>
    a.classList.toggle("current", a.dataset.section === id)
  );
  current = id;
  window.scrollTo({ top: 0, behavior: "smooth" });
  location.hash = id;
}

function back() {
  const prev = navHistory.pop();
  if (!prev) return false;
  goTo(prev, { record: false });
  return true;
}

function highlight(el) {
  document.querySelectorAll(".card.highlight").forEach(c => c.classList.remove("highlight"));
  el.classList.add("highlight");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Clicking the nav still works without voice
document.querySelectorAll(".topbar a").forEach(a =>
  a.addEventListener("click", (e) => { e.preventDefault(); goTo(a.dataset.section); })
);

// ---------- Transcript UI ----------

let interimLine = null;

function addLine(text, who) {
  interimLine?.remove();
  interimLine = null;
  const div = document.createElement("div");
  div.className = `line ${who === "user" ? "user" : "gideon-line"}`;
  div.textContent = text;
  transcript.appendChild(div);
  transcript.scrollTop = transcript.scrollHeight;
}

/** Show a Gideon line in the transcript AND say it out loud. */
function say(text) {
  addLine(text, "gideon");
  return gideon.speak(text);
}

function showInterim(text) {
  if (!interimLine) {
    interimLine = document.createElement("div");
    interimLine.className = "line user interim";
    transcript.appendChild(interimLine);
  }
  interimLine.textContent = text;
  transcript.scrollTop = transcript.scrollHeight;
}

const STATUS_LABELS = { idle: "Standing by", listening: "Listening…", speaking: "Speaking…" };

// ---------- Wire up Gideon ----------

const gideon = new Gideon({
  onResult: respond,
  onInterim: showInterim,
  onStateChange: (state) => {
    panel.dataset.state = state;
    if (state === "speaking") Ambience.speakStart();
    else Ambience.speakEnd();
    statusText.textContent = wakeToggle.checked && state === "idle" ? 'Say "Gideon…"' : STATUS_LABELS[state];
  },
  onError: (err) => {
    const messages = {
      "not-allowed": "I need microphone access. Please allow it in your browser settings.",
      "unsupported": "Voice input isn't supported in this browser. Try Chrome or Edge, or type below.",
      "network": "Speech recognition needs an internet connection.",
    };
    say(messages[err] || `Something went wrong: ${err}`);
  },
});

// Context object passed to commands, so commands.js can control the site
const ctx = {
  goTo,
  back,
  highlight,
  stopSpeaking: () => gideon.stopSpeaking(),
  sectionIntro: (id) => SECTION_INTROS[id],
};

const ENTER_GAME = /\b(enter the ruins|return to the ruins|(play|start|begin|enter|return to) the (game|trial|journey|quest|ruins))\b/i;

function respond(text) {
  addLine(text, "user");

  // While the game runs, it gets every word
  if (Game.active) return Game.handle(text);
  if (ENTER_GAME.test(text)) return Game.start();

  let reply = handleCommand(text, ctx);
  if (reply === undefined) {
    reply = "I'm sorry, I didn't understand that. Say 'help' to hear what I can do.";
  }
  if (reply) say(reply);
}

// ---------- Inputs ----------

/** Start the mic level meter (orb animation + the game's clap detection). */
function startMic() {
  gideon.startVisualizer(level => orb.style.setProperty("--level", level));
}

orb.addEventListener("click", () => {
  startMic();
  gideon.listening ? gideon.stopListening() : gideon.listen();
});

// Spacebar = push to talk (unless typing in the text box)
document.addEventListener("keydown", (e) => {
  if (!booted) return; // the boot screen's button handles Space/Enter itself
  if (e.code === "Space" && document.activeElement !== textInput) {
    e.preventDefault();
    orb.click();
  }
});

textForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (text) respond(text);
  textInput.value = "";
});

wakeToggle.addEventListener("change", () => {
  startMic();
  gideon.setWakeMode(wakeToggle.checked);
  say(wakeToggle.checked ? 'Wake mode on. Say "Gideon" followed by a command.' : "Wake mode off.");
});

voiceToggle.addEventListener("change", () => {
  gideon.setMuted(!voiceToggle.checked);
  Ambience.setMuted(!voiceToggle.checked);
});

// ---------- Startup ----------

// Browsers block audio until the user interacts with the page, so Gideon
// speaks only after one of the boot screen's buttons is clicked.
let booted = false;

function greeting() {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return gideon.supported
    ? `${part}. I am Gideon. Click the orb or press space, then tell me where you'd like to go. Or say "enter the ruins" to play the game.`
    : `${part}. I am Gideon. Voice input isn't available in this browser, but you can type commands and I'll answer out loud.`;
}

// "Speak Plainly": the normal portfolio
bootBtn.addEventListener("click", () => {
  booted = true;
  Ambience.init();
  boot.classList.add("hidden");
  say(greeting());
});

// "Begin the Trial": the game
bootGameBtn.addEventListener("click", () => {
  booted = true;
  Ambience.init();
  boot.classList.add("hidden");
  Game.start();
});
bootGameBtn.focus();

enterGameBtn.addEventListener("click", () => Game.start());

// Support deep links like index.html#projects
const initial = location.hash.slice(1);
if (initial && document.getElementById(initial)) goTo(initial, { record: false });

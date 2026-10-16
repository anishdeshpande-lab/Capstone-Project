/*
 * app.js — glues Gideon (voice) to the website (sections, UI).
 */

// Refuse to run inside another website's frame. Otherwise a malicious page could
// embed this one invisibly and trick a visitor into clicking "allow microphone/camera".
// (Same-site frames are fine; reading a cross-site parent's location throws.)
const framedByOtherSite = (() => {
  try { return window.top !== window.self && window.top.location.origin !== location.origin; }
  catch { return true; }
})();
if (framedByOtherSite) {
  const msg = document.createElement("p");
  msg.style.cssText = "padding:2rem;font-family:sans-serif;color:#f5f5f7;background:#000;min-height:100vh";
  msg.textContent = "This site can't be shown inside another page. Open it directly in its own tab.";
  document.body.replaceChildren(msg);
  throw new Error("Blocked: page is framed by another site");
}

const MAX_INPUT = 300;      // characters of speech/typing we'll process at once
const MAX_LINES = 80;       // transcript lines kept on screen

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
const bootMidnightBtn = document.getElementById("boot-midnight");
const enterMidnightBtn = document.getElementById("enter-midnight");

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

// ---------- Navigation: one long page, Gideon scrolls to each part ----------

const navHistory = [];
let current = "home";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const sections = [...document.querySelectorAll(".section")];
const scrollBehavior = () => (reducedMotion.matches ? "auto" : "smooth");

function goTo(id, { record = true, instant = false } = {}) {
  const target = document.getElementById(id);
  if (!target) return;
  if (record && id !== current) navHistory.push(current);
  setCurrent(id);
  target.scrollIntoView({ behavior: instant ? "auto" : scrollBehavior(), block: "start" });
}

/** Mark a section as current: nav highlight, sliding indicator, and the URL hash. */
function setCurrent(id) {
  current = id;
  document.querySelectorAll(".topbar a").forEach(a =>
    a.classList.toggle("current", a.dataset.section === id)
  );
  moveIndicator();
  history.replaceState(null, "", `#${id}`);
}

// Scroll spy: whichever section has crossed the upper third of the screen is "current"
let spyQueued = false;
function spy() {
  spyQueued = false;
  if (document.body.classList.contains("in-game") || document.body.classList.contains("in-midnight")) return;
  const line = innerHeight * 0.35;
  let id = sections[0].id;
  for (const s of sections) if (s.getBoundingClientRect().top <= line) id = s.id;
  if (id !== current) setCurrent(id);
}
addEventListener("scroll", () => {
  if (!spyQueued) { spyQueued = true; requestAnimationFrame(spy); }
}, { passive: true });

// Gradient bar under the current section's link
const navEl = document.querySelector(".topbar nav");
const indicator = navEl.appendChild(Object.assign(document.createElement("span"), { className: "nav-indicator" }));
function moveIndicator() {
  const link = navEl.querySelector(`a[data-section="${current}"]`);
  if (!link) { indicator.style.opacity = 0; return; }
  indicator.style.opacity = 1;
  indicator.style.width = `${link.offsetWidth}px`;
  indicator.style.transform = `translate(${link.offsetLeft}px, ${link.offsetTop + link.offsetHeight}px)`;
  // On phones the nav scrolls sideways: keep the current link in view
  if (navEl.scrollWidth > navEl.clientWidth) {
    navEl.scrollTo({ left: link.offsetLeft - (navEl.clientWidth - link.offsetWidth) / 2, behavior: "smooth" });
  }
}
window.addEventListener("resize", moveIndicator);
document.fonts?.ready.then(moveIndicator); // link widths change once the web fonts load

function back() {
  const prev = navHistory.pop();
  if (!prev) return false;
  goTo(prev, { record: false });
  return true;
}

function highlight(el) {
  document.querySelectorAll(".card.highlight").forEach(c => c.classList.remove("highlight"));
  el.classList.add("highlight", "in"); // "in": make sure it's revealed even if we jump straight to it

  if (el.classList.contains("stack-card")) {
    // Sticky project cards: scroll to the point where this card has just landed on top of the stack
    const cards = [...el.parentElement.children];
    let y = el.parentElement.getBoundingClientRect().top + scrollY;
    for (const c of cards) {
      if (c === el) break;
      y += c.offsetHeight + parseFloat(getComputedStyle(c).marginBottom);
    }
    window.scrollTo({ top: y - parseFloat(getComputedStyle(el).top), behavior: scrollBehavior() });
  } else {
    el.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
  }
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
  div.textContent = text; // always textContent, never innerHTML: input is shown as text, never run as code
  transcript.appendChild(div);
  while (transcript.childElementCount > MAX_LINES) transcript.firstElementChild.remove();
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
  onInterim: (text) => {
    text = text.slice(0, MAX_INPUT);
    showInterim(text);
    if (Midnight.active) Midnight.handleInterim(text);
  },
  onStateChange: (state) => {
    panel.dataset.state = state;
    if (state !== "idle") panel.classList.remove("collapsed"); // open the panel when she listens or talks
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

const ENTER_MIDNIGHT = /\b((open|read) the book|midnight reading)\b/i;
const ENTER_GAME = /\b(enter the ruins|return to the ruins|(play|start|begin|enter|return to) the (game|trial|journey|quest|ruins))\b/i;

function respond(text) {
  text = String(text ?? "").slice(0, MAX_INPUT).trim();
  if (!text) return;
  addLine(text, "user");

  // While a game mode runs, it gets every word
  if (Midnight.active) return Midnight.handleFinal(text);
  if (Game.active) return Game.handle(text);
  if (ENTER_MIDNIGHT.test(text)) return Midnight.open();
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
  if (!booted || Midnight.active) return; // boot screen buttons / reading mode handle their own keys
  // Leave Space alone on buttons, links, and form fields so keyboard users can still press them
  if (e.code === "Space" && !e.target.closest("input, textarea, select, button, a, [contenteditable]")) {
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
    ? `${part}. I am Gideon. Scroll to explore, or press space and tell me where you'd like to go. Or say "enter the ruins" to play the game.`
    : `${part}. I am Gideon. Voice input isn't available in this browser, but you can type commands and I'll answer out loud.`;
}

/** Hide the boot screen and play the hero's entrance (it shows behind any game mode too). */
function dismissBoot() {
  booted = true;
  Ambience.init();
  boot.classList.add("hidden");
  document.body.classList.add("loaded");
  moveIndicator();
}

// "Speak Plainly": the normal portfolio
bootBtn.addEventListener("click", () => {
  dismissBoot();
  say(greeting());
});

// "Begin the Trial": the game
bootGameBtn.addEventListener("click", () => {
  dismissBoot();
  Game.start();
});
bootGameBtn.focus();

enterGameBtn.addEventListener("click", () => Game.start());

// "The Midnight Reading": the horror mode
bootMidnightBtn.addEventListener("click", () => {
  dismissBoot();
  Midnight.open();
});
enterMidnightBtn.addEventListener("click", () => Midnight.open());

// Gideon's panel collapses to just the orb so it never covers the page
document.getElementById("console-close").addEventListener("click", () => panel.classList.add("collapsed"));

// Support deep links like index.html#projects
const initial = location.hash.slice(1);
if (initial && document.getElementById(initial)) goTo(initial, { record: false, instant: true });

/*
 * game.js — the engine for "The Shattered Chronicle".
 *
 * Walks the player through STORY (story.js) one chapter at a time.
 * While the game is active, app.js hands everything the player says
 * to Game.handle() instead of the normal portfolio commands.
 *
 * Phases:
 *   "trial"   waiting for the answer to the current chapter's challenge
 *   "reward"  a shard was just restored; waiting for "onward"
 *   "finale"  every shard found
 *
 * Relies on globals from app.js (gideon, say, addLine, goTo, startMic)
 * and from commands.js (findTopic). They're only used inside functions,
 * so load order between the files doesn't matter.
 */

const Game = (() => {
  const SAVE_KEY = "gideon-chronicle-save";
  const NUMERALS = ["Prologue", "Chapter I", "Chapter II", "Chapter III", "Chapter IV", "Chapter V", "Chapter VI", "Chapter VII", "Chapter VIII"];
  const WRONG = [
    "The stone does not answer.",
    "Nothing stirs. Try again, wanderer.",
    "That is not the answer this place seeks.",
  ];
  const GAME_VOICE = { rate: 0.82, pitch: 0.68, pause: 550 };   // slower, lower, and more deliberate: an ancient warden
  const SHARD_CHAPTERS = STORY.filter(c => c.reward);

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    game: $("game"),
    banner: $("area-banner"),
    bannerTitle: $("area-title"),
    bannerSub: $("area-sub"),
    chapter: $("g-chapter"),
    dialogue: $("g-dialogue"),
    prompt: $("g-prompt"),
    drum: $("g-drum"),
    pips: $("g-pips"),
    memory: $("g-memory"),
    memoryName: $("memory-name"),
    memoryBody: $("memory-body"),
    finale: $("g-finale"),
    action: $("g-action"),
    shards: $("shard-track"),
    embers: $("embers"),
  };

  let state = load();
  let phase = "trial";
  let active = false;
  let hintIndex = 0;
  let wrongCount = 0;

  // ---------- Save / load (per-browser, best effort) ----------

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (saved && Array.isArray(saved.shards)) return saved;
    } catch { /* storage blocked or corrupt */ }
    return { chapter: 0, shards: [], complete: false };
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }

  // ---------- Presentation helpers ----------

  /** Elden-Ring-style location card that fades in and out. */
  function showBanner(title, subtitle, gold = false) {
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = subtitle || "";
    el.banner.classList.toggle("gold", gold);
    el.banner.classList.remove("show");
    void el.banner.offsetWidth; // restart the CSS animation
    el.banner.classList.add("show");
  }

  /** Narrate several lines as ONE utterance so nothing interrupts mid-speech. */
  function narrate(lines) {
    lines.forEach(l => addLine(l, "gideon"));
    return gideon.speak(lines.join(" "));
  }

  function setDialogue(lines) {
    el.dialogue.replaceChildren(...lines.map(l => {
      const p = document.createElement("p");
      p.textContent = l;
      return p;
    }));
  }

  function setAction(label) {
    el.action.hidden = !label;
    el.action.textContent = label || "";
  }

  function renderShards(justFound) {
    el.shards.replaceChildren(...SHARD_CHAPTERS.map(ch => {
      const d = document.createElement("span");
      const found = state.shards.includes(ch.reward.name);
      d.className = "shard" + (found ? " found" : "") + (ch.reward.name === justFound ? " new" : "");
      d.title = found ? ch.reward.name : "Undiscovered shard";
      return d;
    }));
  }

  function spawnEmbers() {
    if (el.embers.childElementCount) return;
    for (let i = 0; i < 28; i++) {
      const e = document.createElement("span");
      e.style.left = `${Math.random() * 100}%`;
      e.style.animationDuration = `${8 + Math.random() * 10}s`;
      e.style.animationDelay = `${-Math.random() * 18}s`;
      e.style.setProperty("--drift", `${(Math.random() - 0.5) * 120}px`);
      el.embers.appendChild(e);
    }
  }

  // ---------- Flow ----------

  function start() {
    active = true;
    startMic(); // needed for the drum trial; also asks for mic permission up front
    gideon.voiceStyle = GAME_VOICE;
    Ambience.setScene("ruins");
    document.body.classList.add("in-game");
    el.game.hidden = false;
    spawnEmbers();
    renderShards();

    // If they left right after earning a shard, resume at the next chapter
    let i = state.chapter;
    const reward = STORY[i]?.reward;
    if (reward && state.shards.includes(reward.name)) i++;

    if (state.complete || i >= STORY.length) return finale(["Welcome back, wanderer. The chronicle remains whole."]);
    const intro = i > 0
      ? [`Welcome back, wanderer. You have restored ${state.shards.length} of ${SHARD_CHAPTERS.length} shards. Let us continue.`]
      : [];
    playChapter(i, intro);
  }

  function exit() {
    active = false;
    stopRhythm();
    gideon.stopSpeaking();
    gideon.voiceStyle = null;
    Ambience.setScene(null);
    document.body.classList.remove("in-game");
    el.game.hidden = true;
    goTo("home");
    say("Very well. Here is the chronicle of Anish Deshpande, plainly. Say \"enter the ruins\" to return to the trial at any time.");
  }

  function playChapter(i, introLines = []) {
    const ch = STORY[i];
    state.chapter = i;
    save();
    phase = "trial";
    hintIndex = 0;
    wrongCount = 0;

    el.chapter.textContent = NUMERALS[i] || "";
    showBanner(ch.title, ch.subtitle);
    setDialogue(ch.lines);
    el.prompt.textContent = ch.trial.prompt;
    el.memory.hidden = true;
    el.finale.hidden = true;
    setAction(i === 0 ? "I am ready" : null);

    if (ch.trial.type === "rhythm") startRhythm();
    else stopRhythm();

    narrate([...introLines, ...ch.lines, ch.trial.prompt]);
  }

  function succeed() {
    const ch = STORY[state.chapter];
    stopRhythm();

    // The prologue has no shard: go straight to chapter one
    if (!ch.reward) return playChapter(state.chapter + 1, [ch.success]);

    phase = "reward";
    if (!state.shards.includes(ch.reward.name)) state.shards.push(ch.reward.name);
    save();
    renderShards(ch.reward.name);

    // Pull the real resume content off the portfolio page
    const source = ch.reward.topic ? findTopic(ch.reward.topic) : document.querySelector(ch.reward.selector);
    const memoryText = ch.reward.say || source?.dataset.say || "";
    el.memoryName.textContent = ch.reward.name;
    el.memoryBody.replaceChildren();
    if (source) {
      const copy = source.cloneNode(true);
      copy.classList.remove("highlight");
      // Strip voice metadata so findTopic() never matches this copy instead of the real card
      ["data-topic", "data-say", "data-project"].forEach(a => copy.removeAttribute(a));
      el.memoryBody.appendChild(copy);
    }
    el.memory.hidden = false;
    el.prompt.textContent = "";
    setAction("Onward");
    showBanner("Memory Restored", ch.reward.name, true);

    narrate([ch.success, memoryText, "Say \"onward\" when you are ready to continue."]);
  }

  function next() {
    if (state.chapter + 1 < STORY.length) playChapter(state.chapter + 1);
    else finale();
  }

  function finale(introLines = []) {
    phase = "finale";
    state.complete = true;
    save();
    stopRhythm();

    el.chapter.textContent = "Epilogue";
    showBanner(FINALE.title, FINALE.subtitle, true);
    setDialogue(FINALE.lines);
    el.prompt.textContent = FINALE.prompt;
    el.memory.hidden = true;
    el.finale.hidden = false;
    setAction("Send a raven");

    narrate([...introLines, ...FINALE.lines, FINALE.prompt]);
  }

  function restart() {
    state = { chapter: 0, shards: [], complete: false };
    save();
    renderShards();
    playChapter(0, ["The shards scatter once more. Let us begin again."]);
  }

  function sendRaven() {
    say("The raven takes flight. Your message will find the scholar.");
    window.location.href = "mailto:anishdeshpande8@gmail.com?subject=" + encodeURIComponent("A raven from the ruins");
  }

  function hint() {
    if (phase === "reward") return say("Say \"onward\" to continue your journey.");
    if (phase === "finale") return say(FINALE.prompt);
    const hints = STORY[state.chapter].trial.hints;
    say(hints[Math.min(hintIndex++, hints.length - 1)]);
  }

  function wrong(reply) {
    wrongCount++;
    let line = reply || WRONG[Math.floor(Math.random() * WRONG.length)];
    if (wrongCount === 2) line += " Say \"hint\" if you need guidance.";
    say(line);
  }

  // ---------- Input ----------

  /** Handle what the player said or typed. */
  function handle(raw) {
    const t = raw.toLowerCase().replace(/[.,!?'"]/g, "").replace(/^(hey |ok |okay )?gideon\s*/, "").trim();
    if (!t) return say("I am listening, wanderer.");

    // Commands that work anywhere in the game
    if (/\b(speak plainly|plainly|(exit|quit|leave) the (game|ruins))\b/.test(t)) return exit();
    if (/^(stop|quiet|be quiet|silence)$/.test(t)) return gideon.stopSpeaking();
    if (/\b(hint|clue|help|stuck)\b/.test(t)) return hint();
    if (/\b(begin anew|start over|restart)\b/.test(t)) return restart();
    if (/\b(repeat|say that again|what was the (riddle|question))\b/.test(t)) {
      return say(phase === "finale" ? FINALE.prompt : phase === "reward" ? "Say \"onward\" to continue." : STORY[state.chapter].trial.prompt);
    }
    if (/\b(how many|progress|what have i found|shards)\b/.test(t)) {
      return say(`You have restored ${state.shards.length} of ${SHARD_CHAPTERS.length} shards.`);
    }

    if (phase === "reward") {
      if (/\b(onward|continue|next|ready|yes|go|proceed)\b/.test(t)) return next();
      return say("Say \"onward\" when you are ready to continue.");
    }

    if (phase === "finale") {
      if (/\b(raven|email|message|contact|write)\b/.test(t)) return sendRaven();
      return say(FINALE.prompt);
    }

    // phase === "trial"
    const trial = STORY[state.chapter].trial;
    if (trial.answers.test(t)) return succeed();
    const special = trial.special?.find(s => s.pattern.test(t));
    wrong(special?.reply);
  }

  // Button: does whatever the current phase's main action is
  el.action.addEventListener("click", () => {
    if (phase === "reward") next();
    else if (phase === "finale") sendRaven();
    else if (state.chapter === 0) succeed();
  });
  $("g-hint").addEventListener("click", hint);
  $("g-plain").addEventListener("click", exit);

  // ---------- Rhythm trial: three strikes on the drum ----------

  const HITS_NEEDED = 3;
  let hits = 0;
  let lastHit = 0;
  let armed = true;
  let quietSince = 0;
  let rhythmLoop = null;

  function startRhythm() {
    hits = 0;
    renderPips();
    el.drum.hidden = false;
    el.pips.hidden = false;
    cancelAnimationFrame(rhythmLoop);

    const tick = () => {
      const now = performance.now();
      // Ignore the mic while Gideon talks (and briefly after), or she'd "clap" for you
      if (gideon.speaking) quietSince = now;
      else if (now - quietSince > 600) {
        const peak = gideon.peak || 0;
        if (armed && peak > 0.55) { armed = false; registerHit(); }
        else if (!armed && peak < 0.2) armed = true;
      }
      rhythmLoop = requestAnimationFrame(tick);
    };
    rhythmLoop = requestAnimationFrame(tick);
  }

  function stopRhythm() {
    cancelAnimationFrame(rhythmLoop);
    rhythmLoop = null;
    el.drum.hidden = true;
    el.pips.hidden = true;
  }

  function registerHit() {
    if (phase !== "trial" || !rhythmLoop) return;
    const now = performance.now();
    if (now - lastHit < 150) return;               // one clap, not one per frame
    if (now - lastHit > 3000) hits = 0;            // strikes must come together
    lastHit = now;
    hits++;
    renderPips();
    el.drum.classList.remove("hit");
    void el.drum.offsetWidth;
    el.drum.classList.add("hit");
    if (hits >= HITS_NEEDED) setTimeout(succeed, 400);
  }

  function renderPips() {
    el.pips.replaceChildren(...Array.from({ length: HITS_NEEDED }, (_, i) => {
      const p = document.createElement("span");
      if (i < hits) p.className = "lit";
      return p;
    }));
  }

  el.drum.addEventListener("click", registerHit);

  return {
    start,
    exit,
    handle,
    get active() { return active; },
  };
})();

/*
 * midnight.js — "The Midnight Reading", a horror mode.
 *
 * Read the book aloud, line by line (speech recognition follows along).
 * Meanwhile, monsters in NOBE shirts creep in from the left window and the
 * right doorway. Look at a monster to hold it back (webcam gaze tracking via
 * MediaPipe Face Landmarker, all processed on-device). Leave one unwatched
 * too long and it jumpscares you.
 *
 * No camera? Hold the ← / → arrow keys (or hover the mouse over a monster) to look.
 *
 * Self-contained: delete this file, css/midnight.css, and the few lines that
 * reference `Midnight` in index.html / app.js to remove the mode entirely.
 */

const Midnight = (() => {
  // ---------- The book: Anish's chronicle, a few short lines per page ----------
  const PAGES = [
    { title: "I. The Scholar", lines: [
      "This is the chronicle of Anish Deshpande.",
      "Anish studies Information Sciences and Data Science at the University of Illinois.",
      "Before that, Anish studied Data Sciences at Penn State.",
    ] },
    { title: "II. The Spells", lines: [
      "Anish writes code in Python and SQL.",
      "Pandas and NumPy help Anish tame wild data.",
      "Messy spreadsheets become clean and organized datasets.",
    ] },
    { title: "III. The Thunder", lines: [
      "Anish counted every drum hit in fifteen Led Zeppelin solos.",
      "The goal was to find the average number of hits.",
      "Anish also built a travel statistics database with SQL.",
    ] },
    { title: "IV. The Rhythm", lines: [
      "Anish played drums in the top jazz band for three years.",
      "Anish led a jazz combo that played gigs around town.",
      "Anish was the first drummer ever in the school pit orchestra.",
    ] },
    { title: "V. The Tribunal", lines: [
      "In Youth and Government, Anish won a case in Court A.",
      "A bill written by Anish passed both chambers unanimously.",
      "Anish also earned the Seal of Biliteracy in Spanish.",
    ] },
  ];

  // ---------- Tuning ----------
  const SCARE_TIME = [8, 7, 6.5, 6, 5.5];   // seconds a monster can go unwatched, per page
  const STARE_TIME = 1.0;                    // seconds of eye contact to banish a monster
  const FIRST_SPAWN = 6;                     // grace period at the start of each page
  const SPAWN_GAP = [6, 11];                 // seconds between monsters (shrinks on later pages)
  const MATCH_RATIO = 0.6;                   // share of a line's key words that must be heard
  const VOICE = { rate: 0.8, pitch: 0.6, pause: 600 };

  const FACE_LIB = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

  // ---------- The monster (inline SVG, reused for both sides and the jumpscare) ----------
  const MONSTER_SVG = `
    <svg viewBox="0 0 200 400" aria-hidden="true">
      <defs>
        <linearGradient id="mn-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stop-color="#07070b" stop-opacity="1" />
          <stop offset="1" stop-color="#07070b" stop-opacity="0" />
        </linearGradient>
      </defs>
      <!-- legs fading into shadow -->
      <rect x="62" y="250" width="30" height="150" fill="url(#mn-fade)" />
      <rect x="108" y="250" width="30" height="150" fill="url(#mn-fade)" />
      <!-- long arms and fingers -->
      <path d="M48 150 Q22 230 30 330 M30 330 l-8 22 M30 330 l0 24 M30 330 l8 22" stroke="#07070b" stroke-width="12" stroke-linecap="round" fill="none" />
      <path d="M152 150 Q178 230 170 330 M170 330 l-8 22 M170 330 l0 24 M170 330 l8 22" stroke="#07070b" stroke-width="12" stroke-linecap="round" fill="none" />
      <!-- the NOBE shirt -->
      <path d="M50 140 L150 140 L172 178 L156 188 L152 172 L156 262 L44 262 L48 172 L44 188 L28 178 Z" fill="#cfcac0" />
      <text x="100" y="218" text-anchor="middle" class="nobe">NOBE</text>
      <!-- neck and head -->
      <rect x="88" y="112" width="24" height="34" fill="#07070b" />
      <ellipse cx="100" cy="70" rx="44" ry="56" fill="#07070b" />
      <!-- eyes -->
      <g class="eyes">
        <ellipse cx="82" cy="64" rx="10" ry="5.5" fill="#f6f0c8" />
        <ellipse cx="118" cy="64" rx="10" ry="5.5" fill="#f6f0c8" />
        <circle cx="82" cy="64" r="2.6" fill="#07070b" />
        <circle cx="118" cy="64" r="2.6" fill="#07070b" />
      </g>
      <!-- a thin, unsettling smile (and a wide-open mouth, shown only in the jumpscare) -->
      <path class="smile" d="M78 98 Q100 110 122 98" stroke="#3a3a46" stroke-width="2.5" fill="none" />
      <ellipse class="mouth" cx="100" cy="102" rx="20" ry="16" fill="#000" />
    </svg>`;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    root: $("midnight"),
    pageLabel: $("mn-page"),
    pageTitle: $("mn-page-title"),
    lines: $("mn-lines"),
    heard: $("mn-heard"),
    typeForm: $("mn-type"),
    typeInput: $("mn-type-input"),
    gaze: $("mn-gaze"),
    video: $("mn-video"),
    panel: $("mn-panel"),
    scare: $("mn-scare"),
    candleL: $("mn-candle-left"),
    candleR: $("mn-candle-right"),
  };
  const monsters = {
    left: { side: "left", el: $("m-left"), active: false, unwatched: 0, stare: 0 },
    right: { side: "right", el: $("m-right"), active: false, unwatched: 0, stare: 0 },
  };
  monsters.left.el.innerHTML = MONSTER_SVG + '<span class="stare-bar"></span>';
  monsters.right.el.innerHTML = MONSTER_SVG + '<span class="stare-bar"></span>';
  el.scare.innerHTML = MONSTER_SVG;

  // ---------- State ----------
  let active = false;
  let phase = "intro";           // intro | loading | calibrate | reading | caught | won
  let page = 0;
  let line = 0;
  let consumed = 0;              // words of the current recognition segment already used
  let gentle = false;            // gentle mode: no jumpscare, just a fade
  let spawnTimer = FIRST_SPAWN;
  let loopId = null;
  let lastT = 0;
  let introSpoken = false;

  // Looking
  let gaze = null;               // "left" | "center" | "right" | null
  const keys = { left: false, right: false };
  const hover = { left: false, right: false };

  // Camera tracking
  let useCamera = false;
  let landmarker = null;
  let stream = null;
  let lastVideoTime = -1;
  let rawGaze = null;            // smoothed gaze signal (+ = player's left)
  let faceSeen = false;
  let calib = null;              // { L, C, R }

  // ---------- Open / close ----------

  function open() {
    active = true;
    phase = "intro";
    document.body.classList.add("in-midnight");
    el.root.hidden = false;
    gideon.voiceStyle = VOICE;
    initAudio();
    showPanel(`
      <h2>The Midnight Reading</h2>
      <p>Read the book aloud, line by line. Something will come for you while you read.</p>
      <p>Monsters in <strong>NOBE</strong> shirts creep in from the <strong>left window</strong> and the <strong>right doorway</strong>.
         <strong>Look at them</strong> to hold them back. Leave one unwatched too long, and…</p>
      <p class="mn-warn">⚠ Contains jump scares and loud sounds. Your camera is used only to tell where you're looking. Video never leaves your device.</p>
      <label class="mn-check"><input type="checkbox" id="mn-gentle" /> Gentle mode (no jump scares)</label>
      <div class="mn-buttons">
        <button class="mn-btn" data-act="camera">Light the candles (use camera)</button>
        <button class="mn-btn ghost" data-act="keys">Play without camera (← → keys)</button>
        <button class="mn-btn ghost" data-act="leave">Leave</button>
      </div>`);
    if (!loopId) { lastT = performance.now(); loopId = requestAnimationFrame(loop); }
  }

  function exit() {
    active = false;
    phase = "intro";
    introSpoken = false;
    gideon.setDictation(false);
    gideon.voiceStyle = null;
    cancelAnimationFrame(loopId);
    loopId = null;
    stopCamera();
    resetMonsters();
    audio?.ctx.suspend();
    el.scare.hidden = true;
    el.root.hidden = true;
    document.body.classList.remove("in-midnight");
    goTo("home");
    say("You closed the book. The house is quiet again.");
  }

  async function begin(withCamera) {
    gentle = $("mn-gentle")?.checked || false;
    audio?.ctx.resume();
    if (withCamera) {
      phase = "loading";
      showPanel(`<h2>Summoning the watchers…</h2><p>Loading face tracking. Allow camera access if your browser asks.</p>`);
      useCamera = await startCamera();
      if (useCamera) return calibrate();
      showPanel(`
        <h2>The candles won't light</h2>
        <p>I couldn't start the camera or face tracking. You can still play: hold <kbd>←</kbd> or <kbd>→</kbd> to look left or right.</p>
        <div class="mn-buttons"><button class="mn-btn" data-act="start">Begin reading</button></div>`);
      return;
    }
    useCamera = false;
    startReading();
  }

  // ---------- Camera + gaze ----------

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
      el.video.srcObject = stream;
      await el.video.play();

      const vision = await import(`${FACE_LIB}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${FACE_LIB}/wasm`);
      const options = (delegate) => ({
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });
      try {
        landmarker = await vision.FaceLandmarker.createFromOptions(fileset, options("GPU"));
      } catch {
        landmarker = await vision.FaceLandmarker.createFromOptions(fileset, options("CPU"));
      }
      el.video.classList.add("on");
      return true;
    } catch (err) {
      console.warn("Midnight Reading: camera/face tracking unavailable", err);
      stopCamera();
      return false;
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    el.video.classList.remove("on");
    el.video.srcObject = null;
  }

  /** Called every frame: updates rawGaze from the newest video frame. */
  function track() {
    if (!landmarker || !stream || el.video.readyState < 2) return;
    if (el.video.currentTime === lastVideoTime) return;
    lastVideoTime = el.video.currentTime;

    const result = landmarker.detectForVideo(el.video, performance.now());
    const lm = result.faceLandmarks?.[0];
    faceSeen = Boolean(lm);
    if (!lm) return;

    // Head turn: where the nose sits between the two sides of the face.
    // (Camera image is un-mirrored, so turning to the player's left moves the nose right.)
    const a = lm[234], b = lm[454], nose = lm[1];
    const yaw = (nose.x - (a.x + b.x) / 2) / Math.abs(b.x - a.x);

    // Eye direction from blendshapes: looking to the player's left = left eye "out" + right eye "in"
    const bs = Object.fromEntries((result.faceBlendshapes?.[0]?.categories || []).map(c => [c.categoryName, c.score]));
    const eyes = ((bs.eyeLookOutLeft || 0) + (bs.eyeLookInRight || 0) - (bs.eyeLookInLeft || 0) - (bs.eyeLookOutRight || 0)) / 2;

    const g = yaw + eyes * 0.25;
    rawGaze = rawGaze === null ? g : rawGaze * 0.7 + g * 0.3;
  }

  function classifyGaze() {
    if (!useCamera || rawGaze === null || !faceSeen) return null;
    const { L, C, R } = calib || { L: 0.12, C: 0, R: -0.12 };
    if ((rawGaze - C) / (L - C) > 0.55) return "left";
    if ((rawGaze - C) / (R - C) > 0.55) return "right";
    return "center";
  }

  async function calibrate() {
    phase = "calibrate";
    const steps = [
      ["L", "Look at the <strong>left</strong> candle", el.candleL],
      ["C", "Look at the <strong>book</strong>", null],
      ["R", "Look at the <strong>right</strong> candle", el.candleR],
    ];
    const result = {};
    for (const [key, text, candle] of steps) {
      if (!active) return;
      showPanel(`<h2>${text}</h2><p>Turn your head and eyes toward it and hold still…</p>`, "calibrating");
      candle?.classList.add("target");
      await wait(1200);
      const samples = [];
      const until = performance.now() + 1000;
      while (performance.now() < until) {
        if (faceSeen && rawGaze !== null) samples.push(rawGaze);
        await wait(50);
      }
      candle?.classList.remove("target");
      if (!samples.length) {
        showPanel(`
          <h2>I can't see your face</h2>
          <p>Make sure your face is lit and in view of the camera, then try again. Or play with the arrow keys instead.</p>
          <div class="mn-buttons">
            <button class="mn-btn" data-act="calibrate">Try again</button>
            <button class="mn-btn ghost" data-act="keys">Use arrow keys</button>
          </div>`);
        return;
      }
      samples.sort((x, y) => x - y);
      result[key] = samples[Math.floor(samples.length / 2)];
    }

    // Weak or reversed calibration: fall back to sensible defaults around the center
    const weak = Math.abs(result.L - result.C) < 0.02 || Math.abs(result.R - result.C) < 0.02 ||
                 Math.sign(result.L - result.C) === Math.sign(result.R - result.C);
    calib = weak ? { L: result.C + 0.12, C: result.C, R: result.C - 0.12 } : result;
    if (weak) console.info("Midnight Reading: weak calibration, using defaults", result);
    startReading();
  }

  // ---------- Reading ----------

  const STOP = new Set(["the", "a", "an", "and", "of", "in", "at", "to", "with", "that", "was", "is", "also", "every", "both", "number", "ever", "be", "this", "by", "for", "anish", "deshpande"]);
  const NUMS = { 3: "three", 15: "fifteen", 1: "one", 2: "two", 5: "five" };

  function words(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean)
      .map(w => NUMS[w] || w);
  }
  const keyWords = (text) => words(text).filter(w => !STOP.has(w));

  /** How much of `target` appears in `spoken`; returns { ok, end } where end = index after the last match. */
  function matchLine(target, spoken) {
    const want = keyWords(target);
    const set = new Set(want);
    let hits = 0, end = 0;
    const seen = new Set();
    spoken.forEach((w, i) => {
      if (set.has(w) && !seen.has(w)) { seen.add(w); hits++; end = i + 1; }
    });
    return { ok: want.length > 0 && hits / want.length >= MATCH_RATIO, end };
  }

  /** Feed recognized words in; advances through as many lines as they cover. */
  function hear(text, isFinal) {
    if (phase !== "reading") return;
    el.heard.textContent = text ? `“${text}”` : "";
    let spoken = words(text).slice(consumed);
    let used = consumed;
    let m;
    while (phase === "reading" && spoken.length && (m = matchLine(PAGES[page].lines[line], spoken)).ok) {
      used += m.end;
      spoken = spoken.slice(m.end);
      advance();
    }
    consumed = isFinal ? 0 : used;
  }

  function startReading(fromPage = page) {
    page = fromPage;
    line = 0;
    consumed = 0;
    phase = "reading";
    hidePanel();
    resetMonsters();
    spawnTimer = FIRST_SPAWN;
    renderPage();

    const go = () => { if (phase === "reading") gideon.setDictation(true); };
    if (!introSpoken) {
      introSpoken = true;
      addLine("Read the book aloud, every line. And whatever you do, keep watching the dark.", "gideon");
      gideon.speak("Read the book aloud, every line. And whatever you do... keep watching the dark.").then(go);
    } else go();
  }

  function renderPage() {
    el.pageLabel.textContent = `Page ${page + 1} of ${PAGES.length}`;
    el.pageTitle.textContent = PAGES[page].title;
    el.lines.replaceChildren(...PAGES[page].lines.map((t, i) => {
      const p = document.createElement("p");
      p.textContent = t;
      p.className = i < line ? "done" : i === line ? "current" : "todo";
      return p;
    }));
    el.lines.parentElement.classList.remove("turn");
    void el.lines.offsetWidth;
    el.lines.parentElement.classList.add("turn");
  }

  function advance() {
    line++;
    if (line >= PAGES[page].lines.length) {
      page++;
      line = 0;
      consumed = 0;
      if (page >= PAGES.length) return won();
      sfx.pageTurn();
      spawnTimer = Math.max(spawnTimer, 3); // a breath after each page turn
    }
    renderPage();
  }

  // ---------- Monsters ----------

  function resetMonsters() {
    Object.values(monsters).forEach(m => {
      m.active = false; m.unwatched = 0; m.stare = 0;
      m.el.classList.remove("present", "watched", "banished");
      m.el.style.setProperty("--p", 0);
      m.el.style.setProperty("--stare", 0);
    });
  }

  function isWatching(side) {
    return gaze === side || keys[side] || hover[side];
  }

  function spawn() {
    const free = Object.values(monsters).filter(m => !m.active);
    const anyActive = free.length < 2;
    if (!free.length || (page < 2 && anyActive)) return false; // one at a time on early pages
    const m = free[Math.floor(Math.random() * free.length)];
    m.active = true; m.unwatched = 0; m.stare = 0;
    m.el.classList.remove("banished");
    m.el.classList.add("present");
    sfx.creak(m.side);
    return true;
  }

  function banish(m) {
    m.active = false;
    m.el.classList.remove("present", "watched");
    m.el.classList.add("banished");
    sfx.hiss();
  }

  function updateMonsters(dt) {
    const scareAt = SCARE_TIME[page] ?? 5;
    let danger = 0;
    for (const m of Object.values(monsters)) {
      if (!m.active) continue;
      const watched = isWatching(m.side);
      m.el.classList.toggle("watched", watched);
      if (watched) {
        m.stare += dt;
        m.unwatched = Math.max(0, m.unwatched - dt * 1.5);
        if (m.stare >= STARE_TIME) { banish(m); continue; }
      } else {
        m.stare = Math.max(0, m.stare - dt * 0.5);
        m.unwatched += dt;
        if (m.unwatched >= scareAt) return caught();
      }
      const p = m.unwatched / scareAt;
      danger = Math.max(danger, p);
      m.el.style.setProperty("--p", p.toFixed(3));
      m.el.style.setProperty("--stare", (m.stare / STARE_TIME).toFixed(3));
    }
    el.root.style.setProperty("--danger", danger.toFixed(3));
    sfx.heartbeat(danger);

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      const shrink = page * 0.8;
      spawnTimer = spawn()
        ? SPAWN_GAP[0] - shrink + Math.random() * (SPAWN_GAP[1] - SPAWN_GAP[0])
        : 1.5;
    }
  }

  // ---------- Endings ----------

  function caught() {
    phase = "caught";
    gideon.setDictation(false);
    resetMonsters();
    el.root.style.setProperty("--danger", 0);
    const after = () => showPanel(`
      <h2>A NOBE caught you.</h2>
      <p>The candles gutter out. The book falls shut at page ${page + 1}.</p>
      <div class="mn-buttons">
        <button class="mn-btn" data-act="retry">Read this page again</button>
        <button class="mn-btn ghost" data-act="leave">Leave the book</button>
      </div>`, "caught");

    if (gentle) { sfx.soft(); return after(); }
    el.scare.hidden = false;
    el.scare.classList.remove("go");
    void el.scare.offsetWidth;
    el.scare.classList.add("go");
    sfx.scream();
    setTimeout(() => { el.scare.hidden = true; after(); }, 1300);
  }

  function won() {
    phase = "won";
    gideon.setDictation(false);
    resetMonsters();
    el.root.style.setProperty("--danger", 0);
    showPanel(`
      <h2>Dawn breaks.</h2>
      <p>The NOBEs fade with the night. You read the whole chronicle of Anish Deshpande, and lived.</p>
      <p>Email: <a href="mailto:anishdeshpande8@gmail.com">anishdeshpande8@gmail.com</a><br />
         GitHub: <a href="https://github.com/anishdeshpande-lab" target="_blank" rel="noopener">anishdeshpande-lab</a></p>
      <div class="mn-buttons">
        <button class="mn-btn" data-act="restart">Read it again</button>
        <button class="mn-btn ghost" data-act="leave">Leave the book</button>
      </div>`, "won");
    say("Dawn breaks. You survived the night, and finished the chronicle.");
  }

  // ---------- Main loop ----------

  function loop(t) {
    const dt = Math.min((t - lastT) / 1000, 0.1); // cap: no giant jumps after a hidden tab
    lastT = t;
    track();
    gaze = classifyGaze();
    const looking = keys.left || hover.left ? "left" : keys.right || hover.right ? "right" : gaze;
    el.gaze.textContent = useCamera && !faceSeen ? "Looking: can't see you"
      : `Looking: ${looking === "left" ? "← left" : looking === "right" ? "right →" : "the book"}`;
    if (phase === "reading" && !document.hidden) updateMonsters(dt);
    loopId = requestAnimationFrame(loop);
  }

  // ---------- Panel + inputs ----------

  function showPanel(html, kind = "") {
    el.panel.innerHTML = html;
    el.panel.className = `mn-panel ${kind}`;
    el.panel.hidden = false;
    // Hide the book behind panels, except during calibration (one step is "look at the book")
    el.root.classList.toggle("panel-open", kind !== "calibrating");
  }
  function hidePanel() {
    el.panel.hidden = true;
    el.root.classList.remove("panel-open");
  }

  el.panel.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "camera") begin(true);
    else if (act === "keys") { useCamera = false; stopCamera(); begin(false); }
    else if (act === "start") startReading();
    else if (act === "calibrate") calibrate();
    else if (act === "retry") startReading(page);
    else if (act === "restart") startReading(0);
    else if (act === "leave") exit();
  });

  $("mn-skip").addEventListener("click", () => { if (phase === "reading") { consumed = 0; advance(); } });
  $("mn-leave").addEventListener("click", exit);

  el.typeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    hear(el.typeInput.value.slice(0, 300), true);
    el.typeInput.value = "";
  });

  document.addEventListener("keydown", (e) => {
    if (!active || e.target === el.typeInput) return;
    if (e.key === "ArrowLeft") { keys.left = true; e.preventDefault(); }
    if (e.key === "ArrowRight") { keys.right = true; e.preventDefault(); }
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft") keys.left = false;
    if (e.key === "ArrowRight") keys.right = false;
  });
  for (const m of Object.values(monsters)) {
    m.el.addEventListener("mouseenter", () => { hover[m.side] = true; });
    m.el.addEventListener("mouseleave", () => { hover[m.side] = false; });
  }

  // ---------- Sound (generated live; no audio files) ----------

  let audio = null;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  function initAudio() {
    if (audio) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const master = ctx.createGain();
    master.connect(ctx.destination);

    // A low, uneasy room tone
    [41, 41.6].forEach(f => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.value = 0.05;
      o.connect(g).connect(master);
      o.start();
    });
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    audio = { ctx, master, noise, nextBeat: 0 };
  }

  function noiseBurst({ type = "bandpass", from = 800, to = from, q = 1, gain = 0.2, dur = 0.5, pan = 0 }) {
    if (!audio) return;
    const { ctx, master, noise } = audio;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, now);
    f.frequency.exponentialRampToValueAtTime(to, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(master);
    src.start(now);
    src.stop(now + dur + 0.05);
  }

  function tone({ type = "sine", from, to = from, gain = 0.3, dur = 0.3, at = 0 }) {
    if (!audio) return;
    const { ctx, master } = audio;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const sfx = {
    creak: (side) => noiseBurst({ from: 300, to: 1100, q: 12, gain: 0.25, dur: 0.9, pan: side === "left" ? -0.8 : 0.8 }),
    hiss: () => noiseBurst({ type: "highpass", from: 3000, q: 0.5, gain: 0.12, dur: 0.5 }),
    pageTurn: () => noiseBurst({ type: "highpass", from: 1500, to: 4000, q: 0.7, gain: 0.08, dur: 0.18 }),
    soft: () => tone({ from: 220, to: 110, gain: 0.15, dur: 1.2 }),
    heartbeat(danger) {
      if (!audio || danger < 0.2) return;
      const now = audio.ctx.currentTime;
      if (now < audio.nextBeat) return;
      const vol = 0.2 + danger * 0.5;
      tone({ from: 60, to: 40, gain: vol, dur: 0.16 });
      tone({ from: 55, to: 38, gain: vol * 0.7, dur: 0.16, at: 0.2 });
      audio.nextBeat = now + 1.1 - danger * 0.65;
    },
    scream() {
      tone({ type: "sawtooth", from: 1200, to: 180, gain: 0.3, dur: 1.0 });
      tone({ type: "square", from: 900, to: 140, gain: 0.15, dur: 1.0 });
      tone({ from: 70, to: 30, gain: 0.5, dur: 0.8 });
      noiseBurst({ type: "lowpass", from: 6000, to: 400, q: 0.5, gain: 0.35, dur: 0.9 });
    },
  };

  return {
    open,
    exit,
    /** Speech that finished (from app.js respond). */
    handleFinal(text) {
      if (/\b(close the book|leave the book|speak plainly)\b/i.test(text)) return exit();
      hear(text, true);
    },
    /** Speech still in progress, for fast follow-along. */
    handleInterim(text) { hear(text, false); },
    get active() { return active; },
  };
})();

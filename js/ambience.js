/*
 * ambience.js — the mystical sound layer around Gideon's voice.
 *
 * The browser's speech voice can't be run through audio effects, so instead
 * we surround it with sound generated live by the Web Audio API (no audio files):
 *   - a shimmering chime whenever she begins to speak
 *   - a soft, slowly beating drone underneath her words
 *   - in the game: distant wind and a deep hum from the ruins
 * Everything passes through a generated reverb so it sounds like a vast hall.
 */

const Ambience = (() => {
  let ctx = null;
  let master, reverb, padGain, sceneGain;
  let sceneBuilt = false;

  /** Must be called from a click/keypress (browsers block audio otherwise). */
  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    master = ctx.createGain();
    master.connect(ctx.destination);

    // Reverb: a 4-second burst of decaying noise as the "room"
    reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(4, 2.5);
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    reverb.connect(wet).connect(master);

    buildPad();
  }

  function makeImpulse(seconds, decay) {
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function noiseSource() {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  function lfo(freq, depth, target) {
    const osc = ctx.createOscillator();
    const amt = ctx.createGain();
    osc.frequency.value = freq;
    amt.gain.value = depth;
    osc.connect(amt).connect(target);
    osc.start();
  }

  // ---------- The drone under her voice ----------

  function buildPad() {
    padGain = ctx.createGain();
    padGain.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 4;
    lfo(0.15, 250, filter.frequency); // slow "breathing" sweep

    // A minor chord, slightly detuned so it shimmers
    [[110, "sine", 1], [110.7, "sine", 0.8], [164.8, "triangle", 0.35], [220.4, "sine", 0.25]].forEach(([f, type, g]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      gain.gain.value = g;
      osc.connect(gain).connect(filter);
      osc.start();
    });

    filter.connect(padGain);
    padGain.connect(reverb);
    padGain.connect(master);
  }

  // ---------- A shimmer of bell tones ----------

  function chime() {
    const now = ctx.currentTime;
    [880, 1318.5, 1760, 2637].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.07;
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.045 / (i + 1), t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
      osc.connect(gain);
      gain.connect(reverb);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 2.6);
    });
  }

  // ---------- Game scene: wind through the ruins ----------

  function buildScene() {
    sceneBuilt = true;
    sceneGain = ctx.createGain();
    sceneGain.gain.value = 0;
    sceneGain.connect(master);
    sceneGain.connect(reverb);

    const wind = noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 450;
    band.Q.value = 0.7;
    lfo(0.06, 250, band.frequency); // gusts
    const windGain = ctx.createGain();
    windGain.gain.value = 0.05;
    wind.connect(band).connect(windGain).connect(sceneGain);
    wind.start();

    [55, 82.4].forEach(f => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f;
      gain.gain.value = 0.05;
      osc.connect(gain).connect(sceneGain);
      osc.start();
    });
  }

  // ---------- Public API ----------

  function fade(param, value, seconds) {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  function speakStart() {
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    chime();
    fade(padGain.gain, 0.03, 0.8);
  }

  function speakEnd() {
    if (!ctx) return;
    fade(padGain.gain, 0, 1.5);
  }

  /** "ruins" for the game's background sound, null for silence. */
  function setScene(name) {
    if (!ctx) return;
    if (!sceneBuilt) buildScene();
    fade(sceneGain.gain, name ? 0.35 : 0, 2.5);
  }

  function setMuted(on) {
    if (!ctx) return;
    fade(master.gain, on ? 0 : 1, 0.3);
  }

  return { init, speakStart, speakEnd, setScene, setMuted };
})();

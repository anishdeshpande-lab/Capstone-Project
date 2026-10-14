/*
 * gideon.js — the voice engine.
 *
 * Wraps three browser APIs:
 *   - SpeechRecognition  (speech → text)   Chrome, Edge, Safari
 *   - speechSynthesis    (text → speech)   all modern browsers
 *   - Web Audio analyser (mic volume → orb animation)
 *
 * It knows nothing about the website's content; it only hears, speaks,
 * and reports events through callbacks that app.js provides.
 */

class Gideon {
  // Default delivery: slower and lower than normal speech, with a pause (ms)
  // between sentences. Tweak these to taste.
  static VOICE = { rate: 0.88, pitch: 0.8, pause: 400 };

  constructor({ onResult, onInterim, onStateChange, onError }) {
    this.onResult = onResult;
    this.onInterim = onInterim;
    this.onStateChange = onStateChange;
    this.onError = onError;

    this.wakeMode = false; // when true, listen continuously and only act on "Gideon, ..."
    this.listening = false;
    this.speaking = false;
    this.muted = false;
    this.voice = null;
    this._speechId = 0;
    this._utterances = [];
    this.voiceStyle = null; // { rate, pitch, pause } overrides Gideon.VOICE, e.g. the game's deeper voice
    this.peak = 0;          // loudest instant in the current mic frame, 0..1 (used for clap detection)

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = Boolean(SR);
    if (this.supported) this._setupRecognition(SR);

    // Voices load asynchronously in Chrome
    this._pickVoice();
    speechSynthesis.onvoiceschanged = () => this._pickVoice();
  }

  // ---------- Listening ----------

  _setupRecognition(SR) {
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true; // show words as they're spoken
    rec.maxAlternatives = 1;

    rec.onstart = () => { this.listening = true; this._setState("listening"); };

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res[0].transcript.trim();
        if (res.isFinal) this._handleFinal(text);
        else interim += text;
      }
      if (interim) this.onInterim?.(interim);
    };

    rec.onerror = (e) => {
      // "no-speech" and "aborted" are routine; don't alarm the user
      if (e.error !== "no-speech" && e.error !== "aborted") this.onError?.(e.error);
    };

    rec.onend = () => {
      this.listening = false;
      // In wake mode, restart automatically (browsers stop after silence)
      if (this.speaking) return; // _doneSpeaking() restarts it after she finishes
      if (this.wakeMode) {
        try { rec.start(); return; } catch { /* already started */ }
      }
      this._setState("idle");
    };

    this.recognition = rec;
  }

  _handleFinal(text) {
    if (!text) return;
    if (this.wakeMode) {
      // Only respond to phrases that contain the wake word
      const m = text.match(/\b(gideon|gidion|gideons)\b[,\s]*(.*)/i);
      if (!m) return;
      text = m[2] || "hello";
    }
    this.onResult?.(text);
  }

  /** Push-to-talk: listen for one phrase. */
  listen() {
    if (!this.supported) {
      this.onError?.("unsupported");
      return;
    }
    this.stopSpeaking();
    this.recognition.continuous = this.wakeMode;
    try { this.recognition.start(); } catch { /* already running */ }
  }

  stopListening() {
    this.recognition?.stop();
  }

  setWakeMode(on) {
    this.wakeMode = on;
    this.stopListening();
    // If she's announcing wake mode, _doneSpeaking() starts listening afterwards
    if (on) setTimeout(() => { if (!this.speaking) this.listen(); }, 300);
  }

  // ---------- Speaking ----------

  _pickVoice() {
    const voices = speechSynthesis.getVoices();
    // Ranked best-first for a calm, otherworldly delivery. The "Natural" voices
    // (Edge) are far more expressive; British voices suit the old-world tone.
    // Falls back to any British, then any English voice.
    const preferred = [
      "Microsoft Sonia Online (Natural)",
      "Microsoft Libby Online (Natural)",
      "Microsoft Maisie Online (Natural)",
      "Microsoft Ava Online (Natural)",
      "Microsoft Aria Online (Natural)",
      "Google UK English Female",
      "Microsoft Hazel",
      "Moira",
      "Serena",
      "Kate",
      "Samantha",
      "Microsoft Zira",
    ];
    this.voice =
      preferred.map(n => voices.find(v => v.name.includes(n))).find(Boolean) ||
      voices.find(v => v.lang === "en-GB") ||
      voices.find(v => v.lang.startsWith("en")) ||
      null;
    if (this.voice) console.info(`Gideon's voice: ${this.voice.name}`);
  }

  /**
   * Says `text` out loud. Resolves when she finishes (or is interrupted).
   * Browsers only allow speech after the user has clicked/pressed a key once,
   * which is why app.js shows an "Activate" screen first.
   */
  speak(text) {
    if (!text || this.muted || !("speechSynthesis" in window)) return Promise.resolve();

    const id = ++this._speechId;   // lets us ignore callbacks from interrupted speech
    this.speaking = true;          // checked in rec.onend so she doesn't hear herself
    this.recognition?.abort();
    speechSynthesis.cancel();
    if (!this.voice) this._pickVoice();

    // Chrome cuts off utterances longer than ~15s, so speak one sentence at a time
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];

    const style = { ...Gideon.VOICE, ...this.voiceStyle };

    return new Promise((resolve) => {
      const finish = () => {
        if (id === this._speechId) this._doneSpeaking();
        resolve();
      };

      // One sentence at a time, with a slow, deliberate pause between each
      const sayNext = (i) => {
        if (id !== this._speechId) return resolve(); // interrupted
        if (i >= sentences.length) return finish();
        const u = new SpeechSynthesisUtterance(sentences[i].trim());
        if (this.voice) u.voice = this.voice;
        u.rate = style.rate;
        u.pitch = style.pitch;
        u.onend = () => setTimeout(() => sayNext(i + 1), style.pause);
        u.onerror = finish;
        this._utterances = [u]; // keep a reference so Chrome doesn't garbage-collect it mid-speech
        speechSynthesis.speak(u);
      };

      // Chrome silently drops speak() if it comes right after cancel()
      setTimeout(() => {
        if (id !== this._speechId) return resolve();
        this._setState("speaking");
        sayNext(0);
      }, 100);
    });
  }

  _doneSpeaking() {
    this.speaking = false;
    this._utterances = [];
    this._setState("idle");
    if (this.wakeMode) this.listen(); // resume listening for the wake word
  }

  stopSpeaking() {
    if (!this.speaking) return;
    this._speechId++;
    this.speaking = false;
    speechSynthesis.cancel();
    this._setState("idle");
  }

  setMuted(on) {
    this.muted = on;
    if (on) this.stopSpeaking();
  }

  // ---------- Mic level for the orb animation ----------

  /** Calls onLevel(0..1) every frame with the current mic volume. */
  async startVisualizer(onLevel) {
    if (this._visualizerStarted) return;
    this._visualizerStarted = true;
    // Create the AudioContext synchronously, inside the click, or browsers keep it suspended
    const ctx = new AudioContext();
    try {
      // Noise suppression and auto gain flatten claps, so turn them off for this level meter
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      });
      if (ctx.state === "suspended") await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const wave = new Uint8Array(analyser.fftSize);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        onLevel(this.listening ? Math.min(avg / 80, 1) : 0);

        // Peak of the raw waveform: sharp sounds like claps spike this
        analyser.getByteTimeDomainData(wave);
        let peak = 0;
        for (const v of wave) peak = Math.max(peak, Math.abs(v - 128) / 128);
        this.peak = peak;
        requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Mic denied: speech recognition will also fail, which is reported elsewhere.
      // Allow a retry on the next click.
      this._visualizerStarted = false;
      ctx.close();
    }
  }

  _setState(state) {
    this.onStateChange?.(state);
  }
}

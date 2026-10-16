// Background music made live in the browser (no files needed): soft chords, bass, a gentle melody and light drums.
// At night it becomes slower and calmer. You can also play your own music file instead.
const mtof = m => 440 * 2 ** ((m - 69) / 12);

// chords as MIDI notes, one chord per bar
const DAY = { bpm: 86, chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]], drums: true };   // Cmaj7 Am7 Fmaj7 G7
const NIGHT = { bpm: 66, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [52, 55, 59, 62]], drums: false }; // Am7 Fmaj7 Cmaj7 Em7
const SCALE = [0, 2, 4, 7, 9]; // pentatonic

export class Music {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.volume = .5;
    this.night = false;
    this.step = 0;
    this.audio = null;     // <audio> for the player's own file
    this.fileName = '';
  }

  setup() {
    if (this.ctx) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume * 1.1;
    const comp = ctx.createDynamicsCompressor();
    this.comp = comp;
    this.master.connect(comp).connect(ctx.destination);
    // a soft room echo
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
    }
    this.verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = .32;
    this.verb.connect(wet).connect(this.master);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.dry.connect(this.verb);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * .5, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  start() {
    this.on = true;
    if (this.audio) {
      // the player's file also goes through the sound engine, so recordings hear it
      this.setup();
      this.ctx.resume();
      if (!this.audio.srcNode) { this.audio.srcNode = this.ctx.createMediaElementSource(this.audio); this.audio.srcNode.connect(this.comp); }
      this.audio.volume = this.volume;
      this.audio.play().catch(() => {});
      return;
    }
    this.setup();
    this.ctx.resume();
    if (this.timer) return;
    this.next = this.ctx.currentTime + .1;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  stop() {
    this.on = false;
    if (this.audio) this.audio.pause();
    clearInterval(this.timer);
    this.timer = null;
    if (this.ctx && !this.keepAlive) this.ctx.suspend(); // a recording keeps it running
  }
  // the music as an audio track for the video recorder
  recordStream() {
    this.setup();
    if (!this.recDest) { this.recDest = this.ctx.createMediaStreamDestination(); this.comp.connect(this.recDest); }
    return this.recDest.stream;
  }
  toggle() { if (this.on) this.stop(); else this.start(); return this.on; }
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.setTargetAtTime(this.volume * 1.1, this.ctx.currentTime, .1);
    if (this.audio) this.audio.volume = this.volume;
  }
  setNight(n) { this.night = !!n; }

  // play the player's own music file (loops)
  useFile(file) {
    const wasOn = this.on;
    this.stop();
    if (this.audio) { this.audio.pause(); URL.revokeObjectURL(this.audio.src); }
    this.audio = new Audio(URL.createObjectURL(file));
    this.audio.loop = true;
    this.fileName = file.name;
    this.start(); // picking a file means "play this"
  }
  useBuiltIn() {
    const wasOn = this.on;
    this.stop();
    if (this.audio) { this.audio.pause(); URL.revokeObjectURL(this.audio.src); }
    this.audio = null;
    this.fileName = '';
    if (wasOn) this.start();
  }

  // ---------- the little sequencer ----------
  schedule() {
    const ctx = this.ctx;
    while (this.next < ctx.currentTime + .15) {
      this.playStep(this.step, this.next);
      const song = this.night ? NIGHT : DAY;
      this.next += 60 / song.bpm / 2; // eighth notes
      this.step++;
    }
  }

  tone(freq, t, dur, { type = 'sine', gain = .1, attack = .01, cutoff = 0, detune = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    let node = o.connect(g);
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; node = g.connect(f); }
    node.connect(this.dry);
    o.start(t);
    o.stop(t + dur + .05);
  }

  playStep(step, t) {
    const song = this.night ? NIGHT : DAY;
    const beat = 60 / song.bpm, bar = Math.floor(step / 8) % song.chords.length, s = step % 8;
    const chord = song.chords[bar];
    const soft = this.night ? .6 : 1;
    // pad: the whole chord, held for the bar
    if (s === 0) {
      for (const n of chord) {
        this.tone(mtof(n), t, beat * 4.2, { type: 'triangle', gain: .035 * soft, attack: .6, cutoff: 1100, detune: -6 });
        this.tone(mtof(n), t, beat * 4.2, { type: 'sine', gain: .03 * soft, attack: .6, detune: 6 });
      }
    }
    // bass on beats 1 and 3
    if (s === 0 || (s === 4 && !this.night)) this.tone(mtof(chord[0] - 12), t, beat * 1.8, { type: 'sine', gain: .12 * soft, attack: .02 });
    // plucked arpeggio
    const arp = [0, 1, 2, 3, 2, 1, 2, 3];
    if (!this.night || s % 2 === 0) {
      if (Math.random() > .18) this.tone(mtof(chord[arp[s]] + 12), t, .45, { type: 'triangle', gain: .045 * soft, cutoff: 2400 });
    }
    // a gentle melody note now and then
    if ((s === 2 || s === 6) && Math.random() < (this.night ? .35 : .5)) {
      const root = chord[0] + 24, n = root + SCALE[Math.floor(Math.random() * SCALE.length)];
      this.tone(mtof(n), t, beat * 1.6, { type: 'sine', gain: .05 * soft, attack: .03 });
      this.tone(mtof(n) * 2, t, beat * .8, { type: 'sine', gain: .012 * soft, attack: .03 });
    }
    // light drums (daytime only)
    if (song.drums) {
      if (s === 0 || s === 4) this.kick(t);
      if (s % 2 === 1) this.hat(t, .025);
      if (s === 4) this.hat(t, .04, 1800);
    }
  }
  kick(t) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + .18);
    g.gain.setValueAtTime(.16, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + .3);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + .35);
  }
  hat(t, gain, freq = 8000) {
    const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise;
    f.type = 'bandpass';
    f.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + .06);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + .08);
  }
}

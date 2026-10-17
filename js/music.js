// Background music made live in the browser (no files needed): calm, ever-changing piano pieces with nature
// sounds in between (birds by day, crickets at night). You can also play your own music file instead.
const mtof = m => 440 * 2 ** ((m - 69) / 12);


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
    this.timer = setInterval(() => this.schedule(), 40);
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

  // ---------- calm generative music (in the spirit of Minecraft's soundtrack) ----------
  // Every piece is new: its own key, chords and tempo, a soft improvised piano over slow chords with a long echo.
  // After 2–3 minutes there is a quiet break with only nature sounds, then another piece.
  schedule() {
    const ctx = this.ctx, now = ctx.currentTime;
    this.ambience(now);
    if (!this.next || this.next < now) this.next = now + .1;
    while (this.next < now + .25) {
      if (!this.piece || this.piece.left <= 0) {
        if (this.piece && !this.restUntil) this.restUntil = this.next + 22 + Math.random() * 30;   // a quiet break
        if (this.restUntil && this.next < this.restUntil) { this.next = Math.min(this.restUntil, now + .25); if (this.next < this.restUntil) return; }
        this.restUntil = 0;
        this.newPiece();
      }
      this.playBeat(this.next);
      this.next += this.piece.beat;
      this.piece.left--;
    }
  }

  newPiece() {
    const night = this.night;
    const MODES = night
      ? [[0, 2, 3, 5, 7, 8, 10], [0, 2, 3, 5, 7, 9, 10]]            // aeolian, dorian: softer and darker
      : [[0, 2, 4, 5, 7, 9, 11], [0, 2, 4, 6, 7, 9, 11], [0, 2, 4, 7, 9]]; // ionian, lydian, pentatonic: bright
    const scale = MODES[Math.floor(Math.random() * MODES.length)];
    const root = (night ? 45 : 50) + Math.floor(Math.random() * 7);   // a different key every time
    const PROGS = night ? [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 3], [0, 5, 3, 4]] : [[0, 4, 5, 3], [0, 3, 0, 4], [0, 5, 3, 4], [3, 4, 0, 5], [0, 2, 3, 4]];
    const prog = PROGS[Math.floor(Math.random() * PROGS.length)];
    const beat = night ? 1.05 + Math.random() * .35 : .78 + Math.random() * .3;
    this.piece = {
      scale, root, prog, beat, step: 0, chordBeats: 8,
      left: Math.round((120 + Math.random() * 70) / beat),       // about 2–3 minutes
      density: night ? .26 : .36, last: 7 + Math.floor(Math.random() * 4),
    };
  }
  // a scale degree -> MIDI note (degrees above the scale wrap into higher octaves)
  deg(d, octave = 0) {
    const s = this.piece.scale, n = s.length, k = ((d % n) + n) % n, o = Math.floor(d / n);
    return this.piece.root + s[k] + 12 * (o + octave);
  }
  playBeat(t) {
    const P = this.piece, soft = this.night ? .75 : 1;
    const ci = Math.floor(P.step / P.chordBeats) % P.prog.length, inChord = P.step % P.chordBeats, deg = P.prog[ci];
    // the chord: a low root, then the chord spread out gently (and a quiet pad under it)
    if (inChord === 0) {
      this.piano(mtof(this.deg(deg, -1)), t, .32 * soft, 6);
      const voicing = [deg, deg + 2, deg + 4, deg + (Math.random() < .5 ? 6 : 8)];
      voicing.forEach((d, i) => this.piano(mtof(this.deg(d)), t + .05 + i * (.09 + Math.random() * .08), .13 * soft, 5));
      for (const d of [deg, deg + 4]) this.pad(mtof(this.deg(d)), t, P.beat * P.chordBeats, .022 * soft);
    } else if (inChord === 4 && Math.random() < .5) {
      this.piano(mtof(this.deg(deg + 4, -1)), t, .18 * soft, 4);
    }
    // the melody: a slow random walk over the scale, with rests; now and then two notes together
    if (inChord && Math.random() < P.density) {
      P.last = Math.max(4, Math.min(16, P.last + [-2, -1, -1, 1, 1, 2, 0, 3, -3][Math.floor(Math.random() * 9)]));
      const when = t + (Math.random() < .3 ? P.beat / 2 : 0);
      this.piano(mtof(this.deg(P.last)), when, (.11 + Math.random() * .07) * soft, 4.5);
      if (Math.random() < .18) this.piano(mtof(this.deg(P.last - 2)), when + .02, .06 * soft, 4);
    }
    P.step++;
  }
  // a soft piano-like note: quick attack, long fading tail, gets mellower as it fades
  piano(freq, t, vel, len = 4) {
    const ctx = this.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.min(5200, freq * 7), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(500, freq * 1.6), t + 1.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + .006);
    g.gain.exponentialRampToValueAtTime(vel * .35, t + .35);
    g.gain.exponentialRampToValueAtTime(.0001, t + len * (freq < 200 ? 1.3 : 1));
    for (const [type, mul, gain, det] of [['sine', 1, 1, 0], ['triangle', 2, .18, 3], ['sine', 1, .35, -7], ['sine', 3, .05, 0]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type;
      o.frequency.value = freq * mul;
      o.detune.value = det;
      og.gain.value = gain;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + len * 1.4 + .1);
    }
    f.connect(g).connect(this.dry);
  }
  pad(freq, t, dur, gain) {
    const ctx = this.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * .4);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.5);
    for (const det of [-5, 5]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 1.6);
    }
    f.connect(g).connect(this.dry);
  }

  // ---------- nature around the music ----------
  ambience(now) {
    const ctx = this.ctx;
    // a very soft breeze all the time
    if (!this.wind) {
      const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0, last = 0; i < len; i++) { last = last * .985 + (Math.random() * 2 - 1) * .015; d[i] = last * 6; }
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = buf; src.loop = true;
      f.type = 'lowpass'; f.frequency.value = 500;
      g.gain.value = .05;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      this.wind = { f, g };
    }
    this.wind.f.frequency.setTargetAtTime(380 + Math.sin(now * .07) * 160, now, 2);
    this.wind.g.gain.setTargetAtTime(this.night ? .035 : .05, now, 3);
    if (now < (this.natureAt || 0)) return;
    if (this.night) {
      // crickets, and now and then an owl
      this.natureAt = now + .5 + Math.random() * 1.3;
      if (Math.random() < .04) { this.owl(now + .1); this.natureAt += 3; return; }
      const base = 4200 + Math.random() * 900;
      for (let k = 0; k < 3 + Math.floor(Math.random() * 3); k++) this.chirp(now + .05 + k * .075, base, base, .012, .045);
    } else {
      // little birds
      this.natureAt = now + 2.5 + Math.random() * 6;
      const n = 2 + Math.floor(Math.random() * 4), f0 = 2600 + Math.random() * 1800;
      for (let k = 0; k < n; k++) this.chirp(now + .05 + k * (.11 + Math.random() * .06), f0 * (1 + Math.random() * .25), f0 * (1.3 + Math.random() * .4), .016, .07 + Math.random() * .05);
    }
  }
  chirp(t, f0, f1, gain, dur) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + .01);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(this.dry);
    o.start(t);
    o.stop(t + dur + .02);
  }
  owl(t) {
    for (const [dt, f] of [[0, 410], [.5, 390], [.75, 380]]) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t + dt);
      o.frequency.linearRampToValueAtTime(f * .92, t + dt + .35);
      g.gain.setValueAtTime(0, t + dt);
      g.gain.linearRampToValueAtTime(.03, t + dt + .08);
      g.gain.exponentialRampToValueAtTime(.0001, t + dt + .4);
      o.connect(g).connect(this.dry);
      o.start(t + dt);
      o.stop(t + dt + .45);
    }
  }
}

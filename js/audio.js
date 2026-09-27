'use strict';
// ---------------------------------------------------------------------------
// audio.js - every sound is synthesised live with WebAudio (chiptune style):
// sound effects, the engine drone and a little step-sequenced soundtrack.
// ---------------------------------------------------------------------------

const Sound = (function () {
  let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  const pulse = {};
  let sfxOn = true, musicOn = true;
  try {
    sfxOn = localStorage.getItem('otl.sfx') !== '0';
    musicOn = localStorage.getItem('otl.music') !== '0';
  } catch (e) { /* storage blocked: keep defaults */ }

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    master = ac.createGain();
    master.gain.value = 0.55;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    master.connect(comp);
    comp.connect(ac.destination);
    sfxBus = ac.createGain();
    sfxBus.gain.value = sfxOn ? 1 : 0;
    sfxBus.connect(master);
    musicBus = ac.createGain();
    musicBus.gain.value = musicOn ? 0.45 : 0;
    musicBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    pulse[0.25] = makePulse(0.25);
    pulse[0.125] = makePulse(0.125);
  }

  // NES-ish narrow pulse waves
  function makePulse(duty) {
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return ac.createPeriodicWave(re, im);
  }

  function tone(o) {
    if (!ac) return;
    const t0 = (o.at != null ? o.at : ac.currentTime) + (o.delay || 0);
    const dur = o.dur || 0.1;
    const osc = ac.createOscillator();
    if (o.wave && pulse[o.wave]) osc.setPeriodicWave(pulse[o.wave]);
    else osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + dur);
    const g = ac.createGain();
    const v = o.vol == null ? 0.2 : o.vol;
    const a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + a);
    if (o.sustain) g.gain.setValueAtTime(v, Math.max(t0 + a, t0 + dur - (o.release || 0.03)));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (o.lp) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(o.bus || sfxBus);
    if (o.vib) {
      const lfo = ac.createOscillator();
      const lg = ac.createGain();
      lfo.frequency.value = o.vib[0];
      lg.gain.value = o.vib[1];
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(o) {
    if (!ac) return;
    const t0 = (o.at != null ? o.at : ac.currentTime) + (o.delay || 0);
    const dur = o.dur || 0.1;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 2000, t0);
    if (o.freq2) f.frequency.exponentialRampToValueAtTime(o.freq2, t0 + dur);
    f.Q.value = o.q || 1;
    const g = ac.createGain();
    const v = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + (o.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.bus || sfxBus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  // ---- sound effects ------------------------------------------------------
  const sfx = {
    ui() { tone({ f: 1400, dur: 0.03, vol: 0.07 }); },
    select() {
      tone({ f: 660, dur: 0.06, vol: 0.1, wave: 0.25 });
      tone({ f: 990, dur: 0.09, vol: 0.1, wave: 0.25, delay: 0.06 });
    },
    lightChange() {
      tone({ f: 1046, dur: 0.05, vol: 0.11, wave: 0.25 });
      tone({ f: 1568, dur: 0.1, vol: 0.11, wave: 0.25, delay: 0.055 });
    },
    horn() {
      tone({ f: 392, dur: 0.17, vol: 0.12, lp: 1700, sustain: true });
      tone({ f: 494, dur: 0.17, vol: 0.1, lp: 1700, sustain: true });
    },
    danceNote(i) {
      const sc = [69, 72, 74, 76, 79, 81, 84, 86, 88];
      tone({ f: midi(sc[i % sc.length]), dur: 0.13, vol: 0.13, wave: 0.25 });
      tone({ f: midi(sc[i % sc.length] - 12), dur: 0.13, vol: 0.06, type: 'triangle' });
    },
    wrong() { tone({ f: 110, f2: 70, dur: 0.24, vol: 0.18, type: 'sawtooth', lp: 900 }); },
    screech() { noise({ dur: 0.2, vol: 0.13, filter: 'bandpass', freq: 2700, freq2: 1400, q: 7 }); },
    scream() { tone({ f: 640, f2: 980, dur: 0.75, vol: 0.06, type: 'sawtooth', vib: [16, 45], lp: 2600, sustain: true, release: 0.25 }); },
    panicKey() { tone({ f: rnd(500, 1400), dur: 0.035, vol: 0.05 }); },
    slurp() {
      noise({ dur: 0.35, vol: 0.14, filter: 'bandpass', freq: 600, freq2: 2800, q: 5 });
      tone({ f: midi(84), dur: 0.08, vol: 0.1, wave: 0.25, delay: 0.3 });
      tone({ f: midi(91), dur: 0.18, vol: 0.1, wave: 0.25, delay: 0.37 });
    },
    success() {
      [72, 76, 79].forEach((n, i) => tone({ f: midi(n), dur: 0.09, vol: 0.09, wave: 0.25, delay: i * 0.05 }));
    },
    clean() {
      [76, 79, 84, 88].forEach((n, i) => tone({ f: midi(n), dur: 0.09, vol: 0.1, wave: 0.125, delay: i * 0.045 }));
    },
    unlock() {
      [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone({ f: midi(n), dur: 0.14, vol: 0.11, wave: 0.25, delay: i * 0.07 }));
    },
    beep(h) { tone({ f: 1500 + h * 800, dur: 0.05, vol: 0.04 + h * 0.07, type: 'sine' }); },
    scope() {
      noise({ dur: 0.05, vol: 0.2, filter: 'highpass', freq: 3000 });
      tone({ f: 62, dur: 0.16, vol: 0.4, type: 'sine', delay: 0.12 });
      tone({ f: 55, dur: 0.2, vol: 0.34, type: 'sine', delay: 0.34 });
    },
    gunshot() {
      noise({ dur: 0.65, vol: 0.9, filter: 'lowpass', freq: 9000, freq2: 220, attack: 0.001 });
      tone({ f: 170, f2: 36, dur: 0.38, vol: 0.85, type: 'sine', attack: 0.001 });
      noise({ dur: 1.7, vol: 0.16, filter: 'lowpass', freq: 900, freq2: 110, delay: 0.06 });
    },
    ricochet() {
      tone({ f: 2600, f2: 500, dur: 0.3, vol: 0.12, type: 'sine' });
      noise({ dur: 0.12, vol: 0.3, filter: 'highpass', freq: 1500 });
    },
    splat() { noise({ dur: 0.22, vol: 0.28, filter: 'lowpass', freq: 1300, freq2: 180 }); },
    crash() {
      noise({ dur: 0.55, vol: 0.45, filter: 'lowpass', freq: 1600, freq2: 90 });
      tone({ f: 95, f2: 38, dur: 0.32, vol: 0.4, type: 'sine' });
    },
    bonk() {
      tone({ f: 150, f2: 70, dur: 0.12, vol: 0.2, lp: 800 });
      noise({ dur: 0.08, vol: 0.14, freq: 1100 });
    },
    death() {
      [64, 62, 60, 59, 57].forEach((n, i) => tone({ f: midi(n), dur: 0.2, vol: 0.11, wave: 0.25, delay: 0.25 + i * 0.18 }));
      tone({ f: midi(45), dur: 1.1, vol: 0.14, type: 'triangle', delay: 0.25 + 5 * 0.18, sustain: true, release: 0.5 });
    },
    countdown(go) { tone({ f: go ? 880 : 440, dur: go ? 0.32 : 0.12, vol: 0.13, wave: 0.25 }); },
    chaos() {
      for (let i = 0; i < 10; i++) tone({ f: midi(72 + ((i * 5) % 17)), dur: 0.06, vol: 0.08, wave: 0.125, delay: i * 0.04 });
    },
  };

  // ---- engine drone -------------------------------------------------------
  const engine = {
    o1: null, o2: null, g: null, f: null,
    start() {
      if (!ac || this.o1) return;
      this.o1 = ac.createOscillator();
      this.o1.type = 'sawtooth';
      this.o2 = ac.createOscillator();
      this.o2.type = 'square';
      this.f = ac.createBiquadFilter();
      this.f.type = 'lowpass';
      this.f.frequency.value = 400;
      this.g = ac.createGain();
      this.g.gain.value = 0;
      this.o1.connect(this.f);
      this.o2.connect(this.f);
      this.f.connect(this.g);
      this.g.connect(sfxBus);
      this.o1.start();
      this.o2.start();
    },
    set(speed01) {
      if (!this.o1) return;
      const t = ac.currentTime;
      const f = 36 + speed01 * 74;
      this.o1.frequency.setTargetAtTime(f, t, 0.06);
      this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
      this.g.gain.setTargetAtTime(0.03 + speed01 * 0.045, t, 0.08);
      this.f.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.08);
    },
    stop() {
      if (!this.o1) return;
      const t = ac.currentTime;
      this.g.gain.setTargetAtTime(0, t, 0.04);
      this.o1.stop(t + 0.3);
      this.o2.stop(t + 0.3);
      this.o1 = this.o2 = null;
    },
  };

  // ---- the soundtrack: a tiny step sequencer in A minor ---------------------
  const CHORDS = [[69, 72, 76], [65, 69, 72], [67, 72, 76], [67, 71, 74]];
  const ROOTS = [45, 41, 48, 43];
  const music = {
    on: false, step: 0, next: 0, timer: null, tempo: 124, mood: 'drive',
    start(mood) {
      if (!ac) return;
      if (mood) this.mood = mood;
      if (this.on) return;
      this.on = true;
      this.step = 0;
      this.next = ac.currentTime + 0.06;
      this.timer = setInterval(() => this.pump(), 25);
    },
    stop() {
      this.on = false;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    },
    pump() {
      if (!this.on || !ac) return;
      const tempo = this.mood === 'chaos' ? this.tempo + 18 : this.mood === 'title' ? 104 : this.tempo;
      const spb = 60 / tempo / 4;
      if (this.next < ac.currentTime - 0.3) this.next = ac.currentTime + 0.02; // tab was asleep
      while (this.next < ac.currentTime + 0.12) {
        this.play(this.step, this.next, spb);
        this.next += spb;
        this.step++;
      }
    },
    play(step, t, spb) {
      const s = step % 16, barIdx = Math.floor(step / 16) % 4;
      const chord = CHORDS[barIdx], root = ROOTS[barIdx];
      const B = musicBus, m = this.mood;
      const kick = () => tone({ f: 150, f2: 42, dur: 0.14, vol: 0.5, type: 'sine', at: t, bus: B });
      const snare = () => {
        noise({ dur: 0.12, vol: 0.2, filter: 'bandpass', freq: 1900, q: 0.8, at: t, bus: B });
        tone({ f: 200, f2: 120, dur: 0.06, vol: 0.08, type: 'triangle', at: t, bus: B });
      };
      const hat = (open) => noise({ dur: open ? 0.12 : 0.03, vol: open ? 0.06 : 0.05, filter: 'highpass', freq: 7000, at: t, bus: B });
      const bass = (n, len) => tone({ f: midi(n), dur: spb * (len || 1.6), vol: 0.16, wave: 0.25, lp: 900, at: t, bus: B, sustain: true });
      const arp = (n, v) => tone({ f: midi(n), dur: spb * 0.9, vol: v || 0.035, wave: 0.125, at: t, bus: B });

      if (m === 'title') {
        if (s === 0 || s === 8) bass(root, 5);
        if (s % 2 === 0) arp(chord[(s / 2) % 3] + (s >= 8 ? 12 : 0), 0.03);
        if (s % 4 === 2) hat(false);
        return;
      }
      if (m === 'dance') {
        if (s % 4 === 0) kick();
        if (s === 4 || s === 12) snare();
        if (s % 4 === 2) hat(true);
        bass(root + (s % 2 ? 12 : 0), 0.9);
        arp(chord[s % 3] + 12, 0.03);
        return;
      }
      if (m === 'chaos') {
        if (s % 4 === 0) kick();
        if (s === 4 || s === 12) snare();
        hat(false);
        if (s % 2 === 0) bass(root + (s % 4 ? 12 : 0), 1.2);
        arp(chord[s % 3] + (s % 2 ? 24 : 12), 0.035);
        return;
      }
      // 'drive'
      if (s === 0 || s === 8 || (barIdx === 3 && s === 10)) kick();
      if (s === 4 || s === 12) snare();
      if (s % 2 === 0) hat(false);
      if ([0, 3, 6, 8, 11, 14].includes(s)) bass(root + (s === 6 || s === 14 ? 12 : 0));
      arp(chord[s % 3] + (s % 6 >= 3 ? 12 : 0));
    },
  };

  function setSfx(on) {
    sfxOn = on;
    if (sfxBus) sfxBus.gain.value = on ? 1 : 0;
    try { localStorage.setItem('otl.sfx', on ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  function setMusic(on) {
    musicOn = on;
    if (musicBus) musicBus.gain.value = on ? 0.45 : 0;
    try { localStorage.setItem('otl.music', on ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  return {
    init, sfx, engine, music, setSfx, setMusic,
    get sfxOn() { return sfxOn; },
    get musicOn() { return musicOn; },
    get ready() { return !!ac; },
  };
})();

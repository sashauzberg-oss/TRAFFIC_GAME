'use strict';
// ---------------------------------------------------------------------------
// game.js - game states, the player's car, THE LIGHT sequencer, scoring,
// and what happens when you break the rules.
// ---------------------------------------------------------------------------

const ACCEL = 190;
const BRAKE = 430;
const REV_ACCEL = 170;
const FRICTION = 55;
const LAT_ACC = 520;
const NOCTL = { left: false, right: false, up: false, down: false };

const QUOTES = [
  '"NOTHING PERSONAL, KID."', '"RULES ARE RULES."', '"THE LIGHT SEES ALL."',
  '"SHOULD HAVE READ THE RULEBOOK."', '"BEEP BEEP. BANG."', '"I DON\'T MAKE THE RULES."',
  '"TRAFFIC SAFETY FIRST."', '"YOU HAD ONE JOB."', '"THE LIGHT HAS SPOKEN."',
];

const player = {
  x: 0, y: laneY(2), vx: 0, vy: 0, spin: 0, spinTarget: 0, tilt: 0, dtilt: 0,
  bounce: 0, bounceV: 0, hold: 0, armsT: 0, jitT: 0, honkT: 0, dead: false, deadSpin: 0, variant: 'normal', crashed: false,
};

const MENU = [
  { id: 'normal', label: () => 'DRIVE', sub: 'NEW COLORS SHOW UP AS YOU SURVIVE' },
  { id: 'insane', label: () => 'INSANE MODE', sub: 'ALL 12 COLORS AT ONCE. NO HINTS. FAST.' },
  { id: 'practice', label: () => 'PRACTICE', sub: 'THE SNIPER ALWAYS MISSES. PROBABLY.' },
  { id: 'rules', label: () => 'RULEBOOK', sub: 'WHAT EVERY COLOR MEANS' },
  { id: 'sound', label: () => 'SOUND: ' + (Sound.sfxOn ? 'ON' : 'OFF'), sub: 'SOUND EFFECTS' },
  { id: 'music', label: () => 'MUSIC: ' + (Sound.musicOn ? 'ON' : 'OFF'), sub: 'CHIPTUNE SOUNDTRACK' },
];

const G = {
  state: 'title', mode: 'normal', t: 0, stateT: 0,
  score: 0, combo: 1, survived: 0, distance: 0, best: {}, newBest: false,
  phase: null, unlocked: [], lastId: null, recent: {}, chaosQueue: [], chaosActive: false, sinceChaos: 0,
  camX: 0, camOff: 96, shake: 0, flash: 0, lightFlash: 0, dark: 0, mosaic: 0, seen: new Set(),
  menuIdx: 0, introId: null, rulesFrom: 'title', death: null, tracer: null, aimSniper: null,
  beepT: 0, bonkT: 0, banner: null, titleLight: 0, titleLightT: 0, lastCount: -1,

  // ---- hooks the rules call ----
  danceMove(k, idx) {
    player.bounceV = k === 'down' ? 35 : 75;
    player.dtilt = k === 'left' ? -0.4 : k === 'right' ? 0.4 : 0;
    player.armsT = 0.25;
    Sound.sfx.danceNote(idx);
    addFloater(player.x + rnd(-10, 10), player.y - 14, GLYPH.NOTE, '#e0a8ff', 0.6);
    burst(player.x, player.y, 5, ['#b04bff', '#e0a8ff', '#ffffff'], 50, { life: 0.35 });
  },
  danceFail() {
    Sound.sfx.wrong();
    G.shake = Math.max(G.shake, 2);
    addFloater(player.x, player.y - 18, 'WRONG MOVE! START OVER', '#ff6a7a', 0.9);
  },
  spinStep(rot) {
    player.spinTarget = (rot * Math.PI) / 2;
    Sound.sfx.screech();
    for (let k = 0; k < 6; k++) addMark(player.x + rnd(-9, 9), player.y + rnd(-6, 6));
    burst(player.x, player.y, 6, ['#9a98aa', '#c8c6d6', '#6f6d85'], 35, { life: 0.5 });
  },
  panicPress() {
    player.jitT = 0.12;
    player.armsT = 0.2;
    Sound.sfx.panicKey();
    if (Math.random() < 0.35) addFloater(player.x + rnd(-12, 12), player.y - 14, pick(['AAA!', 'AAAH!', 'EEK!', '!!!', 'HELP!']), '#ffffff', 0.5);
  },
  gotCoffee() {
    Sound.sfx.slurp();
    if (coffee) burst(coffee.x, coffee.y, 14, ['#8a4b21', '#f5eee0', '#ffffff'], 45, { life: 0.5 });
    addFloater(player.x, player.y - 18, 'CAFFEINE!', '#e8c090', 1);
    coffee = null;
  },
  queueChaos(d) {
    const pool = G.unlocked.filter((id) => id !== 'rainbow' && id !== 'brown');
    const n = 3 + Math.floor(d * 2);
    let last = 'rainbow';
    G.chaosQueue = [];
    for (let i = 0; i < n; i++) {
      let id;
      do { id = pick(pool); } while (id === last && pool.length > 1);
      G.chaosQueue.push(id);
      last = id;
    }
    G.chaosActive = true;
  },
};

// ---- persistence (best scores, which tutorial cards you've seen) ---------------
function loadSeen() {
  G.seen = new Set();
  try { (localStorage.getItem('otl.seen') || '').split(',').filter(Boolean).forEach((id) => G.seen.add(id)); } catch (e) { /* ignore */ }
}
function markSeen(id) {
  G.seen.add(id);
  try { localStorage.setItem('otl.seen', Array.from(G.seen).join(',')); } catch (e) { /* ignore */ }
}
function loadBest() {
  loadSeen();
  for (const m of ['normal', 'insane']) {
    try { G.best[m] = parseInt(localStorage.getItem('otl.best.' + m) || '0', 10) || 0; } catch (e) { G.best[m] = 0; }
  }
}
function saveBest(m) {
  try { localStorage.setItem('otl.best.' + m, String(G.best[m])); } catch (e) { /* storage blocked */ }
}

// ---- helpers -------------------------------------------------------------------
function wrapAngle(a) {
  a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a;
}
function difficulty() {
  if (G.mode === 'insane') return clamp(0.55 + G.survived / 70, 0, 1);
  if (G.mode === 'practice') return clamp(G.survived / 120, 0, 0.5);
  return clamp((G.survived - 5) / 55, 0, 1);
}
function carAngle() { return player.spin + player.tilt + player.dtilt; }
function headPos() {
  const a = carAngle(), c = Math.cos(a), s = Math.sin(a);
  return {
    x: player.x + HEAD_OFF.x * c - HEAD_OFF.y * s,
    y: player.y - Math.round(player.bounce) + HEAD_OFF.x * s + HEAD_OFF.y * c,
  };
}
function gameWantsTouchButtons() { return G.state === 'play'; }
function setState(s) {
  const from = G.state;
  G.state = s;
  G.stateT = 0;
  if (s === 'title' || s === 'rules' || from === 'title' || from === 'rules' || from === 'over') G.mosaic = 1;
}

// ---- starting a run -------------------------------------------------------------
function resetPlayer() {
  Object.assign(player, {
    x: 0, y: laneY(2), vx: 0, vy: 0, spin: 0, spinTarget: 0, tilt: 0, dtilt: 0, bounce: 0, bounceV: 0,
    hold: 0, armsT: 0, jitT: 0, honkT: 0, dead: false, deadSpin: 0, variant: 'normal', crashed: false,
  });
}
function startGame(mode) {
  G.mode = mode;
  G.score = 0; G.combo = 1; G.survived = 0; G.distance = 0; G.newBest = false;
  G.lastId = null; G.recent = {}; G.chaosQueue = []; G.chaosActive = false; G.sinceChaos = 0;
  G.death = null; G.tracer = null; G.aimSniper = null; G.flash = 0; G.shake = 0; G.banner = null; G.dark = 0;
  G.unlocked = mode === 'insane' ? RULE_ORDER.slice() : ['green', 'red'];
  resetPlayer();
  G.camOff = 96;
  G.camX = player.x - G.camOff;
  fx.length = 0; floaters.length = 0; marks.length = 0; coffee = null;
  resetTraffic(player.x);
  resetPeds(G.camX);
  Input.clear();
  Sound.music.stop();
  Sound.music.tempo = 124;
  Sound.music.start('drive');
  Sound.engine.start();
  G.phase = null;
  if (mode === 'insane' || G.seen.has('basics')) { setState('play'); startPhase('red', { countdown: true }); }
  else showIntro('basics');
}

function showIntro(id) {
  markSeen(id);
  G.introId = id;
  setState('intro');
  Sound.sfx.unlock();
  Sound.engine.set(0);
}
function closeIntro() {
  if (G.stateT < 0.6) return;
  const id = G.introId;
  G.introId = null;
  setState('play');
  Input.clear();
  if (id === 'basics') startPhase('red', { countdown: true });
  else startPhase(id, { isNew: true });
}

// ---- THE LIGHT -----------------------------------------------------------------------
function startPhase(id, o) {
  o = o || {};
  const r = RULES[id], d = difficulty();
  const p = {
    rule: r, id, t: 0, grace: lerp(1.3, 0.7, d), heat: 0, vheat: 0, maxHeat: 0, done: false, doneT: 0,
    failNow: null, why: null, chaos: !!o.chaos, isNew: !!o.isNew, countdown: !!o.countdown, first: !!o.first, d,
  };
  if (p.chaos) p.grace *= 0.75;
  if (p.isNew) p.grace = Math.max(p.grace, 1.6);
  p.dur = p.grace + lerp(2.3, 1.4, d) + rnd(0, 1.1);
  if (r.setup) r.setup(p, d, G);
  if (p.chaos) p.dur *= r.kind === 'task' ? 0.85 : 0.7;
  if (p.isNew) p.dur *= 1.35;
  if (p.countdown) { p.dur = 2.7; p.grace = 1.2; }
  G.phase = p;
  G.lastId = id;
  G.lastCount = -1;
  player.spin = wrapAngle(player.spin);
  player.spinTarget = 0;
  G.lightFlash = 0.3;
  if (p.first) Sound.sfx.countdown(true);
  else if (!p.countdown) Sound.sfx.lightChange();
  Sound.music.tempo = 124 + Math.round(d * 26);
  Sound.music.mood = p.chaos || id === 'rainbow' ? 'chaos' : id === 'purple' ? 'dance' : 'drive';
  if (id === 'white') Sound.sfx.scream();
  if (id === 'rainbow') Sound.sfx.chaos();
}

function endPhase(p) {
  if (!p || p.ended) return;
  p.ended = true;
  if (p.rule.end) p.rule.end(p);
}

function pickNext() {
  if (G.unlocked.includes('rainbow') && G.sinceChaos >= 6 && Math.random() < 0.22 + (G.sinceChaos - 6) * 0.06) {
    G.sinceChaos = 0;
    return 'rainbow';
  }
  G.sinceChaos++;
  const pool = G.unlocked.filter((id) => id !== G.lastId && id !== 'rainbow');
  let total = 0;
  const ws = pool.map((id) => {
    let w = 1;
    const u = G.recent[id];
    if (u != null && G.survived - u < 8) w = 2.2;
    if (id === 'green' || id === 'red') w *= 1.25;
    total += w;
    return w;
  });
  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i++) { roll -= ws[i]; if (roll <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

function nextPhase() {
  const prev = G.phase;
  endPhase(prev);
  if (prev && prev.countdown) { startPhase('green', { first: true }); return; }
  if (G.chaosQueue.length) { startPhase(G.chaosQueue.shift(), { chaos: true }); return; }
  if (G.chaosActive) {
    G.chaosActive = false;
    const bonus = 1000;
    G.score += bonus;
    addFloater(player.x, player.y - 30, 'CHAOS SURVIVED! +' + bonus, '#ffe14a', 1.8);
    Sound.sfx.unlock();
  }
  if (G.mode !== 'insane') {
    const fresh = RULE_ORDER.find((id) => !G.unlocked.includes(id));
    if (fresh && G.survived >= UNLOCK_AT[fresh]) {
      G.unlocked.push(fresh);
      G.recent[fresh] = G.survived;
      if (!G.seen.has(fresh)) { showIntro(fresh); return; }
      // already learned it once: just a quick heads-up, no pause
      const r = RULES[fresh];
      G.banner = { title: 'NEW LIGHT: ' + r.name, text: r.name + ' = ' + ruleText(r, 'cmd', { need: 3, turns: 1 }) + ' ' + r.short, col: r.id === 'black' ? '#c9c7da' : r.color, t: 0 };
      Sound.sfx.unlock();
      startPhase(fresh, { isNew: true });
      return;
    }
  }
  startPhase(pickNext());
}

function heatTime(d) { return lerp(0.75, 0.42, d); }

function updatePhase(dt) {
  const p = G.phase;
  if (!p) return;
  const r = p.rule;
  p.t += dt;
  if (r.update) r.update(p, player, dt, G);
  let bad = null;
  if (r.check && p.t > p.grace && !p.done) bad = r.check(p, player, Input);
  if (bad) { p.vheat += dt / heatTime(p.d); p.why = bad; }
  else p.vheat = Math.max(0, p.vheat - dt * 0.8);
  let theat = 0;
  if (r.kind === 'task' && !p.done) {
    const warn = Math.min(1.5, p.dur * 0.45);
    const remain = p.dur - p.t;
    if (remain < warn) theat = 1 - remain / warn;
  }
  p.heat = clamp(Math.max(p.vheat, theat), 0, 1);
  if (!p.countdown) p.maxHeat = Math.max(p.maxHeat, p.heat);

  if (p.failNow) return fail(p.failNow);
  if (p.vheat >= 1) return fail(p.why || r.fail);
  if (r.kind === 'task') {
    if (p.done) {
      p.doneT += dt;
      if (p.doneT > 0.35) succeed();
    } else if (p.t >= p.dur) {
      if (r.doneAtTimeout && r.doneAtTimeout(p)) succeed();
      else fail((r.failAtTimeout && r.failAtTimeout(p)) || r.fail);
    }
  } else if (p.t >= p.dur) succeed();
}

function succeed() {
  const p = G.phase;
  if (p.countdown) { nextPhase(); return; }
  const clean = p.maxHeat < 0.2;
  G.combo = clean ? Math.min(G.combo + 1, 8) : 1;
  let pts = (p.chaos ? 150 : 100) * G.combo;
  if (p.rule.kind === 'task') pts += Math.max(0, Math.round((p.dur - p.t) * 30));
  G.score += pts;
  G.survived++;
  addFloater(player.x, player.y - 16, '+' + pts, clean ? '#ffe14a' : '#ffffff', 1.1);
  if (clean && G.combo > 2) addFloater(player.x, player.y - 26, 'CLEAN ' + GLYPH.TIMES + G.combo, shade(ruleColor(p.rule, G.t), 0.3), 1.2);
  if (!clean) addFloater(player.x, player.y - 26, 'CLOSE ONE...', '#ff8a8a', 1.1);
  if (p.rule.kind === 'task') (clean ? Sound.sfx.clean() : Sound.sfx.success());
  nextPhase();
}

function fail(reason) {
  if (G.mode === 'practice') practiceMiss(reason);
  else startDeath(reason);
}

function practiceMiss(reason) {
  const h = headPos();
  const s = G.aimSniper || chooseSniper(G.camX, h.x, h.y);
  const miss = { x: h.x + rnd(-16, 16), y: clamp(h.y + pick([-12, 12]), ROAD_Y0 + 2, ROAD_Y1 - 2) };
  if (s) { const m = sniperMuzzle(s); G.tracer = { x0: m.x, y0: m.y, x1: miss.x, y1: miss.y, t: 0 }; }
  Sound.sfx.gunshot();
  Sound.sfx.ricochet();
  burst(miss.x, miss.y, 14, ['#ffe14a', '#ffffff', '#ff9a3a'], 70, { life: 0.3 });
  addMark(miss.x, miss.y);
  G.banner = { title: 'MISSED! (PRACTICE)', text: reason, col: '#ff5a6a', t: 0 };
  G.combo = 1;
  G.shake = 4;
  G.flash = 0.25;
  nextPhase();
}

function startDeath(reason) {
  const p = G.phase;
  const h = headPos();
  const s = G.aimSniper || chooseSniper(G.camX, h.x, h.y);
  G.death = { t: 0, reason, rule: p.rule, phase: p, sniper: s, shot: false, shotAt: 1.0, quote: pick(QUOTES) };
  setState('dying');
  Sound.music.stop();
  Sound.engine.stop();
  Sound.sfx.scope();
  if (G.mode !== 'practice' && G.score > (G.best[G.mode] || 0)) {
    G.best[G.mode] = G.score;
    G.newBest = true;
    saveBest(G.mode);
  }
}

// ---- the player's car --------------------------------------------------------------
function honk() {
  Sound.sfx.horn();
  player.honkT = 0.18;
  addFloater(player.x + 14, player.y - 12, 'HONK', '#ffb3e6', 0.45);
}

function updatePlayer(dt, ctl, autoBrake) {
  const P = player;
  if (P.dead) {
    P.vx *= Math.max(0, 1 - dt * 1.4);
    P.vy *= Math.max(0, 1 - dt * 1.6);
    P.spin += P.deadSpin * dt;
    P.deadSpin *= Math.max(0, 1 - dt * 1.3);
  } else {
    if (ctl.right && !ctl.left) {
      if (P.vx < 0) { P.vx = Math.min(0, P.vx + BRAKE * dt); if (P.vx === 0) P.hold = 0.3; }
      else if (P.hold > 0) P.hold -= dt;
      else P.vx = Math.min(MAX_FWD, P.vx + ACCEL * dt * (1 - P.vx / (MAX_FWD * 1.5)));
    } else if (ctl.left && !ctl.right) {
      if (P.vx > 0) { P.vx = Math.max(0, P.vx - BRAKE * dt); if (P.vx === 0) P.hold = 0.3; }
      else if (P.hold > 0) P.hold -= dt;
      else P.vx = Math.max(-MAX_REV, P.vx - REV_ACCEL * dt);
    } else {
      P.hold = 0;
      const f = autoBrake ? BRAKE * 0.6 : FRICTION;
      P.vx = P.vx > 0 ? Math.max(0, P.vx - f * dt) : Math.min(0, P.vx + f * dt);
    }
    const want = (ctl.down ? 1 : 0) - (ctl.up ? 1 : 0);
    P.vy += clamp(want * LAT_SPEED - P.vy, -LAT_ACC * dt, LAT_ACC * dt);
    const tiltT = (P.vy / LAT_SPEED) * 0.3 * Math.min(1, Math.abs(P.vx) / 50) * (P.vx < 0 ? -1 : 1);
    P.tilt += (tiltT - P.tilt) * Math.min(1, dt * 10);
    P.dtilt *= Math.max(0, 1 - dt * 6);
    P.spin += clamp(P.spinTarget - P.spin, -16 * dt, 16 * dt);
  }
  P.x += P.vx * dt;
  P.y += P.vy * dt;
  const y0 = ROAD_Y0 + 7, y1 = ROAD_Y1 - 7;
  if (P.y < y0 || P.y > y1) {
    P.y = clamp(P.y, y0, y1);
    if (P.dead && !P.crashed && (Math.abs(P.vy) > 8 || Math.abs(P.vx) > 20)) {
      P.crashed = true;
      Sound.sfx.crash();
      G.shake = Math.max(G.shake, 3);
      burst(P.x, P.y, 12, ['#9a98aa', '#6f6d85', '#ffe14a'], 50, { life: 0.5 });
      P.vx *= 0.3;
      P.deadSpin *= 0.4;
    }
    P.vy = 0;
  }
  P.bounceV -= 420 * dt;
  P.bounce += P.bounceV * dt;
  if (P.bounce <= 0) { P.bounce = 0; P.bounceV = 0; }
  P.armsT = Math.max(0, P.armsT - dt);
  P.jitT = Math.max(0, P.jitT - dt);
  P.honkT = Math.max(0, P.honkT - dt);
  if (!P.dead && Math.abs(P.vy) > 20 && Math.abs(P.vx) < SLIDE_VMAX && Math.random() < 0.5) {
    burst(P.x + rnd(-8, 8), P.y + (P.vy > 0 ? -6 : 6), 1, ['#9a98aa', '#c8c6d6'], 12, { life: 0.4 });
  }
}

function collidePlayer() {
  const P = player;
  for (const n of npcs) {
    const b = npcBox(n);
    const x0 = P.x - 11, x1 = P.x + 11, y0 = P.y - 5.5, y1 = P.y + 5.5;
    if (x1 <= b.x0 || x0 >= b.x1 || y1 <= b.y0 || y0 >= b.y1) continue;
    const ox = Math.min(x1 - b.x0, b.x1 - x0), oy = Math.min(y1 - b.y0, b.y1 - y0);
    if (ox < oy) {
      if (P.x < n.x) { P.x -= ox; P.vx = Math.min(P.vx, n.vx - 12); }
      else { P.x += ox; P.vx = Math.max(P.vx, n.vx + 12); }
    } else {
      P.y += P.y < n.y ? -oy : oy;
      P.vy = 0;
    }
    if (G.bonkT <= 0) {
      G.bonkT = 0.35;
      Sound.sfx.bonk();
      G.shake = Math.max(G.shake, 2);
      burst((P.x + n.x) / 2, (P.y + n.y) / 2, 6, ['#ffe14a', '#ffffff'], 40, { life: 0.25 });
    }
  }
}

function updateCamera(dt) {
  const target = player.vx < -5 ? 196 : 96;
  G.camOff += (target - G.camOff) * Math.min(1, dt * 2.2);
  G.camX = player.x - G.camOff;
}

function darknessTarget() {
  const s = G.survived % 40;
  if (s < 14) return 0;
  if (s < 20) return ((s - 14) / 6) * 0.55;
  if (s < 34) return 0.55;
  return ((40 - s) / 6) * 0.55;
}

// ---- per-state updates ----------------------------------------------------------------
function handlePlayInput(ev) {
  const p = G.phase;
  if (ev.key === 'pause' || ev.key === 'esc') { pauseGame(); return; }
  if (ev.key === 'mute' || !p) return;
  if (ev.raw && p.rule.onRaw) p.rule.onRaw(p, G);
  if (ev.key === 'honk') honk();
  if (p.rule.onKey && ev.key) p.rule.onKey(p, ev.key, G);
}

function updatePlay(dt, evs) {
  for (const ev of evs) {
    handlePlayInput(ev);
    if (G.state !== 'play') return;
  }
  const p = G.phase;
  const captured = !!(p && p.rule.captures && !p.done);
  const ctl = captured ? NOCTL : {
    left: Input.isDown('left'), right: Input.isDown('right'), up: Input.isDown('up'), down: Input.isDown('down'),
  };
  updatePlayer(dt, ctl, captured);
  collidePlayer();
  updateTraffic(dt, p ? p.rule.beh : 'go', G.t, false);
  updatePeds(dt, G.camX, p ? p.rule.beh : 'go', null);
  updateFx(dt);
  updateCamera(dt);
  G.distance += Math.max(0, player.vx * dt);
  G.bonkT -= dt;
  G.dark += (darknessTarget() - G.dark) * Math.min(1, dt * 0.5);
  if (G.banner) { G.banner.t += dt; if (G.banner.t > 2.8) G.banner = null; }
  if (G.tracer) { G.tracer.t += dt; if (G.tracer.t > 0.15) G.tracer = null; }

  updatePhase(dt);
  if (G.state !== 'play') return;

  // the countdown: 3.. 2.. 1..
  const ph = G.phase;
  if (ph && ph.countdown) {
    const c = 3 - Math.floor((ph.t / ph.dur) * 3);
    if (c !== G.lastCount && c > 0) { G.lastCount = c; Sound.sfx.countdown(false); }
  }

  // a sniper's laser creeps toward your head while you break the rules
  if (ph && ph.heat > 0.03) {
    const h = headPos();
    if (!G.aimSniper || G.aimSniper.x - G.camX < 30 || G.aimSniper.x - G.camX > W - 6) G.aimSniper = chooseSniper(G.camX, h.x, h.y);
    G.beepT -= dt;
    if (G.beepT <= 0) { Sound.sfx.beep(ph.heat); G.beepT = lerp(0.45, 0.07, ph.heat); }
  } else {
    G.aimSniper = null;
    G.beepT = 0;
  }
  Sound.engine.set(Math.min(1, Math.abs(player.vx) / MAX_FWD));
}

function updateDying(dt) {
  const D = G.death;
  D.t += dt;
  if (!D.shot && D.t >= D.shotAt) {
    D.shot = true;
    const h = headPos();
    Sound.sfx.gunshot();
    Sound.sfx.splat();
    Sound.sfx.death();
    G.flash = 1;
    G.shake = 7;
    burst(h.x, h.y, 46, [PAL.blood, PAL.blood2, '#ff4060'], 95, { life: 0.5, stick: true, drag: 5 });
    burst(h.x, h.y, 10, [PAL.cap, PAL.brim], 75, { life: 0.9, drag: 1.5, size: 2 });
    if (D.sniper) { const m = sniperMuzzle(D.sniper); G.tracer = { x0: m.x, y0: m.y, x1: h.x, y1: h.y, t: 0 }; }
    player.variant = 'splat';
    player.dead = true;
    player.vy = rnd(-45, 45);
    player.deadSpin = rnd(-2.8, 2.8);
    updatePeds(0, G.camX, 'go', h.x);
  }
  if (D.shot) {
    const sdt = dt * (D.t < D.shotAt + 0.6 ? 0.3 : 1);
    worldIdle(sdt, true);
    if (G.tracer) { G.tracer.t += dt; if (G.tracer.t > 0.2) G.tracer = null; }
  }
  if (D.t > D.shotAt + 2.1) setState('over');
}

// The world keeps living behind menus and the game over screen.
function worldIdle(dt, frozen) {
  updatePlayer(dt, NOCTL, false);
  updateTraffic(dt, 'stop', G.t, frozen);
  updatePeds(dt, G.camX, 'go', null);
  updateFx(dt);
  updateCamera(dt);
}

function pauseGame() {
  if (G.state !== 'play') return;
  setState('pause');
  Sound.engine.stop();
  Sound.music.stop();
}
function resumeGame() {
  setState('play');
  Sound.engine.start();
  Sound.music.start();
  // a moment to get your fingers back in place
  if (G.phase) G.phase.grace = Math.max(G.phase.grace, G.phase.t + 0.6);
}
function quitToTitle() {
  if (G.phase) endPhase(G.phase);
  G.phase = null;
  Sound.engine.stop();
  Sound.music.stop();
  Sound.music.start('title');
  enterTitle();
}

function enterTitle() {
  setState('title');
  resetPlayer();
  player.y = -200; // off the road: the title screen is just the city
  G.camX = 0;
  G.death = null;
  G.dark = 0;
  fx.length = 0; floaters.length = 0; marks.length = 0; coffee = null;
  resetTraffic(G.camX + 96);
  resetPeds(G.camX);
}

function selectMenu(i) {
  const item = MENU[i];
  Sound.sfx.select();
  if (item.id === 'normal' || item.id === 'insane' || item.id === 'practice') startGame(item.id);
  else if (item.id === 'rules') { G.rulesFrom = 'title'; setState('rules'); }
  else if (item.id === 'sound') Sound.setSfx(!Sound.sfxOn);
  else if (item.id === 'music') {
    Sound.setMusic(!Sound.musicOn);
    if (Sound.musicOn) Sound.music.start('title');
  }
}

function updateTitle(dt, evs) {
  G.camX += dt * 22;
  player.x = G.camX + 96;
  G.titleLightT += dt;
  if (G.titleLightT > 1.4) { G.titleLightT = 0; G.titleLight = (G.titleLight + 1) % RULE_ORDER.length; }
  const beh = RULES[RULE_ORDER[G.titleLight]].beh;
  updateTraffic(dt, beh, G.t, false);
  updatePeds(dt, G.camX, beh, null);
  updateFx(dt);
  for (const ev of evs) {
    if (ev.key === 'up') { G.menuIdx = (G.menuIdx + MENU.length - 1) % MENU.length; Sound.sfx.ui(); }
    else if (ev.key === 'down') { G.menuIdx = (G.menuIdx + 1) % MENU.length; Sound.sfx.ui(); }
    else if (ev.key === 'enter' || ev.key === 'honk' || ev.key === 'pause') { selectMenu(G.menuIdx); return; }
    else if (ev.key === 'tap') {
      const i = menuItemAt(ev.x, ev.y);
      if (i >= 0) { G.menuIdx = i; selectMenu(i); return; }
    }
  }
}

function update(dt) {
  G.t += dt;
  G.stateT += dt;
  const evs = Input.take();
  for (const ev of evs) {
    if (ev.key === 'mute') {
      const on = !(Sound.sfxOn || Sound.musicOn);
      Sound.setSfx(on);
      Sound.setMusic(on);
      if (on && G.state === 'title') Sound.music.start('title');
    }
  }
  switch (G.state) {
    case 'title':
      updateTitle(dt, evs);
      break;
    case 'rules':
      for (const ev of evs) {
        if (['enter', 'esc', 'honk', 'tap', 'pause', 'quit'].includes(ev.key)) {
          Sound.sfx.ui();
          setState(G.rulesFrom === 'pause' ? 'pause' : 'title');
          break;
        }
      }
      break;
    case 'intro':
      for (const ev of evs) if (['enter', 'honk', 'tap', 'pause'].includes(ev.key)) closeIntro();
      break;
    case 'play':
      updatePlay(dt, evs);
      break;
    case 'pause':
      for (const ev of evs) {
        if (['pause', 'esc', 'enter', 'honk'].includes(ev.key)) { resumeGame(); break; }
        if (ev.key === 'tap') {
          if (ev.y > H - 30 && ev.x > W / 2) { quitToTitle(); break; }
          resumeGame();
          break;
        }
        if (ev.key === 'quit') { quitToTitle(); break; }
      }
      break;
    case 'dying':
      updateDying(dt);
      break;
    case 'over':
      worldIdle(dt, true);
      for (const ev of evs) {
        if (G.stateT < 0.8) break;
        const menuCorner = ev.key === 'tap' && ev.y > H - 30 && ev.x > W / 2;
        if (ev.key === 'esc' || ev.key === 'quit' || menuCorner) { quitToTitle(); break; }
        if (['enter', 'honk', 'pause', 'tap'].includes(ev.key)) { startGame(G.mode); break; }
      }
      break;
  }
  G.flash = Math.max(0, G.flash - dt * 2.5);
  G.shake = Math.max(0, G.shake - dt * 14);
  G.lightFlash = Math.max(0, G.lightFlash - dt);
  G.mosaic = Math.max(0, G.mosaic - dt * 3);
}

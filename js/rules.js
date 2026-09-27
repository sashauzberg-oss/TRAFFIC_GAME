'use strict';
// ---------------------------------------------------------------------------
// rules.js - what every colour of THE LIGHT means.
//
// kind 'hold' : keep doing something for the whole light (after a short
//               grace period to react). Break the rule for too long -> BANG.
// kind 'task' : get something done before the light runs out -> or BANG.
//               Some tasks also have a 'check' you must not break meanwhile.
// ---------------------------------------------------------------------------

// Car handling numbers the rules are built around (pixels per second).
const MAX_FWD = 150;
const MAX_REV = 72;
const LAT_SPEED = 62;
const GO_MIN = 45;       // GREEN: at least this fast
const SLOW_MIN = 4;      // YELLOW: moving forward...
const SLOW_MAX = 60;     // ...but no faster than this
const STILL = 4;         // RED: basically not moving
const REV_MIN = 20;      // ORANGE: at least this fast backwards
const SLIDE_VMAX = 8;    // BLUE: forward/back speed must stay under this

const ARROWS = ['left', 'right', 'up', 'down'];
const QUARTER = { right: 0, down: 1, left: 2, up: 3 };
const ARROW_GLYPH = { left: GLYPH.L, right: GLYPH.R, up: GLYPH.U, down: GLYPH.D };
const { L: A_L, R: A_R, U: A_U, D: A_D } = GLYPH;

const RULES = {};
const RULE_ORDER = ['green', 'red', 'purple', 'blue', 'yellow', 'orange', 'pink', 'cyan', 'black', 'brown', 'white', 'rainbow'];
// Light number after which each colour shows up for the first time (normal mode).
const UNLOCK_AT = { purple: 3, blue: 6, yellow: 9, orange: 12, pink: 15, cyan: 18, black: 21, brown: 24, white: 27, rainbow: 31 };

function defRule(r) {
  r.dark = r.dark || shade(r.color, -0.6);
  r.glow = r.glow || shade(r.color, 0.45);
  RULES[r.id] = r;
}
// Rainbow cycles through every hue; everything else is a fixed colour.
function ruleColor(r, t) {
  if (r.id === 'rainbow') return hsl((t || 0) * 300, 95, 60);
  return r.color;
}
function ruleText(r, key, p) {
  const v = r[key];
  return typeof v === 'function' ? v(p || {}) : v;
}

defRule({
  id: 'green', name: 'GREEN', cmd: 'GO!', color: '#27d64a', icon: 'go', slot: 2, kind: 'hold', beh: 'go',
  hint: `KEEP DRIVING FORWARD ${A_R}`,
  learn: ['GREEN MEANS GO.', `HOLD ${A_R} AND KEEP DRIVING FORWARD`, 'UNTIL THE LIGHT CHANGES.'],
  short: 'DRIVE FORWARD',
  fail: "GREEN MEANS GO. YOU DIDN'T GO.",
  gauge: [GO_MIN, MAX_FWD],
  check: (p, pl) => (pl.vx < GO_MIN ? 'TOO SLOW! GREEN MEANS GO!' : null),
});

defRule({
  id: 'red', name: 'RED', cmd: 'STOP!', color: '#ff2b3d', icon: 'stop', slot: 0, kind: 'hold', beh: 'stop',
  hint: "FULL STOP. DON'T MOVE AT ALL.",
  learn: ['RED MEANS STOP.', `LET GO OF ${A_R} AND TAP ${A_L} TO BRAKE.`, "DON'T MOVE AT ALL. NOT EVEN SIDEWAYS."],
  short: "DON'T MOVE AT ALL",
  fail: 'RED MEANS STOP. YOU KEPT MOVING.',
  gauge: [-STILL, STILL],
  check: (p, pl) => (Math.abs(pl.vx) > STILL || Math.abs(pl.vy) > STILL ? 'RED MEANS STOP! YOU MOVED!' : null),
});

defRule({
  id: 'purple', name: 'PURPLE', cmd: 'DANCE!', color: '#b04bff', icon: 'dance', slot: 'all', kind: 'task', beh: 'dance',
  captures: true,
  hint: 'TYPE THE ARROWS ABOVE YOUR CAR!',
  learn: ['PURPLE MEANS DANCE!', 'ARROWS POP UP ABOVE YOUR CAR.', 'PRESS THEM IN ORDER. MESS UP = START OVER.'],
  short: 'TYPE THE DANCE ARROWS',
  fail: "PURPLE MEANS DANCE. YOU DIDN'T DANCE.",
  setup(p, d) {
    const n = clamp(3 + Math.floor(d * 4) + (Math.random() < 0.3 ? 1 : 0) - (p.chaos ? 1 : 0), 3, 8);
    p.seq = [];
    for (let i = 0; i < n; i++) {
      let a;
      do { a = pick(ARROWS); } while (i >= 2 && a === p.seq[i - 1] && a === p.seq[i - 2]);
      p.seq.push(a);
    }
    p.idx = 0;
    p.dur = 1.3 + n * lerp(0.8, 0.45, d);
  },
  onKey(p, k, G) {
    if (!ARROWS.includes(k) || p.done) return;
    if (k === p.seq[p.idx]) {
      p.idx++;
      G.danceMove(k, p.idx);
      if (p.idx >= p.seq.length) p.done = true;
    } else {
      p.idx = 0;
      G.danceFail();
    }
  },
});

defRule({
  id: 'blue', name: 'BLUE', cmd: 'SLIDE!', color: '#2f6bff', icon: 'slide', slot: 'all', kind: 'task', beh: 'slide',
  hint: `${A_U}${A_D} SIDEWAYS ONLY! NO FORWARD/BACK!`,
  learn: ['BLUE MEANS SLIDE SIDEWAYS.', `STOP, THEN SLIDE ${A_U}/${A_D} UNTIL THE BAR FILLS UP.`, 'NO FORWARD. NO BACKWARD. ONLY SIDEWAYS!'],
  short: `SLIDE SIDEWAYS ${A_U}${A_D}, NO FWD/BACK`,
  fail: 'BLUE MEANS SIDEWAYS. NOT FORWARD. NOT BACKWARD.',
  gauge: [-SLIDE_VMAX, SLIDE_VMAX],
  setup(p, d) {
    p.need = Math.round(lerp(34, 60, d));
    p.prog = 0;
    p.dur = p.grace + (p.need / LAT_SPEED) * 1.5 + lerp(1.5, 0.9, d);
  },
  check: (p, pl) => (Math.abs(pl.vx) > SLIDE_VMAX ? 'NO FORWARD! NO BACKWARD! SIDEWAYS!' : null),
  update(p, pl, dt) {
    if (Math.abs(pl.vx) <= SLIDE_VMAX) p.prog += Math.abs(pl.vy) * dt;
    if (p.prog >= p.need) p.done = true;
  },
});

defRule({
  id: 'yellow', name: 'YELLOW', cmd: 'SLOW...', color: '#ffd21f', icon: 'slow', slot: 1, kind: 'hold', beh: 'slow',
  hint: 'CREEP FORWARD. NOT FAST. NOT STOPPED.',
  learn: ['YELLOW MEANS GO SLOW.', `TAP ${A_R} TO CREEP FORWARD SLOWLY.`, 'TOO FAST = BANG. STOPPED = ALSO BANG.'],
  short: 'CREEP FORWARD SLOWLY',
  fail: 'YELLOW MEANS SLOW. NOT FAST. NOT STOPPED.',
  gauge: [SLOW_MIN, SLOW_MAX],
  check: (p, pl) => (pl.vx > SLOW_MAX ? 'TOO FAST! YELLOW MEANS SLOW!' : pl.vx < SLOW_MIN ? "DON'T STOP! KEEP CREEPING!" : null),
});

defRule({
  id: 'orange', name: 'ORANGE', cmd: 'REVERSE!', color: '#ff8a1c', icon: 'reverse', slot: 'all', kind: 'hold', beh: 'rev',
  hint: `HOLD ${A_L} TO DRIVE BACKWARD`,
  learn: ['ORANGE MEANS REVERSE.', `HOLD ${A_L} TO DRIVE BACKWARD`, 'UNTIL THE LIGHT CHANGES.'],
  short: 'DRIVE BACKWARD',
  fail: "ORANGE MEANS REVERSE. YOU DIDN'T BACK UP.",
  gauge: [-MAX_REV, -REV_MIN],
  check: (p, pl) => (pl.vx > -REV_MIN ? 'BACKWARD! ORANGE MEANS REVERSE!' : null),
});

defRule({
  id: 'pink', name: 'PINK', cmd: (p) => `HONK ${GLYPH.TIMES}${p.need || 3}!`, color: '#ff6ec7', icon: 'honk', slot: 'all', kind: 'task', beh: 'honk',
  hint: (p) => `${Input.touchMode ? 'TAP HONK' : 'PRESS SPACE'} EXACTLY ${p.need || 3} TIMES!`,
  learn: ['PINK MEANS HONK.', 'HONK (SPACE BAR / PINK BUTTON) EXACTLY', 'THE NUMBER OF TIMES SHOWN. NOT ONE MORE!'],
  short: 'HONK EXACTLY N TIMES',
  fail: 'PINK MEANS HONK. THE EXACT NUMBER OF TIMES.',
  setup(p, d) {
    p.need = irnd(2, 3 + Math.floor(d * 3));
    if (p.chaos) p.need = Math.min(p.need, 3);
    p.count = 0;
    p.last = -9;
    p.dur = 1.4 + p.need * lerp(0.42, 0.3, d) + 0.8;
  },
  onKey(p, k) {
    if (k !== 'honk') return;
    p.count++;
    p.last = p.t;
    if (p.count > p.need) p.failNow = `TOO MANY HONKS! IT SAID ${p.need}.`;
  },
  update(p) { if (p.count === p.need && p.t - p.last > 0.7) p.done = true; },
  doneAtTimeout: (p) => p.count === p.need,
  failAtTimeout: (p) => `NOT ENOUGH HONKS! ${p.count} OUT OF ${p.need}.`,
});

defRule({
  id: 'cyan', name: 'CYAN', cmd: (p) => (p.turns > 1 ? `SPIN ${GLYPH.TIMES}2!` : 'SPIN!'), color: '#1ee8e8', icon: 'spin', slot: 'all', kind: 'task', beh: 'spin',
  captures: true,
  hint: `ROLL THE ARROWS AROUND: ${A_R}${A_D}${A_L}${A_U}`,
  learn: ['CYAN MEANS SPIN!', `ROLL THE ARROWS IN A CIRCLE: ${A_R} ${A_D} ${A_L} ${A_U}`, 'EACH PRESS TURNS YOUR CAR A QUARTER.'],
  short: `DO A 360: ${A_R}${A_D}${A_L}${A_U}`,
  fail: "CYAN MEANS SPIN. YOU DIDN'T SPIN.",
  setup(p, d) {
    p.turns = d < 0.35 || p.chaos ? 1 : 2;
    p.rot = 0;
    p.head = 0;
    p.dur = 1.4 + 4 * p.turns * lerp(0.55, 0.32, d);
  },
  onKey(p, k, G) {
    const q = QUARTER[k];
    if (q == null || p.done) return;
    const diff = (q - p.head + 4) % 4;
    if (diff === 1) p.rot++;
    else if (diff === 3) p.rot--;
    else return;
    p.head = q;
    G.spinStep(p.rot);
    if (Math.abs(p.rot) >= 4 * p.turns) p.done = true;
  },
});

defRule({
  id: 'black', name: 'BLACK', cmd: 'PLAY DEAD', color: '#1b1a24', dark: '#000000', glow: '#8c8aa0', icon: 'dead', slot: 'all', kind: 'hold', beh: 'dead',
  hint: "DON'T TOUCH ANYTHING. NOTHING!",
  learn: ['BLACK MEANS PLAY DEAD.', "LET GO OF EVERYTHING. DON'T PRESS", 'A SINGLE KEY UNTIL THE LIGHT CHANGES.'],
  short: "DON'T TOUCH ANY KEY",
  fail: 'BLACK MEANS PLAY DEAD. YOU TOUCHED SOMETHING.',
  setup(p, d) { p.dur = p.grace + lerp(2.4, 1.8, d) + rnd(0, 1); },
  check: (p, pl, inp) => (inp.anyHeld() ? "DEAD PEOPLE DON'T PRESS BUTTONS!" : null),
  onRaw(p) {
    if (p.t > p.grace) { p.vheat += 0.55; p.why = "DEAD PEOPLE DON'T PRESS BUTTONS!"; }
  },
});

defRule({
  id: 'brown', name: 'BROWN', cmd: 'GRAB COFFEE!', color: '#9a5a2a', icon: 'coffee', slot: 'all', kind: 'task', beh: 'coffee',
  hint: 'DRIVE INTO THE COFFEE CUP!',
  learn: ['BROWN MEANS COFFEE BREAK.', 'A COFFEE CUP APPEARS ON THE ROAD.', 'DRIVE INTO IT BEFORE TIME RUNS OUT.'],
  short: 'DRIVE INTO THE COFFEE',
  fail: 'BROWN MEANS GRAB THE COFFEE. NO COFFEE, NO LIFE.',
  setup(p, d) {
    spawnCoffee(d > 0.35 && !p.chaos);
    p.dur = lerp(4.6, 3.6, d) + Math.abs(coffee.x - player.x) / 170;
  },
  update(p, pl, dt, G) {
    if (!coffee || p.done) return;
    coffee.t += dt;
    if (Math.abs(coffee.x - pl.x) < 15 && Math.abs(coffee.y - pl.y) < 11) { p.done = true; G.gotCoffee(); }
  },
  end() { coffee = null; },
});

defRule({
  id: 'white', name: 'WHITE', cmd: 'PANIC!', color: '#f4f4ff', icon: 'panic', slot: 'all', kind: 'task', beh: 'panic',
  hint: (p) => `${Input.touchMode ? 'TAP LIKE CRAZY!' : 'MASH ANY KEYS!'} ${p.need || 12} TIMES!`,
  learn: ['WHITE MEANS PANIC!', 'MASH ANY KEYS (OR TAP LIKE CRAZY)', 'UNTIL THE COUNTER FILLS UP!'],
  short: 'MASH ANY KEYS',
  fail: 'WHITE MEANS PANIC. YOU WERE WAY TOO CALM.',
  setup(p, d) {
    p.need = 10 + Math.floor(d * 10) - (p.chaos ? 3 : 0);
    p.count = 0;
    p.dur = lerp(3.3, 2.7, d);
  },
  onRaw(p, G) {
    if (p.done) return;
    p.count++;
    G.panicPress();
    if (p.count >= p.need) p.done = true;
  },
});

defRule({
  id: 'rainbow', name: 'RAINBOW', cmd: 'CHAOS!', color: '#ff4df0', icon: 'chaos', slot: 'all', kind: 'hold', beh: 'dance',
  hint: 'GET READY... OBEY EVERY LIGHT!',
  learn: ['RAINBOW MEANS CHAOS!', 'A SUPER FAST STRING OF RANDOM LIGHTS.', 'OBEY EVERY SINGLE ONE. BIG BONUS!'],
  short: 'A FAST STRING OF LIGHTS',
  fail: 'RAINBOW MEANS CHAOS. THE CHAOS WON.',
  setup(p, d, G) {
    p.dur = 1.6;
    G.queueChaos(d);
  },
});

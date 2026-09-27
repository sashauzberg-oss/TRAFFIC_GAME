'use strict';
// ---------------------------------------------------------------------------
// sprites.js - pixel art for cars, the driver, snipers and icons. Cars are
// built procedurally from rectangles so every model/colour is consistent.
// All cars face RIGHT (the direction of travel).
// ---------------------------------------------------------------------------

const PAL = {
  ink: '#0b0b12',
  tire: '#121019',
  glass: '#8fd3ff',
  glassHi: '#e6f7ff',
  glassDark: '#35607e',
  light: '#fff4a8',
  tail: '#ff3346',
  cap: '#ffd23f',
  brim: '#d98e00',
  skin: '#f2b48c',
  seat: '#7a2530',
  interior: '#2a1a24',
  blood: '#d8123a',
  blood2: '#8e0a24',
};

// Paint the shared body shape: tyres, rounded body, shading and lamps.
function paintCarBase(g, L, Wd, body) {
  const hi = shade(body, 0.3), lo = shade(body, -0.28), out = shade(body, -0.7);
  const tw = Math.max(4, Math.round(L * 0.17));
  const rearX = Math.round(L * 0.13), frontX = L - rearX - tw;
  rect(g, rearX, 0, tw, Wd + 2, PAL.tire);
  rect(g, frontX, 0, tw, Wd + 2, PAL.tire);
  rect(g, 1, 1, L - 2, Wd, out);
  rect(g, 0, 2, L, Wd - 2, out);
  rect(g, 1, 2, L - 2, Wd - 2, body);
  rect(g, 2, 2, L - 4, 1, hi);
  rect(g, 2, Wd - 1, L - 4, 1, lo);
  rect(g, L - 1, 3, 1, 2, PAL.light);
  rect(g, L - 1, Wd - 3, 1, 2, PAL.light);
  rect(g, 0, 3, 1, 2, PAL.tail);
  rect(g, 0, Wd - 3, 1, 2, PAL.tail);
  return { hi, lo, out };
}

// The player's red convertible. variant: 'normal' | 'arms' | 'slump' | 'headless' | 'splat'
function buildPlayerCar(variant) {
  const L = 24, Wd = 12;
  const c = makeCanvas(L, Wd + 2);
  const g = c.getContext('2d');
  const body = '#e8263a';
  paintCarBase(g, L, Wd, body);
  // racing stripes on hood and trunk
  rect(g, L - 8, 6, 6, 1, '#fff1f1');
  rect(g, L - 8, 8, 6, 1, '#fff1f1');
  rect(g, 1, 6, 4, 1, '#fff1f1');
  rect(g, 1, 8, 4, 1, '#fff1f1');
  // windshield
  rect(g, 14, 2, 2, Wd - 2, PAL.glass);
  rect(g, 15, 3, 1, 2, PAL.glassHi);
  // open cockpit
  rect(g, 6, 3, 8, Wd - 4, PAL.interior);
  rect(g, 6, 3, 3, Wd - 4, shade(PAL.seat, -0.25)); // rear bench
  rect(g, 10, 3, 4, 4, PAL.seat);                   // driver seat
  rect(g, 10, 7, 4, 4, PAL.seat);                   // passenger seat
  rect(g, 14, 4, 1, 2, '#333');                     // steering wheel
  // the driver: a head in a yellow cap (brim faces forward)
  const hx = 9, hy = 2;
  if (variant !== 'headless' && variant !== 'splat') {
    const ox = variant === 'slump' ? 2 : 0;
    const head = [
      '.ccc..',
      'cccccb',
      'cccccb',
      'cccccb',
      '.ccc..',
    ];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) {
      const ch = head[y][x];
      if (ch === 'c') px(g, hx + x + ox, hy + y, PAL.cap);
      if (ch === 'b') px(g, hx + x + ox, hy + y, PAL.brim);
    }
    px(g, hx + 1 + ox, hy + 1, shade(PAL.cap, 0.5)); // shine
    if (variant === 'arms') {
      px(g, 11, 0, PAL.skin); px(g, 12, 0, PAL.skin);
      px(g, 11, 1, PAL.skin);
      px(g, 11, Wd + 1, PAL.skin); px(g, 12, Wd + 1, PAL.skin);
    }
  } else {
    // what's left after the sniper is done
    rect(g, 10, 3, 4, 4, PAL.blood2);
    px(g, 11, 4, PAL.blood); px(g, 12, 5, PAL.blood); px(g, 10, 6, PAL.blood);
    if (variant === 'splat') {
      px(g, 14, 3, PAL.blood); px(g, 15, 5, PAL.blood); px(g, 14, 6, PAL.blood2);
      px(g, 16, 4, PAL.blood); px(g, 9, 2, PAL.blood); px(g, 8, 5, PAL.blood2);
      px(g, 13, 2, PAL.blood); px(g, 17, 6, PAL.blood2); px(g, 7, 7, PAL.blood);
    }
  }
  return c;
}
// Where the driver's head sits relative to the car sprite's centre.
const HEAD_OFF = { x: -0.5, y: -2.5 };

// NPC vehicles. kind: sedan | taxi | police | van | truck | bus
function buildNpcCar(kind, body, flash) {
  const dims = { sedan: [24, 12], taxi: [24, 12], police: [24, 12], van: [27, 12], truck: [36, 13], bus: [46, 13] };
  const [L, Wd] = dims[kind];
  const c = makeCanvas(L, Wd + 2);
  const g = c.getContext('2d');
  if (kind === 'truck') {
    const s = paintCarBase(g, L, Wd, body);
    // cargo box
    rect(g, 1, 1, L - 12, Wd, '#b9b6c6');
    rect(g, 2, 2, L - 14, Wd - 2, '#dedbe8');
    for (let x = 5; x < L - 12; x += 5) rect(g, x, 2, 1, Wd - 2, '#c7c4d3');
    rect(g, L - 11, 1, 1, Wd, s.out);
    rect(g, L - 5, 2, 2, Wd - 2, PAL.glass);
    rect(g, L - 4, 3, 1, 2, PAL.glassHi);
    return c;
  }
  if (kind === 'bus') {
    const s = paintCarBase(g, L, Wd, body);
    rect(g, 2, 2, L - 5, 1, PAL.glassDark);
    rect(g, 2, Wd - 1, L - 5, 1, PAL.glassDark);
    for (let x = 6; x < L - 6; x += 6) rect(g, x, 2, 1, 1, s.lo);
    rect(g, L - 3, 2, 2, Wd - 2, PAL.glass);
    rect(g, 8, 4, 5, Wd - 6, '#9a98aa');
    rect(g, 22, 4, 5, Wd - 6, '#9a98aa');
    rect(g, 9, 5, 3, Wd - 8, '#6c6a7e');
    rect(g, 23, 5, 3, Wd - 8, '#6c6a7e');
    return c;
  }
  const s = paintCarBase(g, L, Wd, body);
  const roofX0 = kind === 'van' ? 4 : 7;
  const roofX1 = L - 10;
  // windshield, rear window, roof and side windows
  rect(g, roofX1, 2, 2, Wd - 2, PAL.glass);
  rect(g, roofX1 + 1, 3, 1, 2, PAL.glassHi);
  if (kind !== 'van') rect(g, roofX0 - 2, 2, 2, Wd - 2, PAL.glassDark);
  rect(g, roofX0, 2, roofX1 - roofX0, Wd - 2, s.hi);
  rect(g, roofX0, 2, roofX1 - roofX0, 1, PAL.glassDark);
  rect(g, roofX0, Wd - 1, roofX1 - roofX0, 1, PAL.glassDark);
  if (kind === 'police') {
    rect(g, 1, 2, 5, Wd - 2, '#1c1c28');
    rect(g, L - 7, 2, 6, Wd - 2, '#1c1c28');
    const mid = Math.floor((roofX0 + roofX1) / 2);
    rect(g, mid, 3, 2, Math.floor((Wd - 4) / 2), flash ? '#ff5a6a' : '#8a1020');
    rect(g, mid, 3 + Math.floor((Wd - 4) / 2), 2, Math.ceil((Wd - 4) / 2), flash ? '#1a2a7a' : '#5aa0ff');
  }
  if (kind === 'taxi') {
    const mid = Math.floor((roofX0 + roofX1) / 2);
    rect(g, mid - 1, 4, 3, Wd - 6, '#1b1b22');
    rect(g, mid, 5, 1, Wd - 8, '#fff2a0');
  }
  return c;
}

// A sniper lying prone on a rooftop, rifle pointing down at the road.
const SNIPER_ART = [
  '.b...b.',
  '.o...o.',
  '.o...o.',
  '.oo.oo.',
  '..ooo..',
  '.ooooo.',
  '.oOooo.',
  '.ooOoO.',
  'ooooooo',
  'o.ooo.o',
  'o.hHh.o',
  '.shhhs.',
  '..rsr..',
  '...r...',
  '...r...',
  '...r...',
  '...r...',
  '...r...',
];
const SNIPER_PAL = { b: '#15141b', o: '#51602e', O: '#34401b', h: '#2e3a1d', H: '#46552b', s: '#d9a07a', r: '#101014' };
const SNIPER_MUZZLE = { x: 3, y: 17 };

// Big icons used inside the traffic light lamps (7x7).
const ICONS = {
  go: ['#......', '###....', '#####..', '#######', '#####..', '###....', '#......'],
  stop: ['.#####.', '#######', '#######', '#######', '#######', '#######', '.#####.'],
  slow: ['.......', '..###..', '.#####.', '.######', '.#####.', '.#...#.', '.......'],
  dance: ['...###.', '...#..#', '...#...', '...#...', '.###...', '####...', '.##....'],
  slide: ['...#...', '..###..', '.#.#.#.', '...#...', '.#.#.#.', '..###..', '...#...'],
  reverse: ['......#', '....###', '..#####', '#######', '..#####', '....###', '......#'],
  honk: ['.....#.', '....##.', '#####.#', '#####.#', '#####.#', '....##.', '.....#.'],
  spin: ['..###..', '.#...#.', '#.....#', '#...###', '#....#.', '.#.....', '..###..'],
  dead: ['.#####.', '#######', '#..#..#', '#######', '.##.##.', '..###..', '..#.#..'],
  coffee: ['.#.#...', '#.#....', '.......', '#####..', '######.', '#####.#', '.###...'],
  panic: ['..###..', '..###..', '..###..', '..###..', '...#...', '.......', '..###..'],
  chaos: ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '##...##'],
};
const iconCache = new Map();
function iconSprite(name, col) {
  const key = name + col;
  let c = iconCache.get(key);
  if (c) return c;
  const pal = { '#': col };
  c = spriteFromArt(ICONS[name], pal);
  iconCache.set(key, c);
  return c;
}

// Built once at startup.
const SPR = {};
function buildSprites() {
  SPR.player = {
    normal: buildPlayerCar('normal'),
    arms: buildPlayerCar('arms'),
    slump: buildPlayerCar('slump'),
    headless: buildPlayerCar('headless'),
    splat: buildPlayerCar('splat'),
  };
  SPR.sniperDown = spriteFromArt(SNIPER_ART, SNIPER_PAL);
  SPR.sniperUp = flipSprite(SPR.sniperDown, false, true);
  const sedanColors = ['#dcdbe6', '#2d2c3a', '#7d7b92', '#2f5d8c', '#7c2d3a', '#5b6b35', '#2f7f7a', '#c9b48e', '#9aa3b5'];
  SPR.npc = [];
  for (const col of sedanColors) SPR.npc.push({ kind: 'sedan', spr: [buildNpcCar('sedan', col)] });
  SPR.npc.push({ kind: 'taxi', spr: [buildNpcCar('taxi', '#f4c21c')] });
  SPR.npc.push({ kind: 'police', spr: [buildNpcCar('police', '#f1f1f6', false), buildNpcCar('police', '#f1f1f6', true)] });
  SPR.npc.push({ kind: 'van', spr: [buildNpcCar('van', '#e7e3d6')] });
  SPR.npc.push({ kind: 'van', spr: [buildNpcCar('van', '#3f6f9e')] });
  SPR.npc.push({ kind: 'truck', spr: [buildNpcCar('truck', '#d9412f')] });
  SPR.npc.push({ kind: 'truck', spr: [buildNpcCar('truck', '#2f7fd9')] });
  SPR.npc.push({ kind: 'bus', spr: [buildNpcCar('bus', '#2aa39a')] });
}

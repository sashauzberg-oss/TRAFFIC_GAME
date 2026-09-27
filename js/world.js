'use strict';
// ---------------------------------------------------------------------------
// world.js - the city (generated block by block, forever, in both
// directions), the other cars, pedestrians, snipers, particles and pickups.
// The road runs left -> right; screen y == world y (no vertical scrolling).
// ---------------------------------------------------------------------------

const HUD_H = 26;
const TOP_ROOF_Y = 26;           // rooftops 26..55
const TOP_WALK_Y = 56;           // sidewalk 56..65
const ROAD_Y0 = 66;              // road 66..145
const LANE_H = 20;
const LANES = 4;
const ROAD_Y1 = ROAD_Y0 + LANE_H * LANES;
const BOT_WALK_Y = ROAD_Y1;      // sidewalk 146..155
const BOT_ROOF_Y = BOT_WALK_Y + 10; // rooftops 156..179
const laneY = (i) => ROAD_Y0 + LANE_H * i + LANE_H / 2;

const BLOCK_W = 512;
const CROSS_X = 24;              // cross street inside each block
const CROSS_W = 44;
const BUILD_X0 = CROSS_X + CROSS_W + 2;

const COL = {
  asphalt: '#2b2a36', asphaltLo: '#24232e', asphaltHi: '#35343f',
  lane: '#d6d4e4', laneDim: '#a9a7ba', yellow: '#e8c33a',
  walk: '#a6a4b6', walkLine: '#9290a3', curb: '#d2d0de', walkShadow: '#85839a',
  alley: '#3a3946', grass: '#3f7a3a', grassHi: '#58a04c', grassLo: '#2f5f2c',
  leaf: '#2f8a3e', leafHi: '#52b35a', leafLo: '#1f5f2c',
};
const ROOF_COLS = ['#5d5a6e', '#6e6474', '#7a6a5a', '#4f5d66', '#6b5a5a', '#58626b', '#80776b', '#4d4f63', '#6a6f5b'];

// ---- city blocks ------------------------------------------------------------
const blockCache = new Map();
function getBlock(i) {
  let b = blockCache.get(i);
  if (b) return b;
  b = genBlock(i);
  blockCache.set(i, b);
  if (blockCache.size > 10) {
    let far = null, farD = -1;
    for (const k of blockCache.keys()) { const d = Math.abs(k - i); if (d > farD) { farD = d; far = k; } }
    blockCache.delete(far);
  }
  return b;
}

function genBlock(i) {
  const rng = mulberry32(hashInt(i, 7919));
  const r = (a, b) => a + rng() * (b - a);
  const ri = (a, b) => Math.floor(r(a, b + 1));
  const c = makeCanvas(BLOCK_W, H - TOP_ROOF_Y);
  const g = c.getContext('2d');
  g.translate(0, -TOP_ROOF_Y); // draw in world y coordinates
  const x0 = i * BLOCK_W;
  const data = { canvas: c, x0, snipers: [], lamps: [], windows: [] };

  // road surface with speckles
  rect(g, 0, ROAD_Y0, BLOCK_W, ROAD_Y1 - ROAD_Y0, COL.asphalt);
  for (let n = 0; n < 1400; n++) {
    px(g, ri(0, BLOCK_W - 1), ri(ROAD_Y0, ROAD_Y1 - 1), rng() < 0.5 ? COL.asphaltLo : COL.asphaltHi);
  }
  // cross street through the building rows
  rect(g, CROSS_X, TOP_ROOF_Y, CROSS_W, ROAD_Y0 - TOP_ROOF_Y, COL.asphalt);
  rect(g, CROSS_X, ROAD_Y1, CROSS_W, H - ROAD_Y1, COL.asphalt);
  for (let n = 0; n < 220; n++) {
    const yy = rng() < 0.5 ? ri(TOP_ROOF_Y, ROAD_Y0 - 1) : ri(ROAD_Y1, H - 1);
    px(g, CROSS_X + ri(0, CROSS_W - 1), yy, rng() < 0.5 ? COL.asphaltLo : COL.asphaltHi);
  }
  for (let y = TOP_ROOF_Y; y < ROAD_Y0 - 12; y += 8) rect(g, CROSS_X + CROSS_W / 2 - 1, y, 2, 4, COL.yellow);
  for (let y = ROAD_Y1 + 12; y < H; y += 8) rect(g, CROSS_X + CROSS_W / 2 - 1, y, 2, 4, COL.yellow);
  // zebra crossings over the side street and the main road
  for (let x = CROSS_X + 2; x < CROSS_X + CROSS_W - 2; x += 4) {
    rect(g, x, ROAD_Y0 - 9, 2, 7, COL.lane);
    rect(g, x, ROAD_Y1 + 2, 2, 7, COL.lane);
  }
  for (let y = ROAD_Y0 + 2; y < ROAD_Y1 - 2; y += 4) {
    rect(g, CROSS_X - 11, y, 8, 2, COL.lane);
    rect(g, CROSS_X + CROSS_W + 3, y, 8, 2, COL.lane);
  }
  rect(g, CROSS_X - 15, ROAD_Y0 + 1, 2, ROAD_Y1 - ROAD_Y0 - 2, COL.lane); // stop line

  // lane markings (skipped inside the intersection)
  for (let k = 1; k < LANES; k++) {
    const y = ROAD_Y0 + LANE_H * k;
    for (let x = 0; x < BLOCK_W; x += 16) {
      if (x + 8 > CROSS_X - 16 && x < CROSS_X + CROSS_W + 12) continue;
      rect(g, x, y, 8, 1, COL.lane);
    }
  }
  for (let x = 0; x < BLOCK_W; x++) {
    if (x >= CROSS_X - 16 && x < CROSS_X + CROSS_W + 12) continue;
    px(g, x, ROAD_Y0 + 1, COL.laneDim);
    px(g, x, ROAD_Y1 - 2, COL.laneDim);
  }
  // road clutter: manholes, oil stains, painted arrows
  for (let n = 0; n < 3; n++) {
    const mx = ri(BUILD_X0 + 10, BLOCK_W - 20), my = laneY(ri(0, 3)) + ri(-4, 4);
    const kind = rng();
    if (kind < 0.4) { disc(g, mx, my, 3, '#3a3946'); ring(g, mx, my, 3, '#22212b'); px(g, mx, my, '#22212b'); }
    else if (kind < 0.7) { disc(g, mx, my, 2, '#1d1c25'); px(g, mx + 2, my + 1, '#1d1c25'); px(g, mx - 3, my, '#1d1c25'); }
    else {
      const ay = laneY(ri(0, 3));
      rect(g, mx - 6, ay - 1, 9, 2, COL.laneDim);
      rect(g, mx + 1, ay - 3, 2, 6, COL.laneDim);
      rect(g, mx + 3, ay - 2, 1, 4, COL.laneDim);
      rect(g, mx + 4, ay - 1, 1, 2, COL.laneDim);
    }
  }

  // sidewalks
  const walk = (y0, curbY, shadowY) => {
    rect(g, 0, y0, BLOCK_W, 10, COL.walk);
    for (let x = 0; x < BLOCK_W; x += 8) rect(g, x, y0, 1, 10, COL.walkLine);
    rect(g, 0, curbY, BLOCK_W, 1, COL.curb);
    rect(g, 0, shadowY, BLOCK_W, 1, COL.walkShadow);
    rect(g, CROSS_X, y0, CROSS_W, 10, COL.asphalt);
    rect(g, CROSS_X - 1, y0, 1, 10, COL.curb);
    rect(g, CROSS_X + CROSS_W, y0, 1, 10, COL.curb);
  };
  walk(TOP_WALK_Y, ROAD_Y0 - 1, TOP_WALK_Y);
  walk(BOT_WALK_Y, BOT_WALK_Y, BOT_WALK_Y + 9);
  for (let x = CROSS_X + 2; x < CROSS_X + CROSS_W - 2; x += 4) {
    rect(g, x, TOP_WALK_Y + 1, 2, 7, COL.lane);
    rect(g, x, BOT_WALK_Y + 2, 2, 7, COL.lane);
  }

  // pocket parks at the start of the block
  const park = (y0, h) => {
    rect(g, 0, y0, CROSS_X - 1, h, COL.grass);
    for (let n = 0; n < 40; n++) px(g, ri(0, CROSS_X - 2), ri(y0, y0 + h - 1), rng() < 0.5 ? COL.grassHi : COL.grassLo);
    tree(g, 11, y0 + Math.floor(h / 2), 5);
  };
  park(TOP_ROOF_Y, TOP_WALK_Y - TOP_ROOF_Y);
  park(BOT_ROOF_Y, H - BOT_ROOF_Y);

  // buildings
  const row = (y0, y1, top) => {
    let x = BUILD_X0;
    const snipersWanted = top ? 2 : 1;
    const slots = [];
    while (x < BLOCK_W - 12) {
      const w = Math.min(BLOCK_W - 2 - x, ri(40, 104));
      if (w < 12) break;
      building(g, rng, x, y0, w, y1 - y0, top, data);
      slots.push([x, w]);
      x += w + ri(2, 4);
    }
    // snipers hide on the rooftops
    for (let s = 0; s < snipersWanted; s++) {
      const half = (BLOCK_W - BUILD_X0) / snipersWanted;
      const lo = BUILD_X0 + half * s + 8, hi = lo + half - 24;
      const sx = ri(lo, hi);
      const sy = top ? ri(y0 + 2, y1 - 22) : y0 + 3;
      data.snipers.push({ x: x0 + sx, y: sy, up: !top, glint: rng() * 5 });
    }
  };
  row(TOP_ROOF_Y, TOP_WALK_Y, true);
  row(BOT_ROOF_Y, H, false);

  // street furniture: trees, lamps, hydrants, benches
  for (const [wy, dir] of [[TOP_WALK_Y + 4, 1], [BOT_WALK_Y + 5, -1]]) {
    let x = BUILD_X0 + ri(4, 30);
    while (x < BLOCK_W - 8) {
      const k = rng();
      if (k < 0.45) tree(g, x, wy, 4);
      else if (k < 0.7) {
        rect(g, x, wy - 1, 2, 2, '#3c3b4c');
        px(g, x, wy - 1 + dir * 2, '#ffe9a0');
        data.lamps.push({ x: x0 + x, y: wy });
      } else if (k < 0.82) { rect(g, x, wy, 2, 2, '#d8342c'); px(g, x, wy, '#ff7a6a'); }
      else if (k < 0.92) { rect(g, x, wy - 1, 7, 2, '#7a5230'); rect(g, x, wy + dir, 7, 1, '#5a3a20'); }
      else { rect(g, x, wy - 1, 3, 3, '#2f5f3a'); px(g, x + 1, wy, '#1f3f27'); }
      x += ri(26, 62);
    }
  }
  return data;
}

function tree(g, x, y, r) {
  disc(g, x + 2, y + 2, r, 'rgba(0,0,0,0.28)');
  disc(g, x, y, r, COL.leafLo);
  disc(g, x - 1, y - 1, r - 1, COL.leaf);
  disc(g, x - 2, y - 2, Math.max(1, r - 3), COL.leafHi);
}

function building(g, rng, x, y, w, h, top, data) {
  const ri = (a, b) => Math.floor(a + rng() * (b - a + 1));
  const roof = ROOF_COLS[ri(0, ROOF_COLS.length - 1)];
  const lo = shade(roof, -0.3), hi = shade(roof, 0.18);
  const facade = top ? 4 : 0;
  const rh = h - facade;
  rect(g, x, y, w, rh, lo);
  rect(g, x + 1, y + 1, w - 2, rh - 2, roof);
  rect(g, x + 1, y + 1, w - 2, 1, hi);
  if (top) {
    // the front wall, seen at a slight angle, with windows
    rect(g, x, y + rh, w, facade, shade(roof, -0.45));
    for (let wx = x + 2; wx < x + w - 2; wx += 4) {
      const lit = rng() < 0.35;
      rect(g, wx, y + rh + 1, 2, 2, lit ? '#ffd966' : '#2a3342');
      if (lit) data.windows.push({ x: data.x0 + wx, y: y + rh + 1 });
    }
  }
  // rooftop details
  const n = ri(2, 5);
  for (let k = 0; k < n; k++) {
    const t = rng();
    const dx = x + ri(3, Math.max(3, w - 10)), dy = y + ri(3, Math.max(3, rh - 9));
    if (t < 0.3) { rect(g, dx, dy, 5, 4, '#9a98aa'); rect(g, dx + 1, dy + 1, 3, 2, '#6c6a7e'); px(g, dx + 2, dy + 1, '#b8b6c6'); }
    else if (t < 0.48) { rect(g, dx, dy, 2, 2, '#2a2935'); }
    else if (t < 0.62) { rect(g, dx, dy, 6, 4, '#c8ccd8'); rect(g, dx + 1, dy + 1, 4, 2, '#7fc4ea'); }
    else if (t < 0.72 && w > 24 && rh > 14) { disc(g, dx + 4, dy + 4, 4, '#7a5230'); ring(g, dx + 4, dy + 4, 4, '#5a3a20'); ring(g, dx + 4, dy + 4, 2, '#5a3a20'); }
    else if (t < 0.84 && w > 20) {
      for (let sx = 0; sx < 3; sx++) for (let sy = 0; sy < 2; sy++) rect(g, dx + sx * 4, dy + sy * 3, 3, 2, '#2d4a86');
    } else if (t < 0.93) {
      for (let q = 0; q < 6; q++) px(g, dx + ri(0, 7), dy + ri(0, 5), rng() < 0.5 ? COL.leafHi : COL.leaf);
    } else { rect(g, dx, dy, 1, 5, '#2a2935'); px(g, dx, dy, '#ff4a4a'); }
  }
  if (w > 50 && rh > 20 && rng() < 0.12) {
    const cx = x + Math.floor(w / 2), cy = y + Math.floor(rh / 2);
    disc(g, cx, cy, 8, '#3d3c4a');
    ring(g, cx, cy, 8, '#e8c33a');
    text(g, 'H', cx - 2, cy - 3, { color: '#e8c33a' });
  }
}

function drawCity(g, camX) {
  const first = Math.floor(camX / BLOCK_W);
  const last = Math.floor((camX + W) / BLOCK_W);
  for (let i = first; i <= last; i++) {
    const b = getBlock(i);
    g.drawImage(b.canvas, i * BLOCK_W - camX, TOP_ROOF_Y);
  }
}
function visibleBlocks(camX) {
  const out = [];
  const first = Math.floor((camX - 40) / BLOCK_W);
  const last = Math.floor((camX + W + 40) / BLOCK_W);
  for (let i = first; i <= last; i++) out.push(getBlock(i));
  return out;
}

// ---- traffic lights hanging over the road (all synced to THE LIGHT) --------
function drawSignals(g, camX, col, t) {
  for (const b of visibleBlocks(camX)) {
    const x = b.x0 + CROSS_X - 6 - camX;
    if (x < -30 || x > W + 30) continue;
    // poles on both corners, arms reaching over the lanes
    rect(g, x - 1, TOP_WALK_Y + 3, 3, 3, '#3a3948');
    rect(g, x, TOP_WALK_Y + 4, 1, ROAD_Y0 + 40 - TOP_WALK_Y - 4, '#1f1e28');
    rect(g, x - 1, BOT_WALK_Y + 4, 3, 3, '#3a3948');
    rect(g, x, ROAD_Y0 + 42, 1, BOT_WALK_Y + 4 - ROAD_Y0 - 42, '#1f1e28');
    for (let k = 0; k < LANES; k++) {
      const y = laneY(k) - 4;
      rect(g, x - 2, y, 5, 9, '#15141c');
      rect(g, x - 1, y + 1, 3, 7, '#26252f');
      const c = typeof col === 'function' ? col(t + k * 0.1) : col;
      rect(g, x - 1, y + 3, 3, 3, c);
      px(g, x, y + 3, shade(c, 0.5));
    }
  }
}

// ---- snipers ----------------------------------------------------------------
function visibleSnipers(camX) {
  const out = [];
  for (const b of visibleBlocks(camX)) for (const s of b.snipers) {
    const sx = s.x - camX;
    if (sx > -10 && sx < W + 2) out.push(s);
  }
  return out;
}
function sniperMuzzle(s) {
  return s.up ? { x: s.x + SNIPER_MUZZLE.x, y: s.y } : { x: s.x + SNIPER_MUZZLE.x, y: s.y + SNIPER_MUZZLE.y };
}
// The sniper who gets the shot: the closest one that isn't hidden by the HUD.
function chooseSniper(camX, tx, ty) {
  let best = null, bd = 1e9;
  for (const s of visibleSnipers(camX)) {
    const sx = s.x - camX;
    if (sx < 36 || sx > W - 10) continue;
    const m = sniperMuzzle(s);
    const d = Math.hypot(m.x - tx, m.y - ty);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function drawSnipers(g, camX, t, active, aiming) {
  for (const s of visibleSnipers(camX)) {
    const sx = Math.round(s.x - camX);
    g.drawImage(s.up ? SPR.sniperUp : SPR.sniperDown, sx, s.y);
    // scope glint every few seconds (constantly when aiming at you)
    const gl = (s === active && aiming) ? (Math.floor(t * 12) % 2 === 0) : ((t + s.glint) % 4.5 < 0.18);
    if (gl) {
      const gy = s.up ? s.y + 5 : s.y + 12;
      px(g, sx + 3, gy, '#ffffff');
      px(g, sx + 2, gy, '#bfe6ff'); px(g, sx + 4, gy, '#bfe6ff');
      px(g, sx + 3, gy - 1, '#bfe6ff'); px(g, sx + 3, gy + 1, '#bfe6ff');
    }
  }
}

// ---- traffic (NPC cars) -------------------------------------------------------
const npcs = [];
function npcBox(n) { return { x0: n.x - n.L / 2, x1: n.x + n.L / 2, y0: n.y - n.Wd / 2, y1: n.y + n.Wd / 2 }; }

function spawnNpc(px0, where) {
  const r = Math.random();
  const t = r < 0.6 ? SPR.npc[irnd(0, 8)] : pick(SPR.npc);
  const L = t.spr[0].width, Wd = t.spr[0].height - 2;
  for (let tries = 0; tries < 6; tries++) {
    const lane = irnd(0, LANES - 1);
    const x = where === 'ahead' ? px0 + rnd(W - 60, W + 260)
      : where === 'behind' ? px0 - rnd(180, 420)
      : px0 + rnd(-140, W + 200);
    const y = laneY(lane);
    const clash = npcs.some((o) => Math.abs(o.y - y) < 12 && Math.abs(o.x - x) < (o.L + L) / 2 + 26);
    if (clash) continue;
    if (Math.abs(x - px0) < 40 && Math.abs(y - player.y) < 16) continue;
    const big = t.kind === 'truck' || t.kind === 'bus';
    npcs.push({
      t, L, Wd, x, y, lane, vx: 0, ang: 0, spin: 0, bounce: 0, jx: 0, jy: 0, wob: Math.random() * 10,
      cruise: big ? rnd(60, 85) : rnd(72, 125), noteT: rnd(0, 1),
    });
    return;
  }
}

function resetTraffic(px0) {
  npcs.length = 0;
  for (let k = 0; k < 6; k++) spawnNpc(px0, 'any');
}

function npcTargetSpeed(n, beh) {
  switch (beh) {
    case 'go': case 'coffee': case 'honk': return n.cruise;
    case 'slow': return 30;
    case 'rev': return -34;
    default: return 0;
  }
}

function updateTraffic(dt, beh, t, frozen) {
  for (const n of npcs) {
    let target = frozen ? 0 : npcTargetSpeed(n, beh);
    // keep a safe gap to whatever is ahead (or behind, when reversing) in the lane
    let gapAhead = 1e9, vAhead = 0, gapBehind = 1e9, vBehind = 0;
    const others = npcs.concat([{ x: player.x, y: player.y, L: 24, vx: player.vx, isPlayer: true }]);
    for (const o of others) {
      if (o === n || Math.abs(o.y - n.y) > 13) continue;
      const d = o.x - n.x;
      const gap = Math.abs(d) - (o.L + n.L) / 2;
      if (d > 0 && gap < gapAhead) { gapAhead = gap; vAhead = o.vx; }
      if (d < 0 && gap < gapBehind) { gapBehind = gap; vBehind = o.vx; }
    }
    if (target > 0 && gapAhead < 60) target = Math.min(target, Math.max(0, vAhead + (gapAhead - 16) * 2.5));
    if (target < 0 && gapBehind < 60) target = Math.max(target, Math.min(0, vBehind - (gapBehind - 16) * 2.5));
    const rate = Math.abs(target) > Math.abs(n.vx) && sign(target) === sign(n.vx || target) ? 130 : 280;
    if (n.vx < target) n.vx = Math.min(target, n.vx + rate * dt);
    else n.vx = Math.max(target, n.vx - rate * dt);
    n.x += n.vx * dt;

    // everybody obeys THE LIGHT, in their own way
    n.bounce = 0; n.jx = 0; n.jy = 0;
    if (beh === 'dance' && !frozen) { n.bounce = Math.abs(Math.sin(t * 9 + n.wob)) * 3; n.ang = Math.sin(t * 4.5 + n.wob) * 0.18; }
    else if (beh === 'spin' && !frozen) { n.spin += dt * (4 + (n.wob % 2)); n.ang = n.spin; }
    else if (beh === 'slide' && !frozen) { n.jy = Math.round(Math.sin(t * 5 + n.wob) * 3); n.ang = 0; }
    else if (beh === 'panic' && !frozen) { n.jx = irnd(-1, 1); n.jy = irnd(-1, 1); n.ang = rnd(-0.1, 0.1); }
    else {
      // settle back to straight
      const a = ((n.ang % TAU) + TAU) % TAU;
      const back = a > Math.PI ? a - TAU : a;
      n.ang = Math.abs(back) < 0.05 ? 0 : back * Math.max(0, 1 - dt * 8);
      n.spin = n.ang;
    }
    if (beh === 'honk' && !frozen) {
      n.noteT -= dt;
      if (n.noteT <= 0 && Math.abs(n.x - player.x) < W) { n.noteT = rnd(0.5, 1.4); addFloater(n.x, n.y - 10, GLYPH.NOTE, '#ff8fd0', 0.8); }
    }
  }
  // recycle cars that fell far off screen
  for (let k = npcs.length - 1; k >= 0; k--) {
    const d = npcs[k].x - player.x;
    if (d > 640 || d < -520) {
      npcs.splice(k, 1);
      spawnNpc(player.x, player.vx < -5 ? 'behind' : 'ahead');
    }
  }
  while (npcs.length < 6) spawnNpc(player.x, player.vx < -5 ? 'behind' : 'ahead');
}

function drawTraffic(g, camX, t) {
  for (const n of npcs) {
    const sx = n.x - camX;
    if (sx < -40 || sx > W + 40) continue;
    const spr = n.t.spr.length > 1 ? n.t.spr[Math.floor(t * 6) % 2] : n.t.spr[0];
    if (n.bounce > 0.5) rect(g, sx - n.L / 2 + 2, n.y - n.Wd / 2 + 3, n.L - 2, n.Wd, 'rgba(0,0,0,0.35)');
    drawSprite(g, spr, sx + n.jx, n.y + n.jy - Math.round(n.bounce), n.ang);
  }
}

// ---- pedestrians --------------------------------------------------------------
const peds = [];
const SHIRTS = ['#e85d75', '#4fb0e8', '#f2c14e', '#7bd88f', '#b58df0', '#f08a4b', '#e8e8f0', '#3b3b4f'];
const HAIRS = ['#2a1d14', '#6b3e1f', '#e8c56b', '#1a1a1a', '#b0b0b8', '#c0452c'];
function spawnPed(camX, anywhere) {
  const top = Math.random() < 0.5;
  peds.push({
    x: anywhere ? camX + rnd(-20, W + 20) : (Math.random() < 0.5 ? camX - 10 : camX + W + 10),
    y: top ? TOP_WALK_Y + irnd(2, 5) : BOT_WALK_Y + irnd(3, 6),
    vx: rnd(8, 18) * (Math.random() < 0.5 ? -1 : 1),
    shirt: pick(SHIRTS), hair: pick(HAIRS), ph: rnd(0, 10), flee: false,
  });
}
function resetPeds(camX) {
  peds.length = 0;
  for (let k = 0; k < 12; k++) spawnPed(camX, true);
}
function updatePeds(dt, camX, beh, fleeFrom) {
  for (const p of peds) {
    if (fleeFrom != null && !p.flee) { p.flee = true; p.vx = (p.x < fleeFrom ? -1 : 1) * rnd(45, 70); }
    if (beh !== 'dance' && beh !== 'stop' && beh !== 'dead' || p.flee) p.x += p.vx * dt;
    p.ph += dt * (p.flee ? 18 : 8);
  }
  for (let k = peds.length - 1; k >= 0; k--) {
    const sx = peds[k].x - camX;
    if (sx < -60 || sx > W + 60) { peds.splice(k, 1); if (fleeFrom == null) spawnPed(camX, false); }
  }
}
function drawPeds(g, camX, t, beh) {
  for (const p of peds) {
    const sx = Math.round(p.x - camX);
    if (sx < -4 || sx > W + 4) continue;
    const hop = beh === 'dance' && !p.flee ? (Math.sin(t * 10 + p.ph) > 0 ? 1 : 0) : 0;
    const step = Math.floor(p.ph) % 2;
    const y = p.y - hop;
    rect(g, sx - 1, y + 1, 4, 2, p.shirt);
    rect(g, sx, y, 2, 2, p.hair);
    px(g, sx + (step ? -1 : 2), y + 3, '#2a2935');
    if (hop || p.flee) { px(g, sx - 2, y - 1, PAL.skin); px(g, sx + 3, y - 1, PAL.skin); }
  }
}

// ---- particles, floating text, skid marks -------------------------------------
const fx = [];
const floaters = [];
const marks = [];
function burst(x, y, n, cols, spd, o) {
  o = o || {};
  for (let k = 0; k < n; k++) {
    const a = o.dir != null ? o.dir + rnd(-(o.spread || 0.6), o.spread || 0.6) : rnd(0, TAU);
    const s = rnd(spd * 0.3, spd);
    fx.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(o.life || 0.6, (o.life || 0.6) * 1.8),
      col: pick(cols), size: o.size || 1, drag: o.drag == null ? 2.5 : o.drag, stick: !!o.stick, t: 0,
    });
  }
}
function addFloater(x, y, str, col, life, scale) {
  floaters.push({ x, y, str, col, life: life || 1, t: 0, scale: scale || 1 });
}
function addMark(x, y) {
  marks.push({ x: Math.round(x), y: Math.round(y), t: 0 });
  if (marks.length > 400) marks.shift();
}
function updateFx(dt) {
  for (let k = fx.length - 1; k >= 0; k--) {
    const p = fx[k];
    p.t += dt;
    if (!p.stuck) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d;
      if (p.stick && p.t > p.life * 0.5) p.stuck = true;
    }
    if (!p.stick && p.t > p.life) fx.splice(k, 1);
  }
  for (let k = floaters.length - 1; k >= 0; k--) {
    const f = floaters[k];
    f.t += dt;
    f.y -= dt * 14;
    if (f.t > f.life) floaters.splice(k, 1);
  }
  for (let k = marks.length - 1; k >= 0; k--) { marks[k].t += dt; if (marks[k].t > 7) marks.splice(k, 1); }
}
function drawMarks(g, camX) {
  for (const m of marks) {
    const sx = m.x - camX;
    if (sx < -2 || sx > W + 2) continue;
    rect(g, sx, m.y, 2, 1, m.t < 4 ? '#17161e' : '#201f29');
  }
}
function drawFx(g, camX) {
  for (const p of fx) {
    const sx = p.x - camX;
    if (sx < -4 || sx > W + 4) continue;
    rect(g, sx, p.y, p.size, p.size, p.col);
  }
}
function drawFloaters(g, camX) {
  for (const f of floaters) {
    if (f.t < f.life * 0.75 || Math.floor(f.t * 20) % 2 === 0) {
      text(g, f.str, f.x - camX, f.y, { color: f.col, align: 'center', outline: PAL.ink, scale: f.scale });
    }
  }
}

// ---- coffee pickup (BROWN light) ------------------------------------------------
let coffee = null;
function spawnCoffee(behindOk) {
  const behind = behindOk && Math.random() < 0.3;
  const dist = behind ? -rnd(70, 120) : rnd(80, 170);
  let best = 0, bestScore = -1;
  for (let lane = 0; lane < LANES; lane++) {
    const y = laneY(lane);
    const blockers = npcs.filter((n) => Math.abs(n.y - y) < 12 && Math.abs(n.x - (player.x + dist)) < 40).length;
    const score = (blockers ? 0 : 10) + Math.random() * 5;
    if (score > bestScore) { bestScore = score; best = lane; }
  }
  coffee = { x: player.x + dist, y: laneY(best), t: 0 };
}
function drawCoffee(g, camX, t) {
  if (!coffee) return;
  const sx = Math.round(coffee.x - camX), y = Math.round(coffee.y + Math.sin(t * 5) * 1.5);
  ring(g, sx, coffee.y, 8 + (Math.floor(t * 8) % 3), 'rgba(255,220,140,0.55)');
  rect(g, sx - 3, y - 2, 7, 2, '#f5eee0');       // lid
  rect(g, sx - 4, y - 1, 9, 1, '#d8cfbd');
  rect(g, sx - 3, y, 7, 2, '#efe8da');           // cup
  rect(g, sx - 3, y + 2, 7, 2, '#8a4b21');       // sleeve
  rect(g, sx - 2, y + 4, 5, 2, '#efe8da');
  rect(g, sx - 2, y + 6, 5, 1, '#c9c0ae');
  const s = Math.floor(t * 6) % 2;
  px(g, sx - 1 + s, y - 4, '#ffffff'); px(g, sx + s, y - 5, '#dddddd');
  px(g, sx + 2 - s, y - 4, '#dddddd'); px(g, sx + 1 - s, y - 6, '#ffffff');
}

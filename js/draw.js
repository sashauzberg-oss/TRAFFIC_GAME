'use strict';
// ---------------------------------------------------------------------------
// draw.js - rendering: the street, THE LIGHT and the HUD, the sniper-scope
// death cam, and every menu screen. Everything goes onto the 320x180 canvas.
// ---------------------------------------------------------------------------

const INK = '#07060c';
const SCOPE_R = 60;
const scopeCanvas = makeCanvas(126, 126);
const scopeCtx = scopeCanvas.getContext('2d');
const mosaicCanvas = makeCanvas(W, H);
const scopeMask = makeCanvas(126, 126);
disc(scopeMask.getContext('2d'), 63, 63, SCOPE_R, '#ffffff');

function rgba(hex, a) {
  const c = hexToRgb(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
}
function fmt(n) { return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function blink(rate) { return Math.floor(G.t * rate) % 2 === 0; }
function readable(r, t) { return r.id === 'black' ? '#c9c7da' : ruleColor(r, t); }
function shownRule() {
  if (G.state === 'intro' && G.introId && G.introId !== 'basics') return RULES[G.introId];
  return G.phase ? G.phase.rule : RULES.red;
}
function signalColour(r) {
  if (r.id === 'rainbow') return (tt) => hsl(tt * 300, 95, 60);
  if (r.id === 'black') return '#2a2833';
  return r.color;
}

// ---- top level ---------------------------------------------------------------
function render() {
  ctx.imageSmoothingEnabled = false;
  rect(ctx, 0, 0, W, H, '#0b0b12');
  switch (G.state) {
    case 'title': drawTitle(); break;
    case 'rules': drawRulebook(); break;
    case 'intro': drawGameScreen(); drawIntroCard(); break;
    case 'play': drawGameScreen(); break;
    case 'pause': drawGameScreen(); drawPause(); break;
    case 'dying': drawDying(); break;
    case 'over': drawGameScreen(); drawOver(); break;
  }
  if (G.mosaic > 0) applyMosaic([1, 2, 4, 8, 16][Math.ceil(G.mosaic * 4)]);
  if (G.flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, G.flash).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

// Chunkier and chunkier pixels: sample one pixel per k x k block.
function applyMosaic(k) {
  if (k <= 1) return;
  const w = Math.ceil(W / k), h = Math.ceil(H / k);
  const mc = mosaicCanvas.getContext('2d');
  mc.imageSmoothingEnabled = false;
  mc.drawImage(screenCanvas, 0, 0, W, H, 0, 0, w, h);
  ctx.drawImage(mosaicCanvas, 0, 0, w, h, 0, 0, w * k, h * k);
}

function drawGameScreen() {
  const p = G.phase;
  const beh = G.state === 'play' && p ? p.rule.beh : 'stop';
  drawWorld(beh);
  drawHUD();
  if (Input.touchMode && G.state === 'play') drawTouchControls();
}

function drawWorld(beh) {
  const s = G.shake;
  const shx = s > 0.5 ? Math.round(rnd(-s, s)) : 0;
  const shy = s > 0.5 ? Math.round(rnd(-s, s)) : 0;
  const camX = Math.round(G.camX) - shx;
  ctx.save();
  ctx.translate(0, shy);
  drawCity(ctx, camX);
  drawMarks(ctx, camX);
  drawCoffee(ctx, camX, G.t);
  drawTraffic(ctx, camX, G.t);
  drawPlayerCar(ctx, camX);
  drawPeds(ctx, camX, G.t, beh);
  drawSnipers(ctx, camX, G.t, G.aimSniper, !!G.aimSniper);
  drawFx(ctx, camX);
  if (G.dark > 0.02) drawNight(ctx, camX);
  drawSignals(ctx, camX, signalColour(shownRule()), G.t);
  drawLaser(ctx, camX);
  drawTracer(ctx, camX);
  drawFloaters(ctx, camX);
  if (G.state === 'play') drawTaskOverlay(ctx, camX);
  ctx.restore();
}

function drawPlayerCar(g, camX) {
  const P = player;
  if (P.y < 0) return;
  const p = G.phase;
  let v = 'normal';
  if (P.variant === 'splat') v = 'splat';
  else if (p && p.id === 'black' && p.t > p.grace * 0.5) v = 'slump';
  else if (P.armsT > 0) v = 'arms';
  const jx = P.jitT > 0 ? irnd(-1, 1) : 0, jy = P.jitT > 0 ? irnd(-1, 1) : 0;
  const x = P.x - camX + jx, y = P.y - Math.round(P.bounce) + jy;
  if (P.bounce > 0.5) rect(g, P.x - camX - 10, P.y - 4, 22, 11, 'rgba(0,0,0,0.35)');
  drawSprite(g, SPR.player[v], x, y, carAngle());
  if (P.honkT > 0) ring(g, x + 13, y, 3 + Math.floor((0.18 - P.honkT) * 40), 'rgba(255,179,230,0.8)');
}

function drawNight(g, camX) {
  const a = G.dark, k = a / 0.55;
  g.fillStyle = 'rgba(10,8,34,' + a.toFixed(3) + ')';
  g.fillRect(0, HUD_H, W, H - HUD_H);
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const b of visibleBlocks(camX)) {
    for (const w of b.windows) {
      const sx = w.x - camX;
      if (sx > -2 && sx < W) rect(g, sx, w.y, 2, 2, 'rgba(255,210,100,' + (0.5 * k).toFixed(3) + ')');
    }
    for (const l of b.lamps) {
      const sx = l.x - camX;
      if (sx < -12 || sx > W + 12) continue;
      disc(g, sx, l.y, 7, 'rgba(255,200,110,' + (0.09 * k).toFixed(3) + ')');
      disc(g, sx, l.y, 4, 'rgba(255,210,130,' + (0.13 * k).toFixed(3) + ')');
    }
  }
  const cone = (x, y, len, alpha) => {
    for (let i = 0; i < len; i++) {
      const h = 3 + Math.floor(i * 0.45);
      rect(g, x + i, y - Math.floor(h / 2), 1, h, 'rgba(255,240,170,' + (alpha * (1 - i / len)).toFixed(3) + ')');
    }
  };
  for (const n of npcs) {
    const sx = Math.round(n.x - camX);
    if (sx < -80 || sx > W + 40 || Math.abs(n.ang) > 0.3) continue;
    cone(sx + Math.floor(n.L / 2), Math.round(n.y), 34, 0.2 * k);
  }
  if (player.y > 0 && !player.dead && Math.abs(carAngle()) < 0.5) cone(Math.round(player.x - camX) + 12, Math.round(player.y), 46, 0.28 * k);
  g.restore();
}

function drawLaser(g, camX) {
  const p = G.phase;
  if (G.state !== 'play' || !p || p.heat < 0.03 || !G.aimSniper) return;
  const h = headPos(), m = sniperMuzzle(G.aimSniper);
  const wob = (1 - p.heat) * 18, a = G.t * 6;
  const tx = h.x + Math.cos(a) * wob, ty = h.y + Math.sin(a * 1.37) * wob * 0.6;
  line(g, m.x - camX, m.y, tx - camX, ty, p.heat > 0.7 ? '#ff2040' : 'rgba(255,32,64,0.65)', [2, 2], Math.floor(G.t * 40));
  const dx = Math.round(tx - camX), dy = Math.round(ty);
  rect(g, dx - 1, dy - 1, 3, 3, 'rgba(255,40,70,0.5)');
  px(g, dx, dy, '#ffffff');
  if (p.heat > 0.6 && blink(10)) ring(g, dx, dy, 3, '#ff2040');
}

function drawTracer(g, camX) {
  const T = G.tracer;
  if (!T) return;
  line(g, T.x0 - camX, T.y0, T.x1 - camX, T.y1, '#fff6c0');
  disc(g, T.x0 - camX, T.y0, 2, '#ffe14a');
  px(g, T.x0 - camX, T.y0, '#ffffff');
}

// ---- helpers that float over the street, telling you what to press -------------
function arrowBox(g, x, y, dir, state) {
  const bg = state === 'done' ? '#2d2144' : state === 'now' ? '#ffffff' : '#5a2a90';
  const fg = state === 'done' ? '#7a62a0' : state === 'now' ? '#5a10a8' : '#f0d8ff';
  rect(g, x, y, 9, 9, bg);
  frame(g, x, y, 9, 9, state === 'now' ? '#b04bff' : INK);
  text(g, ARROW_GLYPH[dir], x + 2, y + 1, { color: fg });
}
function bar(g, x, y, w, frac, col) {
  rect(g, x - 1, y - 1, w + 2, 5, INK);
  rect(g, x, y, w, 3, '#2a2838');
  rect(g, x, y, Math.round(w * clamp(frac, 0, 1)), 3, col);
}
function drawTaskOverlay(g, camX) {
  const p = G.phase;
  if (!p) return;
  const cx = Math.round(player.x - camX), cy = Math.round(player.y - player.bounce);
  const col = ruleColor(p.rule, G.t);
  const label = (s, y, c) => text(g, s, cx, y, { color: c || '#ffffff', align: 'center', outline: INK });
  if (p.countdown) return;
  switch (p.id) {
    case 'purple': {
      const n = p.seq.length, total = n * 10 - 1;
      const x0 = cx - Math.floor(total / 2), y = cy - 24;
      rect(g, x0 - 2, y - 2, total + 4, 13, 'rgba(10,8,20,0.8)');
      for (let i = 0; i < n; i++) {
        const st = i < p.idx ? 'done' : i === p.idx && !p.done ? 'now' : 'todo';
        arrowBox(g, x0 + i * 10, y + (st === 'now' && blink(8) ? -1 : 0), p.seq[i], st);
      }
      break;
    }
    case 'cyan': {
      const names = ['right', 'down', 'left', 'up'];
      const pos = [[17, 0], [0, 13], [-17, 0], [0, -13]];
      const dir = p.rot < 0 ? -1 : 1;
      const next = (p.head + dir + 4) % 4;
      for (let q = 0; q < 4; q++) {
        const st = q === next && !p.done ? 'now' : 'todo';
        arrowBox(g, cx + pos[q][0] - 4, cy + pos[q][1] - 4 + (st === 'now' && blink(8) ? -1 : 0), names[q], st);
      }
      label('SPIN ' + Math.min(Math.abs(p.rot), 4 * p.turns) + '/' + 4 * p.turns, cy - 28, col);
      break;
    }
    case 'pink': {
      label('HONK ' + p.count + '/' + p.need, cy - 24, col);
      const w = p.need * 6 - 1;
      for (let i = 0; i < p.need; i++) {
        const x = cx - Math.floor(w / 2) + i * 6;
        rect(g, x, cy - 15, 5, 4, INK);
        rect(g, x + 1, cy - 14, 3, 2, i < p.count ? col : '#3a3848');
      }
      break;
    }
    case 'white':
      label('MASH! ' + p.count + '/' + p.need, cy - 26, '#ffffff');
      bar(g, cx - 18, cy - 16, 36, p.count / p.need, '#ffffff');
      break;
    case 'blue':
      label('SLIDE', cy - 26, col);
      bar(g, cx - 16, cy - 16, 32, p.prog / p.need, col);
      if (!p.done && blink(4)) {
        text(g, GLYPH.U, cx - 2, cy - 12 - 0, { color: col, outline: INK });
        text(g, GLYPH.D, cx - 2, cy + 7, { color: col, outline: INK });
      }
      break;
    case 'brown':
      if (coffee) {
        const sx = Math.round(coffee.x - camX);
        if (sx > W - 6) text(g, 'COFFEE ' + GLYPH.R, W - 4, coffee.y - 3, { color: '#e8c090', align: 'right', outline: INK });
        else if (sx < 6) text(g, GLYPH.L + ' COFFEE', 4, coffee.y - 3, { color: '#e8c090', outline: INK });
        else text(g, GLYPH.D, sx - 2, coffee.y - 19 - (blink(4) ? 1 : 0), { color: '#ffe14a', outline: INK });
      }
      break;
    case 'black':
      if (p.t > p.grace) label('X_X', cy - 20, '#8c8aa0');
      break;
    default:
      break;
  }
  // tick / cross over the car for "keep doing it" lights
  if (p.rule.kind === 'hold' && p.rule.check && p.id !== 'black' && p.t > p.grace && G.mode !== 'insane') {
    const bad = p.rule.check(p, player, Input);
    text(g, bad ? GLYPH.CROSS : GLYPH.CHECK, cx - 2, cy - 20, { color: bad ? '#ff4050' : '#6dff8a', outline: INK });
  }
}

// ---- THE LIGHT (the big traffic light hanging in the corner) ----------------------
function drawTrafficLight(g, x, y, r, t, hideIcon) {
  const w = 24, h = 54;
  rect(g, x + 10, y - 6, 4, 6, '#2c2b36');
  rect(g, x - 1, y - 1, w + 2, h + 2, '#c9a227');       // reflective back plate
  rect(g, x, y, w, h, INK);
  rect(g, x + 1, y + 1, w - 2, h - 2, '#23222e');
  rect(g, x + 1, y + 1, w - 2, 1, '#34333f');
  const cx = x + 12, cys = [y + 10, y + 27, y + 44], rad = 7;
  for (let i = 0; i < 3; i++) {
    const cy = cys[i];
    rect(g, cx - 8, cy - 9, 17, 2, '#0e0d15'); // visor
    const lit = r.slot === 'all' || r.slot === i;
    if (!lit) {
      disc(g, cx, cy, rad, '#2c2a36');
      disc(g, cx - 1, cy - 1, rad - 3, '#34323f');
      continue;
    }
    let c = ruleColor(r, t + i * 0.25);
    if (r.slot === 'all' && r.id !== 'rainbow' && r.id !== 'black' && Math.floor(t * 5) % 3 === i) c = shade(c, 0.35);
    if (r.id === 'black') {
      disc(g, cx, cy, rad, '#050508');
      ring(g, cx, cy, rad, '#5a5870');
    } else {
      ring(g, cx, cy, rad + 1, rgba(c, 0.55));
      if (G.lightFlash > 0) ring(g, cx, cy, rad + 3, rgba(c, 0.5 * G.lightFlash / 0.3));
      disc(g, cx, cy, rad, c);
      disc(g, cx - 2, cy - 2, 2, shade(c, 0.6));
    }
    const iconHere = r.slot === 'all' ? i === 1 : true;
    if (iconHere && !hideIcon) {
      const ic = iconSprite(r.icon, r.id === 'black' ? '#b8b6c8' : shade(c, -0.62));
      g.drawImage(ic, cx - 3, cy - 3);
    }
  }
}

function drawHUD() {
  const p = G.phase, r = shownRule();
  const insane = G.mode === 'insane';
  // red danger pulse around the edges
  if (p && p.heat > 0.25 && G.state === 'play') {
    const a = ((p.heat - 0.25) / 0.75) * (0.35 + 0.35 * Math.sin(G.t * 18));
    const c = 'rgba(255,20,50,' + clamp(a, 0, 0.7).toFixed(3) + ')';
    rect(ctx, 0, HUD_H, W, 3, c); rect(ctx, 0, H - 3, W, 3, c);
    rect(ctx, 0, HUD_H, 3, H - HUD_H, c); rect(ctx, W - 3, HUD_H, 3, H - HUD_H, c);
  }
  rect(ctx, 0, 0, W, HUD_H, '#14131f');
  rect(ctx, 0, HUD_H, W, 1, 'rgba(0,0,0,0.5)');
  // timer bar
  rect(ctx, 32, HUD_H - 2, W - 32, 2, '#2a2838');
  if (p && G.state !== 'intro') {
    const frac = clamp(1 - p.t / p.dur, 0, 1);
    rect(ctx, 32, HUD_H - 2, Math.round((W - 32) * frac), 2, p.t < p.grace ? shade(readable(r, G.t), -0.4) : readable(r, G.t));
  }
  drawTrafficLight(ctx, 5, 0, r, G.t, insane && G.state !== 'intro');
  // what the light says
  if (!insane || G.state === 'intro') {
    const w = text(ctx, ruleText(r, 'cmd', p), 34, 2, { color: readable(r, G.t), scale: 2, outline: INK });
    if (p && p.isNew && G.state === 'play' && blink(3)) text(ctx, 'NEW!', 34 + w + 6, 4, { color: '#ffe14a', outline: INK });
    if (p && p.chaos) text(ctx, 'CHAOS', 34 + w + 6, 4, { color: hsl(G.t * 300, 95, 65), outline: INK });
    text(ctx, ruleText(r, 'hint', p), 34, 17, { color: '#b9b7cc' });
  } else {
    text(ctx, 'OBEY THE LIGHT.', 34, 9, { color: '#5a5870' });
  }
  // score block
  text(ctx, fmt(G.score), W - 4, 2, { color: '#ffffff', align: 'right' });
  text(ctx, 'SCORE', W - 6 - textWidth(fmt(G.score)), 2, { color: '#6f6d85', align: 'right' });
  const lightsStr = G.survived + ' LIGHTS';
  text(ctx, lightsStr, W - 4, 10, { color: '#8e8ca4', align: 'right' });
  if (G.combo > 1) text(ctx, GLYPH.TIMES + G.combo, W - 8 - textWidth(lightsStr), 10, { color: '#ffe14a', align: 'right' });
  if (G.mode === 'practice') text(ctx, 'PRACTICE', W - 4, 17, { color: '#4fb0e8', align: 'right' });

  if (G.state === 'play' || G.state === 'pause') drawGauge(r, p);
  if (p && p.countdown && G.state === 'play') {
    const n = 3 - Math.floor((p.t / p.dur) * 3);
    text(ctx, String(clamp(n, 1, 3)), 210, 74, { color: '#ff2b3d', scale: 5, outline: INK, align: 'center', thick: 2 });
    text(ctx, 'GET READY!', 210, 114, { color: '#ffffff', outline: INK, align: 'center' });
  }
  if (p && p.first && p.t < 0.8 && G.state === 'play') {
    text(ctx, 'GO!', 210, 74, { color: '#27d64a', scale: 5, outline: INK, align: 'center', thick: 2 });
  }
  if (G.banner) {
    const b = G.banner;
    const lines = wrap(b.text, 220, 1);
    const hgt = 14 + lines.length * 9;
    panel(ctx, 50, HUD_H + 4, 220, hgt, 'rgba(12,10,20,0.9)', b.col || '#ff2b3d');
    text(ctx, b.title, W / 2, HUD_H + 7, { color: b.col || '#ff5a6a', align: 'center' });
    lines.forEach((ln, i) => text(ctx, ln, W / 2, HUD_H + 17 + i * 9, { color: '#ffffff', align: 'center' }));
  }
}

// Speedometer with the target zone for "keep doing it" lights.
function drawGauge(r, p) {
  const x = 92, y = 166, w = 136, h = 12;
  panel(ctx, x, y, w, h, 'rgba(12,11,20,0.88)', '#3a3850');
  const kmh = Math.round(Math.abs(player.vx) * 0.72);
  text(ctx, String(kmh), x + 22, y + 3, { color: '#ffffff', align: 'right' });
  text(ctx, 'KM/H', x + 25, y + 3, { color: '#6f6d85' });
  const bx = x + 54, bw = w - 58;
  const toX = (v) => bx + Math.round(((v + MAX_REV) / (MAX_FWD + MAX_REV)) * (bw - 1));
  rect(ctx, bx, y + 4, bw, 4, '#23222f');
  if (p && r.gauge && !p.countdown && G.mode !== 'insane') {
    const z0 = toX(r.gauge[0]), z1 = toX(r.gauge[1]);
    const inside = player.vx >= r.gauge[0] && player.vx <= r.gauge[1];
    rect(ctx, z0, y + 4, Math.max(2, z1 - z0 + 1), 4, inside ? readable(r, G.t) : shade(readable(r, G.t), -0.45));
  }
  rect(ctx, toX(0), y + 2, 1, 8, '#6f6d85');
  const nx = toX(clamp(player.vx, -MAX_REV, MAX_FWD));
  rect(ctx, nx, y + 2, 1, 8, '#ffffff');
  px(ctx, nx - 1, y + 2, '#ffffff'); px(ctx, nx + 1, y + 2, '#ffffff');
}

// ---- on-screen buttons for touch screens ------------------------------------------
function drawTouchControls() {
  for (const b of TOUCH_BTNS) {
    const down = Input.held.has(b.key);
    if (b.round) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      disc(ctx, cx, cy, 16, down ? 'rgba(255,110,199,0.8)' : 'rgba(20,18,30,0.6)');
      ring(ctx, cx, cy, 16, '#ff6ec7');
      text(ctx, 'HONK', cx, cy - 3, { color: down ? INK : '#ffb3e6', align: 'center' });
    } else if (b.key === 'pause') {
      panel(ctx, b.x, b.y, b.w, b.h, 'rgba(20,18,30,0.7)', '#8e8ca4');
      rect(ctx, b.x + 4, b.y + 3, 2, 6, '#ffffff');
      rect(ctx, b.x + 8, b.y + 3, 2, 6, '#ffffff');
    } else {
      panel(ctx, b.x, b.y, b.w, b.h, down ? 'rgba(255,225,74,0.8)' : 'rgba(20,18,30,0.6)', '#c9c7da');
      text(ctx, ARROW_GLYPH[b.key], b.x + 6, b.y + 4, { color: down ? INK : '#ffffff' });
    }
  }
}

// ---- the sniper scope death cam ----------------------------------------------------
function drawDying() {
  const D = G.death;
  drawWorld('stop');
  if (D.t < D.shotAt) { drawScope(D); return; }
  drawHUD();
  const since = D.t - D.shotAt;
  if (since < 0.5) text(ctx, 'BANG!', W / 2, 60, { color: '#fff6c0', scale: 6, outline: '#ff2030', thick: 2, align: 'center' });
  if (since > 0.8) {
    const sc = since < 0.9 ? 6 : since < 1.0 ? 5 : 4;
    text(ctx, 'SNIPED!', W / 2, 70 - sc * 2, { color: '#ff2b3d', scale: sc, outline: INK, thick: 2, align: 'center' });
  }
}

function drawScope(D) {
  const h = headPos();
  const k = clamp(D.t / 0.85, 0, 1);
  const sway = (1 - k) * 12;
  const zoom = 3, src = 42;
  const cx = h.x - Math.round(G.camX) + Math.sin(D.t * 8) * sway;
  const cy = h.y + Math.cos(D.t * 6.3) * sway;
  scopeCtx.imageSmoothingEnabled = false;
  scopeCtx.globalCompositeOperation = 'source-over';
  scopeCtx.fillStyle = '#000000';
  scopeCtx.fillRect(0, 0, 126, 126);
  scopeCtx.drawImage(screenCanvas, Math.round(cx - src / 2), Math.round(cy - src / 2), src, src, 0, 0, src * zoom, src * zoom);
  scopeCtx.fillStyle = 'rgba(40,255,120,0.08)';
  scopeCtx.fillRect(0, 0, 126, 126);
  scopeCtx.globalCompositeOperation = 'destination-in';
  scopeCtx.drawImage(scopeMask, 0, 0);
  scopeCtx.globalCompositeOperation = 'source-over';

  rect(ctx, 0, 0, W, H, '#050507');
  const ox = W / 2 - 63, oy = H / 2 - 63;
  ctx.drawImage(scopeCanvas, ox, oy);
  const X = W / 2, Y = H / 2, R = SCOPE_R;
  // crosshair: thick outer posts, thin centre lines
  rect(ctx, X - R, Y - 1, 26, 3, '#000000'); rect(ctx, X + R - 25, Y - 1, 26, 3, '#000000');
  rect(ctx, X - 1, Y - R, 3, 26, '#000000'); rect(ctx, X - 1, Y + R - 25, 3, 26, '#000000');
  rect(ctx, X - R + 26, Y, R - 30, 1, '#000000'); rect(ctx, X + 5, Y, R - 30, 1, '#000000');
  rect(ctx, X, Y - R + 26, 1, R - 30, '#000000'); rect(ctx, X, Y + 5, 1, R - 30, '#000000');
  for (let i = 1; i <= 3; i++) {
    rect(ctx, X + 5 + i * 7, Y - 1, 1, 3, '#000000'); rect(ctx, X - 5 - i * 7, Y - 1, 1, 3, '#000000');
    rect(ctx, X - 1, Y + 5 + i * 7, 3, 1, '#000000'); rect(ctx, X - 1, Y - 5 - i * 7, 3, 1, '#000000');
  }
  px(ctx, X, Y, '#ff2030');
  ring(ctx, X, Y, R, '#000000');
  ring(ctx, X, Y, R + 1, '#15141c');
  ring(ctx, X, Y, R + 2, '#2a2833');
  if (blink(3)) { disc(ctx, 9, 9, 2, '#ff2030'); }
  text(ctx, 'SNIPER CAM', 15, 6, { color: '#ff3b4f' });
  text(ctx, 'TARGET: THE DRIVER', W - 6, 6, { color: '#ff3b4f', align: 'right' });
  const lines = wrap(D.reason, 300, 1);
  lines.forEach((ln, i) => text(ctx, ln, W / 2, H - 12 - (lines.length - 1 - i) * 9, { color: '#ffffff', align: 'center' }));
  if (k >= 1 && blink(12)) text(ctx, 'LOCKED', X + 8, Y + 8, { color: '#ff3b4f' });
}

// ---- menus and cards ------------------------------------------------------------------
function titleMenuLayout() {
  return MENU.map((m, i) => ({ x: W / 2 - 60, y: 78 + i * 12, w: 120, h: 10 }));
}
function menuItemAt(x, y) {
  const L = titleMenuLayout();
  for (let i = 0; i < L.length; i++) {
    const b = L[i];
    if (x >= b.x && x < b.x + b.w && y >= b.y - 1 && y < b.y + b.h + 1) return i;
  }
  return -1;
}

function drawTitle() {
  const camX = Math.round(G.camX);
  const r = RULES[RULE_ORDER[G.titleLight]];
  drawCity(ctx, camX);
  drawTraffic(ctx, camX, G.t);
  drawPeds(ctx, camX, G.t, r.beh);
  drawSnipers(ctx, camX, G.t, null, false);
  drawSignals(ctx, camX, signalColour(r), G.t);
  drawFloaters(ctx, camX);
  ctx.fillStyle = 'rgba(8,6,18,0.66)';
  ctx.fillRect(0, 0, W, H);

  // a sniper's scope drifting around, watching
  const sx = W / 2 + Math.sin(G.t * 0.7) * 120, sy = 110 + Math.sin(G.t * 1.1) * 50;
  ring(ctx, sx, sy, 9, 'rgba(255,40,60,0.45)');
  rect(ctx, sx - 13, sy, 8, 1, 'rgba(255,40,60,0.45)'); rect(ctx, sx + 6, sy, 8, 1, 'rgba(255,40,60,0.45)');
  rect(ctx, sx, sy - 13, 1, 8, 'rgba(255,40,60,0.45)'); rect(ctx, sx, sy + 6, 1, 8, 'rgba(255,40,60,0.45)');

  // the title, each letter lit by a different colour of the light
  const title = 'OBEY THE LIGHT';
  const sc = 3;
  let x = W / 2 - Math.floor(textWidth(title, sc) / 2);
  let li = 0;
  for (const ch of title) {
    if (ch === ' ') { x += (SPACE_W + 1) * sc; continue; }
    const rr = RULES[RULE_ORDER[(li + Math.floor(G.t * 3)) % RULE_ORDER.length]];
    const c = rr.id === 'black' ? '#8c8aa0' : ruleColor(rr, G.t + li * 0.1);
    const bob = Math.round(Math.sin(G.t * 4 + li * 0.6) * 1.2);
    text(ctx, ch, x, 18 + bob, { color: c, scale: sc, outline: INK, shadow: '#000000' });
    x += (FONT[ch].w + 1) * sc;
    li++;
  }
  text(ctx, '...OR GET SNIPED IN THE HEAD.', W / 2, 44, { color: '#ff3b4f', align: 'center', outline: INK });
  const best = Math.max(G.best.normal || 0, G.best.insane || 0);
  if (best > 0) text(ctx, 'BEST ' + fmt(G.best.normal || 0) + '   INSANE BEST ' + fmt(G.best.insane || 0), W / 2, 56, { color: '#8e8ca4', align: 'center' });

  drawTrafficLight(ctx, 12, 24, r, G.t, false);
  drawTrafficLight(ctx, W - 36, 24, RULES[RULE_ORDER[(G.titleLight + 6) % RULE_ORDER.length]], G.t, false);
  text(ctx, r.name, 24, 84, { color: readable(r, G.t), align: 'center', outline: INK });
  text(ctx, ruleText(r, 'cmd', { need: 3, turns: 1 }), 24, 93, { color: '#ffffff', align: 'center', outline: INK });

  const L = titleMenuLayout();
  MENU.forEach((m, i) => {
    const sel = i === G.menuIdx;
    const lbl = m.label();
    if (sel) {
      rect(ctx, L[i].x, L[i].y - 1, L[i].w, L[i].h, 'rgba(255,225,74,0.14)');
      text(ctx, GLYPH.PLAY, W / 2 - textWidth(lbl) / 2 - 10, L[i].y + 1, { color: '#ffe14a' });
    }
    text(ctx, lbl, W / 2, L[i].y + 1, { color: sel ? '#ffe14a' : '#c9c7da', align: 'center', outline: INK });
  });
  text(ctx, MENU[G.menuIdx].sub, W / 2, 152, { color: '#8e8ca4', align: 'center', outline: INK });
  let help = Input.touchMode ? 'TAP A BUTTON TO START' : 'ARROWS/WASD: DRIVE   SPACE: HONK   ENTER: GO';
  if (!Input.touchMode && !document.hasFocus()) help = blink(1.5) ? 'CLICK THE GAME, THEN PRESS ENTER' : '';
  text(ctx, help, W / 2, 168, { color: '#5f5d78', align: 'center' });
  if (Input.touchMode && window.innerHeight > window.innerWidth && blink(1)) {
    panel(ctx, 40, 132, 240, 13, '#15141f', '#ffe14a');
    text(ctx, 'TURN YOUR PHONE SIDEWAYS!', W / 2, 135, { color: '#ffe14a', align: 'center' });
  }
}

function drawRuleRow(r, x, y, unlocked) {
  const c = readable(r, G.t);
  if (!unlocked) {
    disc(ctx, x + 4, y + 3, 4, '#2c2a36');
    text(ctx, '???', x + 14, y, { color: '#4a4860' });
    text(ctx, 'SURVIVE LONGER TO FIND OUT', x + 134, y, { color: '#4a4860' });
    return;
  }
  if (r.id === 'black') { disc(ctx, x + 4, y + 3, 4, '#050508'); ring(ctx, x + 4, y + 3, 4, '#6c6a80'); }
  else { disc(ctx, x + 4, y + 3, 4, ruleColor(r, G.t)); px(ctx, x + 3, y + 1, shade(ruleColor(r, G.t), 0.6)); }
  text(ctx, r.name, x + 14, y, { color: c });
  text(ctx, ruleText(r, 'cmd', { need: 'N', turns: 1 }), x + 60, y, { color: '#ffffff' });
  text(ctx, r.short, x + 134, y, { color: '#a9a7bc' });
}

function drawRulebook() {
  rect(ctx, 0, 0, W, H, '#100f1a');
  for (let y = 0; y < H; y += 4) rect(ctx, 0, y, W, 1, '#13121e');
  text(ctx, 'THE RULEBOOK', W / 2, 4, { color: '#ffe14a', scale: 2, align: 'center', outline: INK });
  text(ctx, 'DO WHAT THE LIGHT SAYS, OR GET SNIPED.', W / 2, 20, { color: '#ff5a6a', align: 'center' });
  RULE_ORDER.forEach((id, i) => drawRuleRow(RULES[id], 8, 31 + i * 11, true));
  text(ctx, Input.touchMode ? 'TAP TO GO BACK' : 'PRESS ENTER TO GO BACK', W / 2, 169, { color: blink(2) ? '#ffffff' : '#8e8ca4', align: 'center' });
}

function drawPause() {
  ctx.fillStyle = 'rgba(8,6,18,0.82)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, 'PAUSED', W / 2, 6, { color: '#ffe14a', scale: 2, align: 'center', outline: INK });
  text(ctx, 'THE RULES SO FAR:', W / 2, 23, { color: '#8e8ca4', align: 'center' });
  const known = RULE_ORDER.filter((id) => G.unlocked.includes(id));
  known.forEach((id, i) => drawRuleRow(RULES[id], 8, 34 + i * 11, true));
  const hidden = RULE_ORDER.length - known.length;
  if (hidden > 0) {
    text(ctx, '+ ' + hidden + ' MORE COLOR' + (hidden > 1 ? 'S' : '') + ' STILL TO SHOW UP...', W / 2, 38 + known.length * 11, { color: '#5f5d78', align: 'center' });
  }
  const help = Input.touchMode ? 'TAP TO RESUME' : 'P: RESUME    Q: QUIT TO MENU';
  text(ctx, help, Input.touchMode ? W / 4 : W / 2, 169, { color: '#ffffff', align: 'center' });
  if (Input.touchMode) text(ctx, 'QUIT TO MENU', (W * 3) / 4, 169, { color: '#ff5a6a', align: 'center' });
}

function drawIntroCard() {
  ctx.fillStyle = 'rgba(6,5,14,0.72)';
  ctx.fillRect(0, 0, W, H);
  const id = G.introId;
  const go = G.stateT > 0.6 && blink(2.5);
  const prompt = Input.touchMode ? 'TAP TO DRIVE' : 'PRESS ENTER TO DRIVE';
  if (id === 'basics') {
    panel(ctx, 22, 24, 276, 142, '#15141f', '#ffe14a', 'rgba(0,0,0,0.5)');
    text(ctx, 'HOW NOT TO GET SNIPED', W / 2, 30, { color: '#ffe14a', scale: 2, align: 'center', outline: INK });
    text(ctx, 'THE LIGHT UP IN THE CORNER CHANGES COLOR.', W / 2, 48, { color: '#ffffff', align: 'center' });
    text(ctx, 'DO WHAT IT SAYS. EVERY. SINGLE. TIME.', W / 2, 57, { color: '#ffffff', align: 'center' });
    disc(ctx, 60, 76, 6, RULES.green.color);
    ctx.drawImage(iconSprite('go', shade(RULES.green.color, -0.62)), 57, 73);
    text(ctx, 'GREEN = GO!', 72, 70, { color: RULES.green.color, scale: 1 });
    text(ctx, 'HOLD ' + GLYPH.R + ' AND KEEP DRIVING', 72, 79, { color: '#c9c7da' });
    disc(ctx, 60, 96, 6, RULES.red.color);
    ctx.drawImage(iconSprite('stop', shade(RULES.red.color, -0.62)), 57, 93);
    text(ctx, 'RED = STOP!', 72, 90, { color: RULES.red.color });
    text(ctx, 'TAP ' + GLYPH.L + ' TO BRAKE. DON\'T MOVE AT ALL.', 72, 99, { color: '#c9c7da' });
    text(ctx, 'MORE COLORS SHOW UP THE LONGER YOU SURVIVE...', W / 2, 113, { color: '#b04bff', align: 'center' });
    text(ctx, 'BREAK A RULE AND THE SNIPER TAKES THE SHOT.', W / 2, 123, { color: '#ff5a6a', align: 'center' });
    const ctl = Input.touchMode ? 'D-PAD DRIVES. THE PINK BUTTON HONKS.' : 'ARROWS/WASD DRIVE. SPACE HONKS. P PAUSES.';
    text(ctx, ctl, W / 2, 137, { color: '#8e8ca4', align: 'center' });
    if (go) text(ctx, prompt, W / 2, 152, { color: '#ffe14a', align: 'center' });
    return;
  }
  const r = RULES[id];
  const col = ruleColor(r, G.t), rc = readable(r, G.t);
  panel(ctx, 26, 26, 268, 138, '#15141f', r.id === 'black' ? '#6c6a80' : col, 'rgba(0,0,0,0.5)');
  text(ctx, 'NEW LIGHT!', W / 2, 32, { color: blink(4) ? '#ffe14a' : '#ffffff', scale: 2, align: 'center', outline: INK });
  const lx = 72, ly = 82;
  if (r.id === 'black') { disc(ctx, lx, ly, 19, '#050508'); ring(ctx, lx, ly, 19, '#6c6a80'); }
  else {
    ring(ctx, lx, ly, 21, rgba(col, 0.35));
    ring(ctx, lx, ly, 20, rgba(col, 0.6));
    disc(ctx, lx, ly, 19, col);
    disc(ctx, lx - 6, ly - 6, 4, shade(col, 0.6));
  }
  const ic = iconSprite(r.icon, r.id === 'black' ? '#b8b6c8' : shade(col, -0.62));
  ctx.drawImage(ic, lx - 10, ly - 10, 21, 21);
  text(ctx, r.name + ' MEANS', 104, 58, { color: rc, scale: 1 });
  text(ctx, ruleText(r, 'cmd', { need: 3, turns: 1 }), 104, 70, { color: '#ffffff', scale: 2, outline: INK });
  drawIntroDemo(r, 150, 100);
  r.learn.slice(1).forEach((ln, i) => text(ctx, ln, W / 2, 122 + i * 10, { color: '#d8d6e6', align: 'center' }));
  if (go) text(ctx, prompt, W / 2, 152, { color: '#ffe14a', align: 'center' });
}

// A tiny looping demo of the move, drawn right on the card.
function drawIntroDemo(r, x, y) {
  const t = G.stateT;
  let dx = 0, dy = 0, ang = 0, variant = 'normal';
  switch (r.id) {
    case 'purple': dy = -Math.abs(Math.sin(t * 8)) * 3; ang = Math.sin(t * 4) * 0.3; variant = Math.sin(t * 8) > 0 ? 'arms' : 'normal'; break;
    case 'blue': dy = Math.sin(t * 3) * 6; break;
    case 'yellow': dx = ((t * 12) % 40) - 20; break;
    case 'orange': dx = 20 - ((t * 25) % 40); break;
    case 'cyan': ang = Math.floor(t * 4) * (Math.PI / 2); break;
    case 'black': variant = 'slump'; break;
    case 'white': dx = irnd(-1, 1); dy = irnd(-1, 1); variant = 'arms'; break;
    case 'rainbow': ang = t * 5; dy = -Math.abs(Math.sin(t * 8)) * 3; break;
    default: break;
  }
  rect(ctx, x - 40, y - 12, 120, 24, '#2b2a36');
  for (let k = 0; k < 120; k += 16) rect(ctx, x - 40 + k, y - 12, 8, 1, '#d6d4e4');
  for (let k = 0; k < 120; k += 16) rect(ctx, x - 40 + k, y + 11, 8, 1, '#d6d4e4');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 40, y - 12, 120, 24);
  ctx.clip();
  drawSprite(ctx, SPR.player[variant], x + 20 + dx, y + dy, ang);
  if (r.id === 'pink' && (t % 1) < 0.4) text(ctx, 'HONK', x + 40, y - 9, { color: '#ffb3e6', outline: INK });
  if (r.id === 'brown') {
    const cx2 = x + 60 - ((t * 20) % 40);
    rect(ctx, cx2, y - 3, 6, 7, '#efe8da');
    rect(ctx, cx2, y, 6, 2, '#8a4b21');
  }
  ctx.restore();
}

function drawOver() {
  const D = G.death;
  ctx.fillStyle = 'rgba(8,4,10,0.6)';
  ctx.fillRect(0, 0, W, H);
  panel(ctx, 34, 20, 252, 146, '#15141f', '#ff2b3d', 'rgba(0,0,0,0.5)');
  text(ctx, 'SNIPED!', W / 2, 26, { color: '#ff2b3d', scale: 3, align: 'center', outline: INK });
  const r = D.rule;
  text(ctx, 'THE LIGHT WAS ' + r.name + '.', W / 2, 52, { color: readable(r, G.t), align: 'center' });
  const lines = wrap(D.reason, 236, 1);
  lines.forEach((ln, i) => text(ctx, ln, W / 2, 62 + i * 9, { color: '#ffffff', align: 'center' }));
  const qy = 64 + lines.length * 9;
  text(ctx, D.quote + ' - THE SNIPER', W / 2, qy, { color: '#7a7890', align: 'center' });
  const sy = qy + 16;
  text(ctx, 'LIGHTS SURVIVED', 58, sy, { color: '#8e8ca4' });
  text(ctx, String(G.survived), W - 58, sy, { color: '#ffffff', align: 'right' });
  text(ctx, 'SCORE', 58, sy + 10, { color: '#8e8ca4' });
  text(ctx, fmt(G.score), W - 58, sy + 10, { color: '#ffffff', align: 'right' });
  text(ctx, 'BEST', 58, sy + 20, { color: '#8e8ca4' });
  text(ctx, fmt(G.best[G.mode] || 0), W - 58, sy + 20, { color: '#ffe14a', align: 'right' });
  if (G.newBest && blink(3)) text(ctx, GLYPH.STAR + ' NEW BEST! ' + GLYPH.STAR, W / 2, sy + 20, { color: '#ffe14a', align: 'center' });
  if (G.stateT > 0.8) {
    if (Input.touchMode) {
      text(ctx, 'TAP: DRIVE AGAIN', W / 4 + 10, 169, { color: '#ffffff', align: 'center' });
      text(ctx, 'MENU', (W * 3) / 4, 169, { color: '#ff5a6a', align: 'center' });
    } else {
      text(ctx, 'ENTER: DRIVE AGAIN     ESC: MENU', W / 2, 154, { color: blink(2) ? '#ffffff' : '#c9c7da', align: 'center' });
    }
  }
}

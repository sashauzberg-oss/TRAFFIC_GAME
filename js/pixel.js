'use strict';
// ---------------------------------------------------------------------------
// pixel.js - the low-res screen, pixel drawing primitives, sprites, the font.
// Everything is drawn onto a 320x180 canvas at integer coordinates and then
// scaled up by CSS with nearest-neighbour sampling, so every single thing on
// screen (text included) is made of big chunky pixels.
// ---------------------------------------------------------------------------

const W = 320;
const H = 180;

const screenCanvas = document.getElementById('screen');
const ctx = screenCanvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

// ---- small math helpers ---------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const TAU = Math.PI * 2;

// Deterministic RNG so the city looks the same every time you drive past it.
function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashInt(a, b) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x165667b1, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 13)) | 0;
}

// ---- colour helpers ---------------------------------------------------------
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  const h = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
}
function shade(hex, t) { return t < 0 ? mix(hex, '#000000', -t) : mix(hex, '#ffffff', t); }
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

// ---- offscreen canvases ---------------------------------------------------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  c.getContext('2d').imageSmoothingEnabled = false;
  return c;
}

// ---- primitives (always integer aligned, never anti-aliased) --------------
function rect(g, x, y, w, h, col) {
  g.fillStyle = col;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function px(g, x, y, col) {
  g.fillStyle = col;
  g.fillRect(Math.round(x), Math.round(y), 1, 1);
}
function frame(g, x, y, w, h, col) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  g.fillStyle = col;
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillRect(x + w - 1, y, 1, h);
}
// filled circle made of horizontal runs
function disc(g, cx, cy, r, col) {
  cx = Math.round(cx); cy = Math.round(cy);
  g.fillStyle = col;
  const rr = (r + 0.5) * (r + 0.5);
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(Math.max(0, rr - dy * dy)));
    g.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}
// circle outline
function ring(g, cx, cy, r, col) {
  cx = Math.round(cx); cy = Math.round(cy);
  g.fillStyle = col;
  const rr = (r + 0.5) * (r + 0.5);
  const rin = (r - 0.5) * (r - 0.5);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy;
      if (d <= rr && d > rin) g.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }
}
// Bresenham line. dash = [on, off] optional, phase shifts the dash pattern.
function line(g, x0, y0, x1, y1, col, dash, phase) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  g.fillStyle = col;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, i = phase | 0;
  const period = dash ? dash[0] + dash[1] : 0;
  for (let guard = 0; guard < 2000; guard++) {
    if (!dash || (i % period) < dash[0]) g.fillRect(x0, y0, 1, 1);
    i++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
// A chunky UI box with notched corners and a drop shadow.
function panel(g, x, y, w, h, fill, border, shadowCol) {
  x = Math.round(x); y = Math.round(y);
  if (shadowCol) {
    rect(g, x + 2, y + h, w - 2, 2, shadowCol);
    rect(g, x + w, y + 2, 2, h, shadowCol);
  }
  rect(g, x + 1, y + 1, w - 2, h - 2, fill);
  g.fillStyle = border;
  g.fillRect(x + 1, y, w - 2, 1);
  g.fillRect(x + 1, y + h - 1, w - 2, 1);
  g.fillRect(x, y + 1, 1, h - 2);
  g.fillRect(x + w - 1, y + 1, 1, h - 2);
}

// ---- sprites ----------------------------------------------------------------
// Build a sprite from ASCII art. '.' (or any char missing from pal) is clear.
function spriteFromArt(rows, pal) {
  const h = rows.length;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const col = pal[rows[y][x]];
      if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
    }
  }
  return c;
}
function flipSprite(src, horiz, vert) {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.translate(horiz ? src.width : 0, vert ? src.height : 0);
  g.scale(horiz ? -1 : 1, vert ? -1 : 1);
  g.drawImage(src, 0, 0);
  return c;
}
// Nearest-neighbour rotation, cached in 64 steps. Browsers anti-alias the
// edges of rotated drawImage calls, so we rotate pixel by pixel instead.
const ROT_STEPS = 64;
const rotCache = new WeakMap();
function rotatedSprite(src, ang) {
  let s = Math.round((ang / TAU) * ROT_STEPS) % ROT_STEPS;
  if (s < 0) s += ROT_STEPS;
  if (s === 0) return src;
  let cache = rotCache.get(src);
  if (!cache) { cache = { data: null, map: new Map() }; rotCache.set(src, cache); }
  let out = cache.map.get(s);
  if (out) return out;
  const sw = src.width, sh = src.height;
  if (!cache.data) cache.data = src.getContext('2d').getImageData(0, 0, sw, sh).data;
  const sd = cache.data;
  const diag = Math.ceil(Math.sqrt(sw * sw + sh * sh)) + 2;
  const ow = diag + ((diag - sw) & 1);
  const oh = diag + ((diag - sh) & 1);
  out = makeCanvas(ow, oh);
  const og = out.getContext('2d');
  const img = og.createImageData(ow, oh);
  const od = img.data;
  const a = (s / ROT_STEPS) * TAU;
  const cos = Math.cos(a), sin = Math.sin(a);
  const scx = sw / 2, scy = sh / 2, dcx = ow / 2, dcy = oh / 2;
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const dx = x + 0.5 - dcx, dy = y + 0.5 - dcy;
      const sx = Math.floor(dx * cos + dy * sin + scx);
      const sy = Math.floor(-dx * sin + dy * cos + scy);
      if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
      const si = (sy * sw + sx) * 4, di = (y * ow + x) * 4;
      od[di] = sd[si]; od[di + 1] = sd[si + 1]; od[di + 2] = sd[si + 2]; od[di + 3] = sd[si + 3];
    }
  }
  og.putImageData(img, 0, 0);
  cache.map.set(s, out);
  return out;
}
// Draw a sprite centred on (x, y), optionally rotated.
function drawSprite(g, spr, x, y, ang) {
  const s = ang ? rotatedSprite(spr, ang) : spr;
  g.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height / 2));
}
// ---- the pixel font -------------------------------------------------------
// 5x7 glyphs. Letters are trimmed to their used width (a proportional font);
// digits keep a fixed width so scores don't wobble.
const GLYPH = {
  L: '←', U: '↑', R: '→', D: '↓', HEART: '♥', SKULL: '☠',
  NOTE: '♪', STAR: '★', CHECK: '✓', PLAY: '▶', BACK: '◀',
  DOT: '•', CROSS: '✗', TIMES: '×', SPIN: '↻', CUP: '☕', BOLT: '⚡',
};
const FONT_SRC = {
  'A': '.###. #...# #...# ##### #...# #...# #...#',
  'B': '####. #...# #...# ####. #...# #...# ####.',
  'C': '.###. #...# #.... #.... #.... #...# .###.',
  'D': '####. #...# #...# #...# #...# #...# ####.',
  'E': '##### #.... #.... ####. #.... #.... #####',
  'F': '##### #.... #.... ####. #.... #.... #....',
  'G': '.###. #...# #.... #.### #...# #...# .####',
  'H': '#...# #...# #...# ##### #...# #...# #...#',
  'I': '###.. .#... .#... .#... .#... .#... ###..',
  'J': '..### ...#. ...#. ...#. ...#. #..#. .##..',
  'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  'L': '#.... #.... #.... #.... #.... #.... #####',
  'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  'N': '#...# #...# ##..# #.#.# #..## #...# #...#',
  'O': '.###. #...# #...# #...# #...# #...# .###.',
  'P': '####. #...# #...# ####. #.... #.... #....',
  'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#',
  'R': '####. #...# #...# ####. #.#.. #..#. #...#',
  'S': '.#### #.... #.... .###. ....# ....# ####.',
  'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  'U': '#...# #...# #...# #...# #...# #...# .###.',
  'V': '#...# #...# #...# #...# #...# .#.#. ..#..',
  'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
  'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  'Z': '##### ....# ...#. ..#.. .#... #.... #####',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '##### ...#. ..#.. ...#. ....# #...# .###.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '..##. .#... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ...#. .##..',
  '!': '#.... #.... #.... #.... #.... ..... #....',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  '.': '..... ..... ..... ..... ..... ..... #....',
  ',': '..... ..... ..... ..... ..... .#... #....',
  ':': '..... ..... #.... ..... ..... #.... .....',
  ';': '..... ..... .#... ..... ..... .#... #....',
  "'": '#.... #.... ..... ..... ..... ..... .....',
  '"': '#.#.. #.#.. ..... ..... ..... ..... .....',
  '-': '..... ..... ..... ###.. ..... ..... .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  '=': '..... ..... ####. ..... ####. ..... .....',
  '/': '....# ....# ...#. ..#.. .#... #.... #....',
  '(': '..#.. .#... #.... #.... #.... .#... ..#..',
  ')': '#.... .#... ..#.. ..#.. ..#.. .#... #....',
  '[': '##... #.... #.... #.... #.... #.... ##...',
  ']': '##... .#... .#... .#... .#... .#... ##...',
  '%': '##..# ##..# ...#. ..#.. .#... #..## #..##',
  '*': '..... #.#.# .###. ##### .###. #.#.# .....',
  '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
  '<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
  '>': '#.... .#... ..#.. ...#. ..#.. .#... #....',
  '_': '..... ..... ..... ..... ..... ..... #####',
  '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#',
  '$': '..#.. .#### #.#.. .###. ..#.# ####. ..#..',
  '@': '.###. #...# #.### #.#.# #.### #.... .###.',
  '~': '..... ..... .#... #.#.# ...#. ..... .....',
  '^': '..#.. .#.#. #...# ..... ..... ..... .....',
  [GLYPH.R]: '..... ..#.. ...#. ##### ...#. ..#.. .....',
  [GLYPH.L]: '..... ..#.. .#... ##### .#... ..#.. .....',
  [GLYPH.U]: '..#.. .###. #.#.# ..#.. ..#.. ..#.. .....',
  [GLYPH.D]: '..#.. ..#.. ..#.. #.#.# .###. ..#.. .....',
  [GLYPH.HEART]: '..... .#.#. ##### ##### .###. ..#.. .....',
  [GLYPH.SKULL]: '.###. ##### #.#.# ##### .###. .#.#. .....',
  [GLYPH.NOTE]: '..##. ..#.# ..#.. ..#.. ###.. ###.. .....',
  [GLYPH.STAR]: '..#.. ..#.. ##### .###. .#.#. #...# .....',
  [GLYPH.CHECK]: '..... ....# ...#. #.#.. .#... ..... .....',
  [GLYPH.PLAY]: '#.... ##... ###.. ####. ###.. ##... #....',
  [GLYPH.BACK]: '...#. ..##. .###. ####. .###. ..##. ...#.',
  [GLYPH.DOT]: '..... ..... .##.. .##.. ..... ..... .....',
  [GLYPH.CROSS]: '..... #...# .#.#. ..#.. .#.#. #...# .....',
  [GLYPH.TIMES]: '..... ..... #...# .#.#. ..#.. .#.#. #...#',
  [GLYPH.SPIN]: '.###. #...# #.### #..#. #.... #...# .###.',
  [GLYPH.CUP]: '.#.#. #.#.. ..... ####. ##### ###.# .###.',
  [GLYPH.BOLT]: '...#. ..#.. .#... ####. ..#.. .#... #....',
};
const FIXED_WIDTH = new Set('0123456789' + GLYPH.R + GLYPH.L + GLYPH.U + GLYPH.D + GLYPH.SKULL +
  GLYPH.HEART + GLYPH.STAR + GLYPH.NOTE + GLYPH.CROSS + GLYPH.SPIN + GLYPH.CUP + GLYPH.PLAY + GLYPH.BACK);
const FONT = {};
(function buildFont() {
  for (const ch in FONT_SRC) {
    const rows = FONT_SRC[ch].split(' ');
    let minX = 5, maxX = -1;
    for (const r of rows) for (let x = 0; x < 5; x++) if (r[x] === '#') { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    if (FIXED_WIDTH.has(ch)) { minX = 0; maxX = 4; }
    if (maxX < 0) { minX = 0; maxX = 2; }
    FONT[ch] = { rows, x0: minX, w: maxX - minX + 1 };
  }
})();
const SPACE_W = 3;
const glyphCache = new Map();
function glyphCanvas(ch, col) {
  const key = ch + col;
  let c = glyphCache.get(key);
  if (c) return c;
  const gl = FONT[ch];
  c = makeCanvas(gl.w, 7);
  const g = c.getContext('2d');
  g.fillStyle = col;
  for (let y = 0; y < 7; y++) for (let x = 0; x < gl.w; x++) if (gl.rows[y][gl.x0 + x] === '#') g.fillRect(x, y, 1, 1);
  glyphCache.set(key, c);
  return c;
}
function glyphFor(ch) {
  if (FONT[ch]) return ch;
  const up = ch.toUpperCase();
  if (FONT[up]) return up;
  return null;
}
function textWidth(str, scale) {
  scale = scale || 1;
  let w = 0;
  for (const ch of String(str)) {
    const k = glyphFor(ch);
    w += (k ? FONT[k].w : SPACE_W) + 1;
  }
  return Math.max(0, w - 1) * scale;
}
function drawTextRaw(g, str, x, y, col, scale) {
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of String(str)) {
    const k = glyphFor(ch);
    if (!k) { cx += (SPACE_W + 1) * scale; continue; }
    const gc = glyphCanvas(k, col);
    g.drawImage(gc, cx, cy, gc.width * scale, 7 * scale);
    cx += (FONT[k].w + 1) * scale;
  }
}
// opts: { color, scale, align: 'left'|'center'|'right', shadow, outline }
function text(g, str, x, y, opts) {
  opts = opts || {};
  const scale = opts.scale || 1;
  const col = opts.color || '#ffffff';
  const w = textWidth(str, scale);
  if (opts.align === 'center') x -= Math.floor(w / 2);
  else if (opts.align === 'right') x -= w;
  x = Math.round(x); y = Math.round(y);
  if (opts.outline) {
    const o = opts.thick ? (opts.thick === true ? scale : opts.thick) : 1;
    for (let oy = -o; oy <= o; oy += o) for (let ox = -o; ox <= o; ox += o) {
      if (ox || oy) drawTextRaw(g, str, x + ox, y + oy, opts.outline, scale);
    }
  }
  if (opts.shadow) drawTextRaw(g, str, x + scale, y + scale, opts.shadow, scale);
  drawTextRaw(g, str, x, y, col, scale);
  return w;
}
// Split text into lines that fit maxW pixels (at the given scale).
function wrap(str, maxW, scale) {
  const words = String(str).split(' ');
  const lines = [];
  let cur = '';
  for (const wd of words) {
    const test = cur ? cur + ' ' + wd : wd;
    if (textWidth(test, scale) > maxW && cur) { lines.push(cur); cur = wd; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---- fitting the screen to the window --------------------------------------
function fitScreen() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const margin = vw < 500 ? 16 : 24;
  const aw = Math.max(64, vw - margin * 2);
  const ah = Math.max(36, vh - margin * 2);
  const fit = Math.min(aw / W, ah / H);
  // whole-number scales keep every pixel the same size; tiny screens get a
  // fractional scale (still blocky thanks to image-rendering: pixelated)
  const s = fit >= 2 ? Math.floor(fit) : fit;
  screenCanvas.style.width = Math.floor(W * s) + 'px';
  screenCanvas.style.height = Math.floor(H * s) + 'px';
  const b = Math.max(1, Math.round(s));
  screenCanvas.style.boxShadow = '0 0 0 ' + b + 'px #07060c, 0 0 0 ' + (b * 2) + 'px #2d2b44, 0 0 0 ' + (b * 3) + 'px #07060c';
  const bs = Math.max(2, Math.round(s));
  document.body.style.backgroundSize = (8 * bs) + 'px ' + (8 * bs) + 'px';
}

// Pixel art page background, cursor and favicon: everything is pixelated.
function decoratePage() {
  const bg = makeCanvas(8, 8);
  const bgc = bg.getContext('2d');
  rect(bgc, 0, 0, 8, 8, '#0d0c16');
  rect(bgc, 0, 0, 4, 4, '#121122');
  rect(bgc, 4, 4, 4, 4, '#121122');
  px(bgc, 1, 1, '#1a1830');
  px(bgc, 5, 5, '#1a1830');
  document.body.style.backgroundImage = 'url(' + bg.toDataURL() + ')';

  const cur = spriteFromArt([
    'k.........',
    'kk........',
    'kwk.......',
    'kwwk......',
    'kwwwk.....',
    'kwwwwk....',
    'kwwwwwk...',
    'kwwwwwwk..',
    'kwwwwkkkk.',
    'kwkwwk....',
    'kk.kwwk...',
    'k..kwwk...',
    '....kwwk..',
    '....kkk...',
  ], { k: '#0b0b12', w: '#ffe14a' });
  const cs = 3;
  const big = makeCanvas(cur.width * cs, cur.height * cs);
  big.getContext('2d').drawImage(cur, 0, 0, big.width, big.height);
  const cursor = 'url(' + big.toDataURL() + ') 0 0, auto';
  document.body.style.cursor = cursor;
  screenCanvas.style.cursor = cursor;

  const ico = spriteFromArt([
    '....kkkkkkkk....',
    '....kddddddk....',
    '....kdrrrrdk....',
    '....kdrrrrdk....',
    '....kddddddk....',
    '....kdyyyydk....',
    '....kdyyyydk....',
    '....kddddddk....',
    '....kdggggdk....',
    '....kdggggdk....',
    '....kddddddk....',
    '....kdppppdk....',
    '....kdppppdk....',
    '....kddddddk....',
    '....kkkkkkkk....',
    '......kkkk......',
  ], { k: '#0b0b12', d: '#2b2a3a', r: '#ff2b3d', y: '#ffd21f', g: '#27d64a', p: '#b04bff' });
  const icoBig = makeCanvas(64, 64);
  icoBig.getContext('2d').drawImage(ico, 0, 0, 64, 64);
  let link = document.querySelector('link[rel="icon"]');
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  link.href = icoBig.toDataURL();
}

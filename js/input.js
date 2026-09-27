'use strict';
// ---------------------------------------------------------------------------
// input.js - keyboard, touch (on-screen pixel buttons) and gamepads, all
// turned into the same small set of actions.
// ---------------------------------------------------------------------------

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'honk', KeyH: 'honk', Enter: 'enter', NumpadEnter: 'enter',
  KeyP: 'pause', Escape: 'esc', KeyM: 'mute', KeyQ: 'quit',
};

// On-screen buttons (game pixel coordinates), shown once a touch is seen.
const TOUCH_BTNS = [
  { key: 'up', x: 22, y: 126, w: 16, h: 16 },
  { key: 'down', x: 22, y: 158, w: 16, h: 16 },
  { key: 'left', x: 6, y: 142, w: 16, h: 16 },
  { key: 'right', x: 38, y: 142, w: 16, h: 16 },
  { key: 'honk', x: 278, y: 134, w: 34, h: 34, round: true },
  { key: 'pause', x: 303, y: 29, w: 14, h: 12 },
];

const Input = {
  rawHeld: new Set(),   // physical keys currently down
  held: new Set(),      // logical actions currently down
  queue: [],            // presses since last frame: { key, raw, x, y }
  touches: new Map(),   // pointerId -> action (or null for a plain tap)
  padHeld: new Set(),
  padPrev: new Set(),
  touchMode: false,
  lastDevice: 'keyboard',

  anyHeld() { return this.rawHeld.size > 0 || this.touches.size > 0 || this.padHeld.size > 0; },
  isDown(k) { return this.held.has(k); },
  refresh() {
    this.held.clear();
    for (const c of this.rawHeld) { const k = KEYMAP[c]; if (k) this.held.add(k); }
    for (const k of this.touches.values()) if (k) this.held.add(k);
    for (const k of this.padHeld) this.held.add(k);
  },
  take() { const q = this.queue; this.queue = []; return q; },
  clear() { this.rawHeld.clear(); this.touches.clear(); this.padHeld.clear(); this.refresh(); },
};

function toGameXY(e) {
  const r = screenCanvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
function touchButtonAt(p) {
  for (const b of TOUCH_BTNS) {
    if (b.round) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (Math.hypot(p.x - cx, p.y - cy) <= b.w / 2 + 3) return b.key;
    } else if (p.x >= b.x - 2 && p.x < b.x + b.w + 2 && p.y >= b.y - 2 && p.y < b.y + b.h + 2) return b.key;
  }
  return null;
}

function initInput(onAnyInput) {
  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (k && (k === 'up' || k === 'down' || k === 'left' || k === 'right' || k === 'honk')) e.preventDefault();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    onAnyInput();
    if (e.repeat) return;
    Input.lastDevice = 'keyboard';
    Input.rawHeld.add(e.code);
    Input.refresh();
    Input.queue.push({ key: k || null, raw: true, code: e.code });
  });
  window.addEventListener('keyup', (e) => {
    Input.rawHeld.delete(e.code);
    Input.refresh();
  });
  window.addEventListener('blur', () => Input.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) Input.clear(); });

  screenCanvas.addEventListener('pointerdown', (e) => {
    onAnyInput();
    e.preventDefault();
    const p = toGameXY(e);
    try { screenCanvas.focus({ preventScroll: true }); } catch (err) { /* old browser */ }
    if (e.pointerType !== 'mouse') Input.touchMode = true;
    Input.lastDevice = e.pointerType === 'mouse' ? 'mouse' : 'touch';
    const btn = Input.touchMode && gameWantsTouchButtons() ? touchButtonAt(p) : null;
    Input.touches.set(e.pointerId, btn);
    try { screenCanvas.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
    Input.refresh();
    Input.queue.push({ key: btn || 'tap', raw: true, x: p.x, y: p.y });
  });
  screenCanvas.addEventListener('pointermove', (e) => {
    if (!Input.touches.has(e.pointerId)) return;
    const old = Input.touches.get(e.pointerId);
    if (!old || old === 'honk' || old === 'pause') return; // only the d-pad slides
    const now = touchButtonAt(toGameXY(e));
    if (now && now !== old && ARROWS.includes(now)) {
      Input.touches.set(e.pointerId, now);
      Input.refresh();
      Input.queue.push({ key: now, raw: true });
    }
  });
  const up = (e) => { Input.touches.delete(e.pointerId); Input.refresh(); };
  screenCanvas.addEventListener('pointerup', up);
  screenCanvas.addEventListener('pointercancel', up);
  screenCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Gamepads: d-pad / left stick = arrows, A/B = honk, START = pause/enter.
function pollGamepads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const now = new Set();
  for (const gp of pads) {
    if (!gp) continue;
    const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (b(14) || ax < -0.5) now.add('left');
    if (b(15) || ax > 0.5) now.add('right');
    if (b(12) || ay < -0.5) now.add('up');
    if (b(13) || ay > 0.5) now.add('down');
    if (b(0) || b(1) || b(2) || b(3)) now.add('honk');
    if (b(9)) now.add('pause');
    if (b(8)) now.add('esc');
  }
  for (const k of now) {
    if (!Input.padPrev.has(k)) {
      Input.lastDevice = 'gamepad';
      Input.queue.push({ key: k, raw: true });
    }
  }
  Input.padPrev = now;
  Input.padHeld = now;
  Input.refresh();
}

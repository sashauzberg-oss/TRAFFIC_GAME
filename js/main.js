'use strict';
// ---------------------------------------------------------------------------
// main.js - boot: build the sprites, hook up input, run a fixed 60 Hz loop.
// ---------------------------------------------------------------------------

(function boot() {
  buildSprites();
  loadBest();
  decoratePage();
  fitScreen();
  window.addEventListener('resize', fitScreen);
  initInput(() => {
    // browsers only allow sound after the first key press / tap
    const first = !Sound.ready;
    Sound.init();
    if (first && G.state === 'title') Sound.music.start('title');
  });
  enterTitle();

  const STEP = 1 / 60;
  let last = performance.now();
  let acc = 0;
  function tick(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    acc += dt;
    pollGamepads();
    let steps = 0;
    while (acc >= STEP && steps < 6) {
      update(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps >= 6) acc = 0;
    render();
    requestAnimationFrame(tick);
  }

  // ?test freezes the clock so automated tests can step frames by hand
  const testMode = /[?&]test\b/.test(location.search);
  window.OTL = {
    G, player, RULES, npcs, startGame, startPhase, update, render, Input,
    step(n, beforeEach) {
      for (let i = 0; i < (n || 1); i++) {
        if (beforeEach) beforeEach(i);
        update(STEP);
      }
      render();
    },
  };
  if (!testMode) requestAnimationFrame(tick);
  else render();
})();

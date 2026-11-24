(() => {
  const $ = (id) => document.getElementById(id);
  const cv = $("cv"), ctx = cv.getContext("2d");
  const W = 480, H = 560;
  cv.width = W * 2; cv.height = H * 2; ctx.scale(2, 2);
  const scoreEl = $("score"), bestEl = $("best"), levelEl = $("level"), livesEl = $("lives"), stage = $("stage");
  const ov = $("overlay"), ovKicker = $("ov-kicker"), ovTitle = $("ov-title"), ovSub = $("ov-sub"), ovBtn = $("ov-btn");

  const COLS = 8, ROWS = 6, GAP = 6, SIDE = 24, TOP = 70, BH = 20;
  const BW = (W - SIDE * 2 - GAP * (COLS - 1)) / COLS;
  const PAD_H = 10, PAD_Y = H - 40, R = 6;
  const ROW_COLOR = ["#e8efff", "#c4d6ff", "#9db9ff", "#7499ff", "#4d7aff", "#2f63ff"];

  let state = "idle", pausedFrom = "ready"; // idle | ready | run | pause | over
  let pad, ball, bricks, parts, score, lives, level, last = 0;
  const keysDown = {};

  bestEl.textContent = Toka.best("breakout") || 0;

  function buildBricks() {
    bricks = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      bricks.push({ x: SIDE + c * (BW + GAP), y: TOP + r * (BH + GAP), r, alive: true, t: 0 });
    }
  }

  function newGame() {
    score = 0; lives = 3; level = 1; parts = [];
    pad = { x: W / 2, w: 90 };
    buildBricks();
    resetBall();
    sync();
    scoreEl.textContent = 0;
    state = "ready";
    ov.classList.add("hide");
  }

  function resetBall() {
    ball = { x: pad.x, y: PAD_Y - R - 1, vx: 0, vy: 0, stuck: true };
  }

  function speed() { return 5.2 + (level - 1) * 0.7; }

  function launch() {
    if (!ball.stuck) return;
    const a = (Math.random() * 0.6 - 0.3);
    ball.vx = Math.sin(a) * speed();
    ball.vy = -Math.cos(a) * speed();
    ball.stuck = false;
    state = "run";
  }

  function sync() {
    levelEl.textContent = level;
    livesEl.textContent = lives;
  }

  function addScore(n) {
    score += n;
    Toka.bump(scoreEl, score);
    if (Toka.submit("breakout", score)) bestEl.textContent = score;
  }

  function burst(x, y, color) {
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.2;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
    }
  }

  function update(dt) {
    const k = dt / 16.667;
    if (keysDown.ArrowLeft || keysDown.a) pad.x -= 8 * k;
    if (keysDown.ArrowRight || keysDown.d) pad.x += 8 * k;
    pad.x = Math.max(pad.w / 2, Math.min(W - pad.w / 2, pad.x));

    for (const p of parts) { p.x += p.vx * k; p.y += p.vy * k; p.vy += 0.06 * k; p.life -= 0.03 * k; }
    parts = parts.filter((p) => p.life > 0);
    for (const b of bricks) if (b.t > 0) b.t = Math.max(0, b.t - dt / 200);

    if (ball.stuck) { ball.x = pad.x; return; }
    if (state !== "run") return;

    /* sub-step so fast balls can't tunnel through bricks */
    const steps = Math.ceil((Math.hypot(ball.vx, ball.vy) * k) / 4);
    for (let i = 0; i < steps; i++) {
      ball.x += (ball.vx * k) / steps;
      ball.y += (ball.vy * k) / steps;
      if (collide()) break;
    }
  }

  function collide() {
    if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx); }
    if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y < R) { ball.y = R; ball.vy = Math.abs(ball.vy); }

    /* paddle */
    if (ball.vy > 0 && ball.y + R >= PAD_Y && ball.y - R <= PAD_Y + PAD_H && Math.abs(ball.x - pad.x) <= pad.w / 2 + R) {
      const rel = Math.max(-1, Math.min(1, (ball.x - pad.x) / (pad.w / 2)));
      const a = rel * 1.05;
      const s = speed();
      ball.vx = Math.sin(a) * s;
      ball.vy = -Math.cos(a) * s;
      ball.y = PAD_Y - R;
      pad.hit = 1;
    }

    /* bricks */
    for (const b of bricks) {
      if (!b.alive) continue;
      const nx = Math.max(b.x, Math.min(ball.x, b.x + BW)), ny = Math.max(b.y, Math.min(ball.y, b.y + BH));
      const dx = ball.x - nx, dy = ball.y - ny;
      if (dx * dx + dy * dy > R * R) continue;
      b.alive = false;
      burst(b.x + BW / 2, b.y + BH / 2, ROW_COLOR[b.r]);
      addScore((ROWS - b.r) * 10);
      if (Math.abs(dx) > Math.abs(dy)) ball.vx = dx > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
      else ball.vy = dy > 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy);
      if (!bricks.some((x) => x.alive)) nextLevel();
      return true;
    }

    /* floor */
    if (ball.y - R > H) {
      lives--;
      sync();
      stage.classList.remove("shake"); void stage.offsetWidth; stage.classList.add("shake");
      if (lives <= 0) return gameOver(), true;
      resetBall();
      state = "ready";
      return true;
    }
    return false;
  }

  function nextLevel() {
    level++;
    sync();
    buildBricks();
    resetBall();
    ovKicker.textContent = "Level " + level;
    ovTitle.textContent = "Faster now";
    ovSub.textContent = "Ball speed goes up each level.";
    ovBtn.textContent = "Continue";
    ov.classList.remove("hide");
    pausedFrom = "ready";
    state = "pause";
    freeMouse();
  }

  function gameOver() {
    state = "over";
    freeMouse();
    setTimeout(() => {
      ovKicker.textContent = Toka.best("breakout") === score && score > 0 ? "New best" : "Game over";
      ovTitle.textContent = score + " pts";
      ovSub.textContent = "You reached level " + level + ".";
      ovBtn.textContent = "Play again";
      ov.classList.remove("hide");
    }, 350);
  }

  /* keep the mouse captured while playing (mouse only; touch has no cursor) */
  const fineMouse = matchMedia("(pointer: fine)").matches;
  const locked = () => document.pointerLockElement === cv;
  function lockMouse() {
    if (!fineMouse || locked() || !cv.requestPointerLock) return;
    try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* needs a user gesture */ }
  }
  function freeMouse() { if (locked()) document.exitPointerLock(); }

  function primary() {
    if (state === "idle" || state === "over") { lockMouse(); return newGame(); }
    if (state === "pause") { lockMouse(); ov.classList.add("hide"); state = pausedFrom; return; }
    if (state === "ready") { lockMouse(); return launch(); }
  }
  function pause() {
    if (state !== "run" && state !== "ready") return;
    pausedFrom = state;
    state = "pause";
    ovKicker.textContent = "Paused"; ovTitle.textContent = "Take a breath"; ovSub.textContent = "Click or press space to continue."; ovBtn.textContent = "Resume";
    ov.classList.remove("hide");
    freeMouse();
  }
  function togglePause() {
    if (state === "run" || state === "ready") pause();
    else if (state === "pause") primary();
  }
  /* Esc (or anything that releases the cursor) pauses the game */
  document.addEventListener("pointerlockchange", () => { if (!locked()) pause(); });

  /* ─── input ─── */
  addEventListener("keydown", (e) => {
    keysDown[e.key] = true;
    if (e.key === " ") { if (state === "run") pause(); else primary(); }
    if (e.key === "p" || e.key === "P") togglePause();
    if ((e.key.startsWith("Arrow")) && state === "idle") newGame();
  });
  addEventListener("keyup", (e) => { keysDown[e.key] = false; });

  function moveTo(clientX) {
    const r = cv.getBoundingClientRect();
    pad.x = Math.max(pad.w / 2, Math.min(W - pad.w / 2, ((clientX - r.left) / r.width) * W));
  }
  cv.addEventListener("mousemove", (e) => {
    if (locked()) {
      const k = W / cv.getBoundingClientRect().width;
      pad.x = Math.max(pad.w / 2, Math.min(W - pad.w / 2, pad.x + e.movementX * k));
    } else if (state !== "idle" && state !== "over") moveTo(e.clientX);
  });
  cv.addEventListener("touchmove", (e) => { e.preventDefault(); moveTo(e.touches[0].clientX); }, { passive: false });
  cv.addEventListener("touchstart", (e) => { moveTo(e.touches[0].clientX); }, { passive: true });
  cv.addEventListener("click", () => { if (state === "ready") { lockMouse(); launch(); } });
  cv.addEventListener("touchend", () => { if (state === "ready") launch(); });
  ovBtn.addEventListener("click", primary);

  /* ─── render ─── */
  function draw() {
    ctx.fillStyle = "#091533";
    ctx.fillRect(0, 0, W, H);

    for (const b of bricks || []) {
      if (!b.alive) continue;
      ctx.fillStyle = ROW_COLOR[b.r];
      ctx.fillRect(b.x, b.y, BW, BH);
    }

    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    if (pad) {
      ctx.fillStyle = "#e8efff";
      ctx.fillRect(pad.x - pad.w / 2, PAD_Y, pad.w, PAD_H);
      ctx.fillStyle = "#6b95ff";
      ctx.fillRect(pad.x - pad.w / 2, PAD_Y + PAD_H - 3, pad.w, 3);
      ctx.fillStyle = "#e8efff";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2);
      ctx.fill();

      /* HUD */
      ctx.fillStyle = "#8a9ccc";
      ctx.font = "500 12px 'DM Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText("LEVEL " + level, SIDE, 34);
      for (let i = 0; i < lives; i++) { ctx.fillStyle = "#6b95ff"; ctx.fillRect(W - SIDE - 12 - i * 18, 25, 12, 12); }
    }
  }

  function frame(now) {
    const dt = Math.min(now - last, 34);
    last = now;
    if (pad) update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  pad = { x: W / 2, w: 90 };
  buildBricks();
  resetBall();
  level = 1; lives = 3; score = 0; parts = [];
  requestAnimationFrame((t) => { last = t; frame(t); });
})();

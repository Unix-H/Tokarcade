(() => {
  const $ = (id) => document.getElementById(id);
  const cv = $("cv"), ctx = cv.getContext("2d");
  const scoreEl = $("score"), bestEl = $("best"), stage = $("stage");
  const ov = $("overlay"), ovKicker = $("ov-kicker"), ovTitle = $("ov-title"), ovSub = $("ov-sub"), ovBtn = $("ov-btn");

  const L = 400, N = 20, S = L / N;
  cv.width = cv.height = L * 2; ctx.scale(2, 2);
  let snake, dir, queue, food, score, speed, timer, pops = [];
  let state = "idle"; // idle | run | pause | over

  bestEl.textContent = Toka.best("snake") || 0;

  function reset() {
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dir = { x: 1, y: 0 };
    queue = [];
    score = 0;
    speed = 130;
    pops = [];
    scoreEl.textContent = 0;
    placeFood();
  }

  function placeFood() {
    do {
      food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
    } while (snake.some((s) => s.x === food.x && s.y === food.y));
  }

  function start() {
    reset();
    state = "run";
    ov.classList.add("hide");
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      step();
      if (state === "run") schedule();
    }, speed);
  }

  function step() {
    if (queue.length) dir = queue.shift();
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const hitWall = head.x < 0 || head.y < 0 || head.x >= N || head.y >= N;
    const hitSelf = snake.slice(0, -1).some((s) => s.x === head.x && s.y === head.y);
    if (hitWall || hitSelf) return gameOver();

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      Toka.bump(scoreEl, score);
      pops.push({ x: food.x, y: food.y, t: performance.now() });
      speed = Math.max(60, speed - 2);
      placeFood();
    } else {
      snake.pop();
    }
  }

  function gameOver() {
    state = "over";
    clearTimeout(timer);
    const isBest = Toka.submit("snake", score);
    if (isBest) bestEl.textContent = score;
    stage.classList.remove("shake");
    void stage.offsetWidth;
    stage.classList.add("shake");
    setTimeout(() => {
      ovKicker.textContent = isBest && score > 0 ? "New best" : "Game over";
      ovTitle.textContent = score + " pts";
      ovSub.textContent = "You grew to " + snake.length + " segments.";
      ovBtn.textContent = "Play again";
      ov.classList.remove("hide");
    }, 350);
  }

  function togglePause() {
    if (state === "run") {
      state = "pause";
      clearTimeout(timer);
      ovKicker.textContent = "Paused";
      ovTitle.textContent = "Take a breath";
      ovSub.textContent = "Press space to continue.";
      ovBtn.textContent = "Resume";
      ov.classList.remove("hide");
    } else if (state === "pause") {
      state = "run";
      ov.classList.add("hide");
      schedule();
    }
  }

  function turn(d) {
    if (state === "idle" || state === "over") return start();
    if (state !== "run") return;
    const last = queue.length ? queue[queue.length - 1] : dir;
    if ((last.x === -d.x && last.y === -d.y) || (last.x === d.x && last.y === d.y)) return;
    if (queue.length < 3) queue.push(d);
  }

  const keys = {
    ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
  };
  addEventListener("keydown", (e) => {
    if (keys[e.key]) turn(keys[e.key]);
    else if (e.key === " ") {
      if (state === "idle" || state === "over") start();
      else togglePause();
    } else if (e.key === "p" || e.key === "P") togglePause();
  });
  ovBtn.addEventListener("click", () => {
    if (state === "pause") togglePause(); else start();
  });

  /* swipe */
  let tx, ty;
  cv.addEventListener("touchstart", (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  cv.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  cv.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    turn(Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
  });

  /* ─── render ─── */
  function draw(now) {
    ctx.fillStyle = "#091533";
    ctx.fillRect(0, 0, L, L);

    ctx.fillStyle = "rgba(120,160,255,.13)";
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) ctx.fillRect(x * S + S / 2 - 1, y * S + S / 2 - 1, 2, 2);

    if (snake) {
      const pulse = 2 + Math.sin(now / 220) * 1.5;
      ctx.fillStyle = "#e8efff";
      ctx.fillRect(food.x * S + pulse, food.y * S + pulse, S - pulse * 2, S - pulse * 2);

      for (let i = snake.length - 1; i >= 0; i--) {
        const s = snake[i];
        ctx.fillStyle = i === 0 ? "#e8efff" : `rgba(75,125,255,${Math.max(0.4, 1 - (i / snake.length) * 0.6)})`;
        ctx.fillRect(s.x * S + 1, s.y * S + 1, S - 2, S - 2);
      }

      pops = pops.filter((p) => now - p.t < 450);
      for (const p of pops) {
        const k = (now - p.t) / 450;
        ctx.strokeStyle = `rgba(232,239,255,${1 - k})`;
        ctx.lineWidth = 2;
        const g = k * 14;
        ctx.strokeRect(p.x * S - g, p.y * S - g, S + g * 2, S + g * 2);
      }
    }
    requestAnimationFrame(draw);
  }
  reset();
  state = "idle";
  requestAnimationFrame(draw);
})();

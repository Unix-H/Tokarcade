(() => {
  const $ = (id) => document.getElementById(id);
  const tilesEl = $("tiles"), scoreEl = $("score"), bestEl = $("best");
  const ov = $("overlay"), ovKicker = $("ov-kicker"), ovTitle = $("ov-title"), ovSub = $("ov-sub"), ovBtn = $("ov-btn"), ovKeep = $("ov-keep");

  let tiles, nextId, score, over, won, keepGoing, busy;
  const els = new Map();

  bestEl.textContent = Toka.best("2048") || 0;

  function newGame() {
    tiles = []; nextId = 0; score = 0; over = false; won = false; keepGoing = false; busy = false;
    tilesEl.innerHTML = ""; els.clear();
    scoreEl.textContent = 0;
    ov.classList.add("hide");
    spawn(); spawn();
    render();
  }

  function spawn() {
    const free = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if (!tiles.some((t) => !t.dead && t.r === r && t.c === c)) free.push([r, c]);
    }
    if (!free.length) return;
    const [r, c] = free[Math.floor(Math.random() * free.length)];
    tiles.push({ id: ++nextId, r, c, v: Math.random() < 0.9 ? 2 : 4, isNew: true });
  }

  function render() {
    for (const t of tiles) {
      let el = els.get(t.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "tile" + (t.isNew ? " new" : "");
        el.innerHTML = '<div class="in"></div>';
        tilesEl.appendChild(el);
        els.set(t.id, el);
      }
      el.style.setProperty("--r", t.r);
      el.style.setProperty("--c", t.c);
      el.dataset.v = t.v;
      el.classList.toggle("dead", !!t.dead);
      el.classList.toggle("big", t.v >= 128 && t.v < 1024);
      const inner = el.firstChild;
      if (inner.textContent !== String(t.v)) {
        inner.textContent = t.v;
        if (t.merged) {
          el.classList.remove("pop");
          void el.offsetWidth;
          el.classList.add("pop");
        }
      }
    }
  }

  function move(d) {
    if (over || busy) return;
    const ik = (t) => d === "L" ? [t.r, t.c] : d === "R" ? [t.r, 3 - t.c] : d === "U" ? [t.c, t.r] : [t.c, 3 - t.r];
    const rc = (i, k) => d === "L" ? [i, k] : d === "R" ? [i, 3 - k] : d === "U" ? [k, i] : [3 - k, i];

    let moved = false, gained = 0;
    tiles.forEach((t) => { t.merged = false; t.isNew = false; });

    for (let i = 0; i < 4; i++) {
      const line = tiles.filter((t) => !t.dead && ik(t)[0] === i).sort((a, b) => ik(a)[1] - ik(b)[1]);
      let k = 0, last = null;
      for (const t of line) {
        if (last && last.v === t.v && !last.merged) {
          const [r, c] = rc(i, k - 1);
          t.r = r; t.c = c; t.dead = true;
          last.v *= 2; last.merged = true;
          gained += last.v;
          moved = true;
        } else {
          const [r, c] = rc(i, k);
          if (t.r !== r || t.c !== c) moved = true;
          t.r = r; t.c = c;
          last = t; k++;
        }
      }
    }
    if (!moved) return;

    busy = true;
    score += gained;
    if (gained) Toka.bump(scoreEl, score);
    if (Toka.submit("2048", score)) bestEl.textContent = score;

    render();
    setTimeout(() => {
      tiles.filter((t) => t.dead).forEach((t) => { els.get(t.id).remove(); els.delete(t.id); });
      tiles = tiles.filter((t) => !t.dead);
      spawn();
      render();
      busy = false;
      check();
    }, 130);
  }

  function check() {
    if (!won && !keepGoing && tiles.some((t) => t.v >= 2048)) {
      won = true;
      ovKicker.textContent = "You win";
      ovTitle.textContent = "2048!";
      ovSub.textContent = "Score " + score + ". Keep going if you want more.";
      ovKeep.hidden = false;
      ov.classList.remove("hide");
      return;
    }
    if (tiles.length < 16) return;
    for (const t of tiles) {
      if (tiles.some((o) => (o.r === t.r && Math.abs(o.c - t.c) === 1 || o.c === t.c && Math.abs(o.r - t.r) === 1) && o.v === t.v)) return;
    }
    over = true;
    ovKicker.textContent = "Game over";
    ovTitle.textContent = "No moves left";
    ovSub.textContent = "Final score " + score + ".";
    ovKeep.hidden = true;
    ov.classList.remove("hide");
  }

  const map = { ArrowLeft: "L", a: "L", A: "L", ArrowRight: "R", d: "R", D: "R", ArrowUp: "U", w: "U", W: "U", ArrowDown: "D", s: "D", S: "D" };
  addEventListener("keydown", (e) => { if (map[e.key] && ov.classList.contains("hide")) move(map[e.key]); });

  let tx, ty;
  const board = $("board");
  board.addEventListener("touchstart", (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  board.addEventListener("touchend", (e) => {
    if (!ov.classList.contains("hide")) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : (dy > 0 ? "D" : "U"));
  });

  ovBtn.addEventListener("click", newGame);
  ovKeep.addEventListener("click", () => { keepGoing = true; ov.classList.add("hide"); });
  $("restart").addEventListener("click", newGame);

  newGame();
})();

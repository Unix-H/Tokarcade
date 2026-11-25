(() => {
  "use strict";
  const { N, SHAPES, create, drop, fits } = window.BB;
  const HEX = [null, "#ff3347", "#ff8a14", "#ffd01f", "#38d94a", "#25c9ff", "#3f6bff", "#a848ff", "#ff4fb8"];
  const PRAISE = ["", "Good!", "Great!", "Excellent!", "Amazing!", "Unbelievable!"];
  const $ = (id) => document.getElementById(id);
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  const cv = $("game"), ctx = cv.getContext("2d");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const out3 = (k) => 1 - Math.pow(1 - k, 3);
  const back = (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
  const fmt = (n) => n.toLocaleString("en-US");

  /* ───────── storage ───────── */
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const write = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* play on without saving */ } };
  const K_BEST = "toka:blockbuster", K_GAME = "toka:blockbuster:game", K_MUTE = "toka:blockbuster:mute";
  const storedBest = () => { const b = read(K_BEST); return b && Number.isInteger(b.v) ? b.v : 0; };

  /* ───────── sound ───────── */
  let mute = read(K_MUTE) === true, ac = null;
  function tone(f, at, len, vol, type, slide) {
    if (mute) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = ac || new AC();
    if (ac.state === "suspended") ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + len);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + len);
  }
  const sfx = {
    pick: () => tone(520, 0, 0.07, 0.06, "triangle", 700),
    back: () => tone(300, 0, 0.12, 0.06, "triangle", 190),
    thud: () => { tone(170, 0, 0.13, 0.22, "sine", 70); tone(900, 0, 0.03, 0.04, "square"); },
    clear: (lines, combo) => {
      const root = 392 * Math.pow(2, Math.min(combo - 1, 12) / 12);
      [1, 1.26, 1.5, 2, 2.52, 3].slice(0, 3 + Math.min(lines, 3)).forEach((m, i) => tone(root * m, i * 0.055, 0.42, 0.12, "triangle"));
      tone(110, 0.02, 0.3, 0.25, "sine", 45);
    },
    all: () => [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.25 + i * 0.07, 0.6, 0.11, "triangle")),
    over: () => [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.16, 0.4, 0.12, "triangle")),
  };
  const paintSound = () => { $("sound").textContent = mute ? "Sound off" : "Sound on"; $("sound").setAttribute("aria-pressed", String(!mute)); };
  $("sound").addEventListener("click", () => { mute = !mute; write(K_MUTE, mute); paintSound(); sfx.pick(); });

  /* ───────── layout ───────── */
  let L = null, dpr = 1, sprites = [], white = null, gray = null, glow = [], boardImg = null;
  function layout() {
    const W = innerWidth, H = innerHeight, top = $("hud").offsetHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const trayH = clamp(H * 0.162, 72, 190), edge = W < 620 ? 8 : 16;
    const room = Math.min(W - edge * 2, H - top - trayH - 18);
    const frame = Math.max(5, Math.round(room * 0.012));
    const cell = Math.max(14, Math.floor((room - frame * 2) / N));
    const size = cell * N + frame * 2;
    const x = Math.round((W - size) / 2);
    const spare = H - top - trayH - 18 - size;
    const y = Math.round(top + 4 + Math.max(0, spare / 2));
    const tw = Math.min(W - edge * 2, Math.max(size, 420));
    L = { W, H, cell, size, frame, x, y, gx: x + frame, gy: y + frame, trayY: y + size + 8, trayH: Math.min(trayH, H - y - size - 12), tx: (W - tw) / 2, slotW: tw / 3 };
    L.tc = Math.min(cell * 0.58, (L.trayH - 10) / 5, (L.slotW * 0.9) / 5);
    document.documentElement.style.setProperty("--u", clamp(size * 0.13, 34, 96) + "px");
    buildSprites();
    wake();
  }
  const mix = (hex, to, k) => {
    const a = parseInt(hex.slice(1), 16), f = (s) => Math.round(((a >> s) & 255) + (to - ((a >> s) & 255)) * k);
    return `rgb(${f(16)},${f(8)},${f(0)})`;
  };
  function canvas(w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function blockSprite(hex) {
    const s = Math.round(L.cell * dpr), c = canvas(s, s), g = c.getContext("2d");
    const p = Math.max(1, s * 0.018), q = s - p, b = s * 0.15;
    g.beginPath(); g.roundRect(p, p, q - p, q - p, s * 0.07); g.clip();
    const tri = (fill, pts) => { g.fillStyle = fill; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
    g.fillStyle = hex; g.fillRect(0, 0, s, s);
    tri(mix(hex, 255, 0.55), [[p, p], [q, p], [q - b, p + b], [p + b, p + b]]);
    tri(mix(hex, 255, 0.22), [[p, p], [p + b, p + b], [p + b, q - b], [p, q]]);
    tri(mix(hex, 0, 0.2), [[q, p], [q, q], [q - b, q - b], [q - b, p + b]]);
    tri(mix(hex, 0, 0.42), [[p, q], [p + b, q - b], [q - b, q - b], [q, q]]);
    const f = g.createLinearGradient(0, p + b, 0, q - b);
    f.addColorStop(0, mix(hex, 255, 0.1)); f.addColorStop(1, mix(hex, 0, 0.06));
    g.fillStyle = f; g.fillRect(p + b, p + b, q - p - b * 2, q - p - b * 2);
    return c;
  }
  function buildSprites() {
    sprites = HEX.map((h) => h && blockSprite(h));
    white = blockSprite("#ffffff"); gray = blockSprite("#55555c");
    glow = HEX.map((h) => {
      if (!h) return null;
      const c = canvas(64, 64), g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, "#fff"); r.addColorStop(0.25, h); r.addColorStop(1, h + "00");
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      return c;
    });
    boardImg = canvas(L.size * dpr, L.size * dpr);
    const g = boardImg.getContext("2d");
    g.scale(dpr, dpr);
    g.fillStyle = "#2b2b31"; g.beginPath(); g.roundRect(0, 0, L.size, L.size, L.cell * 0.16); g.fill();
    g.fillStyle = "#08080a"; g.beginPath(); g.roundRect(2, 2, L.size - 4, L.size - 4, L.cell * 0.14); g.fill();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      g.fillStyle = "#17171b"; g.beginPath(); g.roundRect(L.frame + c * L.cell + 1, L.frame + r * L.cell + 1, L.cell - 2, L.cell - 2, L.cell * 0.07); g.fill();
    }
  }

  /* ───────── game ───────── */
  let G = create(), best = storedBest(), hadBest = best, beaten = false;
  let drag = null, ghost = null, returning = [], fx = [], parts = [], queue = [], pops = new Map(), trayIn = [0, 0, 0], shake = null, deadAt = 0, locked = false;
  let shown = 0, scoreRaf = 0;

  function paintScore(jump) {
    cancelAnimationFrame(scoreRaf);
    const el = $("score"), from = jump ? G.score : shown, to = G.score, t0 = performance.now();
    if (from === to) { shown = to; el.textContent = fmt(to); } else {
      el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit");
      const step = (t) => {
        const k = clamp((t - t0) / 500, 0, 1);
        shown = Math.round(from + (to - from) * out3(k));
        el.textContent = fmt(shown);
        if (k < 1) scoreRaf = requestAnimationFrame(step);
      };
      scoreRaf = requestAnimationFrame(step);
    }
    if (G.score > best) {
      best = G.score; write(K_BEST, { v: best });
      if (!beaten && hadBest > 0) { beaten = true; const b = $("best-wrap"); b.classList.remove("new"); void b.offsetWidth; b.classList.add("new"); }
    }
    $("best").textContent = fmt(best);
    $("combo").textContent = G.combo ? "Combo " + G.combo : "";
    // one block left in the set and nothing cleared yet: the combo is about to break
    $("combo").classList.toggle("risk", G.combo > 0 && !G.setCleared && G.tray.filter(Boolean).length === 1);
  }
  function reset(fresh) {
    if (fresh) { G = create(); write(K_GAME, null); }
    drag = ghost = shake = null; returning = []; fx = []; parts = []; queue = []; pops.clear(); deadAt = 0; locked = false;
    hadBest = best = Math.max(best, storedBest()); beaten = false;
    $("shout").textContent = ""; $("over").hidden = true; $("hud").inert = false;
    dealIn();
    paintScore(true);
    wake();
  }
  function dealIn() { const t = performance.now(); trayIn = [t, t + 80, t + 160]; }

  /* ───────── geometry ───────── */
  const slotCenter = (i) => [L.tx + L.slotW * (i + 0.5), L.trayY + L.trayH / 2];
  function slotAt(x, y) {
    if (y < L.trayY || y > L.H || x < L.tx || x >= L.tx + L.slotW * 3) return -1;
    return clamp(Math.floor((x - L.tx) / L.slotW), 0, 2);
  }
  function dragCenter() {
    const s = SHAPES[G.tray[drag.slot].shape];
    return [drag.x, drag.y - (drag.touch ? (s.h * L.cell) / 2 + 54 : 0)];
  }
  /** nearest legal spot, so a drop does not need to be pixel perfect */
  function findGhost() {
    const p = G.tray[drag.slot], s = SHAPES[p.shape], [cx, cy] = dragCenter();
    const fc = (cx - (s.w * L.cell) / 2 - L.gx) / L.cell, fr = (cy - (s.h * L.cell) / 2 - L.gy) / L.cell;
    let hit = null, bd = 0.8;
    for (let r = Math.floor(fr); r <= Math.floor(fr) + 1; r++) for (let c = Math.floor(fc); c <= Math.floor(fc) + 1; c++) {
      const d = Math.hypot(r - fr, c - fc);
      if (d < bd && fits(G.board, s, r, c)) { bd = d; hit = [r, c]; }
    }
    if (!hit) { ghost = null; return; }
    if (ghost && ghost.r === hit[0] && ghost.c === hit[1]) return;
    const d = drop(G.board, s, hit[0], hit[1], p.color);
    ghost = { r: hit[0], c: hit[1], shape: s, color: p.color, lines: new Set(d.cleared), t: performance.now() };
  }

  /* ───────── input ───────── */
  cv.addEventListener("pointerdown", (e) => {
    if (drag || locked || G.over || e.button !== 0 || !e.isPrimary) return;
    const i = slotAt(e.clientX, e.clientY);
    if (i < 0 || !G.tray[i] || returning.some((q) => q.slot === i)) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    drag = { slot: i, id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType !== "mouse", t: performance.now() };
    cv.style.cursor = "grabbing";
    sfx.pick();
    findGhost();
    wake();
  });
  cv.addEventListener("pointermove", (e) => {
    if (drag) {
      if (e.pointerId !== drag.id) return;
      drag.x = e.clientX; drag.y = e.clientY;
      findGhost();
      wake();
    } else {
      const i = locked || G.over ? -1 : slotAt(e.clientX, e.clientY);
      cv.style.cursor = i >= 0 && G.tray[i] ? "grab" : "";
    }
  });
  function letGo(commit) {
    if (!drag) return;
    const { slot } = drag, g = commit ? ghost : null, at = dragCenter();
    drag = null; ghost = null;
    cv.style.cursor = "";
    if (g) place(slot, g.r, g.c);
    else { returning.push({ slot, x: at[0], y: at[1], t: performance.now() }); sfx.back(); }
    wake();
  }
  cv.addEventListener("pointerup", (e) => { if (drag && e.pointerId === drag.id) { drag.x = e.clientX; drag.y = e.clientY; findGhost(); letGo(true); } });
  cv.addEventListener("pointercancel", (e) => { if (drag && e.pointerId === drag.id) letGo(false); });
  cv.addEventListener("lostpointercapture", (e) => { if (drag && e.pointerId === drag.id) letGo(false); });
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  addEventListener("blur", () => letGo(false));
  addEventListener("keydown", (e) => { if (e.key === "Escape") letGo(false); });

  let armT = 0;
  function disarm() { clearTimeout(armT); $("restart").classList.remove("armed"); $("restart").textContent = "Restart"; }
  $("restart").addEventListener("click", () => {
    if (G.score === 0 || $("restart").classList.contains("armed")) { disarm(); reset(true); return; }
    $("restart").classList.add("armed"); $("restart").textContent = "Sure?";
    armT = setTimeout(disarm, 3000);
  });
  $("again").addEventListener("click", () => reset(true));

  /* ───────── placing ───────── */
  function later(ms, fn) { queue.push({ at: performance.now() + ms, fn }); }
  function place(slot, r, c) {
    const res = G.place(slot, r, c);
    if (!res) return;
    const now = performance.now();
    res.shape.cells.forEach(([y, x]) => pops.set((r + y) * N + c + x, now));
    sfx.thud();
    const mid = [L.gx + (c + res.shape.w / 2) * L.cell, L.gy + (r + res.shape.h / 2) * L.cell];
    dust(res);
    if (res.lines) celebrate(res, mid);
    if (res.dealt) { const d = res.lines ? 320 : 90, t = now + d; trayIn = [t, t + 80, t + 160]; }
    paintScore();
    write(K_GAME, res.over ? null : G.save());
    $("live").textContent = res.lines ? `${res.lines} line${res.lines > 1 ? "s" : ""} cleared, ${res.gained} points${res.combo > 1 ? ", combo " + res.combo : ""}` : "";
    if (res.over) { locked = true; later(res.lines ? 1500 : 500, die); }
  }

  /* ───────── effects ───────── */
  const few = (n) => (calm.matches ? Math.ceil(n * 0.2) : n);
  const cellPos = (i) => [L.gx + ((i % N) + 0.5) * L.cell, L.gy + (Math.floor(i / N) + 0.5) * L.cell];
  function spark(x, y, color, speed, size, life, grav) {
    if (parts.length > 1600) return;
    const a = rand(0, Math.PI * 2), v = speed * rand(0.35, 1);
    parts.push({ kind: "spark", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: grav, s: size * rand(0.6, 1.2), life: life * rand(0.6, 1), age: 0, color, drag: 2.2 });
  }
  function dust(res) {
    const u = L.cell;
    res.shape.cells.forEach(([y, x]) => { for (let i = 0; i < few(2); i++) spark(L.gx + (res.c + x + rand(0, 1)) * u, L.gy + (res.r + y + rand(0, 1)) * u, res.piece.color, u * 2.2, u * 0.16, 0.35, 0); });
  }
  function firework(x, y, color, n, power) {
    for (let i = 0; i < few(n); i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.1, 0.1), v = power * rand(0.75, 1);
      if (parts.length < 1600) parts.push({ kind: "streak", x, y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: L.cell * 5, s: L.cell * 0.07, life: rand(0.7, 1.15), age: 0, color, drag: 1.9 });
    }
    fx.push({ t: performance.now(), dur: 260, draw: (k) => { lit(() => { ctx.globalAlpha = 1 - k; const s = L.cell * (1 + k * 3); ctx.drawImage(glow[color], x - s / 2, y - s / 2, s, s); }); } });
  }
  function lit(fn) { ctx.save(); ctx.globalCompositeOperation = "lighter"; fn(); ctx.restore(); }

  function celebrate(res, mid) {
    const now = performance.now(), u = L.cell, big = res.lines + Math.min(res.combo, 10) * 0.5;
    const SQ = 70, SQ_LEN = 150; // thump, then the lines squash to a glowing bar
    const color = res.piece.color, hex = HEX[color], size = N * u;
    sfx.clear(res.lines, res.combo);

    const line = (idx, horiz) => fx.push({
      t: now, dur: SQ + SQ_LEN + 420, draw: (k, ms) => {
        const a = clamp((ms - SQ) / SQ_LEN, 0, 1), b = clamp((ms - SQ - SQ_LEN) / 420, 0, 1), e = a * a;
        const cx = horiz ? L.gx + size / 2 : L.gx + (idx + 0.5) * u, cy = horiz ? L.gy + (idx + 0.5) * u : L.gy + size / 2;
        if (a < 1) {
          for (let j = 0; j < N; j++) {
            const i = horiz ? idx * N + j : j * N + idx, [x, y] = cellPos(i), q = 1 - e * 0.9;
            const w = horiz ? u : u * q, h = horiz ? u * q : u;
            ctx.drawImage(sprites[res.filled[i]], x - w / 2, y - h / 2, w, h);
            ctx.globalAlpha = clamp(ms / SQ, 0, 1) * 0.45 + a * 0.55; ctx.drawImage(white, x - w / 2, y - h / 2, w, h); ctx.globalAlpha = 1;
          }
        }
        if (a > 0) lit(() => {
          const reach = size / 2 + b * L.W * 0.6, th = u * (0.5 * a * (1 - b) + 0.02);
          const g = horiz ? ctx.createLinearGradient(cx - reach, 0, cx + reach, 0) : ctx.createLinearGradient(0, cy - reach, 0, cy + reach);
          g.addColorStop(0, hex + "00"); g.addColorStop(0.3, hex); g.addColorStop(0.5, "#ffffff"); g.addColorStop(0.7, hex); g.addColorStop(1, hex + "00");
          ctx.fillStyle = g; ctx.globalAlpha = (1 - b) * a;
          for (const [m, al] of [[1, 1], [2.6, 0.35], [5, 0.15]]) {
            ctx.globalAlpha = (1 - b) * a * al;
            if (horiz) ctx.fillRect(cx - reach, cy - (th * m) / 2, reach * 2, th * m); else ctx.fillRect(cx - (th * m) / 2, cy - reach, th * m, reach * 2);
          }
        });
      },
    });
    res.rows.forEach((i) => line(i, true));
    res.cols.forEach((i) => line(i, false));

    // the cleared blocks shatter: tumbling chunks and sparks in their own colours
    later(SQ + SQ_LEN - 40, () => {
      res.cleared.forEach((i) => {
        const [x, y] = cellPos(i), col = res.filled[i], dx = x - mid[0], dy = y - mid[1], d = Math.hypot(dx, dy) || 1;
        for (let k = 0; k < few(res.cleared.length > 24 ? 4 : 6); k++) {
          const push = u * rand(3, 9 + big);
          parts.push({ kind: "chunk", x: x + rand(-0.3, 0.3) * u, y: y + rand(-0.3, 0.3) * u, vx: (dx / d) * push * 0.5 + rand(-1, 1) * u * 5, vy: (dy / d) * push * 0.4 - rand(2, 9) * u, g: u * 26, s: u * rand(0.14, 0.42), rot: rand(0, 6), vr: rand(-12, 12), life: rand(0.8, 1.4), age: 0, color: col, drag: 0.2 });
        }
        for (let k = 0; k < few(5); k++) spark(x, y, col, u * (8 + big * 1.5), u * 0.42, 0.8, u * 4);
      });
      fx.push({ t: performance.now(), dur: 650, draw: (k) => lit(() => {
        ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = hex; ctx.lineWidth = u * 0.5 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(mid[0], mid[1], out3(k) * u * (4 + big), 0, Math.PI * 2); ctx.stroke();
      }) });
      fx.push({ t: performance.now(), dur: 240, draw: (k) => { ctx.globalAlpha = (1 - k) * Math.min(0.1 + big * 0.03, 0.28); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(L.x, L.y, L.size, L.size, u * 0.16); ctx.fill(); ctx.globalAlpha = 1; } });
      if (!calm.matches) shake = { t: performance.now(), dur: 300 + big * 40, amp: Math.min(3 + big * 2.2, 18) };
    });

    const cx = L.x + L.size / 2, cy = L.y + L.size / 2, u2 = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--u"));
    later(150, () => say("pts", clamp(mid[0], L.x + u2 * 1.2, L.x + L.size - u2 * 1.2), clamp(mid[1], L.y + u2 * 0.5, cy - L.size * 0.24 - u2 * 0.95), [["", "+" + fmt(res.gained), "#fff"]]));
    later(260, () => say("praise", cx, cy - L.size * 0.24, [["", PRAISE[Math.min(res.lines, 5)], mix(hex, 255, 0.25)]]));
    if (res.combo > 1) later(430, () => {
      say("slam", cx, cy + L.size * 0.04, [["w", "Combo", "#fff"], ["n", String(res.combo), HEX[3]]], res.combo);
      edgeFlash(res.combo >= 5 ? HEX[8] : hex);
      const n = Math.min(2 + res.combo, 9);
      for (let i = 0; i < n; i++) later(i * 95, () => firework(L.x + rand(0.08, 0.92) * L.size, L.y + rand(0.06, 0.8) * L.size, 1 + Math.floor(Math.random() * 8), 30, u * rand(6, 10)));
    });
    else if (res.lines > 1) {
      edgeFlash(hex);
      for (let i = 0; i < res.lines * 2; i++) later(300 + i * 90, () => firework(L.x + rand(0.1, 0.9) * L.size, L.y + rand(0.1, 0.8) * L.size, 1 + Math.floor(Math.random() * 8), 26, u * rand(6, 9)));
    }
    if (res.allClear) {
      later(560, () => {
        say("clear", cx, cy - L.size * 0.02 + (res.combo > 1 ? L.size * 0.3 : L.size * 0.12), [["", "All clear!", ""]]);
        edgeFlash(HEX[3]);
        for (let i = 0; i < few(170); i++) parts.push({ kind: "confetti", x: rand(0, L.W), y: rand(-L.H * 0.5, -10), vx: rand(-40, 40), vy: rand(150, 420), g: 120, s: rand(6, 13), rot: rand(0, 6), vr: rand(-9, 9), life: rand(2.2, 3.6), age: 0, color: 1 + (i % 8), drag: 0.2 });
        for (let i = 0; i < 8; i++) later(i * 110, () => firework(L.x + rand(0, 1) * L.size, L.y + rand(0, 0.9) * L.size, 1 + i, 38, u * 10));
      });
      sfx.all();
    }
  }
  function say(cls, x, y, lines, k) {
    const d = document.createElement("div");
    d.className = cls; d.style.left = x + "px"; d.style.top = y + "px";
    d.style.setProperty("--k", Math.min(k || 0, 14));
    lines.forEach(([c, txt, color]) => { const i = document.createElement("i"); i.className = c; i.textContent = txt; if (color) i.style.color = color; d.append(i); });
    $("shout").append(d);
    if (cls === "praise" || cls === "slam") $("shout").querySelectorAll("." + cls).forEach((o) => { if (o !== d) o.remove(); });
    setTimeout(() => d.remove(), 2100);
  }
  function edgeFlash(c) { const e = $("edge"); e.style.setProperty("--e", c); e.classList.remove("on"); void e.offsetWidth; e.classList.add("on"); }

  function die() {
    deadAt = performance.now();
    sfx.over();
    later(1250, () => {
      $("over-score").textContent = fmt(G.score);
      const fresh = G.score > 0 && G.score > hadBest;
      $("over-t").textContent = fresh ? "New best!" : "No space left";
      $("over-note").textContent = `Best combo ${G.bestCombo}, ${G.lines} line${G.lines === 1 ? "" : "s"} cleared. ` + (fresh ? (hadBest ? "Old best " + fmt(hadBest) + "." : "First score on the board.") : "Best score " + fmt(best) + ".");
      $("over").hidden = false; $("hud").inert = true;
      $("again").focus({ preventScroll: true });
    });
  }

  /* ───────── drawing ───────── */
  function drawPiece(p, cx, cy, cs, sprite, alpha) {
    const s = SHAPES[p.shape], x = cx - (s.w * cs) / 2, y = cy - (s.h * cs) / 2;
    ctx.globalAlpha = alpha;
    s.cells.forEach(([r, c]) => ctx.drawImage(sprite || sprites[p.color], x + c * cs, y + r * cs, cs, cs));
    ctx.globalAlpha = 1;
  }
  function draw(now, dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.W, L.H);
    if (shake) {
      const k = (now - shake.t) / shake.dur;
      if (k >= 1) shake = null; else { const a = shake.amp * (1 - k) * (1 - k); ctx.translate(rand(-a, a), rand(-a, a)); }
    }
    ctx.drawImage(boardImg, L.x, L.y, L.size, L.size);

    /* blocks on the board; lines about to clear take the held block's colour and pulse */
    const pulse = 0.5 + 0.5 * Math.sin((now - (ghost ? ghost.t : 0)) / 110);
    for (let i = 0; i < N * N; i++) {
      const v = G.board[i];
      if (!v) continue;
      const x = L.gx + (i % N) * L.cell, y = L.gy + Math.floor(i / N) * L.cell;
      let sp = sprites[v], z = 1;
      if (ghost && ghost.lines.has(i)) sp = sprites[ghost.color];
      if (deadAt && now - deadAt > (N - 1 - Math.floor(i / N)) * 110) sp = gray;
      const t = pops.get(i);
      if (t !== undefined) { const k = (now - t) / 190; if (k >= 1) pops.delete(i); else z = 1 + 0.16 * Math.sin(Math.PI * k); }
      const s = L.cell * z;
      ctx.drawImage(sp, x - (s - L.cell) / 2, y - (s - L.cell) / 2, s, s);
      if (ghost && ghost.lines.has(i)) { ctx.globalAlpha = 0.12 + 0.3 * pulse; ctx.drawImage(white, x, y, L.cell, L.cell); ctx.globalAlpha = 1; }
    }
    if (ghost) {
      ctx.globalAlpha = ghost.lines.size ? 0.75 : 0.42;
      ghost.shape.cells.forEach(([r, c]) => ctx.drawImage(sprites[ghost.color], L.gx + (ghost.c + c) * L.cell, L.gy + (ghost.r + r) * L.cell, L.cell, L.cell));
      ctx.globalAlpha = 1;
    }
    pops.forEach((t, i) => { if (!G.board[i]) pops.delete(i); });

    /* tray; finished returns are dropped first so the block is drawn in its slot this very frame */
    returning = returning.filter((q) => now - q.t < 200 && G.tray[q.slot]);
    G.tray.forEach((p, i) => {
      if (!p || (drag && drag.slot === i) || returning.some((q) => q.slot === i)) return;
      const [x, y] = slotCenter(i), k = clamp((now - trayIn[i]) / 320, 0, 1);
      if (k <= 0) return;
      const dead = !G.usable(i);
      drawPiece(p, x, y, L.tc * (k < 1 ? Math.max(0, back(k)) : 1), dead ? gray : null, dead ? 0.55 : 1);
    });
    returning.forEach((q) => {
      const e = out3((now - q.t) / 200), [x, y] = slotCenter(q.slot);
      drawPiece(G.tray[q.slot], q.x + (x - q.x) * e, q.y + (y - q.y) * e, L.cell + (L.tc - L.cell) * e, null, 1);
    });

    fx = fx.filter((f) => { const ms = now - f.t, k = ms / f.dur; if (k >= 1) return false; f.draw(Math.max(0, k), Math.max(0, ms)); ctx.globalAlpha = 1; return true; });
    drawParts(dt);

    if (drag) {
      const p = G.tray[drag.slot], k = out3(clamp((now - drag.t) / 130, 0, 1)), [cx, cy] = dragCenter(), [sx, sy] = slotCenter(drag.slot);
      const cs = L.tc + (L.cell - L.tc) * k;
      drawPiece(p, sx + (cx - sx) * k, sy + (cy - sy) * k, cs, null, 1);
    }
  }
  function drawParts(dt) {
    parts = parts.filter((p) => (p.age += dt) < p.life && p.y < L.H + 60);
    for (const p of parts) {
      const f = Math.exp(-p.drag * dt);
      p.vx *= f; p.vy = p.vy * f + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += p.vr * dt;
    }
    for (const p of parts) {
      const left = 1 - p.age / p.life;
      if (p.kind === "chunk" || p.kind === "confetti") {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, left * 3);
        if (p.kind === "chunk") ctx.drawImage(sprites[p.color], -p.s / 2, -p.s / 2, p.s, p.s);
        else { ctx.fillStyle = HEX[p.color]; ctx.fillRect(-p.s / 2, (-p.s / 4) * Math.cos(p.rot * 2), p.s, (p.s / 2) * Math.cos(p.rot * 2)); }
        ctx.restore();
      }
    }
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    for (const p of parts) {
      const left = 1 - p.age / p.life;
      if (p.kind === "spark") { const s = p.s * 2 * left; ctx.globalAlpha = left; ctx.drawImage(glow[p.color], p.x - s / 2, p.y - s / 2, s, s); }
      else if (p.kind === "streak") {
        ctx.globalAlpha = Math.min(1, left * 1.6); ctx.strokeStyle = HEX[p.color]; ctx.lineWidth = p.s * (0.4 + left);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.06, p.y - p.vy * 0.06); ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* only runs while something moves */
  let raf = 0, lastT = 0;
  function wake() { if (!raf) { lastT = 0; raf = requestAnimationFrame(frame); } }
  function frame(now) {
    raf = 0;
    const dt = lastT ? Math.min((now - lastT) / 1000, 0.04) : 0.016;
    lastT = now;
    const due = queue.filter((q) => q.at <= now);
    queue = queue.filter((q) => q.at > now);
    due.forEach((q) => q.fn());
    draw(now, dt);
    const busy = drag || returning.length || fx.length || parts.length || queue.length || pops.size || shake || now - trayIn[2] < 400 || (deadAt && now - deadAt < 1400);
    if (busy) raf = requestAnimationFrame(frame);
  }

  /* ───────── start ───────── */
  addEventListener("resize", layout);
  paintSound();
  const saved = read(K_GAME);
  if (!(saved && G.load(saved))) G = create();
  $("score").textContent = fmt(G.score); shown = G.score;
  layout();
  reset(false);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  if (location.hash === "#debug") window.__bb = { get G() { return G; }, get L() { return L; }, get busy() { return !!raf; }, get parts() { return parts.length; }, wake };
})();

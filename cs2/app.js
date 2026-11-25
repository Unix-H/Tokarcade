(() => {
  "use strict";
  const { cases: CASES, skins: SKINS, updated } = window.CS2_DATA;

  /* ───────── rules ───────── */
  const START = 1000 * 100; // first budget and refill level, in cents: $1,000
  const ODDS = [0.7992, 0.1598, 0.032, 0.0064, 0.0026]; // published drop rates, Mil-Spec → special
  const GRADE = ["Mil-Spec", "Restricted", "Classified", "Covert", "Rare Special"];
  const ST_CHANCE = 0.1;
  const WEAR = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"];
  const WEAR_ODDS = [0.03, 0.24, 0.33, 0.24, 0.16];
  const BOUND = [0, 0.07, 0.15, 0.38, 0.45, 1];
  const GEM_WEIGHT = 0.1; // Ruby, Sapphire, Black Pearl, Emerald vs 1 for a normal phase (Valve publishes no figure)
  const ROLL_MS = 6400, REEL = 56, WIN_AT = 50;

  /* ───────── helpers ───────── */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
  const usd = (c) => (c < 0 ? "-$" : "$") + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (c) => (c > 0 ? "+" : "") + usd(c);
  const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  const oneOf = (a) => a[Math.floor(rnd() * a.length)];
  const weighted = (w) => {
    let r = rnd() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return i;
    return w.length - 1;
  };
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  const byKey = new Map(SKINS.map((s) => [s.k, s]));
  const bySlug = new Map(CASES.map((c) => [c.id, c]));
  const caseImg = (c) => "img/crates/" + c.id + ".webp";
  const skinImg = (s) => "img/skins/" + s.k + ".webp";
  const finish = (s) => s.f + (s.ph ? " " + s.ph : "");
  const fullName = (s, st) => (s.r === 4 ? "★ " : "") + (st ? "StatTrak™ " : "") + s.w + " | " + finish(s);
  const wearName = (s, w) => (s.v ? "Not Painted" : WEAR[w]);

  /* ───────── saved state ───────── */
  const KEY = "toka:cs2sim";
  // inv rows: [skin key, wear, stattrak, float, price, case id, time]
  const fresh = () => ({ v: 3, bal: START, inv: [], opened: 0, spent: 0, won: 0, sold: 0, pending: null, mute: false });
  const invValue = (rows) => rows.reduce((t, r) => t + r[4], 0);
  let S = fresh();
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && Number.isFinite(raw.bal) && Array.isArray(raw.inv)) {
        S = Object.assign(fresh(), raw);
        if (!raw.v) { // older saves paid every drop out straight away; now skins are sold by hand
          const held = invValue(S.inv);
          S.bal = Math.max(0, S.bal - held);
          S.sold = S.won - held;
        }
        if ((raw.v || 0) < 3) { // the budget used to be $1,000,000
          S.bal = Math.min(S.bal, START);
          S.v = 3;
          save();
        }
      }
    } catch (e) { /* no storage: keep playing in memory */ }
  }
  function save() {
    for (let tries = 0; tries < 4; tries++) {
      try { localStorage.setItem(KEY, JSON.stringify(S)); return; } catch (e) {
        if (S.inv.length < 1000) return;
        // storage full: sell the oldest fifth so nothing is lost
        const old = S.inv.splice(0, Math.ceil(S.inv.length * 0.2)), v = invValue(old);
        S.bal += v; S.sold += v;
      }
    }
  }
  /* credit a paid-for drop exactly once, even after a reload or from another tab */
  function settle(id) {
    load();
    if (!S.pending || (id && S.pending.id !== id)) return;
    const row = S.pending.row;
    S.pending = null;
    S.inv.push(row);
    S.won += row[4];
    save();
  }

  /* ───────── sound (synthesised, no files) ───────── */
  let ac = null;
  function audio() {
    if (S.mute) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = ac || new AC();
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function tone(freq, at, len, vol, type) {
    const a = audio();
    if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + len);
  }
  const tick = () => tone(1150, 0, 0.035, 0.07, "square");
  const fanfare = (r) => {
    const notes = [[392, 523], [392, 523, 659], [440, 554, 659, 880], [440, 554, 659, 880, 1109], [523, 659, 784, 1047, 1319, 1568]][r];
    notes.forEach((f, i) => tone(f, i * 0.09, 0.5, 0.1, "triangle"));
  };
  function paintSound() { $("sound").textContent = S.mute ? "Sound off" : "Sound on"; $("sound").setAttribute("aria-pressed", String(!S.mute)); }
  $("sound").addEventListener("click", () => { load(); S.mute = !S.mute; save(); paintSound(); if (!S.mute) tick(); });

  /* ───────── drops ───────── */
  const pools = new Map(CASES.map((c) => {
    const grades = [0, 1, 2, 3].map((g) => c.items.filter((i) => SKINS[i].r === g));
    const groups = new Map(); // a Doppler is one item with several phases
    c.rare.forEach((i) => { const k = SKINS[i].w + "|" + SKINS[i].f; groups.set(k, (groups.get(k) || []).concat(i)); });
    return [c.id, { grades, groups: [...groups.values()] }];
  }));
  function pickSkin(c) {
    const p = pools.get(c.id), g = weighted(ODDS);
    if (g < 4) return SKINS[oneOf(p.grades[g])];
    const group = oneOf(p.groups);
    return SKINS[group[weighted(group.map((i) => (!SKINS[i].ph || SKINS[i].ph.startsWith("Phase") ? 1 : GEM_WEIGHT)))]];
  }
  function drop(c) {
    const s = pickSkin(c);
    const st = !!s.q && rnd() < ST_CHANCE;
    const b = weighted(WEAR_ODDS);
    const raw = BOUND[b] + rnd() * (BOUND[b + 1] - BOUND[b]);
    const fl = s.lo + raw * (s.hi - s.lo);
    const w = s.v ? 0 : BOUND.findIndex((x, i) => fl < BOUND[i + 1]);
    return { s, st, w, fl, price: (st ? s.q : s.p)[w] };
  }

  /* ───────── top bar ───────── */
  let shown = null, balRaf = 0;
  function paintTop() {
    $("inv-count").textContent = S.inv.length ? S.inv.length.toLocaleString("en-US") : "";
    const el = $("balance"), from = shown, to = S.bal;
    cancelAnimationFrame(balRaf);
    if (from === null || from === to || calm.matches) { shown = to; el.textContent = usd(to); return; }
    el.className = to > from ? "up" : "down";
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, Math.max(0, (t - t0) / 600)), e = 1 - Math.pow(1 - k, 3);
      shown = Math.round(from + (to - from) * e);
      el.textContent = usd(shown);
      if (k < 1) balRaf = requestAnimationFrame(step); else el.className = "";
    };
    balRaf = requestAnimationFrame(step);
  }
  let toastT = 0;
  function toast(msg) {
    $("toast").textContent = msg;
    $("toast").classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(() => $("toast").classList.remove("on"), 2200);
  }
  $("refill").addEventListener("click", () => {
    load();
    if (S.bal >= START) return toast("Your credits are already full");
    S.bal = START;
    save();
    paintTop();
    toast("Credits refilled to " + usd(START));
  });

  /* ───────── tiles ───────── */
  function range(s) {
    const v = s.p.filter((x) => x != null), lo = Math.min(...v), hi = Math.max(...v);
    return lo === hi ? usd(lo) : usd(lo) + " – " + usd(hi);
  }
  const star = (s) => (s.r === 4 ? '<span class="star">★</span> ' : "");
  const skinTile = (s) => `<button type="button" class="skin c${s.r}" data-skin="${s.k}">
    <img src="${skinImg(s)}" alt="" loading="lazy" width="512" height="384">
    <span class="w">${star(s)}${esc(s.w)}</span><span class="f">${esc(finish(s))}</span><span class="p">${range(s)}</span></button>`;

  /* ───────── pages ───────── */
  const view = $("view");
  const casesUi = { q: "", sort: "new", y: 0 };
  function pageCases() {
    view.innerHTML = `<div class="page"><div class="bar"><h1>Choose a case</h1><div class="tools">
      <input class="field" id="q" type="search" placeholder="Search cases or skins" aria-label="Search cases or skins">
      <select class="field" id="sort" aria-label="Sort cases"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="hi">Price: high to low</option><option value="lo">Price: low to high</option></select>
      </div></div><ul class="cases" id="list"></ul></div>`;
    const list = () => {
      const q = casesUi.q.trim().toLowerCase();
      const hit = (c) => !q || c.name.toLowerCase().includes(q) || c.items.concat(c.rare).some((i) => (SKINS[i].w + " " + finish(SKINS[i])).toLowerCase().includes(q));
      const cmp = { new: (a, b) => b.date.localeCompare(a.date), old: (a, b) => a.date.localeCompare(b.date), hi: (a, b) => b.price - a.price, lo: (a, b) => a.price - b.price }[casesUi.sort];
      const out = CASES.filter(hit).sort(cmp);
      $("list").innerHTML = out.map((c) => `<li><a class="case" style="--a:${c.accent}" href="#/case/${c.id}">
        <span class="art"><img src="${caseImg(c)}" alt="" loading="lazy"></span><h2>${esc(c.name)}</h2>
        <p><b>${usd(c.price)}</b>${c.date.slice(0, 4)}</p><i class="strip"></i></a></li>`).join("") || "<li>No case matches that search.</li>";
    };
    $("q").value = casesUi.q; $("sort").value = casesUi.sort;
    $("q").addEventListener("input", (e) => { casesUi.q = e.target.value; list(); });
    $("sort").addEventListener("change", (e) => { casesUi.sort = e.target.value; list(); });
    list();
  }

  function pageCase(c) {
    const sorted = (a) => a.map((i) => SKINS[i]).sort((x, y) => y.r - x.r);
    view.innerHTML = `<div class="page" style="--a:${c.accent}"><a class="back" href="#/">← All cases</a>
      <section class="hero"><div class="art"><img src="${caseImg(c)}" alt="${esc(c.name)}"></div><div>
        <h1>${esc(c.name)}</h1><p class="sub">Released ${c.date.slice(0, 4)}. ${c.items.length} skins and ${c.rare.length} rare ${c.rareName.toLowerCase()}.</p>
        <button type="button" class="open-btn" data-open="${c.id}">Open case <b>${usd(c.price)}</b></button>
        <ul class="odds">${ODDS.map((o, i) => `<li class="c${i}"><b>${(o * 100).toFixed(2)}%</b>${GRADE[i]}</li>`).join("")}</ul>
      </div></section>
      <div class="sec"><h2>Skins</h2><span>${c.items.length}</span></div><div class="skins">${sorted(c.items).map(skinTile).join("")}</div>
      <div class="sec"><h2>Rare special items</h2><span>${c.rare.length}</span></div><div class="skins">${sorted(c.rare).map(skinTile).join("")}</div></div>`;
  }

  const invUi = { r: -1, sort: "new", n: 60 };
  function pageInventory(still) {
    const held = invValue(S.inv), net = S.sold + held - S.spent;
    view.innerHTML = `<div class="page${still ? " still" : ""}"><div class="bar"><h1>Inventory</h1></div>
      <div class="stats"><div><small>Cases opened</small><b>${S.opened.toLocaleString("en-US")}</b></div><div><small>Spent on cases</small><b>${usd(S.spent)}</b></div>
      <div><small>Sold for</small><b>${usd(S.sold)}</b></div><div><small>Inventory value</small><b>${usd(held)}</b></div>
      <div><small>Profit</small><b class="${net < 0 ? "neg" : "pos"}">${signed(net)}</b></div></div><div id="inv"></div></div>`;
    if (!S.inv.length) {
      $("inv").innerHTML = `<div class="empty"><h2>${S.opened ? "Inventory empty" : "No skins yet"}</h2><p>Every skin you open lands here. Sell skins to turn them into credits.</p><a class="open-btn" href="#/">Choose a case</a></div>`;
      return;
    }
    $("inv").innerHTML = `<div class="bar"><div class="chips" id="chips"><button type="button" class="chip" data-r="-1">All</button>${[4, 3, 2, 1, 0].map((r) => `<button type="button" class="chip c${r}" data-r="${r}">${GRADE[r]}</button>`).join("")}</div>
      <div class="tools"><button type="button" class="sell-all" id="sellall"></button><select class="field" id="isort" aria-label="Sort inventory"><option value="new">Newest first</option><option value="hi">Price: high to low</option><option value="lo">Price: low to high</option></select></div></div><div class="skins" id="grid"></div><button type="button" class="plain more" id="more">Show more</button>`;
    let shownRows = [];
    const list = () => {
      let rows = S.inv.map((row, i) => ({ row, i, s: byKey.get(row[0]) })).filter((x) => x.s && (invUi.r < 0 || x.s.r === invUi.r));
      shownRows = rows.map((x) => x.row);
      disarm();
      $("sellall").hidden = !rows.length;
      rows.sort(invUi.sort === "new" ? (a, b) => b.i - a.i : invUi.sort === "hi" ? (a, b) => b.row[4] - a.row[4] : (a, b) => a.row[4] - b.row[4]);
      $("grid").innerHTML = rows.slice(0, invUi.n).map(({ row, i, s }) => `<button type="button" class="skin c${s.r}" data-inv="${i}">
        <img src="${skinImg(s)}" alt="" loading="lazy" width="512" height="384"><span class="w">${star(s)}${row[2] ? '<span class="st">StatTrak™</span> ' : ""}${esc(s.w)}</span>
        <span class="f">${esc(finish(s))}</span><span class="m">${wearName(s, row[1])}</span><span class="p"><b>${usd(row[4])}</b></span></button>`).join("") || "<p>Nothing of this grade yet.</p>";
      $("more").hidden = rows.length <= invUi.n;
      document.querySelectorAll("#chips .chip").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.r === invUi.r)));
    };
    $("chips").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) { invUi.r = +b.dataset.r; invUi.n = 60; list(); } });
    $("isort").value = invUi.sort;
    $("isort").addEventListener("change", (e) => { invUi.sort = e.target.value; list(); });
    $("more").addEventListener("click", () => { invUi.n += 60; list(); });
    /* two clicks: the first arms the button, the second sells */
    let armT = 0;
    function disarm() {
      clearTimeout(armT);
      const b = $("sellall");
      b.classList.remove("armed");
      b.innerHTML = `${invUi.r < 0 ? "Sell all" : "Sell all " + GRADE[invUi.r]} <b>${usd(invValue(shownRows))}</b>`;
    }
    $("sellall").addEventListener("click", (e) => {
      const b = e.currentTarget;
      if (!b.classList.contains("armed")) {
        b.classList.add("armed");
        b.innerHTML = `Confirm: sell ${shownRows.length.toLocaleString("en-US")} skin${shownRows.length === 1 ? "" : "s"} <b>${usd(invValue(shownRows))}</b>`;
        armT = setTimeout(disarm, 4000);
        return;
      }
      sell(shownRows);
    });
    list();
  }

  /* ───────── selling ───────── */
  const rowKey = (r) => JSON.stringify(r);
  function sell(rows) {
    load(); // another tab may have sold some of these already
    const want = new Map();
    rows.forEach((r) => want.set(rowKey(r), (want.get(rowKey(r)) || 0) + 1));
    let n = 0, got = 0;
    S.inv = S.inv.filter((r) => {
      const k = rowKey(r), left = want.get(k);
      if (!left) return true;
      want.set(k, left - 1); n++; got += r[4];
      return false;
    });
    if (!n) { toast("Already sold"); if (tab === "inventory") pageInventory(true); return; }
    S.bal += got; S.sold += got;
    save();
    if ($("sheet").open) $("sheet").close();
    const y = scrollY;
    if (tab === "inventory") { pageInventory(true); scrollTo(0, y); }
    paintTop();
    tone(1568, 0, 0.12, 0.08, "triangle"); tone(2093, 0.07, 0.18, 0.07, "triangle");
    toast((n === 1 ? "Sold for " : "Sold " + n.toLocaleString("en-US") + " skins for ") + usd(got));
  }

  /* ───────── skin details ───────── */
  const floatBar = (f) => `<div class="float" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><u style="left:${(f * 100).toFixed(2)}%"></u></div>`;
  function details(s, row) {
    const mark = { m: "<sup>1</sup>", e: "<sup>2</sup>" };
    const cell = (p, src, i) => (p && p[i] != null ? usd(p[i]) + (mark[src[i]] || "") : "–");
    const lines = s.v ? [["Not Painted", 0]] : WEAR.map((w, i) => [w, i]).filter(([, i]) => s.p[i] != null);
    const used = s.ps + (s.qs || "");
    const c = row && bySlug.get(row[5]);
    const sheet = $("sheet");
    sheet.className = "sheet c" + s.r;
    sheet.innerHTML = `<div class="in"><button type="button" class="x" aria-label="Close">×</button><img src="${skinImg(s)}" alt="">
      <div class="grade">${GRADE[s.r]}</div><h2>${esc(fullName(s, row && row[2]))}</h2>
      ${row ? `<p class="meta">${wearName(s, row[1])}, float ${row[3].toFixed(9)}. Worth ${usd(row[4])} when opened${c ? " from the " + esc(c.name) : ""}.</p>${s.v ? "" : floatBar(row[3])}` : `<p class="meta">Float ${s.lo.toFixed(2)} to ${s.hi.toFixed(2)}</p>`}
      <div class="scroll"><table><thead><tr><th>Wear</th><th>Price</th>${s.q ? '<th class="st">StatTrak™</th>' : ""}</tr></thead><tbody>
      ${lines.map(([n, i]) => `<tr><td>${n}</td><td>${cell(s.p, s.ps, i)}</td>${s.q ? `<td>${cell(s.q, s.qs, i)}</td>` : ""}</tr>`).join("")}</tbody></table></div>
      ${row ? `<button type="button" class="sell" data-sell>Sell for <b>${usd(row[4])}</b></button>` : ""}
      <p class="note">Steam Market price unless marked.${used.includes("m") ? " ¹ Lowest price on other marketplaces, because Steam has no usable sales." : ""}${used.includes("e") ? " ² Estimate: not for sale anywhere right now." : ""}</p></div>`;
    if (row) sheet.querySelector("[data-sell]").addEventListener("click", () => sell([row]));
    sheet.showModal();
    sheet.scrollTop = 0;
  }
  $("sheet").addEventListener("click", (e) => { if (e.target === e.currentTarget || e.target.closest(".x")) $("sheet").close(); });

  view.addEventListener("click", (e) => {
    const b = e.target.closest("[data-skin],[data-inv],[data-open]");
    if (!b) return;
    if (b.dataset.skin) details(byKey.get(b.dataset.skin));
    else if (b.dataset.inv) { const row = S.inv[+b.dataset.inv]; if (row) details(byKey.get(row[0]), row); }
    else openCase(bySlug.get(b.dataset.open));
  });

  /* ───────── opening ───────── */
  const box = $("opening");
  let run = null; // the roll in progress

  function closeOpening() {
    if (run) { cancelAnimationFrame(run.raf); settle(run.id); run = null; }
    if (box.hidden) return;
    box.hidden = true; box.innerHTML = "";
    document.body.classList.remove("lock");
    view.inert = false;
    paintTop();
  }

  const reelTile = (c, s) => s.r === 4
    ? `<div class="tile c4"><div><img src="img/${c.rareImg}" alt=""><span>★ Rare special item</span><span>${c.rareName}</span></div></div>`
    : `<div class="tile c${s.r}"><div><img src="${skinImg(s)}" alt=""><span>${esc(s.w)}</span><span>${esc(finish(s))}</span></div></div>`;

  function openCase(c) {
    if (run) return;
    load();
    if (S.pending) settle();
    if (S.bal < c.price) { paintTop(); return toast("Not enough credits. Sell some skins or hit Refill."); }

    const d = drop(c);
    const id = Date.now().toString(36) + Math.floor(rnd() * 1e9).toString(36);
    S.bal -= c.price; S.spent += c.price; S.opened++;
    S.pending = { id, row: [d.s.k, d.w, d.st ? 1 : 0, +d.fl.toFixed(9), d.price, c.id, Date.now()] };
    save();
    paintTop();

    const strip = Array.from({ length: REEL }, (_, i) => (i === WIN_AT ? d.s : pickSkin(c)));
    box.style.setProperty("--a", c.accent);
    box.innerHTML = `<div class="rolling"><h2>${esc(c.name)}</h2><div class="reel"><i class="pin t"></i><i class="pin b"></i><div class="track">${strip.map((s) => reelTile(c, s)).join("")}</div></div><button type="button" class="skip">Skip</button></div>`;
    box.hidden = false;
    box.scrollTop = 0;
    document.body.classList.add("lock");
    view.inert = true;
    audio();

    const track = box.querySelector(".track"), reel = box.querySelector(".reel"), tile = box.querySelector(".tile");
    const from = 4.5, to = WIN_AT + 0.06 + rnd() * 0.88; // in tiles; may stop anywhere on the winner, like the real thing
    const me = (run = { id, raf: 0, t0: performance.now(), done: false });
    let tw = 0, mid = 0, last = Math.floor(from), lastTick = 0;
    const measure = () => { tw = tile.getBoundingClientRect().width; mid = reel.clientWidth / 2; };
    const place = (pos) => { track.style.transform = `translate3d(${mid - pos * tw}px,0,0)`; };
    measure();
    place(from);
    me.resize = measure;
    const len = calm.matches ? 500 : ROLL_MS;
    const finishRoll = () => { if (run === me && !me.done) { me.done = true; cancelAnimationFrame(me.raf); reveal(c, d, id); } };
    const frame = (t) => {
      if (run !== me) return;
      const k = Math.min(1, Math.max(0, (t - me.t0) / len));
      const pos = from + (to - from) * (1 - Math.pow(1 - k, 4.2));
      place(pos);
      const n = Math.floor(pos);
      if (n !== last) { last = n; if (t - lastTick > 28) { lastTick = t; tick(); } }
      if (k < 1) me.raf = requestAnimationFrame(frame);
      else { me.hold = setTimeout(finishRoll, calm.matches ? 0 : 650); }
    };
    me.raf = requestAnimationFrame(frame);
    me.skip = finishRoll;
    const btn = box.querySelector(".skip");
    btn.addEventListener("click", finishRoll);
    btn.focus({ preventScroll: true });
  }
  addEventListener("resize", () => { if (run && run.resize) run.resize(); });

  function reveal(c, d, id) {
    clearTimeout(run.hold);
    run = null;
    settle(id);
    paintTop();
    fanfare(d.s.r);
    const net = d.price - c.price, est = (d.st ? d.s.qs : d.s.ps)[d.w] === "e";
    box.innerHTML = `<div class="won c${d.s.r}"><i class="flash"></i><img class="pic" src="${skinImg(d.s)}" alt="">
      <div class="grade">${GRADE[d.s.r]}</div><h2>${d.s.r === 4 ? '<span class="star">★</span> ' : ""}${d.st ? '<span class="st">StatTrak™</span> ' : ""}${esc(d.s.w)} | ${esc(finish(d.s))}</h2>
      <p class="cond">${wearName(d.s, d.w)}, float ${d.fl.toFixed(9)}. Added to your inventory.</p>${d.s.v ? "" : floatBar(d.fl)}
      <p class="money"><b>${usd(d.price)}</b><span class="${net < 0 ? "neg" : "pos"}">${signed(net)} vs case price${est ? ", estimated" : ""}</span></p>
      <div class="acts"><button type="button" class="open-btn" data-again>Open another <b>${usd(c.price)}</b></button><button type="button" class="plain" data-close>Back to case</button><button type="button" class="plain" data-inventory>Inventory</button></div></div>`;
    box.scrollTop = 0;
    box.querySelector("[data-again]").addEventListener("click", () => openCase(c));
    box.querySelector("[data-close]").addEventListener("click", closeOpening);
    box.querySelector("[data-inventory]").addEventListener("click", () => { location.hash = "#/inventory"; });
    box.querySelector("[data-again]").focus({ preventScroll: true });
  }
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || box.hidden || $("sheet").open) return;
    if (run) run.skip(); else closeOpening();
  });

  /* ───────── routing ───────── */
  let tab = null, was = null;
  function route() {
    closeOpening();
    if ($("sheet").open) $("sheet").close();
    if (was === "cases") casesUi.y = lastY;
    const m = location.hash.match(/^#\/case\/([a-z0-9-]+)$/), c = m && bySlug.get(m[1]);
    const next = location.hash === "#/inventory" ? "inventory" : "cases";
    load();
    paintTop();
    if (next === "inventory") pageInventory(); else if (c) pageCase(c); else pageCases();
    if (tab && tab !== next) view.firstElementChild.classList.add(next === "inventory" ? "from-r" : "from-l");
    tab = next;
    was = next === "inventory" ? "inventory" : c ? "case" : "cases";
    document.title = (next === "inventory" ? "Inventory" : c ? c.name : "Cases") + " · CS2 Case Simulator";
    $("slider").dataset.on = next;
    document.querySelectorAll("#slider a").forEach((a) => (a.dataset.tab === next ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    scrollTo(0, was === "cases" ? casesUi.y : 0);
  }
  let lastY = 0;
  addEventListener("scroll", () => { if (was === "cases" && !location.hash.includes("/case/") && location.hash !== "#/inventory") lastY = scrollY; }, { passive: true });
  addEventListener("hashchange", route);
  addEventListener("storage", (e) => { if (e.key === KEY && !run) { load(); paintTop(); paintSound(); if (tab === "inventory") pageInventory(); } });

  const sizeTop = () => document.documentElement.style.setProperty("--top", document.querySelector(".top").offsetHeight + "px");
  addEventListener("resize", sizeTop);

  $("foot-prices").textContent = "Steam Market prices, updated " + new Date(updated + "T12:00:00").toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }) + ".";
  settle(); // a tab closed mid-roll still gets its skin
  paintSound();
  route();
  sizeTop();
})();

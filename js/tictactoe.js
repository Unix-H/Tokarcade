(() => {
  const $ = (id) => document.getElementById(id);
  const cellsEl = $("cells"), strike = $("strike"), status = $("status");
  const scoreEl = $("score"), bestEl = $("best");
  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const X = '<svg viewBox="0 0 60 60"><path pathLength="1" d="M10 10L50 50"/><path pathLength="1" d="M50 10L10 50"/></svg>';
  const O = '<svg viewBox="0 0 60 60"><circle pathLength="1" cx="30" cy="30" r="21"/></svg>';

  let cpuTimer, board, over, mode = "easy", busy, startsFirst = true;
  const tally = { w: 0, d: 0, l: 0 };
  let sessionWins = 0;
  let total = Toka.best("tictactoe") || 0;
  bestEl.textContent = total;

  const btns = [];
  for (let i = 0; i < 9; i++) {
    const b = document.createElement("button");
    b.className = "tcell";
    b.setAttribute("aria-label", "Square " + (i + 1));
    b.addEventListener("click", () => human(i));
    cellsEl.appendChild(b);
    btns.push(b);
  }

  function winner(b) {
    for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { p: b[l[0]], line: l };
    return b.every(Boolean) ? { p: "draw" } : null;
  }

  function mark(i, p) {
    board[i] = p;
    btns[i].innerHTML = p === "X" ? X : O;
    btns[i].classList.toggle("o", p === "O");
    btns[i].disabled = true;
  }

  function newRound() {
    clearTimeout(cpuTimer);
    board = Array(9).fill(null);
    over = false; busy = false;
    strike.innerHTML = "";
    btns.forEach((b) => { b.innerHTML = ""; b.disabled = false; b.className = "tcell"; });
    status.textContent = startsFirst ? "Your move" : "CPU is thinking…";
    if (!startsFirst) { busy = true; cpuTimer = setTimeout(cpu, 450); }
    startsFirst = !startsFirst; // alternate who opens next round
  }

  function human(i) {
    if (over || busy || board[i]) return;
    mark(i, "X");
    if (!finish()) {
      busy = true;
      status.textContent = "CPU is thinking…";
      cpuTimer = setTimeout(cpu, 400);
    }
  }

  function cpu() {
    if (over) return;
    const free = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    const i = mode === "easy" ? free[Math.floor(Math.random() * free.length)] : best(board);
    mark(i, "O");
    busy = false;
    if (!finish()) status.textContent = "Your move";
  }

  function finish() {
    const r = winner(board);
    if (!r) return false;
    over = true;
    if (r.p === "draw") {
      tally.d++; status.textContent = "Draw";
    } else {
      const [a, , c] = r.line;
      const cx = (i) => 50 + (i % 3) * 100, cy = (i) => 50 + Math.floor(i / 3) * 100;
      const dx = Math.sign(cx(c) - cx(a)) * 30, dy = Math.sign(cy(c) - cy(a)) * 30;
      strike.innerHTML = `<path pathLength="1" d="M${cx(a) - dx} ${cy(a) - dy}L${cx(c) + dx} ${cy(c) + dy}"/>`;
      btns.forEach((b, i) => { if (!r.line.includes(i)) b.classList.add("dim"); });
      if (r.p === "X") {
        tally.w++; sessionWins++; total++;
        status.textContent = "You win";
        Toka.bump(scoreEl, sessionWins);
        Toka.set("tictactoe", { v: total });
        bestEl.textContent = total;
      } else {
        tally.l++; status.textContent = "CPU wins";
      }
    }
    btns.forEach((b) => (b.disabled = true));
    $("w").textContent = tally.w; $("d").textContent = tally.d; $("l").textContent = tally.l;
    return true;
  }

  /* minimax: CPU is O (maximiser) */
  function best(b) {
    let bestScore = -Infinity, move = -1;
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = "O";
      const s = minimax(b, false, 0);
      b[i] = null;
      if (s > bestScore) { bestScore = s; move = i; }
    }
    return move;
  }
  function minimax(b, isO, depth) {
    const r = winner(b);
    if (r) return r.p === "O" ? 10 - depth : r.p === "X" ? depth - 10 : 0;
    let s = isO ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = isO ? "O" : "X";
      const v = minimax(b, !isO, depth + 1);
      b[i] = null;
      s = isO ? Math.max(s, v) : Math.min(s, v);
    }
    return s;
  }

  $("seg").addEventListener("click", (e) => {
    const m = e.target.dataset.m;
    if (!m || m === mode) return;
    mode = m;
    document.querySelectorAll("#seg button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
    startsFirst = true;
    newRound();
  });
  $("again").addEventListener("click", newRound);
  addEventListener("keydown", (e) => { if (e.key === "Enter" && over) newRound(); });

  newRound();
})();

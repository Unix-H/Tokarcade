/* Block Buster rules. No DOM in here, so it can be tested in Node.
 *
 * Pieces, line multipliers, combo tiers and the all-clear bonus follow what bot
 * authors measured in the real Block Blast (miles2542/ultimate-block-blast-bot).
 * Frequencies start from rshk941/block-blast-solver's estimate, with the rarest shapes raised.
 * Hungry Studio publishes none of these, so they are the best known values, not official ones.
 */
(function (root) {
  "use strict";
  const N = 8;
  const COLORS = 8; // 1..8, 0 is empty

  /* family: [weight of the whole family, its fixed orientations] */
  const FAMILIES = {
    dot: [1, ["#"]],
    line2: [2, ["##", "#/#"]],
    line3: [4, ["###", "#/#/#"]],
    line4: [10, ["####", "#/#/#/#"]],
    line5: [12, ["#####", "#/#/#/#/#"]],
    square2: [9, ["##/##"]],
    square3: [7, ["###/###/###"]],
    rect: [14, ["###/###", "##/##/##"]],
    corner3: [5, ["##/#.", "##/.#", "#./##", ".#/##"]],
    corner5: [8, ["###/#../#..", "###/..#/..#", "#../#../###", "..#/..#/###"]],
    tee: [6, ["###/.#.", ".#./###", "#./##/#.", ".#/##/.#"]],
    ess: [2.5, [".##/##.", "#./##/.#"]],
    zed: [2.5, ["##./.##", ".#/##/#."]],
    jay: [8, ["#../###", "###/..#", ".#/.#/##", "##/#./#."]],
    ell: [8, ["..#/###", "###/#..", "##/.#/.#", "#./#./##"]],
    diag2: [1, ["#./.#", ".#/#."]],
    diag3: [1.5, ["#../.#./..#", "..#/.#./#.."]],
  };

  const SHAPES = [];
  const FAMILY_LIST = Object.keys(FAMILIES).map((name) => {
    const [weight, forms] = FAMILIES[name];
    const ids = forms.map((f) => {
      const rows = f.split("/");
      const cells = [];
      rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === "#") cells.push([r, c]); }));
      SHAPES.push({ id: SHAPES.length, family: name, h: rows.length, w: rows[0].length, cells });
      return SHAPES.length - 1;
    });
    return { name, weight, ids };
  });

  const emptyBoard = () => new Array(N * N).fill(0);

  function fits(board, shape, r, c) {
    if (r < 0 || c < 0 || r + shape.h > N || c + shape.w > N) return false;
    for (const [y, x] of shape.cells) if (board[(r + y) * N + c + x]) return false;
    return true;
  }
  function fitsAnywhere(board, shape) {
    for (let r = 0; r <= N - shape.h; r++) for (let c = 0; c <= N - shape.w; c++) if (fits(board, shape, r, c)) return true;
    return false;
  }
  /** full rows and columns, judged together so crossing lines clear at once */
  function fullLines(board) {
    const rows = [], cols = [];
    for (let i = 0; i < N; i++) {
      let a = true, b = true;
      for (let j = 0; j < N; j++) { if (!board[i * N + j]) a = false; if (!board[j * N + i]) b = false; }
      if (a) rows.push(i);
      if (b) cols.push(i);
    }
    return { rows, cols };
  }
  /** returns the new board and what cleared; does not touch the old one */
  function drop(board, shape, r, c, color) {
    const next = board.slice();
    for (const [y, x] of shape.cells) next[(r + y) * N + c + x] = color;
    const filled = next.slice();
    const { rows, cols } = fullLines(next);
    const cleared = new Set();
    rows.forEach((y) => { for (let x = 0; x < N; x++) cleared.add(y * N + x); });
    cols.forEach((x) => { for (let y = 0; y < N; y++) cleared.add(y * N + x); });
    cleared.forEach((i) => { next[i] = 0; });
    return { board: next, filled, rows, cols, cleared: [...cleared] };
  }

  /* ── scoring ── */
  const LINE_MULT = [0, 1, 2, 6, 6, 6, 6]; // lines cleared by one drop
  const BASE = 26.4;
  const ALL_CLEAR = 300;
  const tier = (combo) => (combo < 5 ? 1 : combo < 10 ? 1.5 : 2);
  /** combo counts this clear as well */
  function lineScore(lines, combo) {
    if (!lines) return 0;
    return Math.floor(BASE * LINE_MULT[Math.min(lines, 6)] * (combo + 1) * tier(combo) + 0.5);
  }

  /* ── dealing ── */
  function weightedIndex(weights, rng) {
    let x = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) if ((x -= weights[i]) < 0) return i;
    return weights.length - 1;
  }
  /** three pieces from three different families, in three different colours */
  function randomSet(rng) {
    const pool = FAMILY_LIST.slice();
    const colors = Array.from({ length: COLORS }, (_, i) => i + 1);
    const set = [];
    for (let k = 0; k < 3; k++) {
      const f = pool.splice(weightedIndex(pool.map((p) => p.weight), rng), 1)[0];
      const color = colors.splice(Math.floor(rng() * colors.length), 1)[0];
      set.push({ shape: f.ids[Math.floor(rng() * f.ids.length)], color });
    }
    return set;
  }
  /** can all pieces be placed in some order, counting lines cleared on the way? */
  function solvable(board, shapes, budget) {
    if (!shapes.length) return true;
    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i], rest = shapes.filter((_, j) => j !== i);
      for (let r = 0; r <= N - s.h; r++) for (let c = 0; c <= N - s.w; c++) {
        if (--budget.n < 0) return false;
        if (fits(board, s, r, c) && solvable(drop(board, s, r, c, 1).board, rest, budget)) return true;
      }
    }
    return false;
  }
  function deal(board, rng) {
    let partial = null;
    for (let t = 0; t < 60; t++) {
      const set = randomSet(rng);
      const shapes = set.map((p) => SHAPES[p.shape]);
      if (!partial && shapes.some((s) => fitsAnywhere(board, s))) partial = set;
      shapes.sort((a, b) => b.cells.length - a.cells.length);
      if (solvable(board, shapes, { n: 6000 })) return set;
    }
    return partial || randomSet(rng); // the board is simply too full for a fair set
  }

  /* ── game ── */
  function create(rng) {
    rng = rng || Math.random;
    const g = {
      board: emptyBoard(), tray: [null, null, null], score: 0, combo: 0, setCleared: false,
      over: false, bestCombo: 0, lines: 0,
    };
    g.tray = deal(g.board, rng);

    g.canPlace = (slot, r, c) => !g.over && !!g.tray[slot] && fits(g.board, SHAPES[g.tray[slot].shape], r, c);
    g.usable = (slot) => !!g.tray[slot] && fitsAnywhere(g.board, SHAPES[g.tray[slot].shape]);

    g.place = (slot, r, c) => {
      if (!g.canPlace(slot, r, c)) return null;
      const piece = g.tray[slot], shape = SHAPES[piece.shape];
      const d = drop(g.board, shape, r, c, piece.color);
      const lines = d.rows.length + d.cols.length;
      g.board = d.board;
      g.tray[slot] = null;
      if (lines) { g.combo++; g.setCleared = true; g.lines += lines; g.bestCombo = Math.max(g.bestCombo, g.combo); }
      const linePoints = lineScore(lines, g.combo);
      const allClear = lines > 0 && g.board.every((v) => !v);
      const gained = shape.cells.length + linePoints + (allClear ? ALL_CLEAR : 0);
      g.score += gained;

      const res = {
        piece, shape, r, c, lines, rows: d.rows, cols: d.cols, cleared: d.cleared, filled: d.filled,
        placePoints: shape.cells.length, linePoints, allClear, gained, combo: lines ? g.combo : 0, comboLost: 0, dealt: false,
      };
      if (g.tray.every((p) => !p)) {
        // a combo only dies when a whole set of three clears nothing
        if (!g.setCleared) { res.comboLost = g.combo; g.combo = 0; }
        g.setCleared = false;
        g.tray = deal(g.board, rng);
        res.dealt = true;
      }
      g.over = !g.tray.some((p, i) => p && g.usable(i));
      res.over = g.over;
      return res;
    };

    g.save = () => ({ v: 1, board: g.board, tray: g.tray, score: g.score, combo: g.combo, setCleared: g.setCleared, bestCombo: g.bestCombo, lines: g.lines });
    g.load = (s) => {
      const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
      const ok = s && s.v === 1 && Array.isArray(s.board) && s.board.length === N * N && s.board.every((x) => int(x, 0, COLORS)) &&
        Array.isArray(s.tray) && s.tray.length === 3 && s.tray.every((p) => p === null || (p && int(p.shape, 0, SHAPES.length - 1) && int(p.color, 1, COLORS))) &&
        s.tray.some(Boolean) && [s.score, s.combo, s.bestCombo, s.lines].every((x) => int(x, 0, 1e9));
      if (!ok) return false;
      g.board = s.board.slice(); g.tray = s.tray.map((p) => p && { shape: p.shape, color: p.color });
      g.score = s.score; g.combo = s.combo; g.setCleared = !!s.setCleared; g.bestCombo = s.bestCombo; g.lines = s.lines;
      g.over = !g.tray.some((p, i) => p && g.usable(i));
      return !g.over;
    };
    return g;
  }

  const api = { N, COLORS, SHAPES, FAMILY_LIST, emptyBoard, fits, fitsAnywhere, fullLines, drop, lineScore, randomSet, solvable, deal, create, ALL_CLEAR };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BB = api;
})(typeof window !== "undefined" ? window : globalThis);

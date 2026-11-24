/* Tokarcade · shared helpers (scores in localStorage, corner brackets) */
const Toka = {
  get(game) {
    try { return JSON.parse(localStorage.getItem("toka:" + game)); } catch (e) { return null; }
  },
  set(game, obj) {
    try { localStorage.setItem("toka:" + game, JSON.stringify(obj)); } catch (e) { /* storage unavailable */ }
  },
  best(game) {
    const c = this.get(game);
    return c ? c.v : null;
  },
  /** Saves value if it beats the stored best. Returns true on a new best. */
  submit(game, value, opts = {}) {
    const cur = this.get(game);
    const better = !cur || (opts.lower ? value < cur.v : value > cur.v);
    if (better) this.set(game, { v: value });
    return better;
  },
  bump(el, text) {
    el.textContent = text;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  },
};

document.querySelectorAll(".stage").forEach((s) => {
  ["tl", "tr", "bl", "br"].forEach((p) => {
    const i = document.createElement("i");
    i.className = "c " + p;
    s.appendChild(i);
  });
});

/* keep arrow keys / space from scrolling the page while playing */
window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key) && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
    if (document.body.classList.contains("game")) e.preventDefault();
  }
});

/* Tokarcade · home page */
(() => {
  /* best scores on the cards */
  const fmt = {
    snake: (v) => v + " pts",
    "2048": (v) => v + " pts",
    tictactoe: (v) => v + (v === 1 ? " win" : " wins"),
    reaction: (v) => v + " ms",
    breakout: (v) => v + " pts",
    blockbuster: (v) => v + " pts",
  };
  document.querySelectorAll("[data-best]").forEach((el) => {
    const k = el.dataset.best;
    const v = Toka.best(k);
    if (v != null && fmt[k]) el.textContent = "Best " + fmt[k](v);
  });

  /* ticker: duplicate content so the loop is seamless */
  const track = document.getElementById("ticker");
  track.innerHTML += track.innerHTML;

  /* cards reveal as they scroll in */
  const cards = document.querySelectorAll(".card");
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  cards.forEach((c) => io.observe(c));
  /* if observer never fires (e.g. printing), don't leave cards hidden */
  setTimeout(() => cards.forEach((c) => c.classList.add("in")), 2500);

  /* grid-cell trail: cells under the cursor light up and fade */
  const cv = document.getElementById("trail");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(pointer: fine)").matches) {
    cv.remove();
    return;
  }
  const ctx = cv.getContext("2d");
  const SIZE = 44;
  const cells = new Map();
  let running = false, last = 0, dpr = 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener("resize", resize);

  addEventListener("pointermove", (e) => {
    const cx = Math.floor(e.clientX / SIZE), cy = Math.floor(e.clientY / SIZE);
    cells.set(cx + "," + cy, 1);
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
  });

  function tick(now) {
    const dt = Math.min(now - last, 50);
    last = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const [key, a] of cells) {
      const [x, y] = key.split(",").map(Number);
      ctx.fillStyle = `rgba(47, 99, 255, ${a * 0.32})`;
      ctx.fillRect(x * SIZE + 1, y * SIZE + 1, SIZE - 1, SIZE - 1);
      const n = a - dt / 900;
      if (n <= 0) cells.delete(key); else cells.set(key, n);
    }
    if (cells.size) requestAnimationFrame(tick); else running = false;
  }
})();

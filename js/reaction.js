(() => {
  const $ = (id) => document.getElementById(id);
  const pad = $("pad"), padT = $("pad-t"), padS = $("pad-s");
  const lastEl = $("score"), bestEl = $("best"), avgEl = $("avg"), countEl = $("count"), histEl = $("hist");

  let state = "idle"; // idle | wait | go | early | result
  let timer, goAt;
  const times = [];

  const b0 = Toka.best("reaction");
  bestEl.textContent = b0 == null ? "–" : b0 + " ms";

  function set(s, title, sub) {
    state = s;
    pad.className = "pad s-" + (s === "result" ? "idle" : s);
    padT.textContent = title;
    padS.textContent = sub;
  }

  function arm() {
    set("wait", "Wait for it…", "Don’t click yet");
    timer = setTimeout(() => {
      set("go", "NOW", "Click!");
      requestAnimationFrame(() => (goAt = performance.now()));
    }, 1500 + Math.random() * 2800);
  }

  function press() {
    if (state === "idle" || state === "early" || state === "result") return arm();
    if (state === "wait") {
      clearTimeout(timer);
      return set("early", "Too soon", "Click to try again");
    }
    if (state === "go") {
      const ms = Math.max(1, Math.round(performance.now() - goAt));
      times.push(ms);
      Toka.bump(lastEl, ms + " ms");
      if (Toka.submit("reaction", ms, { lower: true })) bestEl.textContent = ms + " ms";
      set("result", ms + " ms", rate(ms) + " · click to go again");
      stats();
    }
  }

  const rate = (ms) => (ms < 180 ? "Remarkable" : ms < 230 ? "Very quick" : ms < 300 ? "Solid" : ms < 400 ? "Average" : "Take your time");

  function stats() {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    avgEl.textContent = avg + " ms";
    countEl.textContent = times.length;
    const recent = times.slice(-8);
    const max = Math.max(500, ...recent);
    histEl.innerHTML = recent.map((t) => `<i title="${t} ms"><b style="height:${Math.max(6, (1 - t / max) * 100 + 12)}%"></b></i>`).join("");
  }

  pad.addEventListener("pointerdown", (e) => { e.preventDefault(); press(); });
  addEventListener("keydown", (e) => { if (e.key === " " && !e.repeat) press(); });
})();

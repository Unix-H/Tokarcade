#!/usr/bin/env python3
"""Rebuild data.js (case contents + market prices) and fetch any missing images.

    python3 cs2/tools/update_data.py [folder-with-cached-json]

Contents: github.com/ByMykel/CSGO-API (extracted from the game files)
Prices:   prices.csgotrader.app (daily dump of the Steam Community Market and others)
Images:   Steam CDN, resized to webp with `cwebp` (brew install webp)
"""
import concurrent.futures as cf, datetime, gzip, json, os, re, subprocess, sys, tempfile, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = sys.argv[1] if len(sys.argv) > 1 else None
API = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/"
PRICES = "https://prices.csgotrader.app/latest/"
SRC = {
    "crates": (API + "crates.json", "crates.json"),
    "skins": (API + "skins.json", "skins.json"),
    "steam": (PRICES + "steam.json", "trader_steam.json"),
    "buff": (PRICES + "buff163.json", "trader_buff.json"),
    "skinport": (PRICES + "skinport.json", "trader_skinport.json"),
    "csfloat": (PRICES + "csfloat.json", "t_csfloat.json"),
    "csmoney": (PRICES + "csmoney.json", "t_csmoney.json"),
}
WEARS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"]
BOUNDS = [0, 0.07, 0.15, 0.38, 0.45, 1]
GRADES = ["Mil-Spec Grade", "Restricted", "Classified", "Covert"]
# emblem colour of each case, used to tint its page
ACCENT = {
    "fever-case": "#e8408f", "gallery-case": "#1fb58a", "kilowatt-case": "#ff9a3d", "revolution-case": "#e6b84f",
    "recoil-case": "#f0a63a", "dreams-nightmares-case": "#d98fa3", "operation-riptide-case": "#3aa0e0",
    "snakebite-case": "#ff6a2e", "operation-broken-fang-case": "#d9b26a", "fracture-case": "#a06fd6",
    "prisma-2-case": "#f08a5d", "cs20-case": "#f4d73e", "shattered-web-case": "#8b62dd", "prisma-case": "#5ec48f",
    "danger-zone-case": "#e23b3b", "clutch-case": "#cfd4da", "operation-hydra-case": "#8bb53f",
    "operation-wildfire-case": "#ff8c1f", "falchion-case": "#c2333f", "esports-2013-case": "#d2502f",
    "esports-2013-winter-case": "#3f86e8", "esports-2014-summer-case": "#8fdc3c", "spectrum-case": "#c4a1ff",
    "spectrum-2-case": "#b9b4ff", "operation-breakout-weapon-case": "#7fc04a", "operation-vanguard-weapon-case": "#58b8e8",
    "operation-phoenix-weapon-case": "#e8392f", "operation-bravo-case": "#ff5a36", "cs-go-weapon-case": "#f29a2e",
    "cs-go-weapon-case-2": "#f29a2e", "cs-go-weapon-case-3": "#f29a2e",
}
# the game file's first_sale_date is wrong for these
RELEASED = {
    "cs-go-weapon-case": "2013-08-14", "cs-go-weapon-case-2": "2013-11-08", "cs-go-weapon-case-3": "2014-02-12",
    "esports-2013-case": "2013-08-14", "esports-2013-winter-case": "2013-12-18", "esports-2014-summer-case": "2014-07-10",
    "dreams-nightmares-case": "2022-01-20",
}
STEAM_CAP = 1800  # Steam listings are capped around here, so sales stop reflecting real value


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=90) as r:
        b = r.read()
    return gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b


def load(key):
    url, name = SRC[key]
    if CACHE:
        with open(os.path.join(CACHE, name), encoding="utf-8") as f:
            return json.load(f)
    print("downloading", url)
    return json.loads(fetch(url))


D = {k: load(k) for k in SRC}
SK = {s["id"]: s for s in D["skins"]}


def low_median(v):
    v = sorted(v)
    return v[(len(v) - 1) // 2]


def steam_price(h):
    t = D["steam"].get(h) or {}
    v = [t[k] for k in ("last_24h", "last_7d", "last_30d", "last_90d") if t.get(k)]
    if not v:
        return None
    m = low_median(v)
    return v[0] if m / 2 <= v[0] <= m * 2 else m  # ignore one-off outlier sales


def third_party(h, phase):
    """Lowest trustworthy ask on other markets."""
    def pick(o):
        if o is None:
            return None
        if isinstance(o, dict):
            return (o.get("doppler") or {}).get(phase) if phase else o.get("price")
        return None if phase else o
    buff, flt = D["buff"].get(h) or {}, D["csfloat"].get(h) or {}
    bid = max([x for x in (pick(buff.get("highest_order")), pick(flt.get("highest_order"))) if x], default=0)
    others = [pick(flt.get("starting_at")), pick(D["csmoney"].get(h)),
              (D["skinport"].get(h) or {}).get("starting_at") if not phase else None]
    asks = [x for x in others if x]
    b = pick(buff.get("starting_at"))
    if b and (asks or b <= bid * 2):  # a lone Buff ask with no bid near it is usually a placeholder
        asks.append(b)
    return min(asks) if asks else None


def price(h, phase):
    """-> (usd, source) ; s = Steam Market, m = other market"""
    t = third_party(h, phase)
    if phase:  # Steam lumps all Doppler phases together
        if t:
            return t, "m"
        s = steam_price(h) if phase.startswith("Phase") else None
        return (s, "s") if s else None
    s = steam_price(h)
    if s and s < STEAM_CAP:
        return s, "s"
    if t and (not s or t > s):
        return t, "m"
    return (s, "s") if s else None


def possible_wears(s):
    if "|" not in s["name"]:
        return None  # vanilla knife: no wear in its market name
    lo, hi = s["min_float"], s["max_float"]
    return [i for i in range(5) if lo < BOUNDS[i + 1] and hi > BOUNDS[i]]


stats = {"s": 0, "m": 0, "e": 0}


def skin_entry(sid, rarity):
    s = SK[sid]
    phase = s.get("phase")
    name = s["name"].replace("★ ", "")
    weapon, _, finish = name.partition(" | ")
    star = "★ " if s["name"].startswith("★") else ""
    wears = possible_wears(s)
    slots = range(5) if wears is not None else [None]

    def row(st):
        out = []
        for i in slots:
            if wears is not None and i not in wears:
                out.append(None)
                continue
            h = star + ("StatTrak™ " if st else "") + name + (f" ({WEARS[i]})" if i is not None else "")
            out.append(price(h, phase) or "?")
        return out

    normal, strk = row(False), row(True) if s["stattrak"] else None
    if strk and rarity == 4:  # joke listings: StatTrak barely changes a knife's value
        strk = ["?" if isinstance(x, tuple) and x[1] == "m" and isinstance(n, tuple) and x[0] > n[0] * 2.5 else x
                for x, n in zip(strk, normal)]

    def fill(r, ref):
        """No market anywhere has a price: borrow the closest real one and flag it 'e' (estimate)."""
        known = [j for j, x in enumerate(r) if isinstance(x, tuple)]
        res = []
        for j, x in enumerate(r):
            if x == "?":
                if ref and isinstance(ref[j], tuple):
                    x = (ref[j][0], "e")
                elif known:
                    x = (r[min(known, key=lambda q: abs(q - j))][0], "e")
                else:
                    x = None
            res.append(x)
        return res

    normal = fill(normal, None if any(isinstance(x, tuple) for x in normal) else strk)
    if strk:
        strk = fill(strk, normal)
    for r in (normal, strk or []):
        for x in r:
            if x:
                stats[x[1]] += 1
    allowed = [i for i in slots if i is None or i in wears]
    for r in filter(None, (normal, strk)):
        for i in allowed:
            assert r[i or 0] is not None, ("no price at all", s["name"], phase, i)
    e = {"k": sid.removeprefix("skin-"), "w": weapon, "f": finish or "Vanilla", "r": rarity,
         "lo": s["min_float"] or 0, "hi": s["max_float"] or 1,
         "p": [x and round(x[0] * 100) for x in normal], "ps": "".join(x[1] if x else "-" for x in normal)}
    if finish == "":
        e["v"], e["lo"], e["hi"] = 1, 0, 1
    if phase:
        e["ph"] = phase
    if strk:
        e["q"] = [x and round(x[0] * 100) for x in strk]
        e["qs"] = "".join(x[1] if x else "-" for x in strk)
    return e


def iso(d):
    y, m, dd = re.split(r"[-/]", d)
    return f"{y}-{int(m):02d}-{int(dd):02d}"


skins, index, cases, images = [], {}, [], {}


def add(x, rarity):
    sid = x["id"]
    if sid not in index:
        index[sid] = len(skins)
        skins.append(skin_entry(sid, rarity))
        images[f"skins/{skins[-1]['k']}.webp"] = SK[sid]["image"]
    assert skins[index[sid]]["r"] == rarity, x["name"]
    return index[sid]


for c in sorted((c for c in D["crates"] if c["type"] == "Case"), key=lambda c: iso(c["first_sale_date"]), reverse=True):
    slug = re.sub(r"[^a-z0-9]+", "-", c["name"].lower()).strip("-")
    p = price(c["market_hash_name"], None)
    assert p and p[1] == "s", c["name"]
    ll = c.get("loot_list") or {}
    rare_img = ll.get("image") or "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/weapon_cases/default_rare_item_png.png"
    rare_file = "crates/" + os.path.basename(rare_img).replace("_png.png", "") + ".webp"
    images[rare_file] = rare_img
    images[f"crates/{slug}.webp"] = c["image"]
    gloves = any(w in c["contains_rare"][0]["name"] for w in ("Gloves", "Wraps"))
    cases.append({
        "id": slug, "name": c["name"], "date": RELEASED.get(slug) or iso(c["first_sale_date"]), "accent": ACCENT.get(slug, "#e4ae39"), "price": round(p[0] * 100),
        "rareImg": rare_file, "rareName": "Gloves" if gloves else "Knives",
        "items": [add(x, GRADES.index(x["rarity"]["name"])) for x in c["contains"]],
        "rare": [add(x, 4) for x in c["contains_rare"]],
    })

cases.sort(key=lambda c: c["date"], reverse=True)

# ── images ──
def grab(item):
    path, url = os.path.join(ROOT, "img", item[0]), item[1]
    if os.path.exists(path):
        return
    case = item[0].startswith("crates/") and "steamstatic" in url
    try:
        data = fetch(url if case else url + "/512fx384f" if "steamstatic" in url else url)
    except OSError:  # Steam's resizer 404s now and then; the original is always there
        data = fetch(url)
    with tempfile.NamedTemporaryFile(suffix=".png") as t:
        t.write(data); t.flush()
        w = int.from_bytes(data[16:20], "big") if data[:4] == b"\x89PNG" else 0
        size = ["-resize", "512", "0"] if w > 512 and not case else []
        if case:  # trim the transparent border
            h = int.from_bytes(data[20:24], "big")
            a = subprocess.run(["ffmpeg", "-v", "error", "-i", t.name, "-vf", "format=rgba,extractplanes=a", "-f", "rawvideo", "-"],
                               capture_output=True, check=True).stdout
            ys = [y for y in range(h) if max(a[y * w:(y + 1) * w]) > 16]
            xs = [x for x in range(w) if max(a[x::w]) > 16]
            size = ["-crop", str(xs[0]), str(ys[0]), str(xs[-1] - xs[0] + 1), str(ys[-1] - ys[0] + 1)]
        subprocess.run(["cwebp", "-quiet", "-q", "82", "-alpha_q", "90", *size, t.name, "-o", path], check=True)


os.makedirs(os.path.join(ROOT, "img/skins"), exist_ok=True)
os.makedirs(os.path.join(ROOT, "img/crates"), exist_ok=True)
failed = []
with cf.ThreadPoolExecutor(8) as ex:
    futs = {ex.submit(grab, i): i for i in images.items()}
    for f in cf.as_completed(futs):
        if f.exception():
            failed.append((futs[f], f.exception()))
if failed:
    sys.exit(f"{len(failed)} images failed, run again: {failed[:3]}")


out = {"updated": datetime.date.today().isoformat(), "cases": cases, "skins": skins}
with open(os.path.join(ROOT, "data.js"), "w", encoding="utf-8") as f:
    f.write("/* generated by tools/update_data.py */\nwindow.CS2_DATA=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(len(cases), "cases,", len(skins), "skins,", len(images), "images; prices: steam %(s)d, other markets %(m)d, estimated %(e)d" % stats)

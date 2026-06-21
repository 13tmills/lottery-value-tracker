// Odds visualizer. Renders odds/lines as a field of dots — one red (your win)
// among the rest white — using vertically tiled canvases that draw lazily as
// they scroll into view, so even hundreds of millions of dots stay responsive.

const BG = "#0d1117";
const WHITE = "#ffffff";
const RED = "#ff3b30";

const TILE_CSS = 2400;            // px tall per tile canvas
const PRERENDER_MARGIN = "1500px"; // draw/free tiles this far outside viewport

const els = {};
let st = null;
let observer = null;
let debounce = null;

function param(name) {
  return new URLSearchParams(location.search).get(name);
}

// Adaptive dot size + pitch (centre-to-centre spacing) based on how many dots
// we need to fit. Fewer dots → larger, rounder dots; millions → 1px specks.
function sizing(total) {
  if (total <= 1500)     return { pitch: 24, dot: 17 };
  if (total <= 30000)    return { pitch: 11, dot: 7 };
  if (total <= 500000)   return { pitch: 5,  dot: 3 };
  if (total <= 5000000)  return { pitch: 3,  dot: 2 };
  return { pitch: 2, dot: 1 };
}

function init() {
  els.title = document.getElementById("viz-title");
  els.sub = document.getElementById("viz-sub");
  els.stats = document.getElementById("stats");
  els.lines = document.getElementById("lines");
  els.locate = document.getElementById("locate");
  els.area = document.getElementById("dotarea");
  els.back = document.getElementById("back");
  els.hint = document.getElementById("scroll-hint");
  els.tier = document.getElementById("tier");

  const key = param("game");
  const meta = GAME_META[key];
  if (!meta) {
    els.title.textContent = "Lottery not found";
    els.area.innerHTML = `<div class="error" style="margin:1rem">Unknown game "${key ?? ""}".
      <a href="index.html">Back to all lotteries</a>.</div>`;
    return;
  }
  els.back.href = `game.html?game=${key}`;
  els.back.textContent = `← Back to ${meta.label}`;

  loadData()
    .then((data) => {
      const g = data.games[key];
      let tiers, ticket, base;

      if (g) {
        // National game: full prize/jackpot data from data.json.
        const pt = g.prize_tiers || [];
        const overallOdds = 1 / [g.odds_jackpot, ...pt.map((t) => t.odds)].reduce((s, o) => s + 1 / o, 0);
        const minPrize = pt.length ? Math.min(...pt.map((t) => t.prize)) : 0;
        tiers = [
          { value: "any", label: "Any prize", odds: overallOdds, kind: "any" },
          { value: "jackpot", label: `Jackpot (5 + ${meta.specialName})`, odds: g.odds_jackpot, kind: "jackpot" },
          ...pt.map((t) => ({ value: t.match, label: tierLabel(t.match, meta), odds: t.odds, prize: t.prize, kind: "secondary" })),
        ];
        ticket = g.ticket_price;
        base = { mult: g.multiplier, jackpot: g.jackpot, cash: g.cash_value, minPrize, odds: g.odds_jackpot };
      } else {
        // State game: tiers (label + odds) derived from GAME_META.
        const vt = vizTiers(meta);
        if (!vt) throw new Error(`no odds to visualize for ${key}`);
        tiers = vt.map((t, i) => ({
          value: String(i), label: t.label, odds: t.odds,
          kind: /any prize/i.test(t.label) ? "any" : "secondary",
        }));
        ticket = (meta.ev && meta.ev.ticket_price) || 1;
        base = { minPrize: 0, odds: tiers[0].odds };
      }

      els.tier.innerHTML = tiers
        .map((t) => `<option value="${t.value}">${t.label} — 1 in ${Math.round(t.odds).toLocaleString()}</option>`)
        .join("");

      st = { key, meta, ticket, tiers, ...base, tierLabel: tiers[0].label };
      els.title.textContent = `${meta.label} — odds visualizer`;
      setMeta({
        title: `${meta.label} Odds, Visualized | NumbersIntel`,
        description: `See ${meta.label} odds as a field of dots — one red winning dot among millions. Pick a prize tier and how many lines you buy.`,
        url: `${SITE}/visualizer.html?game=${key}`,
      });
      els.sub.textContent = `${meta.draws} · $${ticket} per line`;

      const tierParam = param("tier");
      // Default to the jackpot (national) or the longest-odds tier (state games).
      const defaultTier = g ? "jackpot" : tiers.reduce((a, b) => (b.odds > a.odds ? b : a)).value;
      els.tier.value = tierParam && tiers.some((t) => t.value === tierParam) ? tierParam : defaultTier;
      const fromUrl = parseInt(param("lines"), 10);
      if (fromUrl > 0) els.lines.value = fromUrl;

      observer = new IntersectionObserver(onIntersect, { rootMargin: `${PRERENDER_MARGIN} 0px` });
      els.tier.addEventListener("change", build);
      els.lines.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(build, 250);
      });
      els.locate.addEventListener("click", locate);
      window.addEventListener("resize", () => {
        clearTimeout(debounce);
        debounce = setTimeout(build, 200);
      });

      build();
    })
    .catch((err) => {
      els.title.textContent = meta.label;
      els.area.innerHTML = `<div class="error" style="margin:1rem">Couldn't load data.json
        (${err.message}). Serve over HTTP, e.g. <code>python -m http.server</code>.</div>`;
      console.error(err);
    });
}

// Recompute everything and lay out (empty) tile placeholders. The actual dots
// draw lazily via the IntersectionObserver.
function build() {
  const tier = st.tiers.find((t) => t.value === els.tier.value) || st.tiers[0];
  const odds = tier.odds;
  const maxLines = Math.max(1, Math.floor(odds));
  els.lines.max = maxLines;

  const lines = Math.min(Math.max(parseInt(els.lines.value, 10) || 1, 1), maxLines);
  els.lines.value = lines;
  const total = Math.max(1, Math.round(odds / lines));
  const { pitch, dot } = sizing(total);

  const width = els.area.clientWidth || 800;
  const columns = Math.max(1, Math.floor(width / pitch));

  st = {
    ...st,
    odds,
    tierObj: tier,
    tierLabel: tier.label,
    lines,
    total,
    pitch,
    dot,
    columns,
    redIndex: Math.floor(Math.random() * total),
  };

  if (observer) observer.disconnect();
  els.area.innerHTML = "";

  // Marker overlay (the ring shown by "Find the winning dot").
  els.marker = document.createElement("div");
  els.marker.className = "red-marker";
  els.area.appendChild(els.marker);

  const tileRows = Math.max(1, Math.floor(TILE_CSS / pitch));
  const dotsPerTile = columns * tileRows;
  const tileCount = Math.ceil(total / dotsPerTile);

  for (let t = 0; t < tileCount; t++) {
    const start = t * dotsPerTile;
    const end = Math.min(total, start + dotsPerTile);
    const rows = Math.ceil((end - start) / columns);
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.style.height = `${rows * pitch}px`;
    tile.dataset.start = start;
    tile.dataset.end = end;
    els.area.appendChild(tile);
    observer.observe(tile);
  }

  renderStats();
  els.marker.style.display = "none";

  const totalRows = Math.ceil(total / columns);
  els.hint.textContent =
    total > 5_000_000 ? `${totalRows.toLocaleString()} rows — keep scrolling…` : "";
}

function onIntersect(entries) {
  for (const e of entries) {
    if (e.isIntersecting) drawTile(e.target);
    else freeTile(e.target);
  }
}

function drawTile(tile) {
  if (tile.firstChild) return; // already drawn
  const start = +tile.dataset.start;
  const end = +tile.dataset.end;
  const { columns, pitch, dot, redIndex } = st;
  const rows = Math.ceil((end - start) / columns);

  const canvas = document.createElement("canvas");
  canvas.width = columns * pitch;
  canvas.height = rows * pitch;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const round = dot >= 5;
  const r = dot / 2;
  ctx.fillStyle = WHITE;
  if (round) ctx.beginPath();
  for (let i = start; i < end; i++) {
    if (i === redIndex) continue;
    const local = i - start;
    const row = (local / columns) | 0;
    const x = (local - row * columns) * pitch;
    const y = row * pitch;
    if (round) {
      ctx.moveTo(x + dot, y + r);
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
    } else {
      ctx.fillRect(x, y, dot, dot);
    }
  }
  if (round) ctx.fill();

  if (redIndex >= start && redIndex < end) {
    const local = redIndex - start;
    const row = (local / columns) | 0;
    const x = (local - row * columns) * pitch;
    const y = row * pitch;
    ctx.fillStyle = RED;
    if (round) {
      ctx.beginPath();
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, dot, dot);
    }
  }

  tile.appendChild(canvas);
}

function freeTile(tile) {
  if (tile.firstChild) tile.removeChild(tile.firstChild); // release the bitmap
}

function locate() {
  const { redIndex, columns, pitch, dot } = st;
  const row = (redIndex / columns) | 0;
  const col = redIndex - row * columns;
  const x = col * pitch + dot / 2;
  const y = row * pitch + dot / 2;

  els.marker.style.left = `${x}px`;
  els.marker.style.top = `${y}px`;
  els.marker.style.display = "block";

  const top = els.area.offsetTop + row * pitch - window.innerHeight / 2;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function renderStats() {
  const { total, lines, odds } = st;
  const plural = (n) => (n === 1 ? "" : "s");
  const { prizeLine, note } = prizeBits();
  const prizeHtml = prizeLine
    ? `<p class="viz-prize">${prizeLine}</p>${note ? `<p class="viz-note">${note}</p>` : ""}`
    : "";

  if (total === 1) {
    els.stats.innerHTML = `
      <p class="viz-headline">Guaranteed</p>
      <p class="viz-sub2">${lines.toLocaleString()} lines covers every outcome for
        <b>${st.tierLabel}</b> — the dot is all red.</p>
      ${prizeHtml}`;
    return;
  }

  els.stats.innerHTML = `
    <p class="viz-headline">1 in ${total.toLocaleString()}</p>
    <p class="viz-sub2">your odds of <b>${st.tierLabel}</b> with ${lines.toLocaleString()} line${plural(lines)}
      (base 1 in ${Math.round(odds).toLocaleString()})</p>
    <p class="viz-detail">
      <b style="color:${RED}">1</b> red dot · <b>${(total - 1).toLocaleString()}</b> white dots
    </p>
    ${prizeHtml}`;
}

// What you'd win for the selected tier, plus how the multiplier changes it.
function prizeBits() {
  const { tierObj: t, mult, jackpot, cash, minPrize, meta } = st;
  if (!t) return { prizeLine: "", note: "" };
  // State games carry odds only (no prize/jackpot $ here) — show the dots, no $ line.
  if (jackpot == null) return { prizeLine: "", note: "" };

  if (t.kind === "jackpot") {
    return {
      prizeLine: `Win the jackpot: <b>${fmtMoney(jackpot)}</b> advertised (≈ ${fmtMoney(cash)} cash).`,
      note: "",
    };
  }

  let prizeLine;
  if (t.kind === "any") {
    prizeLine = `Win any prize — from <b>$${minPrize.toLocaleString()}</b> up to the jackpot.`;
  } else if (mult && mult.name === "Power Play" && t.value === "5") {
    prizeLine = `Win <b>$${t.prize.toLocaleString()}</b> — a flat $2,000,000 with Power Play.`;
  } else if (mult) {
    const lo = t.prize * mult.values[0];
    const hi = t.prize * mult.values[mult.values.length - 1];
    prizeLine = `Win <b>$${t.prize.toLocaleString()}</b> — $${lo.toLocaleString()}–$${hi.toLocaleString()} with the multiplier.`;
  } else {
    prizeLine = `Win <b>$${t.prize.toLocaleString()}</b>.`;
  }

  let note = "";
  if (mult) {
    const range = `${mult.values[0]}×–${mult.values[mult.values.length - 1]}×`;
    note = mult.always_on
      ? `${meta.label} always includes a random ${range} multiplier on non-jackpot prizes.`
      : `${mult.name} is optional (+$${mult.cost}/line): a ${range} multiplier on non-jackpot prizes.`;
  }
  return { prizeLine, note };
}

init();

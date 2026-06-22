// Jackpot growth statistics. From a game's per-draw jackpot saw-tooth we reconstruct each
// "run" (a cycle from a reset up to the draw it was won), then chart how high jackpots
// usually climb and how long / how often they reach each level. Uses the advertised
// (annuity) jackpot — what people mean by "a $500M jackpot."

const GAMES = ["powerball", "mega_millions", "lotto_america", "ny_lotto", "ca_superlotto",
  "fl_lotto", "fl_triple", "wa_lotto", "oh_classic", "mi_lotto47"];
const NICE = [1e6, 2e6, 3e6, 5e6, 1e7, 1.5e7, 2e7, 3e7, 5e7, 7e7, 1e8, 1.5e8, 2e8, 3e8, 4e8, 5e8, 7e8, 1e9, 1.5e9, 2e9];

const els = {};
let chart = null;

const fmtUSD = (n) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${Math.round(n).toLocaleString()}`;
const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

function buildRuns(series) {
  const runs = [];
  let cur = null, prev = null;
  for (const pt of series) {
    if (cur && prev && pt.jp < prev.jp * 0.7) { cur.complete = true; runs.push(cur); cur = null; }
    if (!cur) cur = { points: [], peak: 0 };
    cur.points.push(pt);
    if (pt.jp > cur.peak) cur.peak = pt.jp;
    prev = pt;
  }
  if (cur) { cur.complete = false; runs.push(cur); }
  return runs;
}

function milestones(peaks) {
  const max = Math.max(...peaks), min = Math.min(...peaks);
  let lv = NICE.filter((x) => x >= min && x <= max);
  if (lv.length > 7) { const step = Math.ceil(lv.length / 6); lv = lv.filter((_, i) => i % step === 0); }
  if (lv.length < 2) lv = [Math.round(max / 2 / 1e6) * 1e6, Math.round(max / 1e6) * 1e6];
  return lv;
}

async function init() {
  ["game", "summary", "curve-wrap", "table", "note"].forEach((id) => (els[id.replace(/-/g, "_")] = document.getElementById(id)));
  setMeta({
    title: "Lottery Jackpot Growth Statistics — How Big & How Often | NumbersIntel",
    description: "How high do lottery jackpots actually get, and how long does it take? Probability curves and average time-to-reach for Powerball, Mega Millions and more, from real jackpot history.",
    url: `${SITE}/jackpotstats.html`,
  });
  els.game.innerHTML = GAMES.filter((k) => GAME_META[k]).map((k) =>
    `<option value="${k}">${GAME_META[k].label}${GAME_META[k].stateName ? ` (${GAME_META[k].stateName})` : ""}</option>`).join("");
  const pre = new URLSearchParams(location.search).get("game");
  if (pre && GAMES.includes(pre)) els.game.value = pre;
  els.game.addEventListener("change", load);
  load();
}

async function load() {
  els.note.textContent = "";
  let hist;
  try { hist = await fetch(`history/${els.game.value}.json`, { cache: "default" }).then((r) => r.json()); }
  catch (_) { els.summary.innerHTML = `<p class="check-empty">Couldn't load the jackpot history.</p>`; return; }

  const series = (hist.draws || []).filter((d) => typeof d.jackpot === "number" && d.jackpot > 0)
    .map((d) => ({ date: d.date, jp: d.jackpot }));
  const runs = buildRuns(series);
  const complete = runs.filter((r) => r.complete && r.points.length >= 2);
  if (complete.length < 6) {
    els.summary.innerHTML = "";
    els.curve_wrap.innerHTML = "";
    els.table.innerHTML = "";
    els.note.textContent = `Only ${complete.length} completed jackpot cycle${complete.length === 1 ? "" : "s"} on record for ${GAME_META[els.game.value].label} so far — not enough for a meaningful curve yet. The picture fills in as we accumulate draws.`;
    return;
  }

  const peaks = complete.map((r) => r.peak).sort((a, b) => a - b);
  const median = peaks[Math.floor(peaks.length / 2)];
  const mean = peaks.reduce((s, x) => s + x, 0) / peaks.length;
  const avgDraws = complete.reduce((s, r) => s + r.points.length, 0) / complete.length;
  const avgDays = complete.reduce((s, r) => s + days(r.points[0].date, r.points[r.points.length - 1].date), 0) / complete.length;
  const floor = Math.min(...complete.map((r) => r.points[0].jp));

  els.summary.innerHTML = `
    <div class="detail-grid">
      ${card("Jackpot cycles on record", `${complete.length}`, `${fmtDate(series[0].date)} – ${fmtDate(series[series.length - 1].date)}`)}
      ${card("Typical winning jackpot", fmtUSD(median), `Median; average ${fmtUSD(mean)}`)}
      ${card("Time between jackpots", `${(avgDays / 7).toFixed(0)} weeks`, `~${avgDraws.toFixed(0)} draws, from a ${fmtUSD(floor)} reset`)}
    </div>`;

  // Survival curve: share of cycles whose peak reaches at least X.
  const maxPeak = peaks[peaks.length - 1];
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const x = floor + (maxPeak - floor) * (i / 40);
    pts.push({ x, y: complete.filter((r) => r.peak >= x).length / complete.length * 100 });
  }
  renderCurve(pts);

  // Milestone table: % reaching, and average time to get there.
  const rows = milestones(peaks).map((X) => {
    const reached = complete.filter((r) => r.peak >= X);
    const times = reached.map((r) => {
      const j = r.points.findIndex((p) => p.jp >= X);
      return { d: j, days: days(r.points[0].date, r.points[j].date) };
    });
    const pct = reached.length / complete.length * 100;
    const avgWk = times.length ? times.reduce((s, t) => s + t.days, 0) / times.length / 7 : 0;
    const avgDr = times.length ? times.reduce((s, t) => s + t.d, 0) / times.length : 0;
    return `<tr>
      <td>${fmtUSD(X)}+</td>
      <td class="num">${pct.toFixed(0)}%</td>
      <td class="num">${reached.length ? `${avgWk.toFixed(0)} wks (${avgDr.toFixed(0)} draws)` : "—"}</td>
    </tr>`;
  }).join("");
  els.table.innerHTML = `
    <table class="tier-table">
      <thead><tr><th>Jackpot reaches</th><th class="num">% of cycles</th><th class="num">Avg time from reset</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <p class="table-note">"% of cycles" is how often a jackpot run climbs to at least that level before someone wins;
      time is the average from the reset for the runs that got there.</p>`;
}

function card(title, val, sub) {
  return `<section class="panel result"><div class="result__top"><h2>${title}</h2></div>
    <div class="result__value">${val}</div><ul class="meta"><li><span class="k">${sub}</span></li></ul></section>`;
}

function renderCurve(pts) {
  els.curve_wrap.innerHTML = `<div class="hist-chart"><canvas id="jp-curve"></canvas></div>`;
  const t = theme();
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("jp-curve"), {
    type: "line",
    data: { datasets: [{ label: "% of jackpots that reach this size", data: pts, borderColor: t.accent, backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: 0.1 }] },
    options: {
      responsive: true, maintainAspectRatio: false, parsing: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: (i) => `Jackpot of ${fmtUSD(i[0].parsed.x)}`, label: (c) => `${c.parsed.y.toFixed(0)}% of cycles reach this` } },
      },
      scales: {
        x: { type: "linear", ticks: { color: t.textDim, maxTicksLimit: 8, callback: (v) => fmtUSD(v) }, grid: { display: false }, title: { display: true, text: "Jackpot size", color: t.textDim } },
        y: { min: 0, max: 100, ticks: { color: t.textDim, callback: (v) => `${v}%` }, grid: { color: t.border }, title: { display: true, text: "% of cycles that reach it", color: t.textDim } },
      },
    },
  });
}

init();

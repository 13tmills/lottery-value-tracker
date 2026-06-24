// NFL Analytics — standalone page (does NOT use common.js / data.json).
// Reads the CI-computed nflverse aggregates in nfl/*.json and renders four
// descriptive modules. No odds, picks or predictions by design.

// ---- team metadata -------------------------------------------------------
const TEAM_NAMES = {
  ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens", BUF: "Buffalo Bills",
  CAR: "Carolina Panthers", CHI: "Chicago Bears", CIN: "Cincinnati Bengals", CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys", DEN: "Denver Broncos", DET: "Detroit Lions", GB: "Green Bay Packers",
  HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars", KC: "Kansas City Chiefs",
  LA: "Los Angeles Rams", LAC: "Los Angeles Chargers", LV: "Las Vegas Raiders", MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings", NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants",
  NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers", SEA: "Seattle Seahawks",
  SF: "San Francisco 49ers", TB: "Tampa Bay Buccaneers", TEN: "Tennessee Titans", WAS: "Washington Commanders",
};
const teamName = (abbr) => TEAM_NAMES[abbr] || abbr;

// CSS-token colors (pulled live so the charts match the theme).
const css = (v, fb) => (getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb);
const COL = {
  accent: css("--accent", "#e0b950"),
  accent2: css("--accent-2", "#4f9cf9"),
  dim: css("--text-dim", "#93a3b8"),
  border: css("--border", "#243b57"),
  text: css("--text", "#eaf0f7"),
  win: "#4ec07a",
  loss: "#e0655f",
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtGameDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};
const one = (n) => (n == null ? "—" : (Math.round(n * 10) / 10).toFixed(1));

// ---- state ---------------------------------------------------------------
const NFL = { meta: null, schedule: null, teams: null, players: null, vsOpp: null, latestSeason: null };
let marginsChart = null;
let radarChart = null;

// ===========================================================================
// Bootstrap
// ===========================================================================
Promise.all([
  fetch("nfl/meta.json").then((r) => r.json()),
  fetch("nfl/schedule.json").then((r) => r.json()),
  fetch("nfl/teams.json").then((r) => r.json()),
  fetch("nfl/players_recent.json").then((r) => r.json()),
])
  .then(([meta, schedule, teams, players]) => {
    NFL.meta = meta;
    NFL.schedule = schedule;
    NFL.teams = teams;
    NFL.players = players;
    NFL.latestSeason = String(meta.current_season || Math.max(...Object.keys(teams).map(Number)));
    initAsOf();
    initTeamSelectors();
    initHotControls();
    initPlayerControls();
  })
  .catch((err) => {
    const main = document.querySelector("main.detail");
    if (main) {
      const p = document.createElement("p");
      p.className = "section-note";
      p.textContent = "NFL data is loading or temporarily unavailable. Please try again shortly.";
      main.prepend(p);
    }
    console.error("NFL data load failed", err);
  });

function initAsOf() {
  const el = document.getElementById("nfl-asof");
  if (!el || !NFL.meta) return;
  const s = NFL.latestSeason;
  const updated = NFL.meta.updated ? new Date(NFL.meta.updated) : null;
  const when = updated && !isNaN(updated)
    ? updated.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;
  el.textContent = `Latest data is the ${s} season${when ? ` (updated ${when})` : ""}; figures hold until the new season begins.`;
}

// ===========================================================================
// Team selectors → drive Team Form (radar) + Head-to-head
// ===========================================================================
function initTeamSelectors() {
  const a = document.getElementById("teamA");
  const b = document.getElementById("teamB");
  const teams = (NFL.meta.teams || Object.keys(NFL.teams[NFL.latestSeason] || {})).slice().sort();
  const opts = teams.map((t) => `<option value="${t}">${esc(teamName(t))}</option>`).join("");
  a.innerHTML = opts;
  b.innerHTML = opts;
  // Default to two recognizable, recently-met teams if present.
  a.value = teams.includes("KC") ? "KC" : teams[0];
  b.value = teams.includes("PHI") ? "PHI" : teams[1] || teams[0];

  const render = () => { renderTeamForm(); renderHeadToHead(); };
  a.addEventListener("change", render);
  b.addEventListener("change", render);
  document.getElementById("swapTeams").addEventListener("click", () => {
    const t = a.value; a.value = b.value; b.value = t; render();
  });
  render();
}

const teamRow = (season, abbr) => (NFL.teams[season] && NFL.teams[season][abbr]) || null;

function recordStr(t) {
  if (!t) return "—";
  let s = `${t.wins}-${t.losses}`;
  if (t.ties) s += `-${t.ties}`;
  return s;
}

function renderTeamForm() {
  const A = document.getElementById("teamA").value;
  const B = document.getElementById("teamB").value;
  const s = NFL.latestSeason;
  const ta = teamRow(s, A);
  const tb = teamRow(s, B);
  document.getElementById("form-title").textContent = `Team form — ${teamName(A)} vs ${teamName(B)} (${s})`;

  const rows = [
    ["Record", recordStr(ta), recordStr(tb), null],
    ["Last 5", last5Str(ta), last5Str(tb), null],
    ["Points / game", one(ta && ta.pts_for_pg), one(tb && tb.pts_for_pg), "high"],
    ["Points allowed / game", one(ta && ta.pts_against_pg), one(tb && tb.pts_against_pg), "low"],
    ["Yards / game", one(ta && ta.yards_for_pg), one(tb && tb.yards_for_pg), "high"],
    ["Yards allowed / game", one(ta && ta.yards_against_pg), one(tb && tb.yards_against_pg), "low"],
    ["Off. EPA / play", two(ta && ta.epa_for_play), two(tb && tb.epa_for_play), "high"],
    ["Def. EPA / play allowed", two(ta && ta.epa_against_play), two(tb && tb.epa_against_play), "low"],
    ["Takeaways", intOr(ta && ta.takeaways), intOr(tb && tb.takeaways), "high"],
    ["Giveaways", intOr(ta && ta.giveaways), intOr(tb && tb.giveaways), "low"],
  ];

  const body = rows.map(([label, av, bv, better]) => {
    const cls = highlight(av, bv, better);
    return `<tr><th scope="row">${esc(label)}</th>
      <td class="${cls.a}">${av}</td><td class="${cls.b}">${bv}</td></tr>`;
  }).join("");

  document.getElementById("nfl-form").innerHTML = `
    <div class="nfl-table-wrap"><table class="nfl-table nfl-form-table">
      <thead><tr><th scope="col">Metric</th>
        <th scope="col">${esc(A)}</th><th scope="col">${esc(B)}</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;

  renderRadar(A, B, ta, tb, s);
}

const two = (n) => (n == null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(2));
const intOr = (n) => (n == null ? "—" : String(n));

function last5Str(t) {
  if (!t || !t.last5 || !t.last5.length) return "—";
  return t.last5.map((r) => `<span class="nfl-rl nfl-rl--${r === "W" ? "w" : r === "L" ? "l" : "t"}">${r}</span>`).join("");
}

// Compare two numeric strings; "high"=bigger is better, "low"=smaller is better.
function highlight(av, bv, better) {
  const out = { a: "", b: "" };
  if (!better) return out;
  const na = parseFloat(String(av).replace(/[^0-9.\-]/g, ""));
  const nb = parseFloat(String(bv).replace(/[^0-9.\-]/g, ""));
  if (isNaN(na) || isNaN(nb) || na === nb) return out;
  const aBetter = better === "high" ? na > nb : na < nb;
  out[aBetter ? "a" : "b"] = "nfl-better";
  return out;
}

// ---- radar: normalize each axis across the league for the latest season ----
function renderRadar(A, B, ta, tb, season) {
  const keyEl = document.getElementById("nfl-radar-key");
  if (!ta || !tb) {
    if (radarChart) { radarChart.destroy(); radarChart = null; }
    keyEl.textContent = "";
    return;
  }
  const league = Object.values(NFL.teams[season] || {});
  // [axis label, accessor, higherIsBetter]
  const axes = [
    ["Scoring offense", (t) => t.pts_for_pg, true],
    ["Scoring defense", (t) => t.pts_against_pg, false],
    ["Yardage offense", (t) => t.yards_for_pg, true],
    ["Yardage defense", (t) => t.yards_against_pg, false],
    ["Takeaways", (t) => t.takeaways, true],
    ["EPA / play", (t) => t.epa_for_play, true],
  ];
  const labels = axes.map((x) => x[0]);
  const norm = (accessor, higher) => (t) => {
    const vals = league.map(accessor).filter((v) => v != null);
    if (!vals.length) return 50;
    const min = Math.min(...vals), max = Math.max(...vals);
    if (max === min) return 50;
    const v = accessor(t);
    if (v == null) return 0;
    const pct = ((v - min) / (max - min)) * 100;
    return Math.round(higher ? pct : 100 - pct);
  };
  const dataFor = (t) => axes.map(([, acc, hi]) => norm(acc, hi)(t));

  const ctx = document.getElementById("nfl-radar").getContext("2d");
  if (radarChart) radarChart.destroy();
  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [
        ds(A, dataFor(ta), COL.accent),
        ds(B, dataFor(tb), COL.accent2),
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: COL.text } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.formattedValue}/100 (league rank)` } } },
      scales: { r: {
        min: 0, max: 100,
        angleLines: { color: COL.border }, grid: { color: COL.border },
        pointLabels: { color: COL.dim, font: { size: 11 } },
        ticks: { display: false, stepSize: 25 },
      } },
    },
  });
  keyEl.textContent = "Each axis is scaled 0–100 against the rest of the league this season — outer edge = best in the NFL on that measure (defense and EPA-allowed inverted so bigger is always better).";
}
function ds(label, data, color) {
  return {
    label, data,
    borderColor: color, backgroundColor: color + "33",
    pointBackgroundColor: color, pointRadius: 3, borderWidth: 2,
  };
}

// ===========================================================================
// Head-to-head history
// ===========================================================================
const TYPE_LABEL = { REG: "", WC: "Wild Card", DIV: "Divisional", CON: "Conf. Champ.", SB: "Super Bowl" };

function renderHeadToHead() {
  const A = document.getElementById("teamA").value;
  const B = document.getElementById("teamB").value;
  document.getElementById("h2h-title").textContent = `Head-to-head — ${teamName(A)} vs ${teamName(B)}`;
  document.getElementById("h2h-ref").textContent = teamName(A);

  const games = NFL.schedule
    .filter((g) => g.home_score != null && g.away_score != null &&
      ((g.home === A && g.away === B) || (g.home === B && g.away === A)))
    .sort((x, y) => (x.date < y.date ? -1 : 1));

  const listEl = document.getElementById("nfl-h2h-list");
  if (!games.length) {
    if (marginsChart) { marginsChart.destroy(); marginsChart = null; }
    listEl.innerHTML = `<p class="section-note">No meetings between ${esc(teamName(A))} and ${esc(teamName(B))} in the data window (2020 onward).</p>`;
    return;
  }

  // Margin from A's perspective per meeting.
  const points = games.map((g) => {
    const aScore = g.home === A ? g.home_score : g.away_score;
    const bScore = g.home === A ? g.away_score : g.home_score;
    return { g, aScore, bScore, margin: aScore - bScore };
  });
  let aw = 0, bw = 0;
  points.forEach((p) => { if (p.margin > 0) aw++; else if (p.margin < 0) bw++; });

  // Chart
  const ctx = document.getElementById("nfl-margins").getContext("2d");
  if (marginsChart) marginsChart.destroy();
  marginsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: points.map((p) => seasonWk(p.g)),
      datasets: [{
        label: `${A} margin`,
        data: points.map((p) => p.margin),
        backgroundColor: points.map((p) => (p.margin >= 0 ? COL.win : COL.loss)),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: {
          title: (items) => { const p = points[items[0].dataIndex]; return seasonWkLong(p.g); },
          label: (item) => { const p = points[item.dataIndex];
            return `${A} ${p.aScore}–${p.bScore} ${B} (${p.margin >= 0 ? "+" : ""}${p.margin})`; } } } },
      scales: {
        x: { ticks: { color: COL.dim, maxRotation: 60, minRotation: 0 }, grid: { display: false } },
        y: { title: { display: true, text: `${A} margin →`, color: COL.dim },
          ticks: { color: COL.dim }, grid: { color: COL.border, zeroLineColor: COL.dim } },
      },
    },
  });

  // List (most recent first)
  const rows = points.slice().reverse().map((p) => {
    const winner = p.margin === 0 ? "Tie" : (p.margin > 0 ? A : B);
    const wcls = p.margin === 0 ? "" : (p.margin > 0 ? "nfl-better" : "");
    const tag = TYPE_LABEL[p.g.type] ? `<span class="nfl-tag">${esc(TYPE_LABEL[p.g.type])}</span>` : "";
    return `<tr>
      <td>${esc(fmtGameDate(p.g.date))} ${tag}</td>
      <td>${esc(seasonWk(p.g))}</td>
      <td class="${wcls}">${esc(A)} ${p.aScore}–${p.bScore} ${esc(B)}</td>
      <td>${esc(winner)}</td></tr>`;
  }).join("");

  listEl.innerHTML = `
    <p class="nfl-h2h-summary"><strong>${esc(A)} ${aw}</strong> &ndash; <strong>${bw} ${esc(B)}</strong>
      over ${games.length} meeting${games.length === 1 ? "" : "s"} on record.</p>
    <div class="nfl-table-wrap"><table class="nfl-table">
      <thead><tr><th scope="col">Date</th><th scope="col">Season</th><th scope="col">Result</th><th scope="col">Winner</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}
const seasonWk = (g) => `${g.season} ${g.type === "REG" ? "W" + g.week : (TYPE_LABEL[g.type] ? g.type : "W" + g.week)}`;
const seasonWkLong = (g) => `${g.season} ${g.type === "REG" ? "Week " + g.week : (TYPE_LABEL[g.type] || "Week " + g.week)}`;

// ===========================================================================
// Who's hot / cold
// ===========================================================================
const HOT_MIN_SEASON_FP = 6;   // ignore low-volume players (noisy ratios)
const HOT_THRESHOLD = 0.12;    // ±12%

function initHotControls() {
  document.getElementById("hotPos").addEventListener("change", renderHot);
  renderHot();
}

function computeMovers(pos) {
  const out = [];
  for (const p of NFL.players) {
    if (pos !== "ALL" && p.pos !== pos) continue;
    if (!p.games || p.games.length < 3) continue;
    const seasonAvg = p.season_avg_fp;
    if (!seasonAvg || seasonAvg < HOT_MIN_SEASON_FP) continue;
    const last3 = p.games.slice(-3);
    const l3avg = last3.reduce((s, g) => s + (g.fp || 0), 0) / last3.length;
    const delta = (l3avg - seasonAvg) / seasonAvg;
    if (Math.abs(delta) < HOT_THRESHOLD) continue;
    out.push({ p, seasonAvg, l3avg, delta, spark: p.games.map((g) => g.fp || 0) });
  }
  return out;
}

function renderHot() {
  const pos = document.getElementById("hotPos").value;
  const movers = computeMovers(pos);
  const hot = movers.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 8);
  const cold = movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 8);

  const card = (m, kind) => {
    const pct = Math.round(m.delta * 100);
    const arrow = kind === "hot" ? "▲" : "▼";
    return `<div class="nfl-mover nfl-mover--${kind}">
      <div class="nfl-mover__top">
        <span class="nfl-mover__name">${esc(m.p.name)}</span>
        <span class="nfl-mover__pos">${esc(m.p.pos)} · ${esc(m.p.team)}</span>
      </div>
      ${sparkSVG(m.spark, kind === "hot" ? COL.win : COL.loss)}
      <div class="nfl-mover__nums">
        <span class="nfl-mover__delta nfl-mover__delta--${kind}">${arrow} ${pct > 0 ? "+" : ""}${pct}%</span>
        <span class="nfl-mover__detail">last 3: <b>${one(m.l3avg)}</b> vs season <b>${one(m.seasonAvg)}</b> FP</span>
      </div>
    </div>`;
  };

  const section = (title, arr, kind) => `
    <div class="nfl-hot-col">
      <h3 class="nfl-hot-h nfl-hot-h--${kind}">${title}</h3>
      ${arr.length ? arr.map((m) => card(m, kind)).join("") : '<p class="section-note">No qualifying players.</p>'}
    </div>`;

  document.getElementById("nfl-hot").innerHTML =
    section("Trending up", hot, "hot") + section("Trending down", cold, "cold");
}

// Tiny inline sparkline (no per-card Chart instance).
function sparkSVG(vals, color) {
  const w = 132, h = 30, pad = 2;
  if (!vals.length) return "";
  const min = Math.min(...vals), max = Math.max(...vals);
  const rng = max - min || 1;
  const step = vals.length > 1 ? (w - pad * 2) / (vals.length - 1) : 0;
  const pts = vals.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / rng) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1].split(",");
  return `<svg class="nfl-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <polyline fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"
      stroke-linecap="round" points="${pts.join(" ")}" />
    <circle cx="${last[0]}" cy="${last[1]}" r="2.4" fill="${color}" />
  </svg>`;
}

// ===========================================================================
// Player vs opponent splits (lazy-load the 1MB file on first use)
// ===========================================================================
function initPlayerControls() {
  const input = document.getElementById("playerInput");
  const hint = document.getElementById("playerHint");
  let loaded = false;

  const ensureLoaded = () => {
    if (loaded || NFL.vsOpp) return Promise.resolve();
    hint.textContent = "Loading player index…";
    return fetch("nfl/player_vs_opp.json").then((r) => r.json()).then((data) => {
      NFL.vsOpp = data;
      loaded = true;
      buildPlayerList();
      hint.textContent = `${Object.keys(data).length.toLocaleString()} players — type a name above.`;
    }).catch(() => { hint.textContent = "Player splits are temporarily unavailable."; });
  };

  // Map lowercased "name" -> id for resolving the datalist selection.
  let nameToId = {};
  function buildPlayerList() {
    const dl = document.getElementById("playerList");
    const entries = Object.entries(NFL.vsOpp)
      .map(([id, v]) => ({ id, name: v.name, pos: v.pos, team: v.team }))
      .filter((e) => e.name)
      .sort((a, b) => a.name.localeCompare(b.name));
    nameToId = {};
    dl.innerHTML = entries.map((e) => {
      const label = `${e.name}${e.pos ? " (" + e.pos + (e.team ? " · " + e.team : "") + ")" : ""}`;
      nameToId[label.toLowerCase()] = e.id;
      nameToId[e.name.toLowerCase()] = e.id; // also resolve bare name
      return `<option value="${esc(label)}"></option>`;
    }).join("");
  }

  input.addEventListener("focus", ensureLoaded, { once: true });
  input.addEventListener("change", () => {
    ensureLoaded().then(() => {
      const id = nameToId[input.value.trim().toLowerCase()];
      if (id) renderSplits(id);
    });
  });
}

function renderSplits(id) {
  const rec = NFL.vsOpp[id];
  const wrap = document.getElementById("nfl-splits");
  if (!rec) { wrap.innerHTML = ""; return; }
  const rows = Object.entries(rec.vs || {})
    .map(([opp, v]) => ({ opp, ...v }))
    .sort((a, b) => (b.avg_fp || 0) - (a.avg_fp || 0));

  const career = rec.career_avg_fp;
  const body = rows.map((r) => {
    const small = r.games < 4;
    const vsBase = career ? (r.avg_fp || 0) - career : null;
    const cmp = vsBase == null ? "" : (vsBase >= 0 ? "nfl-better" : "");
    const diff = vsBase == null ? "" : `${vsBase >= 0 ? "+" : ""}${one(vsBase)}`;
    return `<tr class="${small ? "nfl-small" : ""}">
      <th scope="row">${esc(teamName(r.opp))} <span class="nfl-abbr">${esc(r.opp)}</span></th>
      <td>${r.games}${small ? ' <span class="nfl-flag" title="Fewer than 4 games — small sample">small</span>' : ""}</td>
      <td class="${cmp}">${one(r.avg_fp)}</td>
      <td>${diff}</td>
      <td>${one(r.avg_yds)}</td></tr>`;
  }).join("");

  wrap.innerHTML = `
    <div class="nfl-splits-head">
      <strong>${esc(rec.name)}</strong>
      <span class="nfl-mover__pos">${esc(rec.pos || "")}${rec.team ? " · " + esc(rec.team) : ""}</span>
      <span class="nfl-splits-career">Career avg: <b>${one(career)}</b> FP / game</span>
    </div>
    <div class="nfl-table-wrap"><table class="nfl-table">
      <thead><tr>
        <th scope="col">Opponent</th><th scope="col">Games</th>
        <th scope="col">Avg FP</th><th scope="col">vs career</th><th scope="col">Avg yds</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <p class="section-note">“Avg FP” is per-game fantasy points against that opponent; “vs career” compares it to
      this player's overall per-game average. Rows marked <em>small</em> rest on fewer than four games.</p>`;
}

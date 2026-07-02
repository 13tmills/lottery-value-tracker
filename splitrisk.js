// Split-risk / participation tracker. Reads split_risk.json (computed in CI by
// scraper/split_risk.py) and renders the upcoming-draw projections, a
// tickets-vs-jackpot scatter, win/split odds by jackpot band, and recent draws.
// Honest framing throughout: estimates, not predictions; draws are independent.

const SR = { data: null, game: "powerball", chart: null };

const css = (v, fb) => (getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb);
const C = {
  accent: css("--accent", "#e0b950"), accent2: css("--accent-2", "#4f9cf9"),
  dim: css("--text-dim", "#93a3b8"), border: css("--border", "#243b57"), text: css("--text", "#eaf0f7"),
};

const pctStr = (p) => (p == null ? "—" : (p * 100 >= 10 ? Math.round(p * 100) : (p * 100).toFixed(1)) + "%");
const millions = (n) => {
  if (n == null) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + " billion";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " million";
  if (n >= 1e3) return Math.round(n / 1e3) + ",000";
  return String(Math.round(n));
};
const money = (n) => (typeof fmtMoney === "function" ? fmtMoney(n) : "$" + Number(n).toLocaleString());
const dateStr = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};
const bandLabel = (lo, hi) => `$${lo}M–${hi >= 999999 ? "+" : "$" + hi + "M"}`;

fetch("split_risk.json", { cache: "no-store" })
  .then((r) => r.json())
  .then((data) => {
    SR.data = data;
    if (!data.games || !data.games.powerball) { SR.game = Object.keys(data.games || {})[0]; }
    renderUpcoming();
    renderToggle();
    renderGame();
  })
  .catch(() => {
    document.getElementById("sr-upcoming").innerHTML =
      '<p class="section-note">Participation data is loading or temporarily unavailable. Please try again shortly.</p>';
  });

// ---- upcoming projection cards (both games) ------------------------------
function renderUpcoming() {
  const games = SR.data.games;
  const order = ["powerball", "mega_millions", "lotto_america"].filter((k) => games[k]);
  const cards = order.map((k) => {
    const g = games[k];
    const u = g.upcoming;
    if (!u) {
      return `<div class="sr-card"><div class="sr-card__game">${g.label}</div>
        <p class="section-note">No upcoming projection available right now.</p></div>`;
    }
    const interp = splitInterp(u.p_split_if_won, u.p_win);
    return `<div class="sr-card">
      <div class="sr-card__game">${g.label}</div>
      <div class="sr-card__jackpot">${money(u.jackpot)}<span class="sr-card__sub"> jackpot &middot; draws ${dateStr(u.draw_date)}</span></div>
      <div class="sr-card__stats">
        <div class="sr-stat"><span class="sr-stat__v">~${millions(u.est_lines)}</span><span class="sr-stat__l">est. tickets in play</span></div>
        <div class="sr-stat"><span class="sr-stat__v">${pctStr(u.p_win)}</span><span class="sr-stat__l">chance someone wins</span></div>
        <div class="sr-stat"><span class="sr-stat__v">${pctStr(u.p_split_if_won)}</span><span class="sr-stat__l">chance it's split, if won</span></div>
      </div>
      <p class="sr-card__interp">${interp}</p>
      <p class="sr-card__base">Benchmark from ${u.band_n} past draws in the ${u.band} range.</p>
    </div>`;
  }).join("");
  document.getElementById("sr-upcoming").innerHTML = cards;
}

function splitInterp(pSplit, pWin) {
  if (pSplit == null) return "";
  if (pWin < 0.05) {
    return "At this jackpot, relatively few tickets are in play, so it's most likely to roll over to a bigger prize next draw.";
  }
  if (pSplit < 0.1) {
    return "If it is won, it would most likely go to a single ticket — splitting is unlikely at this level of play.";
  }
  if (pSplit < 0.3) {
    return "Enough tickets are in play that a win has a meaningful chance of being shared between two or more people.";
  }
  return "So many tickets are in play that if the jackpot is won, it's quite likely to be split between multiple winners.";
}

// ---- game toggle ---------------------------------------------------------
function renderToggle() {
  const games = SR.data.games;
  const order = ["powerball", "mega_millions", "lotto_america"].filter((k) => games[k]);
  document.getElementById("sr-toggle").innerHTML = order.map((k) =>
    `<button type="button" class="sr-tog${k === SR.game ? " is-active" : ""}" data-game="${k}">${games[k].label}</button>`
  ).join("");
  document.querySelectorAll(".sr-tog").forEach((b) => b.addEventListener("click", () => {
    SR.game = b.dataset.game;
    document.querySelectorAll(".sr-tog").forEach((x) => x.classList.toggle("is-active", x === b));
    renderGame();
  }));
}

function renderGame() {
  renderScatter();
  renderBands();
  renderRecent();
}

// ---- scatter: tickets vs jackpot -----------------------------------------
function renderScatter() {
  const g = SR.data.games[SR.game];
  const pts = g.scatter || [];
  // Scatter tickets are stored in millions. For low-volume games (Lotto America
  // tops out well under 1M) that squashes every dot near zero — switch to thousands.
  const maxY = pts.reduce((m, p) => Math.max(m, p[1]), 0);
  const useK = maxY > 0 && maxY < 1;      // under 1 million tickets → show thousands
  const yMul = useK ? 1000 : 1;
  const yLabel = useK ? "Estimated tickets in play (thousands)" : "Estimated tickets in play (millions)";
  const tip = (v) => (useK ? `~${Math.round(v)},000 tickets` : `~${v}M tickets`);

  const won = [], lost = [];
  pts.forEach(([jM, lM, w]) => ((w ? won : lost).push({ x: jM, y: lM * yMul })));

  // Median trend line from the jackpot bands — traces typical turnout by jackpot size.
  const maxX = pts.reduce((m, p) => Math.max(m, p[0]), 0);
  const trend = (g.bands || []).filter((b) => b.n > 0).map((b) => {
    const hi = b.hi_m >= 999999 ? Math.max(b.lo_m, maxX) : b.hi_m;
    return { x: (b.lo_m + hi) / 2, y: (b.median_lines / 1e6) * yMul };
  }).sort((a, b) => a.x - b.x);

  const ctx = document.getElementById("sr-scatter").getContext("2d");
  if (SR.chart) SR.chart.destroy();
  SR.chart = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        { label: "Rolled over", data: lost, backgroundColor: C.accent2 + "99", pointRadius: 3, pointHoverRadius: 5 },
        { label: "Jackpot won", data: won, backgroundColor: C.accent, pointRadius: 4, pointHoverRadius: 6 },
        { type: "line", label: "Typical (median)", data: trend, borderColor: C.text, borderDash: [6, 4],
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, fill: false, tension: 0.2, order: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: C.text } },
        tooltip: { callbacks: { label: (i) => (i.dataset.type === "line"
          ? `Typical for this range: ${tip(i.parsed.y)}`
          : `$${i.parsed.x}M jackpot · ${tip(i.parsed.y)}`) } },
      },
      scales: {
        x: { title: { display: true, text: "Advertised jackpot ($M)", color: C.dim },
          ticks: { color: C.dim }, grid: { color: C.border } },
        y: { title: { display: true, text: yLabel, color: C.dim },
          ticks: { color: C.dim }, grid: { color: C.border }, beginAtZero: true },
      },
    },
  });

  const note = document.getElementById("sr-scatter-note");
  if (note) {
    note.innerHTML = `The dashed line traces the typical (median) tickets in play for each jackpot range. ` +
      `Each draw's estimate is precise to about &plusmn;${g.typical_se_pct}% (from the law of large numbers on ` +
      `tens of thousands of prize winners), so the spread of dots is <strong>real draw-to-draw variation</strong> ` +
      `in how many people play — not measurement error.`;
  }
}

// ---- bands table ---------------------------------------------------------
function renderBands() {
  const g = SR.data.games[SR.game];
  document.getElementById("sr-band-title").textContent = `${g.label}: win & split odds by jackpot size`;
  const rows = (g.bands || []).map((b) => `<tr>
      <th scope="row">${bandLabel(b.lo_m, b.hi_m)}</th>
      <td>~${millions(b.median_lines)}</td>
      <td>${pctStr(b.p_win)}</td>
      <td>${pctStr(b.p_split)}</td>
      <td class="sr-muted">${b.n}</td></tr>`).join("");
  document.getElementById("sr-bands").innerHTML = `
    <div class="sr-table-wrap"><table class="sr-table">
      <thead><tr>
        <th scope="col">Jackpot range</th><th scope="col">Typical tickets</th>
        <th scope="col">Someone wins</th><th scope="col">Split if won</th><th scope="col">Draws</th>
      </tr></thead><tbody>${rows}</tbody>
    </table></div>`;
}

// ---- recent draws --------------------------------------------------------
function renderRecent() {
  const g = SR.data.games[SR.game];
  document.getElementById("sr-recent-title").textContent = `${g.label}: recent draws`;
  const rows = (g.recent || []).map((r) => `<tr>
      <th scope="row">${dateStr(r.date)}</th>
      <td>${money(r.jackpot)}</td>
      <td>~${millions(r.est_lines)}</td>
      <td>${pctStr(r.p_win)}</td>
      <td>${pctStr(r.p_split)}</td>
      <td>${r.won ? '<span class="sr-won">Won</span>' : '<span class="sr-muted">Rolled over</span>'}</td></tr>`).join("");
  document.getElementById("sr-recent").innerHTML = `
    <div class="sr-table-wrap"><table class="sr-table">
      <thead><tr>
        <th scope="col">Draw date</th><th scope="col">Jackpot</th><th scope="col">Est. tickets</th>
        <th scope="col">Someone won</th><th scope="col">Split odds</th><th scope="col">Result</th>
      </tr></thead><tbody>${rows}</tbody>
    </table></div>
    <p class="section-note sr-muted">Estimated tickets = total prize winners &divide; overall win odds
      (about 1 in ${g.overall_win_odds}), pooling every tier by its winner count. With that many winners the
      estimate is typically accurate to about &plusmn;${g.typical_se_pct}%. "Split odds" is the modeled chance
      the jackpot would have been shared if won.</p>`;
}

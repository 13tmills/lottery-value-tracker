// Monte Carlo lottery simulator. Plays out thousands of real tickets using the game's
// actual odds and prize tiers (from common.js LOTTO_TIERS), with jackpot payouts sampled
// from the game's historical cash values. Two scenarios: a big one-time buy, or a regular
// habit over years. The point it makes, viscerally: you bleed money slowly.

const DRAWS_PER_WEEK = { powerball: 3, mega_millions: 2, lotto_america: 3 };
const MAX_TICKETS = 5_000_000;

const els = {};
let chart = null;
let pool = [100_000_000]; // historical jackpot cash values for the selected game

const parseNum = (s) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
function fmtUSD(n) {
  const a = Math.abs(n), sign = n < 0 ? "-" : "";
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : `$${Math.round(a).toLocaleString()}`;
  return sign + s;
}

// One ticket's outcome: a jackpot (sampled historical cash) or a fixed lower-tier prize.
function simTicket(g) {
  const r = Math.random();
  if (r < 1 / g.J) return { prize: pool[(Math.random() * pool.length) | 0], jackpot: true };
  let cum = 1 / g.J;
  for (const [prize, odds] of g.tiers) {
    cum += 1 / odds;
    if (r < cum) return { prize, jackpot: false };
  }
  return { prize: 0, jackpot: false };
}

function simulate(g, linesPerDraw, draws) {
  let spent = 0, won = 0, biggest = 0, jackpots = 0;
  const hits = new Map();
  const series = [];
  const every = Math.max(1, Math.floor(draws / 200));
  for (let d = 0; d < draws; d++) {
    for (let l = 0; l < linesPerDraw; l++) {
      spent += g.price;
      const o = simTicket(g);
      if (o.prize > 0) {
        won += o.prize;
        if (o.prize > biggest) biggest = o.prize;
        if (o.jackpot) jackpots++;
        else hits.set(o.prize, (hits.get(o.prize) || 0) + 1);
      }
    }
    if (d % every === 0 || d === draws - 1) series.push({ x: d + 1, y: won - spent });
  }
  return { spent, won, net: won - spent, biggest, hits, jackpots, series, tickets: linesPerDraw * draws };
}

async function init() {
  ["game", "scenario", "bulk", "habit", "lines-b", "buys", "lines-h", "freq", "years", "go", "out"]
    .forEach((id) => (els[id.replace(/-/g, "_")] = document.getElementById(id)));
  setMeta({
    title: "Lottery Monte Carlo Simulator — What If You Played for Years? | NumbersIntel",
    description: "Simulate thousands of real lottery tickets with a game's actual odds and prizes. See what buying 10 lines 10,000 times — or three lines a week for years — would really do to your wallet.",
    url: `${SITE}/montecarlo.html`,
  });
  const pre = new URLSearchParams(location.search).get("game");
  if (pre && LOTTO_TIERS[pre]) els.game.value = pre;

  await loadPool();
  els.game.addEventListener("change", loadPool);
  els.scenario.addEventListener("change", onScenario);
  els.go.addEventListener("click", run);
  onScenario();
}

async function loadPool() {
  pool = [100_000_000];
  try {
    const h = await fetch(`history/${els.game.value}.json`, { cache: "default" }).then((r) => r.json());
    const vals = (h.draws || []).map((d) => d.cash || d.jackpot).filter((v) => typeof v === "number" && v > 0);
    if (vals.length) pool = vals;
  } catch (_) { /* keep default */ }
}

function onScenario() {
  const bulk = els.scenario.value === "bulk";
  els.bulk.style.display = bulk ? "" : "none";
  els.habit.style.display = bulk ? "none" : "";
}

function run() {
  const g = LOTTO_TIERS[els.game.value];
  let linesPerDraw, draws, period;
  if (els.scenario.value === "bulk") {
    linesPerDraw = Math.max(1, Math.round(parseNum(els.lines_b.value)));
    draws = Math.max(1, Math.round(parseNum(els.buys.value)));
    period = `${draws.toLocaleString()} buys of ${linesPerDraw} line${linesPerDraw > 1 ? "s" : ""}`;
  } else {
    linesPerDraw = Math.max(1, Math.round(parseNum(els.lines_h.value)));
    const years = Math.max(1, parseNum(els.years.value));
    const perYear = els.freq.value === "draw" ? DRAWS_PER_WEEK[els.game.value] * 52
      : els.freq.value === "week" ? 52 : 12;
    draws = Math.round(perYear * years);
    period = `${linesPerDraw} line${linesPerDraw > 1 ? "s" : ""} ${els.freq.value === "draw" ? "every draw" : els.freq.value === "week" ? "a week" : "a month"} for ${years} year${years > 1 ? "s" : ""}`;
  }
  if (linesPerDraw * draws > MAX_TICKETS) {
    els.out.innerHTML = `<p class="check-empty">That's over ${(MAX_TICKETS / 1e6)}M tickets — try fewer to keep it snappy.</p>`;
    return;
  }

  const r = simulate(g, linesPerDraw, draws);
  const pct = r.spent ? (r.won / r.spent * 100) : 0;
  const jackpotOdds = Math.round(g.J / r.tickets);
  els.out.innerHTML = `
    <p class="verdict ${r.net >= 0 ? "verdict--annuity" : "verdict--cash"}">
      Playing <b>${period}</b> of ${g.label}, you'd buy <b>${r.tickets.toLocaleString()}</b> lines for
      <b>${fmtUSD(r.spent)}</b>, win <b>${fmtUSD(r.won)}</b> back, and end up
      <b>${r.net >= 0 ? "up" : "down"} ${fmtUSD(Math.abs(r.net))}</b>.</p>
    <div class="detail-grid">
      ${mcCard("Total spent", fmtUSD(r.spent), `${r.tickets.toLocaleString()} lines`)}
      ${mcCard("Total won", fmtUSD(r.won), `${pct.toFixed(1)}¢ back on every $1`)}
      ${mcCard("Biggest single win", fmtUSD(r.biggest), r.jackpots ? `🎉 jackpot hit ${r.jackpots}×!` : `Jackpot odds across all lines ≈ 1 in ${jackpotOdds.toLocaleString()}`)}
    </div>
    <section class="panel">
      <h2>Your running balance</h2>
      <p class="section-note">Cumulative winnings minus spending over the run. It almost always slides
        downward — the occasional small win never catches up to the steady cost.</p>
      <div class="hist-chart"><canvas id="mc-chart"></canvas></div>
    </section>
    ${prizeTable(r, g)}
    <button class="btn" id="reroll">Run it again &#8635;</button>
    <p class="disclaimer">${MC_NOTE}</p>`;

  document.getElementById("reroll").addEventListener("click", run);
  renderChart(r);
}

function mcCard(title, val, sub) {
  return `<section class="panel result"><div class="result__top"><h2>${title}</h2></div>
    <div class="result__value">${val}</div><ul class="meta"><li><span class="k">${sub}</span></li></ul></section>`;
}

function prizeTable(r, g) {
  const rows = [...r.hits.entries()].sort((a, b) => b[0] - a[0])
    .map(([prize, n]) => `<tr><td>$${prize.toLocaleString()} prize</td><td class="num">${n.toLocaleString()}</td></tr>`).join("");
  const jp = r.jackpots ? `<tr class="best-row--top"><td>Jackpot</td><td class="num">${r.jackpots}</td></tr>` : "";
  if (!rows && !jp) return `<p class="check-empty">Not a single winning line. It happens.</p>`;
  return `<section class="panel"><h2>What you actually won</h2>
    <table class="tier-table"><thead><tr><th>Prize</th><th class="num">Times</th></tr></thead>
    <tbody>${jp}${rows}</tbody></table></section>`;
}

function renderChart(r) {
  const t = theme();
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("mc-chart"), {
    type: "line",
    data: { datasets: [{ label: "Running balance", data: r.series, borderColor: t.accent, backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: 0.05 }] },
    options: {
      responsive: true, maintainAspectRatio: false, parsing: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: (i) => `After draw ${i[0].parsed.x.toLocaleString()}`, label: (c) => `Balance: ${fmtUSD(c.parsed.y)}` } },
      },
      scales: {
        x: { type: "linear", ticks: { color: t.textDim, maxTicksLimit: 8, callback: (v) => v.toLocaleString() }, grid: { display: false }, title: { display: true, text: "Draws played", color: t.textDim } },
        y: { ticks: { color: t.textDim, callback: (v) => fmtUSD(v) }, grid: { color: t.border } },
      },
    },
  });
}

const MC_NOTE = `<strong>For entertainment only — not financial or gambling advice.</strong> This is a random
  simulation using each game's published odds and prize tiers, with jackpots sampled from historical cash
  values; results vary every run. Real play involves taxes and (rarely) sharing a jackpot, which would make
  the outcome worse, not better. The lottery is a negative-expected-value bet — only ever play with money
  you can afford to lose.`;

init();

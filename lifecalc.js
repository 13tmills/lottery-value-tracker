// "A year for life" vs. cash calculator. Compares the after-tax present value of
// a flat lifetime annuity (one payment now, then one each year to your life
// expectancy) against the one-time cash option, and finds the break-even discount
// rate. Driven by a game's forLife config (e.g. Millionaire For Life). ?game=<key>.

const els = {};
let chart = null;

const fmtUSD = (n) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`;
const parseNum = (s) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;

let CFG = { annual: 1_000_000, cash: 18_000_000, prizeLabel: "$1,000,000 a year for life" };

// Number of annual payments: one now, then one each year through life expectancy.
function numPayments(age, life) {
  return Math.max(1, Math.round(life) - Math.round(age) + 1);
}

// After-tax present value of the lifetime payments at discount rate d.
function annuityNPV(n, taxRate, d) {
  let npv = 0;
  for (let k = 0; k < n; k++) {
    npv += (CFG.annual * (1 - taxRate)) / Math.pow(1 + d, k);
  }
  return npv;
}

// Discount rate where the annuity NPV equals the cash lump sum (bisection).
function breakEvenRate(n, cashAfterTax, taxRate) {
  let lo = 0, hi = 1;
  if (annuityNPV(n, taxRate, lo) < cashAfterTax) return 0; // cash always wins
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (annuityNPV(n, taxRate, mid) > cashAfterTax) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function init() {
  ["age", "life", "fed", "state", "discount", "verdict", "back"].forEach((id) => (els[id] = document.getElementById(id)));
  els.cashCard = document.getElementById("cash-card");
  els.annuityCard = document.getElementById("annuity-card");

  const key = new URLSearchParams(location.search).get("game");
  const meta = (key && GAME_META[key]) || GAME_META.ny_m4l;
  const usedKey = (key && GAME_META[key] && meta.forLife) ? key : "ny_m4l";
  if (meta.forLife) CFG = { ...CFG, ...meta.forLife };

  els.back.href = `game.html?game=${usedKey}`;
  els.back.textContent = `← Back to ${meta.label}`;
  document.getElementById("page-title").innerHTML = `${meta.label}: payments vs. cash`;
  document.getElementById("page-tagline").textContent =
    `${CFG.prizeLabel}, or the ${fmtUSD(CFG.cash)} lump sum now? The after-tax, today's-dollars math.`;

  setMeta({
    title: `"A Year for Life" vs. Cash — ${meta.label} | NumbersIntel`,
    description: `Should you take ${CFG.prizeLabel} or the ${fmtUSD(CFG.cash)} lump sum? Compare the after-tax, present-value math by your age, life expectancy, and discount rate.`,
    url: `${SITE}/lifecalc.html?game=${usedKey}`,
  });

  ["age", "life", "fed", "state", "discount"].forEach((id) =>
    els[id].addEventListener("input", compute));

  compute();
}

function compute() {
  const age = parseNum(els.age.value);
  const life = parseNum(els.life.value);
  const taxRate = Math.min(0.95, (parseNum(els.fed.value) + parseNum(els.state.value)) / 100);
  const d = parseNum(els.discount.value) / 100;

  const n = numPayments(age, life);
  const nominal = n * CFG.annual;
  const cashAfterTax = CFG.cash * (1 - taxRate);
  const annuityAfterTaxNominal = nominal * (1 - taxRate);
  const annuityPV = annuityNPV(n, taxRate, d);
  const beRate = breakEvenRate(n, cashAfterTax, taxRate);

  const cashWins = cashAfterTax >= annuityPV;
  const diff = Math.abs(cashAfterTax - annuityPV);
  els.verdict.innerHTML = `Collecting <b>${n}</b> payments (to age ${Math.round(life)}) at a
    <b>${(d * 100).toFixed(1)}%</b> discount rate, taking the
    <b>${cashWins ? "cash" : "lifetime payments"}</b> is worth <b>${fmtUSD(diff)}</b> more in today's dollars.
    They break even at about <b>${(beRate * 100).toFixed(1)}%</b>.`;
  els.verdict.className = "verdict " + (cashWins ? "verdict--cash" : "verdict--annuity");

  els.cashCard.innerHTML = card("Take the cash", cashAfterTax, cashWins, [
    ["Lump sum (pre-tax)", fmtUSD(CFG.cash)],
    ["After tax, today", fmtUSD(cashAfterTax)],
  ]);
  els.annuityCard.innerHTML = card("Take the payments", annuityPV, !cashWins, [
    [`${n} payments (pre-tax)`, fmtUSD(nominal)],
    ["After tax (nominal)", fmtUSD(annuityAfterTaxNominal)],
    ["Present value today", fmtUSD(annuityPV)],
  ]);

  renderChart(n, cashAfterTax, taxRate);
}

function card(title, headline, isBest, rows) {
  return `
    <div class="result__top">
      <h2>${title}</h2>
      ${isBest ? `<span class="rank rank--best">Better deal</span>` : ""}
    </div>
    <div class="result__value">${fmtUSD(headline)}</div>
    <ul class="meta">
      ${rows.map(([k, v]) => `<li><span class="k">${k}</span><span class="v">${v}</span></li>`).join("")}
    </ul>`;
}

function renderChart(n, cashAfterTax, taxRate) {
  const t = theme();
  const rates = [];
  for (let r = 0; r <= 10; r += 0.25) rates.push(r);
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("calc-chart"), {
    type: "line",
    data: {
      labels: rates.map((r) => r + "%"),
      datasets: [
        { label: "Lifetime payments (present value)", data: rates.map((r) => annuityNPV(n, taxRate, r / 100)), borderColor: t.accent, borderWidth: 2, pointRadius: 0, tension: 0.1 },
        { label: "Cash (after tax)", data: rates.map(() => cashAfterTax), borderColor: t.accent2, borderWidth: 2, pointRadius: 0, borderDash: [5, 4] },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: t.textDim, usePointStyle: true, pointStyle: "line" } },
        tooltip: { callbacks: { title: (i) => `Discount rate ${i[0].label}`, label: (c) => `${c.dataset.label}: ${fmtUSD(c.parsed.y)}` } },
      },
      scales: {
        x: { ticks: { color: t.textDim, maxTicksLimit: 11 }, grid: { display: false } },
        y: { ticks: { color: t.textDim, callback: (v) => fmtUSD(v) }, grid: { color: t.border } },
      },
    },
  });
}

init();

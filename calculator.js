// Annuity vs. cash calculator. Compares the after-tax present value of the
// 30-year graduated annuity against the lump-sum cash option, and finds the
// break-even discount rate. Optionally prefilled from ?game=<key>.

const els = {};
let chart = null;
const GROWTH = 1.05; // annuity payments grow ~5%/yr
const YEARS = 30;    // 30 payments (first immediate, then 29 annual)

const fmtUSD = (n) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`;
const parseNum = (s) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;

// First annuity payment such that the 30 graduated payments sum to the jackpot.
function firstPayment(jackpot) {
  return (jackpot * (GROWTH - 1)) / (Math.pow(GROWTH, YEARS) - 1);
}

function annuityNPV(jackpot, taxRate, d) {
  const p1 = firstPayment(jackpot);
  let npv = 0;
  for (let k = 0; k < YEARS; k++) {
    const afterTax = p1 * Math.pow(GROWTH, k) * (1 - taxRate);
    npv += afterTax / Math.pow(1 + d, k);
  }
  return npv;
}

// Discount rate where annuity NPV equals the cash lump sum (bisection).
function breakEvenRate(jackpot, cashAfterTax, taxRate) {
  let lo = 0, hi = 1;
  if (annuityNPV(jackpot, taxRate, lo) < cashAfterTax) return 0; // cash always wins
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (annuityNPV(jackpot, taxRate, mid) > cashAfterTax) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

async function init() {
  ["jackpot", "cash", "fed", "state", "discount", "verdict", "back"].forEach((id) => (els[id] = document.getElementById(id)));
  els.cashCard = document.getElementById("cash-card");
  els.annuityCard = document.getElementById("annuity-card");

  const key = new URLSearchParams(location.search).get("game");
  const meta = key && GAME_META[key];
  if (meta) {
    els.back.href = `game.html?game=${key}`;
    els.back.textContent = `← Back to ${meta.label}`;
  }
  setMeta({
    title: "Lottery Annuity vs. Cash Calculator — Lump Sum or Payments? | NumbersIntel",
    description: "Should you take the lottery lump sum or the 30-year annuity? Compare the after-tax, present-value math at any discount rate — and find the break-even rate.",
    url: `${SITE}/calculator.html${key ? `?game=${key}` : ""}`,
  });

  // Prefill from the selected (or default) game's live numbers.
  let jackpot = 100_000_000, cash = 50_000_000;
  try {
    const data = await (await fetch("./data.json", { cache: "no-store" })).json();
    const g = data.games[key] || data.games.powerball;
    if (g) { jackpot = g.jackpot; cash = g.cash_value; }
  } catch (_) { /* fall back to defaults */ }
  els.jackpot.value = jackpot.toLocaleString();
  els.cash.value = cash.toLocaleString();

  ["jackpot", "cash", "fed", "state", "discount"].forEach((id) =>
    els[id].addEventListener("input", compute));
  // Re-format the big-money fields on blur.
  ["jackpot", "cash"].forEach((id) =>
    els[id].addEventListener("blur", () => { els[id].value = parseNum(els[id].value).toLocaleString(); }));

  compute();
}

function compute() {
  const jackpot = parseNum(els.jackpot.value);
  const cash = parseNum(els.cash.value);
  const taxRate = Math.min(0.95, (parseNum(els.fed.value) + parseNum(els.state.value)) / 100);
  const d = parseNum(els.discount.value) / 100;

  const cashAfterTax = cash * (1 - taxRate);
  const annuityAfterTaxNominal = jackpot * (1 - taxRate);
  const annuityPV = annuityNPV(jackpot, taxRate, d);
  const beRate = breakEvenRate(jackpot, cashAfterTax, taxRate);

  const cashWins = cashAfterTax >= annuityPV;
  const diff = Math.abs(cashAfterTax - annuityPV);
  els.verdict.innerHTML = `At a <b>${(d * 100).toFixed(1)}%</b> discount rate, taking the
    <b>${cashWins ? "cash" : "annuity"}</b> is worth <b>${fmtUSD(diff)}</b> more in today's dollars.
    They break even at about <b>${(beRate * 100).toFixed(1)}%</b>.`;
  els.verdict.className = "verdict " + (cashWins ? "verdict--cash" : "verdict--annuity");

  els.cashCard.innerHTML = card("Take the cash", cashAfterTax, cashWins, [
    ["Lump sum (pre-tax)", fmtUSD(cash)],
    ["After tax, today", fmtUSD(cashAfterTax)],
  ]);
  els.annuityCard.innerHTML = card("Take the annuity", annuityPV, !cashWins, [
    ["30-yr total (pre-tax)", fmtUSD(jackpot)],
    ["After tax (nominal)", fmtUSD(annuityAfterTaxNominal)],
    ["Present value today", fmtUSD(annuityPV)],
  ]);

  renderChart(jackpot, cashAfterTax, taxRate, d);
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

function renderChart(jackpot, cashAfterTax, taxRate, dNow) {
  const t = theme();
  const rates = [];
  for (let r = 0; r <= 10; r += 0.25) rates.push(r);
  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("calc-chart"), {
    type: "line",
    data: {
      labels: rates.map((r) => r + "%"),
      datasets: [
        { label: "Annuity (present value)", data: rates.map((r) => annuityNPV(jackpot, taxRate, r / 100)), borderColor: t.accent, borderWidth: 2, pointRadius: 0, tension: 0.1 },
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

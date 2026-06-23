// Jackpot break-even calculator. How big does the cash jackpot have to be before a
// ticket's expected value reaches the ticket price — and how taxes and jackpot splitting
// push that break-even point out of reach. Tier odds/prizes mirror scraper/scrape.py.

const GAMES = { ...LOTTO_TIERS, ...STATE_TIERS }; // national + fixed-tier state games

const els = {};
let chart = null;
let liveCash = {}; // game -> current cash jackpot from data.json

const parseNum = (s) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
const fmtUSD = (n) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${Math.round(n).toLocaleString()}`;

// Per-ticket expected value of the fixed, non-jackpot prize tiers.
const eLow = (g) => g.tiers.reduce((s, [prize, odds]) => s + prize / odds, 0);

// Fraction of the jackpot you keep on average, given you win, if N tickets are in play:
// the other winners are ~Poisson(N/J), and E[1/(1+k)] = (1 - e^-λ)/λ.
function splitFactor(N, J) {
  if (!N || N <= 0) return 1;
  const lam = N / J;
  return (1 - Math.exp(-lam)) / lam;
}

// Expected value of one ticket, in cents per $1 spent, at a given cash jackpot.
function evCents(g, cash, taxRate, N) {
  const jackpotValue = cash * splitFactor(N, g.J);
  const evTicket = (eLow(g) + jackpotValue / g.J) * (1 - taxRate);
  return (evTicket / g.price) * 100;
}

// Cash jackpot at which one ticket breaks even (EV = price), after tax + splitting.
function breakevenCash(g, taxRate, N) {
  const need = g.price / (1 - taxRate) - eLow(g); // jackpot EV needed, per ticket
  if (need <= 0) return 0; // lower tiers alone already break even
  return (need * g.J) / splitFactor(N, g.J);
}

async function init() {
  ["game", "tax", "tickets", "verdict", "back", "cards"].forEach((id) => (els[id] = document.getElementById(id)));
  setMeta({
    title: "Lottery Break-Even Jackpot Calculator — When Is a Ticket Worth It? | NumbersIntel",
    description: "How big does the Powerball or Mega Millions jackpot have to be before a ticket is a fair bet? The real expected-value math — after taxes and jackpot splitting.",
    url: `${SITE}/breakeven.html`,
  });

  populateGames();
  try {
    const data = await (await fetch("./data.json", { cache: "no-store" })).json();
    for (const k of Object.keys(LOTTO_TIERS)) liveCash[k] = (data.games[k] && data.games[k].cash_value) || 0;
  } catch (_) { /* fall back to no live jackpot */ }
  // State games aren't in data.json — pull each one's live cash from its history file.
  await Promise.all(Object.keys(STATE_TIERS).map(async (k) => {
    try {
      const h = await fetch(`history/${k}.json`, { cache: "default" }).then((r) => r.json());
      liveCash[k] = (h.current_jackpot && (h.current_jackpot.cash || h.current_jackpot.jackpot)) || 0;
    } catch (_) { liveCash[k] = 0; }
  }));

  const pre = new URLSearchParams(location.search).get("game");
  if (pre && GAMES[pre]) els.game.value = pre;

  ["game", "tax", "tickets"].forEach((id) => els[id].addEventListener("input", compute));
  compute();
}

// National games first, then the fixed-tier state cash games.
function populateGames() {
  const opt = (k) => `<option value="${k}">${GAMES[k].label}</option>`;
  els.game.innerHTML =
    `<optgroup label="National">${Object.keys(LOTTO_TIERS).map(opt).join("")}</optgroup>` +
    `<optgroup label="State cash games">${Object.keys(STATE_TIERS).map(opt).join("")}</optgroup>`;
}

function compute() {
  const g = GAMES[els.game.value];
  const taxRate = Math.min(0.95, parseNum(els.tax.value) / 100);
  const N = parseNum(els.tickets.value) * 1e6; // input is millions of tickets
  const cur = liveCash[els.game.value] || 0;

  const beGross = breakevenCash(g, 0, 0);
  const beTax = breakevenCash(g, taxRate, 0);
  const beSplit = N > 0 ? breakevenCash(g, taxRate, N) : null;
  const curEV = cur ? evCents(g, cur, taxRate, N) : null;

  const lowCents = (eLow(g) / g.price) * 100;
  els.verdict.innerHTML = curEV != null
    ? `At today's <b>${fmtUSD(cur)}</b> cash jackpot, a ${g.label} ticket returns about
       <b>${curEV.toFixed(1)}&cent; per $1</b>${N > 0 ? " (with splitting)" : ""} after a
       ${(taxRate * 100).toFixed(0)}% tax — still a losing bet. It would take a
       <b>${fmtUSD(beTax)}</b> cash jackpot just to break even${N > 0 ? `, or <b>${fmtUSD(beSplit)}</b> once you account for splitting` : ""}.`
    : `A ${g.label} ticket's fixed prizes alone are worth <b>${lowCents.toFixed(1)}&cent; per $1</b>.
       It takes a <b>${fmtUSD(beTax)}</b> cash jackpot for the whole ticket to break even after a
       ${(taxRate * 100).toFixed(0)}% tax.`;

  const cards = [
    ["Break even (pre-tax)", beGross, `Where EV = the $${g.price} ticket, ignoring tax.`],
    ["Break even (after tax)", beTax, `After a ${(taxRate * 100).toFixed(0)}% tax on winnings.`],
  ];
  if (N > 0) cards.push(["Break even (after tax + splitting)", beSplit, `If ${(N / 1e6).toLocaleString()}M tickets are sold, you'd usually share the jackpot.`]);
  els.cards.innerHTML = cards.map(([title, val, sub]) => `
    <section class="panel result">
      <div class="result__top"><h2>${title}</h2></div>
      <div class="result__value">${fmtUSD(val)}</div>
      <ul class="meta"><li><span class="k">${sub}</span></li></ul>
    </section>`).join("");

  renderChart(g, taxRate, N, cur, beTax);
}

function renderChart(g, taxRate, N, cur, beTax) {
  const t = theme();
  const maxX = Math.max(beTax * 1.3, cur * 1.5, 1e9);
  const step = maxX / 60;
  const xs = [];
  for (let c = 0; c <= maxX; c += step) xs.push(c);

  const datasets = [
    { label: "EV after tax", data: xs.map((c) => evCents(g, c, taxRate, 0)), borderColor: t.accent, borderWidth: 2, pointRadius: 0, tension: 0.1 },
  ];
  if (N > 0) datasets.push({ label: "EV after tax + splitting", data: xs.map((c) => evCents(g, c, taxRate, N)), borderColor: t.accent2, borderWidth: 2, pointRadius: 0, tension: 0.1 });
  datasets.push({ label: "Break-even (100¢)", data: xs.map(() => 100), borderColor: t.textDim, borderWidth: 1, borderDash: [5, 4], pointRadius: 0 });

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("be-chart"), {
    type: "line",
    data: { labels: xs.map((c) => fmtUSD(c)), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: t.textDim, usePointStyle: true, pointStyle: "line" } },
        tooltip: { callbacks: { title: (i) => `Cash jackpot ${i[0].label}`, label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}¢ / $1` } },
      },
      scales: {
        x: { ticks: { color: t.textDim, maxTicksLimit: 8 }, grid: { display: false } },
        y: { ticks: { color: t.textDim, callback: (v) => `${v}¢` }, grid: { color: t.border }, title: { display: true, text: "Value per $1", color: t.textDim } },
      },
    },
  });
}

init();

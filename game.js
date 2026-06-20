// Per-game detail page. Reads ?game=<key>, then renders that game's stats,
// charts, and full prize table. Shared helpers come from common.js.

const charts = [];

function gameKey() {
  return new URLSearchParams(location.search).get("game");
}

const fmtOdds = (n) => `1 in ${Math.round(n).toLocaleString()}`;
const fmtPrize = (n) => (n >= 1e6 ? fmtMoney(n) : `$${n.toLocaleString()}`);
const cents1 = (c) => `${c.toFixed(1)}¢`;

async function init() {
  const key = gameKey();
  const meta = GAME_META[key];
  const titleEl = document.getElementById("game-title");

  if (!meta) {
    titleEl.textContent = "Lottery not found";
    document.getElementById("detail").innerHTML =
      `<div class="error">Unknown game "${key ?? ""}". <a href="index.html">Back to all lotteries</a>.</div>`;
    return;
  }

  try {
    const data = await loadData();
    const g = data.games[key];
    if (!g) throw new Error(`no data for ${key}`);
    render(key, g, data);
  } catch (err) {
    titleEl.textContent = meta.label;
    document.getElementById("detail").innerHTML =
      `<div class="error">Couldn't load data.json (${err.message}). If you opened this
       file directly, serve it over HTTP — e.g. <code>python -m http.server</code>.</div>`;
    console.error(err);
  }
}

function render(key, g, data) {
  const meta = GAME_META[key];
  const taxFactor = data.assumptions?.tax_factor ?? 0.63;

  setMeta({
    title: `Is ${meta.label} Worth Playing? EV & Odds | NumbersIntel`,
    description: `${meta.label}: live jackpot, cash value, and the real expected value per $1 across every prize tier — plus odds and the latest winning numbers.`,
    url: `${SITE}/game.html?game=${key}`,
  });
  document.getElementById("game-title").textContent = meta.label;
  document.getElementById("game-sub").textContent =
    `Draws ${meta.draws} · $${g.ticket_price} per play`;

  const items = contributions(g, meta, taxFactor);
  const jackpotCents = items[0].cents;
  const secondaryCents = items.slice(1).reduce((s, it) => s + it.cents, 0);
  // Reconcile the displayed total with its parts (same approach as the cards).
  const jc = +jackpotCents.toFixed(1);
  const sc = +secondaryCents.toFixed(1);
  const totalCents = jc + sc;

  const balls = (g.winning_numbers || [])
    .map((n) => `<span class="ball">${n}</span>`)
    .join("");
  const special = g[meta.specialKey];
  const specialBall =
    special != null
      ? `<span class="ball ball--special" title="${meta.specialName}">${special}</span>`
      : "";

  const isMega = (g.prize_multiplier ?? 1) !== 1;

  const tierRows = items
    .map(
      (it) => `
      <tr class="${it.kind === "jackpot" ? "is-jackpot" : ""}">
        <td>${it.label}</td>
        <td class="num">${it.kind === "jackpot" ? fmtMoney(it.prize) : fmtPrize(it.prize)}</td>
        <td class="num">${fmtOdds(it.odds)}</td>
        <td class="num">${it.cents.toFixed(2)}¢</td>
      </tr>`
    )
    .join("");

  document.getElementById("detail").innerHTML = `
    <section class="stat-strip">
      <div class="stat"><div class="stat__label">Estimated jackpot</div><div class="stat__value">${fmtMoney(g.jackpot)}</div></div>
      <div class="stat"><div class="stat__label">Cash value</div><div class="stat__value">${fmtMoney(g.cash_value)}</div></div>
      <div class="stat"><div class="stat__label">Value per $1</div><div class="stat__value">${cents1(totalCents)}</div></div>
      <div class="stat"><div class="stat__label">Jackpot odds</div><div class="stat__value">1 in ${g.odds_jackpot.toLocaleString()}</div></div>
      <div class="stat"><div class="stat__label">Next draw</div><div class="stat__value">${fmtDate(g.next_draw)}</div></div>
    </section>

    <a class="panel hist-cta" href="history.html?game=${key}">
      <div>
        <h2>View historical data</h2>
        <p>${meta.label} jackpots &amp; cash values over time, every winning number,
          and an adjustable date range.</p>
      </div>
      <span class="btn">Open history &rarr;</span>
    </a>

    <a class="panel hist-cta" href="numbers.html?game=${key}">
      <div>
        <h2>Hot &amp; cold numbers</h2>
        <p>Which ${meta.label} numbers come up most, which are overdue, and the full
          frequency chart across every past draw.</p>
      </div>
      <span class="btn">See the numbers &rarr;</span>
    </a>

    <div class="detail-grid">
      <section class="panel">
        <h2>Where your value comes from</h2>
        <div class="mini-chart mini-chart--doughnut"><canvas id="doughnut"></canvas></div>
        <p class="ev-split">
          <span><b>${cents1(jc)}</b> from jackpot</span>
          <span><b>${cents1(sc)}</b> from smaller prizes</span>
        </p>
      </section>

      <section class="panel">
        <h2>Most recent numbers</h2>
        <div class="numbers numbers--lg">${balls}${specialBall}</div>
        <ul class="meta">
          <li><span class="k">Draw days</span><span class="v">${meta.draws}</span></li>
          <li><span class="k">Ticket price</span><span class="v">$${g.ticket_price}</span></li>
          <li><span class="k">Next draw</span><span class="v">${fmtDate(g.next_draw)}</span></li>
        </ul>
      </section>
    </div>

    <section class="panel">
      <h2>Value per $1 by prize tier</h2>
      <div class="mini-chart mini-chart--bar-lg"><canvas id="tierbar"></canvas></div>
    </section>

    <section class="panel">
      <h2>Prize tiers</h2>
      <table class="tier-table">
        <thead>
          <tr><th>Tier</th><th class="num">Prize</th><th class="num">Odds</th><th class="num">Value / $1</th></tr>
        </thead>
        <tbody>${tierRows}</tbody>
      </table>
      ${isMega ? `<p class="table-note">Mega Millions applies a random 2&times;&ndash;10&times;
        multiplier (~3&times; on average) to every non-jackpot prize; the
        <em>Value / $1</em> column reflects that average. Jackpot prize shown is the cash option.</p>`
      : `<p class="table-note">Jackpot prize shown is the cash option. Values are after an assumed
        ${Math.round((1 - taxFactor) * 100)}% tax, per $1 of ticket cost.</p>`}
    </section>

    <section class="panel viz-cta">
      <div>
        <h2>See your odds as dots</h2>
        <p>One red dot is your ticket; every other outcome is a white dot. Pick how
          many lines you buy and watch the field of dots it takes to find the winner.</p>
      </div>
      <a class="btn" href="visualizer.html?game=${key}">Open the odds visualizer &rarr;</a>
    </section>
  `;

  renderCharts(items, jackpotCents, secondaryCents);
}

function renderCharts(items, jackpotCents, secondaryCents) {
  const t = theme();
  charts.forEach((c) => c.destroy());
  charts.length = 0;

  charts.push(new Chart(document.getElementById("doughnut"), {
    type: "doughnut",
    data: {
      labels: ["Jackpot", "Smaller prizes"],
      datasets: [{ data: [jackpotCents, secondaryCents], backgroundColor: [t.accent, t.accent2], borderColor: t.surface, borderWidth: 2 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom", labels: { color: t.textDim, usePointStyle: true, pointStyle: "circle", padding: 14 } },
        tooltip: {
          callbacks: {
            label: (c) => {
              const total = jackpotCents + secondaryCents;
              const pct = total ? Math.round((c.parsed / total) * 100) : 0;
              return `${c.label}: ${c.parsed.toFixed(1)}¢ (${pct}%)`;
            },
          },
        },
      },
    },
  }));

  const sorted = [...items].sort((a, b) => b.cents - a.cents);
  const barEl = document.getElementById("tierbar");
  barEl.parentElement.style.height = `${sorted.length * 30 + 30}px`;
  charts.push(new Chart(barEl, {
    type: "bar",
    data: {
      labels: sorted.map((it) => it.label),
      datasets: [{
        data: sorted.map((it) => +it.cents.toFixed(3)),
        backgroundColor: sorted.map((it) => (it.kind === "jackpot" ? t.accent : t.accent2)),
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.parsed.x.toFixed(2)}¢ per $1` } },
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: t.textDim, callback: (v) => `${v}¢` }, grid: { color: t.border } },
        y: { ticks: { color: t.textDim, font: { size: 11 } }, grid: { display: false } },
      },
    },
  }));
}

init();

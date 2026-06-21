// Per-game detail page. Reads ?game=<key>, then renders that game's stats,
// charts, and full prize table. Shared helpers come from common.js.

const charts = [];

// States we cover, for the "Back to <state>" link when arriving from a state page.
const STATE_NAMES = { NY: "New York", TX: "Texas", CA: "California", ID: "Idaho", PA: "Pennsylvania", FL: "Florida" };

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

  // Back link follows where the user came from: ?back=<state> (a state page),
  // ?back=national (the National Drawings menu), else the game's own default.
  const back = document.querySelector(".back-link");
  if (back) {
    const from = new URLSearchParams(location.search).get("back");
    if (from === "home") {
      back.href = "index.html";
      back.innerHTML = "&larr; Home";
    } else if (from === "national") {
      back.href = "national.html";
      back.innerHTML = "&larr; National drawings";
    } else if (from) {
      back.href = `state.html?state=${from}`;
      back.innerHTML = `&larr; Back to ${STATE_NAMES[from] || meta.stateName || from}`;
    } else if (meta.state) {
      back.href = `state.html?state=${meta.state}`;
      back.innerHTML = `&larr; Back to ${meta.stateName || meta.state}`;
    }
  }

  try {
    const data = await loadData();
    const g = data.games[key];
    if (g) {
      render(key, g, data); // national game: full EV treatment
    } else {
      // State game (no jackpot/EV): build modules from its draw history.
      const hist = await fetch(`./history/${key}.json`, { cache: "no-store" }).then((r) => r.json());
      renderStateGame(key, meta, hist);
    }
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

  // Break-even jackpot: the cash value at which EV per $1 reaches 1.0 (positive
  // expected value), holding secondary-prize value constant.
  const secPerDollar = g.ev_breakdown?.secondary ?? 0;
  const cashBreakeven = g.odds_jackpot * (g.ticket_price / taxFactor) * (1 - secPerDollar);
  const cashRatio = g.jackpot ? g.cash_value / g.jackpot : 0.5;
  const advBreakeven = cashRatio ? cashBreakeven / cashRatio : cashBreakeven;
  const timesBigger = g.jackpot ? advBreakeven / g.jackpot : 0;

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

    <section class="panel">
      <h2>When does the math break even?</h2>
      <p>A ${meta.label} ticket only crosses into positive expected value — more than $1 of value
        back for every $1 spent — at a staggering jackpot:</p>
      <div class="stat-strip">
        <div class="stat"><div class="stat__label">Break-even jackpot</div><div class="stat__value">${fmtMoney(advBreakeven)}</div></div>
        <div class="stat"><div class="stat__label">Break-even cash value</div><div class="stat__value">${fmtMoney(cashBreakeven)}</div></div>
        <div class="stat"><div class="stat__label">vs. today's jackpot</div><div class="stat__value">${timesBigger.toFixed(1)}× bigger</div></div>
      </div>
      <p class="table-note">And even then this ignores the risk of splitting the jackpot with another
        winner, which rises as jackpots grow. In practice, no lottery ticket is ever a
        positive-value bet.</p>
    </section>

    <section class="panel viz-cta">
      <div>
        <h2>See your odds as dots</h2>
        <p>One red dot is your ticket; every other outcome is a white dot. Pick how
          many lines you buy and watch the field of dots it takes to find the winner.</p>
      </div>
      <a class="btn" href="visualizer.html?game=${key}">Open the odds visualizer &rarr;</a>
    </section>

    <section class="panel viz-cta">
      <div>
        <h2>Lump sum or annuity?</h2>
        <p>If you won the ${meta.label} jackpot, would the cash or the 30-year annuity be worth
          more? Run the after-tax, present-value math.</p>
      </div>
      <a class="btn" href="calculator.html?game=${key}">Annuity vs. cash &rarr;</a>
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

// NY Lotto value section: per-tier value-per-$1 chart + a prize-tier table with
// each tier's realized payout and NY winner count from the latest draw.
function nyValueSection(meta, items, prizeDate) {
  const isJackpotGame = !!meta.ev.odds_jackpot;
  const isStatic = !!meta.ev.staticPrizes; // fixed prizes, no per-draw winner data (e.g. Idaho Cash)
  const isFixed = !isJackpotGame && Object.values(meta.ev.levels).every((l) => l.prize != null);
  const showWinners = items.some((it) => it.winners != null);
  const rows = items
    .map((it) => {
      const prize =
        it.prize == null ? "&mdash;"
        : typeof it.prize === "string" ? it.prize
        : it.prize >= 1e6 ? fmtMoney(it.prize)
        : `$${it.prize.toLocaleString()}`;
      return `
      <tr class="${it.kind === "jackpot" ? "is-jackpot" : ""}">
        <td>${it.label}</td>
        <td class="num">${prize}</td>
        ${showWinners ? `<td class="num">${it.winners != null ? it.winners.toLocaleString() : "&mdash;"}</td>` : ""}
        <td class="num">${fmtOdds(it.odds)}</td>
        <td class="num">${it.cents.toFixed(2)}¢</td>
      </tr>`;
    })
    .join("");
  const tax = "after an assumed 37% tax";
  const overall = `Overall odds of any prize: 1 in ${meta.ev.overall_odds}.`;
  const winnersWord = meta.ev.winnersLabel || "NY winners";
  const twoPlays = meta.ev.ticket_price < 1 ? " (a $1 ticket buys two plays)" : "";
  const hasFree = Object.values(meta.ev.levels).some((l) => l.free);
  const note = meta.ev.note // explicit override for games the auto-text can't describe (e.g. progressive jackpot + fixed lower tiers)
    ? meta.ev.note
    : isStatic
    ? `${meta.label}'s jackpot is paid in cash; the lower tiers pay fixed amounts${hasFree ? " (the lowest is a free play, valued at one ticket)" : ""}.
       <em>Value / $1</em> prices the jackpot at the current cash jackpot plus those fixed prizes, ${tax}. ${overall}`
    : isJackpotGame
    ? `Prize amounts and winner counts are the actual results of the ${fmtDate(prizeDate)} draw.
       ${meta.label}'s non-jackpot tiers are <em>pari-mutuel</em>, so those payouts move every draw with
       ticket sales and the number of winners. <em>Value / $1</em> prices the jackpot at the upcoming
       cash option and uses that draw's realized lower-tier payouts, ${tax}${twoPlays}. ${overall}`
    : isFixed
    ? `${meta.label}'s prizes are fixed (shown here); the winner counts are the actual results of the
       ${fmtDate(prizeDate)} draw. <em>Value / $1</em> is ${tax}. ${overall}`
    : `Prize amounts and winner counts are the actual results of the ${fmtDate(prizeDate)} draw.
       ${meta.label}'s prizes are <em>pari-mutuel</em>, so they move every draw with sales and the number
       of winners${hasFree ? "; the lowest tier is a free play (valued at one ticket)" : ""}.
       <em>Value / $1</em> is ${tax}. ${overall}`;
  return `
    <section class="panel">
      <h2>Value per $1 by prize tier</h2>
      <div class="mini-chart mini-chart--bar-lg"><canvas id="ny-tierbar"></canvas></div>
    </section>

    <section class="panel">
      <h2>Prize tiers, payouts${showWinners ? " &amp; winners" : " &amp; value"}</h2>
      <table class="tier-table">
        <thead>
          <tr><th>Tier</th><th class="num">Prize</th>${showWinners ? `<th class="num">${winnersWord}</th>` : ""}<th class="num">Odds</th><th class="num">Value / $1</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="table-note">${note}</p>
    </section>`;
}

// Prize/payout section for games whose payout isn't a single "value per $1"
// (digit games, keno, annuity games): a live "winners by tier/type" table from the
// latest draw plus an optional static payout reference. Driven by meta.prizes.
function renderPrizesSection(meta, lastPrized) {
  const cfg = meta.prizes;
  let live = "";
  if (lastPrized && lastPrized.prizes && lastPrized.prizes.length) {
    const ps = lastPrized.prizes;
    const odds = cfg.odds || {};
    const lblOf = (p) => p.label ?? p.level; // NY prizes use "label", Texas use "level"
    const hasAmt = ps.some((p) => p.amount != null);
    const hasOdds = ps.some((p) => odds[lblOf(p)] != null);
    const body = ps.map((p) => {
      const lbl = lblOf(p);
      const amt = p.amount == null ? "&mdash;"
        : typeof p.amount === "string" ? p.amount
        : p.amount >= 1e6 ? fmtMoney(p.amount)
        : `$${p.amount.toLocaleString()}`;
      const o = odds[lbl] != null ? fmtOdds(odds[lbl]) : "&mdash;";
      return `<tr>
        <td>${lbl}</td>
        ${hasAmt ? `<td class="num">${amt}</td>` : ""}
        ${hasOdds ? `<td class="num">${o}</td>` : ""}
        <td class="num">${(p.winners ?? 0).toLocaleString()}</td>
      </tr>`;
    }).join("");
    live = `
    <section class="panel">
      <h2>${cfg.winnersTitle || "Prize tiers &amp; winners"}</h2>
      ${cfg.note ? `<p class="section-note">${cfg.note}</p>` : ""}
      <table class="tier-table">
        <thead><tr>
          <th>${cfg.tierLabel || "Tier"}</th>
          ${hasAmt ? `<th class="num">Prize</th>` : ""}
          ${hasOdds ? `<th class="num">Odds</th>` : ""}
          <th class="num">${cfg.winnersLabel || "NY winners"} · ${fmtDate(lastPrized.date)}</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
  }
  let ref = "";
  if (cfg.reference) {
    const r = cfg.reference;
    const head = r.columns.map((c, i) => `<th${i ? ' class="num"' : ""}>${c}</th>`).join("");
    const rowsHtml = r.rows
      .map((row) => `<tr>${row.cells.map((c, i) => `<td${i ? ' class="num"' : ""}>${c}</td>`).join("")}</tr>`)
      .join("");
    ref = `
    <section class="panel">
      <h2>${r.title}</h2>
      <table class="tier-table"><thead><tr>${head}</tr></thead><tbody>${rowsHtml}</tbody></table>
      ${r.note ? `<p class="table-note">${r.note}</p>` : ""}
    </section>`;
  }
  return live + ref;
}

// State-game detail page (no jackpot/EV): stat strip, latest numbers, hottest
// list, and a number-frequency chart, built from the game's draw history.
function renderStateGame(key, meta, data) {
  const draws = (data.draws || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const titleEl = document.getElementById("game-title");
  if (!draws.length) {
    titleEl.textContent = meta.label;
    document.getElementById("detail").innerHTML = `<div class="error">No data yet for ${meta.label}.</div>`;
    return;
  }
  const total = draws.length;
  const sinceYear = draws[0].date.slice(0, 4);

  // Games with realized prize/winner data (nylottery.ny.gov) get a value treatment
  // over the frequency modules. NY Lotto also has a live jackpot + cash value;
  // Take 5 / Pick 10 don't (hasEv without hasJackpot). No prize data → frequency only.
  const cur = data.current_jackpot;
  const lastPrized = [...draws].reverse().find((d) => d.prizes && d.prizes.length);
  // Fixed-prize games with no per-draw prize/winner data (e.g. Idaho Cash) synthesize
  // a prize set from the static config so the value/$1 treatment still applies.
  const evSource = lastPrized || (meta.ev && meta.ev.staticPrizes && draws.length
    ? { date: draws[draws.length - 1].date, prizes: Object.keys(meta.ev.levels).map((level) => ({ level })) }
    : null);
  const hasEv = !!(meta.ev && evSource);
  const hasJackpot = !!(hasEv && meta.ev.odds_jackpot && cur && cur.cash);
  const taxFactor = 0.63;
  let evItems = [];
  let totalCents = 0;
  if (hasEv) {
    evItems = nyEvItems(meta.ev, evSource, hasJackpot ? cur.cash : null, taxFactor);
    totalCents = evItems.reduce((s, it) => s + it.cents, 0);
  }
  // Jackpot game with a live jackpot but no cash value / EV (e.g. Texas Two Step,
  // whose annuity jackpot has no cash option). Takes priority over a prizes table
  // so it keeps the jackpot stat strip — but it can still render that table below.
  const hasJackpotStat = !hasEv && !!(cur && cur.jackpot && meta.oddsJackpot);
  // Games whose payout isn't a single value/$1 (digit/keno/annuity): prize tables.
  const hasPrizeCfg = !hasEv && !hasJackpotStat && !!meta.prizes;

  const retired = !!(meta.prizes && meta.prizes.retired);
  const sn = meta.stateName || "";
  setMeta({
    title: hasJackpot
      ? `Is ${meta.label} Worth Playing? Jackpot, Odds & EV | NumbersIntel`
      : hasEv
      ? `${meta.label}: Payouts, Winners, Odds & Value per $1 | NumbersIntel`
      : hasPrizeCfg
      ? `${meta.label}: Payouts, Winners & Results | NumbersIntel`
      : hasJackpotStat
      ? `${meta.label} Jackpot, Results & Odds | NumbersIntel`
      : `${meta.label} Results & Number Frequency | NumbersIntel`,
    description: hasJackpot
      ? `${meta.label}: live jackpot and cash value, expected value per $1 across every prize tier, odds, the latest winning numbers, and ${total.toLocaleString()} past draws since ${sinceYear}.`
      : hasEv
      ? `${meta.label} (${sn}): per-tier payouts and winner counts from the latest draw, odds, value per $1, the latest numbers, and ${total.toLocaleString()} past draws since ${sinceYear}.`
      : hasPrizeCfg
      ? `${meta.label} (${sn}): latest results, payouts and winner counts by prize tier, plus number frequency across ${total.toLocaleString()} past draws since ${sinceYear}.`
      : hasJackpotStat
      ? `${meta.label} (${sn}): the estimated jackpot, latest winning numbers, jackpot odds, and number frequency across ${total.toLocaleString()} past draws since ${sinceYear}.`
      : `${meta.label} (${sn}): latest winning numbers, the most and least drawn numbers, and ${total.toLocaleString()} past draws since ${sinceYear}.`,
    url: `${SITE}/game.html?game=${key}`,
  });
  titleEl.textContent = meta.label;
  document.getElementById("game-sub").textContent = (hasJackpot
    ? `${sn} · draws ${meta.draws} · jackpot ${fmtMoney(cur.jackpot)} · ${total.toLocaleString()} draws since ${sinceYear}`
    : hasEv
    ? `${sn} · draws ${meta.draws} · value per $1 ${cents1(totalCents)} · ${total.toLocaleString()} draws since ${sinceYear}`
    : hasJackpotStat
    ? `${sn} · draws ${meta.draws} · jackpot ${fmtMoney(cur.jackpot)} · ${total.toLocaleString()} draws since ${sinceYear}`
    : meta.recentWindow
    ? `${sn} · draws ${meta.draws} · most recent ${total.toLocaleString()} draws`
    : `${sn} · draws ${meta.draws} · ${total.toLocaleString()} draws since ${sinceYear}`)
    + (retired ? " · retired 2026" : "");

  const minN = meta.digits ? 0 : 1; // digit games (Win 4) include 0
  let max = 0;
  draws.forEach((d) => d.numbers.forEach((n) => { if (n > max) max = n; }));
  const count = Array(max + 1).fill(0);
  const lastSeen = Array(max + 1).fill(-1);
  draws.forEach((d, i) => d.numbers.forEach((n) => { count[n]++; lastSeen[n] = i; }));
  const rows = [];
  for (let n = minN; n <= max; n++) rows.push({ n, count: count[n], overdue: lastSeen[n] < 0 ? total : total - 1 - lastSeen[n] });
  const byCount = [...rows].sort((a, b) => b.count - a.count);
  const byOverdue = [...rows].sort((a, b) => b.overdue - a.overdue);

  const latest = draws[draws.length - 1];
  const special = meta.specialKey ? latest[meta.specialKey] : null;
  const balls = latest.numbers.map((n) => `<span class="ball">${n}</span>`).join("") +
    (special != null ? `<span class="ball ball--special">${special}</span>` : "");

  // Daily Derby: a "latest race" panel — the three placed horses (with names) and
  // the race time — since its draw isn't a plain set of numbers.
  const DERBY_POS = ["1st", "2nd", "3rd"];
  const derbyHtml = meta.derby && latest.horses ? `
    <section class="panel">
      <h2>Latest race &mdash; ${fmtDate(latest.date)}</h2>
      <div class="derby-race">
        ${latest.horses.map((h, i) => `
          <div class="derby-horse">
            <span class="derby-pos">${DERBY_POS[i] || `${i + 1}th`}</span>
            <span class="ball">${h.num}</span>
            <span class="derby-name">${h.name || ""}</span>
          </div>`).join("")}
      </div>
      ${latest.race_time ? `<ul class="meta"><li><span class="k">Winning race time</span><span class="v">${latest.race_time}</span></li></ul>` : ""}
    </section>` : "";
  const freqRow = (r) => `
    <div class="freq-row">
      <span class="ball ball--sm">${r.n}</span>
      <span class="freq-bar"><span class="freq-bar__fill" style="width:${(r.count / byCount[0].count) * 100}%"></span></span>
      <span class="freq-val">${r.count}&times;</span>
    </div>`;

  document.getElementById("detail").innerHTML = `
    ${hasJackpot ? `
    <section class="stat-strip">
      <div class="stat"><div class="stat__label">Estimated jackpot</div><div class="stat__value">${fmtMoney(cur.jackpot)}</div></div>
      <div class="stat"><div class="stat__label">Cash value</div><div class="stat__value">${fmtMoney(cur.cash)}</div></div>
      <div class="stat"><div class="stat__label">Value per $1</div><div class="stat__value">${cents1(totalCents)}</div></div>
      <div class="stat"><div class="stat__label">Jackpot odds</div><div class="stat__value">1 in ${meta.ev.odds_jackpot.toLocaleString()}</div></div>
      <div class="stat"><div class="stat__label">Next draw</div><div class="stat__value">${fmtDate(cur.date)}</div></div>
    </section>` : hasEv ? `
    <section class="stat-strip">
      <div class="stat"><div class="stat__label">Value per $1</div><div class="stat__value">${cents1(totalCents)}</div></div>
      <div class="stat"><div class="stat__label">Odds of any prize</div><div class="stat__value">1 in ${meta.ev.overall_odds}</div></div>
      <div class="stat"><div class="stat__label">${meta.ev.winnersLabel || "NY winners"} (last draw)</div><div class="stat__value">${(evSource.total_winners || 0).toLocaleString()}</div></div>
      <div class="stat"><div class="stat__label">Draws on record</div><div class="stat__value">${total.toLocaleString()}</div></div>
      <div class="stat"><div class="stat__label">Latest draw</div><div class="stat__value">${fmtDate(latest.date)}</div></div>
    </section>` : hasPrizeCfg ? `
    <section class="stat-strip">
      ${meta.prizes.topPrize ? `<div class="stat"><div class="stat__label">${meta.prizes.topPrizeLabel || "Top prize"}</div><div class="stat__value">${meta.prizes.topPrize}</div></div>` : ""}
      ${lastPrized ? `<div class="stat"><div class="stat__label">${meta.prizes.winnersLabel || "NY winners"} (last draw)</div><div class="stat__value">${(lastPrized.total_winners || 0).toLocaleString()}</div></div>` : ""}
      <div class="stat"><div class="stat__label">${meta.recentWindow ? "Recent draws" : "Draws on record"}</div><div class="stat__value">${total.toLocaleString()}</div></div>
      <div class="stat"><div class="stat__label">Latest draw</div><div class="stat__value">${fmtDate(latest.date)}</div></div>
      <div class="stat"><div class="stat__label">Draw days</div><div class="stat__value">${meta.draws}</div></div>
    </section>` : hasJackpotStat ? `
    <section class="stat-strip">
      <div class="stat"><div class="stat__label">Estimated jackpot</div><div class="stat__value">${fmtMoney(cur.jackpot)}</div></div>
      <div class="stat"><div class="stat__label">Jackpot odds</div><div class="stat__value">1 in ${meta.oddsJackpot.toLocaleString()}</div></div>
      <div class="stat"><div class="stat__label">Draws on record</div><div class="stat__value">${total.toLocaleString()}</div></div>
      <div class="stat"><div class="stat__label">Latest draw</div><div class="stat__value">${fmtDate(latest.date)}</div></div>
      <div class="stat"><div class="stat__label">Draw days</div><div class="stat__value">${meta.draws}</div></div>
    </section>` : `
    <section class="stat-strip">
      <div class="stat"><div class="stat__label">Draws on record</div><div class="stat__value">${total.toLocaleString()}</div></div>
      <div class="stat"><div class="stat__label">Hottest number</div><div class="stat__value">${byCount[0].n}</div></div>
      <div class="stat"><div class="stat__label">Most overdue</div><div class="stat__value">${byOverdue[0].n}</div></div>
      <div class="stat"><div class="stat__label">Latest draw</div><div class="stat__value">${fmtDate(latest.date)}</div></div>
    </section>`}
    ${derbyHtml}
    ${hasEv ? nyValueSection(meta, evItems, evSource.date)
      : hasPrizeCfg ? renderPrizesSection(meta, lastPrized)
      : (hasJackpotStat && meta.prizes) ? renderPrizesSection(meta, lastPrized)
      : ""}

    <div class="detail-grid">
      <section class="panel">
        <h2>Latest numbers</h2>
        <div class="numbers numbers--lg">${balls}</div>
        <ul class="meta">
          <li><span class="k">Draw days</span><span class="v">${meta.draws}</span></li>
          ${meta.ticketPrice ? `<li><span class="k">Ticket price</span><span class="v">${meta.ticketPrice}</span></li>` : ""}
          ${meta.cashValue ? `<li><span class="k">Cash value</span><span class="v">${meta.cashValue}</span></li>` : ""}
          <li><span class="k">Records since</span><span class="v">${fmtDate(draws[0].date)}</span></li>
          <li><span class="k">Total draws</span><span class="v">${total.toLocaleString()}</span></li>
        </ul>
      </section>
      <section class="panel">
        <h2>Hottest numbers</h2>
        <div class="freq-list">${byCount.slice(0, 6).map(freqRow).join("")}</div>
      </section>
    </div>

    <section class="panel">
      <h2>${meta.digits ? "Digit" : "Number"} frequency</h2>
      <p class="section-note">How often each ${meta.digits ? "digit (0&ndash;9)" : `number (1&ndash;${max})`} has come up across ${total.toLocaleString()} ${meta.recentWindow ? "recent draws" : "draws"}. Frequency is descriptive — draws are independent.</p>
      <div class="mini-chart mini-chart--bar-lg"><canvas id="sg-freq"></canvas></div>
    </section>

    ${vizTiers(meta) ? `
    <section class="panel viz-cta">
      <div>
        <h2>See your odds as dots</h2>
        <p>One red dot is your win; every other outcome is a white dot. Pick a prize tier
          and how many lines you buy, and watch the field of dots it takes to find the winner.</p>
      </div>
      <a class="btn" href="visualizer.html?game=${key}">Open the odds visualizer &rarr;</a>
    </section>` : ""}
    ${meta.forLife ? `
    <section class="panel viz-cta">
      <div>
        <h2>Payments for life, or the cash?</h2>
        <p>${meta.forLife.prizeLabel}, or a one-time ${fmtMoney(meta.forLife.cash)} lump sum?
          Run the after-tax, present-value math for your age and life expectancy.</p>
      </div>
      <a class="btn" href="lifecalc.html?game=${key}">Payments vs. cash &rarr;</a>
    </section>` : ""}
    <a class="panel hist-cta" href="numbers.html?game=${key}">
      <div><h2>Hot &amp; cold numbers</h2><p>Full frequency and most-overdue analysis for every ${meta.label} number.</p></div>
      <span class="btn">See the numbers &rarr;</span>
    </a>
    <a class="panel hist-cta" href="history.html?game=${key}">
      <div><h2>All past results</h2><p>Every ${meta.label} draw, searchable by date.</p></div>
      <span class="btn">Open results &rarr;</span>
    </a>`;

  const t = theme();
  charts.push(new Chart(document.getElementById("sg-freq"), {
    type: "bar",
    data: {
      labels: rows.map((r) => r.n),
      datasets: [{
        data: rows.map((r) => r.count),
        backgroundColor: rows.map((r) => (r.n === byCount[0].n ? t.accent : t.accent2)),
        borderRadius: 2,
        maxBarThickness: 22,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: (i) => `Number ${i[0].label}`, label: (c) => `Drawn ${c.parsed.y}× of ${total}` } },
      },
      scales: {
        x: { ticks: { color: t.textDim, autoSkip: true, maxTicksLimit: 20, maxRotation: 0 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: t.textDim, precision: 0 }, grid: { color: t.border } },
      },
    },
  }));

  if (hasEv) {
    const sorted = [...evItems].sort((a, b) => b.cents - a.cents);
    const barEl = document.getElementById("ny-tierbar");
    barEl.parentElement.style.height = `${sorted.length * 32 + 30}px`;
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
}

init();

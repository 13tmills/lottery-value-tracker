// Home page — a card per game, each linking to its own detail page.
// Shared helpers (GAME_META, fmtMoney, fmtDate) come from common.js.

async function init() {
  const cards = document.getElementById("cards");
  try {
    const data = await loadData();
    render(data);
  } catch (err) {
    cards.innerHTML = `<div class="error">Couldn't load data.json (${err.message}).
      If you opened this file directly, serve it over HTTP instead —
      e.g. <code>python -m http.server</code> in this folder.</div>`;
    document.getElementById("last-updated").textContent = "";
    console.error(err);
  }
}

function render(data) {
  const updated = new Date(data.last_updated);
  document.getElementById("last-updated").textContent =
    `Last updated ${updated.toLocaleString()}`;

  // Order games best-to-worst by value per dollar.
  const entries = Object.entries(data.games)
    .filter(([key]) => GAME_META[key])
    .sort((a, b) => b[1].expected_value - a[1].expected_value);

  renderCards(entries);
  renderM4L(); // Millionaire For Life — a national for-life game (no rolling jackpot/EV)
  renderNationalBestValue(data); // hero widget above the cards: best value across ALL states
}

// "Best value tickets in America right now" — the hook at the top of the national page.
// Ranks EVERY game on the site (all 12 states + the multi-state jackpots) by value per
// $1, reusing the shared valuePer1Cents from common.js. Renders async so it never blocks
// the jackpot cards; the EV games it fetches are force-cached and shared with the rest of
// the site, so navigating to a state page afterwards is instant.
async function renderNationalBestValue(data) {
  const slot = document.getElementById("national-best-value");
  if (!slot) return;
  slot.innerHTML = `<div class="best-natl best-natl--loading">
      <span class="best-natl__spark">&#9733;</span> Crunching every game in the country for the best value per dollar&hellip;
    </div>`;

  const isNatl = (key) => !!(data && data.games && data.games[key]);
  const keys = Object.keys(GAME_META).filter((k) => {
    const m = GAME_META[k];
    return !(m.retired || (m.prizes && m.prizes.retired));
  });

  const scored = await Promise.all(keys.map(async (key) => {
    const cents = await valuePer1Cents(key, GAME_META[key], data);
    return cents != null && isFinite(cents) && cents > 0 ? { key, cents } : null;
  }));
  const ranked = scored.filter(Boolean).sort((a, b) => b.cents - a.cents);
  if (ranked.length < 3) { slot.innerHTML = ""; return; }

  const stateCount = new Set(Object.values(GAME_META).map((m) => m.state).filter(Boolean)).size;
  const top = ranked.slice(0, 12);
  const best = GAME_META[top[0].key];

  const rows = top.map((r, i) => {
    const m = GAME_META[r.key];
    const badge = isNatl(r.key) ? "Multi-state" : (m.state || "");
    const tag = m.digits ? `<span class="best-row__tag">straight play</span>` : "";
    return `<a class="best-row${i === 0 ? " best-row--top" : ""}" href="game.html?game=${r.key}&back=national">
        <span class="best-row__rank">${i + 1}</span>
        <span class="best-row__name">${m.label}
          <span class="best-natl__badge">${badge}</span>${tag}</span>
        <span class="best-row__cents">${r.cents.toFixed(1)}&cent;<span class="best-row__per">/$1</span></span>
      </a>`;
  }).join("");

  slot.innerHTML = `
    <section class="best-natl" aria-labelledby="best-natl-heading">
      <span class="best-natl__eyebrow">&#9733; Best value tickets in America right now</span>
      <h2 id="best-natl-heading" class="best-natl__title">
        <a href="game.html?game=${top[0].key}&back=national">${best.label}</a>
        <span class="best-natl__where">${best.stateName || "Multi-state"}</span>
      </h2>
      <p class="best-natl__lead">Out of every game we track — <b>${stateCount} states</b> plus the national
        jackpots — <b>${best.label}</b> returns the most per dollar right now:
        <b>${top[0].cents.toFixed(1)}&cent; on every $1</b>. They're all a losing bet long-term; these are
        simply the least-bad ones in the country today.</p>
      <div class="best-natl__rank">${rows}</div>
      <p class="best-natl__note">Ranked by value per $1 after an assumed 37% tax, across all
        ${ranked.length} games with a comparable value: jackpot games summed over every prize tier
        (live cash jackpots for the multi-state games), digit games at a $1 straight play. Keno and
        pari-mutuel games whose lower-tier payouts aren't published aren't ranked. Not financial advice.</p>
    </section>`;
}

// Appends a Millionaire For Life card. It has fixed/for-life prizes rather than a
// rolling jackpot, so it's shown after the EV-ranked games with its top prize.
async function renderM4L() {
  const meta = GAME_META.ny_m4l;
  if (!meta) return;
  let latest = null;
  try {
    const hist = await fetch("./history/ny_m4l.json", { cache: "no-store" }).then((r) => r.json());
    latest = (hist.draws || []).slice(-1)[0];
  } catch (e) { /* card still renders without the latest numbers */ }

  const balls = latest
    ? latest.numbers.map((n) => `<span class="ball">${n}</span>`).join("") +
      (latest.mill_ball != null ? `<span class="ball ball--special" title="Mill Ball">${latest.mill_ball}</span>` : "")
    : "";

  const card = document.createElement("article");
  card.className = "card card--flat";
  card.innerHTML = `
    <div class="card__top">
      <h3 class="card__name">${meta.label}</h3>
      <span class="rank">For life</span>
    </div>
    <div class="jackpot"><span class="jackpot__label">Top prize</span>${meta.prizes.topPrize}</div>
    <ul class="meta">
      ${meta.cashValue ? `<li><span class="k">Cash value</span><span class="v">${meta.cashValue}</span></li>` : ""}
      <li><span class="k">Ticket price</span><span class="v">${meta.ticketPrice}</span></li>
      <li><span class="k">Draws</span><span class="v">${meta.draws}</span></li>
      ${latest ? `<li><span class="k">Latest draw</span><span class="v">${fmtDate(latest.date)}</span></li>` : ""}
    </ul>
    ${balls ? `<div class="numbers" title="Most recent winning numbers">${balls}</div>` : ""}
    <a class="card__link" href="game.html?game=ny_m4l&back=national">More details &rarr;</a>`;
  document.getElementById("cards").appendChild(card);
}

function renderCards(entries) {
  const cards = document.getElementById("cards");
  cards.innerHTML = "";

  entries.forEach(([key, g], i) => {
    const meta = GAME_META[key];
    const special = g[meta.specialKey];
    const isBest = i === 0;

    const balls = (g.winning_numbers || [])
      .map((n) => `<span class="ball">${n}</span>`)
      .join("");
    const specialBall =
      special != null
        ? `<span class="ball ball--special" title="${meta.specialName}">${special}</span>`
        : "";

    const b = g.ev_breakdown || {};
    // Round each part to the displayed precision first, then derive the total
    // from those, so the card's arithmetic always adds up on screen.
    const hasSplit = b.jackpot != null;
    const jc = hasSplit ? +(b.jackpot * 100).toFixed(1) : null;
    const sc = hasSplit ? +(b.secondary * 100).toFixed(1) : null;
    const totalCents = hasSplit ? jc + sc : +(g.expected_value * 100).toFixed(1);

    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="card__top">
        <h3 class="card__name">${meta.label}</h3>
        <span class="rank ${isBest ? "rank--best" : ""}">
          ${isBest ? "Best value" : `#${i + 1} value`}
        </span>
      </div>

      <div class="jackpot">
        <span class="jackpot__label">Estimated jackpot</span>
        ${fmtMoney(g.jackpot)}
      </div>

      <div class="ev-box">
        <span class="ev-box__value">${totalCents.toFixed(1)}¢</span>
        <span class="ev-box__label">value per $1 spent</span>
      </div>
      ${hasSplit ? `
      <p class="ev-split">
        <span><b>${jc.toFixed(1)}¢</b> from jackpot</span>
        <span><b>${sc.toFixed(1)}¢</b> from smaller prizes</span>
      </p>` : ""}

      <ul class="meta">
        <li><span class="k">Cash value</span><span class="v">${fmtMoney(g.cash_value)}</span></li>
        <li><span class="k">Ticket price</span><span class="v">$${g.ticket_price}</span></li>
        <li><span class="k">Jackpot odds</span><span class="v">1 in ${g.odds_jackpot.toLocaleString()}</span></li>
        <li><span class="k">Next draw</span><span class="v">${fmtDate(g.next_draw)}</span></li>
      </ul>

      <div class="numbers" title="Most recent winning numbers">
        ${balls}${specialBall}
      </div>

      <a class="card__link" href="game.html?game=${key}&back=national">More details &rarr;</a>
    `;
    cards.appendChild(card);
  });
}

init();

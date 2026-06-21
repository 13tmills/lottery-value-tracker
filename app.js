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

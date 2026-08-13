// Scratch-ticket remaining-value tables. Reads scratch_<state>.json (built by
// scraper/gen_scratch_*.ps1) and ranks a state's games by what a ticket is worth
// NOW — unclaimed prize value per dollar spent — rather than at print time.

const SC = { data: null, sort: "ev_now", hideLow: true };

const scMoney = (n) => "$" + Math.round(n).toLocaleString();
const scPct = (p) => (p * 100).toFixed(0) + "%";
const scNum = (n) => Math.round(n).toLocaleString();

function scValueClass(ev) {
  if (ev >= 0.75) return "sc-v--best";
  if (ev >= 0.68) return "sc-v--good";
  if (ev >= 0.62) return "sc-v--mid";
  return "sc-v--low";
}

// Some states (New York) publish prizes but no ticket price, so there is no
// cents-per-dollar figure. Those datasets carry metric:"index" and are rendered
// against a price-independent value index instead.
const scIsIndex = () => SC.data && SC.data.metric === "index";

function scIndexClass(v) {
  if (v >= 1.05) return "sc-v--best";
  if (v >= 0.98) return "sc-v--good";
  if (v >= 0.9) return "sc-v--mid";
  return "sc-v--low";
}

function scRenderIndex(host, games) {
  const rows = games.map((g, i) => {
    const topNote = g.top_left === 0
      ? `<span class="sc-gone">all claimed</span>`
      : `${g.top_left} of ${g.top_original} left`;
    return `<tr>
      <td>${i + 1}</td>
      <th scope="row">${g.name}${g.low_confidence ? ' <span class="sc-flag" title="Over 90% of prizes claimed — index is noisy">late</span>' : ""}</th>
      <td class="${scIndexClass(g.value_index)}"><strong>${g.value_index.toFixed(2)}</strong></td>
      <td>${g.pct_sold.toFixed(1)}%</td>
      <td>${scMoney(g.top_prize)}<br><span class="sc-muted sc-small">${topNote}</span></td>
      <td class="sc-muted">${scMoney(g.prize_value_left)}</td>
    </tr>`;
  }).join("");
  host.innerHTML = `<div class="sr-table-wrap"><table class="sr-table sc-table">
      <thead><tr>
        <th scope="col">#</th><th scope="col">Game</th>
        <th scope="col" title="Share of prize value left vs share of prizes left. 1.00 = its launch mix">Value index</th>
        <th scope="col">% prizes claimed</th><th scope="col">Top prize</th><th scope="col">Prize money left</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
    <p class="section-note">Showing ${games.length} games${SC.hideLow ? ` (${SC.data.games.length - games.length} hidden as more than 90% claimed)` : ""}. Updated ${SC.data.updated}.</p>`;
}

function scRender() {
  const host = document.getElementById("sc-table");
  if (!host || !SC.data) return;

  let games = SC.data.games.slice();
  if (SC.hideLow) games = games.filter((g) => !g.low_confidence);
  const key = SC.sort;

  if (scIsIndex()) {
    games.sort((a, b) => (key === "pct_sold" ? a.pct_sold - b.pct_sold
      : key === "top_prize" ? b.top_prize - a.top_prize
      : b.value_index - a.value_index));
    scRenderIndex(host, games);
    return;
  }

  games.sort((a, b) => (key === "price" ? a.price - b.price
    : key === "pct_sold" ? a.pct_sold - b.pct_sold
    : key === "top_prize" ? b.top_prize - a.top_prize
    : b.ev_now - a.ev_now));

  const rows = games.map((g, i) => {
    const topNote = g.top_left === 0
      ? `<span class="sc-gone">all claimed</span>`
      : `${g.top_left} of ${g.top_original} left`;
    return `<tr>
      <td>${i + 1}</td>
      <th scope="row"><a href="${g.url}" rel="nofollow noopener" target="_blank">${g.name}</a>${g.low_confidence ? ' <span class="sc-flag" title="Over 90% sold — figures unreliable">late</span>' : ""}</th>
      <td>$${g.price}</td>
      <td class="${scValueClass(g.ev_now)}"><strong>${scPct(g.ev_now)}</strong></td>
      <td class="sc-muted">${scPct(g.ev_start)}</td>
      <td>${g.pct_sold.toFixed(1)}%</td>
      <td>${scMoney(g.top_prize)}<br><span class="sc-muted sc-small">${topNote}</span></td>
      <td class="${g.top_share > 0.25 ? "sc-v--mid" : "sc-muted"}">${scPct(g.top_share || 0)}</td>
    </tr>`;
  }).join("");

  host.innerHTML = `<div class="sr-table-wrap"><table class="sr-table sc-table">
      <thead><tr>
        <th scope="col">#</th><th scope="col">Game</th><th scope="col">Price</th>
        <th scope="col">Value per $1 now</th><th scope="col">At launch</th>
        <th scope="col">% sold</th><th scope="col">Top prize</th>
        <th scope="col" title="Share of the remaining value that sits in the single top prize tier">Riding on top prize</th>
      </tr></thead><tbody>${rows}</tbody></table></div>
    <p class="section-note">Showing ${games.length} games${SC.hideLow ? ` (${SC.data.games.length - games.length} hidden as more than 90% sold)` : ""}.</p>`;
}

function scSummary() {
  const el = document.getElementById("sc-summary");
  if (!el || !SC.data) return;
  const solid = SC.data.games.filter((g) => !g.low_confidence);
  if (!solid.length) return;
  const best = solid[0];
  const worst = solid[solid.length - 1];
  const drained = SC.data.games.filter((g) => g.top_left === 0).length;

  if (scIsIndex()) {
    const card = (label, g) => `<div class="sr-card">
        <div class="sr-card__game">${label}</div>
        <div class="sr-card__jackpot">${g.name}</div>
        <div class="sr-card__stats">
          <div class="sr-stat"><span class="sr-stat__v">${g.value_index.toFixed(2)}</span><span class="sr-stat__l">value index</span></div>
          <div class="sr-stat"><span class="sr-stat__v">${g.pct_sold.toFixed(0)}%</span><span class="sr-stat__l">prizes claimed</span></div>
          <div class="sr-stat"><span class="sr-stat__v">${scMoney(g.top_prize)}</span><span class="sr-stat__l">top prize</span></div>
        </div>
      </div>`;
    el.innerHTML = `<div class="sr-cards">${card("Most prize money left", best)}${card("Most depleted", worst)}</div>
      <p class="section-note">${drained > 0 ? `<strong>${drained}</strong> of ${SC.data.games.length} games have <strong>zero top prizes left</strong> and are still on sale. ` : ""}Updated ${SC.data.updated}.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="sr-cards">
      <div class="sr-card">
        <div class="sr-card__game">Best value right now</div>
        <div class="sr-card__jackpot">${best.name}</div>
        <div class="sr-card__stats">
          <div class="sr-stat"><span class="sr-stat__v">${scPct(best.ev_now)}</span><span class="sr-stat__l">back per $1</span></div>
          <div class="sr-stat"><span class="sr-stat__v">$${best.price}</span><span class="sr-stat__l">ticket</span></div>
          <div class="sr-stat"><span class="sr-stat__v">${best.pct_sold.toFixed(0)}%</span><span class="sr-stat__l">sold</span></div>
        </div>
      </div>
      <div class="sr-card">
        <div class="sr-card__game">Weakest right now</div>
        <div class="sr-card__jackpot">${worst.name}</div>
        <div class="sr-card__stats">
          <div class="sr-stat"><span class="sr-stat__v">${scPct(worst.ev_now)}</span><span class="sr-stat__l">back per $1</span></div>
          <div class="sr-stat"><span class="sr-stat__v">$${worst.price}</span><span class="sr-stat__l">ticket</span></div>
          <div class="sr-stat"><span class="sr-stat__v">${worst.pct_sold.toFixed(0)}%</span><span class="sr-stat__l">sold</span></div>
        </div>
      </div>
    </div>
    <p class="section-note">${drained > 0 ? `<strong>${drained}</strong> of ${SC.data.games.length} games still on sale have <strong>zero top prizes left</strong> — you can still buy them at full price. ` : ""}Updated ${SC.data.updated}.</p>`;
}

function scInit() {
  const sel = document.getElementById("sc-sort");
  if (sel) sel.addEventListener("change", () => { SC.sort = sel.value; scRender(); });
  const chk = document.getElementById("sc-hide");
  if (chk) chk.addEventListener("change", () => { SC.hideLow = chk.checked; scRender(); });
}

// Per-price averages — the clearest finding in the data: cheap tickets pay back least.
function scByPrice() {
  const host = document.getElementById("sc-byprice");
  if (!host || !SC.data) return;
  if (scIsIndex()) { host.remove(); return; }   // no ticket price in this dataset
  const buckets = {};
  SC.data.games.filter((g) => !g.low_confidence).forEach((g) => {
    (buckets[g.price] = buckets[g.price] || []).push(g.ev_now);
  });
  const prices = Object.keys(buckets).map(Number).sort((a, b) => a - b);
  if (prices.length < 3) { host.remove(); return; }
  const rows = prices.map((p) => {
    const arr = buckets[p];
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
    const bar = Math.round(avg * 100);
    return `<tr>
      <th scope="row">$${p}</th>
      <td>${arr.length}</td>
      <td class="${scValueClass(avg)}"><strong>${scPct(avg)}</strong></td>
      <td class="sc-barcell"><span class="sc-bar" style="width:${bar}%"></span></td></tr>`;
  }).join("");
  host.innerHTML = `<div class="sr-table-wrap"><table class="sr-table">
      <thead><tr><th scope="col">Ticket price</th><th scope="col">Games</th><th scope="col">Avg value per $1</th><th scope="col"></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

// Which dataset to load is set per page: <div id="sc-table" data-src="scratch_tx.json">
const scSrc = (document.getElementById("sc-table") || {}).dataset?.src || "scratch_id.json";
fetch(scSrc, { cache: "no-store" })
  .then((r) => r.json())
  .then((d) => { SC.data = d; scInit(); scSummary(); scRender(); scByPrice(); })
  .catch(() => {
    const h = document.getElementById("sc-table");
    if (h) h.innerHTML = '<p class="section-note">Scratch data is loading or temporarily unavailable.</p>';
  });

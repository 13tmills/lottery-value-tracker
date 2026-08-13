// "Best odds in your state" choropleth. Reads state_odds.json (built by
// scraper/gen_state_odds.ps1 from each game's published number matrix) and shades
// every jurisdiction by how winnable its most-winnable top prize is.

let SO = null;

const soOdds = (n) => "1 in " + Number(n).toLocaleString();

// Colour band by the state's best top-prize odds (1-in-N; lower = more winnable).
function soBand(n) {
  if (!n) return "none";
  if (n < 100000) return "b0";
  if (n < 400000) return "b1";
  if (n < 800000) return "b2";
  if (n < 2000000) return "b3";
  return "b4";
}

function soRender() {
  const host = document.getElementById("so-map");
  if (!host || typeof US_MAP === "undefined" || !SO) return;

  const paths = US_MAP.locations.map((loc) => {
    const abbr = loc.id.toUpperCase();
    const st = SO.states[abbr];
    const band = st ? soBand(st.best.odds) : "none";
    const label = st
      ? `${loc.name} — best top prize: ${st.best.label}, ${soOdds(st.best.odds)}`
      : `${loc.name} — no state-run draw game tracked`;
    const attrs = st
      ? ` role="link" tabindex="0" data-abbr="${abbr}" aria-label="${label}"`
      : ` aria-hidden="true"`;
    return `<path d="${loc.path}" class="us-state so-state so-state--${band}"${attrs}><title>${label}</title></path>`;
  }).join("");

  host.innerHTML =
    `<svg class="us-map" viewBox="${US_MAP.viewBox}" role="img" aria-label="Map of the most winnable state lottery game in each US state" preserveAspectRatio="xMidYMid meet">${paths}</svg>` +
    `<div class="us-map-legend so-legend">` +
      `<span><i class="so-dot so-dot--b0"></i>Better than 1 in 100k</span>` +
      `<span><i class="so-dot so-dot--b1"></i>1 in 100k&ndash;400k</span>` +
      `<span><i class="so-dot so-dot--b2"></i>1 in 400k&ndash;800k</span>` +
      `<span><i class="so-dot so-dot--b3"></i>1 in 800k&ndash;2M</span>` +
      `<span><i class="so-dot so-dot--b4"></i>Worse than 1 in 2M</span>` +
      `<span><i class="so-dot so-dot--none"></i>Not tracked</span>` +
    `</div>`;

  const svg = host.querySelector(".us-map");
  const pick = (p) => { const a = p && p.getAttribute("data-abbr"); if (a) soShow(a); };
  svg.addEventListener("click", (e) => pick(e.target.closest("path[data-abbr]")));
  svg.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const p = e.target.closest("path[data-abbr]");
    if (p) { e.preventDefault(); pick(p); }
  });

  const sel = document.getElementById("so-select");
  if (sel) {
    sel.innerHTML = `<option value="">Choose a state&hellip;</option>` +
      Object.keys(SO.states)
        .sort((a, b) => SO.states[a].name.localeCompare(SO.states[b].name))
        .map((a) => `<option value="${a}">${SO.states[a].name}</option>`).join("");
    sel.addEventListener("change", () => { if (sel.value) soShow(sel.value); });
  }

  soRankTable();
}

function soShow(abbr) {
  const out = document.getElementById("so-detail");
  const st = SO.states[abbr];
  if (!out || !st) return;

  document.querySelectorAll(".so-state--sel").forEach((p) => p.classList.remove("so-state--sel"));
  const path = document.querySelector(`path[data-abbr="${abbr}"]`);
  if (path) path.classList.add("so-state--sel");
  const sel = document.getElementById("so-select");
  if (sel && sel.value !== abbr) sel.value = abbr;

  const rows = st.games.map((g, i) => `<tr${i === 0 ? ' class="so-best"' : ""}>
      <th scope="row"><a href="game/${g.key}.html">${g.label}</a></th>
      <td>${soOdds(g.odds)}</td><td>${g.price || "&mdash;"}</td></tr>`).join("");

  out.innerHTML = `
    <h3>${st.name}</h3>
    <p>The most winnable top prize among ${st.name}'s own draw games is
      <strong>${st.best.label}</strong> at <strong>${soOdds(st.best.odds)}</strong>${st.best.price ? ` (${st.best.price} a play)` : ""}.</p>
    <div class="sr-table-wrap"><table class="sr-table">
      <thead><tr><th scope="col">Game</th><th scope="col">Top-prize odds</th><th scope="col">Ticket</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="section-note">${st.count > st.games.length ? `Showing the ${st.games.length} most winnable of ${st.count} games. ` : ""}<a href="state.html?state=${abbr}">See all ${st.name} games &rarr;</a></p>`;
}

function soRankTable() {
  const host = document.getElementById("so-rank");
  if (!host) return;
  const rows = Object.keys(SO.states)
    .map((a) => ({ a, s: SO.states[a] }))
    .sort((x, y) => x.s.best.odds - y.s.best.odds)
    .map((r, i) => `<tr>
      <td>${i + 1}</td>
      <th scope="row"><a href="state.html?state=${r.a}">${r.s.name}</a></th>
      <td><a href="game/${r.s.best.key}.html">${r.s.best.label}</a></td>
      <td>${soOdds(r.s.best.odds)}</td></tr>`).join("");
  host.innerHTML = `<div class="sr-table-wrap"><table class="sr-table">
      <thead><tr><th scope="col">#</th><th scope="col">State</th><th scope="col">Most winnable game</th><th scope="col">Top-prize odds</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

fetch("state_odds.json", { cache: "no-store" })
  .then((r) => r.json())
  .then((d) => { SO = d; soRender(); })
  .catch(() => {
    const h = document.getElementById("so-detail");
    if (h) h.innerHTML = '<p class="section-note">Odds data is loading or temporarily unavailable.</p>';
  });

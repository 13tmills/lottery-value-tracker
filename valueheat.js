// Two dials for tonight's draws, plus the cross-game leaderboard.
// Reads value_heat.json (built by scraper/value_heat.py).
//
// The dials are drawn SEPARATELY and never combined into one score: Value is a
// maths index, Heat is a mania index, and the gap between them is the story.

let VH = null;

const vhPct = (v) => (v == null ? "&mdash;" : Math.round(v) + "%");
const vhMoney = (n) =>
  n == null ? "&mdash;"
    : n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "bn"
      : n >= 1e6 ? "$" + Math.round(n / 1e6) + "m"
        : "$" + Number(n).toLocaleString();

const vhOrdinal = (n) => {
  const i = Math.round(n), j = i % 10, k = i % 100;
  if (j === 1 && k !== 11) return i + "st";
  if (j === 2 && k !== 12) return i + "nd";
  if (j === 3 && k !== 13) return i + "rd";
  return i + "th";
};

// A dial is a 180-degree arc. Value and Heat use different hues on purpose -
// they are different quantities and must not read as two halves of one score.
function vhDial(pct, kind, caption) {
  const known = pct != null;
  const p = known ? Math.max(0, Math.min(100, pct)) : 0;
  const r = 52, cx = 60, cy = 62;
  const len = Math.PI * r;                       // half-circumference
  const dash = (p / 100) * len;
  return `<div class="vh-dial vh-dial--${kind}">
      <svg viewBox="0 0 120 76" role="img" aria-label="${caption}: ${known ? Math.round(p) + " out of 100" : "not available"}">
        <path d="M8,62 A52,52 0 0 1 112,62" class="vh-arc-bg" />
        ${known ? `<path d="M8,62 A52,52 0 0 1 112,62" class="vh-arc" style="stroke-dasharray:${dash} ${len}" />` : ""}
        <text x="${cx}" y="${cy - 8}" class="vh-dial__num">${known ? Math.round(p) : "&mdash;"}</text>
      </svg>
      <div class="vh-dial__cap">${caption}</div>
    </div>`;
}

function vhGameCard(key, g) {
  const v = g.value, h = g.heat;
  const evPctText = v.ev_percentile == null
    ? `<strong>${(v.ev_per_dollar * 100).toFixed(1)}&cent;</strong> back per $1
       <span class="vh-note">(too little history for a percentile)</span>`
    : `<strong>${vhOrdinal(v.ev_percentile)} percentile</strong> of this game's draws
       since ${v.era_start}`;

  const div = g.divergence;
  const divBlock = div
    ? `<p class="vh-flag vh-flag--${div.flag}">${div.headline}</p>`
    : `<p class="vh-note">Value and attention are broadly in line for this draw.</p>`;

  const stale = h.stale_winner_data
    ? `<p class="vh-note vh-note--warn">The jackpot has been won since our last per-tier winner data
       (${h.data_through}), so the rollover run is unknown and heat is computed from the components
       we can still stand behind.</p>`
    : "";

  const peak = g.ev_curve && g.ev_curve.peak_jackpot
    ? `<li><span class="k">EV peaks near</span><span class="v">${vhMoney(g.ev_curve.peak_jackpot)} advertised${g.ev_curve.past_peak ? " &mdash; tonight is past it" : ""}</span></li>`
    : "";

  return `<section class="panel vh-game">
      <div class="vh-game__head">
        <h3>${g.label}</h3>
        <span class="vh-game__jp">${vhMoney(g.jackpot_advertised)} advertised
          <span class="vh-note">&middot; ${vhMoney(g.cash_value)} cash</span></span>
      </div>
      <div class="vh-dials">
        ${vhDial(v.ev_percentile, "value", "Value")}
        ${vhDial(h.score, "heat", "Heat")}
      </div>
      ${divBlock}
      ${stale}
      <ul class="vh-meta">
        <li><span class="k">Value per $1</span><span class="v">${(v.ev_per_dollar * 100).toFixed(1)}&cent; &mdash; ${evPctText}</span></li>
        <li><span class="k">Est. tickets tonight</span><span class="v">${Number(v.est_tickets).toLocaleString()}</span></li>
        <li><span class="k">Share you'd keep if you won</span><span class="v">${Math.round(v.split_factor * 100)}%</span></li>
        <li><span class="k">Rollovers</span><span class="v">${h.rollovers == null ? "unknown" : h.rollovers}</span></li>
        ${peak}
      </ul>
    </section>`;
}

function vhRender() {
  const host = document.getElementById("vh-games");
  if (!host || !VH) return;
  const keys = Object.keys(VH.games || {});
  if (!keys.length) { host.innerHTML = '<p class="section-note">No games available.</p>'; return; }
  // Loudest divergence first - that is the reason to look at this page.
  keys.sort((a, b) => {
    const da = VH.games[a].divergence ? VH.games[a].divergence.gap : -1;
    const db = VH.games[b].divergence ? VH.games[b].divergence.gap : -1;
    return db - da;
  });
  host.innerHTML = keys.map((k) => vhGameCard(k, VH.games[k])).join("");

  const board = document.getElementById("vh-board");
  if (board && VH.leaderboard) {
    const rows = VH.leaderboard.map((r) => `<tr class="${r.basis === "floor" ? "vh-floor" : ""}">
        <td>${r.rank}</td>
        <th scope="row">${r.label}${r.state ? ` <span class="vh-note">${r.state}</span>` : ""}</th>
        <td>$${r.price}</td>
        <td><strong>${(r.ev_per_dollar * 100).toFixed(1)}&cent;</strong></td>
        <td class="vh-basis">${r.basis === "floor" ? "at least" : "exact"}</td>
      </tr>`).join("");
    board.innerHTML = `<div class="sr-table-wrap"><table class="sr-table">
        <thead><tr><th scope="col">#</th><th scope="col">Game</th><th scope="col">Ticket</th>
          <th scope="col">Back per $1</th><th scope="col"></th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
  }

  const upd = document.getElementById("vh-updated");
  if (upd && VH.updated) upd.textContent = "Updated " + VH.updated;
}

fetch("value_heat.json", { cache: "no-store" })
  .then((r) => { if (!r.ok) throw new Error("no data"); return r.json(); })
  .then((d) => { VH = d; vhRender(); })
  .catch(() => {
    const h = document.getElementById("vh-games");
    if (h) h.innerHTML = '<p class="section-note">Value and heat figures are being computed and will appear after the next draw update.</p>';
  });

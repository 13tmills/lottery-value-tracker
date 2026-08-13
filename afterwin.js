// Interactive state map for the "what happens after you win" guide.
// Colours each state by its tax rate on lottery winnings (STATE_TAX, statetax.js)
// and shows a take-home breakdown for the selected state. Reuses US_MAP (usmap.js).

const AW_SAMPLE = 100000000; // $100M advertised jackpot, for a like-for-like comparison
const AW_CASH_RATIO = 0.45;  // typical cash option as a share of the advertised annuity
const AW_FED_TOP = 0.37;     // top federal marginal rate a jackpot lands in

const AW_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "Washington, D.C.",
};

const awMoney = (n) => "$" + Math.round(n).toLocaleString();

// Colour band by state tax rate on winnings.
function awBand(t) {
  if (!t || t.noLottery) return "none";
  const r = t.rate;
  if (r === 0) return "r0";
  if (r < 4) return "r1";
  if (r < 6) return "r2";
  if (r < 8) return "r3";
  return "r4";
}

function awRenderMap() {
  const host = document.getElementById("aw-map");
  if (!host || typeof US_MAP === "undefined" || typeof STATE_TAX === "undefined") return;

  const paths = US_MAP.locations.map((loc) => {
    const abbr = loc.id.toUpperCase();
    const t = STATE_TAX[abbr];
    const band = awBand(t);
    const clickable = t && !t.noLottery;
    const label = t && t.noLottery
      ? `${loc.name} — no state lottery`
      : t ? `${loc.name} — ${t.rate}% state tax on winnings`
      : loc.name;
    const attrs = clickable
      ? ` role="link" tabindex="0" data-abbr="${abbr}" aria-label="${label}"`
      : ` aria-hidden="true"`;
    return `<path d="${loc.path}" class="us-state aw-state aw-state--${band}"${attrs}><title>${label}</title></path>`;
  }).join("");

  host.innerHTML =
    `<svg class="us-map" viewBox="${US_MAP.viewBox}" role="img" aria-label="Map of US state tax on lottery winnings — select a state" preserveAspectRatio="xMidYMid meet">${paths}</svg>` +
    `<div class="us-map-legend aw-legend">` +
      `<span><i class="aw-dot aw-dot--r0"></i>No state tax</span>` +
      `<span><i class="aw-dot aw-dot--r1"></i>Under 4%</span>` +
      `<span><i class="aw-dot aw-dot--r2"></i>4&ndash;6%</span>` +
      `<span><i class="aw-dot aw-dot--r3"></i>6&ndash;8%</span>` +
      `<span><i class="aw-dot aw-dot--r4"></i>8%+</span>` +
      `<span><i class="aw-dot aw-dot--none"></i>No lottery</span>` +
    `</div>`;

  const svg = host.querySelector(".us-map");
  const pick = (p) => {
    const a = p && p.getAttribute("data-abbr");
    if (a) awShowState(a);
  };
  svg.addEventListener("click", (e) => pick(e.target.closest("path[data-abbr]")));
  svg.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const p = e.target.closest("path[data-abbr]");
    if (p) { e.preventDefault(); pick(p); }
  });

  // Dropdown fallback (and a keyboard-friendly path).
  const sel = document.getElementById("aw-select");
  if (sel) {
    const opts = Object.keys(STATE_TAX)
      .filter((a) => !STATE_TAX[a].noLottery)
      .sort((a, b) => (AW_NAMES[a] || a).localeCompare(AW_NAMES[b] || b))
      .map((a) => `<option value="${a}">${AW_NAMES[a] || a}</option>`).join("");
    sel.innerHTML = `<option value="">Choose a state&hellip;</option>` + opts;
    sel.addEventListener("change", () => { if (sel.value) awShowState(sel.value); });
  }
}

function awShowState(abbr) {
  const out = document.getElementById("aw-detail");
  const t = STATE_TAX[abbr];
  if (!out || !t) return;

  document.querySelectorAll(".aw-state--sel").forEach((p) => p.classList.remove("aw-state--sel"));
  const path = document.querySelector(`path[data-abbr="${abbr}"]`);
  if (path) path.classList.add("aw-state--sel");
  const sel = document.getElementById("aw-select");
  if (sel && sel.value !== abbr) sel.value = abbr;

  const name = AW_NAMES[abbr] || abbr;
  if (t.noLottery) {
    out.innerHTML = `<p class="section-note">${name} does not run a state lottery.</p>`;
    return;
  }

  const cash = AW_SAMPLE * AW_CASH_RATIO;
  const fed = cash * AW_FED_TOP;
  const st = cash * (t.rate / 100);
  const take = cash - fed - st;
  const rateNote = t.rate === 0
    ? `<strong>${name} takes no state tax on lottery winnings</strong> — one of the states where you keep the most.`
    : `${name} taxes lottery winnings at <strong>${t.rate}%</strong>.`;

  out.innerHTML = `
    <h3>${name}</h3>
    <p>${rateNote} On a <strong>${awMoney(AW_SAMPLE)}</strong> advertised jackpot taken as cash
      (about ${awMoney(cash)}), a rough estimate looks like this:</p>
    <div class="sr-table-wrap"><table class="sr-table">
      <tbody>
        <tr><th scope="row">Cash option</th><td>${awMoney(cash)}</td></tr>
        <tr><th scope="row">Federal tax (37% top rate)</th><td>&minus;${awMoney(fed)}</td></tr>
        <tr><th scope="row">${name} state tax (${t.rate}%)</th><td>&minus;${awMoney(st)}</td></tr>
        <tr><th scope="row"><strong>Estimated take-home</strong></th><td><strong>${awMoney(take)}</strong></td></tr>
      </tbody>
    </table></div>
    <p class="section-note">A simplified estimate for comparison between states: it uses the top federal
      rate and the state's headline rate on winnings, and ignores local taxes, deductions and your other
      income. Run your own numbers in the <a href="statetax.html">tax &amp; payout calculator</a>.</p>`;
}

document.addEventListener("DOMContentLoaded", awRenderMap);
if (document.readyState !== "loading") awRenderMap();

// State-tax optimizer + heat map. Shows how much of a lottery jackpot you keep in each
// state after state income tax, and maps it. Rates are the top marginal / flat state
// income-tax rate that applies to a large jackpot in 2026 (0% = the state does not tax
// lottery winnings). Source: state tax codes via lotterycalc.com. State only — federal
// (set separately) applies everywhere, and some cities (e.g. NYC) add a local tax.
const STATE_TAX = {
  AL: { noLottery: true }, AK: { noLottery: true }, HI: { noLottery: true },
  NV: { noLottery: true }, UT: { noLottery: true },
  AZ: { rate: 2.5 }, AR: { rate: 5.5 }, CA: { rate: 0 }, CO: { rate: 4.4 }, CT: { rate: 6.99 },
  DE: { rate: 0 }, FL: { rate: 0 }, GA: { rate: 5.49 }, ID: { rate: 5.8 }, IL: { rate: 4.95 },
  IN: { rate: 3.05 }, IA: { rate: 5.7 }, KS: { rate: 5.7 }, KY: { rate: 4 }, LA: { rate: 4.25 },
  ME: { rate: 7.15 }, MD: { rate: 8.75 }, MA: { rate: 5 }, MI: { rate: 4.25 }, MN: { rate: 9.85 },
  MS: { rate: 5 }, MO: { rate: 4.8 }, MT: { rate: 5.9 }, NE: { rate: 5.84 }, NH: { rate: 0 },
  NJ: { rate: 8 }, NM: { rate: 5.9 }, NY: { rate: 10.9 }, NC: { rate: 4.5 }, ND: { rate: 1.95 },
  OH: { rate: 4 }, OK: { rate: 4.75 }, OR: { rate: 9.9 }, PA: { rate: 3.07 }, RI: { rate: 5.99 },
  SC: { rate: 6.5 }, SD: { rate: 0 }, TN: { rate: 0 }, TX: { rate: 0 }, VT: { rate: 8.75 },
  VA: { rate: 5.75 }, WA: { rate: 0 }, WV: { rate: 6.5 }, WI: { rate: 7.65 }, WY: { rate: 0 },
  DC: { rate: 10.75 },
};

const els = {};
let NAME = {};
const fmtUSD = (n) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`;
const parseNum = (s) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;

// Map fill: green for no-tax states, light→dark red as the rate climbs, grey for no lottery.
function fill(ab) {
  const t = STATE_TAX[ab];
  if (!t || t.noLottery) return "#333a47";
  if (t.rate === 0) return "#3fae6b";
  return `hsl(8, 62%, ${Math.max(34, 70 - t.rate * 3.2)}%)`;
}

async function init() {
  ["cash", "fed", "verdict", "map", "table", "back"].forEach((id) => (els[id] = document.getElementById(id)));
  setMeta({
    title: "Lottery Tax by State — How Much of a Jackpot You Keep | NumbersIntel",
    description: "A heat map and calculator of state tax on lottery winnings. See which states don't tax the lottery at all, and how much of a Powerball or Mega Millions jackpot you take home in each state.",
    url: `${SITE}/statetax.html`,
  });
  if (typeof US_MAP !== "undefined") NAME = Object.fromEntries(US_MAP.locations.map((l) => [l.id.toUpperCase(), l.name]));
  NAME.DC = NAME.DC || "District of Columbia";

  let cash = 300_000_000;
  try {
    const data = await (await fetch("./data.json", { cache: "no-store" })).json();
    if (data.games.powerball && data.games.powerball.cash_value) cash = data.games.powerball.cash_value;
  } catch (_) { /* default */ }
  els.cash.value = cash.toLocaleString();

  els.cash.addEventListener("input", compute);
  els.fed.addEventListener("input", compute);
  els.cash.addEventListener("blur", () => { els.cash.value = parseNum(els.cash.value).toLocaleString(); });
  renderMap();
  compute();
}

function renderMap() {
  if (typeof US_MAP === "undefined" || !els.map) return;
  const paths = US_MAP.locations.map((loc) => {
    const ab = loc.id.toUpperCase();
    const t = STATE_TAX[ab];
    const label = !t || t.noLottery ? "no state lottery"
      : t.rate === 0 ? "no tax on lottery winnings" : `${t.rate}% state tax`;
    return `<path d="${loc.path}" fill="${fill(ab)}" class="tax-state" data-abbr="${ab}"><title>${loc.name} — ${label}</title></path>`;
  }).join("");
  els.map.innerHTML =
    `<svg class="us-map" viewBox="${US_MAP.viewBox}" role="img" aria-label="Heat map of state tax on lottery winnings" preserveAspectRatio="xMidYMid meet">${paths}</svg>` +
    `<div class="us-map-legend">` +
      `<span><i class="us-dot" style="background:#3fae6b"></i>No tax on winnings</span>` +
      `<span><i class="us-dot" style="background:hsl(8,62%,60%)"></i>Lower tax</span>` +
      `<span><i class="us-dot" style="background:hsl(8,62%,38%)"></i>Higher tax</span>` +
      `<span><i class="us-dot" style="background:#333a47"></i>No lottery</span>` +
    `</div>`;
}

function compute() {
  const cash = parseNum(els.cash.value);
  const fed = Math.min(0.5, parseNum(els.fed.value) / 100);
  const afterFed = cash * (1 - fed);

  const rows = Object.entries(STATE_TAX)
    .filter(([, t]) => !t.noLottery)
    .map(([ab, t]) => ({ ab, name: NAME[ab] || ab, rate: t.rate, keep: cash * (1 - fed - t.rate / 100) }))
    .sort((a, b) => b.keep - a.keep);

  const best = rows[0], worst = rows[rows.length - 1];
  const noTax = rows.filter((r) => r.rate === 0).map((r) => r.name);
  els.verdict.innerHTML = `On a <b>${fmtUSD(cash)}</b> cash jackpot, you'd keep about <b>${fmtUSD(best.keep)}</b>
    in a state that doesn't tax the lottery (${noTax.slice(0, 3).join(", ")} and ${noTax.length - 3} more) —
    versus <b>${fmtUSD(worst.keep)}</b> in <b>${worst.name}</b>. That's a <b>${fmtUSD(best.keep - worst.keep)}</b>
    swing just from where you bought the ticket. (After a ${(fed * 100).toFixed(0)}% federal tax of
    ${fmtUSD(cash - afterFed)}, before any city or local tax.)`;

  els.table.innerHTML = `
    <table class="tier-table">
      <thead><tr><th>State</th><th class="num">State tax</th><th class="num">You keep</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr${r.rate === 0 ? ' class="best-row--top"' : ""}>
          <td>${r.name}</td>
          <td class="num">${r.rate === 0 ? "None" : r.rate + "%"}</td>
          <td class="num">${fmtUSD(r.keep)}</td>
        </tr>`).join("")}</tbody>
    </table>`;
}

init();

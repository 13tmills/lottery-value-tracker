// Shared helpers used by the home page (app.js) and the per-game detail page
// (game.js). Loaded as a plain script, so everything here is a global — do NOT
// redeclare these names in the page scripts.

const GAME_META = {
  powerball:     { label: "Powerball",     specialKey: "powerball",  specialName: "Powerball", specialAbbr: "PB", draws: "Mon · Wed · Sat" },
  mega_millions: { label: "Mega Millions", specialKey: "mega_ball",  specialName: "Mega Ball", specialAbbr: "MB", draws: "Tue · Fri" },
  lotto_america: { label: "Lotto America", specialKey: "star_ball",  specialName: "Star Ball", specialAbbr: "SB", draws: "Mon · Wed · Sat" },
};

const fmtMoney = (n) =>
  n >= 1e9
    ? `$${(n / 1e9).toFixed(2)} B`
    : `$${(n / 1e6).toFixed(1)} M`;

const fmtDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

function theme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name, fb) => css.getPropertyValue(name).trim() || fb;
  return {
    accent: v("--accent", "#2f81f7"),
    accent2: v("--accent-2", "#a371f7"),
    textDim: v("--text-dim", "#8b97a6"),
    border: v("--border", "#2a3340"),
    surface: v("--surface", "#161b22"),
  };
}

function tierLabel(match, meta) {
  if (match === meta.specialAbbr) return `${meta.specialName} only`;
  const [whites, special] = match.split("+");
  return special ? `Match ${whites} + ${meta.specialName}` : `Match ${whites}`;
}

// Value per $1 (in cents, after tax) contributed by the jackpot and each fixed
// prize tier. Same formula as the scraper, so the parts reconcile with the
// stored ev_breakdown. Each row also carries its raw prize/odds for tables.
function contributions(g, meta, taxFactor) {
  const mult = g.prize_multiplier ?? 1;
  const price = g.ticket_price;
  const cents = (ret) => (100 * taxFactor * ret) / price;
  const out = [{
    match: `5+${meta.specialAbbr}`,
    label: "Jackpot",
    prize: g.cash_value,
    odds: g.odds_jackpot,
    cents: cents(g.cash_value / g.odds_jackpot),
    kind: "jackpot",
  }];
  for (const t of g.prize_tiers || []) {
    out.push({
      match: t.match,
      label: tierLabel(t.match, meta),
      prize: t.prize,
      odds: t.odds,
      cents: cents((mult * t.prize) / t.odds),
      kind: "secondary",
    });
  }
  return out;
}

async function loadData() {
  const res = await fetch("./data.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

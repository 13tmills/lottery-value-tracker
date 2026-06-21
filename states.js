// US lottery jurisdictions registry + rendering for the states hub (states.html)
// and the per-state scaffold (state.html?state=XX). Data coverage is rolling out;
// these pages establish the structure, URLs, and SEO now.

const STATES = [
  { abbr: "AL", name: "Alabama", lottery: false },
  { abbr: "AK", name: "Alaska", lottery: false },
  { abbr: "AZ", name: "Arizona", lottery: true },
  { abbr: "AR", name: "Arkansas", lottery: true },
  { abbr: "CA", name: "California", lottery: true },
  { abbr: "CO", name: "Colorado", lottery: true },
  { abbr: "CT", name: "Connecticut", lottery: true },
  { abbr: "DE", name: "Delaware", lottery: true },
  { abbr: "FL", name: "Florida", lottery: true },
  { abbr: "GA", name: "Georgia", lottery: true },
  { abbr: "HI", name: "Hawaii", lottery: false },
  { abbr: "ID", name: "Idaho", lottery: true },
  { abbr: "IL", name: "Illinois", lottery: true },
  { abbr: "IN", name: "Indiana", lottery: true },
  { abbr: "IA", name: "Iowa", lottery: true },
  { abbr: "KS", name: "Kansas", lottery: true },
  { abbr: "KY", name: "Kentucky", lottery: true },
  { abbr: "LA", name: "Louisiana", lottery: true },
  { abbr: "ME", name: "Maine", lottery: true },
  { abbr: "MD", name: "Maryland", lottery: true },
  { abbr: "MA", name: "Massachusetts", lottery: true },
  { abbr: "MI", name: "Michigan", lottery: true },
  { abbr: "MN", name: "Minnesota", lottery: true },
  { abbr: "MS", name: "Mississippi", lottery: true },
  { abbr: "MO", name: "Missouri", lottery: true },
  { abbr: "MT", name: "Montana", lottery: true },
  { abbr: "NE", name: "Nebraska", lottery: true },
  { abbr: "NV", name: "Nevada", lottery: false },
  { abbr: "NH", name: "New Hampshire", lottery: true },
  { abbr: "NJ", name: "New Jersey", lottery: true },
  { abbr: "NM", name: "New Mexico", lottery: true },
  { abbr: "NY", name: "New York", lottery: true },
  { abbr: "NC", name: "North Carolina", lottery: true },
  { abbr: "ND", name: "North Dakota", lottery: true },
  { abbr: "OH", name: "Ohio", lottery: true },
  { abbr: "OK", name: "Oklahoma", lottery: true },
  { abbr: "OR", name: "Oregon", lottery: true },
  { abbr: "PA", name: "Pennsylvania", lottery: true },
  { abbr: "RI", name: "Rhode Island", lottery: true },
  { abbr: "SC", name: "South Carolina", lottery: true },
  { abbr: "SD", name: "South Dakota", lottery: true },
  { abbr: "TN", name: "Tennessee", lottery: true },
  { abbr: "TX", name: "Texas", lottery: true },
  { abbr: "UT", name: "Utah", lottery: false },
  { abbr: "VT", name: "Vermont", lottery: true },
  { abbr: "VA", name: "Virginia", lottery: true },
  { abbr: "WA", name: "Washington", lottery: true },
  { abbr: "WV", name: "West Virginia", lottery: true },
  { abbr: "WI", name: "Wisconsin", lottery: true },
  { abbr: "WY", name: "Wyoming", lottery: true },
  { abbr: "DC", name: "District of Columbia", lottery: true },
  { abbr: "PR", name: "Puerto Rico", lottery: true },
  { abbr: "USVI", name: "U.S. Virgin Islands", lottery: true },
];

// Per-state game listings for jurisdictions we've started covering.
const STATE_GAMES = {
  NY: {
    intro: "New York runs one of the largest US state lotteries. Every draw game below has live payouts, per-tier winner counts, odds, and number frequency — plus the odds visualizer where it applies.",
    games: [
      { name: "New York Lotto", meta: "6 of 59 + Bonus · Wed &amp; Sat · since 2001",
        links: [["Jackpot, payouts &amp; value", "game.html?game=ny_lotto"]] },
      { name: "Take 5", meta: "5 of 39 · daily",
        links: [["Payouts, winners &amp; value", "game.html?game=ny_take5"]] },
      { name: "Win 4", meta: "4-digit · twice daily",
        links: [["Payouts, winners &amp; results", "game.html?game=ny_win4"]] },
      { name: "Pick 10", meta: "20 of 80 keno · daily",
        links: [["Payouts, winners &amp; value", "game.html?game=ny_pick10"]] },
      { name: "Numbers", meta: "3-digit · twice daily",
        links: [["Payouts, winners &amp; results", "game.html?game=ny_numbers"]] },
      { name: "Quick Draw", meta: "20 of 80 keno · every ~4 min",
        links: [["Results, odds &amp; payouts", "game.html?game=ny_quickdraw"]] },
      { name: "Cash4Life", meta: "5 + Cash Ball · retired Feb 2026", retired: true,
        links: [["Results &amp; final payouts", "game.html?game=ny_cash4life"]] },
    ],
    national: [
      { name: "Powerball", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=powerball"]] },
      { name: "Mega Millions", meta: "Multi-state jackpot · Tue · Fri",
        links: [["Value, odds &amp; EV", "game.html?game=mega_millions"]] },
      { name: "Millionaire For Life", meta: "5 + Mill Ball · daily · $1M/yr for life",
        links: [["Payouts &amp; winners", "game.html?game=ny_m4l"]] },
    ],
  },
  TX: {
    intro: "Texas runs one of the largest US state lotteries. We've started with Lotto Texas — results, jackpot history, number frequency and the odds visualizer — with the rest of the lineup rolling out.",
    games: [
      { name: "Lotto Texas", meta: "6 of 54 · Mon · Wed · Sat · since 1992",
        links: [["Results, jackpot &amp; odds", "game.html?game=tx_lotto"]] },
      { name: "Texas Two Step", meta: "4 of 35 + Bonus · Mon &amp; Thu",
        links: [["Results, jackpot &amp; odds", "game.html?game=tx_twostep"]] },
      { name: "Cash Five", meta: "5 of 35 · Mon&ndash;Sat",
        links: [["Results, odds &amp; frequency", "game.html?game=tx_cashfive"]] },
      { name: "All or Nothing", meta: "12 of 24 keno · 4&times; daily",
        links: [["Results, odds &amp; payouts", "game.html?game=tx_allornothing"]] },
      { name: "Pick 3", meta: "3-digit · 4&times; daily",
        links: [["Results, odds &amp; payouts", "game.html?game=tx_pick3"]] },
      { name: "Daily 4", meta: "4-digit · 4&times; daily",
        links: [["Results, odds &amp; payouts", "game.html?game=tx_daily4"]] },
    ],
    national: [
      { name: "Powerball", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=powerball"]] },
      { name: "Mega Millions", meta: "Multi-state jackpot · Tue · Fri",
        links: [["Value, odds &amp; EV", "game.html?game=mega_millions"]] },
    ],
  },
  CA: {
    intro: "California runs the largest US state lottery. Its draw games come straight from the California Lottery's own data — live jackpots and cash values, per-tier payouts and winner counts, value per $1, odds, jackpot history and number frequency.",
    games: [
      { name: "SuperLotto Plus", meta: "5 of 47 + Mega · Wed &amp; Sat",
        links: [["Jackpot, payouts &amp; value", "game.html?game=ca_superlotto"]] },
      { name: "Fantasy 5", meta: "5 of 39 · daily",
        links: [["Payouts, winners &amp; value", "game.html?game=ca_fantasy5"]] },
      { name: "Daily 4", meta: "4-digit · daily",
        links: [["Payouts, winners &amp; results", "game.html?game=ca_daily4"]] },
      { name: "Daily 3", meta: "3-digit · twice daily",
        links: [["Payouts, winners &amp; results", "game.html?game=ca_daily3"]] },
      { name: "Daily Derby", meta: "horse race · daily",
        links: [["Race results, bets &amp; payouts", "game.html?game=ca_derby"]] },
    ],
    national: [
      { name: "Powerball", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=powerball"]] },
      { name: "Mega Millions", meta: "Multi-state jackpot · Tue · Fri",
        links: [["Value, odds &amp; EV", "game.html?game=mega_millions"]] },
    ],
  },
  ID: {
    intro: "Idaho's draw games come straight from the Idaho Lottery's own results. We've started with Idaho Cash — its rolling cash jackpot, value per $1, odds, jackpot history and number frequency — with more of the lineup to follow.",
    games: [
      { name: "Idaho Cash", meta: "5 of 45 · daily",
        links: [["Jackpot, value &amp; odds", "game.html?game=id_cash"]] },
      { name: "Pick 3", meta: "3-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=id_pick3"]] },
      { name: "Pick 4", meta: "4-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=id_pick4"]] },
    ],
    national: [
      { name: "Powerball", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=powerball"]] },
      { name: "Mega Millions", meta: "Multi-state jackpot · Tue · Fri",
        links: [["Value, odds &amp; EV", "game.html?game=mega_millions"]] },
      { name: "Lotto America", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=lotto_america"]] },
    ],
  },
  PA: {
    intro: "Pennsylvania's Pick games come straight from the PA Lottery's own results — with the deepest history on the site: every Pick 3/4/5 draw back to 2015 for hot & cold number analysis. (Match 6 and the other in-state games are on the way.)",
    games: [
      { name: "PA Pick 3", meta: "3-digit · twice daily · since 2015",
        links: [["Results, frequency &amp; payouts", "game.html?game=pa_pick3"]] },
      { name: "PA Pick 4", meta: "4-digit · twice daily · since 2015",
        links: [["Results, frequency &amp; payouts", "game.html?game=pa_pick4"]] },
      { name: "PA Pick 5", meta: "5-digit · twice daily · since 2015",
        links: [["Results, frequency &amp; payouts", "game.html?game=pa_pick5"]] },
    ],
    national: [
      { name: "Powerball", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=powerball"]] },
      { name: "Mega Millions", meta: "Multi-state jackpot · Tue · Fri",
        links: [["Value, odds &amp; EV", "game.html?game=mega_millions"]] },
    ],
  },
  FL: {
    intro: "Florida runs one of the largest US state lotteries — and its games carry the deepest history on the site, straight from the FL Lottery's own API. Florida Lotto goes all the way back to 1988.",
    games: [
      { name: "Florida Lotto", meta: "6 of 53 · Wed &amp; Sat · since 1988",
        links: [["Jackpot, odds &amp; results", "game.html?game=fl_lotto"]] },
      { name: "Jackpot Triple Play", meta: "6 of 46 · Tue · Fri · Sun",
        links: [["Jackpot, odds &amp; results", "game.html?game=fl_triple"]] },
      { name: "Fantasy 5", meta: "5 of 36 · twice daily",
        links: [["Results, odds &amp; frequency", "game.html?game=fl_fantasy5"]] },
      { name: "Pick 2", meta: "2-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=fl_pick2"]] },
      { name: "Pick 3", meta: "3-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=fl_pick3"]] },
      { name: "Pick 4", meta: "4-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=fl_pick4"]] },
      { name: "Pick 5", meta: "5-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=fl_pick5"]] },
      { name: "Cash Pop", meta: "1 of 15 · 5&times; daily",
        links: [["Results &amp; frequency", "game.html?game=fl_cashpop"]] },
      { name: "Cash4Life", meta: "5 + Cash Ball · ended Feb 2026", retired: true,
        links: [["Final results &amp; prizes", "game.html?game=fl_cash4life"]] },
    ],
    national: [
      { name: "Powerball", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=powerball"]] },
      { name: "Mega Millions", meta: "Multi-state jackpot · Tue · Fri",
        links: [["Value, odds &amp; EV", "game.html?game=mega_millions"]] },
    ],
  },
  WA: {
    intro: "Washington's Lottery posts every draw's per-tier prizes and in-state winner counts — so Lotto, Hit 5, and Match 4 carry real payout depth, with history back to 2010.",
    games: [
      { name: "Lotto", meta: "6 of 49 · Mon · Wed · Sat · since 2010",
        links: [["Prizes, winners &amp; odds", "game.html?game=wa_lotto"]] },
      { name: "Hit 5", meta: "5 of 42 · nightly · cash jackpot",
        links: [["Cashpot, winners &amp; odds", "game.html?game=wa_hit5"]] },
      { name: "Match 4", meta: "4 of 24 · nightly",
        links: [["Value, odds &amp; results", "game.html?game=wa_match4"]] },
      { name: "Pick 3", meta: "3-digit · nightly",
        links: [["Results, odds &amp; payouts", "game.html?game=wa_pick3"]] },
      { name: "Cash Pop", meta: "1 of 15 · several daily",
        links: [["Results &amp; frequency", "game.html?game=wa_cashpop"]] },
      { name: "Daily Keno", meta: "20 of 80 · nightly",
        links: [["Payouts, odds &amp; frequency", "game.html?game=wa_keno"]] },
    ],
    national: [
      { name: "Powerball", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=powerball"]] },
      { name: "Mega Millions", meta: "Multi-state jackpot · Tue · Fri",
        links: [["Value, odds &amp; EV", "game.html?game=mega_millions"]] },
    ],
  },
  OH: {
    intro: "Ohio publishes each draw's per-tier prizes and winner counts in its own results feed — so Classic Lotto and Rolling Cash 5 carry real payout depth, including the live jackpot and cash value.",
    games: [
      { name: "Classic Lotto", meta: "6 of 49 · Mon · Wed · Sat",
        links: [["Jackpot, prizes &amp; winners", "game.html?game=oh_classic"]] },
      { name: "Rolling Cash 5", meta: "5 of 39 · nightly · cash jackpot",
        links: [["Jackpot, prizes &amp; winners", "game.html?game=oh_cash5"]] },
      { name: "Pick 3", meta: "3-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=oh_pick3"]] },
      { name: "Pick 4", meta: "4-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=oh_pick4"]] },
      { name: "Pick 5", meta: "5-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=oh_pick5"]] },
      { name: "Kicker", meta: "6-digit · Classic Lotto add-on",
        links: [["Payouts, odds &amp; frequency", "game.html?game=oh_kicker"]] },
      { name: "Millionaire for Life", meta: "5 of 58 + Bonus · daily · since Feb 2026",
        links: [["Prizes, winners &amp; odds", "game.html?game=oh_m4l"]] },
      { name: "Lucky for Life", meta: "5 of 48 + Lucky Ball · ended Feb 2026", retired: true,
        links: [["Final results &amp; prizes", "game.html?game=oh_luckylife"]] },
    ],
    national: [
      { name: "Powerball", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=powerball"]] },
      { name: "Mega Millions", meta: "Multi-state jackpot · Tue · Fri",
        links: [["Value, odds &amp; EV", "game.html?game=mega_millions"]] },
    ],
  },
  MI: {
    intro: "Michigan's Lottery serves results, odds, jackpots and full multi-year history straight from its own data service — Lotto 47 and Fantasy 5 go back to 2010.",
    games: [
      { name: "Lotto 47", meta: "6 of 47 · Wed · Sat · since 2010",
        links: [["Jackpot, odds &amp; prizes", "game.html?game=mi_lotto47"]] },
      { name: "Fantasy 5", meta: "5 of 39 · nightly · cash jackpot",
        links: [["Value, odds &amp; results", "game.html?game=mi_fantasy5"]] },
      { name: "Daily 3", meta: "3-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=mi_daily3"]] },
      { name: "Daily 4", meta: "4-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=mi_daily4"]] },
      { name: "Daily Keno", meta: "22 of 80 · nightly",
        links: [["Odds &amp; frequency", "game.html?game=mi_keno"]] },
      { name: "Millionaire for Life", meta: "5 of 58 + Bonus · daily · since Feb 2026",
        links: [["Prizes &amp; odds", "game.html?game=mi_m4l"]] },
      { name: "Lucky for Life", meta: "5 of 48 + Lucky Ball · ended Feb 2026", retired: true,
        links: [["Final results &amp; prizes", "game.html?game=mi_lucky"]] },
    ],
    national: [
      { name: "Powerball", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=powerball"]] },
      { name: "Mega Millions", meta: "Multi-state jackpot · Tue · Fri",
        links: [["Value, odds &amp; EV", "game.html?game=mega_millions"]] },
    ],
  },
  NH: {
    intro: "New Hampshire's draw games — including the Tri-State games shared with Maine and Vermont — with results, odds, jackpots and frequency from the lottery's own data service (history since 2021).",
    games: [
      { name: "Tri-State Megabucks", meta: "5 of 41 + Megaball · Wed · Sat",
        links: [["Jackpot, odds &amp; prizes", "game.html?game=nh_megabucks"]] },
      { name: "Gimme 5", meta: "5 of 39 · Mon–Fri · $100k top",
        links: [["Odds &amp; frequency", "game.html?game=nh_gimme5"]] },
      { name: "Pick 3", meta: "3-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=nh_pick3"]] },
      { name: "Pick 4", meta: "4-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=nh_pick4"]] },
      { name: "Millionaire for Life", meta: "5 of 58 + Bonus · since Feb 2026",
        links: [["Prizes &amp; odds", "game.html?game=nh_m4l"]] },
      { name: "Lucky for Life", meta: "5 of 48 + Lucky Ball · ended Feb 2026", retired: true,
        links: [["Final results &amp; prizes", "game.html?game=nh_lucky"]] },
    ],
    national: [
      { name: "Powerball", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=powerball"]] },
      { name: "Mega Millions", meta: "Multi-state jackpot · Tue · Fri",
        links: [["Value, odds &amp; EV", "game.html?game=mega_millions"]] },
    ],
  },
  NC: {
    intro: "North Carolina's draw games with results, odds and number frequency from the NC Education Lottery's own CSV exports — Pick 3 and Cash 5 history goes all the way back to 2006.",
    games: [
      { name: "Cash 5", meta: "5 of 41 · nightly · cash jackpot",
        links: [["Jackpot, odds &amp; frequency", "game.html?game=nc_cash5"]] },
      { name: "Pick 3", meta: "3-digit · twice daily · since 2006",
        links: [["Results, odds &amp; payouts", "game.html?game=nc_pick3"]] },
      { name: "Pick 4", meta: "4-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=nc_pick4"]] },
    ],
    national: [
      { name: "Powerball", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=powerball"]] },
      { name: "Mega Millions", meta: "Multi-state jackpot · Tue · Fri",
        links: [["Value, odds &amp; EV", "game.html?game=mega_millions"]] },
    ],
  },
  VA: {
    intro: "Virginia's draw games with results, odds and number frequency from the VA Lottery's own past-numbers exports — Pick 3 history goes all the way back to 1989.",
    games: [
      { name: "Bank a Million", meta: "6 of 40 + Bonus · Wed · Sat · $1M top",
        links: [["Prizes, odds &amp; results", "game.html?game=va_bank"]] },
      { name: "Cash 5", meta: "5 of 45 · nightly · cash jackpot",
        links: [["Jackpot, odds &amp; frequency", "game.html?game=va_cash5"]] },
      { name: "Pick 3", meta: "3-digit · twice daily · since 1989",
        links: [["Results, odds &amp; payouts", "game.html?game=va_pick3"]] },
      { name: "Pick 4", meta: "4-digit · twice daily · since 1991",
        links: [["Results, odds &amp; payouts", "game.html?game=va_pick4"]] },
      { name: "Cash Pop", meta: "1 of 15 · 5&times; daily",
        links: [["Results &amp; frequency", "game.html?game=va_cashpop"]] },
    ],
    national: [
      { name: "Powerball", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=powerball"]] },
      { name: "Mega Millions", meta: "Multi-state jackpot · Tue · Fri",
        links: [["Value, odds &amp; EV", "game.html?game=mega_millions"]] },
    ],
  },
  MD: {
    intro: "Maryland's draw games — Multi-Match's rolling jackpot, Bonus Match 5's fixed prizes, and the Pick 3/4/5 dailies — with odds, payouts and number frequency from the Maryland Lottery's own winning-numbers feed.",
    games: [
      { name: "Multi-Match", meta: "6 of 43 · Mon · Thu · jackpot from $500K",
        links: [["Jackpot, odds &amp; prizes", "game.html?game=md_multimatch"]] },
      { name: "Bonus Match 5", meta: "5 of 39 + Bonus · nightly · $50K top",
        links: [["Prizes, odds &amp; value", "game.html?game=md_bonus5"]] },
      { name: "Pick 3", meta: "3-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=md_pick3"]] },
      { name: "Pick 4", meta: "4-digit · twice daily",
        links: [["Results, odds &amp; payouts", "game.html?game=md_pick4"]] },
      { name: "Pick 5", meta: "5-digit · twice daily · $50K straight",
        links: [["Results, odds &amp; payouts", "game.html?game=md_pick5"]] },
    ],
    national: [
      { name: "Powerball", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=powerball"]] },
      { name: "Mega Millions", meta: "Multi-state jackpot · Tue · Fri",
        links: [["Value, odds &amp; EV", "game.html?game=mega_millions"]] },
    ],
  },
  MA: {
    intro: "Massachusetts plays harder than anyone — the highest lottery spend per capita in the country. Here are its draw games with live jackpots, real per-tier prizes and number frequency, straight from the Mass Lottery's own API.",
    games: [
      { name: "Megabucks Doubler", meta: "6 of 44 · Mon · Wed · Sat · progressive jackpot",
        links: [["Jackpot, EV &amp; per-tier prizes", "game.html?game=ma_megabucks"]] },
      { name: "Mass Cash", meta: "5 of 35 · twice daily · $100K fixed top",
        links: [["Prizes, odds &amp; value", "game.html?game=ma_masscash"]] },
      { name: "The Numbers Game", meta: "4-digit · twice daily · pari-mutuel",
        links: [["Results, odds &amp; frequency", "game.html?game=ma_numbers"]] },
    ],
    national: [
      { name: "Powerball", meta: "Multi-state jackpot · Mon · Wed · Sat",
        links: [["Value, odds &amp; EV", "game.html?game=powerball"]] },
      { name: "Mega Millions", meta: "Multi-state jackpot · Tue · Fri",
        links: [["Value, odds &amp; EV", "game.html?game=mega_millions"]] },
    ],
  },
};

function stateParam() {
  return (new URLSearchParams(location.search).get("state") || "").toUpperCase();
}

function renderHub() {
  const grid = document.getElementById("states-grid");
  if (!grid) return;
  const withLottery = STATES.filter((s) => s.lottery).length;
  document.getElementById("states-sub").textContent =
    `${withLottery} jurisdictions run a lottery · ${STATES.length - withLottery} don't`;
  setMeta({
    title: "US State Lotteries — Results, Odds & Expected Value by State | NumbersIntel",
    description: "Explore every US state lottery: results, odds, expected value, and number frequency, state by state. National games (Powerball, Mega Millions, Lotto America) are live now.",
    url: `${SITE}/states.html`,
  });
  grid.innerHTML = STATES.map((s) =>
    s.lottery
      ? `<a class="state-cell" href="state.html?state=${s.abbr}"><span class="state-cell__abbr">${s.abbr}</span><span>${s.name}</span></a>`
      : `<div class="state-cell state-cell--off"><span class="state-cell__abbr">${s.abbr}</span><span>${s.name}</span><span class="state-cell__note">No lottery</span></div>`
  ).join("");

  renderMap();
}

// Interactive US map (selectable states), rendered above the grid. States with a
// lottery are clickable; the ones we already cover are highlighted; the rest are dim.
function renderMap() {
  const host = document.getElementById("us-map");
  if (!host || typeof US_MAP === "undefined") return;
  const byAbbr = Object.fromEntries(STATES.map((s) => [s.abbr, s]));

  const paths = US_MAP.locations.map((loc) => {
    const abbr = loc.id.toUpperCase();
    const lottery = byAbbr[abbr] ? byAbbr[abbr].lottery : false;
    const covered = !!STATE_GAMES[abbr];
    const cls = covered ? "us-state us-state--covered"
      : lottery ? "us-state us-state--on"
      : "us-state us-state--off";
    const attrs = lottery
      ? ` role="link" tabindex="0" data-abbr="${abbr}" aria-label="${loc.name} lottery"`
      : ` aria-hidden="true"`;
    const note = lottery ? "" : " — no state lottery";
    return `<path d="${loc.path}" class="${cls}"${attrs}><title>${loc.name}${note}</title></path>`;
  }).join("");

  host.innerHTML =
    `<svg class="us-map" viewBox="${US_MAP.viewBox}" role="img" aria-label="Map of US state lotteries — select a state" preserveAspectRatio="xMidYMid meet">${paths}</svg>` +
    `<div class="us-map-legend">` +
      `<span><i class="us-dot us-dot--covered"></i>Live coverage</span>` +
      `<span><i class="us-dot us-dot--on"></i>Has a lottery</span>` +
      `<span><i class="us-dot us-dot--off"></i>No lottery</span>` +
    `</div>`;

  const go = (p) => { const a = p.getAttribute("data-abbr"); if (a) location.href = `state.html?state=${a}`; };
  const svg = host.querySelector(".us-map");
  svg.addEventListener("click", (e) => {
    const p = e.target.closest("path[data-abbr]");
    if (p) go(p);
  });
  svg.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const p = e.target.closest("path[data-abbr]");
    if (p) { e.preventDefault(); go(p); }
  });
}

// ----- "Best value in <state>" module --------------------------------------
// Ranks the games playable in a state by value per $1 (after an assumed 37% tax) —
// the same metric the game pages show. State games with an EV config are computed
// from their latest prized draw; national games use the value precomputed in
// data.json (same tax basis). Games with no single value/$1 (digit/keno) drop out.
// BEST_TAX + valuePer1Cents now live in common.js (shared with the national
// "Best value tickets in America" widget on national.html). gameKeyFromLinks stays
// here since it's specific to the state module's STATE_GAMES link shape.
function gameKeyFromLinks(g) {
  const href = g.links && g.links[0] && g.links[0][1];
  return href ? new URLSearchParams(href.split("?")[1] || "").get("game") : null;
}

async function fillBestGame(s, cfg) {
  const slot = document.getElementById("best-game-slot");
  if (!slot) return;
  let data = null;
  try { data = await fetch("data.json", { cache: "no-store" }).then((r) => r.json()); } catch (e) { /* national games drop out */ }

  const candidates = [...(cfg.games || []), ...(cfg.national || [])]
    .filter((g) => !g.retired)
    .map((g) => ({ key: gameKeyFromLinks(g), name: g.name }))
    .filter((c) => c.key);

  const ranked = [];
  for (const c of candidates) {
    const cents = await valuePer1Cents(c.key, GAME_META[c.key], data);
    if (cents != null && isFinite(cents)) {
      ranked.push({ ...c, cents, national: !!(data && data.games && data.games[c.key]), digit: !!(GAME_META[c.key] && GAME_META[c.key].digits) });
    }
  }
  ranked.sort((a, b) => b.cents - a.cents);
  if (!ranked.length) return;

  const best = ranked[0];
  slot.innerHTML = `
    <section class="panel best-game">
      <span class="best-game__eyebrow">&#9733; Best value in ${s.name}</span>
      <h2 class="best-game__title"><a href="game.html?game=${best.key}&back=${s.abbr}">${best.name}</a></h2>
      <p class="best-game__lead">Of the games you can play in ${s.name}, <b>${best.name}</b> gives back the most per
        $1 right now — <b>${best.cents.toFixed(1)}&cent;</b> for every dollar spent${best.digit ? " on a straight play" : ""} (after an assumed 37% tax).
        Every lottery ticket is still worth less than it costs; this is just the least-bad bet today.</p>
      <div class="best-game__rank">
        ${ranked.map((r, i) => `
          <a class="best-row${i === 0 ? " best-row--top" : ""}" href="game.html?game=${r.key}&back=${s.abbr}">
            <span class="best-row__rank">${i + 1}</span>
            <span class="best-row__name">${r.name}${r.national ? ' <span class="best-row__tag">multi-state</span>' : r.digit ? ' <span class="best-row__tag">straight play</span>' : ""}</span>
            <span class="best-row__cents">${r.cents.toFixed(1)}&cent;<span class="best-row__per"> / $1</span></span>
          </a>`).join("")}
      </div>
      <p class="best-game__note">Ranked by value per $1 across ${s.name}'s draw games and the national games sold here —
        jackpot games across every prize tier, digit games for a $1 straight play. Pari-mutuel games whose lower-tier
        payouts aren't published (e.g. ${s.abbr === "FL" ? "Florida Lotto" : "Fantasy 5"}) and keno aren't ranked.</p>
    </section>`;
}

function renderState() {
  const host = document.getElementById("state-detail");
  if (!host) return;
  const abbr = stateParam();
  const s = STATES.find((x) => x.abbr === abbr);
  const titleEl = document.getElementById("state-title");
  const subEl = document.getElementById("state-sub");

  if (!s) {
    titleEl.textContent = "State not found";
    host.innerHTML = `<div class="error">No jurisdiction "${abbr}". <a href="states.html">See all states</a>.</div>`;
    return;
  }
  if (!s.lottery) {
    titleEl.textContent = `${s.name}`;
    subEl.textContent = "";
    host.innerHTML = `<p class="lead">${s.name} does not run a state lottery.</p>
      <p class="muted">See the national games on the <a href="index.html">home page</a>, or browse
      <a href="states.html">other states</a>.</p>`;
    return;
  }

  titleEl.textContent = `${s.name} Lottery`;
  setMeta({
    title: `${s.name} Lottery — Results, Numbers & Frequency | NumbersIntel`,
    description: `${s.name} lottery results and hot & cold number frequency — plus the national games. The NumbersIntel analytics treatment for ${s.name}.`,
    url: `${SITE}/state.html?state=${s.abbr}`,
  });

  const cfg = STATE_GAMES[s.abbr];
  if (cfg) {
    subEl.textContent = "Pick a game for results, payouts and number frequency.";
    const card = (g) => {
      const href = g.links[0] && g.links[0][1];
      const gkey = href ? new URLSearchParams(href.split("?")[1] || "").get("game") : null;
      const price = gkey && typeof GAME_META !== "undefined" && GAME_META[gkey] ? GAME_META[gkey].ticketPrice : null;
      return `
      <section class="panel hist-cta${g.retired ? " hist-cta--retired" : ""}">
        <div><h2>${g.name}${g.retired ? ' <span class="badge-retired">Retired</span>' : ""}</h2>
          <p>${g.meta}${price ? ` <span class="ticket-chip">${price}</span>` : ""}</p></div>
        <div class="game-links">${
          g.links.length
            ? g.links.map(([t, h]) => `<a class="btn" href="${h}${h.startsWith("game.html") ? `&back=${s.abbr}` : ""}">${t}</a>`).join("")
            : '<span class="muted">Coming soon</span>'
        }</div>
      </section>`;
    };
    host.innerHTML =
      `<div id="best-game-slot"></div>` +
      `<p class="lead">${cfg.intro}</p>` +
      `<h2 class="state-section">${s.name} draw games</h2>` +
      cfg.games.map(card).join("") +
      (cfg.national && cfg.national.length
        ? `<h2 class="state-section">National games played in ${s.name}</h2>` +
          cfg.national.map(card).join("")
        : "");
    fillBestGame(s, cfg);
    return;
  }

  subEl.textContent = "Results, odds, expected value & number frequency — coming soon.";
  host.innerHTML = `
    <p class="lead">Full ${s.name} lottery coverage is on the way to NumbersIntel.</p>
    <section class="panel">
      <h2>What you'll find here</h2>
      <ul>
        <li>Every draw result for ${s.name}'s games, with a searchable archive</li>
        <li>Expected value per $1 for each game and prize tier</li>
        <li>Hot &amp; cold number frequency and most-overdue tracking</li>
        <li>Jackpot history and odds — the same analytics as our national games</li>
      </ul>
    </section>
    <p class="muted">In the meantime, see value rankings for Powerball, Mega Millions, and Lotto
      America on the <a href="index.html">home page</a>.</p>`;
}

renderHub();
renderState();

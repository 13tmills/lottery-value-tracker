// Shared helpers used by the home page (app.js) and the per-game detail page
// (game.js). Loaded as a plain script, so everything here is a global — do NOT
// redeclare these names in the page scripts.

const GAME_META = {
  powerball: {
    label: "Powerball", specialKey: "powerball", specialName: "Powerball", specialAbbr: "PB",
    draws: "Mon · Wed · Sat", bonusKey: "power_play", bonusName: "Power Play", ticketPrice: "$2",
    priceChanges: [{ date: "2012-01-15", label: "Ticket $1 → $2" }],
  },
  mega_millions: {
    label: "Mega Millions", specialKey: "mega_ball", specialName: "Mega Ball", specialAbbr: "MB",
    draws: "Tue · Fri", bonusKey: "megaplier", bonusName: "Megaplier", ticketPrice: "$5",
    priceChanges: [{ date: "2025-04-08", label: "Ticket $2 → $5" }],
  },
  lotto_america: {
    label: "Lotto America", specialKey: "star_ball", specialName: "Star Ball", specialAbbr: "SB",
    draws: "Mon · Wed · Sat", bonusKey: "all_star_bonus", bonusName: "All Star Bonus", ticketPrice: "$1",
    priceChanges: [],
  },
  // State games (data via data.ny.gov). NY Lotto additionally carries a live
  // jackpot + cash value (from nylottery.ny.gov) so it gets an EV treatment; its
  // lower tiers are pari-mutuel, so those prize amounts are typical references.
  ny_lotto: {
    label: "New York Lotto", specialKey: "bonus", specialName: "Bonus", specialAbbr: "B",
    draws: "Wed · Sat", priceChanges: [], state: "NY", stateName: "New York", ticketPrice: "$1 for 2 plays",
    ev: {
      ticket_price: 0.5, // $1 buys two plays
      odds_jackpot: 45057474, // Match 6
      overall_odds: 92.05,
      // Prize amounts + winner counts come live from each draw (nylottery.ny.gov);
      // this just maps the feed's tier names to their (fixed) odds and labels.
      levels: {
        Jackpot: { label: "Jackpot (Match 6)", odds: 45057474, pari: true },
        Second: { label: "Match 5 + Bonus", odds: 7509579, pari: true },
        Third: { label: "Match 5", odds: 144415, pari: true },
        Fourth: { label: "Match 4", odds: 2179, pari: true },
        Fifth: { label: "Match 3", odds: 96.2, pari: false },
      },
    },
  },
  ny_take5: {
    label: "Take 5", specialKey: null, specialName: "", draws: "Daily (evening)", priceChanges: [],
    state: "NY", stateName: "New York", ticketPrice: "$1",
    // Pari-mutuel — prize amounts come live from each draw; the lowest tier is a free play.
    ev: {
      ticket_price: 1,
      overall_odds: 8.77,
      levels: {
        First: { label: "Match 5", odds: 575757 },
        Second: { label: "Match 4", odds: 3387 },
        Third: { label: "Match 3", odds: 103 },
        Fourth: { label: "Match 2 (free play)", odds: 9.62, free: true },
      },
    },
  },
  ny_pick10: {
    label: "Pick 10", specialKey: null, specialName: "", draws: "Daily", priceChanges: [],
    state: "NY", stateName: "New York", ticketPrice: "$1",
    // Fixed prizes (not in the feed, so set here); winner counts come live per draw.
    ev: {
      ticket_price: 1,
      overall_odds: 17.0,
      levels: {
        First: { label: "Match 10", odds: 8911711, prize: 500000 },
        Second: { label: "Match 9", odds: 163381, prize: 6000 },
        Third: { label: "Match 8", odds: 7384, prize: 300 },
        Fourth: { label: "Match 7", odds: 621, prize: 40 },
        Fifth: { label: "Match 6", odds: 87.5, prize: 10 },
        Sixth: { label: "Match 0", odds: 21.84, prize: 4 },
      },
    },
  },
  // Win 4 — a 4-digit game. Payout depends on bet type, so no single "value per $1";
  // the feed gives winner counts by play type, and the reference table the payouts.
  ny_win4: {
    label: "Win 4", specialKey: null, specialName: "", draws: "Twice daily (evening)",
    priceChanges: [], state: "NY", stateName: "New York", digits: true, ticketPrice: "$0.50 or $1",
    prizes: {
      tierLabel: "Bet type",
      winnersTitle: "Winners by bet type",
      note: "NY winner counts by play type for the latest draw. Win 4 is a 4-digit game (0000–9999); what you win depends on your bet type and amount — see the payout guide below.",
      topPrize: "$5,000",
      topPrizeLabel: "Top prize (Straight $1)",
      reference: {
        title: "How Win 4 pays (per $1 play)",
        columns: ["Bet type", "Prize", "Odds"],
        rows: [
          { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] },
          { cells: ["4-Way Box (3 alike)", "$1,200", "1 in 2,500"] },
          { cells: ["6-Way Box (2 pairs)", "$800", "1 in 1,667"] },
          { cells: ["12-Way Box (1 pair)", "$400", "1 in 833"] },
          { cells: ["24-Way Box (all unique)", "$200", "1 in 417"] },
          { cells: ["Front Pair / Back Pair", "$50", "1 in 100"] },
          { cells: ["Combination (covers straights)", "$5,000", "cost varies"] },
        ],
        note: "Shown for a $1 play; 50¢ plays pay half. A Box wins if your digits are drawn in any order — the prize depends on how many arrangements your number has.",
      },
    },
  },
  // Millionaire For Life — 5 numbers + Mill Ball. Fixed prizes (top two pay for
  // life), so we show the prize tiers + winner counts rather than a value/$1.
  ny_m4l: {
    label: "Millionaire For Life", specialKey: "mill_ball", specialName: "Mill Ball", specialAbbr: "MB",
    draws: "Daily", priceChanges: [], state: "NY", stateName: "New York", ticketPrice: "$5",
    cashValue: "$18M", // one-time cash option for the $1M/yr-for-life top prize
    // "$1,000,000 a year for life" vs the $18M lump sum — drives the lifetime
    // annuity-vs-cash calculator (lifecalc.html). Annual payment is flat (not
    // graduated like the 30-yr games); the payout length is your remaining years.
    forLife: { annual: 1_000_000, cash: 18_000_000, prizeLabel: "$1,000,000 a year for life" },
    prizes: {
      tierLabel: "Prize tier",
      winnersTitle: "Prize tiers & winners",
      winnersLabel: "Winners (NY)",
      note: "Millionaire For Life's top prize is $1,000,000 a year for life — or a one-time cash option of $18 million; the second tier is $100,000 a year for life. The rest are fixed cash prizes. Winner counts are New York winners for the latest draw.",
      topPrize: "$1M / yr for life",
      topPrizeLabel: "Top prize",
    },
    // 5 of 60 + Mill Ball 1 of 5 — odds for the visualizer.
    viz: {
      tiers: [
        { label: "Match 5 + Mill Ball", odds: 27307560 },
        { label: "Match 5", odds: 6826890 },
        { label: "Match 4 + Mill Ball", odds: 99300 },
        { label: "Match 4", odds: 24825 },
        { label: "Match 3 + Mill Ball", odds: 1839 },
        { label: "Match 3", odds: 460 },
        { label: "Match 2 + Mill Ball", odds: 104 },
        { label: "Match 1 + Mill Ball", odds: 16 },
        { label: "Mill Ball only", odds: 8 },
      ],
    },
  },
  // Cash4Life — retired Feb 2026, replaced by Millionaire For Life. Archive: final
  // results, prize tiers and winner counts, and number frequency.
  ny_cash4life: {
    label: "Cash4Life", specialKey: "cash_ball", specialName: "Cash Ball", specialAbbr: "CB",
    draws: "Daily", priceChanges: [], state: "NY", stateName: "New York", ticketPrice: "$2",
    prizes: {
      tierLabel: "Prize tier",
      winnersTitle: "Prize tiers & winners",
      note: "Cash4Life was retired in February 2026 (replaced by Millionaire For Life). These are the prize amounts and NY winner counts from its final draw.",
      topPrize: "$1,000 / day for life",
      topPrizeLabel: "Top prize",
      retired: true,
    },
    // 5 of 60 + Cash Ball 1 of 4 — odds for the visualizer.
    viz: {
      tiers: [
        { label: "Match 5 + Cash Ball", odds: 21846048 },
        { label: "Match 5", odds: 7282016 },
        { label: "Match 4 + Cash Ball", odds: 79440 },
        { label: "Match 4", odds: 26480 },
        { label: "Match 3 + Cash Ball", odds: 1471 },
        { label: "Match 3", odds: 490 },
        { label: "Match 2 + Cash Ball", odds: 83 },
        { label: "Match 1 + Cash Ball", odds: 13 },
        { label: "Cash Ball only", odds: 6 },
      ],
    },
  },
  // Quick Draw — keno drawn every ~4 minutes. No per-draw jackpot; the payout
  // depends on how many "spots" (1–10) you pick. We keep a recent window of draws
  // for results/frequency and a static spot paytable. Odds are exact (match all K).
  ny_quickdraw: {
    label: "Quick Draw", specialKey: null, specialName: "", draws: "Every ~4 minutes",
    priceChanges: [], state: "NY", stateName: "New York", recentWindow: true, ticketPrice: "$1–$10 per draw",
    prizes: {
      topPrize: "$100,000",
      topPrizeLabel: "Top prize (10-spot $1)",
      reference: {
        title: "Top prize & odds by spot",
        columns: ["Spots played", "Top prize (match all, $1)", "Odds (match all)"],
        rows: [
          { cells: ["10 spots", "$100,000", "1 in 8,911,711"] },
          { cells: ["9 spots", "$30,000", "1 in 1,380,688"] },
          { cells: ["8 spots", "$10,000", "1 in 230,115"] },
          { cells: ["7 spots", "$5,000", "1 in 40,979"] },
          { cells: ["6 spots", "$1,000", "1 in 7,753"] },
          { cells: ["5 spots", "$300", "1 in 1,551"] },
          { cells: ["4 spots", "$55", "1 in 327"] },
          { cells: ["3 spots", "$23", "1 in 72"] },
          { cells: ["2 spots", "$10", "1 in 17"] },
          { cells: ["1 spot", "$2", "1 in 4"] },
        ],
        note: "You choose 1–10 “spots”; 20 numbers are drawn every ~4 minutes. Shown is the top prize (matching all your spots) on a $1 play — smaller partial-match prizes also apply. An optional Extra multiplier (×2–×10) can boost winnings. Number frequency below covers only the most recent draws.",
      },
    },
  },
  // Numbers — a 3-digit game (the sibling of Win 4). Same bet-type structure.
  ny_numbers: {
    label: "Numbers", specialKey: null, specialName: "", draws: "Twice daily (evening)",
    priceChanges: [], state: "NY", stateName: "New York", digits: true, ticketPrice: "$0.50 or $1",
    prizes: {
      tierLabel: "Bet type",
      winnersTitle: "Winners by bet type",
      note: "NY winner counts by play type for the latest draw. Numbers is a 3-digit game (000–999); what you win depends on your bet type and amount — see the payout guide below.",
      topPrize: "$500",
      topPrizeLabel: "Top prize (Straight $1)",
      reference: {
        title: "How Numbers pays (per $1 play)",
        columns: ["Bet type", "Prize", "Odds"],
        rows: [
          { cells: ["Straight — exact order", "$500", "1 in 1,000"] },
          { cells: ["3-Way Box (2 alike)", "$160", "1 in 333"] },
          { cells: ["6-Way Box (all unique)", "$80", "1 in 167"] },
          { cells: ["Front Pair / Back Pair", "$50", "1 in 100"] },
          { cells: ["Combination (covers straights)", "$500", "cost varies"] },
        ],
        note: "Shown for a $1 play; 50¢ plays pay half. A Box wins if your digits are drawn in any order — the prize depends on how many arrangements your number has.",
      },
    },
  },

  // ===== Texas =====
  // Lotto Texas — 6 of 54 jackpot game. Numbers from texaslottery.com CSV export;
  // estimated jackpot per draw from the results table. (Cash value + per-tier
  // prizes/winners are a later enhancement.)
  tx_lotto: {
    label: "Lotto Texas", specialKey: null, specialName: "", draws: "Mon · Wed · Sat",
    priceChanges: [], state: "TX", stateName: "Texas", ticketPrice: "$1",
    // Full value treatment: realized per-tier prizes/winners (from draw detail pages)
    // + cash value. Lower tiers are pari-mutuel; Match 3 is a fixed $3.
    ev: {
      ticket_price: 1,
      odds_jackpot: 25827165, // 6 of 54
      overall_odds: 71,
      winnersLabel: "TX winners",
      levels: {
        Jackpot: { label: "Jackpot (Match 6)", odds: 25827165 },
        "Match 5": { label: "Match 5", odds: 89678 },
        "Match 4": { label: "Match 4", odds: 1526 },
        "Match 3": { label: "Match 3", odds: 75 },
      },
    },
  },
  // Texas Two Step — 4 of 35 + a separate Bonus ball (1 of 35); jackpot game.
  tx_twostep: {
    label: "Texas Two Step", specialKey: "bonus", specialName: "Bonus Ball", specialAbbr: "B",
    draws: "Mon · Thu", priceChanges: [], state: "TX", stateName: "Texas", ticketPrice: "$1",
    oddsJackpot: 1832600, // 4 of 35 + Bonus
    // Per-tier prizes + Texas winner counts (texaslottery.com detail pages). The
    // top prize is an annuity jackpot with NO cash option; lower tiers are mostly
    // fixed. Keys must match the scraper's level names (see enrich_texas_details).
    prizes: {
      tierLabel: "Prize tier",
      winnersTitle: "Prize tiers & winners",
      winnersLabel: "TX winners",
      note: "Prize amounts and Texas winner counts from the latest draw. The jackpot is paid as an annuity (no cash option); the top non-jackpot tiers are pari-mutuel, so those amounts move with sales and winners.",
      odds: {
        "Jackpot": 1832600,
        "Match 4": 53900,
        "Match 3 + Bonus": 14779,
        "Match 3": 435,
        "Match 2 + Bonus": 657,
        "Match 1 + Bonus": 102,
        "Bonus Ball only": 58,
      },
    },
    viz: {
      tiers: [
        { label: "Match 4 + Bonus", odds: 1832600 },
        { label: "Match 4", odds: 53900 },
        { label: "Match 3 + Bonus", odds: 14779 },
        { label: "Match 3", odds: 435 },
        { label: "Match 2 + Bonus", odds: 657 },
        { label: "Match 1 + Bonus", odds: 102 },
        { label: "Match 0 + Bonus", odds: 58 },
      ],
    },
  },
  // Cash Five — 5 of 35, pari-mutuel prizes (no rolling jackpot). Realized per-tier
  // payouts + TX winner counts from texaslottery.com detail pages drive a value/$1
  // treatment; the bottom tier (Match 2) pays a free quick pick. Keys match the
  // scraper's level names. (odds for the lower tiers are approximate.)
  tx_cashfive: {
    label: "Cash Five", specialKey: null, specialName: "", draws: "Mon – Sat",
    priceChanges: [], state: "TX", stateName: "Texas", ticketPrice: "$1",
    ev: {
      ticket_price: 1,
      overall_odds: 7,
      winnersLabel: "TX winners",
      levels: {
        "Match 5": { label: "Match 5", odds: 324632, prize: 25000 }, // ~$25k advertised top prize (pari-mutuel); fallback when a draw has no top winner
        "Match 4": { label: "Match 4", odds: 2164 },
        "Match 3": { label: "Match 3", odds: 75 },
        "Match 2": { label: "Match 2 (free play)", odds: 8, free: true },
      },
    },
  },
  // Pick 3 — 3-digit game drawn 4× a day (we keep the latest draw per date).
  tx_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", draws: "4× daily",
    priceChanges: [], state: "TX", stateName: "Texas", digits: true, ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Pick 3 is a 3-digit game (000–999) drawn four times a day; what you win depends on your bet type. An optional Fire Ball add-on adds extra ways to win.",
      topPrize: "$500",
      topPrizeLabel: "Top prize (Straight $1)",
      reference: {
        title: "How Pick 3 pays (per $1 play)",
        columns: ["Bet type", "Prize", "Odds"],
        rows: [
          { cells: ["Straight — exact order", "$500", "1 in 1,000"] },
          { cells: ["3-Way Box (2 alike)", "$160", "1 in 333"] },
          { cells: ["6-Way Box (all unique)", "$80", "1 in 167"] },
          { cells: ["Front Pair / Back Pair", "$50", "1 in 100"] },
          { cells: ["Combo (covers straights)", "$500", "cost varies"] },
        ],
        note: "Shown for a $1 play; 50¢ plays pay half.",
      },
    },
  },
  // Daily 4 — 4-digit game drawn 4× a day (we keep the latest draw per date).
  tx_daily4: {
    label: "Daily 4", specialKey: null, specialName: "", draws: "4× daily",
    priceChanges: [], state: "TX", stateName: "Texas", digits: true, ticketPrice: "$0.50 to $5",
    prizes: {
      note: "Daily 4 is a 4-digit game (0000–9999) drawn four times a day; what you win depends on your bet type. An optional Fire Ball add-on adds extra ways to win.",
      topPrize: "$5,000",
      topPrizeLabel: "Top prize (Straight $1)",
      reference: {
        title: "How Daily 4 pays (per $1 play)",
        columns: ["Bet type", "Prize", "Odds"],
        rows: [
          { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] },
          { cells: ["4-Way Box (3 alike)", "$1,200", "1 in 2,500"] },
          { cells: ["6-Way Box (2 pairs)", "$800", "1 in 1,667"] },
          { cells: ["12-Way Box (1 pair)", "$400", "1 in 833"] },
          { cells: ["24-Way Box (all unique)", "$200", "1 in 417"] },
          { cells: ["Combo (covers straights)", "$5,000", "cost varies"] },
        ],
        note: "Shown for a $1 play; 50¢ plays pay half.",
      },
    },
  },
  // All or Nothing — pick 12 of 24; win the top prize by matching ALL 12 or NONE.
  // Drawn 4× a day, so we keep a recent window.
  tx_allornothing: {
    label: "All or Nothing", specialKey: null, specialName: "", draws: "4× daily",
    priceChanges: [], state: "TX", stateName: "Texas", recentWindow: true, ticketPrice: "$2",
    prizes: {
      note: "All or Nothing: pick 12 numbers from 1–24 — you win the top prize by matching ALL 12 or NONE of the 12 drawn. Number frequency below covers the most recent draws.",
      topPrize: "$250,000",
      topPrizeLabel: "Top prize (12 or 0)",
      reference: {
        title: "How All or Nothing pays ($2 play)",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["All 12 or none", "$250,000", "1 in 1,352,078"] },
          { cells: ["11 or 1", "$500", "1 in 9,389"] },
          { cells: ["10 or 2", "$50", "1 in 310"] },
          { cells: ["9 or 3", "$5", "1 in 28"] },
          { cells: ["8 or 4", "$2", "1 in 6"] },
        ],
        note: "Match all 12 or exactly none for the top prize. Overall odds of any prize: about 1 in 4.6.",
      },
    },
  },
  // ----- California ------------------------------------------------------- #
  // SuperLotto Plus — 5 of 47 + Mega 1 of 27. Live jackpot + cash value and the
  // full per-tier value/$1 treatment, all from the calottery.com API (one call).
  ca_superlotto: {
    label: "SuperLotto Plus", specialKey: "mega", specialName: "Mega", specialAbbr: "Mega",
    draws: "Wed · Sat", priceChanges: [], state: "CA", stateName: "California", ticketPrice: "$1",
    ev: {
      ticket_price: 1,
      odds_jackpot: 41416353,
      overall_odds: 23,
      winnersLabel: "CA winners",
      levels: {
        "Jackpot": { label: "Jackpot (5 + Mega)", odds: 41416353 },
        "Match 5": { label: "Match 5", odds: 1592937 },
        "Match 4 + Mega": { label: "Match 4 + Mega", odds: 197221 },
        "Match 4": { label: "Match 4", odds: 7585 },
        "Match 3 + Mega": { label: "Match 3 + Mega", odds: 4810 },
        "Match 3": { label: "Match 3", odds: 185 },
        "Match 2 + Mega": { label: "Match 2 + Mega", odds: 361 },
        "Match 1 + Mega": { label: "Match 1 + Mega", odds: 74 },
        "Mega only": { label: "Mega only", odds: 49 },
      },
    },
  },
  // Fantasy 5 — 5 of 39, pari-mutuel (rolling top prize, no cash option). Value/$1
  // treatment like Cash Five; the bottom tier (Match 2) pays a free Quick Pick.
  // (Lower-tier odds are approximate.)
  ca_fantasy5: {
    label: "Fantasy 5", specialKey: null, specialName: "",
    draws: "Daily", priceChanges: [], state: "CA", stateName: "California", ticketPrice: "$1",
    ev: {
      ticket_price: 1,
      overall_odds: 9,
      winnersLabel: "CA winners",
      levels: {
        "Match 5": { label: "Match 5 (top prize)", odds: 575757, prize: 100000 },
        "Match 4": { label: "Match 4", odds: 3387 },
        "Match 3": { label: "Match 3", odds: 103 },
        "Match 2": { label: "Match 2 (free play)", odds: 10, free: true },
      },
    },
  },
  // Daily 4 — 4 digits, once daily. California pays it PARI-MUTUEL, so we show the
  // live per-bet-type payouts + winner counts from the latest draw (not a fixed table).
  ca_daily4: {
    label: "Daily 4", specialKey: null, specialName: "", digits: true,
    draws: "Daily", priceChanges: [], state: "CA", stateName: "California", ticketPrice: "$1",
    prizes: {
      tierLabel: "Bet type",
      winnersTitle: "Bet types, payouts & winners",
      winnersLabel: "CA winners",
      note: "Daily 4 is a 4-digit game (0000–9999). California pays it pari-mutuel, so the Straight/Box payouts move every draw with sales and the number of winners. Amounts and winner counts are from the latest draw.",
    },
  },
  // Daily 3 — 3 digits, twice daily (we track the evening draw). Pari-mutuel, like Daily 4.
  ca_daily3: {
    label: "Daily 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "CA", stateName: "California", ticketPrice: "$1",
    prizes: {
      tierLabel: "Bet type",
      winnersTitle: "Bet types, payouts & winners",
      winnersLabel: "CA winners",
      note: "Daily 3 is a 3-digit game (000–999) drawn twice a day; we track the evening draw. California pays it pari-mutuel, so the Straight/Box payouts move every draw with sales and winners. Latest-draw figures.",
    },
  },
  // Daily Derby — a virtual horse race: 1st/2nd/3rd placed horses + a race time, with
  // exotic bets (Win/Exacta/Trifecta) and a rolling Grand Prize. Custom "latest race"
  // panel (see game.js) on top of the jackpot-stat + live bet table. (Grand Prize odds approx.)
  ca_derby: {
    label: "Daily Derby", specialKey: null, specialName: "", derby: true,
    draws: "Daily", priceChanges: [], state: "CA", stateName: "California", ticketPrice: "$2",
    oddsJackpot: 1320000, // Grand Prize: 1st/2nd/3rd in order + race time (official)
    prizes: {
      tierLabel: "Bet",
      winnersTitle: "Bets, payouts & winners",
      winnersLabel: "CA winners",
      note: "Daily Derby is a virtual horse race: pick the 1st, 2nd and 3rd place horses — plus the race time for the Grand Prize. Pari-mutuel payouts; amounts and winner counts are from the latest race.",
    },
  },
  // ----- Idaho ------------------------------------------------------------ #
  // Idaho Cash — 5 of 45, daily, rolling CASH jackpot (lump sum). Lower tiers pay
  // FIXED amounts (Match 2 = free ticket). Idaho doesn't publish per-draw winner
  // counts, so this uses the "static prizes" value/$1 treatment: the jackpot is
  // priced at the live cash jackpot and the lower tiers at their fixed prizes.
  id_cash: {
    label: "Idaho Cash", specialKey: null, specialName: "",
    draws: "Daily", priceChanges: [], state: "ID", stateName: "Idaho", ticketPrice: "$1",
    ev: {
      ticket_price: 1,
      odds_jackpot: 610880,
      overall_odds: 5.7,
      staticPrizes: true, // no per-draw prize/winner data — value from fixed config + live jackpot
      levels: {
        "Jackpot": { label: "Jackpot (Match 5)", odds: 610880 },
        "Match 4": { label: "Match 4", odds: 3054, prize: 200 },
        "Match 3": { label: "Match 3", odds: 78, prize: 5 },
        "Match 2": { label: "Match 2 (free play)", odds: 6, free: true },
      },
    },
  },
  // Idaho Pick 3 — 3-digit, twice daily (we track the night draw). Fixed payouts by
  // play type; Idaho doesn't publish winner counts, so this is a static paytable.
  id_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "ID", stateName: "Idaho", ticketPrice: "$1",
    prizes: {
      note: "Idaho Pick 3 is a 3-digit game (000–999) drawn twice a day; we track the night draw. What you win depends on your play type — prizes are fixed (shown for a $1 wager).",
      topPrize: "$500",
      topPrizeLabel: "Top prize (Exact Order $1)",
      reference: {
        title: "How Idaho Pick 3 pays (per $1 wager)",
        columns: ["Play type", "Prize", "Odds"],
        rows: [
          { cells: ["Exact Order (straight)", "$500", "1 in 1,000"] },
          { cells: ["Any Order — 3-way", "$160", "1 in 333"] },
          { cells: ["Any Order — 6-way", "$80", "1 in 167"] },
          { cells: ["Front Pair", "$50", "1 in 100"] },
          { cells: ["Back Pair", "$50", "1 in 100"] },
        ],
        note: "Shown for a $1 wager. Exact/Any combo plays and the optional Sum It Up! add-on pay differently.",
      },
    },
  },
  // Idaho Pick 4 — 4-digit, twice daily (night draw). Fixed payouts by play type.
  id_pick4: {
    label: "Pick 4", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "ID", stateName: "Idaho", ticketPrice: "$1",
    prizes: {
      note: "Idaho Pick 4 is a 4-digit game (0000–9999) drawn twice a day; we track the night draw. What you win depends on your play type — prizes are fixed (shown for a $1 wager).",
      topPrize: "$5,000",
      topPrizeLabel: "Top prize (Exact Order $1)",
      reference: {
        title: "How Idaho Pick 4 pays (per $1 wager)",
        columns: ["Play type", "Prize", "Odds"],
        rows: [
          { cells: ["Exact Order (straight)", "$5,000", "1 in 10,000"] },
          { cells: ["Any Order — 4-way", "$1,200", "1 in 2,500"] },
          { cells: ["Any Order — 6-way", "$800", "1 in 1,667"] },
          { cells: ["Any Order — 12-way", "$400", "1 in 833"] },
          { cells: ["Any Order — 24-way", "$200", "1 in 417"] },
          { cells: ["Front / Mid / Back Pair", "$50", "1 in 100"] },
        ],
        note: "Shown for a $1 wager. Exact/Any combo plays pay differently.",
      },
    },
  },
  // ----- Pennsylvania ----------------------------------------------------- #
  // PA Pick 3/4/5 — digit games drawn twice daily (we track one stream). Fixed
  // payouts by play type; the standout is depth — every draw back to 2015 (the
  // deepest number-frequency history on the site), from the PA Lottery's own API.
  pa_pick3: {
    label: "PA Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "PA", stateName: "Pennsylvania", ticketPrice: "$1",
    prizes: {
      note: "Pennsylvania Pick 3 is a 3-digit game (000–999) drawn twice a day; we track one draw stream with the full archive back to 2015. Fixed payouts by play type (shown for a $1 straight wager); an optional Wild Ball add-on adds ways to win.",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: {
        title: "How PA Pick 3 pays (per $1 wager)",
        columns: ["Play type", "Prize", "Odds"],
        rows: [
          { cells: ["Straight — exact order", "$500", "1 in 1,000"] },
          { cells: ["Box — 3-way", "$160", "1 in 333"] },
          { cells: ["Box — 6-way", "$80", "1 in 167"] },
          { cells: ["Front Pair / Back Pair", "$50", "1 in 100"] },
        ],
        note: "Shown for a $1 straight wager. Wild Ball and other plays pay per PA Lottery rules.",
      },
    },
  },
  pa_pick4: {
    label: "PA Pick 4", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "PA", stateName: "Pennsylvania", ticketPrice: "$1",
    prizes: {
      note: "Pennsylvania Pick 4 is a 4-digit game (0000–9999) drawn twice a day; we track one draw stream with the full archive back to 2015. Fixed payouts by play type (shown for a $1 straight wager); an optional Wild Ball add-on adds ways to win.",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: {
        title: "How PA Pick 4 pays (per $1 wager)",
        columns: ["Play type", "Prize", "Odds"],
        rows: [
          { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] },
          { cells: ["Box — 4-way", "$1,200", "1 in 2,500"] },
          { cells: ["Box — 6-way", "$800", "1 in 1,667"] },
          { cells: ["Box — 12-way", "$400", "1 in 833"] },
          { cells: ["Box — 24-way", "$200", "1 in 417"] },
        ],
        note: "Shown for a $1 straight wager. Wild Ball and other plays pay per PA Lottery rules.",
      },
    },
  },
  pa_pick5: {
    label: "PA Pick 5", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "PA", stateName: "Pennsylvania", ticketPrice: "$1",
    prizes: {
      note: "Pennsylvania Pick 5 is a 5-digit game (00000–99999) drawn twice a day; we track one draw stream with the full archive back to 2015. Fixed payouts by play type (shown for a $1 straight wager); an optional Wild Ball add-on adds ways to win.",
      topPrize: "$50,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: {
        title: "How PA Pick 5 pays (per $1 wager)",
        columns: ["Play type", "Prize", "Odds"],
        rows: [
          { cells: ["Straight — exact order", "$50,000", "1 in 100,000"] },
          { cells: ["Box — 5-way", "$10,000", "1 in 20,000"] },
          { cells: ["Box — 10-way", "$5,000", "1 in 10,000"] },
          { cells: ["Box — 20-way", "$2,500", "1 in 5,000"] },
          { cells: ["Box — 60-way", "$800", "1 in 1,667"] },
          { cells: ["Box — 120-way", "$400", "1 in 833"] },
        ],
        note: "Shown for a $1 straight wager. Wild Ball and other plays pay per PA Lottery rules.",
      },
    },
  },
  // ----- Florida ---------------------------------------------------------- #
  // Florida Lotto — 6 of 53, twice weekly, pari-mutuel jackpot + lower tiers (with a
  // 2×–5× multiplier add-on). Standout: the FULL archive back to 1988 — the deepest
  // number-frequency history on the site — from the FL Lottery's own API.
  fl_lotto: {
    label: "Florida Lotto", specialKey: null, specialName: "",
    draws: "Wed · Sat", priceChanges: [], state: "FL", stateName: "Florida", ticketPrice: "$2",
    // Per-tier prizes + winners come from FL's getDrawGameTiersHistory API — the 2×–10×
    // multiplier sub-tiers are aggregated to Match N (winner-weighted average prize).
    // FL doesn't publish the jackpot cash option, so the jackpot tier is priced at the
    // advertised jackpot. Match 2 wins a free Quick Pick.
    ev: {
      ticket_price: 2,
      odds_jackpot: 22957480,
      overall_odds: 7.6,
      winnersLabel: "FL winners",
      levels: {
        "Jackpot": { label: "Jackpot (Match 6)", odds: 22957480 },
        "Match 5": { label: "Match 5", odds: 81410 },
        "Match 4": { label: "Match 4", odds: 1416 },
        "Match 3": { label: "Match 3", odds: 71 },
        "Match 2": { label: "Match 2 (free play)", odds: 9, free: true },
      },
    },
  },
  // Jackpot Triple Play — 6 of 46, pari-mutuel jackpot. Jackpot stat + odds + frequency.
  fl_triple: {
    label: "Jackpot Triple Play", specialKey: null, specialName: "",
    draws: "Tue · Fri · Sun", priceChanges: [], state: "FL", stateName: "Florida", ticketPrice: "$1",
    oddsJackpot: 9366819, // 6 of 46
    // Real per-tier prizes + winners from the FL tiers API (live table). No single value/$1
    // because each $1 play is three lines plus Combo prizes — odds shown are for one line.
    prizes: {
      tierLabel: "Match (one line)", winnersTitle: "Prize tiers & winners", winnersLabel: "FL winners",
      note: "Jackpot Triple Play is 6 of 46 — three sets of numbers per play. The jackpot is pari-mutuel; non-jackpot prizes are pari-mutuel too, and Combo prizes pay when your three lines share matches. Amounts and winner counts are the latest draw's actual results (per single line).",
      odds: { "Jackpot": 9366819, "Match 5": 39028, "Match 4": 800, "Match 3": 47 },
    },
    viz: { tiers: [ { label: "Match 6 (jackpot)", odds: 9366819 }, { label: "Match 5", odds: 39028 }, { label: "Match 4", odds: 800 }, { label: "Match 3", odds: 47 } ] },
  },
  // Fantasy 5 — 5 of 36, twice daily (we track the evening draw), pari-mutuel top prize.
  // Fantasy 5 — 5 of 36, twice daily (evening), pari-mutuel. Per-tier prizes/winners from
  // the FL tiers API drive a value/$1 treatment; the top prize rolls (Match 5 has a ~$200k
  // representative fallback for no-winner draws); Match 2 wins a free Quick Pick.
  fl_fantasy5: {
    label: "Fantasy 5", specialKey: null, specialName: "",
    draws: "Twice daily", priceChanges: [], state: "FL", stateName: "Florida", ticketPrice: "$1",
    ev: {
      ticket_price: 1,
      overall_odds: 8,
      winnersLabel: "FL winners",
      levels: {
        "Match 5": { label: "Match 5 (top prize)", odds: 376992, prize: 200000 },
        "Match 4": { label: "Match 4", odds: 2432 },
        "Match 3": { label: "Match 3", odds: 81 },
        "Match 2": { label: "Match 2 (free play)", odds: 8, free: true },
      },
    },
  },
  // Florida Pick 2/3/4/5 — digit games, twice daily (evening), fixed payouts + a Fireball add-on.
  fl_pick2: {
    label: "FL Pick 2", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "FL", stateName: "Florida", ticketPrice: "$1",
    prizes: {
      note: "Florida Pick 2 is a 2-digit game (00–99) drawn twice a day; we track the evening draw. Fixed payouts by play type (shown for a $1 straight); an optional Fireball add-on adds ways to win.",
      topPrize: "$50", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How FL Pick 2 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$50", "1 in 100"] }, { cells: ["Box — 2-way", "$25", "1 in 50"] }, { cells: ["Front / Back digit", "$5", "1 in 10"] } ],
        note: "Shown for a $1 straight. Fireball plays pay per FL Lottery rules." },
    },
  },
  fl_pick3: {
    label: "FL Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "FL", stateName: "Florida", ticketPrice: "$1",
    prizes: {
      note: "Florida Pick 3 is a 3-digit game (000–999) drawn twice a day; we track the evening draw. Fixed payouts by play type (shown for a $1 straight); an optional Fireball add-on adds ways to win.",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How FL Pick 3 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$500", "1 in 1,000"] }, { cells: ["Box — 3-way", "$160", "1 in 333"] }, { cells: ["Box — 6-way", "$80", "1 in 167"] }, { cells: ["Front / Back Pair", "$50", "1 in 100"] } ],
        note: "Shown for a $1 straight. Fireball plays pay per FL Lottery rules." },
    },
  },
  fl_pick4: {
    label: "FL Pick 4", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "FL", stateName: "Florida", ticketPrice: "$1",
    prizes: {
      note: "Florida Pick 4 is a 4-digit game (0000–9999) drawn twice a day; we track the evening draw. Fixed payouts by play type (shown for a $1 straight); an optional Fireball add-on adds ways to win.",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How FL Pick 4 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] }, { cells: ["Box — 4-way", "$1,200", "1 in 2,500"] }, { cells: ["Box — 6-way", "$800", "1 in 1,667"] }, { cells: ["Box — 12-way", "$400", "1 in 833"] }, { cells: ["Box — 24-way", "$200", "1 in 417"] } ],
        note: "Shown for a $1 straight. Fireball plays pay per FL Lottery rules." },
    },
  },
  fl_pick5: {
    label: "FL Pick 5", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "FL", stateName: "Florida", ticketPrice: "$1",
    prizes: {
      note: "Florida Pick 5 is a 5-digit game (00000–99999) drawn twice a day; we track the evening draw. Fixed payouts by play type (shown for a $1 straight); an optional Fireball add-on adds ways to win.",
      topPrize: "$50,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How FL Pick 5 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$50,000", "1 in 100,000"] }, { cells: ["Box — 5-way", "$10,000", "1 in 20,000"] }, { cells: ["Box — 10-way", "$5,000", "1 in 10,000"] }, { cells: ["Box — 20-way", "$2,500", "1 in 5,000"] }, { cells: ["Box — 60-way", "$800", "1 in 1,667"] }, { cells: ["Box — 120-way", "$400", "1 in 833"] } ],
        note: "Shown for a $1 straight. Fireball plays pay per FL Lottery rules." },
    },
  },
  // Cash Pop — pick 1 of 15, drawn 5x a day (we track the evening draw); the prize is
  // preprinted (randomly assigned) on your ticket. Frequency over 1-15 is the feature.
  fl_cashpop: {
    label: "Cash Pop", specialKey: null, specialName: "",
    draws: "5× daily", priceChanges: [], state: "FL", stateName: "Florida", ticketPrice: "$1 to $5",
    prizes: {
      note: "Cash Pop: pick a number from 1 to 15, and your ticket reveals a random prize. If your number is drawn, you win that prize. Drawn five times a day (we track the evening draw); the frequency chart covers numbers 1–15.",
      topPrize: "$1,250", topPrizeLabel: "Top prize ($1 play)",
      reference: {
        title: "How Cash Pop pays",
        columns: ["Outcome", "Prize", "Odds"],
        rows: [
          { cells: ["Your number is drawn", "Your ticket's preprinted prize", "1 in 15"] },
        ],
        note: "The prize ($1.25–$1,250 for a $1 play) is randomly assigned and printed on your ticket; bigger bets scale it up.",
      },
    },
  },
  // Cash4Life — 5 of 60 + Cash Ball, fixed for-life prizes. Florida ended sales Feb 2026.
  fl_cash4life: {
    label: "Cash4Life", specialKey: "cash_ball", specialName: "Cash Ball", specialAbbr: "CB",
    draws: "Daily", priceChanges: [], state: "FL", stateName: "Florida", ticketPrice: "$2",
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Cash4Life was a multi-state game — 5 of 60 plus a Cash Ball (1 of 4) — with fixed top prizes for life. Florida ended Cash4Life sales in February 2026; this is the final archive and prize structure.",
      topPrize: "$1,000 / day for life", topPrizeLabel: "Top prize", retired: true,
      reference: {
        title: "Cash4Life prize tiers & odds",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["5 + Cash Ball", "$1,000 / day for life", "1 in 21,846,048"] },
          { cells: ["5", "$1,000 / week for life", "1 in 7,282,016"] },
          { cells: ["4 + Cash Ball", "$2,500", "1 in 79,440"] },
          { cells: ["4", "$500", "1 in 26,480"] },
          { cells: ["3 + Cash Ball", "$100", "1 in 1,471"] },
          { cells: ["3", "$25", "1 in 490"] },
          { cells: ["2 + Cash Ball", "$10", "1 in 83"] },
          { cells: ["2", "$4", "1 in 28"] },
          { cells: ["1 + Cash Ball", "$2", "1 in 13"] },
        ],
        note: "Prizes were fixed (reduced only if the liability cap was hit). Game ended in Florida February 2026.",
      },
    },
    viz: {
      tiers: [
        { label: "5 + Cash Ball (top)", odds: 21846048 },
        { label: "Match 5", odds: 7282016 },
        { label: "4 + Cash Ball", odds: 79440 },
        { label: "Match 4", odds: 26480 },
        { label: "3 + Cash Ball", odds: 1471 },
        { label: "Match 3", odds: 490 },
        { label: "2 + Cash Ball", odds: 83 },
        { label: "Match 2", odds: 28 },
        { label: "1 + Cash Ball", odds: 13 },
      ],
    },
  },

  // ===== Washington =====
  // Lotto — 6 of 49, Mon/Wed/Sat. A $1 ticket buys TWO plays, so the official odds
  // below are per dollar (half the raw 6-of-49 combinatorics). Lower tiers are fixed
  // ($1,000 / $30 / $3); the jackpot grows from $1M with an annuity-or-cash option.
  // Live per-tier prizes + WA winner counts from walottery.com (keys match the scraper).
  wa_lotto: {
    label: "Lotto", specialKey: null, specialName: "", draws: "Mon · Wed · Sat",
    priceChanges: [], state: "WA", stateName: "Washington", ticketPrice: "$1 (2 plays)",
    oddsJackpot: 6991908, // Match 6, per $1 (two plays)
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & winners", winnersLabel: "WA winners",
      note: "Washington Lotto is 6 of 49. A $1 ticket buys two plays, so the odds shown are per dollar. The jackpot (minimum $1M) grows until won and is paid as an annuity or cash; the lower tiers are fixed. Amounts and WA winner counts are the latest draw's actual results.",
      odds: { "6 of 6": 6991908, "5 of 6": 27100, "4 of 6": 516, "3 of 6": 28 },
    },
    viz: { tiers: [ { label: "Match 6 (jackpot)", odds: 6991908 }, { label: "Match 5", odds: 27100 }, { label: "Match 4", odds: 516 }, { label: "Match 3", odds: 28 } ] },
  },
  // Hit 5 — 5 of 42, nightly. Cash "Cashpot" top prize that starts at $100k and grows
  // with sales until won (split among winners). Lower tiers fixed; 2-of-5 wins a free ticket.
  wa_hit5: {
    label: "Hit 5", specialKey: null, specialName: "", draws: "Nightly",
    priceChanges: [], state: "WA", stateName: "Washington", ticketPrice: "$1",
    oddsJackpot: 850668, // 5 of 42
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & winners", winnersLabel: "WA winners",
      note: "Hit 5 is 5 of 42 with a CASH top prize (the “Cashpot”) that starts at $100,000 and grows with sales until someone matches all five — paid as a lump sum and split among winners. Lower tiers are fixed; matching 2 of 5 wins a free ticket. Amounts and WA winner counts are the latest draw's actual results.",
      odds: { "5 of 5": 850668, "4 of 5": 4598, "3 of 5": 128, "2 of 5": 11 },
    },
    viz: { tiers: [ { label: "5 of 5 (Cashpot)", odds: 850668 }, { label: "4 of 5", odds: 4598 }, { label: "3 of 5", odds: 128 }, { label: "2 of 5 (free)", odds: 11 } ] },
  },
  // Match 4 — pick 4 of 24, nightly, $2 per play. All prizes fixed (top $10,000 does not
  // roll), so we publish a real value/$1.
  wa_match4: {
    label: "Match 4", specialKey: null, specialName: "", draws: "Nightly",
    priceChanges: [], state: "WA", stateName: "Washington", ticketPrice: "$2",
    ev: {
      ticket_price: 2,
      overall_odds: 9,
      winnersLabel: "WA winners",
      levels: {
        "4 of 4": { label: "Match 4", odds: 10626, prize: 10000 },
        "3 of 4": { label: "Match 3", odds: 133, prize: 20 },
        "2 of 4": { label: "Match 2", odds: 9, prize: 2 },
      },
    },
  },
  // Pick 3 — 3-digit game drawn nightly at 8 p.m. Fixed payouts by play type.
  wa_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", draws: "Nightly",
    priceChanges: [], state: "WA", stateName: "Washington", digits: true, ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Washington Pick 3 is a 3-digit game (000–999) drawn nightly at 8 p.m.; what you win depends on your play type. Payouts shown for a $1 play.",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: {
        title: "How Pick 3 pays (per $1)",
        columns: ["Play type", "Prize", "Odds"],
        rows: [
          { cells: ["Straight — exact order", "$500", "1 in 1,000"] },
          { cells: ["3-Way Box (2 alike)", "$160", "1 in 333"] },
          { cells: ["6-Way Box (all unique)", "$80", "1 in 167"] },
          { cells: ["Front Pair / Back Pair", "$50", "1 in 100"] },
        ],
        note: "Shown for a $1 play; 50¢ plays pay half. Straight/Box and Superbox combo plays are also offered.",
      },
    },
  },
  // Cash Pop — pick 1 of 15; each number carries a randomly assigned, preprinted prize.
  // Frequency over 1–15 is the feature (the prize you win is on your ticket, not a table).
  wa_cashpop: {
    label: "Cash Pop", specialKey: null, specialName: "",
    draws: "Several daily", priceChanges: [], state: "WA", stateName: "Washington", ticketPrice: "$1+",
    prizes: {
      note: "Cash Pop: pick a number from 1 to 15. Each number carries a randomly assigned, preprinted prize; if your number is drawn, you win that prize. Drawn several times a day — the frequency chart covers numbers 1–15 over recent draws.",
      topPrize: "1 in 15", topPrizeLabel: "Odds your number is drawn",
      reference: {
        title: "How Cash Pop pays",
        columns: ["Outcome", "Prize", "Odds"],
        rows: [
          { cells: ["Your number is drawn", "Your ticket's preprinted prize", "1 in 15"] },
        ],
        note: "The prize is randomly assigned and printed on your ticket; the amount scales with how much you bet.",
      },
    },
  },
  // Daily Keno — pick 1–10 spots, 20 of 80 drawn nightly. Standard 20/80 match-all odds;
  // prize amounts are Washington's. Recent-window results power the frequency chart.
  wa_keno: {
    label: "Daily Keno", specialKey: null, specialName: "",
    draws: "Nightly", priceChanges: [], state: "WA", stateName: "Washington", recentWindow: true, ticketPrice: "$1 to $10 per draw",
    prizes: {
      topPrize: "$100,000", topPrizeLabel: "Top prize (10-spot $1)",
      reference: {
        title: "Top prize & odds by spot",
        columns: ["Spots played", "Top prize (match all, $1)", "Odds (match all)"],
        rows: [
          { cells: ["10 spots", "$100,000", "1 in 8,911,711"] },
          { cells: ["9 spots", "$25,000", "1 in 1,380,688"] },
          { cells: ["8 spots", "$10,000", "1 in 230,115"] },
          { cells: ["7 spots", "$2,500", "1 in 40,979"] },
          { cells: ["6 spots", "$1,000", "1 in 7,753"] },
          { cells: ["5 spots", "$200", "1 in 1,551"] },
          { cells: ["4 spots", "$24", "1 in 326"] },
          { cells: ["3 spots", "$16", "1 in 72"] },
          { cells: ["2 spots", "$8", "1 in 16.6"] },
          { cells: ["1 spot", "$2", "1 in 4"] },
        ],
        note: "You choose 1–10 “spots”; 20 numbers are drawn from 1–80 nightly. Shown is the top prize (matching all your spots) on a $1 play — partial-match prizes also apply. The overall top prize per drawing is capped at $500,000. Number frequency below covers only the most recent draws.",
      },
    },
  },

  // ===== Ohio =====
  // Classic Lotto — 6 of 49, Mon/Wed/Sat. Annuity jackpot (min $1M) with a cash option;
  // lower tiers fixed. Live per-tier prizes + Ohio winner counts from the lottery's own
  // embedded results feed (keys match the scraper's prize descriptions).
  oh_classic: {
    label: "Classic Lotto", specialKey: null, specialName: "", draws: "Mon · Wed · Sat",
    priceChanges: [], state: "OH", stateName: "Ohio", ticketPrice: "$1",
    oddsJackpot: 13983816, // 6 of 49
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & winners", winnersLabel: "OH winners",
      note: "Classic Lotto is 6 of 49. The jackpot (minimum $1M) grows until won and is paid as an annuity or cash; the lower tiers are fixed. Amounts and Ohio winner counts are the latest draw's actual results.",
      odds: { "Match 6 of 6": 13983816, "Match 5 of 6": 54201, "Match 4 of 6": 1032, "Match 3 of 6": 57 },
    },
    viz: { tiers: [ { label: "Match 6 (jackpot)", odds: 13983816 }, { label: "Match 5", odds: 54201 }, { label: "Match 4", odds: 1032 }, { label: "Match 3", odds: 57 } ] },
  },
  // Rolling Cash 5 — 5 of 39, nightly. Cash jackpot from $100k, grows until won (split).
  oh_cash5: {
    label: "Rolling Cash 5", specialKey: null, specialName: "", draws: "Nightly",
    priceChanges: [], state: "OH", stateName: "Ohio", ticketPrice: "$1",
    oddsJackpot: 575757, // 5 of 39
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & winners", winnersLabel: "OH winners",
      note: "Rolling Cash 5 is 5 of 39 with a CASH jackpot that starts at $100,000 and grows with sales until someone matches all five — paid as a lump sum, split among winners. Lower tiers are fixed. Amounts and Ohio winner counts are the latest draw's actual results.",
      odds: { "Match 5 of 5": 575757, "Match 4 of 5": 3387, "Match 3 of 5": 103, "Match 2 of 5": 10 },
    },
    viz: { tiers: [ { label: "Match 5 (jackpot)", odds: 575757 }, { label: "Match 4", odds: 3387 }, { label: "Match 3", odds: 103 }, { label: "Match 2", odds: 10 } ] },
  },
  // Pick 3/4/5 — digit games drawn twice daily (we track the evening draw). Fixed payouts.
  oh_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "OH", stateName: "Ohio", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Ohio Pick 3 is a 3-digit game (000–999) drawn twice a day; we track the evening draw. Fixed payouts by play type (shown for a $1 straight).",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Pick 3 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$500", "1 in 1,000"] }, { cells: ["3-Way Box (2 alike)", "$160", "1 in 333"] }, { cells: ["6-Way Box (all unique)", "$80", "1 in 167"] }, { cells: ["Front / Back Pair", "$50", "1 in 100"] } ],
        note: "Shown for a $1 play; 50¢ plays pay half. Ohio also offers Wheel and back-up bets." },
    },
  },
  oh_pick4: {
    label: "Pick 4", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "OH", stateName: "Ohio", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Ohio Pick 4 is a 4-digit game (0000–9999) drawn twice a day; we track the evening draw. Fixed payouts by play type (shown for a $1 straight).",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Pick 4 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] }, { cells: ["4-Way Box (3 alike)", "$1,200", "1 in 2,500"] }, { cells: ["6-Way Box (2 pairs)", "$800", "1 in 1,667"] }, { cells: ["12-Way Box (1 pair)", "$400", "1 in 833"] }, { cells: ["24-Way Box (all unique)", "$200", "1 in 417"] } ],
        note: "Shown for a $1 play; 50¢ plays pay half." },
    },
  },
  oh_pick5: {
    label: "Pick 5", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "OH", stateName: "Ohio", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Ohio Pick 5 is a 5-digit game (00000–99999) drawn twice a day; we track the evening draw. Fixed payouts by play type (shown for a $1 straight).",
      topPrize: "$50,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Pick 5 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$50,000", "1 in 100,000"] }, { cells: ["5-Way Box (4 alike)", "$10,000", "1 in 20,000"] }, { cells: ["10-Way Box", "$5,000", "1 in 10,000"] }, { cells: ["20-Way Box", "$2,500", "1 in 5,000"] }, { cells: ["30-Way Box", "$1,650", "1 in 3,333"] }, { cells: ["60-Way Box", "$800", "1 in 1,667"] }, { cells: ["120-Way Box (all unique)", "$400", "1 in 833"] } ],
        note: "Shown for a $1 play; 50¢ plays pay half." },
    },
  },
  // Lucky for Life — multi-state 5 of 48 + Lucky Ball (1 of 18). Ohio played it 2015–
  // Feb 21, 2026, when Millionaire for Life replaced it. Retired archive.
  oh_luckylife: {
    label: "Lucky for Life", specialKey: "lucky", specialName: "Lucky Ball", specialAbbr: "LB",
    draws: "Daily · ended Feb 2026", priceChanges: [], state: "OH", stateName: "Ohio", ticketPrice: "$2",
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Lucky for Life was a multi-state game — 5 of 48 plus a Lucky Ball (1 of 18) — with for-life top prizes. Ohio ended Lucky for Life on Feb 21, 2026, when the multi-state Millionaire for Life launched. This is the final archive and prize structure.",
      topPrize: "$1,000 / day for life", topPrizeLabel: "Top prize", retired: true,
      reference: {
        title: "Lucky for Life prize tiers & odds",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["5 + Lucky Ball", "$1,000 / day for life", "1 in 30,821,472"] },
          { cells: ["5", "$25,000 / year for life", "1 in 1,813,028"] },
          { cells: ["4 + Lucky Ball", "$5,000", "1 in 143,356"] },
          { cells: ["4", "$200", "1 in 8,433"] },
          { cells: ["3 + Lucky Ball", "$150", "1 in 3,413"] },
          { cells: ["3", "$20", "1 in 201"] },
          { cells: ["2 + Lucky Ball", "$25", "1 in 250"] },
          { cells: ["2", "$3", "1 in 14.7"] },
          { cells: ["1 + Lucky Ball", "$6", "1 in 50"] },
          { cells: ["0 + Lucky Ball", "$4", "1 in 32"] },
        ],
        note: "Top two prizes were paid for life (minimum 20 years). Overall odds of any prize: 1 in 7.8.",
      },
    },
  },
  // Millionaire for Life — multi-state 5 of 58 + Bonus Ball (1 of 5), launched Feb 2026
  // (replaced Lucky for Life). Live per-tier prizes + Ohio winner counts from the lottery's
  // results feed; odds computed from the 5/58 + 1/5 matrix (top tier 1 in 22,910,580).
  oh_m4l: {
    label: "Millionaire for Life", specialKey: "bonus", specialName: "Bonus Ball", specialAbbr: "B",
    draws: "Daily", priceChanges: [], state: "OH", stateName: "Ohio", ticketPrice: "$2",
    oddsJackpot: 22910580, // 5 of 58 + Bonus 1 of 5
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & winners", winnersLabel: "OH winners",
      note: "Millionaire for Life is a multi-state 5-of-58 + Bonus Ball (1 of 5) game that launched Feb 2026, replacing Lucky for Life. The top two prizes pay for life (shown here as their lump-sum values, $20M and $2M); the rest are fixed. Amounts and Ohio winner counts are the latest draw's actual results.",
      odds: { "5/5 + Bonus Ball": 22910580, "5/5": 5727645, "4/5 + Bonus Ball": 86455, "4/5": 21614, "3/5 + Bonus Ball": 1663, "3/5": 416, "2/5 + Bonus Ball": 98, "2/5": 24, "1/5 + Bonus Ball": 16 },
    },
    viz: { tiers: [ {label:"5/5 + Bonus",odds:22910580},{label:"5/5",odds:5727645},{label:"4/5 + Bonus",odds:86455},{label:"4/5",odds:21614},{label:"3/5 + Bonus",odds:1663},{label:"3/5",odds:416},{label:"2/5 + Bonus",odds:98},{label:"2/5",odds:24},{label:"1/5 + Bonus",odds:16} ] },
  },
  // Kicker — $1 add-on to a Classic Lotto ticket: a random 6-digit number. Match the
  // digits in exact order from the left; five tiers up to $100,000. Drawn with Classic Lotto.
  oh_kicker: {
    label: "Kicker", specialKey: null, specialName: "", digits: true,
    draws: "Mon · Wed · Sat", priceChanges: [], state: "OH", stateName: "Ohio", ticketPrice: "$1 (add-on)",
    prizes: {
      note: "Kicker is a $1 add-on to a Classic Lotto ticket — a randomly assigned 6-digit number. You win by matching the Kicker digits in exact order from the left; the more leading digits you match, the bigger the prize. Drawn with Classic Lotto (Mon/Wed/Sat).",
      topPrize: "$100,000", topPrizeLabel: "Top prize (match all 6)",
      reference: {
        title: "How Kicker pays",
        columns: ["Match (from left)", "Prize", "Odds"],
        rows: [
          { cells: ["All 6 digits", "$100,000", "1 in 1,000,000"] },
          { cells: ["First 5 digits", "$5,000", "1 in 111,111"] },
          { cells: ["First 4 digits", "$1,000", "1 in 11,111"] },
          { cells: ["First 3 digits", "$100", "1 in 1,111"] },
          { cells: ["First 2 digits", "$10", "1 in 111"] },
        ],
        note: "Digits must match in exact position from the left. Overall odds of any prize: 1 in 100. Frequency below covers recent draws.",
      },
    },
  },

  // ===== Michigan =====
  // Lotto 47 — 6 of 47, Wed/Sat. Fixed lower tiers; annuity jackpot (min $1M). Live
  // jackpot from the MI Lottery API; full history since 2010.
  mi_lotto47: {
    label: "Lotto 47", specialKey: null, specialName: "", draws: "Wed · Sat",
    priceChanges: [], state: "MI", stateName: "Michigan", ticketPrice: "$1",
    oddsJackpot: 10737573, // 6 of 47
    prizes: {
      note: "Lotto 47 is 6 of 47. The jackpot starts at $1M and grows until won (annuity or cash); the lower tiers are fixed. Odds shown per $1 play.",
      topPrize: "Jackpot", topPrizeLabel: "Match 6 of 6",
      reference: {
        title: "Lotto 47 prize tiers & odds",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["6 of 6", "Jackpot (min $1M)", "1 in 10,737,573"] },
          { cells: ["5 of 6", "$2,500", "1 in 43,649"] },
          { cells: ["4 of 6", "$100", "1 in 873"] },
          { cells: ["3 of 6", "$5", "1 in 50"] },
        ],
        note: "Lower tiers are fixed. Overall odds of winning any prize: 1 in 47.",
      },
    },
    viz: { tiers: [ {label:"Match 6 (jackpot)",odds:10737573},{label:"Match 5",odds:43649},{label:"Match 4",odds:873},{label:"Match 3",odds:50} ] },
  },
  // Fantasy 5 — 5 of 39, nightly. Cash jackpot from $100k; fixed lower tiers. Value/$1
  // from the fixed tiers priced against the live cash jackpot.
  mi_fantasy5: {
    label: "Fantasy 5", specialKey: null, specialName: "", draws: "Nightly",
    priceChanges: [], state: "MI", stateName: "Michigan", ticketPrice: "$1",
    ev: {
      ticket_price: 1,
      odds_jackpot: 575757, // 5 of 39
      overall_odds: 9,
      staticPrizes: true,
      winnersLabel: "MI winners",
      levels: {
        "Jackpot": { label: "Jackpot (Match 5)", odds: 575757 },
        "Match 4": { label: "Match 4", odds: 3387, prize: 100 },
        "Match 3": { label: "Match 3", odds: 103, prize: 10 },
        "Match 2": { label: "Match 2", odds: 10, prize: 1 },
      },
    },
  },
  // Lucky for Life — multi-state 5 of 48 + Lucky Ball (1 of 18). Michigan played it
  // 2015 until it was replaced by Millionaire for Life in Feb 2026. Retired archive.
  mi_lucky: {
    label: "Lucky for Life", specialKey: "lucky", specialName: "Lucky Ball", specialAbbr: "LB",
    draws: "Daily · ended Feb 2026", priceChanges: [], state: "MI", stateName: "Michigan", ticketPrice: "$2",
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Lucky for Life was a multi-state game — 5 of 48 plus a Lucky Ball (1 of 18) — with for-life top prizes. It was replaced by the multi-state Millionaire for Life in February 2026. This is the final archive and prize structure.",
      topPrize: "$1,000 / day for life", topPrizeLabel: "Top prize", retired: true,
      reference: {
        title: "Lucky for Life prize tiers & odds",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["5 + Lucky Ball", "$1,000 / day for life", "1 in 30,821,472"] },
          { cells: ["5", "$25,000 / year for life", "1 in 1,813,028"] },
          { cells: ["4 + Lucky Ball", "$5,000", "1 in 143,356"] },
          { cells: ["4", "$200", "1 in 8,433"] },
          { cells: ["3 + Lucky Ball", "$150", "1 in 3,413"] },
          { cells: ["3", "$20", "1 in 201"] },
          { cells: ["2 + Lucky Ball", "$25", "1 in 250"] },
          { cells: ["2", "$3", "1 in 14.7"] },
          { cells: ["1 + Lucky Ball", "$6", "1 in 50"] },
          { cells: ["0 + Lucky Ball", "$4", "1 in 32"] },
        ],
        note: "Top two prizes were paid for life (minimum 20 years). Overall odds of any prize: 1 in 7.8.",
      },
    },
  },
  // Millionaire for Life — multi-state 5 of 58 + Bonus Ball (1 of 5), launched Feb 2026.
  mi_m4l: {
    label: "Millionaire for Life", specialKey: "bonus", specialName: "Bonus Ball", specialAbbr: "B",
    draws: "Daily", priceChanges: [], state: "MI", stateName: "Michigan", ticketPrice: "$2",
    oddsJackpot: 22910580, // 5 of 58 + Bonus 1 of 5
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Millionaire for Life is a multi-state 5-of-58 + Bonus Ball (1 of 5) game that launched Feb 2026, replacing Lucky for Life. The top two prizes pay for life; the rest are fixed. Odds computed from the 5/58 + 1/5 matrix.",
      topPrize: "$1,000,000 / year for life", topPrizeLabel: "Top prize",
      reference: {
        title: "Millionaire for Life prize tiers & odds",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["5 + Bonus Ball", "$1,000,000 / year for life", "1 in 22,910,580"] },
          { cells: ["5", "$100,000 / year for life", "1 in 5,727,645"] },
          { cells: ["4 + Bonus Ball", "$7,500", "1 in 86,455"] },
          { cells: ["4", "$500", "1 in 21,614"] },
          { cells: ["3 + Bonus Ball", "$250", "1 in 1,663"] },
          { cells: ["3", "$50", "1 in 416"] },
          { cells: ["2 + Bonus Ball", "$25", "1 in 98"] },
          { cells: ["2", "$8", "1 in 24"] },
          { cells: ["1 + Bonus Ball", "$8", "1 in 16"] },
        ],
        note: "Overall odds of winning any prize: 1 in 8.46.",
      },
    },
    viz: { tiers: [ {label:"5 + Bonus",odds:22910580},{label:"Match 5",odds:5727645},{label:"4 + Bonus",odds:86455},{label:"Match 4",odds:21614},{label:"3 + Bonus",odds:1663},{label:"Match 3",odds:416},{label:"2 + Bonus",odds:98},{label:"Match 2",odds:24},{label:"1 + Bonus",odds:16} ] },
  },
  // Daily 3 / Daily 4 — digit games drawn twice daily; we track the evening draw.
  mi_daily3: {
    label: "Daily 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "MI", stateName: "Michigan", ticketPrice: "$0.50 or $1",
    prizes: {
      tierLabel: "Bet type", winnersTitle: "Winners by bet type", winnersLabel: "MI winners",
      note: "Michigan Daily 3 is a 3-digit game (000–999) drawn twice a day; we track the evening draw. MI winner counts by play type for the latest draw, plus the full payout guide below (shown for a $1 straight).",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Daily 3 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$500", "1 in 1,000"] }, { cells: ["3-Way Box", "$160", "1 in 333"] }, { cells: ["6-Way Box", "$80", "1 in 167"] }, { cells: ["Wheel / Front / Back Pair", "$50", "1 in 100"] } ],
        note: "Shown for a $1 play; 50¢ plays pay half. 2-Way, Wheel and 1-Off bets also offered." },
    },
  },
  mi_daily4: {
    label: "Daily 4", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "MI", stateName: "Michigan", ticketPrice: "$0.50 or $1",
    prizes: {
      tierLabel: "Bet type", winnersTitle: "Winners by bet type", winnersLabel: "MI winners",
      note: "Michigan Daily 4 is a 4-digit game (0000–9999) drawn twice a day; we track the evening draw. MI winner counts by play type for the latest draw, plus the full payout guide below (shown for a $1 straight).",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Daily 4 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] }, { cells: ["4-Way Box", "$1,200", "1 in 2,500"] }, { cells: ["6-Way Box", "$800", "1 in 1,667"] }, { cells: ["12-Way Box", "$400", "1 in 833"] }, { cells: ["24-Way Box", "$200", "1 in 417"] } ],
        note: "Shown for a $1 play; 50¢ plays pay half. Wheel and 1-Off bets also offered." },
    },
  },
  // Daily Keno — 22 numbers drawn from 1–80 nightly; pick 1–10 spots. We don't have MI's
  // exact prize amounts, so we publish the (computed) odds of matching all your spots and
  // the number frequency — no invented dollar figures.
  mi_keno: {
    label: "Daily Keno", specialKey: null, specialName: "",
    draws: "Nightly", priceChanges: [], state: "MI", stateName: "Michigan", ticketPrice: "$1 to $10",
    prizes: {
      note: "Michigan Daily Keno draws 22 numbers from 1–80 once a night. You pick 1–10 “spots”; prizes grow the more of your spots match and scale with your wager. Below: the odds of matching ALL your spots, by how many you play — plus number frequency over recent draws.",
      topPrize: "22 of 80", topPrizeLabel: "Drawn nightly",
      reference: {
        title: "Odds of matching all your spots (22 of 80 drawn)",
        columns: ["Spots played", "Odds (match all)"],
        rows: [
          { cells: ["10 spots", "1 in 2,546,500"] },
          { cells: ["9 spots", "1 in 466,201"] },
          { cells: ["8 spots", "1 in 90,651"] },
          { cells: ["7 spots", "1 in 18,627"] },
          { cells: ["6 spots", "1 in 4,028"] },
          { cells: ["5 spots", "1 in 913"] },
          { cells: ["4 spots", "1 in 216"] },
          { cells: ["3 spots", "1 in 53"] },
          { cells: ["2 spots", "1 in 13.7"] },
          { cells: ["1 spot", "1 in 3.6"] },
        ],
        note: "Odds computed for 22 numbers drawn from 1–80. Most spot games also pay smaller prizes for partial matches; amounts scale with your wager. Frequency chart below covers recent draws.",
      },
    },
  },

  // ===== New Hampshire =====
  // Tri-State Megabucks Plus — 5 of 41 + Megaball (1 of 6). Progressive jackpot (min $1M),
  // fixed lower tiers. Live jackpot + saw-tooth from the NH data service.
  nh_megabucks: {
    label: "Tri-State Megabucks", specialKey: "megaball", specialName: "Megaball", specialAbbr: "MB",
    draws: "Wed · Sat", priceChanges: [], state: "NH", stateName: "New Hampshire", ticketPrice: "$2",
    oddsJackpot: 4496388, // 5 of 41 + Megaball
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Tri-State Megabucks Plus is 5 of 41 plus a Megaball (1 of 6), shared by NH, Maine and Vermont. The jackpot starts at $1M and grows until won; lower tiers are fixed.",
      topPrize: "Jackpot (min $1M)", topPrizeLabel: "5 + Megaball",
      reference: {
        title: "Megabucks Plus prize tiers & odds",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["5 + Megaball", "Jackpot (min $1M)", "1 in 4,496,388"] },
          { cells: ["5", "$30,000", "1 in 899,278"] },
          { cells: ["4 + Megaball", "$1,300", "1 in 24,980"] },
          { cells: ["4", "$150", "1 in 4,996"] },
          { cells: ["3 + Megaball", "$25", "1 in 714"] },
          { cells: ["3", "$7", "1 in 143"] },
          { cells: ["2 + Megaball", "$5", "1 in 63"] },
          { cells: ["2", "$2", "1 in 12.6"] },
          { cells: ["1 + Megaball", "$2", "1 in 15.3"] },
        ],
        note: "Overall odds of winning any prize: 1 in 5.9.",
      },
    },
    viz: { tiers: [ {label:"5 + Megaball (jackpot)",odds:4496388},{label:"Match 5",odds:899278},{label:"4 + Megaball",odds:24980},{label:"Match 4",odds:4996},{label:"3 + Megaball",odds:714},{label:"Match 3",odds:143},{label:"2 + Megaball",odds:63},{label:"1 + Megaball",odds:15} ] },
  },
  // Gimme 5 — 5 of 39, Mon–Fri. Fixed $100,000 top prize every draw (Tri-State). We don't
  // have the exact lower-tier amounts, so we publish the computed odds, not invented dollars.
  nh_gimme5: {
    label: "Gimme 5", specialKey: null, specialName: "", draws: "Mon – Fri",
    priceChanges: [], state: "NH", stateName: "New Hampshire", ticketPrice: "$1",
    oddsJackpot: 575757, // 5 of 39
    prizes: {
      note: "Gimme 5 is 5 of 39 (shared by NH, Maine and Vermont) with a fixed $100,000 top prize every draw. Matching 4, 3 or 2 wins smaller fixed prizes. Odds shown per play.",
      topPrize: "$100,000", topPrizeLabel: "Top prize (Match 5)",
      reference: {
        title: "Gimme 5 odds by match",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["5 of 5", "$100,000", "1 in 575,757"] },
          { cells: ["4 of 5", "Fixed prize", "1 in 3,387"] },
          { cells: ["3 of 5", "Fixed prize", "1 in 103"] },
          { cells: ["2 of 5", "Fixed prize", "1 in 10"] },
        ],
        note: "Top prize is a fixed $100,000. Lower-tier amounts are set by Tri-State rules; frequency chart below covers recent draws.",
      },
    },
  },
  // Pick 3 / Pick 4 — digit games, twice daily; we track the evening draw.
  nh_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "NH", stateName: "New Hampshire", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "New Hampshire Pick 3 is a 3-digit game (000–999) drawn twice a day; we track the evening draw. Fixed payouts by play type (shown for a $1 straight).",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Pick 3 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$500", "1 in 1,000"] }, { cells: ["3-Way Box", "$160", "1 in 333"] }, { cells: ["6-Way Box", "$80", "1 in 167"] }, { cells: ["Front / Back Pair", "$50", "1 in 100"] } ],
        note: "Shown for a $1 play; 50¢ plays pay half." },
    },
  },
  nh_pick4: {
    label: "Pick 4", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "NH", stateName: "New Hampshire", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "New Hampshire Pick 4 is a 4-digit game (0000–9999) drawn twice a day; we track the evening draw. Fixed payouts by play type (shown for a $1 straight).",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Pick 4 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] }, { cells: ["4-Way Box", "$1,200", "1 in 2,500"] }, { cells: ["6-Way Box", "$800", "1 in 1,667"] }, { cells: ["12-Way Box", "$400", "1 in 833"] }, { cells: ["24-Way Box", "$200", "1 in 417"] } ],
        note: "Shown for a $1 play; 50¢ plays pay half." },
    },
  },
  // Lucky for Life — 5 of 48 + Lucky Ball. NH played it until Millionaire for Life replaced
  // it in Feb 2026. Retired archive.
  nh_lucky: {
    label: "Lucky for Life", specialKey: "lucky", specialName: "Lucky Ball", specialAbbr: "LB",
    draws: "Daily · ended Feb 2026", priceChanges: [], state: "NH", stateName: "New Hampshire", ticketPrice: "$2",
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Lucky for Life was a multi-state game — 5 of 48 plus a Lucky Ball (1 of 18) — with for-life top prizes. It was replaced by the multi-state Millionaire for Life in February 2026. This is the final archive and prize structure.",
      topPrize: "$1,000 / day for life", topPrizeLabel: "Top prize", retired: true,
      reference: {
        title: "Lucky for Life prize tiers & odds",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["5 + Lucky Ball", "$1,000 / day for life", "1 in 30,821,472"] },
          { cells: ["5", "$25,000 / year for life", "1 in 1,813,028"] },
          { cells: ["4 + Lucky Ball", "$5,000", "1 in 143,356"] },
          { cells: ["4", "$200", "1 in 8,433"] },
          { cells: ["3 + Lucky Ball", "$150", "1 in 3,413"] },
          { cells: ["3", "$20", "1 in 201"] },
          { cells: ["2 + Lucky Ball", "$25", "1 in 250"] },
          { cells: ["2", "$3", "1 in 14.7"] },
          { cells: ["1 + Lucky Ball", "$6", "1 in 50"] },
          { cells: ["0 + Lucky Ball", "$4", "1 in 32"] },
        ],
        note: "Top two prizes were paid for life (minimum 20 years). Overall odds of any prize: 1 in 7.8.",
      },
    },
  },
  // Millionaire for Life — multi-state 5 of 58 + Bonus Ball (1 of 5), launched Feb 2026.
  nh_m4l: {
    label: "Millionaire for Life", specialKey: "bonus", specialName: "Bonus Ball", specialAbbr: "B",
    draws: "Daily", priceChanges: [], state: "NH", stateName: "New Hampshire", ticketPrice: "$2",
    oddsJackpot: 22910580, // 5 of 58 + Bonus 1 of 5
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Millionaire for Life is a multi-state 5-of-58 + Bonus Ball (1 of 5) game that launched Feb 2026, replacing Lucky for Life. The top two prizes pay for life; the rest are fixed. Odds computed from the 5/58 + 1/5 matrix.",
      topPrize: "$1,000,000 / year for life", topPrizeLabel: "Top prize",
      reference: {
        title: "Millionaire for Life prize tiers & odds",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["5 + Bonus Ball", "$1,000,000 / year for life", "1 in 22,910,580"] },
          { cells: ["5", "$100,000 / year for life", "1 in 5,727,645"] },
          { cells: ["4 + Bonus Ball", "$7,500", "1 in 86,455"] },
          { cells: ["4", "$500", "1 in 21,614"] },
          { cells: ["3 + Bonus Ball", "$250", "1 in 1,663"] },
          { cells: ["3", "$50", "1 in 416"] },
          { cells: ["2 + Bonus Ball", "$25", "1 in 98"] },
          { cells: ["2", "$8", "1 in 24"] },
          { cells: ["1 + Bonus Ball", "$8", "1 in 16"] },
        ],
        note: "Overall odds of winning any prize: 1 in 8.46.",
      },
    },
    viz: { tiers: [ {label:"5 + Bonus",odds:22910580},{label:"Match 5",odds:5727645},{label:"4 + Bonus",odds:86455},{label:"Match 4",odds:21614},{label:"3 + Bonus",odds:1663},{label:"Match 3",odds:416},{label:"2 + Bonus",odds:98},{label:"Match 2",odds:24},{label:"1 + Bonus",odds:16} ] },
  },

  // ===== North Carolina =====
  // Pick 3 / Pick 4 — digit games drawn twice daily; we track the evening draw.
  // Full history from the NC Education Lottery's CSV exports (Pick 3 since 2006).
  nc_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "NC", stateName: "North Carolina", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "North Carolina Pick 3 is a 3-digit game (000–999) drawn twice a day; we track the evening draw. Fixed payouts by play type (shown for a $1 straight); an optional Fireball add-on adds ways to win.",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Pick 3 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$500", "1 in 1,000"] }, { cells: ["3-Way Box", "$160", "1 in 333"] }, { cells: ["6-Way Box", "$80", "1 in 167"] }, { cells: ["Front / Back Pair", "$50", "1 in 100"] } ],
        note: "Shown for a $1 play; 50¢ plays pay half." },
    },
  },
  nc_pick4: {
    label: "Pick 4", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "NC", stateName: "North Carolina", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "North Carolina Pick 4 is a 4-digit game (0000–9999) drawn twice a day; we track the evening draw. Fixed payouts by play type (shown for a $1 straight); an optional Fireball add-on adds ways to win.",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Pick 4 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] }, { cells: ["4-Way Box", "$1,200", "1 in 2,500"] }, { cells: ["6-Way Box", "$800", "1 in 1,667"] }, { cells: ["12-Way Box", "$400", "1 in 833"] }, { cells: ["24-Way Box", "$200", "1 in 417"] } ],
        note: "Shown for a $1 play; 50¢ plays pay half." },
    },
  },
  // Cash 5 — 5 of 41, nightly, rolling cash jackpot from $100k (pari-mutuel). History since 2006.
  nc_cash5: {
    label: "Cash 5", specialKey: null, specialName: "", draws: "Nightly",
    priceChanges: [], state: "NC", stateName: "North Carolina", ticketPrice: "$1",
    oddsJackpot: 749398, // 5 of 41
    prizes: {
      note: "Carolina Cash 5 is 5 of 41 with a cash jackpot that starts at $100,000 and grows until won (split among winners). All prizes are pari-mutuel, so amounts vary with sales and winners. Odds shown per $1 play.",
      topPrize: "Jackpot (min $100k)", topPrizeLabel: "Match 5",
      reference: {
        title: "Cash 5 odds by match",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["5 of 5", "Jackpot (min $100k)", "1 in 749,398"] },
          { cells: ["4 of 5", "Pari-mutuel", "1 in 4,164"] },
          { cells: ["3 of 5", "Pari-mutuel", "1 in 119"] },
          { cells: ["2 of 5", "Pari-mutuel", "1 in 11"] },
        ],
        note: "All prizes are pari-mutuel (amounts move with sales/winners). Frequency chart below covers recent draws.",
      },
    },
    viz: { tiers: [ {label:"Match 5 (jackpot)",odds:749398},{label:"Match 4",odds:4164},{label:"Match 3",odds:119},{label:"Match 2",odds:11} ] },
  },

  // ===== Virginia =====
  // Pick 3 / Pick 4 — digit games, twice daily (Day/Night); we track the night draw.
  // Deep history from the VA Lottery's "All Past Numbers" exports (Pick 3 since 1989!).
  va_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "VA", stateName: "Virginia", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Virginia Pick 3 is a 3-digit game (000–999) drawn twice a day; we track the night draw. Fixed payouts by play type (shown for a $1 straight); an optional FIREBALL add-on adds ways to win. History goes back to 1989.",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Pick 3 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$500", "1 in 1,000"] }, { cells: ["3-Way Box", "$160", "1 in 333"] }, { cells: ["6-Way Box", "$80", "1 in 167"] }, { cells: ["Front / Back Pair", "$50", "1 in 100"] } ],
        note: "Shown for a $1 play; 50¢ plays pay half." },
    },
  },
  va_pick4: {
    label: "Pick 4", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "VA", stateName: "Virginia", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Virginia Pick 4 is a 4-digit game (0000–9999) drawn twice a day; we track the night draw. Fixed payouts by play type (shown for a $1 straight); an optional FIREBALL add-on adds ways to win. History goes back to 1991.",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Pick 4 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] }, { cells: ["4-Way Box", "$1,200", "1 in 2,500"] }, { cells: ["6-Way Box", "$800", "1 in 1,667"] }, { cells: ["12-Way Box", "$400", "1 in 833"] }, { cells: ["24-Way Box", "$200", "1 in 417"] } ],
        note: "Shown for a $1 play; 50¢ plays pay half." },
    },
  },
  // Cash 5 with EZ Match — 5 of 45, nightly, rolling cash jackpot from $200k (pari-mutuel).
  va_cash5: {
    label: "Cash 5", specialKey: null, specialName: "", draws: "Nightly",
    priceChanges: [], state: "VA", stateName: "Virginia", ticketPrice: "$1",
    oddsJackpot: 1221759, // 5 of 45
    prizes: {
      note: "Virginia Cash 5 is 5 of 45 with a cash jackpot that starts at $200,000 and grows until won. All prizes are pari-mutuel (amounts vary with sales and winners). An optional EZ Match add-on wins instant prizes. Odds shown per $1 play.",
      topPrize: "Jackpot (min $200k)", topPrizeLabel: "Match 5",
      reference: {
        title: "Cash 5 odds by match",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["5 of 5", "Jackpot (min $200k)", "1 in 1,221,759"] },
          { cells: ["4 of 5", "Pari-mutuel", "1 in 6,109"] },
          { cells: ["3 of 5", "Pari-mutuel", "1 in 157"] },
          { cells: ["2 of 5", "Pari-mutuel", "1 in 12.4"] },
        ],
        note: "All prizes are pari-mutuel. Overall odds of winning any prize: 1 in 11.44.",
      },
    },
    viz: { tiers: [ {label:"Match 5 (jackpot)",odds:1221759},{label:"Match 4",odds:6109},{label:"Match 3",odds:157},{label:"Match 2",odds:12} ] },
  },
  // Bank a Million — 6 of 40 + Bonus Ball; guaranteed $1,000,000 top prize (8 tiers).
  va_bank: {
    label: "Bank a Million", specialKey: "bonus", specialName: "Bonus Ball", specialAbbr: "B",
    draws: "Wed · Sat", priceChanges: [], state: "VA", stateName: "Virginia", ticketPrice: "$2",
    oddsJackpot: 3838380, // 6 of 40
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Bank a Million is 6 of 40 with a 7th Bonus Ball you don't pick. The top prize is a guaranteed $1,000,000. There are 8 prize tiers; matching the Bonus Ball doubles your non-jackpot prize. Overall odds of any prize: 1 in 18.3.",
      topPrize: "$1,000,000", topPrizeLabel: "Match 6",
      reference: {
        title: "Bank a Million top tiers & odds",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["6 of 6", "$1,000,000", "1 in 3,838,380"] },
          { cells: ["5 of 6", "Fixed prize", "1 in 18,815"] },
          { cells: ["4 of 6", "Fixed prize", "1 in 602"] },
          { cells: ["3 of 6", "Fixed prize", "1 in 49"] },
        ],
        note: "Matching the Bonus Ball doubles any non-jackpot prize, for 8 tiers total. Overall odds of any prize: 1 in 18.3.",
      },
    },
  },
  // Cash Pop — pick 1 of 15, five draws a day; the prize is preprinted on your ticket.
  va_cashpop: {
    label: "Cash Pop", specialKey: null, specialName: "",
    draws: "5× daily", priceChanges: [], state: "VA", stateName: "Virginia", ticketPrice: "$1 to $10",
    prizes: {
      note: "Virginia Cash Pop: pick a number from 1 to 15, with five draws a day. Each number carries a randomly assigned, preprinted prize; if your number is drawn, you win it. The frequency chart covers numbers 1–15 over recent draws.",
      topPrize: "1 in 15", topPrizeLabel: "Odds your number is drawn",
      reference: {
        title: "How Cash Pop pays",
        columns: ["Outcome", "Prize", "Odds"],
        rows: [ { cells: ["Your number is drawn", "Your ticket's preprinted prize", "1 in 15"] } ],
        note: "The prize is randomly assigned and printed on your ticket; the amount scales with how much you bet.",
      },
    },
  },

  // ---- Massachusetts (13th state) — masslottery.com public API ---------------------
  // Megabucks Doubler — 6 of 44, progressive jackpot (cash option) + fixed lower tiers.
  // Per-tier winner counts come from the /v3/game-payouts feed (latest draw).
  ma_megabucks: {
    label: "Megabucks Doubler", specialKey: null, specialName: "",
    draws: "Mon · Wed · Sat", priceChanges: [], state: "MA", stateName: "Massachusetts", ticketPrice: "$2",
    ev: {
      ticket_price: 2,
      odds_jackpot: 7059052, // 6 of 44
      overall_odds: 39,
      winnersLabel: "winners",
      note: "Megabucks Doubler's jackpot is paid at the cash option shown; the lower tiers pay <em>fixed</em> amounts — $5,000, $200 and $4. The game's Doubler feature can double non-jackpot prizes; those doubled amounts aren't included here, so real value can run a little higher. Winner counts are the actual results of the latest draw. <em>Value / $1</em> prices the jackpot at the upcoming cash option plus the fixed lower tiers, after an assumed 37% tax. Overall odds of any prize: 1 in 39.",
      levels: {
        "Jackpot": { label: "Jackpot (Match 6)", odds: 7059052 },
        "Match 5": { label: "Match 5", odds: 30961, prize: 5000 },
        "Match 4": { label: "Match 4", odds: 669, prize: 200 },
        "Match 3": { label: "Match 3", odds: 42, prize: 4 },
      },
    },
  },
  // Mass Cash — 5 of 35, all prizes fixed (no rolling jackpot, no winner-count feed).
  ma_masscash: {
    label: "Mass Cash", specialKey: null, specialName: "",
    draws: "Twice daily", priceChanges: [], state: "MA", stateName: "Massachusetts", ticketPrice: "$1",
    ev: {
      ticket_price: 1,
      overall_odds: 72,
      staticPrizes: true, // fixed prizes; Massachusetts publishes no per-draw winner counts
      note: "Mass Cash pays <em>fixed</em> prizes — $100,000 for matching all 5, $250 for 4, and $10 for 3 — drawn twice a day. <em>Value / $1</em> prices those fixed prizes after an assumed 37% tax. Overall odds of any prize: 1 in 72.",
      levels: {
        "Match 5": { label: "Match 5", odds: 324632, prize: 100000 },
        "Match 4": { label: "Match 4", odds: 2164, prize: 250 },
        "Match 3": { label: "Match 3", odds: 74.63, prize: 10 },
      },
    },
  },
  // The Numbers Game — Massachusetts's daily 4-digit game, pari-mutuel (prizes vary).
  ma_numbers: {
    label: "The Numbers Game", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "MA", stateName: "Massachusetts", ticketPrice: "$0.25 to $1",
    prizes: {
      note: "The Numbers Game is Massachusetts's daily 4-digit game (0000–9999), drawn twice a day (midday and evening) — we track the evening draw. Payouts are <em>pari-mutuel</em>: each pool is split among that draw's winners, so prize amounts change every day rather than being fixed. The odds below are for each bet type.",
      topPrize: "Pari-mutuel", topPrizeLabel: "Top prize (Exact, all 4)",
      reference: {
        title: "The Numbers Game — bet types & odds",
        columns: ["Bet type", "Prize", "Odds"],
        rows: [
          { cells: ["Exact — all 4 digits in order", "Pari-mutuel", "1 in 10,000"] },
          { cells: ["Any 3 (first or last 3, in order)", "Pari-mutuel", "1 in 1,000"] },
          { cells: ["Any 2 (first or last 2, in order)", "Pari-mutuel", "1 in 100"] },
          { cells: ["Any 1 (first or last digit)", "Pari-mutuel", "1 in 10"] },
        ],
        note: "Prizes are pari-mutuel, so the amount depends on ticket sales and how many players win each draw. Box and other wagers carry their own odds.",
      },
    },
  },

  // ===== Maryland (14th state) — mdlottery.com Winning Numbers tables =====
  // Multi-Match — 6 of 43, $2 (three lines). Two prize paths: best single line + the 18
  // numbers combined. Jackpot (6 on a line) starts at $500k and rolls. oddsJackpot per ticket.
  md_multimatch: {
    label: "Multi-Match", specialKey: null, specialName: "", draws: "Mon · Thu",
    priceChanges: [], state: "MD", stateName: "Maryland", ticketPrice: "$2",
    oddsJackpot: 2032152, // 6 of 6 on a line, per $2 ticket (3 lines)
    prizes: {
      note: "Multi-Match is 6 of 43. A $2 ticket gives you three lines, and you can win two ways at once: on your best single line, and on all 18 of your numbers combined. The jackpot (all 6 on one line) starts at $500,000 and grows until won. Odds are per $2 ticket.",
      topPrize: "Jackpot (min $500k)", topPrizeLabel: "6 of 6 (one line)",
      reference: {
        title: "Multi-Match prizes & odds (per $2 ticket)",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["6 of 6 — one line", "Jackpot (min $500k)", "1 in 2,032,152"] },
          { cells: ["5 of 6 — one line", "$1,000", "1 in 9,154"] },
          { cells: ["4 of 6 — one line", "$20", "1 in 204"] },
          { cells: ["3 of 6 — one line", "$2", "1 in 13.4"] },
          { cells: ["10+ of 18 — combined", "$2,000", "1 in 168,240"] },
          { cells: ["9 of 18 — combined", "$500", "1 in 15,098"] },
          { cells: ["8 of 18 — combined", "$100", "1 in 1,740"] },
          { cells: ["7 of 18 — combined", "$20", "1 in 273"] },
          { cells: ["6 of 18 — combined", "$7", "1 in 58"] },
          { cells: ["5 of 18 — combined", "$2", "1 in 16.9"] },
        ],
        note: "Two prize paths on the same ticket — your best single-line match and your total across all three lines. Approximate overall odds of any prize: 1 in 8.5.",
      },
    },
    viz: { tiers: [ {label:"6 of 6 (jackpot)",odds:2032152},{label:"5 of 6",odds:9154},{label:"4 of 6",odds:204},{label:"3 of 6",odds:13.4} ] },
  },
  // Bonus Match 5 — 5 of 39 + a Bonus Ball from the remaining 34. All prizes fixed
  // ($50,000 top), so value/$1 is computable. Nightly.
  md_bonus5: {
    label: "Bonus Match 5", specialKey: "bonus", specialName: "Bonus Ball", specialAbbr: "B",
    draws: "Nightly", priceChanges: [], state: "MD", stateName: "Maryland", ticketPrice: "$1",
    ev: {
      ticket_price: 1,
      overall_odds: 52,
      staticPrizes: true, // fixed prizes; no per-draw winner feed
      note: "Bonus Match 5 draws five numbers from 1–39 plus a Bonus Ball from the remaining 34. Match the Bonus Ball and you need one fewer of your own numbers to win. All prizes are <em>fixed</em> — $50,000 for matching all 5. <em>Value / $1</em> prices those fixed prizes after an assumed 37% tax. Overall odds of any prize: 1 in 52.",
      levels: {
        "Match 5": { label: "Match 5", odds: 575757, prize: 50000 },
        "Match 4 + Bonus": { label: "Match 4 + Bonus", odds: 115151, prize: 600 },
        "Match 4": { label: "Match 4", odds: 3489, prize: 400 },
        "Match 3 + Bonus": { label: "Match 3 + Bonus", odds: 1745, prize: 30 },
        "Match 3": { label: "Match 3", odds: 109, prize: 15 },
        "Match 2 + Bonus": { label: "Match 2 + Bonus", odds: 109, prize: 2 },
      },
    },
  },
  // Pick 3 / 4 / 5 — digit games drawn twice daily (we track the evening draw). Fixed
  // paytables from the MD Lottery prize-structure pages (shown for a $1 straight).
  md_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "MD", stateName: "Maryland", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Maryland Pick 3 is a 3-digit game (000–999) drawn twice a day; we track the evening draw. Fixed payouts by bet type (shown for a $1 play; 50¢ plays pay half).",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Pick 3 pays (per $1)", columns: ["Bet type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$500", "1 in 1,000"] }, { cells: ["3-Way Box", "$160", "1 in 333"] }, { cells: ["6-Way Box", "$80", "1 in 167"] }, { cells: ["Front / Back Pair", "$50", "1 in 100"] } ],
        note: "Shown for a $1 play; 50¢ plays pay half." },
    },
  },
  md_pick4: {
    label: "Pick 4", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "MD", stateName: "Maryland", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Maryland Pick 4 is a 4-digit game (0000–9999) drawn twice a day; we track the evening draw. Fixed payouts by bet type (shown for a $1 play; 50¢ plays pay half).",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Pick 4 pays (per $1)", columns: ["Bet type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] }, { cells: ["4-Way Box", "$1,200", "1 in 2,500"] }, { cells: ["6-Way Box", "$800", "1 in 1,667"] }, { cells: ["12-Way Box", "$400", "1 in 833"] }, { cells: ["24-Way Box", "$200", "1 in 417"] } ],
        note: "Shown for a $1 play; 50¢ plays pay half." },
    },
  },
  md_pick5: {
    label: "Pick 5", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "MD", stateName: "Maryland", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Maryland Pick 5 is a 5-digit game (00000–99999) drawn twice a day; we track the evening draw. Fixed payouts by bet type (shown for a $1 play; 50¢ plays pay half).",
      topPrize: "$50,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Pick 5 pays (per $1)", columns: ["Bet type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$50,000", "1 in 100,000"] }, { cells: ["5-Way Box", "$10,000", "1 in 20,000"] }, { cells: ["10-Way Box", "$5,000", "1 in 10,000"] }, { cells: ["20-Way Box", "$2,500", "1 in 5,000"] }, { cells: ["30-Way Box", "$1,650", "1 in 3,333"] }, { cells: ["60-Way Box", "$800", "1 in 1,667"] }, { cells: ["120-Way Box", "$400", "1 in 833"] }, { cells: ["Front / Back 3", "$500", "1 in 1,000"] }, { cells: ["Front / Back Pair", "$50", "1 in 100"] } ],
        note: "Shown for a $1 play; 50¢ plays pay half." },
    },
  },

  // ===== Colorado (15th state) — coloradolottery.com Winning History =====
  // Colorado Lotto+ — 6 of 40, cash-value jackpot from $1M; non-jackpot prizes are
  // pari-mutuel × a random 2–5× multiplier. oddsJackpot + computed-odds reference.
  co_lotto: {
    label: "Colorado Lotto+", specialKey: null, specialName: "", draws: "Mon · Wed · Sat",
    priceChanges: [], state: "CO", stateName: "Colorado", ticketPrice: "$2",
    oddsJackpot: 3838380, // 6 of 40
    prizes: {
      note: "Colorado Lotto+ is 6 of 40 with a cash-value jackpot that starts at $1,000,000 and grows until won. Non-jackpot prizes are pari-mutuel and multiplied by a randomly drawn 2×–5× multiplier; the optional Plus add-on runs a second draw against your numbers. Odds shown per $2 play.",
      topPrize: "Jackpot (min $1M)", topPrizeLabel: "Match 6",
      reference: {
        title: "Colorado Lotto+ odds by match",
        columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["6 of 6", "Jackpot (min $1M)", "1 in 3,838,380"] },
          { cells: ["5 of 6", "Pari-mutuel ×2–5", "1 in 18,816"] },
          { cells: ["4 of 6", "Pari-mutuel ×2–5", "1 in 456"] },
          { cells: ["3 of 6", "Pari-mutuel ×2–5", "1 in 32"] },
        ],
        note: "Non-jackpot prizes are pari-mutuel and multiplied by each draw's 2×–5× multiplier. Frequency chart below covers recent draws.",
      },
    },
    viz: { tiers: [ {label:"6 of 6 (jackpot)",odds:3838380},{label:"5 of 6",odds:18816},{label:"4 of 6",odds:456},{label:"3 of 6",odds:32} ] },
  },
  // Cash 5 — 5 of 32, rolling cash jackpot (from $20,000) + fixed lower tiers. Per-draw
  // prizes & CO winner counts drive a value/$1 treatment.
  co_cash5: {
    label: "Cash 5", specialKey: null, specialName: "", draws: "Daily",
    priceChanges: [], state: "CO", stateName: "Colorado", ticketPrice: "$1",
    ev: {
      ticket_price: 1,
      odds_jackpot: 201376, // 5 of 32
      overall_odds: 6,
      winnersLabel: "CO winners",
      note: "Colorado Cash 5's jackpot is a rolling cash prize that starts at $20,000; the lower tiers pay fixed amounts ($200 / $10 / $1). Winner counts are the Colorado winners of the latest draw. <em>Value / $1</em> prices the jackpot at the current cash jackpot plus the fixed tiers, after an assumed 37% tax. Overall odds of any prize: 1 in 6.",
      levels: {
        "Jackpot": { label: "Jackpot (Match 5)", odds: 201376 },
        "Match 4": { label: "Match 4", odds: 1492, prize: 200 },
        "Match 3": { label: "Match 3", odds: 57, prize: 10 },
        "Match 2": { label: "Match 2", odds: 7, prize: 1 },
      },
    },
  },
  // Pick 3 — 3-digit, twice daily (we track the evening draw). Verified CO paytable.
  co_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "CO", stateName: "Colorado", ticketPrice: "$0.50 to $5",
    prizes: {
      note: "Colorado Pick 3 is a 3-digit game (000–999) drawn twice a day; we track the evening draw. Fixed payouts by bet type (shown for a $1 play).",
      topPrize: "$500", topPrizeLabel: "Top prize (Exact Order $1)",
      reference: { title: "How Pick 3 pays (per $1)", columns: ["Bet type", "Prize", "Odds"],
        rows: [ { cells: ["Exact Order (straight)", "$500", "1 in 1,000"] }, { cells: ["Any Order — 3-way box", "$160", "1 in 333"] }, { cells: ["Any Order — 6-way box", "$80", "1 in 167"] }, { cells: ["Front / Back Pair", "$60", "1 in 100"] } ],
        note: "Shown for a $1 play; other bet amounts scale proportionally." },
    },
  },

  // ===== Georgia (16th state) — galottery.com JSON API =====
  // Fantasy 5 — 5 of 42, cash jackpot (from $250K). Per-tier prizes + Georgia winner
  // counts come live from the API; deep numbers history seeded from a validated archive.
  ga_fantasy5: {
    label: "Fantasy 5", specialKey: null, specialName: "", draws: "Daily",
    priceChanges: [], state: "GA", stateName: "Georgia", ticketPrice: "$1",
    ev: {
      ticket_price: 1,
      odds_jackpot: 850668, // 5 of 42
      overall_odds: 10,
      winnersLabel: "GA winners",
      levels: {
        "Jackpot": { label: "Jackpot (Match 5)", odds: 850668 },
        "4/5": { label: "Match 4", odds: 4598 },
        "3/5": { label: "Match 3", odds: 128 },
        "2/5": { label: "Match 2 (free play)", odds: 11, free: true },
      },
    },
  },
  // Cash 3 / Cash 4 — digit games drawn three times a day. Verified straight prizes
  // from the GA Lottery; box and other bet types pay less and carry their own odds.
  ga_cash3: {
    label: "Cash 3", specialKey: null, specialName: "", digits: true,
    draws: "3× daily", priceChanges: [], state: "GA", stateName: "Georgia", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Georgia Cash 3 is a 3-digit game (000–999) drawn three times a day; we track the night draw. The top prize is a $500 Straight on a $1 play; Box and Straight/Box bets pay less and carry their own odds.",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Cash 3 pays (per $1)", columns: ["Bet type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$500", "1 in 1,000"] }, { cells: ["3-Way Box", "$166", "1 in 333"] }, { cells: ["6-Way Box", "$83", "1 in 167"] } ],
        note: "Top-prize Straight is GA-verified; box payouts are the standard Georgia amounts." },
    },
  },
  ga_cash4: {
    label: "Cash 4", specialKey: null, specialName: "", digits: true,
    draws: "3× daily", priceChanges: [], state: "GA", stateName: "Georgia", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Georgia Cash 4 is a 4-digit game (0000–9999) drawn three times a day; we track the night draw. The top prize is a $5,000 Straight on a $1 play; Box and Straight/Box bets pay less and carry their own odds.",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Cash 4 pays (per $1)", columns: ["Bet type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] }, { cells: ["24-Way Box", "$200", "1 in 417"] }, { cells: ["12-Way Box", "$400", "1 in 833"] } ],
        note: "Top-prize Straight is GA-verified; box payouts are the standard Georgia amounts." },
    },
  },
  // Georgia FIVE — 5-digit game drawn twice daily; $10,000 top (API-verified).
  ga_five: {
    label: "Georgia FIVE", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "GA", stateName: "Georgia", ticketPrice: "$1",
    prizes: {
      note: "Georgia FIVE is a 5-digit game (00000–99999) drawn twice a day; we track the evening draw. Prizes are fixed; partial-match (front/back) bets pay smaller fixed amounts.",
      topPrize: "$10,000", topPrizeLabel: "Top prize (all 5 in order)",
      reference: { title: "How Georgia FIVE pays", columns: ["Match", "Prize", "Odds"],
        rows: [ { cells: ["All 5 in exact order", "$10,000", "1 in 100,000"] }, { cells: ["First 4 / Last 4 exact", "$225", "1 in 10,000"] }, { cells: ["First 3 / Last 3 exact", "$21", "1 in 1,000"] } ],
        note: "Top tiers from the Georgia Lottery's published payouts." },
    },
  },
  // Cash Pop — pick 1 of 15; each number carries a preprinted prize. Multiple draws daily.
  ga_cashpop: {
    label: "Cash Pop", specialKey: null, specialName: "",
    draws: "Multiple daily", priceChanges: [], state: "GA", stateName: "Georgia", ticketPrice: "$1 to $10",
    prizes: {
      note: "Georgia Cash Pop: pick a number from 1 to 15, with several draws a day. Each number carries a randomly assigned, preprinted prize; if your number is drawn you win it. The frequency chart covers numbers 1–15 over recent draws.",
      topPrize: "1 in 15", topPrizeLabel: "Odds your number is drawn",
      reference: { title: "How Cash Pop pays", columns: ["Outcome", "Prize", "Odds"],
        rows: [ { cells: ["Your number is drawn", "Your ticket's preprinted prize", "1 in 15"] } ],
        note: "The prize is preprinted on your ticket and scales with how much you bet." },
    },
  },
  // ----- Louisiana (17th state) ------------------------------------------- #
  // Louisiana Lotto — 6 of 42, drawn Wed & Sat, rolling pari-mutuel CASH jackpot. Lower
  // tiers are pari-mutuel too (no fixed amounts, no published per-draw winner counts), so
  // this shows the official odds + the live jackpot rather than an invented value/$1.
  la_lotto: {
    label: "Louisiana Lotto", specialKey: null, specialName: "",
    draws: "Wed & Sat", priceChanges: [], state: "LA", stateName: "Louisiana", ticketPrice: "$1",
    oddsJackpot: 5245786, // 6 of 42
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Louisiana Lotto is 6 of 42, drawn Wednesday and Saturday. The advertised jackpot is a rolling, pari-mutuel cash prize (it starts at $500,000 and grows until won). Match-5, -4 and -3 prizes are pari-mutuel as well, so they move with ticket sales and the number of winners. The figures below are the official published odds.",
      odds: { "Jackpot": 5245786, "Match 5": 24286, "Match 4": 555, "Match 3": 37 },
    },
  },
  // Easy 5 — 5 of 37, drawn Wed & Sat, rolling pari-mutuel cash jackpot (starts $50K).
  la_easy5: {
    label: "Easy 5", specialKey: null, specialName: "",
    draws: "Wed & Sat", priceChanges: [], state: "LA", stateName: "Louisiana", ticketPrice: "$1",
    oddsJackpot: 435897, // 5 of 37
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Easy 5 is 5 of 37, drawn Wednesday and Saturday. The jackpot is a rolling, pari-mutuel cash prize that starts at $50,000 and grows until won; the Match-4, -3 and -2 prizes are pari-mutuel too. The figures below are the official published odds.",
      odds: { "Jackpot": 435897, "Match 4": 2724, "Match 3": 88, "Match 2": 9 },
    },
  },
  // Pick 3 / 4 / 5 — daily digit games with FIXED payouts by play type (official LA
  // Lottery prize charts, shown per $1 wager). No published winner counts → static paytable.
  la_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Daily", priceChanges: [], state: "LA", stateName: "Louisiana", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Louisiana Pick 3 is a 3-digit game (000–999) drawn daily. What you win depends on your play type — prizes are fixed (shown for a $1 wager).",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Louisiana Pick 3 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [
          { cells: ["Straight — exact order", "$500", "1 in 1,000"] },
          { cells: ["3-Way Box", "$160", "1 in 333"] },
          { cells: ["6-Way Box", "$80", "1 in 167"] },
        ],
        note: "Official Louisiana Lottery Pick 3 prize chart. Combo and other play types pay differently." },
    },
  },
  la_pick4: {
    label: "Pick 4", specialKey: null, specialName: "", digits: true,
    draws: "Daily", priceChanges: [], state: "LA", stateName: "Louisiana", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Louisiana Pick 4 is a 4-digit game (0000–9999) drawn daily. What you win depends on your play type — prizes are fixed (shown for a $1 wager).",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Louisiana Pick 4 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [
          { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] },
          { cells: ["4-Way Box", "$1,200", "1 in 2,500"] },
          { cells: ["6-Way Box", "$800", "1 in 1,667"] },
          { cells: ["12-Way Box", "$400", "1 in 833"] },
        ],
        note: "Official Louisiana Lottery Pick 4 prize chart. Combo and other play types pay differently." },
    },
  },
  la_pick5: {
    label: "Pick 5", specialKey: null, specialName: "", digits: true,
    draws: "Daily", priceChanges: [], state: "LA", stateName: "Louisiana", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Louisiana Pick 5 is a 5-digit game (00000–99999) drawn daily; it launched in August 2021. What you win depends on your play type — prizes are fixed (shown for a $1 wager).",
      topPrize: "$50,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "How Louisiana Pick 5 pays (per $1)", columns: ["Play type", "Prize", "Odds"],
        rows: [
          { cells: ["Straight — exact order", "$50,000", "1 in 100,000"] },
          { cells: ["5-Way Box", "$10,000", "1 in 20,000"] },
          { cells: ["10-Way Box", "$5,000", "1 in 10,000"] },
        ],
        note: "Official Louisiana Lottery Pick 5 prize chart. Higher-multiplicity Box plays and Combo pay differently." },
    },
  },
  // ----- Missouri (18th state) ------------------------------------------- #
  // Show Me Cash — 5 of 39, daily, rolling CASH jackpot from $50K (rolls ≥$5K/draw).
  // Lower tiers shown as official odds (combinatorially verified); no per-draw winner
  // counts published, so this is the honest odds-only treatment + the live jackpot.
  mo_showmecash: {
    label: "Show Me Cash", specialKey: null, specialName: "",
    draws: "Daily", priceChanges: [], state: "MO", stateName: "Missouri", ticketPrice: "$1",
    oddsJackpot: 575757, // 5 of 39
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Show Me Cash is 5 of 39, drawn daily. The jackpot is paid in cash, starts at $50,000 and rolls by at least $5,000 each draw until someone wins. The optional EZ Match add-on ($1) prints instant-win numbers and pays separately. The figures below are the official published odds.",
      odds: { "Jackpot": 575757, "Match 4": 3387, "Match 3": 103, "Match 2": 10 },
    },
  },
  // Missouri Lotto — 6 of 44, ended Oct 18, 2025. Kept as a retired archive.
  mo_lotto: {
    label: "Missouri Lotto", specialKey: null, specialName: "",
    draws: "Wed & Sat (ended 2025)", priceChanges: [], state: "MO", stateName: "Missouri", ticketPrice: "$1 / 2 plays",
    oddsJackpot: 7059052, // 6 of 44
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Missouri Lotto was a 6 of 44 jackpot game — two plays for $1 — drawn Wednesday and Saturday, with a jackpot that started at $1,000,000 and rolled until won. The Missouri Lottery ended Lotto on October 18, 2025; this is the final archive of past draws and the published odds.",
      topPrize: "Jackpot (6 of 44)", topPrizeLabel: "Top prize", retired: true,
      odds: { "Jackpot": 7059052, "Match 5": 30962, "Match 4": 669, "Match 3": 42 },
    },
  },
  // Pick 3 / 4 — twice daily (we track the evening draw). MO pays a $600 / $6,000
  // Straight on $1 (official); box and add-on plays pay different amounts.
  mo_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "MO", stateName: "Missouri", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Missouri Pick 3 is a 3-digit game (000–999) drawn twice a day; we track the evening draw. The top prize is a $600 Straight on a $1 play. Box plays (any order) pay less, and the EZ Match and Wild Ball add-ons cost extra and pay separately.",
      topPrize: "$600", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "Missouri Pick 3 top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$600", "1 in 1,000"] } ],
        note: "Official Missouri Lottery top prize. Box (any-order) plays and the Wild Ball / EZ Match add-ons pay different amounts." },
    },
  },
  mo_pick4: {
    label: "Pick 4", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "MO", stateName: "Missouri", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Missouri Pick 4 is a 4-digit game (0000–9999) drawn twice a day; we track the evening draw. The top prize is a $6,000 Straight on a $1 play. Box plays (any order) pay less, and the EZ Match and Wild Ball add-ons cost extra and pay separately.",
      topPrize: "$6,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "Missouri Pick 4 top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$6,000", "1 in 10,000"] } ],
        note: "Official Missouri Lottery top prize. Box (any-order) plays and the Wild Ball / EZ Match add-ons pay different amounts." },
    },
  },
  // ----- Wisconsin (19th state) ------------------------------------------ #
  // Megabucks — 6 of 49, Wed & Sat, rolling jackpot from $1M (two plays for $1). Lower
  // tiers shown as official odds (combinatorially verified) + the live jackpot.
  wi_megabucks: {
    label: "Megabucks", specialKey: null, specialName: "",
    draws: "Wed & Sat", priceChanges: [], state: "WI", stateName: "Wisconsin", ticketPrice: "$1 / 2 plays",
    oddsJackpot: 13983816, // 6 of 49
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Wisconsin Megabucks is 6 of 49 — two plays for $1 — drawn Wednesday and Saturday. The jackpot starts at $1,000,000 and rolls until won (annuity, with a cash option). The lower tiers are pari-mutuel; the figures below are the official published odds.",
      odds: { "Jackpot": 13983816, "Match 5": 54201, "Match 4": 1032, "Match 3": 57 },
    },
  },
  // SuperCash! — 6 of 39, daily, FIXED $350K top (two plays for $1); optional Doubler.
  wi_supercash: {
    label: "SuperCash!", specialKey: null, specialName: "",
    draws: "Daily", priceChanges: [], state: "WI", stateName: "Wisconsin", ticketPrice: "$1 / 2 plays",
    oddsJackpot: 3262623, // 6 of 39
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Wisconsin SuperCash! is 6 of 39 — two plays for $1 — drawn daily. The top prize is a FIXED $350,000 (shared if there are multiple winners), not a rolling jackpot; the optional Doubler add-on doubles non-jackpot prizes and can make the top prize $700,000. The figures below are the official published odds.",
      odds: { "Jackpot": 3262623, "Match 5": 16478, "Match 4": 412, "Match 3": 30 },
    },
  },
  // Badger 5 — 5 of 31, daily, rolling CASH jackpot from $10K. Match 2 wins a free ticket.
  wi_badger5: {
    label: "Badger 5", specialKey: null, specialName: "",
    draws: "Daily", priceChanges: [], state: "WI", stateName: "Wisconsin", ticketPrice: "$1",
    oddsJackpot: 169911, // 5 of 31
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Wisconsin Badger 5 is 5 of 31, drawn daily. The jackpot is paid in cash, starts at $10,000 and rolls until won. Match 2 of 5 wins a free ticket. The figures below are the official published odds.",
      odds: { "Jackpot": 169911, "Match 4": 1307, "Match 3": 52, "Match 2 (free ticket)": 7 },
    },
  },
  // Pick 3 / 4 — twice daily (we track the evening draw). $500 / $5,000 Straight top.
  wi_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "WI", stateName: "Wisconsin", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Wisconsin Pick 3 is a 3-digit game (000–999) drawn twice a day; we track the evening draw. The top prize is a $500 Straight on a $1 play. Box (any-order) plays pay less.",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "Wisconsin Pick 3 top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$500", "1 in 1,000"] } ],
        note: "Official Wisconsin Lottery top prize. Box (any-order) and combination plays pay different amounts." },
    },
  },
  wi_pick4: {
    label: "Pick 4", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "WI", stateName: "Wisconsin", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Wisconsin Pick 4 is a 4-digit game (0000–9999) drawn twice a day; we track the evening draw. The top prize is a $5,000 Straight on a $1 play. Box (any-order) plays pay less.",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "Wisconsin Pick 4 top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] } ],
        note: "Official Wisconsin Lottery top prize. Box (any-order) and combination plays pay different amounts." },
    },
  },
  // ----- Minnesota (20th state) ------------------------------------------ #
  // Gopher 5 — 5 of 47, Mon/Wed/Fri, rolling CASH jackpot from $100K.
  mn_gopher5: {
    label: "Gopher 5", specialKey: null, specialName: "",
    draws: "Mon · Wed · Fri", priceChanges: [], state: "MN", stateName: "Minnesota", ticketPrice: "$1",
    oddsJackpot: 1533939, // 5 of 47
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Minnesota Gopher 5 is 5 of 47, drawn Monday, Wednesday and Friday. The jackpot is paid in cash, starts at $100,000 and rolls until won. The figures below are the official published odds.",
      odds: { "Jackpot": 1533939, "Match 4": 7305, "Match 3": 178, "Match 2": 13 },
    },
  },
  // North 5 — 5 of 34, daily, rolling CASH jackpot from $25K; optional EZ Match.
  // (Replaced the 5/31 Northstar Cash in 2025 — history here is the 5/34 game only.)
  mn_north5: {
    label: "North 5", specialKey: null, specialName: "",
    draws: "Daily", priceChanges: [], state: "MN", stateName: "Minnesota", ticketPrice: "$1",
    oddsJackpot: 278256, // 5 of 34
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Minnesota North 5 is 5 of 34, drawn daily. The jackpot is paid in cash, starts at $25,000 and rolls until won. The optional EZ Match add-on ($1) pays $2–$500 instantly. The figures below are the official published odds.",
      odds: { "Jackpot": 278256, "Match 4": 1919, "Match 3": 69, "Match 2": 8 },
    },
  },
  // Pick 3 — daily 3-digit; $500 Straight top.
  mn_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Daily", priceChanges: [], state: "MN", stateName: "Minnesota", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Minnesota Pick 3 is a 3-digit game (000–999) drawn daily. The top prize is a $500 Straight on a $1 play. Box (any-order) and straight/box plays pay less.",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "Minnesota Pick 3 top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$500", "1 in 1,000"] } ],
        note: "Official Minnesota Lottery top prize. Box (any-order) and straight/box plays pay different amounts." },
    },
  },
  // ----- Arkansas (21st state) ------------------------------------------- #
  // Arkansas Lotto — 6 of 40 (+ a free Bonus Number for non-jackpot tiers), Wed & Sat,
  // rolling jackpot from $250K. Match 5 + Bonus = fixed $25K; other tiers pari-mutuel.
  ar_lotto: {
    label: "Arkansas Lotto", specialKey: null, specialName: "",
    draws: "Wed & Sat", priceChanges: [], state: "AR", stateName: "Arkansas", ticketPrice: "$1",
    oddsJackpot: 3838380, // 6 of 40
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Arkansas Lotto is 6 of 40, drawn Wednesday and Saturday — seven balls are drawn and the seventh is a free Bonus Number used only for non-jackpot prizes. The jackpot starts at $250,000 and rolls until won. Match 5 + Bonus pays a fixed $25,000; the other non-jackpot tiers are pari-mutuel. The figures below are the official published odds.",
      odds: { "Jackpot (Match 6)": 3838380, "Match 5 + Bonus": 639730, "Match 5": 19386 },
    },
  },
  // Natural State Jackpot — 5 of 39, daily, rolling cash jackpot from $50K. Lower tiers
  // are FIXED (Match 4 $300, Match 3 $7, Match 2 $1) — full value treatment + Monte Carlo.
  ar_nsj: {
    label: "Natural State Jackpot", specialKey: null, specialName: "",
    draws: "Daily", priceChanges: [], state: "AR", stateName: "Arkansas", ticketPrice: "$1",
    ev: {
      ticket_price: 1,
      odds_jackpot: 575757, // 5 of 39
      overall_odds: 9,
      staticPrizes: true,
      levels: {
        "Jackpot": { label: "Jackpot (Match 5)", odds: 575757 },
        "Match 4": { label: "Match 4", odds: 3387, prize: 300 },
        "Match 3": { label: "Match 3", odds: 103, prize: 7 },
        "Match 2": { label: "Match 2", odds: 10, prize: 1 },
      },
    },
  },
  // Cash 3 / Cash 4 — twice daily (we track the evening draw). $500 / $5,000 Straight top.
  ar_cash3: {
    label: "Cash 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "AR", stateName: "Arkansas", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Arkansas Cash 3 is a 3-digit game (000–999) drawn twice a day; we track the evening draw. The top prize is a $500 Straight on a $1 play. Box (any-order), Straight/Box and Combo plays pay differently.",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "Arkansas Cash 3 top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$500", "1 in 1,000"] } ],
        note: "Official Arkansas Scholarship Lottery top prize. Box and Combo plays pay different amounts." },
    },
  },
  ar_cash4: {
    label: "Cash 4", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "AR", stateName: "Arkansas", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Arkansas Cash 4 is a 4-digit game (0000–9999) drawn twice a day; we track the evening draw. The top prize is a $5,000 Straight on a $1 play. Box (any-order), Straight/Box and Combo plays pay differently.",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "Arkansas Cash 4 top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] } ],
        note: "Official Arkansas Scholarship Lottery top prize. Box and Combo plays pay different amounts." },
    },
  },
  // ----- Nebraska (22nd state) ------------------------------------------- #
  // Pick 5 — 5 of 40, daily, growing CASH jackpot from $50K. Lower tiers are FIXED
  // (Match 4 $500, Match 3 $9, Match 2 free) — full value treatment + Monte Carlo.
  ne_pick5: {
    label: "Pick 5", specialKey: null, specialName: "",
    draws: "Daily", priceChanges: [], state: "NE", stateName: "Nebraska", ticketPrice: "$1",
    ev: {
      ticket_price: 1,
      odds_jackpot: 658008, // 5 of 40
      overall_odds: 9.2,
      staticPrizes: true,
      levels: {
        "Jackpot": { label: "Jackpot (Match 5)", odds: 658008 },
        "Match 4": { label: "Match 4", odds: 3760, prize: 500 },
        "Match 3": { label: "Match 3", odds: 111, prize: 9 },
        "Match 2": { label: "Match 2 (free play)", odds: 10, free: true },
      },
    },
  },
  // Pick 3 / Pick 4 — daily digit games. Straight tops $600 / $6,000 (official).
  ne_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Daily", priceChanges: [], state: "NE", stateName: "Nebraska", ticketPrice: "$0.50 to $5",
    prizes: {
      note: "Nebraska Pick 3 is a 3-digit game (000–999) drawn daily. The top prize is a $600 Straight on a $1 play. Box, Straight/Box and Combo plays pay differently.",
      topPrize: "$600", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "Nebraska Pick 3 top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$600", "1 in 1,000"] } ],
        note: "Official Nebraska Lottery top prize. Box, Straight/Box and Combo plays pay different amounts." },
    },
  },
  ne_pick4: {
    label: "Pick 4", specialKey: null, specialName: "", digits: true,
    draws: "Daily", priceChanges: [], state: "NE", stateName: "Nebraska", ticketPrice: "$0.50 to $5", recentWindow: true,
    prizes: {
      note: "Nebraska Pick 4 is a 4-digit game (0000–9999) drawn daily. The top prize is a $6,000 Straight on a $1 play. Box, Straight/Box and Combo plays pay differently. (Deep history is filling in as draws accumulate.)",
      topPrize: "$6,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "Nebraska Pick 4 top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$6,000", "1 in 10,000"] } ],
        note: "Official Nebraska Lottery top prize. Box, Straight/Box and Combo plays pay different amounts." },
    },
  },
  // ----- South Carolina (23rd state) ------------------------------------- #
  // Palmetto Cash 5 — 5 of 38, daily, $2 play, rolling cash jackpot from $100K (+$10K/day
  // minimum). A random Power-Up multiplier (x2/x3/x5/x10) is built into every play, so the
  // non-jackpot prizes vary — odds-only treatment, no invented fixed value.
  sc_palmetto5: {
    label: "Palmetto Cash 5", specialKey: null, specialName: "",
    draws: "Daily", priceChanges: [], state: "SC", stateName: "South Carolina", ticketPrice: "$2",
    oddsJackpot: 501942, // 5 of 38
    prizes: {
      tierLabel: "Match", winnersTitle: "Prize tiers & odds",
      note: "Palmetto Cash 5 is 5 of 38, drawn daily for $2. The cash jackpot starts at $100,000 and grows by at least $10,000 a day until won. A random Power-Up multiplier (×2, ×3, ×5 or ×10) is built into every play and multiplies the non-jackpot prizes, so those amounts vary. The figures below are the official published odds.",
      odds: { "Jackpot": 501942, "Match 4": 3042, "Match 3": 95, "Match 2": 9 },
    },
  },
  // Pick 3 / Pick 4 (Plus FIREBALL) — twice daily (we track the evening draw).
  sc_pick3: {
    label: "Pick 3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "SC", stateName: "South Carolina", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "South Carolina Pick 3 (Plus FIREBALL) is a 3-digit game (000–999) drawn twice a day; we track the evening draw. The top prize is a $500 Straight on a $1 play. Box plays and the optional FIREBALL add-on pay differently.",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "South Carolina Pick 3 top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$500", "1 in 1,000"] } ],
        note: "Official SC Education Lottery top prize. Box and FIREBALL plays pay different amounts." },
    },
  },
  sc_pick4: {
    label: "Pick 4", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "SC", stateName: "South Carolina", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "South Carolina Pick 4 (Plus FIREBALL) is a 4-digit game (0000–9999) drawn twice a day; we track the evening draw. The top prize is a $5,000 Straight on a $1 play. Box plays and the optional FIREBALL add-on pay differently.",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "South Carolina Pick 4 top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] } ],
        note: "Official SC Education Lottery top prize. Box and FIREBALL plays pay different amounts." },
    },
  },
  // ----- Connecticut (24th state) ---------------------------------------- #
  // Lotto! — 6 of 44, Tue & Fri, rolling annuity jackpot from $1M with three FIXED lower
  // tiers ($2,000 / $50 / $2). Annuity (no published cash split) → odds + the fixed prizes.
  ct_lotto: {
    label: "Lotto!", specialKey: null, specialName: "",
    draws: "Tue & Fri", priceChanges: [], state: "CT", stateName: "Connecticut", ticketPrice: "$1",
    oddsJackpot: 7059052, // 6 of 44
    prizes: {
      tierLabel: "Match", winnersTitle: "Prizes & odds",
      note: "Connecticut Lotto! is 6 of 44, drawn Tuesday and Friday. The jackpot starts at $1,000,000 and rolls until won (paid as an annuity). The three lower tiers pay fixed amounts. Figures are the official published odds.",
      reference: { title: "Lotto! prizes & odds", columns: ["Match", "Prize", "Odds"],
        rows: [
          { cells: ["6 of 6", "Jackpot (rolls from $1M)", "1 in 7,059,052"] },
          { cells: ["5 of 6", "$2,000", "1 in 30,961"] },
          { cells: ["4 of 6", "$50", "1 in 669"] },
          { cells: ["3 of 6", "$2", "1 in 42"] },
        ],
        note: "Official Connecticut Lottery prizes and odds. The jackpot is paid as an annuity." },
    },
  },
  // Cash5 — 5 of 35, daily, all FIXED prizes ($100K / $300 / $10). Full value treatment.
  ct_cash5: {
    label: "Cash5", specialKey: null, specialName: "",
    draws: "Daily", priceChanges: [], state: "CT", stateName: "Connecticut", ticketPrice: "$1",
    ev: {
      ticket_price: 1,
      overall_odds: 72.1,
      staticPrizes: true,
      levels: {
        "Match 5": { label: "Match 5", odds: 324632, prize: 100000 },
        "Match 4": { label: "Match 4", odds: 2164, prize: 300 },
        "Match 3": { label: "Match 3", odds: 75, prize: 10 },
      },
    },
  },
  // Play 3 / Play 4 — twice daily (we track the night draw). $500 / $5,000 Straight.
  ct_play3: {
    label: "Play3", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "CT", stateName: "Connecticut", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Connecticut Play3 is a 3-digit game (000–999) drawn twice a day; we track the night draw. The top prize is a $500 Straight on a $1 play. Box plays and the optional Wild Ball add-on pay differently.",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "Connecticut Play3 top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$500", "1 in 1,000"] } ],
        note: "Official Connecticut Lottery top prize. Box and Wild Ball plays pay different amounts." },
    },
  },
  ct_play4: {
    label: "Play4", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "CT", stateName: "Connecticut", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "Connecticut Play4 is a 4-digit game (0000–9999) drawn twice a day; we track the night draw. The top prize is a $5,000 Straight on a $1 play. Box plays and the optional Wild Ball add-on pay differently.",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "Connecticut Play4 top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$5,000", "1 in 10,000"] } ],
        note: "Official Connecticut Lottery top prize. Box and Wild Ball plays pay different amounts." },
    },
  },
  // ----- New Mexico (25th state) ----------------------------------------- #
  // Roadrunner Cash — 5 of 37, daily, rolling CASH jackpot from $25K. Lower tiers are
  // FIXED (Match 4 $200, Match 3 $5, Match 2 $1) — full value treatment + Monte Carlo.
  nm_roadrunner: {
    label: "Roadrunner Cash", specialKey: null, specialName: "",
    draws: "Daily", priceChanges: [], state: "NM", stateName: "New Mexico", ticketPrice: "$1",
    ev: {
      ticket_price: 1,
      odds_jackpot: 435897, // 5 of 37
      overall_odds: 8,
      staticPrizes: true,
      levels: {
        "Jackpot": { label: "Jackpot (Match 5)", odds: 435897 },
        "Match 4": { label: "Match 4", odds: 2724, prize: 200 },
        "Match 3": { label: "Match 3", odds: 88, prize: 5 },
        "Match 2": { label: "Match 2", odds: 9, prize: 1 },
      },
    },
  },
  // Pick 3 Plus / Pick 4 Plus — NM-only digit games (we track the evening draw).
  nm_pick3: {
    label: "Pick 3 Plus", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "NM", stateName: "New Mexico", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "New Mexico Pick 3 Plus is a 3-digit game (000–999) drawn twice a day; we track the evening draw. The top prize is a $500 Straight on a $1 play. The optional Plus feature draws a second set of numbers for a chance at an extra prize; box plays pay differently.",
      topPrize: "$500", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "New Mexico Pick 3 Plus top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "$500", "1 in 1,000"] } ],
        note: "Top Straight prize on a $1 play. Box and the Plus feature pay different amounts — see the New Mexico Lottery for the full prize chart." },
    },
  },
  nm_pick4: {
    label: "Pick 4 Plus", specialKey: null, specialName: "", digits: true,
    draws: "Twice daily", priceChanges: [], state: "NM", stateName: "New Mexico", ticketPrice: "$0.50 or $1",
    prizes: {
      note: "New Mexico Pick 4 Plus is a 4-digit game (0000–9999) drawn twice a day; we track the evening draw. A $1 Straight pays a top prize in the $5,000 range. The optional Plus feature draws a second set of numbers for a chance at an extra prize; box plays pay differently.",
      topPrize: "$5,000", topPrizeLabel: "Top prize (Straight $1)",
      reference: { title: "New Mexico Pick 4 Plus top prize", columns: ["Play type", "Prize", "Odds"],
        rows: [ { cells: ["Straight — exact order", "~$5,000", "1 in 10,000"] } ],
        note: "Top Straight prize on a $1 play. Box and the Plus feature pay different amounts — see the New Mexico Lottery for the full prize chart." },
    },
  },
};

const fmtMoney = (n) =>
  n >= 1e9
    ? `$${(n / 1e9).toFixed(2)} B`
    : n >= 1e6
    ? `$${(n / 1e6).toFixed(1)} M`
    : `$${Math.round(n).toLocaleString()}`;

const fmtDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
};

const SITE = "https://numbersintel.com";

// National-game prize structure (ticket price, jackpot odds, and fixed non-jackpot tiers as
// [prize, 1-in-N odds]) — the published game rules. Shared by the break-even and Monte Carlo
// tools. KEEP IN SYNC with scraper/scrape.py CONFIG if odds/prizes change.
const LOTTO_TIERS = {
  powerball: {
    label: "Powerball", price: 2, J: 292201338,
    tiers: [[1000000, 11688053.52], [50000, 913129.18], [100, 36525.17], [100, 14494.11],
            [7, 579.76], [7, 701.33], [4, 91.98], [4, 38.32]],
  },
  mega_millions: {
    label: "Mega Millions", price: 5, J: 290472336,
    tiers: [[1000000, 12629232], [10000, 893761], [500, 38859], [200, 13965],
            [10, 607], [10, 665], [7, 86], [5, 35]],
  },
  lotto_america: {
    label: "Lotto America", price: 1, J: 25989600,
    tiers: [[20000, 2887733], [1000, 110594], [100, 12288], [20, 2404],
            [5, 267], [5, 160], [2, 29], [2, 17]],
  },
};

// Fixed prize-tier data for STATE jackpot games whose lower tiers are FIXED (not
// pari-mutuel) — the daily "cash" games. Same shape as LOTTO_TIERS so the Monte Carlo
// and break-even tools can run them; the jackpot itself is sampled from each game's
// historical cash pool (history/<key>.json). dpw = draws per week (for the habit sim).
// Tiers are the official published fixed prizes [prize, 1-in-N]. Pari-mutuel games
// (Fantasy 5s, Hit 5, Cash 5 variants, lotto-style 6/N) are intentionally excluded —
// their lower tiers vary per draw, so a fixed-tier simulation would be invented.
const STATE_TIERS = {
  mn_north5:  { label: "North 5 (MN)", price: 1, J: 278256, dpw: 7,
    tiers: [[50, 1919.01], [5, 68.54], [1, 7.62]] }, // 5/34, official fixed prizes
  mn_gopher5: { label: "Gopher 5 (MN)", price: 1, J: 1533939, dpw: 3,
    tiers: [[500, 7304], [15, 178], [1, 13]] }, // 5/47
  wi_badger5: { label: "Badger 5 (WI)", price: 1, J: 169911, dpw: 7,
    tiers: [[50, 1307], [2, 52.3], [1, 6.53]] }, // 5/31
  id_cash:    { label: "Idaho Cash", price: 1, J: 610880, dpw: 7,
    tiers: [[200, 3054], [5, 78]] }, // 5/45 (Match 2 is a free ticket — omitted)
  ar_nsj:     { label: "Natural State Jackpot (AR)", price: 1, J: 575757, dpw: 7,
    tiers: [[300, 3387], [7, 103], [1, 10]] }, // 5/39, official fixed lower tiers
  ne_pick5:   { label: "Pick 5 (NE)", price: 1, J: 658008, dpw: 7,
    tiers: [[500, 3760], [9, 111]] }, // 5/40, official fixed lower tiers (Match 2 free — omitted)
  ct_cash5:   { label: "Cash5 (CT)", price: 1, J: 324632, dpw: 7,
    tiers: [[300, 2164], [10, 75]] }, // 5/35, all-fixed (top $100K from the cash pool)
  nm_roadrunner: { label: "Roadrunner Cash (NM)", price: 1, J: 435897, dpw: 7,
    tiers: [[200, 2724], [5, 88], [1, 9]] }, // 5/37, official fixed lower tiers
};

// Update title + description + canonical + OG/Twitter tags (by id) for SEO.
// (Googlebot runs JS, so these reflect the specific game on each templated page.)
function setMeta({ title, description, url }) {
  if (title) document.title = title;
  const set = (id, attr, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.setAttribute(attr, val);
  };
  set("meta-desc", "content", description);
  set("meta-canonical", "href", url);
  set("og-title", "content", title);
  set("og-desc", "content", description);
  set("og-url", "content", url);
  set("tw-title", "content", title);
  set("tw-desc", "content", description);
}

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

// NY Lotto value per $1 (cents, after tax) by tier, from one draw's realized
// prizes + winner counts. The jackpot tier uses the upcoming cash value (what
// you'd actually win next); lower tiers use that draw's actual pari-mutuel payout.
function nyEvItems(ev, draw, cashValue, taxFactor) {
  const price = ev.ticket_price;
  return (draw.prizes || []).map((p) => {
    const lvl = ev.levels[p.level] || { label: p.level, odds: null };
    const isJackpot = p.level === "Jackpot";
    const free = lvl.free || (typeof p.amount === "string" && /free/i.test(p.amount));
    let prize;
    let cents = 0;
    if (isJackpot) {
      prize = cashValue; // upcoming cash option, not the (often $0, rolled) realized jackpot
      if (prize && lvl.odds) cents = (100 * taxFactor * (prize / lvl.odds)) / price;
    } else if (free) {
      prize = "Free play";
      if (lvl.odds) cents = (100 * price / lvl.odds) / price; // ≈ one ticket's worth, untaxed
    } else {
      // realized pari-mutuel amount when present, else the level's representative /
      // fixed prize. A realized $0 means "no winner this draw", not a $0 prize, so we
      // fall back to lvl.prize for the value estimate (e.g. Cash Five's ~$25k top tier).
      prize = (typeof p.amount === "number" && p.amount > 0) ? p.amount : (lvl.prize ?? null);
      if (typeof prize === "number" && prize && lvl.odds) cents = (100 * taxFactor * (prize / lvl.odds)) / price;
    }
    return {
      level: p.level,
      label: lvl.label,
      prize,
      winners: p.winners,
      odds: lvl.odds,
      free,
      cents,
      kind: isJackpot ? "jackpot" : "secondary",
    };
  });
}

// Parse "1 in 12,345" → 12345 (for reference-table odds cells).
function parseOdds(s) {
  const m = /1\s*in\s*([\d,]+)/i.exec(String(s || ""));
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
}

// Value per $1 (in cents, after ~37% tax) for a game — the shared metric behind the
// per-state and national "best value" modules. National games use the value precomputed
// in data.json; fixed-prize digit games use their $1 straight play (from the paytable);
// EV games are computed from their latest prized draw (fetched). Games with no single
// value/$1 (pari-mutuel ball / keno / fixed-jackpot-only) return null and drop out.
const BEST_TAX = 0.63;

async function valuePer1Cents(key, meta, data) {
  if (data && data.games && data.games[key] && data.games[key].expected_value != null) {
    return data.games[key].expected_value * 100; // national: precomputed in data.json
  }
  if (!meta) return null;
  if (!meta.ev && meta.digits && meta.prizes && meta.prizes.reference) {
    const row = meta.prizes.reference.rows.find((r) => /straight|exact order/i.test(r.cells[0]));
    if (row) {
      const prize = Number(String(row.cells[1]).replace(/[^0-9.]/g, ""));
      const odds = parseOdds(row.cells[2]);
      if (prize && odds) return (prize * BEST_TAX) / odds * 100; // per $1 straight
    }
    return null;
  }
  if (!meta.ev) return null;
  try {
    // Normal HTTP caching: fast on repeat visits, but (unlike force-cache) never pins a
    // stale 404 for a game whose history file was added after an earlier failed fetch.
    const h = await fetch(`history/${key}.json`, { cache: "default" }).then((r) => r.json());
    const lastPrized = [...(h.draws || [])].reverse().find((d) => d.prizes && d.prizes.length);
    // Fixed-prize games (Idaho Cash) have no per-draw prizes — synthesize from config.
    const evSource = lastPrized || (meta.ev.staticPrizes && (h.draws || []).length
      ? { prizes: Object.keys(meta.ev.levels).map((level) => ({ level })) }
      : null);
    if (!evSource) return null;
    const cur = h.current_jackpot;
    const hasJackpot = meta.ev.odds_jackpot && cur && cur.cash;
    const items = nyEvItems(meta.ev, evSource, hasJackpot ? cur.cash : null, BEST_TAX);
    return items.reduce((s, it) => s + it.cents, 0);
  } catch (e) {
    return null;
  }
}

// "Best value tickets in America right now" — the hero hook on the NumbersIntel home
// page. Ranks EVERY game on the site (all states + the multi-state jackpots) by value
// per $1 via the shared valuePer1Cents, and renders the top 12 into #national-best-value.
// Async so it never blocks the page; the EV games it fetches are force-cached and shared
// with the rest of the site, so navigating onward stays instant.
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
    return `<a class="best-row${i === 0 ? " best-row--top" : ""}" href="game.html?game=${r.key}&back=home">
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
        <a href="game.html?game=${top[0].key}&back=home">${best.label}</a>
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

// Tiers for the odds visualizer: [{label, odds}] from whatever a state game's
// config provides (EV levels, an explicit viz config, or a reference paytable),
// or null when there's nothing meaningful to visualize. National games come from
// data.json instead and don't use this.
function vizTiers(meta) {
  if (meta.ev && meta.ev.levels) {
    const tiers = Object.values(meta.ev.levels)
      .filter((l) => l.odds)
      .map((l) => ({ label: l.label, odds: l.odds }));
    if (meta.ev.overall_odds) tiers.unshift({ label: "Any prize", odds: meta.ev.overall_odds });
    return tiers.length ? tiers : null;
  }
  if (meta.viz && meta.viz.tiers) {
    return meta.viz.tiers.map((t) => ({ label: t.label, odds: t.odds }));
  }
  if (meta.prizes && meta.prizes.reference) {
    const cols = meta.prizes.reference.columns;
    const oi = cols.findIndex((c) => /odds/i.test(c));
    if (oi < 0) return null;
    const tiers = meta.prizes.reference.rows
      .map((r) => ({ label: r.cells[0], odds: parseOdds(r.cells[oi]) }))
      .filter((t) => t.odds);
    return tiers.length ? tiers : null;
  }
  return null;
}

async function loadData() {
  const res = await fetch("./data.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

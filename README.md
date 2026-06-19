# Lottery Value Tracker

A small analytics site that shows current jackpots for **Powerball**,
**Mega Millions**, and **Lotto America**, and ranks them by *value per dollar
spent* — how many cents of after-tax jackpot value each $1 ticket buys.

## How it works

```
scraper/scrape.py  ──>  data.json  ──>  index.html + app.js (Chart.js)
       ▲                                  reads data.json in the browser
       │
GitHub Actions (cron, after each draw)
```

- **`scraper/scrape.py`** pulls jackpot + cash value from the official sites
  (Powerball and Lotto America share one site; Mega Millions is separate),
  computes the expected value, and writes `data.json`.
- **`data.json`** is the single source of truth the frontend reads. It ships
  pre-seeded so the site works before the first scrape runs. It also exports the
  static prize tables (`prize_tiers`) and tax assumption so the frontend can
  break each game's value down by tier.
- **Frontend** is plain HTML/CSS/JS — no build step:
  - `index.html` / `app.js` — the home page: one card per game, each with a
    **"More details →"** link.
  - `game.html` / `game.js` — a single reusable detail page driven by a query
    param (`game.html?game=powerball`). Shows a stat strip, a
    jackpot-vs-smaller-prizes doughnut, the latest numbers, a value-per-$1
    bar by prize tier, and a full prize table. This page is where additional
    per-lottery data will go.
  - `visualizer.html` / `visualizer.js` — the odds visualizer
    (`visualizer.html?game=powerball`), linked from each detail page. Pick a
    **prize** — *Any prize* (overall odds, derived by summing `1/odds` across
    all tiers), the jackpot, or any specific tier — and how many **lines** you
    buy; it renders `round(odds / lines)` dots, one red (your win) and the rest
    white, so the odds are something you can *see*. Each selection is annotated
    with what you'd win and how that game's multiplier changes it (Powerball
    **Power Play**, Mega Millions' always-on **built-in multiplier**, Lotto
    America **All Star Bonus**; multiplier metadata lives in `data.json`). Uses
    vertically tiled canvases that draw lazily as they scroll into view (and
    free off-screen tiles), so it stays responsive from ten dots up to ~292M.
    Dot size adapts to the count, and a "Find the winning dot" button scrolls
    to and rings the red one. Optional query params: `&tier=<match>` (or `any`)
    and `&lines=<n>`.
  - `history.html` / `history.js` — historical data page for **all three games**
    (`history.html?game=<key>`, linked from each detail page). Reads
    `history/<game>.json` and shows a jackpot &amp; cash-value line chart over
    time with an **adjustable date range** (date pickers + All/5Y/1Y/6M/90D
    presets), summary stats, and a lazy-loading per-draw table whose rows expand
    to the prize-tier winner breakdown. An inline Chart.js plugin draws dashed
    **ticket-price-change markers** (per-game `priceChanges` in `GAME_META`).
  - `common.js` — shared helpers/metadata used by all pages (no duplication).

### Historical data pipeline

`scraper/history_scraper.py --game <key>` builds `history/<game>.json`,
incrementally (keeps existing draws, fetches only missing dates):

- **Lotto America** (2017-11-15+) and **Powerball** (2010-01-01+) — powerball.com
  draw pages (`draw-result?gc=<slug>&date=YYYY-MM-DD`), chosen over
  lottoamerica.com because they archive the **cash value** plus the per-tier
  winners table. Powerball's per-tier breakdown only aligns for the current
  matrix (2015-10-07+); older draws are jackpot/cash/numbers only.
- **Mega Millions** (2017-10-31+, the floor its data service serves) — the
  megamillions.com JSON web service `GetDrawDataByTickWithMatrix` (the page is
  JS-rendered). Gives numbers + jackpot + cash; no per-tier breakdown.

Price-change markers: Powerball $1→$2 (Jan 15 2012), Mega $2→$5 (Apr 8 2025).

- **First-time backfill**: run the **Backfill draw history** workflow
  (`.github/workflows/backfill-history.yml`, manual dispatch) — pick a `game`
  (or `all`). Powerball ~1,900 draws, Mega ~900, Lotto ~1,345.
- **Stay current**: `update-data.yml` appends the newest draw for all three
  after each drawing. Each `history/<game>.json` ships seeded with a few real
  draws so the pages work before the backfill runs.

## Expected value

EV is the cents of value returned per $1 spent, summed across the **whole prize
structure** and split into jackpot vs. smaller-prize contributions:

```
per ticket, pre-tax:
  jackpot   = cash_value / odds_jackpot
  secondary = multiplier × Σ (prize_i / odds_i)   over every fixed lower tier

value/$ = TAX_FACTOR × (jackpot + secondary) / ticket_price
```

- `TAX_FACTOR = 0.63` — a tax haircut (37% federal + ~26% blended state),
  applied to all winnings since they're all taxable income.
- The fixed lower-tier prizes and their odds live in `CONFIG[...]["prize_tiers"]`
  in `scrape.py` (static facts, sourced from each game's official prize chart).
- `multiplier` is 1 for Powerball/Lotto America. **Mega Millions** always applies
  a random 2×–10× multiplier to non-jackpot prizes; its expected value is ~3.0,
  so `prize_multiplier: 3.0` scales the secondary tiers.

Including secondary prizes matters a lot: it roughly doubles Powerball
(13.7¢ → ~23.8¢) and more than doubles Mega Millions (8.0¢ → ~22.4¢, mostly
from the multiplier), narrowing what used to look like a wide gap. Every value
is still far below 100¢ (negative EV), as expected for any lottery.

> **Note on Mega Millions odds:** the current matrix (post-April 2025) is
> 5/70 + Mega Ball 1–24, jackpot **1 in 290,472,336** — not the 302,575,350
> (old 1–25 matrix) figure that appeared in the original brief.

## Running locally

The frontend uses `fetch('./data.json')`, which browsers block over `file://`.
Serve the folder over HTTP:

```bash
# Python 3 (once installed):
python -m http.server 8000
# then open http://localhost:8000
```

To run the scraper locally you need Python 3 with the dependencies:

```bash
pip install -r scraper/requirements.txt
python scraper/scrape.py
```

> **Heads up:** this machine currently only has the Microsoft Store *python*
> stub on PATH (no real interpreter). Install Python from python.org to run the
> scraper locally. It runs fine in GitHub Actions regardless.

## Automated updates

`.github/workflows/update-data.yml` runs the scraper on a cron after each draw,
then commits `data.json` if it changed. Cron is in **UTC**, and because draws
happen at ~11pm ET they land on the *next* UTC day:

| Games                       | Draw (ET)              | Cron (UTC)            |
| --------------------------- | ---------------------- | --------------------- |
| Mega Millions               | Tue/Fri 11:00pm        | `30 4 * * 3,6`        |
| Powerball + Lotto America   | Mon/Wed/Sat 10:59pm    | `30 4 * * 2,4,0`      |

Enable it by pushing this repo to GitHub; the workflow has `contents: write`
permission to push the updated JSON. You can also trigger it manually from the
Actions tab (`workflow_dispatch`).

## Robustness

The scraper degrades gracefully: each game is scraped independently, and if a
site changes or a field can't be parsed (or winning numbers fail range
validation), the previous value in `data.json` is preserved rather than
overwritten with garbage.

## Status / TODO

- [ ] **Verify live selectors** — the scraper hasn't been run against the live
      sites yet. Confirm jackpot/cash parsing and the `[class*="ball"]` number
      extraction on first run, and adjust selectors if the markup differs.
- [ ] State-lottery comparison table (Phase 1 stretch goal).
- [ ] Historical prize charts (Phase 2).

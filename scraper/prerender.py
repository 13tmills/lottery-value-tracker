#!/usr/bin/env python3
"""
prerender.py — generate RICH STATIC pages for the national games so crawlers (and
the AdSense content review) see substantial unique content in the HTML instead of a
~20-word JavaScript shell. Reads data.json + history/<key>.json + split_risk.json and
writes game/<key>.html. Mirrors scraper/gen_game_pages.ps1; run in CI after split_risk.py.
"""
from __future__ import annotations

import json
import os
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

META = {
    "powerball": {"label": "Powerball", "matrix": "5 of 69 white balls plus 1 of 26 red Power Balls",
                  "draws": "Monday, Wednesday and Saturday", "sabbr": "PB", "skey": "powerball"},
    "mega_millions": {"label": "Mega Millions", "matrix": "5 of 70 white balls plus 1 of 24 gold Mega Balls",
                      "draws": "Tuesday and Friday", "sabbr": "MB", "skey": "mega_ball"},
    "lotto_america": {"label": "Lotto America", "matrix": "5 of 52 white balls plus 1 of 10 Star Balls",
                      "draws": "Monday, Wednesday and Saturday", "sabbr": "SB", "skey": "star_ball"},
}


def load(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def money(n):
    if n is None:
        return "-"
    if n >= 1e9:
        return f"${round(n / 1e9, 2)}B"
    if n >= 1e6:
        return f"${round(n / 1e6, 1)}M"
    return "$" + f"{int(n):,}"


def odds(n):
    return "1 in " + f"{int(n):,}"


def datelong(iso):
    try:
        return datetime.strptime(str(iso)[:10], "%Y-%m-%d").strftime("%B %-d, %Y")
    except Exception:
        try:
            return datetime.strptime(str(iso)[:10], "%Y-%m-%d").strftime("%B %d, %Y")
        except Exception:
            return str(iso)


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def main():
    data = load(os.path.join(ROOT, "data.json"))
    sr = None
    srp = os.path.join(ROOT, "split_risk.json")
    if os.path.exists(srp):
        sr = load(srp)
    os.makedirs(os.path.join(ROOT, "game"), exist_ok=True)

    games = data.get("games", {})
    ranked = sorted([k for k in META if k in games],
                    key=lambda k: -float(games[k].get("expected_value") or 0))
    rank_word = {ranked[i]: ["the best value", "the second-best value", "the lowest value"][i]
                 for i in range(len(ranked))}

    for key, m in META.items():
        g = games.get(key)
        if not g:
            continue
        label = m["label"]
        evc = round(float(g.get("expected_value") or 0) * 100, 1)
        price = float(g.get("ticket_price") or 1)
        back = round(100 - evc)

        intro = (
            f"{label} is a {m['matrix']} draw game, held every {m['draws']}. As of the latest update its "
            f"advertised jackpot is <strong>{money(g.get('jackpot'))}</strong> (a cash value of about "
            f"{money(g.get('cash_value'))}), and the odds of matching all six numbers are "
            f"<strong>{odds(g['odds_jackpot'])}</strong>. Run the real expected-value math and a "
            f"${int(price)} ticket is worth about <strong>{evc}&cent; per dollar</strong> at this jackpot "
            f"&mdash; meaning roughly {back}&cent; of every dollar is the house edge. Among the three national "
            f"games, that is currently <strong>{rank_word.get(key, 'notable')}</strong>. Like every lottery game "
            f"it is a negative-expected-value bet by design; these figures simply show which is least bad, and by how much."
        )

        tier_rows = "\n".join(
            f"<tr><td>{esc(t.get('match'))}</td><td>{money(t.get('prize'))}</td><td>{odds(t['odds'])}</td></tr>"
            for t in g.get("prize_tiers", []))

        # recent results
        recent_rows = ""
        hp = os.path.join(ROOT, "history", f"{key}.json")
        n_recent = 0
        if os.path.exists(hp):
            draws = (load(hp).get("draws") or [])[-12:][::-1]
            n_recent = len(draws)
            for dr in draws:
                nums = ", ".join(str(x) for x in (dr.get("numbers") or []))
                sp = f" &nbsp;<strong>{m['sabbr']} {dr[m['skey']]}</strong>" if dr.get(m["skey"]) is not None else ""
                jp = money(dr["jackpot"]) if dr.get("jackpot") else "-"
                recent_rows += f"<tr><td>{datelong(dr.get('date'))}</td><td>{nums}{sp}</td><td>{jp}</td></tr>\n"

        # split-risk snapshot
        sr_block = ""
        srg = (sr.get("games", {}).get(key) if sr else None)
        if srg and srg.get("upcoming"):
            u = srg["upcoming"]
            el = u.get("est_lines") or 0
            tk = f"{round(el / 1e6, 1)} million" if el >= 1e6 else f"{int(el):,}"
            pw = round((u.get("p_win") or 0) * 100, 1)
            ps = round((u.get("p_split_if_won") or 0) * 100, 1)
            sr_block = (
                '\n    <section class="panel">\n'
                f'      <h2>Will the {label} jackpot be won or split?</h2>\n'
                f'      <p>Using the number of lower-tier winners each recent draw produced, we estimate about '
                f'<strong>~{tk} tickets</strong> are in play at the current jackpot &mdash; roughly a '
                f'<strong>{pw}% chance</strong> that someone wins the jackpot, and a <strong>{ps}% chance</strong> '
                f'it would be split between multiple winners if it is hit. These are estimates from past draws of a '
                f'similar size, not predictions; every draw is independent. '
                f'<a href="splitrisk.html">See the full split-risk breakdown &rarr;</a></p>\n    </section>\n')

        last_nums = ", ".join(str(x) for x in (g.get("winning_numbers") or []))
        last_sp = f" &nbsp;<strong>{m['sabbr']} {g[m['skey']]}</strong>" if g.get(m["skey"]) is not None else ""
        title = f"{label} &mdash; Expected Value, Odds &amp; Latest Results | NumbersIntel"
        desc = (f"{label} expected value, exact jackpot odds ({odds(g['odds_jackpot'])}), the full prize-tier table "
                f"and recent winning numbers &mdash; with the real EV math showing what a ${int(price)} ticket is actually worth.")

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/svg+xml" href="favicon.svg" />
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1281838483505325" crossorigin="anonymous"></script>
  <script src="analytics.js"></script>
  <base href="/" />
  <script defer src="nav.js"></script>
  <title>{title}</title>
  <meta name="description" content="{esc(desc)}" />
  <link rel="canonical" href="https://numbersintel.com/game/{key}.html" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="NumbersIntel" />
  <meta property="og:title" content="{esc(label)} &mdash; Expected Value, Odds &amp; Results" />
  <meta property="og:description" content="{esc(desc)}" />
  <meta property="og:url" content="https://numbersintel.com/game/{key}.html" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="detail-header">
    <a class="back-link" href="national.html">&larr; US National Drawings</a>
    <h1>{label}</h1>
    <p class="tagline">Expected value, exact odds, the full prize table and the latest winning numbers.</p>
  </header>

  <main class="detail">
    <section class="prose"><p>{intro}</p></section>

    <section class="panel">
      <h2>Latest winning numbers</h2>
      <p style="font-size:1.15rem"><strong>{last_nums}</strong>{last_sp}</p>
      <p class="section-note">Most recent draw. Next drawing: {datelong(g.get('next_draw'))}.</p>
    </section>

    <section class="panel">
      <h2>{label} by the numbers</h2>
      <div class="stat-strip">
        <div class="stat"><div class="stat__label">Jackpot</div><div class="stat__value">{money(g.get('jackpot'))}</div></div>
        <div class="stat"><div class="stat__label">Cash value</div><div class="stat__value">{money(g.get('cash_value'))}</div></div>
        <div class="stat"><div class="stat__label">Jackpot odds</div><div class="stat__value">{odds(g['odds_jackpot'])}</div></div>
        <div class="stat"><div class="stat__label">Value per $1</div><div class="stat__value">{evc}&cent;</div></div>
      </div>
      <p class="section-note">"Value per $1" is the expected value: sum every prize tier times its probability, after an
        assumed tax haircut, divided by the ticket price. It is always below $1 &mdash; the lottery is negative-EV by design.</p>
    </section>

    <section class="panel">
      <h2>{label} prize tiers &amp; odds</h2>
      <div class="sr-table-wrap"><table class="sr-table">
        <thead><tr><th scope="col">Match</th><th scope="col">Prize</th><th scope="col">Odds</th></tr></thead>
        <tbody>
{tier_rows}
        </tbody>
      </table></div>
    </section>
{sr_block}
    <section class="panel">
      <h2>Recent {label} results</h2>
      <div class="sr-table-wrap"><table class="sr-table">
        <thead><tr><th scope="col">Draw date</th><th scope="col">Numbers</th><th scope="col">Jackpot</th></tr></thead>
        <tbody>
{recent_rows}
        </tbody>
      </table></div>
      <p class="section-note">A rolling window of recent draws. Number-frequency history and interactive charts are on the
        <a href="game.html?game={key}">interactive {label} page</a>.</p>
    </section>

    <section class="prose">
      <h2>How we compute {label}'s value</h2>
      <p>Every figure here comes from official sources and the game's published prize structure, refreshed after each
        drawing. The odds are computed from the number matrix ({m['matrix']}); the expected value sums each prize tier
        against its probability after an assumed tax rate. We document the full method on our
        <a href="methodology.html">methodology page</a>. For the ideas behind these numbers, see
        <a href="guides/what-is-lottery-expected-value/">what expected value means</a>,
        <a href="guides/lottery-odds-explained/">how the odds work</a>, and
        <a href="guides/lump-sum-vs-annuity/">lump sum vs annuity</a> if you are weighing how to take a jackpot.</p>
      <p>Useful tools for {label}: the <a href="breakeven.html?game={key}">break-even calculator</a> (how big the jackpot
        must get before a ticket is a fair bet), the <a href="statetax.html">tax &amp; payout calculator</a>, the
        <a href="visualizer.html?game={key}">odds visualizer</a>, and <a href="check.html?game={key}">check my numbers</a>.</p>
    </section>

    <p class="disclaimer">
      NumbersIntel is independent and informational only &mdash; not financial, legal or gambling advice. The lottery is a
      negative-expected-value game; play for entertainment, never as an investment. You must be 18+ (21+ in some states).
      If gambling is a problem for you or someone you know, call <strong>1-800-GAMBLER</strong>.
    </p>
  </main>

  <footer class="site-footer">
    <nav class="footer-nav">
      <a href="index.html">Home</a>
      <a href="national.html">US National Drawings</a>
      <a href="states.html">US State Drawings</a>
      <a href="splitrisk.html">Split-risk tracker</a>
      <a href="methodology.html">Methodology</a>
      <a href="about.html">About</a>
    </nav>
    <p>For information and entertainment only &mdash; not financial or gambling advice.</p>
  </footer>
</body>
</html>
"""
        out = os.path.join(ROOT, "game", f"{key}.html")
        with open(out, "w", encoding="utf-8") as f:
            f.write(html)
        words = len(html.replace("<", " <").split())
        print(f"[prerender] game/{key}.html ({words} tokens, {len(g.get('prize_tiers', []))} tiers, {n_recent} recent)")


if __name__ == "__main__":
    main()

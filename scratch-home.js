// Homepage scratch-value module. Complements the draw-game value ranking above it:
// that one answers "which draw game is the least-bad bet tonight", this one answers
// "what are scratch tickets actually worth, and what's already gone".
//
// Reads scratch_summary.json — a small (~2KB) cross-state roll-up built by
// scraper/gen_scratch_pages.ps1 — so the homepage never fetches 22 state files.
(function () {
  const host = document.getElementById("scratch-home");
  if (!host) return;

  const pct = (v) => Math.round(v * 100) + "%";
  const money = (n) =>
    n >= 1e9 ? "$" + (n / 1e9).toFixed(1) + "bn"
      : n >= 1e6 ? "$" + Math.round(n / 1e6) + "m"
        : "$" + n.toLocaleString();

  // Same thresholds the state pages use, so a colour means the same thing sitewide.
  const cls = (v) => (v >= 0.75 ? "sc-good" : v >= 0.65 ? "sc-mid" : "sc-bad");

  fetch("scratch_summary.json", { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => {
      const bands = (d.by_price || []).filter((b) => b.games >= 5);
      if (bands.length < 3) { host.remove(); return; }

      // Compare the cheapest band against the BEST-paying one, not simply the
      // dearest: the $100 band is thin and sometimes dips below $50, and quoting
      // a gap against a band that isn't the peak reads as an error.
      const cheap = bands[0];
      const dear = bands.reduce((a, b) => (b.ev_now > a.ev_now ? b : a), bands[0]);
      const gap = Math.round((dear.ev_now - cheap.ev_now) * 100);

      const ladder = bands.map((b) => `<tr>
          <th scope="row">$${b.price}</th>
          <td>${b.games}</td>
          <td class="${cls(b.ev_now)}"><strong>${pct(b.ev_now)}</strong></td>
          <td class="sc-barcell"><span class="sc-bar" style="width:${Math.round(b.ev_now * 100)}%"></span></td>
        </tr>`).join("");

      const spread = d.band_spread;
      const spreadNote = spread && spread.best && spread.worst
        ? `<p class="section-note">Price isn't the whole story. Among the ${spread.games}
             <strong>$${spread.price}</strong> games on sale right now, the weakest returns
             ${pct(spread.worst.ev_now)} per dollar and the strongest ${pct(spread.best.ev_now)} &mdash;
             a ${Math.round((spread.best.ev_now - spread.worst.ev_now) * 100)}-point gap between two
             tickets that cost the same.
             <a href="guides/scratch-ticket-price-vs-game-choice/">Which matters more?</a></p>`
        : "";

      host.innerHTML = `
        <h2 class="home-section-h">Scratch tickets: what they're actually worth</h2>
        <div class="sr-cards">
          <div class="sr-card">
            <div class="sr-card__game">Cheapest tickets return</div>
            <div class="sr-card__jackpot ${cls(cheap.ev_now)}">${pct(cheap.ev_now)}</div>
            <p class="sr-card__interp">per $1 on $${cheap.price} games &mdash; ${gap} points worse than
              $${dear.price} games, across ${d.games_priced.toLocaleString()} games in
              ${d.states_priced} states.</p>
          </div>
          <div class="sr-card">
            <div class="sr-card__game">Top prize already gone</div>
            <div class="sr-card__jackpot sc-bad">${d.no_top_prize} games</div>
            <p class="sr-card__interp">still on sale at full price with every headline prize claimed &mdash;
              ${money(d.no_top_prize_value)} of advertised prizes that no longer exist.</p>
          </div>
          <div class="sr-card">
            <div class="sr-card__game">States tracked</div>
            <div class="sr-card__jackpot">${d.states}</div>
            <p class="sr-card__interp">every game ranked by what it returns per dollar
              <em>today</em>, from each state's own prize data, refreshed daily.</p>
          </div>
        </div>

        <section class="panel">
          <h3>What a scratch ticket returns, by price</h3>
          <p class="section-note">Average value returned per dollar, pooled across
            ${d.states_priced} states that publish full prize tables. Games more than 90% sold are
            excluded &mdash; their figures swing on very few remaining prizes.</p>
          <div class="sr-table-wrap"><table class="sr-table">
            <thead><tr><th scope="col">Ticket price</th><th scope="col">Games</th>
              <th scope="col">Avg value per $1</th><th scope="col"></th></tr></thead>
            <tbody>${ladder}</tbody>
          </table></div>
          ${spreadNote}
          <p class="section-note"><strong>Every one of these is a losing bet.</strong> A higher
            percentage is a slower loss, not a profit &mdash; and an expensive ticket risks far more per
            purchase. See <a href="scratch/">your state's games</a> or
            <a href="guides/cheap-vs-expensive-scratch-tickets/">the full analysis</a>.</p>
        </section>`;
    })
    .catch(() => { host.remove(); });
})();

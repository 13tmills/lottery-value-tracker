// Homepage live hooks. Everything else on the page is static (crawlable) HTML;
// this only fills the live bits: the "best value" hero, the national jackpot strip,
// and the National-Drawings widget stat. Loads data.json once.
const NATL_LABELS = { powerball: "Powerball", mega_millions: "Mega Millions", lotto_america: "Lotto America" };

function renderJackpotStrip(data) {
  const slot = document.getElementById("jackpot-strip");
  if (!slot || !data || !data.games) return;
  const cards = Object.keys(NATL_LABELS)
    .filter((k) => data.games[k] && data.games[k].jackpot)
    .map((k) => {
      const g = data.games[k];
      const next = g.next_draw ? fmtDate(g.next_draw) : "soon";
      return `<a class="jackpot-card" href="game.html?game=${k}">
          <span class="jackpot-card__game">${NATL_LABELS[k]}</span>
          <span class="jackpot-card__amt">${fmtMoney(g.jackpot)}</span>
          <span class="jackpot-card__draw">Next draw &middot; ${next}</span>
        </a>`;
    }).join("");
  if (cards) slot.innerHTML = cards;
}

loadData()
  .then((data) => {
    renderJackpotStrip(data);
    renderNationalBestValue(data); // hero hook: best value across every game on the site
    const entries = Object.entries(data.games)
      .sort((a, b) => (b[1].expected_value || 0) - (a[1].expected_value || 0));
    const stat = document.getElementById("nat-stat");
    if (entries.length && stat) {
      const [key, g] = entries[0];
      const label = NATL_LABELS[key] || (typeof GAME_META !== "undefined" && GAME_META[key] && GAME_META[key].label) || key;
      const cents = ((g.expected_value || 0) * 100).toFixed(1);
      stat.innerHTML = `Best value right now: <b>${label}</b> at ${cents}&cent; per $1`;
    }
  })
  .catch(() => {
    const stat = document.getElementById("nat-stat");
    if (stat) stat.textContent = "Powerball, Mega Millions & Lotto America, ranked by expected value.";
  });

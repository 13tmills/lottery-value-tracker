// Landing page widgets. Keep it light — just a live "best value" hook for the
// National Drawings widget. More to come.
loadData()
  .then((data) => {
    renderNationalBestValue(data); // hero hook: best value across every game on the site
    const entries = Object.entries(data.games)
      .filter(([key]) => GAME_META[key])
      .sort((a, b) => b[1].expected_value - a[1].expected_value);
    const stat = document.getElementById("nat-stat");
    if (entries.length && stat) {
      const [key, g] = entries[0];
      const cents = (g.expected_value * 100).toFixed(1);
      stat.innerHTML = `Best value right now: <b>${GAME_META[key].label}</b> at ${cents}&cent; per $1`;
    }
  })
  .catch(() => {
    const stat = document.getElementById("nat-stat");
    if (stat) stat.textContent = "Four national games, ranked by expected value.";
  });

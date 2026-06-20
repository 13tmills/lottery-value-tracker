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
  subEl.textContent = "Results, odds, expected value & number frequency — coming soon.";
  setMeta({
    title: `${s.name} Lottery — Results, Odds & Expected Value | NumbersIntel`,
    description: `${s.name} lottery results, odds, expected value, and hot & cold number frequency — the NumbersIntel analytics treatment, coming soon for ${s.name}'s games.`,
    url: `${SITE}/state.html?state=${s.abbr}`,
  });
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

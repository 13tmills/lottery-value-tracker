// Hot & cold number tracker. Reads history/<game>.json and shows how often each
// number has been drawn (frequency) and how long since each last appeared
// (overdue). Number ranges are derived from the data so matrix changes over the
// years are handled automatically.

const els = {};
let meta = null;
const charts = [];

function param(name) {
  return new URLSearchParams(location.search).get(name);
}

// Tally counts and "draws since last seen" for a pool of numbers.
function analyze(draws, pick, minN = 1) {
  let max = 0;
  draws.forEach((d) => pick(d).forEach((n) => { if (n > max) max = n; }));
  const count = Array(max + 1).fill(0);
  const lastSeen = Array(max + 1).fill(-1);
  draws.forEach((d, i) => pick(d).forEach((n) => { count[n]++; lastSeen[n] = i; }));

  const total = draws.length;
  const rows = [];
  for (let n = minN; n <= max; n++) {
    rows.push({ n, count: count[n], overdue: lastSeen[n] < 0 ? total : total - 1 - lastSeen[n] });
  }
  return { max, total, rows };
}

async function init() {
  els.title = document.getElementById("nums-title");
  els.sub = document.getElementById("nums-sub");
  els.back = document.getElementById("back");
  els.summary = document.getElementById("summary");
  els.hot = document.getElementById("hot");
  els.overdue = document.getElementById("overdue");
  els.whiteNote = document.getElementById("white-note");
  els.specialH2 = document.getElementById("special-h2");
  els.caveat = document.getElementById("caveat");
  els.main = document.getElementById("nums");

  const key = param("game") || "lotto_america";
  meta = GAME_META[key];
  if (!meta) {
    els.title.textContent = "Not available";
    els.main.innerHTML = `<div class="error">No data for "${key}".</div>`;
    return;
  }
  els.back.href = `game.html?game=${key}`;
  els.back.textContent = `← Back to ${meta.label}`;
  els.title.textContent = `${meta.label} hot & cold numbers`;
  els.specialH2.textContent = `${meta.specialName} frequency`;
  setMeta({
    title: `${meta.label} Hot & Cold Numbers — Most & Least Drawn | NumbersIntel`,
    description: `The most and least frequently drawn ${meta.label} numbers, plus the most overdue, with full frequency charts based on every past draw.`,
    url: `${SITE}/numbers.html?game=${key}`,
  });

  try {
    const res = await fetch(`./history/${key}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const draws = (data.draws || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    if (!draws.length) throw new Error("no draws yet");
    render(key, draws);
  } catch (err) {
    els.sub.textContent = "";
    els.main.insertAdjacentHTML("afterbegin",
      `<div class="error">Couldn't load history (${err.message}). The full archive backfills in CI.</div>`);
    console.error(err);
  }
}

function render(key, draws) {
  const white = analyze(draws, (d) => d.numbers || [], meta.digits ? 0 : 1);
  const special = analyze(draws, (d) => (d[meta.specialKey] != null ? [d[meta.specialKey]] : []));

  els.sub.textContent = `Based on ${white.total.toLocaleString()} draws · ${fmtDate(draws[0].date)} – ${fmtDate(draws.at(-1).date)}`;

  const hottest = [...white.rows].sort((a, b) => b.count - a.count)[0];
  const overdue = [...white.rows].sort((a, b) => b.overdue - a.overdue)[0];
  els.summary.innerHTML = [
    ["Draws analyzed", white.total.toLocaleString()],
    ["Hottest number", `${hottest.n}`],
    ["Drawn", `${hottest.count}×`],
    ["Most overdue", `${overdue.n} (${overdue.overdue} draws)`],
  ].map(([l, v]) => `<div class="stat"><div class="stat__label">${l}</div><div class="stat__value">${v}</div></div>`).join("");

  renderList(els.hot, [...white.rows].sort((a, b) => b.count - a.count).slice(0, 8), white.rows, "count", (r) => `${r.count}×`);
  renderList(els.overdue, [...white.rows].sort((a, b) => b.overdue - a.overdue).slice(0, 8), white.rows, "overdue", (r) => `${r.overdue} draws`);

  els.whiteNote.textContent = meta.digits
    ? `How many times each digit (0–9) has been drawn across ${white.total.toLocaleString()} draws.`
    : `How many times each ball (1–${white.max}) has been drawn across ${white.total.toLocaleString()} draws.`;
  renderBars("white-chart", white, hottest.n);
  if (special.max > 0) {
    renderBars("special-chart", special, [...special.rows].sort((a, b) => b.count - a.count)[0]?.n);
  } else {
    document.getElementById("special-chart")?.closest(".panel")?.remove();
  }

  els.caveat.textContent =
    "Past frequency is just history. Lottery draws are independent, so every number is equally likely on the next draw — this is for curiosity, not strategy.";
}

function renderList(host, top, allRows, field, label) {
  const maxVal = Math.max(...allRows.map((r) => r[field]), 1);
  host.innerHTML = top.map((r) => `
    <div class="freq-row">
      <span class="ball ball--sm">${r.n}</span>
      <span class="freq-bar"><span class="freq-bar__fill" style="width:${(r[field] / maxVal) * 100}%"></span></span>
      <span class="freq-val">${label(r)}</span>
    </div>`).join("");
}

function renderBars(canvasId, data, highlightN) {
  const t = theme();
  const labels = data.rows.map((r) => r.n);
  const counts = data.rows.map((r) => r.count);
  charts.push(new Chart(document.getElementById(canvasId), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: counts,
        backgroundColor: data.rows.map((r) => (r.n === highlightN ? t.accent : t.accent2)),
        borderRadius: 2,
        maxBarThickness: 22,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: (i) => `Number ${i[0].label}`, label: (c) => `Drawn ${c.parsed.y}× of ${data.total}` } },
      },
      scales: {
        x: { ticks: { color: t.textDim, autoSkip: true, maxTicksLimit: 20, maxRotation: 0 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: t.textDim, precision: 0 }, grid: { color: t.border } },
      },
    },
  }));
}

init();

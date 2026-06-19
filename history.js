// Historical data page (Lotto America for now). Loads history/<game>.json,
// draws a jackpot/cash-value-over-time chart with an adjustable date range,
// and a per-draw table with expandable prize-tier winner breakdowns.

const els = {};
let chart = null;
let all = [];          // every draw, ascending by date
let meta = null;

function param(name) {
  return new URLSearchParams(location.search).get(name);
}

const fmtNum = (n) => n.toLocaleString();

async function init() {
  els.title = document.getElementById("hist-title");
  els.sub = document.getElementById("hist-sub");
  els.back = document.getElementById("back");
  els.from = document.getElementById("from");
  els.to = document.getElementById("to");
  els.presets = document.getElementById("presets");
  els.chartNote = document.getElementById("chart-note");
  els.summary = document.getElementById("summary");
  els.rows = document.getElementById("rows");
  els.main = document.getElementById("hist");

  const key = param("game") || "lotto_america";
  meta = GAME_META[key];
  if (!meta) {
    els.title.textContent = "Not available";
    els.main.innerHTML = `<div class="error">No historical data for "${key}".</div>`;
    return;
  }
  els.back.href = `game.html?game=${key}`;
  els.back.textContent = `← Back to ${meta.label}`;
  els.title.textContent = `${meta.label} — historical data`;

  try {
    const res = await fetch(`./history/${key}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    all = (data.draws || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    if (!all.length) throw new Error("no draws yet");

    const span = `${fmtDate(all[0].date)} – ${fmtDate(all.at(-1).date)}`;
    els.sub.textContent = `${all.length.toLocaleString()} draws · ${span}` +
      (data.complete ? "" : " · seed sample (full history backfilled in CI)");

    els.from.min = els.to.min = all[0].date;
    els.from.max = els.to.max = all.at(-1).date;
    els.from.value = all[0].date;
    els.to.value = all.at(-1).date;

    els.from.addEventListener("change", apply);
    els.to.addEventListener("change", apply);
    els.presets.addEventListener("click", onPreset);

    apply();
  } catch (err) {
    els.sub.textContent = "";
    els.main.querySelector(".hist-chart")?.closest(".panel")?.insertAdjacentHTML(
      "beforebegin",
      `<div class="error">Couldn't load history (${err.message}). Serve over HTTP, e.g.
       <code>python -m http.server</code>.</div>`
    );
    console.error(err);
  }
}

function onPreset(e) {
  const btn = e.target.closest("[data-range]");
  if (!btn) return;
  const last = all.at(-1).date;
  if (btn.dataset.range === "all") {
    els.from.value = all[0].date;
  } else {
    const days = +btn.dataset.range;
    const d = new Date(last + "T00:00:00");
    d.setDate(d.getDate() - days);
    const iso = d.toISOString().slice(0, 10);
    els.from.value = iso < all[0].date ? all[0].date : iso;
  }
  els.to.value = last;
  setActivePreset(btn);
  apply();
}

function setActivePreset(btn) {
  els.presets.querySelectorAll(".chip").forEach((c) => c.classList.toggle("chip--on", c === btn));
}

function filtered() {
  const from = els.from.value;
  const to = els.to.value;
  return all.filter((d) => d.date >= from && d.date <= to);
}

function apply() {
  const draws = filtered();
  renderChart(draws);
  renderSummary(draws);
  renderTable(draws);
}

function renderChart(draws) {
  const t = theme();
  const labels = draws.map((d) => d.date);
  const jackpot = draws.map((d) => d.jackpot ?? null);
  const cash = draws.map((d) => d.cash_value ?? null);

  els.chartNote.textContent = draws.length
    ? `${draws.length.toLocaleString()} draws shown. Jackpot climbs each draw until won, then resets — the saw-tooth is the accumulation.`
    : "No draws in this range.";

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("hist-chart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Jackpot", data: jackpot, borderColor: t.accent, backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: 0.1, spanGaps: true },
        { label: "Cash value", data: cash, borderColor: t.accent2, backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: 0.1, spanGaps: true },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: t.textDim, usePointStyle: true, pointStyle: "line" } },
        tooltip: {
          callbacks: {
            title: (items) => (items.length ? fmtDate(items[0].label) : ""),
            label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? "—" : fmtMoney(c.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: t.textDim, maxTicksLimit: 12, autoSkip: true, maxRotation: 0 }, grid: { display: false } },
        y: {
          ticks: { color: t.textDim, callback: (v) => fmtMoney(v) },
          grid: { color: t.border },
        },
      },
    },
  });
}

function renderSummary(draws) {
  if (!draws.length) {
    els.summary.innerHTML = `<div class="stat"><div class="stat__label">No draws</div><div class="stat__value">—</div></div>`;
    return;
  }
  const peak = draws.reduce((m, d) => (d.jackpot > m.jackpot ? d : m), draws[0]);
  const withWinners = draws.filter((d) => d.prizes);
  const stats = [
    ["Draws shown", draws.length.toLocaleString()],
    ["Date range", `${fmtDate(draws[0].date)} – ${fmtDate(draws.at(-1).date)}`],
    ["Peak jackpot", `${fmtMoney(peak.jackpot)}`],
    ["On", fmtDate(peak.date)],
  ];
  els.summary.innerHTML = stats
    .map(([label, value]) => `<div class="stat"><div class="stat__label">${label}</div><div class="stat__value">${value}</div></div>`)
    .join("");
}

function prizeLabel(match) {
  if (match === `5+${meta.specialAbbr}`) return `Jackpot (5 + ${meta.specialName})`;
  return tierLabel(match, meta);
}

function renderTable(draws) {
  // Most recent first.
  const rows = draws.slice().reverse();
  els.rows.innerHTML = rows
    .map((d, i) => {
      const balls = d.numbers.map((n) => `<span class="ball ball--sm">${n}</span>`).join("") +
        (d.star_ball != null ? `<span class="ball ball--sm ball--special">${d.star_ball}</span>` : "");
      const winners = d.prizes
        ? `<button class="winners-toggle" data-i="${i}">${(d.total_winners ?? d.prizes.reduce((s, p) => s + p.winners, 0)).toLocaleString()} ▾</button>`
        : `<span class="muted">—</span>`;
      const detail = d.prizes ? prizeDetailRow(d, i) : "";
      return `
        <tr>
          <td>${fmtDate(d.date)}</td>
          <td><div class="numbers numbers--row">${balls}</div></td>
          <td class="num">${fmtMoney(d.jackpot)}</td>
          <td class="num">${d.cash_value != null ? fmtMoney(d.cash_value) : "<span class='muted'>—</span>"}</td>
          <td class="num">${winners}</td>
        </tr>
        ${detail}`;
    })
    .join("");

  els.rows.querySelectorAll(".winners-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = document.getElementById(`detail-${btn.dataset.i}`);
      if (row) row.hidden = !row.hidden;
    });
  });
}

function prizeDetailRow(d, i) {
  const bonus = d.all_star_bonus ? ` · All Star Bonus ${d.all_star_bonus}×` : "";
  const tiers = d.prizes
    .map(
      (p) => `<tr>
        <td>${prizeLabel(p.match)}</td>
        <td class="num">$${p.prize.toLocaleString()}</td>
        <td class="num">${p.winners.toLocaleString()}</td>
      </tr>`
    )
    .join("");
  return `
    <tr id="detail-${i}" class="detail-row" hidden>
      <td colspan="5">
        <div class="prize-breakdown">
          <p class="muted">Winners by tier${bonus}</p>
          <table class="tier-table">
            <thead><tr><th>Tier</th><th class="num">Prize</th><th class="num">Winners</th></tr></thead>
            <tbody>${tiers}</tbody>
          </table>
        </div>
      </td>
    </tr>`;
}

init();

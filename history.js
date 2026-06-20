// Historical data page (Lotto America for now). Loads history/<game>.json,
// draws a jackpot/cash-value-over-time chart with an adjustable date range,
// and a per-draw table with expandable prize-tier winner breakdowns.

const els = {};
let chart = null;
let all = [];          // every draw, ascending by date
let meta = null;
let hasJackpot = true; // some games (state games) have no jackpot/cash — chart hidden

// Lazy table rendering
const TABLE_BATCH = 60;
let tableRows = [];    // current filtered draws, most-recent-first
let tableRendered = 0;
let rowObserver = null;

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
  els.sentinel = document.getElementById("rows-sentinel");
  els.main = document.getElementById("hist");

  // Toggle prize breakdowns via delegation (survives lazy row appends).
  els.rows.addEventListener("click", (e) => {
    const btn = e.target.closest(".winners-toggle");
    if (!btn) return;
    const row = document.getElementById(`detail-${btn.dataset.id}`);
    if (row) row.hidden = !row.hidden;
  });

  // Append the next batch of rows when the sentinel scrolls into view.
  rowObserver = new IntersectionObserver(
    (entries) => { if (entries.some((en) => en.isIntersecting)) appendRows(); },
    { rootMargin: "800px 0px" }
  );
  rowObserver.observe(els.sentinel);

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
  setMeta({
    title: `${meta.label} Jackpot History & Past Numbers | NumbersIntel`,
    description: `Every ${meta.label} draw: jackpot and cash value over time, winning numbers, and prize-tier winners — with an adjustable date range.`,
    url: `${SITE}/history.html?game=${key}`,
  });

  try {
    const res = await fetch(`./history/${key}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    all = (data.draws || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    if (!all.length) throw new Error("no draws yet");

    hasJackpot = all.some((d) => d.jackpot != null);
    if (!hasJackpot) {
      document.getElementById("hist-chart")?.closest(".panel")?.remove();
      document.querySelector(".hist-table")?.classList.add("hist-table--simple");
    }

    const span = `${fmtDate(all[0].date)} – ${fmtDate(all.at(-1).date)}`;
    const isSeed = all.length < 30; // real backfills are hundreds+; seed files ship ~5 draws
    els.sub.textContent = `${all.length.toLocaleString()} draws · ${span}` +
      (isSeed ? " · seed sample (full history backfilled in CI)" : "");

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
  if (hasJackpot) renderChart(draws);
  renderSummary(draws);
  renderTable(draws);
}

// Inline Chart.js plugin: dashed vertical lines for ticket-price changes.
const priceMarkerPlugin = {
  id: "priceMarkers",
  afterDatasetsDraw(c) {
    const events = c.config.options.plugins.priceMarkers?.events || [];
    const { ctx, chartArea, scales } = c;
    events.forEach((ev) => {
      const x = scales.x.getPixelForValue(ev.at);
      if (x == null || isNaN(x) || x < chartArea.left || x > chartArea.right) return;
      ctx.save();
      ctx.strokeStyle = ev.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ev.color;
      ctx.font = "600 11px -apple-system, system-ui, sans-serif";
      const right = x > chartArea.right - 90;
      ctx.textAlign = right ? "right" : "left";
      ctx.fillText(ev.text, x + (right ? -5 : 5), chartArea.top + 12);
      ctx.restore();
    });
  },
};

function renderChart(draws) {
  const t = theme();
  const labels = draws.map((d) => d.date);
  const jackpot = draws.map((d) => d.jackpot ?? null);
  const cash = draws.map((d) => d.cash_value ?? null);

  // Vertical markers for ticket-price changes within the visible range.
  const first = draws.length ? draws[0].date : null;
  const last = draws.length ? draws[draws.length - 1].date : null;
  const events = (meta.priceChanges || []).flatMap((pc) => {
    if (!first || pc.date < first || pc.date > last) return [];
    const hit = draws.find((d) => d.date >= pc.date);
    return hit ? [{ at: hit.date, text: pc.label, color: "#f0795b" }] : [];
  });

  els.chartNote.textContent = draws.length
    ? `${draws.length.toLocaleString()} draws shown. Jackpot climbs each draw until won, then resets — the saw-tooth is the accumulation.`
      + (events.length ? " Dashed line marks a ticket-price change." : "")
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
        priceMarkers: { events },
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
    plugins: [priceMarkerPlugin],
  });
}

function renderSummary(draws) {
  if (!draws.length) {
    els.summary.innerHTML = `<div class="stat"><div class="stat__label">No draws</div><div class="stat__value">—</div></div>`;
    return;
  }
  const stats = [
    ["Draws shown", draws.length.toLocaleString()],
    ["Date range", `${fmtDate(draws[0].date)} – ${fmtDate(draws.at(-1).date)}`],
  ];
  if (hasJackpot) {
    const peak = draws.reduce((m, d) => (d.jackpot > m.jackpot ? d : m), draws[0]);
    stats.push(["Peak jackpot", fmtMoney(peak.jackpot)], ["On", fmtDate(peak.date)]);
  } else {
    stats.push(["Latest draw", fmtDate(draws.at(-1).date)]);
  }
  els.summary.innerHTML = stats
    .map(([label, value]) => `<div class="stat"><div class="stat__label">${label}</div><div class="stat__value">${value}</div></div>`)
    .join("");
}

function prizeLabel(match) {
  if (match === `5+${meta.specialAbbr}`) return `Jackpot (5 + ${meta.specialName})`;
  return tierLabel(match, meta);
}

function renderTable(draws) {
  // Most recent first; rendered lazily in batches as you scroll.
  tableRows = draws.slice().reverse();
  tableRendered = 0;
  els.rows.innerHTML = "";
  appendRows();
}

function appendRows() {
  if (tableRendered >= tableRows.length) {
    updateSentinel();
    return;
  }
  const next = tableRows.slice(tableRendered, tableRendered + TABLE_BATCH);
  els.rows.insertAdjacentHTML("beforeend", next.map(rowHtml).join(""));
  tableRendered += next.length;
  updateSentinel();
}

function updateSentinel() {
  if (!els.sentinel) return;
  if (!tableRows.length) {
    els.sentinel.textContent = "";
  } else if (tableRendered >= tableRows.length) {
    els.sentinel.textContent = `All ${tableRows.length.toLocaleString()} draws shown`;
  } else {
    els.sentinel.textContent =
      `Showing ${tableRendered.toLocaleString()} of ${tableRows.length.toLocaleString()} — scroll for more`;
  }
}

function rowHtml(d) {
  const special = d[meta.specialKey];
  const balls = d.numbers.map((n) => `<span class="ball ball--sm">${n}</span>`).join("") +
    (special != null ? `<span class="ball ball--sm ball--special">${special}</span>` : "");
  const winners = d.prizes
    ? `<button class="winners-toggle" data-id="${d.date}">${(d.total_winners ?? d.prizes.reduce((s, p) => s + p.winners, 0)).toLocaleString()} ▾</button>`
    : `<span class="muted">—</span>`;
  const detail = d.prizes ? prizeDetailRow(d) : "";
  return `
    <tr>
      <td>${fmtDate(d.date)}</td>
      <td><div class="numbers numbers--row">${balls}</div></td>
      <td class="num">${d.jackpot != null ? fmtMoney(d.jackpot) : "<span class='muted'>—</span>"}</td>
      <td class="num">${d.cash_value != null ? fmtMoney(d.cash_value) : "<span class='muted'>—</span>"}</td>
      <td class="num">${winners}</td>
    </tr>
    ${detail}`;
}

function prizeDetailRow(d) {
  const bonusVal = d[meta.bonusKey];
  const bonus = bonusVal ? ` · ${meta.bonusName} ${bonusVal}×` : "";
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
    <tr id="detail-${d.date}" class="detail-row" hidden>
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

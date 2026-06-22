// Check-my-numbers. Scans a game's full history for how a set of numbers would have
// done: best match ever, how often each match count came up, and whether it ever hit the
// jackpot. Works for ball games (set intersection + optional special ball) and digit games
// (exact "straight" and any-order "box" matches).

const els = {};

const parseNums = (s) => String(s).split(/[^\d]+/).filter(Boolean).map(Number);
const ord = (a) => [...a].sort((x, y) => x - y).join(",");

function init() {
  ["game", "nums", "special", "special-wrap", "special-label", "go", "out", "hint"].forEach(
    (id) => (els[id.replace(/-/g, "_")] = document.getElementById(id)));
  setMeta({
    title: "Check My Lottery Numbers — Have They Ever Won? | NumbersIntel",
    description: "Enter your lottery numbers and see how they would have done across every past draw on record: best match ever, how often each tier hit, and whether they ever struck the jackpot.",
    url: `${SITE}/check.html`,
  });

  populateGames();
  const pre = new URLSearchParams(location.search).get("game");
  if (pre && GAME_META[pre]) els.game.value = pre;

  els.game.addEventListener("change", onGameChange);
  els.go.addEventListener("click", check);
  els.nums.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
  onGameChange();
}

function populateGames() {
  const groups = {};
  for (const [k, m] of Object.entries(GAME_META)) {
    if (m.retired || (m.prizes && m.prizes.retired)) continue;
    const g = m.stateName || "National";
    (groups[g] ||= []).push([k, m.label]);
  }
  const order = ["National", ...Object.keys(groups).filter((g) => g !== "National").sort()];
  els.game.innerHTML = order.map((g) =>
    `<optgroup label="${g}">${groups[g].sort((a, b) => a[1].localeCompare(b[1]))
      .map(([k, label]) => `<option value="${k}">${label}</option>`).join("")}</optgroup>`).join("");
}

function onGameChange() {
  const m = GAME_META[els.game.value];
  if (m.specialKey) {
    els.special_wrap.style.display = "";
    els.special_label.textContent = m.specialName || "Bonus ball";
  } else {
    els.special_wrap.style.display = "none";
    els.special.value = "";
  }
  els.nums.placeholder = m.digits ? "e.g. 5 2 7" : "e.g. 4 8 15 16 23";
  els.out.innerHTML = "";
  els.hint.textContent = "";
}

async function check() {
  const key = els.game.value;
  const m = GAME_META[key];
  const nums = parseNums(els.nums.value);
  const special = els.special.value.trim() !== "" ? Number(els.special.value) : null;
  els.hint.textContent = "";

  let hist;
  try {
    hist = await fetch(`history/${key}.json`, { cache: "default" }).then((r) => r.json());
  } catch (_) {
    els.out.innerHTML = `<p class="check-empty">Couldn't load the draw history for ${m.label}. Try again in a moment.</p>`;
    return;
  }
  const draws = hist.draws || [];
  if (!draws.length) { els.out.innerHTML = `<p class="check-empty">No draws on record yet for ${m.label}.</p>`; return; }
  const n = draws[0].numbers.length;
  if (nums.length !== n) {
    els.hint.textContent = `${m.label} draws ${n} number${n > 1 ? "s" : ""} — you entered ${nums.length || "none"}.`;
    return;
  }

  const span = `${draws.length.toLocaleString()} draws (${fmtDate(draws[0].date)} – ${fmtDate(draws[draws.length - 1].date)})`;
  if (m.digits) renderDigit(m, draws, nums, span);
  else renderBall(m, draws, nums, special, n, span);
}

function renderDigit(m, draws, nums, span) {
  const want = nums.join(",");
  const wantBox = ord(nums);
  const exact = draws.filter((d) => d.numbers.join(",") === want);
  const box = draws.filter((d) => ord(d.numbers) === wantBox);
  const last = (arr) => arr.length ? fmtDate(arr[arr.length - 1].date) : null;
  els.out.innerHTML = `
    <p class="check-head">Your number <b>${nums.join("-")}</b> across <b>${span}</b> of ${m.label}:</p>
    <div class="detail-grid">
      ${checkCard("Exact order (straight)", exact.length, exact.length ? `Most recently ${last(exact)}` : "Never drawn in exact order")}
      ${checkCard("Any order (box)", box.length, box.length ? `Same digits, most recently ${last(box)}` : "These digits have never come up")}
    </div>
    <p class="disclaimer">${RANDOM_NOTE}</p>`;
}

function renderBall(m, draws, nums, special, n, span) {
  const set = new Set(nums);
  const hasSpecial = !!m.specialKey;
  const dist = {};
  let best = -1, bestDraws = [], jackpot = [];
  for (const d of draws) {
    let mc = 0;
    for (const x of d.numbers) if (set.has(x)) mc++;
    const sp = hasSpecial && special != null && d[m.specialKey] === special;
    const label = mc + (sp ? "+" : "");
    dist[label] = (dist[label] || 0) + 1;
    const score = mc + (sp ? 0.5 : 0);
    if (score > best) { best = score; bestDraws = [d]; }
    else if (score === best) bestDraws.push(d);
    if (mc === n && (!hasSpecial || sp)) jackpot.push(d.date);
  }
  const bestMc = Math.floor(best);
  const bestSp = best % 1 >= 0.5;
  const desc = bestMc === 0 && !bestSp ? "no numbers"
    : `${bestMc} of ${n}${bestSp ? ` + the ${m.specialName}` : ""}`;

  // Distribution rows, most impressive first; drop the "0 matches" noise.
  const rows = Object.entries(dist)
    .filter(([k]) => parseInt(k) > 0 || k.includes("+"))
    .sort((a, b) => parseScore(b[0]) - parseScore(a[0]))
    .map(([k, c]) => {
      const mc = parseInt(k), sp = k.includes("+");
      return `<tr><td>${mc} of ${n}${sp ? ` + ${m.specialName}` : ""}</td><td class="num">${c.toLocaleString()}</td></tr>`;
    }).join("");

  els.out.innerHTML = `
    <p class="check-head">Your numbers <b>${nums.join(" · ")}${hasSpecial && special != null ? ` + ${special}` : ""}</b>
      across <b>${span}</b> of ${m.label}:</p>
    ${jackpot.length
      ? `<p class="verdict verdict--annuity">🎉 These numbers hit the <b>jackpot</b> on ${jackpot.map(fmtDate).join(", ")}!</p>`
      : `<p class="verdict verdict--cash">Best result ever: <b>${desc}</b> — the jackpot never came up.</p>`}
    ${rows ? `<section class="panel"><h2>How often it would have hit</h2>
      <table class="tier-table"><thead><tr><th>Matched</th><th class="num">Times</th></tr></thead>
      <tbody>${rows}</tbody></table></section>`
      : `<p class="check-empty">None of these numbers ever matched in a single draw.</p>`}
    <p class="disclaimer">${RANDOM_NOTE}</p>`;
}

function parseScore(k) { return parseInt(k) + (k.includes("+") ? 0.5 : 0); }

function checkCard(title, count, sub) {
  return `<section class="panel result">
      <div class="result__top"><h2>${title}</h2></div>
      <div class="result__value">${count.toLocaleString()}</div>
      <ul class="meta"><li><span class="k">${sub}</span></li></ul>
    </section>`;
}

const RANDOM_NOTE = `<strong>Just for fun.</strong> Past draws don't predict future ones — every combination is
  equally (un)likely on any given draw, and these counts are roughly what chance alone would produce. Not
  financial or gambling advice; play for entertainment only.`;

init();

// Scratch-games choropleth for the /scratch/ hub, mirroring the draw-games map
// on bestodds.html. Reads the by_state block of scratch_summary.json and shades
// each state by the average value per $1 its games currently return.
//
// Three states (NY, MI, FL) publish prize data without a ticket price, so no
// cents-per-dollar figure exists for them. They get their own band rather than
// being lumped in with "not covered" — we do cover them, just differently.

let SM = null;

const smPct = (v) => Math.round(v * 100) + "%";

// Bands are chosen around the national spread (roughly 57%-77% average per state),
// not around 0-100%, or every state would land in the same colour.
//
// Band on the ROUNDED percentage — the same number the label shows. Banding on the
// raw value put three states all reading "67%" into two different colours (0.6695
// and 0.6704 straddle a threshold but both display as 67%), which reads as a bug.
function smBand(st) {
  if (!st) return "none";
  if (st.avg_ev_now == null) return "alt";     // covered, but no price published
  const v = Math.round(st.avg_ev_now * 100);
  if (v >= 73) return "b0";
  if (v >= 70) return "b1";
  if (v >= 67) return "b2";
  if (v >= 63) return "b3";
  return "b4";
}

function smLabel(name, st) {
  if (!st) return `${name} — not covered yet`;
  const bits = [`${st.games} games`];
  if (st.avg_ev_now != null) bits.push(`avg ${smPct(st.avg_ev_now)} back per $1`);
  if (st.no_top_prize > 0) bits.push(`${st.no_top_prize} with no top prize left`);
  return `${name} — ${bits.join(", ")}`;
}

function smRender() {
  const host = document.getElementById("sm-map");
  if (!host || typeof US_MAP === "undefined" || !SM || !SM.by_state) return;
  const S = SM.by_state;

  const paths = US_MAP.locations.map((loc) => {
    const abbr = loc.id.toUpperCase();
    const st = S[abbr];
    const label = smLabel(loc.name, st);
    const attrs = st
      ? ` role="link" tabindex="0" data-abbr="${abbr}" aria-label="${label}"`
      : ` aria-hidden="true"`;
    return `<path d="${loc.path}" class="us-state sm-state sm-state--${smBand(st)}"${attrs}><title>${label}</title></path>`;
  }).join("");

  host.innerHTML =
    `<svg class="us-map" viewBox="${US_MAP.viewBox}" role="img" aria-label="Map of US states with scratch game value analysis" preserveAspectRatio="xMidYMid meet">${paths}</svg>` +
    `<div class="us-map-legend sm-legend">` +
      `<span><i class="sm-dot sm-dot--b0"></i>73%+ back per $1</span>` +
      `<span><i class="sm-dot sm-dot--b1"></i>70&ndash;73%</span>` +
      `<span><i class="sm-dot sm-dot--b2"></i>67&ndash;70%</span>` +
      `<span><i class="sm-dot sm-dot--b3"></i>63&ndash;67%</span>` +
      `<span><i class="sm-dot sm-dot--b4"></i>Under 63%</span>` +
      `<span><i class="sm-dot sm-dot--alt"></i>Covered, no price published</span>` +
      `<span><i class="sm-dot sm-dot--none"></i>Not covered yet</span>` +
    `</div>`;

  const svg = host.querySelector(".us-map");
  const pick = (p) => { const a = p && p.getAttribute("data-abbr"); if (a) smShow(a); };
  svg.addEventListener("click", (e) => pick(e.target.closest("path[data-abbr]")));
  svg.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const p = e.target.closest("path[data-abbr]");
    if (p) { e.preventDefault(); pick(p); }
  });

  const sel = document.getElementById("sm-select");
  if (sel) {
    sel.innerHTML = `<option value="">Choose a state&hellip;</option>` +
      Object.keys(S).sort((a, b) => S[a].name.localeCompare(S[b].name))
        .map((a) => `<option value="${a}">${S[a].name}</option>`).join("");
    sel.addEventListener("change", () => { if (sel.value) smShow(sel.value); });
  }
}

function smShow(abbr) {
  const out = document.getElementById("sm-detail");
  const st = SM.by_state[abbr];
  if (!out || !st) return;

  document.querySelectorAll(".sm-state--sel").forEach((p) => p.classList.remove("sm-state--sel"));
  const path = document.querySelector(`path[data-abbr="${abbr}"]`);
  if (path) path.classList.add("sm-state--sel");
  const sel = document.getElementById("sm-select");
  if (sel && sel.value !== abbr) sel.value = abbr;

  const href = `scratch/${st.slug}.html`;
  let body;
  if (st.avg_ev_now != null) {
    body = `<p>Across <strong>${st.games}</strong> ${st.name} games we can price, the average return is
        <strong>${smPct(st.avg_ev_now)} per $1</strong>.` +
      (st.best ? ` The best right now is <strong>${st.best.name}</strong>
        ($${st.best.price}) at ${smPct(st.best.ev_now)}.` : "") + `</p>`;
  } else {
    body = `<p>${st.name} publishes prize data without a ticket price, so there is no cents-per-dollar
        figure &mdash; its <strong>${st.games}</strong> games are ranked by how much prize money is
        genuinely unclaimed instead.</p>`;
  }
  const gone = st.no_top_prize > 0
    ? `<p><strong>${st.no_top_prize}</strong> ${st.no_top_prize === 1 ? "game is" : "games are"} still on
       sale with <strong>no top prize left</strong>.</p>`
    : `<p>Every ${st.name} game still has at least one top prize unclaimed.</p>`;

  out.innerHTML = `<h3>${st.name}</h3>${body}${gone}
    <p class="section-note"><a class="btn" href="${href}">See all ${st.name} games &rarr;</a></p>`;
}

fetch("scratch_summary.json", { cache: "no-store" })
  .then((r) => r.json())
  .then((d) => { SM = d; smRender(); })
  .catch(() => {
    const h = document.getElementById("sm-map");
    if (h) h.innerHTML = '<p class="section-note">Map data is loading or temporarily unavailable.</p>';
  });

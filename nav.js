// Global top navigation, injected on every page (defer-loaded so document.body exists).
// A "Draw Games" dropdown gathers everything (US National / US State / UK drawings +
// the draw-game tools), and a standalone "Tools" tab links straight to the tools.
(function () {
  const here = location.pathname.split("/").pop() || "index.html";
  const link = (t, h) => `<a href="${h}"${h === here ? ' class="is-active"' : ""}>${t}</a>`;
  const drawPages = ["national.html", "states.html", "uk.html", "tools.html", "state.html", "game.html"];
  const groupActive = drawPages.includes(here);

  const nav = document.createElement("nav");
  nav.className = "topnav";
  nav.innerHTML =
    `<a class="topnav__brand" href="index.html">Numbers<span>Intel</span></a>` +
    `<div class="topnav__links">` +
      `<div class="topnav__group">` +
        `<button class="topnav__trigger${groupActive ? " is-active" : ""}" type="button" aria-haspopup="true" aria-expanded="false">` +
          `Draw Games <span class="topnav__caret">&#9662;</span></button>` +
        `<div class="topnav__menu">` +
          link("US National Drawings", "national.html") +
          link("US State Drawings", "states.html") +
          link("UK Drawings", "uk.html") +
          link("Draw Game Tools", "tools.html") +
        `</div>` +
      `</div>` +
      link("Guides", "guides/") +
      link("Tools", "tools.html") +
    `</div>`;
  document.body.insertBefore(nav, document.body.firstChild);

  // Click-to-toggle for touch / no-hover devices (desktop also gets the CSS :hover).
  const group = nav.querySelector(".topnav__group");
  const trigger = group.querySelector(".topnav__trigger");
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = group.classList.toggle("is-open");
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", () => {
    group.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
  });

  // Responsible-gambling notice — appended to the footer on every page.
  const rg = document.createElement("p");
  rg.className = "rg-note";
  rg.innerHTML =
    "You must be <strong>18+</strong> to play the lottery (21+ in some states). The lottery is a " +
    "negative-expected-value game — play for entertainment, and never spend more than you can " +
    "afford to lose. If you or someone you know has a gambling problem, call " +
    "<strong>1-800-GAMBLER</strong> (<a href=\"tel:18004262537\">1-800-426-2537</a>).";
  const foot = document.querySelector(".site-footer");
  (foot || document.body).appendChild(rg);

  // Ensure Methodology + About are linked from every footer (E-E-A-T / trust signal).
  // Use the existing .footer-nav, or synthesise one for minimal footers (game/history).
  let fnav = document.querySelector(".footer-nav");
  if (!fnav && foot) {
    fnav = document.createElement("nav");
    fnav.className = "footer-nav";
    foot.insertBefore(fnav, foot.firstChild);
  }
  if (fnav) {
    [["Guides", "guides/"], ["Methodology", "methodology.html"], ["About", "about.html"], ["Privacy", "privacy.html"]].forEach(function (l) {
      if (![...fnav.querySelectorAll("a")].some(function (a) { return a.getAttribute("href") === l[1]; })) {
        const a = document.createElement("a");
        a.href = l[1]; a.textContent = l[0];
        fnav.appendChild(a);
      }
    });
  }
})();

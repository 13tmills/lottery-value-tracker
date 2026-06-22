// Global top navigation, injected on every page (defer-loaded so document.body exists).
// Brand → landing; "National Drawings" → the national games page; "State Drawings" → states.
(function () {
  const here = location.pathname.split("/").pop() || "index.html";
  const link = (t, h) => `<a href="${h}"${h === here ? ' class="is-active"' : ""}>${t}</a>`;

  const nav = document.createElement("nav");
  nav.className = "topnav";
  nav.innerHTML =
    `<a class="topnav__brand" href="index.html">Numbers<span>Intel</span></a>` +
    `<div class="topnav__links">` +
      link("National Drawings", "national.html") +
      link("State Drawings", "states.html") +
      link("Tools", "tools.html") +
    `</div>`;
  document.body.insertBefore(nav, document.body.firstChild);

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
})();

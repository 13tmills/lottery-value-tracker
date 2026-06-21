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
    `</div>`;
  document.body.insertBefore(nav, document.body.firstChild);
})();

// Global top navigation, injected on every page (defer-loaded so document.body exists).
(function () {
  const links = [
    ["Powerball", "game.html?game=powerball"],
    ["Mega Millions", "game.html?game=mega_millions"],
    ["Lotto America", "game.html?game=lotto_america"],
    ["States", "states.html"],
  ];
  const here = location.pathname.split("/").pop() + location.search;
  const nav = document.createElement("nav");
  nav.className = "topnav";
  nav.innerHTML =
    `<a class="topnav__brand" href="index.html">Numbers<span>Intel</span></a>` +
    `<div class="topnav__links">` +
    links.map(([t, h]) => `<a href="${h}"${here === h ? ' class="is-active"' : ""}>${t}</a>`).join("") +
    `</div>`;
  document.body.insertBefore(nav, document.body.firstChild);
})();

// Structured-data + breadcrumbs, injected on every page (deferred, so common.js /
// game data have already loaded where they exist). Sitewide: Organization + WebSite.
// Page-aware: BreadcrumbList (+ a visible breadcrumb), Dataset for game/stats/results
// pages, WebApplication for the tools, and a data-driven FAQ (rendered visibly so the
// FAQPage markup matches on-page content, per Google policy). All additive — pure
// E-E-A-T / AEO signal, no effect on the existing pages' behaviour.
(function () {
  "use strict";
  var SITE = "https://numbersintel.com";
  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var params = new URLSearchParams(location.search);
  var gameKey = params.get("game");
  var stateKey = (params.get("state") || "").toUpperCase();
  var META = (typeof GAME_META !== "undefined") ? GAME_META : {};
  var NATIONAL = { powerball: "Powerball", mega_millions: "Mega Millions", lotto_america: "Lotto America" };
  var NAT_ODDS = { powerball: 292201338, mega_millions: 290472336, lotto_america: 25989600 };

  function ld(obj) {
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function gmeta(key) {
    return META[key] || (NATIONAL[key] ? { label: NATIONAL[key], draws: null } : null);
  }
  function gameLabel(key) { var m = gmeta(key); return m ? m.label : key; }
  function section(key) {
    if (NATIONAL[key]) return ["US National Drawings", "national.html"];
    var m = META[key];
    if (m && m.currency === "GBP") return ["UK Drawings", "uk.html"];
    return ["US State Drawings", "states.html"];
  }

  var ORG = {
    "@type": "Organization", "@id": SITE + "/#org", name: "NumbersIntel",
    url: SITE + "/", logo: SITE + "/favicon.svg",
    description: "Independent lottery analytics — expected value, odds, jackpot history and number-frequency statistics for US and UK draw games.",
  };

  // ---- sitewide: Organization + WebSite -----------------------------------
  ld({ "@context": "https://schema.org", "@graph": [
    ORG,
    { "@type": "WebSite", "@id": SITE + "/#site", name: "NumbersIntel", url: SITE + "/", publisher: { "@id": SITE + "/#org" } },
  ]});

  var TOOLS = {
    "breakeven.html": "Break-even Calculator", "montecarlo.html": "Monte Carlo Simulator",
    "check.html": "Check My Numbers", "statetax.html": "Lottery Tax Calculator",
    "visualizer.html": "Odds Visualizer", "lifecalc.html": "Lump Sum vs Annuity",
    "jackpotstats.html": "Jackpot Growth Stats", "calculator.html": "Lottery Calculator",
    "tools.html": "Draw Game Tools",
  };

  // ---- breadcrumb (visible + schema) --------------------------------------
  var crumbs = [["Home", "index.html"]];
  if ((page === "game.html" || page === "numbers.html" || page === "history.html") && gameKey) {
    var sec = section(gameKey);
    crumbs.push([sec[0], sec[1]]);
    var suffix = page === "numbers.html" ? " — Number Frequency" : page === "history.html" ? " — Results" : "";
    crumbs.push([gameLabel(gameKey) + suffix, null]);
  } else if (page === "state.html" && stateKey) {
    crumbs.push(["US State Drawings", "states.html"]);
    var sn = document.getElementById("state-title");
    crumbs.push([(sn && sn.textContent.trim()) || stateKey, null]);
  } else if (page === "national.html") { crumbs.push(["US National Drawings", null]); }
  else if (page === "states.html") { crumbs.push(["US State Drawings", null]); }
  else if (page === "uk.html") { crumbs.push(["UK Drawings", null]); }
  else if (TOOLS[page]) {
    if (page !== "tools.html") crumbs.push(["Draw Game Tools", "tools.html"]);
    crumbs.push([TOOLS[page], null]);
  } else if (page === "methodology.html") { crumbs.push(["Methodology", null]); }
  else if (page === "about.html") { crumbs.push(["About", null]); }
  else if (page === "privacy.html") { crumbs.push(["Privacy", null]); }
  else if (page === "terms.html") { crumbs.push(["Terms", null]); }

  if (crumbs.length > 1) {
    ld({ "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: crumbs.map(function (c, i) {
        var el = { "@type": "ListItem", position: i + 1, name: c[0] };
        if (c[1]) el.item = SITE + "/" + c[1];
        return el;
      }) });
    var nav = document.createElement("nav");
    nav.className = "crumbs";
    nav.setAttribute("aria-label", "Breadcrumb");
    nav.innerHTML = crumbs.map(function (c, i) {
      var inner = c[1] ? '<a href="' + c[1] + '">' + esc(c[0]) + "</a>" : '<span aria-current="page">' + esc(c[0]) + "</span>";
      return (i ? '<span class="crumbs__sep">/</span>' : "") + inner;
    }).join("");
    var anchor = document.querySelector(".detail-header, main, .prose");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(nav, anchor);
  }

  // ---- Dataset for a game's results / stats / history ---------------------
  if ((page === "game.html" || page === "numbers.html" || page === "history.html") && gameKey) {
    fetch("history/" + gameKey + ".json", { cache: "default" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (h) {
        var m = gmeta(gameKey);
        var label = gameLabel(gameKey);
        var hasJp = !!(m && (m.oddsJackpot || (m.ev && m.ev.odds_jackpot) || NATIONAL[gameKey]));
        var ds = {
          "@context": "https://schema.org", "@type": "Dataset",
          name: label + " winning numbers, jackpots & number-frequency statistics",
          description: "Every recorded " + label + " draw with winning numbers" + (hasJp ? ", jackpots" : "") + ", plus computed hot/cold, overdue and frequency statistics. Compiled and analysed by NumbersIntel.",
          url: SITE + "/" + page + "?game=" + gameKey,
          creator: { "@id": SITE + "/#org" }, publisher: { "@id": SITE + "/#org" },
          isAccessibleForFree: true, license: SITE + "/terms.html",
          keywords: [label, "winning numbers", "number frequency", "hot and cold numbers", "lottery statistics"],
        };
        if (h && h.draws && h.draws.length) {
          ds.temporalCoverage = h.draws[0].date + "/" + h.draws[h.draws.length - 1].date;
          ds.distribution = { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: SITE + "/history/" + gameKey + ".json" };
          ds.variableMeasured = ["winning numbers", "draw date"].concat(hasJp ? ["jackpot"] : []);
        }
        ld(ds);
        if (page === "game.html") buildFaq(gameKey, h);
      }).catch(function () {});
  }

  // ---- WebApplication for the tools ---------------------------------------
  if (TOOLS[page]) {
    ld({ "@context": "https://schema.org", "@type": "WebApplication",
      name: "NumbersIntel " + TOOLS[page], url: SITE + "/" + page,
      applicationCategory: "FinanceApplication", operatingSystem: "Any (web browser)",
      browserRequirements: "Requires JavaScript", isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": SITE + "/#org" } });
  }

  // ---- visible, data-driven FAQ on game pages (+ matching FAQPage) --------
  function buildFaq(key, h) {
    var m = gmeta(key); if (!m) return;
    var label = m.label;
    var sym = (m.currency === "GBP") ? "£" : "$";
    var qa = [];
    var odds = (m.oddsJackpot) || (m.ev && m.ev.odds_jackpot) || NAT_ODDS[key];
    if (odds) qa.push(["What are the odds of winning the " + label + " jackpot?",
      "The odds of winning the " + label + " jackpot are 1 in " + Number(odds).toLocaleString() + ". Those odds are fixed by the game's number matrix and don't change from draw to draw."]);
    if (m.draws) qa.push(["When is the " + label + " drawn?",
      label + " is drawn " + m.draws + ". NumbersIntel updates the latest winning numbers automatically after each draw."]);
    var cur = h && h.current_jackpot;
    if (cur && cur.jackpot) qa.push(["How big is the current " + label + " jackpot?",
      "As of the most recent update, the estimated " + label + " jackpot is about " + sym + Number(cur.jackpot).toLocaleString() + ". The figure on this page updates automatically as the jackpot rolls."]);
    qa.push(["Do hot or overdue " + label + " numbers win more often?",
      "No. Each " + label + " draw is independent and every number is equally likely every time. Frequency, hot/cold and overdue statistics describe what has happened historically — they do not predict future draws."]);
    if (qa.length < 2) return;

    var box = document.createElement("section");
    box.className = "panel faq-block";
    box.innerHTML = "<h2>" + esc(label) + " — frequently asked questions</h2>" +
      qa.map(function (x) {
        return '<details class="faq-item"><summary>' + esc(x[0]) + "</summary><p>" + esc(x[1]) + "</p></details>";
      }).join("");
    // Append into <main> (after #detail) — not inside #detail, which game.js may
    // re-render and wipe.
    var detail = document.getElementById("detail");
    var host = (detail && detail.parentNode) || document.querySelector("main");
    if (host) host.appendChild(box);

    ld({ "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: qa.map(function (x) { return { "@type": "Question", name: x[0], acceptedAnswer: { "@type": "Answer", text: x[1] } }; }) });
  }
})();

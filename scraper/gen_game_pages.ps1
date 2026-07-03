# Pre-render RICH STATIC pages for the national games so crawlers (and the AdSense
# content review) see substantial unique content in the HTML &mdash; not a 20-word JS shell.
# Reads data.json + history/<key>.json + split_risk.json; writes game/<key>.html.
# Mirrored by scraper/prerender.py for CI freshness.
$ErrorActionPreference = "Stop"
$root = "C:\Users\13tmi\OneDrive\Desktop\Coding Projects\Lottery Project"

$META = @{
  powerball = @{
    label = "Powerball"; matrix = "5 of 69 white balls plus 1 of 26 red Power Balls"
    draws = "Monday, Wednesday and Saturday"; special = "Power Ball"; sabbr = "PB"; skey = "powerball" }
  mega_millions = @{
    label = "Mega Millions"; matrix = "5 of 70 white balls plus 1 of 24 gold Mega Balls"
    draws = "Tuesday and Friday"; special = "Mega Ball"; sabbr = "MB"; skey = "mega_ball" }
  lotto_america = @{
    label = "Lotto America"; matrix = "5 of 52 white balls plus 1 of 10 Star Balls"
    draws = "Monday, Wednesday and Saturday"; special = "Star Ball"; sabbr = "SB"; skey = "star_ball" }
}

$data = Get-Content "$root\data.json" -Raw | ConvertFrom-Json
$sr = $null; if (Test-Path "$root\split_risk.json") { $sr = Get-Content "$root\split_risk.json" -Raw | ConvertFrom-Json }
if (-not (Test-Path "$root\game")) { New-Item -ItemType Directory "$root\game" | Out-Null }

function Money($n) {
  if ($null -eq $n) { return "-" }
  if ($n -ge 1e9) { return "`$$([math]::Round($n/1e9,2))B" }
  if ($n -ge 1e6) { return "`$$([math]::Round($n/1e6,1))M" }
  return "`$" + ("{0:N0}" -f $n)
}
function Odds($n) { "1 in " + ("{0:N0}" -f [long]$n) }
function DateLong($iso) { try { ([datetime]$iso).ToString("MMMM d, yyyy") } catch { $iso } }
function EscHtml($s) { $s -replace '&','&amp;' -replace '<','&lt;' -replace '>','&gt;' }

foreach ($key in $META.Keys) {
  $m = $META[$key]
  $g = $data.games.$key
  if (-not $g) { continue }
  $label = $m.label
  $evc = [math]::Round([double]$g.expected_value * 100, 1)
  $price = [double]$g.ticket_price
  $back = 100 - $evc
  $srg = if ($sr) { $sr.games.$key } else { $null }

  # Rank among the three nationals by EV
  $ranked = @('powerball','mega_millions','lotto_america') |
    Where-Object { $data.games.$_ } |
    Sort-Object { - [double]$data.games.$_.expected_value }
  $rankIdx = [array]::IndexOf(@($ranked), $key)
  $rankWord = @("the best value", "the second-best value", "the lowest value")[$rankIdx]

  # intro analysis (original, data-grounded)
  $intro = "$label is a $($m.matrix) draw game, held every $($m.draws). As of the latest update its " +
    "advertised jackpot is <strong>$(Money $g.jackpot)</strong> (a cash value of about $(Money $g.cash_value)), " +
    "and the odds of matching all six numbers are <strong>$(Odds $g.odds_jackpot)</strong>. " +
    "Run the real expected-value math and a `$$([int]$price) ticket is worth about " +
    "<strong>$evc&cent; per dollar</strong> at this jackpot &mdash; meaning roughly $([math]::Round($back))&cent; of every " +
    "dollar is the house edge. Among the three national games, that is currently <strong>$rankWord</strong>. " +
    "Like every lottery game it is a negative-expected-value bet by design; these figures simply show which is least bad, and by how much."

  # prize tiers table
  $tierRows = ""
  foreach ($t in $g.prize_tiers) {
    $lbl = $t.match
    $tierRows += "<tr><td>$(EscHtml $lbl)</td><td>$(Money $t.prize)</td><td>$(Odds $t.odds)</td></tr>`n"
  }

  # recent results table
  $hist = $null
  if (Test-Path "$root\history\$key.json") { $hist = Get-Content "$root\history\$key.json" -Raw | ConvertFrom-Json }
  $recentRows = ""
  if ($hist) {
    $rd = @($hist.draws) | Select-Object -Last 12
    [array]::Reverse($rd)
    foreach ($dr in $rd) {
      $nums = ($dr.numbers -join ", ")
      $sp = if ($dr.$($m.skey)) { " &nbsp;<strong>$($m.sabbr) $($dr.$($m.skey))</strong>" } else { "" }
      $jp = if ($dr.jackpot) { Money $dr.jackpot } else { "-" }
      $recentRows += "<tr><td>$(DateLong $dr.date)</td><td>$nums$sp</td><td>$jp</td></tr>`n"
    }
  }

  # split-risk snapshot
  $srBlock = ""
  if ($srg -and $srg.upcoming) {
    $u = $srg.upcoming
    $tk = if ($u.est_lines -ge 1e6) { "$([math]::Round($u.est_lines/1e6,1)) million" } else { "{0:N0}" -f $u.est_lines }
    $pw = [math]::Round($u.p_win * 100, 1)
    $ps = [math]::Round($u.p_split_if_won * 100, 1)
    $srBlock = @"
    <section class="panel">
      <h2>Will the $label jackpot be won or split?</h2>
      <p>Using the number of lower-tier winners each recent draw produced, we estimate about
        <strong>~$tk tickets</strong> are in play at the current jackpot &mdash; roughly a <strong>$pw% chance</strong>
        that someone wins the jackpot, and a <strong>$ps% chance</strong> it would be split between multiple
        winners if it is hit. These are estimates from past draws of a similar size, not predictions; every draw
        is independent. <a href="splitrisk.html">See the full split-risk breakdown &rarr;</a></p>
    </section>
"@
  }

  $lastNums = ($g.winning_numbers -join ", ")
  $lastSp = if ($g.$($m.skey)) { " &nbsp;<strong>$($m.sabbr) $($g.$($m.skey))</strong>" } else { "" }
  $title = "$label &mdash; Expected Value, Odds &amp; Latest Results | NumbersIntel"
  $desc = "$label expected value, exact jackpot odds ($(Odds $g.odds_jackpot)), the full prize-tier table and recent winning numbers &mdash; with the real EV math showing what a `$$([int]$price) ticket is actually worth."

  $html = @"
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/svg+xml" href="../favicon.svg" />
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1281838483505325" crossorigin="anonymous"></script>
  <script src="../analytics.js"></script>
  <base href="/" />
  <script defer src="nav.js"></script>
  <title>$title</title>
  <meta name="description" content="$(EscHtml $desc)" />
  <link rel="canonical" href="https://numbersintel.com/game/$key.html" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="NumbersIntel" />
  <meta property="og:title" content="$(EscHtml $label) &mdash; Expected Value, Odds &amp; Results" />
  <meta property="og:description" content="$(EscHtml $desc)" />
  <meta property="og:url" content="https://numbersintel.com/game/$key.html" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="detail-header">
    <a class="back-link" href="national.html">&larr; US National Drawings</a>
    <h1>$label</h1>
    <p class="tagline">Expected value, exact odds, the full prize table and the latest winning numbers.</p>
  </header>

  <main class="detail">
    <section class="prose">
      <p>$intro</p>
    </section>

    <section class="panel">
      <h2>Latest winning numbers</h2>
      <p style="font-size:1.15rem"><strong>$lastNums</strong>$lastSp</p>
      <p class="section-note">Drawn $(DateLong $g.next_draw) or the most recent draw. Next drawing: $(DateLong $g.next_draw).</p>
    </section>

    <section class="panel">
      <h2>$label by the numbers</h2>
      <div class="stat-strip">
        <div class="stat"><div class="stat__label">Jackpot</div><div class="stat__value">$(Money $g.jackpot)</div></div>
        <div class="stat"><div class="stat__label">Cash value</div><div class="stat__value">$(Money $g.cash_value)</div></div>
        <div class="stat"><div class="stat__label">Jackpot odds</div><div class="stat__value">$(Odds $g.odds_jackpot)</div></div>
        <div class="stat"><div class="stat__label">Value per `$1</div><div class="stat__value">$evc&cent;</div></div>
      </div>
      <p class="section-note">"Value per `$1" is the expected value: sum every prize tier times its probability, after an
        assumed tax haircut, divided by the ticket price. It is always below `$1 &mdash; the lottery is negative-EV by design.</p>
    </section>

    <section class="panel">
      <h2>$label prize tiers &amp; odds</h2>
      <div class="sr-table-wrap"><table class="sr-table">
        <thead><tr><th scope="col">Match</th><th scope="col">Prize</th><th scope="col">Odds</th></tr></thead>
        <tbody>
$tierRows
        </tbody>
      </table></div>
    </section>
$srBlock
    <section class="panel">
      <h2>Recent $label results</h2>
      <div class="sr-table-wrap"><table class="sr-table">
        <thead><tr><th scope="col">Draw date</th><th scope="col">Numbers</th><th scope="col">Jackpot</th></tr></thead>
        <tbody>
$recentRows
        </tbody>
      </table></div>
      <p class="section-note">A rolling window of recent draws. Number-frequency history and interactive charts are on the
        <a href="game.html?game=$key">interactive $label page</a>.</p>
    </section>

    <section class="prose">
      <h2>How we compute $label's value</h2>
      <p>Every figure here comes from official sources and the game's published prize structure, refreshed after each
        drawing. The odds are computed from the number matrix ($($m.matrix)); the expected value sums each prize tier
        against its probability after an assumed tax rate. We document the full method on our
        <a href="methodology.html">methodology page</a>. For the ideas behind these numbers, see
        <a href="guides/what-is-lottery-expected-value/">what expected value means</a>,
        <a href="guides/lottery-odds-explained/">how the odds work</a>, and
        <a href="guides/lump-sum-vs-annuity/">lump sum vs annuity</a> if you are weighing how to take a jackpot.</p>
      <p>Useful tools for ${label}: the <a href="breakeven.html?game=$key">break-even calculator</a> (how big the jackpot
        must get before a ticket is a fair bet), the <a href="statetax.html">tax &amp; payout calculator</a>, the
        <a href="visualizer.html?game=$key">odds visualizer</a>, and <a href="check.html?game=$key">check my numbers</a>.</p>
    </section>

    <p class="disclaimer">
      NumbersIntel is independent and informational only &mdash; not financial, legal or gambling advice. The lottery is a
      negative-expected-value game; play for entertainment, never as an investment. You must be 18+ (21+ in some states).
      If gambling is a problem for you or someone you know, call <strong>1-800-GAMBLER</strong>.
    </p>
  </main>

  <footer class="site-footer">
    <nav class="footer-nav">
      <a href="index.html">Home</a>
      <a href="national.html">US National Drawings</a>
      <a href="states.html">US State Drawings</a>
      <a href="splitrisk.html">Split-risk tracker</a>
      <a href="methodology.html">Methodology</a>
      <a href="about.html">About</a>
    </nav>
    <p>For information and entertainment only &mdash; not financial or gambling advice.</p>
  </footer>
</body>
</html>
"@

  $path = "$root\game\$key.html"
  [System.IO.File]::WriteAllText($path, $html, (New-Object System.Text.UTF8Encoding $false))
  $words = (($html -replace '<[^>]+>',' ') -replace '\s+',' ').Trim().Split(' ').Count
  Write-Host ("wrote game/{0}.html  (~{1} words, {2} tiers, {3} recent draws)" -f $key, $words, @($g.prize_tiers).Count, ($(if($hist){[math]::Min(12,@($hist.draws).Count)}else{0})))
}

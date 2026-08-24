# Pre-render RICH STATIC pages for EVERY game so crawlers (and the AdSense content
# review) see substantial unique content in the HTML instead of a ~20-word JS shell.
#   - National games (Powerball/MM/Lotto America): from data.json + split_risk.json.
#   - State games: from game_meta.json (exported GAME_META) + history/<key>.json.
# Path-relative so it runs both locally (Windows PowerShell) and in CI (pwsh on Linux).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

$data = Get-Content (Join-Path $root "data.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$sr = $null
$srPath = Join-Path $root "split_risk.json"
if (Test-Path $srPath) { $sr = Get-Content $srPath -Raw -Encoding UTF8 | ConvertFrom-Json }
$meta = Get-Content (Join-Path $root "game_meta.json") -Raw -Encoding UTF8 | ConvertFrom-Json

$gameDir = Join-Path $root "game"
if (-not (Test-Path $gameDir)) { New-Item -ItemType Directory $gameDir | Out-Null }

$NatMeta = @{
  powerball = @{ matrix = "5 of 69 white balls plus 1 of 26 red Power Balls"; draws = "Monday, Wednesday and Saturday"; sabbr = "PB"; skey = "powerball" }
  mega_millions = @{ matrix = "5 of 70 white balls plus 1 of 24 gold Mega Balls"; draws = "Tuesday and Friday"; sabbr = "MB"; skey = "mega_ball" }
  lotto_america = @{ matrix = "5 of 52 white balls plus 1 of 10 Star Balls"; draws = "Monday, Wednesday and Saturday"; sabbr = "SB"; skey = "star_ball" }
}
$nationals = @($NatMeta.Keys)

function Money($n) {
  if ($null -eq $n) { return "-" }
  if ($n -ge 1e9) { return "`$$([math]::Round($n/1e9,2))B" }
  if ($n -ge 1e6) { return "`$$([math]::Round($n/1e6,1))M" }
  return "`$" + ("{0:N0}" -f [double]$n)
}
function Odds($n) { "1 in " + ("{0:N0}" -f [long]$n) }
function DateLong($iso) { try { ([datetime]$iso).ToString("MMMM d, yyyy") } catch { "$iso" } }
function Esc($s) { "$s" -replace '&','&amp;' -replace '<','&lt;' -replace '>','&gt;' }
function An($w) { if ("$w" -match '^\s*[AEIOUaeiou]') { "an" } else { "a" } }
function WordCount($html) { ((($html -replace '<[^>]+>',' ') -replace '\s+',' ').Trim() -split ' ').Count }

# Recent-results table rows from history/<key>.json (last 12, newest first).
function RecentRows($key, $skey, $sabbr) {
  $hp = Join-Path $root "history\$key.json"
  if (-not (Test-Path $hp)) { return @{ rows = ""; n = 0 } }
  $hist = Get-Content $hp -Raw -Encoding UTF8 | ConvertFrom-Json
  $rd = @($hist.draws) | Select-Object -Last 12
  [array]::Reverse($rd)
  $rows = ""
  foreach ($dr in $rd) {
    $nums = ($dr.numbers -join ", ")
    $sp = ""
    if ($skey -and $dr.$skey) { $sp = " &nbsp;<strong>$sabbr $($dr.$skey)</strong>" }
    $jp = if ($dr.jackpot) { Money $dr.jackpot } else { "" }
    $jpCell = if ($jp) { "<td>$jp</td>" } else { "" }
    $rows += "<tr><td>$(DateLong $dr.date)</td><td>$nums$sp</td>$jpCell</tr>`n"
  }
  return @{ rows = $rows; n = @($rd).Count; hasJp = [bool](@($rd) | Where-Object { $_.jackpot }) }
}

# Build an odds / prize-tier table from whichever treatment the game carries.
function OddsTable($m) {
  if ($m.ev -and $m.ev.levels) {
    $rows = ""
    foreach ($p in $m.ev.levels.PSObject.Properties) {
      $lv = $p.Value
      $prize = if ($lv.prize) { Money $lv.prize } elseif ($lv.free) { "Free play" } else { "Pari-mutuel" }
      $rows += "<tr><td>$(Esc $lv.label)</td><td>$prize</td><td>$(Odds $lv.odds)</td></tr>`n"
    }
    return "<thead><tr><th scope=""col"">Prize tier</th><th scope=""col"">Prize</th><th scope=""col"">Odds</th></tr></thead><tbody>$rows</tbody>"
  }
  if ($m.prizes -and $m.prizes.reference) {
    $ref = $m.prizes.reference
    $head = ($ref.columns | ForEach-Object { "<th scope=""col"">$(Esc $_)</th>" }) -join ""
    $rows = ""
    foreach ($r in $ref.rows) { $rows += "<tr>" + (($r.cells | ForEach-Object { "<td>$(Esc $_)</td>" }) -join "") + "</tr>`n" }
    return "<thead><tr>$head</tr></thead><tbody>$rows</tbody>"
  }
  if ($m.prizes -and $m.prizes.odds) {
    $rows = ""
    foreach ($p in $m.prizes.odds.PSObject.Properties) { $rows += "<tr><td>$(Esc $p.Name)</td><td>$(Odds $p.Value)</td></tr>`n" }
    return "<thead><tr><th scope=""col"">Match</th><th scope=""col"">Odds</th></tr></thead><tbody>$rows</tbody>"
  }
  if ($m.viz -and $m.viz.tiers) {
    $rows = ""
    foreach ($t in $m.viz.tiers) { $rows += "<tr><td>$(Esc $t.label)</td><td>$(Odds $t.odds)</td></tr>`n" }
    return "<thead><tr><th scope=""col"">Tier</th><th scope=""col"">Odds</th></tr></thead><tbody>$rows</tbody>"
  }
  return $null
}

function WritePage($key, $html) {
  $path = Join-Path $gameDir "$key.html"
  [System.IO.File]::WriteAllText($path, $html, (New-Object System.Text.UTF8Encoding $false))
  return (WordCount $html)
}

# Genuinely per-game "How <game> works" prose. Varied by archetype (a digit game
# reads nothing like a jackpot game) and seasoned with each game's real archive
# depth, so no two pages are boilerplate copies of each other.
$DIGWORD = @{ 2 = "two"; 3 = "three"; 4 = "four"; 5 = "five" }
$DIGRANGE = @{ 2 = "00 to 99"; 3 = "000 to 999"; 4 = "0000 to 9999"; 5 = "00000 to 99999" }

function ArchiveSentence($label, $hist) {
  $draws = @($hist.draws)
  $n = $draws.Count
  if ($n -le 25 -or -not $draws[0].date) { return $null }
  $yr = try { ([datetime]$draws[0].date).Year } catch { $null }
  if (-not $yr) { return $null }
  "Our archive holds <strong>$('{0:N0}' -f $n) $(Esc $label) draws</strong> going back to $yr, which powers the number-frequency statistics &mdash; the most and least common numbers, current hot and cold streaks, and the longest-overdue numbers. Those describe what has already happened; because each draw is independent, no number is ever truly &lsquo;due.&rsquo;"
}

function Describe($m, $hist, $latest) {
  $label = $m.label
  $stPfx = if ($m.stateName) { "$($m.stateName) " } else { "" }
  $price = if ($m.ticketPrice) { $m.ticketPrice } else { "a few dollars" }
  $freq  = if ($m.draws) { $m.draws } else { "regularly" }
  $jodds = if ($m.ev -and $m.ev.odds_jackpot) { $m.ev.odds_jackpot } elseif ($m.oddsJackpot) { $m.oddsJackpot } else { $null }
  $paras = @()

  if ($m.digits) {
    $dc = if ($latest -and $latest.numbers) { @($latest.numbers).Count } else { 3 }
    $word = if ($DIGWORD.ContainsKey($dc)) { $DIGWORD[$dc] } else { "$dc" }
    $range = if ($DIGRANGE.ContainsKey($dc)) { " (from $($DIGRANGE[$dc]))" } else { "" }
    $straight = [long][math]::Pow(10, $dc)
    $topClause = if ($m.prizes -and $m.prizes.topPrize) { " and pays the top prize of $(Esc $m.prizes.topPrize)" } else { "" }
    $paras += "$(Esc $label) is a $word-digit game: instead of chasing a jackpot, you choose a $dc-digit number$range and win a fixed amount set by how you bet. A <strong>Straight</strong> matches all $dc digits in exact order$topClause &mdash; a 1 in $('{0:N0}' -f $straight) shot &mdash; while a <strong>Box</strong> matches the same digits in any order for a smaller prize that comes up more often. $stPfx" + "draws it $freq at $price a play."
    $paras += "Digit games are the most transparent corner of the lottery: the odds are short, every payout is fixed and published up front, and there is no rolling jackpot to build. That also makes the house edge easy to see &mdash; the lottery keeps a set share of every dollar wagered no matter which number you pick, so it stays a negative-expected-value bet played for fun, not profit."
  }
  elseif ($m.recentWindow -or $m.derby) {
    if ($m.prizes -and $m.prizes.note) { $paras += (Esc $m.prizes.note) }
    else { $paras += "$(Esc $label) is a fast-draw $stPfx" + "game; NumbersIntel tracks a rolling window of its most recent results and its full prize structure." }
    $paras += "Because it is drawn so frequently, we keep a recent window of results rather than a full multi-year archive, and the number-frequency chart reflects that window. It remains a game of pure chance &mdash; every draw is independent of the last."
  }
  elseif ($jodds) {
    $paras += "$(Esc $label) is $(An $m.stateName) $stPfx" + "draw game built around a top prize you win by matching all of the numbers drawn &mdash; about <strong>$(Odds $jodds)</strong>. That prize typically starts at a set minimum and rolls higher every drawing it goes unclaimed, which is how these games can build for weeks before someone finally hits them. It is drawn $freq at $price a play."
    $evClause = if ($m.ev) { " Where the prize structure is fixed, we also compute the real expected value of a ticket." } else { "" }
    $paras += "The lower prize tiers are far easier to hit and pay smaller, mostly fixed amounts, so most winning tickets never touch the top prize. NumbersIntel derives the odds for every tier from the game's published rules.$evClause Like every lottery game it is negative-expected-value by design; the higher the top prize climbs, the more a ticket is worth &mdash; but also the likelier that prize is to be split between multiple winners."
  }
  else {
    $topClause = if ($m.prizes -and $m.prizes.topPrize) { " Its top prize is $(Esc $m.prizes.topPrize)." } else { "" }
    $paras += "$(Esc $label) is $(An $m.stateName) $stPfx" + "lottery game drawn $freq, with tickets from $price.$topClause NumbersIntel gathers its latest results, full odds and prize structure, and number-frequency history in one place."
    $paras += "We compute the odds directly from the game's published rules, so you can see exactly what each prize tier is worth. As with every lottery game, the expected value of a ticket is below what you pay for it &mdash; it is entertainment, not an investment."
  }

  $arch = ArchiveSentence $label $hist
  if ($arch) { $paras += $arch }

  "    <section class=""prose""><h2>How $(Esc $label) works</h2>`n" +
    (($paras | ForEach-Object { "      <p>$_</p>" }) -join "`n") + "`n    </section>`n"
}

# --------------------------------------------------------------------------- #
# National page (rich: live jackpot, EV, split-risk) from data.json
# --------------------------------------------------------------------------- #
function Build-National($key) {
  $n = $NatMeta[$key]; $g = $data.games.$key; if (-not $g) { return 0 }
  $label = $g.label
  if (-not $label) { $label = $meta.$key.label }
  $evc = [math]::Round([double]$g.expected_value * 100, 1)
  $price = [double]$g.ticket_price
  $back = 100 - $evc
  $ranked = $nationals | Where-Object { $data.games.$_ } | Sort-Object { - [double]$data.games.$_.expected_value }
  $ri = [array]::IndexOf(@($ranked), $key)
  $rankWord = @("the best value", "the second-best value", "the lowest value")[$ri]
  $intro = "$label is a $($n.matrix) draw game, held every $($n.draws). As of the latest update its advertised jackpot is <strong>$(Money $g.jackpot)</strong> (a cash value of about $(Money $g.cash_value)), and the odds of matching all six numbers are <strong>$(Odds $g.odds_jackpot)</strong>. Run the real expected-value math and a `$$([int]$price) ticket is worth about <strong>$evc&cent; per dollar</strong> at this jackpot &mdash; meaning roughly $([math]::Round($back))&cent; of every dollar is the house edge. Among the three national games, that is currently <strong>$rankWord</strong>. Like every lottery game it is a negative-expected-value bet by design; these figures show which is least bad, and by how much."
  $tierRows = ""
  foreach ($t in $g.prize_tiers) { $tierRows += "<tr><td>$(Esc $t.match)</td><td>$(Money $t.prize)</td><td>$(Odds $t.odds)</td></tr>`n" }
  $rr = RecentRows $key $n.skey $n.sabbr
  $srBlock = ""
  $srg = if ($sr) { $sr.games.$key } else { $null }
  if ($srg -and $srg.upcoming) {
    $u = $srg.upcoming
    $tk = if ($u.est_lines -ge 1e6) { "$([math]::Round($u.est_lines/1e6,1)) million" } else { "{0:N0}" -f $u.est_lines }
    $pw = [math]::Round($u.p_win * 100, 1); $ps = [math]::Round($u.p_split_if_won * 100, 1)
    $srBlock = "`n    <section class=""panel""><h2>Will the $label jackpot be won or split?</h2><p>From the number of lower-tier winners in recent draws, we estimate about <strong>~$tk tickets</strong> are in play at the current jackpot &mdash; roughly a <strong>$pw% chance</strong> someone wins, and a <strong>$ps% chance</strong> it is split if hit. Estimates from past draws of a similar size, not predictions; every draw is independent. <a href=""splitrisk.html"">See the full split-risk breakdown &rarr;</a></p></section>`n"
  }
  $lastNums = ($g.winning_numbers -join ", ")
  $lastSp = if ($g.$($n.skey)) { " &nbsp;<strong>$($n.sabbr) $($g.$($n.skey))</strong>" } else { "" }
  $title = "$label &mdash; Expected Value, Odds &amp; Latest Results | NumbersIntel"
  $desc = "$label expected value, exact jackpot odds ($(Odds $g.odds_jackpot)), the full prize-tier table and recent winning numbers &mdash; with the real EV math showing what a `$$([int]$price) ticket is worth."
  $extra = @"
    <section class="panel">
      <h2>$label by the numbers</h2>
      <div class="stat-strip">
        <div class="stat"><div class="stat__label">Jackpot</div><div class="stat__value">$(Money $g.jackpot)</div></div>
        <div class="stat"><div class="stat__label">Cash value</div><div class="stat__value">$(Money $g.cash_value)</div></div>
        <div class="stat"><div class="stat__label">Jackpot odds</div><div class="stat__value">$(Odds $g.odds_jackpot)</div></div>
        <div class="stat"><div class="stat__label">Value per `$1</div><div class="stat__value">$evc&cent;</div></div>
      </div>
      <p class="section-note">"Value per `$1" is the expected value: every prize tier times its probability, after an assumed tax haircut, divided by ticket price. Always below `$1 &mdash; the lottery is negative-EV by design.</p>
    </section>
    <section class="panel">
      <h2>$label prize tiers &amp; odds</h2>
      <div class="sr-table-wrap"><table class="sr-table"><thead><tr><th scope="col">Match</th><th scope="col">Prize</th><th scope="col">Odds</th></tr></thead><tbody>
$tierRows
      </tbody></table></div>
    </section>
$srBlock
"@
  $natHp = Join-Path $root "history\$key.json"
  $natHist = if (Test-Path $natHp) { Get-Content $natHp -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
  $archN = if ($natHist) { ArchiveSentence $label $natHist } else { $null }
  $p1 = if ($key -eq 'lotto_america') {
    "$label is a multi-state jackpot game with a `$1 ticket and noticeably better odds than Powerball or Mega Millions. You pick $($n.matrix); matching all of them wins the jackpot &mdash; about $(Odds $g.odds_jackpot), more than eleven times better than the two headline games. The jackpot starts at `$2 million and rolls higher every drawing until it is won; a winner takes a 30-year annuity or a cash value of about $(Money $g.cash_value). It is drawn $($n.draws)."
  } else {
    "$label is one of America's two biggest multi-state jackpot games. You pick $($n.matrix); match every number and you win the jackpot &mdash; about $(Odds $g.odds_jackpot). The jackpot starts at a set minimum and rolls higher every drawing it goes unwon, which is how it climbs into the hundreds of millions of dollars, and a handful of times past a billion. A winner chooses a 30-year annuity or a smaller one-time cash value, currently about $(Money $g.cash_value); it is drawn $($n.draws) at `$$([int]$price) a play."
  }
  $p2 = "Below the jackpot, several fixed prize tiers hit far more often for smaller amounts &mdash; all listed in the prize table above. NumbersIntel ranks $label against the other national games by expected value per dollar: the cash value times its jackpot probability, plus every lower tier, after an assumed tax, divided by the ticket price. That figure is always well under a dollar &mdash; the lottery is negative-expected-value by design &mdash; but it shows how much of each dollar tends to come back, and how the three national games compare."
  $natAbout = "    <section class=""prose""><h2>How $label works</h2>`n      <p>$p1</p>`n      <p>$p2</p>`n" + $(if ($archN) { "      <p>$archN</p>`n" } else { "" }) + "    </section>`n"
  $extra = $natAbout + $extra
  $html = PageShell -key $key -title $title -desc $desc -label $label -back "national.html" -backLabel "US National Drawings" -intro $intro -lastNums $lastNums -lastSp $lastSp -nextDraw (DateLong $g.next_draw) -extra $extra -recent $rr -matrix $n.matrix
  return (WritePage $key $html)
}

# --------------------------------------------------------------------------- #
# State / other game page from game_meta.json + history
# --------------------------------------------------------------------------- #
function Build-State($key) {
  $m = $meta.$key; if (-not $m) { return 0 }
  $hp = Join-Path $root "history\$key.json"
  if (-not (Test-Path $hp)) { return 0 }
  $label = $m.label
  $state = $m.stateName
  $price = if ($m.ticketPrice) { $m.ticketPrice } else { "varies" }
  $draws = if ($m.draws) { $m.draws } else { "regularly" }
  $jodds = if ($m.ev -and $m.ev.odds_jackpot) { $m.ev.odds_jackpot } elseif ($m.oddsJackpot) { $m.oddsJackpot } else { $null }
  $isEv = [bool]$m.ev
  $stateLine = if ($state) { "$state " } else { "" }
  $oddsLine = if ($jodds) { " The odds of winning the top prize are <strong>$(Odds $jodds)</strong>." } else { "" }
  $analysis = if ($isEv) {
    "NumbersIntel computes its real expected value from the published prize structure, alongside the full odds table, recent results and number-frequency history."
  } else {
    "NumbersIntel tracks its full odds and prize structure, recent results and number-frequency history."
  }
  $intro = "$label is $(An $state) $stateLine" + "lottery game, drawn $draws, with tickets from $price.$oddsLine $analysis Like every lottery game it is a negative-expected-value bet &mdash; played for entertainment, not investment."

  $tbl = OddsTable $m
  $tblBlock = if ($tbl) {
    "    <section class=""panel""><h2>$label odds &amp; prizes</h2><div class=""sr-table-wrap""><table class=""sr-table"">$tbl</table></div></section>`n"
  } else { "" }

  $rr = RecentRows $key $m.specialKey $m.specialAbbr
  $lastNums = ""; $lastSp = ""
  $hist = Get-Content $hp -Raw -Encoding UTF8 | ConvertFrom-Json
  $latest = @($hist.draws) | Select-Object -Last 1
  if ($latest) {
    $lastNums = ($latest.numbers -join ", ")
    if ($m.specialKey -and $latest.$($m.specialKey)) { $lastSp = " &nbsp;<strong>$($m.specialAbbr) $($latest.$($m.specialKey))</strong>" }
  }
  $factRows = "<div class=""stat""><div class=""stat__label"">State</div><div class=""stat__value"">$(Esc $state)</div></div><div class=""stat""><div class=""stat__label"">Draws</div><div class=""stat__value"">$(Esc $draws)</div></div><div class=""stat""><div class=""stat__label"">Ticket</div><div class=""stat__value"">$(Esc $price)</div></div>"
  if ($jodds) { $factRows += "<div class=""stat""><div class=""stat__label"">Top-prize odds</div><div class=""stat__value"">$(Odds $jodds)</div></div>" }
  $extra = @"
    <section class="panel">
      <h2>$label facts</h2>
      <div class="stat-strip">$factRows</div>
    </section>
$tblBlock
"@
  $extra = (Describe $m $hist $latest) + $extra
  $title = "$label ($(Esc $state)) &mdash; Odds, Prizes &amp; Results | NumbersIntel"
  $desc = "$label ($state): full odds and prize structure, the latest winning numbers and recent results, plus number-frequency history from NumbersIntel."
  $html = PageShell -key $key -title $title -desc $desc -label $label -back "state/$($m.state.ToLower()).html" -backLabel "$state lottery" -intro $intro -lastNums $lastNums -lastSp $lastSp -nextDraw "" -extra $extra -recent $rr -matrix ""
  return (WritePage $key $html)
}

# --------------------------------------------------------------------------- #
# Shared page shell
# --------------------------------------------------------------------------- #
function PageShell($key, $title, $desc, $label, $back, $backLabel, $intro, $lastNums, $lastSp, $nextDraw, $extra, $recent, $matrix) {
  $nextNote = if ($nextDraw) { " Next drawing: $nextDraw." } else { "" }
  $lastBlock = if ($lastNums) {
    "    <section class=""panel""><h2>Latest winning numbers</h2><p style=""font-size:1.15rem""><strong>$lastNums</strong>$lastSp</p><p class=""section-note"">Most recent draw.$nextNote</p></section>`n"
  } else { "" }
  $jpHead = if ($recent.hasJp) { "<th scope=""col"">Jackpot</th>" } else { "" }
  $recentBlock = if ($recent.n -gt 0) {
    "    <section class=""panel""><h2>Recent $label results</h2><div class=""sr-table-wrap""><table class=""sr-table""><thead><tr><th scope=""col"">Draw date</th><th scope=""col"">Numbers</th>$jpHead</tr></thead><tbody>`n$($recent.rows)</tbody></table></div><p class=""section-note"">A rolling window of recent draws. Number-frequency charts are on the <a href=""game.html?game=$key"">interactive $label page</a>.</p></section>`n"
  } else { "" }
  $matrixNote = if ($matrix) { " (the number matrix is $matrix)" } else { "" }
  return @"
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/svg+xml" href="favicon.svg" />
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1281838483505325" crossorigin="anonymous"></script>
  <script src="analytics.js"></script>
  <base href="/" />
  <script defer src="nav.js"></script>
  <title>$title</title>
  <meta name="description" content="$(Esc $desc)" />
  <link rel="canonical" href="https://numbersintel.com/game/$key.html" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="NumbersIntel" />
  <meta property="og:title" content="$(Esc $label)" />
  <meta property="og:description" content="$(Esc $desc)" />
  <meta property="og:url" content="https://numbersintel.com/game/$key.html" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="detail-header">
    <a class="back-link" href="$back">&larr; $(Esc $backLabel)</a>
    <h1>$(Esc $label)</h1>
    <p class="tagline">Odds, prizes, the latest winning numbers and recent results.</p>
  </header>

  <main class="detail">
    <section class="prose"><p>$intro</p></section>
$lastBlock$extra$recentBlock
    <section class="prose">
      <h2>About this data</h2>
      <p>Every figure here comes from official lottery sources$matrixNote, refreshed after each drawing. We compute the
        odds from the game's published rules and, where the prize structure allows, the expected value of a ticket. See our
        <a href="methodology.html">methodology page</a> for the full method, and the guides on
        <a href="guides/what-is-lottery-expected-value/">expected value</a>,
        <a href="guides/lottery-odds-explained/">how the odds work</a> and
        <a href="guides/do-hot-numbers-win/">whether hot numbers win</a>.</p>
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
      <a href="methodology.html">Methodology</a>
      <a href="about.html">About</a>
    </nav>
    <p>For information and entertainment only &mdash; not financial or gambling advice.</p>
  </footer>
</body>
</html>
"@
}

# --------------------------------------------------------------------------- #
$nat = 0; $st = 0; $skipped = 0; $totWords = 0; $minWords = 99999
foreach ($key in $nationals) { $w = Build-National $key; if ($w) { $nat++; $totWords += $w; if ($w -lt $minWords) { $minWords = $w } } }
foreach ($p in $meta.PSObject.Properties) {
  $key = $p.Name
  if ($nationals -contains $key) { continue }
  if (-not (Test-Path (Join-Path $root "history\$key.json"))) { $skipped++; continue }
  $w = Build-State $key
  if ($w) { $st++; $totWords += $w; if ($w -lt $minWords) { $minWords = $w } } else { $skipped++ }
}
Write-Host ("Pre-rendered {0} national + {1} state pages ({2} skipped, no history). avg ~{3} words, min {4}." -f `
  $nat, $st, $skipped, [math]::Round($totWords / [math]::Max(1, ($nat + $st))), $minWords)

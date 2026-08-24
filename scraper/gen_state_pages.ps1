# Pre-render a RICH STATIC page for every jurisdiction we actually cover.
#
# WHY: state.html is a JS shell - 23 words of HTML before any script runs - and
# every ?state=XX variant is BYTE-IDENTICAL to a crawler. Submitting 47 of them
# in the sitemap is 47 duplicate near-empty URLs, which is exactly the "low value
# content" pattern that got the site rejected. Same fix as gen_game_pages.ps1:
# emit real HTML with content that genuinely differs per state.
#
# Everything on the page is derived from data we already hold - the games in that
# state, their prices, draw days and published odds, the most winnable game, the
# latest drawn numbers, and our scratch-ticket coverage - so no two pages read
# alike and nothing is invented.
#
# Sources: game_meta.json (games, odds, prices), state_odds.json (most winnable),
#          scratch_summary.json (scratch coverage), history/<key>.json (results).
# Output:  state/<abbr>.html
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

$meta = Get-Content (Join-Path $root "game_meta.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$odds = $null
$oddsPath = Join-Path $root "state_odds.json"
if (Test-Path $oddsPath) { $odds = Get-Content $oddsPath -Raw -Encoding UTF8 | ConvertFrom-Json }
$scr = $null
$scrPath = Join-Path $root "scratch_summary.json"
if (Test-Path $scrPath) { $scr = Get-Content $scrPath -Raw -Encoding UTF8 | ConvertFrom-Json }

$outDir = Join-Path $root "state"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory $outDir | Out-Null }

function Esc($s) { "$s" -replace '&(?!(amp|lt|gt|quot|#\d+|nbsp|middot|mdash|ndash|rarr|larr|cent|hellip);)', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;' }
function Odds($n) { if (-not $n) { return "&mdash;" }; "1 in " + ("{0:N0}" -f [long]$n) }
function Money($n) {
  if ($null -eq $n) { return "&mdash;" }
  if ($n -ge 1e9) { return "`$" + [math]::Round($n/1e9,2) + "bn" }
  if ($n -ge 1e6) { return "`$" + [math]::Round($n/1e6,1) + "m" }
  return "`$" + ("{0:N0}" -f [double]$n)
}
function DateLong($iso) { try { ([datetime]$iso).ToString("MMMM d, yyyy") } catch { "$iso" } }

# Group every tracked game by the jurisdiction it belongs to.
$byState = @{}
foreach ($p in $meta.PSObject.Properties) {
  $g = $p.Value
  if (-not $g.state) { continue }               # nationals carry no state
  $st = [string]$g.state
  if (-not $byState.ContainsKey($st)) { $byState[$st] = New-Object System.Collections.ArrayList }
  [void]$byState[$st].Add([pscustomobject]@{
    key = $p.Name; label = $g.label; price = $g.ticketPrice; draws = $g.draws
    stateName = $g.stateName
    jackpotOdds = $(if ($g.ev -and $g.ev.odds_jackpot) { [double]$g.ev.odds_jackpot } else { $null })
    overall = $(if ($g.ev -and $g.ev.overall_odds) { [double]$g.ev.overall_odds } else { $null })
  })
}

# One pass over a game's archive: latest draw, how deep the record goes, the
# jackpot range, and how often each number has come up. These are the figures
# that make one state's page genuinely different from another's - generic prose
# does not, and 45 pages of shared boilerplate is the very thing being fixed.
function GameStats($key) {
  $hp = Join-Path $root "history/$key.json"
  if (-not (Test-Path $hp)) { return $null }
  try { $h = Get-Content $hp -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
  $draws = @($h.draws)
  if (-not $draws.Count) { return $null }
  $sorted = @($draws | Sort-Object date)
  $latest = $sorted[$sorted.Count - 1]

  # MATRIX AWARENESS. Ball counts change: Texas Cash Five once drew from a larger
  # pool, so balls 36-39 appear ~160 times against ~1,250 for the rest. Counting
  # the whole archive makes that look like a 687% frequency "gap" - which is not
  # random variation at all, it is two different games stacked on top of each
  # other. Infer the CURRENT pool from recent draws and count only the draws that
  # fit it, so the comparison is like-for-like.
  $recent = @($sorted | Select-Object -Last 100)
  $curMax = 0
  foreach ($d in $recent) { foreach ($n in @($d.numbers)) { if ([int]$n -gt $curMax) { $curMax = [int]$n } } }

  $freq = @{}
  $eraCount = 0
  $eraFirst = $null
  foreach ($d in $sorted) {
    $nums = @($d.numbers)
    if (-not $nums.Count) { continue }
    $fits = $true
    foreach ($n in $nums) { if ([int]$n -gt $curMax) { $fits = $false; break } }
    if (-not $fits) { continue }               # a draw from an older, larger matrix
    if (-not $eraFirst) { $eraFirst = $d.date }
    $eraCount++
    foreach ($n in $nums) { $k = [int]$n; $freq[$k] = 1 + [int]$freq[$k] }
  }
  # Digit games (Pick 3 / Numbers) draw 0-9; ball games start at 1. Take the floor
  # from the data rather than assuming, so the pool is described accurately.
  $curMin = 1
  foreach ($d in $sorted) { foreach ($n in @($d.numbers)) { if ([int]$n -eq 0) { $curMin = 0 } } }
  # Every ball in the current pool, including any not yet drawn this era.
  for ($i = $curMin; $i -le $curMax; $i++) { if (-not $freq.ContainsKey($i)) { $freq[$i] = 0 } }

  $jmin = $null; $jmax = $null
  foreach ($d in $draws) {
    if ($d.jackpot -and [double]$d.jackpot -gt 0) {
      $v = [double]$d.jackpot
      if ($null -eq $jmin -or $v -lt $jmin) { $jmin = $v }
      if ($null -eq $jmax -or $v -gt $jmax) { $jmax = $v }
    }
  }
  [pscustomobject]@{
    date = $latest.date; numbers = @($latest.numbers); jackpot = $latest.jackpot
    count = $draws.Count; firstDate = $sorted[0].date
    freq = $freq; jmin = $jmin; jmax = $jmax
    eraCount = $eraCount; eraFirst = $eraFirst; curMax = $curMax; curMin = $curMin
  }
}

$made = 0
foreach ($abbr in ($byState.Keys | Sort-Object)) {
  # UK has its own hand-written uk.html; a second page would be duplicate content.
  if ($abbr -eq "UK") { continue }
  $games = @($byState[$abbr] | Sort-Object { if ($_.jackpotOdds) { -1 * $_.jackpotOdds } else { 0 } })
  if ($games.Count -lt 1) { continue }
  $name = $games[0].stateName
  if (-not $name) { $name = $abbr }
  $slug = $abbr.ToLower()

  # --- most winnable game (published matrices, not a model)
  $best = $null
  if ($odds -and $odds.states.PSObject.Properties.Name -contains $abbr) { $best = $odds.states.$abbr.best }

  # --- game table with a real recent result per game
  $rows = ""
  $resultBits = New-Object System.Collections.ArrayList
  $totalDraws = 0
  $flagship = $null; $flagshipStats = $null
  foreach ($g in $games) {
    $st = GameStats $g.key
    $when = if ($st) { DateLong $st.date } else { "&mdash;" }
    $archive = if ($st) { "{0:N0} <span class=`"sc-muted sc-small`">since {1}</span>" -f $st.count, ([datetime]$st.firstDate).Year } else { "&mdash;" }
    if ($st) { $totalDraws += $st.count }
    $rows += "<tr><th scope=`"row`"><a href=`"game/$($g.key).html`">$(Esc $g.label)</a></th>" +
             "<td>$(if ($g.price) { Esc $g.price } else { '&mdash;' })</td>" +
             "<td>$(if ($g.draws) { Esc $g.draws } else { '&mdash;' })</td>" +
             "<td>$(Odds $g.jackpotOdds)</td><td>$archive</td><td>$when</td></tr>`n"
    if ($st -and $resultBits.Count -lt 3) {
      [void]$resultBits.Add("<li><strong>$(Esc $g.label)</strong> &mdash; $(DateLong $st.date): " +
        "<span class=`"st-nums`">$(($st.numbers | ForEach-Object { "<b>$_</b>" }) -join " ")</span></li>")
    }
    # Flagship = the deepest archive, i.e. the game with the most to say.
    if ($st -and (-not $flagshipStats -or $st.count -gt $flagshipStats.count)) { $flagship = $g; $flagshipStats = $st }
  }

  # --- number frequency for the state's deepest-archive game: real, specific,
  #     and different on every page.
  $freqBlock = ""
  if ($flagshipStats -and $flagshipStats.curMax -ge 5 -and $flagshipStats.eraCount -ge 200) {
    $ranked = @($flagshipStats.freq.GetEnumerator() | Sort-Object -Property @{Expression={$_.Value}; Descending=$true}, @{Expression={$_.Key}})
    $hot = @($ranked | Select-Object -First 5)
    $cold = @($ranked | Select-Object -Last 5)
    $lowest = [double]$cold[$cold.Count-1].Value
    $span = if ($lowest -gt 0) { [math]::Round(100.0 * ($hot[0].Value - $lowest) / $lowest) } else { 999 }
    # After filtering to one matrix a fair game lands within a modest band. A big
    # spread that survives means something else is going on (another undetected
    # matrix change, a partial archive) - say nothing rather than call it noise.
    if ($span -le 40) {
      $hotTxt = ($hot | ForEach-Object { "<b>$($_.Key)</b> ($($_.Value))" }) -join ", "
      $coldTxt = ($cold | ForEach-Object { "<b>$($_.Key)</b> ($($_.Value))" }) -join ", "
      $freqBlock = "<section class=`"panel`"><h2>Which numbers come up most in $(Esc $flagship.label)?</h2>" +
        "<p>Across <strong>$("{0:N0}" -f $flagshipStats.eraCount)</strong> $(Esc $flagship.label) draws on its " +
        "current $($flagshipStats.curMin)&ndash;$($flagshipStats.curMax) number pool (since $(([datetime]$flagshipStats.eraFirst).Year)), " +
        "the most-drawn numbers are $hotTxt. The least-drawn are $coldTxt.</p>" +
        "<p class=`"section-note`">The commonest number leads the rarest by about <strong>$span%</strong> " +
        "&mdash; and that means nothing. Across this many draws ordinary random variation produces spreads of " +
        "roughly this size; a fair game would almost never land every number on an identical count. No number " +
        "is &quot;due&quot;, and none of this predicts the next draw. We only count draws from the game's " +
        "current number pool, because earlier draws used a different one and mixing them invents a pattern " +
        "that was never there. <a href=`"guides/do-hot-numbers-win/`">We tested whether hot numbers actually " +
        "win</a>.</p></section>"
    }
  }

  # --- jackpot range on the flagship, where it rolls
  $jackpotBlock = ""
  if ($flagshipStats -and $flagshipStats.jmin -and $flagshipStats.jmax -and $flagshipStats.jmax -gt $flagshipStats.jmin * 1.5) {
    $jackpotBlock = "<p>$(Esc $flagship.label)'s advertised jackpot has ranged from " +
      "<strong>$(Money $flagshipStats.jmin)</strong> to <strong>$(Money $flagshipStats.jmax)</strong> " +
      "across the draws we hold.</p>"
  }

  $bestBlock = ""
  if ($best) {
    $bestBlock = "<section class=`"panel`"><h2>The most winnable game in $(Esc $name)</h2>" +
      "<p>Of the $($games.Count) $(Esc $name) draw games we track, <strong>$(Esc $best.label)</strong> has the " +
      "shortest odds on its top prize at <strong>$(Odds $best.odds)</strong>" +
      $(if ($best.price) { " (" + (Esc $best.price) + " a play)" } else { "" }) + ". " +
      "Shorter odds mean a smaller prize &mdash; that is the trade every lottery makes &mdash; but it is the " +
      "game in $(Esc $name) where the top prize is least out of reach. " +
      "<a href=`"bestodds.html`">Compare every state</a>.</p></section>"
  }

  $resultsBlock = ""
  if ($resultBits.Count) {
    $resultsBlock = "<section class=`"panel`"><h2>Latest $(Esc $name) results</h2><ul class=`"st-results`">" +
      ($resultBits -join "`n") + "</ul><p class=`"section-note`">Straight from each game's archive, " +
      "refreshed after every draw. Full history and number-frequency statistics are on each game's page.</p></section>"
  }

  # --- scratch coverage, where we have it
  $scratchBlock = ""
  if ($scr -and $scr.by_state -and ($scr.by_state.PSObject.Properties.Name -contains $abbr)) {
    $s = $scr.by_state.$abbr
    $valBit = if ($null -ne $s.avg_ev_now) {
      "Across the $($s.games) games we can price, the average return is <strong>$([math]::Round($s.avg_ev_now * 100))&cent; per `$1</strong>."
    } else {
      "$(Esc $name) publishes prize data without a ticket price, so those $($s.games) games are ranked by how much prize money is genuinely unclaimed."
    }
    $goneBit = if ($s.no_top_prize -gt 0) {
      " <strong>$($s.no_top_prize)</strong> $(if ($s.no_top_prize -eq 1) { 'game is' } else { 'games are' }) still on sale with no top prize left at all."
    } else { "" }
    $scratchBlock = "<section class=`"panel`"><h2>$(Esc $name) scratch tickets</h2>" +
      "<p>We also track every $(Esc $name) scratch game by what it has actually got left. $valBit$goneBit</p>" +
      "<p><a class=`"btn`" href=`"scratch/$($s.slug).html`">See $(Esc $name) scratch games &rarr;</a></p></section>"
  }

  $desc = "Every $name lottery game we track: ticket prices, draw days, published top-prize odds and the latest results" +
          $(if ($best) { ", plus the most winnable game in the state" } else { "" }) + "."

  $html = @"
<!DOCTYPE html>
<html lang="en">
<head>
  <base href="/" />
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/svg+xml" href="favicon.svg" />
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1281838483505325"
     crossorigin="anonymous"></script>
  <script src="analytics.js"></script>
  <script defer src="nav.js"></script>
  <script defer src="schema.js"></script>
  <title>$(Esc $name) Lottery: Games, Odds &amp; Latest Results | NumbersIntel</title>
  <meta name="description" content="$(Esc $desc)" />
  <link rel="canonical" href="https://numbersintel.com/state/$slug.html" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="NumbersIntel" />
  <meta property="og:image" content="https://numbersintel.com/og-image.png" />
  <meta property="og:title" content="$(Esc $name) Lottery: Games, Odds &amp; Results" />
  <meta property="og:description" content="$(Esc $desc)" />
  <meta property="og:url" content="https://numbersintel.com/state/$slug.html" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="detail-header">
    <a class="back-link" href="states.html">&larr; All states</a>
    <h1>$(Esc $name) Lottery</h1>
    <p class="tagline">The $($games.Count) $(Esc $name) draw games we track &mdash; odds, prices and what each
      is actually worth.</p>
  </header>

  <main class="detail">
    <section class="prose">
      <p class="lead">Most lottery sites stop at the winning numbers. For each of $(Esc $name)'s
        <strong>$($games.Count)</strong> draw games we publish the exact odds from the game's own number
        matrix, the full prize table, and where the prizes are fixed, the expected value per dollar &mdash;
        the figure that says what a ticket is really worth.</p>
    </section>

    $bestBlock

    <section class="panel">
      <h2>Every $(Esc $name) draw game</h2>
      <div class="sr-table-wrap"><table class="sr-table">
        <thead><tr><th scope="col">Game</th><th scope="col">Ticket</th><th scope="col">Draws</th>
          <th scope="col">Top-prize odds</th><th scope="col">Archive</th><th scope="col">Latest draw</th></tr></thead>
        <tbody>
$rows        </tbody>
      </table></div>
      <p class="section-note">We hold <strong>$("{0:N0}" -f $totalDraws)</strong> $(Esc $name) draws in total.
        Odds come from each game's published number matrix, not from a model; where a game's lower tiers are
        pari-mutuel we show odds only rather than invent a value per dollar.</p>
      $jackpotBlock
    </section>

    $freqBlock

    $resultsBlock

    $scratchBlock

    <section class="panel">
      <h2>National games played in $(Esc $name)</h2>
      <p>$(Esc $name) players can also buy the multi-state games, which we cover in more depth than any state
        game because they publish per-tier winner counts &mdash; letting us estimate how many tickets are in
        play and the odds a jackpot is shared. See
        <a href="game/powerball.html">Powerball</a>, <a href="game/mega_millions.html">Mega Millions</a>,
        <a href="game/lotto_america.html">Lotto America</a>, or
        <a href="valueheat.html">how tonight's draw ranks against history</a>.</p>
    </section>

    <p class="disclaimer">
      Not affiliated with the $(Esc $name) Lottery or any lottery operator. Figures are derived from
      published odds and results; always check the official source before claiming a prize. For information
      and entertainment only &mdash; not financial or gambling advice. You must be 18+ to play (21+ in some
      states). If gambling is a problem for you or someone you know, call
      <strong>1-800-GAMBLER</strong> (<a href="tel:18004262537">1-800-426-2537</a>).
    </p>
  </main>

  <footer class="site-footer">
    <nav class="footer-nav">
      <a href="index.html">Home</a>
      <a href="states.html">All states</a>
      <a href="national.html">National games</a>
      <a href="guides/">Guides</a>
      <a href="methodology.html">Methodology</a>
    </nav>
    <p>For information and entertainment only &mdash; not financial or gambling advice.</p>
  </footer>
</body>
</html>
"@

  $path = Join-Path $outDir "$slug.html"
  [System.IO.File]::WriteAllText($path, $html, (New-Object System.Text.UTF8Encoding $false))
  $made++
  $words = ((($html -replace '(?s)<script.*?</script>', ' ') -replace '<[^>]+>', ' ') -replace '\s+', ' ').Trim().Split(' ').Count
  Write-Host ("  {0,-3} {1,-22} {2,2} games  {3,4} words" -f $abbr, $name, $games.Count, $words)
}
Write-Host "gen_state_pages: wrote $made state pages"

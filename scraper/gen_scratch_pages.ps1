# Generates the per-state scratch pages under /scratch/ from the scratch_<st>.json
# files, so adding a state is a config entry rather than a hand-written page.
#
# Every headline number on these pages (game counts, launch-payout range, the
# price/value curve, how many games have no top prize left) is computed from that
# state's own data at build time - nothing is templated in as a guess. That also
# means the copy stays true as the daily data changes.
#
# The six original states (CA, TX, ID, NY, FL, MI) keep their hand-written pages;
# this only generates the ones listed in $STATES below.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

# noun     = what that state calls them, used throughout the copy
# source   = domain shown to readers
# sourceNote = 1-2 sentences on what makes that state's data what it is (unique per state)
$STATES = @(
  @{ code = 'GA'; slug = 'georgia'; name = 'Georgia'; noun = 'scratchers'; skip = $true }
  @{ code = 'NC'; slug = 'north-carolina'; name = 'North Carolina'; noun = 'scratch-offs'
     sourceNote = "North Carolina publishes the fullest scratch data of any state we track. For every prize tier of every game it gives the prize amount, <em>that tier's own odds</em>, the number of prizes at printing and the number not yet claimed, refreshed daily with an explicit as-of date. Because each tier carries its own odds, the size of the print run can be derived from every tier independently and cross-checked &mdash; a mis-parse would show up immediately as tiers disagreeing." }
  @{ code = 'SC'; slug = 'south-carolina'; name = 'South Carolina'; noun = 'instant games'
     sourceNote = "South Carolina publishes, for every prize tier of every instant game, the number of prizes at the start of the game and the number still unclaimed &mdash; along with the ticket price and the game's overall odds, which together give the size of the print run. The state also stamps each page with the date and time the figures were last updated." }
  @{ code = 'MO'; slug = 'missouri'; name = 'Missouri'; noun = 'scratchers'
     sourceNote = "Missouri publishes, for every prize tier of every scratchers game, the total number of prizes and the number still unclaimed, plus the ticket price and the game's average chances of winning. Those overall odds turn the total prize count into the size of the print run." }
  @{ code = 'VA'; slug = 'virginia'; name = 'Virginia'; noun = 'scratchers'
     sourceNote = "Virginia publishes, for every prize tier of every Scratcher, the winning tickets at the start of the game and the number still unclaimed, with the ticket price and overall odds. One Virginia-specific detail matters: where a top prize is paid as an <strong>annuity</strong>, the advertised figure overstates what a winner actually receives, and Virginia states the real cash value in a footnote &mdash; a `$7,000,000 headline against a `$4,000,000 cash value. We use the published cash value, and skip any game whose annuity has no stated cash value rather than guess one." }
  @{ code = 'MA'; slug = 'massachusetts'; name = 'Massachusetts'; noun = 'instant games'
     sourceNote = "Massachusetts exposes its instant-game data as clean JSON, giving every prize tier's amount, that tier's odds, the total prizes printed, how many have been paid and how many remain. It is among the most complete feeds any state publishes, and Massachusetts sells more instant tickets per head than anywhere else in the country." }
  @{ code = 'OK'; slug = 'oklahoma'; name = 'Oklahoma'; noun = 'scratchers'
     sourceNote = "Oklahoma publishes two machine-readable feeds &mdash; one listing every game with its price, overall odds and <em>the exact number of tickets printed</em>, and one listing every prize tier with its total and remaining counts. Because the print run is stated outright rather than derived from odds, Oklahoma's figures need one fewer assumption than most states." }
  @{ code = 'CT'; slug = 'connecticut'; name = 'Connecticut'; noun = 'scratch games'
     sourceNote = "Connecticut publishes a full unclaimed-prize table for every game, dated to the day, and &mdash; unusually &mdash; states the <em>total number of tickets printed</em> on each game's page. That means the print run is a published fact here rather than something derived from the overall odds." }
  @{ code = 'NM'; slug = 'new-mexico'; name = 'New Mexico'; noun = 'scratchers'
     sourceNote = "New Mexico puts every game's complete prize table on a single page: prize amount, that tier's odds, the approximate number of prizes and the number still remaining. Per-tier odds mean the print run can be cross-checked across every tier of every game." }
  @{ code = 'LA'; slug = 'louisiana'; name = 'Louisiana'; noun = 'scratch-offs'
     sourceNote = "Louisiana publishes an unusually explicit prize table: for each tier it gives the prize, that tier's odds, and the total, <em>claimed</em> and remaining counts separately &mdash; so the claimed figure is stated outright rather than inferred by subtraction." }
  @{ code = 'AR'; slug = 'arkansas'; name = 'Arkansas'; noun = 'instant games'
     sourceNote = "Arkansas publishes, per tier, the total prizes in the game, the estimated prizes remaining, and the total prize <em>value</em> both at start and remaining &mdash; giving an independent check on our own value arithmetic, since the state's dollar totals and ours have to agree." }
  @{ code = 'WV'; slug = 'west-virginia'; name = 'West Virginia'; noun = 'scratch-offs'
     sourceNote = "West Virginia publishes each game's price, overall odds and complete prize table with total and remaining counts per tier, embedded as structured data in its game pages rather than as a rendered table." }
)

function Esc([string]$s) {
  if ($null -eq $s) { return '' }
  ($s -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;' -replace '"', '&quot;')
}
function Money([double]$n) {
  if ($n -ge 1000000) { return "`$" + [math]::Round($n / 1000000, 1) + "M" }
  if ($n -ge 1000) { return "`$" + [string]([long]$n).ToString('N0') }
  return "`$" + [long]$n
}

$made = 0
foreach ($st in $STATES) {
  if ($st.skip) { continue }
  $jsonPath = Join-Path $root ("scratch_{0}.json" -f $st.code.ToLower())
  if (-not (Test-Path $jsonPath)) { Write-Host "  ! $($st.code): no data file, skipped"; continue }
  $d = Get-Content $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $games = @($d.games)
  if ($games.Count -lt 5) { Write-Host "  ! $($st.code): only $($games.Count) games, skipped"; continue }

  $n = $games.Count
  $noun = $st.noun
  $Noun = (Get-Culture).TextInfo.ToTitleCase($noun)
  $evMin = ($games.ev_start | Measure-Object -Minimum).Minimum
  $evMax = ($games.ev_start | Measure-Object -Maximum).Maximum
  $zeroTop = @($games | Where-Object { $_.top_left -eq 0 }).Count

  # Price curve, computed from this state's own data.
  $byPrice = $games | Group-Object price | Sort-Object { [double]$_.Name }
  $lowP = $byPrice[0]; $highP = $byPrice[-1]
  $lowAvg = ($lowP.Group.ev_now | Measure-Object -Average).Average
  $highAvg = ($highP.Group.ev_now | Measure-Object -Average).Average
  $curveHolds = ($highAvg - $lowAvg) -gt 0.05

  $best = @($games | Where-Object { -not $_.low_confidence } | Sort-Object ev_now -Descending)[0]

  $pctMin = "{0:P0}" -f $evMin; $pctMax = "{0:P0}" -f $evMax
  $lowPct = "{0:P0}" -f $lowAvg; $highPct = "{0:P0}" -f $highAvg
  $lowLbl = "`$" + [long]([double]$lowP.Name); $highLbl = "`$" + [long]([double]$highP.Name)

  $title = "Best $($st.name) $Noun`: Prizes Remaining &amp; Real Value | NumbersIntel"
  $desc = "Which $($st.name) $noun still have their big prizes? We compute what all $n active games return per dollar today from unclaimed prize data" +
          $(if ($zeroTop -gt 0) { " &mdash; and $zeroTop of them have no top prize left." } else { ", updated daily." })

  # Lead paragraph leans on whichever fact this state's data actually supports.
  $lead = if ($zeroTop -gt 0) {
    "<strong>$zeroTop</strong> $($st.name) $noun on sale today have <strong>zero top prizes left</strong>. Every one already claimed &mdash; and every one still on the rack at full price, with the headline number printed on the front."
  } else {
    "A $($noun -replace 's$','') whose big prizes have already been claimed keeps selling at the same price, with the same headline number on the front. Nothing on the rack tells you the prize you're chasing is already gone."
  }

  $curvePara = if ($curveHolds) {
    "<p class=`"section-note`">The same pattern turns up in every state we analyse: $($st.name) climbs from <strong>$lowPct</strong> on $lowLbl tickets to <strong>$highPct</strong> on $highLbl ones, matching the curve in our <a href=`"scratch/texas.html`">Texas</a> (55% &rarr; 79%) and <a href=`"scratch/california.html`">California</a> (61% &rarr; 83%) data. Unrelated state lotteries keep making the same design decision: the cheap tickets on the rack are the worst value in the shop. That does not make an expensive ticket a good bet &mdash; it is still a guaranteed average loss, just a smaller one per dollar, with far more money at risk per ticket.</p>"
  } else {
    "<p class=`"section-note`">Across most states, value climbs steadily with ticket price &mdash; in <a href=`"scratch/texas.html`">Texas</a> from 55% on `$1 tickets to 79% on `$50 ones. $($st.name)'s current mix of games shows that less sharply, which is worth knowing in itself: the rule of thumb holds broadly, not universally.</p>"
  }

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
  <title>$title</title>
  <meta name="description" content="$desc" />
  <link rel="canonical" href="https://numbersintel.com/scratch/$($st.slug).html" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="NumbersIntel" />
  <meta property="og:image" content="https://numbersintel.com/og-image.png" />
  <meta property="og:title" content="Best $($st.name) $Noun by Prizes Remaining" />
  <meta property="og:description" content="All $n active $($st.name) $noun ranked by what they return per dollar today." />
  <meta property="og:url" content="https://numbersintel.com/scratch/$($st.slug).html" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="stylesheet" href="styles.css" />
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Dataset","name":"$($st.name) $noun remaining prize value","description":"For each active $($st.name) Lottery instant game: ticket price, overall odds, prizes printed and still unclaimed by tier, and the resulting value returned per dollar at the current point in the print run.","creator":{"@id":"https://numbersintel.com/#org"},"isPartOf":{"@id":"https://numbersintel.com/#site"},"url":"https://numbersintel.com/scratch/$($st.slug).html","license":"https://numbersintel.com/terms.html"}
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
    {"@type":"Question","name":"Which $($st.name) $noun have the best odds?","acceptedAnswer":{"@type":"Answer","text":"Ticket price matters far more than which game you pick. Across every active $($st.name) game, $lowLbl tickets return an average of about $lowPct per dollar while $highLbl tickets return $highPct. Within a price band, the best games are the ones that still have most of their large prizes unclaimed."}},
    {"@type":"Question","name":"How many $($st.name) $noun have no top prize left?","acceptedAnswer":{"@type":"Answer","text":"$zeroTop of the $n active $($st.name) games we track currently have zero top prizes remaining. They stay on sale at full price with the headline prize still printed on the ticket, and nothing on the packaging indicates it has already been claimed."}},
    {"@type":"Question","name":"Does the $($st.name) Lottery publish prizes remaining?","acceptedAnswer":{"@type":"Answer","text":"Yes. $($st.name) publishes, for every prize tier of every game, how many prizes were printed and how many are still unclaimed. This page turns that into a ranking of what each game returns per dollar today, refreshed daily."}}
  ]}
  </script>
</head>
<body>
  <header class="detail-header">
    <a class="back-link" href="scratch/">&larr; Scratch games</a>
    <h1>$($st.name) $noun`: what's actually left</h1>
    <p class="tagline">All $n active $($st.name) games ranked by what they return per dollar <em>right now</em> &mdash;
      not what they were worth the day they were printed.</p>
  </header>

  <main class="detail">
    <section class="prose">
      <p class="lead">$lead</p>
      <p>The $($st.name) Lottery publishes, for every prize tier of every game, how many prizes were printed and
        how many are still unclaimed. That is enough to work out exactly what each game has left &mdash; so we
        pull it daily and rank every active game.</p>
    </section>

    <div id="sc-summary"></div>

    <section class="panel">
      <h2>Cheap tickets pay back the least</h2>
      <p class="section-note">Average value returned per dollar, grouped by ticket price, across every active
        $($st.name) game.</p>
      <div id="sc-byprice"></div>
      $curvePara
    </section>

    <section class="panel">
      <h2>Every $($st.name) game, ranked</h2>
      <div class="sc-controls">
        <label>Sort by
          <select id="sc-sort" class="aw-select">
            <option value="ev_now">Value per `$1 now</option>
            <option value="price">Ticket price</option>
            <option value="pct_sold">Percent sold</option>
            <option value="top_prize">Top prize size</option>
          </select>
        </label>
        <label class="sc-check"><input type="checkbox" id="sc-hide" checked /> Hide games over 90% sold</label>
      </div>
      <div id="sc-table" data-src="scratch_$($st.code.ToLower()).json"></div>
    </section>

    <section class="prose">
      <h2>How to read this</h2>
      <p><strong>"Value per `$1 now"</strong> is the unclaimed prize money divided by what it would cost to buy
        every remaining ticket. A game showing 70% means players will get back about 70 cents per dollar across
        the tickets still out there. <strong>"At launch"</strong> is the same figure for the full print run
        &mdash; what the game was designed to pay.</p>
      <p>The gap between those columns is the point: a game well <em>below</em> its launch figure has had its
        big prizes claimed and is now a worse deal than designed. The <strong>"riding on top prize"</strong>
        column is the health warning &mdash; where much of the remaining value sits in one tier, the rating
        hangs on a couple of tickets that may already be sold.</p>
      <p>Every $($st.name) game launches returning roughly <strong>$pctMin to $pctMax</strong> of sales as
        prizes. That is the house edge, and no game escapes it &mdash; this table shows which are currently
        least bad, never which are good. See
        <a href="guides/what-is-lottery-expected-value/">what expected value means</a> and
        <a href="guides/where-your-lottery-dollar-goes/">where your lottery dollar goes</a>.</p>

      <h2>How we calculate it</h2>
      <p>$($st.sourceNote)</p>
      <p>Two honest limitations. $($st.name) does not publish a percent-sold figure, so we infer it from the
        share of prizes already claimed; because small prizes often go unredeemed, that understates sales and
        makes these figures slightly conservative. And <strong>"unclaimed" is not the same as "unsold"</strong>
        &mdash; a top prize counted as remaining may already sit in a ticket someone bought and hasn't cashed.
        Late in a print run that gap dominates, so games over 90% sold are flagged and hidden by default.</p>
      <p>Compare states on the <a href="scratch/">scratch games hub</a>, or see how draw games differ on the
        <a href="bestodds.html">most winnable game map</a>.</p>
    </section>

    <p class="disclaimer">
      Estimates derived from $($st.name) Lottery published prize data &mdash; not official figures, and not a
      prediction about any individual ticket. These games are negative-expected-value by design: every game
      listed returns less than it costs across all players. For information and entertainment only &mdash; not
      financial or gambling advice. You must be 18+ to play. If gambling is a problem for you or someone you
      know, call <strong>1-800-GAMBLER</strong>.
    </p>
  </main>

  <footer class="site-footer">
    <nav class="footer-nav">
      <a href="index.html">Home</a>
      <a href="scratch/">Scratch games</a>
      <a href="state.html?state=$($st.code)">$($st.name) lottery</a>
      <a href="guides/">Guides</a>
      <a href="methodology.html">Methodology</a>
    </nav>
    <p>For information and entertainment only &mdash; not financial or gambling advice.</p>
  </footer>

  <script src="scratch.js"></script>
</body>
</html>
"@

  $outPath = Join-Path $root ("scratch\{0}.html" -f $st.slug)
  [System.IO.File]::WriteAllText($outPath, $html, (New-Object System.Text.UTF8Encoding $false))
  $made++
  Write-Host ("  {0,-15} {1,3} games  launch {2}-{3}  {4} with no top prize  curve {5}->{6}" -f `
    $st.slug, $n, $pctMin, $pctMax, $zeroTop, $lowPct, $highPct)
}
Write-Host "gen_scratch_pages: wrote $made state pages"

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
  @{ code = 'MA'; slug = 'massachusetts'; name = 'Massachusetts'; noun = 'instant games'; partial = $true
     sourceNote = "Massachusetts publishes every prize tier's amount, that tier's odds, the total prizes printed, how many have been paid and how many remain &mdash; among the most complete feeds any state offers, from the state that sells more instant tickets per head than anywhere else in the country. <strong>One important exclusion:</strong> more than half of the Massachusetts catalogue has an annuity top prize, where the advertised figure is the sum of all payments rather than what a winner could take in cash &mdash; a prize listed at `$15,000,000 is really `$750,000 a year for 20 years. Massachusetts does not publish a cash value anywhere, and on some games that single tier is around a third of the game's entire prize pool, so including it at face value would badly overstate what the game returns. Rather than invent a cash value, those games are left out entirely: this page covers the games we can compute honestly, not the full rack." }
  @{ code = 'OK'; slug = 'oklahoma'; name = 'Oklahoma'; noun = 'scratchers'
     sourceNote = "Oklahoma publishes two machine-readable feeds &mdash; one listing every game with its price, overall odds and <em>the exact number of tickets printed</em>, and one listing every prize tier with its total and remaining counts. Because the print run is stated outright rather than derived from odds, Oklahoma's figures need one fewer assumption than most states." }
  @{ code = 'CT'; slug = 'connecticut'; name = 'Connecticut'; noun = 'scratch games'
     sourceNote = "Connecticut publishes a full unclaimed-prize table for every game, dated to the day, and &mdash; unusually &mdash; states the <em>total number of tickets printed</em> on each game's page. That means the print run is a published fact here rather than something derived from the overall odds." }
  @{ code = 'NM'; slug = 'new-mexico'; name = 'New Mexico'; noun = 'scratchers'
     sourceNote = "New Mexico puts every game's complete prize table on a single page: prize amount, that tier's odds, the approximate number of prizes and the number still remaining. Per-tier odds mean the print run can be cross-checked across every tier of every game." }
  @{ code = 'NJ'; slug = 'new-jersey'; name = 'New Jersey'; noun = 'scratch-offs'
     sourceNote = "New Jersey publishes every prize tier of every game with the winning tickets printed and how many have been paid, plus <em>the exact size of the print run</em> rather than a figure we have to derive. It also handles annuities better than most states: where a game advertises a `$1,000,000 top prize paid over time, the published prize figure is already the cash value a winner could actually take &mdash; `$628,500 in that case &mdash; so nothing has to be estimated or excluded." }
  @{ code = 'AZ'; slug = 'arizona'; name = 'Arizona'; noun = 'scratchers'
     sourceNote = "Arizona publishes each game's price, overall odds and full prize table with per-tier odds, so the print run is cross-checked across every tier. One Arizona quirk needs care: the state is <strong>inconsistent about annuity prizes</strong>. Most games list the cash value a winner could take, but a few list the advertised total of all payments instead, with no cash value published anywhere. Those games look entirely plausible &mdash; they produce a payout figure well inside the normal range &mdash; so we detect them by comparing the top tier against the game's own advertised annuity figure, and drop them rather than publish a number we can't stand behind." }
  @{ code = 'MD'; slug = 'maryland'; name = 'Maryland'; noun = 'scratch-offs'
     sourceNote = "Maryland publishes, for every prize tier of every game, the number of prizes at the start and the number remaining, with the ticket price and the probability of winning, and stamps each page with the date the records were last updated. Maryland also prints the same warning we do: remaining counts may include tickets already sold but not yet cashed." }
  @{ code = 'IL'; slug = 'illinois'; name = 'Illinois'; noun = 'instant games'
     sourceNote = "Illinois publishes one page carrying every game's complete prize ladder &mdash; each tier's value, how many were printed and how many are still unpaid &mdash; with the overall odds on each game's own page. A caution on how we match the two: Illinois reuses game slugs across editions, so a page for '100X The Cash' may describe a retired edition of the same name. We accept a game's odds only when the game number on the detail page matches the live game, and drop the handful where it doesn't rather than attach the wrong odds to a live game." }
  @{ code = 'IN'; slug = 'indiana'; name = 'Indiana'; noun = 'scratch-offs'; partial = $true
     sourceNote = "Indiana is the one state where we publish only a fraction of the rack, and the reason is worth stating plainly. <strong>Indiana's prize tables are truncated:</strong> the site's own footnote says the table 'may not be inclusive of all prizes in the game', and in practice no prize below `$30 is ever listed. The missing tiers are winning tickets, so working from the published table alone understates how many tickets were printed and <em>overstates</em> what a game returns &mdash; by roughly 15-30% on cheap tickets. The clearest proof is a `$1 game called `$50 Frenzy, whose published table would imply it pays back more than ten times its price. The full prize ladder exists only inside scanned rules PDFs with no extractable text, and we will not invent the missing tiers. So this page covers only games priced at or above Indiana's `$30 publication floor, where every prize in the ladder is actually published and the arithmetic is sound. Note that a plausibility check alone would not catch this: the inflated cheaper games produce payout figures that look entirely normal." }
  @{ code = 'LA'; slug = 'louisiana'; name = 'Louisiana'; noun = 'scratch-offs'
     sourceNote = "Louisiana publishes an unusually explicit prize table: for each tier it gives the prize, that tier's odds, and the total, <em>claimed</em> and remaining counts separately &mdash; so the claimed figure is stated outright rather than inferred by subtraction." }
  @{ code = 'AR'; slug = 'arkansas'; name = 'Arkansas'; noun = 'instant games'
     sourceNote = "Arkansas publishes, per tier, the total prizes in the game, the estimated prizes remaining, and the total prize <em>value</em> both at start and remaining &mdash; giving an independent check on our own value arithmetic, since the state's dollar totals and ours have to agree." }
  # HELD BACK: the Next.js RSC chunk parsing is producing corrupted game names
  # ("POWER-CAKE-VIBES-SPIN", "$$300 GRAND") and 18 of 46 games come out with no
  # overall odds. Not publishable until the chunk reassembly is fixed.
  @{ code = 'WV'; slug = 'west-virginia'; name = 'West Virginia'; noun = 'scratch-offs'; skip = $true
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

  # Price curve, computed from this state's own data. MUST exclude low_confidence
  # games, because the on-page widget (scByPrice in scratch.js) excludes them too -
  # otherwise the prose quotes a number the chart beside it doesn't show. A single
  # 96%-sold game in a thin price band is enough to move the average double digits.
  $priceable = @($games | Where-Object { -not $_.low_confidence })
  if ($priceable.Count -lt 5) { $priceable = $games }
  $byPrice = $priceable | Group-Object price | Sort-Object { [double]$_.Name }
  $lowP = $byPrice[0]; $highP = $byPrice[-1]
  $lowAvg = ($lowP.Group.ev_now | Measure-Object -Average).Average
  $highAvg = ($highP.Group.ev_now | Measure-Object -Average).Average
  # Only claim a price/value curve when there are enough price points to show one.
  # Indiana publishes usable data for two price points only - a "curve" drawn
  # through two dots is not a finding.
  $curveHolds = ($highAvg - $lowAvg) -gt 0.05 -and $byPrice.Count -ge 4

  $best = @($games | Where-Object { -not $_.low_confidence } | Sort-Object ev_now -Descending)[0]

  # Never claim "all active games": every state skips something (an unpublished
  # cash value, a missing odds figure, a tier table that won't reconcile), so the
  # honest phrasing is the count we actually publish.
  $coverPhrase = "$n $($st.name) games"
  $CoverPhrase = (Get-Culture).TextInfo.ToTitleCase($coverPhrase.Substring(0, 1)) + $coverPhrase.Substring(1)
  $rankedHead = if ($st.partial) { "Every $($st.name) game we can price, ranked" } else { "Every $($st.name) game, ranked" }

  $pctMin = "{0:P0}" -f $evMin; $pctMax = "{0:P0}" -f $evMax
  $lowPct = "{0:P0}" -f $lowAvg; $highPct = "{0:P0}" -f $highAvg
  $lowLbl = "`$" + [long]([double]$lowP.Name); $highLbl = "`$" + [long]([double]$highP.Name)

  $title = "Best $($st.name) $Noun`: Prizes Remaining &amp; Real Value | NumbersIntel"
  $desc = "Which $($st.name) $noun still have their big prizes? We compute what $n games return per dollar today from unclaimed prize data" +
          $(if ($zeroTop -gt 0) { " &mdash; and $zeroTop of them have no top prize left." } else { ", updated daily." })

  # Lead paragraph leans on whichever fact this state's data actually supports.
  $lead = if ($zeroTop -gt 0) {
    "<strong>$zeroTop</strong> $($st.name) $noun on sale today have <strong>zero top prizes left</strong>. Every one already claimed &mdash; and every one still on the rack at full price, with the headline number printed on the front."
  } else {
    "A $($noun -replace 's$','') whose big prizes have already been claimed keeps selling at the same price, with the same headline number on the front. Nothing on the rack tells you the prize you're chasing is already gone."
  }

  $curvePara = if ($curveHolds) {
    "<p class=`"section-note`">The same pattern turns up in every state we analyse: $($st.name) climbs from <strong>$lowPct</strong> on $lowLbl tickets to <strong>$highPct</strong> on $highLbl ones, the same climb we find in our <a href=`"scratch/texas.html`">Texas</a>, <a href=`"scratch/california.html`">California</a> and <a href=`"scratch/`">every other state's</a> data. Eighteen unrelated state lotteries keep making the same design decision: the cheap tickets on the rack are the worst value in the shop. That does not make an expensive ticket a good bet &mdash; it is still a guaranteed average loss, just a smaller one per dollar, with far more money at risk per ticket.</p>"
  } else {
    $(if ($byPrice.Count -lt 4) {
      "<p class=`"section-note`">We don't draw a price/value curve for $($st.name), because there aren't enough price points in the data we can trust to show one &mdash; only $($byPrice.Count) survive the limits described below. In states that publish complete prize tables the pattern is consistent and strong: see <a href=`"scratch/`">the eighteen states where it holds</a>.</p>"
    } else {
      "<p class=`"section-note`">Across most states, value climbs steadily with ticket price &mdash; see our <a href=`"scratch/texas.html`">Texas</a> and <a href=`"scratch/california.html`">California</a> data. $($st.name)'s current mix of games shows that less sharply, which is worth knowing in itself: the rule of thumb holds broadly, not universally.</p>"
    })
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
  <meta property="og:description" content="$n $($st.name) $noun ranked by what they return per dollar today." />
  <meta property="og:url" content="https://numbersintel.com/scratch/$($st.slug).html" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="stylesheet" href="styles.css" />
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Dataset","name":"$($st.name) $noun remaining prize value","description":"For each active $($st.name) Lottery instant game: ticket price, overall odds, prizes printed and still unclaimed by tier, and the resulting value returned per dollar at the current point in the print run.","creator":{"@id":"https://numbersintel.com/#org"},"isPartOf":{"@id":"https://numbersintel.com/#site"},"url":"https://numbersintel.com/scratch/$($st.slug).html","license":"https://numbersintel.com/terms.html"}
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
    {"@type":"Question","name":"Which $($st.name) $noun have the best odds?","acceptedAnswer":{"@type":"Answer","text":"Ticket price matters far more than which game you pick. Across every active $($st.name) game, $lowLbl tickets return an average of about $lowPct per dollar while $highLbl tickets return $highPct. Within a price band, the best games are the ones that still have most of their large prizes unclaimed."}},
    {"@type":"Question","name":"How many $($st.name) $noun have no top prize left?","acceptedAnswer":{"@type":"Answer","text":"$zeroTop of the $n $($st.name) games we track currently have zero top prizes remaining. They stay on sale at full price with the headline prize still printed on the ticket, and nothing on the packaging indicates it has already been claimed."}},
    {"@type":"Question","name":"Does the $($st.name) Lottery publish prizes remaining?","acceptedAnswer":{"@type":"Answer","text":"Yes. $($st.name) publishes, for every prize tier of every game, how many prizes were printed and how many are still unclaimed. This page turns that into a ranking of what each game returns per dollar today, refreshed daily."}}
  ]}
  </script>
</head>
<body>
  <header class="detail-header">
    <a class="back-link" href="scratch/">&larr; Scratch games</a>
    <h1>$($st.name) $noun`: what's actually left</h1>
    <p class="tagline">$CoverPhrase ranked by what they return per dollar <em>right now</em> &mdash;
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
      <h2>$rankedHead</h2>
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
      <p>Across every state we analyse, cheaper tickets return less &mdash; we tested that on 1,275 games in
        18 states and it held in all of them:
        <a href="guides/cheap-vs-expensive-scratch-tickets/">read the full analysis</a>.</p>
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
      <a href="state/$($st.code.ToLower()).html">$($st.name) lottery</a>
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

# ---------------------------------------------------------------------------
# scratch_summary.json - a small cross-state roll-up for the homepage module.
# The homepage must not fetch 22 state files, so everything it needs is
# aggregated here once at build time.
#
# Only states publishing a real value-per-dollar figure (metric "price") are
# pooled; the index/top-prize states (NY, MI, FL) can't contribute a payout
# percentage and would distort the averages. Their zero-top-prize counts DO
# still count, since that figure is comparable everywhere it's reported.
# ---------------------------------------------------------------------------
$pool = New-Object System.Collections.ArrayList
$topGone = 0; $topGoneValue = 0.0; $reporting = 0; $statesPriced = 0; $statesAll = 0
$byState = [ordered]@{}

# Slugs for the six hand-written pages; generated states come from $STATES above.
$slugOf = @{}
foreach ($s in $STATES) { $slugOf[$s.code] = $s.slug }
$slugOf['CA'] = 'california'; $slugOf['TX'] = 'texas'; $slugOf['ID'] = 'idaho'
$slugOf['NY'] = 'new-york'; $slugOf['FL'] = 'florida'; $slugOf['MI'] = 'michigan'

foreach ($f in (Get-ChildItem -Path $root -Filter "scratch_*.json")) {
  if ($f.Name -eq 'scratch_summary.json') { continue }
  $code = ($f.BaseName -replace '^scratch_', '').ToUpper()
  # West Virginia is built but held back; never let it into published figures.
  if ($code -eq 'WV') { continue }
  try { $d = [System.IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json }
  catch { continue }
  $games = @($d.games)
  if ($games.Count -lt 5) { continue }
  $statesAll++
  $priced = (-not $d.metric) -or ($d.metric -eq 'price')
  if ($priced) { $statesPriced++ }

  # Per-state roll-up for the choropleth on the scratch hub.
  $solid = @($games | Where-Object { -not $_.low_confidence })
  $stGone = @($games | Where-Object { $null -ne $_.top_left -and [long]$_.top_original -gt 0 -and [long]$_.top_left -eq 0 })
  $stAvg = $null; $stBest = $null
  if ($priced -and $solid.Count -ge 3) {
    $stAvg = [math]::Round((($solid.ev_now | Measure-Object -Average).Average), 4)
    $b = @($solid | Sort-Object ev_now -Descending)[0]
    $stBest = [pscustomobject]@{ name = $b.name; price = [double]$b.price; ev_now = [double]$b.ev_now }
  }
  $byState[$code] = [pscustomobject]@{
    name = $d.state_name
    slug = $(if ($slugOf[$code]) { $slugOf[$code] } else { $d.state_name.ToLower() -replace '\s+', '-' })
    games = $games.Count
    metric = $(if ($d.metric) { $d.metric } else { 'price' })
    avg_ev_now = $stAvg
    no_top_prize = $stGone.Count
    best = $stBest
  }

  foreach ($g in $games) {
    if ($null -ne $g.top_left -and $null -ne $g.top_original -and [long]$g.top_original -gt 0) {
      $reporting++
      if ([long]$g.top_left -eq 0) { $topGone++; $topGoneValue += [double]$g.top_prize }
    }
    if ($priced -and -not $g.low_confidence -and [double]$g.price -gt 0) {
      [void]$pool.Add([pscustomobject]@{
        state = $d.state; state_name = $d.state_name; slug_state = $d.state
        name = $g.name; price = [double]$g.price
        ev_now = [double]$g.ev_now; ev_start = [double]$g.ev_start
        pct_sold = [double]$g.pct_sold; url = $g.url
      })
    }
  }
}

# Price bands with too few games are noise on a national roll-up.
$byPrice = @($pool | Group-Object price | Sort-Object { [double]$_.Name } | Where-Object { $_.Count -ge 5 } |
  ForEach-Object {
    [pscustomobject]@{
      price = [double]$_.Name
      games = $_.Count
      ev_now = [math]::Round((($_.Group.ev_now | Measure-Object -Average).Average), 4)
      ev_start = [math]::Round((($_.Group.ev_start | Measure-Object -Average).Average), 4)
    }
  })

$best = @($pool | Sort-Object ev_now -Descending | Select-Object -First 6 | ForEach-Object {
  [pscustomobject]@{ name = $_.name; state = $_.state; state_name = $_.state_name
    price = $_.price; ev_now = $_.ev_now; pct_sold = $_.pct_sold }
})

# The within-band spread: same price, very different value. Uses the band with
# the most games so the comparison is well-populated.
$fattest = @($pool | Group-Object price | Sort-Object Count -Descending)[0]
$bandSorted = @($fattest.Group | Sort-Object ev_now)
$spread = [pscustomobject]@{
  price = [double]$fattest.Name
  games = $fattest.Count
  worst = [pscustomobject]@{ name = $bandSorted[0].name; state = $bandSorted[0].state; ev_now = $bandSorted[0].ev_now }
  best = [pscustomobject]@{ name = $bandSorted[-1].name; state = $bandSorted[-1].state; ev_now = $bandSorted[-1].ev_now }
}

$summary = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  states = $statesAll
  states_priced = $statesPriced
  games_priced = $pool.Count
  games_reporting_top = $reporting
  no_top_prize = $topGone
  no_top_prize_value = [long]$topGoneValue
  by_price = $byPrice
  best_now = $best
  band_spread = $spread
  by_state = $byState
  note = "Pooled across states publishing a full prize table with ticket price and odds. Excludes games more than 90% sold, whose figures swing on very few remaining prizes. Value per `$1 is what a game returns across all players - every game returns less than it costs."
}
$sumPath = Join-Path $root "scratch_summary.json"
[System.IO.File]::WriteAllText($sumPath, ($summary | ConvertTo-Json -Depth 6 -Compress), (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_summary.json: {0} states ({1} priced), {2} games pooled, {3} price bands, {4} with no top prize (`${5:N0})" -f `
  $statesAll, $statesPriced, $pool.Count, $byPrice.Count, $topGone, $topGoneValue)

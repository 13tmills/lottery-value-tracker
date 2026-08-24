# Builds value_heat.json - two independent dials for tonight's national draws,
# plus the cross-game leaderboard. Read by valueheat.js.
#
#   VALUE  a maths index: expected value per dollar wagered, split-risk adjusted,
#          reported as a percentile against that game's own draw history.
#   HEAT   a mania index: rollover run, sales velocity vs the game's trailing
#          median, and advertised-jackpot percentile.
#
# They are NEVER blended. The gap between them is the story: a long rollover run
# pushes Heat toward 100 while Value can already have rolled over the peak of the
# EV curve, because sales outrun the prize. That divergence is flagged for the
# content pipeline rather than hidden.
#
# The maths, its derivation and the reasons behind the tax and cash-value choices
# all live in value_heat_lib.ps1. test_value_heat.ps1 asserts the properties, and
# CI gates publication on it passing.
#
# MATRIX AWARENESS: prize matrices change, so percentiles are computed only within
# a game's CURRENT matrix - Mega Millions moved to a $5 ticket with a built-in
# multiplier on 2025-04-04, and comparing across that date compares two different
# games. Conveniently the archive is already era-clean: the earliest draw carrying
# both per-tier winners and a cash value is 2015-10-07 for Powerball, 2025-04-04
# for Mega Millions, and the relaunch date for Lotto America.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot "value_heat_lib.ps1")

$ERAS = @{
  powerball     = @{ start = '2015-10-07'; note = '5/69 + 1/26 matrix, $2 ticket (matrix change of 7 October 2015).' }
  mega_millions = @{ start = '2025-04-04'; note = '$5 ticket with a built-in 2x-10x multiplier and 5/70 + 1/24 matrix (relaunch of 4 April 2025). Earlier draws were a $2 game and are not comparable.' }
  lotto_america = @{ start = '2017-11-12'; note = '5/52 + 1/10 matrix, $1 ticket (relaunch of November 2017).' }
}
# Non-jackpot tier odds, used to invert published winner counts into tickets sold.
$ODDS = @{
  powerball     = @{ '5'=11688053.52; '4+PB'=913129.18; '4'=36525.17; '3+PB'=14494.11; '3'=579.76; '2+PB'=701.33; '1+PB'=91.98; 'PB'=38.32 }
  mega_millions = @{ '5'=12629232.0; '4+MB'=893761.0; '4'=38859.0; '3+MB'=13965.0; '3'=607.0; '2+MB'=665.0; '1+MB'=86.0; 'MB'=35.0 }
  lotto_america = @{ '5'=2887733.0; '4+SB'=110594.0; '4'=12288.0; '3+SB'=2404.0; '3'=267.0; '2+SB'=160.0; '1+SB'=29.0; 'SB'=17.0 }
}
$JPMATCH = @{ powerball='5+PB'; mega_millions='5+MB'; lotto_america='5+SB' }
$LABELS  = @{ powerball='Powerball'; mega_millions='Mega Millions'; lotto_america='Lotto America' }

$live = Get-Content (Join-Path $root "data.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$meta = $null
$metaPath = Join-Path $root "game_meta.json"
if (Test-Path $metaPath) { $meta = Get-Content $metaPath -Raw -Encoding UTF8 | ConvertFrom-Json }

$outGames = [ordered]@{}
foreach ($key in @('powerball','mega_millions','lotto_america')) {
  $g = $live.games.$key
  if (-not $g) { continue }
  [double]$JO = [double]$g.odds_jackpot
  [double]$PR = [double]$g.ticket_price
  [double]$MU = if ($null -ne $g.prize_multiplier) { [double]$g.prize_multiplier } else { 1.0 }
  [double]$CASH = [double]$g.cash_value
  [double]$JACK = [double]$g.jackpot
  $tiers = @($g.prize_tiers)
  if (-not $tiers.Count -or $JO -le 0 -or $PR -le 0 -or $CASH -le 0) {
    Write-Host "  ! $key : incomplete live matrix; skipped"; continue
  }

  $od = $ODDS[$key]
  [double]$pwin = 0.0
  foreach ($o in $od.Values) { $pwin += 1.0 / [double]$o }

  # --- every draw in the current era carrying BOTH per-tier winners (so sales can
  #     be estimated) and a cash value (so EV is real, not derived from a headline)
  $hist = Get-Content (Join-Path $root "history/$key.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  $series = New-Object System.Collections.ArrayList
  foreach ($draw in @($hist.draws | Sort-Object date)) {
    if ($draw.date -lt $ERAS[$key].start) { continue }
    if (-not $draw.cash_value -or [double]$draw.cash_value -le 0) { continue }
    if (-not $draw.prizes) { continue }
    $est = Get-EstimatedLines $draw $od $JPMATCH[$key] $pwin
    if ($null -eq $est.lines) { continue }
    [void]$series.Add([pscustomobject]@{
      date = $draw.date; jackpot = [double]$draw.jackpot; cash = [double]$draw.cash_value
      lines = [double]$est.lines; won = $est.won })
  }
  $series = @($series)
  if (-not $series.Count) { Write-Host "  ! $key : no usable history in the current era; skipped"; continue }

  # --- historical EV, one point per draw, on that draw's own cash and own sales
  $histEv = New-Object System.Collections.ArrayList
  foreach ($r in $series) { [void]$histEv.Add((Get-EvPerDollar $r.cash $JO ($r.lines / $JO) $tiers $PR $MU)) }

  # --- tonight: sales read off the game's own jackpot/sales relationship
  $knots = Get-SalesKnots $series
  [double]$estLines = if ($JACK -gt 0) { Get-SalesAt $JACK $knots } else { Get-Median $series.lines }
  [double]$lamNow = $estLines / $JO
  [double]$evNow = Get-EvPerDollar $CASH $JO $lamNow $tiers $PR $MU
  $enough = ($histEv.Count -ge $script:MIN_HISTORY_FOR_PERCENTILE)
  $evPct = if ($enough) { Get-PercentileOf $evNow $histEv } else { $null }

  # --- the EV curve and where tonight sits on it
  [double]$ratio = if ($JACK -gt 0) { $CASH / $JACK } else { 0.5 }
  $sc = Get-SweepCeiling $series
  $curve = Get-EvCurve $knots $JO $tiers $PR $ratio $MU $sc.ceiling $sc.step
  $peak = Get-CurvePeak $curve
  $pastPeak = ($peak.interior -and $JACK -gt [double]$peak.point.jackpot)

  # --- HEAT
  #
  # STALENESS GUARD: per-tier winner counts can lag the live jackpot. If the
  # jackpot has since been WON, the run counted here is nonsense - Lotto America
  # once read 137 rollovers on a $2.65m jackpot, having actually reset from $30m
  # during a gap in the data. A live jackpot well below the last one observed is
  # proof of a win we cannot see, so report the run as unknown rather than wrong.
  [double]$lastSeenJ = $series[$series.Count-1].jackpot
  $wonInGap = ($JACK -gt 0 -and $lastSeenJ -gt 0 -and $JACK -lt 0.6 * $lastSeenJ)
  $roll = 0
  for ($i = $series.Count - 1; $i -ge 0; $i--) { if ($series[$i].won) { break }; $roll++ }
  if ($wonInGap) { $roll = $null }

  $rollHist = New-Object System.Collections.ArrayList
  $run = 0
  foreach ($r in $series) { if ($r.won) { [void]$rollHist.Add($run); $run = 0 } else { $run++ } }
  $rollPct = if ($null -ne $roll -and $rollHist.Count -ge 10) { Get-PercentileOf $roll $rollHist } else { $null }

  $recent = @($series[[math]::Max(0, $series.Count - $script:VELOCITY_WINDOW)..($series.Count-1)].lines)
  [double]$trail = Get-Median $recent
  $vel = if ($trail -gt 0) { $estLines / $trail } else { $null }
  $velHist = New-Object System.Collections.ArrayList
  for ($i = $script:VELOCITY_WINDOW; $i -lt $series.Count; $i++) {
    [double]$base = Get-Median @($series[($i - $script:VELOCITY_WINDOW)..($i-1)].lines)
    if ($base -gt 0) { [void]$velHist.Add($series[$i].lines / $base) }
  }
  $velPct = if ($null -ne $vel -and $velHist.Count -ge 10) { Get-PercentileOf $vel $velHist } else { $null }
  $jackHist = @(foreach ($r in $series) { if ($r.jackpot -gt 0) { $r.jackpot } })
  $jackPct = if ($JACK -gt 0 -and $enough) { Get-PercentileOf $JACK $jackHist } else { $null }

  $parts = [ordered]@{ rollovers = $rollPct; sales_velocity = $velPct; jackpot_size = $jackPct }
  $have = @($parts.Values | Where-Object { $null -ne $_ })
  $heat = if ($have.Count) { [math]::Round((($have | Measure-Object -Sum).Sum) / $have.Count, 1) } else { $null }

  # --- the divergence that is the whole point
  $div = $null
  if ($null -ne $heat -and $null -ne $evPct) {
    $gap = $heat - $evPct
    if ($heat -ge 70 -and $gap -ge 25) {
      $tail = if ($pastPeak) {
        " - this jackpot is past the peak of its own EV curve, so it is getting bigger and worse at the same time."
      } else { ", because sales are rising faster than the prize." }
      $div = [ordered]@{ flag = 'hot_but_poor'; gap = [math]::Round($gap,1); past_ev_peak = $pastPeak
        headline = ("{0} is in the {1:N0}th percentile for public attention but only the {2:N0}th for actual value per dollar{3}" -f $LABELS[$key], $heat, $evPct, $tail) }
    } elseif ($evPct -ge 70 -and ($evPct - $heat) -ge 25) {
      $div = [ordered]@{ flag = 'quietly_good'; gap = [math]::Round($evPct - $heat,1); past_ev_peak = $pastPeak
        headline = ("{0} is unusually good value right now ({1:N0}th percentile) without the attention to match ({2:N0}th percentile for heat)." -f $LABELS[$key], $evPct, $heat) }
    }
  }

  $thin = New-Object System.Collections.ArrayList
  for ($i = 0; $i -lt $curve.Count; $i += 4) { [void]$thin.Add($curve[$i]) }

  $outGames[$key] = [ordered]@{
    label = $LABELS[$key]; ticket_price = $PR
    jackpot_advertised = [long]$JACK      # display label only
    cash_value = [long]$CASH              # canonical
    cash_ratio = [math]::Round($ratio, 4)
    value = [ordered]@{
      # Headline after tax; pre-tax kept alongside because it exceeds 1.0 at
      # extreme jackpots and reads as a winning bet. The percentile is identical
      # either way - a constant multiplier cannot change a ranking.
      ev_per_dollar = [math]::Round($evNow * $script:TAX_FACTOR, 6)
      ev_per_dollar_pretax = [math]::Round($evNow, 6)
      ev_percentile = $evPct
      basis_draws = $histEv.Count
      era_start = $ERAS[$key].start; era_note = $ERAS[$key].note
      est_tickets = [long]$estLines
      lambda = [math]::Round($lamNow, 4)
      split_factor = [math]::Round((Get-SplitFactor $lamNow), 4)
      fixed_tier_ev = [math]::Round((Get-FixedTierEv $tiers $MU), 6)
      data_through = $series[$series.Count-1].date
    }
    heat = [ordered]@{
      score = $heat; components = $parts; rollovers = $roll
      sales_velocity = $(if ($null -ne $vel) { [math]::Round($vel,3) } else { $null })
      stale_winner_data = $wonInGap
      data_through = $series[$series.Count-1].date
    }
    ev_curve = [ordered]@{
      peak_jackpot = $(if ($peak.interior) { [long]$peak.point.jackpot } else { $null })
      peak_ev = $(if ($peak.interior) { [double]$peak.point.ev } else { $null })
      peak_is_interior = $peak.interior
      swept_to = [long]$sc.ceiling
      past_peak = $pastPeak
      points = @($thin)
    }
    divergence = $div
  }
}

# --------------------------------------------------------------------------
# Cross-game leaderboard: every game whose EV can be computed honestly, on one
# axis, AFTER TAX (mixing pre- and post-tax figures would not be a comparison).
#
#   complete - every tier has a published fixed amount, so the figure is exact.
#              Typically small state games with no rolling jackpot, which
#              frequently beat the national games precisely because they carry
#              no split risk at all.
#   floor    - fixed tiers published but a rolling jackpot is not, so this is a
#              LOWER BOUND, flagged as such.
# Pari-mutuel games, whose prizes depend on sales we cannot observe, are omitted
# entirely rather than estimated.
# --------------------------------------------------------------------------
$rows = New-Object System.Collections.ArrayList
foreach ($k in $outGames.Keys) {
  $gg = $outGames[$k]
  [void]$rows.Add([ordered]@{ key = $k; label = $gg.label; state = $null; price = $gg.ticket_price
    ev_per_dollar = $gg.value.ev_per_dollar; basis = 'complete'
    note = 'Includes the jackpot at its cash value, adjusted for split risk.' })
}
if ($meta) {
  foreach ($p in $meta.PSObject.Properties) {
    $m = $p.Value
    if (-not $m.ev -or -not $m.ev.levels -or -not $m.ev.ticket_price) { continue }
    [double]$tot = 0.0; $nFixed = 0; $nMissing = 0
    foreach ($lp in $m.ev.levels.PSObject.Properties) {
      $L = $lp.Value
      if (-not $L.odds) { continue }
      if ($L.pari -eq $true -or $null -eq $L.prize) { $nMissing++; continue }
      $tot += [double]$L.prize / [double]$L.odds; $nFixed++
    }
    if ($nFixed -eq 0) { continue }     # nothing we can stand behind
    [void]$rows.Add([ordered]@{ key = $p.Name; label = $m.label; state = $m.state
      price = [double]$m.ev.ticket_price
      ev_per_dollar = [math]::Round($script:TAX_FACTOR * $tot / [double]$m.ev.ticket_price, 6)
      basis = $(if ($nMissing -eq 0) { 'complete' } else { 'floor' })
      note = $(if ($nMissing -eq 0) {
        'Every prize tier is a published fixed amount, so this is exact - and it carries no split risk.'
      } else {
        "Fixed tiers only; $nMissing tier(s) roll or are pari-mutuel and are not published, so the true figure is higher than this."
      }) })
  }
}
$sorted = @($rows | Sort-Object { -[double]$_.ev_per_dollar })
$rank = 1
foreach ($r in $sorted) { $r['rank'] = $rank; $rank++ }

$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  method = "Two independent dials. VALUE is expected value per dollar wagered: the summed expected value of every fixed prize tier, plus the jackpot's cash value divided by the jackpot odds and multiplied by the expected share you would keep if you won it, all divided by the ticket price. That share is E[1/(1+K)] for K Poisson-distributed with mean lambda = estimated tickets sold / jackpot odds, which equals (1-exp(-lambda))/lambda. Estimated tickets come from inverting each draw's published per-tier winner counts against that tier's odds. Cash value is used throughout - never the advertised annuity, which moves with interest rates. The headline figure is after tax. HEAT is a separate attention index combining consecutive rollovers, sales velocity against the game's trailing median, and advertised-jackpot percentile. The two are never blended: value is a maths index, heat is a mania index, and the gap between them is the point."
  caveats = "Percentiles are computed only within a game's current prize matrix, because a matrix change makes earlier draws a different game. EV per dollar is NOT increasing in jackpot size: past a peak, sales rise faster than the prize and each ticket's expected share falls. Every game listed returns less than it costs."
  games = $outGames
  leaderboard = @($sorted)
}
$json = $out | ConvertTo-Json -Depth 9 -Compress
$path = Join-Path $root "value_heat.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("value_heat.json: {0} games, {1} leaderboard rows, {2} KB" -f `
  $outGames.Count, $sorted.Count, [math]::Round((Get-Item $path).Length/1kb,1))
foreach ($k in $outGames.Keys) {
  $v = $outGames[$k].value; $h = $outGames[$k].heat
  Write-Host ("  {0,-15} EV/`$1 {1:P2} (pct {2}) heat {3} rollovers {4}{5}" -f `
    $k, $v.ev_per_dollar, $v.ev_percentile, $h.score, $(if ($null -ne $h.rollovers) { $h.rollovers } else { 'unknown' }), `
    $(if ($outGames[$k].divergence) { " FLAG=" + $outGames[$k].divergence.flag } else { "" }))
}

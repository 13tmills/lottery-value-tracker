# Value/Heat model - pure functions, no side effects. Dot-sourced by
# gen_value_heat.ps1 (which builds value_heat.json) and by test_value_heat.ps1
# (which asserts the properties below). Keep it side-effect free so the tests can
# load it without generating anything.
#
# THE MODEL
#   lam          = estimated tickets sold / jackpot odds
#   split_factor = (1 - exp(-lam)) / lam
#   EV_jackpot   = (1 / D) * J_cash * split_factor
#   EV_total     = (fixed_tier_EV + EV_jackpot) / ticket_price
#
# split_factor is E[1/(1+K)] for K ~ Poisson(lam): the share of the jackpot you
# expect to keep GIVEN that you have won it. Derivation:
#     E[1/(1+K)] = sum_k (1/(1+k)) e^-lam lam^k / k!
#                = (1/lam) sum_k e^-lam lam^(k+1)/(k+1)!
#                = (1 - e^-lam) / lam
#
# WHY CASH, NEVER THE ADVERTISED JACKPOT: the headline is an annuity whose
# relationship to cash moves with interest rates - the ratio ran about 0.72 in
# 2021 and about 0.50 by 2024 - so the same "$1bn" is worth materially different
# amounts in different years.
#
# NON-MONOTONICITY - DO NOT "FIX" IT. EV per dollar rises to a peak and then
# DECLINES as the jackpot grows: past the peak each extra dollar of prize draws in
# more than a dollar of new tickets, so the expected share falls faster than the
# jackpot climbs. Swept against the real Powerball archive the turn currently
# lands near $1.8bn advertised, about 18% below peak by $3bn. The SHAPE is robust;
# the exact turning point rests on very few draws above $1bn. test_value_heat.ps1
# asserts the shape, with a flat-sales control proving the decline comes from the
# sales response and not the arithmetic.

# Matches scrape.py's TAX_FACTOR so the headline reconciles with the rest of the
# site. It matters more than it looks: BEFORE tax, split-adjusted EV genuinely
# exceeds 1.0 at extreme jackpots (our sweep peaks near 142c per dollar). That is
# a real, long-documented result - and the single most misreadable number here,
# because "142% back" reads as a winning bet. It is not one: winnings are taxable,
# the headline is an annuity while the maths uses cash, and expected value says
# nothing about a 1-in-292-million chance. So the DISPLAYED figure is after tax.
$script:TAX_FACTOR = 0.63
$script:VELOCITY_WINDOW = 26
$script:MIN_HISTORY_FOR_PERCENTILE = 30
$script:MIN_WINNERS = 20     # below this the law-of-large-numbers estimate is meaningless

function Get-SplitFactor {
  param([double]$Lambda)
  if ($Lambda -le 0) { return 1.0 }
  if ($Lambda -lt 1e-9) { return 1.0 - $Lambda / 2.0 }   # closed form loses precision here
  return (1.0 - [math]::Exp(-$Lambda)) / $Lambda
}

function Get-FixedTierEv {
  param($Tiers, [double]$Multiplier = 1.0)
  # A built-in prize multiplier (Mega Millions applies a random 2x-10x to
  # non-jackpot prizes) lifts the fixed tiers ONLY - it never touches the jackpot.
  [double]$sum = 0.0
  foreach ($t in $Tiers) { $sum += [double]$t.prize / [double]$t.odds }
  return $Multiplier * $sum
}

function Get-EvPerDollar {
  param([double]$Cash, [double]$OddsJackpot, [double]$Lambda, $Tiers,
        [double]$Price, [double]$Multiplier = 1.0)
  if ($OddsJackpot -le 0 -or $Price -le 0) { return 0.0 }
  $evJackpot = (1.0 / $OddsJackpot) * $Cash * (Get-SplitFactor $Lambda)
  return ((Get-FixedTierEv $Tiers $Multiplier) + $evJackpot) / $Price
}

function Get-PercentileOf {
  param([double]$Value, $Sample)
  # Share of history at or below Value. Nothing is cached, so appending a draw
  # re-ranks naturally.
  $arr = @($Sample)
  if ($arr.Count -eq 0) { return $null }
  $n = 0
  foreach ($v in $arr) { if ([double]$v -le $Value) { $n++ } }
  return [math]::Round(100.0 * $n / $arr.Count, 1)
}

function Get-Median {
  param($Values)
  $s = @($Values | Sort-Object)
  if ($s.Count -eq 0) { return 0.0 }
  if ($s.Count % 2) { return [double]$s[[int]($s.Count / 2)] }
  return ([double]$s[$s.Count / 2 - 1] + [double]$s[$s.Count / 2]) / 2.0
}

function Get-SalesKnots {
  param($Series)
  # Advertised jackpot -> estimated tickets, as ($25m-bucket midpoint, median
  # tickets) knots built from the game's OWN observed draws. A description of how
  # this game's sales actually respond, not a guess.
  $bucket = @{}
  foreach ($r in $Series) {
    $b = [int][math]::Floor([double]$r.jackpot / 25000000)
    if (-not $bucket.ContainsKey($b)) { $bucket[$b] = New-Object System.Collections.ArrayList }
    [void]$bucket[$b].Add([double]$r.lines)
  }
  $kx = New-Object System.Collections.ArrayList
  $ky = New-Object System.Collections.ArrayList
  foreach ($b in @($bucket.Keys | Sort-Object)) {
    [void]$kx.Add([double]$b * 25000000.0 + 12500000.0)
    [void]$ky.Add((Get-Median $bucket[$b]))
  }
  return @{ x = $kx; y = $ky }
}

function Get-SalesAt {
  param([double]$Jackpot, $Knots)
  $kx = $Knots.x; $ky = $Knots.y
  if ($kx.Count -eq 0) { return 0.0 }
  if ($kx.Count -eq 1 -or $Jackpot -le [double]$kx[0]) { return [double]$ky[0] }
  for ($i = 1; $i -lt $kx.Count; $i++) {
    if ($Jackpot -le [double]$kx[$i]) {
      [double]$x0 = $kx[$i-1]; [double]$y0 = $ky[$i-1]
      [double]$x1 = $kx[$i];   [double]$y1 = $ky[$i]
      if ($x1 -eq $x0) { return $y1 }
      return $y0 + (($Jackpot - $x0) / ($x1 - $x0)) * ($y1 - $y0)
    }
  }
  # Above the top knot, extrapolate along the last observed slope - sales keep
  # climbing past any jackpot yet seen.
  $L = $kx.Count - 1
  [double]$slope = 0.0
  if ([double]$kx[$L] -ne [double]$kx[$L-1]) {
    $slope = ([double]$ky[$L] - [double]$ky[$L-1]) / ([double]$kx[$L] - [double]$kx[$L-1])
  }
  return [math]::Max(0.0, [double]$ky[$L] + $slope * ($Jackpot - [double]$kx[$L]))
}

function Get-SweepCeiling {
  param($Series)
  # Scale the sweep to what the game has ACTUALLY reached. A fixed $3bn ceiling
  # extrapolated Lotto America's sales curve 75x beyond any observed draw and
  # reported a meaningless "peak" sitting on the ceiling.
  [double]$top = 0.0
  foreach ($r in $Series) { if ([double]$r.jackpot -gt $top) { $top = [double]$r.jackpot } }
  if ($top -le 0) { $top = 100e6 }
  [double]$ceiling = 2.0 * $top
  [double]$step = [math]::Max(1e5, [math]::Round($ceiling / 120.0 / 1e5) * 1e5)
  return @{ ceiling = $ceiling; step = $step }
}

function Get-EvCurve {
  param($Knots, [double]$OddsJackpot, $Tiers, [double]$Price, [double]$CashRatio,
        [double]$Multiplier = 1.0, [double]$MaxJackpot, [double]$Step)
  $curve = New-Object System.Collections.ArrayList
  for ([double]$j = $Step; $j -le $MaxJackpot; $j += $Step) {
    [double]$lines = Get-SalesAt $j $Knots
    [double]$lam = if ($OddsJackpot -gt 0) { $lines / $OddsJackpot } else { 0.0 }
    [double]$ev = Get-EvPerDollar ($j * $CashRatio) $OddsJackpot $lam $Tiers $Price $Multiplier
    [void]$curve.Add([pscustomobject]@{ jackpot = [long]$j; est_lines = [long]$lines; ev = [math]::Round($ev, 6) })
  }
  return $curve
}

function Get-CurvePeak {
  param($Curve)
  $c = @($Curve)
  if ($c.Count -eq 0) { return $null }
  $best = $c[0]
  foreach ($p in $c) { if ([double]$p.ev -gt [double]$best.ev) { $best = $p } }
  # A "peak" on the last swept point is the ceiling, not a turning point.
  $interior = ([long]$best.jackpot -lt [long]$c[$c.Count-1].jackpot)
  return [pscustomobject]@{ point = $best; interior = $interior }
}

function Get-EstimatedLines {
  param($Draw, $OddsMap, [string]$JackpotMatch, [double]$PWin)
  # Pooled maximum-likelihood tickets-in-play from ALL non-jackpot tiers. Under a
  # Poisson model each tier's winners w_i ~ Poisson(L / O_i), so the MLE pools
  # them: L_hat = (sum of winners) / (sum of 1/O_i). This inverse-variance
  # weighting lets the high-count tiers dominate rather than taking a plain median.
  [double]$sumW = 0.0
  $jwon = $false
  foreach ($t in @($Draw.prizes)) {
    $m = [string]$t.match
    if ($m -eq $JackpotMatch -and [double]$t.winners -gt 0) { $jwon = $true }
    if ($OddsMap.ContainsKey($m)) { $sumW += [double]$t.winners }
  }
  if ($sumW -lt $script:MIN_WINNERS) { return @{ lines = $null; won = $jwon } }
  return @{ lines = ($sumW / $PWin); won = $jwon }
}

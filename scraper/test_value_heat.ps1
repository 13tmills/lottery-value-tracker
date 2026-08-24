# Self-check for the Value/Heat model. Exits non-zero on any failure, so CI can
# gate publication of value_heat.json on it: a wrong model must not ship.
#
# The load-bearing test is the non-monotonic EV curve. EV per dollar must RISE and
# then FALL as the jackpot grows. That is not a bug to be smoothed away - past the
# peak, sales outrun the prize and each winner's expected share collapses faster
# than the jackpot climbs. If someone "fixes" the model so EV rises forever, this
# fails loudly.
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "value_heat_lib.ps1")

$script:Pass = 0
$script:Fail = 0
function Assert-That {
  param([string]$Name, [bool]$Condition, [string]$Detail = "")
  if ($Condition) { $script:Pass++; Write-Host ("  PASS  {0}" -f $Name) }
  else { $script:Fail++; Write-Host ("  FAIL  {0}{1}" -f $Name, $(if ($Detail) { " -- $Detail" } else { "" })) }
}

# A stand-in for Powerball's shape: $2 ticket, ~1 in 292m.
$D = 292201338.0
$PRICE = 2.0
$TIERS = @(
  [pscustomobject]@{ prize=1000000.0; odds=11688053.52 }
  [pscustomobject]@{ prize=50000.0;   odds=913129.18 }
  [pscustomobject]@{ prize=100.0;     odds=36525.17 }
  [pscustomobject]@{ prize=100.0;     odds=14494.11 }
  [pscustomobject]@{ prize=7.0;       odds=579.76 }
  [pscustomobject]@{ prize=7.0;       odds=701.33 }
  [pscustomobject]@{ prize=4.0;       odds=91.98 }
  [pscustomobject]@{ prize=4.0;       odds=38.32 }
)

Write-Host "value_heat self-check"

# ---------------------------------------------------------------- split factor
# The definition the whole model rests on, checked against the slow, obvious way.
$bad = 0
foreach ($lam in 0.01, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 25.0) {
  [double]$brute = 0.0
  [double]$logFact = 0.0
  for ($k = 0; $k -lt 300; $k++) {
    if ($k -gt 0) { $logFact += [math]::Log($k) }
    $brute += (1.0 / (1 + $k)) * [math]::Exp(-$lam + $k * [math]::Log($lam) - $logFact)
  }
  if ([math]::Abs((Get-SplitFactor $lam) - $brute) -gt 1e-9) { $bad++ }
}
Assert-That "split factor equals brute-force E[1/(1+K)] for Poisson K" ($bad -eq 0) "$bad lambda value(s) mismatched"

Assert-That "split factor is 1 when nobody else plays" ((Get-SplitFactor 0) -eq 1.0)
Assert-That "split factor collapses when the game is busy" ((Get-SplitFactor 1000) -lt 0.01)

$mono = $true
[double]$prev = 1.0
for ($i = 1; $i -lt 200; $i++) {
  [double]$v = Get-SplitFactor (0.1 * $i)
  if ($v -le 0 -or $v -gt 1.0 -or $v -ge $prev) { $mono = $false; break }
  $prev = $v
}
Assert-That "split factor is strictly decreasing in lambda, bounded (0,1]" $mono

# ------------------------------------------------------------------------- EV
$cash = 500000000.0
$expected = ((Get-FixedTierEv $TIERS) + $cash / $D) / $PRICE
Assert-That "with lambda 0 the jackpot term is the full cash value / odds" `
  ([math]::Abs((Get-EvPerDollar $cash $D 0.0 $TIERS $PRICE) - $expected) -lt 1e-12)

$evs = @()
foreach ($lines in 1e6, 1e7, 5e7, 2e8, 6e8) { $evs += (Get-EvPerDollar 800000000.0 $D ($lines/$D) $TIERS $PRICE) }
$falling = $true
for ($i = 1; $i -lt $evs.Count; $i++) { if ($evs[$i] -ge $evs[$i-1]) { $falling = $false } }
Assert-That "same prize + more tickets = strictly less value per dollar" $falling

$plain   = Get-EvPerDollar 100000000.0 $D 0.5 $TIERS $PRICE 1.0
$boosted = Get-EvPerDollar 100000000.0 $D 0.5 $TIERS $PRICE 3.0
Assert-That "a prize multiplier lifts fixed tiers ONLY, never the jackpot" `
  ([math]::Abs(($boosted - $plain) - (2.0 * (Get-FixedTierEv $TIERS) / $PRICE)) -lt 1e-12)

# ------------------------------------------- THE non-monotonic EV curve
# Sales curve shaped like a real lottery's: near-flat when small, accelerating
# once a run makes the news. Calibrated to real volumes (~8m tickets at the floor,
# ~12m at a $100m jackpot) rather than picked arbitrarily. The exponent must
# exceed 1 for a peak to exist at all, and the CONSTANT matters too - too small a
# coefficient keeps lambda low enough that the turn falls outside any sane range.
function New-RealisticKnots {
  [double]$a = 1.9
  [double]$b = 4e6 / [math]::Pow(100.0, $a)
  $kx = New-Object System.Collections.ArrayList
  $ky = New-Object System.Collections.ArrayList
  for ([double]$j = 25e6; $j -le 2.5e9; $j += 25e6) {
    [void]$kx.Add($j)
    [void]$ky.Add(8e6 + $b * [math]::Pow($j / 1e6, $a))
  }
  return @{ x = $kx; y = $ky }
}

$curve = Get-EvCurve (New-RealisticKnots) $D $TIERS $PRICE 0.50 1.0 2.5e9 25e6
$peak = Get-CurvePeak $curve
$c = @($curve)
$peakIdx = 0
for ($i = 0; $i -lt $c.Count; $i++) { if ($c[$i].jackpot -eq $peak.point.jackpot) { $peakIdx = $i; break } }

Assert-That "EV curve peaks in the INTERIOR, not at an endpoint" `
  ($peakIdx -gt 0 -and $peakIdx -lt $c.Count - 1) "peak at index $peakIdx of $($c.Count)"
Assert-That "EV rises from the small-jackpot end" ([double]$c[0].ev -lt [double]$peak.point.ev)
Assert-That "EV FALLS again above the peak" ([double]$c[$c.Count-1].ev -lt [double]$peak.point.ev)
$decline = ([double]$peak.point.ev - [double]$c[$c.Count-1].ev) / [double]$peak.point.ev
Assert-That "the decline is real, not float noise (>5% off peak)" ($decline -gt 0.05) `
  ("decline {0:P1}" -f $decline)

$rising = $true; $fallingAfter = $true
for ($i = 0; $i -lt $peakIdx; $i++) { if ([double]$c[$i].ev -gt [double]$c[$i+1].ev + 1e-12) { $rising = $false } }
for ($i = $peakIdx; $i -lt $c.Count - 1; $i++) { if ([double]$c[$i].ev -lt [double]$c[$i+1].ev - 1e-12) { $fallingAfter = $false } }
Assert-That "the peak is a true turning point (rises before, falls after)" ($rising -and $fallingAfter)

# CONTROL: hold sales flat and the decline must vanish, proving it comes from the
# sales response and not from the arithmetic.
$flat = @{ x = (New-Object System.Collections.ArrayList); y = (New-Object System.Collections.ArrayList) }
[void]$flat.x.Add(25e6);  [void]$flat.y.Add(2e7)
[void]$flat.x.Add(2.5e9); [void]$flat.y.Add(2e7)
$flatCurve = @(Get-EvCurve $flat $D $TIERS $PRICE 0.50 1.0 2.5e9 25e6)
$flatMono = $true
for ($i = 1; $i -lt $flatCurve.Count; $i++) { if ([double]$flatCurve[$i].ev -lt [double]$flatCurve[$i-1].ev) { $flatMono = $false } }
Assert-That "CONTROL: with flat sales, EV rises monotonically forever" $flatMono
Assert-That "CONTROL: flat-sales peak sits at the ceiling" `
  (-not (Get-CurvePeak $flatCurve).interior)

# ------------------------------------------------------------- sales curve
$k2 = @{ x = (New-Object System.Collections.ArrayList); y = (New-Object System.Collections.ArrayList) }
[void]$k2.x.Add(100e6); [void]$k2.y.Add(1e7)
[void]$k2.x.Add(200e6); [void]$k2.y.Add(3e7)
Assert-That "sales below the first knot clamp to it" ((Get-SalesAt 50e6 $k2) -eq 1e7)
Assert-That "sales interpolate between knots" ([math]::Abs((Get-SalesAt 150e6 $k2) - 2e7) -lt 1e-6)
Assert-That "sales extrapolate upward above the last knot" ((Get-SalesAt 300e6 $k2) -gt 3e7)

# ------------------------------------------------------------- percentiles
$sample = @(1.0, 2.0, 3.0, 4.0)
Assert-That "percentile of a value below the sample is 0" ((Get-PercentileOf 0.5 $sample) -eq 0.0)
Assert-That "percentile of the maximum is 100" ((Get-PercentileOf 4.0 $sample) -eq 100.0)
Assert-That "percentile of the median is 50" ((Get-PercentileOf 2.0 $sample) -eq 50.0)
Assert-That "percentile of an empty sample is null" ($null -eq (Get-PercentileOf 1.0 @()))

# Appending a draw must re-rank, with no cached state carried over.
$s2 = @(0.30, 0.40, 0.50, 0.60)
$before = Get-PercentileOf 0.55 $s2
$s2 += 0.10
$afterPoor = Get-PercentileOf 0.55 $s2
$s2 += 0.99
$afterGood = Get-PercentileOf 0.55 $s2
Assert-That "percentiles recompute when a draw is appended" `
  ($before -eq 75.0 -and $afterPoor -eq 80.0 -and $afterGood -eq [math]::Round(100.0*4/6,1)) `
  "$before / $afterPoor / $afterGood"

Assert-That "percentile is stable under reordering" `
  ((Get-PercentileOf 0.5 @(0.1,0.9,0.5,0.3,0.7)) -eq (Get-PercentileOf 0.5 @(0.1,0.3,0.5,0.7,0.9)))

# ------------------------------------------------------- sweep ceiling guard
$smallGame = @(
  [pscustomobject]@{ jackpot = 2000000.0 }
  [pscustomobject]@{ jackpot = 40000000.0 }
)
$sc = Get-SweepCeiling $smallGame
Assert-That "sweep ceiling scales to the game's own largest jackpot" `
  ($sc.ceiling -eq 80000000.0) "got $($sc.ceiling)"

Write-Host ""
Write-Host ("value_heat self-check: {0} passed, {1} failed" -f $script:Pass, $script:Fail)
if ($script:Fail -gt 0) { exit 1 }
exit 0

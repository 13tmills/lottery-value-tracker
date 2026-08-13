# California scratcher REMAINING-VALUE analysis. Same output shape as the Idaho and
# Texas generators so the frontend is shared.
#
# calottery.com exposes a clean JSON API: /api/games/scratchers returns every game
# with price, and a full prizeTiers array carrying odds, value, totalNumberOfPrizes,
# numberOfPrizesCashed and numberOfPrizesPending. "Pending" IS the unclaimed count
# (cashed + pending = total), so nothing has to be estimated.
#
#   tickets printed = totalNumberOfPrizes x that tier's odds (cross-checked)
#   tickets sold   ~ printed x (prizes cashed / prizes total)
#   value per $1   = unclaimed prize value / (tickets left x price)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$API = "https://www.calottery.com/api/games/scratchers"

$resp = Invoke-RestMethod -Uri $API -Headers @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)' } -TimeoutSec 60
$all = @($resp.games)
Write-Host "API returned $($all.Count) games (updated $($resp.lastUpdateDateTime))"

$games = New-Object System.Collections.ArrayList
foreach ($g in $all) {
  if ($g.state -and $g.state -ne 'Active') { continue }      # skip ended games
  $price = [double]$g.price
  if ($price -le 0) { continue }
  $tiersRaw = @($g.prizeTiers | Where-Object { $_.value -gt 0 -and $_.totalNumberOfPrizes -gt 0 -and $_.odds -gt 0 })
  if ($tiersRaw.Count -lt 3) { continue }

  $tiers = New-Object System.Collections.ArrayList
  $printedEstimates = @()
  foreach ($t in $tiersRaw) {
    $total = [double]$t.totalNumberOfPrizes
    $cashed = [double]$t.numberOfPrizesCashed
    # "pending" is the unclaimed count; fall back to total - cashed if it's absent.
    $rem = if ($null -ne $t.numberOfPrizesPending) { [double]$t.numberOfPrizesPending } else { $total - $cashed }
    if ($rem -lt 0) { $rem = 0 }
    if ($rem -gt $total) { $rem = $total }
    $printedEstimates += ($total * [double]$t.odds)
    [void]$tiers.Add([pscustomobject]@{
      prize = [double]$t.value; original = [long]$total; remaining = [long]$rem; estimated = $false })
  }
  if ($tiers.Count -lt 3) { continue }

  # Print run: every tier implies total x odds; they must broadly agree.
  $sorted = @($printedEstimates | Sort-Object)
  $printed = [double]$sorted[[int]([math]::Floor($sorted.Count / 2))]
  $spread = if ($printed -gt 0) { [math]::Round(100 * (($sorted[-1] - $sorted[0]) / $printed), 1) } else { 999 }
  if ($printed -le 0 -or $spread -gt 25) { Write-Host ("  ! {0} print-run tiers disagree ({1}%); skipped" -f $g.name, $spread); continue }

  $totalPrizes = ($tiers | Measure-Object -Property original -Sum).Sum
  $remPrizes = ($tiers | Measure-Object -Property remaining -Sum).Sum
  if ($totalPrizes -le 0) { continue }
  $pctSold = 100.0 * (($totalPrizes - $remPrizes) / $totalPrizes)
  $ticketsLeft = $printed * (1 - $pctSold / 100)
  if ($ticketsLeft -lt 1) { continue }

  $valueLeft = 0.0; $origValue = 0.0
  foreach ($t in $tiers) { $valueLeft += $t.remaining * $t.prize; $origValue += $t.original * $t.prize }
  $evNow = $valueLeft / ($ticketsLeft * $price)
  $evStart = $origValue / ($printed * $price)

  # SANITY GATE: real scratch games pay ~60-75% at launch; anything far outside that
  # is a mis-parse, so drop it rather than publish a wrong figure.
  if ($evStart -lt 0.45 -or $evStart -gt 0.95) {
    Write-Host ("  ! {0} implausible launch payout {1:P0}; skipped" -f $g.name, $evStart); continue
  }

  $topTier = $tiers | Sort-Object prize -Descending | Select-Object -First 1
  $name = ($g.name -replace '&amp;', '&').Trim()
  $slug = ($g.productPage -replace '^/', '')
  [void]$games.Add([pscustomobject]@{
    name = $name
    url = $(if ($slug) { "https://www.calottery.com/$slug" } else { "https://www.calottery.com/scratchers" })
    price = $price
    overall_odds = $(if ($g.winningOddsText) { [double]$g.winningOddsText } else { $null })
    pct_sold = [math]::Round($pctSold, 1)
    tickets_printed = [long]$printed; tickets_left = [long]$ticketsLeft
    prize_value_left = [long]$valueLeft
    ev_now = [math]::Round($evNow, 4); ev_start = [math]::Round($evStart, 4)
    top_prize = [long]$topTier.prize; top_left = [long]$topTier.remaining; top_original = [long]$topTier.original
    est_tiers = 0
    top_share = $(if ($valueLeft -gt 0) { [math]::Round(($topTier.remaining * $topTier.prize) / $valueLeft, 3) } else { 0 })
    low_confidence = ($pctSold -gt 90)
    tiers = @($tiers | Sort-Object prize -Descending)
  })
}

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "CA"; state_name = "California"; source = "calottery.com"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). California's public API publishes every prize tier's odds, total prizes, prizes cashed and prizes still pending, so no tier is estimated; tickets printed is derived from total prizes x that tier's odds and cross-checked across tiers. Percent sold is inferred from the share of prizes cashed - small prizes often go unredeemed, so that understates sales and makes these figures conservative. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_ca.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_ca.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
  $sortedGames[0].name, $sortedGames[0].ev_now)

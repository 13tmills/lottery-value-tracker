# Michigan instant-game (scratch) analysis.
#
# ENDPOINT (recovered by hooking window.fetch in a browser while the SPA refetched):
#   POST https://www.michiganlottery.com/api   — Apollo GraphQL, introspection disabled
#   { getRetailTopPrizesRemainingByGameType(gameType: "INSTANT") {
#       cms_game_igt_id game_name
#       prizesRemainingData { prize_level prize_amount prizes_remaining starting_amount } } }
# No auth header needed; Origin/Referer set to be a good citizen.
#
# Gives every tier's original count (starting_amount) and unclaimed count
# (prizes_remaining) — but NOT the ticket price or overall odds, so the
# cents-per-dollar figure used for TX/CA/ID cannot be computed and we don't guess
# one. Michigan therefore uses the same price-independent value index as New York:
#
#   value_index = (share of prize VALUE unclaimed) / (share of PRIZES unclaimed)
#
# 1.00 = the game still holds the mix of prize money it launched with.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$API = 'https://www.michiganlottery.com/api'
$BODY = '{"query":"{ getRetailTopPrizesRemainingByGameType(gameType: \"INSTANT\"){ cms_game_igt_id game_name prizesRemainingData { prize_level prize_amount prizes_remaining starting_amount } } }","variables":null,"operation":null}'
$H = @{
  'User-Agent'   = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)'
  'Content-Type' = 'application/json'
  'Origin'       = 'https://www.michiganlottery.com'
  'Referer'      = 'https://www.michiganlottery.com/resources/instant-games-prizes-remaining'
}

$resp = Invoke-RestMethod -Uri $API -Method Post -Body $BODY -Headers $H -TimeoutSec 90
$raw = @($resp.data.getRetailTopPrizesRemainingByGameType)
Write-Host "API returned $($raw.Count) games"

$games = New-Object System.Collections.ArrayList
foreach ($g in $raw) {
  $name = ($g.game_name -replace '\s+', ' ').Trim()
  # Internal barcode/coupon records, not retail games.
  if (-not $name -or $name -match 'ONLN|BARCODE|\bCPN\b|\bTEST\b|COUPON') { continue }
  $tiersRaw = @($g.prizesRemainingData | Where-Object { $_.prize_amount -gt 0 -and $_.starting_amount -gt 0 })
  if ($tiersRaw.Count -lt 3) { continue }

  $tiers = New-Object System.Collections.ArrayList
  $vTot = 0.0; $vRem = 0.0; $nTot = 0.0; $nRem = 0.0
  foreach ($t in $tiersRaw) {
    $a = [double]$t.prize_amount
    $tot = [double]$t.starting_amount
    $rem = [double]$t.prizes_remaining
    if ($rem -lt 0) { $rem = 0 }; if ($rem -gt $tot) { $rem = $tot }
    $vTot += $a * $tot; $vRem += $a * $rem; $nTot += $tot; $nRem += $rem
    [void]$tiers.Add([pscustomobject]@{ prize = $a; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }
  if ($vTot -le 0 -or $nTot -le 0 -or $nRem -le 0) { continue }

  $pctClaimed = 100.0 * (1 - $nRem / $nTot)
  $valueIndex = ($vRem / $vTot) / ($nRem / $nTot)
  $topTier = $tiers | Sort-Object prize -Descending | Select-Object -First 1

  [void]$games.Add([pscustomobject]@{
    name = $name
    game_number = [string]$g.cms_game_igt_id
    url = "https://www.michiganlottery.com/resources/instant-games-prizes-remaining"
    pct_sold = [math]::Round($pctClaimed, 1)
    value_index = [math]::Round($valueIndex, 3)
    prize_value_left = [long]$vRem
    prize_value_total = [long]$vTot
    top_prize = [long]$topTier.prize
    top_left = [long]$topTier.remaining
    top_original = [long]$topTier.original
    top_share = $(if ($vRem -gt 0) { [math]::Round(($topTier.remaining * $topTier.prize) / $vRem, 3) } else { 0 })
    low_confidence = ($pctClaimed -gt 90)
    tiers = @($tiers | Sort-Object prize -Descending)
  })
}

$sorted = @($games | Sort-Object value_index -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "MI"; state_name = "Michigan"; source = "michiganlottery.com"
  metric = "index"
  method = "Michigan publishes, for every prize tier of every instant game, how many prizes were printed and how many remain unclaimed - but not the ticket price or overall odds, so a cents-per-dollar figure cannot be computed here and we do not guess one. The value index compares the share of prize VALUE still unclaimed against the share of PRIZES still unclaimed: 1.00 means the game holds exactly the mix of prize money it launched with, below 1.00 means the large prizes have gone while small ones remain. As the Michigan Lottery itself notes, remaining prizes are UNCLAIMED and include tickets that may or may not already have been sold. Games with more than 90% of prizes claimed are flagged, since few prizes remain and the index gets noisy."
  games = $sorted
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_mi.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_mi.json: {0} games ({1} KB). index {2:N2}-{3:N2}; {4} flagged >90% claimed" -f `
  $sorted.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sorted.value_index | Measure-Object -Minimum).Minimum, ($sorted.value_index | Measure-Object -Maximum).Maximum, `
  @($sorted | Where-Object { $_.low_confidence }).Count)

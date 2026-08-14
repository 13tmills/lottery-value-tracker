# South Carolina instant-game REMAINING-VALUE analysis. Same output shape as the
# NC/GA/CA/TX/ID generators so the frontend is shared.
#
# SOURCE: sceducationlottery.com is server-rendered - no API, no headers needed.
# Index /Games/InstantGames links games as /Games/InstantGame?gameId=NNNN.
# Each detail page carries "Price: $10", "Overall Odds: 1 in 3.56", and a
# five-column prize table:
#   Prize Amount | Est. Unclaimed Prizes | Est. Value Unclaimed | Prizes at Start | Value at Start
#
# NOTE: /Games/InstantGameOdds?gameId=N looks like a full odds breakdown but is an
# IMAGE only - useless to parse. The detail page already has everything.
#
#   tickets printed = total prizes at start x overall odds
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$BASE = "https://www.sceducationlottery.com"
$H = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)' }

$idx = (Invoke-WebRequest -Uri "$BASE/Games/InstantGames" -Headers $H -UseBasicParsing -TimeoutSec 60).Content
$ids = [regex]::Matches($idx, 'gameId=(\d+)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
Write-Host "index lists $($ids.Count) games"

function Num([string]$s) { [double](($s -replace '[^\d.]', '')) }

$games = New-Object System.Collections.ArrayList
$skipped = 0
foreach ($id in $ids) {
  $url = "$BASE/Games/InstantGame?gameId=$id"
  try { $html = (Invoke-WebRequest -Uri $url -Headers $H -UseBasicParsing -TimeoutSec 45).Content }
  catch { $skipped++; continue }

  $flat = ($html -replace '<[^>]*>', ' ') -replace '\s+', ' '
  if ($flat -notmatch 'Price:\s*\$([\d,.]+)') { $skipped++; continue }
  $price = Num $Matches[1]
  if ($price -le 0) { $skipped++; continue }
  $odds = $null
  if ($flat -match 'Overall Odds:\s*1 in ([\d,.]+)') { $odds = Num $Matches[1] }
  if (-not $odds -or $odds -le 1) { $skipped++; continue }

  # Title: "Scratch-Off - <name> (Game #1645) - South Carolina Education Lottery"
  $name = ''
  if ($html -match '<title>\s*(.*?)\s*</title>') { $name = $Matches[1] }
  $name = ($name -replace '^\s*Scratch-Off\s*-\s*', '' -replace '\s*\(Game\s*#\d+\).*$', '' `
                 -replace '\s*-\s*South Carolina.*$', '' -replace '&amp;', '&').Trim()
  if (-not $name) { $name = "Game #$id" }

  # Prize rows: amount | unclaimed count | unclaimed value | original count | original value
  $rows = [regex]::Matches($html,
    '(?s)<tr[^>]*>\s*<td[^>]*>\s*\$([\d,]+)\s*</td>\s*<td[^>]*>\s*([\d,]+)\s*</td>\s*<td[^>]*>\s*\$([\d,]+)\s*</td>\s*<td[^>]*>\s*([\d,]+)\s*</td>')
  if ($rows.Count -lt 3) { $skipped++; continue }

  $tiers = New-Object System.Collections.ArrayList
  foreach ($m in $rows) {
    $amt = Num $m.Groups[1].Value
    $rem = Num $m.Groups[2].Value
    $tot = Num $m.Groups[4].Value
    if ($amt -le 0 -or $tot -le 0) { continue }
    if ($rem -lt 0) { $rem = 0 }; if ($rem -gt $tot) { $rem = $tot }
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }
  if ($tiers.Count -lt 3) { $skipped++; continue }

  $totalPrizes = ($tiers | Measure-Object -Property original -Sum).Sum
  $remPrizes = ($tiers | Measure-Object -Property remaining -Sum).Sum
  if ($totalPrizes -le 0 -or $remPrizes -le 0) { $skipped++; continue }
  $printed = $totalPrizes * $odds
  $pctSold = 100.0 * (($totalPrizes - $remPrizes) / $totalPrizes)
  $ticketsLeft = $printed * (1 - $pctSold / 100)
  if ($ticketsLeft -lt 1) { $skipped++; continue }

  $valueLeft = 0.0; $origValue = 0.0
  foreach ($t in $tiers) { $valueLeft += $t.remaining * $t.prize; $origValue += $t.original * $t.prize }
  $evNow = $valueLeft / ($ticketsLeft * $price)
  $evStart = $origValue / ($printed * $price)

  # SANITY GATE: real scratch games pay ~60-75% at launch; far outside that is a
  # mis-parse, so drop it rather than publish a wrong figure.
  if ($evStart -lt 0.45 -or $evStart -gt 0.95) {
    Write-Host ("  ! {0} implausible launch payout {1:P0}; skipped" -f $name, $evStart); continue
  }

  $topTier = $tiers | Sort-Object prize -Descending | Select-Object -First 1
  [void]$games.Add([pscustomobject]@{
    name = $name
    game_number = [string]$id
    url = $url
    price = $price
    overall_odds = $odds
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
if ($skipped -gt 0) { Write-Host "  ($skipped games skipped: unreadable or incomplete prize table)" }

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "SC"; state_name = "South Carolina"; source = "sceducationlottery.com"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). South Carolina publishes, for every prize tier of every instant game, the number of prizes at the start of the game and the estimated number still unclaimed, along with the ticket price and the game's overall odds. Tickets printed is derived from total prizes x overall odds. Percent sold is inferred from the share of prizes claimed - small prizes often go unredeemed, so that understates sales and makes these figures conservative. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_sc.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_sc.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
  $sortedGames[0].name, $sortedGames[0].ev_now)

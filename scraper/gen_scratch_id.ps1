# Idaho scratch-ticket REMAINING-VALUE analysis (Track B pilot).
#
# idaholottery.com publishes, per game: ticket price, overall odds, % sold, and a
# prize table with ORIGINAL count, REMAINING count and per-tier odds. That is enough
# to compute what a ticket is worth *right now* rather than at print time:
#
#   total tickets printed  = original prize count x that tier's odds (cross-checked
#                            across tiers; they must agree)
#   tickets remaining      = printed x (1 - pctSold/100)
#   remaining prize value  = sum(remaining count x prize amount)
#   value per $1 NOW       = remaining prize value / (tickets remaining x price)
#
# This is the number no lottery site shows players: a game whose top prizes are all
# claimed is strictly worse than the day it launched, at the same ticket price.
# Writes scratch_id.json. Path-relative; run locally or via pwsh in CI.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$UA = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)' }
$BASE = "https://www.idaholottery.com"

function Money($s) { [double](($s -replace '[^0-9.]', '')) }

# 1) collect game detail URLs from the scratch index
$index = (Invoke-WebRequest -Uri "$BASE/games/scratch" -Headers $UA -UseBasicParsing -TimeoutSec 40).Content
$paths = [regex]::Matches($index, 'href="(/games/scratch/[^"#?]+)"') |
  ForEach-Object { $_.Groups[1].Value } |
  Where-Object { $_ -notmatch '/games/scratch/?$' } |
  Sort-Object -Unique
Write-Host "found $($paths.Count) scratch game pages"

$games = New-Object System.Collections.ArrayList
foreach ($p in $paths) {
  try { $html = (Invoke-WebRequest -Uri ($BASE + $p) -Headers $UA -UseBasicParsing -TimeoutSec 30).Content }
  catch { Write-Host "  ! fetch failed $p"; continue }
  $txt = ($html -replace '<[^>]+>', ' ') -replace '\s+', ' '

  # The <h1> is rendered client-side, so take the name from <title> ("Name | Idaho Lottery").
  $name = ([regex]::Match($html, '(?s)<title[^>]*>(.*?)</title>')).Groups[1].Value
  $name = (($name -split '\|')[0] -replace '&amp;', '&' -replace '&#\d+;', '' -replace '\s+', ' ').Trim()
  if (-not $name) { continue }

  $price = ([regex]::Match($txt, '\$\s*([\d,.]+)\s*Ticket')).Groups[1].Value
  $overall = ([regex]::Match($txt, '1:([\d.]+)\s*overall odds')).Groups[1].Value
  $pctSold = ([regex]::Match($txt, '([\d.]+)\s*%\s*sold')).Groups[1].Value
  if (-not $price -or -not $pctSold) { continue }
  $price = Money $price; $pctSold = [double]$pctSold

  # Prize rows: "<orig> $<amount> <remaining|*not available> 1:<odds>".
  # Idaho withholds remaining counts for prizes under $25 ("Prizes below $25 are not
  # available") — and those small tiers are the great majority of the prize pool. For
  # them we estimate remaining as original x (1 - pctSold): they are numerous enough
  # that they deplete very close to proportionally. The big tiers, where the actual
  # count genuinely matters, carry published exact figures.
  $rows = [regex]::Matches($txt, '([\d,]+)\s+\$([\d,]+(?:\.\d+)?)\s+(\*not available|[\d,]+)\s+1:([\d,.]+)')
  if ($rows.Count -lt 2) { continue }

  $tiers = New-Object System.Collections.ArrayList
  $printedEstimates = @()
  $estimatedTiers = 0
  foreach ($r in $rows) {
    $orig = [double](($r.Groups[1].Value) -replace ',', '')
    $amt  = [double](($r.Groups[2].Value) -replace ',', '')
    $remRaw = $r.Groups[3].Value
    $odds = [double](($r.Groups[4].Value) -replace ',', '')
    if ($orig -le 0 -or $odds -le 0) { continue }
    $printedEstimates += ($orig * $odds)
    if ($remRaw -like '*not available*') {
      $rem = $orig * (1 - $pctSold / 100); $isEst = $true; $estimatedTiers++
    } else {
      $rem = [double]($remRaw -replace ',', ''); $isEst = $false
    }
    [void]$tiers.Add([pscustomobject]@{
      prize = $amt; original = [long]$orig; remaining = [long][math]::Round($rem); estimated = $isEst })
  }
  if ($tiers.Count -lt 2) { continue }

  # Total tickets printed: every tier implies orig x odds. Published odds are rounded,
  # so allow a modest spread; a wild disagreement means a mis-parse.
  $sorted = @($printedEstimates | Sort-Object)
  $printed = [double]$sorted[[int]([math]::Floor($sorted.Count / 2))]
  $spread = if ($printed -gt 0) { [math]::Round(100 * (($sorted[-1] - $sorted[0]) / $printed), 1) } else { 999 }
  if ($printed -le 0 -or $spread -gt 25) { Write-Host "  ! $name printed-count tiers disagree ($spread%); skipped"; continue }

  $ticketsLeft = $printed * (1 - $pctSold / 100)
  if ($ticketsLeft -lt 1) { continue }
  $valueLeft = 0.0; $origValue = 0.0
  foreach ($t in $tiers) { $valueLeft += $t.remaining * $t.prize; $origValue += $t.original * $t.prize }

  $evNow = $valueLeft / ($ticketsLeft * $price)          # value returned per $1 spent, right now
  $evStart = $origValue / ($printed * $price)            # what it was at launch
  $topTier = $tiers | Sort-Object prize -Descending | Select-Object -First 1

  # SANITY GATE: a real scratch game returns roughly 60-75% of sales as prizes at
  # launch. If ev_start lands far outside that, we have mis-parsed the prize table
  # (e.g. missed tiers) — drop the game rather than publish a wrong figure.
  if ($evStart -lt 0.45 -or $evStart -gt 0.95) {
    Write-Host ("  ! {0} implausible launch payout {1:P0}; skipped (likely mis-parse)" -f $name, $evStart)
    continue
  }

  [void]$games.Add([pscustomobject]@{
    name = $name
    url = $BASE + $p
    price = $price
    overall_odds = $(if ($overall) { [double]$overall } else { $null })
    pct_sold = $pctSold
    tickets_printed = [long]$printed
    tickets_left = [long]$ticketsLeft
    prize_value_left = [long]$valueLeft
    ev_now = [math]::Round($evNow, 4)
    ev_start = [math]::Round($evStart, 4)
    top_prize = [long]$topTier.prize
    top_left = [long]$topTier.remaining
    top_original = [long]$topTier.original
    est_tiers = $estimatedTiers
    # Late in a print run, "unclaimed" and "still on the shelf" diverge badly: a big
    # prize may already sit in a sold ticket. Flag those so they are never presented
    # as a live opportunity.
    low_confidence = ($pctSold -gt 90)
    tiers = @($tiers | Sort-Object prize -Descending)
  })
  Start-Sleep -Milliseconds 250
}

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "ID"; state_name = "Idaho"; source = "idaholottery.com"
  method = "Value per `$1 remaining = (sum of unclaimed prize value) / (estimated unsold tickets x ticket price). Tickets printed is derived from each prize tier's original count times its published odds, cross-checked across tiers. Idaho withholds remaining counts for prizes under `$25, so those tiers are estimated as original x (1 - percent sold); the large prizes that actually move the number carry published exact counts. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought. Games more than 90% sold are flagged low_confidence for that reason and should not be read as live opportunities."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_id.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_id.json: {0} games ({1} KB). Best value/`$1: {2} ({3:P0}); worst: {4} ({5:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  $sortedGames[0].name, $sortedGames[0].ev_now, $sortedGames[-1].name, $sortedGames[-1].ev_now)

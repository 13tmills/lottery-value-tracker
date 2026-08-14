# New Mexico scratch-off REMAINING-VALUE analysis. Same output shape as the
# NC/CT/GA/CA/TX/ID generators so the frontend is shared.
#
# SOURCE: nmlottery.com is a WordPress site whose entire scratcher catalogue is
# rendered into ONE server-side page - the cheapest scrape we have, a single
# request for every game.
#   GET https://www.nmlottery.com/games/scratchers/
#
# Each game is one <div class="filter-block"> accordion holding:
#   <h3>NAME</h3>
#   <p class="price">&#36;5</p>                        ticket price
#   <p class="game-number"><strong>Game Number:</strong> 575</p>
#   "Approximate overall odds of winning (includes breakeven prizes): 1 in 3.61"
#   <table class="data"> with columns
#     Prize: | Approx. Odds 1 in: | Approx. # of Prizes: | Approx. Prizes Remaining:
#
# Like NC (and unlike CT, which states its print run outright) New Mexico
# publishes PER-TIER odds, so the print run is derived from every tier
# independently and cross-checked - a mis-parse shows up as tiers disagreeing.
#
#   tickets printed = that tier's prize count x that tier's odds (median, cross-checked)
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
#
# GOTCHAS
#   - SEGMENTATION IS THE WHOLE JOB. All ~55 games share one page, so a lazy
#     regex merges them into one giant game. We split strictly on the
#     <div class="filter-block"> boundary and then assert a plausible game
#     count, a name and exactly one prize table per block.
#   - The table markup is malformed (the source emits "</ th >" and "</ tr >"
#     with stray spaces). Only the <td> cells are well formed, so we match
#     <tr>...</tr> then <td>...</td> inside and strip tags per cell, never a
#     flat <td>value</td> pattern.
#   - Prices and prizes are HTML entities (&#36; for $), and names carry curly
#     quotes and (R)/(TM) marks, so every extracted cell goes through
#     HtmlDecode.
#   - Breakeven tiers read "$5 FREE TICKET" rather than a bare amount. That is a
#     real published value (always exactly the ticket price, verified across all
#     31 games that have one) and NM's own overall odds include it, so we count
#     it at face value. Any OTHER non-numeric prize cell (an annuity with no
#     published cash figure) skips the whole game - we never invent a number.
#   - UNITS: prizes and price are whole dollars; the odds column is "1 in X"
#     with X tickets per winning ticket of that tier (it can be fractional,
#     e.g. 8.57, and is NOT a percentage).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$PAGE = "https://www.nmlottery.com/games/scratchers/"
$H = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)' }

function Num([string]$s) { [double](($s -replace '[^\d.]', '')) }
function Strip([string]$s) {
  $t = $s -replace '(?s)<[^>]+>', ' '
  $t = [System.Net.WebUtility]::HtmlDecode($t)
  return (($t -replace '\s+', ' ').Trim())
}

$html = (Invoke-WebRequest -Uri $PAGE -Headers $H -UseBasicParsing -TimeoutSec 120).Content
# Segment the single page into one chunk per game. Element 0 is the page
# chrome before the first game and is discarded.
$blocks = [regex]::Split($html, '<div class="filter-block">')
$blocks = @($blocks | Select-Object -Skip 1)
Write-Host "page split into $($blocks.Count) game blocks"
if ($blocks.Count -lt 20) { throw "segmentation failed - only $($blocks.Count) blocks; page layout changed" }

$games = New-Object System.Collections.ArrayList
$skipped = 0
foreach ($b in $blocks) {
  $name = ''
  if ($b -match '(?s)<h3>(.*?)</h3>') { $name = Strip $Matches[1] }
  if (-not $name) { Write-Host "  ! block with no game name; skipped"; $skipped++; continue }

  $gid = ''
  if ($b -match 'Game Number:</strong>\s*([0-9]+)') { $gid = $Matches[1] }
  if (-not $gid) { Write-Host ("  ! {0} no game number; skipped" -f $name); $skipped++; continue }

  $price = 0.0
  if ($b -match '(?s)<p class="price">(.*?)</p>') { $price = Num (Strip $Matches[1]) }
  if ($price -le 0) { Write-Host ("  ! {0} no ticket price; skipped" -f $name); $skipped++; continue }

  $odds = $null
  if ($b -match 'overall odds[^<]*?1 in ([\d,.]+)') { $odds = Num $Matches[1] }

  # Exactly one prize table per block; more than one means we merged two games.
  $tmatch = [regex]::Matches($b, '(?s)<table class="data".*?</table>')
  if ($tmatch.Count -ne 1) {
    Write-Host ("  ! {0} found {1} prize tables in one block; skipped" -f $name, $tmatch.Count); $skipped++; continue
  }

  $tiers = New-Object System.Collections.ArrayList
  $printedEstimates = @()
  $bad = $false; $noOdds = 0
  foreach ($r in [regex]::Matches($tmatch[0].Value, '(?s)<tr>.*?</tr>')) {
    $c = New-Object System.Collections.ArrayList
    foreach ($cell in [regex]::Matches($r.Value, '(?s)<td[^>]*>(.*?)</td>')) { [void]$c.Add((Strip $cell.Groups[1].Value)) }
    if ($c.Count -lt 4) { continue }                       # header row carries <th>
    # "$500" or "$5 FREE TICKET" are both fine; anything else is unvaluable.
    if ($c[0] -notmatch '^\$[\d,]+(\.\d+)?(\s+FREE TICKET)?$') { $bad = $true; break }
    $amt = Num $c[0]
    $tOdds = Num $c[1]; $tot = Num $c[2]; $rem = Num $c[3]
    if ($amt -gt 0 -and $tot -gt 0 -and $tOdds -le 0) { $noOdds++ }
    if ($amt -le 0 -or $tot -le 0 -or $tOdds -le 0) { continue }
    if ($rem -lt 0) { $rem = 0 }; if ($rem -gt $tot) { $rem = $tot }
    $printedEstimates += ($tot * $tOdds)
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }
  if ($bad) { Write-Host ("  ! {0} non-cash prize tier with no published value; skipped" -f $name); $skipped++; continue }
  if ($tiers.Count -lt 3) {
    # NM zeroes the odds column on a few games. Without per-tier odds there is
    # no verifiable print run, and we will not back one out of a single figure.
    if ($noOdds -gt 0 -and $tiers.Count -eq 0) {
      Write-Host ("  ! {0} publishes 0 for every tier's odds - no derivable print run; skipped" -f $name)
    } else {
      Write-Host ("  ! {0} only $($tiers.Count) readable tiers; skipped" -f $name)
    }
    $skipped++; continue
  }

  # Every tier implies a print run; they must broadly agree or we've mis-parsed.
  $sortedEst = @($printedEstimates | Sort-Object)
  $printed = [double]$sortedEst[[int]([math]::Floor($sortedEst.Count / 2))]
  $spread = if ($printed -gt 0) { [math]::Round(100 * (($sortedEst[-1] - $sortedEst[0]) / $printed), 1) } else { 999 }
  if ($printed -le 0 -or $spread -gt 25) {
    Write-Host ("  ! {0} print-run tiers disagree ({1}%); skipped" -f $name, $spread); $skipped++; continue
  }

  $totalPrizes = ($tiers | Measure-Object -Property original -Sum).Sum
  $remPrizes = ($tiers | Measure-Object -Property remaining -Sum).Sum
  if ($totalPrizes -le 0 -or $remPrizes -le 0) { $skipped++; continue }
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
    Write-Host ("  ! {0} implausible launch payout {1:P0}; skipped" -f $name, $evStart); $skipped++; continue
  }

  $topTier = $tiers | Sort-Object prize -Descending | Select-Object -First 1
  [void]$games.Add([pscustomobject]@{
    name = $name
    game_number = [string]$gid
    url = $PAGE
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
if ($skipped -gt 0) { Write-Host "  ($skipped games skipped, reasons above)" }

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "NM"; state_name = "New Mexico"; source = "nmlottery.com"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). New Mexico publishes its whole scratcher catalogue on one page, and for every prize tier of every game it gives the prize amount, that tier's odds, the approximate number of prizes at printing and the number still unclaimed. Because per-tier odds are published, tickets printed is derived from each tier's prize count x that tier's odds and cross-checked across all tiers, so a bad parse shows up as tiers disagreeing and the game is dropped. Nothing is estimated. Breakeven 'free ticket' prizes are counted at the ticket price New Mexico prints for them, which is how the state's own overall odds treat them. Percent sold is inferred from the share of prizes claimed - small prizes often go unredeemed, so that understates sales and makes these figures conservative. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought but not yet cashed, so a game showing a top prize left is not a promise one is still on the shelf. New Mexico also labels its own prize counts 'approximate'. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_nm.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_nm.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
  $sortedGames[0].name, $sortedGames[0].ev_now)

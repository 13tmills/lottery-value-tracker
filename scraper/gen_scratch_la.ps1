# Louisiana scratch-off REMAINING-VALUE analysis. Same output shape as the
# NC/GA/CA/TX/ID generators so the frontend is shared.
#
# SOURCE - two steps, both public, no auth, no referer needed:
#   1) GAME LIST: https://louisianalottery.com/wp-json/wp/v2/instant-game?per_page=100&page=N
#      Plain WordPress REST. Response header X-WP-Total gives the row count and
#      X-WP-TotalPages the page count (211 rows / 3 pages at time of writing).
#      Each row's "link" is the detail URL and "class_list" carries the taxonomy
#      terms, including game-type-scratch-offs vs game-type-fast-play. Fast Play
#      is a terminal-printed product, not a scratch ticket, so it is dropped
#      (173 of the 211 rows are scratch-offs).
#   2) DETAIL: the "link" URL. Fully server-rendered PHP, no JS needed:
#        <em>$1</em>Ticket Price        -> ticket price
#        <em>1 in 4.99</em>Overall Odds -> overall odds
#        <h1 class="page-title">        -> game name
#        hero__game-serial">Game No. N  -> game number
#      and a prize table with columns:
#        Tier Prize | Odds of Winning | Total | Claimed | Remaining
#
# WHY THE TABLE IS PARSED ROW-BY-ROW: the cells are emitted with heavy
# whitespace and the tfoot carries a <td colspan="5"> disclaimer, so a flat
# "<td>$1,234</td>" regex is unreliable. Rows are matched first, then the five
# <td> cells inside each row, then tags are stripped per cell.
#
# LOUISIANA IS ONE OF THE BETTER SOURCES:
#   - CLAIMED is stated outright, so percent sold is read, not subtracted.
#   - PER-TIER ODDS are published, so the print run is derived from every tier
#     independently and cross-checked (a mis-parse shows up as tiers
#     disagreeing). In practice LA tiers agree to under 0.2%.
#
# GAME STATUS: the detail page tags ended games with
#   <li class="hero__tags__tag hero__tags__tag--impact">Expired</li>  (or Closed)
# and adds a "Close Date:" line to the meta list. Only untagged games are still
# on sale, so everything else is dropped (132 Expired + 7 Closed at time of
# writing, leaving 34 live games).
#
# FREE-TICKET TIERS: Louisiana lists a "TICKET" tier (a free replacement ticket)
# instead of a dollar amount. It is the only non-numeric label LA uses - there
# are no annuity tiers to worry about. No dollar figure is published for it, so
# rather than invent one it is excluded from the prize value. That makes every
# LA figure here slightly CONSERVATIVE (a $1 game with 1-in-10 free tickets is
# understated by about 10 cents on the dollar).
#
# UNITS: prizes and price are already whole dollars in the HTML (no cents
# conversion needed); odds are "1 in X" decimals.
#
#   tickets printed = that tier's prize count x that tier's odds (median, cross-checked)
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$UA = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)' }
$API = "https://louisianalottery.com/wp-json/wp/v2/instant-game"

# Decode bodies as UTF-8 explicitly - PowerShell 5.1 falls back to Latin-1 when
# a response omits the charset, which turns curly quotes and (R)/(TM) marks in
# game names into mojibake.
function Get-Html([string]$u) {
  $r = Invoke-WebRequest -Uri $u -Headers $UA -UseBasicParsing -TimeoutSec 45
  [System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
}
function Num([string]$s) { [double](($s -replace '[^\d.]', '')) }
function Strip([string]$s) {
  ($s -replace '(?s)<[^>]+>', '' -replace '&nbsp;', ' ' -replace '&#0?39;', "'" -replace '&#8217;', "'" -replace '&amp;', '&').Trim()
}

# ---- 1) enumerate games -----------------------------------------------------
$rows = New-Object System.Collections.ArrayList
$page = 1
$totalPages = 1
while ($page -le $totalPages -and $page -le 20) {
  $resp = Invoke-WebRequest -Uri ("{0}?per_page=100&page={1}" -f $API, $page) -Headers $UA -UseBasicParsing -TimeoutSec 60
  if ($page -eq 1) {
    $tp = $resp.Headers['X-WP-TotalPages']
    $tt = $resp.Headers['X-WP-Total']
    if ($tp) { $totalPages = [int]($tp | Select-Object -First 1) }
    Write-Host ("wp-json reports {0} instant-game rows across {1} pages" -f $tt, $totalPages)
  }
  foreach ($r in ($resp.Content | ConvertFrom-Json)) { [void]$rows.Add($r) }
  $page++
}
$list = @($rows | Where-Object { $_.class_list -contains 'game-type-scratch-offs' })
Write-Host ("{0} of {1} rows are scratch-offs (rest are Fast Play)" -f $list.Count, $rows.Count)

# ---- 2) walk detail pages ---------------------------------------------------
$games = New-Object System.Collections.ArrayList
$skipped = 0
$ended = 0
foreach ($g in $list) {
  $url = [string]$g.link
  try { $doc = Get-Html $url }
  catch { $skipped++; continue }

  # Ended games carry a status tag (Expired / Closed) and a Close Date line.
  if ($doc -match 'hero__tags__tag[^>]*>\s*([^<]+?)\s*<') { $ended++; continue }
  if ($doc -match 'Close Date:') { $ended++; continue }

  $name = ''
  if ($doc -match '<h1 class="page-title">([^<]+)</h1>') { $name = Strip $Matches[1] }
  $gameNo = ''
  if ($doc -match 'hero__game-serial">\s*Game No\.\s*([\w\-]+)\s*<') { $gameNo = $Matches[1] }
  if (-not $name) { $skipped++; continue }

  $price = 0.0
  if ($doc -match '<em>\$([\d,\.]+)</em>\s*Ticket Price') { $price = Num $Matches[1] }
  if ($price -le 0) { $skipped++; continue }
  $odds = $null
  if ($doc -match '<em>1 in ([\d,\.]+)</em>\s*Overall Odds') { $odds = Num $Matches[1] }

  # Pick the prize table (the page has several tables; ours has the Tier header).
  $tbl = ''
  foreach ($m in [regex]::Matches($doc, '(?s)<table[^>]*>(.*?)</table>')) {
    if ($m.Value -match 'Tier Prize') { $tbl = $m.Value; break }
  }
  if (-not $tbl) { $skipped++; continue }

  $tiers = New-Object System.Collections.ArrayList
  $printedEstimates = @()
  $totalPrizes = 0.0
  $claimedPrizes = 0.0
  $badTier = $false
  foreach ($r in [regex]::Matches($tbl, '(?s)<tr>(.*?)</tr>')) {
    $cells = [regex]::Matches($r.Groups[1].Value, '(?s)<td[^>]*>(.*?)</td>')
    if ($cells.Count -ne 5) { continue }          # header row and colspan footer
    $label = Strip $cells[0].Groups[1].Value
    $oddTxt = Strip $cells[1].Groups[1].Value
    if ($oddTxt -notmatch '1 in ([\d,\.]+)') { continue }
    $tOdds = Num $Matches[1]
    $tot = Num (Strip $cells[2].Groups[1].Value)
    $clm = Num (Strip $cells[3].Groups[1].Value)
    $rem = Num (Strip $cells[4].Groups[1].Value)
    if ($tOdds -le 0 -or $tot -le 0) { continue }
    if ($clm -lt 0) { $clm = 0 }
    if ($clm -gt $tot) { $clm = $tot }
    if ($rem -lt 0) { $rem = 0 }
    if ($rem -gt $tot) { $rem = $tot }
    # Every tier - free tickets included - tells us the print run.
    $printedEstimates += ($tot * $tOdds)

    if ($label -eq 'TICKET') { continue }         # free ticket, no dollar value published
    if ($label -notmatch '^\$[\d,]+(\.\d+)?$') { $badTier = $true; break }
    $amt = Num $label
    if ($amt -le 0) { continue }
    $totalPrizes += $tot
    $claimedPrizes += $clm
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }
  # A tier we cannot price (annuity / merchandise with no published cash value)
  # would silently understate the game, so drop the whole game instead.
  if ($badTier) { Write-Host ("  ! {0} has a non-cash tier with no published value; skipped" -f $name); continue }
  if ($tiers.Count -lt 3) { $skipped++; continue }

  $sortedEst = @($printedEstimates | Sort-Object)
  $printed = [double]$sortedEst[[int]([math]::Floor($sortedEst.Count / 2))]
  if ($printed -gt 0) { $spread = [math]::Round(100 * (($sortedEst[-1] - $sortedEst[0]) / $printed), 1) } else { $spread = 999 }
  if ($printed -le 0 -or $spread -gt 25) {
    Write-Host ("  ! {0} print-run tiers disagree ({1}%); skipped" -f $name, $spread); continue
  }

  if ($totalPrizes -le 0) { $skipped++; continue }
  $pctSold = 100.0 * ($claimedPrizes / $totalPrizes)
  $ticketsLeft = $printed * (1 - $pctSold / 100)
  if ($ticketsLeft -lt 1) { $skipped++; continue }

  $valueLeft = 0.0; $origValue = 0.0
  foreach ($t in $tiers) { $valueLeft += $t.remaining * $t.prize; $origValue += $t.original * $t.prize }
  if ($valueLeft -le 0) { $skipped++; continue }
  $evNow = $valueLeft / ($ticketsLeft * $price)
  $evStart = $origValue / ($printed * $price)

  # SANITY GATE: real scratch games pay ~60-75% at launch; far outside that is a
  # mis-parse, so drop it rather than publish a wrong figure.
  if ($evStart -lt 0.45 -or $evStart -gt 0.95) {
    Write-Host ("  ! {0} implausible launch payout {1:P0}; skipped" -f $name, $evStart); continue
  }

  $topTier = $tiers | Sort-Object prize -Descending | Select-Object -First 1
  if ($valueLeft -gt 0) { $topShare = [math]::Round(($topTier.remaining * $topTier.prize) / $valueLeft, 3) } else { $topShare = 0 }
  [void]$games.Add([pscustomobject]@{
    name = $name
    game_number = [string]$gameNo
    url = $url
    price = $price
    overall_odds = $odds
    pct_sold = [math]::Round($pctSold, 1)
    tickets_printed = [long]$printed; tickets_left = [long]$ticketsLeft
    prize_value_left = [long]$valueLeft
    ev_now = [math]::Round($evNow, 4); ev_start = [math]::Round($evStart, 4)
    top_prize = [long]$topTier.prize; top_left = [long]$topTier.remaining; top_original = [long]$topTier.original
    est_tiers = 0
    top_share = $topShare
    low_confidence = ($pctSold -gt 90)
    tiers = @($tiers | Sort-Object prize -Descending)
  })
}
Write-Host ("  ($ended games skipped: expired or closed - no longer on sale)")
if ($skipped -gt 0) { Write-Host "  ($skipped games skipped: unreadable or incomplete prize table)" }

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "LA"; state_name = "Louisiana"; source = "louisianalottery.com"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). The Louisiana Lottery publishes, for every prize tier of every scratch game, the prize amount, that tier's odds, the total number of prizes in the game, how many have been CLAIMED and how many remain - refreshed daily. Nothing here is estimated: tickets printed is derived from each tier's prize count x that tier's odds and cross-checked across every tier of the game, and percent sold comes from the claimed counts Louisiana states outright rather than from subtraction. Only games still on sale are listed - games the site tags Expired or Closed are dropped. Louisiana also awards free-ticket prizes, shown as a 'TICKET' tier with no dollar figure; because no cash value is published for them they are left out of the prize value, which makes these numbers slightly conservative on cheap tickets. Small prizes often go unredeemed, so a claimed-prize count understates true sales, which is conservative in the same direction. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_la.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_la.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
  $sortedGames[0].name, $sortedGames[0].ev_now)

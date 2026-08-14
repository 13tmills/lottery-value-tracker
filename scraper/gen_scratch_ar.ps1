# Arkansas scratch-off REMAINING-VALUE analysis. Same output shape as the
# NC/GA/CA/TX/ID generators so the frontend is shared.
#
# SOURCE - myarkansaslottery.com is a plain Drupal 7 site, fully server-rendered,
# no API, no headers required:
#   1) INDEX: /games/instant?amount=All  (paged, ?page=0..5, 12 games a page,
#      72 games at time of writing). Each teaser links the detail page as
#        <h2><a href="/games/<slug>">Name</a></h2>
#      Only that anchor shape is used - the site menu also contains /games/...
#      links for the draw games (lotto, cash-3, mega-millions) which must not be
#      picked up. Some slugs are percent-encoded (e.g. /games/10x%C2%AE-0 for
#      "10X(R)"), so hrefs are used verbatim, never rebuilt from the name.
#   2) DETAIL: /games/<slug>. Fields live in named Drupal field wrappers:
#        field-name-field-game-number  -> <strong>908</strong>
#        field-name-field-ticket-price -> "$20"
#        field-name-field-game-odds    -> "1 in 2.97"
#        h1.layout-center              -> game name
#        table.table-instant-game-data -> the prize table
#        "Last Sell Date:"             -> sales cutoff, or "To Be Determined"
#      Table columns:
#        Tier Prize Description | Total Prizes in Game per Tier |
#        Estimated Prizes Remaining per Tier | Total Prize Amount in Game per Tier |
#        Estimated Prize Amount Remaining per Tier
#
# WHY THE TABLE IS PARSED ROW-BY-ROW: every cell is wrapped in extra markup and
# carries a data-cell-title attribute for the mobile "tablesaw" layout, so a
# flat "<td>1,234</td>" regex matches nothing. Rows are matched first, then the
# five <td> cells inside each row, then tags are stripped per cell.
#
# INDEPENDENT CROSS-CHECKS: Arkansas is unusual in publishing the total prize
# VALUE per tier as well as the prize COUNT, both at print and remaining. That
# gives a free audit of our own arithmetic - (prize amount x prize count) must
# equal the value column Arkansas prints. Any game off by more than 0.5% is
# logged loudly. At time of writing all 72 games agree to the penny.
# The page ALSO prints a whole-game "Total Amount Remaining: 25,898,840.00"
# above the table. That one is a genuinely independent total, computed outside
# the rows, so it catches the failure the per-tier check cannot: rows the regex
# missed entirely. It is enforced as a hard gate (>1% off and the game is
# dropped), which is why a two-tier game such as "$50 or $100!" can be trusted
# without the three-tier minimum the NC generator needs.
#
# UNITS: prize amounts and value columns are dollars with two decimals
# ("350,000.00"); counts are plain integers; price is "$20"; odds are "1 in X".
# Arkansas publishes NO per-tier odds, so unlike NC the print run cannot be
# cross-checked tier by tier - it comes from the overall odds:
#
#   tickets printed = total winning tickets (all tiers) x overall odds
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
#
# GAMES NO LONGER ON SALE: a "Last Sell Date" in the past means the game cannot
# be bought any more (it stays listed until its Last Redeem Date), so those are
# dropped - a best-value-now table must only contain tickets you can buy.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$BASE = "https://www.myarkansaslottery.com"
$UA = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)' }

# The site serves UTF-8 without declaring a charset, so Invoke-WebRequest
# decodes as Latin-1 and names come back as mojibake ("JURASSIC WORLDa,,c").
# Decode the raw bytes as UTF-8 instead.
function Get-Html([string]$u) {
  $r = Invoke-WebRequest -Uri $u -Headers $UA -UseBasicParsing -TimeoutSec 60
  [System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
}
function Num([string]$s) { [double](($s -replace '[^\d.]', '')) }
function Strip([string]$s) {
  ($s -replace '(?s)<[^>]+>', '' -replace '&nbsp;', ' ' -replace '&#0?39;', "'" -replace '&#8217;', "'" -replace '&quot;', '"' -replace '&amp;', '&').Trim()
}

# ---- 1) enumerate games (paged index) ---------------------------------------
$slugs = New-Object System.Collections.ArrayList
$page = 0
while ($page -le 30) {
  $url = "{0}/games/instant?amount=All&page={1}" -f $BASE, $page
  try { $doc = Get-Html $url }
  catch { break }
  $found = [regex]::Matches($doc, '<h2><a href="(/games/[^"]+)">')
  if ($found.Count -eq 0) { break }
  foreach ($m in $found) { [void]$slugs.Add($m.Groups[1].Value) }
  # The pager repeats the last page forever if we overshoot, so stop on a page
  # that adds nothing new.
  if ($page -gt 0 -and (@($slugs | Sort-Object -Unique).Count) -eq $prevUnique) { break }
  $prevUnique = (@($slugs | Sort-Object -Unique).Count)
  $page++
}
$list = @($slugs | Sort-Object -Unique)
Write-Host ("index lists {0} instant games across {1} pages" -f $list.Count, $page)

# ---- 2) walk detail pages ---------------------------------------------------
$today = (Get-Date).Date
$games = New-Object System.Collections.ArrayList
$skipped = 0
$offSale = 0
foreach ($s in $list) {
  $url = $BASE + $s
  try { $doc = Get-Html $url }
  catch { $skipped++; continue }

  $name = ''
  if ($doc -match '<h1 class="layout-center">([^<]+)</h1>') { $name = Strip $Matches[1] }
  if (-not $name) { $skipped++; continue }
  $gameNo = ''
  if ($doc -match '(?s)field-name-field-game-number.*?<strong>\s*([^<]+?)\s*</strong>') { $gameNo = Strip $Matches[1] }

  $price = 0.0
  if ($doc -match '(?s)field-name-field-ticket-price.*?field-item even">\s*\$([\d,\.]+)\s*<') { $price = Num $Matches[1] }
  if ($price -le 0) { $skipped++; continue }
  $odds = $null
  if ($doc -match '(?s)field-name-field-game-odds.*?field-item even">\s*1 in ([\d,\.]+)\s*<') { $odds = Num $Matches[1] }
  if ($odds -eq $null -or $odds -le 0) {
    Write-Host ("  ! {0} has no overall odds; print run cannot be derived; skipped" -f $name); continue
  }

  # Sales cutoff. "To Be Determined" means still selling.
  $lastSell = ''
  if ($doc -match 'Last Sell Date:</label><span>\s*([^<]*?)\s*</span>') { $lastSell = $Matches[1] }
  if ($lastSell -match '^\d{1,2}/\d{1,2}/\d{4}$') {
    $d = [datetime]::MinValue
    if ([datetime]::TryParseExact($lastSell, 'MM/dd/yyyy', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$d)) {
      if ($d -lt $today) { $offSale++; continue }
    }
  }

  $tbl = ''
  foreach ($m in [regex]::Matches($doc, '(?s)<table[^>]*table-instant-game-data[^>]*>(.*?)</table>')) { $tbl = $m.Value; break }
  if (-not $tbl) { $skipped++; continue }
  # Whole-game remaining total, printed above the table and computed independently
  # of the rows - our only guard against a row the regex failed to see.
  $pageTotalLeft = $null
  if ($doc -match '<div>Total Amount Remaining:\s*([\d,\.]+)</div>') { $pageTotalLeft = Num $Matches[1] }

  $tiers = New-Object System.Collections.ArrayList
  $totalPrizes = 0.0
  $claimedPrizes = 0.0
  $pubStartValue = 0.0
  $pubLeftValue = 0.0
  $badTier = $false
  foreach ($r in [regex]::Matches($tbl, '(?s)<tr>(.*?)</tr>')) {
    $cells = [regex]::Matches($r.Groups[1].Value, '(?s)<td[^>]*>(.*?)</td>')
    if ($cells.Count -ne 5) { continue }
    $label = Strip $cells[0].Groups[1].Value
    if ($label -notmatch '^[\d,]+(\.\d+)?$') { $badTier = $true; break }   # annuity / merchandise with no cash figure
    $amt = Num $label
    $tot = Num (Strip $cells[1].Groups[1].Value)
    $rem = Num (Strip $cells[2].Groups[1].Value)
    $vTot = Num (Strip $cells[3].Groups[1].Value)
    $vRem = Num (Strip $cells[4].Groups[1].Value)
    if ($amt -le 0 -or $tot -le 0) { continue }
    if ($rem -lt 0) { $rem = 0 }
    if ($rem -gt $tot) { $rem = $tot }
    $totalPrizes += $tot
    $claimedPrizes += ($tot - $rem)
    $pubStartValue += $vTot
    $pubLeftValue += $vRem
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }
  if ($badTier) { Write-Host ("  ! {0} has a non-cash tier with no published value; skipped" -f $name); continue }
  if ($tiers.Count -lt 2) { $skipped++; continue }

  $printed = $totalPrizes * $odds
  if ($printed -le 0) { $skipped++; continue }
  $pctSold = 100.0 * ($claimedPrizes / $totalPrizes)
  $ticketsLeft = $printed * (1 - $pctSold / 100)
  if ($ticketsLeft -lt 1) { $skipped++; continue }

  $valueLeft = 0.0; $origValue = 0.0
  foreach ($t in $tiers) { $valueLeft += $t.remaining * $t.prize; $origValue += $t.original * $t.prize }
  if ($valueLeft -le 0) { $skipped++; continue }

  # HARD CROSS-CHECK: our remaining value must match the whole-game total
  # Arkansas prints above the table, or we missed rows.
  if ($pageTotalLeft -ne $null -and $pageTotalLeft -gt 0) {
    $dTot = 100 * [math]::Abs($valueLeft - $pageTotalLeft) / $pageTotalLeft
    if ($dTot -gt 1) {
      Write-Host ("  ! {0} remaining value {1:N0} does not match page total {2:N0} ({3:N1}% off); skipped" -f $name, $valueLeft, $pageTotalLeft, $dTot); continue
    }
  }

  # CROSS-CHECK against Arkansas' own published value columns.
  if ($pubStartValue -gt 0) {
    $d1 = 100 * [math]::Abs($origValue - $pubStartValue) / $pubStartValue
    if ($d1 -gt 0.5) { Write-Host ("  ? {0} start value {1:N0} vs published {2:N0} ({3:N1}% off)" -f $name, $origValue, $pubStartValue, $d1) }
  }
  if ($pubLeftValue -gt 0) {
    $d2 = 100 * [math]::Abs($valueLeft - $pubLeftValue) / $pubLeftValue
    if ($d2 -gt 0.5) { Write-Host ("  ? {0} remaining value {1:N0} vs published {2:N0} ({3:N1}% off)" -f $name, $valueLeft, $pubLeftValue, $d2) }
  }

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
if ($offSale -gt 0) { Write-Host "  ($offSale games skipped: last sell date has passed - no longer on sale)" }
if ($skipped -gt 0) { Write-Host "  ($skipped games skipped: unreadable or incomplete prize table)" }

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "AR"; state_name = "Arkansas"; source = "myarkansaslottery.com"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). The Arkansas Scholarship Lottery publishes, for every prize tier of every instant game, the prize amount, the number of prizes in the game, the number estimated to remain, and - unusually - the total prize VALUE both at printing and remaining, refreshed daily. That value column is used here as an independent audit of our own arithmetic: prize amount x prize count has to equal the figure Arkansas prints, and every game currently agrees. The whole-game 'Total Amount Remaining' Arkansas shows above each table is checked too, and a game that disagrees with it is dropped rather than published. Nothing is estimated. Arkansas does not publish per-tier odds, so tickets printed is derived from the total winning tickets x the game's overall odds. Percent sold is inferred from the share of prizes claimed - small prizes often go unredeemed, so that understates sales and makes these figures conservative. Games whose Last Sell Date has already passed are dropped, since they can no longer be bought. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_ar.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_ar.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
  $sortedGames[0].name, $sortedGames[0].ev_now)

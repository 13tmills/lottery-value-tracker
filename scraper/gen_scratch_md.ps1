# Maryland scratch-off REMAINING-VALUE analysis. Same output shape as the
# GA/NC/CA/TX/ID generators so the frontend is shared.
#
# SOURCE: mdlottery.com is WordPress, so the game list comes from the REST index --
#   GET https://www.mdlottery.com/wp-json/wp/v2/scratch-off?per_page=100
# (~94 games; gives id, slug and the canonical detail-page `link`).
#
# GOTCHA - acf IS EMPTY. The REST payload carries no prize data at all: the acf
# object comes back blank for every game. Price, odds and the whole prize table
# exist ONLY in the server-rendered detail page HTML, so every game costs one extra
# fetch. mdlottery.com 403s a random page or two per sweep, so each detail fetch
# gets one retry and is wrapped in its own try/catch: a page that still fails costs
# that one game, not the run.
#
# Detail page fields, all stable across games:
#   Price: <strong>$20</strong>
#   Probability of Winning: <strong>1 in <span>3.14</span></strong>
#   Game Number: <strong>811</strong>
#   <h3>Prizes</h3><table> ... <tr><td>$1,000,000</td><td>5</td><td>5</td></tr>
#   <p><strong>Records Last Updated:</strong> 08/13/2026</p>
#
# GOTCHA - the "1 in N" trap. A helper that strips every non-digit from
# "1 in 3.14" yields 13.14, because the 1 from "in"... no: it yields "13.14" from
# the leading 1 and the digits. Either way the number is wrong by an order of
# magnitude and the sanity gate would not always catch it. The denominator is
# captured with an explicit regex group instead, never by stripping characters.
#
# GOTCHA - nested cell markup. Prize cells are sometimes plain text and sometimes
# wrapped, so a flat <td>\$1,234</td> regex silently matches nothing. Rows are cut
# on <tr>, then cells on <td>, then tags are stripped per cell before testing.
#
# GOTCHA - non-cash prize rows. "The Big Spin" (791) has a prize row that reads
# BIG SPIN with no dollar figure - it is an entry into a televised wheel spin and
# Maryland publishes no cash value for it. That game is skipped whole rather than
# valued short. "Let's Make A Deal" (741) annotates real amounts as
# "10.00 (SPIN)"; the leading number is a genuine dollar figure and parses fine.
#
# ANNUITY: no currently listed Maryland game advertises an annuity top prize whose
# table figure is a sum of payments; every prize row is a literal cash amount. If
# one appears with no published cash value the row will fail the dollar-amount test
# and the whole game is skipped. Nothing is ever estimated.
#
# UNITS: everything on the page is already in dollars, no divisor anywhere.
# Verified against the state's own page for game 811 "Extreme Green": Price $20,
# Probability of Winning 1 in 3.14, top prize $1,000,000 with 5 at start.
#
#   tickets printed = total prizes at printing x the published overall odds
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$INDEX = "https://www.mdlottery.com/wp-json/wp/v2/scratch-off?per_page=100"
$UA = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)'
$H = @{ 'User-Agent' = $UA }

# Strip tags and entities from one table cell.
function CellText([string]$s) {
  $t = $s -replace '(?s)<[^>]*>', ' '
  $t = $t -replace '&nbsp;', ' ' -replace '&amp;', '&' -replace '&#8217;', "'" -replace '&#8220;|&#8221;', '"'
  return ($t -replace '\s+', ' ').Trim()
}
# First dollar figure in a cell, or $null when the cell names no cash amount.
function CellDollars([string]$s) {
  if ($s -match '\$?\s*([\d][\d,]*(?:\.\d+)?)') { return [double]($Matches[1] -replace ',', '') }
  return $null
}

$idx = Invoke-RestMethod -Uri $INDEX -Headers $H -TimeoutSec 90
$idx = @($idx)
Write-Host "index lists $($idx.Count) games"

$games = New-Object System.Collections.ArrayList
$skipped = 0
$fetchFail = 0
$noCashValue = 0
$stamps = @{}
foreach ($it in $idx) {
  $url = [string]$it.link
  if (-not $url) { $skipped++; continue }
  # One retry: the site 403s a random page or two per sweep.
  $html = $null
  for ($try = 1; $try -le 2 -and -not $html; $try++) {
    try { $html = (Invoke-WebRequest -Uri $url -Headers $H -UseBasicParsing -TimeoutSec 45).Content }
    catch { if ($try -lt 2) { Start-Sleep -Seconds 3 } }
  }
  if (-not $html) { Write-Host ("  ! {0} detail page unreadable; skipped" -f $it.slug); $fetchFail++; continue }

  $name = ''
  if ($html -match '(?s)<h1 class="entry-title">(.*?)</h1>') { $name = CellText $Matches[1] }
  if (-not $name) { $name = CellText ([string]$it.title.rendered) }
  if (-not $name) { $name = ($it.slug -replace '-\d+$', '' -replace '-', ' ') }

  if ($html -notmatch 'Price:\s*<strong>\s*\$?\s*([\d,]+(?:\.\d+)?)') { $skipped++; continue }
  $price = [double]($Matches[1] -replace ',', '')
  if ($price -le 0) { $skipped++; continue }

  # Capture ONLY the denominator of "1 in N". Never strip non-digits from the whole
  # string - "1 in 3.14" would come back as 13.14.
  $odds = $null
  if ($html -match 'Probability of Winning:\s*<strong>\s*1\s*in\s*(?:<span[^>]*>)?\s*([\d,]+(?:\.\d+)?)') {
    $odds = [double]($Matches[1] -replace ',', '')
  }
  if (-not $odds -or $odds -le 1) { Write-Host ("  ! {0} publishes no overall odds; skipped" -f $name); $skipped++; continue }

  $gameNum = ''
  if ($html -match 'Game Number:\s*<strong>\s*([\w-]+)\s*</strong>') { $gameNum = $Matches[1] }
  if (-not $gameNum -and $it.slug -match '-(\d+)$') { $gameNum = $Matches[1] }

  if ($html -match '<strong>\s*Records Last Updated:\s*</strong>\s*(\d{2}/\d{2}/\d{4})') {
    $stamps[$Matches[1]] = [int]$stamps[$Matches[1]] + 1
  }

  $table = [regex]::Match($html, '(?s)<h3>\s*Prizes\s*</h3>.*?</table>')
  if (-not $table.Success) { $skipped++; continue }

  $tiers = New-Object System.Collections.ArrayList
  $unvalued = $null
  foreach ($rw in [regex]::Matches($table.Value, '(?s)<tr[^>]*>(.*?)</tr>')) {
    $cells = [regex]::Matches($rw.Groups[1].Value, '(?s)<td[^>]*>(.*?)</td>')
    if ($cells.Count -lt 3) { continue }
    $pTxt = CellText $cells[0].Groups[1].Value
    $amt = CellDollars $pTxt
    if ($null -eq $amt) { $unvalued = $pTxt; break }
    $tot = CellDollars (CellText $cells[1].Groups[1].Value)
    $rem = CellDollars (CellText $cells[2].Groups[1].Value)
    if ($null -eq $tot -or $null -eq $rem) { continue }
    if ($amt -le 0 -or $tot -le 0) { continue }
    if ($rem -lt 0) { $rem = 0 }; if ($rem -gt $tot) { $rem = $tot }
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }
  # A prize row with no published cash value cannot be valued and we never invent
  # one, so the whole game goes rather than being understated.
  if ($unvalued) {
    Write-Host ("  ! {0} has a prize with no published cash value ('{1}'); whole game skipped" -f $name, $unvalued)
    $noCashValue++; continue
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
    game_number = [string]$gameNum
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
if ($fetchFail -gt 0) { Write-Host "  ($fetchFail games skipped: detail page unreadable)" }
if ($skipped -gt 0) { Write-Host "  ($skipped games skipped: no price, no odds, or incomplete prize table)" }
if ($noCashValue -gt 0) { Write-Host "  ($noCashValue games skipped: a prize with no published cash value)" }

# Maryland stamps each detail page with the date its prize counts were refreshed.
# They agree across games in practice; take the most common, newest on a tie.
$asOf = $null
if ($stamps.Count -gt 0) {
  $asOf = ($stamps.GetEnumerator() | Sort-Object @{e={$_.Value}}, @{e={[datetime]$_.Key}} -Descending | Select-Object -First 1).Key
}

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "MD"; state_name = "Maryland"; source = "mdlottery.com"
  data_as_of = $asOf
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). Maryland publishes, on each scratch-off's own page, the ticket price, the overall odds, and for every prize tier the number of prizes at printing and the number still unclaimed, along with the date those counts were last refreshed. Nothing is estimated. Tickets printed is derived from total prizes at printing x the published overall odds. Percent sold is inferred from the share of prizes claimed - Maryland notes directly that its remaining totals may include tickets already sold but not yet cashed, so that understates sales and makes these figures conservative. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_md.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_md.json: {0} games ({1} KB, data as of {2}). launch-payout {3:P0}-{4:P0}. Best now: {5} ({6:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), $asOf, `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
  $sortedGames[0].name, $sortedGames[0].ev_now)

# Virginia Scratchers REMAINING-VALUE analysis. Same output shape as the
# NC/SC/MO/GA/CA/TX/ID generators so the frontend is shared.
#
# SOURCE:
#   index  POST https://www.valottery.com/api/v1/scratchers
#          Content-Type: application/x-www-form-urlencoded, body page=0&pageSize=300
#          GOTCHA: GET 302s to a 404 - it must be POST, and the body must be
#          non-empty or the API returns zero rows.
#   detail https://www.valottery.com/scratchers/<GameID>  (server-rendered)
#          "Odds of Winning Overall: 1 in 3.39", "Ticket Price $50", and a table
#          Prize Amount | Winning Tickets At Start | Winning Tickets Unclaimed
#
# ANNUITY HANDLING (important): Virginia marks annuity prizes with an asterisk
# ("$7,000,000*") and states the real cash value in a footnote:
#   "All $7,000,000 prizes will be paid in annual installments for 30 years.
#    Cash value = $4,000,000."
# Counting the advertised face value would overstate that game's payout by $3m a
# prize, so we parse the footnote and substitute the published cash value. We do
# not estimate one - if a starred prize has no stated cash value, the game is
# skipped rather than counted wrongly.
#
#   tickets printed = total winning tickets x overall odds
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$BASE = "https://www.valottery.com"
$H = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)' }

$idxResp = Invoke-RestMethod -Uri "$BASE/api/v1/scratchers" -Method Post `
  -Headers ($H + @{ 'X-Requested-With' = 'XMLHttpRequest' }) `
  -ContentType 'application/x-www-form-urlencoded; charset=UTF-8' `
  -Body 'page=0&pageSize=300' -TimeoutSec 60
$list = @($idxResp.data)
Write-Host "index lists $($list.Count) games"

function Num([string]$s) { [double](($s -replace '[^\d.]', '')) }

$games = New-Object System.Collections.ArrayList
$skipped = 0; $annuityFixed = 0
foreach ($g in $list) {
  $id = [string]$g.GameID
  $price = Num ([string]$g.TicketPrice)
  if ($price -le 0) { $skipped++; continue }
  $url = "$BASE/scratchers/$id"
  try { $html = (Invoke-WebRequest -Uri $url -Headers $H -UseBasicParsing -TimeoutSec 45).Content }
  catch { $skipped++; continue }

  $flat = ($html -replace '<[^>]*>', ' ') -replace '\s+', ' '
  $odds = $null
  if ($flat -match 'Odds of Winning Overall:\s*1 in ([\d,.]+)') { $odds = Num $Matches[1] }
  if (-not $odds -or $odds -le 1) { $skipped++; continue }

  # "500X The Money Scratcher #2267 | Virginia Lottery" -> "500X The Money"
  $name = ''
  if ($html -match '<title>\s*(.*?)\s*</title>') { $name = $Matches[1] }
  $name = ($name -replace '\s*Scratcher\s*#\d+.*$', '' -replace '\s*\|\s*Virginia Lottery.*$', '' `
                 -replace '&amp;', '&').Trim()
  if (-not $name) { $name = (([string]$g.Title) -replace '\s+', ' ').Trim() }
  if (-not $name) { $skipped++; continue }

  # Annuity footnotes: face value -> published cash value.
  $cashOf = @{}
  foreach ($m in [regex]::Matches($flat, 'All \$([\d,]+) prizes will be paid in annual installments[^.]*\.\s*Cash value\s*=\s*\$([\d,]+)')) {
    $cashOf[[double](Num $m.Groups[1].Value)] = [double](Num $m.Groups[2].Value)
  }

  # Prize rows: amount (possibly starred) | at start | unclaimed.
  # NOTE: Virginia wraps text inside each <td> in further markup, so the cells
  # must be stripped individually - a flat "<td>$1,234</td>" regex matches nothing.
  $tiers = New-Object System.Collections.ArrayList
  $badAnnuity = $false
  $matched = 0
  foreach ($tr in [regex]::Matches($html, '(?s)<tr[^>]*>(.*?)</tr>')) {
    $cells = @([regex]::Matches($tr.Groups[1].Value, '(?s)<td[^>]*>(.*?)</td>') | ForEach-Object {
      ((($_.Groups[1].Value -replace '<[^>]*>', '') -replace '&nbsp;', ' ') -replace '\s+', ' ').Trim()
    })
    if ($cells.Count -lt 3) { continue }
    if ($cells[0] -notmatch '^\$([\d,]+)(\*?)$') { continue }
    $amt = Num $Matches[1]
    $starred = ($Matches[2] -eq '*')
    if ($cells[1] -notmatch '^[\d,]+$' -or $cells[2] -notmatch '^[\d,]+$') { continue }
    $tot = Num $cells[1]
    $rem = Num $cells[2]
    $matched++
    if ($amt -le 0 -or $tot -le 0) { continue }
    if ($starred) {
      if ($cashOf.ContainsKey($amt)) { $amt = $cashOf[$amt]; $annuityFixed++ }
      else { $badAnnuity = $true; break }   # never guess a cash value
    }
    if ($rem -lt 0) { $rem = 0 }; if ($rem -gt $tot) { $rem = $tot }
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }
  if ($badAnnuity) {
    Write-Host ("  ! {0} annuity prize with no published cash value; skipped" -f $name); continue
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
    game_number = $id
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
if ($annuityFixed -gt 0) { Write-Host "  ($annuityFixed annuity tiers valued at their published cash value)" }

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "VA"; state_name = "Virginia"; source = "valottery.com"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). Virginia publishes, for every prize tier of every Scratcher, the number of winning tickets at the start of the game and the number still unclaimed, along with the ticket price and the overall odds. Tickets printed is derived from total winning tickets x those odds. Where a top prize is paid as an annuity, Virginia states the cash value in a footnote and we use that figure rather than the advertised total, since the annuity headline overstates what a winner receives. Percent sold is inferred from the share of prizes claimed - small prizes often go unredeemed, so that understates sales and makes these figures conservative. IMPORTANT: 'unclaimed' is not the same as unsold - a big prize may already sit in a ticket someone has bought. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_va.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_va.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
  $sortedGames[0].name, $sortedGames[0].ev_now)

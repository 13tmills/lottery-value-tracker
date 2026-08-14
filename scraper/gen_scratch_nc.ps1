# North Carolina scratch-off REMAINING-VALUE analysis. Same output shape as the
# GA/CA/TX/ID generators so the frontend is shared.
#
# SOURCE: nclottery.com is fully server-rendered ASP.NET - no API needed, no
# headers required. Index /scratch-off lists games as /scratch-off/<id>/<slug>;
# each detail page carries, in stable CSS classes:
#   span.price value      -> ticket price          span.odds value  -> overall odds
#   span.PrizeValue       -> prize amount          span.OriginalOdds -> that tier's odds
#   span.PrizeCount       -> prizes at printing    span.PrizeCountRemaining -> unclaimed
#
# NC is the richest source we have: it publishes PER-TIER odds as well as the
# overall figure, so the print run can be derived from every tier independently
# and cross-checked (a mis-parse shows up as tiers disagreeing).
#
#   tickets printed = that tier's prize count x that tier's odds (median, cross-checked)
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$BASE = "https://nclottery.com"
$H = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)' }

$idx = (Invoke-WebRequest -Uri "$BASE/scratch-off" -Headers $H -UseBasicParsing -TimeoutSec 60).Content
$links = [regex]::Matches($idx, '/scratch-off/(\d+)/([a-z0-9\-]+)') |
  ForEach-Object { [pscustomobject]@{ id = $_.Groups[1].Value; slug = $_.Groups[2].Value } } |
  Sort-Object id -Unique
Write-Host "index lists $($links.Count) games"

function Num([string]$s) { [double](($s -replace '[^\d.]', '')) }

$games = New-Object System.Collections.ArrayList
$skipped = 0
foreach ($l in $links) {
  $url = "$BASE/scratch-off/$($l.id)/$($l.slug)"
  try { $html = (Invoke-WebRequest -Uri $url -Headers $H -UseBasicParsing -TimeoutSec 45).Content }
  catch { $skipped++; continue }

  if ($html -notmatch 'class="price value"[^>]*>\s*\$?([\d,.]+)') { $skipped++; continue }
  $price = Num $Matches[1]
  if ($price -le 0) { $skipped++; continue }
  $odds = $null
  if ($html -match 'class="odds value"[^>]*>\s*1 in ([\d,.]+)') { $odds = Num $Matches[1] }

  $name = ''
  if ($html -match '<title>\s*([^<|]+?)\s*(?:\||</title>)') { $name = $Matches[1].Trim() }
  # Titles read "Scratch-Off - <name> | NC Education Lottery"; keep only <name>.
  $name = ($name -replace '^\s*Scratch-Off\s*-\s*', '' -replace '\s*[-|]\s*NC (Education )?Lottery.*$', '' -replace '&amp;', '&').Trim()
  if (-not $name) { $name = ($l.slug -replace '-', ' ') }

  # Prize table: the four spans always appear in this order within a row.
  $rows = [regex]::Matches($html,
    '(?s)class="PrizeValue">\s*\$?([\d,.]+)\s*<.*?class="OriginalOdds">\s*([\d,.]+)\s*<.*?class="PrizeCount">\s*([\d,]+)\s*<.*?class="PrizeCountRemaining">\s*([\d,]+)\s*<')
  if ($rows.Count -lt 3) { $skipped++; continue }

  $tiers = New-Object System.Collections.ArrayList
  $printedEstimates = @()
  foreach ($m in $rows) {
    $amt = Num $m.Groups[1].Value
    $tOdds = Num $m.Groups[2].Value
    $tot = Num $m.Groups[3].Value
    $rem = Num $m.Groups[4].Value
    if ($amt -le 0 -or $tot -le 0 -or $tOdds -le 0) { continue }
    if ($rem -lt 0) { $rem = 0 }; if ($rem -gt $tot) { $rem = $tot }
    $printedEstimates += ($tot * $tOdds)
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }
  if ($tiers.Count -lt 3) { $skipped++; continue }

  # Every tier implies a print run; they must broadly agree or we've mis-parsed.
  $sortedEst = @($printedEstimates | Sort-Object)
  $printed = [double]$sortedEst[[int]([math]::Floor($sortedEst.Count / 2))]
  $spread = if ($printed -gt 0) { [math]::Round(100 * (($sortedEst[-1] - $sortedEst[0]) / $printed), 1) } else { 999 }
  if ($printed -le 0 -or $spread -gt 25) {
    Write-Host ("  ! {0} print-run tiers disagree ({1}%); skipped" -f $name, $spread); continue
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
    Write-Host ("  ! {0} implausible launch payout {1:P0}; skipped" -f $name, $evStart); continue
  }

  $topTier = $tiers | Sort-Object prize -Descending | Select-Object -First 1
  [void]$games.Add([pscustomobject]@{
    name = $name
    game_number = [string]$l.id
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
  state = "NC"; state_name = "North Carolina"; source = "nclottery.com"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). North Carolina publishes the fullest scratch data of any state we track: for every prize tier of every game it gives the prize amount, that tier's odds, the number of prizes at printing and the number not yet claimed, updated daily. Nothing is estimated. Tickets printed is derived from each tier's prize count x that tier's odds and cross-checked across all tiers. Percent sold is inferred from the share of prizes claimed - small prizes often go unredeemed, so that understates sales and makes these figures conservative. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_nc.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_nc.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
  $sortedGames[0].name, $sortedGames[0].ev_now)

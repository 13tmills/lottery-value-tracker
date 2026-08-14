# Georgia scratcher REMAINING-VALUE analysis. Same output shape as the CA/TX/ID
# generators so the frontend is shared.
#
# SOURCE: one JSON call returns EVERY game with its full prize table --
#   GET https://www.galottery.com/api/v1/instant-games/games?size=1000
# (no auth, no referer needed; found in the instant-tickets clientlib JS).
# Per game: gameId, gameName, validationStatus, ticketPrice, prizeTiers[] with
# prizeAmount / winningTickets (original) / paidTickets (claimed).
#   remaining = winningTickets - paidTickets
#
# UNITS -- verified, not assumed: ticketPrice is in CENTS (100 = $1) but
# prizeAmount is in TEN-THOUSANDTHS of a dollar (10000 = $1). Confirmed two ways:
# every game's lowest tier equals its ticket price (the standard break-even prize),
# and game 1715 "$2 MILLION DOLLAR MULTIPLIER" has top prizeAmount 20000000000
# = exactly $2,000,000. Do not "simplify" these divisors.
#
# Overall odds are NOT in the API, and the print run can't be derived without them,
# so each active game's detail page is fetched for "...are 1 in X."
#
#   tickets printed = total winning tickets x overall odds
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$API = "https://www.galottery.com/api/v1/instant-games/games?size=1000"
$UA = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)'
$H = @{ 'User-Agent' = $UA }

$resp = Invoke-RestMethod -Uri $API -Headers $H -TimeoutSec 90
$all = @($resp.games | Where-Object { $_.validationStatus -eq 'ACTIVE' })
Write-Host "API returned $(@($resp.games).Count) games, $($all.Count) active"

$games = New-Object System.Collections.ArrayList
$noOdds = 0
foreach ($g in $all) {
  $price = [double]$g.ticketPrice / 100.0          # cents -> dollars
  if ($price -le 0) { continue }

  # prizeAmount 0 = annuity / non-cash grand prize; excluded from the value math.
  $tiersRaw = @($g.prizeTiers | Where-Object { $_.prizeAmount -gt 0 -and $_.winningTickets -gt 0 })
  if ($tiersRaw.Count -lt 3) { continue }

  $tiers = New-Object System.Collections.ArrayList
  foreach ($t in $tiersRaw) {
    $amt = [double]$t.prizeAmount / 10000.0        # ten-thousandths -> dollars
    $tot = [double]$t.winningTickets
    $rem = $tot - [double]$t.paidTickets
    if ($rem -lt 0) { $rem = 0 }; if ($rem -gt $tot) { $rem = $tot }
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }

  $totalPrizes = ($tiers | Measure-Object -Property original -Sum).Sum
  $remPrizes = ($tiers | Measure-Object -Property remaining -Sum).Sum
  if ($totalPrizes -le 0 -or $remPrizes -le 0) { continue }

  # Overall odds live only on the detail page, and without them there is no print run.
  $odds = $null
  try {
    $html = (Invoke-WebRequest -Uri "https://www.galottery.com/en-us/games/scratchers/$($g.gameId).html" `
              -Headers $H -UseBasicParsing -TimeoutSec 45).Content
    $flat = ($html -replace '<[^>]*>', ' ') -replace '\s+', ' '
    if ($flat -match 'are\s+1\s+in\s+([\d.]+)') { $odds = [double]$Matches[1] }
  } catch { }
  if (-not $odds -or $odds -le 1) { $noOdds++; continue }

  $printed = $totalPrizes * $odds
  $pctSold = 100.0 * (($totalPrizes - $remPrizes) / $totalPrizes)
  $ticketsLeft = $printed * (1 - $pctSold / 100)
  if ($ticketsLeft -lt 1) { continue }

  $valueLeft = 0.0; $origValue = 0.0
  foreach ($t in $tiers) { $valueLeft += $t.remaining * $t.prize; $origValue += $t.original * $t.prize }
  $evNow = $valueLeft / ($ticketsLeft * $price)
  $evStart = $origValue / ($printed * $price)

  # SANITY GATE: real scratch games pay ~60-75% at launch; anything far outside that
  # is a mis-parse (bad units, bad odds), so drop it rather than publish a wrong figure.
  if ($evStart -lt 0.45 -or $evStart -gt 0.95) {
    Write-Host ("  ! {0} implausible launch payout {1:P0}; skipped" -f $g.gameName, $evStart); continue
  }

  $topTier = $tiers | Sort-Object prize -Descending | Select-Object -First 1
  [void]$games.Add([pscustomobject]@{
    name = ($g.gameName -replace '&amp;', '&' -replace '\s+', ' ').Trim()
    game_number = [string]$g.gameId
    url = "https://www.galottery.com/en-us/games/scratchers/$($g.gameId).html"
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
if ($noOdds -gt 0) { Write-Host "  ($noOdds games skipped: overall odds not published on detail page)" }

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "GA"; state_name = "Georgia"; source = "galottery.com"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). Georgia publishes, for every prize tier of every instant game, how many winning tickets were printed and how many have been paid out, so the unclaimed count is exact and nothing is estimated. Tickets printed is derived from total winning tickets x the game's published overall odds. Percent sold is inferred from the share of prizes claimed - small prizes often go unredeemed, so that understates sales and makes these figures conservative. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_ga.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_ga.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
  $sortedGames[0].name, $sortedGames[0].ev_now)

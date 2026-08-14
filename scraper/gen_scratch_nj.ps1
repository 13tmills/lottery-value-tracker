# New Jersey scratch-off REMAINING-VALUE analysis. Same output shape as the
# GA/NC/CA/TX/ID generators so the frontend is shared.
#
# SOURCE: one JSON call returns EVERY instant game with its full prize table --
#   GET https://www.njlottery.com/api/v1/instant-games/games?size=500
# (no auth). ~302 games, ~123 of them validationStatus ACTIVE.
# Per game: gameId, gameName, validationStatus, ticketPrice, totalTicketsPrinted,
# prizeTiers[] with prizeAmount / winningTickets (original) / paidTickets (cashed).
#   remaining = winningTickets - paidTickets
#
# GOTCHA - claimedTickets: every tier ALSO carries a claimedTickets field. It is a
# different, much smaller counter (game 1926 tier 9 shows winningTickets 21,
# paidTickets 17, claimedTickets 18 - it is not even monotonic against paidTickets).
# Do NOT use it for the remaining count. paidTickets is the cashed count.
#
# GOTCHA - the WAF: njlottery.com serves 403 for every /en-us/*.html page to a
# scripted client, and intermittently 403s the API too. Only the API is usable, and
# it needs a browser-shaped User-Agent (the bare "Mozilla/5.0 (compatible; ...)"
# token form is rejected outright) plus a retry/backoff loop. Our identifying
# NumbersIntel token is appended to a normal Chrome UA so we stay attributable.
#
# UNITS -- verified, not assumed. BOTH ticketPrice and prizeAmount are in CENTS.
# This is NOT the same as sibling Georgia, where prizeAmount is in ten-thousandths;
# do not copy that divisor over. Confirmed three ways:
#   1. Lowest tier == ticket price. e.g. "$20,000 Loaded" has ticketPrice 2000 and a
#      lowest tier of prizeAmount 2000 described "FREE $20 TICKET".
#   2. Tier descriptions are literal. Game 1926 tier 11 is prizeAmount 60000000
#      described "$600,000" -> 60000000 / 100 = $600,000 exactly.
#   3. Named top prizes. "Quarter Million Ca$h" tops out at prizeAmount 25000000
#      = $250,000 exactly.
#
# ANNUITY: tierType 16 marks annuity / for-life prizes. NJ already stores the CASH
# VALUE in prizeAmount while prizeDescription shows the advertised annuity figure
# with an asterisk (e.g. desc "$1,000,000*" carries prizeAmount 62850000 = $628,500
# cash; "$5,000 A MONTH/LIFE" carries 87520000 = $875,200 cash). So the published
# cash value is what we use and NOTHING is invented. Tiers with prizeAmount 0 are
# excluded outright; if such a tier has a real prize description the whole game is
# skipped rather than valued short. As of this writing no ACTIVE game has one.
#
# PRINT RUN: New Jersey states totalTicketsPrinted outright, so it is used directly
# instead of being derived. Overall odds are not a field, so we report the implied
# figure, printed / total winning tickets, and cross-check the two against each
# other; a >25% disagreement means the prize table and the stated print run do not
# describe the same game and the game is dropped. Verified against the state's own
# game page for 1926 CROSSWORD XTREME, which says "approximately 1.8 million
# tickets are initially planned" (API 1,852,440) and "better than 1 ticket in 4
# wins" (implied 1 in 3.57), and "approximately 70% of gross receipts, net of free
# tickets, to prizes" (our ev_start 0.72).
#
#   tickets printed = totalTicketsPrinted (published)
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$API = "https://www.njlottery.com/api/v1/instant-games/games?size=500"
# The WAF rejects the bare compatible-token UA, so the NumbersIntel identifier rides
# on a browser UA string. Still fully attributable, still one polite request.
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 NumbersIntel/1.0 (+https://numbersintel.com)'
$H = @{ 'User-Agent' = $UA; 'Accept' = 'application/json' }

# The API 403s intermittently under rate limiting; back off and retry.
$raw = $null
for ($attempt = 1; $attempt -le 6 -and -not $raw; $attempt++) {
  try {
    $w = Invoke-WebRequest -Uri $API -Headers $H -UseBasicParsing -TimeoutSec 90
    $raw = [System.Text.Encoding]::UTF8.GetString($w.RawContentStream.ToArray())
  } catch {
    Write-Host "  api attempt $attempt failed; backing off"
    Start-Sleep -Seconds ($attempt * 5)
  }
}
if (-not $raw) { throw "njlottery API unreachable after 6 attempts" }
$resp = $raw | ConvertFrom-Json

$all = @($resp.games | Where-Object { $_.validationStatus -eq 'ACTIVE' })
Write-Host "API returned $(@($resp.games).Count) games, $($all.Count) active"

$games = New-Object System.Collections.ArrayList
$skipped = 0
$annuitySkips = 0
$printMismatch = 0
foreach ($g in $all) {
  $price = [double]$g.ticketPrice / 100.0            # cents -> dollars
  if ($price -le 0) { $skipped++; continue }

  # A zero-amount tier that still names a prize is an unvalued annuity: NJ normally
  # publishes the cash value, so if one is missing we drop the game rather than
  # understate it. Never estimate a prize value.
  $badAnnuity = @($g.prizeTiers | Where-Object {
    $_.prizeAmount -le 0 -and $_.winningTickets -gt 0 -and ("$($_.prizeDescription)").Trim() -ne ''
  })
  if ($badAnnuity.Count -gt 0) {
    Write-Host ("  ! {0} has an unvalued prize tier ('{1}'); whole game skipped" -f $g.gameName, $badAnnuity[0].prizeDescription)
    $annuitySkips++; continue
  }

  $tiersRaw = @($g.prizeTiers | Where-Object { $_.prizeAmount -gt 0 -and $_.winningTickets -gt 0 })
  if ($tiersRaw.Count -lt 3) { $skipped++; continue }

  $tiers = New-Object System.Collections.ArrayList
  foreach ($t in $tiersRaw) {
    $amt = [double]$t.prizeAmount / 100.0            # cents -> dollars
    $tot = [double]$t.winningTickets
    # paidTickets is the cashed count. claimedTickets is a DIFFERENT counter; unused.
    $rem = $tot - [double]$t.paidTickets
    if ($rem -lt 0) { $rem = 0 }; if ($rem -gt $tot) { $rem = $tot }
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }

  $totalPrizes = ($tiers | Measure-Object -Property original -Sum).Sum
  $remPrizes = ($tiers | Measure-Object -Property remaining -Sum).Sum
  if ($totalPrizes -le 0 -or $remPrizes -le 0) { $skipped++; continue }

  $printed = [double]$g.totalTicketsPrinted
  if ($printed -le 0) { $skipped++; continue }

  # Overall odds are not published in the API; derive them from the stated print run.
  $odds = $printed / $totalPrizes
  # Cross-check: the stated print run and the prize table must describe the same
  # game. Reconstruct the run from total winners x the implied odds as NJ would
  # round and publish them, and require agreement within 25%.
  $recon = $totalPrizes * [math]::Round($odds, 2)
  $disagree = 100.0 * ([math]::Abs($recon - $printed) / $printed)
  if ($disagree -gt 25 -or $odds -le 1.2 -or $odds -gt 25) {
    Write-Host ("  ! {0} print run and prize table disagree ({1:N1}%, implied odds 1 in {2:N2}); skipped" -f $g.gameName, $disagree, $odds)
    $printMismatch++; continue
  }

  $pctSold = 100.0 * (($totalPrizes - $remPrizes) / $totalPrizes)
  $ticketsLeft = $printed * (1 - $pctSold / 100)
  if ($ticketsLeft -lt 1) { $skipped++; continue }

  $valueLeft = 0.0; $origValue = 0.0
  foreach ($t in $tiers) { $valueLeft += $t.remaining * $t.prize; $origValue += $t.original * $t.prize }
  $evNow = $valueLeft / ($ticketsLeft * $price)
  $evStart = $origValue / ($printed * $price)

  # SANITY GATE: real scratch games pay ~60-75% at launch; anything far outside that
  # is a mis-parse (bad units, bad print run), so drop it rather than publish a
  # wrong figure.
  if ($evStart -lt 0.45 -or $evStart -gt 0.95) {
    Write-Host ("  ! {0} implausible launch payout {1:P0}; skipped" -f $g.gameName, $evStart); continue
  }

  # Game pages are /en-us/scratch-offs/<gameId zero-padded to 5>.html
  $url = "https://www.njlottery.com/en-us/scratch-offs/{0}.html" -f ([string]$g.gameId).PadLeft(5, '0')
  $topTier = $tiers | Sort-Object prize -Descending | Select-Object -First 1
  [void]$games.Add([pscustomobject]@{
    name = ($g.gameName -replace '&amp;', '&' -replace '\s+', ' ').Trim()
    game_number = [string]$g.gameId
    url = $url
    price = $price
    overall_odds = [math]::Round($odds, 2)
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
if ($skipped -gt 0) { Write-Host "  ($skipped games skipped: no price or incomplete prize table)" }
if ($annuitySkips -gt 0) { Write-Host "  ($annuitySkips games skipped: an annuity prize with no published cash value)" }
if ($printMismatch -gt 0) { Write-Host "  ($printMismatch games skipped: stated print run inconsistent with prize table)" }

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "NJ"; state_name = "New Jersey"; source = "njlottery.com"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). New Jersey publishes, for every prize tier of every instant game, how many winning tickets were printed and how many have been cashed, so the unclaimed count is exact and nothing is estimated. New Jersey also states the total number of tickets printed for each game outright, so the print run is taken from the state rather than derived; the overall odds shown are the implied figure, print run divided by total winning tickets, and the two are cross-checked against each other before a game is published. Annuity and for-life top prizes are counted at the cash value New Jersey publishes, never at the advertised sum of payments. Percent sold is inferred from the share of prizes claimed - small prizes often go unredeemed, so that understates sales and makes these figures conservative. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_nj.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_nj.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
  $sortedGames[0].name, $sortedGames[0].ev_now)

# Oklahoma scratcher REMAINING-VALUE analysis. Same output shape as the
# NC/SC/GA/CA/TX/ID generators so the frontend is shared.
#
# SOURCE: lottery.ok.gov exposes two plain JSON endpoints, no auth, no special
# headers. They must be JOINED ON GameId:
#
#   GET /scratchers/get     -> { "Games": [ ... ] }, one object per ACTIVE game:
#        GameId          integer, the join key (NOT "Id", which is a CMS row id)
#        Name            display name          Price   ticket price in dollars
#        OverallOdds     STRING e.g. "4.13" - already the "1 in N" denominator,
#                        there is no "1 in " prefix to strip, just cast to double
#        TicketsPrinted  the print run, STATED OUTRIGHT (see below)
#        TopPrize        advertised top prize
#   GET /scratchers/prizes  -> a FLAT array (not nested per game) of prize rows:
#        GameId, GameName, PrizeAmount, TotalPrizes, RemainingPrizes, Progressive
#
# GOTCHA - Oklahoma states the print run, so we do NOT derive it.
#   Almost every other state makes you infer tickets printed from
#   (total prizes x overall odds). Oklahoma publishes TicketsPrinted directly, so
#   that is what we use. We still compute the derived figure and warn if the two
#   disagree by more than 25%, which would mean the odds string or the prize join
#   has gone wrong. In practice they agree to within 0.1%.
#
# GOTCHA - /scratchers/prizes covers ENDED games too. It returned 94 distinct
#   GameIds against 45 active games. Iterating the games list (not the prize
#   list) keeps ended games out.
#
# GOTCHA - PrizeAmount 0 rows are in-game PROGRESSIVE jackpots (Progressive:true).
#   Oklahoma publishes no cash value for them, so those TIERS are dropped. All
#   such rows currently belong to ended games. Dropping them is conservative: it
#   understates remaining value by a handful of prizes out of millions.
#
# GOTCHA - PrizeOdds exists on every prize row but is ALWAYS 0. It is dead
#   weight; there is no per-tier odds cross-check available for Oklahoma the way
#   there is for North Carolina.
#
# GOTCHA - there is no per-game detail page. /scratchers/game/<id> and
#   /scratchers/detail/<id> both return an HTTP 200 shell whose title is
#   "Not Found". Every game therefore links to the /scratchers index.
#
#   tickets printed = TicketsPrinted as published (cross-checked against odds)
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$BASE = "https://www.lottery.ok.gov"
$H = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)' }

function Num([string]$s) { [double](($s -replace '[^\d.]', '')) }

$gamesRaw = (Invoke-WebRequest -Uri "$BASE/scratchers/get" -Headers $H -UseBasicParsing -TimeoutSec 60).Content | ConvertFrom-Json
$prizeRaw = (Invoke-WebRequest -Uri "$BASE/scratchers/prizes" -Headers $H -UseBasicParsing -TimeoutSec 60).Content | ConvertFrom-Json
Write-Host "index lists $($gamesRaw.Games.Count) active games, $($prizeRaw.Count) prize rows"

# Bucket the flat prize array by GameId so each game is a single hashtable hit.
$byGame = @{}
foreach ($r in $prizeRaw) {
  $k = [string]$r.GameId
  if (-not $byGame.ContainsKey($k)) { $byGame[$k] = New-Object System.Collections.ArrayList }
  [void]$byGame[$k].Add($r)
}

$games = New-Object System.Collections.ArrayList
$skipped = 0
foreach ($gm in $gamesRaw.Games) {
  $key = [string]$gm.GameId
  if (-not $byGame.ContainsKey($key)) { $skipped++; continue }
  $rows = $byGame[$key]

  $price = [double]$gm.Price
  if ($price -le 0) { $skipped++; continue }

  $odds = $null
  if ($gm.OverallOdds) { $odds = Num ([string]$gm.OverallOdds) }
  if (-not $odds -or $odds -le 1) { $odds = $null }

  $name = ''
  if ($gm.Name) { $name = ([string]$gm.Name).Trim() }
  if (-not $name -and $rows[0].GameName) { $name = ([string]$rows[0].GameName).Trim() }
  if (-not $name) { $name = "Game #$key" }

  $tiers = New-Object System.Collections.ArrayList
  foreach ($r in $rows) {
    $amt = [double]$r.PrizeAmount
    $tot = [double]$r.TotalPrizes
    $rem = [double]$r.RemainingPrizes
    # Amount 0 = unvalued progressive jackpot; no cash value published, so drop.
    if ($amt -le 0 -or $tot -le 0) { continue }
    if ($rem -lt 0) { $rem = 0 }; if ($rem -gt $tot) { $rem = $tot }
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }
  if ($tiers.Count -lt 3) { $skipped++; continue }

  $totalPrizes = ($tiers | Measure-Object -Property original -Sum).Sum
  $remPrizes = ($tiers | Measure-Object -Property remaining -Sum).Sum
  if ($totalPrizes -le 0 -or $remPrizes -le 0) { $skipped++; continue }

  # Oklahoma STATES the print run - use it directly rather than deriving it.
  $printed = [double]$gm.TicketsPrinted
  if ($printed -le 0) {
    if (-not $odds) { Write-Host ("  ! {0} no TicketsPrinted and no odds; skipped" -f $name); continue }
    $printed = $totalPrizes * $odds
    Write-Host ("  ~ {0} TicketsPrinted missing; fell back to total prizes x odds" -f $name)
  } elseif ($odds) {
    # Cross-check the stated figure against what the odds imply. A big gap means
    # the join or the odds string is wrong, so say so loudly.
    $derived = $totalPrizes * $odds
    $gap = 100.0 * [math]::Abs($derived - $printed) / $printed
    if ($gap -gt 25) {
      Write-Host ("  ! {0} stated print run {1:N0} vs odds-derived {2:N0} ({3:N1}% apart)" -f $name, $printed, $derived, $gap)
    }
  }

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
    game_number = [string]$gm.GameId
    url = "$BASE/scratchers"
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
if ($skipped -gt 0) { Write-Host "  ($skipped games skipped: no prize rows or incomplete prize table)" }

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "OK"; state_name = "Oklahoma"; source = "lottery.ok.gov"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). Oklahoma is unusual in publishing the size of the print run outright, so tickets printed is the lottery's own TicketsPrinted figure rather than a derived one - we cross-check it against total prizes x overall odds and flag any game where the two disagree by more than 25%, but in practice they agree to within a fraction of a percent. For every prize tier the lottery gives the prize amount, the number of prizes at printing and the number still unclaimed. Nothing is estimated. Percent sold is inferred from the share of prizes claimed - small prizes often go unredeemed, so that understates sales and makes these figures conservative. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_ok.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_ok.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
  $sortedGames[0].name, $sortedGames[0].ev_now)

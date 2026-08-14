# Massachusetts instant-game REMAINING-VALUE analysis. Same output shape as the
# NC/SC/OK/GA/CA/TX/ID generators so the frontend is shared.
#
# SOURCE: masslottery.com has a clean public JSON API, no auth, no headers.
#
#   GET /api/v1/games                      -> flat array of EVERY game. Filter on
#        gameType == "Scratch" (the other values are Draw, Rapid and e-Instant,
#        none of which are scratch tickets). Useful fields:
#          id      the join key and the public game number
#          identifier   URL slug, e.g. "50-100-500-blowout-2026"
#          price   ticket price in dollars       topPrize  advertised top prize
#          odds    STRING "1 in 3.47" - must be parsed, not cast
#          topPrizeDescription  present only when the top prize is an annuity
#
#   GET /api/v1/instant-game-prizes?gameID=<id> -> that game's prize table:
#          ticketCost, odds, and prizeTiers[] with
#          prizeAmount, totalPrizes, paidPrizes, prizesRemaining,
#          prizeDescription, odds (PER-TIER, string "1 in 1,200"), type
#
# GOTCHA - ANNUITY TOP PRIZES, and this one is load-bearing. More than half of
#   the Massachusetts catalogue has an annuity grand prize, and prizeAmount holds
#   the ANNUITY FACE VALUE (the sum of all payments), not the cash value. Game
#   542 lists prizeAmount 15000000 with prizeDescription
#   "$15,000,000 ($750K/YR/20YRS)" - that is $750K a year for 20 years, whose
#   cash value is far lower. Massachusetts publishes NO cash value anywhere in
#   this API. Counting the face value would overstate remaining value badly (on
#   game 542 the top tier alone is ~30% of the entire ticket take), and we never
#   invent or estimate a figure, so any game with an annuity tier is SKIPPED
#   ENTIRELY. Annuity tiers are detected from the state's own prizeDescription
#   text: a "/YR", "/MO", "/WK", "/LF" fragment or the words "for life".
#   If Massachusetts ever starts publishing a cash value, use it and drop the
#   skip - do not substitute an estimate.
#
# GOTCHA - prizeTiers arrive in NO useful order. Game 555 opens with tierNumber
#   13 then 14 then 12 then 1. Never assume the first or last tier is the top
#   prize; always sort by prizeAmount.
#
# GOTCHA - ODDS PARSING. Every odds value here is the string "1 in N", with
#   thousands separators ("1 in 1,870.13"). Do NOT parse it by stripping all
#   non-digits, which is what the other generators' Num() helper does: that
#   leaves the leading "1" of "1 in" attached and silently turns 12.5 into 112.5.
#   The first version of this script did exactly that and every single game got
#   thrown out by the tier cross-check. Use OddsNum(), which regex-captures only
#   the denominator.
#
# UNITS: every money figure in this API is already in whole dollars. No cents
#   conversion is needed (unlike Michigan's GraphQL feed).
#
#   tickets printed = total prizes x overall odds,
#                     cross-checked against each tier's own prize count x odds
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$BASE = "https://www.masslottery.com"
$H = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)' }

function Num([string]$s) { [double](($s -replace '[^\d.]', '')) }
# Odds arrive as "1 in 3.47" / "1 in 1,870.13". Strip-all-non-digits is WRONG
# here: it leaves the leading "1" of "1 in" glued on and turns 12.5 into 112.5.
# Capture only the denominator.
function OddsNum([string]$s) {
  if (-not $s) { return $null }
  if ($s -match '(?i)1\s*in\s*([\d,.]+)') { return [double](($Matches[1] -replace '[^\d.]', '')) }
  return $null
}
# The state's own annuity marking: "($50K/YR/20YRS)", "$2,500/WK/LF",
# "A Year For Life /Min 20 Yrs".
function IsAnnuity([string]$s) {
  if (-not $s) { return $false }
  if ($s -match '(?i)/\s*\d*\s*(YR|YRS|MO|MOS|WK|WKS|WEEK|MONTH|YEAR|DAY|LF)\b') { return $true }
  if ($s -match '(?i)for\s+life') { return $true }
  return $false
}

$all = (Invoke-WebRequest -Uri "$BASE/api/v1/games" -Headers $H -UseBasicParsing -TimeoutSec 60).Content | ConvertFrom-Json
$scratch = @($all | Where-Object { $_.gameType -eq 'Scratch' })
Write-Host "index lists $($scratch.Count) scratch games (of $($all.Count) total)"

$games = New-Object System.Collections.ArrayList
$skipped = 0
$annuitySkipped = 0
foreach ($gm in $scratch) {
  $id = [string]$gm.id
  $url = "$BASE/games/scratch-tickets/$($gm.identifier)"
  try {
    $d = (Invoke-WebRequest -Uri "$BASE/api/v1/instant-game-prizes?gameID=$id" -Headers $H -UseBasicParsing -TimeoutSec 45).Content | ConvertFrom-Json
  } catch { $skipped++; continue }
  if (-not $d -or -not $d.prizeTiers) { $skipped++; continue }

  $name = ''
  if ($gm.name) { $name = ([string]$gm.name).Trim() }
  if (-not $name -and $d.gameName) { $name = ([string]$d.gameName).Trim() }
  if (-not $name) { $name = "Game #$id" }

  $price = [double]$gm.price
  if ($price -le 0 -and $d.ticketCost) { $price = [double]$d.ticketCost }
  if ($price -le 0) { $skipped++; continue }

  $odds = $null
  if ($gm.odds) { $odds = OddsNum ([string]$gm.odds) }
  if ((-not $odds -or $odds -le 1) -and $d.odds) { $odds = OddsNum ([string]$d.odds) }
  if (-not $odds -or $odds -le 1) { $skipped++; continue }

  # Annuity check FIRST - if any tier is an annuity we cannot value the game at
  # all, because Massachusetts publishes no cash value to substitute.
  $isAnnuity = $false
  if (IsAnnuity ([string]$gm.topPrizeDescription)) { $isAnnuity = $true }
  foreach ($t in $d.prizeTiers) {
    if (IsAnnuity ([string]$t.prizeDescription)) { $isAnnuity = $true }
  }
  if ($isAnnuity) {
    Write-Host ("  ~ {0} annuity top prize with no published cash value; skipped" -f $name)
    $annuitySkipped++; continue
  }

  $tiers = New-Object System.Collections.ArrayList
  $printedEstimates = @()
  foreach ($t in $d.prizeTiers) {
    $amt = [double]$t.prizeAmount
    $tot = [double]$t.totalPrizes
    $rem = [double]$t.prizesRemaining
    if ($amt -le 0 -or $tot -le 0) { continue }
    if ($rem -lt 0) { $rem = 0 }; if ($rem -gt $tot) { $rem = $tot }
    if ($t.odds) {
      $tOdds = OddsNum ([string]$t.odds)
      if ($tOdds -and $tOdds -gt 1) { $printedEstimates += ($tot * $tOdds) }
    }
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }
  if ($tiers.Count -lt 3) { $skipped++; continue }

  $totalPrizes = ($tiers | Measure-Object -Property original -Sum).Sum
  $remPrizes = ($tiers | Measure-Object -Property remaining -Sum).Sum
  if ($totalPrizes -le 0 -or $remPrizes -le 0) { $skipped++; continue }

  # Print run comes from the overall odds; the per-tier odds are an independent
  # check on the same number, and a mis-parse shows up as tiers disagreeing.
  $printed = $totalPrizes * $odds
  if ($printed -le 0) { $skipped++; continue }
  if ($printedEstimates.Count -ge 3) {
    $sortedEst = @($printedEstimates | Sort-Object)
    $median = [double]$sortedEst[[int]([math]::Floor($sortedEst.Count / 2))]
    $spread = $(if ($median -gt 0) { [math]::Round(100 * (($sortedEst[-1] - $sortedEst[0]) / $median), 1) } else { 999 })
    if ($median -le 0 -or $spread -gt 25) {
      Write-Host ("  ! {0} print-run tiers disagree ({1}%); skipped" -f $name, $spread); continue
    }
    $gap = 100.0 * [math]::Abs($median - $printed) / $printed
    if ($gap -gt 25) {
      Write-Host ("  ! {0} overall-odds print run {1:N0} vs per-tier median {2:N0} ({3:N1}% apart); skipped" -f $name, $printed, $median, $gap)
      continue
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
    game_number = [string]$id
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
if ($annuitySkipped -gt 0) { Write-Host "  ($annuitySkipped games skipped: annuity grand prize, no cash value published)" }
if ($skipped -gt 0) { Write-Host "  ($skipped games skipped: unreadable or incomplete prize table)" }

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "MA"; state_name = "Massachusetts"; source = "masslottery.com"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). Massachusetts publishes, for every prize tier of every instant game, the prize amount, that tier's odds, the number of prizes at printing and the number already paid out. Nothing is estimated. Tickets printed is derived from total prizes x the game's overall odds and then cross-checked against each tier's own prize count x tier odds; a game whose tiers disagree is dropped rather than published. Percent sold is inferred from the share of prizes claimed - small prizes often go unredeemed, so that understates sales and makes these figures conservative. Games whose grand prize is an annuity are excluded entirely: Massachusetts lists those at the full face value of all payments and publishes no cash value, so any payout figure for them would be an invention. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_ma.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_ma.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
  $sortedGames[0].name, $sortedGames[0].ev_now)

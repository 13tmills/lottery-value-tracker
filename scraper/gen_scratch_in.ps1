# Indiana scratch-off REMAINING-VALUE analysis. Same output shape as the
# NC/GA/CA/TX/ID generators so the frontend is shared.
#
# SOURCE: hoosierlottery.com is fully server-rendered ASP.NET. No API, no
# special headers, no cookies.
#   index  https://hoosierlottery.com/games/scratch-off
#          ~82 scratch-off cards, each an <a href="/games/scratch-off/<slug>">
#          carrying data-id (Indiana's game number), data-name, data-price and
#          data-prize, plus the card text "Est. Overall Odds: 1 in 3.58".
#   detail https://hoosierlottery.com/games/scratch-off/<slug>
#          one <table class="... prize-table"> under the "Prizes and Odds" tab.
#
# COLUMN ORDER GOTCHA - Indiana's table is
#       Prize Amount | Unclaimed | Total Winning Tickets
# i.e. UNCLAIMED COMES BEFORE TOTAL, the reverse of most states. Reading them
# the usual way silently inverts every game, so we assert total >= unclaimed on
# every tier and drop the game if that ever fails.
#
#   tickets printed = sum(total winning tickets) x overall odds
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
#
# TRUNCATED-TABLE GOTCHA (the big one). Indiana's own footnote says "The above
# table may not be inclusive of all prizes in the game." In practice it never
# publishes a tier below $30: across all 82 games today the smallest prize
# printed anywhere on the site is $30, and a $1 game like "$50 FRENZY" lists a
# single $50 tier at 1 in 4.68 overall odds, which would be a 1068% payout if
# the table were complete. Those missing low tiers are winners too, so
# sum(published winners) x overall odds UNDERSTATES the print run and inflates
# value-per-$1 by 15-30% on cheap tickets.
# There is no published complete prize structure (the full ladder is only in
# the per-game Admin Rules PDF, which is a scan), and inventing the missing
# tiers is not allowed, so we self-calibrate: take the smallest tier published
# anywhere in this run as the site's publication floor and keep only games
# whose ticket price is at or above it. At a $30 or $50 price point every prize
# in the ladder is at or above the floor, so the table is complete and the math
# is exact; below the floor it is not, and those games are dropped. If Indiana
# ever starts publishing the low tiers the floor drops on its own and the
# filter stops firing.
#
# ANNUITY GOTCHA - amounts flagged with an asterisk are annuities whose printed
# figure is the SUM of the installments ("$5,000 a month for 10 years
# ($600,000) ... paid in annual installments"). Indiana publishes no cash
# value, so the whole game is dropped rather than valued at the annuity sum.
#
# "1 in N" GOTCHA - do NOT strip non-digits from "1 in 12.5"; the 1 from "in"
# sticks and you get 112.5. Capture the denominator with a regex instead.
#
# HTML GOTCHA - every cell is wrapped (<td><span class="font-weight-bold">...),
# so a flat <td>$1,234</td> match finds nothing. Walk <tr>, then <td>, strip
# tags per cell, then test.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$BASE = "https://hoosierlottery.com"
$H = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)' }

function Num([string]$s) { [double](($s -replace '[^\d.]', '')) }
function OneIn([string]$s) {
  # "1 in 3.58" / "Est. Overall Odds: 1 in 12.5" -> 3.58 / 12.5. Never Num().
  if ($s -match '1\s*in\s*([\d,]+(?:\.\d+)?)') { return [double](($Matches[1] -replace ',', '')) }
  return 0
}
function Clean([string]$s) {
  $t = $s -replace '(?s)<[^>]+>', ''
  $t = $t -replace '&nbsp;', ' ' -replace '&amp;', '&' -replace '&quot;', '"'
  # Card names carry numeric entities (&#x27; apostrophes, &#x2122; trademarks).
  $t = [regex]::Replace($t, '&#x([0-9A-Fa-f]+);', { param($m) [char][int]("0x" + $m.Groups[1].Value) })
  $t = [regex]::Replace($t, '&#(\d+);', { param($m) [char][int]$m.Groups[1].Value })
  return ($t -replace '\s+', ' ').Trim()
}

$idx = (Invoke-WebRequest -Uri "$BASE/games/scratch-off" -Headers $H -UseBasicParsing -TimeoutSec 60).Content

# Cards live in three blocks: the Current tab, the Closing tab and a "we think
# you'll enjoy these games" carousel that also holds /games/fast-play/ tiles.
# Filtering on the scratch-off href and de-duplicating on data-id covers all of
# them without depending on where the blocks sit in the page.
$cards = New-Object System.Collections.ArrayList
$seen = @{}
$blocks = [regex]::Split($idx, '<a href="(?=/games/scratch-off/)')
foreach ($b in $blocks) {
  if ($b -notmatch '^(/games/scratch-off/[^"]+)"') { continue }
  $href = $Matches[1]
  if ($href -match '/scratch-off-stats') { continue }
  # Only look inside this one card, so a card missing its odds cannot borrow
  # the next card's figures.
  $card = $b
  $endA = $card.IndexOf('</a>')
  if ($endA -gt 0) { $card = $card.Substring(0, $endA) }
  if ($card -notmatch 'data-id="(\d+)"') { continue }
  $id = $Matches[1]
  if ($seen.ContainsKey($id)) { continue }
  if ($card -notmatch 'data-price="([\d.]+)"') { continue }
  $price = Num $Matches[1]
  if ($card -notmatch 'data-name="([^"]*)"') { continue }
  $dname = Clean $Matches[1]
  if ($card -notmatch 'Est\.\s*Overall\s*Odds:\s*</span>\s*(?:&nbsp;|\s)*1\s*in\s*([\d,.]+)') { continue }
  $odds = OneIn ("1 in " + $Matches[1])
  if ($price -le 0 -or $odds -le 0) { continue }
  $seen[$id] = $true
  [void]$cards.Add([pscustomobject]@{ id = $id; href = $href; name = $dname; price = $price; odds = $odds })
}
Write-Host "index lists $($cards.Count) scratch-off games"

# ---- pass 1: read every prize table -----------------------------------------
$parsed = New-Object System.Collections.ArrayList
$skipped = 0
$annuitySkips = 0
$columnSkips = 0
foreach ($c in $cards) {
  $url = "$BASE$($c.href)"
  try { $html = (Invoke-WebRequest -Uri $url -Headers $H -UseBasicParsing -TimeoutSec 45).Content }
  catch { $skipped++; Write-Host ("  ! {0} detail page unreadable; skipped" -f $c.name); continue }

  $name = $c.name
  $h1 = [regex]::Match($html, '(?s)<h1[^>]*>(.*?)</h1>')
  if ($h1.Success) { $t = Clean $h1.Groups[1].Value; if ($t) { $name = $t } }

  $tbl = [regex]::Match($html, '(?s)<table[^>]*class="[^"]*prize-table[^"]*"[^>]*>(.*?)</table>')
  if (-not $tbl.Success) { $skipped++; Write-Host ("  ! {0} has no prize table; skipped" -f $name); continue }

  $tiers = New-Object System.Collections.ArrayList
  $bad = $false
  $annuity = $false
  foreach ($tr in [regex]::Matches($tbl.Groups[1].Value, '(?s)<tr[^>]*>(.*?)</tr>')) {
    $tds = [regex]::Matches($tr.Groups[1].Value, '(?s)<td[^>]*>(.*?)</td>')
    if ($tds.Count -lt 3) { continue }
    $amtTxt = Clean $tds[0].Groups[1].Value
    if ($amtTxt -match '\*') { $annuity = $true; break }
    $amt = Num $amtTxt
    $rem = Num (Clean $tds[1].Groups[1].Value)   # column 2 = UNCLAIMED
    $tot = Num (Clean $tds[2].Groups[1].Value)   # column 3 = TOTAL
    if ($amt -le 0) { continue }                 # annuity rule: never value a 0 prize
    if ($tot -le 0) { continue }
    if ($rem -gt $tot) { $bad = $true; break }   # columns transposed / mis-parsed
    if ($rem -lt 0) { $rem = 0 }
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }
  if ($annuity) {
    $annuitySkips++
    Write-Host ("  ! {0} annuity top prize is the sum of installments and Indiana publishes no cash value; game skipped" -f $name)
    continue
  }
  if ($bad) {
    $columnSkips++
    Write-Host ("  ! {0} has unclaimed > total on some tier (column order changed?); skipped" -f $name)
    continue
  }
  if ($tiers.Count -lt 1) { $skipped++; Write-Host ("  ! {0} prize table empty; skipped" -f $name); continue }

  [void]$parsed.Add([pscustomobject]@{
      id = $c.id; url = $url; name = $name; price = $c.price; odds = $c.odds
      tiers = $tiers
      lowest = ($tiers | Measure-Object -Property prize -Minimum).Minimum
    })
}

if ($parsed.Count -lt 1) { throw "no Indiana prize tables parsed" }

# ---- publication floor -------------------------------------------------------
# Smallest prize Indiana publishes anywhere in this run. Games cheaper than the
# floor must have unpublished tiers, so their winner counts (and therefore the
# odds-derived print run) are incomplete.
$floor = ($parsed | Measure-Object -Property lowest -Minimum).Minimum
Write-Host ("smallest prize published anywhere: `${0:N0} - games priced below that have unpublished tiers" -f $floor)

# ---- pass 2: value the games whose tables are complete -----------------------
$games = New-Object System.Collections.ArrayList
$floorSkips = 0
$gateSkips = 0
foreach ($p in $parsed) {
  if ($p.price -lt $floor) { $floorSkips++; continue }

  $totalPrizes = ($p.tiers | Measure-Object -Property original -Sum).Sum
  $remPrizes = ($p.tiers | Measure-Object -Property remaining -Sum).Sum
  if ($totalPrizes -le 0 -or $remPrizes -le 0) { $skipped++; continue }

  $printed = [double]$totalPrizes * $p.odds
  if ($printed -le 0) { $skipped++; continue }
  $pctSold = 100.0 * (($totalPrizes - $remPrizes) / $totalPrizes)
  $ticketsLeft = $printed * (1 - $pctSold / 100)
  if ($ticketsLeft -lt 1) { $skipped++; continue }

  $valueLeft = 0.0; $origValue = 0.0
  foreach ($t in $p.tiers) { $valueLeft += $t.remaining * $t.prize; $origValue += $t.original * $t.prize }
  $evNow = $valueLeft / ($ticketsLeft * $p.price)
  $evStart = $origValue / ($printed * $p.price)

  # SANITY GATE: real scratch games pay ~60-75% at launch; far outside that is a
  # mis-parse, so drop it rather than publish a wrong figure.
  if ($evStart -lt 0.45 -or $evStart -gt 0.95) {
    $gateSkips++
    Write-Host ("  ! {0} implausible launch payout {1:P0}; skipped" -f $p.name, $evStart); continue
  }

  $topTier = $p.tiers | Sort-Object prize -Descending | Select-Object -First 1
  [void]$games.Add([pscustomobject]@{
      name = $p.name
      game_number = [string]$p.id
      url = $p.url
      price = $p.price
      overall_odds = $p.odds
      pct_sold = [math]::Round($pctSold, 1)
      tickets_printed = [long]$printed; tickets_left = [long]$ticketsLeft
      prize_value_left = [long]$valueLeft
      ev_now = [math]::Round($evNow, 4); ev_start = [math]::Round($evStart, 4)
      top_prize = [long]$topTier.prize; top_left = [long]$topTier.remaining; top_original = [long]$topTier.original
      est_tiers = 0
      top_share = $(if ($valueLeft -gt 0) { [math]::Round(($topTier.remaining * $topTier.prize) / $valueLeft, 3) } else { 0 })
      low_confidence = ($pctSold -gt 90)
      tiers = @($p.tiers | Sort-Object prize -Descending)
    })
}
Write-Host ("  ({0} skipped: prize table truncated below the `${1:N0} publication floor)" -f $floorSkips, $floor)
if ($annuitySkips -gt 0) { Write-Host "  ($annuitySkips skipped: annuity prize with no published cash value)" }
if ($columnSkips -gt 0) { Write-Host "  ($columnSkips skipped: unclaimed/total column check failed)" }
if ($gateSkips -gt 0) { Write-Host "  ($gateSkips skipped: launch payout outside 45-95%)" }
if ($skipped -gt 0) { Write-Host "  ($skipped skipped: unreadable or incomplete prize table)" }
if ($games.Count -lt 1) { throw "no Indiana games survived the checks" }

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "IN"; state_name = "Indiana"; source = "hoosierlottery.com"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). The Hoosier Lottery publishes, for every game, the ticket price, the estimated overall odds and a prize table listing each prize amount with the number of winning tickets printed and the number still unclaimed, updated daily. Nothing is estimated: tickets printed is that game's total winning tickets x its overall odds, and percent sold is inferred from the share of prizes claimed - small prizes often go unredeemed, so that understates sales and makes these figures conservative. IMPORTANT: Indiana's prize table is not complete for every game. It never publishes a tier below `$30, so on a `$1 to `$20 ticket the low prizes are missing, the winner count is short and the derived print run would be too small - we drop those games entirely rather than publish an inflated number, which is why only the higher price points appear here. Games whose top prize is an annuity quoted as the sum of its installments are also dropped, because Indiana publishes no cash value for them. IMPORTANT: 'unclaimed' means NOT YET CLAIMED, not unsold - a big prize may already sit in a ticket someone has bought. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_in.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_in.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
    $sortedGames.Count, [math]::Round((Get-Item $path).Length / 1kb, 1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
    $sortedGames[0].name, $sortedGames[0].ev_now)

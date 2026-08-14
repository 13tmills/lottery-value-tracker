# Illinois scratch-off REMAINING-VALUE analysis. Same output shape as the
# NC/GA/CA/TX/ID generators so the frontend is shared.
#
# SOURCE: illinoislottery.com, two server-rendered pages.
#   1) https://www.illinoislottery.com/about-the-games/unpaid-instant-games-prizes
#      ONE page holds EVERY game and EVERY tier. Each <tr data-price="N"> has
#      six cells:
#        0 game name incl. price suffix, e.g. "EMERALDS ($1)"
#        1 price point
#        2 game number <br/> (weeks in market)
#        3 prize values   <br/>-joined
#        4 Total count    <br/>-joined
#        5 Unclaimed count<br/>-joined
#      Cells 3/4/5 are three POSITIONALLY ALIGNED lists - split each on <br/>
#      and zip by index. If the three lengths ever differ the row has been
#      mis-parsed, so that game is dropped.
#   2) https://www.illinoislottery.com/games-hub/instant-tickets/<slug>
#      the only place overall odds are published. Walked via the paginated hub
#      https://www.illinoislottery.com/games-hub/instant-tickets?page=N
#
# CLOUDFLARE GOTCHA - a plain User-Agent gets a 403 with "Cf-Mitigated:
# challenge". The header block below is what the site expects. Invoke-WebRequest
# can still be challenged on some networks even with those headers (its TLS/HTTP
# fingerprint is not a browser's), so every fetch falls back to curl.exe, which
# ships with Windows 10/11 and with the GitHub Actions windows runners and gets
# a clean 200. Do not drop the fallback.
#
# ODDS FORMAT GOTCHA - the detail table prints EITHER "1 in 3.59" OR "3.16 to 1"
# depending on the game's vintage. Both mean the same thing; parse both.
# And never strip non-digits from "1 in 12.5" - the 1 from "in" sticks and you
# get 112.5. Capture the denominator with a regex.
#
# SLUG GOTCHA - slugs are not derivable from the name ("$3 MILLION VAULT" is
# /3-million-vault, "LOTERIA" is /loteria-2026) and Illinois REUSES names across
# editions: /triple-777 is game 7401 while the live TRIPLE 777 is 7602, and
# /100x-the-cash is 7364 while the live one is 7595. One page is also mislabelled
# outright: /galaxy-blast reports game number 7663, which actually belongs to
# $100,000 CROSSWORD. So a detail page is only ever accepted when BOTH its game
# number AND its normalised title match the row we are looking for; anything
# ambiguous or unmatched is skipped rather than guessed at.
#
#   tickets printed = sum(total winning tickets) x overall odds
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$BASE = "https://www.illinoislottery.com"

$H = @{
  'User-Agent'                = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  'sec-ch-ua'                 = '"Chromium";v="120", "Not:A-Brand";v="8"'
  'sec-ch-ua-mobile'          = '?0'
  'sec-ch-ua-platform'        = '"Windows"'
  'Sec-Fetch-Dest'            = 'document'
  'Sec-Fetch-Mode'            = 'navigate'
  'Sec-Fetch-Site'            = 'none'
  'Upgrade-Insecure-Requests' = '1'
  'Accept-Language'           = 'en-US,en;q=0.9'
}
$CURL_ARGS = @()
foreach ($k in $H.Keys) { $CURL_ARGS += @('-H', ("{0}: {1}" -f $k, $H[$k])) }

function Get-Html([string]$url) {
  try {
    return (Invoke-WebRequest -Uri $url -Headers $H -UseBasicParsing -TimeoutSec 60).Content
  }
  catch {
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
      $code = (& curl.exe -s -L --compressed -o $tmp -w "%{http_code}" @CURL_ARGS $url)
      if ("$code" -ne "200") { throw "HTTP $code" }
      return [System.IO.File]::ReadAllText($tmp)
    }
    finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
  }
}

function Num([string]$s) { [double](($s -replace '[^\d.]', '')) }
function OddsOf([string]$s) {
  # "1 in 3.59" or "3.16 to 1" -> 3.59 / 3.16. Never Num(): "1 in 12.5" -> 112.5.
  if ($s -match '1\s*in\s*([\d,]+(?:\.\d+)?)') { return [double](($Matches[1] -replace ',', '')) }
  if ($s -match '([\d,]+(?:\.\d+)?)\s*to\s*1') { return [double](($Matches[1] -replace ',', '')) }
  return 0
}
function Clean([string]$s) {
  $t = $s -replace '(?s)<[^>]+>', ''
  $t = $t -replace '&nbsp;', ' ' -replace '&amp;', '&' -replace '&quot;', '"'
  $t = [regex]::Replace($t, '&#x([0-9A-Fa-f]+);', { param($m) [char][int]("0x" + $m.Groups[1].Value) })
  $t = [regex]::Replace($t, '&#(\d+);', { param($m) [char][int]$m.Groups[1].Value })
  return ($t -replace '\s+', ' ').Trim()
}
function NameKey([string]$s) {
  # "ELECTRIC CA$H" and "Electric Cash" must collapse to the same token, and
  # "$2,000,000* CELEBRATION" must lose its footnote marker.
  return (($s -replace '\$', 'S') -replace '[^A-Za-z0-9]', '').ToUpper()
}
function Slugify([string]$s) {
  $t = $s -replace '([A-Za-z])\$([A-Za-z])', '$1S$2'
  $t = $t -replace '\$', ''
  $t = ($t -replace '[^A-Za-z0-9]+', '-').Trim('-')
  return $t.ToLower()
}

# ---- 1. the one page that holds every game and every tier --------------------
$idx = Get-Html "$BASE/about-the-games/unpaid-instant-games-prizes"
$rows = [regex]::Matches($idx, '(?s)<tr[^>]*\sdata-price="([^"]*)"[^>]*>(.*?)</tr>')
Write-Host "unpaid-prizes page lists $($rows.Count) games"
if ($rows.Count -lt 1) { throw "Illinois unpaid-prizes table did not parse" }

$parsed = New-Object System.Collections.ArrayList
$rowSkips = 0
$annuitySkips = 0
foreach ($r in $rows) {
  $cells = [regex]::Matches($r.Groups[2].Value, '(?s)<td[^>]*>(.*?)</td>')
  if ($cells.Count -lt 6) { $rowSkips++; continue }

  $name = Clean $cells[0].Groups[1].Value
  $name = ($name -replace '\s*\(\$[\d,]+\)\s*$', '').Trim()
  $price = Num $r.Groups[1].Value
  if ($price -le 0) { $price = Num (Clean $cells[1].Groups[1].Value) }
  $gnum = ''
  if ((Clean ($cells[2].Groups[1].Value -replace '<br\s*/?>', '|')) -match '^(\d+)') { $gnum = $Matches[1] }
  if (-not $name -or $price -le 0 -or -not $gnum) { $rowSkips++; continue }

  $prizeTxt = @(); $totTxt = @(); $remTxt = @()
  foreach ($p in ($cells[3].Groups[1].Value -split '<br\s*/?>')) { $t = Clean $p; if ($t) { $prizeTxt += $t } }
  foreach ($p in ($cells[4].Groups[1].Value -split '<br\s*/?>')) { $t = Clean $p; if ($t) { $totTxt += $t } }
  foreach ($p in ($cells[5].Groups[1].Value -split '<br\s*/?>')) { $t = Clean $p; if ($t) { $remTxt += $t } }

  # The three lists are positionally aligned. Different lengths = mis-parse.
  if ($prizeTxt.Count -lt 1 -or $prizeTxt.Count -ne $totTxt.Count -or $prizeTxt.Count -ne $remTxt.Count) {
    $rowSkips++
    Write-Host ("  ! {0} prize/total/unclaimed lists are {1}/{2}/{3} long; skipped" -f $name, $prizeTxt.Count, $totTxt.Count, $remTxt.Count)
    continue
  }

  # ANNUITY RULE: anything that is not a plain dollar figure (a "per year for
  # life" style prize) cannot be valued without a published cash value, and
  # Illinois publishes none here, so the whole game goes.
  $annuity = $false
  foreach ($t in $prizeTxt) { if ($t -notmatch '^\$[\d,]+$') { $annuity = $true } }
  if ($annuity) {
    $annuitySkips++
    Write-Host ("  ! {0} has a prize that is not a plain cash amount and no published cash value; game skipped" -f $name)
    continue
  }

  $tiers = New-Object System.Collections.ArrayList
  $bad = $false
  for ($i = 0; $i -lt $prizeTxt.Count; $i++) {
    $amt = Num $prizeTxt[$i]
    $tot = Num $totTxt[$i]
    $rem = Num $remTxt[$i]
    if ($amt -le 0) { continue }        # annuity rule: never value a 0 prize
    if ($tot -le 0) { continue }
    if ($rem -gt $tot) { $bad = $true; break }
    if ($rem -lt 0) { $rem = 0 }
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }
  if ($bad -or $tiers.Count -lt 1) {
    $rowSkips++
    Write-Host ("  ! {0} unclaimed exceeds total on some tier; skipped" -f $name)
    continue
  }

  [void]$parsed.Add([pscustomobject]@{
      gnum = $gnum; name = $name; price = $price; tiers = $tiers
    })
}

# ---- 2. overall odds, one detail page per game -------------------------------
# Walk the paginated hub for real slugs, then read game number + title + odds
# off each detail page. Keyed on game number AND name so a reused slug from an
# older edition can never be mistaken for the live game.
$pagesByNum = @{}
function Read-GamePage([string]$slug) {
  try { $html = Get-Html "$BASE/games-hub/instant-tickets/$slug" } catch { return $null }
  if ($html -notmatch '(?s)<td>\s*Game Number\s*</td>\s*<td>\s*([^<]+?)\s*</td>') { return $null }
  $gn = ($Matches[1] -replace '[^\d]', '')
  if ($html -notmatch '(?s)<td>\s*Overall Odds\s*</td>\s*<td>\s*([^<]+?)\s*</td>') { return $null }
  $odds = OddsOf $Matches[1]
  $title = ''
  $h1 = [regex]::Match($html, '(?s)<h1[^>]*>(.*?)</h1>')
  if ($h1.Success) { $title = Clean $h1.Groups[1].Value }
  if (-not $title -and $html -match '(?s)<title>(.*?)</title>') { $title = (Clean $Matches[1]) -replace '\s*\|.*$', '' }
  if (-not $gn -or $odds -le 0 -or -not $title) { return $null }
  return [pscustomobject]@{ gnum = $gn; odds = $odds; title = $title; slug = $slug }
}
function Add-GamePage($g) {
  if (-not $g) { return }
  if (-not $pagesByNum.ContainsKey($g.gnum)) { $pagesByNum[$g.gnum] = New-Object System.Collections.ArrayList }
  [void]$pagesByNum[$g.gnum].Add($g)
}
function Find-GamePage([string]$gnum, [string]$name) {
  # A page counts only if it carries the same game number AND a title that is
  # the same game: the unpaid-prizes page and the games hub sometimes disagree
  # on wording ("BONUS BLOWOUT" vs "Amazing Bonus Blowout"), so one name may
  # contain the other, but they may not be unrelated games. If two pages claim
  # the number with different odds, the answer is ambiguous and we take none.
  if (-not $pagesByNum.ContainsKey($gnum)) { return $null }
  $want = NameKey $name
  $hits = @()
  foreach ($p in $pagesByNum[$gnum]) {
    $got = NameKey $p.title
    if ($got -eq $want -or $got.Contains($want) -or $want.Contains($got)) { $hits += $p }
  }
  if ($hits.Count -lt 1) { return $null }
  if ((@($hits | Select-Object -ExpandProperty odds -Unique)).Count -gt 1) { return $null }
  return $hits[0]
}

$slugs = @{}
for ($p = 0; $p -lt 12; $p++) {
  try { $hub = Get-Html "$BASE/games-hub/instant-tickets?page=$p" } catch { break }
  $found = [regex]::Matches($hub, '/games-hub/instant-tickets/([a-z0-9\-]+)') | ForEach-Object { $_.Groups[1].Value }
  $new = 0
  foreach ($s in $found) { if (-not $slugs.ContainsKey($s)) { $slugs[$s] = $true; $new++ } }
  if ($new -eq 0) { break }
}
Write-Host "games hub lists $($slugs.Count) slugs"
foreach ($s in ($slugs.Keys | Sort-Object)) { Add-GamePage (Read-GamePage $s) }

# Anything still unmatched gets ONE verified guess at its slug: the page is only
# accepted if its own game number matches the row we want. That check is what
# stops /triple-777 (game 7401) standing in for the live TRIPLE 777 (7602).
foreach ($g in $parsed) {
  if (Find-GamePage $g.gnum $g.name) { continue }
  $cand = Slugify $g.name
  if (-not $cand -or $slugs.ContainsKey($cand)) { continue }
  $slugs[$cand] = $true
  $page = Read-GamePage $cand
  if ($page -and $page.gnum -eq $g.gnum) { Add-GamePage $page }
}
$resolved = 0
foreach ($g in $parsed) { if (Find-GamePage $g.gnum $g.name) { $resolved++ } }
Write-Host "overall odds resolved for $resolved of $($parsed.Count) games"

# ---- 3. value each game ------------------------------------------------------
$games = New-Object System.Collections.ArrayList
$noOdds = 0
$gateSkips = 0
$skipped = 0
foreach ($g in $parsed) {
  $page = Find-GamePage $g.gnum $g.name
  if (-not $page) {
    $noOdds++
    Write-Host ("  ! {0} (game {1}) has no verified overall odds; skipped" -f $g.name, $g.gnum)
    continue
  }
  $odds = $page.odds
  $url = "$BASE/games-hub/instant-tickets/$($page.slug)"

  $totalPrizes = ($g.tiers | Measure-Object -Property original -Sum).Sum
  $remPrizes = ($g.tiers | Measure-Object -Property remaining -Sum).Sum
  if ($totalPrizes -le 0 -or $remPrizes -le 0) { $skipped++; continue }

  $printed = [double]$totalPrizes * $odds
  $pctSold = 100.0 * (($totalPrizes - $remPrizes) / $totalPrizes)
  $ticketsLeft = $printed * (1 - $pctSold / 100)
  if ($printed -le 0 -or $ticketsLeft -lt 1) { $skipped++; continue }

  $valueLeft = 0.0; $origValue = 0.0
  foreach ($t in $g.tiers) { $valueLeft += $t.remaining * $t.prize; $origValue += $t.original * $t.prize }
  $evNow = $valueLeft / ($ticketsLeft * $g.price)
  $evStart = $origValue / ($printed * $g.price)

  # SANITY GATE: real scratch games pay ~60-75% at launch; far outside that is a
  # mis-parse, so drop it rather than publish a wrong figure.
  if ($evStart -lt 0.45 -or $evStart -gt 0.95) {
    $gateSkips++
    Write-Host ("  ! {0} implausible launch payout {1:P0}; skipped" -f $g.name, $evStart); continue
  }

  $topTier = $g.tiers | Sort-Object prize -Descending | Select-Object -First 1
  [void]$games.Add([pscustomobject]@{
      name = $g.name
      game_number = [string]$g.gnum
      url = $url
      price = $g.price
      overall_odds = $odds
      pct_sold = [math]::Round($pctSold, 1)
      tickets_printed = [long]$printed; tickets_left = [long]$ticketsLeft
      prize_value_left = [long]$valueLeft
      ev_now = [math]::Round($evNow, 4); ev_start = [math]::Round($evStart, 4)
      top_prize = [long]$topTier.prize; top_left = [long]$topTier.remaining; top_original = [long]$topTier.original
      est_tiers = 0
      top_share = $(if ($valueLeft -gt 0) { [math]::Round(($topTier.remaining * $topTier.prize) / $valueLeft, 3) } else { 0 })
      low_confidence = ($pctSold -gt 90)
      tiers = @($g.tiers | Sort-Object prize -Descending)
    })
}
if ($noOdds -gt 0) { Write-Host "  ($noOdds skipped: no verified overall odds on the games hub)" }
if ($annuitySkips -gt 0) { Write-Host "  ($annuitySkips skipped: annuity prize with no published cash value)" }
if ($rowSkips -gt 0) { Write-Host "  ($rowSkips skipped: unusable table row)" }
if ($gateSkips -gt 0) { Write-Host "  ($gateSkips skipped: launch payout outside 45-95%)" }
if ($skipped -gt 0) { Write-Host "  ($skipped skipped: incomplete prize data)" }
if ($games.Count -lt 1) { throw "no Illinois games survived the checks" }

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "IL"; state_name = "Illinois"; source = "illinoislottery.com"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). Illinois puts every instant game and every prize tier on a single unpaid-prizes page: for each game it lists the ticket price, the game number and three aligned lists giving each prize value, how many of that prize were printed and how many are still unclaimed, updated daily. Overall odds come from that game's own page on the games hub, matched back by game number AND name so an older edition sharing a slug cannot be mistaken for the live game; any game whose odds cannot be verified that way is left out rather than guessed at. Nothing is estimated: tickets printed is total winning tickets x overall odds, and percent sold is inferred from the share of prizes claimed - small prizes often go unredeemed, so that understates sales and makes these figures conservative. IMPORTANT: 'unclaimed' means NOT YET CLAIMED, not unsold - a big prize may already sit in a ticket someone has bought, so a high value-per-`$1 is an edge in expectation, not a promise the prize is still on the shelf. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_il.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_il.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
    $sortedGames.Count, [math]::Round((Get-Item $path).Length / 1kb, 1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
    $sortedGames[0].name, $sortedGames[0].ev_now)

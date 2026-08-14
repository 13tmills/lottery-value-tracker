# Connecticut scratch-off REMAINING-VALUE analysis. Same output shape as the
# NC/GA/CA/TX/ID generators so the frontend is shared.
#
# SOURCE: ctlottery.org is server-rendered ASP.NET - no API, no special headers.
#   INDEX  GET https://www.ctlottery.org/ScratchGamesTable
#          -> <table id="gvScratchGames"> with columns
#             Game | Game Name | Price | Top Prize | Game Start | Top Prizes |
#             Top Prizes Unclaimed | Last day to redeem
#          The game number links to /ScratchGames/<gamenumber>/
#   DETAIL GET https://www.ctlottery.org/ScratchGames/<gamenumber>/
#          -> an info table of label/value rows including
#             "Ticket Price:", "Total # of Tickets:", "Overall Odds:" (1 in X)
#          -> a prize table inside <div class="unclaimed-prize-wrap"> with
#             Prize Amount | Total Prizes | Unclaimed Prizes
#
# WHY CT IS EASY: Connecticut states the print run OUTRIGHT ("Total # of
# Tickets"), so unlike NC/NM we do NOT derive it from odds. We use the stated
# figure directly and only CROSS-CHECK it against total prizes x overall odds;
# a disagreement over 25% means we mis-parsed something and we warn.
#
#   tickets printed = stated "Total # of Tickets" (cross-checked vs odds)
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
#
# GOTCHAS
#   - The index "Top Prize" column is the largest prize STILL OFFERED, which on
#     some games is far below the marketing name (e.g. "$10 Million Cash
#     Blowout" shows $500). Never trust that column as the jackpot; the detail
#     prize table is the authority. We take name/number/price from the index and
#     everything numeric from the detail page.
#   - Cell text is wrapped in nested markup on some rows (Game Start holds a
#     <time> element), so a flat <td>value</td> regex misses rows. We parse
#     structurally: <tr> -> <td> -> strip tags -> test text.
#   - Most prize amounts are plain dollar figures, but ~10 games list their top
#     prize as "$1,000,000 ANNUITY" or "$20,000 A YEAR FOR LIFE". CT publishes
#     the lump sum in the HOW TO PLAY text ("...one-time gross cash option of
#     $750,000."), so we substitute that PUBLISHED figure. If a game shows an
#     annuity tier and no cash-option sentence, the game is skipped rather than
#     guessed at, as is any game with more than one such tier.
#   - UNITS: prize amounts and ticket price are whole dollars (no cents
#     anywhere), overall odds are "1 in X" so X is tickets per winner.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$BASE = "https://www.ctlottery.org"
$H = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)' }

function Num([string]$s) { [double](($s -replace '[^\d.]', '')) }
function Strip([string]$s) {
  $t = $s -replace '(?s)<[^>]+>', ' '
  $t = [System.Net.WebUtility]::HtmlDecode($t)
  return (($t -replace '\s+', ' ').Trim())
}
# Return the stripped text of every <td> in a table row.
function RowCells([string]$rowHtml) {
  $out = New-Object System.Collections.ArrayList
  foreach ($c in [regex]::Matches($rowHtml, '(?s)<td[^>]*>(.*?)</td>')) {
    [void]$out.Add((Strip $c.Groups[1].Value))
  }
  return $out
}

$idx = (Invoke-WebRequest -Uri "$BASE/ScratchGamesTable" -Headers $H -UseBasicParsing -TimeoutSec 60).Content
$table = [regex]::Match($idx, '(?s)<table id="gvScratchGames">.*?</table>').Value
if (-not $table) { throw "index table gvScratchGames not found" }

$listed = New-Object System.Collections.ArrayList
foreach ($r in [regex]::Matches($table, '(?s)<tr>.*?</tr>')) {
  $cells = RowCells $r.Value
  if ($cells.Count -lt 3) { continue }               # header row has <th> only
  $gid = ($cells[0] -replace '[^\d]', '')
  if (-not $gid) { continue }
  $nm = $cells[1]
  $pz = Num $cells[2]
  if ($pz -le 0) { continue }
  [void]$listed.Add([pscustomobject]@{ id = $gid; name = $nm; price = $pz })
}
Write-Host "index lists $($listed.Count) games"

$games = New-Object System.Collections.ArrayList
$skipped = 0
foreach ($g in $listed) {
  $url = "$BASE/ScratchGames/$($g.id)/"
  try { $html = (Invoke-WebRequest -Uri $url -Headers $H -UseBasicParsing -TimeoutSec 45).Content }
  catch { Write-Host ("  ! {0} detail page unreachable; skipped" -f $g.name); $skipped++; continue }

  # The prize table lives in its own wrapper; everything before it is the info
  # block, so split there and parse each half independently.
  $cut = $html.IndexOf('unclaimed-prize-wrap')
  if ($cut -lt 0) { Write-Host ("  ! {0} no prize table; skipped" -f $g.name); $skipped++; continue }
  $pre = $html.Substring(0, $cut)
  $post = $html.Substring($cut)

  # Info block: two-cell label/value rows.
  $price = $g.price; $printed = 0.0; $odds = $null
  foreach ($r in [regex]::Matches($pre, '(?s)<tr>.*?</tr>')) {
    $c = RowCells $r.Value
    if ($c.Count -ne 2) { continue }
    if ($c[0] -match '^Ticket Price') { $v = Num $c[1]; if ($v -gt 0) { $price = $v } }
    elseif ($c[0] -match '^Total # of Tickets') { $printed = Num $c[1] }
    elseif ($c[0] -match '^Overall Odds') { if ($c[1] -match '1 in ([\d,.]+)') { $odds = Num $Matches[1] } }
  }
  if ($price -le 0) { Write-Host ("  ! {0} no ticket price; skipped" -f $g.name); $skipped++; continue }
  if ($printed -le 0) { Write-Host ("  ! {0} no stated print run; skipped" -f $g.name); $skipped++; continue }

  # Prize table: Prize Amount | Total Prizes | Unclaimed Prizes.
  $ptable = [regex]::Match($post, '(?s)<table.*?</table>').Value
  if (-not $ptable) { Write-Host ("  ! {0} prize table empty; skipped" -f $g.name); $skipped++; continue }

  # Annuity top prizes: pull CT's own published lump sum out of the play text.
  $flat = [System.Net.WebUtility]::HtmlDecode((($html -replace '(?s)<script.*?</script>', ' ') -replace '(?s)<[^>]+>', ' ')) -replace '\s+', ' '
  $cashOption = 0.0
  if ($flat -match 'cash option(?:\s+payment)?\s+of\s+\$([\d,]+)') { $cashOption = Num $Matches[1] }

  $tiers = New-Object System.Collections.ArrayList
  $bad = $false; $substituted = 0
  foreach ($r in [regex]::Matches($ptable, '(?s)<tr>.*?</tr>')) {
    $c = RowCells $r.Value
    if ($c.Count -lt 3) { continue }
    $amt = 0.0
    if ($c[0] -match '^\$?[\d,]+(\.\d+)?$') {
      $amt = Num $c[0]
    }
    elseif ($c[0] -match '^\$[\d,]+\s+(ANNUITY|A YEAR FOR LIFE)') {
      # Non-cash tier: only usable if CT published the lump sum, and only if
      # this is the game's single annuity tier (one sentence, one value).
      $substituted++
      if ($cashOption -le 0 -or $substituted -gt 1) { $bad = $true; break }
      $amt = $cashOption
    }
    else { $bad = $true; break }
    $tot = Num $c[1]; $rem = Num $c[2]
    if ($amt -le 0 -or $tot -le 0) { continue }
    if ($rem -lt 0) { $rem = 0 }; if ($rem -gt $tot) { $rem = $tot }
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }
  if ($bad) { Write-Host ("  ! {0} non-cash prize tier with no usable published value; skipped" -f $g.name); $skipped++; continue }
  if ($tiers.Count -lt 3) { Write-Host ("  ! {0} only $($tiers.Count) readable tiers; skipped" -f $g.name); $skipped++; continue }

  $totalPrizes = ($tiers | Measure-Object -Property original -Sum).Sum
  $remPrizes = ($tiers | Measure-Object -Property remaining -Sum).Sum
  if ($totalPrizes -le 0 -or $remPrizes -le 0) { $skipped++; continue }

  # CROSS-CHECK the stated print run: total prizes x overall odds should land on
  # roughly the same number. We keep the stated figure either way, but a wide
  # gap means the prize table or the odds line was mis-read.
  if ($odds -ne $null -and $odds -gt 0) {
    $implied = $totalPrizes * $odds
    $gap = [math]::Abs($implied - $printed) / $printed
    if ($gap -gt 0.25) {
      Write-Host ("  ~ {0}: stated print run {1:N0} vs odds-implied {2:N0} ({3:P0} apart)" -f $g.name, $printed, $implied, $gap)
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
    Write-Host ("  ! {0} implausible launch payout {1:P0}; skipped" -f $g.name, $evStart); $skipped++; continue
  }

  $topTier = $tiers | Sort-Object prize -Descending | Select-Object -First 1
  [void]$games.Add([pscustomobject]@{
    name = $g.name
    game_number = [string]$g.id
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
if ($skipped -gt 0) { Write-Host "  ($skipped games skipped, reasons above)" }

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "CT"; state_name = "Connecticut"; source = "ctlottery.org"
  method = "Value per `$1 remaining = (unclaimed prize value) / (unsold tickets x ticket price). Connecticut is unusual in stating the print run outright: every game page publishes 'Total # of Tickets', so the number of tickets printed is taken straight from the lottery rather than derived, and is only cross-checked against total prizes x overall odds. For each prize tier the state publishes the prize amount, the number of prizes at printing and the number still unclaimed, refreshed daily. Nothing is estimated: where a top prize is an annuity we use the lump sum Connecticut itself publishes (its 'one-time gross cash option'), never a guess, and any game whose non-cash prize has no published cash value is left out entirely. Percent sold is inferred from the share of prizes claimed - small prizes often go unredeemed, so that understates sales and makes these figures conservative. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought but not yet cashed, so a game showing a top prize left is not a promise one is still on the shelf. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_ct.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_ct.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
  $sortedGames[0].name, $sortedGames[0].ev_now)

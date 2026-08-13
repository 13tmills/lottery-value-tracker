# Texas scratch-ticket REMAINING-VALUE analysis. Same output shape as
# scraper/gen_scratch_id.ps1 so the frontend is shared.
#
# texaslottery.com publishes better data than most: each game's detail page states
# the total tickets printed outright, the overall odds, and a FULL prize table
# (Amount | No. in Game | No. Prizes Claimed) down to the smallest tier — no
# withheld rows. all.html supplies the ticket price per game number.
#
#   remaining count   = in_game - claimed
#   tickets sold      ~ printed x (prizes claimed / prizes in game)
#   value per $1 now  = remaining prize value / (tickets left x price)
#
# Texas gives no published "percent sold", so it is inferred from the claim ratio.
# Small prizes routinely go unredeemed, so that UNDERSTATES sales, which makes
# tickets-left too high and ev_now conservative (biased low) — the safe direction.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$UA = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)' }
$BASE = "https://www.texaslottery.com"
$ALL = "$BASE/export/sites/lottery/Games/Scratch_Offs/all.html"

function Cells($rowHtml) {
  [regex]::Matches($rowHtml, '(?s)<t[dh][^>]*>(.*?)</t[dh]>') |
    ForEach-Object { (($_.Groups[1].Value -replace '<[^>]+>', '') -replace '&nbsp;', ' ' -replace '\s+', ' ').Trim() } |
    Where-Object { $_ -ne '' }
}
function Num($s) { [double](($s -replace '[^0-9.]', '')) }

# ---- 1) price + name by game number, from the all-games listing ----
$allHtml = (Invoke-WebRequest -Uri $ALL -Headers $UA -UseBasicParsing -TimeoutSec 60).Content
$priceByNum = @{}
foreach ($r in [regex]::Matches($allHtml, '(?s)<tr.*?</tr>')) {
  $c = @(Cells $r.Value)
  if ($c.Count -ge 7 -and $c[0] -match '^\d{3,4}$') { $priceByNum[$c[0]] = @{ price = (Num $c[2]); name = $c[3] } }
}
Write-Host "listing: $($priceByNum.Count) games with a price"

# ---- 2) crawl detail pages ----
$paths = [regex]::Matches($allHtml, 'href="(/export/sites/lottery/Games/Scratch_Offs/details\.html_[^"]+)"') |
  ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
Write-Host "detail pages: $($paths.Count)"

$games = New-Object System.Collections.ArrayList
foreach ($p in $paths) {
  try { $html = (Invoke-WebRequest -Uri ($BASE + $p) -Headers $UA -UseBasicParsing -TimeoutSec 30).Content }
  catch { continue }
  $txt = ($html -replace '<[^>]+>', ' ') -replace '\s+', ' '

  $gm = [regex]::Match($txt, 'Game No\.\s*(\d+)\s*-\s*([^\.]{1,70}?)\s+(?:function|Scratch|Ticket|Game|Overall|\$)')
  if (-not $gm.Success) { $gm = [regex]::Match($txt, 'Game No\.\s*(\d+)\s*-\s*(.{1,50})') }
  if (-not $gm.Success) { continue }
  $num = $gm.Groups[1].Value
  $name = ($gm.Groups[2].Value -replace '&amp;', '&').Trim()
  $meta = $priceByNum[$num]
  if (-not $meta -or -not $meta.price) { continue }
  # Prefer the detail page's name: the listing shows "*" (a footnote marker) for
  # ~13 games, so only fall back to it when the detail name didn't parse.
  if (($name -notmatch '[A-Za-z0-9]') -and $meta.name -match '[A-Za-z0-9]') { $name = $meta.name }
  $price = [double]$meta.price
  if ($price -le 0) { continue }

  $printed = Num ([regex]::Match($txt, 'approximately\s+([\d,]+)\*?\s+tickets').Groups[1].Value)
  if ($printed -le 0) { continue }
  $overall = [regex]::Match($txt, 'are 1 in ([\d.]+)').Groups[1].Value

  # full prize table: Amount | No. in Game | No. Prizes Claimed
  $tb = [regex]::Match($html, '(?s)<table.*?</table>').Value
  $tiers = New-Object System.Collections.ArrayList
  foreach ($r in [regex]::Matches($tb, '(?s)<tr.*?</tr>')) {
    $c = @(Cells $r.Value)
    if ($c.Count -lt 3 -or $c[0] -notmatch '^\$') { continue }
    $amt = Num $c[0]; $inGame = Num $c[1]; $claimed = Num $c[2]
    if ($amt -le 0 -or $inGame -le 0) { continue }
    if ($claimed -gt $inGame) { $claimed = $inGame }
    [void]$tiers.Add([pscustomobject]@{
      prize = $amt; original = [long]$inGame; remaining = [long]($inGame - $claimed); estimated = $false })
  }
  if ($tiers.Count -lt 3) { continue }

  $totalPrizes = ($tiers | Measure-Object -Property original -Sum).Sum
  $claimedAll = $totalPrizes - (($tiers | Measure-Object -Property remaining -Sum).Sum)
  if ($totalPrizes -le 0) { continue }
  $pctSold = 100.0 * ($claimedAll / $totalPrizes)
  $ticketsLeft = $printed * (1 - $pctSold / 100)
  if ($ticketsLeft -lt 1) { continue }

  $valueLeft = 0.0; $origValue = 0.0
  foreach ($t in $tiers) { $valueLeft += $t.remaining * $t.prize; $origValue += $t.original * $t.prize }
  $evNow = $valueLeft / ($ticketsLeft * $price)
  $evStart = $origValue / ($printed * $price)

  # SANITY GATE: real scratch games pay ~60-75% at launch. Anything far outside that
  # means a mis-parse — drop it rather than publish a wrong number.
  if ($evStart -lt 0.45 -or $evStart -gt 0.95) {
    Write-Host ("  ! {0} implausible launch payout {1:P0}; skipped" -f $name, $evStart); continue
  }

  $topTier = $tiers | Sort-Object prize -Descending | Select-Object -First 1
  [void]$games.Add([pscustomobject]@{
    name = $name; url = $BASE + $p; price = $price
    overall_odds = $(if ($overall) { [double]$overall } else { $null })
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
  Start-Sleep -Milliseconds 200
}

$sorted = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "TX"; state_name = "Texas"; source = "texaslottery.com"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). Texas states each game's total tickets printed and publishes every prize tier's count and claims, so no tiers are estimated. Texas does not publish a percent-sold figure, so it is inferred from the share of prizes claimed; because small prizes often go unredeemed that understates sales, which makes these value figures conservative. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought. Games over 90% sold are flagged low_confidence."
  games = $sorted
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_tx.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_tx.json: {0} games ({1} KB). launch-payout range {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
  $sorted.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sorted.ev_start | Measure-Object -Minimum).Minimum, ($sorted.ev_start | Measure-Object -Maximum).Maximum, `
  $sorted[0].name, $sorted[0].ev_now)

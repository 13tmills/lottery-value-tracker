# Arizona scratcher REMAINING-VALUE analysis. Same output shape as the
# GA/NC/CA/TX/ID generators so the frontend is shared.
#
# SOURCE: a public per-game JSON endpoint, no auth, no referer --
#   GET https://api.arizonalottery.com/v2/scratchers/<gameNum>
# Per game: gameName, gameOdds (overall odds as a bare number, 3.06 = 1 in 3.06),
# ticketValue (price in DOLLARS), beginDate / endDate / lastDate, hasAnnuityPrize,
# annuityDetails, and prizeTiers[] with description, prizeAmount (DOLLARS),
# totalCount (prizes at printing), count (prizes REMAINING), odds (that tier's odds).
#
# UNITS -- verified, not assumed: everything is already in dollars, unlike the
# Georgia and New Jersey APIs which use cents. Game 1544 "High Roller" returns
# ticketValue 20.00, gameOdds 3.06 and a top tier prizeAmount 500000.00 described
# "$500,000"; the state's own page for that game advertises a $20 ticket, overall
# odds 1 in 3.06 and a $500,000 top prize. No divisor is applied anywhere.
#
# GOTCHA - THERE IS NO LIST ENDPOINT. Game numbers normally come from scraping
# https://www.arizonalottery.com/scratchers/ for links matching /scratchers/(\d+)-.
# But the whole www host sits behind a Cloudflare interstitial that returns 403 to
# any scripted client (robots.txt and sitemap.xml included), while api.* is wide
# open. So the index scrape is attempted first and, when it is blocked, we fall
# back to walking the game-number space against the API itself. That still only
# ever reads numbers Arizona publishes; nothing is guessed about a game's contents.
#
# GOTCHA - ENCODING. The API sends UTF-8 without a charset in the content type, so
# Invoke-RestMethod mangles game names ("CASH EXPLOSION(R)" arrives as mojibake).
# Bytes are pulled off the raw stream and decoded as UTF-8 explicitly.
#
# GOTCHA - PROMOTIONAL GAMES. "Strike it Rich Promotional Game" (1516, 1532)
# returns every tier with odds 0.00, so no print run can be derived. Those games
# are skipped rather than guessed at.
#
# ANNUITY -- Arizona is INCONSISTENT here and this is the trap in this dataset.
# hasAnnuityPrize marks games whose grand prize is paid over 20-30 years. For MOST
# of them Arizona stores the CASH value in prizeAmount: game 1490 advertises
# $2,500,000 in annuityDetails but its top tier reads "$1.25 Million" /
# prizeAmount 1250000.00. For some it stores the ADVERTISED SUM instead: game 1401
# SET FOR LIFE advertises $5,000,000 ("20 annual payments of $250,000") and its top
# tier is also 5000000.00, i.e. no cash value is published anywhere.
# The tell is whether the top tier equals the figure quoted in annuityDetails. When
# it does, there is no published cash value, so the WHOLE GAME is skipped - we do
# not estimate a discount rate. When it does not, the published cash value is used.
# Game 1480 "$5,000,000 Luxe" is a separate case: every prizeAmount field is blank,
# so the game carries no numeric prize values at all and is skipped too.
#
# Per-tier odds are published, so the print run is derived from every tier
# independently and cross-checked - a mis-parse shows up as tiers disagreeing.
#
#   tickets printed = that tier's prize count x that tier's odds (median, cross-checked)
#   tickets left    = printed x (1 - prizes claimed / prizes total)
#   value per $1    = unclaimed prize value / (tickets left x price)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$API = "https://api.arizonalottery.com/v2/scratchers"
$SITE = "https://www.arizonalottery.com/scratchers/"
$UA = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)'
$H = @{ 'User-Agent' = $UA }
# Fallback walk bounds. Arizona game numbers are sequential; nothing above 1549
# exists today and nothing still on sale is numbered below 1350.
$SCAN_LO = 1350
$SCAN_HI = 1600

function Get-AzJson([string]$url) {
  $w = Invoke-WebRequest -Uri $url -Headers $H -UseBasicParsing -TimeoutSec 30
  # Decode UTF-8 by hand; the API omits charset and PowerShell guesses latin-1.
  return ([System.Text.Encoding]::UTF8.GetString($w.RawContentStream.ToArray()) | ConvertFrom-Json)
}

# Slugs only exist on the www site. When the index is readable we keep the real slug
# for the game URL; otherwise we rebuild it the way Arizona does. Verified against
# live URLs: 1544-high-roller, 1434-20x, 1497-loteria-grande (accented letters are
# FOLDED to ASCII, not dropped), 1533-100-000-route-66 (the comma in "$100,000"
# becomes a hyphen, the dollar sign and the (R) mark disappear).
# Every character class below is written with escape codes so this file stays pure
# ASCII - PowerShell 5.1 reads a BOM-less .ps1 as ANSI and would corrupt literals.
$APOSTROPHES = "[{0}{1}{2}{3}]" -f [char]0x27, [char]0x60, [char]0x2018, [char]0x2019
function Get-AzSlug([string]$name) {
  # Fold accents: decompose, then drop the combining marks. Loteria, not Loter-a.
  $d = $name.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $d.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$sb.Append($ch)
    }
  }
  $s = $sb.ToString().Normalize([Text.NormalizationForm]::FormC).ToLower()
  $s = $s -replace $APOSTROPHES, ''      # 7's -> 7s, never 7-s
  $s = $s -replace '[^a-z0-9]+', '-'     # this also eats the (R)/(TM) marks
  return $s.Trim('-')
}

$slugById = @{}
$ids = @()
try {
  $idx = (Invoke-WebRequest -Uri $SITE -Headers $H -UseBasicParsing -TimeoutSec 60).Content
  foreach ($m in [regex]::Matches($idx, '/scratchers/(\d+)-([a-z0-9\-]+)')) {
    $slugById[$m.Groups[1].Value] = $m.Groups[2].Value
  }
  $ids = @($slugById.Keys | Sort-Object { [int]$_ })
  Write-Host "index lists $($ids.Count) games"
} catch {
  Write-Host "index blocked ($($_.Exception.Message.Split([char]10)[0])); walking game numbers $SCAN_LO-$SCAN_HI against the API"
}
if ($ids.Count -lt 20) {
  $ids = @()
  foreach ($n in $SCAN_LO..$SCAN_HI) {
    try { $null = Get-AzJson "$API/$n"; $ids += [string]$n } catch { }
  }
  Write-Host "API walk found $($ids.Count) game numbers"
}

$today = Get-Date
$games = New-Object System.Collections.ArrayList
$skipped = 0
$notCurrent = 0
$annuitySkips = 0
foreach ($id in $ids) {
  try { $g = Get-AzJson "$API/$id" } catch { $skipped++; continue }

  # Currently on sale: started, and either open-ended or not yet past its end date.
  $begin = $null; $end = $null
  if ("$($g.beginDate)".Trim()) { $begin = [datetime]$g.beginDate }
  if ("$($g.endDate)".Trim()) { $end = [datetime]$g.endDate }
  if ($begin -and $begin -gt $today) { $notCurrent++; continue }
  if ($end -and $end -lt $today) { $notCurrent++; continue }

  $name = ("$($g.gameName)" -replace '&amp;', '&' -replace '\s+', ' ').Trim()
  $price = [double]$g.ticketValue
  if ($price -le 0) { $skipped++; continue }
  $odds = [double]$g.gameOdds
  if ($odds -le 1) { $odds = $null }

  $tiersRaw = @($g.prizeTiers)
  if ($tiersRaw.Count -lt 3) { $skipped++; continue }

  # A tier that names a prize but carries no dollar amount cannot be valued, and we
  # never invent one - drop the whole game instead of understating it.
  $unvalued = @($tiersRaw | Where-Object { [double]$_.prizeAmount -le 0 -and [double]$_.totalCount -gt 0 })
  if ($unvalued.Count -gt 0) {
    Write-Host ("  ! {0} has an unvalued prize tier ('{1}'); whole game skipped" -f $name, $unvalued[0].description)
    $annuitySkips++; continue
  }

  # Annuity check: if the top tier's amount is the figure quoted in annuityDetails,
  # that amount is the sum of the annual payments, not a cash value, and Arizona
  # publishes no cash value for this game. Skip it rather than discount it ourselves.
  if ($g.hasAnnuityPrize -and "$($g.annuityDetails)" -match '\$\s*([\d,]+(?:\.\d+)?)') {
    $advertised = [double]($Matches[1] -replace ',', '')
    $topAmt = [double](@($tiersRaw | Sort-Object { [double]$_.prizeAmount } -Descending)[0].prizeAmount)
    if ($advertised -gt 0 -and [math]::Abs($topAmt - $advertised) / $advertised -lt 0.01) {
      Write-Host ("  ! {0} tops out at the advertised annuity sum (`${1:N0}) with no published cash value; whole game skipped" -f $name, $advertised)
      $annuitySkips++; continue
    }
  }

  $tiers = New-Object System.Collections.ArrayList
  $printedEstimates = @()
  $badOdds = $false
  foreach ($t in $tiersRaw) {
    $amt = [double]$t.prizeAmount
    $tot = [double]$t.totalCount
    $rem = [double]$t.count
    $tOdds = [double]$t.odds
    if ($amt -le 0 -or $tot -le 0) { continue }
    if ($tOdds -le 0) { $badOdds = $true; continue }
    if ($rem -lt 0) { $rem = 0 }; if ($rem -gt $tot) { $rem = $tot }
    $printedEstimates += ($tot * $tOdds)
    [void]$tiers.Add([pscustomobject]@{ prize = $amt; original = [long]$tot; remaining = [long]$rem; estimated = $false })
  }
  if ($badOdds -and $printedEstimates.Count -lt 3) {
    Write-Host ("  ! {0} publishes no per-tier odds (promotional game); skipped" -f $name); $skipped++; continue
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

  $slug = $slugById[[string]$id]
  if (-not $slug) { $slug = Get-AzSlug $name }
  $topTier = $tiers | Sort-Object prize -Descending | Select-Object -First 1
  [void]$games.Add([pscustomobject]@{
    name = $name
    game_number = [string]$id
    url = "https://www.arizonalottery.com/scratchers/$id-$slug/"
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
if ($notCurrent -gt 0) { Write-Host "  ($notCurrent games skipped: not currently on sale)" }
if ($skipped -gt 0) { Write-Host "  ($skipped games skipped: unreadable or incomplete prize table)" }
if ($annuitySkips -gt 0) { Write-Host "  ($annuitySkips games skipped: a prize tier with no published cash value)" }

$sortedGames = @($games | Sort-Object ev_now -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "AZ"; state_name = "Arizona"; source = "arizonalottery.com"
  method = "Value per `$1 remaining = (unclaimed prize value) / (estimated unsold tickets x ticket price). Arizona publishes, for every prize tier of every scratcher, the prize amount, that tier's odds, the number of prizes at printing and the number not yet claimed. Nothing is estimated. Tickets printed is derived from each tier's prize count x that tier's odds and cross-checked across all tiers, so a bad figure shows up as tiers disagreeing and the game is dropped. Annuity top prizes are counted at the cash value Arizona publishes, never at the advertised sum of payments. Percent sold is inferred from the share of prizes claimed - small prizes often go unredeemed, so that understates sales and makes these figures conservative. IMPORTANT: 'remaining' means UNCLAIMED, not unsold - a big prize may already sit in a ticket someone has bought. Games over 90% sold are flagged low_confidence."
  games = $sortedGames
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_az.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_az.json: {0} games ({1} KB). launch-payout {2:P0}-{3:P0}. Best now: {4} ({5:P0})" -f `
  $sortedGames.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sortedGames.ev_start | Measure-Object -Minimum).Minimum, ($sortedGames.ev_start | Measure-Object -Maximum).Maximum, `
  $sortedGames[0].name, $sortedGames[0].ev_now)

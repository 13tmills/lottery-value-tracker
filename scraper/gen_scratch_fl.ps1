# Florida scratch-off TOP PRIZE analysis.
#
# Endpoint (found by watching the site's own XHR): the Florida Lottery's Azure API
#   https://apim-website-prod-eastus.azure-api.net/scratchgamesapp/getTopPrizesRemaining
# It returns 401 "Missing header" unless you send  x-partner: web  — that is the only
# header required (no subscription key), taken from the site's own HTTP wrapper.
#
# Florida publishes TOP PRIZES ONLY (how many of each game's headline prize remain of
# how many printed) - not the full prize table. So a value-per-dollar figure like the
# one on our Texas/California/Idaho pages cannot be computed here, and we do not
# invent one. What this does answer is the question players actually ask at the rack:
# does this game still have the big prize it is advertising?
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$API = "https://apim-website-prod-eastus.azure-api.net/scratchgamesapp/getTopPrizesRemaining"
$UA = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)'
         'x-partner'  = 'web' }

$raw = Invoke-RestMethod -Uri $API -Headers $UA -TimeoutSec 60
Write-Host "API returned $($raw.Count) games"

$games = New-Object System.Collections.ArrayList
foreach ($g in $raw) {
  $price = [double]$g.TicketPrice
  if ($price -le 0) { continue }
  # TopPrizes is the string "null" when a game has no top-prize record.
  if (-not $g.TopPrizes -or $g.TopPrizes -is [string]) { continue }
  $tp = @($g.TopPrizes)[0]
  if (-not $tp) { continue }

  $amount = [double](($tp.TopPrize -replace '[^0-9.]', ''))
  # "4 of 8 " / "0 of 30*" / "1,404 of 6,116 " — counts carry thousands separators,
  # so the digit groups must allow commas or "1,404 of 6,116" parses as "404 of 6".
  $m = [regex]::Match([string]$tp.TopPrizesRemaining, '([\d,]+)\s*of\s*([\d,]+)')
  if (-not $m.Success -or $amount -le 0) { continue }
  $left = [int](($m.Groups[1].Value) -replace ',', '')
  $orig = [int](($m.Groups[2].Value) -replace ',', '')
  if ($orig -le 0 -or $left -gt $orig) { continue }

  # Names arrive HTML-escaped (e.g. "MONOPOLY&trade;").
  $nm = $g.GameName -replace '&trade;', '™' -replace '&reg;', '®' -replace '&amp;', '&' -replace '&#\d+;', ''
  [void]$games.Add([pscustomobject]@{
    name = ($nm -replace '\s+', ' ').Trim()
    game_number = [string]$g.Id
    url = "https://floridalottery.com/games/scratch-offs"
    price = $price
    top_prize = [long]$amount
    top_left = $left
    top_original = $orig
    top_pct_left = [math]::Round(100.0 * $left / $orig, 1)
    # A game still on sale with none of its headline prize left is the thing worth flagging.
    top_prize_gone = ($left -eq 0)
  })
}

$sorted = @($games | Sort-Object top_pct_left -Descending)
$gone = @($sorted | Where-Object { $_.top_prize_gone }).Count
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "FL"; state_name = "Florida"; source = "floridalottery.com"
  metric = "topprize"
  method = "Florida publishes how many of each game's TOP prize remain of how many were printed, plus the ticket price - but not the full prize table, so the cents-per-dollar figure used on our Texas, California and Idaho pages cannot be computed for Florida and we do not estimate one. This page ranks games by the share of their headline prize still unclaimed. As everywhere, 'remaining' means UNCLAIMED rather than unsold: a top prize counted as remaining may already sit in a ticket that has been bought but not redeemed."
  games_total = $sorted.Count
  top_prize_gone = $gone
  games = $sorted
}
$json = $out | ConvertTo-Json -Depth 6 -Compress
$path = Join-Path $root "scratch_fl.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_fl.json: {0} games ({1} KB); {2} still on sale with ZERO top prizes left" -f `
  $sorted.Count, [math]::Round((Get-Item $path).Length/1kb,1), $gone)

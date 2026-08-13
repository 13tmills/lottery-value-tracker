# New York scratch-off analysis from the state's OFFICIAL open-data feed:
# data.ny.gov dataset nzqa-7unk, "Scratch-Off Game Daily Prize Status Report"
# (per game, per prize tier: total printed / paid / unpaid, refreshed daily).
#
# NY does NOT publish ticket price or overall odds anywhere machine-readable, so the
# cents-per-dollar figure used for CA/TX/ID cannot be computed here, and we will not
# guess a price. Instead we use a PRICE-INDEPENDENT measure of the same idea:
#
#   value_index = (share of prize VALUE still unclaimed)
#                 / (share of PRIZES still unclaimed)
#
# 1.00 means the game still holds exactly the mix of prize money it launched with.
# Above 1.00 means an unusual amount of the big money is still out there; below 1.00
# means the large prizes have gone while the small ones remain. It answers "is this
# game better or worse than it started?" without needing the ticket price at all.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$UA = @{ 'User-Agent' = 'Mozilla/5.0 (compatible; NumbersIntel/1.0; +https://numbersintel.com)'; 'Accept' = 'application/json' }
$SRC = 'https://data.ny.gov/resource/nzqa-7unk.json?$limit=5000'

$rows = Invoke-RestMethod -Uri $SRC -Headers $UA -TimeoutSec 60
Write-Host "dataset rows: $($rows.Count)"

# Cash prizes parse as "$1,234". Annuity tiers ("$1,000/WEEK/LIFE") have no single
# cash value, so they're excluded from the value maths but reported as top prizes.
function CashAmt($s) { if ($s -match '^\$[\d,]+$') { [double](($s -replace '[^0-9]', '')) } else { $null } }

$games = New-Object System.Collections.ArrayList
foreach ($grp in ($rows | Group-Object game_number)) {
  $name = ($grp.Group[0].game_name -replace '\s+', ' ').Trim()
  if (-not $name) { continue }
  $cash = @($grp.Group | Where-Object { (CashAmt $_.prize_amount) -ne $null })
  if ($cash.Count -lt 3) { continue }

  $tiers = New-Object System.Collections.ArrayList
  $vTot = 0.0; $vRem = 0.0; $nTot = 0.0; $nRem = 0.0
  foreach ($t in $cash) {
    $a = CashAmt $t.prize_amount
    $tot = [double]$t.total; $un = [double]$t.unpaid
    if ($tot -le 0) { continue }
    if ($un -lt 0) { $un = 0 }; if ($un -gt $tot) { $un = $tot }
    $vTot += $a * $tot; $vRem += $a * $un; $nTot += $tot; $nRem += $un
    [void]$tiers.Add([pscustomobject]@{ prize = $a; original = [long]$tot; remaining = [long]$un; estimated = $false })
  }
  if ($vTot -le 0 -or $nTot -le 0 -or $nRem -le 0) { continue }

  $pctClaimed = 100.0 * (1 - $nRem / $nTot)
  $valueIndex = ($vRem / $vTot) / ($nRem / $nTot)
  $topTier = $tiers | Sort-Object prize -Descending | Select-Object -First 1
  # Annuity top prize, if the game has one (reported separately, not valued).
  $annuity = @($grp.Group | Where-Object { (CashAmt $_.prize_amount) -eq $null }) | Select-Object -First 1

  [void]$games.Add([pscustomobject]@{
    name = $name
    game_number = $grp.Name
    url = "https://nylottery.ny.gov/scratch-off-games"
    pct_sold = [math]::Round($pctClaimed, 1)          # share of prizes claimed
    value_index = [math]::Round($valueIndex, 3)
    prize_value_left = [long]$vRem
    prize_value_total = [long]$vTot
    top_prize = [long]$topTier.prize
    top_left = [long]$topTier.remaining
    top_original = [long]$topTier.original
    annuity_prize = $(if ($annuity) { $annuity.prize_amount } else { $null })
    annuity_left = $(if ($annuity) { [long]$annuity.unpaid } else { $null })
    top_share = $(if ($vRem -gt 0) { [math]::Round(($topTier.remaining * $topTier.prize) / $vRem, 3) } else { 0 })
    low_confidence = ($pctClaimed -gt 90)
    tiers = @($tiers | Sort-Object prize -Descending)
  })
}

$sorted = @($games | Sort-Object value_index -Descending)
$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  state = "NY"; state_name = "New York"; source = "data.ny.gov (Scratch-Off Game Daily Prize Status Report)"
  metric = "index"
  method = "New York publishes prizes printed, paid and unpaid for every tier of every scratch game, updated daily, but does not publish ticket prices or overall odds - so a cents-per-dollar figure cannot be computed here and we do not guess one. Instead the value index compares the share of prize VALUE still unclaimed against the share of PRIZES still unclaimed: 1.00 means the game holds exactly the mix of prize money it launched with, above 1.00 means unusually much of the big money is still out there, below 1.00 means the large prizes have gone. Annuity prizes (paid per week or per year for life) have no single cash value and are excluded from the value maths, though they are shown as top prizes. Games with more than 90% of prizes claimed are flagged: few prizes remain, so the index gets noisy."
  games = $sorted
}
$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "scratch_ny.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host ("scratch_ny.json: {0} games ({1} KB). index {2:N2}-{3:N2}; {4} flagged >90% claimed" -f `
  $sorted.Count, [math]::Round((Get-Item $path).Length/1kb,1), `
  ($sorted.value_index | Measure-Object -Minimum).Minimum, ($sorted.value_index | Measure-Object -Maximum).Maximum, `
  @($sorted | Where-Object { $_.low_confidence }).Count)

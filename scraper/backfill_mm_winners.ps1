# One-time backfill: enrich history/mega_millions.json with per-tier winner counts
# for the CURRENT matrix era ($5 ticket, 5/70 + 1/24, started 2025-04-04), from
# megamillions.com GetDrawDataByTickWithMatrix. Mirrors what scraper/mm_winners.py
# does in CI. Network must be foreground (bg PowerShell has no network here).
$ErrorActionPreference = "Stop"
$root = "C:\Users\13tmi\OneDrive\Desktop\Coding Projects\Lottery Project"
$ERA_START = [datetime]"2025-04-04"
$base = "https://www.megamillions.com/cmspages/utilservice.asmx/GetDrawDataByTickWithMatrix"
$hdr = @{ "User-Agent" = "Mozilla/5.0"; "Accept" = "application/json"; "Content-Type" = "application/json" }

# Tier index -> standard match label (current matrix)
$TIER_LABEL = @{ 0 = "5+MB"; 1 = "5"; 2 = "4+MB"; 3 = "4"; 4 = "3+MB"; 5 = "3"; 6 = "2+MB"; 7 = "1+MB"; 8 = "MB" }

$path = "$root\history\mega_millions.json"
$hist = Get-Content $path -Raw | ConvertFrom-Json
$enriched = 0; $skipped = 0; $minJ = [double]::MaxValue; $maxJ = 0

foreach ($d in $hist.draws) {
  $dt = [datetime]$d.date
  if ($dt -lt $ERA_START) { continue }
  if ($d.PSObject.Properties.Name -contains "total_winners" -and $d.total_winners) { $skipped++; continue }
  $tick = [string]$dt.Ticks
  try {
    $r = Invoke-RestMethod -Uri $base -Method Post -Body (@{ PlayDateTicks = $tick } | ConvertTo-Json) -Headers $hdr -TimeoutSec 30
    $o = if ($r.d) { if ($r.d -is [string]) { $r.d | ConvertFrom-Json } else { $r.d } } else { $r }
  } catch { Write-Host "  fetch fail $($d.date): $($_.Exception.Message.Split([char]10)[0])"; continue }
  if (-not $o.PrizeTiers) { Write-Host "  no tiers $($d.date)"; continue }

  # sum winners per tier across the built-in multipliers
  $sum = @{}
  foreach ($w in $o.PrizeTiers) { $t = [int]$w.Tier; if (-not $sum.ContainsKey($t)) { $sum[$t] = 0 }; $sum[$t] += [int]$w.Winners }
  # base prize per tier from the matrix (PrizeAmount = base, pre-multiplier)
  $prizeByTier = @{}; foreach ($pt in $o.PrizeMatrix.PrizeTiers) { $prizeByTier[[int]$pt.PrizeTier] = [double]$pt.PrizeAmount }

  $prizes = @()
  $total = 0
  for ($t = 0; $t -le 8; $t++) {
    if (-not $TIER_LABEL.ContainsKey($t)) { continue }
    $win = if ($sum.ContainsKey($t)) { $sum[$t] } else { 0 }
    $prizes += [ordered]@{ match = $TIER_LABEL[$t]; prize = [long]$prizeByTier[$t]; winners = [int]$win }
    if ($t -gt 0) { $total += $win }  # exclude jackpot from "total lower-tier winners" like PB? PB total_winners includes all; keep all here
  }
  $totalAll = ($sum.Values | Measure-Object -Sum).Sum

  $d | Add-Member -NotePropertyName prizes -NotePropertyValue $prizes -Force
  $d | Add-Member -NotePropertyName total_winners -NotePropertyValue ([int]$totalAll) -Force
  $jp = [double]$o.Jackpot.CurrentPrizePool
  if ($jp -gt 0) { if ($jp -lt $minJ) { $minJ = $jp }; if ($jp -gt $maxJ) { $maxJ = $jp } }
  $enriched++
  Start-Sleep -Milliseconds 150
}

$json = $hist | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host "ENRICHED $enriched draws (skipped $skipped already-done); jackpot range `$$([math]::Round($minJ/1e6))M - `$$([math]::Round($maxJ/1e6))M"
Write-Host "WROTE $path"

# Removes PHANTOM MONDAY DRAWS from powerball.json / lotto_america.json.
#
# Powerball added Monday drawings on 2021-08-23; Lotto America on 2022-07-18.
# The original history seed nonetheless created Monday rows for every earlier week,
# copying the preceding Saturday's numbers, jackpot AND per-tier winner counts.
# That inflated number-frequency stats (those balls counted twice) and duplicated
# rows in the split-risk sample. Every affected row is verifiably a copy of the
# previous draw, so they are deleted rather than corrected.
#
# Also repairs 2026-06-20, which copied 2026-06-17 during the scraper outage, using
# the lottery.net 2026 archive. DRY-RUN unless -Write.
param([switch]$Write)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

$GAMES = @(
  @{ game = "powerball";     mondayFrom = "2021-08-23"; special = "powerball"; bonus = "power_play";     url = "https://www.lottery.net/powerball/numbers/2026";     wmax = 69; smax = 26; doublePlay = $true }
  @{ game = "lotto_america"; mondayFrom = "2022-07-18"; special = "star_ball"; bonus = "all_star_bonus"; url = "https://www.lottery.net/lotto-america/numbers/2026"; wmax = 52; smax = 10; doublePlay = $false }
)
$MON = @{ January=1;February=2;March=3;April=4;May=5;June=6;July=7;August=8;September=9;October=10;November=11;December=12 }

foreach ($cfg in $GAMES) {
  $path = Join-Path $root "history\$($cfg.game).json"
  $hist = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
  $draws = @($hist.draws)
  $before = $draws.Count

  # 1) phantom Mondays: Monday-dated rows before the game actually drew on Mondays
  $keep = New-Object System.Collections.ArrayList
  $removed = 0
  foreach ($d in $draws) {
    $isEarlyMonday = ([datetime]$d.date).DayOfWeek -eq 'Monday' -and $d.date -lt $cfg.mondayFrom
    if ($isEarlyMonday) { $removed++; continue }
    [void]$keep.Add($d)
  }

  # 2) repair any remaining row that still duplicates its predecessor, from lottery.net
  $fixed = 0
  $arr = @($keep)
  $dupDates = @()
  for ($i = 1; $i -lt $arr.Count; $i++) {
    if (($arr[$i].numbers -join ',') -eq ($arr[$i-1].numbers -join ',')) { $dupDates += $arr[$i].date }
  }
  if ($dupDates.Count) {
    $html = (Invoke-WebRequest -Uri $cfg.url -Headers @{'User-Agent'='Mozilla/5.0'} -UseBasicParsing -TimeoutSec 40).Content
    $real = @{}
    foreach ($r in [regex]::Matches($html, '(?s)<tr[^>]*>(.*?)</tr>')) {
      $t = (($r.Groups[1].Value -replace '<[^>]+>', ' ') -replace '\s+', ' ').Trim()
      $dm = [regex]::Match($t, '(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(2026)')
      if (-not $dm.Success) { continue }
      $iso = "{0:0000}-{1:00}-{2:00}" -f 2026, $MON[$dm.Groups[1].Value], [int]$dm.Groups[2].Value
      $after = $t.Substring($dm.Index + $dm.Length)
      if ($cfg.doublePlay) { $after = ($after -split 'Double Play')[0] }
      $nums = [regex]::Matches($after, '\d+') | ForEach-Object { [int]$_.Value }
      if ($nums.Count -lt 7) { continue }
      $w = $nums[1..5]; $s = $nums[6]
      if (($w | Where-Object { $_ -lt 1 -or $_ -gt $cfg.wmax }).Count -gt 0) { continue }
      if ($s -lt 1 -or $s -gt $cfg.smax) { continue }
      $real[$iso] = @{ w = $w; s = $s }
    }
    foreach ($dt in $dupDates) {
      if (-not $real.ContainsKey($dt)) { Write-Host "  ! $($cfg.game) $dt duplicate but no source row; left as-is"; continue }
      $row = $arr | Where-Object { $_.date -eq $dt } | Select-Object -First 1
      $row.numbers = @($real[$dt].w)
      $row.$($cfg.special) = $real[$dt].s
      $fixed++
    }
  }

  Write-Host ("{0}: {1} rows -> {2} (removed {3} phantom Mondays, repaired {4} duplicate rows)" -f `
    $cfg.game, $before, $arr.Count, $removed, $fixed)

  if ($Write) {
    $hist.draws = @($arr | Sort-Object date)
    $hist.last_updated = (Get-Date -Format 'yyyy-MM-dd')
    $json = $hist | ConvertTo-Json -Depth 12
    [System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "  WROTE $path"
  }
}

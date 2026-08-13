# One-time gap backfill for Powerball + Lotto America history (frozen June 22 2026 when
# lotteryusa changed its date markup). Source: lottery.net year archive (full 2026).
# Adds only draws whose date is missing from our history. BOM-free write. DRY-RUN unless -Write.
param([switch]$Write)
$ErrorActionPreference = "Stop"
$root = "C:\Users\13tmi\OneDrive\Desktop\Coding Projects\Lottery Project"
$MON = @{ January=1;February=2;March=3;April=4;May=5;June=6;July=7;August=8;September=9;October=10;November=11;December=12 }
$today = Get-Date

$GAMES = @(
  @{ game="powerball";     url="https://www.lottery.net/powerball/numbers/2026";     special="powerball";  bonus="power_play";      doublePlay=$true  }
  @{ game="lotto_america"; url="https://www.lottery.net/lotto-america/numbers/2026"; special="star_ball";  bonus="all_star_bonus";  doublePlay=$false }
)

foreach ($cfg in $GAMES) {
  $html = (Invoke-WebRequest -Uri $cfg.url -Headers @{'User-Agent'='Mozilla/5.0'} -UseBasicParsing -TimeoutSec 40).Content
  $rows = [regex]::Matches($html, '(?s)<tr[^>]*>(.*?)</tr>')
  $parsed = @()
  foreach ($r in $rows) {
    $t = (($r.Groups[1].Value -replace '<[^>]+>', ' ') -replace '\s+', ' ').Trim()
    $dm = [regex]::Match($t, '(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(2026)')
    if (-not $dm.Success) { continue }
    $iso = "{0:0000}-{1:00}-{2:00}" -f 2026, $MON[$dm.Groups[1].Value], [int]$dm.Groups[2].Value
    # everything after the date, before any "Double Play"
    $after = $t.Substring($dm.Index + $dm.Length)
    if ($cfg.doublePlay) { $after = ($after -split 'Double Play')[0] }
    $nums = [regex]::Matches($after, '\d+') | ForEach-Object { [int]$_.Value }
    # tokens = [drawNumber, w1..w5, special, (bonus)]
    if ($nums.Count -lt 7) { continue }
    $whites = $nums[1..5]
    $special = $nums[6]
    $bonus = if ($nums.Count -ge 8) { $nums[7] } else { $null }
    # sanity: 5 whites in range, special in range
    $wmax = if ($cfg.game -eq 'powerball') { 69 } else { 52 }
    $smax = if ($cfg.game -eq 'powerball') { 26 } else { 10 }
    if (($whites | Where-Object { $_ -lt 1 -or $_ -gt $wmax }).Count -gt 0) { continue }
    if ($special -lt 1 -or $special -gt $smax) { continue }
    $parsed += [pscustomobject]@{ date=$iso; whites=$whites; special=$special; bonus=$bonus }
  }

  $hp = "$root\history\$($cfg.game).json"
  $hist = Get-Content $hp -Raw -Encoding UTF8 | ConvertFrom-Json
  $have = @{}; foreach ($d in $hist.draws) { $have[$d.date] = $true }
  $lastHave = ($hist.draws.date | Sort-Object)[-1]
  $new = $parsed | Where-Object { -not $have.ContainsKey($_.date) -and ([datetime]$_.date) -le $today } | Sort-Object date
  Write-Host ("{0}: parsed {1} from lottery.net; history last={2}; NEW to add={3}" -f $cfg.game, $parsed.Count, $lastHave, @($new).Count)
  if (@($new).Count) {
    Write-Host ("  range: {0} .. {1}" -f $new[0].date, $new[-1].date)
    $new | Select-Object -First 2 | ForEach-Object { "    $($_.date): $($_.whites -join ',') | $($cfg.special)=$($_.special) $($cfg.bonus)=$($_.bonus)" }
  }

  if ($Write -and @($new).Count) {
    $drawsList = New-Object System.Collections.ArrayList
    foreach ($d in $hist.draws) { [void]$drawsList.Add($d) }
    foreach ($p in $new) {
      $obj = [ordered]@{ date=$p.date; numbers=@($p.whites); $cfg.special=$p.special }
      if ($null -ne $p.bonus) { $obj[$cfg.bonus] = $p.bonus }
      [void]$drawsList.Add([pscustomobject]$obj)
    }
    $sorted = $drawsList | Sort-Object date
    $hist.draws = @($sorted)
    $hist.last_updated = (Get-Date -Format 'yyyy-MM-dd')
    $json = $hist | ConvertTo-Json -Depth 12
    [System.IO.File]::WriteAllText($hp, $json, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "  WROTE $hp (now $(@($hist.draws).Count) draws)"
  }
}

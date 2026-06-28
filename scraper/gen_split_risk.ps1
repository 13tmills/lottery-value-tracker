# Local generator for data/split_risk.json (validated mirror of scraper/split_risk.py).
# Backs out estimated tickets-in-play per draw by inverting published fixed-tier odds
# against reported lower-tier winners, then bands by jackpot for the upcoming projection.
$ErrorActionPreference = "Stop"
$root = "C:\Users\13tmi\OneDrive\Desktop\Coding Projects\Lottery Project"

$GAMES = @{
  powerball = @{
    label = "Powerball"; jackpot_odds = 292201338; ticket_price = 2; jackpot_match = "5+PB"
    odds = @{ "5"=11688053.52;"4+PB"=913129.18;"4"=36525.17;"3+PB"=14494.11;"3"=579.76;"2+PB"=701.33;"1+PB"=91.98;"PB"=38.32 }
    stable = @("PB","1+PB","3","2+PB","3+PB","4")
    edges = @(0,50,100,150,200,300,400,600,800,1000,1500,999999)  # $M
  }
  lotto_america = @{
    label = "Lotto America"; jackpot_odds = 25989600; ticket_price = 1; jackpot_match = "5+SB"
    odds = @{ "5"=2887733.0;"4+SB"=110594.0;"4"=12288.0;"3+SB"=2404.0;"3"=267.0;"2+SB"=160.0;"1+SB"=29.0;"SB"=17.0 }
    stable = @("SB","1+SB","3","2+SB","3+SB")
    edges = @(0,5,10,15,20,25,30,40,999999)  # $M
  }
}

function Poisson-Win([double]$lam) { 1 - [math]::Exp(-$lam) }
function Poisson-Split([double]$lam) { $pw = 1 - [math]::Exp(-$lam); if ($pw -le 0) { return 0 } ; 1 - ($lam * [math]::Exp(-$lam)) / $pw }
function Round-Lines([double]$n) { [math]::Round($n / 100000.0) * 100000 }

$data = Get-Content "$root\data.json" -Raw | ConvertFrom-Json
$out = [ordered]@{
  updated = (Get-Date -Format "yyyy-MM-dd")
  method  = "Tickets in play are estimated for each past draw by inverting the game's published fixed-tier odds against the number of lower-tier winners the lottery reported (winners x odds = tickets), taking the median across the stable tiers. Win and split probabilities use a Poisson model on those tickets. The upcoming-draw figure is the historical median for past draws in the same jackpot band - a descriptive benchmark, not a prediction; every draw is independent."
  note    = "Estimates, not official sales. Powerball and Lotto America only (the games that publish per-tier winner counts)."
  games   = [ordered]@{}
}

foreach ($key in @("powerball","lotto_america")) {
  $cfg = $GAMES[$key]
  $hist = Get-Content "$root\history\$key.json" -Raw | ConvertFrom-Json
  $Jodds = [double]$cfg.jackpot_odds

  $series = New-Object System.Collections.ArrayList
  foreach ($d in $hist.draws) {
    if (-not $d.total_winners) { continue }
    $ests = @()
    $jwon = $false
    foreach ($t in $d.prizes) {
      if ($t.match -eq $cfg.jackpot_match -and $t.winners -gt 0) { $jwon = $true }
      if (($cfg.stable -contains $t.match) -and $cfg.odds.ContainsKey($t.match) -and $t.winners -gt 0) {
        $ests += [double]$t.winners * [double]$cfg.odds[$t.match]
      }
    }
    if ($ests.Count -lt 3) { continue }
    $s = $ests | Sort-Object
    $L = [double]$s[[int][math]::Floor($s.Count / 2)]
    if ($d.jackpot -le 0 -or $L -le 0) { continue }
    $lam = $L / $Jodds
    [void]$series.Add([pscustomobject]@{
      date = $d.date; jackpot = [long]$d.jackpot; est_lines = [long](Round-Lines $L)
      p_win = [math]::Round((Poisson-Win $lam), 4); p_split = [math]::Round((Poisson-Split $lam), 4)
      won = [int]$jwon
    })
  }
  $series = $series | Sort-Object date

  # jackpot bands -> median lines
  $bands = New-Object System.Collections.ArrayList
  for ($i = 0; $i -lt $cfg.edges.Count - 1; $i++) {
    $lo = [double]$cfg.edges[$i] * 1e6; $hi = [double]$cfg.edges[$i+1] * 1e6
    $inb = $series | Where-Object { $_.jackpot -ge $lo -and $_.jackpot -lt $hi }
    if (-not $inb -or @($inb).Count -eq 0) { continue }
    $ls = @($inb.est_lines | Sort-Object)
    $med = [double]$ls[[int][math]::Floor($ls.Count / 2)]
    $lam = $med / $Jodds
    [void]$bands.Add([ordered]@{
      lo_m = $cfg.edges[$i]; hi_m = $cfg.edges[$i+1]; n = @($inb).Count
      median_lines = [long]$med; p_win = [math]::Round((Poisson-Win $lam), 4); p_split = [math]::Round((Poisson-Split $lam), 4)
    })
  }

  # upcoming projection from current jackpot
  $node = $data.games.$key
  $curJ = [double]$node.jackpot
  $band = $null
  foreach ($b in $bands) { if ($curJ -ge $b.lo_m * 1e6 -and $curJ -lt $b.hi_m * 1e6) { $band = $b; break } }
  $upcoming = $null
  if ($band) {
    $upcoming = [ordered]@{
      draw_date = $node.next_draw; jackpot = [long]$curJ
      band = ("`${0}M-`${1}M" -f $band.lo_m, $band.hi_m)
      est_lines = [long]$band.median_lines; p_win = $band.p_win; p_split_if_won = $band.p_split; band_n = $band.n
    }
  }

  $latest = $series | Select-Object -Last 1
  # compact scatter for the chart: [jackpot $M (1dp), tickets $M (2dp), won 0/1]
  $scatter = foreach ($r in $series) {
    , @([math]::Round($r.jackpot / 1e6, 1), [math]::Round($r.est_lines / 1e6, 2), $r.won)
  }
  # recent draws (newest first) for the table
  $recent = $series | Select-Object -Last 30 | Sort-Object date -Descending

  $out.games[$key] = [ordered]@{
    label = $cfg.label; jackpot_odds = [long]$cfg.jackpot_odds; ticket_price = $cfg.ticket_price
    draws_analyzed = @($series).Count
    upcoming = $upcoming
    latest_actual = [ordered]@{
      date = $latest.date; jackpot = $latest.jackpot; est_lines = $latest.est_lines
      p_win = $latest.p_win; p_split_if_won = $latest.p_split; jackpot_won = [bool]$latest.won
    }
    bands = $bands
    scatter = @($scatter)
    recent = @($recent)
  }
  Write-Host ("{0}: {1} draws, upcoming `${2:N0} band {3} -> {4:N1}M tickets, P(win) {5:P1}" -f $cfg.label, @($series).Count, $curJ, $(if($band){"$($band.lo_m)-$($band.hi_m)"}else{"n/a"}), $(if($band){$band.median_lines/1e6}else{0}), $(if($band){$band.p_win}else{0}))
}

$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = "$root\split_risk.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
Write-Host "WROTE $path ($([math]::Round((Get-Item $path).Length/1kb)) KB)"

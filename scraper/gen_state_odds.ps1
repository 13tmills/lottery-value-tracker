# Builds state_odds.json — for each US jurisdiction, the game with the MOST WINNABLE
# top prize (lowest 1-in-N odds) plus that state's full game list. Source is the
# published number matrices already in game_meta.json (exported GAME_META); no
# invented data. Path-relative so it runs locally and in CI via pwsh.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$meta = Get-Content (Join-Path $root "game_meta.json") -Raw -Encoding UTF8 | ConvertFrom-Json

# Top-prize odds = the rarest tier the game publishes, taken from whichever field
# that game's config uses (jackpot games, fixed-prize games and digit games differ).
function TopOdds($m) {
  $c = @()
  if ($m.ev -and $m.ev.odds_jackpot) { $c += [double]$m.ev.odds_jackpot }
  if ($m.oddsJackpot) { $c += [double]$m.oddsJackpot }
  if ($m.ev -and $m.ev.levels) {
    $v = @($m.ev.levels.PSObject.Properties.Value.odds | Where-Object { $_ })
    if ($v) { $c += [double]($v | Measure-Object -Maximum).Maximum }
  }
  if ($m.prizes -and $m.prizes.odds) {
    $v = @($m.prizes.odds.PSObject.Properties.Value | Where-Object { $_ })
    if ($v) { $c += [double]($v | Measure-Object -Maximum).Maximum }
  }
  if ($m.viz -and $m.viz.tiers) {
    $v = @($m.viz.tiers.odds | Where-Object { $_ })
    if ($v) { $c += [double]($v | Measure-Object -Maximum).Maximum }
  }
  if ($c.Count) { ($c | Measure-Object -Minimum).Minimum } else { $null }
}

$byState = @{}
foreach ($p in $meta.PSObject.Properties) {
  $key = $p.Name; $m = $p.Value
  if (-not $m.state -or -not $m.stateName) { continue }
  if ($m.currency -eq 'GBP') { continue }          # UK games aren't part of the US map
  $o = TopOdds $m
  if (-not $o) { continue }
  $ab = $m.state
  if (-not $byState.ContainsKey($ab)) {
    $byState[$ab] = [ordered]@{ state = $ab; name = $m.stateName; games = New-Object System.Collections.ArrayList }
  }
  # NOTE: pscustomobject, not [ordered]@{} — Sort-Object can't read keys off an
  # OrderedDictionary in PS 5.1, so sorting by .odds would silently no-op.
  [void]$byState[$ab].games.Add([pscustomobject]@{
    key = $key; label = $m.label; odds = [long][math]::Round($o)
    price = $(if ($m.ticketPrice) { $m.ticketPrice } else { "" })
  })
}

$out = [ordered]@{
  updated = (Get-Date -Format 'yyyy-MM-dd')
  note = "For each jurisdiction, the state-run game whose top prize is the most winnable (lowest 1-in-N odds), computed from each game's published number matrix. Excludes the national multi-state games, which are identical everywhere."
  states = [ordered]@{}
}
foreach ($ab in ($byState.Keys | Sort-Object)) {
  $games = @($byState[$ab].games | Sort-Object odds)
  $out.states[$ab] = [ordered]@{
    name = $byState[$ab].name
    best = $games[0]
    count = $games.Count
    games = @($games | Select-Object -First 8)
  }
}

$json = $out | ConvertTo-Json -Depth 8 -Compress
$path = Join-Path $root "state_odds.json"
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
$all = @($out.states.Values.best.odds)
Write-Host ("state_odds.json: {0} jurisdictions, best 1 in {1:N0}, worst 1 in {2:N0} ({3} KB)" -f `
  $out.states.Count, ($all | Measure-Object -Minimum).Minimum, ($all | Measure-Object -Maximum).Maximum, [math]::Round((Get-Item $path).Length/1kb,1))

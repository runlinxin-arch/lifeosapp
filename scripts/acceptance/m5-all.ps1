# M5 full regression: run the M5 settings-page E2E against a SCRATCH data dir and a fresh app process.
# The app data dir is redirected through LIFEOS_DATA_DIR, so the real %APPDATA%\LifeOS is never touched.
# ASCII-only on purpose: Windows PowerShell reads BOM-less .ps1 as ANSI, which mangles non-ASCII.
#
# Safety contract (same as m4-all.ps1):
#   1. This runner NEVER kills processes it did not start.
#   2. If port 9222 already serves a CDP endpoint, the runner aborts instead of hijacking a foreign app.
#   3. Fixed sleeps replaced by state waits (CDP ready / CDP gone).
#   4. The app is started with --user-data-dir=<scratch>\profile, so nothing outside the scratch tree is written.
#   5. Each stage runs under a hard 120s timeout; a hang is marked INVALID (-1/-1).
$ErrorActionPreference = 'Continue'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$root = $PWD.Path
$realDb = Join-Path $env:APPDATA 'LifeOS\app.db'
$realImages = Join-Path $env:APPDATA 'LifeOS\images'
$realPrefs = Join-Path $env:APPDATA 'LifeOS\Preferences'

function Get-DbFingerprint([string]$p) {
  if (Test-Path $p) {
    $i = Get-Item $p
    return "$($i.Length)|$($i.LastWriteTimeUtc.ToString('o'))"
  }
  return 'absent'
}

function Test-CdpAlive {
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:9222/json/version' -TimeoutSec 2 -UseBasicParsing
    return ($r.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Wait-CdpReady([int]$timeoutSec = 40) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-CdpAlive) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Wait-CdpGone([int]$timeoutSec = 20) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (-not (Test-CdpAlive)) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Test-ProcessAlive($proc) {
  if ($null -eq $proc) { return $false }
  return [bool](Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)
}

function Stop-OwnApp($proc) {
  if ($null -eq $proc) { return }
  $t0 = $null
  try { $t0 = $proc.StartTime } catch { }
  if (Test-ProcessAlive $proc) {
    & taskkill /PID $proc.Id /T /F 2>&1 | Out-Null
  }
  for ($i = 0; $i -lt 40; $i++) {
    $left = 0
    if ($null -ne $t0) {
      $left = @(Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -ge $t0.AddSeconds(-1) }).Count
    }
    if ($left -eq 0) { break }
    Start-Sleep -Milliseconds 250
  }
}

if (Test-CdpAlive) {
  Write-Output "ABORT: port 9222 already serves a DevTools endpoint."
  Write-Output "       Close that app (or wait for it to exit) and run this script again."
  exit 3
}

$foreign = @(Get-Process -Name electron,LifeOS -ErrorAction SilentlyContinue)
if ($foreign.Count -gt 0) {
  Write-Output "NOTE: $($foreign.Count) electron/LifeOS process(es) already running (PIDs: $(($foreign | ForEach-Object { $_.Id }) -join ', '))."
  Write-Output "      They were NOT started by this runner, so they will NOT be killed."
  Write-Output ""
}

$realDbBefore = Get-DbFingerprint $realDb
$realProfileBefore = Get-DbFingerprint $realPrefs
$realImgBefore = if (Test-Path $realImages) { (Get-ChildItem $realImages -File -ErrorAction SilentlyContinue | Measure-Object).Count } else { 'absent' }

$scratch = Join-Path $env:TEMP ('lifeos-m5-e2e-' + ([guid]::NewGuid().ToString('N').Substring(0, 8)))
New-Item -ItemType Directory -Force -Path $scratch | Out-Null
$env:LIFEOS_DATA_DIR = $scratch
Write-Output "SCRATCH DATA DIR (app data goes here): $scratch"
Write-Output "REAL DB (must stay untouched)        : $realDb"
Write-Output ""

$stages = @(
  @{ name = 'M5-1 settings'; script = 'scripts\acceptance\m5-1-e2e.mjs' }
)

$summary = @()

foreach ($s in $stages) {
  & node --check $s.script 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Output "SYNTAX ERROR in $($s.script) -- aborting before touching anything."
    & node --check $s.script
    exit 1
  }
}
Write-Output "PRE-FLIGHT: all stage scripts parse OK"
Write-Output ""

foreach ($s in $stages) {
  Write-Output "================================================================="
  Write-Output "  STAGE: $($s.name)"
  Write-Output "================================================================="

  Get-ChildItem -LiteralPath $scratch -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

  $appProc = Start-Process -FilePath 'node_modules\electron\dist\electron.exe' -ArgumentList '.', '--remote-debugging-port=9222', "--user-data-dir=$scratch\profile" `
    -RedirectStandardOutput "$root\.reg-out.log" -RedirectStandardError "$root\.reg-err.log" -WorkingDirectory $root -PassThru

  if (-not (Wait-CdpReady 40)) {
    Write-Output "  APP DID NOT COME UP: no CDP endpoint on 9222 -- stage marked INVALID"
    $summary += [pscustomobject]@{ Stage = $s.name; Pass = -1; Total = -1 }
    Stop-OwnApp $appProc
    Write-Output ""
    continue
  }

  $nodeOut = Join-Path $env:TEMP ('node-out-' + [guid]::NewGuid().ToString('N') + '.log')
  $nodeErr = Join-Path $env:TEMP ('node-err-' + [guid]::NewGuid().ToString('N') + '.log')
  $n = Start-Process -FilePath 'node' -ArgumentList $s.script -RedirectStandardOutput $nodeOut -RedirectStandardError $nodeErr -WorkingDirectory $root -PassThru
  $finished = $n.WaitForExit(120000)
  if (-not $finished) {
    & taskkill /PID $n.Id /T /F 2>&1 | Out-Null
    Write-Output "  STAGE TIMED OUT (120s) -- marked INVALID, NOT a pass"
    $summary += [pscustomobject]@{ Stage = $s.name; Pass = -1; Total = -1 }
  } else {
    $out = Get-Content -LiteralPath $nodeOut -Encoding UTF8 -Raw -ErrorAction SilentlyContinue
    if ($null -eq $out) { $out = '' }
    ($out -split "`r?`n") | Select-String -Pattern 'PASS|FAIL' | ForEach-Object { "  $_" }
    $hit = ([regex]::Matches($out, '=====\s*(\d+)/(\d+)'))
    if ($hit.Count -gt 0) {
      $summary += [pscustomobject]@{ Stage = $s.name; Pass = [int]$hit[0].Groups[1].Value; Total = [int]$hit[0].Groups[2].Value }
    } else {
      $summary += [pscustomobject]@{ Stage = $s.name; Pass = -1; Total = -1 }
    }
  }
  Remove-Item -LiteralPath $nodeOut, $nodeErr -Force -ErrorAction SilentlyContinue

  Stop-OwnApp $appProc
  if (-not (Wait-CdpGone 20)) {
    Write-Output "  WARNING: CDP endpoint 9222 still alive after stopping our app -- next stage may be invalid"
  }
  Write-Output ""
}

Write-Output "================================================================="
Write-Output "  M5 FULL REGRESSION SUMMARY"
Write-Output "================================================================="
$summary | Format-Table -AutoSize
$tp = ($summary | Measure-Object -Property Pass -Sum).Sum
$tt = ($summary | Measure-Object -Property Total -Sum).Sum
$crashed = ($summary | Where-Object { $_.Pass -lt 0 }).Count
if ($crashed -gt 0) {
  Write-Output "TOTAL: INVALID -- $crashed stage(s) produced no summary (crashed / timed out / refused to run). Do NOT read this as a pass."
} else {
  Write-Output "TOTAL: $tp / $tt"
}
Write-Output ""

$realDbAfter = Get-DbFingerprint $realDb
$realImgAfter = if (Test-Path $realImages) { (Get-ChildItem $realImages -File -ErrorAction SilentlyContinue | Measure-Object).Count } else { 'absent' }
$scratchDb = Join-Path $scratch 'app.db'

if ($realDbAfter -eq $realDbBefore -and $realImgAfter -eq $realImgBefore) {
  Write-Output "REAL DATA UNTOUCHED: OK (db=$realDbAfter, images=$realImgAfter)"
} else {
  Write-Output "REAL DATA CHANGED! db: $realDbBefore -> $realDbAfter ; images: $realImgBefore -> $realImgAfter"
}
if (Test-Path $scratchDb) {
  Write-Output "SCRATCH DB CREATED: $scratchDb ($((Get-Item $scratchDb).Length) bytes)"
} else {
  Write-Output "SCRATCH DB MISSING: $scratchDb (LIFEOS_DATA_DIR override may not be working)"
}

$realProfileAfter = Get-DbFingerprint $realPrefs
if ($realProfileAfter -eq $realProfileBefore) {
  Write-Output "REAL CHROMIUM PROFILE UNTOUCHED: OK ($realProfileBefore)"
} else {
  Write-Output "NOTE: real Chromium profile changed during this run (expected only if your own LifeOS window was open)."
}

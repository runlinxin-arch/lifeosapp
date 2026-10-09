# M4 full regression: run every M4 stage E2E against a SCRATCH data dir and a fresh app process.
# The app data dir is redirected through LIFEOS_DATA_DIR, so the real %APPDATA%\LifeOS is never touched.
# ASCII-only on purpose: Windows PowerShell reads BOM-less .ps1 as ANSI, which mangles non-ASCII.
$ErrorActionPreference = 'Continue'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$root = $PWD.Path
$realDb = Join-Path $env:APPDATA 'LifeOS\app.db'
$realImages = Join-Path $env:APPDATA 'LifeOS\images'

function Get-DbFingerprint([string]$p) {
  if (Test-Path $p) {
    $i = Get-Item $p
    return "$($i.Length)|$($i.LastWriteTimeUtc.ToString('o'))"
  }
  return 'absent'
}
$realDbBefore = Get-DbFingerprint $realDb
$realImgBefore = if (Test-Path $realImages) { (Get-ChildItem $realImages -File -ErrorAction SilentlyContinue | Measure-Object).Count } else { 'absent' }

$scratch = Join-Path $env:TEMP ('lifeos-e2e-' + ([guid]::NewGuid().ToString('N').Substring(0, 8)))
New-Item -ItemType Directory -Force -Path $scratch | Out-Null
$env:LIFEOS_DATA_DIR = $scratch
Write-Output "SCRATCH DATA DIR (app data goes here): $scratch"
Write-Output "REAL DB (must stay untouched)        : $realDb"
Write-Output ""

$stages = @(
  @{ name = 'M4-1 fitness';       script = 'scripts\acceptance\m4-1-e2e.mjs' },
  @{ name = 'M4-2 diet';          script = 'scripts\acceptance\m4-2-e2e.mjs' },
  @{ name = 'M4-3 entertainment'; script = 'scripts\acceptance\m4-3-e2e.mjs' },
  @{ name = 'M4-4 today cards';   script = 'scripts\acceptance\m4-4-e2e.mjs' },
  @{ name = 'M4-midnight forms';  script = 'scripts\acceptance\m4-midnight-e2e.mjs' }
)

$summary = @()

# Pre-flight: syntax-check every stage script, so a broken script fails loudly
# instead of silently contributing 0/0 to the total.
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

  Get-Process -Name electron,LifeOS -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2

  # Fresh scratch data for every stage (no cleanSql needed: the whole dir is wiped)
  Get-ChildItem -LiteralPath $scratch -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

  Start-Process -FilePath 'node_modules\electron\dist\electron.exe' -ArgumentList '.', '--remote-debugging-port=9222' `
    -RedirectStandardOutput "$root\.reg-out.log" -RedirectStandardError "$root\.reg-err.log" -WorkingDirectory $root | Out-Null
  Start-Sleep -Seconds 12

  $out = & node $s.script 2>&1
  $out | Select-String -Pattern 'PASS|FAIL' | ForEach-Object { "  $_" }
  $out | Select-String -Pattern '拒绝运行' | ForEach-Object { "  $_" }
  $hit = ($out | Select-String -Pattern '=====\s*(\d+)/(\d+)').Matches
  if ($hit.Count -gt 0) {
    $summary += [pscustomobject]@{ Stage = $s.name; Pass = [int]$hit[0].Groups[1].Value; Total = [int]$hit[0].Groups[2].Value }
  } else {
    $summary += [pscustomobject]@{ Stage = $s.name; Pass = -1; Total = -1 }
  }
  Write-Output ""
}

Get-Process -Name electron,LifeOS -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Output "================================================================="
Write-Output "  M4 FULL REGRESSION SUMMARY"
Write-Output "================================================================="
$summary | Format-Table -AutoSize
$tp = ($summary | Measure-Object -Property Pass -Sum).Sum
$tt = ($summary | Measure-Object -Property Total -Sum).Sum
$crashed = ($summary | Where-Object { $_.Pass -lt 0 }).Count
if ($crashed -gt 0) {
  Write-Output "TOTAL: INVALID -- $crashed stage(s) produced no summary (crashed / refused to run). Do NOT read this as a pass."
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

# M4 full regression: run every M4 stage E2E against a clean DB and a fresh app process.
# ASCII-only on purpose: Windows PowerShell reads BOM-less .ps1 as ANSI, which mangles non-ASCII.
$ErrorActionPreference = 'Continue'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$db = Join-Path $env:APPDATA 'LifeOS\app.db'
$root = $PWD.Path

$cleanSql = "DELETE FROM workout_logs; DELETE FROM workout_plans; DELETE FROM body_metrics;" +
            "DELETE FROM meals; DELETE FROM meal_plans;" +
            "DELETE FROM plays; DELETE FROM wishlist; DELETE FROM media;"
# NOTE: wishlist table is legacy (feature removed on 2026-10-09 by user request).
# The table and its v8 migration are kept untouched; this DELETE only clears E2E leftovers.

$stages = @(
  @{ name = 'M4-1 fitness';       script = 'scripts\acceptance\m4-1-e2e.mjs' },
  @{ name = 'M4-2 diet';          script = 'scripts\acceptance\m4-2-e2e.mjs' },
  @{ name = 'M4-3 entertainment'; script = 'scripts\acceptance\m4-3-e2e.mjs' },
  @{ name = 'M4-4 today cards';   script = 'scripts\acceptance\m4-4-e2e.mjs' }
)

$summary = @()

foreach ($s in $stages) {
  Write-Output "================================================================="
  Write-Output "  STAGE: $($s.name)"
  Write-Output "================================================================="

  Get-Process -Name electron,LifeOS -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2

  & node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec(process.argv[2]);db.close()" $db $cleanSql 2>&1 | Out-Null

  Start-Process -FilePath 'node_modules\electron\dist\electron.exe' -ArgumentList '.', '--remote-debugging-port=9222' `
    -RedirectStandardOutput "$root\.reg-out.log" -RedirectStandardError "$root\.reg-err.log" -WorkingDirectory $root | Out-Null
  Start-Sleep -Seconds 12

  $out = & node $s.script 2>&1
  $out | Select-String -Pattern 'PASS|FAIL' | ForEach-Object { "  $_" }
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
Write-Output "TOTAL: $tp / $tt"

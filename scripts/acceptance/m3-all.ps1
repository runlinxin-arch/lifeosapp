# M3 full regression: run every stage E2E against a clean DB and a fresh app process.
# ASCII-only on purpose: Windows PowerShell reads BOM-less .ps1 as ANSI, which mangles non-ASCII.
$ErrorActionPreference = 'Continue'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$db = Join-Path $env:APPDATA 'LifeOS\app.db'
$imgDir = Join-Path $env:APPDATA 'LifeOS\images'
$root = $PWD.Path

$cleanSql = "DELETE FROM tasks; DELETE FROM long_tasks; DELETE FROM events;" +
            "DELETE FROM learn_notes; DELETE FROM learn_sessions; DELETE FROM learn_items;" +
            "DELETE FROM tech_notes; DELETE FROM snippets; DELETE FROM bugs;" +
            "DELETE FROM dev_sessions; DELETE FROM dev_tasks; DELETE FROM projects;" +
            "DELETE FROM inspirations; DELETE FROM inspiration_boards;"

$stages = @(
  @{ name = 'M3-1 learning';    script = 'scripts\acceptance\m3-1-e2e.mjs' },
  @{ name = 'M3-2 dev';         script = 'scripts\acceptance\m3-2-e2e.mjs' },
  @{ name = 'M3-3 inspiration'; script = 'scripts\acceptance\m3-3-e2e.mjs' },
  @{ name = 'M3-4 today';       script = 'scripts\acceptance\m3-4-e2e.mjs' }
)

$summary = @()

foreach ($s in $stages) {
  Write-Output "================================================================="
  Write-Output "  STAGE: $($s.name)"
  Write-Output "================================================================="

  Get-Process -Name electron,LifeOS -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2

  & node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec(process.argv[2]);db.close()" $db $cleanSql 2>&1 | Out-Null
  if (Test-Path $imgDir) { Get-ChildItem $imgDir -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue }

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
Write-Output "  M3 FULL REGRESSION SUMMARY"
Write-Output "================================================================="
$summary | Format-Table -AutoSize
$tp = ($summary | Measure-Object -Property Pass -Sum).Sum
$tt = ($summary | Measure-Object -Property Total -Sum).Sum
Write-Output "TOTAL: $tp / $tt"

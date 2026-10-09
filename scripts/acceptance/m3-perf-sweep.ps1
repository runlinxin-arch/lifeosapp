# 多规模性能扫描：对每个 scale 重新播种、重启应用、跑测量，抽取关键指标
$ErrorActionPreference = 'Continue'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$root = $PWD.Path

$scales = @(1, 3, 5)
$rows = @()

foreach ($s in $scales) {
  Write-Output "================================================================="
  Write-Output "  SCALE = $s"
  Write-Output "================================================================="

  Get-Process -Name electron,LifeOS -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2
  $imgDir = Join-Path $env:APPDATA 'LifeOS\images'
  if (Test-Path $imgDir) { Get-ChildItem $imgDir -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue }

  & node scripts\dev\seed-perf-data.mjs $s 2>&1 | Select-String -Pattern '播种完成|inspirations|dev_tasks|learn_items|learn_sessions|inspiration_images' | ForEach-Object { "  $_" }

  Start-Process -FilePath 'node_modules\electron\dist\electron.exe' -ArgumentList '.', '--remote-debugging-port=9222' `
    -RedirectStandardOutput "$root\.app-out.log" -RedirectStandardError "$root\.app-err.log" -WorkingDirectory $root | Out-Null
  Start-Sleep -Seconds 12

  & node scripts\acceptance\m3-perf.mjs 2>&1 | Tee-Object -FilePath "$root\.perf-scale$s.log" | Select-String -Pattern 'ms |MB|每帧' | ForEach-Object { "  $_" }

  $rows += [pscustomobject]@{ Scale = $s; Log = ".perf-scale$s.log" }
  Write-Output ""
}

Get-Process -Name electron,LifeOS -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Output "完成的规模: $($scales -join ', ')"

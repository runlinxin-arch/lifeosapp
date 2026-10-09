# Put a distinctive test bitmap on the Windows clipboard so Ctrl+V has something to paste.
# ASCII-only: BOM-less .ps1 is read as ANSI by Windows PowerShell.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$w = 480; $h = 240
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# magenta (LifeOS inspiration module colour) background
$g.Clear([System.Drawing.Color]::FromArgb(232, 121, 201))
# white circle
$g.FillEllipse([System.Drawing.Brushes]::White, 30, 30, 180, 180)
# dark inner circle
$dark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 31, 36))
$g.FillEllipse($dark, 75, 75, 90, 90)
# label
$font = New-Object System.Drawing.Font 'Segoe UI', 20, ([System.Drawing.FontStyle]::Bold)
$g.DrawString('PASTE TEST', $font, [System.Drawing.Brushes]::White, 230, 60)
$font2 = New-Object System.Drawing.Font 'Segoe UI', 12
$g.DrawString('Ctrl+V into 捕获 / 贴图', $font2, [System.Drawing.Brushes]::White, 230, 110)
$g.DrawString((Get-Date -Format 'yyyy-MM-dd HH:mm'), $font2, [System.Drawing.Brushes]::White, 230, 140)

$g.Dispose()
[System.Windows.Forms.Clipboard]::SetImage($bmp)

$check = [System.Windows.Forms.Clipboard]::GetImage()
if ($check -ne $null) {
  Write-Output "CLIPBOARD_OK $($check.Width)x$($check.Height)"
} else {
  Write-Output "CLIPBOARD_EMPTY"
}
$check.Dispose(); $bmp.Dispose()

# row_profile.ps1 - 按行带统计非背景像素，定位角色在画面中的位置
param([Parameter(Mandatory = $true)][string]$Path)
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile($Path)
$W = $bmp.Width; $H = $bmp.Height
$bands = 20
Write-Host "image ${W}x${H}, bands=$bands"
for ($b = 0; $b -lt $bands; $b++) {
  $y0 = [int]($H * $b / $bands); $y1 = [int]($H * ($b + 1) / $bands)
  $nonBg = 0; $n = 0; $dark = 0
  for ($y = $y0; $y -lt $y1; $y += 4) {
    for ($x = 0; $x -lt $W; $x += 4) {
      $p = $bmp.GetPixel($x, $y)
      # 背景近似 (192,216,216)：与背景差异大则算非背景
      $dr = [math]::Abs($p.R - 192); $dg = [math]::Abs($p.G - 216); $db = [math]::Abs($p.B - 216)
      if (($dr + $dg + $db) -gt 40) { $nonBg++ }
      $lum = 0.299 * $p.R + 0.587 * $p.G + 0.114 * $p.B
      if ($lum -lt 130) { $dark++ }
      $n++
    }
  }
  Write-Host ("band {0,2} (y {1,4}-{2,4}): nonBg {3,6} ({4,5}%)  dark {5,5}" -f $b, $y0, $y1, $nonBg, [math]::Round(100.0 * $nonBg / $n, 1), $dark)
}
$bmp.Dispose()

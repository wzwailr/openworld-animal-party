# analyze_render.ps1 - 统计渲染图的颜色构成（24 步长颜色桶）
param([Parameter(Mandatory = $true)][string]$Path)
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile($Path)
$buckets = @{}
for ($y = 0; $y -lt $bmp.Height; $y += 8) {
  for ($x = 0; $x -lt $bmp.Width; $x += 8) {
    $p = $bmp.GetPixel($x, $y)
    $r = [int][math]::Floor($p.R / 24) * 24
    $g = [int][math]::Floor($p.G / 24) * 24
    $b = [int][math]::Floor($p.B / 24) * 24
    $key = "$r,$g,$b"
    if ($buckets.ContainsKey($key)) { $buckets[$key] += 1 } else { $buckets[$key] = 1 }
  }
}
$total = 0
$buckets.Values | ForEach-Object { $total += $_ }
Write-Host "===== color composition of $Path ====="
$buckets.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 12 | ForEach-Object {
  $pct = [math]::Round(100.0 * $_.Value / $total, 1)
  Write-Host ("{0,6} px ({1,5}%)  RGB={2}" -f $_.Value, $pct, $_.Key)
}
$bmp.Dispose()

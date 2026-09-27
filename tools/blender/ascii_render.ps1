# ascii_render.ps1 - convert a render PNG into ASCII art
# legend: W=bright white  b=dark blue(coat)  B=light blue(sky)  g=green(ground)
#         o=gold  r=red  #=dark  .=mid gray  :=light gray
param([Parameter(Mandatory = $true)][string]$Path, [int]$Cols = 64)
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile($Path)
$Rows = [int]($Cols * $bmp.Height / $bmp.Width)
for ($r = 0; $r -lt $Rows; $r++) {
  $line = ''
  for ($c = 0; $c -lt $Cols; $c++) {
    $x = [int](($c + 0.5) * $bmp.Width / $Cols)
    $y = [int](($r + 0.5) * $bmp.Height / $Rows)
    $p = $bmp.GetPixel($x, $y)
    $lum = 0.299 * $p.R + 0.587 * $p.G + 0.114 * $p.B
    if ($lum -gt 235) { $ch = 'W' }
    elseif ($p.B -gt $p.R + 30 -and $p.B -gt $p.G + 10 -and $lum -gt 150) { $ch = 'B' }
    elseif ($p.B -gt $p.R + 20 -and $p.B -gt $p.G + 20 -and $lum -lt 150) { $ch = 'b' }
    elseif ($p.G -gt $p.R + 15 -and $p.G -gt $p.B + 15) { $ch = 'g' }
    elseif ($p.R -gt 150 -and $p.G -gt 110 -and $p.B -lt 130) { $ch = 'o' }
    elseif ($p.R -gt 120 -and $p.G -lt 100 -and $p.B -lt 100) { $ch = 'r' }
    elseif ($lum -lt 110) { $ch = '#' }
    elseif ($lum -lt 190) { $ch = '.' }
    else { $ch = ':' }
    $line += $ch
  }
  Write-Host $line
}
$bmp.Dispose()

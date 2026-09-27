# crop_face.ps1 - 从渲染图中裁剪面部区域并放大
param(
  [Parameter(Mandatory = $true)][string]$Src,
  [Parameter(Mandatory = $true)][string]$Dst,
  [int]$Cx = 600, [int]$Cy = 660, [int]$HalfW = 190, [int]$HalfH = 165, [int]$Scale = 3
)
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile($Src)
$x0 = [math]::Max(0, $Cx - $HalfW); $y0 = [math]::Max(0, $Cy - $HalfH)
$w = [math]::Min($bmp.Width - $x0, $HalfW * 2); $h = [math]::Min($bmp.Height - $y0, $HalfH * 2)
$rect = New-Object System.Drawing.Rectangle($x0, $y0, $w, $h)
$crop = $bmp.Clone($rect, $bmp.PixelFormat)
$out = New-Object System.Drawing.Bitmap($w * $Scale, $h * $Scale)
$g = [System.Drawing.Graphics]::FromImage($out)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($crop, 0, 0, $w * $Scale, $h * $Scale)
$g.Dispose(); $crop.Dispose(); $bmp.Dispose()
$out.Save($Dst, [System.Drawing.Imaging.ImageFormat]::Png)
$out.Dispose()
Write-Host ("crop saved: {0} ({1}x{2} -> {3}x{4})" -f $Dst, $w, $h, $w * $Scale, $h * $Scale)

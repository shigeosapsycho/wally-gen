param(
    [string]$Out = "$PSScriptRoot\..\src-tauri\icons\source.png"
)

Add-Type -AssemblyName System.Drawing

$size = 1024
$bmp  = New-Object System.Drawing.Bitmap($size, $size)
$g    = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode    = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Background — match the app's #0d0d12.
$bg = [System.Drawing.Color]::FromArgb(255, 13, 13, 18)
$g.Clear($bg)

# Violet diamond — rotated rounded square in #7c6cf6.
$cx = $size / 2.0
$cy = $size / 2.0
$side = $size * 0.62
$half = $side / 2.0
$radius = $side * 0.18

$state = $g.Save()
$g.TranslateTransform($cx, $cy)
$g.RotateTransform(45)

$rect = New-Object System.Drawing.RectangleF(-$half, -$half, $side, $side)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$d = $radius * 2.0
$path.AddArc($rect.X,                $rect.Y,                $d, $d, 180, 90)
$path.AddArc($rect.X + $side - $d,   $rect.Y,                $d, $d, 270, 90)
$path.AddArc($rect.X + $side - $d,   $rect.Y + $side - $d,   $d, $d,   0, 90)
$path.AddArc($rect.X,                $rect.Y + $side - $d,   $d, $d,  90, 90)
$path.CloseFigure()

$violet = [System.Drawing.Color]::FromArgb(255, 124, 108, 246)
$brush  = New-Object System.Drawing.SolidBrush($violet)
$g.FillPath($brush, $path)

$brush.Dispose()
$path.Dispose()
$g.Restore($state)

$outDir = Split-Path -Parent $Out
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()

Write-Output "Wrote $Out"

Add-Type -AssemblyName System.Drawing

$size = 1024
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# 透明背景
$g.Clear([System.Drawing.Color]::Transparent)

# 圆角方形底板：蓝灰强调色 #516fd1
$radius = 220
$rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$d = $radius * 2
$path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
$path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
$path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
$path.CloseFigure()

$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(81, 111, 209))
$g.FillPath($brush, $path)

# 终端提示符 >_
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 64)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawLines($pen, @(
  (New-Object System.Drawing.PointF(300, 360)),
  (New-Object System.Drawing.PointF(470, 500)),
  (New-Object System.Drawing.PointF(300, 640))
))
$g.DrawLine($pen, 560, 648, 740, 648)

$g.Dispose()

$out = Join-Path $PSScriptRoot 'app-icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "icon written: $out"

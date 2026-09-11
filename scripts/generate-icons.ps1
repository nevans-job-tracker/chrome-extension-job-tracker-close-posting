Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# Match the import extension's briefcase motif, with an orange closure mark.
$iconOutputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) "icons"
[System.IO.Directory]::CreateDirectory($iconOutputDirectory) | Out-Null
foreach ($size in @(16, 32, 48, 128)) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#C2410C"))
    $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $handle = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 8)
    $minus = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#C2410C"), 10)
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.ScaleTransform($size / 128.0, $size / 128.0)
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.FillEllipse($background, 2, 2, 124, 124)
        $graphics.DrawRectangle($handle, 48, 30, 32, 24)
        $graphics.FillRectangle($white, 28, 48, 72, 50)
        $graphics.DrawLine($minus, 46, 73, 82, 73)
        $bitmap.Save((Join-Path $iconOutputDirectory "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $minus.Dispose()
        $handle.Dispose()
        $white.Dispose()
        $background.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

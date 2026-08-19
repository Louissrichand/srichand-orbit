# สร้างไฟล์สำหรับ publish เป็นหน้าเว็บ (Artifact)
# ต่างจาก standalone ตรงที่ไม่มี <!doctype>/<html>/<head>/<body> เพราะตัว publisher ใส่ให้เอง
#
#   powershell -ExecutionPolicy Bypass -File build-artifact.ps1
#
# Artifact บล็อกสคริปต์จากภายนอก จึงไม่มี MSAL ในไฟล์นี้
# ผลคือหน้านี้ทำงานโหมดเครื่องเดียวเสมอ ส่วนโหมดทีมใช้บน GitHub Pages

$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path

function ReadUtf8($p) { [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8) }

# ลำดับต้องตรงกับ index.html — ตัวหลังเรียกใช้ตัวหน้า
$files = @('config.js', 'i18n.js', 'icons.js', 'auth.js', 'store.js',
           'cloud.js', 'sync.js', 'render.js', 'gantt.js', 'main.js')

$index = ReadUtf8 (Join-Path $base 'index.html')
$css   = ReadUtf8 (Join-Path $base 'assets/styles.css')

# ดึงเฉพาะ markup ระหว่าง <body> กับ <script ตัวแรก
$startTag = '<body>'
$s = $index.IndexOf($startTag)
if ($s -lt 0) { throw 'หา <body> ใน index.html ไม่เจอ' }
$s += $startTag.Length
$e = $index.IndexOf('<script')
if ($e -lt 0) { throw 'หา <script ใน index.html ไม่เจอ' }
$markup = $index.Substring($s, $e - $s).Trim()

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('<title>Orbit</title>')
[void]$sb.AppendLine('<style>')
[void]$sb.AppendLine($css)
[void]$sb.AppendLine('</style>')
[void]$sb.AppendLine($markup)
foreach ($f in $files) {
  [void]$sb.AppendLine('<script>')
  [void]$sb.AppendLine((ReadUtf8 (Join-Path $base "app/$f")))
  [void]$sb.AppendLine('</script>')
}

$out = Join-Path $base 'Orbit-artifact.html'
[System.IO.File]::WriteAllText($out, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))

$kb = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host "สร้าง Orbit-artifact.html แล้ว ($kb KB)"

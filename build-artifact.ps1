# สร้างไฟล์สำหรับ publish เป็นหน้าเว็บ (Artifact)
# ต่างจาก standalone ตรงที่ไม่มี <!doctype>/<html>/<head>/<body> เพราะตัว publisher ใส่ให้เอง
#
#   powershell -ExecutionPolicy Bypass -File build-artifact.ps1

$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path

function ReadUtf8($p) { [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8) }

$index  = ReadUtf8 (Join-Path $base 'index.html')
$css    = ReadUtf8 (Join-Path $base 'assets\styles.css')
$i18n   = ReadUtf8 (Join-Path $base 'app\i18n.js')
$store  = ReadUtf8 (Join-Path $base 'app\store.js')
$render = ReadUtf8 (Join-Path $base 'app\render.js')
$gantt  = ReadUtf8 (Join-Path $base 'app\gantt.js')
$main   = ReadUtf8 (Join-Path $base 'app\main.js')

# ดึงเฉพาะ markup ระหว่าง <body> กับ <script src= ตัวแรก
$startTag = '<body>'
$s = $index.IndexOf($startTag)
if ($s -lt 0) { throw 'หา <body> ใน index.html ไม่เจอ' }
$s += $startTag.Length
$e = $index.IndexOf('<script src=')
if ($e -lt 0) { throw 'หา <script src= ใน index.html ไม่เจอ' }
$markup = $index.Substring($s, $e - $s).Trim()

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('<title>Orbit</title>')
[void]$sb.AppendLine('<style>')
[void]$sb.AppendLine($css)
[void]$sb.AppendLine('</style>')
[void]$sb.AppendLine($markup)
foreach ($js in @($i18n, $store, $render, $gantt, $main)) {
  [void]$sb.AppendLine('<script>')
  [void]$sb.AppendLine($js)
  [void]$sb.AppendLine('</script>')
}

$out = Join-Path $base 'Orbit-artifact.html'
[System.IO.File]::WriteAllText($out, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))

$kb = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host "สร้าง Orbit-artifact.html แล้ว ($kb KB)"

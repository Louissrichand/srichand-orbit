# รวม CSS + JS ทั้งหมดเข้าไปใน HTML ไฟล์เดียว
# ใช้เมื่อแก้โค้ดแล้วอยากได้ไฟล์เดียวจบไว้ส่งต่อ/เปิดที่เครื่องอื่น
#
#   powershell -ExecutionPolicy Bypass -File build-standalone.ps1

$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path

function ReadUtf8($p) { [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8) }

$html   = ReadUtf8 (Join-Path $base 'index.html')
$css    = ReadUtf8 (Join-Path $base 'assets\styles.css')
$i18n   = ReadUtf8 (Join-Path $base 'app\i18n.js')
$icons  = ReadUtf8 (Join-Path $base 'app\icons.js')
$store  = ReadUtf8 (Join-Path $base 'app\store.js')
$render = ReadUtf8 (Join-Path $base 'app\render.js')
$gantt  = ReadUtf8 (Join-Path $base 'app\gantt.js')
$main   = ReadUtf8 (Join-Path $base 'app\main.js')

$html = $html.Replace(
  '<link rel="stylesheet" href="assets/styles.css">',
  "<style>`n$css`n</style>")

$html = $html.Replace('<script src="app/i18n.js"></script>',   "<script>`n$i18n`n</script>")
$html = $html.Replace('<script src="app/icons.js"></script>',  "<script>`n$icons`n</script>")
$html = $html.Replace('<script src="app/store.js"></script>',  "<script>`n$store`n</script>")
$html = $html.Replace('<script src="app/render.js"></script>', "<script>`n$render`n</script>")
$html = $html.Replace('<script src="app/gantt.js"></script>',  "<script>`n$gantt`n</script>")
$html = $html.Replace('<script src="app/main.js"></script>',   "<script>`n$main`n</script>")

if ($html -match 'script src=') { throw 'ยังมี script src เหลืออยู่ — รวมไฟล์ไม่ครบ' }

$out = Join-Path $base 'Orbit-standalone.html'
[System.IO.File]::WriteAllText($out, $html, (New-Object System.Text.UTF8Encoding($false)))

$kb = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host "สร้าง Orbit-standalone.html แล้ว ($kb KB)"

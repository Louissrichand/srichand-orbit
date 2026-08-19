# รวม CSS + JS ทั้งหมดเข้าไปใน HTML ไฟล์เดียว
# ใช้เมื่อแก้โค้ดแล้วอยากได้ไฟล์เดียวจบไว้ส่งต่อ/เปิดที่เครื่องอื่น
#
#   powershell -ExecutionPolicy Bypass -File build-standalone.ps1
#
# หมายเหตุ: MSAL ยังโหลดจาก CDN เพราะฝังทั้งไลบรารีจะทำให้ไฟล์ใหญ่ขึ้นมาก
# ถ้าเปิดไฟล์นี้แบบ file:// ระบบจะทำงานโหมดเครื่องเดียวเสมอ (auth.js ตัดให้เอง)

$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path

function ReadUtf8($p) { [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8) }

# ลำดับต้องตรงกับ index.html — ตัวหลังเรียกใช้ตัวหน้า
$files = @('config.js', 'i18n.js', 'icons.js', 'auth.js', 'store.js',
           'cloud.js', 'sync.js', 'render.js', 'gantt.js', 'main.js')

$html = ReadUtf8 (Join-Path $base 'index.html')
$css  = ReadUtf8 (Join-Path $base 'assets/styles.css')

$html = $html.Replace(
  '<link rel="stylesheet" href="assets/styles.css">',
  "<style>`n$css`n</style>")

foreach ($f in $files) {
  $src = ReadUtf8 (Join-Path $base "app/$f")
  $tag = '<script src="app/' + $f + '"></script>'
  if ($html.IndexOf($tag) -lt 0) { throw "ไม่พบ $tag ใน index.html" }
  $html = $html.Replace($tag, "<script>`n$src`n</script>")
}

# เหลือได้เฉพาะ CDN ของ MSAL เท่านั้น ถ้ามี app/ หลุดมาแปลว่ารวมไม่ครบ
if ($html -match 'script src="app/') { throw 'ยังมีสคริปต์ app/ ที่ยังไม่ถูกรวม' }

$out = Join-Path $base 'Orbit-standalone.html'
[System.IO.File]::WriteAllText($out, $html, (New-Object System.Text.UTF8Encoding($false)))

$kb = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host "สร้าง Orbit-standalone.html แล้ว ($kb KB)"

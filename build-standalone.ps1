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
$files = @('config.js', 'i18n.js', 'icons.js', 'auth.js', 'msphotos.js', 'store.js', 'files.js',
           'cloud.js', 'sync.js', 'richtext.js', 'charts.js', 'render.js', 'render4b.js', 'gantt.js', 'touch.js', 'pwa.js', 'ui4b.js', 'ui4b2.js', 'mobile.js', 'exec2c.js', 'sprint4b.js', 'sprint4c.js', 'main.js')

# ฝังไฟล์ฟอนต์ลงใน CSS เลย เพราะไฟล์เดียวจบต้องใช้ได้โดยไม่ต้องแนบโฟลเดอร์ fonts ไปด้วย
function InlineFonts($css, $base) {
  $dir = Join-Path $base 'assets/fonts'
  if (-not (Test-Path $dir)) { throw "ไม่พบโฟลเดอร์ $dir" }
  $n = 0
  foreach ($f in Get-ChildItem -Path $dir -Filter *.woff2) {
    $b64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($f.FullName))
    $from = 'url(fonts/' + $f.Name + ')'
    if ($css.IndexOf($from) -lt 0) { throw "CSS ไม่ได้อ้างถึง $($f.Name)" }
    $css = $css.Replace($from, "url(data:font/woff2;base64,$b64)")
    $n++
  }
  if ($css -match 'url\(fonts/') { throw 'ยังมีฟอนต์ที่ยังไม่ถูกฝัง' }
  Write-Host "  ฝังฟอนต์ $n ไฟล์"
  return $css
}

$html = ReadUtf8 (Join-Path $base 'index.html')
$css  = ReadUtf8 (Join-Path $base 'assets/styles.css')
$css  = InlineFonts $css $base

$html = $html.Replace(
  '<link rel="stylesheet" href="assets/styles.css">',
  "<style>`n$css`n</style>")

# 4b — ไฟล์เดียวจบไม่มี manifest / sw.js / ไอคอนข้าง ๆ: ตัดลิงก์ออก และบอก pwa.js ว่าเป็นไฟล์รวม (ไม่ลงทะเบียน service worker)
foreach ($l in @('<link rel="manifest" href="manifest.webmanifest" crossorigin="use-credentials">',
                 '<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">')) {
  if ($html.IndexOf($l) -lt 0) { throw "ไม่พบ $l ใน index.html" }
  $html = $html.Replace($l, '')
}
$html = $html.Replace('<script src="app/config.js"></script>', "<script>window.ORBIT_BUILD = 'standalone';</script>`n<script src=`"app/config.js`"></script>")

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

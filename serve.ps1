# เว็บเซิร์ฟเวอร์เล็ก ๆ สำหรับทดสอบ Orbit บนเครื่อง
# ใช้ HttpListener ที่มากับ .NET — ไม่ต้องติดตั้ง Node หรือ Python
#
#   powershell -ExecutionPolicy Bypass -File serve.ps1
#   แล้วเปิด http://localhost:8123/
#   กด Ctrl+C เพื่อหยุด

param([int]$Port = 8123)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.png'  = 'image/png'
  '.woff2'= 'font/woff2'
  '.md'   = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Orbit dev server: http://localhost:$Port/  (root: $root)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq '/') { $path = '/index.html' }

    # กันการไต่ออกนอกโฟลเดอร์
    $full = Join-Path $root ($path.TrimStart('/') -replace '/', '\')
    $resolved = $null
    try { $resolved = (Resolve-Path -LiteralPath $full -ErrorAction Stop).Path } catch { }

    # ห้าม cache ระหว่างพัฒนา ไม่งั้นแก้โค้ดแล้วเบราว์เซอร์ยังเสิร์ฟไฟล์เก่า
    $ctx.Response.Headers.Add('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    $ctx.Response.Headers.Add('Pragma', 'no-cache')

    if ($resolved -and $resolved.StartsWith($root) -and (Test-Path -LiteralPath $resolved -PathType Leaf)) {
      $ext = [System.IO.Path]::GetExtension($resolved).ToLower()
      $ctx.Response.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' })
      $bytes = [System.IO.File]::ReadAllBytes($resolved)
      $ctx.Response.StatusCode = 200
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      Write-Host ("200 " + $path)
    } else {
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 not found: $path")
      $ctx.Response.StatusCode = 404
      $ctx.Response.ContentType = 'text/plain; charset=utf-8'
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
      Write-Host ("404 " + $path)
    }
    $ctx.Response.OutputStream.Close()
  }
} finally {
  $listener.Stop()
  $listener.Close()
}

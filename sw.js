/* Orbit — service worker (4b)
 *
 * ดึงจากเครือข่ายก่อนเสมอ (network-first) แล้วเก็บสำเนาไว้ใช้ตอนออฟไลน์เท่านั้น
 * จึงไม่มีทางเสิร์ฟโค้ดเก่าหลังอัปเดต — ออนไลน์อยู่ได้ของใหม่จากเซิร์ฟเวอร์ทุกครั้ง
 * เปลี่ยน VERSION เมื่อเปลี่ยนรายการไฟล์ แคชเก่าจะถูกลบตอน activate
 * ไม่แตะคำขอข้ามโดเมน (Microsoft Graph, MSAL, Office) และไม่แตะคำขอที่ไม่ใช่ GET */
var VERSION = 'orbit-shell-v5';
var SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'assets/styles.css',
  'app/config.js', 'app/i18n.js', 'app/icons.js', 'app/auth.js', 'app/msphotos.js', 'app/store.js', 'app/files.js', 'app/cloud.js', 'app/sync.js',
  'app/richtext.js', 'app/charts.js', 'app/render.js', 'app/render4b.js', 'app/gantt.js', 'app/touch.js', 'app/pwa.js',
  'app/ui4b.js', 'app/ui4b2.js', 'app/mobile.js', 'app/exec2c.js', 'app/sprint4b.js', 'app/main.js', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    /* แคชทีละไฟล์ ไฟล์ไหนโหลดไม่ได้ก็ข้าม ไม่ให้การติดตั้งล้มทั้งชุด */
    return Promise.all(SHELL.map(function (u) {
      return fetch(u, { cache: 'no-store', credentials: 'same-origin' }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('orbit-shell-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/.auth/') === 0) return;
  e.respondWith(fetch(req, { cache: 'no-store' }).then(function (res) {
    if (res.ok && res.type === 'basic') {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(req.mode === 'navigate' ? 'index.html' : req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true }).then(function (hit) {
      return hit || new Response('Orbit is offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    });
  }));
});

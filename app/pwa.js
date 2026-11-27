/* Orbit — ติดตั้งเป็นแอป (PWA) (4b)
 *
 * ลงทะเบียน sw.js เฉพาะเมื่อเปิดผ่าน https หรือ localhost และไม่ใช่ไฟล์รวม (standalone/artifact)
 * sw.js ดึงจากเครือข่ายก่อนเสมอ ใช้แคชเฉพาะตอนออฟไลน์ จึงไม่มีทางได้โค้ดเก่าหลังอัปเดต
 */
(function (global) {
  'use strict';

  var deferred = null;
  var DISMISS = 'orbit.installHint';
  var reg = null;

  function eligible() {
    var p = global.location.protocol, h = global.location.hostname;
    if (global.ORBIT_BUILD) return false;                   // ไฟล์รวม — ไม่มี sw.js ข้าง ๆ
    if (!('serviceWorker' in global.navigator)) return false;
    return p === 'https:' || (p === 'http:' && (h === 'localhost' || h === '127.0.0.1' || h === '[::1]'));
  }
  function dismissed() { try { return global.localStorage.getItem(DISMISS) === 'off'; } catch (e) { return false; } }
  function installed() {
    try { return global.matchMedia('(display-mode: standalone)').matches || global.navigator.standalone === true; } catch (e) { return false; }
  }
  function rerender() { if (global.Orbit && global.Orbit.render) global.Orbit.render(); }

  if (eligible()) {
    global.addEventListener('load', function () {
      global.navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (r) {
        reg = r;
        /* หาเวอร์ชันใหม่ทุกชั่วโมงที่เปิดค้างไว้ (sw.js เปลี่ยนเลขแคชเมื่อมีอัปเดต) */
        setInterval(function () { r.update().catch(function () {}); }, 3600 * 1000);
      }).catch(function (e) { console.warn('ลงทะเบียน service worker ไม่สำเร็จ', e); });
    });
  }
  global.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    rerender();
  });
  global.addEventListener('appinstalled', function () { deferred = null; rerender(); });

  global.OrbitPWA = {
    eligible: eligible,
    registration: function () { return reg; },
    canInstall: function () { return !!deferred && !dismissed() && !installed(); },
    prompt: function () {
      if (!deferred) return Promise.resolve('unavailable');
      var d = deferred;
      deferred = null;
      d.prompt();
      return d.userChoice.then(function (c) { rerender(); return c && c.outcome; });
    },
    dismiss: function () { try { global.localStorage.setItem(DISMISS, 'off'); } catch (e) { /* ไม่มีที่เก็บ */ } }
  };

})(window);

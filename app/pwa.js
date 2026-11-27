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

  /* ---------- แจ้งเมื่อมีเวอร์ชันใหม่ ----------
   * คนที่เปิดแท็บค้างไว้จะใช้โค้ดเก่าไปเรื่อย ๆ จนกว่าจะรีเฟรช และไม่มีอะไรบอก
   * GitHub Pages ใส่ Last-Modified = เวลาที่ deploy ให้ทุกไฟล์เท่ากัน จึงใช้แทนเลขเวอร์ชันได้เลย
   * ไม่ต้องจำไปแก้เลขเองทุกครั้งที่ปล่อยของใหม่
   * เช็กทุกชั่วโมง และตอนกลับมาที่แท็บถ้าเกินชั่วโมงแล้ว (เครื่องหลับ ตัวจับเวลาไม่เดิน)
   * เซิร์ฟเวอร์ที่ไม่ส่ง Last-Modified (serve.ps1 ในเครื่อง) หรือไฟล์รวม = ไม่เช็ก */
  var CHECK_MS = 3600 * 1000;
  var baseVer = null, lastCheck = 0, bar = null;

  function T(s) { return global.I18N ? global.I18N.t(s) : s; }
  function escH(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function remoteVersion() {
    // ใส่ ?v= กันได้ค่าเก่าจากแคชของ CDN (แคชไว้ 10 นาที)
    return fetch('./?v=' + Date.now(), { method: 'HEAD', cache: 'no-store' }).then(function (r) {
      return r.ok ? r.headers.get('Last-Modified') : null;
    }).catch(function () { return null; });
  }

  function checkUpdate() {
    if (bar || global.ORBIT_BUILD || global.location.protocol === 'file:') return Promise.resolve(false);
    lastCheck = Date.now();
    return remoteVersion().then(function (v) {
      if (!v) return false;
      if (!baseVer) { baseVer = v; return false; }     // ครั้งแรกตอนเปิดแอป = เวอร์ชันที่ใช้อยู่
      if (v === baseVer) return false;
      showUpdate();
      return true;
    });
  }

  /* ไฟล์ .js .css แคชในเบราว์เซอร์ได้ 10 นาที รีโหลดเฉย ๆ อาจได้ของเก่าบางไฟล์ปนกับของใหม่
   * ดึงใหม่ทุกไฟล์ของเราก่อน (cache: reload) แคชจะได้เป็นของใหม่ทั้งชุด */
  function refreshFiles() {
    var urls = [].slice.call(document.querySelectorAll('script[src], link[rel="stylesheet"][href]'))
      .map(function (el) { return el.src || el.href; })
      .filter(function (u) { return u.indexOf(global.location.origin + '/') === 0; });
    return Promise.all(urls.map(function (u) { return fetch(u, { cache: 'reload' }).catch(function () {}); }));
  }

  function showUpdate() {
    if (bar) return;
    bar = document.createElement('div');
    bar.className = 'upd-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<span class="upd-msg">' + escH(T('มี Orbit เวอร์ชันใหม่')) + '</span>' +
      '<button class="upd-go">' + escH(T('รีเฟรช')) + '</button>' +
      '<button class="upd-x" title="' + escH(T('ไว้ทีหลัง')) + '" aria-label="' + escH(T('ไว้ทีหลัง')) + '">×</button>';
    var go = bar.querySelector('.upd-go'), msg = bar.querySelector('.upd-msg');

    go.onclick = function () {
      go.disabled = true;
      go.textContent = T('กำลังบันทึก…');
      /* งานที่ยังไม่ได้ส่งขึ้น SharePoint ต้องส่งก่อน ไม่งั้นรีโหลดแล้วหาย
       * ส่งไม่สำเร็จ (ออฟไลน์ ข้อมูลชน) ก็ไม่รีโหลด บอกให้ลองใหม่ */
      var Sy = global.OrbitSync;
      var saved = Sy && Sy.state.mode === 'team' && Sy.state.dirty ? Sy.flush() : Promise.resolve(true);
      saved.then(function (ok) {
        if (ok === false) {
          msg.textContent = T('ยังบันทึกงานไม่สำเร็จ ลองใหม่อีกครั้ง');
          go.disabled = false;
          go.textContent = T('รีเฟรช');
          return;
        }
        return refreshFiles().then(function () { global.location.reload(); });
      });
    };
    /* ไว้ทีหลัง — ซ่อนไปก่อน รอบเช็กถัดไป (อีกชั่วโมง) จะเตือนอีก */
    bar.querySelector('.upd-x').onclick = function () { bar.remove(); bar = null; };
    document.body.appendChild(bar);
  }

  if (!global.ORBIT_BUILD && global.location.protocol !== 'file:') {
    global.addEventListener('load', function () {
      checkUpdate();
      setInterval(checkUpdate, CHECK_MS);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck > CHECK_MS) checkUpdate();
    });
  }

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
    dismiss: function () { try { global.localStorage.setItem(DISMISS, 'off'); } catch (e) { /* ไม่มีที่เก็บ */ } },
    /** เช็กเวอร์ชันใหม่เดี๋ยวนี้ คืน true ถ้าเจอและขึ้นแถบแจ้งแล้ว */
    checkUpdate: checkUpdate,
    showUpdate: showUpdate
  };

})(window);

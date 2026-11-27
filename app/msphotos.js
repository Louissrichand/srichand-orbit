/* Orbit — รูปโปรไฟล์จาก Microsoft 365
 *
 * ในโหมดทีม ดึงรูปของแต่ละคนจาก Microsoft Graph มาแสดง ให้หน้าตาตรงกับ Teams / Outlook
 * - ไม่เก็บรูปลงไฟล์ข้อมูลกลาง (orbit-db.json จะได้ไม่บวม) เก็บแค่ในเบราว์เซอร์ของแต่ละคน
 * - แคชไว้ 1 วัน แล้วค่อยถามใหม่ คนเปลี่ยนรูปใน Teams จะเห็นใน Orbit ภายในวันถัดไป
 * - คนที่ไม่มีรูปใน Microsoft ก็จำไว้ 1 วันเหมือนกัน จะได้ไม่ถามซ้ำทุกครั้งที่วาดหน้า
 * - ถ้าคนนั้นอัปโหลดรูปเองใน Orbit รูปที่อัปเองชนะ (render.js ตัดสิน)
 *
 * สิทธิ์ที่ใช้: User.Read (รูปตัวเอง) และ User.ReadBasic.All (รูปคนอื่น) ซึ่งขออยู่แล้วตอนล็อกอิน
 */
(function (global) {
  'use strict';

  var KEY = 'orbit.msphoto.v1';
  var TTL = 24 * 60 * 60 * 1000;
  var SIZE = '120x120';            // คมพอสำหรับวงกลมใหญ่สุด (64px) บนจอความละเอียดสูง
  var PARALLEL = 4;

  var cache = load();              // { key: { d: dataUri|null, t: เวลาที่ถาม } }
  var queue = [], queued = {}, running = 0;
  var onChange = null, changeTimer = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* เต็มหรือโหมดส่วนตัว ใช้แค่ในหน่วยความจำ */ }
  }

  function enabled() {
    return !!(global.OrbitAuth && global.OrbitAuth.isSignedIn && global.OrbitAuth.isSignedIn());
  }

  /* รหัสที่ใช้ถาม Graph
   * คนที่เข้ามาเองตอนล็อกอินมี id = u_ + oid ตัดขีดออก จึงประกอบ oid กลับได้
   * คนที่ผู้ดูแลเพิ่มล่วงหน้าใช้อีเมลแทน แต่เฉพาะโดเมนเดียวกับคนที่ล็อกอินอยู่
   * (อีเมลตัวอย่างอย่าง example.com ถามไปก็ได้ 404 เปล่า ๆ) */
  function graphKey(u) {
    if (!u) return null;
    var m = /^u_([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i.exec(u.id || '');
    if (m) return m.slice(1).join('-').toLowerCase();
    var email = String(u.email || '').toLowerCase();
    var me = global.OrbitAuth.profile && global.OrbitAuth.profile();
    var dom = me && me.email ? String(me.email).toLowerCase().split('@')[1] : '';
    if (dom && email.split('@')[1] === dom) return email;
    return null;
  }

  /** รูปของคนนี้ (data URI) ถ้ามีแล้ว ไม่มีก็คืน null แล้วไปดึงมาให้เบื้องหลัง */
  function url(u) {
    if (!enabled()) return null;
    var k = graphKey(u);
    if (!k) return null;
    var c = cache[k];
    if (!c || Date.now() - c.t > TTL) want(k);
    return c ? c.d : null;
  }

  function want(k) {
    if (queued[k]) return;
    queued[k] = true;
    queue.push(k);
    pump();
  }

  function pump() {
    while (running < PARALLEL && queue.length) {
      var k = queue.shift();
      running++;
      fetchOne(k).then(done(k, true), done(k, false));
    }
  }

  function done(k, ok) {
    return function (d) {
      running--;
      delete queued[k];
      if (ok) {
        var before = cache[k] ? cache[k].d : undefined;
        cache[k] = { d: d, t: Date.now() };
        save();
        if (before !== d) changed();
      }
      // ถ้าพลาดเพราะเครือข่ายหรือสิทธิ์ ไม่จำผล รอบหน้าจะลองใหม่เอง
      pump();
    };
  }

  function fetchOne(k) {
    return global.OrbitAuth.token().then(function (tok) {
      return fetch('https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(k) +
        '/photos/' + SIZE + '/$value', { headers: { Authorization: 'Bearer ' + tok } });
    }).then(function (r) {
      if (r.status === 404) return null;              // คนนี้ไม่มีรูปใน Microsoft
      if (!r.ok) throw new Error('photo ' + r.status);
      return r.blob().then(toDataUri);
    });
  }

  function toDataUri(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
  }

  /* รูปเข้ามาทีละหลายใบ รวบเป็นการวาดหน้าใหม่ครั้งเดียว */
  function changed() {
    if (!onChange || changeTimer) return;
    changeTimer = setTimeout(function () { changeTimer = null; onChange(); }, 300);
  }

  global.OrbitPhotos = {
    url: url,
    onChange: function (fn) { onChange = fn; },
    /** ล้างแคช เช่น ตอนออกจากระบบ */
    clear: function () { cache = {}; save(); }
  };
})(window);

/* Orbit — ลากด้วยนิ้ว (4b)
 *
 * การลากของแอป (แถวในรายการ การ์ดบอร์ด งานในปฏิทิน วิดเจ็ตหน้าแรก) ใช้ HTML5 drag & drop ซึ่งจอสัมผัสไม่ยิง
 * ไฟล์นี้แปลงการ "กดค้างแล้วลาก" ด้วยนิ้ว/ปากกาบนของที่ draggable="true" เป็น dragstart / dragenter / dragover /
 * dragleave / drop / dragend ชุดเดียวกับเมาส์ (DataTransfer ใช้ร่วมทั้งรอบ) ตัวจัดการลากเดิมใน main.js จึงทำงานเหมือนเดิม
 * เมาส์ไม่ผ่านไฟล์นี้เลย — ลากด้วยเมาส์ยังเป็นของเบราว์เซอร์ตามปกติ
 * กดค้างไม่ถึงครึ่งวินาทีแล้วขยับ = เลื่อนจอตามปกติ
 * Sprint 2A — กดค้างแล้วปล่อยโดยไม่ขยับ = ส่ง orbit:longpress ให้ของชิ้นนั้น (mobile.js ใช้เข้าโหมดเลือกงาน)
 */
(function (global) {
  'use strict';

  if (!global.PointerEvent || typeof global.DataTransfer !== 'function') return;

  var HOLD = 350, TOL = 8, EDGE = 48;
  var st = null;
  var api = global.OrbitTouch = { active: false, hold: HOLD };

  function fire(el, type, x, y) {
    if (!el || !st) return true;
    var ev;
    try { ev = new DragEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, dataTransfer: st.dt }); }
    catch (e) { return true; }
    return el.dispatchEvent(ev);
  }
  function under(x, y) {
    if (st && st.ghost) st.ghost.style.display = 'none';
    var el = document.elementFromPoint(x, y);
    if (st && st.ghost) st.ghost.style.display = '';
    return el;
  }
  function cleanup() {
    if (!st) return;
    clearTimeout(st.timer);
    if (st.ghost) st.ghost.remove();
    if (st.src) st.src.classList.remove('touch-drag-src');
    document.body.classList.remove('touch-dragging');
    st = null;
    api.active = false;
  }
  function begin() {
    if (!st) return;
    st.dt = new DataTransfer();
    api.active = true;
    var ok = fire(st.src, 'dragstart', st.x, st.y);
    if (!ok) { cleanup(); return; }
    st.on = true;
    st.src.classList.add('touch-drag-src');
    document.body.classList.add('touch-dragging');
    var r = st.src.getBoundingClientRect();
    var g = st.src.cloneNode(true);
    g.className += ' touch-ghost';
    g.removeAttribute('id');
    g.style.width = Math.min(r.width, 320) + 'px';
    g.style.left = (st.x - Math.min(st.x - r.left, 160)) + 'px';
    g.style.top = (st.y - (st.y - r.top)) + 'px';
    st.offX = st.x - parseFloat(g.style.left);
    st.offY = st.y - parseFloat(g.style.top);
    document.body.appendChild(g);
    st.ghost = g;
    if (global.navigator.vibrate) { try { global.navigator.vibrate(12); } catch (e) { /* ไม่รองรับ */ } }
  }

  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    var src = e.target.closest && e.target.closest('[draggable="true"]');
    if (!src || e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    cleanup();
    st = { src: src, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false,
           id: e.pointerId, on: false, over: null, dt: null, ghost: null };
    st.timer = setTimeout(begin, HOLD);
  }, true);

  document.addEventListener('pointermove', function (e) {
    if (!st || e.pointerId !== st.id) return;
    if (!st.on) {
      if (Math.abs(e.clientX - st.x) + Math.abs(e.clientY - st.y) > TOL) cleanup();   // ขยับก่อนครบเวลา = เลื่อนจอ
      return;
    }
    e.preventDefault();
    st.x = e.clientX; st.y = e.clientY;
    if (Math.abs(st.x - st.sx) + Math.abs(st.y - st.sy) > TOL) st.moved = true;
    st.ghost.style.left = (st.x - st.offX) + 'px';
    st.ghost.style.top = (st.y - st.offY) + 'px';
    var el = under(st.x, st.y);
    if (el !== st.over) {
      if (st.over) fire(st.over, 'dragleave', st.x, st.y);
      if (el) fire(el, 'dragenter', st.x, st.y);
      st.over = el;
    }
    if (el) fire(el, 'dragover', st.x, st.y);
    /* ใกล้ขอบจอ = เลื่อนกล่องที่เลื่อนได้ตามไปด้วย */
    if (st.y < EDGE || st.y > global.innerHeight - EDGE || st.x < EDGE || st.x > global.innerWidth - EDGE) {
      var box = el;
      while (box && box !== document.body && !(box.scrollHeight > box.clientHeight + 4 || box.scrollWidth > box.clientWidth + 4)) box = box.parentElement;
      var dy = st.y < EDGE ? -14 : st.y > global.innerHeight - EDGE ? 14 : 0, dx = st.x < EDGE ? -14 : st.x > global.innerWidth - EDGE ? 14 : 0;
      (box && box !== document.body ? box : document.scrollingElement).scrollBy(dx, dy);
    }
  }, { passive: false, capture: true });

  /* กำลังลากอยู่ = ห้ามจอเลื่อนตามนิ้ว (ไม่งั้นเบราว์เซอร์ยกเลิก pointer แล้วการลากหลุด) */
  document.addEventListener('touchmove', function (e) { if (st && st.on) e.preventDefault(); }, { passive: false, capture: true });
  document.addEventListener('contextmenu', function (e) { if (st) e.preventDefault(); }, true);

  function end(e, cancel) {
    if (!st || e.pointerId !== st.id) return;
    if (!st.on) { cleanup(); return; }
    var x = e.clientX || st.x, y = e.clientY || st.y, src = st.src;
    /* Sprint 2A — กดค้างแล้วปล่อยโดยไม่ขยับ = "กดค้าง" (เข้าโหมดเลือกงานบนมือถือ) ไม่ใช่การลาก
     * ยกเลิกการลากด้วย dragend อย่างเดียว (ไม่มี drop ตัวจัดการลากเดิมเก็บกวาดเอง) แล้วส่ง orbit:longpress
     * ให้ของที่กดค้าง mobile.js รับต่อ — กดค้างแล้วขยับนิ้วยังเป็นการลากย้ายเหมือนเดิม */
    if (!cancel && !st.moved) {
      fire(src, 'dragend', x, y);
      var lp = null;
      try { lp = new CustomEvent('orbit:longpress', { bubbles: true, detail: { x: x, y: y } }); } catch (er) { /* เบราว์เซอร์เก่า */ }
      /* กลืนเฉพาะคลิกจริงที่ตามมาหลังปล่อยนิ้ว — คลิกที่สคริปต์สั่ง (เลือกแถว) ต้องผ่าน */
      var sw = function (ev) {
        if (ev.isTrusted === false) return;
        ev.stopPropagation(); ev.preventDefault(); document.removeEventListener('click', sw, true);
      };
      document.addEventListener('click', sw, true);
      setTimeout(function () { document.removeEventListener('click', sw, true); }, 400);
      e.preventDefault();
      cleanup();
      if (lp && src.isConnected) src.dispatchEvent(lp);
      return;
    }
    var el = cancel ? null : under(x, y);
    if (el) {
      var okDrop = !fire(el, 'dragover', x, y);       // ตัวจัดการที่รับวางต้อง preventDefault ใน dragover
      if (okDrop || true) fire(el, 'drop', x, y);
    }
    fire(src, 'dragend', x, y);
    /* กลืนคลิกที่ตามมาหลังปล่อยนิ้ว ไม่ให้ไปเปิดงาน */
    var swallow = function (ev) { ev.stopPropagation(); ev.preventDefault(); document.removeEventListener('click', swallow, true); };
    document.addEventListener('click', swallow, true);
    setTimeout(function () { document.removeEventListener('click', swallow, true); }, 400);
    e.preventDefault();
    cleanup();
  }
  document.addEventListener('pointerup', function (e) { end(e, false); }, true);
  document.addEventListener('pointercancel', function (e) { end(e, true); }, true);

})(window);

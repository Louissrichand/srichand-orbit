/* Orbit — ตัวจัดการซิงก์กับส่วนกลาง
 *
 * นโยบายที่ใช้:
 *  - แก้อะไรก็เห็นผลทันทีในเครื่อง แล้วค่อยส่งขึ้นหลังหยุดพิมพ์
 *  - ถามหางานใหม่จากเพื่อนร่วมทีมเป็นระยะ ถ้าเราไม่มีของค้างส่งจึงดึงมาทับ
 *  - ถ้าชนกันจริง หยุดทุกอย่างแล้วถามผู้ใช้ ไม่ตัดสินใจแทน
 */
(function (global) {
  'use strict';

  var S = global.Store;
  var C = global.OrbitCloud;
  var A = global.OrbitAuth;
  var cfg = global.OrbitConfig || {};

  var state = {
    mode: 'local',      // local | team
    status: 'idle',     // idle | loading | syncing | synced | offline | conflict | error
    lastSync: null,
    error: null,
    dirty: false
  };

  var listeners = [];
  var pushTimer = null;
  var pollTimer = null;
  var pushing = false;
  var queued = false;
  var inflight = null;

  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (f) { f(state); }); }
  function set(status, extra) {
    state.status = status;
    if (extra) Object.keys(extra).forEach(function (k) { state[k] = extra[k]; });
    emit();
  }

  /* ---------- งานที่ค้างส่ง ต้องรอดข้ามการรีโหลด ----------
   * ข้อมูลในเครื่องบันทึกลง localStorage ทุกครั้งอยู่แล้ว แต่ "ยังไม่ได้ส่งขึ้น" อยู่แค่ในหน่วยความจำ
   * ถ้าการเข้าสู่ระบบหมดอายุแล้วต้องไปหน้า Microsoft แอปจะโหลดใหม่ เปิดมาแล้วดึงของกลางทับ งานที่ค้างหาย
   * จึงจดไว้ในเครื่องว่ามีงานค้างส่ง พร้อมรุ่นของไฟล์กลาง (eTag) ที่งานนั้นต่อยอดมา และเป็นของใคร */
  var PENDING = 'orbit.sync.pending';

  function readPending() {
    try { return JSON.parse(global.localStorage.getItem(PENDING) || 'null'); } catch (e) { return null; }
  }
  function markPending() {
    if (readPending()) return;                 // จดรุ่นตั้งต้นไว้ครั้งแรกเท่านั้น
    var p = A.profile();
    try {
      global.localStorage.setItem(PENDING, JSON.stringify({ base: C.eTag || null, who: p ? p.id : null, at: Date.now() }));
    } catch (e) { /* ที่เก็บเต็มหรือโหมดส่วนตัว ทำได้แค่ในหน่วยความจำ */ }
  }
  function clearPending() {
    try { global.localStorage.removeItem(PENDING); } catch (e) { /* ไม่เป็นไร */ }
  }

  /** เริ่มโหมดทีม: ดึงของกลางมาก่อน ถ้ายังไม่มีไฟล์ก็สร้างจากของในเครื่อง */
  function start() {
    state.mode = 'team';
    set('loading');
    var pend = readPending();
    var me = A.profile();
    // งานค้างของคนอื่นในเครื่องเดียวกัน (สลับบัญชี) ไม่เอามาปน
    if (pend && me && pend.who && pend.who !== me.id) { clearPending(); pend = null; }
    var conflictAtStart = false;

    return C.load().then(function (res) {
      if (res && res.db) {
        if (pend) {
          /* มีงานค้างส่งจากรอบก่อน (เช่น เข้าสู่ระบบหมดอายุกลางคัน)
           * ไฟล์กลางยังเป็นรุ่นเดิม = ไม่มีใครแก้ระหว่างนั้น ส่งของเราขึ้นได้เลย
           * มีคนแก้แล้ว = ไม่ตัดสินใจแทน เก็บของเราไว้ในเครื่อง แล้วให้เลือกแบบข้อมูลชนกัน */
          if (pend.base && C.eTag === pend.base) return C.push(S.snapshotJSON()).then(clearPending);
          conflictAtStart = true;
          return null;
        }
        S.replaceDb(res.db);
        return null;
      }
      /* ยังไม่เคยมีไฟล์กลาง — ตั้งต้นด้วยฐานข้อมูลองค์กรเปล่า ไม่ยกข้อมูลตัวอย่างในเครื่องขึ้นไป
       * (เดิมยกของในเครื่องขึ้นไป ทำให้คน/โปรเจกต์ตัวอย่างไปปนอยู่ในรายชื่อจริงของทีม)
       * ใส่เฉพาะคนที่ล็อกอินอยู่ตอนนี้ แล้วค่อยส่งขึ้นไป */
      S.replaceDb(S.emptyOrgDb());
      if (me) S.adoptIdentity(me);
      return C.push(S.snapshotJSON()).then(clearPending);
    }).then(function () {
      var p = A.profile();
      if (p) S.adoptIdentity(p);        // ทำให้คนที่ล็อกอินเป็นสมาชิกจริง
      S.setRemoteSave(schedulePush);
      if (conflictAtStart) {
        state.dirty = true;
        set('conflict', { error: null });
        startPolling();
        return true;
      }
      state.dirty = false;
      set('synced', { lastSync: Date.now(), error: null });
      startPolling();
      return true;
    }).catch(function (e) {
      // เข้าที่เก็บกลางไม่ได้ ต้องไม่ทำเหมือนกำลังซิงก์อยู่ ไม่งั้นผู้ใช้เข้าใจผิดว่างานถูกเก็บแล้ว
      var msg = describe(e);
      state.mode = 'local';
      S.setRemoteSave(null);
      set('error', { error: msg });
      // ส่งต่อเป็นข้อความที่คนอ่านรู้เรื่อง ไม่ใช่ 'Graph 403'
      var wrapped = new Error(msg);
      wrapped.cause = e;
      wrapped.authExpired = !!(e && e.authExpired);
      throw wrapped;
    });
  }

  function describe(e) {
    if (!e) return 'ไม่ทราบสาเหตุ';
    if (e.authExpired) return 'การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง';
    if (e.status === 403) return 'บัญชีนี้ไม่มีสิทธิ์เข้าถึงที่เก็บข้อมูล';
    if (e.status === 404) return 'ไม่พบไซต์หรือโฟลเดอร์ที่ตั้งค่าไว้';
    if (e.status === 401) return 'สิทธิ์หมดอายุ ลองเข้าสู่ระบบใหม่';
    return e.message || String(e);
  }

  /** หน่วงไว้ก่อนส่ง เพื่อไม่ให้พิมพ์ทีละตัวแล้วยิงขึ้นทุกครั้ง */
  function schedulePush() {
    if (state.mode !== 'team') return;
    state.dirty = true;
    markPending();
    if (state.status === 'expired') { emit(); return; }   // รอเข้าสู่ระบบใหม่ งานเก็บในเครื่องไว้แล้ว
    if (state.status !== 'conflict') set('syncing');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(doPush, cfg.pushDelayMs || 1500);
  }

  /* ส่งขึ้นจริง คืนสัญญาที่ได้ true เมื่อสำเร็จ false เมื่อไม่สำเร็จ
   * ไม่โยน error ออกไป เพราะถูกเรียกจากตัวจับเวลาด้วย
   * แต่ต้องบอกผลได้ เพราะตอนออกจากระบบต้องรู้ว่าบันทึกทันหรือยัง */
  function doPush() {
    if (state.mode !== 'team' || state.status === 'conflict') return Promise.resolve(true);
    if (pushing) { queued = true; return inflight || Promise.resolve(true); }
    pushing = true;

    inflight = C.push(S.snapshotJSON()).then(function () {
      pushing = false;
      state.dirty = false;
      clearPending();
      set('synced', { lastSync: Date.now(), error: null });
      if (queued) { queued = false; return doPush(); }
      return true;
    }, function (e) {
      pushing = false;
      if (e.conflict) {
        set('conflict');
      } else if (e.authExpired) {
        /* หมดอายุ: งานยังอยู่ในเครื่องและจดไว้แล้วว่าค้างส่ง กดเข้าสู่ระบบใหม่แล้วจะส่งต่อเอง */
        set('expired', { error: describe(e) });
      } else if (!global.navigator.onLine) {
        set('offline', { error: null });
      } else {
        set('error', { error: describe(e) });
      }
      return false;
    });
    return inflight;
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (state.mode !== 'team') return;
      if (state.dirty || pushing || state.status === 'conflict' || state.status === 'expired') return;
      C.remoteChanged().then(function (changed) {
        if (!changed) return;
        return C.load().then(function (res) {
          if (res && res.db && !state.dirty) {
            S.replaceDb(res.db);
            set('synced', { lastSync: Date.now() });
          }
        });
      }).catch(function (e) {
        // หมดอายุต้องบอก ไม่งั้นคนนึกว่ายังเห็นงานล่าสุดของเพื่อนอยู่ อย่างอื่นรอรอบหน้า
        if (e && e.authExpired) set('expired', { error: describe(e) });
      });
    }, cfg.pollMs || 15000);
  }

  /* ---------- ทางออกเมื่อข้อมูลชนกัน ---------- */

  /** เก็บของเรา เขียนทับของกลาง */
  function resolveKeepMine() {
    set('syncing');
    return C.forcePush(S.snapshotJSON()).then(function () {
      state.dirty = false;
      clearPending();
      set('synced', { lastSync: Date.now(), error: null });
    }).catch(function (e) { set('error', { error: describe(e) }); });
  }

  /** ทิ้งของเรา เอาของกลางมาแทน */
  function resolveTakeTheirs() {
    set('loading');
    return C.load().then(function (res) {
      if (res && res.db) S.replaceDb(res.db);
      state.dirty = false;
      clearPending();
      set('synced', { lastSync: Date.now(), error: null });
    }).catch(function (e) { set('error', { error: describe(e) }); });
  }

  /** ดึงของกลางเดี๋ยวนี้ (ปุ่มซิงก์เอง) */
  function pullNow() {
    if (state.mode !== 'team') return Promise.resolve();
    set('loading');
    return C.load().then(function (res) {
      if (res && res.db) S.replaceDb(res.db);
      state.dirty = false;
      clearPending();
      set('synced', { lastSync: Date.now(), error: null });
    }).catch(function (e) { set('error', { error: describe(e) }); });
  }

  function stop() {
    clearTimeout(pushTimer);
    clearInterval(pollTimer);
    S.setRemoteSave(null);
    state.mode = 'local';
    set('idle');
  }

  global.addEventListener('online', function () {
    if (state.mode === 'team' && state.status === 'offline') schedulePush();
  });
  global.addEventListener('offline', function () {
    if (state.mode === 'team') set('offline');
  });

  global.OrbitSync = {
    state: state, onChange: onChange, start: start, stop: stop,
    pullNow: pullNow,
    resolveKeepMine: resolveKeepMine, resolveTakeTheirs: resolveTakeTheirs,
    flush: function () { clearTimeout(pushTimer); return doPush(); }
  };

})(window);

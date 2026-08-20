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

  /** เริ่มโหมดทีม: ดึงของกลางมาก่อน ถ้ายังไม่มีไฟล์ก็สร้างจากของในเครื่อง */
  function start() {
    state.mode = 'team';
    set('loading');

    return C.load().then(function (res) {
      if (res && res.db) {
        S.replaceDb(res.db);
        return null;
      }
      // ยังไม่เคยมีไฟล์กลาง — ยกของในเครื่องขึ้นไปตั้งต้น
      return C.push(S.snapshotJSON());
    }).then(function () {
      var p = A.profile();
      if (p) S.adoptIdentity(p);        // ทำให้คนที่ล็อกอินเป็นสมาชิกจริง
      S.setRemoteSave(schedulePush);
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
      throw wrapped;
    });
  }

  function describe(e) {
    if (!e) return 'ไม่ทราบสาเหตุ';
    if (e.status === 403) return 'บัญชีนี้ไม่มีสิทธิ์เข้าถึงที่เก็บข้อมูล';
    if (e.status === 404) return 'ไม่พบไซต์หรือโฟลเดอร์ที่ตั้งค่าไว้';
    if (e.status === 401) return 'สิทธิ์หมดอายุ ลองเข้าสู่ระบบใหม่';
    return e.message || String(e);
  }

  /** หน่วงไว้ก่อนส่ง เพื่อไม่ให้พิมพ์ทีละตัวแล้วยิงขึ้นทุกครั้ง */
  function schedulePush() {
    if (state.mode !== 'team') return;
    state.dirty = true;
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
      set('synced', { lastSync: Date.now(), error: null });
      if (queued) { queued = false; return doPush(); }
      return true;
    }, function (e) {
      pushing = false;
      if (e.conflict) {
        set('conflict');
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
      if (state.dirty || pushing || state.status === 'conflict') return;
      C.remoteChanged().then(function (changed) {
        if (!changed) return;
        return C.load().then(function (res) {
          if (res && res.db && !state.dirty) {
            S.replaceDb(res.db);
            set('synced', { lastSync: Date.now() });
          }
        });
      }).catch(function () { /* ถามไม่สำเร็จก็รอรอบหน้า */ });
    }, cfg.pollMs || 15000);
  }

  /* ---------- ทางออกเมื่อข้อมูลชนกัน ---------- */

  /** เก็บของเรา เขียนทับของกลาง */
  function resolveKeepMine() {
    set('syncing');
    return C.forcePush(S.snapshotJSON()).then(function () {
      state.dirty = false;
      set('synced', { lastSync: Date.now(), error: null });
    }).catch(function (e) { set('error', { error: describe(e) }); });
  }

  /** ทิ้งของเรา เอาของกลางมาแทน */
  function resolveTakeTheirs() {
    set('loading');
    return C.load().then(function (res) {
      if (res && res.db) S.replaceDb(res.db);
      state.dirty = false;
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

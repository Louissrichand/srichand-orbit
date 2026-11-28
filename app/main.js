/* Orbit — interaction layer
 * routing (hash), event delegation, drag & drop, keyboard, modals
 */
(function (global) {
  'use strict';

  var S = global.Store, R = global.Render, L = global.I18N.t, I = global.Icons.icon;
  var esc = function (s) { return R.esc(s); };

  var $sidebar = document.getElementById('sidebar');
  var $topbar  = document.getElementById('topbar');
  var $view    = document.getElementById('view');
  var $drawer  = document.getElementById('drawer');
  var $dwBack  = document.getElementById('drawerBackdrop');
  var $modal   = document.getElementById('modal');
  var $mdBack  = document.getElementById('modalBackdrop');
  var $toast   = document.getElementById('toast');

  var state = {
    route: { type: 'home' },
    openTaskId: null,
    calOffset: 0,
    /* กล่องแจ้งเตือน — แท็บและตัวกรองอยู่แค่ในหน้าจอ (การเรียงกับความหนาแน่นจำไว้ใน db.personal) */
    /* Sprint 2B — open: งานที่กางรายการรวมกลุ่มไว้ (taskId -> true)  snoozed: กำลังดูรายการที่เลื่อนเตือนไว้ */
    inbox: { tab: 'activity', f: {}, open: {}, snoozed: false },
    /* งานของฉัน — เซกชันที่ยุบไว้ และวันที่ปฏิทินกำลังแสดง (มุมมอง/ตัวกรองจำไว้ใน db.personal) */
    mt: { collapsed: {}, calAnchor: null },
    home: { mine: 'upcoming', assigned: 'week', allProjects: false, edit: false },
    reopenAddIn: null,
    sel: {},                 // งานที่ถูกเลือกไว้ (id -> true)
    views: {},               // ตัวกรองต่อโปรเจกต์
    tlZoom: 'day',           // ระดับซูมของไทม์ไลน์
    ganttCollapsed: {},
    ganttScroll: null,
    ganttSearch: null,       // null = ยังไม่เปิดช่องค้นหา, '' = เปิดแต่ยังไม่พิมพ์
    optPage: 'root',         // หน้าย่อยที่เปิดอยู่ในแผงตัวเลือก Gantt
    viewName: 'Gantt',
    viewIcon: '📊',
    tlScrollLeft: null,      // ตำแหน่งเลื่อนไทม์ไลน์ (null = ให้เลื่อนไปวันนี้เอง)
    suppressHash: false,
    auditFilter: { group: '', q: '' },  // ตัวกรองบันทึกการทำงานในหน้าผู้ดูแล
    setTab: 'general',                  // แท็บที่เปิดอยู่ในหน้าตั้งค่าของฉัน
    openThreads: {},         // เธรดความเห็นที่กางอยู่ (รหัสความเห็นแม่ -> true)
    editStory: null,         // ความเห็นที่กำลังแก้อยู่
    flashStory: null,        // ความเห็นที่ต้องเลื่อนไปหาและไฮไลต์ครั้งถัดไปที่วาดแผงงาน
    subView: { sort: 'manual', hideDone: false, mine: false },   // เรียง/กรองงานย่อยในแผงงาน
    /* 2b — มุมมองของโปรเจกต์ */
    svWork: {},              // สำเนาที่กำลังแก้ของแท็บที่บันทึกไว้ (รหัสแท็บ -> มุมมอง) ยังไม่บันทึกทับจนกว่าจะกด
    subOpen: {},             // งานที่กางงานย่อยไว้ในรายการ
    cursor: null,            // งานที่ถูกชี้อยู่ในรายการ (Enter เพิ่มงานต่อจากแถวนี้ Ctrl+↑/↓ ย้ายแถวนี้)
    selAnchor: null,         // จุดเริ่มของการเลือกช่วงด้วย Shift+คลิก
    calx: {},                // วันที่ที่ปฏิทินแต่ละขอบเขตกำลังแสดง
    /* 2c — ค้นหาขั้นสูง เงื่อนไขอยู่แค่ในหน้าจอจนกว่าจะกดบันทึก (ของที่บันทึกแล้วอยู่ใน db.personal) */
    adv: { conds: [], mode: 'list', open: false, help: false },
    csv: null,               // ไฟล์ CSV ที่กำลังจับคู่คอลัมน์ { pid, file, text, enc, map }
    /* 3b — คำตอบที่กรอกค้างในหน้าส่งฟอร์ม ตัวแก้ฟอร์ม ตัวแก้ชนิดงาน ตัวแก้เทมเพลตงาน ตัวสร้างรายงานสถานะ */
    ff: null, fe: null, te: null, tte: null, sb: null, npTab: 'blank', ttSec: null
  };

  /* 4b — ที่เสียบของส่วนขยาย (ดู EXT_API ท้ายไฟล์) */
  var EXT = { acts: [], changes: [], routes: {}, projViews: {}, pfViews: {}, after: [], openRoute: null, deep: [], hooks: {} };

  /* มุมมองที่ทำงานอยู่ของโปรเจกต์
   * อยู่บนแท็บที่บันทึกไว้ = สำเนาของแท็บนั้น (แก้แล้วกด "บันทึกมุมมอง" ถึงจะทับของทีม)
   * อยู่บนแท็บในตัว = มุมมองส่วนตัวของคนนี้ จำลง db.personal เองทุกครั้งที่วาด (ดู persistView) */
  function viewFor(projectId) {
    var r = state.route;
    if (r.type === 'project' && r.id === projectId && r.sv) {
      var sv = S.savedView(projectId, r.sv);
      if (sv) {
        if (!state.svWork[r.sv]) state.svWork[r.sv] = S.fillView(S.clone(sv.view || {}));
        return S.fillView(state.svWork[r.sv]);
      }
    }
    if (!state.views[projectId]) state.views[projectId] = S.projView(projectId);
    /* มุมมองที่โหลดมาจากที่บันทึกไว้อาจเก่ากว่าตัวเลือกที่มีตอนนี้ เติมคีย์ที่ขาดทุกครั้ง
     * ถูกกว่าการไล่เช็ค undefined ทีละจุดตอนวาด */
    return S.fillView(state.views[projectId]);
  }

  /** แท็บที่บันทึกไว้ซึ่งมีการแก้ค้างอยู่ (คืนรหัสแท็บ หรือ null) */
  function dirtySv() {
    var r = state.route;
    if (r.type !== 'project' || !r.sv || !state.svWork[r.sv]) return null;
    var sv = S.savedView(r.id, r.sv);
    if (!sv) return null;
    var a = JSON.stringify(S.viewDiff(S.clone(state.svWork[r.sv])));
    var b = JSON.stringify(S.viewDiff(S.fillView(S.clone(sv.view || {}))));
    return a !== b ? r.sv : null;
  }

  /** จำมุมมองส่วนตัวของแท็บในตัวลงข้อมูลกลาง (เงียบ ๆ ไม่วาดใหม่) */
  function persistView() {
    var r = state.route;
    if (r.type !== 'project' || r.sv || !state.views[r.id] || !S.isActive()) return;
    S.setProjView(r.id, state.views[r.id]);
  }

  var $scrim = document.getElementById('sbScrim');

  /** เมนูข้างบนมือถือ — เลื่อนเข้ามาทับ พร้อมฉากทึบให้แตะปิด */
  function setSidebar(open) {
    var sb = document.getElementById('sidebar');
    /* Sprint 1A — ปิดเมนูมือถือแล้วลืมหมวดที่แตะดูค้างไว้ เปิดใหม่ต้องเห็นหมวดของหน้าที่อยู่จริง
     * เดิมแตะดู "กลยุทธ์" แล้วปิดเมนูไปทำงานต่อ เปิดเมนูอีกครั้งยังค้างที่กลยุทธ์ หาเมนูของหน้าปัจจุบันไม่เจอ */
    if (!open && sb.classList.contains('open') && state.navPick) {
      state.navPick = null;
      $sidebar.innerHTML = R.sidebar(state.route, null);
    }
    sb.classList.toggle('open', !!open);
    if ($scrim) $scrim.classList.toggle('open', !!open);
  }
  function closeSidebar() { setSidebar(false); }

  /** จอสัมผัสไม่มี hover — ใช้ตัดสินว่าจะเปิดการลากไหม */
  function isTouch() {
    /* 4b — ลากด้วยนิ้วผ่าน touch.js (กดค้างแล้วลาก) ต้องผ่านตัวจัดการลากชุดเดิมได้ */
    if (global.OrbitTouch && global.OrbitTouch.active) return false;
    try { return global.matchMedia('(hover: none)').matches; } catch (e) { return false; }
  }

  function selCount() { return Object.keys(state.sel).length; }
  function clearSel() { state.sel = {}; }

  /* อัปเดตเฉพาะสิ่งที่เปลี่ยนตอนเลือกงาน
   * ถ้า re-render ทั้งหน้าทุกครั้งที่ติ๊ก จอจะกระตุกและ scroll เด้งกลับด้านบน */
  function updateSelectionUI(id) {
    var on = !!state.sel[id];
    if (id) {
      var nodes = $view.querySelectorAll('.row[data-id="' + id + '"], .card[data-id="' + id + '"], .tr[data-id="' + id + '"]');
      Array.prototype.forEach.call(nodes, function (n) {
        if (on) n.classList.add('sel'); else n.classList.remove('sel');
        var box = n.querySelector('.selbox');
        if (box) { if (on) box.classList.add('on'); else box.classList.remove('on'); }
      });
    }
    var html = R.bulkbar(state.sel);
    var bar = $view.querySelector('.bulkbar');
    if (bar && html) bar.outerHTML = html;
    else if (bar) bar.parentNode.removeChild(bar);
    else if (html) $view.insertAdjacentHTML('beforeend', html);
    /* แถบโผล่/หายระหว่างที่ข้อความแจ้งยังค้างอยู่ — ยกหรือลดข้อความตามแถบ (ดู toast) */
    var nb = $view.querySelector('.bulkbar');
    $toast.classList.toggle('above-bulk', !!nb);
    if (nb) $toast.style.setProperty('--bulk-h', nb.getBoundingClientRect().height + 'px');
  }

  /** ล้างการเลือกแล้วเก็บกวาดหน้าจอโดยไม่ต้อง re-render ทั้งหน้า */
  function clearSelUI() {
    state.sel = {};
    syncSelDom();
    updateSelectionUI(null);
  }

  /** Sprint 1A — ทำไฮไลต์ทุกแถวบนจอให้ตรงกับ state.sel
   *  เดิมล้างเฉพาะแถวที่อยู่ใน state.sel ถ้าสถานะถูกล้างไปก่อน (เช่นหลังมอบหมายหลายงาน) แถวยังติดไฮไลต์
   *  จอบอกว่าเลือก 3 งาน แต่คำสั่งถัดไปเห็นว่าไม่ได้เลือกอะไร — ไล่ทุกแถวแทน จอกับสถานะจึงตรงกันเสมอ */
  function syncSelDom() {
    Array.prototype.forEach.call($view.querySelectorAll('.row[data-id], .card[data-id], .tr[data-id]'), function (n) {
      var on = !!state.sel[n.dataset.id];
      n.classList.toggle('sel', on);
      var box = n.querySelector('.selbox');
      if (box) box.classList.toggle('on', on);
    });
  }

  /* ---------- toast ---------- */

  var toastTimer = null;
  /* Sprint 1A — ข้อความแจ้งที่มีปุ่ม (ย้อนกลับ) ค้างไว้ 9 วินาที เอาเมาส์ชี้แล้วหยุดนับ
   * เดิมหายใน 3.6 วินาที คนอ่านไม่ทันก็กดไม่ทัน และกล่องยังปล่อยคลิกทะลุไปโดนแถวข้างใต้ (CSS)
   * บอก Ctrl+Z ไว้ข้างปุ่มด้วย (เฉพาะเครื่องที่มีเมาส์/คีย์บอร์ด) คนที่พลาดปุ่มจะรู้ว่ายังย้อนได้ */
  var toastLeft = 0, toastStart = 0;
  function armToast(ms) {
    clearTimeout(toastTimer);
    toastLeft = ms;
    toastStart = Date.now();
    toastTimer = setTimeout(function () { $toast.classList.remove('show'); }, ms);
  }
  function toast(msg, actionLabel, actionAttr) {
    var kbd = actionAttr === 'undo' && !isTouch() ? ' <span class="toast-kbd">Ctrl+Z</span>' : '';
    $toast.innerHTML = '<span class="toast-msg">' + R.esc(msg) + '</span>' +
      (actionLabel ? ' <button data-act="' + actionAttr + '">' + R.esc(actionLabel) + '</button>' + kbd : '');
    $toast.classList.toggle('has-act', !!actionLabel);
    /* แถบแก้หลายงานอยู่ตำแหน่งเดียวกับกล่องแจ้งเตือน (ล่างกลางจอ) — ข้อความ "ทำไม่ได้เพราะ…" ทับปุ่มในแถบ
     * มีแถบอยู่ = ยกกล่องแจ้งเตือนขึ้นไปเหนือแถบ (styles.css .toast.above-bulk) */
    var bb = document.querySelector('.bulkbar');
    $toast.classList.toggle('above-bulk', !!bb);
    if (bb) $toast.style.setProperty('--bulk-h', bb.getBoundingClientRect().height + 'px');
    $toast.classList.add('show');
    armToast(actionLabel ? 9000 : 4500);
  }
  $toast.addEventListener('mouseenter', function () {
    if (!$toast.classList.contains('show')) return;
    clearTimeout(toastTimer);
    toastLeft = Math.max(2000, toastLeft - (Date.now() - toastStart));
  });
  $toast.addEventListener('mouseleave', function () {
    if ($toast.classList.contains('show')) armToast(toastLeft);
  });

  /* ---------- theme ---------- */

  /** ตั้งภาษาให้ตรงกับที่ผู้ใช้เลือก ถ้ายังไม่เคยเลือกให้เดาจากเบราว์เซอร์
   *
   * ธีมกับภาษาเป็นค่าของแต่ละคน ไม่ใช่ของฐานข้อมูล
   * ในโหมดทีมทุกคนใช้ข้อมูลก้อนเดียวกัน ถ้าเก็บรวมจะเปลี่ยนตามกันหมด */
  function applyLang() {
    global.I18N.setLang(S.pref('lang') || global.I18N.detect());
  }

  function applyTheme() {
    var th = S.pref('theme') || 'auto';
    if (th === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th);

    /* โหมดแน่นกับเลขบรรทัดเป็นคลาสบน body แล้วให้ CSS จัดการต่อ */
    document.body.classList.toggle('compact', !!S.pref('compact'));
    document.body.classList.toggle('rownum', !!S.pref('rowNumbers'));
  }

  /* ---------- hash routing ---------- */

  function buildHash() {
    var r = state.route, parts;
    if (r.type === 'project') parts = ['project', r.id, r.sv || r.view].concat(r.view === 'pages' && r.page ? [r.page] : []);
    else if (r.type === 'pages') parts = r.page ? ['pages', r.page] : ['pages'];
    else if (r.type === 'portfolio') parts = ['portfolio', r.id, r.sv || r.view || 'list'];
    else if (r.type === 'team') parts = ['team', r.id, r.view || 'overview'];
    else if (r.type === 'goals') parts = ['goals', r.view || 'company'];
    else if (r.type === 'goal') parts = ['goal', r.id];
    else if (r.type === 'search') parts = r.ss ? ['saved', r.ss] : (r.q ? ['search', encodeURIComponent(r.q)] : ['search']);
    else if (r.type === 'tag') parts = ['tag', encodeURIComponent(r.name)];
    else if (r.type === 'noaccess') parts = ['project', r.id];
    else if (r.type === 'trash' && r.pid) parts = ['trash', r.pid];
    else if (r.type === 'profile') parts = ['profile', r.id];
    else if (r.type === 'form') parts = ['form', r.id];
    else if (EXT.routes[r.type]) parts = EXT.routes[r.type].hash(r);
    else parts = [r.type];
    if (state.openTaskId) parts.push(state.openTaskId);
    return '#/' + parts.join('/');
  }

  /* กลับจากหน้าล็อกอิน Microsoft ผลจะมาใน hash (#code=...&state=...)
   * ต้องปล่อยไว้ให้ MSAL อ่านก่อน ถ้าเขียนทับเป็น #/home การล็อกอินจะหายเงียบ
   * MSAL ล้าง hash เองเมื่ออ่านเสร็จ จากนั้นค่อยกลับมาตั้งเส้นทางตามปกติ */
  function authResponseInHash() {
    var h = global.location.hash || '';
    return /^#\/?(?:.*&)?(?:code|error)=/.test(h) && h.indexOf('state=') !== -1;
  }

  function syncHash() {
    if (authResponseInHash()) return;
    var want = buildHash();
    if (global.location.hash === want) return;
    state.suppressHash = true;
    global.location.hash = want;
    setTimeout(function () { state.suppressHash = false; }, 0);
  }

  /* ลิงก์ตรงถึงความเห็นต่อท้ายด้วย /c_<รหัสความเห็น> และลิงก์สั้นถึงงาน #/task/<รหัสงาน>
   * เดิม #/task/... อ่านได้เฉพาะตอนเปิดแอปครั้งแรก คนที่เปิดแอปค้างไว้แล้ววางลิงก์ลงช่องที่อยู่
   * จะไม่เกิดอะไรขึ้นเลย เพราะตัวรับ hashchange ไม่รู้จักรูปแบบนี้ */
  function readHash() {
    if (authResponseInHash()) return null;
    var raw = (global.location.hash || '').replace(/^#\/?/, '');
    if (!raw) return null;
    var seg = raw.split('/').filter(function (s) { return s !== ''; });
    if (!seg.length) return null;

    var storyId = null;
    if (seg[seg.length - 1].indexOf('c_') === 0) storyId = seg.pop().slice(2);
    if (!seg.length) return null;
    var taskId = null;
    if (seg[seg.length - 1].indexOf('t_') === 0) taskId = seg.pop();

    var out = routeOf(seg, taskId);
    if (out) out.storyId = storyId;
    return out;
  }

  /** งานที่เปิดจากลิงก์สั้น — พาไปโปรเจกต์แรกของงานที่เข้าได้ ไม่มีก็ไปงานของฉัน */
  function homeRouteOf(taskId) {
    var homes = S.projectsOfTask(taskId).filter(function (x) { return S.projectAccess(x.project.id); });
    if (homes.length) {
      var pid = homes[0].project.id;
      var okV = S.projectViews(pid);
      var dv = homes[0].project.defaultView;
      return { type: 'project', id: pid, view: okV.indexOf(dv) >= 0 ? dv : okV[0] };
    }
    return { type: 'mytasks' };
  }

  function routeOf(seg, taskId) {
    var type = seg.length ? seg[0] : 'task';
    /* 4b — หน้าที่ส่วนขยายลงทะเบียนไว้ (ภาระงาน ไทม์ชีต รายงาน) */
    if (EXT.routes[type]) {
      var xr = EXT.routes[type].parse(seg);
      return xr ? { route: xr, taskId: taskId } : null;
    }
    if (type === 'task') {
      if (!taskId || !S.task(taskId)) return null;
      return { route: homeRouteOf(taskId), taskId: taskId };
    }
    if (type === 'project' && seg[1]) {
      var p = S.project(seg[1]);
      if (!p) return null;
      /* ยอมเฉพาะมุมมองที่โปรเจกต์นี้เปิดอยู่ ลิงก์เก่าที่ชี้ไปมุมมองที่ถูกปิดแล้ว
       * ต้องตกไปมุมมองแรกที่เหลือ ไม่ใช่เปิดมาแล้วเจอหน้าว่าง */
      var okViews = S.projectViews(seg[1]);
      /* แท็บที่บันทึกไว้อยู่ในตำแหน่งเดียวกับมุมมอง (#/project/<id>/v_…) */
      var svId = seg[2] && seg[2].indexOf('v_') === 0 ? seg[2]
        : (!seg[2] && p.defaultTab ? p.defaultTab : null);
      var sv = svId ? S.savedView(seg[1], svId) : null;
      if (sv) return { route: { type: 'project', id: seg[1], view: sv.kind || 'list', sv: sv.id }, taskId: taskId };
      if (seg[2] === 'pages' && okViews.indexOf('pages') >= 0) return { route: { type: 'project', id: seg[1], view: 'pages', page: seg[3] && S.pageLoc(seg[3]) ? seg[3] : null }, taskId: taskId };
      var v = seg[2] || p.defaultView || okViews[0];
      if (okViews.indexOf(v) < 0) v = okViews[0];
      return { route: { type: 'project', id: seg[1], view: v }, taskId: taskId };
    }
    if (type === 'portfolio' && seg[1]) {
      var pfx = S.portfolio(seg[1]);
      if (!pfx) return null;
      /* 4a — แท็บที่บันทึกไว้ #/portfolio/<id>/pv_… และแท็บเริ่มต้นเมื่อไม่ระบุ */
      var pvId = seg[2] && seg[2].indexOf('pv_') === 0 ? seg[2] : (!seg[2] && pfx.defaultTab ? pfx.defaultTab : null);
      if (pvId && S.pfSavedView(seg[1], pvId)) return { route: { type: 'portfolio', id: seg[1], view: 'list', sv: pvId }, taskId: taskId };
      var pv = seg[2] || 'list';
      var pok = R.PF_TABS.some(function (x) { return x[0] === pv; });
      return { route: { type: 'portfolio', id: seg[1], view: pok ? pv : 'list' }, taskId: taskId };
    }
    /* 4a — ทีม #/team/<id>/<แท็บ> หน้ารวมทีม #/teams เป้าหมาย #/goals/<แท็บ> และ #/goal/<id> */
    if (type === 'team' && seg[1]) {
      if (!S.team(seg[1])) return null;
      var tv = R.TEAM_TABS.some(function (x) { return x[0] === seg[2]; }) ? seg[2] : 'overview';
      return { route: { type: 'team', id: seg[1], view: tv }, taskId: taskId };
    }
    if (type === 'teams') return { route: { type: 'teams' }, taskId: taskId };
    if (type === 'goals') return { route: { type: 'goals', view: seg[1] || 'company' }, taskId: taskId };
    if (type === 'goal' && seg[1]) return { route: { type: 'goal', id: seg[1] }, taskId: taskId };
    if (type === 'search') {
      var sq = '';
      try { sq = seg[1] ? decodeURIComponent(seg[1]) : ''; } catch (e) { sq = seg[1] || ''; }
      return { route: { type: 'search', q: sq }, taskId: taskId };
    }
    /* 2c — การค้นหาที่บันทึกไว้ #/saved/<id> และหน้าแท็ก #/tag/<ชื่อ> */
    if (type === 'saved' && seg[1]) {
      var ssv = S.savedSearch(seg[1]);
      if (!ssv) return null;
      return { route: { type: 'search', q: ssv.q, ss: ssv.id }, taskId: taskId, ss: ssv };
    }
    if (type === 'tag' && seg[1]) {
      var tg;
      try { tg = decodeURIComponent(seg[1]); } catch (e2) { tg = seg[1]; }
      return { route: { type: 'tag', name: tg }, taskId: taskId };
    }
    if (type === 'trash' && seg[1] && S.project(seg[1])) {
      return { route: { type: 'trash', pid: seg[1] }, taskId: taskId };
    }
    if (type === 'profile') {
      /* ไม่ระบุใคร = โปรไฟล์ของตัวเอง ทำให้ลิงก์ #/profile ใช้ได้กับทุกคน */
      var uid = seg[1] || (S.me() && S.me().id);
      if (!S.user(uid)) return null;
      return { route: { type: 'profile', id: uid }, taskId: taskId };
    }
    /* 3b — หน้าส่งฟอร์ม #/form/<id> */
    if (type === 'form' && seg[1]) return { route: { type: 'form', id: seg[1] }, taskId: taskId };
    /* 3c — หน้าเอกสาร #/pages[/<id>] และลิงก์ตรง #/page/<id> (หน้าของโปรเจกต์พาไปแท็บหน้าของโปรเจกต์) */
    if (type === 'pages') return { route: { type: 'pages', page: seg[1] && S.pageLoc(seg[1]) ? seg[1] : null }, taskId: taskId };
    if (type === 'page' && seg[1]) {
      var pgl = S.pageLoc(seg[1]);
      if (!pgl) return null;
      return { route: pgl.project ? { type: 'project', id: pgl.project.id, view: 'pages', page: seg[1] } : { type: 'pages', page: seg[1] }, taskId: taskId };
    }
    if (['home', 'mytasks', 'inbox', 'calendar', 'admin', 'projects', 'trash'].indexOf(type) >= 0) {
      return { route: { type: type }, taskId: taskId };
    }
    return null;
  }

  global.addEventListener('hashchange', function () {
    if (state.suppressHash) return;
    var parsed = readHash();
    if (!parsed) return;
    state.route = parsed.route;
    loadSavedSearch(parsed.ss);
    var prevTask = state.openTaskId;
    state.openTaskId = parsed.taskId && S.task(parsed.taskId) &&
      (!S.canSeeTask || S.canSeeTask(parsed.taskId)) ? parsed.taskId : null;
    if (state.openTaskId && state.openTaskId !== prevTask) resetDrawerState();
    focusStory(parsed.storyId);
    clearSel();
    renderAll(true);
  });

  /** เปิดแผงงานมาที่ความเห็นนี้ — กางเธรดถ้าเป็นคำตอบ แล้วเลื่อนไปหาพร้อมไฮไลต์ */
  function focusStory(storyId) {
    if (!storyId) return;
    var st = S.story(storyId);
    if (!st || st.taskId !== state.openTaskId) return;
    state.actTab = 'comments';
    if (st.parentId) state.openThreads[st.parentId] = true;
    state.flashStory = storyId;
  }

  /* ---------- render ---------- */

  function renderViewBody() {
    var r = state.route;
    var body = '';

    /* สมุดโน้ตบนหน้าแรกบันทึกระหว่างพิมพ์ การบันทึกทำให้หน้าวาดใหม่
     * จึงเก็บข้อความกับเคอร์เซอร์ไว้ แล้วคืนให้ช่องใหม่ ไม่ให้โฟกัสหลุดกลางประโยค */
    var note = document.activeElement && document.activeElement.classList &&
      document.activeElement.classList.contains('hnote') ? document.activeElement : null;
    var keepNote = note ? { v: note.value, a: note.selectionStart, b: note.selectionEnd, top: note.scrollTop } : null;

    if (r.type === 'home') {
      body = R.homeView(state.home, { drafts: draftList() });
    } else if (r.type === 'project') {
      var p = S.project(r.id);
      if (!p) { state.route = { type: 'home' }; return renderAll(); }
      /* ไม่มีสิทธิ์เห็นโปรเจกต์นี้ — ถอยออกเงียบ ๆ เหมือนโปรเจกต์ไม่มีอยู่จริง
       * ไม่บอกว่า "ไม่มีสิทธิ์" เพราะนั่นเท่ากับยืนยันว่าโปรเจกต์นี้มีอยู่ */
      /* 2c — ยกเว้นโปรเจกต์ปิดที่เปิดจากลิงก์ ให้ขอสิทธิ์เข้าถึงได้แบบ Asana (ลิงก์มีคนส่งมาให้แล้ว) */
      if (!S.projectAccess(r.id)) {
        state.route = p.visibility === 'private' && S.isActive() ? { type: 'noaccess', id: r.id } : { type: 'home' };
        return renderAll();
      }
      var v = viewFor(r.id);
      if (r.view === 'board') body = R.boardView(r.id, v, state.sel);
      else if (r.view === 'timeline') body = R.timelineView(r.id, v, state.tlZoom);
      else if (r.view === 'gantt') body = ganttLegendBar(r.id, v) +
        R.ganttView(r.id, v, state.ganttCollapsed, v.q);
      else if (r.view === 'calendar') body = R.projectCalendar(r.id, v, calxGet('p:' + r.id).anchor);
      else if (r.view === 'dashboard') body = R.dashboardView(r.id);
      else if (r.view === 'overview') body = R.overviewView(r.id);
      else if (r.view === 'files') body = R.filesView(r.id);
      else if (r.view === 'messages') body = R.messagesView(r.id, { files: state.msgFiles });
      else if (r.view === 'pages') body = R.pagesView(r.id, r.page, pageUi());
      else if (EXT.projViews[r.view]) body = EXT.projViews[r.view](r.id, r);       // 4b — ภาระงาน สื่อฝัง
      else body = R.listView(r.id, v, state.sel, { subOpen: state.subOpen, cursor: state.cursor });
    } else if (r.type === 'portfolio') {
      if (!S.portfolio(r.id)) { state.route = { type: 'home' }; return renderAll(); }
      if (r.sv && !S.pfSavedView(r.id, r.sv)) { delete r.sv; r.view = 'list'; }
      if (!r.sv && EXT.pfViews[r.view]) body = EXT.pfViews[r.view](r.id, r);
      else body = R.portfolioView(r.id, r.view || 'list', { view: pfViewFor(r.id), sv: r.sv || null, dirty: pfDirty(),
        files: state.msgFiles });
    } else if (r.type === 'team') {
      if (!S.team(r.id) || !S.canSeeTeam(r.id)) { state.route = { type: 'teams' }; return renderAll(); }
      var tcx = calxGet('team:' + r.id);
      body = R.teamView(r.id, r.view || 'overview', { files: state.msgFiles, tdone: state.teamDone,
        calMode: tcx.mode, anchor: tcx.anchor });
    } else if (r.type === 'teams') {
      body = R.teamsView();
    } else if (r.type === 'goals' || r.type === 'goal') {
      /* เป้าหมายส่วนตัวที่ไม่ได้เป็นสมาชิก — ถอยไปหน้ารวมเงียบ ๆ เหมือนไม่มีอยู่ */
      if (r.type === 'goal' && (!S.goal(r.id) || !S.canSeeGoal(r.id))) { state.route = { type: 'goals', view: 'company' }; return renderAll(); }
      body = goalsBody(r);
    } else if (r.type === 'mytasks') {
      body = R.myTasksView(state.sel, state.mt);
    } else if (r.type === 'inbox') {
      body = R.inboxView(state.inbox);
    } else if (r.type === 'pages') {
      body = R.pagesView('', r.page, pageUi());
    } else if (r.type === 'calendar') {
      body = R.globalCalendar(S.calPrefs(), calxGet('all').anchor);
    } else if (r.type === 'projects') {
      body = R.projectsView();
    } else if (r.type === 'profile') {
      if (!S.user(r.id)) { state.route = { type: 'home' }; return renderAll(); }
      body = R.profileView(r.id);
    } else if (r.type === 'admin') {
      // ไม่ใช่ผู้ดูแลก็ไม่ต้องเห็น — เป็นเรื่องความเรียบร้อยของเมนู ไม่ใช่การกันสิทธิ์จริง
      if (!S.isAdmin()) { state.route = { type: 'home' }; return renderAll(); }
      body = R.adminView(state.auditFilter);
    } else if (r.type === 'search') {
      body = R.searchView(r.q, state.sel, {
        conds: state.adv.conds, mode: state.adv.mode, panel: advPanelHtml(),
        anchor: calxGet('search').anchor, calMode: calxGet('search').mode
      });
    } else if (r.type === 'tag') {
      body = R.tagView(r.name, state.sel);
    } else if (r.type === 'noaccess') {
      if (!S.project(r.id)) { state.route = { type: 'home' }; return renderAll(); }
      if (S.projectAccess(r.id)) return goProject(r.id);
      body = R.noAccessView(r.id);
    } else if (r.type === 'trash') {
      body = R.trashView(r.pid);
    } else if (r.type === 'form') {
      if (!state.ff || state.ff.id !== r.id) state.ff = { id: r.id, ans: {} };
      body = R.formPage(r.id, state.ff);
    } else if (EXT.routes[r.type]) {
      body = EXT.routes[r.type].body(r);
      if (body === null) return renderAll();          // ส่วนขยายเปลี่ยนเส้นทางเอง (เช่นไม่มีสิทธิ์)
    }

    // ออกจาก Gantt แล้วแผงตัวเลือกไม่มีความหมายอีก ปล่อยค้างไว้จะบังหน้าจอเปล่า ๆ
    if (!(r.type === 'project' && R.VIEWS_WITH_TOOLBAR.indexOf(r.view) >= 0) && optOpen()) closeOpts();

    // เก็บตำแหน่งเลื่อนไทม์ไลน์ไว้ก่อน re-render ไม่งั้นจอจะเด้งกลับต้นทุกครั้งที่ลาก
    var prevScroll = $view.querySelector('.tl-scroll');
    if (prevScroll) state.tlScrollLeft = prevScroll.scrollLeft;
    var prevG = $view.querySelector('.gantt-scroll');
    if (prevG) state.ganttScroll = { x: prevG.scrollLeft, y: prevG.scrollTop };

    /* 3c — ตัวแก้ไขในหน้า (บรีฟ ประกาศ) ที่กำลังพิมพ์อยู่ ไม่ให้หายเมื่อหน้าวาดใหม่ระหว่างพิมพ์ */
    var keepEd = (function () {
      var ae = document.activeElement;
      if (!ae || !ae.classList || !ae.classList.contains('rte') || !$view.contains(ae) || !ae.dataset.key) return null;
      return { key: ae.dataset.key, html: ae.innerHTML, off: global.RichText.caretOffsets(ae) };
    })();
    persistView();
    $view.innerHTML = body + R.bulkbar(state.sel);
    if (keepNote) {
      var nn = $view.querySelector('.hnote');
      if (nn) {
        nn.value = keepNote.v;
        nn.focus();
        try { nn.setSelectionRange(keepNote.a, keepNote.b); } catch (e) { /* ช่องเปลี่ยนชนิด */ }
        nn.scrollTop = keepNote.top;
      }
    }
    restoreMsgDrafts();
    markPageAnchors();
    if (keepEd) {
      var ne3 = $view.querySelector('.rte[data-key="' + keepEd.key + '"]');
      if (ne3) { ne3.innerHTML = keepEd.html; ne3.focus(); global.RichText.setOffsets(ne3, keepEd.off); }
    }
    resumeInlineAdd();
    restoreTimelineScroll();
    restoreGanttScroll();
    markKbCursor();
    EXT.after.forEach(function (fn) { try { fn($view); } catch (e) { console.error(e); } });
  }

  /* ---------- แถบเครื่องมือ Gantt ----------
   *
   * ซ้าย = สิ่งที่ทำกับงาน (เพิ่มงาน เลื่อนดูช่วงเวลา)
   * ขวา = สิ่งที่ทำกับมุมมอง (ซูม กรอง เรียง จัดกลุ่ม ตัวเลือก บันทึก)
   * แยกสองฝั่งแบบเดียวกับ Asana เพราะคนที่ย้ายมาจะหาปุ่มเจอทันทีโดยไม่ต้องกวาดตา
   */
  function zoomLabel(id) {
    var z = S.GANTT_ZOOMS.filter(function (x) { return x.id === id; })[0];
    return z ? L(z.label) : id;
  }

  /** จำนวนตัวกรองที่เปิดใช้อยู่ ใช้ขึ้นตัวเลขบนปุ่ม ไม่งั้นคนลืมว่ากรองอะไรค้างไว้ */
  function activeFilterCount(v) {
    var n = 0;
    if (v.assignee) n++;
    if (v.priority) n++;
    if (v.tag) n++;
    if (v.due && v.due !== 'any') n++;
    if (!v.showCompleted) n++;
    return n;
  }

  /* แถบสีอธิบายผัง Gantt — ส่วนควบคุมย้ายไปอยู่บนแถบเครื่องมือร่วมแล้ว
   * เหลือไว้แค่คำอธิบายสี ซึ่งต้องอยู่ติดกับตัวผังถึงจะอ่านคู่กันได้ */
  function ganttLegendBar(projectId, v) {
    var p = S.project(projectId);
    var legend = R.ganttLegend(p, v.gColorBy);
    return legend ? '<div class="g-legendbar">' + legend + '</div>' : '';
  }


  /* ---------- แผงตัวเลือกของ Gantt ---------- */

  var $opt     = document.getElementById('optPanel');
  var $optBack = document.getElementById('optBackdrop');

  function optOpen() { return !!$opt && $opt.classList.contains('open'); }

  function openOpts(page) {
    if (page) state.optPage = page;
    $opt.innerHTML = optPanelHtml();
    $opt.classList.add('open');
    $opt.setAttribute('aria-hidden', 'false');
    $optBack.classList.add('open');
  }

  function closeOpts() {
    if (!$opt) return;
    $opt.classList.remove('open');
    $opt.setAttribute('aria-hidden', 'true');
    $optBack.classList.remove('open');
    /* ล้างเนื้อในทิ้งด้วย ไม่ใช่แค่ซ่อน
     * ถ้าปล่อยไว้ ช่องกรอกที่มองไม่เห็นยังอยู่ใน DOM แล้วโค้ดที่ค้นด้วย id
     * จะไปเจอค่าเก่าของแผงที่ปิดไปแล้ว เหมือนที่ปุ่มบันทึกมุมมองเคยเจอ */
    $opt.innerHTML = '';
    state.optPage = 'root';
  }

  /** วาดแผงใหม่ถ้ากำลังเปิดอยู่ ใช้หลังแก้ค่าจากที่อื่น ค่าในแผงจะได้ไม่ค้างของเก่า */
  function refreshOpts() { if (optOpen()) $opt.innerHTML = optPanelHtml(); }

  function optRow(act, icon, label, value, arrow, extra) {
    return '<button class="opt-row" data-act="' + act + '"' + (extra || '') + '>' +
      I(icon, 15) + '<span class="grow">' + esc(label) + '</span>' +
      (value ? '<span class="val">' + esc(value) + '</span>' : '') +
      (arrow ? I('chevronRight', 13) : '') + '</button>';
  }

  function optToggle(act, label, on, desc, extra) {
    return '<div class="opt-toggle"><div class="grow"><b>' + esc(label) + '</b>' +
      (desc ? '<em>' + esc(desc) + '</em>' : '') + '</div>' +
      '<button class="switch' + (on ? ' on' : '') + '" data-act="' + act + '"' +
      (extra || '') + ' role="switch" aria-checked="' + (on ? 'true' : 'false') + '"><i></i></button></div>';
  }

  function optSelect(act, options, current, extra) {
    var h = '<select class="opt-select" data-act="' + act + '"' + (extra || '') + '>';
    options.forEach(function (o) {
      h += '<option value="' + esc(o[0]) + '"' + (current === o[0] ? ' selected' : '') +
        '>' + esc(o[1]) + '</option>';
    });
    return h + '</select>';
  }

  function optHead(title, back) {
    return '<div class="opt-head">' +
      (back ? '<button class="opt-back" data-act="g-opt-page" data-page="root" title="' +
        L('ย้อนกลับ') + '">' + I('arrowLeft', 16) + '</button>' : '') +
      '<h2>' + esc(title) + '</h2>' +
      (back ? '' : '<button class="opt-close" data-act="g-opt-close" title="' + L('ปิด') +
        '">' + I('close', 16) + '</button>') + '</div>';
  }

  function optPanelHtml() {
    var id = state.route.id;
    var p = S.project(id);
    if (!p) return '';
    var v = viewFor(id);
    var page = state.optPage || 'root';
    var h = '';

    if (page === 'layout') {
      h += optHead(L('รูปแบบการแสดงผล'), true);
      h += '<div class="opt-body"><label class="opt-lbl">' + L('ระบายสีแท่งงานตาม') + '</label>' +
        optSelect('g-colorby', S.COLOR_BYS.map(function (x) { return [x.id, L(x.label)]; }), v.gColorBy) +
        '<p class="opt-note">' + L('สีช่วยให้กวาดตาแล้วเห็นภาพรวมทันที เช่น เลือก “ความคืบหน้า” แล้วแท่งแดงคืองานที่เลยกำหนด') + '</p>' +
        '</div>';
      return h + optFoot();
    }

    if (page === 'deps') {
      h += optHead(L('การจัดตารางและเส้นฐาน'), true);
      h += '<div class="opt-body">';
      /* โหมดการเลื่อนวันเป็นของโปรเจกต์ ไม่ใช่ของมุมมองส่วนตัว
       * ถ้าให้แต่ละคนตั้งเอง วันที่จะขยับไม่เหมือนกันแล้วแต่ว่าใครลาก */
      var ds = p.depShift || { mode: 'consume', scope: 'downstream' };
      var dsLabel = (S.DEP_SHIFT.filter(function (m) { return m.id === ds.mode; })[0] || {}).label;
      h += optRow('project-settings', 'repeat', L('การเลื่อนวันของงานที่พึ่งพากัน'),
        L(dsLabel || ''), true, ' data-id="' + esc(id) + '" data-tab="deps"');
      h += optRow('project-settings', 'calendar', L('วันทำงานของโปรเจกต์'),
        L((S.WORK_DAYS.filter(function (w) { return w.id === p.workDays; })[0] || {}).label || ''),
        true, ' data-id="' + esc(id) + '" data-tab="scheduling"');
      h += '<div class="opt-sep"></div>';
      h += '<div class="opt-base">' + I('calendar', 15) +
        '<span class="grow">' + (p.baseline
          ? esc(L('ตั้งเส้นฐานไว้เมื่อ {when}', { when: R.fmtWhen(p.baseline.at) }))
          : L('ยังไม่ได้ตั้งเส้นฐาน')) + '</span></div>';
      h += optToggle('g-basetoggle', L('แสดงเส้นฐาน'), v.gShowBaseline,
        p.baseline ? L('เส้นจาง ๆ ใต้แท่งคือแผนเดิม เทียบแล้วรู้ทันทีว่าหลุดไปกี่วัน')
                   : L('ต้องตั้งเส้นฐานก่อนจึงจะแสดงได้'));
      h += '<div class="opt-acts">' +
        '<button class="btn btn-sm" data-act="g-set-baseline">' +
        (p.baseline ? L('ตั้งเส้นฐานใหม่จากวันปัจจุบัน') : L('ตั้งเส้นฐานจากวันปัจจุบัน')) + '</button>' +
        (p.baseline ? '<button class="btn btn-sm btn-ghost" data-act="g-clear-baseline">' +
          L('ลบเส้นฐาน') + '</button>' : '') + '</div>';
      h += '<p class="opt-note">' + L('เส้นฐานคือภาพถ่ายวันที่ของทุกงาน ณ ตอนที่กด ใช้ตอบคำถามว่า “แผนเดิมบอกว่าเสร็จวันไหน” ตั้งใหม่ได้ทุกเมื่อ แต่ของเดิมจะถูกทับ') + '</p>';
      h += '</div>';
      return h + optFoot();
    }

    if (page === 'cols') {
      h += optHead(L('แสดง/ซ่อนคอลัมน์'), true);
      h += '<div class="opt-body"><p class="opt-note" style="margin-top:0">' +
        L('เลือกคอลัมน์ที่จะแสดงในตารางฝั่งซ้าย') + '</p>';
      S.GANTT_COLS.forEach(function (c) {
        h += optToggle('g-col', L(c.label), !!v.gCols[c.id], '', ' data-col="' + c.id + '"');
      });
      h += '</div>';
      return h + optFoot();
    }

    if (page === 'filters') {
      h += optHead(L('ตัวกรอง'), true);
      h += '<div class="opt-body">';
      /* ทางลัดที่ใช้บ่อย — กดอีกครั้งเพื่อเอาออก */
      var meOn = v.filters.some(function (c) { return isMeFilter(c); });
      var dueOn = v.filters.some(function (c) { return c.f === 'due' && c.op === 'week'; });
      h += '<div class="flt-quick">' +
        '<button class="flt-chip' + (!v.showCompleted ? ' on' : '') + '" data-act="f-completed">' +
        I('checkCircle', 12) + ' ' + L('ยังไม่เสร็จ') + '</button>' +
        '<button class="flt-chip' + (meOn ? ' on' : '') + '" data-act="flt-me">' + I('users', 12) + ' ' +
        L('ผู้รับผิดชอบคือฉัน') + '</button>' +
        '<button class="flt-chip' + (dueOn ? ' on' : '') + '" data-act="flt-week">' + I('calendar', 12) + ' ' +
        L('ครบกำหนดใน 7 วัน') + '</button></div>';
      if (!v.filters.length) {
        h += '<p class="opt-note">' + L('ยังไม่มีเงื่อนไข กด “+ เพิ่มตัวกรอง” แล้วเลือกฟิลด์ใดก็ได้ รวมถึงฟิลด์ที่สร้างเอง') + '</p>';
      }
      var ffs = S.filterFields(id);
      v.filters.forEach(function (c, i) {
        var def = S.filterField(id, c.f);
        var ops = def ? S.FILTER_OPS[def.kind] || [] : [];
        h += '<div class="flt-row">' + (i ? '<span class="flt-and">' + L('และ') + '</span>' : '') +
          '<div class="flt-line">' +
          optSelect('flt-field', ffs.map(function (x) {
            return [x.id, x.custom ? x.label : L(x.label)];
          }).concat(def ? [] : [[c.f, L('(ฟิลด์ถูกลบแล้ว)')]]), c.f, ' data-i="' + i + '"') +
          optSelect('flt-op', ops.map(function (o) { return [o[0], L(o[1])]; }), c.op, ' data-i="' + i + '"') +
          '<button class="flt-del" data-act="flt-del" data-i="' + i + '" title="' + L('เอาเงื่อนไขนี้ออก') + '">' +
          I('close', 13) + '</button></div>' + fltValueHtml(id, c, i) + '</div>';
      });
      h += '<div class="opt-acts"><button class="btn btn-sm" data-act="flt-add">' + I('plus', 13) + ' ' +
        L('เพิ่มตัวกรอง') + '</button>' +
        (S.filterCount(v) ? '<button class="btn btn-sm btn-ghost" data-act="flt-clear">' + L('ล้างตัวกรอง') + '</button>' : '') +
        '</div>';
      h += '<p class="opt-note">' + L('ทุกเงื่อนไขต้องตรงพร้อมกัน “ฉัน” คือคนที่กำลังเปิดดู บันทึกเป็นแท็บแล้วแต่ละคนจะเห็นงานของตัวเอง') + '</p>';
      h += '</div>';
      return h + optFoot();
    }

    if (page === 'sorts') {
      h += optHead(L('เรียงลำดับ'), true);
      var sk = sortKeys(p);
      h += '<div class="opt-body">';
      if (!v.sorts.length) h += '<p class="opt-note" style="margin-top:0">' + L('ใช้ลำดับที่จัดเอง (ลากแถวสลับได้)') + '</p>';
      v.sorts.forEach(function (s, i) {
        h += '<div class="flt-line srt-line"><span class="flt-and">' + (i ? L('แล้วตาม') : L('เรียงตาม')) + '</span>' +
          optSelect('srt-key', sk, s.k, ' data-i="' + i + '"') +
          '<button class="btn btn-sm" data-act="srt-dir" data-i="' + i + '">' +
          I(s.d === 'desc' ? 'arrowDown' : 'arrowUp', 13) + ' ' + (s.d === 'desc' ? L('มากไปน้อย') : L('น้อยไปมาก')) +
          '</button><button class="flt-del" data-act="srt-del" data-i="' + i + '" title="' + L('เอาออก') + '">' +
          I('close', 13) + '</button></div>';
      });
      if (v.sorts.length < 5) {
        h += '<div class="opt-acts"><button class="btn btn-sm" data-act="srt-add">' + I('plus', 13) + ' ' +
          (v.sorts.length ? L('เรียงต่ออีกชั้น') : L('เพิ่มการเรียง')) + '</button></div>';
      }
      h += '<p class="opt-note">' + L('คลิกหัวคอลัมน์ในรายการเพื่อเรียงชั้นแรก Shift+คลิกเพื่อเพิ่มอีกชั้น') + '</p>';
      h += '</div>';
      return h + optFoot();
    }

    if (page === 'groups') {
      var vwg = state.route.view || 'list';
      h += optHead(vwg === 'board' ? L('คอลัมน์และแถว') : L('จัดกลุ่ม'), true);
      h += '<div class="opt-body">';
      if (vwg === 'board') {
        h += '<label class="opt-lbl">' + L('คอลัมน์ตาม') + '</label>' +
          optSelect('b-group', boardGroupChoices(p, false), v.bGroup);
        h += '<label class="opt-lbl">' + L('แถว (swimlane) ตาม') + '</label>' +
          optSelect('b-swim', boardGroupChoices(p, true), v.bSwim);
        h += optToggle('f-showempty', L('แสดงคอลัมน์ที่ว่าง'), v.showEmpty,
          L('ตัวเลือกหรือคนที่ยังไม่มีงานก็มีคอลัมน์ ลากงานไปวางได้ทันที'));
        h += '<div class="opt-acts">' +
          '<button class="btn btn-sm btn-ghost" data-act="bcol-all" data-v="0">' + L('ขยายทุกคอลัมน์') + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="bcol-all" data-v="1">' + L('ย่อทุกคอลัมน์') + '</button></div>';
        h += '<p class="opt-note">' + L('ลากการ์ดข้ามคอลัมน์หรือแถว = เปลี่ยนค่าของฟิลด์นั้นให้งานทันที') + '</p>';
      } else {
        h += '<label class="opt-lbl">' + L('จัดกลุ่มตาม') + '</label>' + optSelect('f-group', listGroupChoices(p), v.group);
        h += optToggle('f-showempty', L('แสดงกลุ่มที่ว่าง'), v.showEmpty,
          L('เช่น ตัวเลือกที่ยังไม่มีงาน หรือสมาชิกที่ยังไม่ได้รับงาน'));
        h += '<div class="opt-acts">' +
          '<button class="btn btn-sm btn-ghost" data-act="' + (vwg === 'gantt' ? 'g-expand-all' : 'sec-expand-all') + '">' +
          L('ขยายทุกกลุ่ม') + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="' + (vwg === 'gantt' ? 'g-collapse-all' : 'sec-collapse-all') + '">' +
          L('ย่อทุกกลุ่ม') + '</button></div>';
      }
      h += '</div>';
      return h + optFoot();
    }

    if (page === 'lcols') {
      h += optHead(L('คอลัมน์ในรายการ'), true);
      h += '<div class="opt-body"><p class="opt-note" style="margin-top:0">' +
        L('เปิดปิดและเลื่อนลำดับคอลัมน์ ชื่องานอยู่ซ้ายสุดเสมอ') + '</p>';
      var lc = S.listColumns(id, v);
      lc.forEach(function (c, i) {
        h += '<div class="lcol-row"><div class="lcol-mv">' +
          '<button data-act="lcol-move" data-col="' + esc(c.id) + '" data-d="-1"' + (i ? '' : ' disabled') +
          ' title="' + L('ย้ายขึ้น') + '">' + I('arrowUp', 12) + '</button>' +
          '<button data-act="lcol-move" data-col="' + esc(c.id) + '" data-d="1"' + (i < lc.length - 1 ? '' : ' disabled') +
          ' title="' + L('ย้ายลง') + '">' + I('arrowDown', 12) + '</button></div>' +
          '<span class="grow">' + esc(c.field ? c.label : L(c.label)) + '</span>' +
          '<button class="switch' + (c.on ? ' on' : '') + '" data-act="lcol-toggle" data-col="' + esc(c.id) +
          '" role="switch" aria-checked="' + (c.on ? 'true' : 'false') + '"><i></i></button></div>';
      });
      h += '<div class="opt-acts"><button class="btn btn-sm btn-ghost" data-act="reset-cols">' +
        L('คืนความกว้างคอลัมน์') + '</button></div></div>';
      return h + optFoot();
    }

    if (page === 'board') {
      h += optHead(L('การ์ดบนบอร์ด'), true);
      h += '<div class="opt-body"><label class="opt-lbl">' + L('ขนาดการ์ด') + '</label>' +
        '<div class="segmented">' + [['s', 'เล็ก'], ['m', 'กลาง'], ['l', 'ใหญ่']].map(function (x) {
          return '<button data-act="bsize" data-v="' + x[0] + '" class="' + (v.bSize === x[0] ? 'on' : '') + '">' +
            L(x[1]) + '</button>';
        }).join('') + '</div>';
      h += '<label class="opt-lbl">' + L('แสดงบนการ์ด') + '</label>';
      S.CARD_PARTS.forEach(function (c) {
        h += optToggle('bcard', L(c.label), S.cardShows(v, c.id), '', ' data-k="' + c.id + '"');
      });
      p.fields.forEach(function (f) {
        h += optToggle('bcard', f.name, S.cardShows(v, 'field:' + f.id), '', ' data-k="field:' + esc(f.id) + '"');
      });
      h += '<p class="opt-note">' + L('รูปปกมาจากไฟล์แนบที่เป็นรูป — เปิดงานแล้วกด “ตั้งเป็นรูปปก” ที่ไฟล์นั้น การ์ดเล็กไม่แสดงรูปปก') + '</p>';
      h += '</div>';
      return h + optFoot();
    }

    /* ---- หน้าหลัก ---- */
    var hidden = S.GANTT_COLS.filter(function (c) { return !v.gCols[c.id]; }).length;
    var sortLab = v.sorts.length ? v.sorts.map(function (s) { return sortLabel(p, s.k); }).join(' → ')
      : L('ไม่ได้เรียง');
    var groupLab = groupLabelOf(p, v.group);

    var vw = state.route.view || 'list';
    var vdef = (S.PROJECT_VIEWS.filter(function (x) { return x.id === vw; })[0]) || {};
    var vname = L(vdef.label || 'Gantt');
    var isG = vw === 'gantt';
    var curSv = state.route.sv ? S.savedView(id, state.route.sv) : null;

    h += optHead(curSv ? curSv.name : vname);
    h += '<div class="opt-body">';
    h += '<div class="opt-namerow">' +
      '<div><label class="opt-lbl">' + L('ไอคอน') + '</label>' +
      '<input class="opt-icon" id="gvIcon" maxlength="2" value="' + esc(curSv ? curSv.icon : (state.viewIcon || '📊')) + '"></div>' +
      '<div class="grow"><label class="opt-lbl">' + L('ชื่อแท็บใหม่') + '</label>' +
      '<input class="opt-name" id="gvName" value="' + esc(curSv ? curSv.name + ' ' + L('(สำเนา)') : '') +
      '" placeholder="' + esc(L('เช่น งานของฉันสัปดาห์นี้')) + '"></div></div>';

    /* กลุ่มนี้เป็นของผัง Gantt ล้วน เส้นฐาน ระดับการซูม และคอลัมน์ในตารางซ้าย
     * มุมมองอื่นไม่มีของพวกนี้ ถ้าโชว์ไว้จะกลายเป็นปุ่มที่กดแล้วไม่มีอะไรเปลี่ยน */
    h += '<div class="opt-sep"></div>';
    if (isG) {
      h += optRow('g-opt-page', 'pencil', L('รูปแบบการแสดงผล'), '', true, ' data-page="layout"');
      h += optRow('g-opt-page', 'repeat', L('การจัดตารางและเส้นฐาน'),
        L(((S.DEP_SHIFT.filter(function (m) {
          return m.id === ((p.depShift && p.depShift.mode) || 'consume');
        })[0]) || {}).label || ''), true, ' data-page="deps"');
      h += '<div class="opt-row"><span class="ic-wrap">' + I('search', 15) + '</span>' +
        '<span class="grow">' + L('ระดับการซูม') + '</span>' +
        optSelect('g-zoom-set', S.GANTT_ZOOMS.map(function (x) { return [x.id, L(x.label)]; }), v.gZoom) +
        '</div>';
      h += '<div class="opt-sep"></div>';
      h += optRow('g-opt-page', 'grid', L('แสดง/ซ่อนคอลัมน์'),
        hidden ? L('ซ่อนอยู่ {n}', { n: hidden }) : L('แสดงครบ'), true, ' data-page="cols"');
    } else if (vw === 'list') {
      var lcHidden = S.listColumns(id, v).filter(function (c) { return !c.on; }).length;
      h += optRow('g-opt-page', 'grid', L('แสดง/ซ่อนคอลัมน์'),
        lcHidden ? L('ซ่อนอยู่ {n}', { n: lcHidden }) : L('แสดงครบ'), true, ' data-page="lcols"');
    } else if (vw === 'board') {
      h += optRow('g-opt-page', 'grid', L('การ์ดบนบอร์ด'),
        L({ s: 'เล็ก', m: 'กลาง', l: 'ใหญ่' }[v.bSize] || 'กลาง'), true, ' data-page="board"');
    } else if (vw === 'calendar') {
      h += optToggle('cal-weekends', L('แสดงเสาร์-อาทิตย์'), v.cWeekends !== false);
      h += '<div class="opt-row"><span class="ic-wrap">' + I('palette', 15) + '</span>' +
        '<span class="grow">' + L('ระบายสีตาม') + '</span>' +
        optSelect('cal-colorby', S.colorChoices(id).map(function (c) { return [c[0], L(c[1])]; }), v.cColorBy) + '</div>';
    } else if (vw === 'timeline') {
      h += '<div class="opt-row"><span class="ic-wrap">' + I('palette', 15) + '</span>' +
        '<span class="grow">' + L('ระบายสีตาม') + '</span>' +
        optSelect('tl-colorby', S.colorChoices(id).map(function (c) { return [c[0], L(c[1])]; }), v.tColorBy) + '</div>';
    }
    if (isG || vw === 'timeline') {
      h += optToggle('crit-toggle', L('ไฮไลต์เส้นทางวิกฤต'), !!v.critical, L('สายงานที่ต่อกันด้วยลำดับก่อนหลังแล้วกินเวลายาวที่สุด งานในสายนี้ช้า = ทั้งโปรเจกต์ช้า'));
    }
    h += optRow('g-opt-page', 'filter', L('ตัวกรอง'),
      S.filterCount(v) ? L('ใช้อยู่ {n}', { n: S.filterCount(v) }) : L('ไม่มี'), true, ' data-page="filters"');
    h += optRow('g-opt-page', 'arrowUp', L('เรียงลำดับ'), sortLab, true, ' data-page="sorts"');
    if (vw !== 'calendar') {
      h += optRow('g-opt-page', 'hash', vw === 'board' ? L('คอลัมน์และแถว') : L('จัดกลุ่ม'),
        vw === 'board' ? groupLabelOf(p, v.bGroup) + (v.bSwim !== 'none' ? ' × ' + groupLabelOf(p, v.bSwim) : '')
          : groupLab, true, ' data-page="groups"');
    }
    if (isG) {
      h += '<div class="opt-row"><span class="ic-wrap">' + I('subtask', 15) + '</span>' +
        '<span class="grow">' + L('งานย่อย') + '</span>' +
        optSelect('g-subtasks', [['collapsed', L('ซ่อนไว้')], ['expanded', L('กางออก')]], v.gSubtasks) +
        '</div>';
    }
    /* 3a — อัตโนมัติของโปรเจกต์ (เปิดเป็นหน้าต่าง รายการ + ประวัติการรัน) */
    var nAuto = S.automations(id).filter(function (a) { return a.on; }).length;
    h += '<div class="opt-sep"></div>' + optRow('auto-open', 'bolt', L('ระบบอัตโนมัติ'),
      nAuto ? L('เปิดอยู่ {n}', { n: nAuto }) : L('ไม่มี'), true, ' data-id="' + esc(id) + '"');

    h += '<div class="opt-sep"></div><label class="opt-lbl">' +
      L('แท็บที่บันทึกไว้ {n}/{max}', { n: p.savedViews.length, max: S.SV_MAX }) + '</label>';
    if (!p.savedViews.length) {
      h += '<p class="opt-note" style="margin-top:0">' +
        L('ตั้งตัวกรอง เรียง จัดกลุ่มให้ถูกใจ แล้วกด “บันทึกเป็นแท็บใหม่” แท็บจะขึ้นต่อท้ายแท็บของโปรเจกต์ให้ทุกคนใช้') + '</p>';
    } else {
      h += '<div class="opt-views">';
      p.savedViews.forEach(function (sv) {
        h += '<div class="opt-view' + (sv.id === state.route.sv ? ' on' : '') + '"><button class="grow" data-act="open-sv" data-id="' + esc(sv.id) + '">' +
          '<span class="em">' + esc(sv.icon || '📊') + '</span>' + esc(sv.name) +
          '<em class="opt-view-kind">' + esc(L(((S.PROJECT_VIEWS.filter(function (x) { return x.id === sv.kind; })[0]) || {}).label || '')) +
          '</em></button></div>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h + optFoot();
  }

  function optFoot() {
    var dsv = dirtySv();
    return '<div class="opt-foot">' +
      '<button class="btn btn-ghost btn-sm" data-act="reset-view" title="' +
      L('คืนตัวกรอง เรียง จัดกลุ่ม และคอลัมน์เป็นค่าเริ่มต้น') + '">' + L('รีเซ็ต') + '</button>' +
      '<span class="grow"></span>' +
      (dsv && S.can('structure') ? '<button class="btn btn-sm" data-act="sv-update" data-id="' + esc(dsv) + '">' +
        L('บันทึกทับแท็บนี้') + '</button>' : '') +
      '<button class="btn btn-primary btn-sm" data-act="save-view">' + L('บันทึกเป็นแท็บใหม่') + '</button></div>';
  }

  /* ---------- ส่วนประกอบของแผงตัวเลือก (2b) ---------- */

  function isMeFilter(c) {
    return c.f === 'assignee' && c.op === 'is' && Array.isArray(c.v) && c.v.length === 1 && c.v[0] === S.ME;
  }

  /** ช่องค่าของเงื่อนไขหนึ่งแถว ตามชนิดฟิลด์และตัวดำเนินการ */
  function fltValueHtml(pid, c, i, pre) {
    pre = pre || 'flt';             // 'as' = ค้นหาขั้นสูง (ชุดคำสั่งแยกจากตัวกรองของโปรเจกต์)
    var def = S.filterField(pid, c.f);
    if (!def) return '';
    var kind = def.kind, op = c.op;
    if (kind === 'bool' || op === 'empty' || op === 'notempty' ||
        ['overdue', 'today', 'week'].indexOf(op) >= 0) return '';
    var di = ' data-i="' + i + '"';
    if (kind === 'person' || kind === 'select' || kind === 'multi') {
      var ch = S.filterChoices(pid, c.f);
      var cur = [].concat(c.v || []);
      if (!ch.length) return '<div class="flt-none">' + L('ยังไม่มีตัวเลือกให้เลือก') + '</div>';
      var userText = def.custom || c.f === 'tags' || c.f === 'section' || kind === 'person' ||
        c.f === 'followers' || c.f === 'project' || c.f === 'psection';
      return '<div class="flt-chips">' + ch.map(function (o) {
        var on = cur.indexOf(o[0]) >= 0;
        return '<button class="flt-chip' + (on ? ' on' : '') + '" data-act="' + pre + '-opt"' + di +
          ' data-v="' + esc(o[0]) + '">' + (o[2] ? '<i class="flt-dot" style="background:' + esc(o[2]) + '"></i>' : '') +
          (o[0] === S.ME ? I('users', 11) + ' ' + L('ฉัน') : esc(userText ? o[1] : L(o[1]))) + '</button>';
      }).join('') + '</div>';
    }
    if (kind === 'date') {
      if (op === 'next' || op === 'last') {
        return '<div class="flt-val"><input type="number" min="0" max="3650" class="opt-select flt-n" data-act="' + pre + '-val"' + di +
          ' value="' + esc(c.v == null ? '' : c.v) + '"><span>' + L('วัน') + '</span></div>';
      }
      if (op === 'between') {
        var a = (c.v && c.v[0]) || '', b = (c.v && c.v[1]) || '';
        return '<div class="flt-val"><input type="date" class="opt-select" data-act="' + pre + '-val"' + di + ' value="' + esc(a) + '">' +
          '<span>–</span><input type="date" class="opt-select" data-act="' + pre + '-val2"' + di + ' value="' + esc(b) + '"></div>';
      }
      return '<div class="flt-val"><input type="date" class="opt-select" data-act="' + pre + '-val"' + di +
        ' value="' + esc(c.v || '') + '"></div>';
    }
    if (kind === 'number') {
      return '<div class="flt-val"><input type="number" step="any" class="opt-select" data-act="' + pre + '-val"' + di +
        ' value="' + esc(c.v == null ? '' : c.v) + '"></div>';
    }
    return '<div class="flt-val"><input type="text" class="opt-select" data-act="' + pre + '-val"' + di +
      ' value="' + esc(c.v || '') + '" placeholder="' + esc(L('พิมพ์คำ')) + '"></div>';
  }

  /** ค่าเริ่มต้นของเงื่อนไขเมื่อเปลี่ยนฟิลด์หรือตัวดำเนินการ */
  function fltDefaultV(kind, op) {
    if (kind === 'person' || kind === 'select' || kind === 'multi') return [];
    if (op === 'between') return ['', ''];
    if (op === 'next' || op === 'last') return 7;
    return '';
  }

  var EXTRA_SORTS = [['start', 'วันเริ่ม'], ['completedOn', 'วันที่ทำเสร็จ'], ['modified', 'แก้ไขล่าสุด'],
                     ['createdBy', 'สร้างโดย']];

  /* 3b — ชนิดงานกับสถานะ เลือกได้เมื่อโปรเจกต์มีชนิดงานกำหนดเอง */
  function typeGroupChoices(p) {
    return (p.types || []).length ? [['cstatus', L('สถานะ (ชนิดงาน)')], ['type', L('ชนิดงาน')]] : [];
  }

  function sortKeys(p) {
    return S.SORTS.filter(function (x) { return x.id !== 'manual'; })
      .map(function (x) { return [x.id, L(x.label)]; })
      .concat(EXTRA_SORTS.map(function (x) { return [x[0], L(x[1])]; }))
      .concat(typeGroupChoices(p))
      .concat(p.fields.map(function (f) { return ['field:' + f.id, f.name]; }));
  }

  function sortLabel(p, k) {
    var hit = sortKeys(p).filter(function (x) { return x[0] === k; })[0];
    return hit ? hit[1] : k;
  }

  /** ตัวเลือกจัดกลุ่มของรายการ/ไทม์ไลน์/Gantt — ของในตัว + ฟิลด์ตัวเลือก คน และวันที่ */
  function listGroupChoices(p) {
    return S.GROUPS.map(function (x) { return [x.id, L(x.label)]; })
      .concat(typeGroupChoices(p))
      .concat(p.fields.filter(function (f) { return f.type === 'select' || f.type === 'person' || f.type === 'date'; })
        .map(function (f) { return ['field:' + f.id, f.name]; }));
  }

  /** ตัวเลือกคอลัมน์/แถวของบอร์ด — ต้องเป็นค่าที่ "ลากไปวางแล้วตั้งค่าได้" เท่านั้น */
  function boardGroupChoices(p, lanes) {
    var out = lanes ? [['none', L('ไม่แบ่งแถว')]] : [];
    out.push(['section', L('เซกชันของโปรเจกต์')], ['assignee', L('ผู้รับผิดชอบ')], ['priority', L('ความสำคัญ')]);
    out = out.concat(typeGroupChoices(p));
    p.fields.forEach(function (f) {
      if (f.type === 'select' || f.type === 'person') out.push(['field:' + f.id, f.name]);
    });
    return out;
  }

  function groupLabelOf(p, g) {
    var all = listGroupChoices(p).concat(boardGroupChoices(p, true));
    var hit = all.filter(function (x) { return x[0] === g; })[0];
    return hit ? hit[1] : '';
  }

  /** ความกว้างต่อวันของผัง Gantt ที่วาดอยู่ตอนนี้ */
  function ganttDayW() {
    var sc = $view.querySelector('.gantt-scroll');
    var w = sc && parseFloat(sc.dataset.w);
    return w > 0 ? w : R.G_ZOOMS.month.w;
  }

  function restoreGanttScroll() {
    var sc = $view.querySelector('.gantt-scroll');
    if (!sc) return;
    if (state.ganttScroll) { sc.scrollLeft = state.ganttScroll.x; sc.scrollTop = state.ganttScroll.y; return; }
    scrollGanttToToday();
  }

  function scrollGanttToToday() {
    var sc = $view.querySelector('.gantt-scroll');
    var line = $view.querySelector('.g-today');
    if (!sc || !line) return;
    var x = parseFloat(line.style.left) || 0;
    /* R.G_LEFT เป็นฟังก์ชัน ไม่ใช่ตัวเลข บวกตรง ๆ จะได้สตริงแล้ว scrollLeft กลายเป็น NaN
     * วัดจากแผงซ้ายจริงแทน แม่นกว่าด้วยเพราะคอลัมน์เปิดปิดได้ */
    var pane = $view.querySelector('.g-left');
    var lw = pane ? pane.getBoundingClientRect().width : 0;
    sc.scrollLeft = Math.max(0, x + lw - sc.clientWidth / 2);
    state.ganttScroll = { x: sc.scrollLeft, y: sc.scrollTop };
  }

  /** คืนตำแหน่งเลื่อนเดิม หรือถ้ายังไม่เคยเลื่อน ให้ไปหยุดที่วันนี้ */
  function restoreTimelineScroll() {
    var sc = $view.querySelector('.tl-scroll');
    if (!sc) return;
    if (state.tlScrollLeft !== null) { sc.scrollLeft = state.tlScrollLeft; return; }
    scrollTimelineToToday();
  }

  function scrollTimelineToToday() {
    var sc = $view.querySelector('.tl-scroll');
    var line = $view.querySelector('.tl-today-line');
    if (!sc || !line) return;
    var x = parseFloat(line.style.left) || 0;
    sc.scrollLeft = Math.max(0, x - sc.clientWidth / 3);
    state.tlScrollLeft = sc.scrollLeft;
  }

  function renderTopbar() {
    var html = R.topbar(state.route);
    /* แถบเครื่องมือเดียวใช้ทุกมุมมอง ปุ่มจึงอยู่ที่เดิมเสมอไม่ว่าจะสลับไปมุมมองไหน
     * Gantt เพิ่มปุ่มเลื่อนช่วงเวลากับซูมเข้ามาทางซ้าย เพราะเป็นของเฉพาะผังนั้น */
    if (state.route.type === 'project' && S.project(state.route.id) &&
        R.VIEWS_WITH_TOOLBAR.indexOf(state.route.view) >= 0) {
      var tv = viewFor(state.route.id);
      var ex = state.route.view === 'gantt' ? ganttExtras(tv) : {};
      ex.kind = state.route.view;
      ex.dirty = dirtySv();
      ex.canSave = S.can('structure') && S.canInProject(state.route.id, 'edit');
      html += R.viewToolbar(state.route.id, tv, ex);
    }
    $topbar.innerHTML = html;
  }

  /** วาดแถบเครื่องมือ เนื้อหา และแผงตัวเลือกใหม่หลังแก้มุมมอง (ไม่แตะแถบข้างกับแผงงาน) */
  function refreshView() {
    renderTopbar();
    renderViewBody();
    refreshOpts();
  }

  /** ปุ่มที่มีเฉพาะใน Gantt แทรกเข้าไปในแถบเครื่องมือร่วม */
  function ganttExtras(v) {
    var zi = S.GANTT_ZOOMS.map(function (x) { return x.id; }).indexOf(v.gZoom);
    return {
      left: '<div class="g-nav">' +
        '<button data-act="g-pan" data-d="-1" title="' + L('เลื่อนไปทางซ้าย') + '">' +
        I('arrowLeft', 14) + '</button>' +
        '<button class="g-today-btn" data-act="g-today">' + L('วันนี้') + '</button>' +
        '<button data-act="g-pan" data-d="1" title="' + L('เลื่อนไปทางขวา') + '">' +
        I('arrowRight', 14) + '</button></div>',
      right: '<div class="g-zoomctl">' +
        '<span class="lbl" data-act="g-zoom-menu" role="button" tabindex="0">' +
        R.esc(zoomLabel(v.gZoom)) + '</span>' +
        '<button data-act="g-zoom-step" data-d="1"' +
        (zi >= S.GANTT_ZOOMS.length - 1 ? ' disabled' : '') +
        ' title="' + L('ดูช่วงกว้างขึ้น') + '">&minus;</button>' +
        '<button data-act="g-zoom-step" data-d="-1"' + (zi <= 0 ? ' disabled' : '') +
        ' title="' + L('ดูละเอียดขึ้น') + '">+</button></div>'
    };
  }

  function renderAll(skipHash) {
    // โปรเจกต์อาจถูกลบไประหว่างนี้ ต้องถอยกลับก่อนวาด ไม่งั้นหน้าจะพัง
    if (state.route.type === 'project' && !S.project(state.route.id)) {
      state.route = { type: 'home' };
      state.openTaskId = null;
      clearSel();
    }
    applyLang();
    /* บัญชีถูกปิดใช้งาน — กั้นไว้ก่อนวาดแอป และบอกเหตุผลให้ชัด
     * ไม่ปล่อยให้เห็นหน้าจอที่กดอะไรก็ไม่ขึ้นโดยไม่รู้ว่าทำไม */
    if (!S.isActive()) {
      /* Sprint 1B — หน้าเข้าสู่ระบบขึ้นอยู่ (เพิ่งออกจากโหมดเครื่องเดียว) ให้หน้านั้นอยู่ต่อ
       * ไม่งั้นหน้าบัญชีถูกปิดจะทับ ทั้งที่คนเพิ่งเลือกออกไปแล้ว */
      if (!$gate.hidden && !$gate.dataset.kind) return;
      /* Sprint 1B — โหมดเครื่องเดียว (สลับผู้ใช้ทดสอบมาเป็นบัญชีที่ถูกปิด) มีทางกลับบัญชีเดิม
       * ไม่ต้องกดออกจากระบบ ซึ่งเดิมล้างข้อมูลทั้งเครื่องทิ้ง */
      var dsTeam = global.OrbitSync && global.OrbitSync.state.mode === 'team';
      var dsBack = !dsTeam && viewAsOrigin() ? S.user(viewAsOrigin()) : null;
      $gate.innerHTML = R.disabledScreen({ local: !dsTeam, back: dsBack && dsBack.active !== false ? dsBack : null });
      $gate.dataset.kind = "disabled";
      $gate.hidden = false;
      document.body.classList.add('gated');
      return;
    }
    if ($gate.dataset.kind === "disabled") {   // เพิ่งถูกเปิดใช้งานกลับ ต้องเก็บหน้ากั้นออก
      delete $gate.dataset.kind;
      hideGate();
    }
    applyTheme();
    /* 3c — สมุดโน้ตส่วนตัวเป็นหน้าเอกสาร สร้างให้ครั้งแรกที่เปิดแอป (commit แล้ววาดใหม่เอง) */
    if (S.me() && !S.notepadPage() && S.ensureNotepadPage()) return;
    /* Sprint 1A — ไปหน้าอื่นแล้วล้างหมวดที่แตะดูไว้ทิ้ง (เดิมแค่ไม่ใช้ แต่ยังค้างในสถานะ) */
    if (state.navPick && state.navPick.key !== R.routeKey(state.route)) state.navPick = null;
    $sidebar.innerHTML = R.sidebar(state.route, state.navPick);
    renderTopbar();
    renderViewBody();
    renderDrawer();
    renderPill();
    if (!skipHash) syncHash();
  }

  /* ---------- ร่างความเห็น ----------
   *
   * พิมพ์ความเห็นยาว ๆ ค้างไว้แล้วเผลอปิดแผง หรือมีคนอื่นแก้งานจนหน้าจอวาดใหม่
   * ข้อความไม่ควรหาย เก็บแยกต่อคนต่อช่อง (ความเห็นของงาน คำตอบในเธรด การแก้ความเห็น)
   * ไว้ในหน่วยความจำกับ localStorage ของเครื่องนี้ ไม่ใส่ในข้อมูลกลาง
   * เพราะร่างเป็นของส่วนตัว และไม่ควรทำให้ไฟล์ของทั้งทีมเปลี่ยนทุกครั้งที่กดแป้น
   */
  var DRAFT_KEY = 'orbit.drafts';
  var drafts = (function () {
    try { return JSON.parse(global.localStorage.getItem(DRAFT_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  })();
  function draftId(key) { return (S.db.currentUserId || '') + '|' + key; }
  function getDraft(key) { return drafts[draftId(key)] || ''; }
  function setDraft(key, md) {
    if (md && md.trim()) drafts[draftId(key)] = md; else delete drafts[draftId(key)];
    try { global.localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); } catch (e) {}
  }

  /** ร่างความเห็นของคนที่ใช้อยู่ สำหรับวิดเจ็ต "ร่างความเห็น" บนหน้าแรก
   *  คีย์ c:<งาน> ความเห็นใหม่ · r:<ความเห็นแม่> คำตอบ · e:<ความเห็น> กำลังแก้ */
  function draftList() {
    var pre = (S.db.currentUserId || '') + '|';
    var out = [];
    Object.keys(drafts).forEach(function (k) {
      if (k.indexOf(pre) !== 0) return;
      var key = k.slice(pre.length);
      var ref = key.slice(2);
      var tid = key.charAt(0) === 'c' ? ref : (S.story(ref) || {}).taskId;
      var t = tid ? S.task(tid) : null;
      if (!t || !S.canSeeTask(t.id)) return;
      out.push({ key: key, taskId: t.id, taskName: t.name,
                 text: S.plainText(drafts[k]).replace(/\s+/g, ' ').trim() });
    });
    return out;
  }

  /** ตัวแก้ไขที่โฟกัสอยู่ในแผงงาน — เก็บไว้ก่อนวาดใหม่ แล้วคืนเนื้อหาและเคอร์เซอร์ให้หลังวาด
   *  ไม่งั้นทุกครั้งที่ซิงก์ข้อมูลเข้ามาระหว่างพิมพ์ ข้อความที่ยังไม่บันทึกจะหายและโฟกัสหลุด */
  function captureEditor() {
    var ae = document.activeElement;
    if (!ae || !ae.classList || !ae.classList.contains('rte') || !$drawer.contains(ae)) return null;
    return { key: ae.dataset.key, html: ae.innerHTML, off: global.RichText.caretOffsets(ae) };
  }
  function restoreEditor(keep) {
    if (!keep) return;
    var ne = $drawer.querySelector('.rte[data-key="' + keep.key + '"]');
    if (!ne) return;
    ne.innerHTML = keep.html;
    ne.focus();
    global.RichText.setOffsets(ne, keep.off);
  }

  var drawerRendering = false;

  /** ส่งจากช่องพิมพ์ช่องไหนก็ได้ — ความเห็นใหม่ คำตอบในเธรด หรือบันทึกการแก้ความเห็น */
  function submitComposer(ed) {
    var key = ed.dataset.key || '';
    var kind = key.charAt(0), ref = key.slice(2);
    var act = kind === 'c' ? 'send-comment' : kind === 'r' ? 'send-reply' : 'comment-save';
    if (!allowed(act, ed)) return;
    var md = global.RichText.fromNode(ed);
    if (!md.trim()) { if (kind !== 'e') toast(L('พิมพ์ข้อความก่อน')); return; }
    var send = function () {
      /* ล้างช่องก่อนบันทึก การบันทึกทำให้แผงวาดใหม่และคืนเนื้อหาของช่องที่โฟกัสอยู่
       * ถ้ายังไม่ล้าง ข้อความที่เพิ่งส่งไปจะเด้งกลับมาอยู่ในช่องอีกรอบ */
      ed.innerHTML = '';
      setDraft(key, '');
      var sent = null;
      if (kind === 'c') sent = S.addComment(ref, md);
      else if (kind === 'r') { state.openThreads[ref] = true; sent = S.addComment(ed.dataset.id, md, ref); }
      else {
        state.editStory = null;
        if (!S.editComment(ref, md)) renderDrawer();   // ไม่ได้แก้อะไร ก็แค่ปิดโหมดแก้
      }
      /* Sprint 1A — บอกให้เห็นว่าส่งไปแล้ว: เลื่อนไปหาความเห็นใหม่แล้วไฮไลต์ + ข้อความ "ส่งแล้ว"
       * เดิมส่งแล้วเงียบ ความเห็นใหม่อาจอยู่นอกจอ คนเลยกดซ้ำหรือคิดว่ายังไม่ส่ง */
      if (sent && state.openTaskId) {
        state.flashStory = sent.id;
        renderDrawer();
        toast(L('ส่งแล้ว'));
      }
    };
    /* Sprint 1B — @ชื่อ คนนอกโปรเจกต์ปิด = เขากลายเป็นผู้ติดตามและเห็นทั้งงาน ถามก่อนส่ง
     * ยกเลิกแล้วข้อความยังอยู่ในช่อง แก้ชื่อออกแล้วส่งใหม่ได้ */
    var cTid = kind === 'e' ? ((S.story(ref) || {}).taskId || null) : (kind === 'c' ? ref : ed.dataset.id);
    confirmReveal(cTid, S.mentionedIn(md), send);
  }

  /* Sprint 1A — กดปุ่มส่งแล้วไม่ให้ช่องพิมพ์เสียโฟกัส
   * ถ้าช่องเสียโฟกัสตอนกดเมาส์ลง แถบเครื่องมือหุบ กล่องเตี้ยลง ปุ่มเลื่อนหนีจากใต้เมาส์/นิ้วก่อนปล่อย
   * คลิกแรกจึงหาย (มือถือแป้นพิมพ์ยังหุบด้วย ยิ่งเลื่อนมาก) ห้ามการย้ายโฟกัสไว้ คลิกจึงถึงปุ่มเสมอ */
  var SEND_ACTS = ['send-comment', 'send-reply', 'comment-save', 'post-message', 'msg-reply'];

  /* ประกาศ/ตอบในหน้าประกาศแล้ว ช่องพิมพ์ที่เพิ่งส่งยังโฟกัสอยู่และแถบเครื่องมือยังกาง (rte-on)
   * พอผู้ใช้ไปคลิกช่อง "ตอบ" ของประกาศใหม่ ช่องบนค่อยหุบตามหลัง หน้าเลื่อนขึ้น ~38px ระหว่างพิมพ์
   * ปุ่ม "ตอบ" ที่เล็งไว้จึงขยับหนี คลิกแรกหาย — หลังส่งสำเร็จให้ช่องนั้นหุบทันทีเลย ไม่มีอะไรค้างให้หุบทีหลัง */
  function settleComposer(ed) {
    if (!ed) return;
    if (document.activeElement === ed && ed.blur) ed.blur();
    var w = ed.closest && ed.closest('.rte-wrap');
    if (w) w.classList.remove('rte-on');
  }
  document.addEventListener('mousedown', function (e) {
    var b = e.target.closest && e.target.closest('[data-act]');
    if (!b || SEND_ACTS.indexOf(b.dataset.act) < 0) return;
    var ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains('rte')) e.preventDefault();
  }, true);

  /** เปิดงานใหม่ เริ่มแผงจากสภาพตั้งต้นเสมอ */
  function resetDrawerState() {
    /* เปิดงานใหม่ให้กลับมาที่แท็บความเห็นเสมอ
     * ถ้าจำแท็บข้ามงาน คนที่เผลอเปิดค้างไว้ที่ความเคลื่อนไหวทั้งหมด
     * จะเจอบันทึกอัตโนมัติกองหนึ่งทุกครั้งที่เปิดงาน แทนที่จะเจอสิ่งที่ทีมคุยกันไว้ */
    state.actTab = 'comments';
    state.actAll = false;
    state.dwMore = false;      // เปิดงานใหม่เริ่มที่มุมมองสั้นเสมอ
    state.openThreads = {};
    state.editStory = null;
  }

  /* ---------- บันทึกรายละเอียดงานตอนออกจากช่อง ----------
   *
   * ปัญหาของการบันทึกตอน blur คือมันเกิดตอนกดเมาส์ลงบนปุ่มอื่น ก่อนปล่อยเมาส์
   * การบันทึกทำให้แผงวาดใหม่ทั้งแผง ปุ่มที่กำลังกดอยู่จึงถูกแทนที่ก่อนจะเกิด click
   * ผลคือกดครั้งแรกหลังพิมพ์รายละเอียดแล้วไม่มีอะไรเกิดขึ้น
   * จึงเลื่อนการบันทึกไปทำหลังปล่อยเมาส์ ให้ click ของปุ่มนั้นทำงานกับหน้าจอเดิมก่อน */
  var mouseIsDown = false, afterMouse = [];
  document.addEventListener('mousedown', function () { mouseIsDown = true; }, true);
  document.addEventListener('mouseup', function () {
    mouseIsDown = false;
    if (!afterMouse.length) return;
    var run = afterMouse;
    afterMouse = [];
    setTimeout(function () { run.forEach(function (fn) { fn(); }); }, 0);
  }, true);
  function afterClick(fn) { if (mouseIsDown) afterMouse.push(fn); else fn(); }

  function saveNotes(ed) {
    if (drawerRendering) return;
    var tid = ed.dataset.id;
    var t = S.task(tid);
    if (!t) return;
    var md = global.RichText.fromNode(ed);
    if (md === (t.notes || '')) return;
    if (!allowed('edit-notes', ed)) return;
    afterClick(function () { if (S.task(tid)) S.updateTask(tid, { notes: md }); });
  }

  document.addEventListener('focusout', function (e) {
    var ed = e.target;
    if (ed && ed.classList && ed.classList.contains('rte') && ed.dataset.save === 'notes') saveNotes(ed);
  });

  /* ช่องความเห็นเก็บร่างทุกครั้งที่พิมพ์ */
  document.addEventListener('input', function (e) {
    var ed = e.target;
    if (!ed || !ed.classList || !ed.classList.contains('rte-compose')) return;
    setDraft(ed.dataset.key, global.RichText.fromNode(ed));
  });

  /* ลิงก์ในตัวแก้ไข ถามด้วยหน้าต่างของแอป ไม่ใช่ prompt() ของเบราว์เซอร์ */
  global.RichText.ask = function (title, value, cb) {
    askText(title, value, cb, { type: 'url', ok: L('ใส่ลิงก์'),
      note: L('เว้นว่างแล้วกดตกลงเพื่อเอาลิงก์ออก') });
  };

  function renderDrawer() {
    if (state.openTaskId && S.task(state.openTaskId)) {
      var keep = captureEditor();
      var body = $drawer.querySelector('.dw-body');
      var sameTask = $drawer.dataset.task === state.openTaskId;
      var scroll = body && sameTask ? body.scrollTop : 0;
      if (state.editStory && !S.story(state.editStory)) state.editStory = null;
      drawerRendering = true;
      global.RichText.closeMention();
      $drawer.innerHTML = R.drawer(state.openTaskId,
        { actTab: state.actTab, actSort: state.actSort, actAll: state.actAll,
          wide: state.dwWide, moreFields: state.dwMore,
          draft: getDraft, openThreads: state.openThreads, subView: state.subView,
          editStory: state.editStory, flashStory: state.flashStory });
      drawerRendering = false;
      $drawer.dataset.task = state.openTaskId;
      $drawer.classList.toggle('wide', !!state.dwWide);
      $drawer.classList.add('open');
      $dwBack.classList.add('open');
      $drawer.setAttribute('aria-hidden', 'false');
      autoGrow($drawer.querySelector('.dw-title'));
      var nb = $drawer.querySelector('.dw-body');
      if (nb) nb.scrollTop = scroll;
      restoreEditor(keep);
      if (state.flashStory) {
        var fs = document.getElementById('st-' + state.flashStory);
        state.flashStory = null;
        /* เลื่อนทันที ไม่ใช้ smooth เพราะแผงยังเลื่อนเข้ามาจากขอบจออยู่ แอนิเมชันจะตีกันจนไม่ถึงที่ */
        var scrollToStory = function () {
          if (!fs.isConnected || !nb) return;
          var top = fs.getBoundingClientRect().top - nb.getBoundingClientRect().top;
          nb.scrollTop += top - Math.max(0, (nb.clientHeight - fs.offsetHeight) / 2);
        };
        if (fs) { scrollToStory(); setTimeout(scrollToStory, 220); }
      }
    } else {
      delete $drawer.dataset.task;
      $drawer.classList.remove('open');
      $dwBack.classList.remove('open');
      $drawer.setAttribute('aria-hidden', 'true');
      state.openTaskId = null;
    }
  }

  function autoGrow(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  S.onChange(function () { renderAll(); noticeNewInbox(); });

  /** style.background คืนเป็น rgb() — แปลงกลับเป็น hex ให้เก็บลงข้อมูล */
  function rgbToHex(v) {
    if (!v) return S.OPTION_COLORS[0];
    if (v.charAt(0) === '#') return v;
    var m = v.match(/(\d+)\D+(\d+)\D+(\d+)/);
    if (!m) return S.OPTION_COLORS[0];
    return '#' + [m[1], m[2], m[3]].map(function (x) {
      var h = Number(x).toString(16);
      return h.length < 2 ? '0' + h : h;
    }).join('');
  }

  /** เมนูเลือกค่าของฟิลด์ตัวเลือก ใช้ทั้งเซลล์ในตารางและแผงงาน */
  function optionMenu(tid, f) {
    var fid = f.id;
    var cur = S.fieldValue(tid, fid);
    var multi = f.type === 'multi';
    var chosen = multi ? [].concat(cur || []) : [cur];
    var oh = '';
    if (!multi) {
      oh += '<button data-act="cell-set-option" data-id="' + R.esc(tid) + '" data-field="' +
        R.esc(fid) + '" data-v="">' + L('ไม่ระบุ') + '</button>';
    }
    (f.options || []).forEach(function (o) {
      var on = chosen.indexOf(o.name) >= 0;
      oh += '<button data-act="' + (multi ? 'cell-toggle-option' : 'cell-set-option') +
        '" data-id="' + R.esc(tid) + '" data-field="' + R.esc(fid) +
        '" data-v="' + R.esc(o.name) + '">' +
        '<span class="opt-pill" style="background:' + R.esc(o.color) + '22;color:' +
        R.esc(o.color) + '">' + R.esc(o.name) + '</span>' +
        (on ? '<span style="margin-left:auto">' + I('check', 13) + '</span>' : '') +
        '</button>';
    });
    if (!(f.options || []).length) {
      oh += '<div style="padding:8px 10px;font-size:13px;color:var(--fg-faint)">' +
        L('ฟิลด์นี้ยังไม่มีตัวเลือก') + '</div>';
    }
    return oh;
  }

  /** หาฟิลด์จากรหัส — ฟิลด์เป็นของโปรเจกต์ แต่แผงงานไม่รู้ว่ามาจากโปรเจกต์ไหน */
  function findField(fid) {
    var hit = null;
    S.db.projects.forEach(function (p) {
      (p.fields || []).forEach(function (f) { if (f.id === fid) hit = f; });
    });
    return hit;
  }

  /** แก้ค่าในเซลล์ตาราง — เลือกวิธีตามชนิดของคอลัมน์ */
  function editCell(cell) {
    var kind = cell.dataset.cell;
    var tid = cell.dataset.id;
    var t = S.task(tid);
    if (!t) return;

    if (kind === 'assignee') {
      if (popIsOpenFor(cell)) { closePops(); return; }
      var ah = '<button data-act="cell-set-assignee" data-id="' + R.esc(tid) +
        '" data-user="">' + R.avatar(null) + ' ' + L('ยังไม่มอบหมาย') + '</button>';
      S.db.users.forEach(function (u) {
        ah += '<button data-act="cell-set-assignee" data-id="' + R.esc(tid) +
          '" data-user="' + R.esc(u.id) + '">' + R.avatar(u) + ' ' + R.esc(u.name) + '</button>';
      });
      cell.style.position = 'relative';
      openPop(cell, ah);
      return;
    }

    if (kind === 'due') { inlineInput(cell, 'date', t.dueOn || '', function (v) {
      setDates(tid, { dueOn: v || null });       // 3c — ดูงานที่ขยับตามก่อน
    }); return; }
    if (kind === 'start') { inlineInput(cell, 'date', t.startOn || '', function (v) {
      setDates(tid, { startOn: v || null });
    }); return; }
    if (kind === 'priority') {
      if (popIsOpenFor(cell)) { closePops(); return; }
      var prh = '';
      S.PRIORITIES.forEach(function (x) {
        prh += '<button data-act="cell-set-priority" data-id="' + R.esc(tid) + '" data-v="' + x.id + '">' +
          '<span class="swatch" style="background:' + x.color + '"></span> ' + L(x.label) + '</button>';
      });
      cell.style.position = 'relative';
      openPop(cell, prh);
      return;
    }

    var fid = cell.dataset.field;
    var p = S.project(state.route.id);
    var f = p.fields.filter(function (x) { return x.id === fid; })[0];
    if (!f) return;
    var cur = S.fieldValue(tid, fid);
    if (f.type === 'formula') return;          // 3c — สูตรแก้ไม่ได้
    if (f.type === 'ref') {                      // 3c — เลือกงาน/โปรเจกต์/พอร์ตโฟลิโอ
      if (popIsOpenFor(cell)) { closePops(); return; }
      cell.style.position = 'relative';
      openPop(cell, refPop(tid, fid, ''));
      setTimeout(function () { var q = document.getElementById('refQ'); if (q) q.focus(); }, 20);
      return;
    }

    if (f.type === 'select' || f.type === 'multi') {
      if (popIsOpenFor(cell)) { closePops(); return; }
      cell.style.position = 'relative';
      openPop(cell, optionMenu(tid, f));
      return;
    }

    if (f.type === 'person') {
      if (popIsOpenFor(cell)) { closePops(); return; }
      var ph2 = '<button data-act="cell-set-option" data-id="' + R.esc(tid) + '" data-field="' +
        R.esc(fid) + '" data-v="">' + L('ไม่ระบุ') + '</button>';
      S.db.users.forEach(function (u) {
        ph2 += '<button data-act="cell-set-option" data-id="' + R.esc(tid) + '" data-field="' +
          R.esc(fid) + '" data-v="' + R.esc(u.id) + '">' + R.avatar(u) + ' ' +
          R.esc(u.name) + '</button>';
      });
      cell.style.position = 'relative';
      openPop(cell, ph2);
      return;
    }

    var itype = f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text');
    inlineInput(cell, itype, cur == null ? '' : cur, function (v) {
      if (f.type === 'number') S.setFieldValue(tid, fid, v === '' ? null : Number(v));
      else S.setFieldValue(tid, fid, v || null);
    });
  }

  /** วางช่องกรอกทับเซลล์ชั่วคราว บันทึกเมื่อกด Enter หรือคลิกที่อื่น */
  function inlineInput(cell, type, value, onSave) {
    var old = cell.innerHTML;
    cell.innerHTML = '';
    var inp = document.createElement('input');
    inp.type = type;
    inp.value = value;
    inp.className = 'cell-input';
    cell.appendChild(inp);
    inp.focus();
    if (type === 'text') inp.select();

    var done = false;
    function finish(save) {
      if (done) return;
      done = true;
      var v = inp.value;
      cell.innerHTML = old;
      if (save) onSave(v);
    }
    inp.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
      ev.stopPropagation();
    });
    inp.addEventListener('click', function (ev) { ev.stopPropagation(); });
    inp.addEventListener('blur', function () { finish(true); });
  }

  /* ---------- Sprint 1C — ช่องวันที่ทุกช่องรับปี พ.ศ. ได้ และไม่ยอมเก็บปีที่ผิดรูป ----------
   *
   * ช่องวันที่ของเบราว์เซอร์ (input type=date) เป็น ค.ศ. เสมอ แต่หน้าจอภาษาไทยแสดงปี พ.ศ.
   * คนไทยจึงพิมพ์ 04/12/2569 ตามความเคยชิน แล้วได้ปี ค.ศ. 2569 ลงข้อมูลจริง (โชว์เป็น "4 ธ.ค. 12")
   * หรือพิมพ์เลขเกินจนได้ปี 122026 โดยไม่มีอะไรเตือนเลย
   *
   * Chrome ยิง input/change ทุกครั้งที่พิมพ์เลขหนึ่งหลัก ระหว่างพิมพ์ปีจึงเป็น 0002 0025 0256 …
   * และช่องในแผงงานบันทึกแล้ววาดใหม่ทุกครั้งที่ได้ change พิมพ์วันเสร็จหนึ่งช่องโฟกัสก็หลุด พิมพ์ต่อไม่ได้
   * จึงดักที่ window ช่วง capture (ก่อนตัวจัดการของแอปทุกตัว):
   *   ค่าที่มาจากการพิมพ์ = เก็บไว้ก่อน ยังไม่ให้แอปเห็น (เลือกจากปฏิทินของเบราว์เซอร์ = ผ่านทันทีเหมือนเดิม)
   *   ออกจากช่องหรือกด Enter ค่อยตัดสินค่าสุดท้ายแล้วยิง change ครั้งเดียว:
   *     ปีปกติ 2000–2100 = ผ่าน
   *     ปี ≥ 2400 = พ.ศ. ลบ 543 ให้ แล้วบอกด้วยข้อความสั้น ๆ
   *     ปีนอกช่วง = ไม่บันทึก คืนค่าล่าสุดที่ถูกต้อง และบอกว่าทำไม (Enter ไม่ไปกดบันทึกของหน้าต่างต่อ)
   * ช่องที่อ่านค่าตอนกดปุ่มบันทึกก็ได้ค่าที่แปลงแล้ว เพราะ blur เกิดก่อน click ของปุ่มเสมอ
   * ทำที่เดียวตรงนี้ ทุกช่องวันที่ในแอป (งาน กำหนดส่งหลายงาน โปรเจกต์ ตัวกรอง ฟอร์ม เป้าหมาย …) ได้ครบ */
  var DATE_Y_MIN = 2000, DATE_Y_MAX = 2100, BE_FROM = 2400;
  function dgYear(v) { var m = /^(\d{4,6})-\d\d-\d\d$/.exec(v || ''); return m ? +m[1] : null; }
  function dgIsDate(el) { return !!el && el.tagName === 'INPUT' && el.type === 'date'; }
  function dgOk(v) { var y = dgYear(v); return !v || (y !== null && y >= DATE_Y_MIN && y <= DATE_Y_MAX); }

  function dgFire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  /** ตัดสินค่าสุดท้ายของช่องที่ค้างอยู่ คืน false ถ้าปฏิเสธ (ค่าถูกคืนเป็นของเดิมแล้ว) */
  function dgSettle(el) {
    el._dgKey = false;
    if (!el._dgPend) return true;
    el._dgPend = false;
    var v = el.value, y = dgYear(v);
    if (dgOk(v)) {
      if (v !== el._dgOk) { el._dgOk = v; dgFire(el); }
      return true;
    }
    if (y !== null && y >= BE_FROM && y - 543 >= DATE_Y_MIN && y - 543 <= DATE_Y_MAX) {
      el.value = (y - 543) + v.slice(String(y).length);
      el._dgOk = el.value;
      toast(L('แปลงปี พ.ศ. {b} เป็น ค.ศ. {g} ให้แล้ว', { b: y, g: y - 543 }));
      dgFire(el);
      return true;
    }
    /* ช่องในหน้าต่าง (กำหนดส่งหลายงาน ฯลฯ) — เดิมคืนค่าเดิม (ค่าตั้งต้นคือวันนี้) Enter ครั้งที่สองจึงบันทึก "วันนี้"
     * ทั้งที่ผู้ใช้ไม่ได้ตั้งใจ ช่องในหน้าต่างให้ว่างและติดธง _dgBad ไว้ ปุ่มหลักของหน้าต่างไม่ทำงานจนกว่าจะแก้ปี
     * (ว่างเฉย ๆ ไม่ได้ เพราะบางหน้าต่าง "ว่าง" แปลว่าลบวัน) · ช่องนอกหน้าต่างไม่มีปุ่มบันทึก คืนค่าเดิมเหมือนเดิม */
    if (el.closest && el.closest('#modal, .modal')) {
      el.value = '';
      el._dgBad = true;
      el.classList.add('inp-bad');
    } else {
      el.value = el._dgOk || '';
    }
    toast(L('ปี {y} ไม่ถูกต้อง ใช้ปี ค.ศ. {a}–{z} (หรือ พ.ศ.) — ยังไม่ได้บันทึกวันที่นี้',
      { y: y === null ? '?' : y, a: DATE_Y_MIN, z: DATE_Y_MAX }));
    return false;
  }
  /** ช่องวันที่ที่เพิ่งถูกปฏิเสธและยังไม่ได้แก้ — หน้าต่างอย่าเพิ่งบันทึก */
  function dgBlocked(root) {
    var bad = root && root.querySelector && Array.prototype.filter.call(root.querySelectorAll('input[type="date"]'),
      function (x) { return x._dgBad; })[0];
    if (!bad) return false;
    toast(L('แก้ปีในช่องวันที่ก่อน (หรือเลือกจากปฏิทิน)'));
    bad.focus();
    return true;
  }
  function dgClearBad(el) { if (el && el._dgBad) { el._dgBad = false; el.classList.remove('inp-bad'); } }
  global.addEventListener('focusin', function (e) {
    var el = e.target;
    if (dgIsDate(el) && !el._dgPend) el._dgOk = dgOk(el.value) ? el.value : '';
  }, true);
  function dgGuard(e) {
    var el = e.target;
    if (!dgIsDate(el)) return;
    if (dgOk(el.value) && !el._dgKey) {
      el._dgOk = el.value; el._dgPend = false;
      if (el.value) dgClearBad(el);          // เลือกวันจากปฏิทินของเบราว์เซอร์แล้ว
      return;
    }
    if (!('_dgOk' in el)) el._dgOk = dgOk(el.defaultValue) ? el.defaultValue : '';
    el._dgPend = true;
    e.stopImmediatePropagation();            // ยังพิมพ์ไม่จบ — แอปยังไม่ต้องเห็น
  }
  global.addEventListener('input', dgGuard, true);
  global.addEventListener('change', dgGuard, true);
  global.addEventListener('blur', function (e) { if (dgIsDate(e.target)) dgSettle(e.target); }, true);
  global.addEventListener('keydown', function (e) {
    var el = e.target;
    if (!dgIsDate(el)) return;
    if (e.key !== 'Enter') {
      /* ตัวเลข ลบ หรือลูกศรขึ้นลง = กำลังพิมพ์/แก้ค่าเอง (Tab กับลูกศรซ้ายขวาแค่ย้ายช่อง) */
      if (/^\d$/.test(e.key) || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        el._dgKey = true;
        dgClearBad(el);                       // เริ่มแก้แล้ว — ให้ตัดสินค่าใหม่ตอนออกจากช่อง/กด Enter
      }
      return;
    }
    if (!el._dgPend) {
      el._dgKey = false;
      /* ยังไม่ได้แก้ช่องที่เพิ่งถูกปฏิเสธ — Enter อย่าไปกดบันทึกของหน้าต่าง */
      if (el._dgBad) { e.preventDefault(); e.stopImmediatePropagation(); dgBlocked(el.parentNode || el); }
      return;
    }
    if (!dgSettle(el)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  /* ---------- modal ---------- */

  function openModal(html, wide) {
    closeSidebar();
    /* เมนูลอยที่เปิดหน้าต่างนี้ (เมนูโปรเจกต์ เมนูอวาตาร์ เมนูงาน …) ต้องปิดไปด้วย
     * เดิมแต่ละคำสั่งต้องจำเรียก closePops เอง ที่ลืมไว้เมนูจึงลอยค้างอยู่หลังหน้าต่าง — ปิดที่จุดเดียวตรงนี้ */
    closePops();
    askBack = null;           // หน้าต่างใหม่มาแทนหน้าต่างถาม — ทางกลับเดิมไม่ใช้แล้ว
    $modal.className = 'modal' + (wide ? ' wide' : '');
    $modal.innerHTML = html;
    $mdBack.classList.add('open');
    var first = $modal.querySelector('input, select, textarea');
    /* Sprint 1A — select() ใช้กับช่องวันที่/ตัวเลขไม่ได้ (โยน error) ครอบไว้
     * หน้าต่างที่ไม่มีช่องกรอก (askConfirm/askChoice) ย้ายโฟกัสมาที่หน้าต่าง
     * ไม่งั้นปุ่มเดิมที่เปิดหน้าต่างยังโฟกัสอยู่ กด Enter แล้วกลายเป็นกดปุ่มนั้นซ้ำแทนการตอบตกลง */
    if (first) setTimeout(function () { first.focus(); try { if (first.select) first.select(); } catch (er) { /* ช่องชนิดนี้เลือกข้อความไม่ได้ */ } }, 40);
    else {
      $modal.setAttribute('tabindex', '-1');
      try { $modal.focus({ preventScroll: true }); } catch (er) { $modal.focus(); }
    }
  }

  /* Sprint 1A — Enter ในหน้าต่างถาม = ปุ่มหลัก (ตกลง / บันทึก / สร้าง) · Esc = ยกเลิก (ตัวจัดการคีย์หลัก)
   * เดิมมีแค่ช่อง askText ที่ Enter ใช้ได้ หน้าต่างเพิ่มฟิลด์ สร้างแท็ก ยืนยัน/เลือกทาง กด Enter แล้วไม่เกิดอะไร
   * ผูกที่ window ให้ทำงานหลังตัวจัดการอื่นทุกตัว ถ้ามีใครจัดการ Enter ไปแล้ว (preventDefault) จะไม่ซ้ำ
   * ไม่แตะ textarea / ตัวแก้ไขข้อความ (Enter = ขึ้นบรรทัดใหม่) ปุ่ม/ลิงก์ (Enter = กดตัวมันเอง) และ select
   * หน้าต่างที่ปุ่มหลักคือ "ปิด" (เช่นตั้งค่า) ไม่ปิดให้ — แก้ค่าในช่องแล้วกด Enter ไม่ควรพาหน้าต่างหายไป */
  global.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$mdBack.classList.contains('open')) return;
    var t = e.target;
    if (!t || (t !== $modal && t !== document.body && !$modal.contains(t))) return;
    var tag = t.tagName;
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A' || tag === 'SELECT' || t.isContentEditable) return;
    if (tag === 'INPUT' && /^(file|button|submit|reset|color|range)$/i.test(t.type)) return;
    var primary = function () {
      var b = $modal.querySelector('[data-act="ask-ok"]') ||
        $modal.querySelector('.ask-choices .btn-primary') ||
        $modal.querySelector('.modal-acts .btn-primary');
      return b && !b.disabled && b.dataset.act !== 'close-modal' ? b : null;
    };
    if (!primary()) return;
    e.preventDefault();
    /* ให้ change ของช่องนี้เกิดก่อนกดปุ่ม (บางหน้าต่างวาดใหม่ตอน change จึงหาปุ่มใหม่อีกรอบ) */
    if (tag === 'INPUT' && t.blur) t.blur();
    var ok = primary();
    if (ok) ok.click();
  });
  function closeModal() {
    $mdBack.classList.remove('open');
    $modal.innerHTML = '';
    /* หน้าต่างถามที่เปิดทับหน้าต่างแก้ไข (ฟอร์ม อัตโนมัติ) — ยกเลิกแล้วต้องกลับไปที่หน้าต่างเดิม
     * ไม่ใช่หายไปทั้งคู่พร้อมสิ่งที่แก้ค้างไว้ (askChoice opts.back) */
    var back = askBack;
    askBack = null;
    if (back) back();
  }

  /* ---------- ถามผู้ใช้ด้วยหน้าต่างของแอปเอง ----------
   *
   * เดิมใช้ prompt() กับ confirm() ของเบราว์เซอร์ ซึ่งพังเงียบในหลายที่
   * หน้าเว็บที่รันใน iframe แบบ sandbox โดยไม่ได้เปิดสิทธิ์ allow-modals
   * จะถูกเบราว์เซอร์เมินคำสั่งพวกนี้ทั้งหมด ไม่มี error ไม่มีอะไรขึ้น
   * prompt() คืน null แล้วโค้ดก็ break ทิ้ง ปุ่มจึงกดแล้วไม่เกิดอะไรเลย
   * ส่วน confirm() คืน false ทำให้ทุกปุ่มที่มีคำถามยืนยันกลายเป็นปุ่มตาย
   *
   * ใช้หน้าต่างของแอปเองแทน นอกจากทำงานได้ทุกที่แล้วยังแปลภาษาได้
   * และหน้าตาเข้าชุดกับที่เหลือ ต่างจากกล่องของเบราว์เซอร์ที่บังคับใช้ภาษาระบบ
   */
  var pendingAsk = null;
  var askChoiceFns = [];
  var askBack = null;       // askChoice ที่ยกเลิกแล้วต้องกลับไปหน้าต่างเดิม (ดู closeModal)

  var askPasteCtx = null;   // ช่องถามนี้เป็นช่องเพิ่มงานไหม (วางหลายบรรทัด = หลายงาน)

  function askText(title, value, onOk, opts) {
    opts = opts || {};
    pendingAsk = onOk;
    askPasteCtx = opts.pasteCtx || null;
    openModal('<h2>' + R.esc(title) + '</h2>' +
      (opts.note ? '<p class="prj-note">' + R.esc(opts.note) + '</p>' : '') +
      '<div class="field"><input id="askInput" type="' + (opts.type || 'text') + '" value="' +
      R.esc(value == null ? '' : value) + '" placeholder="' + R.esc(opts.placeholder || '') + '"></div>' +
      '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="ask-ok">' +
      R.esc(opts.ok || L('ตกลง')) + '</button></div>');
  }

  function askConfirm(title, body, onOk, opts) {
    opts = opts || {};
    pendingAsk = onOk;
    openModal('<h2>' + R.esc(title) + '</h2>' +
      (body ? '<p class="ask-body">' + R.esc(body) + '</p>' : '') +
      '<div class="modal-acts"><button class="btn" data-act="close-modal">' +
      L('ยกเลิก') + '</button>' +
      '<button class="btn ' + (opts.safe ? 'btn-primary' : 'btn-danger') +
      '" data-act="ask-ok">' + R.esc(opts.ok || L('ยืนยัน')) + '</button></div>');
  }

  /** ถามแบบหลายทางเลือก ใช้ตอนที่ "ยกเลิก" ไม่ใช่คำตอบตรงข้ามของ "ตกลง"
   *  opts.back — ยกเลิก (ปุ่ม Esc คลิกนอกหน้าต่าง) แล้วเรียกตัวนี้ เช่นเปิดหน้าต่างแก้ไขเดิมกลับมา */
  function askChoice(title, body, choices, opts) {
    pendingAsk = null;
    askChoiceFns = [];
    askBack = null;
    var h = '<h2>' + R.esc(title) + '</h2>' +
      (body ? '<p class="ask-body">' + R.esc(body) + '</p>' : '') +
      '<div class="ask-choices">';
    choices.forEach(function (c, i) {
      askChoiceFns[i] = c.run;
      h += '<button class="btn' + (c.primary ? ' btn-primary' : '') +
        '" data-act="ask-choice" data-i="' + i + '">' + R.esc(c.label) + '</button>';
    });
    h += '</div><div class="modal-acts"><button class="btn" data-act="close-modal">' +
      L('ยกเลิก') + '</button></div>';
    openModal(h);
    askBack = (opts && opts.back) || null;
  }

  /* ---------- Sprint 1B: ถามก่อนให้คนนอกโปรเจกต์เห็นงาน ----------
   *
   * มอบหมาย เพิ่มผู้ติดตาม หรือ @ชื่อ คนที่ไม่ได้เป็นสมาชิกโปรเจกต์ (ปิด) ทำให้เขาเห็นทั้งงาน
   * และความเห็นทุกอันในงานนั้น เดิมเกิดขึ้นเงียบ ๆ ราคาที่คุยกันในโปรเจกต์ปิดจึงหลุดไปถึงคนนอก
   * ตอนนี้ถามก่อนทุกครั้ง ให้เลือกเองว่าจะเพิ่มเขาเป็นสมาชิก ให้เห็นแค่งานนี้ หรือยกเลิก
   * ทางเลือกที่เลือกกับการกระทำจริงอยู่ในจุดย้อนกลับเดียวกัน */
  function confirmReveal(taskIds, userIds, run) {
    var r = S.revealOutsiders(taskIds, userIds);
    if (!r.users.length) { run(); return; }
    var ids = r.users.map(function (u) { return u.id; });
    askReveal(r, function (access) {
      S.batch('ให้คนนอกโปรเจกต์เห็นงาน', null, function () {
        S.revealTo(taskIds, ids, access);
        run();
      });
    });
  }

  /* ถามแบบเดียวกันแต่ "งานยังไม่เกิด" (สร้างจากภาระงาน หน้าเอกสาร เทมเพลต)
   * งานยังไม่มี revealOutsiders จึงหาคนนอกไม่ได้ ใช้รายชื่อสมาชิกของโปรเจกต์ปลายทางแทน (S.outsidersOf)
   * run() สร้างงานแล้วคืนงานที่สร้าง (อาร์เรย์หรือชิ้นเดียว) — ทำตามที่เลือกหลังสร้างในจุดย้อนกลับเดียวกัน
   * ยกเลิก = ไม่มีอะไรถูกสร้าง ไม่มีใครถูกเพิ่ม · ไม่มีคนนอก = ทำเลยไม่ถาม (ไม่มีจุดย้อนกลับเกินมา)
   * back — ถามทับหน้าต่างอื่นอยู่ (นำเข้า CSV) ยกเลิกแล้วเปิดหน้าต่างเดิมกลับมา */
  function confirmRevealNew(projectId, userIds, run, back) {
    var r = S.outsidersOf(projectId, userIds);
    if (!r.users.length) { run(); return; }
    var ids = r.users.map(function (u) { return u.id; });
    askReveal(r, function (access) {
      S.batch('ให้คนนอกโปรเจกต์เห็นงาน', null, function () {
        /* เพิ่มสมาชิกก่อนสร้าง งานใหม่จะได้แจ้งและคิดสิทธิ์ตามสมาชิกชุดใหม่ */
        if (access) S.revealTo([], ids, access, projectId);
        var made = [].concat(run() || []).filter(Boolean);
        if (!access && made.length) S.revealTo(made.map(function (t) { return t.id; }), ids, null, projectId);
      });
    }, { back: back });
  }

  /* เอางานที่มีอยู่แล้วเข้าโปรเจกต์ปิดอีกโปรเจกต์ (เพิ่มเข้าโปรเจกต์ ทำให้เป็นสาธารณะ แก้หลายงาน)
   * คู่กรณีของงานที่ไม่ได้เป็นสมาชิกโปรเจกต์ปลายทางจะเห็นทุกอย่างที่คุยกันในงานนั้นต่อ ถามก่อน (S.joinOutsiders)
   * run() เอางานเข้าโปรเจกต์แล้วคืนค่าจริงถ้าสำเร็จ · ยกเลิก = ไม่มีอะไรเปลี่ยน
   * ทำไม่ได้อยู่แล้ว (สิทธิ์ปลายทาง) ไม่ต้องถาม ให้ run ไปโดนด่านสร้างงานปฏิเสธพร้อมเหตุผลเหมือนเดิม */
  function confirmJoin(projectId, taskIds, run) {
    var r = S.canCreateTask(projectId) ? S.joinOutsiders(taskIds, projectId) : { users: [] };
    if (!r.users.length) { run(); return; }
    var ids = r.users.map(function (u) { return u.id; });
    var p = r.projects[0];
    askReveal(r, function (access) {
      S.batch('ให้คนนอกโปรเจกต์เห็นงาน', null, function () {
        if (access) S.revealTo([], ids, access, projectId);
        var ok = run();
        if (!access && ok) S.revealTo(taskIds, ids, null, projectId);
      });
    }, {
      body: L('{who} เป็นผู้รับผิดชอบหรือผู้ติดตามของงานนี้ ถ้าเพิ่มเข้า “{p}” เขาจะเห็นทุกอย่างที่คุยกันในงานนี้ต่อจากนี้ รวมถึงความเห็นและไฟล์แนบ (แม้โปรเจกต์จะเป็นโปรเจกต์ปิด)',
        { who: r.users.map(function (u) { return u.name; }).join(', '), p: p ? p.name : '' })
    });
  }

  /* ค่าที่จะ "มอบงานในอนาคต" (ผู้รับผิดชอบเริ่มต้นของฟอร์ม คนที่อัตโนมัติจะมอบ/เพิ่มเป็นผู้ติดตาม)
   * ยังไม่มีงานให้ใครเห็นตอนบันทึก แต่ทุกงานที่เกิดทีหลังจะเปิดให้คนนั้นเห็น เตือนตอนบันทึก
   * ให้เลือกเพิ่มเป็นสมาชิก บันทึกต่อทั้งอย่างนั้น หรือยกเลิกกลับไปแก้ (ไม่บันทึก) */
  function confirmFutureReveal(projectId, userIds, what, run, back) {
    var r = S.outsidersOf(projectId, userIds);
    if (!r.users.length) { run(); return; }
    var ids = r.users.map(function (u) { return u.id; });
    askReveal(r, function (access) {
      if (!access) { run(); return; }          // บันทึกต่อเฉย ๆ ไม่มีอะไรต้องรวมจุดย้อนกลับ
      S.batch('ให้คนนอกโปรเจกต์เห็นงาน', null, function () {
        S.revealTo([], ids, access, projectId);
        run();
      });
    }, {
      body: L('{what}จะมอบงานในโปรเจกต์นี้ให้ {who} ทุกงานที่เกิดขึ้น {who} จะเห็นทั้งงาน รวมถึงความเห็นและไฟล์แนบ (แม้โปรเจกต์จะเป็นโปรเจกต์ปิด)',
        { what: what, who: r.users.map(function (u) { return u.name; }).join(', ') }),
      only: L('บันทึกต่อ (ให้เห็นเฉพาะงานที่ได้รับ)'),
      back: back
    });
  }

  /** หน้าต่างถามชุดเดียวกันของทั้งสามทางข้างบน — go(access) ทำตามที่เลือก */
  function askReveal(r, go, o) {
    o = o || {};
    var names = r.users.map(function (u) { return u.name; }).join(', ');
    var p = r.projects[0];
    var canAdd = !!p && S.canAddMembers(p.id);
    var choices = [];
    if (canAdd) {
      choices.push({ label: L('เพิ่มเป็นสมาชิกโปรเจกต์ (แสดงความเห็นได้)'), primary: true, run: function () { go('comment'); } });
      choices.push({ label: L('เพิ่มเป็นสมาชิกโปรเจกต์ (แก้ไขได้)'), run: function () { go('edit'); } });
    }
    choices.push({ label: o.only || L('ให้เห็นเฉพาะงานนี้'), primary: !choices.length, run: function () { go(null); } });
    askChoice(L('{who} ไม่ได้เป็นสมาชิกของ “{p}”', { who: names, p: p ? p.name : '' }),
      (o.body || L('ถ้าทำต่อ {who} จะเห็นงานนี้ รวมถึงความเห็นและไฟล์แนบทั้งหมดในงาน (แม้โปรเจกต์จะเป็นโปรเจกต์ปิด)', { who: names })) +
      (p && !canAdd ? ' ' + L('ถ้าต้องการให้เป็นสมาชิกโปรเจกต์ ขอให้ผู้ดูแลโปรเจกต์หรือผู้ดูแลระบบเพิ่มให้') : ''),
      choices, { back: o.back });
  }

  /* ---------- popover ---------- */

  function closePops() {
    Array.prototype.forEach.call(document.querySelectorAll('.pop'), function (p) { p.remove(); });
    popAnchor = null;
  }
  /* เมนูลอยผูกไว้กับ body และวางด้วยพิกัดจริง
   * ถ้าแปะไว้ในตารางจะโดน overflow:hidden ของหัวคอลัมน์และกรอบเลื่อนตัดหายไป */
  var popAnchor = null;

  function openPop(anchorEl, html) {
    var same = popAnchor === anchorEl && document.querySelector('.pop');
    closePops();
    if (same) return null;

    var pop = document.createElement('div');
    pop.className = 'pop';
    pop.innerHTML = html;
    document.body.appendChild(pop);
    popAnchor = anchorEl;

    var a = anchorEl.getBoundingClientRect();
    pop.style.top = (a.bottom + 5) + 'px';
    pop.style.left = a.left + 'px';
    keepInView(pop, a);
    return pop;
  }

  function popIsOpenFor(el) {
    return popAnchor === el && !!document.querySelector('.pop');
  }

  /** ดันกลับเข้าจอถ้าล้นขอบ ปุ่มริมขวาหรือใกล้ก้นจอจะเปิดเมนูออกนอกจอได้ */
  function keepInView(pop, anchorRect) {
    var pad = 8;
    var r = pop.getBoundingClientRect();

    if (r.right > global.innerWidth - pad) {
      pop.style.left = Math.max(pad, global.innerWidth - pad - r.width) + 'px';
    }
    r = pop.getBoundingClientRect();
    if (r.bottom > global.innerHeight - pad) {
      // ถ้าใต้ปุ่มไม่พอ ให้พลิกไปอยู่เหนือปุ่มแทน
      var above = anchorRect ? anchorRect.top - 5 - r.height : 0;
      if (anchorRect && above > pad) pop.style.top = above + 'px';
      else pop.style.maxHeight = Math.max(150, global.innerHeight - pad - r.top) + 'px';
    }
  }

  /* ---------- navigation ---------- */

  function goProject(id, view) {
    var p = S.project(id);
    if (!p) return;
    var okViews = S.projectViews(id);
    var dsv = !view && p.defaultTab ? S.savedView(id, p.defaultTab) : null;
    var v = view || p.defaultView || okViews[0];
    if (okViews.indexOf(v) < 0) v = okViews[0];
    state.route = dsv ? { type: 'project', id: id, view: dsv.kind || 'list', sv: dsv.id }
                      : { type: 'project', id: id, view: v };
    state.calOffset = 0;
    state.tlScrollLeft = null;
    clearSel();
    renderAll();
  }

  /** เปิดหน้าโปรไฟล์ ไม่ส่ง id = ของตัวเอง */
  function goProfile(id) {
    var uid = id || (S.me() && S.me().id);
    if (!S.user(uid)) return;
    state.route = { type: 'profile', id: uid };
    clearSel();
    renderAll();
  }

  function openTask(id) {
    if (!S.task(id) || !S.canSeeTask(id)) return;
    outsideClose = null;        // Sprint 1A — คลิกนอกแผงที่เปิดงานอื่น = สลับงาน ไม่ต้องปิดแผง
    flushEditor();
    if (state.openTaskId !== id) resetDrawerState();
    state.openTaskId = id;
    /* เปิดดูแล้ว จุดสีฟ้าในงานของฉันหาย — mtMarkSeen commit แล้ววาดใหม่ทั้งหน้าให้เอง */
    if (!S.mtMarkSeen(id)) renderDrawer();
    syncHash();
  }

  /** ออกจากตัวแก้ไขที่โฟกัสอยู่ในแผงงาน ให้รายละเอียดที่พิมพ์ค้างถูกบันทึกก่อนแผงเปลี่ยน */
  function flushEditor() {
    var ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains('rte') && $drawer.contains(ae)) ae.blur();
  }

  function closeDrawer() {
    flushEditor();
    state.openTaskId = null;
    renderDrawer();
    syncHash();
  }

  /* ---------- inline add ---------- */

  function inlineAdd(btn, sectionId) {
    var projectId = state.route.id;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'inp inline-add-input';
    input.dataset.project = projectId;
    input.dataset.section = sectionId;
    input.placeholder = L('ชื่องาน แล้วกด Enter (วางหลายบรรทัด = หลายงาน)');
    input.style.cssText = 'border:1px solid var(--accent);background:var(--bg);margin:4px 0';
    btn.style.display = 'none';
    btn.parentNode.insertBefore(input, btn);
    input.focus();

    /* Sprint 3 — ตัวอย่างก่อนกด Enter: พิมพ์ "ส่งสไลด์ @สมชาย ศุกร์" แล้วเห็นว่าระบบจะใส่ใครและวันไหน (ไม่เจอ = ไม่โชว์อะไร) */
    var hint = document.createElement('div');
    hint.className = 'inline-add-hint';
    hint.hidden = true;
    input.parentNode.insertBefore(hint, btn);
    input.addEventListener('input', function () {
      var q = S.quickAdd(input.value.trim(), projectId), bits = [];
      if (q.assigneeId) { var qu = S.user(q.assigneeId); if (qu) bits.push(L('มอบให้ {who}', { who: qu.name })); }
      if (q.dueOn) bits.push(L('ส่ง {d}', { d: R.fmtDate(q.dueOn) }));
      hint.hidden = !bits.length;
      hint.textContent = bits.length ? '→ ' + q.name + ' · ' + bits.join(' · ') : '';
    });

    function done() {
      var v = input.value.trim();
      input.value = '';
      input.remove();
      hint.remove();
      btn.style.display = '';
      if (v) S.createTask(S.quickAdd(v, projectId), projectId, sectionId);
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var v = input.value.trim();
        input.value = '';
        if (v) {
          state.reopenAddIn = sectionId;
          S.createTask(S.quickAdd(v, projectId), projectId, sectionId);
        }
      } else if (e.key === 'Escape') {
        input.value = '';
        input.blur();
      }
    });
    input.addEventListener('blur', done);
  }

  function resumeInlineAdd() {
    if (state.reopenMtAdd) {
      var msec = state.reopenMtAdd;
      state.reopenMtAdd = null;
      var mb = $view.querySelectorAll('[data-act="mt-add"]');
      for (var k = 0; k < mb.length; k++) {
        if (mb[k].getAttribute('data-section') === msec) { mtInlineAdd(mb[k], msec); return; }
      }
    }
    if (!state.reopenAddIn) return;
    var sec = state.reopenAddIn;
    state.reopenAddIn = null;
    var all = $view.querySelectorAll('[data-act="inline-add"]');
    for (var i = 0; i < all.length; i++) {
      if (all[i].getAttribute('data-section') === sec) { inlineAdd(all[i], sec); return; }
    }
  }

  /* ---------- modal builders ---------- */

  /** แถวตัวเลือกหนึ่งบรรทัดในหน้าต่างสร้างฟิลด์ */
  function optionRow(name, color) {
    return '<div class="opt-row">' +
      '<button type="button" class="opt-dot" data-act="opt-color" style="background:' +
      R.esc(color) + '"></button>' +
      '<input class="opt-name" value="' + R.esc(name || '') +
      '" placeholder="' + L('ชื่อตัวเลือก') + '">' +
      '<button type="button" class="btn btn-sm btn-ghost" data-act="remove-option">' +
      I('close', 13) + '</button></div>';
  }

  /** @param forLib  true = สร้างในคลังฟิลด์ขององค์กร (ไม่มีชนิดรหัสงาน) */
  function addFieldModal(type, forLib) {
    var types = S.FIELD_TYPES.filter(function (x) { return !forLib || (x.id !== 'id' && x.id !== 'formula' && x.id !== 'ref'); });
    var ft = types.filter(function (x) { return x.id === type; })[0] || types[0];
    var h = '<h2>' + (forLib ? L('สร้างฟิลด์ในคลัง') : L('เพิ่มฟิลด์')) + '</h2>';

    h += '<div class="field"><label>' + L('ชื่อฟิลด์') + ' *</label>' +
      '<input id="nfName" placeholder="' + L('เช่น สถานะ, ผู้อนุมัติ, งบ') + '"></div>';

    h += '<div class="field"><label>' + L('ชนิด') + '</label><select id="nfType" data-act="nf-type">';
    types.forEach(function (x) {
      h += '<option value="' + x.id + '"' + (x.id === ft.id ? ' selected' : '') +
        '>' + L(x.label) + '</option>';
    });
    h += '</select></div>';

    h += '<div class="field"><label>' + L('คำอธิบาย') + '</label><input id="nfDesc" placeholder="' +
      L('บอกทีมว่าฟิลด์นี้ใช้กรอกอะไร (ไม่บังคับ)') + '"></div>';

    h += '<div class="field" id="nfOptWrap"' + (ft.hasOptions ? '' : ' style="display:none"') + '>' +
      '<label>' + L('ตัวเลือก') + ' *</label><div id="nfOpts">' +
      optionRow('', S.OPTION_COLORS[3]) + optionRow('', S.OPTION_COLORS[0]) + '</div>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-act="add-option">' +
      I('plus', 13) + ' ' + L('เพิ่มตัวเลือก') + '</button>' +
      '<label class="chk"><input type="checkbox" id="nfNotify"> ' + L('แจ้งผู้ติดตามงานเมื่อค่าในฟิลด์นี้เปลี่ยน') + '</label></div>';

    h += '<div class="field" id="nfIdWrap"' + (ft.id === 'id' ? '' : ' hidden') + '><label>' + L('คำนำหน้ารหัส') + '</label>' +
      '<input id="nfPrefix" maxlength="8" value="ID" placeholder="REQ"><div class="fld-hint">' +
      L('งานในโปรเจกต์ได้เลขรันเอง เช่น REQ-1, REQ-2 ค้นหาและพิมพ์ @REQ-2 ในความเห็นได้') + '</div></div>';

    h += formulaFieldsHtml(state.route.id, '', ft.id !== 'formula');      // 3c — สูตรและอ้างอิง
    h += '<div class="field" id="nfRefWrap"' + (ft.id === 'ref' ? '' : ' hidden') + '><label>' + L('อ้างอิงถึง') + '</label>' +
      S.REF_KINDS.map(function (k) { return '<label class="chk"><input type="checkbox" class="nf-refkind" value="' + k[0] + '" checked> ' + L(k[1]) + '</label>'; }).join('') +
      '</div>';    // Sprint 1A — เอาข้อความ "เป้าหมายจะเพิ่มได้เมื่อมีหน้าเป้าหมาย" ออก หน้าเป้าหมายมีแล้วและอ้างอิงเป้าหมายได้จริง
    h += '<div id="nfNumWrap"' + (ft.id === 'number' || ft.id === 'formula' ? '' : ' hidden') + '>' + numberFormatFields(null) + '</div>';

    if (!forLib) {
      h += '<label class="chk" id="nfLibWrap"' + (ft.id === 'id' ? ' hidden' : '') + '><input type="checkbox" id="nfLib"> ' +
        L('บันทึกลงคลังฟิลด์ขององค์กรด้วย (โปรเจกต์อื่นใช้ได้)') + '</label>';
    }

    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') +
      '</button><button class="btn btn-primary" data-act="create-field"' + (forLib ? ' data-lib="1"' : '') + '>' +
      L('สร้างฟิลด์') + '</button></div>';
    return h;
  }

  /* Sprint 3 — ช่องค้นหาในรายชื่อคน (ผู้รับผิดชอบ ผู้ติดตาม) เมื่อมีคนเกิน 6 คน หาชื่อไทย/อังกฤษได้โดยไม่ต้องไล่เลื่อน
   * กรองด้วยการซ่อนปุ่ม ไม่สร้างรายการใหม่ จึงไม่กระทบการทำงานของปุ่มเดิม ปุ่ม "ยังไม่มอบหมาย" (data-user="") อยู่เสมอ */
  function peopleFilterHtml() {
    return S.db.users.length > 6
      ? '<input class="pop-filter" type="search" autocomplete="off" placeholder="' + R.esc(L('ค้นหาชื่อ')) + '" aria-label="' + R.esc(L('ค้นหาชื่อ')) + '">'
      : '';
  }
  function focusPopFilter() {
    var f = document.querySelector('.pop .pop-filter');
    if (f) setTimeout(function () { f.focus(); }, 0);
  }
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !el.classList || !el.classList.contains('pop-filter')) return;
    var q = el.value.trim().toLowerCase(), pop = el.closest('.pop');
    if (!pop) return;
    Array.prototype.forEach.call(pop.querySelectorAll('button[data-user]'), function (b) {
      b.style.display = (!q || b.dataset.user === '' || b.textContent.toLowerCase().indexOf(q) >= 0) ? '' : 'none';
    });
  });

  function projectModal(existing) {
    var p = existing || { name: '', icon: '📁', color: S.PALETTE[0], description: '' };
    var h = '<h2>' + (existing ? L('แก้ไขโปรเจกต์') : L('สร้างโปรเจกต์ใหม่')) + '</h2>';
    /* 3b — โปรเจกต์เปล่า หรือเลือกจากแกลเลอรีเทมเพลต */
    if (!existing) {
      h += '<div class="au-tabs"><button class="' + (state.npTab !== 'tpl' ? 'on' : '') + '" data-act="np-tab" data-v="blank">' +
        L('โปรเจกต์เปล่า') + '</button><button class="' + (state.npTab === 'tpl' ? 'on' : '') + '" data-act="np-tab" data-v="tpl">' +
        L('จากเทมเพลต') + ' <span>' + S.projectTemplates().length + '</span></button></div>';
      if (state.npTab === 'tpl') return h + ptGalleryHtml();
    }
    h += '<div class="field"><label>' + L('ชื่อโปรเจกต์') + '</label><input id="pName" value="' +
      R.esc(p.name) + '" placeholder="' + L('เช่น เปิดตัวสินค้าใหม่') + ' 2026">' + '</div>';
    h += '<div class="field"><label>' + L('คำอธิบาย') + '</label><input id="pDesc" value="' +
      R.esc(p.description) + '"></div>';
    h += '<div class="field"><label>' + L('ไอคอน') + '</label><input id="pIcon" value="' +
      R.esc(p.icon) + '" maxlength="4" style="width:80px"></div>';
    if (!existing) {
      h += '<div class="field"><label>' + L('เซกชันเริ่มต้น (คั่นด้วยจุลภาค)') + '</label>' +
        '<input id="pSections" value="' + L('ค้างอยู่, กำลังทำ, รอตรวจ, เสร็จแล้ว') + '"></div>';
    }
    /* Sprint 3 — เลือกความเป็นส่วนตัวตั้งแต่สร้าง (เดิมสร้างแล้วเปิดให้ทั้งองค์กรทันที ต้องตามไปปิดทีหลัง
     * ซึ่งโปรเจกต์ที่ควรเป็นความลับเห็นกันได้ช่วงหนึ่ง) ค่าเริ่มต้นยังเป็นเปิดให้ทั้งองค์กรเหมือนเดิม */
    if (!existing) {
      h += '<div class="field"><label>' + L('ใครเห็นโปรเจกต์นี้') + '</label><select id="pVis">' +
        '<option value="org">' + L('เปิดให้ทั้งองค์กร') + '</option>' +
        '<option value="private">' + L('ปิด เห็นเฉพาะคนที่เชิญ') + '</option></select></div>';
      /* Sprint 3 — แชร์ให้ทีมตั้งแต่สร้าง (ไม่บังคับ) ทีมได้สิทธิ์แก้ไขงาน เปลี่ยนทีหลังได้ในหน้าต่างสิทธิ์ของโปรเจกต์ */
      var npTeams = S.teams();
      if (npTeams.length) {
        h += '<div class="field"><label>' + L('แชร์ให้ทีม (ไม่บังคับ)') + '</label><select id="pTeam"><option value="">' + L('ไม่แชร์ให้ทีม') + '</option>' +
          npTeams.map(function (t) { return '<option value="' + R.esc(t.id) + '">' + R.esc(t.name) + '</option>'; }).join('') + '</select></div>';
      }
    }
    h += '<div class="field"><label>' + L('สี') + '</label><div class="swatch-pick" id="pColors">';
    S.PALETTE.forEach(function (c) {
      h += '<button type="button" data-color="' + c + '" class="' + (c === p.color ? 'on' : '') +
        '" style="background:' + c + '"></button>';
    });
    h += '</div></div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="' + (existing ? 'save-project' : 'create-project') +
      '"' + (existing ? ' data-id="' + R.esc(existing.id) + '"' : '') + '>' +
      (existing ? L('บันทึก') : L('สร้าง')) + '</button></div>';
    return h;
  }

  /** ตั้งความเป็นส่วนตัวและสมาชิกของโปรเจกต์ */
  function projectAccessModal(projectId) {
    var p = S.project(projectId);
    if (!p) return '';
    var priv = p.visibility === 'private';
    var members = S.projectMembers(projectId);
    /* ด่านเดียวกับ NEEDS 'members' และชั้นข้อมูล — ผู้ดูแลระบบ หรือผู้ดูแลโปรเจกต์ (ที่ไม่ได้ล็อกรายชื่อ)
     * เดิมหน้าต่างคิดเองอีกแบบ (รวมบทบาทดูอย่างเดียวที่บังเอิญเป็นผู้ดูแลโปรเจกต์) ปุ่มจึงโผล่แต่กดไม่ได้ */
    var canManage = S.canAddMembers(projectId);
    var lockedByAdmin = p.locked && !S.isAdmin();

    var h = '<h2>' + L('ใครเข้าถึงโปรเจกต์นี้ได้') + '</h2>';
    h += '<div class="pa-name">' + R.esc(p.icon) + ' ' + R.esc(p.name) + '</div>';

    /* ---- ความเป็นส่วนตัว ---- */
    h += '<div class="pa-vis">';
    [['org', 'เปิดให้ทั้งองค์กร', 'พนักงานทุกคนเห็นและเข้าทำงานได้', 'users'],
     ['private', 'ปิด เห็นเฉพาะคนที่เชิญ', 'ไม่ขึ้นในเมนูของคนอื่น และเปิดจากลิงก์ตรงก็ไม่ได้', 'shield']
    ].forEach(function (o) {
      var on = (o[0] === 'private') === priv;
      h += '<button class="pa-opt' + (on ? ' on' : '') + '"' +
        (canManage ? ' data-act="set-visibility" data-id="' + R.esc(projectId) +
          '" data-v="' + o[0] + '"' : ' disabled') + '>' +
        I(o[3], 17) + '<span><b>' + L(o[1]) + '</b><em>' + L(o[2]) + '</em></span>' +
        (on ? I('check', 15) : '') + '</button>';
    });
    h += '</div>';

    if (priv) {
      /* ---- ล็อก ---- */
      h += '<label class="pa-lock' + (p.locked ? ' on' : '') + '">' +
        '<input type="checkbox" data-act="toggle-lock" data-id="' + R.esc(projectId) + '"' +
        (p.locked ? ' checked' : '') + (S.isAdmin() ? '' : ' disabled') + '>' +
        '<span><b>' + L('ล็อกรายชื่อสมาชิก') + '</b><em>' +
        L('สมาชิกเชิญคนเพิ่มเองไม่ได้ ต้องให้ผู้ดูแลระบบทำเท่านั้น') + '</em></span></label>';

      /* ---- รายชื่อสมาชิก ---- */
      h += '<div class="pa-head">' + L('สมาชิกของโปรเจกต์') +
        '<span>' + members.length + ' ' + L('คน') + '</span></div>';

      if (!members.length) {
        h += '<div class="pa-empty">' + L('ยังไม่มีสมาชิก ยังไม่มีใครเข้าโปรเจกต์นี้ได้') + '</div>';
      } else {
        h += '<div class="pa-list">';
        members.forEach(function (m) {
          var u = S.user(m.userId);
          if (!u) return;
          h += '<div class="pa-row">' + R.avatar(u) +
            '<div class="grow"><b>' + R.esc(u.name) + '</b>' +
            '<em>' + R.esc(u.email || '') + '</em></div>' +
            '<button class="acc-pill" ' +
              (canManage && !lockedByAdmin ? 'data-act="pick-access" data-id="' + R.esc(projectId) +
                '" data-user="' + R.esc(m.userId) + '"' : 'disabled') + '>' +
              L(accessLabel(m.access)) + ' ' + I('chevronDown', 12) + '</button>' +
            (canManage && !lockedByAdmin
              ? '<button class="icon-btn" data-act="drop-member" data-id="' + R.esc(projectId) +
                '" data-user="' + R.esc(m.userId) + '" title="' + L('ถอดออกจากโปรเจกต์') + '">' +
                I('close', 14) + '</button>'
              : '') +
            '</div>';
        });
        h += '</div>';
      }

      if (lockedByAdmin) {
        h += '<div class="pa-note">' + I('shield', 14) + '<span>' +
          L('โปรเจกต์นี้ถูกล็อก เฉพาะผู้ดูแลระบบเท่านั้นที่เพิ่มหรือถอดสมาชิกได้') + '</span></div>';
      } else if (canManage) {
        h += '<div class="field" style="margin-top:12px"><label>' + L('เพิ่มสมาชิกใหม่') + '</label>' +
          '<select id="paUser">';
        S.db.users.filter(function (u) {
          return u.active !== false &&
                 !members.some(function (m) { return m.userId === u.id; });
        }).forEach(function (u) {
          h += '<option value="' + R.esc(u.id) + '">' + R.esc(u.name) +
            (u.email ? ' — ' + R.esc(u.email) : '') + '</option>';
        });
        h += '</select></div>';
        h += '<div class="field"><label>' + L('ให้สิทธิ์ระดับ') + '</label><select id="paAccess">';
        S.PROJECT_ACCESS.forEach(function (a) {
          h += '<option value="' + a.id + '"' + (a.id === 'edit' ? ' selected' : '') + '>' +
            L(a.label) + ' — ' + L(a.desc) + '</option>';
        });
        h += '</select></div>';
        h += '<button class="btn btn-primary" style="width:100%" data-act="add-project-member" ' +
          'data-id="' + R.esc(projectId) + '">' + L('เพิ่มเข้าโปรเจกต์') + '</button>';
      } else {
        /* สมาชิกทั่วไปเห็นรายชื่อได้ แต่ต้องรู้ว่าถ้าจะเพิ่มคนต้องไปขอใคร */
        h += '<div class="pa-note">' + I('shield', 14) + '<span>' +
          L('เฉพาะผู้ดูแลโปรเจกต์หรือผู้ดูแลระบบเท่านั้นที่เพิ่มหรือถอดสมาชิกได้') + '</span></div>';
      }
    }

    h += '<div class="modal-note" style="margin-top:16px">' +
      L('สิทธิ์ในโปรเจกต์กำหนดว่าแต่ละคนเห็นและแก้อะไรได้ใน Orbit') +     // Sprint 1A — ภาษาคนใช้ ไม่พูดถึงฐานข้อมูล/เซิร์ฟเวอร์
      '</div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  function accessLabel(id) {
    var a = S.PROJECT_ACCESS.filter(function (x) { return x.id === id; })[0];
    return a ? a.label : id;
  }
  /* ---------- เมนูจัดการโปรเจกต์ ----------
   *
   * เป็นเมนูลอย ไม่ใช่หน้าต่างซ้อน เพราะเกินครึ่งของรายการเป็นทางผ่านไปหน้าอื่นอยู่แล้ว
   * ถ้าเปิดเป็นหน้าต่างจะต้องปิดสองชั้นทุกครั้งกว่าจะถึงของจริง
   */
  function projectMenu(projectId) {
    var p = S.project(projectId);
    var d = ' data-id="' + R.esc(projectId) + '"';
    var h = '';
    function item(act, icon, label, extra) {
      return '<button data-act="' + act + '"' + d + (extra || '') + '>' +
        I(icon, 14) + '<span class="grow">' + label + '</span></button>';
    }
    /* Sprint 1B — เมนูตามสิทธิ์ เดิมทุกคนเห็นครบ (ลบโปรเจกต์ นำเข้า CSV อัตโนมัติ คัดลอก…)
     * กดแล้วค่อยโดนปฏิเสธ คนที่แก้ไม่ได้เห็นแค่ของที่ใช้ได้จริง: ดูสิทธิ์ แจ้งเตือน ลิงก์ ส่งออก ฟอร์ม */
    var canStruct = S.can('structure') && S.canInProject(projectId, 'edit');
    var canCreate = S.canCreateTask(projectId);
    if (canStruct) h += item('project-settings', 'settings', L('ตั้งค่าโปรเจกต์'));
    h += item('project-access', 'shield', L('ใครเข้าถึงโปรเจกต์นี้ได้')) ;
    if (canStruct) {
      h += item('project-look', 'pencil', L('ตั้งสีและไอคอน'));
      h += item('add-to-portfolio', 'star', L('เพิ่มเข้าพอร์ตโฟลิโอ'));
      h += item('team-share', 'users', L('แชร์ให้ทีม…'));
    }
    h += '<div class="pop-sep"></div>';
    if (canStruct) h += item('update-status', 'flag', L('อัปเดตสถานะโปรเจกต์'));
    /* Sprint 2B — ติดตาม/เลิกติดตามจากเมนูด้วย (จอแคบซ่อนปุ่มบนหัวโปรเจกต์ไว้ ไม่ให้เบียดชื่อกับสถานะ) */
    h += item('follow-toggle', 'bell', S.projFollowing(projectId) ? L('เลิกติดตามโปรเจกต์') : L('ติดตามโปรเจกต์'),
      ' data-kind="project"');
    h += item('proj-notify-menu', 'bell', L('การแจ้งเตือนของโปรเจกต์นี้'));
    h += item('copy-project-link', 'link', L('คัดลอกลิงก์โปรเจกต์'));
    if (canStruct) {
      h += item('dup-project', 'copy', L('คัดลอกโปรเจกต์'));
      h += item('pt-save', 'star', L('บันทึกเป็นเทมเพลตโปรเจกต์…'));
    }
    if (S.can('write') && S.canInProject(projectId, 'edit')) h += item('slip-overdue', 'calendar', L('เลื่อนงานเลยกำหนดไปรอบถัดไป…'));   // Sprint 3
    h += '<div class="pop-sep"></div>';
    if (canStruct) {
      h += item('manage-fields', 'filter', L('จัดการฟิลด์'));
      h += item('auto-open', 'bolt', L('ระบบอัตโนมัติ'));
    }
    h += item('forms-open', 'note', L('ฟอร์ม'));          // ฟอร์มเปิดให้คนนอกส่งเรื่องเข้ามาได้โดยตั้งใจ
    if (canStruct) {
      h += item('types-open', 'diamond', L('ชนิดงานและสถานะ'));
      h += item('manage-templates', 'star', L('เทมเพลตงาน'));
      h += item('reset-cols', 'arrowLeft', L('คืนความกว้างคอลัมน์เดิม'));
    }
    h += '<div class="pop-sep"></div>';
    if (canStruct && canCreate) h += item('import-csv', 'archive', L('นำเข้างานจาก CSV'));
    h += item('export-csv', 'send', L('ส่งออกเป็น CSV'));
    h += item('time-csv', 'send', L('ส่งออกเวลาที่บันทึก (CSV)'));          // 3c
    h += item('export-json', 'send', L('ส่งออกเป็น JSON'));
    h += item('export-ics', 'calendar', L('ดาวน์โหลดปฏิทิน .ics'));
    h += item('print-list', 'note', L('พิมพ์รายการงาน'));
    if (canCreate) h += item('project-trash', 'trash', L('ถังขยะของโปรเจกต์นี้'));
    if (canStruct || S.can('manage')) h += '<div class="pop-sep"></div>';
    if (canStruct) {
      h += item('toggle-archive', p.archived ? 'arrowLeft' : 'archive',
        p.archived ? L('เอากลับจากคลัง') : L('เก็บโปรเจกต์เข้าคลัง'));
    }
    if (S.can('manage')) {                                // ลบโปรเจกต์ = ผู้ดูแลระบบ (ตาม NEEDS)
      h += '<button class="danger" data-act="delete-project"' + d + '>' +
        I('trash', 14) + '<span class="grow">' + L('ลบโปรเจกต์') + '</span></button>';
    }
    return h;
  }

  /* ---------- พอร์ตโฟลิโอ ---------- */

  function portfolioMenu(pfId) {
    var d = ' data-id="' + R.esc(pfId) + '"';
    function item(act, icon, label) {
      return '<button data-act="' + act + '"' + d + '>' + I(icon, 14) +
        '<span class="grow">' + label + '</span></button>';
    }
    var h = '';
    h += item('pf-rename', 'pencil', L('เปลี่ยนชื่อ'));
    h += item('pf-desc', 'text', L('แก้คำอธิบาย'));
    h += item('pf-look', 'star', L('ตั้งสีและไอคอน'));
    h += '<div class="pop-sep"></div>';
    h += '<button data-act="pf-add" data-pf="' + R.esc(pfId) + '">' + I('plus', 14) +
      '<span class="grow">' + L('เพิ่มโปรเจกต์เข้าพอร์ต') + '</span></button>';
    h += item('pf-status', 'flag', L('อัปเดตสถานะ'));
    /* Sprint 2B — ติดตามพอร์ตโฟลิโอ (จอแคบใช้ทางนี้แทนปุ่มบนหัว) */
    h += '<button data-act="follow-toggle" data-kind="portfolio"' + d + '>' + I('bell', 14) + '<span class="grow">' +
      (S.pfFollowing(pfId) ? L('เลิกติดตามพอร์ตโฟลิโอ') : L('ติดตามพอร์ตโฟลิโอ')) + '</span></button>';
    h += '<div class="pop-sep"></div>';
    h += '<button class="danger" data-act="pf-delete"' + d + '>' + I('trash', 14) +
      '<span class="grow">' + L('ลบพอร์ตโฟลิโอ') + '</span></button>';
    return h;
  }

  function portfolioStatusMenu(pfId) {
    var f = S.portfolio(pfId);
    var cur = f && f.status ? f.status.state : null;
    var h = '', sep = false;
    S.PROJECT_STATES.forEach(function (x) {
      if (x.done && !sep) { h += '<div class="pop-sep"></div>'; sep = true; }
      h += '<button class="st-opt' + (cur === x.id ? ' on' : '') +
        '" data-act="pf-pick-status" data-id="' + R.esc(pfId) + '" data-v="' + x.id + '">' +
        '<i style="background:' + x.color + '"></i>' +
        '<span class="grow" style="color:' + x.color + '">' + R.esc(L(x.label)) + '</span>' +
        (cur === x.id ? R.ICON.check : '') + '</button>';
    });
    if (cur) {
      h += '<div class="pop-sep"></div><button data-act="pf-clear-status" data-id="' +
        R.esc(pfId) + '">' + I('close', 14) + '<span class="grow">' + L('ล้างสถานะ') + '</span></button>';
    }
    return h;
  }

  function portfolioLookModal(pfId) {
    var f = S.portfolio(pfId);
    if (!f) return '';
    var h = '<h2>' + L('ตั้งสีและไอคอน') + '</h2>';
    h += '<div class="look-prev"><span class="look-ic" id="lookPrev" style="background:' +
      R.esc(f.color) + '22">' + R.esc(f.icon) + '</span><b>' + R.esc(f.name) + '</b></div>';
    h += '<label class="opt-lbl">' + L('สี') + '</label><div class="swatch-pick" id="pColors">';
    S.PALETTE.forEach(function (c) {
      h += '<button type="button" data-color="' + c + '" class="' + (c === f.color ? 'on' : '') +
        '" style="background:' + c + '"></button>';
    });
    h += '</div>';
    h += '<label class="opt-lbl">' + L('ไอคอน') + '</label><div class="icon-pick" id="pIcons">';
    PROJECT_ICONS.forEach(function (em) {
      h += '<button type="button" data-icon="' + R.esc(em) + '" class="' +
        (em === f.icon ? 'on' : '') + '">' + em + '</button>';
    });
    h += '</div>';
    h += '<div class="field" style="max-width:170px;margin-top:12px"><label>' +
      L('หรือพิมพ์อีโมจิเอง') + '</label><input id="pIcon" value="' + R.esc(f.icon) +
      '" maxlength="4"></div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="save-pf-look" data-id="' + R.esc(pfId) +
      '">' + L('บันทึก') + '</button></div>';
    return h;
  }

  /** เลือกโปรเจกต์ใส่พอร์ตโฟลิโอ — เห็นเฉพาะโปรเจกต์ที่ตัวเองเข้าถึงได้ */
  function portfolioAddModal(pfId) {
    var f = S.portfolio(pfId);
    if (!f) return '';
    var all = S.visibleProjects();
    var h = '<h2>' + L('เพิ่มโปรเจกต์เข้า') + ' ' + R.esc(f.icon) + ' ' + R.esc(f.name) + '</h2>';
    var free = all.filter(function (p) { return f.projectIds.indexOf(p.id) < 0; });
    if (!free.length) {
      h += '<p class="prj-note">' + L('โปรเจกต์ที่คุณเข้าถึงได้ถูกใส่ไว้ในพอร์ตโฟลิโอนี้หมดแล้ว') + '</p>';
    } else {
      h += '<p class="prj-note">' + L('เลือกโปรเจกต์ที่จะรวมไว้ในภาพรวมนี้ กดได้หลายอันติดกัน') + '</p>';
      h += '<div class="pf-pick">';
      free.forEach(function (p) {
        var s = S.projectStats(p.id);
        h += '<button class="pf-pick-row" data-act="pf-pick" data-pf="' + R.esc(pfId) +
          '" data-id="' + R.esc(p.id) + '">' +
          '<span class="hproj-ic" style="background:' + R.esc(p.color) + '22">' + R.esc(p.icon) + '</span>' +
          '<span class="grow"><b>' + R.esc(p.name) + '</b><em>' +
          L('{n} งาน · เสร็จ {p}%', { n: s.total, p: s.percent }) + '</em></span>' +
          I('plus', 15) + '</button>';
      });
      h += '</div>';
    }
    var inside = S.portfolioProjects(pfId);
    if (inside.length) {
      h += '<label class="opt-lbl">' + L('อยู่ในพอร์ตโฟลิโอแล้ว') + '</label><div class="pf-inside">';
      inside.forEach(function (p) {
        h += '<span class="chip">' + R.esc(p.icon) + ' ' + R.esc(p.name) +
          '<button data-act="pf-remove" data-pf="' + R.esc(pfId) + '" data-id="' + R.esc(p.id) +
          '" title="' + L('ถอดออก') + '">✕</button></span>';
      });
      h += '</div>';
    }
    /* 4a — พอร์ตโฟลิโอย่อย ซ้อนกันได้หลายชั้นแต่ห้ามวน (ตัวที่จะทำให้วนแสดงเป็นกดไม่ได้) */
    var others = S.portfolios().filter(function (x) { return x.id !== pfId && f.portfolioIds.indexOf(x.id) < 0; });
    h += '<label class="opt-lbl">' + L('พอร์ตโฟลิโอย่อย') + '</label>';
    if (!others.length) h += '<p class="prj-note">' + L('ไม่มีพอร์ตโฟลิโออื่นให้ใส่') + '</p>';
    else {
      h += '<div class="pf-pick pf-pick-sm">';
      others.forEach(function (x) {
        var ok = S.canNestPortfolio(pfId, x.id);
        h += '<button class="pf-pick-row' + (ok ? '' : ' off') + '" data-act="pf-nest" data-pf="' + R.esc(pfId) + '" data-id="' + R.esc(x.id) + '"' +
          (ok ? '' : ' title="' + R.esc(L('ใส่ไม่ได้ เพราะพอร์ตโฟลิโอนี้ครอบพอร์ตโฟลิโอปัจจุบันอยู่แล้ว (จะวนกัน)')) + '"') + '>' +
          '<span class="hproj-ic" style="background:' + R.esc(x.color) + '22">' + R.esc(x.icon) + '</span>' +
          '<span class="grow"><b>' + R.esc(x.name) + '</b><em>' + (ok ? L('{n} โปรเจกต์', { n: S.allProjectsUnder(x.id).length })
            : L('จะทำให้วนกัน')) + '</em></span>' + I(ok ? 'plus' : 'blocked', 15) + '</button>';
      });
      h += '</div>';
    }
    if (f.portfolioIds.length) {
      h += '<div class="pf-inside" style="margin-top:8px">';
      f.portfolioIds.map(S.portfolio).filter(Boolean).forEach(function (x) {
        h += '<span class="chip">' + R.esc(x.icon) + ' ' + R.esc(x.name) + '<button data-act="pf-unnest" data-pf="' + R.esc(pfId) +
          '" data-id="' + R.esc(x.id) + '" title="' + L('ถอดออก') + '">✕</button></span>';
      });
      h += '</div>';
    }
    h += '<div class="modal-acts"><button class="btn btn-primary" data-act="close-modal">' +
      L('เสร็จแล้ว') + '</button></div>';
    return h;
  }

  /** เปิดจากเมนูโปรเจกต์ — ติ๊กว่าโปรเจกต์นี้อยู่ในพอร์ตโฟลิโอไหนบ้าง */
  function addProjectToPortfolioModal(projectId) {
    var p = S.project(projectId);
    if (!p) return '';
    var all = S.portfolios();
    var h = '<h2>' + L('พอร์ตโฟลิโอของ') + ' ' + R.esc(p.icon) + ' ' + R.esc(p.name) + '</h2>';
    if (!all.length) {
      h += '<p class="prj-note">' + L('ยังไม่มีพอร์ตโฟลิโอเลย สร้างจากแถบซ้ายได้ที่หัวข้อ “พอร์ตโฟลิโอ”') + '</p>';
    } else {
      h += '<div class="pf-pick">';
      all.forEach(function (f) {
        var on = f.projectIds.indexOf(projectId) >= 0;
        h += '<button class="pf-pick-row' + (on ? ' on' : '') + '" data-act="pf-toggle-project" data-pf="' +
          R.esc(f.id) + '" data-id="' + R.esc(projectId) + '">' +
          '<span class="hproj-ic" style="background:' + R.esc(f.color) + '22">' + R.esc(f.icon) + '</span>' +
          '<span class="grow"><b>' + R.esc(f.name) + '</b><em>' +
          L('{n} โปรเจกต์', { n: S.portfolioProjects(f.id).length }) + '</em></span>' +
          (on ? R.ICON.check : I('plus', 15)) + '</button>';
      });
      h += '</div>';
    }
    h += '<div class="modal-acts"><button class="btn btn-primary" data-act="close-modal">' +
      L('เสร็จแล้ว') + '</button></div>';
    return h;
  }

  /* ---------- ตั้งค่าโปรเจกต์ ---------- */

  var PRJ_TABS = [
    ['details',   'รายละเอียดโปรเจกต์'],
    ['deps',      'ลำดับก่อนหลัง'],
    ['scheduling', 'ตารางวันทำงาน']
  ];

  /* Sprint 1C — หน้าต่างคัดลอกโปรเจกต์
   * เดิมถามแค่ "เอางานไปด้วยไหม" แล้วตั้งชื่อเป็น "(สำเนา)" ให้เอง ต้องไปเปลี่ยนชื่อและไล่เลื่อนวันทีละงานทีหลัง
   * คนจัดประชุมประจำต้องการยกเฉพาะเรื่องที่ยังค้างไปประชุมครั้งหน้า จึงมีตัวเลือก "เฉพาะงานที่ยังไม่เสร็จ"
   * เลื่อนวัน = เลือกวันเริ่มใหม่ ทุกวันในสำเนาเลื่อนเท่ากันจากวันแรกสุดของโปรเจกต์เดิม */
  function dupProjectModal(pid) {
    var p = S.project(pid);
    var first = S.projectFirstDate(pid, false);
    var h = '<h2>' + L('คัดลอกโปรเจกต์') + '</h2>';
    h += '<div class="field"><label>' + L('ชื่อโปรเจกต์ใหม่') + '</label><input id="dupName" maxlength="200" value="' +
      R.esc(L('{name} (สำเนา)', { name: p.name })) + '"></div>';
    h += '<div class="dup-opts">';
    h += '<label class="chk"><input type="checkbox" id="dupTasks" data-act="dup-sync" checked><span>' + L('คัดลอกงานไปด้วย') +
      '<em>' + L('รวมงานย่อยทุกชั้น ลำดับก่อนหลัง วันเริ่ม/กำหนดส่ง และค่าฟิลด์ (งานที่เสร็จแล้วกลับเป็นยังไม่เสร็จ)') + '</em></span></label>';
    h += '<div class="dup-sub" id="dupTaskSub"><label class="chk"><input type="checkbox" id="dupOpen"><span>' +
      L('เฉพาะงานที่ยังไม่เสร็จ') + '<em>' + L('ยกเรื่องที่ยังค้างไปประชุมหรือรอบถัดไป') + '</em></span></label></div>';
    h += '<label class="chk"><input type="checkbox" id="dupShift" data-act="dup-sync"><span>' + L('เลื่อนวันทั้งหมด') +
      '<em>' + (first ? R.esc(L('วันแรกสุดของโปรเจกต์นี้คือ {d} จะถูกเลื่อนไปเป็นวันเริ่มใหม่ วันอื่นเลื่อนตามเท่ากัน', { d: R.fmtDate(first) }))
                      : L('โปรเจกต์นี้ยังไม่มีวันที่ วันเริ่มใหม่จะเป็นวันเริ่มของโปรเจกต์สำเนา')) + '</em></span></label>';
    h += '<div class="dup-sub off" id="dupShiftSub"><span>' + L('วันเริ่มใหม่') + '</span><input type="date" id="dupStart" value="' +
      S.today() + '"></div>';
    h += '</div>';
    h += '<p class="prj-note">' + L('คอลัมน์ ฟิลด์ มุมมองที่บันทึกไว้ คอลัมน์ที่เปิดอยู่ อัตโนมัติ ฟอร์ม และชนิดงานไปด้วยเสมอ ความเห็นและประวัติไม่ไปด้วย') + '</p>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="dup-project-go" data-id="' + R.esc(pid) + '">' + L('คัดลอก') + '</button></div>';
    return h;
  }
  /** เปิด/ปิดตัวเลือกย่อยตามช่องติ๊กของหน้าต่างคัดลอกโปรเจกต์ */
  function dupSync() {
    var t = document.getElementById('dupTasks'), s = document.getElementById('dupShift');
    var ts = document.getElementById('dupTaskSub'), ss = document.getElementById('dupShiftSub');
    if (ts && t) ts.classList.toggle('off', !t.checked);
    if (ss && s) ss.classList.toggle('off', !s.checked);
  }

  /* Sprint 1C — ร่างของแท็บ "รายละเอียดโปรเจกต์"
   * เดิมพิมพ์คำอธิบาย/กำหนดส่งแล้วสลับไปแท็บตารางวันทำงาน ปุ่มบันทึกหายไป กลับมาค่าที่พิมพ์ก็หายเงียบ ๆ
   * ตอนนี้สลับแท็บ = เก็บร่างไว้ในหน่วยความจำ (ไม่ลงข้อมูลจนกดบันทึก) แท็บอื่นมีแถบเตือนพร้อมปุ่มบันทึก
   * และปิดหน้าต่างทั้งที่ยังมีร่างค้าง จะถามก่อนทิ้ง */
  var psDraft = null;
  var PS_KEYS = ['name', 'owner', 'start', 'due', 'view', 'desc'];
  function psFromProject(p) {
    return { pid: p.id, name: p.name || '', owner: p.owner || '', start: p.startOn || '', due: p.dueOn || '',
             view: p.defaultView || 'list', desc: p.description || '' };
  }
  function psValues(p) { return psDraft && psDraft.pid === p.id ? psDraft : psFromProject(p); }
  /** อ่านค่าจากช่องของแท็บรายละเอียด (ถ้าเปิดอยู่) เก็บเป็นร่าง */
  function psCapture() {
    var nm = document.getElementById('psName');
    if (!nm || !nm.dataset.pid || !$modal.contains(nm)) return;
    var v = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
    psDraft = { pid: nm.dataset.pid, name: nm.value, owner: v('psOwner'), start: v('psStart'), due: v('psDue'),
                view: v('psView'), desc: v('psDesc') };
  }
  function psDirty() {
    var p = psDraft && S.project(psDraft.pid);
    if (!p) return false;
    var o = psFromProject(p);
    return PS_KEYS.some(function (k) { return String(psDraft[k] || '').trim() !== String(o[k] || '').trim(); });
  }
  /** บันทึกร่าง คืน false ถ้าค่าไม่ผ่าน (ร่างยังอยู่) */
  function psSave(id) {
    psCapture();
    var p = S.project(id);
    if (!p) return false;
    var pd = psValues(p);
    if (pd.start && pd.due && pd.start > pd.due) { toast(L('วันเริ่มโปรเจกต์ต้องไม่หลังกำหนดส่ง')); return false; }
    S.updateProject(id, {
      name: String(pd.name).trim() || p.name,
      owner: pd.owner || null,
      startOn: pd.start || null,
      dueOn: pd.due || null,
      defaultView: pd.view || p.defaultView,
      description: String(pd.desc).trim()
    });
    psDraft = null;
    return true;
  }
  /** ปิดหน้าต่างตั้งค่าโปรเจกต์ทั้งที่มีร่างค้าง — ถามก่อน คืน true ถ้าถามแล้ว (ยังไม่ปิด) */
  function psGuardClose() {
    if (!$modal.querySelector('.prj-set')) return false;
    psCapture();
    if (!psDirty()) { psDraft = null; return false; }
    var gid = psDraft.pid;
    askChoice(L('ยังไม่ได้บันทึกรายละเอียดโปรเจกต์'), L('ค่าที่พิมพ์ไว้ในแท็บรายละเอียดโปรเจกต์ยังไม่ได้บันทึก'), [
      { label: L('บันทึก'), primary: true, run: function () {
        if (psSave(gid)) { renderAll(); toast(L('บันทึกการตั้งค่าแล้ว')); }
        else openModal(projectSettingsModal(gid, 'details'), true);
      } },
      { label: L('กลับไปแก้ต่อ'), run: function () { openModal(projectSettingsModal(gid, 'details'), true); } },
      { label: L('ทิ้งการแก้ไข'), run: function () { psDraft = null; } }
    ]);
    return true;
  }

  function projectSettingsModal(projectId, tab) {
    var p = S.project(projectId);
    if (!p) return '';
    tab = tab || 'details';
    var d = ' data-id="' + R.esc(projectId) + '"';
    var pv = psValues(p);           // Sprint 1C — ร่างที่ค้างจากการสลับแท็บ (ถ้ามี)

    var h = '<h2>' + L('ตั้งค่าโปรเจกต์') + '</h2>';
    h += '<div class="prj-set"><nav class="prj-tabs">';
    PRJ_TABS.forEach(function (t) {
      h += '<button class="' + (tab === t[0] ? 'on' : '') +
        '" data-act="project-settings"' + d + ' data-tab="' + t[0] + '">' + L(t[1]) + '</button>';
    });
    h += '</nav><div class="prj-pane">';
    /* Sprint 1C — มีร่างค้างจากแท็บรายละเอียด บอกไว้บนสุดของแท็บอื่น และบันทึกได้จากตรงนี้เลย */
    if (tab !== 'details' && psDraft && psDraft.pid === projectId && psDirty()) {
      h += '<div class="ps-draft">' + I('alert', 14) + '<span class="grow">' +
        L('มีรายละเอียดโปรเจกต์ที่แก้ไว้แต่ยังไม่ได้บันทึก') + '</span>' +
        '<button class="btn btn-sm" data-act="project-settings"' + d + ' data-tab="details">' + L('กลับไปดู') + '</button>' +
        '<button class="btn btn-sm btn-primary" data-act="save-project-details"' + d + '>' + L('บันทึก') + '</button></div>';
    }

    if (tab === 'details') {
      h += '<div class="prj-2col">';
      h += '<div class="field"><label>' + L('ชื่อโปรเจกต์') + '</label>' +
        '<input id="psName" data-pid="' + R.esc(projectId) + '" value="' + R.esc(pv.name) + '"></div>';
      h += '<div class="field"><label>' + L('เจ้าของโปรเจกต์') + '</label><select id="psOwner">' +
        '<option value="">' + L('ยังไม่ระบุ') + '</option>';
      S.db.users.forEach(function (u) {
        h += '<option value="' + R.esc(u.id) + '"' + (pv.owner === u.id ? ' selected' : '') +
          '>' + R.esc(u.name) + '</option>';
      });
      h += '</select></div>';
      /* Sprint 1C — วันเริ่มโปรเจกต์ (เดิมวันเริ่มที่เลือกตอนใช้เทมเพลตหายไปเลย ไม่มีที่ให้เห็น) */
      h += '<div class="field"><label>' + L('วันเริ่มโปรเจกต์') + '</label>' +
        '<input id="psStart" type="date" value="' + R.esc(pv.start) + '"></div>';
      h += '<div class="field"><label>' + L('กำหนดส่งของโปรเจกต์') + '</label>' +
        '<input id="psDue" type="date" value="' + R.esc(pv.due) + '"></div>';
      h += '<div class="field"><label>' + L('มุมมองที่เปิดเป็นค่าเริ่มต้น') + '</label><select id="psView">';
      S.PROJECT_VIEWS.filter(function (v) {
        return S.projectViews(projectId).indexOf(v.id) >= 0;
      }).forEach(function (v) {
        h += '<option value="' + v.id + '"' + (pv.view === v.id ? ' selected' : '') +
          '>' + R.esc(L(v.label)) + '</option>';
      });
      h += '</select></div>';
      h += '</div>';
      h += '<div class="field"><label>' + L('คำอธิบายโปรเจกต์') + '</label>' +
        '<textarea id="psDesc" rows="4" placeholder="' + L('โปรเจกต์นี้เกี่ยวกับอะไร') + '">' +
        R.esc(pv.desc) + '</textarea></div>';

      var st = S.projectStats(projectId);
      h += '<div class="prj-facts">' +
        '<span>' + L('งานทั้งหมด') + ' <b>' + st.total + '</b></span>' +
        '<span>' + L('เสร็จแล้ว') + ' <b>' + st.done + '</b></span>' +
        '<span>' + L('เลยกำหนด') + ' <b>' + st.overdue + '</b></span>' +
        '<span>' + L('สมาชิกโปรเจกต์') + ' <b>' + S.projectMembers(projectId).length + '</b></span>' +
        '</div>';
      h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
        '<button class="btn btn-primary" data-act="save-project-details"' + d + '>' + L('บันทึก') + '</button></div>';
    }

    if (tab === 'deps') {
      var cur = p.depShift || { mode: 'consume', scope: 'downstream' };
      h += '<h3 class="prj-h">' + L('การเลื่อนวันของงานที่พึ่งพากัน') + '</h3>';
      h += '<p class="prj-note">' +
        L('เลือกว่าเมื่อเลื่อนงานหนึ่ง งานที่ผูกลำดับไว้กับมันควรขยับตามอย่างไร') + '</p>';
      S.DEP_SHIFT.forEach(function (m) {
        h += '<label class="prj-radio' + (cur.mode === m.id ? ' on' : '') + '">' +
          '<input type="radio" name="depmode" value="' + m.id + '" data-act="set-depmode"' + d +
          (cur.mode === m.id ? ' checked' : '') + '>' +
          '<span><b>' + L(m.label) + '</b><em>' + L(m.desc) + '</em></span></label>';
        if (m.id === 'maintain' && cur.mode === 'maintain') {
          h += '<div class="prj-sub">' +
            '<label class="prj-radio' + (cur.scope === 'downstream' ? ' on' : '') + '">' +
            '<input type="radio" name="depscope" value="downstream" data-act="set-depscope"' + d +
            (cur.scope === 'downstream' ? ' checked' : '') + '>' +
            '<span>' + L('เฉพาะงานที่รออยู่ข้างหน้า') + '</span></label>' +
            '<label class="prj-radio' + (cur.scope === 'all' ? ' on' : '') + '">' +
            '<input type="radio" name="depscope" value="all" data-act="set-depscope"' + d +
            (cur.scope === 'all' ? ' checked' : '') + '>' +
            '<span>' + L('งานที่พึ่งพากันทั้งสองทาง') + '</span></label></div>';
        }
      });
      h += '<p class="prj-note">' +
        L('ทุกโหมดคงระยะเวลาของงานไว้เท่าเดิม คือเลื่อนทั้งช่วง ไม่ยืดไม่หด และไม่แตะงานที่ทำเสร็จแล้ว') +
        '</p>';
      h += '<div class="modal-acts"><button class="btn btn-primary" data-act="close-modal">' + L('ปิด') + '</button></div>';
    }

    if (tab === 'scheduling') {
      h += '<h3 class="prj-h">' + L('ตารางวันทำงาน') + '</h3>';
      h += '<p class="prj-note">' +
        L('กำหนดวันทำงานของโปรเจกต์ เวลาระบบเลื่อนวันให้อัตโนมัติจะได้ไม่ไปตกวันหยุด') + '</p>';
      h += '<div class="field" style="max-width:260px"><label>' + L('วันทำงาน') + '</label>' +
        '<select data-act="set-workdays"' + d + '>';
      S.WORK_DAYS.forEach(function (w) {
        h += '<option value="' + w.id + '"' + (p.workDays === w.id ? ' selected' : '') +
          '>' + L(w.label) + '</option>';
      });
      h += '</select></div>';
      if (p.workDays !== 'all') {
        var off = S.tasksInProject(projectId).filter(function (x) {
          return x.task.dueOn && !S.isWorkday(x.task.dueOn, p.workDays);
        }).length;
        h += '<div class="prj-warn">' + I('alert', 15) + '<span>' +
          (off ? L('ตอนนี้มี {n} งานที่ครบกำหนดตรงวันหยุด ระบบไม่ย้ายให้เอง เพราะวันที่คนตั้งไว้เองต้องเคารพไว้ก่อน', { n: off })
               : L('ไม่มีงานไหนครบกำหนดตรงวันหยุด')) + '</span></div>';
      }
      h += '<div class="modal-acts"><button class="btn btn-primary" data-act="close-modal">' + L('ปิด') + '</button></div>';
    }

    h += '</div></div>';
    return h;
  }

  /* ---------- สีและไอคอนของโปรเจกต์ ---------- */

  var PROJECT_ICONS = (
    '📁 🚀 📅 ⚙️ 🎯 💡 🧪 🧴 🧼 🏭 📦 🛒 💰 📈 📊 📝 🗂 🔍 🎨 📷 ' +
    '🎬 📣 🤝 🏆 ⭐ ❤️ 🔧 🧭 🌏 🏢 🧾 ✅ ⏰ 🔔 🧩 🛠 🥇 🍃 💎 🔥'
  ).split(' ');

  function projectLookModal(projectId) {
    var p = S.project(projectId);
    if (!p) return '';
    var h = '<h2>' + L('ตั้งสีและไอคอน') + '</h2>';
    h += '<div class="look-prev"><span class="look-ic" id="lookPrev" style="background:' +
      R.esc(p.color) + '22">' + R.esc(p.icon) + '</span><b>' + R.esc(p.name) + '</b></div>';

    h += '<label class="opt-lbl">' + L('สี') + '</label><div class="swatch-pick" id="pColors">';
    S.PALETTE.forEach(function (c) {
      h += '<button type="button" data-color="' + c + '" class="' + (c === p.color ? 'on' : '') +
        '" style="background:' + c + '"></button>';
    });
    h += '</div>';

    h += '<label class="opt-lbl">' + L('ไอคอน') + '</label><div class="icon-pick" id="pIcons">';
    PROJECT_ICONS.forEach(function (em) {
      h += '<button type="button" data-icon="' + R.esc(em) + '" class="' +
        (em === p.icon ? 'on' : '') + '">' + em + '</button>';
    });
    h += '</div>';
    h += '<div class="field" style="max-width:170px;margin-top:12px"><label>' +
      L('หรือพิมพ์อีโมจิเอง') + '</label><input id="pIcon" value="' + R.esc(p.icon) +
      '" maxlength="4"></div>';

    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="save-project-look" data-id="' + R.esc(projectId) +
      '">' + L('บันทึก') + '</button></div>';
    return h;
  }

  function taskMenuModal(taskId) {
    var t = S.task(taskId);
    var q = R.esc(taskId);
    function item(act, icon, label) {
      return '<button class="btn" data-act="' + act + '" data-id="' + q + '">' + I(icon, 14) + ' ' + label + '</button>';
    }
    /* เมนูเดียวกับแผงงาน ใช้ด่านเดียวกัน (แก้งานนี้ได้ไหม) — คนที่แสดงความเห็นได้/ดูอย่างเดียวเห็นเฉพาะสิ่งที่ทำได้จริง
     * (สร้างงานติดตามผลของตัวเอง คัดลอก คัดลอกลิงก์ รันอัตโนมัติ) เดิมเห็น "ลบงาน" และกดลบได้จริงด้วย */
    var canW = S.can('write', taskId);
    var h = '<h2>' + R.esc(t.name) + '</h2>';
    h += '<div class="task-menu">' +
      item('followup', 'plus', L('สร้างงานติดตามผล') + ' <kbd>Shift+Tab+F</kbd>') +
      item('dup-task', 'copy', L('คัดลอกงาน…')) +
      (canW ? item('merge-task', 'checkCircle', L('รวมเป็นงานซ้ำของ…')) : '') +
      (!canW ? '' : t.parentId
        ? item('promote-task', 'arrowUp', L('ย้ายออกเป็นงานหลัก'))
        : item('make-subtask', 'subtask', L('แปลงเป็นงานย่อยของ…'))) +
      /* Sprint 2A — ย้ายคอลัมน์ในโปรเจกต์/เซกชันในงานของฉันได้โดยไม่ต้องลาก (จอสัมผัส) — mobile.js */
      (global.OrbitMobile && global.OrbitMobile.canMoveSec(taskId) ? item('m2a-move-sec', 'grid', L('ย้ายไปเซกชัน…')) : '') +
      (t.recur && canW ? item('stop-recur', 'repeat', L('หยุดทำซ้ำ')) : '') +
      (canW ? item('save-template', 'star', L('บันทึกเป็นเทมเพลต')) : '') +
      (!t.parentId && canW ? item('to-project', 'grid', L('แปลงเป็นโปรเจกต์…')) : '') +
      item('copy-link', 'link', L('คัดลอกลิงก์ของงานนี้')) +
      (S.manualAutomationsFor(taskId).length ? item('auto-run-pick', 'bolt', L('รันอัตโนมัติ…')) : '') +
      (canW ? '<button class="btn btn-danger" data-act="delete-task" data-id="' + q + '">' + I('trash', 14) + ' ' + L('ลบงาน') + '</button>' : '') +
      '</div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  /* ---- คัดลอกงานแบบเลือกได้ว่าจะเอาอะไรไปบ้าง ----
   * ค่าเริ่มต้นติ๊กไว้ทุกช่อง ยกเว้นลำดับก่อนหลัง เพราะสำเนาที่รองานเดิมอยู่มักไม่ใช่สิ่งที่ตั้งใจ */
  var DUP_LABELS = {
    assignee: 'ผู้รับผิดชอบ', notes: 'รายละเอียด', subtasks: 'งานย่อย', attachments: 'ไฟล์แนบ',
    tags: 'แท็ก', followers: 'ผู้ติดตาม', projects: 'โปรเจกต์', deps: 'ลำดับก่อนหลัง',
    dates: 'วันเริ่ม กำหนดส่ง และการทำซ้ำ', fields: 'ค่าในฟิลด์'
  };
  function dupModal(taskId) {
    var t = S.task(taskId);
    var h = '<h2>' + L('คัดลอกงาน') + '</h2>';
    h += '<div class="field"><label>' + L('ชื่องาน') + '</label><input id="dupName" value="' +
      R.esc(t.name + ' ' + L('(สำเนา)')) + '"></div>';
    h += '<label class="opt-lbl">' + L('เอาอะไรไปด้วย') + '</label><div class="dup-grid">';
    S.DUP_KEYS.forEach(function (k) {
      var on = k !== 'deps';
      h += '<label class="chk"><input type="checkbox" class="dup-opt" data-k="' + k + '"' +
        (on ? ' checked' : '') + '> ' + R.esc(L(DUP_LABELS[k])) + '</label>';
    });
    h += '</div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-dup" data-id="' + R.esc(taskId) + '">' +
      L('สร้างสำเนา') + '</button></div>';
    return h;
  }

  /* ---- งานติดตามผล ---- */
  function followUpModal(taskId) {
    var t = S.task(taskId);
    return '<h2>' + L('สร้างงานติดตามผล') + '</h2>' +
      '<p class="prj-note">' + L('มอบหมายให้คุณ อยู่โปรเจกต์และเซกชันเดียวกับงานเดิม และลิงก์กลับไปที่งานเดิมในรายละเอียด') + '</p>' +
      '<div class="field"><label>' + L('ชื่องาน') + '</label><input id="fuName" value="' +
      R.esc(L('ติดตาม:') + ' ' + t.name) + '"></div>' +
      '<div class="field"><label>' + L('กำหนดส่ง') + '</label><input id="fuDue" type="date" value="' +
      R.esc(S.addDays(S.today(), 7)) + '"></div>' +
      '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-followup" data-id="' + R.esc(taskId) + '">' +
      L('สร้างงาน') + '</button></div>';
  }

  /* ---------- 2a: ตัวช่วยของงานของฉัน กล่องแจ้งเตือน และปฏิทิน ---------- */

  /** ตัวเลือกปัจจุบันของกล่องแจ้งเตือน ส่งให้ S.inboxList */
  function inboxOpts() {
    var f = state.inbox.f || {};
    return { tab: state.inbox.tab, from: f.from, project: f.project, mention: f.mention,
             toMe: f.toMe, byMe: f.byMe, unread: f.unread, snoozed: !!state.inbox.snoozed,   // Sprint 2B
             sort: S.personalOf().inbox.sort === 'relevance' ? 'relevance' : 'new' };
  }

  /** ชื่อของเซกชัน "เพิ่งได้รับมอบหมาย" ตามที่เจ้าตัวตั้งไว้ */
  function recentLabel() {
    var s = S.mtSection(S.MT_RECENT);
    return s && s.name ? L(s.name) : L('เพิ่งได้รับมอบหมาย');
  }

  function popCheck(on) { return '<span class="pop-check">' + (on ? I('check', 13) : '') + '</span>'; }

  /** แผงตัวกรองกล่องแจ้งเตือน — ติ๊กได้หลายอย่างโดยแผงไม่ปิด */
  function inboxFilterPop() {
    var f = state.inbox.f || {};
    var h = '<div class="pop-note strong">' + R.esc(L('แสดงเฉพาะ')) + '</div>';
    R.INBOX_FLAGS.forEach(function (x) {
      h += '<button data-act="inbox-f" data-k="' + x[0] + '"' + (f[x[0]] ? ' class="on"' : '') + '>' +
        popCheck(f[x[0]]) + '<span class="grow">' + R.esc(L(x[1])) + '</span></button>';
    });
    var people = S.inboxPeople();
    if (people.length) {
      h += '<div class="pop-sep"></div><div class="pop-note strong">' + R.esc(L('จากใคร')) + '</div>';
      people.forEach(function (u) {
        h += '<button data-act="inbox-f" data-k="from" data-v="' + R.esc(u.id) + '"' +
          (f.from === u.id ? ' class="on"' : '') + '>' + popCheck(f.from === u.id) + R.avatar(u, 'sm') +
          '<span class="grow">' + R.esc(u.name) + '</span></button>';
      });
    }
    var projs = S.visibleProjects();
    if (projs.length) {
      h += '<div class="pop-sep"></div><div class="pop-note strong">' + R.esc(L('โปรเจกต์')) + '</div>';
      projs.forEach(function (p) {
        h += '<button data-act="inbox-f" data-k="project" data-v="' + R.esc(p.id) + '"' +
          (f.project === p.id ? ' class="on"' : '') + '>' + popCheck(f.project === p.id) +
          '<span class="swatch" style="background:' + R.esc(p.color) + '"></span>' +
          '<span class="grow">' + R.esc(p.name) + '</span></button>';
      });
    }
    return h;
  }

  /** แผงตัวกรอง / เรียง / จัดกลุ่มของงานของฉัน */
  function mtPop(kind) {
    var v = S.personalOf().mt.view;
    var h = '';
    function opt(k, val, label, extra) {
      var on = String(v[k]) === String(val);
      return '<button data-act="mt-set" data-k="' + k + '" data-v="' + R.esc(val) + '"' + (on ? ' class="on"' : '') + '>' +
        popCheck(on) + (extra || '') + '<span class="grow">' + R.esc(label) + '</span></button>';
    }
    if (kind === 'filter') {
      h += '<div class="pop-note strong">' + R.esc(L('สถานะงาน')) + '</div>';
      h += opt('show', 'open', L('งานที่ยังไม่เสร็จ')) + opt('show', 'done', L('งานที่เสร็จแล้ว')) +
        opt('show', 'all', L('งานทั้งหมด'));
      /* Sprint 2B — งานขออนุมัติที่รอฉันตัดสิน (กดซ้ำเพื่อเอาออก) */
      var nApv = S.approvalsWaiting().length;
      h += '<div class="pop-sep"></div><div class="pop-note strong">' + R.esc(L('การอนุมัติ')) + '</div>';
      h += opt('appr', '1', L('รออนุมัติจากฉัน') + (nApv ? ' (' + nApv + ')' : ''));
      h += '<div class="pop-sep"></div><div class="pop-note strong">' + R.esc(L('กำหนดส่ง')) + '</div>';
      S.DUE_FILTERS.forEach(function (d) { h += opt('due', d.id, L(d.label)); });
      h += '<div class="pop-sep"></div><div class="pop-note strong">' + R.esc(L('โปรเจกต์')) + '</div>';
      h += opt('project', '', L('ทุกโปรเจกต์')) + opt('project', '__private', L('งานส่วนตัว (ไม่อยู่ในโปรเจกต์)'), I('lock', 13));
      S.visibleProjects().forEach(function (p) {
        h += opt('project', p.id, p.name, '<span class="swatch" style="background:' + R.esc(p.color) + '"></span>');
      });
    } else if (kind === 'sort') {
      S.SORTS.forEach(function (s) {
        if (S.MT_SORTS.indexOf(s.id) < 0) return;
        var on = v.sort === s.id;
        h += '<button data-act="mt-set" data-k="sort" data-v="' + s.id + '"' + (on ? ' class="on"' : '') + '>' +
          popCheck(on) + '<span class="grow">' + R.esc(L(s.label)) + '</span>' +
          (on && s.id !== 'manual' ? I(v.dir === 'desc' ? 'arrowDown' : 'arrowUp', 13) : '') + '</button>';
      });
      h += '<div class="pop-note">' + R.esc(L('กดซ้ำเพื่อสลับมากไปน้อย · เรียงอยู่จะลากจัดลำดับในเซกชันไม่ได้')) + '</div>';
    } else {
      S.MT_GROUPS.forEach(function (g) { h += opt('group', g.id, L(g.label)); });
      h += '<div class="pop-note">' + R.esc(L('จัดกลุ่มตามวันครบกำหนด = มุมมองงานของฉันแบบเดิม')) + '</div>';
    }
    return h;
  }

  /** ช่องพิมพ์ชื่องานใต้เซกชันของงานของฉัน — Enter แล้วพิมพ์ต่อได้เลย */
  function mtInlineAdd(btn, secId) {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'inp inline-add-input';
    input.dataset.mtsec = secId;
    input.placeholder = L('ชื่องาน แล้วกด Enter (วางหลายบรรทัด = หลายงาน)');
    input.style.cssText = 'border:1px solid var(--accent);background:var(--bg);margin:4px 0';
    btn.style.display = 'none';
    btn.parentNode.insertBefore(input, btn);
    input.focus();
    function done() {
      var v = input.value.trim();
      input.value = '';
      input.remove();
      btn.style.display = '';
      if (v) S.mtCreateTasks([v], secId);
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var v = input.value.trim();
        input.value = '';
        if (v) { state.reopenMtAdd = secId; S.mtCreateTasks([v], secId); }
      } else if (e.key === 'Escape') {
        input.value = '';
        input.blur();
      }
    });
    input.addEventListener('blur', done);
  }

  /* ปฏิทินที่วาดด้วย R.calBoard บอกขอบเขตไว้ใน data-scope
   * 'mt' = งานของฉัน (มุมมองจำไว้ใน db.personal วันที่อยู่ในหน้าจอ)
   * ขอบเขตอื่น (เช่น 'p:<projectId>' ของชิ้นงาน 2b) เก็บใน state.calx */
  function calxScope(el) {
    var box = el.closest ? el.closest('.calx') : null;
    return box ? box.dataset.scope : '';
  }
  function calxGet(scope) {
    if (scope === 'mt') {
      return { mode: S.personalOf().mt.view.cal === 'month' ? 'month' : 'week',
               anchor: state.mt.calAnchor || S.today() };
    }
    state.calx = state.calx || {};
    var c = state.calx[scope] || (state.calx[scope] = { mode: 'month', anchor: S.today() });
    /* โหมดสัปดาห์/เดือนจำไว้ — ปฏิทินโปรเจกต์อยู่ในมุมมอง ปฏิทินรวมอยู่ในของส่วนตัว */
    if (scope === 'all') c.mode = S.calPrefs().mode;
    else if (scope.indexOf('p:') === 0 && state.route.type === 'project') c.mode = viewFor(scope.slice(2)).cMode;
    return c;
  }
  function calxSet(scope, patch) {
    if (scope === 'mt') {
      if (patch.anchor) state.mt.calAnchor = patch.anchor;
      if (patch.mode && patch.mode !== S.personalOf().mt.view.cal) { S.mtSetView({ cal: patch.mode }); return; }
      renderViewBody();
      return;
    }
    var c = calxGet(scope);
    if (patch.anchor) c.anchor = patch.anchor;
    if (patch.mode && patch.mode !== c.mode) {
      if (scope === 'all') { c.mode = patch.mode; S.setCalPrefs({ mode: patch.mode }); return; }
      if (scope.indexOf('p:') === 0) viewFor(scope.slice(2)).cMode = patch.mode;
      c.mode = patch.mode;
      refreshView();
      return;
    }
    renderViewBody();
  }

  /** วันที่ใต้ตำแหน่งเมาส์ในแถวสัปดาห์ของปฏิทิน (คิดเฉพาะวันที่แสดงอยู่ — ซ่อนเสาร์-อาทิตย์ได้) */
  function calxDays(row) {
    if (row.dataset.days) return row.dataset.days.split(',');
    var out = [];
    for (var i = 0; i < 7; i++) out.push(S.addDays(row.dataset.start, i));
    return out;
  }
  function calxDateAt(row, x) {
    var days = calxDays(row);
    var r = row.getBoundingClientRect();
    var col = Math.floor((x - r.left) / (r.width / days.length));
    col = Math.max(0, Math.min(days.length - 1, col));
    return days[col];
  }

  /* ---------- 2b — ตัวช่วยของมุมมองโปรเจกต์ ---------- */

  /** เลือกทุกแถว/การ์ดระหว่างสองงานตามลำดับที่เห็นบนจอ (Shift+คลิก) */
  function selectRange(fromId, toId) {
    var ids = [];
    Array.prototype.forEach.call($view.querySelectorAll('.tr[data-id], .card[data-id], .row[data-id]'), function (n) {
      if (ids.indexOf(n.dataset.id) < 0) ids.push(n.dataset.id);
    });
    var a = ids.indexOf(fromId), b = ids.indexOf(toId);
    if (a < 0 || b < 0) { state.sel[toId] = true; updateSelectionUI(toId); return; }
    if (a > b) { var tmp = a; a = b; b = tmp; }
    for (var i = a; i <= b; i++) {
      state.sel[ids[i]] = true;
      updateSelectionUI(ids[i]);
    }
  }

  /** แถวที่ถูกชี้ในรายการ — แต่งคลาสตรง ๆ ไม่วาดใหม่ทั้งหน้า */
  function setCursor(id) {
    state.cursor = id;
    Array.prototype.forEach.call($view.querySelectorAll('.tr.cursor, .row.cursor, .card.cursor'), function (n) { n.classList.remove('cursor'); });
    /* 2c — แถวในงานของฉัน ค้นหา แท็ก และการ์ดบอร์ดก็ถูกชี้ได้ (ลูกศรขึ้นลง Tab+คีย์) */
    var row = $view.querySelector('.tr[data-id="' + id + '"], .row[data-id="' + id + '"], .card[data-id="' + id + '"]');
    if (row) row.classList.add('cursor');
  }

  /** Tab+O — จอกว้างซ่อนแถบซ้ายถาวร (จำไว้ในเบราว์เซอร์นี้) จอแคบเปิดปิดแบบเลื่อนทับ */
  function toggleSidebarCollapse(force) {
    if (global.innerWidth <= 860) { setSidebar(!document.getElementById('sidebar').classList.contains('open')); return; }
    var on = typeof force === 'boolean' ? force : !document.body.classList.contains('sb-collapsed');
    document.body.classList.toggle('sb-collapsed', on);
    try { global.localStorage.setItem('orbit.sbCollapsed', on ? '1' : ''); } catch (e) { /* ไม่มีที่เก็บก็ไม่จำ */ }
  }
  try { if (global.localStorage.getItem('orbit.sbCollapsed') === '1') document.body.classList.add('sb-collapsed'); } catch (e) { /* ไม่เป็นไร */ }

  /** เมนูปุ่ม + ท้ายหัวตาราง — เปิดปิดคอลัมน์ และเพิ่มฟิลด์ใหม่ */
  function colMenu() {
    var pid = state.route.id;
    var v = viewFor(pid);
    var h = '<div class="col-pop"><div class="pop-note">' + L('คอลัมน์ที่แสดง') + '</div>';
    S.listColumns(pid, v).forEach(function (c) {
      h += '<button data-act="lcol-toggle" data-col="' + esc(c.id) + '">' + popCheck(c.on) +
        esc(c.field ? c.label : L(c.label)) + '</button>';
    });
    h += '<button data-act="col-order">' + I('arrowDown', 14) + ' ' + L('จัดลำดับคอลัมน์…') + '</button>';
    if (S.can('structure') && S.canInProject(pid, 'edit')) {
      h += '<div class="pop-sep"></div><div class="pop-note">' + L('เพิ่มฟิลด์ใหม่') + '</div>';
      S.FIELD_TYPES.forEach(function (x) {
        h += '<button data-act="pick-ftype" data-v="' + x.id + '">' + I(x.icon, 14) + ' ' + L(x.label) + '</button>';
      });
    }
    return h + '</div>';
  }

  /** เมนูของแท็บที่เปิดอยู่ (ลูกศรเล็กบนแท็บ) */
  function tabMenu(pid, svId, viewId) {
    var canSt = S.can('structure') && S.canInProject(pid, 'edit');
    var p = S.project(pid);
    var h = '';
    if (svId) {
      var sv = S.savedView(pid, svId);
      if (!sv) return '';
      var i = p.savedViews.indexOf(sv);
      var dirty = dirtySv() === svId;
      if (dirty && canSt) {
        h += '<button data-act="sv-update" data-id="' + esc(svId) + '">' + I('check', 14) + ' ' + L('บันทึกการเปลี่ยนแปลง') + '</button>';
      }
      if (dirty) {
        h += '<button data-act="sv-discard" data-id="' + esc(svId) + '">' + I('repeat', 14) + ' ' + L('ทิ้งการเปลี่ยนแปลง') + '</button>';
      }
      if (canSt) {
        if (h) h += '<div class="pop-sep"></div>';
        h += '<button data-act="sv-rename" data-id="' + esc(svId) + '">' + I('pencil', 14) + ' ' + L('เปลี่ยนชื่อ') + '</button>' +
          (i > 0 ? '<button data-act="sv-move" data-id="' + esc(svId) + '" data-d="-1">' + I('arrowLeft', 14) + ' ' + L('ย้ายไปทางซ้าย') + '</button>' : '') +
          (i < p.savedViews.length - 1 ? '<button data-act="sv-move" data-id="' + esc(svId) + '" data-d="1">' + I('arrowRight', 14) + ' ' + L('ย้ายไปทางขวา') + '</button>' : '') +
          (p.defaultTab !== svId ? '<button data-act="tab-default" data-tab="' + esc(svId) + '">' + I('home', 14) + ' ' + L('ตั้งเป็นมุมมองเริ่มต้น') + '</button>' : '') +
          '<button data-act="sv-delete" data-id="' + esc(svId) + '">' + I('trash', 14) + ' ' + L('ลบแท็บ') + '</button>';
      }
      if (!h) h = '<div class="pop-note">' + L('เฉพาะคนที่แก้โครงสร้างโปรเจกต์ได้จึงแก้แท็บนี้ได้') + '</div>';
      return h;
    }
    var isDef = !(p.defaultTab && S.savedView(pid, p.defaultTab)) && (p.defaultView || S.projectViews(pid)[0]) === viewId;
    return isDef ? '<div class="pop-note">' + L('นี่คือมุมมองเริ่มต้นของโปรเจกต์') + '</div>'
      : '<button data-act="tab-default" data-tab="' + esc(viewId) + '">' + I('home', 14) + ' ' + L('ตั้งเป็นมุมมองเริ่มต้น') + '</button>';
  }

  var SEC_DUP_LABELS = {
    assignee: 'ผู้รับผิดชอบ', dates: 'วันเริ่มและกำหนดส่ง', notes: 'รายละเอียด', subtasks: 'งานย่อย',
    tags: 'แท็ก', followers: 'ผู้ติดตาม', attachments: 'ไฟล์แนบ', fields: 'ค่าฟิลด์ที่สร้างเอง'
  };

  /** หน้าต่างทำสำเนาคอลัมน์ — ลงโปรเจกต์เดิมหรือโปรเจกต์อื่น เลือกได้ว่าจะเอาอะไรไปด้วย */
  function dupSectionModal(pid, secId) {
    var sec = S.section(pid, secId);
    if (!sec) return '';
    var n = S.tasksInSection(pid, secId).length;
    var h = '<h2>' + L('ทำสำเนาเซกชัน') + '</h2>';
    h += '<p class="opt-note" style="margin:0 0 10px">' + esc(L('“{s}” มีงาน {n} งาน', { s: sec.name, n: n })) + '</p>';
    h += '<div class="field"><label>' + L('ชื่อเซกชันใหม่') + '</label><input id="dsecName" value="' +
      esc(sec.name + ' ' + L('(สำเนา)')) + '"></div>';
    h += '<div class="field"><label>' + L('วางไว้ในโปรเจกต์') + '</label><select id="dsecProject">';
    S.visibleProjects().filter(function (p) {
      return !p.archived && S.canInProject(p.id, 'edit');
    }).forEach(function (p) {
      h += '<option value="' + esc(p.id) + '"' + (p.id === pid ? ' selected' : '') + '>' +
        esc(p.name) + (p.id === pid ? ' ' + L('(โปรเจกต์นี้)') : '') + '</option>';
    });
    h += '</select></div>';
    h += '<label class="opt-lbl">' + L('เอาอะไรไปด้วย') + '</label><div class="dup-grid">';
    S.SEC_DUP_KEYS.forEach(function (k) {
      var on = k !== 'attachments' && k !== 'followers';
      h += '<label class="chk"><input type="checkbox" class="dsec-opt" data-k="' + k + '"' +
        (on ? ' checked' : '') + '> ' + esc(L(SEC_DUP_LABELS[k])) + '</label>';
    });
    h += '</div><p class="opt-note">' + L('ค่าฟิลด์ที่สร้างเองคัดลอกได้เฉพาะในโปรเจกต์เดียวกัน เพราะฟิลด์เป็นของแต่ละโปรเจกต์') + '</p>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-dup-section" data-section="' + esc(secId) + '">' +
      L('ทำสำเนา') + '</button></div>';
    return h;
  }

  /** เลื่อนวันของงานที่รออยู่ต่อจากงานนี้ ตามโหมดของโปรเจกต์แรกที่งานอยู่ (ใช้หลังลากในปฏิทิน)
   *  คืนจำนวนงานที่ถูกขยับตาม */
  function shiftDependents(taskId, delta) {
    if (!delta) return 0;
    var t = S.task(taskId);
    if (!t) return 0;
    var hp = S.projectsOfTask(S.rootOf(t).id)[0];
    var pd = hp ? hp.project : null;
    var ds = (pd && pd.depShift) || { mode: 'consume', scope: 'downstream' };
    return S.autoSchedule(taskId, delta, { mode: ds.mode, scope: ds.scope, workDays: pd ? pd.workDays : 'all' }).length;
  }

  /** Ctrl+↑/↓ เลื่อนแถวที่ชี้อยู่ในคอลัมน์  Ctrl+Shift+↑/↓ ย้ายไปคอลัมน์ก่อนหน้า/ถัดไป */
  function moveCursorTask(delta, crossSection) {
    var pid = state.route.id, id = state.cursor;
    var p = S.project(pid);
    var m = S.projectsOfTask(id).filter(function (x) { return x.project.id === pid; })[0];
    if (!p || !m) return;
    var secId = m.membership.sectionId;
    if (crossSection) {
      var si = -1;
      p.sections.forEach(function (s, i) { if (s.id === secId) si = i; });
      var sj = si + delta;
      if (si < 0 || sj < 0 || sj >= p.sections.length) return;
      var target = p.sections[sj];
      var tl = S.tasksInSection(pid, target.id);
      S.moveTask(id, pid, target.id, delta > 0 && tl.length ? tl[0].task.id : null);
      toast(L('ย้ายไป “{s}” แล้ว', { s: target.name }), L('ย้อนกลับ'), 'undo');
      return;
    }
    if (viewFor(pid).sorts.length) { toast(L('เลิกเรียงก่อน จึงจะเลื่อนลำดับเองได้')); return; }
    var ids = S.tasksInSection(pid, secId).map(function (x) { return x.task.id; });
    var i = ids.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    S.moveTask(id, pid, secId, delta < 0 ? ids[j] : (ids[j + 1] || null));
  }

  /* ---------- เพิ่มงานต่อจากแถว (Enter / Shift+Enter ในรายการ) ---------- */
  function addNear(refId, above) {
    var row = $view.querySelector('.tr[data-id="' + refId + '"]:not(.sub)');
    if (!row || state.route.type !== 'project') return false;
    var old = $view.querySelector('.tr-new');
    if (old) old.parentNode.removeChild(old);
    var pid = state.route.id;
    var box = document.createElement('div');
    box.className = 'tr tr-new';
    box.innerHTML = '<div class="td td-name"><span class="sub-caret-sp"></span>' +
      '<input class="cell-input tr-new-input" placeholder="' + esc(L('ชื่องาน แล้วกด Enter')) + '"></div>';
    row.parentNode.insertBefore(box, above ? row : row.nextSibling);
    var inp = box.querySelector('input');
    inp.focus();
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      if (box.parentNode) box.parentNode.removeChild(box);
    }
    inp.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Escape') { ev.preventDefault(); finish(); return; }
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      var v = inp.value.trim();
      if (!v) { finish(); return; }
      done = true;
      var t = S.createTaskNear(S.quickAdd(v, pid), pid, refId, !!above);
      if (t) {
        state.cursor = t.id;
        state.reopenNear = { ref: t.id, above: false };
        resumeNear();
      } else { done = false; finish(); }     // Sprint 1B — ถูกปฏิเสธ เก็บช่องพิมพ์ทิ้ง ไม่ค้างไว้
    });
    inp.addEventListener('blur', function () { setTimeout(finish, 0); });
    return true;
  }

  function resumeNear() {
    if (!state.reopenNear) return;
    var rn = state.reopenNear;
    state.reopenNear = null;
    addNear(rn.ref, rn.above);
  }

  /** ทำงานส่วนตัวให้เป็นสาธารณะ — เลือกโปรเจกต์และเซกชันที่จะวาง */
  function makePublicModal(taskId) {
    var projs = S.visibleProjects().filter(function (p) { return S.canInProject(p.id, 'edit'); });
    var h = '<h2>' + L('ทำให้เป็นสาธารณะ') + '</h2>' +
      '<p class="prj-note">' + L('เพิ่มงานนี้เข้าโปรเจกต์ แล้วทุกคนที่เห็นโปรเจกต์นั้นจะเห็นงานนี้ด้วย (รวมงานย่อย)') + '</p>';
    if (!projs.length) {
      return h + '<div class="prj-warn">' + I('alert', 15) + '<span>' +
        L('ยังไม่มีโปรเจกต์ที่คุณแก้ไขได้') + '</span></div>' +
        '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    }
    h += '<div class="field"><label>' + L('โปรเจกต์') + '</label><select id="mpProject" class="inp" data-act="mp-project">';
    projs.forEach(function (p) {
      h += '<option value="' + R.esc(p.id) + '">' + R.esc(p.icon + ' ' + p.name) + '</option>';
    });
    h += '</select></div>';
    h += '<div class="field"><label>' + L('เซกชัน') + '</label><select id="mpSection" class="inp">' +
      sectionOptions(projs[0].id) + '</select></div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-make-public" data-id="' + R.esc(taskId) + '">' +
      L('ทำให้เป็นสาธารณะ') + '</button></div>';
    return h;
  }

  function sectionOptions(projectId) {
    var p = S.project(projectId);
    return (p ? p.sections : []).map(function (s) {
      return '<option value="' + R.esc(s.id) + '">' + R.esc(s.name) + '</option>';
    }).join('');
  }

  /** การแจ้งเตือนของโปรเจกต์นี้ — เปิดปิดได้ต่อคนต่อโปรเจกต์ */
  function projNotifyModal(projectId) {
    var p = S.project(projectId);
    if (!p) return '';
    var cur = S.projNotifyOf(projectId);
    var h = '<h2>' + L('การแจ้งเตือนของ {p}', { p: R.esc(p.name) }) + '</h2>' +
      '<p class="prj-note">' + L('ตั้งเฉพาะตัวคุณ คนอื่นในโปรเจกต์ไม่เปลี่ยนตาม') + '</p>';
    S.PROJ_NOTIFY.forEach(function (k) {
      h += setToggle('proj-notify', L(k.label), cur[k.id], L(k.desc),
        ' data-id="' + R.esc(projectId) + '" data-k="' + k.id + '"');
    });
    h += '<div class="modal-acts"><button class="btn btn-primary" data-act="close-modal">' + L('เสร็จแล้ว') + '</button></div>';
    return h;
  }

  /* แจ้งว่ามีรายการใหม่เข้ากล่องแจ้งเตือน (เช่นซิงก์มาจากเพื่อนร่วมทีม)
   * ห้ามรบกวนอยู่ = ไม่เด้ง ตัวเลขที่แถบซ้ายก็ถูกซ่อนไว้ด้วย */
  var lastUnread = { uid: null, n: 0 };
  function noticeNewInbox() {
    var who = S.db.currentUserId;
    var n = S.unreadCount(who);
    if (!lastUnread) lastUnread = { uid: null, n: 0 };
    if (lastUnread.uid === who && n > lastUnread.n && !S.isDnd() && state.route.type !== 'inbox') {
      toast(L('มีการแจ้งเตือนใหม่ {n} รายการ', { n: n - lastUnread.n }), L('เปิดดู'), 'go-inbox');
    }
    lastUnread = { uid: who, n: n };
  }

  /* ---- เลือกงานอีกชิ้น ใช้ทั้งรวมงานซ้ำและแปลงเป็นงานย่อย ---- */
  var PICK_TEXT = {
    merge:  ['รวม “{t}” เป็นงานซ้ำของงานไหน',
             'งานนี้จะถูกติ๊กเสร็จและเติม [ซ้ำ] หน้าชื่อ แท็ก ผู้ติดตาม และคนที่ถูกใจย้ายไปที่งานที่เลือก', 'รวม'],
    parent: ['ย้าย “{t}” ไปเป็นงานย่อยของงานไหน',
             'งานนี้จะออกจากโปรเจกต์เดิมและไปอยู่ใต้งานที่เลือก', 'เลือก']
  };
  function taskPickModal(taskId, mode) {
    var t = S.task(taskId), tx = PICK_TEXT[mode];
    return '<h2>' + R.esc(L(tx[0], { t: t.name })) + '</h2>' +
      '<p class="prj-note">' + L(tx[1]) + '</p>' +
      '<div class="field"><input id="pickSearch" data-id="' + R.esc(taskId) + '" data-mode="' + mode +
      '" placeholder="' + L('พิมพ์เพื่อค้นหางาน') + '"></div>' +
      '<div id="pickResults">' + pickResults(taskId, mode, '') + '</div>' +
      '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
  }
  function pickResults(taskId, mode, q) {
    var t = S.task(taskId);
    if (!t) return '';
    q = (q || '').trim().toLowerCase();
    /* เรียงงานในโปรเจกต์เดียวกันขึ้นก่อน งานซ้ำกับงานแม่มักอยู่ที่เดียวกัน */
    var mine = {};
    S.projectsOfTask(taskId).forEach(function (x) { mine[x.project.id] = true; });
    var list = S.db.tasks.filter(function (x) {
      if (x.id === taskId || x.id === t.parentId && mode === 'parent') return false;
      if (mode === 'merge' && x.completed) return false;
      if (q && x.name.toLowerCase().indexOf(q) < 0) return false;
      return S.canSeeTask(x.id) && S.can('write', x.id);
    });
    list.sort(function (a, b) {
      var sa = S.projectsOfTask(a.id).some(function (x) { return mine[x.project.id]; }) ? 0 : 1;
      var sb = S.projectsOfTask(b.id).some(function (x) { return mine[x.project.id]; }) ? 0 : 1;
      return sa - sb;
    });
    list = list.slice(0, 12);
    if (!list.length) return '<div style="color:var(--fg-faint)">' + L('ไม่พบงาน') + '</div>';
    return list.map(function (x) {
      var home = S.projectsOfTask(x.id)[0];
      var par = x.parentId ? S.task(x.parentId) : null;
      return '<div class="mini-row"><div class="grow"><div>' + R.esc(x.name) + '</div>' +
        '<div class="sub">' + R.esc(par ? L('งานย่อยของ') + ' ' + par.name : (home ? home.project.name : L('ไม่อยู่ในโปรเจกต์'))) +
        '</div></div><button class="btn btn-sm btn-primary" data-act="' +
        (mode === 'merge' ? 'do-merge' : 'do-make-subtask') + '" data-id="' + R.esc(taskId) +
        '" data-target="' + R.esc(x.id) + '">' + L(PICK_TEXT[mode][2]) + '</button></div>';
    }).join('');
  }

  /* ---- มอบสำเนาให้หลายคน ---- */
  function assignCopiesModal(taskId) {
    var t = S.task(taskId);
    var h = '<h2>' + L('มอบสำเนาให้หลายคน') + '</h2>' +
      '<p class="prj-note">' + (t.assigneeId
        ? L('ทุกคนที่เลือกจะได้งาน “{t}” เป็นของตัวเองคนละชิ้น งานเดิมยังอยู่กับผู้รับผิดชอบคนเดิม', { t: t.name })
        : L('คนแรกที่เลือกได้งานนี้ไป คนที่เหลือได้สำเนาคนละชิ้น')) + '</p><div class="dup-grid people">';
    S.db.users.forEach(function (u) {
      if (u.active === false || u.id === t.assigneeId) return;
      h += '<label class="chk"><input type="checkbox" class="ac-user" value="' + R.esc(u.id) + '"> ' +
        R.avatar(u, 'sm') + ' ' + R.esc(u.name) + '</label>';
    });
    h += '</div><div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-assign-copies" data-id="' + R.esc(taskId) + '">' +
      L('มอบหมาย') + '</button></div>';
    return h;
  }

  /* ---- รูปแบบฟิลด์ตัวเลข ---- */
  function numberFormatFields(fm) {
    fm = fm || {};
    var kind = fm.kind || 'number';
    var h = '<div class="prj-2col"><div class="field"><label>' + L('แสดงเป็น') + '</label>' +
      '<select id="nfKind" data-act="nf-kind">';
    S.NUMBER_FORMATS.forEach(function (x) {
      h += '<option value="' + x.id + '"' + (x.id === kind ? ' selected' : '') + '>' + R.esc(L(x.label)) + '</option>';
    });
    h += '</select></div><div class="field"><label>' + L('ทศนิยม') + '</label><select id="nfDec">' +
      '<option value="">' + L('อัตโนมัติ') + '</option>';
    for (var d = 0; d <= 4; d++) {
      h += '<option value="' + d + '"' + (fm.decimals === d ? ' selected' : '') + '>' + d + '</option>';
    }
    h += '</select></div></div>';
    h += '<div class="field" id="nfCurWrap"' + (kind === 'currency' ? '' : ' hidden') + '><label>' +
      L('สกุลเงิน') + '</label><select id="nfCur">';
    S.CURRENCIES.forEach(function (c) {
      h += '<option value="' + c + '"' + ((fm.currency || 'THB') === c ? ' selected' : '') + '>' + c + '</option>';
    });
    h += '</select></div>';
    h += '<div class="field" id="nfUnitWrap"' + (kind === 'unit' ? '' : ' hidden') + '><label>' +
      L('หน่วย') + '</label><input id="nfUnit" maxlength="12" value="' + R.esc(fm.unit || '') +
      '" placeholder="' + L('เช่น ชิ้น, กก., ชม.') + '"></div>';
    return h;
  }
  function readNumberFormat() {
    var k = document.getElementById('nfKind');
    if (!k) return null;
    return {
      kind: k.value,
      decimals: document.getElementById('nfDec').value,
      currency: document.getElementById('nfCur').value,
      unit: document.getElementById('nfUnit').value
    };
  }
  function fieldFormatModal(projectId, fieldId) {
    var f = (S.project(projectId).fields || []).filter(function (x) { return x.id === fieldId; })[0];
    if (!f) return '';
    return '<h2>' + L('รูปแบบตัวเลขของ “{f}”', { f: f.name }) + '</h2>' + numberFormatFields(f.format) +
      '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-field-format" data-project="' + R.esc(projectId) +
      '" data-field="' + R.esc(fieldId) + '">' + L('บันทึก') + '</button></div>';
  }

  /** เมนูเพิ่มและลดมุมมองของโปรเจกต์
   *
   * เมนูเดียวทำทั้งสองอย่าง เพราะคนที่กดปุ่มบวกมักไม่รู้ว่าเอาออกได้ที่ไหน
   * ถ้าแยกกันคนละที่ คนจะเพิ่มจนแท็บรกแล้วหาทางเอาออกไม่เจอ
   */
  /* เมนูข้างปุ่มเพิ่มงาน — รวมวิธีเพิ่มงานแบบอื่นที่เดิมกระจายอยู่ในเมนูโปรเจกต์
   * ปุ่มหลักยังทำสิ่งที่คนต้องการเก้าในสิบครั้ง คือเพิ่มงานเปล่าหนึ่งงาน
   * ส่วนที่นาน ๆ ใช้ทีอย่างเทมเพลตกับนำเข้าไฟล์ อยู่หลังลูกศรไม่ให้เกะกะ */
  function addMenu(projectId) {
    var h = '<button data-act="quick-add">' + I('plus', 15) +
      '<span class="grow">' + L('เพิ่มงานเปล่า') + '</span></button>';
    if (S.taskTemplatesFor(projectId).length || S.can('structure')) {
      h += '<button data-act="tt-pick">' + I('star', 15) +
        '<span class="grow">' + L('เพิ่มจากเทมเพลต') + '</span></button>';
    }
    if (S.can('structure')) {
      h += '<button data-act="add-section">' + I('grid', 15) +
        '<span class="grow">' + L('เพิ่มเซกชัน') + '</span></button>';
      h += '<div class="pop-sep"></div>';
      h += '<button data-act="import-csv" data-id="' + R.esc(projectId) + '">' +
        I('arrowUp', 15) + '<span class="grow">' + L('นำเข้างานจาก CSV') + '</span></button>';
    }
    return h;
  }

  /** เมนูเลือกแท็ก — ของเดิมที่มีอยู่แล้วขึ้นก่อน สร้างใหม่ได้ถ้าพิมพ์คำที่ยังไม่มี */
  function tagMenu(taskId, q) {
    var t = S.task(taskId);
    if (!t) return '';
    var term = (q || '').trim().toLowerCase();
    var all = S.allTags().filter(function (x) {
      return t.tags.indexOf(x) < 0 && (!term || x.toLowerCase().indexOf(term) >= 0);
    });

    var h = '<div class="tagpick">' +
      '<input id="tagQ" data-act="tag-search" data-id="' + R.esc(taskId) +
      '" placeholder="' + L('พิมพ์เพื่อค้นหาหรือสร้างใหม่') + '" value="' + R.esc(q || '') + '">';
    h += '<div class="tagpick-list">';
    all.slice(0, 40).forEach(function (x) {
      h += '<button data-act="pick-tag" data-id="' + R.esc(taskId) + '" data-tag="' +
        R.esc(x) + '"><span class="chip tag">' + R.esc(x) + '</span></button>';
    });
    if (!all.length && !term) {
      h += '<div class="pop-note">' + L('ยังไม่มีแท็กในระบบ พิมพ์เพื่อสร้างอันแรก') + '</div>';
    }
    h += '</div>';
    /* สร้างใหม่โผล่เฉพาะตอนที่พิมพ์คำที่ยังไม่มีจริง ๆ
     * ถ้าโชว์ตลอด คนจะเผลอกดสร้างซ้ำกับแท็กที่มีอยู่แล้วแต่สะกดต่างกัน */
    if (term && S.allTags().indexOf(q.trim()) < 0 && t.tags.indexOf(q.trim()) < 0) {
      h += '<div class="pop-sep"></div>' +
        '<button data-act="pick-tag" data-id="' + R.esc(taskId) + '" data-tag="' +
        R.esc(q.trim()) + '">' + I('plus', 14) +
        '<span class="grow">' + L('สร้างแท็ก “{t}”', { t: q.trim() }) + '</span></button>';
    }
    return h + '</div>';
  }

  function viewMenu(projectId) {
    var on = S.projectViews(projectId);
    var h = '<div class="pop-note">' + L('เลือกมุมมองที่จะให้แสดงเป็นแท็บ') + '</div>';
    S.PROJECT_VIEWS.forEach(function (v) {
      var isOn = on.indexOf(v.id) >= 0;
      var last = isOn && on.length <= 1;
      h += '<button class="vw-opt' + (isOn ? ' on' : '') + '" data-act="toggle-view" data-id="' +
        R.esc(projectId) + '" data-view="' + v.id + '"' + (last ? ' disabled' : '') +
        ' title="' + (last ? L('ต้องเหลืออย่างน้อยหนึ่งมุมมอง') : '') + '">' +
        I(v.icon, 15) +
        '<span class="grow"><b>' + R.esc(L(v.label)) + '</b>' +
        '<em>' + R.esc(L(v.desc)) + '</em></span>' +
        (isOn ? R.ICON.check : '') + '</button>';
    });
    return h;
  }

  /** เมนูเลือกสถานะ — แยกสถานะที่ยังเดินอยู่ออกจากสถานะที่จบแล้วด้วยเส้นคั่น */
  function statusMenu(projectId) {
    var p = S.project(projectId);
    var cur = p.status ? p.status.state : null;
    var h = '', sepDone = false;
    S.PROJECT_STATES.forEach(function (x) {
      if (x.done && !sepDone) { h += '<div class="pop-sep"></div>'; sepDone = true; }
      h += '<button class="st-opt' + (cur === x.id ? ' on' : '') +
        '" data-act="pick-status" data-id="' + R.esc(projectId) + '" data-v="' + x.id + '">' +
        '<i style="background:' + x.color + '"></i>' +
        '<span class="grow" style="color:' + x.color + '">' + R.esc(L(x.label)) + '</span>' +
        (cur === x.id ? R.ICON.check : '') + '</button>';
    });
    h += '<div class="pop-sep"></div>';
    h += '<button data-act="update-status" data-id="' + R.esc(projectId) + '">' +
      I('pencil', 14) + '<span class="grow">' + L('เขียนรายงานสถานะ') + '</span></button>';
    if (p.status) {
      h += '<button data-act="clear-status" data-id="' + R.esc(projectId) + '">' +
        I('close', 14) + '<span class="grow">' + L('ล้างสถานะ') + '</span></button>';
    }
    return h;
  }

  /* ======================================================================
   * 3b — รายงานสถานะแบบบล็อก ฟอร์ม ชนิดงาน เทมเพลตโปรเจกต์ และเทมเพลตงาน
   * ทุกตัวแก้เป็นสำเนาในหน้าจอ (state.sb / fe / te / tte) จนกว่าจะกดบันทึก
   * ช่องพิมพ์อัปเดตสำเนาตอนพิมพ์โดยไม่วาดใหม่ (syncDraft3b) ตัวเลือกวาดหน้าต่างใหม่ (refresh3b)
   * ====================================================================== */

  function refresh3b(html, wide) {
    if (!$mdBack.classList.contains('open')) { openModal(html, wide); return; }
    var top = $modal.scrollTop;
    $modal.className = 'modal' + (wide ? ' wide' : '');
    $modal.innerHTML = html;
    $modal.scrollTop = top;
  }

  /* ---------- ตัวสร้างรายงานสถานะ ---------- */

  function openStatusBuilder(pid) {
    var p = S.project(pid);
    if (!p) return;
    var lay = S.statusLayoutOf(pid);
    state.sb = { pid: pid, state: (p.status && p.status.state) || 'on_track', title: '',
      blocks: lay.blocks.map(function (b) { return { k: b.k, title: b.title || '', text: '' }; }),
      hl: lay.hl.slice(), period: lay.period || 7 };
    openModal(statusBuilderHtml(), true);
  }

  function statusBuilderHtml() {
    var s = state.sb, p = S.project(s && s.pid);
    if (!p) return '';
    var canStruct = S.can('structure') && S.canInProject(p.id, 'edit');
    var h = '<h2>' + L('รายงานสถานะ') + ' — ' + esc(p.name) + '</h2><div class="sb-grid"><div class="sb-main">';
    h += '<div class="st-pick">';
    S.PROJECT_STATES.forEach(function (x) {
      h += '<button type="button" class="' + (s.state === x.id ? 'on' : '') + '" data-act="sb-state" data-v="' + x.id +
        '" style="--c:' + x.color + '"><i style="background:' + x.color + '"></i>' + esc(L(x.label)) + '</button>';
    });
    h += '</div>';
    h += '<input class="inp sb-title" data-act="sb-title" maxlength="120" value="' + esc(s.title) + '" placeholder="' +
      esc(L('หัวเรื่อง เช่น สรุปสัปดาห์ที่ 3')) + '">';
    s.blocks.forEach(function (b, i) {
      var d = ' data-i="' + i + '"';
      h += '<div class="sb-blk"><div class="sb-bh">' +
        (b.k === 'custom'
          ? '<input class="inp" data-act="sb-btitle"' + d + ' maxlength="80" value="' + esc(b.title) + '" placeholder="' + esc(L('ชื่อหัวข้อ')) + '">'
          : '<b>' + esc(R.blockLabel(b)) + '</b>') +
        (i > 0 ? '<button class="flt-del" data-act="sb-up"' + d + ' title="' + esc(L('ย้ายขึ้น')) + '">' + I('arrowUp', 13) + '</button>' : '') +
        '<button class="flt-del" data-act="sb-del"' + d + ' title="' + esc(L('เอาบล็อกนี้ออก')) + '">' + I('close', 13) + '</button></div>' +
        '<textarea class="inp" rows="3" data-act="sb-text"' + d + ' placeholder="' + esc(L('เขียนสั้น ๆ ขึ้นต้นด้วย - เพื่อทำหัวข้อย่อย')) + '">' +
        esc(b.text) + '</textarea></div>';
    });
    if (s.blocks.length < 10) {
      h += '<select class="opt-select sb-add" data-act="sb-add"><option value="">+ ' + L('เพิ่มบล็อก…') + '</option>' +
        S.STATUS_BLOCKS.map(function (b) { return '<option value="' + b.k + '">' + esc(L(b.label)) + '</option>'; }).join('') + '</select>';
    }
    if (s.hl.length) {
      h += '<label class="opt-lbl">' + L('ไฮไลต์ (ภาพ ณ ตอนนี้ จะเก็บไว้กับรายงาน)') + '</label>' +
        R.statusHlHtml(S.statusHighlights(p.id, s.hl, s.period), s.period);
    }
    h += '</div><aside class="sb-side">';
    h += '<h4>' + L('ไฮไลต์') + '</h4>';
    S.STATUS_HL.forEach(function (x) {
      h += '<label class="chk"><input type="checkbox" data-act="sb-hl" data-k="' + x.k + '"' +
        (s.hl.indexOf(x.k) >= 0 ? ' checked' : '') + '> ' + esc(L(x.label)) + '</label>';
    });
    h += '<label class="opt-lbl">' + L('ช่วงเวลา') + '</label><select class="opt-select" data-act="sb-period">' +
      S.STATUS_PERIODS.map(function (n) {
        return '<option value="' + n + '"' + (+s.period === n ? ' selected' : '') + '>' + esc(L('{n} วันที่ผ่านมา', { n: n })) + '</option>';
      }).join('') + '</select>';
    var tpls = S.statusTemplates();
    h += '<h4>' + L('เทมเพลตรายงาน') + '</h4>';
    if (tpls.length) {
      h += '<select class="opt-select" data-act="sb-tpl"><option value="">' + L('ใช้เทมเพลต…') + '</option>' +
        tpls.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>'; }).join('') + '</select>';
      h += '<div class="sb-tpls">' + tpls.map(function (t) {
        var mine = t.by === S.db.currentUserId || S.isAdmin();
        return '<span class="chip">' + esc(t.name) + (mine ? '<button data-act="sb-tpl-del" data-id="' + esc(t.id) +
          '" title="' + esc(L('ลบเทมเพลต')) + '">' + I('close', 11) + '</button>' : '') + '</span>';
      }).join('') + '</div>';
    }
    h += '<button class="btn btn-sm" data-act="sb-tpl-save">' + I('star', 13) + ' ' + L('บันทึกเลย์เอาต์นี้เป็นเทมเพลต') + '</button>';
    var owner = S.user(p.owner);
    h += '<h4>' + L('เตือนทุกสัปดาห์') + '</h4><label class="chk"><input type="checkbox" data-act="sb-remind"' +
      (p.statusRemind ? ' checked' : '') + (canStruct ? '' : ' disabled') + '> ' + L('สร้างงานเตือนเจ้าของโปรเจกต์ทุกวันศุกร์') + '</label>' +
      '<p class="opt-note">' + esc(owner ? L('เจ้าของโปรเจกต์: {n} · ถ้ารายงานในสัปดาห์นั้นแล้วจะไม่สร้าง งานเตือนปิดเองเมื่อรายงาน', { n: owner.name })
        : L('โปรเจกต์นี้ยังไม่มีเจ้าของ ตั้งได้ที่ตั้งค่าโปรเจกต์')) + '</p>';
    var log = S.statusLog(p.id, 3);
    if (log.length) {
      h += '<h4>' + L('รายงานก่อนหน้า') + '</h4><div class="st-log">';
      log.forEach(function (e) {
        var st = R.projectState(e.state), by = S.user(e.by);
        h += '<div class="st-log-row"><i style="background:' + st.color + '"></i><div><b style="color:' + st.color + '">' +
          esc(L(st.label)) + '</b>' + (e.title || e.text ? '<em>' + esc(e.title || S.plainText(e.text).slice(0, 120)) + '</em>' : '') +
          '<span>' + esc(by ? by.name : '?') + ' · ' + esc(R.fmtWhen(e.at)) + '</span></div></div>';
      });
      h += '</div>';
    }
    h += '</aside></div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="save-status" data-id="' + esc(p.id) + '">' + L('โพสต์รายงาน') + '</button></div>';
    return h;
  }

  /* ---------- ฟอร์ม ---------- */

  function formUrl(id) { return appUrl() + '#/form/' + id; }

  function openForms(pid) {
    state.fe = null;
    openModal(formsModal(pid), true);
  }

  function formsModal(pid) {
    var p = S.project(pid);
    if (!p) return '';
    var canEdit = S.canEditForms(pid), list = p.forms || [];
    var d = ' data-project="' + esc(pid) + '"';
    var h = '<h2 class="au-h">' + I('note', 17) + ' ' + L('ฟอร์ม') + ' — ' + esc(p.name) + '</h2>';
    h += '<p class="opt-note" style="margin-top:0">' + L('คำตอบแต่ละครั้งกลายเป็นงานหนึ่งชิ้นในโปรเจกต์นี้ คำถามผูกกับฟิลด์ได้ และแตกแขนงตามคำตอบได้') + '</p>';
    if (!list.length) {
      h += '<p class="au-empty">' + (canEdit ? L('ยังไม่มีฟอร์ม กด “สร้างฟอร์ม” เพื่อเริ่ม') : L('ยังไม่มีฟอร์มในโปรเจกต์นี้')) + '</p>';
    }
    h += '<div class="au-list">';
    list.forEach(function (f) {
      var nq = f.items.filter(function (it) { return it.kind !== 'heading'; }).length;
      var fd = d + ' data-id="' + esc(f.id) + '"';
      h += '<div class="au-row' + (f.on ? '' : ' off') + '">' +
        '<button class="switch' + (f.on ? ' on' : '') + '" data-act="fm-toggle"' + fd + ' role="switch" aria-checked="' + (f.on ? 'true' : 'false') +
        '" title="' + esc(f.on ? L('ปิดรับคำตอบ') : L('เปิดรับคำตอบ')) + '"' + (canEdit ? '' : ' disabled') + '><i></i></button>' +
        '<div class="grow"><b>' + esc(f.name) + '</b><div class="sub">' +
        esc(L('{q} คำถาม · {n} คำตอบ', { q: nq, n: f.n || 0 })) + (f.last ? ' · ' + esc(L('ล่าสุด')) + ' ' + esc(R.fmtWhen(f.last)) : '') +
        '</div></div><span class="au-row-acts">' +
        '<button class="btn btn-sm btn-ghost" data-act="fm-go"' + fd + ' title="' + esc(L('เปิดหน้าส่งฟอร์ม')) + '">' + I('arrowRight', 13) + '</button>' +
        '<button class="btn btn-sm btn-ghost" data-act="fm-link"' + fd + ' title="' + esc(L('คัดลอกลิงก์ฟอร์ม')) + '">' + I('link', 13) + '</button>' +
        (canEdit ? '<button class="btn btn-sm btn-ghost" data-act="fm-edit"' + fd + ' title="' + esc(L('แก้ไข')) + '">' + I('pencil', 13) + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="fm-dup"' + fd + ' title="' + esc(L('ทำสำเนา')) + '">' + I('copy', 13) + '</button>' +
          '<button class="btn btn-sm btn-ghost btn-danger" data-act="fm-del"' + fd + ' title="' + esc(L('ลบ')) + '">' + I('trash', 13) + '</button>' : '') +
        '</span></div>';
    });
    h += '</div>';
    if (canEdit && list.length < S.FORM_MAX) {
      h += '<div class="opt-acts"><button class="btn btn-sm btn-primary" data-act="fm-new"' + d + '>' + I('plus', 13) + ' ' + L('สร้างฟอร์ม') + '</button></div>';
    }
    h += '<p class="opt-note au-note">' + I('alert', 12) + ' ' + esc(L(FORM_PUBLIC_NOTE)) + '</p>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  /* Sprint 1A — เขียนเป็นภาษาคนใช้ (เดิมพูดถึงเซิร์ฟเวอร์และ "เฟส 5" ของทีมพัฒนา) */
  var FORM_PUBLIC_NOTE = 'ลิงก์ฟอร์มใช้ได้เฉพาะพนักงานที่ล็อกอิน Orbit แล้ว คนนอกองค์กรยังเปิดฟอร์มนี้ไม่ได้';

  function feNewItem(kind) {
    var opts = (kind === 'select' || kind === 'multi') ? [L('ตัวเลือก 1'), L('ตัวเลือก 2')] : [];
    return { id: S.uid('q'), kind: kind, label: '', help: '', req: false, opts: opts, map: '', cond: null };
  }

  function formEditModal() {
    var e = state.fe, f = e.f, pid = e.pid, p = S.project(pid);
    if (!p) return '';
    var h = '<h2 class="au-h">' + I('note', 17) + ' ' + (e.isNew ? L('สร้างฟอร์ม') : L('แก้ฟอร์ม')) + '</h2>';
    h += '<div class="field"><label>' + L('ชื่อฟอร์ม') + '</label><input class="opt-select" data-act="fe-set" data-k="name" maxlength="120" value="' +
      esc(f.name) + '"></div>';
    h += '<div class="field"><label>' + L('คำอธิบาย (ไม่บังคับ)') + '</label><textarea class="opt-select au-text" rows="2" data-act="fe-set" data-k="desc">' +
      esc(f.desc) + '</textarea></div>';
    var pos = {};
    f.items.forEach(function (it, i) { pos[it.id] = i; });
    f.items.forEach(function (it, i) {
      var d = ' data-i="' + i + '"';
      var kd = S.formKind(it.kind) || {};
      h += '<div class="au-block fe-q' + (it.cond ? ' fe-branch' : '') + '"' + (it.cond ? ' style="--depth:' + S.formDepth(f, it) + '"' : '') + '>' +
        '<div class="flt-line"><span class="au-n">' + (i + 1) + '</span>' +
        auSel('fe-q', S.FORM_KINDS.map(function (k) { return [k.id, L(k.label)]; }), it.kind, d + ' data-k="kind"') +
        (i > 0 ? '<button class="flt-del" data-act="fe-q-up"' + d + ' title="' + esc(L('ย้ายขึ้น')) + '">' + I('arrowUp', 13) + '</button>' : '') +
        (i < f.items.length - 1 ? '<button class="flt-del" data-act="fe-q-down"' + d + ' title="' + esc(L('ย้ายลง')) + '">' + I('arrowDown', 13) + '</button>' : '') +
        '<button class="flt-del" data-act="fe-q-del"' + d + ' title="' + esc(L('ลบคำถามนี้')) + '">' + I('close', 13) + '</button></div>' +
        '<div class="au-params">' +
        '<input class="opt-select" data-act="fe-q"' + d + ' data-k="label" maxlength="300" value="' + esc(it.label) + '" placeholder="' +
          esc(it.kind === 'heading' ? L('หัวข้อ') : L('คำถาม')) + '">' +
        '<input class="opt-select" data-act="fe-q"' + d + ' data-k="help" maxlength="1000" value="' + esc(it.help) + '" placeholder="' +
          esc(L('คำอธิบายใต้คำถาม (ไม่บังคับ)')) + '">';
      if (kd.opts) {
        h += '<label class="opt-lbl">' + L('ตัวเลือก (บรรทัดละหนึ่ง)') + '</label><textarea class="opt-select au-text" rows="3" data-act="fe-q"' + d +
          ' data-k="opts">' + esc(it.opts.join('\n')) + '</textarea>';
      }
      if (it.kind !== 'heading') {
        h += '<div class="flt-line"><label class="chk"><input type="checkbox" data-act="fe-q"' + d + ' data-k="req" data-t="check"' +
          (it.req ? ' checked' : '') + '> ' + L('ต้องตอบ') + '</label>';
        if (it.kind !== 'file') {
          h += '<span class="au-pre-l">' + L('ใส่ลงใน') + '</span>' +
            auSel('fe-q', S.formTargets(pid, it.kind).map(function (x) { return [x[0], x[0].indexOf('field:') === 0 ? x[1] : L(x[1])]; }), it.map, d + ' data-k="map"');
        } else {
          h += '<span class="au-pre-l">' + L('แนบเข้างานที่สร้าง (ไม่เกิน 2 MB ต่อไฟล์)') + '</span>';
        }
        h += '</div>';
      }
      /* แตกแขนง — แสดงคำถามนี้เมื่อคำถามตัวเลือกที่อยู่ก่อนหน้าตอบตรงค่าที่ติ๊ก */
      var srcs = f.items.slice(0, i).filter(function (x) {
        return (x.kind === 'select' || x.kind === 'multi') && S.formDepth(f, x) < S.FORM_DEPTH;
      });
      if (srcs.length) {
        var cq = it.cond && pos[it.cond.q] < i ? it.cond.q : '';
        h += '<div class="flt-line"><span class="au-pre-l">' + L('แสดง') + '</span>' +
          auSel('fe-q', [['', L('เสมอ')]].concat(srcs.map(function (x) {
            return [x.id, L('เมื่อ “{q}” ตอบ…', { q: x.label || ('#' + (pos[x.id] + 1)) })];
          })), cq, d + ' data-k="condq"') + '</div>';
        if (cq) {
          var src = f.items[pos[cq]];
          h += '<div class="flt-chips">' + src.opts.map(function (o) {
            var on = it.cond.v.indexOf(o) >= 0;
            return '<button class="flt-chip' + (on ? ' on' : '') + '" data-act="fe-cond-chip"' + d + ' data-v="' + esc(o) + '">' + esc(o) + '</button>';
          }).join('') + '</div>';
        }
      }
      h += '</div></div>';
    });
    h += '<div class="au-add">' + auSel('fe-q-add', [['', '+ ' + L('เพิ่มคำถาม…')]].concat(S.FORM_KINDS.map(function (k) { return [k.id, L(k.label)]; })), '', '') + '</div>';

    /* ตั้งค่า */
    var textQs = f.items.filter(function (it) { return it.kind === 'text' || it.kind === 'long'; });
    h += '<div class="au-block"><div class="au-bh">' + L('ตั้งค่า') + '</div><div class="au-params">' +
      '<label class="opt-lbl">' + L('งานใหม่ไปลงเซกชัน') + '</label>' + auSel('fe-set', p.sections.map(function (s) { return [s.id, s.name]; }), f.sec || p.sections[0].id, ' data-k="sec"') +
      '<label class="opt-lbl">' + L('ชื่องานมาจากคำถาม') + '</label>' +
      auSel('fe-set', [['', L('คำถามที่ผูกกับ “ชื่องาน” (หรือชื่อฟอร์ม + คนส่ง)')]].concat(textQs.map(function (it) { return [it.id, it.label || '?']; })), f.titleQ, ' data-k="titleQ"') +
      '<label class="opt-lbl">' + L('ผู้รับผิดชอบเริ่มต้น') + '</label>' +
      auSel('fe-set', [['', L('ยังไม่มอบหมาย')]].concat(auUsers()), f.assignee, ' data-k="assignee"') +
      /* เตือนตั้งแต่เลือก ไม่ต้องรอกดบันทึก — ผู้รับผิดชอบเริ่มต้นที่ไม่ได้เป็นสมาชิกโปรเจกต์ปิดจะเห็นทุกงานจากฟอร์ม */
      (f.assignee && S.outsidersOf(p.id, [f.assignee]).users.length
        ? '<p class="opt-note fe-warn">' + I('alert', 12) + ' ' +
          esc(L('{who} ไม่ได้เป็นสมาชิกของโปรเจกต์ปิดนี้ แต่จะเห็นทุกงานที่ฟอร์มสร้าง (รวมความเห็นและไฟล์แนบ)',
            { who: (S.user(f.assignee) || {}).name || '' })) + '</p>' : '') +
      '<label class="chk"><input type="checkbox" data-act="fe-set" data-k="copy" data-t="check"' + (f.copy ? ' checked' : '') + '> ' +
        L('คัดลอกคำตอบลงรายละเอียดงาน') + '</label>' +
      '<label class="chk"><input type="checkbox" data-act="fe-set" data-k="follow" data-t="check"' + (f.follow ? ' checked' : '') + '> ' +
        L('ให้คนส่งเป็นผู้ติดตามงาน') + '</label>' +
      '<label class="chk"><input type="checkbox" data-act="fe-set" data-k="again" data-t="check"' + (f.again ? ' checked' : '') + '> ' +
        L('แสดงปุ่ม “ส่งอีกครั้ง” หลังส่ง') + '</label>' +
      '<label class="chk"><input type="checkbox" data-act="fe-set" data-k="on" data-t="check"' + (f.on ? ' checked' : '') + '> ' +
        L('เปิดรับคำตอบ') + '</label>' +
      '<label class="opt-lbl">' + L('ข้อความหลังส่ง') + '</label><input class="opt-select" data-act="fe-set" data-k="confirm" maxlength="1000" value="' +
        esc(f.confirm) + '" placeholder="' + esc(L('ส่งเรียบร้อยแล้ว ขอบคุณ')) + '">' +
      '</div></div>';
    if (!e.isNew) {
      h += '<div class="au-block"><div class="au-bh">' + L('แชร์') + '</div><div class="flt-line"><input class="opt-select" readonly value="' +
        esc(formUrl(f.id)) + '"><button class="btn btn-sm" data-act="fm-link" data-id="' + esc(f.id) + '">' + I('link', 13) + ' ' + L('คัดลอก') + '</button></div>' +
        '<p class="opt-note">' + esc(L(FORM_PUBLIC_NOTE)) + '</p></div>';
    }
    h += '<p class="opt-note">' + L('แตกแขนงได้ลึกสุด {n} ชั้น คำถามที่ซ่อนอยู่ไม่ต้องตอบแม้ตั้งว่าต้องตอบ', { n: S.FORM_DEPTH }) + '</p>';
    h += '<div class="modal-acts"><button class="btn" data-act="fe-back">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="fe-save">' + L('บันทึก') + '</button></div>';
    return h;
  }

  /** อ่านไฟล์ที่เลือกในหน้าส่งฟอร์มเป็น data URI (ไม่เกิน 2 MB ต่อไฟล์) */
  function takeFormFiles(inputEl) {
    var qid = inputEl.dataset.q;
    var files = Array.prototype.slice.call(inputEl.files || []);
    inputEl.value = '';
    if (!state.ff || !files.length) return;
    var cur = [].concat(state.ff.ans[qid] || []);
    var room = S.FORM_FILES_MAX - cur.length;
    files.slice(0, Math.max(0, room)).forEach(function (f) {
      if (f.size > S.FORM_FILE_BYTES) {
        toast(L('ไฟล์นี้ {mb} MB เกิน {n} MB ที่แนบได้', { mb: (f.size / 1048576).toFixed(1), n: 2 }));
        return;
      }
      var fr = new FileReader();
      fr.onload = function () {
        if (!state.ff) return;
        var list = [].concat(state.ff.ans[qid] || []);
        list.push({ name: f.name, url: fr.result, size: f.size, mime: f.type });
        state.ff.ans[qid] = list;
        renderViewBody();
      };
      fr.onerror = function () { toast(L('อ่านไฟล์ไม่สำเร็จ')); };
      fr.readAsDataURL(f);
    });
  }

  /* ---------- ชนิดงานและสถานะ ---------- */

  function openTypes(pid) {
    state.te = { pid: pid, ty: null, isNew: false };
    openModal(typesModal(), true);
  }

  function typesModal() {
    var e = state.te, p = e && S.project(e.pid);
    if (!p) return '';
    if (e.ty) return typeEditModal();
    var canEdit = S.canEditTypes(p.id), list = p.types || [];
    var h = '<h2 class="au-h">' + I('diamond', 17) + ' ' + L('ชนิดงานและสถานะ') + ' — ' + esc(p.name) + '</h2>';
    h += '<p class="opt-note" style="margin-top:0">' + L('ชนิดงานกำหนดเองมีสถานะของตัวเอง (เช่น ใหม่ → กำลังทำ → เสร็จ) สถานะที่ “นับว่าเสร็จ” จะติ๊กงานเสร็จให้ จัดกลุ่ม กรอง และทำคอลัมน์บอร์ดตามสถานะได้') + '</p>';
    if (!list.length) h += '<p class="au-empty">' + L('ยังไม่มีชนิดงานกำหนดเอง') + '</p>';
    h += '<div class="au-list">';
    list.forEach(function (ty) {
      var d = ' data-id="' + esc(ty.id) + '"';
      h += '<div class="au-row"><span class="ty-big">' + esc(ty.icon) + '</span><div class="grow"><b>' + esc(ty.name) + '</b><div class="ty-sts">' +
        ty.statuses.map(function (s) {
          return '<span class="cst-pill" style="background:' + esc(s.color) + '22;color:' + esc(s.color) + '"><i style="background:' + esc(s.color) + '"></i>' +
            esc(s.name) + (s.done ? ' ✓' : '') + '</span>';
        }).join('') + '</div></div><span class="au-row-acts">' +
        (canEdit ? '<button class="btn btn-sm btn-ghost" data-act="ty-edit"' + d + ' title="' + esc(L('แก้ไข')) + '">' + I('pencil', 13) + '</button>' +
          '<button class="btn btn-sm btn-ghost btn-danger" data-act="ty-del"' + d + ' title="' + esc(L('ลบ')) + '">' + I('trash', 13) + '</button>' : '') +
        '</span></div>';
    });
    h += '</div>';
    h += '<label class="opt-lbl">' + L('ชนิดเริ่มต้นของงานใหม่ (“+ เพิ่มงาน” ทุกทาง ฟอร์ม)') + '</label>' +
      '<select class="opt-select" data-act="ty-default"' + (canEdit ? '' : ' disabled') + '>' +
      '<option value="">' + L('ไม่ระบุ (งานทั่วไป)') + '</option>' +
      S.typeChoices(p.id).map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (p.defaultType === c.id ? ' selected' : '') + '>' + esc(c.icon + ' ' + (c.custom ? c.label : L(c.label))) + '</option>';
      }).join('') + '</select>';
    if (canEdit && list.length < S.TYPE_MAX) {
      h += '<div class="opt-acts"><button class="btn btn-sm btn-primary" data-act="ty-new">' + I('plus', 13) + ' ' + L('สร้างชนิดงาน') + '</button></div>';
    }
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  function typeEditModal() {
    var e = state.te, ty = e.ty;
    var h = '<h2 class="au-h">' + I('diamond', 17) + ' ' + (e.isNew ? L('สร้างชนิดงาน') : L('แก้ชนิดงาน')) + '</h2>';
    h += '<div class="flt-line te-head"><input class="opt-select te-icon" data-act="te-set" data-k="icon" maxlength="4" value="' + esc(ty.icon) +
      '" title="' + esc(L('ไอคอน / อีโมจิ')) + '"><input class="opt-select" data-act="te-set" data-k="name" maxlength="60" value="' + esc(ty.name) +
      '" placeholder="' + esc(L('ชื่อชนิดงาน เช่น คำขอ บั๊ก คอนเทนต์')) + '"></div>';
    h += '<label class="opt-lbl">' + L('สถานะ (เรียงตามลำดับงาน)') + '</label><div class="te-sts">';
    ty.statuses.forEach(function (s, i) {
      var d = ' data-i="' + i + '"';
      h += '<div class="flt-line te-st"><button class="te-color" data-act="te-st-color"' + d + ' style="background:' + esc(s.color) +
        '" title="' + esc(L('เปลี่ยนสี')) + '"></button>' +
        '<input class="opt-select" data-act="te-st"' + d + ' data-k="name" maxlength="40" value="' + esc(s.name) + '">' +
        '<label class="chk"><input type="checkbox" data-act="te-st"' + d + ' data-k="done" data-t="check"' + (s.done ? ' checked' : '') + '> ' +
        L('นับว่าเสร็จ') + '</label>' +
        (i > 0 ? '<button class="flt-del" data-act="te-st-up"' + d + ' title="' + esc(L('ย้ายขึ้น')) + '">' + I('arrowUp', 13) + '</button>' : '') +
        (ty.statuses.length > 1 ? '<button class="flt-del" data-act="te-st-del"' + d + ' title="' + esc(L('ลบสถานะนี้')) + '">' + I('close', 13) + '</button>' : '') +
        '</div>';
    });
    h += '</div>';
    if (ty.statuses.length < S.STATUS_MAX) {
      h += '<div class="opt-acts"><button class="btn btn-sm btn-ghost" data-act="te-st-add">' + I('plus', 13) + ' ' + L('เพิ่มสถานะ') + '</button></div>';
    }
    h += '<p class="opt-note">' + L('งานที่อยู่ในสถานะที่ถูกลบจะย้ายไปสถานะแรก ติ๊กงานเสร็จ = ย้ายไปสถานะแรกที่ “นับว่าเสร็จ” เปิดงานใหม่ = กลับไปสถานะแรกที่ยังไม่เสร็จ') + '</p>';
    h += '<div class="modal-acts"><button class="btn" data-act="te-back">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="te-save">' + L('บันทึก') + '</button></div>';
    return h;
  }

  /** เมนูเลือกสถานะของงาน (ช่องสถานะในรายการ) — สถานะของชนิดในโปรเจกต์ที่เปิดอยู่ + ชนิดของงานเอง */
  function statusPop(taskId) {
    var t = S.task(taskId);
    if (!t) return '';
    var tys = [], seen = {};
    function add(ty) { if (ty && !seen[ty.id]) { seen[ty.id] = true; tys.push(ty); } }
    add(S.typeOf(t));
    if (state.route.type === 'project') S.projectTypes(state.route.id).forEach(add);
    if (!tys.length) return '<div class="pop-note">' + L('โปรเจกต์นี้ยังไม่มีชนิดงานกำหนดเอง') + '</div>';
    var h = '';
    tys.forEach(function (ty, i) {
      if (i) h += '<div class="pop-sep"></div>';
      h += '<div class="pop-note">' + esc(ty.icon + ' ' + ty.name) + '</div>';
      ty.statuses.forEach(function (s) {
        h += '<button data-act="set-cstatus" data-id="' + esc(t.id) + '" data-v="' + esc(s.id) + '">' + popCheck(t.cstatus === s.id) +
          '<span class="grp-dot" style="background:' + esc(s.color) + '"></span><span class="grow">' + esc(s.name) + '</span>' +
          (s.done ? I('check', 12) : '') + '</button>';
      });
    });
    return h;
  }

  /* ---------- เทมเพลตโปรเจกต์ ---------- */

  function ptCounts(x) {
    var d = x.data || {}, n = 0;
    var walk = function (list) { (list || []).forEach(function (t) { n++; walk(t.subs); }); };
    walk(d.tasks);
    var parts = [L('{n} เซกชัน', { n: (d.sections || []).length }), L('{n} งาน', { n: n })];
    if ((d.forms || []).length) parts.push(L('{n} ฟอร์ม', { n: d.forms.length }));
    if ((d.types || []).length) parts.push(L('{n} ชนิดงาน', { n: d.types.length }));
    if ((d.automations || []).length) parts.push(L('{n} อัตโนมัติ', { n: d.automations.length }));
    return parts.join(' · ');
  }

  function ptGalleryHtml() {
    var all = S.projectTemplates();
    var h = '';
    [[true, L('เทมเพลตตั้งต้น')], [false, L('เทมเพลตขององค์กร')]].forEach(function (g) {
      var list = all.filter(function (x) { return !!x.builtin === g[0]; });
      h += '<label class="opt-lbl">' + esc(g[1]) + '</label>';
      if (!list.length) {
        h += '<p class="au-empty">' + L('ยังไม่มี — เปิดโปรเจกต์ที่อยากใช้เป็นแบบ แล้วกดเมนู ⋯ → “บันทึกเป็นเทมเพลตโปรเจกต์…”') + '</p>';
        return;
      }
      h += '<div class="pt-grid">';
      list.forEach(function (x) {
        var d = ' data-id="' + esc(x.id) + '"', by = S.user(x.by);
        h += '<div class="pt-card"><button class="pt-main" data-act="pt-pick"' + d + '><span class="pt-ic" style="background:' + esc(x.color) + '22">' +
          esc(x.icon) + '</span><span class="grow"><b>' + esc(x.name) + '</b><em>' + esc(x.desc || '') + '</em><span class="pt-meta">' +
          esc(ptCounts(x)) + (!x.builtin && by ? ' · ' + esc(by.name) : '') + '</span></span></button>' +
          (S.ptCanEdit(x) ? '<span class="pt-acts">' +
            '<button class="btn btn-sm btn-ghost" data-act="pt-rename"' + d + ' title="' + esc(L('เปลี่ยนชื่อ')) + '">' + I('pencil', 12) + '</button>' +
            '<button class="btn btn-sm btn-ghost" data-act="pt-share"' + d + ' title="' + esc(L('ใครใช้หรือแก้เทมเพลตนี้ได้')) + '">' + I('users', 12) + '</button>' +
            '<button class="btn btn-sm btn-ghost btn-danger" data-act="pt-del"' + d + ' title="' + esc(L('ลบ')) + '">' + I('trash', 12) + '</button></span>' : '') +
          '</div>';
      });
      h += '</div>';
    });
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button></div>';
    return h;
  }

  function ptUseModal(id) {
    var x = S.projectTemplate(id);
    if (!x) return '';
    var d = x.data || {};
    var h = '<h2>' + esc(x.icon) + ' ' + L('ใช้เทมเพลต “{t}”', { t: esc(x.name) }) + '</h2>';
    if (x.desc) h += '<p class="opt-note" style="margin-top:0">' + esc(x.desc) + '</p>';
    h += '<div class="field"><label>' + L('ชื่อโปรเจกต์') + '</label><input id="ptuName" value="' + esc(x.name) + '"></div>';
    h += '<div class="field"><label>' + L('วันเริ่มโปรเจกต์ (วันของงานนับจากวันนี้)') + '</label><input id="ptuStart" type="date" value="' + S.today() + '"></div>';
    h += '<label class="chk"><input type="checkbox" id="ptuSkip"' + (x.skipWeekends ? ' checked' : '') + '> ' +
      L('ข้ามเสาร์-อาทิตย์ (นับเฉพาะวันทำงาน)') + '</label>';
    if ((d.roles || []).length) {
      h += '<label class="opt-lbl">' + L('มอบบทบาทให้คน') + '</label><div class="ptu-roles">';
      d.roles.forEach(function (r) {
        var def = r.user && S.user(r.user) && S.user(r.user).active !== false ? r.user : '';
        h += '<div class="flt-line"><span class="ptu-role">' + esc(r.name) + '</span><select class="opt-select" id="ptuRole-' + esc(r.k) + '">' +
          '<option value="">' + L('ยังไม่มอบหมาย') + '</option>' + auUsers().map(function (u) {
            return '<option value="' + esc(u[0]) + '"' + (u[0] === def ? ' selected' : '') + '>' + esc(u[1]) + '</option>';
          }).join('') + '</select></div>';
      });
      h += '</div>';
    }
    h += '<p class="opt-note">' + esc(L('จะได้: {c}', { c: ptCounts(x) })) +
      ((d.fields || []).length ? ' · ' + esc(L('{n} ฟิลด์', { n: d.fields.length })) : '') + '</p>';
    h += '<div class="modal-acts"><button class="btn" data-act="np-tab" data-v="tpl">' + L('กลับ') + '</button>' +
      '<button class="btn btn-primary" data-act="pt-use" data-id="' + esc(x.id) + '">' + L('สร้างโปรเจกต์') + '</button></div>';
    return h;
  }

  function ptSaveModal(pid) {
    var p = S.project(pid);
    if (!p) return '';
    var h = '<h2>' + L('บันทึกเป็นเทมเพลตโปรเจกต์') + '</h2>';
    h += '<p class="opt-note" style="margin-top:0">' + L('เก็บเซกชัน ฟิลด์ (ฟิลด์จากคลังเก็บเป็นตัวอ้างอิง) อัตโนมัติ ฟอร์ม ชนิดงาน เทมเพลตงาน และงานพร้อมวันแบบนับจากวันเริ่ม ผู้รับผิดชอบกลายเป็นบทบาทที่เลือกคนตอนใช้') + '</p>';
    h += '<div class="field"><label>' + L('ชื่อเทมเพลต') + '</label><input id="ptsName" maxlength="120" value="' + esc(p.name) + '"></div>';
    h += '<div class="field"><label>' + L('คำอธิบาย') + '</label><input id="ptsDesc" maxlength="1000" value="' + esc(S.plainText(p.description || '').slice(0, 200)) + '"></div>';
    h += '<label class="chk"><input type="checkbox" id="ptsTasks" checked> ' + L('รวมงานและงานย่อย (วันนับจากวันแรกของโปรเจกต์)') + '</label>';
    h += '<label class="chk"><input type="checkbox" id="ptsSkip" checked> ' + L('นับวันแบบข้ามเสาร์-อาทิตย์') + '</label>';
    h += '<label class="chk"><input type="checkbox" id="ptsOrg" checked> ' + L('ทุกคนในองค์กรใช้ได้ (แก้ได้เฉพาะคุณ เพิ่มคนแก้ได้ทีหลัง)') + '</label>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-pt-save" data-project="' + esc(pid) + '">' + L('บันทึกเทมเพลต') + '</button></div>';
    return h;
  }

  function ptShareModal(id) {
    var x = S.projectTemplate(id);
    if (!x) return '';
    var d = ' data-id="' + esc(id) + '"';
    var h = '<h2>' + L('ใครใช้หรือแก้เทมเพลตนี้ได้') + '</h2><div class="pa-name">' + esc(x.icon) + ' ' + esc(x.name) + '</div>';
    h += '<label class="chk"><input type="checkbox" data-act="pt-org"' + d + (x.org ? ' checked' : '') + '> ' +
      L('ทุกคนในองค์กรใช้ได้') + '</label>';
    h += '<p class="opt-note">' + L('“แก้ได้” = เปลี่ยนชื่อ แชร์ และลบได้  “ใช้ได้” = สร้างโปรเจกต์จากเทมเพลตได้อย่างเดียว ผู้ดูแลระบบแก้ได้ทุกเทมเพลต') + '</p>';
    h += '<div class="pa-list">';
    var people = (x.editors || []).map(function (u) { return [u, 'edit']; }).concat((x.users || []).map(function (u) { return [u, 'use']; }));
    people.forEach(function (pp) {
      var u = S.user(pp[0]);
      if (!u) return;
      h += '<div class="pa-row">' + R.avatar(u) + '<div class="grow"><b>' + esc(u.name) + '</b><em>' + esc(u.email || '') + '</em></div>' +
        '<select class="opt-select" data-act="pt-acc"' + d + ' data-user="' + esc(u.id) + '">' +
        [['edit', L('แก้ได้')], ['use', L('ใช้ได้')], ['', L('เอาออก')]].map(function (o) {
          return '<option value="' + o[0] + '"' + (o[0] === pp[1] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
        }).join('') + '</select></div>';
    });
    h += '</div>';
    var have = {};
    people.forEach(function (pp) { have[pp[0]] = true; });
    var rest = S.db.users.filter(function (u) { return u.active !== false && !have[u.id]; });
    if (rest.length) {
      h += '<div class="flt-line" style="margin-top:12px"><select class="opt-select" id="ptsUser">' +
        rest.map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(u.name) + '</option>'; }).join('') + '</select>' +
        '<select class="opt-select" id="ptsLevel"><option value="use">' + L('ใช้ได้') + '</option><option value="edit">' + L('แก้ได้') + '</option></select>' +
        '<button class="btn btn-sm btn-primary" data-act="pt-acc-add"' + d + '>' + L('เพิ่ม') + '</button></div>';
    }
    h += '<div class="modal-acts"><button class="btn" data-act="np-tab" data-v="tpl">' + L('กลับไปแกลเลอรี') + '</button>' +
      '<button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  /* ---------- เทมเพลตงาน ---------- */

  function relText(r) {
    if (!r) return '';
    return L(r.unit === 'workdays' ? '{n} วันทำงานหลังสร้าง' : '{n} วันหลังสร้าง', { n: r.n });
  }

  function templatesModal(secId) {
    state.ttSec = secId || null;
    var pid = state.route.type === 'project' ? state.route.id : null;
    var p = pid ? S.project(pid) : null;
    var list = S.taskTemplatesFor(pid);
    var canStruct = S.can('structure') && (!pid || S.canInProject(pid, 'edit'));
    var h = '<h2>' + L('เทมเพลตงาน') + '</h2>';
    if (secId && p && S.section(pid, secId)) h += '<p class="opt-note" style="margin-top:0">' + esc(L('เพิ่มลงเซกชัน “{s}”', { s: S.section(pid, secId).name })) + '</p>';
    if (!list.length) {
      h += '<div class="au-empty">' + L('ยังไม่มีเทมเพลต — เปิดงานที่ต้องการ กดปุ่ม ⋯ แล้วเลือก “บันทึกเป็นเทมเพลต”') + '</div>';
    }
    [[pid, L('เฉพาะโปรเจกต์นี้')], ['*', L('ใช้ได้ทุกโปรเจกต์')]].forEach(function (g) {
      var rows = list.filter(function (x) { return x.scope === g[0]; });
      if (!rows.length || !g[0]) return;
      h += '<label class="opt-lbl">' + esc(g[1]) + '</label>';
      rows.forEach(function (x) {
        var tt = x.tpl.t || {}, d = ' data-id="' + esc(x.tpl.id) + '"';
        var meta = [L('{n} งานย่อย', { n: (tt.subs || []).length })];
        if (tt.due) meta.push(L('ครบกำหนด') + ' ' + relText(tt.due));
        if (tt.assignee && tt.assignee.mode === 'creator') meta.push(L('มอบให้คนสร้าง'));
        else if (tt.assignee && tt.assignee.mode === 'user' && S.user(tt.assignee.user)) meta.push(S.user(tt.assignee.user).name);
        h += '<div class="mini-row"><div class="grow"><div>' + esc(x.tpl.name) + '</div><div class="sub">' + esc(meta.join(' · ')) + '</div></div>' +
          (p ? '<button class="btn btn-sm btn-primary" data-act="use-template"' + d + (secId ? ' data-section="' + esc(secId) + '"' : '') + '>' + L('ใช้') + '</button>' : '') +
          (canStruct ? '<button class="btn btn-sm" data-act="tt-edit"' + d + '>' + L('แก้') + '</button>' +
            '<button class="btn btn-sm btn-danger" data-act="delete-template"' + d + '>' + L('ลบ') + '</button>' : '') + '</div>';
      });
    });
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  function ttSaveModal(taskId) {
    var t = S.task(taskId);
    if (!t) return '';
    var home = S.projectsOfTask(S.rootOf(t).id)[0];
    var h = '<h2>' + L('บันทึกเป็นเทมเพลตงาน') + '</h2>';
    h += '<div class="field"><label>' + L('ชื่อเทมเพลต') + '</label><input id="ttName" maxlength="120" value="' + esc(t.name) + '"></div>';
    h += '<label class="opt-lbl">' + L('ใช้ได้ที่') + '</label>';
    if (home) {
      h += '<label class="chk"><input type="radio" name="ttScope" value="' + esc(home.project.id) + '" checked> ' +
        esc(L('เฉพาะโปรเจกต์ “{p}”', { p: home.project.name })) + '</label>';
    }
    h += '<label class="chk"><input type="radio" name="ttScope" value="*"' + (home ? '' : ' checked') + '> ' + L('ทุกโปรเจกต์') + '</label>';
    h += '<p class="opt-note">' + L('เก็บชื่อ รายละเอียด ชนิด ผู้รับผิดชอบ ผู้ติดตาม แท็ก ค่าฟิลด์ งานย่อย และลำดับก่อนหลังระหว่างงานย่อย วันเก็บเป็น “N วันหลังสร้างงาน” แก้ได้ในหน้าถัดไป') + '</p>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-tt-save" data-id="' + esc(taskId) + '">' + L('บันทึกแล้วแก้ต่อ') + '</button></div>';
    return h;
  }

  function relInputs(path, r) {
    var on = !!r;
    return '<div class="flt-line"><label class="chk"><input type="checkbox" data-act="tte-rel" data-k="' + path + '"' + (on ? ' checked' : '') + '></label>' +
      (on ? '<input type="number" min="0" max="3650" class="opt-select flt-n" data-act="tte" data-k="' + path + '.n" data-t="num" value="' + esc(r.n) + '">' +
        auSel('tte', [['days', L('วัน')], ['workdays', L('วันทำงาน')]], r.unit, ' data-k="' + path + '.unit"') +
        '<span class="au-pre-l">' + L('หลังสร้างงาน') + '</span>' : '<span class="au-pre-l">' + L('ไม่ตั้ง') + '</span>') + '</div>';
  }

  function ttEditModal() {
    var e = state.tte, t = e.t;
    var pid = e.scope !== '*' ? e.scope : (state.route.type === 'project' ? state.route.id : null);
    var p = pid ? S.project(pid) : null;
    var h = '<h2>' + L('แก้เทมเพลตงาน') + '</h2>';
    h += '<div class="field"><label>' + L('ชื่อเทมเพลต') + '</label><input class="opt-select" data-act="tte" data-k="name" maxlength="120" value="' + esc(e.name) + '"></div>';
    h += '<div class="au-block"><div class="au-bh">' + L('งาน') + '</div><div class="au-params">' +
      '<input class="opt-select" data-act="tte" data-k="t.name" maxlength="300" value="' + esc(t.name) + '" placeholder="' + esc(L('ชื่องาน')) + '">' +
      '<textarea class="opt-select au-text" rows="3" data-act="tte" data-k="t.notes" placeholder="' + esc(L('รายละเอียด')) + '">' + esc(t.notes) + '</textarea>' +
      '<label class="opt-lbl">' + L('ชนิดงาน') + '</label>' +
      auSel('tte', S.typeChoices(pid).map(function (c) { return [c.id, c.icon + ' ' + (c.custom ? c.label : L(c.label))]; }), t.ctype || t.type, ' data-k="type"') +
      '<label class="opt-lbl">' + L('ผู้รับผิดชอบ') + '</label><div class="flt-line">' +
      auSel('tte', [['none', L('ยังไม่มอบหมาย')], ['creator', L('คนที่ใช้เทมเพลต')], ['user', L('คนที่เลือก')]], t.assignee.mode, ' data-k="t.assignee.mode"') +
      (t.assignee.mode === 'user' ? auSel('tte', auUsers(), t.assignee.user, ' data-k="t.assignee.user"') : '') + '</div>' +
      '<label class="opt-lbl">' + L('กำหนดส่ง') + '</label>' + relInputs('t.due', t.due) +
      (t.type !== 'milestone' ? '<label class="opt-lbl">' + L('วันเริ่ม') + '</label>' + relInputs('t.start', t.start) : '') +
      '<label class="opt-lbl">' + L('แท็ก (คั่นด้วยจุลภาค)') + '</label><input class="opt-select" data-act="tte" data-k="tags" value="' + esc(t.tags.join(', ')) + '">' +
      '<label class="opt-lbl">' + L('ผู้ติดตาม') + '</label><div class="flt-chips">' +
      S.db.users.filter(function (u) { return u.active !== false; }).map(function (u) {
        return '<button class="flt-chip' + (t.followers.indexOf(u.id) >= 0 ? ' on' : '') + '" data-act="tte-fol" data-v="' + esc(u.id) + '">' + esc(u.name) + '</button>';
      }).join('') + '</div>';
    var fs = ((p && p.fields) || []).filter(function (f) { return ['select', 'text', 'number', 'person'].indexOf(f.type) >= 0; });
    if (fs.length) {
      h += '<label class="opt-lbl">' + L('ค่าฟิลด์') + '</label>';
      fs.forEach(function (f) {
        var v = t.fields[f.id], d = ' data-act="tte-field" data-f="' + esc(f.id) + '"';
        h += '<div class="flt-line"><span class="ptu-role">' + esc(f.name) + '</span>';
        if (f.type === 'select') {
          h += '<select class="opt-select"' + d + '><option value="">—</option>' + f.options.map(function (o) {
            return '<option value="' + esc(o.name) + '"' + (v === o.name ? ' selected' : '') + '>' + esc(o.name) + '</option>';
          }).join('') + '</select>';
        } else if (f.type === 'person') {
          h += '<select class="opt-select"' + d + '><option value="">—</option>' + auUsers().map(function (u) {
            return '<option value="' + esc(u[0]) + '"' + (v === u[0] ? ' selected' : '') + '>' + esc(u[1]) + '</option>';
          }).join('') + '</select>';
        } else {
          h += '<input class="opt-select"' + d + (f.type === 'number' ? ' type="number" step="any"' : '') + ' value="' + esc(v == null ? '' : v) + '">';
        }
        h += '</div>';
      });
    }
    h += '</div></div>';
    h += '<div class="au-block"><div class="au-bh">' + L('งานย่อย') + '</div>';
    t.subs.forEach(function (s, i) {
      var d = ' data-i="' + i + '"';
      h += '<div class="au-act"><div class="flt-line"><span class="au-n">' + (i + 1) + '</span>' +
        '<input class="opt-select" data-act="tte-sub"' + d + ' data-k="name" maxlength="300" value="' + esc(s.name) + '">' +
        '<button class="flt-del" data-act="tte-sub-del"' + d + ' title="' + esc(L('ลบ')) + '">' + I('close', 13) + '</button></div>' +
        '<div class="flt-line">' + auSel('tte-sub', [['', L('ยังไม่มอบหมาย')]].concat(auUsers()), s.assignee || '', d + ' data-k="assignee"') +
        '<input type="number" min="0" max="3650" class="opt-select flt-n" data-act="tte-sub"' + d + ' data-k="due" value="' + esc(s.due ? s.due.n : '') +
          '" placeholder="—" title="' + esc(L('ครบกำหนด N วันหลังสร้าง (เว้นว่าง = ไม่ตั้ง)')) + '"><span class="au-pre-l">' + L('วัน') + '</span>' +
        (i > 0 ? auSel('tte-sub', [['', L('ไม่ต้องรองานอื่น')]].concat(t.subs.slice(0, i).map(function (o, j) {
          return [o.k, L('รอ “{t}”', { t: o.name || ('#' + (j + 1)) })];
        })), s.deps[0] || '', d + ' data-k="dep"') : '') + '</div></div>';
    });
    h += '<div class="opt-acts"><button class="btn btn-sm btn-ghost" data-act="tte-sub-add">' + I('plus', 13) + ' ' + L('เพิ่มงานย่อย') + '</button></div></div>';
    h += '<div class="modal-acts"><button class="btn" data-act="tte-back">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="tte-save">' + L('บันทึก') + '</button></div>';
    return h;
  }

  /** ช่องพิมพ์ของตัวแก้ 3b — อัปเดตสำเนาในหน้าจอโดยไม่วาดใหม่ (คืน true ถ้ารับไว้แล้ว) */
  function syncDraft3b(el) {
    var act = el.dataset.act, i = +el.dataset.i;
    if (act === 'ff-ans' && state.ff && (el.tagName === 'TEXTAREA' || el.type === 'text' || el.type === 'number' || !el.type)) {
      state.ff.ans[el.dataset.q] = el.value;
      return true;
    }
    if (state.sb) {
      if (act === 'sb-title') { state.sb.title = el.value; return true; }
      if (act === 'sb-text' && state.sb.blocks[i]) { state.sb.blocks[i].text = el.value; return true; }
      if (act === 'sb-btitle' && state.sb.blocks[i]) { state.sb.blocks[i].title = el.value; return true; }
    }
    if (state.fe && (act === 'fe-set' || act === 'fe-q') && (el.tagName === 'TEXTAREA' || el.type === 'text' || el.type === '')) {
      var k = el.dataset.k;
      if (act === 'fe-set') { state.fe.f[k] = el.value; return true; }
      var it = state.fe.f.items[i];
      if (!it) return true;
      if (k === 'opts') {
        it.opts = el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        if (it.opts.length) return true;
      } else it[k] = el.value;
      return true;
    }
    if (state.te && state.te.ty && (act === 'te-set' || act === 'te-st') && el.type === 'text') {
      if (act === 'te-set') state.te.ty[el.dataset.k] = el.value;
      else if (state.te.ty.statuses[i]) state.te.ty.statuses[i].name = el.value;
      return true;
    }
    if (state.tte && (el.type === 'text' || el.tagName === 'TEXTAREA' || (el.type === 'number' && act !== 'tte-sub'))) {
      if (act === 'tte') {
        if (el.dataset.k === 'name') state.tte.name = el.value;
        else if (el.dataset.k === 'tags') state.tte.t.tags = el.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        else auSet(state.tte, el.dataset.k, auVal(el));
        return true;
      }
      if (act === 'tte-sub' && state.tte.t.subs[i]) { state.tte.t.subs[i][el.dataset.k] = el.value; return true; }
      if (act === 'tte-field') { state.tte.t.fields[el.dataset.f] = el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value; return true; }
    }
    return false;
  }

  /* ======================================================================
   * 3a — อัตโนมัติ
   *
   * รายการ (เปิด/ปิด ทำสำเนา ลบ) และประวัติการรันอยู่ในหน้าต่างเดียว ตัวแก้ไขเป็นสำเนาในหน้าจอ
   * (state.auto.edit) จนกว่าจะกดบันทึก ช่องเงื่อนไขใช้ fltValueHtml ชุดเดียวกับตัวกรองของโปรเจกต์
   * ทริกเกอร์/การกระทำใหม่ (3b) เพิ่มช่องตั้งค่าใน autoTrigParams / autoActParams / AUTO_ACT_DEFAULT
   * ====================================================================== */

  function trigDefOf(id) { return S.AUTO_TRIGGERS.filter(function (x) { return x.id === id; })[0] || null; }
  function actDefOf(id) { return S.AUTO_ACTIONS.filter(function (x) { return x.id === id; })[0] || null; }
  function auSecName(pid, sid) { var s = S.section(pid, sid); return s ? s.name : L('(เซกชันถูกลบ)'); }
  function auUserName(id) { var u = S.user(id); return u ? u.name : L('(ไม่พบคน)'); }
  function auFieldOf(pid, fid) {
    var p = S.project(pid);
    return ((p && p.fields) || []).filter(function (f) { return f.id === fid; })[0] || null;
  }
  var AU_FREQ = [['daily', 'ทุกวัน'], ['weekly', 'ทุกสัปดาห์'], ['monthly', 'ทุกเดือน']];
  var AU_VARS_USER = [['creator', 'คนสร้างงาน'], ['triggerer', 'คนที่ทำให้อัตโนมัติทำงาน'], ['assignee', 'ผู้รับผิดชอบเดิม']];
  var AU_VAR_LABEL = { task: 'ชื่องาน', link: 'ลิงก์งาน', assignee: 'ผู้รับผิดชอบ', creator: 'คนสร้าง',
    triggerer: 'คนที่ทำให้ทำงาน', due: 'กำหนดส่ง', start: 'วันเริ่ม', created: 'วันที่สร้าง',
    project: 'โปรเจกต์', section: 'เซกชัน' };

  /** ทริกเกอร์เป็นประโยคเดียว */
  function trigText(pid, tr) {
    var dd = trigDefOf(tr.type);
    switch (tr.type) {
      case 'moved': return tr.sec ? L('ย้ายเข้า “{s}”', { s: auSecName(pid, tr.sec) }) : L('ย้ายเซกชัน');
      case 'completed': return tr.v === false ? L('งานถูกเปิดใหม่') : L('งานทำเสร็จ');
      case 'assignee':
        return !tr.user ? L('ผู้รับผิดชอบเปลี่ยน') : tr.user === '@none' ? L('เอาผู้รับผิดชอบออก')
          : L('มอบหมายให้ {u}', { u: auUserName(tr.user) });
      case 'due': return tr.mode === 'set' ? L('ตั้งกำหนดส่ง') : tr.mode === 'cleared' ? L('ลบกำหนดส่ง') : L('กำหนดส่งเปลี่ยน');
      case 'start': return tr.mode === 'set' ? L('ตั้งวันเริ่ม') : tr.mode === 'cleared' ? L('ลบวันเริ่ม') : L('วันเริ่มเปลี่ยน');
      case 'field': {
        var f = auFieldOf(pid, tr.field);
        var fv = tr.val ? (f && f.type === 'person' ? auUserName(tr.val) : tr.val) : '';
        return f ? (fv ? L('{f} เป็น “{v}”', { f: f.name, v: fv }) : L('{f} เปลี่ยน', { f: f.name })) : L('(ฟิลด์ถูกลบ)');
      }
      case 'approval': {
        var st = S.APPROVAL_STATES.filter(function (x) { return x.id === tr.v; })[0];
        return st ? L('สถานะอนุมัติเป็น “{s}”', { s: L(st.label) }) : L('สถานะอนุมัติเปลี่ยน');
      }
      case 'approaching': return L('อีก {n} วันครบกำหนด', { n: tr.days == null ? 1 : tr.days });
      case 'overdue':
        return +tr.n ? L('เลยกำหนด {n} {u}', { n: tr.n, u: tr.unit === 'hours' ? L('ชั่วโมง') : L('วัน') }) : L('เลยกำหนด');
      case 'manual': return L('กดรันเอง') + (tr.label ? ': ' + tr.label : '');
      case 'timelog':
        return (+tr.min ? L('บันทึกเวลาอย่างน้อย {n} นาที', { n: +tr.min }) : L('บันทึกเวลา')) +
          (tr.bill === 'yes' ? ' · ' + L('เก็บเงินได้') : tr.bill === 'no' ? ' · ' + L('ไม่เก็บเงิน') : '');
      case 'form': {
        var tfm = tr.form ? S.formById(tr.form) : null;
        return tr.form ? L('ส่งฟอร์ม “{f}”', { f: tfm ? tfm.f.name : L('(ฟอร์มถูกลบ)') }) : L('มีคนส่งฟอร์ม');
      }
      case 'cstatus': {
        var tsd = tr.v ? S.statusDef(tr.v) : null, tty = tr.ctype ? S.typeDef(tr.ctype) : null;
        if (tr.v) return tsd ? L('สถานะเป็น “{s}”', { s: tsd.st.name }) : L('(สถานะถูกลบ)');
        return tty ? L('สถานะของ {t} เปลี่ยน', { t: tty.name }) : L('สถานะของชนิดงานเปลี่ยน');
      }
      case 'scheduled': {
        var fq = tr.freq || 'daily';
        if (fq === 'weekly') return L('ทุกวัน{d}', { d: global.I18N.dowFull()[+tr.day || 0] });
        if (fq === 'monthly') return L('ทุกวันที่ {d} ของเดือน', { d: tr.day || 1 });
        return L('ทุกวัน');
      }
    }
    return dd ? L(dd.label) : tr.type;
  }

  function dateSpecText(s) {
    var n = +s.n || 0;
    var u = s.unit === 'workdays' ? L('วันทำงาน') : L('วัน');
    var from = { trigger: L('วันที่ทำงาน'), created: L('วันที่สร้าง'), due: L('กำหนดส่ง'), start: L('วันเริ่ม') }[s.from || 'trigger'] || L('ฟิลด์วันที่');
    if (!n) return from;
    return L(s.dir === 'before' ? '{n} {u} ก่อน{f}' : '{n} {u} หลัง{f}', { n: n, u: u, f: from });
  }

  function userSpecText(s) {
    if (s.mode === 'none') return L('ไม่มีผู้รับผิดชอบ');
    if (s.mode === 'rr') return L('หมุนเวียน {n} คน', { n: (s.list || []).length });
    if (s.mode === 'var') {
      var v = (AU_VARS_USER.filter(function (x) { return x[0] === s['var']; })[0] || [])[1];
      return v ? L(v) : L('คนจากฟิลด์');
    }
    return auUserName(s.user);
  }

  /** การกระทำเป็นวลีสั้น */
  function actText(pid, a) {
    switch (a.type) {
      case 'section': return L('ย้ายไป “{s}”', { s: auSecName(pid, a.sec) });
      case 'complete': return a.v === false ? L('เปิดงานใหม่') : L('ทำเครื่องหมายเสร็จ');
      case 'assign': return L('มอบหมายให้') + ' ' + userSpecText(a);
      case 'due': return a.mode === 'clear' ? L('ลบกำหนดส่ง') : L('กำหนดส่ง = {d}', { d: dateSpecText(a) });
      case 'start': return a.mode === 'clear' ? L('ลบวันเริ่ม') : L('วันเริ่ม = {d}', { d: dateSpecText(a) });
      case 'field': { var f = auFieldOf(pid, a.field); return L('ตั้ง {f}', { f: f ? f.name : '?' }); }
      case 'comment': return L('เพิ่มความเห็น');
      case 'followers': return L('เพิ่มผู้ติดตาม');
      case 'tag': return L('เพิ่มแท็ก {t}', { t: a.tag || '' });
      case 'untag': return L('เอาแท็ก {t} ออก', { t: a.tag || '' });
      case 'priority': return L('ความสำคัญ = {p}', { p: L(R.prio(a.v).label) });
      case 'create':
        return a.kind === 'task' ? L('สร้างงาน') : a.kind === 'approval' ? L('สร้างงานย่อยขออนุมัติ') : L('สร้างงานย่อย');
      case 'addproj': { var q = S.project(a.pid); return L('เพิ่มเข้า {p}', { p: q ? q.name : '?' }); }
      case 'setstatus': { var asd = S.statusDef(a.v); return asd ? L('ตั้งสถานะเป็น “{s}”', { s: asd.st.name }) : L('(สถานะถูกลบ)'); }
      case 'mtmove': { var ms = S.mtSection(a.sec); return L('ย้ายไป “{s}”', { s: ms ? (ms.id === S.MT_RECENT ? recentLabel() : L(ms.name)) : L('(เซกชันถูกลบ)') }); }
    }
    var d = actDefOf(a.type);
    return d ? L(d.label) : a.type;
  }

  function autoTitle(pid, a) {
    if (a.name) return a.name;
    var acts = [];
    (a.paths || []).forEach(function (pt) { acts = acts.concat(pt.acts || []); });
    var first = acts[0] ? actText(pid, acts[0]) : L('ยังไม่มีการกระทำ');
    return trigText(pid, a.trigger) + ' → ' + first + (acts.length > 1 ? ' +' + (acts.length - 1) : '');
  }

  /* ---------- รายการ + ประวัติ ---------- */

  function openAuto(pid, opts) {
    opts = opts || {};
    state.auto = { pid: pid, tab: opts.tab || 'list', sec: opts.sec || null, edit: null };
    openModal(autoModalHtml(), true);
  }

  function autoModalHtml() {
    var st = state.auto;
    if (!st || !st.pid) return '';
    if (st.pid === '@me') return mtAutoModal();
    return st.edit ? autoEditModal() : autoListModal();
  }

  /** โปรเจกต์ปลายทางของ "เพิ่มเข้าโปรเจกต์อื่น" ที่เปิดให้ทั้งองค์กร — เฉพาะเมื่อกฎอยู่ในโปรเจกต์ปิด */
  function autoOrgTargets(pid, a) {
    var p = S.project(pid);
    if (!p || p.visibility !== 'private') return [];
    var out = [];
    (a.paths || []).reduce(function (acc, pt) { return acc.concat(pt.acts || []); }, []).concat(a.els || [])
      .forEach(function (x) {
        var q = x && x.type === 'addproj' ? S.project(x.pid) : null;
        if (q && q.id !== pid && q.visibility !== 'private' && out.indexOf(q) < 0) out.push(q);
      });
    return out;
  }

  /** คนที่อัตโนมัตินี้จะมอบงาน สร้างงานให้ หรือเพิ่มเป็นผู้ติดตาม แบบระบุชื่อตายตัว (รวมรายการหมุนเวียน)
   *  ใช้เตือนตอนบันทึกถ้าคนเหล่านั้นไม่ได้เป็นสมาชิกโปรเจกต์ปิด — ตัวแปร (คนสร้างงาน ฯลฯ) รู้ตอนรันเท่านั้น */
  function autoPeople(a) {
    var out = [], acts = [];
    function spec(s) {
      if (!s) return;
      var m = s.mode || 'user';
      if (m === 'user' && s.user) out.push(s.user);
      else if (m === 'rr') out = out.concat(s.list || []);
    }
    (a.paths || []).forEach(function (pt) { acts = acts.concat(pt.acts || []); });
    acts.concat(a.els || []).forEach(function (x) {
      if (!x) return;
      if (x.type === 'assign') spec(x);
      else if (x.type === 'create') spec(x.assign);
      else if (x.type === 'followers') out = out.concat(x.users || []);
    });
    return out.filter(Boolean);
  }

  /** วาดหน้าต่างอัตโนมัติใหม่โดยไม่เลื่อนกลับขึ้นบนและไม่ย้ายโฟกัส */
  function refreshAuto() {
    if (!state.auto || !$mdBack.classList.contains('open')) return;
    var top = $modal.scrollTop;
    $modal.innerHTML = autoModalHtml();
    $modal.scrollTop = top;
  }

  /* Sprint 1A — เขียนเป็นภาษาคนใช้ (เดิม "ไม่มีเซิร์ฟเวอร์คอยปลุก") */
  var AU_TIME_NOTE = 'อัตโนมัติตามเวลา (ใกล้ครบกำหนด เลยกำหนด ตามกำหนดเวลา) ทำงานเมื่อมีคนเปิด Orbit อยู่ ตรวจทุก 5 นาที ถ้าช่วงนั้นไม่มีใครเปิด จะทำตามหลังทันทีที่มีคนเปิด และแต่ละรอบทำครั้งเดียวแม้หลายคนเปิดพร้อมกัน';

  function autoListModal() {
    var st = state.auto, pid = st.pid, p = S.project(pid);
    if (!p) return '';
    var canEdit = S.canEditAutos(pid);
    var all = S.automations(pid);
    var h = '<h2 class="au-h">' + I('bolt', 17) + ' ' + L('ระบบอัตโนมัติ') + ' — ' + esc(p.name) + '</h2>';
    h += '<div class="au-tabs">' +
      '<button class="' + (st.tab === 'list' ? 'on' : '') + '" data-act="auto-tab" data-v="list">' +
        L('รายการ') + ' <span>' + all.length + '</span></button>' +
      '<button class="' + (st.tab === 'runs' ? 'on' : '') + '" data-act="auto-tab" data-v="runs">' +
        L('ประวัติการรัน') + ' <span>' + S.autoRuns(pid).length + '</span></button></div>';
    if (st.tab === 'runs') {
      h += autoRunsHtml(pid);
    } else {
      var list = st.sec ? all.filter(function (a) { return a.trigger.type === 'moved' && a.trigger.sec === st.sec; }) : all;
      if (st.sec) {
        h += '<div class="au-filter">' + I('filter', 12) + ' ' + L('เฉพาะที่ทำงานเมื่อย้ายเข้า “{s}”', { s: esc(auSecName(pid, st.sec)) }) +
          ' <button class="as-link" data-act="auto-sec-clear">' + L('ดูทั้งหมด') + '</button></div>';
      }
      if (!list.length) {
        h += '<p class="au-empty">' + (canEdit
          ? L('ยังไม่มีอัตโนมัติ กด “สร้างอัตโนมัติ” แล้วเลือกว่าเมื่อเกิดอะไรขึ้น ให้ทำอะไรต่อ เช่น ย้ายเข้า “เสร็จแล้ว” → ทำเครื่องหมายเสร็จ')
          : L('ยังไม่มีอัตโนมัติในโปรเจกต์นี้')) + '</p>';
      }
      h += '<div class="au-list">';
      list.forEach(function (a) {
        var td = trigDefOf(a.trigger.type) || {};
        var nActs = 0;
        a.paths.forEach(function (pt) { nActs += pt.acts.length; });
        if (a.els) nActs += a.els.length;
        var meta = [L(td.label || a.trigger.type)];
        if (a.paths.length > 1 || a.els) meta.push(L('{n} เส้นทาง', { n: a.paths.length + (a.els ? 1 : 0) }));
        meta.push(L('{n} การกระทำ', { n: nActs }));
        if (a.chain) meta.push(L('รับต่อจากอัตโนมัติอื่น'));
        if (td.time) meta.push(L('ตามเวลา'));
        h += '<div class="au-row' + (a.on ? '' : ' off') + '">' +
          '<button class="switch' + (a.on ? ' on' : '') + '" data-act="auto-toggle" data-auto="' + esc(a.id) + '" role="switch" aria-checked="' +
            (a.on ? 'true' : 'false') + '" title="' + esc(a.on ? L('ปิดอัตโนมัตินี้') : L('เปิดอัตโนมัตินี้')) + '"' + (canEdit ? '' : ' disabled') + '><i></i></button>' +
          '<div class="grow"><b>' + esc(autoTitle(pid, a)) + '</b><div class="sub">' + esc(meta.join(' · ')) + '</div></div>' +
          '<span class="au-row-acts">' +
          (canEdit ? '<button class="btn btn-sm btn-ghost" data-act="auto-edit" data-auto="' + esc(a.id) + '" title="' + esc(L('แก้ไข')) + '">' + I('pencil', 13) + '</button>' +
            '<button class="btn btn-sm btn-ghost" data-act="auto-dup" data-auto="' + esc(a.id) + '" title="' + esc(L('ทำสำเนา')) + '">' + I('copy', 13) + '</button>' +
            '<button class="btn btn-sm btn-ghost btn-danger" data-act="auto-del" data-auto="' + esc(a.id) + '" title="' + esc(L('ลบ')) + '">' + I('trash', 13) + '</button>'
            : '') + '</span></div>';
      });
      h += '</div>';
      if (canEdit) {
        h += '<div class="opt-acts"><button class="btn btn-sm btn-primary" data-act="auto-new"' +
          (st.sec ? ' data-section="' + esc(st.sec) + '"' : '') + '>' + I('plus', 13) + ' ' + L('สร้างอัตโนมัติ') + '</button></div>';
      } else {
        h += '<p class="opt-note">' + L('คุณดูได้อย่างเดียว คนที่แก้โปรเจกต์ได้เป็นคนสร้างและแก้อัตโนมัติ แต่สิ่งที่คุณทำกับงาน (เช่น แสดงความเห็น) ยังปลุกอัตโนมัติได้ และกดรันอัตโนมัติแบบ “กดรันเอง” ได้จากเมนูของงาน') + '</p>';
      }
    }
    h += '<p class="opt-note au-note">' + I('alert', 12) + ' ' + L(AU_TIME_NOTE) + '</p>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  function autoRunsHtml(pid, limit) {
    var runs = S.autoRuns(pid).slice(0, limit || 200);
    if (!runs.length) return '<p class="au-empty">' + L('ยังไม่มีการรัน') + '</p>';
    var LBL = { ok: ['สำเร็จ', 'ok'], err: ['ผิดพลาด', 'err'], loop: ['หยุดกันวน', 'warn'] };
    var h = '<div class="au-runs">';
    runs.forEach(function (r) {
      var a = pid === '@me' ? null : S.automation(pid, r.a);
      var nm = a ? autoTitle(pid, a) : (r.an || L('(อัตโนมัติถูกลบ)'));
      var lb = LBL[r.s] || LBL.ok;
      var by = S.user(r.by);
      var tk = r.t && S.task(r.t);
      h += '<div class="au-run"><span class="au-pill ' + lb[1] + '">' + L(lb[0]) + '</span><div class="grow">' +
        '<div class="au-run-t"><b>' + esc(nm) + '</b>' +
        (r.t ? ' · ' + (tk ? '<button class="as-link" data-act="open-task" data-id="' + esc(r.t) + '">' + esc(tk.name) + '</button>'
          : '<span class="au-gone">' + esc(r.tn || '') + ' ' + L('(ลบแล้ว)') + '</span>') : '') + '</div>' +
        '<div class="sub">' + esc(R.fmtExact(r.at)) +
        (by ? ' · ' + esc(by.name) : '') + ' · ' + L('{n} การกระทำ', { n: r.n || 0 }) +
        (r.p === -1 ? ' · ' + L('เส้นทาง “อื่น ๆ”') : r.p > 0 ? ' · ' + L('เส้นทาง {n}', { n: r.p + 1 }) : '') + '</div>' +
        (r.e ? '<div class="au-err">' + esc(L(r.e, r.ep || undefined)) + '</div>' : '') +
        '</div></div>';
    });
    return h + '</div>';
  }

  /* ---------- ตัวแก้ไข ---------- */

  var AUTO_ACT_DEFAULT = {
    section:   function (pid) { var p = S.project(pid); return { sec: p && p.sections[0] ? p.sections[0].id : '' }; },
    complete:  function () { return { v: true }; },
    assign:    function () { return { mode: 'user', user: S.db.currentUserId }; },
    due:       function () { return { mode: 'rel', n: 3, unit: 'workdays', dir: 'after', from: 'trigger' }; },
    start:     function () { return { mode: 'rel', n: 0, unit: 'days', dir: 'after', from: 'trigger' }; },
    field:     function (pid) {
      var f = ((S.project(pid) || {}).fields || []).filter(function (x) { return x.type !== 'id'; })[0];
      return { field: f ? f.id : '', value: f && f.type === 'multi' ? [] : '' };
    },
    comment:   function () { return { text: '' }; },
    followers: function () { return { users: [], vars: [] }; },
    tag:       function () { return { tag: '' }; },
    untag:     function () { return { tag: '' }; },
    priority:  function () { return { v: 'high' }; },
    create:    function () {
      return { kind: 'subtask', name: '', notes: '', sec: '', assign: { mode: 'none' },
               due: { on: false, n: 1, unit: 'workdays', dir: 'after', from: 'trigger' } };
    },
    addproj:   function () { return { pid: '', sec: '' }; },
    mtmove:    function () { return { sec: 'today' }; },
    setstatus: function (pid) { var o = auStatusOpts(pid)[0]; return { v: o ? o[0] : '' }; }
  };

  function autoNewAct(pid, type) {
    var mk = AUTO_ACT_DEFAULT[type];
    var a = mk ? mk(pid) : {};
    a.type = type;
    return a;
  }

  function autoNewTrig(pid, type, sec) {
    var tr = { type: type };
    if (type === 'moved') tr.sec = sec || '';
    if (type === 'completed') tr.v = true;
    if (type === 'approaching') tr.days = 1;
    if (type === 'overdue') { tr.n = 0; tr.unit = 'days'; }
    if (type === 'manual') tr.label = '';
    if (type === 'form') tr.form = '';
    if (type === 'cstatus') { tr.ctype = ''; tr.v = ''; }
    if (type === 'timelog') { tr.min = 0; tr.bill = ''; }
    if (type === 'scheduled') { tr.freq = 'weekly'; tr.day = 1; tr.scope = 'once'; }
    if (type === 'due' || type === 'start') tr.mode = 'any';
    if (type === 'field') {
      var f = ((S.project(pid) || {}).fields || []).filter(function (x) { return x.type !== 'id'; })[0];
      tr.field = f ? f.id : ''; tr.val = '';
    }
    return tr;
  }

  function autoEditStart(pid, a, isNew) {
    state.auto.edit = { pid: pid, a: S.clone(a), isNew: !!isNew };
    refreshAuto();
  }

  function auSel(act, options, cur, d) { return optSelect(act, options, cur == null ? '' : String(cur), d); }
  function auUsers(withNone) {
    return S.db.users.filter(function (u) { return u.active !== false; })
      .map(function (u) { return [u.id, u.name + (S.isAway(u.id) ? ' · ' + L('ไม่อยู่') : '')]; });
  }
  function auSecOpts(pid, anyLabel) {
    var p = S.project(pid);
    var out = anyLabel ? [['', anyLabel]] : [];
    return out.concat(((p && p.sections) || []).map(function (s) { return [s.id, s.name]; }));
  }
  /** สถานะของชนิดงานในโปรเจกต์ [[id, "ชนิด · สถานะ"]] (ระบุ ctype = เฉพาะชนิดนั้น) */
  function auStatusOpts(pid, ctype) {
    var out = [];
    S.projectTypes(pid).forEach(function (ty) {
      if (ctype && ty.id !== ctype) return;
      ty.statuses.forEach(function (s) { out.push([s.id, ty.name + ' · ' + s.name + (s.done ? ' ✓' : '')]); });
    });
    return out;
  }
  function auDateFields(pid) {
    var p = S.project(pid);
    return ((p && p.fields) || []).filter(function (f) { return f.type === 'date'; });
  }

  /** ช่องของทริกเกอร์ (data-act="ae-tp" data-k) */
  function autoTrigParams(pid, tr) {
    var d = function (k) { return ' data-k="' + k + '"'; };
    var p = S.project(pid);
    switch (tr.type) {
      case 'moved': return auSel('ae-tp', auSecOpts(pid, L('เซกชันใดก็ได้')), tr.sec, d('sec'));
      case 'completed': return auSel('ae-tp', [['1', L('ทำเสร็จ')], ['0', L('เปิดใหม่')]], tr.v === false ? '0' : '1', d('v') + ' data-t="bool"');
      case 'assignee':
        return auSel('ae-tp', [['', L('เปลี่ยนเป็นใครก็ได้')], ['@none', L('ไม่มีผู้รับผิดชอบ')]].concat(auUsers()), tr.user, d('user'));
      case 'due': case 'start':
        return auSel('ae-tp', [['any', L('เปลี่ยนแบบใดก็ได้')], ['set', L('ถูกตั้งหรือเลื่อน')], ['cleared', L('ถูกลบ')]], tr.mode || 'any', d('mode'));
      case 'field': {
        var fs = ((p && p.fields) || []).filter(function (f) { return f.type !== 'id'; });
        if (!fs.length) return '<div class="flt-none">' + L('โปรเจกต์นี้ยังไม่มีฟิลด์') + '</div>';
        var f = auFieldOf(pid, tr.field) || fs[0];
        var h = auSel('ae-tp', fs.map(function (x) { return [x.id, x.name]; }), f.id, d('field'));
        if (f.type === 'select' || f.type === 'multi') {
          h += auSel('ae-tp', [['', L('ค่าใดก็ได้')]].concat((f.options || []).map(function (o) { return [o.name, o.name]; })), tr.val, d('val'));
        } else if (f.type === 'person') {
          h += auSel('ae-tp', [['', L('ใครก็ได้')]].concat(auUsers()), tr.val, d('val'));
        }
        return h;
      }
      case 'approval':
        return auSel('ae-tp', [['', L('สถานะใดก็ได้')]].concat(S.APPROVAL_STATES.map(function (x) { return [x.id, L(x.label)]; })), tr.v, d('v'));
      case 'approaching':
        return '<div class="flt-val">' + L('ก่อนครบกำหนด') + ' <input type="number" min="0" max="365" class="opt-select flt-n" data-act="ae-tp"' +
          d('days') + ' data-t="num" value="' + esc(tr.days == null ? 1 : tr.days) + '"> ' + L('วัน') + '</div>';
      case 'overdue':
        return '<div class="flt-val">' + L('เลยกำหนดไป') + ' <input type="number" min="0" max="8760" class="opt-select flt-n" data-act="ae-tp"' +
          d('n') + ' data-t="num" value="' + esc(tr.n || 0) + '">' +
          auSel('ae-tp', [['days', L('วัน')], ['hours', L('ชั่วโมง')]], tr.unit || 'days', d('unit')) + '</div>';
      case 'manual':
        return '<input class="opt-select" data-act="ae-tp"' + d('label') + ' maxlength="60" value="' + esc(tr.label || '') +
          '" placeholder="' + esc(L('ชื่อปุ่ม เช่น ส่งตรวจ')) + '">';
      /* 3b — ฟอร์ม และสถานะของชนิดงานกำหนดเอง */
      case 'timelog':
        return '<div class="flt-val">' + L('อย่างน้อย') + ' <input type="number" min="0" max="1440" class="opt-select flt-n" data-act="ae-tp"' +
          d('min') + ' data-t="num" value="' + esc(tr.min || 0) + '"> ' + L('นาที') + '</div>' +
          auSel('ae-tp', [['', L('เก็บเงินได้หรือไม่ก็ได้')], ['yes', L('เฉพาะเวลาที่เก็บเงินได้')], ['no', L('เฉพาะเวลาที่ไม่เก็บเงิน')]], tr.bill || '', d('bill'));
      case 'form':
        return auSel('ae-tp', [['', L('ฟอร์มใดก็ได้ของโปรเจกต์นี้')]].concat(((p && p.forms) || []).map(function (f) { return [f.id, f.name]; })), tr.form, d('form'));
      case 'cstatus': {
        var tys = S.projectTypes(pid);
        if (!tys.length) return '<div class="flt-none">' + L('โปรเจกต์นี้ยังไม่มีชนิดงานกำหนดเอง') + '</div>';
        return auSel('ae-tp', [['', L('ชนิดใดก็ได้')]].concat(tys.map(function (ty) { return [ty.id, ty.icon + ' ' + ty.name]; })), tr.ctype, d('ctype')) +
          auSel('ae-tp', [['', L('เปลี่ยนเป็นสถานะใดก็ได้')]].concat(auStatusOpts(pid, tr.ctype)), tr.v, d('v'));
      }
      case 'scheduled': {
        var h2 = auSel('ae-tp', AU_FREQ.map(function (x) { return [x[0], L(x[1])]; }), tr.freq || 'daily', d('freq'));
        if (tr.freq === 'weekly') {
          h2 += auSel('ae-tp', global.I18N.dowFull().map(function (n, i) { return [String(i), n]; }), String(+tr.day || 0), d('day') + ' data-t="num"');
        } else if (tr.freq === 'monthly') {
          var days = []; for (var i = 1; i <= 31; i++) days.push([String(i), L('วันที่ {d}', { d: i })]);
          h2 += auSel('ae-tp', days, String(+tr.day || 1), d('day') + ' data-t="num"');
        }
        h2 += auSel('ae-tp', [['once', L('ทำครั้งเดียว (เช่น สร้างงาน)')], ['tasks', L('ทำกับทุกงานที่ยังไม่เสร็จที่ตรงเงื่อนไข')]], tr.scope || 'once', d('scope'));
        return h2;
      }
    }
    return '';
  }

  /** ช่องคน: โหมด + คน/ตัวแปร/รายการหมุนเวียน  pre = คำนำหน้าคีย์ (เช่น 'assign.') */
  function auUserSpec(pid, s, d, pre, allowRR) {
    pre = pre || '';
    var modes = [['user', L('คนที่เลือก')], ['var', L('จากงาน')]];
    if (allowRR) modes.push(['rr', L('หมุนเวียนในรายชื่อ')]);
    modes.push(['none', L('ไม่มีผู้รับผิดชอบ')]);
    var mode = s.mode || 'user';
    var h = '<div class="flt-line">' + auSel('ae-ap', modes, mode, d + ' data-k="' + pre + 'mode"');
    if (mode === 'user') h += auSel('ae-ap', auUsers(), s.user, d + ' data-k="' + pre + 'user"');
    if (mode === 'var') {
      var vars = AU_VARS_USER.map(function (x) { return [x[0], L(x[1])]; });
      ((S.project(pid) || {}).fields || []).forEach(function (f) { if (f.type === 'person') vars.push(['field:' + f.id, f.name]); });
      h += auSel('ae-ap', vars, s['var'] || 'creator', d + ' data-k="' + pre + 'var"');
    }
    h += '</div>';
    if (mode === 'rr') {
      var cur = s.list || [];
      h += '<div class="flt-chips">' + S.db.users.filter(function (u) { return u.active !== false; }).map(function (u) {
        var on = cur.indexOf(u.id) >= 0;
        return '<button class="flt-chip' + (on ? ' on' : '') + '" data-act="ae-ap-chip"' + d + ' data-k="' + pre + 'list" data-v="' + esc(u.id) + '">' +
          esc(u.name) + (S.isAway(u.id) ? ' <em class="au-away">' + L('ไม่อยู่') + '</em>' : '') + '</button>';
      }).join('') + '</div><div class="opt-note au-hint">' + L('แจกงานวนไปตามลำดับ ข้ามคนที่ตั้งสถานะไม่อยู่ครอบวันนี้') + '</div>';
    }
    return h;
  }

  /** ช่องวันแบบสัมพัทธ์: N วัน/วันทำงาน ก่อน/หลัง วันตั้งต้น */
  function auDateSpec(pid, s, d, pre) {
    pre = pre || '';
    var froms = [['trigger', L('วันที่อัตโนมัติทำงาน')], ['created', L('วันที่สร้างงาน')], ['due', L('กำหนดส่ง')], ['start', L('วันเริ่ม')]];
    auDateFields(pid).forEach(function (f) { froms.push(['field:' + f.id, f.name]); });
    return '<div class="flt-val au-date"><input type="number" min="0" max="3650" class="opt-select flt-n" data-act="ae-ap"' + d +
      ' data-k="' + pre + 'n" data-t="num" value="' + esc(s.n || 0) + '">' +
      auSel('ae-ap', [['days', L('วัน')], ['workdays', L('วันทำงาน')]], s.unit || 'days', d + ' data-k="' + pre + 'unit"') +
      auSel('ae-ap', [['after', L('หลัง')], ['before', L('ก่อน')]], s.dir || 'after', d + ' data-k="' + pre + 'dir"') +
      auSel('ae-ap', froms, s.from || 'trigger', d + ' data-k="' + pre + 'from"') + '</div>';
  }

  /** ปุ่มแทรกตัวแปรลงช่องข้อความ */
  function auVarChips(pid, d, k) {
    var h = '<div class="au-vars"><span>' + L('ตัวแปร') + '</span>';
    S.AUTO_VARS.forEach(function (v) {
      h += '<button class="flt-chip" data-act="ae-var"' + d + ' data-k="' + k + '" data-v="{' + v + '}" title="{' + v + '}">' +
        esc(L(AU_VAR_LABEL[v] || v)) + '</button>';
    });
    ((S.project(pid) || {}).fields || []).forEach(function (f) {
      h += '<button class="flt-chip" data-act="ae-var"' + d + ' data-k="' + k + '" data-v="{field:' + esc(f.name) + '}">' + esc(f.name) + '</button>';
    });
    return h + '</div>';
  }

  /** ช่องของการกระทำ (data-act="ae-ap" data-k) */
  function autoActParams(pid, a, d) {
    var p = S.project(pid);
    var k = function (key) { return d + ' data-k="' + key + '"'; };
    switch (a.type) {
      case 'section': return auSel('ae-ap', auSecOpts(pid), a.sec, k('sec'));
      case 'complete': return auSel('ae-ap', [['1', L('ทำเครื่องหมายเสร็จ')], ['0', L('เปิดงานใหม่')]], a.v === false ? '0' : '1', k('v') + ' data-t="bool"');
      case 'assign': return auUserSpec(pid, a, d, '', true);
      case 'due': case 'start':
        return auSel('ae-ap', [['rel', L('นับจากวัน')], ['clear', L('ลบวันออก')]], a.mode || 'rel', k('mode')) +
          (a.mode === 'clear' ? '' : auDateSpec(pid, a, d, ''));
      case 'field': {
        var fs = ((p && p.fields) || []).filter(function (f) { return f.type !== 'id'; });
        if (!fs.length) return '<div class="flt-none">' + L('โปรเจกต์นี้ยังไม่มีฟิลด์') + '</div>';
        var f = auFieldOf(pid, a.field) || fs[0];
        var h = auSel('ae-ap', fs.map(function (x) { return [x.id, x.name]; }), f.id, k('field'));
        if (f.type === 'select') {
          h += auSel('ae-ap', [['', L('(ล้างค่า)')]].concat((f.options || []).map(function (o) { return [o.name, o.name]; })), a.value, k('value'));
        } else if (f.type === 'multi') {
          var cur = [].concat(a.value || []);
          h += '<div class="flt-chips">' + (f.options || []).map(function (o) {
            return '<button class="flt-chip' + (cur.indexOf(o.name) >= 0 ? ' on' : '') + '" data-act="ae-ap-chip"' + k('value') +
              ' data-v="' + esc(o.name) + '"><i class="flt-dot" style="background:' + esc(o.color || '#9ca0a8') + '"></i>' + esc(o.name) + '</button>';
          }).join('') + '</div>';
        } else if (f.type === 'person') {
          var pm = a.mode || 'user';
          h += '<div class="flt-line">' + auSel('ae-ap', [['user', L('คนที่เลือก')], ['var', L('จากงาน')], ['none', L('(ล้างค่า)')]], pm, k('mode'));
          if (pm === 'user') h += auSel('ae-ap', auUsers(), a.value, k('value'));
          if (pm === 'var') h += auSel('ae-ap', AU_VARS_USER.map(function (x) { return [x[0], L(x[1])]; }), a['var'] || 'creator', k('var'));
          h += '</div>';
        } else if (f.type === 'date') {
          h += auSel('ae-ap', [['rel', L('นับจากวัน')], ['clear', L('(ล้างค่า)')]], a.mode || 'rel', k('mode')) +
            (a.mode === 'clear' ? '' : auDateSpec(pid, a, d, ''));
        } else if (f.type === 'number') {
          h += '<input type="number" step="any" class="opt-select" data-act="ae-ap"' + k('value') + ' value="' + esc(a.value == null ? '' : a.value) + '">';
        } else {
          h += '<input class="opt-select" data-act="ae-ap"' + k('value') + ' value="' + esc(a.value || '') + '" placeholder="' +
            esc(L('ข้อความ ใส่ตัวแปรได้ เช่น {task}')) + '">' + auVarChips(pid, d, 'value');
        }
        return h;
      }
      case 'comment':
        return '<textarea class="opt-select au-text" rows="3" data-act="ae-ap"' + k('text') + ' placeholder="' +
          esc(L('เช่น {assignee} ช่วยตรวจ {task} ก่อน {due} ด้วยครับ')) + '">' + esc(a.text || '') + '</textarea>' + auVarChips(pid, d, 'text');
      case 'followers': {
        var us = a.users || [], vs = a.vars || [];
        return '<div class="flt-chips">' + AU_VARS_USER.map(function (x) {
          return '<button class="flt-chip' + (vs.indexOf(x[0]) >= 0 ? ' on' : '') + '" data-act="ae-ap-chip"' + k('vars') + ' data-v="' + x[0] + '">' + esc(L(x[1])) + '</button>';
        }).join('') + S.db.users.filter(function (u) { return u.active !== false; }).map(function (u) {
          return '<button class="flt-chip' + (us.indexOf(u.id) >= 0 ? ' on' : '') + '" data-act="ae-ap-chip"' + k('users') + ' data-v="' + esc(u.id) + '">' + esc(u.name) + '</button>';
        }).join('') + '</div>';
      }
      case 'tag': case 'untag':
        return '<input class="opt-select" list="auTags" data-act="ae-ap"' + k('tag') + ' maxlength="40" value="' + esc(a.tag || '') + '" placeholder="' + esc(L('ชื่อแท็ก')) + '">' +
          '<datalist id="auTags">' + S.allTags().map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>';
      case 'priority':
        return auSel('ae-ap', S.PRIORITIES.map(function (x) { return [x.id, L(x.label)]; }), a.v || 'high', k('v'));
      case 'create': {
        var h3 = auSel('ae-ap', [['subtask', L('งานย่อยของงานนี้')], ['approval', L('งานย่อยขออนุมัติ')], ['task', L('งานใหม่ในโปรเจกต์นี้')]], a.kind || 'subtask', k('kind'));
        h3 += '<input class="opt-select au-gap" data-act="ae-ap"' + k('name') + ' maxlength="300" value="' + esc(a.name || '') + '" placeholder="' + esc(L('ชื่องาน เช่น ตรวจ {task}')) + '">' +
          auVarChips(pid, d, 'name');
        h3 += '<textarea class="opt-select au-text au-gap" rows="2" data-act="ae-ap"' + k('notes') + ' placeholder="' + esc(L('รายละเอียด (ไม่บังคับ) ใส่ {link} เพื่อลิงก์กลับ')) + '">' + esc(a.notes || '') + '</textarea>';
        if (a.kind === 'task') h3 += '<label class="opt-lbl">' + L('เซกชัน') + '</label>' + auSel('ae-ap', auSecOpts(pid, L('เซกชันเดียวกับงานที่ทำให้ทำงาน')), a.sec, k('sec'));
        h3 += '<label class="opt-lbl">' + L('ผู้รับผิดชอบ') + '</label>' + auUserSpec(pid, a.assign || { mode: 'none' }, d, 'assign.', true);
        var du = a.due || {};
        h3 += '<label class="chk au-gap"><input type="checkbox" data-act="ae-ap"' + k('due.on') + ' data-t="check"' + (du.on ? ' checked' : '') + '> ' + L('ตั้งกำหนดส่ง') + '</label>';
        if (du.on) h3 += auDateSpec(pid, du, d, 'due.');
        return h3;
      }
      case 'setstatus': {
        var sopts = auStatusOpts(pid);
        if (!sopts.length) return '<div class="flt-none">' + L('โปรเจกต์นี้ยังไม่มีชนิดงานกำหนดเอง') + '</div>';
        return auSel('ae-ap', sopts, a.v, k('v')) +
          '<div class="opt-note au-hint">' + L('งานที่เป็นชนิดอื่นจะถูกเปลี่ยนเป็นชนิดของสถานะนี้') + '</div>';
      }
      case 'addproj': {
        var projs = S.visibleProjects().filter(function (q) { return q.id !== pid && !q.archived && S.canInProject(q.id, 'edit'); });
        var h4 = auSel('ae-ap', [['', L('เลือกโปรเจกต์')]].concat(projs.map(function (q) { return [q.id, (q.icon || '') + ' ' + q.name]; })), a.pid, k('pid'));
        if (a.pid && S.project(a.pid)) h4 += auSel('ae-ap', auSecOpts(a.pid, L('เซกชันแรก')), a.sec, k('sec'));
        return h4;
      }
    }
    return '';
  }

  function autoActsHtml(pid, acts, pi) {
    var h = '';
    acts.forEach(function (a, ai) {
      var d = ' data-p="' + pi + '" data-i="' + ai + '"';
      h += '<div class="au-act"><div class="flt-line"><span class="au-n">' + (ai + 1) + '</span>' +
        auSel('ae-act-type', S.AUTO_ACTIONS.filter(function (x) { return !x.personal; }).map(function (x) { return [x.id, L(x.label)]; }), a.type, d) +
        (ai > 0 ? '<button class="flt-del" data-act="ae-act-up"' + d + ' title="' + esc(L('ย้ายขึ้น')) + '">' + I('arrowUp', 13) + '</button>' : '') +
        '<button class="flt-del" data-act="ae-act-del"' + d + ' title="' + esc(L('เอาการกระทำนี้ออก')) + '">' + I('close', 13) + '</button></div>' +
        '<div class="au-params">' + autoActParams(pid, a, d) + '</div></div>';
    });
    if (acts.length < S.AUTO_MAX_ACTS) {
      h += '<div class="au-add">' + auSel('ae-act-add', [['', '+ ' + L('เพิ่มการกระทำ…')]].concat(S.AUTO_ACTIONS.filter(function (x) { return !x.personal; })
        .map(function (x) { return [x.id, L(x.label)]; })), '', ' data-p="' + pi + '"') + '</div>';
    }
    return h;
  }

  function autoEditModal() {
    var e = state.auto.edit, pid = e.pid, a = e.a;
    var td = trigDefOf(a.trigger.type) || {};
    var noTask = a.trigger.type === 'scheduled' && a.trigger.scope !== 'tasks';
    var h = '<h2 class="au-h">' + I('bolt', 17) + ' ' + (e.isNew ? L('สร้างอัตโนมัติ') : L('แก้อัตโนมัติ')) + '</h2>';
    h += '<div class="field"><label>' + L('ชื่อ (ไม่บังคับ)') + '</label><input class="opt-select" data-act="ae-name" maxlength="120" value="' +
      esc(a.name || '') + '" placeholder="' + esc(autoTitle(pid, { trigger: a.trigger, paths: a.paths })) + '"></div>';

    h += '<div class="au-block"><div class="au-bh">' + L('เมื่อ') + '</div><div class="flt-line">' +
      auSel('ae-trig', S.AUTO_TRIGGERS.map(function (x) { return [x.id, L(x.label)]; }), a.trigger.type, '') + '</div>' +
      '<div class="au-params">' + autoTrigParams(pid, a.trigger) + '</div>' +
      (td.time ? '<p class="opt-note au-hint">' + I('alert', 12) + ' ' + L(AU_TIME_NOTE) + '</p>' : '') +
      (a.trigger.type === 'manual' ? '<p class="opt-note au-hint">' + L('กดรันได้จากเมนู ⋯ ของงาน หรือเลือกได้ถึง 50 งานแล้วกด “เพิ่มเติม → รันอัตโนมัติ”') + '</p>' : '') +
      '</div>';

    var ffs = S.filterFields('a:' + pid);
    a.paths.forEach(function (pt, pi) {
      var multi = a.paths.length > 1 || a.els;
      h += '<div class="au-block au-path"><div class="au-bh">' +
        (multi ? L('เส้นทาง {n}', { n: pi + 1 }) + ' — ' : '') + L('ถ้า') +
        (a.paths.length > 1 ? '<button class="flt-del" data-act="ae-path-del" data-p="' + pi + '" title="' + esc(L('ลบเส้นทางนี้')) + '">' + I('trash', 13) + '</button>' : '') + '</div>';
      if (noTask && pt.conds.length) h += '<p class="opt-note au-hint">' + L('อัตโนมัติแบบทำครั้งเดียวไม่มีงานให้ตรวจเงื่อนไข เส้นทางที่มีเงื่อนไขจะถูกข้าม') + '</p>';
      if (!pt.conds.length) h += '<p class="au-always">' + L('ทุกครั้ง (ไม่มีเงื่อนไข)') + '</p>';
      pt.conds.forEach(function (c, ci) {
        var def = S.filterField('a:' + pid, c.f);
        var ops = def ? S.FILTER_OPS[def.kind] || [] : [];
        var di = ' data-i="' + pi + '.' + ci + '"';
        h += '<div class="flt-row">' + (ci ? '<span class="flt-and">' + L('และ') + '</span>' : '') +
          '<div class="flt-line">' +
          optSelect('aec-field', ffs.map(function (x) { return [x.id, x.custom ? x.label : (x.id === 'project' ? L('อยู่ในโปรเจกต์') : L(x.label))]; })
            .concat(def ? [] : [[c.f, L('(ฟิลด์ถูกลบแล้ว)')]]), c.f, di) +
          optSelect('aec-op', ops.map(function (o) { return [o[0], L(o[1])]; }), c.op, di) +
          '<button class="flt-del" data-act="aec-del"' + di + ' title="' + esc(L('เอาเงื่อนไขนี้ออก')) + '">' + I('close', 13) + '</button></div>' +
          fltValueHtml('a:' + pid, c, pi + '.' + ci, 'aec') + '</div>';
      });
      if (pt.conds.length < S.AUTO_MAX_CONDS) {
        h += '<div class="opt-acts"><button class="btn btn-sm btn-ghost" data-act="aec-add" data-p="' + pi + '">' + I('plus', 13) + ' ' + L('เพิ่มเงื่อนไข') + '</button></div>';
      }
      h += '<div class="au-bh au-then">' + L('ให้ทำ') + '</div>' + autoActsHtml(pid, pt.acts, pi) + '</div>';
    });
    h += '<div class="opt-acts">';
    if (a.paths.length < S.AUTO_MAX_PATHS) {
      h += '<button class="btn btn-sm" data-act="ae-path-add">' + I('plus', 13) + ' ' + L('เพิ่มเส้นทาง') + '</button>';
    }
    h += '<button class="btn btn-sm' + (a.els ? ' btn-ghost' : '') + '" data-act="ae-els">' +
      (a.els ? L('เอาเส้นทาง “อื่น ๆ” ออก') : '+ ' + L('เส้นทาง “อื่น ๆ”')) + '</button></div>';
    if (a.els) {
      h += '<div class="au-block au-path au-else"><div class="au-bh">' + L('อื่น ๆ — เมื่อไม่ตรงเส้นทางไหนเลย') + '</div>' +
        autoActsHtml(pid, a.els, -1) + '</div>';
    }
    h += optToggle('ae-chain', L('ให้อัตโนมัติอื่นปลุกตัวนี้ได้'), a.chain,
      L('ปิดไว้ = ทำงานเฉพาะเมื่อคนทำ ถ้าเปิด การกระทำของอัตโนมัติอื่นก็ปลุกได้ ลึกได้ไม่เกิน {n} ชั้น และตัวเดิมรันกับงานเดิมได้ครั้งเดียวต่อหนึ่งการกด', { n: S.AUTO_MAX_DEPTH }));
    h += '<p class="opt-note">' + L('ทำได้สูงสุด {a} การกระทำต่อเส้นทาง {p} เส้นทาง เส้นทางแรกที่ตรงเงื่อนไขครบได้ทำ การกระทำใช้ไม่ได้ (เช่น เซกชันถูกลบ) จะลงประวัติการรันเป็นผิดพลาด',
      { a: S.AUTO_MAX_ACTS, p: S.AUTO_MAX_PATHS }) + '</p>';
    h += '<div class="modal-acts"><button class="btn" data-act="auto-back">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="ae-save">' + L('บันทึก') + '</button></div>';
    return h;
  }

  /** ตั้งค่าลึกด้วยคีย์แบบ 'assign.mode' */
  function auSet(obj, path, v) {
    var ks = path.split('.'), o = obj;
    for (var i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = v;
  }
  function auGet(obj, path) {
    return path.split('.').reduce(function (o, k) { return o && o[k]; }, obj);
  }

  /** รายการการกระทำของเส้นทาง p (-1 = อื่น ๆ) */
  function auActs(p) {
    var a = state.auto.edit.a;
    return +p === -1 ? (a.els = a.els || []) : a.paths[+p].acts;
  }

  function auVal(el) {
    var t = el.dataset.t;
    if (t === 'bool') return el.value === '1';
    if (t === 'num') return el.value === '' ? 0 : Number(el.value);
    if (t === 'check') return !!el.checked;
    if (el.type === 'number') return el.value === '' ? '' : Number(el.value);
    return el.value;
  }

  /* ---------- งานของฉัน ---------- */

  var MT_AUTO_PRESETS = [
    ['approaching', 'ใกล้ครบกำหนด → ย้ายไปเซกชัน'],
    ['overdue', 'เลยกำหนด → ย้ายไปเซกชัน'],
    ['completed', 'ทำเสร็จ → ย้ายไปเซกชัน']
  ];

  function mtSecOptions() {
    return S.personalOf().mt.secs.map(function (s) {
      return [s.id, s.id === S.MT_RECENT ? recentLabel() : L(s.name)];
    });
  }

  function mtAutoModal() {
    var list = S.automations('@me');
    var h = '<h2 class="au-h">' + I('bolt', 17) + ' ' + L('อัตโนมัติของงานของฉัน') + '</h2>';
    h += '<p class="opt-note" style="margin-top:0">' + L('จัดงานที่มอบหมายให้คุณเข้าเซกชันของคุณเองโดยอัตโนมัติ เห็นและแก้ได้แค่คุณ') + '</p>';
    h += '<div class="au-list">';
    if (!list.length) h += '<p class="au-empty">' + L('ยังไม่มี เลือกจากแบบสำเร็จรูปด้านล่าง') + '</p>';
    list.forEach(function (a) {
      var act = (a.paths[0] && a.paths[0].acts[0]) || {};
      h += '<div class="au-row' + (a.on ? '' : ' off') + '">' +
        '<button class="switch' + (a.on ? ' on' : '') + '" data-act="mt-auto-toggle" data-auto="' + esc(a.id) + '" role="switch"><i></i></button>' +
        '<div class="grow"><b>' + esc(trigText(null, a.trigger)) + ' → ' + esc(actText(null, act)) + '</b></div>' +
        '<button class="btn btn-sm btn-ghost btn-danger" data-act="mt-auto-del" data-auto="' + esc(a.id) + '" title="' + esc(L('ลบ')) + '">' + I('trash', 13) + '</button></div>';
    });
    h += '</div><label class="opt-lbl">' + L('เพิ่มจากแบบสำเร็จรูป') + '</label><div class="au-presets">';
    MT_AUTO_PRESETS.forEach(function (x) {
      h += '<div class="au-preset"><b>' + esc(L(x[1])) + '</b><div class="flt-line">';
      if (x[0] === 'approaching') {
        h += '<span class="au-pre-l">' + L('อีก') + '</span><input type="number" min="0" max="30" class="opt-select flt-n" id="mtaDays" value="1"><span class="au-pre-l">' + L('วัน') + '</span>';
      }
      if (x[0] === 'overdue') {
        h += '<span class="au-pre-l">' + L('เลยไป') + '</span><input type="number" min="0" max="30" class="opt-select flt-n" id="mtaOver" value="0"><span class="au-pre-l">' + L('วัน') + '</span>';
      }
      h += '<select class="opt-select" id="mtaSec-' + x[0] + '">' + mtSecOptions().map(function (o) {
        var def = x[0] === 'completed' ? 'later' : 'today';
        return '<option value="' + esc(o[0]) + '"' + (o[0] === def ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select>' +
        '<button class="btn btn-sm" data-act="mt-auto-add" data-k="' + x[0] + '">' + L('เพิ่ม') + '</button></div></div>';
    });
    h += '</div>';
    var runs = S.autoRuns('@me').slice(0, 10);
    if (runs.length) h += '<label class="opt-lbl">' + L('ประวัติการรันล่าสุด') + '</label>' + autoRunsHtml('@me', 10);
    h += '<p class="opt-note au-note">' + I('alert', 12) + ' ' + L('ทำงานเมื่อคุณเปิดแอปอยู่ ตรวจทุก 5 นาที งานที่เสร็จจากเครื่องอื่นจะย้ายตอนคุณเปิดแอปครั้งถัดไป') + '</p>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  /** เลือกอัตโนมัติแบบกดรันเองเพื่อรันกับงานที่ระบุ */
  function autoRunModal(taskIds, pid) {
    var opts = [];
    if (pid) {
      S.automations(pid).forEach(function (a) {
        if (a.on && a.trigger.type === 'manual') opts.push({ p: S.project(pid), a: a });
      });
    } else if (taskIds.length === 1) {
      opts = S.manualAutomationsFor(taskIds[0]);
    }
    var h = '<h2 class="au-h">' + I('bolt', 17) + ' ' + L('รันอัตโนมัติ') + '</h2>';
    h += '<p class="opt-note" style="margin-top:0">' + L('กับ {n} งาน', { n: taskIds.length }) +
      (taskIds.length > S.AUTO_MANUAL_MAX ? ' — ' + L('รันได้ครั้งละไม่เกิน {n} งาน', { n: S.AUTO_MANUAL_MAX }) : '') + '</p>';
    if (!opts.length) {
      h += '<p class="au-empty">' + L('ยังไม่มีอัตโนมัติแบบ “กดรันเอง” ในโปรเจกต์นี้') + '</p>';
    }
    h += '<div class="au-list">';
    opts.forEach(function (x) {
      h += '<button class="btn au-runbtn" data-act="auto-run" data-project="' + esc(x.p.id) + '" data-auto="' + esc(x.a.id) +
        '" data-ids="' + esc(taskIds.slice(0, S.AUTO_MANUAL_MAX).join(',')) + '">' + I('bolt', 14) + ' <span class="grow">' +
        esc(x.a.trigger.label || autoTitle(x.p.id, x.a)) + '</span><em>' + esc(x.p.name) + '</em></button>';
    });
    h += '</div><div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  /** เพิ่มรายชื่อไว้ล่วงหน้า ใช้ตอนอยากมอบหมายงานก่อนเจ้าตัวล็อกอินครั้งแรก */
  function addMemberModal() {
    var picker = canPickPeople();
    var h = '<h2>' + L('เพิ่มสมาชิกใหม่') + '</h2>';

    h += '<div class="field"><label>' + L('บทบาทที่จะให้') + '</label><select id="uRole">';
    S.ROLES.forEach(function (r) {
      h += '<option value="' + r.id + '"' + (r.id === 'member' ? ' selected' : '') + '>' +
        L(r.label) + ' — ' + L(r.desc) + '</option>';
    });
    h += '</select></div>';

    if (picker) {
      h += '<div class="field"><label>' + L('ค้นหาจากรายชื่อพนักงานบริษัท') + '</label>' +
        '<input id="uSearch" autocomplete="off" placeholder="' +
        L('พิมพ์ชื่อหรืออีเมล อย่างน้อย 2 ตัวอักษร') + '"></div>';
      h += '<div id="uResults" class="people"></div>';
      h += '<details class="manual"><summary>' + L('ไม่เจอชื่อ? กรอกเอง') + '</summary>' + manualFields() + '</details>';
    } else {
      h += manualFields();
    }

    h += '<div class="modal-note">' +
      (picker ? L('อย่าลืมเพิ่มคนนี้เข้าไซต์ SharePoint ด้วย ไม่งั้นเขาจะล็อกอินเข้ามาแล้วเปิดข้อมูลไม่ได้')
              : L('กรอกอีเมลให้ตรงกับบัญชีบริษัท ไม่งั้นตอนเจ้าตัวล็อกอินจะกลายเป็นคนละรายการ')) +
      '</div>';

    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button>' +
      '<button class="btn btn-primary" data-act="do-add-user">' + L('เพิ่มด้วยข้อมูลที่กรอก') + '</button></div>';
    return h;
  }

  function manualFields() {
    return '<div class="field"><label>' + L('ชื่อ') + '</label>' +
      '<input id="uName" placeholder="' + L('ชื่อ') + '"></div>' +
      '<div class="field"><label>' + L('อีเมล') + '</label>' +
      '<input id="uEmail" type="email" placeholder="name@srichand.co.th"></div>';
  }

  /** เลือกคนจากสมุดรายชื่อบริษัทได้ไหม — ต้องล็อกอินอยู่และมี Graph ให้เรียก */
  function canPickPeople() {
    return !!(global.OrbitCloud && global.OrbitAuth &&
              global.OrbitAuth.isSignedIn && global.OrbitAuth.isSignedIn());
  }

  /** วาดผลการค้นหารายชื่อ */
  function renderPeople(list, note) {
    var box = document.getElementById('uResults');
    if (!box) return;
    if (note) { box.innerHTML = '<div class="people-note">' + R.esc(note) + '</div>'; return; }
    if (!list.length) {
      box.innerHTML = '<div class="people-note">' + L('ไม่พบชื่อนี้ในบริษัท') + '</div>';
      return;
    }
    box.innerHTML = list.map(function (p) {
      var already = !!S.user(global.OrbitAuth.orbitId(p.oid));
      return '<button class="person" data-act="pick-person" data-oid="' + R.esc(p.oid) +
        '" data-name="' + R.esc(p.name) + '" data-email="' + R.esc(p.email) + '"' +
        (already ? ' disabled' : '') + '>' +
        R.avatar({ name: p.name, color: '#8a8a92' }) +
        '<span><b>' + R.esc(p.name) + '</b><em>' + R.esc(p.email) +
        '</em></span>' +
        '<i>' + (already ? L('มีอยู่แล้ว') : L('เพิ่ม')) + '</i></button>';
    }).join('');
  }

  function addHomeModal(taskId) {
    var current = {};
    S.projectsOfTask(taskId).forEach(function (x) { current[x.project.id] = true; });
    var h = '<h2>' + L('เพิ่มงานนี้เข้าโปรเจกต์อื่น') + '</h2>';
    h += '<p style="font-size:13px;color:var(--fg-soft);margin:0 0 14px">' +
      L('งานชิ้นเดียวอยู่ได้หลายโปรเจกต์ แก้ที่ไหนก็อัปเดตทุกที่') + '</p>';
    var any = false;
    S.visibleProjects().forEach(function (p) {
      if (!S.canInProject(p.id, "edit")) return;   // เพิ่มงานเข้าโปรเจกต์ที่แก้ไม่ได้ ไม่ควรทำได้
      if (current[p.id]) return;
      any = true;
      h += '<div class="mini-row"><span>' + R.esc(p.icon) + '</span>' +
        '<div class="grow">' + R.esc(p.name) + '</div>' +
        '<button class="btn btn-sm btn-primary" data-act="do-add-home" data-id="' +
        R.esc(taskId) + '" data-project="' + R.esc(p.id) + '">' + L('เพิ่ม') + '</button></div>';
    });
    if (!any) h += '<div style="color:var(--fg-faint)">' + L('อยู่ครบทุกโปรเจกต์แล้ว') + '</div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  function dependencyModal(taskId) {
    var t = S.task(taskId);
    var h = '<h2>' + L('งานนี้ต้องรออะไรให้เสร็จก่อน') + '</h2>';
    h += '<div class="field"><input id="depSearch" placeholder="' + L('พิมพ์เพื่อค้นหางาน') + '" ' +
      'data-act="dep-search"></div>';
    h += '<div id="depResults">';
    h += depResults(taskId, '');
    h += '</div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  function depResults(taskId, q) {
    var t = S.task(taskId);
    q = (q || '').toLowerCase();
    var list = S.db.tasks.filter(function (x) {
      if (x.id === taskId || x.parentId) return false;
      if (t.dependsOn.filter(function (d) { return d.id === x.id; }).length) return false;
      if (q && x.name.toLowerCase().indexOf(q) < 0) return false;
      return S.canSeeTask(x.id);
    }).slice(0, 12);
    if (!list.length) return '<div style="color:var(--fg-faint)">' + L('ไม่พบงาน') + '</div>';
    var h = '';
    list.forEach(function (x) {
      h += '<div class="mini-row"><div class="grow"><div>' + R.esc(x.name) + '</div>' +
        '<div class="sub">' + (x.completed ? L('เสร็จแล้ว') : L('ยังไม่เสร็จ')) + '</div></div>' +
        '<button class="btn btn-sm btn-primary" data-act="do-add-dependency" data-id="' +
        R.esc(taskId) + '" data-blocker="' + R.esc(x.id) + '">' + L('เลือก') + '</button></div>';
    });
    return h;
  }

  /* ---- แนบไฟล์ ----
   *
   * เลือกไฟล์จากเครื่องอย่างเดียว ไม่มีทางวางลิงก์แล้ว
   * ไฟล์ถูกเก็บมาทั้งก้อนในตัวข้อมูล จึงเปิดและดาวน์โหลดกลับได้โดยไม่ต้องพึ่งที่อื่น
   *
   * แลกมาด้วยเพดานขนาด เพราะพื้นที่ทั้งหมดที่เบราว์เซอร์ให้มีราวสิบสองเมกะ
   * ถ้าไม่คุม ไฟล์ใหญ่ไฟล์เดียวก็กินหมดแล้วงานของทั้งทีมจะบันทึกไม่ลง
   * ตั้งไว้สองเมกะซึ่งครอบคลุมเอกสารและรูปที่ใช้กันจริงเกือบทั้งหมด
   * เกินกว่านั้นบอกไปตรง ๆ ว่าแนบไม่ได้ ดีกว่าปล่อยให้แนบแล้วพังเงียบ ๆ
   */
  var ATT_MAX_BYTES = 2 * 1024 * 1024;     // 2 MB ต่อไฟล์

  function attachmentModal(taskId) {
    return '<h2>' + L('แนบไฟล์') + '</h2>' +
      '<button class="att-drop" data-act="pick-file">' + I('paperclip', 22) +
      '<b>' + L('เลือกไฟล์จากเครื่อง') + '</b>' +
      '<em>' + L('ไฟล์ไม่เกิน {n} MB ต่อไฟล์ เก็บมาทั้งไฟล์และดาวน์โหลดกลับได้',
        { n: Math.round(ATT_MAX_BYTES / 1048576) }) + '</em></button>' +
      '<input type="file" id="atFile" data-act="att-file" data-id="' + R.esc(taskId) + '" hidden>' +
      '<div class="modal-acts"><button class="btn" data-act="close-modal">' +
      L('ยกเลิก') + '</button></div>';
  }

  function takeAttachment(inputEl) {
    var f = inputEl.files && inputEl.files[0];
    var tid = inputEl.dataset.id;
    inputEl.value = '';
    if (!f) return;
    if (f.size > ATT_MAX_BYTES) {
      toast(L('ไฟล์นี้ {mb} MB เกิน {n} MB ที่แนบได้',
        { mb: (f.size / 1048576).toFixed(1), n: Math.round(ATT_MAX_BYTES / 1048576) }));
      return;
    }
    var fr = new FileReader();
    fr.onload = function () {
      S.addAttachment(tid, f.name, fr.result, { size: f.size, mime: f.type });
      closeModal();
      renderAll();
      toast(L('แนบไฟล์แล้ว'), L('ย้อนกลับ'), 'undo');
    };
    fr.onerror = function () { toast(L('อ่านไฟล์ไม่สำเร็จ')); };
    fr.readAsDataURL(f);
  }

  function shortcutsModal() {
    var rows = [
      ['/', L('ไปที่ช่องค้นหา')],
      ['Esc', L('ปิดหน้าต่าง / แผงรายละเอียด')],
      ['Ctrl + Z', L('ย้อนกลับการกระทำล่าสุด')],
      ['Ctrl + Enter', L('ส่งความเห็น / ประกาศ (เมื่อเคอร์เซอร์อยู่ในช่องพิมพ์)')],
      ['? / Ctrl + /', L('เปิดหน้าคีย์ลัดนี้')],
      ['Tab + H', L('ไปหน้าแรก')],
      ['Tab + Z', L('ไปงานของฉัน')],
      ['Tab + I', L('ไปกล่องแจ้งเตือน')],
      ['Tab + Q', L('เพิ่มงานด่วน')],
      ['Tab + O', L('ซ่อน/แสดงแถบซ้าย')],
      ['Tab + Enter', L('เปิดรายละเอียดของงานที่เลือก')],
      ['↑ / ↓', L('เลือกงานก่อนหน้า / ถัดไป')],
      ['Tab + Y', L('ทำเครื่องหมายว่าเสร็จ / เปิดใหม่ (งานที่เปิดหรือเลือกอยู่)')],
      ['Tab + D', L('ตั้งกำหนดส่ง')],
      ['Tab + A', L('มอบหมายงาน')],
      ['Tab + M', L('มอบหมายงานที่เปิดอยู่ให้ตัวเอง')],
      ['Tab + T', L('เพิ่มแท็ก')],
      ['Tab + P', L('เพิ่มเข้าโปรเจกต์')],
      ['Tab + S', L('เพิ่มงานย่อย')],
      ['Tab + F', L('เพิ่มผู้ติดตาม')],
      ['Tab + J / Tab + L', L('ติดตาม / เลิกติดตามงาน')],
      ['Tab + K', L('ถูกใจงาน')],
      ['Tab + R', L('แก้รายละเอียด')],
      ['Tab + C', L('ไปที่ช่องความเห็น')],
      ['Tab + Delete', L('ลบงานที่เลือก')],
      ['Tab + X', L('ขยายงานที่เปิดอยู่เต็มจอ (ไม่ได้เปิดงาน = สลับสว่าง/มืด)')],
      ['Shift + Tab + F', L('สร้างงานติดตามผลของงานที่เปิดอยู่')],
      ['Tab + N', L('เพิ่มเซกชันใหม่ในโปรเจกต์')],
      ['J / K', L('กล่องแจ้งเตือน: รายการถัดไป / ก่อนหน้า')],
      ['F / I / U', L('กล่องแจ้งเตือน: บุ๊กมาร์ก / เก็บ / อ่านแล้ว-ยังไม่อ่าน')],
      [L('แป้นภาษาไทย'), L('คีย์ลัดทุกตัวใช้ได้ทั้งแป้นอังกฤษและแป้นไทย (ดูตำแหน่งปุ่ม ไม่ใช่ตัวอักษร)')],
      ['Enter / Shift + Enter', L('เพิ่มงานใต้ / เหนือแถวที่เลือก (มุมมองรายการ)')],
      ['Ctrl + ↑ / ↓', L('เลื่อนงานขึ้น / ลงในเซกชัน')],
      ['Ctrl + Shift + ↑ / ↓', L('ย้ายงานไปเซกชันก่อนหน้า / ถัดไป')],
      ['Shift + Click / Ctrl + Click', L('เลือกหลายงานเป็นช่วง / ทีละงาน')],
      [L('วางหลายบรรทัด'), L('ในช่องเพิ่มงานหรืองานย่อย = สร้างหนึ่งงานต่อบรรทัด')],
      [L('ลากแถวไปวางกลางแถวอื่น'), L('แปลงเป็นงานย่อยของงานนั้น (มุมมองรายการ)')],
      ['Ctrl + B / I / U', L('ตัวหนา / ตัวเอียง / ขีดเส้นใต้ (ในรายละเอียดและความเห็น)')],
      ['Ctrl + Shift + X / M', L('ขีดฆ่า / โค้ด')],
      ['Ctrl + Shift + 8 / 7', L('หัวข้อย่อย / ลำดับเลข')],
      ['Ctrl + K', L('ใส่ลิงก์')],
      ['@', L('อ้างถึงคน งาน หรือโปรเจกต์ (พิมพ์รหัสงานเช่น @REQ-12 ได้)')],
      ['"…"  a | b  -a  a*  ( )', L('ตัวดำเนินการในช่องค้นหา: วลี หรือ ไม่เอา ขึ้นต้นด้วย จัดกลุ่ม')],
      [L('Enter ในช่องเพิ่มงาน'), L('บันทึกแล้วเปิดช่องต่อทันที')],
      ['Delete', L('ลบงานที่เลือกไว้')],
      [L('คลิกช่องสี่เหลี่ยม'), L('เลือกหลายงานเพื่อแก้พร้อมกัน')]
    ];
    var h = '<h2>' + L('คีย์ลัด') + '</h2><div class="shortcuts">';
    rows.forEach(function (r) {
      h += '<div class="sc"><kbd>' + R.esc(r[0]) + '</kbd><span class="d">' +
        R.esc(r[1]) + '</span></div>';
    });
    h += '</div><div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  /* Sprint 3 — ทัวร์แนะนำครั้งแรก: 4 หน้า ข้ามได้ทุกเมื่อ แสดงครั้งเดียวต่อคน (บันทึก tourDone ตั้งแต่ตอนแสดง
   * ไม่ใช่ตอนกดจบ — ปิดหน้าต่างทิ้งก็ไม่เด้งซ้ำ) เปิดดูอีกได้จากอภิธานศัพท์ */
  var TOUR = [
    ['ยินดีต้อนรับสู่ Orbit', 'Orbit รวมงานของทีมไว้ที่เดียว: โปรเจกต์ → เซกชัน → งาน เริ่มจากเปิดโปรเจกต์ในเมนูซ้าย'],
    ['เพิ่มงานให้เร็ว', 'ในช่องเพิ่มงานพิมพ์เช่น “ส่งใบเสนอราคา @สมชาย พรุ่งนี้” ระบบจะใส่ผู้รับผิดชอบและกำหนดส่งให้เอง'],
    ['กล่องแจ้งเตือน', 'เรื่องที่เกี่ยวกับคุณอยู่ที่นี่ทั้งหมด เช่น ถูกมอบหมายงาน ถูกพูดถึง มีคนขออนุมัติ'],
    ['หาของและทางลัด', 'กด / เพื่อค้นหางาน หน้า และข้อความ กด ? เพื่อดูคีย์ลัด ถ้าคำไหนไม่เข้าใจ เปิด “ศัพท์ที่ใช้ใน Orbit” จากเมนูซ้าย']
  ];
  function tourModal() {
    var i = Math.max(0, Math.min(TOUR.length - 1, state.tourStep || 0));
    var last = i === TOUR.length - 1;
    var h = '<h2>' + R.esc(L(TOUR[i][0])) + '</h2><p class="tour-body">' + R.esc(L(TOUR[i][1])) + '</p>' +
      '<p class="tour-step">' + L('ขั้นที่ {a} จาก {b}', { a: i + 1, b: TOUR.length }) + '</p><div class="modal-acts">';
    h += '<button class="btn btn-ghost" data-act="close-modal">' + L('ข้ามทัวร์') + '</button>';
    if (i > 0) h += '<button class="btn" data-act="tour-prev">' + L('← ก่อนหน้า') + '</button>';
    h += last ? '<button class="btn btn-primary" data-act="close-modal">' + L('เริ่มใช้งาน') + '</button>'
              : '<button class="btn btn-primary" data-act="tour-next">' + L('ถัดไป →') + '</button>';
    return h + '</div>';
  }
  function maybeTour() {
    setTimeout(function () {
      try {
        if (!S.isActive() || S.pref('tourDone') || ($gate && !$gate.hidden)) return;
        S.setPref('tourDone', true);
        state.tourStep = 0;
        openModal(tourModal());
      } catch (e) { /* ทัวร์ไม่ใช่ของจำเป็น พลาดก็ข้าม */ }
    }, 2500);
  }

  /* Sprint 3 — อภิธานศัพท์: คำที่ Orbit ใช้ อธิบายสั้น ๆ ให้คนใหม่ (และคนที่ย้ายมาจาก Asana) เปิดอ่านได้จากเมนูซ้าย */
  function glossaryModal() {
    var rows = [
      ['โปรเจกต์', 'Project', 'กลุ่มงานที่ทำเรื่องเดียวกัน มีเซกชัน สมาชิก และมุมมองของตัวเอง'],
      ['เซกชัน', 'Section', 'หมวดย่อยในโปรเจกต์ เช่น ค้างอยู่ / กำลังทำ / เสร็จแล้ว (บนบอร์ดเห็นเป็นแถบตั้ง)'],
      ['งาน / งานย่อย', 'Task / subtask', 'สิ่งที่ต้องทำหนึ่งอย่าง งานย่อยคือขั้นตอนเล็ก ๆ ข้างในงาน'],
      ['ผู้รับผิดชอบ', 'Assignee', 'คนที่ต้องทำงานนั้น มีได้คนเดียวต่องาน'],
      ['ผู้ติดตาม', 'Followers', 'คนที่ได้รับแจ้งเตือนเมื่องานเปลี่ยน แต่ไม่ได้เป็นคนทำ'],
      ['หมุดหมาย', 'Milestone', 'จุดสำคัญของโปรเจกต์ ไม่มีระยะเวลา เช่น วันเปิดตัว'],
      ['งานอนุมัติ', 'Approval task', 'งานที่รอให้ใครสักคนตัดสิน: อนุมัติ ขอให้แก้ไข หรือปฏิเสธ'],
      ['ฟิลด์', 'Field', 'ช่องข้อมูลเพิ่มเติมของงาน เช่น งบ ประเภท ลูกค้า'],
      ['ฟอร์ม', 'Form', 'แบบฟอร์มรับเรื่อง กรอกแล้วกลายเป็นงานในโปรเจกต์'],
      ['กฎอัตโนมัติ', 'Automation rule', 'ให้ระบบทำแทนเมื่อเกิดเหตุการณ์ เช่น ทำเสร็จแล้วย้ายไปเซกชันเสร็จแล้ว'],
      ['พอร์ตโฟลิโอ', 'Portfolio', 'รวมหลายโปรเจกต์ไว้ดูภาพรวมในที่เดียว'],
      ['กล่องแจ้งเตือน', 'Inbox', 'ที่รวมเรื่องที่เกี่ยวกับคุณ: มอบหมาย พูดถึง ขออนุมัติ ใกล้ครบกำหนด'],
      ['ผู้ดูแลโปรเจกต์', 'Project admin', 'จัดการสมาชิกและสิทธิ์ในโปรเจกต์นั้น (ลบโปรเจกต์ได้เฉพาะผู้ดูแลระบบ)'],
      ['ผู้ดูแลระบบ', 'Admin', 'ดูแลทั้งองค์กร: สมาชิก สิทธิ์ การลบโปรเจกต์ และบันทึกการทำงาน']
    ];
    var h = '<h2>' + L('ศัพท์ที่ใช้ใน Orbit') + '</h2><div class="shortcuts">';
    rows.forEach(function (r) {
      h += '<div class="sc"><kbd>' + R.esc(global.I18N.getLang() === 'en' ? r[1] : r[0]) + '</kbd><span class="d">' + R.esc(L(r[2])) + '</span></div>';
    });
    h += '</div><div class="modal-acts"><button class="btn" data-act="show-tour">' + L('ดูทัวร์แนะนำอีกครั้ง') + '</button><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  /* ======================================================================
   * 2c — ค้นหาขั้นสูง ฟิลด์ นำเข้า CSV แก้หลายงาน และงานดูแลโปรเจกต์
   * ====================================================================== */

  /** เอาเงื่อนไขของการค้นหาที่บันทึกไว้มาใส่หน้าจอ */
  function loadSavedSearch(ss) {
    if (!ss) return;
    state.adv.conds = S.clone(ss.conds || []);
    state.adv.mode = ss.mode === 'calendar' ? 'calendar' : 'list';
    state.adv.open = !!state.adv.conds.length;
  }

  function goSavedSearch(id) {
    var ss = S.savedSearch(id);
    if (!ss) return;
    state.route = { type: 'search', q: ss.q, ss: ss.id };
    loadSavedSearch(ss);
    clearSel();
    renderAll();
  }

  /** การค้นหาที่บันทึกไว้ถูกแก้ค้างอยู่ (ยังไม่บันทึกทับ) */
  function advDirty() {
    var r = state.route;
    var ss = r.ss ? S.savedSearch(r.ss) : null;
    if (!ss) return false;
    return ss.q !== (r.q || '') || ss.mode !== state.adv.mode ||
      JSON.stringify(ss.conds || []) !== JSON.stringify(state.adv.conds);
  }

  /** แถบบนของหน้าค้นหา — ตัวกรอง ทางลัด รายการ/ปฏิทิน บันทึก และแถวเงื่อนไข */
  function advPanelHtml() {
    var a = state.adv, r = state.route;
    var ss = r.ss ? S.savedSearch(r.ss) : null;
    var n = a.conds.length;
    var meOn = a.conds.some(isMeFilter);
    var openOn = a.conds.some(function (c) { return c.f === 'completed' && c.op === 'no'; });
    var h = '<div class="adv-panel"><div class="adv-bar">';
    h += '<button class="vtb-btn' + (n || a.open ? ' on' : '') + '" data-act="adv-toggle">' + I('filter', 14) +
      '<span>' + L('ตัวกรอง') + '</span>' + (n ? '<span class="vtb-n">' + n + '</span>' : '') + '</button>';
    h += '<button class="flt-chip' + (openOn ? ' on' : '') + '" data-act="as-quick" data-v="open">' +
      I('checkCircle', 12) + ' ' + L('ยังไม่เสร็จ') + '</button>';
    h += '<button class="flt-chip' + (meOn ? ' on' : '') + '" data-act="as-quick" data-v="me">' +
      I('users', 12) + ' ' + L('ผู้รับผิดชอบคือฉัน') + '</button>';
    h += '<span class="grow"></span>';
    h += '<div class="segmented adv-mode">' +
      '<button data-act="adv-mode" data-v="list" class="' + (a.mode !== 'calendar' ? 'on' : '') + '">' + L('รายการ') + '</button>' +
      '<button data-act="adv-mode" data-v="calendar" class="' + (a.mode === 'calendar' ? 'on' : '') + '">' + L('ปฏิทิน') + '</button></div>';
    h += '<button class="vtb-btn icon' + (a.help ? ' on' : '') + '" data-act="adv-help" title="' +
      L('วิธีใช้ตัวดำเนินการค้นหา') + '">?</button>';
    if (ss) {
      if (advDirty()) {
        h += '<button class="btn btn-sm btn-primary" data-act="ss-update" data-id="' + esc(ss.id) + '">' + L('บันทึกทับ') + '</button>';
      }
      h += '<button class="btn btn-sm btn-ghost" data-act="ss-rename" data-id="' + esc(ss.id) + '" title="' +
        L('เปลี่ยนชื่อ') + '">' + I('pencil', 13) + '</button>' +
        '<button class="btn btn-sm btn-ghost" data-act="ss-delete" data-id="' + esc(ss.id) + '" title="' +
        L('ลบการค้นหาที่บันทึกไว้') + '">' + I('trash', 13) + '</button>';
    } else if ((r.q || '').trim() || n) {
      h += '<button class="btn btn-sm" data-act="ss-save" title="' + L('บันทึกไว้ที่แถบซ้าย') + '">' +
        I('star', 13) + ' ' + L('บันทึกการค้นหา') + '</button>';
    }
    h += '</div>';
    if (a.help) h += R.searchHelp();
    if (a.open || n) {
      var ffs = S.filterFields('*');
      h += '<div class="adv-conds">';
      a.conds.forEach(function (c, i) {
        var def = S.filterField('*', c.f);
        var ops = def ? S.FILTER_OPS[def.kind] || [] : [];
        h += '<div class="flt-row">' + (i ? '<span class="flt-and">' + L('และ') + '</span>' : '') +
          '<div class="flt-line">' +
          optSelect('as-field', ffs.map(function (x) { return [x.id, x.custom ? x.label : L(x.label)]; })
            .concat(def ? [] : [[c.f, L('(ฟิลด์ถูกลบแล้ว)')]]), c.f, ' data-i="' + i + '"') +
          optSelect('as-op', ops.map(function (o) { return [o[0], L(o[1])]; }), c.op, ' data-i="' + i + '"') +
          '<button class="flt-del" data-act="as-del" data-i="' + i + '" title="' + L('เอาเงื่อนไขนี้ออก') + '">' +
          I('close', 13) + '</button></div>' + fltValueHtml('*', c, i, 'as') + '</div>';
      });
      h += '<div class="opt-acts"><button class="btn btn-sm" data-act="as-add">' + I('plus', 13) + ' ' +
        L('เพิ่มตัวกรอง') + '</button>' +
        (n ? '<button class="btn btn-sm btn-ghost" data-act="as-clear">' + L('ล้างตัวกรอง') + '</button>' : '') + '</div>';
      h += '<p class="opt-note">' + L('ทุกเงื่อนไขต้องตรงพร้อมกัน ค้นได้ทุกโปรเจกต์ที่คุณเห็น งานส่วนตัวของคนอื่นไม่แสดง') + '</p>';
      h += '</div>';
    }
    return h + '</div>';
  }

  /** วาดหน้าค้นหาใหม่โดยไม่เสียโฟกัสช่องค้นหาด้านบน */
  function refreshSearch() {
    $sidebar.innerHTML = R.sidebar(state.route, state.navPick);
    renderViewBody();
    syncHash();
  }

  /* ---------- คีย์ลัดบนแป้นภาษาไทย ----------
   * Tab+D บนแป้นไทยได้ e.key = 'ก' จึงจับคู่ไม่เจอ — ดูตำแหน่งปุ่มจาก e.code (KeyD, Slash …) ก่อน */
  function keyOf(e) {
    var c = e.code || '';
    var m = c.match(/^Key([A-Z])$/);
    if (m) return m[1].toLowerCase();
    m = c.match(/^Digit(\d)$/);
    if (m) return m[1];
    if (c === 'Slash') return '/';
    return String(e.key || '').toLowerCase();
  }

  /** งานที่คีย์ลัดจะทำกับ — งานที่เปิดอยู่ ไม่มีก็แถวที่ถูกชี้ หรืองานที่เลือกไว้ชิ้นเดียว */
  function focusTaskId() {
    if (state.openTaskId && S.task(state.openTaskId)) return state.openTaskId;
    if (state.cursor && S.task(state.cursor)) return state.cursor;
    var ids = selectedIds();
    return ids.length === 1 ? ids[0] : null;
  }

  /** Sprint 1A — ติ๊กเสร็จ/เปิดใหม่ทางเดียวกันทุกที่ (ช่องติ๊กในรายการ งานของฉัน หัวแผงงาน Tab+Y)
   *  เดิมเฉพาะ Ctrl+Enter ที่ขึ้น "ทำเสร็จแล้ว · ย้อนกลับ" กดช่องติ๊กแล้วงานหายจากรายการเงียบ ๆ ไม่รู้จะเอาคืนยังไง */
  function toggleDone(id) {
    var t = S.task(id);
    if (!t) return;
    var was = t.completed;
    S.updateTask(id, { completed: !was });
    var now = S.task(id);
    if (now && now.completed !== was) {
      toast(now.completed ? L('ทำเสร็จแล้ว') : L('เปิดงานใหม่แล้ว'), L('ย้อนกลับ'), 'undo');
    }
  }

  /** เปิดแผงงาน (ถ้ายังไม่เปิด) แล้วทำต่อกับปุ่ม/ช่องในแผง */
  function withDrawer(fn) {
    var id = focusTaskId();
    if (!id) { toast(L('เลือกงานก่อน (คลิกแถว หรือใช้ลูกศรขึ้นลง)')); return; }
    if (state.openTaskId !== id) openTask(id);
    setTimeout(function () { fn(id); }, 0);
  }

  /** แถวงานที่เห็นบนหน้าจอตามลำดับ ใช้กับลูกศรขึ้นลง */
  function visibleTaskIds() {
    var out = [];
    Array.prototype.forEach.call($view.querySelectorAll('.tr[data-id], .row[data-id], .card[data-id]'), function (n) {
      var id = n.dataset.id;
      if (id && out.indexOf(id) < 0 && n.offsetParent !== null) out.push(id);
    });
    return out;
  }

  function moveSelection(delta) {
    var ids = visibleTaskIds();
    if (!ids.length) return false;
    var cur = state.cursor || state.openTaskId;
    var i = ids.indexOf(cur);
    var j = i < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, i + delta));
    var id = ids[j];
    setCursor(id);
    state.selAnchor = id;
    if (state.openTaskId) openTask(id);
    var node = $view.querySelector('[data-id="' + id + '"].tr, [data-id="' + id + '"].row, [data-id="' + id + '"].card');
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
    return true;
  }

  /** ไฮไลต์รายการที่เลือกด้วยแป้นพิมพ์ในกล่องแจ้งเตือน (J/K) */
  function markKbCursor() {
    if (state.cursor) {
      var cr = $view.querySelector('.row[data-id="' + state.cursor + '"], .card[data-id="' + state.cursor + '"]');
      if (cr) cr.classList.add('cursor');
    }
    if (state.route.type !== 'inbox' || !state.inbox.cur) return;
    var n = $view.querySelector('.nrow[data-id="' + state.inbox.cur + '"]');
    if (n) n.classList.add('kb-cur');
  }

  function inboxKey(k) {
    var rows = Array.prototype.slice.call($view.querySelectorAll('.nrow[data-id]'));
    if (!rows.length) return false;
    var ids = rows.map(function (r) { return r.dataset.id; });
    var i = ids.indexOf(state.inbox.cur);
    if (k === 'j' || k === 'k') {
      var j = i < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, i + (k === 'j' ? 1 : -1)));
      state.inbox.cur = ids[j];
      rows.forEach(function (r) { r.classList.toggle('kb-cur', r.dataset.id === state.inbox.cur); });
      if (rows[j].scrollIntoView) rows[j].scrollIntoView({ block: 'nearest' });
      return true;
    }
    if (i < 0) { toast(L('กด J หรือ K เพื่อเลือกรายการก่อน')); return true; }
    var nid = ids[i], n = S.notification(nid);
    if (!n) return false;
    if (!S.isActive()) { denyToast(); return true; }
    /* Sprint 2B — แถวที่รวมหลายรายการ: I เก็บทั้งกลุ่ม U อ่าน/ยังไม่อ่านทั้งกลุ่ม (เหมือนปุ่มบนแถว) */
    var grpIds = rows[i].dataset.group ? rows[i].dataset.group.split(',') : null;
    if (grpIds && !n.archived && (k === 'i' || k === 'u')) {
      if (k === 'i') {
        state.inbox.cur = ids[i + 1] || ids[i - 1] || null;
        S.archiveNotifs(grpIds);
        toast(L('เก็บ {n} รายการแล้ว', { n: grpIds.length }), L('ย้อนกลับ'), 'undo');
      } else {
        S.setNotifsRead(grpIds, grpIds.some(function (x) { var q = S.notification(x); return q && !q.read; }));
      }
      return true;
    }
    if (k === 'f') {
      var bm = S.toggleBookmark(nid);
      toast(bm ? L('บุ๊กมาร์กไว้แล้ว ดูได้ที่แท็บบุ๊กมาร์ก') : L('เอาบุ๊กมาร์กออกแล้ว'));
    } else if (k === 'i') {
      /* เก็บแล้วเลื่อนไปรายการถัดไปเอง ไล่เก็บได้รวดเดียว */
      state.inbox.cur = ids[i + 1] || ids[i - 1] || null;
      if (n.archived) S.unarchiveNotification(nid); else S.archiveNotification(nid);
      toast(n.archived ? L('ย้ายกลับไปกิจกรรมแล้ว') : L('เก็บแล้ว'));
    } else if (k === 'u') {
      S.setNotifRead(nid, !n.read);
    } else if (k === 'enter') {
      var row = rows[i];
      if (row) row.click();
    } else return false;
    return true;
  }

  /* ---------- ฟิลด์ คลังฟิลด์ ---------- */

  function fieldTypeLabel(type) {
    var ft = S.FIELD_TYPES.filter(function (x) { return x.id === type; })[0];
    return ft ? L(ft.label) : type;
  }

  /** จัดการฟิลด์ของโปรเจกต์ — แก้ไข ยกขึ้นคลัง เอาออก เพิ่มใหม่ หรือหยิบจากคลัง */
  function fieldsModal(projectId) {
    var p = S.project(projectId);
    var h = '<h2>' + L('ฟิลด์ของ') + ' ' + R.esc(p.name) + '</h2>';
    if (!p.fields.length) {
      h += '<div class="prj-note">' + L('ยังไม่มีฟิลด์') + '</div>';
    }
    p.fields.forEach(function (f) {
      h += '<div class="mini-row fld-row"><div class="grow"><div>' +
        (f.lib ? '<span class="lib-badge" title="' + L('ฟิลด์จากคลังขององค์กร') + '">' + I('building', 11) + '</span> ' : '') +
        R.esc(f.name) + '</div>' +
        '<div class="sub">' + R.esc(fieldTypeLabel(f.type)) +
        (f.type === 'id' ? ' · ' + R.esc(f.prefix + '-' + f.next) + ' ' + L('(เลขถัดไป)') : '') +
        (f.options && f.options.length ? ' · ' + R.esc(f.options.map(function (o) { return o.name; }).join(', ')) : '') +
        (f.notify ? ' · ' + L('แจ้งเมื่อค่าเปลี่ยน') : '') +
        (f.desc ? '<br>' + R.esc(f.desc) : '') + '</div></div>' +
        '<button class="btn btn-sm" data-act="field-edit" data-project="' + R.esc(projectId) + '" data-field="' +
        R.esc(f.id) + '">' + L('แก้ไข') + '</button>' +
        (!f.lib && f.type !== 'id' ? '<button class="btn btn-sm btn-ghost" data-act="field-promote" data-project="' +
          R.esc(projectId) + '" data-field="' + R.esc(f.id) + '" title="' + L('ให้ทุกโปรเจกต์ใช้ฟิลด์นี้ได้') + '">' +
          L('บันทึกลงคลัง') + '</button>' : '') +
        '<button class="btn btn-sm btn-danger" data-act="delete-field" data-project="' +
        R.esc(projectId) + '" data-field="' + R.esc(f.id) + '">' + (f.lib ? L('เอาออก') : L('ลบ')) + '</button></div>';
    });
    h += '<div class="modal-acts fld-acts">' +
      '<button class="btn" data-act="field-lib">' + I('building', 13) + ' ' + L('คลังฟิลด์ขององค์กร') + '</button>' +
      '<span class="grow"></span>' +
      '<button class="btn" data-act="field-lib-pick" data-project="' + R.esc(projectId) + '">' + L('+ จากคลังฟิลด์') + '</button>' +
      '<button class="btn btn-primary" data-act="pick-ftype" data-v="text">' + L('+ ฟิลด์ใหม่') + '</button></div>';
    return h;
  }

  /** เลือกฟิลด์จากคลังมาใช้ในโปรเจกต์ */
  function libPickModal(projectId) {
    var p = S.project(projectId);
    var have = {};
    p.fields.forEach(function (f) { have[f.id] = true; });
    var list = S.fieldLib().filter(function (f) { return !have[f.id]; });
    var h = '<h2>' + L('เพิ่มฟิลด์จากคลัง') + '</h2><p class="prj-note">' +
      L('ฟิลด์จากคลังเป็นฟิลด์เดียวกันทุกโปรเจกต์ แก้ชื่อหรือตัวเลือกที่ใดก็เปลี่ยนทุกที่ งานที่อยู่สองโปรเจกต์มีค่าเดียว') + '</p>';
    if (!list.length) h += '<div class="prj-note">' + L('ไม่มีฟิลด์ในคลังที่ยังไม่ได้ใช้') + '</div>';
    list.forEach(function (f) {
      h += '<div class="mini-row"><div class="grow"><div>' + R.esc(f.name) + '</div><div class="sub">' +
        R.esc(fieldTypeLabel(f.type)) + (f.desc ? ' · ' + R.esc(f.desc) : '') + '</div></div>' +
        '<button class="btn btn-sm btn-primary" data-act="field-lib-use" data-project="' + R.esc(projectId) +
        '" data-field="' + R.esc(f.id) + '">' + L('ใช้') + '</button></div>';
    });
    h += '<div class="modal-acts"><button class="btn" data-act="manage-fields" data-id="' + R.esc(projectId) + '">' +
      L('ย้อนกลับ') + '</button></div>';
    return h;
  }

  /** คลังฟิลด์ขององค์กร — สร้าง แก้ (เปลี่ยนตามทุกโปรเจกต์) เอาออกจากคลัง */
  function libModal() {
    var list = S.fieldLib();
    var h = '<h2>' + L('คลังฟิลด์ขององค์กร') + '</h2><p class="prj-note">' +
      L('ฟิลด์ที่ใช้ร่วมกันได้ทุกโปรเจกต์ แก้ที่นี่แล้วทุกโปรเจกต์ที่ใช้อยู่เปลี่ยนตาม') + '</p>';
    if (!list.length) h += '<div class="prj-note">' + L('ยังไม่มีฟิลด์ในคลัง') + '</div>';
    list.forEach(function (f) {
      var used = S.libUsage(f.id);
      h += '<div class="mini-row"><div class="grow"><div>' + R.esc(f.name) + '</div><div class="sub">' +
        R.esc(fieldTypeLabel(f.type)) + ' · ' + L('ใช้ใน {n} โปรเจกต์', { n: used.length }) +
        (f.desc ? '<br>' + R.esc(f.desc) : '') + '</div></div>' +
        '<button class="btn btn-sm" data-act="field-edit" data-field="' + R.esc(f.id) + '">' + L('แก้ไข') + '</button>' +
        '<button class="btn btn-sm btn-danger" data-act="lib-delete" data-field="' + R.esc(f.id) + '">' +
        L('เอาออกจากคลัง') + '</button></div>';
    });
    var back = state.route.type === 'project'
      ? '<button class="btn" data-act="manage-fields" data-id="' + R.esc(state.route.id) + '">' + L('ย้อนกลับ') + '</button>'
      : '<button class="btn" data-act="close-modal">' + L('ปิด') + '</button>';
    h += '<div class="modal-acts">' + back + '<span class="grow"></span>' +
      '<button class="btn btn-primary" data-act="lib-new">' + L('+ สร้างฟิลด์ในคลัง') + '</button></div>';
    return h;
  }

  /** แก้นิยามฟิลด์ (ของโปรเจกต์ หรือในคลังเมื่อไม่ส่ง projectId) */
  function fieldEditModal(projectId, fieldId) {
    var f = projectId ? (S.project(projectId).fields.filter(function (x) { return x.id === fieldId; })[0])
                      : S.libField(fieldId);
    if (!f) return '';
    var hasOpt = f.type === 'select' || f.type === 'multi';
    var h = '<h2>' + L('แก้ไขฟิลด์') + '</h2>';
    if (f.lib || !projectId) {
      h += '<p class="prj-note">' + I('building', 12) + ' ' +
        L('ฟิลด์จากคลัง — แก้แล้วเปลี่ยนตามทุกโปรเจกต์ที่ใช้ ({n} โปรเจกต์)', { n: S.libUsage(f.id).length }) + '</p>';
    }
    h += '<div class="field"><label>' + L('ชื่อฟิลด์') + ' *</label><input id="feName" value="' + R.esc(f.name) + '"></div>';
    h += '<div class="field"><label>' + L('คำอธิบาย') + '</label><textarea id="feDesc" rows="2" placeholder="' +
      L('บอกทีมว่าฟิลด์นี้ใช้กรอกอะไร') + '">' + R.esc(f.desc || '') + '</textarea></div>';
    if (f.type === 'id') {
      h += '<div class="field"><label>' + L('คำนำหน้ารหัส') + '</label><input id="fePrefix" value="' + R.esc(f.prefix) +
        '" maxlength="8"><div class="fld-hint">' + L('ตัวอักษรอังกฤษหรือตัวเลข เช่น REQ → REQ-12 เลขถัดไปคือ {n}', { n: f.next }) + '</div></div>';
    }
    if (hasOpt) {
      h += '<div class="field"><label>' + L('ตัวเลือก') + '</label><div id="nfOpts">';
      f.options.forEach(function (o) { h += optionRow(o.name, o.color).replace('class="opt-name"', 'class="opt-name" data-old="' + R.esc(o.name) + '"'); });
      h += '</div><button type="button" class="btn btn-sm btn-ghost" data-act="add-option">' + I('plus', 13) + ' ' +
        L('เพิ่มตัวเลือก') + '</button><div class="fld-hint">' + L('เปลี่ยนชื่อตัวเลือกแล้วค่าในงานเปลี่ยนตาม') + '</div></div>';
      h += '<label class="chk"><input type="checkbox" id="feNotify"' + (f.notify ? ' checked' : '') + '> ' +
        L('แจ้งผู้ติดตามงานเมื่อค่าในฟิลด์นี้เปลี่ยน') + '</label>';
    }
    if (f.type === 'formula') h += formulaFieldsHtml(projectId, S.formulaText(f), false, f.id);   // 3c
    if (f.type === 'number' || f.type === 'formula') h += numberFormatFields(f.format);
    h += '<div class="modal-acts"><button class="btn" data-act="' + (projectId ? 'manage-fields' : 'field-lib') +
      '" data-id="' + R.esc(projectId || '') + '">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-field-edit" data-project="' + R.esc(projectId || '') +
      '" data-field="' + R.esc(f.id) + '">' + L('บันทึก') + '</button></div>';
    return h;
  }

  /** ตัวเลือกที่กรอกในหน้าต่าง { name, color, old } */
  function readOptionRows() {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('#nfOpts .opt-row'), function (r) {
      var inp = r.querySelector('.opt-name');
      var v = inp.value.trim();
      if (v) out.push({ name: v, color: rgbToHex(r.querySelector('.opt-dot').style.background), old: inp.dataset.old || null });
    });
    return out;
  }

  /* ---------- นำเข้า CSV แบบจับคู่คอลัมน์ ---------- */

  function csvTargetOptions(pid, cur) {
    var p = S.project(pid);
    var opts = S.CSV_TARGETS.map(function (c) { return [c.id, L(c.label)]; });
    (p.fields || []).forEach(function (f) {
      if (f.type !== 'id') opts.push(['field:' + f.id, L('ฟิลด์: {f}', { f: f.name })]);
    });
    S.CSV_NEW_TYPES.forEach(function (t) {
      opts.push(['new:' + t, L('สร้างฟิลด์ใหม่ ({t})', { t: fieldTypeLabel(t) })]);
    });
    return opts.map(function (o) {
      return '<option value="' + R.esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + R.esc(o[1]) + '</option>';
    }).join('');
  }

  function csvMapModal() {
    var c = state.csv;
    var pv;
    try { pv = S.csvPreview(c.pid, c.text); } catch (err) {
      return '<h2>' + L('นำเข้างานจาก CSV') + '</h2><p class="prj-note">' + R.esc(L(err.message)) + '</p>' +
        '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    }
    if (!c.map || c.map.length !== pv.head.length) c.map = pv.guess.slice();
    var h = '<h2>' + L('นำเข้างานจาก CSV') + '</h2>';
    h += '<div class="csv-top"><span>' + L('{n} แถว · {c} คอลัมน์', { n: pv.total, c: pv.head.length }) + '</span>' +
      '<label>' + L('การเข้ารหัสไฟล์') + ' <select id="csvEnc" data-act="csv-enc">' +
      '<option value="utf-8"' + (c.enc === 'utf-8' ? ' selected' : '') + '>UTF-8</option>' +
      '<option value="windows-874"' + (c.enc === 'windows-874' ? ' selected' : '') + '>Windows-874 (' + L('ภาษาไทยจาก Excel รุ่นเก่า') + ')</option>' +
      '</select></label></div>';
    h += '<p class="prj-note">' + L('เลือกว่าแต่ละคอลัมน์คืออะไร ถ้าภาษาไทยเป็นตัวประหลาด ให้เปลี่ยนการเข้ารหัส (Excel: บันทึกเป็น “CSV UTF-8” จะได้ผลดีที่สุด) ทุกแถวเป็นงานใหม่ งานหลักและลำดับก่อนหลังจับคู่จากชื่องาน') + '</p>';
    h += '<div class="csv-map">';
    pv.head.forEach(function (hd, k) {
      var samples = pv.sample.map(function (r) { return r[k] || ''; }).filter(Boolean).slice(0, 3);
      h += '<div class="csv-row"><div class="csv-col"><b>' + R.esc(hd || L('(ไม่มีชื่อ)')) + '</b><em>' +
        R.esc(samples.join(' · ').slice(0, 90) || '—') + '</em></div>' +
        '<select class="inp csv-sel" data-act="csv-map" data-k="' + k + '">' + csvTargetOptions(c.pid, c.map[k]) + '</select></div>';
    });
    h += '</div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      /* คีย์ของปุ่มแยกจาก "นำเข้า {n} งาน" ที่ใช้ในบันทึกการทำงาน (ภาษาอังกฤษเป็นอดีตกาล "imported …") */
      '<button class="btn btn-primary" data-act="do-csv-import">' + L('นำเข้างาน {n} งาน', { n: pv.total }) + '</button></div>';
    return h;
  }

  function readCsvFile(enc) {
    var c = state.csv;
    if (!c || !c.file) return;
    var fr = new FileReader();
    fr.onload = function () {
      c.text = String(fr.result || '');
      c.enc = enc;
      c.map = null;
      openModal(csvMapModal(), true);
    };
    fr.onerror = function () { toast(L('อ่านไฟล์ไม่สำเร็จ')); };
    try { fr.readAsText(c.file, enc); } catch (e) { fr.readAsText(c.file); }
  }

  /* ---------- บทบาทในโปรเจกต์ ---------- */

  function rolesModal(projectId) {
    var p = S.project(projectId);
    var ids = [];
    function add(id) { if (id && ids.indexOf(id) < 0 && S.user(id) && S.user(id).active !== false) ids.push(id); }
    add(p.owner);
    S.projectMembers(projectId).forEach(function (m) { add(m.userId); });
    Object.keys(p.roles || {}).forEach(add);
    /* โปรเจกต์เปิดทั้งองค์กรไม่มีรายชื่อสมาชิก — ให้เลือกจากคนที่ถืองานในโปรเจกต์ แล้วค่อยทุกคน */
    S.tasksInProject(projectId).forEach(function (x) { add(x.task.assigneeId); });
    if (ids.length < 3) S.db.users.forEach(function (u) { add(u.id); });
    var h = '<h2>' + L('บทบาทในโปรเจกต์') + '</h2><p class="prj-note">' +
      L('พิมพ์บทบาทของแต่ละคน เช่น ผู้อนุมัติ ผู้ประสานงาน ฝ่ายออกแบบ แสดงที่หน้าภาพรวม ไม่เกี่ยวกับสิทธิ์') + '</p>';
    h += '<div class="roles-grid">';
    ids.forEach(function (id) {
      var u = S.user(id);
      h += '<label class="role-row">' + R.avatar(u, 'sm') + '<span class="nm">' + R.esc(u.name) + '</span>' +
        '<input class="inp role-in" data-user="' + R.esc(id) + '" maxlength="60" value="' +
        R.esc((p.roles || {})[id] || '') + '" placeholder="' + L('บทบาท') + '"></label>';
    });
    h += '</div><div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-roles" data-id="' + R.esc(projectId) + '">' + L('บันทึก') + '</button></div>';
    return h;
  }

  /* ---------- แก้หลายงานพร้อมกัน ---------- */

  function bulkMoreMenu() {
    var r = state.route;
    var h = '';
    function item(act, icon, label, extra) {
      return '<button data-act="' + act + '"' + (extra || '') + '>' + I(icon, 14) + '<span class="grow">' + label + '</span></button>';
    }
    if (r.type === 'project' && S.project(r.id)) h += item('bulk-section', 'grid', L('ย้ายไปเซกชัน…'));
    h += item('bulk-project', 'plus', L('เพิ่มเข้าโปรเจกต์…'));
    h += item('bulk-field', 'hash', L('ตั้งค่าฟิลด์…'));
    h += item('bulk-followers', 'users', L('เพิ่มผู้ติดตาม…'));
    h += item('bulk-tag', 'flag', L('เพิ่มแท็ก…'));
    h += '<div class="pop-sep"></div>';
    h += item('bulk-type', 'diamond', L('ทำเป็นหมุดหมาย'), ' data-v="milestone"');
    h += item('bulk-type', 'checkCircle', L('ทำเป็นงานขออนุมัติ'), ' data-v="approval"');
    h += item('bulk-type', 'check', L('ทำเป็นงานธรรมดา'), ' data-v="task"');
    h += '<div class="pop-sep"></div>';
    h += item('bulk-dep', 'blocked', L('ให้รองานอื่น…'));
    h += item('bulk-chain', 'subtask', L('ต่อลำดับก่อนหลังเป็นสายเดียว'));
    h += item('bulk-merge', 'copy', L('รวมเป็นงานซ้ำ…'));
    h += item('bulk-links', 'link', L('คัดลอกลิงก์'));
    if (r.type === 'project' && S.automations(r.id).some(function (a) { return a.on && a.trigger.type === 'manual'; })) {
      h += '<div class="pop-sep"></div>' + item('auto-bulk', 'bolt', L('รันอัตโนมัติ…'));
    }
    return h;
  }

  /** เลือกโปรเจกต์และคอลัมน์ (ใช้กับเพิ่มหลายงานเข้าโปรเจกต์) */
  function bulkProjectModal() {
    var projs = S.visibleProjects().filter(function (p) { return S.canInProject(p.id, 'edit'); });
    var first = projs[0];
    var h = '<h2>' + L('เพิ่ม {n} งานเข้าโปรเจกต์', { n: selCount() }) + '</h2>';
    h += '<div class="field"><label>' + L('โปรเจกต์') + '</label><select id="mpProject" data-act="mp-project">' +
      projs.map(function (p) { return '<option value="' + R.esc(p.id) + '">' + R.esc(p.icon + ' ' + p.name) + '</option>'; }).join('') +
      '</select></div>';
    h += '<div class="field"><label>' + L('เซกชัน') + '</label><select id="mpSection">' +
      (first ? sectionOptions(first.id) : '') + '</select></div>';
    h += '<p class="prj-note">' + L('งานยังอยู่ในโปรเจกต์เดิมด้วย (อยู่ได้หลายโปรเจกต์) งานย่อยไม่ถูกเพิ่ม') + '</p>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-bulk-project"' + (first ? '' : ' disabled') + '>' + L('เพิ่ม') + '</button></div>';
    return h;
  }

  /** ฟิลด์ที่ตั้งได้กับงานที่เลือก — ฟิลด์ของโปรเจกต์ที่งานเหล่านั้นอยู่ (ไม่รวมรหัสงาน) */
  function bulkFieldList() {
    var seen = {}, out = [];
    selectedIds().forEach(function (id) {
      var t = S.task(id);
      if (!t) return;
      S.projectsOfTask(S.rootOf(t).id).forEach(function (x) {
        (x.project.fields || []).forEach(function (f) {
          if (seen[f.id] || f.type === 'id') return;
          seen[f.id] = true;
          out.push({ f: f, p: x.project });
        });
      });
    });
    return out;
  }

  function bulkFieldValueInput(f) {
    if (!f) return '';
    if (f.type === 'select' || f.type === 'multi') {
      return '<div class="flt-chips" id="bfVal">' + f.options.map(function (o) {
        return '<button type="button" class="flt-chip" data-act="bf-opt" data-v="' + R.esc(o.name) + '"' +
          (f.type === 'select' ? ' data-single="1"' : '') + '><i class="flt-dot" style="background:' + R.esc(o.color) +
          '"></i>' + R.esc(o.name) + '</button>';
      }).join('') + '</div>';
    }
    if (f.type === 'person') {
      return '<select id="bfVal" class="inp"><option value="">—</option>' + S.db.users.filter(function (u) {
        return u.active !== false;
      }).map(function (u) { return '<option value="' + R.esc(u.id) + '">' + R.esc(u.name) + '</option>'; }).join('') + '</select>';
    }
    return '<input id="bfVal" class="inp" type="' + (f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text') +
      '"' + (f.type === 'number' ? ' step="any"' : '') + '>';
  }

  function bulkFieldModal(fid) {
    var list = bulkFieldList();
    var h = '<h2>' + L('ตั้งค่าฟิลด์ให้ {n} งาน', { n: selCount() }) + '</h2>';
    if (!list.length) {
      return h + '<p class="prj-note">' + L('งานที่เลือกไม่ได้อยู่ในโปรเจกต์ที่มีฟิลด์') + '</p>' +
        '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    }
    var cur = list.filter(function (x) { return x.f.id === fid; })[0] || list[0];
    h += '<div class="field"><label>' + L('ฟิลด์') + '</label><select id="bfField" data-act="bf-field">' +
      list.map(function (x) {
        return '<option value="' + R.esc(x.f.id) + '"' + (x === cur ? ' selected' : '') + '>' + R.esc(x.f.name + ' · ' + x.p.name) + '</option>';
      }).join('') + '</select></div>';
    h += '<div class="field"><label>' + L('ค่า') + '</label>' + bulkFieldValueInput(cur.f) + '</div>';
    h += '<p class="prj-note">' + L('เว้นว่าง = ล้างค่า') + '</p>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-bulk-field" data-field="' + R.esc(cur.f.id) + '">' + L('ตั้งค่า') + '</button></div>';
    return h;
  }

  function bulkFollowersModal() {
    var h = '<h2>' + L('เพิ่มผู้ติดตามให้ {n} งาน', { n: selCount() }) + '</h2><div class="dup-grid people">';
    S.db.users.forEach(function (u) {
      if (u.active === false) return;
      h += '<label class="chk"><input type="checkbox" class="bf-user" value="' + R.esc(u.id) + '"> ' +
        R.avatar(u, 'sm') + ' ' + R.esc(u.name) + '</label>';
    });
    h += '</div><div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-bulk-followers">' + L('เพิ่ม') + '</button></div>';
    return h;
  }

  function bulkDepModal() {
    return '<h2>' + L('ให้ {n} งานที่เลือกรองานไหน', { n: selCount() }) + '</h2>' +
      '<p class="prj-note">' + L('งานที่เลือกทั้งหมดจะรองานนี้ให้เสร็จก่อน (จบ → เริ่ม)') + '</p>' +
      '<div class="field"><input id="bdSearch" placeholder="' + L('พิมพ์เพื่อค้นหางาน') + '"></div>' +
      '<div id="bdResults">' + bulkDepResults('') + '</div>' +
      '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
  }

  function bulkDepResults(q) {
    var sel = state.sel;
    q = (q || '').trim();
    var list = q ? S.searchAdv({ q: q, limit: 40 }) : S.db.tasks.filter(function (t) {
      return !t.completed && S.canSeeTask(t.id);
    }).slice(0, 40);
    list = list.filter(function (t) { return !sel[t.id]; }).slice(0, 12);
    if (!list.length) return '<div class="prj-note">' + L('ไม่พบงาน') + '</div>';
    return list.map(function (x) {
      var home = S.projectsOfTask(S.rootOf(x).id)[0];
      return '<div class="mini-row"><div class="grow"><div>' + R.esc(x.name) + '</div><div class="sub">' +
        R.esc(home ? home.project.name : L('ไม่อยู่ในโปรเจกต์')) + '</div></div>' +
        '<button class="btn btn-sm btn-primary" data-act="do-bulk-dep" data-target="' + R.esc(x.id) + '">' +
        L('เลือก') + '</button></div>';
    }).join('');
  }

  function bulkMergeModal() {
    var ids = selectedIds();
    var h = '<h2>' + L('รวม {n} งานเป็นงานเดียว', { n: ids.length }) + '</h2><p class="prj-note">' +
      L('เลือกงานหลักที่จะเก็บไว้ งานที่เหลือจะถูกติ๊กเสร็จและเติม [ซ้ำ] หน้าชื่อ แท็ก ผู้ติดตาม และคนที่ถูกใจย้ายไปที่งานหลัก') + '</p>';
    ids.forEach(function (id) {
      var t = S.task(id);
      if (!t) return;
      h += '<div class="mini-row"><div class="grow"><div>' + R.esc(t.name) + '</div></div>' +
        '<button class="btn btn-sm btn-primary" data-act="do-bulk-merge" data-target="' + R.esc(id) + '">' +
        L('เก็บงานนี้') + '</button></div>';
    });
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button></div>';
    return h;
  }

  function appUrl() { return global.location.origin + global.location.pathname; }

  /* ---------- สลับบัญชีเพื่อดูมุมของคนอื่น ----------
   *
   * มีไว้ให้ลองดูว่าคนอื่นเห็นหน้าจอแบบไหน ตอนสาธิตและตอนตั้งค่าสิทธิ์
   * เดิมสลับไปเป็นใครก็ได้ รวมถึงบัญชีผู้ดูแล
   * สมาชิกธรรมดาจึงกดสองครั้งก็เข้าหน้าผู้ดูแลและโหลดข้อมูลทั้งก้อนออกไปได้
   * ซึ่งทำให้การซ่อนเมนูผู้ดูแลไม่มีความหมายอะไรเลย
   *
   * จึงให้สลับได้เฉพาะบัญชีที่สิทธิ์ไม่สูงกว่าตัวเอง — ดูลงได้ ไต่ขึ้นไม่ได้
   * แล้วจำต้นทางไว้ใน sessionStorage เพื่อให้มีทางกลับเสมอ
   * เก็บใน sessionStorage ไม่ใช่ในฐานข้อมูล เพราะเป็นเรื่องของแท็บนี้เท่านั้น
   * ไม่ควรติดไปกับข้อมูลที่ซิงก์ขึ้นส่วนกลาง
   *
   * นี่คือความเรียบร้อย ไม่ใช่กำแพงความปลอดภัย — ข้อมูลทั้งหมดอยู่ในเบราว์เซอร์
   * คนที่ตั้งใจจริงยังแก้ผ่านเครื่องมือนักพัฒนาได้อยู่ดี ตามที่หน้าผู้ดูแลบอกไว้
   * แต่การมีปุ่มให้กดสองทีกับการต้องตั้งใจงัด เป็นคนละเรื่องกัน
   */
  var ROLE_RANK = { admin: 3, member: 2, guest: 1, viewer: 0 };

  function rankOf(userId) {
    var u = S.user(userId);
    return ROLE_RANK[(u && u.role) || 'member'] || 0;
  }

  function viewAsOrigin() {
    try { return global.sessionStorage.getItem('orbit.viewAs') || null; }
    catch (e) { return null; }
  }
  function setViewAsOrigin(id) {
    try {
      if (id) global.sessionStorage.setItem('orbit.viewAs', id);
      else global.sessionStorage.removeItem('orbit.viewAs');
    } catch (e) { /* โหมดไม่ระบุตัวตนห้ามเขียน ก็แค่ไม่มีทางลัดกลับ */ }
  }

  function canSwitchTo(id) {
    if (id === viewAsOrigin()) return true;          // กลับบัญชีเดิมได้เสมอ
    return rankOf(id) <= rankOf(S.db.currentUserId);
  }

  function switchUserModal() {
    var origin = viewAsOrigin();
    var h = '<h2>' + L('สลับผู้ใช้') + '</h2>';
    h += '<p class="prj-note">' +
      L('ใช้ดูว่าคนอื่นเห็นหน้าจอแบบไหน สลับไปบัญชีที่สิทธิ์สูงกว่าตัวเองไม่ได้') + '</p>';

    if (origin && S.user(origin)) {
      h += '<div class="prj-warn">' + I('users', 15) + '<span>' +
        L('ตอนนี้กำลังดูในมุมของคนอื่นอยู่ ต้นทางคือ {name}',
          { name: S.user(origin).name }) + '</span></div>';
    }

    h += '<div style="display:flex;flex-direction:column;gap:6px">';
    S.db.users.forEach(function (u) {
      var now = u.id === S.db.currentUserId;
      var ok = canSwitchTo(u.id);
      h += '<button class="btn" style="justify-content:flex-start"' +
        (now || !ok ? ' disabled' : '') +
        ' data-act="do-switch-user" data-id="' + R.esc(u.id) + '"' +
        (!ok && !now ? ' title="' + L('บัญชีนี้มีสิทธิ์สูงกว่าคุณ') + '"' : '') + '>' +
        R.avatar(u) + ' <span class="grow" style="text-align:left">' + R.esc(u.name) +
        '</span><span style="font-size:12px;color:var(--fg-soft)">' +
        /* บัญชีที่ปิดไปแล้วบอกตรง ๆ — เดิมขึ้นบทบาท ("สมาชิก") เหมือนบัญชีที่ใช้งานได้ */
        (now ? L('ใช้อยู่') : (u.id === origin ? L('กลับบัญชีนี้')
          : u.active === false ? L('ปิดใช้งานแล้ว') : R.roleLabel(u.role))) + '</span></button>';
    });
    h += '</div><div class="modal-acts">' +
      '<button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  /* ---------- บันทึกลงเครื่องไม่สำเร็จ ----------
   *
   * บอกสามอย่างตามลำดับที่คนต้องรู้จริง ๆ
   * ตอนนี้เสียหายแค่ไหน ทำอะไรทันทีเพื่อไม่ให้งานหาย แล้วค่อยแก้ที่ต้นเหตุ
   * ปุ่มแรกคือดาวน์โหลดสำรอง เพราะเป็นอย่างเดียวที่กันงานหายได้เดี๋ยวนี้
   */
  function saveErrorModal() {
    var err = S.saveError();
    if (!err) return '<h2>' + L('บันทึกได้ตามปกติแล้ว') + '</h2>' +
      '<p class="prj-note">' + L('ลองบันทึกอีกครั้งแล้วผ่าน ไม่ต้องทำอะไรเพิ่ม') + '</p>' +
      '<div class="modal-acts"><button class="btn btn-primary" data-act="close-modal">' +
      L('ปิด') + '</button></div>';

    var h = '<h2>' + L('บันทึกลงเครื่องนี้ไม่สำเร็จ') + '</h2>';
    h += '<div class="prj-warn">' + I('alert', 15) + '<span>' +
      L('งานที่แก้หลังจากนี้ยังอยู่บนหน้าจอ แต่') + '<b>' +
      L('จะหายทันทีที่ปิดหรือรีเฟรชหน้า') + '</b></span></div>';

    h += '<p class="prj-note">' + (err.kind === 'full'
      ? L('พื้นที่เก็บข้อมูลของเบราว์เซอร์เต็ม ตอนนี้ข้อมูลมีขนาด {mb} MB',
          { mb: (err.bytes / 1048576).toFixed(1) })
      : L('เบราว์เซอร์นี้ไม่ยอมให้เก็บข้อมูล มักเกิดกับโหมดไม่ระบุตัวตนหรือเครื่องที่ตั้งค่าห้ามเก็บคุกกี้')) +
      '</p>';

    /* ปุ่มสำรองดึงฐานข้อมูลทั้งก้อนออกไป จึงเป็นของผู้ดูแลเท่านั้น
     * คนทั่วไปจึงต้องได้คำแนะนำคนละแบบ ไม่ใช่ปุ่มที่กดแล้วถูกปฏิเสธ */
    if (S.can('manage')) {
      h += '<div class="opt-acts"><button class="btn btn-primary" data-act="export">' +
        I('arrowDown', 14) + ' ' + L('ดาวน์โหลดสำรองเดี๋ยวนี้') + '</button></div>';
    } else {
      h += '<p class="prj-note"><b>' +
        L('สิ่งที่ควรทำตอนนี้ คัดลอกงานที่เพิ่งแก้ไปเก็บไว้ที่อื่นก่อน แล้วแจ้งผู้ดูแลระบบ') +
        '</b></p>';
    }

    if (err.kind === 'full') {
      var phB = S.photoTotalBytes();
      h += '<p class="prj-note">' + L('จากนั้นลดขนาดข้อมูลลง เช่น') + '</p><ul class="prj-list">';
      if (phB > 200000) {
        h += '<li>' + L('รูปประจำตัวรวมกัน {kb} KB — เอารูปที่ไม่จำเป็นออกได้ที่ตั้งค่า',
          { kb: Math.round(phB / 1024) }) + '</li>';
      }
      h += '<li>' + L('เก็บโปรเจกต์ที่จบแล้วเข้าคลัง') + '</li>';
      h += '<li>' + L('ล้างข้อมูลเบราว์เซอร์ของเว็บอื่นที่ไม่ได้ใช้') + '</li>';
      h += '</ul>';
    }

    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' +
      L('ปิด') + '</button></div>';
    return h;
  }

  /* ---------- ตั้งค่าของฉัน ----------
   *
   * รวมทุกอย่างที่เป็น "ของตัวฉัน" ไว้ที่เดียว โครงเดียวกับ Settings ของ Asana
   * แท็บซ้ายเหมือนหน้าตั้งค่าโปรเจกต์ ใช้ CSS ชุดเดียวกัน เพื่อให้สองที่นี้หน้าตาเหมือนกัน
   */
  var SET_TABS = [
    ['general',  'ทั่วไป'],
    ['profile',  'โปรไฟล์'],
    ['notify',   'การแจ้งเตือน'],
    ['account',  'บัญชี'],
    ['display',  'การแสดงผล'],
    ['data',     'ข้อมูลและสำรอง']
  ];

  function setToggle(act, label, on, desc, extra) {
    return '<div class="opt-toggle"><div class="grow"><b>' + R.esc(label) + '</b>' +
      (desc ? '<em>' + R.esc(desc) + '</em>' : '') + '</div>' +
      '<button class="switch' + (on ? ' on' : '') + '" data-act="' + act + '"' +
      (extra || '') + ' role="switch" aria-checked="' + (on ? 'true' : 'false') + '"><i></i></button></div>';
  }

  function segmented(act, options, current) {
    var h = '<div class="segmented">';
    options.forEach(function (o) {
      h += '<button data-act="' + act + '" data-v="' + R.esc(o[0]) + '" class="' +
        (current === o[0] ? 'on' : '') + '">' + R.esc(o[1]) + '</button>';
    });
    return h + '</div>';
  }

  function settingsModal(tab) {
    var db = S.db;
    var me = S.me();
    tab = tab || 'general';

    /* แท็บข้อมูลและสำรองเป็นของผู้ดูแลเท่านั้น
     * ในนั้นดึงฐานข้อมูลทั้งก้อนออกไปเป็นไฟล์ได้ ซึ่งข้ามระบบสิทธิ์รายโปรเจกต์ทั้งหมด
     * ถ้าคนทั่วไปเปิดแท็บนี้ตรง ๆ ให้ตกไปแท็บทั่วไป ไม่ใช่โชว์หน้าเปล่า */
    var tabs = SET_TABS.filter(function (t) { return t[0] !== 'data' || S.can('manage'); });
    if (!tabs.some(function (t) { return t[0] === tab; })) tab = 'general';

    var h = '<h2>' + L('ตั้งค่า') + '</h2>';
    h += '<div class="prj-set"><nav class="prj-tabs">';
    tabs.forEach(function (t) {
      h += '<button class="' + (tab === t[0] ? 'on' : '') +
        '" data-act="open-settings" data-tab="' + t[0] + '">' + L(t[1]) + '</button>';
    });
    h += '</nav><div class="prj-pane">';

    if (tab === 'general') {
      h += '<label class="opt-lbl">' + L('หน้าที่เปิดเมื่อเข้าแอป') + '</label>' +
        segmented('set-landing', [['home', L('หน้าแรก')], ['mytasks', L('งานของฉัน')],
                                  ['inbox', L('กล่องแจ้งเตือน')]], S.pref('landing'));
      if (R.landingPicker) h += R.landingPicker(S.pref('landing'));    // Sprint 2C — หรือพอร์ตโฟลิโอ/รายงานที่เปิดดูทุกเช้า
      h += '<div class="opt-sep"></div>';
      h += setToggle('set-shortcuts', L('เปิดใช้คีย์ลัด'), !!S.pref('shortcuts'),
        L('กด Tab ค้างแล้วตามด้วยตัวอักษร เพื่อข้ามไปหน้าต่าง ๆ ปิดไว้ถ้าพิมพ์ไทยแล้วชนกัน'));
      h += setToggle('set-confirmdel', L('ถามยืนยันก่อนลบงาน'), !!S.pref('confirmDelete'),
        L('ปิดไว้ถ้าลบงานบ่อยและมั่นใจว่ากด Ctrl+Z ทัน'));
      h += '<div class="opt-acts"><button class="btn btn-sm" data-act="show-shortcuts">' +
        I('keyboard', 14) + ' ' + L('ดูคีย์ลัดทั้งหมด') + '</button>' +
        /* เทมเพลตงานเป็นเครื่องมือทำงานปกติ ไม่ใช่งานผู้ดูแล
         * เดิมอยู่ในแท็บสำรองข้อมูล พอซ่อนแท็บนั้นจากคนทั่วไปจึงต้องย้ายออกมา */
        '<button class="btn btn-sm" data-act="manage-templates">' +
        I('star', 14) + ' ' + L('เทมเพลตงาน') + '</button>' +
        '<button class="btn btn-sm" data-act="go-trash">' +
        I('trash', 14) + ' ' + L('ถังขยะ') + '</button></div>';
    }

    if (tab === 'profile') {
      /* --- รูปประจำตัว --- */
      h += '<label class="opt-lbl">' + L('รูปของคุณ') + '</label>';
      h += '<div class="photo-row">' + R.avatar(me, 'xl') + '<div class="grow">';
      h += '<div class="photo-acts">' +
        '<button class="as-link" data-act="pick-photo">' +
        (me && me.photo ? L('เปลี่ยนรูป') : L('อัปโหลดรูปใหม่')) + '</button>' +
        (me && me.photo
          ? '<span class="sep">·</span><button class="as-link danger" data-act="remove-photo">' +
            L('เอารูปออก') + '</button>' : '') + '</div>';
      h += '<em class="photo-note">' +
        L('รูปช่วยให้เพื่อนร่วมงานจำคุณได้เร็วกว่าตัวย่อชื่อ') +
        (me && me.photo
          ? ' · ' + L('ตอนนี้ {kb} KB', { kb: Math.round(S.photoBytes(me.photo) / 1024) })
          : '') + '</em>';
      /* input ซ่อนไว้ ปุ่มข้างบนเป็นตัวกด — ปุ่มเลือกไฟล์ของเบราว์เซอร์
       * จัดหน้าตาให้เข้ากับที่เหลือไม่ได้ และเขียนภาษาไทยไม่ได้ด้วย */
      h += '<input type="file" id="prPhoto" data-act="photo-file" accept="image/*" hidden>';
      h += '</div></div>';

      h += '<label class="opt-lbl">' + L('สีประจำตัว') + '</label>' +
        '<div class="swatch-pick" id="pColors">';
      S.PALETTE.forEach(function (c) {
        h += '<button type="button" data-color="' + c + '" class="' +
          (me && c === me.color ? 'on' : '') + '" style="background:' + c + '"></button>';
      });
      h += '</div><p class="prj-note" style="margin-top:6px">' +
        L('ใช้เป็นพื้นหลังตัวย่อชื่อ ตอนที่ยังไม่ได้ใส่รูป และเป็นสีของคุณบนไทม์ไลน์') + '</p>';

      h += '<div class="prj-2col" style="margin-top:8px">';
      h += '<div class="field"><label>' + L('ชื่อที่แสดง') + '</label>' +
        '<input id="prName" value="' + R.esc(me ? me.name : '') + '"></div>';
      h += '<div class="field"><label>' + L('คำสรรพนาม') + '</label>' +
        '<input id="prPron" value="' + R.esc((me && me.pronouns) || '') +
        '" placeholder="' + L('เช่น เขา/เธอ หรือ he/him') + '"></div>';
      h += '<div class="field"><label>' + L('ตำแหน่งงาน') + '</label>' +
        '<input id="prTitle" value="' + R.esc((me && me.title) || '') +
        '" placeholder="' + L('เช่น ผู้จัดการฝ่ายพัฒนาธุรกิจ') + '"></div>';
      h += '<div class="field"><label>' + L('ฝ่ายหรือทีม') + '</label>' +
        '<input id="prDept" value="' + R.esc((me && me.dept) || '') +
        '" placeholder="' + L('เช่น พัฒนาธุรกิจ') + '"></div>';
      h += '<div class="field"><label>' + L('อีเมล') + '</label>' +
        '<input value="' + R.esc(me ? me.email : '') + '" disabled></div>';
      h += '</div>';
      h += '<div class="field"><label>' + L('เกี่ยวกับฉัน') + '</label>' +
        '<textarea id="prAbout" rows="3" placeholder="' +
        L('ทำอะไรอยู่ ถนัดเรื่องไหน ติดต่อยังไงเร็วที่สุด') + '">' +
        R.esc((me && me.about) || '') + '</textarea></div>';
      h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
        '<button class="btn btn-primary" data-act="save-profile">' + L('บันทึก') + '</button></div>';
    }

    if (tab === 'notify') {
      h += '<p class="prj-note">' +
        L('เลือกว่าเรื่องไหนควรขึ้นในกล่องแจ้งเตือน ปิดเรื่องที่ไม่สำคัญออก กล่องแจ้งเตือนจะได้ยังน่าอ่าน') + '</p>';
      S.NOTIFY_KINDS.forEach(function (k) {
        /* Sprint 2B — ค่าเริ่มต้นตามชนิด (บันทึกเวลาปิดไว้ก่อน) อ่านจากที่เดียวกับตอนส่งจริง */
        var on = me ? S.wantsNotify(me.id, k.id) : k.def !== false;
        h += setToggle('set-notify', L(k.label), on, k.desc ? L(k.desc) : '',
          ' data-kind="' + k.id + '"');
      });
      /* ห้ามรบกวนประจำวัน — พักแบบครั้งเดียวกดได้จากปุ่มพระจันทร์ในกล่องแจ้งเตือน */
      var dnd = S.dndOf();
      var sched = !!(dnd.from && dnd.to);
      h += '<label class="opt-lbl">' + L('ห้ามรบกวน') + '</label>';
      h += setToggle('dnd-sched', L('ห้ามรบกวนทุกวันตามช่วงเวลา'), sched,
        L('ในช่วงนี้ไม่ขึ้นตัวเลขแดงและไม่เด้งเตือน รายการยังเข้ากล่องแจ้งเตือนครบ'));
      if (sched) {
        h += '<div class="dnd-times">' + L('ตั้งแต่') +
          ' <input class="inp" type="time" data-act="dnd-from" value="' + R.esc(dnd.from) + '"> ' + L('ถึง') +
          ' <input class="inp" type="time" data-act="dnd-to" value="' + R.esc(dnd.to) + '"></div>';
      }
      if (dnd.until && Date.parse(dnd.until) > Date.now()) {
        var du = new Date(dnd.until);
        h += '<div class="dnd-now">' + I('moon', 14) + '<span class="grow">' +
          R.esc(L('ห้ามรบกวนถึง {t}', { t: R.fmtDate(S.iso(du)) + ' ' + R.fmtTime(du) })) + '</span>' +
          '<button class="btn btn-sm" data-act="dnd-off">' + L('เลิกพัก') + '</button></div>';
      }
      if (EXT.hooks.settingsNotify) h += EXT.hooks.settingsNotify();     // 4b — แจ้งเตือนของเบราว์เซอร์
      h += '<div class="prj-warn">' + I('alert', 15) + '<span>' +
        L('ยังไม่มีการแจ้งเตือนทางอีเมล ทุกอย่างจะเข้ากล่องแจ้งเตือนใน Orbit') +      // Sprint 1A — ไม่พูดถึงระบบหลังบ้าน
        '</span></div>';
      h += '<div class="modal-acts"><button class="btn btn-primary" data-act="close-modal">' + L('ปิด') + '</button></div>';
    }

    if (tab === 'account') {
      var team = global.OrbitSync && global.OrbitSync.state.mode === 'team';
      h += '<label class="opt-lbl">' + L('องค์กร') + '</label>' +
        '<div class="opt-base">' + I('building', 15) + '<span class="grow">' +
        R.esc((global.OrbitConfig && global.OrbitConfig.orgName) || 'Srichand') + '</span>' +
        '<span class="chip">' + (team ? L('โหมดทีม') : L('โหมดเครื่องเดียว')) + '</span></div>';

      h += '<label class="opt-lbl">' + L('อีเมลที่ใช้เข้าระบบ') + '</label>' +
        '<div class="opt-base">' + I('signIn', 15) + '<span class="grow">' +
        R.esc(me ? me.email : '-') + '</span>' + R.authTag(me) + '</div>';

      h += '<label class="opt-lbl">' + L('บทบาทในองค์กร') + '</label>' +
        '<div class="opt-base">' + I('shield', 15) + '<span class="grow">' +
        R.esc(R.roleLabel(S.role())) + '</span>' +
        '<em style="font-style:normal;font-size:12.5px;color:var(--fg-faint)">' +
        L('ผู้ดูแลระบบเท่านั้นที่เปลี่ยนได้') + '</em></div>';

      h += '<div class="prj-warn">' + I('alert', 15) + '<span>' +
        L('เข้าระบบด้วยบัญชี Microsoft ของบริษัท เปลี่ยนรหัสผ่านหรือตั้งการยืนยันสองชั้นได้ที่บัญชี Microsoft ของคุณ') +   // Sprint 1A
        '</span></div>';

      if (team) {
        h += '<div class="opt-acts"><button class="btn btn-danger" data-act="sign-out">' +
          I('signOut', 14) + ' ' + L('ออกจากระบบ') + '</button></div>';
      }
    }

    if (tab === 'display') {
      h += '<div class="prj-2col">';
      h += '<div><label class="opt-lbl">' + L('ธีม') + '</label>' +
        segmented('set-theme', [['auto', L('ตามระบบ')], ['light', L('สว่าง')],
                                ['dark', L('มืด')]], S.pref('theme')) + '</div>';
      h += '<div><label class="opt-lbl">' + L('ภาษา') + '</label>' +
        segmented('set-lang', [['th', 'ไทย'], ['en', 'English']], global.I18N.getLang()) + '</div>';
      h += '</div>';
      h += '<label class="opt-lbl">' + L('วันแรกของสัปดาห์') + '</label>' +
        segmented('set-firstday', [['auto', L('อัตโนมัติ')], ['sun', L('อาทิตย์')],
                                   ['mon', L('จันทร์')]], S.pref('firstDay'));
      h += '<div class="opt-sep"></div>';
      h += setToggle('set-compact', L('โหมดแน่น'), !!S.pref('compact'),
        L('ลดระยะห่างของแถว เห็นงานได้มากขึ้นต่อหนึ่งหน้าจอ'));
      h += setToggle('set-rownum', L('แสดงเลขบรรทัด'), !!S.pref('rowNumbers'),
        L('ใส่เลขลำดับหน้าแถวในมุมมองรายการ ใช้อ้างอิงตอนคุยกันได้'));
      h += '<div class="modal-acts"><button class="btn btn-primary" data-act="close-modal">' + L('ปิด') + '</button></div>';
    }

    if (tab === 'data') {
      h += '<div class="mini-row"><div class="grow"><div>' + L('ข้อมูลปัจจุบัน') + '</div><div class="sub">' +
        db.projects.length + ' ' + L('โปรเจกต์ ·') + ' ' + db.tasks.length + ' ' + L('งาน ·') + ' ' +
        db.users.length + ' ' + L('สมาชิก ·') + ' ' + db.notifications.length + ' ' + L('แจ้งเตือน') + '</div></div></div>';

      /* รูปประจำตัวเป็นก้อนใหญ่ก้อนเดียวที่โตตามจำนวนคน ไม่ใช่ตามปริมาณงาน
       * บอกน้ำหนักไว้ตรงนี้ เผื่อวันที่พื้นที่เริ่มตึงจะได้รู้ว่าอะไรกินที่ */
      var phN = db.users.filter(function (u) { return !!u.photo; }).length;
      if (phN) {
        h += '<div class="mini-row"><div class="grow"><div>' + L('รูปประจำตัว') +
          '</div><div class="sub">' +
          L('{n} คนใส่รูปแล้ว · รวม {kb} KB',
            { n: phN, kb: Math.round(S.photoTotalBytes() / 1024) }) + '</div></div></div>';
      }

      /* ไฟล์แนบเป็นก้อนที่โตเร็วที่สุด เพราะเก็บตัวไฟล์มาทั้งก้อน
       * ต้องเห็นตัวเลขก่อนพื้นที่เต็ม ไม่ใช่รู้ตอนบันทึกไม่ลงแล้ว */
      var atT = S.attachTotals();
      if (atT.count) {
        h += '<div class="mini-row"><div class="grow"><div>' + L('ไฟล์แนบ') +
          '</div><div class="sub">' +
          L('{n} ไฟล์ · รวม {mb} MB',
            { n: atT.count, mb: (atT.bytes / 1048576).toFixed(1) }) + '</div></div></div>';
      }

      if (S.storageKind === 'memory') {
        h += '<div class="prj-warn">' + I('alert', 15) + '<span><b>' + L('โหมดทดลอง') + '</b> ' +
          L('— เบราว์เซอร์นี้ไม่อนุญาตให้เก็บข้อมูล') + ' ' +
          L('ใช้งานได้ครบทุกอย่าง แต่') + '<b>' + L('ข้อมูลจะหายเมื่อรีเฟรชหน้า') + '</b> ' +
          L('ถ้าอยากเก็บงานไว้ ให้กด “ดาวน์โหลดสำรอง” ก่อนปิดหน้า') + '</span></div>';
      } else {
        h += '<p class="prj-note">' +
          L('ข้อมูลเก็บอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น ควรกด “ดาวน์โหลดสำรอง” เก็บไว้สม่ำเสมอ') + ' ' +
          L('ถ้าล้างข้อมูลเบราว์เซอร์ ข้อมูลจะหายทั้งหมด') + '</p>';
      }

      h += '<div class="opt-acts">' +
        '<button class="btn" data-act="export">' + I('arrowDown', 14) + ' ' + L('ดาวน์โหลดสำรอง') + '</button>' +
        '<button class="btn" data-act="import">' + I('arrowUp', 14) + ' ' + L('กู้คืนจากไฟล์') + '</button>' +
        '</div>';
      h += '<div class="opt-acts">' +
        '<button class="btn" data-act="copy-backup">' + I('copy', 14) + ' ' + L('คัดลอกข้อมูล') + '</button>' +
        '<button class="btn" data-act="paste-backup">' + I('paperclip', 14) + ' ' + L('วางข้อมูลกู้คืน') + '</button>' +
        '<button class="btn btn-danger" data-act="reset">' + L('ล้างและเริ่มใหม่') + '</button></div>';
    }

    h += '</div></div>';
    return h;
  }

  /** โอนงานที่ค้างอยู่ให้คนอื่น
   *
   * @param withDisable เปิดจากปุ่มปิดบัญชี จึงต้องปิดบัญชีต่อหลังโอนเสร็จในคราวเดียว
   *                    ถ้าแยกสองขั้น คนจะโอนแล้วลืมปิด หรือปิดแล้วลืมโอน
   */
  /**
   * @param opts.role  เปลี่ยนบทบาทเป็นค่านี้หลังโอนงาน (Sprint 1B — เปลี่ยนเป็นดูอย่างเดียว)
   */
  function handoverModal(userId, withDisable, opts) {
    opts = opts || {};
    var u = S.user(userId);
    if (!u) return '';
    var list = S.openTasksOf(userId);
    /* Sprint 1B — บุคคลภายนอก (เอเจนซี ฟรีแลนซ์) ไม่ใช่คนรับช่วงงานในองค์กร
     * เดิมอยู่ในรายชื่อปะปนกับพนักงาน เลือกผิดคนเดียวงานภายในทั้งหมดไปถึงคนนอกพร้อมความเห็นทุกอัน
     * จึงซ่อนไว้เป็นค่าเริ่มต้น ติ๊ก "แสดงบุคคลภายนอก" ก่อนถึงจะเลือกได้ และมีคำเตือนกำกับ */
    var others = S.db.users.filter(function (x) {
      return x.id !== userId && x.active !== false && x.role !== 'viewer';
    });
    var staff = others.filter(function (x) { return x.role !== 'guest'; });
    var guests = others.filter(function (x) { return x.role === 'guest'; });
    var showGuests = !!state.hoGuests;
    var roles = S.projectRolesOf(userId);

    var h = '<h2>' + (withDisable ? L('ปิดบัญชีและโอนงานต่อ') : opts.role ? L('เปลี่ยนบทบาทและโอนงานต่อ') : L('โอนงานต่อ')) + '</h2>';
    h += '<div class="look-prev">' + R.avatar(u, 'lg') +
      '<div><b>' + R.esc(u.name) + '</b>' +
      '<div style="font-size:12.5px;color:var(--fg-soft)">' + R.esc(u.email || '') + '</div></div></div>';

    h += '<div class="prj-warn">' + I('alert', 15) + '<span>' + (!list.length
      ? L('{name} เป็นเจ้าของหรือผู้ดูแลอยู่ {n} โปรเจกต์ โอนให้คนที่ยังใช้งานอยู่ ไม่งั้นคำขอสิทธิ์และการจัดการสมาชิกจะค้าง',
        { name: u.name, n: roles.length })
      : opts.role === 'viewer'
      ? L('มีงานที่ยังไม่เสร็จอยู่ {n} งาน บทบาทดูอย่างเดียวติ๊กเสร็จหรือแก้งานของตัวเองไม่ได้ งานจะค้างอยู่กับเขา', { n: list.length })
      : L('มีงานที่ยังไม่เสร็จอยู่ {n} งาน ถ้าปล่อยไว้กับบัญชีที่ปิดแล้ว จะไม่มีใครได้รับแจ้งและงานจะค้างเงียบ ๆ',
        { n: list.length })) + '</span></div>';

    h += '<div class="field" style="margin-top:14px"><label>' + L('โอนให้ใคร') + '</label>' +
      '<select id="hoTo">';
    staff.forEach(function (x) {
      h += '<option value="' + R.esc(x.id) + '">' + R.esc(x.name) +
        (x.title ? ' — ' + R.esc(x.title) : '') + '</option>';
    });
    if (showGuests && guests.length) {
      h += '<optgroup label="' + R.esc(L('บุคคลภายนอก — จะเห็นงานและความเห็นทั้งหมดที่โอนไป')) + '">';
      guests.forEach(function (x) {
        h += '<option value="' + R.esc(x.id) + '">⚠ ' + R.esc(x.name) + ' (' + R.esc(L('บุคคลภายนอก')) + ')</option>';
      });
      h += '</optgroup>';
    }
    h += '<option value="">' + L('ไม่โอน ปล่อยว่างไว้ (ต้องมีคนมาหยิบเอง)') + '</option>';
    h += '</select></div>';
    if (guests.length) {
      h += '<label class="ho-guests"><input type="checkbox" data-act="ho-guests" data-id="' + R.esc(userId) +
        '" data-off="' + (withDisable ? '1' : '0') + '" data-role="' + R.esc(opts.role || '') + '"' +
        (showGuests ? ' checked' : '') + '> ' +
        R.esc(L('แสดงบุคคลภายนอกในรายชื่อ ({n} คน) — ไม่แนะนำ', { n: guests.length })) + '</label>';
    }
    /* โปรเจกต์ที่คนนี้เป็นเจ้าของ/ผู้ดูแล — ติ๊กไว้เป็นค่าเริ่มต้นตอนปิดบัญชี ไม่งั้นโปรเจกต์ปิดอาจไม่มีผู้ดูแลที่เข้าได้ */
    if (roles.length && (withDisable || opts.role)) {
      h += '<label class="ho-guests"><input type="checkbox" id="hoProjects" checked> ' +
        R.esc(L('โอนความเป็นเจ้าของ/ผู้ดูแลโปรเจกต์ {n} โปรเจกต์ให้คนเดียวกัน ({p})', {
          n: roles.length, p: roles.slice(0, 3).map(function (p) { return p.name; }).join(', ') + (roles.length > 3 ? '…' : '') })) +
        '</label>';
    }

    if (list.length) h += '<label class="opt-lbl">' + L('งานที่จะโอน') + '</label>';
    h += '<div class="ho-list">';
    list.slice(0, 12).forEach(function (t) {
      var pj = S.projectsOfTask(t.id)[0];
      h += '<div class="ho-row"><span class="nm">' + R.esc(t.name) + '</span>' +
        (pj ? '<span class="chip">' + R.esc(pj.project.name) + '</span>' : '') +
        (t.dueOn ? '<span class="due' + R.dueClass(t.dueOn, false) + '">' +
          R.fmtDate(t.dueOn) + '</span>' : '') + '</div>';
    });
    if (list.length > 12) {
      h += '<div class="ho-more">+' + (list.length - 12) + ' ' + L('อื่น ๆ') + '</div>';
    }
    h += '</div>';

    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-handover" data-id="' + R.esc(userId) +
      '" data-off="' + (withDisable ? '1' : '0') + '" data-role="' + R.esc(opts.role || '') + '">' +
      (withDisable ? L('โอนงานแล้วปิดบัญชี') : opts.role ? L('โอนงานแล้วเปลี่ยนบทบาท') : L('โอนงาน')) + '</button></div>';
    return h;
  }

  /** ตั้งสถานะไม่อยู่ — มีวันสิ้นสุดเสมอ ไม่งั้นป้ายจะค้างจนไม่มีใครเชื่อ */
  function awayModal() {
    var me = S.me();
    var cur = (me && me.away) || null;
    var h = '<h2>' + L('ตั้งสถานะไม่อยู่') + '</h2>';
    h += '<p class="prj-note">' +
      L('ระหว่างนี้ชื่อของคุณจะมีจุดสีส้มกำกับ คนที่กำลังจะมอบหมายงานให้จะได้รู้ก่อน') + '</p>';
    h += '<div class="prj-2col">';
    h += '<div class="field"><label>' + L('ไม่อยู่ถึงวันที่') + '</label>' +
      '<input id="awUntil" type="date" value="' + R.esc(cur ? cur.until : '') + '"></div>';
    h += '<div class="field"><label>' + L('ข้อความสั้น ๆ (ไม่บังคับ)') + '</label>' +
      '<input id="awNote" value="' + R.esc(cur ? cur.note : '') +
      '" placeholder="' + L('เช่น ลาพักร้อน ติดต่อคุณมานีแทน') + '"></div>';
    h += '</div>';
    h += '<div class="modal-acts">' +
      (cur ? '<button class="btn" data-act="clear-away">' + L('ยกเลิกสถานะไม่อยู่') + '</button>' : '') +
      '<button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="save-away">' + L('บันทึก') + '</button></div>';
    return h;
  }

  function copyModal() {
    return '<h2>' + L('คัดลอกข้อมูลสำรอง') + '</h2>' +
      '<p style="font-size:13px;color:var(--fg-soft);margin:0 0 12px">' +
      L('เลือกทั้งหมดแล้วคัดลอกไปเก็บไว้ในไฟล์ .json หรือโน้ตของคุณ') + '</p>' +
      '<textarea id="dumpBox" readonly style="width:100%;height:220px;font-family:monospace;' +
      'font-size:11px;padding:10px;border:1px solid var(--line);border-radius:var(--radius)">' +
      R.esc(S.exportJSON()) + '</textarea>' +
      '<div class="modal-acts"><button class="btn" data-act="open-settings">' + L('ย้อนกลับ') + '</button>' +
      '<button class="btn btn-primary" data-act="copy-dump">' + L('คัดลอกทั้งหมด') + '</button></div>';
  }

  function pasteModal() {
    return '<h2>' + L('วางข้อมูลกู้คืน') + '</h2>' +
      '<p style="font-size:13px;color:var(--fg-soft);margin:0 0 12px">' +
      L('วางข้อมูล JSON ที่สำรองไว้ แล้วกดกู้คืน — ข้อมูลปัจจุบันจะถูกแทนที่ทั้งหมด') + '</p>' +
      '<textarea id="pasteBox" placeholder="' + L('วางข้อมูลที่นี่') + '" style="width:100%;height:200px;' +
      'font-family:monospace;font-size:11px;padding:10px;border:1px solid var(--line);' +
      'border-radius:var(--radius)"></textarea>' +
      '<div class="modal-acts"><button class="btn" data-act="open-settings">' + L('ย้อนกลับ') + '</button>' +
      '<button class="btn btn-primary" data-act="do-paste-import">' + L('กู้คืน') + '</button></div>';
  }

  /* ---------- export / import ---------- */

  function doExport() {
    var json = S.exportJSON();
    var filename = 'orbit-backup-' + S.today() + '.json';

    if (global.claude && typeof global.claude.use === 'function') {
      global.claude.use('downloads').then(function (downloads) {
        if (!downloads) { downloadDirect(json, filename); return; }
        return downloads.save({ filename: filename, data: json }).then(function () {
          toast(L('บันทึกไฟล์สำรองแล้ว'));
        }, function (err) {
          var code = err && err.code;
          if (code === 'declined') { toast(L('ยกเลิกการบันทึก')); return; }
          if (code === 'rate_limited') { toast(L('กำลังรอการยืนยันอยู่ ลองใหม่อีกครั้ง')); return; }
          toast(L('บันทึกไม่สำเร็จ — ใช้ “คัดลอกข้อมูล” แทนได้'));
        });
      }, function () { downloadDirect(json, filename); });
      return;
    }
    downloadDirect(json, filename);
  }

  /** ยิงไฟล์ให้เบราว์เซอร์ดาวน์โหลด ใช้ได้กับทุกชนิดข้อความ */
  function downloadText(text, filename, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /** ชื่อไฟล์ที่ Windows ยอมรับ — ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้ทิ้ง */
  function safeFileName(name) {
    return String(name || 'orbit').replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 60) ||
           'orbit';
  }

  function downloadDirect(json, filename) {
    downloadText(json, filename, 'application/json');
    toast(L('ดาวน์โหลดไฟล์สำรองแล้ว'));
  }

  /** เลือกไฟล์ CSV แล้วนำเข้าเป็นงานใหม่ในโปรเจกต์ที่เปิดอยู่ */
  function pickCsvFile(projectId) {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,text/csv';
    inp.addEventListener('change', function () {
      var f = inp.files[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { toast(L('ไฟล์ใหญ่เกิน 5 MB')); return; }
      /* 2c — ดูก่อนนำเข้า: จับคู่คอลัมน์ เลือกการเข้ารหัส แล้วค่อยกดนำเข้า */
      state.csv = { pid: projectId, file: f, text: '', enc: 'utf-8', map: null };
      readCsvFile('utf-8');
    });
    inp.click();
  }

  /* ---------- รูปประจำตัว ----------
   *
   * รูปจากมือถือทุกวันนี้ใบละ 3–5 MB ส่วนพื้นที่ที่เบราว์เซอร์ให้เก็บมีราว 5 MB
   * ถ้าเก็บไฟล์ดิบ คนแรกที่อัปรูปก็ทำให้ข้อมูลของทั้งทีมบันทึกไม่ลงแล้ว
   * จึงย่อและครอปเป็นสี่เหลี่ยมจัตุรัสตั้งแต่ในเบราว์เซอร์ก่อนเก็บ
   * ไล่ลดคุณภาพลงทีละขั้นจนกว่าจะผ่านเพดาน แทนที่จะเดาค่าเดียวแล้วหวังว่าจะพอ
   */
  function shrinkPhoto(file, cb) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var side = Math.min(img.width, img.height);      // ครอปกลางเป็นจัตุรัส
      var out = S.PHOTO_PX;
      var cv = document.createElement('canvas');
      cv.width = cv.height = out;
      var cx = cv.getContext('2d');
      cx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2,
                   side, side, 0, 0, out, out);

      var q = 0.86, data = cv.toDataURL('image/jpeg', q);
      while (S.photoBytes(data) > S.PHOTO_MAX_BYTES && q > 0.4) {
        q -= 0.12;
        data = cv.toDataURL('image/jpeg', q);
      }
      cb(null, data);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      cb(new Error(L('เปิดไฟล์รูปนี้ไม่ได้')));
    };
    img.src = url;
  }

  function takePhoto(inputEl) {
    var f = inputEl.files && inputEl.files[0];
    inputEl.value = '';           // เลือกไฟล์เดิมซ้ำต้องยิง change อีกครั้ง
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { toast(L('ไฟล์ใหญ่เกิน 20 MB')); return; }
    shrinkPhoto(f, function (err, data) {
      if (err) { toast(err.message); return; }
      var res = S.setPhoto(data);
      if (!res.ok) { toast(L(res.reason)); return; }
      renderAll();
      openModal(settingsModal('profile'), true);
      toast(L('เปลี่ยนรูปแล้ว · {kb} KB', { kb: Math.round(res.bytes / 1024) }),
            L('ย้อนกลับ'), 'undo');
    });
  }

  function doImport() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.addEventListener('change', function () {
      var f = inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          S.importJSON(fr.result);
          closeModal();
          state.route = { type: 'home' };
          state.openTaskId = null;
          clearSel();
          renderAll();
          toast(L('กู้คืนข้อมูลสำเร็จ'));
        } catch (e) {
          toast(L('ไฟล์ไม่ถูกต้อง:') + ' ' + e.message);
        }
      };
      fr.readAsText(f);
    });
    inp.click();
  }

  function copyText(text, okMsg) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (ok) { toast(okMsg); return; }
    if (global.navigator && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); },
        function () { toast(L('คัดลอกอัตโนมัติไม่ได้ — กด Ctrl+C เอง')); });
    } else {
      toast(L('คัดลอกอัตโนมัติไม่ได้ — กด Ctrl+C เอง'));
    }
  }

  /* ---------- selection helpers ---------- */

  function selectedIds() { return Object.keys(state.sel); }

  function doUndo() {
    if (!S.canUndo()) { toast(L('ไม่มีอะไรให้ย้อนกลับ')); return; }
    clearSel();          // ก่อน undo — undo วาดหน้าใหม่ทันที ถ้าล้างทีหลังแถวยังขึ้นว่าเลือกอยู่
    S.undo();
    var u = S.undoLabel();
    if (state.openTaskId && !S.task(state.openTaskId)) state.openTaskId = null;
    toast(L('ย้อนกลับแล้ว:') + ' ' + L(u.label, u.params || undefined));
  }

  /* ---------- click delegation ---------- */

  // เวลาที่ลากแท่งไทม์ไลน์เสร็จล่าสุด
  /* ====================== 3c — ภาพรวม แดชบอร์ด ประกาศ เส้นทางวิกฤต ====================== */

  state.msgFiles = {};        // ไฟล์ที่รอส่งพร้อมประกาศ/คำตอบ { 'new' | 'r:<msgId>': [file] } อยู่แค่ในหน้าจอ
  state.msgFileKey = null;
  state.dashEdit = null;      // { pid, w, isNew } วิดเจ็ตที่กำลังแก้ (สำเนา บันทึกตอนกด "บันทึก")

  /** อ่านไฟล์ที่เลือกเป็น data URI — ไฟล์ที่เกินขนาดข้ามไป แล้วบอกจำนวนที่ข้าม */
  function readFiles(inputEl, max, cb) {
    /* 4b — โหมดทีมอัปขึ้น SharePoint/OneDrive แทน (ui4b2.js) แล้วคืนข้อมูลอ้างอิงรูปแบบเดียวกัน */
    if (EXT.hooks.readFiles && EXT.hooks.readFiles(inputEl, max, cb)) return;
    var files = Array.prototype.slice.call(inputEl.files || []);
    inputEl.value = '';
    if (!files.length) return;
    var out = [], left = files.length, skipped = 0;
    var done = function () { if (--left === 0) cb(out, skipped); };
    files.forEach(function (f) {
      if (f.size > max) { skipped++; done(); return; }
      var rd = new FileReader();
      rd.onload = function () {
        out.push({ id: S.uid('fa'), name: f.name, url: String(rd.result), size: f.size, mime: f.type || null });
        done();
      };
      rd.onerror = function () { skipped++; done(); };
      rd.readAsDataURL(f);
    });
  }
  function skippedToast(n, limit) {
    if (n) toast(L('ข้าม {n} ไฟล์ที่ใหญ่เกิน {m}', { n: n, m: limit }));
  }

  /* ---------- เปลี่ยนวันนอก Gantt/ไทม์ไลน์: ดูงานที่จะขยับตามก่อนแล้วค่อยใช้ ---------- */
  var pendingShift = null;
  function spanText(a) {
    var s = a[0], d = a[1];
    if (!s && !d) return '—';
    if (!s || !d || s === d) return R.fmtDate(d || s);
    return R.fmtDate(s) + ' – ' + R.fmtDate(d);
  }
  function setDates(taskId, patch, done) {
    var list = S.task(taskId) ? S.previewDates(taskId, patch) : [];
    if (!list.length) {
      S.updateTask(taskId, patch);
      if (done) done(0);
      return;
    }
    pendingShift = { id: taskId, patch: patch, done: done };
    var t = S.task(taskId);
    var h = '<h2>' + L('งานที่รออยู่จะขยับตาม') + '</h2>' +
      '<p class="modal-sub">' + esc(L('เปลี่ยนวันของ “{t}” แล้ว งานที่พึ่งพากันจะเลื่อนตามโหมดของโปรเจกต์ ตรวจดูก่อนใช้', { t: t.name })) + '</p>' +
      '<div class="shift-list"><div class="shift-row head"><span class="grow">' + L('งาน') + '</span><span>' + L('เดิม') + '</span><span></span><span>' +
      L('ใหม่') + '</span></div>' +
      '<div class="shift-row self"><span class="grow">' + esc(t.name) + '</span><span>' + esc(spanText([t.startOn, t.dueOn])) +
      '</span><span>→</span><span>' + esc(spanText(['startOn' in patch ? patch.startOn : t.startOn, 'dueOn' in patch ? patch.dueOn : t.dueOn])) + '</span></div>';
    list.slice(0, 60).forEach(function (x) {
      h += '<div class="shift-row"><span class="grow">' + esc(x.name) + '</span><span>' + esc(spanText(x.from)) + '</span><span>→</span><span><b>' +
        esc(spanText(x.to)) + '</b></span></div>';
    });
    if (list.length > 60) h += '<div class="shift-row"><span class="grow">' + esc(L('และอีก {n} งาน', { n: list.length - 60 })) + '</span></div>';
    h += '</div><div class="modal-actions"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn" data-act="shift-only">' + L('เปลี่ยนเฉพาะงานนี้') + '</button>' +
      '<button class="btn btn-primary" data-act="shift-apply">' + esc(L('เลื่อนงานที่รออยู่ด้วย ({n})', { n: list.length })) +
      '</button></div>';
    openModal(h, true);
  }

  /* ---------- แดชบอร์ด ---------- */
  function widgetOf(pid, wid) {
    return S.dashWidgets(pid).filter(function (w) { return w.id === wid; })[0] || null;
  }
  function dashMenuHtml(pid, wid) {
    var w = widgetOf(pid, wid);
    if (!w) return '';
    var can = S.canEditDash(pid);
    var list = S.dashWidgets(pid), i = list.indexOf(w);
    var item = function (act, icon, label, extra) {
      return '<button data-act="' + act + '" data-w="' + esc(wid) + '"' + (extra || '') + '>' + I(icon, 14) + '<span class="grow">' + label + '</span></button>';
    };
    var h = '';
    if (can) {
      h += item('dash-edit', 'pencil', L('แก้ไขวิดเจ็ต…'));
      h += item('dash-dup', 'copy', L('ทำสำเนา'));
      h += item('dash-size', w.full ? 'shrink' : 'expand', w.full ? L('ครึ่งความกว้าง') : L('เต็มความกว้าง'));
      if (i > 0) h += item('dash-move', 'arrowLeft', L('ย้ายไปก่อนหน้า'), ' data-delta="-1"');
      if (i < list.length - 1) h += item('dash-move', 'arrowRight', L('ย้ายไปถัดไป'), ' data-delta="1"');
    }
    if (w.kind !== 'text') h += item('dash-png', 'image', L('ส่งออกเป็น PNG'));
    if (can) h += '<div class="pop-sep"></div>' + item('dash-del', 'trash', L('ลบวิดเจ็ต'));
    return h;
  }

  function dashSel(k, options, cur) {
    return '<select class="inp" data-act="dwe" data-k="' + k + '">' + options.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }

  function dashEditHtml() {
    var de = state.dashEdit, w = de.w, pid = de.pid;
    var xs = S.DASH_X.map(function (x) { return [x[0], L(x[1])]; });
    S.dashFieldChoices(pid, false).forEach(function (f) { xs.push(['field:' + f.id, f.name]); });
    var ys = [['count', L('จำนวนงาน')]];
    S.dashFieldChoices(pid, true).forEach(function (f) {
      ys.push(['sum:' + f.id, L('ผลรวมของ {f}', { f: f.name })]);
      ys.push(['avg:' + f.id, L('ค่าเฉลี่ยของ {f}', { f: f.name })]);
    });
    (S.DASH_Y_EXTRA || []).forEach(function (y) { ys.push([y[0], L(y[1])]); });
    var k = w.kind;
    var axis = ['bar', 'stack', 'group', 'line', 'donut', 'lollipop'].indexOf(k) >= 0;
    var burn = k === 'burnup' || k === 'burndown';
    var h = '<h2>' + (de.isNew ? L('เพิ่มวิดเจ็ต') : L('แก้ไขวิดเจ็ต')) + '</h2><div class="dwe">';
    h += '<div class="dwe-kinds">' + S.DASH_KINDS.map(function (x) {
      return '<button class="dwe-kind' + (x[0] === k ? ' on' : '') + '" data-act="dwe-kind" data-v="' + x[0] + '">' + esc(L(x[1])) + '</button>';
    }).join('') + '</div>';
    h += '<div class="field"><label>' + L('ชื่อวิดเจ็ต') + '</label><input class="inp" data-act="dwe" data-k="title" value="' + esc(w.title ? L(w.title) : '') +
      '" placeholder="' + esc(L('ไม่ใส่ก็ได้')) + '"></div>';
    if (k === 'text') {
      h += '<div class="field"><label>' + L('ข้อความ') + '</label><div class="rte-wrap">' + global.RichText.toolbar('page', { image: false }) +
        '<div class="rte rte-doc dwe-text" contenteditable="true" data-blocks="1" data-key="dwt" data-placeholder="' +
        esc(L('เขียนบันทึก ลิงก์ หรือคำอธิบายของแดชบอร์ด')) + '">' + global.RichText.toHtml(w.text, { editable: true, blocks: true }) + '</div></div></div>';
    } else {
      h += '<div class="dwe-row">';
      if (axis) h += '<div class="field"><label>' + (k === 'donut' ? L('แบ่งชิ้นตาม') : L('แกน X')) + '</label>' + dashSel('x', xs, w.x) + '</div>';
      h += '<div class="field"><label>' + (k === 'number' ? L('ค่า') : L('แกน Y')) + '</label>' + dashSel('y', ys, w.y) + '</div>';
      if (k === 'stack' || k === 'group') {
        h += '<div class="field"><label>' + L('แยกชุดข้อมูลตาม') + '</label>' +
          dashSel('split', [['', L('ไม่แยก')]].concat(xs.filter(function (x) { return x[0] !== 'period'; })), w.split) + '</div>';
      }
      h += '</div>';
      if (burn || w.x === 'period') {
        h += '<div class="dwe-row"><div class="field"><label>' + L('ช่วงละ') + '</label>' +
          dashSel('unit', S.DASH_UNITS.map(function (x) { return [x[0], L(x[1])]; }), w.unit) + '</div>' +
          '<div class="field"><label>' + L('ย้อนหลัง (ช่วง)') + '</label><input class="inp" type="number" min="2" max="36" data-act="dwe" data-k="n" value="' + w.n + '"></div>' +
          (w.x === 'period' && !burn ? '<div class="field"><label>' + L('นับตามวันที่') + '</label>' +
            dashSel('date', S.DASH_DATES.map(function (x) { return [x[0], L(x[1])]; }), w.date) + '</div>' : '') + '</div>';
      }
      if (k === 'line' || k === 'bar') {
        h += '<div class="field"><label>' + L('เส้นเป้าหมาย (ไม่ใส่ก็ได้)') + '</label><input class="inp" type="number" step="any" data-act="dwe" data-k="bench" value="' +
          esc(w.bench == null ? '' : w.bench) + '"></div>';
      }
      /* ตัวกรอง — ชุดเดียวกับตัวกรองของมุมมอง */
      h += '<label class="opt-lbl">' + L('ตัวกรอง') + '</label>';
      var ffs = S.filterFields(pid);
      w.filters.forEach(function (c, i) {
        var def = S.filterField(pid, c.f);
        var ops = def ? S.FILTER_OPS[def.kind] || [] : [];
        h += '<div class="flt-row">' + (i ? '<span class="flt-and">' + L('และ') + '</span>' : '') + '<div class="flt-line">' +
          optSelect('dwf-field', ffs.map(function (x) { return [x.id, x.custom ? x.label : L(x.label)]; }), c.f, ' data-i="' + i + '"') +
          optSelect('dwf-op', ops.map(function (o) { return [o[0], L(o[1])]; }), c.op, ' data-i="' + i + '"') +
          '<button class="flt-del" data-act="dwf-del" data-i="' + i + '" title="' + L('เอาเงื่อนไขนี้ออก') + '">' + I('close', 13) + '</button></div>' +
          fltValueHtml(pid, c, i, 'dwf') + '</div>';
      });
      h += '<button class="btn btn-sm" data-act="dwf-add">' + I('plus', 13) + ' ' + L('เพิ่มตัวกรอง') + '</button>';
      h += '<div class="dwe-prev">' + global.Charts.svg(R.widgetSpec(pid, w)) + '</div>';
    }
    h += '</div><div class="modal-actions"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="dash-save">' + L('บันทึก') + '</button></div>';
    return h;
  }
  function refreshDashEdit() {
    var txt = $modal.querySelector('.dwe-text');
    if (txt && state.dashEdit) state.dashEdit.w.text = global.RichText.fromNode(txt, { blocks: true });
    openModal(dashEditHtml(), true);
  }

  function dashClickModal(pid, wid, cat, ser) {
    var w = widgetOf(pid, wid);
    if (!w) return;
    var list = S.dashClickTasks(pid, wid, cat, ser);
    var lab = '';
    if (cat) {
      var d = S.chartData(S.dashItems(pid, w), w, pid);
      var c = d.cats.filter(function (x) { return x.key === cat; })[0];
      var s = d.series.filter(function (x) { return x.key === ser && x.label; })[0];
      lab = (c ? c.label : cat) + (s ? ' · ' + s.label : '');
    }
    var h = '<h2>' + esc(w.title ? L(w.title) : L('วิดเจ็ต')) + (lab ? ' · ' + esc(lab) : '') + '</h2>' +
      '<p class="modal-sub">' + esc(L('{n} งาน', { n: list.length })) + '</p><div class="dash-tasks">';
    if (!list.length) h += '<div class="ovw-empty">' + L('ไม่มีงาน') + '</div>';
    list.slice(0, 200).forEach(function (t) { h += R.taskRow(t, {}); });
    h += '</div><div class="modal-actions"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    openModal(h, true);
  }

  /** ช่องเขียนประกาศ/คำตอบ ร่างไม่หายตอนหน้าวาดใหม่ (เก็บแบบเดียวกับร่างความเห็น) */
  document.addEventListener('input', function (e) {
    var ed = e.target;
    if (ed && ed.classList && ed.classList.contains('rte-msg')) setDraft(ed.dataset.key, global.RichText.fromNode(ed));
    if (ed && ed.id === 'msgTitle') state.msgTitle = ed.value;
  });
  function restoreMsgDrafts() {
    var mti = document.getElementById('msgTitle');
    if (mti && state.msgTitle && !mti.value) mti.value = state.msgTitle;
    Array.prototype.forEach.call($view.querySelectorAll('.rte-msg'), function (ed) {
      var d = getDraft(ed.dataset.key);
      if (d && !ed.textContent) ed.innerHTML = global.RichText.toHtml(d, { editable: true });
    });
  }

  /* บรีฟโปรเจกต์ บันทึกตอนออกจากช่อง (หลังปล่อยเมาส์ ให้ปุ่มที่กดทำงานก่อน) */
  document.addEventListener('focusout', function (e) {
    var ed = e.target;
    if (!ed || !ed.classList || !ed.classList.contains('rte') || ed.dataset.save !== 'brief') return;
    var pid = ed.dataset.id, p = S.project(pid);
    if (!p) return;
    var md = global.RichText.fromNode(ed, { blocks: true });
    if (md === (p.brief || '')) return;
    if (!allowed('brief-save', ed)) return;
    afterClick(function () { if (S.setBrief(pid, md)) toast(L('บันทึกบรีฟแล้ว'), L('ย้อนกลับ'), 'undo'); });
  });

  /** คำสั่งคลิกของชิ้นงาน 3c — คืน true เมื่อจัดการแล้ว (ตรวจสิทธิ์ผ่าน allowed() มาก่อนแล้ว) */
  function act3c(act, el, e) {
    var id = el.dataset.id;
    var pid = state.route.type === 'project' ? state.route.id : null;
    switch (act) {
      /* --- เส้นทางวิกฤต / ต่อสาย / ดูงานที่ขยับตาม --- */
      case 'crit-toggle': {
        if (!pid) return true;
        var vc = viewFor(pid);
        vc.critical = !vc.critical;
        refreshView();
        refreshOpts();
        return true;
      }
      case 'bulk-chain': {
        var ids = selectedIds();
        if (ids.length < 2) { toast(L('เลือกอย่างน้อย 2 งาน')); return true; }
        closePops();
        var nc = S.bulkChain(ids);
        clearSel();
        renderAll();
        toast(nc ? L('ต่อลำดับก่อนหลังแล้ว {n} ช่วง', { n: nc })
                 : L('ไม่มีลำดับใหม่ (มีอยู่แล้ว หรือจะทำให้รอวนกัน)'), nc ? L('ย้อนกลับ') : null, nc ? 'undo' : null);
        return true;
      }
      case 'shift-apply':
      case 'shift-only': {
        var ps = pendingShift;
        pendingShift = null;
        closeModal();
        if (!ps || !S.task(ps.id)) return true;
        var ns = S.applyDates(ps.id, ps.patch, act === 'shift-apply');
        if (ps.done) ps.done(ns);
        toast(ns ? L('เปลี่ยนวันแล้ว และเลื่อนงานที่รออยู่ {n} งาน', { n: ns })
                 : L('เปลี่ยนวันแล้ว'), L('ย้อนกลับ'), 'undo');
        return true;
      }

      /* --- ภาพรวม --- */
      case 'kr-link':
        askText(L('ลิงก์ (URL)'), 'https://', function (url) {
          if (!url || url === 'https://') return;
          askText(L('ชื่อที่แสดง'), '', function (name) {
            if (!S.addResource(id, { kind: 'link', url: url, name: name || '' })) toast(L('เพิ่มไม่ได้ — ตรวจลิงก์ หรือครบ {n} รายการแล้ว', { n: S.RES_MAX }));
          }, { note: L('เว้นว่างได้ จะใช้ลิงก์เป็นชื่อ') });
        }, { type: 'url', ok: L('ถัดไป') });
        return true;
      case 'kr-file': {
        var kf = document.getElementById('krFile');
        if (kf) kf.click();
        return true;
      }
      case 'kr-move': S.moveResource(id, el.dataset.r, +el.dataset.delta || 0); return true;
      case 'kr-del':
        if (S.removeResource(id, el.dataset.r)) toast(L('เอาออกแล้ว'), L('ย้อนกลับ'), 'undo');
        return true;
      case 'ms-show': S.setMsShow(id, el.dataset.v); return true;
      case 'ms-add':
        askText(L('ชื่อหมุดหมาย'), '', function (name) {
          if (!name) return;
          var t = S.addMilestone(id, name, null);
          if (t) toast(L('เพิ่มหมุดหมายแล้ว ตั้งวันได้จากแผงหมุดหมาย'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('เพิ่ม') });
        return true;

      /* --- แดชบอร์ด --- */
      case 'dash-add':
        state.dashEdit = { pid: pid, isNew: true, w: S.normalizeWidget({ id: '', kind: 'bar', x: 'assignee' }) };
        openModal(dashEditHtml(), true);
        return true;
      case 'dash-menu':
        if (popIsOpenFor(el)) { closePops(); return true; }
        openPop(el, dashMenuHtml(pid, el.dataset.w));
        return true;
      case 'dash-edit': {
        closePops();
        var we = widgetOf(pid, el.dataset.w);
        if (!we) return true;
        state.dashEdit = { pid: pid, isNew: false, w: S.normalizeWidget(S.clone(we)) };
        openModal(dashEditHtml(), true);
        return true;
      }
      case 'dwe-kind':
        state.dashEdit.w.kind = el.dataset.v;
        refreshDashEdit();
        return true;
      case 'dwf-add': {
        var fw = state.dashEdit.w, ff = S.filterFields(state.dashEdit.pid)[0];
        var fop = (S.FILTER_OPS[ff.kind] || [['is']])[0][0];
        fw.filters.push({ f: ff.id, op: fop, v: fltDefaultV(ff.kind, fop) });
        refreshDashEdit();
        return true;
      }
      case 'dwf-del':
        state.dashEdit.w.filters.splice(+el.dataset.i, 1);
        refreshDashEdit();
        return true;
      case 'dwf-opt': {
        var oc = state.dashEdit.w.filters[+el.dataset.i];
        if (!oc) return true;
        var ov = [].concat(oc.v || []), vv = el.dataset.v, at = ov.indexOf(vv);
        if (at >= 0) ov.splice(at, 1); else ov.push(vv);
        oc.v = ov;
        refreshDashEdit();
        return true;
      }
      case 'dash-save': {
        var de = state.dashEdit;
        if (!de) return true;
        var tx = $modal.querySelector('.dwe-text');
        if (tx) de.w.text = global.RichText.fromNode(tx, { blocks: true });
        if (!S.saveWidget(de.pid, de.w)) { toast(L('บันทึกไม่ได้ — วิดเจ็ตครบ {n} แล้ว', { n: S.DASH_MAX })); return true; }
        state.dashEdit = null;
        closeModal();
        toast(L('บันทึกวิดเจ็ตแล้ว'), L('ย้อนกลับ'), 'undo');
        return true;
      }
      case 'dash-dup': closePops(); S.duplicateWidget(pid, el.dataset.w); return true;
      case 'dash-size': {
        closePops();
        var ws = widgetOf(pid, el.dataset.w);
        if (ws) S.setWidgetFull(pid, ws.id, !ws.full);
        return true;
      }
      case 'dash-move': closePops(); S.moveWidget(pid, el.dataset.w, +el.dataset.delta || 0); return true;
      case 'dash-del':
        closePops();
        if (S.deleteWidget(pid, el.dataset.w)) toast(L('ลบวิดเจ็ตแล้ว'), L('ย้อนกลับ'), 'undo');
        return true;
      case 'dash-png': {
        closePops();
        var wp = widgetOf(pid, el.dataset.w);
        var svgEl = $view.querySelector('.dw[data-w="' + el.dataset.w + '"] svg.chart');
        if (!wp || !svgEl) return true;
        var tt = wp.title ? L(wp.title) : L('แผนภูมิ');
        global.Charts.toPng(svgEl, safeFileName((S.project(pid) || {}).name + ' - ' + tt), { title: tt,
          onError: function () { toast(L('ส่งออกรูปไม่สำเร็จ')); } });
        return true;
      }
      case 'dash-click':
        if (!pid) return true;
        dashClickModal(pid, el.dataset.w, el.dataset.cat || '', el.dataset.ser || '');
        return true;

      /* --- ประกาศ --- */
      case 'post-message': {
        var mb = $view.querySelector('.rte-msg[data-key="mn:' + id + '"]');
        var mt = document.getElementById('msgTitle');
        var md = mb ? global.RichText.fromNode(mb) : '';
        if (!md.trim()) { toast(L('เขียนเนื้อหาก่อน')); return true; }
        /* Sprint 1A — ล้างช่องและร่างก่อนบันทึก ช่องพิมพ์ยังโฟกัสอยู่ (ปุ่มส่งไม่แย่งโฟกัสแล้ว)
         * การวาดใหม่จะคืนเนื้อหาของช่องที่โฟกัสอยู่/ร่างกลับมา ถ้ายังไม่ล้าง ข้อความที่โพสต์แล้วจะค้างในช่อง */
        if (mb) mb.innerHTML = '';
        setDraft('mn:' + id, '');
        if (S.addProjectMessage(id, mt ? mt.value : '', md, state.msgFiles['new'] || [])) {
          state.msgFiles['new'] = [];
          state.msgTitle = '';
          renderAll();
          settleComposer($view.querySelector('.rte-msg[data-key="mn:' + id + '"]'));    // หุบทันที ไม่หุบทีหลังตอนคลิกช่องตอบ
          toast(L('ประกาศแล้ว'), L('ย้อนกลับ'), 'undo');
        } else {
          setDraft('mn:' + id, md);
          if (mb) mb.innerHTML = global.RichText.toHtml(md, { editable: true });
        }
        return true;
      }
      case 'msg-reply': {
        var msg = el.dataset.msg;
        var rb = $view.querySelector('.rte-msg[data-key="mr:' + msg + '"]');
        var rmd = rb ? global.RichText.fromNode(rb) : '';
        if (!rmd.trim()) { toast(L('พิมพ์ข้อความก่อน')); return true; }
        if (rb) rb.innerHTML = '';           // Sprint 1A — ล้างก่อนบันทึก (เหตุผลเดียวกับโพสต์ด้านบน)
        setDraft('mr:' + msg, '');
        if (S.addMessageReply(id, msg, rmd, state.msgFiles['r:' + msg] || [])) {
          state.msgFiles['r:' + msg] = [];
          renderAll();
          settleComposer($view.querySelector('.rte-msg[data-key="mr:' + msg + '"]'));
          toast(L('ส่งแล้ว'));      // Sprint 1A — บอกให้รู้ว่าคำตอบส่งไปแล้ว
        } else {
          setDraft('mr:' + msg, rmd);
          if (rb) rb.innerHTML = global.RichText.toHtml(rmd, { editable: true });
        }
        return true;
      }
      case 'msg-reply-del':
        if (S.deleteMessageReply(id, el.dataset.msg, el.dataset.r)) toast(L('ลบคำตอบแล้ว'), L('ย้อนกลับ'), 'undo');
        return true;
      case 'msg-join': {
        var on = S.toggleMessageFollow(id, el.dataset.msg);
        if (on !== null) toast(on ? L('เข้าร่วมแล้ว จะได้รับแจ้งเตือนเมื่อมีคนตอบ') : L('ออกจากการสนทนาแล้ว'));
        return true;
      }
      case 'msg-file': {
        state.msgFileKey = el.dataset.k;
        var mf = document.getElementById('msgFile');
        if (mf) mf.click();
        return true;
      }
      case 'msg-file-del': {
        var k = el.dataset.k;
        state.msgFiles[k] = (state.msgFiles[k] || []).filter(function (f) { return f.id !== el.dataset.f; });
        renderViewBody();
        return true;
      }
    }
    return false;
  }

  /** change ของชิ้นงาน 3c — คืน true เมื่อจัดการแล้ว */
  function change3c(act, el) {
    if (act === 'kr-file-pick') {
      var kpid = el.dataset.id;
      readFiles(el, S.FILE_BYTES, function (list, skipped) {
        list.forEach(function (f) { S.addResource(kpid, { kind: 'file', name: f.name, url: f.url, size: f.size, mime: f.mime,
          driveId: f.driveId, driveItemId: f.driveItemId, webUrl: f.webUrl }); });
        skippedToast(skipped, '2 MB');
      });
      return true;
    }
    if (act === 'msg-file-pick') {
      var key = state.msgFileKey || 'new';
      readFiles(el, S.FILE_BYTES, function (list, skipped) {
        var cur = state.msgFiles[key] || [];
        state.msgFiles[key] = cur.concat(list).slice(0, S.MSG_ATT_MAX);
        skippedToast(skipped, '2 MB');
        renderViewBody();
      });
      return true;
    }
    if (act === 'ms-due') { setDates(el.dataset.id, { dueOn: el.value || null }); return true; }
    if (act === 'dwe' && state.dashEdit) {
      var w = state.dashEdit.w, k = el.dataset.k;
      w[k] = k === 'n' ? (parseInt(el.value, 10) || 8) : k === 'bench' ? (el.value === '' ? null : +el.value) : el.value;
      if (k === 'title') return true;            // ชื่อไม่เปลี่ยนตัวอย่าง ไม่ต้องวาดใหม่
      refreshDashEdit();
      return true;
    }
    if (/^dwf-/.test(act) && state.dashEdit) {
      var c = state.dashEdit.w.filters[+el.dataset.i];
      if (!c) return true;
      if (act === 'dwf-field') {
        var def = S.filterField(state.dashEdit.pid, el.value);
        c.f = el.value;
        c.op = def ? (S.FILTER_OPS[def.kind] || [['is']])[0][0] : 'is';
        c.v = def ? fltDefaultV(def.kind, c.op) : null;
      } else if (act === 'dwf-op') {
        var d2 = S.filterField(state.dashEdit.pid, c.f);
        c.op = el.value;
        c.v = d2 ? fltDefaultV(d2.kind, c.op) : null;
      } else if (act === 'dwf-val') {
        if (c.op === 'between') c.v = [el.value || '', (c.v && c.v[1]) || ''];
        else if (c.op === 'next' || c.op === 'last') c.v = Math.max(0, parseInt(el.value, 10) || 0);
        else if (el.type === 'number') c.v = el.value === '' ? '' : Number(el.value);
        else c.v = el.value;
      } else if (act === 'dwf-val2') c.v = [(c.v && c.v[0]) || '', el.value || ''];
      refreshDashEdit();
      return true;
    }
    return false;
  }

  /* ====================== 3c ส่วนที่ 2 — หน้าเอกสาร เวลา สูตร อ้างอิง ตรวจรูป ====================== */

  state.pgShowResolved = false;
  state.pageSel = null;            // ข้อความที่เลือกล่าสุดในตัวแก้หน้า { id, text, range }

  /** ช่องพิมพ์สูตร + ตัวช่วยกดแทรกฟิลด์/ฟังก์ชัน */
  function formulaFieldsHtml(pid, text, hidden, selfId) {
    var p = S.project(pid);
    var chips = S.FORMULA_BUILTIN.map(function (b) { return L(b[1]); });
    ((p && p.fields) || []).forEach(function (f) {
      if (f.id !== selfId && (f.type === 'number' || f.type === 'date' || f.type === 'formula')) chips.push(f.name);
    });
    return '<div class="field" id="nfFxWrap"' + (hidden ? ' hidden' : '') + '><label>' + L('สูตร') + ' *</label>' +
      '<textarea id="nfExpr" rows="2" class="fx-in" placeholder="' + esc(L('เช่น {งบ} - {ใช้ไป}  หรือ  DateAdd({กำหนดส่ง}, 7)')) + '">' + esc(text || '') + '</textarea>' +
      '<div class="fx-chips">' + chips.map(function (c) {
        return '<button type="button" class="fx-chip" data-act="fx-ins" data-v="{' + esc(c) + '}">{' + esc(c) + '}</button>';
      }).join('') + ['DateAdd(, )', 'DateSubtract(, )', 'Today()', 'Rollup(sum, )'].map(function (c) {
        return '<button type="button" class="fx-chip fn" data-act="fx-ins" data-v="' + esc(c) + '">' + esc(c.replace(/\(.*$/, '')) + '</button>';
      }).join('') + '</div><div class="fld-hint">' +
      L('ใช้ + − × ÷ และวงเล็บกับฟิลด์ตัวเลข/วันที่ วันที่ − วันที่ = จำนวนวัน · Rollup รวมค่าจากงานย่อย · ค่าคำนวณเองทุกครั้งที่เปิดดู แก้ด้วยมือไม่ได้') +
      '</div></div>';
  }

  /* ---------- หน้าเอกสาร ---------- */
  function pageUi() { return { showResolved: state.pgShowResolved }; }

  /** บันทึกตัวแก้หน้า (ออกจากช่อง หรือก่อนสร้างงาน/ความเห็น) */
  function savePageEditor(ed, quiet) {
    if (!ed || !ed.dataset || ed.dataset.save !== 'page') return false;
    var id = ed.dataset.id, l = S.pageLoc(id);
    if (!l) return false;
    var md = global.RichText.fromNode(ed, { blocks: true });
    if (md === l.page.body) return false;
    return S.savePage(id, { body: md });
  }
  document.addEventListener('focusout', function (e) {
    var ed = e.target;
    if (!ed || !ed.classList || !ed.classList.contains('rte') || ed.dataset.save !== 'page') return;
    afterClick(function () { savePageEditor(ed); });
  });
  /* ข้อความที่เลือกในหน้า — ปุ่ม "ความเห็น" / "สร้างงาน" ใช้ค่านี้ (กดปุ่มแล้วการเลือกอาจหายไป) */
  document.addEventListener('selectionchange', function () {
    var sel = global.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return;
    var r = sel.getRangeAt(0);
    var host = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentNode;
    var pg = host && host.closest ? host.closest('.pg[data-page]') : null;
    if (!pg || !host.closest('.rte-page')) return;
    var txt = sel.toString().replace(/\s+/g, ' ').trim();
    /* Sprint 1C — เก็บข้อความดิบที่ยังมีตัวขึ้นบรรทัดไว้ด้วย "สร้างงาน" จะได้แยกหนึ่งบรรทัดหนึ่งงาน */
    if (txt) state.pageSel = { id: pg.dataset.page, text: txt.slice(0, 300), raw: sel.toString().slice(0, 8000), range: r.cloneRange() };
  });

  /** ไฮไลต์ข้อความที่มีความเห็นค้างอยู่ (ครั้งแรกที่เจอในหน้า) — <mark> ไม่ถูกเก็บลงเนื้อหา */
  function markPageAnchors() {
    Array.prototype.forEach.call($view.querySelectorAll('.pg[data-page]'), function (pgEl) {
      var l = S.pageLoc(pgEl.dataset.page);
      var body = pgEl.querySelector('.rte-page');
      if (!l || !body) return;
      l.page.comments.forEach(function (c) {
        if (c.resolved || !c.quote) return;
        var w = document.createTreeWalker(body, 4, null, false), n;
        while ((n = w.nextNode())) {
          var at = n.nodeValue.indexOf(c.quote);
          if (at < 0) continue;
          var r = document.createRange();
          r.setStart(n, at); r.setEnd(n, at + c.quote.length);
          var mk = document.createElement('mark');
          mk.className = 'pg-anc'; mk.dataset.c = c.id;
          try { r.surroundContents(mk); } catch (e) { /* ข้ามโหนด */ }
          break;
        }
      });
    });
  }

  /* Sprint 1C — ยืนยันก่อนสร้างงานจากหน้าเอกสาร: เห็นรายการงานที่จะได้ (ผู้รับผิดชอบจาก @ชื่อ)
   * และเลือกปลายทาง ค่าเริ่มต้น = โปรเจกต์ของหน้านั้น (คอลัมน์แรก) ถ้าเป็นหน้าเดี่ยว = งานส่วนตัวในงานของฉัน */
  function pageTaskModal(id, items) {
    var l = S.pageLoc(id), esc = R.esc;
    var defP = l && l.project && S.canInProject(l.project.id, 'edit') ? l.project : null;
    var h = '<h2>' + L('สร้างงานจากหน้าเอกสาร') + '</h2>';
    h += '<p class="modal-sub">' + esc(L('หนึ่งบรรทัดเป็นหนึ่งงาน · {n} งาน', { n: items.length })) + '</p>';
    h += '<div class="pgt-list">';
    items.forEach(function (x) {
      var u = x.assigneeId ? S.user(x.assigneeId) : null;
      h += '<div class="pgt-row">' + I('checkCircle', 14) + '<span class="grow" title="' + esc(x.name) + '">' + esc(x.name) + '</span>' +
        (u ? R.avatar(u, 'sm') + '<span>' + esc(u.name) + '</span>' : '') +
        (x.dueOn ? '<span class="pgt-due">' + esc(R.fmtDate(x.dueOn)) + '</span>' : '') + '</div>';
    });
    h += '</div>';
    h += '<div class="field"><label>' + L('สร้างไว้ที่') + '</label><select id="pgtTarget">' +
      '<option value=""' + (defP ? '' : ' selected') + '>' + esc(L('งานของฉัน (ส่วนตัว)')) + '</option>';
    S.activeProjects().filter(function (p) { return S.canInProject(p.id, 'edit'); }).forEach(function (p) {
      h += '<optgroup label="' + esc(p.name) + '">';
      p.sections.forEach(function (s, i) {
        h += '<option value="' + esc(p.id + '|' + s.id) + '"' + (defP && defP.id === p.id && i === 0 ? ' selected' : '') + '>' +
          esc(p.name + ' › ' + s.name) + '</option>';
      });
      h += '</optgroup>';
    });
    h += '</select></div>';
    if (S.canEditPage(id)) {
      h += '<label class="chk"><input type="checkbox" id="pgtReplace" checked> ' +
        esc(L('แทนแต่ละบรรทัดในหน้าด้วยลิงก์ไปงานที่สร้าง')) + '</label>';
    }
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="pg-task-go" data-id="' + esc(id) + '">' +
      esc(items.length === 1 ? L('สร้างงาน') : L('สร้าง {n} งาน', { n: items.length })) + '</button></div>';
    return h;
  }

  function versionsModal(id) {
    var l = S.pageLoc(id);
    if (!l) return '';
    var vs = l.page.versions.map(function (v, i) { return { v: v, i: i }; }).reverse();
    var h = '<h2>' + L('ประวัติเวอร์ชัน') + '</h2><p class="modal-sub">' +
      esc(L('เก็บ {n} เวอร์ชันล่าสุด บันทึกเวอร์ชันเมื่อแก้ห่างกันเกิน 10 นาทีหรือคนแก้เปลี่ยน', { n: S.PAGE_VERSIONS })) + '</p><div class="pgver">';
    if (!vs.length) h += '<div class="ovw-empty">' + L('ยังไม่มีเวอร์ชันเก่า') + '</div>';
    var canEdit = S.canEditPage(id);
    vs.forEach(function (x) {
      var u = S.user(x.v.by);
      h += '<div class="pgver-row"><div class="grow"><b>' + esc(x.v.title || L('ไม่มีชื่อ')) + '</b><em>' + esc((u ? u.name : '—') + ' · ' + R.fmtExact(x.v.at)) +
        '</em><div class="pgver-txt">' + esc(S.plainText(x.v.body).replace(/\s+/g, ' ').slice(0, 220)) + '</div></div>' +
        (canEdit ? '<button class="btn btn-sm" data-act="pg-restore" data-id="' + esc(id) + '" data-i="' + x.i + '">' + L('กู้คืน') + '</button>' : '') + '</div>';
    });
    return h + '</div><div class="modal-actions"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
  }

  /* ตัวเลือกรูปของปุ่ม "แทรกรูป" — รูปเก็บที่หน้าเอกสาร (≤ 500 KB) ไม่ใช่ในเนื้อหา */
  var imgInput = null;
  global.RichText.pickImage = function (ed, cb) {
    var id = ed && ed.dataset.id;
    if (!id || !S.pageLoc(id)) { toast(L('แทรกรูปได้เฉพาะในหน้าเอกสาร')); return; }
    if (!imgInput) {
      imgInput = document.createElement('input');
      imgInput.type = 'file'; imgInput.accept = 'image/png,image/jpeg,image/gif,image/webp'; imgInput.hidden = true;
      document.body.appendChild(imgInput);
    }
    imgInput.onchange = function () {
      readFiles(imgInput, S.PAGE_IMG_BYTES, function (list, skipped) {
        skippedToast(skipped, '500 KB');
        list.forEach(function (f) {
          var im = S.addPageImage(id, f.name, f.url, f);
          if (im) cb(im.id, im.url, '');
          else toast(L('แทรกรูปไม่ได้ (ชนิดไฟล์ ขนาด หรือครบจำนวนแล้ว)'));
        });
      });
    };
    imgInput.click();
  };
  global.RichText.imgs = function (imgId) {
    var all = (S.db.pages || []).slice();
    S.db.projects.forEach(function (p) { all = all.concat(p.pages || []); });
    for (var i = 0; i < all.length; i++) {
      var hit = (all[i].imgs || []).filter(function (x) { return x.id === imgId; })[0];
      if (hit) return S.attImgSrc(hit);
    }
    return '';
  };

  /* ---------- นาฬิกาจับเวลาลอย ---------- */
  var $pill = document.createElement('div');
  $pill.id = 'timerPill';
  document.body.appendChild($pill);
  function renderPill() { $pill.innerHTML = S.isActive() ? R.timerPill() : ''; tickTimers(); }
  function tickTimers() {
    Array.prototype.forEach.call(document.querySelectorAll('.tt-live[data-start]'), function (x) {
      var s = Math.max(0, Math.floor((Date.now() - Date.parse(x.dataset.start)) / 1000));
      var hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60;
      x.textContent = (hh ? hh + ':' : '') + (mm < 10 && hh ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
    });
  }
  setInterval(tickTimers, 1000);

  function timeAddModal(taskId) {
    return '<h2>' + L('บันทึกเวลา') + '</h2>' +
      '<div class="field"><label>' + L('วันที่') + '</label><input id="teDate" type="date" value="' + S.today() + '"></div>' +
      '<div class="field"><label>' + L('ระยะเวลา') + ' *</label><input id="teDur" placeholder="' + esc(L('เช่น 1h 30m, 1:30 หรือ 45m')) + '"></div>' +
      /* คีย์แยกจาก "บันทึก" (ปุ่มบันทึก = Save) ภาษาอังกฤษเดิมป้ายช่องนี้จึงขึ้นว่า "Save" */
      '<div class="field"><label>' + L('บันทึกสั้น ๆ') + '</label><input id="teNote" maxlength="500" placeholder="' + esc(L('ทำอะไรไป (ไม่บังคับ)')) + '"></div>' +
      /* 4b — ไทม์ชีต: เก็บเงินลูกค้าได้ไหม และหมวดของเวลา */
      '<div class="prj-2col"><div class="field"><label>' + L('หมวดเวลา') + '</label><select id="teCat"><option value="">' + L('ไม่ระบุ') + '</option>' +
      S.timeCats().map(function (c) { return '<option value="' + esc(c) + '">' + esc(L(c)) + '</option>'; }).join('') + '</select></div>' +
      '<label class="field te-bill"><input type="checkbox" id="teBill"> ' + L('เก็บเงินลูกค้าได้ (billable)') + '</label></div>' +
      '<div class="modal-actions"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="tt-save" data-id="' + esc(taskId) + '">' + L('บันทึก') + '</button></div>';
  }

  /* ---------- ฟิลด์อ้างอิง ---------- */
  function refPop(taskId, fid, q) {
    var f = S.fieldDef(fid);
    var cur = [].concat(S.fieldValue(taskId, fid) || []);
    var h = '<div class="ref-pop"><input class="inp" id="refQ" data-id="' + esc(taskId) + '" data-field="' + esc(fid) + '" value="' + esc(q || '') +
      '" placeholder="' + esc(L('ค้นหางาน โปรเจกต์ หรือพอร์ตโฟลิโอ')) + '"><div class="ref-res">';
    var list = S.refSearch(f, q);
    cur.forEach(function (id) { if (!list.some(function (x) { return x.id === id; })) { var it = S.refItem(id); if (it) list.unshift(it); } });
    if (!list.length) h += '<div class="ovw-empty">' + L('พิมพ์เพื่อค้นหางาน') + '</div>';
    list.forEach(function (x) {
      var on = cur.indexOf(x.id) >= 0;
      h += '<button data-act="ref-toggle" data-id="' + esc(taskId) + '" data-field="' + esc(fid) + '" data-ref="' + esc(x.id) + '">' +
        popCheck(on) + '<span class="grow">' + esc(x.name) + '</span><em>' + esc(L(({ task: 'งาน', project: 'โปรเจกต์', portfolio: 'พอร์ตโฟลิโอ', goal: 'เป้าหมาย' })[x.kind])) + '</em></button>';
    });
    return h + '</div></div>';
  }
  document.addEventListener('input', function (e) {
    if (!e.target || e.target.id !== 'refQ') return;
    var q = e.target.value, res = e.target.parentNode.querySelector('.ref-res');
    var tmp = document.createElement('div');
    tmp.innerHTML = refPop(e.target.dataset.id, e.target.dataset.field, q);
    if (res) res.innerHTML = tmp.querySelector('.ref-res').innerHTML;
  });

  function pageRoute(pid, pageId) {
    if (pid) state.route = { type: 'project', id: pid, view: 'pages', page: pageId || null };
    else state.route = { type: 'pages', page: pageId || null };
    renderAll();
  }

  /** หลังสร้างงานจากหน้าเอกสาร — แทนบรรทัดด้วยลิงก์งาน แล้วบอกผล
   *  แยกออกมาจาก pg-task-go เพราะตอนนี้อาจต้องรอหน้าต่างถามก่อนให้คนนอกโปรเจกต์ปิดเห็นงาน */
  function pgTaskDone(id, pk, made, repl) {
    if (!made.length) { toast(L('สร้างงานไม่ได้ในหน้านี้')); return; }
    /* แทนแต่ละบรรทัดด้วยป้ายอ้างถึงงานของบรรทัดนั้น (ครั้งแรกที่เจอในเนื้อหา) แล้วบันทึกหน้าครั้งเดียว */
    var pl2 = S.pageLoc(id);
    if (repl && pl2 && S.canEditPage(id)) {
      var nb = pl2.page.body;
      made.forEach(function (nt, i) {
        var src = pk.items[i] && pk.items[i].src, at2 = src ? nb.indexOf(src) : -1;
        if (at2 >= 0) nb = nb.slice(0, at2) + '@[' + nt.name.replace(/[\[\]\n]/g, ' ') + '](' + nt.id + ')' + nb.slice(at2 + src.length);
      });
      if (nb !== pl2.page.body) S.savePage(id, { body: nb });
    }
    state.pageSel = null;
    if (made.length === 1) toast(L('สร้างงาน “{t}” แล้ว', { t: made[0].name }), L('เปิดงาน'), 'open-task" data-id="' + made[0].id);
    else toast(L('สร้าง {n} งานแล้ว', { n: made.length }));
  }

  /** คำสั่งคลิกของ 3c ส่วนที่ 2 */
  function act3c2(act, el, e) {
    var id = el.dataset.id;
    switch (act) {
      /* --- หน้าเอกสาร --- */
      case 'pg-new': {
        var npid = el.dataset.project || '';
        askText(L('ชื่อหน้า'), '', function (title) {
          var x = S.createPage(npid || null, { title: title || '', private: false });
          if (!x) { toast(L('สร้างหน้าไม่ได้ (สิทธิ์หรือครบจำนวนแล้ว)')); return; }
          pageRoute(npid, x.id);
          setTimeout(function () { var ed = $view.querySelector('.rte-page[contenteditable="true"]'); if (ed) ed.focus(); }, 50);
        }, { ok: L('สร้าง'), note: npid ? '' : L('หน้าใหม่ทุกคนในองค์กรเห็นได้ เปลี่ยนเป็นส่วนตัวได้จากปุ่มรูปกุญแจ') });
        return true;
      }
      case 'pg-open': pageRoute(el.dataset.project || '', id); return true;
      case 'pg-del':
        askConfirm(L('ลบหน้านี้?'), L('ความเห็นและประวัติเวอร์ชันของหน้านี้หายไปด้วย ย้อนกลับได้ทันทีหลังลบ'), function () {
          var l = S.pageLoc(id);
          var pid = l && l.project ? l.project.id : '';
          if (S.deletePage(id)) { pageRoute(pid, null); toast(L('ลบหน้าแล้ว'), L('ย้อนกลับ'), 'undo'); }
        }, { ok: L('ลบ'), danger: true });
        return true;
      case 'pg-private': {
        var pl = S.pageLoc(id);
        if (pl) S.setPagePrivate(id, !pl.page.private);
        return true;
      }
      case 'pg-versions': {
        var ed0 = $view.querySelector('.rte-page[data-id="' + id + '"]');
        if (ed0) savePageEditor(ed0);
        openModal(versionsModal(id), true);
        return true;
      }
      case 'pg-restore':
        if (S.restorePageVersion(id, +el.dataset.i)) { closeModal(); toast(L('กู้คืนเวอร์ชันแล้ว'), L('ย้อนกลับ'), 'undo'); }
        return true;
      case 'pg-show-resolved': state.pgShowResolved = !state.pgShowResolved; renderViewBody(); return true;
      case 'pg-comment': {
        var ps = state.pageSel;
        if (!ps || ps.id !== id) { toast(L('เลือกข้อความในหน้าก่อน แล้วกดอีกครั้ง')); return true; }
        var ed1 = $view.querySelector('.rte-page[data-id="' + id + '"]');
        if (ed1) savePageEditor(ed1);
        askText(L('ความเห็นต่อ “{q}”', { q: ps.text.length > 40 ? ps.text.slice(0, 39) + '…' : ps.text }), '', function (txt) {
          if (txt && S.addPageComment(id, ps.text, txt)) { state.pageSel = null; toast(L('แสดงความเห็นแล้ว'), L('ย้อนกลับ'), 'undo'); }
        }, { ok: L('ส่ง'), multiline: true });
        return true;
      }
      case 'pg-task': {
        var pt = state.pageSel;
        if (!pt || pt.id !== id) { toast(L('เลือกข้อความในหน้าก่อน แล้วกดอีกครั้ง')); return true; }
        var ed2 = $view.querySelector('.rte-page[contenteditable="true"][data-id="' + id + '"]');
        if (ed2) savePageEditor(ed2);                  // เนื้อหาล่าสุดลงที่เก็บก่อน
        /* Sprint 1C — หนึ่งบรรทัดหนึ่งงาน แล้วให้เลือกก่อนว่าจะลงโปรเจกต์/คอลัมน์ไหน */
        var pItems = S.pageTaskLines(pt.raw || pt.text);
        if (!pItems.length) { toast(L('เลือกข้อความในหน้าก่อน แล้วกดอีกครั้ง')); return true; }
        state.pgTask = { id: id, items: pItems };
        openModal(pageTaskModal(id, pItems));
        return true;
      }
      case 'pg-task-go': {
        var pk = state.pgTask;
        if (!pk || pk.id !== id) { closeModal(); return true; }
        var tgt = ((document.getElementById('pgtTarget') || {}).value || '').split('|');
        var repl = (document.getElementById('pgtReplace') || {}).checked;
        closeModal();
        state.pgTask = null;
        /* บรรทัดที่มี @ชื่อ = มอบงานให้คนนั้น ถ้าปลายทางเป็นโปรเจกต์ปิดที่เขาไม่ได้เป็นสมาชิก ถามก่อนสร้าง
         * งานยังไม่เกิดจึงถามจากสมาชิกของโปรเจกต์ปลายทาง (confirmRevealNew) ยกเลิก = ไม่สร้างสักงาน
         * ถ้าสร้างไม่ได้อยู่แล้ว (สิทธิ์) ไม่ต้องถาม ให้ tasksFromPage ปฏิเสธเหมือนเดิม */
        var pgWho = pk.items.map(function (x) { return x.assigneeId; }).filter(Boolean);
        var pgPid = tgt[0] && S.canCreateTask(tgt[0]) ? tgt[0] : null;
        confirmRevealNew(pgPid, pgWho, function () {
          var made = S.tasksFromPage(id, pk.items, tgt[0] || null, tgt[1] || null);
          pgTaskDone(id, pk, made, repl);
          return made;
        });
        return true;
      }
      case 'pg-reply': {
        var inp = $view.querySelector('.pgc-reply[data-c="' + el.dataset.c + '"]');
        if (!inp || !inp.value.trim()) { toast(L('พิมพ์ข้อความก่อน')); return true; }
        S.replyPageComment(id, el.dataset.c, inp.value);
        return true;
      }
      case 'pg-resolve': S.resolvePageComment(id, el.dataset.c, el.dataset.v === '1'); return true;
      case 'pg-cdel':
        if (S.deletePageComment(id, el.dataset.c)) toast(L('ลบความเห็นแล้ว'), L('ย้อนกลับ'), 'undo');
        return true;
      case 'pg-quote': {
        var mk = $view.querySelector('mark.pg-anc[data-c="' + el.dataset.c + '"]');
        if (!mk) { toast(L('ไม่พบข้อความนี้ในหน้าแล้ว')); return true; }
        mk.scrollIntoView({ block: 'center', behavior: 'smooth' });
        mk.classList.add('flash');
        setTimeout(function () { mk.classList.remove('flash'); }, 1600);
        return true;
      }
      case 'np-open':
        state.route = { type: 'mytasks' };
        S.mtSetView({ mode: 'notes' });
        renderAll();
        return true;

      /* --- เวลา --- */
      case 'timer-start':
        S.startTimer(id);
        toast(L('เริ่มจับเวลาแล้ว'));
        return true;
      case 'timer-stop': {
        var te = S.stopTimer();
        if (te) toast(L('บันทึกเวลา {v} แล้ว', { v: S.fmtMinutes(te.minutes) }), L('ย้อนกลับ'), 'undo');
        return true;
      }
      case 'timer-discard':
        askConfirm(L('ทิ้งเวลาที่จับอยู่?'), L('เวลาที่จับไว้จะไม่ถูกบันทึก'), function () { S.discardTimer(); }, { ok: L('ทิ้ง'), danger: true });
        return true;
      case 'tt-add': openModal(timeAddModal(id)); setTimeout(function () { var d = document.getElementById('teDur'); if (d) d.focus(); }, 30); return true;
      case 'tt-save': {
        var mins = S.parseDuration((document.getElementById('teDur') || {}).value);
        if (!mins) { toast(L('ใส่ระยะเวลาให้ถูกต้อง เช่น 1h 30m')); return true; }
        var teBill = document.getElementById('teBill');
        var teOk = S.addTimeEntry(id, { minutes: mins, date: (document.getElementById('teDate') || {}).value, note: (document.getElementById('teNote') || {}).value,
          billable: teBill && teBill.checked ? true : null, category: (document.getElementById('teCat') || {}).value || null });
        if (!teOk) { toast(L('สัปดาห์นี้ส่งไทม์ชีตหรืออนุมัติแล้ว ลงเวลาเพิ่มไม่ได้')); return true; }
        closeModal();
        toast(L('บันทึกเวลา {v} แล้ว', { v: S.fmtMinutes(mins) }), L('ย้อนกลับ'), 'undo');
        return true;
      }
      case 'tt-del':
        if (S.deleteTimeEntry(id, el.dataset.e)) toast(L('ลบรายการเวลาแล้ว'), L('ย้อนกลับ'), 'undo');
        return true;
      case 'time-csv': {
        closePops();
        var tp = S.project(id);
        if (tp) downloadText(S.projectTimeCsv(id), safeFileName(tp.name) + '-time.csv', 'text/csv;charset=utf-8');
        return true;
      }

      /* --- ฟิลด์สูตร / อ้างอิง --- */
      case 'fx-ins': {
        var ta = document.getElementById('nfExpr');
        if (!ta) return true;
        var a = ta.selectionStart || ta.value.length, b = ta.selectionEnd || a;
        ta.value = ta.value.slice(0, a) + el.dataset.v + ta.value.slice(b);
        ta.focus();
        var caret = a + el.dataset.v.length - (/\(.*\)$/.test(el.dataset.v) && el.dataset.v.slice(-2) !== '()' ? el.dataset.v.length - el.dataset.v.indexOf('(') - 1 : 0);
        try { ta.setSelectionRange(caret, caret); } catch (e3) {}
        return true;
      }
      case 'ref-pick': {
        if (popIsOpenFor(el)) { closePops(); return true; }
        openPop(el, refPop(id, el.dataset.field, ''));
        setTimeout(function () { var q = document.getElementById('refQ'); if (q) q.focus(); }, 20);
        return true;
      }
      case 'ref-toggle': {
        S.toggleRef(id, el.dataset.field, el.dataset.ref);
        var rq = document.getElementById('refQ');
        var pop = el.closest('.pop');
        if (pop) {
          var tmp = document.createElement('div');
          tmp.innerHTML = refPop(id, el.dataset.field, rq ? rq.value : '');
          pop.querySelector('.ref-res').innerHTML = tmp.querySelector('.ref-res').innerHTML;
        }
        return true;
      }

      /* --- ตรวจรูป --- */
      case 'proof-open': openModal(R.proofHtml(id, el.dataset.att), true); return true;
      case 'proof-pin': {
        if (!S.can('write', id)) return true;
        var img = el.querySelector('img');
        if (!img || (e.target.classList && e.target.classList.contains('proof-pin'))) return true;
        var rc = img.getBoundingClientRect(), ev = e;
        var px = (ev.clientX - rc.left) / rc.width, py = (ev.clientY - rc.top) / rc.height;
        if (px < 0 || px > 1 || py < 0 || py > 1) return true;
        var att = el.dataset.att;
        askText(L('ความเห็นของหมุดนี้'), '', function (txt) {
          if (!txt) { openModal(R.proofHtml(id, att), true); return; }
          var pin = S.addProofPin(id, att, px, py, txt);
          openModal(R.proofHtml(id, att), true);
          if (pin) toast(L('ปักหมุดที่ {n} แล้ว และสร้างงานย่อยให้', { n: pin.n }), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ปักหมุด') });
        return true;
      }
      case 'proof-unpin':
        S.removeProofPin(id, el.dataset.att, +el.dataset.n);
        openModal(R.proofHtml(id, el.dataset.att), true);
        return true;
    }
    return false;
  }

  function change3c2(act, el) {
    if (act === 'pg-title') { S.savePage(el.dataset.id, { title: el.value }); return true; }
    if (act === 'tt-est') {
      var v = el.value.trim();
      var mins = v ? S.parseDuration(v) : null;
      if (v && mins == null) { toast(L('ใส่ระยะเวลาให้ถูกต้อง เช่น 1h 30m')); renderDrawer(); return true; }
      S.setEstimate(el.dataset.id, mins);
      return true;
    }
    return false;
  }

  /* ====================== 4a — ทีม พอร์ตโฟลิโอ (ส่วนที่ 1) ====================== */

  function goPortfolio(id) {
    var f = S.portfolio(id);
    if (!f) return;
    state.route = f.defaultTab && S.pfSavedView(id, f.defaultTab)
      ? { type: 'portfolio', id: id, view: 'list', sv: f.defaultTab } : { type: 'portfolio', id: id, view: 'list' };
    clearSel();
    renderAll();
  }
  function goTeam(id, view) {
    if (!S.team(id)) return;
    state.route = { type: 'team', id: id, view: view || 'overview' };
    clearSel();
    renderAll();
  }
  /** ลิงก์จากกล่องแจ้งเตือน 'team:<id>[:แท็บ]' 'portfolio:<id>[:แท็บ]' 'goal:<id>' */
  function openRoute4a(r) {
    if (EXT.openRoute && EXT.openRoute(r)) return true;          // 4b — ไทม์ชีต รายงาน
    var m = /^(team|portfolio|goal):([^:]+)(?::(\w+))?$/.exec(String(r || ''));
    if (!m) return false;
    if (m[1] === 'team') { if (S.team(m[2])) goTeam(m[2], m[3]); return true; }
    if (m[1] === 'portfolio') {
      if (!S.portfolio(m[2])) return true;
      state.route = { type: 'portfolio', id: m[2], view: m[3] || 'list' };
      renderAll();
      return true;
    }
    if (m[1] === 'goal' && typeof S.goal === 'function' && S.goal(m[2])) {
      state.route = { type: 'goal', id: m[2] };
      renderAll();
      return true;
    }
    return true;
  }
  /** โปรเจกต์ที่สร้างจากปุ่ม "โปรเจกต์ใหม่" ในพอร์ตโฟลิโอ ใส่เข้าพอร์ตโฟลิโอนั้นทันที */
  function npToPortfolio(p) {
    var pf = state.npPf;
    state.npPf = null;
    if (p && pf && S.portfolio(pf)) S.addToPortfolio(pf, p.id);
  }

  /* ---------- มุมมองของพอร์ตโฟลิโอ ---------- */
  function pfViewFor(id) {
    var r = state.route;
    state.pfWork = state.pfWork || {};
    if (r.type === 'portfolio' && r.id === id && r.sv) {
      var sv = S.pfSavedView(id, r.sv);
      if (sv) {
        if (!state.pfWork[r.sv]) state.pfWork[r.sv] = S.pfFillView(S.clone(sv.view));
        return state.pfWork[r.sv];
      }
    }
    if (!state.pfWork['@' + id]) state.pfWork['@' + id] = S.pfView(id);
    return state.pfWork['@' + id];
  }
  function pfDirty() {
    var r = state.route;
    if (r.type !== 'portfolio' || !r.sv || !state.pfWork || !state.pfWork[r.sv]) return false;
    var sv = S.pfSavedView(r.id, r.sv);
    return !!sv && JSON.stringify(S.pfFillView(S.clone(sv.view))) !== JSON.stringify(state.pfWork[r.sv]);
  }
  function pfViewChanged() {
    var r = state.route;
    if (r.type !== 'portfolio') return;
    if (!r.sv) S.setPfView(r.id, pfViewFor(r.id));
    renderViewBody();
    if (state.pfOptOpen) openModal(pfOptsHtml(), true);
  }

  function pfOptsHtml() {
    var id = state.route.id, f = S.portfolio(id);
    if (!f) return '';
    var v = pfViewFor(id), page = state.pfOptPage || 'filters', key = 'pf:' + id;
    var tabs = [['filters', L('ตัวกรอง')], ['sorts', L('เรียง')], ['group', L('จัดกลุ่ม')], ['cols', L('เซกชัน')]];
    var h = '<h2>' + L('ตัวเลือกมุมมองพอร์ตโฟลิโอ') + '</h2><div class="hcard-tabs pfo-tabs">';
    tabs.forEach(function (t) {
      h += '<button class="tb-tab' + (page === t[0] ? ' active' : '') + '" data-act="pfv-opts" data-page="' + t[0] + '">' + esc(t[1]) + '</button>';
    });
    h += '</div><div class="pfo-body">';
    if (page === 'filters') {
      var ffs = S.filterFields(key);
      if (!v.filters.length) h += '<p class="prj-note">' + L('ยังไม่มีตัวกรอง') + '</p>';
      v.filters.forEach(function (c, i) {
        var def = S.filterField(key, c.f);
        var ops = def ? S.FILTER_OPS[def.kind] || [] : [];
        h += '<div class="flt-row">' + (i ? '<span class="flt-and">' + L('และ') + '</span>' : '') + '<div class="flt-line">' +
          optSelect('pfq-field', ffs.map(function (x) { return [x.id, x.custom ? x.label : L(x.label)]; }), c.f, ' data-i="' + i + '"') +
          optSelect('pfq-op', ops.map(function (o) { return [o[0], L(o[1])]; }), c.op, ' data-i="' + i + '"') +
          '<button class="flt-del" data-act="pfq-del" data-i="' + i + '" title="' + L('เอาเงื่อนไขนี้ออก') + '">' + I('close', 13) + '</button></div>' +
          fltValueHtml(key, c, i, 'pfq') + '</div>';
      });
      h += '<button class="btn btn-sm" data-act="pfq-add">' + I('plus', 13) + ' ' + L('เพิ่มตัวกรอง') + '</button>';
    } else if (page === 'sorts') {
      var keys = S.filterFields(key).map(function (x) { return [x.id, x.custom ? x.label : L(x.label)]; });
      if (!v.sorts.length) h += '<p class="prj-note">' + L('เรียงตามลำดับที่เพิ่มเข้าพอร์ต') + '</p>';
      v.sorts.forEach(function (s, i) {
        h += '<div class="flt-line">' + optSelect('pfs-key', keys, s.k, ' data-i="' + i + '"') +
          '<button class="btn btn-sm" data-act="pfs-dir" data-i="' + i + '">' + (s.d === 'desc' ? L('มากไปน้อย') : L('น้อยไปมาก')) + '</button>' +
          '<button class="flt-del" data-act="pfs-del" data-i="' + i + '">' + I('close', 13) + '</button></div>';
      });
      if (v.sorts.length < 3) h += '<button class="btn btn-sm" data-act="pfs-add">' + I('plus', 13) + ' ' + L('เพิ่มการเรียง') + '</button>';
    } else if (page === 'group') {
      var gs = S.PF_GROUPS.map(function (g) { return [g[0], L(g[1])]; })
        .concat((f.fields || []).filter(function (x) { return x.type === 'select' || x.type === 'person'; })
          .map(function (x) { return ['pff:' + x.id, x.name]; }));
      h += '<div class="flt-chips">';
      gs.forEach(function (g) {
        h += '<button class="flt-chip' + ((v.group || 'none') === g[0] ? ' on' : '') + '" data-act="pfg-set" data-v="' + esc(g[0]) + '">' + esc(g[1]) + '</button>';
      });
      h += '</div>';
    } else {
      var cols = R.PF_COLS.filter(function (c) { return c[0] !== 'goals' || typeof S.goalsOfItem === 'function'; })
        .map(function (c) { return [c[0], L(c[1])]; })
        .concat((f.fields || []).map(function (x) { return ['pff:' + x.id, x.name]; }));
      cols.forEach(function (c) {
        var on = v.hide.indexOf(c[0]) < 0;
        h += '<label class="pfo-col"><input type="checkbox" data-act="pfc-toggle" data-v="' + esc(c[0]) + '"' + (on ? ' checked' : '') + '> ' + esc(c[1]) + '</label>';
      });
    }
    h += '</div><div class="modal-acts"><button class="btn btn-primary" data-act="pfo-close">' + L('เสร็จแล้ว') + '</button></div>';
    return h;
  }

  /* ---------- ฟิลด์ของพอร์ตโฟลิโอ ---------- */
  var PFF_TYPE_LABELS = { number: 'ตัวเลข', text: 'ข้อความ', select: 'ตัวเลือกเดียว', date: 'วันที่', person: 'บุคคล', rollup: 'รวมจากงาน (rollup)' };
  function pffManageHtml(pfId) {
    var f = S.portfolio(pfId);
    if (!f) return '';
    var h = '<h2>' + L('ฟิลด์ของพอร์ตโฟลิโอ') + '</h2><p class="prj-note">' +
      L('ฟิลด์กรอกค่าแยกต่อแถว (โปรเจกต์/พอร์ตโฟลิโอย่อย) ส่วน rollup รวมค่าฟิลด์ตัวเลขจากงานในโปรเจกต์ให้เอง') + '</p>';
    if (!f.fields.length) h += '<div class="ovw-empty">' + L('ยังไม่มีฟิลด์') + '</div>';
    f.fields.forEach(function (fd) {
      h += '<div class="pff-row">' + I(fd.type === 'rollup' ? 'bolt' : 'hash', 14) + '<span class="grow"><b>' + esc(fd.name) + '</b><em>' +
        esc(L(PFF_TYPE_LABELS[fd.type] || fd.type)) + (fd.type === 'rollup' ? ' · ' + esc(L(R.rollupFnLabel(fd.fn))) : '') + '</em></span>' +
        '<button class="icon-btn" data-act="pff-edit" data-id="' + esc(pfId) + '" data-f="' + esc(fd.id) + '" title="' + L('แก้ไข') + '">' + I('pencil', 13) + '</button>' +
        '<button class="icon-btn" data-act="pff-del" data-id="' + esc(pfId) + '" data-f="' + esc(fd.id) + '" title="' + L('ลบ') + '">' + I('trash', 13) + '</button></div>';
    });
    h += '<div class="modal-acts"><button class="btn" data-act="pff-new" data-id="' + esc(pfId) + '">' + I('plus', 13) + ' ' + L('เพิ่มฟิลด์') + '</button>' +
      '<button class="btn btn-primary" data-act="close-modal">' + L('เสร็จแล้ว') + '</button></div>';
    return h;
  }
  function pffEditHtml() {
    var e = state.pffEdit, d = e.def, f = S.portfolio(e.pf);
    var h = '<h2>' + (d.id ? L('แก้ฟิลด์') : L('เพิ่มฟิลด์')) + '</h2>';
    h += '<div class="field"><label>' + L('ชื่อฟิลด์') + '</label><input id="pffName" class="inp" maxlength="80" value="' + esc(d.name || '') + '"></div>';
    h += '<label class="opt-lbl">' + L('ชนิด') + '</label><div class="flt-chips">';
    S.PF_FIELD_TYPES.forEach(function (t) {
      h += '<button class="flt-chip' + (d.type === t ? ' on' : '') + '"' + (d.id ? ' disabled' : ' data-act="pff-type" data-v="' + t + '"') + '>' +
        esc(L(PFF_TYPE_LABELS[t])) + '</button>';
    });
    h += '</div>';
    if (d.type === 'select') {
      h += '<div class="field"><label>' + L('ตัวเลือก (คั่นด้วยจุลภาค)') + '</label><input id="pffOpts" class="inp" value="' +
        esc((d.options || []).map(function (o) { return o.name; }).join(', ')) + '"></div>';
    }
    if (d.type === 'rollup') {
      var srcs = S.pfRollupSources(e.pf);
      h += '<div class="field"><label>' + L('รวมค่าจากฟิลด์ตัวเลขของงาน') + '</label>';
      if (!srcs.length) h += '<p class="prj-note">' + L('ยังไม่มีฟิลด์ตัวเลขในโปรเจกต์ใต้พอร์ตโฟลิโอนี้') + '</p>';
      else h += '<select id="pffSrc" class="inp">' + srcs.map(function (s) {
        return '<option value="' + esc(s.id) + '"' + (d.src === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
      }).join('') + '</select>';
      h += '</div><div class="field"><label>' + L('วิธีรวม') + '</label><select id="pffFn" class="inp">' + S.ROLLUP_FNS.map(function (x) {
        return '<option value="' + x + '"' + (d.fn === x ? ' selected' : '') + '>' + esc(L(R.rollupFnLabel(x))) + '</option>';
      }).join('') + '</select></div>';
    }
    if (d.type === 'number' || d.type === 'rollup') {
      var fm = d.format || {};
      h += '<div class="field"><label>' + L('รูปแบบตัวเลข') + '</label><select id="pffFmt" class="inp">' +
        S.NUMBER_FORMATS.map(function (x) { return '<option value="' + x.id + '"' + ((fm.kind || 'number') === x.id ? ' selected' : '') + '>' + esc(L(x.label)) + '</option>'; }).join('') +
        '</select></div>';
    }
    h += '<div class="modal-acts"><button class="btn" data-act="pff-manage" data-id="' + esc(e.pf) + '">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="pff-save">' + L('บันทึก') + '</button></div>';
    return h;
  }

  /* ---------- ทีม: หน้าต่าง ---------- */
  function teamEditHtml(tid) {
    var t = tid ? S.team(tid) : null;
    var cur = t || { name: '', desc: '', privacy: 'public', color: S.PALETTE[S.teams().length % S.PALETTE.length], icon: '👥' };
    var h = '<h2>' + (t ? L('แก้ไขทีม') : L('สร้างทีม')) + '</h2>';
    h += '<div class="field"><label>' + L('ชื่อทีม') + '</label><input id="tmName" class="inp" maxlength="120" value="' + esc(cur.name) + '"></div>';
    h += '<div class="field"><label>' + L('คำอธิบาย') + '</label><textarea id="tmDesc" class="inp" rows="3">' + esc(cur.desc) + '</textarea></div>';
    h += '<label class="opt-lbl">' + L('ความเป็นส่วนตัว') + '</label>';
    S.TEAM_PRIVACY.forEach(function (p) {
      h += '<label class="tm-priv"><input type="radio" name="tmPriv" value="' + p.id + '"' + (cur.privacy === p.id ? ' checked' : '') + '>' +
        '<span><b>' + esc(L(p.label)) + '</b><em>' + esc(L(p.desc)) + '</em></span></label>';
    });
    h += '<label class="opt-lbl">' + L('สี') + '</label><div class="swatch-pick" id="pColors">';
    S.PALETTE.forEach(function (c) {
      h += '<button type="button" data-color="' + c + '" class="' + (c === cur.color ? 'on' : '') + '" style="background:' + c + '"></button>';
    });
    h += '</div><div class="field" style="max-width:170px;margin-top:12px"><label>' + L('ไอคอน (อีโมจิ)') + '</label><input id="tmIcon" class="inp" maxlength="4" value="' +
      esc(cur.icon) + '"></div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button><button class="btn btn-primary" data-act="team-save"' +
      (t ? ' data-id="' + esc(t.id) + '"' : '') + '>' + (t ? L('บันทึก') : L('สร้างทีม')) + '</button></div>';
    return h;
  }
  function teamMenuHtml(tid) {
    var t = S.team(tid), h = '';
    if (!t) return '';
    var manage = S.canManageTeam(tid), mem = S.isTeamMember(tid);
    if (manage) {
      h += '<button data-act="team-edit" data-id="' + esc(tid) + '">' + I('pencil', 14) + '<span class="grow">' + L('แก้ไขทีม') + '</span></button>';
      h += '<button data-act="team-add-member" data-id="' + esc(tid) + '">' + I('users', 14) + '<span class="grow">' + L('เพิ่มสมาชิก') + '</span></button>';
    }
    h += '<button data-act="copy-link-team" data-id="' + esc(tid) + '">' + I('link', 14) + '<span class="grow">' + L('คัดลอกลิงก์ทีม') + '</span></button>';
    if (mem) {
      h += '<div class="pop-sep"></div><button data-act="team-remove" data-id="' + esc(tid) + '" data-u="' + esc(S.db.currentUserId) + '">' +
        I('signOut', 14) + '<span class="grow">' + L('ออกจากทีม') + '</span></button>';
    }
    if (manage) {
      h += '<button class="danger" data-act="team-delete" data-id="' + esc(tid) + '">' + I('trash', 14) + '<span class="grow">' + L('ลบทีม') + '</span></button>';
    }
    return h;
  }
  function teamAddMemberHtml(tid) {
    var t = S.team(tid);
    var h = '<h2>' + L('เพิ่มสมาชิกเข้า {t}', { t: t.name }) + '</h2><div class="pf-pick">';
    var rest = S.db.users.filter(function (u) { return u.active !== false && !t.members.some(function (m) { return m.u === u.id; }); });
    if (!rest.length) h += '<p class="prj-note">' + L('ทุกคนอยู่ในทีมนี้แล้ว') + '</p>';
    rest.forEach(function (u) {
      h += '<button class="pf-pick-row" data-act="team-add-pick" data-id="' + esc(tid) + '" data-u="' + esc(u.id) + '">' + R.avatar(u, 'sm') +
        '<span class="grow"><b>' + esc(u.name) + '</b><em>' + esc(u.email || '') + '</em></span>' + I('plus', 15) + '</button>';
    });
    return h + '</div><div class="modal-acts"><button class="btn btn-primary" data-act="close-modal">' + L('เสร็จแล้ว') + '</button></div>';
  }
  function teamPinHtml(tid) {
    var t = S.team(tid);
    var h = '<h2>' + L('ปักหมุดในทีม') + '</h2><div class="pf-pick">';
    S.visibleProjects().map(function (p) { return { o: p, k: 'project' }; })
      .concat(S.portfolios().map(function (f) { return { o: f, k: 'portfolio' }; })).forEach(function (x) {
        var on = t.pins.indexOf(x.o.id) >= 0;
        h += '<button class="pf-pick-row' + (on ? ' on' : '') + '" data-act="team-pin" data-id="' + esc(tid) + '" data-item="' + esc(x.o.id) + '" data-re="1">' +
          '<span class="hproj-ic" style="background:' + esc(x.o.color) + '22">' + esc(x.o.icon) + '</span><span class="grow"><b>' + esc(x.o.name) +
          '</b><em>' + esc(x.k === 'portfolio' ? L('พอร์ตโฟลิโอ') : L('โปรเจกต์')) + '</em></span>' + (on ? R.ICON.check : I('plus', 15)) + '</button>';
      });
    return h + '</div><div class="modal-acts"><button class="btn btn-primary" data-act="close-modal">' + L('เสร็จแล้ว') + '</button></div>';
  }
  function teamShareHtml(pid) {
    var p = S.project(pid);
    var h = '<h2>' + L('แชร์ {p} ให้ทีม', { p: p.name }) + '</h2><p class="prj-note">' +
      L('สมาชิกของทีมได้สิทธิ์ตามที่เลือก บวกเพิ่มจากสิทธิ์ที่มีอยู่แล้ว (ใช้ระดับที่สูงที่สุด) โปรเจกต์ปิดก็เห็นได้ถ้าแชร์ให้ทีม') + '</p>';
    var list = S.visibleTeams();
    if (!list.length) h += '<div class="ovw-empty">' + L('ยังไม่มีทีม สร้างได้จากแถบซ้ายที่หัวข้อ “ทีม”') + '</div>';
    list.forEach(function (t) {
      var cur = (p.teams || []).filter(function (s) { return s.id === t.id; })[0];
      h += '<div class="pff-row"><span class="hproj-ic" style="background:' + esc(t.color) + '22">' + esc(t.icon) + '</span><span class="grow"><b>' +
        esc(t.name) + '</b><em>' + esc(L('{n} สมาชิก', { n: t.members.length })) + '</em></span>' +
        optSelect('team-share-set', [['', L('ไม่แชร์')]].concat(S.PROJECT_ACCESS.map(function (a) { return [a.id, L(a.label)]; })),
          cur ? cur.access : '', ' data-p="' + esc(pid) + '" data-t="' + esc(t.id) + '"') + '</div>';
    });
    return h + '<div class="modal-acts"><button class="btn btn-primary" data-act="close-modal">' + L('เสร็จแล้ว') + '</button></div>';
  }
  function pfUpdateHtml(pfId) {
    var f = S.portfolio(pfId);
    var cur = state.pfUpd || (f.status ? f.status.state : 'on_track');
    var h = '<h2>' + L('อัปเดตสถานะพอร์ตโฟลิโอ') + '</h2><div class="flt-chips">';
    S.PROJECT_STATES.forEach(function (x) {
      h += '<button class="flt-chip' + (cur === x.id ? ' on' : '') + '" data-act="pf-update-state" data-id="' + esc(pfId) + '" data-v="' + x.id + '">' +
        '<i class="flt-dot" style="background:' + x.color + '"></i>' + esc(L(x.label)) + '</button>';
    });
    h += '</div><div class="field"><label>' + L('สรุปความคืบหน้า') + '</label><textarea id="pfUpdText" class="inp" rows="5" placeholder="' +
      esc(L('เกิดอะไรขึ้นบ้าง อะไรเสี่ยง ต้องการความช่วยเหลือเรื่องไหน')) + '">' + esc(state.pfUpdText || '') + '</textarea></div>';
    return h + '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button><button class="btn btn-primary" data-act="pf-update-post" data-id="' +
      esc(pfId) + '">' + L('โพสต์อัปเดต') + '</button></div>';
  }
  function pickedTeamColor(fb) {
    var on = $modal.querySelector('#pColors button.on');
    return on ? on.dataset.color : fb;
  }

  /** คำสั่งคลิกของชิ้นงาน 4a — คืน true เมื่อจัดการแล้ว */
  function act4a(act, el, e) {
    var id = el.dataset.id;
    var rid = state.route.id;
    switch (act) {
      /* --- ทีม --- */
      case 'go-team': closeSidebar(); closePops(); closeModal(); goTeam(id); return true;
      case 'team-tab':
        state.route.view = el.dataset.v;
        renderAll();
        return true;
      case 'team-tdone': state.teamDone = el.dataset.v === '1'; renderViewBody(); return true;
      case 'team-new': closePops(); openModal(teamEditHtml(null)); return true;
      case 'team-edit': closePops(); openModal(teamEditHtml(id)); return true;
      case 'team-save': {
        var tn = ($modal.querySelector('#tmName') || {}).value || '';
        if (!tn.trim()) { toast(L('ใส่ชื่อทีมก่อน')); return true; }
        var pr = $modal.querySelector('input[name="tmPriv"]:checked');
        var attrs = { name: tn.trim(), desc: ($modal.querySelector('#tmDesc') || {}).value || '', privacy: pr ? pr.value : 'public',
          color: pickedTeamColor(null), icon: (($modal.querySelector('#tmIcon') || {}).value || '').trim() || '👥' };
        if (id) {
          if (!attrs.color) delete attrs.color;
          if (S.updateTeam(id, attrs)) { closeModal(); toast(L('บันทึกทีมแล้ว'), L('ย้อนกลับ'), 'undo'); }
          else denyToast();
        } else {
          var nt = S.createTeam(attrs);
          closeModal();
          if (nt) { goTeam(nt.id); toast(L('สร้างทีมแล้ว'), L('ย้อนกลับ'), 'undo'); } else denyToast();
        }
        return true;
      }
      case 'team-join': {
        e.stopPropagation();
        var jr = S.joinTeam(id);
        toast(jr === 'joined' ? L('เข้าร่วมทีมแล้ว') : jr === 'requested' ? L('ส่งคำขอเข้าร่วมแล้ว รอผู้ดูแลทีมอนุมัติ') : L('เข้าร่วมทีมนี้ไม่ได้'));
        renderAll();
        return true;
      }
      case 'team-menu':
        if (popIsOpenFor(el)) { closePops(); return true; }
        openPop(el, teamMenuHtml(id));
        return true;
      case 'copy-link-team':
        closePops();
        copyText(global.location.href.split('#')[0] + '#/team/' + id, L('คัดลอกลิงก์ทีมแล้ว'));
        return true;
      case 'team-privacy': {
        var tp = S.team(id);
        if (!tp) return true;
        var ph = '';
        S.TEAM_PRIVACY.forEach(function (p) {
          ph += '<button data-act="team-privacy-set" data-id="' + esc(id) + '" data-v="' + p.id + '"><span class="grow">' + esc(L(p.label)) + '</span>' +
            (tp.privacy === p.id ? R.ICON.check : '') + '</button>';
        });
        openPop(el, ph);
        return true;
      }
      case 'team-privacy-set':
        closePops();
        if (S.updateTeam(id, { privacy: el.dataset.v })) { renderAll(); toast(L('เปลี่ยนความเป็นส่วนตัวแล้ว'), L('ย้อนกลับ'), 'undo'); }
        return true;
      case 'team-delete': {
        closePops();
        var td = S.team(id);
        if (!td) return true;
        askConfirm(L('ลบทีม “{t}”?', { t: td.name }), L('โปรเจกต์ที่แชร์ให้ทีมยังอยู่ครบ แต่สมาชิกจะไม่ได้สิทธิ์ผ่านทีมนี้อีก'), function () {
          if (S.deleteTeam(id)) {
            if (state.route.type === 'team' && state.route.id === id) state.route = { type: 'teams' };
            renderAll();
            toast(L('ลบทีมแล้ว'), L('ย้อนกลับ'), 'undo');
          }
        }, { ok: L('ลบทีม') });
        return true;
      }
      case 'team-add-member': closePops(); openModal(teamAddMemberHtml(id)); return true;
      case 'team-add-pick':
        if (S.addTeamMember(id, el.dataset.u, 'member')) { openModal(teamAddMemberHtml(id)); renderAll(); } else denyToast();
        return true;
      case 'team-role': {
        var tr = S.team(id), mm = tr && tr.members.filter(function (m) { return m.u === el.dataset.u; })[0];
        if (!mm) return true;
        if (!S.setTeamRole(id, el.dataset.u, mm.role === 'admin' ? 'member' : 'admin')) toast(L('ต้องมีผู้ดูแลทีมอย่างน้อยหนึ่งคน'));
        else { renderAll(); toast(L('เปลี่ยนบทบาทแล้ว'), L('ย้อนกลับ'), 'undo'); }
        return true;
      }
      case 'team-remove': {
        closePops();
        var self = el.dataset.u === S.db.currentUserId, tu = el.dataset.u;
        askConfirm(self ? L('ออกจากทีมนี้?') : L('ถอดสมาชิกคนนี้ออกจากทีม?'), self ? L('สิทธิ์ที่ได้ผ่านทีมจะหายไปด้วย') : '', function () {
          if (S.removeTeamMember(id, tu)) { renderAll(); toast(self ? L('ออกจากทีมแล้ว') : L('ถอดออกแล้ว'), L('ย้อนกลับ'), 'undo'); }
          else toast(L('ต้องมีผู้ดูแลทีมอย่างน้อยหนึ่งคน'));
        }, { ok: self ? L('ออกจากทีม') : L('ถอดออก') });
        return true;
      }
      case 'team-req-ok':
      case 'team-req-no':
        if (S.answerTeamRequest(id, el.dataset.u, act === 'team-req-ok')) renderAll(); else denyToast();
        return true;
      case 'team-pin-pick': openModal(teamPinHtml(id)); return true;
      case 'team-pin': {
        e.stopPropagation();
        var pn = S.toggleTeamPin(id, el.dataset.item);
        if (pn === null) toast(L('ปักหมุดไม่ได้ (ครบ {n} รายการ หรือไม่มีสิทธิ์)', { n: S.TEAM_PIN_MAX }));
        if (el.dataset.re) openModal(teamPinHtml(id));
        renderAll();
        return true;
      }
      case 'team-res-add':
        askText(L('ลิงก์ (URL)'), 'https://', function (url) {
          if (!url || url === 'https://') return;
          askText(L('ชื่อที่แสดง'), '', function (name) {
            if (!S.addTeamResource(id, name, url)) toast(L('เพิ่มไม่ได้ — ตรวจลิงก์ หรือครบ {n} รายการแล้ว', { n: S.TEAM_RES_MAX }));
            else renderAll();
          }, { note: L('เว้นว่างได้ จะใช้ลิงก์เป็นชื่อ') });
        }, { type: 'url', ok: L('ถัดไป') });
        return true;
      case 'team-res-del':
        if (S.removeTeamResource(id, el.dataset.r)) { renderAll(); toast(L('เอาออกแล้ว'), L('ย้อนกลับ'), 'undo'); }
        return true;
      case 'team-share': closePops(); openModal(teamShareHtml(id || rid)); return true;

      /* --- พอร์ตโฟลิโอ --- */
      case 'pf-open':
        if (el.dataset.kind === 'portfolio') goPortfolio(id); else goProject(id);
        return true;
      case 'pf-nest': {
        var nr = S.addPortfolioToPortfolio(el.dataset.pf, id);
        if (nr === 'cycle') toast(L('ใส่ไม่ได้ เพราะจะทำให้พอร์ตโฟลิโอวนซ้อนกันเอง'));
        else if (nr) { openModal(portfolioAddModal(el.dataset.pf)); renderAll(); }
        return true;
      }
      case 'pf-unnest':
        e.stopPropagation();
        if (S.removePortfolioFromPortfolio(el.dataset.pf, id)) {
          if ($mdBack.classList.contains('open') && $modal.querySelector('.pf-pick')) openModal(portfolioAddModal(el.dataset.pf));
          renderAll();
          toast(L('ถอดออกจากพอร์ตโฟลิโอแล้ว'), L('ย้อนกลับ'), 'undo');
        }
        return true;
      case 'pf-newproj':
        state.npTab = 'blank';
        openModal(projectModal(null));
        state.npPf = el.dataset.pf;                   // หลัง openModal — ปุ่มสร้าง/เทมเพลตจะใส่เข้าพอร์ตนี้
        return true;
      case 'pfv-open': {
        var pvf = S.portfolio(rid), sv = S.pfSavedView(rid, id);
        if (!pvf || !sv) return true;
        state.route = { type: 'portfolio', id: rid, view: 'list', sv: id };
        renderAll();
        return true;
      }
      case 'pfv-menu': {
        e.stopPropagation();
        var mh = '<button data-act="pfv-rename" data-id="' + esc(id) + '">' + I('pencil', 14) + '<span class="grow">' + L('เปลี่ยนชื่อแท็บ') + '</span></button>' +
          '<button data-act="pfv-default" data-id="' + esc(id) + '">' + I('star', 14) + '<span class="grow">' + L('ตั้งเป็นแท็บเริ่มต้น') + '</span></button>' +
          '<div class="pop-sep"></div><button class="danger" data-act="pfv-delete" data-id="' + esc(id) + '">' + I('trash', 14) +
          '<span class="grow">' + L('ลบแท็บ') + '</span></button>';
        openPop(el, mh);
        return true;
      }
      case 'pfv-rename': {
        closePops();
        var rv = S.pfSavedView(rid, id);
        if (rv) askText(L('ชื่อแท็บ'), rv.name, function (v) { if (v && S.pfUpdateView(rid, id, { name: v })) renderAll(); });
        return true;
      }
      case 'pfv-default': closePops(); if (S.pfSetDefaultTab(rid, id)) { renderAll(); toast(L('ตั้งเป็นแท็บเริ่มต้นแล้ว'), L('ย้อนกลับ'), 'undo'); } return true;
      case 'pfv-delete':
        closePops();
        if (S.pfDeleteView(rid, id)) {
          state.route = { type: 'portfolio', id: rid, view: 'list' };
          renderAll();
          toast(L('ลบแท็บแล้ว'), L('ย้อนกลับ'), 'undo');
        }
        return true;
      case 'pfv-save':
        askText(L('ชื่อแท็บมุมมอง'), L('มุมมองใหม่'), function (v) {
          if (!v) return;
          var nv = S.pfSaveView(rid, v, pfViewFor(rid));
          if (!nv) { toast(L('บันทึกไม่ได้')); return; }
          state.route = { type: 'portfolio', id: rid, view: 'list', sv: nv.id };
          renderAll();
          toast(L('บันทึกเป็นแท็บแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('บันทึก') });
        return true;
      case 'pfv-update':
        if (state.route.sv && S.pfUpdateView(rid, state.route.sv, { view: pfViewFor(rid) })) {
          delete state.pfWork[state.route.sv];
          renderAll();
          toast(L('บันทึกมุมมองแล้ว'), L('ย้อนกลับ'), 'undo');
        }
        return true;
      case 'pfv-discard':
        if (state.route.sv && state.pfWork) delete state.pfWork[state.route.sv];
        renderAll();
        return true;
      case 'pfv-opts':
        state.pfOptPage = el.dataset.page || 'filters';
        state.pfOptOpen = true;
        openModal(pfOptsHtml(), true);
        return true;
      case 'pfo-close': state.pfOptOpen = false; closeModal(); return true;
      case 'pfq-add': {
        var qv = pfViewFor(rid), ff = S.filterFields('pf:' + rid)[0];
        var fop = (S.FILTER_OPS[ff.kind] || [['is']])[0][0];
        qv.filters.push({ f: ff.id, op: fop, v: fltDefaultV(ff.kind, fop) });
        pfViewChanged();
        return true;
      }
      case 'pfq-del': pfViewFor(rid).filters.splice(+el.dataset.i, 1); pfViewChanged(); return true;
      case 'pfq-opt': {
        var oc = pfViewFor(rid).filters[+el.dataset.i];
        if (!oc) return true;
        var ov = [].concat(oc.v || []), vv = el.dataset.v, at = ov.indexOf(vv);
        if (at >= 0) ov.splice(at, 1); else ov.push(vv);
        oc.v = ov;
        pfViewChanged();
        return true;
      }
      case 'pfs-add': pfViewFor(rid).sorts.push({ k: 'name', d: 'asc' }); pfViewChanged(); return true;
      case 'pfs-del': pfViewFor(rid).sorts.splice(+el.dataset.i, 1); pfViewChanged(); return true;
      case 'pfs-dir': {
        var sd = pfViewFor(rid).sorts[+el.dataset.i];
        if (sd) sd.d = sd.d === 'desc' ? 'asc' : 'desc';
        pfViewChanged();
        return true;
      }
      case 'pfg-set': pfViewFor(rid).group = el.dataset.v; pfViewChanged(); return true;

      /* --- ฟิลด์ของพอร์ตโฟลิโอ --- */
      case 'pff-manage': closePops(); state.pffEdit = null; openModal(pffManageHtml(id || rid)); return true;
      case 'pff-new':
        state.pffEdit = { pf: id, def: { name: '', type: 'number', options: [], fn: 'sum', src: '', format: null } };
        openModal(pffEditHtml());
        return true;
      case 'pff-edit': {
        var ef = S.portfolio(id), efd = ef && S.pfField(ef, el.dataset.f);
        if (!efd) return true;
        state.pffEdit = { pf: id, def: S.clone(efd) };
        openModal(pffEditHtml());
        return true;
      }
      case 'pff-type': {
        var pe = state.pffEdit;
        if (!pe) return true;
        var nmI = $modal.querySelector('#pffName');
        if (nmI) pe.def.name = nmI.value;
        pe.def.type = el.dataset.v;
        openModal(pffEditHtml());
        return true;
      }
      case 'pff-save': {
        var ps = state.pffEdit;
        if (!ps) return true;
        var d = ps.def;
        d.name = (($modal.querySelector('#pffName') || {}).value || '').trim();
        if (!d.name) { toast(L('ใส่ชื่อฟิลด์ก่อน')); return true; }
        var oi = $modal.querySelector('#pffOpts');
        if (oi) d.options = oi.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean)
          .map(function (n, i) { return { name: n, color: S.OPTION_COLORS[i % S.OPTION_COLORS.length] }; });
        var si = $modal.querySelector('#pffSrc'), fi = $modal.querySelector('#pffFn'), mi = $modal.querySelector('#pffFmt');
        if (si) d.src = si.value;
        if (fi) d.fn = fi.value;
        if (mi) d.format = mi.value === 'number' ? null : { kind: mi.value, currency: mi.value === 'currency' ? 'THB' : null, decimals: null };
        if (d.type === 'rollup' && !d.src) { toast(L('เลือกฟิลด์ต้นทางก่อน')); return true; }
        if (!S.savePfField(ps.pf, d)) { toast(L('บันทึกไม่ได้ (ครบ {n} ฟิลด์แล้ว?)', { n: S.PF_FIELD_MAX })); return true; }
        state.pffEdit = null;
        openModal(pffManageHtml(ps.pf));
        renderAll();
        return true;
      }
      case 'pff-del': {
        var dpf = id, dfid = el.dataset.f;
        askConfirm(L('ลบฟิลด์นี้?'), L('ค่าที่กรอกไว้ในฟิลด์นี้จะหายไปด้วย'), function () {
          if (S.deletePfField(dpf, dfid)) { renderAll(); toast(L('ลบฟิลด์แล้ว'), L('ย้อนกลับ'), 'undo'); }
        }, { ok: L('ลบฟิลด์') });
        return true;
      }
      case 'pff-cell': {
        e.stopPropagation();
        var cf = S.portfolio(el.dataset.pf), cfd = cf && S.pfField(cf, el.dataset.f);
        if (!cfd) return true;
        var it = S.portfolioItems(cf.id).filter(function (x) { return x.id === el.dataset.item; })[0];
        if (!it) return true;
        var curV = S.pfFieldValue(cf, it, cfd.id);
        var setV = function (v) { if (S.setPfValue(cf.id, it.id, cfd.id, v)) { renderAll(); toast(L('บันทึกแล้ว'), L('ย้อนกลับ'), 'undo'); } };
        if (cfd.type === 'select' || cfd.type === 'person') {
          var ch = (cfd.type === 'select' ? cfd.options.map(function (o) { return { label: o.name, v: o.name }; })
            : S.db.users.filter(function (u) { return u.active !== false; }).map(function (u) { return { label: u.name, v: u.id }; }))
            .map(function (o) { return { label: o.label, primary: o.v === curV, run: function () { setV(o.v); } }; });
          ch.push({ label: L('ล้างค่า'), run: function () { setV(null); } });
          askChoice(cfd.name + ' · ' + it.o.name, '', ch);
        } else {
          askText(cfd.name + ' · ' + it.o.name, curV == null ? '' : curV, function (v) { setV(v === '' ? null : v); },
            { type: cfd.type === 'number' ? 'number' : cfd.type === 'date' ? 'date' : 'text' });
        }
        return true;
      }
      case 'pf-update':
        state.pfUpd = null; state.pfUpdText = '';
        openModal(pfUpdateHtml(id));
        return true;
      case 'pf-update-state': {
        var ut = $modal.querySelector('#pfUpdText');
        state.pfUpdText = ut ? ut.value : '';
        state.pfUpd = el.dataset.v;
        openModal(pfUpdateHtml(id));
        return true;
      }
      case 'pf-update-post': {
        var upf = S.portfolio(id);
        var st = state.pfUpd || (upf && upf.status ? upf.status.state : 'on_track');
        var txt = ($modal.querySelector('#pfUpdText') || {}).value || '';
        if (S.postPortfolioUpdate(id, st, txt)) {
          closeModal();
          renderAll();
          toast(L('โพสต์อัปเดตสถานะแล้ว'), L('ย้อนกลับ'), 'undo');
        }
        return true;
      }
    }
    return act4a2 ? act4a2(act, el, e) : false;
  }
  var act4a2 = null;                    // ส่วนที่ 2 (เป้าหมาย) เสียบเพิ่ม

  /** change ของชิ้นงาน 4a */
  function change4a(act, el) {
    var rid = state.route.id;
    if (act === 'pfq-field' || act === 'pfq-op' || act === 'pfq-val' || act === 'pfq-val2') {
      var c = pfViewFor(rid).filters[+el.dataset.i];
      if (!c) return true;
      if (act === 'pfq-field') {
        var def = S.filterField('pf:' + rid, el.value);
        c.f = el.value;
        c.op = ((def && S.FILTER_OPS[def.kind]) || [['is']])[0][0];
        c.v = fltDefaultV(def ? def.kind : 'text', c.op);
      } else if (act === 'pfq-op') {
        var d2 = S.filterField('pf:' + rid, c.f);
        c.op = el.value;
        c.v = fltDefaultV(d2 ? d2.kind : 'text', c.op);
      } else if (act === 'pfq-val2') {
        c.v = [].concat(Array.isArray(c.v) ? c.v : ['', '']);
        c.v[1] = el.value;
      } else if (c.op === 'between') {
        c.v = [].concat(Array.isArray(c.v) ? c.v : ['', '']);
        c.v[0] = el.value;
      } else c.v = el.value;
      pfViewChanged();
      return true;
    }
    if (act === 'pfs-key') {
      var s = pfViewFor(rid).sorts[+el.dataset.i];
      if (s) s.k = el.value;
      pfViewChanged();
      return true;
    }
    if (act === 'pfc-toggle') {
      var v = pfViewFor(rid), k = el.dataset.v, at = v.hide.indexOf(k);
      if (el.checked && at >= 0) v.hide.splice(at, 1);
      if (!el.checked && at < 0) v.hide.push(k);
      pfViewChanged();
      return true;
    }
    if (act === 'team-share-set') {
      if (S.shareProjectWithTeam(el.dataset.p, el.dataset.t, el.value || null)) {
        openModal(teamShareHtml(el.dataset.p));
        renderAll();
        toast(el.value ? L('แชร์ให้ทีมแล้ว') : L('เลิกแชร์ให้ทีมแล้ว'), L('ย้อนกลับ'), 'undo');
      } else { denyToast(); openModal(teamShareHtml(el.dataset.p)); }
      return true;
    }
    return change4a2 ? change4a2(act, el) : false;
  }
  var change4a2 = null;

  /** หน้าเป้าหมาย (ส่วนที่ 2) */
  function goalsBody(r) {
    return goalsBody2 ? goalsBody2(r) : '<div class="empty"><div class="big">🎯</div>' + L('ยังไม่มีหน้าเป้าหมาย') + '</div>';
  }
  var goalsBody2 = null;

  /* ====================== 4a ส่วนที่ 2 — เป้าหมาย แผนผังกลยุทธ์ ====================== */
  state.goalsUi = { closed: false, fy: 'all' };
  state.goalUi = { gtab: 'comments' };
  state.smap = { x: 0, y: 0, k: 1 };

  goalsBody2 = function (r) {
    if (r.type === 'goal') {
      if (!S.goal(r.id) || !S.canSeeGoal(r.id)) { state.route = { type: 'goals', view: 'company' }; return R.goalsView('company', goalsUiArg()); }
      return R.goalView(r.id, state.goalUi);
    }
    return R.goalsView(r.view || 'company', goalsUiArg());
  };
  function goalsUiArg() { return { closed: state.goalsUi.closed, fy: state.goalsUi.fy, map: state.smap }; }
  function goGoal(id) { state.route = { type: 'goal', id: id }; state.goalUi = { gtab: 'comments' }; clearSel(); renderAll(); }

  function userOpts(cur, blank) {
    return (blank ? '<option value="">' + esc(blank) + '</option>' : '') + S.db.users.filter(function (u) { return u.active !== false; }).map(function (u) {
      return '<option value="' + esc(u.id) + '"' + (u.id === cur ? ' selected' : '') + '>' + esc(u.name) + '</option>';
    }).join('');
  }

  function goalEditHtml(id, preset) {
    var g = id ? S.goal(id) : null;
    preset = preset || {};
    var cur = g || { name: '', owner: S.db.currentUserId, team: preset.team || null, period: { k: 'fy', fy: S.fyOf() }, privacy: 'public',
      members: [], parent: preset.parent || null, desc: '' };
    var bad = id ? S.goalDescendants(id) : {};
    var teamsOk = S.isAdmin() ? S.teams() : S.myTeams();
    var fyNow = S.fyOf(), per = cur.period || {};
    var h = '<h2>' + (g ? L('แก้ไขเป้าหมาย') : L('เป้าหมายใหม่')) + '</h2>';
    h += '<div class="field"><label>' + L('ชื่อเป้าหมาย') + '</label><input id="gName" class="inp" maxlength="200" value="' + esc(cur.name) + '"></div>';
    h += '<div class="g-grid"><div class="field"><label>' + L('เจ้าของ') + '</label><select id="gOwner" class="inp">' + userOpts(cur.owner) + '</select></div>';
    h += '<div class="field"><label>' + L('ระดับ') + '</label><select id="gTeam" class="inp"><option value="">' + L('บริษัท') + '</option>' +
      teamsOk.map(function (t) { return '<option value="' + esc(t.id) + '"' + (cur.team === t.id ? ' selected' : '') + '>' + esc(L('ทีม') + ' · ' + t.name) + '</option>'; }).join('') +
      '</select></div>';
    h += '<div class="field"><label>' + L('ช่วงเวลา') + '</label><select id="gPerK" class="inp">' + S.GOAL_PERIODS.map(function (p) {
      return '<option value="' + p[0] + '"' + ((per.k || 'fy') === p[0] ? ' selected' : '') + '>' + esc(L(p[1])) + '</option>'; }).join('') + '</select></div>';
    h += '<div class="field"><label>' + L('ปีงบ') + '</label><select id="gFy" class="inp">' + [fyNow - 1, fyNow, fyNow + 1, fyNow + 2].map(function (y) {
      return '<option value="' + y + '"' + ((+per.fy || fyNow) === y ? ' selected' : '') + '>FY' + String(y).slice(2) + '</option>'; }).join('') + '</select></div>';
    h += '<div class="field"><label>' + L('เริ่ม (กำหนดเอง)') + '</label><input id="gFrom" type="date" class="inp" value="' + esc(per.from || '') + '"></div>';
    h += '<div class="field"><label>' + L('สิ้นสุด (กำหนดเอง)') + '</label><input id="gTo" type="date" class="inp" value="' + esc(per.to || '') + '"></div>';
    h += '<div class="field"><label>' + L('ความเป็นส่วนตัว') + '</label><select id="gPriv" class="inp"><option value="public">' + L('สาธารณะ') + '</option><option value="private"' +
      (cur.privacy === 'private' ? ' selected' : '') + '>' + L('ส่วนตัว (เฉพาะสมาชิก)') + '</option></select></div>';
    h += '<div class="field"><label>' + L('เป้าหมายแม่') + '</label><select id="gParent" class="inp"><option value="">' + L('ไม่มี') + '</option>' +
      S.visibleGoals().filter(function (x) { return x.id !== id && !bad[x.id]; }).map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (cur.parent === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></div></div>';
    h += '<label class="opt-lbl">' + L('สมาชิก') + '</label><div class="g-mem">' + S.db.users.filter(function (u) { return u.active !== false; }).map(function (u) {
      return '<label><input type="checkbox" class="gMem" value="' + esc(u.id) + '"' + (cur.members.indexOf(u.id) >= 0 ? ' checked' : '') + '> ' + esc(u.name) + '</label>'; }).join('') + '</div>';
    h += '<div class="field"><label>' + L('คำอธิบาย') + '</label><textarea id="gDesc" class="inp" rows="3">' + esc(cur.desc) + '</textarea></div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button><button class="btn btn-primary" data-act="goal-save"' +
      (g ? ' data-id="' + esc(g.id) + '"' : '') + '>' + (g ? L('บันทึก') : L('สร้างเป้าหมาย')) + '</button></div>';
    return h;
  }
  function readGoalForm() {
    var v = function (s) { var e = $modal.querySelector(s); return e ? e.value : ''; };
    var k = v('#gPerK') || 'fy';
    return {
      name: v('#gName').trim(), owner: v('#gOwner') || S.db.currentUserId, team: v('#gTeam') || null,
      period: { k: k, fy: +v('#gFy') || S.fyOf(), from: k === 'custom' ? v('#gFrom') || null : null, to: k === 'custom' ? v('#gTo') || null : null },
      privacy: v('#gPriv') === 'private' ? 'private' : 'public', parent: v('#gParent') || null, desc: v('#gDesc'),
      members: Array.prototype.map.call($modal.querySelectorAll('.gMem:checked'), function (c) { return c.value; })
    };
  }

  /* ---------- ตั้งค่าความคืบหน้า ---------- */
  function goalMetricHtml() {
    var e = state.gm, g = S.goal(e.id), m = e.m;
    var h = '<h2>' + L('ตั้งค่าความคืบหน้า') + '</h2><div class="flt-chips">';
    S.GOAL_SRCS.forEach(function (s) {
      h += '<button class="flt-chip' + (m.src === s[0] ? ' on' : '') + '" data-act="gm-src" data-v="' + s[0] + '">' + esc(L(s[1])) + '</button>';
    });
    h += '</div><div class="g-grid">';
    h += '<div class="field"><label>' + L('หน่วย') + '</label><select id="gmUnit" class="inp">' + [['percent', L('เปอร์เซ็นต์')], ['number', L('ตัวเลข')], ['currency', L('เงิน')]]
      .map(function (u) { return '<option value="' + u[0] + '"' + (m.unit === u[0] ? ' selected' : '') + '>' + esc(u[1]) + '</option>'; }).join('') + '</select></div>';
    if (m.unit !== 'percent') {
      h += '<div class="field"><label>' + L('ค่าเริ่มต้น') + '</label><input id="gmStart" type="number" step="any" class="inp" value="' + esc(m.start) + '"></div>';
      h += '<div class="field"><label>' + L('ค่าเป้าหมาย') + '</label><input id="gmTarget" type="number" step="any" class="inp" value="' + esc(m.target) + '"></div>';
      if (m.unit === 'currency') h += '<div class="field"><label>' + L('สกุลเงิน') + '</label><select id="gmCur" class="inp">' + S.CURRENCIES.map(function (c) {
        var code = c.id || c; return '<option value="' + esc(code) + '"' + (m.currency === code ? ' selected' : '') + '>' + esc(code) + '</option>'; }).join('') + '</select></div>';
    }
    if (m.src === 'manual') h += '<div class="field"><label>' + L('ค่าปัจจุบัน') + '</label><input id="gmCurrent" type="number" step="any" class="inp" value="' + esc(m.current) + '"></div>';
    h += '</div>';
    if (m.src === 'subgoals') {
      var kids = S.subGoals(e.id);
      h += '<div class="field"><label>' + L('วิธีรวม') + '</label><select id="gmAgg" class="inp"><option value="avg">' + L('ค่าเฉลี่ยของความคืบหน้า (ใส่น้ำหนักได้)') +
        '</option><option value="sum"' + (m.agg === 'sum' ? ' selected' : '') + '>' + L('รวมค่าของเป้าหมายย่อย (หน่วยตัวเลข/เงิน)') + '</option></select></div>';
      if (!kids.length) h += '<p class="prj-note">' + L('ยังไม่มีเป้าหมายย่อย') + '</p>';
      else {
        h += '<label class="opt-lbl">' + L('น้ำหนัก (%) — เว้นว่างทั้งหมด = เท่ากัน รวมต้องได้ 100') + '</label>';
        kids.forEach(function (c) {
          var w = m.weights && m.weights[c.id] != null ? m.weights[c.id] : '';
          h += '<div class="pff-row"><span class="grow"><b>' + esc(c.name) + '</b><em>' + Math.round(S.goalProgress(c.id).pct) + '%</em></span>' +
            '<input type="number" min="0" max="100" class="inp gm-w" data-g="' + esc(c.id) + '" value="' + esc(w) + '" style="width:80px"></div>';
        });
      }
    }
    if (m.src === 'projects') {
      h += '<div class="field"><label>' + L('นับจาก') + '</label><select id="gmBy" class="inp"><option value="tasks">' + L('งานที่เสร็จ') + '</option><option value="milestones"' +
        (m.projBy === 'milestones' ? ' selected' : '') + '>' + L('หมุดหมายที่เสร็จ') + '</option></select></div><div class="pf-pick pf-pick-sm">';
      S.visibleProjects().forEach(function (p) {
        var on = m.projects.indexOf(p.id) >= 0;
        h += '<label class="pf-pick-row' + (on ? ' on' : '') + '"><input type="checkbox" class="gm-p" value="' + esc(p.id) + '"' + (on ? ' checked' : '') + '>' +
          '<span class="hproj-ic" style="background:' + esc(p.color) + '22">' + esc(p.icon) + '</span><span class="grow"><b>' + esc(p.name) + '</b></span></label>';
      });
      h += '</div>';
    }
    if (m.src === 'tasks') {
      h += '<div class="flt-line"><input id="gmTq" class="inp" placeholder="' + esc(L('ค้นหางาน…')) + '" value="' + esc(e.q || '') + '">' +
        '<button class="btn btn-sm" data-act="gm-tsearch">' + L('ค้นหา') + '</button></div><div class="pf-pick pf-pick-sm">';
      var ids = m.tasks.slice();
      (e.q ? S.searchAdv({ q: e.q, limit: 20 }).map(function (x) { return x.task || x; }) : []).forEach(function (t) { if (t && t.id && ids.indexOf(t.id) < 0) ids.push(t.id); });
      ids.forEach(function (tid) {
        var t = S.task(tid);
        if (!t) return;
        var on = m.tasks.indexOf(tid) >= 0;
        h += '<button class="pf-pick-row' + (on ? ' on' : '') + '" data-act="gm-task" data-id="' + esc(tid) + '">' + (t.completed ? '✓' : '○') +
          '<span class="grow"><b>' + esc(t.name) + '</b></span>' + (on ? R.ICON.check : I('plus', 14)) + '</button>';
      });
      h += '</div>';
    }
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button><button class="btn btn-primary" data-act="gm-save">' + L('บันทึก') + '</button></div>';
    void g;
    return h;
  }
  /** อ่านค่าจากหน้าต่างกลับเข้า state.gm ก่อนวาดใหม่ */
  function readMetric() {
    var m = state.gm.m, q = function (s) { return $modal.querySelector(s); };
    if (q('#gmUnit')) m.unit = q('#gmUnit').value;
    if (q('#gmStart')) m.start = +q('#gmStart').value || 0;
    if (q('#gmTarget')) m.target = q('#gmTarget').value === '' ? 100 : +q('#gmTarget').value;
    if (q('#gmCur')) m.currency = q('#gmCur').value;
    if (q('#gmCurrent')) m.current = +q('#gmCurrent').value || 0;
    if (q('#gmAgg')) m.agg = q('#gmAgg').value;
    if (q('#gmBy')) m.projBy = q('#gmBy').value;
    if (q('#gmTq')) state.gm.q = q('#gmTq').value;
    var ws = $modal.querySelectorAll('.gm-w');
    if (ws.length) {
      var w = {}, any = false;
      Array.prototype.forEach.call(ws, function (i) { if (i.value !== '') { w[i.dataset.g] = +i.value; any = true; } });
      m.weights = any ? w : null;
    }
    var ps = $modal.querySelectorAll('.gm-p');
    if (ps.length) m.projects = Array.prototype.filter.call(ps, function (c) { return c.checked; }).map(function (c) { return c.value; });
  }

  function goalStateHtml(id, kind) {
    var list = kind === 'close' ? S.GOAL_OUTCOMES : S.GOAL_STATES, cur = state.gst;
    var h = '<h2>' + (kind === 'close' ? L('ปิดเป้าหมาย') : L('อัปเดตสถานะเป้าหมาย')) + '</h2><div class="flt-chips">';
    list.forEach(function (x) {
      h += '<button class="flt-chip' + (cur === x.id ? ' on' : '') + '" data-act="gst-pick" data-id="' + esc(id) + '" data-k="' + kind + '" data-v="' + x.id + '">' +
        '<i class="flt-dot" style="background:' + x.color + '"></i>' + esc(L(x.label)) + '</button>';
    });
    h += '</div><div class="field"><label>' + (kind === 'close' ? L('หมายเหตุ') : L('สรุปความคืบหน้า')) + '</label><textarea id="gstText" class="inp" rows="4">' +
      esc(state.gstText || '') + '</textarea></div>';
    return h + '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button><button class="btn btn-primary" data-act="gst-save" data-id="' +
      esc(id) + '" data-k="' + kind + '">' + (kind === 'close' ? L('ปิดเป้าหมาย') : L('โพสต์อัปเดต')) + '</button></div>';
  }
  function goalRelHtml(id) {
    var g = S.goal(id), q = state.grq || '';
    var h = '<h2>' + L('เชื่อมงานกับเป้าหมาย') + '</h2><input id="grq" class="inp" placeholder="' + esc(L('ค้นหาโปรเจกต์ พอร์ตโฟลิโอ หรืองาน…')) + '" value="' + esc(q) + '">' +
      '<div class="pf-pick" id="grList">' + goalRelList(id, q) + '</div>';
    void g;
    return h + '<div class="modal-acts"><button class="btn btn-primary" data-act="close-modal">' + L('เสร็จแล้ว') + '</button></div>';
  }
  function goalRelList(id, q) {
    var g = S.goal(id);
    return S.refSearch({ kinds: ['project', 'portfolio', 'task'] }, q).map(function (x) {
      var on = g.rel.indexOf(x.id) >= 0;
      return '<button class="pf-pick-row' + (on ? ' on' : '') + '" data-act="goal-rel" data-id="' + esc(id) + '" data-item="' + esc(x.id) + '" data-re="1">' +
        '<span class="grow"><b>' + esc(x.name) + '</b><em>' + esc(L(({ task: 'งาน', project: 'โปรเจกต์', portfolio: 'พอร์ตโฟลิโอ' })[x.kind])) + '</em></span>' +
        (on ? R.ICON.check : I('plus', 14)) + '</button>';
    }).join('') || '<p class="prj-note">' + L('พิมพ์เพื่อค้นหางาน') + '</p>';
  }
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'grq' && state.grGoal) {
      state.grq = e.target.value;
      var l = document.getElementById('grList');
      if (l) l.innerHTML = goalRelList(state.grGoal, state.grq);
    }
  });

  act4a2 = function (act, el, e) {
    var id = el.dataset.id;
    switch (act) {
      case 'go-goal': if (e) e.stopPropagation(); closePops(); closeSidebar(); goGoal(id); return true;
      case 'go-goals':
        state.route = { type: 'goals', view: el.dataset.v || 'company' };
        clearSel(); renderAll();
        return true;
      case 'goal-tab': state.goalUi.gtab = el.dataset.v; renderViewBody(); return true;
      case 'goal-new':
        openModal(goalEditHtml(null, { parent: el.dataset.parent || null,
          team: el.dataset.team ? ((S.myTeams()[0] || {}).id || null) : null }), true);
        return true;
      case 'goal-edit': openModal(goalEditHtml(id), true); return true;
      case 'goal-save': {
        var f = readGoalForm();
        if (!f.name) { toast(L('ใส่ชื่อเป้าหมายก่อน')); return true; }
        if (f.period.k === 'custom' && (!f.period.from || !f.period.to || f.period.to < f.period.from)) { toast(L('ตั้งวันเริ่มและวันสิ้นสุดให้ถูกต้อง')); return true; }
        if (id) {
          var r = S.updateGoal(id, f);
          if (r === 'cycle') { toast(L('เลือกเป้าหมายแม่นี้ไม่ได้ เพราะจะวนกัน')); return true; }
          if (!r) { denyToast(); return true; }
          closeModal(); renderAll(); toast(L('บันทึกเป้าหมายแล้ว'), L('ย้อนกลับ'), 'undo');
        } else {
          var ng = S.createGoal(f);
          if (!ng) { denyToast(); return true; }
          closeModal(); goGoal(ng.id); toast(L('สร้างเป้าหมายแล้ว'), L('ย้อนกลับ'), 'undo');
        }
        return true;
      }
      case 'goal-value': {
        var gv = S.goal(id);
        askText(L('ค่าปัจจุบันของ “{t}”', { t: gv.name }), gv.metric.current, function (v) {
          if (v === null || v === '') return;
          if (S.setGoalValue(id, v)) { renderAll(); toast(L('อัปเดตค่าแล้ว'), L('ย้อนกลับ'), 'undo'); } else toast(L('ใส่ตัวเลขให้ถูกต้อง'));
        }, { type: 'number', note: gv.metric.unit === 'percent' ? L('เปอร์เซ็นต์ 0–100') : L('เป้าหมาย {t}', { t: S.goalValueText(gv, gv.metric.target) }) });
        return true;
      }
      case 'goal-metric':
        state.gm = { id: id, m: S.clone(S.goal(id).metric), q: '' };
        openModal(goalMetricHtml(), true);
        return true;
      case 'gm-src': readMetric(); state.gm.m.src = el.dataset.v; openModal(goalMetricHtml(), true); return true;
      case 'gm-tsearch': readMetric(); openModal(goalMetricHtml(), true); return true;
      case 'gm-task': {
        readMetric();
        var ts = state.gm.m.tasks, at = ts.indexOf(id);
        if (at >= 0) ts.splice(at, 1); else ts.push(id);
        openModal(goalMetricHtml(), true);
        return true;
      }
      case 'gm-save': {
        readMetric();
        var mm = state.gm.m;
        if (mm.src === 'subgoals' && mm.weights) {
          var tot = 0;
          Object.keys(mm.weights).forEach(function (k) { tot += +mm.weights[k] || 0; });
          if (Math.abs(tot - 100) > 0.01) { toast(L('น้ำหนักรวมต้องได้ 100 (ตอนนี้ {n})', { n: tot })); return true; }
        }
        if (mm.unit !== 'percent' && mm.target === mm.start) { toast(L('ค่าเป้าหมายต้องต่างจากค่าเริ่มต้น')); return true; }
        if (S.updateGoal(state.gm.id, { metric: mm })) { closeModal(); renderAll(); toast(L('บันทึกวิธีวัดความคืบหน้าแล้ว'), L('ย้อนกลับ'), 'undo'); }
        else denyToast();
        return true;
      }
      case 'goal-update':
      case 'goal-close':
        state.gst = act === 'goal-close' ? 'achieved' : ((S.goal(id).status || {}).state || 'on_track');
        state.gstText = '';
        openModal(goalStateHtml(id, act === 'goal-close' ? 'close' : 'update'));
        return true;
      case 'gst-pick': {
        var gt = $modal.querySelector('#gstText');
        state.gstText = gt ? gt.value : '';
        state.gst = el.dataset.v;
        openModal(goalStateHtml(id, el.dataset.k));
        return true;
      }
      case 'gst-save': {
        var txt = ($modal.querySelector('#gstText') || {}).value || '';
        var ok = el.dataset.k === 'close' ? S.closeGoal(id, state.gst, txt) : S.postGoalUpdate(id, state.gst, txt);
        if (ok) { closeModal(); renderAll(); toast(el.dataset.k === 'close' ? L('ปิดเป้าหมายแล้ว') : L('โพสต์อัปเดตสถานะแล้ว'), L('ย้อนกลับ'), 'undo'); }
        else denyToast();
        return true;
      }
      case 'goal-reopen': if (S.reopenGoal(id)) { renderAll(); toast(L('เปิดเป้าหมายอีกครั้งแล้ว'), L('ย้อนกลับ'), 'undo'); } return true;
      case 'goal-delete': {
        var gd = S.goal(id);
        askConfirm(L('ลบเป้าหมาย “{t}”?', { t: gd.name }), L('เป้าหมายย่อยจะย้ายไปอยู่ใต้เป้าหมายแม่ของมันแทน'), function () {
          if (S.deleteGoal(id)) { state.route = { type: 'goals', view: 'company' }; renderAll(); toast(L('ลบเป้าหมายแล้ว'), L('ย้อนกลับ'), 'undo'); }
          else denyToast();
        }, { ok: L('ลบเป้าหมาย') });
        return true;
      }
      case 'goal-rel-pick': state.grGoal = id; state.grq = ''; openModal(goalRelHtml(id)); return true;
      case 'goal-rel': {
        if (e) e.stopPropagation();
        var on = S.toggleGoalRel(id, el.dataset.item);
        if (on === null) { denyToast(); return true; }
        if (el.dataset.re) { var l2 = document.getElementById('grList'); if (l2) l2.innerHTML = goalRelList(id, state.grq || ''); }
        renderViewBody();
        return true;
      }
      case 'goal-comment': {
        var ce = $view.querySelector('.rte-msg[data-key="gc:' + id + '"]');
        var md = ce ? global.RichText.fromNode(ce) : '';
        if (!md.trim()) { toast(L('พิมพ์ข้อความก่อน')); return true; }
        if (S.addGoalComment(id, md)) { setDraft('gc:' + id, ''); if (ce) ce.innerHTML = ''; renderAll(); }
        return true;
      }
      case 'goal-cdel': if (S.deleteGoalComment(id, el.dataset.c)) { renderAll(); toast(L('ลบความเห็นแล้ว'), L('ย้อนกลับ'), 'undo'); } return true;
      case 'goal-fv': {
        var gf = (S.db.goalFields || []).filter(function (x) { return x.id === el.dataset.f; })[0], gg = S.goal(id);
        if (!gf || !gg) return true;
        var setF = function (v) { if (S.setGoalField(id, gf.id, v)) renderAll(); };
        if (gf.type === 'select') {
          askChoice(gf.name, '', gf.options.map(function (o) { return { label: o.name, primary: gg.fv[gf.id] === o.name, run: function () { setF(o.name); } }; })
            .concat([{ label: L('ล้างค่า'), run: function () { setF(null); } }]));
        } else askText(gf.name, gg.fv[gf.id] == null ? '' : gg.fv[gf.id], function (v) { setF(v === '' ? null : v); }, { type: gf.type === 'number' ? 'number' : 'text' });
        return true;
      }
      case 'goal-csv':
        downloadText(S.goalsCsv(), 'orbit-goals-' + S.today() + '.csv', 'text/csv;charset=utf-8');
        return true;
      case 'goal-png': {
        var sv = $view.querySelector('.gv-chart svg.chart') || $view.querySelector('.gv-chart svg');
        var gp = S.goal(id);
        if (sv && gp) global.Charts.toPng(sv, safeFileName(gp.name), { title: gp.name, onError: function () { toast(L('ส่งออกรูปไม่สำเร็จ')); } });
        return true;
      }
      case 'goal-mission':
        if (!S.isAdmin()) { denyToast(); return true; }
        askText(L('พันธกิจขององค์กร'), (S.db.settings || {}).mission || '', function (v) {
          if (v === null) return;
          if (S.setGoalSettings({ mission: v })) { renderAll(); toast(L('บันทึกพันธกิจแล้ว'), L('ย้อนกลับ'), 'undo'); }
        }, { note: L('แสดงบนสุดของแผนผังกลยุทธ์ แก้ได้เฉพาะผู้ดูแลระบบ') });
        return true;
      case 'goal-field-add':
        askText(L('ชื่อฟิลด์ของเป้าหมาย'), '', function (name) {
          if (!name) return;
          askChoice(L('ชนิดฟิลด์'), name, [
            { label: L('ข้อความ'), run: function () { S.saveGoalField({ name: name, type: 'text' }); renderAll(); } },
            { label: L('ตัวเลข'), run: function () { S.saveGoalField({ name: name, type: 'number' }); renderAll(); } },
            { label: L('ตัวเลือกเดียว'), run: function () {
              askText(L('ตัวเลือก (คั่นด้วยจุลภาค)'), '', function (ops) {
                S.saveGoalField({ name: name, type: 'select', options: String(ops || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean)
                  .map(function (n, i) { return { name: n, color: S.OPTION_COLORS[i % S.OPTION_COLORS.length] }; }) });
                renderAll();
              });
            } }
          ]);
        }, { ok: L('ถัดไป') });
        return true;
      case 'goal-field-del':
        if (S.deleteGoalField(el.dataset.f)) { renderAll(); toast(L('ลบฟิลด์แล้ว'), L('ย้อนกลับ'), 'undo'); }
        return true;
      case 'smap-zoom': {
        var d = +el.dataset.d;
        if (!d) state.smap = { x: 0, y: 0, k: 1 };
        else state.smap.k = Math.max(0.3, Math.min(2.5, state.smap.k * (d > 0 ? 1.2 : 1 / 1.2)));
        applySmap();
        return true;
      }
    }
    return false;
  };
  change4a2 = function (act, el) {
    if (act === 'goal-fyf') { state.goalsUi.fy = el.value; renderViewBody(); return true; }
    if (act === 'goal-closed') { state.goalsUi.closed = el.checked; renderViewBody(); return true; }
    if (act === 'goal-remind') { S.updateGoal(el.dataset.id, { remind: el.checked }); return true; }
    if (act === 'goal-fy') {
      if (S.setGoalSettings({ fyStart: +el.value })) toast(L('ตั้งเดือนเริ่มปีงบแล้ว'), L('ย้อนกลับ'), 'undo');
      return true;
    }
    return false;
  };

  /* ---------- แผนผังกลยุทธ์: ลากเลื่อน / ซูม ---------- */
  function applySmap() {
    var g = $view.querySelector('.smap-g');
    if (g) g.setAttribute('transform', 'translate(' + state.smap.x + ',' + state.smap.y + ') scale(' + state.smap.k + ')');
  }
  function smapScale(svg) {
    var vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect();
    return vb && vb.width && r.width ? vb.width / r.width : 1;
  }
  var smapDrag = null;
  document.addEventListener('mousedown', function (e) {
    var vp = e.target.closest && e.target.closest('.smap-vp');
    if (!vp || e.button !== 0) return;
    var svg = vp.querySelector('svg');
    smapDrag = { x: e.clientX, y: e.clientY, ox: state.smap.x, oy: state.smap.y, s: svg ? smapScale(svg) : 1, moved: false };
    vp.classList.add('grabbing');
  });
  document.addEventListener('mousemove', function (e) {
    if (!smapDrag) return;
    var dx = e.clientX - smapDrag.x, dy = e.clientY - smapDrag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) smapDrag.moved = true;
    state.smap.x = smapDrag.ox + dx * smapDrag.s;
    state.smap.y = smapDrag.oy + dy * smapDrag.s;
    applySmap();
  });
  document.addEventListener('mouseup', function () {
    if (!smapDrag) return;
    if (smapDrag.moved) lastDragEnd = Date.now();     // ลากแล้วไม่นับเป็นคลิกบนกล่อง
    smapDrag = null;
    var vp = $view.querySelector('.smap-vp');
    if (vp) vp.classList.remove('grabbing');
  });
  document.addEventListener('wheel', function (e) {
    var vp = e.target.closest && e.target.closest('.smap-vp');
    if (!vp) return;
    e.preventDefault();
    var svg = vp.querySelector('svg'), s = svg ? smapScale(svg) : 1, r = svg.getBoundingClientRect();
    var px = (e.clientX - r.left) * s, py = (e.clientY - r.top) * s;
    var k0 = state.smap.k, k1 = Math.max(0.3, Math.min(2.5, k0 * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    /* ซูมรอบตำแหน่งเมาส์ */
    state.smap.x = px - (px - state.smap.x) * k1 / k0;
    state.smap.y = py - (py - state.smap.y) * k1 / k0;
    state.smap.k = k1;
    applySmap();
  }, { passive: false });


  /* ---------- ด่านตรวจสิทธิ์ ----------
   *
   * ทุกคำสั่งในแอปวิ่งผ่านตัวจัดการคลิกตัวเดียว จึงกันได้ที่จุดเดียวจบ
   * ถ้าเพิ่มคำสั่งใหม่ที่แก้ข้อมูล ต้องมาลงทะเบียนในตารางนี้ด้วย
   * ไม่มีในตาราง = ใครก็ทำได้ (พวกเปิดดู เปลี่ยนมุมมอง ตัวกรอง ดาวน์โหลดสำรอง)
   */
  var NEEDS = (function () {
    var map = {};
    function put(cap, list) { list.forEach(function (a) { map[a] = cap; }); }

    put('manage', [
      'manage-members', 'add-user', 'do-add-user', 'pick-person', 'remove-user', 'pick-role', 'set-role',
      'toggle-lock',
      'disable-user', 'enable-user', 'handover', 'do-handover', 'ho-guests',
      'delete-project', 'reset', 'import', 'paste-backup', 'do-paste-import',
      /* การสำรองข้อมูลคือการดึงฐานข้อมูลทั้งก้อนออกไปเป็นไฟล์
       * ในนั้นมีทุกโปรเจกต์ รวมถึงโปรเจกต์ปิดที่คนกดไม่มีสิทธิ์เห็น และอีเมลของทุกคน
       * ถ้าไม่กั้น ระบบสิทธิ์รายโปรเจกต์ทั้งหมดข้ามได้ด้วยปุ่มเดียว */
      'export', 'copy-backup', 'copy-dump'
    ]);
    put('structure', [
      'new-project', 'create-project', 'edit-project', 'save-project', 'dup-project', 'dup-project-go',
      'toggle-archive', 'update-status', 'save-status',
      'add-section', 'rename-section', 'delete-section', 'move-section',
      'manage-fields', 'add-field', 'delete-field', 'create-field', 'rename-field',
      'drop-field', 'add-field-picker', 'pick-ftype', 'add-option', 'remove-option',
      'opt-color', 'set-opt-color',
      'auto-new', 'auto-edit', 'auto-toggle', 'auto-dup', 'auto-del', 'ae-save',
      'pick-status', 'clear-status', 'toggle-view',
      'new-portfolio', 'pf-rename', 'pf-desc', 'pf-look', 'save-pf-look', 'pf-delete',
      'pf-add', 'pf-pick', 'pf-remove', 'pf-pick-status', 'pf-clear-status',
      'pf-toggle-project', 'add-to-portfolio',
      'manage-templates', 'delete-template', 'save-template', 'use-template',
      'save-view', 'delete-view', 'reset-cols',
      'g-set-baseline', 'g-clear-baseline',
      'save-project-details', 'set-depmode', 'set-depscope', 'set-workdays',
      'project-look', 'save-project-look', 'import-csv',
      'field-format', 'do-field-format'
    ]);
    put('write', [
      'delete-task', 'dup-task', 'bulk-complete', 'bulk-reopen', 'bulk-due',
      'bulk-delete', 'add-home', 'do-add-home', 'unhome', 'undo',
      /* งานใหม่ที่เกิดจากงานเดิม — สำเนา งานติดตามผล และสำเนาที่มอบให้หลายคน */
      'do-dup', 'followup', 'do-followup', 'assign-copies', 'do-assign-copies',
      'merge-task', 'do-merge', 'make-subtask', 'do-make-subtask', 'promote-task',
      /* ถังขยะ — store ตรวจซ้ำว่าเป็นของที่ตัวเองลบ (ผู้ดูแลกู้ได้ทุกอย่าง) */
      'trash-restore', 'trash-purge'
    ]);
    put('create', ['quick-add', 'inline-add']);
    put('write:task', [
      'toggle', 'add-subtask',
      'edit-title', 'edit-notes', 'edit-due', 'edit-start', 'edit-duetime', 'edit-starttime',
      'edit-type', 'edit-recur', 'edit-recur-n', 'recur-day', 'stop-recur', 'fit-parent-dates',
      'edit-field', 'edit-dep-type',
      'pick-assignee', 'set-assignee', 'pick-priority', 'set-priority', 'set-approval',
      'add-dependency', 'do-add-dependency', 'remove-dependency', 'g-del-dep',
      'add-attachment', 'remove-attachment',
      'add-tag', 'remove-tag',
      'edit-cell', 'cell-set-assignee', 'cell-set-option', 'cell-toggle-option',
      'dw-field-multi'
    ]);
    put('comment', [
      'send-comment', 'toggle-follow', 'do-follow', 'remove-follower',
      'pick-follower', 'toggle-like', 'react', 'react-menu', 'pick-tag',
      'pick-file', 'att-file', 'sub-dates', 'sub-assign', 'set-sub-assignee',
      'sub-start', 'sub-due', 'sub-clear-dates',
      /* ความเห็นแบบเธรด — แก้และลบได้เฉพาะของตัวเอง ตรวจซ้ำที่ store อีกชั้น */
      'send-reply', 'comment-reply', 'comment-edit', 'comment-save', 'comment-delete', 'comment-pin'
    ]);
    /* 2a — งานใหม่จากงานของฉัน / ปฏิทิน เป็นงานส่วนตัวของคนสร้าง */
    put('create', ['mt-add', 'mt-add-top', 'calx-add']);
    put('write', ['notif-followup']);
    put('write:task', ['make-public', 'do-make-public']);
    /* Sprint 1B — ส่งขออนุมัติใหม่หลังถูกขอแก้ (store ตรวจว่าเป็นคนขอหรือแก้งานได้ และไม่ใช่ผู้อนุมัติเอง)
     * ตัดสินอนุมัติเป็นหน้าที่ของผู้อนุมัติ ไม่ใช่สิทธิ์แก้งาน — ผู้อนุมัติที่มีสิทธิ์แค่แสดงความเห็นในโปรเจกต์
     * ก็ต้องกดได้ ไม่งั้นงานค้างตลอดไป จึงให้ canApprove ใน store เป็นคนตัดสินคนเดียว */
    put('write', ['approval-resubmit']);
    put('self', ['set-approval']);
    /* ของส่วนตัว — เซกชันงานของฉัน มุมมองที่จำไว้ หน้าแรก สมุดโน้ต บุ๊กมาร์ก อ่านแล้ว ห้ามรบกวน
     * การแจ้งเตือนรายโปรเจกต์ แก้ได้ทุกคนที่บัญชียังใช้งานได้ (รวมบทบาทดูอย่างเดียว)
     * เพราะไม่ได้แตะงานหรือโปรเจกต์ของใคร */
    put('self', [
      'mt-sec-add', 'mt-sec-rename', 'mt-sec-move', 'mt-sec-delete', 'mt-mode', 'mt-set',
      'mt-filter-clear', 'mt-sort-clear', 'calx-mode',
      'home-edit', 'home-w-add', 'home-w-remove', 'home-w-move', 'home-w-size', 'home-w-reset', 'notepad',
      'open-notif', 'notif-bookmark', 'notif-read', 'archive-notif', 'unarchive-notif',
      'inbox-read-all', 'inbox-archive-all', 'inbox-sort-set', 'inbox-dense',
      'dnd-set', 'dnd-off', 'dnd-sched', 'dnd-from', 'dnd-to', 'proj-notify'
    ]);
    /* 2b — แท็บมุมมองที่บันทึกไว้เป็นของทั้งโปรเจกต์ (แก้ได้เฉพาะคนที่แก้โครงสร้างได้)
     * ส่วนตัวกรอง เรียง จัดกลุ่ม คอลัมน์ การ์ด และปฏิทินเป็นมุมมองของแต่ละคน จำลง db.personal */
    put('structure', ['sv-rename', 'sv-move', 'sv-update', 'sv-delete', 'tab-default',
      'dup-section', 'do-dup-section']);
    put('write', ['carry-over', 'slip-overdue']);        // Sprint 3 — ย้ายงานระหว่างเซกชัน = แก้งาน ไม่ใช่แก้โครงสร้าง
    put('write:task', ['set-cover', 'clear-cover', 'cell-set-priority']);
    put('create', ['tl-new']);
    put('self', [
      'flt-add', 'flt-del', 'flt-opt', 'flt-me', 'flt-week', 'flt-clear', 'flt-field', 'flt-op', 'flt-val', 'flt-val2',
      'srt-add', 'srt-del', 'srt-dir', 'srt-key', 'sort-col', 'clear-sort', 'f-completed', 'f-showempty', 'reset-view',
      'lcol-toggle', 'lcol-move', 'foot-set', 'sec-collapse', 'sec-collapse-all', 'sec-expand-all',
      'bcol-toggle', 'bcol-all', 'bcard', 'bsize', 'b-group', 'b-swim',
      'cal-weekends', 'cal-colorby', 'tl-colorby', 'sv-discard'
    ]);
    /* 2c — แก้หลายงาน (เดิม bulk-assignee/bulk-priority ไม่ได้ลงทะเบียน ใครก็เปลี่ยนได้) */
    put('write', [
      'bulk-assignee', 'bulk-priority', 'bulk-more', 'bulk-section', 'bulk-section-pick',
      'bulk-project', 'do-bulk-project', 'bulk-field', 'do-bulk-field', 'bulk-followers', 'do-bulk-followers',
      'bulk-tag', 'bulk-type', 'bulk-dep', 'do-bulk-dep', 'bulk-merge', 'do-bulk-merge'
    ]);
    /* ฟิลด์ คลังฟิลด์ แท็กทั้งองค์กร บทบาท แปลงเป็นโปรเจกต์ นำเข้า = แก้โครงสร้าง */
    put('structure', [
      'create-field', 'field-edit', 'do-field-edit', 'field-promote', 'field-lib-use', 'field-lib-pick',
      'lib-new', 'lib-delete', 'tag-rename', 'tag-delete', 'project-roles', 'do-roles', 'to-project',
      'do-csv-import'
    ]);
    /* การค้นหาที่บันทึกไว้เป็นของตัวเอง ขอสิทธิ์/ตอบคำขอ (store ตรวจว่าเป็นเจ้าของหรือผู้ดูแลโปรเจกต์) */
    put('self', ['ss-save', 'ss-update', 'ss-rename', 'ss-delete', 'request-access', 'access-grant', 'access-deny']);
    /* 3a — สร้าง/แก้อัตโนมัติ = แก้โครงสร้าง (อยู่ในตารางด้านบน) ส่วนการกดรันอัตโนมัติแบบ "กดรันเอง"
     * ใครที่เห็นงานก็กดได้ รวมบทบาทดูอย่างเดียว — เป็นปุ่มที่คนแก้โปรเจกต์ตั้งไว้ให้ store ตรวจว่าเห็นงาน
     * อัตโนมัติของงานของฉันเป็นของตัวเอง ย้ายคอลัมน์จากแผงงานต้องแก้งานได้ */
    put('self', ['auto-run', 'auto-run-pick', 'auto-bulk', 'mt-auto-add', 'mt-auto-toggle', 'mt-auto-del']);
    put('write:task', ['dw-sec-pick']);
    /* 3b — ฟอร์ม ชนิดงาน เทมเพลต และรายงานสถานะ
     * สร้าง/แก้ = แก้โครงสร้าง (store ตรวจซ้ำว่าแก้โปรเจกต์นั้นได้) ส่งฟอร์ม = ทุกคนที่บัญชียังใช้งานได้
     * ใช้เทมเพลตโปรเจกต์/แชร์/ลบเทมเพลตตรวจที่ store (can('structure') / ptCanEdit) จึงไม่ผูกกับโปรเจกต์ที่เปิดอยู่
     * ใช้เทมเพลตงาน = เพิ่มงาน (ตรวจสิทธิ์แก้โปรเจกต์ในตัวจัดการอีกชั้น) */
    put('structure', ['fm-new', 'fm-edit', 'fm-toggle', 'fm-dup', 'fm-del', 'fe-save',
      'ty-new', 'ty-edit', 'ty-del', 'te-save', 'ty-default', 'pt-save', 'do-pt-save',
      'sb-remind', 'sb-tpl-save', 'tt-edit', 'tte-save', 'do-tt-save']);
    put('write:task', ['cell-status', 'set-cstatus', 'edit-cstatus']);
    put('create', ['use-template', 'tt-pick']);
    put('self', ['ff-submit', 'pt-use', 'pt-share', 'pt-org', 'pt-acc', 'pt-acc-add', 'pt-rename', 'pt-del', 'sb-tpl-del']);
    /* 3c — ภาพรวม (ทรัพยากร บรีฟ = แก้โครงสร้าง store ตรวจสิทธิ์แก้โปรเจกต์ซ้ำ) หมุดหมาย แดชบอร์ด ประกาศ เส้นทางวิกฤต
     * ms-show (แผงหมุดหมายแสดงอะไร) เก็บที่โปรเจกต์แต่ไม่ใช่ข้อมูลงาน จึงให้ทุกคนที่แก้โปรเจกต์ได้ */
    put('structure', ['kr-link', 'kr-file', 'kr-file-pick', 'kr-move', 'kr-del', 'brief-save', 'ms-show',
      'dash-add', 'dash-edit', 'dash-save', 'dash-del', 'dash-dup', 'dash-move', 'dash-size', 'dash-reset']);
    put('create', ['ms-add']);
    put('write:task', ['ms-due']);
    put('comment', ['msg-reply', 'msg-reply-del', 'msg-join', 'msg-file', 'msg-file-pick', 'msg-file-del', 'post-message']);
    put('self', ['crit-toggle']);
    /* Sprint 2B — เลื่อนเตือน ติดตามโปรเจกต์/พอร์ตโฟลิโอ เป็นของส่วนตัว
     * ตัดสินอนุมัติจากกล่องแจ้งเตือน/หน้าแรก ใช้กติกาเดียวกับ set-approval (store.canApprove ตัดสินคนเดียว) */
    put('self', ['notif-snooze', 'notif-snooze-set', 'notif-unsnooze', 'follow-toggle', 'apv-set']);
    put('write', ['bulk-chain', 'shift-apply', 'shift-only']);
    /* 3c ส่วนที่ 2 — หน้าเอกสาร (store ตรวจสิทธิ์ของหน้า: หน้าของโปรเจกต์ = แก้โปรเจกต์ได้ หน้าเดี่ยว = เจ้าของ/ทุกคน)
     * เวลา: ประมาณ = แก้งานได้ บันทึกเวลา/จับเวลา = แสดงความเห็นได้ ตรวจรูป/อ้างอิง = แก้งานได้ */
    put('self', ['pg-new', 'pg-del', 'pg-private', 'pg-restore', 'pg-comment', 'pg-reply', 'pg-resolve', 'pg-cdel', 'pg-title',
      'timer-stop', 'timer-discard']);
    put('create', ['pg-task', 'pg-task-go']);       // Sprint 1C — pg-task-go = ยืนยันสร้างหลายงาน
    put('write:task', ['tt-est', 'proof-pin', 'proof-unpin', 'ref-toggle']);
    put('comment', ['tt-add', 'tt-save', 'tt-del', 'timer-start']);
    /* 4a — ทีม: สร้าง/แชร์โปรเจกต์ให้ทีม = แก้โครงสร้าง; จัดการทีม (สมาชิก ความเป็นส่วนตัว ลบ ปักหมุด ทรัพยากร)
     * store ตรวจซ้ำว่าเป็นผู้ดูแลทีม/ผู้ดูแลระบบ/สมาชิก ส่วนเข้าร่วม/ออก/ขอเข้าร่วมเป็นเรื่องของตัวเอง
     * พอร์ตโฟลิโอ: ซ้อน ฟิลด์ ค่าในฟิลด์ แท็บมุมมอง โปรเจกต์ใหม่ อัปเดตสถานะ = แก้โครงสร้าง
     * ตัวกรอง/เรียง/จัดกลุ่ม/คอลัมน์ของพอร์ตโฟลิโอเป็นมุมมองของแต่ละคน */
    put('structure', ['team-new', 'team-share', 'team-share-set', 'pf-nest', 'pf-unnest', 'pf-newproj',
      'pfv-save', 'pfv-update', 'pfv-rename', 'pfv-default', 'pfv-delete', 'pff-new', 'pff-edit', 'pff-save', 'pff-del',
      'pff-cell', 'pf-update', 'pf-update-post']);
    put('self', ['team-save', 'team-edit', 'team-join', 'team-privacy-set', 'team-delete', 'team-add-member', 'team-add-pick',
      'team-role', 'team-remove', 'team-req-ok', 'team-req-no', 'team-pin', 'team-pin-pick', 'team-res-add', 'team-res-del',
      'pfq-add', 'pfq-del', 'pfq-opt', 'pfq-field', 'pfq-op', 'pfq-val', 'pfq-val2', 'pfs-add', 'pfs-del', 'pfs-dir', 'pfs-key',
      'pfg-set', 'pfc-toggle', 'pfv-discard']);
    /* 4a ส่วนที่ 2 — เป้าหมาย: สร้าง = ต้องเขียนได้ แก้/ปิด/อัปเดต/งานที่เกี่ยวข้อง store ตรวจว่าเป็นเจ้าของ สมาชิก
     * ผู้ดูแลทีมของเป้าหมายทีม หรือผู้ดูแลระบบ · ความเห็น = แสดงความเห็นได้
     * ปีงบ พันธกิจ ฟิลด์ของเป้าหมาย = ผู้ดูแลระบบเท่านั้น */
    put('create', ['goal-new']);
    put('self', ['goal-save', 'goal-edit', 'goal-value', 'goal-metric', 'gm-save', 'goal-update', 'goal-close', 'gst-save',
      'goal-reopen', 'goal-delete', 'goal-rel', 'goal-rel-pick', 'goal-fv', 'goal-remind', 'goal-cdel']);
    put('comment', ['goal-comment']);
    put('manage', ['goal-mission', 'goal-fy', 'goal-field-add', 'goal-field-del']);
    /* หน้าต่าง "ใครเข้าถึงโปรเจกต์นี้ได้" — เดิมอยู่ใน manage (ผู้ดูแลระบบเท่านั้น) ทั้งที่หน้าต่างโชว์ปุ่มให้
     * ผู้ดูแลโปรเจกต์ด้วย กดแล้วโดนปฏิเสธ ตอนนี้ใช้ S.canAddMembers ตัวเดียวกับหน้าต่าง ตัวเลือก
     * "เพิ่มเป็นสมาชิก" ตอนมอบงานให้คนนอก และชั้นข้อมูล (ผู้ดูแลระบบ หรือผู้ดูแลโปรเจกต์ที่ไม่ได้ล็อก)
     * ล็อกรายชื่อยังเป็นของผู้ดูแลระบบ (manage) ตามคำอธิบายของปุ่มล็อก */
    put('members', ['set-visibility', 'add-project-member', 'pick-access', 'set-access', 'drop-member']);
    /* งานย่อยในแผงงาน — เดิมเป็น comment คนที่แสดงความเห็นได้จึงตั้งวัน/มอบงานย่อยได้ทั้งที่แก้งานไม่ได้
     * ปุ่มที่เปิดเมนู (sub-dates/sub-assign) ซ่อนในแผงงานแล้ว ตัวที่แก้ค่าจริงต้องแก้งานย่อยนั้นได้ */
    put('write:task', ['set-sub-assignee', 'sub-start', 'sub-due', 'sub-clear-dates']);
    /* ลบงาน — เดิมเป็น write (ตรวจแค่บทบาทองค์กร) คนที่แสดงความเห็นได้ในโปรเจกต์ปิดจึงลบงานจากเมนูงานได้จริง
     * ต้องแก้งานชิ้นนั้นได้ (data-id = รหัสงาน) store ตรวจซ้ำอีกชั้น */
    put('write:task', ['delete-task']);
    return map;
  })();

  /** งานที่คำสั่งนี้กำลังจะแก้ ใช้ตรวจสิทธิ์ของโปรเจกต์ที่งานชิ้นนั้นอยู่ */
  function actTaskId(el) {
    var d = el.dataset.id;
    if (d && d.indexOf('t_') === 0) return d;
    return state.openTaskId || null;
  }

  /** บอกเหตุผลที่ถูกปฏิเสธให้ตรงจุด ไม่งั้นผู้ใช้ไปแก้ผิดที่
   *  ติดที่สิทธิ์โปรเจกต์กับติดที่บทบาทองค์กร แก้คนละที่กัน */
  function denyToast() {
    if (state.route.type === "project") {
      var acc = S.projectAccess(state.route.id);
      if (acc && !S.canInProject(state.route.id, "edit")) {
        toast(L("สิทธิ์ของคุณในโปรเจกต์นี้คือ “{acc}” จึงทำสิ่งนี้ไม่ได้",
          { acc: L(projectAccessLabel(acc)) }));
        return;
      }
    }
    toast(L("บทบาทของคุณคือ “{role}” จึงทำสิ่งนี้ไม่ได้",
      { role: R.roleLabel(S.role()) }));
  }

  function projectAccessLabel(id) {
    var a = S.PROJECT_ACCESS.filter(function (x) { return x.id === id; })[0];
    return a ? a.label : id;
  }

  /* Sprint 1B — ชั้นข้อมูลปฏิเสธเองได้แล้ว (ด่านสร้างงาน การอนุมัติ) ทางที่ไม่ผ่านตัวจัดการคลิก
   * เช่นกด Enter ในช่องเพิ่มงานหรือวางหลายบรรทัด ก็ได้ข้อความบอกเหตุผลเหมือนกัน
   * จำเวลาไว้ ข้อความ "ทำไม่ได้เพราะ…" อื่นที่ตามมาทันทีจะได้ไม่ทับเหตุผลจริง */
  var deniedAt = 0;
  function justDenied() { return Date.now() - deniedAt < 400; }
  S.onDeny(function (why) {
    deniedAt = Date.now();
    if (why === 'approval') {
      toast(L('งานขออนุมัติต้องให้ผู้อนุมัติตัดสิน — กดอนุมัติหรือปฏิเสธแล้วงานจะปิดให้เอง'));
      return;
    }
    /* บทบาทเขียนได้อยู่แล้ว แต่ติดสิทธิ์ของโปรเจกต์/งาน — บอกให้ตรงจุด ไม่ใช่โทษบทบาท */
    if (state.route.type !== 'project' && S.can('write')) {
      toast(L('คุณไม่มีสิทธิ์แก้ไขในโปรเจกต์หรืองานนี้'));
      return;
    }
    denyToast();
  });

  /** ผ่านสิทธิ์ไหม ถ้าไม่ผ่านจะเตือนให้ผู้ใช้รู้ว่าทำไม ไม่เงียบหาย */
  function allowed(act, el) {
    var need = NEEDS[act];
    if (!need) return true;
    var ok;
    if (need === "write:task") ok = S.can("write", actTaskId(el));
    /* Sprint 1B — สร้างงานในหน้าโปรเจกต์ = สร้างงานในโปรเจกต์นั้น ต้องแก้โปรเจกต์ได้ด้วย
     * (เดิมตรวจแค่บทบาทองค์กร คนที่แสดงความเห็นได้จึงเปิดช่อง + เพิ่มงานได้) */
    else if (need === "create") {
      var cPid = el.dataset.project || (state.route.type === "project" ? state.route.id : null);
      ok = cPid ? S.canCreateTask(cPid) : S.can("write");
    }
    else if (need === "self") ok = S.isActive();
    else if (need === "members") {
      ok = S.canAddMembers(el.dataset.id || (state.route.type === "project" ? state.route.id : null));
    }
    else if (need === "structure") {
      /* การแก้โครงสร้างเกิดขึ้นในบริบทของโปรเจกต์ที่เปิดอยู่
       * จึงต้องผ่านสิทธิ์ของโปรเจกต์นั้นด้วย ไม่ใช่แค่บทบาทระดับองค์กร */
      ok = S.can("structure") &&
           (state.route.type !== "project" || S.canInProject(state.route.id, "edit"));
    }
    else ok = S.can(need);
    /* 2c — แก้หลายงาน: ทุกงานที่เลือกต้องแก้ได้ (เดิมตรวจแค่บทบาท งานในโปรเจกต์ที่ดูได้อย่างเดียวก็ถูกแก้ได้) */
    if (ok && /^(do-)?bulk-/.test(act) && act !== 'bulk-clear' && act !== 'bulk-links') {
      ok = selectedIds().every(function (tid) { return S.can('write', tid); });
    }
    if (!ok) denyToast();
    return ok;
  }

  // ใช้เวลาแทนธงบูลีน เพราะบางครั้งเบราว์เซอร์ไม่ยิง click ตามหลัง mouseup
  // (เช่นปล่อยเมาส์นอกตัวแท่ง) ธงจะค้างแล้วไปกลืนคลิกครั้งถัดไป
  var lastDragEnd = 0;

  /* Sprint 1A — คลิกนอกแผงงาน = ปิดแผง "และ" ทำสิ่งที่คลิกด้วย
   * เดิมฉากหลังรับคลิกแรกไว้ปิดแผงอย่างเดียว (กดอวาตาร์ เมนู รายการถัดไปในกล่องแจ้งเตือน แล้วไม่เกิดอะไร)
   * ตอนนี้ฉากหลังปล่อยคลิกทะลุ (CSS) ตรงนี้จำไว้ว่าคลิกมาจากนอกแผง แล้วปิดแผงหลังคำสั่งของคลิกนั้นทำงานเสร็จ
   * ถ้าคลิกนั้นเปิดงานอื่น (แถวงาน รายการในกล่องแจ้งเตือน) openTask จะล้างธงนี้ แผงแค่สลับไปงานใหม่ ไม่ปิด
   * ไม่นับ: กล่องแจ้งเตือน (ปุ่มย้อนกลับ) หน้าต่าง/เมนูลอยที่เปิดจากในแผง รายการ @ และการลากเลือกข้อความที่เริ่มในแผง */
  var outsideClose = null, downInDrawer = false;
  document.addEventListener('pointerdown', function (e) {
    downInDrawer = !!(e.target && e.target.closest && e.target.closest('#drawer'));
  }, true);
  document.addEventListener('click', function (e) {
    if (!state.openTaskId || !$drawer.classList.contains('open')) return;
    var t = e.target;
    if (!t || !t.closest || downInDrawer || $drawer.contains(t)) return;
    if (Date.now() - lastDragEnd < 250) return;
    if (t.closest('#toast, #modalBackdrop, .pop, .rte-mention, #optPanel, #optBackdrop, #gate')) return;
    if (!document.body.contains(t)) return;          // ปุ่มในเมนูที่เพิ่งถูกลบไป ไม่ใช่คลิกนอกแผง
    var was = outsideClose = state.openTaskId;
    setTimeout(function () {
      if (outsideClose === was && state.openTaskId === was) closeDrawer();
      outsideClose = null;
    }, 0);
  }, true);

  document.addEventListener('click', function (e) {
    if (Date.now() - lastDragEnd < 250) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    var el = e.target.closest ? e.target.closest('[data-act]') : null;

    if (!el || ['pick-assignee', 'pick-priority', 'pick-follower',
         'add-field-picker', 'field-menu', 'opt-color', 'edit-cell',
         'project-menu', 'status-menu', 'g-zoom-menu', 'g-views-menu', 'pf-menu', 'pf-status',
         'view-menu', 'toggle-view', 'add-menu', 'react-menu',
         'add-tag', 'tag-search', 'sub-dates', 'sub-assign',
         'sub-start', 'sub-due', 'comment-menu', 'dw-field-multi',
         'mt-filter', 'mt-sort', 'mt-group', 'inbox-filter', 'inbox-sort', 'dnd-menu', 'notif-snooze',
         'sec-menu', 'foot-menu', 'tab-menu', 'col-menu', 'bulk-more', 'bulk-section', 'cell-status'].indexOf(el.dataset.act) < 0) {
      if (!e.target.closest || !e.target.closest('.pop')) closePops();
    }

    if ($scrim && e.target === $scrim) { closeSidebar(); return; }
    if (e.target === $mdBack) { if (!psGuardClose()) closeModal(); return; }     // Sprint 1C — ถามก่อนทิ้งร่างตั้งค่าโปรเจกต์
    if (e.target === $dwBack) { closeDrawer(); return; }
    if (e.target === $optBack) { closeOpts(); return; }
    if (!el) return;
    /* ปุ่มหลักของหน้าต่างที่มีช่องวันที่ซึ่งเพิ่งถูกปฏิเสธปี (ดู dgSettle) — ยังไม่บันทึกจนกว่าจะแก้ */
    if (el.classList && el.classList.contains('btn-primary') && $modal.contains(el) && dgBlocked($modal)) return;

    var act = el.dataset.act;
    var id = el.dataset.id;
    var sectionId = el.dataset.section;
    var projectId = el.dataset.project;
    if (!allowed(act, el)) return;
    if (act3c(act, el, e)) return;                // 3c
    if (act3c2(act, el, e)) return;
    if (act4a(act, el, e)) return;                // 4a
    if (act2b(act, el, e)) return;                // Sprint 2B — กล่องแจ้งเตือน ศูนย์อนุมัติ ติดตาม
    for (var xa = 0; xa < EXT.acts.length; xa++) if (EXT.acts[xa](act, el, e)) return;   // 4b

    switch (act) {

      /* --- navigation --- */
      case 'toggle-sidebar':
        /* จอกว้าง: ซ่อน/แสดงชั้นในของแถบซ้าย (ชั้นไอคอนยังอยู่) · จอแคบ: เลื่อนแถบเข้าออก */
        if (global.innerWidth > 860) { toggleSidebarCollapse(); break; }
        setSidebar(!document.getElementById('sidebar').classList.contains('open'));
        break;

      /* กดไอคอนหมวดที่ชั้นนอก — ดูรายการของหมวดนั้นโดยยังไม่เปลี่ยนหน้า
       * จำไว้คู่กับหน้าปัจจุบัน พอไปหน้าอื่นหมวดจะกลับไปตามหน้านั้นเอง */
      case 'nav-group':
        state.navPick = { g: el.dataset.g, key: R.routeKey(state.route) };
        if (global.innerWidth > 860 && document.body.classList.contains('sb-collapsed')) toggleSidebarCollapse(false);
        $sidebar.innerHTML = R.sidebar(state.route, state.navPick);
        break;

      case 'sb-page':
        closeSidebar();
        pageRoute('', id);
        break;

      case 'go': {
        closeSidebar();
        state.navPick = null;     // Sprint 1A — เลือกหน้าแล้ว แถบซ้ายกลับไปตามหมวดของหน้านั้น (แม้เป็นหน้าเดิม)
        var rt = el.dataset.route;
        if (rt === 'project') { goProject(id); break; }
        if (rt === 'portfolio') { goPortfolio(id); break; }
        if (rt === 'goal' || rt === 'team') { state.route = rt === 'goal' ? { type: 'goal', id: id } : { type: 'team', id: id, view: 'overview' }; clearSel(); renderAll(); break; }
        if (rt === 'profile') { goProfile(id); break; }
        state.route = { type: rt };
        state.calOffset = 0;
        clearSel();
        renderAll();
        break;
      }
      case 'go-profile':
        closePops();
        closeSidebar();
        goProfile(id);
        break;
      /* แท็บบนหน้าแรกเปลี่ยนแค่สิ่งที่แสดง ไม่แตะข้อมูล จึงวาดเฉพาะเนื้อหน้า
       * ไม่ต้อง renderAll ให้แถบซ้ายกะพริบตาม */
      case 'home-tab':
        state.home[el.dataset.card] = el.dataset.tab;
        renderViewBody();
        break;

      case 'home-more-projects':
        state.home.allProjects = !state.home.allProjects;
        renderViewBody();
        break;

      case 'set-view':
        state.route.view = el.dataset.view;
        delete state.route.sv;
        state.calOffset = 0;
        state.tlScrollLeft = null;      // เข้าไทม์ไลน์ใหม่ ให้ไปหยุดที่วันนี้
        state.ganttScroll = null;
        renderAll();
        break;

      case 'sort-col': {
        /* คลิก = เรียงชั้นแรก (กดซ้ำสลับทิศ ครั้งที่สามเลิกเรียง)  Shift+คลิก = เพิ่ม/สลับชั้นถัดไป */
        var key = el.dataset.key;
        var vw = viewFor(state.route.id);
        var cur = vw.sorts.slice();
        var at = -1;
        cur.forEach(function (s, i) { if (s.k === key) at = i; });
        if (e.shiftKey && cur.length) {
          if (at < 0) cur.push({ k: key, d: 'asc' });
          else if (cur[at].d === 'asc') cur[at] = { k: key, d: 'desc' };
          else cur.splice(at, 1);
        } else if (at !== 0) cur = [{ k: key, d: 'asc' }];
        else if (cur[0].d === 'asc') cur = [{ k: key, d: 'desc' }];
        else cur = [];                                   // กดครบรอบ กลับเป็นลำดับเดิม
        S.setSorts(vw, cur);
        refreshView();
        break;
      }
      case 'f-sortdir': {
        var vd = viewFor(state.route.id);
        vd.sortDir = (vd.sortDir === 'desc') ? 'asc' : 'desc';
        renderAll();
        refreshOpts();
        break;
      }

      /* --- ฟิลด์ในตาราง --- */
      case 'add-field-picker': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var fh = '<div class="ftype-list">';
        S.FIELD_TYPES.forEach(function (x) {
          fh += '<button class="ftype" data-act="pick-ftype" data-v="' + x.id + '">' +
            I(x.icon, 15) + '<span>' + L(x.label) + '</span></button>';
        });
        fh += '</div>';
        openPop(el, fh);
        focusPopFilter();
        break;
      }
      case 'pick-ftype':
        closePops();
        openModal(addFieldModal(el.dataset.v));
        break;
      case 'add-option': {
        var wrap = document.getElementById('nfOpts');
        var n = wrap.children.length;
        wrap.insertAdjacentHTML('beforeend',
          optionRow('', S.OPTION_COLORS[n % S.OPTION_COLORS.length]));
        break;
      }
      case 'remove-option': {
        var row = el.closest('.opt-row');
        if (row.parentNode.children.length > 1) row.remove();
        else toast(L('ต้องมีอย่างน้อย 1 ตัวเลือก'));
        break;
      }
      case 'opt-color': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var cur = el.style.background;
        var ch = '<div class="opt-swatches">';
        S.OPTION_COLORS.forEach(function (c) {
          ch += '<button type="button" data-act="set-opt-color" data-c="' + c +
            '" style="background:' + c + '"></button>';
        });
        ch += '</div>';
        openPop(el, ch);
        break;
      }
      case 'set-opt-color': {
        var dot = el.closest('.opt-row').querySelector('.opt-dot');
        dot.style.background = el.dataset.c;
        closePops();
        break;
      }
      case 'create-field': {
        var nm = document.getElementById('nfName').value.trim();
        if (!nm) { toast(L('ใส่ชื่อฟิลด์ก่อน')); break; }
        var ty = document.getElementById('nfType').value;
        var ftd = S.FIELD_TYPES.filter(function (x) { return x.id === ty; })[0];
        var opts = [];
        if (ftd && ftd.hasOptions) {
          Array.prototype.forEach.call(document.querySelectorAll('#nfOpts .opt-row'), function (r) {
            var v = r.querySelector('.opt-name').value.trim();
            if (v) opts.push({ name: v, color: rgbToHex(r.querySelector('.opt-dot').style.background) });
          });
          if (!opts.length) { toast(L('ใส่ตัวเลือกอย่างน้อย 1 รายการ')); return; }
        }
        var fdef = { name: nm, type: ty, options: opts,
          format: ty === 'number' || ty === 'formula' ? readNumberFormat() : null,
          desc: ((document.getElementById('nfDesc') || {}).value || '').trim(),
          notify: !!(document.getElementById('nfNotify') || {}).checked,
          prefix: (document.getElementById('nfPrefix') || {}).value };
        if (ty === 'formula') {          // 3c — ตรวจสูตรก่อนสร้าง (ชื่อฟิลด์ → รหัส)
          var cfx = S.compileFormula(state.route.id, (document.getElementById('nfExpr') || {}).value || '');
          if (cfx.error) { toast(L('สูตรไม่ถูกต้อง: {e}', { e: L(cfx.error, cfx.p) })); break; }
          fdef.expr = cfx.expr; fdef.out = cfx.out;
        }
        if (ty === 'ref') fdef.kinds = Array.prototype.map.call(document.querySelectorAll('.nf-refkind:checked'), function (x) { return x.value; });
        if (el.dataset.lib) {
          S.createLibField(fdef);
          openModal(libModal());
          toast(L('สร้างฟิลด์ในคลังแล้ว'), L('ย้อนกลับ'), 'undo');
          break;
        }
        var toLib = !!(document.getElementById('nfLib') || {}).checked && ty !== 'id' && ty !== 'formula' && ty !== 'ref';
        var cfPid = state.route.id;
        S.batch('เพิ่มฟิลด์', null, function () {
          var nfx = S.addField(cfPid, fdef);
          if (nfx && toLib) S.promoteFieldToLib(cfPid, nfx.id);
        });
        closeModal();
        toast(L('เพิ่มฟิลด์แล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      /* --- 2c: แก้ฟิลด์ คลังฟิลด์ --- */
      case 'field-edit':
        closePops();
        openModal(fieldEditModal(el.dataset.project || null, el.dataset.field));
        break;
      case 'do-field-edit': {
        var fePid = el.dataset.project || null;
        var feName = (document.getElementById('feName') || {}).value || '';
        if (!feName.trim()) { toast(L('ใส่ชื่อฟิลด์ก่อน')); break; }
        var fePatch = { name: feName, desc: (document.getElementById('feDesc') || {}).value || '' };
        if (document.getElementById('nfOpts')) {
          fePatch.options = readOptionRows();
          if (!fePatch.options.length) { toast(L('ใส่ตัวเลือกอย่างน้อย 1 รายการ')); break; }
          fePatch.notify = !!(document.getElementById('feNotify') || {}).checked;
        }
        if (document.getElementById('fePrefix')) fePatch.prefix = document.getElementById('fePrefix').value;
        if (document.getElementById('nfKind')) fePatch.format = readNumberFormat();
        if (document.getElementById('nfExpr')) {          // 3c — สูตร
          var fex = S.compileFormula(fePid, document.getElementById('nfExpr').value, el.dataset.field);
          if (fex.error) { toast(L('สูตรไม่ถูกต้อง: {e}', { e: L(fex.error, fex.p) })); break; }
          fePatch.expr = fex.expr; fePatch.out = fex.out;
        }
        S.updateFieldDef(fePid, el.dataset.field, fePatch);
        openModal(fePid ? fieldsModal(fePid) : libModal());
        toast(L('บันทึกฟิลด์แล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'field-promote':
        if (S.promoteFieldToLib(el.dataset.project, el.dataset.field)) {
          openModal(fieldsModal(el.dataset.project));
          toast(L('บันทึกลงคลังฟิลด์แล้ว โปรเจกต์อื่นหยิบไปใช้ได้'), L('ย้อนกลับ'), 'undo');
        }
        break;
      case 'field-lib': openModal(libModal()); break;
      case 'field-lib-pick': openModal(libPickModal(el.dataset.project)); break;
      case 'field-lib-use':
        if (S.addLibFieldToProject(el.dataset.project, el.dataset.field)) {
          openModal(fieldsModal(el.dataset.project));
          toast(L('เพิ่มฟิลด์จากคลังแล้ว'), L('ย้อนกลับ'), 'undo');
        }
        break;
      case 'lib-new': openModal(addFieldModal('text', true)); break;
      case 'lib-delete': {
        var ldf = S.libField(el.dataset.field);
        if (!ldf) break;
        askConfirm(L('เอา “{f}” ออกจากคลัง?', { f: ldf.name }),
          L('โปรเจกต์ที่ใช้อยู่ยังมีฟิลด์และค่าเดิม แต่จะแก้แยกกันแล้ว'), function () {
            S.deleteLibField(ldf.id);
            openModal(libModal());
            toast(L('เอาออกจากคลังแล้ว'), L('ย้อนกลับ'), 'undo');
          }, { ok: L('เอาออก') });
        break;
      }
      case 'field-menu': {
        e.stopPropagation();
        if (popIsOpenFor(el)) { closePops(); break; }
        var fid = el.dataset.field;
        var fmObj = findField(fid);
        openPop(el,
          '<button data-act="field-edit" data-project="' + R.esc(state.route.id) + '" data-field="' + R.esc(fid) + '">' +
          I('settings', 14) + ' ' + L('แก้ไขฟิลด์…') + '</button>' +
          '<button data-act="rename-field" data-field="' + R.esc(fid) + '">' +
          I('pencil', 14) + ' ' + L('เปลี่ยนชื่อ') + '</button>' +
          (fmObj && fmObj.type === 'number'
            ? '<button data-act="field-format" data-field="' + R.esc(fid) + '">' +
              I('hash', 14) + ' ' + L('รูปแบบตัวเลข…') + '</button>' : '') +
          '<button data-act="drop-field" data-field="' + R.esc(fid) + '">' +
          I('trash', 14) + ' ' + L('ลบ') + '</button>');
        break;
      }
      case 'rename-field': {
        closePops();
        var pf = S.project(state.route.id).fields
          .filter(function (x) { return x.id === el.dataset.field; })[0];
        var fid2 = el.dataset.field, pid2 = state.route.id;
        askText(L('เปลี่ยนชื่อฟิลด์'), pf ? pf.name : '', function (v) {
          if (v) S.renameField(pid2, fid2, v);
        });
        break;
      }
      case 'drop-field': {
        closePops();
        var dfPid = state.route.id, dfFid = el.dataset.field;
        askConfirm(L('ลบฟิลด์นี้?'), L('ฟิลด์และค่าที่กรอกไว้จะไปอยู่ในถังขยะ กู้คืนได้ภายใน {n} วัน', { n: S.TRASH_DAYS }), function () {
          S.deleteField(dfPid, dfFid);
          toast(L('ย้ายฟิลด์ไปถังขยะแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ลบฟิลด์') });
        break;
      }

      /* --- แก้ค่าในเซลล์ --- */
      case 'edit-cell':
        e.stopPropagation();
        editCell(el);
        break;
      case 'cell-set-assignee': {
        closePops();
        var csaId = el.dataset.id, csaU = el.dataset.user || null;
        confirmReveal(csaId, [csaU], function () { S.updateTask(csaId, { assigneeId: csaU }); });   // Sprint 1B
        break;
      }
      case 'cell-set-priority':
        closePops();
        S.updateTask(el.dataset.id, { priority: el.dataset.v || 'none' });
        break;
      case 'cell-set-option':
        closePops();
        S.setFieldValue(el.dataset.id, el.dataset.field, el.dataset.v || null);
        break;
      case 'cell-toggle-option': {
        var tid2 = el.dataset.id, fid2 = el.dataset.field, ov = el.dataset.v;
        var curv = [].concat(S.fieldValue(tid2, fid2) || []);
        var at = curv.indexOf(ov);
        if (at >= 0) curv.splice(at, 1); else curv.push(ov);
        S.setFieldValue(tid2, fid2, curv.length ? curv : null);
        /* เมนูยังเปิดค้างไว้ให้ติ๊กต่อได้ แต่เครื่องหมายถูกต้องตรงกับค่าใหม่ด้วย
         * เดิมกดแล้วค่าเปลี่ยนแต่เมนูยังโชว์ของเก่า ดูเหมือนกดไม่ติด */
        var openPopEl = document.querySelector('.pop');
        var fobj = findField(fid2);
        if (openPopEl && fobj) openPopEl.innerHTML = optionMenu(tid2, fobj);
        break;
      }
      case 'dw-field-multi': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var mf = findField(el.dataset.field);
        if (mf) openPop(el, optionMenu(el.dataset.id, mf));
        break;
      }

      /* --- gantt --- */
      case 'g-zoom-step': {
        var ids = S.GANTT_ZOOMS.map(function (x) { return x.id; });
        var vz = viewFor(state.route.id);
        var at = ids.indexOf(vz.gZoom);
        var next = at + (parseInt(el.dataset.d, 10) || 0);
        if (next < 0 || next >= ids.length) break;
        vz.gZoom = ids[next];
        state.ganttScroll = null;      // ซูมแล้วพิกัดเดิมไม่มีความหมาย ให้กลับไปที่วันนี้
        renderViewBody();
        refreshOpts();
        break;
      }
      case 'g-zoom-menu': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var vzm = viewFor(state.route.id);
        var zh = '';
        S.GANTT_ZOOMS.forEach(function (z) {
          zh += '<button data-act="g-zoom-pick" data-v="' + z.id + '">' +
            (vzm.gZoom === z.id ? R.ICON.check + ' ' : '<span class="pop-gap"></span>') +
            L(z.label) + '</button>';
        });
        openPop(el, zh);
        break;
      }
      case 'g-zoom-pick':
        closePops();
        viewFor(state.route.id).gZoom = el.dataset.v;
        state.ganttScroll = null;
        renderViewBody();
        refreshOpts();
        break;

      case 'g-today':
        state.ganttScroll = null;
        scrollGanttToToday();
        break;
      case 'g-pan': {
        var scp = $view.querySelector('.gantt-scroll');
        if (!scp) break;
        scp.scrollLeft += (parseInt(el.dataset.d, 10) || 1) * Math.round(scp.clientWidth * 0.7);
        state.ganttScroll = { x: scp.scrollLeft, y: scp.scrollTop };
        break;
      }

      /* ตัวกรอง เรียง จัดกลุ่ม เปิดเป็นหน้าย่อยของแผงเดียวกัน
       * ไม่แยกเป็นเมนูลอย เพราะสามอย่างนี้มักปรับต่อเนื่องกัน ถ้าเป็นเมนูลอยจะต้องเปิดปิดทีละอัน */
      case 'g-filter':  openOpts('filters'); break;
      case 'g-sort':    openOpts('sorts');   break;
      case 'g-group':   openOpts('groups');  break;
      case 'g-options': openOpts('root');    break;
      case 'g-opt-page':
        state.optPage = el.dataset.page || 'root';
        openOpts();
        break;
      case 'g-opt-close': closeOpts(); break;

      /* g-colorby / g-subtasks / g-zoom-set เป็น select จึงรับที่ตัวจัดการ change ไม่ใช่ที่นี่ */
      case 'g-col': {
        var vc = viewFor(state.route.id);
        var ck = el.dataset.col;
        vc.gCols[ck] = !vc.gCols[ck];
        renderViewBody();
        refreshOpts();
        break;
      }
      case 'g-basetoggle': {
        var vb = viewFor(state.route.id);
        var pb2 = S.project(state.route.id);
        if (!pb2.baseline && !vb.gShowBaseline) { toast(L('ยังไม่ได้ตั้งเส้นฐาน')); break; }
        vb.gShowBaseline = !vb.gShowBaseline;
        renderViewBody();
        refreshOpts();
        break;
      }
      case 'g-set-baseline': {
        var pbs = S.project(state.route.id);
        var blPid = state.route.id;
        var doBaseline = function () {
          S.setBaseline(blPid);
          viewFor(blPid).gShowBaseline = true;
          renderViewBody();
          refreshOpts();
          toast(L('ตั้งเส้นฐานแล้ว'), L('ย้อนกลับ'), 'undo');
        };
        if (pbs.baseline) {
          askConfirm(L('ตั้งเส้นฐานใหม่?'), L('แผนเดิมที่บันทึกไว้จะถูกทับ'), doBaseline,
            { ok: L('ตั้งใหม่') });
        } else doBaseline();
        break;
      }
      case 'g-clear-baseline':
        var cbPid = state.route.id;
        askConfirm(L('ลบเส้นฐานที่บันทึกไว้?'), '', function () {
          S.clearBaseline(cbPid);
          viewFor(cbPid).gShowBaseline = false;
          renderViewBody();
          refreshOpts();
          toast(L('ลบเส้นฐานแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ลบเส้นฐานนี้') });
        break;

      /* คำค้นเก็บอยู่ในมุมมอง ไม่ใช่ใน state ชั่วคราว
       * จึงติดไปกับมุมมองที่บันทึกไว้ และค้างอยู่ตอนสลับแท็บมุมมองด้วย
       * ซึ่งตรงกับที่คนคาด — ค้นแล้วสลับไปดูบอร์ด ก็ยังเห็นผลค้นชุดเดิม */
      case 'f-q-open': {
        var vq = viewFor(state.route.id);
        vq.q = ' ';            // ค่าที่ไม่ว่างเพื่อให้ช่องกางออก แล้วล้างทันทีตอนโฟกัส
        renderTopbar();
        var qi = document.getElementById('vQ');
        if (qi) { qi.value = ''; vq.q = ''; qi.focus(); }
        break;
      }
      case 'f-q-clear': {
        viewFor(state.route.id).q = '';
        renderAll();
        break;
      }
      case 'add-menu':
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, addMenu(id || state.route.id));
        break;
      case 'g-views-menu': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var pv = S.project(state.route.id);
        var vh = '';
        pv.savedViews.forEach(function (sv) {
          vh += '<button data-act="load-view" data-id="' + esc(sv.id) + '">' +
            esc(sv.icon || '📊') + ' ' + esc(sv.name) + '</button>';
        });
        openPop(el, vh);
        break;
      }
      case 'g-toggle-sec': {
        var gk = el.dataset.key;
        if (state.ganttCollapsed[gk]) delete state.ganttCollapsed[gk];
        else state.ganttCollapsed[gk] = true;
        renderViewBody();
        break;
      }
      case 'g-collapse-all': {
        var gp = S.project(state.route.id);
        gp.sections.forEach(function (x) { state.ganttCollapsed[x.id] = true; });
        renderViewBody();
        break;
      }
      case 'g-expand-all':
        state.ganttCollapsed = {};
        renderViewBody();
        break;
      case 'g-del-dep': {
        var gb = S.task(el.dataset.blocker), gt = S.task(id);
        if (!gb || !gt) break;
        var ddTid = id, ddBid = el.dataset.blocker;
        askConfirm(L('ลบลำดับก่อนหลังนี้?'), gb.name + ' → ' + gt.name, function () {
          S.removeDependency(ddTid, ddBid);
          toast(L('ลบลำดับแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ลบลำดับ') });
        break;
      }

      /* --- timeline --- */
      case 'tl-zoom':
        state.tlZoom = el.dataset.v;
        state.tlScrollLeft = null;      // เปลี่ยนซูมแล้วตำแหน่งเดิมไม่มีความหมาย
        renderViewBody();
        renderTopbar();
        break;
      case 'tl-today':
        state.tlScrollLeft = null;
        scrollTimelineToToday();
        break;

      /* --- calendar --- */
      case 'cal-prev': state.calOffset--; renderViewBody(); break;
      case 'cal-next': state.calOffset++; renderViewBody(); break;
      case 'cal-today': state.calOffset = 0; renderViewBody(); break;

      /* --- filters --- */
      case 'f-completed': {
        var v1 = viewFor(state.route.id);
        v1.showCompleted = !v1.showCompleted;
        refreshView();
        break;
      }
      case 'flt-clear': {
        var vfc = viewFor(state.route.id);
        vfc.filters = [];
        vfc.showCompleted = true;
        vfc.assignee = ''; vfc.priority = ''; vfc.tag = ''; vfc.due = 'any';
        refreshView();
        break;
      }
      case 'flt-add': {
        var vfa = viewFor(state.route.id);
        vfa.filters.push({ f: 'assignee', op: 'is', v: [] });
        refreshView();
        break;
      }
      case 'flt-del': {
        var vfd = viewFor(state.route.id);
        vfd.filters.splice(+el.dataset.i, 1);
        refreshView();
        break;
      }
      case 'flt-opt': {
        var vfo = viewFor(state.route.id);
        var fc = vfo.filters[+el.dataset.i];
        if (!fc) break;
        var fv = Array.isArray(fc.v) ? fc.v.slice() : [];
        var fat = fv.indexOf(el.dataset.v);
        if (fat >= 0) fv.splice(fat, 1); else fv.push(el.dataset.v);
        fc.v = fv;
        refreshView();
        break;
      }
      case 'flt-me': {
        /* ทางลัด "ผู้รับผิดชอบคือฉัน" — ค่าแบบไดนามิก ตีความตามคนที่เปิดดู */
        var vfm = viewFor(state.route.id);
        var had = vfm.filters.filter(function (c) { return isMeFilter(c); }).length;
        vfm.filters = vfm.filters.filter(function (c) { return !isMeFilter(c); });
        if (!had) vfm.filters.push({ f: 'assignee', op: 'is', v: [S.ME] });
        refreshView();
        break;
      }
      case 'flt-week': {
        var vfw = viewFor(state.route.id);
        var hadW = vfw.filters.some(function (c) { return c.f === 'due' && c.op === 'week'; });
        vfw.filters = vfw.filters.filter(function (c) { return !(c.f === 'due' && c.op === 'week'); });
        if (!hadW) vfw.filters.push({ f: 'due', op: 'week', v: null });
        refreshView();
        break;
      }
      case 'srt-add': {
        var vsa = viewFor(state.route.id);
        var used = vsa.sorts.map(function (s) { return s.k; });
        var nk = sortKeys(S.project(state.route.id)).filter(function (x) { return used.indexOf(x[0]) < 0; })[0];
        if (nk) S.setSorts(vsa, vsa.sorts.concat([{ k: nk[0], d: 'asc' }]));
        refreshView();
        break;
      }
      case 'srt-del': {
        var vsd = viewFor(state.route.id);
        var ls = vsd.sorts.slice();
        ls.splice(+el.dataset.i, 1);
        S.setSorts(vsd, ls);
        refreshView();
        break;
      }
      case 'srt-dir': {
        var vsr = viewFor(state.route.id);
        var lr = vsr.sorts.map(function (s) { return { k: s.k, d: s.d }; });
        var si = +el.dataset.i;
        if (lr[si]) lr[si].d = lr[si].d === 'desc' ? 'asc' : 'desc';
        S.setSorts(vsr, lr);
        refreshView();
        break;
      }
      case 'f-showempty': {
        var vse = viewFor(state.route.id);
        vse.showEmpty = !vse.showEmpty;
        refreshView();
        break;
      }
      case 'lcol-toggle': {
        var vlt = viewFor(state.route.id);
        var lcol = S.listColumns(state.route.id, vlt).filter(function (c) { return c.id === el.dataset.col; })[0];
        if (lcol) vlt.colShow[lcol.id] = !lcol.on;
        refreshView();
        var cmBtn = document.querySelector('[data-act="col-menu"]');
        if (document.querySelector('.pop .col-pop') && cmBtn) openPop(cmBtn, colMenu());
        break;
      }
      case 'lcol-move': {
        var vlm = viewFor(state.route.id);
        var order = S.listColumns(state.route.id, vlm).map(function (c) { return c.id; });
        var li = order.indexOf(el.dataset.col), lj = li + (+el.dataset.d);
        if (li < 0 || lj < 0 || lj >= order.length) break;
        order.splice(lj, 0, order.splice(li, 1)[0]);
        vlm.cols = order;
        refreshView();
        break;
      }
      case 'col-menu':
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, colMenu());
        break;
      case 'col-order':
        closePops();
        openOpts('lcols');
        break;
      case 'foot-menu': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var fcur = viewFor(state.route.id).foot[el.dataset.col] || 'sum';
        openPop(el, S.FOOT_FNS.map(function (x) {
          return '<button data-act="foot-set" data-col="' + esc(el.dataset.col) + '" data-fn="' + x[0] + '">' +
            popCheck(fcur === x[0]) + L(x[1]) + '</button>';
        }).join(''));
        break;
      }
      case 'foot-set':
        closePops();
        viewFor(state.route.id).foot[el.dataset.col] = el.dataset.fn;
        refreshView();
        break;
      case 'sec-collapse': {
        var vcol = viewFor(state.route.id);
        var ck2 = el.dataset.key;
        if (vcol.collapsed[ck2]) delete vcol.collapsed[ck2]; else vcol.collapsed[ck2] = true;
        refreshView();
        break;
      }
      case 'sec-collapse-all':
      case 'sec-expand-all': {
        closePops();
        var vca = viewFor(state.route.id);
        vca.collapsed = {};
        if (act === 'sec-collapse-all') {
          S.viewGroups(state.route.id, vca).forEach(function (g) { vca.collapsed[g.key || '_'] = true; });
        }
        refreshView();
        break;
      }
      case 'bcol-toggle': {
        var vbt = viewFor(state.route.id);
        var bk = el.dataset.key;
        if (vbt.bCollapsed[bk]) delete vbt.bCollapsed[bk]; else vbt.bCollapsed[bk] = true;
        closePops();
        refreshView();
        break;
      }
      case 'bcol-all': {
        var vba = viewFor(state.route.id);
        vba.bCollapsed = {};
        if (el.dataset.v === '1') {
          S.viewGroups(state.route.id, vba, { group: vba.bGroup }).forEach(function (g) { vba.bCollapsed[g.key || '_'] = true; });
        }
        closePops();
        refreshView();
        break;
      }
      case 'bcard': {
        var vbc = viewFor(state.route.id);
        vbc.bCard[el.dataset.k] = !S.cardShows(vbc, el.dataset.k);
        refreshView();
        break;
      }
      case 'bsize':
        viewFor(state.route.id).bSize = el.dataset.v;
        refreshView();
        break;
      case 'sub-toggle':
        e.stopPropagation();
        if (state.subOpen[id]) delete state.subOpen[id]; else state.subOpen[id] = true;
        renderViewBody();
        break;
      case 'cal-weekends': {
        var cws = calxScope(el) || (state.route.type === 'project' ? 'p:' + state.route.id : 'all');
        if (cws === 'all') S.setCalPrefs({ weekends: !S.calPrefs().weekends });
        else {
          var vcw = viewFor(state.route.id);
          vcw.cWeekends = vcw.cWeekends === false;
          refreshView();
        }
        break;
      }

      /* --- เมนูของกลุ่ม/คอลัมน์ (รายการและบอร์ด) --- */
      case 'sec-menu': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var smSec = el.dataset.section, smBoard = el.dataset.board === '1';
        var canSt = S.can('structure') && S.canInProject(state.route.id, 'edit');
        var smh = '';
        if (smBoard) {
          smh += '<button data-act="bcol-toggle" data-key="' + esc(el.dataset.key) + '">' + I('shrink', 14) + ' ' +
            L('ย่อคอลัมน์นี้') + '</button>' +
            '<button data-act="bcol-all" data-v="1">' + I('shrink', 14) + ' ' + L('ย่อทุกคอลัมน์') + '</button>' +
            '<button data-act="bcol-all" data-v="0">' + I('expand', 14) + ' ' + L('ขยายทุกคอลัมน์') + '</button>';
        } else {
          smh += '<button data-act="sec-collapse-all">' + I('shrink', 14) + ' ' + L('ย่อทุกกลุ่ม') + '</button>' +
            '<button data-act="sec-expand-all">' + I('expand', 14) + ' ' + L('ขยายทุกกลุ่ม') + '</button>';
        }
        if (smSec && canSt) {
          smh += '<div class="pop-sep"></div>' +
            '<button data-act="rename-section" data-section="' + esc(smSec) + '">' + I('pencil', 14) + ' ' + L('เปลี่ยนชื่อ') + '</button>' +
            '<button data-act="dup-section" data-section="' + esc(smSec) + '">' + I('copy', 14) + ' ' + L('ทำสำเนาเซกชัน…') + '</button>' +
            '<button data-act="delete-section" data-section="' + esc(smSec) + '">' + I('trash', 14) + ' ' + L('ลบคอลัมน์') + '</button>';
        }
        if (smSec && S.can('write') && S.canInProject(state.route.id, 'edit')) {
          smh += '<div class="pop-sep"></div><button data-act="tt-pick" data-section="' + esc(smSec) + '">' + I('star', 14) + ' ' +
            L('เพิ่มงานจากเทมเพลต…') + '</button>' +
            '<button data-act="carry-over" data-section="' + esc(smSec) + '">' + I('arrowRight', 14) + ' ' + L('ยกงานค้างไปเซกชัน…') + '</button>';
        }
        openPop(el, smh);
        break;
      }
      /* Sprint 3 — เลื่อนงานที่เลยกำหนดไปวันเดียวกันรวดเดียว นับจำนวนครั้งที่เลื่อนต่องาน */
      case 'slip-overdue': {
        closePops();
        var spPid = state.route.id, spT = S.today();
        var spN = S.tasksInProject(spPid).filter(function (x) { return !x.task.completed && x.task.dueOn && x.task.dueOn < spT; }).length;
        if (!spN) { toast(L('ไม่มีงานที่เลยกำหนด')); break; }
        var spDow = new Date(spT + 'T00:00:00').getDay();
        var spMon = S.addDays(spT, ((8 - spDow) % 7) || 7);              // วันจันทร์ถัดไป
        askChoice(L('เลื่อนงานเลยกำหนดไปวันไหน'), L('{n} งานที่เลยกำหนดจะถูกเลื่อน และนับว่าเลื่อนแล้วหนึ่งครั้ง', { n: spN }), [
          [L('พรุ่งนี้'), S.addDays(spT, 1)], [L('วันจันทร์หน้า'), spMon], [L('อีก 7 วัน'), S.addDays(spT, 7)]
        ].map(function (o) {
          return { label: o[0] + (R.fmtDate(o[1]) !== o[0] ? ' · ' + R.fmtDate(o[1]) : ''), run: function () {
            var moved = S.slipOverdue(spPid, o[1]);
            if (moved) toast(L('เลื่อน {n} งานแล้ว', { n: moved }), L('ย้อนกลับ'), 'undo');
          } };
        }));
        break;
      }
      /* Sprint 3 — ยกงานค้าง: ย้ายงานที่ยังไม่เสร็จในเซกชันนี้ไปเซกชันอื่นรวดเดียว (เช่น ประชุมครั้งก่อน → ครั้งนี้)
       * ย้อนกลับได้ในครั้งเดียว ใช้ตัวเดียวกับย้ายหลายงาน (bulkMoveSection) */
      case 'carry-over': {
        closePops();
        var coPid = state.route.id, coFrom = sectionId, coP = S.project(coPid);
        var coOpen = S.tasksInSection(coPid, coFrom).filter(function (x) { return !x.task.completed; })
          .map(function (x) { return x.task.id; });
        if (!coP) break;
        if (!coOpen.length) { toast(L('เซกชันนี้ไม่มีงานค้าง')); break; }
        askChoice(L('ยกงานค้างไปเซกชันไหน'), L('{n} งานที่ยังไม่เสร็จจะถูกย้ายไป', { n: coOpen.length }),
          coP.sections.filter(function (x) { return x.id !== coFrom; }).map(function (x) {
            return { label: x.name, run: function () {
              var moved = S.bulkMoveSection(coOpen, coPid, x.id);
              if (moved) toast(L('ย้าย {n} งานไป “{s}” แล้ว', { n: moved, s: x.name }), L('ย้อนกลับ'), 'undo');
            } };
          }));
        break;
      }
      case 'dup-section':
        closePops();
        openModal(dupSectionModal(state.route.id, sectionId));
        break;
      case 'do-dup-section': {
        var dsKeep = {};
        Array.prototype.forEach.call(document.querySelectorAll('.dsec-opt'), function (cb) { dsKeep[cb.dataset.k] = cb.checked; });
        var dsTo = (document.getElementById('dsecProject') || {}).value || state.route.id;
        var dsName = ((document.getElementById('dsecName') || {}).value || '').trim();
        if (dsTo !== state.route.id && !S.canInProject(dsTo, 'edit')) { denyToast(); break; }
        closeModal();
        var dres = S.duplicateSection(state.route.id, sectionId, { toProject: dsTo, name: dsName, keep: dsKeep });
        if (dres) {
          toast(dres.projectId === state.route.id
            ? L('ทำสำเนาเซกชันแล้ว ({n} งาน)', { n: dres.n })
            : L('ทำสำเนาไปที่ “{p}” แล้ว ({n} งาน)', { p: S.project(dres.projectId).name, n: dres.n }),
            L('ย้อนกลับ'), 'undo');
        }
        break;
      }

      /* --- แท็บมุมมองที่บันทึกไว้ --- */
      case 'open-sv': {
        closePops();
        var osv = S.savedView(state.route.id, id);
        if (!osv) break;
        state.route = { type: 'project', id: state.route.id, view: osv.kind || 'list', sv: osv.id };
        state.tlScrollLeft = null;
        state.ganttScroll = null;
        clearSel();
        renderAll();
        break;
      }
      case 'tab-menu': {
        e.stopPropagation();
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, tabMenu(state.route.id, id || null, el.dataset.view || null));
        break;
      }
      case 'tab-default': {
        closePops();
        S.setDefaultTab(state.route.id, el.dataset.tab);
        toast(L('ตั้งเป็นมุมมองเริ่มต้นของโปรเจกต์แล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'sv-rename': {
        closePops();
        var rsv = S.savedView(state.route.id, id);
        if (!rsv) break;
        var rPid = state.route.id, rId = id;
        askText(L('เปลี่ยนชื่อแท็บ'), rsv.name, function (nv) {
          if (nv) S.renameSavedView(rPid, rId, nv);
        });
        break;
      }
      case 'sv-move':
        closePops();
        S.moveSavedView(state.route.id, id, +el.dataset.d);
        break;
      case 'sv-update': {
        closePops();
        var usv = S.savedView(state.route.id, id);
        if (!usv || !state.svWork[id]) break;
        S.updateSavedView(state.route.id, id, state.svWork[id]);
        delete state.svWork[id];
        toast(L('บันทึกแท็บ “{n}” แล้ว ทุกคนจะเห็นแบบนี้', { n: usv.name }), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'sv-discard':
        closePops();
        delete state.svWork[id];
        refreshView();
        break;
      case 'sv-delete': {
        closePops();
        var dsv = S.savedView(state.route.id, id);
        if (!dsv) break;
        var dPid = state.route.id, dId = id;
        askConfirm(L('ลบแท็บ “{n}”?', { n: dsv.name }), L('ทุกคนในโปรเจกต์จะไม่เห็นแท็บนี้อีก งานไม่ได้ถูกลบ'), function () {
          S.deleteSavedView(dPid, dId);
          delete state.svWork[dId];
          if (state.route.sv === dId) { delete state.route.sv; state.route.view = dsv.kind || 'list'; }
          renderAll();
          toast(L('ลบแท็บแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ลบแท็บ') });
        break;
      }
      case 'reset-view':
        if (state.route.sv) delete state.svWork[state.route.sv];
        else state.views[state.route.id] = S.defaultView();
        refreshView();
        break;
      case 'save-view': {
        /* บันทึกเป็นแท็บใหม่ของโปรเจกต์ ใช้ชื่อในแผงตัวเลือกถ้าเปิดอยู่ ไม่งั้นถาม */
        var svPid = state.route.id, svKind = state.route.view;
        var p0 = S.project(svPid);
        if (p0.savedViews.length >= S.SV_MAX) { toast(L('มีแท็บครบ {n} แท็บแล้ว ลบแท็บเก่าก่อน', { n: S.SV_MAX })); break; }
        var panelOpen = optOpen();
        var iEl = panelOpen ? document.getElementById('gvName') : null;
        var icEl = panelOpen ? document.getElementById('gvIcon') : null;
        var ic = (icEl && icEl.value.trim()) || state.viewIcon || '📊';
        var doSave = function (nm) {
          var sv = S.saveView(svPid, nm, viewFor(svPid), ic, svKind);
          if (!sv) { toast(L('บันทึกไม่ได้')); return; }
          state.viewIcon = ic;
          state.route = { type: 'project', id: svPid, view: sv.kind, sv: sv.id };
          delete state.svWork[sv.id];
          closeOpts();
          renderAll();
          toast(L('บันทึกเป็นแท็บ “{n}” แล้ว', { n: sv.name }), L('ย้อนกลับ'), 'undo');
        };
        var nm0 = iEl ? iEl.value.trim() : '';
        if (nm0) doSave(nm0);
        else askText(L('ตั้งชื่อแท็บใหม่'), '', function (v) {
          if (!v) { toast(L('ยังไม่ได้ตั้งชื่อมุมมอง')); return; }
          doSave(v);
        });
        break;
      }
      case 'load-view':
      case 'delete-view':
        /* ปุ่มรุ่นเก่า — ตอนนี้แท็บที่บันทึกไว้เปิดจากแถบแท็บ */
        closePops();
        if (act === 'load-view' && S.savedView(state.route.id, id)) {
          state.route = { type: 'project', id: state.route.id, view: S.savedView(state.route.id, id).kind, sv: id };
          renderAll();
        }
        break;

      /* --- รูปปกของการ์ด --- */
      case 'set-cover':
      case 'clear-cover':
        if (S.setCover(id, act === 'set-cover' ? el.dataset.att : null)) {
          toast(act === 'set-cover' ? L('ตั้งเป็นรูปปกแล้ว') : L('เอารูปปกออกแล้ว'), L('ย้อนกลับ'), 'undo');
        }
        break;

      /* --- ไทม์ไลน์: คลิกแถวว่างที่วันไหนก็สร้างงานวันนั้น --- */
      case 'tl-new': {
        var grid = el.closest('.tl-grid');
        if (!grid) break;
        var gx = e.clientX - grid.getBoundingClientRect().left;
        var tday = S.addDays(grid.dataset.from, Math.max(0, Math.floor(gx / (+grid.dataset.w || 28))));
        var tnPid = state.route.id;
        var tnSec = S.project(tnPid).sections[0].id;
        askText(L('งานใหม่ วันที่ {d}', { d: R.fmtDate(tday) }), '', function (v) {
          if (!v) return;
          var nt = S.createTask({ name: v, startOn: tday, dueOn: tday }, tnPid, tnSec);
          if (nt) toast(L('สร้างงานแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('เพิ่มงาน') });
        break;
      }

      /* --- task basics --- */
      case 'toggle': toggleDone(id); break;
      case 'open-task': {
        /* Shift+คลิก = เลือกช่วงจากแถวที่เลือกล่าสุด  Ctrl/⌘+คลิก = เลือกทีละแถว (ไม่เปิดแผงงาน) */
        var rowEl = el.closest('.tr, .card, .row');
        if (rowEl && (e.shiftKey || e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (e.shiftKey && state.selAnchor) selectRange(state.selAnchor, id);
          else {
            if (state.sel[id]) delete state.sel[id]; else state.sel[id] = true;
            state.selAnchor = id;
            updateSelectionUI(id);
          }
          setCursor(id);
          break;
        }
        if (rowEl) { state.selAnchor = id; setCursor(id); }
        openTask(id);
        break;
      }
      case 'close-drawer': closeDrawer(); break;
      case 'select-task':
        e.stopPropagation();
        if (e.shiftKey && state.selAnchor && state.selAnchor !== id) { selectRange(state.selAnchor, id); break; }
        if (state.sel[id]) delete state.sel[id];
        else state.sel[id] = true;
        state.selAnchor = id;
        setCursor(id);
        updateSelectionUI(id);
        break;
      case 'task-menu': openModal(taskMenuModal(id)); break;
      case 'go-trash':
        closeModal();
        state.route = { type: 'trash' };
        clearSel();
        renderAll();
        break;
      case 'dup-task': openModal(dupModal(id)); break;
      case 'do-dup': {
        var dopt = { name: (document.getElementById('dupName') || {}).value };
        if (!dopt.name || !dopt.name.trim()) { toast(L('ใส่ชื่องานก่อน')); break; }
        dopt.name = dopt.name.trim();
        Array.prototype.forEach.call(document.querySelectorAll('.dup-opt'), function (cb) {
          dopt[cb.dataset.k] = cb.checked;
        });
        closeModal();
        var c = S.duplicateTask(id, dopt);
        if (c) { openTask(c.id); toast(L('คัดลอกงานแล้ว'), L('ย้อนกลับ'), 'undo'); }   // Sprint 1B — ถูกปฏิเสธ = ไม่บอกว่าสำเร็จ
        break;
      }
      case 'followup': openModal(followUpModal(id)); break;
      case 'do-followup': {
        var fuName = ((document.getElementById('fuName') || {}).value || '').trim();
        var fuDue = (document.getElementById('fuDue') || {}).value || null;
        closeModal();
        var fu = S.createFollowUp(id, fuName, fuDue);
        if (fu) { openTask(fu.id); toast(L('สร้างงานติดตามผลแล้ว'), L('ย้อนกลับ'), 'undo'); }
        break;
      }
      case 'merge-task': openModal(taskPickModal(id, 'merge')); break;
      case 'make-subtask': openModal(taskPickModal(id, 'parent')); break;
      case 'do-merge': {
        var mt = el.dataset.target;
        closeModal();
        if (S.mergeDuplicate(id, mt)) {
          openTask(mt);
          toast(L('รวมงานซ้ำแล้ว'), L('ย้อนกลับ'), 'undo');
        } else if (!justDenied()) toast(L('รวมไม่ได้ — งานนี้เป็นงานย่อยของงานที่เลือก'));
        break;
      }
      case 'do-make-subtask': {
        var pt = el.dataset.target;
        closeModal();
        if (S.setParent(id, pt)) {
          renderAll();
          toast(L('ย้ายเป็นงานย่อยแล้ว'), L('ย้อนกลับ'), 'undo');
        } else if (!justDenied()) toast(L('ย้ายไม่ได้ — งานที่เลือกเป็นงานย่อยของงานนี้อยู่แล้ว'));
        break;
      }
      case 'promote-task':
        closeModal();
        if (S.promoteSubtask(id)) {
          renderAll();
          toast(L('ย้ายออกเป็นงานหลักแล้ว'), L('ย้อนกลับ'), 'undo');
        }
        break;
      case 'stop-recur':
        closeModal();
        S.updateTask(id, { recur: null });
        toast(L('หยุดทำซ้ำแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      case 'recur-day': {
        var rt0 = S.task(state.openTaskId);
        if (!rt0 || !rt0.recur) break;
        var rd = (rt0.recur.days || []).slice(), dnum = +el.dataset.d;
        var at0 = rd.indexOf(dnum);
        if (at0 >= 0) rd.splice(at0, 1); else rd.push(dnum);
        rd.sort();
        var rdp = { recur: { freq: 'weekly', interval: rt0.recur.interval || 1, days: rd } };
        if (!rt0.dueOn) rdp.dueOn = S.firstRecurDate(rdp.recur, rt0.startOn);     // Sprint 1C — รอบแรกขึ้นปฏิทิน
        S.updateTask(rt0.id, rdp);
        break;
      }
      case 'fit-parent-dates':
        if (S.fitParentDates(id)) toast(L('ขยายวันของงานนี้ให้ครอบงานย่อยแล้ว'), L('ย้อนกลับ'), 'undo');
        else toast(L('วันของงานนี้ครอบงานย่อยอยู่แล้ว'));
        break;
      case 'sub-mine':
        state.subView.mine = !state.subView.mine;
        renderDrawer();
        break;
      case 'sub-hide-done':
        state.subView.hideDone = !state.subView.hideDone;
        renderDrawer();
        break;
      case 'assign-copies':
        closePops();
        openModal(assignCopiesModal(id));
        break;
      case 'do-assign-copies': {
        var who = Array.prototype.map.call(
          document.querySelectorAll('.ac-user:checked'), function (cb) { return cb.value; });
        if (!who.length) { toast(L('เลือกอย่างน้อยหนึ่งคน')); break; }
        closeModal();
        var acId = id;
        /* Sprint 1B — สำเนาอยู่โปรเจกต์เดียวกับต้นฉบับ มอบให้คนนอกโปรเจกต์ปิด = ให้เขาเห็นงาน ถามก่อน */
        confirmReveal(acId, who, function () {
          var made = S.assignCopies(acId, who);
          if (made.length || !justDenied()) toast(L('มอบหมายแล้ว สร้างสำเนา {n} งาน', { n: made.length }), L('ย้อนกลับ'), 'undo');
        });
        break;
      }
      case 'trash-restore': {
        var rs = S.restoreTrash(id);
        if (!rs.ok) { toast(L(rs.reason)); break; }
        toast(L('กู้คืนแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'trash-purge': {
        var tpId = id;
        askConfirm(L('ลบถาวร?'), L('กู้คืนจากถังขยะไม่ได้อีก (ยังกด Ctrl+Z ได้ก่อนรีเฟรชหน้า)'), function () {
          if (S.purgeTrash(tpId)) toast(L('ลบถาวรแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ลบถาวร') });
        break;
      }
      case 'field-format':
        closePops();
        openModal(fieldFormatModal(state.route.id, el.dataset.field));
        break;
      case 'do-field-format':
        S.setFieldFormat(projectId, el.dataset.field, readNumberFormat());
        closeModal();
        toast(L('ตั้งรูปแบบตัวเลขแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      case 'copy-link': {
        var base = global.location.href.split('#')[0];
        copyText(base + '#/task/' + id, L('คัดลอกลิงก์แล้ว'));
        closeModal();
        break;
      }
      case 'save-template': openModal(ttSaveModal(id)); break;
      case 'delete-task': {
        var tk2 = S.task(id);
        if (!tk2) break;
        /* ถามยืนยันตามที่ผู้ใช้ตั้งไว้ ปิดได้เพราะลบงานย้อนกลับได้ด้วย Ctrl+Z อยู่แล้ว
         * ใช้หน้าต่างของแอปเอง confirm() ของเบราว์เซอร์ถูกบล็อกเงียบในหน้าที่ถูก sandbox */
        var delId = id;
        var doDelete = function () {
          if (state.openTaskId === delId) state.openTaskId = null;
          closeModal();
          S.deleteTask(delId);
          toast(L('ย้ายงานไปถังขยะแล้ว'), L('ย้อนกลับ'), 'undo');
        };
        if (S.pref('confirmDelete')) {
          askConfirm(L('ลบงาน “{t}” ?', { t: tk2.name }),
            L('งานจะไปอยู่ในถังขยะ {n} วัน กู้คืนได้จากถังขยะ หรือกด “ย้อนกลับ” / Ctrl+Z ทันที',
            { n: S.TRASH_DAYS }), doDelete, { ok: L('ลบ') });
        } else doDelete();
        break;
      }
      case 'ask-ok': {
        var fn = pendingAsk;
        var val = (document.getElementById('askInput') || {}).value;
        pendingAsk = null;
        closeModal();
        if (fn) fn(val == null ? null : String(val).trim());
        break;
      }
      case 'ask-choice': {
        var cf = askChoiceFns[+el.dataset.i];
        askChoiceFns = [];
        askBack = null;                 // เลือกทางแล้ว ไม่ใช่การยกเลิก ไม่ต้องกลับหน้าต่างเดิม
        closeModal();
        if (cf) cf();
        break;
      }

      case 'quick-add': {
        var qp = S.project(state.route.id);
        if (!qp) break;
        askText(L('ชื่องานใหม่'), '', function (v) {
          if (!v) return;
          var nt = S.createTask({ name: v }, qp.id, qp.sections[0].id);
          if (nt) openTask(nt.id);          // Sprint 1B — ถูกด่านสร้างงานปฏิเสธ = null (ขึ้นข้อความแล้ว)
        }, { ok: L('เพิ่มงาน'), pasteCtx: { projectId: qp.id, sectionId: qp.sections[0].id },
             note: L('วางข้อความหลายบรรทัดเพื่อสร้างหลายงานพร้อมกัน') });
        break;
      }
      case 'inline-add': inlineAdd(el, sectionId); break;
      case 'add-subtask': {
        var parentId = id;
        askText(L('ชื่องานย่อย'), '', function (v) {
          if (!v) return;
          S.createTask({ name: v, parentId: parentId }, null, null);
          renderAll();
        });
        break;
      }

      /* --- pickers --- */
      case 'pick-assignee': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var ph = peopleFilterHtml() + '<button data-act="set-assignee" data-id="' + R.esc(state.openTaskId) +
          '" data-user="">' + R.avatar(null) + ' ' + L('ยังไม่มอบหมาย') + '</button>';
        S.db.users.forEach(function (u) {
          ph += '<button data-act="set-assignee" data-id="' + R.esc(state.openTaskId) +
            '" data-user="' + R.esc(u.id) + '">' + R.avatar(u) + ' ' + R.esc(u.name) + '</button>';
        });
        /* งานเดียวกันที่ทุกคนต้องทำคนละชิ้น เช่น "ส่งรายงานประจำเดือน" — Asana เรียกว่ามอบสำเนา */
        ph += '<div class="pop-sep"></div><button data-act="assign-copies" data-id="' +
          R.esc(state.openTaskId) + '">' + I('users', 15) + ' ' + L('มอบสำเนาให้หลายคน…') + '</button>';
        openPop(el, ph);
        focusPopFilter();
        break;
      }
      case 'set-assignee': {
        closePops();
        var saId = id, saU = el.dataset.user || null;
        confirmReveal(saId, [saU], function () { S.updateTask(saId, { assigneeId: saU }); });   // Sprint 1B
        break;
      }
      case 'pick-priority': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var qh = '';
        S.PRIORITIES.forEach(function (p) {
          qh += '<button data-act="set-priority" data-id="' + R.esc(state.openTaskId) +
            '" data-p="' + p.id + '"><span style="width:9px;height:9px;border-radius:50%;background:' +
            p.color + ';display:inline-block"></span> ' + p.label + '</button>';
        });
        openPop(el, qh);
        break;
      }
      case 'set-priority':
        closePops();
        S.updateTask(id, { priority: el.dataset.p });
        break;
      case 'set-approval': {
        /* Sprint 1B — กดได้เฉพาะผู้อนุมัติ (ผู้รับผิดชอบ) ปฏิเสธต้องถามก่อน เพราะงานปิดทันทีและแจ้งคนขอ */
        var apT = S.task(id);
        if (!apT) break;
        if (!S.canApprove(id)) {
          var apU = S.user(apT.assigneeId);
          toast(apU ? L('เฉพาะผู้อนุมัติ ({who}) ที่ตัดสินงานนี้ได้', { who: apU.name })
                    : L('เลือกผู้อนุมัติก่อน แล้วผู้อนุมัติจึงตัดสินได้'));
          break;
        }
        var apV = el.dataset.v, apId = id;
        if (apV === 'rejected') {
          askConfirm(L('ปฏิเสธ “{t}”?', { t: apT.name }),
            L('งานจะถูกปิดเป็น “ไม่อนุมัติ” และแจ้งคนขอทันที ถ้าแค่อยากให้แก้บางจุด ใช้ “ขอแก้ไข” แทน'),
            function () { S.updateTask(apId, { approval: 'rejected' }); }, { ok: L('ปฏิเสธ') });
          break;
        }
        S.updateTask(id, { approval: apV });
        break;
      }
      case 'approval-resubmit':
        if (S.resubmitApproval(id)) toast(L('ส่งขออนุมัติอีกครั้งแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      case 'pick-follower': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var fh = peopleFilterHtml();
        S.db.users.forEach(function (u) {
          fh += '<button data-act="do-follow" data-id="' + R.esc(id) + '" data-user="' +
            R.esc(u.id) + '">' + R.avatar(u) + ' ' + R.esc(u.name) + '</button>';
        });
        openPop(el, fh);
        break;
      }
      case 'do-follow': {
        closePops();
        var dfT = S.task(id), dfU = el.dataset.user, dfId = id;
        /* Sprint 1B — เพิ่มผู้ติดตาม = ให้เห็นงาน ถามก่อนถ้าเป็นคนนอกโปรเจกต์ (เอาออกไม่ต้องถาม) */
        if (dfT && dfT.followers.indexOf(dfU) < 0) {
          confirmReveal(dfId, [dfU], function () { S.toggleFollower(dfId, dfU); });
        } else S.toggleFollower(id, dfU);
        break;
      }
      case 'remove-follower': S.toggleFollower(id, el.dataset.user); break;
      case 'toggle-follow': S.toggleFollower(id, S.db.currentUserId); break;
      case 'toggle-like': S.toggleLike(id); break;

      /* --- dependencies --- */
      case 'add-dependency': openModal(dependencyModal(id)); break;
      case 'do-add-dependency':
        if (S.addDependency(id, el.dataset.blocker)) {
          closeModal();
          toast(L('เพิ่มลำดับก่อนหลังแล้ว'));
        } else {
          toast(L('เพิ่มไม่ได้ — จะทำให้เกิดการรอวนกัน'));
        }
        break;
      case 'remove-dependency': S.removeDependency(id, el.dataset.blocker); break;

      /* --- attachments --- */
      case 'add-attachment': openModal(attachmentModal(id)); break;
      case 'pick-file': {
        var fi2 = document.getElementById('atFile');
        if (fi2) fi2.click();
        break;
      }
      case 'remove-attachment': S.removeAttachment(id, el.dataset.att); break;

      /* --- tags --- */
      /* ---- แท็ก ----
       *
       * เดิมเป็นกล่อง prompt ของเบราว์เซอร์ ต้องพิมพ์ชื่อใหม่ทุกครั้ง
       * สะกดต่างกันนิดเดียวก็กลายเป็นคนละแท็ก แล้วกรองไม่เจอ
       * เปลี่ยนเป็นเมนูที่เห็นแท็กที่มีอยู่แล้วทั้งหมด เลือกจากของเดิมได้เลย
       * และพิมพ์สร้างใหม่ได้ในช่องเดียวกันถ้ายังไม่มี */
      case 'add-tag':
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, tagMenu(id, ''));
        var tqi = document.getElementById('tagQ');
        if (tqi) tqi.focus();
        break;
      /* ตั้งวันของงานย่อยจากแถวนั้นเลย ไม่ต้องเปิดเข้าไปในงานย่อย
       * เปิดทั้งวันเริ่มและกำหนดส่งพร้อมกัน เพราะคนตั้งสองอย่างนี้พร้อมกันเสมอ */
      case 'sub-dates': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var sd = S.task(id);
        if (!sd) break;
        openPop(el,
          '<div class="subdate">' +
          '<label>' + L('วันเริ่ม') + '</label>' +
          '<input type="date" data-act="sub-start" data-id="' + R.esc(id) +
          '" value="' + R.esc(sd.startOn || '') + '">' +
          '<label>' + L('กำหนดส่ง') + '</label>' +
          '<input type="date" data-act="sub-due" data-id="' + R.esc(id) +
          '" value="' + R.esc(sd.dueOn || '') + '">' +
          (sd.startOn || sd.dueOn
            ? '<button class="as-link danger" data-act="sub-clear-dates" data-id="' +
              R.esc(id) + '">' + L('ล้างวันทั้งสอง') + '</button>'
            : '') +
          '</div>');
        break;
      }
      case 'sub-clear-dates':
        S.updateTask(id, { startOn: null, dueOn: null });
        closePops();
        renderAll();
        break;
      case 'sub-assign': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var ah = '<button data-act="set-sub-assignee" data-id="' + R.esc(id) +
          '" data-user="">' + R.avatar(null) + ' ' + L('ยังไม่มอบหมาย') + '</button>';
        S.db.users.forEach(function (u) {
          ah += '<button data-act="set-sub-assignee" data-id="' + R.esc(id) +
            '" data-user="' + R.esc(u.id) + '">' + R.avatar(u, 'sm') + ' ' +
            R.esc(u.name) + '</button>';
        });
        openPop(el, ah);
        break;
      }
      case 'set-sub-assignee': {
        closePops();
        var ssaId = id, ssaU = el.dataset.user || null;
        confirmReveal(ssaId, [ssaU], function () {       // Sprint 1B
          S.updateTask(ssaId, { assigneeId: ssaU });
          renderAll();
        });
        break;
      }

      case 'pick-tag': {
        var pt = S.task(id);
        var nt = (el.dataset.tag || '').trim();
        if (pt && nt && pt.tags.indexOf(nt) < 0) {
          S.updateTask(id, { tags: pt.tags.concat([nt]) });
        }
        closePops();
        break;
      }
      case 'remove-tag': {
        var t3 = S.task(id);
        S.updateTask(id, {
          tags: t3.tags.filter(function (x) { return x !== el.dataset.tag; })
        });
        break;
      }

      /* --- multi-homing --- */
      case 'add-home': openModal(addHomeModal(id)); break;
      case 'do-add-home': {
        closeModal();
        var ahId = id, ahP = projectId;
        /* ผู้รับผิดชอบ/ผู้ติดตามที่ไม่ได้เป็นสมาชิกโปรเจกต์ปลายทาง (ปิด) — ถามก่อนเพิ่ม (confirmJoin) */
        confirmJoin(ahP, [ahId], function () {
          /* Sprint 1B — ด่านสร้างงานของโปรเจกต์ปลายทางอาจปฏิเสธ (ขึ้นเหตุผลเองแล้ว) อย่าบอกว่าสำเร็จ */
          var ok = S.addTaskToProject(ahId, ahP, null);
          if (ok) toast(L('เพิ่มเข้าโปรเจกต์แล้ว'), L('ย้อนกลับ'), 'undo');
          return !!ok;
        });
        break;
      }
      case 'unhome':
        if (!S.removeTaskFromProject(id, projectId)) toast(L('งานต้องอยู่อย่างน้อย 1 โปรเจกต์'));
        break;

      case 'toggle-star': {
        var onNow = S.toggleStar(id);
        renderAll();
        toast(onNow ? L('ปักหมุดไว้บนสุดแล้ว') : L('เอาหมุดออกแล้ว'));
        break;
      }

      case 'dw-more-fields':
        state.dwMore = !state.dwMore;
        renderDrawer();
        break;

      case 'toggle-wide':
        state.dwWide = !state.dwWide;
        renderDrawer();
        break;

      case 'clear-sort': {
        var vs = viewFor(state.route.id);
        vs.sort = 'manual';
        vs.sortDir = 'asc';
        renderAll();
        refreshOpts();
        break;
      }

      case 'delete-message':
        if (S.deleteProjectMessage(id, el.dataset.msg)) {
          renderAll();
          toast(L('ลบประกาศแล้ว'), L('ย้อนกลับ'), 'undo');
        }
        break;

      case 'react':
        S.toggleReaction(el.dataset.story, el.dataset.emoji);
        closePops();
        renderDrawer();
        break;
      case 'react-menu': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var sid = el.dataset.story;
        var rh = '<div class="rx-pick">';
        S.REACTIONS.forEach(function (em) {
          rh += '<button data-act="react" data-story="' + R.esc(sid) +
            '" data-emoji="' + R.esc(em) + '">' + em + '</button>';
        });
        openPop(el, rh + '</div>');
        break;
      }

      case 'dw-act-tab':
        state.actTab = el.dataset.tab === 'all' ? 'all' : 'comments';
        state.actAll = false;          // เปลี่ยนแท็บแล้วเริ่มนับใหม่ว่าจะกางของเก่าไหม
        renderDrawer();
        break;
      case 'dw-act-sort':
        state.actSort = state.actSort === 'newest' ? 'oldest' : 'newest';
        renderDrawer();
        break;
      case 'dw-act-more':
        state.actAll = true;
        renderDrawer();
        break;

      /* --- comment --- */
      case 'send-comment': {
        var box = document.getElementById('commentInput');
        if (box) submitComposer(box);
        break;
      }
      case 'send-reply': {
        var rbox = $drawer.querySelector('.rte[data-key="r:' + el.dataset.story + '"]');
        if (rbox) submitComposer(rbox);
        break;
      }
      case 'comment-save': {
        var ebox = $drawer.querySelector('.rte[data-key="e:' + el.dataset.story + '"]');
        if (ebox) submitComposer(ebox);
        break;
      }
      case 'comment-cancel':
        setDraft('e:' + el.dataset.story, '');
        state.editStory = null;
        renderDrawer();
        break;
      case 'comment-menu': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var cs = S.story(el.dataset.story);
        if (!cs) break;
        var mineC = cs.actorId === S.db.currentUserId;
        var mh = '';
        /* ปักหมุดอยู่ระดับแสดงความเห็นได้ (NEEDS) — คนดูอย่างเดียวเห็นแค่คัดลอกลิงก์ ไม่ต้องเห็นปุ่มที่กดแล้วโดนปฏิเสธ */
        if (!cs.parentId && S.can('comment', cs.taskId)) {
          mh += '<button data-act="comment-pin" data-story="' + R.esc(cs.id) + '">' + I('flag', 14) +
            (cs.pinned ? L('เลิกปักหมุด') : L('ปักหมุดไว้บนสุด')) + '</button>';
        }
        mh += '<button data-act="comment-link" data-story="' + R.esc(cs.id) + '">' + I('link', 14) +
          L('คัดลอกลิงก์ความเห็น') + '</button>';
        if (mineC) {
          mh += '<button data-act="comment-edit" data-story="' + R.esc(cs.id) + '">' + I('pencil', 14) +
            L('แก้ไขความเห็น') + '</button>' +
            '<button class="danger" data-act="comment-delete" data-story="' + R.esc(cs.id) + '">' +
            I('trash', 14) + L('ลบความเห็น') + '</button>';
        }
        openPop(el, mh);
        break;
      }
      case 'comment-pin': {
        closePops();
        var pinnedNow = S.togglePinComment(el.dataset.story);
        if (pinnedNow !== null) {
          toast(pinnedNow ? L('ปักหมุดความเห็นแล้ว') : L('เลิกปักหมุดแล้ว'), L('ย้อนกลับ'), 'undo');
        }
        break;
      }
      case 'comment-link': {
        closePops();
        var ls = S.story(el.dataset.story);
        if (!ls) break;
        copyText(global.location.href.split('#')[0] + '#/task/' + ls.taskId + '/c_' + ls.id,
          L('คัดลอกลิงก์ความเห็นแล้ว'));
        break;
      }
      case 'comment-edit': {
        closePops();
        var es = S.story(el.dataset.story);
        if (!es || es.actorId !== S.db.currentUserId) break;
        state.editStory = es.id;
        renderDrawer();
        global.RichText.focusEnd($drawer.querySelector('.rte[data-key="e:' + es.id + '"]'));
        break;
      }
      case 'comment-delete': {
        closePops();
        var dsid = el.dataset.story;
        var ds = S.story(dsid);
        if (!ds || ds.actorId !== S.db.currentUserId) break;
        /* Sprint 1B — ความเห็นที่ลบไปอยู่ในถังขยะ 30 วัน บอกไว้ตั้งแต่ตอนถาม จะได้ไม่ลังเลว่าหายถาวรไหม */
        askConfirm(L('ลบความเห็นนี้?'),
          (S.repliesOf(dsid).length ? L('ยังมีคนตอบอยู่ใต้ความเห็นนี้ คำตอบจะยังอยู่ และจะขึ้นว่า “ความเห็นนี้ถูกลบแล้ว” แทน') + ' ' : '') +
          L('ความเห็นจะไปอยู่ในถังขยะ {n} วัน กู้คืนได้', { n: S.TRASH_DAYS }),
          function () {
            if (state.editStory === dsid) state.editStory = null;
            if (S.deleteComment(dsid)) toast(L('ย้ายความเห็นไปถังขยะแล้ว'), L('ย้อนกลับ'), 'undo');
          }, { ok: L('ลบ') });
        break;
      }
      case 'comment-reply': {
        var rsid = el.dataset.story;
        state.openThreads[rsid] = true;
        renderDrawer();
        global.RichText.focusEnd($drawer.querySelector('.rte[data-key="r:' + rsid + '"]'));
        break;
      }
      case 'thread-toggle':
        if (state.openThreads[el.dataset.story]) delete state.openThreads[el.dataset.story];
        else state.openThreads[el.dataset.story] = true;
        renderDrawer();
        break;
      case 'jump-story':
        state.flashStory = el.dataset.story;
        renderDrawer();
        break;

      /* --- bulk --- */
      /* Sprint 1A — ล้างการเลือกทั้งสถานะและหน้าจอพร้อมกัน (clearSelUI) เดิม clearSel() ล้างแค่สถานะ
       * หลังบันทึกวาดจอไปแล้ว แถวจึงค้างไฮไลต์ทั้งที่ไม่ได้เลือกอะไร คำสั่งถัดไปเลยทำกับจำนวนที่ไม่ตรงกับจอ */
      case 'bulk-complete':
        S.bulkUpdate(selectedIds(), { completed: true });
        clearSelUI();
        toast(L('ทำเสร็จแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      case 'bulk-reopen': S.bulkUpdate(selectedIds(), { completed: false }); clearSelUI(); break;
      case 'bulk-due': {
        var bulkIds = selectedIds();
        askText(L('กำหนดส่งใหม่'), S.today(), function (v) {
          S.bulkUpdate(bulkIds, { dueOn: v || null });
          clearSel();
          renderAll();
        }, { type: 'date', note: L('เว้นว่างไว้เพื่อลบกำหนดส่งของงานที่เลือก') });
        break;
      }
      case 'bulk-delete': {
        var ids = selectedIds();
        askConfirm(L('ลบ {n} งาน?', { n: ids.length }), '', function () {
          S.deleteTasks(ids);
          clearSel();
          renderAll();
          toast(L('ย้ายไปถังขยะแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ลบ') });
        break;
      }
      case 'bulk-clear': clearSelUI(); break;

      /* --- 2c: แก้หลายงานพร้อมกัน (เมนูเพิ่มเติม) — ทุกคำสั่งย้อนกลับได้ในครั้งเดียว --- */
      case 'bulk-more':
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, bulkMoreMenu());
        break;
      case 'bulk-section': {
        var bsp = S.project(state.route.id);
        if (!bsp) break;
        /* เปลี่ยนเนื้อในเมนูเดิมเป็นรายชื่อคอลัมน์ (เปิดเมนูใหม่ที่ปุ่มเดิม = ปิดเมนู) */
        var bsHtml = bsp.sections.map(function (s) {
          return '<button data-act="bulk-section-pick" data-section="' + R.esc(s.id) + '">' + R.esc(s.name) + '</button>';
        }).join('');
        var bsPop = el.closest('.pop');
        if (bsPop) bsPop.innerHTML = bsHtml; else openPop(el, bsHtml);
        break;
      }
      case 'bulk-section-pick': {
        var bsn = S.bulkMoveSection(selectedIds(), state.route.id, sectionId);
        toast(bsn ? L('ย้าย {n} งานแล้ว', { n: bsn }) : L('งานที่เลือกไม่ได้อยู่ในโปรเจกต์นี้'), bsn ? L('ย้อนกลับ') : null, 'undo');
        break;
      }
      case 'bulk-project': openModal(bulkProjectModal()); break;
      case 'do-bulk-project': {
        var bpp = (document.getElementById('mpProject') || {}).value;
        var bps = (document.getElementById('mpSection') || {}).value;
        if (!bpp || !S.canInProject(bpp, 'edit')) { denyToast(); break; }
        var bpIds = selectedIds();
        closeModal();
        /* แก้หลายงาน → เพิ่มเข้าโปรเจกต์ปิด ถามก่อนแบบเดียวกับทีละงาน ยกเลิก = ไม่มีงานไหนถูกเพิ่ม */
        confirmJoin(bpp, bpIds, function () {
          var bpn = S.bulkAddToProject(bpIds, bpp, bps);
          if (bpn) toast(L('เพิ่ม {n} งานเข้าโปรเจกต์แล้ว', { n: bpn }), L('ย้อนกลับ'), 'undo');
          return bpn > 0;
        });
        break;
      }
      case 'bulk-field': openModal(bulkFieldModal()); break;
      case 'bf-opt': {
        if (el.dataset.single) {
          Array.prototype.forEach.call(document.querySelectorAll('#bfVal .flt-chip'), function (b) {
            if (b !== el) b.classList.remove('on');
          });
        }
        el.classList.toggle('on');
        break;
      }
      case 'do-bulk-field': {
        var bff = S.fieldDef(el.dataset.field);
        if (!bff) break;
        var bfv = null;
        if (bff.type === 'select' || bff.type === 'multi') {
          var picks = Array.prototype.map.call(document.querySelectorAll('#bfVal .flt-chip.on'), function (b) { return b.dataset.v; });
          bfv = bff.type === 'multi' ? picks : (picks[0] || null);
        } else {
          var bfi = document.getElementById('bfVal');
          bfv = bfi ? bfi.value : '';
          if (bff.type === 'number') bfv = bfv === '' ? null : Number(bfv);
        }
        var bfn = S.bulkSetField(selectedIds(), bff.id, bfv);
        closeModal();
        toast(L('ตั้ง {f} ให้ {n} งานแล้ว', { f: bff.name, n: bfn }), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'bulk-followers': openModal(bulkFollowersModal()); break;
      case 'do-bulk-followers': {
        var bfu = Array.prototype.map.call(document.querySelectorAll('.bf-user:checked'), function (c) { return c.value; });
        if (!bfu.length) { toast(L('เลือกอย่างน้อย 1 คน')); break; }
        closeModal();
        var bfIds = selectedIds();
        confirmReveal(bfIds, bfu, function () {           // Sprint 1B
          S.bulkAddFollowers(bfIds, bfu);
          toast(L('เพิ่มผู้ติดตามแล้ว'), L('ย้อนกลับ'), 'undo');
        });
        break;
      }
      case 'bulk-tag': {
        var btIds = selectedIds();
        askText(L('เพิ่มแท็กให้ {n} งาน', { n: btIds.length }), '', function (v) {
          if (!v || !v.trim()) return;
          S.bulkAddTag(btIds, v);
          toast(L('เพิ่มแท็กแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('เพิ่ม') });
        break;
      }
      case 'bulk-type':
        S.bulkUpdate(selectedIds(), { type: el.dataset.v });
        toast(L('เปลี่ยนชนิดงานแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      case 'bulk-dep': openModal(bulkDepModal()); break;
      case 'do-bulk-dep': {
        var bdn = S.bulkDependOn(selectedIds(), el.dataset.target);
        closeModal();
        toast(bdn ? L('ตั้งให้ {n} งานรองานนี้แล้ว', { n: bdn }) : L('ผูกไม่ได้ — จะทำให้รอกันเป็นวง'), bdn ? L('ย้อนกลับ') : null, 'undo');
        break;
      }
      case 'bulk-merge':
        if (selCount() < 2) { toast(L('เลือกอย่างน้อย 2 งาน')); break; }
        openModal(bulkMergeModal());
        break;
      case 'do-bulk-merge': {
        var bmn = S.bulkMerge(selectedIds(), el.dataset.target);
        closeModal();
        clearSel();
        renderAll();
        toast(L('รวม {n} งานเข้ากับงานหลักแล้ว', { n: bmn }), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'bulk-links': {
        var lines = selectedIds().map(function (x) {
          var lt = S.task(x);
          return lt ? lt.name + ' — ' + appUrl() + '#/task/' + x : '';
        }).filter(Boolean);
        copyText(lines.join('\n'), L('คัดลอกลิงก์ {n} งานแล้ว', { n: lines.length }));
        break;
      }

      /* --- 2c: แท็ก --- */
      case 'go-tag':
        e.stopPropagation();
        closeModal();
        closeSidebar();
        state.route = { type: 'tag', name: el.dataset.tag };
        clearSel();
        renderAll();
        break;
      case 'tag-rename': {
        var trOld = el.dataset.tag;
        askText(L('เปลี่ยนชื่อแท็ก “{t}”', { t: trOld }), trOld, function (v) {
          v = (v || '').trim();
          if (!v || v === trOld) return;
          var trn = S.renameTag(trOld, v);
          state.route = { type: 'tag', name: v.slice(0, 40) };
          renderAll();
          toast(L('เปลี่ยนชื่อแท็กใน {n} งานแล้ว', { n: trn }), L('ย้อนกลับ'), 'undo');
        }, { ok: L('เปลี่ยนชื่อ'), note: L('ถ้ามีแท็กชื่อนี้อยู่แล้ว สองแท็กจะรวมกัน') });
        break;
      }
      case 'tag-delete': {
        var tdName = el.dataset.tag;
        askConfirm(L('ลบแท็ก “{t}”?', { t: tdName }), L('แท็กจะถูกเอาออกจากทุกงาน (ตัวงานไม่ถูกลบ)'), function () {
          var tdn = S.deleteTag(tdName);
          state.route = { type: 'home' };
          renderAll();
          toast(L('ลบแท็กออกจาก {n} งานแล้ว', { n: tdn }), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ลบแท็ก') });
        break;
      }

      /* --- 2c: ค้นหาขั้นสูงและการค้นหาที่บันทึกไว้ --- */
      case 'open-ss': closeSidebar(); goSavedSearch(id); break;
      case 'adv-open': {
        var aq = (document.getElementById('searchInput') || {}).value || '';
        state.route = { type: 'search', q: aq.trim() };
        state.adv.open = true;
        if (!state.adv.conds.length) state.adv.conds.push({ f: 'assignee', op: 'is', v: [] });
        clearSel();
        renderAll();
        break;
      }
      case 'adv-toggle':
        state.adv.open = !state.adv.open;
        if (state.adv.open && !state.adv.conds.length) state.adv.conds.push({ f: 'assignee', op: 'is', v: [] });
        refreshSearch();
        break;
      case 'adv-mode': state.adv.mode = el.dataset.v === 'calendar' ? 'calendar' : 'list'; refreshSearch(); break;
      case 'adv-help': state.adv.help = !state.adv.help; refreshSearch(); break;
      case 'as-add': state.adv.conds.push({ f: 'assignee', op: 'is', v: [] }); state.adv.open = true; refreshSearch(); break;
      case 'as-del': state.adv.conds.splice(+el.dataset.i, 1); refreshSearch(); break;
      case 'as-clear': state.adv.conds = []; refreshSearch(); break;
      case 'as-opt': {
        var ac = state.adv.conds[+el.dataset.i];
        if (!ac) break;
        var av = Array.isArray(ac.v) ? ac.v.slice() : [];
        var aat = av.indexOf(el.dataset.v);
        if (aat >= 0) av.splice(aat, 1); else av.push(el.dataset.v);
        ac.v = av;
        refreshSearch();
        break;
      }
      case 'as-quick': {
        var isQ = el.dataset.v === 'me' ? isMeFilter
          : function (c) { return c.f === 'completed' && c.op === 'no'; };
        var hadQ = state.adv.conds.some(isQ);
        state.adv.conds = state.adv.conds.filter(function (c) { return !isQ(c); });
        if (!hadQ) state.adv.conds.push(el.dataset.v === 'me' ? { f: 'assignee', op: 'is', v: [S.ME] }
                                                               : { f: 'completed', op: 'no', v: null });
        refreshSearch();
        break;
      }
      case 'ss-save': {
        var sq = state.route.q || '';
        askText(L('ตั้งชื่อการค้นหานี้'), sq || L('การค้นหาของฉัน'), function (v) {
          var ns = S.saveSearch({ name: v, q: sq, conds: state.adv.conds, mode: state.adv.mode });
          if (!ns) { toast(L('บันทึกไม่ได้ (สูงสุด 50 รายการ)')); return; }
          state.route = { type: 'search', q: ns.q, ss: ns.id };
          renderAll();
          toast(L('บันทึกไว้ที่แถบซ้ายแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('บันทึก') });
        break;
      }
      case 'ss-update':
        S.updateSavedSearch(id, { q: state.route.q || '', conds: state.adv.conds, mode: state.adv.mode });
        toast(L('บันทึกทับแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      case 'ss-rename': {
        var ssr = S.savedSearch(id);
        if (!ssr) break;
        askText(L('เปลี่ยนชื่อ'), ssr.name, function (v) { if (v) S.updateSavedSearch(id, { name: v }); }, { ok: L('บันทึก') });
        break;
      }
      case 'ss-delete': {
        var ssd = S.savedSearch(id);
        if (!ssd) break;
        askConfirm(L('ลบการค้นหา “{n}”?', { n: ssd.name }), '', function () {
          S.deleteSavedSearch(id);
          state.route = { type: 'search', q: state.route.q || '' };
          renderAll();
          toast(L('ลบแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ลบ') });
        break;
      }

      /* --- 2c: รหัสงาน ขอสิทธิ์ บทบาท แปลงเป็นโปรเจกต์ ส่งออก พิมพ์ --- */
      case 'copy-code': copyText(el.dataset.v, L('คัดลอก {c} แล้ว', { c: el.dataset.v })); break;
      case 'request-access': {
        var rq = S.requestAccess(id, ((document.getElementById('reqNote') || {}).value || '').trim());
        if (!rq.ok) { toast(L(rq.reason)); renderViewBody(); break; }
        renderAll();
        toast(L('ส่งคำขอถึง {who} แล้ว', { who: rq.owner.name }));
        break;
      }
      case 'access-grant':
      case 'access-deny': {
        /* Sprint 1B — ตอบจากกล่องแจ้งเตือนได้ แต่ละแถวมีช่องเลือกสิทธิ์ของตัวเอง (data-sel) */
        var arAcc = (document.getElementById(el.dataset.sel || 'arAccess') || {}).value || 'edit';
        if (!S.answerAccess(id, el.dataset.user, act === 'access-grant', arAcc)) { denyToast(); break; }
        toast(act === 'access-grant' ? L('ให้สิทธิ์แล้ว') : L('ปฏิเสธคำขอแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'project-roles': openModal(rolesModal(id)); break;
      case 'do-roles': {
        var rPid = id;
        S.batch('ตั้งบทบาทในโปรเจกต์', null, function () {
          Array.prototype.forEach.call(document.querySelectorAll('.role-in'), function (inp) {
            S.setProjectRole(rPid, inp.dataset.user, inp.value);
          });
        });
        closeModal();
        toast(L('บันทึกบทบาทแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'to-project': {
        var tpT = S.task(id);
        if (!tpT || !S.can('write', id)) { denyToast(); break; }
        askConfirm(L('แปลง “{t}” เป็นโปรเจกต์?', { t: tpT.name }),
          L('ผู้รับผิดชอบเป็นเจ้าของ ผู้ติดตามเป็นสมาชิก งานย่อย {n} งานย้ายไปเป็นงานในโปรเจกต์ งานเดิมยังอยู่และลิงก์ไปหาโปรเจกต์ใหม่',
            { n: S.subtasks(id).length }), function () {
            var np = S.convertToProject(id);
            closeModal();
            state.openTaskId = null;
            if (np) goProject(np.id, 'list');
            toast(L('สร้างโปรเจกต์ “{p}” แล้ว', { p: np ? np.name : '' }), L('ย้อนกลับ'), 'undo');
          }, { ok: L('แปลงเป็นโปรเจกต์'), safe: true });
        break;
      }
      case 'export-json': {
        closePops();
        var pj = S.project(id);
        downloadText(S.projectJson(id), safeFileName(pj.name) + '.json', 'application/json');
        toast(L('ส่งออกไฟล์ JSON แล้ว'));
        break;
      }
      case 'export-ics': {
        closePops();
        var pi = S.project(id);
        var ics = S.projectIcs(id, appUrl());
        downloadText(ics.text, safeFileName(pi.name) + '.ics', 'text/calendar;charset=utf-8');
        toast(L('ส่งออกปฏิทิน {n} งานแล้ว', { n: ics.count }));
        break;
      }
      case 'mt-ics': {
        var mics = S.myTasksIcs(appUrl());
        downloadText(mics.text, 'orbit-my-tasks.ics', 'text/calendar;charset=utf-8');
        toast(L('ส่งออกปฏิทิน {n} งานแล้ว', { n: mics.count }));
        break;
      }
      case 'print-list': {
        closePops();
        if (state.route.type === 'project' && (state.route.view !== 'list' || state.route.sv)) goProject(state.route.id, 'list');
        setTimeout(function () { global.print(); }, 60);
        break;
      }
      case 'project-trash':
        closePops();
        state.route = { type: 'trash', pid: id };
        clearSel();
        renderAll();
        break;
      case 'do-csv-import': {
        var cv = state.csv;
        if (!cv) break;
        var csvRun = function () {
          try {
            var cres = S.importTasksCsvMapped(cv.pid, cv.text, cv.map);
            closeModal();
            state.csv = null;
            renderAll();
            var bits = [L('นำเข้า {n} งานแล้ว', { n: cres.tasks })];
            if (cres.sections) bits.push(L('เซกชันใหม่ {n}', { n: cres.sections }));
            if (cres.fields) bits.push(L('ฟิลด์ใหม่ {n}', { n: cres.fields }));
            if (cres.subtasks) bits.push(L('งานย่อย {n}', { n: cres.subtasks }));
            if (cres.deps) bits.push(L('ลำดับก่อนหลัง {n}', { n: cres.deps }));
            toast(bits.join(' · '), L('ย้อนกลับ'), 'undo');
            return (cres.ids || []).map(S.task);
          } catch (err) {
            toast(L('นำเข้าไม่สำเร็จ:') + ' ' + L(err.message));
            return [];
          }
        };
        /* ไฟล์ที่มีคอลัมน์ผู้รับผิดชอบ/ผู้ร่วมงาน = มอบงานให้คนในไฟล์ ถ้าเขาไม่ได้เป็นสมาชิกโปรเจกต์ปิดนี้ ถามก่อนนำเข้า
         * (ทางเดียวกับมอบงานทีละงาน) ยกเลิก = กลับไปหน้าต่างนำเข้าเดิม ไม่มีงานเกิดขึ้น */
        confirmRevealNew(S.canCreateTask(cv.pid) ? cv.pid : null, S.csvPeople(cv.text, cv.map), csvRun, function () {
          if (state.csv === cv) openModal(csvMapModal(), true);
        });
        break;
      }

      /* --- inbox --- */
      case 'inbox-tab':
        state.inbox.tab = el.dataset.tab || 'activity';
        state.inbox.snoozed = false;                       // Sprint 2B
        /* Sprint 2B — ปุ่ม "ดูทั้งหมด" ของวิดเจ็ตรออนุมัติบนหน้าแรก พาเข้ากล่องแจ้งเตือนที่แท็บนั้น */
        if (el.dataset.go && state.route.type !== 'inbox') {
          state.route = { type: 'inbox' }; clearSel(); renderAll(); break;
        }
        renderViewBody();
        break;
      case 'open-notif': {
        /* Sprint 2B — แถวที่รวมหลายรายการของงานเดียวกัน อ่านทั้งกลุ่ม */
        if (el.dataset.group) S.setNotifsRead(el.dataset.group.split(','), true);
        else S.markRead(id);
        var tid = el.dataset.task;
        if (tid && S.task(tid)) {
          openTask(tid);
          /* Sprint 2B — ความเห็น/การพูดถึง พาไปที่ความเห็นนั้นแล้วไฮไลต์ (ตัวเดียวกับลิงก์ความเห็นของ Sprint 1A) */
          if (el.dataset.story && state.openTaskId === tid) { focusStory(el.dataset.story); renderDrawer(); }
          break;
        }
        /* สรุปรายสัปดาห์ไม่ได้ชี้งานชิ้นเดียว พาไปหน้างานของฉัน */
        if (el.dataset.route === 'mytasks') {
          state.route = { type: 'mytasks' }; clearSel(); renderAll(); break;
        }
        /* 4a — ทีม/พอร์ตโฟลิโอ/เป้าหมาย route = 'team:<id>[:แท็บ]' */
        if (openRoute4a(el.dataset.route)) break;
        /* ประกาศพาไปหน้าประกาศ การรายงานสถานะพาไปหน้าภาพรวมของโปรเจกต์ */
        var npid = el.dataset.project;
        if (npid && S.project(npid)) goProject(npid, el.dataset.route === 'p-overview' ? 'overview' : 'messages');
        break;
      }
      case 'archive-notif':
        e.stopPropagation();
        /* Sprint 2B — แถวรวมกลุ่ม เก็บทั้งกลุ่ม ย้อนกลับได้ */
        if (el.dataset.group) {
          var ag = S.archiveNotifs(el.dataset.group.split(','));
          if (ag) toast(L('เก็บ {n} รายการแล้ว', { n: ag }), L('ย้อนกลับ'), 'undo');
        } else S.archiveNotification(id);
        break;
      case 'unarchive-notif': e.stopPropagation(); S.unarchiveNotification(id); break;
      case 'notif-bookmark': {
        e.stopPropagation();
        var bm = S.toggleBookmark(id);
        if (bm !== null) toast(bm ? L('บุ๊กมาร์กไว้แล้ว ดูได้ที่แท็บบุ๊กมาร์ก') : L('เอาบุ๊กมาร์กออกแล้ว'));
        break;
      }
      case 'notif-read': {
        e.stopPropagation();
        if (el.dataset.group) {          // Sprint 2B — ทั้งกลุ่ม: มีอันไหนยังไม่อ่าน = ทำเป็นอ่านทั้งหมด
          var gids = el.dataset.group.split(',');
          var anyUnread = gids.some(function (x) { var q = S.notification(x); return q && !q.read; });
          S.setNotifsRead(gids, anyUnread);
          break;
        }
        var nr = S.notification(id);
        if (nr) S.setNotifRead(id, !nr.read);
        break;
      }
      case 'notif-followup':
        e.stopPropagation();
        if (S.task(id)) openModal(followUpModal(id));
        break;
      case 'inbox-read-all': {
        /* Sprint 2B — ไม่ถาม แต่ย้อนกลับได้จากกล่องแจ้งเตือนด้านล่าง (หรือ Ctrl+Z) */
        var nra = S.markAllRead(S.db.currentUserId);
        toast(nra ? L('ทำเป็นอ่านแล้ว {n} รายการ', { n: nra }) : L('อ่านครบทุกรายการแล้ว'),
          nra ? L('ย้อนกลับ') : null, nra ? 'undo' : null);
        break;
      }
      case 'inbox-archive-all': {
        if (state.inbox.tab === 'archive') { toast(L('รายการในแท็บนี้เก็บไว้แล้ว')); break; }
        /* Sprint 2B — แท็บรออนุมัติเป็นรายการงาน ไม่ใช่การแจ้งเตือน ไม่มีอะไรให้เก็บ */
        if (state.inbox.tab === 'approvals') { toast(L('ไม่มีรายการให้เก็บ')); break; }
        /* เก็บเฉพาะที่เห็นอยู่ตามแท็บและตัวกรอง ไม่ใช่ทุกอย่างที่ซ่อนอยู่หลังตัวกรอง */
        var allIds = S.inboxList(null, inboxOpts()).map(function (x) { return x.id; });
        if (!allIds.length) { toast(L('ไม่มีรายการให้เก็บ')); break; }
        S.archiveAll(S.db.currentUserId, allIds);
        toast(L('เก็บ {n} รายการแล้ว', { n: allIds.length }), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'inbox-filter': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var ifp = openPop(el, inboxFilterPop());
        if (ifp) ifp.classList.add('pop-tall');
        break;
      }
      case 'inbox-f': {
        var fk = el.dataset.k, fv = el.dataset.v;
        if (fk === 'from' || fk === 'project') state.inbox.f[fk] = state.inbox.f[fk] === fv ? '' : fv;
        else state.inbox.f[fk] = !state.inbox.f[fk];
        renderViewBody();
        var ipop = el.closest('.pop');
        if (ipop) ipop.innerHTML = inboxFilterPop();
        break;
      }
      case 'inbox-unfilter':
        state.inbox.f[el.dataset.k] = (el.dataset.k === 'from' || el.dataset.k === 'project') ? '' : false;
        renderViewBody();
        break;
      case 'inbox-filter-clear':
        e.stopPropagation();
        closePops();
        state.inbox.f = {};
        renderViewBody();
        break;
      case 'inbox-sort': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var cur = S.personalOf().inbox.sort === 'relevance' ? 'relevance' : 'new';
        openPop(el, [['new', L('ใหม่สุดก่อน')], ['relevance', L('เกี่ยวข้องที่สุด')]].map(function (x) {
          return '<button data-act="inbox-sort-set" data-v="' + x[0] + '"' + (cur === x[0] ? ' class="on"' : '') + '>' +
            '<span class="pop-check">' + (cur === x[0] ? I('check', 13) : '') + '</span>' +
            '<span class="grow">' + R.esc(x[1]) + '</span></button>';
        }).join('') + '<div class="pop-note">' +
          R.esc(L('เกี่ยวข้องที่สุด = ยังไม่อ่านก่อน แล้วเรียงตามความสำคัญ (พูดถึงฉัน มอบหมาย อนุมัติ ปลดล็อก กำหนดส่ง)')) + '</div>');
        break;
      }
      case 'inbox-sort-set': closePops(); S.setInboxPref('sort', el.dataset.v); break;
      case 'inbox-dense': S.setInboxPref('dense', el.dataset.v === '1'); break;
      case 'go-inbox':
        state.route = { type: 'inbox' }; clearSel(); renderAll();
        break;

      /* --- ห้ามรบกวน --- */
      case 'dnd-menu': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var dh = '<div class="pop-note strong">' + R.esc(L('หยุดการแจ้งเตือนชั่วคราว')) + '</div>';
        [['30', 'นาน 30 นาที'], ['60', 'นาน 1 ชั่วโมง'], ['120', 'นาน 2 ชั่วโมง'], ['240', 'นาน 4 ชั่วโมง'],
         ['480', 'นาน 8 ชั่วโมง'], ['tomorrow', 'ถึงพรุ่งนี้ 8 โมงเช้า']].forEach(function (x) {
          dh += '<button data-act="dnd-set" data-v="' + x[0] + '">' + I('moon', 14) +
            '<span class="grow">' + R.esc(L(x[1])) + '</span></button>';
        });
        var dcur = S.dndOf();
        if (dcur.until && Date.parse(dcur.until) > Date.now()) {
          dh += '<div class="pop-sep"></div><button data-act="dnd-off">' + I('bell', 14) +
            '<span class="grow">' + R.esc(L('เลิกพักตอนนี้')) + '</span></button>';
        }
        dh += '<div class="pop-sep"></div><button data-act="open-settings" data-tab="notify">' + I('settings', 14) +
          '<span class="grow">' + R.esc(L('ตั้งช่วงห้ามรบกวนประจำวัน…')) + '</span></button>';
        openPop(el, dh);
        break;
      }
      case 'dnd-set': {
        closePops();
        var dv = el.dataset.v, until;
        if (dv === 'tomorrow') {
          until = new Date();
          until.setDate(until.getDate() + 1);
          until.setHours(8, 0, 0, 0);
        } else until = new Date(Date.now() + (+dv) * 60000);
        S.setDnd({ until: until.toISOString() });
        toast(L('ห้ามรบกวนถึง {t}', { t: R.fmtDate(S.iso(until)) + ' ' + R.fmtTime(until) }));
        break;
      }
      case 'dnd-off':
        closePops();
        S.setDnd({ until: null });
        toast(S.isDnd() ? L('ยังอยู่ในช่วงห้ามรบกวนประจำวันที่ตั้งไว้') : L('เลิกพักการแจ้งเตือนแล้ว'));
        break;
      case 'dnd-sched': {
        var ds0 = S.dndOf();
        if (ds0.from && ds0.to) S.setDnd({ from: null, to: null });
        else S.setDnd({ from: '18:00', to: '08:00' });
        openModal(settingsModal('notify'), true);
        break;
      }

      /* --- การแจ้งเตือนรายโปรเจกต์ --- */
      case 'proj-notify-menu':
        closePops();
        openModal(projNotifyModal(id));
        break;
      case 'proj-notify': {
        var pn = S.projNotifyOf(id);
        S.setProjNotify(id, el.dataset.k, !pn[el.dataset.k]);
        openModal(projNotifyModal(id));
        break;
      }

      /* --- งานส่วนตัว → สาธารณะ --- */
      case 'make-public':
        openModal(makePublicModal(id));
        break;
      case 'do-make-public': {
        var mpP = (document.getElementById('mpProject') || {}).value;
        var mpS = (document.getElementById('mpSection') || {}).value;
        if (!mpP || !S.project(mpP)) { toast(L('เลือกโปรเจกต์ก่อน')); break; }
        if (!S.canInProject(mpP, 'edit')) { denyToast(); break; }
        closeModal();
        var mpId = id;
        /* งานส่วนตัวเข้าโปรเจกต์ปิด — คู่กรณีที่ไม่ได้เป็นสมาชิกจะเห็นสิ่งที่คุยกันในงานต่อ ถามก่อน (confirmJoin) */
        confirmJoin(mpP, [mpId], function () {
          var ok = S.addTaskToProject(mpId, mpP, mpS || null);
          if (ok) toast(L('งานนี้อยู่ใน {p} แล้ว ทุกคนที่เห็นโปรเจกต์เห็นงานนี้ด้วย', { p: S.project(mpP).name }),
            L('ย้อนกลับ'), 'undo');
          return !!ok;
        });
        break;
      }

      /* --- งานของฉัน --- */
      case 'mt-mode':
        clearSel();
        S.mtSetView({ mode: el.dataset.v });
        break;
      case 'mt-filter':
      case 'mt-sort':
      case 'mt-group': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var mkind = act.slice(3);
        var mpop = openPop(el, mtPop(mkind));
        if (mpop) { mpop.dataset.kind = mkind; if (mkind === 'filter') mpop.classList.add('pop-tall'); }
        break;
      }
      case 'mt-set': {
        var mk = el.dataset.k, mval = el.dataset.v;
        var mv0 = S.personalOf().mt.view;
        var mpatch = {};
        mpatch[mk] = mval;
        if (mk === 'sort') mpatch.dir = (mval === mv0.sort && mval !== 'manual' && mv0.dir === 'asc') ? 'desc' : 'asc';
        if (mk === 'appr' && String(mv0.appr || '') === mval) mpatch.appr = '';      // Sprint 2B — กดซ้ำ = เอาออก
        S.mtSetView(mpatch);
        var mp2 = el.closest('.pop');
        if (mp2 && mp2.dataset.kind) mp2.innerHTML = mtPop(mp2.dataset.kind);
        break;
      }
      case 'mt-filter-clear':
        e.stopPropagation();
        closePops();
        S.mtSetView({ show: 'open', due: 'any', project: '', appr: '' });
        break;
      case 'mt-sort-clear':
        e.stopPropagation();
        closePops();
        S.mtSetView({ sort: 'manual', dir: 'asc' });
        break;
      case 'mt-collapse':
        if (state.mt.collapsed[sectionId]) delete state.mt.collapsed[sectionId];
        else state.mt.collapsed[sectionId] = true;
        renderViewBody();
        break;
      case 'mt-sec-add':
        askText(L('ชื่อเซกชันใหม่'), '', function (v) { if (v) S.mtAddSection(v); },
          { ok: L('เพิ่มเซกชัน'), placeholder: L('เช่น ทำวันนี้ รอคนอื่น อ่านทีหลัง') });
        break;
      case 'mt-sec-rename': {
        var msec = S.mtSection(sectionId);
        if (!msec) break;
        var msid = sectionId;
        askText(L('เปลี่ยนชื่อเซกชัน'), msec.name ? L(msec.name) : L('เพิ่งได้รับมอบหมาย'), function (v) {
          if (v) S.mtRenameSection(msid, v);
        });
        break;
      }
      case 'mt-sec-move': S.mtMoveSection(sectionId, +el.dataset.delta); break;
      case 'mt-sec-delete': {
        var dsec = S.mtSection(sectionId);
        if (!dsec) break;
        var dsid = sectionId;
        askConfirm(L('ลบเซกชัน “{s}”?', { s: L(dsec.name) }),
          L('งานในเซกชันนี้จะกลับไปอยู่ “{r}” ไม่มีงานไหนถูกลบ', { r: recentLabel() }), function () {
            S.mtDeleteSection(dsid);
            toast(L('ลบเซกชันแล้ว'), L('ย้อนกลับ'), 'undo');
          }, { ok: L('ลบ') });
        break;
      }
      case 'mt-add': mtInlineAdd(el, sectionId); break;
      case 'mt-add-top':
        askText(L('ชื่องานใหม่'), '', function (v) {
          if (!v) return;
          var mmade = S.mtCreateTasks([v], S.MT_RECENT);
          if (mmade[0]) openTask(mmade[0].id);
        }, { ok: L('เพิ่มงาน'), pasteCtx: { mtSection: S.MT_RECENT },
             note: L('งานที่สร้างจากงานของฉันเป็นงานส่วนตัว เห็นเฉพาะคุณจนกว่าจะเพิ่มเข้าโปรเจกต์') });
        break;

      /* --- ปฏิทินสัปดาห์/เดือน (R.calBoard) ใช้ได้ทุกขอบเขต --- */
      case 'calx-nav': {
        var cxs = calxScope(el), cx = calxGet(cxs);
        var cd = +el.dataset.d;
        calxSet(cxs, { anchor: !cd ? S.today()
          : cx.mode === 'month' ? S.addMonths(cx.anchor, cd) : S.addDays(cx.anchor, 7 * cd) });
        break;
      }
      case 'calx-mode': calxSet(calxScope(el), { mode: el.dataset.v }); break;
      case 'calx-day': calxSet(calxScope(el), { mode: 'week', anchor: el.dataset.date }); break;
      case 'calx-add': {
        var cxa = calxScope(el), cdate = el.dataset.date;
        if (cxa === 'mt' || cxa === 'all') {
          /* งานของฉันและปฏิทินรวม — งานส่วนตัวของคนสร้าง ลง "เพิ่งได้รับมอบหมาย" */
          askText(L('งานใหม่ ครบกำหนด {d}', { d: R.fmtDate(cdate) }), '', function (v) {
            if (v) S.mtCreateTasks([v], S.MT_RECENT, { dueOn: cdate });
          }, { ok: L('เพิ่มงาน'), pasteCtx: { mtSection: S.MT_RECENT, extra: { dueOn: cdate } },
               note: cxa === 'all' ? L('งานที่สร้างจากปฏิทินรวมเป็นงานส่วนตัว เห็นเฉพาะคุณจนกว่าจะเพิ่มเข้าโปรเจกต์') : null });
          break;
        }
        if (cxa.indexOf('p:') === 0) {
          var cpid = cxa.slice(2), cp = S.project(cpid);
          if (!cp || !S.canInProject(cpid, 'edit')) { denyToast(); break; }
          askText(L('งานใหม่ ครบกำหนด {d}', { d: R.fmtDate(cdate) }), '', function (v) {
            if (v) S.createTask({ name: v, dueOn: cdate }, cpid, cp.sections[0].id);
          }, { ok: L('เพิ่มงาน') });
        }
        break;
      }

      /* --- หน้าแรก --- */
      case 'home-edit':
        state.home.edit = !state.home.edit;
        renderViewBody();
        break;
      case 'home-w-add': {
        var hla = S.homeLayout();
        hla.push({ w: el.dataset.w, full: false });
        S.setHomeLayout(hla);
        break;
      }
      case 'home-w-remove': {
        var hlr = S.homeLayout();
        hlr.splice(+el.dataset.i, 1);
        S.setHomeLayout(hlr);
        toast(L('เอาวิดเจ็ตออกแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'home-w-move': {
        var hlm = S.homeLayout(), hi = +el.dataset.i, hj = hi + (+el.dataset.d);
        if (hj < 0 || hj >= hlm.length) break;
        var htmp = hlm[hi]; hlm[hi] = hlm[hj]; hlm[hj] = htmp;
        S.setHomeLayout(hlm);
        break;
      }
      case 'home-w-size': {
        var hls = S.homeLayout(), hk = +el.dataset.i;
        if (!hls[hk]) break;
        hls[hk].full = !hls[hk].full;
        S.setHomeLayout(hls);
        break;
      }
      case 'home-w-reset':
        S.setHomeLayout(null);
        toast(L('คืนหน้าแรกเป็นค่าเริ่มต้นแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      case 'go-project-view':
        closeSidebar();
        goProject(id, el.dataset.view);
        break;

      /* --- sections --- */
      case 'add-section': {
        var secPid = state.route.id;
        askText(L('ชื่อเซกชันใหม่'), '', function (v) {
          if (v) S.addSection(secPid, v);
        });
        break;
      }
      case 'rename-section': {
        var cur = S.section(state.route.id, sectionId);
        var rsPid = state.route.id, rsSec = sectionId;
        askText(L('เปลี่ยนชื่อเซกชัน'), cur ? cur.name : '', function (v) {
          if (v) S.renameSection(rsPid, rsSec, v);
        });
        break;
      }
      case 'delete-section': {
        var dsPid = state.route.id, dsSec = sectionId;
        askConfirm(L('ลบเซกชันนี้?'), L('งานข้างในจะย้ายไปเซกชันแรก'), function () {
          if (!S.deleteSection(dsPid, dsSec)) toast(L('ต้องเหลืออย่างน้อย 1 เซกชัน'));
          else renderAll();
        }, { ok: L('ลบเซกชันนี้') });
        break;
      }
      case 'move-section':
        S.moveSection(state.route.id, sectionId, parseInt(el.dataset.delta, 10));
        break;

      /* --- projects --- */
      case 'new-project': state.npTab = 'blank'; state.npPf = null; openModal(projectModal(null)); break;
      /* หน้าโปรเจกต์ทั้งหมด — การ์ด/รายการ จำไว้กับผู้ใช้ */
      case 'pjx-layout': S.setPref('projectsLayout', el.dataset.v === 'list' ? 'list' : 'grid'); renderAll(); break;
      case 'create-project': {
        var secInput = document.getElementById('pSections');
        var secs = secInput ? secInput.value.split(',').map(function (x) { return x.trim(); })
          .filter(function (x) { return x; }) : null;
        var np = S.createProject({
          name: document.getElementById('pName').value.trim() || L('โปรเจกต์ใหม่'),
          description: document.getElementById('pDesc').value.trim(),
          icon: document.getElementById('pIcon').value.trim() || '📁',
          color: pickedColor(S.PALETTE[0]),
          sections: (secs && secs.length) ? secs : null
        });
        var vSel = document.getElementById('pVis');
        if (vSel && vSel.value === 'private') S.setProjectVisibility(np.id, 'private');   // Sprint 3 — คนสร้างเป็นผู้ดูแลอัตโนมัติ (อยู่ใน setProjectVisibility)
        var tSel = document.getElementById('pTeam');
        if (tSel && tSel.value) S.shareProjectWithTeam(np.id, tSel.value, 'edit');   // Sprint 3 — ถ้าไม่มีสิทธิ์แชร์ ฟังก์ชันคืน false เงียบ ๆ โปรเจกต์ยังถูกสร้าง
        closeModal();
        npToPortfolio(np); goProject(np.id);
        toast(L('สร้างโปรเจกต์แล้ว'));
        break;
      }
      case 'project-menu':
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, projectMenu(id || state.route.id));
        break;

      /* --- พอร์ตโฟลิโอ --- */
      case 'new-portfolio': {
        askText(L('ชื่อพอร์ตโฟลิโอ'), L('พอร์ตโฟลิโอใหม่'), function (v) {
          if (!v) return;
          var nf = S.createPortfolio({ name: v });
          state.route = { type: 'portfolio', id: nf.id, view: 'list' };
          renderAll();
          toast(L('สร้างพอร์ตโฟลิโอแล้ว'));
        }, { ok: L('สร้างพอร์ตโฟลิโอ') });
        break;
      }
      case 'pf-menu':
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, portfolioMenu(id || state.route.id));
        break;
      case 'pf-rename': {
        closePops();
        var pf1 = S.portfolio(id);
        var pfRid = id;
        askText(L('ชื่อพอร์ตโฟลิโอ'), pf1 ? pf1.name : '', function (v) {
          if (v) { S.updatePortfolio(pfRid, { name: v }); renderAll(); }
        });
        break;
      }
      case 'pf-desc': {
        closePops();
        var pf2 = S.portfolio(id);
        var pfDid = id;
        askText(L('คำอธิบายพอร์ตโฟลิโอ'), pf2 ? pf2.description : '', function (v) {
          if (v === null) return;
          S.updatePortfolio(pfDid, { description: v });
          renderAll();
        });
        break;
      }
      case 'pf-look': closePops(); openModal(portfolioLookModal(id)); break;
      case 'save-pf-look': {
        var lf = S.portfolio(id);
        var ic2 = document.getElementById('pIcon');
        S.updatePortfolio(id, {
          color: pickedColor(lf.color),
          icon: (ic2 && ic2.value.trim()) || lf.icon
        });
        closeModal();
        renderAll();
        break;
      }
      case 'pf-delete': {
        closePops();
        var pf3 = S.portfolio(id);
        if (!pf3) break;
        var dpfId = id;
        askConfirm(L('ลบพอร์ตโฟลิโอ “{name}”?', { name: pf3.name }),
          L('โปรเจกต์ข้างในจะยังอยู่ครบ ลบแค่กล่องที่ใช้จัดกลุ่ม'), function () {
            S.deletePortfolio(dpfId);
            state.route = { type: 'home' };
            renderAll();
            toast(L('ลบพอร์ตโฟลิโอแล้ว'), L('ย้อนกลับ'), 'undo');
          }, { ok: L('ลบพอร์ตโฟลิโอ') });
        break;
      }
      case 'pf-add': closePops(); openModal(portfolioAddModal(el.dataset.pf || state.route.id)); break;
      case 'pf-pick': {
        S.addToPortfolio(el.dataset.pf, el.dataset.id);
        openModal(portfolioAddModal(el.dataset.pf));
        renderAll();
        break;
      }
      case 'pf-remove': {
        e.stopPropagation();
        S.removeFromPortfolio(el.dataset.pf, id);
        renderAll();
        toast(L('ถอดออกจากพอร์ตโฟลิโอแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'pf-status':
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, portfolioStatusMenu(id));
        break;
      case 'pf-pick-status':
        closePops();
        S.setPortfolioStatus(id, el.dataset.v, null);
        renderAll();
        toast(L('ตั้งสถานะเป็น “{s}” แล้ว', { s: L(R.projectState(el.dataset.v).label) }),
          L('ย้อนกลับ'), 'undo');
        break;
      case 'pf-clear-status':
        closePops();
        S.updatePortfolio(id, { status: null });
        renderAll();
        break;
      case 'add-to-portfolio': {
        closePops();
        openModal(addProjectToPortfolioModal(id || state.route.id));
        break;
      }
      case 'pf-toggle-project': {
        var pfid = el.dataset.pf, prid = el.dataset.id;
        var f4 = S.portfolio(pfid);
        if (f4 && f4.projectIds.indexOf(prid) >= 0) S.removeFromPortfolio(pfid, prid);
        else S.addToPortfolio(pfid, prid);
        openModal(addProjectToPortfolioModal(prid));
        renderAll();
        break;
      }

      case 'project-settings':
        closePops();
        /* Sprint 1C — สลับแท็บในหน้าต่างเดิม = เก็บร่างของแท็บรายละเอียดไว้ เปิดใหม่จากเมนู = เริ่มจากค่าจริง */
        if ($modal.contains(el) && $modal.querySelector('.prj-set')) psCapture();
        else psDraft = null;
        openModal(projectSettingsModal(id || state.route.id, el.dataset.tab), true);
        break;
      case 'save-project-details': {
        if (!psSave(id)) break;          // Sprint 1C — บันทึกจากร่าง (กดได้จากทุกแท็บ)
        closeModal();
        renderAll();
        toast(L('บันทึกการตั้งค่าแล้ว'));
        break;
      }
      case 'set-depmode': {
        var pm = S.project(id);
        S.updateProject(id, {
          depShift: { mode: el.value, scope: (pm.depShift && pm.depShift.scope) || 'downstream' }
        });
        openModal(projectSettingsModal(id, 'deps'), true);
        refreshOpts();
        break;
      }
      case 'set-depscope': {
        var pm2 = S.project(id);
        S.updateProject(id, {
          depShift: { mode: (pm2.depShift && pm2.depShift.mode) || 'maintain', scope: el.value }
        });
        openModal(projectSettingsModal(id, 'deps'), true);
        refreshOpts();
        break;
      }
      /* set-workdays เป็น select จึงรับที่ตัวจัดการ change ไม่ใช่ที่นี่ */

      case 'project-look':
        closePops();
        openModal(projectLookModal(id || state.route.id));
        break;
      case 'save-project-look': {
        var lp = S.project(id);
        var icoEl = document.getElementById('pIcon');
        S.updateProject(id, {
          color: pickedColor(lp.color),
          icon: (icoEl && icoEl.value.trim()) || lp.icon
        });
        closeModal();
        renderAll();
        break;
      }

      case 'copy-project-link': {
        closePops();
        var lp2 = S.project(id);
        copyText(global.location.origin + global.location.pathname +
          '#/project/' + id + '/' + (lp2.defaultView || 'list'), L('คัดลอกลิงก์แล้ว'));
        break;
      }
      case 'export-csv': {
        closePops();
        var pe2 = S.project(id);
        downloadText(S.projectCsv(id), safeFileName(pe2.name) + '.csv', 'text/csv;charset=utf-8');
        toast(L('ส่งออกไฟล์ CSV แล้ว'));
        break;
      }
      case 'import-csv':
        closePops();
        pickCsvFile(id);
        break;
      /* --- สิทธิ์รายโปรเจกต์ --- */
      /* ปิดเมนูโปรเจกต์ก่อน ไม่งั้นเมนูลอยค้างอยู่หลังหน้าต่าง (แบบเดียวกับฟอร์ม/เทมเพลตที่เปิดจากเมนูเดียวกัน) */
      case 'project-access': closePops(); openModal(projectAccessModal(id || state.route.id)); break;
      case 'set-visibility':
        S.setProjectVisibility(id, el.dataset.v);
        openModal(projectAccessModal(id));
        renderAll();
        break;
      case 'toggle-lock':
        S.setProjectLocked(id, el.checked);
        openModal(projectAccessModal(id));
        toast(el.checked ? L('ล็อกรายชื่อสมาชิกแล้ว') : L('ปลดล็อกแล้ว'));
        break;
      case 'add-project-member': {
        var pu = document.getElementById('paUser');
        if (!pu || !pu.value) { toast(L('ไม่มีคนให้เพิ่มแล้ว')); break; }
        S.setProjectMember(id, pu.value, document.getElementById('paAccess').value);
        openModal(projectAccessModal(id));
        renderAll();
        break;
      }
      case 'pick-access': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var pid = id, uid2 = el.dataset.user;
        var ah2 = '';
        S.PROJECT_ACCESS.forEach(function (a) {
          ah2 += '<button class="role-opt" data-act="set-access" data-id="' + R.esc(pid) +
            '" data-user="' + R.esc(uid2) + '" data-a="' + a.id + '">' +
            I(a.id === 'admin' ? 'shield' : a.id === 'view' ? 'search' : 'users') +
            '<span><b>' + L(a.label) + '</b><em>' + L(a.desc) + '</em></span></button>';
        });
        openPop(el, ah2);
        break;
      }
      case 'set-access':
        closePops();
        S.setProjectMember(id, el.dataset.user, el.dataset.a);
        openModal(projectAccessModal(id));
        renderAll();
        break;
      case 'drop-member': {
        var dm = S.user(el.dataset.user);
        var dmPid = id, dmUid = el.dataset.user;
        askConfirm(L('ถอด “{name}” ออกจากโปรเจกต์นี้?', { name: dm ? dm.name : '' }), '',
          function () {
            if (!S.removeProjectMember(dmPid, dmUid)) {
              toast(L('ต้องเหลือผู้ดูแลโปรเจกต์อย่างน้อยหนึ่งคน'));
              return;
            }
            openModal(projectAccessModal(dmPid));
            renderAll();
          }, { ok: L('ถอดออก') });
        break;
      }

      case 'edit-project': openModal(projectModal(S.project(id))); break;
      case 'save-project': {
        var ep = S.project(id);
        S.updateProject(id, {
          name: document.getElementById('pName').value.trim() || ep.name,
          description: document.getElementById('pDesc').value.trim(),
          icon: document.getElementById('pIcon').value.trim() || '📁',
          color: pickedColor(ep.color)
        });
        closeModal();
        break;
      }
      case 'view-menu':
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, viewMenu(id || state.route.id));
        break;
      case 'toggle-view': {
        var vw = el.dataset.view;
        if (!S.toggleProjectView(id, vw)) { toast(L('ต้องเหลืออย่างน้อยหนึ่งมุมมอง')); break; }
        /* ถ้าเพิ่งปิดมุมมองที่เปิดค้างอยู่ ต้องย้ายไปมุมมองที่ยังเหลือ ไม่ใช่ปล่อยหน้าว่าง */
        var left = S.projectViews(id);
        if (left.indexOf(state.route.view) < 0) state.route.view = left[0];
        renderAll();
        openPop(document.querySelector('[data-act="view-menu"]'), viewMenu(id));
        break;
      }

      case 'status-menu':
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, statusMenu(id || state.route.id));
        break;
      case 'pick-status': {
        closePops();
        /* ส่ง null เป็นข้อความ แปลว่าเปลี่ยนแค่สี ไม่ล้างรายงานที่คนเขียนไว้
         * คนเปลี่ยนสีเร็ว ๆ ระหว่างวันบ่อยกว่าเขียนรายงานใหม่ทุกครั้ง */
        S.setProjectStatus(id, el.dataset.v, null);
        renderAll();
        var stp = R.projectState(el.dataset.v);
        toast(L('ตั้งสถานะเป็น “{s}” แล้ว', { s: L(stp.label) }), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'clear-status':
        closePops();
        S.updateProject(id, { status: null });
        renderAll();
        toast(L('ล้างสถานะแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      case 'update-status':
        closePops();
        openStatusBuilder(id || state.route.id);
        break;
      case 'save-status': {
        /* 3b — ตัวสร้างรายงานแบบบล็อก (สำเนาอยู่ใน state.sb) */
        var sbx = state.sb;
        if (!sbx) break;
        if (!sbx.blocks.some(function (b) { return String(b.text || '').trim(); }) && !sbx.hl.length) {
          toast(L('เขียนอย่างน้อยหนึ่งบล็อก หรือเลือกไฮไลต์'));
          break;
        }
        var sbe = S.postStatusUpdate(sbx.pid, { state: sbx.state, title: sbx.title, blocks: sbx.blocks, hl: sbx.hl, period: sbx.period });
        if (!sbe) { denyToast(); break; }
        state.sb = null;
        closeModal();
        renderAll();
        toast(L('อัปเดตสถานะแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'sb-state': state.sb.state = el.dataset.v; refresh3b(statusBuilderHtml(), true); break;
      case 'sb-del': state.sb.blocks.splice(+el.dataset.i, 1); refresh3b(statusBuilderHtml(), true); break;
      case 'sb-up': {
        var sbl = state.sb.blocks, sbi = +el.dataset.i;
        if (sbi > 0) { var sbt = sbl[sbi - 1]; sbl[sbi - 1] = sbl[sbi]; sbl[sbi] = sbt; }
        refresh3b(statusBuilderHtml(), true);
        break;
      }
      case 'sb-hl': {
        var shl = state.sb.hl, shk = el.dataset.k;
        if (el.checked && shl.indexOf(shk) < 0) shl.push(shk);
        if (!el.checked) state.sb.hl = shl.filter(function (k) { return k !== shk; });
        refresh3b(statusBuilderHtml(), true);
        break;
      }
      case 'sb-remind': {
        S.setStatusRemind(state.sb.pid, el.checked);
        refresh3b(statusBuilderHtml(), true);
        toast(el.checked ? L('จะเตือนเจ้าของโปรเจกต์ทุกวันศุกร์') : L('ปิดการเตือนแล้ว'));
        break;
      }
      case 'sb-tpl-save': {
        var sbs = state.sb;
        askText(L('ชื่อเทมเพลตรายงาน'), '', function (v) {
          if (v) S.saveStatusTemplate(v, { blocks: sbs.blocks, hl: sbs.hl, period: sbs.period });
          state.sb = sbs;
          openModal(statusBuilderHtml(), true);
          if (v) toast(L('บันทึกเทมเพลตรายงานแล้ว'));
        }, { ok: L('บันทึก') });
        break;
      }
      case 'sb-tpl-del':
        if (S.deleteStatusTemplate(id)) refresh3b(statusBuilderHtml(), true);
        break;
      case 'toggle-archive': {
        var ap = S.project(id);
        S.archiveProject(id, !ap.archived);
        closeModal();
        toast(ap.archived ? L('เอากลับจากคลังแล้ว') : L('เก็บเข้าคลังแล้ว'));
        break;
      }
      case 'dup-project': {
        /* Sprint 1C — หน้าต่างเดียวตั้งชื่อ เลือกเอางาน (เฉพาะที่ยังไม่เสร็จได้) และเลื่อนวันทั้งโปรเจกต์ */
        closePops();
        if (S.project(id)) openModal(dupProjectModal(id));
        break;
      }
      case 'dup-sync': dupSync(); break;
      case 'dup-project-go': {
        var dTasks = document.getElementById('dupTasks'), dShift = document.getElementById('dupShift');
        var dStart = (document.getElementById('dupStart') || {}).value || '';
        if (dShift && dShift.checked && !/^\d{4}-\d\d-\d\d$/.test(dStart)) { toast(L('เลือกวันเริ่มใหม่ก่อน')); break; }
        var dp2 = S.duplicateProject(id, {
          name: (document.getElementById('dupName') || {}).value || '',
          tasks: !!(dTasks && dTasks.checked),
          openOnly: !!(dTasks && dTasks.checked && (document.getElementById('dupOpen') || {}).checked),
          shiftTo: dShift && dShift.checked ? dStart : null
        });
        closeModal();
        if (dp2) { goProject(dp2.id); toast(L('คัดลอกโปรเจกต์แล้ว')); }
        break;
      }
      case 'delete-project': {
        var dp = S.project(id), dpId = id;
        if (!dp) break;
        askConfirm(L('ลบโปรเจกต์ “{name}”?', { name: dp.name }),
          L('โปรเจกต์และงานที่อยู่เฉพาะในโปรเจกต์นี้จะไปอยู่ในถังขยะ กู้คืนได้ภายใน {n} วัน', { n: S.TRASH_DAYS }), function () {
            S.deleteProject(dpId);
            state.route = { type: 'home' };
            renderAll();
            toast(L('ย้ายโปรเจกต์ไปถังขยะแล้ว'), L('ย้อนกลับ'), 'undo');
          }, { ok: L('ลบโปรเจกต์') });
        break;
      }

      /* --- fields --- */
      case 'manage-fields': closePops(); openModal(fieldsModal(id)); break;     // เปิดจากเมนูโปรเจกต์ — ปิดเมนูก่อน
      case 'reset-cols':
        S.resetColWidths(id);
        closeModal();
        toast(L('คืนความกว้างคอลัมน์เดิมแล้ว'));
        break;
      case 'add-field': {
        var fn = document.getElementById('fName').value.trim();
        if (!fn) { toast(L('ใส่ชื่อฟิลด์ก่อน')); break; }
        var opts = document.getElementById('fOptions').value
          .split(',').map(function (x) { return x.trim(); })
          .filter(function (x) { return x; })
          /* ส่งเป็น { name, color } ตรงรูปแบบที่เก็บ ไม่พึ่งให้ store แปลงจากสตริงให้ */
          .map(function (x, i) { return { name: x, color: S.OPTION_COLORS[i % S.OPTION_COLORS.length] }; });
        var ftype = document.getElementById('fType').value;
        var ftDef = S.FIELD_TYPES.filter(function (x) { return x.id === ftype; })[0];
        S.addField(projectId, { name: fn, type: ftype, options: ftDef && ftDef.hasOptions ? opts : [] });
        openModal(fieldsModal(projectId));
        break;
      }
      case 'delete-field':
        S.deleteField(projectId, el.dataset.field);
        openModal(fieldsModal(projectId));
        toast(L('ย้ายฟิลด์ไปถังขยะแล้ว'), L('ย้อนกลับ'), 'undo');
        break;

      /* --- 3a อัตโนมัติ --- */
      case 'auto-open':
        closePops();
        if (optOpen()) closeOpts();
        openAuto(id || state.route.id);
        break;
      case 'auto-sec': {
        var asPid = state.route.id;
        if (!S.autoForSection(asPid, sectionId).length && S.canEditAutos(asPid)) {
          openAuto(asPid, { sec: sectionId });
          autoEditStart(asPid, { name: '', on: true, chain: false, trigger: autoNewTrig(asPid, 'moved', sectionId),
            paths: [{ conds: [], acts: [autoNewAct(asPid, 'complete')] }], els: null }, true);
        } else openAuto(asPid, { sec: sectionId });
        break;
      }
      case 'auto-sec-clear': state.auto.sec = null; refreshAuto(); break;
      case 'auto-tab': state.auto.tab = el.dataset.v === 'runs' ? 'runs' : 'list'; refreshAuto(); break;
      case 'auto-new': {
        var anPid = state.auto.pid;
        autoEditStart(anPid, { name: '', on: true, chain: false,
          trigger: autoNewTrig(anPid, sectionId ? 'moved' : 'added', sectionId),
          paths: [{ conds: [], acts: [] }], els: null }, true);
        break;
      }
      case 'auto-edit': {
        var aeA = S.automation(state.auto.pid, el.dataset.auto);
        if (aeA) autoEditStart(state.auto.pid, aeA, false);
        break;
      }
      case 'auto-back': state.auto.edit = null; refreshAuto(); break;
      case 'auto-toggle': {
        var atA = S.automation(state.auto.pid, el.dataset.auto);
        if (atA && S.setAutomationOn(state.auto.pid, atA.id, !atA.on)) {
          refreshAuto();
          toast(atA.on ? L('ปิดอัตโนมัติแล้ว') : L('เปิดอัตโนมัติแล้ว'), L('ย้อนกลับ'), 'undo');
        } else denyToast();
        break;
      }
      case 'auto-dup':
        if (S.duplicateAutomation(state.auto.pid, el.dataset.auto)) {
          refreshAuto();
          toast(L('ทำสำเนาแล้ว (ปิดไว้ก่อน)'), L('ย้อนกลับ'), 'undo');
        } else toast(L('ทำสำเนาไม่ได้ (สูงสุด 50 รายการต่อโปรเจกต์)'));
        break;
      case 'auto-del': {
        var adPid = state.auto.pid, adId = el.dataset.auto, adA = S.automation(adPid, adId);
        if (!adA) break;
        askConfirm(L('ลบอัตโนมัตินี้?'), autoTitle(adPid, adA), function () {
          S.deleteAutomation(adPid, adId);
          openModal(autoModalHtml(), true);
          toast(L('ลบอัตโนมัติแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ลบ') });
        break;
      }
      case 'ae-save': {
        var es = state.auto.edit;
        if (!es) break;
        var hasAct = es.a.paths.some(function (pt) { return pt.acts.length; }) || (es.a.els && es.a.els.length);
        if (!hasAct) { toast(L('ใส่การกระทำอย่างน้อยหนึ่งอย่าง')); break; }
        if (es.a.trigger.type === 'field' && !es.a.trigger.field) { toast(L('เลือกฟิลด์ของทริกเกอร์ก่อน')); break; }
        var aeSave = function () {
          var saved = S.saveAutomation(es.pid, es.a);
          if (!saved) { denyToast(); if (!$mdBack.classList.contains('open')) openModal(autoModalHtml(), true); return; }
          state.auto.edit = null;
          state.auto.tab = 'list';
          if (!$mdBack.classList.contains('open')) openModal(autoModalHtml(), true);
          else refreshAuto();
          toast(es.isNew ? L('สร้างอัตโนมัติแล้ว') : L('บันทึกอัตโนมัติแล้ว'), L('ย้อนกลับ'), 'undo');
        };
        /* อัตโนมัติที่มอบงาน/เพิ่มผู้ติดตาม/สร้างงานให้คนที่ระบุชื่อไว้ ในโปรเจกต์ปิดที่คนนั้นไม่ได้เป็นสมาชิก
         * = เขาจะเห็นทุกงานที่อัตโนมัติไปแตะ เตือนตอนบันทึก (ยกเลิก = กลับไปหน้าแก้อัตโนมัติ ไม่บันทึก)
         * คนจากตัวแปร (คนสร้างงาน คนที่ทำให้ทำงาน) รู้ตอนรันเท่านั้น ตรวจล่วงหน้าไม่ได้ */
        var aeBack = function () { if (state.auto.edit === es) openModal(autoModalHtml(), true); };
        var aePeople = function () { confirmFutureReveal(es.pid, autoPeople(es.a), L('อัตโนมัตินี้'), aeSave, aeBack); };
        /* กฎในโปรเจกต์ปิดที่ "เพิ่มเข้าโปรเจกต์อื่น" ซึ่งเปิดให้ทั้งองค์กร = งาน (และความเห็นทุกอัน) ในโปรเจกต์ปิด
         * จะโผล่ให้ทุกคนเห็น เตือนก่อนบันทึก ยกเลิก = กลับไปหน้าแก้กฎ */
        var aeOrg = autoOrgTargets(es.pid, es.a);
        if (aeOrg.length) {
          askChoice(L('กฎนี้จะเอางานออกไปให้ทั้งองค์กรเห็น'),
            L('“{p}” เป็นโปรเจกต์ปิด แต่กฎนี้เพิ่มงานเข้า {q} ซึ่งเปิดให้ทุกคนในองค์กร งานที่ถูกเพิ่มรวมถึงความเห็นและไฟล์แนบจะเห็นได้ทั้งองค์กร',
              { p: (S.project(es.pid) || {}).name || '', q: aeOrg.map(function (q) { return '“' + q.name + '”'; }).join(', ') }),
            [{ label: L('บันทึกต่อ'), primary: true, run: aePeople }], { back: aeBack });
        } else aePeople();
        break;
      }
      case 'ae-path-add':
        state.auto.edit.a.paths.push({ conds: [{ f: 'assignee', op: 'is', v: [] }], acts: [] });
        refreshAuto();
        break;
      case 'ae-path-del': state.auto.edit.a.paths.splice(+el.dataset.p, 1); refreshAuto(); break;
      case 'ae-els': {
        var eA = state.auto.edit.a;
        eA.els = eA.els ? null : [];
        refreshAuto();
        break;
      }
      case 'ae-chain': state.auto.edit.a.chain = !state.auto.edit.a.chain; refreshAuto(); break;
      case 'ae-act-del': auActs(el.dataset.p).splice(+el.dataset.i, 1); refreshAuto(); break;
      case 'ae-act-up': {
        var upL = auActs(el.dataset.p), upI = +el.dataset.i;
        if (upI > 0) { var upT = upL[upI - 1]; upL[upI - 1] = upL[upI]; upL[upI] = upT; }
        refreshAuto();
        break;
      }
      case 'ae-ap-chip': {
        var chA = auActs(el.dataset.p)[+el.dataset.i];
        if (!chA) break;
        var chCur = [].concat(auGet(chA, el.dataset.k) || []);
        var chAt = chCur.indexOf(el.dataset.v);
        if (chAt >= 0) chCur.splice(chAt, 1); else chCur.push(el.dataset.v);
        auSet(chA, el.dataset.k, chCur);
        refreshAuto();
        break;
      }
      case 'ae-var': {
        /* แทรกตัวแปรที่ตำแหน่งเคอร์เซอร์ของช่องข้อความ (ไม่มีเคอร์เซอร์ = ต่อท้าย) */
        var vA = auActs(el.dataset.p)[+el.dataset.i];
        if (!vA) break;
        var vBox = el.closest('.au-params') && el.closest('.au-params').querySelector('[data-k="' + el.dataset.k + '"]');
        var vCur = String(auGet(vA, el.dataset.k) || '');
        var vAt = vBox && typeof vBox.selectionStart === 'number' && document.activeElement === vBox ? vBox.selectionStart : vCur.length;
        auSet(vA, el.dataset.k, vCur.slice(0, vAt) + el.dataset.v + vCur.slice(vAt));
        refreshAuto();
        break;
      }
      case 'aec-add': {
        state.auto.edit.a.paths[+el.dataset.p].conds.push({ f: 'assignee', op: 'is', v: [] });
        refreshAuto();
        break;
      }
      case 'aec-del': {
        var dpi = String(el.dataset.i).split('.');
        state.auto.edit.a.paths[+dpi[0]].conds.splice(+dpi[1], 1);
        refreshAuto();
        break;
      }
      case 'aec-opt': {
        var opi = String(el.dataset.i).split('.');
        var oc = state.auto.edit.a.paths[+opi[0]].conds[+opi[1]];
        if (!oc) break;
        var ov = Array.isArray(oc.v) ? oc.v.slice() : [];
        var oat = ov.indexOf(el.dataset.v);
        if (oat >= 0) ov.splice(oat, 1); else ov.push(el.dataset.v);
        oc.v = ov;
        refreshAuto();
        break;
      }
      /* รันเอง — จากเมนูงาน หรือหลายงานที่เลือก */
      case 'auto-run-pick': openModal(autoRunModal([id])); break;
      case 'auto-bulk': closePops(); openModal(autoRunModal(selectedIds(), state.route.type === 'project' ? state.route.id : null)); break;
      case 'auto-run': {
        var arIds = String(el.dataset.ids || '').split(',').filter(Boolean);
        var arA = S.automation(projectId, el.dataset.auto);
        var arN = S.runAutomation(projectId, el.dataset.auto, arIds);
        closeModal();
        if (!arN) { toast(L('ไม่มีงานที่รันได้ (งานต้องอยู่ในโปรเจกต์ของอัตโนมัตินี้)')); break; }
        var arRun = S.autoRuns(projectId)[0];
        toast(arRun && arRun.s === 'err' && arN === 1
          ? L('รันแล้วแต่มีข้อผิดพลาด: {e}', { e: L(arRun.e, arRun.ep || undefined) })
          : L('รัน “{a}” กับ {n} งานแล้ว', { a: arA ? (arA.trigger.label || autoTitle(projectId, arA)) : '', n: arN }),
          L('ย้อนกลับ'), 'undo');
        break;
      }
      /* งานของฉัน */
      case 'mt-auto': openAuto('@me'); break;
      case 'mt-auto-add': {
        var mk = el.dataset.k;
        var msec = (document.getElementById('mtaSec-' + mk) || {}).value;
        var tr = { type: mk };
        if (mk === 'approaching') tr.days = Math.max(0, parseInt((document.getElementById('mtaDays') || {}).value, 10) || 0);
        if (mk === 'overdue') { tr.n = Math.max(0, parseInt((document.getElementById('mtaOver') || {}).value, 10) || 0); tr.unit = 'days'; }
        if (mk === 'completed') tr.v = true;
        S.saveAutomation('@me', { name: '', on: true, chain: false, trigger: tr,
          paths: [{ conds: [], acts: [{ type: 'mtmove', sec: msec }] }], els: null });
        refreshAuto();
        runAutoTick();
        toast(L('เพิ่มอัตโนมัติแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'mt-auto-toggle': {
        var mtA = S.automation('@me', el.dataset.auto);
        if (mtA) S.setAutomationOn('@me', mtA.id, !mtA.on);
        refreshAuto();
        break;
      }
      case 'mt-auto-del': S.deleteAutomation('@me', el.dataset.auto); refreshAuto(); toast(L('ลบอัตโนมัติแล้ว'), L('ย้อนกลับ'), 'undo'); break;
      /* ตัวเลือกคอลัมน์ในแผงงาน */
      case 'dw-sec': {
        var dsp = S.project(projectId);
        if (!dsp) break;
        var dsm = S.projectsOfTask(id).filter(function (x) { return x.project.id === projectId; })[0];
        openPop(el, dsp.sections.map(function (s) {
          return '<button data-act="dw-sec-pick" data-id="' + esc(id) + '" data-project="' + esc(projectId) + '" data-section="' + esc(s.id) + '">' +
            popCheck(dsm && dsm.membership.sectionId === s.id) + esc(s.name) + '</button>';
        }).join(''));
        break;
      }
      case 'dw-sec-pick':
        closePops();
        S.moveTask(id, projectId, sectionId);
        renderDrawer();
        toast(L('ย้ายไป “{s}” แล้ว', { s: auSecName(projectId, sectionId) }), L('ย้อนกลับ'), 'undo');
        break;

      /* --- templates --- */
      case 'manage-templates': closePops(); openModal(templatesModal(null)); break;
      case 'tt-pick': closePops(); openModal(templatesModal(sectionId)); break;
      case 'use-template': {
        var up = S.project(state.route.id);
        if (!up) break;
        if (!S.canInProject(up.id, 'edit')) { denyToast(); break; }
        var useSec = sectionId || state.ttSec;
        var useId = id;
        closeModal();
        /* เทมเพลตระบุคนไว้ล่วงหน้า (ผู้รับผิดชอบ ผู้ติดตาม คนรับงานย่อย) ใช้ในโปรเจกต์ปิดแล้วคนเหล่านั้น
         * ที่ไม่ได้เป็นสมาชิกจะเห็นงานทันที ถามก่อนสร้างแบบเดียวกับมอบงาน (ยกเลิก = ไม่สร้าง) */
        var useTpl = S.findTaskTemplate(useId), useWho = [];
        if (useTpl && useTpl.tpl.t) {
          var utt = useTpl.tpl.t;
          if (utt.assignee && utt.assignee.mode === 'user') useWho.push(utt.assignee.user);
          useWho = useWho.concat(utt.followers || [], (utt.subs || []).map(function (s) { return s.assignee; }));
        }
        confirmRevealNew(S.canCreateTask(up.id) ? up.id : null, useWho.filter(Boolean), function () {
          var made = S.applyTaskTemplate(useId, up.id, S.section(up.id, useSec) ? useSec : up.sections[0].id);
          if (made) {
            openTask(made.id);
            toast(L('สร้างงานจากเทมเพลตแล้ว'), L('ย้อนกลับ'), 'undo');
          }
          return made;
        });
        break;
      }
      case 'delete-template': {
        var dtt = id;
        askConfirm(L('ลบเทมเพลตงานนี้?'), '', function () {
          S.deleteTaskTemplate(dtt);
          openModal(templatesModal(state.ttSec));
          toast(L('ลบเทมเพลตแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ลบ') });
        break;
      }
      case 'do-tt-save': {
        var ttScope = ($modal.querySelector('input[name="ttScope"]:checked') || {}).value || '*';
        var ttNew = S.saveTaskTemplate(id, (document.getElementById('ttName') || {}).value, ttScope);
        if (!ttNew) break;
        state.tte = { id: ttNew.id, name: ttNew.name, t: S.clone(ttNew.t), scope: ttScope };
        openModal(ttEditModal(), true);
        toast(L('บันทึกเป็นเทมเพลตแล้ว'));
        break;
      }
      case 'tt-edit': {
        var tfx = S.findTaskTemplate(id);
        if (!tfx) break;
        state.tte = { id: id, name: tfx.tpl.name, t: S.clone(tfx.tpl.t), scope: tfx.scope };
        openModal(ttEditModal(), true);
        break;
      }
      case 'tte-back': state.tte = null; openModal(templatesModal(state.ttSec)); break;
      case 'tte-save': {
        var tts = state.tte;
        if (!String(tts.t.name || '').trim()) { toast(L('ใส่ชื่องานก่อน')); break; }
        S.updateTaskTemplate(tts.id, { name: tts.name, t: tts.t });
        state.tte = null;
        openModal(templatesModal(state.ttSec));
        toast(L('บันทึกเทมเพลตแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'tte-rel': {
        var trk = el.dataset.k;
        auSet(state.tte, trk, el.checked ? { n: 1, unit: 'days' } : null);
        refresh3b(ttEditModal(), true);
        break;
      }
      case 'tte-fol': {
        var tfl = state.tte.t.followers, tfi = tfl.indexOf(el.dataset.v);
        if (tfi >= 0) tfl.splice(tfi, 1); else tfl.push(el.dataset.v);
        refresh3b(ttEditModal(), true);
        break;
      }
      case 'tte-sub-add':
        state.tte.t.subs.push({ k: 'k' + Date.now().toString(36), name: '', notes: '', assignee: null, due: null, deps: [] });
        refresh3b(ttEditModal(), true);
        break;
      case 'tte-sub-del': {
        var tsk = state.tte.t.subs[+el.dataset.i];
        state.tte.t.subs.splice(+el.dataset.i, 1);
        state.tte.t.subs.forEach(function (s) { s.deps = s.deps.filter(function (k) { return !tsk || k !== tsk.k; }); });
        refresh3b(ttEditModal(), true);
        break;
      }

      /* --- 3b ฟอร์ม --- */
      case 'forms-open': closePops(); openForms(id || state.route.id); break;
      case 'go-form':
        closePops();
        closeModal();
        state.route = { type: 'form', id: id };
        state.ff = { id: id, ans: {} };
        state.openTaskId = null;
        clearSel();
        renderAll();
        break;
      case 'fm-go': {
        var fgo = id;
        closeModal();
        state.route = { type: 'form', id: fgo };
        state.ff = { id: fgo, ans: {} };
        state.openTaskId = null;
        clearSel();
        renderAll();
        break;
      }
      case 'fm-link': copyText(formUrl(id), L('คัดลอกลิงก์ฟอร์มแล้ว')); break;
      case 'fm-new': {
        var fnp = S.project(projectId);
        if (!fnp) break;
        var fq = feNewItem('text');
        fq.label = L('เรื่อง'); fq.req = true; fq.map = 'name';
        state.fe = { pid: projectId, isNew: true, f: { name: L('ฟอร์มใหม่'), desc: '', on: true, items: [fq, feNewItem('long')],
          sec: fnp.sections[0].id, titleQ: '', assignee: '', copy: true, follow: true, confirm: '', again: true } };
        state.fe.f.items[1].label = L('รายละเอียด');
        state.fe.f.items[1].map = 'notes';
        openModal(formEditModal(), true);
        break;
      }
      case 'fm-edit': {
        var fex = S.formById(id);
        if (!fex) break;
        state.fe = { pid: fex.p.id, isNew: false, f: S.clone(fex.f) };
        openModal(formEditModal(), true);
        break;
      }
      case 'fm-toggle': {
        var ftx = S.formById(id);
        if (ftx && S.setFormOn(ftx.p.id, id, !ftx.f.on)) {
          refresh3b(formsModal(ftx.p.id), true);
          toast(ftx.f.on ? L('เปิดรับคำตอบแล้ว') : L('ปิดรับคำตอบแล้ว'), L('ย้อนกลับ'), 'undo');
        } else denyToast();
        break;
      }
      case 'fm-dup': {
        var fdx = S.formById(id);
        if (fdx && S.duplicateForm(fdx.p.id, id)) {
          refresh3b(formsModal(fdx.p.id), true);
          toast(L('ทำสำเนาแล้ว (ปิดรับไว้ก่อน)'), L('ย้อนกลับ'), 'undo');
        } else toast(L('ทำสำเนาไม่ได้ (สูงสุด {n} ฟอร์มต่อโปรเจกต์)', { n: S.FORM_MAX }));
        break;
      }
      case 'fm-del': {
        var fdl = S.formById(id), fdlId = id;
        if (!fdl) break;
        askConfirm(L('ลบฟอร์ม “{f}”?', { f: fdl.f.name }), L('ลิงก์ของฟอร์มนี้จะใช้ไม่ได้ งานที่สร้างจากฟอร์มแล้วยังอยู่ครบ'), function () {
          S.deleteForm(fdl.p.id, fdlId);
          openForms(fdl.p.id);
          toast(L('ลบฟอร์มแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ลบ') });
        break;
      }
      case 'fe-back': {
        var fbp = state.fe && state.fe.pid;
        state.fe = null;
        if (fbp && state.route.type === 'project') openForms(fbp); else closeModal();
        break;
      }
      case 'fe-save': {
        var fes = state.fe;
        if (!fes) break;
        if (!String(fes.f.name || '').trim()) { toast(L('ตั้งชื่อฟอร์มก่อน')); break; }
        if (!fes.f.items.some(function (it) { return it.kind !== 'heading'; })) { toast(L('เพิ่มคำถามอย่างน้อยหนึ่งข้อ')); break; }
        var fbad = fes.f.items.filter(function (it) { return it.kind !== 'heading' && !String(it.label || '').trim(); })[0];
        if (fbad) { toast(L('คำถามข้อ {n} ยังไม่มีข้อความ', { n: fes.f.items.indexOf(fbad) + 1 })); break; }
        var fopt = fes.f.items.filter(function (it) { return (it.kind === 'select' || it.kind === 'multi') && !it.opts.length; })[0];
        if (fopt) { toast(L('คำถามข้อ {n} ยังไม่มีตัวเลือก', { n: fes.f.items.indexOf(fopt) + 1 })); break; }
        var feSave = function () {
          var fsv = S.saveForm(fes.pid, fes.f);
          if (!fsv) {
            toast(L('บันทึกไม่ได้ (สิทธิ์ไม่พอ หรือครบ {n} ฟอร์มแล้ว)', { n: S.FORM_MAX }));
            if (!$mdBack.classList.contains('open')) openModal(formEditModal(), true);   // กลับไปแก้ต่อได้
            return;
          }
          state.fe = null;
          if (state.route.type === 'form') { closeModal(); renderAll(); }
          else openForms(fes.pid);
          toast(fes.isNew ? L('สร้างฟอร์มแล้ว') : L('บันทึกฟอร์มแล้ว'), L('ย้อนกลับ'), 'undo');
        };
        /* ผู้รับผิดชอบเริ่มต้นของฟอร์ม = ทุกเรื่องที่ส่งเข้ามาจะถูกมอบให้คนนี้ ถ้าเป็นโปรเจกต์ปิดที่เขาไม่ได้เป็นสมาชิก
         * เขาจะเห็นทุกงานที่ฟอร์มสร้าง เตือนตอนบันทึก (การส่งฟอร์มเปิดให้คนนอกโดยตั้งใจ จึงไม่ถามตอนส่ง)
         * ยกเลิก = ไม่บันทึก หน้าต่างแก้ฟอร์มกลับมาให้แก้ต่อ */
        var feWho = fes.f.assignee && S.user(fes.f.assignee) ? [fes.f.assignee] : [];
        confirmFutureReveal(fes.pid, feWho, L('ฟอร์มนี้'), feSave, function () {
          if (state.fe === fes) openModal(formEditModal(), true);
        });
        break;
      }
      case 'fe-q-del': state.fe.f.items.splice(+el.dataset.i, 1); refresh3b(formEditModal(), true); break;
      case 'fe-q-up': case 'fe-q-down': {
        var fql = state.fe.f.items, fqi = +el.dataset.i, fqj = fqi + (act === 'fe-q-up' ? -1 : 1);
        if (fqj >= 0 && fqj < fql.length) { var fqt = fql[fqi]; fql[fqi] = fql[fqj]; fql[fqj] = fqt; }
        /* เงื่อนไขที่ชี้ไปคำถามที่ตอนนี้อยู่ข้างล่างใช้ไม่ได้แล้ว */
        var fqpos = {};
        fql.forEach(function (x, k) { fqpos[x.id] = k; });
        fql.forEach(function (x, k) { if (x.cond && !(fqpos[x.cond.q] < k)) x.cond = null; });
        refresh3b(formEditModal(), true);
        break;
      }
      case 'fe-cond-chip': {
        var fci = state.fe.f.items[+el.dataset.i];
        if (!fci || !fci.cond) break;
        var fcv = fci.cond.v, fcat = fcv.indexOf(el.dataset.v);
        if (fcat >= 0) fcv.splice(fcat, 1); else fcv.push(el.dataset.v);
        refresh3b(formEditModal(), true);
        break;
      }
      case 'ff-submit': {
        var ffs = state.ff;
        if (!ffs) break;
        var fres = S.submitForm(id, ffs.ans);
        if (fres.err) {
          ffs.err = fres.err; ffs.params = fres.params || null; ffs.errQ = fres.q || null;
          renderViewBody();
          var errEl = $view.querySelector('.ffq.err, .ffp-err');
          if (errEl && errEl.scrollIntoView) errEl.scrollIntoView({ block: 'center' });
          break;
        }
        state.ff = { id: id, ans: {}, done: fres.task.id };
        renderAll();
        toast(L('ส่งฟอร์มแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'ff-again': state.ff = { id: state.route.id, ans: {} }; renderViewBody(); break;
      case 'ff-file-del': {
        var ffl = [].concat(state.ff.ans[el.dataset.q] || []);
        ffl.splice(+el.dataset.i, 1);
        state.ff.ans[el.dataset.q] = ffl;
        renderViewBody();
        break;
      }

      /* --- 3b ชนิดงานและสถานะ --- */
      case 'types-open': closePops(); openTypes(id || state.route.id); break;
      case 'ty-new':
        state.te.isNew = true;
        state.te.ty = { name: '', icon: '◇', statuses: [
          { name: L('ยังไม่เริ่ม'), color: '#9ca0a8', done: false },
          { name: L('กำลังทำ'), color: '#14aaf5', done: false },
          { name: L('เสร็จแล้ว'), color: '#37c5ab', done: true }] };
        refresh3b(typesModal(), true);
        break;
      case 'ty-edit': {
        var tye = S.typeDef(id);
        if (!tye) break;
        state.te.isNew = false;
        state.te.ty = S.clone(tye);
        refresh3b(typesModal(), true);
        break;
      }
      case 'ty-del': {
        var tyd = S.typeDef(id), tydPid = state.te.pid;
        if (!tyd) break;
        askConfirm(L('ลบชนิดงาน “{t}”?', { t: tyd.name }), L('งานที่เป็นชนิดนี้จะกลับเป็นงานทั่วไป และสถานะหายไป ย้อนกลับได้'), function () {
          S.deleteTaskType(tydPid, tyd.id);
          openTypes(tydPid);
          toast(L('ลบชนิดงานแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ลบ') });
        break;
      }
      case 'te-back': state.te.ty = null; refresh3b(typesModal(), true); break;
      case 'te-save': {
        var tes = state.te;
        if (!String(tes.ty.name || '').trim()) { toast(L('ตั้งชื่อชนิดงานก่อน')); break; }
        if (!tes.ty.statuses.some(function (s) { return String(s.name || '').trim(); })) { toast(L('ต้องมีอย่างน้อยหนึ่งสถานะ')); break; }
        if (!S.saveTaskType(tes.pid, tes.ty)) { toast(L('บันทึกไม่ได้ (สิทธิ์ไม่พอ หรือครบ {n} ชนิดแล้ว)', { n: S.TYPE_MAX })); break; }
        tes.ty = null;
        refresh3b(typesModal(), true);
        renderAll();
        toast(tes.isNew ? L('สร้างชนิดงานแล้ว') : L('บันทึกชนิดงานแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'te-st-add':
        state.te.ty.statuses.push({ name: '', color: S.OPTION_COLORS[state.te.ty.statuses.length % S.OPTION_COLORS.length], done: false });
        refresh3b(typesModal(), true);
        break;
      case 'te-st-del': state.te.ty.statuses.splice(+el.dataset.i, 1); refresh3b(typesModal(), true); break;
      case 'te-st-up': {
        var tsl = state.te.ty.statuses, tsi = +el.dataset.i;
        if (tsi > 0) { var tst = tsl[tsi - 1]; tsl[tsi - 1] = tsl[tsi]; tsl[tsi] = tst; }
        refresh3b(typesModal(), true);
        break;
      }
      case 'te-st-color': {
        var tsc = state.te.ty.statuses[+el.dataset.i];
        var cols = S.OPTION_COLORS, ci = cols.indexOf(tsc.color);
        tsc.color = cols[(ci + 1) % cols.length];
        refresh3b(typesModal(), true);
        break;
      }
      case 'te-st': if (el.dataset.k === 'done') { state.te.ty.statuses[+el.dataset.i].done = el.checked; } break;
      case 'cell-status':
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, statusPop(id));
        break;
      case 'set-cstatus': {
        closePops();
        var scd = S.statusDef(el.dataset.v);
        if (S.setTaskStatus(id, el.dataset.v) && scd) {
          toast(L('ตั้งสถานะเป็น “{s}” แล้ว', { s: scd.st.name }), L('ย้อนกลับ'), 'undo');
        }
        break;
      }

      /* --- 3b เทมเพลตโปรเจกต์ --- */
      case 'np-tab':
        state.npTab = el.dataset.v === 'tpl' ? 'tpl' : 'blank';
        openModal(projectModal(null), state.npTab === 'tpl');
        break;
      case 'pt-save': closePops(); openModal(ptSaveModal(id || state.route.id)); break;
      case 'do-pt-save': {
        var pts = S.saveProjectTemplate(projectId, {
          name: (document.getElementById('ptsName') || {}).value,
          desc: (document.getElementById('ptsDesc') || {}).value,
          withTasks: !!(document.getElementById('ptsTasks') || {}).checked,
          skipWeekends: !!(document.getElementById('ptsSkip') || {}).checked,
          org: !!(document.getElementById('ptsOrg') || {}).checked
        });
        closeModal();
        if (pts) toast(L('บันทึกเทมเพลต “{t}” แล้ว ใช้ได้จาก “สร้างโปรเจกต์ใหม่ → จากเทมเพลต”', { t: pts.name }), L('ย้อนกลับ'), 'undo');
        else denyToast();
        break;
      }
      case 'pt-pick': openModal(ptUseModal(id)); break;
      case 'pt-use': {
        var ptx = S.projectTemplate(id);
        if (!ptx) break;
        if (!S.can('structure')) { denyToast(); break; }
        var ptRoles = {};
        ((ptx.data && ptx.data.roles) || []).forEach(function (r) {
          var sel = document.getElementById('ptuRole-' + r.k);
          if (sel && sel.value) ptRoles[r.k] = sel.value;
        });
        var ptp = S.useProjectTemplate(id, {
          name: (document.getElementById('ptuName') || {}).value,
          start: (document.getElementById('ptuStart') || {}).value,
          skipWeekends: !!(document.getElementById('ptuSkip') || {}).checked,
          roles: ptRoles
        });
        closeModal();
        state.npTab = 'blank';
        if (ptp) {
          npToPortfolio(ptp); goProject(ptp.id);
          toast(L('สร้างโปรเจกต์จากเทมเพลตแล้ว'), L('ย้อนกลับ'), 'undo');
        }
        break;
      }
      case 'pt-share': openModal(ptShareModal(id)); break;
      case 'pt-org':
        S.updateProjectTemplate(id, { org: el.checked });
        openModal(ptShareModal(id));
        break;
      case 'pt-acc-add': {
        var pau = document.getElementById('ptsUser'), pal = document.getElementById('ptsLevel');
        if (pau && pau.value) S.setTemplateAccess(id, pau.value, pal ? pal.value : 'use');
        openModal(ptShareModal(id));
        break;
      }
      case 'pt-rename': {
        var prn = S.projectTemplate(id), prnId = id;
        if (!prn) break;
        askText(L('ชื่อเทมเพลต'), prn.name, function (v) {
          if (v) S.updateProjectTemplate(prnId, { name: v });
          state.npTab = 'tpl';
          openModal(projectModal(null), true);
        });
        break;
      }
      case 'pt-del': {
        var pdl = S.projectTemplate(id), pdlId = id;
        if (!pdl) break;
        askConfirm(L('ลบเทมเพลต “{t}”?', { t: pdl.name }), L('โปรเจกต์ที่สร้างจากเทมเพลตนี้ไปแล้วยังอยู่ครบ'), function () {
          S.deleteProjectTemplate(pdlId);
          state.npTab = 'tpl';
          openModal(projectModal(null), true);
          toast(L('ลบเทมเพลตแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ลบ') });
        break;
      }

      /* --- members --- */
      case 'manage-members': openModal(addMemberModal()); break;
      case 'add-user': openModal(addMemberModal()); break;
      case 'pick-person': {
        var pRole = document.getElementById('uRole').value;
        var pOid = global.OrbitAuth.orbitId(el.dataset.oid);
        /* Sprint 1B — อีเมลนี้อาจถูกกรอกเองไว้ก่อนแล้ว (คนละรหัส) เพิ่มซ้ำจะได้คนเดียวกันสองรายการ */
        var pProb = S.user(pOid) ? null : S.emailProblem(el.dataset.email, pOid);
        if (pProb) { toast(L(pProb.key, pProb.params || undefined)); break; }
        var added = S.addUser({
          id: pOid,
          name: el.dataset.name, email: el.dataset.email, role: pRole
        });
        if (!added) break;
        el.disabled = true;
        el.querySelector('i').textContent = L('เพิ่มแล้ว');
        toast(L('เพิ่ม “{name}” เข้ารายชื่อแล้ว', { name: added.name }));
        break;
      }
      case 'do-add-user': {
        var un = document.getElementById('uName').value.trim();
        if (!un) { toast(L('ใส่ชื่อก่อน')); break; }
        var uEm = document.getElementById('uEmail').value.trim();
        /* Sprint 1B — ตรวจรูปแบบและอีเมลซ้ำ (ไม่สนตัวพิมพ์) ก่อนเพิ่ม หน้าต่างยังเปิดค้างให้แก้ต่อได้ */
        var uProb = S.emailProblem(uEm);
        if (uProb) {
          toast(L(uProb.key, uProb.params || undefined));
          var uEmEl = document.getElementById('uEmail');
          if (uEmEl) { uEmEl.focus(); uEmEl.select(); }
          break;
        }
        if (!S.addUser({ name: un, email: uEm, role: document.getElementById('uRole').value })) break;
        closeModal();
        renderAll();
        toast(L('เพิ่ม “{name}” เข้ารายชื่อแล้ว', { name: un }));
        break;
      }
      case 'remove-user': {
        var ru = S.user(id);
        if (!ru) break;
        var ruId = id;
        askConfirm(L('เอา “{name}” ออกจากรายชื่อ?', { name: ru.name }),
          L('งานที่มอบหมายไว้จะกลายเป็นยังไม่มอบหมาย'), function () {
            if (!S.removeUser(ruId)) { toast(L('ลบคนนี้ไม่ได้')); return; }
            renderAll();
            toast(L('เอาออกจากรายชื่อแล้ว'), L('ย้อนกลับ'), 'undo');
          }, { ok: L('เอาออก') });
        break;
      }
      /* --- จัดการบัญชีและบันทึกการทำงาน --- */
      case 'disable-user': {
        var du = S.user(id);
        if (!du) break;
        /* มีงานค้างอยู่ ต้องตัดสินใจเรื่องงานก่อน ไม่ใช่ปิดแล้วค่อยไปตามหาทีหลัง
         * งานที่ผูกกับบัญชีที่เข้าไม่ได้จะเงียบไปจนกว่าจะเลยกำหนด */
        /* Sprint 1B — เป็นเจ้าของ/ผู้ดูแลโปรเจกต์อยู่ก็ต้องโอนก่อนเหมือนงาน (คำขอสิทธิ์จะไปตกที่บัญชีที่ปิด) */
        state.hoGuests = false;
        if (S.openTasksOf(id).length || S.projectRolesOf(id).length) { openModal(handoverModal(id, true)); break; }
        var duId = id;
        askConfirm(L('ปิดใช้งานบัญชีของ “{name}”?', { name: du.name }),
          L('เขาจะเข้าระบบไม่ได้ทันที แต่งานที่มอบหมายไว้ยังอยู่ครบ'), function () {
            if (!S.setActive(duId, false)) { toast(L('ปิดบัญชีนี้ไม่ได้')); return; }
            renderAll();
            toast(L('ปิดใช้งานบัญชีแล้ว'), L('ย้อนกลับ'), 'undo');
          }, { ok: L('ปิดใช้งานบัญชี') });
        break;
      }
      case 'handover': state.hoGuests = false; openModal(handoverModal(id, false)); break;
      case 'ho-guests':
        /* Sprint 1B — แสดง/ซ่อนบุคคลภายนอกในรายชื่อคนรับงาน วาดหน้าต่างใหม่โดยคงตัวเลือกเดิมไว้ */
        state.hoGuests = !!el.checked;
        openModal(handoverModal(id, el.dataset.off === '1', { role: el.dataset.role || null }));
        break;
      case 'do-handover': {
        var toSel = document.getElementById('hoTo');
        var to = toSel ? toSel.value : '';
        var alsoOff = el.dataset.off === '1';
        var newRole = el.dataset.role || '';
        var withProj = !!(document.getElementById('hoProjects') || {}).checked;
        var hoFrom = id;
        var toU = to ? S.user(to) : null;
        /* โปรเจกต์ปิดที่มีงานที่จะโอน แต่คนรับไม่ได้เป็นสมาชิก — เขาจะเห็นงานเหล่านั้นทั้งงานเพราะกลายเป็นผู้รับผิดชอบ */
        var hoOut = toU ? S.handoverOutsiders(hoFrom, to, withProj) : [];
        var doHo = function (access) {
          var moved = 0, projN = 0, failed = false;
          /* Sprint 1B — โอนงาน โอนบทบาทในโปรเจกต์ และปิดบัญชี/เปลี่ยนบทบาท อยู่ในจุดย้อนกลับเดียว
           * (รวมการเพิ่มคนรับเป็นสมาชิกโปรเจกต์ปิด หรือบันทึก "ให้ … เห็นงานนี้" ตามที่เลือก) */
          S.batch('โอนงานต่อ', null, function () {
            if (access) hoOut.forEach(function (x) { S.revealTo([], [to], access, x.project.id); });
            moved = S.handoverTasks(hoFrom, to || null);
            var hoLogged = {};             // งานที่อยู่หลายโปรเจกต์ปิด ลงประวัติครั้งเดียวพอ
            if (!access) hoOut.forEach(function (x) {
              var fresh = x.taskIds.filter(function (tid) { return !hoLogged[tid]; });
              fresh.forEach(function (tid) { hoLogged[tid] = true; });
              if (fresh.length) S.revealTo(fresh, [to], null, x.project.id);
            });
            if (withProj && to) projN = S.handoverProjects(hoFrom, to);
            if (alsoOff && !S.setActive(hoFrom, false)) failed = true;
            if (newRole && !S.setRole(hoFrom, newRole)) failed = true;
          });
          if (failed) { S.undo(); toast(alsoOff ? L('ปิดบัญชีนี้ไม่ได้') : L('ต้องมีผู้ดูแลอย่างน้อยหนึ่งคน')); return; }
          closeModal();
          renderAll();
          /* เลือก "ไม่โอน ปล่อยว่างไว้" ไม่ใช่การโอน — เดิมขึ้น "โอนงาน 11 งาน และปิดบัญชีแล้ว" ทั้งที่งานไม่มีเจ้าของ */
          var msg = !moved && (alsoOff || newRole)
            ? (alsoOff ? L('ปิดใช้งานบัญชีแล้ว') : L('เปลี่ยนบทบาทแล้ว'))
            : !to
            ? (alsoOff ? L('ปิดบัญชีแล้ว งาน {n} งานไม่มีผู้รับผิดชอบ', { n: moved })
              : newRole ? L('เปลี่ยนบทบาทแล้ว งาน {n} งานไม่มีผู้รับผิดชอบ', { n: moved })
              : L('ปล่อยงาน {n} งานไว้โดยไม่มีผู้รับผิดชอบ', { n: moved }))
            : alsoOff ? L('โอนงาน {n} งาน และปิดบัญชีแล้ว', { n: moved })
            : newRole ? L('โอนงาน {n} งาน และเปลี่ยนบทบาทแล้ว', { n: moved })
            : L('โอนงาน {n} งานแล้ว', { n: moved });
          if (projN) msg += ' · ' + L('โอนผู้ดูแล {n} โปรเจกต์', { n: projN });
          toast(msg, L('ย้อนกลับ'), 'undo');
        };
        /* คนรับไม่ได้เป็นสมาชิกโปรเจกต์ปิดที่มีงานที่จะโอน — เดิมโอนเงียบ ๆ ตอนนี้ให้เลือก
         * เพิ่มเป็นสมาชิกโปรเจกต์เหล่านั้น / โอนโดยให้เห็นเฉพาะงานที่โอน (ลงประวัติในงาน) / ยกเลิก (กลับไปหน้าต่างโอนงาน)
         * บุคคลภายนอกใช้หน้าต่างนี้แทนคำยืนยันเดิม (มีคำเตือนเรื่องบุคคลภายนอกต่อท้าย) */
        if (hoOut.length) {
          var hoNames = hoOut.map(function (x) { return x.project.name; });
          var hoTasks = {};
          hoOut.forEach(function (x) { x.taskIds.forEach(function (tid) { hoTasks[tid] = true; }); });
          var hoCanAdd = hoOut.every(function (x) { return S.canAddMembers(x.project.id); });
          var hoChoices = [];
          if (hoCanAdd) {
            hoChoices.push({ label: L('โอนและเพิ่มเป็นสมาชิกโปรเจกต์ (แสดงความเห็นได้)'), primary: true, run: function () { doHo('comment'); } });
            hoChoices.push({ label: L('โอนและเพิ่มเป็นสมาชิกโปรเจกต์ (แก้ไขได้)'), run: function () { doHo('edit'); } });
          }
          hoChoices.push({ label: L('โอนโดยให้เห็นเฉพาะงานที่โอน'), primary: !hoChoices.length, run: function () { doHo(null); } });
          var hoBack = function () {
            openModal(handoverModal(hoFrom, alsoOff, { role: newRole || null }));
            var sel = document.getElementById('hoTo');
            if (sel) sel.value = to;
            var hp = document.getElementById('hoProjects');
            if (hp) hp.checked = withProj;
          };
          askChoice(L('{who} ไม่ได้เป็นสมาชิกของ {n} โปรเจกต์ปิดที่มีงานที่จะโอน', { who: toU.name, n: hoNames.length }),
            L('งาน {t} งานอยู่ใน {p} ถ้าโอนต่อ {who} จะเห็นงานเหล่านั้นทั้งงาน รวมถึงความเห็นและไฟล์แนบ แม้จะไม่ได้เป็นสมาชิกโปรเจกต์',
              { t: Object.keys(hoTasks).length, p: hoNames.slice(0, 4).join(', ') + (hoNames.length > 4 ? '…' : ''), who: toU.name }) +
            (toU.role === 'guest' ? ' ' + L('{name} เป็นบุคคลภายนอก ควรเพิ่มเป็นสมาชิกเฉพาะโปรเจกต์ที่ตั้งใจเชิญเท่านั้น', { name: toU.name }) : ''),
            hoChoices, { back: hoBack });
        } else if (toU && toU.role === 'guest') {
          /* เลือกบุคคลภายนอกต้องยืนยันอีกชั้น เพราะเขาจะเห็นงานภายในทั้งหมดที่โอนไป */
          askConfirm(L('โอนงานให้บุคคลภายนอก “{name}”?', { name: toU.name }),
            L('{name} เป็นบุคคลภายนอก จะเห็นงานทั้ง {n} งาน รวมความเห็นและไฟล์แนบ แม้งานจะอยู่ในโปรเจกต์ที่เขาไม่ได้ถูกเชิญ',
              { name: toU.name, n: S.openTasksOf(hoFrom).length }), doHo, { ok: L('โอนให้บุคคลภายนอก') });
        } else doHo();
        break;
      }
      case 'enable-user':
        if (S.setActive(id, true)) { renderAll(); toast(L('เปิดใช้งานบัญชีอีกครั้งแล้ว')); }
        break;

      case 'audit-group':
        state.auditFilter.group = el.dataset.g || '';
        renderAll();
        break;
      case 'audit-csv': {
        var csv = S.auditCsv();
        downloadDirect(csv, 'orbit-audit-' + S.today() + '.csv');
        S.audit('system.export', null, L('ส่งออกบันทึกการทำงานเป็น CSV'));
        break;
      }

      /* --- บทบาทในหน้าผู้ดูแล --- */
      case 'pick-role': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var pu = S.user(id);
        var rh = '';
        S.ROLES.forEach(function (r) {
          rh += '<button class="role-opt' + (pu && pu.role === r.id ? ' on' : '') +
            '" data-act="set-role" data-id="' + R.esc(id) + '" data-role="' + r.id + '">' +
            I({ admin: 'shield', guest: 'building', viewer: 'search' }[r.id] || 'users') +
            '<span><b>' + L(r.label) + '</b><em>' + L(r.desc) + '</em></span></button>';
        });
        openPop(el, rh);
        break;
      }
      case 'set-role': {
        closePops();
        var srU = S.user(id), srRole = el.dataset.role, srId = id;
        var srOpen = S.openTasksOf(id).length;
        /* Sprint 1B — เปลี่ยนเป็นดูอย่างเดียวทั้งที่ยังมีงานค้าง = งานติดอยู่กับคนที่ติ๊กเสร็จไม่ได้แล้ว
         * ถามก่อน บอกจำนวนงาน และให้เลือกโอนงานไปพร้อมกันได้เลย */
        if (srU && srRole === 'viewer' && srU.role !== 'viewer' && srOpen) {
          askChoice(L('เปลี่ยน “{name}” เป็นดูอย่างเดียว?', { name: srU.name }),
            L('{name} มีงานที่ยังไม่เสร็จ {n} งาน บทบาทดูอย่างเดียวติ๊กเสร็จหรือแก้งานเหล่านี้ไม่ได้อีก', { name: srU.name, n: srOpen }), [
              { label: L('โอนงานก่อน แล้วเปลี่ยนบทบาท'), primary: true, run: function () {
                state.hoGuests = false;
                openModal(handoverModal(srId, false, { role: 'viewer' }));
              } },
              { label: L('เปลี่ยนบทบาทโดยไม่โอนงาน'), run: function () {
                if (!S.setRole(srId, 'viewer')) toast(L('ต้องมีผู้ดูแลอย่างน้อยหนึ่งคน'));
                renderAll();
              } }
            ]);
          break;
        }
        if (!S.setRole(id, srRole)) toast(L('ต้องมีผู้ดูแลอย่างน้อยหนึ่งคน'));
        renderAll();
        break;
      }

      /* --- บัญชีบริษัทและการซิงก์ --- */
      case 'gate-lang':                       // Sprint 3 — เปลี่ยนภาษาที่หน้าเข้าสู่ระบบ (ไม่แก้ข้อมูล จึงไม่อยู่ใน NEEDS)
        global.I18N.setLang(el.dataset.v);
        global.I18N.rememberGateLang(el.dataset.v);
        showGate();
        break;
      case 'show-gate':
        closePops();
        gate.error = null; gate.busy = false; gate.checking = false;
        showGate();
        break;
      case 'sign-in':
        gate.busy = true; gate.error = null;
        showGate();
        try {
          global.OrbitAuth.signIn().catch(function (err) {
            gate.busy = false;
            gate.error = (err && err.message) || L('เข้าสู่ระบบไม่สำเร็จ');
            showGate();
          });
        } catch (e3) {
          gate.busy = false;
          gate.error = (e3 && e3.message) || L('เข้าสู่ระบบไม่สำเร็จ');
          showGate();
        }
        break;
      case 'use-local':
        setLocalOnly(true);
        hideGate();
        renderAll();
        toast(L('ใช้งานแบบเครื่องเดียว ข้อมูลจะอยู่ในเบราว์เซอร์นี้เท่านั้น'));
        break;
      /* ออกจากระบบ: ต้องบันทึกงานที่ค้างให้เสร็จก่อน แล้วจึงล้างสำเนาในเครื่อง
       * ถ้าไม่ล้าง คนถัดไปที่เปิดแอปบนเครื่องเดียวกันจะเห็นงานทั้งทีมโดยไม่ต้องล็อกอิน
       * ถ้าบันทึกไม่สำเร็จ ห้ามล้างและห้ามออก ไม่งั้นงานที่เพิ่งพิมพ์หายไปเฉย ๆ */
      case 'sign-out': {
        closePops();
        /* Sprint 1B — โหมดเครื่องเดียว ข้อมูลในเบราว์เซอร์คือของจริงชุดเดียว ไม่ใช่แคชของส่วนกลาง
         * เดิมออกจากระบบ (เช่นจากหน้าจอบัญชีถูกปิด) แล้วล้างทิ้งกลับเป็นข้อมูลตัวอย่างทันทีโดยไม่เตือน
         * ตอนนี้ไม่ล้างเลย กลับไปหน้าเข้าสู่ระบบโดยเก็บข้อมูลไว้ และเสนอให้ดาวน์โหลดสำรองก่อน */
        if (!(global.OrbitSync && global.OrbitSync.state.mode === 'team')) {
          var leaveLocal = function () {
            setLocalOnly(false);
            if ($gate.dataset.kind === 'disabled') delete $gate.dataset.kind;
            gate.error = null; gate.busy = false; gate.checking = false;
            showGate();
            toast(L('ออกแล้ว ข้อมูลยังอยู่ในเบราว์เซอร์นี้ กด “ลองใช้แบบเครื่องเดียวก่อน” เพื่อกลับมาใช้ต่อ'));
          };
          askChoice(L('ออกจากโหมดเครื่องเดียว?'),
            L('ข้อมูลทั้งหมดอยู่ในเบราว์เซอร์นี้เท่านั้น ออกแล้วข้อมูลจะยังอยู่ ไม่ถูกลบ แต่ถ้าล้างข้อมูลเบราว์เซอร์จะหายถาวร ควรดาวน์โหลดไฟล์สำรองเก็บไว้'), [
              { label: L('ดาวน์โหลดสำรองก่อน'), primary: true, run: function () { doExport(); leaveLocal(); } },
              { label: L('ออกโดยเก็บข้อมูลไว้'), run: leaveLocal }
            ]);
          break;
        }
        var leave = function () {
          if (global.OrbitSync) global.OrbitSync.stop();
          S.wipeLocal();
          if (global.OrbitPhotos) global.OrbitPhotos.clear();
          setLocalOnly(false);
          renderAll();
          global.OrbitAuth.signOut();
        };
        if (global.OrbitSync && global.OrbitSync.state.mode === 'team' &&
            global.OrbitSync.state.dirty) {
          toast(L('กำลังบันทึกงานที่ค้างก่อนออกจากระบบ…'));
          global.OrbitSync.flush().then(function (ok) {
            if (ok) leave();
            else toast(L('บันทึกงานที่ค้างไม่สำเร็จ ยังไม่ออกจากระบบ ลองใหม่อีกครั้ง'));
          });
        } else {
          leave();
        }
        break;
      }
      case 'sync-menu':
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, R.syncMenu());
        break;
      case 'save-error':
        openModal(saveErrorModal());
        break;
      case 'account-menu':
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, R.accountMenu());
        break;
      case 'sync-now':
        closePops();
        /* มีงานค้างส่ง ต้องส่งก่อน ไม่งั้นดึงของกลางมาทับแล้วงานที่เพิ่งแก้หาย */
        (global.OrbitSync.state.dirty ? global.OrbitSync.flush() : Promise.resolve(true)).then(function (ok) {
          if (ok === false) { renderTopbar(); return; }
          return global.OrbitSync.pullNow().then(function () { renderAll(); });
        });
        break;
      /* การเข้าสู่ระบบหมดอายุ — พาไปหน้า Microsoft ด้วยบัญชีเดิม
       * งานในเครื่องบันทึกไว้แล้วและจดว่าค้างส่ง กลับมาแล้วตัวซิงก์ส่งต่อให้เอง */
      case 'reauth':
        closePops();
        try {
          global.OrbitAuth.reauth().catch(function (err) { toast((err && err.message) || L('เข้าสู่ระบบไม่สำเร็จ')); });
        } catch (e4) { toast((e4 && e4.message) || L('เข้าสู่ระบบไม่สำเร็จ')); }
        break;
      case 'sync-export-mine':
        doExport();
        break;
      case 'sync-keep-mine':
        closePops();
        global.OrbitSync.resolveKeepMine().then(function () {
          toast(L('เขียนทับข้อมูลส่วนกลางด้วยงานของคุณแล้ว'));
          renderAll();
        });
        break;
      case 'sync-take-theirs':
        closePops();
        global.OrbitSync.resolveTakeTheirs().then(function () {
          toast(L('ใช้ข้อมูลจากส่วนกลางแล้ว'));
          renderAll();
        });
        break;

      case 'switch-user':
        openModal(switchUserModal());
        break;
      case 'do-switch-user': {
        if (!canSwitchTo(id)) { toast(L('สลับไปบัญชีที่มีสิทธิ์สูงกว่าตัวเองไม่ได้')); break; }
        /* จำไว้ว่าเริ่มจากใคร จะได้มีทางกลับเสมอ
         * ไม่งั้นผู้ดูแลที่สลับลงไปดูมุมของสมาชิก จะติดอยู่ข้างล่างและกลับขึ้นมาไม่ได้ */
        if (!viewAsOrigin()) setViewAsOrigin(S.db.currentUserId);
        if (id === viewAsOrigin()) setViewAsOrigin(null);
        /* มุมมองที่ทำงานอยู่เป็นของแต่ละคน — ล้างของคนเดิมทิ้งก่อน แล้วโหลดของคนใหม่ตอนวาด */
        state.views = {};
        state.svWork = {};
        state.cursor = null;
        S.setCurrentUser(id);
        closeModal();
        toast(L('สลับเป็น') + ' ' + S.user(id).name + ' ' + L('แล้ว'));
        break;
      }

      /* --- settings --- */
      case 'show-shortcuts': openModal(shortcutsModal(), true); break;
      case 'show-glossary': openModal(glossaryModal(), true); break;      // Sprint 3 — ไม่แก้ข้อมูล จึงไม่อยู่ใน NEEDS
      case 'show-tour': state.tourStep = 0; openModal(tourModal()); break;
      case 'tour-next': state.tourStep = (state.tourStep || 0) + 1; openModal(tourModal()); break;
      case 'tour-prev': state.tourStep = Math.max(0, (state.tourStep || 0) - 1); openModal(tourModal()); break;
      case 'open-settings':
        closePops();
        state.setTab = el.dataset.tab || state.setTab || 'general';
        openModal(settingsModal(state.setTab), true);
        break;
      case 'set-lang':
        S.setPref('lang', el.dataset.v);
        global.I18N.setLang(el.dataset.v);
        renderAll();
        openModal(settingsModal(state.setTab), true);
        break;
      case 'set-theme':
        S.setPref('theme', el.dataset.v);
        applyTheme();
        openModal(settingsModal(state.setTab), true);
        break;

      /* --- ค่าที่ตั้งไว้ของแต่ละคน --- */
      case 'set-landing':   S.setPref('landing', el.dataset.v); openModal(settingsModal('general'), true); break;
      case 'set-firstday':  S.setPref('firstDay', el.dataset.v); renderAll(); openModal(settingsModal('display'), true); break;
      case 'set-shortcuts': S.setPref('shortcuts', !S.pref('shortcuts')); openModal(settingsModal('general'), true); break;
      case 'set-confirmdel': S.setPref('confirmDelete', !S.pref('confirmDelete')); openModal(settingsModal('general'), true); break;
      case 'set-compact':   S.setPref('compact', !S.pref('compact')); applyTheme(); openModal(settingsModal('display'), true); break;
      case 'set-rownum':    S.setPref('rowNumbers', !S.pref('rowNumbers')); applyTheme(); renderAll(); openModal(settingsModal('display'), true); break;
      case 'set-notify': {
        var nk = el.dataset.kind;
        var meN = S.me();
        var was = S.wantsNotify(meN.id, nk);           // Sprint 2B — ค่าเริ่มต้นตามชนิด
        S.setNotifyPref(nk, !was);
        openModal(settingsModal('notify'), true);
        break;
      }
      /* --- รูปประจำตัว --- */
      case 'pick-photo': {
        var fi = document.getElementById('prPhoto');
        if (fi) fi.click();
        break;
      }
      case 'remove-photo':
        if (S.removePhoto()) {
          renderAll();
          openModal(settingsModal('profile'), true);
          toast(L('เอารูปออกแล้ว'), L('ย้อนกลับ'), 'undo');
        }
        break;

      case 'save-profile': {
        var nmP = document.getElementById('prName').value.trim();
        if (!nmP) { toast(L('ใส่ชื่อก่อน')); break; }
        S.updateProfile({
          name: nmP,
          pronouns: document.getElementById('prPron').value.trim(),
          title: document.getElementById('prTitle').value.trim(),
          dept: document.getElementById('prDept').value.trim(),
          about: document.getElementById('prAbout').value.trim(),
          color: pickedColor(S.me().color)
        });
        closeModal();
        renderAll();
        toast(L('บันทึกโปรไฟล์แล้ว'));
        break;
      }

      /* --- สถานะไม่อยู่ --- */
      case 'set-away': closePops(); openModal(awayModal()); break;
      case 'save-away': {
        var au = document.getElementById('awUntil').value;
        if (!au) { toast(L('เลือกวันที่กลับมาก่อน')); break; }
        S.setAway(au, document.getElementById('awNote').value.trim());
        closeModal();
        renderAll();
        toast(L('ตั้งสถานะไม่อยู่ถึง {d} แล้ว', { d: R.fmtDate(au) }));
        break;
      }
      case 'clear-away':
        S.setAway(null, '');
        closeModal();
        renderAll();
        toast(L('ยกเลิกสถานะไม่อยู่แล้ว'));
        break;
      case 'export': doExport(); break;
      case 'import': doImport(); break;
      case 'copy-backup': openModal(copyModal()); break;
      case 'paste-backup': openModal(pasteModal()); break;
      case 'copy-dump': {
        var dump = document.getElementById('dumpBox');
        dump.select();
        copyText(dump.value, L('คัดลอกแล้ว'));
        break;
      }
      case 'do-paste-import': {
        var pb = document.getElementById('pasteBox');
        if (!pb.value.trim()) { toast(L('ยังไม่ได้วางข้อมูล')); break; }
        try {
          S.importJSON(pb.value);
          closeModal();
          state.route = { type: 'home' };
          state.openTaskId = null;
          clearSel();
          renderAll();
          toast(L('กู้คืนข้อมูลสำเร็จ'));
        } catch (err2) {
          toast(L('ข้อมูลไม่ถูกต้อง:') + ' ' + err2.message);
        }
        break;
      }
      case 'reset':
        askConfirm(L('ล้างข้อมูลทั้งหมดและเริ่มใหม่?'),
          L('ทุกอย่างจะหายถาวร แนะนำให้ดาวน์โหลดสำรองก่อน'), function () {
            S.reset();
            state.route = { type: 'home' };
            state.openTaskId = null;
            clearSel();
            renderAll();
          }, { ok: L('ล้างทั้งหมด') });
        break;

      case 'undo': doUndo(); break;
      case 'close-modal': if (!psGuardClose()) closeModal(); break;     // Sprint 1C
    }
  });

  function pickedColor(fallback) {
    var b = $modal.querySelector('#pColors .on');
    return (b && b.dataset && b.dataset.color) || fallback || S.PALETTE[0];
  }

  /* ---------- swatch picker inside modal ---------- */

  $modal.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('#pColors button') : null;
    if (b) {
      Array.prototype.forEach.call($modal.querySelectorAll('#pColors button'), function (x) {
        x.classList.remove('on');
      });
      b.classList.add('on');
      var prevC = document.getElementById('lookPrev');
      if (prevC) prevC.style.background = b.dataset.color + '22';
      return;
    }
    var sp = e.target.closest ? e.target.closest('#stPick button') : null;
    if (sp) {
      Array.prototype.forEach.call($modal.querySelectorAll('#stPick button'), function (x) {
        x.classList.remove('on');
      });
      sp.classList.add('on');
      return;
    }
    /* ตารางไอคอน — กดแล้วเติมลงช่องพิมพ์เอง ให้ค่าที่จะบันทึกมีที่เดียว
     * ไม่งั้นเลือกจากตารางกับพิมพ์เองจะขัดกันว่าอันไหนชนะ */
    var ic = e.target.closest ? e.target.closest('#pIcons button') : null;
    if (ic) {
      Array.prototype.forEach.call($modal.querySelectorAll('#pIcons button'), function (x) {
        x.classList.remove('on');
      });
      ic.classList.add('on');
      var box = document.getElementById('pIcon');
      if (box) box.value = ic.dataset.icon;
      var prevI = document.getElementById('lookPrev');
      if (prevI) prevI.textContent = ic.dataset.icon;
    }
  });

  /* ---------- change events ---------- */

  document.addEventListener('change', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.dataset.act;
    if (!allowed(act, el)) { renderAll(); return; }   // วาดใหม่เพื่อคืนค่าเดิมให้ช่องกรอก
    if (change3c(act, el)) return;                // 3c
    if (change3c2(act, el)) return;
    if (change4a(act, el)) return;                // 4a
    for (var xc = 0; xc < EXT.changes.length; xc++) if (EXT.changes[xc](act, el, e)) return;   // 4b

    if (act === 'photo-file') { takePhoto(el); return; }
    if (act === 'att-file') { takeAttachment(el); return; }

    /* 2a — เลือกโปรเจกต์ตอนทำงานส่วนตัวให้เป็นสาธารณะ แล้วเปลี่ยนรายการคอลัมน์ตาม */
    if (act === 'mp-project') {
      var mps = document.getElementById('mpSection');
      if (mps) mps.innerHTML = sectionOptions(el.value);
      return;
    }
    if (act === 'dnd-from' || act === 'dnd-to') {
      var dpatch = {};
      dpatch[act === 'dnd-from' ? 'from' : 'to'] = el.value || null;
      S.setDnd(dpatch);
      openModal(settingsModal('notify'), true);
      return;
    }
    if (act === 'notepad') { clearTimeout(noteTimer); S.setNotepad(el.value); return; }

    /* วันของงานย่อย บันทึกทันทีที่เลือก แล้ววาดใหม่ทั้งหน้าให้แถวอัปเดตตาม
     * เมนูยังเปิดค้างไว้ เพื่อให้ตั้งอีกวันต่อได้โดยไม่ต้องกดเปิดใหม่ */
    if (act === 'sub-start' || act === 'sub-due') {
      var patch = {};
      patch[act === 'sub-start' ? 'startOn' : 'dueOn'] = el.value || null;
      setDates(el.dataset.id, patch);
      renderDrawer();
      return;
    }

    /* 3a — ตัวแก้ไขอัตโนมัติ (สำเนาในหน้าจอ บันทึกจริงตอนกด "บันทึก") */
    if (/^(ae-|aec-)/.test(act) && state.auto && state.auto.edit) {
      var ea = state.auto.edit.a, epid = state.auto.edit.pid;
      if (act === 'ae-name') { ea.name = el.value; return; }        // ไม่ต้องวาดใหม่
      if (act === 'ae-trig') {
        ea.trigger = autoNewTrig(epid, el.value, ea.trigger.sec);
      } else if (act === 'ae-tp') {
        ea.trigger[el.dataset.k] = auVal(el);
        if (el.dataset.k === 'field') ea.trigger.val = '';
        if (el.dataset.k === 'ctype') ea.trigger.v = '';
        if (el.dataset.k === 'freq') ea.trigger.day = el.value === 'monthly' ? 1 : 1;
      } else if (act === 'ae-act-add') {
        if (!el.value) return;
        auActs(el.dataset.p).push(autoNewAct(epid, el.value));
      } else if (act === 'ae-act-type') {
        auActs(el.dataset.p)[+el.dataset.i] = autoNewAct(epid, el.value);
      } else if (act === 'ae-ap') {
        var apA = auActs(el.dataset.p)[+el.dataset.i];
        if (!apA) return;
        var apK = el.dataset.k;
        auSet(apA, apK, auVal(el));
        /* เปลี่ยนฟิลด์/โปรเจกต์แล้ว ค่าที่เลือกไว้ของอันเดิมใช้ไม่ได้ */
        if (apA.type === 'field' && apK === 'field') {
          var nf = auFieldOf(epid, el.value);
          apA.value = nf && nf.type === 'multi' ? [] : '';
          delete apA.mode; delete apA['var'];
          if (nf && nf.type === 'date') { apA.mode = 'rel'; apA.n = 0; apA.unit = 'days'; apA.dir = 'after'; apA.from = 'trigger'; }
        }
        if (apA.type === 'addproj' && apK === 'pid') apA.sec = '';
        /* ช่องพิมพ์ข้อความไม่วาดใหม่ เคอร์เซอร์จะได้ไม่หลุด */
        if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text') || (el.tagName === 'INPUT' && !el.type)) return;
        if (el.tagName === 'INPUT' && el.type === 'number') return;
      } else if (/^aec-(field|op|val|val2)$/.test(act)) {
        var cpi = String(el.dataset.i).split('.');
        var conds = ea.paths[+cpi[0]] ? ea.paths[+cpi[0]].conds : null;
        var cnd2 = conds && conds[+cpi[1]];
        if (!cnd2) return;
        if (act === 'aec-field') {
          var cdef = S.filterField('a:' + epid, el.value);
          var cop = cdef ? S.FILTER_OPS[cdef.kind][0][0] : 'is';
          conds[+cpi[1]] = { f: el.value, op: cop, v: cdef ? fltDefaultV(cdef.kind, cop) : [] };
        } else if (act === 'aec-op') {
          var codef = S.filterField('a:' + epid, cnd2.f);
          var cold = JSON.stringify(fltDefaultV(codef ? codef.kind : '', cnd2.op));
          cnd2.op = el.value;
          if (codef && JSON.stringify(fltDefaultV(codef.kind, el.value)) !== cold) cnd2.v = fltDefaultV(codef.kind, el.value);
        } else if (act === 'aec-val') {
          if (cnd2.op === 'between') cnd2.v = [el.value || '', (cnd2.v && cnd2.v[1]) || ''];
          else if (cnd2.op === 'next' || cnd2.op === 'last') cnd2.v = Math.max(0, parseInt(el.value, 10) || 0);
          else if (el.type === 'number') cnd2.v = el.value === '' ? '' : Number(el.value);
          else cnd2.v = el.value;
        } else {
          cnd2.v = [(cnd2.v && cnd2.v[0]) || '', el.value || ''];
        }
      }
      refreshAuto();
      return;
    }

    /* 3b — ตัวแก้ฟอร์ม ชนิดงาน เทมเพลตงาน รายงานสถานะ และหน้าส่งฟอร์ม (สำเนาในหน้าจอ) */
    if (syncDraft3b(el)) return;
    if (act === 'ff-file') { takeFormFiles(el); return; }
    if ((act === 'ff-ans' || act === 'ff-multi' || act === 'ff-range') && state.ff) {
      var ffq = el.dataset.q;
      if (act === 'ff-multi') {
        var ffm = [].concat(state.ff.ans[ffq] || []).filter(function (v) { return v !== el.value; });
        if (el.checked) ffm.push(el.value);
        state.ff.ans[ffq] = ffm;
      } else if (act === 'ff-range') {
        var ffr = (state.ff.ans[ffq] || ['', '']).slice();
        ffr[+el.dataset.part] = el.value;
        state.ff.ans[ffq] = ffr;
      } else state.ff.ans[ffq] = el.value;
      state.ff.err = null; state.ff.errQ = null;
      renderViewBody();
      return;
    }
    if (act === 'fe-q-add' && state.fe) {
      if (el.value) state.fe.f.items.push(feNewItem(el.value));
      refresh3b(formEditModal(), true);
      return;
    }
    if ((act === 'fe-set' || act === 'fe-q') && state.fe) {
      var fk = el.dataset.k, fv = el.dataset.t === 'check' ? el.checked : el.value;
      if (act === 'fe-set') state.fe.f[fk] = fv;
      else {
        var fit = state.fe.f.items[+el.dataset.i];
        if (!fit) return;
        if (fk === 'kind') {
          var nit = feNewItem(fv);
          nit.id = fit.id; nit.label = fit.label; nit.help = fit.help; nit.req = fit.req && fv !== 'heading';
          if (nit.opts.length && fit.opts.length) nit.opts = fit.opts;
          state.fe.f.items[+el.dataset.i] = nit;
          /* คำถามที่แตกแขนงจากข้อนี้ใช้ไม่ได้ถ้าไม่ใช่คำถามตัวเลือกแล้ว */
          if (!nit.opts.length) state.fe.f.items.forEach(function (x) { if (x.cond && x.cond.q === fit.id) x.cond = null; });
        } else if (fk === 'condq') {
          fit.cond = fv ? { q: fv, v: [] } : null;
        } else if (fk === 'map') {
          fit.map = fv;
          /* ผูกกับฟิลด์ตัวเลือก — ใช้ตัวเลือกของฟิลด์ คำตอบจะได้ลงฟิลด์ได้ทุกค่า */
          var mf = fv.indexOf('field:') === 0 ? (S.project(state.fe.pid).fields || []).filter(function (x) { return x.id === fv.slice(6); })[0] : null;
          if (mf && (mf.type === 'select' || mf.type === 'multi')) fit.opts = mf.options.map(function (o) { return o.name; });
        } else fit[fk] = fv;
      }
      refresh3b(formEditModal(), true);
      return;
    }
    if (act === 'ty-default' && state.te) {
      S.setDefaultType(state.te.pid, el.value);
      refresh3b(typesModal(), true);
      toast(L('ตั้งชนิดเริ่มต้นแล้ว'), L('ย้อนกลับ'), 'undo');
      return;
    }
    if (state.tte && /^tte/.test(act)) {
      var tk = el.dataset.k, tv = el.value;
      if (act === 'tte' && tk === 'type') {
        if (S.isBuiltinType(tv)) { state.tte.t.type = tv; state.tte.t.ctype = null; }
        else { state.tte.t.type = 'task'; state.tte.t.ctype = tv; }
        if (state.tte.t.type === 'milestone') state.tte.t.start = null;
      } else if (act === 'tte') auSet(state.tte, tk, auVal(el));
      else if (act === 'tte-sub') {
        var tsb = state.tte.t.subs[+el.dataset.i];
        if (!tsb) return;
        if (tk === 'assignee') tsb.assignee = tv || null;
        else if (tk === 'due') tsb.due = tv === '' ? null : { n: Math.max(0, parseInt(tv, 10) || 0), unit: 'days' };
        else if (tk === 'dep') tsb.deps = tv ? [tv] : [];
      } else if (act === 'tte-field') {
        state.tte.t.fields[el.dataset.f] = tv === '' ? null : tv;
      }
      refresh3b(ttEditModal(), true);
      return;
    }
    if (state.sb && (act === 'sb-add' || act === 'sb-period' || act === 'sb-tpl')) {
      if (act === 'sb-add' && el.value) state.sb.blocks.push({ k: el.value, title: '', text: '' });
      if (act === 'sb-period') state.sb.period = +el.value || 7;
      if (act === 'sb-tpl' && el.value) {
        var stp = S.statusTemplates().filter(function (x) { return x.id === el.value; })[0];
        if (stp) {
          var old = state.sb.blocks;
          state.sb.blocks = stp.blocks.map(function (b) {
            var same = old.filter(function (o) { return o.k === b.k && o.k !== 'custom'; })[0];
            return { k: b.k, title: b.title || '', text: same ? same.text : '' };
          });
          state.sb.hl = stp.hl.slice();
          state.sb.period = stp.period || 7;
        }
      }
      refresh3b(statusBuilderHtml(), true);
      return;
    }
    if (act === 'pt-acc') {
      if (!S.setTemplateAccess(el.dataset.id, el.dataset.user, el.value || null)) toast(L('ต้องมีคนแก้เทมเพลตได้อย่างน้อยหนึ่งคน'));
      openModal(ptShareModal(el.dataset.id));
      return;
    }
    if (act === 'te-st' && state.te && state.te.ty) {
      var tst2 = state.te.ty.statuses[+el.dataset.i];
      if (tst2 && el.dataset.k === 'done') tst2.done = el.checked;
      return;
    }

    /* 2c — เงื่อนไขของค้นหาขั้นสูง (อยู่ในหน้าจอ ไม่แตะข้อมูล) */
    if (/^as-(field|op|val|val2)$/.test(act)) {
      var ai = +el.dataset.i, acn = state.adv.conds[ai];
      if (!acn) return;
      if (act === 'as-field') {
        var adef = S.filterField('*', el.value);
        var aop = adef ? S.FILTER_OPS[adef.kind][0][0] : 'is';
        state.adv.conds[ai] = { f: el.value, op: aop, v: adef ? fltDefaultV(adef.kind, aop) : [] };
      } else if (act === 'as-op') {
        var aodef = S.filterField('*', acn.f);
        var aold = JSON.stringify(fltDefaultV(aodef ? aodef.kind : '', acn.op));
        acn.op = el.value;
        if (aodef && JSON.stringify(fltDefaultV(aodef.kind, el.value)) !== aold) acn.v = fltDefaultV(aodef.kind, el.value);
      } else if (act === 'as-val') {
        if (acn.op === 'between') acn.v = [el.value || '', (acn.v && acn.v[1]) || ''];
        else if (acn.op === 'next' || acn.op === 'last') acn.v = Math.max(0, parseInt(el.value, 10) || 0);
        else if (el.type === 'number') acn.v = el.value === '' ? '' : Number(el.value);
        else acn.v = el.value;
      } else {
        acn.v = [(acn.v && acn.v[0]) || '', el.value || ''];
      }
      refreshSearch();
      return;
    }
    if (act === 'csv-enc') { readCsvFile(el.value); return; }
    if (act === 'csv-map') {
      if (state.csv && state.csv.map) state.csv.map[+el.dataset.k] = el.value;
      return;
    }
    if (act === 'bf-field') { openModal(bulkFieldModal(el.value)); return; }

    /* 2b — ตัวสร้างตัวกรอง การเรียงหลายชั้น บอร์ด สี — ทุกอย่างอยู่ในมุมมอง ไม่แตะงาน */
    if (act === 'cal-colorby' && state.route.type === 'calendar') { S.setCalPrefs({ colorBy: el.value }); return; }
    if (state.route.type === 'project' && /^(flt-|srt-key$|b-group$|b-swim$|cal-colorby$|tl-colorby$)/.test(act)) {
      var vv = viewFor(state.route.id);
      var fi = +el.dataset.i;
      var cnd = vv.filters[fi];
      if (act === 'flt-field' && cnd) {
        var fdef = S.filterField(state.route.id, el.value);
        var fop = fdef ? S.FILTER_OPS[fdef.kind][0][0] : 'is';
        vv.filters[fi] = { f: el.value, op: fop, v: fdef ? fltDefaultV(fdef.kind, fop) : [] };
      } else if (act === 'flt-op' && cnd) {
        var odef = S.filterField(state.route.id, cnd.f);
        var oldShape = JSON.stringify(fltDefaultV(odef ? odef.kind : '', cnd.op));
        cnd.op = el.value;
        if (odef && JSON.stringify(fltDefaultV(odef.kind, el.value)) !== oldShape) cnd.v = fltDefaultV(odef.kind, el.value);
      } else if (act === 'flt-val' && cnd) {
        if (cnd.op === 'between') cnd.v = [el.value || '', (cnd.v && cnd.v[1]) || ''];
        else if (cnd.op === 'next' || cnd.op === 'last') cnd.v = Math.max(0, parseInt(el.value, 10) || 0);
        else if (el.type === 'number') cnd.v = el.value === '' ? '' : Number(el.value);
        else cnd.v = el.value;
      } else if (act === 'flt-val2' && cnd) {
        cnd.v = [(cnd.v && cnd.v[0]) || '', el.value || ''];
      } else if (act === 'srt-key') {
        var sl = vv.sorts.map(function (s) { return { k: s.k, d: s.d }; });
        if (sl[fi]) sl[fi].k = el.value;
        S.setSorts(vv, sl);
      } else if (act === 'b-group') {
        vv.bGroup = el.value;
        vv.bCollapsed = {};
        if (vv.bSwim === el.value) vv.bSwim = 'none';
      } else if (act === 'b-swim') {
        vv.bSwim = el.value === vv.bGroup ? 'none' : el.value;
      } else if (act === 'cal-colorby') vv.cColorBy = el.value;
      else if (act === 'tl-colorby') vv.tColorBy = el.value;
      refreshView();
      return;
    }

    // ตัวกรอง
    if (act.indexOf('f-') === 0 && state.route.type === 'project') {
      var v = viewFor(state.route.id);
      if (act === 'f-assignee') v.assignee = el.value;
      if (act === 'f-priority') v.priority = el.value;
      if (act === 'f-tag') v.tag = el.value;
      if (act === 'f-due') v.due = el.value;
      if (act === 'f-sort') { v.sort = el.value; v.sortDir = 'asc'; }
      if (act === 'f-group') v.group = el.value;
      renderAll();
      refreshOpts();
      return;
    }

    /* select ของ Gantt ยิง change ไม่ใช่ click จึงต้องรับที่นี่
     * ถ้าไปพึ่ง switch ของ click จะไม่มีวันถูกเรียก */
    if (state.route.type === 'project' && state.route.view === 'gantt') {
      var gv = viewFor(state.route.id);
      if (act === 'g-colorby')  { gv.gColorBy  = el.value; renderViewBody(); return; }
      if (act === 'g-subtasks') { gv.gSubtasks = el.value; renderViewBody(); return; }
      if (act === 'g-zoom-set') {
        gv.gZoom = el.value;
        state.ganttScroll = null;
        renderViewBody();
        return;
      }
    }

    /* select ในหน้าต่างตั้งค่าโปรเจกต์ ก็ต้องรับที่นี่ด้วยเหตุผลเดียวกัน */
    if (act === 'set-workdays') {
      S.updateProject(el.dataset.id, { workDays: el.value });
      openModal(projectSettingsModal(el.dataset.id, 'scheduling'), true);
      renderViewBody();
      refreshOpts();
      return;
    }

    if (act === 'nf-type') {
      var ftx = S.FIELD_TYPES.filter(function (x) { return x.id === el.value; })[0];
      var wrapx = document.getElementById('nfOptWrap');
      if (wrapx) wrapx.style.display = (ftx && ftx.hasOptions) ? '' : 'none';
      var numx = document.getElementById('nfNumWrap');
      if (numx) numx.hidden = el.value !== 'number' && el.value !== 'formula';
      var fxw = document.getElementById('nfFxWrap'), rfw = document.getElementById('nfRefWrap');
      if (fxw) fxw.hidden = el.value !== 'formula';
      if (rfw) rfw.hidden = el.value !== 'ref';
      var idx2 = document.getElementById('nfIdWrap');
      if (idx2) idx2.hidden = el.value !== 'id';
      var libx = document.getElementById('nfLibWrap');
      if (libx) libx.hidden = el.value === 'id' || el.value === 'formula' || el.value === 'ref';
      return;
    }
    if (act === 'nf-kind') {
      var cw = document.getElementById('nfCurWrap'), uw = document.getElementById('nfUnitWrap');
      if (cw) cw.hidden = el.value !== 'currency';
      if (uw) uw.hidden = el.value !== 'unit';
      return;
    }
    if (act === 'sub-sort') {
      state.subView.sort = el.value;
      renderDrawer();
      return;
    }

    // แก้หลายงานพร้อมกัน
    /* Sprint 1A — clearSelUI ไม่ใช่ clearSel: บันทึกวาดจอไปแล้วตอนยังเลือกอยู่ ต้องล้างไฮไลต์บนจอด้วย */
    if (act === 'bulk-assignee' && el.value) {
      var baIds = selectedIds(), baU = el.value;
      /* คืนช่องเป็น "มอบหมายให้…" ทันที — ถ้ากดยกเลิกในหน้าต่างถาม ช่องเดิมค้างที่ชื่อคนนั้น
       * เลือกคนเดิมซ้ำจึงไม่เกิด change อะไรเลย (ยืนยันแล้วแถบวาดใหม่อยู่ดี) */
      el.value = '';
      confirmReveal(baIds, [baU], function () {          // Sprint 1B
        S.bulkUpdate(baIds, { assigneeId: baU });
        clearSelUI();
      });
      return;
    }
    if (act === 'bulk-priority' && el.value) {
      S.bulkUpdate(selectedIds(), { priority: el.value });
      clearSelUI();
      return;
    }

    if (!state.openTaskId) return;
    var id = state.openTaskId;
    var t = S.task(id);
    if (!t) return;

    switch (act) {
      case 'edit-title':
        if (el.value.trim()) S.updateTask(id, { name: el.value.trim() });
        break;
      case 'edit-notes': S.updateTask(id, { notes: el.value }); break;
      case 'edit-due': setDates(id, { dueOn: el.value || null }); break;
      case 'edit-start': setDates(id, { startOn: el.value || null }); break;
      case 'edit-duetime': S.updateTask(id, { dueTime: el.value || null }); break;
      case 'edit-starttime': S.updateTask(id, { startTime: el.value || null }); break;
      case 'edit-type': S.setTaskType(id, el.value); break;           // 3b — รวมชนิดกำหนดเอง
      case 'edit-cstatus': S.setTaskStatus(id, el.value); break;
      case 'edit-recur': {
        /* ตั้งรายสัปดาห์ครั้งแรก ให้ติ๊กวันเดียวกับกำหนดส่งไว้ก่อน จะได้เห็นว่าเลือกวันได้ */
        var days0 = (t.recur && t.recur.days) || [];
        if (el.value === 'weekly' && !days0.length) {
          days0 = [new Date((t.dueOn || S.today()) + 'T00:00:00').getDay()];
        }
        var rpatch = {
          recur: el.value ? { freq: el.value, interval: (t.recur && t.recur.interval) || 1,
                              days: el.value === 'weekly' ? days0 : [] } : null
        };
        /* Sprint 1C — ยังไม่มีกำหนดส่ง = ตั้งรอบแรกให้เลย งานจะได้ขึ้นในรายการและปฏิทิน */
        if (rpatch.recur && !t.dueOn) rpatch.dueOn = S.firstRecurDate(rpatch.recur, t.startOn);
        S.updateTask(id, rpatch);
        if (rpatch.dueOn) toast(L('ตั้งกำหนดส่งรอบแรกเป็น {d} ให้แล้ว', { d: R.fmtDate(rpatch.dueOn) }));
        break;
      }
      case 'edit-recur-n': {
        var n = parseInt(el.value, 10);
        if (!n || n < 1) n = 1;
        if (t.recur) S.updateTask(id, { recur: { freq: t.recur.freq, interval: n, days: t.recur.days || [] } });
        break;
      }
      case 'edit-dep-type':
        S.setDependencyType(id, el.dataset.blocker, el.value);
        break;
      case 'edit-field': {
        var val = el.value;
        if (el.type === 'number') val = val === '' ? null : Number(val);
        S.setFieldValue(id, el.dataset.field, val);
        break;
      }
    }
  });

  /* 3b — ช่องพิมพ์ของตัวแก้ฟอร์ม ชนิดงาน เทมเพลตงาน รายงานสถานะ และหน้าส่งฟอร์ม เก็บลงสำเนาในหน้าจอทุกตัวอักษร */
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el && el.dataset && el.dataset.act) syncDraft3b(el);
  });
  /* สมุดโน้ตส่วนตัวบันทึกเองหลังหยุดพิมพ์ครู่หนึ่ง (และตอนออกจากช่องผ่าน change) */
  var noteTimer = null;
  global.addEventListener('beforeunload', function () {
    var n = document.querySelector('.hnote');
    if (n && noteTimer) { clearTimeout(noteTimer); noteTimer = null; S.setNotepad(n.value); }
  });

  document.addEventListener('input', function (e) {
    if (e.target.classList && e.target.classList.contains('dw-title')) autoGrow(e.target);

    if (e.target.classList && e.target.classList.contains('hnote')) {
      var noteEl = e.target;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () {
        if (S.isActive()) S.setNotepad(noteEl.isConnected ? noteEl.value : (($view.querySelector('.hnote') || {}).value || ''));
      }, 900);
      return;
    }

    if (e.target.id === 'depSearch') {
      var box = document.getElementById('depResults');
      var tid = $modal.querySelector('[data-act="do-add-dependency"]');
      var owner = tid ? tid.dataset.id : state.openTaskId;
      if (box && owner) box.innerHTML = depResults(owner, e.target.value);
      return;
    }
    if (e.target.id === 'pickSearch') {
      var pbox = document.getElementById('pickResults');
      if (pbox) pbox.innerHTML = pickResults(e.target.dataset.id, e.target.dataset.mode, e.target.value);
      return;
    }

    /* ค้นในโปรเจกต์ หน่วงไว้ไม่ให้วาดใหม่ทุกตัวอักษร
     * ใน Gantt คำค้นเป็นการเน้นแถว ไม่ใช่กรองออก เพราะถ้ากรองออกจะเห็นแท่งลอย ๆ
     * ไม่มีบริบทว่างานนั้นอยู่ช่วงไหนของแผน — ganttView จัดการส่วนนั้นเอง */
    /* ค้นแท็กในเมนู วาดเฉพาะรายการข้างใน ไม่ปิดเมนูและไม่เสียโฟกัส */
    if (e.target.id === 'tagQ') {
      var tqv = e.target.value;
      var pop = e.target.closest('.pop');
      if (pop) {
        pop.innerHTML = tagMenu(e.target.dataset.id, tqv);
        var again = document.getElementById('tagQ');
        if (again) { again.focus(); again.setSelectionRange(tqv.length, tqv.length); }
      }
      return;
    }

    if (e.target.id === 'vQ') {
      var gq = e.target.value;
      clearTimeout(gSearchTimer);
      gSearchTimer = setTimeout(function () {
        viewFor(state.route.id).q = gq;
        renderAll();
        var gi2 = document.getElementById('vQ');
        if (gi2) { gi2.focus(); gi2.setSelectionRange(gq.length, gq.length); }
      }, 180);
      return;
    }

    if (e.target.id === 'bdSearch') {
      var bdBox = document.getElementById('bdResults');
      if (bdBox) bdBox.innerHTML = bulkDepResults(e.target.value);
      return;
    }

    if (e.target.id === 'searchInput') {
      var q = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        /* อยู่ในหน้าค้นหาที่มีเงื่อนไขหรือเป็นการค้นหาที่บันทึกไว้ — ลบคำค้นหมดแล้วยังอยู่หน้าเดิม */
        var keep = state.route.type === 'search' && (state.adv.conds.length || state.route.ss);
        if (q.trim() || keep) {
          state.route = { type: 'search', q: q.trim(), ss: state.route.type === 'search' ? state.route.ss : null };
          refreshSearch();
        } else if (state.route.type === 'search') {
          state.route = { type: 'home' };
          renderAll();
          var si = document.getElementById('searchInput');
          if (si) si.focus();
        }
      }, 200);
    }
  });

  var searchTimer = null;
  var gSearchTimer = null;

  /* ---------- วางหลายบรรทัดลงช่องเพิ่มงาน ----------
   *
   * คนมักมีรายการงานอยู่แล้วในอีเมล โน้ต หรือ Excel วางทีเดียวได้งานครบทุกบรรทัด
   * ไม่ต้องพิมพ์ทีละงาน ถามยืนยันก่อนเสมอ เพราะวางผิดก้อนทีเดียวได้งานขยะเป็นสิบ
   * ตัดเครื่องหมายหัวข้อ (- * • 1.) ที่ติดมาจากรายการออกให้ด้วย */
  function pasteLines(text) {
    return String(text || '').split(/\r?\n/).map(function (s) {
      return s.replace(/^\s*(?:[-*•▪◦]|\d+[.)]|\[[ xX]?\])\s+/, '').trim();
    }).filter(Boolean);
  }

  document.addEventListener('paste', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'INPUT') return;
    var ctx = null;
    if (el.id === 'subAdd') ctx = { parentId: el.dataset.id };
    else if (el.classList.contains('inline-add-input')) {
      ctx = el.dataset.mtsec ? { mtSection: el.dataset.mtsec }
        : { projectId: el.dataset.project, sectionId: el.dataset.section };
    } else if (el.id === 'askInput' && askPasteCtx) ctx = askPasteCtx;
    if (!ctx) return;
    var cd = e.clipboardData || global.clipboardData;
    var lines = pasteLines(cd ? cd.getData('text') : '');
    if (lines.length < 2) return;
    e.preventDefault();
    if (!S.can('write', ctx.parentId || null)) { denyToast(); return; }
    var preview = lines.slice(0, 5).join(' · ') + (lines.length > 5 ? ' · …' : '');
    askConfirm(L('สร้าง {n} งานจากข้อความที่วาง?', { n: lines.length }), preview, function () {
      /* วางในงานของฉัน = งานส่วนตัวมอบให้ตัวเองทั้งชุด ลงเซกชันที่พิมพ์อยู่ */
      var made = ctx.mtSection
        ? S.mtCreateTasks(lines, ctx.mtSection, ctx.extra)
        : S.createTasks(lines, ctx.projectId || null, ctx.sectionId || null, ctx.parentId || null);
      toast(L('สร้าง {n} งานแล้ว', { n: made.length }), L('ย้อนกลับ'), 'undo');
    }, { ok: L('สร้าง {n} งาน', { n: lines.length }), safe: true });
  });

  /* ---------- keyboard ---------- */

  var tabHeld = false;

  function focusSearch() {
    var si = document.getElementById('searchInput');
    if (si) si.focus();
  }



  /* ค้นหาในบันทึกการทำงาน หน่วงไว้ไม่ให้วาดใหม่ทุกตัวอักษร */
  var auditQTimer = null;
  document.addEventListener('input', function (e) {
    if (!e.target || e.target.id !== 'auditQ') return;
    var v = e.target.value;
    clearTimeout(auditQTimer);
    auditQTimer = setTimeout(function () {
      state.auditFilter.q = v;
      renderAll();
      var box = document.getElementById('auditQ');
      if (box) { box.focus(); box.setSelectionRange(v.length, v.length); }
    }, 250);
  });
  /* ค้นหารายชื่อพนักงานแบบพิมพ์ไปหาไป หน่วงไว้กันยิงทุกตัวอักษร */
  var peopleTimer = null;
  var peopleSeq = 0;
  document.addEventListener('input', function (e) {
    if (!e.target || e.target.id !== 'uSearch') return;
    var q = e.target.value;
    clearTimeout(peopleTimer);
    if (q.trim().length < 2) { renderPeople([], ''); return; }
    renderPeople([], L('กำลังค้นหา…'));
    var seq = ++peopleSeq;
    peopleTimer = setTimeout(function () {
      global.OrbitCloud.searchPeople(q).then(function (list) {
        if (seq !== peopleSeq) return;          // มีการพิมพ์ต่อแล้ว ผลนี้เก่าไปแล้ว
        renderPeople(list);
      }, function (err) {
        if (seq !== peopleSeq) return;
        renderPeople([], err && err.status === 403
          ? L('บัญชีนี้ไม่มีสิทธิ์อ่านรายชื่อพนักงาน')
          : L('ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง'));
      });
    }, 300);
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'Tab') tabHeld = false;
  });
  global.addEventListener('blur', function () { tabHeld = false; });

  document.addEventListener('keydown', function (e) {
    /* ตัวแก้ไขแบบเห็นภาพเป็น div ไม่ใช่ช่องกรอก ต้องนับเป็น "กำลังพิมพ์" ด้วย
     * ไม่งั้น Ctrl+Z, / และ Tab+ปุ่ม จะถูกแอปแย่งไปขณะพิมพ์รายละเอียด */
    var typing = ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(e.target.tagName) >= 0 ||
      !!e.target.isContentEditable;

    /* เพิ่มงานย่อยด้วยการกด Enter แล้วช่องยังโฟกัสอยู่
     * พิมพ์รายการยาว ๆ ต่อได้รวดเดียวโดยไม่ต้องกดปุ่มใหม่ทุกครั้ง */
    /* กด Enter ในช่องของหน้าต่างถาม เท่ากับกดปุ่มตกลง */
    if (e.key === 'Enter' && e.target.id === 'askInput') {
      e.preventDefault();
      var okBtn = document.querySelector('[data-act="ask-ok"]');
      if (okBtn) okBtn.click();
      return;
    }

    /* Sprint 1A — Enter ในช่องค้น/สร้างแท็ก: ตรงกับแท็กที่มีเป๊ะก็ใช้อันนั้น ไม่งั้นเอาตัวเลือกแรกในรายการ
     * (ไม่มีแท็กที่ใกล้เคียงเลย ตัวเลือกแรกคือ "สร้างแท็ก …") เดิมกด Enter แล้วไม่เกิดอะไร */
    if (e.key === 'Enter' && e.target.id === 'tagQ') {
      e.preventDefault();
      var tq = e.target.value.trim().toLowerCase();
      var tpop = e.target.closest('.pop');
      if (!tq || !tpop) return;
      var tbtns = Array.prototype.slice.call(tpop.querySelectorAll('[data-act="pick-tag"]'));
      var tpick = tbtns.filter(function (b) {
        return b.querySelector('.chip') && (b.dataset.tag || '').toLowerCase() === tq;   // .chip = แท็กที่มีอยู่แล้ว
      })[0] || tbtns[0];
      if (tpick) tpick.click();
      return;
    }

    if (e.key === 'Enter' && e.target.id === 'subAdd') {
      e.preventDefault();
      var sname = e.target.value.trim();
      if (!sname) return;
      S.createTask({ name: sname, parentId: e.target.dataset.id }, null, null);
      renderAll();
      var againS = document.getElementById('subAdd');
      if (againS) { againS.value = ''; againS.focus(); }
      return;
    }

    if (e.key === 'Escape') {
      if ($mdBack.classList.contains('open')) { if (!psGuardClose()) closeModal(); return; }     // Sprint 1C
      if (document.querySelector('.pop')) { closePops(); return; }
      if (optOpen()) { closeOpts(); return; }
      if (document.getElementById('sidebar').classList.contains('open')) { closeSidebar(); return; }
      if (selCount()) { clearSelUI(); return; }
      if (state.openTaskId) closeDrawer();
      return;
    }

    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      var box = e.target.closest && e.target.closest('.rte-compose');
      var mbox = !box && e.target.closest && e.target.closest('.rte-msg');
      if (box) {
        e.preventDefault();
        submitComposer(box);
      } else if (mbox) {
        /* Sprint 1A — ช่องเขียนประกาศ/ตอบประกาศ ก็ส่งด้วย Ctrl+Enter ได้เหมือนช่องความเห็น */
        e.preventDefault();
        var mhost = mbox.closest('.msg-new, .msg-replybox');
        var mbtn = mhost && mhost.querySelector('[data-act="post-message"], [data-act="msg-reply"]');
        if (mbtn) mbtn.click();
      } else if (e.target.dataset && e.target.dataset.save === 'notes') {
        e.preventDefault();
        e.target.blur();          // Ctrl+Enter ในรายละเอียด = บันทึกแล้วออกจากช่อง
      } else if (!typing && !$mdBack.classList.contains('open') && focusTaskId()) {
        /* Sprint 1A — Ctrl+Enter นอกช่องพิมพ์ไม่ทำเครื่องหมายเสร็จอีกแล้ว
         * ผู้ทดสอบตั้งใจส่งความเห็นแต่ช่องไม่ได้โฟกัสอยู่ กดแล้วงาน (ที่รออนุมัติ) กลายเป็นเสร็จโดยไม่รู้ตัว
         * ทำเครื่องหมายเสร็จย้ายไป Tab+Y — ตรงนี้แค่บอกว่าต้องทำยังไง */
        e.preventDefault();
        toast(state.openTaskId ? L('คลิกช่องความเห็นก่อน แล้วกด Ctrl+Enter เพื่อส่ง · ทำเครื่องหมายว่าเสร็จใช้ Tab+Y')
                               : L('ทำเครื่องหมายว่าเสร็จใช้ Tab+Y'));
      }
      return;
    }

    /* แป้นภาษาไทย: ดูตำแหน่งปุ่ม (e.code) ไม่ใช่ตัวอักษรที่ได้ — Ctrl+Z / Ctrl+/ ด้วย */
    var kc = keyOf(e);
    if (e.ctrlKey && kc === 'z' && !typing) {
      e.preventDefault();
      if (!S.can('write')) { denyToast(); return; }
      doUndo();
      return;
    }
    if (e.ctrlKey && (e.key === '/' || kc === '/')) {
      e.preventDefault();
      openModal(shortcutsModal(), true);
      return;
    }
    /* Sprint 1A — "?" (Shift+/) เปิดหน้าคีย์ลัดเหมือนแอปทั่วไป เฉพาะตอนไม่ได้พิมพ์อยู่
     * ดูตำแหน่งปุ่มด้วย แป้นไทย Shift+/ ไม่ได้ตัว "?" */
    if ((e.key === '?' || (kc === '/' && e.shiftKey)) && !typing && !e.ctrlKey && !e.metaKey && !e.altKey &&
        !tabHeld && !$mdBack.classList.contains('open')) {
      e.preventDefault();
      openModal(shortcutsModal(), true);
      return;
    }

    /* 2b — คีย์ลัดของมุมมองรายการ ใช้กับแถวที่ถูกชี้ (คลิกหรือเลือกล่าสุด)
     *   Enter / Shift+Enter       เพิ่มงานใต้ / เหนือแถวนั้น
     *   Ctrl+↑ / Ctrl+↓           เลื่อนงานขึ้นลงในคอลัมน์
     *   Ctrl+Shift+↑ / ↓          ย้ายงานไปคอลัมน์ก่อนหน้า / ถัดไป */
    var inList = state.route.type === 'project' && state.route.view === 'list' && !typing &&
      state.cursor && !$mdBack.classList.contains('open');
    if (inList && e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey &&
        ['BUTTON', 'A'].indexOf(e.target.tagName) < 0) {
      if (!S.can('write') || !S.canInProject(state.route.id, 'edit')) { denyToast(); return; }
      if (addNear(state.cursor, e.shiftKey)) { e.preventDefault(); return; }
    }
    if (inList && (e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      if (!S.can('write', state.cursor)) { denyToast(); return; }
      moveCursorTask(e.key === 'ArrowUp' ? -1 : 1, e.shiftKey);
      return;
    }

    // Tab + key แบบ Asana
    if (e.key === 'Tab' && !typing && S.pref('shortcuts')) {
      tabHeld = true;
      e.preventDefault();
      return;
    }
    if (tabHeld && !typing) {
      var k = kc;
      var handled = true;
      var ft = focusTaskId();
      if (k === 'h') { state.route = { type: 'home' }; clearSel(); renderAll(); }
      /* 2c — คีย์ลัดของงาน ใช้กับงานที่เปิดอยู่ ไม่มีก็แถวที่ถูกชี้/เลือกไว้ */
      else if (k === 'o') { toggleSidebarCollapse(); }
      else if (k === 'enter') {
        if (ft) openTask(ft); else toast(L('เลือกงานก่อน (คลิกแถว หรือใช้ลูกศรขึ้นลง)'));
      } else if ((k === 'delete' || k === 'backspace') && ft) {
        if (!S.can('write', ft)) { denyToast(); return; }
        var dT = S.task(ft);
        askConfirm(L('ลบงาน “{t}”?', { t: dT.name }), '', function () {
          if (state.openTaskId === ft) state.openTaskId = null;
          S.deleteTask(ft);
          delete state.sel[ft];
          if (state.cursor === ft) state.cursor = null;
          renderAll();
          toast(L('ย้ายไปถังขยะแล้ว'), L('ย้อนกลับ'), 'undo');
        }, { ok: L('ลบ') });
      } else if (k === 'd' && !e.shiftKey) {
        withDrawer(function () {
          var dd = $drawer.querySelector('[data-act="edit-due"]');
          if (!dd) return;
          dd.focus();
          try { if (dd.showPicker) dd.showPicker(); } catch (er) { /* บางเบราว์เซอร์ไม่ให้เปิดเอง */ }
        });
      } else if (k === 'a' && !e.shiftKey) {
        withDrawer(function (id) {
          if (!S.can('write', id)) { denyToast(); return; }
          var pa = $drawer.querySelector('[data-act="pick-assignee"]');
          if (pa) pa.click();
        });
      } else if (k === 't') {
        withDrawer(function (id) {
          if (!S.can('comment', id)) { denyToast(); return; }
          var at = $drawer.querySelector('[data-act="add-tag"]');
          if (at) at.click();
        });
      } else if (k === 'p' && ft) {
        if (!S.can('write', ft)) { denyToast(); return; }
        if (S.isPrivate(ft) && !S.task(ft).parentId) openModal(makePublicModal(ft));
        else openModal(addHomeModal(ft));
      } else if (k === 's' && !e.shiftKey) {
        withDrawer(function (id) {
          if (!S.can('write', id)) { denyToast(); return; }
          var sa = document.getElementById('subAdd');
          if (sa) { sa.scrollIntoView({ block: 'center' }); sa.focus(); }
        });
      } else if (k === 'f' && !e.shiftKey) {
        withDrawer(function (id) {
          if (!S.can('comment', id)) { denyToast(); return; }
          var pf = $drawer.querySelector('[data-act="pick-follower"]');
          if (pf) pf.click();
        });
      } else if ((k === 'j' || k === 'l') && ft) {
        if (!S.can('comment', ft)) { denyToast(); return; }
        var jt = S.task(ft), meId = S.db.currentUserId;
        var isF = jt.followers.indexOf(meId) >= 0;
        if ((k === 'j') !== isF) S.toggleFollower(ft, meId);
        toast(k === 'j' ? L('ติดตามงานนี้แล้ว') : L('เลิกติดตามงานนี้แล้ว'));
      } else if (k === 'k' && ft) {
        if (!S.can('comment', ft)) { denyToast(); return; }
        S.toggleLike(ft);
        toast(S.task(ft).likes.indexOf(S.db.currentUserId) >= 0 ? L('ถูกใจแล้ว') : L('เลิกถูกใจแล้ว'));
      } else if (k === 'r') {
        withDrawer(function (id) {
          if (!S.can('write', id)) { denyToast(); return; }
          var rn = $drawer.querySelector('.rte[data-save="notes"]');
          if (rn) { rn.scrollIntoView({ block: 'center' }); global.RichText.focusEnd(rn); }
        });
      }
      else if (k === 'y') {
        /* Sprint 1A — Tab+Y ทำเครื่องหมายว่าเสร็จ/เปิดใหม่ (แทน Ctrl+Enter นอกช่องพิมพ์ ที่ชนกับการส่งความเห็น) */
        if (!ft) toast(L('เลือกงานก่อน (คลิกแถว หรือใช้ลูกศรขึ้นลง)'));
        else if (!S.can('write', ft)) { denyToast(); return; }
        else toggleDone(ft);
      }
      else if (k === 'z') { state.route = { type: 'mytasks' }; clearSel(); renderAll(); }
      else if (k === 'i') { state.route = { type: 'inbox' }; clearSel(); renderAll(); }
      else if (k === 'q' && state.route.type === 'project') {
        var qp2 = S.project(state.route.id);
        if (!S.canCreateTask(qp2 && qp2.id)) { denyToast(); return; }     // Sprint 1B — สิทธิ์ของโปรเจกต์ด้วย
        askText(L('ชื่องานใหม่'), '', function (v) {
          var qt2 = v ? S.createTask({ name: v }, qp2.id, qp2.sections[0].id) : null;
          if (qt2) openTask(qt2.id);
        }, { ok: L('เพิ่มงาน'), pasteCtx: { projectId: qp2.id, sectionId: qp2.sections[0].id } });
      } else if (k === 'q' && state.route.type === 'mytasks') {
        /* Tab+Q ในงานของฉัน = งานส่วนตัวใหม่ ลง "เพิ่งได้รับมอบหมาย" */
        if (!S.can('write')) { denyToast(); return; }
        askText(L('ชื่องานใหม่'), '', function (v) {
          var mq = v ? S.mtCreateTasks([v], S.MT_RECENT) : [];
          if (mq[0]) openTask(mq[0].id);
        }, { ok: L('เพิ่มงาน'), pasteCtx: { mtSection: S.MT_RECENT } });
      } else if (k === 'n' && state.route.type === 'project') {
        /* Tab+N = เพิ่มคอลัมน์ (เซกชัน) ใหม่ในโปรเจกต์ */
        if (!S.can('structure') || !S.canInProject(state.route.id, 'edit')) { denyToast(); return; }
        var nPid = state.route.id;
        askText(L('ชื่อเซกชันใหม่'), '', function (v) { if (v) S.addSection(nPid, v); });
      } else if (k === 'm' && state.openTaskId) {
        if (!S.can('write', state.openTaskId)) { denyToast(); return; }
        S.updateTask(state.openTaskId, { assigneeId: S.db.currentUserId });
        toast(L('มอบหมายให้ตัวเองแล้ว'));
      } else if (k === 'f' && e.shiftKey && state.openTaskId) {
        /* Shift+Tab+F = สร้างงานติดตามผลของงานที่เปิดอยู่ แบบเดียวกับ Asana */
        if (!S.can('write')) { denyToast(); return; }
        openModal(followUpModal(state.openTaskId));
      } else if (k === 'c' && state.openTaskId) {
        global.RichText.focusEnd(document.getElementById('commentInput'));
      } else if (k === 'x' && state.openTaskId) {
        /* Asana ใช้ Tab+X ขยายงานเต็มจอ — เปิดงานอยู่ก็ทำแบบนั้น ไม่ได้เปิดงานค่อยสลับธีม */
        state.dwWide = !state.dwWide;
        renderDrawer();
      } else if (k === 'x') {
        /* ธีมเป็นค่าของแต่ละคน (prefs) เดิมเขียนลง db.settings ซึ่งถูกย้ายออกไปแล้ว
         * กดแล้วจึงไม่มีอะไรเปลี่ยน ทั้งที่ขึ้นข้อความว่าสลับแล้ว */
        var curT = S.pref('theme') || 'auto';
        if (curT === 'auto') {
          curT = global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        S.setPref('theme', curT === 'dark' ? 'light' : 'dark');
        applyTheme();
        toast(L('สลับธีมแล้ว'));
      } else { handled = false; }
      if (handled) { e.preventDefault(); tabHeld = false; return; }
    }

    if ((e.key === '/' || (kc === '/' && !e.shiftKey)) && !typing && !e.ctrlKey && !e.metaKey) {
      focusSearch(); e.preventDefault(); return;
    }

    var noMod = !e.ctrlKey && !e.metaKey && !e.altKey && !tabHeld;
    var modalOpen = $mdBack.classList.contains('open') || !!document.querySelector('.pop');

    /* 2c — กล่องแจ้งเตือน J/K เลื่อน F บุ๊กมาร์ก I เก็บ U อ่านแล้ว/ยังไม่อ่าน (แป้นไทยใช้ได้ผ่าน e.code) */
    if (state.route.type === 'inbox' && !typing && noMod && !modalOpen && !e.shiftKey &&
        ['j', 'k', 'f', 'i', 'u'].indexOf(kc) >= 0) {
      if (inboxKey(kc)) { e.preventDefault(); return; }
    }
    if (state.route.type === 'inbox' && !typing && noMod && !modalOpen && e.key === 'Enter' && state.inbox.cur) {
      if (inboxKey('enter')) { e.preventDefault(); return; }
    }

    /* 2c — ↑/↓ เปลี่ยนงานที่เลือก (แผงงานเปิดอยู่ก็เปิดงานถัดไปตาม) */
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !typing && noMod && !e.shiftKey && !modalOpen &&
        state.route.type !== 'inbox') {
      if (moveSelection(e.key === 'ArrowUp' ? -1 : 1)) { e.preventDefault(); return; }
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && selCount()) {
      e.preventDefault();
      var ids2 = selectedIds();
      /* ทุกงานที่เลือกต้องแก้ได้ (เดิมตรวจแค่บทบาท กด Delete ลบงานในโปรเจกต์ที่แสดงความเห็นได้อย่างเดียวได้) */
      if (!ids2.every(function (x) { return S.can('write', x); })) { denyToast(); return; }
      askConfirm(L('ลบ {n} งาน?', { n: ids2.length }), '', function () {
        S.deleteTasks(ids2);
        clearSel();
        renderAll();
        toast(L('ย้ายไปถังขยะแล้ว'), L('ย้อนกลับ'), 'undo');
      }, { ok: L('ลบ') });
    }
  });

  /* ---------- ลากแท่งบนไทม์ไลน์ ----------
   * ใช้ mouse event ตรง ๆ ไม่ใช้ HTML5 drag-and-drop เพราะอันนั้นถูกใช้กับการ์ดอยู่แล้ว
   * และเราต้องการ preview ที่ขยับตามเมาส์แบบทันที
   */

  var tlDrag = null;

  function tipEl() {
    var tip = document.getElementById('tlTip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'tlTip';
      tip.className = 'tl-tip';
      document.body.appendChild(tip);
    }
    return tip;
  }
  function hideTip() {
    var t = document.getElementById('tlTip');
    if (t) t.parentNode.removeChild(t);
  }

  /** วันที่ที่จะได้ ถ้าปล่อยเมาส์ตอนนี้ */
  function previewDates(d) {
    var s = tlDrag.startOn, u = tlDrag.dueOn;
    if (tlDrag.role === 'move') {
      if (s) s = S.addDays(s, d);
      if (u) u = S.addDays(u, d);
    } else if (tlDrag.role === 'start') {
      s = S.addDays(s || u, d);
      if (u && s > u) s = u;
    } else {
      u = S.addDays(u || s, d);
      if (s && u < s) u = s;
    }
    if (tlDrag.milestone) return R.fmtDate(u);
    return (s ? R.fmtDate(s) + ' → ' : '') + R.fmtDate(u);
  }

  var colDrag = null;   // สถานะระหว่างลากปรับความกว้างคอลัมน์

  var MIN_COL = 90;

  /** อ่าน template ปัจจุบันออกมาเป็นตัวเลข px ทีละคอลัมน์ */
  function colSizes(tbl) {
    return getComputedStyle(tbl.querySelector('.tbl-head'))
      .gridTemplateColumns.split(' ').map(parseFloat);
  }

  var gLink = null;   // สถานะระหว่างลากเส้นสร้างลำดับก่อนหลัง

  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0 || !e.target.closest) return;

    // ลากขอบหัวคอลัมน์เพื่อปรับความกว้าง (ใช้ได้ทั้งเมาส์และนิ้ว)
    var grip = e.target.closest('.col-resize, .g-left-grip');
    if (grip) {
      var pane = grip.closest('.g-left');
      if (pane) {
        e.preventDefault();
        e.stopPropagation();
        colDrag = {
          pane: pane, key: grip.dataset.col || 'gLeft',
          extra: parseInt(grip.dataset.extra, 10) || 0,   // คอลัมน์อื่นกว้างรวมเท่าไร
          startX: e.clientX,
          w0: pane.getBoundingClientRect().width
        };
        document.body.classList.add('col-resizing');
        return;
      }
      var tbl = grip.closest('.tbl');
      var th = grip.closest('.th');
      if (!tbl || !th) return;
      e.preventDefault();
      e.stopPropagation();
      var idx = Array.prototype.indexOf.call(th.parentNode.children, th);
      colDrag = {
        tbl: tbl, key: grip.dataset.col, idx: idx,
        startX: e.clientX,
        sizes: colSizes(tbl),
        w0: th.getBoundingClientRect().width
      };
      document.body.classList.add('col-resizing');
      return;
    }

    if (isTouch()) return;   // นิ้วเลื่อนจอ ไม่ใช่เจตนาลากแท่ง

    // ลากจากจุดวงกลมปลายแท่ง = สร้างลำดับ ต้องเช็คก่อนการลากแท่ง
    var dot = e.target.closest('.g-dot');
    if (dot) {
      if (!S.can('write', dot.dataset.tid)) return;   // ลากสร้างลำดับก่อนหลังก็คือการแก้งาน
      var rowsEl = dot.closest('.g-rows');
      if (!rowsEl) return;
      e.preventDefault();
      e.stopPropagation();
      var rb = rowsEl.getBoundingClientRect();
      var db = dot.getBoundingClientRect();
      gLink = {
        fromId: dot.dataset.tid,
        anchor: dot.dataset.anchor,
        rows: rowsEl,
        path: rowsEl.querySelector('.g-rubber-line'),
        x0: db.left + db.width / 2 - rb.left,
        y0: db.top + db.height / 2 - rb.top
      };
      dot.classList.add('on');
      rowsEl.classList.add('g-linking');
      return;
    }

    var bar = e.target.closest('.tl-bar, .tl-milestone, .g-bar, .g-ms');
    if (!bar) return;
    var isG = bar.classList.contains('g-bar') || bar.classList.contains('g-ms');
    var handle = e.target.closest('.tl-handle, .g-h');
    var tid = (handle && handle.dataset.tid) || bar.dataset.tid;
    var t = S.task(tid);
    if (!t) return;
    if (!S.can('write', tid)) return;   // ลากแท่งในไทม์ไลน์ก็คือการแก้วันที่

    e.preventDefault();
    tlDrag = {
      el: bar,
      id: tid,
      role: handle ? handle.dataset.role : 'move',
      milestone: bar.classList.contains('tl-milestone') || bar.classList.contains('g-ms'),
      movingClass: isG ? 'g-moving' : 'tl-moving',
      startX: e.clientX,
      left0: parseFloat(bar.style.left) || 0,
      width0: parseFloat(bar.style.width) || 0,
      startOn: t.startOn,
      dueOn: t.dueOn,
      /* ความกว้างต่อวัน อ่านจาก data-w ที่ผังวาดไว้จริง ไม่ใช่ค่าที่เดาจาก state
       * ระดับซูมของ Gantt ย้ายไปอยู่ในมุมมองแล้ว ถ้าอ่านผิดที่
       * ลากหนึ่งวันจะกลายเป็นห้าวันโดยไม่มีอะไรฟ้อง */
      dayW: isG ? ganttDayW() : (R.ZOOMS[state.tlZoom] || R.ZOOMS.day),
      delta: 0,
      moved: false
    };
    if (tlDrag.milestone) tlDrag.role = 'move';
  });

  document.addEventListener('mousemove', function (e) {
    if (colDrag) {
      var w = Math.max(MIN_COL, colDrag.w0 + (e.clientX - colDrag.startX));
      colDrag.last = w;
      if (colDrag.pane) {
        colDrag.pane.style.width = w + 'px';
        var body = colDrag.pane.parentNode;
        var right = body.querySelector('.g-right');
        if (right) body.style.width = (w + right.getBoundingClientRect().width) + 'px';
        return;
      }
      var sizes = colDrag.sizes.slice();
      sizes[colDrag.idx] = w;
      colDrag.last = w;
      colDrag.tbl.style.setProperty('--tpl',
        sizes.map(function (x) { return x + 'px'; }).join(' '));
      return;
    }
    if (gLink) {
      var rb = gLink.rows.getBoundingClientRect();
      var x = e.clientX - rb.left, y = e.clientY - rb.top;
      if (gLink.path) {
        gLink.path.setAttribute('d', 'M' + gLink.x0 + ' ' + gLink.y0 +
          ' L' + x + ' ' + y);
      }
      return;
    }
    if (!tlDrag) return;
    var dx = e.clientX - tlDrag.startX;
    if (Math.abs(dx) > 3) tlDrag.moved = true;
    var d = Math.round(dx / tlDrag.dayW);
    tlDrag.delta = d;

    var el = tlDrag.el;
    el.classList.add(tlDrag.movingClass);
    var w = tlDrag.dayW;

    if (tlDrag.role === 'move') {
      el.style.left = (tlDrag.left0 + d * w) + 'px';
    } else if (tlDrag.role === 'start') {
      var nw = tlDrag.width0 - d * w;
      if (nw >= w) {
        el.style.left = (tlDrag.left0 + d * w) + 'px';
        el.style.width = nw + 'px';
      }
    } else {
      var nw2 = tlDrag.width0 + d * w;
      if (nw2 >= w) el.style.width = nw2 + 'px';
    }

    var tip = tipEl();
    tip.textContent = previewDates(d);
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top = (e.clientY - 32) + 'px';
  });

  document.addEventListener('mouseup', function (e) {
    if (colDrag) {
      var d = colDrag;
      colDrag = null;
      document.body.classList.remove('col-resizing');
      if (d.last && Math.abs(d.last - d.w0) > 1) {
        lastDragEnd = Date.now();
        /* ค่าที่เก็บคือความกว้างของช่องชื่อ ไม่ใช่ความกว้างรวมของแผงซ้าย
         * ต้องหักคอลัมน์อื่นออกก่อน ไม่งั้นพอเปิดคอลัมน์เพิ่มแผงจะโตซ้ำซ้อน */
        S.setColWidth(state.route.id, d.key, Math.max(120, d.last - (d.extra || 0)));
      }
      return;
    }
    if (gLink) {
      var link = gLink;
      gLink = null;
      if (link.path) link.path.setAttribute('d', '');
      if (link.rows) link.rows.classList.remove('g-linking');
      Array.prototype.forEach.call(document.querySelectorAll('.g-dot.on'),
        function (d) { d.classList.remove('on'); });
      var over = document.elementFromPoint(e.clientX, e.clientY);
      var tbar = over && over.closest ? over.closest('.g-bar, .g-ms') : null;
      var tdot = over && over.closest ? over.closest('.g-dot') : null;
      if (tbar && tbar.dataset.tid && tbar.dataset.tid !== link.fromId) {
        var toAnchor = tdot ? tdot.dataset.anchor : 'start';
        var type = (link.anchor === 'end' ? 'F' : 'S') +
                   (toAnchor === 'end' ? 'F' : 'S');
        lastDragEnd = Date.now();
        if (S.addDependency(tbar.dataset.tid, link.fromId, type)) {
          toast(L('สร้างลำดับแบบ') + ' ' + type + ' ' + L('แล้ว'), L('ย้อนกลับ'), 'undo');
        } else {
          toast(L('สร้างไม่ได้ — ซ้ำเดิม หรือจะทำให้เกิดการรอวนกัน'));
        }
      }
      return;
    }
    if (!tlDrag) return;
    var drag2 = tlDrag;
    tlDrag = null;
    hideTip();
    drag2.el.classList.remove(drag2.movingClass || 'tl-moving');

    var d = drag2.delta;
    if (!drag2.moved || !d) return;
    lastDragEnd = Date.now();

    var patch = {};
    if (drag2.role === 'move') {
      if (drag2.startOn) patch.startOn = S.addDays(drag2.startOn, d);
      if (drag2.dueOn) patch.dueOn = S.addDays(drag2.dueOn, d);
    } else if (drag2.role === 'start') {
      var ns = S.addDays(drag2.startOn || drag2.dueOn, d);
      if (drag2.dueOn && ns > drag2.dueOn) ns = drag2.dueOn;
      patch.startOn = ns;
    } else {
      var nd = S.addDays(drag2.dueOn || drag2.startOn, d);
      if (drag2.startOn && nd < drag2.startOn) nd = drag2.startOn;
      patch.dueOn = nd;
    }
    S.updateTask(drag2.id, patch);

    /* งานที่พึ่งพากันต้องขยับตามโหมดที่โปรเจกต์ตั้งไว้
     * ทำหลัง updateTask เพื่อให้ snapshot ของ undo ครอบทั้งการเลื่อนต้นทางและปลายทาง
     * กด Ctrl+Z ครั้งเดียวจึงกลับมาทั้งชุด ไม่ใช่ต้องกดทีละงาน
     * ส่งเฉพาะระยะที่เลื่อนจริง ๆ (role move) เพราะการยืดหด ระยะเลื่อนคือศูนย์ */
    var chain = [];
    if (state.route.type === 'project') {
      var pd = S.project(state.route.id);
      var ds2 = (pd && pd.depShift) || { mode: 'consume', scope: 'downstream' };
      /* ยืดหดไม่ใช่การเลื่อน จึงไม่มีระยะให้รักษา ใช้กติกากินระยะห่างแทน
       * คือแก้เฉพาะจุดที่ชนกันจริง ไม่ลากงานอื่นไปทั้งสาย */
      var mode2 = (ds2.mode === 'maintain' && drag2.role !== 'move') ? 'consume' : ds2.mode;
      chain = S.autoSchedule(drag2.id, d, {
        mode: mode2, scope: ds2.scope, workDays: pd ? pd.workDays : 'all'
      });
    }
    renderViewBody();
    toast(chain.length
      ? L('เลื่อนวันแล้ว และดันงานที่รออยู่ต่ออีก {n} งาน', { n: chain.length })
      : L('เลื่อนวันแล้ว'), L('ย้อนกลับ'), 'undo');
  });

  /* ---------- drag & drop (การ์ดและแถว) ---------- */

  var drag = { id: null };

  document.addEventListener('dragstart', function (e) {
    if (isTouch()) return;
    var el = e.target.closest ? e.target.closest('[draggable="true"]') : null;
    if (!el || !el.dataset.id) return;
    if (!S.can('write', el.dataset.id)) return;   // ลากย้ายก็คือการแก้งาน
    drag.id = el.dataset.id;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', drag.id); } catch (err) { /* ie */ }
  });

  document.addEventListener('dragend', function () {
    drag.id = null;
    clearDragMarks();
  });

  function clearDragMarks() {
    Array.prototype.forEach.call(
      document.querySelectorAll('.dragging,.drop-before,.drag-over,.drop-into'),
      function (x) { x.classList.remove('dragging', 'drop-before', 'drag-over', 'drop-into'); }
    );
  }

  /** พื้นที่วางของรายการ/บอร์ด — คอลัมน์ของโปรเจกต์ (data-section) หรือกลุ่มตามฟิลด์ (data-gby) */
  function dropZone(target) {
    var zone = target.closest ? target.closest('.col-body, .sec-body') : null;
    return zone && (zone.dataset.section || zone.dataset.gby) ? zone : null;
  }

  document.addEventListener('dragover', function (e) {
    if (!drag.id) return;
    var zone = dropZone(e.target);
    if (!zone) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    Array.prototype.forEach.call(document.querySelectorAll('.drop-before'), function (x) {
      x.classList.remove('drop-before');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.drag-over, .drop-into'), function (x) {
      x.classList.remove('drag-over', 'drop-into');
    });
    var col = zone.closest('.col');
    if (col) col.classList.add('drag-over');
    else zone.classList.add('drag-over');

    /* แถวในมุมมองรายการแบ่งเป็นสามแถบ — ขอบบนกับขอบล่างคือสลับลำดับ
     * ส่วนกลางแถวคือวางเป็นงานย่อยของแถวนั้น แบบเดียวกับลากไฟล์ลงโฟลเดอร์ */
    var over = e.target.closest('.card, .row, .tr');
    if (over && over.dataset.id !== drag.id && !over.classList.contains('sub')) {
      var r = over.getBoundingClientRect();
      var rel = (e.clientY - r.top) / r.height;
      if (over.classList.contains('tr') && rel > 0.28 && rel < 0.72) over.classList.add('drop-into');
      else if (rel < 0.5) over.classList.add('drop-before');
      else {
        var nx = over.nextElementSibling;
        while (nx && nx.classList.contains('sub')) nx = nx.nextElementSibling;
        if (nx) nx.classList.add('drop-before');
      }
    }
  });

  document.addEventListener('drop', function (e) {
    if (!drag.id) return;
    var zone = dropZone(e.target);
    if (!zone) return;
    e.preventDefault();

    var toSection = zone.dataset.section;
    var marker = document.querySelector('.drop-before');
    var beforeId = marker ? marker.dataset.id : null;
    var into = document.querySelector('.drop-into');
    var intoId = into ? into.dataset.id : null;
    var movingId = drag.id;

    clearDragMarks();
    drag.id = null;

    if (intoId && intoId !== movingId) {
      if (S.setParent(movingId, intoId)) {
        toast(L('ย้ายเป็นงานย่อยของ “{t}” แล้ว', { t: S.task(intoId).name }), L('ย้อนกลับ'), 'undo');
      } else if (!justDenied()) toast(L('ย้ายไม่ได้ — งานที่เลือกเป็นงานย่อยของงานนี้อยู่แล้ว'));
      return;
    }
    /* งานของฉัน — ย้ายเข้าเซกชันส่วนตัว ไม่แตะคอลัมน์ของโปรเจกต์ */
    if (state.route.type === 'mytasks') {
      if (!toSection) return;
      if (S.mtMove(movingId, toSection, beforeId !== movingId ? beforeId : null)) {
        var msec = S.mtSection(toSection);
        toast(L('ย้ายไป “{s}” แล้ว', { s: msec && msec.name ? L(msec.name) : recentLabel() }),
          L('ย้อนกลับ'), 'undo');
      }
      return;
    }
    if (state.route.type !== 'project') return;
    var pid = state.route.id;
    /* ลากการ์ดที่เลือกไว้หลายใบ = ย้ายทั้งชุด */
    var ids = state.sel[movingId] && selCount() > 1 ? selectedIds() : [movingId];
    ids = ids.filter(function (x) { return S.can('write', x) && S.projectsOfTask(x).some(function (m) { return m.project.id === pid; }); });
    if (!ids.length) return;
    var sets = [];
    if (zone.dataset.gby) sets.push({ by: zone.dataset.gby, key: zone.dataset.gkey || '' });
    else if (toSection) sets.push({ by: 'section', key: toSection });
    if (zone.dataset.lby) sets.push({ by: zone.dataset.lby, key: zone.dataset.lkey || '' });
    if (ids.length === 1 && sets.length === 1 && sets[0].by === 'section') {
      S.moveTask(movingId, pid, sets[0].key, beforeId);
      return;
    }
    var dropNow = function () {
      if (S.dropToGroups(ids, pid, sets, beforeId !== movingId ? beforeId : null) && ids.length > 1) {
        clearSel();
        renderAll();
        toast(L('ย้าย {n} งานแล้ว', { n: ids.length }), L('ย้อนกลับ'), 'undo');
      }
    };
    /* ลากลงคอลัมน์/แถวของผู้รับผิดชอบ (บอร์ดจัดกลุ่มตามผู้รับผิดชอบ) = มอบงานให้คนนั้น
     * เดิมมอบเงียบ ๆ แม้เขาไม่ได้เป็นสมาชิกโปรเจกต์ปิด ตอนนี้ถามก่อนแบบเดียวกับเลือกผู้รับผิดชอบในแผงงาน
     * การ์ดยังไม่ได้ขยับจริงจนกว่าข้อมูลเปลี่ยน กดยกเลิก = การ์ดอยู่ที่เดิม
     * ลากไม่ได้อยู่แล้ว (สิทธิ์ไม่พอ) ไม่ต้องถาม ให้ dropToGroups ปฏิเสธพร้อมเหตุผลเหมือนเดิม */
    var toUsers = sets.filter(function (s) { return s.by === 'assignee' && s.key; }).map(function (s) { return s.key; });
    if (toUsers.length && S.canArrangeIn(pid)) confirmReveal(ids, toUsers, dropNow);
    else dropNow();
  });


  /* ---------- ลากในปฏิทินสัปดาห์/เดือน (R.calBoard) ----------
   * ลากแถบหรือรายการ "ยังไม่มีวัน" ลงวัน — เลื่อนทั้งแท่งเท่ากับระยะที่ลาก (จับกลางแถบก็ไม่กระโดด)
   * ลากกลับไปแถบข้าง = เอาวันออก ทุกอย่างย้อนกลับได้ */
  var calDrag = null;

  document.addEventListener('dragstart', function (e) {
    if (isTouch()) return;
    var el = e.target.closest ? e.target.closest('.calx-drag') : null;
    if (!el) return;
    if (!S.can('write', el.dataset.id)) { e.preventDefault(); denyToast(); return; }
    var row = el.closest('.calx-row');
    calDrag = { id: el.dataset.id, grab: row ? calxDateAt(row, e.clientX) : null };
  });

  document.addEventListener('dragend', function () {
    calDrag = null;
    clearCalMarks();
  });

  function clearCalMarks() {
    Array.prototype.forEach.call(document.querySelectorAll('.calx-day.drop-day, .calx-side.drop-side'),
      function (x) { x.classList.remove('drop-day', 'drop-side'); });
  }

  document.addEventListener('dragover', function (e) {
    if (!calDrag) return;
    var row = e.target.closest ? e.target.closest('.calx-row') : null;
    var side = !row && e.target.closest ? e.target.closest('.calx-side') : null;
    if (!row && !side) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearCalMarks();
    if (side) { side.classList.add('drop-side'); return; }
    var col = calxDays(row).indexOf(calxDateAt(row, e.clientX));
    var cell = row.querySelectorAll('.calx-day')[col];
    if (cell) cell.classList.add('drop-day');
  });

  document.addEventListener('drop', function (e) {
    if (!calDrag) return;
    var row = e.target.closest ? e.target.closest('.calx-row') : null;
    var side = !row && e.target.closest ? e.target.closest('.calx-side') : null;
    if (!row && !side) return;
    e.preventDefault();
    var cdg = calDrag;
    calDrag = null;
    clearCalMarks();
    lastDragEnd = Date.now();
    var t = S.task(cdg.id);
    if (!t) return;
    if (side) {
      if (S.moveTaskDates(t.id, null)) toast(L('เอาวันออกแล้ว'), L('ย้อนกลับ'), 'undo');
      return;
    }
    var dropAt = calxDateAt(row, e.clientX);
    var end = t.dueOn || t.startOn;
    var nd = end && cdg.grab ? S.addDays(end, S.daysBetween(cdg.grab, dropAt)) : dropAt;
    var prevEnd = t.dueOn || t.startOn;
    var scopeD = calxScope(row);
    if (scopeD !== 'mt' && prevEnd && t.dueOn !== nd) {
      /* 3c — ลากในปฏิทินโปรเจกต์หรือปฏิทินรวม = เลื่อนวัน ถ้ามีงานที่รออยู่ต้องขยับตาม
       * เปิดหน้าต่างให้ดูรายการก่อน (setDates) ใช้แล้วย้อนกลับได้ในครั้งเดียว */
      var cpatch = { dueOn: nd };
      if (t.startOn) cpatch.startOn = S.addDays(t.startOn, S.daysBetween(prevEnd, nd));
      setDates(t.id, cpatch, function (n) {
        if (!n) toast(L('ครบกำหนด {d} แล้ว', { d: R.fmtDate(nd) }), L('ย้อนกลับ'), 'undo');
      });
      return;
    }
    if (S.moveTaskDates(t.id, nd)) {
      /* งานของฉันไม่ขยับงานของคนอื่น */
      toast(L('ครบกำหนด {d} แล้ว', { d: R.fmtDate(nd) }), L('ย้อนกลับ'), 'undo');
    }
  });

  /* ---------- ไทม์ไลน์: ลากงานที่ยังไม่มีวันจากแถบข้างลงผัง ---------- */
  var tlUn = null;

  document.addEventListener('dragstart', function (e) {
    if (isTouch()) return;
    var el = e.target.closest ? e.target.closest('.tl-un') : null;
    if (!el) return;
    if (!S.can('write', el.dataset.id)) { e.preventDefault(); denyToast(); return; }
    tlUn = el.dataset.id;
  });

  document.addEventListener('dragend', function () {
    tlUn = null;
    var ln = document.querySelector('.tl-drop-line');
    if (ln) ln.hidden = true;
    hideTip();
  });

  function tlDropDate(grid, x) {
    var w = +grid.dataset.w || 28;
    var i = Math.max(0, Math.floor((x - grid.getBoundingClientRect().left) / w));
    return { i: i, w: w, date: S.addDays(grid.dataset.from, i) };
  }

  document.addEventListener('dragover', function (e) {
    if (!tlUn) return;
    var grid = e.target.closest ? e.target.closest('.tl-grid') : null;
    if (!grid) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var at = tlDropDate(grid, e.clientX);
    var ln = grid.querySelector('.tl-drop-line');
    if (ln) { ln.hidden = false; ln.style.left = (at.i * at.w) + 'px'; ln.style.width = at.w + 'px'; }
    var tip = tipEl();
    tip.textContent = R.fmtDate(at.date);
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top = (e.clientY - 32) + 'px';
  });

  document.addEventListener('drop', function (e) {
    if (!tlUn) return;
    var grid = e.target.closest ? e.target.closest('.tl-grid') : null;
    if (!grid) return;
    e.preventDefault();
    var id = tlUn;
    tlUn = null;
    hideTip();
    lastDragEnd = Date.now();
    var at = tlDropDate(grid, e.clientX);
    if (S.moveTaskDates(id, at.date)) {
      toast(L('ครบกำหนด {d} แล้ว', { d: R.fmtDate(at.date) }), L('ย้อนกลับ'), 'undo');
    }
  });

  /* ---------- ดับเบิลคลิกชื่อบนการ์ดบอร์ด = เปลี่ยนชื่อตรงนั้นเลย ---------- */
  document.addEventListener('dblclick', function (e) {
    var nm = e.target.closest ? e.target.closest('[data-dbl="rename"]') : null;
    if (!nm) return;
    var tid = nm.dataset.id;
    var t = S.task(tid);
    if (!t) return;
    if (!S.can('write', tid)) { denyToast(); return; }
    e.preventDefault();
    var card = nm.closest('.card');
    if (card) card.setAttribute('draggable', 'false');
    inlineInput(nm, 'text', t.name, function (v) {
      v = (v || '').trim();
      if (card) card.setAttribute('draggable', 'true');
      if (v && v !== t.name) S.updateTask(tid, { name: v });
    });
  });

  /* ---------- ลากสลับวิดเจ็ตบนหน้าแรก (โหมดปรับแต่ง) ---------- */
  var homeDrag = null;

  document.addEventListener('dragstart', function (e) {
    var card = e.target.closest ? e.target.closest('.home-grid2.editing .hcard[data-w]') : null;
    if (!card) return;
    homeDrag = +card.dataset.i;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', card.dataset.w); } catch (err) { /* ie */ }
  });

  document.addEventListener('dragend', function () {
    homeDrag = null;
    Array.prototype.forEach.call(document.querySelectorAll('.hcard.dragging, .hcard.drop-at'),
      function (x) { x.classList.remove('dragging', 'drop-at'); });
  });

  document.addEventListener('dragover', function (e) {
    if (homeDrag === null) return;
    var card = e.target.closest ? e.target.closest('.home-grid2.editing .hcard[data-w]') : null;
    if (!card) return;
    e.preventDefault();
    Array.prototype.forEach.call(document.querySelectorAll('.hcard.drop-at'),
      function (x) { x.classList.remove('drop-at'); });
    if (+card.dataset.i !== homeDrag) card.classList.add('drop-at');
  });

  document.addEventListener('drop', function (e) {
    if (homeDrag === null) return;
    var card = e.target.closest ? e.target.closest('.home-grid2.editing .hcard[data-w]') : null;
    var from = homeDrag;
    homeDrag = null;
    if (!card) return;
    e.preventDefault();
    var to = +card.dataset.i;
    if (to === from || !S.isActive()) return;
    var hl = S.homeLayout();
    var moved = hl.splice(from, 1)[0];
    hl.splice(to, 0, moved);
    S.setHomeLayout(hl);
  });

  /* ---------- บัญชีบริษัท ---------- */

  var $gate = document.getElementById('gate');
  var gate = { busy: false, checking: false, error: null };
  var LOCAL_ONLY = 'orbit.localOnly';

  /** ผู้ใช้เคยเลือก "ใช้แบบเครื่องเดียว" ไว้ไหม */
  function localOnly() {
    try { return localStorage.getItem(LOCAL_ONLY) === '1'; } catch (e) { return false; }
  }
  function setLocalOnly(v) {
    try {
      if (v) localStorage.setItem(LOCAL_ONLY, '1');
      else localStorage.removeItem(LOCAL_ONLY);
    } catch (e) { /* โหมดส่วนตัวเขียนไม่ได้ ไม่เป็นไร */ }
  }

  function showGate() {
    if (!$gate) return;
    delete $gate.dataset.kind;          // Sprint 1B — ตอนนี้เป็นหน้าเข้าสู่ระบบ ไม่ใช่หน้าบัญชีถูกปิดแล้ว
    $gate.innerHTML = R.gateScreen(gate);
    $gate.hidden = false;
    document.body.classList.add('gated');
  }
  function hideGate() {
    if (!$gate) return;
    $gate.hidden = true;
    $gate.innerHTML = '';
    document.body.classList.remove('gated');
    maybeTour();                         // Sprint 3 — ทัวร์ครั้งแรก (ครั้งเดียวต่อคน)
  }

  /** ตัดสินว่าจะเข้าโหมดทีมหรือเครื่องเดียว แล้ววาดหน้าจอให้ตรงกัน */
  function bootAccount() {
    if (!R.teamReady()) return;      // ยังไม่ได้ตั้งค่า หรือโหลดไลบรารีไม่ได้ = ใช้แบบเดิม

    if (!localOnly()) { gate.checking = true; showGate(); }

    global.OrbitAuth.init().then(function (signedIn) {
      gate.checking = false;
      // MSAL อ่านแล้วแต่ไม่ได้ล้าง (เช่น state ไม่ตรง) ล้างเองไม่ให้ค้างจนเปลี่ยนหน้าไม่ได้
      if (authResponseInHash()) {
        global.history.replaceState(null, '', global.location.pathname + global.location.search);
      }

      if (!signedIn) {
        if (localOnly()) hideGate();
        else showGate();
        renderAll();
        return;
      }

      setLocalOnly(false);
      return global.OrbitSync.start().then(function () {
        hideGate();
        renderAll();
        toast(L('เชื่อมกับข้อมูลส่วนกลางของบริษัทแล้ว'));
        runReminders();
      }, function (err) {
        // ล็อกอินผ่านแต่แตะที่เก็บข้อมูลไม่ได้ — ต้องบอกให้ชัด ไม่ปล่อยให้เข้าใจว่าซิงก์อยู่
        gate.error = (err && err.message) || L('เข้าถึงที่เก็บข้อมูลส่วนกลางไม่ได้');
        showGate();
      });
    }, function (err) {
      gate.checking = false;
      gate.error = (err && err.message) || L('เริ่มระบบเข้าสู่ระบบไม่สำเร็จ');
      showGate();
    });
  }

  /* เปลี่ยนสถานะซิงก์แล้วขยับแค่ป้ายเดียว ไม่วาดใหม่ทั้งหน้า
   * ไม่งั้นทุก 15 วินาทีหน้าจะกระตุกและ scroll เด้ง */
  if (global.OrbitSync) {
    global.OrbitSync.onChange(function () {
      var chip = document.querySelector('.sync-chip');
      var html = R.syncChip();
      if (!chip || !html) { renderTopbar(); return; }
      var box = document.createElement('div');
      box.innerHTML = html;
      if (box.firstChild) chip.parentNode.replaceChild(box.firstChild, chip);
    });
  }

  /* รูปจาก Microsoft 365 มาถึงทีหลัง — ใส่รูปลงวงกลมที่วาดไว้แล้วตรง ๆ
   * ไม่วาดใหม่ทั้งหน้า คนที่กำลังพิมพ์ความเห็นอยู่จะได้ไม่โดนล้าง */
  if (global.OrbitPhotos) {
    global.OrbitPhotos.onChange(function () {
      document.querySelectorAll('.avatar[data-uid]:not(.has-photo)').forEach(function (el) {
        var u = S.user(el.getAttribute('data-uid'));
        var src = u && global.OrbitPhotos.url(u);
        if (!src) return;
        var img = document.createElement('img');
        img.src = src;
        img.alt = '';
        el.textContent = '';
        el.appendChild(img);
        el.classList.add('has-photo');
      });
    });
  }

  /* ข้อมูลถูกแทนทั้งก้อนจากส่วนกลาง — ต้องวาดใหม่ ไม่งั้นหน้าจอค้างที่ของเก่า */
  global.addEventListener('orbit:replaced', function () { renderAll(); noticeNewInbox(); });

  /* ปิดหน้าต่างระหว่างที่ยังส่งไม่เสร็จ = งานหาย ต้องรีบส่งก่อน */
  global.addEventListener('beforeunload', function (e) {
    if (!global.OrbitSync || global.OrbitSync.state.mode !== 'team') return;
    if (!global.OrbitSync.state.dirty) return;
    global.OrbitSync.flush();
    e.preventDefault();
    e.returnValue = '';
  });

  /* ---------- Sprint 2B — กล่องแจ้งเตือน ศูนย์อนุมัติ ติดตามโปรเจกต์ ----------
   * รวมคำสั่งใหม่ของชิ้นงานนี้ไว้ที่เดียว (เรียกจากตัวจัดการคลิกหลักก่อน switch) */
  function act2b(act, el, e) {
    var id = el.dataset.id;
    switch (act) {
      case 'notif-group': {
        /* แถวที่รวมหลายรายการของงานเดียวกัน — กาง/ยุบ (จำไว้ระหว่างเปิดหน้าอยู่ ไม่ลงข้อมูล) */
        var tk = el.dataset.task;
        if (state.inbox.open[tk]) delete state.inbox.open[tk];
        else state.inbox.open[tk] = true;
        renderViewBody();
        return true;
      }
      case 'notif-snooze': {
        if (popIsOpenFor(el)) { closePops(); return true; }
        var ids = el.dataset.group || id;
        var sh = '<div class="pop-note strong">' + R.esc(L('เตือนอีกครั้ง…')) + '</div>';
        S.snoozeChoices().forEach(function (c) {
          var d = new Date(c.at);
          sh += '<button data-act="notif-snooze-set" data-ids="' + R.esc(ids) + '" data-at="' + R.esc(c.at) + '">' +
            I('clock', 14) + '<span class="grow">' + R.esc(L(c.label)) + '</span>' +
            '<span class="pop-hint">' + R.esc(R.fmtDate(S.iso(d)) + ' ' + R.fmtTime(d)) + '</span></button>';
        });
        sh += '<div class="pop-note">' + R.esc(L('รายการจะซ่อนไว้ แล้วกลับมาเป็นรายการใหม่ตามเวลาที่เลือก')) + '</div>';
        openPop(el, sh);
        return true;
      }
      case 'notif-snooze-set': {
        closePops();
        var at = el.dataset.at, d2 = new Date(at);
        if (S.snoozeNotifs(String(el.dataset.ids || '').split(','), at)) {
          toast(L('เลื่อนเตือนไปถึง {t}', { t: R.fmtDate(S.iso(d2)) + ' ' + R.fmtTime(d2) }), L('ย้อนกลับ'), 'undo');
        }
        return true;
      }
      case 'notif-unsnooze':
        if (S.unsnoozeNotifs([id])) toast(L('ย้ายกลับมาในกิจกรรมแล้ว'), L('ย้อนกลับ'), 'undo');
        return true;
      case 'inbox-snoozed':
        state.inbox.snoozed = !state.inbox.snoozed;
        renderViewBody();
        return true;
      case 'apv-set':
        apvDecide(id, el.dataset.v);
        return true;
      case 'follow-toggle': {
        closePops();                       // กดจากเมนู ⋯ (จอแคบ) ปิดเมนูด้วย
        var isPf = el.dataset.kind === 'portfolio';
        var on = isPf ? !S.pfFollowing(id) : !S.projFollowing(id);
        if (isPf ? S.setPfFollow(id, on) : S.setProjFollow(id, on)) {
          toast(!on ? L('เลิกติดตามแล้ว')
            : isPf ? L('ติดตามพอร์ตโฟลิโอนี้แล้ว — ได้แจ้งเตือนเมื่อมีอัปเดตสถานะ')
            : L('ติดตามโปรเจกต์นี้แล้ว — ได้แจ้งเตือนอัปเดตสถานะ งานใหม่ และหมุดหมายที่สำเร็จ'));
        }
        return true;
      }
    }
    return false;
  }

  /** ตัดสินงานขออนุมัติจากแถวในกล่องแจ้งเตือน/หน้าแรก — ใช้ฟังก์ชันของ store ชุดเดียวกับแผงงาน
   *  ปฏิเสธถามก่อน (งานปิดและแจ้งคนขอทันที) ขอแก้ไขถามว่าต้องแก้อะไร (ไม่บังคับ — ลงเป็นความเห็นในงาน) */
  function apvDecide(tid, v) {
    var t = S.task(tid);
    if (!t) return;
    if (!S.canApprove(tid)) {
      var au = S.user(t.assigneeId);
      toast(au ? L('เฉพาะผู้อนุมัติ ({who}) ที่ตัดสินงานนี้ได้', { who: au.name })
               : L('เลือกผู้อนุมัติก่อน แล้วผู้อนุมัติจึงตัดสินได้'));
      return;
    }
    var nm = t.name;
    var done = function (key) { toast(L(key, { t: nm }), L('ย้อนกลับ'), 'undo'); };
    if (v === 'rejected') {
      askConfirm(L('ปฏิเสธ “{t}”?', { t: nm }),
        L('งานจะถูกปิดเป็น “ไม่อนุมัติ” และแจ้งคนขอทันที ถ้าแค่อยากให้แก้บางจุด ใช้ “ขอแก้ไข” แทน'),
        function () { S.updateTask(tid, { approval: 'rejected' }); done('ปฏิเสธแล้ว: {t}'); }, { ok: L('ปฏิเสธ') });
      return;
    }
    if (v === 'changes') {
      askText(L('ขอแก้ไขงาน “{t}”', { t: nm }), '', function (note) {
        S.batch('ขอแก้ไข “{t}”', { t: nm.slice(0, 60) }, function () {
          S.updateTask(tid, { approval: 'changes' });
          if (note) S.addComment(tid, note);
        });
        done('ขอแก้ไขแล้ว: {t}');
      }, { ok: L('ส่งขอแก้ไข'), placeholder: L('ต้องแก้อะไร (ไม่บังคับ)'),
           note: L('ข้อความนี้จะลงเป็นความเห็นในงาน คนขอได้รับแจ้งพร้อมผลอนุมัติ') });
      return;
    }
    S.updateTask(tid, { approval: 'approved' });
    done('อนุมัติแล้ว: {t}');
  }

  /* เลื่อนเตือน — ถึงเวลาแล้วกลับมาเป็นรายการใหม่ ตรวจตอนเปิดแอปและทุกนาทีที่เปิดค้างไว้ (ไม่มีเซิร์ฟเวอร์ปลุก) */
  function runSnoozeWake() {
    try { S.wakeSnoozed(); } catch (err) { console.error('ปลุกรายการที่เลื่อนเตือนไม่สำเร็จ', err); }
  }
  setTimeout(runSnoozeWake, 2000);
  setInterval(runSnoozeWake, 60 * 1000);

  /* ---------- 4b — ส่วนขยาย ----------
   * ไฟล์ที่โหลดก่อน main.js (ui4b.js) ใส่ฟังก์ชันเริ่มต้นไว้ใน window.OrbitExt
   * แล้วได้เครื่องมือชุดเดียวกับที่ main.js ใช้ (หน้าต่าง ถามผู้ใช้ ตารางสิทธิ์ เส้นทาง) ผ่าน api ด้านล่าง
   * main.js จึงไม่ต้องโตขึ้นอีกทุกครั้งที่มีหน้าใหม่ */
  var EXT_API = {
    state: state, S: S, R: R, L: L, I: I, esc: esc,
    renderAll: renderAll, renderViewBody: renderViewBody, renderTopbar: renderTopbar, refreshView: refreshView,
    openModal: openModal, closeModal: closeModal, toast: toast,
    askText: askText, askConfirm: askConfirm, askChoice: askChoice, openPop: openPop, closePops: closePops,
    denyToast: denyToast, downloadText: downloadText, safeFileName: safeFileName,
    confirmReveal: confirmReveal, confirmRevealNew: confirmRevealNew,     // ถามก่อนให้คนนอกโปรเจกต์ปิดเห็นงาน
    openTask: openTask, goProject: goProject, clearSel: clearSel, syncHash: syncHash, closeSidebar: closeSidebar,
    settingsModal: settingsModal, readFiles: readFiles, skippedToast: skippedToast,
    markDragEnd: function () { lastDragEnd = Date.now(); },
    needs: function (cap, list) { list.forEach(function (a) { NEEDS[a] = cap; }); },
    act: function (fn) { EXT.acts.push(fn); },
    change: function (fn) { EXT.changes.push(fn); },
    route: function (type, def) { EXT.routes[type] = def; },
    projView: function (id, fn) { EXT.projViews[id] = fn; },
    pfView: function (id, fn) { EXT.pfViews[id] = fn; },
    after: function (fn) { EXT.after.push(fn); },
    openRoute: function (fn) { var prev = EXT.openRoute; EXT.openRoute = function (r) { return fn(r) || (prev ? prev(r) : false); }; },
    deep: function (type) { EXT.deep.push(type); },
    hook: function (name, fn) { EXT.hooks[name] = fn; }
  };
  (global.OrbitExt || []).forEach(function (init) {
    try { init(EXT_API); } catch (err) { console.error('เริ่มส่วนขยายไม่สำเร็จ', err); }
  });

  /* ---------- boot ---------- */

  global.Orbit = { toast: toast, state: state, render: renderAll };

  /* ---------- หน้าที่จะเปิดตอนเริ่มใช้งาน ----------
   *
   * แอปเขียน hash ลง URL ทุกครั้งที่เปลี่ยนหน้าอยู่แล้ว
   * พอเปิดแอปครั้งถัดไป hash ที่ค้างอยู่จึงเป็นหน้าสุดท้ายที่บังเอิญค้างไว้ตอนปิด
   * ไม่ใช่หน้าที่ตั้งใจจะไป ถ้าเชื่อ hash ตรง ๆ ค่าที่ตั้งไว้จะไม่มีวันได้ทำงาน
   * ซึ่งเป็นอาการเดิม คือตั้งค่าแล้วเหมือนปุ่มนั้นไม่ทำอะไรเลย
   *
   * แยกสามกรณีตามสิ่งที่คนตั้งใจจริง
   *   กดรีเฟรช     — อยู่หน้าเดิม เพราะกดเพื่อดูหน้านี้ใหม่ ไม่ใช่เพื่อย้ายหน้า
   *   ลิงก์เจาะจง  — โปรเจกต์ พอร์ตโฟลิโอ ผลค้นหา หรือลิงก์ที่ชี้ถึงตัวงาน ไปตามลิงก์
   *                  เพราะมีคนตั้งใจส่งมา หรือเจ้าตัวคั่นหน้าไว้เอง
   *   เปิดแอปเฉย ๆ — ไปหน้าที่ตั้งไว้ในหน้าตั้งค่า
   */
  function isReload() {
    try {
      var nav = (global.performance.getEntriesByType('navigation') || [])[0];
      if (nav) return nav.type === 'reload';
      /* เบราว์เซอร์เก่ายังไม่มี Navigation Timing แบบใหม่ */
      return !!(global.performance.navigation && global.performance.navigation.type === 1);
    } catch (e) { return false; }
  }

  /** hash นี้ชี้ไปที่ของชิ้นใดชิ้นหนึ่งโดยเฉพาะไหม หรือเป็นแค่ชื่อหน้ากว้าง ๆ */
  function isDeepLink(parsed) {
    /* ลิงก์ตรงไปที่งาน #/task/t_xxx อ่านด้วย readHash ไม่ได้ จึงต้องดูจาก hash ดิบ
     * เป็นรูปแบบที่คนคัดลอกส่งกันมากที่สุด ห้ามโดนค่าเริ่มต้นเบียดตก */
    if ((global.location.hash || '').indexOf('#/task/') === 0) return true;
    if (!parsed) return false;
    if (parsed.taskId) return true;
    return ['project', 'portfolio', 'search', 'profile', 'tag', 'form', 'team', 'goal'].concat(EXT.deep).indexOf(parsed.route.type) >= 0;
  }

  var boot = readHash();
  var land = S.pref('landing');
  var useLanding = land && !isReload() && !isDeepLink(boot);

  if (boot && !useLanding) {
    state.route = boot.route;
    loadSavedSearch(boot.ss);
    state.openTaskId = boot.taskId && S.task(boot.taskId) && S.canSeeTask(boot.taskId) ? boot.taskId : null;
    focusStory(boot.storyId);
  } else if (useLanding && land !== 'home') {
    /* Sprint 2C — หน้าแรกเป็นพอร์ตโฟลิโอหรือรายงานที่เลือกไว้ได้ ('portfolio:<id>' / 'report:<id>')
     * ของที่ถูกลบหรือหมดสิทธิ์เห็นแล้ว ตกกลับไปหน้าแรกเงียบ ๆ ไม่ใช่เปิดมาเจอหน้าว่าง */
    var lm = /^(portfolio|report):(.+)$/.exec(String(land));
    if (!lm) state.route = { type: land };
    else if (lm[1] === 'portfolio' && S.portfolio(lm[2])) {
      var lpf = S.portfolio(lm[2]);
      state.route = lpf.defaultTab && S.pfSavedView(lpf.id, lpf.defaultTab)
        ? { type: 'portfolio', id: lpf.id, view: 'list', sv: lpf.defaultTab } : { type: 'portfolio', id: lpf.id, view: 'list' };
    } else if (lm[1] === 'report' && S.report(lm[2]) && S.canSeeReport(lm[2])) {
      state.route = { type: 'report', id: lm[2] };
    }
  }
  renderAll();
  noticeNewInbox();          // จำจำนวนที่ยังไม่อ่านตอนเปิดแอปไว้เป็นฐาน ไม่เด้งของเก่า
  bootAccount();

  /* เตือนกำหนดส่ง — ตอนเปิดแอปและทุกชั่วโมงที่เปิดค้างไว้ (ไม่มีเซิร์ฟเวอร์คอยปลุก)
   * หน่วงไว้นิดหนึ่งให้โหมดทีมโหลดข้อมูลส่วนกลางก่อน จะได้ไม่สร้างจากข้อมูลเก่าในเครื่อง */
  function runReminders() {
    try { S.checkDueReminders(); } catch (err) { console.error('เตือนกำหนดส่งไม่สำเร็จ', err); }
    /* 3b — งานเตือนรายงานสถานะวันศุกร์ (ทดสอบวันอื่นได้ด้วย Store.checkStatusReminders({ today: 'YYYY-MM-DD' })) */
    try { S.checkStatusReminders(); } catch (err2) { console.error('เตือนรายงานสถานะไม่สำเร็จ', err2); }
    /* 4a — เตือนอัปเดตสถานะเป้าหมาย (สัปดาห์ละครั้ง) และจุดกราฟความคืบหน้าของวันนี้ */
    try { S.checkGoalReminders(); } catch (err3) { console.error('เตือนเป้าหมายไม่สำเร็จ', err3); }
  }
  setTimeout(runReminders, 2500);
  setInterval(runReminders, 3600 * 1000);
  global.Orbit.reminders = runReminders;

  /* 3a — อัตโนมัติตามเวลา (ใกล้ครบกำหนด เลยกำหนด ตามกำหนดเวลา และงานของฉัน)
   * ไม่มีเซิร์ฟเวอร์ ตรวจตอนเปิดแอปและทุก 5 นาที โหมดทีมตรวจเฉพาะตอนข้อมูลตรงกับส่วนกลางแล้ว
   * (ไม่มีของค้างส่ง) แล้วส่งขึ้นทันที คีย์ที่รันแล้วอยู่ใน db.autoFired เครื่องอื่นได้ไปตอนซิงก์จึงไม่รันซ้ำ
   * หน่วงแบบสุ่มนิดหนึ่ง สองเครื่องที่เปิดพร้อมกันจะได้ไม่ตรวจชนกันพอดี */
  function runAutoTick() {
    var sync = global.OrbitSync && global.OrbitSync.state;
    if (sync && sync.mode === 'team' && (sync.dirty || sync.status !== 'synced')) return 0;
    var n = 0;
    try { n = S.autoTick(); } catch (err) { console.error('อัตโนมัติตามเวลาไม่สำเร็จ', err); }
    if (n && sync && sync.mode === 'team') global.OrbitSync.flush();
    return n;
  }
  setTimeout(runAutoTick, 3000 + Math.floor(Math.random() * 4000));
  setInterval(runAutoTick, 5 * 60 * 1000);
  global.addEventListener('orbit:replaced', function () {
    setTimeout(runAutoTick, 1500 + Math.floor(Math.random() * 3000));
  });
  global.Orbit.autoTick = runAutoTick;

  if (S.storageKind === 'memory') {
    setTimeout(function () {
      toast(L('โหมดทดลอง — ข้อมูลจะหายเมื่อรีเฟรช กด “ดาวน์โหลดสำรอง” เพื่อเก็บงานไว้'));
    }, 700);
  }

})(window);

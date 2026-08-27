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
    inboxArchived: false,
    home: { mine: 'upcoming', assigned: 'week', allProjects: false },
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
    setTab: 'general'                   // แท็บที่เปิดอยู่ในหน้าตั้งค่าของฉัน
  };

  function viewFor(projectId) {
    if (!state.views[projectId]) state.views[projectId] = S.defaultView();
    /* มุมมองที่โหลดมาจากที่บันทึกไว้อาจเก่ากว่าตัวเลือกที่มีตอนนี้ เติมคีย์ที่ขาดทุกครั้ง
     * ถูกกว่าการไล่เช็ค undefined ทีละจุดตอนวาด */
    return S.fillView(state.views[projectId]);
  }

  var $scrim = document.getElementById('sbScrim');

  /** เมนูข้างบนมือถือ — เลื่อนเข้ามาทับ พร้อมฉากทึบให้แตะปิด */
  function setSidebar(open) {
    document.getElementById('sidebar').classList.toggle('open', !!open);
    if ($scrim) $scrim.classList.toggle('open', !!open);
  }
  function closeSidebar() { setSidebar(false); }

  /** จอสัมผัสไม่มี hover — ใช้ตัดสินว่าจะเปิดการลากไหม */
  function isTouch() {
    try { return global.matchMedia('(hover: none)').matches; } catch (e) { return false; }
  }

  function selCount() { return Object.keys(state.sel).length; }
  function clearSel() { state.sel = {}; }

  /* อัปเดตเฉพาะสิ่งที่เปลี่ยนตอนเลือกงาน
   * ถ้า re-render ทั้งหน้าทุกครั้งที่ติ๊ก จอจะกระตุกและ scroll เด้งกลับด้านบน */
  function updateSelectionUI(id) {
    var on = !!state.sel[id];
    if (id) {
      var nodes = $view.querySelectorAll('.row[data-id="' + id + '"], .card[data-id="' + id + '"]');
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
  }

  /** ล้างการเลือกแล้วเก็บกวาดหน้าจอโดยไม่ต้อง re-render ทั้งหน้า */
  function clearSelUI() {
    var ids = Object.keys(state.sel);
    state.sel = {};
    ids.forEach(function (i) {
      var nodes = $view.querySelectorAll('.row[data-id="' + i + '"], .card[data-id="' + i + '"]');
      Array.prototype.forEach.call(nodes, function (n) {
        n.classList.remove('sel');
        var box = n.querySelector('.selbox');
        if (box) box.classList.remove('on');
      });
    });
    updateSelectionUI(null);
  }

  /* ---------- toast ---------- */

  var toastTimer = null;
  function toast(msg, actionLabel, actionAttr) {
    $toast.innerHTML = R.esc(msg) +
      (actionLabel ? ' <button data-act="' + actionAttr + '">' + R.esc(actionLabel) + '</button>' : '');
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $toast.classList.remove('show'); }, 3600);
  }

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
    if (r.type === 'project') parts = ['project', r.id, r.view];
    else if (r.type === 'portfolio') parts = ['portfolio', r.id, r.view || 'list'];
    else if (r.type === 'search') parts = ['search', encodeURIComponent(r.q)];
    else if (r.type === 'profile') parts = ['profile', r.id];
    else parts = [r.type];
    if (state.openTaskId) parts.push(state.openTaskId);
    return '#/' + parts.join('/');
  }

  function syncHash() {
    var want = buildHash();
    if (global.location.hash === want) return;
    state.suppressHash = true;
    global.location.hash = want;
    setTimeout(function () { state.suppressHash = false; }, 0);
  }

  function readHash() {
    var raw = (global.location.hash || '').replace(/^#\/?/, '');
    if (!raw) return null;
    var seg = raw.split('/').filter(function (s) { return s !== ''; });
    if (!seg.length) return null;

    var taskId = null;
    if (seg[seg.length - 1].indexOf('t_') === 0) taskId = seg.pop();

    var type = seg[0];
    if (type === 'project' && seg[1]) {
      var p = S.project(seg[1]);
      if (!p) return null;
      /* ยอมเฉพาะมุมมองที่โปรเจกต์นี้เปิดอยู่ ลิงก์เก่าที่ชี้ไปมุมมองที่ถูกปิดแล้ว
       * ต้องตกไปมุมมองแรกที่เหลือ ไม่ใช่เปิดมาแล้วเจอหน้าว่าง */
      var okViews = S.projectViews(seg[1]);
      var v = seg[2] || p.defaultView || okViews[0];
      if (okViews.indexOf(v) < 0) v = okViews[0];
      return { route: { type: 'project', id: seg[1], view: v }, taskId: taskId };
    }
    if (type === 'portfolio' && seg[1]) {
      if (!S.portfolio(seg[1])) return null;
      var pv = seg[2] || 'list';
      var pok = R.PF_TABS.some(function (x) { return x[0] === pv; });
      return { route: { type: 'portfolio', id: seg[1], view: pok ? pv : 'list' }, taskId: taskId };
    }
    if (type === 'search' && seg[1]) {
      return { route: { type: 'search', q: decodeURIComponent(seg[1]) }, taskId: taskId };
    }
    if (type === 'profile') {
      /* ไม่ระบุใคร = โปรไฟล์ของตัวเอง ทำให้ลิงก์ #/profile ใช้ได้กับทุกคน */
      var uid = seg[1] || (S.me() && S.me().id);
      if (!S.user(uid)) return null;
      return { route: { type: 'profile', id: uid }, taskId: taskId };
    }
    if (['home', 'mytasks', 'inbox', 'calendar', 'admin', 'projects'].indexOf(type) >= 0) {
      return { route: { type: type }, taskId: taskId };
    }
    return null;
  }

  global.addEventListener('hashchange', function () {
    if (state.suppressHash) return;
    var parsed = readHash();
    if (!parsed) return;
    state.route = parsed.route;
    state.openTaskId = parsed.taskId && S.task(parsed.taskId) ? parsed.taskId : null;
    clearSel();
    renderAll(true);
  });

  /* ---------- render ---------- */

  function renderViewBody() {
    var r = state.route;
    var body = '';

    if (r.type === 'home') {
      body = R.homeView(state.home);
    } else if (r.type === 'project') {
      var p = S.project(r.id);
      if (!p) { state.route = { type: 'home' }; return renderAll(); }
      /* ไม่มีสิทธิ์เห็นโปรเจกต์นี้ — ถอยออกเงียบ ๆ เหมือนโปรเจกต์ไม่มีอยู่จริง
       * ไม่บอกว่า "ไม่มีสิทธิ์" เพราะนั่นเท่ากับยืนยันว่าโปรเจกต์นี้มีอยู่ */
      if (!S.projectAccess(r.id)) { state.route = { type: "home" }; return renderAll(); }
      var v = viewFor(r.id);
      if (r.view === 'board') body = R.boardView(r.id, v, state.sel);
      else if (r.view === 'timeline') body = R.timelineView(r.id, v, state.tlZoom);
      else if (r.view === 'gantt') body = ganttLegendBar(r.id, v) +
        R.ganttView(r.id, v, state.ganttCollapsed, v.q);
      else if (r.view === 'calendar') body = R.calendarView(r.id, state.calOffset);
      else if (r.view === 'dashboard') body = R.dashboardView(r.id);
      else if (r.view === 'overview') body = R.overviewView(r.id);
      else if (r.view === 'files') body = R.filesView(r.id);
      else if (r.view === 'messages') body = R.messagesView(r.id);
      else body = R.listView(r.id, v, state.sel);
    } else if (r.type === 'portfolio') {
      if (!S.portfolio(r.id)) { state.route = { type: 'home' }; return renderAll(); }
      body = R.portfolioView(r.id, r.view || 'list');
    } else if (r.type === 'mytasks') {
      body = R.myTasksView(state.sel);
    } else if (r.type === 'inbox') {
      body = R.inboxView(state.inboxArchived);
    } else if (r.type === 'calendar') {
      body = R.calendarView(null, state.calOffset);
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
      body = R.searchView(r.q, state.sel);
    }

    // ออกจาก Gantt แล้วแผงตัวเลือกไม่มีความหมายอีก ปล่อยค้างไว้จะบังหน้าจอเปล่า ๆ
    if (!(r.type === 'project' && r.view === 'gantt') && optOpen()) closeOpts();

    // เก็บตำแหน่งเลื่อนไทม์ไลน์ไว้ก่อน re-render ไม่งั้นจอจะเด้งกลับต้นทุกครั้งที่ลาก
    var prevScroll = $view.querySelector('.tl-scroll');
    if (prevScroll) state.tlScrollLeft = prevScroll.scrollLeft;
    var prevG = $view.querySelector('.gantt-scroll');
    if (prevG) state.ganttScroll = { x: prevG.scrollLeft, y: prevG.scrollTop };

    $view.innerHTML = body + R.bulkbar(state.sel);
    resumeInlineAdd();
    restoreTimelineScroll();
    restoreGanttScroll();
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
      h += '<label class="opt-lbl">' + L('ผู้รับผิดชอบ') + '</label>' +
        optSelect('f-assignee', [['', L('ทุกคน')]].concat(S.db.users.map(function (u) {
          return [u.id, u.name];
        })), v.assignee);
      h += '<label class="opt-lbl">' + L('ความสำคัญ') + '</label>' +
        optSelect('f-priority', [['', L('ทั้งหมด')]].concat(S.PRIORITIES.map(function (x) {
          return [x.id, L(x.label)];
        })), v.priority);
      var tags = S.allTags();
      if (tags.length) {
        h += '<label class="opt-lbl">' + L('แท็ก') + '</label>' +
          optSelect('f-tag', [['', L('ทั้งหมด')]].concat(tags.map(function (t) {
            return [t, t];
          })), v.tag);
      }
      h += '<label class="opt-lbl">' + L('กำหนดส่ง') + '</label>' +
        optSelect('f-due', S.DUE_FILTERS.map(function (x) { return [x.id, L(x.label)]; }), v.due);
      h += '<div class="opt-sep"></div>';
      h += optToggle('f-completed', L('แสดงงานที่เสร็จแล้ว'), v.showCompleted);
      h += '<div class="opt-acts"><button class="btn btn-sm btn-ghost" data-act="reset-view">' +
        L('ล้างตัวกรอง') + '</button></div>';
      h += '</div>';
      return h + optFoot();
    }

    if (page === 'sorts') {
      h += optHead(L('เรียงลำดับ'), true);
      var sortOpts = S.SORTS.map(function (x) { return [x.id, L(x.label)]; })
        .concat(p.fields.map(function (f) { return ['field:' + f.id, f.name]; }));
      h += '<div class="opt-body"><label class="opt-lbl">' + L('เรียงตาม') + '</label>' +
        optSelect('f-sort', sortOpts, v.sort);
      if (v.sort !== 'manual') {
        h += '<div class="opt-acts"><button class="btn btn-sm" data-act="f-sortdir">' +
          I(v.sortDir === 'desc' ? 'arrowDown' : 'arrowUp', 13) + ' ' +
          (v.sortDir === 'desc' ? L('มากไปน้อย') : L('น้อยไปมาก')) + '</button></div>';
      }
      h += '</div>';
      return h + optFoot();
    }

    if (page === 'groups') {
      h += optHead(L('จัดกลุ่ม'), true);
      h += '<div class="opt-body"><label class="opt-lbl">' + L('จัดกลุ่มตาม') + '</label>' +
        optSelect('f-group', S.GROUPS.map(function (x) { return [x.id, L(x.label)]; }), v.group);
      h += '<div class="opt-acts">' +
        '<button class="btn btn-sm btn-ghost" data-act="g-expand-all">' + L('ขยายทุกกลุ่ม') + '</button>' +
        '<button class="btn btn-sm btn-ghost" data-act="g-collapse-all">' + L('ย่อทุกกลุ่ม') + '</button>' +
        '</div></div>';
      return h + optFoot();
    }

    /* ---- หน้าหลัก ---- */
    var hidden = S.GANTT_COLS.filter(function (c) { return !v.gCols[c.id]; }).length;
    var sortLab = v.sort === 'manual' ? L('ไม่ได้เรียง')
      : (S.SORTS.filter(function (x) { return x.id === v.sort; })[0] || {}).label;
    if (sortLab && v.sort !== 'manual') {
      var ff = p.fields.filter(function (f) { return 'field:' + f.id === v.sort; })[0];
      sortLab = ff ? ff.name : L(sortLab);
    }
    var groupLab = (S.GROUPS.filter(function (x) { return x.id === v.group; })[0] || {}).label;

    var vw = state.route.view || 'list';
    var vdef = (S.PROJECT_VIEWS.filter(function (x) { return x.id === vw; })[0]) || {};
    var vname = L(vdef.label || 'Gantt');
    var isG = vw === 'gantt';

    h += optHead(vname);
    h += '<div class="opt-body">';
    h += '<div class="opt-namerow">' +
      '<div><label class="opt-lbl">' + L('ไอคอน') + '</label>' +
      '<input class="opt-icon" id="gvIcon" maxlength="2" value="' + esc(state.viewIcon || '📊') + '"></div>' +
      '<div class="grow"><label class="opt-lbl">' + L('ชื่อมุมมอง') + '</label>' +
      '<input class="opt-name" id="gvName" value="' + esc(state.viewName || vname) + '"></div></div>';

    /* กลุ่มนี้เป็นของผัง Gantt ล้วน เส้นฐาน ระดับการซูม และคอลัมน์ในตารางซ้าย
     * มุมมองอื่นไม่มีของพวกนี้ ถ้าโชว์ไว้จะกลายเป็นปุ่มที่กดแล้วไม่มีอะไรเปลี่ยน */
    if (isG) {
      h += '<div class="opt-sep"></div>';
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
    } else {
      h += '<div class="opt-sep"></div>';
    }
    h += optRow('g-opt-page', 'filter', L('ตัวกรอง'),
      activeFilterCount(v) ? L('ใช้อยู่ {n}', { n: activeFilterCount(v) }) : L('ไม่มี'), true, ' data-page="filters"');
    h += optRow('g-opt-page', 'arrowUp', L('เรียงลำดับ'), sortLab || L('ไม่ได้เรียง'), true, ' data-page="sorts"');
    h += optRow('g-opt-page', 'hash', L('จัดกลุ่ม'), L(groupLab || ''), true, ' data-page="groups"');
    if (isG) {
      h += '<div class="opt-row"><span class="ic-wrap">' + I('subtask', 15) + '</span>' +
        '<span class="grow">' + L('งานย่อย') + '</span>' +
        optSelect('g-subtasks', [['collapsed', L('ซ่อนไว้')], ['expanded', L('กางออก')]], v.gSubtasks) +
        '</div>';
    }

    if (p.savedViews.length) {
      h += '<div class="opt-sep"></div><label class="opt-lbl">' + L('มุมมองที่บันทึกไว้') + '</label>';
      h += '<div class="opt-views">';
      p.savedViews.forEach(function (sv) {
        h += '<div class="opt-view"><button class="grow" data-act="load-view" data-id="' + esc(sv.id) + '">' +
          '<span class="em">' + esc(sv.icon || '📊') + '</span>' + esc(sv.name) + '</button>' +
          '<button class="x" data-act="delete-view" data-id="' + esc(sv.id) + '" title="' +
          L('ลบมุมมอง') + '">' + I('close', 12) + '</button></div>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h + optFoot();
  }

  function optFoot() {
    return '<div class="opt-foot">' +
      '<button class="btn btn-ghost btn-sm" data-act="reset-view">' + L('ล้างตัวกรอง') + '</button>' +
      '<span class="grow"></span>' +
      '<button class="btn btn-primary btn-sm" data-act="save-view">' + L('บันทึกมุมมอง') + '</button></div>';
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
      html += R.viewToolbar(state.route.id, viewFor(state.route.id),
        state.route.view === 'gantt' ? ganttExtras(viewFor(state.route.id)) : null);
    }
    $topbar.innerHTML = html;
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
      $gate.innerHTML = R.disabledScreen();
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
    $sidebar.innerHTML = R.sidebar(state.route);
    renderTopbar();
    renderViewBody();
    renderDrawer();
    if (!skipHash) syncHash();
  }

  function renderDrawer() {
    if (state.openTaskId && S.task(state.openTaskId)) {
      $drawer.innerHTML = R.drawer(state.openTaskId,
        { actTab: state.actTab, actSort: state.actSort, actAll: state.actAll,
          wide: state.dwWide, moreFields: state.dwMore });
      $drawer.classList.toggle('wide', !!state.dwWide);
      $drawer.classList.add('open');
      $dwBack.classList.add('open');
      $drawer.setAttribute('aria-hidden', 'false');
      autoGrow($drawer.querySelector('.dw-title'));
    } else {
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

  S.onChange(function () { renderAll(); });

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
      S.updateTask(tid, { dueOn: v || null });
    }); return; }

    var fid = cell.dataset.field;
    var p = S.project(state.route.id);
    var f = p.fields.filter(function (x) { return x.id === fid; })[0];
    if (!f) return;
    var cur = S.fieldValue(tid, fid);

    if (f.type === 'select' || f.type === 'multi') {
      if (popIsOpenFor(cell)) { closePops(); return; }
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
      cell.style.position = 'relative';
      openPop(cell, oh);
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

  /* ---------- modal ---------- */

  function openModal(html, wide) {
    closeSidebar();
    $modal.className = 'modal' + (wide ? ' wide' : '');
    $modal.innerHTML = html;
    $mdBack.classList.add('open');
    var first = $modal.querySelector('input, select, textarea');
    if (first) setTimeout(function () { first.focus(); if (first.select) first.select(); }, 40);
  }
  function closeModal() { $mdBack.classList.remove('open'); $modal.innerHTML = ''; }

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
    var v = view || p.defaultView || okViews[0];
    if (okViews.indexOf(v) < 0) v = okViews[0];
    state.route = { type: 'project', id: id, view: v };
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
    if (!S.task(id)) return;
    state.openTaskId = id;
    /* เปิดงานใหม่ให้กลับมาที่แท็บความเห็นเสมอ
     * ถ้าจำแท็บข้ามงาน คนที่เผลอเปิดค้างไว้ที่ความเคลื่อนไหวทั้งหมด
     * จะเจอบันทึกอัตโนมัติกองหนึ่งทุกครั้งที่เปิดงาน แทนที่จะเจอสิ่งที่ทีมคุยกันไว้ */
    state.actTab = 'comments';
    state.actAll = false;
    state.dwMore = false;      // เปิดงานใหม่เริ่มที่มุมมองสั้นเสมอ
    renderDrawer();
    syncHash();
  }

  function closeDrawer() {
    state.openTaskId = null;
    renderDrawer();
    syncHash();
  }

  /* ---------- inline add ---------- */

  function inlineAdd(btn, sectionId) {
    var projectId = state.route.id;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'inp';
    input.placeholder = L('ชื่องาน แล้วกด Enter');
    input.style.cssText = 'border:1px solid var(--accent);background:var(--bg);margin:4px 0';
    btn.style.display = 'none';
    btn.parentNode.insertBefore(input, btn);
    input.focus();

    function done() {
      var v = input.value.trim();
      input.value = '';
      input.remove();
      btn.style.display = '';
      if (v) S.createTask({ name: v }, projectId, sectionId);
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var v = input.value.trim();
        input.value = '';
        if (v) {
          state.reopenAddIn = sectionId;
          S.createTask({ name: v }, projectId, sectionId);
        }
      } else if (e.key === 'Escape') {
        input.value = '';
        input.blur();
      }
    });
    input.addEventListener('blur', done);
  }

  function resumeInlineAdd() {
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

  function addFieldModal(type) {
    var ft = S.FIELD_TYPES.filter(function (x) { return x.id === type; })[0] || S.FIELD_TYPES[0];
    var h = '<h2>' + L('เพิ่มฟิลด์') + '</h2>';

    h += '<div class="field"><label>' + L('ชื่อฟิลด์') + ' *</label>' +
      '<input id="nfName" placeholder="' + L('เช่น สถานะ, ผู้อนุมัติ, งบ') + '"></div>';

    h += '<div class="field"><label>' + L('ชนิด') + '</label><select id="nfType" data-act="nf-type">';
    S.FIELD_TYPES.forEach(function (x) {
      h += '<option value="' + x.id + '"' + (x.id === ft.id ? ' selected' : '') +
        '>' + L(x.label) + '</option>';
    });
    h += '</select></div>';

    h += '<div class="field" id="nfOptWrap"' + (ft.hasOptions ? '' : ' style="display:none"') + '>' +
      '<label>' + L('ตัวเลือก') + ' *</label><div id="nfOpts">' +
      optionRow('', S.OPTION_COLORS[3]) + optionRow('', S.OPTION_COLORS[0]) + '</div>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-act="add-option">' +
      I('plus', 13) + ' ' + L('เพิ่มตัวเลือก') + '</button></div>';

    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') +
      '</button><button class="btn btn-primary" data-act="create-field">' +
      L('สร้างฟิลด์') + '</button></div>';
    return h;
  }

  function projectModal(existing) {
    var p = existing || { name: '', icon: '📁', color: S.PALETTE[0], description: '' };
    var h = '<h2>' + (existing ? L('แก้ไขโปรเจกต์') : L('สร้างโปรเจกต์ใหม่')) + '</h2>';
    h += '<div class="field"><label>' + L('ชื่อโปรเจกต์') + '</label><input id="pName" value="' +
      R.esc(p.name) + '" placeholder="' + L('เช่น เปิดตัวสินค้าใหม่') + ' 2026">' + '</div>';
    h += '<div class="field"><label>' + L('คำอธิบาย') + '</label><input id="pDesc" value="' +
      R.esc(p.description) + '"></div>';
    h += '<div class="field"><label>' + L('ไอคอน') + '</label><input id="pIcon" value="' +
      R.esc(p.icon) + '" maxlength="4" style="width:80px"></div>';
    if (!existing) {
      h += '<div class="field"><label>' + L('คอลัมน์เริ่มต้น (คั่นด้วยจุลภาค)') + '</label>' +
        '<input id="pSections" value="' + L('ค้างอยู่, กำลังทำ, รอตรวจ, เสร็จแล้ว') + '"></div>';
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
    var canManage = S.canInProject(projectId, 'admin') || S.isAdmin();
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
      }
    }

    h += '<div class="modal-note" style="margin-top:16px">' +
      L('ในเวอร์ชันนี้การกันสิทธิ์ทำที่หน้าจอ เมื่อย้ายไปฐานข้อมูลแล้วจะบังคับที่เซิร์ฟเวอร์จริง') +
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
    h += item('project-settings', 'settings', L('ตั้งค่าโปรเจกต์'));
    h += item('project-access', 'shield', L('ใครเข้าถึงโปรเจกต์นี้ได้')) ;
    h += item('project-look', 'pencil', L('ตั้งสีและไอคอน'));
    h += item('add-to-portfolio', 'star', L('เพิ่มเข้าพอร์ตโฟลิโอ'));
    h += '<div class="pop-sep"></div>';
    h += item('update-status', 'flag', L('อัปเดตสถานะโปรเจกต์'));
    h += item('copy-project-link', 'link', L('คัดลอกลิงก์โปรเจกต์'));
    h += item('dup-project', 'copy', L('คัดลอกโปรเจกต์'));
    h += '<div class="pop-sep"></div>';
    h += item('manage-fields', 'filter', L('จัดการฟิลด์'));
    h += item('manage-rules', 'repeat', L('กฎอัตโนมัติ'));
    h += item('reset-cols', 'arrowLeft', L('คืนความกว้างคอลัมน์เดิม'));
    h += '<div class="pop-sep"></div>';
    h += item('import-csv', 'archive', L('นำเข้างานจาก CSV'));
    h += item('export-csv', 'send', L('ส่งออกเป็น CSV'));
    h += '<div class="pop-sep"></div>';
    h += item('toggle-archive', p.archived ? 'arrowLeft' : 'archive',
      p.archived ? L('เอากลับจากคลัง') : L('เก็บโปรเจกต์เข้าคลัง'));
    h += '<button class="danger" data-act="delete-project"' + d + '>' +
      I('trash', 14) + '<span class="grow">' + L('ลบโปรเจกต์') + '</span></button>';
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

  function projectSettingsModal(projectId, tab) {
    var p = S.project(projectId);
    if (!p) return '';
    tab = tab || 'details';
    var d = ' data-id="' + R.esc(projectId) + '"';

    var h = '<h2>' + L('ตั้งค่าโปรเจกต์') + '</h2>';
    h += '<div class="prj-set"><nav class="prj-tabs">';
    PRJ_TABS.forEach(function (t) {
      h += '<button class="' + (tab === t[0] ? 'on' : '') +
        '" data-act="project-settings"' + d + ' data-tab="' + t[0] + '">' + L(t[1]) + '</button>';
    });
    h += '</nav><div class="prj-pane">';

    if (tab === 'details') {
      h += '<div class="prj-2col">';
      h += '<div class="field"><label>' + L('ชื่อโปรเจกต์') + '</label>' +
        '<input id="psName" value="' + R.esc(p.name) + '"></div>';
      h += '<div class="field"><label>' + L('เจ้าของโปรเจกต์') + '</label><select id="psOwner">' +
        '<option value="">' + L('ยังไม่ระบุ') + '</option>';
      S.db.users.forEach(function (u) {
        h += '<option value="' + R.esc(u.id) + '"' + (p.owner === u.id ? ' selected' : '') +
          '>' + R.esc(u.name) + '</option>';
      });
      h += '</select></div>';
      h += '<div class="field"><label>' + L('กำหนดส่งของโปรเจกต์') + '</label>' +
        '<input id="psDue" type="date" value="' + R.esc(p.dueOn || '') + '"></div>';
      h += '<div class="field"><label>' + L('มุมมองที่เปิดเป็นค่าเริ่มต้น') + '</label><select id="psView">';
      S.PROJECT_VIEWS.filter(function (v) {
        return S.projectViews(projectId).indexOf(v.id) >= 0;
      }).forEach(function (v) {
        h += '<option value="' + v.id + '"' + ((p.defaultView || 'list') === v.id ? ' selected' : '') +
          '>' + R.esc(L(v.label)) + '</option>';
      });
      h += '</select></div>';
      h += '</div>';
      h += '<div class="field"><label>' + L('คำอธิบายโปรเจกต์') + '</label>' +
        '<textarea id="psDesc" rows="4" placeholder="' + L('โปรเจกต์นี้เกี่ยวกับอะไร') + '">' +
        R.esc(p.description || '') + '</textarea></div>';

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
    var h = '<h2>' + R.esc(t.name) + '</h2>';
    h += '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<button class="btn" data-act="dup-task" data-id="' + R.esc(taskId) + '">' + I('copy', 14) + ' ' + L('คัดลอกงาน') + '</button>' +
      '<button class="btn" data-act="save-template" data-id="' + R.esc(taskId) + '">' + I('star', 14) + ' ' + L('บันทึกเป็นเทมเพลต') + '</button>' +
      '<button class="btn" data-act="copy-link" data-id="' + R.esc(taskId) + '">' + I('link', 14) + ' ' + L('คัดลอกลิงก์ของงานนี้') + '</button>' +
      '<button class="btn btn-danger" data-act="delete-task" data-id="' + R.esc(taskId) + '">' + I('trash', 14) + ' ' + L('ลบงาน') + '</button>' +
      '</div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
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
    if (S.can('structure')) {
      h += '<button data-act="manage-templates">' + I('star', 15) +
        '<span class="grow">' + L('เพิ่มจากเทมเพลต') + '</span></button>';
      h += '<button data-act="add-section">' + I('grid', 15) +
        '<span class="grow">' + L('เพิ่มคอลัมน์') + '</span></button>';
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

  function statusModal(projectId) {
    var p = S.project(projectId);
    var cur = p.status || { state: 'on_track', text: '' };
    var h = '<h2>' + L('รายงานสถานะ') + ' — ' + R.esc(p.name) + '</h2>';

    h += '<label class="opt-lbl">' + L('สถานะ') + '</label><div class="st-pick" id="stPick">';
    S.PROJECT_STATES.forEach(function (x) {
      h += '<button type="button" class="' + (cur.state === x.id ? 'on' : '') +
        '" data-v="' + x.id + '" style="--c:' + x.color + '">' +
        '<i style="background:' + x.color + '"></i>' + R.esc(L(x.label)) + '</button>';
    });
    h += '</div>';

    h += '<div class="field" style="margin-top:14px"><label>' + L('สรุปให้ทีมอ่าน') + '</label>' +
      '<textarea id="stText" rows="4" placeholder="' + L('งานเดินถึงไหน ติดอะไร ต้องการอะไร') + '">' +
      R.esc(cur.text) + '</textarea></div>';

    var log = S.statusLog(projectId, 6);
    if (log.length) {
      h += '<label class="opt-lbl">' + L('รายงานก่อนหน้า') + '</label><div class="st-log">';
      log.forEach(function (e) {
        var s = R.projectState(e.state);
        var by = S.user(e.by);
        h += '<div class="st-log-row"><i style="background:' + s.color + '"></i>' +
          '<div><b style="color:' + s.color + '">' + R.esc(L(s.label)) + '</b>' +
          (e.text ? '<em>' + R.esc(e.text) + '</em>' : '') +
          '<span title="' + R.esc(R.fmtExact(e.at)) + '">' + R.esc(by ? by.name : '?') +
          ' · ' + R.esc(R.fmtWhen(e.at)) + '</span></div></div>';
      });
      h += '</div>';
    }

    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="save-status" data-id="' + R.esc(projectId) +
      '">' + L('บันทึก') + '</button></div>';
    return h;
  }

  function rulesModal(projectId) {
    var p = S.project(projectId);
    var h = '<h2>' + L('กฎอัตโนมัติ —') + ' ' + R.esc(p.name) + '</h2>';
    h += '<p style="font-size:13px;color:var(--fg-soft);margin:0 0 14px">' +
      L('เมื่อลากงานเข้าคอลัมน์ที่กำหนด ให้ทำสิ่งเหล่านี้อัตโนมัติ') + '</p>';

    if (!p.rules.length) {
      h += '<div style="color:var(--fg-faint);margin-bottom:12px">' + L('ยังไม่มีกฎ') + '</div>';
    }
    p.rules.forEach(function (r) {
      var sec = S.section(projectId, r.whenSection);
      var acts = [];
      if (r.setCompleted) acts.push(L('ทำเครื่องหมายเสร็จ'));
      if (r.setAssignee) acts.push(L('มอบหมายให้') + ' ' + (S.user(r.setAssignee) || {}).name);
      if (r.setPriority) acts.push(L('ตั้งความสำคัญเป็น') + ' ' + L(R.prio(r.setPriority).label));
      if (r.addTag) acts.push(L('ติดแท็ก') + ' ' + r.addTag);
      h += '<div class="mini-row"><div class="grow"><div>' + L('เมื่อย้ายเข้า “') +
        R.esc(sec ? sec.name : '?') + '”</div><div class="sub">' +
        R.esc(acts.join(' · ') || L('ยังไม่ได้ตั้งการกระทำ')) + '</div></div>' +
        '<button class="btn btn-sm btn-danger" data-act="delete-rule" data-project="' +
        R.esc(projectId) + '" data-rule="' + R.esc(r.id) + '">' + L('ลบ') + '</button></div>';
    });

    h += '<div class="field" style="margin-top:16px"><label>' + L('เมื่อย้ายเข้าคอลัมน์') + '</label>' +
      '<select id="rSection">';
    p.sections.forEach(function (s) {
      h += '<option value="' + R.esc(s.id) + '">' + R.esc(s.name) + '</option>';
    });
    h += '</select></div>';
    h += '<div class="field"><label>' + L('ให้ทำเครื่องหมายเสร็จ') + '</label>' +
      '<select id="rDone"><option value="">' + L('ไม่') + '</option><option value="1">' + L('ใช่') + '</option></select></div>';
    h += '<div class="field"><label>' + L('มอบหมายให้') + '</label><select id="rAssignee"><option value="">' + L('ไม่เปลี่ยน') + '</option>';
    S.db.users.forEach(function (u) {
      h += '<option value="' + R.esc(u.id) + '">' + R.esc(u.name) + '</option>';
    });
    h += '</select></div>';
    h += '<div class="field"><label>' + L('ตั้งความสำคัญ') + '</label><select id="rPriority"><option value="">' + L('ไม่เปลี่ยน') + '</option>';
    S.PRIORITIES.forEach(function (x) {
      h += '<option value="' + x.id + '">' + R.esc(L(x.label)) + '</option>';
    });
    h += '</select></div>';
    h += '<div class="field"><label>' + L('ติดแท็ก') + '</label><input id="rTag" placeholder="' + L('เว้นว่างถ้าไม่ต้องการ') + '"></div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button>' +
      '<button class="btn btn-primary" data-act="add-rule" data-project="' + R.esc(projectId) +
      '">' + L('เพิ่มกฎ') + '</button></div>';
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

  function fieldsModal(projectId) {
    var p = S.project(projectId);
    var h = '<h2>' + L('ฟิลด์ของ') + ' ' + R.esc(p.name) + '</h2>';
    if (!p.fields.length) {
      h += '<div style="color:var(--fg-faint);margin-bottom:12px">' + L('ยังไม่มีฟิลด์') + '</div>';
    }
    p.fields.forEach(function (f) {
      var typeLabel = S.FIELD_TYPES.filter(function (x) { return x.id === f.type; })[0];
      h += '<div class="mini-row"><div class="grow"><div>' + R.esc(f.name) + '</div>' +
        '<div class="sub">' + R.esc(typeLabel ? L(typeLabel.label) : f.type) +
        (f.options.length ? ' · ' + R.esc(f.options.join(', ')) : '') + '</div></div>' +
        '<button class="btn btn-sm btn-danger" data-act="delete-field" data-project="' +
        R.esc(projectId) + '" data-field="' + R.esc(f.id) + '">' + L('ลบ') + '</button></div>';
    });
    h += '<div class="field" style="margin-top:16px"><label>' + L('ชื่อฟิลด์ใหม่') + '</label>' +
      '<input id="fName" placeholder="' + L('เช่น ช่องทาง, งบประมาณ') + '"></div>';
    h += '<div class="field"><label>' + L('ชนิด') + '</label><select id="fType">';
    S.FIELD_TYPES.forEach(function (t) {
      h += '<option value="' + t.id + '">' + R.esc(L(t.label)) + '</option>';
    });
    h += '</select></div>';
    h += '<div class="field"><label>' + L('ตัวเลือก (เฉพาะชนิด “ตัวเลือก” คั่นด้วยจุลภาค)') + '</label>' +
      '<input id="fOptions" placeholder="Shopee, Lazada, TikTok"></div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button>' +
      '<button class="btn btn-primary" data-act="add-field" data-project="' + R.esc(projectId) +
      '">' + L('เพิ่มฟิลด์') + '</button></div>';
    return h;
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
      return true;
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
   * เลือกไฟล์จากเครื่องได้จริงแล้ว ไฟล์เล็กเก็บมาทั้งก้อนในตัวข้อมูล
   * ไฟล์ใหญ่เก็บไม่ไหว เพราะพื้นที่ทั้งหมดที่เบราว์เซอร์ให้มีราวสิบสองเมกะ
   * ไฟล์เดียวก็กินหมดได้ แล้วงานของทั้งทีมจะบันทึกไม่ลง
   *
   * จึงบอกไปตรง ๆ ตอนไฟล์เกินเพดาน แล้วเสนอทางที่ใช้ได้จริงคือวางลิงก์จาก SharePoint
   * ซึ่งเป็นที่เก็บไฟล์จริงของบริษัทอยู่แล้ว ดีกว่าปล่อยให้แนบแล้วพังเงียบ ๆ
   */
  var ATT_MAX_BYTES = 1024 * 1024;     // 1 MB ต่อไฟล์

  function attachmentModal(taskId) {
    return '<h2>' + L('แนบไฟล์') + '</h2>' +
      '<button class="att-drop" data-act="pick-file">' + I('paperclip', 22) +
      '<b>' + L('เลือกไฟล์จากเครื่อง') + '</b>' +
      '<em>' + L('ไฟล์ไม่เกิน {n} MB เก็บมาทั้งไฟล์ ใหญ่กว่านั้นให้วางลิงก์แทน',
        { n: Math.round(ATT_MAX_BYTES / 1048576) }) + '</em></button>' +
      '<input type="file" id="atFile" data-act="att-file" data-id="' + R.esc(taskId) + '" hidden>' +
      '<div class="att-or"><span>' +
      L('หรือวางลิงก์จาก SharePoint / OneDrive / Google Drive') + '</span></div>' +
      '<div class="field"><label>' + L('ชื่อไฟล์') + '</label><input id="atName" placeholder="' + L('เช่น brief.pdf') + '"></div>' +
      '<div class="field"><label>' + L('ลิงก์') + '</label><input id="atUrl" placeholder="https://…"></div>' +
      '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-add-attachment" data-id="' + R.esc(taskId) +
      '">' + L('แนบลิงก์') + '</button></div>';
  }

  function takeAttachment(inputEl) {
    var f = inputEl.files && inputEl.files[0];
    var tid = inputEl.dataset.id;
    inputEl.value = '';
    if (!f) return;
    if (f.size > ATT_MAX_BYTES) {
      toast(L('ไฟล์ใหญ่ {mb} MB เกินเพดาน วางลิงก์แทนได้',
        { mb: (f.size / 1048576).toFixed(1) }));
      var nameBox = document.getElementById('atName');
      if (nameBox) { nameBox.value = f.name; nameBox.focus(); }
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

  function templatesModal() {
    var h = '<h2>' + L('เทมเพลตงาน') + '</h2>';
    if (!S.db.taskTemplates.length) {
      h += '<div style="color:var(--fg-faint);margin-bottom:12px">' +
        L('ยังไม่มีเทมเพลต — เปิดงานที่ต้องการ กดปุ่ม ⋯ แล้วเลือก “บันทึกเป็นเทมเพลต”') + '</div>';
    }
    S.db.taskTemplates.forEach(function (tpl) {
      h += '<div class="mini-row"><div class="grow"><div>' + R.esc(tpl.name) + '</div>' +
        '<div class="sub">' + (tpl.payload.subtaskNames || []).length + ' ' + L('งานย่อย') + '</div></div>' +
        (state.route.type === 'project'
          ? '<button class="btn btn-sm btn-primary" data-act="use-template" data-id="' +
            R.esc(tpl.id) + '">' + L('ใช้') + '</button>' : '') +
        '<button class="btn btn-sm btn-danger" data-act="delete-template" data-id="' +
        R.esc(tpl.id) + '">' + L('ลบ') + '</button></div>';
    });
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    return h;
  }

  function shortcutsModal() {
    var rows = [
      ['/', L('ไปที่ช่องค้นหา')],
      ['Esc', L('ปิดหน้าต่าง / แผงรายละเอียด')],
      ['Ctrl + Z', L('ย้อนกลับการกระทำล่าสุด')],
      ['Ctrl + Enter', L('ส่งความเห็น')],
      ['Ctrl + /', L('เปิดหน้าคีย์ลัดนี้')],
      ['Tab + H', L('ไปหน้าแรก')],
      ['Tab + Z', L('ไปงานของฉัน')],
      ['Tab + I', L('ไปกล่องข้อความ')],
      ['Tab + Q', L('เพิ่มงานด่วน')],
      ['Tab + M', L('มอบหมายงานที่เปิดอยู่ให้ตัวเอง')],
      ['Tab + C', L('ไปที่ช่องความเห็น')],
      ['Tab + X', L('สลับโหมดสว่าง/มืด')],
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
        (now ? L('ใช้อยู่') : (u.id === origin ? L('กลับบัญชีนี้')
                                              : R.roleLabel(u.role))) + '</span></button>';
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
                                  ['inbox', L('กล่องข้อความ')]], S.pref('landing'));
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
        I('star', 14) + ' ' + L('เทมเพลตงาน') + '</button></div>';
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
        L('เลือกว่าเรื่องไหนควรขึ้นในกล่องข้อความ ปิดเรื่องที่ไม่สำคัญออก กล่องข้อความจะได้ยังน่าอ่าน') + '</p>';
      S.NOTIFY_KINDS.forEach(function (k) {
        var on = !me || !me.prefs || !me.prefs.notify || !(k.id in me.prefs.notify)
          ? true : !!me.prefs.notify[k.id];
        h += setToggle('set-notify', L(k.label), on, k.desc ? L(k.desc) : '',
          ' data-kind="' + k.id + '"');
      });
      h += '<div class="prj-warn">' + I('alert', 15) + '<span>' +
        L('การแจ้งเตือนทางอีเมลยังไม่เปิด จะทำได้เมื่อเชื่อมต่อระบบส่วนกลางแล้ว ตอนนี้ทุกอย่างอยู่ในกล่องข้อความของแอป') +
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
        L('การเปลี่ยนรหัสผ่านและการยืนยันสองชั้น จะทำได้เมื่อเชื่อมต่อระบบส่วนกลางแล้ว ตอนนี้เข้าระบบด้วยบัญชี Microsoft ของบริษัทเป็นหลัก') +
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
  function handoverModal(userId, withDisable) {
    var u = S.user(userId);
    if (!u) return '';
    var list = S.openTasksOf(userId);
    var others = S.db.users.filter(function (x) {
      return x.id !== userId && x.active !== false;
    });

    var h = '<h2>' + (withDisable ? L('ปิดบัญชีและโอนงานต่อ') : L('โอนงานต่อ')) + '</h2>';
    h += '<div class="look-prev">' + R.avatar(u, 'lg') +
      '<div><b>' + R.esc(u.name) + '</b>' +
      '<div style="font-size:12.5px;color:var(--fg-soft)">' + R.esc(u.email || '') + '</div></div></div>';

    h += '<div class="prj-warn">' + I('alert', 15) + '<span>' +
      L('มีงานที่ยังไม่เสร็จอยู่ {n} งาน ถ้าปล่อยไว้กับบัญชีที่ปิดแล้ว จะไม่มีใครได้รับแจ้งและงานจะค้างเงียบ ๆ',
        { n: list.length }) + '</span></div>';

    h += '<div class="field" style="margin-top:14px"><label>' + L('โอนให้ใคร') + '</label>' +
      '<select id="hoTo">';
    others.forEach(function (x) {
      h += '<option value="' + R.esc(x.id) + '">' + R.esc(x.name) +
        (x.title ? ' — ' + R.esc(x.title) : '') + '</option>';
    });
    h += '<option value="">' + L('ไม่โอน ปล่อยว่างไว้ (ต้องมีคนมาหยิบเอง)') + '</option>';
    h += '</select></div>';

    h += '<label class="opt-lbl">' + L('งานที่จะโอน') + '</label><div class="ho-list">';
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
      '" data-off="' + (withDisable ? '1' : '0') + '">' +
      (withDisable ? L('โอนงานแล้วปิดบัญชี') : L('โอนงาน')) + '</button></div>';
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
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var res = S.importTasksCsv(projectId, fr.result);
          renderAll();
          toast(res.sections
            ? L('นำเข้า {n} งาน และสร้างคอลัมน์ใหม่ {s} คอลัมน์', { n: res.tasks, s: res.sections })
            : L('นำเข้า {n} งานแล้ว', { n: res.tasks }), L('ย้อนกลับ'), 'undo');
        } catch (err) {
          toast(L('นำเข้าไม่สำเร็จ:') + ' ' + err.message);
        }
      };
      fr.readAsText(f, 'utf-8');
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
    S.undo();
    var u = S.undoLabel();
    clearSel();
    if (state.openTaskId && !S.task(state.openTaskId)) state.openTaskId = null;
    toast(L('ย้อนกลับแล้ว:') + ' ' + L(u.label, u.params || undefined));
  }

  /* ---------- click delegation ---------- */

  // เวลาที่ลากแท่งไทม์ไลน์เสร็จล่าสุด
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
      'set-visibility', 'toggle-lock', 'add-project-member', 'pick-access', 'set-access', 'drop-member',
      'disable-user', 'enable-user', 'handover', 'do-handover',
      'delete-project', 'reset', 'import', 'paste-backup', 'do-paste-import',
      /* การสำรองข้อมูลคือการดึงฐานข้อมูลทั้งก้อนออกไปเป็นไฟล์
       * ในนั้นมีทุกโปรเจกต์ รวมถึงโปรเจกต์ปิดที่คนกดไม่มีสิทธิ์เห็น และอีเมลของทุกคน
       * ถ้าไม่กั้น ระบบสิทธิ์รายโปรเจกต์ทั้งหมดข้ามได้ด้วยปุ่มเดียว */
      'export', 'copy-backup', 'copy-dump'
    ]);
    put('structure', [
      'new-project', 'create-project', 'edit-project', 'save-project', 'dup-project',
      'toggle-archive', 'update-status', 'save-status',
      'add-section', 'rename-section', 'delete-section', 'move-section',
      'manage-fields', 'add-field', 'delete-field', 'create-field', 'rename-field',
      'drop-field', 'add-field-picker', 'pick-ftype', 'add-option', 'remove-option',
      'opt-color', 'set-opt-color',
      'manage-rules', 'add-rule', 'delete-rule',
      'pick-status', 'clear-status', 'toggle-view',
      'new-portfolio', 'pf-rename', 'pf-desc', 'pf-look', 'save-pf-look', 'pf-delete',
      'pf-add', 'pf-pick', 'pf-remove', 'pf-pick-status', 'pf-clear-status',
      'pf-toggle-project', 'add-to-portfolio',
      'manage-templates', 'delete-template', 'save-template', 'use-template',
      'save-view', 'delete-view', 'reset-cols',
      'g-set-baseline', 'g-clear-baseline',
      'save-project-details', 'set-depmode', 'set-depscope', 'set-workdays',
      'project-look', 'save-project-look', 'import-csv'
    ]);
    put('write', [
      'delete-task', 'dup-task', 'bulk-complete', 'bulk-reopen', 'bulk-due',
      'bulk-delete', 'add-home', 'do-add-home', 'unhome', 'undo'
    ]);
    put('create', ['quick-add', 'inline-add']);
    put('write:task', [
      'toggle', 'add-subtask',
      'edit-title', 'edit-notes', 'edit-due', 'edit-start', 'edit-duetime',
      'edit-type', 'edit-recur', 'edit-recur-n', 'edit-field', 'edit-dep-type',
      'pick-assignee', 'set-assignee', 'pick-priority', 'set-priority', 'set-approval',
      'add-dependency', 'do-add-dependency', 'remove-dependency', 'g-del-dep',
      'add-attachment', 'do-add-attachment', 'remove-attachment',
      'add-tag', 'remove-tag',
      'edit-cell', 'cell-set-assignee', 'cell-set-option', 'cell-toggle-option'
    ]);
    put('comment', [
      'send-comment', 'toggle-follow', 'do-follow', 'remove-follower',
      'pick-follower', 'toggle-like', 'react', 'react-menu', 'pick-tag',
      'pick-file', 'att-file'
    ]);
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

  /** ผ่านสิทธิ์ไหม ถ้าไม่ผ่านจะเตือนให้ผู้ใช้รู้ว่าทำไม ไม่เงียบหาย */
  function allowed(act, el) {
    var need = NEEDS[act];
    if (!need) return true;
    var ok;
    if (need === "write:task") ok = S.can("write", actTaskId(el));
    else if (need === "create") ok = S.can("write");
    else if (need === "structure") {
      /* การแก้โครงสร้างเกิดขึ้นในบริบทของโปรเจกต์ที่เปิดอยู่
       * จึงต้องผ่านสิทธิ์ของโปรเจกต์นั้นด้วย ไม่ใช่แค่บทบาทระดับองค์กร */
      ok = S.can("structure") &&
           (state.route.type !== "project" || S.canInProject(state.route.id, "edit"));
    }
    else ok = S.can(need);
    if (!ok) denyToast();
    return ok;
  }

  // ใช้เวลาแทนธงบูลีน เพราะบางครั้งเบราว์เซอร์ไม่ยิง click ตามหลัง mouseup
  // (เช่นปล่อยเมาส์นอกตัวแท่ง) ธงจะค้างแล้วไปกลืนคลิกครั้งถัดไป
  var lastDragEnd = 0;

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
         'add-tag', 'tag-search'].indexOf(el.dataset.act) < 0) {
      if (!e.target.closest || !e.target.closest('.pop')) closePops();
    }

    if ($scrim && e.target === $scrim) { closeSidebar(); return; }
    if (e.target === $mdBack) { closeModal(); return; }
    if (e.target === $dwBack) { closeDrawer(); return; }
    if (e.target === $optBack) { closeOpts(); return; }
    if (!el) return;

    var act = el.dataset.act;
    var id = el.dataset.id;
    var sectionId = el.dataset.section;
    var projectId = el.dataset.project;
    if (!allowed(act, el)) return;

    switch (act) {

      /* --- navigation --- */
      case 'toggle-sidebar':
        setSidebar(!document.getElementById('sidebar').classList.contains('open'));
        break;

      case 'go': {
        closeSidebar();
        var rt = el.dataset.route;
        if (rt === 'project') { goProject(id); break; }
        if (rt === 'portfolio') {
          state.route = { type: 'portfolio', id: id, view: 'list' };
          clearSel(); renderAll(); break;
        }
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
        state.calOffset = 0;
        state.tlScrollLeft = null;      // เข้าไทม์ไลน์ใหม่ ให้ไปหยุดที่วันนี้
        renderAll();
        break;

      case 'sort-col': {
        var key = el.dataset.key;
        var vw = viewFor(state.route.id);
        if (vw.sort !== key) { vw.sort = key; vw.sortDir = 'asc'; }
        else if (vw.sortDir === 'asc') { vw.sortDir = 'desc'; }
        else { vw.sort = 'manual'; vw.sortDir = 'asc'; }   // กดครบรอบ กลับเป็นลำดับเดิม
        renderAll();
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
        S.addField(state.route.id, { name: nm, type: ty, options: opts });
        closeModal();
        toast(L('เพิ่มฟิลด์แล้ว'));
        break;
      }
      case 'field-menu': {
        e.stopPropagation();
        if (popIsOpenFor(el)) { closePops(); break; }
        var fid = el.dataset.field;
        openPop(el,
          '<button data-act="rename-field" data-field="' + R.esc(fid) + '">' +
          I('pencil', 14) + ' ' + L('เปลี่ยนชื่อ') + '</button>' +
          '<button data-act="drop-field" data-field="' + R.esc(fid) + '">' +
          I('trash', 14) + ' ' + L('ลบ') + '</button>');
        break;
      }
      case 'rename-field': {
        closePops();
        var pf = S.project(state.route.id).fields
          .filter(function (x) { return x.id === el.dataset.field; })[0];
        var nn2 = prompt(L('เปลี่ยนชื่อฟิลด์'), pf ? pf.name : '');
        if (nn2 && nn2.trim()) S.renameField(state.route.id, el.dataset.field, nn2.trim());
        break;
      }
      case 'drop-field': {
        closePops();
        if (!confirm(L('ลบฟิลด์นี้? ค่าที่กรอกไว้ทั้งหมดจะหายด้วย'))) break;
        S.deleteField(state.route.id, el.dataset.field);
        toast(L('ลบฟิลด์แล้ว'));
        break;
      }

      /* --- แก้ค่าในเซลล์ --- */
      case 'edit-cell':
        e.stopPropagation();
        editCell(el);
        break;
      case 'cell-set-assignee':
        closePops();
        S.updateTask(el.dataset.id, { assigneeId: el.dataset.user || null });
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
        if (pbs.baseline &&
            !confirm(L('ตั้งเส้นฐานใหม่? แผนเดิมที่บันทึกไว้จะถูกทับ'))) break;
        S.setBaseline(state.route.id);
        viewFor(state.route.id).gShowBaseline = true;
        renderViewBody();
        refreshOpts();
        toast(L('ตั้งเส้นฐานแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'g-clear-baseline':
        if (!confirm(L('ลบเส้นฐานที่บันทึกไว้?'))) break;
        S.clearBaseline(state.route.id);
        viewFor(state.route.id).gShowBaseline = false;
        renderViewBody();
        refreshOpts();
        toast(L('ลบเส้นฐานแล้ว'), L('ย้อนกลับ'), 'undo');
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
        if (!confirm(L('ลบลำดับ “') + gb.name + '” → “' + gt.name + '” ?')) break;
        S.removeDependency(id, el.dataset.blocker);
        toast(L('ลบลำดับแล้ว'), L('ย้อนกลับ'), 'undo');
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
        renderAll();
        refreshOpts();
        break;
      }
      case 'reset-view':
        state.views[state.route.id] = S.defaultView();
        renderAll();
        refreshOpts();
        break;
      case 'save-view': {
        /* ใช้ชื่อกับไอคอนจากแผงตัวเลือก เฉพาะตอนที่แผงเปิดอยู่จริง
         * ไม่ใช่แค่มีช่องนั้นอยู่ใน DOM ไม่งั้นกดจากแถบเครื่องมือจะเงียบ ๆ
         * เอาชื่อเก่าจากแผงที่ปิดไปแล้วมาใช้แล้วทับมุมมองเดิม */
        var panelOpen = optOpen();
        var iEl = panelOpen ? document.getElementById('gvName') : null;
        var nm = iEl ? iEl.value.trim() : (prompt(L('ตั้งชื่อมุมมองนี้')) || '').trim();
        if (!nm) { toast(L('ยังไม่ได้ตั้งชื่อมุมมอง')); break; }
        var icEl = panelOpen ? document.getElementById('gvIcon') : null;
        var ic = icEl ? icEl.value.trim() : '';
        state.viewName = nm;
        if (ic) state.viewIcon = ic;
        S.saveView(state.route.id, nm, viewFor(state.route.id), ic || state.viewIcon);
        renderViewBody();
        refreshOpts();
        toast(L('บันทึกมุมมองแล้ว'));
        break;
      }
      case 'load-view': {
        closePops();
        var p2 = S.project(state.route.id);
        var sv = p2.savedViews.filter(function (x) { return x.id === id; })[0];
        if (sv) {
          state.views[state.route.id] = S.fillView(S.clone(sv.view));
          state.viewName = sv.name;
          state.viewIcon = sv.icon || '📊';
          state.ganttScroll = null;
          renderAll();
          refreshOpts();
        }
        break;
      }
      case 'delete-view':
        e.stopPropagation();
        S.deleteSavedView(state.route.id, id);
        renderViewBody();
        refreshOpts();
        break;

      /* --- task basics --- */
      case 'toggle': {
        var tk1 = S.task(id);
        if (tk1) S.updateTask(id, { completed: !tk1.completed });
        break;
      }
      case 'open-task': openTask(id); break;
      case 'close-drawer': closeDrawer(); break;
      case 'select-task':
        e.stopPropagation();
        if (state.sel[id]) delete state.sel[id];
        else state.sel[id] = true;
        updateSelectionUI(id);
        break;
      case 'task-menu': openModal(taskMenuModal(id)); break;
      case 'dup-task': {
        var c = S.duplicateTask(id);
        closeModal();
        if (c) openTask(c.id);
        toast(L('คัดลอกงานแล้ว'));
        break;
      }
      case 'copy-link': {
        var base = global.location.href.split('#')[0];
        copyText(base + '#/task/' + id, L('คัดลอกลิงก์แล้ว'));
        closeModal();
        break;
      }
      case 'save-template': {
        var tn = prompt(L('ชื่อเทมเพลต'), S.task(id).name);
        if (!tn || !tn.trim()) break;
        S.saveTaskTemplate(id, tn.trim());
        closeModal();
        toast(L('บันทึกเป็นเทมเพลตแล้ว'));
        break;
      }
      case 'delete-task': {
        var tk2 = S.task(id);
        if (!tk2) break;
        /* ถามยืนยันตามที่ผู้ใช้ตั้งไว้ ปิดได้เพราะลบงานย้อนกลับได้ด้วย Ctrl+Z อยู่แล้ว */
        if (S.pref('confirmDelete') && !confirm(L('ลบงาน “') + tk2.name + '” ?')) break;
        if (state.openTaskId === id) state.openTaskId = null;
        closeModal();
        S.deleteTask(id);
        toast(L('ลบงานแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'quick-add': {
        var qn = prompt(L('ชื่องานใหม่'));
        if (!qn || !qn.trim()) break;
        var qp = S.project(state.route.id);
        var nt = S.createTask({ name: qn.trim() }, qp.id, qp.sections[0].id);
        openTask(nt.id);
        break;
      }
      case 'inline-add': inlineAdd(el, sectionId); break;
      case 'add-subtask': {
        var sn2 = prompt(L('ชื่องานย่อย'));
        if (!sn2 || !sn2.trim()) break;
        S.createTask({ name: sn2.trim(), parentId: id }, null, null);
        break;
      }

      /* --- pickers --- */
      case 'pick-assignee': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var ph = '<button data-act="set-assignee" data-id="' + R.esc(state.openTaskId) +
          '" data-user="">' + R.avatar(null) + ' ' + L('ยังไม่มอบหมาย') + '</button>';
        S.db.users.forEach(function (u) {
          ph += '<button data-act="set-assignee" data-id="' + R.esc(state.openTaskId) +
            '" data-user="' + R.esc(u.id) + '">' + R.avatar(u) + ' ' + R.esc(u.name) + '</button>';
        });
        openPop(el, ph);
        break;
      }
      case 'set-assignee':
        closePops();
        S.updateTask(id, { assigneeId: el.dataset.user || null });
        break;
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
      case 'set-approval':
        S.updateTask(id, { approval: el.dataset.v });
        break;
      case 'pick-follower': {
        if (popIsOpenFor(el)) { closePops(); break; }
        var fh = '';
        S.db.users.forEach(function (u) {
          fh += '<button data-act="do-follow" data-id="' + R.esc(id) + '" data-user="' +
            R.esc(u.id) + '">' + R.avatar(u) + ' ' + R.esc(u.name) + '</button>';
        });
        openPop(el, fh);
        break;
      }
      case 'do-follow':
        closePops();
        S.toggleFollower(id, el.dataset.user);
        break;
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
      case 'do-add-attachment': {
        var an = document.getElementById('atName').value.trim();
        if (!an) { toast(L('ใส่ชื่อไฟล์ก่อน')); break; }
        S.addAttachment(id, an, document.getElementById('atUrl').value.trim());
        closeModal();
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
      case 'do-add-home':
        S.addTaskToProject(id, projectId, null);
        closeModal();
        toast(L('เพิ่มเข้าโปรเจกต์แล้ว'));
        break;
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

      case 'post-message': {
        var mb = document.getElementById('msgBody');
        var mt = document.getElementById('msgTitle');
        if (!mb || !mb.value.trim()) { toast(L('เขียนเนื้อหาก่อน')); break; }
        S.addProjectMessage(id, mt ? mt.value : '', mb.value);
        renderAll();
        toast(L('ประกาศแล้ว'));
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
        if (box && box.value.trim()) S.addComment(id, box.value);
        break;
      }

      /* --- bulk --- */
      case 'bulk-complete': S.bulkUpdate(selectedIds(), { completed: true }); clearSel(); break;
      case 'bulk-reopen': S.bulkUpdate(selectedIds(), { completed: false }); clearSel(); break;
      case 'bulk-due': {
        var bd = prompt(L('กำหนดส่งใหม่ (ปปปป-ดด-วว) เว้นว่างเพื่อลบ'), S.today());
        if (bd === null) break;
        S.bulkUpdate(selectedIds(), { dueOn: bd.trim() || null });
        clearSel();
        break;
      }
      case 'bulk-delete': {
        var ids = selectedIds();
        if (!confirm(L('ลบ') + ' ' + ids.length + ' ' + L('งาน?'))) break;
        S.deleteTasks(ids);
        clearSel();
        toast(L('ลบแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'bulk-clear': clearSelUI(); break;

      /* --- inbox --- */
      case 'inbox-tab':
        state.inboxArchived = el.dataset.archived === '1';
        renderViewBody();
        break;
      case 'open-notif': {
        S.markRead(id);
        var tid = el.dataset.task;
        if (S.task(tid)) { openTask(tid); break; }
        /* ประกาศของโปรเจกต์พาไปที่หน้าประกาศของโปรเจกต์นั้น */
        var npid = el.dataset.project;
        if (npid && S.project(npid)) goProject(npid, 'messages');
        break;
      }
      case 'archive-notif': e.stopPropagation(); S.archiveNotification(id); break;
      case 'inbox-read-all': S.markAllRead(S.db.currentUserId); break;
      case 'inbox-archive-all': S.archiveAll(S.db.currentUserId); toast(L('เก็บทั้งหมดแล้ว')); break;

      /* --- sections --- */
      case 'add-section': {
        var sn3 = prompt(L('ชื่อคอลัมน์ใหม่'));
        if (sn3 && sn3.trim()) S.addSection(state.route.id, sn3.trim());
        break;
      }
      case 'rename-section': {
        var cur = S.section(state.route.id, sectionId);
        var nn = prompt(L('เปลี่ยนชื่อคอลัมน์'), cur ? cur.name : '');
        if (nn && nn.trim()) S.renameSection(state.route.id, sectionId, nn.trim());
        break;
      }
      case 'delete-section':
        if (!confirm(L('ลบคอลัมน์นี้? งานข้างในจะย้ายไปคอลัมน์แรก'))) break;
        if (!S.deleteSection(state.route.id, sectionId)) toast(L('ต้องเหลืออย่างน้อย 1 คอลัมน์'));
        break;
      case 'move-section':
        S.moveSection(state.route.id, sectionId, parseInt(el.dataset.delta, 10));
        break;

      /* --- projects --- */
      case 'new-project': openModal(projectModal(null)); break;
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
        closeModal();
        goProject(np.id);
        toast(L('สร้างโปรเจกต์แล้ว'));
        break;
      }
      case 'project-menu':
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, projectMenu(id || state.route.id));
        break;

      /* --- พอร์ตโฟลิโอ --- */
      case 'new-portfolio': {
        var pfn = prompt(L('ชื่อพอร์ตโฟลิโอ'), L('พอร์ตโฟลิโอใหม่'));
        if (!pfn || !pfn.trim()) break;
        var nf = S.createPortfolio({ name: pfn.trim() });
        state.route = { type: 'portfolio', id: nf.id, view: 'list' };
        renderAll();
        toast(L('สร้างพอร์ตโฟลิโอแล้ว'));
        break;
      }
      case 'pf-menu':
        if (popIsOpenFor(el)) { closePops(); break; }
        openPop(el, portfolioMenu(id || state.route.id));
        break;
      case 'pf-rename': {
        closePops();
        var pf1 = S.portfolio(id);
        var nn = prompt(L('ชื่อพอร์ตโฟลิโอ'), pf1 ? pf1.name : '');
        if (nn && nn.trim()) { S.updatePortfolio(id, { name: nn.trim() }); renderAll(); }
        break;
      }
      case 'pf-desc': {
        closePops();
        var pf2 = S.portfolio(id);
        var dd = prompt(L('คำอธิบายพอร์ตโฟลิโอ'), pf2 ? pf2.description : '');
        if (dd !== null) { S.updatePortfolio(id, { description: dd.trim() }); renderAll(); }
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
        if (!confirm(L('ลบพอร์ตโฟลิโอ “{name}”?\nโปรเจกต์ข้างในจะยังอยู่ครบ ลบแค่กล่องที่ใช้จัดกลุ่ม',
          { name: pf3.name }))) break;
        S.deletePortfolio(id);
        state.route = { type: 'home' };
        renderAll();
        toast(L('ลบพอร์ตโฟลิโอแล้ว'), L('ย้อนกลับ'), 'undo');
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
        openModal(projectSettingsModal(id || state.route.id, el.dataset.tab), true);
        break;
      case 'save-project-details': {
        S.updateProject(id, {
          name: document.getElementById('psName').value.trim() || S.project(id).name,
          owner: document.getElementById('psOwner').value || null,
          dueOn: document.getElementById('psDue').value || null,
          defaultView: document.getElementById('psView').value,
          description: document.getElementById('psDesc').value.trim()
        });
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
      case 'project-access': openModal(projectAccessModal(id || state.route.id)); break;
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
        if (!confirm(L('ถอด “{name}” ออกจากโปรเจกต์นี้?', { name: dm ? dm.name : '' }))) break;
        if (!S.removeProjectMember(id, el.dataset.user)) {
          toast(L('ต้องเหลือผู้ดูแลโปรเจกต์อย่างน้อยหนึ่งคน'));
          break;
        }
        openModal(projectAccessModal(id));
        renderAll();
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
        openModal(statusModal(id || state.route.id));
        break;
      case 'save-status': {
        var stSel = $modal.querySelector('#stPick .on');
        S.setProjectStatus(id, (stSel && stSel.dataset.v) || 'on_track',
          document.getElementById('stText').value.trim());
        closeModal();
        renderAll();
        toast(L('อัปเดตสถานะแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'toggle-archive': {
        var ap = S.project(id);
        S.archiveProject(id, !ap.archived);
        closeModal();
        toast(ap.archived ? L('เอากลับจากคลังแล้ว') : L('เก็บเข้าคลังแล้ว'));
        break;
      }
      case 'dup-project': {
        var withTasks = confirm(L('คัดลอกงานทั้งหมดไปด้วยหรือไม่?\n\nตกลง = คัดลอกงานด้วย\nยกเลิก = เอาแค่โครงคอลัมน์และฟิลด์'));
        var dp2 = S.duplicateProject(id, withTasks);
        closeModal();
        if (dp2) goProject(dp2.id);
        toast(L('คัดลอกโปรเจกต์แล้ว'));
        break;
      }
      case 'delete-project': {
        var dp = S.project(id);
        if (!confirm(L('ลบโปรเจกต์ “') + dp.name + L('” ?\nงานที่อยู่เฉพาะในโปรเจกต์นี้จะถูกลบด้วย'))) break;
        S.deleteProject(id);
        closeModal();
        state.route = { type: 'home' };
        renderAll();
        toast(L('ลบโปรเจกต์แล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }

      /* --- fields --- */
      case 'manage-fields': openModal(fieldsModal(id)); break;
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
          .filter(function (x) { return x; });
        S.addField(projectId, { name: fn, type: document.getElementById('fType').value, options: opts });
        openModal(fieldsModal(projectId));
        break;
      }
      case 'delete-field':
        S.deleteField(projectId, el.dataset.field);
        openModal(fieldsModal(projectId));
        break;

      /* --- rules --- */
      case 'manage-rules': openModal(rulesModal(id)); break;
      case 'add-rule':
        S.addRule(projectId, {
          whenSection: document.getElementById('rSection').value,
          setCompleted: !!document.getElementById('rDone').value,
          setAssignee: document.getElementById('rAssignee').value || null,
          setPriority: document.getElementById('rPriority').value || null,
          addTag: document.getElementById('rTag').value.trim()
        });
        openModal(rulesModal(projectId));
        toast(L('เพิ่มกฎแล้ว'));
        break;
      case 'delete-rule':
        S.deleteRule(projectId, el.dataset.rule);
        openModal(rulesModal(projectId));
        break;

      /* --- templates --- */
      case 'manage-templates': openModal(templatesModal()); break;
      case 'use-template': {
        var up = S.project(state.route.id);
        var made = S.applyTaskTemplate(id, up.id, up.sections[0].id);
        closeModal();
        if (made) openTask(made.id);
        break;
      }
      case 'delete-template':
        S.deleteTaskTemplate(id);
        openModal(templatesModal());
        break;

      /* --- members --- */
      case 'manage-members': openModal(addMemberModal()); break;
      case 'add-user': openModal(addMemberModal()); break;
      case 'pick-person': {
        var pRole = document.getElementById('uRole').value;
        var added = S.addUser({
          id: global.OrbitAuth.orbitId(el.dataset.oid),
          name: el.dataset.name, email: el.dataset.email, role: pRole
        });
        el.disabled = true;
        el.querySelector('i').textContent = L('เพิ่มแล้ว');
        toast(L('เพิ่ม “{name}” เข้ารายชื่อแล้ว', { name: added.name }));
        break;
      }
      case 'do-add-user': {
        var un = document.getElementById('uName').value.trim();
        if (!un) { toast(L('ใส่ชื่อก่อน')); break; }
        S.addUser({
          name: un,
          email: document.getElementById('uEmail').value.trim(),
          role: document.getElementById('uRole').value
        });
        closeModal();
        renderAll();
        toast(L('เพิ่ม “{name}” เข้ารายชื่อแล้ว', { name: un }));
        break;
      }
      case 'remove-user': {
        var ru = S.user(id);
        if (!ru) break;
        if (!confirm(L('เอา “{name}” ออกจากรายชื่อ?\nงานที่มอบหมายไว้จะกลายเป็นยังไม่มอบหมาย',
          { name: ru.name }))) break;
        if (!S.removeUser(id)) { toast(L('ลบคนนี้ไม่ได้')); break; }
        renderAll();
        toast(L('เอาออกจากรายชื่อแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      /* --- จัดการบัญชีและบันทึกการทำงาน --- */
      case 'disable-user': {
        var du = S.user(id);
        if (!du) break;
        /* มีงานค้างอยู่ ต้องตัดสินใจเรื่องงานก่อน ไม่ใช่ปิดแล้วค่อยไปตามหาทีหลัง
         * งานที่ผูกกับบัญชีที่เข้าไม่ได้จะเงียบไปจนกว่าจะเลยกำหนด */
        if (S.openTasksOf(id).length) { openModal(handoverModal(id, true)); break; }
        if (!confirm(L('ปิดใช้งานบัญชีของ “{name}”?\nเขาจะเข้าระบบไม่ได้ทันที แต่งานที่มอบหมายไว้ยังอยู่ครบ',
          { name: du.name }))) break;
        if (!S.setActive(id, false)) { toast(L('ปิดบัญชีนี้ไม่ได้')); break; }
        renderAll();
        toast(L('ปิดใช้งานบัญชีแล้ว'), L('ย้อนกลับ'), 'undo');
        break;
      }
      case 'handover': openModal(handoverModal(id, false)); break;
      case 'do-handover': {
        var toSel = document.getElementById('hoTo');
        var to = toSel ? toSel.value : '';
        var alsoOff = el.dataset.off === '1';
        var moved = S.handoverTasks(id, to || null);
        if (alsoOff && !S.setActive(id, false)) { toast(L('ปิดบัญชีนี้ไม่ได้')); break; }
        closeModal();
        renderAll();
        toast(alsoOff
          ? L('โอนงาน {n} งาน และปิดบัญชีแล้ว', { n: moved })
          : L('โอนงาน {n} งานแล้ว', { n: moved }), L('ย้อนกลับ'), 'undo');
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
        if (!S.setRole(id, el.dataset.role)) toast(L('ต้องมีผู้ดูแลอย่างน้อยหนึ่งคน'));
        renderAll();
        break;
      }

      /* --- บัญชีบริษัทและการซิงก์ --- */
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
        var leave = function () {
          if (global.OrbitSync) global.OrbitSync.stop();
          S.wipeLocal();
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
        global.OrbitSync.pullNow().then(function () { renderAll(); });
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
        S.setCurrentUser(id);
        closeModal();
        toast(L('สลับเป็น') + ' ' + S.user(id).name + ' ' + L('แล้ว'));
        break;
      }

      /* --- settings --- */
      case 'show-shortcuts': openModal(shortcutsModal(), true); break;
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
        var was = !meN.prefs || !meN.prefs.notify || !(nk in meN.prefs.notify)
          ? true : !!meN.prefs.notify[nk];
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
        if (!confirm(L('ล้างข้อมูลทั้งหมดและเริ่มใหม่?\nแนะนำให้ดาวน์โหลดสำรองก่อน'))) break;
        S.reset();
        closeModal();
        state.route = { type: 'home' };
        state.openTaskId = null;
        clearSel();
        renderAll();
        break;

      case 'undo': doUndo(); break;
      case 'close-modal': closeModal(); break;
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

    if (act === 'photo-file') { takePhoto(el); return; }
    if (act === 'att-file') { takeAttachment(el); return; }

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
      return;
    }

    // แก้หลายงานพร้อมกัน
    if (act === 'bulk-assignee' && el.value) {
      S.bulkUpdate(selectedIds(), { assigneeId: el.value });
      clearSel();
      return;
    }
    if (act === 'bulk-priority' && el.value) {
      S.bulkUpdate(selectedIds(), { priority: el.value });
      clearSel();
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
      case 'edit-due': S.updateTask(id, { dueOn: el.value || null }); break;
      case 'edit-start': S.updateTask(id, { startOn: el.value || null }); break;
      case 'edit-duetime': S.updateTask(id, { dueTime: el.value || null }); break;
      case 'edit-type': S.updateTask(id, { type: el.value }); break;
      case 'edit-recur':
        S.updateTask(id, {
          recur: el.value ? { freq: el.value, interval: (t.recur && t.recur.interval) || 1 } : null
        });
        break;
      case 'edit-recur-n': {
        var n = parseInt(el.value, 10);
        if (!n || n < 1) n = 1;
        if (t.recur) S.updateTask(id, { recur: { freq: t.recur.freq, interval: n } });
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

  document.addEventListener('input', function (e) {
    if (e.target.classList && e.target.classList.contains('dw-title')) autoGrow(e.target);

    if (e.target.id === 'depSearch') {
      var box = document.getElementById('depResults');
      var tid = $modal.querySelector('[data-act="do-add-dependency"]');
      var owner = tid ? tid.dataset.id : state.openTaskId;
      if (box && owner) box.innerHTML = depResults(owner, e.target.value);
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

    if (e.target.id === 'searchInput') {
      var q = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        if (q.trim()) {
          state.route = { type: 'search', q: q.trim() };
          $sidebar.innerHTML = R.sidebar(state.route);
          renderViewBody();
          syncHash();
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
    var typing = ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(e.target.tagName) >= 0;

    /* เพิ่มงานย่อยด้วยการกด Enter แล้วช่องยังโฟกัสอยู่
     * พิมพ์รายการยาว ๆ ต่อได้รวดเดียวโดยไม่ต้องกดปุ่มใหม่ทุกครั้ง */
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
      if ($mdBack.classList.contains('open')) { closeModal(); return; }
      if (document.querySelector('.pop')) { closePops(); return; }
      if (optOpen()) { closeOpts(); return; }
      if (document.getElementById('sidebar').classList.contains('open')) { closeSidebar(); return; }
      if (selCount()) { clearSelUI(); return; }
      if (state.openTaskId) closeDrawer();
      return;
    }

    if (e.key === 'Enter' && e.ctrlKey) {
      var box = document.getElementById('commentInput');
      if (box && document.activeElement === box && box.value.trim()) {
        if (!S.can('comment')) { denyToast(); e.preventDefault(); return; }
        S.addComment(state.openTaskId, box.value);
        e.preventDefault();
      }
      return;
    }

    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z') && !typing) {
      e.preventDefault();
      if (!S.can('write')) { denyToast(); return; }
      doUndo();
      return;
    }
    if (e.ctrlKey && e.key === '/') {
      e.preventDefault();
      openModal(shortcutsModal(), true);
      return;
    }

    // Tab + key แบบ Asana
    if (e.key === 'Tab' && !typing && S.pref('shortcuts')) {
      tabHeld = true;
      e.preventDefault();
      return;
    }
    if (tabHeld && !typing) {
      var k = e.key.toLowerCase();
      var handled = true;
      if (k === 'h') { state.route = { type: 'home' }; clearSel(); renderAll(); }
      else if (k === 'z') { state.route = { type: 'mytasks' }; clearSel(); renderAll(); }
      else if (k === 'i') { state.route = { type: 'inbox' }; clearSel(); renderAll(); }
      else if (k === 'q' && state.route.type === 'project') {
        var qp2 = S.project(state.route.id);
        if (!S.can('write')) { denyToast(); return; }
        var qn2 = prompt(L('ชื่องานใหม่'));
        if (qn2 && qn2.trim()) {
          openTask(S.createTask({ name: qn2.trim() }, qp2.id, qp2.sections[0].id).id);
        }
      } else if (k === 'm' && state.openTaskId) {
        if (!S.can('write', state.openTaskId)) { denyToast(); return; }
        S.updateTask(state.openTaskId, { assigneeId: S.db.currentUserId });
        toast(L('มอบหมายให้ตัวเองแล้ว'));
      } else if (k === 'c' && state.openTaskId) {
        var ci = document.getElementById('commentInput');
        if (ci) ci.focus();
      } else if (k === 'x') {
        var cur2 = (S.db.settings && S.db.settings.theme) || 'auto';
        S.setSetting('theme', cur2 === 'dark' ? 'light' : 'dark');
        toast(L('สลับธีมแล้ว'));
      } else { handled = false; }
      if (handled) { e.preventDefault(); tabHeld = false; return; }
    }

    if (e.key === '/' && !typing) { focusSearch(); e.preventDefault(); return; }

    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && selCount()) {
      e.preventDefault();
      if (!S.can('write')) { denyToast(); return; }
      var ids2 = selectedIds();
      if (confirm(L('ลบ') + ' ' + ids2.length + ' ' + L('งาน?'))) {
        S.deleteTasks(ids2);
        clearSel();
        toast(L('ลบแล้ว'), L('ย้อนกลับ'), 'undo');
      }
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
      document.querySelectorAll('.dragging,.drop-before,.drag-over'),
      function (x) { x.classList.remove('dragging', 'drop-before', 'drag-over'); }
    );
  }

  document.addEventListener('dragover', function (e) {
    if (!drag.id) return;
    var zone = e.target.closest ? e.target.closest('.col-body, .sec-body') : null;
    if (!zone || !zone.dataset.section) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    Array.prototype.forEach.call(document.querySelectorAll('.drop-before'), function (x) {
      x.classList.remove('drop-before');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.drag-over'), function (x) {
      x.classList.remove('drag-over');
    });
    var col = zone.closest('.col');
    if (col) col.classList.add('drag-over');

    var over = e.target.closest('.card, .row');
    if (over && over.dataset.id !== drag.id) {
      var r = over.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) over.classList.add('drop-before');
      else if (over.nextElementSibling) over.nextElementSibling.classList.add('drop-before');
    }
  });

  document.addEventListener('drop', function (e) {
    if (!drag.id) return;
    var zone = e.target.closest ? e.target.closest('.col-body, .sec-body') : null;
    if (!zone || !zone.dataset.section) return;
    e.preventDefault();

    var toSection = zone.dataset.section;
    var marker = document.querySelector('.drop-before');
    var beforeId = marker ? marker.dataset.id : null;
    var movingId = drag.id;

    clearDragMarks();
    drag.id = null;

    if (state.route.type !== 'project') return;
    S.moveTask(movingId, state.route.id, toSection, beforeId);
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
    $gate.innerHTML = R.gateScreen(gate);
    $gate.hidden = false;
    document.body.classList.add('gated');
  }
  function hideGate() {
    if (!$gate) return;
    $gate.hidden = true;
    $gate.innerHTML = '';
    document.body.classList.remove('gated');
  }

  /** ตัดสินว่าจะเข้าโหมดทีมหรือเครื่องเดียว แล้ววาดหน้าจอให้ตรงกัน */
  function bootAccount() {
    if (!R.teamReady()) return;      // ยังไม่ได้ตั้งค่า หรือโหลดไลบรารีไม่ได้ = ใช้แบบเดิม

    if (!localOnly()) { gate.checking = true; showGate(); }

    global.OrbitAuth.init().then(function (signedIn) {
      gate.checking = false;

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

  /* ข้อมูลถูกแทนทั้งก้อนจากส่วนกลาง — ต้องวาดใหม่ ไม่งั้นหน้าจอค้างที่ของเก่า */
  global.addEventListener('orbit:replaced', function () { renderAll(); });

  /* ปิดหน้าต่างระหว่างที่ยังส่งไม่เสร็จ = งานหาย ต้องรีบส่งก่อน */
  global.addEventListener('beforeunload', function (e) {
    if (!global.OrbitSync || global.OrbitSync.state.mode !== 'team') return;
    if (!global.OrbitSync.state.dirty) return;
    global.OrbitSync.flush();
    e.preventDefault();
    e.returnValue = '';
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
    return ['project', 'portfolio', 'search', 'profile'].indexOf(parsed.route.type) >= 0;
  }

  var boot = readHash();
  var land = S.pref('landing');
  var useLanding = land && !isReload() && !isDeepLink(boot);

  if (boot && !useLanding) {
    state.route = boot.route;
    state.openTaskId = boot.taskId && S.task(boot.taskId) ? boot.taskId : null;
  } else if (useLanding && land !== 'home') {
    state.route = { type: land };
  } else if (!boot && (global.location.hash || '').indexOf('#/task/') === 0) {
    var tid2 = global.location.hash.replace('#/task/', '');
    if (S.task(tid2)) state.openTaskId = tid2;
  }
  renderAll();
  bootAccount();

  if (S.storageKind === 'memory') {
    setTimeout(function () {
      toast(L('โหมดทดลอง — ข้อมูลจะหายเมื่อรีเฟรช กด “ดาวน์โหลดสำรอง” เพื่อเก็บงานไว้'));
    }, 700);
  }

})(window);

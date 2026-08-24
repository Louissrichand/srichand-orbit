/* Orbit — interaction layer
 * routing (hash), event delegation, drag & drop, keyboard, modals
 */
(function (global) {
  'use strict';

  var S = global.Store, R = global.Render, L = global.I18N.t, I = global.Icons.icon;

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
    ganttZoom: 'month',
    ganttCollapsed: {},
    ganttScroll: null,
    tlScrollLeft: null,      // ตำแหน่งเลื่อนไทม์ไลน์ (null = ให้เลื่อนไปวันนี้เอง)
    suppressHash: false,
    auditFilter: { group: '', q: '' }   // ตัวกรองบันทึกการทำงานในหน้าผู้ดูแล
  };

  function viewFor(projectId) {
    if (!state.views[projectId]) state.views[projectId] = S.defaultView();
    return state.views[projectId];
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

  /** ตั้งภาษาให้ตรงกับที่ผู้ใช้เลือก ถ้ายังไม่เคยเลือกให้เดาจากเบราว์เซอร์ */
  function applyLang() {
    var l = (S.db.settings && S.db.settings.lang) || global.I18N.detect();
    global.I18N.setLang(l);
  }

  function applyTheme() {
    var th = (S.db.settings && S.db.settings.theme) || 'auto';
    if (th === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th);
  }

  /* ---------- hash routing ---------- */

  function buildHash() {
    var r = state.route, parts;
    if (r.type === 'project') parts = ['project', r.id, r.view];
    else if (r.type === 'search') parts = ['search', encodeURIComponent(r.q)];
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
      var v = seg[2] || p.defaultView || 'list';
      var ok = R.TAB_IDS.indexOf(v) >= 0;
      return { route: { type: 'project', id: seg[1], view: ok ? v : 'list' }, taskId: taskId };
    }
    if (type === 'search' && seg[1]) {
      return { route: { type: 'search', q: decodeURIComponent(seg[1]) }, taskId: taskId };
    }
    if (['home', 'mytasks', 'inbox', 'calendar', 'admin'].indexOf(type) >= 0) {
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
      else if (r.view === 'gantt') body = ganttToolbar() +
        R.ganttView(r.id, v, state.ganttZoom, state.ganttCollapsed);
      else if (r.view === 'calendar') body = R.calendarView(r.id, state.calOffset);
      else if (r.view === 'dashboard') body = R.dashboardView(r.id);
      else body = R.listView(r.id, v, state.sel);
    } else if (r.type === 'mytasks') {
      body = R.myTasksView(state.sel);
    } else if (r.type === 'inbox') {
      body = R.inboxView(state.inboxArchived);
    } else if (r.type === 'calendar') {
      body = R.calendarView(null, state.calOffset);
    } else if (r.type === 'admin') {
      // ไม่ใช่ผู้ดูแลก็ไม่ต้องเห็น — เป็นเรื่องความเรียบร้อยของเมนู ไม่ใช่การกันสิทธิ์จริง
      if (!S.isAdmin()) { state.route = { type: 'home' }; return renderAll(); }
      body = R.adminView(state.auditFilter);
    } else if (r.type === 'search') {
      body = R.searchView(r.q, state.sel);
    }

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

  /** แถบเครื่องมือเหนือ Gantt */
  function ganttToolbar() {
    var zooms = [['day', L('วัน')], ['week', L('สัปดาห์')], ['month', L('เดือน')], ['quarter', L('ไตรมาส')]];
    var h = '<div class="g-toolbar"><div class="segmented">';
    zooms.forEach(function (z) {
      h += '<button data-act="g-zoom" data-v="' + z[0] + '" class="' +
        (state.ganttZoom === z[0] ? 'on' : '') + '">' + z[1] + '</button>';
    });
    h += '</div>';
    h += '<button class="btn btn-sm" data-act="g-today">' + L('ไปวันนี้') + '</button>';
    h += '<button class="btn btn-sm btn-ghost" data-act="g-expand-all">' + L('ขยายทุกกลุ่ม') + '</button>';
    h += '<button class="btn btn-sm btn-ghost" data-act="g-collapse-all">' + L('ย่อทุกกลุ่ม') + '</button>';
    h += '<span class="g-hint">' + L('ลากแท่ง = เลื่อนวัน · ลากขอบ = ยืด/หด ·') + ' ' +
      L('ลากจุดวงกลมปลายแท่งไปอีกงาน = สร้างลำดับ · คลิกเส้น = ลบลำดับ') + '</span>';
    h += '</div>';
    return h;
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
    sc.scrollLeft = Math.max(0, x + R.G_LEFT - sc.clientWidth / 2);
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
    if (state.route.type === 'project' && S.project(state.route.id) &&
        ['list', 'board', 'timeline'].indexOf(state.route.view) >= 0) {
      html += R.viewbar(state.route.id, viewFor(state.route.id));
    }
    $topbar.innerHTML = html;
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
      $drawer.innerHTML = R.drawer(state.openTaskId);
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
    state.route = { type: 'project', id: id, view: view || p.defaultView || 'list' };
    state.calOffset = 0;
    state.tlScrollLeft = null;
    clearSel();
    renderAll();
  }

  function openTask(id) {
    if (!S.task(id)) return;
    state.openTaskId = id;
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
        h += '<div class="field" style="margin-top:12px"><label>' + L('เพิ่มสมาชิก') + '</label>' +
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
  function projectMenuModal(projectId) {
    var p = S.project(projectId);
    var h = '<h2>' + R.esc(p.icon) + ' ' + R.esc(p.name) + '</h2>';
    h += '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<button class="btn" data-act="project-access" data-id="' + R.esc(projectId) + '">' + I('shield', 14) + ' ' + L('ใครเข้าถึงโปรเจกต์นี้ได้') + (p.visibility === 'private' ? ' <span class="chip">' + L('ปิด') + '</span>' : '') + '</button>' +
      '<button class="btn" data-act="edit-project" data-id="' + R.esc(projectId) + '">' + I('pencil', 14) + ' ' + L('แก้ไขชื่อ / สี / ไอคอน') + '</button>' +
      '<button class="btn" data-act="update-status" data-id="' + R.esc(projectId) + '">' + I('flag', 14) + ' ' + L('อัปเดตสถานะโปรเจกต์') + '</button>' +
      '<button class="btn" data-act="manage-fields" data-id="' + R.esc(projectId) + '">' + I('filter', 14) + ' ' + L('จัดการฟิลด์') + '</button>' +
      '<button class="btn" data-act="reset-cols" data-id="' + R.esc(projectId) + '">' + I('arrowLeft', 14) + ' ' + L('คืนความกว้างคอลัมน์เดิม') + '</button>' +
      '<button class="btn" data-act="manage-rules" data-id="' + R.esc(projectId) + '">' + I('repeat', 14) + ' ' + L('กฎอัตโนมัติ') + '</button>' +
      '<button class="btn" data-act="dup-project" data-id="' + R.esc(projectId) + '">' + I('copy', 14) + ' ' + L('คัดลอกเป็นเทมเพลต') + '</button>' +
      '<button class="btn" data-act="toggle-archive" data-id="' + R.esc(projectId) + '">' +
      (p.archived ? I('arrowLeft', 14) + ' ' + L('เอากลับจากคลัง') : I('archive', 14) + ' ' + L('เก็บเข้าคลัง')) + '</button>' +
      '<button class="btn btn-danger" data-act="delete-project" data-id="' + R.esc(projectId) + '">' + I('trash', 14) + ' ' + L('ลบโปรเจกต์') + '</button>' +
      '</div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
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

  function statusModal(projectId) {
    var p = S.project(projectId);
    var cur = p.status || { state: 'on_track', text: '' };
    var h = '<h2>' + L('อัปเดตสถานะ') + ' ' + R.esc(p.name) + '</h2>';
    h += '<div class="field"><label>' + L('สถานะ') + '</label><select id="stState">';
    S.PROJECT_STATES.forEach(function (x) {
      h += '<option value="' + x.id + '"' + (cur.state === x.id ? ' selected' : '') + '>' +
        R.esc(L(x.label)) + '</option>';
    });
    h += '</select></div>';
    h += '<div class="field"><label>' + L('สรุปให้ทีมอ่าน') + '</label>' +
      '<textarea id="stText" rows="4" placeholder="' + L('งานเดินถึงไหน ติดอะไร ต้องการอะไร') + '">' +
      R.esc(cur.text) + '</textarea></div>';
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
    var h = '<h2>' + L('เพิ่มสมาชิก') + '</h2>';

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

  function attachmentModal(taskId) {
    return '<h2>' + L('แนบไฟล์หรือลิงก์') + '</h2>' +
      '<p style="font-size:13px;color:var(--fg-soft);margin:0 0 14px">' +
      L('ระบบยังไม่เก็บตัวไฟล์จริง ให้ใส่ชื่อไฟล์และวางลิงก์จาก SharePoint / OneDrive / Google Drive') + '</p>' +
      '<div class="field"><label>' + L('ชื่อไฟล์') + '</label><input id="atName" placeholder="' + L('เช่น brief.pdf') + '"></div>' +
      '<div class="field"><label>' + L('ลิงก์ (ไม่บังคับ)') + '</label><input id="atUrl" placeholder="https://…"></div>' +
      '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
      '<button class="btn btn-primary" data-act="do-add-attachment" data-id="' + R.esc(taskId) +
      '">' + L('แนบ') + '</button></div>';
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

  function settingsModal() {
    var db = S.db;
    var th = (db.settings && db.settings.theme) || 'auto';
    var h = '<h2>' + L('ตั้งค่า / สำรองข้อมูล') + '</h2>';

    h += '<div class="field"><label>' + L('ธีม') + '</label><div class="segmented">' +
      '<button data-act="set-theme" data-v="auto" class="' + (th === 'auto' ? 'on' : '') + '">' + L('ตามระบบ') + '</button>' +
      '<button data-act="set-theme" data-v="light" class="' + (th === 'light' ? 'on' : '') + '">' + L('สว่าง') + '</button>' +
      '<button data-act="set-theme" data-v="dark" class="' + (th === 'dark' ? 'on' : '') + '">' + L('มืด') + '</button>' +
      '</div></div>';

    var lg = global.I18N.getLang();
    h += '<div class="field"><label>' + L('ภาษา') + '</label><div class="segmented">' +
      '<button data-act="set-lang" data-v="th" class="' + (lg === 'th' ? 'on' : '') + '">ไทย</button>' +
      '<button data-act="set-lang" data-v="en" class="' + (lg === 'en' ? 'on' : '') + '">English</button>' +
      '</div></div>';

    h += '<div class="mini-row"><div class="grow"><div>' + L('ข้อมูลปัจจุบัน') + '</div><div class="sub">' +
      db.projects.length + ' ' + L('โปรเจกต์ ·') + ' ' + db.tasks.length + ' ' + L('งาน ·') + ' ' +
      db.users.length + ' ' + L('สมาชิก ·') + ' ' + db.notifications.length + ' ' + L('แจ้งเตือน') + '</div></div></div>';

    if (S.storageKind === 'memory') {
      h += '<p style="font-size:13px;line-height:1.6;margin:14px 0;padding:10px 12px;' +
        'background:var(--warn-bg);color:var(--warn-fg);border-radius:var(--radius)">' +
        '<strong>' + L('โหมดทดลอง') + '</strong> ' + L('— เบราว์เซอร์นี้ไม่อนุญาตให้เก็บข้อมูล') + ' ' +
        L('ใช้งานได้ครบทุกอย่าง แต่') + '<strong>' + L('ข้อมูลจะหายเมื่อรีเฟรชหน้า') + '</strong> ' +
        L('ถ้าอยากเก็บงานไว้ ให้กด “ดาวน์โหลดสำรอง” ก่อนปิดหน้า') + '</p>';
    } else {
      h += '<p style="font-size:13px;color:var(--fg-soft);line-height:1.6;margin:14px 0">' +
        L('ข้อมูลเก็บอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น ควรกด “ดาวน์โหลดสำรอง” เก็บไว้สม่ำเสมอ') + ' ' +
        L('ถ้าล้างข้อมูลเบราว์เซอร์ ข้อมูลจะหายทั้งหมด') + '</p>';
    }

    h += '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn" data-act="export">' + I('arrowDown', 14) + ' ' + L('ดาวน์โหลดสำรอง') + '</button>' +
      '<button class="btn" data-act="import">' + I('arrowUp', 14) + ' ' + L('กู้คืนจากไฟล์') + '</button>' +
      '<button class="btn" data-act="manage-templates">' + I('star', 14) + ' ' + L('เทมเพลตงาน') + '</button></div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
      '<button class="btn" data-act="copy-backup">' + I('copy', 14) + ' ' + L('คัดลอกข้อมูล') + '</button>' +
      '<button class="btn" data-act="paste-backup">' + I('paperclip', 14) + ' ' + L('วางข้อมูลกู้คืน') + '</button>' +
      '<button class="btn btn-danger" data-act="reset">' + L('ล้างและเริ่มใหม่') + '</button></div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
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

  function downloadDirect(json, filename) {
    var blob = new Blob([json], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast(L('ดาวน์โหลดไฟล์สำรองแล้ว'));
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
    var label = S.undo();
    clearSel();
    if (state.openTaskId && !S.task(state.openTaskId)) state.openTaskId = null;
    toast(L('ย้อนกลับแล้ว:') + ' ' + label);
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
      'disable-user', 'enable-user',
      'delete-project', 'reset', 'import', 'paste-backup', 'do-paste-import'
    ]);
    put('structure', [
      'new-project', 'create-project', 'edit-project', 'save-project', 'dup-project',
      'toggle-archive', 'update-status', 'save-status',
      'add-section', 'rename-section', 'delete-section', 'move-section',
      'manage-fields', 'add-field', 'delete-field', 'create-field', 'rename-field',
      'drop-field', 'add-field-picker', 'pick-ftype', 'add-option', 'remove-option',
      'opt-color', 'set-opt-color',
      'manage-rules', 'add-rule', 'delete-rule',
      'manage-templates', 'delete-template', 'save-template', 'use-template',
      'save-view', 'delete-view', 'reset-cols'
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
      'pick-follower', 'toggle-like'
    ]);
    return map;
  })();

  /** งานที่คำสั่งนี้กำลังจะแก้ ใช้ตัดสินสิทธิ์ระดับ "แก้เฉพาะงานของตัวเอง" */
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
         'add-field-picker', 'field-menu', 'opt-color', 'edit-cell'].indexOf(el.dataset.act) < 0) {
      if (!e.target.closest || !e.target.closest('.pop')) closePops();
    }

    if ($scrim && e.target === $scrim) { closeSidebar(); return; }
    if (e.target === $mdBack) { closeModal(); return; }
    if (e.target === $dwBack) { closeDrawer(); return; }
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
        state.route = { type: rt };
        state.calOffset = 0;
        clearSel();
        renderAll();
        break;
      }
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
      case 'g-zoom':
        state.ganttZoom = el.dataset.v;
        state.ganttScroll = null;
        renderViewBody();
        break;
      case 'g-today':
        state.ganttScroll = null;
        scrollGanttToToday();
        break;
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
        break;
      }
      case 'reset-view':
        state.views[state.route.id] = S.defaultView();
        renderAll();
        break;
      case 'save-view': {
        var nm = prompt(L('ตั้งชื่อมุมมองนี้'));
        if (!nm || !nm.trim()) break;
        S.saveView(state.route.id, nm.trim(), viewFor(state.route.id));
        toast(L('บันทึกมุมมองแล้ว'));
        break;
      }
      case 'load-view': {
        var p2 = S.project(state.route.id);
        var sv = p2.savedViews.filter(function (x) { return x.id === id; })[0];
        if (sv) { state.views[state.route.id] = S.clone(sv.view); renderAll(); }
        break;
      }
      case 'delete-view':
        e.stopPropagation();
        S.deleteSavedView(state.route.id, id);
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
        if (!tk2 || !confirm(L('ลบงาน “') + tk2.name + '” ?')) break;
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
      case 'do-add-attachment': {
        var an = document.getElementById('atName').value.trim();
        if (!an) { toast(L('ใส่ชื่อไฟล์ก่อน')); break; }
        S.addAttachment(id, an, document.getElementById('atUrl').value.trim());
        closeModal();
        break;
      }
      case 'remove-attachment': S.removeAttachment(id, el.dataset.att); break;

      /* --- tags --- */
      case 'add-tag': {
        var tg = prompt(L('ชื่อแท็ก'));
        if (!tg || !tg.trim()) break;
        var tt2 = S.task(id);
        if (tt2.tags.indexOf(tg.trim()) < 0) {
          S.updateTask(id, { tags: tt2.tags.concat([tg.trim()]) });
        }
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
        if (S.task(tid)) openTask(tid);
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
      case 'project-menu': openModal(projectMenuModal(id)); break;
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
      case 'update-status': openModal(statusModal(id || state.route.id)); break;
      case 'save-status':
        S.setProjectStatus(id, document.getElementById('stState').value,
          document.getElementById('stText').value.trim());
        closeModal();
        toast(L('อัปเดตสถานะแล้ว'));
        break;
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
        if (!confirm(L('ปิดใช้งานบัญชีของ “{name}”?\nเขาจะเข้าระบบไม่ได้ทันที แต่งานที่มอบหมายไว้ยังอยู่ครบ',
          { name: du.name }))) break;
        if (!S.setActive(id, false)) { toast(L('ปิดบัญชีนี้ไม่ได้')); break; }
        renderAll();
        toast(L('ปิดใช้งานบัญชีแล้ว'), L('ย้อนกลับ'), 'undo');
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
            I(r.id === 'admin' ? 'shield' : r.id === 'viewer' ? 'search' : 'users') +
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

      case 'switch-user': {
        var uh = '';
        S.db.users.forEach(function (u) {
          uh += '<button class="btn" style="justify-content:flex-start" ' +
            'data-act="do-switch-user" data-id="' + R.esc(u.id) + '">' +
            R.avatar(u) + ' ' + R.esc(u.name) + '</button>';
        });
        openModal('<h2>' + L('สลับผู้ใช้') + '</h2><div style="display:flex;flex-direction:column;gap:6px">' +
          uh + '</div><div class="modal-acts">' +
          '<button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>');
        break;
      }
      case 'do-switch-user':
        S.setCurrentUser(id);
        closeModal();
        toast(L('สลับเป็น') + ' ' + S.user(id).name + ' ' + L('แล้ว'));
        break;

      /* --- settings --- */
      case 'show-shortcuts': openModal(shortcutsModal(), true); break;
      case 'open-settings': openModal(settingsModal()); break;
      case 'set-lang':
        S.setSetting('lang', el.dataset.v);
        global.I18N.setLang(el.dataset.v);
        renderAll();
        openModal(settingsModal());
        break;
      case 'set-theme':
        S.setSetting('theme', el.dataset.v);
        openModal(settingsModal());
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
    if (!b) return;
    Array.prototype.forEach.call($modal.querySelectorAll('#pColors button'), function (x) {
      x.classList.remove('on');
    });
    b.classList.add('on');
  });

  /* ---------- change events ---------- */

  document.addEventListener('change', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.dataset.act;
    if (!allowed(act, el)) { renderAll(); return; }   // วาดใหม่เพื่อคืนค่าเดิมให้ช่องกรอก

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

    if (e.key === 'Escape') {
      if ($mdBack.classList.contains('open')) { closeModal(); return; }
      if (document.querySelector('.pop')) { closePops(); return; }
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
    if (e.key === 'Tab' && !typing) {
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
          pane: pane, key: 'gLeft', startX: e.clientX,
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
      dayW: isG ? (R.G_ZOOMS[state.ganttZoom] || R.G_ZOOMS.month).w
                : (R.ZOOMS[state.tlZoom] || R.ZOOMS.day),
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
        S.setColWidth(state.route.id, d.key, d.last);
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
    toast(L('เลื่อนวันแล้ว'), L('ย้อนกลับ'), 'undo');
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

  var boot = readHash();
  if (boot) {
    state.route = boot.route;
    state.openTaskId = boot.taskId && S.task(boot.taskId) ? boot.taskId : null;
  } else if ((global.location.hash || '').indexOf('#/task/') === 0) {
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

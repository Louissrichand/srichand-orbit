/* Orbit — rendering
 *
 * ทุกฟังก์ชันที่นี่คืน HTML string ล้วน ไม่ผูก event
 * การผูก event ทำที่ main.js ผ่าน data-act (event delegation)
 */
(function (global) {
  'use strict';

  var S = global.Store, L = global.I18N.t, I = global.Icons.icon;

  function MON()  { return global.I18N.monthsShort(); }
  function MONF() { return global.I18N.monthsFull(); }
  function DOW()  { return global.I18N.dow(); }
  function YR(y)   { return global.I18N.year(y); }

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initials(name) {
    var n = (name || '?').trim();
    var parts = n.split(/\s+/);
    if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }

  function avatar(u, size) {
    var cls = 'avatar' + (size ? ' ' + size : '');
    if (!u) return '<span class="' + cls + ' avatar-empty">+</span>';
    /* คนที่ตั้งสถานะไม่อยู่ ติดจุดส้มไว้ที่วงกลม
     * คนที่กำลังจะมอบหมายงานให้จะได้เห็นก่อนกด ไม่ใช่รู้ตอนงานเลยกำหนดไปแล้ว */
    var away = S.isAway && S.isAway(u.id);
    return '<span class="' + cls + (away ? ' is-away' : '') + '" style="background:' +
      esc(u.color) + '" title="' + esc(u.name) +
      (away ? ' · ' + L('ไม่อยู่ถึง {d}', { d: fmtDate(u.away.until) }) +
              (u.away.note ? ' · ' + u.away.note : '') : '') +
      '">' + esc(initials(u.name)) + '</span>';
  }

  /** วันแรกของสัปดาห์ 0 = อาทิตย์ 1 = จันทร์
   *  อัตโนมัติ = ไทยเริ่มอาทิตย์ อังกฤษเริ่มจันทร์ ตามที่แต่ละที่ใช้กันจริง */
  function weekStart() {
    var fd = S.pref ? S.pref('firstDay') : 'auto';
    if (fd === 'mon') return 1;
    if (fd === 'sun') return 0;
    return global.I18N.getLang() === 'en' ? 1 : 0;
  }

  /** ชื่อวันเรียงตามวันแรกของสัปดาห์ที่ตั้งไว้ */
  function DOWR() {
    var d = DOW(), ws = weekStart();
    return d.slice(ws).concat(d.slice(0, ws));
  }

  function fmtDate(isoStr) {
    if (!isoStr) return '';
    var p = String(isoStr).split('-');
    if (p.length !== 3) return String(isoStr);
    var t = S.today();
    if (isoStr === t) return L('วันนี้');
    if (isoStr === S.addDays(t, 1)) return L('พรุ่งนี้');
    if (isoStr === S.addDays(t, -1)) return L('เมื่อวาน');
    var s = parseInt(p[2], 10) + ' ' + MON()[parseInt(p[1], 10) - 1];
    if (p[0] !== t.split('-')[0]) s += ' ' + global.I18N.yearShort(parseInt(p[0], 10));
    return s;
  }

  function dueClass(isoStr, completed) {
    if (!isoStr || completed) return '';
    var t = S.today();
    if (isoStr < t) return ' due-over';
    if (isoStr === t) return ' due-today';
    return '';
  }

  function fmtWhen(isoTs) {
    var d = new Date(isoTs);
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return L('เมื่อครู่');
    if (mins < 60) return mins + ' ' + L('นาทีที่แล้ว');
    if (mins < 1440) return Math.round(mins / 60) + ' ' + L('ชม.ที่แล้ว');
    return fmtDate(S.iso(d));
  }

  function prio(id) {
    return S.PRIORITIES.filter(function (p) { return p.id === id; })[0] || S.PRIORITIES[4];
  }
  function taskType(id) {
    return S.TASK_TYPES.filter(function (p) { return p.id === id; })[0] || S.TASK_TYPES[0];
  }
  function approvalState(id) {
    return S.APPROVAL_STATES.filter(function (p) { return p.id === id; })[0] || S.APPROVAL_STATES[0];
  }
  function projectState(id) {
    return S.PROJECT_STATES.filter(function (p) { return p.id === id; })[0] || S.PROJECT_STATES[0];
  }
  function recurLabel(r) {
    if (!r) return '';
    var f = S.RECUR_FREQ.filter(function (x) { return x.id === r.freq; })[0];
    if (!f) return r.freq;
    if (r.interval > 1) {
      var unit = { daily: 'วัน', weekly: 'สัปดาห์', monthly: 'เดือน' }[r.freq] || '';
      return L('ทุก {n} ' + unit, { n: r.interval });
    }
    return L(f.label);
  }

  /** คำอธิบายชนิดความสัมพันธ์ระหว่างงาน ใช้ทั้งในแผงรายละเอียดและ Gantt */
  function depTypeHint(id) {
    var d = S.DEP_TYPES.filter(function (x) { return x.id === id; })[0];
    return d ? L(d.label) + ' — ' + L(d.hint) : id;
  }

  var ICON = {
    search: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
    check: '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.5L5 9l4.5-5.5"/></svg>'
  };

  /* ---------- sidebar ---------- */

  function sidebar(route) {
    var db = S.db;
    var me = S.me();
    var mine = S.myTasks(db.currentUserId);
    var mineCount = mine.overdue.length + mine.today.length +
                    mine.upcoming.length + mine.later.length + mine.nodate.length;
    var unread = S.unreadCount(db.currentUserId);

    var h = '';
    h += '<div class="sb-brand">' + global.Icons.logoLockup(26) + '</div>';

    h += '<div class="sb-section">';
    h += '<button class="sb-item' + (route.type === 'home' ? ' active' : '') +
         '" data-act="go" data-route="home">' + I('home') + '' +
         '<span class="grow">' + L('หน้าแรก') + '</span></button>';
    h += '<button class="sb-item' + (route.type === 'mytasks' ? ' active' : '') +
         '" data-act="go" data-route="mytasks">' + I('checkCircle') + '' +
         '<span class="grow">' + L('งานของฉัน') + '</span>' +
         (mineCount ? '<span class="count">' + mineCount + '</span>' : '') + '</button>';
    h += '<button class="sb-item' + (route.type === 'inbox' ? ' active' : '') +
         '" data-act="go" data-route="inbox">' + I('bell') + '' +
         '<span class="grow">' + L('กล่องข้อความ') + '</span>' +
         (unread ? '<span class="count alert">' + unread + '</span>' : '') + '</button>';
    h += '<button class="sb-item' + (route.type === 'calendar' ? ' active' : '') +
         '" data-act="go" data-route="calendar">' + I('calendar') + '' +
         '<span class="grow">' + L('ปฏิทินรวม') + '</span></button>';
    h += '</div>';

    h += '<div class="sb-section">';
    h += '<div class="sb-label">' + L('โปรเจกต์') + '<button data-act="new-project" title="' + L('สร้างโปรเจกต์ใหม่') + '">+</button></div>';
    S.visibleProjects().forEach(function (p) {
      var n = S.tasksInProject(p.id).filter(function (x) { return !x.task.completed; }).length;
      h += '<button class="sb-item' +
        (route.type === 'project' && route.id === p.id ? ' active' : '') +
        '" data-act="go" data-route="project" data-id="' + esc(p.id) + '">' +
        '<span class="emoji">' + esc(p.icon) + '</span>' +
        '<span class="swatch" style="background:' + esc(p.color) + '"></span>' +
        "<span class=\"grow\">" + esc(p.name) + "</span>" +
        (p.visibility === "private" ? "<span class=\"lockmark\" title=\"" + L("โปรเจกต์ปิด") + "\">" + I("shield", 12) + "</span>" : "") +
        (n ? '<span class="count">' + n + '</span>' : '') + '</button>';
    });
    h += '</div>';

    /* พอร์ตโฟลิโอ วางไว้ใต้โปรเจกต์เพราะเป็นกล่องที่รวมของด้านบน
     * ซ่อนหัวข้อทั้งก้อนถ้ายังไม่มีใครสร้าง ไม่งั้นแถบซ้ายจะรกด้วยหัวข้อว่าง */
    var pfs = S.portfolios();
    if (pfs.length || S.can('structure')) {
      h += '<div class="sb-section">';
      h += '<div class="sb-label">' + L('พอร์ตโฟลิโอ') +
        (S.can('structure')
          ? '<button data-act="new-portfolio" title="' + L('สร้างพอร์ตโฟลิโอ') + '">+</button>' : '') +
        '</div>';
      pfs.forEach(function (f) {
        var n = S.portfolioProjects(f.id).length;
        h += '<button class="sb-item' +
          (route.type === 'portfolio' && route.id === f.id ? ' active' : '') +
          '" data-act="go" data-route="portfolio" data-id="' + esc(f.id) + '">' +
          '<span class="emoji">' + esc(f.icon) + '</span>' +
          '<span class="swatch" style="background:' + esc(f.color) + '"></span>' +
          '<span class="grow">' + esc(f.name) + '</span>' +
          (n ? '<span class="count">' + n + '</span>' : '') + '</button>';
      });
      h += '</div>';
    }

    h += '<div class="sb-section">';

    /* คลังก็ต้องกรองตามสิทธิ์เหมือนกัน ไม่งั้นเก็บเข้าคลังแล้วโปรเจกต์ปิดโผล่ให้ทุกคนเห็น */
    var archived = db.projects.filter(function (p) { return p.archived && S.projectAccess(p.id); });
    if (archived.length) {
      h += '<div class="sb-label" style="padding-top:14px">' + L('เก็บเข้าคลัง') + '</div>';
      archived.forEach(function (p) {
        h += '<button class="sb-item' +
          (route.type === 'project' && route.id === p.id ? ' active' : '') +
          '" data-act="go" data-route="project" data-id="' + esc(p.id) + '">' +
          '' + I('archive') + '<span class="grow">' + esc(p.name) + '</span></button>';
      });
    }
    h += '</div>';

    h += '<div class="sb-foot">';
    h += '<button class="sb-item" data-act="show-shortcuts">' + I('keyboard') + '' +
         '<span class="grow">' + L('คีย์ลัด') + '</span></button>';
    if (S.isAdmin()) {
      h += '<button class="sb-item' + (route.type === 'admin' ? ' active' : '') +
           '" data-act="go" data-route="admin">' + I('shield') + '' +
           '<span class="grow">' + L('ผู้ดูแลระบบ') + '</span></button>';
    }
    /* การสำรองข้อมูลเป็นงานของผู้ดูแล ไม่ใช่ของทุกคน
     * ปุ่มนี้เปิดหน้าที่ดึงฐานข้อมูลทั้งก้อนออกไปได้ จึงไม่ควรอยู่ในสายตาคนทั่วไป
     * คนทั่วไปเข้าตั้งค่าส่วนตัวได้จากเมนูบัญชีมุมล่างซ้ายอยู่แล้ว */
    h += '<button class="sb-item" data-act="open-settings" data-tab="' +
         (S.can('manage') ? 'data' : 'general') + '">' + I('settings') + '' +
         '<span class="grow">' +
         (S.can('manage') ? L('ข้อมูลและสำรอง') : L('ตั้งค่า')) + '</span></button>';
    h += accountBlock(me);
    h += '</div>';

    return h;
  }

  /* ---------- topbar ---------- */

  var TAB_IDS = ['list', 'board', 'timeline', 'gantt', 'calendar', 'dashboard'];

  /** คืนใหม่ทุกครั้งที่เรียก เพื่อให้เปลี่ยนภาษาแล้วแท็บเปลี่ยนตาม */
  function projectTabs() {
    return [
      ['list', L('รายการ')], ['board', L('บอร์ด')], ['timeline', L('ไทม์ไลน์')],
      ['gantt', 'Gantt'], ['calendar', L('ปฏิทิน')], ['dashboard', L('สรุปผล')]
    ];
  }

  function topbar(route) {
    var h = '<div class="tb-row">';
    h += '<button class="menu-btn" data-act="toggle-sidebar" title="' + L('เมนู') + '">' + I('menu') + '</button>';

    if (route.type === 'project') {
      var p = S.project(route.id);
      if (!p) return '';
      h += '<div style="min-width:0"><div class="tb-title"><span class="emoji">' + esc(p.icon) +
           '</span><span class="nm">' + esc(p.name) + '</span>';
      /* ป้ายสถานะเป็นปุ่ม ไม่ใช่ป้ายอ่านอย่างเดียว
       * ที่เดียวกับที่คนอ่านสถานะ คือที่ที่คนอยากแก้สถานะ ไม่ควรบังคับให้ไปหาในเมนู
       * โปรเจกต์ที่ยังไม่เคยรายงานต้องเห็นปุ่มด้วย ไม่งั้นจะไม่มีใครรู้ว่ารายงานได้ */
      if (p.status) {
        var st = projectState(p.status.state);
        h += '<button class="status-pill" data-act="status-menu" data-id="' + esc(p.id) +
             '" style="background:' + st.color + '22;color:' + st.color + '">' +
             '<i style="background:' + st.color + '"></i>' + esc(L(st.label)) +
             I('chevronDown', 12) + '</button>';
      } else {
        h += '<button class="status-pill empty" data-act="status-menu" data-id="' + esc(p.id) +
             '"><i></i>' + L('ตั้งสถานะ') + I('chevronDown', 12) + '</button>';
      }
      if (p.archived) h += '<span class="chip">' + L('เก็บเข้าคลังแล้ว') + '</span>';
      h += '</div>' +
        (p.description ? '<div class="tb-desc">' + esc(p.description) + '</div>' : '') +
        '</div>';
    } else if (route.type === 'portfolio') {
      var f = S.portfolio(route.id);
      if (!f) return '';
      h += '<div style="min-width:0"><div class="tb-title"><span class="emoji">' + esc(f.icon) +
           '</span><span class="nm">' + esc(f.name) + '</span>';
      if (f.status) {
        var fst = projectState(f.status.state);
        h += '<button class="status-pill" data-act="pf-status" data-id="' + esc(f.id) +
             '" style="background:' + fst.color + '22;color:' + fst.color + '">' +
             '<i style="background:' + fst.color + '"></i>' + esc(L(fst.label)) +
             I('chevronDown', 12) + '</button>';
      } else {
        h += '<button class="status-pill empty" data-act="pf-status" data-id="' + esc(f.id) +
             '"><i></i>' + L('ตั้งสถานะ') + I('chevronDown', 12) + '</button>';
      }
      h += '</div>' +
        (f.description ? '<div class="tb-desc">' + esc(f.description) + '</div>' : '') +
        '</div>';
    } else if (route.type === 'mytasks') {
      h += '<div class="tb-title">' + I('checkCircle', 20) + ' ' + L('งานของฉัน') + '</div>';
    } else if (route.type === 'inbox') {
      h += '<div class="tb-title">' + I('bell', 20) + ' ' + L('กล่องข้อความ') + '</div>';
    } else if (route.type === 'calendar') {
      h += '<div class="tb-title">' + I('calendar', 20) + ' ' + L('ปฏิทินรวม') + '</div>';
    } else if (route.type === 'admin') {
      h += '<div class="tb-title">' + I('shield', 20) + ' ' + L('ผู้ดูแลระบบ') + '</div>';
    } else if (route.type === 'search') {
      h += '<div class="tb-title">' + L('ผลการค้นหา “') + esc(route.q) + '”</div>';
    }

    h += '<div class="tb-spacer"></div>';
    h += syncChip();
    h += '<div class="search">' + ICON.search +
         '<input id="searchInput" type="search" placeholder="' + L('ค้นหางาน…  (/)') + '" value="' +
         esc(route.type === 'search' ? route.q : '') + '"></div>';

    if (route.type === 'project') {
      h += '<button class="btn btn-primary" data-act="quick-add">' + L('+ เพิ่มงาน') + '</button>';
      h += '<button class="btn btn-ghost" data-act="project-menu" data-id="' +
           esc(route.id) + '" title="' + L('เมนูโปรเจกต์') + '">' + I('more') + '</button>';
    } else if (route.type === 'inbox') {
      h += '<button class="btn" data-act="inbox-read-all">' + L('อ่านทั้งหมด') + '</button>';
      h += '<button class="btn" data-act="inbox-archive-all">' + L('เก็บทั้งหมด') + '</button>';
    } else if (route.type === 'portfolio') {
      h += '<button class="btn btn-primary" data-act="pf-add" data-pf="' + esc(route.id) + '">' +
           L('+ เพิ่มโปรเจกต์เข้าพอร์ต') + '</button>';
      h += '<button class="btn btn-ghost" data-act="pf-menu" data-id="' + esc(route.id) +
           '" title="' + L('เมนูพอร์ตโฟลิโอ') + '">' + I('more') + '</button>';
    }
    h += '</div>';

    if (route.type === 'project') {
      h += '<div class="tb-tabs">';
      projectTabs().forEach(function (v) {
        h += '<button class="tb-tab' + (route.view === v[0] ? ' active' : '') +
             '" data-act="set-view" data-view="' + v[0] + '">' + v[1] + '</button>';
      });
      h += '</div>';
    }
    if (route.type === 'portfolio') {
      h += '<div class="tb-tabs">';
      PF_TABS.forEach(function (v) {
        h += '<button class="tb-tab' + ((route.view || 'list') === v[0] ? ' active' : '') +
             '" data-act="set-view" data-view="' + v[0] + '">' + L(v[1]) + '</button>';
      });
      h += '</div>';
    }
    return h;
  }

  /* ---------- view bar ---------- */

  function viewbar(projectId, view) {
    var p = S.project(projectId);
    if (!p) return '';
    var h = '<div class="viewbar">';

    h += '<div class="vb-item"><label>' + L('ผู้รับผิดชอบ') + '</label><select data-act="f-assignee" class="' +
      (view.assignee ? 'on' : '') + '"><option value="">' + L('ทุกคน') + '</option>';
    S.db.users.forEach(function (u) {
      h += '<option value="' + esc(u.id) + '"' + (view.assignee === u.id ? ' selected' : '') +
        '>' + esc(u.name) + '</option>';
    });
    h += '</select></div>';

    h += '<div class="vb-item"><label>' + L('ความสำคัญ') + '</label><select data-act="f-priority" class="' +
      (view.priority ? 'on' : '') + '"><option value="">' + L('ทั้งหมด') + '</option>';
    S.PRIORITIES.forEach(function (x) {
      h += '<option value="' + x.id + '"' + (view.priority === x.id ? ' selected' : '') +
        '>' + esc(L(x.label)) + '</option>';
    });
    h += '</select></div>';

    var tags = S.allTags();
    if (tags.length) {
      h += '<div class="vb-item"><label>' + L('แท็ก') + '</label><select data-act="f-tag" class="' +
        (view.tag ? 'on' : '') + '"><option value="">' + L('ทั้งหมด') + '</option>';
      tags.forEach(function (tg) {
        h += '<option value="' + esc(tg) + '"' + (view.tag === tg ? ' selected' : '') +
          '>' + esc(tg) + '</option>';
      });
      h += '</select></div>';
    }

    h += '<div class="vb-item"><label>' + L('กำหนดส่ง') + '</label><select data-act="f-due" class="' +
      (view.due !== 'any' ? 'on' : '') + '">';
    S.DUE_FILTERS.forEach(function (x) {
      h += '<option value="' + x.id + '"' + (view.due === x.id ? ' selected' : '') +
        '>' + esc(L(x.label)) + '</option>';
    });
    h += '</select></div>';

    h += '<button class="vb-toggle' + (view.showCompleted ? '' : ' on') +
      '" data-act="f-completed">' + (view.showCompleted ? L('☑ แสดงงานที่เสร็จ') : L('☐ ซ่อนงานที่เสร็จ')) +
      '</button>';

    h += '<div class="vb-item"><label>' + L('เรียง') + '</label><select data-act="f-sort" class="' +
      (view.sort !== 'manual' ? 'on' : '') + '">';
    S.SORTS.forEach(function (x) {
      h += '<option value="' + x.id + '"' + (view.sort === x.id ? ' selected' : '') +
        '>' + esc(L(x.label)) + '</option>';
    });
    p.fields.forEach(function (f) {
      var k = 'field:' + f.id;
      h += '<option value="' + esc(k) + '"' + (view.sort === k ? ' selected' : '') +
        '>' + esc(f.name) + '</option>';
    });
    h += '</select>';
    if (view.sort !== 'manual') {
      h += '<button class="vb-toggle on" data-act="f-sortdir" title="' +
        L('สลับทิศการเรียง') + '">' +
        I(view.sortDir === 'desc' ? 'arrowDown' : 'arrowUp', 13) + '</button>';
    }
    h += '</div>';

    h += '<div class="vb-item"><label>' + L('จัดกลุ่ม') + '</label><select data-act="f-group" class="' +
      (view.group !== 'section' ? 'on' : '') + '">';
    S.GROUPS.forEach(function (x) {
      h += '<option value="' + x.id + '"' + (view.group === x.id ? ' selected' : '') +
        '>' + esc(L(x.label)) + '</option>';
    });
    h += '</select></div>';

    h += '<div class="vb-spacer"></div>';

    p.savedViews.forEach(function (v) {
      h += '<button class="savedview" data-act="load-view" data-id="' + esc(v.id) + '">' +
        esc(v.name) + '<span data-act="delete-view" data-id="' + esc(v.id) +
        '" title="' + L('ลบมุมมอง') + '">✕' + '</span></button>';
    });
    h += '<button class="btn btn-sm btn-ghost" data-act="save-view">' + L('บันทึกมุมมอง') + '</button>';
    h += '<button class="btn btn-sm btn-ghost" data-act="reset-view">' + L('ล้างตัวกรอง') + '</button>';
    h += '</div>';
    return h;
  }

  /* ---------- shared task pieces ---------- */

  function checkbox(t) {
    var cls = 'check' + (t.completed ? ' on' : '') + (t.type === 'milestone' ? ' milestone' : '');
    return '<button class="' + cls + '" data-act="toggle" data-id="' + esc(t.id) +
      '" title="' + L('ทำเสร็จ') + '">' + '<span>' + ICON.check + '</span></button>';
  }

  function selbox(t, selected) {
    return '<button class="selbox' + (selected ? ' on' : '') + '" data-act="select-task" data-id="' +
      esc(t.id) + '" title="' + L('เลือก') + '">' + ICON.check + '</button>';
  }

  /** ป้ายสถานะย่อย ๆ ที่ใช้ทั้งในแถวและการ์ด */
  function badges(t, opts) {
    var h = '';
    if (t.type === 'milestone') h += '<span class="chip">' + I('diamond', 11) + ' ' + L('หมุดหมาย') + '</span>';
    if (t.type === 'approval') {
      var a = approvalState(t.approval);
      h += '<span class="approval-pill" style="background:' + a.color + '22;color:' + a.color +
        '">' + esc(L(a.label)) + '</span>';
    }
    if (!t.completed && S.isBlocked(t.id)) {
      h += '<span class="chip blocked" title="' + L('รองานอื่นให้เสร็จก่อน') + '">' + I('blocked', 11) + ' ' + L('ถูกบล็อก') + '</span>';
    }
    if (t.recur) h += '<span class="chip recur" title="' + L('ทำซ้ำ') + '">' + I('repeat', 11) + ' ' + esc(recurLabel(t.recur)) + '</span>';

    var subs = S.subtasks(t.id);
    if (subs.length) {
      var doneSubs = subs.filter(function (s) { return s.completed; }).length;
      h += '<span class="chip">' + I('subtask', 11) + ' ' + doneSubs + '/' + subs.length + '</span>';
    }
    if (t.attachments.length) h += '<span class="chip">' + I('paperclip', 11) + ' ' + t.attachments.length + '</span>';
    if (t.likes.length) h += '<span class="chip">' + I('heart', 11) + ' ' + t.likes.length + '</span>';
    t.tags.forEach(function (tg) { h += '<span class="chip tag">' + esc(tg) + '</span>'; });

    if (opts && opts.showProject) {
      S.projectsOfTask(t.id).forEach(function (x) {
        h += '<span class="chip"><span class="swatch" style="background:' +
          esc(x.project.color) + '"></span>' + esc(x.project.name) + '</span>';
      });
    }
    if (t.dueOn) {
      h += '<span class="chip' + dueClass(t.dueOn, t.completed) + '">' + fmtDate(t.dueOn) +
        (t.dueTime ? ' ' + esc(t.dueTime) : '') + '</span>';
    }
    return h;
  }

  function taskRow(t, opts) {
    opts = opts || {};
    var u = S.user(t.assigneeId);
    var pr = prio(t.priority);

    var h = '<div class="row' + (t.completed ? ' done' : '') + (opts.selected ? ' sel' : '') +
      '" draggable="true" data-act="open-task" data-id="' + esc(t.id) + '"' +
      (opts.sectionId ? ' data-section="' + esc(opts.sectionId) + '"' : '') + '>';
    if (opts.selectable) h += selbox(t, opts.selected);
    h += checkbox(t);
    if (t.priority !== 'none') {
      h += '<span class="prio-bar" style="background:' + pr.color + '" title="' + L(pr.label) + '"></span>';
    }
    h += '<span class="nm">' + esc(t.name) + '</span>';
    h += '<span class="meta">' + badges(t, opts) + avatar(u, 'sm') + '</span>';
    h += '</div>';
    return h;
  }

  function taskCard(t, sectionId, opts) {
    opts = opts || {};
    var u = S.user(t.assigneeId);
    var pr = prio(t.priority);

    var h = '<div class="card' + (t.completed ? ' done' : '') + (opts.selected ? ' sel' : '') +
      '" draggable="true" data-act="open-task" data-id="' + esc(t.id) +
      '" data-section="' + esc(sectionId) + '">';
    h += '<div class="top">';
    if (opts.selectable) h += selbox(t, opts.selected);
    h += checkbox(t) + '<span class="nm">' + esc(t.name) + '</span></div>';

    var foot = '';
    if (t.priority !== 'none') {
      foot += '<span class="chip" style="background:' + pr.color + '22;color:' + pr.color +
        '"><span class="swatch" style="background:' + pr.color + '"></span>' + L(pr.label) + '</span>';
    }
    foot += badges(t, opts) + avatar(u, 'sm');
    h += '<div class="foot">' + foot + '</div></div>';
    return h;
  }

  /* ---------- list view (ตาราง) ----------
   * ทุกแถวเป็น grid ที่ใช้ template เดียวกัน คอลัมน์จึงตรงกันเสมอ
   * คอลัมน์ชื่องาน sticky ไว้ซ้าย เลื่อนดูคอลัมน์อื่นแล้วยังเห็นว่าแถวไหน
   */

  var COL_W = 158;

  /** ลูกศรบอกว่ากำลังเรียงด้วยคอลัมน์ไหน ทิศไหน */
  function sortMark(view, key) {
    if (view.sort !== key) return '<span class="th-sort">' + I('arrowDown', 12) + '</span>';
    return '<span class="th-sort on">' +
      I(view.sortDir === 'desc' ? 'arrowDown' : 'arrowUp', 12) + '</span>';
  }

  /** ที่จับลากปรับความกว้าง วางไว้ท้ายหัวคอลัมน์ */
  function resizer(key) {
    return '<span class="col-resize" data-act="col-resize" data-col="' + esc(key) +
      '" title="' + L('ลากเพื่อปรับความกว้าง') + '"></span>';
  }

  function fieldOption(f, name) {
    var o = (f.options || []).filter(function (x) { return x.name === name; })[0];
    return o || { name: name, color: 'var(--fg-faint)' };
  }

  function optionPill(f, name) {
    var o = fieldOption(f, name);
    return '<span class="opt-pill" style="background:' + esc(o.color) + '22;color:' +
      esc(o.color) + '">' + esc(o.name) + '</span>';
  }

  /** ค่าในเซลล์ตามชนิดฟิลด์ */
  function fieldCell(t, f) {
    var v = S.fieldValue(t.id, f.id);
    if (v === null || v === undefined || v === '') return '<span class="cell-empty">—</span>';

    if (f.type === 'select') return optionPill(f, v);
    if (f.type === 'multi') {
      var arr = [].concat(v);
      return arr.map(function (x) { return optionPill(f, x); }).join('');
    }
    if (f.type === 'person') {
      var u = S.user(v);
      return u ? avatar(u, 'sm') + '<span class="cell-txt">' + esc(u.name) + '</span>'
               : '<span class="cell-empty">—</span>';
    }
    if (f.type === 'date') return '<span class="cell-txt">' + fmtDate(v) + '</span>';
    if (f.type === 'number') {
      return '<span class="cell-txt num">' + esc(Number(v).toLocaleString()) + '</span>';
    }
    return '<span class="cell-txt">' + esc(v) + '</span>';
  }

  function listView(projectId, view, sel) {
    var p = S.project(projectId);
    var groups = S.viewGroups(projectId, view);
    var fields = p.fields || [];

    // ความกว้างมาจากที่ผู้ใช้ลากไว้ ถ้ายังไม่เคยลากใช้ค่าตั้งต้น
    // ไม่ใช้หน่วย fr เพราะ fr จะยืดจนดันคอลัมน์อื่นไปชิดขวา
    var narrow = global.innerWidth < 860;
    var widths = [
      ['name',     S.colWidth(projectId, 'name', narrow ? 230 : 400)],
      ['assignee', S.colWidth(projectId, 'assignee', 170)],
      ['due',      S.colWidth(projectId, 'due', 148)]
    ];
    fields.forEach(function (f) {
      widths.push([f.id, S.colWidth(projectId, f.id, COL_W)]);
    });
    var tpl = widths.map(function (w) { return w[1] + 'px'; }).join(' ') + ' 46px';

    var h = '<div class="tbl-wrap"><div class="tbl" style="--tpl:' + tpl + '">';

    /* ---- หัวตาราง ---- */
    h += '<div class="tbl-head">';
    h += '<div class="th th-name th-sortable" data-act="sort-col" data-key="name">' +
      L('ชื่องาน') + sortMark(view, 'name') + resizer('name') + '</div>';
    h += '<div class="th th-sortable" data-act="sort-col" data-key="assignee">' +
      L('ผู้รับผิดชอบ') + sortMark(view, 'assignee') + resizer('assignee') + '</div>';
    h += '<div class="th th-sortable" data-act="sort-col" data-key="due">' +
      L('กำหนดส่ง') + sortMark(view, 'due') + resizer('due') + '</div>';
    fields.forEach(function (f) {
      var ft = S.FIELD_TYPES.filter(function (x) { return x.id === f.type; })[0];
      h += '<div class="th th-field th-sortable" data-act="sort-col" data-key="field:' +
        esc(f.id) + '" data-field="' + esc(f.id) + '">' +
        (ft ? I(ft.icon, 13) : '') +
        '<span class="th-nm">' + esc(f.name) + '</span>' +
        sortMark(view, 'field:' + f.id) +
        '<button class="th-menu" data-act="field-menu" data-field="' + esc(f.id) +
        '" title="' + L('เมนู') + '">' + I('chevronDown', 12) + '</button>' +
        resizer(f.id) + '</div>';
    });
    h += '<div class="th th-add"><button class="addcol" data-act="add-field-picker" title="' +
      L('เพิ่มฟิลด์') + '">' + I('plus', 15) + '</button></div>';
    h += '</div>';

    /* ---- แถวข้อมูล ---- */
    var total = 0;
    groups.forEach(function (g) {
      total += g.items.length;

      h += '<div class="tbl-sec"' + (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + '>' +
        '<span class="sec-nm">' + esc(L(g.label)) + '</span>' +
        '<span class="sec-n">' + g.items.length + '</span>';
      if (g.isSection) {
        h += '<span class="sec-acts">' +
          '<button class="btn btn-sm btn-ghost" data-act="move-section" data-section="' +
          esc(g.key) + '" data-delta="-1" title="' + L('ย้ายขึ้น') + '">' + I('arrowUp', 14) + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="move-section" data-section="' +
          esc(g.key) + '" data-delta="1" title="' + L('ย้ายลง') + '">' + I('arrowDown', 14) + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="rename-section" data-section="' +
          esc(g.key) + '" title="' + L('เปลี่ยนชื่อ') + '">' + I('pencil', 14) + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="delete-section" data-section="' +
          esc(g.key) + '" title="' + L('ลบ') + '">' + I('trash', 14) + '</button></span>';
      }
      h += '</div>';

      h += '<div class="sec-body"' + (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + '>';
      g.items.forEach(function (x) {
        var t = x.task;
        var u = S.user(t.assigneeId);
        var pr = prio(t.priority);
        var subs = S.subtasks(t.id);
        var blocked = !t.completed && S.isBlocked(t.id);

        h += '<div class="tr' + (t.completed ? ' done' : '') + (sel[t.id] ? ' sel' : '') +
          '" draggable="true" data-act="open-task" data-id="' + esc(t.id) + '"' +
          (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + '>';

        /* ชื่องาน */
        h += '<div class="td td-name">' + selbox(t, !!sel[t.id]) + checkbox(t);
        if (t.priority !== 'none') {
          h += '<span class="prio-bar" style="background:' + pr.color + '" title="' +
            L(pr.label) + '"></span>';
        }
        h += '<span class="nm">' + (t.type === 'milestone' ? I('diamond', 11) + ' ' : '') +
          esc(t.name) + '</span>';
        if (subs.length) {
          h += '<span class="cell-mini">' + I('subtask', 11) + ' ' +
            subs.filter(function (s) { return s.completed; }).length + '/' + subs.length + '</span>';
        }
        if (blocked) {
          h += '<span class="cell-mini danger" title="' + L('รองานอื่นให้เสร็จก่อน') + '">' +
            I('blocked', 11) + '</span>';
        }
        if (t.recur) h += '<span class="cell-mini">' + I('repeat', 11) + '</span>';
        if (t.attachments.length) h += '<span class="cell-mini">' + I('paperclip', 11) + '</span>';
        h += '</div>';

        /* ผู้รับผิดชอบ */
        h += '<div class="td td-edit" data-act="edit-cell" data-cell="assignee" data-id="' + esc(t.id) + '">' +
          (u ? avatar(u, 'sm') + '<span class="cell-txt">' + esc(u.name) + '</span>'
             : '<span class="cell-empty">' + L('ยังไม่มอบหมาย') + '</span>') + '</div>';

        /* กำหนดส่ง */
        h += '<div class="td td-edit' + dueClass(t.dueOn, t.completed) +
          '" data-act="edit-cell" data-cell="due" data-id="' + esc(t.id) + '">' +
          (t.dueOn ? '<span class="cell-txt">' + fmtDate(t.dueOn) + '</span>'
                   : '<span class="cell-empty">—</span>') + '</div>';

        /* ฟิลด์ที่สร้างเอง */
        fields.forEach(function (f) {
          h += '<div class="td td-edit" data-act="edit-cell" data-cell="field" data-id="' + esc(t.id) +
            '" data-field="' + esc(f.id) + '">' + fieldCell(t, f) + '</div>';
        });

        h += '<div class="td td-add"></div>';
        h += '</div>';
      });
      h += '</div>';

      if (g.isSection) {
        h += '<div class="tbl-add"><button class="add-row" data-act="inline-add" data-section="' +
          esc(g.key) + '">' + I('plus', 14) + ' ' + L('เพิ่มงาน') + '</button></div>';
      }
    });

    h += '</div>';

    if (!total) {
      h += '<div class="empty"><div class="big">' + I('search', 32) + '</div>' +
        L('ไม่มีงานที่ตรงกับตัวกรอง') +
        '<div style="margin-top:12px"><button class="btn" data-act="reset-view">' +
        L('ล้างตัวกรอง') + '</button></div></div>';
    }
    if (view.group === 'section') {
      h += '<div style="padding:10px 24px 60px"><button class="add-row" data-act="add-section">' +
        I('plus', 14) + ' ' + L('เพิ่มคอลัมน์') + '</button></div>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- board view ---------- */

  function boardView(projectId, view, sel) {
    var groups = S.viewGroups(projectId, view);
    var h = '<div class="board">';

    groups.forEach(function (g) {
      h += '<div class="col"' + (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + '>';
      h += '<div class="col-head"><h3>' + esc(L(g.label)) + '</h3>' +
           '<span class="n">' + g.items.length + '</span>';
      if (g.isSection) {
        h += '<span class="acts">' +
          '<button class="btn btn-sm btn-ghost" data-act="move-section" data-section="' +
          esc(g.key) + '" data-delta="-1" title="' + L('ย้ายซ้าย') + '">‹' + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="move-section" data-section="' +
          esc(g.key) + '" data-delta="1" title="' + L('ย้ายขวา') + '">›' + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="rename-section" data-section="' +
          esc(g.key) + '" title="' + L('เปลี่ยนชื่อ') + '">' + I('pencil', 14) + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="delete-section" data-section="' +
          esc(g.key) + '" title="' + L('ลบ') + '">' + I('trash', 14) + '</button></span>';
      }
      h += '</div>';
      h += '<div class="col-body"' + (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + '>';
      g.items.forEach(function (x) {
        h += taskCard(x.task, g.isSection ? g.key : '', {
          selectable: true, selected: !!sel[x.task.id]
        });
      });
      h += '</div>';
      if (g.isSection) {
        h += '<button class="col-add" data-act="inline-add" data-section="' + esc(g.key) +
          '">+ ' + L('เพิ่มงาน') + '</button>';
      }
      h += '</div>';
    });

    if (view.group === 'section') {
      h += '<button class="col-new" data-act="add-section">' + L('+ เพิ่มคอลัมน์') + '</button>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- timeline (gantt) ---------- */

  var ZOOMS = { day: 28, week: 12, month: 4 };
  var ROW_H = 34;

  function timelineView(projectId, view, zoom) {
    var DAY_W = ZOOMS[zoom] || ZOOMS.day;
    var groups = S.viewGroups(projectId, view);
    var items = [];
    groups.forEach(function (g) {
      g.items.forEach(function (x) { items.push(x); });
    });

    var dated = items.filter(function (x) { return x.task.dueOn || x.task.startOn; });
    if (!dated.length) {
      return '<div class="empty"><div class="big">📊</div>' + L('ยังไม่มีงานที่มีวันที่') +
        '<div style="margin-top:6px;font-size:13px">' + L('ใส่วันเริ่มหรือกำหนดส่งให้งาน แล้วจะเห็นแท่งเวลาที่นี่') + '</div></div>';
    }

    var td = S.today();
    var min = null, max = null;
    dated.forEach(function (x) {
      var a = x.task.startOn || x.task.dueOn;
      var b = x.task.dueOn || x.task.startOn;
      if (!min || a < min) min = a;
      if (!max || b > max) max = b;
    });
    if (td < min) min = td;
    if (td > max) max = td;
    var from = S.addDays(min, -3);
    var to = S.addDays(max, 4);
    var days = S.daysBetween(from, to) + 1;
    var width = days * DAY_W;

    var h = '<div class="tl">';
    h += '<div class="tl-head"><strong style="font-size:14px">' + L('ไทม์ไลน์') + '</strong>' +
      '<div class="segmented">' +
      ['day', 'week', 'month'].map(function (z, i) {
        return '<button data-act="tl-zoom" data-v="' + z + '" class="' +
          ((zoom || 'day') === z ? 'on' : '') + '">' +
          [L('วัน'), L('สัปดาห์'), L('เดือน')][i] + '</button>';
      }).join('') + '</div>' +
      '<button class="btn btn-sm btn-ghost" data-act="tl-today">' + L('ไปวันนี้') + '</button>' +
      '<span style="font-size:12px;color:var(--fg-soft)">' +
      L('ลากแท่งเพื่อเลื่อนวัน · ลากขอบเพื่อยืด/หด · ◆ = หมุดหมาย · เส้นประ = ลำดับก่อนหลัง') + '</span></div>';
    h += '<div class="tl-scroll"><div class="tl-grid" style="width:' + width + 'px">';

    // แถบเดือน
    h += '<div class="tl-months">';
    var i = 0;
    while (i < days) {
      var d = new Date(S.addDays(from, i) + 'T00:00:00');
      var mLeft = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1;
      var span = Math.min(mLeft, days - i);
      h += '<div class="tl-month" style="width:' + (span * DAY_W) + 'px">' +
        MONF()[d.getMonth()] + ' ' + YR(d.getFullYear()) + '</div>';
      i += span;
    }
    h += '</div>';

    // แถบวัน
    h += '<div class="tl-days">';
    for (i = 0; i < days; i++) {
      var ds = S.addDays(from, i);
      var dd = new Date(ds + 'T00:00:00');
      var wk = dd.getDay() === 0 || dd.getDay() === 6;
      h += '<div class="tl-day' + (wk ? ' weekend' : '') + (ds === td ? ' today' : '') +
        '" style="width:' + DAY_W + 'px">' + (DAY_W >= 18 ? dd.getDate() : '') + '</div>';
    }
    h += '</div>';

    // แถวงาน
    var rowOf = {};
    h += '<div class="tl-rows" style="height:' + (dated.length * ROW_H) + 'px">';
    dated.forEach(function (x, idx) {
      var t = x.task;
      rowOf[t.id] = idx;
      var start = t.startOn || t.dueOn;
      var end = t.dueOn || t.startOn;
      if (end < start) { var tmp = start; start = end; end = tmp; }
      var x0 = S.daysBetween(from, start) * DAY_W;
      var w = (S.daysBetween(start, end) + 1) * DAY_W;
      var color = prio(t.priority).color;
      if (t.priority === 'none') color = 'var(--accent)';

      h += '<div class="tl-row" data-row="' + idx + '">';
      if (t.type === 'milestone') {
        h += '<div class="tl-milestone" data-act="open-task" data-id="' + esc(t.id) +
          '" data-tid="' + esc(t.id) + '" data-role="move" title="' + esc(t.name) +
          ' ' + L('— ลากเพื่อเลื่อนวัน') + '" style="left:' + (x0 + DAY_W / 2 - 9) + 'px;background:' +
          color + '"></div>';
        h += '<div class="tl-label" style="left:' + (x0 + DAY_W / 2 + 14) + 'px">' + I('diamond', 11) + ' ' +
          esc(t.name) + '</div>';
      } else {
        var blocked = !t.completed && S.isBlocked(t.id);
        h += '<div class="tl-bar' + (t.completed ? ' done' : '') + (blocked ? ' blocked' : '') +
          '" style="left:' + x0 + 'px;width:' + Math.max(w, 8) + 'px;background:' + color +
          '" data-act="open-task" data-id="' + esc(t.id) + '" data-tid="' + esc(t.id) +
          '" data-role="move" title="' + esc(t.name) + ' ' + L('— ลากเพื่อเลื่อน ลากขอบเพื่อยืด/หด') + '">' +
          '<span class="tl-handle l" data-role="start" data-tid="' + esc(t.id) + '"></span>' +
          '<span class="tl-bar-txt">' + esc(t.name) + '</span>' +
          '<span class="tl-handle r" data-role="end" data-tid="' + esc(t.id) + '"></span></div>';
        if (w < 140) {
          h += '<div class="tl-label" style="left:' + (x0 + Math.max(w, 8) + 8) +
            'px">' + esc(t.name) + '</div>';
        }
      }
      h += '</div>';
    });

    // เส้นเชื่อมลำดับก่อนหลัง
    var lines = '';
    dated.forEach(function (x) {
      var t = x.task;
      if (rowOf[t.id] === undefined) return;
      var startA = t.startOn || t.dueOn;
      var xa = S.daysBetween(from, startA) * DAY_W;
      var ya = rowOf[t.id] * ROW_H + ROW_H / 2;
      t.dependsOn.forEach(function (dep) {
        var bid = dep.id;
        if (rowOf[bid] === undefined) return;
        var b = S.task(bid);
        var endB = b.dueOn || b.startOn;
        var startB = b.startOn || b.dueOn;
        if (endB < startB) endB = startB;
        var xb = (S.daysBetween(from, endB) + 1) * DAY_W;
        var yb = rowOf[bid] * ROW_H + ROW_H / 2;
        var midX = Math.max(xb + 8, xa - 8);
        lines += '<path d="M' + xb + ' ' + yb + ' H' + midX + ' V' + ya + ' H' + xa +
          '" fill="none" stroke="var(--fg-faint)" stroke-width="1.4" ' +
          'stroke-dasharray="4 3" marker-end="url(#orbArrow)"/>';
      });
    });
    if (lines) {
      h += '<svg class="tl-dep" width="' + width + '" height="' + (dated.length * ROW_H) + '">' +
        '<defs><marker id="orbArrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" ' +
        'orient="auto"><path d="M0 0 L7 3.5 L0 7 z" fill="var(--fg-faint)"/></marker></defs>' +
        lines + '</svg>';
    }

    var todayX = S.daysBetween(from, td) * DAY_W + DAY_W / 2;
    h += '<div class="tl-today-line" style="left:' + todayX + 'px"></div>';

    h += '</div></div></div></div>';
    return h;
  }

  /* ---------- dashboard ---------- */

  function bar(label, value, total, color) {
    var pct = total ? Math.round(value * 100 / total) : 0;
    return '<div class="barrow"><span class="lbl">' + esc(label) + '</span>' +
      '<span class="track"><span class="fill" style="width:' + pct + '%;background:' +
      (color || 'var(--accent)') + '"></span></span>' +
      '<span class="val">' + value + ' · ' + pct + '%</span></div>';
  }

  function dashboardView(projectId) {
    var p = S.project(projectId);
    var s = S.projectStats(projectId);
    var h = '<div class="dash">';

    // สถานะโปรเจกต์
    h += '<div class="panel"><h3>' + L('สถานะโปรเจกต์') +
      '<button class="btn btn-sm" data-act="update-status" style="float:right">' + L('อัปเดตสถานะ') + '</button></h3>';
    if (p.status) {
      var st = projectState(p.status.state);
      var by = S.user(p.status.by);
      h += '<div class="status-card"><span class="status-dot" style="background:' + st.color +
        '"></span><div><div style="font-weight:600;color:' + st.color + '">' + esc(L(st.label)) +
        '</div><div style="margin-top:4px">' + esc(p.status.text) + '</div>' +
        '<div style="font-size:12px;color:var(--fg-faint);margin-top:6px">' +
        esc(by ? by.name : '?') + ' · ' + fmtDate(p.status.at) + '</div></div></div>';

      /* ประวัติย้อนหลัง ตอบคำถามที่ถามกันบ่อยที่สุดคือ "เปลี่ยนเป็นสีแดงตั้งแต่เมื่อไร"
       * ตัดรายการล่าสุดออกเพราะแสดงเต็ม ๆ อยู่ข้างบนแล้ว */
      var hist = S.statusLog(projectId, 6).slice(1);
      if (hist.length) {
        h += '<div class="st-trail">';
        hist.forEach(function (e) {
          var s2 = projectState(e.state);
          h += '<div class="st-trail-row"><i style="background:' + s2.color + '"></i>' +
            '<b style="color:' + s2.color + '">' + esc(L(s2.label)) + '</b>' +
            '<span>' + esc(fmtWhen(e.at)) + '</span></div>';
        });
        h += '</div>';
      }
    } else {
      h += '<div style="color:var(--fg-faint)">' + L('ยังไม่มีการอัปเดตสถานะ') + '</div>';
    }
    h += '</div>';

    // ตัวเลขรวม
    h += '<div class="dash-stats">';
    h += '<div class="stat"><div class="k">' + L('งานทั้งหมด') + '</div><div class="v">' + s.total + '</div></div>';
    h += '<div class="stat ok"><div class="k">' + L('เสร็จแล้ว') + '</div><div class="v">' + s.done + '</div></div>';
    h += '<div class="stat"><div class="k">' + L('ยังค้าง') + '</div><div class="v">' + s.open + '</div></div>';
    h += '<div class="stat alert"><div class="k">' + L('เลยกำหนด') + '</div><div class="v">' + s.overdue + '</div></div>';
    h += '<div class="stat warn"><div class="k">' + L('ครบใน 7 วัน') + '</div><div class="v">' + s.dueWeek + '</div></div>';
    h += '<div class="stat alert"><div class="k">' + L('ถูกบล็อก') + '</div><div class="v">' + s.blocked + '</div></div>';
    h += '</div>';

    h += '<div class="panel"><h3>' + L('ความคืบหน้ารวม') + ' ' + s.percent + '%</h3>' +
      '<div class="progress"><span style="width:' + s.percent + '%"></span></div></div>';

    h += '<div class="dash-cols">';

    // ตามผู้รับผิดชอบ
    h += '<div class="panel"><h3>' + L('ตามผู้รับผิดชอบ') + '</h3>';
    var anyA = false;
    S.db.users.forEach(function (u) {
      var a = s.byAssignee[u.id];
      if (!a) return;
      anyA = true;
      h += bar(u.name, a.done, a.total, u.color);
    });
    if (s.byAssignee['']) {
      anyA = true;
      h += bar(L('ยังไม่มอบหมาย'), s.byAssignee[''].done, s.byAssignee[''].total, 'var(--fg-faint)');
    }
    if (!anyA) h += '<div style="color:var(--fg-faint)">' + L('ยังไม่มีข้อมูล') + '</div>';
    h += '<div style="font-size:12px;color:var(--fg-faint);margin-top:8px">' +
      L('แท่ง = สัดส่วนงานที่เสร็จของแต่ละคน') + '</div></div>';

    // ตามความสำคัญ
    h += '<div class="panel"><h3>' + L('ตามความสำคัญ') + '</h3>';
    S.PRIORITIES.forEach(function (x) {
      var n = s.byPriority[x.id] || 0;
      if (!n) return;
      h += bar(L(x.label), n, s.total, x.color);
    });
    h += '</div>';

    // ตามคอลัมน์
    h += '<div class="panel"><h3>' + L('ตามคอลัมน์') + '</h3>';
    p.sections.forEach(function (sec) {
      h += bar(sec.name, s.bySection[sec.id] || 0, s.total, p.color);
    });
    h += '</div>';

    h += '</div></div>';
    return h;
  }

  /* ---------- พอร์ตโฟลิโอ ----------
   *
   * มุมมองรวมของหลายโปรเจกต์ ตอบคำถามระดับบริหารว่า "ภาพรวมตอนนี้เป็นยังไง"
   * ไม่ใช่ระดับ "งานชิ้นไหนค้าง" ซึ่งหน้าโปรเจกต์ตอบอยู่แล้ว
   * หนึ่งแถวคือหนึ่งโปรเจกต์ ไม่ใช่หนึ่งงาน
   */

  var PF_TABS = [['list', 'รายการ'], ['timeline', 'ไทม์ไลน์'], ['dashboard', 'สรุปผล']];

  function pfProgress(pct, color) {
    return '<span class="pf-bar" title="' + pct + '%"><i style="width:' + pct +
      '%;background:' + esc(color) + '"></i></span><span class="pf-pct">' + pct + '%</span>';
  }

  function portfolioView(portfolioId, tab) {
    var f = S.portfolio(portfolioId);
    if (!f) return '<div class="empty"><div class="big">🗂</div>' + L('ไม่พบพอร์ตโฟลิโอนี้') + '</div>';
    var list = S.portfolioProjects(portfolioId);
    var st = S.portfolioStats(portfolioId);
    tab = tab || 'list';

    var h = '<div class="pf">';

    /* แถบสรุปมีทุกแท็บ เพราะเป็นคำตอบที่คนเปิดพอร์ตโฟลิโอมาหา */
    h += '<div class="pf-kpis">';
    h += '<div class="stat"><div class="k">' + L('โปรเจกต์') + '</div><div class="v">' + st.projects + '</div></div>';
    h += '<div class="stat"><div class="k">' + L('ความคืบหน้ารวม') + '</div><div class="v">' + st.percent + '%</div></div>';
    h += '<div class="stat' + (st.atRisk ? ' warn' : '') + '"><div class="k">' + L('ต้องจับตา') +
      '</div><div class="v">' + st.atRisk + '</div></div>';
    h += '<div class="stat' + (st.overdue ? ' bad' : '') + '"><div class="k">' + L('งานเลยกำหนด') +
      '</div><div class="v">' + st.overdue + '</div></div>';
    h += '<div class="stat"><div class="k">' + L('งานทั้งหมด') + '</div><div class="v">' + st.total + '</div></div>';
    h += '</div>';

    if (st.hidden) {
      h += '<div class="pf-hidden">' + I('shield', 14) + '<span>' +
        L('มีอีก {n} โปรเจกต์ในพอร์ตโฟลิโอนี้ที่คุณไม่มีสิทธิ์เห็น ตัวเลขข้างบนจึงไม่รวมของพวกนั้น',
          { n: st.hidden }) + '</span></div>';
    }

    if (!list.length) {
      h += '<div class="empty"><div class="big">🗂</div>' +
        (st.hidden ? L('พอร์ตโฟลิโอนี้มีแต่โปรเจกต์ที่คุณไม่มีสิทธิ์เห็น')
                   : L('ยังไม่มีโปรเจกต์ในพอร์ตโฟลิโอนี้')) + '</div>';
      if (!st.hidden) {
        h += '<div style="text-align:center"><button class="btn btn-primary" data-act="pf-add" data-pf="' +
          esc(f.id) + '">' + I('plus', 15) + ' ' + L('เพิ่มโปรเจกต์เข้าพอร์ตโฟลิโอ') + '</button></div>';
      }
      return h + '</div>';
    }

    if (tab === 'list') h += pfList(f, list);
    else if (tab === 'timeline') h += pfTimeline(f, list);
    else h += pfDashboard(f, list, st);

    h += '</div>';
    return h;
  }

  function pfList(f, list) {
    var h = '<div class="pf-tbl">';
    h += '<div class="pf-head">' +
      '<span>' + L('โปรเจกต์') + '</span>' +
      '<span>' + L('สถานะ') + '</span>' +
      '<span>' + L('ความคืบหน้า') + '</span>' +
      '<span>' + L('เจ้าของ') + '</span>' +
      '<span>' + L('กำหนดส่ง') + '</span>' +
      '<span>' + L('เลยกำหนด') + '</span>' +
      '<span></span></div>';

    list.forEach(function (p) {
      var s = S.projectStats(p.id);
      var owner = S.user(p.owner);
      var stt = p.status ? projectState(p.status.state) : null;
      h += '<div class="pf-row" data-act="go" data-route="project" data-id="' + esc(p.id) + '">';
      h += '<span class="pf-nm"><span class="hproj-ic" style="background:' + esc(p.color) +
        '22">' + esc(p.icon) + '</span><span class="grow"><b>' + esc(p.name) + '</b>' +
        (p.description ? '<em>' + esc(p.description) + '</em>' : '') + '</span></span>';
      h += '<span>' + (stt
        ? '<span class="status-pill" style="background:' + stt.color + '22;color:' + stt.color +
          '"><i style="background:' + stt.color + '"></i>' + esc(L(stt.label)) + '</span>'
        : '<span class="pf-none">' + L('ยังไม่รายงาน') + '</span>') + '</span>';
      h += '<span class="pf-prog">' + pfProgress(s.percent, p.color) + '</span>';
      h += '<span>' + (owner ? avatar(owner, 'sm') + '<span class="pf-owner">' + esc(owner.name) + '</span>'
                             : '<span class="pf-none">—</span>') + '</span>';
      h += '<span class="' + (p.dueOn ? dueClass(p.dueOn, false) : '') + '">' +
        (p.dueOn ? fmtDate(p.dueOn) : '<span class="pf-none">—</span>') + '</span>';
      h += '<span class="' + (s.overdue ? 'pf-bad' : 'pf-none') + '">' + (s.overdue || '—') + '</span>';
      h += '<span><button class="icon-btn" data-act="pf-remove" data-pf="' + esc(f.id) +
        '" data-id="' + esc(p.id) + '" title="' + L('ถอดออกจากพอร์ตโฟลิโอ') + '">' +
        I('close', 14) + '</button></span>';
      h += '</div>';
    });
    h += '</div>';
    h += '<button class="pf-add" data-act="pf-add" data-pf="' + esc(f.id) + '">' +
      I('plus', 15) + ' ' + L('เพิ่มโปรเจกต์เข้าพอร์ตโฟลิโอ') + '</button>';
    return h;
  }

  /** ไทม์ไลน์ระดับโปรเจกต์ หนึ่งแท่งคือหนึ่งโปรเจกต์ ไม่ใช่หนึ่งงาน
   *  ใช้สัดส่วนเปอร์เซ็นต์ ไม่ใช้พิกเซล จะได้ยืดเต็มจอโดยไม่ต้องเลื่อนแนวนอน */
  function pfTimeline(f, list) {
    var spans = list.map(function (p) { return { p: p, d: S.projectDates(p.id) }; });
    var dated = spans.filter(function (x) { return x.d; });
    if (!dated.length) {
      return '<div class="empty"><div class="big">📅</div>' +
        L('ยังไม่มีโปรเจกต์ไหนที่มีวันที่') + '</div>';
    }
    var td = S.today();
    var min = td, max = td;
    dated.forEach(function (x) {
      if (x.d.from < min) min = x.d.from;
      if (x.d.to > max) max = x.d.to;
    });
    min = S.addDays(min, -15);
    max = S.addDays(max, 15);
    var days = S.daysBetween(min, max) + 1;
    function pct(d) { return (S.daysBetween(min, d) / days) * 100; }

    var h = '<div class="pf-tl">';
    h += '<div class="pf-tl-head"><span class="pf-tl-nm"></span><span class="pf-tl-track">';
    var cur = min.slice(0, 8) + '01', guard = 0;
    while (cur <= max && guard++ < 160) {
      var d = new Date(cur + 'T00:00:00');
      var next = S.iso(new Date(d.getFullYear(), d.getMonth() + 1, 1));
      var left = Math.max(0, pct(cur)), right = Math.min(100, pct(next));
      if (right > 0 && left < 100 && right - left > 3) {
        h += '<span class="pf-tl-mon" style="left:' + left + '%;width:' + (right - left) + '%">' +
          MON()[d.getMonth()] + '</span>';
      }
      cur = next;
    }
    h += '<span class="pf-tl-today" style="left:' + pct(td) + '%"></span></span></div>';

    spans.forEach(function (x) {
      var p = x.p;
      var s = S.projectStats(p.id);
      var stt = p.status ? projectState(p.status.state) : null;
      var color = stt ? stt.color : p.color;
      h += '<div class="pf-tl-row" data-act="go" data-route="project" data-id="' + esc(p.id) + '">';
      h += '<span class="pf-tl-nm"><span class="em">' + esc(p.icon) + '</span>' +
        '<span class="grow">' + esc(p.name) + '</span></span>';
      h += '<span class="pf-tl-track">';
      if (x.d) {
        var l = pct(x.d.from), w = Math.max(pct(x.d.to) - l, 1.2);
        h += '<span class="pf-tl-bar" style="left:' + l + '%;width:' + w + '%;background:' +
          esc(color) + '2e;border-color:' + esc(color) + '" title="' +
          esc(fmtDate(x.d.from) + ' – ' + fmtDate(x.d.to)) + '">' +
          '<i style="width:' + s.percent + '%;background:' + esc(color) + '"></i>' +
          '<b>' + s.percent + '%</b></span>';
      } else {
        h += '<span class="pf-tl-nodate">' + L('ไม่มีวันที่') + '</span>';
      }
      h += '<span class="pf-tl-today" style="left:' + pct(td) + '%"></span>';
      h += '</span></div>';
    });
    return h + '</div>';
  }

  function pfDashboard(f, list, st) {
    var h = '<div class="dash-cols" style="margin-top:16px">';

    h += '<div class="panel"><h3>' + L('ตามสถานะโปรเจกต์') + '</h3>';
    S.PROJECT_STATES.forEach(function (x) {
      var n = st.byStatus[x.id] || 0;
      if (n) h += bar(L(x.label), n, st.projects, x.color);
    });
    if (st.noStatus) h += bar(L('ยังไม่รายงาน'), st.noStatus, st.projects, 'var(--fg-faint)');
    h += '</div>';

    h += '<div class="panel"><h3>' + L('ความคืบหน้าแต่ละโปรเจกต์') + '</h3>';
    list.slice().sort(function (a, b) {
      return S.projectStats(a.id).percent - S.projectStats(b.id).percent;
    }).forEach(function (p) {
      var s = S.projectStats(p.id);
      h += bar(p.icon + ' ' + p.name, s.done, s.total || 1, p.color);
    });
    h += '<div class="bar-note">' + L('แท่ง = สัดส่วนงานที่เสร็จ เรียงจากช้าที่สุดขึ้นก่อน') + '</div></div>';

    h += '<div class="panel"><h3>' + L('ต้องจับตา') + '</h3>';
    var risky = list.filter(function (p) {
      var s = S.projectStats(p.id);
      return (p.status && (p.status.state === 'at_risk' || p.status.state === 'off_track')) || s.overdue > 0;
    });
    if (!risky.length) h += '<div class="pf-none">' + L('ยังไม่มีโปรเจกต์ที่น่าห่วง') + '</div>';
    risky.forEach(function (p) {
      var s = S.projectStats(p.id);
      var stt = p.status ? projectState(p.status.state) : null;
      h += '<div class="pf-risk" data-act="go" data-route="project" data-id="' + esc(p.id) + '">' +
        '<span class="em">' + esc(p.icon) + '</span>' +
        '<span class="grow"><b>' + esc(p.name) + '</b>' +
        (p.status && p.status.text ? '<em>' + esc(p.status.text) + '</em>' : '') + '</span>' +
        (stt ? '<span class="status-pill" style="background:' + stt.color + '22;color:' + stt.color +
          '"><i style="background:' + stt.color + '"></i>' + esc(L(stt.label)) + '</span>' : '') +
        (s.overdue ? '<span class="pf-bad">' + L('เลยกำหนด {n}', { n: s.overdue }) + '</span>' : '') +
        '</div>';
    });
    h += '</div>';

    h += '<div class="panel"><h3>' + L('คนที่ถือโปรเจกต์') + '</h3>';
    var byOwner = {};
    list.forEach(function (p) { byOwner[p.owner || ''] = (byOwner[p.owner || ''] || 0) + 1; });
    Object.keys(byOwner).sort(function (a, b) { return byOwner[b] - byOwner[a]; }).forEach(function (uid) {
      var u = S.user(uid);
      h += bar(u ? u.name : L('ยังไม่ระบุ'), byOwner[uid], list.length, u ? u.color : 'var(--fg-faint)');
    });
    h += '</div></div>';
    return h;
  }

  /* ---------- home (หน้าแรก) ----------
   *
   * เป็นหน้า "วันนี้ต้องดูอะไร" ไม่ใช่หน้าทำงาน จึงไม่มีตัวกรอง ไม่มีการเลือกหลายรายการ
   * ทุกอย่างที่กดได้จะพาไปหน้าจริงเสมอ ยกเว้นช่องติ๊กงานเสร็จที่ทำตรงนี้ได้เลย
   * เพราะเป็นสิ่งที่คนเปิดหน้าแรกมาทำบ่อยที่สุด
   */

  function greeting() {
    var h = new Date().getHours();
    if (h < 12) return L('สวัสดีตอนเช้า');
    if (h < 17) return L('สวัสดีตอนบ่าย');
    return L('สวัสดีตอนเย็น');
  }

  /** ไทยเรียง วัน-ที่-เดือน อังกฤษเรียง วัน-เดือน-ที่ จึงต้องให้คำแปลคุมลำดับเอง */
  function homeDateLine() {
    var d = new Date();
    return L('{dow}ที่ {d} {mon}', {
      dow: global.I18N.dowFull()[d.getDay()],
      d: d.getDate(),
      mon: MONF()[d.getMonth()]
    });
  }

  /** แถวงานบนหน้าแรก สั้นกว่าแถวในรายการเพราะการ์ดแคบกว่าหน้าจอเต็ม */
  function homeRow(t) {
    var pj = S.projectsOfTask(t.id)[0];
    var h = '<div class="hrow' + (t.completed ? ' done' : '') +
      '" data-act="open-task" data-id="' + esc(t.id) + '">';
    h += checkbox(t);
    h += '<span class="nm">' + esc(t.name) + '</span>';
    if (pj) {
      h += '<span class="hchip" style="background:' + esc(pj.project.color) +
        '22;color:' + esc(pj.project.color) + '" title="' + esc(pj.project.name) + '">' +
        esc(pj.project.name) + '</span>';
    }
    if (t.dueOn) {
      h += '<span class="hdue' + dueClass(t.dueOn, t.completed) + '">' + fmtDate(t.dueOn) + '</span>';
    }
    h += '</div>';
    return h;
  }

  function hcard(o) {
    var h = '<section class="hcard">';
    h += '<div class="hcard-head">' + o.title + '<span class="grow"></span>' + (o.action || '') + '</div>';
    if (o.tabs) h += '<div class="hcard-tabs">' + o.tabs + '</div>';
    h += '<div class="hcard-body">' + o.body + '</div>';
    h += '</section>';
    return h;
  }

  function hTabs(card, cur, list) {
    var h = '';
    list.forEach(function (x) {
      h += '<button class="tb-tab' + (cur === x[0] ? ' active' : '') +
        '" data-act="home-tab" data-card="' + card + '" data-tab="' + x[0] + '">' +
        esc(x[1]) + '</button>';
    });
    return h;
  }

  var HOME_ROWS = 6;

  function hList(items, emptyText) {
    if (!items.length) return '<div class="hempty">' + esc(emptyText) + '</div>';
    var h = '';
    items.slice(0, HOME_ROWS).forEach(function (t) { h += homeRow(t); });
    if (items.length > HOME_ROWS) {
      h += '<div class="hmore">+' + (items.length - HOME_ROWS) + ' ' + L('อื่น ๆ') + '</div>';
    }
    return h;
  }

  function homeView(st) {
    st = st || {};
    var meUser = S.me();
    var mine = S.myTasks(S.db.currentUserId);
    var stats = S.homeStats();
    var assigned = S.assignedByMe();

    var h = '<div class="home">';

    h += '<div class="home-head">';
    h += '<div class="home-date">' + esc(homeDateLine()) + '</div>';
    h += '<h1 class="home-hi">' +
      esc(L('{greet}, {name}', { greet: greeting(), name: meUser ? meUser.name : '' })) + '</h1>';
    h += '<div class="home-stats">';
    h += '<span class="hstat">' + I('checkCircle', 14) +
      esc(L('{n} งานเสร็จสัปดาห์นี้', { n: stats.doneWeek })) + '</span>';
    h += stats.overdue
      ? '<span class="hstat warn">' + I('alert', 14) +
        esc(L('{n} งานเลยกำหนด', { n: stats.overdue })) + '</span>'
      : '<span class="hstat">' + I('calendar', 14) +
        esc(L('{n} งานครบกำหนดใน 7 วัน', { n: stats.dueWeek })) + '</span>';
    h += '<span class="hstat">' + I('users', 14) +
      esc(L('{n} เพื่อนร่วมงาน', { n: stats.collaborators })) + '</span>';
    h += '</div></div>';

    h += '<div class="home-grid">';

    /* --- งานของฉัน --- */
    var mineTab = st.mine || 'upcoming';
    var mineItems = mineTab === 'overdue' ? mine.overdue
      : mineTab === 'done' ? S.myCompleted(S.db.currentUserId, HOME_ROWS)
      : mine.today.concat(mine.upcoming, mine.later, mine.nodate);
    h += hcard({
      title: '<span class="hcard-title">' + avatar(meUser, 'sm') + L('งานของฉัน') + '</span>',
      action: '<button class="btn btn-sm btn-ghost" data-act="go" data-route="mytasks">' +
              L('ดูทั้งหมด') + '</button>',
      tabs: hTabs('mine', mineTab, [
        ['upcoming', L('กำลังจะถึง')],
        ['overdue', L('เลยกำหนด ({n})', { n: mine.overdue.length })],
        ['done', L('เสร็จแล้ว')]
      ]),
      body: hList(mineItems, L('ไม่มีงานในช่วงนี้'))
    });

    /* --- โปรเจกต์ --- */
    var projs = S.visibleProjects();
    var showAll = !!st.allProjects;
    var pb;
    if (!projs.length && !S.can('structure')) {
      pb = '<div class="hempty">' + L('ยังไม่มีโปรเจกต์') + '</div>';
    } else {
      pb = '<div class="hproj-grid">';
      if (S.can('structure')) {
        pb += '<button class="hproj new" data-act="new-project">' +
          '<span class="hproj-ic">' + I('plus', 15) + '</span>' +
          '<span class="hproj-txt"><span class="hproj-nm">' + L('สร้างโปรเจกต์ใหม่') + '</span></span></button>';
      }
      (showAll ? projs : projs.slice(0, 7)).forEach(function (p) {
        var n = S.dueSoonCount(p.id);
        pb += '<button class="hproj" data-act="go" data-route="project" data-id="' + esc(p.id) + '">' +
          '<span class="hproj-ic" style="background:' + esc(p.color) + '22">' + esc(p.icon) + '</span>' +
          '<span class="hproj-txt"><span class="hproj-nm">' + esc(p.name) +
          (p.visibility === 'private'
            ? '<span class="lockmark" title="' + L('โปรเจกต์ปิด') + '">' + I('shield', 11) + '</span>'
            : '') +
          '</span><span class="hproj-sub">' +
          /* จุดสีบอกสถานะ อ่านทั้งหน้าแรกครั้งเดียวก็รู้ว่าโปรเจกต์ไหนกำลังมีปัญหา */
          (p.status
            ? '<i class="st-dot" style="background:' + esc(projectState(p.status.state).color) +
              '" title="' + esc(L(projectState(p.status.state).label)) + '"></i>'
            : '') +
          (n ? esc(L('งานใกล้ครบกำหนด {n} งาน', { n: n })) : L('ไม่มีงานใกล้ครบกำหนด')) +
          '</span></span></button>';
      });
      pb += '</div>';
      if (projs.length > 7) {
        pb += '<button class="hlink" data-act="home-more-projects">' +
          (showAll ? L('ย่อกลับ') : L('ดูเพิ่ม')) + '</button>';
      }
    }
    h += hcard({
      title: '<span class="hcard-title">' + I('grid', 15) + L('โปรเจกต์') + '</span>',
      body: pb
    });

    /* --- งานที่ฉันมอบหมาย --- */
    var aTab = st.assigned || 'week';
    var aItems = aTab === 'upcoming' ? assigned.upcoming
      : aTab === 'overdue' ? assigned.overdue
      : aTab === 'done' ? assigned.completed
      : assigned.week;
    h += hcard({
      title: '<span class="hcard-title">' + I('users', 15) + L('งานที่ฉันมอบหมาย') + '</span>',
      tabs: hTabs('assigned', aTab, [
        ['week', L('สัปดาห์นี้ ({n})', { n: assigned.week.length })],
        ['upcoming', L('กำลังจะถึง')],
        ['overdue', L('เลยกำหนด ({n})', { n: assigned.overdue.length })],
        ['done', L('เสร็จแล้ว')]
      ]),
      body: hList(aItems, L('ยังไม่ได้มอบหมายงานให้ใคร'))
    });

    /* --- กิจกรรมล่าสุด --- */
    var acts = S.recentActivity(HOME_ROWS);
    var ab = '';
    if (!acts.length) ab = '<div class="hempty">' + L('ยังไม่มีกิจกรรม') + '</div>';
    acts.forEach(function (a) {
      ab += '<div class="hact" data-act="open-task" data-id="' + esc(a.story.taskId) + '">' +
        avatar(a.actor, 'sm') +
        '<span class="hact-body"><span class="hact-txt"><strong>' +
        esc(a.actor ? a.actor.name : '?') + '</strong> ' +
        esc(a.story.type === 'comment' ? L('แสดงความเห็น') : a.story.text) + '</span>' +
        '<span class="hact-sub">' + esc(a.taskName || '') + ' · ' +
        esc(fmtWhen(a.story.createdAt)) + '</span></span></div>';
    });
    h += hcard({
      title: '<span class="hcard-title">' + I('bell', 15) + L('กิจกรรมล่าสุด') + '</span>',
      action: '<button class="btn btn-sm btn-ghost" data-act="go" data-route="inbox">' +
              L('ดูทั้งหมด') + '</button>',
      body: ab
    });

    h += '</div></div>';
    return h;
  }

  /* ---------- my tasks ---------- */

  function myTasksView(sel) {
    var b = S.myTasks(S.db.currentUserId);
    var groups = [
      ['overdue', L('เลยกำหนด'), b.overdue],
      ['today', L('วันนี้'), b.today],
      ['upcoming', L('สัปดาห์นี้'), b.upcoming],
      ['later', L('หลังจากนั้น'), b.later],
      ['nodate', L('ไม่มีกำหนด'), b.nodate]
    ];
    var total = groups.reduce(function (a, g) { return a + g[2].length; }, 0);

    if (!total) return '<div class="empty"><div class="big">🎉</div>' + L('ไม่มีงานค้างเลย') + '</div>';

    var h = '<div class="list-wrap">';
    groups.forEach(function (g) {
      if (!g[2].length) return;
      h += '<div class="bucket-head' + (g[0] === 'overdue' ? ' overdue' : '') + '">' +
           esc(g[1]) + '<span class="n">' + g[2].length + '</span></div>';
      g[2].forEach(function (t) {
        h += taskRow(t, { showProject: true, selectable: true, selected: !!sel[t.id] });
      });
    });
    h += '</div>';
    return h;
  }

  /* ---------- inbox ---------- */

  function inboxView(showArchived) {
    var list = S.inbox(S.db.currentUserId, showArchived);
    var h = '<div class="inbox-wrap">';
    h += '<div class="tb-tabs" style="margin:0 0 6px">' +
      '<button class="tb-tab' + (showArchived ? '' : ' active') +
      '" data-act="inbox-tab" data-archived="0">' + L('ยังไม่เก็บ') + '</button>' +
      '<button class="tb-tab' + (showArchived ? ' active' : '') +
      '" data-act="inbox-tab" data-archived="1">' + L('เก็บแล้ว') + '</button></div>';

    if (!list.length) {
      h += '<div class="empty"><div class="big">📭</div>' +
        (showArchived ? L('ยังไม่มีรายการที่เก็บไว้') : L('ไม่มีการแจ้งเตือนใหม่')) + '</div></div>';
      return h;
    }

    list.forEach(function (n) {
      var t = S.task(n.taskId);
      h += '<div class="nrow' + (n.read ? '' : ' unread') + '" data-act="open-notif" data-id="' +
        esc(n.id) + '" data-task="' + esc(n.taskId) + '">';
      h += n.read ? '<span style="width:8px;flex:0 0 8px"></span>' : '<span class="unread-dot"></span>';
      h += '<div class="body"><div class="txt">' + esc(n.text) + '</div>' +
        '<div class="sub">' + esc(t ? t.name : L('(งานถูกลบแล้ว)')) + ' · ' +
        fmtWhen(n.createdAt) + '</div></div>';
      h += '<span class="acts">' +
        (n.archived ? '' :
          '<button class="btn btn-sm btn-ghost" data-act="archive-notif" data-id="' +
          esc(n.id) + '" title="' + L('เก็บ') + '">✓' + '</button>') +
        '</span>';
      h += '</div>';
    });
    h += '</div>';
    return h;
  }

  /* ---------- calendar ---------- */

  function calendarView(projectId, monthOffset) {
    var base = new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() + (monthOffset || 0));

    var year = base.getFullYear(), month = base.getMonth();
    var first = new Date(year, month, 1);
    var start = new Date(first);
    start.setDate(1 - ((first.getDay() - weekStart() + 7) % 7));

    /* ปฏิทินรวมกวาดทุกงานในระบบ จึงต้องกรองสิทธิ์เอง
     * ไม่งั้นงานของโปรเจกต์ปิดจะโผล่ให้คนนอกโปรเจกต์เห็นทางนี้ */
    var pool = projectId
      ? S.tasksInProject(projectId).map(function (x) { return x.task; })
      : S.db.tasks.filter(function (t) { return !t.parentId && S.canSeeTask(t.id); });

    var byDate = {};
    pool.forEach(function (t) {
      if (!t.dueOn) return;
      (byDate[t.dueOn] = byDate[t.dueOn] || []).push(t);
    });

    var h = '<div class="cal">';
    h += '<div class="cal-head">' +
      '<button class="btn btn-sm" data-act="cal-prev">' + I('arrowLeft', 14) + '</button>' +
      '<strong style="font-size:15px">' + MONF()[month] + ' ' + YR(year) + '</strong>' +
      '<button class="btn btn-sm" data-act="cal-next">' + I('arrowRight', 14) + '</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="cal-today">' + L('วันนี้') + '</button></div>';

    h += '<div class="cal-grid">';
    DOWR().forEach(function (d) { h += '<div class="cal-dow">' + d + '</div>'; });

    var t = S.today();
    for (var i = 0; i < 42; i++) {
      var d = new Date(start);
      d.setDate(start.getDate() + i);
      var key = S.iso(d);
      var other = d.getMonth() !== month;
      h += '<div class="cal-cell' + (other ? ' other' : '') + (key === t ? ' is-today' : '') + '">';
      h += '<div class="d">' + d.getDate() + '</div>';
      (byDate[key] || []).slice(0, 4).forEach(function (task) {
        var over = !task.completed && task.dueOn < t;
        h += '<div class="cal-task' + (task.completed ? ' done' : (over ? ' over' : '')) +
          '" data-act="open-task" data-id="' + esc(task.id) + '" title="' + esc(task.name) + '">' +
          (task.type === 'milestone' ? I('diamond', 10) + ' ' : '') + esc(task.name) + '</div>';
      });
      var extra = (byDate[key] || []).length - 4;
      if (extra > 0) h += '<div class="d">+' + extra + ' ' + L('อื่น ๆ') + '</div>';
      h += '</div>';
    }
    h += '</div></div>';
    return h;
  }

  /* ---------- search ---------- */

  function searchView(q, sel) {
    var res = S.search(q);
    if (!res.length) {
      return '<div class="empty"><div class="big">🔍</div>' + L('ไม่พบงานที่ตรงกับ “') + esc(q) + '”</div>';
    }
    var h = '<div class="list-wrap">';
    h += '<div class="bucket-head">' + L('พบ {n} รายการ', { n: '<span class="n">' + res.length + '</span>' }) + '</div>';
    res.forEach(function (t) {
      h += taskRow(t, { showProject: true, selectable: true, selected: !!sel[t.id] });
    });
    h += '</div>';
    return h;
  }

  /* ---------- bulk bar ---------- */

  function bulkbar(sel) {
    var ids = Object.keys(sel);
    if (!ids.length) return '';
    var h = '<div class="bulkbar"><span class="n">' + L('เลือก') + ' ' + ids.length + ' ' + L('งาน') + '</span>';
    h += '<button data-act="bulk-complete">' + L('ทำเสร็จ') + '</button>';
    h += '<button data-act="bulk-reopen">' + L('เปิดใหม่') + '</button>';
    h += '<select data-act="bulk-assignee"><option value="">' + L('มอบหมายให้…') + '</option>';
    S.db.users.forEach(function (u) {
      h += '<option value="' + esc(u.id) + '">' + esc(u.name) + '</option>';
    });
    h += '</select>';
    h += '<select data-act="bulk-priority"><option value="">' + L('ความสำคัญ…') + '</option>';
    S.PRIORITIES.forEach(function (p) {
      h += '<option value="' + p.id + '">' + esc(L(p.label)) + '</option>';
    });
    h += '</select>';
    h += '<button data-act="bulk-due">' + L('ตั้งกำหนดส่ง') + '</button>';
    h += '<button data-act="bulk-delete">' + L('ลบ') + '</button>';
    h += '<button data-act="bulk-clear">' + L('ยกเลิก') + '</button>';
    h += '</div>';
    return h;
  }

  /* ---------- drawer ---------- */

  function mentionize(text) {
    var out = esc(text);
    S.db.users.forEach(function (u) {
      var needle = '@' + esc(u.name);
      out = out.split(needle).join('<span class="men">' + needle + '</span>');
    });
    return out;
  }

  function drawer(taskId) {
    var t = S.task(taskId);
    if (!t) return '';
    var u = S.user(t.assigneeId);
    var pr = prio(t.priority);
    var tt = taskType(t.type);
    var homes = S.projectsOfTask(t.id);
    var subs = S.subtasks(t.id);
    var stories = S.storiesOfTask(t.id);
    var blockedBy = t.dependsOn.map(function (d) {
      var bt = S.task(d.id);
      return bt ? { task: bt, type: d.type || "FS" } : null;
    }).filter(function (x) { return x; });
    var blocks = S.blocking(t.id);
    var liked = t.likes.indexOf(S.db.currentUserId) >= 0;
    var following = t.followers.indexOf(S.db.currentUserId) >= 0;

    var h = '';
    h += '<div class="dw-head">' + checkbox(t) +
      '<span style="font-size:13px;color:var(--fg-soft)">' +
      (t.completed ? L('ทำเสร็จแล้ว') : L('ทำเครื่องหมายว่าเสร็จ')) + '</span>' +
      '<div style="flex:1"></div>' +
      '<button class="btn btn-sm btn-ghost" data-act="toggle-like" data-id="' + esc(t.id) +
      '" title="' + L('ถูกใจ') + '" style="' + (liked ? 'color:var(--danger)' : '') + '">' + I('heart') + ' ' +
      (t.likes.length || '') + '</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="toggle-follow" data-id="' + esc(t.id) +
      '" title="' + (following ? L('เลิกติดตาม') : L('ติดตาม')) + '">' +
      I('bell') + '</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="task-menu" data-id="' + esc(t.id) +
      '" title="' + L('เมนู') + '">' + I('more') + '</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="close-drawer" title="' + L('ปิด') + '">' + I('close', 13) + '</button></div>';

    h += '<div class="dw-body">';

    h += '<textarea class="dw-title' + (t.completed ? ' done' : '') +
      '" data-act="edit-title" rows="1">' + esc(t.name) + '</textarea>';

    var blockers = S.blockers(t.id);
    if (blockers.length && !t.completed) {
      h += '<div class="dw-banner">' + I('blocked') + ' ' + L('รออยู่:') + ' ' +
        blockers.map(function (b) { return esc(b.name); }).join(', ') + '</div>';
    }

    // ชนิดงาน
    h += '<div class="fld"><label>' + L('ชนิดงาน') + '</label><div class="val"><select class="inp" ' +
      'data-act="edit-type">';
    S.TASK_TYPES.forEach(function (x) {
      h += '<option value="' + x.id + '"' + (t.type === x.id ? ' selected' : '') + '>' +
        x.icon + ' ' + esc(L(x.label)) + '</option>';
    });
    h += '</select></div></div>';

    // สถานะอนุมัติ
    if (t.type === 'approval') {
      var a = approvalState(t.approval);
      h += '<div class="fld"><label>' + L('การอนุมัติ') + '</label><div class="val">' +
        '<div class="fld-inline"><span class="approval-pill" style="background:' + a.color +
        '22;color:' + a.color + '">' + esc(L(a.label)) + '</span>';
      S.APPROVAL_STATES.forEach(function (x) {
        if (x.id === t.approval) return;
        h += '<button class="btn btn-sm" data-act="set-approval" data-id="' + esc(t.id) +
          '" data-v="' + x.id + '">' + esc(L(x.label)) + '</button>';
      });
      h += '</div></div></div>';
    }

    h += '<div class="fld"><label>' + L('ผู้รับผิดชอบ') + '</label><div class="val picker">' +
      '<button class="picker-btn" data-act="pick-assignee">' + avatar(u) +
      '<span>' + esc(u ? u.name : L('ยังไม่มอบหมาย')) + '</span></button></div></div>';

    h += '<div class="fld"><label>' + L('วันเริ่ม') + '</label><div class="val">' +
      '<input class="inp" type="date" data-act="edit-start" value="' + esc(t.startOn || '') +
      '"></div></div>';

    h += '<div class="fld"><label>' + L('กำหนดส่ง') + '</label><div class="val fld-inline">' +
      '<input class="inp" type="date" data-act="edit-due" value="' + esc(t.dueOn || '') +
      '" style="flex:1">' +
      '<input class="inp" type="time" data-act="edit-duetime" value="' + esc(t.dueTime || '') +
      '" style="flex:0 0 110px" title="' + L('เวลา (ไม่บังคับ') + ')">' + '</div></div>';

    h += '<div class="fld"><label>' + L('ทำซ้ำ') + '</label><div class="val fld-inline">' +
      '<select class="inp" data-act="edit-recur" style="flex:1"><option value="">' + L('ไม่ทำซ้ำ') + '</option>';
    S.RECUR_FREQ.forEach(function (x) {
      h += '<option value="' + x.id + '"' +
        (t.recur && t.recur.freq === x.id ? ' selected' : '') + '>' + esc(L(x.label)) + '</option>';
    });
    h += '</select>';
    if (t.recur) {
      h += '<input class="inp" type="number" min="1" max="30" data-act="edit-recur-n" value="' +
        (t.recur.interval || 1) + '" style="flex:0 0 70px" title="' + L('ทุกกี่รอบ') + '">';
    }
    h += '</div></div>';

    h += '<div class="fld"><label>' + L('ความสำคัญ') + '</label><div class="val picker">' +
      '<button class="picker-btn" data-act="pick-priority">' +
      '<span class="swatch" style="width:9px;height:9px;border-radius:50%;display:inline-block;background:' +
      pr.color + '"></span><span>' + L(pr.label) + '</span></button></div></div>';

    // โปรเจกต์ (multi-homing)
    h += '<div class="fld"><label>' + L('โปรเจกต์') + '</label><div class="val" style="padding-top:5px">';
    homes.forEach(function (x) {
      var sec = S.section(x.project.id, x.membership.sectionId);
      h += '<span class="chip" style="margin:0 5px 5px 0"><span class="swatch" style="background:' +
        esc(x.project.color) + '"></span>' + esc(x.project.name) +
        (sec ? ' · ' + esc(sec.name) : '') +
        (homes.length > 1 ? '<button data-act="unhome" data-id="' + esc(t.id) +
          '" data-project="' + esc(x.project.id) + '">' + I('close', 13) + '</button>' : '') + '</span>';
    });
    h += '<button class="btn btn-sm btn-ghost" data-act="add-home" data-id="' + esc(t.id) +
      '">+ ' + L('เพิ่มโปรเจกต์') + '</button></div></div>';

    // แท็ก
    h += '<div class="fld"><label>' + L('แท็ก') + '</label><div class="val" style="padding-top:5px">';
    t.tags.forEach(function (tg) {
      h += '<span class="chip tag" style="margin:0 5px 5px 0">' + esc(tg) +
        '<button data-act="remove-tag" data-id="' + esc(t.id) + '" data-tag="' + esc(tg) +
        '">' + I('close', 13) + '</button></span>';
    });
    h += '<button class="btn btn-sm btn-ghost" data-act="add-tag" data-id="' + esc(t.id) +
      '">+ ' + L('แท็ก') + '</button></div></div>';

    // ฟิลด์กำหนดเอง จากทุกโปรเจกต์ที่งานนี้อยู่
    var seen = {};
    homes.forEach(function (x) {
      x.project.fields.forEach(function (f) {
        if (seen[f.id]) return;
        seen[f.id] = true;
        var v = S.fieldValue(t.id, f.id);
        h += '<div class="fld"><label>' + esc(f.name) + '</label><div class="val">';
        if (f.type === 'select') {
          h += '<select class="inp" data-act="edit-field" data-field="' + esc(f.id) +
            '"><option value="">—</option>';
          f.options.forEach(function (o) {
            h += '<option' + (v === o ? ' selected' : '') + '>' + esc(o) + '</option>';
          });
          h += '</select>';
        } else if (f.type === 'person') {
          h += '<select class="inp" data-act="edit-field" data-field="' + esc(f.id) +
            '"><option value="">—</option>';
          S.db.users.forEach(function (usr) {
            h += '<option value="' + esc(usr.id) + '"' + (v === usr.id ? ' selected' : '') +
              '>' + esc(usr.name) + '</option>';
          });
          h += '</select>';
        } else {
          var typ = f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text');
          h += '<input class="inp" type="' + typ + '" data-act="edit-field" data-field="' +
            esc(f.id) + '" value="' + esc(v == null ? '' : v) + '">';
        }
        h += '</div></div>';
      });
    });

    // รายละเอียด
    h += '<div class="dw-sec-title">' + L('รายละเอียด') + '</div>';
    h += '<textarea class="inp" data-act="edit-notes" placeholder="' + L('เพิ่มรายละเอียด…') + '">' +
      esc(t.notes) + '</textarea>';

    // ลำดับก่อนหลัง
    h += '<div class="dw-sec-title">' + L('ลำดับก่อนหลัง') +
      '<button class="btn btn-sm btn-ghost" data-act="add-dependency" data-id="' + esc(t.id) +
      '">+ ' + L('เพิ่ม') + '</button></div>';
    if (!blockedBy.length && !blocks.length) {
      h += '<div style="font-size:13px;color:var(--fg-faint)">' + L('ยังไม่มีความสัมพันธ์กับงานอื่น') + '</div>';
    }
    blockedBy.forEach(function (x) {
      var b = x.task;
      h += '<div class="dep-row"><span class="dot" style="background:' +
        (b.completed ? 'var(--ok)' : 'var(--danger)') + '"></span>' +
        '<span class="dep-type" title="' + esc(depTypeHint(x.type)) + '">' + esc(x.type) + '</span>' +
        '<span class="nm" data-act="open-task" data-id="' + esc(b.id) +
        '" style="cursor:pointer">' + esc(b.name) + '</span>' +
        '<select class="dep-sel" data-act="edit-dep-type" data-id="' + esc(t.id) +
        '" data-blocker="' + esc(b.id) + '">' +
        S.DEP_TYPES.map(function (d) {
          return '<option value="' + d.id + '"' + (d.id === x.type ? ' selected' : '') +
            '>' + esc(L(d.label)) + '</option>';
        }).join('') + '</select>' +
        '<button class="btn btn-sm btn-ghost" data-act="remove-dependency" data-id="' + esc(t.id) +
        '" data-blocker="' + esc(b.id) + '">' + I('close', 13) + '</button></div>';
    });
    blocks.forEach(function (b) {
      h += '<div class="dep-row"><span class="dot" style="background:var(--fg-faint)"></span>' +
        '<span style="font-size:12px;color:var(--fg-faint)">' + L('บล็อก') + '</span>' +
        '<span class="nm" data-act="open-task" data-id="' + esc(b.id) +
        '" style="cursor:pointer">' + esc(b.name) + '</span></div>';
    });

    // ไฟล์แนบ
    h += '<div class="dw-sec-title">' + L('ไฟล์แนบ') +
      '<button class="btn btn-sm btn-ghost" data-act="add-attachment" data-id="' + esc(t.id) +
      '">+ ' + L('เพิ่ม') + '</button></div>';
    if (!t.attachments.length) {
      h += '<div style="font-size:13px;color:var(--fg-faint)">' + L('ยังไม่มีไฟล์แนบ') + '</div>';
    }
    t.attachments.forEach(function (a) {
      h += '<div class="att-row">' + I('paperclip', 14) + '<span class="nm">' +
        (a.url ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.name) + '</a>'
               : esc(a.name)) + '</span>' +
        '<button class="btn btn-sm btn-ghost" data-act="remove-attachment" data-id="' + esc(t.id) +
        '" data-att="' + esc(a.id) + '">' + I('close', 13) + '</button></div>';
    });

    // ผู้ติดตาม
    h += '<div class="dw-sec-title">' + L('ผู้ติดตาม') +
      '<button class="btn btn-sm btn-ghost" data-act="pick-follower" data-id="' + esc(t.id) +
      '">+ ' + L('เพิ่ม') + '</button></div>';
    h += '<div class="picker"><div class="fld-inline">';
    t.followers.forEach(function (fid) {
      var fu = S.user(fid);
      if (!fu) return;
      h += '<span class="chip">' + avatar(fu, 'sm') + esc(fu.name) +
        '<button data-act="remove-follower" data-id="' + esc(t.id) + '" data-user="' +
        esc(fid) + '">' + I('close', 13) + '</button></span>';
    });
    if (!t.followers.length) h += '<span style="font-size:13px;color:var(--fg-faint)">' + L('ยังไม่มี') + '</span>';
    h += '</div></div>';

    // งานย่อย
    h += '<div class="dw-sec-title">' + L('งานย่อย') + ' <span style="color:var(--fg-faint)">' +
      subs.filter(function (s) { return s.completed; }).length + '/' + subs.length + '</span></div>';
    subs.forEach(function (s) {
      h += '<div class="sub-row' + (s.completed ? ' done' : '') + '">' + checkbox(s) +
        '<span class="nm" data-act="open-task" data-id="' + esc(s.id) +
        '" style="cursor:pointer">' + esc(s.name) + '</span>' +
        avatar(S.user(s.assigneeId), 'sm') +
        '<button class="x" data-act="delete-task" data-id="' + esc(s.id) + '">' + I('close', 13) + '</button></div>';
    });
    h += '<button class="add-row" data-act="add-subtask" data-id="' + esc(t.id) +
      '">+ ' + L('เพิ่มงานย่อย') + '</button>';

    // ความเคลื่อนไหว
    h += '<div class="dw-sec-title">' + L('ความเคลื่อนไหว') + '</div>';
    stories.forEach(function (s) {
      var actor = S.user(s.actorId);
      if (s.type === 'comment') {
        h += '<div class="story">' + avatar(actor) + '<div class="body">' +
          '<div class="who">' + esc(actor ? actor.name : '?') +
          '<span class="when">' + fmtWhen(s.createdAt) + '</span></div>' +
          '<div class="txt">' + mentionize(s.text) + '</div></div></div>';
      } else {
        h += '<div class="story log">' + avatar(actor, 'sm') +
          '<div class="txt">' + esc(actor ? actor.name : '?') + ' ' + esc(s.text) +
          '<span class="when">' + fmtWhen(s.createdAt) + '</span></div></div>';
      }
    });

    h += '</div>';

    h += '<div class="dw-foot"><div class="comment-box">' + avatar(S.me()) +
      '<textarea id="commentInput" placeholder="' + L('เขียนความเห็น… พิมพ์ @ชื่อ เพื่อแจ้งเตือน (Ctrl+Enter ส่ง)') + '"></textarea>' +
      '<button class="btn btn-primary btn-sm" data-act="send-comment" data-id="' +
      esc(t.id) + '">' + L('ส่ง') + '</button></div></div>';

    return h;
  }

  /* ---------- บัญชีบริษัทและการซิงก์ ---------- */

  /** โหมดทีมพร้อมใช้ไหม — ตั้งค่าครบและโหลดไลบรารีได้ */
  function teamReady() {
    return !!(global.OrbitAuth && global.OrbitAuth.available());
  }

  var SYNC_LOOK = {
    loading:  ['cloud',      'กำลังโหลดข้อมูล…', 'busy'],
    syncing:  ['cloud',      'กำลังบันทึก…',      'busy'],
    synced:   ['cloudCheck', 'ซิงก์แล้ว',         'ok'],
    offline:  ['cloudOff',   'ออฟไลน์',           'warn'],
    conflict: ['alert',      'ข้อมูลชนกัน',        'bad'],
    error:    ['alert',      'ซิงก์ไม่สำเร็จ',     'bad']
  };

  function syncAgo(ts) {
    return fmtWhen(new Date(ts).toISOString());
  }

  /** ป้ายสถานะบนแถบบน — ไม่แสดงอะไรเลยเมื่อใช้งานแบบเครื่องเดียว */
  function syncChip() {
    var Y = global.OrbitSync;
    if (!Y || Y.state.mode !== 'team') return '';
    var s = Y.state;
    var look = SYNC_LOOK[s.status] || SYNC_LOOK.synced;
    var tip = (s.error ? L(s.error) : null) || (s.lastSync ? L('ซิงก์ล่าสุด') + ' ' + syncAgo(s.lastSync) : '');
    return '<button class="sync-chip ' + look[2] + '" data-act="sync-menu" title="' +
      esc(tip) + '">' + I(look[0], 15) +
      '<span class="sync-txt">' + L(look[1]) + '</span></button>';
  }

  /** เนื้อหาเมนูที่เปิดจากป้ายสถานะ */
  function syncMenu() {
    var s = global.OrbitSync.state;
    var h = '<div class="pop-note strong">' + L('ข้อมูลส่วนกลาง') + '</div>';
    h += '<div class="pop-note">' + esc(global.OrbitCloud.describeTarget()) + '</div>';
    if (s.error) h += '<div class="pop-note bad">' + esc(L(s.error)) + '</div>';

    if (s.status === 'conflict') {
      h += '<div class="pop-note bad">' +
        L('มีคนแก้ข้อมูลชุดเดียวกันพร้อมกับเรา ต้องเลือกว่าจะเก็บชุดไหน') + '</div>';
      h += '<button data-act="sync-export-mine">' + I('archive') +
        '<span>' + L('บันทึกงานของฉันเป็นไฟล์ก่อน') + '</span></button>';
      h += '<button data-act="sync-take-theirs">' + I('cloudCheck') +
        '<span>' + L('ใช้ข้อมูลส่วนกลาง ทิ้งของฉัน') + '</span></button>';
      h += '<button class="danger" data-act="sync-keep-mine">' + I('cloud') +
        '<span>' + L('เขียนทับส่วนกลางด้วยของฉัน') + '</span></button>';
    } else {
      if (s.lastSync) {
        h += '<div class="pop-note">' + L('ซิงก์ล่าสุด') + ' ' + esc(syncAgo(s.lastSync)) + '</div>';
      }
      h += '<button data-act="sync-now">' + I('repeat') +
        '<span>' + L('ดึงข้อมูลล่าสุดเดี๋ยวนี้') + '</span></button>';
    }
    return h;
  }

  /** แถวบัญชีท้ายแถบข้าง — โหมดทีมกดแล้วเป็นเมนูบัญชี ไม่ใช่สลับผู้ใช้ */
  function accountBlock(me) {
    var team = global.OrbitSync && global.OrbitSync.state.mode === 'team';
    var inner = avatar(me, 'lg') +
      '<span class="meta"><span class="nm">' + esc(me ? me.name : '-') + '</span>' +
      '<span class="em">' + esc(me ? me.email : '') + '</span></span>';
    if (team) {
      return '<button class="sb-user" data-act="account-menu" title="' +
        L('บัญชีบริษัท') + '">' + inner +
        '<span class="sb-user-badge">' + I('building', 13) + '</span></button>';
    }
    // ตั้งค่าโหมดทีมไว้แล้วแต่ยังไม่ได้ล็อกอิน — ต้องมีทางกลับเข้าไป
    var signin = teamReady()
      ? '<button class="sb-item sb-signin" data-act="show-gate">' + I('signIn') +
        '<span class="grow">' + L('เข้าสู่ระบบด้วยบัญชีบริษัท') + '</span></button>'
      : '';
    /* โหมดเครื่องเดียวก็เปิดเมนูเดียวกัน ไม่งั้นจะแก้โปรไฟล์กับตั้งค่าไม่ได้เลย
     * จนกว่าจะเชื่อมต่อระบบทีม ซึ่งไม่มีเหตุผล */
    return signin + '<button class="sb-user" data-act="account-menu">' + inner + '</button>';
  }

  /** เมนูบัญชี — ทางเข้าเดียวสำหรับทุกอย่างที่เป็นเรื่องของ "ตัวฉัน"
   *
   * ใช้ทั้งโหมดเครื่องเดียวและโหมดทีม ต่างกันแค่บรรทัดสุดท้าย
   * เพราะโหมดเครื่องเดียวยังไม่มีอะไรให้ออกจากระบบ มีแต่สลับผู้ใช้เพื่อทดสอบ
   */
  function accountMenu() {
    var me = S.me();
    var team = global.OrbitSync && global.OrbitSync.state.mode === 'team';
    var away = me && S.isAway(me.id);

    var h = '<div class="acct-head">' + avatar(me, 'lg') +
      '<div><b>' + esc(me ? me.name : '-') +
      '<i class="acct-dot' + (away ? ' away' : '') + '" title="' +
      (away ? L('ไม่อยู่') : L('ทำงานอยู่')) + '"></i></b>' +
      '<em>' + esc(me ? me.email : '') + '</em>' +
      (me && me.title ? '<em>' + esc(me.title) + '</em>' : '') + '</div></div>';

    h += '<button class="acct-away" data-act="set-away">' + I('calendar', 14) +
      '<span class="grow">' + (away
        ? esc(L('ไม่อยู่ถึง {d}', { d: fmtDate(me.away.until) }))
        : L('ตั้งสถานะไม่อยู่')) + '</span></button>';

    h += '<div class="pop-sep"></div>';
    if (S.isAdmin()) {
      h += '<button data-act="go" data-route="admin">' + I('building', 14) +
        '<span class="grow">' + L('องค์กรของฉัน') + '</span></button>';
    }
    h += '<button data-act="open-settings" data-tab="profile">' + I('users', 14) +
      '<span class="grow">' + L('โปรไฟล์') + '</span></button>';
    h += '<button data-act="open-settings" data-tab="general">' + I('settings', 14) +
      '<span class="grow">' + L('ตั้งค่า') + '</span></button>';

    h += '<div class="pop-sep"></div>';
    if (team) {
      h += '<button data-act="sync-now">' + I('repeat', 14) +
        '<span class="grow">' + L('ดึงข้อมูลล่าสุดเดี๋ยวนี้') + '</span></button>';
      h += '<button data-act="sign-out">' + I('signOut', 14) +
        '<span class="grow">' + L('ออกจากระบบ') + '</span></button>';
    } else {
      h += '<button data-act="switch-user">' + I('users', 14) +
        '<span class="grow">' + L('สลับผู้ใช้ (ทดสอบ)') + '</span></button>';
    }
    return h;
  }


  /** หน้าจอสำหรับบัญชีที่ถูกปิดใช้งาน
   *  ถ้าไม่มีหน้านี้ คนที่ถูกปิดจะเห็นแอปที่กดอะไรก็ไม่ขึ้น โดยไม่รู้ว่าทำไม */
  function disabledScreen() {
    var me = S.me();
    var h = '<div class="gate-card">';
    h += '<div class="gate-logo">' + global.Icons.logoLockup(30) + '</div>';
    h += '<h1>' + L('บัญชีของคุณถูกปิดใช้งาน') + '</h1>';
    h += '<p>' + L('บัญชีนี้ถูกผู้ดูแลระบบปิดการใช้งานไว้ จึงเข้าถึงข้อมูลงานไม่ได้') + '</p>';
    if (me && me.email) {
      h += '<div class="gate-who">' + esc(me.name) + ' · ' + esc(me.email) + '</div>';
    }
    h += '<div class="gate-err">' + I('alert', 15) + '<span>' +
      L('หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อฝ่ายเทคโนโลยีสารสนเทศ') + '</span></div>';
    h += '<button class="gate-alt" data-act="sign-out">' + L('ออกจากระบบ') + '</button>';
    h += '</div>';
    return h;
  }
  /** หน้าเข้าสู่ระบบเต็มจอ ใช้เมื่อเปิดโหมดทีมแต่ยังไม่ได้ล็อกอิน */
  function gateScreen(st) {
    st = st || {};
    if (st.checking) {
      return '<div class="gate-card"><div class="gate-logo">' +
        global.Icons.logoLockup(30) + '</div><p class="gate-checking">' +
        L('กำลังตรวจสอบการเข้าสู่ระบบ…') + '</p></div>';
    }
    var h = '<div class="gate-card">';
    h += '<div class="gate-logo">' + global.Icons.logoLockup(30) + '</div>';
    h += '<h1>' + L('เข้าสู่ระบบด้วยบัญชีบริษัท') + '</h1>';
    h += '<p>' + L('ใช้บัญชี Microsoft 365 ของบริษัท เพื่อให้ทั้งทีมเห็นงานชุดเดียวกัน') + '</p>';

    if (st.error) h += '<div class="gate-err">' + I('alert', 15) + '<span>' + esc(L(st.error)) + '</span></div>';

    h += '<button class="btn btn-primary gate-btn" data-act="sign-in"' +
      (st.busy ? ' disabled' : '') + '>' + I('signIn', 17) + '<span>' +
      (st.busy ? L('กำลังพาไปหน้าเข้าสู่ระบบ…') : L('เข้าสู่ระบบด้วย Microsoft')) +
      '</span></button>';

    h += '<button class="gate-alt" data-act="use-local">' +
      L('ลองใช้แบบเครื่องเดียวก่อน (ข้อมูลไม่แชร์กับทีม)') + '</button>';

    h += '<div class="gate-foot">' + I('shield', 14) + '<span>' +
      L('ข้อมูลเก็บอยู่ใน Microsoft 365 ของบริษัทเท่านั้น ไม่ผ่านเซิร์ฟเวอร์อื่น') +
      '</span></div>';
    h += '</div>';
    return h;
  }

  /* ---------- หน้าผู้ดูแลระบบ ---------- */



  /* ---------- ตัวช่วยแสดงบันทึกการทำงาน ---------- */

  var AUDIT_GROUP = {
    auth: 'การเข้าใช้งาน', user: 'จัดการสมาชิก', project: 'โปรเจกต์',
    system: 'ระบบ', task: 'งาน', security: 'ความปลอดภัย'
  };
  function auditGroupLabel(g) { return AUDIT_GROUP[g] || g; }

  /* แปลรหัสการกระทำเป็นประโยคที่คนอ่านรู้เรื่อง
     ถ้าเจอรหัสที่ยังไม่ได้แปล จะคืนรหัสเดิม ไม่ปล่อยให้ว่าง */
  /* ข้อความในบันทึกการทำงาน
   *
   * ทุกอันขึ้นต้นด้วย "ได้" โดยตั้งใจ
   * คีย์คำแปลของแอปนี้คือข้อความไทยตรง ๆ ถ้าใช้คำเดียวกับปุ่ม เช่น "ลบโปรเจกต์"
   * คำแปลอังกฤษจะทับกัน แล้วปุ่มจะกลายเป็น "deleted project" หรือบันทึกกลายเป็น
   * "Delete project" อย่างใดอย่างหนึ่งเสมอ การเติม "ได้" ทำให้คีย์ไม่มีวันชนกับปุ่ม
   * และอ่านเป็นประโยคบอกเล่าได้พอดี "สมชาย ได้ลบโปรเจกต์ X"
   */
  var AUDIT_TEXT = {
    'auth.login': 'ได้เข้าสู่ระบบ',
    'auth.first-login': 'ได้เข้าสู่ระบบครั้งแรก',
    'auth.logout': 'ได้ออกจากระบบ',
    'auth.denied': 'ถูกปฏิเสธการเข้าถึง',
    'user.add': 'ได้เพิ่มสมาชิก',
    'user.remove': 'ได้ลบสมาชิก',
    'user.role': 'ได้เปลี่ยนบทบาทของ',
    'user.disable': 'ได้ปิดใช้งานบัญชีของ',
    'user.enable': 'ได้เปิดใช้งานบัญชีของ',
    'user.handover': 'ได้โอนงานต่อจาก',
    'user.away': 'ได้ตั้งสถานะไม่อยู่',
    'user.back': 'ได้ยกเลิกสถานะไม่อยู่',
    'project.create': 'ได้สร้างโปรเจกต์',
    'project.duplicate': 'ได้คัดลอกโปรเจกต์',
    'project.delete': 'ได้ลบโปรเจกต์',
    'project.visibility': 'ได้เปลี่ยนความเป็นส่วนตัวของ',
    'project.lock': 'ได้ล็อกรายชื่อสมาชิกของ',
    'project.unlock': 'ได้ปลดล็อกรายชื่อสมาชิกของ',
    'project.member': 'ได้ตั้งสิทธิ์ในโปรเจกต์',
    'project.member-remove': 'ได้ถอดสมาชิกออกจากโปรเจกต์',
    'project.baseline': 'ได้ตั้งเส้นฐานของ',
    'project.baselineClear': 'ได้ลบเส้นฐานของ',
    'project.import': 'ได้นำเข้างานเข้าโปรเจกต์',
    'project.export': 'ได้ส่งออกงานของโปรเจกต์',
    'portfolio.create': 'ได้สร้างพอร์ตโฟลิโอ',
    'portfolio.delete': 'ได้ลบพอร์ตโฟลิโอ',
    'portfolio.add': 'ได้เพิ่มโปรเจกต์เข้าพอร์ตโฟลิโอ',
    'portfolio.remove': 'ได้ถอดโปรเจกต์ออกจากพอร์ตโฟลิโอ',
    'system.reset': 'ได้ล้างข้อมูลทั้งหมด',
    'system.export': 'ได้ส่งออกข้อมูล',
    'system.import': 'ได้นำเข้าข้อมูล'
  };
  function auditText(a) { return AUDIT_TEXT[a] || a; }

  var AUDIT_ICON = {
    auth: 'signIn', user: 'users', project: 'archive',
    system: 'settings', task: 'checkCircle', security: 'shield'
  };
  function auditIcon(a) { return AUDIT_ICON[a.split('.')[0]] || 'more'; }
  /** บอกว่าคนนี้เข้าระบบด้วยวิธีไหน ผู้ดูแลจะได้รู้ว่าต้องตัดสิทธิ์ที่ไหนบ้าง */
  function authTag(u) {
    if (!u) return '';
    if (u.authBy === 'password') {
      return ' <span class="auth-tag pw">' + L('รหัสผ่าน') + '</span>';
    }
    if (u.authBy === 'microsoft') {
      return ' <span class="auth-tag ms">Microsoft</span>';
    }
    return '';
  }
  function roleLabel(id) {
    var r = S.ROLES.filter(function (x) { return x.id === id; })[0];
    return r ? L(r.label) : L('สมาชิก');
  }

  function adminView(filter) {
    var f = filter || {};
    var db = S.db;
    var team = global.OrbitSync && global.OrbitSync.state.mode === 'team';

    var h = '<div class="admin">';

    /* ความจริงที่ต้องบอกก่อน ไม่ให้เข้าใจผิดว่าตั้งบทบาทแล้วปลอดภัย */
    h += '<div class="admin-note">' + I('shield', 16) +
      '<div><b>' + L('บทบาทที่นี่ใช้จัดระเบียบ ไม่ใช่กำแพงความปลอดภัย') + '</b><br>' +
      L('Orbit ทำงานในเบราว์เซอร์ จึงบังคับสิทธิ์จริงไม่ได้ ' +
        'ถ้าต้องการให้ใครแก้ไม่ได้จริง ให้ตั้งสิทธิ์บนไซต์ SharePoint เป็น Read ' +
        'แล้ว Microsoft จะปฏิเสธการบันทึกให้เอง') + '</div></div>';

    /* ---- ที่เก็บข้อมูล ---- */
    h += '<section class="admin-sec"><h3>' + L('ที่เก็บข้อมูล') + '</h3>';
    h += '<div class="admin-grid">';
    if (team) {
      var st = global.OrbitSync.state;
      h += kv(L('โหมดการทำงาน'), L('ทีม — ข้อมูลอยู่ส่วนกลาง'), 'ok');
      h += kv(L('ที่อยู่ไฟล์'), global.OrbitCloud.describeTarget(), 'mono');
      h += kv(L('ซิงก์ล่าสุด'), st.lastSync ? syncAgo(st.lastSync) : L('ยังไม่เคย'));
      h += kv(L('สถานะ'), L((SYNC_LOOK[st.status] || SYNC_LOOK.synced)[1]));
    } else {
      h += kv(L('โหมดการทำงาน'), L('เครื่องเดียว — ข้อมูลไม่แชร์กับทีม'), 'warn');
      h += kv(L('ที่เก็บ'), S.storageKind === 'memory'
        ? L('หน่วยความจำ (หายเมื่อรีเฟรช)') : L('เบราว์เซอร์เครื่องนี้'));
    }
    h += kv(L('ขนาดข้อมูล'), fmtSize(S.snapshotJSON().length));
    h += kv(L('จำนวนงาน'), String(db.tasks.length));
    h += '</div>';
    h += '<div class="admin-acts">' +
      '<button class="btn" data-act="export">' + I('archive') + ' ' + L('ดาวน์โหลดสำรอง') + '</button>' +
      (team ? '<button class="btn" data-act="sync-now">' + I('repeat') + ' ' +
        L('ดึงข้อมูลล่าสุดเดี๋ยวนี้') + '</button>' : '') +
      '</div>';
    h += '</section>';
    /* ---- สมาชิกและสิทธิ์ ---- */
    h += '<section class="admin-sec"><h3>' + L('สมาชิกและสิทธิ์') +
      '<span class="admin-count">' + db.users.length + ' ' + L('คน') + '</span>' +
      '<button class="btn btn-sm btn-primary" data-act="add-user">' + I('plus', 13) + ' ' +
      L('เพิ่มสมาชิกใหม่') + '</button></h3>';

    if (team) {
      h += '<div class="admin-demo">' + I('alert', 15) + '<div>' +
        L('การเพิ่มหรือลบที่นี่ไม่ได้ให้หรือถอนสิทธิ์เข้าถึงข้อมูล ' +
          'ต้องเพิ่มหรือเอาออกจากไซต์ SharePoint ควบคู่กันเสมอ') + '</div></div>';
    }

    h += '<div class="admin-tbl">';
    h += '<div class="admin-tr admin-th"><span>' + L('ชื่อ') + '</span><span>' +
      L('บทบาท') + '</span><span>' + L('เข้าใช้ล่าสุด') + '</span><span></span></div>';
    db.users.forEach(function (u) {
      var isMe = u.id === db.currentUserId;
      var lastAdmin = u.role === 'admin' && S.adminCount() <= 1;
      var off = u.active === false;
      h += '<div class="admin-tr' + (off ? ' is-off' : '') + '">';

      h += '<span class="admin-who">' + avatar(u) +
        '<span><b>' + esc(u.name) + (isMe ? ' <i>' + L('(คุณ)') + '</i>' : '') +
        (off ? '<span class="pill-off">' + L('ปิดใช้งาน') + '</span>' : '') + '</b>' +
        '<em>' + esc(u.email || '—') + authTag(u) + '</em></span></span>';

      h += '<span><button class="role-pill' + (u.role === 'admin' ? ' is-admin' : '') +
        '" data-act="pick-role" data-id="' + esc(u.id) + '">' +
        roleLabel(u.role) + ' ' + I('chevronDown', 12) + '</button></span>';

      h += '<span class="admin-seen">' +
        (u.lastSeenAt ? esc(fmtWhen(u.lastSeenAt))
                      : '<i class="never">' + L('ยังไม่เคยเข้าใช้') + '</i>') + '</span>';

      h += '<span class="admin-rm">';
      if (!isMe) {
        /* จำนวนงานค้างเห็นตั้งแต่ในแถว ผู้ดูแลจะได้รู้ก่อนกดปิดบัญชี
         * ว่าการปิดคนนี้จะทำให้งานกี่ชิ้นไม่มีเจ้าของ */
        var openN = S.openTasksOf(u.id).length;
        if (openN) {
          h += '<button class="icon-btn" data-act="handover" data-id="' + esc(u.id) +
            '" title="' + L('โอนงานที่ค้างอยู่ {n} งานให้คนอื่น', { n: openN }) + '">' +
            I('signOut', 15) + '<span class="admin-openn">' + openN + '</span></button>';
        }
        h += off
          ? '<button class="icon-btn ok" data-act="enable-user" data-id="' + esc(u.id) +
            '" title="' + L('เปิดใช้งานอีกครั้ง') + '">' + I('checkCircle', 15) + '</button>'
          : (lastAdmin ? ''
            : '<button class="icon-btn" data-act="disable-user" data-id="' + esc(u.id) +
              '" title="' + L('ปิดใช้งานบัญชี') + '">' + I('blocked', 15) + '</button>');
        if (!lastAdmin) {
          h += '<button class="icon-btn" data-act="remove-user" data-id="' + esc(u.id) +
            '" title="' + L('ลบออกจากรายชื่อ') + '">' + I('trash', 15) + '</button>';
        }
      }
      h += '</span>';
      h += '</div>';
    });
    h += '</div>';

    /* ตารางอ้างอิงว่าแต่ละระดับทำอะไรได้ ผู้ดูแลจะได้เลือกถูก */
    h += '<details class="admin-roles"><summary>' + L('แต่ละระดับทำอะไรได้บ้าง') + '</summary><ul>';
    S.ROLES.forEach(function (r) {
      h += '<li><b>' + L(r.label) + '</b><span>' + L(r.desc) + '</span></li>';
    });
    h += '<li class="hint">' + I('shield', 14) + '<span>' +
      L('ตอนนี้ระดับ “ดูอย่างเดียว” ยังบังคับได้จริงก็ต่อเมื่อตั้งสิทธิ์บนไซต์ SharePoint ของคนนั้นเป็น Read ด้วย เมื่อย้ายไปฐานข้อมูลแล้ว API จะบังคับให้เอง') +
      '</span></li>';
    h += '</ul></details>';
    h += '</section>';

    /* ---- บันทึกการทำงานของระบบ ----
     * แยกจากกิจกรรมของงาน เพราะตอบคำถามคนละแบบ
     * อันนี้ตอบว่า "ใครทำอะไรกับระบบ" ไว้ให้ผู้ดูแลไล่ย้อนหลังได้ */
    h += '<section class="admin-sec"><h3>' + L('บันทึกการทำงาน') +
      '<span class="admin-count">' + L('{n} รายการ', { n: (db.audit || []).length }) + '</span>' +
      '<button class="btn btn-sm" data-act="audit-csv">' + I('archive', 13) + ' ' +
      L('ส่งออก CSV') + '</button></h3>';

    var groups = S.auditGroups();
    if (groups.length) {
      h += '<div class="audit-filter">';
      h += '<button class="chip' + (!f.group ? ' on' : '') + '" data-act="audit-group" data-g="">' +
        L('ทั้งหมด') + '</button>';
      groups.forEach(function (g) {
        h += '<button class="chip' + (f.group === g ? ' on' : '') +
          '" data-act="audit-group" data-g="' + esc(g) + '">' + L(auditGroupLabel(g)) + '</button>';
      });
      h += '<input class="audit-q" id="auditQ" data-act="audit-q" placeholder="' +
        L('ค้นหาในบันทึก…') + '" value="' + esc(f.q || '') + '">';
      h += '</div>';
    }

    var rows = S.auditLog({ group: f.group, q: f.q, limit: 120 });
    if (!rows.length) {
      h += '<div class="admin-empty">' +
        L('ยังไม่มีบันทึกที่ตรงกับเงื่อนไข') + '</div>';
    } else {
      h += '<ul class="audit">';
      rows.forEach(function (r) {
        var who = S.user(r.actorId);
        h += '<li><span class="ico ' + esc(r.action.split('.')[0]) + '">' +
          I(auditIcon(r.action), 14) + '</span><div>' +
          '<b>' + esc(who ? who.name : '—') + '</b> ' + esc(L(auditText(r.action))) +
          (r.target ? ' <u>' + esc(r.target) + '</u>' : '') +
          (r.detail ? '<span class="d">' + esc(r.detail) + '</span>' : '') +
          '<em>' + esc(fmtWhen(r.at)) + '</em></div></li>';
      });
      h += '</ul>';
      if ((db.audit || []).length > rows.length) {
        h += '<div class="audit-more">' +
          L('แสดง {n} รายการล่าสุด กด “ส่งออก CSV” เพื่อดูทั้งหมด', { n: rows.length }) + '</div>';
      }
    }
    h += '</section>';

    /* ---- กิจกรรมของงานล่าสุด ---- */
    h += '<section class="admin-sec"><h3>' + L('กิจกรรมของงานล่าสุด') + '</h3>';
    var acts = S.recentActivity(20);
    if (!acts.length) {
      h += '<div class="admin-empty">' + L('ยังไม่มีกิจกรรม') + '</div>';
    } else {
      h += '<ul class="admin-log">';
      acts.forEach(function (a) {
        h += '<li><span class="dot"></span><div>' +
          '<b>' + esc(a.actor ? a.actor.name : '?') + '</b> ' +
          esc(a.story.type === 'comment' ? L('แสดงความเห็น') : a.story.text);
        if (a.taskName) {
          h += ' <a href="#/task/' + esc(a.story.taskId) + '">' + esc(a.taskName) + '</a>';
        }
        h += '<em>' + esc(fmtWhen(a.story.createdAt)) + '</em></div></li>';
      });
      h += '</ul>';
    }
    h += '</section>';

    h += '</div>';
    return h;
  }

  function kv(k, v, cls) {
    return '<div class="kv"><span class="k">' + esc(k) + '</span>' +
      '<span class="v ' + (cls || '') + '">' + esc(v) + '</span></div>';
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  global.Render = {
    adminView: adminView, roleLabel: roleLabel, authTag: authTag,
    teamReady: teamReady, syncChip: syncChip, syncMenu: syncMenu, disabledScreen: disabledScreen,
    accountBlock: accountBlock, accountMenu: accountMenu, gateScreen: gateScreen,
    esc: esc, avatar: avatar, initials: initials,
    fmtDate: fmtDate, fmtWhen: fmtWhen,
    prio: prio, taskType: taskType, approvalState: approvalState,
    projectState: projectState, recurLabel: recurLabel,
    MON: MON, MONF: MONF, DOW: DOW, DOWR: DOWR, weekStart: weekStart, YR: YR, ICON: ICON,
    TAB_IDS: TAB_IDS, projectTabs: projectTabs, ZOOMS: ZOOMS, ROW_H: ROW_H,

    checkbox: checkbox, dueClass: dueClass, badges: badges, depTypeHint: depTypeHint,
    sidebar: sidebar, topbar: topbar, viewbar: viewbar, bulkbar: bulkbar,
    listView: listView, boardView: boardView, timelineView: timelineView,
    homeView: homeView, dashboardView: dashboardView,
    portfolioView: portfolioView, PF_TABS: PF_TABS,
    myTasksView: myTasksView, inboxView: inboxView,
    calendarView: calendarView, searchView: searchView, drawer: drawer,
    taskRow: taskRow, taskCard: taskCard
  };

})(window);

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
    if (!u) return '<span class="' + cls + ' empty">+</span>';
    return '<span class="' + cls + '" style="background:' + esc(u.color) + '" title="' +
      esc(u.name) + '">' + esc(initials(u.name)) + '</span>';
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
    h += '<div class="sb-label">' + L('โปรเจกต์') + '<button data-act="new-project" title="' + L('สร้างโปรเจกต์') + '">+</button></div>';
    S.activeProjects().forEach(function (p) {
      var n = S.tasksInProject(p.id).filter(function (x) { return !x.task.completed; }).length;
      h += '<button class="sb-item' +
        (route.type === 'project' && route.id === p.id ? ' active' : '') +
        '" data-act="go" data-route="project" data-id="' + esc(p.id) + '">' +
        '<span class="emoji">' + esc(p.icon) + '</span>' +
        '<span class="swatch" style="background:' + esc(p.color) + '"></span>' +
        '<span class="grow">' + esc(p.name) + '</span>' +
        (n ? '<span class="count">' + n + '</span>' : '') + '</button>';
    });
    var archived = db.projects.filter(function (p) { return p.archived; });
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
    h += '<button class="sb-item" data-act="manage-members">' + I('users') + '' +
         '<span class="grow">' + L('สมาชิกทีม') + '</span></button>';
    h += '<button class="sb-item" data-act="open-settings">' + I('settings') + '' +
         '<span class="grow">' + L('ตั้งค่า / สำรองข้อมูล') + '</span></button>';
    h += '<button class="sb-user" data-act="switch-user">' + avatar(me, 'lg') +
         '<span class="meta"><span class="nm">' + esc(me ? me.name : '-') + '</span>' +
         '<span class="em">' + esc(me ? me.email : '') + '</span></span></button>';
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
      if (p.status) {
        var st = projectState(p.status.state);
        h += '<span class="approval-pill" style="background:' + st.color +
             '22;color:' + st.color + '">' + esc(L(st.label)) + '</span>';
      }
      if (p.archived) h += '<span class="chip">' + L('เก็บเข้าคลังแล้ว') + '</span>';
      h += '</div>' +
        (p.description ? '<div class="tb-desc">' + esc(p.description) + '</div>' : '') +
        '</div>';
    } else if (route.type === 'mytasks') {
      h += '<div class="tb-title">' + I('checkCircle', 20) + ' ' + L('งานของฉัน') + '</div>';
    } else if (route.type === 'inbox') {
      h += '<div class="tb-title">' + I('bell', 20) + ' ' + L('กล่องข้อความ') + '</div>';
    } else if (route.type === 'calendar') {
      h += '<div class="tb-title">' + I('calendar', 20) + ' ' + L('ปฏิทินรวม') + '</div>';
    } else if (route.type === 'search') {
      h += '<div class="tb-title">' + L('ผลการค้นหา “') + esc(route.q) + '”</div>';
    }

    h += '<div class="tb-spacer"></div>';
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
    return h;
  }

  /* ---------- view bar ---------- */

  function viewbar(projectId, view) {
    var p = S.project(projectId);
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
    h += '</select></div>';

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

  /* ---------- list view ---------- */

  function listView(projectId, view, sel) {
    var groups = S.viewGroups(projectId, view);
    var h = '<div class="list-wrap">';
    var total = 0;

    groups.forEach(function (g) {
      total += g.items.length;
      h += '<div class="sec"' + (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + '>';
      h += '<div class="sec-head"><h3>' + esc(L(g.label)) + '</h3>' +
           '<span class="n">' + g.items.length + '</span>';
      if (g.isSection) {
        h += '<span class="acts">' +
          '<button class="btn btn-sm btn-ghost" data-act="move-section" data-section="' +
          esc(g.key) + '" data-delta="-1" title="' + L('ย้ายขึ้น') + '">↑' + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="move-section" data-section="' +
          esc(g.key) + '" data-delta="1" title="' + L('ย้ายลง') + '">↓' + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="rename-section" data-section="' +
          esc(g.key) + '">' + L('เปลี่ยนชื่อ') + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="delete-section" data-section="' +
          esc(g.key) + '">' + L('ลบ') + '</button></span>';
      }
      h += '</div>';
      h += '<div class="sec-body"' + (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + '>';
      g.items.forEach(function (x) {
        h += taskRow(x.task, {
          sectionId: g.isSection ? g.key : null,
          selectable: true, selected: !!sel[x.task.id]
        });
      });
      h += '</div>';
      if (g.isSection) {
        h += '<button class="add-row" data-act="inline-add" data-section="' + esc(g.key) +
          '">+ ' + L('เพิ่มงาน') + '</button>';
      }
      h += '</div>';
    });

    if (!total) {
      h += '<div class="empty"><div class="big">🔍</div>' + L('ไม่มีงานที่ตรงกับตัวกรอง') +
        '<div style="margin-top:12px"><button class="btn" data-act="reset-view">' + L('ล้างตัวกรอง') + '</button></div></div>';
    }
    if (view.group === 'section') {
      h += '<button class="add-row" data-act="add-section" style="margin-top:14px">' + L('+ เพิ่มคอลัมน์') + '</button>';
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
    start.setDate(1 - first.getDay());

    var pool = projectId
      ? S.tasksInProject(projectId).map(function (x) { return x.task; })
      : S.db.tasks.filter(function (t) { return !t.parentId; });

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
    DOW().forEach(function (d) { h += '<div class="cal-dow">' + d + '</div>'; });

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
    h += '<div class="bucket-head">' + L('พบ') + ' <span class="n">' + res.length + '</span> ' + L('รายการ') + '</div>';
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

  global.Render = {
    esc: esc, avatar: avatar, initials: initials,
    fmtDate: fmtDate, fmtWhen: fmtWhen,
    prio: prio, taskType: taskType, approvalState: approvalState,
    projectState: projectState, recurLabel: recurLabel,
    MON: MON, MONF: MONF, DOW: DOW, YR: YR, ICON: ICON,
    TAB_IDS: TAB_IDS, projectTabs: projectTabs, ZOOMS: ZOOMS, ROW_H: ROW_H,

    checkbox: checkbox, dueClass: dueClass, badges: badges, depTypeHint: depTypeHint,
    sidebar: sidebar, topbar: topbar, viewbar: viewbar, bulkbar: bulkbar,
    listView: listView, boardView: boardView, timelineView: timelineView,
    dashboardView: dashboardView, myTasksView: myTasksView, inboxView: inboxView,
    calendarView: calendarView, searchView: searchView, drawer: drawer,
    taskRow: taskRow, taskCard: taskCard
  };

})(window);

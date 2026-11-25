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
    var tip = esc(u.name) +
      (away ? ' · ' + L('ไม่อยู่ถึง {d}', { d: fmtDate(u.away.until) }) +
              (u.away.note ? ' · ' + u.away.note : '') : '');
    /* มีรูปก็ใช้รูป ไม่มีก็ตัวย่อบนวงกลมสีเหมือนเดิม
     * สีพื้นยังใส่ไว้ใต้รูป ระหว่างที่รูปยังไม่ขึ้นจะได้ไม่เป็นช่องโหว่ */
    return '<span class="' + cls + (away ? ' is-away' : '') +
      (u.photo ? ' has-photo' : '') + '" style="background:' + esc(u.color) +
      '" title="' + tip + '">' +
      (u.photo ? '<img src="' + esc(u.photo) + '" alt="">' : esc(initials(u.name))) +
      '</span>';
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

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /** เวลาแบบ 14:32 */
  function fmtTime(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }

  /**
   * เวลาแบบย่อ อ่านง่ายเวลากวาดตา
   *
   * เกินหนึ่งวันแล้วต่อเวลาต่อท้ายวันที่ด้วย เพราะ "24 ส.ค." อย่างเดียว
   * ตอบไม่ได้ว่าคอมเมนต์นั้นมาก่อนหรือหลังการประชุมเช้าวันนั้น
   * ซึ่งเป็นสิ่งที่คนย้อนอ่านเธรดต้องการรู้จริง ๆ
   */
  function fmtWhen(isoTs) {
    var d = new Date(isoTs);
    if (isNaN(d.getTime())) return '';
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return L('เมื่อครู่');
    if (mins < 60) return mins + ' ' + L('นาทีที่แล้ว');
    if (mins < 1440) return Math.round(mins / 60) + ' ' + L('ชม.ที่แล้ว');
    return fmtDate(S.iso(d)) + ' ' + fmtTime(d);
  }

  /** วันและเวลาแบบเต็มไม่กำกวม ใช้เป็น tooltip ของเวลาแบบย่อ */
  function fmtExact(isoTs) {
    var d = new Date(isoTs);
    if (isNaN(d.getTime())) return '';
    return d.getDate() + ' ' + MONF()[d.getMonth()] + ' ' +
           global.I18N.year(d.getFullYear()) + ' ' + fmtTime(d);
  }

  /** ข้อความบันทึกความเคลื่อนไหว แปลตอนแสดง
   *  ข้อมูลเก่าที่เก็บเป็นประโยคไว้แล้วยังอ่านได้ เพราะ L() คืนค่าเดิมเมื่อไม่เจอคีย์ */
  /* วันที่ในบันทึกถูกเก็บเป็นรูปแบบมาตรฐาน 2026-09-03 เพื่อให้เทียบและแปลงได้
   * แต่คนอ่านต้องการ "3 ก.ย." จึงจัดรูปตอนแสดง ไม่ใช่ตอนเก็บ
   * ถ้าจัดรูปตอนเก็บ พอสลับภาษาแล้วบันทึกเก่าจะยังเป็นภาษาที่เขียนไว้ตอนนั้น */
  function storyText(s) {
    var p = s.params;
    if (p) {
      var out = {};
      Object.keys(p).forEach(function (k) {
        var v = p[k];
        out[k] = (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? fmtDate(v) : v;
      });
      p = out;
    }
    return L(s.text, p || undefined);
  }

  /** ขนาดไฟล์แบบอ่านง่าย */
  function fmtBytes(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  /** ป้ายเวลา ย่อไว้ให้อ่านเร็ว แต่ชี้ค้างแล้วเห็นวันเวลาเต็ม */
  function whenTag(isoTs, cls) {
    return '<span class="' + (cls || 'when') + '" title="' + esc(fmtExact(isoTs)) + '">' +
      esc(fmtWhen(isoTs)) + '</span>';
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
    var n = r.interval || 1;
    if (r.freq === 'after') return L('{n} วันหลังทำเสร็จ', { n: n });
    var out;
    if (n > 1) {
      var unit = { daily: 'วัน', weekly: 'สัปดาห์', monthly: 'เดือน', yearly: 'ปี' }[r.freq] || '';
      out = L('ทุก {n} ' + unit, { n: n });
    } else out = L(f.label);
    if (r.freq === 'weekly' && r.days && r.days.length) {
      var dn = DOW();
      out += ' (' + r.days.slice().sort().map(function (d) { return dn[d]; }).join(', ') + ')';
    }
    return out;
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
    /* ห้ามรบกวน — ไม่ขึ้นตัวเลขแดง แต่บอกด้วยไอคอนพระจันทร์ว่ากำลังพักอยู่ ไม่ใช่ว่าไม่มีอะไรเข้า */
    var dnd = S.isDnd();
    h += '<button class="sb-item' + (route.type === 'inbox' ? ' active' : '') +
         '" data-act="go" data-route="inbox">' + I('bell') + '' +
         '<span class="grow">' + L('กล่องข้อความ') + '</span>' +
         (dnd ? '<span class="sb-dnd" title="' + L('ห้ามรบกวนอยู่') + '">' + I('moon', 13) + '</span>'
              : (unread ? '<span class="count alert">' + unread + '</span>' : '')) + '</button>';
    h += '<button class="sb-item' + (route.type === 'calendar' ? ' active' : '') +
         '" data-act="go" data-route="calendar">' + I('calendar') + '' +
         '<span class="grow">' + L('ปฏิทินรวม') + '</span></button>';
    h += '</div>';

    function projectItem(p) {
      var n = S.tasksInProject(p.id).filter(function (x) { return !x.task.completed; }).length;
      return '<button class="sb-item' +
        (route.type === 'project' && route.id === p.id ? ' active' : '') +
        '" data-act="go" data-route="project" data-id="' + esc(p.id) + '">' +
        '<span class="emoji">' + esc(p.icon) + '</span>' +
        '<span class="swatch" style="background:' + esc(p.color) + '"></span>' +
        "<span class=\"grow\">" + esc(p.name) + "</span>" +
        (p.visibility === "private" ? "<span class=\"lockmark\" title=\"" + L("โปรเจกต์ปิด") + "\">" + I("shield", 12) + "</span>" : "") +
        (n ? '<span class="count">' + n + '</span>' : '') + '</button>';
    }

    /* โปรเจกต์ที่ปักหมุดขึ้นก่อน เพราะพอมีหลายสิบโปรเจกต์
     * ของที่เปิดจริงทุกวันจะจมอยู่กลางรายการยาว ๆ จนต้องเลื่อนหาทุกครั้ง
     * ซ่อนหัวข้อนี้ทั้งก้อนถ้ายังไม่มีใครปัก ไม่งั้นแถบซ้ายจะมีหัวข้อว่างเปล่า */
    var stars = S.starredProjects();
    if (stars.length) {
      h += '<div class="sb-section"><div class="sb-label">' + L('ปักหมุดไว้') + '</div>';
      stars.forEach(function (p) { h += projectItem(p); });
      h += '</div>';
    }

    /* 2c — การค้นหาที่บันทึกไว้ของแต่ละคน ไม่มีก็ไม่มีหัวข้อ (ทางเข้าค้นหาขั้นสูงอยู่ที่ช่องค้นหาด้านบน) */
    var saved = S.savedSearches();
    if (saved.length) {
      h += '<div class="sb-section"><div class="sb-label">' + L('การค้นหาที่บันทึก') + '</div>';
      saved.forEach(function (s) {
        h += '<button class="sb-item' + (route.type === 'search' && route.ss === s.id ? ' active' : '') +
          '" data-act="open-ss" data-id="' + esc(s.id) + '">' + I(s.mode === 'calendar' ? 'calendar' : 'search') +
          '<span class="grow">' + esc(s.name) + '</span></button>';
      });
      h += '</div>';
    }

    h += '<div class="sb-section">';
    h += '<div class="sb-label"><button class="sb-labelbtn" data-act="go" data-route="projects" title="' +
      L('ดูโปรเจกต์ทั้งหมด') + '">' + L('โปรเจกต์') + '</button>' +
      '<button data-act="new-project" title="' + L('สร้างโปรเจกต์ใหม่') + '">+</button></div>';
    S.visibleProjects().forEach(function (p) { h += projectItem(p); });
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
    /* ชื่อเดียวกันทุกบทบาท เพราะปุ่มนี้เปิดหน้าตั้งค่าเหมือนกันหมด
     * ต่างกันแค่ผู้ดูแลมีแท็บข้อมูลและสำรองเพิ่มมาข้างใน
     * เดิมตั้งชื่อตามแท็บที่เปิด ผู้ดูแลจึงเห็นคำว่า "ข้อมูลและสำรอง"
     * ซึ่งอ่านแล้วนึกว่าเป็นคนละที่กับตั้งค่า ทั้งที่เป็นหน้าต่างเดียวกัน */
    h += '<button class="sb-item' + (route.type === 'trash' ? ' active' : '') +
         '" data-act="go" data-route="trash">' + I('trash') +
         '<span class="grow">' + L('ถังขยะ') + '</span></button>';
    h += '<button class="sb-item" data-act="open-settings" data-tab="general">' +
         I('settings') + '' +
         '<span class="grow">' + L('ตั้งค่า') + '</span></button>';
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
      var starOn = S.isStarred(p.id);
      h += '<div style="min-width:0"><div class="tb-title"><span class="emoji">' + esc(p.icon) +
           '</span><span class="nm">' + esc(p.name) + '</span>' +
           '<button class="tb-star' + (starOn ? ' on' : '') + '" data-act="toggle-star" data-id="' +
           esc(p.id) + '" title="' + (starOn ? L('เอาหมุดออก') : L('ปักหมุดไว้บนสุด')) + '">' +
           (starOn ? global.Icons.iconFilled('star', 16) : I('star', 16)) + '</button>';
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

      /* รูปสมาชิกซ้อนกันไว้ข้างชื่อ ตอบคำถาม "ใครอยู่ในโปรเจกต์นี้" โดยไม่ต้องเปิดเมนู
       * โปรเจกต์ที่เปิดให้ทั้งองค์กรไม่มีรายชื่อระบุตัว จึงไม่โชว์อะไรเลย
       * ดีกว่าโชว์พนักงานทั้งบริษัทซึ่งไม่ได้บอกอะไร */
      var ppl = projectPeople(p.id);
      if (ppl.length) {
        h += '<button class="tb-people" data-act="manage-members" title="' +
          esc(ppl.map(function (m) { return m.user.name; }).join(', ')) + '">';
        ppl.slice(0, 4).forEach(function (m) { h += avatar(m.user, 'sm'); });
        if (ppl.length > 4) h += '<span class="tb-more">+' + (ppl.length - 4) + '</span>';
        h += '</button>';
      }

      /* คำอธิบายโปรเจกต์ไม่อยู่บนแถบบนแล้ว
       * มันยาวกว่าที่แถบบนรับไหว จึงถูกตัดกลางประโยคจนอ่านไม่ได้ความอยู่ดี
       * และกินความสูงของทุกหน้าตลอดเวลา ทั้งที่อ่านครั้งเดียวก็พอ
       * ตอนนี้อ่านเต็ม ๆ ได้ที่แท็บภาพรวม ซึ่งเป็นที่ของมันจริง ๆ */
      h += '</div></div>';
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
    } else if (route.type === 'projects') {
      h += '<div class="tb-title">' + I('grid', 20) + ' ' + L('โปรเจกต์ทั้งหมด') + '</div>';
    } else if (route.type === 'profile') {
      var pu = S.user(route.id);
      h += '<div class="tb-title">' + I('users', 20) + ' ' +
        (pu && S.me() && pu.id === S.me().id ? L('โปรไฟล์ของฉัน')
                                             : esc(pu ? pu.name : L('โปรไฟล์'))) + '</div>';
    } else if (route.type === 'admin') {
      h += '<div class="tb-title">' + I('shield', 20) + ' ' + L('ผู้ดูแลระบบ') + '</div>';
    } else if (route.type === 'trash') {
      h += '<div class="tb-title">' + I('trash', 20) + ' ' + L('ถังขยะ') + '</div>';
    } else if (route.type === 'search') {
      var ssT = route.ss ? S.savedSearch(route.ss) : null;
      h += '<div class="tb-title">' + I('search', 18) + ' ' + (ssT ? esc(ssT.name)
        : route.q ? L('ผลการค้นหา “') + esc(route.q) + '”' : L('ค้นหาขั้นสูง')) + '</div>';
    } else if (route.type === 'tag') {
      h += '<div class="tb-title"><span class="chip tag tb-tagchip">#' + esc(route.name) + '</span></div>';
    } else if (route.type === 'noaccess') {
      h += '<div class="tb-title">' + I('lock', 18) + ' ' + L('โปรเจกต์ปิด') + '</div>';
    } else if (route.type === 'form') {
      var tfx = S.formById(route.id);
      h += '<div class="tb-title">' + I('note', 18) + ' ' + (tfx ? esc(tfx.f.name) : L('ฟอร์ม')) + '</div>';
    }

    h += '<div class="tb-spacer"></div>';
    h += saveChip();
    h += syncChip();
    h += '<div class="search">' + ICON.search +
         '<input id="searchInput" type="search" placeholder="' + L('ค้นหางาน…  (/)') + '" value="' +
         esc(route.type === 'search' ? route.q : '') + '">' +
         '<button class="search-adv" data-act="adv-open" title="' + L('ค้นหาขั้นสูง') + '">' + I('filter', 13) + '</button></div>';

    if (route.type === 'project') {
      /* มุมมองที่มีแถบเครื่องมือ มีปุ่มเพิ่มงานอยู่ที่นั่นแล้ว
       * ปุ่มเดียวกันสองที่ทำให้คนลังเลว่าสองอันนี้ต่างกันไหม เหลือไว้ที่เดียว */
      if (VIEWS_WITH_TOOLBAR.indexOf(route.view) < 0) {
        h += '<button class="btn btn-primary" data-act="quick-add">' + L('+ เพิ่มงาน') + '</button>';
      }
      h += '<button class="btn btn-ghost" data-act="project-menu" data-id="' +
           esc(route.id) + '" title="' + L('เมนูโปรเจกต์') + '">' + I('more') + '</button>';
    } else if (route.type === 'mytasks') {
      h += '<button class="btn btn-ghost" data-act="mt-ics" title="' + L('ดาวน์โหลดปฏิทิน .ics ของงานที่มีวัน') + '">' +
        I('calendar', 14) + '<span class="hide-sm">.ics</span></button>';
    } else if (route.type === 'inbox') {
      var dndOn = S.isDnd();
      h += '<button class="btn' + (dndOn ? ' btn-dnd-on' : '') + '" data-act="dnd-menu" title="' +
        L('ห้ามรบกวน') + '">' + I('moon', 14) + '<span class="hide-sm">' +
        (dndOn ? L('ห้ามรบกวนอยู่') : L('ห้ามรบกวน')) + '</span></button>';
      h += '<button class="btn" data-act="inbox-read-all" title="' + L('อ่านทั้งหมด') + '">' +
        I('check', 14) + '<span class="hide-sm">' + L('อ่านทั้งหมด') + '</span></button>';
      h += '<button class="btn" data-act="inbox-archive-all" title="' + L('เก็บทั้งหมด') + '">' +
        I('archive', 14) + '<span class="hide-sm">' + L('เก็บทั้งหมด') + '</span></button>';
    } else if (route.type === 'portfolio') {
      h += '<button class="btn btn-primary" data-act="pf-add" data-pf="' + esc(route.id) + '">' +
           L('+ เพิ่มโปรเจกต์เข้าพอร์ต') + '</button>';
      h += '<button class="btn btn-ghost" data-act="pf-menu" data-id="' + esc(route.id) +
           '" title="' + L('เมนูพอร์ตโฟลิโอ') + '">' + I('more') + '</button>';
    }
    h += '</div>';

    if (route.type === 'project') {
      h += '<div class="tb-tabs">';
      var onViews = S.projectViews(route.id);
      var tp = S.project(route.id);
      var canStruct = S.can('structure') && S.canInProject(route.id, 'edit');
      var defTab = tp && tp.defaultTab && S.savedView(route.id, tp.defaultTab) ? tp.defaultTab
        : ((tp && tp.defaultView) || onViews[0]);
      var tabCaret = function (attrs) {
        return '<span class="tb-tab-caret" data-act="tab-menu"' + attrs + ' title="' +
          L('ตัวเลือกแท็บ') + '">' + I('chevronDown', 12) + '</span>';
      };
      S.PROJECT_VIEWS.forEach(function (v) {
        if (onViews.indexOf(v.id) < 0) return;
        var on = route.view === v.id && !route.sv;
        h += '<button class="tb-tab' + (on ? ' active' : '') +
             '" data-act="set-view" data-view="' + v.id + '">' + esc(L(v.label)) +
             (defTab === v.id ? '<span class="tb-def" title="' + L('มุมมองเริ่มต้น') + '"></span>' : '') +
             (on && canStruct ? tabCaret(' data-view="' + v.id + '"') : '') + '</button>';
      });
      /* แท็บที่บันทึกไว้ต่อท้ายแท็บในตัว — เป็นของทั้งโปรเจกต์ ทุกคนเห็นเหมือนกัน
       * แต่ตัวกรอง "ฉัน" ตีความตามคนที่เปิดดู แท็บเดียวกันจึงเป็นงานของใครของมัน */
      ((tp && tp.savedViews) || []).forEach(function (sv) {
        var on2 = route.sv === sv.id;
        h += '<button class="tb-tab tb-sv' + (on2 ? ' active' : '') + '" data-act="open-sv" data-id="' +
          esc(sv.id) + '" title="' + esc(sv.name) + '"><span class="tb-sv-ic">' + esc(sv.icon || '📊') + '</span>' +
          '<span class="tb-sv-nm">' + esc(sv.name) + '</span>' +
          (defTab === sv.id ? '<span class="tb-def" title="' + L('มุมมองเริ่มต้น') + '"></span>' : '') +
          (on2 ? tabCaret(' data-id="' + esc(sv.id) + '"') : '') + '</button>';
      });
      /* ปุ่มเพิ่มหรือลดมุมมอง เห็นเฉพาะคนที่แก้โครงสร้างโปรเจกต์ได้
       * คนอื่นเห็นแท็บที่ทีมเลือกไว้เฉย ๆ ไม่ต้องมีปุ่มที่กดแล้วโดนปฏิเสธ */
      if (S.can('structure') && S.canInProject(route.id, 'edit')) {
        h += '<button class="tb-addview" data-act="view-menu" data-id="' + esc(route.id) +
             '" title="' + L('เพิ่มหรือลดมุมมอง') + '">' + I('plus', 15) + '</button>';
      }
      h += '</div>';
    }
    if (route.type === 'mytasks') {
      var mode = S.personalOf().mt.view.mode;
      h += '<div class="tb-tabs">';
      MT_TABS.forEach(function (v) {
        h += '<button class="tb-tab' + (mode === v[0] ? ' active' : '') +
             '" data-act="mt-mode" data-v="' + v[0] + '">' + L(v[1]) + '</button>';
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

  /* มุมมองที่มีแถบเครื่องมือของตัวเอง ต้องตรงกับที่ renderTopbar ตัดสินใจ */
  var VIEWS_WITH_TOOLBAR = ['list', 'board', 'timeline', 'gantt', 'calendar'];

  /** จำนวนตัวกรองที่เปิดอยู่ ใช้ติดตัวเลขบนปุ่มให้รู้ว่ากำลังกรองอยู่กี่ชั้น */
  function filterCount(v) { return S.filterCount(v); }

  /* ---------- แถบเครื่องมือของมุมมอง ----------
   *
   * เดิมกางตัวเลือกทั้งหมดเป็นแถวยาว ผู้รับผิดชอบ ความสำคัญ แท็ก กำหนดส่ง เรียง จัดกลุ่ม
   * เจ็ดกล่องเรียงกันตลอดเวลา ทั้งที่วันปกติแทบไม่ได้แตะเลยสักอัน
   * กินพื้นที่แนวตั้งสองแถวและดึงสายตาไปจากตัวงานซึ่งเป็นของจริงที่มาดู
   *
   * ยุบเป็นปุ่มสี่ปุ่มแบบ Asana เปิดเป็นแผงเมื่อจะใช้จริง
   * ปุ่มไหนมีค่าเปิดอยู่จะเน้นสีและติดจำนวนไว้ จึงยังรู้สถานะได้โดยไม่ต้องกางทุกอย่าง
   * ช่องค้นหาเป็นไอคอนก่อน กดแล้วค่อยกางออก เพราะไม่ได้ใช้ทุกครั้งที่เปิดหน้า
   */
  function viewToolbar(projectId, view, opts) {
    var p = S.project(projectId);
    if (!p) return '';
    opts = opts || {};
    var nf = filterCount(view);
    var h = '<div class="vtb">';

    /* --- ซ้าย: เพิ่มงาน --- */
    if (S.can('write')) {
      h += '<div class="vtb-add">' +
        '<button class="btn btn-sm btn-primary" data-act="quick-add">' +
        I('plus', 13) + ' ' + L('เพิ่มงาน') + '</button>' +
        '<button class="btn btn-sm btn-primary vtb-caret" data-act="add-menu" data-id="' +
        esc(projectId) + '" title="' + L('วิธีเพิ่มงานแบบอื่น') + '">' +
        I('chevronDown', 13) + '</button></div>';
    }

    h += (opts.left || '') + '<div class="vtb-spacer"></div>' + (opts.right || '');

    /* --- ขวา: ตัวกรอง เรียง จัดกลุ่ม ตัวเลือก --- */
    h += '<button class="vtb-btn' + (nf ? ' on' : '') + '" data-act="g-filter" title="' +
      L('ตัวกรอง') + '">' + I('filter', 14) + '<span>' + L('ตัวกรอง') + '</span>' +
      (nf ? '<span class="vtb-n">' + nf + '</span>' +
        '<span class="vtb-x" data-act="flt-clear" title="' + L('ล้างตัวกรอง') + '">' +
        I('close', 11) + '</span>' : '') + '</button>';
    /* ปุ่มที่กำลังทำงานอยู่มีกากบาทล้างค่าในตัว
     * เดิมต้องเปิดแผงเข้าไปตั้งกลับเป็นค่าเริ่มต้นเอง ทั้งที่สิ่งที่คนอยากทำคือเลิกเรียง */
    var sortOn = view.sort !== 'manual';
    var nSort = (view.sorts || []).length;
    h += '<button class="vtb-btn' + (sortOn ? ' on' : '') +
      '" data-act="g-sort" title="' + L('เรียง') + '">' +
      I(view.sortDir === 'desc' ? 'arrowDown' : 'arrowUp', 14) +
      '<span>' + L('เรียง') + '</span>' + (nSort > 1 ? '<span class="vtb-n">' + nSort + '</span>' : '') +
      (sortOn ? '<span class="vtb-x" data-act="clear-sort" title="' + L('เลิกเรียง') + '">' +
        I('close', 11) + '</span>' : '') + '</button>';
    /* บอร์ดจัดคอลัมน์ด้วย bGroup ส่วนมุมมองอื่นใช้ group — ปุ่มเดียวกันเปิดหน้าที่ตรงกับมุมมอง */
    var kind = opts.kind || 'list';
    var grpOn = kind === 'board' ? (view.bGroup !== 'section' || view.bSwim !== 'none')
      : kind === 'calendar' ? false : view.group !== 'section';
    if (kind !== 'calendar') {
      h += '<button class="vtb-btn' + (grpOn ? ' on' : '') +
        '" data-act="g-group" title="' + L('จัดกลุ่ม') + '">' +
        I('grid', 13) + '<span>' + L('จัดกลุ่ม') + '</span></button>';
    }
    h += '<button class="vtb-btn" data-act="g-options" title="' + L('ตัวเลือก') + '">' +
      I('settings', 14) + '<span>' + L('ตัวเลือก') + '</span></button>';

    /* --- ค้นหา --- */
    if (view.q) {
      h += '<div class="vtb-search open">' + I('search', 13) +
        '<input id="vQ" type="search" data-act="f-q" placeholder="' +
        L('ค้นหาในโปรเจกต์นี้') + '" value="' + esc(view.q) + '">' +
        '<button data-act="f-q-clear" title="' + L('ล้างคำค้น') + '">' +
        I('close', 12) + '</button></div>';
    } else {
      h += '<button class="vtb-btn icon" data-act="f-q-open" title="' +
        L('ค้นหาในโปรเจกต์นี้') + '">' + I('search', 14) + '</button>';
    }

    /* แท็บที่บันทึกไว้แต่มีการแก้ค้าง — บันทึกทับหรือทิ้ง */
    if (opts.dirty) {
      h += '<span class="vtb-dirty">' +
        (opts.canSave ? '<button class="btn btn-sm btn-primary" data-act="sv-update" data-id="' + esc(opts.dirty) +
          '">' + L('บันทึกมุมมอง') + '</button>' : '') +
        '<button class="btn btn-sm btn-ghost" data-act="sv-discard" data-id="' + esc(opts.dirty) + '">' +
        L('ทิ้งการเปลี่ยนแปลง') + '</button></span>';
    }
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

  /** ไอคอนสถานะอนุมัติ — วงกลมเล็กสีตามสถานะ ใช้ในตารางและการ์ดบอร์ดที่ไม่มีที่ให้ป้ายยาว */
  function approvalIcon(t) {
    if (t.type !== 'approval') return '';
    var a = approvalState(t.approval);
    var ic = { pending: 'checkCircle', approved: 'check', changes: 'pencil', rejected: 'close' }[a.id] || 'checkCircle';
    return '<span class="appr-ic" style="color:' + a.color + ';background:' + a.color + '22" title="' +
      esc(L('การอนุมัติ') + ': ' + L(a.label)) + '">' + I(ic, 11) + '</span>';
  }

  /** 3b — ป้ายสถานะของชนิดงานกำหนดเอง (ไม่มีชนิดกำหนดเอง = ว่าง) */
  function statusPill(t) {
    var sd = t && t.ctype ? S.statusDef(t.cstatus) : null;
    if (!sd) return '';
    var c = esc(sd.st.color || '#9ca0a8');
    return '<span class="cst-pill' + (sd.st.done ? ' done' : '') + '" style="background:' + c + '22;color:' + c +
      '" title="' + esc(sd.ty.name + ' · ' + sd.st.name) + '"><i style="background:' + c + '"></i>' + esc(sd.st.name) + '</span>';
  }

  /** ป้ายสถานะย่อย ๆ ที่ใช้ทั้งในแถวและการ์ด */
  function badges(t, opts) {
    var h = statusPill(t);
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
    /* แท็กกดแล้วไปหน้าแท็ก (#/tag/<ชื่อ>) */
    t.tags.forEach(function (tg) {
      h += '<button class="chip tag" data-act="go-tag" data-tag="' + esc(tg) + '">' + esc(tg) + '</button>';
    });

    if (opts && opts.showProject) {
      S.taskCodes(t).forEach(function (c) { h += '<span class="chip chip-code">' + esc(c) + '</span>'; });
      S.projectsOfTask(t.id).forEach(function (x) {
        h += '<span class="chip"><span class="swatch" style="background:' +
          esc(x.project.color) + '"></span>' + esc(x.project.name) + '</span>';
      });
      if (!t.parentId && S.isPrivate(t.id)) h += privateChip();
    }
    if (t.dueOn) {
      h += '<span class="chip' + dueClass(t.dueOn, t.completed) + '">' + fmtDate(t.dueOn) +
        (t.dueTime ? ' ' + esc(t.dueTime) : '') + '</span>';
    }
    return h;
  }

  /** ป้าย "ส่วนตัว" — งานที่ไม่อยู่โปรเจกต์ไหน เห็นเฉพาะคู่กรณี */
  function privateChip() {
    return '<span class="chip chip-private" title="' +
      L('งานส่วนตัว — เห็นเฉพาะคนสร้าง ผู้รับผิดชอบ และผู้ติดตาม') + '">' +
      I('lock', 11) + ' ' + L('ส่วนตัว') + '</span>';
  }

  /** จุดสีฟ้า — งานที่คนอื่นเพิ่งมอบให้และยังไม่ได้เปิดดู */
  function newDot(t) {
    return S.mtIsNew(t.id) ? '<span class="new-dot" title="' + L('เพิ่งได้รับมอบหมาย ยังไม่ได้เปิดดู') + '"></span>' : '';
  }

  function taskRow(t, opts) {
    opts = opts || {};
    var u = S.user(t.assigneeId);
    var pr = prio(t.priority);

    var h = '<div class="row' + (t.completed ? ' done' : '') + (opts.selected ? ' sel' : '') +
      '" draggable="true" data-act="open-task" data-id="' + esc(t.id) + '"' +
      (opts.sectionId ? ' data-section="' + esc(opts.sectionId) + '"' : '') + '>';
    if (opts.selectable) h += selbox(t, opts.selected);
    if (opts.dots) h += '<span class="dot-slot">' + newDot(t) + '</span>';
    h += checkbox(t);
    if (t.priority !== 'none') {
      h += '<span class="prio-bar" style="background:' + pr.color + '" title="' + L(pr.label) + '"></span>';
    }
    h += '<span class="nm">' + esc(t.name) + '</span>';
    h += '<span class="meta">' + badges(t, opts) + avatar(u, 'sm') + '</span>';
    h += '</div>';
    return h;
  }

  /** การ์ดบอร์ดของโปรเจกต์ — ส่วนที่แสดงเลือกได้ต่อมุมมอง (view.bCard) ขนาด S/M/L และรูปปก
   *  ชิปกำหนดส่งกับรูปผู้รับผิดชอบแก้ได้บนการ์ดเลย ดับเบิลคลิกชื่อเพื่อเปลี่ยนชื่อ */
  function projectCard(t, sectionId, opts) {
    var v = opts.cfg;
    var size = v.bSize || 'm';
    var show = function (k) { return S.cardShows(v, k); };
    var u = S.user(t.assigneeId);
    var pr = prio(t.priority);
    var blocked = !t.completed && S.isBlocked(t.id);
    var id = esc(t.id);
    var h = '<div class="card' + (t.completed ? ' done' : '') + (opts.selected ? ' sel' : '') +
      (blocked ? ' blocked' : '') + '" draggable="true" data-act="open-task" data-id="' + id +
      '" data-section="' + esc(sectionId) + '"' +
      (blocked ? ' title="' + L('รองานอื่นให้เสร็จก่อน') + '"' : '') + '>';
    var cov = size !== 's' && show('cover') ? S.coverOf(t) : null;
    if (cov) h += '<div class="card-cover"><img src="' + esc(cov.url) + '" alt="" loading="lazy" draggable="false"></div>';
    h += '<div class="top">';
    if (opts.selectable) h += selbox(t, opts.selected);
    h += checkbox(t) + '<span class="nm" data-dbl="rename" data-id="' + id + '" title="' +
      L('ดับเบิลคลิกเพื่อเปลี่ยนชื่อ') + '">' + esc(t.name) + '</span>' + approvalIcon(t) + '</div>';

    var foot = statusPill(t);
    if (show('priority') && t.priority !== 'none' && size !== 's') {
      foot += '<span class="chip" style="background:' + pr.color + '22;color:' + pr.color +
        '"><span class="swatch" style="background:' + pr.color + '"></span>' + L(pr.label) + '</span>';
    }
    if (show('due') && t.dueOn) {
      foot += '<span class="chip card-edit' + dueClass(t.dueOn, t.completed) + '" data-act="edit-cell" data-cell="due" data-id="' +
        id + '" title="' + L('เปลี่ยนกำหนดส่ง') + '">' + I('calendar', 11) + ' ' + fmtDate(t.dueOn) + '</span>';
    }
    if (show('subtasks') && size !== 's') {
      var subs = S.subtasks(t.id);
      if (subs.length) {
        foot += '<span class="chip">' + I('subtask', 11) + ' ' +
          subs.filter(function (s) { return s.completed; }).length + '/' + subs.length + '</span>';
      }
    }
    if (show('tags') && size !== 's') {
      (t.tags || []).forEach(function (tg) { foot += '<span class="chip tag">' + esc(tg) + '</span>'; });
    }
    if (size !== 's') {
      var proj = S.project(opts.pid || '') || (S.projectsOfTask(t.id)[0] || {}).project;
      ((proj && proj.fields) || []).forEach(function (f) {
        if (!show('field:' + f.id)) return;
        var fv = S.fieldValue(t.id, f.id);
        if (fv === null || fv === undefined || fv === '' || (Array.isArray(fv) && !fv.length)) return;
        foot += '<span class="card-fv" title="' + esc(f.name) + '">' + fieldCell(t, f) + '</span>';
      });
    }
    if (show('assignee')) {
      foot += '<span class="card-av card-edit" data-act="edit-cell" data-cell="assignee" data-id="' + id + '" title="' +
        esc(u ? u.name : L('ยังไม่มอบหมาย')) + '">' + avatar(u, 'sm') + '</span>';
    }
    if (foot) h += '<div class="foot">' + foot + '</div>';
    return h + '</div>';
  }

  function taskCard(t, sectionId, opts) {
    opts = opts || {};
    if (opts.cfg) return projectCard(t, sectionId, opts);
    var u = S.user(t.assigneeId);
    var pr = prio(t.priority);

    var blocked = !t.completed && S.isBlocked(t.id);
    var h = '<div class="card' + (t.completed ? ' done' : '') + (opts.selected ? ' sel' : '') +
      (blocked ? ' blocked' : '') + '" draggable="true" data-act="open-task" data-id="' + esc(t.id) +
      '" data-section="' + esc(sectionId) + '"' +
      (blocked ? ' title="' + L('รองานอื่นให้เสร็จก่อน') + '"' : '') + '>';
    h += '<div class="top">';
    if (opts.selectable) h += selbox(t, opts.selected);
    h += (opts.dots ? newDot(t) : '') + checkbox(t) + '<span class="nm">' + esc(t.name) + '</span>' +
      approvalIcon(t) + '</div>';

    var foot = '';
    if (t.priority !== 'none') {
      foot += '<span class="chip" style="background:' + pr.color + '22;color:' + pr.color +
        '"><span class="swatch" style="background:' + pr.color + '"></span>' + L(pr.label) + '</span>';
    }
    /* การ์ดบอร์ดเหลือความสำคัญเป็นป้ายเดียว ไม่มีแท็ก ตัวนับ หรือสถานะอื่นเลย
     *
     * บอร์ดมีไว้กวาดตาดูว่างานไหนอยู่ขั้นไหน ชื่องานคือสิ่งที่ต้องอ่าน
     * ป้ายห้าหกใบใต้ชื่อทำให้การ์ดสูงขึ้นเท่าตัวและแย่งสายตาไปจากชื่อ
     * ของที่ตัดออกไปอ่านได้ครบในแผงรายละเอียด ซึ่งห่างไปแค่คลิกเดียว
     *
     * ที่ยังเหลือไว้เพราะไม่ได้กินพื้นที่เพิ่ม
     *   ช่องติ๊กของหมุดหมายเป็นสี่เหลี่ยมข้าวหลามตัดอยู่แล้ว
     *   งานที่ถูกบล็อกมีแถบแดงที่ขอบซ้ายการ์ด
     *   รูปผู้รับผิดชอบอยู่ท้ายแถวเดียวกับความสำคัญ */
    /* งานของฉันไม่มีคอลัมน์ให้บอกว่าครบเมื่อไรหรืออยู่โปรเจกต์ไหน จึงเติมสองอย่างนี้บนการ์ด */
    if (opts.mine) {
      if (t.dueOn) {
        foot += '<span class="chip' + dueClass(t.dueOn, t.completed) + '">' + fmtDate(t.dueOn) + '</span>';
      }
      var hp = S.projectsOfTask(t.id)[0];
      if (hp) {
        foot += '<span class="chip"><span class="swatch" style="background:' + esc(hp.project.color) +
          '"></span>' + esc(hp.project.name) + '</span>';
      } else if (!t.parentId && S.isPrivate(t.id)) foot += privateChip();
    }
    foot += opts.mine ? '' : avatar(u, 'sm');
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
    if (f.type === 'id') return '<span class="cell-txt code">' + esc(S.fieldText(f, v)) + '</span>';
    if (f.type === 'number') {
      return '<span class="cell-txt num">' + esc(S.formatNumber(f, v)) + '</span>';
    }
    return '<span class="cell-txt">' + esc(v) + '</span>';
  }

  /** ชื่อกลุ่ม — กลุ่มรายเดือนของฟิลด์วันที่แปลงเป็นชื่อเดือน ที่เหลือแปลตามคีย์ (ชื่อที่ผู้ใช้ตั้งผ่านไปตามเดิม) */
  function groupLabel(g) {
    if (g.month) {
      var mm = +g.month.slice(5, 7) - 1, yy = +g.month.slice(0, 4);
      return MONF()[mm] + ' ' + YR(yy);
    }
    return L(g.label);
  }

  /** หัวกลุ่มแบบมีสี/รูปคน ใช้ทั้งรายการและบอร์ด */
  function groupMark(g) {
    if (g.user) return avatar(g.user, 'sm');
    if (g.color) return '<span class="grp-dot" style="background:' + esc(g.color) + '"></span>';
    return '';
  }

  /** ค่าในเซลล์ของคอลัมน์ในตัวที่เพิ่มมาในชิ้นงาน 2b */
  function builtinCell(t, c) {
    var id = esc(t.id);
    if (c.id === 'assignee') {
      var u = S.user(t.assigneeId);
      return '<div class="td td-edit" data-act="edit-cell" data-cell="assignee" data-id="' + id + '">' +
        (u ? avatar(u, 'sm') + '<span class="cell-txt">' + esc(u.name) + '</span>'
           : '<span class="cell-empty">' + L('ยังไม่มอบหมาย') + '</span>') + '</div>';
    }
    if (c.id === 'due') {
      return '<div class="td td-edit' + dueClass(t.dueOn, t.completed) +
        '" data-act="edit-cell" data-cell="due" data-id="' + id + '">' +
        (t.dueOn ? '<span class="cell-txt">' + fmtDate(t.dueOn) + '</span>' : '<span class="cell-empty">—</span>') + '</div>';
    }
    if (c.id === 'start') {
      return '<div class="td td-edit" data-act="edit-cell" data-cell="start" data-id="' + id + '">' +
        (t.startOn ? '<span class="cell-txt">' + fmtDate(t.startOn) + '</span>' : '<span class="cell-empty">—</span>') + '</div>';
    }
    if (c.id === 'priority') {
      var pr = prio(t.priority);
      return '<div class="td td-edit" data-act="edit-cell" data-cell="priority" data-id="' + id + '">' +
        (t.priority && t.priority !== 'none'
          ? '<span class="opt-pill" style="background:' + pr.color + '22;color:' + pr.color + '">' + L(pr.label) + '</span>'
          : '<span class="cell-empty">—</span>') + '</div>';
    }
    if (c.id === 'cstatus') {       // 3b — สถานะของชนิดงานกำหนดเอง กดเพื่อเปลี่ยน
      return '<div class="td td-edit" data-act="cell-status" data-id="' + id + '">' +
        (S.statusDef(t.cstatus) ? statusPill(t) : '<span class="cell-empty">—</span>') + '</div>';
    }
    var inner = '';
    if (c.id === 'tags') {
      inner = (t.tags || []).map(function (x) { return '<span class="chip tag">' + esc(x) + '</span>'; }).join('');
    } else if (c.id === 'created' || c.id === 'completedOn' || c.id === 'modified') {
      var d = S.taskValue(t, c.id);
      inner = d ? '<span class="cell-txt">' + fmtDate(d) + '</span>' : '';
    } else if (c.id === 'createdBy') {
      var cu = S.user(t.createdBy);
      inner = cu ? avatar(cu, 'sm') + '<span class="cell-txt">' + esc(cu.name) + '</span>' : '';
    } else if (c.id === 'blockedBy' || c.id === 'blocking') {
      var list = c.id === 'blocking' ? S.blocking(t.id)
        : (t.dependsOn || []).map(function (x) { return S.task(x.id); }).filter(Boolean);
      inner = list.map(function (x) {
        return '<button class="cell-link' + (x.completed ? ' done' : '') + '" data-act="open-task" data-id="' +
          esc(x.id) + '">' + esc(x.name) + '</button>';
      }).join('');
    }
    return '<div class="td td-ro">' + (inner || '<span class="cell-empty">—</span>') + '</div>';
  }

  /** หนึ่งแถวในตาราง (งานหลักหรืองานย่อยที่กางออก) */
  function listRow(t, cols, g, sel, ui, depth) {
    var pr = prio(t.priority);
    var subs = S.subtasks(t.id);
    var open = !!(ui.subOpen && ui.subOpen[t.id]);
    var blocked = !t.completed && S.isBlocked(t.id);
    var h = '<div class="tr' + (t.completed ? ' done' : '') + (sel[t.id] ? ' sel' : '') +
      (depth ? ' sub' : '') + (ui.cursor === t.id ? ' cursor' : '') +
      '" draggable="' + (depth ? 'false' : 'true') + '" data-act="open-task" data-id="' + esc(t.id) + '"' +
      (depth ? ' style="--depth:' + depth + '"' : '') +
      (!depth && g && g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + '>';

    h += '<div class="td td-name">' + selbox(t, !!sel[t.id]);
    h += subs.length
      ? '<button class="sub-caret' + (open ? ' open' : '') + '" data-act="sub-toggle" data-id="' + esc(t.id) +
        '" title="' + (open ? L('ซ่อนงานย่อย') : L('แสดงงานย่อย')) + '">' + I('chevronRight', 12) + '</button>'
      : '<span class="sub-caret-sp"></span>';
    h += checkbox(t);
    if (t.priority !== 'none') {
      h += '<span class="prio-bar" style="background:' + pr.color + '" title="' + L(pr.label) + '"></span>';
    }
    var lty = S.typeOf(t);
    h += '<span class="nm">' + (lty ? '<span class="ty-ic" title="' + esc(lty.name) + '">' + esc(lty.icon) + '</span> ' : '') +
      (t.type === 'milestone' ? I('diamond', 11) + ' ' : '') +
      esc(t.name) + '</span>' + approvalIcon(t);
    if (subs.length) {
      h += '<span class="cell-mini">' + I('subtask', 11) + ' ' +
        subs.filter(function (s) { return s.completed; }).length + '/' + subs.length + '</span>';
    }
    if (blocked) {
      h += '<span class="cell-mini danger" title="' + L('รองานอื่นให้เสร็จก่อน') + '">' + I('blocked', 11) + '</span>';
    }
    if (t.recur) h += '<span class="cell-mini">' + I('repeat', 11) + '</span>';
    if (t.attachments.length) h += '<span class="cell-mini">' + I('paperclip', 11) + '</span>';
    h += '</div>';

    cols.forEach(function (c) {
      if (c.field && c.field.type === 'id') {
        h += '<div class="td td-ro">' + fieldCell(t, c.field) + '</div>';   // รหัสงานออกเลขเอง แก้ไม่ได้
      } else if (c.field) {
        h += '<div class="td td-edit" data-act="edit-cell" data-cell="field" data-id="' + esc(t.id) +
          '" data-field="' + esc(c.field.id) + '">' + fieldCell(t, c.field) + '</div>';
      } else h += builtinCell(t, c);
    });
    h += '<div class="td td-add"></div></div>';

    if (open && depth < 4) {
      subs.forEach(function (s) { h += listRow(s, cols, null, sel, ui, depth + 1); });
    }
    return h;
  }

  /** หัวคอลัมน์หนึ่งช่อง */
  function listHead(c, view) {
    if (c.field) {
      var f = c.field;
      var ft = S.FIELD_TYPES.filter(function (x) { return x.id === f.type; })[0];
      return '<div class="th th-field th-sortable" data-act="sort-col" data-key="field:' +
        esc(f.id) + '" data-field="' + esc(f.id) + '"' + (f.desc ? ' title="' + esc(f.desc) + '"' : '') + '>' +
        (f.lib ? '<span class="th-lib" title="' + L('ฟิลด์จากคลังขององค์กร') + '">' + I('building', 11) + '</span>' : '') +
        (ft ? I(ft.icon, 13) : '') +
        '<span class="th-nm">' + esc(f.name) + '</span>' + sortMark(view, 'field:' + f.id) +
        '<button class="th-menu" data-act="field-menu" data-field="' + esc(f.id) +
        '" title="' + L('เมนู') + '">' + I('chevronDown', 12) + '</button>' + resizer(f.id) + '</div>';
    }
    return '<div class="th' + (c.sort ? ' th-sortable" data-act="sort-col" data-key="' + esc(c.sort) + '"' : '"') + '>' +
      '<span class="th-nm">' + esc(L(c.label)) + '</span>' + (c.sort ? sortMark(view, c.sort) : '') +
      resizer(c.wkey) + '</div>';
  }

  /** ป้ายสั้นของฟังก์ชันสรุปท้ายคอลัมน์ */
  function footLabel(fn) {
    var x = S.FOOT_FNS.filter(function (y) { return y[0] === fn; })[0];
    return x ? L(x[1]) : '';
  }

  /**
   * มุมมองรายการ
   * ui = { subOpen: {taskId: true}, cursor: taskId }  (สถานะบนหน้าจอ ไม่บันทึก)
   */
  function listView(projectId, view, sel, ui) {
    ui = ui || {};
    var p = S.project(projectId);
    var groups = S.viewGroups(projectId, view);
    var cols = S.listColumns(projectId, view).filter(function (c) { return c.on; });
    var canStruct = S.can('structure') && S.canInProject(projectId, 'edit');
    var bySection = view.group === 'section';

    // ความกว้างมาจากที่ผู้ใช้ลากไว้ ถ้ายังไม่เคยลากใช้ค่าตั้งต้น
    // ไม่ใช้หน่วย fr เพราะ fr จะยืดจนดันคอลัมน์อื่นไปชิดขวา
    var narrow = global.innerWidth < 860;
    var tpl = [S.colWidth(projectId, 'name', narrow ? 230 : 400)].concat(cols.map(function (c) {
      return S.colWidth(projectId, c.wkey, c.w || COL_W);
    })).map(function (w) { return w + 'px'; }).join(' ') + ' 46px';

    var h = '<div class="tbl-wrap"><div class="tbl" style="--tpl:' + tpl + '">';

    /* ---- หัวตาราง ---- */
    h += '<div class="tbl-head">';
    h += '<div class="th th-name th-sortable" data-act="sort-col" data-key="name">' +
      L('ชื่องาน') + sortMark(view, 'name') + resizer('name') + '</div>';
    cols.forEach(function (c) { h += listHead(c, view); });
    h += '<div class="th th-add"><button class="addcol" data-act="col-menu" title="' +
      L('เพิ่มหรือซ่อนคอลัมน์') + '">' + I('plus', 15) + '</button></div>';
    h += '</div>';

    /* ---- แถวข้อมูล ---- */
    var total = 0, allTasks = [];
    groups.forEach(function (g) {
      total += g.items.length;
      g.items.forEach(function (x) { allTasks.push(x.task); });
      var collapsed = !!view.collapsed[g.key || '_'];
      var dropAttrs = g.set ? ' data-gby="' + esc(g.set.by) + '" data-gkey="' + esc(g.set.key) + '"' : '';

      h += '<div class="tbl-sec' + (collapsed ? ' collapsed' : '') + '"' +
        (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + dropAttrs + '>' +
        '<button class="sec-caret" data-act="sec-collapse" data-key="' + esc(g.key || '_') + '" title="' +
        (collapsed ? L('ขยาย') : L('ย่อ')) + '">' + I('chevronDown', 14) + '</button>' +
        groupMark(g) + '<span class="sec-nm">' + esc(groupLabel(g)) + '</span>' +
        '<span class="sec-n">' + g.items.length + '</span>' +
        (g.isSection ? secBolt(projectId, g.key, canStruct) : '');
      h += '<span class="sec-acts">';
      if (g.isSection && canStruct) {
        h += '<button class="btn btn-sm btn-ghost" data-act="move-section" data-section="' +
          esc(g.key) + '" data-delta="-1" title="' + L('ย้ายขึ้น') + '">' + I('arrowUp', 14) + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="move-section" data-section="' +
          esc(g.key) + '" data-delta="1" title="' + L('ย้ายลง') + '">' + I('arrowDown', 14) + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="rename-section" data-section="' +
          esc(g.key) + '" title="' + L('เปลี่ยนชื่อ') + '">' + I('pencil', 14) + '</button>';
      }
      h += '<button class="btn btn-sm btn-ghost" data-act="sec-menu" data-key="' + esc(g.key || '_') + '"' +
        (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + ' title="' + L('ตัวเลือกเพิ่มเติม') + '">' +
        I('more', 14) + '</button></span>';
      h += '</div>';

      if (collapsed) return;
      h += '<div class="sec-body"' + (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + dropAttrs + '>';
      g.items.forEach(function (x) { h += listRow(x.task, cols, g, sel, ui, 0); });
      h += '</div>';

      if (g.isSection) {
        h += '<div class="tbl-add"><button class="add-row" data-act="inline-add" data-section="' +
          esc(g.key) + '">' + I('plus', 14) + ' ' + L('เพิ่มงาน') + '</button></div>';
      }
    });

    /* ---- สรุปท้ายคอลัมน์ ---- ตัวเลขรวมของงานที่เห็นอยู่ทั้งหมด (หลังกรองแล้ว) */
    var hasNum = cols.some(function (c) { return c.field && c.field.type === 'number'; });
    if (total && hasNum) {
      h += '<div class="tr tbl-foot"><div class="td td-name"><span class="foot-n">' +
        L('{n} งาน', { n: total }) + '</span></div>';
      cols.forEach(function (c) {
        if (!(c.field && c.field.type === 'number')) { h += '<div class="td td-ro"></div>'; return; }
        var fn = view.foot[c.id] || 'sum';
        var val = fn === 'none' ? null : S.footValue(allTasks, c.field.id, fn);
        h += '<div class="td td-foot" data-act="foot-menu" data-col="' + esc(c.id) + '" title="' +
          L('เลือกการสรุป') + '">' + (fn === 'none' ? '<span class="cell-empty">∑</span>'
            : '<em>' + esc(footLabel(fn)) + '</em><b>' +
              (val === null ? '—' : esc(fn === 'count' ? String(val) : S.formatNumber(c.field, Math.round(val * 100) / 100))) +
              '</b>') + '</div>';
      });
      h += '<div class="td td-add"></div></div>';
    }

    h += '</div>';

    if (!total) {
      h += '<div class="empty"><div class="big">' + I('search', 32) + '</div>' +
        L('ไม่มีงานที่ตรงกับตัวกรอง') +
        (S.filterCount(view) ? '<div style="margin-top:12px"><button class="btn" data-act="flt-clear">' +
        L('ล้างตัวกรอง') + '</button></div>' : '') + '</div>';
    }
    if (bySection && canStruct) {
      h += '<div style="padding:10px 24px 60px"><button class="add-row" data-act="add-section">' +
        I('plus', 14) + ' ' + L('เพิ่มคอลัมน์') + '</button></div>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- board view ----------
   * คอลัมน์ตามคอลัมน์ของโปรเจกต์ หรือตามฟิลด์ตัวเลือก/คน (bGroup)
   * แถว (swimlane) ตามผู้รับผิดชอบ ความสำคัญ หรือฟิลด์ (bSwim)
   * ลากการ์ดข้ามคอลัมน์/แถว = ตั้งค่าของกลุ่มนั้นให้งาน (ดู S.dropToGroups) ลากหลายใบพร้อมกันได้ถ้าเลือกไว้
   */
  function boardHead(g, view, canStruct, collapsed, pid) {
    var cc = g.color ? ' has-cc" style="--cc:' + esc(g.color) : '';
    if (collapsed) {
      return '<button class="col-fold' + cc + '" data-act="bcol-toggle" data-key="' + esc(g.key || '_') +
        '" title="' + L('ขยายคอลัมน์') + '"><span class="n">' + g.items.length + '</span>' +
        '<span class="col-fold-nm">' + esc(groupLabel(g)) + '</span></button>';
    }
    var h = '<div class="col-head' + cc + '">' + groupMark(g) + '<h3>' + esc(groupLabel(g)) + '</h3>' +
      '<span class="n">' + g.items.length + '</span>' +
      (g.isSection && pid ? secBolt(pid, g.key, canStruct) : '') + '<span class="acts">';
    if (g.isSection && canStruct) {
      h += '<button class="btn btn-sm btn-ghost" data-act="move-section" data-section="' +
        esc(g.key) + '" data-delta="-1" title="' + L('ย้ายซ้าย') + '">‹</button>' +
        '<button class="btn btn-sm btn-ghost" data-act="move-section" data-section="' +
        esc(g.key) + '" data-delta="1" title="' + L('ย้ายขวา') + '">›</button>' +
        '<button class="btn btn-sm btn-ghost" data-act="rename-section" data-section="' +
        esc(g.key) + '" title="' + L('เปลี่ยนชื่อ') + '">' + I('pencil', 14) + '</button>';
    }
    h += '<button class="btn btn-sm btn-ghost" data-act="sec-menu" data-key="' + esc(g.key || '_') + '"' +
      (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + ' data-board="1" title="' +
      L('ตัวเลือกเพิ่มเติม') + '">' + I('more', 14) + '</button></span></div>';
    return h;
  }

  function boardCards(list, g, lane, view, sel) {
    var attrs = (g.set ? ' data-gby="' + esc(g.set.by) + '" data-gkey="' + esc(g.set.key) + '"' : '') +
      (lane && lane.set ? ' data-lby="' + esc(lane.set.by) + '" data-lkey="' + esc(lane.set.key) + '"' : '') +
      (g.isSection ? ' data-section="' + esc(g.key) + '"' : '');
    var h = '<div class="col-body"' + attrs + '>';
    list.forEach(function (x) {
      h += taskCard(x.task, g.isSection ? g.key : '', { selectable: true, selected: !!sel[x.task.id], cfg: view });
    });
    return h + '</div>';
  }

  function boardView(projectId, view, sel) {
    var by = view.bGroup || 'section';
    var cols = S.viewGroups(projectId, view, { group: by });
    var swim = view.bSwim && view.bSwim !== 'none' ? view.bSwim : null;
    var canStruct = S.can('structure') && S.canInProject(projectId, 'edit');
    var canAdd = S.can('write') && S.canInProject(projectId, 'edit');
    var fold = view.bCollapsed || {};
    var h = '<div class="board sz-' + esc(view.bSize || 'm') + (swim ? ' swim' : '') + '">';

    if (!swim) {
      cols.forEach(function (g) {
        var collapsed = !!fold[g.key || '_'];
        h += '<div class="col' + (collapsed ? ' folded' : '') + '"' +
          (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + '>';
        h += boardHead(g, view, canStruct, collapsed, projectId);
        if (!collapsed) {
          h += boardCards(g.items, g, null, view, sel);
          if (g.isSection && canAdd) {
            h += '<button class="col-add" data-act="inline-add" data-section="' + esc(g.key) +
              '">+ ' + L('เพิ่มงาน') + '</button>';
          }
        }
        h += '</div>';
      });
      if (by === 'section' && canStruct) {
        h += '<button class="col-new" data-act="add-section">' + L('+ เพิ่มคอลัมน์') + '</button>';
      }
      return h + '</div>';
    }

    /* --- แถว (swimlane) — หัวคอลัมน์แถวเดียวด้านบน แต่ละแถวมีช่องของทุกคอลัมน์ --- */
    var flat = [];
    cols.forEach(function (g) { g.items.forEach(function (x) { flat.push(x); }); });
    var lanes = S.groupItems(projectId, flat, swim, { showEmpty: false });
    h += '<div class="bs-head">';
    cols.forEach(function (g) {
      var collapsed = !!fold[g.key || '_'];
      h += '<div class="col bs-col' + (collapsed ? ' folded' : '') + '">' + boardHead(g, view, canStruct, collapsed, projectId) + '</div>';
    });
    h += '</div>';
    lanes.forEach(function (lane) {
      var ids = {};
      lane.items.forEach(function (x) { ids[x.task.id] = true; });
      h += '<div class="bs-lane"><div class="bs-lane-head">' + groupMark(lane) +
        '<b>' + esc(groupLabel(lane)) + '</b><span class="n">' + lane.items.length + '</span></div>' +
        '<div class="bs-row">';
      cols.forEach(function (g) {
        var collapsed = !!fold[g.key || '_'];
        h += '<div class="col bs-col' + (collapsed ? ' folded' : '') + '">';
        if (!collapsed) {
          h += boardCards(g.items.filter(function (x) { return ids[x.task.id]; }), g, lane, view, sel);
        }
        h += '</div>';
      });
      h += '</div></div>';
    });
    if (!lanes.length) {
      h += '<div class="empty">' + L('ไม่มีงานที่ตรงกับตัวกรอง') + '</div>';
    }
    return h + '</div>';
  }

  /* ---------- สีตามเกณฑ์ (ปฏิทินและไทม์ไลน์) ---------- */

  function colorFor(t, by, p) {
    var proj = p || (S.projectsOfTask(S.rootOf(t).id)[0] || {}).project;
    var base = proj ? proj.color : 'var(--accent)';
    if (!by || by === 'project') return base;
    if (by === 'priority') return t.priority && t.priority !== 'none' ? prio(t.priority).color : base;
    if (by === 'assignee') {
      var u = S.user(t.assigneeId);
      return u ? (u.color || base) : 'var(--fg-faint)';
    }
    if (by === 'progress') {
      if (t.completed) return 'var(--ok)';
      if (t.dueOn && t.dueOn < S.today()) return 'var(--danger)';
      if (S.isBlocked(t.id)) return 'var(--warn)';
      return base;
    }
    if (by.indexOf('field:') === 0) {
      var fid = by.slice(6);
      var f = proj ? (proj.fields || []).filter(function (x) { return x.id === fid; })[0] : null;
      var v = S.fieldValue(t.id, fid);
      if (!f || v === null || v === undefined || v === '') return 'var(--fg-faint)';
      if (f.type === 'person') { var pu = S.user(v); return pu ? pu.color : 'var(--fg-faint)'; }
      var o = (f.options || []).filter(function (x) { return x.name === v; })[0];
      return o ? o.color : 'var(--fg-faint)';
    }
    return base;
  }

  /** คำอธิบายสีสั้น ๆ ใต้หัวปฏิทิน/ไทม์ไลน์ เฉพาะเกณฑ์ที่สีมีความหมายตายตัว */
  function colorLegendOf(by, p) {
    var items = [];
    if (by === 'priority') {
      S.PRIORITIES.forEach(function (x) { if (x.id !== 'none') items.push([x.color, L(x.label)]); });
    } else if (by === 'progress') {
      items = [['var(--ok)', L('ทำเสร็จแล้ว')], ['var(--danger)', L('เลยกำหนด')], ['var(--warn)', L('ถูกบล็อก')]];
    } else if (by && by.indexOf('field:') === 0 && p) {
      var f = (p.fields || []).filter(function (x) { return 'field:' + x.id === by; })[0];
      if (f && f.options) f.options.forEach(function (o) { items.push([o.color, o.name]); });
    }
    if (!items.length) return '';
    return '<div class="clr-legend">' + items.map(function (x) {
      return '<span><i style="background:' + esc(x[0]) + '"></i>' + esc(x[1]) + '</span>';
    }).join('') + '</div>';
  }

  function colorSelect(act, choices, cur) {
    return '<label class="clr-pick" title="' + L('ระบายสีตาม') + '">' + I('palette', 13) +
      '<select data-act="' + act + '">' + choices.map(function (c) {
        return '<option value="' + esc(c[0]) + '"' + (c[0] === cur ? ' selected' : '') + '>' + esc(L(c[1])) + '</option>';
      }).join('') + '</select></label>';
  }

  /* ---------- timeline ----------
   * แถบข้าง "ยังไม่มีวัน" ลากลงผังเพื่อใส่วัน  แถวว่างท้ายผัง คลิกวันที่เพื่อสร้างงาน
   * เส้นลำดับก่อนหลังเป็นสีแดงทึบเมื่อวันชนกัน (งานถัดไปเริ่มก่อนงานก่อนหน้าเสร็จ) */

  var ZOOMS = { day: 28, week: 12, month: 4 };
  var ROW_H = 34;

  /** วันชนกันไหม ตามชนิดความสัมพันธ์ (FS SS FF SF) */
  function depConflict(pred, succ, type) {
    var ps = pred.startOn || pred.dueOn, pe = pred.dueOn || pred.startOn;
    var ss = succ.startOn || succ.dueOn, se = succ.dueOn || succ.startOn;
    if (!ps || !ss) return false;
    if (type === 'SS') return ss < ps;
    if (type === 'FF') return se < pe;
    if (type === 'SF') return se < ps;
    return ss < pe;
  }

  function timelineView(projectId, view, zoom) {
    var p = S.project(projectId);
    var DAY_W = ZOOMS[zoom] || ZOOMS.day;
    var groups = S.viewGroups(projectId, view);
    var items = [];
    groups.forEach(function (g) {
      g.items.forEach(function (x) { items.push(x); });
    });
    var dated = items.filter(function (x) { return x.task.dueOn || x.task.startOn; });
    var undated = items.filter(function (x) { return !x.task.dueOn && !x.task.startOn; });
    var canAdd = S.can('write') && S.canInProject(projectId, 'edit');

    var td = S.today();
    var min = td, max = S.addDays(td, 14);
    dated.forEach(function (x) {
      var a = x.task.startOn || x.task.dueOn;
      var b = x.task.dueOn || x.task.startOn;
      if (a < min) min = a;
      if (b > max) max = b;
    });
    var from = S.addDays(min, -7);
    var to = S.addDays(max, 7);
    var days = S.daysBetween(from, to) + 1;
    var width = days * DAY_W;
    var by = view.tColorBy || 'priority';

    var h = '<div class="tl">';
    h += '<div class="tl-head"><strong style="font-size:14px">' + L('ไทม์ไลน์') + '</strong>' +
      '<div class="segmented">' +
      ['day', 'week', 'month'].map(function (z, i) {
        return '<button data-act="tl-zoom" data-v="' + z + '" class="' +
          ((zoom || 'day') === z ? 'on' : '') + '">' +
          [L('วัน'), L('สัปดาห์'), L('เดือน')][i] + '</button>';
      }).join('') + '</div>' +
      '<button class="btn btn-sm btn-ghost" data-act="tl-today">' + L('ไปวันนี้') + '</button>' +
      colorSelect('tl-colorby', S.colorChoices(projectId), by) +
      '<span class="tl-hint">' +
      L('ลากแท่งเพื่อเลื่อนวัน · ลากขอบเพื่อยืด/หด · ◆ = หมุดหมาย · เส้นประ = ลำดับก่อนหลัง · เส้นแดง = วันชนกัน') +
      '</span></div>';
    h += colorLegendOf(by, p);
    h += '<div class="tl-body"><div class="tl-scroll"><div class="tl-grid" style="width:' + width +
      'px" data-from="' + from + '" data-w="' + DAY_W + '">';

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

    // แถวงาน + แถวว่างท้ายผังสำหรับคลิกสร้างงาน
    var rowOf = {};
    var nRows = dated.length + (canAdd ? 1 : 0);
    h += '<div class="tl-rows" style="height:' + (Math.max(nRows, 1) * ROW_H) + 'px">';
    dated.forEach(function (x, idx) {
      var t = x.task;
      rowOf[t.id] = idx;
      var start = t.startOn || t.dueOn;
      var end = t.dueOn || t.startOn;
      if (end < start) { var tmp = start; start = end; end = tmp; }
      var x0 = S.daysBetween(from, start) * DAY_W;
      var w = (S.daysBetween(start, end) + 1) * DAY_W;
      var color = colorFor(t, by, p);

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
    if (canAdd) {
      h += '<div class="tl-row tl-new" data-act="tl-new" title="' + L('คลิกวันที่เพื่อสร้างงานใหม่') + '">' +
        '<span class="tl-new-hint" style="left:' + (S.daysBetween(from, td) * DAY_W + 6) + 'px">' +
        I('plus', 12) + ' ' + L('คลิกวันที่เพื่อสร้างงาน') + '</span></div>';
    }

    // เส้นเชื่อมลำดับก่อนหลัง — แดงทึบเมื่อวันชนกัน
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
        var bad = depConflict(b, t, dep.type || 'FS');
        lines += '<path class="' + (bad ? 'conflict' : '') + '" d="M' + xb + ' ' + yb + ' H' + midX + ' V' + ya + ' H' + xa +
          '" fill="none" stroke="' + (bad ? 'var(--danger)' : 'var(--fg-faint)') + '" stroke-width="' +
          (bad ? '2' : '1.4') + '"' + (bad ? '' : ' stroke-dasharray="4 3"') +
          ' marker-end="url(#' + (bad ? 'orbArrowBad' : 'orbArrow') + ')">' +
          (bad ? '<title>' + esc(L('วันชนกัน: “{a}” ต้องเสร็จก่อน “{b}” เริ่ม', { a: b.name, b: t.name })) + '</title>' : '') +
          '</path>';
      });
    });
    if (lines) {
      h += '<svg class="tl-dep" width="' + width + '" height="' + (nRows * ROW_H) + '">' +
        '<defs><marker id="orbArrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" ' +
        'orient="auto"><path d="M0 0 L7 3.5 L0 7 z" fill="var(--fg-faint)"/></marker>' +
        '<marker id="orbArrowBad" markerWidth="7" markerHeight="7" refX="6" refY="3.5" ' +
        'orient="auto"><path d="M0 0 L7 3.5 L0 7 z" fill="var(--danger)"/></marker></defs>' +
        lines + '</svg>';
    }

    var todayX = S.daysBetween(from, td) * DAY_W + DAY_W / 2;
    h += '<div class="tl-today-line" style="left:' + todayX + 'px"></div>';
    h += '<div class="tl-drop-line" hidden></div>';
    h += '</div></div></div></div>';

    /* แถบข้าง — งานที่ยังไม่มีวัน ลากลงผังเพื่อใส่กำหนดส่ง */
    h += '<aside class="tl-side"><div class="calx-side-head">' + I('calendar', 14) + '<b>' + L('ยังไม่มีวัน') + '</b>' +
      '<span class="n">' + undated.length + '</span></div>' +
      '<div class="calx-side-hint">' + L('ลากงานไปวางบนวันที่ในผังเพื่อใส่กำหนดส่ง') + '</div>';
    if (!undated.length) h += '<div class="calx-side-empty">' + L('ทุกงานมีวันแล้ว') + '</div>';
    undated.forEach(function (x) {
      var t = x.task;
      h += '<div class="calx-un tl-un' + (t.completed ? ' done' : '') + '" draggable="true" data-act="open-task" data-id="' +
        esc(t.id) + '">' + checkbox(t) + '<span class="nm">' + esc(t.name) + '</span></div>';
    });
    h += '</aside>';

    h += '</div></div>';
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

  /* ---------- ภาพรวมโปรเจกต์ ----------
   *
   * ตอบคำถามของคนที่เพิ่งถูกดึงเข้าโปรเจกต์ — นี่คือโปรเจกต์อะไร ใครอยู่บ้าง
   * ตอนนี้เป็นยังไง และที่ผ่านมารายงานสถานะว่าอะไรไปแล้วบ้าง
   * ข้อมูลทุกอย่างมีอยู่ในระบบแล้ว แค่ไม่เคยมีหน้าที่รวมให้อ่านรวดเดียว
   * ต่างจากหน้าสรุปผลตรงที่อันนั้นตอบว่า "ตัวเลขเป็นยังไง" ไม่ใช่ "โปรเจกต์นี้คืออะไร"
   */
  function overviewView(projectId) {
    var p = S.project(projectId);
    if (!p) return '';
    var s = S.projectStats(projectId);
    var owner = S.user(p.owner);
    var h = '<div class="ovw">';

    h += '<div class="ovw-main">';

    h += '<section class="ovw-card"><h3>' + L('โปรเจกต์นี้คืออะไร') + '</h3>';
    h += p.description
      ? '<div class="ovw-desc">' + richText(p.description) + '</div>'
      : '<div class="ovw-empty">' + L('ยังไม่มีคำอธิบาย') +
        (S.can('structure') ? ' <button class="as-link" data-act="edit-project" data-id="' +
          esc(p.id) + '">' + L('เพิ่มคำอธิบาย') + '</button>' : '') + '</div>';
    h += '</section>';

    /* ประวัติการรายงานสถานะ คือสิ่งที่ตอบว่าโปรเจกต์นี้เดินมายังไง
     * มีเก็บไว้อยู่แล้วแต่เดิมอ่านได้แค่อันล่าสุดจากป้ายบนหัว */
    h += '<section class="ovw-card"><h3>' + L('ประวัติการรายงานสถานะ') + '</h3>';
    var logs = (p.statusLog || []).slice().reverse();
    if (!logs.length) {
      h += '<div class="ovw-empty">' + L('ยังไม่เคยรายงานสถานะ') + '</div>';
    } else {
      /* 3b — รายงานล่าสุดแสดงเต็ม (บล็อก + ไฮไลต์) ที่เหลือย่อเป็นบรรทัดเดียว */
      h += statusEntryHtml(p, logs[0], true);
      logs = logs.slice(1);
      h += '<div class="ovw-log">';
      logs.slice(0, 10).forEach(function (sl) {
        var st = projectState(sl.state);
        var by = S.user(sl.by);
        h += '<div class="ovw-logrow">' +
          '<span class="status-pill" style="background:' + st.color + '22;color:' + st.color +
          '"><i style="background:' + st.color + '"></i>' + esc(L(st.label)) + '</span>' +
          '<div class="grow">' + (sl.title ? '<div class="t"><b>' + esc(sl.title) + '</b></div>' : '') +
          (sl.text ? '<div class="t">' + esc(S.plainText(sl.text).slice(0, 300)) + '</div>' : '') +
          '<em>' + esc(by ? by.name : '—') + ' · ' + esc(fmtWhen(sl.at)) + '</em></div></div>';
      });
      h += '</div>';
    }
    h += '</section>';
    h += '</div>';

    /* --- คอลัมน์ขวา --- */
    h += '<div class="ovw-side">';

    h += '<section class="ovw-card"><h3>' + L('ตอนนี้ถึงไหนแล้ว') + '</h3>';
    h += '<div class="ovw-stats">' +
      '<div><b>' + s.total + '</b><em>' + L('งานทั้งหมด') + '</em></div>' +
      '<div><b>' + s.done + '</b><em>' + L('เสร็จแล้ว') + '</em></div>' +
      '<div class="' + (s.overdue ? 'bad' : '') + '"><b>' + s.overdue + '</b><em>' +
      L('เลยกำหนด') + '</em></div>' +
      '</div>';
    h += bar(L('ความคืบหน้า'), s.done, s.total || 1, p.color);
    if (p.dueOn) {
      h += '<div class="ovw-kv"><span>' + L('กำหนดส่งของโปรเจกต์') + '</span><b>' +
        esc(fmtDate(p.dueOn)) + '</b></div>';
    }
    h += '</section>';

    h += '<section class="ovw-card"><h3>' + L('ใครอยู่ในโปรเจกต์นี้') +
      (S.can('manage') ? '<button class="as-link" data-act="manage-members">' +
        L('จัดการ') + '</button>' : '') + '</h3>';
    var mem = projectPeople(p.id);
    if (!mem.length) {
      h += '<div class="ovw-empty">' + L('ทุกคนในองค์กรเห็นโปรเจกต์นี้') + '</div>';
    } else {
      h += '<div class="ovw-people">';
      mem.forEach(function (m) {
        var rl = (p.roles || {})[m.user.id];
        h += '<button class="prof-col" data-act="go-profile" data-id="' + esc(m.user.id) + '">' +
          avatar(m.user, 'md') + '<span class="grow"><b>' + esc(m.user.name) + '</b>' +
          '<em>' + esc(m.user.id === p.owner ? L('เจ้าของโปรเจกต์')
                                             : accessLabel(m.access)) + (rl ? ' · ' + esc(rl) : '') + '</em>' +
          '</span></button>';
      });
      h += '</div>';
    }
    if (owner && !mem.some(function (m) { return m.user.id === owner.id; })) {
      h += '<div class="ovw-kv"><span>' + L('เจ้าของโปรเจกต์') + '</span><b>' +
        esc(owner.name) + '</b></div>';
    }
    h += '</section>';

    /* 2c — บทบาทในโปรเจกต์ ข้อความที่ทีมตั้งเอง (เช่น "ผู้อนุมัติงานออกแบบ") ไม่เกี่ยวกับสิทธิ์ */
    var roles = S.projectRoles(p.id);
    var canRole = S.can('structure') && S.canInProject(p.id, 'edit');
    h += '<section class="ovw-card"><h3>' + L('บทบาทในโปรเจกต์') +
      (canRole ? '<button class="as-link" data-act="project-roles" data-id="' + esc(p.id) + '">' +
        L('แก้ไข') + '</button>' : '') + '</h3>';
    if (!roles.length) {
      h += '<div class="ovw-empty">' + L('ยังไม่ได้ตั้งบทบาท บอกทีมว่าใครดูแลเรื่องไหน เช่น ผู้อนุมัติ หรือผู้ประสานงาน') + '</div>';
    } else {
      h += '<div class="ovw-roles">';
      roles.forEach(function (x) {
        h += '<div class="ovw-role">' + avatar(x.user, 'sm') + '<b>' + esc(x.user.name) + '</b><em>' + esc(x.role) + '</em></div>';
      });
      h += '</div>';
    }
    h += '</section>';
    h += '</div></div>';
    return h;
  }

  /** ชื่อระดับสิทธิ์ในโปรเจกต์ */
  function accessLabel(id) {
    var a = S.PROJECT_ACCESS.filter(function (x) { return x.id === id; })[0];
    return a ? L(a.label) : id;
  }

  /** คนที่มีสิทธิ์ในโปรเจกต์นี้แบบระบุตัว เรียงเจ้าของขึ้นก่อน */
  function projectPeople(projectId) {
    var p = S.project(projectId);
    return S.projectMembers(projectId).map(function (m) {
      return { user: S.user(m.userId), access: m.access };
    }).filter(function (x) { return x.user && x.user.active !== false; })
      .sort(function (a, b) {
        if (a.user.id === p.owner) return -1;
        if (b.user.id === p.owner) return 1;
        return a.user.name.localeCompare(b.user.name);
      });
  }

  /* ---------- ไฟล์ทั้งหมดในโปรเจกต์ ----------
   *
   * เดิมไฟล์แนบกระจายอยู่ในงานแต่ละชิ้น ถ้าจำไม่ได้ว่าแนบไว้ที่งานไหนก็หาไม่เจอ
   * ที่นี่รวมทุกไฟล์ไว้ พร้อมบอกว่ามาจากงานไหนและกดกลับไปที่งานนั้นได้
   */
  function filesView(projectId) {
    return filesList(S.filesOfProject(projectId), L('ไฟล์ในโปรเจกต์นี้'),
      L('ยังไม่มีไฟล์แนบ ไฟล์ที่แนบไว้ในงานจะมารวมที่นี่เอง'));
  }

  /* ---------- ประกาศของโปรเจกต์ ----------
   *
   * ความเห็นต้องเกาะอยู่กับงานเสมอ แต่บางเรื่องไม่ได้เป็นของงานชิ้นไหนเลย
   * เช่นสรุปประชุมประจำสัปดาห์ หรือประกาศเลื่อนกำหนดทั้งโปรเจกต์
   * เดิมต้องไปแปะไว้ในงานสักชิ้นแบบฝืน ๆ แล้วก็หาไม่เจอในภายหลัง
   */
  function messagesView(projectId) {
    var rows = S.projectMessages(projectId);
    var h = '<div class="msgv">';

    if (S.canInProject(projectId, 'comment')) {
      h += '<div class="msg-new">' +
        '<input id="msgTitle" class="inp" placeholder="' + L('หัวเรื่อง (ไม่ใส่ก็ได้)') + '">' +
        '<textarea id="msgBody" class="inp" rows="3" placeholder="' +
        L('เขียนประกาศถึงทุกคนในโปรเจกต์นี้…') + '"></textarea>' +
        '<div class="msg-actions">' +
        '<span class="rt-hint">' +
        L('ขึ้นต้นด้วย - เพื่อทำหัวข้อย่อย เว้นสองช่องเพื่อย่อยลงอีกชั้น · **ตัวหนา**') + '</span>' +
        '<button class="btn btn-primary btn-sm" data-act="post-message" data-id="' +
        esc(projectId) + '">' + L('ประกาศ') + '</button></div></div>';
    }

    /* 3b — รายงานสถานะขึ้นในฟีดเดียวกับประกาศ เรียงตามเวลา */
    var mp = S.project(projectId);
    var feed = rows.map(function (m) { return { at: m.at, m: m }; });
    ((mp && mp.statusLog) || []).forEach(function (e) { feed.push({ at: e.at, st: e }); });
    feed.sort(function (a, b) { return String(a.at) < String(b.at) ? 1 : -1; });

    if (!feed.length) {
      h += '<div class="ovw-empty" style="padding:24px 2px">' +
        L('ยังไม่มีประกาศ ใช้ที่นี่สำหรับเรื่องที่เป็นของทั้งโปรเจกต์ ไม่ใช่ของงานชิ้นใดชิ้นหนึ่ง') +
        '</div>';
      return h + '</div>';
    }

    feed.forEach(function (x) {
      if (x.st) { h += statusEntryHtml(mp, x.st, true); return; }
      var m = x.m;
      var by = S.user(m.by);
      var mine = S.me() && m.by === S.me().id;
      h += '<article class="msg-card">' +
        '<div class="msg-head">' + avatar(by, 'md') +
        '<div class="grow">' + (m.title ? '<b>' + esc(m.title) + '</b>' : '') +
        '<em>' + esc(by ? by.name : '—') + ' · ' + esc(fmtWhen(m.at)) + '</em></div>' +
        (mine || S.can('manage')
          ? '<button class="x" data-act="delete-message" data-id="' + esc(projectId) +
            '" data-msg="' + esc(m.id) + '" title="' + L('ลบประกาศนี้') + '">' +
            I('close', 13) + '</button>' : '') +
        '</div><div class="msg-body">' + richText(m.body) + '</div></article>';
    });
    return h + '</div>';
  }

  /* ---------- 3b — รายงานสถานะแบบบล็อก ---------- */

  function blockLabel(b) {
    if (b.k === 'custom') return b.title || L('หัวข้อกำหนดเอง');
    var d = S.STATUS_BLOCKS.filter(function (x) { return x.k === b.k; })[0];
    return d ? L(d.label) : b.k;
  }

  /** ไฮไลต์ (ภาพนิ่ง ณ ตอนรายงาน) — รายการงานกดเปิดได้ ภาพรวมเป็นแท่งต่อคอลัมน์ */
  function statusHlHtml(hl, period) {
    if (!hl || !hl.length) return '';
    var h = '<div class="sth-hls">';
    hl.forEach(function (x) {
      var def = S.STATUS_HL.filter(function (d) { return d.k === x.k; })[0];
      var title = def ? L(def.label) : x.k;
      if (x.k === 'chart') {
        h += '<div class="sth-hl"><h5>' + I('chart', 13) + ' ' + esc(title) + ' <span>' + x.pct + '%</span></h5>' +
          '<div class="sth-kpi"><span><b>' + x.total + '</b>' + L('งานทั้งหมด') + '</span><span><b>' + x.done + '</b>' +
          L('เสร็จแล้ว') + '</span><span class="' + (x.overdue ? 'bad' : '') + '"><b>' + x.overdue + '</b>' + L('เลยกำหนด') + '</span></div>';
        (x.secs || []).forEach(function (s) {
          var pc = s.total ? Math.round(s.done * 100 / s.total) : 0;
          h += '<div class="sth-bar"><span class="nm">' + esc(s.name) + '</span><span class="trk"><i style="width:' + pc +
            '%"></i></span><span class="n">' + s.done + '/' + s.total + '</span></div>';
        });
        h += '</div>';
        return;
      }
      h += '<div class="sth-hl"><h5>' + I(x.k === 'overdue' ? 'alert' : x.k === 'milestones' ? 'diamond' : 'checkCircle', 13) + ' ' +
        esc(title) + ' <span>' + x.n + '</span>' +
        (x.k !== 'overdue' && period ? '<em>' + esc(L('{n} วันที่ผ่านมา', { n: period })) + '</em>' : '') + '</h5>';
      if (!x.items.length) h += '<div class="sth-none">' + L('ไม่มี') + '</div>';
      x.items.forEach(function (it) {
        var u = S.user(it.a);
        h += '<button class="sth-task" data-act="open-task" data-id="' + esc(it.id) + '">' +
          '<span class="grow">' + esc(it.name) + '</span>' +
          (it.d ? '<span class="chip' + (x.k === 'overdue' ? ' overdue' : '') + '">' + fmtDate(it.d) + '</span>' : '') +
          (u ? avatar(u, 'sm') : '') + '</button>';
      });
      if (x.n > x.items.length) h += '<div class="sth-none">' + esc(L('และอีก {n} งาน', { n: x.n - x.items.length })) + '</div>';
      h += '</div>';
    });
    return h + '</div>';
  }

  /** รายงานสถานะหนึ่งครั้ง — full = บล็อกและไฮไลต์ครบ */
  function statusEntryHtml(p, e, full) {
    if (!e) return '';
    var st = projectState(e.state), by = S.user(e.by);
    var h = '<article class="sth"><div class="sth-head"><span class="status-pill" style="background:' + st.color +
      '22;color:' + st.color + '"><i style="background:' + st.color + '"></i>' + esc(L(st.label)) + '</span>' +
      '<div class="grow">' + (e.title ? '<b>' + esc(e.title) + '</b>' : '<b>' + L('รายงานสถานะ') + '</b>') +
      '<em title="' + esc(fmtExact(e.at)) + '">' + esc(by ? by.name : '—') + ' · ' + esc(fmtWhen(e.at)) + '</em></div></div>';
    if (full && e.blocks && e.blocks.length) {
      e.blocks.forEach(function (b) {
        h += '<div class="sth-blk"><h4>' + esc(blockLabel(b)) + '</h4><div class="sth-txt">' + richText(b.text) + '</div></div>';
      });
    } else if (e.text) {
      h += '<div class="sth-txt">' + richText(e.text) + '</div>';
    }
    if (full) h += statusHlHtml(e.hl, e.period);
    return h + '</article>';
  }

  /* ---------- 3b — หน้าส่งฟอร์ม #/form/<id> ----------
   * ff = { ans: { qid: คำตอบ }, done: taskId, err, params, errQ } อยู่แค่ในหน้าจอจนกว่าจะกดส่ง */
  function formQuestion(it, ff) {
    var a = ff.ans[it.id];
    var d = ' data-q="' + esc(it.id) + '"';
    if (it.kind === 'heading') {
      return '<div class="ffq-head"><b>' + esc(it.label) + '</b>' + (it.help ? '<div>' + esc(it.help) + '</div>' : '') + '</div>';
    }
    var h = '<div class="ffq' + (ff.errQ === it.id ? ' err' : '') + '"><label class="ffq-l">' + esc(it.label || L('(ไม่มีคำถาม)')) +
      (it.req ? ' <span class="req">*</span>' : '') + '</label>' + (it.help ? '<div class="ffq-help">' + esc(it.help) + '</div>' : '');
    switch (it.kind) {
      case 'text':
        h += '<input class="inp" data-act="ff-ans"' + d + ' maxlength="500" value="' + esc(a || '') + '">'; break;
      case 'long':
        h += '<textarea class="inp" rows="4" data-act="ff-ans"' + d + '>' + esc(a || '') + '</textarea>'; break;
      case 'number':
        h += '<input class="inp" type="number" step="any" data-act="ff-ans"' + d + ' value="' + esc(a == null ? '' : a) + '">'; break;
      case 'date':
        h += '<input class="inp" type="date" data-act="ff-ans"' + d + ' value="' + esc(a || '') + '">'; break;
      case 'range': {
        var r = a || ['', ''];
        h += '<div class="ffq-range"><input class="inp" type="date" data-act="ff-range" data-part="0"' + d + ' value="' + esc(r[0] || '') + '">' +
          '<span>–</span><input class="inp" type="date" data-act="ff-range" data-part="1"' + d + ' value="' + esc(r[1] || '') + '"></div>';
        break;
      }
      case 'select':
        it.opts.forEach(function (o) {
          h += '<label class="ffq-opt"><input type="radio" name="ffq_' + esc(it.id) + '" data-act="ff-ans"' + d +
            ' value="' + esc(o) + '"' + (a === o ? ' checked' : '') + '><span>' + esc(o) + '</span></label>';
        });
        break;
      case 'multi': {
        var cur = [].concat(a || []);
        it.opts.forEach(function (o) {
          h += '<label class="ffq-opt"><input type="checkbox" data-act="ff-multi"' + d + ' value="' + esc(o) + '"' +
            (cur.indexOf(o) >= 0 ? ' checked' : '') + '><span>' + esc(o) + '</span></label>';
        });
        break;
      }
      case 'person':
        h += '<select class="inp" data-act="ff-ans"' + d + '><option value="">' + L('เลือกคน') + '</option>' +
          S.db.users.filter(function (u) { return u.active !== false; }).map(function (u) {
            return '<option value="' + esc(u.id) + '"' + (a === u.id ? ' selected' : '') + '>' + esc(u.name) + '</option>';
          }).join('') + '</select>';
        break;
      case 'file': {
        var files = [].concat(a || []);
        files.forEach(function (x, i) {
          h += '<div class="ffq-file">' + I('paperclip', 13) + '<span class="grow">' + esc(x.name) + '</span><em>' +
            esc(x.size ? (x.size / 1024).toFixed(0) + ' KB' : '') + '</em><button class="flt-del" data-act="ff-file-del"' + d +
            ' data-i="' + i + '" title="' + L('เอาออก') + '">' + I('close', 12) + '</button></div>';
        });
        if (files.length < S.FORM_FILES_MAX) {
          h += '<label class="btn btn-sm ffq-pick">' + I('paperclip', 13) + ' ' + L('เลือกไฟล์') +
            '<input type="file" multiple hidden data-act="ff-file"' + d + '></label>' +
            '<div class="ffq-help">' + L('ไม่เกิน {n} ไฟล์ ไฟล์ละไม่เกิน 2 MB', { n: S.FORM_FILES_MAX }) + '</div>';
        }
        break;
      }
    }
    return h + '</div>';
  }

  function formPage(id, ff) {
    var x = S.formById(id);
    if (!x) {
      return '<div class="empty"><div class="big">' + I('note', 32) + '</div>' + L('ไม่พบฟอร์มนี้ อาจถูกลบไปแล้ว') + '</div>';
    }
    var f = x.f, p = x.p, me = S.me();
    ff = ff || { ans: {} };
    var h = '<div class="ffp"><div class="ffp-card">';
    h += '<div class="ffp-proj"><span class="hproj-ic" style="background:' + esc(p.color) + '22">' + esc(p.icon) + '</span>' +
      esc(p.name) + (S.canEditForms(p.id) ? '<button class="as-link" data-act="fm-edit" data-project="' + esc(p.id) +
        '" data-id="' + esc(f.id) + '">' + I('pencil', 12) + ' ' + L('แก้ฟอร์ม') + '</button>' : '') + '</div>';
    h += '<h1 class="ffp-title">' + esc(f.name) + '</h1>';
    if (f.desc) h += '<div class="ffp-desc">' + richText(f.desc) + '</div>';
    if (!f.on || p.archived) {
      h += '<div class="ffp-closed">' + I('lock', 14) + ' ' + L('ฟอร์มนี้ปิดรับคำตอบแล้ว') + '</div>';
    } else if (ff.done) {
      var dt = S.task(ff.done);
      h += '<div class="ffp-done">' + I('checkCircle', 28) + '<b>' + esc(f.confirm || L('ส่งเรียบร้อยแล้ว ขอบคุณ')) + '</b>' +
        '<div class="ffp-done-acts">' +
        (dt && S.canSeeTask(dt.id) ? '<button class="btn" data-act="open-task" data-id="' + esc(dt.id) + '">' + L('ดูงานที่สร้าง') + '</button>' : '') +
        (f.again ? '<button class="btn btn-primary" data-act="ff-again">' + L('ส่งอีกครั้ง') + '</button>' : '') + '</div></div>';
    } else {
      var vis = S.formVisible(f, ff.ans);
      if (!f.items.length) h += '<div class="ovw-empty">' + L('ฟอร์มนี้ยังไม่มีคำถาม') + '</div>';
      f.items.forEach(function (it) { if (vis[it.id]) h += formQuestion(it, ff); });
      if (ff.err) h += '<div class="ffp-err">' + I('alert', 13) + ' ' + esc(L(ff.err, ff.params || undefined)) + '</div>';
      h += '<div class="ffp-foot"><span>' + esc(L('ส่งในชื่อ {n}', { n: me ? me.name : '—' })) + '</span>' +
        '<button class="btn btn-primary" data-act="ff-submit" data-id="' + esc(f.id) + '">' + L('ส่งฟอร์ม') + '</button></div>';
    }
    h += '</div><p class="ffp-note">' + I('lock', 12) + ' ' +
      L('ส่งได้เฉพาะสมาชิกที่เข้าระบบ Orbit แล้ว ฟอร์มสาธารณะสำหรับคนนอกองค์กรต้องมีเซิร์ฟเวอร์ จะมาในเฟส 5') + '</p></div>';
    return h;
  }

  /* ---------- หน้ารวมโปรเจกต์ทั้งหมด ----------
   *
   * แถบซ้ายไล่ได้ทีละอันและยาวขึ้นเรื่อย ๆ ตามจำนวนโปรเจกต์
   * หน้านี้เอาไว้กวาดตาดูทั้งหมดพร้อมกัน ว่าอันไหนสถานะยังไงและคืบหน้าแค่ไหน
   */
  function projectsView() {
    var all = S.visibleProjects();
    var h = '<div class="pjx">';
    h += '<div class="pjx-head">' + I('grid', 17) + '<b>' + L('โปรเจกต์ทั้งหมด') + '</b>' +
      '<span class="n">' + L('{n} โปรเจกต์', { n: all.length }) + '</span>' +
      (S.can('structure') ? '<button class="btn btn-sm btn-primary" data-act="new-project">' +
        I('plus', 13) + ' ' + L('สร้างโปรเจกต์ใหม่') + '</button>' : '') + '</div>';

    if (!all.length) {
      h += '<div class="ovw-empty">' + L('ยังไม่มีโปรเจกต์ที่คุณเห็นได้') + '</div>';
      return h + '</div>';
    }

    h += '<div class="pjx-grid">';
    all.forEach(function (p) {
      var s = S.projectStats(p.id);
      var st = p.status ? projectState(p.status.state) : null;
      var ppl = projectPeople(p.id);
      h += '<button class="pjx-card" data-act="go" data-route="project" data-id="' + esc(p.id) + '">';
      h += '<div class="pjx-top"><span class="hproj-ic" style="background:' + esc(p.color) +
        '22">' + esc(p.icon) + '</span><span class="grow"><b>' + esc(p.name) + '</b>' +
        (p.description ? '<em>' + esc(p.description) + '</em>' : '') + '</span>' +
        (S.isStarred(p.id) ? '<span class="pjx-star">' +
          global.Icons.iconFilled('star', 14) + '</span>' : '') + '</div>';
      h += '<div class="pjx-meta">' +
        (st ? '<span class="status-pill" style="background:' + st.color + '22;color:' + st.color +
          '"><i style="background:' + st.color + '"></i>' + esc(L(st.label)) + '</span>'
            : '<span class="pf-none">' + L('ยังไม่รายงาน') + '</span>') +
        (s.overdue ? '<span class="chip due-over">' +
          esc(L('{n} งานเลยกำหนด', { n: s.overdue })) + '</span>' : '') + '</div>';
      h += '<div class="pjx-prog"><span class="track"><span class="fill" style="width:' +
        (s.total ? Math.round(s.done / s.total * 100) : 0) + '%;background:' + esc(p.color) +
        '"></span></span><span class="v">' + s.done + '/' + s.total + '</span></div>';
      if (ppl.length) {
        h += '<div class="pjx-ppl">';
        ppl.slice(0, 5).forEach(function (m) { h += avatar(m.user, 'sm'); });
        if (ppl.length > 5) h += '<span class="tb-more">+' + (ppl.length - 5) + '</span>';
        h += '</div>';
      }
      h += '</button>';
    });
    return h + '</div></div>';
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
            '<span title="' + esc(fmtExact(e.at)) + '">' + esc(fmtWhen(e.at)) + '</span></div>';
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
    var h = '<section class="hcard' + (o.cls ? ' ' + o.cls : '') + '"' + (o.attrs || '') + '>';
    if (o.tools) h += o.tools;
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

  /* ---------- หน้าแรกแบบจัดเองได้ ----------
   *
   * วิดเจ็ตเรียงตามที่แต่ละคนจัดไว้ (S.homeLayout — เก็บใน db.personal จึงตามไปทุกเครื่อง)
   * กว้างครึ่งหรือเต็มแถว โหมดปรับแต่งเพิ่ม ลบ ลากสลับ ย่อขยายได้
   * st = สถานะหน้าจอ (แท็บของแต่ละการ์ด, edit) · extra.drafts = ร่างความเห็นจาก localStorage
   */
  function homeView(st, extra) {
    st = st || {};
    extra = extra || {};
    var meUser = S.me();
    var stats = S.homeStats();
    var layout = S.homeLayout();
    var edit = !!st.edit;

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
    h += '<button class="hstat hstat-btn' + (edit ? ' on' : '') + '" data-act="home-edit">' +
      I(edit ? 'check' : 'settings', 14) + esc(edit ? L('เสร็จแล้ว') : L('ปรับแต่งหน้าแรก')) + '</button>';
    h += '</div></div>';

    if (edit) {
      h += '<div class="home-editbar">' + I('grip', 14) + '<span class="grow">' +
        L('ลากการ์ดเพื่อสลับที่ กดปุ่มบนการ์ดเพื่อย่อขยายหรือเอาออก') + '</span>' +
        '<button class="btn btn-sm btn-ghost" data-act="home-w-reset">' + L('คืนค่าเริ่มต้น') + '</button></div>';
    }

    h += '<div class="home-grid2' + (edit ? ' editing' : '') + '">';
    layout.forEach(function (x, i) { h += homeWidget(x, i, layout.length, st, extra, edit); });
    h += '</div>';
    if (!layout.length && !edit) {
      h += '<div class="hempty">' + L('หน้าแรกยังว่างอยู่') +
        ' <button class="as-link" data-act="home-edit">' + L('เพิ่มวิดเจ็ต') + '</button></div>';
    }

    if (edit) {
      var have = {};
      layout.forEach(function (x) { have[x.w] = true; });
      var rest = S.HOME_WIDGETS.filter(function (w) { return !have[w.id]; });
      h += '<div class="home-add"><div class="home-add-h">' + L('เพิ่มวิดเจ็ต') + '</div>';
      if (!rest.length) h += '<div class="hempty">' + L('ใส่ครบทุกวิดเจ็ตแล้ว') + '</div>';
      h += '<div class="home-add-grid">';
      rest.forEach(function (w) {
        h += '<button class="home-add-btn" data-act="home-w-add" data-w="' + w.id + '">' +
          I(w.icon, 16) + '<span>' + esc(L(w.label)) + '</span>' + I('plus', 14) + '</button>';
      });
      h += '</div></div>';
    }
    h += '</div>';
    return h;
  }

  function hTitle(icon, text) {
    return '<span class="hcard-title">' + icon + esc(text) + '</span>';
  }

  /** การ์ดหนึ่งใบบนหน้าแรก ตามชนิดวิดเจ็ต */
  function homeWidget(x, i, n, st, extra, edit) {
    var meUser = S.me();
    var o = null;
    var w = x.w;

    if (w === 'mine') {
      var mine = S.myTasks(S.db.currentUserId);
      var mineTab = st.mine || 'upcoming';
      var mineItems = mineTab === 'overdue' ? mine.overdue
        : mineTab === 'done' ? S.myCompleted(S.db.currentUserId, HOME_ROWS)
        : mine.today.concat(mine.upcoming, mine.later, mine.nodate);
      o = {
        title: '<span class="hcard-title">' + avatar(meUser, 'sm') + L('งานของฉัน') + '</span>',
        action: '<button class="btn btn-sm btn-ghost" data-act="go" data-route="mytasks">' + L('ดูทั้งหมด') + '</button>',
        tabs: hTabs('mine', mineTab, [
          ['upcoming', L('กำลังจะถึง')],
          ['overdue', L('เลยกำหนด ({n})', { n: mine.overdue.length })],
          ['done', L('เสร็จแล้ว')]
        ]),
        body: hList(mineItems, L('ไม่มีงานในช่วงนี้'))
      };
    } else if (w === 'assigned') {
      var assigned = S.assignedByMe();
      var aTab = st.assigned || 'week';
      var aItems = aTab === 'upcoming' ? assigned.upcoming
        : aTab === 'overdue' ? assigned.overdue
        : aTab === 'done' ? assigned.completed : assigned.week;
      o = {
        title: hTitle(I('users', 15), L('งานที่ฉันมอบหมาย')),
        tabs: hTabs('assigned', aTab, [
          ['week', L('สัปดาห์นี้ ({n})', { n: assigned.week.length })],
          ['upcoming', L('กำลังจะถึง')],
          ['overdue', L('เลยกำหนด ({n})', { n: assigned.overdue.length })],
          ['done', L('เสร็จแล้ว')]
        ]),
        body: hList(aItems, L('ยังไม่ได้มอบหมายงานให้ใคร'))
      };
    } else if (w === 'projects') {
      o = { title: hTitle(I('grid', 15), L('โปรเจกต์ล่าสุด')),
            action: '<button class="btn btn-sm btn-ghost" data-act="go" data-route="projects">' + L('ดูทั้งหมด') + '</button>',
            body: homeProjects(!!st.allProjects) };
    } else if (w === 'people') {
      var col = S.frequentCollaborators(null, 8);
      var cb = '';
      if (!col.length) cb = '<div class="hempty">' + L('ยังไม่มีใครทำงานร่วมกับคุณ') + '</div>';
      else {
        cb = '<div class="hpeople">';
        col.forEach(function (c) {
          cb += '<button class="hperson" data-act="go-profile" data-id="' + esc(c.user.id) + '">' +
            avatar(c.user, 'md') + '<b>' + esc(c.user.name) + '</b><em>' +
            esc(c.user.title || L('{n} งานร่วมกัน', { n: c.n })) + '</em></button>';
        });
        cb += '</div>';
      }
      o = { title: hTitle(I('users', 15), L('คนที่ทำงานด้วย')), body: cb };
    } else if (w === 'status') {
      var feed = S.statusFeed(6);
      var sb = '';
      if (!feed.length) sb = '<div class="hempty">' + L('ยังไม่มีโปรเจกต์ไหนรายงานสถานะ') + '</div>';
      feed.forEach(function (f) {
        var stt = projectState(f.entry.state);
        var by = S.user(f.entry.by);
        sb += '<button class="hstatus" data-act="go-project-view" data-id="' + esc(f.project.id) +
          '" data-view="overview"><span class="hproj-ic" style="background:' + esc(f.project.color) + '22">' +
          esc(f.project.icon) + '</span><span class="grow"><span class="hstatus-top"><b>' + esc(f.project.name) +
          '</b><span class="approval-pill" style="background:' + stt.color + '22;color:' + stt.color + '">' +
          esc(L(stt.label)) + '</span></span>' +
          (f.entry.text ? '<span class="hstatus-txt">' + esc(S.plainText(f.entry.text).slice(0, 140)) + '</span>' : '') +
          '<span class="hact-sub" title="' + esc(fmtExact(f.entry.at)) + '">' + esc(by ? by.name : '?') +
          ' · ' + esc(fmtWhen(f.entry.at)) + '</span></span></button>';
      });
      o = { title: hTitle(I('flag', 15), L('อัปเดตสถานะ')), body: sb };
    } else if (w === 'notepad') {
      var np = S.personalOf().notepad || '';
      o = {
        title: hTitle(I('note', 15), L('สมุดโน้ตส่วนตัว')),
        action: '<span class="hnote-hint">' + I('lock', 12) + L('เห็นเฉพาะคุณ') + '</span>',
        body: '<textarea class="hnote" data-act="notepad" maxlength="' + S.NOTEPAD_MAX + '" placeholder="' +
          L('จดอะไรก็ได้ บันทึกเองอัตโนมัติ') + '">' + esc(np) + '</textarea>'
      };
    } else if (w === 'drafts') {
      var ds = extra.drafts || [];
      var dh = '';
      if (!ds.length) dh = '<div class="hempty">' + L('ไม่มีความเห็นที่พิมพ์ค้างไว้') + '</div>';
      ds.slice(0, HOME_ROWS).forEach(function (d) {
        dh += '<button class="hdraft" data-act="open-task" data-id="' + esc(d.taskId) + '">' +
          I('pencil', 13) + '<span class="grow"><b>' + esc(d.taskName) + '</b><em>' +
          esc(d.text.slice(0, 120)) + '</em></span></button>';
      });
      o = { title: hTitle(I('pencil', 15), L('ร่างความเห็น')), body: dh };
    } else if (w === 'stats') {
      var cs = S.completedStats(null, 14);
      var peak = 1;
      cs.days.forEach(function (d) { if (d.n > peak) peak = d.n; });
      var bars = '<div class="hbars">';
      cs.days.forEach(function (d) {
        var dd = new Date(d.d + 'T00:00:00');
        bars += '<div class="hbar" title="' + esc(fmtDate(d.d) + ' · ' + L('{n} งาน', { n: d.n })) + '">' +
          '<i style="height:' + Math.round(d.n / peak * 100) + '%"></i>' +
          '<span>' + dd.getDate() + '</span></div>';
      });
      bars += '</div>';
      o = {
        title: hTitle(I('chart', 15), L('สถิติงานเสร็จ')),
        body: '<div class="hstat-nums">' +
          '<span><b>' + cs.week + '</b>' + L('7 วันนี้') + '</span>' +
          '<span><b>' + cs.prevWeek + '</b>' + L('7 วันก่อน') + '</span>' +
          '<span><b>' + cs.month + '</b>' + L('30 วัน') + '</span></div>' + bars
      };
    } else if (w === 'activity') {
      var acts = S.recentActivity(HOME_ROWS);
      var ab = '';
      if (!acts.length) ab = '<div class="hempty">' + L('ยังไม่มีกิจกรรม') + '</div>';
      acts.forEach(function (a) {
        ab += '<div class="hact" data-act="open-task" data-id="' + esc(a.story.taskId) + '">' +
          avatar(a.actor, 'sm') +
          '<span class="hact-body"><span class="hact-txt"><strong>' +
          esc(a.actor ? a.actor.name : '?') + '</strong> ' +
          esc(a.story.type === 'comment' ? L('แสดงความเห็น') : storyText(a.story)) + '</span>' +
          '<span class="hact-sub" title="' + esc(fmtExact(a.story.createdAt)) + '">' +
          esc(a.taskName || '') + ' · ' + esc(fmtWhen(a.story.createdAt)) +
          '</span></span></div>';
      });
      o = {
        title: hTitle(I('bell', 15), L('กิจกรรมล่าสุด')),
        action: '<button class="btn btn-sm btn-ghost" data-act="go" data-route="inbox">' + L('ดูทั้งหมด') + '</button>',
        body: ab
      };
    } else if (w === 'forms') {
      /* 3b — ฟอร์มที่เปิดรับอยู่ในโปรเจกต์ที่เห็นได้ กดเพื่อเปิดหน้าส่งฟอร์ม */
      var fl = S.formsForHome();
      var fb = '';
      if (!fl.length) fb = '<div class="hempty">' + L('ยังไม่มีฟอร์มที่เปิดรับ สร้างได้จากเมนูโปรเจกต์ → ฟอร์ม') + '</div>';
      fl.slice(0, HOME_ROWS).forEach(function (x) {
        fb += '<button class="hform" data-act="go-form" data-id="' + esc(x.f.id) + '">' +
          '<span class="hproj-ic" style="background:' + esc(x.p.color) + '22">' + esc(x.p.icon) + '</span>' +
          '<span class="grow"><b>' + esc(x.f.name) + '</b><em>' + esc(x.p.name) + ' · ' +
          esc(L('{n} คำตอบ', { n: x.f.n || 0 })) + (x.f.last ? ' · ' + esc(L('ล่าสุด')) + ' ' + esc(fmtWhen(x.f.last)) : '') +
          '</em></span>' + I('arrowRight', 13) + '</button>';
      });
      o = { title: hTitle(I('note', 15), L('ฟอร์ม')), body: fb };
    }
    if (!o) return '';
    o.cls = (x.full ? 'full' : 'half') + (edit ? ' hw-edit' : '');
    o.attrs = ' data-w="' + esc(w) + '" data-i="' + i + '"' + (edit ? ' draggable="true"' : '');
    if (edit) {
      o.tools = '<div class="hw-tools">' +
        '<span class="hw-grip" title="' + L('ลากเพื่อย้าย') + '">' + I('grip', 14) + '</span>' +
        '<button data-act="home-w-move" data-i="' + i + '" data-d="-1"' + (i === 0 ? ' disabled' : '') +
        ' title="' + L('ย้ายขึ้น') + '">' + I('arrowUp', 13) + '</button>' +
        '<button data-act="home-w-move" data-i="' + i + '" data-d="1"' + (i === n - 1 ? ' disabled' : '') +
        ' title="' + L('ย้ายลง') + '">' + I('arrowDown', 13) + '</button>' +
        '<button data-act="home-w-size" data-i="' + i + '" title="' +
        (x.full ? L('ครึ่งแถว') : L('เต็มแถว')) + '">' + I(x.full ? 'shrink' : 'expand', 13) + '</button>' +
        '<button data-act="home-w-remove" data-i="' + i + '" title="' + L('เอาออก') + '">' + I('close', 13) + '</button>' +
        '</div>';
    }
    return hcard(o);
  }

  /** ตารางโปรเจกต์ล่าสุดบนหน้าแรก */
  function homeProjects(showAll) {
    var projs = S.recentProjects();
    if (!projs.length && !S.can('structure')) return '<div class="hempty">' + L('ยังไม่มีโปรเจกต์') + '</div>';
    var pb = '<div class="hproj-grid">';
    if (S.can('structure')) {
      pb += '<button class="hproj new" data-act="new-project">' +
        '<span class="hproj-ic">' + I('plus', 15) + '</span>' +
        '<span class="hproj-txt"><span class="hproj-nm">' + L('สร้างโปรเจกต์ใหม่') + '</span></span></button>';
    }
    (showAll ? projs : projs.slice(0, 7)).forEach(function (p) {
      var dn = S.dueSoonCount(p.id);
      var ps = p.status ? projectState(p.status.state) : null;
      pb += '<button class="hproj" data-act="go" data-route="project" data-id="' + esc(p.id) + '">' +
        '<span class="hproj-ic" style="background:' + esc(p.color) + '22">' + esc(p.icon) + '</span>' +
        '<span class="hproj-txt"><span class="hproj-nm">' + esc(p.name) +
        (p.visibility === 'private'
          ? '<span class="lockmark" title="' + L('โปรเจกต์ปิด') + '">' + I('shield', 11) + '</span>' : '') +
        '</span><span class="hproj-sub">' +
        (ps ? '<i class="st-dot" style="background:' + esc(ps.color) + '" title="' + esc(L(ps.label)) + '"></i>' : '') +
        (dn ? esc(L('งานใกล้ครบกำหนด {n} งาน', { n: dn })) : L('ไม่มีงานใกล้ครบกำหนด')) +
        '</span></span></button>';
    });
    pb += '</div>';
    if (projs.length > 7) {
      pb += '<button class="hlink" data-act="home-more-projects">' +
        (showAll ? L('ย่อกลับ') : L('ดูเพิ่ม')) + '</button>';
    }
    return pb;
  }

  /* ---------- หน้าโปรไฟล์ ----------
   *
   * เปิดดูของตัวเองก็ได้ ของคนอื่นก็ได้ ใช้โครงเดียวกัน ต่างกันแค่ปุ่มแก้ไข
   * ที่ให้เปิดของคนอื่นได้เพราะคำถามที่คนถามบ่อยที่สุดเวลาจะสั่งงานใครสักคน
   * คือ "เขาทำอะไรค้างอยู่บ้าง" ซึ่งเดิมต้องไปไล่หาทีละโปรเจกต์
   *
   * รายการงานกรองด้วยสายตาของคนที่เปิดดูเสมอ ไม่ใช่ของเจ้าของโปรไฟล์
   * เปิดโปรไฟล์หัวหน้าแล้วเห็นงานในโปรเจกต์ลับที่ตัวเองไม่ได้อยู่ด้วยไม่ได้
   */
  function profileView(userId) {
    var u = S.user(userId);
    if (!u) return '<div class="hempty">' + L('ไม่พบผู้ใช้คนนี้') + '</div>';
    var isMe = S.me() && u.id === S.me().id;
    var away = S.isAway(u.id);
    var b = S.myTasks(u.id);
    var open = b.overdue.concat(b.today, b.upcoming, b.later, b.nodate);

    var h = '<div class="prof">';

    /* --- หัวโปรไฟล์ --- */
    h += '<div class="prof-head">' + avatar(u, 'xxl') + '<div class="prof-id">';
    h += '<h1>' + esc(u.name) +
      (u.pronouns ? '<small>(' + esc(u.pronouns) + ')</small>' : '') + '</h1>';

    if (away) {
      h += '<div class="prof-away">' + I('calendar', 14) + '<span>' +
        esc(L('ไม่อยู่ถึง {d}', { d: fmtDate(u.away.until) })) +
        (u.away.note ? ' · ' + esc(u.away.note) : '') + '</span></div>';
    } else if (isMe) {
      h += '<button class="prof-away as-link" data-act="set-away">' + I('calendar', 14) +
        '<span>' + L('ตั้งสถานะไม่อยู่') + '</span></button>';
    }

    h += '<div class="prof-meta">';
    if (u.title) h += '<span>' + I('building', 14) + esc(u.title) + '</span>';
    if (u.dept) h += '<span>' + I('users', 14) + esc(u.dept) + '</span>';
    h += '<span>' + I('signIn', 14) + esc(u.email || '—') + '</span>';
    if (isMe && !u.about) {
      h += '<button class="as-link" data-act="open-settings" data-tab="profile">' +
        I('plus', 14) + L('เพิ่มคำแนะนำตัว') + '</button>';
    }
    h += '</div>';

    if (u.about) h += '<p class="prof-about">' + esc(u.about) + '</p>';

    if (isMe) {
      h += '<button class="btn btn-primary btn-sm" data-act="open-settings" data-tab="profile">' +
        L('แก้ไขโปรไฟล์') + '</button>';
    } else if (S.isAdmin()) {
      h += '<button class="btn btn-sm" data-act="go" data-route="admin">' +
        L('จัดการในหน้าผู้ดูแล') + '</button>';
    }
    h += '</div></div>';

    /* --- สองคอลัมน์ --- */
    h += '<div class="home-grid">';

    h += hcard({
      title: I('checkCircle', 16) + '<b>' +
        (isMe ? L('งานของฉัน') : esc(L('งานของ {name}', { name: u.name }))) + '</b>',
      action: isMe
        ? '<button class="btn btn-sm btn-ghost" data-act="go" data-route="mytasks">' +
          L('ดูทั้งหมด') + '</button>' : '',
      body: hList(open, isMe ? L('ยังไม่มีงานค้าง')
                             : L('ไม่มีงานค้างที่คุณมีสิทธิ์เห็น'))
    });

    var col = S.frequentCollaborators(u.id, 6);
    var cb = '';
    if (!col.length) {
      cb = '<div class="hempty">' +
        (isMe ? L('ยังไม่มีใครทำงานร่วมกับคุณ') : L('ยังไม่เห็นงานที่ทำร่วมกัน')) + '</div>';
    } else {
      col.forEach(function (c) {
        cb += '<button class="prof-col" data-act="go-profile" data-id="' + esc(c.user.id) + '">' +
          avatar(c.user, 'md') + '<span class="grow"><b>' + esc(c.user.name) + '</b>' +
          '<em>' + esc(c.user.title || L('{n} งานร่วมกัน', { n: c.n })) + '</em></span></button>';
      });
    }
    h += hcard({
      title: I('users', 16) + '<b>' + L('คนที่ทำงานด้วยบ่อย') + '</b>',
      body: cb
    });

    /* --- โปรเจกต์ที่อยู่ร่วมกัน --- */
    var shared = S.visibleProjects().filter(function (p) {
      return S.projectAccess(p.id, u.id);
    });
    var pb = '';
    if (!shared.length) {
      pb = '<div class="hempty">' + L('ยังไม่มีโปรเจกต์ที่เห็นร่วมกัน') + '</div>';
    } else {
      /* นับงานค้างรายโปรเจกต์รอบเดียว ไม่ใช่กวาดงานทั้งหมดใหม่ทุกแถว */
      var openPer = {};
      open.forEach(function (t) {
        S.projectsOfTask(t.id).forEach(function (x) {
          openPer[x.project.id] = (openPer[x.project.id] || 0) + 1;
        });
      });
      shared.slice(0, 8).forEach(function (p) {
        pb += '<button class="prof-col" data-act="go" data-route="project" data-id="' +
          esc(p.id) + '"><span class="hproj-ic" style="background:' + esc(p.color) + '22">' +
          esc(p.icon || '•') + '</span><span class="grow"><b>' + esc(p.name) + '</b>' +
          '<em>' + esc(L('{n} งานที่ยังไม่เสร็จ', { n: openPer[p.id] || 0 })) +
          '</em></span></button>';
      });
    }
    h += hcard({
      title: I('grid', 16) + '<b>' +
        (isMe ? L('โปรเจกต์ของฉัน') : L('โปรเจกต์ที่อยู่ร่วมกัน')) + '</b>',
      body: pb
    });

    h += '</div></div>';
    return h;
  }

  /* ---------- งานของฉัน ----------
   *
   * เซกชันเป็นของแต่ละคน (S.mtGroups) งานที่เพิ่งได้รับมอบหมายลง "เพิ่งได้รับมอบหมาย" เอง
   * มุมมอง ตัวกรอง เรียง จัดกลุ่ม บันทึกต่อคนใน db.personal (S.mtSetView)
   * ui = { collapsed: {sectionId: true}, calAnchor } สถานะหน้าจอที่ไม่ต้องจำข้ามเครื่อง
   */
  var MT_TABS = [['list', 'รายการ'], ['board', 'บอร์ด'], ['calendar', 'ปฏิทิน'], ['files', 'ไฟล์']];

  function mtLabel(g) {
    if (g.special) return g.label ? L(g.label) : L('เพิ่งได้รับมอบหมาย');
    return L(g.label);
  }

  function mtFilterCount(v) {
    return (v.show !== 'open' ? 1 : 0) + (v.due && v.due !== 'any' ? 1 : 0) + (v.project ? 1 : 0);
  }

  function mtToolbar(v) {
    var h = '<div class="vtb mt-tb">';
    if (S.can('write')) {
      h += '<div class="vtb-add"><button class="btn btn-sm btn-primary" data-act="mt-add-top">' +
        I('plus', 13) + ' ' + L('เพิ่มงาน') + '</button></div>';
    }
    h += '<div class="vtb-spacer"></div>';
    var nf = mtFilterCount(v);
    h += '<button class="vtb-btn' + (nf ? ' on' : '') + '" data-act="mt-filter" title="' + L('ตัวกรอง') + '">' +
      I('filter', 14) + '<span>' + L('ตัวกรอง') + '</span>' +
      (nf ? '<span class="vtb-n">' + nf + '</span><span class="vtb-x" data-act="mt-filter-clear" title="' +
        L('ล้างตัวกรอง') + '">' + I('close', 11) + '</span>' : '') + '</button>';
    if (v.mode === 'list' || v.mode === 'board') {
      var sortOn = v.sort && v.sort !== 'manual';
      h += '<button class="vtb-btn' + (sortOn ? ' on' : '') + '" data-act="mt-sort" title="' + L('เรียง') + '">' +
        I(v.dir === 'desc' ? 'arrowDown' : 'arrowUp', 14) + '<span>' + L('เรียง') + '</span>' +
        (sortOn ? '<span class="vtb-x" data-act="mt-sort-clear" title="' + L('เลิกเรียง') + '">' +
          I('close', 11) + '</span>' : '') + '</button>';
      h += '<button class="vtb-btn' + (v.group !== 'sections' ? ' on' : '') + '" data-act="mt-group" title="' +
        L('จัดกลุ่ม') + '">' + I('grid', 13) + '<span>' + L('จัดกลุ่ม') + '</span></button>';
    }
    /* 3a — อัตโนมัติของงานของฉัน (ย้ายเซกชันเมื่อใกล้ครบกำหนด เลยกำหนด ทำเสร็จ) */
    var na = S.automations('@me').filter(function (a) { return a.on; }).length;
    h += '<button class="vtb-btn' + (na ? ' on' : '') + '" data-act="mt-auto" title="' + L('ระบบอัตโนมัติ') + '">' +
      I('bolt', 14) + '<span>' + L('ระบบอัตโนมัติ') + '</span>' + (na ? '<span class="vtb-n">' + na + '</span>' : '') + '</button>';
    return h + '</div>';
  }

  /** ไอคอนสายฟ้าบนหัวคอลัมน์ — สีเมื่อมีอัตโนมัติ "ย้ายเข้าคอลัมน์นี้" เปิดอยู่ (3a) */
  function secBolt(pid, secId, canStruct) {
    var n = S.autoForSection(pid, secId).length;
    if (!n && !canStruct) return '';
    return '<button class="btn btn-sm btn-ghost sec-bolt' + (n ? ' on' : '') + '" data-act="auto-sec" data-section="' +
      esc(secId) + '" title="' + esc(n ? L('อัตโนมัติของคอลัมน์นี้ {n} รายการ', { n: n }) : L('เพิ่มอัตโนมัติให้คอลัมน์นี้')) + '">' +
      I('bolt', 13) + (n > 1 ? '<span class="sec-bolt-n">' + n + '</span>' : '') + '</button>';
  }

  function mtSecActs(g, i, n, board) {
    if (!g.isSection) return '';
    return '<span class="acts">' +
      '<button class="btn btn-sm btn-ghost" data-act="mt-sec-move" data-section="' + esc(g.key) +
      '" data-delta="-1"' + (i === 0 ? ' disabled' : '') + ' title="' + L(board ? 'ย้ายซ้าย' : 'ย้ายขึ้น') + '">' +
      I(board ? 'arrowLeft' : 'arrowUp', 14) + '</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="mt-sec-move" data-section="' + esc(g.key) +
      '" data-delta="1"' + (i === n - 1 ? ' disabled' : '') + ' title="' + L(board ? 'ย้ายขวา' : 'ย้ายลง') + '">' +
      I(board ? 'arrowRight' : 'arrowDown', 14) + '</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="mt-sec-rename" data-section="' + esc(g.key) +
      '" title="' + L('เปลี่ยนชื่อ') + '">' + I('pencil', 14) + '</button>' +
      (g.special ? '' : '<button class="btn btn-sm btn-ghost" data-act="mt-sec-delete" data-section="' +
        esc(g.key) + '" title="' + L('ลบ') + '">' + I('trash', 14) + '</button>') + '</span>';
  }

  function myTasksView(sel, ui) {
    ui = ui || {};
    sel = sel || {};
    var v = S.personalOf().mt.view;
    var h = mtToolbar(v);
    if (v.mode === 'calendar') return h + mtCalendar(v, ui);
    if (v.mode === 'files') return h + filesList(S.filesOfTasks(S.mtTasks()),
      L('ไฟล์ในงานของฉัน'), L('ยังไม่มีไฟล์แนบในงานที่มอบหมายให้คุณ'));

    var groups = S.mtGroups(null, v);
    var total = groups.reduce(function (a, g) { return a + g.items.length; }, 0);
    var canW = S.can('write');

    if (v.mode === 'board') {
      h += '<div class="board mt-board">';
      groups.forEach(function (g, i) {
        h += '<div class="col"' + (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + '>';
        h += '<div class="col-head"><h3>' + (g.color ? '<span class="swatch" style="background:' + esc(g.color) + '"></span>' : '') +
          esc(mtLabel(g)) + '</h3><span class="n">' + g.items.length + '</span>' +
          mtSecActs(g, i, groups.length, true) + '</div>';
        h += '<div class="col-body"' + (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + '>';
        g.items.forEach(function (t) {
          h += taskCard(t, g.isSection ? g.key : '', { selectable: true, selected: !!sel[t.id], dots: true, mine: true });
        });
        h += '</div>';
        if (g.isSection && canW) {
          h += '<button class="col-add" data-act="mt-add" data-section="' + esc(g.key) + '">+ ' + L('เพิ่มงาน') + '</button>';
        }
        h += '</div>';
      });
      if (v.group === 'sections') {
        h += '<button class="col-new" data-act="mt-sec-add">' + L('+ เพิ่มเซกชัน') + '</button>';
      }
      return h + '</div>';
    }

    h += '<div class="list-wrap mt-list">';
    groups.forEach(function (g, i) {
      var coll = !!(ui.collapsed && ui.collapsed[g.key]);
      h += '<div class="sec mt-sec' + (coll ? ' collapsed' : '') + '">';
      h += '<div class="sec-head"><button class="sec-tog" data-act="mt-collapse" data-section="' + esc(g.key) +
        '" title="' + (coll ? L('กาง') : L('ยุบ')) + '">' + I(coll ? 'chevronRight' : 'chevronDown', 14) + '</button>' +
        '<h3' + (g.key === 'overdue' ? ' class="overdue"' : '') + '>' +
        (g.color ? '<span class="swatch" style="background:' + esc(g.color) + '"></span>' : '') +
        (g.key === '__private' ? I('lock', 13) + ' ' : '') + esc(mtLabel(g)) + '</h3>' +
        '<span class="n">' + g.items.length + '</span>' + mtSecActs(g, i, groups.length, false) + '</div>';
      if (!coll) {
        h += '<div class="sec-body"' + (g.isSection ? ' data-section="' + esc(g.key) + '"' : '') + '>';
        g.items.forEach(function (t) {
          h += taskRow(t, { showProject: true, selectable: true, selected: !!sel[t.id], dots: true,
                            sectionId: g.isSection ? g.key : '' });
        });
        if (g.isSection && !g.items.length) {
          h += '<div class="mt-empty">' + (g.special
            ? L('งานที่มีคนมอบหมายให้คุณจะมาอยู่ที่นี่ก่อน')
            : L('ลากงานมาวางที่นี่')) + '</div>';
        }
        h += '</div>';
        if (g.isSection && canW) {
          h += '<button class="add-row" data-act="mt-add" data-section="' + esc(g.key) + '">' +
            I('plus', 14) + ' ' + L('เพิ่มงาน') + '</button>';
        }
      }
      h += '</div>';
    });
    if (!total && v.group !== 'sections') {
      h += '<div class="empty"><div class="big">🎉</div>' +
        (mtFilterCount(v) ? L('ไม่มีงานที่ตรงกับตัวกรอง') : L('ไม่มีงานค้างเลย')) + '</div>';
    }
    if (v.group === 'sections') {
      h += '<button class="add-row mt-addsec" data-act="mt-sec-add">' + I('plus', 14) + ' ' + L('เพิ่มเซกชัน') + '</button>';
    }
    return h + '</div>';
  }

  /** ปฏิทินของงานของฉัน — งานที่ยังไม่มีวันอยู่แถบข้าง ลากลงวันได้ */
  function mtCalendar(v, ui) {
    var all = S.mtTasks().filter(function (t) {
      return (v.show === 'all' || (v.show === 'done' ? t.completed : !t.completed)) &&
        (!v.project || (v.project === '__private' ? S.isPrivate(t.id)
          : S.projectsOfTask(S.rootOf(t).id).some(function (x) { return x.project.id === v.project; })));
    });
    return calBoard({
      scope: 'mt', mode: v.cal, anchor: ui.calAnchor,
      tasks: all.filter(function (t) { return t.dueOn || t.startOn; }),
      unscheduled: all.filter(function (t) { return !t.dueOn && !t.startOn; }),
      addable: S.can('write'), dots: true
    });
  }

  /* ---------- ปฏิทินสัปดาห์/เดือน ใช้ซ้ำได้ ----------
   *
   * ชิ้นงาน 2a ใช้กับงานของฉัน ชิ้นงาน 2b ใช้ฟังก์ชันเดียวกันกับปฏิทินโปรเจกต์และปฏิทินรวม
   *   opts.scope        ชื่อขอบเขต (เช่น 'mt' หรือ 'p:<projectId>') อยู่ใน data-scope
   *                     main.js ใช้แยกว่ากำลังเลื่อน เพิ่ม หรือวางงานในปฏิทินไหน
   *   opts.mode         'week' | 'month'
   *   opts.anchor       วันใดก็ได้ในช่วงที่จะแสดง (YYYY-MM-DD) ไม่ส่ง = วันนี้
   *   opts.tasks        งานที่มีวัน — งานที่มีทั้งวันเริ่มและกำหนดส่งเป็นแถบยาวข้ามวัน
   *   opts.unscheduled  งานที่ยังไม่มีวัน แสดงในแถบข้าง (null = ไม่มีแถบข้าง)
   *   opts.addable      ปุ่ม + ในแต่ละวัน (data-act="calx-add" data-date)
   *   opts.colorOf      fn(task) → สีของแถบ (ไม่ส่ง = สีโปรเจกต์แรก)
   *   opts.dots         จุดสีฟ้าของงานที่เพิ่งได้รับมอบหมาย
   *   opts.maxLanes     จำนวนแถบต่อวันในมุมมองเดือนก่อนยุบเป็น "+n" (ค่าเริ่ม 3)
   * การโต้ตอบที่ main.js ต้องรองรับ: calx-nav (data-d -1/0/1) calx-mode (data-v) calx-add calx-day
   * และการลาก .calx-drag ลง .calx-row (หาวันจากตำแหน่งเมาส์ในแถว) หรือลง .calx-side (เอาวันออก)
   */
  function calSpan(t) {
    var a = t.startOn || t.dueOn, b = t.dueOn || t.startOn;
    if (!a) return null;
    return a <= b ? [a, b] : [b, a];
  }

  function calStart(mode, anchor) {
    var a = new Date(anchor + 'T00:00:00');
    var ws = weekStart();
    if (mode === 'week') {
      var s = new Date(a);
      s.setDate(a.getDate() - ((a.getDay() - ws + 7) % 7));
      return { start: S.iso(s), weeks: 1, month: a.getMonth(), year: a.getFullYear() };
    }
    var first = new Date(a.getFullYear(), a.getMonth(), 1);
    var st = new Date(first);
    st.setDate(1 - ((first.getDay() - ws + 7) % 7));
    var last = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    var span = S.daysBetween(S.iso(st), S.iso(last)) + 1;
    return { start: S.iso(st), weeks: Math.ceil(span / 7), month: a.getMonth(), year: a.getFullYear() };
  }

  function calTitle(mode, rg) {
    if (mode === 'month') return MONF()[rg.month] + ' ' + YR(rg.year);
    var a = new Date(rg.start + 'T00:00:00'), b = new Date(S.addDays(rg.start, 6) + 'T00:00:00');
    var m = MON();
    if (a.getMonth() === b.getMonth()) {
      return a.getDate() + '–' + b.getDate() + ' ' + m[a.getMonth()] + ' ' + YR(a.getFullYear());
    }
    return a.getDate() + ' ' + m[a.getMonth()] + ' – ' + b.getDate() + ' ' + m[b.getMonth()] + ' ' +
      YR(b.getFullYear());
  }

  function calColor(t) {
    var p = S.projectsOfTask(S.rootOf(t).id)[0];
    return p ? p.project.color : 'var(--accent)';
  }

  function calBoard(opts) {
    var mode = opts.mode === 'month' ? 'month' : 'week';
    var anchor = opts.anchor || S.today();
    var rg = calStart(mode, anchor);
    var td = S.today();
    var maxL = mode === 'month' ? (opts.maxLanes || 3) : 99;
    var colorOf = opts.colorOf || calColor;
    var dows = DOWR();
    var ws = weekStart();
    /* ซ่อนเสาร์-อาทิตย์ได้ — vis คือดัชนีวัน (0-6 ในแถว) ที่ยังแสดงอยู่
     * งานที่ตกวันหยุดจะชิดไปวันทำงานที่ใกล้ที่สุดในสัปดาห์เดียวกัน ไม่หายไปจากปฏิทิน */
    var vis = [];
    for (var k0 = 0; k0 < 7; k0++) {
      var dow = (ws + k0) % 7;
      if (opts.weekends !== false || (dow !== 0 && dow !== 6)) vis.push(k0);
    }
    var nc = vis.length;
    function colFirst(k) {          // คอลัมน์แรกที่ >= k
      for (var i = 0; i < nc; i++) if (vis[i] >= k) return i;
      return nc - 1;
    }
    function colLast(k) {           // คอลัมน์สุดท้ายที่ <= k
      for (var i = nc - 1; i >= 0; i--) if (vis[i] <= k) return i;
      return 0;
    }

    var h = '<div class="calx m-' + mode + (opts.unscheduled ? ' has-side' : '') +
      (nc < 7 ? ' no-wk' : '') + '" data-scope="' + esc(opts.scope || '') + '" style="--cols:' + nc + '">';
    h += '<div class="calx-head">' +
      '<div class="calx-nav">' +
      '<button class="btn btn-sm" data-act="calx-nav" data-d="-1" title="' +
      (mode === 'month' ? L('เดือนก่อนหน้า') : L('สัปดาห์ก่อน')) + '">' + I('arrowLeft', 14) + '</button>' +
      '<button class="btn btn-sm" data-act="calx-nav" data-d="0">' + L('วันนี้') + '</button>' +
      '<button class="btn btn-sm" data-act="calx-nav" data-d="1" title="' +
      (mode === 'month' ? L('เดือนถัดไป') : L('สัปดาห์ถัดไป')) + '">' + I('arrowRight', 14) + '</button></div>' +
      '<strong class="calx-title">' + esc(calTitle(mode, rg)) + '</strong>' +
      (opts.tools || '') +
      '<div class="segmented calx-modes">' +
      '<button data-act="calx-mode" data-v="week" class="' + (mode === 'week' ? 'on' : '') + '">' + L('สัปดาห์') + '</button>' +
      '<button data-act="calx-mode" data-v="month" class="' + (mode === 'month' ? 'on' : '') + '">' + L('เดือน') + '</button>' +
      '</div></div>';
    if (opts.legend) h += opts.legend;

    h += '<div class="calx-body"><div class="calx-main">';
    if (mode === 'month') {
      h += '<div class="calx-dows">';
      vis.forEach(function (k) { h += '<div>' + esc(dows[k]) + '</div>'; });
      h += '</div>';
    }

    var tasks = (opts.tasks || []).filter(function (t) { return !!calSpan(t); });
    for (var w = 0; w < rg.weeks; w++) {
      var w0 = S.addDays(rg.start, w * 7), w6 = S.addDays(w0, 6);
      var days = [];
      for (var k = 0; k < 7; k++) days.push(S.addDays(w0, k));
      var shown = vis.map(function (x) { return days[x]; });
      var items = [];
      tasks.forEach(function (t) {
        var sp = calSpan(t);
        if (sp[0] > w6 || sp[1] < w0) return;
        var a = sp[0] < w0 ? 0 : S.daysBetween(w0, sp[0]);
        var b = sp[1] > w6 ? 6 : S.daysBetween(w0, sp[1]);
        var ca = colFirst(a), cb = colLast(b);
        if (vis[ca] > b) ca = colLast(a);   // ทั้งช่วงอยู่ในวันที่ซ่อน — ชิดไปวันก่อนหน้า
        if (cb < ca) cb = ca;
        items.push({ t: t, a: ca, b: cb, cutL: sp[0] < w0, cutR: sp[1] > w6 });
      });
      items.sort(function (x, y) {
        return (x.a - y.a) || ((y.b - y.a) - (x.b - x.a)) ||
          (x.t.completed === y.t.completed ? 0 : x.t.completed ? 1 : -1) ||
          x.t.name.localeCompare(y.t.name, 'th');
      });
      var lanes = [];
      items.forEach(function (it) {
        var l = 0;
        while (lanes[l] !== undefined && lanes[l] >= it.a) l++;
        lanes[l] = it.b;
        it.lane = l;
      });
      var hidden = vis.map(function () { return 0; });
      var rows = Math.min(lanes.length, maxL);
      h += '<div class="calx-row" data-start="' + w0 + '" data-days="' + shown.join(',') +
        '" style="--rows:' + rows + '">';
      shown.forEach(function (d, i) {
        var dt = new Date(d + 'T00:00:00');
        var other = mode === 'month' && dt.getMonth() !== rg.month;
        h += '<div class="calx-day' + (other ? ' other' : '') + (d === td ? ' is-today' : '') +
          (d < td ? ' past' : '') + '" style="grid-column:' + (i + 1) + '"' +
          (opts.addable ? ' data-act="calx-add" data-date="' + d + '"' : '') + '>' +
          '<div class="calx-dnum">' +
          (mode === 'week' ? '<span class="calx-dw">' + esc(dows[vis[i]]) + '</span>' : '') +
          '<button class="calx-dbtn" data-act="calx-day" data-date="' + d + '" title="' +
          esc(fmtDate(d)) + '">' + dt.getDate() + '</button>' +
          (opts.addable ? '<button class="calx-add" data-act="calx-add" data-date="' + d + '" title="' +
            L('เพิ่มงานวันนี้') + '">' + I('plus', 12) + '</button>' : '') +
          '</div></div>';
      });
      items.forEach(function (it) {
        if (it.lane >= maxL) {
          for (var c = it.a; c <= it.b; c++) hidden[c]++;
          return;
        }
        var t = it.t;
        var end = t.dueOn || t.startOn;
        var over = !t.completed && end < td;
        h += '<div class="calx-bar calx-drag' + (t.completed ? ' done' : '') + (over ? ' over' : '') +
          (it.cutL ? ' cut-l' : '') + (it.cutR ? ' cut-r' : '') + (it.a === it.b ? ' one' : '') +
          '" draggable="true" data-act="open-task" data-id="' + esc(t.id) + '" style="grid-column:' +
          (it.a + 1) + ' / ' + (it.b + 2) + ';grid-row:' + (it.lane + 2) + ';--c:' + esc(colorOf(t)) +
          '" title="' + esc(t.name + (t.dueOn ? ' · ' + fmtDate(t.dueOn) : '')) + '">' +
          (opts.dots ? newDot(t) : '') +
          (t.type === 'milestone' ? I('diamond', 10) : '') +
          '<span class="nm">' + esc(t.name) + '</span></div>';
      });
      hidden.forEach(function (cnt, i) {
        if (!cnt) return;
        h += '<button class="calx-more" data-act="calx-day" data-date="' + shown[i] + '" style="grid-column:' +
          (i + 1) + ';grid-row:' + (rows + 2) + '">+' + cnt + ' ' + L('อื่น ๆ') + '</button>';
      });
      h += '</div>';
    }
    h += '</div>';

    if (opts.unscheduled) {
      var un = opts.unscheduled;
      var more = opts.unscheduledMore || 0;
      h += '<aside class="calx-side" data-scope="' + esc(opts.scope || '') + '">' +
        '<div class="calx-side-head">' + I('calendar', 14) + '<b>' + esc(opts.sideTitle || L('ยังไม่มีวัน')) + '</b>' +
        '<span class="n">' + (un.length + more) + '</span></div>' +
        '<div class="calx-side-hint">' + L('ลากงานไปวางบนวันที่ หรือลากงานกลับมาที่นี่เพื่อเอาวันออก') + '</div>';
      if (!un.length) h += '<div class="calx-side-empty">' + L('ทุกงานมีวันแล้ว') + '</div>';
      un.forEach(function (t) {
        h += '<div class="calx-un calx-drag' + (t.completed ? ' done' : '') + '" draggable="true" data-act="open-task" data-id="' +
          esc(t.id) + '">' + (opts.dots ? newDot(t) : '') + checkbox(t) +
          '<span class="nm">' + esc(t.name) + '</span></div>';
      });
      if (more) h += '<div class="calx-side-empty">' + L('และอีก {n} งาน', { n: more }) + '</div>';
      h += '</aside>';
    }
    h += '</div></div>';
    return h;
  }

  /** ปุ่มบนหัวปฏิทิน — แสดง/ซ่อนเสาร์-อาทิตย์ และระบายสีตาม */
  function calTools(weekends, colorBy, choices) {
    return '<button class="btn btn-sm calx-wk' + (weekends ? ' on' : '') + '" data-act="cal-weekends" ' +
      'role="switch" aria-checked="' + (weekends ? 'true' : 'false') + '" title="' + L('แสดงเสาร์-อาทิตย์') + '">' +
      '<span class="calx-wk-box">' + (weekends ? I('check', 11) : '') + '</span>' + L('เสาร์-อาทิตย์') + '</button>' +
      colorSelect('cal-colorby', choices, colorBy);
  }

  /** ปฏิทินของโปรเจกต์ — ใช้ตัวกรองของมุมมองเดียวกับรายการ/บอร์ด */
  function projectCalendar(projectId, view, anchor) {
    var p = S.project(projectId);
    var all = S.viewItems(projectId, view).map(function (x) { return x.task; });
    var by = view.cColorBy || 'project';
    return calBoard({
      scope: 'p:' + projectId, mode: view.cMode, anchor: anchor, weekends: view.cWeekends !== false,
      tasks: all.filter(function (t) { return t.dueOn || t.startOn; }),
      unscheduled: all.filter(function (t) { return !t.dueOn && !t.startOn; }),
      addable: S.can('write') && S.canInProject(projectId, 'edit'),
      colorOf: function (t) { return colorFor(t, by, p); },
      tools: calTools(view.cWeekends !== false, by, S.colorChoices(projectId)),
      legend: colorLegendOf(by, p)
    });
  }

  /** ปฏิทินรวม — ทุกงานที่เห็นได้ แถบข้างเป็นงานของฉันที่ยังไม่มีวัน (ไม่งั้นยาวเป็นพัน) */
  function globalCalendar(prefs, anchor) {
    var pool = S.db.tasks.filter(function (t) { return !t.parentId && S.canSeeTask(t.id); });
    var me = S.db.currentUserId;
    var un = pool.filter(function (t) { return !t.dueOn && !t.startOn && !t.completed && t.assigneeId === me; });
    var by = prefs.colorBy || 'project';
    return calBoard({
      scope: 'all', mode: prefs.mode, anchor: anchor, weekends: prefs.weekends !== false,
      tasks: pool.filter(function (t) { return t.dueOn || t.startOn; }),
      unscheduled: un.slice(0, 80), unscheduledMore: Math.max(0, un.length - 80),
      sideTitle: L('งานของฉันที่ยังไม่มีวัน'),
      addable: S.can('write'),
      colorOf: function (t) { return colorFor(t, by, null); },
      tools: calTools(prefs.weekends !== false, by, S.colorChoices(null)),
      legend: colorLegendOf(by, null)
    });
  }

  /** รายการไฟล์ ใช้ทั้งแท็บไฟล์ของโปรเจกต์และของงานของฉัน */
  function filesList(rows, title, emptyText) {
    var h = '<div class="filesv">';
    h += '<div class="filesv-head">' + I('paperclip', 16) +
      '<b>' + esc(title) + '</b>' +
      '<span class="n">' + L('{n} ไฟล์', { n: rows.length }) + '</span></div>';
    if (!rows.length) return h + '<div class="ovw-empty">' + esc(emptyText) + '</div></div>';
    rows.forEach(function (r) {
      var by = S.user(r.att.addedBy);
      h += '<div class="filesv-row">' + I('paperclip', 14) +
        '<span class="grow">' +
        (r.att.url
          ? '<a href="' + esc(r.att.url) + '" target="_blank" rel="noopener noreferrer">' +
            esc(r.att.name) + '</a>'
          : '<b>' + esc(r.att.name) + '</b>') +
        '<em>' + (by ? esc(by.name) + ' · ' : '') +
        (r.att.addedAt ? esc(fmtWhen(r.att.addedAt)) : L('ไม่ทราบเวลา')) + '</em></span>' +
        '<button class="filesv-task" data-act="open-task" data-id="' + esc(r.task.id) + '">' +
        esc(r.task.name) + '</button></div>';
    });
    return h + '</div>';
  }

  /* ---------- กล่องข้อความ ----------
   * ui = { tab, f: { from, project, mention, toMe, byMe, unread } }
   * การเรียงกับความหนาแน่นจำไว้ต่อคน (personal.inbox) ตัวกรองอยู่แค่ในหน้าจอ */
  var INBOX_TABS = [['activity', 'กิจกรรม'], ['bookmarks', 'บุ๊กมาร์ก'], ['archive', 'เก็บถาวร']];
  var INBOX_FLAGS = [['unread', 'ยังไม่อ่าน'], ['mention', '@พูดถึงฉัน'], ['toMe', 'มอบหมายให้ฉัน'],
                     ['byMe', 'ที่ฉันมอบหมาย']];

  function inboxFilterCount(f) {
    var n = 0;
    Object.keys(f || {}).forEach(function (k) { if (f[k]) n++; });
    return n;
  }

  function inboxView(ui) {
    ui = ui || {};
    var f = ui.f || {};
    var tab = ui.tab || 'activity';
    var pref = S.personalOf().inbox;
    var sort = pref.sort === 'relevance' ? 'relevance' : 'new';
    var dense = !!pref.dense;
    var list = S.inboxList(null, {
      tab: tab, from: f.from, project: f.project, mention: f.mention,
      toMe: f.toMe, byMe: f.byMe, unread: f.unread, sort: sort
    });

    var h = '<div class="inbox-wrap' + (dense ? ' dense' : '') + '">';
    h += '<div class="tb-tabs inbox-tabs">';
    INBOX_TABS.forEach(function (x) {
      h += '<button class="tb-tab' + (tab === x[0] ? ' active' : '') + '" data-act="inbox-tab" data-tab="' +
        x[0] + '">' + (x[0] === 'bookmarks' ? I('bookmark', 13) + ' ' : '') + L(x[1]) + '</button>';
    });
    h += '</div>';

    var nf = inboxFilterCount(f);
    h += '<div class="inbox-tb">' +
      '<button class="vtb-btn' + (nf ? ' on' : '') + '" data-act="inbox-filter">' + I('filter', 14) +
      '<span>' + L('ตัวกรอง') + '</span>' + (nf ? '<span class="vtb-n">' + nf + '</span>' +
        '<span class="vtb-x" data-act="inbox-filter-clear" title="' + L('ล้างตัวกรอง') + '">' +
        I('close', 11) + '</span>' : '') + '</button>' +
      '<button class="vtb-btn" data-act="inbox-sort">' + I('arrowDown', 14) + '<span>' +
      (sort === 'relevance' ? L('เกี่ยวข้องที่สุด') : L('ใหม่สุดก่อน')) + '</span></button>' +
      '<div class="vtb-spacer"></div>' +
      '<div class="segmented inbox-density">' +
      '<button data-act="inbox-dense" data-v="0" class="' + (dense ? '' : 'on') + '">' + L('ละเอียด') + '</button>' +
      '<button data-act="inbox-dense" data-v="1" class="' + (dense ? 'on' : '') + '">' + L('กะทัดรัด') + '</button>' +
      '</div></div>';

    /* ตัวกรองที่เปิดอยู่เป็นป้าย กดกากบาทเอาออกทีละอัน */
    if (nf) {
      h += '<div class="inbox-chips">';
      if (f.from) {
        var fu = S.user(f.from);
        h += '<span class="chip">' + L('จาก {who}', { who: esc(fu ? fu.name : '?') }) +
          '<button data-act="inbox-unfilter" data-k="from" title="' + L('เอาออก') + '">' + I('close', 12) + '</button></span>';
      }
      if (f.project) {
        var fp = S.project(f.project);
        h += '<span class="chip">' + esc(fp ? fp.name : '?') +
          '<button data-act="inbox-unfilter" data-k="project" title="' + L('เอาออก') + '">' + I('close', 12) + '</button></span>';
      }
      INBOX_FLAGS.forEach(function (x) {
        if (!f[x[0]]) return;
        h += '<span class="chip">' + esc(L(x[1])) +
          '<button data-act="inbox-unfilter" data-k="' + x[0] + '" title="' + L('เอาออก') + '">' + I('close', 12) + '</button></span>';
      });
      h += '</div>';
    }

    if (S.isDnd()) {
      var dd = S.dndOf();
      var until = dd.until && Date.parse(dd.until) > Date.now() ? new Date(dd.until) : null;
      h += '<div class="inbox-dnd">' + I('moon', 14) + '<span class="grow">' +
        (until ? esc(L('ห้ามรบกวนถึง {t}', { t: fmtDate(S.iso(until)) + ' ' + fmtTime(until) }))
               : esc(L('อยู่ในช่วงห้ามรบกวนที่ตั้งไว้ {a}–{b}', { a: dd.from, b: dd.to }))) +
        ' · ' + L('ไม่ขึ้นตัวเลขแดงและไม่เด้งเตือน') + '</span>' +
        (until ? '<button class="btn btn-sm" data-act="dnd-off">' + L('เลิกพัก') + '</button>' : '') + '</div>';
    }

    if (!list.length) {
      h += '<div class="empty"><div class="big">' + (tab === 'bookmarks' ? '🔖' : '📭') + '</div>' +
        (nf ? L('ไม่มีรายการที่ตรงกับตัวกรอง')
          : tab === 'archive' ? L('ยังไม่มีรายการที่เก็บไว้')
          : tab === 'bookmarks' ? L('ยังไม่มีรายการที่บุ๊กมาร์กไว้ กดรูปที่คั่นหนังสือบนรายการเพื่อเก็บไว้ดูทีหลัง')
          : L('ไม่มีการแจ้งเตือนใหม่')) + '</div></div>';
      return h;
    }

    list.forEach(function (n) { h += inboxRow(n, dense); });
    return h + '</div>';
  }

  function inboxRow(n, dense) {
    var t = n.taskId ? S.task(n.taskId) : null;
    /* ประกาศของโปรเจกต์ไม่มีงานให้ชี้ ต้องพาไปที่หน้าประกาศแทน */
    var np = (!t && n.projectId) ? S.project(n.projectId) : null;
    var actor = n.actorId ? S.user(n.actorId) : null;
    var h = '<div class="nrow' + (n.read ? '' : ' unread') + (n.bookmarked ? ' marked' : '') +
      '" data-act="open-notif" data-id="' + esc(n.id) + '" data-task="' + esc(n.taskId || '') + '"' +
      (np ? ' data-project="' + esc(np.id) + '"' : '') +
      (n.route ? ' data-route="' + esc(n.route) + '"' : '') + '>';
    h += n.read ? '<span class="nrow-dot"></span>' : '<span class="unread-dot"></span>';
    if (!dense) h += '<span class="nrow-av">' + (actor ? avatar(actor, 'sm')
      : '<span class="nrow-sys">' + I(n.kind === 'due' || n.kind === 'overdue' ? 'calendar' : 'bell', 13) + '</span>') + '</span>';
    var ntxt = n.key ? (n.actorName ? n.actorName + ' ' : '') + L(n.key, n.params || undefined) : n.text;
    var where = t ? t.name : (np ? np.name : (n.route === 'mytasks' ? L('งานของฉัน') : L('(งานถูกลบแล้ว)')));
    h += '<div class="body"><div class="txt">' + esc(ntxt) + '</div>';
    if (!dense) {
      var pj = t ? S.projectsOfTask(S.rootOf(t).id)[0] : null;
      h += '<div class="sub" title="' + esc(fmtExact(n.createdAt)) + '">' +
        '<span class="nsub-where">' + esc(where) + '</span>' +
        (pj ? '<span class="hchip" style="background:' + esc(pj.project.color) + '22;color:' +
          esc(pj.project.color) + '">' + esc(pj.project.name) + '</span>'
          : (t && !t.parentId && S.isPrivate(t.id) ? privateChip() : '')) +
        '<span class="nsub-when">' + esc(fmtWhen(n.createdAt)) + '</span></div>';
    }
    h += '</div>';
    if (dense) h += '<span class="nrow-when" title="' + esc(fmtExact(n.createdAt)) + '">' + esc(fmtWhen(n.createdAt)) + '</span>';
    h += '<span class="acts">' +
      '<button class="btn btn-sm btn-ghost nact-mark' + (n.bookmarked ? ' on' : '') + '" data-act="notif-bookmark" data-id="' +
      esc(n.id) + '" title="' + (n.bookmarked ? L('เอาบุ๊กมาร์กออก') : L('บุ๊กมาร์ก')) + '">' +
      (n.bookmarked ? global.Icons.iconFilled('bookmark', 14) : I('bookmark', 14)) + '</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="notif-read" data-id="' + esc(n.id) + '" title="' +
      (n.read ? L('ทำเป็นยังไม่อ่าน') : L('ทำเป็นอ่านแล้ว')) + '">' + I(n.read ? 'eye' : 'check', 14) + '</button>' +
      (t ? '<button class="btn btn-sm btn-ghost" data-act="notif-followup" data-id="' + esc(t.id) + '" title="' +
        L('สร้างงานติดตามผล') + '">' + I('plus', 14) + '</button>' : '') +
      (n.archived
        ? '<button class="btn btn-sm btn-ghost" data-act="unarchive-notif" data-id="' + esc(n.id) + '" title="' +
          L('ย้ายกลับไปกิจกรรม') + '">' + I('arrowUp', 14) + '</button>'
        : '<button class="btn btn-sm btn-ghost" data-act="archive-notif" data-id="' + esc(n.id) + '" title="' +
          L('เก็บ') + '">' + I('archive', 14) + '</button>') +
      '</span>';
    return h + '</div>';
  }

  /* ---------- ถังขยะ ----------
   * คนทั่วไปเห็นเฉพาะของที่ตัวเองลบ ผู้ดูแลเห็นทั้งหมด (ตัดสินที่ S.trashItems) */
  var TRASH_KIND = {
    task:    ['งาน', 'checkCircle'],
    project: ['โปรเจกต์', 'grid'],
    field:   ['ฟิลด์', 'hash']
  };

  function trashView(projectId) {
    var list = S.trashItems(projectId || null);
    var h = '<div class="list-wrap trash-wrap">';
    var tp = projectId ? S.project(projectId) : null;
    if (projectId) {
      h += '<div class="trash-filter">' + I('filter', 13) + '<span>' +
        L('เฉพาะของที่ลบจากโปรเจกต์ {p}', { p: '<b>' + esc(tp ? tp.name : '?') + '</b>' }) + '</span>' +
        '<button class="as-link" data-act="go" data-route="trash">' + L('ดูทั้งหมด') + '</button></div>';
    }
    h += '<p class="trash-note">' + I('trash', 14) + '<span>' +
      L('ของที่ลบจะพักอยู่ที่นี่ {n} วัน แล้วถูกลบถาวรเอง', { n: S.TRASH_DAYS }) + ' ' +
      (S.isAdmin() ? L('ผู้ดูแลเห็นของที่ทุกคนลบ') : L('คุณเห็นเฉพาะของที่ตัวเองลบ')) + '</span></p>';
    if (!list.length) {
      return h + '<div class="empty"><div class="big">🗑️</div>' + L('ถังขยะว่าง') + '</div></div>';
    }
    list.forEach(function (x) {
      var k = TRASH_KIND[x.kind] || TRASH_KIND.task;
      var p = x.projectId && x.kind !== 'project' ? S.project(x.projectId) : null;
      var who = S.user(x.deletedBy);
      var extra = '';
      if (x.kind === 'task' && x.data.tasks.length > 1) {
        extra = L('พร้อมงานย่อย {n} งาน', { n: x.data.tasks.length - 1 });
      } else if (x.kind === 'project') {
        extra = L('พร้อม {n} งาน', { n: x.data.bundle.tasks.filter(function (t) { return !t.parentId; }).length });
      } else if (x.kind === 'field' && x.data.values.length) {
        extra = L('ค่าที่กรอกไว้ {n} ช่อง', { n: x.data.values.length });
      }
      h += '<div class="trash-row">' +
        '<span class="trash-ic">' + I(k[1], 16) + '</span>' +
        '<div class="grow"><div class="nm">' + esc(x.name) + '</div><div class="sub">' +
        esc(L(k[0])) + (p ? ' · ' + esc(p.name) : '') + (extra ? ' · ' + esc(extra) : '') + '<br>' +
        L('ลบโดย {who}', { who: esc(who ? who.name : '?') }) + ' · ' +
        '<span title="' + esc(fmtExact(x.deletedAt)) + '">' + esc(fmtWhen(x.deletedAt)) + '</span> · ' +
        L('ลบถาวร {d}', { d: esc(fmtDate(S.trashExpires(x))) }) + '</div></div>' +
        '<div class="trash-acts"><button class="btn btn-sm" data-act="trash-restore" data-id="' + esc(x.id) + '">' +
        L('กู้คืน') + '</button>' +
        '<button class="btn btn-sm btn-ghost trash-purge" data-act="trash-purge" data-id="' + esc(x.id) + '">' +
        L('ลบถาวร') + '</button></div></div>';
    });
    return h + '</div>';
  }

  /* ---------- search ---------- */

  /** วิธีใช้ตัวดำเนินการค้นหา — ใช้ทั้งหน้าว่างและปุ่ม ? */
  function searchHelp() {
    var rows = [['"ส่งของ ลาซาด้า"', L('ตรงทั้งวลี')], ['สบู่ | แชมพู', L('คำใดคำหนึ่ง (หรือพิมพ์ OR)')],
      ['สบู่ -ตัวอย่าง', L('ไม่เอางานที่มีคำนี้')], ['launch*', L('คำที่ขึ้นต้นด้วย')],
      ['(สบู่ | แชมพู) โปรโมชั่น', L('จัดกลุ่มด้วยวงเล็บ')], ['REQ-12', L('รหัสงาน')]];
    return '<div class="adv-help">' + rows.map(function (r) {
      return '<div><code>' + esc(r[0]) + '</code><span>' + esc(r[1]) + '</span></div>';
    }).join('') + '</div>';
  }

  /**
   * หน้าค้นหา (ค้นหาขั้นสูง) — ช่องค้นหา แผงเงื่อนไข (main.js วาดส่งมาใน opts.panel)
   * ผลลัพธ์เป็นรายการหรือปฏิทิน
   * opts = { conds, mode: list|calendar, anchor, panel, calMode }
   */
  function searchView(q, sel, opts) {
    opts = opts || {};
    var conds = opts.conds || [];
    var h = '<div class="adv">' + (opts.panel || '');
    if (!String(q || '').trim() && !conds.length) {
      return h + '<div class="empty"><div class="big">🔍</div>' +
        L('พิมพ์คำค้น หรือเพิ่มเงื่อนไขเพื่อค้นหางานทุกโปรเจกต์ที่คุณเห็น') + searchHelp() + '</div></div>';
    }
    var res = S.searchAdv({ q: q, conds: conds });
    if (opts.mode === 'calendar') {
      var dated = res.filter(function (t) { return t.dueOn || t.startOn; });
      var un = res.filter(function (t) { return !t.dueOn && !t.startOn; });
      return h + calBoard({
        scope: 'search', mode: opts.calMode || 'month', anchor: opts.anchor,
        tasks: dated, unscheduled: un.slice(0, 80), unscheduledMore: Math.max(0, un.length - 80),
        sideTitle: L('ไม่มีวัน'), addable: false
      }) + '</div>';
    }
    if (!res.length) {
      return h + '<div class="empty"><div class="big">🔍</div>' +
        (q ? L('ไม่พบงานที่ตรงกับ “') + esc(q) + '”' : L('ไม่พบงานที่ตรงเงื่อนไข')) + '</div></div>';
    }
    h += '<div class="list-wrap">';
    h += '<div class="bucket-head">' + L('พบ {n} รายการ', { n: '<span class="n">' + res.length + '</span>' }) +
      (res.length >= 300 ? ' <span class="adv-cap">' + L('(แสดง 300 รายการแรก)') + '</span>' : '') + '</div>';
    res.forEach(function (t) {
      h += taskRow(t, { showProject: true, selectable: true, selected: !!sel[t.id] });
    });
    h += '</div></div>';
    return h;
  }

  /* ---------- หน้าแท็ก #/tag/<ชื่อ> ---------- */
  function tagView(name, sel) {
    var list = S.tagTasks(name);
    var open = list.filter(function (t) { return !t.completed; });
    var done = list.filter(function (t) { return t.completed; });
    var h = '<div class="list-wrap tagv">';
    h += '<div class="tagv-head"><span class="chip tag">#' + esc(name) + '</span>' +
      '<span class="tagv-n">' + L('{n} งาน', { n: list.length }) + '</span><span class="grow"></span>' +
      (S.can('structure') ? '<button class="btn btn-sm" data-act="tag-rename" data-tag="' + esc(name) + '">' +
        I('pencil', 13) + ' ' + L('เปลี่ยนชื่อแท็ก') + '</button>' +
        '<button class="btn btn-sm btn-ghost danger" data-act="tag-delete" data-tag="' + esc(name) + '">' +
        I('trash', 13) + ' ' + L('ลบแท็ก') + '</button>' : '') + '</div>';
    if (!list.length) return h + '<div class="empty"><div class="big">🏷️</div>' + L('ไม่มีงานที่มีแท็กนี้') + '</div></div>';
    open.forEach(function (t) { h += taskRow(t, { showProject: true, selectable: true, selected: !!sel[t.id] }); });
    if (done.length) {
      h += '<div class="bucket-head">' + L('ทำเสร็จแล้ว') + ' <span class="n">' + done.length + '</span></div>';
      done.forEach(function (t) { h += taskRow(t, { showProject: true, selectable: true, selected: !!sel[t.id] }); });
    }
    return h + '</div>';
  }

  /* ---------- โปรเจกต์ปิดที่ยังไม่มีสิทธิ์ (เปิดจากลิงก์) ---------- */
  function noAccessView(projectId) {
    var p = S.project(projectId);
    var pend = p ? S.pendingRequest(projectId) : null;
    var h = '<div class="empty noaccess"><div class="big">🔒</div>';
    if (!p) return h + L('ไม่พบโปรเจกต์นี้') + '</div>';
    h += '<p><b>' + esc(p.name) + '</b></p><p>' + L('นี่คือโปรเจกต์ปิด คุณยังไม่ได้เป็นสมาชิก') + '</p>';
    if (pend && S.task(pend.taskId)) {
      h += '<p class="noaccess-sent">' + I('check', 13) + ' ' +
        L('ส่งคำขอแล้วเมื่อ {when} รอเจ้าของโปรเจกต์ตอบ', { when: esc(fmtWhen(pend.at)) }) + '</p>';
    } else if (S.isActive()) {
      h += '<textarea id="reqNote" class="inp" rows="2" placeholder="' + esc(L('บอกเหตุผลสั้น ๆ (ไม่บังคับ)')) + '"></textarea>' +
        '<button class="btn btn-primary" data-act="request-access" data-id="' + esc(p.id) + '">' +
        L('ขอสิทธิ์เข้าถึง') + '</button>';
    }
    return h + '</div>';
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
    h += '<button data-act="bulk-more">' + L('เพิ่มเติม') + ' ' + I('chevronDown', 12) + '</button>';
    h += '<button data-act="bulk-delete">' + L('ลบ') + '</button>';
    h += '<button data-act="bulk-clear">' + L('ยกเลิก') + '</button>';
    /* ผลรวมของฟิลด์ตัวเลขในงานที่เลือก (ฟิลด์ของโปรเจกต์ที่งานอยู่) */
    var tasks = ids.map(S.task).filter(Boolean);
    var nums = {}, order = [];
    tasks.forEach(function (t) {
      S.projectsOfTask(S.rootOf(t).id).forEach(function (x) {
        (x.project.fields || []).forEach(function (f) {
          if (f.type !== 'number' || nums[f.id]) return;
          nums[f.id] = f;
          order.push(f);
        });
      });
    });
    order.slice(0, 3).forEach(function (f) {
      var sum = S.footValue(tasks, f.id, 'sum');
      if (sum === null) return;
      h += '<span class="bulk-sum" title="' + esc(L('ผลรวมของงานที่เลือก')) + '">Σ ' + esc(f.name) + ' ' +
        esc(S.formatNumber(f, sum)) + '</span>';
    });
    h += '</div>';
    return h;
  }

  /* ---------- drawer ---------- */

  /* ข้อความมีรูปแบบ (ความเห็น รายละเอียด ประกาศ) อยู่ที่ app/richtext.js ใช้ร่วมกับตัวแก้ไข */

  /* แถวอีโมจิใต้ความเห็น — โชว์เฉพาะอันที่มีคนกดแล้ว บวกปุ่มเพิ่ม
   * ถ้าโชว์ครบทุกอีโมจิตลอดเวลา ทุกความเห็นจะมีแถบไอคอนหกอันห้อยอยู่จนรก */
  /** ช่วงวันของงานแบบสั้น ใช้ต่อท้ายชื่องานในลำดับก่อนหลัง
   * ถ้าไม่บอกวัน คนต้องกดเข้าไปดูทีละงานว่าที่รออยู่จะเสร็จเมื่อไหร่ */
  function depWhen(t) {
    if (!t.startOn && !t.dueOn) return '';
    var a = t.startOn, b = t.dueOn;
    var txt = (a && b) ? (a === b ? fmtDate(b) : fmtDate(a) + ' – ' + fmtDate(b))
                       : fmtDate(b || a);
    return '<span class="dep-when' + dueClass(t.dueOn, t.completed) + '">' + esc(txt) + '</span>';
  }

  function reactionRow(s) {
    var rx = s.reactions || {};
    var meId = S.db.currentUserId;
    var h = '<div class="rx">';
    Object.keys(rx).forEach(function (em) {
      var who = rx[em] || [];
      if (!who.length) return;
      var mine = who.indexOf(meId) >= 0;
      var names = who.map(function (u) {
        var x = S.user(u); return x ? x.name : '?';
      }).join(', ');
      h += '<button class="rx-chip' + (mine ? ' on' : '') + '" data-act="react" data-story="' +
        esc(s.id) + '" data-emoji="' + esc(em) + '" title="' + esc(names) + '">' +
        em + '<span>' + who.length + '</span></button>';
    });
    h += '<button class="rx-add" data-act="react-menu" data-story="' + esc(s.id) +
      '" title="' + L('ตอบรับด้วยอีโมจิ') + '">' + I('heart', 13) + '</button>';
    return h + '</div>';
  }

  function richText(text) { return global.RichText.toHtml(text); }

  /** ช่องพิมพ์ความเห็น/คำตอบ/แก้ความเห็น — ตัวแก้ไขแบบเห็นภาพพร้อมแถบเครื่องมือย่อ
   *  key บอกว่าเป็นช่องไหน (c: งาน, r: เธรด, e: แก้ความเห็น) ใช้ทั้งเก็บร่างและคืนโฟกัส */
  function composerHtml(key, taskId, placeholder, md, domId) {
    return '<div class="rte-wrap rte-mini">' + global.RichText.toolbar(true) +
      '<div class="rte rte-compose" contenteditable="true" spellcheck="true"' +
      (domId ? ' id="' + esc(domId) + '"' : '') + ' data-key="' + esc(key) +
      '" data-id="' + esc(taskId) + '" data-placeholder="' + esc(placeholder) + '">' +
      global.RichText.toHtml(md || '', { editable: true }) + '</div></div>';
  }

  function drawer(taskId, opts) {
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
      /* ขยายเต็มจอ สำหรับงานที่มีรายละเอียดยาวหรือคุยกันหลายสิบความเห็น
       * แผงข้างกว้างคงที่ อ่านสรุปประชุมที่มีหัวข้อย่อยสามชั้นแล้วตัดบรรทัดถี่มาก */
      '<button class="btn btn-sm btn-ghost" data-act="toggle-wide" title="' +
      (opts && opts.wide ? L('ย่อกลับ') : L('ขยายเต็มจอ')) + '">' +
      I(opts && opts.wide ? 'arrowRight' : 'arrowLeft', 14) + '</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="task-menu" data-id="' + esc(t.id) +
      '" title="' + L('เมนู') + '">' + I('more') + '</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="close-drawer" title="' + L('ปิด') + '">' + I('close', 13) + '</button></div>';

    h += '<div class="dw-body">';

    /* งานย่อยบอกว่าเป็นของงานไหน กดกลับขึ้นไปที่งานแม่ได้ */
    var par = t.parentId ? S.task(t.parentId) : null;
    if (par) {
      h += '<button class="dw-parent" data-act="open-task" data-id="' + esc(par.id) + '">' +
        I('subtask', 12) + '<span>' + L('งานย่อยของ') + '</span><b>' + esc(par.name) + '</b></button>';
    }

    h += '<textarea class="dw-title' + (t.completed ? ' done' : '') +
      '" data-act="edit-title" rows="1">' + esc(t.name) + '</textarea>';

    /* 2c — งานคำขอเข้าโปรเจกต์ปิด เจ้าของ/ผู้ดูแลตอบได้จากตรงนี้เลย */
    var areq = S.accessRequestOf(t.id);
    if (areq && S.canAnswerAccess(areq.project.id)) {
      var ru = S.user(areq.userId);
      h += '<div class="dw-access">' + I('lock', 14) + '<span class="grow">' +
        L('{who} ขอเข้าโปรเจกต์ {p}', { who: '<b>' + esc(ru ? ru.name : '?') + '</b>', p: '<b>' + esc(areq.project.name) + '</b>' }) +
        '</span><select class="inp" id="arAccess">' + S.PROJECT_ACCESS.filter(function (x) { return x.id !== 'admin'; })
          .map(function (x) { return '<option value="' + x.id + '">' + esc(L(x.label)) + '</option>'; }).join('') + '</select>' +
        '<button class="btn btn-sm btn-primary" data-act="access-grant" data-id="' + esc(areq.project.id) +
        '" data-user="' + esc(areq.userId) + '">' + L('ให้สิทธิ์') + '</button>' +
        '<button class="btn btn-sm" data-act="access-deny" data-id="' + esc(areq.project.id) +
        '" data-user="' + esc(areq.userId) + '">' + L('ปฏิเสธ') + '</button></div>';
    }

    var blockers = S.blockers(t.id);
    if (blockers.length && !t.completed) {
      h += '<div class="dw-banner">' + I('blocked') + ' ' + L('รออยู่:') + ' ' +
        blockers.map(function (b) { return esc(b.name); }).join(', ') + '</div>';
    }

    // ชนิดงาน
    h += '<div class="fld"><label>' + L('ชนิดงาน') + '</label><div class="val"><select class="inp" ' +
      'data-act="edit-type">';
    /* 3b — ชนิดในตัว + ชนิดกำหนดเองของโปรเจกต์ที่งานอยู่ */
    var curType = t.ctype || t.type;
    S.typeChoicesFor(t.id).forEach(function (x) {
      h += '<option value="' + esc(x.id) + '"' + (curType === x.id ? ' selected' : '') + '>' +
        esc(x.icon) + ' ' + esc(x.custom ? x.label : L(x.label)) + '</option>';
    });
    h += '</select></div></div>';
    var cty = S.typeOf(t);
    if (cty) {
      h += '<div class="fld"><label>' + L('สถานะ') + '</label><div class="val fld-inline">' + statusPill(t) +
        '<select class="inp" data-act="edit-cstatus" style="flex:1 1 140px">';
      cty.statuses.forEach(function (s) {
        h += '<option value="' + esc(s.id) + '"' + (t.cstatus === s.id ? ' selected' : '') + '>' +
          esc(s.name) + (s.done ? ' ✓' : '') + '</option>';
      });
      h += '</select></div></div>';
    }

    // สถานะอนุมัติ
    /* ผู้อนุมัติคือผู้รับผิดชอบงาน — ปุ่มตัดสินใจกดได้เฉพาะเขา (หรือคนที่แก้โปรเจกต์ได้)
     * คนอื่นยังเห็นสถานะและปุ่ม แต่กดไม่ได้ พร้อมบอกเหตุผล จะได้ไม่งงว่าปุ่มหายไปไหน */
    if (t.type === 'approval') {
      var a = approvalState(t.approval);
      var mayApprove = S.canApprove(t.id);
      var ACTS = [['approved', 'อนุมัติ', 'check'], ['changes', 'ขอแก้ไข', 'pencil'],
                  ['rejected', 'ปฏิเสธ', 'close']];
      h += '<div class="fld"><label>' + L('การอนุมัติ') + '</label><div class="val">' +
        '<div class="fld-inline appr-row"><span class="approval-pill" style="background:' + a.color +
        '22;color:' + a.color + '">' + esc(L(a.label)) + '</span>';
      ACTS.forEach(function (x) {
        if (x[0] === t.approval) return;
        h += '<button class="btn btn-sm appr-btn appr-' + x[0] + '" data-act="set-approval" data-id="' +
          esc(t.id) + '" data-v="' + x[0] + '"' + (mayApprove ? '' : ' disabled') + '>' +
          I(x[2], 12) + ' ' + esc(L(x[1])) + '</button>';
      });
      if (t.approval !== 'pending') {
        h += '<button class="btn btn-sm btn-ghost" data-act="set-approval" data-id="' + esc(t.id) +
          '" data-v="pending"' + (mayApprove ? '' : ' disabled') + '>' + esc(L('กลับไปรออนุมัติ')) + '</button>';
      }
      h += '</div>' + (mayApprove ? '' : '<div class="fld-hint">' +
        L('ผู้อนุมัติคือผู้รับผิดชอบงานนี้ หรือคนที่แก้ไขโปรเจกต์ได้') + '</div>') + '</div></div>';
    }

    h += '<div class="fld"><label>' + (t.type === 'approval' ? L('ผู้อนุมัติ') : L('ผู้รับผิดชอบ')) +
      '</label><div class="val picker">' +
      '<button class="picker-btn" data-act="pick-assignee">' + avatar(u) +
      '<span>' + esc(u ? u.name : L('ยังไม่มอบหมาย')) + '</span></button></div></div>';

    /* ---- ฟิลด์ที่ซ่อนไว้เป็นค่ามาตรฐาน ----
     *
     * งานส่วนใหญ่ไม่ได้ตั้งเวลา ไม่ได้ทำซ้ำ ไม่มีผู้ติดตามนอกจากคนสร้าง
     * และไม่ได้กรอกฟิลด์กำหนดเองของโปรเจกต์
     * ถ้าโชว์ทั้งหมดตลอดเวลา แผงจะยาวขึ้นสี่แถวด้วยช่องว่างเปล่า
     * ต้องเลื่อนผ่านของที่ไม่ได้ใช้ก่อนถึงจะเจอรายละเอียดกับความเห็น
     *
     * ซ่อนไว้ก่อน แต่โผล่เองทันทีที่มีค่าจริง เพราะตอนนั้นมันไม่ใช่ช่องว่างแล้ว
     * ไม่ได้ตัดทิ้ง เพราะยังต้องตั้งงานประจำและคุมคนที่จะได้รับแจ้งเตือนได้อยู่
     */
    var more = !!(opts && opts.moreFields);
    /* เวลาเริ่มกับเวลาส่งโผล่คู่กัน — งานที่มีเวลาส่งมักมีเวลาเริ่ม (ประชุม ถ่ายทำ ไลฟ์) */
    var showTime  = more || !!t.dueTime || !!t.startTime;
    var showRecur = more || !!t.recur;

    h += '<div class="fld"><label>' + L('วันเริ่ม') + '</label><div class="val fld-inline">' +
      '<input class="inp" type="date" data-act="edit-start" value="' + esc(t.startOn || '') +
      '" style="flex:1">' +
      (showTime
        ? '<input class="inp" type="time" data-act="edit-starttime" value="' + esc(t.startTime || '') +
          '" style="flex:0 0 110px" title="' + L('เวลาเริ่ม (ไม่บังคับ)') + '">'
        : '') + '</div></div>';

    h += '<div class="fld"><label>' + L('กำหนดส่ง') + '</label><div class="val fld-inline">' +
      '<input class="inp" type="date" data-act="edit-due" value="' + esc(t.dueOn || '') +
      '" style="flex:1">' +
      (showTime
        ? '<input class="inp" type="time" data-act="edit-duetime" value="' + esc(t.dueTime || '') +
          '" style="flex:0 0 110px" title="' + L('เวลา (ไม่บังคับ') + ')">'
        : '') + '</div></div>';

    if (showRecur) {
      var rc = t.recur;
      h += '<div class="fld"><label>' + L('ทำซ้ำ') + '</label><div class="val">' +
        '<div class="fld-inline"><select class="inp" data-act="edit-recur" style="flex:1 1 150px"><option value="">' +
        L('ไม่ทำซ้ำ') + '</option>';
      S.RECUR_FREQ.forEach(function (x) {
        h += '<option value="' + x.id + '"' +
          (rc && rc.freq === x.id ? ' selected' : '') + '>' + esc(L(x.label)) + '</option>';
      });
      h += '</select>';
      if (rc) {
        var unitL = { daily: 'วัน', weekly: 'สัปดาห์', monthly: 'เดือน', yearly: 'ปี', after: 'วัน' }[rc.freq];
        h += '<span class="recur-every">' + (rc.freq === 'after' ? '' : L('ทุก')) + '</span>' +
          '<input class="inp" type="number" min="1" max="365" data-act="edit-recur-n" value="' +
          (rc.interval || 1) + '" style="flex:0 0 64px" title="' + L('ทุกกี่รอบ') + '">' +
          '<span class="recur-every">' + L(unitL) + '</span>';
      }
      h += '</div>';
      if (rc && rc.freq === 'weekly') {
        /* เลือกได้หลายวัน ไม่เลือกเลย = วันเดียวกับกำหนดส่งเดิม */
        var dn = DOW(), ws = weekStart();
        h += '<div class="recur-days">';
        for (var di = 0; di < 7; di++) {
          var dd = (di + ws) % 7;
          var onD = (rc.days || []).indexOf(dd) >= 0;
          h += '<button class="recur-day' + (onD ? ' on' : '') + '" data-act="recur-day" data-d="' + dd +
            '" aria-pressed="' + onD + '">' + esc(dn[dd]) + '</button>';
        }
        h += '</div>';
      }
      if (rc) {
        var nx = S.nextOccurrence(t);
        h += '<div class="fld-hint recur-hint">' +
          (rc.freq === 'after'
            ? L('ทำเสร็จแล้วจะสร้างรอบใหม่ ครบกำหนดอีก {n} วันนับจากวันที่ทำเสร็จ', { n: rc.interval || 1 })
            : L('รอบถัดไปครบกำหนด {d}', { d: fmtDate(nx) })) +
          '<button class="as-link" data-act="stop-recur" data-id="' + esc(t.id) + '">' +
          L('หยุดทำซ้ำ') + '</button></div>';
      }
      h += '</div></div>';
    }

    h += '<div class="fld"><label>' + L('ความสำคัญ') + '</label><div class="val picker">' +
      '<button class="picker-btn" data-act="pick-priority">' +
      '<span class="swatch" style="width:9px;height:9px;border-radius:50%;display:inline-block;background:' +
      pr.color + '"></span><span>' + L(pr.label) + '</span></button></div></div>';

    // โปรเจกต์ (multi-homing)
    h += '<div class="fld"><label>' + L('โปรเจกต์') + '</label><div class="val" style="padding-top:5px">';
    /* งานส่วนตัว — บอกให้ชัดว่าใครเห็นบ้าง และทางออกคือเพิ่มเข้าโปรเจกต์ */
    var priv = S.isPrivate(t.id);
    if (priv && !t.parentId) {
      h += '<div class="dw-private">' + privateChip() + '<span>' +
        L('เห็นเฉพาะคนสร้าง ผู้รับผิดชอบ และผู้ติดตาม') + '</span></div>' +
        '<button class="btn btn-sm" data-act="make-public" data-id="' + esc(t.id) + '">' +
        I('users', 13) + ' ' + L('ทำให้เป็นสาธารณะ…') + '</button></div></div>';
    } else if (priv) {
      h += '<div class="dw-private">' + privateChip() + '<span>' +
        L('ส่วนตัวตามงานหลัก') + '</span></div></div></div>';
    }
    if (!priv) homes.forEach(function (x) {
      var sec = S.section(x.project.id, x.membership.sectionId);
      h += '<span class="chip" style="margin:0 5px 5px 0"><span class="swatch" style="background:' +
        esc(x.project.color) + '"></span>' + esc(x.project.name) +
        /* 3a — กดชื่อคอลัมน์เพื่อย้าย (ผ่าน S.moveTask อัตโนมัติ "ย้ายเข้าคอลัมน์" จึงทำงาน) */
        (sec ? ' · <button class="chip-sec" data-act="dw-sec" data-id="' + esc(t.id) + '" data-project="' +
          esc(x.project.id) + '" title="' + esc(L('ย้ายไปคอลัมน์อื่น')) + '">' + esc(sec.name) + ' ' +
          I('chevronDown', 10) + '</button>' : '') +
        (homes.length > 1 ? '<button data-act="unhome" data-id="' + esc(t.id) +
          '" data-project="' + esc(x.project.id) + '" title="' +
          L('เอางานออกจากโปรเจกต์นี้') + '">' + I('close', 13) + '</button>' : '') + '</span>';
    });
    if (!priv) {
      h += '<button class="btn btn-sm btn-ghost" data-act="add-home" data-id="' + esc(t.id) +
        '">+ ' + L('เพิ่มโปรเจกต์') + '</button></div></div>';
    }

    // แท็ก
    h += '<div class="fld"><label>' + L('แท็ก') + '</label><div class="val" style="padding-top:5px">';
    t.tags.forEach(function (tg) {
      h += '<span class="chip tag" style="margin:0 5px 5px 0"><button class="tag-go" data-act="go-tag" data-tag="' +
        esc(tg) + '" title="' + L('ดูงานทั้งหมดที่มีแท็กนี้') + '">' + esc(tg) + '</button>' +
        '<button data-act="remove-tag" data-id="' + esc(t.id) + '" data-tag="' + esc(tg) +
        '" title="' + L('เอาแท็กออก') + '">' + I('close', 13) + '</button></span>';
    });
    h += '<button class="btn btn-sm btn-ghost" data-act="add-tag" data-id="' + esc(t.id) +
      '">+ ' + L('แท็ก') + '</button></div></div>';

    /* ---- ฟิลด์กำหนดเอง แยกกลุ่มตามโปรเจกต์ ----
     *
     * ฟิลด์เป็นของโปรเจกต์ ไม่ใช่ของงาน งานหนึ่งอยู่ได้หลายโปรเจกต์
     * ที่เคยเอามากองรวมกันแล้วตัดชื่อซ้ำทิ้ง ทำให้อ่านไม่ออกว่าช่องไหนของใคร
     * และถ้าสองโปรเจกต์บังเอิญตั้งชื่อฟิลด์เหมือนกัน จะเห็นแค่อันเดียว
     * ส่วนอีกอันหายไปเงียบ ๆ ทั้งที่เป็นคนละช่องคนละค่า
     *
     * แยกเป็นบล็อกใต้ชื่อโปรเจกต์แบบเดียวกับ Asana จึงตอบได้ว่าค่านี้อยู่ในโปรเจกต์ไหน
     * ชุดฟิลด์ในแต่ละบล็อกคือชุดเดียวกับคอลัมน์ในหน้ารายการของโปรเจกต์นั้น
     */
    function fieldInput(f) {
      var v = S.fieldValue(t.id, f.id);
      var s = '';
      if (f.type === 'id') {
        return '<span class="fld-code">' + (v == null ? '—' : esc(S.fieldText(f, v))) + '</span>' +
          (v == null ? '' : '<button class="as-link" data-act="copy-code" data-v="' + esc(S.fieldText(f, v)) +
            '">' + L('คัดลอก') + '</button>');
      }
      if (f.type === 'select') {
        s += '<select class="inp" data-act="edit-field" data-field="' + esc(f.id) +
          '"><option value="">—</option>';
        /* ตัวเลือกเก็บเป็น { name, color } มาตั้งแต่ v4 แล้ว
         * เดิมเอาทั้งก้อนไปต่อสตริงจึงขึ้นเป็น [object Object] และเลือกอะไรไม่ได้เลย */
        f.options.forEach(function (o) {
          s += '<option value="' + esc(o.name) + '"' + (v === o.name ? ' selected' : '') + '>' +
            esc(o.name) + '</option>';
        });
        s += '</select>';
      } else if (f.type === 'multi') {
        /* หลายตัวเลือก — เดิมตกไปเป็นช่องข้อความ พิมพ์อะไรลงไปก็กลายเป็นสตริงเดี่ยว
         * ทำเป็นป้ายสีแบบเดียวกับในตาราง กดแล้วเปิดเมนูติ๊กเลือกได้หลายอัน */
        var chosen = [].concat(v || []);
        s += '<button class="fld-multi" data-act="dw-field-multi" data-id="' + esc(t.id) +
          '" data-field="' + esc(f.id) + '">';
        f.options.forEach(function (o) {
          if (chosen.indexOf(o.name) < 0) return;
          s += '<span class="opt-pill" style="background:' + esc(o.color) + '22;color:' +
            esc(o.color) + '">' + esc(o.name) + '</span>';
        });
        if (!chosen.length) s += '<span class="fld-multi-empty">—</span>';
        s += '</button>';
      } else if (f.type === 'person') {
        s += '<select class="inp" data-act="edit-field" data-field="' + esc(f.id) +
          '"><option value="">—</option>';
        S.db.users.forEach(function (usr) {
          s += '<option value="' + esc(usr.id) + '"' + (v === usr.id ? ' selected' : '') +
            '>' + esc(usr.name) + '</option>';
        });
        s += '</select>';
      } else if (f.type === 'number') {
        /* ช่องกรอกเป็นตัวเลขล้วน รูปแบบที่ตั้งไว้ (฿ % หน่วย) โชว์ไว้ข้าง ๆ */
        var dec = f.format && f.format.decimals != null ? f.format.decimals : null;
        s += '<div class="fld-inline"><input class="inp" type="number" step="' +
          (dec == null ? 'any' : (dec ? (1 / Math.pow(10, dec)).toFixed(dec) : '1')) +
          '" data-act="edit-field" data-field="' + esc(f.id) + '" value="' + esc(v == null ? '' : v) +
          '" style="flex:1">' + (v !== null && v !== undefined && v !== '' && f.format
            ? '<span class="num-fmt">' + esc(S.formatNumber(f, v)) + '</span>' : '') + '</div>';
      } else {
        var typ = f.type === 'date' ? 'date' : 'text';
        s += '<input class="inp" type="' + typ + '" data-act="edit-field" data-field="' +
          esc(f.id) + '" value="' + esc(v == null ? '' : v) + '">';
      }
      return s;
    }

    homes.forEach(function (x) {
      if (!x.project.fields.length) return;
      /* บล็อกฟิลด์ของโปรเจกต์โผล่เมื่อมีค่ากรอกไว้แล้วอย่างน้อยหนึ่งช่อง
       * โปรเจกต์ที่ตั้งฟิลด์ไว้แต่ยังไม่มีใครกรอก จะเป็นกล่องที่มีแต่ขีดกลาง
       * ซึ่งกินที่ครึ่งหน้าจอโดยไม่ได้บอกอะไร กดแสดงฟิลด์เพิ่มเติมแล้วค่อยขึ้น */
      var hasVal = x.project.fields.some(function (f) {
        var v = S.fieldValue(t.id, f.id);
        return v !== null && v !== undefined && v !== '';
      });
      if (!more && !hasVal) return;
      var sec2 = S.section(x.project.id, x.membership.sectionId);
      h += '<div class="dw-pfields"><div class="dw-phead">' +
        '<span class="swatch" style="background:' + esc(x.project.color) + '"></span>' +
        '<b>' + esc(x.project.name) + '</b>' +
        (sec2 ? '<em>' + esc(sec2.name) + '</em>' : '') + '</div>';
      x.project.fields.forEach(function (f) {
        h += '<div class="fld"><label' + (f.desc ? ' title="' + esc(f.desc) + '"' : '') + '>' + esc(f.name) +
          (f.desc ? ' <span class="fld-q">?</span>' : '') + '</label>' +
          '<div class="val">' + fieldInput(f) + '</div></div>';
      });
      h += '</div>';
    });

    /* ปุ่มกางฟิลด์ที่ซ่อนไว้ นับให้ด้วยว่ามีกี่อัน
     * ถ้าไม่มีอะไรถูกซ่อนก็ไม่ต้องมีปุ่ม จะได้ไม่มีปุ่มที่กดแล้วไม่มีอะไรเปลี่ยน */
    var hiddenFields = 0;
    if (!more) {
      if (!t.dueTime && !t.startTime) hiddenFields++;
      if (!t.recur) hiddenFields++;
      if (t.followers.length <= 1) hiddenFields++;
      homes.forEach(function (x) {
        if (!x.project.fields.length) return;
        var hv = x.project.fields.some(function (f) {
          var v = S.fieldValue(t.id, f.id);
          return v !== null && v !== undefined && v !== '';
        });
        if (!hv) hiddenFields++;
      });
    }
    if (hiddenFields) {
      h += '<button class="dw-morefields" data-act="dw-more-fields">' +
        I('chevronDown', 13) + L('แสดงฟิลด์เพิ่มเติม ({n})', { n: hiddenFields }) + '</button>';
    } else if (more) {
      h += '<button class="dw-morefields" data-act="dw-more-fields">' +
        I('chevronRight', 13) + L('ซ่อนฟิลด์ที่ไม่ได้ใช้') + '</button>';
    }

    // รายละเอียด
    h += '<div class="dw-sec-title">' + L('รายละเอียด') + '</div>';
    /* แก้ได้ในที่เลย ไม่มีโหมดดู/โหมดแก้แยกกัน แบบเดียวกับ Asana
     * บันทึกตอนออกจากช่อง (main.js) ส่วนคนที่แก้งานนี้ไม่ได้เห็นเป็นข้อความอ่านอย่างเดียว */
    if (S.can('write', t.id)) {
      h += '<div class="rte-wrap rte-notes-wrap">' + global.RichText.toolbar(false) +
        '<div class="rte rte-notes" contenteditable="true" spellcheck="true" data-save="notes" data-key="n:' +
        esc(t.id) + '" data-id="' + esc(t.id) + '" data-placeholder="' +
        esc(L('เพิ่มรายละเอียด… พิมพ์ @ เพื่ออ้างถึงคน งาน หรือโปรเจกต์')) + '">' +
        global.RichText.toHtml(t.notes, { editable: true }) + '</div></div>';
    } else {
      h += '<div class="rte rte-notes ro">' + (t.notes && t.notes.trim()
        ? richText(t.notes)
        : '<span class="rte-none">' + L('ไม่มีรายละเอียด') + '</span>') + '</div>';
    }

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
        '" style="cursor:pointer">' + esc(b.name) + '</span>' + depWhen(b) +
        '<select class="dep-sel" data-act="edit-dep-type" data-id="' + esc(t.id) +
        '" data-blocker="' + esc(b.id) + '">' +
        S.DEP_TYPES.map(function (d) {
          return '<option value="' + d.id + '"' + (d.id === x.type ? ' selected' : '') +
            '>' + esc(L(d.label)) + '</option>';
        }).join('') + '</select>' +
        '<button class="btn btn-sm btn-ghost" data-act="remove-dependency" data-id="' + esc(t.id) +
        '" data-blocker="' + esc(b.id) + '" title="' + L('เอาลำดับก่อนหลังนี้ออก') +
        '">' + I('close', 13) + '</button></div>';
    });
    blocks.forEach(function (b) {
      h += '<div class="dep-row"><span class="dot" style="background:var(--fg-faint)"></span>' +
        '<span style="font-size:12px;color:var(--fg-faint)">' + L('บล็อก') + '</span>' +
        '<span class="nm" data-act="open-task" data-id="' + esc(b.id) +
        '" style="cursor:pointer">' + esc(b.name) + '</span>' + depWhen(b) + '</div>';
    });

    // ไฟล์แนบ
    h += '<div class="dw-sec-title">' + L('ไฟล์แนบ') +
      '<button class="btn btn-sm btn-ghost" data-act="add-attachment" data-id="' + esc(t.id) +
      '">+ ' + L('เพิ่ม') + '</button></div>';
    if (!t.attachments.length) {
      h += '<div style="font-size:13px;color:var(--fg-faint)">' + L('ยังไม่มีไฟล์แนบ') + '</div>';
    }
    t.attachments.forEach(function (a) {
      /* ไฟล์ที่เลือกมาจากเครื่องถูกเก็บมาทั้งก้อน จึงดาวน์โหลดกลับได้
       * ส่วนลิงก์เปิดออกไปที่ปลายทาง สองอย่างนี้ใช้แท็ก a เหมือนกันแต่คนละความหมาย
       * ต่างกันที่ download ซึ่งทำให้ไฟล์ถูกบันทึกด้วยชื่อเดิมแทนที่จะเปิดในแท็บใหม่ */
      var inline = /^data:/.test(a.url || '');
      h += '<div class="att-row">' + I('paperclip', 14) + '<span class="nm">' +
        (a.url
          ? '<a href="' + esc(a.url) + '"' +
            (inline ? ' download="' + esc(a.name) + '"' : ' target="_blank" rel="noopener"') +
            '>' + esc(a.name) + '</a>'
          : esc(a.name)) + '</span>' +
        (a.size ? '<span class="att-size">' + esc(fmtBytes(a.size)) + '</span>' : '') +
        (S.isImageAtt(a) && a.url && !t.parentId && S.can('write', t.id)
          ? '<button class="btn btn-sm btn-ghost att-cover' + (t.coverId === a.id ? ' on' : '') + '" data-act="' +
            (t.coverId === a.id ? 'clear-cover' : 'set-cover') + '" data-id="' + esc(t.id) + '" data-att="' + esc(a.id) +
            '" title="' + (t.coverId === a.id ? L('เอารูปปกออก') : L('ตั้งเป็นรูปปก')) + '">' + I('image', 13) +
            '<span class="hide-sm">' + (t.coverId === a.id ? L('รูปปก') : L('ตั้งเป็นรูปปก')) + '</span></button>' : '') +
        '<button class="btn btn-sm btn-ghost" data-act="remove-attachment" data-id="' + esc(t.id) +
        '" data-att="' + esc(a.id) + '" title="' + L('เอาไฟล์แนบนี้ออก') + '">' +
        I('close', 13) + '</button></div>';
    });

    /* ผู้ติดตาม — ทุกงานมีคนสร้างเป็นผู้ติดตามอัตโนมัติอยู่แล้ว
     * ถ้ามีแค่คนเดียวก็ยังไม่มีอะไรให้ดู โผล่เมื่อมีคนอื่นเข้ามาแล้วเท่านั้น */
    if (more || t.followers.length > 1) {
      h += '<div class="dw-sec-title">' + L('ผู้ติดตาม') +
        '<button class="btn btn-sm btn-ghost" data-act="pick-follower" data-id="' + esc(t.id) +
        '">+ ' + L('เพิ่ม') + '</button></div>';
      h += '<div class="picker"><div class="fld-inline">';
      t.followers.forEach(function (fid) {
        var fu = S.user(fid);
        if (!fu) return;
        h += '<span class="chip">' + avatar(fu, 'sm') + esc(fu.name) +
          '<button data-act="remove-follower" data-id="' + esc(t.id) + '" data-user="' +
          esc(fid) + '" title="' + L('เอาผู้ติดตามคนนี้ออก') + '">' +
          I('close', 13) + '</button></span>';
      });
      if (!t.followers.length) h += '<span style="font-size:13px;color:var(--fg-faint)">' + L('ยังไม่มี') + '</span>';
      h += '</div></div>';
    }

    // งานย่อย
    /* เรียง กรอง และซ่อนที่เสร็จแล้ว — เป็นความชอบของคนดู เก็บในหน่วยความจำ (main.js) ไม่ลงข้อมูล
     * งานแม่ที่มีงานย่อยหลายสิบชิ้น ถ้าเห็นทุกชิ้นปนกัน จะหาของที่ยังค้างอยู่ไม่เจอ */
    var sv = (opts && opts.subView) || {};
    var subAll = subs;
    if (sv.hideDone) subs = subs.filter(function (s) { return !s.completed; });
    if (sv.mine) subs = subs.filter(function (s) { return s.assigneeId === S.db.currentUserId; });
    if (sv.sort && sv.sort !== 'manual') {
      subs = S.sortItems(subs.map(function (s) { return { task: s }; }), sv.sort, 'asc')
        .map(function (x) { return x.task; });
    }
    var outside = S.subtasksOutside(t.id);
    var outsideIds = {};
    outside.forEach(function (s) { outsideIds[s.id] = true; });
    h += '<div class="dw-sec-title">' + L('งานย่อย') + ' <span style="color:var(--fg-faint)">' +
      subAll.filter(function (s) { return s.completed; }).length + '/' + subAll.length + '</span>';
    if (subAll.length) {
      h += '<span class="sub-tools">' +
        '<select class="sub-sort" data-act="sub-sort" title="' + L('เรียงงานย่อย') + '">' +
        [['manual', 'ลำดับเดิม'], ['due', 'กำหนดส่ง'], ['name', 'ชื่อ ก-ฮ'], ['assignee', 'ผู้รับผิดชอบ'],
         ['priority', 'ความสำคัญ']].map(function (o) {
          return '<option value="' + o[0] + '"' + ((sv.sort || 'manual') === o[0] ? ' selected' : '') + '>' +
            esc(L(o[1])) + '</option>';
        }).join('') + '</select>' +
        '<button class="sub-tog' + (sv.mine ? ' on' : '') + '" data-act="sub-mine" aria-pressed="' + !!sv.mine +
        '" title="' + L('เฉพาะงานย่อยของฉัน') + '">' + I('users', 13) + '</button>' +
        '<button class="sub-tog' + (sv.hideDone ? ' on' : '') + '" data-act="sub-hide-done" aria-pressed="' +
        !!sv.hideDone + '" title="' + (sv.hideDone ? L('แสดงงานย่อยที่เสร็จแล้ว') : L('ซ่อนงานย่อยที่เสร็จแล้ว')) +
        '">' + I('checkCircle', 13) + '</button></span>';
    }
    h += '</div>';
    if (outside.length) {
      h += '<div class="sub-warn">' + I('alert', 14) + '<span class="grow">' +
        L('งานย่อย {n} งานอยู่นอกช่วงวันของงานนี้', { n: outside.length }) + '</span>' +
        (S.can('write', t.id) ? '<button class="as-link" data-act="fit-parent-dates" data-id="' + esc(t.id) + '">' +
          L('จัดวันงานหลักให้ครอบงานย่อย') + '</button>' : '') + '</div>';
    } else if (subAll.some(function (s) { return s.startOn || s.dueOn; }) && S.can('write', t.id) &&
               !(t.startOn || t.dueOn)) {
      h += '<div class="sub-warn soft"><span class="grow">' + L('งานนี้ยังไม่มีวัน แต่งานย่อยมีแล้ว') +
        '</span><button class="as-link" data-act="fit-parent-dates" data-id="' + esc(t.id) + '">' +
        L('จัดวันงานหลักให้ครอบงานย่อย') + '</button></div>';
    }
    if (subAll.length && !subs.length) {
      h += '<div class="sub-none">' + L('ไม่มีงานย่อยที่ตรงกับตัวกรอง') + '</div>';
    }
    /* งานย่อยเป็นงานเต็มรูปแบบ ไม่ใช่รายการติ๊กเฉย ๆ
     * กดที่ชื่อแล้วเปิดแผงรายละเอียดของมันเองซึ่งมีทุกอย่างเหมือนงานปกติ
     *
     * ส่วนวันกับผู้รับผิดชอบ ตั้งได้จากแถวนี้เลยโดยไม่ต้องเปิดเข้าไป
     * เพราะสองอย่างนี้คือสิ่งที่ต้องกรอกทันทีหลังแตกงานย่อยออกมา
     * ถ้าบังคับให้เปิดเข้าไปทีละอัน การแตกงานสิบชิ้นจะกลายเป็นการเปิดปิดสิบรอบ */
    subs.forEach(function (s) {
      var when = s.dueOn || s.startOn;
      h += '<div class="sub-row' + (s.completed ? ' done' : '') + '">' + checkbox(s) +
        '<span class="nm" data-act="open-task" data-id="' + esc(s.id) +
        '" style="cursor:pointer">' + esc(s.name) + '</span>' + approvalIcon(s) +
        (outsideIds[s.id] ? '<span class="sub-out" title="' + L('อยู่นอกช่วงวันของงานหลัก') + '">' +
          I('alert', 13) + '</span>' : '') +
        '<button class="sub-date' + (when ? ' on' : '') + dueClass(s.dueOn, s.completed) +
        '" data-act="sub-dates" data-id="' + esc(s.id) + '" title="' +
        L('ตั้งวันเริ่มและกำหนดส่ง') + '">' + I('calendar', 13) +
        (when ? '<span>' + esc(fmtDate(when)) + '</span>' : '') + '</button>' +
        '<button class="sub-who" data-act="sub-assign" data-id="' + esc(s.id) + '" title="' +
        (s.assigneeId ? esc((S.user(s.assigneeId) || {}).name || '') : L('มอบหมายงานย่อยนี้')) +
        '">' + avatar(S.user(s.assigneeId), 'sm') + '</button>' +
        '<button class="x" data-act="delete-task" data-id="' + esc(s.id) +
        '" title="' + L('ลบงานย่อยนี้') + '">' + I('close', 13) + '</button></div>';
    });
    /* พิมพ์ชื่อแล้วกด Enter ได้เลย ไม่ต้องผ่านกล่อง prompt ของเบราว์เซอร์
     * ซึ่งบังคับให้หยุดทุกอย่างและพิมพ์ได้ทีละหนึ่งงาน
     * ช่องนี้ไม่ล้างโฟกัสหลังเพิ่ม จึงพิมพ์รายการยาว ๆ รวดเดียวได้ */
    h += '<div class="sub-add">' + I('plus', 14) +
      '<input id="subAdd" data-act="sub-add" data-id="' + esc(t.id) +
      '" placeholder="' + L('พิมพ์ชื่องานย่อยแล้วกด Enter') + '"></div>';

    /* ---- ความเห็นและความเคลื่อนไหว ----
     *
     * เดิมเอาความเห็นของคนกับบันทึกอัตโนมัติมาเรียงปนกันในสายเดียว
     * งานที่แก้วันบ่อย ๆ จะมีบรรทัด "เปลี่ยนกำหนดส่ง" คั่นจนหาสิ่งที่คนพิมพ์ไว้ไม่เจอ
     * ทั้งที่สองอย่างนี้ตอบคนละคำถาม — ความเห็นคือ "ทีมคุยอะไรกันไว้"
     * ส่วนบันทึกคือ "งานนี้ถูกแก้อะไรมาบ้าง"
     *
     * แยกเป็นสองแท็บแบบ Asana เปิดมาที่ความเห็นก่อน เพราะเป็นสิ่งที่คนเปิดงานมาหา
     */
    /* ---- เธรด ----
     * ตอบได้ชั้นเดียวแบบ Asana คำตอบไม่ได้นับเป็นความเห็นหลัก ไม่ขึ้นในสายหลัก
     * แต่อยู่ใต้ความเห็นแม่เสมอ เรียงเก่าก่อนเสมอไม่ว่าสายหลักจะเรียงทางไหน
     * เพราะบทสนทนาย่อยอ่านกลับหัวแล้วไม่รู้เรื่อง */
    var cById = {}, repliesBy = {};
    stories.forEach(function (s) { if (s.type === 'comment') cById[s.id] = s; });
    function isReply(s) { return s.type === 'comment' && s.parentId && cById[s.parentId]; }
    stories.forEach(function (s) {
      if (isReply(s)) (repliesBy[s.parentId] = repliesBy[s.parentId] || []).push(s);
    });

    var onlyComments = stories.filter(function (s) { return s.type === 'comment' && !isReply(s); });
    var liveCount = onlyComments.filter(function (s) { return !s.deleted; }).length;
    var tab = (opts && opts.actTab) === 'all' ? 'all' : 'comments';
    var shown = (tab === 'all'
      ? stories.filter(function (s) { return !isReply(s); })
      : onlyComments).slice();

    /* เรียงเก่าก่อนเป็นค่าตั้งต้น เพราะสรุปประชุมอ่านไล่ตามลำดับเวลาถึงจะได้เรื่อง
     * แต่งานที่คุยกันยาวเป็นเดือน คนมักอยากเห็นล่าสุดก่อน จึงสลับได้ */
    var sortNewest = (opts && opts.actSort) === 'newest';
    if (sortNewest) shown.reverse();

    /* งานที่ถูกแก้บ่อยจะมีบันทึกอัตโนมัติยาวเป็นหางว่าว
     * ย่อของเก่าไว้ก่อน เหลือไว้เท่าที่ตาเห็นในหน้าจอเดียว
     * นับเฉพาะแท็บทั้งหมด เพราะแท็บความเห็นแทบไม่มีทางยาวขนาดนั้น */
    var ACT_MAX = 12;
    var hiddenN = 0;
    if (tab === 'all' && !(opts && opts.actAll) && shown.length > ACT_MAX) {
      hiddenN = shown.length - ACT_MAX;
      shown = sortNewest ? shown.slice(0, ACT_MAX) : shown.slice(hiddenN);
    }

    h += '<div class="dw-acttabs">' +
      '<button class="dw-acttab' + (tab === 'comments' ? ' on' : '') +
      '" data-act="dw-act-tab" data-tab="comments">' + L('ความเห็น') +
      (liveCount ? ' <span class="n">' + liveCount + '</span>' : '') +
      '</button>' +
      '<button class="dw-acttab' + (tab === 'all' ? ' on' : '') +
      '" data-act="dw-act-tab" data-tab="all">' + L('ความเคลื่อนไหวทั้งหมด') + '</button>' +
      '<span class="grow"></span>' +
      '<button class="dw-actsort" data-act="dw-act-sort" title="' +
      L('สลับลำดับเวลา') + '">' + I(sortNewest ? 'arrowDown' : 'arrowUp', 13) +
      (sortNewest ? L('ใหม่ก่อน') : L('เก่าก่อน')) + '</button>' +
      '</div>';

    /* ความเห็นที่ปักหมุดขึ้นซ้ำไว้บนสุดอีกที่ ตัวจริงยังอยู่ตามลำดับเวลาเดิม
     * คนที่เปิดงานมาทีหลังเห็นข้อสรุปก่อน ส่วนคนที่ไล่อ่านก็ไม่เสียบริบท */
    var pinned = onlyComments.filter(function (s) { return s.pinned && !s.deleted; });
    if (pinned.length && tab === 'comments') {
      h += '<div class="pin-box"><div class="pin-h">' + I('flag', 12) + L('ความเห็นที่ปักหมุด') + '</div>';
      pinned.forEach(function (s) {
        var pa = S.user(s.actorId);
        var snip = S.plainText(s.text).replace(/\s+/g, ' ');
        if (snip.length > 140) snip = snip.slice(0, 140) + '…';
        h += '<button class="pin-row" data-act="jump-story" data-story="' + esc(s.id) + '">' +
          avatar(pa, 'sm') + '<b>' + esc(pa ? pa.name : '?') + '</b><span class="pin-snip">' + esc(snip) +
          '</span></button>';
      });
      h += '</div>';
    }

    /* ปุ่มกางของเก่าอยู่บนสุดตอนเรียงเก่าก่อน และอยู่ล่างสุดตอนเรียงใหม่ก่อน
     * ให้ตรงกับทิศที่ของเก่าถูกซ่อนไป ไม่งั้นกดแล้วเนื้อหาจะโผล่คนละทางกับที่คาด */
    var moreBtn = hiddenN
      ? '<button class="dw-actmore" data-act="dw-act-more">' +
        L('แสดงอีก {n} รายการก่อนหน้า', { n: hiddenN }) + '</button>'
      : '';
    if (!sortNewest) h += moreBtn;

    if (!shown.length) {
      h += '<div class="dw-actempty">' + (tab === 'all'
        ? L('ยังไม่มีความเคลื่อนไหว')
        : L('ยังไม่มีใครแสดงความเห็น เริ่มคนแรกได้เลย')) + '</div>';
    }

    var meId = S.db.currentUserId;
    var canComment = S.can('comment', t.id);
    var draft = (opts && opts.draft) || function () { return ''; };
    var openThreads = (opts && opts.openThreads) || {};

    function commentHtml(s, reply) {
      var actor = S.user(s.actorId);
      var mine = s.actorId === meId;
      var c = '<div class="story cmt' + (reply ? ' reply' : '') + (s.pinned ? ' pinned' : '') +
        (opts && opts.flashStory === s.id ? ' flash' : '') + '" id="st-' + esc(s.id) + '">' +
        avatar(actor, reply ? 'sm' : '') + '<div class="body">';
      if (s.deleted) {
        c += '<div class="txt cmt-gone">' + L('ความเห็นนี้ถูกลบแล้ว') + '</div>';
      } else {
        c += '<div class="who"><span class="nm">' + esc(actor ? actor.name : '?') + '</span>' +
          whenTag(s.createdAt) +
          (s.editedAt ? '<span class="cmt-edited" title="' + esc(fmtExact(s.editedAt)) + '">' +
            L('(แก้ไขแล้ว)') + '</span>' : '') +
          (s.pinned ? '<span class="cmt-pin">' + I('flag', 11) + L('ปักหมุด') + '</span>' : '') +
          (s.auto ? '<span class="auto-tag" title="' + esc(L('เขียนโดยอัตโนมัติ')) + '">' + I('bolt', 11) + L('โดยอัตโนมัติ') + '</span>' : '') +
          '<span class="grow"></span>' +
          '<button class="cmt-more" data-act="comment-menu" data-story="' + esc(s.id) +
          '" title="' + L('ตัวเลือกความเห็น') + '">' + I('more', 14) + '</button></div>';
        if (opts && opts.editStory === s.id && mine) {
          var dk = 'e:' + s.id;
          c += composerHtml(dk, t.id, L('แก้ไขความเห็น…'), draft(dk) || s.text) +
            '<div class="cmt-editacts"><button class="btn btn-sm" data-act="comment-cancel" data-story="' +
            esc(s.id) + '">' + L('ยกเลิก') + '</button><button class="btn btn-sm btn-primary" ' +
            'data-act="comment-save" data-story="' + esc(s.id) + '" data-id="' + esc(t.id) + '">' +
            L('บันทึก') + '</button></div>';
        } else {
          c += '<div class="txt">' + richText(s.text) + '</div>';
        }
        c += '<div class="cmt-foot">' + reactionRow(s) +
          (!reply && canComment ? '<button class="cmt-reply" data-act="comment-reply" data-story="' +
            esc(s.id) + '">' + L('ตอบกลับ') + '</button>' : '') + '</div>';
      }
      if (!reply) c += threadHtml(s);
      return c + '</div></div>';
    }

    function threadHtml(s) {
      var reps = repliesBy[s.id] || [];
      var open = !!openThreads[s.id];
      var c = '';
      if (reps.length && !open) {
        var who = [];
        reps.forEach(function (r) { if (who.indexOf(r.actorId) < 0) who.push(r.actorId); });
        c += '<button class="thread-row" data-act="thread-toggle" data-story="' + esc(s.id) + '">' +
          '<span class="thread-av">' + who.slice(0, 4).map(function (u) {
            return avatar(S.user(u), 'sm');
          }).join('') + '</span><b>' + L('{n} การตอบกลับ', { n: reps.length }) + '</b>' +
          whenTag(reps[reps.length - 1].createdAt) + '</button>';
      }
      if (open) {
        c += '<div class="thread">';
        reps.forEach(function (r) { c += commentHtml(r, true); });
        if (canComment) {
          var rk = 'r:' + s.id;
          c += '<div class="reply-box">' + avatar(S.me(), 'sm') +
            composerHtml(rk, t.id, L('ตอบกลับ… (Ctrl+Enter ส่ง)'), draft(rk)) +
            '<button class="btn btn-primary btn-sm" data-act="send-reply" data-story="' + esc(s.id) +
            '" data-id="' + esc(t.id) + '">' + L('ส่ง') + '</button></div>';
        }
        if (reps.length) {
          c += '<button class="thread-hide" data-act="thread-toggle" data-story="' + esc(s.id) + '">' +
            L('ซ่อนการตอบกลับ') + '</button>';
        }
        c += '</div>';
      }
      return c;
    }

    shown.forEach(function (s) {
      var actor = S.user(s.actorId);
      if (s.type === 'comment') {
        h += commentHtml(s, false);
      } else {
        h += '<div class="story log">' + avatar(actor, 'sm') +
          '<div class="txt">' + esc(actor ? actor.name : '?') + ' ' + esc(storyText(s)) +
          (s.auto ? ' <span class="auto-tag" title="' + esc(L('ทำโดยอัตโนมัติ')) + '">' + I('bolt', 11) + L('โดยอัตโนมัติ') + '</span>' : '') +
          whenTag(s.createdAt) + '</div></div>';
      }
    });
    if (sortNewest) h += moreBtn;

    h += '</div>';

    /* ช่องความเห็นเป็นตัวแก้ไขแบบเห็นภาพชุดเดียวกับรายละเอียด
     * ร่างที่พิมพ์ค้างไว้เก็บแยกต่อคนต่องาน (main.js) ปิดแผงหรือรีเฟรชแล้วยังอยู่ */
    var ck = 'c:' + t.id;
    h += '<div class="dw-foot"><div class="comment-box">' + avatar(S.me()) +
      composerHtml(ck, t.id, L('เขียนความเห็น… พิมพ์ @ เพื่ออ้างถึงคน งาน หรือโปรเจกต์ (Ctrl+Enter ส่ง)'),
        draft(ck), 'commentInput') +
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

  /** ป้ายเตือนตอนบันทึกลงเครื่องไม่สำเร็จ — ค้างไว้จนกว่าจะบันทึกได้
   *
   * ต้องอยู่บนแถบบนซึ่งเห็นตลอดเวลา ไม่ใช่ข้อความลอยที่หายไปในสามวินาที
   * เพราะระหว่างที่บันทึกไม่ลง ทุกอย่างที่ทำต่อจากนั้นจะหายเมื่อปิดหน้า */
  function saveChip() {
    var err = S.saveError && S.saveError();
    if (!err) return '';
    return '<button class="sync-chip bad" data-act="save-error" title="' +
      L('กดเพื่อดูวิธีแก้') + '">' + I('alert', 15) +
      '<span class="sync-txt">' + L('บันทึกไม่ลง') + '</span></button>';
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
    /* โปรไฟล์พาไปหน้าเต็ม ส่วนตั้งค่าเปิดเป็นหน้าต่างซ้อน แบบเดียวกับ Asana
     * ที่แยกกันเพราะสองอันตอบคนละคำถาม — หน้าโปรไฟล์คือ "ฉันมีงานอะไรอยู่"
     * ส่วนตั้งค่าคือ "ฉันอยากเปลี่ยนอะไร" ยัดรวมกันแล้วหาทั้งสองอย่างไม่เจอ */
    h += '<button data-act="go-profile" data-id="' + esc(me ? me.id : '') + '">' +
      I('users', 14) + '<span class="grow">' + L('โปรไฟล์') + '</span></button>';
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
    system: 'ระบบ', task: 'งาน', security: 'ความปลอดภัย', field: 'ฟิลด์', tag: 'แท็ก', template: 'เทมเพลต'
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
    'user.photo': 'ได้เปลี่ยนรูปประจำตัว',
    'user.photoClear': 'ได้เอารูปประจำตัวออก',
    'user.back': 'ได้ยกเลิกสถานะไม่อยู่',
    'project.create': 'ได้สร้างโปรเจกต์',
    'project.duplicate': 'ได้คัดลอกโปรเจกต์',
    'project.delete': 'ได้ลบโปรเจกต์',
    'project.visibility': 'ได้เปลี่ยนความเป็นส่วนตัวของ',
    'project.lock': 'ได้ล็อกรายชื่อสมาชิกของ',
    'project.unlock': 'ได้ปลดล็อกรายชื่อสมาชิกของ',
    'project.member': 'ได้ตั้งสิทธิ์ในโปรเจกต์',
    'project.member-remove': 'ได้ถอดสมาชิกออกจากโปรเจกต์',
    'project.message': 'ได้ประกาศในโปรเจกต์',
    'project.viewOn': 'ได้เปิดมุมมองในโปรเจกต์',
    'project.viewOff': 'ได้ปิดมุมมองในโปรเจกต์',
    'project.view': 'ได้บันทึกแท็บมุมมองในโปรเจกต์',
    'section.duplicate': 'ได้ทำสำเนาคอลัมน์ในโปรเจกต์',
    'project.baseline': 'ได้ตั้งเส้นฐานของ',
    'project.baselineClear': 'ได้ลบเส้นฐานของ',
    'project.import': 'ได้นำเข้างานเข้าโปรเจกต์',
    'project.type': 'ได้บันทึกชนิดงานในโปรเจกต์',
    'project.form': 'ได้บันทึกฟอร์มในโปรเจกต์',
    'template.save': 'ได้บันทึกเทมเพลตโปรเจกต์',
    'template.delete': 'ได้ลบเทมเพลตโปรเจกต์',
    'project.export': 'ได้ส่งออกงานของโปรเจกต์',
    'portfolio.create': 'ได้สร้างพอร์ตโฟลิโอ',
    'portfolio.delete': 'ได้ลบพอร์ตโฟลิโอ',
    'portfolio.add': 'ได้เพิ่มโปรเจกต์เข้าพอร์ตโฟลิโอ',
    'portfolio.remove': 'ได้ถอดโปรเจกต์ออกจากพอร์ตโฟลิโอ',
    'system.reset': 'ได้ล้างข้อมูลทั้งหมด',
    'system.export': 'ได้ส่งออกข้อมูล',
    'system.import': 'ได้นำเข้าข้อมูล',
    /* 2c */
    'project.access-request': 'ได้ขอสิทธิ์เข้าโปรเจกต์',
    'project.restore': 'ได้กู้คืนโปรเจกต์',
    'project.purge': 'ได้ลบโปรเจกต์ถาวร',
    'field.lib-create': 'ได้เพิ่มฟิลด์เข้าคลังขององค์กร',
    'field.lib-delete': 'ได้เอาฟิลด์ออกจากคลังขององค์กร',
    'tag.rename': 'ได้เปลี่ยนชื่อแท็ก',
    'tag.delete': 'ได้ลบแท็ก'
  };
  function auditText(a) { return AUDIT_TEXT[a] || a; }

  var AUDIT_ICON = {
    auth: 'signIn', user: 'users', project: 'archive',
    system: 'settings', task: 'checkCircle', security: 'shield', field: 'hash', tag: 'flag', template: 'star'
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
          (r.detail ? '<span class="d">' + esc(L(r.detail, r.detailParams || undefined)) + '</span>' : '') +
          '<em title="' + esc(fmtExact(r.at)) + '">' + esc(fmtWhen(r.at)) + '</em></div></li>';
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
          esc(a.story.type === 'comment' ? L('แสดงความเห็น') : storyText(a.story));
        if (a.taskName) {
          h += ' <a href="#/task/' + esc(a.story.taskId) + '">' + esc(a.taskName) + '</a>';
        }
        h += '<em title="' + esc(fmtExact(a.story.createdAt)) + '">' + esc(fmtWhen(a.story.createdAt)) + '</em></div></li>';
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
    fmtDate: fmtDate, fmtWhen: fmtWhen, fmtExact: fmtExact, whenTag: whenTag,
    prio: prio, taskType: taskType, approvalState: approvalState,
    projectState: projectState, recurLabel: recurLabel,
    MON: MON, MONF: MONF, DOW: DOW, DOWR: DOWR, weekStart: weekStart, YR: YR, ICON: ICON,
    TAB_IDS: TAB_IDS, projectTabs: projectTabs, ZOOMS: ZOOMS, ROW_H: ROW_H,

    checkbox: checkbox, dueClass: dueClass, badges: badges, depTypeHint: depTypeHint,
    sidebar: sidebar, topbar: topbar, viewToolbar: viewToolbar, filterCount: filterCount, bulkbar: bulkbar,
    VIEWS_WITH_TOOLBAR: VIEWS_WITH_TOOLBAR,
    listView: listView, boardView: boardView, timelineView: timelineView,
    homeView: homeView, dashboardView: dashboardView, profileView: profileView,
    overviewView: overviewView, filesView: filesView, messagesView: messagesView,
    projectsView: projectsView,
    portfolioView: portfolioView, PF_TABS: PF_TABS,
    myTasksView: myTasksView, inboxView: inboxView, trashView: trashView, approvalIcon: approvalIcon,
    MT_TABS: MT_TABS, INBOX_FLAGS: INBOX_FLAGS, calBoard: calBoard, calSpan: calSpan,
    filesList: filesList, privateChip: privateChip, newDot: newDot, fmtTime: fmtTime,
    projectCalendar: projectCalendar, globalCalendar: globalCalendar, colorFor: colorFor,
    groupLabel: groupLabel, searchView: searchView, drawer: drawer,
    searchHelp: searchHelp, tagView: tagView, noAccessView: noAccessView, calColor: calColor,
    taskRow: taskRow, taskCard: taskCard,
    /* 3b */
    statusPill: statusPill, statusEntryHtml: statusEntryHtml, statusHlHtml: statusHlHtml, blockLabel: blockLabel,
    formPage: formPage
  };

})(window);

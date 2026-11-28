/* Orbit — Sprint 2C มุมมองผู้บริหาร
 *
 * ผู้ทดสอบบทบาท "ผู้บริหาร" ถามว่า "ตอนนี้ทำอะไรถึงไหนแล้ว?" แล้วต้องคลิกไล่ทีละโปรเจกต์กว่าจะตอบได้
 * ไฟล์นี้รวมทุกอย่างของชิ้นงานนี้ไว้ที่เดียว (แยกจาก render.js/main.js ที่ใหญ่มากแล้วและมีคนแก้คู่ขนาน)
 *   - การ์ด "ภาพรวมผู้บริหาร" บนหน้าแรก + ชุดหน้าแรกแบบผู้บริหาร + ย้ายการ์ดไปบนสุด
 *   - ถาม/ตอบใต้รายงานสถานะ และ "อะไรเปลี่ยนจากรอบก่อน"
 *   - พิมพ์ / บันทึก PDF สำหรับประชุม (โปรเจกต์ พอร์ตโฟลิโอ รายงาน)
 *   - บรีฟ/หมุดหมายเปิดมาเป็นโหมดอ่าน พอร์ตโฟลิโอเป็นการ์ดบนจอแคบ กิจกรรมล่าสุดแบบรวมบรรทัด
 *   - หน้าที่เปิดเมื่อเข้าแอปเป็นพอร์ตโฟลิโอ/รายงานได้
 *
 * ส่วนวาด (คืน HTML ล้วน) เสียบเข้า global.Render ตอนโหลด ส่วนโต้ตอบลงทะเบียนผ่าน window.OrbitExt (แบบเดียวกับ ui4b.js)
 */
(function (global) {
  'use strict';

  var S = global.Store, R = global.Render, L = global.I18N.t, I = global.Icons.icon;
  var esc = R.esc, avatar = R.avatar, fmtDate = R.fmtDate, fmtWhen = R.fmtWhen, fmtExact = R.fmtExact;
  var RT = function () { return global.RichText; };

  /* สถานะหน้าจอที่ไม่ต้องบันทึก — บรีฟ/หมุดหมายที่กำลังแก้ และเธรดถาม/ตอบที่กางอยู่ (รหัสรายงาน -> true/false) */
  var ui = { brief: {}, ms: {}, thr: {} };

  function statePill(id, cls) {
    if (!id) return '<span class="pf-none">' + esc(L('ยังไม่รายงาน')) + '</span>';
    var st = R.projectState(id);
    return '<span class="status-pill' + (cls ? ' ' + cls : '') + '" style="background:' + st.color + '22;color:' + st.color + '"><i style="background:' +
      st.color + '"></i>' + esc(L(st.label)) + '</span>';
  }
  function plural(n, th) { return L(th, { n: n }); }
  function signed(n) { return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '±0'; }
  /** ข้อความของความเคลื่อนไหวหนึ่งรายการ (ชุดเดียวกับ storyText ใน render.js) */
  function storyLine(s) {
    if (s.type === 'comment') return L('แสดงความเห็น');
    /* labelParams แปลป้ายสถานะอนุมัติ/ความสำคัญที่เก็บเป็นภาษาไทย ไม่งั้นอังกฤษขึ้น “อนุมัติแล้ว” กลางประโยค */
    var p = R.labelParams(s.text, R.dateParams(s.params));
    return p ? L(s.text, p) : R.localizeIso(L(s.text));
  }

  /* ====================== 1 — การ์ดภาพรวมผู้บริหาร ====================== */
  var EXEC_ROWS = 5;

  function execKpi(n, label, cls, act, v, tip) {
    var tag = act ? 'button' : 'div';
    return '<' + tag + ' class="xo-kpi' + (cls ? ' ' + cls : '') + '"' + (act ? ' data-act="' + act + '" data-v="' + esc(v) + '"' : '') +
      (tip ? ' title="' + esc(tip) + '"' : '') + '><b>' + n + '</b><span>' + esc(label) + '</span>' +
      (act ? '<em>' + I('arrowRight', 11) + '</em>' : '') + '</' + tag + '>';
  }
  function moreRow(n, act, route) {
    return n > 0 ? '<button class="xo-more" data-act="' + act + '"' + (route ? ' data-route="' + route + '"' : '') + '>' +
      esc(L('+ อีก {n}', { n: n })) + '</button>' : '';
  }

  function execWidget() {
    var x = S.execOverview();
    var watchN = x.risk.length + x.silent.length;
    var b = '<div class="xo">';
    b += '<div class="xo-kpis">' +
      execKpi(x.overdue, L('งานเลยกำหนด'), x.overdue ? 'bad' : 'ok', 'x2c-search', 'overdue', L('เปิดรายการงานเลยกำหนดทั้งหมดในค้นหาขั้นสูง')) +
      execKpi(x.dueWeek, L('ครบกำหนดใน 7 วัน'), '', 'x2c-search', 'week', L('เปิดรายการงานที่ครบกำหนดใน 7 วันในค้นหาขั้นสูง')) +
      execKpi(watchN, L('โปรเจกต์ที่ต้องจับตา'), watchN ? 'warn' : 'ok', '', '', L('หลุดแผน/เสี่ยง หรือไม่ได้รายงานแต่มีงานเลยกำหนด จาก {n} โปรเจกต์ที่คุณเห็น', { n: x.projects })) +
      execKpi(x.people.length, L('คนที่งานล้นหรือค้าง'), x.people.length ? 'warn' : 'ok', '', '') +
      '</div>';

    b += '<div class="xo-cols">';
    /* --- หลุดแผน / เสี่ยง --- */
    b += '<section class="xo-sec"><h4>' + I('alert', 13) + ' ' + esc(L('หลุดแผน / เสี่ยง')) + '<span>' + x.risk.length + '</span></h4>';
    if (!x.risk.length) b += '<div class="xo-none">' + I('checkCircle', 13) + ' ' + esc(L('ไม่มีโปรเจกต์ที่หลุดแผนหรือเสี่ยง')) + '</div>';
    x.risk.slice(0, EXEC_ROWS).forEach(function (r) {
      var stale = r.age === null || r.age >= 7;
      b += '<button class="xo-row" data-act="go-project-view" data-id="' + esc(r.p.id) + '" data-view="overview">' +
        '<span class="hproj-ic" style="background:' + esc(r.p.color) + '22">' + esc(r.p.icon) + '</span>' +
        /* งานเลยกำหนดขึ้นก่อนเวลารายงาน — แถวแคบแล้วตัดท้าย ตัวเลขที่สำคัญกว่าต้องไม่หาย */
        '<span class="grow"><b>' + esc(r.p.name) + '</b><em' + (r.at ? ' title="' + esc(fmtExact(r.at)) + '"' : '') + '>' +
        (r.overdue ? '<span class="xo-bad">' + esc(L('เลยกำหนด {n}', { n: r.overdue })) + '</span> · ' : '') +
        '<span' + (stale ? ' class="stale"' : '') + '>' + esc(r.at ? L('รายงาน {w}', { w: fmtWhen(r.at) }) : L('ยังไม่เคยรายงาน')) + '</span></em></span>' +
        statePill(r.state) + '</button>';
    });
    b += moreRow(x.risk.length - EXEC_ROWS, 'go', 'projects') + '</section>';

    /* --- เงียบแต่มีงานเลยกำหนด --- */
    b += '<section class="xo-sec"><h4>' + I('clock', 13) + ' ' + esc(L('ไม่ได้รายงาน แต่มีงานเลยกำหนด')) + '<span>' + x.silent.length + '</span></h4>';
    if (!x.silent.length) b += '<div class="xo-none">' + I('checkCircle', 13) + ' ' + esc(L('ทุกโปรเจกต์ที่มีงานเลยกำหนดรายงานสถานะใน 7 วันที่ผ่านมา')) + '</div>';
    x.silent.slice(0, EXEC_ROWS).forEach(function (r) {
      b += '<button class="xo-row" data-act="go-project-view" data-id="' + esc(r.p.id) + '" data-view="overview">' +
        '<span class="hproj-ic" style="background:' + esc(r.p.color) + '22">' + esc(r.p.icon) + '</span>' +
        '<span class="grow"><b>' + esc(r.p.name) + '</b><em class="stale">' +
        esc(r.age === null ? L('ยังไม่เคยรายงาน') : L('ไม่ได้รายงาน {n} วัน', { n: r.age })) + '</em></span>' +
        '<span class="chip due-over" title="' + esc(L('ไม่ได้รายงาน แต่มีงานเลยกำหนด {n}', { n: r.overdue })) + '">' +
        esc(L('เลยกำหนด {n}', { n: r.overdue })) + '</span></button>';
    });
    b += moreRow(x.silent.length - EXEC_ROWS, 'go', 'projects') + '</section>';

    /* --- คน --- */
    b += '<section class="xo-sec"><h4>' + I('users', 13) + ' ' + esc(L('คนที่งานล้นหรือค้างเยอะ')) + '<span>' + x.people.length + '</span></h4>';
    if (!x.people.length) b += '<div class="xo-none">' + I('checkCircle', 13) + ' ' + esc(L('ไม่มีใครงานล้นหรือมีงานค้างเลยกำหนด')) + '</div>';
    x.people.slice(0, EXEC_ROWS).forEach(function (r) {
      var u = S.user(r.uid);
      if (!u) return;
      b += '<button class="xo-row" data-act="go-profile" data-id="' + esc(u.id) + '">' + avatar(u, 'sm') +
        '<span class="grow"><b>' + esc(u.name) + '</b><em' + (r.over || r.overNext ? ' class="stale"' : '') + '>' +
        esc(L(r.over ? 'สัปดาห์นี้ {v}/{c} งาน (เกินความจุ)' : 'สัปดาห์นี้ {v}/{c} งาน', { v: Math.round(r.v * 10) / 10, c: Math.round(r.cap * 10) / 10 }) +
          (!r.over && r.overNext ? ' · ' + L('สัปดาห์หน้าเกินความจุ') : '')) + '</em></span>' +
        (r.late ? '<span class="chip due-over">' + esc(L('ค้าง {n}', { n: r.late })) + '</span>' : '') +
        (r.over ? '<span class="chip xo-over">' + esc(L('งานล้น')) + '</span>' : '') + '</button>';
    });
    b += '<button class="xo-more" data-act="go" data-route="workload">' + esc(L('ดูภาระงานทั้งหมด')) + ' ' + I('arrowRight', 11) + '</button></section>';
    b += '</div>';
    b += '<div class="xo-foot">' + I('lock', 11) + ' ' + esc(L('นับเฉพาะ {n} โปรเจกต์ที่คุณมีสิทธิ์เห็น', { n: x.projects })) + '</div>';
    b += '</div>';
    return {
      title: '<span class="hcard-title">' + I('gauge', 15) + esc(L('ภาพรวมผู้บริหาร')) + '</span>',
      action: '<button class="btn btn-sm btn-ghost" data-act="go" data-route="projects">' + L('ดูโปรเจกต์ทั้งหมด') + '</button>',
      body: b
    };
  }

  /* ====================== 9 — กิจกรรมล่าสุด ====================== */
  function actMode() { return S.pref('homeAct') === 'decisions' ? 'decisions' : 'all'; }
  function homeActTabs() {
    var m = actMode();
    return [['all', L('ทั้งหมด')], ['decisions', L('เฉพาะสถานะและการตัดสินใจ')]].map(function (x) {
      return '<button class="tb-tab' + (m === x[0] ? ' active' : '') + '" data-act="home-act-filter" data-v="' + x[0] + '">' + esc(x[1]) + '</button>';
    }).join('');
  }
  function homeActivityBody(n) {
    var mode = actMode();
    var items = S.activityFeed(n, mode);
    if (!items.length) {
      return '<div class="hempty">' + esc(mode === 'decisions' ? L('ยังไม่มีรายงานสถานะ การอนุมัติ หรือหมุดหมายที่เสร็จ') : L('ยังไม่มีกิจกรรม')) + '</div>';
    }
    var h = '';
    items.forEach(function (a) {
      var who = '<strong>' + esc(a.actor ? a.actor.name : '?') + '</strong> ';
      if (a.kind === 'status' || a.kind === 'pfstatus') {
        var pf = a.kind === 'pfstatus';
        h += '<div class="hact hact-st" ' + (pf ? 'data-act="x2c-pf-progress" data-id="' + esc(a.host.id) + '"'
            : 'data-act="go-project-view" data-id="' + esc(a.host.id) + '" data-view="overview"') + '>' + avatar(a.actor, 'sm') +
          '<span class="hact-body"><span class="hact-txt">' + who + esc(pf ? L('รายงานสถานะพอร์ตโฟลิโอเป็น') : L('รายงานสถานะเป็น')) + ' ' + statePill(a.entry.state, 'sm') + '</span>' +
          '<span class="hact-sub" title="' + esc(fmtExact(a.at)) + '">' + I(pf ? 'grid' : 'flag', 11) + ' ' + esc(a.host.name) + ' · ' + esc(fmtWhen(a.at)) + '</span></span></div>';
        return;
      }
      /* บรรทัดที่รวมไว้มีการตัดสินใจ (อนุมัติ/หมุดหมายเสร็จ) อยู่ข้างใน ให้การตัดสินใจขึ้นเป็นหัวข้อ ไม่จมอยู่ใน "และอีก N อย่าง" */
      var tk = S.task(a.taskId);
      var s0 = a.stories.filter(function (s) { return S.isDecisionStory(s, tk); })[0] || a.stories[0], more = a.stories.length - 1;
      var dec = S.isDecisionStory(s0, tk);
      var tip = a.stories.slice().reverse().map(storyLine).join('\n');
      h += '<div class="hact" data-act="open-task" data-id="' + esc(a.taskId) + '"' + (more ? ' title="' + esc(tip) + '"' : '') + '>' + avatar(a.actor, 'sm') +
        '<span class="hact-body"><span class="hact-txt">' + who +
        (dec ? '<span class="hact-dec">' + I(a.milestone ? 'diamond' : 'checkCircle', 12) + '</span>' : '') + esc(storyLine(s0)) +
        (more ? ' <span class="hact-more">' + esc(L('และอีก {n} อย่าง', { n: more })) + '</span>' : '') + '</span>' +
        '<span class="hact-sub" title="' + esc(fmtExact(a.at)) + '">' + esc(a.taskName || '') + ' · ' + esc(fmtWhen(a.at)) + '</span></span></div>';
    });
    return h;
  }

  /* ====================== 3 — อะไรเปลี่ยน + ถาม/ตอบใต้รายงานสถานะ ====================== */
  function statusChangeHtml(host, e) {
    var c = S.statusChange(host, e);
    if (!c) return '';
    var parts = [];
    if (c.from && c.from !== e.state) {
      parts.push('<span class="stc-tr">' + statePill(c.from, 'sm') + '<span class="stc-arrow">→</span>' + statePill(e.state, 'sm') + '</span>');
    } else if (c.from) {
      parts.push('<span class="stc-same">' + esc(L('สถานะคงเดิม')) + '</span>');
    }
    if (typeof c.d === 'number') {
      parts.push('<span class="stc-n' + (c.d > 0 ? ' good' : '') + '">' + esc(L('งานเสร็จ {n}', { n: signed(c.d) })) + '</span>');
    }
    if (typeof c.o === 'number') {
      parts.push('<span class="stc-n' + (c.o > 0 ? ' bad' : c.o < 0 ? ' good' : '') + '">' +
        esc(e.snap ? L('เลยกำหนด {d} (รวม {n})', { d: signed(c.o), n: e.snap.o }) : L('เลยกำหนด {n}', { n: signed(c.o) })) + '</span>');
    }
    if (!parts.length) return '';
    return '<div class="stc"' + (c.since ? ' title="' + esc(L('เทียบกับรายงานครั้งก่อน ({w})', { w: fmtExact(c.since) })) + '"' : '') + '>' +
      '<span class="stc-k">' + esc(L('เทียบรอบก่อน')) + '</span>' + parts.join('') + '</div>';
  }

  function threadOpen(e, full) {
    if (ui.thr[e.id] !== undefined) return ui.thr[e.id];
    return !!full && (e.replies || []).length > 0;       // รายงานเต็ม (ล่าสุด) ที่มีคนถามแล้ว กางไว้ให้เห็นเลย
  }
  function statusThread(host, e, opts) {
    if (!host || !e || !e.id) return '';
    opts = opts || {};
    var reps = e.replies || [], hostId = host.id;
    var canR = S.canReplyStatus(hostId);
    if (!reps.length && !canR) return '';
    var open = threadOpen(e, opts.full), me = S.me();
    var last = reps[reps.length - 1];
    var ppl = [];
    reps.forEach(function (r) { if (ppl.indexOf(r.by) < 0) ppl.push(r.by); });
    var h = '<div class="sthr' + (open ? ' open' : '') + '">';
    h += '<button class="sthr-tog" data-act="st-thread" data-id="' + esc(hostId) + '" data-e="' + esc(e.id) + '" aria-expanded="' + open + '">' +
      I(open ? 'chevronDown' : 'chevronRight', 12) +
      (reps.length ? '<span>' + esc(L('{n} คำตอบ', { n: reps.length })) + '</span><em>' + esc(L('ล่าสุด {w}', { w: fmtWhen(last.at) })) + '</em>' +
        '<span class="sthr-ppl">' + ppl.slice(0, 4).map(function (u) { return avatar(S.user(u), 'sm'); }).join('') + '</span>'
        : '<span>' + esc(L('ถามหรือตอบรายงานนี้')) + '</span>') + '</button>';
    if (open) {
      if (reps.length) {
        h += '<div class="sthr-list">';
        reps.forEach(function (r) {
          var ru = S.user(r.by);
          h += '<div class="msg-reply">' + avatar(ru, 'sm') + '<div class="grow"><em title="' + esc(fmtExact(r.at)) + '">' + esc(ru ? ru.name : '—') + ' · ' +
            esc(fmtWhen(r.at)) + '</em>' + RT().toHtml(r.body) + '</div>' +
            ((me && r.by === me.id) || S.can('manage') ? '<button class="x" data-act="st-reply-del" data-id="' + esc(hostId) + '" data-e="' + esc(e.id) +
              '" data-r="' + esc(r.id) + '" title="' + esc(L('ลบคำตอบ')) + '" aria-label="' + esc(L('ลบคำตอบ')) + '">' + I('close', 12) + '</button>' : '') + '</div>';
        });
        h += '</div>';
      }
      if (canR) {
        h += '<div class="sthr-box">' + R.msgComposer('sr:' + e.id, hostId, e.id, L('ถามหรือตอบ… พิมพ์ @ เพื่ออ้างถึง')) +
          '<div class="msg-actions"><span class="sthr-hint">' + esc(L('เจ้าของและคนเขียนรายงานจะได้รับแจ้งเตือน')) + '</span><span class="grow"></span>' +
          '<button class="btn btn-primary btn-sm" data-act="st-reply" data-id="' + esc(hostId) + '" data-e="' + esc(e.id) + '">' + esc(L('ส่ง')) + '</button></div></div>';
      }
    }
    return h + '</div>';
  }

  /* ====================== 6 — พอร์ตโฟลิโอเป็นการ์ดบนจอแคบ ====================== */
  function pfCards(f, rows) {
    var h = '<div class="pfx-cards">';
    (rows || []).forEach(function (r) {
      var it = r.it, p = it.o, s = r.info;
      h += '<button class="pfx-card" data-act="pf-open" data-kind="' + esc(it.kind) + '" data-id="' + esc(it.id) + '">' +
        '<span class="pfx-card-top"><span class="hproj-ic" style="background:' + esc(p.color) + '22">' + esc(p.icon) + '</span>' +
        '<b class="grow">' + esc(p.name) + '</b>' + R.pfStatePill(s.status) + '</span>' +
        '<span class="pfx-card-meta">' + (s.overdue ? '<span class="chip due-over">' + esc(L('{n} งานเลยกำหนด', { n: s.overdue })) + '</span>'
          : '<span class="pfx-card-ok">' + I('check', 12) + ' ' + esc(L('ไม่มีงานเลยกำหนด')) + '</span>') +
        (s.due ? '<span>' + esc(L('กำหนดส่ง {d}', { d: fmtDate(s.due) })) + '</span>' : '') +
        (it.kind === 'portfolio' ? '<span>' + esc(L('พอร์ตโฟลิโอ · {n} โปรเจกต์', { n: s.projects })) + '</span>' : '') + '</span>' +
        '<span class="pfx-card-prog"><span class="pf-bar"><i style="width:' + s.percent + '%;background:' + esc(p.color) + '"></i></span>' +
        '<span class="pfx-card-pct">' + esc(L('เสร็จ {n}%', { n: s.percent })) + '</span></span></button>';
    });
    if (!(rows || []).length) h += '<div class="pfx-empty">' + esc(L('ไม่มีรายการที่ตรงกับตัวกรอง')) + '</div>';
    return h + '</div>';
  }

  /* ====================== 8 — หน้าที่เปิดเมื่อเข้าแอป ====================== */
  function landingPicker(cur) {
    cur = String(cur || '');
    var pfs = S.portfolios(), rps = S.visibleReports();
    if (!pfs.length && !rps.length) return '';
    var opt = function (v, label) { return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(label) + '</option>'; };
    var h = '<div class="x2c-land"><label for="x2cLand">' + esc(L('หรือเปิดหน้าที่ติดตามประจำ')) + '</label>' +
      '<select id="x2cLand" class="opt-select" data-act="set-landing-x"><option value="">' + esc(L('— ไม่ใช้ —')) + '</option>';
    if (pfs.length) h += '<optgroup label="' + esc(L('พอร์ตโฟลิโอ')) + '">' + pfs.map(function (f) { return opt('portfolio:' + f.id, (f.icon ? f.icon + ' ' : '') + f.name); }).join('') + '</optgroup>';
    if (rps.length) h += '<optgroup label="' + esc(L('รายงาน')) + '">' + rps.map(function (r) { return opt('report:' + r.id, r.name); }).join('') + '</optgroup>';
    h += '</select><p class="opt-note">' + esc(L('เช่น พอร์ตโฟลิโอที่ประชุมทุกสัปดาห์ เปิดแอปแล้วเจอหน้านั้นเลย')) + '</p></div>';
    return h;
  }

  /* ====================== 4 — พิมพ์ / บันทึก PDF ======================
   * ไม่ใช้ไลบรารี PDF — วาดหน้ากระดาษแยก (#printSheet) แล้วให้เบราว์เซอร์พิมพ์ (เลือก "บันทึกเป็น PDF" ได้ในกล่องพิมพ์)
   * ตอนพิมพ์ซ่อนทุกอย่างนอกจากหน้ากระดาษ (@media print + body.printing) สีอ่อน ฟอนต์ไทยชุดเดียวกับแอป ขนาด A4 */
  function printBtn(kind, id) {
    return '<button class="btn x2c-print-btn" data-act="x2c-print" data-k="' + kind + '" data-id="' + esc(id) + '" title="' + esc(L('พิมพ์ / บันทึก PDF')) +
      '" aria-label="' + esc(L('พิมพ์ / บันทึก PDF')) + '">' + I('printer', 14) + '<span class="hide-sm"> ' + esc(L('พิมพ์ / PDF')) + '</span></button>';
  }
  /** ปุ่มพิมพ์แบบลิงก์ในหัวการ์ด (หน้าภาพรวมโปรเจกต์ — แถบบนของโปรเจกต์เต็มแล้ว ชื่อโปรเจกต์ถูกตัดถ้าเพิ่มปุ่มที่นั่น) */
  function printLink(kind, id) {
    return '<button class="as-link x2c-print-link" data-act="x2c-print" data-k="' + kind + '" data-id="' + esc(id) + '" title="' +
      esc(L('พิมพ์ / บันทึก PDF')) + '">' + I('printer', 12) + ' ' + esc(L('พิมพ์ / PDF')) + '</button>';
  }
  function psHead(title, sub) {
    var me = S.me(), now = new Date().toISOString();
    return '<header class="ps-head"><div class="ps-brand">Orbit</div><h1>' + title + '</h1>' +
      (sub ? '<div class="ps-sub">' + sub + '</div>' : '') +
      '<div class="ps-meta">' + esc(L('พิมพ์เมื่อ {d} โดย {u}', { d: fmtExact(now), u: me ? me.name : '—' })) + '</div></header>';
  }
  function psKpi(n, label, cls) { return '<div class="ps-kpi' + (cls ? ' ' + cls : '') + '"><b>' + n + '</b><span>' + esc(label) + '</span></div>'; }
  function psStatusBlock(host, e) {
    if (!e) return '<p class="ps-none">' + esc(L('ยังไม่เคยรายงานสถานะ')) + '</p>';
    var by = S.user(e.by);
    var h = '<div class="ps-status"><div class="ps-status-h">' + statePill(e.state) + '<b>' + esc(e.title || L('รายงานสถานะ')) + '</b>' +
      '<em>' + esc((by ? by.name : '—') + ' · ' + fmtExact(e.at)) + '</em></div>' + statusChangeHtml(host, e);
    if (e.blocks && e.blocks.length) {
      e.blocks.forEach(function (b) {
        h += '<div class="ps-blk"><h4>' + esc(R.blockLabel(b)) + '</h4>' + RT().toHtml(b.text) + '</div>';
      });
    } else if (e.text) h += '<div class="ps-blk">' + RT().toHtml(e.text) + '</div>';
    var reps = e.replies || [];
    if (reps.length) {
      h += '<div class="ps-blk"><h4>' + esc(L('ถาม/ตอบ ({n})', { n: reps.length })) + '</h4>' + reps.slice(-6).map(function (r) {
        var u = S.user(r.by);
        return '<div class="ps-reply"><b>' + esc(u ? u.name : '—') + '</b> ' + esc(S.plainText(r.body).slice(0, 400)) + '</div>';
      }).join('') + '</div>';
    }
    return h + '</div>';
  }

  function printProject(pid) {
    var p = S.project(pid);
    if (!p || !S.projectAccess(pid)) return '';
    var s = S.projectStats(pid), td = S.today(), owner = S.user(p.owner);
    var log = p.statusLog || [];
    var sub = [owner ? L('เจ้าของ {n}', { n: owner.name }) : '', p.startOn || p.dueOn ? (p.startOn ? fmtDate(p.startOn) : '…') + ' – ' + (p.dueOn ? fmtDate(p.dueOn) : '…') : '']
      .filter(Boolean).map(esc).join(' · ');
    var h = '<div class="ps-doc">' + psHead(esc(p.icon + ' ' + p.name), sub);
    h += '<section class="ps-kpis">' + psKpi(s.percent + '%', L('ความคืบหน้า')) + psKpi(s.done + '/' + s.total, L('งานเสร็จ')) +
      psKpi(s.overdue, L('งานเลยกำหนด'), s.overdue ? 'bad' : '') + psKpi(s.dueWeek, L('ครบใน 7 วัน')) + psKpi(s.blocked, L('ถูกบล็อก'), s.blocked ? 'warn' : '') + '</section>';
    h += '<section><h2>' + esc(L('สถานะล่าสุด')) + '</h2>' + psStatusBlock(p, log[log.length - 1]) + '</section>';
    /* งานเลยกำหนด — ช้าที่สุดขึ้นก่อน (นับงานหลักแบบเดียวกับตัวเลขข้างบน) */
    var od = S.tasksInProject(pid).map(function (x) { return x.task; })
      .filter(function (t) { return !t.completed && t.dueOn && t.dueOn < td; })
      .sort(function (a, b) { return a.dueOn < b.dueOn ? -1 : 1; });
    h += '<section><h2>' + esc(L('งานเลยกำหนด ({n})', { n: od.length })) + '</h2>';
    if (!od.length) h += '<p class="ps-none">' + esc(L('ไม่มีงานเลยกำหนด')) + '</p>';
    else {
      h += '<table class="ps-tbl"><thead><tr><th>' + esc(L('ชื่องาน')) + '</th><th>' + esc(L('ผู้รับผิดชอบ')) + '</th><th>' + esc(L('กำหนดส่ง')) +
        '</th><th class="r">' + esc(L('เลยมา (วัน)')) + '</th></tr></thead><tbody>';
      od.slice(0, 80).forEach(function (t) {
        var u = S.user(t.assigneeId);
        h += '<tr><td>' + esc(t.name) + '</td><td>' + esc(u ? u.name : L('ยังไม่มอบหมาย')) + '</td><td>' + esc(fmtDate(t.dueOn)) +
          '</td><td class="r bad">' + S.daysBetween(t.dueOn, td) + '</td></tr>';
      });
      h += '</tbody></table>' + (od.length > 80 ? '<p class="ps-none">' + esc(L('และอีก {n} งาน', { n: od.length - 80 })) + '</p>' : '');
    }
    h += '</section>';
    var ms = S.projectMilestones(pid, false);
    if (ms.length) {
      h += '<section><h2>' + esc(L('หมุดหมายที่ยังไม่ถึง')) + '</h2><table class="ps-tbl"><thead><tr><th>' + esc(L('หมุดหมาย')) + '</th><th>' +
        esc(L('กำหนดส่ง')) + '</th></tr></thead><tbody>' + ms.slice(0, 20).map(function (t) {
          return '<tr><td>◆ ' + esc(t.name) + '</td><td class="' + (t.dueOn && t.dueOn < td ? 'bad' : '') + '">' + esc(t.dueOn ? fmtDate(t.dueOn) : '—') + '</td></tr>';
        }).join('') + '</tbody></table></section>';
    }
    h += '<section><h2>' + esc(L('ความคืบหน้าตามคอลัมน์')) + '</h2><table class="ps-tbl"><tbody>' + p.sections.map(function (sec) {
      var inS = S.tasksInProject(pid).filter(function (x) { return x.membership.sectionId === sec.id; });
      var dn = inS.filter(function (x) { return x.task.completed; }).length;
      var pc = inS.length ? Math.round(dn * 100 / inS.length) : 0;
      return '<tr><td>' + esc(sec.name) + '</td><td class="ps-barcell"><span class="ps-bar"><i style="width:' + pc + '%"></i></span></td><td class="r">' + dn + '/' + inS.length + '</td></tr>';
    }).join('') + '</tbody></table></section>';
    return h + '</div>';
  }

  function printPortfolio(fid) {
    var f = S.portfolio(fid);
    if (!f) return '';
    var list = S.allProjectsUnder(fid), st = S.portfolioStats(fid);
    var h = '<div class="ps-doc">' + psHead(esc((f.icon || '') + ' ' + f.name), f.description ? esc(f.description) : '');
    h += '<section class="ps-kpis">' + psKpi(st.projects, L('โปรเจกต์')) + psKpi(st.percent + '%', L('ความคืบหน้ารวม')) +
      psKpi(st.atRisk, L('ต้องจับตา'), st.atRisk ? 'warn' : '') + psKpi(st.overdue, L('งานเลยกำหนด'), st.overdue ? 'bad' : '') + psKpi(st.total, L('งานทั้งหมด')) + '</section>';
    if (st.hidden) h += '<p class="ps-none">' + esc(L('มีอีก {n} โปรเจกต์ในพอร์ตโฟลิโอนี้ที่คุณไม่มีสิทธิ์เห็น ตัวเลขข้างบนจึงไม่รวมของพวกนั้น', { n: st.hidden })) + '</p>';
    var flog = f.statusLog || [];
    if (flog.length) h += '<section><h2>' + esc(L('สถานะของพอร์ตโฟลิโอ')) + '</h2>' + psStatusBlock(f, flog[flog.length - 1]) + '</section>';
    var risky = list.filter(function (p) { return S.needsWatch(p); });
    h += '<section><h2>' + esc(L('ต้องจับตา')) + ' (' + risky.length + ')</h2>';
    if (!risky.length) h += '<p class="ps-none">' + esc(L('ยังไม่มีโปรเจกต์ที่น่าห่วง')) + '</p>';
    risky.forEach(function (p) {
      var s = S.projectStats(p.id);
      h += '<div class="ps-watch"><b>' + esc(p.icon + ' ' + p.name) + '</b>' + (p.status ? statePill(p.status.state) : '') +
        (s.overdue ? '<span class="bad">' + esc(L('เลยกำหนด {n}', { n: s.overdue })) + '</span>' : '') +
        (p.status && p.status.text ? '<div class="ps-watch-t">' + esc(S.plainText(p.status.text).slice(0, 300)) + '</div>' : '') + '</div>';
    });
    h += '</section>';
    h += '<section><h2>' + esc(L('สถานะทุกโปรเจกต์')) + '</h2><table class="ps-tbl"><thead><tr><th>' + esc(L('ชื่อ')) + '</th><th>' + esc(L('สถานะ')) +
      '</th><th>' + esc(L('ความคืบหน้า')) + '</th><th class="r">' + esc(L('เลยกำหนด')) + '</th><th>' + esc(L('กำหนดส่ง')) + '</th><th>' +
      esc(L('เจ้าของ')) + '</th><th>' + esc(L('รายงานล่าสุด')) + '</th></tr></thead><tbody>';
    list.forEach(function (p) {
      var s = S.projectStats(p.id), o = S.user(p.owner), at = S.statusAt(p);
      h += '<tr><td>' + esc(p.icon + ' ' + p.name) + '</td><td>' + statePill(p.status && p.status.state) + '</td><td class="ps-barcell"><span class="ps-bar"><i style="width:' +
        s.percent + '%"></i></span> ' + s.percent + '%</td><td class="r' + (s.overdue ? ' bad' : '') + '">' + s.overdue + '</td><td>' + esc(p.dueOn ? fmtDate(p.dueOn) : '—') +
        '</td><td>' + esc(o ? o.name : '—') + '</td><td>' + esc(at ? fmtDate(String(at).slice(0, 10)) : L('ยังไม่รายงาน')) + '</td></tr>';
    });
    h += '</tbody></table></section>';
    return h + '</div>';
  }

  function printReport(rid) {
    var r = S.report(rid);
    if (!r || !S.canSeeReport(rid)) return '';
    var h = '<div class="ps-doc">' + psHead(esc(r.name), esc(R.rpScopeText ? R.rpScopeText(r) : ''));
    if (!r.widgets.length) h += '<p class="ps-none">' + esc(L('ยังไม่มีวิดเจ็ต')) + '</p>';
    h += '<div class="ps-charts">';
    r.widgets.forEach(function (w) {
      var src = (S.REPORT_SRCS.filter(function (x) { return x[0] === w.src; })[0] || ['', ''])[1];
      var spec = R.rpSpec(r, w, { act: 'rpe-noop' });
      spec.w = w.full ? 980 : 560;
      h += '<section class="ps-chart' + (w.full ? ' full' : '') + '"><h2>' + esc(w.title ? L(w.title) : L(src)) + '</h2>' + global.Charts.svg(spec) + '</section>';
    });
    return h + '</div></div>';
  }

  function sheetEl() {
    var el = document.getElementById('printSheet');
    if (!el) {
      el = document.createElement('div');
      el.id = 'printSheet';
      el.className = 'print-sheet';
      document.body.appendChild(el);
    }
    return el;
  }
  /** วาดหน้ากระดาษแล้วเปิดกล่องพิมพ์ ชื่อหน้าต่างเปลี่ยนชั่วคราวให้เป็นชื่อไฟล์ PDF ที่อ่านรู้เรื่อง */
  function printSheet(html, title) {
    if (!html) return false;
    var el = sheetEl(), oldTitle = document.title;
    el.innerHTML = html;
    document.body.classList.add('printing');
    if (title) document.title = title;
    var done = function () {
      global.removeEventListener('afterprint', done);
      document.body.classList.remove('printing');
      document.title = oldTitle;
      el.innerHTML = '';
    };
    global.addEventListener('afterprint', done);
    /* รอหนึ่งจังหวะให้เบราว์เซอร์จัดหน้าและโหลดฟอนต์ไทยก่อนเปิดกล่องพิมพ์ */
    setTimeout(function () { try { global.print(); } catch (err) { done(); } }, 120);
    return true;
  }

  /* ---------- เสียบเข้า Render ---------- */
  var baseActs = R.topbarActsExt;
  var X = {
    ui2c: ui, execWidget: execWidget, homeActTabs: homeActTabs, homeActivityBody: homeActivityBody,
    statusChangeHtml: statusChangeHtml, statusThread: statusThread, pfCards: pfCards, landingPicker: landingPicker,
    printProject: printProject, printPortfolio: printPortfolio, printReport: printReport, printLink: printLink,
    /* ปุ่มพิมพ์บนแถบบน — ทุกแท็บของพอร์ตโฟลิโอ และหน้ารายงาน (ของโปรเจกต์อยู่ในการ์ด "ตอนนี้ถึงไหนแล้ว" ของหน้าภาพรวม) */
    topbarActsExt: function (route) {
      var h = baseActs ? baseActs(route) || '' : '';
      if (route.type === 'portfolio' && S.portfolio(route.id)) h = printBtn('portfolio', route.id) + h;
      else if (route.type === 'report' && S.report(route.id)) h = printBtn('report', route.id) + h;
      return h;
    }
  };
  Object.keys(X).forEach(function (k) { R[k] = X[k]; });

  /* ====================== การโต้ตอบ ====================== */
  global.OrbitExt = global.OrbitExt || [];
  global.OrbitExt.push(function (api) {
    var state = api.state, toast = api.toast;

    /* หน้าแรกเป็นของแต่ละคน (เหมือน home-w-move) · ถาม/ตอบ = แสดงความเห็นได้ (store ตรวจสิทธิ์รายโปรเจกต์ซ้ำ) */
    api.needs('self', ['home-w-top', 'home-w-exec', 'home-act-filter', 'set-landing-x']);
    api.needs('comment', ['st-reply', 'st-reply-del']);

    function rerender() { api.renderViewBody(); }

    /* ส่งแล้วช่องพิมพ์ยังโฟกัสอยู่ (แบบเดียวกับปุ่มส่งความเห็น) ไม่ให้แถบเครื่องมือหุบจนปุ่มขยับหนีเมาส์ */
    document.addEventListener('mousedown', function (e) {
      var b = e.target.closest && e.target.closest('[data-act="st-reply"]');
      var ae = document.activeElement;
      if (b && ae && ae.classList && ae.classList.contains('rte')) e.preventDefault();
    }, true);
    /* Ctrl+Enter ในช่องถาม/ตอบ = ส่ง */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
      var box = e.target.closest && e.target.closest('.sthr-box');
      if (!box) return;
      e.preventDefault();
      var btn = box.querySelector('[data-act="st-reply"]');
      if (btn) btn.click();
    });

    /** ล้างร่างของช่องพิมพ์ — main.js เก็บร่างของ .rte-msg ตอน input จึงยิง input ให้มันลบร่างเอง */
    function setBox(ed, html) {
      if (!ed) return;
      ed.innerHTML = html || '';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    }

    api.act(function (act, el) {
      var id = el.dataset.id;
      switch (act) {
        /* --- หน้าแรก --- */
        case 'home-w-top': {
          var lt = S.homeLayout(), ti = +el.dataset.i;
          if (!(ti > 0) || !lt[ti]) return true;
          lt.unshift(lt.splice(ti, 1)[0]);
          S.setHomeLayout(lt);
          return true;
        }
        case 'home-w-exec': {
          var cur = S.homeLayout();
          var rest = cur.filter(function (x) { return x.w !== 'exec' && x.w !== 'status'; });
          var st0 = cur.filter(function (x) { return x.w === 'status'; })[0];
          S.setHomeLayout([{ w: 'exec', full: true }, { w: 'status', full: st0 ? st0.full : false }].concat(rest));
          toast(L('จัดหน้าแรกแบบผู้บริหารแล้ว'), L('ย้อนกลับ'), 'undo');
          return true;
        }
        case 'home-act-filter':
          S.setPref('homeAct', el.dataset.v === 'decisions' ? 'decisions' : 'all');
          rerender();
          return true;
        case 'x2c-search': {
          /* ตัวเลขบนการ์ด = เงื่อนไขชุดเดียวกับที่เปิดตรงนี้ จำนวนที่เห็นจึงตรงกันพอดี */
          api.closeSidebar();
          state.route = { type: 'search', q: '' };
          state.adv.conds = S.execConds(el.dataset.v);
          state.adv.mode = 'list';
          state.adv.open = true;
          api.clearSel();
          api.renderAll();
          return true;
        }
        case 'x2c-pf-progress':
          if (!S.portfolio(id)) return true;
          state.route = { type: 'portfolio', id: id, view: 'progress' };
          api.renderAll();
          return true;

        /* --- บรีฟ / หมุดหมาย: โหมดอ่านก่อน --- */
        case 'brief-edit': {
          var on = !ui.brief[id];
          ui.brief[id] = on;
          rerender();
          if (on) setTimeout(function () {
            var ed = document.querySelector('.rte-brief[data-id="' + id + '"]');
            if (ed) ed.focus();
          }, 0);
          return true;
        }
        case 'ms-edit':
          ui.ms[id] = !ui.ms[id];
          rerender();
          return true;

        /* --- ถาม/ตอบใต้รายงานสถานะ --- */
        case 'st-thread':
          ui.thr[el.dataset.e] = el.getAttribute('aria-expanded') !== 'true';
          rerender();
          /* เปิดเธรดที่ยังไม่มีใครถาม = ตั้งใจจะพิมพ์ โฟกัสช่องให้เลย */
          if (ui.thr[el.dataset.e]) setTimeout(function () {
            var ed = document.querySelector('.rte-msg[data-key="sr:' + el.dataset.e + '"]');
            var se = S.statusEntry(id, el.dataset.e);
            if (ed && se && !(se.replies || []).length) ed.focus();
          }, 0);
          return true;
        case 'st-reply': {
          var eid = el.dataset.e;
          var ed2 = document.querySelector('.rte-msg[data-key="sr:' + eid + '"]');
          var md = ed2 ? RT().fromNode(ed2) : '';
          if (!md.trim()) { toast(L('พิมพ์ข้อความก่อน')); return true; }
          /* ล้างก่อนบันทึก — การบันทึกวาดหน้าใหม่และคืนร่างที่ค้างอยู่ใส่ช่องใหม่ (เหตุผลเดียวกับโพสต์ประกาศ) */
          setBox(ed2, '');
          ui.thr[eid] = true;
          if (S.addStatusReply(id, eid, md)) {
            toast(L('ส่งแล้ว'), L('ย้อนกลับ'), 'undo');
          } else {
            var again = document.querySelector('.rte-msg[data-key="sr:' + eid + '"]');
            setBox(again, RT().toHtml(md, { editable: true }));
            api.denyToast();
          }
          return true;
        }
        case 'st-reply-del':
          if (S.deleteStatusReply(id, el.dataset.e, el.dataset.r)) toast(L('ลบคำตอบแล้ว'), L('ย้อนกลับ'), 'undo');
          else api.denyToast();
          return true;

        /* --- พิมพ์ --- */
        case 'x2c-print': {
          var k = el.dataset.k, html = '', name = '';
          if (k === 'project') { html = printProject(id); name = (S.project(id) || {}).name; }
          else if (k === 'portfolio') { html = printPortfolio(id); name = (S.portfolio(id) || {}).name; }
          else if (k === 'report') { html = printReport(id); name = (S.report(id) || {}).name; }
          if (!printSheet(html, 'Orbit - ' + (name || '') + ' - ' + S.today())) api.denyToast();
          return true;
        }
      }
      return false;
    });

    api.change(function (act, el) {
      if (act !== 'set-landing-x') return false;
      S.setPref('landing', el.value || 'home');
      api.openModal(api.settingsModal('general'), true);
      toast(L('บันทึกหน้าที่เปิดเมื่อเข้าแอปแล้ว'));
      return true;
    });
  });

})(window);

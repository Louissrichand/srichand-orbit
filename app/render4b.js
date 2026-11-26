/* Orbit — หน้าจอของชิ้นงาน 4b (ภาระงาน ไทม์ชีต รายงานรวม สื่อฝัง)
 *
 * แยกจาก render.js เพราะไฟล์นั้นใหญ่มากแล้ว ใช้ตัวช่วยชุดเดียวกันผ่าน global.Render
 * ทุกฟังก์ชันคืน HTML string ล้วน การผูก event อยู่ที่ ui4b.js (data-act)
 */
(function (global) {
  'use strict';

  var S = global.Store, R = global.Render, L = global.I18N.t, I = global.Icons.icon;
  var esc = R.esc, avatar = R.avatar, fmtDate = R.fmtDate;

  function pill(color, label) {
    return '<span class="status-pill" style="background:' + color + '22;color:' + color + '"><i style="background:' + color + '"></i>' + esc(label) + '</span>';
  }
  function seg(act, list, cur, extra) {
    return '<span class="segmented sm">' + list.map(function (x) {
      return '<button data-act="' + act + '" data-v="' + esc(x[0]) + '"' + (extra || '') + ' class="' + (cur === x[0] ? 'on' : '') + '">' + esc(L(x[1])) + '</button>';
    }).join('') + '</span>';
  }
  function sel(act, list, cur, extra) {
    return '<select class="opt-select" data-act="' + act + '"' + (extra || '') + '>' + list.map(function (x) {
      return '<option value="' + esc(x[0]) + '"' + (String(cur) === String(x[0]) ? ' selected' : '') + '>' + esc(x[1]) + '</option>';
    }).join('') + '</select>';
  }
  function hours(min) { return S.fmtMinutes(min) || '0'; }
  function dShort(d) {
    var p = d.split('-');
    return parseInt(p[2], 10) + ' ' + R.MON()[parseInt(p[1], 10) - 1];
  }

  /* ====================== แถบซ้าย / แถบบน ====================== */
  function sidebarExt(route) {
    var item = function (type, icon, label, on) {
      return '<button class="sb-item' + (on ? ' active' : '') + '" data-act="go" data-route="' + type + '">' + I(icon) +
        '<span class="grow">' + L(label) + '</span></button>';
    };
    var due = S.tsReviewQueue ? S.tsReviewQueue().filter(function (x) { return x.status === 'submitted'; }).length : 0;
    return item('workload', 'gauge', 'ภาระงาน', route.type === 'workload') +
      '<button class="sb-item' + (route.type === 'timesheets' ? ' active' : '') + '" data-act="go" data-route="timesheets">' + I('clock') +
      '<span class="grow">' + L('ไทม์ชีต') + '</span>' + (due ? '<span class="count alert" title="' + esc(L('ไทม์ชีตรอตรวจ')) + '">' + due + '</span>' : '') + '</button>' +
      item('reports', 'chart', 'รายงาน', route.type === 'reports' || route.type === 'report');
  }
  function topbarExt(route) {
    if (route.type === 'workload') return '<div class="tb-title">' + I('gauge', 20) + ' ' + L('ภาระงาน') + '</div>';
    if (route.type === 'timesheets') return '<div class="tb-title">' + I('clock', 20) + ' ' + L('ไทม์ชีต') + '</div>';
    if (route.type === 'reports') return '<div class="tb-title">' + I('chart', 20) + ' ' + L('รายงาน') + '</div>';
    if (route.type === 'report') {
      var r = S.report(route.id);
      return '<div class="tb-title">' + I('chart', 20) + ' <span class="nm">' + esc(r ? r.name : L('รายงาน')) + '</span></div>';
    }
    return '';
  }
  function topbarActsExt(route) {
    if (route.type === 'reports' && S.can('write')) return '<button class="btn btn-primary" data-act="rp-new">' + L('+ สร้างรายงาน') + '</button>';
    if (route.type === 'report') {
      var r = S.report(route.id);
      if (!r) return '';
      var h = '';
      if (r.owner === S.db.currentUserId) h += '<button class="btn" data-act="rp-share" data-id="' + esc(r.id) + '">' + I('users', 14) + '<span class="hide-sm"> ' + L('แชร์') + '</span></button>';
      if (S.canEditReport(r.id)) h += '<button class="btn btn-primary" data-act="rp-wadd" data-id="' + esc(r.id) + '"' +
        (r.widgets.length >= S.REPORT_W_MAX ? ' disabled' : '') + '>' + I('plus', 13) + '<span class="hide-sm"> ' + L('เพิ่มวิดเจ็ต') + '</span></button>';
      h += '<button class="btn btn-ghost" data-act="rp-menu" data-id="' + esc(r.id) + '" title="' + L('ตัวเลือก') + '">' + I('more') + '</button>';
      return h;
    }
    return '';
  }

  /* ====================== ภาระงาน ====================== */
  var ZOOM_LABEL = [['day', 'วัน'], ['week', 'สัปดาห์'], ['month', 'เดือน']];
  var UNIT_LABEL = { count: 'งาน', h: 'ชม.', pt: 'พอยต์', pct: '%' };
  var CAP_LABEL = { count: 'งาน/วัน', h: 'ชม./วัน', pt: 'พอยต์/วัน', pct: '%/วัน' };

  function wlFmt(v, key) {
    var n = Math.round(v * 10) / 10;
    return key === 'pct' ? n + '%' : String(n);
  }
  function colLabel(c, zoom) {
    if (zoom === 'day') {
      var d = new Date(c.from + 'T00:00:00');
      return '<b>' + esc(R.DOW()[d.getDay()]) + '</b><span>' + d.getDate() + '</span>';
    }
    if (zoom === 'month') {
      var p = c.from.split('-');
      return '<b>' + esc(R.MON()[parseInt(p[1], 10) - 1]) + '</b><span>' + esc(global.I18N.yearShort(+p[0])) + '</span>';
    }
    return '<b>' + esc(dShort(c.from)) + '</b><span>' + esc(L('สัปดาห์')) + '</span>';
  }
  function wlColor(t) {
    var ps = S.projectsOfTask(t.parentId ? (function () { var r = t; var g = 0; while (r.parentId && S.task(r.parentId) && g++ < 8) r = S.task(r.parentId); return r.id; })() : t.id);
    return ps.length ? ps[0].project.color : 'var(--accent)';
  }
  /** เปอร์เซ็นต์ตำแหน่ง/ความกว้างบนแกนวันของช่วงที่แสดงอยู่ */
  function span(from, to, s, e) {
    var D = S.daysBetween(from, to) + 1;
    var a = s < from ? from : s, b = e > to ? to : e;
    if (b < a) return null;
    return { left: S.daysBetween(from, a) / D * 100, width: (S.daysBetween(a, b) + 1) / D * 100, cutL: s < from, cutR: e > to };
  }

  /**
   * scope = { kind: 'project'|'portfolio'|'all', id, team }
   * ui = { cfg (S.wlCfg + anchor), open: { uid: true } }
   */
  function workloadView(scope, ui) {
    var cfg = ui.cfg, d = S.workload(scope, cfg);
    var key = d.capKey, unit = UNIT_LABEL[key];
    var h = '<div class="wl" data-scope="' + esc(scope.kind) + '">';

    /* แถบเครื่องมือ — ซ้าย = ช่วงเวลา ขวา = วัดอะไร */
    var srcOpts = [['count', L('จำนวนงาน')], ['estimate', L('แรงงาน: เวลาประมาณ')]];
    S.wlEffortFields(scope).forEach(function (f) { srcOpts.push(['field:' + f.id, L('แรงงาน: {f}', { f: f.name }) + (f.lib ? ' · ' + L('คลังฟิลด์') : '')]); });
    var srcCur = cfg.measure === 'count' ? 'count' : cfg.src;
    h += '<div class="wl-bar">' + seg('wl-zoom', ZOOM_LABEL, cfg.zoom) +
      '<div class="wl-nav"><button class="btn btn-sm btn-ghost" data-act="wl-nav" data-d="-1" title="' + L('ก่อนหน้า') + '">' + I('arrowLeft', 14) + '</button>' +
      '<button class="btn btn-sm" data-act="wl-nav" data-d="0">' + L('วันนี้') + '</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="wl-nav" data-d="1" title="' + L('ถัดไป') + '">' + I('arrowRight', 14) + '</button></div>' +
      '<span class="wl-range">' + esc(fmtDate(d.from)) + ' – ' + esc(fmtDate(d.to)) + '</span><span class="grow"></span>';
    if (scope.kind === 'all') {
      h += sel('wl-team', [['', L('ทุกคนที่เห็นได้')]].concat(S.visibleTeams().map(function (t) { return [t.id, L('ทีม {t}', { t: t.name })]; })), scope.team || '');
    }
    h += sel('wl-src', srcOpts, srcCur);
    if (cfg.measure === 'effort' && cfg.src !== 'estimate') {
      h += sel('wl-unit', [['h', L('หน่วย: ชั่วโมง')], ['pt', L('หน่วย: พอยต์')], ['pct', L('หน่วย: % ต่อวัน')]], cfg.unit);
    }
    h += '</div>';

    var note = [];
    if (cfg.measure === 'effort' && d.noEffort) note.push(L('มี {n} งานที่ยังไม่ได้ใส่ค่าแรงงาน จึงไม่ถูกนับ (เห็นได้ในแถบรายละเอียดของแต่ละคน)', { n: d.noEffort }));
    if (cfg.measure === 'effort' && cfg.unit !== 'pct') note.push(L('ค่าแรงงานกระจายเท่า ๆ กันบนวันทำงานในช่วงของงาน'));
    if (cfg.measure === 'effort' && cfg.unit === 'pct') note.push(L('ค่า % คือสัดส่วนของวันที่งานนี้ใช้ ทุกวันในช่วงของงาน'));
    h += '<div class="wl-legend"><span><i class="lg-over"></i>' + L('เกินความจุ') + '</span><span><i class="lg-away"></i>' + L('ไม่อยู่') + '</span>' +
      '<span class="wl-hint">' + L('คลิกชื่อเพื่อดูงาน · ลากแถบงานเพื่อเลื่อนวันหรือมอบให้คนอื่น · คลิกช่องว่างเพื่อสร้างงาน') + '</span></div>';
    if (note.length) h += '<div class="wl-note">' + note.map(esc).join('<br>') + '</div>';

    if (!d.rows.length) {
      return h + '<div class="empty"><div class="big">🧭</div>' + L('ยังไม่มีงานที่มีผู้รับผิดชอบและมีวันในขอบเขตนี้') + '</div></div>';
    }
    var tmpl = 'var(--wl-name) ' + d.cols.map(function (c) { return (S.daysBetween(c.from, c.to) + 1) + 'fr'; }).join(' ');
    var minW = { day: 46, week: 74, month: 110 }[cfg.zoom] * d.cols.length;
    var td = S.today();
    h += '<div class="wl-scroll"><div class="wl-grid" style="grid-template-columns:' + tmpl + ';min-width:calc(var(--wl-name) + ' + minW + 'px)" ' +
      'data-from="' + d.from + '" data-to="' + d.to + '">';
    h += '<div class="wl-h wl-hname">' + L('คน') + '<em>' + esc(L('หน่วย: {u}', { u: L(unit) })) + '</em></div>';
    d.cols.forEach(function (c) {
      var wk = new Date(c.from + 'T00:00:00').getDay();
      h += '<div class="wl-h' + (td >= c.from && td <= c.to ? ' now' : '') + (cfg.zoom === 'day' && (wk === 0 || wk === 6) ? ' wkend' : '') + '">' + colLabel(c, cfg.zoom) + '</div>';
    });
    d.rows.forEach(function (row) {
      var u = S.user(row.uid), open = !!(ui.open && ui.open[row.uid]);
      h += '<button class="wl-name' + (open ? ' open' : '') + (row.over ? ' over' : '') + '" data-act="wl-open" data-uid="' + esc(row.uid) + '">' +
        I(open ? 'chevronDown' : 'chevronRight', 12) + avatar(u, 'sm') + '<span class="grow"><b>' + esc(u.name) + '</b><em>' +
        esc(L('ความจุ {n} {u}', { n: row.cap, u: L(CAP_LABEL[key]) })) + '</em></span>' +
        (row.warn.length ? '<span class="wl-warn" title="' + esc(L('มี {n} งานตรงกับช่วงที่ไม่อยู่', { n: row.warn.length })) + '">' + I('alert', 13) + '</span>' : '') +
        '</button>';
      row.cells.forEach(function (c, i) {
        var col = d.cols[i];
        var pct = c.cap > 0 ? Math.min(100, c.v / c.cap * 100) : (c.v > 0 ? 100 : 0);
        var aw = c.days ? c.away / c.days : 0;
        h += '<div class="wl-cell' + (c.over ? ' over' : '') + (c.v ? '' : ' wl-zero') + (aw >= 1 ? ' away-full' : aw > 0 ? ' away-part' : '') +
          '" data-act="wl-cell" data-uid="' + esc(row.uid) + '" data-from="' + col.from + '" data-to="' + col.to + '" style="--aw:' + aw.toFixed(2) + '" title="' +
          esc(L('{v} จาก {c} {u}', { v: wlFmt(c.v, key), c: wlFmt(c.cap, key), u: L(unit) }) + (c.away ? ' · ' + L('ไม่อยู่ {n} วัน', { n: c.away }) : '')) + '">' +
          '<span class="wl-fill" style="height:' + pct.toFixed(1) + '%"></span>' +
          (c.v ? '<span class="wl-v">' + esc(wlFmt(c.v, key)) + '</span>' : '') + '</div>';
      });
      if (open) h += wlDetail(row, d, u, key);
    });
    h += '</div></div></div>';
    return h;
  }

  function wlDetail(row, d, u, key) {
    var canEd = S.canEditPerson(row.uid);
    var h = '<div class="wl-detail" data-uid="' + esc(row.uid) + '">';
    h += '<div class="wl-dhead">' + avatar(u, 'sm') + '<b>' + esc(u.name) + '</b><span>' + esc(L('{n} งานในช่วงนี้', { n: row.tasks.length })) + '</span>' +
      (canEd ? '<button class="btn btn-sm" data-act="wl-cap" data-uid="' + esc(row.uid) + '" data-k="' + key + '">' + I('gauge', 13) + ' ' +
        esc(L('ความจุ {n} {u}', { n: row.cap, u: L(CAP_LABEL[key]) })) + '</button>' +
        '<button class="btn btn-sm" data-act="set-away" data-uid="' + esc(row.uid) + '">' + I('calendar', 13) + ' ' + L('ช่วงไม่อยู่') +
        (S.awayRanges(row.uid).length ? ' (' + S.awayRanges(row.uid).length + ')' : '') + '</button>' : '') + '</div>';
    /* ช่วงไม่อยู่วาดเป็นแถบลายบนทุกแถวของคนนี้ */
    var stripes = '';
    S.awayRanges(row.uid).forEach(function (r) {
      var sp = span(d.from, d.to, r.from || d.from, r.to);
      if (sp) stripes += '<span class="wl-away" style="left:' + sp.left.toFixed(3) + '%;width:' + sp.width.toFixed(3) + '%" title="' +
        esc(L('ไม่อยู่') + (r.note ? ' · ' + r.note : '')) + '"></span>';
    });
    if (!row.tasks.length) {
      h += '<div class="wl-trow"><div class="wl-tname muted">' + L('ไม่มีงานในช่วงนี้') + '</div><div class="wl-track" data-act="wl-track" data-uid="' + esc(row.uid) + '">' + stripes + '</div></div>';
    }
    row.tasks.forEach(function (x) {
      var t = x.t, sp = span(d.from, d.to, x.s, x.e);
      var warn = row.warn.indexOf(t.id) >= 0;
      var effTxt = x.v === null ? L('ไม่มีค่า') : (key === 'count' ? '' : wlFmt(x.v, key) + (key === 'pct' ? '' : ' ' + L(UNIT_LABEL[key])));
      h += '<div class="wl-trow"><button class="wl-tname" data-act="open-task" data-id="' + esc(t.id) + '" title="' + esc(t.name) + '">' +
        (warn ? '<span class="wl-warn">' + I('alert', 12) + '</span>' : '') + esc(t.name) + '</button>' +
        '<div class="wl-track" data-act="wl-track" data-uid="' + esc(row.uid) + '">' + stripes;
      if (sp) {
        h += '<div class="wl-tbar' + (warn ? ' warn' : '') + (x.v === null ? ' noval' : '') + (sp.cutL ? ' cut-l' : '') + (sp.cutR ? ' cut-r' : '') +
          '" data-wl-task="' + esc(t.id) + '" data-uid="' + esc(row.uid) + '" data-act="open-task" data-id="' + esc(t.id) + '" style="left:' + sp.left.toFixed(3) +
          '%;width:' + sp.width.toFixed(3) + '%;--c:' + esc(wlColor(t)) + '" title="' + esc(t.name + ' · ' + fmtDate(x.s) + (x.e !== x.s ? ' – ' + fmtDate(x.e) : '') +
          (warn ? ' · ' + L('ตรงกับช่วงที่ไม่อยู่') : '')) + '"><span>' + esc(t.name) + '</span>' + (effTxt ? '<em>' + esc(effTxt) + '</em>' : '') + '</div>';
      }
      h += '</div></div>';
    });
    return h + '</div>';
  }

  /** หน้าต่างช่วงไม่อยู่ (หลายช่วง) ของคนหนึ่ง */
  function awayModal(uid) {
    var u = S.user(uid), mine = uid === S.db.currentUserId;
    var list = S.awayRanges(uid).slice().sort(function (a, b) { return (a.from || '') < (b.from || '') ? -1 : 1; });
    var td = S.today();
    var h = '<h2>' + (mine ? L('ช่วงไม่อยู่ของฉัน') : esc(L('ช่วงไม่อยู่ของ {n}', { n: u ? u.name : '' }))) + '</h2>' +
      '<p class="prj-note">' + L('ตั้งได้หลายช่วง (ลา ประชุมนอกสถานที่ เดินทาง) ระหว่างช่วงนั้นชื่อจะมีจุดสีส้ม ภาระงานจะแรเงาวันนั้น และการมอบหมายแบบวนรอบจะข้ามไป') + '</p>';
    h += '<div class="aw-list">';
    if (!list.length) h += '<div class="ovw-empty">' + L('ยังไม่มีช่วงไม่อยู่') + '</div>';
    list.forEach(function (r) {
      var past = r.to < td, now = (!r.from || r.from <= td) && r.to >= td;
      h += '<div class="aw-row' + (past ? ' past' : '') + '">' + I('calendar', 14) + '<span class="grow"><b>' +
        esc(r.from ? fmtDate(r.from) : L('ตอนนี้')) + ' – ' + esc(fmtDate(r.to)) + '</b>' + (r.note ? '<em>' + esc(r.note) + '</em>' : '') + '</span>' +
        (now ? '<span class="chip">' + L('กำลังไม่อยู่') + '</span>' : past ? '<span class="chip">' + L('ผ่านไปแล้ว') + '</span>' : '') +
        '<button class="x" data-act="away-del" data-uid="' + esc(uid) + '" data-id="' + esc(r.id) + '" title="' + L('ลบช่วงนี้') + '">' + I('close', 12) + '</button></div>';
    });
    h += '</div><div class="aw-add"><div class="prj-2col">' +
      '<div class="field"><label>' + L('ตั้งแต่') + '</label><input id="awFrom" type="date" value="' + td + '"></div>' +
      '<div class="field"><label>' + L('ถึง') + ' *</label><input id="awTo" type="date" value=""></div></div>' +
      '<div class="field"><label>' + L('ข้อความสั้น ๆ (ไม่บังคับ)') + '</label><input id="awNote2" maxlength="140" placeholder="' + esc(L('เช่น ลาพักร้อน ติดต่อคุณมานีแทน')) + '"></div>' +
      '<button class="btn btn-primary" data-act="away-add" data-uid="' + esc(uid) + '">' + I('plus', 13) + ' ' + L('เพิ่มช่วงไม่อยู่') + '</button></div>';
    h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('เสร็จแล้ว') + '</button></div>';
    return h;
  }

  /* ====================== ไทม์ชีต ====================== */
  function tsState(id) { return S.TS_STATES.filter(function (x) { return x.id === id; })[0] || S.TS_STATES[0]; }
  function weekLabel(w) { return fmtDate(w) + ' – ' + fmtDate(S.addDays(w, 6)); }

  function tsGridHtml(g, editable, ui) {
    var cats = S.timeCats();
    var h = '<div class="ts-scroll"><table class="ts-grid"><thead><tr><th class="ts-task">' + L('งาน') + '</th>';
    g.days.forEach(function (d) {
      var dt = new Date(d + 'T00:00:00');
      h += '<th class="ts-day' + (d === S.today() ? ' now' : '') + '"><b>' + esc(R.DOW()[dt.getDay()]) + '</b><span>' + dt.getDate() + '</span></th>';
    });
    h += '<th>' + L('รวม') + '</th><th title="' + esc(L('เก็บเงินลูกค้าได้ (billable)')) + '">' + L('เก็บเงินได้') + '</th><th>' + L('หมวด') + '</th></tr></thead><tbody>';
    if (!g.rows.length) h += '<tr><td colspan="11" class="ts-empty">' + L('ยังไม่มีเวลาที่ลงไว้ในสัปดาห์นี้ กด “+ เพิ่มงาน” เพื่อเลือกงานที่จะลงเวลา') + '</td></tr>';
    g.rows.forEach(function (r) {
      var t = r.t, canW = editable && S.can('comment', t.id);
      h += '<tr><td class="ts-task">' + (r.see
        ? '<button class="as-link" data-act="open-task" data-id="' + esc(t.id) + '">' + esc(t.name) + '</button>' + (r.project ? '<em>' + esc(r.project) + '</em>' : '')
        : '<span class="muted">' + L('(งานที่คุณไม่มีสิทธิ์เห็น)') + '</span>') + '</td>';
      r.cells.forEach(function (m, k) {
        var day = g.days[k];
        h += '<td class="ts-c">' + (canW
          ? '<input class="ts-in" data-act="ts-cell" data-id="' + esc(t.id) + '" data-d="' + day + '" value="' + (m ? esc(hours(m)) : '') + '" placeholder="–" inputmode="text" aria-label="' + esc(t.name + ' ' + day) + '">'
          : '<span>' + (m ? esc(hours(m)) : '–') + '</span>') + '</td>';
      });
      h += '<td class="ts-tot">' + esc(hours(r.total)) + '</td>';
      var bl = r.billable;
      h += '<td class="ts-b">' + (canW && r.total
        ? '<input type="checkbox" data-act="ts-bill" data-id="' + esc(t.id) + '"' + (bl === true ? ' checked' : '') + (bl === 'mixed' ? ' data-mixed="1" title="' + esc(L('บางรายการ')) + '"' : '') + '>'
        : (bl === true ? '✓' : bl === 'mixed' ? '±' : '–')) + '</td>';
      h += '<td class="ts-cat">' + (canW && r.total
        ? '<select class="opt-select" data-act="ts-cat" data-id="' + esc(t.id) + '"><option value="">' + L('ไม่ระบุ') + '</option>' +
          (r.category === '*' ? '<option value="*" selected>' + L('หลายหมวด') + '</option>' : '') +
          cats.map(function (c) { return '<option value="' + esc(c) + '"' + (r.category === c ? ' selected' : '') + '>' + esc(L(c)) + '</option>'; }).join('') + '</select>'
        : esc(r.category === '*' ? L('หลายหมวด') : r.category ? L(r.category) : '–')) + '</td></tr>';
    });
    h += '</tbody><tfoot><tr><th class="ts-task">' + L('รวมต่อวัน') + '</th>';
    g.col.forEach(function (m) { h += '<th>' + (m ? esc(hours(m)) : '–') + '</th>'; });
    h += '<th class="ts-tot">' + esc(hours(g.total)) + '</th><th colspan="2" class="ts-billsum">' + esc(L('เก็บเงินได้ {h}', { h: hours(g.billable) })) + '</th></tr></tfoot></table></div>';
    return h;
  }

  function tsHist(x) {
    if (!x || !x.hist.length) return '';
    var lab = { submitted: 'ส่งตรวจ', approved: 'อนุมัติ', rejected: 'ตีกลับ', recalled: 'ดึงกลับ', reopened: 'ปลดล็อก' };
    return '<div class="ts-hist"><b>' + L('ประวัติ') + '</b>' + x.hist.slice().reverse().map(function (y) {
      var u = S.user(y.by);
      return '<div class="ts-hrow">' + avatar(u, 'sm') + '<span>' + esc((u ? u.name : '—') + ' · ' + L(lab[y.s] || y.s)) +
        (y.note ? ' — “' + esc(y.note) + '”' : '') + '</span><em>' + esc(R.fmtWhen(y.at)) + '</em></div>';
    }).join('') + '</div>';
  }

  /** route = { type: 'timesheets', tab: mine|review, week, ts } */
  function timesheetsView(route, ui) {
    var tab = route.tab === 'review' ? 'review' : 'mine';
    var queue = S.tsReviewQueue();
    var waiting = queue.filter(function (x) { return x.status === 'submitted'; }).length;
    var h = '<div class="ts"><div class="ts-tabs">' + seg('ts-tab', [['mine', 'ไทม์ชีตของฉัน'], ['review', 'รอตรวจ']], tab) +
      (waiting ? '<span class="count alert">' + waiting + '</span>' : '') + '<span class="grow"></span>';
    if (tab === 'review' && (S.isAdmin() || queue.length)) {
      h += '<button class="btn btn-sm" data-act="ts-export-range">' + I('download', 13) + ' ' + L('ส่งออกช่วงเวลา (CSV)') + '</button>';
    }
    h += '</div>';
    if (tab === 'review') return h + tsReviewHtml(route, queue) + '</div>';

    var me = S.db.currentUserId, week = S.weekOf(route.week);
    var g = S.timesheetGrid(me, week, (ui.extra || {})[week]);
    var st = tsState(g.status);
    h += '<div class="ts-bar"><div class="wl-nav"><button class="btn btn-sm btn-ghost" data-act="ts-week" data-d="-1" title="' + L('สัปดาห์ก่อน') + '">' + I('arrowLeft', 14) + '</button>' +
      '<button class="btn btn-sm" data-act="ts-week" data-d="0">' + L('สัปดาห์นี้') + '</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="ts-week" data-d="1" title="' + L('สัปดาห์ถัดไป') + '">' + I('arrowRight', 14) + '</button></div>' +
      '<b class="ts-wk">' + esc(weekLabel(week)) + '</b>' + pill(st.color, L(st.label)) +
      '<span class="ts-sum">' + esc(L('รวม {h}', { h: hours(g.total) })) + '</span><span class="grow"></span>';
    if (g.status === 'submitted') h += '<button class="btn btn-sm" data-act="ts-recall">' + L('ดึงกลับมาแก้') + '</button>';
    else if (g.status !== 'approved') h += '<button class="btn btn-sm btn-primary" data-act="ts-submit"' + (g.total ? '' : ' disabled') + '>' + I('send', 13) + ' ' + L('ส่งไทม์ชีต') + '</button>';
    h += '<button class="btn btn-sm btn-ghost" data-act="ts-csv" data-w="' + week + '" title="' + L('ดาวน์โหลด CSV') + '">' + I('download', 14) + '<span class="hide-sm"> CSV</span></button></div>';
    if (g.locked) {
      h += '<div class="ts-lock">' + I('lock', 13) + ' ' + (g.status === 'approved'
        ? esc(L('อนุมัติแล้ว — สัปดาห์นี้ถูกล็อก แก้ไม่ได้ (ผู้ดูแลระบบปลดล็อกได้)'))
        : esc(L('ส่งตรวจแล้ว — แก้ไม่ได้จนกว่าจะดึงกลับหรือถูกตีกลับ'))) + '</div>';
    } else if (g.status === 'rejected' && g.ts) {
      h += '<div class="ts-lock rej">' + I('alert', 13) + ' ' + esc(L('ถูกตีกลับ')) + (g.ts.note ? ': “' + esc(g.ts.note) + '”' : '') + ' — ' + esc(L('แก้แล้วส่งใหม่ได้')) + '</div>';
    }
    h += tsGridHtml(g, !g.locked, ui);
    if (!g.locked) h += '<div class="ts-add"><button class="btn btn-sm" data-act="ts-addrow">' + I('plus', 13) + ' ' + L('เพิ่มงาน') + '</button>' +
      '<span class="muted">' + L('พิมพ์เวลาในช่อง เช่น 1:30 2h หรือ 45m · เว้นว่าง = ลบ') + '</span></div>';
    /* รายการเวลาแบบละเอียด — บันทึก หมวด เก็บเงินได้ รายรายการ */
    var ent = S.weekEntries(me, week).sort(function (a, b) { return a.e.date < b.e.date ? -1 : 1; });
    if (ent.length) {
      h += '<details class="ts-ent"><summary>' + esc(L('{n} รายการเวลา', { n: ent.length })) + '</summary>';
      ent.forEach(function (x) {
        h += '<div class="ts-erow"><span class="ts-ed">' + esc(fmtDate(x.e.date)) + '</span><span class="grow"><b>' + esc(x.t.name) + '</b>' +
          (x.e.note ? '<em>' + esc(x.e.note) + '</em>' : '') + '</span><span>' + esc(hours(x.e.minutes)) + '</span>' +
          (x.e.billable ? '<span class="chip">' + L('เก็บเงินได้') + '</span>' : '') + (x.e.category ? '<span class="chip">' + esc(L(x.e.category)) + '</span>' : '') +
          (!g.locked ? '<button class="x" data-act="ts-edel" data-id="' + esc(x.t.id) + '" data-e="' + esc(x.e.id) + '" title="' + L('ลบรายการเวลา') + '">' + I('close', 12) + '</button>' : '') + '</div>';
      });
      h += '</details>';
    }
    h += tsHist(g.ts);
    var mine = S.myTimesheets().filter(function (x) { return x.week !== week; }).slice(0, 8);
    if (mine.length) {
      h += '<div class="ts-past"><b>' + L('สัปดาห์ก่อน ๆ') + '</b>' + mine.map(function (x) {
        var s = tsState(x.status);
        return '<button class="ts-prow" data-act="ts-goto" data-w="' + x.week + '"><span class="grow">' + esc(weekLabel(x.week)) + '</span>' +
          (x.minutes ? '<span>' + esc(hours(x.minutes)) + '</span>' : '') + pill(s.color, L(s.label)) + '</button>';
      }).join('') + '</div>';
    }
    return h + '</div>';
  }

  function tsReviewHtml(route, queue) {
    var h = '';
    var open = route.ts ? S.tsById(route.ts) : null;
    if (open && S.canReviewTimesheet(open)) {
      var u = S.user(open.userId), g = S.timesheetGrid(open.userId, open.week), st = tsState(open.status);
      h += '<div class="ts-review"><div class="ts-bar"><button class="btn btn-sm btn-ghost" data-act="ts-close">' + I('arrowLeft', 14) + ' ' + L('กลับไปรายการ') + '</button>' +
        avatar(u, 'sm') + '<b>' + esc(u ? u.name : '') + '</b><span class="ts-wk">' + esc(weekLabel(open.week)) + '</span>' + pill(st.color, L(st.label)) +
        '<span class="ts-sum">' + esc(L('รวม {h}', { h: hours(g.total) })) + '</span><span class="grow"></span>';
      if (open.status === 'submitted') {
        h += '<button class="btn btn-sm" data-act="ts-reject" data-id="' + esc(open.id) + '">' + L('ตีกลับ') + '</button>' +
          '<button class="btn btn-sm btn-primary" data-act="ts-approve" data-id="' + esc(open.id) + '">' + I('check', 13) + ' ' + L('อนุมัติ') + '</button>';
      }
      if (open.status === 'approved' && S.isAdmin()) h += '<button class="btn btn-sm" data-act="ts-reopen" data-id="' + esc(open.id) + '">' + I('lock', 13) + ' ' + L('ปลดล็อก') + '</button>';
      h += '<button class="btn btn-sm btn-ghost" data-act="ts-csv" data-w="' + open.week + '" data-u="' + esc(open.userId) + '">' + I('download', 14) + '<span class="hide-sm"> CSV</span></button></div>';
      h += tsGridHtml(g, false) + tsHist(open) + '</div>';
      return h;
    }
    if (!queue.length) {
      return '<div class="empty"><div class="big">🗂</div>' + L('ไม่มีไทม์ชีตที่คุณต้องตรวจ') +
        '<p class="muted">' + L('ผู้ตรวจคือผู้ดูแลระบบ ผู้ตรวจที่ผู้ดูแลตั้งไว้ และผู้ดูแลโปรเจกต์ของงานที่ลงเวลา') + '</p></div>';
    }
    h += '<div class="ts-queue">';
    queue.forEach(function (x) {
      var u = S.user(x.userId), st = tsState(x.status);
      h += '<button class="ts-qrow" data-act="ts-open" data-id="' + esc(x.id) + '">' + avatar(u, 'sm') + '<span class="grow"><b>' + esc(u ? u.name : '') + '</b><em>' +
        esc(weekLabel(x.week)) + '</em></span><span>' + esc(hours(x.minutes || 0)) + '</span>' + pill(st.color, L(st.label)) + '</button>';
    });
    return h + '</div>';
  }

  /* ====================== รายงานรวม ====================== */
  function scopeText(r) {
    var s = r.scope;
    if (s.k === 'team') { var t = S.team(s.id); return L('ทีม {t}', { t: t ? t.name : '—' }); }
    if (s.k === 'portfolio') { var f = S.portfolio(s.id); return L('พอร์ตโฟลิโอ {t}', { t: f ? f.name : '—' }); }
    if (s.k === 'projects') return L('{n} โปรเจกต์', { n: s.ids.length });
    return L('ทั้งองค์กร');
  }
  function shareText(r) {
    if (r.share.org) return L('ทุกคนในองค์กร');
    var n = r.share.users.length + r.share.teams.length;
    return n ? L('แชร์ {n} รายการ', { n: n }) : L('ส่วนตัว');
  }
  function reportsView() {
    var list = S.visibleReports();
    var h = '<div class="pjx"><div class="pjx-head">' + I('chart', 17) + '<b>' + L('รายงาน') + '</b><span class="n">' + esc(L('{n} รายงาน', { n: list.length })) + '</span></div>' +
      '<p class="prj-note">' + L('แดชบอร์ดข้ามโปรเจกต์ ทีม พอร์ตโฟลิโอ หรือทั้งองค์กร ตัวเลขคิดตามสิทธิ์ของคนที่เปิดดู แชร์แล้วไม่มีใครเห็นงานเกินสิทธิ์ตัวเอง') + '</p>';
    if (!list.length) return h + '<div class="empty"><div class="big">📊</div>' + L('ยังไม่มีรายงาน') +
      (S.can('write') ? '<p><button class="btn btn-primary" data-act="rp-new">' + L('+ สร้างรายงาน') + '</button></p>' : '') + '</div></div>';
    h += '<div class="pjx-grid">';
    list.forEach(function (r) {
      var o = S.user(r.owner);
      h += '<button class="pjx-card rp-card" data-act="rp-go" data-id="' + esc(r.id) + '"><div class="pjx-top">' + I('chart', 18) + '<b class="grow">' + esc(r.name) + '</b></div>' +
        '<div class="pjx-meta"><span>' + esc(scopeText(r)) + '</span><span>' + esc(L('{n} วิดเจ็ต', { n: r.widgets.length })) + '</span></div>' +
        '<div class="pjx-meta">' + avatar(o, 'sm') + '<span>' + esc(o ? o.name : '') + '</span><span class="chip">' + esc(shareText(r)) + '</span></div></button>';
    });
    return h + '</div></div>';
  }

  var RP_X = {
    tasks: [['assignee', 'ผู้รับผิดชอบ'], ['project', 'โปรเจกต์'], ['priority', 'ความสำคัญ'], ['completed', 'เสร็จ/ยังไม่เสร็จ'], ['period', 'ช่วงเวลา']],
    projects: [['status', 'สถานะ'], ['owner', 'เจ้าของ']],
    portfolios: [['status', 'สถานะ'], ['owner', 'เจ้าของ']],
    goals: [['status', 'สถานะ'], ['owner', 'เจ้าของ'], ['team', 'ทีม'], ['period', 'ช่วงเวลา']]
  };
  var RP_Y = {
    tasks: [['count', 'จำนวนงาน'], ['est', 'เวลาประมาณ (ชม.)'], ['actual', 'เวลาจริง (ชม.)']],
    projects: [['count', 'จำนวน'], ['avg:progress', 'ความคืบหน้าเฉลี่ย (%)'], ['sum:open', 'งานค้างรวม'], ['sum:overdue', 'งานเลยกำหนดรวม']],
    portfolios: [['count', 'จำนวน'], ['avg:progress', 'ความคืบหน้าเฉลี่ย (%)'], ['sum:open', 'งานค้างรวม'], ['sum:overdue', 'งานเลยกำหนดรวม']],
    goals: [['count', 'จำนวน'], ['avg:progress', 'ความคืบหน้าเฉลี่ย (%)']]
  };
  function rpXOptions(src) {
    var out = (RP_X[src] || RP_X.tasks).slice();
    if (src === 'tasks') (S.db.fieldLib || []).forEach(function (f) {
      var k = S.fieldKind(f);
      if (k === 'select' || k === 'person' || k === 'multi') out.push(['field:' + f.id, f.name]);
    });
    return out;
  }
  function rpYOptions(src) {
    var out = (RP_Y[src] || RP_Y.tasks).slice();
    if (src === 'tasks') (S.db.fieldLib || []).forEach(function (f) {
      if (S.fieldKind(f) === 'number') { out.push(['sum:' + f.id, L('ผลรวม {f}', { f: f.name })]); out.push(['avg:' + f.id, L('ค่าเฉลี่ย {f}', { f: f.name })]); }
    });
    return out;
  }
  function rpSpec(r, w, opts) {
    var d = S.reportData(r, w);
    var fmt = null, ym = /^(sum|avg):(.+)$/.exec(w.y || '');
    if (ym && w.src === 'tasks') { var f = S.fieldDef(ym[2]); if (f && f.format) fmt = function (n) { return S.formatNumber(f, Math.round(n * 100) / 100); }; }
    else if (w.y === 'avg:progress') fmt = function (n) { return (Math.round(n * 10) / 10) + '%'; };
    else if (w.y === 'est' || w.y === 'actual') fmt = function (n) { return (Math.round(n * 10) / 10) + ' ' + L('ชม.'); };
    return { type: w.kind, cats: d.cats, series: d.series, values: d.values, bench: d.bench,
      number: d.number ? { value: d.number.value } : null, fmt: fmt, act: (opts && opts.act) || 'rp-click', wid: w.id,
      empty: L('ไม่มีข้อมูลตามตัวกรองนี้'), h: w.kind === 'number' ? 120 : 240, w: w.full && global.innerWidth >= 860 ? 980 : 560 };
  }
  function reportView(id) {
    var r = S.report(id);
    if (!r) return '<div class="empty"><div class="big">📊</div>' + L('ไม่พบรายงานนี้ หรือคุณไม่มีสิทธิ์เห็น') + '</div>';
    var canEd = S.canEditReport(r.id);
    var h = '<div class="dashb rp"><div class="dashb-bar"><span class="chip">' + I('grid', 12) + ' ' + esc(scopeText(r)) + '</span>' +
      (canEd ? '<button class="as-link" data-act="rp-scope" data-id="' + esc(r.id) + '">' + L('เปลี่ยนขอบเขต') + '</button>' : '') +
      '<span class="chip">' + I('users', 12) + ' ' + esc(shareText(r)) + '</span><span class="grow"></span><span class="dashb-n">' +
      esc(L('{n}/{max} วิดเจ็ต', { n: r.widgets.length, max: S.REPORT_W_MAX })) + '</span></div>';
    if (!r.widgets.length) h += '<div class="ovw-empty">' + L('ยังไม่มีวิดเจ็ต กด “เพิ่มวิดเจ็ต” เพื่อเลือกแหล่งข้อมูลและชนิดกราฟ') + '</div>';
    h += '<div class="dashb-grid">';
    r.widgets.forEach(function (w, i) {
      var srcLbl = (S.REPORT_SRCS.filter(function (x) { return x[0] === w.src; })[0] || ['', ''])[1];
      h += '<section class="dw' + (w.full ? ' full' : '') + (w.kind === 'number' ? ' num' : '') + '" data-w="' + esc(w.id) + '"><header><b class="grow">' +
        esc(w.title ? L(w.title) : L(srcLbl)) + '</b><span class="dw-flt">' + esc(L(srcLbl)) + '</span>' +
        '<button class="btn btn-sm btn-ghost" data-act="rp-png" data-id="' + esc(r.id) + '" data-w="' + esc(w.id) + '" title="' + L('ส่งออกเป็นรูป PNG') + '">' + I('image', 13) + '</button>' +
        (canEd ? '<button class="btn btn-sm btn-ghost" data-act="rp-wmenu" data-id="' + esc(r.id) + '" data-w="' + esc(w.id) + '" data-i="' + i + '" title="' + L('ตัวเลือก') + '">' + I('more', 14) + '</button>' : '') +
        '</header><div class="dw-chart">' + global.Charts.svg(rpSpec(r, w)) + '</div></section>';
    });
    return h + '</div></div>';
  }

  /* ====================== ผู้ดูแลระบบ ====================== */
  function adminExt() {
    var users = S.db.users.filter(function (u) { return u.active !== false; });
    var h = '<section class="admin-sec" id="adminCapacity"><h3>' + L('ความจุงานและช่วงไม่อยู่') + '</h3>' +
      '<p class="prj-note">' + L('ความจุต่อวันทำงาน ใช้ในหน้าภาระงาน แต่ละคนแก้ของตัวเองได้ ผู้ดูแลแก้ให้ทุกคนได้') + '</p>' +
      '<div class="cap-table"><div class="cap-row head"><span class="grow">' + L('คน') + '</span><span>' + L('ชม./วัน') + '</span><span>' + L('งาน/วัน') + '</span><span>' +
      L('พอยต์/วัน') + '</span><span>' + L('ช่วงไม่อยู่') + '</span></div>';
    users.forEach(function (u) {
      var c = S.capacityOf(u.id), aw = S.awayRanges(u.id).filter(function (r) { return r.to >= S.today(); }).length;
      var inp = function (k) {
        return '<span><input class="opt-select cap-in" type="number" min="0" max="1000" step="0.5" data-act="cap-set" data-uid="' + esc(u.id) + '" data-k="' + k + '" value="' + c[k] + '"></span>';
      };
      h += '<div class="cap-row">' + '<span class="grow">' + avatar(u, 'sm') + ' ' + esc(u.name) + '</span>' + inp('h') + inp('count') + inp('pt') +
        '<span><button class="btn btn-sm" data-act="set-away" data-uid="' + esc(u.id) + '">' + (aw ? esc(L('{n} ช่วง', { n: aw })) : L('ตั้ง')) + '</button></span></div>';
    });
    h += '</div></section>';

    var st = S.db.settings || {};
    h += '<section class="admin-sec" id="adminTimesheets"><h3>' + L('ไทม์ชีต') + '</h3>';
    h += '<div class="gf-list"><b>' + L('หมวดของเวลา') + '</b>' + S.timeCats().map(function (c, i) {
      return '<span class="chip">' + esc(L(c)) + '<button data-act="tscat-del" data-i="' + i + '" title="' + L('ลบ') + '">✕</button></span>';
    }).join('') + '<button class="btn btn-sm" data-act="tscat-add">' + I('plus', 13) + ' ' + L('เพิ่มหมวด') + '</button></div>';
    h += '<div class="gf-list"><b>' + L('ผู้ตรวจไทม์ชีตเพิ่มเติม') + '</b>' + (st.tsReviewers || []).map(function (uid) {
      var u = S.user(uid);
      return u ? '<span class="chip">' + avatar(u, 'sm') + esc(u.name) + '<button data-act="tsrev-del" data-uid="' + esc(uid) + '" title="' + L('เอาออก') + '">✕</button></span>' : '';
    }).join('') + '<select class="opt-select" data-act="tsrev-add"><option value="">' + L('+ เพิ่มผู้ตรวจ…') + '</option>' +
      users.filter(function (u) { return (st.tsReviewers || []).indexOf(u.id) < 0; }).map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(u.name) + '</option>'; }).join('') +
      '</select></div>';
    h += '<p class="prj-note">' + L('ผู้ดูแลระบบและผู้ดูแลโปรเจกต์ของงานที่ลงเวลาตรวจได้อยู่แล้ว รายชื่อนี้คือคนที่ตรวจได้ทุกไทม์ชีตเพิ่มเติม') + '</p>';
    h += '<button class="btn btn-sm" data-act="ts-export-range">' + I('download', 13) + ' ' + L('ส่งออกรายการเวลาทั้งองค์กร (CSV)') + '</button></section>';
    if (R.adminExt2) h += R.adminExt2();
    return h;
  }

  var X = {
    sidebarExt: sidebarExt, topbarExt: topbarExt, topbarActsExt: topbarActsExt, adminExt: adminExt,
    workloadView: workloadView, awayModal: awayModal, timesheetsView: timesheetsView,
    reportsView: reportsView, reportView: reportView, rpSpec: rpSpec, rpXOptions: rpXOptions, rpYOptions: rpYOptions,
    tsGridHtml: tsGridHtml, wlSeg: seg, wlSel: sel, pill: pill
  };
  Object.keys(X).forEach(function (k) { R[k] = X[k]; });

})(window);

/* Orbit — Gantt
 *
 * ตารางงานฝั่งซ้าย + แผนภูมิฝั่งขวา อยู่ใน scroller เดียวกัน
 * ฝั่งซ้าย sticky ไว้ ทำให้เลื่อนแนวนอนแล้วคอลัมน์ชื่อยังอยู่
 * แถวทั้งสองฝั่งสร้างจาก array เดียวกัน บรรทัดจึงตรงกันเสมอ
 */
(function (global) {
  'use strict';

  var S = global.Store, R = global.Render, L = global.I18N.t, I = global.Icons.icon;

  var G_ZOOMS = {
    day:     { w: 30,  top: 'month',   bottom: 'day' },
    week:    { w: 14,  top: 'month',   bottom: 'week' },
    month:   { w: 6,   top: 'quarter', bottom: 'month' },
    quarter: { w: 2.4, top: 'year',    bottom: 'quarter' }
  };
  var G_ROW = 34;
  function gLeft() { return (global.innerWidth < 860) ? 200 : 520; }

  function esc(s) { return R.esc(s); }

  function depTypeHint(id) {
    var d = S.DEP_TYPES.filter(function (x) { return x.id === id; })[0];
    return d ? L(d.label) + ' — ' + L(d.hint) : id;
  }

  /** ช่วงวันของงาน คืน [start, end] เสมอ */
  function span(t) {
    var a = t.startOn || t.dueOn;
    var b = t.dueOn || t.startOn;
    if (!a) return null;
    if (b < a) { var tmp = a; a = b; b = tmp; }
    return [a, b];
  }

  /** หัวตารางเวลา แบ่งช่วงตามหน่วยที่ขอ */
  function bandCells(from, days, w, unit) {
    var h = '', i = 0;
    while (i < days) {
      var ds = S.addDays(from, i);
      var d = new Date(ds + 'T00:00:00');
      var label, len;

      if (unit === 'day') {
        label = d.getDate();
        len = 1;
      } else if (unit === 'week') {
        len = 7 - d.getDay();
        label = d.getDate() + ' ' + R.MON()[d.getMonth()];
      } else if (unit === 'month') {
        len = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1;
        label = R.MON()[d.getMonth()];
      } else if (unit === 'quarter') {
        var q = Math.floor(d.getMonth() / 3);
        var qEnd = new Date(d.getFullYear(), q * 3 + 3, 0);
        len = S.daysBetween(ds, S.iso(qEnd)) + 1;
        label = 'Q' + (q + 1) + ' ' + R.YR(d.getFullYear());
      } else {
        var yEnd = new Date(d.getFullYear(), 12, 0);
        len = S.daysBetween(ds, S.iso(yEnd)) + 1;
        label = R.YR(d.getFullYear());
      }

      len = Math.min(len, days - i);
      var cw = len * w;
      h += '<div class="g-band-cell" style="width:' + cw + 'px">' +
        (cw > 26 ? esc(label) : '') + '</div>';
      i += len;
    }
    return h;
  }

  function ganttView(projectId, view, zoom, collapsed) {
    var p = S.project(projectId);
    var Z = G_ZOOMS[zoom] || G_ZOOMS.month;
    var W = Z.w;
    var groups = S.viewGroups(projectId, view);
    collapsed = collapsed || {};

    /* --- สร้างรายการแถวครั้งเดียว ใช้ร่วมกันทั้งสองฝั่ง --- */
    var rows = [];
    groups.forEach(function (g) {
      var bounds = null;
      g.items.forEach(function (x) {
        var s = span(x.task);
        if (!s) return;
        if (!bounds) bounds = [s[0], s[1]];
        else {
          if (s[0] < bounds[0]) bounds[0] = s[0];
          if (s[1] > bounds[1]) bounds[1] = s[1];
        }
      });
      rows.push({ kind: 'section', key: g.key, label: g.label,
                  count: g.items.length, bounds: bounds, isSection: g.isSection });
      if (collapsed[g.key]) return;
      g.items.forEach(function (x) {
        rows.push({ kind: 'task', task: x.task, sectionKey: g.key });
      });
      if (g.isSection) rows.push({ kind: 'add', sectionKey: g.key });
    });

    /* --- ช่วงเวลาที่ต้องวาด --- */
    var td = S.today();
    var min = td, max = td;
    S.tasksInProject(projectId).forEach(function (x) {
      var s = span(x.task);
      if (!s) return;
      if (s[0] < min) min = s[0];
      if (s[1] > max) max = s[1];
    });
    var pad = zoom === 'day' ? 5 : (zoom === 'week' ? 10 : 31);
    var from = S.addDays(min, -pad);
    var to = S.addDays(max, pad);
    var days = S.daysBetween(from, to) + 1;
    var chartW = Math.round(days * W);

    function xAt(d) { return S.daysBetween(from, d) * W; }
    function xEnd(d) { return (S.daysBetween(from, d) + 1) * W; }

    var h = '<div class="gantt-scroll" data-from="' + from + '" data-w="' + W +
      '"><div class="gantt-body" style="width:' + (gLeft() + chartW) + 'px">';

    /* ---------------- ฝั่งซ้าย ---------------- */
    h += '<div class="g-left" style="width:' + gLeft() + 'px">';
    h += '<div class="g-lhead"><span class="g-caret"></span>' +
      '<span class="g-c-name">' + L('ชื่องาน') + '</span>' +
      '<span class="g-c-due">' + L('กำหนดส่ง') + '</span>' +
      '<span class="g-c-dep">' + L('รออะไรอยู่') + '</span></div>';

    rows.forEach(function (r, i) {
      if (r.kind === 'section') {
        h += '<div class="g-lrow g-sec" data-row="' + i + '">' +
          '<button class="g-caret' + (collapsed[r.key] ? ' closed' : '') +
          '" data-act="g-toggle-sec" data-key="' + esc(r.key) + '" title="' + L('ย่อ/ขยาย') + '">▾' + '</button>' +
          '<span class="g-c-name"><strong>' + esc(L(r.label)) + '</strong>' +
          '<span class="g-n">' + r.count + '</span></span>' +
          '<span class="g-c-due"></span><span class="g-c-dep"></span></div>';
        return;
      }
      if (r.kind === 'add') {
        h += '<div class="g-lrow g-addrow" data-row="' + i + '">' +
          '<span class="g-caret"></span>' +
          '<button class="g-addbtn" data-act="inline-add" data-section="' +
          esc(r.sectionKey) + '">+ ' + L('เพิ่มงาน') + '</button></div>';
        return;
      }

      var t = r.task;
      var s = span(t);
      var due = s ? (s[0] === s[1] ? R.fmtDate(s[1])
                                   : R.fmtDate(s[0]) + ' – ' + R.fmtDate(s[1])) : '—';
      var depHtml = '';
      t.dependsOn.forEach(function (dp) {
        var b = S.task(dp.id);
        if (!b) return;
        depHtml += '<span class="g-depchip" data-act="open-task" data-id="' + esc(b.id) +
          '" title="' + esc(b.name + ' · ' + depTypeHint(dp.type)) + '">' +
          (b.completed ? '✓ ' : '') + esc(b.name) +
          '<span class="g-deptag">' + esc(dp.type) + '</span></span>';
      });

      h += '<div class="g-lrow g-task' + (t.completed ? ' done' : '') +
        '" data-row="' + i + '" data-act="open-task" data-id="' + esc(t.id) + '">' +
        '<span class="g-caret"></span>' +
        '<span class="g-c-name">' + R.checkbox(t) +
        '<span class="g-nm">' + (t.type === 'milestone' ? I('diamond', 10) + ' ' : '') + esc(t.name) + '</span>' +
        R.avatar(S.user(t.assigneeId), 'sm') + '</span>' +
        '<span class="g-c-due' + R.dueClass(t.dueOn, t.completed) + '">' + due + '</span>' +
        '<span class="g-c-dep">' + (depHtml || '<span class="g-muted">—</span>') + '</span>' +
        '</div>';
    });
    h += '</div>';

    /* ---------------- ฝั่งขวา ---------------- */
    h += '<div class="g-right" style="width:' + chartW + 'px">';
    h += '<div class="g-rhead">' +
      '<div class="g-band g-band-top">' + bandCells(from, days, W, Z.top) + '</div>' +
      '<div class="g-band g-band-bot">' + bandCells(from, days, W, Z.bottom) + '</div>' +
      '</div>';

    h += '<div class="g-rows" style="height:' + (rows.length * G_ROW) + 'px">';

    // เส้นแบ่งเดือนจาง ๆ ให้กวาดตาตามได้
    var gi = 0;
    while (gi < days) {
      var gd = new Date(S.addDays(from, gi) + 'T00:00:00');
      var glen = new Date(gd.getFullYear(), gd.getMonth() + 1, 0).getDate() - gd.getDate() + 1;
      h += '<div class="g-vline" style="left:' + (gi * W) + 'px"></div>';
      gi += glen;
    }

    rows.forEach(function (r, i) {
      var top = i * G_ROW;
      h += '<div class="g-rrow" style="top:' + top + 'px" data-row="' + i + '"></div>';

      if (r.kind === 'section') {
        if (!r.bounds) return;
        var sx = xAt(r.bounds[0]), sw = xEnd(r.bounds[1]) - sx;
        h += '<div class="g-rollup" style="left:' + sx + 'px;width:' + sw +
          'px;top:' + (top + 14) + 'px;background:' + esc(p.color) + '" title="' +
          esc(L(r.label)) + '"></div>';
        return;
      }
      if (r.kind !== 'task') return;

      var t = r.task;
      var s = span(t);
      if (!s) return;
      var blocked = !t.completed && S.isBlocked(t.id);
      var color = t.priority === 'none' ? p.color : R.prio(t.priority).color;

      if (t.type === 'milestone') {
        h += '<div class="g-ms" data-act="open-task" data-id="' + esc(t.id) +
          '" data-tid="' + esc(t.id) + '" data-role="move" title="' + esc(t.name) +
          '" style="left:' + (xAt(s[1]) + W / 2 - 8) + 'px;top:' + (top + 9) +
          'px;background:' + color + '"></div>';
      } else {
        var bx = xAt(s[0]), bw = Math.max(xEnd(s[1]) - bx, 6);
        h += '<div class="g-bar' + (t.completed ? ' done' : '') + (blocked ? ' blocked' : '') +
          '" data-act="open-task" data-id="' + esc(t.id) + '" data-tid="' + esc(t.id) +
          '" data-role="move" title="' + esc(t.name) +
          '" style="left:' + bx + 'px;width:' + bw + 'px;top:' + (top + 8) +
          'px;background:' + color + '">' +
          '<span class="g-h l" data-role="start" data-tid="' + esc(t.id) + '"></span>' +
          '<span class="g-bartxt">' + esc(t.name) + '</span>' +
          '<span class="g-h r" data-role="end" data-tid="' + esc(t.id) + '"></span>' +
          '<span class="g-dot l" data-role="link" data-tid="' + esc(t.id) +
          '" data-anchor="start" title="' + L('ลากไปงานอื่นเพื่อสร้างลำดับ') + '">' + '</span>' +
          '<span class="g-dot r" data-role="link" data-tid="' + esc(t.id) +
          '" data-anchor="end" title="' + L('ลากไปงานอื่นเพื่อสร้างลำดับ') + '">' + '</span>' +
          '</div>';
        if (bw < 90) {
          h += '<div class="g-barlabel" style="left:' + (bx + bw + 7) + 'px;top:' +
            (top + 9) + 'px">' + esc(t.name) + '</div>';
        }
      }
    });

    /* --- เส้นลำดับก่อนหลัง วาดตามชนิดความสัมพันธ์ --- */
    var rowOf = {};
    rows.forEach(function (r, i) { if (r.kind === 'task') rowOf[r.task.id] = i; });

    function anchorX(t, which) {
      var sp = span(t);
      if (!sp) return null;
      if (t.type === 'milestone') return xAt(sp[1]) + W / 2;
      return which === 'start' ? xAt(sp[0]) : xEnd(sp[1]);
    }

    function elbow(x1, y1, x2, y2, backwards) {
      var st = 12;
      if (!backwards && x2 >= x1 + st * 2) {
        return 'M' + x1 + ' ' + y1 + ' H' + (x2 - st) + ' V' + y2 + ' H' + x2;
      }
      var my = (y1 < y2) ? (y1 + G_ROW / 2 + 4) : (y1 - G_ROW / 2 - 4);
      return 'M' + x1 + ' ' + y1 + ' H' + (x1 + st) + ' V' + my +
             ' H' + (x2 - st) + ' V' + y2 + ' H' + x2;
    }

    var paths = '', hits = '';
    rows.forEach(function (r) {
      if (r.kind !== 'task') return;
      var t = r.task;
      if (rowOf[t.id] === undefined) return;
      var ys = rowOf[t.id] * G_ROW + G_ROW / 2;

      t.dependsOn.forEach(function (dp) {
        if (rowOf[dp.id] === undefined) return;
        var b = S.task(dp.id);
        if (!b) return;
        var type = dp.type || 'FS';
        var fromWhich = (type === 'SS' || type === 'SF') ? 'start' : 'end';
        var toWhich   = (type === 'FF' || type === 'SF') ? 'end' : 'start';
        var x1 = anchorX(b, fromWhich), x2 = anchorX(t, toWhich);
        if (x1 === null || x2 === null) return;
        var y1 = rowOf[b.id] * G_ROW + G_ROW / 2;
        var d = elbow(x1, y1, x2, ys, x2 < x1);
        paths += '<path d="' + d + '" class="g-dep-line" marker-end="url(#gArrow)"/>';
        hits += '<path d="' + d + '" class="g-dep-hit" data-act="g-del-dep" data-id="' +
          esc(t.id) + '" data-blocker="' + esc(b.id) + '"><title>' +
          esc(b.name + ' → ' + t.name + ' (' + type + L(') — คลิกเพื่อลบ')) + '</title></path>';
      });
    });

    h += '<svg class="g-dep" width="' + chartW + '" height="' + (rows.length * G_ROW) + '">' +
      '<defs><marker id="gArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" ' +
      'orient="auto"><path d="M0 0.5 L8 4 L0 7.5 z" fill="var(--fg-soft)"/></marker></defs>' +
      paths + hits + '</svg>';

    var tx = xAt(td) + W / 2;
    h += '<div class="g-today" style="left:' + tx + 'px"></div>';
    h += '<svg class="g-rubber" width="' + chartW + '" height="' + (rows.length * G_ROW) +
      '"><path class="g-rubber-line" d=""/></svg>';

    h += '</div></div></div></div>';
    return h;
  }

  R.ganttView = ganttView;
  R.G_ZOOMS = G_ZOOMS;
  R.G_ROW = G_ROW;
  R.G_LEFT = gLeft;
  R.depTypeHint = depTypeHint;
  R.taskSpan = span;

})(window);

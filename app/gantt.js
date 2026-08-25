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
    day:     { w: 30,   top: 'month',   bottom: 'day' },
    week:    { w: 14,   top: 'month',   bottom: 'week' },
    month:   { w: 6,    top: 'quarter', bottom: 'month' },
    quarter: { w: 2.4,  top: 'year',    bottom: 'quarter' },
    half:    { w: 1.4,  top: 'year',    bottom: 'quarter' },
    year:    { w: 0.62, top: 'year',    bottom: 'half' }
  };
  var G_ROW = 34;

  /* ความกว้างของช่องชื่องานอย่างเดียว ไม่รวมคอลัมน์อื่น
   *
   * เก็บแยกจากความกว้างรวม เพราะถ้าเก็บเป็นความกว้างรวม พอเปิดคอลัมน์เพิ่ม
   * ช่องชื่อจะถูกบีบจนอ่านไม่ออก ทั้งที่ผู้ใช้แค่อยากเห็นข้อมูลเพิ่ม ไม่ได้อยากเห็นชื่อสั้นลง
   * ใช้คีย์ gName ไม่ใช่ gLeft เดิม ค่าที่เคยลากไว้แบบเก่าจึงไม่ถูกตีความผิด
   */
  function gLeft(projectId) {
    var fallback = (global.innerWidth < 860) ? 180 : 250;
    return projectId ? S.colWidth(projectId, 'gName', fallback) : fallback;
  }

  /* ---------- สีของแท่ง ----------
   *
   * คืนสีเดียวต่องาน ตามเกณฑ์ที่ผู้ใช้เลือกในตัวเลือกมุมมอง
   * ถ้าเกณฑ์ไหนไม่มีค่าให้ใช้ ให้ตกกลับไปที่สีของโปรเจกต์เสมอ
   * จะได้ไม่มีแท่งไหนกลายเป็นสีโปร่งใสจนมองไม่เห็น
   */
  function barColor(t, p, colorBy) {
    if (colorBy === 'priority') {
      return t.priority === 'none' ? p.color : R.prio(t.priority).color;
    }
    if (colorBy === 'assignee') {
      var u = S.user(t.assigneeId);
      return u ? u.color : 'var(--fg-faint)';
    }
    if (colorBy === 'type') {
      if (t.type === 'milestone') return 'var(--accent)';
      if (t.type === 'approval') return R.approvalState(t.approval).color;
      return p.color;
    }
    if (colorBy === 'approval') {
      return t.type === 'approval' ? R.approvalState(t.approval).color : p.color;
    }
    if (colorBy === 'progress') {
      /* เขียว = เสร็จ, แดง = เลยกำหนด, เหลือง = ถูกบล็อก, เทา = ยังไม่ถึงคิว */
      if (t.completed) return 'var(--ok)';
      if (t.dueOn && t.dueOn < S.today()) return 'var(--danger)';
      if (S.isBlocked(t.id)) return 'var(--warn)';
      return p.color;
    }
    return p.color;
  }

  /** คำอธิบายสีใต้แถบเครื่องมือ ไม่มีคำอธิบายก็เดาสีไม่ออกว่าหมายถึงอะไร */
  function colorLegend(p, colorBy) {
    var items = [];
    if (colorBy === 'priority') {
      S.PRIORITIES.forEach(function (x) {
        items.push([x.id === 'none' ? p.color : x.color, L(x.label)]);
      });
    } else if (colorBy === 'type') {
      items.push([p.color, L('งานทั่วไป')]);
      items.push(['var(--accent)', L('หมุดหมาย')]);
      items.push([R.approvalState('pending').color, L('ขออนุมัติ')]);
    } else if (colorBy === 'approval') {
      S.APPROVAL_STATES.forEach(function (a) { items.push([a.color, L(a.label)]); });
    } else if (colorBy === 'progress') {
      items.push(['var(--ok)', L('ทำเสร็จแล้ว')]);
      items.push(['var(--danger)', L('เลยกำหนด')]);
      items.push(['var(--warn)', L('ถูกบล็อก')]);
      items.push([p.color, L('ตามแผน')]);
    } else {
      return '';
    }
    var h = '<div class="g-legend">';
    items.forEach(function (x) {
      h += '<span class="g-lg"><i style="background:' + esc(x[0]) + '"></i>' + esc(x[1]) + '</span>';
    });
    return h + '</div>';
  }

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
      } else if (unit === 'half') {
        var hf = d.getMonth() < 6 ? 0 : 1;
        var hEnd = new Date(d.getFullYear(), hf * 6 + 6, 0);
        len = S.daysBetween(ds, S.iso(hEnd)) + 1;
        label = 'H' + (hf + 1) + ' ' + R.YR(d.getFullYear());
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

  function ganttView(projectId, view, collapsed, search) {
    var p = S.project(projectId);
    view = S.fillView(view);
    var zoom = view.gZoom || 'month';
    var Z = G_ZOOMS[zoom] || G_ZOOMS.month;
    var W = Z.w;
    var cols = view.gCols;
    var colorBy = view.gColorBy || 'theme';
    var showBase = !!view.gShowBaseline && !!(p && p.baseline);
    var groups = S.viewGroups(projectId, view);
    collapsed = collapsed || {};

    var q = (search || '').trim().toLowerCase();
    function hit(t) { return !q || t.name.toLowerCase().indexOf(q) >= 0; }

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
        rows.push({ kind: 'task', task: x.task, sectionKey: g.key, depth: 0 });
        /* งานย่อยไม่ได้ผูกกับโปรเจกต์เอง จึงไม่เคยโผล่ใน viewGroups
         * ต้องดึงมาต่อท้ายงานแม่เองเมื่อผู้ใช้เลือกให้กาง */
        if (view.gSubtasks === 'expanded') {
          S.subtasks(x.task.id).forEach(function (sub) {
            if (!S.matchesFilter(sub, view)) return;
            rows.push({ kind: 'task', task: sub, sectionKey: g.key, depth: 1 });
          });
        }
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

    /* คอลัมน์ฝั่งซ้ายเปิดปิดได้ จึงต้องประกอบ grid template ตามที่เปิดอยู่จริง
     * ถ้าใช้ template ตายตัวแล้วซ่อนคอลัมน์ ช่องว่างจะค้างอยู่เป็นรูโหว่ */
    var colDefs = [
      { id: 'due',       w: 118, label: L('กำหนดส่ง') },
      { id: 'duration',  w: 84,  label: L('ระยะเวลา') },
      { id: 'blockedBy', w: 170, label: L('รออะไรอยู่') },
      { id: 'blocking',  w: 170, label: L('บล็อกงานอะไร') }
    ].filter(function (c) { return cols[c.id]; });
    var tpl = '22px 1fr' + colDefs.map(function (c) { return ' ' + c.w + 'px'; }).join('');
    var extraW = colDefs.reduce(function (a, c) { return a + c.w + 6; }, 0);
    var leftW = gLeft(projectId) + extraW;

    var h = '<div class="gantt-scroll" data-from="' + from + '" data-w="' + W +
      '"><div class="gantt-body" style="width:' + (leftW + chartW) + 'px">';

    /* ---------------- ฝั่งซ้าย ---------------- */
    h += '<div class="g-left" style="width:' + leftW + 'px;--gtpl:' + tpl + '">' +
      '<span class="g-left-grip" data-act="col-resize" data-col="gName" data-extra="' + extraW +
      '" title="' + L('ลากเพื่อปรับความกว้าง') + '"></span>';
    h += '<div class="g-lhead"><span class="g-caret"></span>' +
      '<span class="g-c-name">' + L('ชื่องาน') + '</span>';
    colDefs.forEach(function (c) { h += '<span class="g-c-' + c.id + '">' + c.label + '</span>'; });
    h += '</div>';

    function depChips(list, showType) {
      var out = '';
      list.forEach(function (x) {
        var b = x.task || x;
        if (!b) return;
        out += '<span class="g-depchip" data-act="open-task" data-id="' + esc(b.id) +
          '" title="' + esc(b.name + (x.type ? ' · ' + depTypeHint(x.type) : '')) + '">' +
          (b.completed ? '✓ ' : '') + esc(b.name) +
          (showType && x.type ? '<span class="g-deptag">' + esc(x.type) + '</span>' : '') +
          '</span>';
      });
      return out || '<span class="g-muted">—</span>';
    }

    rows.forEach(function (r, i) {
      if (r.kind === 'section') {
        h += '<div class="g-lrow g-sec" data-row="' + i + '">' +
          '<button class="g-caret' + (collapsed[r.key] ? ' closed' : '') +
          '" data-act="g-toggle-sec" data-key="' + esc(r.key) + '" title="' + L('ย่อ/ขยาย') + '">▾' + '</button>' +
          '<span class="g-c-name"><strong>' + esc(L(r.label)) + '</strong>' +
          '<span class="g-n">' + r.count + '</span></span>';
        colDefs.forEach(function (c) { h += '<span class="g-c-' + c.id + '"></span>'; });
        h += '</div>';
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
      var dur = S.taskDuration(t);

      h += '<div class="g-lrow g-task' + (t.completed ? ' done' : '') +
        (r.depth ? ' g-sub' : '') + (q && !hit(t) ? ' g-dim' : '') +
        (q && hit(t) ? ' g-hit' : '') +
        '" data-row="' + i + '" data-act="open-task" data-id="' + esc(t.id) + '">' +
        '<span class="g-caret"></span>' +
        '<span class="g-c-name"' + (r.depth ? ' style="padding-left:16px"' : '') + '>' +
        R.checkbox(t) +
        '<span class="g-nm">' + (t.type === 'milestone' ? I('diamond', 10) + ' ' : '') + esc(t.name) + '</span>' +
        R.avatar(S.user(t.assigneeId), 'sm') + '</span>';

      colDefs.forEach(function (c) {
        if (c.id === 'due') {
          h += '<span class="g-c-due' + R.dueClass(t.dueOn, t.completed) + '">' + due + '</span>';
        } else if (c.id === 'duration') {
          h += '<span class="g-c-duration">' +
            (dur ? L('{n} วัน', { n: dur }) : '<span class="g-muted">—</span>') + '</span>';
        } else if (c.id === 'blockedBy') {
          h += '<span class="g-c-blockedBy g-c-dep">' + depChips(t.dependsOn.map(function (dp) {
            return { task: S.task(dp.id), type: dp.type, id: dp.id };
          }).filter(function (x) { return x.task; }).map(function (x) {
            return { id: x.task.id, name: x.task.name, completed: x.task.completed, type: x.type };
          }), true) + '</span>';
        } else {
          h += '<span class="g-c-blocking g-c-dep">' + depChips(S.blocking(t.id)) + '</span>';
        }
      });
      h += '</div>';
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
      var color = barColor(t, p, colorBy);
      var dim = q && !hit(t) ? ' g-dim' : '';

      /* เส้นฐานวาดไว้ใต้แท่งจริง เห็นทั้งสองเส้นพร้อมกันจึงรู้ว่าเลื่อนไปกี่วัน */
      if (showBase) {
        var bl = p.baseline.tasks[t.id];
        if (bl && (bl.startOn || bl.dueOn)) {
          var ba = bl.startOn || bl.dueOn, bb = bl.dueOn || bl.startOn;
          if (bb < ba) { var sw2 = ba; ba = bb; bb = sw2; }
          var kx = xAt(ba), kw = Math.max(xEnd(bb) - kx, 4);
          var slip = S.daysBetween(bb, s[1]);
          h += '<div class="g-base" style="left:' + kx + 'px;width:' + kw +
            'px;top:' + (top + 28) + 'px" title="' +
            esc(L('แผนเดิม') + ' ' + R.fmtDate(ba) + ' – ' + R.fmtDate(bb) +
                (slip ? ' · ' + (slip > 0 ? L('ช้ากว่าแผน {n} วัน', { n: slip })
                                          : L('เร็วกว่าแผน {n} วัน', { n: -slip })) : '')) +
            '"></div>';
        }
      }

      if (t.type === 'milestone') {
        h += '<div class="g-ms' + dim + '" data-act="open-task" data-id="' + esc(t.id) +
          '" data-tid="' + esc(t.id) + '" data-role="move" title="' + esc(t.name) +
          '" style="left:' + (xAt(s[1]) + W / 2 - 8) + 'px;top:' + (top + 9) +
          'px;background:' + color + '"></div>';
      } else {
        var bx = xAt(s[0]), bw = Math.max(xEnd(s[1]) - bx, 6);
        h += '<div class="g-bar' + (t.completed ? ' done' : '') + (blocked ? ' blocked' : '') + dim +
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
  R.ganttLegend = colorLegend;
  R.G_ZOOMS = G_ZOOMS;
  R.G_ROW = G_ROW;
  R.G_LEFT = gLeft;
  R.depTypeHint = depTypeHint;
  R.taskSpan = span;

})(window);

/* Orbit — Sprint 4 (ต่อ) ชุด B
 *   - Gantt: วันหยุดไทย/เสาร์อาทิตย์เป็นแถบเทา, ระยะเวลาเป็นวันทำการ, หมุดวันเริ่มโปรเจกต์, พิมพ์/PDF แนวนอน
 *   - เซกชัน: ลากสลับลำดับ, เลื่อนขึ้น/ลง, เพิ่มหลายเซกชัน
 *   - ฟิลด์กำหนดเอง: "สำคัญ" แสดงบนการ์ด, คำอธิบาย ⓘ, รวมฟิลด์ซ้ำ
 * ไม่เพิ่ม SCHEMA — ฟิลด์ใหม่ที่ไม่มีให้ถือเป็นค่าเริ่มต้นในโค้ดนี้ */
(function (global) {
  'use strict';

  var S = global.Store, R = global.Render, L = global.I18N.t, I = global.Icons.icon;
  var esc = R.esc;

  /* ====================== วันหยุดนักขัตฤกษ์ไทย 2026–2027 (รวมวันชดเชย) ====================== */
  var HOLIDAYS = {
    '2026-01-01': 'วันขึ้นปีใหม่', '2026-01-02': 'วันหยุดพิเศษ', '2026-03-03': 'วันมาฆบูชา', '2026-04-06': 'วันจักรี',
    '2026-04-13': 'วันสงกรานต์', '2026-04-14': 'วันสงกรานต์', '2026-04-15': 'วันสงกรานต์', '2026-05-01': 'วันแรงงาน',
    '2026-05-04': 'วันฉัตรมงคล', '2026-06-01': 'ชดเชยวันวิสาขบูชา', '2026-06-03': 'วันเฉลิมฯ สมเด็จพระราชินี',
    '2026-07-28': 'วันเฉลิมฯ ร.10', '2026-07-29': 'วันอาสาฬหบูชา', '2026-07-30': 'วันเข้าพรรษา', '2026-08-12': 'วันแม่แห่งชาติ',
    '2026-10-13': 'วันคล้ายวันสวรรคต ร.9', '2026-10-23': 'วันปิยมหาราช', '2026-12-07': 'ชดเชยวันพ่อแห่งชาติ',
    '2026-12-10': 'วันรัฐธรรมนูญ', '2026-12-31': 'วันสิ้นปี',
    '2027-01-01': 'วันขึ้นปีใหม่', '2027-02-22': 'ชดเชยวันมาฆบูชา', '2027-04-06': 'วันจักรี', '2027-04-13': 'วันสงกรานต์',
    '2027-04-14': 'วันสงกรานต์', '2027-04-15': 'วันสงกรานต์', '2027-05-03': 'ชดเชยวันแรงงาน', '2027-05-04': 'วันฉัตรมงคล',
    '2027-05-20': 'วันวิสาขบูชา', '2027-06-03': 'วันเฉลิมฯ สมเด็จพระราชินี', '2027-07-19': 'วันอาสาฬหบูชา',
    '2027-07-20': 'วันเข้าพรรษา', '2027-07-28': 'วันเฉลิมฯ ร.10', '2027-08-12': 'วันแม่แห่งชาติ',
    '2027-10-13': 'วันคล้ายวันสวรรคต ร.9', '2027-10-25': 'ชดเชยวันปิยมหาราช', '2027-12-06': 'ชดเชยวันพ่อแห่งชาติ',
    '2027-12-10': 'วันรัฐธรรมนูญ', '2027-12-31': 'วันสิ้นปี'
  };
  function dow(ds) { return new Date(ds + 'T00:00:00').getDay(); }
  function isOff(ds) { var d = dow(ds); return d === 0 || d === 6 || !!HOLIDAYS[ds]; }
  /** วันทำการ นับทั้งวันเริ่มและวันจบ (ข้ามเสาร์อาทิตย์และวันหยุดไทย) */
  function workDays(a, b) {
    if (!a && !b) return null;
    a = a || b; b = b || a;
    if (b < a) { var t = a; a = b; b = t; }
    var n = 0, d = a, guard = 0;
    while (d <= b && guard++ < 4000) { if (!isOff(d)) n++; d = S.addDays(d, 1); }
    return n;
  }
  R.s4bWorkDays = workDays;

  /** พื้นหลังของผัง Gantt: แถบวันหยุด + หมุดวันเริ่มโปรเจกต์ */
  R.s4bGanttBg = function (from, days, W, p) {
    var h = '', i = 0;
    while (i < days) {
      var ds = S.addDays(from, i);
      if (!isOff(ds)) { i++; continue; }
      var j = i, hol = '';
      while (j < days && isOff(S.addDays(from, j))) { var x = HOLIDAYS[S.addDays(from, j)]; if (x) hol = x; j++; }
      h += '<div class="g-off' + (hol ? ' hol' : '') + '" style="left:' + (i * W) + 'px;width:' + ((j - i) * W) + 'px"' +
        (hol ? ' title="' + esc(L(hol)) + '"' : '') + '></div>';
      i = j;
    }
    if (p && p.startOn) {
      var k = S.daysBetween(from, p.startOn);
      if (k >= 0 && k < days) {
        h += '<div class="g-pstart" style="left:' + (k * W) + 'px" title="' + esc(L('วันเริ่มโปรเจกต์ {d}', { d: R.fmtDate(p.startOn) })) +
          '"><span>' + esc(L('เริ่มโปรเจกต์')) + '</span></div>';
      }
    }
    return h;
  };

  /** ปุ่มในแถบเครื่องมือ Gantt */
  R.s4bGanttBtns = function (pid) {
    return '<button class="btn btn-sm g-s4b-btn" data-act="g-set-baseline" title="' + esc(L('บันทึกวันที่ของทุกงานไว้เป็นแผนเดิม แล้วเทียบกับวันที่ปัจจุบัน')) + '">' +
      esc(L('บันทึกแผนเดิม')) + '</button>' +
      '<button class="btn btn-sm g-s4b-btn" data-act="s4b-print-gantt" data-id="' + esc(pid) + '" title="' + esc(L('พิมพ์ / บันทึก PDF')) + '">' +
      I('printer', 13) + '<span class="hide-sm"> ' + esc(L('พิมพ์ / PDF')) + '</span></button>';
  };

  /* ---------- พิมพ์ Gantt (A4 แนวนอน สีอ่อน) ---------- */
  function printGanttHtml(pid) {
    var p = S.project(pid);
    if (!p) return '';
    var rows = [], min = null, max = null;
    function sp(t) {
      var a = t.startOn || t.dueOn, b = t.dueOn || t.startOn;
      if (!a) return null;
      return b < a ? [b, a] : [a, b];
    }
    var all = S.tasksInProject(pid);
    p.sections.forEach(function (sec) {
      var list = all.filter(function (x) { return x.membership.sectionId === sec.id; });
      if (!list.length) return;
      rows.push({ sec: sec.name });
      list.forEach(function (x) {
        var s = sp(x.task);
        if (s) { if (!min || s[0] < min) min = s[0]; if (!max || s[1] > max) max = s[1]; }
        rows.push({ t: x.task, s: s });
      });
    });
    if (!min) return '';
    if (p.startOn && p.startOn < min) min = p.startOn;
    min = S.addDays(min, -2); max = S.addDays(max, 3);
    var days = S.daysBetween(min, max) + 1;
    function pct(d) { return (S.daysBetween(min, d) / days * 100).toFixed(3) + '%'; }
    function wpc(a, b) { return (((S.daysBetween(a, b) + 1) / days) * 100).toFixed(3) + '%'; }
    var bg = '', i;
    for (i = 0; i < days; i++) {
      var ds = S.addDays(min, i);
      if (isOff(ds)) bg += '<i class="pg-off' + (HOLIDAYS[ds] ? ' hol' : '') + '" style="left:' + (i / days * 100).toFixed(3) + '%;width:' + (100 / days).toFixed(3) + '%"></i>';
    }
    var tickH = '', m = new Date(min + 'T00:00:00');
    m = new Date(m.getFullYear(), m.getMonth(), 1);
    for (; S.iso(m) <= max; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      var md = S.iso(m) < min ? min : S.iso(m);
      tickH += '<span class="pg-tick" style="left:' + pct(md) + '">' + esc(R.MON()[m.getMonth()] + ' ' + R.YR(m.getFullYear())) + '</span>';
    }
    var td = S.today();
    var h = '<div class="ps-doc ps-gantt"><div class="ps-head"><div class="ps-brand">Orbit</div><h1>' + esc(p.icon + ' ' + p.name) +
      '</h1><div class="ps-sub">' + esc(L('แผนงาน (Gantt)')) + ' · ' + esc(R.fmtDate(min)) + ' – ' + esc(R.fmtDate(max)) + '</div></div>';
    h += '<div class="pg-wrap"><div class="pg-row pg-headrow"><div class="pg-name"></div><div class="pg-area pg-ticks">' + tickH + '</div><div class="pg-dur">' + esc(L('วันทำการ')) + '</div></div>';
    rows.forEach(function (r) {
      if (r.sec) { h += '<div class="pg-row pg-sec"><div class="pg-name">' + esc(r.sec) + '</div><div class="pg-area"></div><div class="pg-dur"></div></div>'; return; }
      var t = r.t, bar = '';
      var bl = p.baseline && p.baseline.tasks && p.baseline.tasks[t.id];
      if (bl && (bl.startOn || bl.dueOn)) {
        var ba = bl.startOn || bl.dueOn, bb = bl.dueOn || bl.startOn;
        if (bb < ba) { var z = ba; ba = bb; bb = z; }
        bar += '<b class="pg-base" style="left:' + pct(ba) + ';width:' + wpc(ba, bb) + '"></b>';
      }
      if (r.s) bar += (t.type === 'milestone' ? '<b class="pg-ms" style="left:' + pct(r.s[1]) + '"></b>' :
        '<b class="pg-bar' + (t.completed ? ' done' : '') + '" style="left:' + pct(r.s[0]) + ';width:' + wpc(r.s[0], r.s[1]) + '"></b>');
      var wd = r.s ? workDays(r.s[0], r.s[1]) : null;
      h += '<div class="pg-row"><div class="pg-name">' + esc(t.name) + '</div><div class="pg-area">' + bar + '</div><div class="pg-dur">' +
        (wd ? esc(L('{n} วัน', { n: wd })) : '') + '</div></div>';
    });
    h += '<div class="pg-over"><div class="pg-overarea">' + bg +
      (p.startOn ? '<u class="pg-pstart" style="left:' + pct(p.startOn) + '"></u>' : '') +
      (td >= min && td <= max ? '<u class="pg-today" style="left:' + pct(td) + '"></u>' : '') + '</div></div></div>';
    h += '<p class="ps-meta">' + esc(L('แถบเทา = เสาร์อาทิตย์/วันหยุดนักขัตฤกษ์ · เส้นเทาใต้แท่ง = แผนเดิม')) + '</p></div>';
    return h;
  }
  function printLandscape(html, title) {
    var st = document.createElement('style');
    st.textContent = '@page { size: A4 landscape; margin: 10mm; }';
    document.head.appendChild(st);
    var el = document.getElementById('printSheet');
    if (!el) { el = document.createElement('div'); el.id = 'printSheet'; el.className = 'print-sheet'; document.body.appendChild(el); }
    var old = document.title;
    el.innerHTML = html;
    document.body.classList.add('printing');
    document.title = title;
    var done = function () {
      global.removeEventListener('afterprint', done);
      document.body.classList.remove('printing');
      document.title = old; el.innerHTML = ''; st.remove();
    };
    global.addEventListener('afterprint', done);
    setTimeout(function () { try { global.print(); } catch (e) { done(); } }, 120);
  }

  /* ====================== ลงทะเบียนการกระทำ ====================== */
  global.OrbitExt = global.OrbitExt || [];
  global.OrbitExt.push(function (api) {
    var st = api.state;
    api.needs('structure', ['s4b-bulk-sec', 's4b-bulk-ok', 's4b-merge-field']);

    /* ----- เซกชัน: ลากสลับลำดับ (เดสก์ท็อป) — บนจอสัมผัสใช้ เลื่อนขึ้น/ลง ในเมนู ⋯ ----- */
    var secDrag = null;
    function canStruct() { return st.route && st.route.type === 'project' && S.can('structure') && S.canInProject(st.route.id, 'edit'); }
    api.after(function ($v) {
      if (!canStruct()) return;
      Array.prototype.forEach.call($v.querySelectorAll('.tbl-sec[data-section], .col-head'), function (h) {
        var b = h.matches('.tbl-sec') ? h : h.querySelector('[data-act="move-section"][data-section]');
        var id = h.matches('.tbl-sec') ? h.dataset.section : (b && b.dataset.section);
        if (!id) return;
        h.setAttribute('draggable', 'true');
        h.setAttribute('data-s4b-sec', id);
        h.title = h.title || L('ลากเพื่อเรียงลำดับเซกชัน');
      });
    });
    function clearMarks() {
      Array.prototype.forEach.call(document.querySelectorAll('.s4b-drop-b,.s4b-drop-a,.s4b-dragging'), function (x) {
        x.classList.remove('s4b-drop-b', 's4b-drop-a', 's4b-dragging');
      });
    }
    document.addEventListener('dragstart', function (e) {
      var h = e.target.closest ? e.target.closest('[data-s4b-sec]') : null;
      if (!h || (e.target.closest && e.target.closest('[data-id]:not([data-s4b-sec])'))) return;
      secDrag = { id: h.dataset.s4bSec, el: h };
      h.classList.add('s4b-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', 'section:' + secDrag.id); } catch (err) { /* ie */ }
    });
    function overHead(e) {
      return secDrag && e.target.closest ? e.target.closest('[data-s4b-sec]') : null;
    }
    document.addEventListener('dragover', function (e) {
      var h = overHead(e);
      if (!h || h.dataset.s4bSec === secDrag.id) return;
      e.preventDefault();
      clearMarks(); secDrag.el.classList.add('s4b-dragging');
      var r = h.getBoundingClientRect();
      var horiz = h.matches('.col-head');
      var before = horiz ? (e.clientX < r.left + r.width / 2) : (e.clientY < r.top + r.height / 2);
      h.classList.add(before ? 's4b-drop-b' : 's4b-drop-a');
    });
    document.addEventListener('drop', function (e) {
      var h = overHead(e);
      if (!h) return;
      e.preventDefault();
      var p = S.project(st.route.id), id = secDrag.id, tid = h.dataset.s4bSec;
      var before = h.classList.contains('s4b-drop-b');
      clearMarks(); secDrag = null;
      if (!p || id === tid) return;
      var ids = p.sections.map(function (s) { return s.id; }).filter(function (x) { return x !== id; });
      var at = ids.indexOf(tid) + (before ? 0 : 1);
      if (S.reorderSection(p.id, id, at)) api.toast(L('ย้ายลำดับเซกชันแล้ว'), L('ย้อนกลับ'), 'undo');
    });
    document.addEventListener('dragend', function () { secDrag = null; clearMarks(); });

    api.act(function (act, el) {
      if (act === 's4b-bulk-sec') {
        api.closePops();
        api.openModal('<h2>' + esc(L('เพิ่มหลายเซกชัน')) + '</h2><p class="prj-note">' + esc(L('วางหรือพิมพ์ชื่อเซกชัน บรรทัดละหนึ่งเซกชัน')) +
          '</p><div class="field"><textarea id="s4bBulk" rows="8" placeholder="' + esc(L('เช่น\nรอดำเนินการ\nกำลังทำ\nตรวจงาน')) + '"></textarea></div>' +
          '<div class="modal-acts"><button class="btn" data-act="close-modal">' + esc(L('ยกเลิก')) + '</button>' +
          '<button class="btn btn-primary" data-act="s4b-bulk-ok">' + esc(L('เพิ่มทั้งหมด')) + '</button></div>');
        setTimeout(function () { var t = document.getElementById('s4bBulk'); if (t) t.focus(); }, 30);
        return true;
      }
      if (act === 's4b-merge-field') {
        api.closePops();
        var mpid = st.route.id, mp = S.project(mpid), fa = ((mp || {}).fields || []).filter(function (f) { return f.id === el.dataset.field; })[0];
        if (!fa) return true;
        var cands = mp.fields.filter(function (f) { return f.id !== fa.id && f.type === fa.type && !f.lib && f.type !== 'id' && f.type !== 'formula'; });
        if (fa.lib || !cands.length) { api.toast(L('ไม่มีฟิลด์ชนิดเดียวกันให้รวม (ฟิลด์จากคลังรวมไม่ได้)')); return true; }
        api.askChoice(L('รวม “{a}” เข้ากับฟิลด์ไหน?', { a: fa.name }),
          L('ค่าของ “{a}” จะย้ายไปฟิลด์ที่เลือกเฉพาะงานที่ฟิลด์นั้นยังว่าง แล้วฟิลด์ “{a}” จะถูกลบ', { a: fa.name }),
          cands.map(function (c) {
            return { label: c.name, run: function () {
              api.closeModal();
              var n = S.mergeFields(mpid, fa.id, c.id);
              if (n === false) { api.denyToast(); return; }
              api.renderAll();
              api.toast(L('รวมฟิลด์แล้ว ย้ายค่า {n} รายการ', { n: n }), L('ย้อนกลับ'), 'undo');
            } };
          }));
        return true;
      }
      if (act === 's4b-bulk-ok') {
        var ta = document.getElementById('s4bBulk');
        var names = ta ? ta.value.split(/\r?\n/).map(function (x) { return x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim(); }).filter(Boolean) : [];
        if (!names.length) { api.toast(L('ยังไม่ได้ใส่ชื่อเซกชัน')); return true; }
        var made = S.addSections(st.route.id, names);
        api.closeModal();
        api.toast(L('เพิ่ม {n} เซกชันแล้ว', { n: made.length }), L('ย้อนกลับ'), 'undo');
        return true;
      }
      if (act === 's4b-print-gantt') {
        var h = printGanttHtml(el.dataset.id);
        if (!h) { api.toast(L('ยังไม่มีงานที่มีวันที่ให้พิมพ์')); return true; }
        printLandscape(h, 'Orbit - Gantt - ' + ((S.project(el.dataset.id) || {}).name || '') + ' - ' + S.today());
        return true;
      }
      return false;
    });
  });
})(window);

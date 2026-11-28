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
    api.act(function (act, el) {
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

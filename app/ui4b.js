/* Orbit — การโต้ตอบของชิ้นงาน 4b (ภาระงาน ช่วงไม่อยู่ ความจุ ไทม์ชีต รายงานรวม)
 *
 * โหลดก่อน main.js แล้วฝากฟังก์ชันเริ่มต้นไว้ใน window.OrbitExt
 * main.js เรียกฟังก์ชันนี้พร้อม api (หน้าต่าง ถามผู้ใช้ ตารางสิทธิ์ เส้นทาง) ก่อนบูต
 */
(function (global) {
  'use strict';

  global.OrbitExt = global.OrbitExt || [];
  global.OrbitExt.push(function (api) {
    var S = api.S, R = api.R, L = api.L, I = api.I, esc = api.esc, state = api.state;
    var toast = api.toast;

    state.wl = { open: {}, anchor: {}, scope: null };
    state.ts = { extra: {}, week: null, focus: null };
    state.rpe = null;
    state.rpSc = null;

    /* ---------- สิทธิ์ ----------
     * store ตรวจซ้ำทุกจุด (แก้ของตัวเองหรือผู้ดูแล / ผู้ตรวจ / เจ้าของรายงาน / แก้งานได้) */
    api.needs('self', ['wl-zoom', 'wl-nav', 'wl-src', 'wl-unit', 'wl-team', 'wl-cap', 'away-add', 'away-del', 'cap-set',
      'ts-submit', 'ts-recall', 'ts-approve', 'ts-reject', 'ts-reopen', 'ts-edel', 'ts-bill', 'ts-cat',
      'rp-wsave', 'rp-wdel', 'rp-wup', 'rp-wdown', 'rp-wfull', 'rp-wdup', 'rp-rename', 'rp-scope-save', 'rp-share-save', 'rp-delete']);
    api.needs('comment', ['ts-cell']);
    api.needs('create', ['wl-cell-new', 'wl-track', 'rp-new', 'rp-create']);
    api.needs('manage', ['tscat-add', 'tscat-del', 'tsrev-add', 'tsrev-del']);

    /* ---------- เส้นทาง ---------- */
    api.route('workload', {
      parse: function () { return { type: 'workload' }; },
      hash: function () { return ['workload']; },
      body: function () { return wlBody({ kind: 'all' }); }
    });
    api.route('timesheets', {
      parse: function (seg) {
        return { type: 'timesheets', tab: seg[1] === 'review' ? 'review' : 'mine', ts: seg[1] === 'review' && seg[2] ? seg[2] : null };
      },
      hash: function (r) { return r.tab === 'review' ? ['timesheets', 'review'].concat(r.ts ? [r.ts] : []) : ['timesheets']; },
      body: function (r) {
        r.week = state.ts.week || S.weekOf(S.today());
        return R.timesheetsView(r, state.ts);
      }
    });
    api.route('reports', {
      parse: function () { return { type: 'reports' }; },
      hash: function () { return ['reports']; },
      body: function () { return R.reportsView(); }
    });
    api.route('report', {
      parse: function (seg) { return seg[1] ? { type: 'report', id: seg[1] } : null; },
      hash: function (r) { return ['report', r.id]; },
      body: function (r) {
        if (!S.report(r.id) || !S.canSeeReport(r.id)) { state.route = { type: 'reports' }; return null; }
        return R.reportView(r.id);
      }
    });
    api.deep('report');
    api.deep('timesheets');
    api.projView('workload', function (pid) { return wlBody({ kind: 'project', id: pid }); });
    api.pfView('workload', function (pfid) { return wlBody({ kind: 'portfolio', id: pfid }); });

    /* ลิงก์จากกล่องแจ้งเตือน ts:<id> และ report:<id> */
    api.openRoute(function (r) {
      var m = /^(ts|report):(.+)$/.exec(String(r || ''));
      if (!m) return false;
      if (m[1] === 'report') {
        state.route = S.report(m[2]) && S.canSeeReport(m[2]) ? { type: 'report', id: m[2] } : { type: 'reports' };
      } else {
        var x = S.tsById(m[2]);
        if (x && x.userId === S.db.currentUserId) { state.ts.week = x.week; state.route = { type: 'timesheets', tab: 'mine' }; }
        else state.route = { type: 'timesheets', tab: 'review', ts: x ? x.id : null };
      }
      api.renderAll();
      return true;
    });

    /* ====================== ภาระงาน ====================== */
    function wlKey(scope) { return scope.kind === 'all' ? 'all' : scope.kind + ':' + scope.id; }
    function wlBody(scope) {
      if (scope.kind === 'all') {
        var t0 = S.wlCfg({ kind: 'all' }).team || '';
        scope.team = t0 && S.team(t0) && S.canSeeTeam(t0) ? t0 : '';
      }
      var cfg = S.wlCfg(scope);
      cfg.anchor = state.wl.anchor[wlKey(scope)] || null;
      state.wl.scope = scope;
      return R.workloadView(scope, { cfg: cfg, open: state.wl.open });
    }
    function wlScope() { return state.wl.scope || { kind: 'all' }; }
    function wlSet(patch) { S.setWlCfg(wlScope(), patch); api.renderViewBody(); }

    function wlCreate(uid, date) {
      if (!S.can('write')) { api.denyToast(); return; }
      var scope = wlScope(), u = S.user(uid);
      if (!u) return;
      var go = function (pid) {
        var p = pid ? S.project(pid) : null;
        /* ด่านสร้างงานตัวเดียวกับทุกทาง (Sprint 1B) ตรวจก่อนให้พิมพ์ชื่อ ไม่ใช่พิมพ์เสร็จแล้วค่อยโดนปฏิเสธ */
        if (!S.canCreateTask(p ? p.id : null)) { api.denyToast(); return; }
        api.askText(L('งานใหม่ของ {n} · {d}', { n: u.name, d: R.fmtDate(date) }), '', function (name) {
          if (!name) return;
          /* สร้างงานให้คนที่ไม่ได้เป็นสมาชิกโปรเจกต์ปิด = เขาจะเห็นงานนี้ทั้งงาน (ความเห็น ไฟล์แนบ)
           * เดิมสร้างเงียบ ๆ ตอนนี้ถามก่อนแบบเดียวกับมอบงานในแผงงาน ยกเลิก = ไม่มีงานเกิดขึ้น */
          api.confirmRevealNew(p ? p.id : null, [uid], function () {
            var t = S.createTask({ name: name, assigneeId: uid, dueOn: date }, p ? p.id : null, p ? p.sections[0].id : null);
            if (t) toast(L('สร้างงานแล้ว'), L('ย้อนกลับ'), 'undo');
            return t;
          });
        }, { placeholder: L('ชื่องาน') });
      };
      if (scope.kind === 'project') { go(scope.id); return; }
      var projs = S.wlProjects(scope).filter(function (p) { return S.canInProject(p.id, 'edit') && p.sections && p.sections.length; });
      var choices = projs.slice(0, 12).map(function (p) { return { label: p.icon + ' ' + p.name, run: function () { go(p.id); } }; });
      if (scope.kind === 'all') choices.push({ label: L('งานส่วนตัว (ไม่อยู่ในโปรเจกต์)'), run: function () { go(null); } });
      if (choices.length === 1) { choices[0].run(); return; }
      if (!choices.length) { toast(L('ไม่มีโปรเจกต์ที่คุณแก้ได้ในขอบเขตนี้')); return; }
      api.askChoice(L('สร้างงานในโปรเจกต์ไหน'), '', choices);
    }

    /* ลากแถบงาน — แนวนอน = เลื่อนวัน แนวตั้งไปชื่อ/แถวของอีกคน = มอบให้คนนั้น (ใช้ pointer event จึงลากด้วยนิ้วได้) */
    var wlDrag = null;
    function wlClearDrop() {
      Array.prototype.forEach.call(document.querySelectorAll('.wl-drop'), function (x) { x.classList.remove('wl-drop'); });
    }
    document.addEventListener('pointerdown', function (e) {
      var bar = e.target.closest && e.target.closest('.wl-tbar[data-wl-task]');
      if (!bar || (e.pointerType === 'mouse' && e.button !== 0)) return;
      var grid = bar.closest('.wl-grid'), track = bar.parentNode;
      if (!grid || !track) return;
      var D = S.daysBetween(grid.dataset.from, grid.dataset.to) + 1;
      wlDrag = { bar: bar, id: bar.dataset.wlTask, uid: bar.dataset.uid, x: e.clientX, y: e.clientY, pid: e.pointerId,
        dayPx: track.getBoundingClientRect().width / D, moved: false, delta: 0, to: null };
    });
    document.addEventListener('pointermove', function (e) {
      var d = wlDrag;
      if (!d || e.pointerId !== d.pid) return;
      var dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      if (!d.moved) {
        d.moved = true;
        d.bar.classList.add('dragging');
        document.body.classList.add('wl-dragging');
        try { d.bar.setPointerCapture(e.pointerId); } catch (err) { /* ไม่รองรับ */ }
      }
      e.preventDefault();
      d.delta = Math.round(dx / d.dayPx);
      d.bar.style.transform = 'translate(' + (d.delta * d.dayPx) + 'px,' + dy + 'px)';
      d.bar.style.pointerEvents = 'none';
      var under = document.elementFromPoint(e.clientX, e.clientY);
      d.bar.style.pointerEvents = '';
      var tgt = under && under.closest ? under.closest('[data-uid]') : null;
      d.to = tgt ? tgt.dataset.uid : null;
      wlClearDrop();
      if (d.to && d.to !== d.uid) {
        var nm = document.querySelector('.wl-name[data-uid="' + d.to + '"]');
        if (nm) nm.classList.add('wl-drop');
      }
    }, { passive: false });
    function wlEnd(e, cancel) {
      var d = wlDrag;
      if (!d || (e && e.pointerId !== d.pid)) return;
      wlDrag = null;
      document.body.classList.remove('wl-dragging');
      wlClearDrop();
      if (!d.moved) return;
      api.markDragEnd();
      var to = d.to && d.to !== d.uid ? d.to : null;
      if (cancel || (!d.delta && !to)) { d.bar.style.transform = ''; d.bar.classList.remove('dragging'); return; }
      var t = S.task(d.id), tu = to ? S.user(to) : null;
      /* Sprint 1C — งานค้างแสดงที่วันนี้ เลื่อน N วันจากตรงนั้น = กำหนดส่งใหม่คือวันนี้ + N */
      if (d.delta && d.bar.dataset.wlLate) d.delta += parseInt(d.bar.dataset.wlLate, 10) || 0;
      var delta = d.delta;
      if (!t || !S.can('write', d.id)) { api.denyToast(); api.renderViewBody(); return; }
      var move = function () {
        if (S.wlMove(d.id, delta, to)) {
          var msg = tu && delta ? L('ย้าย “{t}” ให้ {u} และเลื่อน {n} วัน', { t: t.name, u: tu.name, n: delta })
            : tu ? L('มอบ “{t}” ให้ {u} แล้ว', { t: t.name, u: tu.name }) : L('เลื่อน “{t}” {n} วัน', { t: t.name, n: delta });
          toast(msg, L('ย้อนกลับ'), 'undo');
        } else { api.denyToast(); api.renderViewBody(); }
      };
      if (!to) { move(); return; }
      /* ลากไปแถวของอีกคน = มอบงานให้เขา ถ้างานอยู่ในโปรเจกต์ปิดที่เขาไม่ได้เป็นสมาชิก ถามก่อน
       * (เดิมมอบเงียบ ๆ) คืนแถบกลับที่เดิมก่อนถาม — กดยกเลิกแล้วแถบต้องไม่ค้างอยู่ตรงที่ลากไปวาง */
      d.bar.style.transform = '';
      d.bar.classList.remove('dragging');
      api.confirmReveal(d.id, [to], move);
    }
    document.addEventListener('pointerup', function (e) { wlEnd(e, false); });
    document.addEventListener('pointercancel', function (e) { wlEnd(e, true); });

    /* ====================== ไทม์ชีต ====================== */
    function tsWeek() { return state.ts.week || S.weekOf(S.today()); }
    function tsCommitCell(el) {
      var raw = String(el.value || '').trim();
      var mins = raw === '' ? 0 : S.parseDuration(raw);
      if (mins === null) { toast(L('ใส่ระยะเวลาให้ถูกต้อง เช่น 1h 30m')); api.renderViewBody(); return true; }
      var tr = el.closest('tr'), bill = tr && tr.querySelector('[data-act="ts-bill"]'), cat = tr && tr.querySelector('[data-act="ts-cat"]');
      var meta = { billable: bill && bill.checked ? true : null, category: cat && cat.value && cat.value !== '*' ? cat.value : null };
      var ok = S.setTimeCell(el.dataset.id, el.dataset.d, mins, meta);
      if (!ok && S.tsLocked(S.db.currentUserId, el.dataset.d)) { toast(L('สัปดาห์นี้ส่งไทม์ชีตหรืออนุมัติแล้ว ลงเวลาเพิ่มไม่ได้')); api.renderViewBody(); }
      return ok;
    }
    document.addEventListener('keydown', function (e) {
      var el = e.target;
      if (!el || !el.classList || !el.classList.contains('ts-in')) return;
      if (e.key !== 'Tab' && e.key !== 'Enter') return;
      e.preventDefault();
      var all = Array.prototype.slice.call(document.querySelectorAll('.ts-in'));
      var i = all.indexOf(el), step = e.key === 'Enter' ? 7 : 1;
      var nx = all[e.shiftKey ? i - step : i + step] || null;
      state.ts.focus = nx ? { id: nx.dataset.id, d: nx.dataset.d } : null;
      var changed = tsCommitCell(el);
      if (!changed && nx) { nx.focus(); nx.select(); state.ts.focus = null; }
    });
    function tsPickList(q) {
      q = String(q || '').trim().toLowerCase();
      var seen = {}, out = [], me = S.db.currentUserId;
      var add = function (t) {
        if (!t || seen[t.id] || !S.canSeeTask(t.id)) return;
        if (q && t.name.toLowerCase().indexOf(q) < 0) return;
        seen[t.id] = true;
        out.push(t);
      };
      S.db.tasks.forEach(function (t) { if (!t.completed && t.assigneeId === me) add(t); });
      S.db.tasks.forEach(function (t) { if ((t.time || []).some(function (x) { return x.userId === me; })) add(t); });
      if (q) S.db.tasks.forEach(function (t) { if (out.length < 40) add(t); });
      return out.slice(0, 40).map(function (t) {
        return '<button class="pf-pick-row" data-act="ts-pick" data-id="' + esc(t.id) + '"><span class="grow"><b>' + esc(t.name) + '</b><em>' +
          esc(S.taskProjectName(t) || L('งานส่วนตัว')) + '</em></span>' + I('plus', 14) + '</button>';
      }).join('') || '<p class="prj-note">' + L('ไม่พบงาน') + '</p>';
    }
    document.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'tsq') {
        var l = document.getElementById('tsqList');
        if (l) l.innerHTML = tsPickList(e.target.value);
      }
      if (e.target && e.target.id === 'rpeTitle' && state.rpe) state.rpe.w.title = e.target.value;
    });

    /* หลังวาดหน้า: คืนโฟกัสให้ช่องไทม์ชีตถัดไป + ติ๊กกึ่งของช่องเก็บเงินได้ */
    api.after(function ($view) {
      Array.prototype.forEach.call($view.querySelectorAll('input[data-mixed]'), function (x) { x.indeterminate = true; });
      var f = state.ts.focus;
      if (f) {
        state.ts.focus = null;
        var nx = $view.querySelector('.ts-in[data-id="' + f.id + '"][data-d="' + f.d + '"]');
        if (nx) { nx.focus(); nx.select(); }
      }
    });

    function exportRangeHtml() {
      var td = S.today();
      return '<h2>' + L('ส่งออกรายการเวลา (CSV)') + '</h2><p class="prj-note">' +
        L('ผู้ดูแลระบบได้ทุกคน ผู้ตรวจได้เฉพาะไทม์ชีตที่ตรวจได้ คนอื่นได้เฉพาะของตัวเอง') + '</p>' +
        '<div class="prj-2col"><div class="field"><label>' + L('ตั้งแต่') + '</label><input id="tsFrom" type="date" value="' + td.slice(0, 8) + '01"></div>' +
        '<div class="field"><label>' + L('ถึง') + '</label><input id="tsTo" type="date" value="' + td + '"></div></div>' +
        '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
        '<button class="btn btn-primary" data-act="ts-export-do">' + I('download', 13) + ' ' + L('ดาวน์โหลด') + '</button></div>';
    }

    /* ====================== รายงานรวม ====================== */
    function rid() { return state.route.type === 'report' ? state.route.id : null; }
    function rpScopeHtml(sc) {
      var k = sc.k;
      var h = '<div class="field"><label>' + L('ขอบเขตข้อมูล') + '</label>' +
        R.wlSel('rpsc-k', S.REPORT_SCOPES.map(function (x) { return [x[0], L(x[1])]; }), k) + '</div>';
      if (k === 'team') {
        var tms = S.visibleTeams();
        h += '<div class="field"><label>' + L('ทีม') + '</label><select id="rpTeam" class="opt-select">' + (tms.length ? tms.map(function (t) {
          return '<option value="' + esc(t.id) + '"' + (sc.id === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>';
        }).join('') : '<option value="">' + L('ยังไม่มีทีม') + '</option>') + '</select></div>';
      } else if (k === 'portfolio') {
        h += '<div class="field"><label>' + L('พอร์ตโฟลิโอ') + '</label><select id="rpPf" class="opt-select">' + S.portfolios().map(function (f) {
          return '<option value="' + esc(f.id) + '"' + (sc.id === f.id ? ' selected' : '') + '>' + esc(f.icon + ' ' + f.name) + '</option>';
        }).join('') + '</select></div>';
      } else if (k === 'projects') {
        h += '<div class="field"><label>' + L('โปรเจกต์') + '</label><div class="rp-checks">' + S.visibleProjects().map(function (p) {
          return '<label><input type="checkbox" name="rpProj" value="' + esc(p.id) + '"' + (sc.ids.indexOf(p.id) >= 0 ? ' checked' : '') + '> ' + esc(p.icon + ' ' + p.name) + '</label>';
        }).join('') + '</div></div>';
      }
      return h;
    }
    function readScope() {
      var sc = { k: state.rpSc.k, id: null, ids: [] };
      if (sc.k === 'team') sc.id = (document.getElementById('rpTeam') || {}).value || null;
      if (sc.k === 'portfolio') sc.id = (document.getElementById('rpPf') || {}).value || null;
      if (sc.k === 'projects') sc.ids = Array.prototype.map.call(document.querySelectorAll('input[name="rpProj"]:checked'), function (x) { return x.value; });
      return sc;
    }
    function rpNewHtml() {
      return '<h2>' + L('สร้างรายงาน') + '</h2><div class="field"><label>' + L('ชื่อรายงาน') + ' *</label><input id="rpName" maxlength="120" value="' +
        esc(state.rpSc.name || '') + '" placeholder="' + esc(L('เช่น ภาพรวมฝ่ายการตลาด')) + '"></div>' + rpScopeHtml(state.rpSc) +
        '<p class="prj-note">' + L('เริ่มด้วยวิดเจ็ตตั้งต้นห้าอัน แก้ ลบ หรือเพิ่มได้ภายหลัง') + '</p>' +
        '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
        '<button class="btn btn-primary" data-act="rp-create">' + L('สร้าง') + '</button></div>';
    }
    function rpScopeModal(r) {
      return '<h2>' + L('ขอบเขตของรายงาน') + '</h2>' + rpScopeHtml(state.rpSc) +
        '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
        '<button class="btn btn-primary" data-act="rp-scope-save" data-id="' + esc(r.id) + '">' + L('บันทึก') + '</button></div>';
    }
    function rpShareHtml(r) {
      var users = S.orgPeople().filter(function (u) { return u.active !== false && u.id !== r.owner; });
      return '<h2>' + L('แชร์รายงาน') + '</h2><p class="prj-note">' +
        L('คนที่ได้รับแชร์เห็นกราฟที่คิดจากงานที่ตัวเองมีสิทธิ์เห็นเท่านั้น และแก้รายงานไม่ได้') + '</p>' +
        '<label class="rp-org"><input type="checkbox" id="rpOrg"' + (r.share.org ? ' checked' : '') + '> ' + L('ทุกคนในองค์กรเห็นรายงานนี้ (ยกเว้นแขก)') + '</label>' +
        '<div class="field"><label>' + L('ทีม') + '</label><div class="rp-checks">' + (S.visibleTeams().map(function (t) {
          return '<label><input type="checkbox" name="rpShTeam" value="' + esc(t.id) + '"' + (r.share.teams.indexOf(t.id) >= 0 ? ' checked' : '') + '> ' + esc(t.icon + ' ' + t.name) + '</label>';
        }).join('') || '<span class="muted">' + L('ยังไม่มีทีม') + '</span>') + '</div></div>' +
        '<div class="field"><label>' + L('คน') + '</label><div class="rp-checks">' + users.map(function (u) {
          return '<label><input type="checkbox" name="rpShUser" value="' + esc(u.id) + '"' + (r.share.users.indexOf(u.id) >= 0 ? ' checked' : '') + '> ' + esc(u.name) + '</label>';
        }).join('') + '</div></div>' +
        '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
        '<button class="btn btn-primary" data-act="rp-share-save" data-id="' + esc(r.id) + '">' + L('บันทึก') + '</button></div>';
    }
    var KINDS_TASK = ['bar', 'stack', 'group', 'line', 'donut', 'number', 'lollipop', 'burnup', 'burndown'];
    var KINDS_OTHER = ['bar', 'stack', 'group', 'donut', 'number', 'lollipop'];
    function rpeFix(w) {
      var kinds = w.src === 'tasks' ? KINDS_TASK : KINDS_OTHER;
      if (kinds.indexOf(w.kind) < 0) w.kind = 'bar';
      var xs = R.rpXOptions(w.src).map(function (x) { return x[0]; }), ys = R.rpYOptions(w.src).map(function (x) { return x[0]; });
      if (xs.indexOf(w.x) < 0) w.x = xs[0];
      if (ys.indexOf(w.y) < 0) w.y = 'count';
      if (w.split && (xs.indexOf(w.split) < 0 && w.split !== 'completed')) w.split = '';
      if (w.split === w.x) w.split = '';
      return w;
    }
    function rpEditHtml() {
      var e = state.rpe, w = rpeFix(e.w), r = S.report(e.rid);
      var kinds = (w.src === 'tasks' ? KINDS_TASK : KINDS_OTHER).map(function (k) {
        var d = S.DASH_KINDS.filter(function (x) { return x[0] === k; })[0];
        return [k, L(d ? d[1] : k)];
      });
      var f = function (lbl, inner) { return '<div class="field"><label>' + L(lbl) + '</label>' + inner + '</div>'; };
      var h = '<h2>' + (e.isNew ? L('เพิ่มวิดเจ็ต') : L('แก้วิดเจ็ต')) + '</h2><div class="rpe"><div class="rpe-form">' +
        f('ชื่อวิดเจ็ต', '<input id="rpeTitle" maxlength="120" value="' + esc(w.title) + '" placeholder="' + esc(L('ไม่ใส่ = ใช้ชื่อแหล่งข้อมูล')) + '">') +
        f('แหล่งข้อมูล', R.wlSel('rpe-f', S.REPORT_SRCS.map(function (x) { return [x[0], L(x[1])]; }), w.src, ' data-k="src"')) +
        f('ชนิดกราฟ', R.wlSel('rpe-f', kinds, w.kind, ' data-k="kind"'));
      var timeKind = w.kind === 'burnup' || w.kind === 'burndown';
      if (w.kind !== 'number' && !timeKind) h += f('แกน X', R.wlSel('rpe-f', R.rpXOptions(w.src).map(function (x) { return [x[0], L(x[1])]; }), w.x, ' data-k="x"'));
      h += f(w.kind === 'number' ? 'ค่าที่แสดง' : 'แกน Y', R.wlSel('rpe-f', R.rpYOptions(w.src).map(function (x) { return [x[0], L(x[1])]; }), w.y, ' data-k="y"'));
      if (w.kind === 'stack' || w.kind === 'group') {
        var sp = [['', L('ไม่แยก')]].concat(R.rpXOptions(w.src).filter(function (x) { return x[0] !== w.x && x[0] !== 'period'; }).map(function (x) { return [x[0], L(x[1])]; }));
        h += f('แยกสีตาม', R.wlSel('rpe-f', sp, w.split, ' data-k="split"'));
      }
      if (w.src === 'tasks' && (timeKind || w.x === 'period')) {
        h += '<div class="prj-2col">' + f('หน่วยเวลา', R.wlSel('rpe-f', [['day', L('วัน')], ['week', L('สัปดาห์')], ['month', L('เดือน')]], w.unit, ' data-k="unit"')) +
          f('จำนวนช่วง', '<input type="number" min="2" max="36" class="opt-select" data-act="rpe-f" data-k="n" value="' + w.n + '">') + '</div>';
        if (w.x === 'period' && !timeKind) h += f('นับตามวันที่', R.wlSel('rpe-f', [['completedOn', L('วันที่ทำเสร็จ')], ['created', L('วันที่สร้าง')], ['due', L('กำหนดส่ง')]], w.date, ' data-k="date"'));
      }
      if (w.src === 'tasks') h += f('ตัวกรองด่วน', R.wlSel('rpe-f', [['all', L('งานทั้งหมด')], ['open', L('ยังไม่เสร็จ')], ['done', L('เสร็จแล้ว')], ['overdue', L('เลยกำหนด')]], w.q, ' data-k="q"'));
      h += '<label class="rp-org"><input type="checkbox" data-act="rpe-f" data-k="full"' + (w.full ? ' checked' : '') + '> ' + L('เต็มความกว้าง') + '</label>';
      h += '</div><div class="rpe-prev">' + global.Charts.svg(R.rpSpec(r, w, { act: 'rpe-noop' })) + '</div></div>' +
        '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
        '<button class="btn btn-primary" data-act="rp-wsave">' + L('บันทึก') + '</button></div>';
      return h;
    }
    /* Sprint 2C — เดิมบรรทัดรองของทุกงานเขียนแค่ว่า "งาน" ผู้บริหารเจาะดูวิดเจ็ตเลยกำหนดแล้วไม่รู้ว่าเป็นของใคร ช้าแค่ไหน
     * ตอนนี้งานบอก โปรเจกต์ · ผู้รับผิดชอบ · กำหนดส่ง (เลยกำหนดกี่วัน) และเรียงงานที่ช้าที่สุดขึ้นก่อน */
    function rpClickHtml(r, wid, cat, ser) {
      var list = S.reportClick(r.id, wid, cat, ser);
      var lab = { task: 'งาน', project: 'โปรเจกต์', portfolio: 'พอร์ตโฟลิโอ', goal: 'เป้าหมาย' };
      var td = S.today();
      var rows = list.map(function (x) {
        var o = { x: x, late: -1, due: null, sub: L(lab[x.kind]) };
        if (x.kind === 'task') {
          var t = S.task(x.id);
          if (t) {
            var pj = S.projectsOfTask(S.rootOf(t).id)[0];
            var u = S.user(t.assigneeId);
            o.due = t.dueOn || null;
            o.late = !t.completed && t.dueOn && t.dueOn < td ? S.daysBetween(t.dueOn, td) : -1;
            o.sub = [pj ? pj.project.name : L('งานส่วนตัว'), u ? u.name : L('ยังไม่มอบหมาย'),
              t.dueOn ? R.fmtDate(t.dueOn) : L('ไม่มีกำหนดส่ง')].join(' · ');
            o.done = !!t.completed;
          }
        } else if (x.kind === 'project') {
          var p = S.project(x.id), ps = p ? S.projectStats(p.id) : null, ow = p && S.user(p.owner);
          if (p) o.sub = [p.status ? L(R.projectState(p.status.state).label) : L('ยังไม่รายงาน'), ow ? ow.name : '',
            ps.overdue ? L('เลยกำหนด {n}', { n: ps.overdue }) : ''].filter(Boolean).join(' · ');
        }
        return o;
      });
      rows.sort(function (a, b) {
        if (a.late !== b.late) return b.late - a.late;            // ช้าที่สุดก่อน
        return String(a.due || '9999') < String(b.due || '9999') ? -1 : 1;
      });
      return '<h2>' + esc(L('{n} รายการ', { n: list.length })) + '</h2><div class="rp-click">' + (rows.map(function (o) {
        var x = o.x;
        var act = x.kind === 'task' ? 'data-act="open-task" data-id="' + esc(x.id) + '"'
          : 'data-act="go" data-route="' + x.kind + '" data-id="' + esc(x.id) + '"';
        return '<button class="pf-pick-row rp-click-row" ' + act + '><span class="grow"><b' + (o.done ? ' class="done"' : '') + '>' + esc(x.name) + '</b><em>' + esc(o.sub) + '</em></span>' +
          (o.late > 0 ? '<span class="chip due-over">' + esc(L('เลยกำหนด {n} วัน', { n: o.late })) + '</span>' : '') +
          I('chevronRight', 13) + '</button>';
      }).join('') || '<p class="prj-note">' + L('ไม่มีรายการ') + '</p>') + '</div>' +
        '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
    }

    /* ====================== คลิก ====================== */
    api.act(function (act, el, e) {
      var id = el.dataset.id;
      switch (act) {
        /* --- ภาระงาน --- */
        case 'wl-zoom': wlSet({ zoom: el.dataset.v }); return true;
        case 'wl-nav': {
          var sc = wlScope(), k = wlKey(sc), cfg = S.wlCfg(sc);
          state.wl.anchor[k] = +el.dataset.d ? S.wlStep(cfg.zoom, state.wl.anchor[k], +el.dataset.d) : null;
          api.renderViewBody();
          return true;
        }
        case 'wl-open': {
          var u0 = el.dataset.uid;
          if (state.wl.open[u0]) delete state.wl.open[u0]; else state.wl.open[u0] = true;
          api.renderViewBody();
          return true;
        }
        case 'wl-cell':
          if (!el.classList.contains('wl-zero')) { state.wl.open[el.dataset.uid] = true; api.renderViewBody(); return true; }
          if (!S.can('write')) { api.denyToast(); return true; }
          wlCreate(el.dataset.uid, el.dataset.from <= S.today() && el.dataset.to >= S.today() ? S.today() : el.dataset.from);
          return true;
        case 'wl-track': {
          if (!S.can('write')) { api.denyToast(); return true; }
          var grid = el.closest('.wl-grid'), rc = el.getBoundingClientRect();
          var D = S.daysBetween(grid.dataset.from, grid.dataset.to) + 1;
          var idx = Math.max(0, Math.min(D - 1, Math.floor((e.clientX - rc.left) / rc.width * D)));
          wlCreate(el.dataset.uid, S.addDays(grid.dataset.from, idx));
          return true;
        }
        case 'wl-cap': {
          var cu = S.user(el.dataset.uid), ck = el.dataset.k;
          var unit = { count: 'งานต่อวัน', h: 'ชั่วโมงต่อวัน', pt: 'พอยต์ต่อวัน', pct: 'เปอร์เซ็นต์ต่อวัน' }[ck];
          api.askText(L('ความจุของ {n} ({u})', { n: cu.name, u: L(unit) }), S.capacityOf(cu.id)[ck], function (v) {
            if (v === null || v === '') return;
            if (isNaN(+v) || +v < 0) { toast(L('ใส่ตัวเลขให้ถูกต้อง')); return; }
            var p = {}; p[ck] = +v;
            if (S.setCapacity(cu.id, p)) toast(L('ตั้งความจุแล้ว'), L('ย้อนกลับ'), 'undo');
          }, { type: 'number', note: L('ใช้คำนวณช่องที่เกินความจุในหน้าภาระงาน (วันที่ไม่อยู่ไม่นับความจุ)') });
          return true;
        }
        case 'set-away': {
          api.closePops();
          var au = el.dataset.uid || S.db.currentUserId;
          if (!S.canEditPerson(au)) { api.denyToast(); return true; }
          api.openModal(R.awayModal(au));
          return true;
        }
        case 'away-add': {
          var fu = el.dataset.uid;
          var from = (document.getElementById('awFrom') || {}).value || null, to = (document.getElementById('awTo') || {}).value;
          if (!to) { toast(L('เลือกวันสุดท้ายที่ไม่อยู่ก่อน')); return true; }
          if (S.addAwayRange(fu, from, to, (document.getElementById('awNote2') || {}).value)) {
            api.openModal(R.awayModal(fu));
            toast(L('เพิ่มช่วงไม่อยู่แล้ว'), L('ย้อนกลับ'), 'undo');
          } else api.denyToast();
          return true;
        }
        case 'away-del':
          if (S.removeAwayRange(el.dataset.uid, id)) { api.openModal(R.awayModal(el.dataset.uid)); toast(L('ลบช่วงไม่อยู่แล้ว'), L('ย้อนกลับ'), 'undo'); }
          return true;

        /* --- ไทม์ชีต --- */
        case 'ts-tab':
          state.route = { type: 'timesheets', tab: el.dataset.v };
          api.renderAll();
          return true;
        case 'ts-week': {
          var dd = +el.dataset.d;
          state.ts.week = dd ? S.addDays(tsWeek(), 7 * dd) : null;
          api.renderViewBody();
          return true;
        }
        case 'ts-goto':
          state.ts.week = el.dataset.w;
          state.route = { type: 'timesheets', tab: 'mine' };
          api.renderAll();
          return true;
        case 'ts-addrow':
          if (api.openPop(el, '<div class="ref-pop ts-pop"><input class="inp" id="tsq" placeholder="' + esc(L('ค้นหางานที่จะลงเวลา')) + '"><div id="tsqList" class="ref-res">' +
            tsPickList('') + '</div></div>')) setTimeout(function () { var q = document.getElementById('tsq'); if (q) q.focus(); }, 20);
          return true;
        case 'ts-pick': {
          var wk = tsWeek();
          state.ts.extra[wk] = (state.ts.extra[wk] || []).concat([id]);
          state.ts.focus = { id: id, d: S.today() >= wk && S.today() <= S.addDays(wk, 6) ? S.today() : wk };
          api.closePops();
          api.renderViewBody();
          return true;
        }
        case 'ts-submit': {
          var res = S.submitTimesheet(tsWeek());
          if (res === 'empty') toast(L('ยังไม่มีเวลาในสัปดาห์นี้'));
          else if (!res) api.denyToast();
          else toast(L('ส่งไทม์ชีตแล้ว รอผู้ตรวจอนุมัติ'), L('ย้อนกลับ'), 'undo');
          return true;
        }
        case 'ts-recall':
          if (S.recallTimesheet(tsWeek())) toast(L('ดึงไทม์ชีตกลับมาแก้แล้ว'), L('ย้อนกลับ'), 'undo');
          return true;
        case 'ts-edel':
          if (S.deleteTimeEntry(id, el.dataset.e)) toast(L('ลบรายการเวลาแล้ว'), L('ย้อนกลับ'), 'undo');
          else api.denyToast();
          return true;
        case 'ts-csv': {
          var who = el.dataset.u || S.db.currentUserId, wu = S.user(who);
          api.downloadText(S.timesheetCsv({ week: el.dataset.w, userId: who }), 'orbit-timesheet-' + api.safeFileName(wu ? wu.name : who) + '-' + el.dataset.w + '.csv', 'text/csv;charset=utf-8');
          return true;
        }
        case 'ts-export-range': api.openModal(exportRangeHtml()); return true;
        case 'ts-export-do': {
          var f1 = (document.getElementById('tsFrom') || {}).value, f2 = (document.getElementById('tsTo') || {}).value;
          if (!f1 || !f2 || f2 < f1) { toast(L('ตั้งวันเริ่มและวันสิ้นสุดให้ถูกต้อง')); return true; }
          api.closeModal();
          api.downloadText(S.timesheetCsv({ from: f1, to: f2 }), 'orbit-time-' + f1 + '_' + f2 + '.csv', 'text/csv;charset=utf-8');
          return true;
        }
        case 'ts-open':
          state.route = { type: 'timesheets', tab: 'review', ts: id };
          api.renderAll();
          return true;
        case 'ts-close':
          state.route = { type: 'timesheets', tab: 'review' };
          api.renderAll();
          return true;
        case 'ts-approve':
          if (S.reviewTimesheet(id, true, '')) toast(L('อนุมัติไทม์ชีตแล้ว'), L('ย้อนกลับ'), 'undo'); else api.denyToast();
          return true;
        case 'ts-reject':
          api.askText(L('เหตุผลที่ตีกลับ'), '', function (v) {
            if (v === null) return;
            if (S.reviewTimesheet(id, false, v)) toast(L('ตีกลับไทม์ชีตแล้ว'), L('ย้อนกลับ'), 'undo'); else api.denyToast();
          }, { placeholder: L('เช่น วันพุธลงเวลาซ้ำ'), ok: L('ตีกลับ') });
          return true;
        case 'ts-reopen':
          api.askConfirm(L('ปลดล็อกไทม์ชีตนี้?'), L('ไทม์ชีตจะกลับเป็นร่าง เจ้าของแก้แล้วส่งใหม่ได้'), function () {
            if (S.reopenTimesheet(id)) toast(L('ปลดล็อกแล้ว'), L('ย้อนกลับ'), 'undo'); else api.denyToast();
          }, { ok: L('ปลดล็อก') });
          return true;
        case 'tscat-add':
          api.askText(L('ชื่อหมวดของเวลา'), '', function (v) {
            if (!v) return;
            if (S.setTsSettings({ cats: S.timeCats().concat([v]) })) toast(L('เพิ่มหมวดแล้ว'), L('ย้อนกลับ'), 'undo');
          });
          return true;
        case 'tscat-del': {
          var cs = S.timeCats();
          cs.splice(+el.dataset.i, 1);
          if (S.setTsSettings({ cats: cs })) toast(L('ลบหมวดแล้ว'), L('ย้อนกลับ'), 'undo');
          return true;
        }
        case 'tsrev-del':
          S.setTsSettings({ reviewers: ((S.db.settings || {}).tsReviewers || []).filter(function (x) { return x !== el.dataset.uid; }) });
          return true;

        /* --- รายงาน --- */
        case 'rp-new':
          state.rpSc = { k: 'org', id: null, ids: [], name: '' };
          api.openModal(rpNewHtml());
          return true;
        case 'rp-create': {
          var nm = ((document.getElementById('rpName') || {}).value || '').trim();
          if (!nm) { toast(L('ใส่ชื่อรายงานก่อน')); return true; }
          var r0 = S.createReport({ name: nm, scope: readScope() });
          if (!r0) { api.denyToast(); return true; }
          api.closeModal();
          state.route = { type: 'report', id: r0.id };
          api.renderAll();
          toast(L('สร้างรายงานแล้ว'), L('ย้อนกลับ'), 'undo');
          return true;
        }
        case 'rp-go': state.route = { type: 'report', id: id }; api.clearSel(); api.renderAll(); return true;
        case 'rp-menu': {
          var rm = S.report(id), mine = rm && rm.owner === S.db.currentUserId;
          api.openPop(el, '<div class="menu">' +
            (S.canEditReport(id) ? '<button data-act="rp-rename" data-id="' + esc(id) + '">' + I('pencil', 14) + ' ' + L('เปลี่ยนชื่อ') + '</button>' +
              '<button data-act="rp-scope" data-id="' + esc(id) + '">' + I('grid', 14) + ' ' + L('เปลี่ยนขอบเขต') + '</button>' : '') +
            (mine ? '<button data-act="rp-share" data-id="' + esc(id) + '">' + I('users', 14) + ' ' + L('แชร์') + '</button>' : '') +
            (mine || S.isAdmin() ? '<button class="danger" data-act="rp-delete" data-id="' + esc(id) + '">' + I('trash', 14) + ' ' + L('ลบรายงาน') + '</button>' : '') +
            '</div>');
          return true;
        }
        case 'rp-rename': {
          api.closePops();
          var rr = S.report(id);
          api.askText(L('ชื่อรายงาน'), rr.name, function (v) { if (v && S.updateReport(id, { name: v })) toast(L('เปลี่ยนชื่อแล้ว'), L('ย้อนกลับ'), 'undo'); });
          return true;
        }
        case 'rp-scope': {
          api.closePops();
          var rs = S.report(id);
          state.rpSc = S.clone(rs.scope);
          api.openModal(rpScopeModal(rs));
          return true;
        }
        case 'rp-scope-save':
          if (S.updateReport(id, { scope: readScope() })) { api.closeModal(); toast(L('เปลี่ยนขอบเขตแล้ว'), L('ย้อนกลับ'), 'undo'); } else api.denyToast();
          return true;
        case 'rp-share': api.closePops(); api.openModal(rpShareHtml(S.report(id))); return true;
        case 'rp-share-save': {
          var pick = function (n) { return Array.prototype.map.call(document.querySelectorAll('input[name="' + n + '"]:checked'), function (x) { return x.value; }); };
          if (S.updateReport(id, { share: { org: !!(document.getElementById('rpOrg') || {}).checked, users: pick('rpShUser'), teams: pick('rpShTeam') } })) {
            api.closeModal();
            toast(L('บันทึกการแชร์แล้ว'), L('ย้อนกลับ'), 'undo');
          } else api.denyToast();
          return true;
        }
        case 'rp-delete': {
          api.closePops();
          var rd = S.report(id);
          api.askConfirm(L('ลบรายงาน “{t}”?', { t: rd.name }), L('คนที่ได้รับแชร์จะไม่เห็นรายงานนี้อีก (งานจริงไม่ถูกแตะ)'), function () {
            if (S.deleteReport(id)) { state.route = { type: 'reports' }; api.renderAll(); toast(L('ลบรายงานแล้ว'), L('ย้อนกลับ'), 'undo'); }
          }, { ok: L('ลบรายงาน') });
          return true;
        }
        case 'rp-wadd':
          state.rpe = { rid: id, isNew: true, w: S.normalizeRWidget({ kind: 'bar', src: 'tasks', x: 'assignee', y: 'count' }) };
          api.openModal(rpEditHtml(), true);
          return true;
        case 'rp-wmenu': {
          var rw = S.report(id), i = +el.dataset.i, w0 = rw.widgets[i];
          api.openPop(el, '<div class="menu">' +
            '<button data-act="rp-wedit" data-id="' + esc(id) + '" data-w="' + esc(w0.id) + '">' + I('pencil', 14) + ' ' + L('แก้ไข') + '</button>' +
            '<button data-act="rp-wfull" data-id="' + esc(id) + '" data-w="' + esc(w0.id) + '">' + I(w0.full ? 'shrink' : 'expand', 14) + ' ' + (w0.full ? L('ครึ่งความกว้าง') : L('เต็มความกว้าง')) + '</button>' +
            (i > 0 ? '<button data-act="rp-wup" data-id="' + esc(id) + '" data-w="' + esc(w0.id) + '">' + I('arrowUp', 14) + ' ' + L('ย้ายขึ้น') + '</button>' : '') +
            (i < rw.widgets.length - 1 ? '<button data-act="rp-wdown" data-id="' + esc(id) + '" data-w="' + esc(w0.id) + '">' + I('arrowDown', 14) + ' ' + L('ย้ายลง') + '</button>' : '') +
            '<button data-act="rp-wdup" data-id="' + esc(id) + '" data-w="' + esc(w0.id) + '">' + I('copy', 14) + ' ' + L('ทำสำเนา') + '</button>' +
            '<button class="danger" data-act="rp-wdel" data-id="' + esc(id) + '" data-w="' + esc(w0.id) + '">' + I('trash', 14) + ' ' + L('ลบวิดเจ็ต') + '</button></div>');
          return true;
        }
        case 'rp-wedit': {
          api.closePops();
          var we = S.report(id).widgets.filter(function (x) { return x.id === el.dataset.w; })[0];
          state.rpe = { rid: id, isNew: false, w: S.clone(we) };
          api.openModal(rpEditHtml(), true);
          return true;
        }
        case 'rp-wsave': {
          var ed = state.rpe;
          if (!ed) return true;
          var tEl = document.getElementById('rpeTitle');
          if (tEl) ed.w.title = tEl.value;
          if (S.saveReportWidget(ed.rid, rpeFix(ed.w))) { state.rpe = null; api.closeModal(); toast(L('บันทึกวิดเจ็ตแล้ว'), L('ย้อนกลับ'), 'undo'); }
          else api.denyToast();
          return true;
        }
        case 'rp-wfull': {
          api.closePops();
          var wf = S.clone(S.report(id).widgets.filter(function (x) { return x.id === el.dataset.w; })[0]);
          wf.full = !wf.full;
          S.saveReportWidget(id, wf);
          return true;
        }
        case 'rp-wdup': {
          api.closePops();
          var wd = S.clone(S.report(id).widgets.filter(function (x) { return x.id === el.dataset.w; })[0]);
          delete wd.id;
          if (S.saveReportWidget(id, wd)) toast(L('ทำสำเนาวิดเจ็ตแล้ว'), L('ย้อนกลับ'), 'undo'); else toast(L('ครบจำนวนวิดเจ็ตแล้ว'));
          return true;
        }
        case 'rp-wup': case 'rp-wdown':
          api.closePops();
          S.moveReportWidget(id, el.dataset.w, act === 'rp-wup' ? -1 : 1);
          return true;
        case 'rp-wdel':
          api.closePops();
          if (S.deleteReportWidget(id, el.dataset.w)) toast(L('ลบวิดเจ็ตแล้ว'), L('ย้อนกลับ'), 'undo');
          return true;
        case 'rp-png': {
          var rp = S.report(id), wp = rp && rp.widgets.filter(function (x) { return x.id === el.dataset.w; })[0];
          var sec = document.querySelector('.dw[data-w="' + el.dataset.w + '"] svg');
          if (sec && wp) global.Charts.toPng(sec, api.safeFileName(rp.name + '-' + (wp.title || wp.src)), { title: wp.title || rp.name,
            onError: function () { toast(L('ส่งออกรูปไม่สำเร็จ')); } });
          return true;
        }
        case 'rp-click': {
          var rc2 = S.report(rid());
          if (rc2) api.openModal(rpClickHtml(rc2, el.dataset.w, el.dataset.cat, el.dataset.ser));
          return true;
        }
        case 'rpe-noop': return true;
      }
      /* ไปหน้ารายการของพอร์ตโฟลิโอ/เป้าหมายจากหน้าต่างคลิกกราฟ — ปิดหน้าต่างก่อน */
      if (act === 'go' && (el.dataset.route === 'goal' || el.dataset.route === 'project' || el.dataset.route === 'portfolio') && el.closest('.rp-click')) {
        api.closeModal();
      }
      return false;
    });

    /* ====================== change ====================== */
    api.change(function (act, el) {
      switch (act) {
        case 'wl-src': {
          var v = el.value, cfg = S.wlCfg(wlScope());
          wlSet(v === 'count' ? { measure: 'count' } : { measure: 'effort', src: v, unit: v === 'estimate' ? 'h' : (cfg.src === 'estimate' ? 'h' : cfg.unit) });
          return true;
        }
        case 'wl-unit': wlSet({ unit: el.value }); return true;
        case 'wl-team': wlSet({ team: el.value }); return true;
        case 'cap-set': {
          var p = {}; p[el.dataset.k] = +el.value;
          if (S.setCapacity(el.dataset.uid, p)) toast(L('ตั้งความจุแล้ว'), L('ย้อนกลับ'), 'undo');
          return true;
        }
        case 'ts-cell': tsCommitCell(el); return true;
        case 'ts-bill':
          if (!S.setTimeRowMeta(el.dataset.id, tsWeek(), { billable: el.checked ? true : null })) api.renderViewBody();
          return true;
        case 'ts-cat':
          if (el.value === '*' || !S.setTimeRowMeta(el.dataset.id, tsWeek(), { category: el.value || null })) api.renderViewBody();
          return true;
        case 'tsrev-add':
          if (el.value) S.setTsSettings({ reviewers: ((S.db.settings || {}).tsReviewers || []).concat([el.value]) });
          return true;
        case 'rpsc-k': {
          var nmEl = document.getElementById('rpName');
          if (nmEl) state.rpSc.name = nmEl.value;
          state.rpSc.k = el.value;
          var rr = rid() && S.report(rid());
          api.openModal(nmEl ? rpNewHtml() : rpScopeModal(rr));
          return true;
        }
        case 'rpe-f': {
          if (!state.rpe) return true;
          var tEl = document.getElementById('rpeTitle');
          if (tEl) state.rpe.w.title = tEl.value;
          var k = el.dataset.k;
          state.rpe.w[k] = el.type === 'checkbox' ? el.checked : (k === 'n' ? +el.value : el.value);
          api.openModal(rpEditHtml(), true);
          return true;
        }
      }
      return false;
    });
  });

})(window);

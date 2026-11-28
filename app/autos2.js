/* ======================================================================
 * QA-B — อัตโนมัติ ส่วนขยาย (ตัวสร้างกฎ)
 *
 * - ช่องตั้งค่าของทริกเกอร์/การกระทำที่เพิ่ม (แท็ก ย้ายออกเซกชัน งานย่อยครบ จากค่า→เป็นค่า ข้อความในความเห็น
 *   แจ้งเตือนคนที่ระบุ เช็กลิสต์งานย่อย งานติดตามผลจากเทมเพลต ตั้งผู้อนุมัติ)
 * - ประโยคสรุปกฎ "เมื่อ … ถ้า … ให้ …"  · "ทดลองกับงานนี้" (รันจริงแล้วคืนข้อมูล)
 * - แกลเลอรีเทมเพลตกฎภาษาไทยสำหรับงาน BD / NPD  · รายละเอียดในประวัติการรัน
 *
 * เอนจินอยู่ใน store.js (AUTO_TRIGGERS / AUTO_ACTIONS) ไฟล์นี้เป็นฝั่งหน้าจอ main.js เรียก Auto2.init(ctx) หลังนิยามตัวช่วย
 * ====================================================================== */
(function (global) {
  'use strict';

  var S = global.Store, c = null;
  function L(k, p) { return c.L(k, p); }
  function esc(x) { return c.esc(x); }

  /* ---------- ข้อความสั้นของทริกเกอร์/การกระทำที่เพิ่ม ---------- */
  function trigText(pid, tr) {
    switch (tr.type) {
      case 'tagadd': return tr.tag ? L('เพิ่มแท็ก “{t}”', { t: tr.tag }) : L('มีแท็กถูกเพิ่ม');
      case 'tagdel': return tr.tag ? L('เอาแท็ก “{t}” ออก', { t: tr.tag }) : L('มีแท็กถูกเอาออก');
      case 'subsdone': return L('งานย่อยเสร็จครบทุกอัน');
      case 'movedout': return tr.sec ? L('ย้ายออกจาก “{s}”', { s: c.auSecName(pid, tr.sec) }) : L('ย้ายออกจากเซกชัน');
      case 'comment': return tr.text ? L('มีความเห็นที่มีคำว่า “{t}”', { t: tr.text }) : L('มีความเห็นใหม่');
    }
    return null;
  }

  function peopleText(a) {
    var names = (a.users || []).map(function (u) { return c.auUserName(u); });
    var VL = { creator: 'คนสร้างงาน', triggerer: 'คนที่ทำให้ทำงาน', assignee: 'ผู้รับผิดชอบ', owner: 'เจ้าของโปรเจกต์' };
    (a.vars || []).forEach(function (v) { names.push(L(VL[v] || v)); });
    return names.join(', ') || L('(ยังไม่เลือกคน)');
  }

  function actText(pid, a) {
    switch (a.type) {
      case 'notify': return L('แจ้งเตือน {w}', { w: peopleText(a) });
      case 'subtasks': {
        var n = String(a.lines || '').split(/\r?\n/).filter(function (x) { return x.trim(); }).length;
        return L('สร้างงานย่อย {n} อัน', { n: n });
      }
      case 'followup': {
        var x = a.tpl ? S.findTaskTemplate(a.tpl) : null;
        return L('สร้างงานติดตามผลจากเทมเพลต “{t}”', { t: x ? x.tpl.name : '?' });
      }
      case 'approvers': return L('ขออนุมัติจาก {w}', { w: peopleText(a) });
    }
    return null;
  }

  /* ---------- ช่องตั้งค่า ---------- */
  function chips(pid, a, key, withVars) {
    var VARS = [['creator', 'คนสร้างงาน'], ['triggerer', 'คนที่ทำให้อัตโนมัติทำงาน'], ['assignee', 'ผู้รับผิดชอบ'], ['owner', 'เจ้าของโปรเจกต์']];
    var us = a.users || [], vs = a.vars || [];
    var h = '<div class="flt-chips">';
    VARS.forEach(function (x) {
      h += '<button class="flt-chip' + (vs.indexOf(x[0]) >= 0 ? ' on' : '') + '" data-act="ae-ap-chip" data-k="vars" data-v="' + x[0] + '"' + key + '>' + esc(L(x[1])) + '</button>';
    });
    S.db.users.filter(function (u) { return u.active !== false; }).forEach(function (u) {
      h += '<button class="flt-chip' + (us.indexOf(u.id) >= 0 ? ' on' : '') + '" data-act="ae-ap-chip" data-k="users" data-v="' + esc(u.id) + '"' + key + '>' + esc(u.name) + '</button>';
    });
    return h + '</div>';
  }

  function trigParams(pid, tr) {
    var d = function (k) { return ' data-k="' + k + '"'; };
    var p = S.project(pid);
    switch (tr.type) {
      case 'tagadd': case 'tagdel':
        return '<input class="opt-select" list="auTags2" data-act="ae-tp"' + d('tag') + ' maxlength="40" value="' + esc(tr.tag || '') + '" placeholder="' + esc(L('แท็กใดก็ได้ (หรือพิมพ์ชื่อแท็ก)')) + '">' +
          '<datalist id="auTags2">' + S.allTags().map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>';
      case 'movedout':
        return c.auSel('ae-tp', c.auSecOpts(pid, L('เซกชันใดก็ได้')), tr.sec, d('sec'));
      case 'comment':
        return '<input class="opt-select" data-act="ae-tp"' + d('text') + ' maxlength="80" value="' + esc(tr.text || '') + '" placeholder="' + esc(L('เฉพาะความเห็นที่มีคำว่า… (ไม่บังคับ)')) + '">';
      case 'assignee':
        return '<div class="au2-from"><span>' + L('จาก') + '</span>' +
          c.auSel('ae-tp', [['', L('ใครก็ได้')], ['@none', L('ไม่มีผู้รับผิดชอบ')]].concat(c.auUsers()), tr.from, d('from')) + '</div>';
      case 'field': {
        var f = ((p && p.fields) || []).filter(function (x) { return x.id === tr.field; })[0];
        if (!f) return '';
        if (f.type === 'select' || f.type === 'multi') {
          return '<div class="au2-from"><span>' + L('จากค่า') + '</span>' +
            c.auSel('ae-tp', [['', L('ค่าใดก็ได้')]].concat((f.options || []).map(function (o) { return [o.name, o.name]; })), tr.from, d('from')) + '</div>';
        }
        return '';
      }
    }
    return '';
  }

  function actParams(pid, a, d) {
    var k = function (key) { return d + ' data-k="' + key + '"'; };
    var dd = d;
    switch (a.type) {
      case 'notify':
        return chips(pid, a, dd) +
          '<textarea class="opt-select au-text au-gap" rows="2" data-act="ae-ap"' + k('text') + ' placeholder="' + esc(L('ข้อความ เช่น {task} เลยกำหนดแล้ว ช่วยตามหน่อย (เว้นว่างได้)')) + '">' + esc(a.text || '') + '</textarea>' +
          c.auVarChips(pid, d, 'text') +
          '<div class="opt-note au-hint">' + L('คนที่ทำให้กฎทำงานจะไม่ได้รับแจ้งเอง และคนที่ไม่ได้เป็นสมาชิกของโปรเจกต์ปิดจะถูกข้าม') + '</div>';
      case 'subtasks': {
        var du = a.due || {};
        var h = '<textarea class="opt-select au-text" rows="5" data-act="ae-ap"' + k('lines') + ' placeholder="' + esc(L('หนึ่งบรรทัด = หนึ่งงานย่อย เช่น\nตรวจสูตร\nตรวจฉลาก\nส่งขอ อย.')) + '">' + esc(a.lines || '') + '</textarea>';
        h += '<label class="opt-lbl">' + L('ผู้รับผิดชอบงานย่อย') + '</label>' + c.auUserSpec(pid, a.assign || { mode: 'none' }, d, 'assign.', true);
        h += '<label class="chk au-gap"><input type="checkbox" data-act="ae-ap"' + k('due.on') + ' data-t="check"' + (du.on ? ' checked' : '') + '> ' + L('ตั้งกำหนดส่ง') + '</label>';
        if (du.on) h += c.auDateSpec(pid, du, d, 'due.');
        return h;
      }
      case 'followup': {
        var tpls = S.taskTemplatesFor(pid);
        if (!tpls.length) return '<div class="flt-none">' + L('ยังไม่มีเทมเพลตงาน — สร้างจากเมนู ⋯ ของงานก่อน') + '</div>';
        return c.auSel('ae-ap', [['', L('เลือกเทมเพลต')]].concat(tpls.map(function (x) { return [x.tpl.id, x.tpl.name]; })), a.tpl, k('tpl')) +
          c.auSel('ae-ap', c.auSecOpts(pid, L('เซกชันเดียวกับงานที่ทำให้ทำงาน')), a.sec, k('sec'));
      }
      case 'approvers':
        return chips(pid, a, dd) +
          c.auSel('ae-ap', [['all', L('ต้องอนุมัติครบทุกคน')], ['any', L('คนใดคนหนึ่งอนุมัติก็พอ')]], a.mode || 'all', k('mode')) +
          '<div class="opt-note au-hint">' + L('ถ้างานไม่ใช่ชนิดขออนุมัติ จะถูกเปลี่ยนเป็นขออนุมัติ') + '</div>';
    }
    return '';
  }

  var DEFS = {
    notify:    function () { return { users: [], vars: ['owner'], text: '' }; },
    subtasks:  function () { return { lines: '', assign: { mode: 'none' }, due: { on: false, n: 2, unit: 'workdays', dir: 'after', from: 'trigger' } }; },
    followup:  function () { return { tpl: '', sec: '' }; },
    approvers: function () { return { users: [], vars: ['owner'], mode: 'all' }; }
  };
  function newAct(pid, type) { return DEFS[type] ? DEFS[type](pid) : null; }

  /* ---------- ประโยคสรุป ---------- */
  function condText(pid, cd) {
    var def = S.filterField('a:' + pid, cd.f);
    if (!def) return L('(ฟิลด์ถูกลบ)');
    var lab = def.custom ? def.label : L(def.label);
    var op = ((S.FILTER_OPS[def.kind] || []).filter(function (o) { return o[0] === cd.op; })[0] || [])[1] || '';
    var v = cd.v, vs = '';
    if (Array.isArray(v)) {
      vs = v.map(function (x) {
        if (def.kind === 'person') return x === 'me' ? L('ฉัน') : c.auUserName(x);
        if (cd.f === 'section') return c.auSecName(pid, x);
        return x;
      }).join(', ');
    } else if (v != null && v !== '') vs = String(v);
    return lab + ' ' + L(op) + (vs ? ' ' + vs : '');
  }

  function previewHtml(pid, a) {
    var h = '<div class="au2-sent"><div class="au2-sh">' + L('สรุปเป็นประโยค') + '</div>';
    h += '<div class="au2-line"><b>' + L('เมื่อ') + '</b> ' + esc(c.trigText(pid, a.trigger)) + '</div>';
    var multi = a.paths.length > 1 || a.els;
    a.paths.forEach(function (pt, i) {
      var cs = pt.conds.map(function (x) { return condText(pid, x); });
      var as = pt.acts.map(function (x) { return c.actText(pid, x); });
      h += '<div class="au2-line">' + (multi ? '<em>' + L('เส้นทาง {n}', { n: i + 1 }) + '</em> ' : '') +
        '<b>' + L('ถ้า') + '</b> ' + esc(cs.length ? cs.join(' ' + L('และ') + ' ') : L('ทุกครั้ง')) +
        ' <b>' + L('ให้') + '</b> ' + esc(as.length ? as.join(' → ') : L('(ยังไม่มีการกระทำ)')) + '</div>';
    });
    if (a.els) {
      h += '<div class="au2-line"><em>' + L('อื่น ๆ') + '</em> <b>' + L('ให้') + '</b> ' +
        esc(a.els.length ? a.els.map(function (x) { return c.actText(pid, x); }).join(' → ') : L('(ยังไม่มีการกระทำ)')) + '</div>';
    }
    return h + '</div>';
  }

  /* ---------- ทดลองกับงานนี้ ---------- */
  function dryBlock(pid, e) {
    var tasks = S.tasksInProject(pid).filter(function (x) { return !x.task.parentId; }).slice(0, 80);
    var cur = e.dry ? e.dry.tid : '';
    var h = '<div class="au2-dry"><div class="au2-sh">' + L('ทดลองกับงานนี้ (ไม่บันทึกอะไรจริง)') + '</div>' +
      c.auSel('ae-dry', [['', L('เลือกงานที่จะลอง…')]].concat(tasks.map(function (x) { return [x.task.id, x.task.name]; })), cur, '');
    if (e.dry && e.dry.res) h += dryResult(pid, e.dry);
    return h + '</div>';
  }

  var KEYNAME = { assigneeId: 'ผู้รับผิดชอบ', dueOn: 'กำหนดส่ง', startOn: 'วันเริ่ม', tags: 'แท็ก', priority: 'ความสำคัญ',
    completed: 'สถานะเสร็จ', followers: 'ผู้ติดตาม', type: 'ชนิดงาน', approval: 'สถานะอนุมัติ', approvers: 'ผู้อนุมัติ',
    approvalMode: 'โหมดอนุมัติ', approvalVotes: 'ผลโหวต', completedAt: 'วันที่เสร็จ', completedBy: 'ผู้ปิดงาน',
    assignedAt: 'วันที่มอบหมาย', assignedBy: 'ผู้มอบหมาย', subsDoneNotified: 'แจ้งงานย่อยครบ', modifiedAt: 'แก้ไขล่าสุด',
    updatedAt: 'แก้ไขล่าสุด', cstatus: 'สถานะ', ctype: 'ชนิดงานกำหนดเอง' };

  function shown(k, v) {
    if (v == null || v === '') return L('(ว่าง)');
    if (k === 'assigneeId' || k === 'completedBy' || k === 'assignedBy') return c.auUserName(v);
    if (k === 'priority') {
      var pr = (S.PRIORITIES || []).filter(function (x) { return x.id === v; })[0];
      return pr ? L(pr.label) : String(v);
    }
    if (Array.isArray(v)) return v.map(function (x) { return S.user(x) ? S.user(x).name : x; }).join(', ') || L('(ว่าง)');
    if (typeof v === 'boolean') return v ? L('ใช่') : L('ไม่');
    if (typeof v === 'object') return '…';
    return String(v);
  }

  function dryResult(pid, dry) {
    var r = dry.res, p = S.project(pid), h = '<div class="au2-res' + (dry.stale ? ' stale' : '') + '">';
    if (dry.stale) h += '<div class="opt-note">' + L('ผลนี้เก่าแล้ว เพราะแก้กฎหลังทดลอง เลือกงานอีกครั้งเพื่อลองใหม่') + '</div>';
    if (!r.matched) return h + '<p class="au-empty">' + L('งานนี้ไม่ตรงเงื่อนไขของเส้นทางไหนเลย กฎจะไม่ทำอะไร') + '</p></div>';
    if (r.path != null) h += '<div class="sub">' + (r.path === -1 ? L('เส้นทาง “อื่น ๆ”') : L('เส้นทาง {n}', { n: r.path + 1 })) + '</div>';
    h += '<div class="au2-chips">' + r.acts.map(function (x) {
      var bad = /!$/.test(x), ty = x.replace(/!$/, ''), dfn = c.actDefOf(ty);
      return '<span class="au-pill ' + (bad ? 'err' : 'ok') + '">' + esc(L(dfn ? dfn.label : ty)) + (bad ? ' ✕' : '') + '</span>';
    }).join('') + '</div>';
    if (r.err) h += '<div class="au-err">' + esc(r.err) + '</div>';
    var rows = [];
    r.tasks.forEach(function (x) {
      x.keys.forEach(function (k) {
        if (!KEYNAME[k] || /^(modifiedAt|updatedAt|subsDoneNotified|approvalVotes|completedAt|completedBy|assignedAt|assignedBy)$/.test(k)) return;
        rows.push('<li><b>' + esc(x.name) + '</b> · ' + esc(L(KEYNAME[k])) + ': ' + esc(shown(k, x.from[k])) + ' → ' + esc(shown(k, x.to[k])) + '</li>');
      });
    });
    (r.moves || []).forEach(function (m) {
      var t = S.task(m.t), pj = S.project(m.p);
      rows.push('<li><b>' + esc(t ? t.name : '') + '</b> · ' + (m.added ? L('เพิ่มเข้าโปรเจกต์ “{p}”', { p: pj ? pj.name : '' })
        : L('ย้ายไปเซกชัน “{s}”', { s: c.auSecName(m.p, m.to) })) + '</li>');
    });
    (r.fvs || []).forEach(function (x) {
      var f = ((p && p.fields) || []).filter(function (y) { return y.id === x.f; })[0], t = S.task(x.t);
      rows.push('<li><b>' + esc(t ? t.name : '') + '</b> · ' + esc(f ? f.name : '') + ': ' + esc(shown('', x.from)) + ' → ' + esc(shown('', x.to)) + '</li>');
    });
    r.created.forEach(function (x) {
      rows.push('<li>' + L('สร้างงานใหม่') + ': <b>' + esc(x.name) + '</b>' + (x.sub ? ' (' + L('งานย่อย') + ')' : '') + (x.type === 'approval' ? ' · ' + L('ขออนุมัติ') : '') + '</li>');
    });
    if (r.counts.stories) rows.push('<li>' + L('เพิ่มความเห็น/บันทึกความเคลื่อนไหว {n} รายการ', { n: r.counts.stories }) + '</li>');
    var nn = (r.counts.notifications || r.counts.notifs || 0);
    if (nn) rows.push('<li>' + L('ส่งแจ้งเตือน {n} รายการ', { n: nn }) + '</li>');
    h += rows.length ? '<ul class="au2-list">' + rows.join('') + '</ul>' : '<p class="au-empty">' + L('ไม่มีอะไรเปลี่ยน (ค่าเป็นอย่างที่ตั้งไว้อยู่แล้ว)') + '</p>';
    return h + '</div>';
  }

  /** รัน และคืนผลใส่ e.dry */
  function runDry(pid, e, tid) {
    if (!tid) { e.dry = null; return; }
    var res = null;
    try { res = S.autoDryRun(pid, e.a, tid); } catch (x) { console.error(x); }
    e.dry = { tid: tid, res: res || { matched: false, acts: [], tasks: [], created: [], counts: {}, moves: [], fvs: [] } };
  }

  /* ---------- เทมเพลตกฎ ---------- */
  function secBy(p, re, fallback) {
    var s = (p.sections || []).filter(function (x) { return re.test(x.name); })[0];
    if (s) return s.id;
    var arr = p.sections || [];
    return arr.length ? (fallback === 'last' ? arr[arr.length - 1].id : arr[0].id) : '';
  }
  function nextSec(p, from) {
    var arr = p.sections || [], i = -1;
    arr.forEach(function (s, j) { if (s.id === from) i = j; });
    return arr[Math.min(arr.length - 1, i + 1)] ? arr[Math.min(arr.length - 1, i + 1)].id : '';
  }
  function actDate(n, unit, from) { return { n: n, unit: unit || 'workdays', dir: 'after', from: from || 'trigger' }; }
  var NOW = function () { return null; };

  var TEMPLATES = [
    { id: 'appr', t: 'ย้ายไป “รออนุมัติ” → สร้างงานขออนุมัติให้หัวหน้า',
      d: 'เมื่องานเข้าเซกชันรออนุมัติ สร้างงานย่อยขออนุมัติให้เจ้าของโปรเจกต์ กำหนด 2 วันทำการ และแจ้งเตือนเขา',
      build: function (pid, p) {
        return { name: 'ขออนุมัติเมื่อย้ายไปรออนุมัติ', trigger: { type: 'moved', sec: secBy(p, /อนุมัติ|ตรวจ|review|approv/i) }, paths: [{ conds: [], acts: [
          { type: 'create', kind: 'approval', name: 'ขออนุมัติ: {task}', notes: 'งานต้นทาง {link}', sec: '', assign: { mode: 'var', 'var': 'owner' }, due: Object.assign({ on: true }, actDate(2)) },
          { type: 'notify', users: [], vars: ['owner'], text: '{task} รอการอนุมัติจากคุณ' }] }], els: null };
      } },
    { id: 'fda', t: 'ฟิลด์สถานะ อย. = อนุมัติแล้ว → ย้ายไปเซกชันถัดไปและแจ้งทีม',
      d: 'เมื่อฟิลด์ตัวเลือกที่ชื่อมี “อย.” (หรือฟิลด์แรก) เปลี่ยนเป็นค่าที่มีคำว่า “อนุมัติ” ย้ายงานไปเซกชันสุดท้าย แจ้งผู้รับผิดชอบกับเจ้าของโปรเจกต์',
      build: function (pid, p) {
        var fs = (p.fields || []).filter(function (f) { return f.type === 'select'; });
        var f = fs.filter(function (x) { return /อย|fda|สถานะ/i.test(x.name); })[0] || fs[0];
        var op = f ? ((f.options || []).filter(function (o) { return /อนุมัติ/.test(o.name); })[0] || (f.options || [])[0]) : null;
        return { name: 'อย. อนุมัติแล้ว → ไปต่อ', trigger: { type: 'field', field: f ? f.id : '', val: op ? op.name : '' }, paths: [{ conds: [], acts: [
          { type: 'section', sec: secBy(p, /ถัดไป|ผลิต|เปิดตัว|เสร็จ|done/i, 'last') },
          { type: 'comment', text: 'อัปเดต: {task} ผ่านสถานะแล้ว โดย {triggerer}' },
          { type: 'notify', users: [], vars: ['assignee', 'owner'], text: '{task} ผ่านการอนุมัติแล้ว' }] }], els: null };
      } },
    { id: 'od2', t: 'งานเลยกำหนด 2 วัน → แจ้งเจ้าของโปรเจกต์',
      d: 'เมื่อเลยกำหนดไป 2 วัน แจ้งเจ้าของโปรเจกต์ ติดแท็ก “เลยกำหนด” และตั้งความสำคัญสูง (ทำงานตอนมีคนเปิด Orbit)',
      build: function () {
        return { name: 'เลยกำหนด 2 วัน → แจ้งเจ้าของโปรเจกต์', trigger: { type: 'overdue', n: 2, unit: 'days' }, paths: [{ conds: [], acts: [
          { type: 'notify', users: [], vars: ['owner'], text: '{task} เลยกำหนด ({due}) แล้ว ผู้รับผิดชอบ {assignee}' },
          { type: 'tag', tag: 'เลยกำหนด' }, { type: 'priority', v: 'high' }] }], els: null };
      } },
    { id: 'apr2', t: 'ใกล้ครบกำหนด 2 วัน → เตือนผู้รับผิดชอบ',
      d: 'อีก 2 วันครบกำหนด แจ้งเตือนผู้รับผิดชอบ (เฉพาะงานที่ยังไม่เสร็จ)',
      build: function () {
        return { name: 'เตือนก่อนครบกำหนด 2 วัน', trigger: { type: 'approaching', days: 2 }, paths: [{ conds: [], acts: [
          { type: 'notify', users: [], vars: ['assignee'], text: '{task} จะครบกำหนด {due} ช่วยเช็กความคืบหน้าด้วย' }] }], els: null };
      } },
    { id: 'subs', t: 'งานย่อยเสร็จครบ → ย้ายไปรอตรวจและแจ้งผู้รับผิดชอบ',
      d: 'เมื่อทุกงานย่อยเสร็จ ย้ายงานหลักไปเซกชันตรวจ และแจ้งผู้รับผิดชอบงานหลัก',
      build: function (pid, p) {
        return { name: 'งานย่อยครบ → รอตรวจ', trigger: { type: 'subsdone' }, paths: [{ conds: [], acts: [
          { type: 'section', sec: secBy(p, /ตรวจ|review|อนุมัติ/i, 'last') },
          { type: 'notify', users: [], vars: ['assignee', 'owner'], text: 'งานย่อยของ {task} เสร็จครบแล้ว' }] }], els: null };
      } },
    { id: 'rr', t: 'งานใหม่ → แจกให้ทีมหมุนเวียน + กำหนดส่ง 5 วันทำการ',
      d: 'งานที่เพิ่มเข้าโปรเจกต์ถูกแจกวนตามลำดับให้คนที่เลือก (ข้ามคนที่ตั้งสถานะไม่อยู่) และตั้งกำหนดส่งให้',
      build: function (pid, p) {
        var ids = S.db.users.filter(function (u) { return u.active !== false; }).slice(0, 4).map(function (u) { return u.id; });
        return { name: 'แจกงานใหม่หมุนเวียน', trigger: { type: 'added' }, paths: [{ conds: [{ f: 'assignee', op: 'empty', v: [] }], acts: [
          { type: 'assign', mode: 'rr', list: ids }, { type: 'due', mode: 'rel', n: 5, unit: 'workdays', dir: 'after', from: 'trigger' }] }], els: null };
      } },
    { id: 'npd', t: 'กดรัน → ใส่เช็กลิสต์ NPD มาตรฐาน',
      d: 'ปุ่มกดเองในเมนู ⋯ ของงาน สร้างงานย่อยชุดมาตรฐานของการพัฒนาสินค้าใหม่ แก้รายการได้ตามต้องการ',
      build: function () {
        return { name: 'เช็กลิสต์ NPD', trigger: { type: 'manual', label: 'ใส่เช็กลิสต์ NPD' }, paths: [{ conds: [], acts: [
          { type: 'subtasks', lines: 'บรีฟสินค้า/คอนเซ็ปต์\nตรวจสูตรกับ R&D\nขอใบเสนอราคาบรรจุภัณฑ์\nส่งขอ อย.\nทดสอบตลาด/ตัวอย่าง\nอนุมัติขึ้นไลน์ผลิต',
            assign: { mode: 'none' }, due: { on: false, n: 2, unit: 'workdays', dir: 'after', from: 'trigger' } }] }], els: null };
      } },
    { id: 'cmt', t: 'ความเห็นมีคำว่า “ขออนุมัติ” → สร้างงานขออนุมัติ',
      d: 'เมื่อมีคนพิมพ์คำว่า “ขออนุมัติ” ในความเห็น สร้างงานย่อยขออนุมัติให้เจ้าของโปรเจกต์',
      build: function () {
        return { name: 'ความเห็น “ขออนุมัติ” → สร้างงานขออนุมัติ', trigger: { type: 'comment', text: 'ขออนุมัติ' }, paths: [{ conds: [], acts: [
          { type: 'create', kind: 'approval', name: 'ขออนุมัติ: {task}', notes: '{link}', sec: '', assign: { mode: 'var', 'var': 'owner' }, due: Object.assign({ on: true }, actDate(2)) }] }], els: null };
      } },
    { id: 'wk', t: 'ทุกวันจันทร์ → สร้างงานประชุมทบทวนความคืบหน้า',
      d: 'ทุกสัปดาห์สร้างงานทบทวนความคืบหน้าให้เจ้าของโปรเจกต์ (ตามกำหนดเวลา ทำงานตอนมีคนเปิด Orbit)',
      build: function (pid, p) {
        return { name: 'ทบทวนความคืบหน้ารายสัปดาห์', trigger: { type: 'scheduled', freq: 'weekly', day: 1, scope: 'once' }, paths: [{ conds: [], acts: [
          { type: 'create', kind: 'task', name: 'ทบทวนความคืบหน้า {project}', notes: '', sec: p.sections[0] ? p.sections[0].id : '', assign: { mode: 'var', 'var': 'owner' }, due: Object.assign({ on: true }, actDate(2)) }] }], els: null };
      } }
  ];

  function galleryHtml(pid, canEdit) {
    var h = '<p class="opt-note">' + L('เลือกเทมเพลตแล้วระบบจะเติมเซกชัน/ฟิลด์ที่ใกล้เคียงของโปรเจกต์นี้ให้ ตรวจและแก้ได้ก่อนกดบันทึก') + '</p><div class="au2-gal">';
    TEMPLATES.forEach(function (x, i) {
      h += '<div class="au2-card"><b>' + esc(L(x.t)) + '</b><div class="sub">' + esc(L(x.d)) + '</div>' +
        (canEdit ? '<button class="btn btn-sm btn-primary" data-act="auto-tpl" data-v="' + i + '">' + L('ใช้เทมเพลตนี้') + '</button>' : '') + '</div>';
    });
    return h + '</div>';
  }

  function build(pid, i) {
    var x = TEMPLATES[+i], p = S.project(pid);
    if (!x || !p) return null;
    var a = x.build(pid, p);
    a.name = L(a.name);
    a.on = true; a.chain = false;
    return a;
  }

  /* ---------- ประวัติการรัน: ทริกเกอร์ + การกระทำที่ทำ ---------- */
  function runExtra(pid, r) {
    var h = '';
    if (r.tr) {
      var td = c.trigDefOf(r.tr);
      h += '<span class="au2-tr">' + esc(L(td ? td.label : r.tr)) + '</span>';
    }
    (r.ac || []).forEach(function (x) {
      var bad = /!$/.test(x), ty = x.replace(/!$/, ''), dfn = c.actDefOf(ty);
      h += '<span class="au2-ac' + (bad ? ' bad' : '') + '">' + esc(L(dfn ? dfn.label : ty)) + (bad ? ' ✕' : '') + '</span>';
    });
    return h ? '<div class="au2-chips">' + h + '</div>' : '';
  }

  global.Auto2 = {
    init: function (ctx) { c = ctx; S = global.Store; },
    trigText: function (pid, tr) { return trigText(pid, tr); },
    actText: function (pid, a) { return actText(pid, a); },
    trigParams: function (pid, tr) { return trigParams(pid, tr); },
    actParams: function (pid, a, d) { return actParams(pid, a, d); },
    newAct: newAct, previewHtml: previewHtml, dryBlock: dryBlock, runDry: runDry,
    galleryHtml: galleryHtml, build: build, runExtra: runExtra, TEMPLATES: TEMPLATES
  };
})(window);

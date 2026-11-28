/* Orbit - Sprint 4c
 * ผู้อนุมัติหลายคน + ประวัติการอนุมัติ (ส่วนหน้าจอ) / เตือนฉันต่องาน / Excel (.xlsx) / เพิ่มสมาชิกหลายคนด้วยอีเมลหรือ CSV
 * ตรรกะข้อมูลอยู่ท้าย store.js (บล็อก Sprint 4c) ที่นี่มีแต่หน้าจอ โหลดก่อน main.js
 * ไม่เพิ่ม SCHEMA: ฟิลด์ใหม่ (approvers, approvalMode, approvalVotes, approvalTrail, reminders) ถ้าไม่มี = ค่าเริ่มต้น
 */
(function (global) {
  'use strict';

  var S = global.Store, R = global.Render, L = global.I18N.t;
  function esc(x) { return R.esc(x); }
  function I(n, s) { return global.Icons ? global.Icons.icon(n, s) : ''; }
  var API = null;

  var DEC = { approved: ['อนุมัติ', '#37c5ab'], changes: ['ขอให้แก้ไข', '#fd612c'], rejected: ['ปฏิเสธ', '#e8384f'], pending: ['รอ', '#f5a623'] };
  function pill(k) {
    var d = DEC[k] || DEC.pending;
    return '<span class="approval-pill" style="background:' + d[1] + '22;color:' + d[1] + '">' + esc(L(d[0])) + '</span>';
  }

  /* ====================== ผู้อนุมัติหลายคน + ประวัติ ====================== */
  global.Orbit4c = {
    approvalPanel: function (t) {
      var ids = S.approverIds(t), multi = ids.length > 1, h = '<div class="apv4c">';
      if (multi) {
        h += '<div class="apv4c-mode">' + esc(S.approvalMode(t) === 'all' ? L('ทุกคนต้องอนุมัติ') : L('คนใดคนหนึ่งอนุมัติก็พอ')) + '</div><div class="apv4c-list">';
        ids.forEach(function (id) {
          var u = S.user(id), v = t.approvalVotes && t.approvalVotes[id];
          h += '<div class="apv4c-p">' + R.avatar(u, 'sm') + '<span class="grow">' + esc(u ? u.name : '?') + '</span>' + pill(v || 'pending') + '</div>';
        });
        h += '</div>';
      }
      if (S.can('write', t.id)) {
        h += '<button class="as-link" data-act="apv-people" data-id="' + esc(t.id) + '">' + I('users', 12) + ' ' +
          esc(multi ? L('แก้ผู้อนุมัติ') : L('ให้หลายคนอนุมัติ')) + '</button>';
      }
      var tr = t.approvalTrail || [];
      if (tr.length) {
        h += '<div class="apv4c-trail"><b>' + esc(L('ประวัติการอนุมัติ')) + '</b>';
        tr.slice().reverse().forEach(function (e) {
          var u = S.user(e.u);
          h += '<div class="apv4c-t">' + R.avatar(u, 'sm') + '<div class="grow"><span>' + esc(u ? u.name : '?') + '</span> ' + pill(e.d) +
            ' ' + R.whenTag(e.at, 'apv-when') + (e.note ? '<div class="apv4c-note">' + esc(e.note) + '</div>' : '') + '</div></div>';
        });
        h += '</div>';
      }
      return h + '</div>';
    },

    reminderRow: function (t) {
      if (!S.isActive()) return '';
      var mine = S.myReminders(t.id);
      var h = '<div class="fld"><label>' + L('เตือนฉัน') + '</label><div class="val"><div class="fld-inline rm4c">';
      mine.forEach(function (r) {
        h += '<span class="chip rm4c-chip">' + I('bell', 11) + ' ' + esc(R.fmtExact(r.at)) +
          ' <button class="rm4c-x" data-act="rm-del" data-id="' + esc(t.id) + '" data-rid="' + esc(r.id) + '" title="' + esc(L('ลบการเตือน')) + '">' + I('close', 10) + '</button></span>';
      });
      h += '<button class="btn btn-sm btn-ghost" data-act="rm-open" data-id="' + esc(t.id) + '">' + I('bell', 12) + ' ' + esc(L('ตั้งเตือน…')) + '</button>';
      return h + '</div></div></div>';
    }
  };

  /* ====================== Excel (SheetJS โหลดเมื่อกดใช้) ====================== */
  var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  function loadXlsx(ok, fail) {
    if (global.XLSX) { ok(global.XLSX); return; }
    var s = document.createElement('script');
    s.src = XLSX_URL; s.async = true;
    s.onload = function () { global.XLSX ? ok(global.XLSX) : fail(); };
    s.onerror = function () { s.remove(); fail(); };
    document.head.appendChild(s);
  }
  /** อ่านไฟล์ .xlsx/.xls แผ่นแรก -> ข้อความ CSV ให้ตัวจับคู่คอลัมน์เดิมใช้ต่อ */
  global.Orbit4c.xlsxToCsv = function (file, ok, fail) {
    loadXlsx(function (X) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var wb = X.read(fr.result, { type: 'array', cellDates: true });
          var ws = wb.Sheets[wb.SheetNames[0]];
          ok('﻿' + X.utils.sheet_to_csv(ws, { dateNF: 'yyyy-mm-dd', blankrows: false }));
        } catch (e) { fail(); }
      };
      fr.onerror = fail;
      fr.readAsArrayBuffer(file);
    }, fail);
  };

  /* ====================== ส่วนขยาย (ปุ่มกด) ====================== */
  global.OrbitExt = global.OrbitExt || [];
  global.OrbitExt.push(function (api) {
    API = api;
    var toast = api.toast;
    api.needs('write:task', ['apv-people', 'apv-people-save']);
    api.needs('self', ['rm-open', 'rm-pick', 'rm-custom', 'rm-custom-ok', 'rm-del']);
    api.needs('manage', ['bulk-invite', 'bulk-invite-go']);

    function reminderSet(tid, iso) {
      if (S.addReminder(tid, iso)) { api.closeModal(); api.renderAll(); toast(L('ตั้งเตือนแล้ว {t}', { t: R.fmtExact(iso) }), L('ย้อนกลับ'), 'undo'); }
      else toast(L('เลือกเวลาในอนาคต'));
    }

    function approverModal(t) {
      var cur = S.approverIds(t);
      var h = '<h2>' + esc(L('ผู้อนุมัติ')) + '</h2><p class="prj-note">' + esc(L('เลือกได้หลายคน ผู้อนุมัติแต่ละคนตัดสินแยกกัน และเห็นประวัติในแผงงาน')) + '</p><div class="apv4c-picks">';
      S.db.users.filter(function (u) { return u.active !== false && u.role !== 'guest'; }).forEach(function (u) {
        h += '<label class="apv4c-pick"><input type="checkbox" value="' + esc(u.id) + '"' + (cur.indexOf(u.id) >= 0 ? ' checked' : '') + '> ' +
          R.avatar(u, 'sm') + '<span>' + esc(u.name) + '</span></label>';
      });
      h += '</div><div class="field" style="margin-top:12px"><label>' + esc(L('เกณฑ์ตัดสิน')) + '</label><select id="apvMode" class="inp">' +
        '<option value="all"' + (S.approvalMode(t) === 'all' ? ' selected' : '') + '>' + esc(L('ทุกคนต้องอนุมัติ')) + '</option>' +
        '<option value="any"' + (S.approvalMode(t) === 'any' ? ' selected' : '') + '>' + esc(L('คนใดคนหนึ่งอนุมัติก็พอ')) + '</option></select></div>' +
        '<div class="modal-acts"><button class="btn" data-act="close-modal">' + esc(L('ยกเลิก')) + '</button>' +
        '<button class="btn btn-primary" data-act="apv-people-save" data-id="' + esc(t.id) + '">' + esc(L('บันทึก')) + '</button></div>';
      return h;
    }

    /* ---------- เพิ่มสมาชิกหลายคน ---------- */
    function inviteModal() {
      var h = '<h2>' + esc(L('เพิ่มสมาชิกหลายคน')) + '</h2>' +
        '<div class="field"><label>' + esc(L('อีเมล (หนึ่งบรรทัดต่อหนึ่งคน)')) + '</label>' +
        '<textarea id="biText" class="inp" rows="6" placeholder="somchai@example.com&#10;somying@example.com, Somying, Design"></textarea>' +
        '<div class="fld-hint">' + esc(L('รูปแบบ: อีเมล, ชื่อที่แสดง, ทีม (ชื่อและทีมไม่บังคับ)')) + '</div></div>' +
        '<div class="field"><label>' + esc(L('หรืออัปโหลดไฟล์ CSV (คอลัมน์: อีเมล, ชื่อ, ทีม)')) + '</label><input id="biFile" type="file" accept=".csv,text/csv"></div>' +
        '<div class="field"><label>' + esc(L('บทบาทที่จะให้')) + '</label><select id="biRole" class="inp">';
      S.ROLES.forEach(function (r) { h += '<option value="' + r.id + '"' + (r.id === 'member' ? ' selected' : '') + '>' + esc(L(r.label)) + '</option>'; });
      return h + '</select></div><div class="modal-note">' + esc(L('กรอกอีเมลให้ตรงกับบัญชีบริษัท ไม่งั้นตอนเจ้าตัวล็อกอินจะกลายเป็นคนละรายการ')) + '</div>' +
        '<div class="modal-acts"><button class="btn" data-act="close-modal">' + esc(L('ยกเลิก')) + '</button>' +
        '<button class="btn btn-primary" data-act="bulk-invite-go">' + esc(L('เพิ่มสมาชิก')) + '</button></div>';
    }
    function rowsFromText(txt, isCsv) {
      var rows = isCsv ? S.parseCsv(txt) : String(txt).split(/\r?\n/).map(function (l) { return l.split(/[,\t;]/); });
      return rows.map(function (r) { return r.map(function (c) { return String(c || '').trim(); }); })
        .filter(function (r) { return r[0]; })
        .filter(function (r, i) { return !(i === 0 && r[0].indexOf('@') < 0 && isCsv); })      // แถวหัวตาราง
        .map(function (r) { return { email: r[0], name: r[1] || '', team: r[2] || '' }; });
    }
    function inviteRun(rows) {
      if (!rows.length) { toast(L('ยังไม่มีอีเมลให้เพิ่ม')); return; }
      var role = document.getElementById('biRole').value;
      var res = S.bulkAddUsers(rows, role);
      api.renderAll();
      var h = '<h2>' + esc(L('สรุปการเพิ่มสมาชิก')) + '</h2><ul class="bi-sum">' +
        '<li>' + esc(L('เพิ่มแล้ว {n} คน', { n: res.added.length })) + '</li>' +
        '<li>' + esc(L('ข้าม (มีอยู่แล้วหรือซ้ำ) {n} รายการ', { n: res.dup.length })) + (res.dup.length ? ': <em>' + esc(res.dup.slice(0, 8).join(', ')) + '</em>' : '') + '</li>' +
        '<li>' + esc(L('อีเมลไม่ถูกต้อง {n} รายการ', { n: res.bad.length })) + (res.bad.length ? ': <em>' + esc(res.bad.slice(0, 8).join(', ')) + '</em>' : '') + '</li></ul>' +
        '<div class="modal-acts"><button class="btn btn-primary" data-act="close-modal">' + esc(L('ปิด')) + '</button></div>';
      api.openModal(h);
    }

    api.act(function (act, el) {
      var id = el.dataset.id;
      switch (act) {
        case 'apv-people': { var t = S.task(id); if (t) api.openModal(approverModal(t)); return true; }
        case 'apv-people-save': {
          var ids = [].slice.call(document.querySelectorAll('.apv4c-pick input:checked')).map(function (x) { return x.value; });
          if (!ids.length) { toast(L('เลือกผู้อนุมัติอย่างน้อยหนึ่งคน')); return true; }
          if (S.setApprovers(id, ids, document.getElementById('apvMode').value)) {
            api.closeModal(); api.renderAll(); toast(L('บันทึกผู้อนุมัติแล้ว'), L('ย้อนกลับ'), 'undo');
          }
          return true;
        }
        case 'rm-open': {
          var choices = S.reminderChoices(id).map(function (c) { return { label: L(c.label), run: function () { reminderSet(id, c.at); } }; });
          choices.push({ label: L('กำหนดเอง…'), run: function () {
            var d = new Date(Date.now() + 3600000), p = function (n) { return (n < 10 ? '0' : '') + n; };
            var v = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':00';
            api.openModal('<h2>' + esc(L('เตือนฉันเมื่อ')) + '</h2><div class="field"><input id="rmAt" type="datetime-local" class="inp" value="' + v + '"></div>' +
              '<div class="modal-acts"><button class="btn" data-act="close-modal">' + esc(L('ยกเลิก')) + '</button>' +
              '<button class="btn btn-primary" data-act="rm-custom-ok" data-id="' + esc(id) + '">' + esc(L('ตั้งเตือน')) + '</button></div>');
          } });
          api.askChoice(L('เตือนฉันเกี่ยวกับงานนี้'), L('ระบบจะส่งการแจ้งเตือนให้คุณเมื่อถึงเวลา (ขณะเปิดแอปอยู่)'), choices);
          return true;
        }
        case 'rm-custom-ok': {
          var v2 = document.getElementById('rmAt').value;
          reminderSet(id, v2 ? new Date(v2).toISOString() : '');
          return true;
        }
        case 'rm-del':
          if (S.removeReminder(id, el.dataset.rid)) { api.renderAll(); toast(L('ลบการเตือนแล้ว'), L('ย้อนกลับ'), 'undo'); }
          return true;
        case 'export-xlsx': {
          api.closePops();
          var p = S.project(id);
          if (!p) return true;
          toast(L('กำลังเตรียมไฟล์ Excel…'));
          loadXlsx(function (X) {
            var ws = X.utils.aoa_to_sheet(S.parseCsv(S.projectCsv(id)));
            var wb = X.utils.book_new();
            X.utils.book_append_sheet(wb, ws, String(p.name || 'Tasks').replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Tasks');
            X.writeFile(wb, api.safeFileName(p.name) + '.xlsx');
            toast(L('ส่งออกไฟล์ Excel แล้ว'));
          }, function () { toast(L('โหลดตัวอ่าน Excel ไม่สำเร็จ ลองใช้ CSV แทน หรือตรวจการเชื่อมต่ออินเทอร์เน็ต')); });
          return true;
        }
        case 'bulk-invite': api.openModal(inviteModal()); return true;
        case 'bulk-invite-go': {
          var txt = document.getElementById('biText').value, f = document.getElementById('biFile').files[0];
          var rows = rowsFromText(txt, false);
          if (!f) { inviteRun(rows); return true; }
          var fr = new FileReader();
          fr.onload = function () { inviteRun(rows.concat(rowsFromText(String(fr.result || ''), true))); };
          fr.onerror = function () { toast(L('อ่านไฟล์ไม่สำเร็จ')); };
          fr.readAsText(f, 'utf-8');
          return true;
        }
      }
      return false;
    });
  });
})(window);

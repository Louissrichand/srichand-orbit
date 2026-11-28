/* Orbit — มือถือ (Sprint 2A)
 *
 * ผลทดสอบกับ "พนักงานใหม่ที่ใช้มือถือ" บอกว่าจอมือถือเป็นแค่หน้าคอมที่ถูกบีบ
 * ไฟล์นี้รวมของที่ทำให้มือถือใช้ได้จริงไว้ที่เดียว (ส่วนหน้าตาอยู่ท้าย styles.css "Sprint 2A: มือถือ")
 *   - แถบนำทางล่าง (หน้าแรก งานของฉัน + สร้างงาน กล่องแจ้งเตือน ค้นหา) — นิ้วโป้งเอื้อมถึง ไม่ต้องเปิดเมนูซ้าย
 *   - สร้างงานด่วนพร้อมปุ่มกำหนดส่ง วันนี้/พรุ่งนี้/สัปดาห์หน้า
 *   - ช่องค้นหาด้านบนเหลือแว่นขยาย แตะแล้วกางเต็มแถว (ชื่อหน้าไม่ถูกเบียดจนเหลือตัวเดียว)
 *   - โหมดเลือกหลายงาน: กดค้างที่แถว หรือปุ่ม "เลือก" (ช่องติ๊กเล็ก ๆ ข้างวงกลมทำเสร็จกดพลาดบ่อย จึงซ่อนไว้)
 *   - ย้ายเซกชัน/คอลัมน์โดยไม่ต้องลาก (แถบแก้หลายงาน เมนู ⋯ ของงาน และปุ่ม ⋯ ท้ายแถวงานของฉัน)
 *   - เมนู ⋯ ของกล่องแจ้งเตือนและงานของฉัน แท็บที่ล้นจอเลื่อนไปหาแท็บที่เลือกเอง
 *   - Gantt/ไทม์ไลน์บอกว่าดูบนคอมสะดวกกว่า พร้อมปุ่มสลับไปรายการ
 *   - iPhone ไม่มีปุ่มติดตั้งแอป — บอกวิธี "แชร์ → เพิ่มไปยังหน้าจอโฮม" ครั้งเดียว
 * โหลดก่อน main.js แบบเดียวกับ ui4b.js แล้วเสียบเข้าแอปผ่าน window.OrbitExt
 */
(function (global) {
  'use strict';

  var PHONE = '(max-width: 700px)';
  /* มือถือแนวนอนกว้างเกิน 700px แต่เตี้ย — ใช้หน้าตาจอเล็ก (ช่องค้นหาหุบ แถวสองบรรทัด) ตรงกับ styles.css */
  var COMPACT = '(max-width: 700px), (pointer: coarse) and (max-height: 500px)';
  var IOS_KEY = 'orbit.iosHint';

  function mq(q) { try { return global.matchMedia(q).matches; } catch (e) { return false; } }
  function isPhone() { return mq(PHONE); }
  function isCompact() { return mq(COMPACT); }
  /** จอสัมผัสไม่มี hover — ใช้ตัดสินว่าจะซ่อนคำใบ้คีย์ลัดไหม */
  function isTouch() { return mq('(hover: none)'); }

  /* ตัวช่วยที่ render.js / main.js เรียกตอนวาด — ตั้งค่าเริ่มไว้ก่อน แล้วไส้จริงใส่ตอนแอปเริ่ม */
  var M = global.OrbitMobile = {
    selecting: function () { return false; },
    canMoveSec: function () { return false; }
  };

  global.OrbitExt = global.OrbitExt || [];
  global.OrbitExt.push(function (api) {
    var S = api.S, L = api.L, I = api.I, esc = api.esc, state = api.state, toast = api.toast;
    var $view = document.getElementById('view');
    var $topbar = document.getElementById('topbar');
    var $drawer = document.getElementById('drawer');
    var $mdBack = document.getElementById('modalBackdrop');
    var $gate = document.getElementById('gate');
    var $opt = document.getElementById('optPanel');
    var $toast = document.getElementById('toast');
    var body = document.body;

    /* การย้ายเซกชันของงานของฉันเป็นเรื่องส่วนตัว (ไม่แก้ตัวงาน) ย้ายคอลัมน์ในโปรเจกต์ = แก้งาน */
    api.needs('self', ['m2a-mt-move', 'm2a-bulk-mtsec-pick']);
    api.needs('write:task', ['m2a-move-pick']);

    /* ====================== สถานะร่วม ====================== */

    var selMode = false;        // เปิดโหมดเลือกจากปุ่ม "เลือก" (ยังไม่ได้เลือกสักงานก็ได้)
    var lastNew = null;         // งานที่เพิ่งสร้างจากปุ่ม + (ปุ่ม "เปิดงาน" ในข้อความแจ้ง)
    var lastRouteKey = '';
    var wideNoteOff = false;    // ปิดคำแนะนำ "ดูบนคอมพิวเตอร์" แล้ว (ทั้งรอบที่เปิดแอปนี้)
    var kbOpen = false;

    function selCount() { return Object.keys(state.sel || {}).length; }
    function selecting() { return selMode || selCount() > 0; }
    function me() { return S.db.currentUserId; }
    function routeKey() { var r = state.route || {}; return r.type + ':' + (r.id || '') + ':' + (r.view || ''); }

    M.selecting = selecting;
    M.canMoveSec = function (taskId) { return moveTargets(taskId).any; };

    /* ====================== แถบนำทางล่าง ====================== */

    var $bnav = document.createElement('nav');
    $bnav.className = 'm2a-bnav';
    body.appendChild($bnav);

    function bnavItem(act, attrs, icon, label, on, badge) {
      return '<button class="m2a-bn' + (on ? ' on' : '') + '" data-act="' + act + '"' + attrs +
        (on ? ' aria-current="page"' : '') + '><span class="m2a-bn-ic">' + I(icon, 20) + (badge || '') +
        '</span><span class="m2a-bn-t">' + esc(label) + '</span></button>';
    }

    function renderBnav() {
      $bnav.setAttribute('aria-label', L('เมนูหลัก'));
      if (!S.me()) { $bnav.innerHTML = ''; return; }
      var r = state.route || {};
      /* ห้ามรบกวน — ไม่ขึ้นตัวเลขแดง บอกด้วยพระจันทร์แทน (แบบเดียวกับแถบซ้าย) */
      var dnd = S.isDnd(), unread = S.unreadCount(me());
      var badge = dnd ? '<span class="m2a-bn-dnd" title="' + esc(L('ห้ามรบกวนอยู่')) + '">' + I('moon', 10) + '</span>'
        : (unread ? '<span class="m2a-bn-badge">' + (unread > 99 ? '99+' : unread) + '</span>' : '');
      var canAdd = S.canCreateTask(null) || (r.type === 'project' && S.canCreateTask(r.id));
      $bnav.innerHTML =
        bnavItem('go', ' data-route="home"', 'home', L('หน้าแรก'), r.type === 'home') +
        bnavItem('go', ' data-route="mytasks"', 'checkCircle', L('งานของฉัน'), r.type === 'mytasks') +
        (canAdd ? '<button class="m2a-bn m2a-bn-add" data-act="m2a-quick-add" aria-label="' + esc(L('สร้างงาน')) + '">' +
          '<span class="m2a-bn-plus">' + I('plus', 22) + '</span></button>' : '') +
        bnavItem('go', ' data-route="inbox"', 'bell', L('กล่องแจ้งเตือน'), r.type === 'inbox', badge) +
        bnavItem('m2a-search', '', 'search', L('ค้นหา'), r.type === 'search');
      syncBnav();
    }

    /** แสดงแถบล่างเฉพาะจอมือถือ และซ่อนเมื่อแผงงาน หน้าต่าง หน้าเข้าสู่ระบบ หรือแป้นพิมพ์บังอยู่
     *  body.m2a-bnav ให้ CSS เว้นที่ใต้เนื้อหา ยกข้อความแจ้งและแถบแก้หลายงานขึ้นเหนือแถบ */
    function syncBnav() {
      var dw = !!($drawer && $drawer.classList.contains('open'));
      /* แผงงานเต็มจอบนมือถือ — แถบแก้หลายงาน (z-index สูงกว่าแผง) ต้องไม่ลอยทับช่องความเห็น */
      body.classList.toggle('m2a-dw', dw);
      var show = isPhone() && !!S.me() && !!$bnav.firstChild && !dw &&
        !($mdBack && $mdBack.classList.contains('open')) &&
        !($opt && $opt.classList.contains('open')) &&
        !($gate && !$gate.hidden) && !kbOpen;
      body.classList.toggle('m2a-bnav-on', show);
      /* ข้อความแจ้งที่ค้างอยู่ตอนแถบโผล่/หาย ต้องขยับตาม — วัดความสูงแถบแก้หลายงานใหม่ */
      var bb = $view.querySelector('.bulkbar');
      if (bb && $toast) $toast.style.setProperty('--bulk-h', bb.getBoundingClientRect().height + 'px');
    }

    /* แผงงาน หน้าต่าง แผงตัวเลือก และหน้าเข้าสู่ระบบ เปิด/ปิดจาก main.js — ฟังการเปลี่ยนคลาสแทนการแก้ทุกจุด */
    var watch = new MutationObserver(syncBnav);
    [$drawer, $mdBack, $opt].forEach(function (el) { if (el) watch.observe(el, { attributes: true, attributeFilter: ['class'] }); });
    if ($gate) watch.observe($gate, { attributes: true, attributeFilter: ['hidden'] });
    try { global.matchMedia(PHONE).addEventListener('change', function () { syncBnav(); syncTabs(); }); }
    catch (e) { global.addEventListener('resize', syncBnav); }

    /* ---- แป้นพิมพ์บนจอ ----
     * เบราว์เซอร์ไม่บอกตรง ๆ ว่าแป้นพิมพ์เปิดอยู่ ใช้ "มีช่องพิมพ์ได้โฟกัสอยู่" เป็นสัญญาณ
     * แถบล่างที่ลอยค้างเหนือแป้นพิมพ์บังช่องที่กำลังพิมพ์ และกินที่ครึ่งจอที่เหลืออยู่ */
    function editable(el) {
      if (!el || el === body) return false;
      if (el.isContentEditable) return true;
      if (el.tagName === 'TEXTAREA') return true;
      return el.tagName === 'INPUT' && !/^(button|checkbox|radio|range|color|file|submit|reset|image|hidden)$/i.test(el.type || '');
    }
    function setKb(v) {
      if (kbOpen === v) return;
      kbOpen = v;
      body.classList.toggle('m2a-kb', v);
      syncBnav();
    }
    document.addEventListener('focusin', function (e) {
      if (editable(e.target)) setKb(true);
      if (e.target && e.target.id === 'searchInput' && isCompact()) searchOpen(false);
    });
    document.addEventListener('focusout', function (e) {
      var was = e.target;
      setTimeout(function () {
        setKb(editable(document.activeElement));
        /* ออกจากช่องค้นหาที่ว่างอยู่ = หุบกลับเป็นแว่นขยาย (แตะปุ่มในช่องเองไม่นับ) */
        if (was && was.id === 'searchInput' && !was.value && !insideSearch(document.activeElement)) searchClose();
      }, 120);
    });

    /* ====================== ช่องค้นหาด้านบน ====================== */

    function insideSearch(el) { return !!(el && el.closest && el.closest('#topbar .search')); }
    function searchOpen(focus) {
      if (!$topbar) return;
      $topbar.classList.add('m2a-sopen');
      if (focus) {
        var si = document.getElementById('searchInput');
        if (si) { si.focus(); try { var n = si.value.length; si.setSelectionRange(n, n); } catch (e) { /* type=search บางเครื่อง */ } }
      }
    }
    function searchClose() {
      if (!$topbar) return;
      $topbar.classList.remove('m2a-sopen');
      var si = document.getElementById('searchInput');
      if (si && document.activeElement === si) si.blur();
    }
    /* แตะแว่นขยาย (ช่องที่ยังหุบ) = กางเต็มแถวแล้วโฟกัสเลย ไม่ต้องแตะซ้ำอีกครั้ง */
    document.addEventListener('click', function (e) {
      if (!isCompact() || !$topbar || $topbar.classList.contains('m2a-sopen')) return;
      if (!insideSearch(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      searchOpen(true);
    }, true);

    /* ====================== สร้างงานด่วน (+) ====================== */

    /** วันจันทร์หน้า — "สัปดาห์หน้า" แบบ Asana คือเริ่มสัปดาห์ทำงานถัดไป ไม่ใช่อีก 7 วันพอดี */
    function nextMonday() {
      var d = new Date(), dow = d.getDay();
      return S.addDays(S.today(), ((8 - dow) % 7) || 7);
    }
    var DUE_CHOICES = [
      ['', 'ไม่มีกำหนด'], ['today', 'วันนี้'], ['tomorrow', 'พรุ่งนี้'], ['nextweek', 'สัปดาห์หน้า']
    ];
    function dueOf(k) {
      if (k === 'today') return S.today();
      if (k === 'tomorrow') return S.addDays(S.today(), 1);
      if (k === 'nextweek') return nextMonday();
      return null;
    }
    var qa = null;              // { pid, sec, due: { dueOn } } ของหน้าต่างสร้างงานที่เปิดอยู่

    function quickAdd() {
      var r = state.route || {};
      /* อยู่ในโปรเจกต์ที่เพิ่มงานได้ = เพิ่มเข้าโปรเจกต์นั้น (คอลัมน์แรก) ที่อื่น = งานส่วนตัวในงานของฉัน */
      var p = r.type === 'project' && S.project(r.id) && S.canCreateTask(r.id) ? S.project(r.id) : null;
      if (!p && !S.canCreateTask(null)) { api.denyToast(); return; }
      var sec = p && p.sections[0] ? p.sections[0].id : null;
      /* อ็อบเจกต์เดียวกับ pasteCtx.extra — วางหลายบรรทัดในงานของฉันแล้วได้กำหนดส่งที่เลือกไว้ด้วย */
      var due = { dueOn: null };
      qa = { pid: p ? p.id : null, sec: sec, due: due };
      var where = p ? L('เพิ่มในโปรเจกต์ {p}', { p: p.name + (p.sections[0] ? ' · ' + p.sections[0].name : '') })
        : L('เพิ่มในงานของฉัน — เป็นงานส่วนตัว เห็นเฉพาะคุณจนกว่าจะเพิ่มเข้าโปรเจกต์');
      api.askText(L('สร้างงาน'), '', function (v) {
        var ctx = qa;
        qa = null;
        if (!v || !ctx) return;
        var qz = api.quickParse(v, ctx.pid, { dueOn: ctx.due.dueOn || null });   // Pre-pilot A — @ชื่อ #เซกชัน วันที่ ในชื่องาน
        var made = ctx.pid
          ? S.createTask(qz.attrs, ctx.pid, qz.sectionId || ctx.sec)
          : S.mtCreateTasks([qz.attrs.name], S.MT_RECENT, qz.attrs.dueOn ? { dueOn: qz.attrs.dueOn } : null)[0];
        if (!made) return;              // ด่านสร้างงานปฏิเสธ (ขึ้นข้อความแล้ว)
        lastNew = made.id;
        toast(L('สร้างงานแล้ว'), L('เปิดงาน'), 'm2a-open-new');
      }, { ok: L('เพิ่มงาน'), placeholder: L('ชื่องาน'), note: where,
           pasteCtx: p ? { projectId: p.id, sectionId: sec } : { mtSection: S.MT_RECENT, extra: due } });
      /* ปุ่มกำหนดส่งใต้ช่องชื่อ — ไม่บังคับ เลือกได้ทีหลังในแผงงาน */
      api.quickHint(p ? p.id : null);
      var field = document.querySelector('#modal .field');
      if (field) field.insertAdjacentHTML('afterend', dueChipsHtml(''));
    }
    function dueChipsHtml(cur) {
      return '<div class="m2a-qa-due" role="group" aria-label="' + esc(L('กำหนดส่ง')) + '">' +
        DUE_CHOICES.map(function (c) {
          var d = dueOf(c[0]);
          return '<button type="button" class="m2a-chip' + (c[0] === cur ? ' on' : '') + '" data-act="m2a-qa-due" data-v="' +
            c[0] + '" aria-pressed="' + (c[0] === cur) + '">' + esc(L(c[1])) +
            (d && c[0] === 'nextweek' ? '<em>' + esc(api.R.fmtDate(d)) + '</em>' : '') + '</button>';
        }).join('') + '</div>';
    }
    /* แตะปุ่มวันแล้วช่องชื่อไม่เสียโฟกัส — แป้นพิมพ์มือถือไม่หุบลงแล้วเด้งขึ้นใหม่ */
    document.addEventListener('mousedown', function (e) {
      if (e.target.closest && e.target.closest('.m2a-qa-due button')) e.preventDefault();
    }, true);

    /* ====================== โหมดเลือกหลายงาน ====================== */

    /** ทำหน้าจอให้ตรงกับการเลือก — คลาสบน body (โชว์ช่องติ๊ก) และป้ายปุ่ม "เลือก" บนแถบเครื่องมือ
     *  การเลือกเปลี่ยนจาก main.js โดยไม่วาดใหม่ทั้งหน้า (updateSelectionUI) จึงดูจากแถบแก้หลายงานใน #view */
    function syncSel() {
      var on = selecting();
      body.classList.toggle('m2a-sel', on);
      Array.prototype.forEach.call(document.querySelectorAll('.m2a-selbtn'), function (b) {
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
        b.title = on ? L('เลิกเลือก') : L('เลือกหลายงาน');
        var tx = b.querySelector('.m2a-selbtn-t');
        if (tx) tx.textContent = on ? L('เลิกเลือก') : L('เลือก');
      });
      syncBnav();
    }
    new MutationObserver(syncSel).observe($view, { childList: true });

    function rowOf(el) {
      var row = el && el.closest ? el.closest('.row[data-id], .tr[data-id], .card[data-id]') : null;
      if (!row || row.classList.contains('sub') || !row.querySelector('.selbox')) return null;
      return row;
    }
    function toggleRow(row) {
      var box = row.querySelector('.selbox');
      if (box) box.click();             // ใช้ตัวจัดการ select-task เดิม (จำจุดเริ่ม อัปเดตแถบแก้หลายงาน)
      syncSel();
    }

    /* กดค้างที่แถว (touch.js) = เลือกงานนั้นและเข้าโหมดเลือก แบบแอปอีเมลบนมือถือ */
    document.addEventListener('orbit:longpress', function (e) {
      var row = rowOf(e.target);
      if (!row) return;
      if (!row.classList.contains('sel')) toggleRow(row);
      if (global.navigator.vibrate) { try { global.navigator.vibrate(15); } catch (er) { /* ไม่รองรับ */ } }
    });

    /* ====================== ย้ายเซกชัน / คอลัมน์ โดยไม่ต้องลาก ====================== */

    /** ที่ที่งานนี้ย้ายไปได้: คอลัมน์ของโปรเจกต์ที่จัดได้ และเซกชันในงานของฉัน (ถ้าเป็นงานของเรา) */
    function moveTargets(taskId) {
      var t = S.task(taskId);
      var out = { projects: [], mine: false, any: false };
      if (!t) return out;
      if (!t.parentId) {
        out.projects = S.projectsOfTask(t.id).filter(function (x) {
          return S.projectAccess(x.project.id) && S.canArrangeIn(x.project.id) && x.project.sections.length > 1;
        });
      }
      out.mine = t.assigneeId === me() && S.personalOf().mt.secs.length > 1;
      out.any = !!(out.projects.length || out.mine);
      return out;
    }
    function check(on) { return '<span class="m2a-mv-ck">' + (on ? I('check', 13) : '') + '</span>'; }
    /** ชื่อเซกชันของงานของฉัน — ชื่อตั้งต้นเก็บเป็นคีย์ภาษาไทย แปลตอนแสดง (แบบเดียวกับ mtLabel ใน render.js) */
    function mtSecName(s) {
      return s.id === S.MT_RECENT && !s.name ? L('เพิ่งได้รับมอบหมาย') : L(s.name);
    }
    function mtSecButtons(act, taskId, cur) {
      return S.personalOf().mt.secs.map(function (s) {
        var nm = mtSecName(s);
        return '<button class="m2a-mv-opt' + (s.id === cur ? ' on' : '') + '" data-act="' + act + '"' +
          (taskId ? ' data-id="' + esc(taskId) + '"' : '') + ' data-mtsec="' + esc(s.id) + '">' + check(s.id === cur) +
          '<span class="grow">' + esc(nm) + '</span></button>';
      }).join('');
    }
    function moveModal(taskId) {
      var t = S.task(taskId), mt = moveTargets(taskId);
      if (!t || !mt.any) return;
      var h = '<h2>' + L('ย้ายไปเซกชัน') + '</h2><p class="prj-note m2a-mv-task">' + esc(t.name) + '</p>';
      mt.projects.forEach(function (x) {
        h += '<div class="m2a-mv-h">' + esc(x.project.icon || '') + ' ' + esc(x.project.name) + '</div><div class="m2a-mv-list">';
        x.project.sections.forEach(function (s) {
          var on = x.membership.sectionId === s.id;
          h += '<button class="m2a-mv-opt' + (on ? ' on' : '') + '" data-act="m2a-move-pick" data-id="' + esc(t.id) +
            '" data-project="' + esc(x.project.id) + '" data-section="' + esc(s.id) + '">' + check(on) +
            '<span class="grow">' + esc(s.name) + '</span></button>';
        });
        h += '</div>';
      });
      if (mt.mine) {
        h += '<div class="m2a-mv-h">' + I('checkCircle', 14) + ' ' + L('งานของฉัน') + '</div><div class="m2a-mv-list">' +
          mtSecButtons('m2a-mt-move', t.id, S.mtSectionOf(t)) + '</div>';
      }
      h += '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button></div>';
      api.openModal(h);
    }
    function myPop(el, html) {
      var pop = api.openPop(el, html);
      if (pop) pop.classList.add('m2a-pop');
      return pop;
    }

    /** ปุ่ม "ย้ายไป…" บนแถบแก้หลายงาน (render.js bulkbar เรียก) */
    api.R.bulkExt = function () {
      var r = state.route || {};
      if (r.type === 'project' && S.project(r.id) && S.canArrangeIn(r.id)) {
        /* จอกว้างมีอยู่แล้วในเมนู "เพิ่มเติม" — ปุ่มนี้เห็นเฉพาะจอสัมผัส/มือถือที่ลากไม่สะดวก */
        return '<button class="m2a-touch-only" data-act="bulk-section">' + I('grid', 12) + ' ' + L('ย้ายไปเซกชัน…') + '</button>';
      }
      if (r.type === 'mytasks') {
        var v = S.personalOf().mt.view;
        if (v.group === 'sections' && (v.mode === 'list' || v.mode === 'board')) {
          return '<button data-act="m2a-bulk-mtsec">' + I('grid', 12) + ' ' + L('ย้ายไปเซกชัน…') + '</button>';
        }
      }
      return '';
    };

    /* ====================== แท็บที่ล้นจอ ====================== */

    var TABS = '.tb-tabs, .prj-tabs';
    /** แถบแท็บที่ยาวเกินจอ: เลื่อนให้เห็นแท็บที่เลือกอยู่ (วาดใหม่ทีไรแถบกลับไปซ้ายสุด แท็บที่เลือกหลุดจอ)
     *  และขึ้นเงาจาง ๆ ที่ขอบฝั่งที่ยังมีแท็บซ่อนอยู่ ให้รู้ว่าเลื่อนได้ */
    function syncTabs() {
      Array.prototype.forEach.call(document.querySelectorAll(TABS), function (box) {
        var over = box.scrollWidth > box.clientWidth + 2;
        if (over && !box._m2aSeen) {
          box._m2aSeen = true;
          var act = box.querySelector('.active, .on');
          if (act) {
            var br = box.getBoundingClientRect(), ar = act.getBoundingClientRect();
            if (ar.left < br.left + 8 || ar.right > br.right - 8) {
              box.scrollLeft += (ar.left - br.left) - Math.max(0, (br.width - ar.width) / 2);
            }
          }
        }
        fadeTabs(box);
      });
    }
    function fadeTabs(box) {
      var over = box.scrollWidth > box.clientWidth + 2;
      box.classList.toggle('m2a-fl', over && box.scrollLeft > 2);
      box.classList.toggle('m2a-fr', over && box.scrollLeft + box.clientWidth < box.scrollWidth - 2);
    }
    document.addEventListener('scroll', function (e) {
      var t = e.target;
      if (t && t.matches && t.matches(TABS)) fadeTabs(t);
    }, true);

    /* ====================== คำใบ้คีย์ลัดบนจอสัมผัส ====================== */

    /* "(/)" "(Ctrl+Enter ส่ง)" ในช่องพิมพ์ไม่มีความหมายบนมือถือที่ไม่มีแป้นพิมพ์จริง และกินที่ในช่องแคบ ๆ
     * ตัดออกจาก placeholder ตอนวาด (ปุ่ม <kbd> ซ่อนด้วย CSS) — จอที่มีเมาส์/คีย์บอร์ดยังเห็นตามเดิม */
    var HINT = /\s*\((?:\/|(?:Ctrl|Shift|Tab|Alt|Cmd|⌘)\+[^)]*)\)/g;
    function stripHints() {
      if (!isTouch()) return;
      Array.prototype.forEach.call(document.querySelectorAll('[placeholder*="("], [data-placeholder*="("]'), function (el) {
        ['placeholder', 'data-placeholder'].forEach(function (a) {
          var v = el.getAttribute(a);
          if (v && HINT.test(v)) { HINT.lastIndex = 0; el.setAttribute(a, v.replace(HINT, '')); }
          HINT.lastIndex = 0;
        });
      });
    }

    /* ====================== ป้ายท้ายแถวที่ล้น ====================== */

    /* แถวงานบนจอกว้าง: ป้ายที่ไม่พอที่ถูกตัดจากฝั่งซ้าย (CSS) — ใส่เงาจางที่ขอบซ้ายเฉพาะแถวที่ล้นจริง
     * ไม่งั้นป้ายแรกโดนตัดกลางคำแบบห้วน ๆ (แถวที่ไม่ล้นไม่ต้องจาง ป้ายจะได้ไม่ดูซีด) */
    function fadeMeta() {
      if (isCompact()) return;
      var list = $view.querySelectorAll('.row > .meta');
      /* อ่านตำแหน่งให้ครบก่อนค่อยใส่คลาส — สลับอ่าน/เขียนทีละแถวทำให้เบราว์เซอร์คำนวณหน้าใหม่ทุกแถว */
      var cut = Array.prototype.map.call(list, function (m) {
        var f = m.firstElementChild;
        return !!f && f.getBoundingClientRect().left < m.getBoundingClientRect().left - 1;
      });
      Array.prototype.forEach.call(list, function (m, i) { m.classList.toggle('m2a-cut', cut[i]); });
    }
    global.addEventListener('resize', function () { setTimeout(fadeMeta, 60); });

    /* วาดใหม่ที่ไหนก็ตาม (แถบบน หน้าต่าง แผงงาน) ตามมาเก็บงานพวกนี้รอบเดียว หลังการวาดชุดนั้นจบ
     * (setTimeout ไม่ใช่ requestAnimationFrame — แท็บที่อยู่เบื้องหลังไม่เดินเฟรม งานนี้จะค้างจนกลับมาดู) */
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        syncTabs();
        stripHints();
        fadeMeta();
      }, 0);
    }).observe(body, { childList: true, subtree: true });

    /* ====================== หลังวาดเนื้อหาทุกครั้ง ====================== */

    api.after(function () {
      var k = routeKey();
      if (k !== lastRouteKey) {
        /* เปลี่ยนหน้า = ออกจากโหมดเลือก และหุบช่องค้นหา (ยกเว้นกำลังพิมพ์อยู่) */
        lastRouteKey = k;
        if (selMode && !selCount()) selMode = false;
        var si = document.getElementById('searchInput');
        if (state.route.type !== 'search' && !(si && document.activeElement === si)) searchClose();
      }
      renderBnav();
      wideNote();
      syncSel();
    });

    /** Gantt/ไทม์ไลน์บนมือถือ — ใช้ได้แต่ลากแท่งด้วยนิ้วยาก บอกตรง ๆ และมีทางไปมุมมองรายการ */
    function wideNote() {
      var r = state.route || {};
      if (wideNoteOff || !isPhone() || r.type !== 'project' || (r.view !== 'gantt' && r.view !== 'timeline')) return;
      if ($view.querySelector('.m2a-wide-note')) return;
      var hasList = S.projectViews(r.id).indexOf('list') >= 0;
      $view.insertAdjacentHTML('beforeend', '<div class="m2a-wide-note" role="note">' + I('alert', 15) +
        '<span class="grow">' + esc(L('ดูบนคอมพิวเตอร์จะสะดวกกว่า')) + '</span>' +
        (hasList ? '<button class="btn btn-sm btn-primary" data-act="set-view" data-view="list">' + esc(L('ดูแบบรายการ')) + '</button>' : '') +
        '<button class="m2a-wide-x" data-act="m2a-wide-x" title="' + esc(L('ปิด')) + '" aria-label="' + esc(L('ปิด')) + '">' +
        I('close', 13) + '</button></div>');
    }

    /* ====================== คำสั่ง ====================== */

    api.act(function (act, el, e) {
      /* คำสั่งของแอปเองที่กดจากเมนูลอยของไฟล์นี้ — ปิดเมนูก่อน (main.js ปิดให้เฉพาะคลิกนอกเมนู) */
      if (el.closest && el.closest('.m2a-pop') && act.indexOf('m2a-') !== 0) api.closePops();

      /* โหมดเลือก: แตะแถว/วงกลม = เลือกหรือเลิกเลือก ไม่เปิดงาน (กดค้างหรือปุ่ม "เลือก" พามาที่นี่) */
      if ((act === 'open-task' || act === 'toggle') && body.classList.contains('m2a-sel') &&
          (isPhone() || isTouch()) && !(e && (e.shiftKey || e.ctrlKey || e.metaKey))) {
        var row = rowOf(el);
        if (row && $view.contains(row)) { e.preventDefault(); toggleRow(row); return true; }
      }

      switch (act) {
        case 'm2a-quick-add': quickAdd(); return true;
        case 'm2a-qa-due': {
          if (!qa) return true;
          qa.due.dueOn = dueOf(el.dataset.v);
          var box = el.closest('.m2a-qa-due');
          if (box) box.outerHTML = dueChipsHtml(el.dataset.v);
          var ai = document.getElementById('askInput');
          if (ai) ai.focus();
          return true;
        }
        case 'm2a-open-new':
          if ($toast) $toast.classList.remove('show');
          if (lastNew && S.task(lastNew)) api.openTask(lastNew);
          return true;

        case 'm2a-search': searchOpen(true); return true;
        case 'm2a-search-close': {
          var si = document.getElementById('searchInput');
          /* อยู่หน้าผลค้นหา = ล้างคำค้นและกลับไปหน้าแรกแบบเดียวกับลบคำค้นจนหมด */
          if (si && si.value) { si.value = ''; si.dispatchEvent(new Event('input', { bubbles: true })); }
          searchClose();
          return true;
        }

        case 'm2a-select-mode':
          if (selecting()) {
            selMode = false;
            api.clearSel();
            api.refreshView();
          } else {
            selMode = true;
            syncSel();
            toast(L('แตะงานเพื่อเลือก แล้วใช้แถบด้านล่างแก้พร้อมกัน'));
          }
          return true;
        case 'bulk-clear':
          selMode = false;          // ปุ่ม "ยกเลิก" บนแถบ = ออกจากโหมดเลือกด้วย (main.js ล้างการเลือกต่อ)
          return false;

        case 'm2a-move-sec': api.closeModal(); moveModal(el.dataset.id); return true;
        case 'm2a-move-pick': {
          var mt = S.task(el.dataset.id);
          api.closeModal();
          if (!mt) return true;
          var cur = S.projectsOfTask(mt.id).filter(function (x) { return x.project.id === el.dataset.project; })[0];
          if (cur && cur.membership.sectionId === el.dataset.section) return true;
          S.moveTask(mt.id, el.dataset.project, el.dataset.section, null);
          var sn = S.section(el.dataset.project, el.dataset.section);
          toast(L('ย้ายไป {s} แล้ว', { s: sn ? sn.name : '' }), L('ย้อนกลับ'), 'undo');
          return true;
        }
        case 'm2a-mt-move': {
          api.closeModal();
          api.closePops();
          var mtT = S.task(el.dataset.id);
          if (!mtT || S.mtSectionOf(mtT) === el.dataset.mtsec) return true;
          if (S.mtMove(mtT.id, el.dataset.mtsec)) {
            var ms = S.mtSection(el.dataset.mtsec);
            toast(L('ย้ายไป {s} แล้ว', { s: ms ? mtSecName(ms) : '' }),
              L('ย้อนกลับ'), 'undo');
          }
          return true;
        }
        case 'm2a-row-menu': {
          /* ปุ่ม ⋯ ท้ายแถวงานของฉัน — เลือกเซกชันได้เลยในเมนู ไม่ต้องเปิดหน้าต่าง */
          var rt = S.task(el.dataset.id);
          if (!rt) return true;
          var mtg = moveTargets(rt.id);
          var rh = '<div class="pop-note strong">' + esc(L('ย้ายไปเซกชัน')) + '</div>' +
            mtSecButtons('m2a-mt-move', rt.id, S.mtSectionOf(rt));
          if (mtg.projects.length) {
            rh += '<div class="pop-sep"></div><button data-act="m2a-move-sec" data-id="' + esc(rt.id) + '">' + I('grid', 14) +
              '<span class="grow">' + esc(L('ย้ายเซกชันในโปรเจกต์…')) + '</span></button>';
          }
          rh += '<div class="pop-sep"></div><button data-act="open-task" data-id="' + esc(rt.id) + '">' + I('arrowRight', 14) +
            '<span class="grow">' + esc(L('เปิดงาน')) + '</span></button>';
          myPop(el, rh);
          return true;
        }
        case 'm2a-bulk-mtsec':
          myPop(el, '<div class="pop-note strong">' + esc(L('ย้าย {n} งานไปเซกชัน', { n: selCount() })) + '</div>' +
            mtSecButtons('m2a-bulk-mtsec-pick', null, null));
          return true;
        case 'm2a-bulk-mtsec-pick': {
          api.closePops();
          var ids = Object.keys(state.sel), sec = el.dataset.mtsec;
          var n = S.batch('ย้าย {n} งาน', { n: ids.length }, function () {
            var c = 0;
            ids.forEach(function (id) { if (S.mtMove(id, sec)) c++; });
            return c;
          });
          toast(n ? L('ย้าย {n} งานแล้ว', { n: n }) : L('ไม่มีงานที่ย้ายได้'), n ? L('ย้อนกลับ') : null, 'undo');
          return true;
        }

        case 'm2a-inbox-menu': {
          var dnd = S.isDnd();
          myPop(el,
            '<button data-act="m2a-inbox-dnd">' + I('moon', 14) + '<span class="grow">' +
              esc(dnd ? L('ห้ามรบกวนอยู่') : L('ห้ามรบกวน')) + '…</span></button>' +
            '<button data-act="inbox-read-all">' + I('check', 14) + '<span class="grow">' + esc(L('อ่านทั้งหมด')) + '</span></button>' +
            '<button data-act="inbox-archive-all">' + I('archive', 14) + '<span class="grow">' + esc(L('เก็บทั้งหมด')) + '</span></button>');
          return true;
        }
        case 'm2a-inbox-dnd': {
          /* ใช้เมนูห้ามรบกวนเดิมของ main.js แต่ให้เกาะปุ่ม ⋯ (ปุ่มเดิมซ่อนอยู่บนมือถือ วางเมนูไม่ได้) */
          api.closePops();
          var more = document.querySelector('.m2a-inbox-more');
          if (!more) return true;
          more.dataset.act = 'dnd-menu';
          more.click();
          more.dataset.act = 'm2a-inbox-menu';
          return true;
        }
        case 'm2a-mt-menu':
          myPop(el, '<button data-act="mt-ics">' + I('download', 14) + '<span class="grow">' +
            esc(L('ส่งออกไปปฏิทิน (.ics)')) + '</span></button>' +
            '<div class="pop-note">' + esc(L('ได้ไฟล์ .ics ของงานที่มีวัน เปิดด้วย Outlook หรือ Google Calendar')) + '</div>');
          return true;

        case 'm2a-wide-x': {
          wideNoteOff = true;
          var wn = $view.querySelector('.m2a-wide-note');
          if (wn) wn.remove();
          return true;
        }
        case 'm2a-ios-x':
          try { global.localStorage.setItem(IOS_KEY, 'off'); } catch (er) { /* โหมดส่วนตัว */ }
          var ih = document.querySelector('.m2a-ios');
          if (ih) ih.remove();
          return true;
      }
      return false;
    });

    /* ====================== iPhone: บอกวิธีติดตั้ง ====================== */

    /* Safari บน iPhone/iPad ไม่มีปุ่ม "ติดตั้งแอป" แบบ Chrome (ไม่มี beforeinstallprompt)
     * วิธีเดียวคือ แชร์ → เพิ่มไปยังหน้าจอโฮม ซึ่งคนส่วนใหญ่ไม่รู้ — บอกครั้งเดียว ปิดแล้วไม่ขึ้นอีก (จำใน localStorage) */
    function iosEligible() {
      var nav = global.navigator, ua = nav.userAgent || '';
      var ios = /iP(hone|od|ad)/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
      var safari = /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Line\//.test(ua);
      var standalone = nav.standalone === true || mq('(display-mode: standalone)');
      if (!ios || !safari || standalone || global.ORBIT_BUILD) return false;
      try { if (global.localStorage.getItem(IOS_KEY) === 'off') return false; } catch (e) { return false; }
      return true;
    }
    var SHARE_IC = '<svg class="ic" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10V1.8M5.2 4.4 8 1.6l2.8 2.8"/>' +
      '<path d="M5.4 6.4H3.6v7.8h8.8V6.4h-1.8"/></svg>';
    function showIosHint() {
      if (document.querySelector('.m2a-ios') || !S.me()) return;
      body.insertAdjacentHTML('beforeend', '<div class="m2a-ios" role="note">' +
        '<div class="grow"><b>' + esc(L('ติดตั้ง Orbit ไว้บนหน้าจอโฮม')) + '</b>' +
        '<span>' + esc(L('แตะ')) + ' ' + SHARE_IC + ' ' + esc(L('แชร์ → เพิ่มไปยังหน้าจอโฮม')) + '</span></div>' +
        '<button class="btn btn-sm" data-act="m2a-ios-x">' + esc(L('เข้าใจแล้ว')) + '</button></div>');
    }
    /* รอให้หน้าแรกขึ้นก่อน และไม่ขึ้นทับหน้าเข้าสู่ระบบ */
    if (iosEligible()) setTimeout(function () { if (!$gate || $gate.hidden) showIosHint(); }, 2500);
    M.showIosHint = showIosHint;           // ทดสอบบนเครื่องที่ไม่ใช่ iPhone: OrbitMobile.showIosHint()

    M.syncBnav = syncBnav;
  });

})(window);

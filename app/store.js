/* Orbit — data layer
 *
 * ทุกอย่างเก็บผ่าน adapter ตัวเดียว (hydrate / persist)
 * เวลาจะย้ายไป server จริง ให้แก้แค่ 2 ฟังก์ชันนั้น UI ไม่ต้องแตะเลย
 */
(function (global) {
  'use strict';

  var L = global.I18N.t;

  var KEY = 'orbit.db.v4';
  var LEGACY_KEYS = ['orbit.db.v3', 'orbit.db.v2', 'orbit.db.v1', 'taskflow.db.v1'];   // ชื่อ/เวอร์ชันเดิม
  /* Sprint 2 — 2B: การแจ้งเตือนรวมกลุ่ม (more) เลื่อนเตือน (snoozeUntil) ชี้ความเห็น (story)
   *            2C: คำตอบใต้รายงานสถานะ (statusLog[].replies) และตัวเลขเทียบรอบก่อน (snap/chg)
   * ทั้งสองเติมค่าเริ่มต้นใน migrate ทุกครั้งที่โหลด จึงใช้เลขรุ่นเดียวกันได้ */
  var SCHEMA = 19;

  /* 4b — ค่าคงที่ที่ migrate() ใช้ (ต้องประกาศก่อน hydrate() ทำงาน) */
  var TIME_CATS_DEFAULT = ['งานลูกค้า', 'งานภายใน', 'ประชุม', 'อบรม'];
  var TS_STATES = [
    { id: 'draft', label: 'ร่าง', color: '#9ca0a8' },
    { id: 'submitted', label: 'รอตรวจ', color: '#f5a623' },
    { id: 'approved', label: 'อนุมัติแล้ว', color: '#37c5ab' },
    { id: 'rejected', label: 'ตีกลับ', color: '#e8384f' }
  ];
  var CAP_DEFAULT = { count: 3, h: 8, pt: 5, pct: 100 };
  var REPORT_MAX = 100, REPORT_W_MAX = 20, AWAY_MAX = 40;
  var ISO_RE = /^\d{4}-\d\d-\d\d$/;

  /* ---------- utilities ---------- */

  function uid(prefix) {
    return (prefix || 'id') + '_' +
      Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  function iso(d) {
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function today() { return iso(new Date()); }

  function addDays(isoStr, n) {
    var d = new Date(isoStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return iso(d);
  }

  function addMonths(isoStr, n) {
    var d = new Date(isoStr + 'T00:00:00');
    var day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return iso(d);
  }

  function daysBetween(a, b) {
    return Math.round(
      (new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- constants ---------- */

  var PRIORITIES = [
    { id: 'urgent', label: 'ด่วนมาก', color: '#e8384f', rank: 0 },
    { id: 'high',   label: 'สูง',      color: '#fd612c', rank: 1 },
    { id: 'medium', label: 'กลาง',    color: '#f5a623', rank: 2 },
    { id: 'low',    label: 'ต่ำ',      color: '#4186e0', rank: 3 },
    { id: 'none',   label: 'ไม่ระบุ',  color: '#9ca0a8', rank: 4 }
  ];

  var TASK_TYPES = [
    { id: 'task',      label: 'งานทั่วไป', icon: '○' },
    { id: 'milestone', label: 'หมุดหมาย',  icon: '◆' },
    { id: 'approval',  label: 'ขออนุมัติ', icon: '✓' }
  ];

  var APPROVAL_STATES = [
    { id: 'pending',  label: 'รออนุมัติ',   color: '#f5a623' },
    { id: 'approved', label: 'อนุมัติแล้ว', color: '#37c5ab' },
    { id: 'changes',  label: 'ขอแก้ไข',     color: '#fd612c' },
    { id: 'rejected', label: 'ไม่อนุมัติ',  color: '#e8384f' }
  ];

  /* ข้อความแจ้งคนขออนุมัติ ต่อท้ายชื่อคนที่กด เช่น "สมชาย อนุมัติ “ป้ายราคา” แล้ว" */
  var APPROVAL_NOTICE = {
    approved: 'อนุมัติ “{t}” แล้ว',
    changes:  'ขอแก้ไข “{t}”',
    rejected: 'ปฏิเสธ “{t}”',
    pending:  'ส่ง “{t}” กลับไปรออนุมัติ'
  };

  /* สถานะโปรเจกต์ — ชุดเดียวกับที่ทีมใช้อยู่บน Asana
   *
   * สี่อันแรกบอกว่า "ตอนนี้เป็นยังไง" ส่วนสองอันท้ายบอกว่า "จบแล้ว" คนละความหมายกัน
   * done = true คือปิดจ๊อบไปแล้ว ไม่ต้องรายงานความคืบหน้าอีก
   * จึงแยกกลุ่มในเมนู ไม่ให้ปนกับสถานะที่ยังเดินอยู่
   */
  var PROJECT_STATES = [
    { id: 'on_track',  label: 'ตามแผน',      color: '#37c5ab' },
    { id: 'at_risk',   label: 'เสี่ยง',       color: '#f5a623' },
    { id: 'off_track', label: 'หลุดแผน',     color: '#e8384f' },
    { id: 'on_hold',   label: 'พักไว้ก่อน',   color: '#4186e0' },
    { id: 'complete',  label: 'เสร็จสมบูรณ์', color: '#37c5ab', done: true },
    { id: 'dropped',   label: 'ยกเลิกแล้ว',   color: '#9ca0a8', done: true }
  ];

  var FIELD_TYPES = [
    { id: 'select', label: 'ตัวเลือกเดียว', icon: 'chevronDown', hasOptions: true },
    { id: 'multi',  label: 'หลายตัวเลือก', icon: 'subtask',      hasOptions: true },
    { id: 'date',   label: 'วันที่',        icon: 'calendar' },
    { id: 'person', label: 'บุคคล',         icon: 'users' },
    { id: 'text',   label: 'ข้อความ',       icon: 'text' },
    { id: 'number', label: 'ตัวเลข',        icon: 'hash' },
    /* 2c — รหัสงานแบบ REQ-12 เลขรันต่อโปรเจกต์ แก้ด้วยมือไม่ได้ ค้นหาและ @อ้างถึงได้ */
    { id: 'id',     label: 'รหัสงาน (ID)',  icon: 'hash', auto: true },
    /* 3c — สูตร (คำนวณเอง แก้ด้วยมือไม่ได้) และอ้างอิงงาน/โปรเจกต์/พอร์ตโฟลิโอ */
    { id: 'formula', label: 'สูตร',        icon: 'bolt', auto: true },
    { id: 'ref',    label: 'อ้างอิง',       icon: 'link' }
  ];

  /* สีของตัวเลือกในฟิลด์ — อ่อนพอที่ตัวอักษรเข้มยังอ่านออก */
  var OPTION_COLORS = ['#e8384f', '#fd612c', '#f5a623', '#37c5ab',
                       '#14aaf5', '#796eff', '#aa62e3', '#e362e3',
                       '#9ca0a8', '#4186e0'];

  /* การทำซ้ำ — after คือ "ทุก N วันหลังทำเสร็จ" นับจากวันที่ติ๊กเสร็จ ไม่ใช่จากกำหนดส่งเดิม
   * งานอย่างรดน้ำต้นไม้หรือเช็กสต็อก ถ้าทำช้าไปสองวัน รอบถัดไปก็ควรเลื่อนตามไปด้วย */
  var RECUR_FREQ = [
    { id: 'daily',   label: 'ทุกวัน' },
    { id: 'weekly',  label: 'ทุกสัปดาห์' },
    { id: 'monthly', label: 'ทุกเดือน' },
    { id: 'yearly',  label: 'ทุกปี' },
    { id: 'after',   label: 'หลังทำเสร็จ' }
  ];

  /* รูปแบบการแสดงฟิลด์ตัวเลข — เก็บค่าเป็นตัวเลขล้วนเสมอ รูปแบบมีผลแค่ตอนแสดง
   * เปลี่ยนรูปแบบทีหลังได้โดยไม่ต้องแปลงค่าที่กรอกไว้แล้ว */
  var NUMBER_FORMATS = [
    { id: 'number',   label: 'ตัวเลข' },
    { id: 'currency', label: 'สกุลเงิน' },
    { id: 'percent',  label: 'เปอร์เซ็นต์' },
    { id: 'unit',     label: 'หน่วยกำหนดเอง' }
  ];
  var CURRENCIES = ['THB', 'USD', 'EUR', 'JPY', 'CNY', 'SGD', 'GBP', 'HKD',
                    'MYR', 'VND', 'KRW', 'AUD', 'INR', 'IDR', 'PHP'];

  var TRASH_DAYS = 30;

  // ชนิดความสัมพันธ์ระหว่างงาน อ้างอิงมาตรฐานเดียวกับ Asana/MS Project
  var DEP_TYPES = [
    { id: "FS", label: "จบ → เริ่ม", hint: "งานก่อนต้องเสร็จ งานนี้จึงเริ่มได้" },
    { id: "SS", label: "เริ่ม → เริ่ม", hint: "เริ่มพร้อมกัน หรือหลังงานก่อนเริ่ม" },
    { id: "FF", label: "จบ → จบ", hint: "จบพร้อมกัน หรือหลังงานก่อนจบ" },
    { id: "SF", label: "เริ่ม → จบ", hint: "งานก่อนเริ่มแล้ว งานนี้จึงจบได้" }
  ];

  var PALETTE = ['#796eff', '#e8384f', '#fd612c', '#f5a623', '#14aaf5',
                 '#4186e0', '#37c5ab', '#aa62e3', '#e362e3', '#ec8d71'];

  /* ---------- schema helper ---------- */

  function blankTask(attrs) {
    attrs = attrs || {};
    return {
      id: attrs.id || uid('t'),
      name: attrs.name || 'งานใหม่',
      notes: attrs.notes || '',
      type: attrs.type || 'task',
      approval: attrs.type === 'approval' ? (attrs.approval || 'pending') : null,
      assigneeId: attrs.assigneeId || null,
      startOn: attrs.startOn || null,
      startTime: attrs.startTime || null,
      dueOn: attrs.dueOn || null,
      dueTime: attrs.dueTime || null,
      priority: attrs.priority || 'none',
      completed: !!attrs.completed,
      completedAt: attrs.completedAt || null,
      completedBy: attrs.completedBy || null,          // Sprint 3 — ใครกดทำเสร็จ (ข้อมูลเก่าเป็น null ไม่เดา)
      slips: attrs.slips || 0,                         // Sprint 3 — จำนวนครั้งที่เลื่อนกำหนดส่งรวดเดียว (ดู slipOverdue) 0 = ไม่เคยเลื่อน
      parentId: attrs.parentId || null,
      tags: attrs.tags || [],
      followers: attrs.followers || (attrs.assigneeId ? [attrs.assigneeId] : []),
      likes: attrs.likes || [],
      dependsOn: attrs.dependsOn || [],
      attachments: attrs.attachments || [],
      recur: attrs.recur || null,
      coverId: attrs.coverId || null,
      estimate: attrs.estimate == null ? null : attrs.estimate,   // 3c — นาทีที่ประมาณ
      time: [],                                                   // 3c — รายการเวลา (สำเนาไม่พาไปด้วย)
      /* 3b — ชนิดงานกำหนดเองของโปรเจกต์ (type ยังเป็นชนิดพื้นฐาน task) และสถานะของชนิดนั้น */
      ctype: attrs.ctype || null,
      cstatus: attrs.cstatus || null,
      createdBy: attrs.createdBy || 'u_me',
      createdAt: attrs.createdAt || today(),
      /* ได้รับมอบหมายเมื่อไร โดยใคร — ตัดสินว่างานไปลง "เพิ่งได้รับมอบหมาย" ในงานของฉัน
       * และควรมีจุดสีฟ้าไหม ทุกทางที่เปลี่ยนผู้รับผิดชอบต้องประทับสองช่องนี้ (ดู stampAssign) */
      assignedAt: attrs.assignedAt || (attrs.assigneeId ? new Date().toISOString() : null),
      assignedBy: attrs.assignedBy ||
        (attrs.assigneeId ? (attrs.createdBy || (db && db.currentUserId) || null) : null)
    };
  }

  /** ประทับเวลาและคนมอบหมาย ใช้ทุกครั้งที่ผู้รับผิดชอบของงานเปลี่ยน */
  function stampAssign(t) {
    t.assignedAt = t.assigneeId ? new Date().toISOString() : null;
    t.assignedBy = t.assigneeId ? db.currentUserId : null;
  }

  /** รองรับข้อมูลเก่าที่ dependsOn เก็บแค่ id */
  function normalizeDeps(list) {
    return (list || []).map(function (d) {
      return (typeof d === "string") ? { id: d, type: "FS" } : d;
    }).filter(function (d) { return d && d.id; });
  }

  /** เดิมตัวเลือกเป็นข้อความล้วน ตอนนี้เก็บสีมาด้วย */
  function normalizeOptions(list) {
    return (list || []).map(function (o, i) {
      if (typeof o === 'string') {
        return { name: o, color: OPTION_COLORS[i % OPTION_COLORS.length] };
      }
      return { name: o.name, color: o.color || OPTION_COLORS[i % OPTION_COLORS.length] };
    }).filter(function (o) { return o.name; });
  }

  /** คำนำหน้ารหัสงาน ตัวอักษรอังกฤษกับตัวเลขเท่านั้น (พิมพ์ @REQ-12 ได้จากทุกแป้นพิมพ์) */
  function cleanPrefix(s) {
    return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'ID';
  }

  /** เติมช่องที่ฟิลด์รุ่นก่อนไม่มี (2c) — คำอธิบาย แจ้งเตือนเมื่อเปลี่ยน คำนำหน้าและเลขถัดไปของรหัสงาน */
  function normalizeFieldDef(f) {
    f.options = normalizeOptions(f.options);
    if (typeof f.desc !== 'string') f.desc = '';
    f.notify = !!f.notify && (f.type === 'select' || f.type === 'multi');
    if (f.type === 'id') {
      f.prefix = cleanPrefix(f.prefix);
      f.next = Math.max(1, parseInt(f.next, 10) || 1);
    }
    if (f.lib !== true) delete f.lib;
    return f;
  }

  /* ---------- seed ---------- */

  function seed() {
    var t = today();

    // ข้อมูลตัวอย่างทั้งหมดเป็นเรื่องสมมติ ไม่ใช่ข้อมูลจริงขององค์กรใด
    var users = [
      { id: 'u_me',   name: L('ฉัน'),    email: 'you@example.com',     color: '#796eff' },
      { id: 'u_nan',  name: L('สมชาย'),  email: 'somchai@example.com', color: '#14aaf5' },
      { id: 'u_ploy', name: L('มานี'),   email: 'manee@example.com',   color: '#37c5ab' },
      { id: 'u_tor',  name: L('ปิติ'),    email: 'piti@example.com',    color: '#f5a623' }
    ];

    var pLaunch = {
      id: 'p_launch', name: L('เปิดตัวสินค้าใหม่'), color: '#796eff', icon: '🚀',
      description: L('ตัวอย่างแผนเปิดตัวสินค้า ทั้งช่องทางออนไลน์และออฟไลน์'),
      archived: false, defaultView: 'list',
      sections: [
        { id: 's_l1', name: 'Backlog' },
        { id: 's_l2', name: L('กำลังทำ') },
        { id: 's_l3', name: L('รอตรวจ') },
        { id: 's_l4', name: L('เสร็จแล้ว') }
      ],
      fields: [
        { id: 'f_channel', name: L('ช่องทาง'), type: 'select',
          options: ['Shopee', 'Lazada', 'TikTok', 'Facebook', L('ออฟไลน์')] },
        { id: 'f_budget', name: L('งบ (บาท)'), type: 'number', options: [] }
      ],
      status: {
        state: 'on_track',
        text: L('งานเตรียมเปิดตัวเดินตามแผน รอผลตรวจข้อความโฆษณารอบสุดท้าย'),
        by: 'u_me', at: new Date().toISOString()       // Sprint 1C — เวลาจริง ไม่ใช่แค่วันที่
      },
      /* Sprint 1C — ป้ายสถานะบนหัวกับประวัติในหน้าภาพรวมต้องพูดตรงกัน */
      statusLog: [{ id: 'ps_seed_launch', state: 'on_track', title: '',
        text: L('งานเตรียมเปิดตัวเดินตามแผน รอผลตรวจข้อความโฆษณารอบสุดท้าย'),
        by: 'u_me', at: new Date().toISOString() }],
      /* ย้ายเข้า "เสร็จแล้ว" = ทำเครื่องหมายเสร็จ (เดิมเป็นกฎแบบเก่า ตอนนี้เป็นอัตโนมัติ 3a) */
      automations: [
        { id: 'au_done', name: '', on: true, chain: false, by: 'u_me', at: t,
          trigger: { type: 'moved', sec: 's_l4' },
          paths: [{ conds: [], acts: [{ type: 'complete', v: true }] }], els: null }
      ],
      autoRuns: [],
      savedViews: []
    };

    var pContent = {
      id: 'p_content', name: 'Content Calendar', color: '#14aaf5', icon: '📅',
      description: L('คอนเทนต์รายเดือนทุกช่องทาง'),
      archived: false, defaultView: 'list',
      sections: [
        { id: 's_c1', name: L('ไอเดีย') },
        { id: 's_c2', name: L('เขียนบท') },
        { id: 's_c3', name: L('ถ่าย/ผลิต') },
        { id: 's_c4', name: L('ลงแล้ว') }
      ],
      fields: [
        { id: 'f_format', name: L('รูปแบบ'), type: 'select',
          options: ['Reels', 'Static', 'Carousel', 'Live'] }
      ],
      status: null, automations: [], autoRuns: [], savedViews: []
    };

    var pOps = {
      id: 'p_ops', name: 'IT & Operations', color: '#37c5ab', icon: '⚙️',
      description: L('งานระบบภายใน'),
      archived: false, defaultView: 'list',
      sections: [
        { id: 's_o1', name: L('ค้างอยู่') },
        { id: 's_o2', name: L('กำลังทำ') },
        { id: 's_o3', name: L('เสร็จแล้ว') }
      ],
      fields: [], status: null, automations: [], autoRuns: [], savedViews: []
    };

    var projects = [pLaunch, pContent, pOps];

    // [name, project, section, assignee, dueOffset, priority, notes, tags, type, startOffset]
    var raw = [
      [L('สรุปแนวทางแบรนด์ให้ทีมดีไซน์'), 'p_launch', 's_l2', 'u_nan', 1, 'high',
        L('ใช้เอกสารแนวทางแบรนด์เป็นตัวตั้ง'), ['branding'], 'task', -3],
      [L('เปิดร้านค้าออนไลน์อย่างเป็นทางการ'), 'p_launch', 's_l2', 'u_ploy', 3, 'urgent',
        L('เตรียมเอกสารจดทะเบียนให้ครบก่อน'), ['ecommerce'], 'task', -1],
      [L('ถ่ายภาพสินค้า 12 รายการ'), 'p_launch', 's_l1', 'u_tor', 7, 'medium', '', ['production'], 'task', 4],
      [L('ทำอาร์ตเวิร์กแพ็กเกจตัวจริง'), 'p_launch', 's_l1', 'u_nan', 10, 'high', '', ['branding'], 'task', 5],
      [L('ตรวจข้อความโฆษณากับฝ่ายกฎหมาย'), 'p_launch', 's_l3', 'u_me', 0, 'urgent',
        L('รอยืนยันรอบสุดท้ายก่อนใช้จริง'), ['legal'], 'approval', -5],
      [L('วางงบสื่อรายไตรมาส'), 'p_launch', 's_l1', 'u_me', 14, 'medium', '', [], 'task', 10],
      [L('สรุปราคาขายและโปรโมชันเปิดตัว'), 'p_launch', 's_l4', 'u_ploy', -3, 'high', '', [], 'task', -8],
      [L('วันเปิดตัวอย่างเป็นทางการ'), 'p_launch', 's_l1', 'u_me', 21, 'urgent', '', [], 'milestone', null],

      [L('คอนเทนต์ให้ความรู้ 8 ตอน'), 'p_content', 's_c2', 'u_nan', 5, 'medium', '', ['education'], 'task', 0],
      [L('สคริปต์คลิปรีวิวจากผู้ใช้จริง'), 'p_content', 's_c1', 'u_ploy', 9, 'low', '', [], 'task', 6],
      [L('ถ่ายคลิปสั้นชุดแรก 4 ตัว'), 'p_content', 's_c3', 'u_tor', 2, 'high', '', ['production'], 'task', 0],
      [L('ตารางลงคอนเทนต์เดือนหน้า'), 'p_content', 's_c1', 'u_me', 6, 'medium', '', [], 'task', 3],

      [L('ตั้งระบบจัดการงานภายใน'), 'p_ops', 's_o2', 'u_me', 0, 'high',
        L('ประเมินว่าทีมใช้งานได้จริงไหม'), ['system'], 'task', -7],
      [L('ต่อระบบล็อกอินขององค์กร'), 'p_ops', 's_o1', 'u_me', 21, 'medium', '', ['system'], 'task', 14],
      [L('สำรองข้อมูลอัตโนมัติรายวัน'), 'p_ops', 's_o1', 'u_tor', 12, 'low', '', ['system'], 'task', 10]
    ];

    var tasks = [], memberships = [], stories = [], fieldValues = [], notifications = [];
    var pos = {}, byName = {};

    raw.forEach(function (r) {
      var done = r[2] === 's_l4' || r[2] === 's_c4' || r[2] === 's_o3';
      var task = blankTask({
        name: r[0], notes: r[6], assigneeId: r[3],
        dueOn: addDays(t, r[4]),
        startOn: r[9] === null ? null : addDays(t, r[9]),
        priority: r[5], completed: done, completedAt: done ? t : null,
        tags: r[7], type: r[8], createdAt: t
      });
      if (task.type === 'milestone') task.startOn = null;
      tasks.push(task);
      byName[r[0]] = task;
      pos[r[2]] = (pos[r[2]] || 0) + 1;
      memberships.push({
        id: uid('m'), taskId: task.id, projectId: r[1],
        sectionId: r[2], position: pos[r[2]]
      });
    });

    // ตัวอย่างงานย่อย
    var parent = byName[L('ถ่ายภาพสินค้า 12 รายการ')];
    [L('จองสตูดิโอ'), L('เตรียม prop และฉาก'), L('รีทัชและส่งไฟล์')].forEach(function (n, i) {
      tasks.push(blankTask({
        name: n, assigneeId: 'u_tor', parentId: parent.id,
        dueOn: addDays(t, 5 + i), completed: i === 0,
        completedAt: i === 0 ? t : null, createdAt: t
      }));
    });

    // งานเดียวอยู่ 2 โปรเจกต์ (multi-homing)
    memberships.push({
      id: uid('m'), taskId: parent.id, projectId: 'p_content',
      sectionId: 's_c3', position: 99
    });

    // ตัวอย่างลำดับก่อนหลัง
    byName[L('ทำอาร์ตเวิร์กแพ็กเกจตัวจริง')].dependsOn = [byName[L('สรุปแนวทางแบรนด์ให้ทีมดีไซน์')].id];
    byName[L('วันเปิดตัวอย่างเป็นทางการ')].dependsOn = [
      byName[L('เปิดร้านค้าออนไลน์อย่างเป็นทางการ')].id,
      byName[L('ตรวจข้อความโฆษณากับฝ่ายกฎหมาย')].id
    ];
    parent.dependsOn = [byName[L('ทำอาร์ตเวิร์กแพ็กเกจตัวจริง')].id];

    // ตัวอย่างงานทำซ้ำ
    byName[L('ตารางลงคอนเทนต์เดือนหน้า')].recur = { freq: 'monthly', interval: 1 };
    byName[L('สำรองข้อมูลอัตโนมัติรายวัน')].recur = { freq: 'weekly', interval: 1 };

    // ตัวอย่างไฟล์แนบและผู้ติดตาม
    byName[L('สรุปแนวทางแบรนด์ให้ทีมดีไซน์')].attachments = [
      { id: uid('a'), name: 'brand-guideline.pdf', url: '' }
    ];
    byName[L('สรุปแนวทางแบรนด์ให้ทีมดีไซน์')].followers = ['u_nan', 'u_me'];
    byName[L('ตรวจข้อความโฆษณากับฝ่ายกฎหมาย')].followers = ['u_me', 'u_ploy'];

    var seedStory = uid('st');
    stories.push({
      id: seedStory, taskId: byName[L('สรุปแนวทางแบรนด์ให้ทีมดีไซน์')].id,
      actorId: 'u_nan', type: 'comment',
      text: L('ขอไฟล์โลโก้เวอร์ชัน vector ด้วยนะครับ @ฉัน'),
      createdAt: new Date().toISOString()
    });
    /* Sprint 2B — เก็บเป็นคีย์ + คนทำ + ความเห็น (เดิมเป็นประโยคสำเร็จรูปตามภาษาตอนสร้างข้อมูลตัวอย่าง
     * สลับเป็นไทยแล้วยังขึ้น "Somchai mentioned you in a comment") */
    notifications.push({
      id: uid('n'), userId: 'u_me',
      taskId: byName[L('สรุปแนวทางแบรนด์ให้ทีมดีไซน์')].id,
      text: L('สมชาย พูดถึงคุณในความเห็น'), key: 'พูดถึงคุณในความเห็น', params: null, kind: 'mention',
      actorId: 'u_nan', actorName: L('สมชาย'), story: seedStory,
      createdAt: new Date().toISOString(), read: false, archived: false
    });

    var shopTask = byName[L('เปิดร้านค้าออนไลน์อย่างเป็นทางการ')];
    fieldValues.push({ taskId: shopTask.id, fieldId: 'f_channel', value: 'Shopee' });
    fieldValues.push({ taskId: shopTask.id, fieldId: 'f_budget', value: 50000 });

    tasks.forEach(function (t) { t.dependsOn = normalizeDeps(t.dependsOn); });
    projects.forEach(function (p) {
      p.fields.forEach(function (f) { f.options = normalizeOptions(f.options); });
    });

    return {
      version: SCHEMA,
      currentUserId: 'u_me',
      settings: { theme: 'auto', lang: null },
      users: users, projects: projects, tasks: tasks,
      memberships: memberships, stories: stories, fieldValues: fieldValues,
      notifications: notifications, taskTemplates: []
    };
  }

  /* ---------- migration ---------- */

  function migrate(d) {
    if (!d || !d.projects || !d.tasks) return seed();
    if (!d.version || d.version < 2) {
      d.settings = d.settings || { theme: 'auto', lang: null };
      d.notifications = d.notifications || [];
      d.taskTemplates = d.taskTemplates || [];
      d.projects.forEach(function (p) {
        if (!('status' in p)) p.status = null;
        p.savedViews = p.savedViews || [];
        p.colWidths = p.colWidths || {};
      });
      d.tasks.forEach(function (t) {
        if (!t.type) t.type = 'task';
        if (!('approval' in t)) t.approval = null;
        if (!('startOn' in t)) t.startOn = null;
        if (!('dueTime' in t)) t.dueTime = null;
        t.likes = t.likes || [];
        t.dependsOn = t.dependsOn || [];
        t.attachments = t.attachments || [];
        t.followers = t.followers || [];
        if (!('recur' in t)) t.recur = null;
      });
      d.version = 2;
    }
    if (!('lang' in (d.settings || {}))) d.settings.lang = null;
    d.projects.forEach(function (p) { p.colWidths = p.colWidths || {}; });
    if (d.version < 4) {
      d.projects.forEach(function (p) {
        (p.fields || []).forEach(function (f) { f.options = normalizeOptions(f.options); });
      });
    }
    /* เดิม dependsOn เก็บแค่ id ตอนนี้เก็บชนิดความสัมพันธ์มาด้วย
     *
     * ทำทุกครั้งโดยไม่ดูเลขรุ่น เพราะไฟล์ที่คนส่งมาให้กู้คืนอาจมีเลขรุ่นใหม่
     * แต่ข้อมูลข้างในเก่า ถ้าข้ามขั้นนี้ ลำดับก่อนหลังจะเป็นสตริงเปล่าที่อ่าน .id ไม่ได้
     * แล้วทั้งระบบจะมองว่างานไม่มีลำดับเลย โดยไม่มีข้อความเตือนอะไร */
    d.tasks.forEach(function (t) { t.dependsOn = normalizeDeps(t.dependsOn); });
    /* v5 — บทบาทและเวลาเข้าใช้ล่าสุด สำหรับหน้าผู้ดูแล
     * ผู้ใช้ตัวอย่างจากข้อมูลตั้งต้นจะไม่มี lastSeenAt เลย
     * จึงใช้ฟิลด์นี้แยกคนที่ล็อกอินจริงออกจากคนสมมติได้ */
    d.users.forEach(function (u) {
      if (!u.role) u.role = 'member';
      if (!('lastSeenAt' in u)) u.lastSeenAt = null;
    });
    d.audit = d.audit || [];
    d.projectMembers = d.projectMembers || [];
    d.portfolios = d.portfolios || [];
    d.portfolios.forEach(function (f) {
      f.projectIds = f.projectIds || [];
      if (!('status' in f)) f.status = null;
      f.statusLog = f.statusLog || [];
    });
    d.projects.forEach(function (p) {
      if (!p.visibility) p.visibility = 'org';   // ของเดิมทุกโปรเจกต์เปิดให้ทุกคน
      if (!('locked' in p)) p.locked = false;
      if (!('baseline' in p)) p.baseline = null; // เส้นฐานของ Gantt ยังไม่เคยตั้ง
      if (!('owner' in p)) p.owner = null;
      if (!('dueOn' in p)) p.dueOn = null;
      if (!p.depShift) p.depShift = { mode: 'consume', scope: 'downstream' };
      if (!p.workDays) p.workDays = 'all';
      if (!('views' in p)) p.views = null;   // null = เปิดครบทุกมุมมอง
      if (!('startOn' in p)) p.startOn = null;   // Sprint 1C — วันเริ่มโปรเจกต์ (ไม่ต้องเพิ่มเลขรุ่น เติมทุกครั้งที่โหลด)
      p.statusLog = p.statusLog || [];
      /* Sprint 1C — มีสถานะ (ป้ายบนหัวขึ้น "ตามแผน") แต่ไม่มีประวัติเลย
       * หน้าภาพรวมกับวิดเจ็ตหน้าแรกอ่านจากประวัติ จึงบอกว่า "ยังไม่เคยรายงาน" ขัดกับป้ายบนหัว
       * ผู้บริหารเห็นสองที่พูดไม่ตรงกันแล้วเลิกเชื่อตัวเลขทั้งหน้า
       * เติมรายการแรกของประวัติจากสถานะที่ตั้งไว้ รหัสคงที่ สองเครื่องโหลดพร้อมกันจะได้ไม่ซ้ำกัน */
      if (p.status && p.status.state && !p.statusLog.length) {
        p.statusLog.push({ id: 'ps_mig_' + p.id, state: p.status.state, title: p.status.title || '',
          text: p.status.text || '', by: p.status.by || null, at: p.status.at || null });
      }
      p.messages = p.messages || [];         // ประกาศของโปรเจกต์ ไม่ผูกกับงานชิ้นไหน
      (p.savedViews || []).forEach(function (v) { v.view = fillView(v.view); });
    });
    d.users.forEach(function (u) {
      if (!('active' in u)) u.active = true;      // ปิดใช้งานได้โดยไม่ต้องลบทิ้ง
      if (!('authBy' in u)) u.authBy = null;      // microsoft | password | null (ยังไม่เคยเข้า)
      if (!('title' in u)) u.title = '';          // ตำแหน่งงาน คนกรอกเอง ไม่ได้ดึงจาก Graph
      if (!('dept' in u)) u.dept = '';
      if (!('about' in u)) u.about = '';
      if (!('pronouns' in u)) u.pronouns = '';    // คำสรรพนามที่เจ้าตัวอยากให้ใช้
      if (!('photo' in u)) u.photo = null;        // data URI ย่อแล้ว ดูหมายเหตุที่ setPhoto
      if (!('away' in u)) u.away = null;          // { until, note } ตอนไม่อยู่
      u.prefs = u.prefs || {};
    });
    /* ธีมกับภาษาเคยเก็บรวมไว้ที่ db.settings ซึ่งเป็นของทั้งฐานข้อมูล
     * พอเข้าโหมดทีม คนหนึ่งเปลี่ยนเป็นธีมมืดแล้วทุกคนมืดตาม
     * ย้ายมาเป็นของแต่ละคน แล้วยกค่าเดิมมาให้คนที่ใช้อยู่ตอนนี้ */
    if (d.settings && (d.settings.theme || d.settings.lang)) {
      var meNow = d.users.filter(function (u) { return u.id === d.currentUserId; })[0];
      if (meNow) {
        if (d.settings.theme && !meNow.prefs.theme) meNow.prefs.theme = d.settings.theme;
        if (d.settings.lang && !meNow.prefs.lang) meNow.prefs.lang = d.settings.lang;
      }
    }
    /* v7 — ความเห็นตอบกลับเป็นเธรด แก้ไข ลบ และปักหมุดได้
     *   parentId  ความเห็นแม่ (ตอบได้ชั้นเดียว)   editedAt  เวลาแก้ล่าสุด
     *   pinned    ปักไว้บนสุดของแท็บความเห็น      deleted   ลบแล้วแต่ยังมีคนตอบอยู่ใต้มัน
     * ใส่ค่าเริ่มต้นให้ความเห็นเก่าทุกอัน โค้ดหน้าจอจะได้ไม่ต้องเดาว่าช่องไหนมีหรือไม่มี */
    (d.stories || []).forEach(function (s) {
      if (s.type !== 'comment') return;
      if (!('parentId' in s)) s.parentId = null;
      if (!('editedAt' in s)) s.editedAt = null;
      if (!('pinned' in s)) s.pinned = false;
      if (!('deleted' in s)) s.deleted = false;
    });
    /* v8 — เวลาเริ่ม การทำซ้ำแบบใหม่ รูปแบบฟิลด์ตัวเลข และถังขยะ
     *   startTime  เวลาเริ่มคู่กับวันเริ่ม (HH:MM)       recur.days  วันในสัปดาห์ที่ทำซ้ำ (0 = อาทิตย์)
     *   field.format  { kind, currency, unit, decimals } ของฟิลด์ตัวเลข  null = ตัวเลขธรรมดา
     *   trash  ของที่ถูกลบ เก็บไว้กู้คืนได้ 30 วัน */
    d.tasks.forEach(function (t) {
      if (!('startTime' in t)) t.startTime = null;
      if (t.recur) {
        if (!t.recur.freq) t.recur = null;
        else {
          t.recur.interval = Math.max(1, parseInt(t.recur.interval, 10) || 1);
          t.recur.days = Array.isArray(t.recur.days) ? t.recur.days : [];
        }
      }
    });
    d.projects.forEach(function (p) {
      (p.fields || []).forEach(function (f) {
        if (f.type === 'number' && !('format' in f)) f.format = null;
      });
    });
    d.trash = purgeOldTrash(d.trash || []);
    /* v9 — งานของฉันแบบมีเซกชัน กล่องแจ้งเตือนแบบบุ๊กมาร์ก หน้าแรกที่จัดเองได้
     *   task.assignedAt / assignedBy   ได้รับมอบหมายเมื่อไร โดยใคร (งานเก่า = null ถือว่าเห็นแล้ว)
     *   notification.bookmarked / actorId
     *   personal[userId]  ของส่วนตัวแต่ละคน เก็บในข้อมูลกลางเพื่อให้ตามไปทุกเครื่อง
     *                     เก็บแต่รหัส ไม่คัดลอกตัวงาน ดู personalOf() */
    d.tasks.forEach(function (t) {
      if (!('assignedAt' in t)) t.assignedAt = null;
      if (!('assignedBy' in t)) t.assignedBy = null;
    });
    (d.notifications || []).forEach(function (n) {
      if (!('bookmarked' in n)) n.bookmarked = false;
      if (!('actorId' in n)) n.actorId = null;
    });
    d.personal = (d.personal && typeof d.personal === 'object' && !Array.isArray(d.personal))
      ? d.personal : {};
    /* v10 — มุมมองของโปรเจกต์ (ชิ้นงาน 2b)
     *   task.coverId        ไฟล์แนบรูปที่ตั้งเป็นรูปปกของการ์ดบอร์ด
     *   project.defaultTab  แท็บมุมมองที่บันทึกไว้ซึ่งเปิดเป็นค่าเริ่มต้น (null = project.defaultView)
     *   savedViews[]        { id, name, icon, kind, view } — kind ใหม่ (เดิมไม่รู้ว่าบันทึกจากมุมมองไหน
     *                       เดาจากค่าของ Gantt ที่ต่างจากค่าเริ่มต้น) และ view เก็บเฉพาะคีย์ที่ต่างจากค่าเริ่มต้น
     *                       ตัวกรองสี่ช่องแบบเดิมกลายเป็นเงื่อนไขของตัวสร้างตัวกรอง (fillView)
     *   personal.pv[pid]    มุมมองที่ทำงานอยู่ของแต่ละคน   personal.cal  ตั้งค่าปฏิทินรวม */
    d.tasks.forEach(function (t) {
      if (!('coverId' in t)) t.coverId = null;
      if (t.coverId && !(t.attachments || []).some(function (a) { return a.id === t.coverId; })) t.coverId = null;
    });
    d.projects.forEach(function (p) {
      if (!('defaultTab' in p)) p.defaultTab = null;
      p.savedViews = (p.savedViews || []).filter(function (v) { return v && v.id; }).map(function (v) {
        var full = fillView(v.view || {});
        if (SV_KINDS.indexOf(v.kind) < 0) {
          v.kind = (full.gZoom !== 'month' || full.gColorBy !== 'theme' || full.gShowBaseline ||
            full.gSubtasks === 'expanded') ? 'gantt' : 'list';
        }
        if (!v.name) v.name = 'มุมมอง';
        if (!v.icon) v.icon = '📊';
        v.view = viewDiff(full);
        return v;
      });
      if (p.defaultTab && !p.savedViews.some(function (v) { return v.id === p.defaultTab; })) p.defaultTab = null;
    });
    /* v11 — ค้นหา ฟิลด์ และงานดูแลโปรเจกต์ (ชิ้นงาน 2c)
     *   fieldLib[]           ฟิลด์ขององค์กร { id, name, type, options, format, desc, notify }
     *                        โปรเจกต์ที่ใช้เก็บสำเนาในชื่อเดิม (id เดียวกัน) พร้อม lib: true
     *                        แก้ที่คลังแล้วสำเนาทุกโปรเจกต์เปลี่ยนตาม ค่าที่กรอกเป็นค่าเดียวกันทุกโปรเจกต์
     *   field.desc / notify  คำอธิบายฟิลด์ และแจ้งผู้ติดตามเมื่อค่าเปลี่ยน (ฟิลด์ตัวเลือก)
     *   field (type id)      prefix + next เลขถัดไปของโปรเจกต์นั้น ค่าในงานเป็นตัวเลขล้วน
     *   project.roles        { userId: 'บทบาทที่พิมพ์เอง' }
     *   project.accessRequests [{ userId, taskId, at }] คำขอเข้าโปรเจกต์ปิดที่ยังไม่ได้ตอบ
     *   personal.searches    การค้นหาที่บันทึกไว้ของแต่ละคน */
    d.fieldLib = Array.isArray(d.fieldLib) ? d.fieldLib.filter(function (f) { return f && f.id; }) : [];
    d.fieldLib.forEach(function (f) { normalizeFieldDef(f); delete f.lib; });
    d.projects.forEach(function (p) {
      (p.fields || []).forEach(function (f) { normalizeFieldDef(f); });
      if (!p.roles || typeof p.roles !== 'object' || Array.isArray(p.roles)) p.roles = {};
      p.accessRequests = Array.isArray(p.accessRequests) ? p.accessRequests : [];
    });
    /* v12 — อัตโนมัติ (ชิ้นงาน 3a) แทนกฎแบบเดิม
     *   project.automations [{ id, name, on, chain, by, at, trigger: { type, … },
     *                         paths: [{ conds: [{f, op, v}], acts: [{ type, … }] }], els: [acts] | null }]
     *   project.autoRuns    ประวัติการรัน 200 ครั้งล่าสุด [{ at, a, an, t, tn, s, n, e, ep, by }]
     *   personal.auto / autoRuns  อัตโนมัติของงานของฉัน (ย้ายเซกชันของตัวเอง)
     *   autoFired           { คีย์: วันที่ } กันอัตโนมัติตามเวลารันซ้ำ (รหัสอัตโนมัติ + งาน + วัน) เก็บ 60 วัน
     * กฎเดิม { whenSection, setCompleted, setAssignee, setPriority, addTag } กลายเป็น
     * อัตโนมัติ "ย้ายเข้าคอลัมน์" หนึ่งเส้นทางที่ไม่มีเงื่อนไข แล้วลบ p.rules ทิ้ง */
    d.projects.forEach(function (p) {
      p.automations = Array.isArray(p.automations) ? p.automations.filter(function (a) { return a && a.id; }) : [];
      (p.rules || []).forEach(function (r) {
        if (!r || !r.whenSection) return;
        var acts = [];
        if (r.setCompleted) acts.push({ type: 'complete', v: true });
        if (r.setAssignee) acts.push({ type: 'assign', mode: 'user', user: r.setAssignee });
        if (r.setPriority) acts.push({ type: 'priority', v: r.setPriority });
        if (r.addTag) acts.push({ type: 'tag', tag: r.addTag });
        if (!acts.length) return;
        p.automations.push({ id: r.id ? 'au_' + String(r.id).replace(/^r_/, '') : uid('au'), name: '', on: true,
          chain: false, by: null, at: null, trigger: { type: 'moved', sec: r.whenSection },
          paths: [{ conds: [], acts: acts }], els: null });
      });
      delete p.rules;
      p.automations.forEach(normalizeAuto);
      p.autoRuns = Array.isArray(p.autoRuns) ? p.autoRuns.slice(-AUTO_RUNS_MAX) : [];
    });
    d.autoFired = pruneFired(d.autoFired);
    /* v13 — ฟอร์ม ชนิดงานกำหนดเอง เทมเพลตโปรเจกต์ เทมเพลตงานรายโปรเจกต์ รายงานสถานะแบบบล็อก (ชิ้นงาน 3b)
     *   project.forms[]        { id, name, desc, on, items: [{ id, kind, label, help, req, opts, map, cond }],
     *                            sec, titleQ, assignee, copy, follow, confirm, again, n, last, by, at }
     *   project.types[]        { id, name, icon, base, statuses: [{ id, name, color, done }] }  defaultType
     *   task.ctype / cstatus   ชนิดงานกำหนดเองและสถานะ (type ยังเป็นชนิดพื้นฐาน)
     *   project.taskTemplates[] / db.taskTemplates[]  { id, name, by, at, t: { name, notes, type, ctype, prio,
     *                            assignee, followers, tags, fields, due, start, subs } } — แบบเดิม (payload) แปลงที่นี่
     *   db.projectTemplates[]  { id, name, desc, icon, color, by, at, editors, users, org, skipWeekends, data }
     *   project.statusLayout   บล็อกและไฮไลต์ที่ใช้ครั้งล่าสุด  statusRemind / remindKey / remindTask เตือนวันศุกร์
     *   statusLog[].title / blocks / hl   db.statusTemplates[] */
    d.tasks.forEach(function (t) {
      if (!('ctype' in t)) t.ctype = null;
      if (!('cstatus' in t)) t.cstatus = null;
    });
    d.taskTemplates = (Array.isArray(d.taskTemplates) ? d.taskTemplates : []).map(upgradeTaskTemplate).filter(Boolean);
    d.projectTemplates = Array.isArray(d.projectTemplates) ? d.projectTemplates.filter(function (x) { return x && x.id && x.data; }) : [];
    d.projectTemplates.forEach(function (x) {
      x.editors = Array.isArray(x.editors) ? x.editors : (x.by ? [x.by] : []);
      x.users = Array.isArray(x.users) ? x.users : [];
      x.org = x.org !== false;
      x.skipWeekends = !!x.skipWeekends;
    });
    d.statusTemplates = Array.isArray(d.statusTemplates) ? d.statusTemplates.filter(function (x) { return x && x.id; }) : [];
    d.projects.forEach(function (p) {
      p.forms = Array.isArray(p.forms) ? p.forms.filter(function (f) { return f && f.id; }) : [];
      p.forms.forEach(normalizeForm);
      p.types = Array.isArray(p.types) ? p.types.filter(function (x) { return x && x.id; }) : [];
      p.types.forEach(normalizeType);
      if (typeof p.defaultType !== 'string') p.defaultType = '';
      p.taskTemplates = (Array.isArray(p.taskTemplates) ? p.taskTemplates : []).map(upgradeTaskTemplate).filter(Boolean);
      if (!('statusLayout' in p)) p.statusLayout = null;
      p.statusRemind = !!p.statusRemind;
      if (!('remindKey' in p)) p.remindKey = null;
      if (!('remindTask' in p)) p.remindTask = null;
    });
    migrate3c(d);
    migrate4a(d);
    migrate4b(d);
    /* Sprint 1B (SCHEMA 18) — ถังขยะมีชนิด comment เพิ่ม และคำขอสิทธิ์เข้าโปรเจกต์ไม่ผูกกับงานแล้ว
     * ({ userId, at, note } — คำขอแบบเก่าที่มี taskId ยังใช้ได้เหมือนเดิม) */
    d.trash = (d.trash || []).filter(function (x) {
      return !!x && (x.kind !== 'comment' || !!(x.data && x.data.story && x.data.taskId));
    });
    d.projects.forEach(function (p) {
      p.accessRequests = (Array.isArray(p.accessRequests) ? p.accessRequests : []).filter(function (r) { return r && r.userId; });
      p.accessRequests.forEach(function (r) { if (!('note' in r)) r.note = null; });
    });
    migrate2b(d);
    prunePersonal(d);
    /* Sprint 2C (SCHEMA 19) — ผู้บริหารถาม/ตอบใต้รายงานสถานะได้ เก็บคำตอบติดไว้กับรายงานนั้นเลย
     * (replies: [{ id, by, at, body }]) ไม่แยกเป็นตารางใหม่ ข้อมูลกลางเป็นก้อนเดียวจึงต้องเล็ก
     * รายงานเก่าไม่มี snap/chg (ตัวเลข ณ ตอนรายงานและที่เปลี่ยนจากรอบก่อน) ปล่อยว่างไว้ หน้าจอบอกได้แค่สถานะที่เปลี่ยน */
    var fixReplies = function (host) {
      (host.statusLog || []).forEach(function (e) {
        if (!e) return;
        e.replies = Array.isArray(e.replies) ? e.replies.filter(function (r) { return r && r.id && r.by; }) : [];
      });
    };
    d.projects.forEach(fixReplies);
    (d.portfolios || []).forEach(fixReplies);
    /* Sprint 1C ตั้งกำหนดส่งรอบแรกให้ตอนตั้งทำซ้ำ (firstRecurDate) แต่งานทำซ้ำจากข้อมูลเก่าที่ไม่มีกำหนดส่ง
     * ยังไม่โผล่ในปฏิทินจนกว่าจะมีคนไปแก้ — ให้วันครบกำหนดรอบแรกตอนโหลด เฉพาะงานที่ยังไม่เสร็จ (ทำครั้งเดียว มีวันแล้วไม่แตะอีก) */
    d.tasks.forEach(function (t) {
      if (t && t.recur && t.recur.freq && !t.dueOn && !t.completed) {
        try { t.dueOn = firstRecurDate(t.recur, t.startOn); } catch (e) { /* รูปแบบทำซ้ำเพี้ยน ปล่อยไว้เหมือนเดิม */ }
      }
    });
    if (!d.users.some(function (u) { return u.role === 'admin'; })) {
      var firstUser = d.users.filter(function (u) { return u.id === d.currentUserId; })[0] || d.users[0];
      if (firstUser) firstUser.role = 'admin';
    }
    d.version = SCHEMA;
    return d;
  }

  /* ---------- persistence adapter ---------- */

  var db = null;

  var storage = (function () {
    try {
      var probe = '__orbit_probe__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      return {
        kind: 'local',
        get: function () { return global.localStorage.getItem(KEY); },
        set: function (v) { global.localStorage.setItem(KEY, v); }
      };
    } catch (e) {
      var mem = null;
      return {
        kind: 'memory',
        get: function () { return mem; },
        set: function (v) { mem = v; }
      };
    }
  })();

  function readLegacy() {
    if (storage.kind !== 'local') return null;
    for (var i = 0; i < LEGACY_KEYS.length; i++) {
      try {
        var v = global.localStorage.getItem(LEGACY_KEYS[i]);
        if (v) return v;
      } catch (e) { /* อ่านไม่ได้ก็ข้าม */ }
    }
    return null;
  }

  function hydrate() {
    try {
      var raw = storage.get() || readLegacy();
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) {
      console.warn('อ่านข้อมูลเดิมไม่สำเร็จ ใช้ข้อมูลตั้งต้นแทน', e);
    }
    return migrate(seed());   // ให้ข้อมูลตั้งต้นผ่านตัวเติมค่าเริ่มต้นชุดเดียวกับข้อมูลเก่า
  }

  /* โหมดทีม: main จะเสียบฟังก์ชันส่งขึ้นส่วนกลางไว้ตรงนี้
   * localStorage ยังเขียนอยู่เสมอ ใช้เป็นสำเนากันเน็ตหลุด */
  var remoteSave = null;
  var suppressRemote = false;

  function setRemoteSave(fn) { remoteSave = fn; }

  /** แทนข้อมูลทั้งก้อนด้วยของจากส่วนกลาง โดยไม่ส่งกลับขึ้นไปอีก */
  function replaceDb(obj) {
    autoQueue.length = 0;
    suppressRemote = true;
    db = migrate(obj);
    dropIndex();
    commit();
    suppressRemote = false;
    // บอกชั้นหน้าจอให้วาดใหม่ ไม่งั้นจอค้างอยู่ที่ข้อมูลชุดเก่า
    try { window.dispatchEvent(new CustomEvent('orbit:replaced')); } catch (e) {}
  }

  function snapshotJSON() { return JSON.stringify(db); }

  /* ล้างสำเนาในเครื่องทิ้ง ใช้ตอนออกจากระบบในโหมดทีม
   *
   * ในโหมดทีม ของจริงอยู่ที่ส่วนกลางแล้ว สำเนาในเบราว์เซอร์เป็นแค่แคช
   * ถ้าไม่ลบ คนถัดไปที่เปิดแอปบนเครื่องเดียวกันจะเห็นงานทั้งทีมโดยไม่ต้องล็อกอิน
   * ประวัติย้อนกลับก็ถือข้อมูลชุดเดียวกันไว้ ต้องล้างด้วย */
  function wipeLocal() {
    undoStack.length = 0;
    suppressRemote = true;
    db = migrate(seed());
    dropIndex();
    commit();
    suppressRemote = false;
  }

  /* ---------- สถานะการบันทึกลงเครื่อง ----------
   *
   * เดิมบันทึกไม่ลงแล้วขึ้นข้อความลอยแค่แวบเดียว
   * ซึ่งแย่กว่าไม่บอกเลย เพราะคนทำงานต่อไปเรื่อย ๆ โดยเชื่อว่างานถูกเก็บแล้ว
   * กว่าจะรู้ตัวคือตอนรีเฟรชหน้าแล้วงานหายทั้งวัน
   * จึงเก็บเป็นสถานะค้างไว้ ให้หน้าจอขึ้นป้ายเตือนจนกว่าจะบันทึกได้อีกครั้ง
   */
  var saveError = null;
  function saveError_() { return saveError; }

  function persist() {
    try {
      storage.set(JSON.stringify(db));
      saveError = null;
    } catch (e) {
      console.error('บันทึกไม่สำเร็จ', e);
      /* เต็มจริง ๆ กับพังด้วยเหตุอื่น ต้องบอกคนละอย่าง
       * เพราะทางแก้ต่างกัน อันหนึ่งต้องลดของ อีกอันต้องเปลี่ยนเบราว์เซอร์ */
      saveError = {
        kind: /quota|exceed/i.test(e.name + ' ' + e.message) ? 'full' : 'other',
        at: new Date().toISOString(),
        bytes: JSON.stringify(db).length
      };
    }
    if (remoteSave && !suppressRemote) remoteSave();
  }

  var listeners = [];
  function onChange(fn) { listeners.push(fn); }

  /* ---------- ชุดคำสั่ง (2c) ----------
   * แก้หลายงานพร้อมกันผ่านฟังก์ชันเดิมที่ต่างคน snapshot/commit เอง
   * ครอบด้วย batch แล้วจะได้จุดย้อนกลับเดียว และบันทึก/วาดใหม่ครั้งเดียวตอนจบ */
  var batchDepth = 0;
  var autoQueue = [];          // 3a — เหตุการณ์ที่รอให้อัตโนมัติตรวจ (ดู autoFire / drainAuto)
  var autoDraining = false;
  var autoCtx = null;          // อัตโนมัติที่กำลังรันอยู่ { depth, a, p, t, ev } — null = คนกดเอง
  function batch(label, params, fn) {
    snapshot(label, params);
    batchDepth++;
    var out;
    try { out = fn(); } finally { batchDepth--; }
    commit();
    return out;
  }
  /** เหมือน batch แต่ไม่เก็บจุดย้อนกลับ — ใช้กับอัตโนมัติตามเวลาที่ไม่ได้เกิดจากการกดของใคร */
  function quietBatch(fn) {
    batchDepth++;
    var out;
    try { out = fn(); } finally { batchDepth--; }
    commit();
    return out;
  }
  function commit() {
    dropIndex();          // ข้อมูลเปลี่ยนแล้ว ดัชนีเก่าใช้ไม่ได้
    if (batchDepth) return;            // อยู่ในชุดคำสั่งเดียวกัน (batch) — บันทึกครั้งเดียวตอนจบ
    /* 3a — อัตโนมัติที่ถูกปลุกระหว่างการแก้ครั้งนี้รันตรงนี้ ก่อนบันทึก
     * การกระทำของอัตโนมัติจึงอยู่ในจุดย้อนกลับเดียวกับสิ่งที่ผู้ใช้ทำ และบันทึก/วาดใหม่ครั้งเดียว */
    if (autoQueue.length && !autoDraining && !suppressRemote) drainAuto();
    /* รหัสงานเลขรันให้งานใหม่ในโปรเจกต์ที่มีฟิลด์ ID ก่อนบันทึก — ทุกทางที่งานเข้าโปรเจกต์
     * (สร้าง นำเข้า ย้าย ทำซ้ำ คัดลอก) จึงได้เลขเองโดยไม่ต้องไล่แก้ทีละที่
     * ข้อมูลที่มาจากส่วนกลาง (replaceDb) ไม่แตะ เครื่องที่สร้างงานเป็นคนออกเลขเอง */
    if (db && !suppressRemote && assignIds()) dropIndex();
    persist();
    listeners.forEach(function (fn) { fn(); });
  }


  /* ---------- บันทึกการทำงาน ----------
   *
   * แยกเป็นสองชั้นโดยตั้งใจ เพราะตอบคำถามคนละแบบ
   *
   *   stories  — งานชิ้นนี้เปลี่ยนอะไรไปบ้าง อยู่ในหน้ารายละเอียดงาน
   *   audit    — ใครทำอะไรกับระบบ อยู่ในหน้าผู้ดูแล
   *
   * ที่ไม่เอาการแก้งานทุกครั้งมาลง audit เพราะจะท่วมจนหาของสำคัญไม่เจอ
   * audit เก็บเฉพาะเรื่องที่ต้องตอบได้ตอนมีคนถามย้อนหลัง
   * เช่น ใครเปลี่ยนสิทธิ์ใคร ใครลบโปรเจกต์ ใครถูกปิดบัญชีเมื่อไหร่
   */
  var AUDIT_MAX = 2000;    // เก็บเท่าที่จำเป็น ไม่ให้ไฟล์บวมไม่มีที่สิ้นสุด

  /**
   * @param detail       คีย์คำแปล ไม่ใช่ประโยคสำเร็จรูป จะได้อ่านได้ทั้งสองภาษา
   * @param detailParams ค่าแทนที่ในคีย์
   */
  function audit(action, target, detail, detailParams) {
    if (!db.audit) db.audit = [];
    db.audit.push({
      id: uid('a'),
      at: new Date().toISOString(),
      actorId: db.currentUserId,
      action: action,                       // เช่น user.role, project.delete
      target: target || null,               // ชื่อหรือรหัสของสิ่งที่ถูกกระทำ
      detail: detail || null,
      detailParams: detailParams || null
    });
    if (db.audit.length > AUDIT_MAX) {
      db.audit = db.audit.slice(-AUDIT_MAX);
    }
  }

  /** รายการบันทึกล่าสุด กรองได้ตามหมวดและตามคน */
  function auditLog(opts) {
    opts = opts || {};
    var rows = (db.audit || []).slice().reverse();
    if (opts.group) {
      rows = rows.filter(function (r) { return r.action.split('.')[0] === opts.group; });
    }
    if (opts.actorId) {
      rows = rows.filter(function (r) { return r.actorId === opts.actorId; });
    }
    if (opts.q) {
      var q = String(opts.q).toLowerCase();
      rows = rows.filter(function (r) {
        return (r.target || '').toLowerCase().indexOf(q) >= 0 ||
               (r.detail || '').toLowerCase().indexOf(q) >= 0 ||
               r.action.toLowerCase().indexOf(q) >= 0;
      });
    }
    return rows.slice(0, opts.limit || 200);
  }

  function auditGroups() {
    var seen = {};
    (db.audit || []).forEach(function (r) { seen[r.action.split('.')[0]] = true; });
    return Object.keys(seen).sort();
  }

  /** ส่งออกเป็น CSV ให้ผู้ตรวจสอบเอาไปเปิดใน Excel ได้ */
  function auditCsv() {
    var head = ['เวลา', 'ผู้ทำ', 'อีเมล', 'การกระทำ', 'เป้าหมาย', 'รายละเอียด'];
    var lines = [head.join(',')];
    (db.audit || []).slice().reverse().forEach(function (r) {
      var u = user(r.actorId);
      lines.push([
        r.at, u ? u.name : '?', u ? u.email : '',
        r.action, r.target || '', r.detail || ''
      ].map(csvCell).join(','));
    });
    return '\uFEFF' + lines.join('\r\n');   // BOM เพื่อให้ Excel อ่านภาษาไทยถูก
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* ---------- ส่งออก / นำเข้างานเป็น CSV ----------
   *
   * หัวคอลัมน์ใช้ชื่อเดียวกับที่ Asana ส่งออก คนที่ย้ายมาจึงเอาไฟล์จาก Asana
   * มาเข้าที่นี่ได้เลยโดยไม่ต้องแก้หัวตาราง และไฟล์ที่ออกจากที่นี่ก็กลับเข้า Asana ได้
   */
  var CSV_COLS = [
    'Task ID', 'Name', 'Section/Column', 'Assignee', 'Assignee Email',
    'Start Date', 'Due Date', 'Priority', 'Type', 'Completed At',
    'Tags', 'Blocked By', 'Notes'
  ];

  function projectCsv(projectId) {
    var p = project(projectId);
    if (!p) return '';
    var secName = {};
    p.sections.forEach(function (s) { secName[s.id] = s.name; });

    /* ฟิลด์ที่สร้างเองต่อท้ายหัวตาราง ตัวเลขออกมาตามรูปแบบที่ตั้งไว้ (เช่น ฿1,250.00)
     * เพราะไฟล์นี้มีไว้ให้คนเปิดอ่านใน Excel ไม่ใช่ให้เครื่องคำนวณต่อ */
    var fields = p.fields || [];
    function cellText(t, f) { return fieldText(f, fieldValue(t.id, f.id)); }
    var lines = [CSV_COLS.concat(fields.map(function (f) { return f.name; }))
      .map(csvCell).join(',')];
    tasksInProject(projectId).forEach(function (x) {
      var t = x.task;
      var u = user(t.assigneeId);
      var blockers = (t.dependsOn || []).map(function (d) {
        var b = task(d.id);
        return b ? b.name + ' (' + (d.type || 'FS') + ')' : '';
      }).filter(Boolean).join(' · ');
      lines.push([
        t.id, t.name, secName[x.membership.sectionId] || '',
        u ? u.name : '', u ? u.email : '',
        t.startOn || '', t.dueOn || '',
        t.priority === 'none' ? '' : t.priority,
        t.type, t.completedAt || '',
        (t.tags || []).join(' · '), blockers, plainText(t.notes)
      ].concat(fields.map(function (f) { return cellText(t, f); })).map(csvCell).join(','));
    });
    /* ลงบันทึกไว้ด้วย การเอางานทั้งโปรเจกต์ออกไปเป็นไฟล์คือการนำข้อมูลออกนอกระบบ
     * ผู้ดูแลต้องตอบได้ว่าใครเอาอะไรออกไปเมื่อไร */
    audit('project.export', p.name, 'ส่งออก {n} งานเป็น CSV', { n: lines.length - 1 });
    commit();
    return '﻿' + lines.join('\r\n');
  }

  /** แยกบรรทัด CSV ทีละเซลล์ รองรับเครื่องหมายคำพูดและจุลภาคในเนื้อความ */
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false;
    text = String(text).replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else q = false;
        } else cell += c;
        continue;
      }
      if (c === '"') { q = true; continue; }
      if (c === ',') { row.push(cell); cell = ''; continue; }
      if (c === '\r') continue;
      if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
      cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return v.trim() !== ''; }); });
  }

  /** หา index ของคอลัมน์จากชื่อหัวตาราง รองรับหลายชื่อที่หมายถึงอย่างเดียวกัน */
  function colIndex(head, names) {
    for (var i = 0; i < head.length; i++) {
      var h = head[i].trim().toLowerCase();
      for (var j = 0; j < names.length; j++) {
        if (h === names[j].toLowerCase()) return i;
      }
    }
    return -1;
  }

  /**
   * นำเข้างานจาก CSV เข้าโปรเจกต์ที่เปิดอยู่
   *
   * ไม่แตะงานเดิมเลย ทุกแถวสร้างเป็นงานใหม่เสมอ
   * เพราะการเดาว่าแถวไหนคืองานเดิมจากชื่ออย่างเดียวเสี่ยงเขียนทับของจริง
   * ถ้ามีชื่อคอลัมน์ Section/Column ที่ยังไม่มีในโปรเจกต์ จะสร้างคอลัมน์ให้ใหม่
   */
  function importTasksCsv(projectId, text) {
    /* 2c — นำเข้าตามการจับคู่ที่เดาจากหัวตาราง (หน้าต่างดูก่อนนำเข้าใช้ importTasksCsvMapped ตรง) */
    return importTasksCsvMapped(projectId, text, csvPreview(projectId, text).guess);
  }
  /* ---------- undo ---------- */

  var undoStack = [];   // อยู่ในหน่วยความจำเท่านั้น ไม่ persist

  /* label คือคีย์คำแปล ไม่ใช่ประโยคสำเร็จรูป — เก็บ params แยกไว้
   * เพื่อให้ข้อความ "ย้อนกลับแล้ว: …" แปลตามภาษาที่คนอ่านตั้งไว้ ไม่ใช่ภาษาตอนที่กด */
  function snapshot(label, params) {
    if (batchDepth) return;            // ชุดคำสั่งเดียวกันย้อนกลับได้ในครั้งเดียว
    undoStack.push({ label: label, params: params || null, data: JSON.stringify(db) });
    if (undoStack.length > 25) undoStack.shift();
  }

  function undo() {
    var s = undoStack.pop();
    if (!s) return null;
    autoQueue.length = 0;
    db = JSON.parse(s.data);
    dropIndex();
    commit();
    lastUndo = { label: s.label, params: s.params };
    return s.label;
  }

  /* คีย์กับค่าแทนที่ของการย้อนกลับครั้งล่าสุด ให้ฝั่งหน้าจอเอาไปแปลเอง */
  var lastUndo = null;
  function undoLabel() { return lastUndo; }

  function canUndo() { return undoStack.length > 0; }

  /* ---------- selectors ---------- */

  /* ---------- ดัชนี ----------
   *
   * เดิมทุกการค้นหากวาดทั้งอาเรย์ พอข้อมูลโตถึงหลักพันงาน การวาดหน้าเดียว
   * กลายเป็นการกวาดหลายสิบล้านครั้ง หน้าแรกกับปฏิทินค้างเป็นวินาที
   * ที่แย่กว่านั้นคือมันโตแบบกำลังสอง ยิ่งใช้ไปยิ่งช้าลงเรื่อย ๆ
   *
   * สร้างดัชนีครั้งเดียวแล้วใช้ซ้ำ ทิ้งทุกครั้งที่ commit
   * และมีลายเซ็นความยาวอาเรย์เป็นตาข่ายกันพลาด เผื่อมีที่ไหนแก้ข้อมูลตรง ๆ
   * โดยไม่ผ่าน commit ดัชนีเก็บแต่การอ้างอิงวัตถุเดิม ค่าในฟิลด์จึงสดเสมอ
   */
  var idx = null;

  function dropIndex() { idx = null; }

  function indexSig() {
    return db.tasks.length + '/' + db.memberships.length + '/' + db.projects.length +
           '/' + db.users.length + '/' + db.stories.length +
           '/' + (db.fieldValues || []).length + '/' + (db.projectMembers || []).length;
  }

  function index() {
    if (idx && idx.sig === indexSig()) return idx;
    var i = {
      sig: '', user: {}, project: {}, task: {},
      memByTask: {}, memByProject: {}, subsByParent: {},
      storyByTask: {}, fvByTask: {}, blockedByMe: {},
      pmByProject: {}, access: {}, types: {}, statuses: {}, teamMem: {}
    };
    db.users.forEach(function (u) { i.user[u.id] = u; });
    /* 4a — สมาชิกทีม { teamId: { userId: 'admin'|'member' } } ใช้คำนวณสิทธิ์ที่ได้ผ่านทีม */
    (db.teams || []).forEach(function (tm) {
      var mm = i.teamMem[tm.id] = {};
      (tm.members || []).forEach(function (m) { mm[m.u] = m.role; });
    });
    db.projects.forEach(function (p) {
      i.project[p.id] = p;
      /* 3b — ชนิดงานกำหนดเองและสถานะ รหัสไม่ซ้ำทั้งระบบ งานที่อยู่หลายโปรเจกต์จึงหาชนิดของตัวเองเจอเสมอ */
      (p.types || []).forEach(function (ty) {
        i.types[ty.id] = ty;
        (ty.statuses || []).forEach(function (s, k) { i.statuses[s.id] = { st: s, ty: ty, p: p, k: k }; });
      });
    });
    db.tasks.forEach(function (t) {
      i.task[t.id] = t;
      if (t.parentId) (i.subsByParent[t.parentId] = i.subsByParent[t.parentId] || []).push(t);
      (t.dependsOn || []).forEach(function (d) {
        if (d && d.id) (i.blockedByMe[d.id] = i.blockedByMe[d.id] || []).push(t);
      });
    });
    db.memberships.forEach(function (m) {
      (i.memByTask[m.taskId] = i.memByTask[m.taskId] || []).push(m);
      (i.memByProject[m.projectId] = i.memByProject[m.projectId] || []).push(m);
    });
    db.stories.forEach(function (s) {
      (i.storyByTask[s.taskId] = i.storyByTask[s.taskId] || []).push(s);
    });
    (db.fieldValues || []).forEach(function (v) {
      (i.fvByTask[v.taskId] = i.fvByTask[v.taskId] || {})[v.fieldId] = v;
    });
    (db.projectMembers || []).forEach(function (m) {
      (i.pmByProject[m.projectId] = i.pmByProject[m.projectId] || {})[m.userId] = m;
    });
    i.sig = indexSig();
    idx = i;
    return i;
  }

  function user(id) { return index().user[id] || null; }
  function me() { return user(db.currentUserId); }
  function project(id) { return index().project[id] || null; }
  function task(id) { return index().task[id] || null; }
  function section(projectId, sectionId) {
    var p = project(projectId);
    if (!p) return null;
    return p.sections.filter(function (s) { return s.id === sectionId; })[0] || null;
  }
  function activeProjects() {
    return db.projects.filter(function (p) { return !p.archived; });
  }

  function tasksInProject(projectId) {
    var i = index();
    return (i.memByProject[projectId] || [])
      .map(function (m) {
        var t = i.task[m.taskId];
        return t ? { task: t, membership: m } : null;
      })
      .filter(function (x) { return x && !x.task.parentId; })
      .sort(function (a, b) { return a.membership.position - b.membership.position; });
  }

  function tasksInSection(projectId, sectionId) {
    return tasksInProject(projectId).filter(function (x) {
      return x.membership.sectionId === sectionId;
    });
  }

  function subtasks(taskId) {
    return index().subsByParent[taskId] || [];
  }

  function projectsOfTask(taskId) {
    var i = index();
    return (i.memByTask[taskId] || [])
      .map(function (m) { return { project: i.project[m.projectId], membership: m }; })
      .filter(function (x) { return x.project; });
  }

  function storiesOfTask(taskId) {
    return (index().storyByTask[taskId] || []).slice()
      .sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
  }

  function fieldValue(taskId, fieldId) {
    var fi3 = formulaDefs();          // 3c — ฟิลด์สูตรคำนวณตอนอ่าน
    if (fi3.formulas[fieldId]) { var ft3 = task(taskId); return ft3 ? evalFormula(fi3.formulas[fieldId], ft3, 0) : null; }
    var row = index().fvByTask[taskId];
    var fv = row && row[fieldId];
    return fv ? fv.value : null;
  }

  /** งานที่บล็อกงานนี้อยู่ (ยังไม่เสร็จ) */
  function blockers(taskId) {
    var t = task(taskId);
    if (!t) return [];
    return t.dependsOn
      .map(function (d) { return task(d.id); })
      .filter(function (x) { return x && !x.completed; });
  }

  function isBlocked(taskId) { return blockers(taskId).length > 0; }

  /** งานที่รองานนี้อยู่ */
  function blocking(taskId) {
    return index().blockedByMe[taskId] || [];
  }

  /** จำนวนวันของงาน นับทั้งวันเริ่มและวันจบ งานวันเดียวจึงเท่ากับ 1 ไม่ใช่ 0 */
  function taskDuration(t) {
    if (!t) return null;
    if (!t.startOn && !t.dueOn) return null;
    if (!t.startOn || !t.dueOn) return 1;
    return Math.abs(daysBetween(t.startOn, t.dueOn)) + 1;
  }

  /* ---------- เส้นฐาน (baseline) ----------
   *
   * เก็บวันที่ของทุกงานไว้ ณ วันที่กดตั้ง ไว้เทียบว่าตอนนี้หลุดจากแผนเดิมไปเท่าไร
   * เก็บที่ตัวโปรเจกต์ ไม่ใช่ที่มุมมอง เพราะเป็นข้อเท็จจริงร่วมของทีม
   * ไม่ใช่ความชอบส่วนตัวของคนดู
   */
  function setBaseline(projectId) {
    var p = project(projectId);
    if (!p) return false;
    snapshot('ตั้งเส้นฐาน');
    var map = {};
    tasksInProject(projectId).forEach(function (x) {
      var t = x.task;
      if (!t.startOn && !t.dueOn) return;
      map[t.id] = { startOn: t.startOn, dueOn: t.dueOn };
    });
    p.baseline = { at: new Date().toISOString(), tasks: map };
    audit('project.baseline', p.name, 'จำนวนงานที่บันทึก {n}', { n: Object.keys(map).length });
    commit();
    return true;
  }

  function clearBaseline(projectId) {
    var p = project(projectId);
    if (!p || !p.baseline) return false;
    snapshot('ลบเส้นฐาน');
    p.baseline = null;
    audit('project.baselineClear', p.name);
    commit();
    return true;
  }

  /** วันตามเส้นฐานของงานหนึ่ง คืน null ถ้างานนี้ยังไม่อยู่ในเส้นฐาน */
  function baselineOf(projectId, taskId) {
    var p = project(projectId);
    if (!p || !p.baseline) return null;
    return p.baseline.tasks[taskId] || null;
  }

  /* ---------- จัดตารางอัตโนมัติ ----------
   *
   * มีสามโหมด ตรงกับที่ Asana ให้เลือก เพราะสามแบบนี้ตอบคนละคำถาม
   *
   *   consume  — กินระยะห่าง ขยับเฉพาะตอนที่ชนกันจริง
   *              ระยะที่เว้นไว้ทำหน้าที่เป็นกันชน ถูกกินไปก่อนจนหมดค่อยดันงานถัดไป
   *   maintain — รักษาระยะห่าง ขยับงานที่พึ่งพากันด้วยระยะเท่ากับที่ต้นทางขยับ
   *              ระยะห่างเดิมคงอยู่เป๊ะ ใช้เมื่อระยะนั้นมีความหมาย เช่นรอผลแล็บ 7 วัน
   *   none     — ไม่ขยับอะไรเลย
   *
   * โหมด maintain เลือกได้อีกว่าจะขยับเฉพาะงานที่รออยู่ข้างหน้า
   * หรือขยับงานที่อยู่ข้างหลังด้วย (ดึงงานต้นน้ำตามไปด้วย)
   *
   * ทุกโหมดคงระยะเวลาเดิมของแต่ละงานไว้ คือเลื่อนทั้งแท่ง ไม่ใช่ยืดหรือหด
   * และไม่แตะงานที่ทำเสร็จแล้ว เพราะวันที่ของมันคือสิ่งที่เกิดขึ้นจริงไปแล้ว
   */

  var WORK_DAYS = [
    { id: 'all',     label: 'ทุกวัน (ไม่มีวันหยุด)' },
    { id: 'mon-fri', label: 'จันทร์ – ศุกร์' },
    { id: 'mon-sat', label: 'จันทร์ – เสาร์' }
  ];

  var DEP_SHIFT = [
    { id: 'consume',  label: 'กินระยะห่าง',
      desc: 'ขยับงานที่รออยู่เฉพาะตอนที่วันชนกันจริง ระยะห่างที่เว้นไว้ทำหน้าที่เป็นกันชน' },
    { id: 'maintain', label: 'รักษาระยะห่าง',
      desc: 'ขยับงานที่พึ่งพากันด้วยระยะเท่ากับที่งานต้นทางขยับ ระยะห่างเดิมคงอยู่เท่าเดิม' },
    { id: 'none',     label: 'ไม่ขยับ',
      desc: 'ปล่อยให้วันของงานอื่นอยู่ที่เดิม แม้จะทับซ้อนกับงานที่เพิ่งเลื่อน' }
  ];

  function isWorkday(iso, mode) {
    if (!mode || mode === 'all') return true;
    var d = new Date(iso + 'T00:00:00').getDay();       // 0 = อาทิตย์
    if (mode === 'mon-fri') return d >= 1 && d <= 5;
    if (mode === 'mon-sat') return d >= 1 && d <= 6;
    return true;
  }

  /** เลื่อนไปวันทำงานถัดไป ถ้าวันที่ให้มาเป็นวันหยุด */
  function nextWorkday(iso, mode) {
    var d = iso, guard = 0;
    while (!isWorkday(d, mode) && guard++ < 14) d = addDays(d, 1);
    return d;
  }

  function requiredShift(pred, succ, type) {
    var ps = pred.startOn || pred.dueOn;
    var pe = pred.dueOn || pred.startOn;
    var ss = succ.startOn || succ.dueOn;
    var se = succ.dueOn || succ.startOn;
    if (!ps || !ss) return 0;
    if (type === 'SS') return daysBetween(ss, ps);              // เริ่มพร้อมกันหรือหลัง
    if (type === 'FF') return daysBetween(se, pe);              // จบพร้อมกันหรือหลัง
    if (type === 'SF') return daysBetween(se, ps);              // จบหลังงานก่อนเริ่ม
    return daysBetween(ss, addDays(pe, 1));                     // FS: เริ่มหลังงานก่อนจบ
  }

  /** เลื่อนงานทั้งแท่งไปกี่วัน แล้วหลบวันหยุดถ้าโปรเจกต์กำหนดวันทำงานไว้ */
  function slide(t, days, work) {
    if (!days) return false;
    var s = t.startOn ? addDays(t.startOn, days) : null;
    var d = t.dueOn ? addDays(t.dueOn, days) : null;
    if (work && work !== 'all') {
      /* หลบทั้งแท่งไปพร้อมกัน ไม่ยืดงาน ถ้าเลื่อนแค่ปลายด้านเดียวระยะเวลาจะเพี้ยน */
      var anchor = s || d;
      var moved = daysBetween(anchor, nextWorkday(anchor, work));
      if (moved) {
        if (s) s = addDays(s, moved);
        if (d) d = addDays(d, moved);
      }
    }
    t.startOn = s;
    t.dueOn = d;
    return true;
  }

  /**
   * @param startId  งานที่ผู้ใช้เพิ่งเลื่อน
   * @param delta    เลื่อนไปกี่วัน (บวก = ไปข้างหน้า) ใช้เฉพาะโหมด maintain
   * @param opts     { mode, scope, workDays }
   * @returns        รายชื่อ id ของงานที่ถูกขยับตาม
   */
  function autoSchedule(startId, delta, opts) {
    opts = opts || {};
    var mode = opts.mode || 'consume';
    if (mode === 'none') return [];
    var scope = opts.scope || 'downstream';
    var work = opts.workDays || 'all';

    var moved = {}, guard = 0;
    var queue = [startId];
    var seen = {};
    seen[startId] = true;

    while (queue.length && guard++ < 3000) {
      var id = queue.shift();
      var cur = task(id);
      if (!cur) continue;

      /* eslint-disable no-loop-func */
      /* งานที่รอ id นี้อยู่ = อยู่ข้างหน้า */
      db.tasks.forEach(function (t) {
        if (t.completed || t.id === startId) return;
        var dep = (t.dependsOn || []).filter(function (d) { return d.id === id; })[0];
        if (!dep) return;
        /* โหมดรักษาระยะห่างขยับด้วยระยะคงที่ ถ้างานหนึ่งรอสองงานที่อยู่ในสายเดียวกัน
         * แล้วขยับซ้ำ มันจะเลื่อนไปไกลเป็นสองเท่า จึงต้องขยับได้ครั้งเดียวต่อรอบ
         * ส่วนโหมดกินระยะห่างคำนวณใหม่ทุกครั้งอยู่แล้ว ขยับซ้ำก็ได้ผลลัพธ์เดิม */
        if (mode === 'maintain' && moved[t.id]) return;
        var by = mode === 'maintain' ? delta : requiredShift(cur, t, dep.type || 'FS');
        if (mode === 'consume' && by <= 0) return;
        if (!by) return;
        if (slide(t, by, work)) { moved[t.id] = true; }
        if (!seen[t.id]) { seen[t.id] = true; queue.push(t.id); }
      });

      /* งานที่ id นี้รออยู่ = อยู่ข้างหลัง ขยับเฉพาะโหมดรักษาระยะห่างแบบทั้งสองทาง */
      if (mode === 'maintain' && scope === 'all') {
        (cur.dependsOn || []).forEach(function (d) {
          var b = task(d.id);
          if (!b || b.completed || b.id === startId || moved[b.id]) return;
          if (slide(b, delta, work)) { moved[b.id] = true; }
          if (!seen[b.id]) { seen[b.id] = true; queue.push(b.id); }
        });
      }
      /* eslint-enable no-loop-func */
    }

    var list = Object.keys(moved);
    if (list.length) commit();
    return list;
  }

  /** เห็นงานนี้ได้ไหม
   *
   * กติกาเดียวกับ can() คือถ้างานอยู่หลายโปรเจกต์ เห็นได้โปรเจกต์เดียวก็พอ
   * งานที่ไม่ได้อยู่โปรเจกต์ไหนเลยถือว่าเห็นได้ ส่วนงานย่อยไม่ได้ผูกกับโปรเจกต์เอง
   * จึงต้องยึดตามงานแม่ ไม่งั้นงานย่อยของโปรเจกต์ปิดจะโผล่ในค้นหาและปฏิทิน
   */
  /** เป็นคู่กรณีของงานนี้ไหม — ถูกมอบหมาย เป็นคนสร้าง หรือเป็นผู้ติดตาม */
  function isTaskParticipant(taskId, userId) {
    var uid2 = userId || db.currentUserId;
    var t = task(taskId);
    if (!t) return false;
    return t.assigneeId === uid2 || t.createdBy === uid2 ||
           (t.followers || []).indexOf(uid2) >= 0;
  }

  function canSeeTask(taskId, depth) {
    /* คู่กรณีของงานเห็นงานของตัวเองได้เสมอ แม้งานจะอยู่ในโปรเจกต์ปิดที่ตัวเองไม่ได้เป็นสมาชิก
     * เป็นกติกาเดียวกับ Asana ถ้าซ่อนจะเกิดงานผี คือถูกสั่งงานแต่เปิดไม่ได้
     * และไม่มีใครรู้ว่าทำไมงานไม่เดิน — เห็นได้เฉพาะตัวงาน ไม่ได้เห็นทั้งโปรเจกต์
     * กดเข้าโปรเจกต์ยังโดนเด้งออกเหมือนเดิม */
    if (isTaskParticipant(taskId)) return true;

    var ms = index().memByTask[taskId];
    if (ms && ms.length) {
      return ms.some(function (m) { return !!projectAccess(m.projectId); });
    }
    var t = task(taskId);
    if (t && t.parentId && (depth || 0) < 8) return canSeeTask(t.parentId, (depth || 0) + 1);
    /* ไม่อยู่โปรเจกต์ไหนเลย = งานส่วนตัว เห็นเฉพาะคู่กรณี ซึ่งตรวจไปแล้วข้างบน
     * เดิมคืน true ทำให้งานที่สร้างจากงานของฉันโผล่ในค้นหาและปฏิทินของทุกคน */
    return false;
  }

  function myTasks(userId) {
    var t = today();
    var buckets = { overdue: [], today: [], upcoming: [], later: [], nodate: [] };
    db.tasks.forEach(function (item) {
      if (item.assigneeId !== userId || item.completed) return;
      if (!canSeeTask(item.id)) return;
      if (!item.dueOn) { buckets.nodate.push(item); return; }
      if (item.dueOn < t) buckets.overdue.push(item);
      else if (item.dueOn === t) buckets.today.push(item);
      else if (item.dueOn <= addDays(t, 7)) buckets.upcoming.push(item);
      else buckets.later.push(item);
    });
    Object.keys(buckets).forEach(function (k) {
      buckets[k].sort(function (a, b) {
        return (a.dueOn || '9999') < (b.dueOn || '9999') ? -1 : 1;
      });
    });
    return buckets;
  }

  /* ค้นหา
   *
   * เดิมดูแค่ชื่อกับรายละเอียด ซึ่งพอมีงานหลายพันแล้วหาไม่เจอ
   * เพราะคนจำชื่องานเป๊ะ ๆ ไม่ได้ แต่จำได้ว่า "งานของคุณมานี" หรือ "อยู่ในโปรเจกต์สบู่"
   *
   * ให้คะแนนแทนการกรองล้วน ๆ ชื่อที่ตรงเป๊ะต้องมาก่อนงานที่บังเอิญมีคำนั้นในรายละเอียด
   * และงานที่ทำเสร็จแล้วถูกลดคะแนนให้ไปอยู่ท้าย เพราะคนค้นหามักหาสิ่งที่ยังทำอยู่
   */
  /* Sprint 3 — ค้นในหน้าเอกสารและข้อความโปรเจกต์ (นอกจากงาน)
   * เห็นเฉพาะของโปรเจกต์ที่คนค้นเข้าถึงได้ (visibleProjects) กับหน้าเดี่ยวที่ตัวเองเห็น (myPages)
   * ค้นแบบข้อความตรง ๆ ไม่รองรับตัวดำเนินการเหมือนค้นงาน */
  function searchDocs(q) {
    var needle = String(q || '').trim().toLowerCase();
    if (!needle) return [];
    function hit(s) { return plainText(s, true).toLowerCase().indexOf(needle) >= 0; }
    var out = [];
    visibleProjects().forEach(function (p) {
      (p.pages || []).forEach(function (pg) {
        if (hit(pg.title) || hit(pg.body)) out.push({ kind: 'page', id: pg.id, title: pg.title || '', project: p });
      });
      (p.messages || []).forEach(function (m) {
        if (hit(m.title) || hit(m.body)) out.push({ kind: 'message', id: m.id, title: m.title || String(m.body || '').split('\n')[0].slice(0, 60), project: p });
      });
    });
    myPages().forEach(function (pg) {
      if (hit(pg.title) || hit(pg.body)) out.push({ kind: 'page', id: pg.id, title: pg.title || '', project: null });
    });
    return out.slice(0, 30);
  }

  function search(q) {
    /* 2c — ตัวค้นหาตัวเดียวกับค้นหาขั้นสูง (searchAdv) รองรับ "วลี" a | b -คำ คำ* ( ) และรหัสงาน */
    return searchAdv({ q: q, limit: 60 });
  }

  /** งานทั้งหมดที่เห็นได้ ใช้กับปฏิทินรวมที่ไม่ได้เจาะจงโปรเจกต์ */
  function visibleTasks() {
    return db.tasks.filter(function (t) { return canSeeTask(t.id); });
  }

  /* ---------- หน้าแรก ---------- */

  /** งานที่ฉันมอบหมายให้คนอื่น
   *
   * นับเฉพาะงานที่เราเป็นคนสร้างและมอบให้คนอื่น งานที่มอบให้ตัวเองอยู่ใน
   * "งานของฉัน" อยู่แล้ว ถ้านับซ้ำหน้าแรกจะอ่านแล้วสับสนว่าตกลงมีกี่งาน
   */
  function assignedByMe(userId) {
    var uid2 = userId || db.currentUserId;
    var t = today();
    var soon = addDays(t, 7);
    var b = { week: [], upcoming: [], overdue: [], completed: [] };

    db.tasks.forEach(function (x) {
      if (x.createdBy !== uid2) return;
      if (!x.assigneeId || x.assigneeId === uid2) return;
      if (!canSeeTask(x.id)) return;
      if (x.completed) { b.completed.push(x); return; }
      if (x.dueOn && x.dueOn < t) b.overdue.push(x);
      else if (x.dueOn && x.dueOn <= soon) b.week.push(x);
      else b.upcoming.push(x);
    });

    ['week', 'upcoming', 'overdue'].forEach(function (k) {
      b[k].sort(function (a, c) { return (a.dueOn || '9999') < (c.dueOn || '9999') ? -1 : 1; });
    });
    b.completed.sort(function (a, c) {
      return (a.completedAt || '') < (c.completedAt || '') ? 1 : -1;
    });
    return b;
  }

  /** งานของฉันที่เพิ่งทำเสร็จ เรียงใหม่สุดก่อน */
  function myCompleted(userId, limit) {
    return db.tasks
      .filter(function (x) {
        return x.completed && x.assigneeId === userId && canSeeTask(x.id);
      })
      .sort(function (a, c) { return (a.completedAt || '') < (c.completedAt || '') ? 1 : -1; })
      .slice(0, limit || 12);
  }

  /** จำนวนงานที่ยังไม่เสร็จและใกล้ครบกำหนด (วันนี้ถึง 7 วันข้างหน้า) ในโปรเจกต์ ใช้บนการ์ดหน้าแรก
   *  Sprint 1C — ไม่นับงานเลยกำหนดแล้ว เดิมรวมกันจนโปรเจกต์ที่เลยกำหนด 6 จาก 7 งานขึ้นว่า "ใกล้ครบกำหนด 7"
   *  งานเลยกำหนดนับแยกที่ overdueCount */
  function overdueCount(projectId) {
    var td = today(), n = 0;
    tasksInProject(projectId).forEach(function (x) {
      if (!x.task.completed && x.task.dueOn && x.task.dueOn < td) n++;
    });
    return n;
  }
  function dueSoonCount(projectId) {
    var lim = addDays(today(), 7), td = today(), n = 0;
    tasksInProject(projectId).forEach(function (x) {
      if (!x.task.completed && x.task.dueOn && x.task.dueOn >= td && x.task.dueOn <= lim) n++;
    });
    return n;
  }

  /** ตัวเลขสรุปบนหัวหน้าแรก นับเฉพาะงานที่เห็นได้ */
  function homeStats(userId) {
    var uid2 = userId || db.currentUserId;
    var t = today();
    var weekAgo = addDays(t, -6);
    var soon = addDays(t, 7);
    var doneWeek = 0, overdue = 0, dueWeek = 0;

    db.tasks.forEach(function (x) {
      if (x.assigneeId !== uid2) return;
      if (!canSeeTask(x.id)) return;
      if (x.completed) {
        if (x.completedAt && x.completedAt >= weekAgo) doneWeek++;
        return;
      }
      if (!x.dueOn) return;
      if (x.dueOn < t) overdue++;
      else if (x.dueOn <= soon) dueWeek++;
    });

    /* เพื่อนร่วมงาน = คนที่ถืองานอยู่ในโปรเจกต์ที่เราเข้าถึงได้
     * ไม่ใช่จำนวนคนทั้งบริษัท ไม่งั้นตัวเลขนี้จะเท่ากันทุกคนและไม่มีความหมาย */
    var mates = {};
    var projs = visibleProjects(uid2);
    projs.forEach(function (p) {
      tasksInProject(p.id).forEach(function (x) {
        var a = x.task.assigneeId;
        if (a && a !== uid2 && user(a)) mates[a] = 1;
      });
    });

    return {
      doneWeek: doneWeek, overdue: overdue, dueWeek: dueWeek,
      collaborators: Object.keys(mates).length,
      projects: projs.length
    };
  }

  /* ---------- งานส่วนตัว (ไม่อยู่ในโปรเจกต์ไหน) ----------
   *
   * งานที่สร้างจากงานของฉันโดยไม่ใส่โปรเจกต์ เห็นได้เฉพาะคนสร้าง ผู้รับผิดชอบ และผู้ติดตาม
   * แบบเดียวกับ Asana — ตัดสินที่งานต้นทาง (root) เพราะงานย่อยไม่ได้ผูกกับโปรเจกต์เอง
   * "ทำให้เป็นสาธารณะ" = เพิ่มเข้าโปรเจกต์ (addTaskToProject) ไม่มีธงแยกให้หลุดกันได้ */
  function rootOf(t) {
    var cur = t, guard = 0;
    while (cur && cur.parentId && guard++ < 20) {
      var up = task(cur.parentId);
      if (!up) break;
      cur = up;
    }
    return cur;
  }

  function isPrivate(taskId) {
    var t = task(taskId);
    if (!t) return false;
    var r = rootOf(t);
    return !(index().memByTask[r.id] || []).length;
  }

  /* ======================================================================
   * ของส่วนตัวของแต่ละคน (ชิ้นงาน 2a)
   *
   * งานของฉัน (เซกชัน ลำดับ มุมมอง) หน้าแรก (วิดเจ็ต) กล่องแจ้งเตือน (เรียง ความหนาแน่น)
   * และสมุดโน้ต เก็บใน db.personal[userId] ไม่ใช่ localStorage
   * เพราะในโหมดทีมคนเดียวกันเปิดจากหลายเครื่อง ของที่จัดไว้ต้องตามไปด้วย
   * เก็บแต่รหัสกับตัวเลข ไม่คัดลอกตัวงาน ไฟล์กลางจึงโตตามจำนวนงานที่จัดเท่านั้น
   *
   *   mt.secs   [{ id, name }]  ลำดับเซกชัน — 'recent' คือ "เพิ่งได้รับมอบหมาย" ลบไม่ได้
   *             name ว่าง = ใช้ชื่อมาตรฐานตามภาษา
   *   mt.place  { taskId: [sectionId, position, ms] }  งานที่จัดลงเซกชันแล้ว
   *             ใช้ได้เฉพาะเมื่อ ms >= เวลาที่งานถูกมอบหมายครั้งล่าสุด (task.assignedAt)
   *             งานที่ถูกมอบหมายใหม่จึงกลับไป "เพิ่งได้รับมอบหมาย" เองไม่ว่าจะมาทางไหน
   *             (แผงงาน แก้หลายงาน กฎ มอบสำเนา งานติดตามผล งานทำซ้ำ โอนงาน นำเข้า)
   *   mt.seen   { taskId: ms }  เปิดดูแล้วหลังได้รับมอบหมาย — ไม่มีจุดสีฟ้า
   *   mt.view   มุมมอง ตัวกรอง เรียง จัดกลุ่ม บันทึกเองทุกครั้งที่เปลี่ยน
   *   home      [{ w, full }]  วิดเจ็ตหน้าแรกตามลำดับ  null = ค่าเริ่มต้น
   *   inbox     { sort, dense }
   *   notepad   ข้อความในสมุดโน้ตส่วนตัว
   *   pv        { projectId: มุมมองที่ทำงานอยู่ (เฉพาะคีย์ที่ต่างจากค่าเริ่มต้น) }  (2b)
   *   cal       { mode, weekends, colorBy } ของปฏิทินรวม  null = ค่าเริ่มต้น  (2b)
   * ====================================================================== */
  var MT_RECENT = 'recent';
  var NOTEPAD_MAX = 20000;

  function defaultMtView() {
    return { mode: 'list', group: 'sections', sort: 'manual', dir: 'asc',
             show: 'open', due: 'any', project: '', cal: 'week', appr: '' };    // appr — Sprint 2B
  }

  function blankPersonal() {
    return {
      mt: {
        /* รหัสคงที่ ไม่สุ่ม — สองเครื่องสร้างพร้อมกันในโหมดทีมแล้วยังได้เซกชันชุดเดียวกัน */
        secs: [
          { id: MT_RECENT, name: '' },
          { id: 'today', name: 'ทำวันนี้' },
          { id: 'next', name: 'ทำสัปดาห์หน้า' },
          { id: 'later', name: 'ทำทีหลัง' }
        ],
        place: {}, seen: {}, view: defaultMtView()
      },
      home: null,
      inbox: { sort: 'new', dense: false },
      notepad: '', pv: {}, cal: null, searches: [],
      auto: [], autoRuns: []           // 3a — อัตโนมัติของงานของฉัน
    };
  }

  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

  function normalizePersonal(p) {
    var b = blankPersonal();
    if (!isObj(p)) return b;
    if (!isObj(p.mt)) p.mt = b.mt;
    var mt = p.mt;
    mt.secs = Array.isArray(mt.secs)
      ? mt.secs.filter(function (s, i, a) {
          return s && s.id && a.map(function (x) { return x && x.id; }).indexOf(s.id) === i;
        })
      : b.mt.secs;
    if (!mt.secs.some(function (s) { return s.id === MT_RECENT; })) mt.secs.unshift({ id: MT_RECENT, name: '' });
    mt.secs.forEach(function (s) { if (typeof s.name !== 'string') s.name = ''; });
    if (!isObj(mt.place)) mt.place = {};
    if (!isObj(mt.seen)) mt.seen = {};
    if (!isObj(mt.view)) mt.view = {};
    var dv = defaultMtView();
    Object.keys(dv).forEach(function (k) { if (!(k in mt.view)) mt.view[k] = dv[k]; });
    if (!Array.isArray(p.home)) p.home = null;
    if (!isObj(p.inbox)) p.inbox = b.inbox;
    if (typeof p.notepad !== 'string') p.notepad = '';
    if (!isObj(p.pv)) p.pv = {};
    if (!isObj(p.cal)) p.cal = null;
    p.searches = Array.isArray(p.searches) ? p.searches.filter(function (s) { return isObj(s) && s.id; }) : [];
    p.searches.forEach(function (s) {
      if (typeof s.name !== 'string' || !s.name) s.name = 'การค้นหา';
      if (typeof s.q !== 'string') s.q = '';
      if (!Array.isArray(s.conds)) s.conds = [];
      if (s.mode !== 'calendar') s.mode = 'list';
    });
    p.auto = Array.isArray(p.auto) ? p.auto.filter(function (a) { return isObj(a) && a.id; }) : [];
    p.auto.forEach(normalizeAuto);
    p.autoRuns = Array.isArray(p.autoRuns) ? p.autoRuns.slice(-50) : [];
    return p;
  }

  /** ล้างรหัสที่ไม่มีความหมายแล้ว (งานถูกลบ ไม่ได้เป็นของคนนี้แล้ว เซกชันถูกลบ) ทำตอนโหลด */
  function prunePersonal(d) {
    var tasks = {}, users = {}, projs = {};
    d.projects.forEach(function (p) { projs[p.id] = true; });
    d.tasks.forEach(function (t) { tasks[t.id] = t; });
    d.users.forEach(function (u) { users[u.id] = true; });
    Object.keys(d.personal).forEach(function (who) {
      if (!users[who]) { delete d.personal[who]; return; }
      var p = d.personal[who] = normalizePersonal(d.personal[who]);
      var secIds = {};
      p.mt.secs.forEach(function (s) { secIds[s.id] = true; });
      Object.keys(p.mt.place).forEach(function (tid) {
        var t = tasks[tid], e = p.mt.place[tid];
        if (!t || t.assigneeId !== who || !Array.isArray(e) || !secIds[e[0]]) delete p.mt.place[tid];
      });
      Object.keys(p.mt.seen).forEach(function (tid) {
        var t = tasks[tid];
        if (!t || t.assigneeId !== who || t.completed) delete p.mt.seen[tid];
      });
      Object.keys(p.pv).forEach(function (pid) { if (!projs[pid]) delete p.pv[pid]; });
    });
  }

  /** ของส่วนตัวของคนหนึ่ง สร้างให้ถ้ายังไม่มี (ยังไม่ commit — ผู้เรียกที่แก้ข้อมูลจะ commit เอง) */
  function personalOf(userId) {
    var who = userId || db.currentUserId;
    if (!who || !user(who)) return blankPersonal();
    if (!isObj(db.personal)) db.personal = {};
    if (!db.personal[who]) db.personal[who] = blankPersonal();
    return db.personal[who];
  }

  function assignedMs(t) {
    var n = t && t.assignedAt ? Date.parse(t.assignedAt) : 0;
    return isNaN(n) ? 0 : n;
  }

  /** ที่ที่จัดไว้ยังใช้ได้ไหม — ถูกมอบหมายใหม่หลังจัด ถือว่าเป็นงานเข้าใหม่ */
  function validPlace(st, t) {
    var e = st.mt.place[t.id];
    if (!Array.isArray(e)) return null;
    if ((e[2] || 0) < assignedMs(t)) return null;
    if (!st.mt.secs.some(function (s) { return s.id === e[0]; })) return null;
    return e;
  }

  function mtSectionOf(t, userId) {
    var e = validPlace(personalOf(userId), t);
    return e ? e[0] : MT_RECENT;
  }

  /** จุดสีฟ้า — งานที่คนอื่นเพิ่งมอบให้ และยังไม่เคยเปิดดูหรือจัดเข้าเซกชันเอง */
  function mtIsNew(taskId, userId) {
    var who = userId || db.currentUserId;
    var t = task(taskId);
    if (!t || t.assigneeId !== who || t.completed) return false;
    if (!t.assignedAt || !t.assignedBy || t.assignedBy === who) return false;
    var st = personalOf(who);
    if ((st.mt.seen[t.id] || 0) >= assignedMs(t)) return false;
    var e = validPlace(st, t);
    return !e || e[0] === MT_RECENT;
  }

  /** เปิดงานแล้ว จุดสีฟ้าหาย — ไม่ snapshot เพราะไม่ใช่สิ่งที่คนอยากกดย้อนกลับ */
  function mtMarkSeen(taskId) {
    if (!mtIsNew(taskId)) return false;
    personalOf().mt.seen[taskId] = Date.now();
    commit();
    return true;
  }

  /** ลืมที่ที่จัดไว้ของคนเดิม ตอนงานเปลี่ยนมือ — กันรหัสค้างในไฟล์กลาง */
  function mtForget(taskId, userId) {
    var st = userId && db.personal && db.personal[userId];
    if (!st || !st.mt) return;
    delete st.mt.place[taskId];
    delete st.mt.seen[taskId];
  }

  /** รอบใหม่ของงานทำซ้ำไปอยู่เซกชันเดียวกับรอบก่อน ไม่เด้งกลับไป "เพิ่งได้รับมอบหมาย" ทุกรอบ */
  function mtCopyPlace(fromTask, toTask) {
    var who = toTask.assigneeId;
    var st = who && db.personal && db.personal[who];
    if (!st || !st.mt || fromTask.assigneeId !== who) return;
    var e = validPlace(st, fromTask);
    var now = Date.now();
    if (e) st.mt.place[toTask.id] = [e[0], e[1] + 0.5, now];
    st.mt.seen[toTask.id] = now;
  }

  /** งานทั้งหมดที่มอบให้คนนี้และคนที่เปิดดูเห็นได้ (รวมงานที่เสร็จแล้ว) */
  function mtTasks(userId) {
    var who = userId || db.currentUserId;
    return db.tasks.filter(function (t) { return t.assigneeId === who && canSeeTask(t.id); });
  }

  function mtFilter(t, v) {
    if (v.show === 'open' && t.completed) return false;
    if (v.show === 'done' && !t.completed) return false;
    if (v.project) {
      if (v.project === '__private') {
        if (!isPrivate(t.id)) return false;
      } else if (!(index().memByTask[rootOf(t).id] || []).some(function (m) {
        return m.projectId === v.project;
      })) return false;
    }
    if (v.due && v.due !== 'any' && !matchesFilter(t, { due: v.due, showCompleted: true })) return false;
    /* Sprint 2B — "รออนุมัติจากฉัน" งานขออนุมัติที่ยังไม่ได้ตัดสิน (ขอแก้ไขแล้วไม่นับ รอคนขอส่งกลับ) */
    if (v.appr && !(t.type === 'approval' && !t.completed && (t.approval || 'pending') === 'pending')) return false;
    return true;
  }

  /** ลำดับแบบจัดเอง — งานเข้าใหม่ที่ยังไม่ถูกจัดขึ้นบนสุด ใหม่สุดก่อน แล้วตามด้วยที่จัดไว้ */
  function mtOrdered(list, st) {
    var fresh = [], placed = [];
    list.forEach(function (t) {
      var e = validPlace(st, t);
      if (e) placed.push([t, e[1]]); else fresh.push(t);
    });
    fresh.sort(function (a, b) {
      return (assignedMs(b) - assignedMs(a)) || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);
    });
    placed.sort(function (a, b) { return a[1] - b[1]; });
    return fresh.concat(placed.map(function (x) { return x[0]; }));
  }

  var MT_GROUPS = [
    { id: 'sections', label: 'เซกชันของฉัน' },
    { id: 'due',      label: 'วันครบกำหนด' },
    { id: 'project',  label: 'โปรเจกต์' },
    { id: 'none',     label: 'ไม่จัดกลุ่ม' }
  ];
  var MT_SORTS = ['manual', 'due', 'priority', 'name', 'created'];

  /** งานของฉันแบ่งกลุ่มตามมุมมองที่เลือก คืน [{ key, label, isSection, items: [task] }] */
  function mtGroups(userId, view) {
    var who = userId || db.currentUserId;
    var st = personalOf(who);
    var v = view || st.mt.view;
    var all = mtTasks(who).filter(function (t) { return mtFilter(t, v); });
    function sorted(list) {
      if (!v.sort || v.sort === 'manual') return list;
      return sortItems(list.map(function (t) { return { task: t }; }), v.sort, v.dir)
        .map(function (x) { return x.task; });
    }
    var out = [];
    if (v.group === 'due') {
      var td = today(), wk = addDays(td, 7);
      [
        ['overdue', 'เลยกำหนด', function (t) { return t.dueOn && t.dueOn < td && !t.completed; }],
        ['past', 'ก่อนหน้านี้', function (t) { return t.dueOn && t.dueOn < td && t.completed; }],
        ['today', 'วันนี้', function (t) { return t.dueOn === td; }],
        ['week', 'ภายใน 7 วัน', function (t) { return t.dueOn && t.dueOn > td && t.dueOn <= wk; }],
        ['later', 'หลังจากนั้น', function (t) { return t.dueOn && t.dueOn > wk; }],
        ['none', 'ไม่มีกำหนด', function (t) { return !t.dueOn; }]
      ].forEach(function (d) {
        var sub = all.filter(d[2]);
        if (!sub.length) return;
        if (!v.sort || v.sort === 'manual') {
          sub.sort(function (a, b) { return (a.dueOn || '9999') < (b.dueOn || '9999') ? -1 : 1; });
        }
        out.push({ key: d[0], label: d[1], items: sorted(sub) });
      });
    } else if (v.group === 'project') {
      var byP = {}, order = [];
      all.forEach(function (t) {
        var m = (index().memByTask[rootOf(t).id] || []).filter(function (x) {
          return !!projectAccess(x.projectId);
        })[0];
        var k = m ? m.projectId : '__private';
        if (!byP[k]) { byP[k] = []; order.push(k); }
        byP[k].push(t);
      });
      order.sort(function (a, b) {
        if (a === '__private') return -1;
        if (b === '__private') return 1;
        return project(a).name.localeCompare(project(b).name, 'th');
      });
      order.forEach(function (k) {
        var p = k === '__private' ? null : project(k);
        out.push({ key: k, label: p ? p.name : 'ส่วนตัว (ไม่อยู่ในโปรเจกต์)',
                   color: p ? p.color : null, items: sorted(mtOrdered(byP[k], st)) });
      });
    } else if (v.group === 'none') {
      out.push({ key: 'all', label: 'ทั้งหมด', items: sorted(mtOrdered(all, st)) });
    } else {
      var bySec = {};
      all.forEach(function (t) {
        var s = mtSectionOf(t, who);
        (bySec[s] = bySec[s] || []).push(t);
      });
      st.mt.secs.forEach(function (s) {
        out.push({ key: s.id, label: s.name, isSection: true, special: s.id === MT_RECENT,
                   items: sorted(mtOrdered(bySec[s.id] || [], st)) });
      });
    }
    return out;
  }

  /** ตัวกรอง เรียง จัดกลุ่ม มุมมอง — บันทึกเองต่อคน ไม่ต้องกดบันทึก */
  function mtSetView(patch) {
    var v = personalOf().mt.view;
    Object.keys(patch || {}).forEach(function (k) { v[k] = patch[k]; });
    commit();
    return v;
  }

  function mtSection(id) {
    return personalOf().mt.secs.filter(function (s) { return s.id === id; })[0] || null;
  }

  function mtAddSection(name) {
    var nm = String(name || '').trim().slice(0, 120);
    if (!nm) return null;
    snapshot('เพิ่มเซกชันในงานของฉัน');
    var s = { id: uid('ms'), name: nm };
    personalOf().mt.secs.push(s);
    commit();
    return s;
  }

  function mtRenameSection(id, name) {
    var s = mtSection(id);
    var nm = String(name || '').trim().slice(0, 120);
    if (!s || !nm || s.name === nm) return false;
    snapshot('เปลี่ยนชื่อเซกชัน');
    s.name = nm;
    commit();
    return true;
  }

  function mtMoveSection(id, delta) {
    var secs = personalOf().mt.secs;
    var i = secs.map(function (s) { return s.id; }).indexOf(id);
    var j = i + delta;
    if (i < 0 || j < 0 || j >= secs.length) return false;
    snapshot('ย้ายเซกชัน');
    var tmp = secs[i]; secs[i] = secs[j]; secs[j] = tmp;
    commit();
    return true;
  }

  /** ลบเซกชัน — งานข้างในกลับไปอยู่ท้าย "เพิ่งได้รับมอบหมาย" โดยไม่ขึ้นจุดสีฟ้าใหม่ */
  function mtDeleteSection(id) {
    if (id === MT_RECENT) return false;
    var st = personalOf();
    var i = st.mt.secs.map(function (s) { return s.id; }).indexOf(id);
    if (i < 0) return false;
    snapshot('ลบเซกชันในงานของฉัน');
    var base = 0;
    Object.keys(st.mt.place).forEach(function (k) {
      var e = st.mt.place[k];
      if (e[0] === MT_RECENT && e[1] > base) base = e[1];
    });
    Object.keys(st.mt.place).forEach(function (k) {
      var e = st.mt.place[k];
      if (e[0] === id) { e[0] = MT_RECENT; e[1] = ++base; }
    });
    st.mt.secs.splice(i, 1);
    commit();
    return true;
  }

  /** ย้ายงานไปเซกชันของฉัน วางก่อนงาน beforeId (ไม่ส่ง = ท้ายเซกชัน)
   *  ไม่ลงประวัติของงาน — การจัดงานของฉันเป็นเรื่องส่วนตัว คนอื่นไม่ต้องเห็น */
  function mtMove(taskId, secId, beforeId) {
    var t = task(taskId);
    var st = personalOf();
    if (!t || t.assigneeId !== db.currentUserId) return false;
    if (!st.mt.secs.some(function (s) { return s.id === secId; })) return false;
    snapshot('ย้ายงานในงานของฉัน');
    var now = Date.now();
    var list = mtOrdered(mtTasks().filter(function (x) {
      return x.id !== taskId && mtSectionOf(x) === secId;
    }), st);
    var at = beforeId ? list.map(function (x) { return x.id; }).indexOf(beforeId) : -1;
    if (at < 0) at = list.length;
    list.splice(at, 0, t);
    /* ตีเลขลำดับใหม่ทั้งเซกชัน งานเข้าใหม่ที่ยังไม่ถูกจัดก็ได้ตำแหน่งตามที่เห็นอยู่
     * แต่จุดสีฟ้ายังอยู่ เพราะจุดดูจาก seen ไม่ใช่จากตำแหน่ง */
    list.forEach(function (x, i) {
      var e = validPlace(st, x);
      st.mt.place[x.id] = [secId, i + 1, e ? e[2] : now];
    });
    st.mt.place[taskId][2] = now;
    st.mt.seen[taskId] = now;
    commit();
    return true;
  }

  /** สร้างงานจากงานของฉัน — มอบให้ตัวเอง ไม่อยู่โปรเจกต์ไหน (ส่วนตัว) วางท้ายเซกชันที่เลือก */
  function mtCreateTasks(names, secId, extra) {
    var list = [].concat(names || []).map(function (s) { return String(s).trim(); }).filter(Boolean);
    if (!list.length) return [];
    if (!canCreateTask(null, extra && extra.parentId)) { denied('create'); return []; }   // Sprint 1B
    snapshot(list.length > 1 ? 'สร้าง {n} งาน' : 'สร้างงาน', { n: list.length });
    var st = personalOf();
    var sid = st.mt.secs.some(function (s) { return s.id === secId; }) ? secId : MT_RECENT;
    var max = 0;
    Object.keys(st.mt.place).forEach(function (k) {
      var e = st.mt.place[k];
      if (e[0] === sid && e[1] > max) max = e[1];
    });
    var now = Date.now();
    var out = list.map(function (nm) {
      var attrs = { name: nm, assigneeId: db.currentUserId };
      Object.keys(extra || {}).forEach(function (k) { attrs[k] = extra[k]; });
      var t = createTaskRaw(attrs, null, null);
      st.mt.place[t.id] = [sid, ++max, now];
      return t;
    });
    commit();
    return out;
  }

  /* ---------- ไฟล์ของงานชุดหนึ่ง (แท็บไฟล์ในงานของฉัน) ---------- */
  function filesOfTasks(list) {
    var out = [];
    (list || []).forEach(function (t) {
      if (!canSeeTask(t.id)) return;
      (t.attachments || []).forEach(function (a) { out.push({ att: a, task: t }); });
    });
    return out.sort(function (a, b) {
      var ka = a.att.addedAt || a.task.createdAt || '';
      var kb = b.att.addedAt || b.task.createdAt || '';
      return ka < kb ? 1 : -1;
    });
  }

  /** ลากงานในปฏิทินไปวันใหม่ — เลื่อนทั้งแท่ง (วันเริ่มตามไปด้วย) ระยะเวลาเท่าเดิม
   *  due = null คือเอาวันออกทั้งหมด (ลากกลับไปช่อง "ยังไม่มีวัน") */
  function moveTaskDates(taskId, due) {
    var t = task(taskId);
    if (!t) return false;
    if (!due) {
      if (!t.dueOn && !t.startOn) return false;
      updateTask(taskId, { startOn: null, dueOn: null, startTime: null, dueTime: null });
      return true;
    }
    var cur = t.dueOn || t.startOn;
    if (t.dueOn && cur === due) return false;
    var patch = { dueOn: due };
    if (t.startOn) patch.startOn = addDays(t.startOn, cur ? daysBetween(cur, due) : 0);
    updateTask(taskId, patch);
    return true;
  }

  /* ---------- หน้าแรก ---------- */
  var HOME_WIDGETS = [
    { id: 'exec',     label: 'ภาพรวมผู้บริหาร',     icon: 'gauge' },     // Sprint 2C — ตอบ "ตอนนี้อะไรถึงไหน" ในการ์ดเดียว
    { id: 'mine',     label: 'งานของฉัน',          icon: 'checkCircle' },
    { id: 'assigned', label: 'งานที่ฉันมอบหมาย',   icon: 'users' },
    { id: 'projects', label: 'โปรเจกต์ล่าสุด',     icon: 'grid' },
    { id: 'people',   label: 'คนที่ทำงานด้วย',      icon: 'users' },
    { id: 'status',   label: 'อัปเดตสถานะ',        icon: 'flag' },
    { id: 'notepad',  label: 'สมุดโน้ตส่วนตัว',     icon: 'note' },
    { id: 'drafts',   label: 'ร่างความเห็น',        icon: 'pencil' },
    { id: 'stats',    label: 'สถิติงานเสร็จ',       icon: 'chart' },
    { id: 'activity', label: 'กิจกรรมล่าสุด',       icon: 'bell' },
    { id: 'forms',    label: 'ฟอร์ม',              icon: 'note' },      // 3b — ฟอร์มที่ส่งได้
    { id: 'goals',    label: 'เป้าหมาย',           icon: 'flag' }       // 4a — เป้าหมายของฉัน
  ];
  var HOME_DEFAULT = [
    { w: 'mine', full: false }, { w: 'projects', full: false },
    { w: 'assigned', full: false }, { w: 'activity', full: false }
  ];
  /* Sprint 2B — วิดเจ็ต "รออนุมัติจากฉัน" (ปุ่มอนุมัติ/ขอแก้ไข/ปฏิเสธในแถว) เพิ่มแยกบรรทัด ไม่แตะรายการเดิม */
  HOME_WIDGETS.push({ id: 'approvals', label: 'รออนุมัติจากฉัน', icon: 'check' });
  HOME_DEFAULT.push({ w: 'approvals', full: false });   // คนที่ยังไม่เคยจัดหน้าแรกเห็นเลย (ผลทดสอบ: หางานรออนุมัติไม่เจอ)

  function cleanHome(list) {
    var ok = {}, seen = {};
    HOME_WIDGETS.forEach(function (w) { ok[w.id] = true; });
    return (list || []).filter(function (x) {
      if (!x || !ok[x.w] || seen[x.w]) return false;
      seen[x.w] = true;
      return true;
    }).map(function (x) { return { w: x.w, full: !!x.full }; });
  }

  function homeLayout(userId) {
    var p = personalOf(userId);
    return cleanHome(p.home || HOME_DEFAULT);
  }

  function setHomeLayout(list) {
    var clean = list ? cleanHome(list) : null;
    snapshot('ปรับหน้าแรก');
    personalOf().home = clean;
    commit();
    return clean;
  }

  function setNotepad(text) {
    var p = personalOf();
    var v = String(text || '').slice(0, NOTEPAD_MAX);
    if (p.notepad === v) return false;
    p.notepad = v;
    commit();
    return true;
  }

  /** โปรเจกต์ที่มีความเคลื่อนไหวล่าสุด (จากบันทึกของงานในโปรเจกต์) */
  function recentProjects() {
    var i = index(), last = {};
    db.stories.forEach(function (s) {
      var t = i.task[s.taskId];
      if (!t) return;
      (i.memByTask[rootOf(t).id] || []).forEach(function (m) {
        if (!last[m.projectId] || last[m.projectId] < s.createdAt) last[m.projectId] = s.createdAt;
      });
    });
    return visibleProjects().slice().sort(function (a, b) {
      var x = last[a.id] || '', y = last[b.id] || '';
      return x < y ? 1 : x > y ? -1 : 0;
    });
  }

  /** รายงานสถานะล่าสุดจากทุกโปรเจกต์ที่เห็นได้ ใหม่สุดก่อน */
  function statusFeed(limit) {
    var out = [];
    visibleProjects().forEach(function (p) {
      (p.statusLog || []).forEach(function (e) { out.push({ project: p, entry: e }); });
    });
    return out.sort(function (a, b) { return a.entry.at < b.entry.at ? 1 : -1; })
      .slice(0, limit || 6);
  }

  /** จำนวนงานที่ทำเสร็จรายวัน ย้อนหลัง N วัน พร้อมยอดสัปดาห์นี้ สัปดาห์ก่อน และ 30 วัน */
  function completedStats(userId, days) {
    var who = userId || db.currentUserId;
    var n = days || 14, td = today(), per = {};
    var week = 0, prev = 0, month = 0;
    db.tasks.forEach(function (t) {
      if (t.assigneeId !== who || !t.completed || !t.completedAt || !canSeeTask(t.id)) return;
      var d = String(t.completedAt).slice(0, 10);
      per[d] = (per[d] || 0) + 1;
      var ago = daysBetween(d, td);
      if (ago >= 0 && ago < 7) week++;
      else if (ago >= 7 && ago < 14) prev++;
      if (ago >= 0 && ago < 30) month++;
    });
    var list = [];
    for (var k = n - 1; k >= 0; k--) {
      var day = addDays(td, -k);
      list.push({ d: day, n: per[day] || 0 });
    }
    return { days: list, week: week, prevWeek: prev, month: month };
  }

  /* ---------- กล่องแจ้งเตือน ---------- */

  /** การแจ้งเตือนของงานที่เห็นไม่ได้แล้ว (งานส่วนตัวของคนอื่น โปรเจกต์ปิดที่ถูกเอาออก) ไม่แสดง */
  function notifVisible(n) {
    if (!n.taskId || !task(n.taskId)) return true;
    return n.userId !== db.currentUserId || canSeeTask(n.taskId);
  }

  function inbox(userId, showArchived) {
    return db.notifications
      .filter(function (n) {
        return n.userId === userId && (showArchived ? n.archived : !n.archived) && notifVisible(n) && !isSnoozed(n);
      })
      .sort(function (a, b) { return notifAt(a) < notifAt(b) ? 1 : -1; });
  }

  function unreadCount(userId) {
    /* Sprint 2B — รายการที่เลื่อนเตือนไว้ไม่นับ จนกว่าจะถึงเวลาที่เลือก */
    return db.notifications.filter(function (n) {
      return n.userId === userId && !n.archived && !n.read && notifVisible(n) && !isSnoozed(n);
    }).length;
  }

  function notification(id) {
    var n = db.notifications.filter(function (x) { return x.id === id; })[0];
    /* แก้ได้เฉพาะของตัวเอง ในโหมดทีมทุกคนเขียนไฟล์เดียวกัน */
    return n && n.userId === db.currentUserId ? n : null;
  }

  /** โปรเจกต์ที่การแจ้งเตือนนี้เกี่ยวข้อง (ประกาศ/สถานะ หรือโปรเจกต์ของงาน) */
  function notifProjects(n) {
    var out = n.projectId ? [n.projectId] : [];
    var t = n.taskId ? task(n.taskId) : null;
    if (t) (index().memByTask[rootOf(t).id] || []).forEach(function (m) { out.push(m.projectId); });
    return out;
  }

  var INBOX_RANK = { mention: 50, assigned: 45, access: 45, approval: 40, unblock: 35, overdue: 30, due: 28,
                     comment: 20, message: 15, status: 15, newtask: 10, activity: 0 };

  /**
   * รายการในกล่องแจ้งเตือน
   * @param opts { tab: activity|bookmarks|archive, from, project, mention, toMe, byMe, unread,
   *               sort: new|relevance }
   */
  function inboxList(userId, opts) {
    var who = userId || db.currentUserId;
    opts = opts || {};
    var tab = opts.tab || 'activity';
    var fromU = opts.from ? user(opts.from) : null;
    var list = db.notifications.filter(function (n) {
      if (n.userId !== who || !notifVisible(n)) return false;
      /* Sprint 2B — เลื่อนเตือนอยู่ = ซ่อนจากทุกแท็บ ยกเว้นตอนขอดูรายการที่เลื่อนไว้ (opts.snoozed) */
      if (!!opts.snoozed !== isSnoozed(n)) return false;
      if (tab === 'bookmarks') { if (!n.bookmarked) return false; }
      else if (tab === 'archive') { if (!n.archived) return false; }
      else if (n.archived) return false;
      if (opts.unread && n.read) return false;
      /* Sprint 2B — รายการที่รวมกลุ่มแล้วมีหลายชนิด ตัวกรองดูทุกส่วน ไม่ใช่แค่ส่วนแรก */
      var ks = notifKinds(n);
      if (opts.mention && ks.indexOf('mention') < 0) return false;
      if (opts.toMe && ks.indexOf('assigned') < 0) return false;
      if (opts.byMe) {
        var t = n.taskId ? task(n.taskId) : null;
        if (!t || !t.assigneeId || t.assigneeId === who) return false;
        if (!(t.assignedBy === who || (!t.assignedBy && t.createdBy === who))) return false;
      }
      if (opts.from) {
        if (!(n.actorId === opts.from || (!n.actorId && fromU && n.actorName === fromU.name))) return false;
      }
      if (opts.project && notifProjects(n).indexOf(opts.project) < 0) return false;
      return true;
    });
    if (opts.sort === 'relevance') {
      var score = function (n) {
        return (n.read ? 0 : 1000) + (INBOX_RANK[n.kind] || 0) + (n.bookmarked ? 5 : 0);
      };
      return list.sort(function (a, b) {
        return (score(b) - score(a)) || (notifAt(a) < notifAt(b) ? 1 : -1);
      });
    }
    /* Sprint 2B — รายการที่เพิ่งกลับมาจากการเลื่อนเตือน (wokeAt) ขึ้นบนสุดเหมือนเพิ่งเข้ามา */
    return list.sort(function (a, b) { return notifAt(a) < notifAt(b) ? 1 : -1; });
  }

  /** คนที่เคยทำให้เกิดการแจ้งเตือนถึงฉัน — ตัวเลือกของตัวกรอง "จากใคร" */
  function inboxPeople(userId) {
    var who = userId || db.currentUserId, seen = {}, out = [];
    db.notifications.forEach(function (n) {
      if (n.userId !== who) return;
      var u = n.actorId ? user(n.actorId)
        : db.users.filter(function (x) { return n.actorName && x.name === n.actorName; })[0];
      if (u && !seen[u.id]) { seen[u.id] = true; out.push(u); }
    });
    return out;
  }

  function setNotifRead(id, read) {
    var n = notification(id);
    if (!n || n.read === !!read) return false;
    n.read = !!read;
    commit();
    return true;
  }

  function toggleBookmark(id) {
    var n = notification(id);
    if (!n) return null;
    n.bookmarked = !n.bookmarked;
    commit();
    return n.bookmarked;
  }

  function unarchiveNotification(id) {
    var n = notification(id);
    if (!n || !n.archived) return false;
    n.archived = false;
    commit();
    return true;
  }

  function setInboxPref(key, value) {
    personalOf().inbox[key] = value;
    commit();
  }

  /* ---------- ห้ามรบกวน ----------
   * prefs.dnd = { until: ISO|null, from: 'HH:MM'|null, to: 'HH:MM'|null }
   * ยังสร้างการแจ้งเตือนตามปกติ แค่ไม่ขึ้นตัวเลขแดงที่แถบซ้ายและไม่เด้งข้อความ
   * เปิดกล่องแจ้งเตือนดูเองเมื่อไรก็เห็นครบ ไม่มีอะไรหาย */
  function dndOf(userId) {
    var u = user(userId || db.currentUserId);
    var d = u && u.prefs && u.prefs.dnd;
    return { until: (d && d.until) || null, from: (d && d.from) || null, to: (d && d.to) || null };
  }

  function isDnd(userId, now) {
    var d = dndOf(userId);
    var t = now || new Date();
    if (d.until && Date.parse(d.until) > t.getTime()) return true;
    if (d.from && d.to && d.from !== d.to) {
      var hm = (t.getHours() < 10 ? '0' : '') + t.getHours() + ':' +
               (t.getMinutes() < 10 ? '0' : '') + t.getMinutes();
      return d.from < d.to ? (hm >= d.from && hm < d.to) : (hm >= d.from || hm < d.to);
    }
    return false;
  }

  function setDnd(patch) {
    var u = me();
    if (!u) return;
    u.prefs = u.prefs || {};
    var cur = dndOf(u.id);
    Object.keys(patch || {}).forEach(function (k) { cur[k] = patch[k] || null; });
    u.prefs.dnd = cur;
    commit();
  }

  /* ---------- การแจ้งเตือนรายโปรเจกต์ ----------
   * prefs.projNotify[projectId] = { status, messages, newTasks }
   * ไม่เคยตั้ง: สมาชิก (และเจ้าของ) ได้สถานะกับประกาศ คนอื่นไม่ได้ งานใหม่ปิดไว้สำหรับทุกคน */
  var PROJ_NOTIFY = [
    { id: 'status',   label: 'อัปเดตสถานะของโปรเจกต์', desc: 'เมื่อมีคนรายงานสถานะ ตามแผน เสี่ยง หรือหลุดแผน' },
    { id: 'messages', label: 'ประกาศใหม่',          desc: 'เรื่องของทั้งโปรเจกต์ที่ไม่ได้ผูกกับงานชิ้นไหน' },
    { id: 'newTasks', label: 'งานใหม่ในโปรเจกต์',    desc: 'ทุกครั้งที่มีงานถูกเพิ่มเข้าโปรเจกต์นี้' },
    /* Sprint 2B — ส่วนหนึ่งของปุ่ม "ติดตาม" บนหัวโปรเจกต์ (สถานะ + งานใหม่ + หมุดหมาย) */
    { id: 'milestones', label: 'หมุดหมายสำเร็จ',     desc: 'เมื่อมีคนทำหมุดหมายของโปรเจกต์นี้เสร็จ' }
  ];

  function projNotifyOf(projectId, userId) {
    var u = user(userId || db.currentUserId);
    var all = u && u.prefs && u.prefs.projNotify;
    var p = (all && all[projectId]) || {};
    var pr = project(projectId);
    var member = !!u && ((pr && pr.owner === u.id) ||
      projectMembers(projectId).some(function (m) { return m.userId === u.id; }));
    return {
      status: 'status' in p ? !!p.status : member,
      messages: 'messages' in p ? !!p.messages : member,
      newTasks: !!p.newTasks,
      milestones: !!p.milestones           // Sprint 2B — ไม่เคยตั้ง = ปิด เหมือนงานใหม่
    };
  }

  function setProjNotify(projectId, key, on) {
    var u = me();
    if (!u || !project(projectId)) return;
    u.prefs = u.prefs || {};
    u.prefs.projNotify = u.prefs.projNotify || {};
    var cur = u.prefs.projNotify[projectId] || {};
    cur[key] = !!on;
    u.prefs.projNotify[projectId] = cur;
    commit();
  }

  /** คนที่ควรได้ยินเรื่องนี้ของโปรเจกต์ — ต้องเห็นโปรเจกต์ได้และเปิดหัวข้อนี้ไว้ */
  function projectWatchers(projectId, key) {
    return db.users.filter(function (u) {
      return u.id !== db.currentUserId && u.active !== false &&
        !!projectAccess(projectId, u.id) && projNotifyOf(projectId, u.id)[key];
    }).map(function (u) { return u.id; });
  }

  function notifyNewTask(t, projectId) {
    var p = project(projectId);
    if (!p || !t || t.parentId) return;
    autoFire('added', t.id, { projectId: projectId });   // 3a — งานเข้าโปรเจกต์ (สร้างใหม่หรือเพิ่มเข้ามา)
    var w = projectWatchers(projectId, 'newTasks');
    /* Sprint 2B — ข้อความต่อท้ายชื่อคนได้ ("สมชาย เพิ่มงาน … ใน …") เดิม "สมชาย งานใหม่ …" อ่านไม่เป็นประโยค */
    if (w.length) notifyOnly(t.id, w, 'เพิ่มงาน “{t}” ใน {p}', 'newtask', { t: t.name, p: p.name });
  }

  /* ---------- filter / sort / group ---------- */

  var DUE_FILTERS = [
    { id: 'any',     label: 'ทุกกำหนด' },
    { id: 'overdue', label: 'เลยกำหนด' },
    { id: 'today',   label: 'ครบวันนี้' },
    { id: 'week',    label: 'ภายใน 7 วัน' },
    { id: 'none',    label: 'ไม่มีกำหนด' }
  ];

  var SORTS = [
    { id: 'manual',   label: 'ลำดับที่จัดเอง' },
    { id: 'due',      label: 'กำหนดส่ง' },
    { id: 'priority', label: 'ความสำคัญ' },
    { id: 'name',     label: 'ชื่อ ก-ฮ' },
    { id: 'assignee', label: 'ผู้รับผิดชอบ' },
    { id: 'created',  label: 'วันที่สร้าง' }
  ];

  var GROUPS = [
    { id: 'section',  label: 'เซกชัน' },
    { id: 'assignee', label: 'ผู้รับผิดชอบ' },
    { id: 'priority', label: 'ความสำคัญ' },
    { id: 'due',      label: 'ช่วงกำหนดส่ง' },
    { id: 'none',     label: 'ไม่จัดกลุ่ม' }
  ];

  /* ---------- มุมมองที่โปรเจกต์เปิดใช้ ----------
   *
   * เก็บเป็นรายโปรเจกต์เหมือน Asana เพราะแต่ละงานใช้มุมมองไม่เหมือนกัน
   * ปฏิทินคอนเทนต์แทบไม่ได้ใช้ Gantt ส่วนแผนเปิดตัวสินค้าแทบไม่ได้ใช้บอร์ด
   * แท็บที่ไม่มีใครกดคือสิ่งรบกวนสายตาที่กินตำแหน่งดีที่สุดของหน้าจอไปเปล่า ๆ
   */
  var PROJECT_VIEWS = [
    { id: 'overview',  label: 'ภาพรวม',   icon: 'home',       desc: 'คำอธิบาย สมาชิก และประวัติการรายงานสถานะ' },
    { id: 'list',      label: 'รายการ',   icon: 'menu',       desc: 'ตารางงาน จัดกลุ่มและลากสลับลำดับได้' },
    { id: 'board',     label: 'บอร์ด',    icon: 'grid',       desc: 'คัมบัง ลากงานข้ามคอลัมน์' },
    { id: 'timeline',  label: 'ไทม์ไลน์', icon: 'bars',       desc: 'วางแผนงานตามช่วงเวลา' },
    { id: 'gantt',     label: 'Gantt',    icon: 'subtask',    desc: 'ลำดับก่อนหลังและเส้นฐาน' },
    { id: 'calendar',  label: 'ปฏิทิน',   icon: 'calendar',   desc: 'ดูตามกำหนดส่งรายเดือน' },
    { id: 'dashboard', label: 'สรุปผล',   icon: 'chart',      desc: 'ตัวเลขรวมและความคืบหน้า' },
    { id: 'messages',  label: 'ประกาศ',    icon: 'send',       desc: 'เรื่องของทั้งโปรเจกต์ที่ไม่ได้ผูกกับงานชิ้นไหน' },
    { id: 'pages',     label: 'หน้า',      icon: 'note',       desc: 'เอกสารของโปรเจกต์ บรีฟ สรุปประชุม คู่มือ' },
    { id: 'files',     label: 'ไฟล์',     icon: 'paperclip',  desc: 'ไฟล์แนบทุกชิ้นในโปรเจกต์รวมไว้ที่เดียว' },
    /* 4b — ภาระงานของคนในโปรเจกต์ และสื่อฝัง (เปิดเองเมื่อต้องการ ไม่ขึ้นเป็นแท็บให้โปรเจกต์ที่ยังไม่เคยเลือกมุมมอง) */
    { id: 'workload',  label: 'ภาระงาน',  icon: 'users',      desc: 'ใครรับงานเท่าไรในแต่ละวัน/สัปดาห์ เทียบกับความจุ' },
    { id: 'embed',     label: 'สื่อฝัง',    icon: 'link',       desc: 'ฝัง Google Docs/Sheets/Slides, Figma, Miro, Loom, YouTube หรือไฟล์ Microsoft 365', optIn: true }
  ];

  /* ---------- ประกาศของโปรเจกต์ ----------
   *
   * ความเห็นต้องเกาะอยู่กับงานเสมอ แต่บางเรื่องไม่ได้เป็นของงานชิ้นไหนเลย
   * เช่น สรุปประชุมประจำสัปดาห์ หรือประกาศเลื่อนกำหนดทั้งโปรเจกต์
   * เดิมของพวกนี้ต้องไปแปะไว้ในงานสักชิ้นแบบฝืน ๆ แล้วก็หาไม่เจอในภายหลัง
   */
  function projectMessages(projectId) {
    var p = msgHost(projectId);
    return ((p && p.messages) || []).slice().reverse();   // ใหม่สุดก่อน
  }

  function addProjectMessage(projectId, title, body, atts) {
    var p = msgHost(projectId);
    if (!p || !body || !body.trim()) return null;
    if (!canInProject(projectId, 'comment')) return null;
    snapshot('ประกาศในโปรเจกต์');
    p.messages = p.messages || [];
    var m = {
      id: uid('pm'), title: (title || '').trim(), body: body.trim(),
      by: db.currentUserId, at: new Date().toISOString(),
      /* 3c — คำตอบ คนที่เข้าร่วม (ได้แจ้งเตือนเมื่อมีคนตอบ) และไฟล์แนบ */
      replies: [], followers: [db.currentUserId],
      atts: (atts || []).map(cleanFile).filter(Boolean).slice(0, MSG_ATT_MAX)
    };
    p.messages.push(m);
    var men = parseMentions(m.body);
    men.forEach(function (u) { if (m.followers.indexOf(u) < 0) m.followers.push(u); });
    if (men.length) notifyOnly(null, men, 'พูดถึงคุณในประกาศของ {p}', 'mention', { p: p.name }, false, msgNotifExtra(projectId));

    /* แจ้งเตือนสมาชิกที่ระบุตัวได้ (เปิดไว้เป็นค่าเริ่มต้น) กับคนที่เปิดรับประกาศของโปรเจกต์นี้เอง
     * โปรเจกต์ที่เปิดให้ทั้งองค์กรไม่มีรายชื่อ ถ้ายิงหาทุกคนจะกลายเป็นสแปมทั้งบริษัท
     * สมาชิกที่ปิดไว้ในการแจ้งเตือนของโปรเจกต์จะไม่ได้รับ */
    var mem = hostWatchers(projectId).filter(function (u) { return men.indexOf(u) < 0; });
    if (mem.length) {
      notifyOnly(null, mem, 'ประกาศใหม่ใน {p}', 'message', { p: p.name }, false,
        msgNotifExtra(projectId));
    }
    audit('project.message', p.name, m.title || m.body.slice(0, 40));
    commit();
    return m;
  }

  function deleteProjectMessage(projectId, msgId) {
    var p = msgHost(projectId);
    if (!p) return false;
    var dm = (p.messages || []).filter(function (m) { return m.id === msgId; })[0];
    if (!dm || (dm.by !== db.currentUserId && !can('manage'))) return false;
    var before = (p.messages || []).length;
    snapshot('ลบประกาศ');
    p.messages = (p.messages || []).filter(function (m) { return m.id !== msgId; });
    commit();
    return p.messages.length < before;
  }

  /** ไฟล์แนบทุกชิ้นในโปรเจกต์ พร้อมงานที่มันอยู่ ใหม่สุดก่อน */
  function filesOfProject(projectId) {
    var out = [];
    tasksInProject(projectId).forEach(function (x) {
      if (!canSeeTask(x.task.id)) return;
      (x.task.attachments || []).forEach(function (a) {
        out.push({ att: a, task: x.task });
      });
    });
    /* ไฟล์เก่าไม่มีวันที่เก็บไว้ จึงเรียงตามวันที่งานถูกสร้างแทน
     * ดีกว่าเรียงมั่ว ๆ และไม่ต้องแปลงข้อมูลเก่าย้อนหลัง */
    return out.sort(function (a, b) {
      var ka = a.att.addedAt || a.task.createdAt || '';
      var kb = b.att.addedAt || b.task.createdAt || '';
      return ka < kb ? 1 : -1;
    });
  }

  /** มุมมองที่โปรเจกต์นี้เปิดอยู่ ไม่เคยตั้ง = เปิดครบทุกมุมมอง */
  function projectViews(projectId) {
    var p = project(projectId);
    var ids = p && p.views;
    if (!ids || !ids.length) return PROJECT_VIEWS.filter(function (v) { return !v.optIn; }).map(function (v) { return v.id; });
    /* เรียงตามลำดับมาตรฐานเสมอ ไม่ใช่ตามลำดับที่กดเปิด
     * ไม่งั้นแท็บจะสลับที่ทุกครั้งที่เพิ่มมุมมอง แล้วคนกดผิดเพราะจำตำแหน่งเดิมไว้ */
    return PROJECT_VIEWS.map(function (v) { return v.id; })
      .filter(function (id) { return ids.indexOf(id) >= 0; });
  }

  /** เปิดหรือปิดมุมมอง คืน false ถ้าปิดไม่ได้เพราะจะไม่เหลือมุมมองเลย */
  function toggleProjectView(projectId, viewId) {
    var p = project(projectId);
    if (!p) return false;
    var cur = projectViews(projectId);
    var on = cur.indexOf(viewId) >= 0;
    if (on && cur.length <= 1) return false;      // ต้องเหลืออย่างน้อยหนึ่งมุมมอง
    snapshot(on ? 'ปิดมุมมอง' : 'เปิดมุมมอง');
    p.views = on ? cur.filter(function (x) { return x !== viewId; })
                 : cur.concat([viewId]);
    /* มุมมองเริ่มต้นต้องเป็นอันที่ยังเปิดอยู่ ไม่งั้นเปิดโปรเจกต์มาแล้วเจอหน้าว่าง */
    var left = projectViews(projectId);
    if (left.indexOf(p.defaultView) < 0) p.defaultView = left[0];
    /* เก็บชื่อมุมมองเป็นคีย์คำแปล ไม่ใช่ id ดิบ บันทึกจะได้อ่านออกทั้งสองภาษา */
    var vdef = PROJECT_VIEWS.filter(function (v) { return v.id === viewId; })[0];
    audit(on ? 'project.viewOff' : 'project.viewOn', p.name, vdef ? vdef.label : viewId);
    commit();
    return true;
  }

  /* ---------- ตัวเลือกเฉพาะของ Gantt ---------- */

  var GANTT_ZOOMS = [
    { id: 'day',     label: 'วัน' },
    { id: 'week',    label: 'สัปดาห์' },
    { id: 'month',   label: 'เดือน' },
    { id: 'quarter', label: 'ไตรมาส' },
    { id: 'half',    label: 'ครึ่งปี' },
    { id: 'year',    label: 'ปี' }
  ];

  var COLOR_BYS = [
    { id: 'theme',    label: 'สีของโปรเจกต์' },
    { id: 'priority', label: 'ความสำคัญ' },
    { id: 'assignee', label: 'ผู้รับผิดชอบ' },
    { id: 'type',     label: 'ชนิดงาน' },
    { id: 'approval', label: 'สถานะอนุมัติ' },
    { id: 'progress', label: 'ความคืบหน้า' }
  ];

  var GANTT_COLS = [
    { id: 'due',       label: 'กำหนดส่ง' },
    { id: 'blockedBy', label: 'รออะไรอยู่' },
    { id: 'duration',  label: 'ระยะเวลา' },
    { id: 'blocking',  label: 'บล็อกงานอะไร' }
  ];

  /* ---------- 2b — มุมมองของโปรเจกต์ ----------
   *
   * มุมมองหนึ่งชุด (ตัวกรอง เรียง จัดกลุ่ม คอลัมน์ บอร์ด ปฏิทิน ไทม์ไลน์ Gantt) เป็นอ็อบเจ็กต์เดียว
   * ใช้ทั้งเป็นมุมมองที่ทำงานอยู่ของแต่ละคน (personal.pv[projectId]) และเป็นแท็บที่บันทึกไว้ (project.savedViews)
   * ทั้งสองที่เก็บเฉพาะคีย์ที่ต่างจากค่าเริ่มต้น (viewDiff) แล้วเติมกลับตอนอ่าน (fillView) ไฟล์ข้อมูลกลางจึงไม่บวม
   *
   *   filters  [{ f, op, v }]   f = 'assignee' | 'createdBy' | 'section' | 'priority' | 'type' | 'tags'
   *                                 | 'due' | 'start' | 'created' | 'completedOn' | 'modified'
   *                                 | 'completed' | 'blocked' | 'name' | 'field:<id>'
   *                             op ตามชนิด (FILTER_OPS)  v = อาร์เรย์ค่า (คน/ตัวเลือก) ตัวเลข วันที่ หรือ [a, b]
   *                             คนใช้ '@me' แทน "ฉัน" — ตีความตอนกรอง แท็บเดียวกันจึงเห็นงานของใครของมัน
   *   sorts    [{ k, d }]       เรียงหลายชั้น k = คีย์ใน SORTS หรือ 'field:<id>'  d = 'asc' | 'desc'
   *                             sort / sortDir ยังอยู่เป็นสำเนาของชั้นแรก ให้โค้ดเก่าที่อ่านสองคีย์นี้ใช้ต่อได้
   *   group    'section' | 'assignee' | 'priority' | 'due' | 'none' | 'field:<id>' (select/person/date)
   *   showEmpty แสดงกลุ่มที่ไม่มีงาน
   *   cols / colShow / foot   ลำดับคอลัมน์ในรายการ เปิดปิดคอลัมน์ และสรุปท้ายคอลัมน์ตัวเลข
   *   collapsed { groupKey: true } กลุ่มที่ยุบในรายการ
   *   bGroup / bSwim / bSize / bCard / bCollapsed   บอร์ด: คอลัมน์ตาม แถวตาม ขนาดการ์ด ฟิลด์บนการ์ด คอลัมน์ที่ยุบ
   *   cMode / cWeekends / cColorBy   ปฏิทิน      tColorBy   ไทม์ไลน์
   */
  function defaultView() {
    return {
      assignee: '', priority: '', tag: '', due: 'any', q: '',
      showCompleted: true, sort: 'manual', sortDir: 'asc', group: 'section',
      filters: [], sorts: [], showEmpty: false,
      cols: [], colShow: {}, foot: {}, collapsed: {},
      bGroup: 'section', bSwim: 'none', bSize: 'm', bCard: {}, bCollapsed: {},
      cMode: 'month', cWeekends: true, cColorBy: 'project',
      tColorBy: 'priority',
      critical: false,          // 3c — ไฮไลต์เส้นทางวิกฤต (Gantt และไทม์ไลน์)

      /* --- Gantt --- */
      gZoom: 'month',
      gColorBy: 'theme',
      gCols: { due: true, blockedBy: true, duration: false, blocking: false },
      gSubtasks: 'collapsed',
      gShowBaseline: false
    };
  }

  var LEGACY_DUE = { overdue: 'overdue', today: 'today', week: 'week', none: 'empty' };

  /** เติมคีย์ที่ยังไม่มีให้มุมมองเก่า และแปลงตัวกรองแบบเดิมเป็นเงื่อนไขของตัวสร้างตัวกรอง
   *
   * มุมมองที่ผู้ใช้บันทึกไว้ก่อนมีตัวเลือก Gantt จะขาดคีย์ใหม่ทั้งหมด
   * ถ้าไม่เติม พอโหลดมุมมองนั้นแล้ว Gantt จะอ่านค่า undefined แล้วหน้าพัง
   *
   * ตัวกรองสี่ช่องแบบเดิม (ผู้รับผิดชอบ ความสำคัญ แท็ก กำหนดส่ง) กลายเป็นเงื่อนไขหนึ่งแถวต่อช่อง
   * แล้วล้างช่องเดิมทิ้ง ไม่งั้นจะกรองซ้ำสองชั้นและลบออกจากตัวสร้างไม่ได้
   * ส่วน sort/sortDir ถ้ามีโค้ดตั้งตรง ๆ (คลิกหัวคอลัมน์) จะถูกยกเป็นชั้นแรกของ sorts ที่นี่
   */
  function fillView(v) {
    var base = defaultView();
    if (!v) return base;
    Object.keys(base).forEach(function (k) {
      if (!(k in v) || v[k] === null || v[k] === undefined) v[k] = base[k];
    });
    v.gCols = v.gCols || base.gCols;
    Object.keys(base.gCols).forEach(function (k) {
      if (!(k in v.gCols)) v.gCols[k] = base.gCols[k];
    });
    ['filters', 'sorts', 'cols'].forEach(function (k) { if (!Array.isArray(v[k])) v[k] = []; });
    ['colShow', 'foot', 'collapsed', 'bCard', 'bCollapsed'].forEach(function (k) {
      if (!v[k] || typeof v[k] !== 'object' || Array.isArray(v[k])) v[k] = {};
    });
    if (v.assignee) { v.filters.push({ f: 'assignee', op: 'is', v: [v.assignee] }); v.assignee = ''; }
    if (v.priority) { v.filters.push({ f: 'priority', op: 'is', v: [v.priority] }); v.priority = ''; }
    if (v.tag) { v.filters.push({ f: 'tags', op: 'any', v: [v.tag] }); v.tag = ''; }
    if (v.due && v.due !== 'any') {
      if (LEGACY_DUE[v.due]) v.filters.push({ f: 'due', op: LEGACY_DUE[v.due], v: null });
      v.due = 'any';
    }
    /* ชั้นแรกของการเรียงกับ sort/sortDir ต้องตรงกันเสมอ */
    if (!v.sort || v.sort === 'manual') v.sorts = [];
    else if (!v.sorts.length || v.sorts[0].k !== v.sort || v.sorts[0].d !== v.sortDir) {
      var rest = v.sorts.filter(function (s) { return s && s.k !== v.sort; });
      v.sorts = [{ k: v.sort, d: v.sortDir === 'desc' ? 'desc' : 'asc' }].concat(rest);
    }
    return v;
  }

  /** ตั้งการเรียงหลายชั้นทีเดียว แล้วคัดลอกชั้นแรกไปไว้ที่ sort/sortDir */
  function setSorts(v, list) {
    var seen = {};
    v.sorts = (list || []).filter(function (s) {
      if (!s || !s.k || s.k === 'manual' || seen[s.k]) return false;
      seen[s.k] = true;
      return true;
    }).slice(0, 5);
    v.sort = v.sorts.length ? v.sorts[0].k : 'manual';
    v.sortDir = v.sorts.length ? v.sorts[0].d : 'asc';
    return v;
  }

  /** เก็บเฉพาะคีย์ที่ต่างจากค่าเริ่มต้น — ใช้ตอนบันทึกลงข้อมูลกลาง */
  function viewDiff(v) {
    var base = defaultView(), out = {};
    fillView(v);
    Object.keys(v).forEach(function (k) {
      if (!(k in base)) return;
      if (JSON.stringify(v[k]) !== JSON.stringify(base[k])) out[k] = clone(v[k]);
    });
    return out;
  }

  /* ---------- ตัวสร้างตัวกรอง ---------- */

  var ME = '@me';

  var FILTER_BUILTIN = [
    { id: 'assignee',    label: 'ผู้รับผิดชอบ',  kind: 'person' },
    { id: 'createdBy',   label: 'สร้างโดย',      kind: 'person' },
    { id: 'section',     label: 'เซกชัน',       kind: 'select' },
    { id: 'priority',    label: 'ความสำคัญ',    kind: 'select' },
    { id: 'type',        label: 'ชนิดงาน',      kind: 'select' },
    { id: 'cstatus',     label: 'สถานะ (ชนิดงาน)', kind: 'select' },
    { id: 'tags',        label: 'แท็ก',         kind: 'multi' },
    { id: 'due',         label: 'กำหนดส่ง',     kind: 'date' },
    { id: 'start',       label: 'วันเริ่ม',      kind: 'date' },
    { id: 'created',     label: 'วันที่สร้าง',   kind: 'date' },
    { id: 'completedOn', label: 'วันที่ทำเสร็จ', kind: 'date' },
    { id: 'modified',    label: 'แก้ไขล่าสุด',   kind: 'date' },
    { id: 'completed',   label: 'ทำเสร็จแล้ว',  kind: 'bool' },
    { id: 'blocked',     label: 'ถูกบล็อกอยู่',  kind: 'bool' },
    { id: 'name',        label: 'ชื่องาน',      kind: 'text' },
    { id: 'estimate',    label: 'เวลาประมาณ (ชม.)', kind: 'number' },
    { id: 'actual',      label: 'เวลาจริง (ชม.)',   kind: 'number' }
  ];

  var FILTER_OPS = {
    person: [['is', 'เป็น'], ['not', 'ไม่เป็น'], ['empty', 'ว่าง'], ['notempty', 'ไม่ว่าง']],
    select: [['is', 'เป็น'], ['not', 'ไม่เป็น'], ['empty', 'ว่าง'], ['notempty', 'ไม่ว่าง']],
    multi:  [['any', 'มีอย่างใดอย่างหนึ่ง'], ['all', 'มีครบทุกค่า'], ['none', 'ไม่มี'],
             ['empty', 'ว่าง'], ['notempty', 'ไม่ว่าง']],
    date:   [['overdue', 'เลยมาแล้ว'], ['today', 'วันนี้'], ['week', 'ภายใน 7 วันข้างหน้า'],
             ['next', 'ภายใน N วันข้างหน้า'], ['last', 'ย้อนหลัง N วัน'],
             ['before', 'ก่อนวันที่'], ['after', 'หลังวันที่'], ['on', 'ตรงวันที่'], ['between', 'ระหว่าง'],
             ['empty', 'ว่าง'], ['notempty', 'ไม่ว่าง']],
    number: [['eq', '='], ['ne', '≠'], ['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'],
             ['empty', 'ว่าง'], ['notempty', 'ไม่ว่าง']],
    text:   [['contains', 'มีคำว่า'], ['notcontains', 'ไม่มีคำว่า'], ['empty', 'ว่าง'], ['notempty', 'ไม่ว่าง']],
    bool:   [['yes', 'ใช่'], ['no', 'ไม่ใช่']]
  };

  /* ค้นหาขั้นสูง (2c) — เงื่อนไขชุดเดียวกับตัวกรองของโปรเจกต์ บวกของที่มีความหมายเมื่อค้นข้ามโปรเจกต์
   * ใช้ projectId = '*' กับ filterFields / filterField / filterChoices */
  var SEARCH_BUILTIN = [
    { id: 'project',    label: 'โปรเจกต์',          kind: 'multi' },
    { id: 'psection',   label: 'เซกชัน (เซกชัน)',   kind: 'multi' },
    { id: 'assignedBy', label: 'มอบหมายโดย',        kind: 'person' },
    { id: 'followers',  label: 'ผู้ติดตาม',          kind: 'multi' },
    { id: 'attachment', label: 'มีไฟล์แนบ',         kind: 'bool' },
    { id: 'blocking',   label: 'กำลังบล็อกงานอื่น',  kind: 'bool' },
    { id: 'subtask',    label: 'เป็นงานย่อย',        kind: 'bool' }
  ];

  /** ฟิลด์ที่สร้างเองทุกอันที่คนนี้เห็น (โปรเจกต์ที่เข้าได้ + คลังฟิลด์) ไม่ซ้ำรหัส */
  function visibleFieldDefs() {
    var out = [], seen = {};
    (db.fieldLib || []).forEach(function (f) { seen[f.id] = true; out.push({ f: f, lib: true }); });
    visibleProjects().forEach(function (p) {
      (p.fields || []).forEach(function (f) {
        if (seen[f.id]) return;
        seen[f.id] = true;
        out.push({ f: f, p: p });
      });
    });
    return out;
  }

  /** ฟิลด์ที่กรองได้ในโปรเจกต์นี้ — ของในตัวก่อน ตามด้วยฟิลด์ที่สร้างเอง  ('*' = ค้นหาขั้นสูง) */
  function filterFields(projectId) {
    if (String(projectId || '').indexOf('pf:') === 0) return pfFilterFields(projectId.slice(3));   // 4a — แถวของพอร์ตโฟลิโอ
    if (projectId === '*') {
      var all = FILTER_BUILTIN.filter(function (x) { return x.id !== 'section'; }).concat(SEARCH_BUILTIN);
      visibleFieldDefs().forEach(function (x) {
        all.push({ id: 'field:' + x.f.id, label: x.f.name + (x.p ? ' · ' + x.p.name : ''),
          kind: fieldKind(x.f), field: x.f, custom: true });
      });
      return all;
    }
    /* 3a — เงื่อนไขของอัตโนมัติ 'a:<pid>' = ของโปรเจกต์นั้น + "อยู่ในโปรเจกต์ใดก็ได้" */
    if (String(projectId || '').indexOf('a:') === 0) {
      return filterFields(projectId.slice(2)).concat([SEARCH_BUILTIN[0]]);
    }
    var p = project(projectId);
    var out = FILTER_BUILTIN.slice();
    ((p && p.fields) || []).forEach(function (f) {
      out.push({ id: 'field:' + f.id, label: f.name, kind: fieldKind(f), field: f, custom: true });
    });
    return out;
  }

  function filterField(projectId, fid) {
    return filterFields(projectId).filter(function (x) { return x.id === fid; })[0] || null;
  }

  /** ตัวเลือกให้ติ๊กของเงื่อนไขชนิดคน/ตัวเลือก [[ค่า, ป้าย, สี]] */
  function filterChoices(projectId, fid) {
    if (String(projectId || '').indexOf('pf:') === 0) return pfFilterChoices(projectId.slice(3), fid);
    var def = filterField(projectId, fid);
    if (String(projectId || '').indexOf('a:') === 0) projectId = projectId.slice(2);
    var p = project(projectId);
    if (!def) return [];
    if (def.kind === 'person' || fid === 'followers') {
      return [[ME, 'ฉัน', null]].concat(db.users.filter(function (u) { return u.active !== false; })
        .map(function (u) { return [u.id, u.name, u.color]; }));
    }
    if (fid === 'project') {
      return visibleProjects().map(function (x) { return [x.id, x.name, x.color]; });
    }
    if (fid === 'psection') {
      var secs = [];
      visibleProjects().forEach(function (x) {
        x.sections.forEach(function (s) { secs.push([s.id, x.name + ' › ' + s.name, x.color]); });
      });
      return secs;
    }
    if (fid === 'section') return (p ? p.sections : []).map(function (s) { return [s.id, s.name, null]; });
    if (fid === 'priority') return PRIORITIES.filter(function (x) { return x.id !== 'none'; })
      .map(function (x) { return [x.id, x.label, x.color]; });
    if (fid === 'type') return typeChoices(projectId).map(function (x) { return [x.id, (x.custom ? x.icon + ' ' : '') + x.label, null]; });
    if (fid === 'cstatus') return statusChoices(projectId);
    if (fid === 'tags') return allTags().map(function (x) { return [x, x, null]; });
    if (def.field && def.field.options) {
      return def.field.options.map(function (o) { return [o.name, o.name, o.color]; });
    }
    return [];
  }

  /** วันที่แก้ไขล่าสุดของงาน — บรรทัดล่าสุดในประวัติ ไม่มีก็ใช้วันที่สร้าง */
  function lastModified(taskId) {
    var st = index().storyByTask[taskId] || [];
    var best = '';
    st.forEach(function (s) { if ((s.createdAt || '') > best) best = s.createdAt; });
    if (best) return best.slice(0, 10);
    var t = task(taskId);
    return t && t.createdAt ? String(t.createdAt).slice(0, 10) : null;
  }

  /** ค่าดิบของงานในฟิลด์หนึ่ง ใช้ทั้งกรอง เรียง จัดกลุ่ม และสรุปท้ายคอลัมน์ */
  function taskValue(t, fid, m) {
    switch (fid) {
      case 'assignee':    return t.assigneeId || null;
      case 'createdBy':   return t.createdBy || null;
      case 'section':     return m ? m.sectionId : null;
      case 'priority':    return t.priority && t.priority !== 'none' ? t.priority : null;
      case 'type':        return t.ctype || t.type || 'task';     // 3b — ชนิดกำหนดเองแทนชนิดพื้นฐาน
      case 'cstatus':     return t.cstatus || null;
      case 'tags':        return t.tags || [];
      case 'due':         return t.dueOn || null;
      case 'start':       return t.startOn || null;
      case 'created':     return t.createdAt ? String(t.createdAt).slice(0, 10) : null;
      case 'completedOn': return t.completedAt ? String(t.completedAt).slice(0, 10) : null;
      case 'modified':    return lastModified(t.id);
      case 'completed':   return !!t.completed;
      case 'blocked':     return !t.completed && isBlocked(t.id);
      case 'name':        return t.name;
      /* 2c — ค้นหาขั้นสูง โปรเจกต์/คอลัมน์ของงานย่อยยึดงานต้นทาง */
      case 'assignedBy':  return t.assigneeId ? (t.assignedBy || null) : null;
      case 'followers':   return t.followers || [];
      case 'attachment':  return !!(t.attachments && t.attachments.length);
      case 'blocking':    return blocking(t.id).some(function (x) { return !x.completed; });
      case 'subtask':     return !!t.parentId;
      case 'estimate':    var re3 = timeRollup(t); return re3.hasEst ? Math.round(re3.est / 0.6) / 100 : null;   // 3c — ชั่วโมง
      case 'actual':      var ra3 = timeRollup(t).act; return ra3 ? Math.round(ra3 / 0.6) / 100 : null;
      case 'project':
      case 'psection':
        return (index().memByTask[rootOf(t).id] || []).map(function (x) {
          return fid === 'project' ? x.projectId : x.sectionId;
        });
    }
    if (fid && fid.indexOf('field:') === 0) {
      var v = fieldValue(t.id, fid.slice(6));
      if (v !== null && v !== undefined) {
        var fd = fieldDef(fid.slice(6));
        if (fd && fd.type === 'id') return fieldText(fd, v);   // กรองรหัสงานด้วยข้อความ REQ-12
        if (fd && fd.type === 'ref') return refNames(v) || null;   // 3c — กรองฟิลด์อ้างอิงด้วยชื่อ
      }
      return v === undefined ? null : v;
    }
    return null;
  }

  function meIs(list) {
    return [].concat(list || []).map(function (x) { return x === ME ? db.currentUserId : x; });
  }

  function condKind(fid) {
    var b = FILTER_BUILTIN.concat(SEARCH_BUILTIN).filter(function (x) { return x.id === fid; })[0];
    if (b) return b.kind;
    if (fid && fid.indexOf('field:') === 0) {
      var f = fieldDef(fid.slice(6));
      return f ? fieldKind(f) : null;
    }
    return null;
  }

  /** ตรงเงื่อนไขหนึ่งแถวไหม — เงื่อนไขที่ยังกรอกไม่ครบถือว่าผ่าน ไม่ซ่อนงานทั้งหมดตอนกำลังเลือกค่า */
  function matchCond(t, c, m) {
    if (!c || !c.f) return true;
    var kind = condKind(c.f);
    if (!kind) return true;                         // ฟิลด์ถูกลบไปแล้ว
    return matchValue(kind, taskValue(t, c.f, m), c, c.f === 'due' && t.completed);
  }

  /** ตรงเงื่อนไขไหม เมื่อรู้ชนิดและค่าแล้ว — ใช้ร่วมกับแถวของพอร์ตโฟลิโอ (4a)
   *  doneSkipOverdue = ค่านี้เป็นกำหนดส่งของของที่เสร็จแล้ว จึงไม่นับว่าเลยกำหนด */
  function matchValue(kind, val, c, doneSkipOverdue) {
    var empty = val === null || val === undefined || val === '' || (Array.isArray(val) && !val.length);
    var op = c.op;
    if (op === 'empty') return kind === 'bool' ? !val : empty;
    if (op === 'notempty') return kind === 'bool' ? !!val : !empty;
    var td = today();
    if (kind === 'person' || kind === 'select') {
      var want = meIs(c.v);
      if (!want.length) return true;
      var hit = !empty && want.indexOf(val) >= 0;
      return op === 'not' ? !hit : hit;
    }
    if (kind === 'multi') {
      var w = meIs(c.v);
      if (!w.length) return true;
      var arr = empty ? [] : [].concat(val);
      var has = function (x) { return arr.indexOf(x) >= 0; };
      if (op === 'all') return w.every(has);
      if (op === 'none') return !w.some(has);
      return w.some(has);
    }
    if (kind === 'bool') return op === 'no' ? !val : !!val;
    if (kind === 'text') {
      if (!c.v) return true;
      var hay = String(val || '').toLowerCase(), q = String(c.v).toLowerCase();
      return op === 'notcontains' ? hay.indexOf(q) < 0 : hay.indexOf(q) >= 0;
    }
    if (kind === 'number') {
      if (c.v === '' || c.v === null || c.v === undefined || isNaN(+c.v)) return true;
      if (empty) return false;
      var n = +val, x = +c.v;
      return op === 'ne' ? n !== x : op === 'gt' ? n > x : op === 'gte' ? n >= x
        : op === 'lt' ? n < x : op === 'lte' ? n <= x : n === x;
    }
    if (kind === 'date') {
      var d = empty ? null : String(val).slice(0, 10);
      if (op === 'overdue') return !!d && d < td && !doneSkipOverdue;
      if (op === 'today') return d === td;
      if (op === 'week') return !!d && d >= td && d <= addDays(td, 7);
      var N = Math.max(0, parseInt(c.v, 10) || 0);
      if (op === 'next') return !!d && d >= td && d <= addDays(td, N);
      if (op === 'last') return !!d && d <= td && d >= addDays(td, -N);
      if (op === 'between') {
        var a = c.v && c.v[0], b = c.v && c.v[1];
        if (!a && !b) return true;
        return !!d && (!a || d >= a) && (!b || d <= b);
      }
      if (!c.v) return true;
      if (op === 'before') return !!d && d < c.v;
      if (op === 'after') return !!d && d > c.v;
      if (op === 'on') return d === c.v;
    }
    return true;
  }

  function matchesFilter(t, f, m) {
    if (f.assignee && t.assigneeId !== f.assignee) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.tag && t.tags.indexOf(f.tag) < 0) return false;
    if (!f.showCompleted && t.completed) return false;
    /* ค้นในชื่อ รายละเอียด แท็ก และชื่อผู้รับผิดชอบ
     * ที่รวมชื่อคนด้วยเพราะ "งานของสมชายในโปรเจกต์นี้" เป็นสิ่งที่คนพิมพ์หากันจริง
     * โดยไม่ต้องไปเปิดตัวกรองผู้รับผิดชอบอีกที */
    if (f.q) {
      var q = f.q.trim().toLowerCase();
      if (q) {
        var au = user(t.assigneeId);
        var hay = (t.name + ' ' + plainText(t.notes, true) + ' ' + (t.tags || []).join(' ') +
                   ' ' + (au ? au.name : '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
    }
    if (f.due && f.due !== 'any') {
      var td = today();
      if (f.due === 'none' && t.dueOn) return false;
      if (f.due === 'overdue' && !(t.dueOn && t.dueOn < td && !t.completed)) return false;
      if (f.due === 'today' && t.dueOn !== td) return false;
      if (f.due === 'week' && !(t.dueOn && t.dueOn >= td && t.dueOn <= addDays(td, 7))) return false;
    }
    var conds = f.filters || [];
    for (var i = 0; i < conds.length; i++) {
      if (!matchCond(t, conds[i], m)) return false;
    }
    return true;
  }

  /** จำนวนเงื่อนไขที่ใช้อยู่ (ไว้ติดบนปุ่มตัวกรอง) */
  function filterCount(v) {
    var n = (v.filters || []).length;
    if (v.assignee) n++;
    if (v.priority) n++;
    if (v.tag) n++;
    if (v.due && v.due !== 'any') n++;
    if (!v.showCompleted) n++;
    return n;
  }

  function prioRank(id) {
    var p = PRIORITIES.filter(function (x) { return x.id === id; })[0];
    return p ? p.rank : 9;
  }

  /** ค่าที่ใช้เทียบของฟิลด์ที่สร้างเอง แปลงให้เทียบกันได้ตามชนิด */
  function fieldSortKey(t, fieldId) {
    var rd3 = fieldDef(fieldId);
    if (rd3 && rd3.type === 'ref') return refNames(fieldValue(t.id, fieldId)) || null;
    var v = fieldValue(t.id, fieldId);
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    if (v.length && typeof v !== 'string') return v.join(', ');   // multi-select
    var u = user(v);
    return u ? u.name : String(v);
  }

  /** เทียบสองงานด้วยคีย์เดียว ช่องว่างไปอยู่ท้ายเสมอไม่ว่าจะเรียงทางไหน */
  function cmpBy(ta, tb, sort, sign) {
    var fieldId = (sort.indexOf('field:') === 0) ? sort.slice(6) : null;
    var va, vb;
    if (fieldId) { va = fieldSortKey(ta, fieldId); vb = fieldSortKey(tb, fieldId); }
    else if (sort === 'priority') {
      va = ta.priority === 'none' ? null : prioRank(ta.priority);
      vb = tb.priority === 'none' ? null : prioRank(tb.priority);
    } else if (sort === 'name') { va = ta.name; vb = tb.name; }
    else if (sort === 'cstatus') { va = statusRank(ta); vb = statusRank(tb); }      // 3b — ตามลำดับสถานะ
    else if (sort === 'type') { va = L(typeName(ta)); vb = L(typeName(tb)); }
    else if (sort === 'assignee' || sort === 'createdBy') {
      var ua = user(sort === 'assignee' ? ta.assigneeId : ta.createdBy);
      var ub = user(sort === 'assignee' ? tb.assigneeId : tb.createdBy);
      va = ua ? ua.name : null; vb = ub ? ub.name : null;
    } else if (sort === 'created') {
      /* วันที่สร้างแบบ "น้อยไปมาก" เดิมคือใหม่สุดก่อน คงไว้ คนที่ใช้อยู่จะไม่เห็นลำดับกลับหัว */
      va = ta.createdAt || null; vb = tb.createdAt || null;
      if (va && vb && va !== vb) return sign * (va < vb ? 1 : -1);
    } else {
      va = taskValue(ta, sort); vb = taskValue(tb, sort);
    }
    if ((va === null || va === undefined) && (vb === null || vb === undefined)) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return sign * (va - vb);
    return sign * String(va).localeCompare(String(vb), 'th');
  }

  /** เรียง [{task}] — รับได้ทั้ง (items, 'key', 'asc') แบบเดิม และ (items, [{k, d}, …]) แบบหลายชั้น */
  function sortItems(items, sort, dir) {
    var keys = Array.isArray(sort) ? sort
      : (!sort || sort === 'manual') ? [] : [{ k: sort, d: dir }];
    keys = keys.filter(function (s) { return s && s.k && s.k !== 'manual'; });
    if (!keys.length) return items;
    var copy = items.slice();
    copy.sort(function (a, b) {
      for (var i = 0; i < keys.length; i++) {
        var r = cmpBy(a.task, b.task, keys[i].k, keys[i].d === 'desc' ? -1 : 1);
        if (r) return r;
      }
      return 0;
    });
    return copy;
  }

  /** คนที่ควรมีกลุ่มเมื่อ "แสดงกลุ่มว่าง" — สมาชิกโปรเจกต์ ไม่มีรายชื่อก็ทุกคนที่ใช้งานอยู่ */
  function groupPeople(projectId) {
    var mem = projectMembers(projectId).map(function (m) { return m.userId; });
    var p = project(projectId);
    if (p && p.owner && mem.indexOf(p.owner) < 0) mem.push(p.owner);
    return db.users.filter(function (u) {
      return u.active !== false && (!mem.length || mem.indexOf(u.id) >= 0);
    });
  }

  /** คืน [{key, label, items, set}] ตามการจัดกลุ่มที่เลือก
   *  set = { by, key } ค่าที่ต้องตั้งให้งานที่ถูกลากมาวางในกลุ่มนี้ (null = วางไม่ได้)
   *  opts.showEmpty  แสดงกลุ่มที่ว่าง (ตัวเลือกที่ยังไม่มีงาน คนที่ยังไม่มีงาน) */
  function groupItems(projectId, items, group, opts) {
    opts = opts || {};
    var showEmpty = !!opts.showEmpty;
    var out = [];
    function push(g) { if (showEmpty || g.items.length) out.push(g); }
    var fieldId = group && group.indexOf('field:') === 0 ? group.slice(6) : null;
    var f = fieldId ? ((project(projectId) || {}).fields || []).filter(function (x) { return x.id === fieldId; })[0] : null;
    if (fieldId && !f) group = 'section';           // ฟิลด์ถูกลบไปแล้ว กลับไปจัดตามคอลัมน์

    if (group === 'assignee' || (f && f.type === 'person')) {
      var val = function (x) { return f ? (fieldValue(x.task.id, f.id) || '') : (x.task.assigneeId || ''); };
      var by = f ? group : 'assignee';
      var seen = {};
      items.forEach(function (x) { seen[val(x)] = true; });
      var people = showEmpty ? groupPeople(projectId) : [];
      db.users.forEach(function (u) {
        if (!seen[u.id] && people.indexOf(u) < 0) return;
        out.push({
          key: u.id, label: u.name, user: u, set: { by: by, key: u.id },
          items: items.filter(function (x) { return val(x) === u.id; })
        });
      });
      push({ key: '', label: f ? 'ไม่ระบุ' : 'ยังไม่มอบหมาย', set: { by: by, key: '' },
        items: items.filter(function (x) { return !val(x); }) });
    } else if (f && (f.type === 'select' || f.type === 'multi')) {
      (f.options || []).forEach(function (o) {
        push({
          key: o.name, label: o.name, color: o.color, set: f.type === 'select' ? { by: group, key: o.name } : null,
          items: items.filter(function (x) {
            var v = fieldValue(x.task.id, f.id);
            return f.type === 'multi' ? [].concat(v || []).indexOf(o.name) >= 0 : v === o.name;
          })
        });
      });
      push({ key: '', label: 'ไม่มีค่า', set: f.type === 'select' ? { by: group, key: '' } : null,
        items: items.filter(function (x) {
          var v = fieldValue(x.task.id, f.id);
          return v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
        }) });
    } else if (f && f.type === 'date') {
      /* ฟิลด์วันที่จัดเป็นรายเดือน เรียงตามเวลา งานที่ไม่มีวันอยู่ท้าย */
      var months = {};
      items.forEach(function (x) {
        var v = fieldValue(x.task.id, f.id);
        if (v) months[String(v).slice(0, 7)] = true;
      });
      Object.keys(months).sort().forEach(function (mk) {
        out.push({ key: mk, label: mk, month: mk, set: null,
          items: items.filter(function (x) { return String(fieldValue(x.task.id, f.id) || '').slice(0, 7) === mk; }) });
      });
      push({ key: '', label: 'ไม่มีวันที่', set: { by: group, key: '' },
        items: items.filter(function (x) { return !fieldValue(x.task.id, f.id); }) });
    } else if (f) {
      out.push({ key: 'all', label: 'ทั้งหมด', items: items, set: null });
    } else if (group === 'cstatus') {
      /* 3b — คอลัมน์ตามสถานะของชนิดงานกำหนดเอง ลากลง = ตั้งสถานะ (เปลี่ยนชนิดให้ถ้ายังไม่ใช่ชนิดนั้น) */
      var tys = projectTypes(projectId), known = {};
      tys.forEach(function (ty) {
        ty.statuses.forEach(function (s) {
          known[s.id] = true;
          push({ key: s.id, label: tys.length > 1 ? ty.name + ' · ' + s.name : s.name, color: s.color,
            set: { by: 'cstatus', key: s.id },
            items: items.filter(function (x) { return x.task.cstatus === s.id; }) });
        });
      });
      push({ key: '', label: 'ไม่มีสถานะ', set: null,
        items: items.filter(function (x) { return !known[x.task.cstatus]; }) });
    } else if (group === 'type') {
      var seenTy = {};
      typeChoices(projectId).forEach(function (c) {
        seenTy[c.id] = true;
        push({ key: c.id, label: c.label, set: { by: 'type', key: c.id },
          items: items.filter(function (x) { return (x.task.ctype || x.task.type || 'task') === c.id; }) });
      });
      push({ key: '_other', label: 'ชนิดของโปรเจกต์อื่น', set: null,
        items: items.filter(function (x) { return !seenTy[x.task.ctype || x.task.type || 'task']; }) });
    } else if (group === 'priority') {
      PRIORITIES.forEach(function (p) {
        push({ key: p.id, label: p.label, color: p.id === 'none' ? null : p.color,
          set: { by: 'priority', key: p.id },
          items: items.filter(function (x) { return (x.task.priority || 'none') === p.id; }) });
      });
    } else if (group === 'due') {
      var td = today();
      var defs = [
        ['overdue', 'เลยกำหนด', function (t) { return t.dueOn && t.dueOn < td && !t.completed; }],
        ['today', 'วันนี้', function (t) { return t.dueOn === td; }],
        ['week', 'ภายใน 7 วัน', function (t) { return t.dueOn && t.dueOn > td && t.dueOn <= addDays(td, 7); }],
        ['later', 'หลังจากนั้น', function (t) { return t.dueOn && t.dueOn > addDays(td, 7); }],
        ['none', 'ไม่มีกำหนด', function (t) { return !t.dueOn; }],
        ['past', 'ผ่านมาแล้ว', function (t) { return t.dueOn && t.dueOn < td && t.completed; }]
      ];
      defs.forEach(function (d) {
        var sub = items.filter(function (x) { return d[2](x.task); });
        push({ key: d[0], label: d[1], items: sub, set: null });
      });
    } else if (group === 'none') {
      out.push({ key: 'all', label: 'ทั้งหมด', items: items, set: null });
    } else {
      var p = project(projectId);
      p.sections.forEach(function (s) {
        out.push({
          key: s.id, label: s.name, isSection: true, set: { by: 'section', key: s.id },
          items: items.filter(function (x) { return x.membership.sectionId === s.id; })
        });
      });
    }
    return out;
  }

  /** filter + sort + group รวบเป็นก้อนเดียวให้ view เรียกใช้
   *  opts.group ใช้แทน view.group (บอร์ดจัดคอลัมน์ด้วย bGroup)  opts.showEmpty แทน view.showEmpty */
  function viewGroups(projectId, view, opts) {
    opts = opts || {};
    var items = viewItems(projectId, view);
    var groups = groupItems(projectId, items, opts.group || view.group,
      { showEmpty: 'showEmpty' in opts ? opts.showEmpty : view.showEmpty });
    var keys = view.sorts && view.sorts.length ? view.sorts : view.sort;
    groups.forEach(function (g) { g.items = sortItems(g.items, keys, view.sortDir); });
    return groups;
  }

  /** งานในโปรเจกต์ที่ผ่านตัวกรอง (ยังไม่จัดกลุ่ม ไม่เรียง) */
  function viewItems(projectId, view) {
    return tasksInProject(projectId).filter(function (x) {
      return matchesFilter(x.task, view, x.membership);
    });
  }

  /* ---------- คอลัมน์ของรายการ ----------
   * ของในตัวที่เปิดไว้ตั้งแต่ต้นคือผู้รับผิดชอบกับกำหนดส่ง ที่เหลือซ่อนไว้ให้เปิดเอง
   * ฟิลด์ที่สร้างเองแสดงเป็นค่าเริ่มต้น (สร้างมาก็เพราะอยากเห็น) */
  var LIST_COLS = [
    { id: 'assignee',    label: 'ผู้รับผิดชอบ',  w: 170, on: true,  sort: 'assignee' },
    { id: 'due',         label: 'กำหนดส่ง',     w: 148, on: true,  sort: 'due' },
    { id: 'start',       label: 'วันเริ่ม',      w: 130, on: false, sort: 'start' },
    { id: 'priority',    label: 'ความสำคัญ',    w: 130, on: false, sort: 'priority' },
    { id: 'tags',        label: 'แท็ก',         w: 170, on: false },
    { id: 'created',     label: 'วันที่สร้าง',   w: 130, on: false, sort: 'created' },
    { id: 'createdBy',   label: 'สร้างโดย',      w: 160, on: false, sort: 'createdBy' },
    { id: 'completedOn', label: 'วันที่ทำเสร็จ', w: 140, on: false, sort: 'completedOn' },
    { id: 'modified',    label: 'แก้ไขล่าสุด',   w: 140, on: false, sort: 'modified' },
    { id: 'blockedBy',   label: 'ถูกบล็อกโดย',   w: 190, on: false },
    { id: 'blocking',    label: 'กำลังบล็อก',    w: 190, on: false },
    { id: 'cstatus',     label: 'สถานะ',        w: 150, on: false, sort: 'cstatus' },
    { id: 'estimate',    label: 'เวลาประมาณ',   w: 120, on: false, sort: 'estimate' },
    { id: 'actual',      label: 'เวลาจริง',     w: 120, on: false, sort: 'actual' }
  ];

  /** ทุกคอลัมน์ตามลำดับที่ผู้ใช้จัด พร้อมสถานะเปิด/ปิด */
  function listColumns(projectId, v) {
    var p = project(projectId);
    var hasTypes = !!(p && p.types && p.types.length);
    var all = LIST_COLS.map(function (c) {
      /* 3b — คอลัมน์สถานะเปิดเองเมื่อโปรเจกต์มีชนิดงานกำหนดเอง */
      var dflt = c.id === 'cstatus' ? hasTypes : c.on;
      return { id: c.id, label: c.label, w: c.w, sort: c.sort || null, builtin: true,
        on: v.colShow && (c.id in v.colShow) ? !!v.colShow[c.id] : dflt, wkey: c.id };
    });
    ((p && p.fields) || []).forEach(function (f) {
      var id = 'field:' + f.id;
      all.push({ id: id, label: f.name, w: 158, sort: id, field: f, wkey: f.id,
        on: v.colShow && (id in v.colShow) ? !!v.colShow[id] : true });
    });
    var order = (v.cols || []);
    all.sort(function (a, b) {
      var ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      if (ia < 0 && ib < 0) return 0;
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    });
    return all;
  }

  var FOOT_FNS = [
    ['none', 'ไม่แสดง'], ['sum', 'ผลรวม'], ['avg', 'ค่าเฉลี่ย'], ['min', 'ต่ำสุด'],
    ['max', 'สูงสุด'], ['count', 'จำนวนที่กรอก']
  ];

  /** สรุปท้ายคอลัมน์ตัวเลขของงานชุดหนึ่ง คืนตัวเลข (หรือ null ถ้าไม่มีอะไรให้สรุป) */
  function footValue(tasks, fieldId, fn) {
    if (fieldId === 'estimate' || fieldId === 'actual') {      // 3c — ชั่วโมง (รวมงานย่อย)
      var hv = tasks.map(function (t) { return taskValue(t, fieldId); }).filter(function (v) { return v !== null; });
      if (fn === 'count') return hv.length;
      if (!hv.length) return null;
      if (fn === 'avg') return hv.reduce(function (a, b) { return a + b; }, 0) / hv.length;
      if (fn === 'min') return Math.min.apply(null, hv);
      if (fn === 'max') return Math.max.apply(null, hv);
      return hv.reduce(function (a, b) { return a + b; }, 0);
    }
    var nums = [];
    tasks.forEach(function (t) {
      var v = fieldValue(t.id, fieldId);
      if (typeof v === 'number' && !isNaN(v)) nums.push(v);
      else if (v !== null && v !== undefined && v !== '' && !isNaN(+v)) nums.push(+v);
    });
    if (fn === 'count') return nums.length;
    if (!nums.length) return null;
    if (fn === 'avg') return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
    if (fn === 'min') return Math.min.apply(null, nums);
    if (fn === 'max') return Math.max.apply(null, nums);
    return nums.reduce(function (a, b) { return a + b; }, 0);
  }

  /* ---------- การ์ดบอร์ด ---------- */
  var CARD_PARTS = [
    { id: 'cover',    label: 'รูปปก',        on: true },
    { id: 'assignee', label: 'ผู้รับผิดชอบ',  on: true },
    { id: 'due',      label: 'กำหนดส่ง',     on: true },
    { id: 'priority', label: 'ความสำคัญ',    on: true },
    { id: 'subtasks', label: 'จำนวนงานย่อย', on: true },
    { id: 'tags',     label: 'แท็ก',         on: false }
  ];

  /** การ์ดแสดงส่วนนี้ไหม — ส่วนในตัวมีค่าเริ่มต้น ฟิลด์ที่สร้างเองซ่อนไว้จนกว่าจะเลือก */
  function cardShows(v, key) {
    var o = v.bCard || {};
    if (key in o) return !!o[key];
    var c = CARD_PARTS.filter(function (x) { return x.id === key; })[0];
    return c ? c.on : false;
  }

  /** ตั้งค่าของกลุ่มให้งานที่ถูกลากมาวาง ยังไม่ commit (ผู้เรียก snapshot/commit เอง) */
  function applyGroupValue(taskId, projectId, by, key, beforeId) {
    var t = task(taskId);
    if (!t || !by) return;
    if (by === 'section') {
      var m = db.memberships.filter(function (x) { return x.taskId === taskId && x.projectId === projectId; })[0];
      if (!m || !section(projectId, key)) return;
      var list = tasksInSection(projectId, key).filter(function (x) { return x.task.id !== taskId; });
      var pos = list.length ? list[list.length - 1].membership.position + 1 : 1, at = -1;
      if (beforeId) list.forEach(function (x, i) { if (x.task.id === beforeId) at = i; });
      if (at === 0) pos = list[0].membership.position / 2;
      else if (at > 0) pos = (list[at - 1].membership.position + list[at].membership.position) / 2;
      setSectionRaw(m, key, pos);
      return;
    }
    if (by === 'assignee') {
      if ((t.assigneeId || '') !== (key || '')) updateTask(taskId, { assigneeId: key || null }, { quiet: true });
      return;
    }
    if (by === 'priority') {
      if ((t.priority || 'none') !== (key || 'none')) updateTask(taskId, { priority: key || 'none' }, { quiet: true });
      return;
    }
    if (by === 'cstatus') { if (key) setStatusRaw(t, key); return; }       // 3b
    if (by === 'type') { if (key) setTypeRaw(t, key); return; }
    if (by.indexOf('field:') === 0) {
      var fid = by.slice(6);
      var cur = fieldValue(taskId, fid);
      if ((cur || '') === (key || '')) return;
      setFieldRaw(taskId, fid, key || null, { log: true });
    }
  }

  /** ลากงาน (หนึ่งหรือหลายชิ้น) ลงกลุ่มบนบอร์ดหรือในรายการ — ย้อนกลับได้ในครั้งเดียว
   *  sets = [{ by, key }] เช่น คอลัมน์ + แถว (swimlane) */
  function dropToGroups(ids, projectId, sets, beforeId) {
    ids = (ids || []).filter(function (id) { return !!task(id); });
    sets = (sets || []).filter(function (s) { return s && s.by; });
    if (!ids.length || !sets.length) return false;
    /* Sprint 1B — ลากลงกลุ่มคือการแก้งาน (คอลัมน์ ผู้รับผิดชอบ ความสำคัญ ฟิลด์) ต้องแก้ได้ทุกงานที่ลาก */
    if (!canArrangeIn(projectId) || !ids.every(function (id) { return can('write', id); })) {
      denied('write'); return false;
    }
    /* batch — ค่าที่ต้องผ่าน updateTask (ผู้รับผิดชอบ ความสำคัญ สถานะ) ไม่บันทึกกลางทาง */
    batch(ids.length > 1 ? 'ย้าย {n} งาน' : 'ย้ายงาน', { n: ids.length }, function () {
      ids.forEach(function (id) {
        sets.forEach(function (s) { applyGroupValue(id, projectId, s.by, s.key, ids.length === 1 ? beforeId : null); });
      });
    });
    return true;
  }

  /** ใส่ค่าฟิลด์โดยไม่ snapshot/commit — ทางเดียวที่ค่าฟิลด์เปลี่ยน (ช่องในรายการ แผงงาน แก้หลายงาน
   *  ลากลงกลุ่ม อัตโนมัติ) ลงประวัติเมื่อฟิลด์เปิด "แจ้งเมื่อค่าเปลี่ยน" หรือ opts.log แล้วปลุกอัตโนมัติ
   *  @returns true ถ้าค่าเปลี่ยนจริง */
  function setFieldRaw(taskId, fieldId, value, opts) {
    var fd3 = fieldDef(fieldId);
    if (fd3 && fd3.type === 'formula') return false;   // 3c — สูตรไม่เก็บค่าในงาน
    var empty = (value === null || value === undefined || value === '' ||
                 (value && value.length === 0 && typeof value !== 'number'));
    var fv = db.fieldValues.filter(function (v) {
      return v.taskId === taskId && v.fieldId === fieldId;
    })[0];
    var before = JSON.stringify(fv ? fv.value : null), after = JSON.stringify(empty ? null : value);
    if (before === after) return false;
    var def = fieldDef(fieldId);
    /* ฟิลด์ที่เปิด "แจ้งเมื่อค่าเปลี่ยน" — ลงประวัติ แล้ว log() แจ้งผู้ติดตาม (ผู้รับผิดชอบเป็นผู้ติดตามอยู่แล้ว)
     * เดิมการลากลงกลุ่ม (2b) ข้ามขั้นนี้ ตอนนี้ทุกทางผ่านตรงนี้ */
    if (def && (def.notify || (opts && opts.log))) {
      var shown = empty ? '' : [].concat(value).map(function (x) {
        var who = def.type === 'person' ? user(x) : null;
        return who ? who.name : x;
      }).join(', ');
      log(taskId, empty ? 'ล้างค่า {f}' : 'ตั้ง {f} เป็น {v}', { f: def.name, v: shown });
    }
    if (fv) {
      if (empty) db.fieldValues = db.fieldValues.filter(function (v) { return v !== fv; });
      else fv.value = value;
    } else if (!empty) {
      db.fieldValues.push({ taskId: taskId, fieldId: fieldId, value: value });
    }
    autoFire('field', taskId, { field: fieldId, value: empty ? null : value });
    return true;
  }

  /* ---------- สีตามฟิลด์ (ปฏิทินและไทม์ไลน์) ---------- */
  function colorChoices(projectId) {
    var out = [['project', 'สีของโปรเจกต์'], ['priority', 'ความสำคัญ'], ['assignee', 'ผู้รับผิดชอบ'],
               ['progress', 'ความคืบหน้า']];
    var p = projectId ? project(projectId) : null;
    ((p && p.fields) || []).forEach(function (f) {
      if (f.type === 'select' || f.type === 'person') out.push(['field:' + f.id, f.name]);
    });
    return out;
  }

  /* ---------- มุมมองที่ทำงานอยู่ของแต่ละคน ---------- */

  /** มุมมองล่าสุดที่คนนี้ใช้ในโปรเจกต์นี้ (เติมค่าเริ่มต้นแล้ว) */
  function projView(projectId) {
    var pv = personalOf().pv || {};
    return fillView(clone(pv[projectId] || {}));
  }

  /** จำมุมมองที่ทำงานอยู่ — ไม่มี snapshot ไม่วาดใหม่ เขียนลงที่เก็บเฉย ๆ
   *  คืน true ถ้ามีอะไรเปลี่ยน */
  function setProjView(projectId, view) {
    if (!project(projectId) || !me()) return false;
    var st = personalOf();
    if (!st.pv || typeof st.pv !== 'object') st.pv = {};
    var d = viewDiff(view);
    var empty = !Object.keys(d).length;
    if (JSON.stringify(st.pv[projectId] || {}) === JSON.stringify(d)) return false;
    if (empty) delete st.pv[projectId];
    else st.pv[projectId] = d;
    persist();
    return true;
  }

  /** ปฏิทินรวม — โหมด วันหยุด และสีที่จำไว้ต่อคน */
  function calPrefs() {
    var c = personalOf().cal;
    return {
      mode: c && c.mode === 'week' ? 'week' : 'month',
      weekends: !(c && c.weekends === false),
      colorBy: (c && c.colorBy) || 'project'
    };
  }

  function setCalPrefs(patch) {
    var st = personalOf();
    var c = calPrefs();
    Object.keys(patch || {}).forEach(function (k) { c[k] = patch[k]; });
    st.cal = c;
    commit();
    return c;
  }

  /* ---------- แท็บมุมมองที่บันทึกไว้ ----------
   * { id, name, icon, kind: list|board|timeline|gantt|calendar, view } เรียงตามลำดับในอาร์เรย์
   * project.defaultTab = id ของแท็บที่เปิดเป็นค่าเริ่มต้น (null = ใช้ project.defaultView ซึ่งเป็นมุมมองในตัว) */
  var SV_MAX = 50;
  var SV_KINDS = ['list', 'board', 'timeline', 'gantt', 'calendar'];

  function savedView(projectId, id) {
    var p = project(projectId);
    return p ? (p.savedViews || []).filter(function (v) { return v.id === id; })[0] || null : null;
  }

  function updateSavedView(projectId, id, view) {
    var sv = savedView(projectId, id);
    if (!sv) return false;
    snapshot('บันทึกมุมมอง “{n}”', { n: sv.name });
    sv.view = viewDiff(clone(view));
    commit();
    return true;
  }

  function renameSavedView(projectId, id, name, icon) {
    var sv = savedView(projectId, id);
    var nm = String(name || '').trim().slice(0, 60);
    if (!sv || !nm) return false;
    snapshot('เปลี่ยนชื่อมุมมอง');
    sv.name = nm;
    if (icon) sv.icon = String(icon).slice(0, 4);
    commit();
    return true;
  }

  function moveSavedView(projectId, id, delta) {
    var p = project(projectId);
    if (!p) return false;
    var i = -1;
    p.savedViews.forEach(function (v, k) { if (v.id === id) i = k; });
    var j = i + delta;
    if (i < 0 || j < 0 || j >= p.savedViews.length) return false;
    snapshot('ย้ายแท็บมุมมอง');
    var x = p.savedViews.splice(i, 1)[0];
    p.savedViews.splice(j, 0, x);
    commit();
    return true;
  }

  /** ตั้งแท็บเริ่มต้นของโปรเจกต์ — รับได้ทั้งมุมมองในตัว ('list') และแท็บที่บันทึกไว้ ('v_…') */
  function setDefaultTab(projectId, tab) {
    var p = project(projectId);
    if (!p) return false;
    snapshot('ตั้งมุมมองเริ่มต้น');
    if (savedView(projectId, tab)) p.defaultTab = tab;
    else { p.defaultTab = null; p.defaultView = tab; }
    commit();
    return true;
  }

  function allTags() {
    var seen = {};
    db.tasks.forEach(function (t) {
      if (!canSeeTask(t.id)) return;        // แท็กของงานส่วนตัวคนอื่นไม่หลุดมาในรายการ
      t.tags.forEach(function (tg) { seen[tg] = true; });
    });
    return Object.keys(seen).sort();
  }

  /* ---------- notifications ---------- */

  /* ชนิดของการแจ้งเตือน ผู้ใช้ปิดเป็นรายชนิดได้จากหน้าตั้งค่า
   *
   * ที่ต้องแยกชนิด เพราะคนที่ติดตามงานเยอะจะโดนถล่มด้วยรายการเล็ก ๆ น้อย ๆ
   * จนเลิกอ่านกล่องแจ้งเตือนไปเลย ซึ่งแย่กว่าไม่มีกล่องแจ้งเตือนตั้งแต่แรก
   */
  var NOTIFY_KINDS = [
    { id: 'assigned', label: 'มีคนมอบหมายงานให้ฉัน',
      desc: 'ได้รับงานใหม่ หรือถูกเปลี่ยนตัวผู้รับผิดชอบ' },
    { id: 'mention',  label: 'มีคนพูดถึงฉันในความเห็น',
      desc: 'มีคนพิมพ์ @ชื่อ ของคุณไว้' },
    { id: 'comment',  label: 'มีความเห็นใหม่ในงานที่ฉันติดตาม',
      desc: 'ความเห็นที่ไม่ได้พูดถึงคุณโดยตรง' },
    { id: 'unblock',  label: 'งานที่รออยู่พร้อมทำต่อแล้ว',
      desc: 'งานที่บล็อกงานของคุณอยู่ถูกทำเสร็จ' },
    { id: 'activity', label: 'ความเคลื่อนไหวอื่นในงานที่ฉันติดตาม',
      desc: 'เปลี่ยนวัน เปลี่ยนความสำคัญ ติ๊กว่าเสร็จ และอื่น ๆ' },
    { id: 'message',  label: 'ประกาศใหม่ในโปรเจกต์ที่ฉันอยู่',
      desc: 'เรื่องที่ไม่ได้ผูกกับงานชิ้นไหน เช่น สรุปประชุมหรือเลื่อนกำหนด' },
    { id: 'approval', label: 'ผลการอนุมัติงานที่ฉันขอหรือติดตาม',
      desc: 'อนุมัติแล้ว ขอแก้ไข หรือปฏิเสธ' },
    { id: 'due',      label: 'งานของฉันใกล้ครบกำหนด',
      desc: 'เตือนวันก่อนครบกำหนด และเช้าวันที่ครบกำหนด' },
    { id: 'overdue',  label: 'งานของฉันเลยกำหนด',
      desc: 'เตือนครั้งเดียวต่องาน และสรุปงานที่เลยกำหนดทุกวันจันทร์' },
    { id: 'status',   label: 'อัปเดตสถานะของโปรเจกต์',
      desc: 'โปรเจกต์ที่เปิดรับไว้ในเมนูโปรเจกต์ → การแจ้งเตือนของโปรเจกต์นี้' },
    { id: 'newtask',  label: 'งานใหม่ในโปรเจกต์ที่ติดตาม',
      desc: 'เฉพาะโปรเจกต์ที่เปิด “งานใหม่ในโปรเจกต์” ไว้' },
    /* Sprint 2B — หมุดหมายสำเร็จของโปรเจกต์ที่กด “ติดตาม” ไว้ */
    { id: 'milestone', label: 'หมุดหมายสำเร็จในโปรเจกต์ที่ติดตาม',
      desc: 'เมื่อมีคนทำหมุดหมายของโปรเจกต์ที่ติดตามเสร็จ' },
    /* Sprint 2B — บันทึกเวลา/ตั้งเวลาประมาณ ปิดไว้เป็นค่าเริ่มต้น (def: false)
     * ผลทดสอบกับผู้ใช้: ผู้ติดตามได้ "ลงเวลา 1m" "ตั้งเวลาประมาณ 4h" ทั้งวันจนกล่องแจ้งเตือนไม่มีใครอ่าน
     * คนที่อยากรู้จริง (หัวหน้าที่ดูชั่วโมงงาน) เปิดเองได้ที่ตั้งค่า */
    { id: 'timelog',  label: 'บันทึกเวลาและเวลาประมาณ',
      desc: 'มีคนลงเวลาหรือเปลี่ยนเวลาประมาณในงานที่ติดตาม (ปิดไว้เป็นค่าเริ่มต้น)', def: false }
  ];

  /* ---------- เตือนกำหนดส่ง ----------
   *
   * ไม่มีเซิร์ฟเวอร์คอยตั้งเวลา จึงสร้างการเตือนตอนเปิดแอปและทุกชั่วโมงที่เปิดค้างไว้
   * สร้างเฉพาะของคนที่เปิดแอปอยู่ ไม่สร้างแทนคนอื่น — ในโหมดทีมทุกเครื่องเขียนไฟล์เดียวกัน
   * ถ้าทุกเครื่องสร้างให้ทุกคน จะชนกันและเปลืองการซิงก์ ทั้งที่เจ้าตัวเห็นตอนเปิดแอปเองอยู่ดี
   *
   * กันซ้ำด้วยรหัสในช่อง dedupe — ครบพรุ่งนี้/วันนี้ ต่องานต่อวันครบกำหนด
   * เลยกำหนดเตือนครั้งเดียวต่อวันครบกำหนด (ไม่เด้งทุกวันจนเลิกอ่าน)
   * สรุปรายสัปดาห์หนึ่งครั้งต่อวันจันทร์
   *
   * @param opts.weekday  ใช้แทนวันในสัปดาห์จริง (ทดสอบสรุปวันจันทร์ในวันอื่น)
   * @returns จำนวนการแจ้งเตือนที่เพิ่งสร้าง
   */
  function checkDueReminders(opts) {
    var u = me();
    if (!u || !isActive()) return 0;
    var uidMe = u.id, td = today(), tm = addDays(td, 1), added = 0;
    var have = {};
    db.notifications.forEach(function (n) {
      if (n.dedupe && n.userId === uidMe) have[n.dedupe] = true;
    });
    function push(taskId, key, kind, params, dedupe, route) {
      if (have[dedupe] || !wantsNotify(uidMe, kind)) return;
      have[dedupe] = true;
      pushNotif({                                   // Sprint 2B — ทางเดียวกับการแจ้งเตือนอื่น (มี snoozeUntil)
        userId: uidMe, taskId: taskId, projectId: null,
        text: fill(key, params), kind: kind, key: key, params: params || null,
        dedupe: dedupe, route: route || null
      });
      added++;
    }
    var overdue = 0;
    db.tasks.forEach(function (t) {
      if (t.completed || t.assigneeId !== uidMe || !t.dueOn) return;
      if (t.dueOn > tm) return;
      if (!canSeeTask(t.id)) return;
      var p = { t: t.name };
      if (t.dueOn === tm) push(t.id, 'งาน “{t}” ครบกำหนดพรุ่งนี้', 'due', p, 'due1:' + t.id + ':' + t.dueOn);
      else if (t.dueOn === td) push(t.id, 'งาน “{t}” ครบกำหนดวันนี้', 'due', p, 'due0:' + t.id + ':' + t.dueOn);
      else {
        overdue++;
        push(t.id, 'งาน “{t}” เลยกำหนดแล้ว', 'overdue', p, 'over:' + t.id + ':' + t.dueOn);
      }
    });
    var wd = opts && opts.weekday != null ? opts.weekday : new Date().getDay();
    if (wd === 1 && overdue) {
      push(null, 'สรุปประจำสัปดาห์: มีงานเลยกำหนด {n} งาน', 'overdue', { n: overdue },
        'week:' + uidMe + ':' + td, 'mytasks');
    }
    if (added) commit();
    return added;
  }

  function wantsNotify(userId, kind) {
    var u = user(userId);
    if (!u) return false;
    if (!kind) return true;
    var n = u.prefs && u.prefs.notify;
    /* ไม่เคยตั้งค่า = เปิด ยกเว้นชนิดที่ตั้ง def: false ไว้ (Sprint 2B — บันทึกเวลา) */
    if (!n || !(kind in n)) return kindDefault(kind);
    return !!n[kind];
  }

  /**
   * @param extra { story, ref } — Sprint 2B ความเห็นที่ทำให้เกิดการแจ้งเตือน (กล่องแจ้งเตือนโชว์เนื้อหาและพาไปที่ความเห็นนั้น)
   */
  function notify(taskId, text, exceptUserId, extraUserIds, kind, excludeIds,
                  key, params, actor, extra) {
    var t = task(taskId);
    if (!t) return;
    var targets = {};
    (t.followers || []).forEach(function (u) { targets[u] = true; });
    (extraUserIds || []).forEach(function (u) { targets[u] = true; });
    (excludeIds || []).forEach(function (u) { delete targets[u]; });
    delete targets[exceptUserId];
    Object.keys(targets).forEach(function (target) {
      if (!user(target)) return;
      if (!wantsNotify(target, kind)) return;
      /* Sprint 2B — ผ่านตัวรวมกลุ่ม (pushNotif) ทุกครั้ง ไม่ push ตรง */
      pushNotif({
        userId: target, taskId: taskId, text: text,
        /* เก็บคีย์ไว้ด้วยเมื่อมี กล่องแจ้งเตือนจะได้แปลตอนอ่าน
         * ไม่ใช่ค้างภาษาของคนที่ทำให้เกิดการแจ้งเตือน */
        key: key || null, params: params || null,
        actorName: actor ? actor.name : null, actorId: actor ? actor.id : null,
        kind: kind || null, story: extra && extra.story, ref: extra && extra.ref
      });
    });
  }

  /** หา @ชื่อ ในข้อความ แล้วคืน id ของคนที่ถูกพูดถึง */
  function parseMentions(text) {
    var found = [];
    db.users.forEach(function (u) {
      if (text.indexOf('@' + u.name) >= 0) found.push(u.id);
    });
    return found;
  }

  /** แจ้งเฉพาะคนที่ระบุ ไม่กระจายไปหาผู้ติดตาม
   *
   * ใช้กับข้อความที่พูดกับคนคนเดียว เช่น "มอบหมายงานนี้ให้คุณ" หรือ "พูดถึงคุณ"
   * ถ้าส่งผ่าน notify() ปกติ ผู้ติดตามทุกคนจะได้ข้อความที่ขึ้นต้นว่า "ให้คุณ"
   * ทั้งที่ไม่ได้เกี่ยวกับเขา
   */
  /**
   * @param noActor ข้อความบางแบบพูดถึงตัวงาน ไม่ใช่การกระทำของใคร
   *                เช่น "งาน X พร้อมทำต่อแล้ว" เติมชื่อคนข้างหน้าแล้วอ่านไม่รู้เรื่อง
   */
  function notifyOnly(taskId, userIds, key, kind, params, noActor, extra) {
    var actor = noActor ? null : me();
    var seen = {};
    (userIds || []).forEach(function (target) {
      if (!target || target === db.currentUserId || seen[target]) return;
      seen[target] = true;                 // Sprint 2B — รายชื่อซ้ำ (ผู้สร้างที่เป็นผู้ติดตามด้วย) ได้รายการเดียว
      if (!user(target)) return;
      if (!wantsNotify(target, kind)) return;
      pushNotif({
        userId: target, taskId: taskId,
        /* ประกาศของโปรเจกต์ไม่มีงานให้ชี้ เก็บรหัสโปรเจกต์ไว้แทน
         * กล่องแจ้งเตือนจะได้พาไปที่หน้าประกาศ ไม่ใช่ขึ้นว่างานถูกลบแล้ว */
        projectId: (extra && extra.projectId) || null,
        route: (extra && extra.route) || null,
        text: fill(key, params), kind: kind || null,
        key: key, params: params || null,
        actorName: actor ? actor.name : null, actorId: actor ? actor.id : null,
        story: extra && extra.story, ref: extra && extra.ref
      });
    });
  }

  /** @param exclude รายชื่อคนที่ไม่ต้องแจ้ง เพราะได้รับแจ้งแบบเจาะจงกว่านี้ไปแล้ว */
  /**
   * บันทึกความเคลื่อนไหวของงาน
   *
   * เก็บเป็น "คีย์ + ค่าแทนที่" ไม่ใช่ประโยคสำเร็จรูป
   * ประโยคที่ประกอบเสร็จแล้วจะติดภาษาของคนที่ทำตอนนั้นไปตลอด
   * ทีมสองภาษาเปิดงานเดียวกันแล้วเห็นประวัติคนละภาษากัน ซึ่งอ่านไม่รู้เรื่องทั้งคู่
   * เก็บเป็นคีย์แล้วแปลตอนแสดง ทุกคนจึงอ่านประวัติเดียวกันในภาษาของตัวเอง
   *
   * ข้อมูลเก่าที่เก็บเป็นประโยคไว้แล้วยังแสดงได้ เพราะ L() คืนค่าเดิมเมื่อไม่เจอคีย์
   */
  function log(taskId, key, params, exclude) {
    var st = {
      id: uid('st'), taskId: taskId, actorId: db.currentUserId,
      type: 'log', text: key, params: params || null,
      createdAt: new Date().toISOString()
    };
    if (autoCtx) st.auto = 1;          // 3a — ทำโดยอัตโนมัติ (ประวัติขึ้น ⚡)
    db.stories.push(st);
    var actor = me();
    /* ข้อความแจ้งเตือนก็ต้องแปลตอนอ่านเหมือนกัน จึงส่งคีย์กับค่าไปด้วย
     * Sprint 2B — บันทึกบางชนิด (ลงเวลา ตั้งเวลาประมาณ) แยกชนิดออกมา ปิดได้โดยไม่ต้องปิดความเคลื่อนไหวทั้งหมด */
    notify(taskId, (actor ? actor.name : 'มีคน') + ' ' + fill(key, params),
      db.currentUserId, null, logKind(key), exclude, key, params, actor);
  }

  /* ---------- ข้อความมีรูปแบบ (รายละเอียดงานและความเห็น) ----------
   *
   * เก็บเป็นมาร์กดาวน์ย่อชุดเดียวกับที่ความเห็นใช้มาตั้งแต่แรก ไม่ใช่ HTML
   *   **หนา**  *เอียง*  ++ขีดเส้นใต้++  ~~ขีดฆ่า~~  `โค้ด`  [ข้อความ](https://…)
   *   - หัวข้อย่อย / 1. ลำดับเลข (เว้นสองช่องต่อหนึ่งชั้น)   # หัวข้อ
   *   @ชื่อคน   @[ชื่องาน](t_…)   @[ชื่อโปรเจกต์](p_…)
   *
   * เหตุผลที่ไม่เก็บ HTML: ข้อความเก่าทั้งหมดใช้ต่อได้โดยไม่ต้องแปลง ค้นหาเจอ
   * ส่งออก CSV แล้วยังอ่านรู้เรื่อง ไฟล์ข้อมูลกลางไม่บวม และไม่มีทางที่ HTML
   * ของใครจะหลุดไปรันในเครื่องคนอื่น เพราะตอนแสดงผลทุกอย่างผ่านตัวกันอักขระก่อนเสมอ
   * ตัวแก้ไขแบบเห็นภาพ (app/richtext.js) แปลงไปกลับระหว่างรูปแบบนี้กับหน้าจอเอง */
  var REF_RE = /@\[([^\]\n]{1,200})\]\(([tp]_[A-Za-z0-9_]+)\)/g;

  /** งานกับโปรเจกต์ที่ข้อความนี้อ้างถึง */
  function textRefs(text) {
    var out = { tasks: [], projects: [] };
    String(text || '').replace(REF_RE, function (m, label, id) {
      var list = id.charAt(0) === 't' ? out.tasks : out.projects;
      if (list.indexOf(id) < 0) list.push(id);
      return m;
    });
    return out;
  }

  /** ตัดเครื่องหมายจัดรูปแบบออก ใช้กับการค้นหาและไฟล์ CSV
   *  @param forSearch ลิงก์เหลือแค่ข้อความ แล้วต่อที่อยู่ไว้ท้ายบรรทัด
   *                   ไม่งั้นค้นวลีที่คร่อมลิงก์ ("registration documents") จะไม่เจอ */
  function plainText(text, forSearch) {
    return String(text || '').split('\n').map(function (line) {
      var urls = [];
      var out = line
        .replace(/^(\s*)#{1,3}\s+/, '$1')
        /* 3c — บล็อกของหน้าเอกสาร: รูปเหลือคำอธิบาย รายการติ๊กเหลือหัวข้อย่อยธรรมดา */
        .replace(/^!\[([^\]\n]*)\]\((?:img:[A-Za-z0-9_]+|https:[^)\s]+)\)$/, function (m, a) { return a || '[' + L('รูปภาพ') + ']'; })
        .replace(/^(\s*[-*•]\s+)\[( |x|X)\]\s+/, '$1')
        .replace(REF_RE, function (m, label) { return '@' + label; })
        .replace(/\[([^\]\n]+)\]\(((?:https?:|mailto:)[^\s)]+)\)/g, function (m, t, u) {
          if (!forSearch) return t + ' (' + u + ')';
          urls.push(u);
          return t;
        })
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/\+\+([^+]+)\+\+/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1$2');
      return urls.length ? out + ' ' + urls.join(' ') : out;
    }).join('\n');
  }

  /** งานใหม่ที่ถูกอ้างถึง ลงบรรทัด "งานที่เกี่ยวข้อง" ไว้ที่งานปลายทาง
   *  คนที่เปิดงานปลายทางจะรู้ว่ามีงานอื่นพูดถึงมันอยู่ โดยไม่ต้องไล่ค้นเอง */
  function logConnected(fromTaskId, before, after) {
    var src = task(fromTaskId);
    if (!src) return;
    var was = textRefs(before).tasks;
    textRefs(after).tasks.forEach(function (tid) {
      if (tid === fromTaskId || was.indexOf(tid) >= 0 || !task(tid)) return;
      log(tid, 'อ้างถึงงานนี้ใน “{t}”', { t: src.name });
    });
  }

  /** แทนค่าในคีย์แบบเดียวกับ I18N.t แต่ไม่แปล ใช้กับข้อความสำรองตอนยังไม่รู้ภาษา */
  function fill(s, p) {
    var out = String(s);
    if (p) {
      Object.keys(p).forEach(function (k) {
        out = out.split('{' + k + '}').join(p[k]);
      });
    }
    return out;
  }

  /* ---------- task mutations ---------- */

  function nextPosition(projectId, sectionId) {
    var list = tasksInSection(projectId, sectionId);
    if (!list.length) return 1;
    return list[list.length - 1].membership.position + 1;
  }

  /** สร้างงานหนึ่งชิ้นโดยไม่ snapshot และไม่ commit — ให้ผู้เรียกครอบเป็นก้อนเดียว */
  function createTaskRaw(attrs, projectId, sectionId) {
    attrs = applyDefaultType(attrs || {}, projectId);
    var t = blankTask(attrs);
    if (t.followers.indexOf(db.currentUserId) < 0) t.followers.push(db.currentUserId);
    t.createdBy = db.currentUserId;
    db.tasks.push(t);
    /* บรรทัดแรกของประวัติ ตอบว่าใครสร้างงานนี้เมื่อไหร่
     * ต้องบันทึกหลัง push แล้ว ไม่งั้น log หาตัวงานไม่เจอ */
    log(t.id, 'สร้างงานนี้');
    if (projectId && !t.parentId) {
      db.memberships.push({
        id: uid('m'), taskId: t.id, projectId: projectId,
        sectionId: sectionId, position: nextPosition(projectId, sectionId)
      });
      notifyNewTask(t, projectId);
    }
    return t;
  }

  /* ---------- Sprint 3 — พิมพ์เร็ว: "@ชื่อ" กับวันที่แบบไทยในชื่องาน ----------
   * พิมพ์ "ส่งใบเสนอราคา @สมชาย พรุ่งนี้" ในช่องเพิ่มงาน → ชื่องาน "ส่งใบเสนอราคา" มอบให้สมชาย กำหนดส่งพรุ่งนี้
   * ตั้งใจให้ระวังไว้ก่อน: @ชื่อ ต้องตรงกับคนเดียวที่เข้าโปรเจกต์ได้เท่านั้น (ไม่ตรงหรือซ้ำ = คงข้อความเดิม ไม่เดา)
   * และถ้าตัดแล้วชื่องานว่าง ก็ไม่แยกอะไรเลย ชื่องานเดิมจึงไม่มีทางหายไป
   * วันที่รู้จัก: วันนี้ พรุ่งนี้ มะรืน สัปดาห์หน้า วันจันทร์…วันอาทิตย์ 15 ธ.ค. / 15 ธันวาคม / 15/12
   * (ปีไม่ได้พิมพ์ = ครั้งถัดไปที่ยังไม่ผ่าน) */
  var QA_DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  var QA_MON_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                     'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var QA_MON_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function quickAdd(text, projectId) {
    var orig = String(text == null ? '' : text).trim();
    var out = { name: orig };
    if (!orig) return out;
    var rest = ' ' + orig + ' ';
    var assignee = null, due = null, t0 = today();
    var am = rest.match(/\s@(\S+)/);
    if (am) {
      var q = am[1].toLowerCase();
      var hits = (db.users || []).filter(function (u) {
        return u && u.name && !u.disabled && u.active !== false && u.name.toLowerCase().indexOf(q) === 0 &&
          (!projectId || !!projectAccess(projectId, u.id));
      });
      if (hits.length === 1) { assignee = hits[0].id; rest = rest.replace(am[0], ' '); }
    }
    function take(re, fn) {
      if (due) return;
      var x = rest.match(re);
      if (!x) return;
      var v = fn(x);
      if (v) { due = v; rest = rest.replace(x[0], ' '); }
    }
    take(/มะรืน(?:นี้)?/, function () { return addDays(t0, 2); });
    take(/พรุ่งนี้|\btomorrow\b/i, function () { return addDays(t0, 1); });
    take(/วันนี้|\btoday\b/i, function () { return t0; });
    take(/สัปดาห์หน้า|อาทิตย์หน้า|\bnext week\b/i, function () { return addDays(t0, 7); });
    take(new RegExp('วัน(' + QA_DOW.join('|').replace('พฤหัสบดี', 'พฤหัสบดี|พฤหัส') + ')(?:หน้า|นี้)?'), function (x) {
      var idx = QA_DOW.indexOf(x[1] === 'พฤหัส' ? 'พฤหัสบดี' : x[1]);
      var diff = (idx - new Date(t0 + 'T00:00:00').getDay() + 7) % 7;
      return addDays(t0, diff === 0 ? 7 : diff);        // ชื่อวันที่ตรงกับวันนี้ = สัปดาห์หน้า (วันนี้ใช้คำว่า "วันนี้")
    });
    var monAlt = QA_MON_FULL.concat(QA_MON_SHORT).map(function (s) { return s.split('.').join('[.]'); }).join('|');
    function mkDate(d, mo) {
      d = +d; mo = +mo;
      if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
      var y = new Date(t0 + 'T00:00:00').getFullYear();
      var c = new Date(y, mo - 1, d);
      if (c.getMonth() !== mo - 1) return null;              // 31 ก.พ. ฯลฯ — ไม่มีวันนี้จริง
      if (iso(c) < t0) c = new Date(y + 1, mo - 1, d);
      return c.getMonth() === mo - 1 ? iso(c) : null;
    }
    take(new RegExp('([0-9]{1,2}) *(' + monAlt + ')'), function (x) {
      var mi = QA_MON_FULL.indexOf(x[2]); if (mi < 0) mi = QA_MON_SHORT.indexOf(x[2]);
      return mkDate(x[1], mi + 1);
    });
    take(/\s(\d{1,2})\/(\d{1,2})(?![\d\/])/, function (x) { return mkDate(x[1], x[2]); });
    var name = rest.replace(/\s{2,}/g, ' ').trim();
    if (!name || (!assignee && !due)) return out;               // ไม่เจออะไร หรือเหลือชื่อว่าง = ไม่แตะ
    out.name = name;
    if (assignee) out.assigneeId = assignee;
    if (due) out.dueOn = due;
    return out;
  }

  function createTask(attrs, projectId, sectionId) {
    /* Sprint 1B — ด่านกลาง (canCreateTask) ไม่ผ่าน = ไม่สร้าง คืน null ให้ผู้เรียกเช็ก */
    if (!canCreateTask(projectId, attrs && attrs.parentId)) return denied('create');
    snapshot('สร้างงาน');
    var t = createTaskRaw(attrs, projectId, sectionId);
    commit();
    return t;
  }

  /** วางหลายบรรทัดลงช่องเพิ่มงาน — หนึ่งบรรทัดหนึ่งงาน ย้อนกลับได้ในครั้งเดียว */
  function createTasks(names, projectId, sectionId, parentId) {
    var list = (names || []).map(function (s) { return String(s).trim(); })
      .filter(Boolean);
    if (!list.length) return [];
    if (!canCreateTask(projectId, parentId)) { denied('create'); return []; }
    snapshot('สร้าง {n} งาน', { n: list.length });
    var out = list.map(function (n) {
      return createTaskRaw({ name: n, parentId: parentId || null }, projectId, sectionId);
    });
    commit();
    return out;
  }

  /* ---------- การทำซ้ำ ----------
   *
   * รอบถัดไปคำนวณจากกำหนดส่งเดิม ยกเว้นแบบ "หลังทำเสร็จ" ที่นับจากวันที่ติ๊กเสร็จจริง
   * รายสัปดาห์เลือกได้หลายวัน เช่น ทุกจันทร์กับพฤหัส — วันถัดไปในสัปดาห์เดียวกันก่อน
   * หมดสัปดาห์แล้วค่อยกระโดดไป N สัปดาห์ แล้วเริ่มที่วันแรกที่เลือกไว้
   */
  function nextRecurDate(r, base) {
    var n = Math.max(1, parseInt(r.interval, 10) || 1);
    if (r.freq === 'daily') return addDays(base, n);
    if (r.freq === 'after') return addDays(today(), n);
    if (r.freq === 'monthly') return addMonths(base, n);
    if (r.freq === 'yearly') return addMonths(base, 12 * n);
    var days = (r.days || []).map(Number).filter(function (x) { return x >= 0 && x <= 6; })
      .sort(function (a, b) { return a - b; });
    if (!days.length) return addDays(base, 7 * n);
    var dow = new Date(base + 'T00:00:00').getDay();
    for (var i = 0; i < days.length; i++) {
      if (days[i] > dow) return addDays(base, days[i] - dow);
    }
    return addDays(base, 7 * n - dow + days[0]);
  }

  /** วันครบกำหนดของรอบถัดไป ใช้โชว์ในแผงงานก่อนติ๊กเสร็จ */
  function nextOccurrence(t) {
    if (!t || !t.recur) return null;
    return nextRecurDate(t.recur, t.dueOn || t.startOn || today());
  }

  /** Sprint 1C — วันครบกำหนดของรอบแรก ใช้ตอนตั้งทำซ้ำให้งานที่ยังไม่มีกำหนดส่ง
   *  เดิมแผงงานบอก "รอบถัดไปครบกำหนด 4 ธ.ค." แต่ช่องกำหนดส่งในรายการ/ปฏิทินยังเป็น "—"
   *  งานทำซ้ำจึงไม่โผล่ในปฏิทินเลยจนกว่าจะมีคนไปตั้งวันเอง
   *  รายสัปดาห์ = วันแรกที่ตรงวันในสัปดาห์ที่เลือก (นับวันนี้ด้วย) แบบอื่น = วันนี้ (หรือวันเริ่มถ้าเริ่มทีหลัง) */
  function firstRecurDate(r, startOn) {
    var from = startOn && startOn > today() ? startOn : today();
    var days = r && r.freq === 'weekly' ? (r.days || []).map(Number).filter(function (x) { return x >= 0 && x <= 6; }) : [];
    for (var i = 0; days.length && i < 7; i++) {
      var d = addDays(from, i);
      if (days.indexOf(new Date(d + 'T00:00:00').getDay()) >= 0) return d;
    }
    return from;
  }

  /** ตัวเลือกการคัดลอก — ไม่ส่งอะไรมา = คัดลอกทุกอย่าง (ตรงกับพฤติกรรมเดิม) */
  var DUP_KEYS = ['assignee', 'notes', 'subtasks', 'attachments', 'tags', 'followers',
                  'projects', 'deps', 'dates', 'fields'];
  function dupOpts(o) {
    var out = {};
    DUP_KEYS.forEach(function (k) { out[k] = !o || !(k in o) ? true : !!o[k]; });
    return out;
  }

  /**
   * สร้างสำเนาของงานหนึ่งชิ้นพร้อมงานย่อยทุกชั้น (ไม่รวมความเห็น)
   * @param shift  เลื่อนวันทั้งชุดกี่วัน ใช้กับงานทำซ้ำ
   * @returns งานใหม่ (push แล้ว แต่ยังไม่ commit)
   */
  function copyTaskTree(src, o, parentId, shift) {
    var mv = function (d) { return d && shift ? addDays(d, shift) : d; };
    var c = blankTask({
      name: src.name, type: src.type, priority: src.priority,
      notes: o.notes ? src.notes : '',
      assigneeId: o.assignee ? src.assigneeId : null,
      startOn: o.dates ? mv(src.startOn) : null,
      startTime: o.dates ? src.startTime : null,
      dueOn: o.dates ? mv(src.dueOn) : null,
      dueTime: o.dates ? src.dueTime : null,
      tags: o.tags ? (src.tags || []).slice() : [],
      followers: o.followers ? (src.followers || []).slice() : [],
      dependsOn: o.deps ? clone(src.dependsOn || []) : [],
      attachments: o.attachments ? clone(src.attachments || []).map(function (a) {
        a.id = uid('a'); return a;
      }) : [],
      recur: o.dates && src.recur ? clone(src.recur) : null,
      parentId: parentId || null,
      createdBy: db.currentUserId
    });
    if (c.type === 'approval') c.approval = 'pending';
    /* 3b — ชนิดงานกำหนดเองไปด้วย สถานะที่ "นับว่าเสร็จ" กลับไปสถานะแรกที่ยังไม่เสร็จ (สำเนายังไม่เสร็จ) */
    var sty = src.ctype ? typeDef(src.ctype) : null;
    if (sty) {
      var ssd = statusDef(src.cstatus);
      c.ctype = sty.id;
      c.cstatus = ssd && !ssd.st.done ? ssd.st.id : ((firstStatus(sty, false) || {}).id || null);
    }
    if (c.followers.indexOf(db.currentUserId) < 0) c.followers.push(db.currentUserId);
    if (c.assigneeId && c.followers.indexOf(c.assigneeId) < 0) c.followers.push(c.assigneeId);
    /* เก็บรายชื่องานย่อยก่อน push เพราะดัชนีจะถูกสร้างใหม่ทันทีที่ความยาวอาเรย์เปลี่ยน */
    var kids = o.subtasks ? db.tasks.filter(function (x) { return x.parentId === src.id; }) : [];
    db.tasks.push(c);
    if (o.fields) {
      /* รหัสงาน (ID) ไม่คัดลอก — สำเนาได้เลขใหม่ของตัวเองตอน commit ไม่งั้นสองงานจะมีรหัสเดียวกัน */
      var idf = idFieldSet();
      db.fieldValues.filter(function (v) { return v.taskId === src.id && !idf[v.fieldId]; }).forEach(function (v) {
        db.fieldValues.push({ taskId: c.id, fieldId: v.fieldId, value: clone(v.value) });
      });
    }
    kids.forEach(function (k) { copyTaskTree(k, o, c.id, shift); });
    return c;
  }

  /** ใส่สำเนาเข้าโปรเจกต์และคอลัมน์เดียวกับต้นฉบับ วางต่อท้ายคอลัมน์ */
  function copyMemberships(fromId, toId) {
    db.memberships.filter(function (m) { return m.taskId === fromId; }).forEach(function (m) {
      db.memberships.push({
        id: uid('m'), taskId: toId, projectId: m.projectId, sectionId: m.sectionId,
        position: nextPosition(m.projectId, m.sectionId)
      });
      /* 3b — สำเนา รอบถัดไปของงานทำซ้ำ งานติดตามผล และงานย่อยที่ย้ายออกมา = งานเข้าโปรเจกต์ (อัตโนมัติ "added") */
      notifyNewTask(task(toId), m.projectId);
    });
  }

  /** สร้างรอบถัดไปของงานที่ตั้งให้ทำซ้ำ
   *
   * คัดลอกทุกอย่างของงาน รวมงานย่อย ค่าฟิลด์ ผู้ติดตาม แท็ก และโปรเจกต์
   * ยกเว้นความเห็น ไฟล์แนบ และลำดับก่อนหลัง ซึ่งเป็นเรื่องของรอบนั้น ๆ
   * แล้วย้ายการทำซ้ำไปไว้ที่รอบใหม่ งานที่เสร็จแล้วจึงไม่ปั๊มซ้ำอีกถ้ามีคนเปิดแล้วติ๊กใหม่ */
  function spawnRecurrence(t) {
    if (!t.recur) return null;
    var base = t.dueOn || t.startOn || today();
    var next = nextRecurDate(t.recur, base);
    var shift = daysBetween(base, next);
    var o = dupOpts({ attachments: false, deps: false });
    var copy = copyTaskTree(t, o, t.parentId, shift);
    if (!t.dueOn && !t.startOn) copy.dueOn = next;
    copy.recur = clone(t.recur);
    copyMemberships(t.id, copy.id);
    mtCopyPlace(t, copy);
    t.recur = null;
    log(copy.id, 'สร้างจากรอบก่อนของงานทำซ้ำ');
    log(t.id, 'สร้างรอบถัดไปแล้ว ครบกำหนด {d}', { d: copy.dueOn || next });
    return copy;
  }

  function undoKeyOf(patch) {
    if ('approval' in patch) return 'เปลี่ยนผลอนุมัติของ “{t}”';     // ก่อน completed — ผลอนุมัติพาสถานะเสร็จมาด้วย
    if ('completed' in patch) return patch.completed ? 'ทำ “{t}” เสร็จ' : 'เปิด “{t}” ใหม่';
    if ('assigneeId' in patch) return 'เปลี่ยนผู้รับผิดชอบของ “{t}”';
    if ('name' in patch) return 'เปลี่ยนชื่องาน “{t}”';
    if ('dueOn' in patch || 'startOn' in patch || 'dueTime' in patch || 'startTime' in patch) return 'เปลี่ยนวันของ “{t}”';
    if ('priority' in patch) return 'เปลี่ยนความสำคัญของ “{t}”';
    if ('tags' in patch) return 'เปลี่ยนแท็กของ “{t}”';
    if ('notes' in patch) return 'แก้รายละเอียดของ “{t}”';
    return 'แก้ไขงาน “{t}”';
  }

  function updateTask(id, patch, opts) {
    var t = task(id);
    if (!t) return null;

    /* Sprint 1B — งานขออนุมัติ ผลอนุมัติเป็นตัวเปิด/ปิดงาน แบบเดียวกับ Asana
     *   อนุมัติ / ปฏิเสธ  = ตัดสินแล้ว งานเสร็จเอง (เดิมอนุมัติแล้วงานยังค้าง นับเป็นงานไม่เสร็จ)
     *   ขอแก้ไข / รออนุมัติ = งานยังเปิด รอคนขอแก้แล้วส่งใหม่
     * คนขอติ๊กเสร็จเองไม่ได้ (เดิมติ๊กปิดงานที่ยังไม่มีใครอนุมัติได้) ปุ่มอนุมัติคือทางปิดงานทางเดียว
     * ผู้อนุมัติเปิดงานที่ตัดสินแล้วกลับมาได้ = ถอนผลแล้วกลับไปรออนุมัติ
     * ระบบอัตโนมัติก็อยู่ใต้กติกานี้ แต่ไม่เด้งข้อความ (ไม่มีคนกดให้บอก) */
    if (t.type === 'approval' && !('type' in patch && patch.type !== 'approval')) {
      if ('approval' in patch && patch.approval !== t.approval) {
        if (!autoCtx && !canApprove(id)) {
          delete patch.approval;
          denied('approval');
        } else if (approvalDecided(patch.approval) !== !!t.completed) {
          patch.completed = approvalDecided(patch.approval);
        }
      } else if ('completed' in patch && !!patch.completed !== !!t.completed) {
        if (patch.completed && !approvalDecided(t.approval)) {
          delete patch.completed;
          if (!autoCtx) denied('approval');
        } else if (!patch.completed && approvalDecided(t.approval)) {
          if (autoCtx || canApprove(id)) patch.approval = 'pending';
          else { delete patch.completed; denied('approval'); }
        }
      }
      if (!Object.keys(patch).length) return t;      // ไม่เหลืออะไรให้แก้ ไม่ต้องมีจุดย้อนกลับเปล่า ๆ
    }
    /* ป้ายจุดย้อนกลับบอกว่าแก้อะไรของงานไหน — ข้อความหลังกดย้อนกลับเดิมขึ้นแค่ "ย้อนกลับแล้ว: แก้ไขงาน"
     * ไม่รู้ว่าอะไรถูกคืนค่า (เลือกจากช่องที่แก้ ช่องที่คนสังเกตก่อน) */
    if (!opts || !opts.quiet) snapshot(undoKeyOf(patch), { t: String(t.name || '').slice(0, 60) });

    /* 3b — เปลี่ยนเป็นชนิดในตัวแล้ว ชนิดกำหนดเองหลุดออก (ยกเว้นตอน setTypeRaw ตั้งชนิดพื้นฐานให้เอง) */
    if ('type' in patch && t.ctype && !(opts && opts.keepCtype)) { patch.ctype = null; patch.cstatus = null; }
    if ('completed' in patch && patch.completed !== t.completed) {
      patch.completedAt = patch.completed ? today() : null;
      patch.completedBy = patch.completed ? (db.currentUserId || null) : null;   // Sprint 3 — ระบบอัตโนมัติ/ไล่ตามคนที่ปลุกกฎ ซึ่งเป็นคนที่เห็นในบันทึกเดียวกัน
      log(id, patch.completed ? 'ทำงานนี้เสร็จแล้ว' : 'เปิดงานนี้อีกครั้ง');
      autoFire('completed', id, { v: !!patch.completed });
      /* 3b — ติ๊กเสร็จ/เปิดใหม่ของงานที่มีชนิดกำหนดเอง ย้ายไปสถานะแรกที่ "นับว่าเสร็จ" (หรือไม่นับ) ให้ตรงกัน */
      if (t.ctype && !(opts && opts.keepStatus)) {
        var cty = typeDef(t.ctype), cur = statusDef(t.cstatus);
        if (cty && (!cur || !!cur.st.done !== !!patch.completed)) {
          var nst = firstStatus(cty, patch.completed);
          if (nst) {
            patch.cstatus = nst.id;
            log(id, 'ตั้งสถานะเป็น “{s}”', { s: nst.name });
            autoFire('cstatus', id, { type: cty.id, v: nst.id, old: t.cstatus || null });
          }
        }
      }
      if (patch.completed) {
        if (('type' in patch ? patch.type : t.type) === 'milestone') notifyMilestone(t);   // Sprint 2B
        spawnRecurrence(t);
        // ปลดล็อกงานที่รออยู่ แล้วแจ้งผู้รับผิดชอบ
        blocking(id).forEach(function (b) {
          if (b.completed) return;
          var others = blockers(b.id).filter(function (x) { return x.id !== id; });
          if (!others.length) {
            notifyOnly(b.id, b.assigneeId ? [b.assigneeId] : [],
              'งาน “{t}” พร้อมทำต่อแล้ว', 'unblock', { t: b.name }, true);
            autoFire('unblocked', b.id, { by: id });
          }
        });
      }
    }
    if ('assigneeId' in patch && patch.assigneeId !== t.assigneeId) {
      /* ประทับเวลามอบหมาย งานจึงไปลง "เพิ่งได้รับมอบหมาย" ของคนใหม่ (ดู validPlace) */
      mtForget(id, t.assigneeId);
      patch.assignedAt = patch.assigneeId ? new Date().toISOString() : null;
      patch.assignedBy = patch.assigneeId ? db.currentUserId : null;
      var u = user(patch.assigneeId);
      /* Sprint 1B — งานขออนุมัติ ผู้รับผิดชอบคือผู้อนุมัติ ข้อความต้องบอกว่า "ขออนุมัติจากคุณ"
       * ไม่ใช่ "มอบหมายงาน" เฉย ๆ ไม่งั้นผู้อนุมัติไม่รู้ว่ามีเรื่องรอให้ตัดสิน */
      var asAppr = ('type' in patch ? patch.type : t.type) === 'approval';
      /* คนที่เพิ่งได้รับงานไม่ต้องได้บรรทัด "มอบหมายให้ X" ซ้ำอีก
       * เพราะจะได้บรรทัดเจาะจงว่า "มอบหมายงาน … ให้คุณ" อยู่แล้ว
       * ถ้าไม่กัน คนที่เคยติดตามงานนี้อยู่แล้วจะเห็นสองบรรทัดสำหรับเรื่องเดียวกัน */
      log(id, u ? (asAppr ? 'ขออนุมัติจาก {who}' : 'มอบหมายให้ {who}') : 'ยกเลิกผู้รับผิดชอบ', u ? { who: u.name } : null,
        patch.assigneeId ? [patch.assigneeId] : null);
      if (patch.assigneeId && t.followers.indexOf(patch.assigneeId) < 0) {
        t.followers.push(patch.assigneeId);
      }
      /* แจ้งคนที่เพิ่งได้รับงานเป็นการเฉพาะ แยกจากความเคลื่อนไหวทั่วไป
       * เพราะ "มีงานเข้า" เป็นเรื่องที่คนอยากรู้ทันที ต่างจาก "มีคนเปลี่ยนวัน" */
      if (patch.assigneeId) {
        notifyOnly(id, [patch.assigneeId], assignKey(asAppr), 'assigned', { t: t.name });
      }
      autoFire('assignee', id, { user: patch.assigneeId || null, old: t.assigneeId || null });
    } else if ('type' in patch && patch.type === 'approval' && t.type !== 'approval' &&
               t.assigneeId && t.assigneeId !== db.currentUserId) {
      /* Sprint 1B — เปลี่ยนงานที่มีผู้รับผิดชอบอยู่แล้วเป็นงานขออนุมัติ = ขอให้คนนั้นอนุมัติ ต้องบอกเขา */
      notifyOnly(id, [t.assigneeId], assignKey(true), 'assigned', { t: t.name });
    }
    /* ---- บันทึกการเปลี่ยนแปลงให้ครบทุกช่อง ----
     *
     * เดิมบันทึกแค่สี่อย่าง คือทำเสร็จ ผู้รับผิดชอบ กำหนดส่ง และสถานะอนุมัติ
     * แท็บความเคลื่อนไหวทั้งหมดจึงแทบไม่ต่างจากแท็บความเห็น
     * ทั้งที่คำถามที่คนเปิดมาดูคือ "ใครเลื่อนวัน และเลื่อนจากเดิมเป็นอะไร"
     *
     * เก็บค่าเดิมไว้ด้วย ไม่ใช่แค่ค่าใหม่ เพราะ "เลื่อนจาก 3 ก.ย. เป็น 10 ก.ย."
     * ตอบได้ในบรรทัดเดียว ส่วน "ตั้งกำหนดส่ง 10 ก.ย." ต้องไล่อ่านย้อนเองว่าเดิมคือวันไหน
     */
    if ('dueOn' in patch && patch.dueOn !== t.dueOn) {
      if (patch.dueOn && t.dueOn) {
        log(id, 'เลื่อนกำหนดส่งจาก {a} เป็น {b}', { a: t.dueOn, b: patch.dueOn });
      } else {
        log(id, patch.dueOn ? 'ตั้งกำหนดส่ง {d}' : 'ลบกำหนดส่ง',
          patch.dueOn ? { d: patch.dueOn } : null);
      }
      autoFire('due', id, { old: t.dueOn || null, now: patch.dueOn || null });
    }
    if ('startOn' in patch && patch.startOn !== t.startOn) {
      if (patch.startOn && t.startOn) {
        log(id, 'เลื่อนวันเริ่มจาก {a} เป็น {b}', { a: t.startOn, b: patch.startOn });
      } else {
        log(id, patch.startOn ? 'ตั้งวันเริ่ม {d}' : 'ลบวันเริ่ม',
          patch.startOn ? { d: patch.startOn } : null);
      }
      autoFire('start', id, { old: t.startOn || null, now: patch.startOn || null });
    }
    if ('dueTime' in patch && patch.dueTime !== t.dueTime) {
      log(id, patch.dueTime ? 'ตั้งเวลาส่ง {d}' : 'ลบเวลาส่ง',
        patch.dueTime ? { d: patch.dueTime } : null);
    }
    if ('startTime' in patch && patch.startTime !== t.startTime) {
      log(id, patch.startTime ? 'ตั้งเวลาเริ่ม {d}' : 'ลบเวลาเริ่ม',
        patch.startTime ? { d: patch.startTime } : null);
    }
    if ('name' in patch && patch.name !== t.name) {
      log(id, 'เปลี่ยนชื่องานจาก “{a}”', { a: t.name });
    }
    if ('priority' in patch && patch.priority !== t.priority) {
      var pn = PRIORITIES.filter(function (x) { return x.id === patch.priority; })[0];
      log(id, 'ตั้งความสำคัญเป็น {p}', { p: pn ? pn.label : patch.priority });
    }
    if ('type' in patch && (patch.type !== t.type || (t.ctype && patch.ctype === null)) && !(opts && opts.noTypeLog)) {
      var tn = TASK_TYPES.filter(function (x) { return x.id === patch.type; })[0];
      log(id, 'เปลี่ยนชนิดงานเป็น {p}', { p: tn ? tn.label : patch.type });
    }
    if ('notes' in patch && (patch.notes || '') !== (t.notes || '')) {
      log(id, (patch.notes || '').trim() ? 'แก้ไขรายละเอียด' : 'ลบรายละเอียด');
      logConnected(id, t.notes, patch.notes);
    }
    if ('tags' in patch) {
      var was = t.tags || [], now = patch.tags || [];
      now.filter(function (x) { return was.indexOf(x) < 0; })
        .forEach(function (x) { log(id, 'เพิ่มแท็ก {t}', { t: x }); });
      was.filter(function (x) { return now.indexOf(x) < 0; })
        .forEach(function (x) { log(id, 'เอาแท็ก {t} ออก', { t: x }); });
    }
    if ('recur' in patch) {
      var rw = t.recur && t.recur.freq, rn2 = patch.recur && patch.recur.freq;
      if (patch.recur) {
        patch.recur.interval = Math.max(1, parseInt(patch.recur.interval, 10) || 1);
        patch.recur.days = Array.isArray(patch.recur.days) ? patch.recur.days : [];
      }
      if (rw !== rn2) {
        var rf = RECUR_FREQ.filter(function (x) { return x.id === rn2; })[0];
        log(id, rn2 ? 'ตั้งให้ทำซ้ำ {f}' : 'เลิกทำซ้ำ', rn2 ? { f: rf ? rf.label : rn2 } : null);
      }
    }
    if ('approval' in patch && patch.approval !== t.approval) {
      var st = APPROVAL_STATES.filter(function (x) { return x.id === patch.approval; })[0];
      if (st) {
        /* ผลการอนุมัติต้องถึงคนขอ (คนสร้างงาน) และผู้ติดตามเป็นการเฉพาะ
         * แยกชนิดออกมาจากความเคลื่อนไหวทั่วไป คนที่ปิดความเคลื่อนไหวไว้ยังได้รู้ผลอนุมัติ */
        var askers = [t.createdBy].concat(t.followers || []).filter(function (u, i, a) {
          return u && u !== db.currentUserId && a.indexOf(u) === i;
        });
        log(id, 'เปลี่ยนสถานะอนุมัติเป็น “{s}”', { s: st.label }, askers);
        var akey = APPROVAL_NOTICE[patch.approval];
        if (akey) notifyOnly(id, askers, akey, 'approval', { t: t.name });
        autoFire('approval', id, { v: patch.approval });
      }
    }

    Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
    if (t.type !== 'approval') t.approval = null;
    else if (!t.approval) t.approval = 'pending';

    commit();
    return t;
  }

  /* ---------- ถังขยะ ----------
   *
   * ลบงาน โปรเจกต์ หรือฟิลด์ แล้วไม่หายทันที แต่ย้ายมาพักไว้ที่ db.trash 30 วัน
   * Ctrl+Z ช่วยได้แค่ในหน้าต่างเดิมก่อนรีเฟรช ถังขยะช่วยได้แม้ผ่านไปหลายวัน
   * หรือคนอื่นในทีมเป็นคนลบ — แต่ละรายการเก็บของทุกชิ้นที่ต้องใช้กู้คืนไว้ครบในตัว
   *
   *   { id, kind: task|project|field, name, projectId, deletedAt, deletedBy, data }
   *
   * ความเห็นและค่าฟิลด์ของงานกลับมาด้วย แต่การแจ้งเตือนที่เคยชี้ไปหางานนั้นไม่กลับมา
   */
  function purgeOldTrash(list) {
    var limit = Date.now() - TRASH_DAYS * 86400000;
    return (list || []).filter(function (x) {
      var at = Date.parse(x.deletedAt);
      return !at || at >= limit;
    });
  }

  /** รหัสของงานนี้และงานย่อยทุกชั้นใต้มัน */
  function treeIds(id, out) {
    out = out || {};
    if (out[id]) return out;
    out[id] = true;
    db.tasks.forEach(function (t) { if (t.parentId === id) treeIds(t.id, out); });
    return out;
  }

  /** ตัดงาน (พร้อมงานย่อย) ออกจากข้อมูล แล้วคืนทุกอย่างที่ต้องใช้กู้คืน — ไม่ commit */
  function cutTasks(ids) {
    var set = {};
    ids.forEach(function (id) { treeIds(id, set); });
    var b = {
      tasks: clone(db.tasks.filter(function (t) { return set[t.id]; })),
      memberships: clone(db.memberships.filter(function (m) { return set[m.taskId]; })),
      stories: clone(db.stories.filter(function (s) { return set[s.taskId]; })),
      fieldValues: clone(db.fieldValues.filter(function (v) { return set[v.taskId]; })),
      deps: []
    };
    db.tasks.forEach(function (t) {
      if (set[t.id]) return;
      var keep = [];
      (t.dependsOn || []).forEach(function (d) {
        if (set[d.id]) b.deps.push({ taskId: t.id, dep: clone(d) });
        else keep.push(d);
      });
      t.dependsOn = keep;
    });
    db.tasks = db.tasks.filter(function (t) { return !set[t.id]; });
    db.memberships = db.memberships.filter(function (m) { return !set[m.taskId]; });
    db.stories = db.stories.filter(function (s) { return !set[s.taskId]; });
    db.fieldValues = db.fieldValues.filter(function (v) { return !set[v.taskId]; });
    db.notifications = db.notifications.filter(function (n) { return !n.taskId || !set[n.taskId]; });
    return b;
  }

  /** เอาของในห่อกลับเข้าข้อมูล — ข้ามส่วนที่ที่อยู่เดิมไม่มีแล้ว */
  function pasteTasks(b) {
    var have = {};
    db.tasks.forEach(function (t) { have[t.id] = true; });
    var back = {};
    b.tasks.forEach(function (t) {
      if (have[t.id]) return;
      db.tasks.push(t);
      back[t.id] = true;
    });
    b.tasks.forEach(function (t) {
      // งานแม่ถูกลบไปแล้วถาวร — งานย่อยที่กู้คืนกลายเป็นงานหลัก
      if (back[t.id] && t.parentId && !back[t.parentId] && !have[t.parentId]) t.parentId = null;
    });
    b.memberships.forEach(function (m) {
      if (!back[m.taskId]) return;
      var p = db.projects.filter(function (x) { return x.id === m.projectId; })[0];
      if (!p || !p.sections.length) return;
      if (!p.sections.some(function (s) { return s.id === m.sectionId; })) m.sectionId = p.sections[0].id;
      db.memberships.push(m);
    });
    b.stories.forEach(function (s) { if (back[s.taskId]) db.stories.push(s); });
    b.fieldValues.forEach(function (v) { if (back[v.taskId]) db.fieldValues.push(v); });
    b.deps.forEach(function (x) {
      var t = db.tasks.filter(function (y) { return y.id === x.taskId; })[0];
      if (t && !t.dependsOn.some(function (d) { return d.id === x.dep.id; })) t.dependsOn.push(x.dep);
    });
    return back;
  }

  function trashPush(kind, name, projectId, data) {
    db.trash = db.trash || [];
    var item = {
      id: uid('tr'), kind: kind, name: name, projectId: projectId || null,
      deletedAt: new Date().toISOString(), deletedBy: db.currentUserId, data: data
    };
    db.trash.push(item);
    return item;
  }

  /** ย้ายงานไปถังขยะ แยกรายการต่องานหลัก งานย่อยที่ถูกเลือกมาพร้อมแม่ไปอยู่ในห่อของแม่ */
  function trashTasks(ids) {
    var all = {};
    ids.forEach(function (id) { all[id] = true; });
    var roots = ids.filter(function (id) {
      var t = task(id), d = 0;
      while (t && t.parentId && d++ < 20) {
        if (all[t.parentId]) return false;
        t = task(t.parentId);
      }
      return !!task(id);
    });
    roots.forEach(function (id) {
      var t = task(id);
      var home = (index().memByTask[id] || [])[0];
      var name = t.name;
      trashPush('task', name, home ? home.projectId : null, cutTasks([id]));
    });
    return roots.length;
  }

  /* ลบ = แก้งาน ต้องผ่าน can('write', id) ที่ชั้นข้อมูลด้วย (เดิมไม่ตรวจเลย ด่านหน้าจอดูแค่บทบาทองค์กร
   * คนที่แสดงความเห็นได้ในโปรเจกต์ปิดจึงลบงานจากเมนูงานหรือปุ่ม Delete ได้) */
  function deleteTask(id) {
    if (!task(id)) return false;
    if (!can('write', id)) { denied('write'); return false; }
    snapshot('ลบงาน');
    trashTasks([id]);
    commit();
    return true;
  }

  function deleteTasks(ids) {
    if (!(ids || []).every(function (id) { return !task(id) || can('write', id); })) { denied('write'); return false; }
    snapshot('ลบ {n} งาน', { n: ids.length });
    trashTasks(ids);
    commit();
  }

  /** ของในถังที่คนนี้เห็น — ของที่ตัวเองลบ ผู้ดูแลเห็นของทุกคน ใหม่สุดก่อน */
  function trashItems(projectId) {
    var mine = db.currentUserId, admin = isAdmin();
    return (db.trash || []).filter(function (x) {
      if (projectId && x.projectId !== projectId) return false;   // 2c — ถังขยะของโปรเจกต์เดียว
      return admin || x.deletedBy === mine;
    }).slice().sort(function (a, b) { return a.deletedAt < b.deletedAt ? 1 : -1; });
  }

  function trashItem(id) {
    return (db.trash || []).filter(function (x) { return x.id === id; })[0] || null;
  }

  /** วันที่จะถูกลบถาวรเองถ้าไม่มีใครกู้คืน */
  function trashExpires(item) {
    var d = new Date(Date.parse(item.deletedAt) + TRASH_DAYS * 86400000);
    return iso(d);
  }

  /**
   * กู้คืนจากถังขยะ
   * @returns {{ok:boolean, reason?:string, taskId?:string, projectId?:string}}
   */
  function restoreTrash(id) {
    var it = trashItem(id);
    if (!it) return { ok: false, reason: 'ไม่พบรายการนี้ในถังขยะ' };
    if (!isAdmin() && it.deletedBy !== db.currentUserId) return { ok: false, reason: 'กู้คืนได้เฉพาะของที่ตัวเองลบ' };
    var out = { ok: true };
    if (it.kind === 'field') {
      var fp = db.projects.filter(function (p) { return p.id === it.projectId; })[0];
      if (!fp) return { ok: false, reason: 'โปรเจกต์ของฟิลด์นี้ถูกลบไปแล้ว' };
      if (fp.fields.some(function (f) { return f.id === it.data.field.id; })) {
        return { ok: false, reason: 'ฟิลด์นี้กลับมาอยู่แล้ว' };
      }
      snapshot('กู้คืนจากถังขยะ');
      fp.fields.splice(Math.min(it.data.index || 0, fp.fields.length), 0, it.data.field);
      it.data.values.forEach(function (v) { db.fieldValues.push(v); });
      out.projectId = fp.id;
    } else if (it.kind === 'project') {
      var pid = it.data.project.id;
      if (db.projects.some(function (p) { return p.id === pid; })) return { ok: false, reason: 'โปรเจกต์นี้กลับมาอยู่แล้ว' };
      snapshot('กู้คืนจากถังขยะ');
      db.projects.push(it.data.project);
      pasteTasks(it.data.bundle);
      var haveT = {};
      db.tasks.forEach(function (t) { haveT[t.id] = true; });
      it.data.memberships.forEach(function (m) {
        if (haveT[m.taskId] && !db.memberships.some(function (x) {
          return x.taskId === m.taskId && x.projectId === m.projectId;
        })) db.memberships.push(m);
      });
      (it.data.portfolios || []).forEach(function (fid) {
        var f = (db.portfolios || []).filter(function (x) { return x.id === fid; })[0];
        if (f && f.projectIds.indexOf(pid) < 0) f.projectIds.push(pid);
      });
      audit('project.restore', it.data.project.name, 'กู้คืนจากถังขยะ');
      out.projectId = pid;
    } else if (it.kind === 'comment') {
      /* Sprint 1B — ความเห็นกลับไปที่งานเดิม ถ้าตอนลบเหลือป้าย "ถูกลบแล้ว" (มีคนตอบอยู่) ก็เติมข้อความกลับ
       * ถ้าความเห็นแม่หายไปแล้วทั้งก้อน คำตอบกลับมาเป็นความเห็นปกติ ไม่ลอยอยู่ใต้แม่ที่ไม่มีตัว */
      var cs = it.data.story;
      if (!task(it.data.taskId)) return { ok: false, reason: 'งานของความเห็นนี้ถูกลบไปแล้ว กู้งานคืนก่อน' };
      var curS = story(cs.id);
      if (curS && !curS.deleted) return { ok: false, reason: 'ความเห็นนี้กลับมาอยู่แล้ว' };
      snapshot('กู้คืนจากถังขยะ');
      if (curS) {
        Object.keys(cs).forEach(function (k) { curS[k] = cs[k]; });
      } else {
        if (it.data.parent && !story(it.data.parent.id)) db.stories.push(it.data.parent);
        if (cs.parentId && !story(cs.parentId)) cs.parentId = null;
        db.stories.push(cs);
      }
      dropIndex();
      log(it.data.taskId, 'กู้คืนความเห็นจากถังขยะ');
      out.taskId = it.data.taskId;
    } else {
      snapshot('กู้คืนจากถังขยะ');
      var back = pasteTasks(it.data);
      var root = it.data.tasks.filter(function (t) { return back[t.id]; })[0];
      if (!root) return { ok: false, reason: 'งานนี้กลับมาอยู่แล้ว' };
      dropIndex();
      log(root.id, 'กู้คืนจากถังขยะ');
      out.taskId = root.id;
    }
    db.trash = db.trash.filter(function (x) { return x.id !== id; });
    commit();
    return out;
  }

  /** ลบถาวร — ย้อนกลับได้ด้วย Ctrl+Z ในหน้าต่างเดิมเท่านั้น */
  function purgeTrash(id) {
    var it = trashItem(id);
    if (!it) return false;
    if (!isAdmin() && it.deletedBy !== db.currentUserId) return false;
    snapshot('ลบถาวร');
    db.trash = db.trash.filter(function (x) { return x.id !== id; });
    if (it.kind === 'project') audit('project.purge', it.name, 'ลบออกจากถังขยะถาวร');
    commit();
    return true;
  }

  /* ---------- คัดลอก รวมงานซ้ำ และมอบสำเนา ---------- */

  /**
   * คัดลอกงาน
   * @param o  { name, assignee, notes, subtasks, attachments, tags, followers,
   *             projects, deps, dates, fields } — ไม่ส่ง = คัดลอกทุกอย่าง
   *           assigneeId บังคับผู้รับผิดชอบของสำเนา, quiet ไม่ snapshot/commit
   */
  /** Sprint 1B — สำเนาจะไปเกิดที่ไหน ต้องสร้างงานที่นั่นได้ทุกที่
   *  งานย่อย = แก้งานแม่ได้ · เอาโปรเจกต์ไปด้วย = แก้ทุกโปรเจกต์ของงานนั้นได้ · ไม่เอา = งานส่วนตัว */
  function canCopyTask(t, opt) {
    if (t.parentId) return canCreateTask(null, t.parentId);
    if (opt.projects) {
      var ms = index().memByTask[t.id] || [];
      if (ms.length) return ms.every(function (m) { return canCreateTask(m.projectId); });
    }
    return canCreateTask(null);
  }

  function duplicateTask(id, o) {
    var t = task(id);
    if (!t) return null;
    var raw = o || {};
    var opt = dupOpts(raw);
    if (!canCopyTask(t, opt)) return denied('create');
    if (!raw.quiet) snapshot('คัดลอกงาน');
    var copy = copyTaskTree(t, opt, t.parentId, 0);
    copy.name = raw.name || (t.name + ' ' + L('(สำเนา)'));
    if ('assigneeId' in raw) {
      copy.assigneeId = raw.assigneeId || null;
      if (copy.assigneeId && copy.followers.indexOf(copy.assigneeId) < 0) copy.followers.push(copy.assigneeId);
      stampAssign(copy);
    }
    if (opt.projects) copyMemberships(id, copy.id);
    /* ไม่เอาโปรเจกต์มาด้วยและไม่มีผู้รับผิดชอบ สำเนาจะไม่อยู่ที่ไหนเลยให้หาเจอ
     * จึงมอบให้คนที่กดคัดลอก อย่างน้อยยังโผล่ในงานของฉัน */
    if (!t.parentId && !opt.projects && !copy.assigneeId) {
      copy.assigneeId = db.currentUserId;
      stampAssign(copy);
    }
    log(copy.id, 'คัดลอกมาจาก “{t}”', { t: t.name });
    if (!raw.quiet) commit();
    return copy;
  }

  /**
   * มอบสำเนาให้หลายคน — หนึ่งคนหนึ่งงาน ชื่อเดิม รายละเอียดเดิม
   * งานต้นฉบับที่ยังไม่มีใครรับ ให้คนแรกที่เลือกรับตัวจริงไป คนที่เหลือได้สำเนา
   */
  function assignCopies(taskId, userIds) {
    var t = task(taskId);
    var people = (userIds || []).filter(function (u, i, a) { return user(u) && a.indexOf(u) === i; });
    if (!t || !people.length) return [];
    /* Sprint 1B — แก้งานต้นฉบับ (ผู้รับผิดชอบ) และสร้างสำเนาในที่เดียวกัน ต้องผ่านทั้งสองอย่าง */
    if (!can('write', taskId) || !canCopyTask(t, dupOpts(null))) { denied('create'); return []; }
    snapshot('มอบสำเนาให้ {n} คน', { n: people.length });
    var made = [];
    if (!t.assigneeId) {
      var first = people.shift();
      t.assigneeId = first;
      stampAssign(t);
      if (t.followers.indexOf(first) < 0) t.followers.push(first);
      log(taskId, 'มอบหมายให้ {who}', { who: user(first).name }, [first]);
      notifyOnly(taskId, [first], assignKey(t.type === 'approval'), 'assigned', { t: t.name });
    }
    people.forEach(function (u) {
      if (u === t.assigneeId) return;
      var c = duplicateTask(taskId, { quiet: true, name: t.name, assigneeId: u });
      if (!c) return;
      notifyOnly(c.id, [u], assignKey(c.type === 'approval'), 'assigned', { t: c.name });
      made.push(c);
    });
    commit();
    return made;
  }

  /**
   * รวมงานซ้ำเข้ากับงานหลัก
   * แท็ก ผู้ติดตาม และคนที่กดถูกใจย้ายไปอยู่ที่งานหลัก
   * งานซ้ำถูกติ๊กเสร็จและเติม [ซ้ำ] หน้าชื่อ ไม่ได้ลบทิ้ง ประวัติและความเห็นจึงยังตามอ่านได้
   */
  function mergeDuplicate(dupId, masterId) {
    var d = task(dupId), m = task(masterId);
    if (!d || !m || dupId === masterId) return false;
    if (!can('write', dupId) || !can('write', masterId)) { denied('write'); return false; }   // Sprint 1B
    if (treeIds(dupId)[masterId]) return false;   // รวมเข้ากับงานย่อยของตัวเองไม่ได้
    snapshot('รวมงานซ้ำ');
    function union(a, b) {
      (b || []).forEach(function (x) { if (a.indexOf(x) < 0) a.push(x); });
      return a;
    }
    var addedTags = (d.tags || []).filter(function (x) { return m.tags.indexOf(x) < 0; });
    union(m.tags, d.tags);
    union(m.followers, d.followers);
    if (d.assigneeId && m.followers.indexOf(d.assigneeId) < 0) m.followers.push(d.assigneeId);
    union(m.likes, d.likes);
    var watchers = union([d.assigneeId, d.createdBy].filter(Boolean), d.followers);
    var prefix = L('[ซ้ำ]') + ' ';
    if (d.name.indexOf(prefix) !== 0) d.name = prefix + d.name;
    var wasOpen = !d.completed;
    d.completed = true;
    d.completedAt = today();
    d.completedBy = db.currentUserId || null;
    log(dupId, 'ปิดเป็นงานซ้ำของ “{t}”', { t: m.name }, watchers);
    log(masterId, 'รวมงานซ้ำ “{t}” เข้ามา', { t: d.name });
    addedTags.forEach(function (x) { log(masterId, 'เพิ่มแท็ก {t}', { t: x }); });
    notifyOnly(dupId, watchers, 'ปิด “{t}” เป็นงานซ้ำของ “{m}”', 'activity', { t: d.name, m: m.name });
    if (wasOpen) {
      blocking(dupId).forEach(function (b) {
        if (!b.dependsOn.some(function (x) { return x.id === masterId; }) && b.id !== masterId &&
            !dependsOnDeep(masterId, b.id)) {
          b.dependsOn.push({ id: masterId, type: 'FS' });
        }
      });
    }
    commit();
    return true;
  }

  /* ---------- งานติดตามผล ----------
   *
   * "ติดตาม: ชื่องาน" มอบให้ตัวเอง อยู่โปรเจกต์และคอลัมน์เดียวกับงานต้นทาง
   * รายละเอียดมีลิงก์กลับไปที่งานเดิม เปิดงานติดตามแล้วกดกลับไปดูบริบทได้ทันที */
  function refLabel(s) { return String(s || '').replace(/[\[\]\n]/g, ' ').slice(0, 180); }

  function createFollowUp(srcId, name, dueOn) {
    var src = task(srcId);
    if (!src) return null;
    if (!canCreateTask(null) || !canSeeTask(srcId)) return denied('create');
    snapshot('สร้างงานติดตามผล');
    var t = createTaskRaw({
      name: name || (L('ติดตาม:') + ' ' + src.name),
      assigneeId: db.currentUserId,
      dueOn: dueOn || null,
      notes: L('ติดตามผลจาก') + ' @[' + refLabel(src.name) + '](' + src.id + ')'
    }, null, null);
    /* Sprint 1B — ตามไปอยู่เฉพาะโปรเจกต์ที่เราสร้างงานได้
     * คนที่แสดงความเห็นได้อย่างเดียวยังสร้างงานติดตามผลของตัวเองได้ แต่งานจะอยู่ในงานของฉัน (ส่วนตัว)
     * ไม่ไปโผล่ในโปรเจกต์ที่เขาไม่มีสิทธิ์เพิ่มงาน */
    db.memberships.filter(function (m) { return m.taskId === srcId && canCreateTask(m.projectId); })
      .forEach(function (m) {
        db.memberships.push({ id: uid('m'), taskId: t.id, projectId: m.projectId, sectionId: m.sectionId,
          position: nextPosition(m.projectId, m.sectionId) });
        notifyNewTask(t, m.projectId);
      });
    log(srcId, 'สร้างงานติดตามผล “{t}”', { t: t.name });
    commit();
    return t;
  }

  /* ---------- งานย่อย ---------- */

  /** แปลงงานเป็นงานย่อยของอีกงาน — ออกจากโปรเจกต์เดิม ไปอยู่ใต้งานแม่แทน */
  function setParent(taskId, parentId) {
    var t = task(taskId), p = task(parentId);
    if (!t || !p || taskId === parentId) return false;
    if (treeIds(taskId)[parentId]) return false;     // แม่เป็นลูกหลานของมันเองไม่ได้
    if (t.parentId === parentId) return false;
    if (!can('write', taskId) || !canCreateTask(null, parentId)) { denied('write'); return false; }   // Sprint 1B
    snapshot('แปลงเป็นงานย่อย');
    t.parentId = parentId;
    db.memberships = db.memberships.filter(function (m) { return m.taskId !== taskId; });
    log(taskId, 'แปลงเป็นงานย่อยของ “{t}”', { t: p.name });
    log(parentId, 'เพิ่มงานย่อย “{t}”', { t: t.name });
    commit();
    return true;
  }

  /** ย้ายงานย่อยออกมาเป็นงานหลัก วางในโปรเจกต์และคอลัมน์เดียวกับงานแม่ */
  function promoteSubtask(taskId) {
    var t = task(taskId);
    if (!t || !t.parentId) return false;
    var p = task(t.parentId);
    var root = p, d = 0;
    while (root && root.parentId && d++ < 20) root = task(root.parentId);
    /* Sprint 1B — ออกมาเป็นงานหลักในโปรเจกต์ของงานต้นทาง = สร้างงานในโปรเจกต์นั้น */
    var rootMs = root ? (index().memByTask[root.id] || []) : [];
    if (!can('write', taskId) || !rootMs.every(function (m) { return canCreateTask(m.projectId); })) {
      denied('create'); return false;
    }
    snapshot('ย้ายออกเป็นงานหลัก');
    t.parentId = null;
    if (root) copyMemberships(root.id, taskId);
    log(taskId, 'ย้ายออกจาก “{t}” เป็นงานหลัก', { t: p ? p.name : '?' });
    commit();
    return true;
  }

  /** ช่วงวันของงาน [เริ่ม, จบ] — มีวันเดียวก็ใช้วันนั้นทั้งสองฝั่ง */
  function spanOf(t) {
    var a = t.startOn || t.dueOn, b = t.dueOn || t.startOn;
    return a ? [a, b] : null;
  }

  /** งานย่อยที่วันหลุดออกนอกช่วงวันของงานแม่ */
  function subtasksOutside(parentId) {
    var p = task(parentId);
    var ps = p && spanOf(p);
    if (!ps) return [];
    return subtasks(parentId).filter(function (s) {
      var ss = spanOf(s);
      return ss && !s.completed && (ss[0] < ps[0] || ss[1] > ps[1]);
    });
  }

  /** ขยายวันของงานแม่ให้ครอบงานย่อยทุกชิ้น — ขยายอย่างเดียว ไม่หดช่วงที่ตั้งไว้ */
  function fitParentDates(parentId) {
    var p = task(parentId);
    if (!p) return false;
    var lo = null, hi = null;
    subtasks(parentId).forEach(function (s) {
      var ss = spanOf(s);
      if (!ss) return;
      if (!lo || ss[0] < lo) lo = ss[0];
      if (!hi || ss[1] > hi) hi = ss[1];
    });
    if (!lo) return false;
    var ps = spanOf(p);
    var start = ps ? (lo < ps[0] ? lo : ps[0]) : lo;
    var due = ps ? (hi > ps[1] ? hi : ps[1]) : hi;
    var patch = {};
    if (due !== p.dueOn) patch.dueOn = due;
    if ((start !== due || p.startOn) && start !== p.startOn) patch.startOn = start;
    if (!Object.keys(patch).length) return false;
    updateTask(parentId, patch);
    return true;
  }

  function moveTask(taskId, projectId, toSectionId, beforeTaskId) {
    var m = db.memberships.filter(function (x) {
      return x.taskId === taskId && x.projectId === projectId;
    })[0];
    if (!m) return;
    if (!canArrangeIn(projectId)) { denied('write'); return; }   // Sprint 1B — ลากย้ายในโปรเจกต์ที่แก้ไม่ได้
    snapshot('ย้ายงาน');

    var list = tasksInSection(projectId, toSectionId)
      .filter(function (x) { return x.task.id !== taskId; });

    var newPos;
    if (!beforeTaskId) {
      newPos = list.length ? list[list.length - 1].membership.position + 1 : 1;
    } else {
      var idx = -1;
      list.forEach(function (x, i) { if (x.task.id === beforeTaskId) idx = i; });
      if (idx < 0) newPos = list.length ? list[list.length - 1].membership.position + 1 : 1;
      else if (idx === 0) newPos = list[0].membership.position / 2;
      else newPos = (list[idx - 1].membership.position + list[idx].membership.position) / 2;
    }

    setSectionRaw(m, toSectionId, newPos);
    commit();
  }

  /** ย้ายคอลัมน์ของ membership หนึ่งอัน — ทางเดียวที่งานเปลี่ยนคอลัมน์ในโปรเจกต์ (ลาก ย้ายหลายงาน
   *  ลากลงกลุ่ม ตัวเลือกคอลัมน์ในแผงงาน และอัตโนมัติ) ไม่ snapshot/commit
   *  ลงประวัติและปลุกอัตโนมัติ "ย้ายเข้าคอลัมน์" เมื่อคอลัมน์เปลี่ยนจริง */
  function setSectionRaw(m, sectionId, position) {
    var moved = m.sectionId !== sectionId;
    var from = m.sectionId;
    if (moved) {
      var s = section(m.projectId, sectionId);
      if (s) log(m.taskId, 'ย้ายไปเซกชัน {c}', { c: s.name });
    }
    m.sectionId = sectionId;
    if (position != null) m.position = position;
    if (moved) autoFire('moved', m.taskId, { projectId: m.projectId, sec: sectionId, from: from });
    return moved;
  }

  function addTaskToProject(taskId, projectId, sectionId) {
    var exists = db.memberships.filter(function (m) {
      return m.taskId === taskId && m.projectId === projectId;
    })[0];
    if (exists) return exists;
    /* Sprint 1B — เอางานเข้าโปรเจกต์ = สร้างงานในโปรเจกต์ปลายทาง และต้องเห็นงานนั้นอยู่แล้ว
     * ยกเว้นตอนระบบอัตโนมัติทำ (กฎที่คนแก้โปรเจกต์ตั้งไว้ ไม่ใช่การกดของคนที่บังเอิญปลุกกฎ) */
    if (!autoCtx && (!canCreateTask(projectId) || !canSeeTask(taskId))) return denied('create');
    snapshot('เพิ่มเข้าโปรเจกต์');
    var p = project(projectId);
    var sid = sectionId || (p.sections[0] && p.sections[0].id);
    var m = {
      id: uid('m'), taskId: taskId, projectId: projectId,
      sectionId: sid, position: nextPosition(projectId, sid)
    };
    db.memberships.push(m);
    log(taskId, 'เพิ่มเข้าโปรเจกต์ {p}', { p: p.name });
    notifyNewTask(task(taskId), projectId);
    commit();
    return m;
  }

  function removeTaskFromProject(taskId, projectId) {
    var all = db.memberships.filter(function (m) { return m.taskId === taskId; });
    if (all.length <= 1) return false;
    snapshot('เอาออกจากโปรเจกต์');
    db.memberships = db.memberships.filter(function (m) {
      return !(m.taskId === taskId && m.projectId === projectId);
    });
    var rp = project(projectId);
    if (rp) log(taskId, 'เอาออกจากโปรเจกต์ {p}', { p: rp.name });
    commit();
    return true;
  }

  /* ---------- dependencies ---------- */

  function dependsOnDeep(fromId, targetId, seen) {
    seen = seen || {};
    if (seen[fromId]) return false;
    seen[fromId] = true;
    var t = task(fromId);
    if (!t) return false;
    for (var i = 0; i < t.dependsOn.length; i++) {
      if (t.dependsOn[i].id === targetId) return true;
      if (dependsOnDeep(t.dependsOn[i].id, targetId, seen)) return true;
    }
    return false;
  }

  function addDependency(taskId, blockerId, type) {
    if (taskId === blockerId) return false;
    var t = task(taskId);
    if (!t) return false;
    if (t.dependsOn.filter(function (d) { return d.id === blockerId; }).length) return false;
    // กันวนลูป: ตัวที่จะมาบล็อก ต้องไม่ขึ้นกับงานนี้ ไม่ว่าทางตรงหรือทางอ้อม
    if (dependsOnDeep(blockerId, taskId)) return false;
    snapshot('เพิ่มลำดับก่อนหลัง');
    t.dependsOn.push({ id: blockerId, type: type || 'FS' });
    log(taskId, 'รอ “{t}” ให้เสร็จก่อน', { t: task(blockerId).name });
    commit();
    return true;
  }

  function setDependencyType(taskId, blockerId, type) {
    var t = task(taskId);
    if (!t) return;
    t.dependsOn.forEach(function (d) { if (d.id === blockerId) d.type = type; });
    commit();
  }

  function removeDependency(taskId, blockerId) {
    var t = task(taskId);
    if (!t) return;
    snapshot('ลบลำดับก่อนหลัง');
    t.dependsOn = t.dependsOn.filter(function (d) { return d.id !== blockerId; });
    commit();
  }

  /* ---------- followers / likes / attachments / comments ---------- */

  function toggleFollower(taskId, userId) {
    var t = task(taskId);
    if (!t) return;
    snapshot('เปลี่ยนผู้ติดตาม');
    var i = t.followers.indexOf(userId);
    if (i >= 0) t.followers.splice(i, 1);
    else {
      t.followers.push(userId);
      autoFire('follower', taskId, { user: userId });
    }
    commit();
  }

  function toggleLike(taskId) {
    var t = task(taskId);
    if (!t) return;
    var i = t.likes.indexOf(db.currentUserId);
    if (i >= 0) t.likes.splice(i, 1);
    else {
      t.likes.push(db.currentUserId);
      /* Sprint 2B — เก็บเป็นคีย์ เดิมเป็นประโยคไทยสำเร็จรูป คนใช้ภาษาอังกฤษเห็น "Somchai ถูกใจงานนี้" */
      notify(taskId, (me() ? me().name : 'มีคน') + ' ถูกใจงานนี้', db.currentUserId, null, 'activity',
        null, 'ถูกใจงานนี้', null, me());
    }
    commit();
  }

  function addAttachment(taskId, name, url, meta) {
    var t = task(taskId);
    if (!t || !name) return;
    snapshot('แนบไฟล์');
    /* เก็บคนแนบและเวลาไว้ด้วย หน้ารวมไฟล์ต้องตอบได้ว่าใครเอามาลงเมื่อไหร่
     * ไฟล์เก่าที่ไม่มีสองค่านี้ยังแสดงได้ แค่ไม่มีบรรทัดที่มา
     * ส่วน size กับ mime มีเฉพาะไฟล์ที่เลือกมาจากเครื่อง ลิงก์เปล่าไม่มี */
    t.attachments.push(withRemote({
      id: uid('a'), name: name, url: url || '',
      size: (meta && meta.size) || null,
      mime: (meta && meta.mime) || null,
      addedBy: db.currentUserId, addedAt: new Date().toISOString()
    }, meta));
    log(taskId, 'แนบ “{f}”', { f: name });
    autoFire('attachment', taskId, { name: name });
    commit();
  }

  function removeAttachment(taskId, attId) {
    var t = task(taskId);
    if (!t) return;
    snapshot('ลบไฟล์แนบ');
    t.attachments = t.attachments.filter(function (a) { return a.id !== attId; });
    if (t.coverId === attId) t.coverId = null;
    commit();
  }

  /* ---------- อีโมจิตอบรับความเห็น ----------
   *
   * ตอบรับสั้น ๆ ว่าอ่านแล้วหรือเห็นด้วย โดยไม่ต้องพิมพ์ตอบ
   * ในกลุ่มยี่สิบคน ถ้าทุกคนพิมพ์ "รับทราบ" เธรดจะยาวจนหาเนื้อหาจริงไม่เจอ
   * เก็บเป็น { อีโมจิ: [รหัสผู้ใช้] } นับจำนวนได้และรู้ด้วยว่าใครกดบ้าง
   */
  var REACTIONS = ['👍', '✅', '🎉', '❤️', '👀', '🙏'];

  function toggleReaction(storyId, emoji) {
    var s = null;
    for (var i = 0; i < db.stories.length; i++) {
      if (db.stories[i].id === storyId) { s = db.stories[i]; break; }
    }
    if (!s || REACTIONS.indexOf(emoji) < 0) return false;
    s.reactions = s.reactions || {};
    var who = (s.reactions[emoji] || []).slice();
    var j = who.indexOf(db.currentUserId);
    if (j >= 0) who.splice(j, 1); else who.push(db.currentUserId);
    if (who.length) s.reactions[emoji] = who; else delete s.reactions[emoji];
    commit();
    return j < 0;
  }

  function story(id) {
    for (var i = 0; i < db.stories.length; i++) {
      if (db.stories[i].id === id) return db.stories[i];
    }
    return null;
  }

  function repliesOf(storyId) {
    return db.stories.filter(function (s) {
      return s.type === 'comment' && s.parentId === storyId;
    }).sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
  }

  /**
   * @param parentId ตอบกลับความเห็นไหน — ตอบได้ชั้นเดียวแบบ Asana
   *                 ถ้าส่งรหัสของคำตอบมา จะเกาะไปที่ความเห็นแม่ของมันแทน
   */
  function addComment(taskId, text, parentId) {
    if (!text || !text.trim()) return null;
    var t = task(taskId);
    if (!t) return null;
    var clean = text.trim();
    var parent = parentId ? story(parentId) : null;
    if (parent && parent.parentId) parent = story(parent.parentId);
    if (parent && (parent.type !== 'comment' || parent.taskId !== taskId)) parent = null;

    snapshot('เพิ่มความเห็น');          // 3a — ย้อนกลับได้ (รวมสิ่งที่อัตโนมัติทำตามความเห็นนี้)
    var s = {
      id: uid('st'), taskId: taskId, actorId: db.currentUserId,
      type: 'comment', text: clean, createdAt: new Date().toISOString(),
      parentId: parent ? parent.id : null, editedAt: null, pinned: false, deleted: false
    };
    db.stories.push(s);
    var mentioned = parseMentions(clean);
    mentioned.forEach(function (u) {
      if (t.followers.indexOf(u) < 0) t.followers.push(u);
    });
    var actor = me();
    /* คนที่ถูกพูดถึงกับคนที่แค่ติดตาม ต้องแยกชนิดกัน
     * เพราะคนปิด "ความเห็นใหม่" ทิ้งได้ แต่ไม่มีใครอยากพลาดตอนถูกเรียกชื่อ */
    /* Sprint 2B — ทุกการแจ้งเตือนของความเห็นจำรหัสความเห็นไว้ (story)
     * กล่องแจ้งเตือนจะโชว์เนื้อความสองบรรทัดแรก และกดแล้วพาไปที่ความเห็นนั้นพร้อมไฮไลต์ */
    var sx = { story: s.id };
    if (mentioned.length) {
      notifyOnly(taskId, mentioned, 'พูดถึงคุณในความเห็น', 'mention', null, false, sx);
    }
    if (parent) {
      /* คำตอบในเธรดแจ้งเฉพาะคนที่อยู่ในบทสนทนานั้น ไม่กระจายไปหาผู้ติดตามทั้งงาน
       * งานที่มีคนติดตามยี่สิบคน ถ้าทุกคำตอบสั้น ๆ เด้งหาทุกคน กล่องแจ้งเตือนจะไม่มีใครอ่าน */
      var inThread = [parent.actorId];
      repliesOf(parent.id).forEach(function (r) {
        if (inThread.indexOf(r.actorId) < 0) inThread.push(r.actorId);
      });
      notifyOnly(taskId, inThread.filter(function (u) { return mentioned.indexOf(u) < 0; }),
        'ตอบกลับความเห็นในงาน “{t}”', 'comment', { t: t.name }, false, sx);
    } else {
      /* Sprint 2B — คีย์ใหม่มีชื่องาน เดิม "แสดงความเห็น" อย่างเดียว ภาษาอังกฤษจึงค้างเป็น "commented on" */
      notify(taskId, (actor ? actor.name : 'มีคน') + ' ' + fill('แสดงความเห็นในงาน “{t}”', { t: t.name }),
        db.currentUserId, [], 'comment', mentioned, 'แสดงความเห็นในงาน “{t}”', { t: t.name }, actor, sx);
    }
    logConnected(taskId, '', clean);
    if (autoCtx) s.auto = 1;            // 3a — ความเห็นที่อัตโนมัติเขียน
    autoFire('comment', taskId, { story: s.id });
    commit();
    return s;
  }

  /** แก้ความเห็นของตัวเองเท่านั้น — ข้อความของคนอื่นไม่ควรมีใครเปลี่ยนคำพูดแทนได้ */
  function editComment(storyId, text) {
    var s = story(storyId);
    if (!s || s.type !== 'comment' || s.deleted) return false;
    if (s.actorId !== db.currentUserId) return false;
    var clean = (text || '').trim();
    if (!clean || clean === s.text) return false;
    snapshot('แก้ไขความเห็น');
    var before = s.text;
    var wasMentioned = parseMentions(before);
    s.text = clean;
    s.editedAt = new Date().toISOString();
    var fresh = parseMentions(clean).filter(function (u) { return wasMentioned.indexOf(u) < 0; });
    var t = task(s.taskId);
    if (t) {
      fresh.forEach(function (u) { if (t.followers.indexOf(u) < 0) t.followers.push(u); });
      if (fresh.length) notifyOnly(s.taskId, fresh, 'พูดถึงคุณในความเห็น', 'mention', null, false, { story: s.id });
      logConnected(s.taskId, before, clean);
    }
    commit();
    return true;
  }

  /**
   * ลบความเห็นของตัวเอง
   *
   * ถ้ามีคนตอบอยู่ใต้มันแล้ว เก็บตัวความเห็นไว้เป็นป้าย "ความเห็นนี้ถูกลบแล้ว"
   * ไม่งั้นคำตอบทั้งเธรดจะลอยอยู่โดยไม่รู้ว่าตอบเรื่องอะไร
   * พอคำตอบสุดท้ายถูกลบ ป้ายนั้นก็หายตามไปเอง
   */
  function deleteComment(storyId) {
    var s = story(storyId);
    if (!s || s.type !== 'comment' || s.deleted) return false;
    if (s.actorId !== db.currentUserId) return false;
    snapshot('ลบความเห็น');
    /* Sprint 1B — ความเห็นที่ลบไปพักในถังขยะ 30 วันเหมือนงานและโปรเจกต์
     * เดิมมีแค่ปุ่มย้อนกลับไม่กี่วินาที พ้นจากนั้นข้อความ (ซึ่งมักเป็นข้อตกลงหรือตัวเลข) หายถาวร
     * เก็บสำเนาก่อนแก้ไว้ทั้งก้อน รวมป้าย "ถูกลบแล้ว" ของความเห็นแม่ที่จะหายตามไปด้วย */
    var tk = task(s.taskId);
    var home = tk ? (index().memByTask[rootOf(tk).id] || [])[0] : null;
    var tparent = s.parentId ? story(s.parentId) : null;
    var dropsParent = !!(tparent && tparent.deleted && !repliesOf(s.id).length &&
      repliesOf(tparent.id).length === 1);
    trashPush('comment', plainText(s.text).replace(/\s+/g, ' ').slice(0, 80), home ? home.projectId : null, {
      taskId: s.taskId, story: clone(s), parent: dropsParent ? clone(tparent) : null
    });
    /* ลงประวัติของงานโดยไม่เด้งแจ้งผู้ติดตาม (ไม่ใช่ข่าวที่ทุกคนต้องรู้) และลงบันทึกการทำงานของผู้ดูแล
     * บันทึกการทำงานไม่เก็บเนื้อความ — คนลบอาจลบเพราะพิมพ์ข้อมูลลับ ของในถังหมดอายุใน 30 วัน
     * แต่บันทึกการทำงานอยู่นานกว่านั้น ถ้าเก็บเนื้อความไว้ก็เท่ากับลบไม่ออก */
    log(s.taskId, 'ลบความเห็นหนึ่งรายการ', null, tk ? (tk.followers || []).slice() : null);
    audit('comment.delete', tk ? tk.name : s.taskId, 'ลบความเห็นในงานนี้ (กู้คืนได้จากถังขยะ)');
    if (repliesOf(s.id).length) {
      s.deleted = true;
      s.text = '';
      s.pinned = false;
      delete s.reactions;
    } else {
      db.stories = db.stories.filter(function (x) { return x !== s; });
      var p = s.parentId ? story(s.parentId) : null;
      if (p && p.deleted && !repliesOf(p.id).length) {
        db.stories = db.stories.filter(function (x) { return x !== p; });
      }
    }
    commit();
    return true;
  }

  /** ปักหมุดความเห็นที่เป็นข้อสรุปไว้บนสุด คนที่มาทีหลังไม่ต้องไล่อ่านทั้งเธรด */
  function togglePinComment(storyId) {
    var s = story(storyId);
    if (!s || s.type !== 'comment' || s.deleted || s.parentId) return null;
    snapshot(s.pinned ? 'เลิกปักหมุดความเห็น' : 'ปักหมุดความเห็น');
    s.pinned = !s.pinned;
    commit();
    return s.pinned;
  }

  function setFieldValue(taskId, fieldId, value) {
    var def = fieldDef(fieldId);
    if (def && (def.type === 'id' || def.type === 'formula')) return;   // รหัสงานออกเลขเอง สูตรคำนวณเอง แก้ด้วยมือไม่ได้
    var fv = db.fieldValues.filter(function (v) { return v.taskId === taskId && v.fieldId === fieldId; })[0];
    var empty = (value === null || value === '' ||
                 (value && value.length === 0 && typeof value !== 'number'));
    if (JSON.stringify(fv ? fv.value : null) === JSON.stringify(empty ? null : value)) return;
    /* 3a — ค่าฟิลด์ย้อนกลับได้แล้ว (เดิมไม่มีจุดย้อนกลับ) และอัตโนมัติที่ตามมาอยู่ในจุดเดียวกัน */
    snapshot('แก้ค่าฟิลด์');
    setFieldRaw(taskId, fieldId, value);
    commit();
  }

  /* ---------- bulk ---------- */

  function bulkUpdate(ids, patch) {
    snapshot('แก้ {n} งานพร้อมกัน', { n: ids.length });
    ids.forEach(function (id) { updateTask(id, clone(patch), { quiet: true }); });
    commit();
  }

  /** ย้ายหลายงานไปคอลัมน์เดียวกัน — ผ่าน setSectionRaw เหมือนการลาก อัตโนมัติ "ย้ายเข้าคอลัมน์" จึงทำงาน */
  function bulkMove(ids, projectId, sectionId) {
    if (!section(projectId, sectionId)) return;
    if (!canArrangeIn(projectId)) { denied('write'); return; }   // Sprint 1B
    snapshot('ย้าย {n} งาน', { n: ids.length });
    ids.forEach(function (id) {
      var m = db.memberships.filter(function (x) {
        return x.taskId === id && x.projectId === projectId;
      })[0];
      if (m) setSectionRaw(m, sectionId, nextPosition(projectId, sectionId));
    });
    commit();
  }

  /* ---------- notification mutations ---------- */

  function markRead(id) {
    var n = notification(id);
    if (n && !n.read) { n.read = true; commit(); }
  }
  /** @returns จำนวนรายการที่เพิ่งทำเป็นอ่านแล้ว
   *  Sprint 2B — ไม่ถามก่อน แต่ย้อนกลับได้ (snapshot) กดพลาดแล้วไม่เสียรายการที่ยังไม่ได้อ่าน
   *  รายการที่เลื่อนเตือนไว้ไม่แตะ กลับมาตามเวลาแล้วต้องยังเป็นรายการใหม่ */
  function markAllRead(userId) {
    var list = db.notifications.filter(function (n) {
      return n.userId === userId && !n.read && !isSnoozed(n);
    });
    if (!list.length) return 0;
    snapshot('อ่านทั้งหมด');
    list.forEach(function (n) { n.read = true; });
    commit();
    return list.length;
  }
  function archiveNotification(id) {
    var n = notification(id);
    if (n) { n.archived = true; n.read = true; commit(); }
  }
  /** @param ids  เก็บเฉพาะรายการเหล่านี้ (ที่ผ่านตัวกรองอยู่) ไม่ส่ง = ทั้งหมด */
  function archiveAll(userId, ids) {
    var only = null;
    if (ids) { only = {}; ids.forEach(function (x) { only[x] = true; }); }
    snapshot('เก็บการแจ้งเตือนทั้งหมด');
    db.notifications.forEach(function (n) {
      if (n.userId === userId && (!only || only[n.id])) { n.archived = true; n.read = true; }
    });
    commit();
  }

  /* ---------- พอร์ตโฟลิโอ ----------
   *
   * กล่องรวมโปรเจกต์ไว้ดูภาพรวมทีเดียว เช่น "สินค้าใหม่ปี 2027" หรือ "งานฝ่ายการตลาด"
   * ไม่ใช่ชั้นสิทธิ์ใหม่ เป็นแค่มุมมองรวม
   *
   * สิทธิ์ยังยึดตามโปรเจกต์เหมือนเดิม พอร์ตโฟลิโอที่มีโปรเจกต์ปิดอยู่ข้างใน
   * คนที่ไม่ได้เป็นสมาชิกโปรเจกต์นั้นจะไม่เห็นทั้งแถวและไม่ถูกนับในตัวเลขสรุป
   * ถ้าไม่กันตรงนี้ พอร์ตโฟลิโอจะกลายเป็นช่องทางอ้อมไปดูว่ามีโปรเจกต์ลับอะไรอยู่บ้าง
   */
  function portfolios() { return db.portfolios || []; }

  function portfolio(id) {
    return (db.portfolios || []).filter(function (f) { return f.id === id; })[0] || null;
  }

  /** โปรเจกต์ในพอร์ตโฟลิโอที่คนปัจจุบันมีสิทธิ์เห็น เรียงตามลำดับที่จัดไว้ */
  function portfolioProjects(portfolioId) {
    var f = portfolio(portfolioId);
    if (!f) return [];
    return f.projectIds
      .map(function (pid) { return project(pid); })
      .filter(function (p) { return p && projectAccess(p.id); });
  }

  /** จำนวนโปรเจกต์ที่ถูกซ่อนเพราะไม่มีสิทธิ์ ไว้บอกตรง ๆ ว่ายังมีของที่มองไม่เห็น */
  function portfolioHidden(portfolioId) {
    var f = portfolio(portfolioId);
    if (!f) return 0;
    return f.projectIds.filter(function (pid) {
      var p = project(pid);
      return p && !projectAccess(pid);
    }).length;
  }

  function createPortfolio(attrs) {
    attrs = attrs || {};
    snapshot('สร้างพอร์ตโฟลิโอ');
    var f = {
      id: uid('pf'),
      name: attrs.name || 'พอร์ตโฟลิโอใหม่',
      icon: attrs.icon || '🗂',
      color: attrs.color || PALETTE[(db.portfolios || []).length % PALETTE.length],
      description: attrs.description || '',
      owner: db.currentUserId,
      projectIds: attrs.projectIds || [],
      status: null,
      statusLog: [],
      createdBy: db.currentUserId,
      createdAt: today()
    };
    db.portfolios = db.portfolios || [];
    normalizePortfolio(f);                    // 4a — ฟิลด์ มุมมอง ประกาศ พอร์ตโฟลิโอย่อย
    db.portfolios.push(f);
    audit('portfolio.create', f.name);
    commit();
    return f;
  }

  function updatePortfolio(id, patch) {
    var f = portfolio(id);
    if (!f) return null;
    Object.keys(patch).forEach(function (k) { f[k] = patch[k]; });
    commit();
    return f;
  }

  function deletePortfolio(id) {
    var f = portfolio(id);
    if (!f) return false;
    snapshot('ลบพอร์ตโฟลิโอ');
    db.portfolios = db.portfolios.filter(function (x) { return x.id !== id; });
    /* 4a — ถอดออกจากพอร์ตโฟลิโอแม่ ทีมที่ปักหมุดไว้ และเป้าหมายที่ผูกไว้ด้วย */
    db.portfolios.forEach(function (x) { x.portfolioIds = (x.portfolioIds || []).filter(function (c) { return c !== id; }); });
    (db.teams || []).forEach(function (tm) { tm.pins = (tm.pins || []).filter(function (c) { return c !== id; }); });
    /* ลบกล่องไม่ได้ลบของข้างใน โปรเจกต์ทุกอันยังอยู่ครบ
     * ถ้าลบตามไปด้วยจะเป็นการทำลายงานจริงเพราะแค่จัดกลุ่มผิด */
    audit('portfolio.delete', f.name, 'มีโปรเจกต์อยู่ {n} โปรเจกต์ ซึ่งยังอยู่ครบ', { n: f.projectIds.length });
    commit();
    return true;
  }

  function addToPortfolio(portfolioId, projectId) {
    var f = portfolio(portfolioId);
    var p = project(projectId);
    if (!f || !p) return false;
    if (f.projectIds.indexOf(projectId) >= 0) return false;
    snapshot('เพิ่มโปรเจกต์เข้าพอร์ตโฟลิโอ');
    f.projectIds.push(projectId);
    audit('portfolio.add', f.name, p.name);
    commit();
    return true;
  }

  function removeFromPortfolio(portfolioId, projectId) {
    var f = portfolio(portfolioId);
    if (!f) return false;
    var p = project(projectId);
    snapshot('ถอดออกจากพอร์ตโฟลิโอ');
    f.projectIds = f.projectIds.filter(function (x) { return x !== projectId; });
    audit('portfolio.remove', f.name, p ? p.name : projectId);
    commit();
    return true;
  }

  /** พอร์ตโฟลิโอที่โปรเจกต์นี้อยู่ */
  function portfoliosOfProject(projectId) {
    return (db.portfolios || []).filter(function (f) {
      return f.projectIds.indexOf(projectId) >= 0;
    });
  }

  /** ช่วงวันของโปรเจกต์ = วันแรกสุดถึงวันท้ายสุดของงานในนั้น ใช้วาดไทม์ไลน์รวม */
  function projectDates(projectId) {
    var min = null, max = null;
    tasksInProject(projectId).forEach(function (x) {
      var t = x.task;
      var a = t.startOn || t.dueOn;
      var b = t.dueOn || t.startOn;
      if (!a) return;
      if (!min || a < min) min = a;
      if (!max || b > max) max = b;
    });
    var p = project(projectId);
    if (p && p.dueOn && (!max || p.dueOn > max)) max = p.dueOn;
    return min ? { from: min, to: max || min } : null;
  }

  /** ตัวเลขรวมของทั้งพอร์ตโฟลิโอ นับเฉพาะโปรเจกต์ที่คนดูมีสิทธิ์เห็น */
  function portfolioStats(portfolioId) {
    /* 4a — นับรวมโปรเจกต์ในพอร์ตโฟลิโอย่อยทุกชั้นด้วย (ไม่นับซ้ำ) */
    var list = allProjectsUnder(portfolioId);
    var s = {
      projects: list.length, hidden: hiddenUnder(portfolioId), children: (portfolio(portfolioId) || {}).portfolioIds ? portfolio(portfolioId).portfolioIds.length : 0,
      total: 0, done: 0, overdue: 0, dueWeek: 0,
      byStatus: {}, noStatus: 0, percent: 0, atRisk: 0
    };
    list.forEach(function (p) {
      var st = projectStats(p.id);
      s.total += st.total;
      s.done += st.done;
      s.overdue += st.overdue;
      s.dueWeek += st.dueWeek;
      var key = p.status ? p.status.state : null;
      if (key) s.byStatus[key] = (s.byStatus[key] || 0) + 1;
      else s.noStatus++;
      if (needsWatch(p, st)) s.atRisk++;          // Sprint 1C — นิยามเดียวกับรายการ "ต้องจับตา"
    });
    s.percent = s.total ? Math.round(s.done * 100 / s.total) : 0;
    return s;
  }

  /* Sprint 1C — "ต้องจับตา" มีนิยามเดียวทั้งแอป: สถานะเสี่ยง/ไม่ตามแผน หรือมีงานเลยกำหนด
   * เดิมตัวเลขบนแถบสรุปนับแค่สถานะ แต่รายการในแท็บสรุปผลนับงานเลยกำหนดด้วย
   * ผู้บริหารเห็น "ต้องจับตา 2" แล้วเลื่อนลงไปเจอ 3 โปรเจกต์ เลยไม่เชื่อตัวเลขไหนเลย */
  function needsWatch(p, st) {
    if (!p) return false;
    if (p.status && (p.status.state === 'at_risk' || p.status.state === 'off_track')) return true;
    return (st || projectStats(p.id)).overdue > 0;
  }

  /** เวลาที่รายงานสถานะล่าสุดจริง ๆ (ประวัติเก็บเวลาเต็ม สถานะรุ่นเก่าเก็บแค่วันที่) */
  function statusAt(p) {
    var log = (p && p.statusLog) || [];
    var last = log[log.length - 1];
    return (last && last.at) || (p && p.status && p.status.at) || null;
  }

  /** ตั้งสถานะของพอร์ตโฟลิโอ กติกาเดียวกับสถานะโปรเจกต์ */
  function setPortfolioStatus(id, state, text) {
    var f = portfolio(id);
    if (!f) return;
    snapshot('อัปเดตสถานะพอร์ตโฟลิโอ');
    var keep = text === null || text === undefined;
    f.status = {
      state: state,
      text: keep ? ((f.status && f.status.text) || '') : text,
      by: db.currentUserId, at: new Date().toISOString()   // Sprint 1C — เวลาจริง (เดิมแค่วันที่ → "5 ชม.ที่แล้ว")
    };
    f.statusLog = f.statusLog || [];
    var fsId = uid('ps');                                   // Sprint 2B — การแจ้งเตือนชี้กลับมาที่รายการนี้
    f.statusLog.push(stampStatus(f.statusLog, {          // Sprint 2C — ตัวเลข ณ ตอนนี้ + ที่เปลี่ยนจากรอบก่อน
      id: fsId, state: state, text: f.status.text,
      by: db.currentUserId, at: new Date().toISOString()
    }, statusSnapOf(id)));
    if (f.statusLog.length > 30) f.statusLog = f.statusLog.slice(-30);
    /* Sprint 2B — แจ้งคนที่ติดตามพอร์ตโฟลิโอ (เจ้าของติดตามเป็นค่าเริ่มต้น) ทั้งจากเมนูสถานะและแท็บความคืบหน้า
     * เดิมแจ้งเฉพาะเจ้าของ และเฉพาะตอนเขียนจากแท็บความคืบหน้า */
    var pw = pfWatchers(id);
    if (pw.length) {
      notifyOnly(null, pw, 'อัปเดตสถานะพอร์ตโฟลิโอ {p}', 'status', { p: f.name }, false,
        { route: 'portfolio:' + id + ':progress', ref: fsId });
    }
    commit();
  }

  /* ---------- projects ---------- */

  function createProject(attrs) {
    snapshot('สร้างโปรเจกต์');
    var p = createProjectRaw(attrs);
    audit("project.create", p.name);
    commit();
    return p;
  }

  /** สร้างโปรเจกต์โดยไม่ snapshot/commit/audit — ให้ผู้เรียกครอบเอง (แปลงงานเป็นโปรเจกต์) */
  function createProjectRaw(attrs) {
    var p = {
      id: uid('p'),
      name: attrs.name || 'โปรเจกต์ใหม่',
      color: attrs.color || PALETTE[db.projects.length % PALETTE.length],
      icon: attrs.icon || '📁',
      description: attrs.description || '',
      archived: false,
      defaultView: attrs.defaultView || 'list',
      sections: (attrs.sections || ['ค้างอยู่', 'กำลังทำ', 'เสร็จแล้ว'])
        .map(function (n) { return { id: uid('s'), name: n }; }),
      owner: attrs.owner || db.currentUserId,
      startOn: attrs.startOn || null,          // Sprint 1C — วันเริ่มโปรเจกต์
      dueOn: attrs.dueOn || null,
      depShift: { mode: 'consume', scope: 'downstream' },
      workDays: 'all',
      baseline: null,
      fields: [], status: null, automations: [], autoRuns: [], savedViews: [], colWidths: {},
      visibility: 'org', locked: false, views: null, statusLog: [], messages: [],
      defaultTab: null, roles: {}, accessRequests: [],
      forms: [], types: [], defaultType: '', taskTemplates: [],
      statusLayout: null, statusRemind: false, remindKey: null, remindTask: null,
      resources: [], brief: '', dash: null, msShow: 'open'
    };
    db.projects.push(p);
    return p;
  }

  function updateProject(id, patch) {
    var p = project(id);
    if (!p) return null;
    Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
    commit();
    return p;
  }

  /**
   * ตั้งสถานะโปรเจกต์
   *
   * เก็บย้อนหลังไว้ด้วย ไม่ใช่ทับของเดิมอย่างเดียว เพราะคำถามที่ผู้บริหารถามบ่อยที่สุด
   * ไม่ใช่ "ตอนนี้สีอะไร" แต่เป็น "มันเปลี่ยนเป็นสีแดงตั้งแต่เมื่อไร"
   * ถ้าทับทุกครั้งจะตอบไม่ได้เลย
   *
   * @param text  ส่ง null มาแปลว่าเปลี่ยนแค่สถานะ ให้เก็บข้อความเดิมไว้
   */
  function setProjectStatus(id, state, text) {
    var p = project(id);
    if (!p) return;
    /* สถานะที่ไม่รู้จักเคยถูกเก็บลงไปเงียบ ๆ แล้วหน้าจอตกไปแสดงสถานะแรกของรายการ
     * อ่านแล้วเหมือนโปรเจกต์ตามแผน ทั้งที่ค่าข้างในเป็นขยะ ปฏิเสธไปตรง ๆ ดีกว่า */
    if (!PROJECT_STATES.some(function (x) { return x.id === state; })) return;
    snapshot('อัปเดตสถานะโปรเจกต์');
    var keep = text === null || text === undefined;
    p.status = {
      state: state,
      text: keep ? ((p.status && p.status.text) || '') : text,
      by: db.currentUserId,
      at: new Date().toISOString()     // Sprint 1C — เวลาจริง เดิมเก็บแค่วันที่ พอร์ตโฟลิโอจึงขึ้น "5 ชม.ที่แล้ว" ทั้งที่เพิ่งรายงาน
    };
    p.statusLog = p.statusLog || [];
    var psId = uid('ps');                                   // Sprint 2B
    p.statusLog.push(stampStatus(p.statusLog, {          // Sprint 2C
      id: psId, state: state, text: p.status.text,
      by: db.currentUserId, at: new Date().toISOString()
    }, statusSnapOf(id)));
    if (p.statusLog.length > 30) p.statusLog = p.statusLog.slice(-30);
    var watchers = projectWatchers(id, 'status');
    if (watchers.length) {
      /* Sprint 2B — ref = รายการในประวัติสถานะ กล่องแจ้งเตือนโชว์สถานะกับบรรทัดแรกได้โดยไม่ต้องเปิดโปรเจกต์ */
      notifyOnly(null, watchers, 'อัปเดตสถานะของ {p}', 'status', { p: p.name }, false,
        { projectId: id, route: 'p-overview', ref: psId });
    }
    closeRemindTask(p);       // 3b — รายงานแล้ว งานเตือนวันศุกร์ปิดเอง
    commit();
  }

  /** ประวัติการรายงานสถานะ ใหม่สุดก่อน */
  function statusLog(projectId, limit) {
    var p = project(projectId);
    if (!p || !p.statusLog) return [];
    return p.statusLog.slice().reverse().slice(0, limit || 10);
  }

  function archiveProject(id, archived) {
    var p = project(id);
    if (!p) return;
    p.archived = !!archived;
    commit();
  }

  /** Sprint 1C — วันแรกสุดของโปรเจกต์: วันเริ่มโปรเจกต์ หรือวันเริ่ม/กำหนดส่งที่เร็วที่สุดของงานทุกชั้น
   *  ใช้เป็นจุดตั้งต้นตอนคัดลอกแล้วเลื่อนวัน (openOnly = ไม่นับงานที่เสร็จแล้ว) */
  function projectFirstDate(id, openOnly) {
    var p = project(id);
    if (!p) return null;
    var first = p.startOn || null;
    var look = function (t, g) {
      if (openOnly && t.completed) return;
      [t.startOn, t.dueOn].forEach(function (d) { if (d && (!first || d < first)) first = d; });
      if (g < 8) subtasks(t.id).forEach(function (s) { look(s, g + 1); });
    };
    tasksInProject(id).forEach(function (x) { look(x.task, 0); });
    return first;
  }

  /**
   * คัดลอกทั้งโปรเจกต์ (ใช้เป็นเทมเพลตได้)
   *
   * opts = true/false (รุ่นเก่า: เอางานไปด้วยไหม) หรือ { tasks, openOnly, name, shiftTo }
   *   tasks     เอางานไปด้วย
   *   openOnly  เฉพาะงานที่ยังไม่เสร็จ — คนจัดประชุมใช้ยกเรื่องค้างไปประชุมครั้งหน้า
   *   name      ชื่อโปรเจกต์ใหม่ (ไม่ใส่ = "<ชื่อเดิม> (สำเนา)")
   *   shiftTo   วันเริ่มใหม่ ISO — เลื่อนทุกวันในสำเนาเท่ากันหมด ให้วันแรกสุดของโปรเจกต์ตรงวันนี้
   *
   * Sprint 1C — รุ่นก่อนเอาไปแค่งานชั้นบนสุด งานย่อยหาย (0/3 กลายเป็น 0/0) ลำดับก่อนหลังถูกล้างทิ้ง
   * และคอลัมน์ที่เปิดไว้ (วันเริ่ม ความสำคัญ) กลับเป็นค่าเริ่มต้น คนเปิดสำเนาแล้วนึกว่าข้อมูลหาย
   * ตอนนี้งานย่อยไปครบทุกชั้น ลำดับก่อนหลังชี้ไปงานในสำเนา ค่าฟิลด์ วันเริ่ม/กำหนดส่ง
   * มุมมองที่บันทึกไว้ และมุมมองที่คนกดคัดลอกใช้อยู่ ไปด้วยทั้งหมด (รหัสคอลัมน์/ฟิลด์ชี้ไปของในสำเนา)
   */
  function duplicateProject(id, opts) {
    if (!opts || typeof opts !== 'object') opts = { tasks: !!opts };
    var src = project(id);
    if (!src) return null;
    snapshot('คัดลอกโปรเจกต์');
    var p = clone(src);
    p.id = uid('p');
    p.name = String(opts.name || '').trim().slice(0, 200) || (src.name + ' (สำเนา)');
    p.status = null;
    p.statusLog = [];              // ประวัติสถานะเป็นของโปรเจกต์เดิม สำเนาเริ่มนับใหม่
    p.archived = false;

    var sectionMap = {};
    p.sections.forEach(function (s) {
      var old = s.id;
      s.id = uid('s');
      sectionMap[old] = s.id;
    });
    var fieldMap = {}, fieldType = {};
    p.fields.forEach(function (f) {
      var old = f.id;
      /* ฟิลด์จากคลังใช้รหัสเดิม (ฟิลด์เดียวกันทั้งองค์กร) รหัสงานเริ่มนับใหม่ในโปรเจกต์สำเนา */
      if (!f.lib) f.id = uid('f');
      if (f.type === 'id') { f.next = 1; return; }
      fieldMap[old] = f.id;
      fieldType[f.id] = f.type;
    });
    p.roles = {};
    p.accessRequests = [];
    /* อัตโนมัติไปด้วย รหัสคอลัมน์และฟิลด์ในทริกเกอร์ เงื่อนไข และการกระทำชี้ไปของในสำเนา */
    var idMap = {};
    Object.keys(sectionMap).forEach(function (k) { idMap[k] = sectionMap[k]; });
    Object.keys(fieldMap).forEach(function (k) { idMap[k] = fieldMap[k]; });
    /* 3b — ชนิดงาน สถานะ ฟอร์ม และเทมเพลตงานได้รหัสใหม่ แล้วทุกที่ที่อ้างถึงชี้ไปของในสำเนา */
    renewStructIds(p, idMap);
    remapStruct(p, idMap);
    p.automations = (p.automations || []).map(function (a) { return remapAuto(a, idMap); });
    p.autoRuns = [];
    /* Sprint 1C — มุมมองที่บันทึกไว้เป็นแท็บไปด้วย (รหัสใหม่ ตัวกรอง/คอลัมน์ชี้ฟิลด์ในสำเนา) */
    p.defaultTab = null;
    p.savedViews = (src.savedViews || []).map(function (v) {
      var c = remapJson(v, idMap);
      c.id = uid('v');
      if (src.defaultTab === v.id) p.defaultTab = c.id;
      return c;
    });
    p.colWidths = remapJson(src.colWidths || {}, idMap);
    p.remindKey = null;
    p.remindTask = null;

    /* เลื่อนวัน: วันแรกสุดของโปรเจกต์เดิม (วันเริ่มโปรเจกต์ หรือวันแรกของงานทุกชิ้น) → วันเริ่มใหม่ */
    var srcTop = opts.tasks ? tasksInProject(id) : [];
    var keep = function (t) { return !(opts.openOnly && t.completed); };
    var delta = 0;
    if (opts.shiftTo && ISO_RE.test(opts.shiftTo)) {
      var first = projectFirstDate(id, false);
      delta = first ? daysBetween(first, opts.shiftTo) : 0;
      p.startOn = opts.shiftTo;
    }
    var mv = function (d) { return d && delta ? addDays(d, delta) : d; };
    if (delta) p.dueOn = mv(p.dueOn);
    if (!('startOn' in p)) p.startOn = null;

    db.projects.push(p);
    dropIndex();
    audit("project.duplicate", p.name, "คัดลอกจากโปรเจกต์เดิม");

    var taskMap = {}, pairs = [];
    var copyTask = function (t, parentNew, g) {
      if (!keep(t)) return;
      var copy = blankTask(clone(t));
      copy.id = uid('t');
      taskMap[t.id] = copy.id;
      copy.parentId = parentNew || null;
      copy.completed = false;
      copy.completedAt = null;
      copy.completedBy = null;
      /* งานขออนุมัติ ผลอนุมัติเป็นตัวเปิด/ปิดงาน (Sprint 1B) — สำเนาเริ่มใหม่ยังไม่เสร็จ ต้องกลับไปรออนุมัติด้วย
       * เดิมคงผลเดิมไว้ สำเนาจึงโชว์ ✕ "ไม่อนุมัติ" / ✓ "อนุมัติแล้ว" บนงานที่ยังไม่เสร็จ */
      if (copy.type === 'approval') copy.approval = 'pending';
      copy.likes = [];
      copy.dependsOn = [];
      copy.startOn = mv(copy.startOn);
      copy.dueOn = mv(copy.dueOn);
      copy.createdBy = db.currentUserId;
      copy.createdAt = today();
      if (copy.ctype && idMap[copy.ctype]) {
        var cty = typeDef(idMap[copy.ctype]);
        var cst = cty && cty.statuses.filter(function (s) { return s.id === idMap[t.cstatus]; })[0];
        copy.ctype = cty ? cty.id : null;
        copy.cstatus = cst && !cst.done ? cst.id : ((cty && firstStatus(cty, false)) || {}).id || null;
      }
      db.tasks.push(copy);
      pairs.push([t, copy]);
      db.fieldValues.filter(function (v) { return v.taskId === t.id; })
        .forEach(function (v) {
          if (!fieldMap[v.fieldId]) return;
          var nf = fieldMap[v.fieldId];
          var val = fieldType[nf] === 'date' && typeof v.value === 'string' && ISO_RE.test(v.value) ? mv(v.value) : clone(v.value);
          db.fieldValues.push({ taskId: copy.id, fieldId: nf, value: val });
        });
      if (g < 8) subtasks(t.id).forEach(function (s) { copyTask(s, copy.id, g + 1); });
      return copy;
    };
    srcTop.forEach(function (x) {
      var copy = copyTask(x.task, null, 0);
      if (!copy) return;
      db.memberships.push({
        id: uid('m'), taskId: copy.id, projectId: p.id,
        sectionId: sectionMap[x.membership.sectionId] || p.sections[0].id,
        position: x.membership.position
      });
    });
    /* ลำดับก่อนหลังชี้ไปงานในสำเนา — งานต้นทางที่ไม่ได้มาด้วย (นอกโปรเจกต์ หรือเสร็จแล้วตอนเลือกเฉพาะที่ค้าง) ตัดทิ้ง */
    pairs.forEach(function (pr) {
      pr[1].dependsOn = normalizeDeps(pr[0].dependsOn).filter(function (d) { return taskMap[d.id]; })
        .map(function (d) { var c = clone(d); c.id = taskMap[d.id]; return c; });
    });

    /* คอลัมน์และมุมมองที่คนกดคัดลอกใช้อยู่ — เปิดสำเนาแล้วหน้าตาเหมือนต้นฉบับ */
    var st = personalOf();
    if (st && st.pv && st.pv[id]) st.pv[p.id] = remapJson(st.pv[id], idMap);
    dropIndex();
    commit();
    return p;
  }

  function deleteProject(id) {
    var _dp = project(id);
    if (!_dp) return;
    snapshot('ลบโปรเจกต์');
    audit("project.delete", _dp.name, "ย้ายไปถังขยะ พร้อมงานที่อยู่เฉพาะโปรเจกต์นี้");
    /* งานที่อยู่โปรเจกต์นี้ที่เดียวไปถังขยะพร้อมโปรเจกต์ ส่วนงานที่อยู่หลายโปรเจกต์
     * แค่หลุดออกจากโปรเจกต์นี้ แล้วกลับเข้ามาเองตอนกู้คืน */
    var ms = db.memberships.filter(function (m) { return m.projectId === id; });
    var onlyHere = ms.filter(function (m) {
      return !db.memberships.some(function (x) { return x.taskId === m.taskId && x.projectId !== id; });
    }).map(function (m) { return m.taskId; });
    var bundle = cutTasks(onlyHere);
    var shared = clone(db.memberships.filter(function (m) { return m.projectId === id; }));
    var inPf = (db.portfolios || []).filter(function (f) {
      return f.projectIds.indexOf(id) >= 0;
    }).map(function (f) { return f.id; });
    trashPush('project', _dp.name, id, {
      project: clone(_dp), bundle: bundle, memberships: shared, portfolios: inPf
    });
    db.memberships = db.memberships.filter(function (m) { return m.projectId !== id; });
    db.projects = db.projects.filter(function (p) { return p.id !== id; });
    /* ถอดออกจากพอร์ตโฟลิโอด้วย ไม่งั้นรหัสของโปรเจกต์ที่ลบไปแล้วจะค้างอยู่ตลอดไป
     * ตอนนี้ยังไม่เห็นผลเพราะการวาดกรองตัวที่หาไม่เจอออก
     * แต่ข้อมูลที่ชี้ไปหาของที่ไม่มีอยู่จริงคือระเบิดเวลาของบั๊กที่หาสาเหตุยาก */
    (db.portfolios || []).forEach(function (f) {
      f.projectIds = f.projectIds.filter(function (pid) { return pid !== id; });
    });
    commit();
  }

  function addSection(projectId, name) {
    var p = project(projectId);
    if (!p) return null;
    snapshot('เพิ่มเซกชัน');           // 2c — เดิมเพิ่มแล้วย้อนกลับไม่ได้
    var s = { id: uid('s'), name: name || 'คอลัมน์ใหม่' };
    p.sections.push(s);
    commit();
    return s;
  }

  function renameSection(projectId, sectionId, name) {
    var s = section(projectId, sectionId);
    if (s && s.name !== name) { snapshot('เปลี่ยนชื่อเซกชัน'); s.name = name; commit(); }
  }

  function deleteSection(projectId, sectionId) {
    var p = project(projectId);
    if (p.sections.length <= 1) return false;
    snapshot('ลบคอลัมน์');
    var fallback = p.sections.filter(function (s) { return s.id !== sectionId; })[0];
    db.memberships.forEach(function (m) {
      if (m.projectId === projectId && m.sectionId === sectionId) {
        m.sectionId = fallback.id;
      }
    });
    p.sections = p.sections.filter(function (s) { return s.id !== sectionId; });
    commit();
    return true;
  }

  function moveSection(projectId, sectionId, delta) {
    var p = project(projectId);
    var i = -1;
    p.sections.forEach(function (s, idx) { if (s.id === sectionId) i = idx; });
    var j = i + delta;
    if (i < 0 || j < 0 || j >= p.sections.length) return;
    var tmp = p.sections[i];
    p.sections[i] = p.sections[j];
    p.sections[j] = tmp;
    commit();
  }


  /* ---------- 2b — ทำสำเนาคอลัมน์ รูปปก และเพิ่มงานต่อจากแถว ---------- */

  var SEC_DUP_KEYS = ['assignee', 'dates', 'notes', 'subtasks', 'tags', 'followers', 'attachments', 'fields'];

  /** ทำสำเนาคอลัมน์พร้อมงานข้างใน ลงโปรเจกต์เดิมหรือโปรเจกต์อื่น
   *  o = { toProject, name, keep: { assignee, dates, notes, subtasks, tags, followers, attachments, fields } }
   *  ค่าฟิลด์ที่สร้างเองคัดลอกได้เฉพาะในโปรเจกต์เดิม (ฟิลด์เป็นของแต่ละโปรเจกต์)
   *  คืน { projectId, sectionId, n } หรือ null */
  function duplicateSection(projectId, sectionId, o) {
    o = o || {};
    var src = section(projectId, sectionId);
    var toPid = o.toProject && project(o.toProject) ? o.toProject : projectId;
    var dest = project(toPid);
    if (!src || !dest) return null;
    if (!canCreateTask(toPid) || !canInProject(projectId, 'edit')) return denied('create');   // Sprint 1B
    var keep = {};
    SEC_DUP_KEYS.forEach(function (k) { keep[k] = !o.keep || !(k in o.keep) ? true : !!o.keep[k]; });
    if (toPid !== projectId) keep.fields = false;
    var opt = { assignee: keep.assignee, notes: keep.notes, subtasks: keep.subtasks,
      attachments: keep.attachments, tags: keep.tags, followers: keep.followers,
      projects: false, deps: false, dates: keep.dates, fields: keep.fields };
    var name = String(o.name || '').trim().slice(0, 120) || (src.name + ' ' + L('(สำเนา)'));
    var roots = tasksInSection(projectId, sectionId).map(function (x) { return x.task; });
    snapshot('ทำสำเนาเซกชัน “{s}”', { s: src.name });
    var ns = { id: uid('s'), name: name };
    /* ในโปรเจกต์เดิมวางต่อจากคอลัมน์ต้นฉบับ โปรเจกต์อื่นวางท้ายสุด */
    var at = toPid === projectId ? dest.sections.indexOf(src) + 1 : dest.sections.length;
    dest.sections.splice(at, 0, ns);
    var pos = 1;
    roots.forEach(function (t) {
      var c = copyTaskTree(t, opt, null, 0);
      c.name = t.name;
      if (!keep.assignee) { c.assigneeId = null; c.assignedAt = null; c.assignedBy = null; }
      db.memberships.push({ id: uid('m'), taskId: c.id, projectId: toPid, sectionId: ns.id, position: pos++ });
      log(c.id, 'คัดลอกมาจาก “{t}”', { t: t.name });
      notifyNewTask(c, toPid);     // 3b — สำเนาในคอลัมน์ใหม่ = งานเข้าโปรเจกต์
    });
    audit('section.duplicate', dest.name, '{s} → {d}', { s: src.name, d: name });
    commit();
    return { projectId: toPid, sectionId: ns.id, n: roots.length };
  }

  function isImageAtt(a) {
    if (!a) return false;
    if (a.mime && /^image\//.test(a.mime)) return true;
    return /^data:image\//.test(a.url || '') || /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(a.url || a.name || '');
  }

  /** ตั้งรูปปกของการ์ดจากไฟล์แนบที่เป็นรูป  attId = null คือเอารูปปกออก */
  function setCover(taskId, attId) {
    var t = task(taskId);
    if (!t) return false;
    if (attId && !isImageAtt((t.attachments || []).filter(function (a) { return a.id === attId; })[0])) return false;
    if ((t.coverId || null) === (attId || null)) return false;
    snapshot(attId ? 'ตั้งรูปปก' : 'เอารูปปกออก');
    t.coverId = attId || null;
    log(taskId, attId ? 'ตั้งรูปปกของการ์ด' : 'เอารูปปกของการ์ดออก');
    commit();
    return true;
  }

  function coverOf(t) {
    if (!t || !t.coverId) return null;
    var a = (t.attachments || []).filter(function (x) { return x.id === t.coverId; })[0];
    return a && isImageAtt(a) && a.url ? a : null;
  }

  /** เพิ่มงานใหม่เหนือหรือใต้งานที่ระบุ ในคอลัมน์เดียวกัน (Enter / Shift+Enter ในรายการ) */
  function createTaskNear(attrs, projectId, refId, above) {
    var m = db.memberships.filter(function (x) { return x.taskId === refId && x.projectId === projectId; })[0];
    var p = project(projectId);
    if (!p) return null;
    if (!canCreateTask(projectId, attrs && attrs.parentId)) return denied('create');   // Sprint 1B — Enter / Shift+Enter
    var secId = m ? m.sectionId : p.sections[0].id;
    var list = tasksInSection(projectId, secId);
    var i = -1;
    list.forEach(function (x, k) { if (x.task.id === refId) i = k; });
    var pos;
    if (i < 0) pos = list.length ? list[list.length - 1].membership.position + 1 : 1;
    else if (above) pos = i === 0 ? list[0].membership.position - 1 : (list[i - 1].membership.position + list[i].membership.position) / 2;
    else pos = i === list.length - 1 ? list[i].membership.position + 1 : (list[i].membership.position + list[i + 1].membership.position) / 2;
    snapshot('สร้างงาน');
    var t = createTaskRaw(attrs, projectId, secId);
    var nm = db.memberships.filter(function (x) { return x.taskId === t.id && x.projectId === projectId; })[0];
    if (nm) nm.position = pos;
    commit();
    return t;
  }

  /** ความกว้างคอลัมน์ที่ผู้ใช้ลากไว้ จำแยกตามโปรเจกต์ */
  function colWidth(projectId, key, fallback) {
    var p = project(projectId);
    if (!p || !p.colWidths) return fallback;
    return p.colWidths[key] || fallback;
  }

  function setColWidth(projectId, key, px) {
    var p = project(projectId);
    if (!p) return;
    p.colWidths = p.colWidths || {};
    p.colWidths[key] = Math.round(px);
    commit();
  }

  function resetColWidths(projectId) {
    var p = project(projectId);
    if (!p) return;
    p.colWidths = {};
    commit();
  }

  function addField(projectId, field) {
    var p = project(projectId);
    if (!p) return null;
    snapshot('เพิ่มฟิลด์');
    var nf = normalizeFieldDef({
      id: uid('f'), name: String(field.name || 'ฟิลด์ใหม่').slice(0, 80),
      type: field.type || 'text', options: field.options, desc: field.desc || '',
      notify: !!field.notify, prefix: field.prefix
    });
    if (nf.type === 'number') nf.format = normalizeFormat(field.format);
    if (nf.type === 'formula') { nf.expr = String(field.expr || ''); nf.out = field.out === 'date' ? 'date' : 'number'; nf.format = normalizeFormat(field.format); }
    if (nf.type === 'ref') nf.kinds = (field.kinds || ['task', 'project', 'portfolio', 'goal']).filter(function (k) { return ['task', 'project', 'portfolio', 'goal'].indexOf(k) >= 0; });
    p.fields.push(nf);
    commit();
    return nf;
  }

  function renameField(projectId, fieldId, name) {
    var p = project(projectId);
    var f = p.fields.filter(function (x) { return x.id === fieldId; })[0];
    if (f && name) updateFieldDef(projectId, fieldId, { name: name });
  }

  /** ลบฟิลด์ — ตัวฟิลด์กับค่าที่กรอกไว้ทั้งหมดไปพักในถังขยะ
   *  ฟิลด์จากคลัง (หรือรหัสที่ยังใช้อยู่ในโปรเจกต์อื่น) = เอาออกจากโปรเจกต์นี้เท่านั้น
   *  ค่าของงานที่ยังอยู่ในโปรเจกต์อื่นที่ใช้ฟิลด์เดียวกันไม่ถูกลบ */
  function deleteField(projectId, fieldId) {
    var p = project(projectId);
    if (!p) return;
    var at = -1;
    p.fields.forEach(function (f, i) { if (f.id === fieldId) at = i; });
    if (at < 0) return;
    snapshot('ลบฟิลด์');
    var f = p.fields[at];
    var keepTask = {};
    db.projects.forEach(function (op) {
      if (op.id === projectId || !(op.fields || []).some(function (x) { return x.id === fieldId; })) return;
      db.memberships.forEach(function (m) { if (m.projectId === op.id) keepTask[m.taskId] = true; });
    });
    var goes = function (v) {
      if (v.fieldId !== fieldId) return false;
      var t = task(v.taskId);
      return !keepTask[(t ? rootOf(t) : { id: v.taskId }).id];
    };
    trashPush('field', f.name, projectId, {
      field: clone(f), index: at,
      values: clone(db.fieldValues.filter(goes))
    });
    p.fields = p.fields.filter(function (x) { return x.id !== fieldId; });
    db.fieldValues = db.fieldValues.filter(function (v) { return !goes(v); });
    commit();
  }

  /** รูปแบบการแสดงของฟิลด์ตัวเลข — ค่าที่กรอกไว้ไม่เปลี่ยน เปลี่ยนแค่หน้าตา */
  function setFieldFormat(projectId, fieldId, format) {
    var p = project(projectId);
    var f = p && p.fields.filter(function (x) { return x.id === fieldId; })[0];
    if (!f || f.type !== 'number') return false;
    snapshot('ตั้งรูปแบบตัวเลข');
    f.format = normalizeFormat(format);
    propagateField(f);
    commit();
    return true;
  }

  function normalizeFormat(fm) {
    if (!fm || !fm.kind || NUMBER_FORMATS.every(function (x) { return x.id !== fm.kind; })) return null;
    var dec = fm.decimals === '' || fm.decimals == null ? null
      : Math.max(0, Math.min(4, parseInt(fm.decimals, 10) || 0));
    if (fm.kind === 'number' && dec == null) return null;     // ตัวเลขธรรมดา ไม่ต้องเก็บอะไร
    return {
      kind: fm.kind,
      currency: fm.kind === 'currency' ? (CURRENCIES.indexOf(fm.currency) >= 0 ? fm.currency : 'THB') : null,
      unit: fm.kind === 'unit' ? String(fm.unit || '').trim().slice(0, 12) : '',
      decimals: dec
    };
  }

  /**
   * ตัวเลขของฟิลด์ในรูปแบบที่ตั้งไว้ ใช้ทั้งตาราง แผงงาน และไฟล์ CSV
   * ใช้ toLocaleString ของเบราว์เซอร์ จึงได้คั่นหลักพันและสัญลักษณ์เงินตามภาษาที่เลือก
   */
  function formatNumber(f, v) {
    if (v === null || v === undefined || v === '' || isNaN(Number(v))) return '';
    var n = Number(v), fm = (f && f.format) || {};
    var loc = global.I18N.getLang() === 'en' ? 'en-US' : 'th-TH';
    var dec = fm.decimals == null ? null : fm.decimals;
    var o = dec == null ? { maximumFractionDigits: 4 }
                        : { minimumFractionDigits: dec, maximumFractionDigits: dec };
    try {
      if (fm.kind === 'currency') {
        var co = { style: 'currency', currency: fm.currency || 'THB' };
        if (dec != null) { co.minimumFractionDigits = dec; co.maximumFractionDigits = dec; }
        return n.toLocaleString(loc, co);
      }
      var s = n.toLocaleString(loc, o);
      if (fm.kind === 'percent') return s + '%';
      if (fm.kind === 'unit' && fm.unit) return s + ' ' + fm.unit;
      return s;
    } catch (e) {
      return String(n);
    }
  }

  /* ---------- saved views ---------- */

  function saveView(projectId, name, view, icon, kind) {
    var p = project(projectId);
    var nm = String(name || '').trim().slice(0, 60);
    if (!p || !nm) return null;
    var k = SV_KINDS.indexOf(kind) >= 0 ? kind : 'list';
    /* ชื่อซ้ำ (ชนิดเดียวกัน) ให้ทับของเดิม ไม่งั้นกดบันทึกสองครั้งจะได้มุมมองชื่อเดียวกันสองอัน
     * แล้วผู้ใช้จะแยกไม่ออกว่าอันไหนใหม่ */
    var old = p.savedViews.filter(function (v) { return v.name === nm && (v.kind || 'list') === k; })[0];
    if (!old && p.savedViews.length >= SV_MAX) return null;
    snapshot('บันทึกมุมมอง “{n}”', { n: nm });
    if (old) {
      old.view = viewDiff(clone(view));
      if (icon) old.icon = icon;
    } else {
      old = { id: uid('v'), name: nm, icon: icon || '📊', kind: k, view: viewDiff(clone(view)) };
      p.savedViews.push(old);
    }
    audit('project.view', p.name, nm);
    commit();
    return old;
  }

  function deleteSavedView(projectId, viewId) {
    var p = project(projectId);
    if (!p || !savedView(projectId, viewId)) return false;
    snapshot('ลบแท็บมุมมอง');
    p.savedViews = p.savedViews.filter(function (v) { return v.id !== viewId; });
    if (p.defaultTab === viewId) p.defaultTab = null;
    commit();
    return true;
  }

  /* ---------- reporting ---------- */

  function projectStats(projectId) {
    var items = tasksInProject(projectId);
    var td = today();
    var total = items.length;
    var done = 0, overdue = 0, blocked = 0, dueWeek = 0;
    var byAssignee = {}, byPriority = {}, bySection = {};

    items.forEach(function (x) {
      var t = x.task;
      if (t.completed) done++;
      else {
        if (t.dueOn && t.dueOn < td) overdue++;
        if (t.dueOn && t.dueOn >= td && t.dueOn <= addDays(td, 7)) dueWeek++;
        if (isBlocked(t.id)) blocked++;
      }
      var a = t.assigneeId || '';
      byAssignee[a] = byAssignee[a] || { total: 0, done: 0 };
      byAssignee[a].total++;
      if (t.completed) byAssignee[a].done++;

      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
      bySection[x.membership.sectionId] = (bySection[x.membership.sectionId] || 0) + 1;
    });

    return {
      total: total, done: done, open: total - done,
      overdue: overdue, blocked: blocked, dueWeek: dueWeek,
      percent: total ? Math.round(done * 100 / total) : 0,
      byAssignee: byAssignee, byPriority: byPriority, bySection: bySection
    };
  }

  /* ---------- users / settings ---------- */

  /** เพิ่มรายชื่อไว้ล่วงหน้า เพื่อมอบหมายงานได้ก่อนเจ้าตัวล็อกอินครั้งแรก
   *
   *  ถ้าส่ง id มาด้วย (ได้จากสมุดรายชื่อ Microsoft) รายการนี้จะเชื่อมกับ
   *  ตอนเจ้าตัวล็อกอินจริงโดยอัตโนมัติ ไม่เกิดรายการซ้ำ
   *  หมายเหตุ: การเพิ่มที่นี่ไม่ได้ให้สิทธิ์เข้าถึงข้อมูล ต้องเพิ่มเข้าไซต์ SharePoint ด้วย */
  /* Sprint 1B — อีเมลคือตัวที่ใช้จับคู่ตอนเจ้าตัวล็อกอินจริง ซ้ำกันเมื่อไหร่จะได้สองรายการของคนเดียว
   * งานกระจายไปคนละรายการ และไม่รู้ว่ารายการไหนคือตัวจริง จึงต้องไม่ซ้ำ (ไม่สนตัวพิมพ์เล็กใหญ่) */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  /** ปัญหาของอีเมลนี้ คืน null ถ้าใช้ได้ หรือ { key, params } ให้หน้าจอแปลเอง (ว่าง = ไม่บังคับ) */
  function emailProblem(email, exceptId) {
    var e = String(email || '').trim().toLowerCase();
    if (!e) return null;
    if (!EMAIL_RE.test(e)) return { key: 'รูปแบบอีเมลไม่ถูกต้อง', params: null };
    var dup = db.users.filter(function (u) {
      return u.id !== exceptId && String(u.email || '').trim().toLowerCase() === e;
    })[0];
    return dup ? { key: 'อีเมลนี้มีอยู่แล้วในรายชื่อ ({name})', params: { name: dup.name } } : null;
  }

  function addUser(attrs) {
    var id = attrs.id || uid('u');
    var existing = user(id);
    if (existing) return existing;          // เลือกคนเดิมซ้ำ ไม่ต้องเพิ่มอีก
    if (emailProblem(attrs.email, id)) return null;   // Sprint 1B — ด่านสุดท้าย หน้าจอเตือนก่อนแล้ว
    attrs.email = String(attrs.email || '').trim();
    var u = {
      id: id, name: attrs.name, email: attrs.email || '',
      color: PALETTE[db.users.length % PALETTE.length],
      role: ROLE_CAPS[attrs.role] ? attrs.role : 'member',
      lastSeenAt: null
    };
    snapshot('เพิ่มสมาชิก');
    db.users.push(u);
    audit("user.add", u.name, '{email} · บทบาท {role}', { email: u.email, role: u.role });
    commit();
    return u;
  }

  function removeUser(id) {
    if (id === db.currentUserId) return false;
    var u = user(id);
    if (!u) return false;
    if (u.role === 'admin' && adminCount() <= 1) return false;   // ต้องเหลือผู้ดูแลไว้เสมอ
    snapshot('ลบสมาชิก');
    db.tasks.forEach(function (t) {
      if (t.assigneeId === id) t.assigneeId = null;
      t.followers = t.followers.filter(function (f) { return f !== id; });
      t.likes = t.likes.filter(function (f) { return f !== id; });
    });
    db.notifications = db.notifications.filter(function (n) { return n.userId !== id; });
    if (db.personal) delete db.personal[id];
    db.users = db.users.filter(function (x) { return x.id !== id; });
    audit("user.remove", u.name, u.email);
    commit();
    return true;
  }

  function setCurrentUser(id) { db.currentUserId = id; commit(); }

  /** รับตัวตนจากบัญชีบริษัท เพิ่มถ้ายังไม่มี แล้วตั้งเป็นผู้ใช้ปัจจุบัน */
  function adoptIdentity(p) {
    if (!p || !p.id) return null;
    var u = user(p.id);
    if (!u) {
      u = { id: p.id, name: p.name || p.email, email: p.email || '',
            color: PALETTE[db.users.length % PALETTE.length], role: null, lastSeenAt: null };
      db.users.push(u);
    } else {
      if (p.name) u.name = p.name;
      if (p.email) u.email = p.email;
    }
    if (!u.role) {
      /* คนแรกที่ล็อกอินจริงได้เป็นผู้ดูแล ตรงกับขั้นตอนที่ให้ฝ่าย IT เข้าก่อน
       * นับเฉพาะคนที่เคยล็อกอิน (มี lastSeenAt) ผู้ใช้ตัวอย่างไม่นับ */
      var hasRealAdmin = db.users.some(function (x) {
        return x.id !== u.id && x.role === 'admin' && x.lastSeenAt;
      });
      u.role = hasRealAdmin ? 'member' : 'admin';
    }
    var _first = !u.lastSeenAt;
    u.lastSeenAt = new Date().toISOString();
    db.currentUserId = u.id;
    u.authBy = "microsoft";
    /* ผู้ทำกับเป้าหมายเป็นคนเดียวกัน จึงไม่ต้องใส่ชื่อซ้ำ */
    audit(_first ? "auth.first-login" : "auth.login", null, u.email);
    commit();
    return u;
  }


  /* ---------- สิทธิ์รายโปรเจกต์ ----------
   *
   * เจตนาเดียวกับที่ Asana ทำ คือแยกสองชั้น
   *   บทบาทระดับองค์กร  คุมว่าเข้าหน้าผู้ดูแลได้ไหม สร้างโปรเจกต์ได้ไหม
   *   สิทธิ์รายโปรเจกต์  คุมว่าเห็นโปรเจกต์ไหน และทำอะไรกับมันได้
   *
   * visibility = org      พนักงานทุกคนเห็น (ค่าเริ่มต้น)
   *            = private  เห็นเฉพาะคนที่อยู่ในรายชื่อสมาชิกโปรเจกต์
   * locked = true         สมาชิกเชิญคนเพิ่มเองไม่ได้ ต้องให้ผู้ดูแลระบบทำ
   *
   * ย้ำอีกครั้ง: ในเวอร์ชันที่ทำงานในเบราว์เซอร์ นี่คือการจัดระเบียบหน้าจอ
   * ไม่ใช่การบังคับสิทธิ์จริง ของจริงจะบังคับที่ API เมื่อย้ายไปฐานข้อมูลแล้ว
   */
  var PROJECT_ACCESS = [
    { id: 'admin',   label: 'ผู้ดูแลโปรเจกต์', /* ลบโปรเจกต์เป็นสิทธิ์ 'manage' ของผู้ดูแลระบบเท่านั้น (NEEDS ใน main.js) ผู้ดูแลโปรเจกต์ลบไม่ได้ คำอธิบายต้องไม่สัญญาเกินจริง */
      desc: 'จัดการสมาชิกและสิทธิ์ในโปรเจกต์ได้ (การลบโปรเจกต์เป็นของผู้ดูแลระบบ)' },
    { id: 'edit',    label: 'แก้ไขได้',        desc: 'สร้างและแก้งาน จัดโครงสร้างโปรเจกต์ได้' },
    { id: 'comment', label: 'แสดงความเห็นได้', desc: 'ดูและคอมเมนต์ได้ แต่แก้งานไม่ได้' },
    { id: 'view',    label: 'ดูอย่างเดียว',    desc: 'เปิดดูได้ แก้และคอมเมนต์ไม่ได้' }
  ];
  var ACCESS_RANK = { view: 1, comment: 2, edit: 3, admin: 4 };

  function projectMembers(projectId) {
    return (db.projectMembers || []).filter(function (m) { return m.projectId === projectId; });
  }

  /** สิทธิ์ของคนหนึ่งในโปรเจกต์หนึ่ง คืน null ถ้าไม่มีสิทธิ์เห็นเลย */
  function projectAccess(projectId, userId) {
    var uid = userId || db.currentUserId;
    /* จำคำตอบไว้ในดัชนี ฟังก์ชันนี้ถูกเรียกหนึ่งครั้งต่อหนึ่งงานเวลากรองสิทธิ์
     * ทั้งที่คำตอบขึ้นกับแค่คู่ (คน, โปรเจกต์) ซึ่งมีไม่กี่ร้อยคู่ */
    var i = index();
    var key = uid + '|' + projectId;
    if (key in i.access) return i.access[key];
    var v = computeAccess(projectId, uid, i);
    i.access[key] = v;
    return v;
  }

  function computeAccess(projectId, uid, i) {
    var u = i.user[uid];
    if (!u || u.active === false) return null;

    var p = i.project[projectId];
    if (!p) return null;

    if (u.role === 'admin') return 'admin';        // ผู้ดูแลระบบเห็นทุกโปรเจกต์

    var byProj = i.pmByProject[projectId];
    var m = byProj && byProj[uid];
    /* 4a — โปรเจกต์ที่แชร์ให้ทีม: สมาชิกทีมได้สิทธิ์ตามที่ตั้งไว้ บวกเพิ่มจากสิทธิ์เดิม (เอาระดับสูงสุด แบบ Asana) */
    var ta = null;
    (p.teams || []).forEach(function (s) {
      var tm = i.teamMem[s.id];
      if (tm && tm[uid] && (!ta || (ACCESS_RANK[s.access] || 0) > (ACCESS_RANK[ta] || 0))) ta = s.access;
    });

    /* ด่านแรก เห็นโปรเจกต์นี้ไหม
     * โปรเจกต์ปิดต้องเป็นสมาชิกเท่านั้น ส่วนบุคคลภายนอกต้องถูกเชิญเป็นรายโปรเจกต์เสมอ
     * แม้เป็นโปรเจกต์ที่เปิดให้ทั้งองค์กรก็ยังไม่เห็น (ถูกเชิญเข้าทีมที่ได้รับแชร์ = ถูกเชิญ) */
    if (!m && !ta && (p.visibility === 'private' || u.role === 'guest')) return null;

    /* ด่านสอง เห็นแล้วทำอะไรได้
     * "ดูอย่างเดียว" เป็นเพดาน ไม่ใช่ค่าเริ่มต้น ถูกเชิญมาด้วยสิทธิ์ edit ก็ยังแก้ไม่ได้
     * ตรงกับ ROLE_CAPS ที่ can() ใช้ และกับ fn_VisibleProjects ฝั่งฐานข้อมูล */
    if (u.role === 'viewer') return 'view';

    var best = m ? m.access : ((p.visibility === 'private' || u.role === 'guest') ? null : 'edit');
    if (ta && (!best || (ACCESS_RANK[ta] || 0) > (ACCESS_RANK[best] || 0))) best = ta;
    return best;
  }

  /** โปรเจกต์ที่คนนี้เห็นได้ ใช้แทน activeProjects ทุกที่ที่แสดงรายการ */
  function visibleProjects(userId) {
    return db.projects.filter(function (p) {
      return !p.archived && projectAccess(p.id, userId);
    });
  }

  /** มีสิทธิ์ระดับที่ต้องการในโปรเจกต์นี้ไหม */
  function canInProject(projectId, needed) {
    /* 4a — ประกาศของพอร์ตโฟลิโอ/ทีมใช้ตัววาดเดียวกับโปรเจกต์ จึงตอบสิทธิ์ของ "เจ้าของประกาศ" ตรงนี้ */
    if (/^(pf|tm)_/.test(String(projectId || ''))) return hostCan(projectId, needed);
    var a = projectAccess(projectId);
    if (!a) return false;
    return (ACCESS_RANK[a] || 0) >= (ACCESS_RANK[needed] || 0);
  }

  function setProjectVisibility(projectId, visibility) {
    var p = project(projectId);
    /* ด่านเดียวกับปุ่มในหน้าต่างสมาชิก (ผู้ดูแลระบบ/ผู้ดูแลโปรเจกต์) — เปิดโปรเจกต์ปิดให้ทั้งองค์กร
     * ก็คือการให้ทุกคนเห็น จึงต้องผ่านด่านเดียวกับการเพิ่มสมาชิก */
    if (!p || !canAddMembers(projectId)) return false;
    snapshot('เปลี่ยนความเป็นส่วนตัว');
    p.visibility = visibility === 'private' ? 'private' : 'org';
    /* ปิดโปรเจกต์แล้วต้องมีสมาชิกอย่างน้อยหนึ่งคน ไม่งั้นจะไม่มีใครเข้าได้อีก */
    if (p.visibility === 'private' && !projectMembers(projectId).length) {
      setProjectMember(projectId, db.currentUserId, 'admin', true);
    }
    audit('project.visibility', p.name,
      p.visibility === 'private' ? 'เปลี่ยนเป็นโปรเจกต์ปิด' : 'เปลี่ยนเป็นเปิดให้ทั้งองค์กร');
    commit();
    return true;
  }

  function setProjectLocked(projectId, locked) {
    var p = project(projectId);
    if (!p) return false;
    snapshot(locked ? 'ล็อกโปรเจกต์' : 'ปลดล็อกโปรเจกต์');
    p.locked = !!locked;
    audit(locked ? 'project.lock' : 'project.unlock', p.name);
    commit();
    return true;
  }

  function setProjectMember(projectId, userId, access, quiet) {
    if (!ACCESS_RANK[access]) return false;
    /* quiet = ทางภายในที่ตรวจสิทธิ์ของตัวเองมาแล้ว (ตอบคำขอ ถามก่อนมอบงาน โอนงาน สร้างโปรเจกต์)
     * ทางจากหน้าต่างสมาชิกต้องผ่านด่าน canAddMembers ที่ชั้นข้อมูลด้วย ไม่พึ่งปุ่มบนจออย่างเดียว */
    if (!quiet && !canAddMembers(projectId)) return false;
    db.projectMembers = db.projectMembers || [];
    var m = db.projectMembers.filter(function (x) {
      return x.projectId === projectId && x.userId === userId;
    })[0];
    var p = project(projectId), u = user(userId);
    if (!quiet) snapshot('ตั้งสิทธิ์ในโปรเจกต์');
    if (m) {
      m.access = access;
    } else {
      db.projectMembers.push({ projectId: projectId, userId: userId, access: access });
    }
    if (!quiet) {
      audit('project.member', (p ? p.name : projectId),
        (u ? u.name : userId) + ' → ' + access);
      commit();
    }
    return true;
  }

  /** ถอดคนออกจากโปรเจกต์ — ห้ามเหลือศูนย์ผู้ดูแลโปรเจกต์ในโปรเจกต์ปิด */
  function removeProjectMember(projectId, userId) {
    var p = project(projectId);
    var list = projectMembers(projectId);
    var target = list.filter(function (m) { return m.userId === userId; })[0];
    if (!target || !canAddMembers(projectId)) return false;
    if (target.access === 'admin' && p && p.visibility === 'private') {
      var others = list.filter(function (m) {
        return m.userId !== userId && m.access === 'admin';
      });
      if (!others.length) return false;
    }
    snapshot('ถอดสมาชิกออกจากโปรเจกต์');
    db.projectMembers = db.projectMembers.filter(function (m) {
      return !(m.projectId === projectId && m.userId === userId);
    });
    /* ถอดแล้วเข้าโปรเจกต์ไม่ได้อีก (โปรเจกต์ปิด/บุคคลภายนอก) — บทบาทในโปรเจกต์ของเขาไม่มีความหมายแล้ว
     * เดิมภาพรวมยังโชว์ "Piti – ทีมขาย" เหมือนยังอยู่ ลบในจุดย้อนกลับเดียวกัน (ย้อนกลับแล้วบทบาทกลับมา) */
    dropIndex();
    if (p && p.roles && p.roles[userId] && !projectAccess(projectId, userId)) delete p.roles[userId];
    var u = user(userId);
    audit('project.member-remove', (p ? p.name : projectId), u ? u.name : userId);
    commit();
    return true;
  }
  /* ---------- สิทธิ์ ----------
   *
   * ย้ำให้ชัด: นี่คือการจัดระเบียบในหน้าจอ ไม่ใช่การบังคับสิทธิ์จริง
   * แอปทำงานในเบราว์เซอร์ ใครเปิดเครื่องมือพัฒนาก็แก้บทบาทตัวเองได้
   * สิ่งที่บังคับได้จริงคือสิทธิ์บนไซต์ SharePoint (Edit เทียบกับ Read)
   * ซึ่ง Microsoft เป็นคนตรวจให้ ไม่ใช่โค้ดชุดนี้
   */
  var ROLES = [
    { id: 'admin',   label: 'ผู้ดูแล',
      desc: 'จัดการสมาชิก สิทธิ์ และโปรเจกต์ได้ทั้งหมด' },
    { id: 'member',  label: 'สมาชิก',
      desc: 'สร้างและแก้ไขงานได้ทุกงาน' },
    { id: 'guest',   label: 'บุคคลภายนอก',
      desc: 'เห็นเฉพาะโปรเจกต์ที่ถูกเชิญ สร้างโปรเจกต์เองไม่ได้' },
    { id: 'viewer',  label: 'ดูอย่างเดียว',
      desc: 'เปิดดูได้ทุกอย่าง แก้และแสดงความเห็นไม่ได้' }
  ];

  /* บทบาทองค์กรเป็น "เพดาน" ไม่ใช่ค่าเริ่มต้น สิทธิ์รายโปรเจกต์ยกให้เกินเพดานไม่ได้
   * guest  ทำงานได้เท่า member แต่ไม่มี structure จึงสร้างหรือแก้โครงสร้างโปรเจกต์ไม่ได้
   *        และเห็นเฉพาะโปรเจกต์ที่ถูกเชิญ ดูที่ projectAccess
   * viewer ไม่มี cap ใดเลย จึงแก้ไม่ได้แม้ถูกเชิญเข้าโปรเจกต์ด้วยสิทธิ์ edit
   *
   * ชุดนี้ต้องตรงกับ ck_users_role ใน db/schema.sql เสมอ */
  var ROLE_CAPS = {
    admin:   ['manage', 'structure', 'write', 'comment'],
    member:  ['structure', 'write', 'comment'],
    guest:   ['write', 'comment'],
    viewer:  []
  };

  function role(userId) {
    var u = user(userId || db.currentUserId);
    return (u && u.role) || 'member';
  }

  /**
   * cap: 'manage' | 'structure' | 'write' | 'comment'
   * taskId: ใส่มาเมื่อเป็นการแก้งานชิ้นใดชิ้นหนึ่ง
   *
   * ต้องผ่านสองด่าน — บทบาทระดับองค์กร แล้วจึงสิทธิ์ของโปรเจกต์ที่งานนั้นอยู่
   * ถ้างานอยู่หลายโปรเจกต์ ผ่านโปรเจกต์ใดโปรเจกต์หนึ่งก็พอ
   * เป็นกติกาเดียวกับที่ Asana ใช้ คือได้สิทธิ์สูงสุดเท่าที่มีทางใดทางหนึ่ง
   */
  function can(cap, taskId) {
    if (!isActive()) return false;
    var caps = ROLE_CAPS[role()] || [];
    if (caps.indexOf(cap) < 0) return false;

    if (taskId && (cap === 'write' || cap === 'comment')) {
      var need = cap === 'comment' ? 'comment' : 'edit';
      /* งานย่อยไม่ได้ผูกกับโปรเจกต์เอง ใช้สิทธิ์ของงานต้นทาง (เดิมงานย่อยทุกชิ้นแก้ได้หมด
       * แม้อยู่ในโปรเจกต์ที่เราดูได้อย่างเดียว) งานต้นทางไม่อยู่โปรเจกต์ไหน = งานส่วนตัว
       * แก้ได้เฉพาะคู่กรณีของงานนั้นหรือของงานต้นทาง */
      var tk = task(taskId);
      var root = tk ? rootOf(tk) : null;
      var ms = root ? (index().memByTask[root.id] || []) : [];
      if (!ms.length) {
        return isTaskParticipant(taskId) || (!!root && root.id !== taskId && isTaskParticipant(root.id));
      }

      var reachable = ms.filter(function (m) { return !!projectAccess(m.projectId); });
      /* ไม่ได้เป็นสมาชิกโปรเจกต์ไหนเลย แต่ถูกมอบหมายงานนี้มาโดยตรง
       * ให้แก้งานของตัวเองได้ ไม่งั้นจะเห็นงานแต่ติ๊กว่าเสร็จไม่ได้ (คู่กับ canSeeTask)
       * ถ้าเป็นสมาชิกโปรเจกต์อยู่แล้ว ให้ยึดระดับสิทธิ์ในโปรเจกต์เป็นหลัก
       * ไม่งั้นคนระดับ "ดูอย่างเดียว" จะแก้ได้ทันทีที่ถูกมอบหมายงาน */
      if (!reachable.length) return isTaskParticipant(taskId);
      return reachable.some(function (m) { return canInProject(m.projectId, need); });
    }
    return true;
  }

  /** กดอนุมัติ/ขอแก้/ปฏิเสธได้ไหม
   *
   * Sprint 1B — ผู้อนุมัติคือผู้รับผิดชอบงานคนเดียวเท่านั้น แบบเดียวกับ Asana
   * เดิมให้ทุกคนที่แก้โปรเจกต์ได้กดแทนได้ ผลคือสมาชิกธรรมดากด "อนุมัติ" งานที่ขอให้คนอื่นอนุมัติ
   * โดยไม่มีอะไรเตือน การอนุมัติจึงไม่มีความหมาย ถ้าผู้อนุมัติไม่อยู่ ให้เปลี่ยนผู้อนุมัติ (ผู้รับผิดชอบ)
   * ซึ่งทิ้งร่องรอยในประวัติ แทนการกดแทนกันเงียบ ๆ
   * ยังไม่มีผู้อนุมัติ = ยังไม่มีใครกดได้ ต้องเลือกผู้อนุมัติก่อน (กันคนขออนุมัติให้ตัวเอง) */
  function canApprove(taskId) {
    var t = task(taskId);
    if (!t || t.type !== 'approval') return false;
    if (!can('write')) return false;                   // ดูอย่างเดียว/ปิดบัญชี กดอะไรไม่ได้เลย
    return !!t.assigneeId && t.assigneeId === db.currentUserId;
  }

  /** ข้อความแจ้งคนที่เพิ่งได้รับงาน — งานขออนุมัติบอกว่า "ขออนุมัติจากคุณ" */
  function assignKey(isApproval) {
    return isApproval ? 'ขออนุมัติ “{t}” จากคุณ' : 'มอบหมายงาน “{t}” ให้คุณ';
  }

  /** ผลอนุมัติที่ถือว่า "ตัดสินแล้ว" — งานปิดเองเหมือน Asana (ขอแก้ไขยังเปิดอยู่ รอส่งใหม่) */
  function approvalDecided(v) { return v === 'approved' || v === 'rejected'; }

  /** ส่งขออนุมัติอีกครั้งได้ไหม — คนขอ (คนสร้างงาน) หรือคนที่แก้งานนี้ได้ แต่ไม่ใช่ผู้อนุมัติเอง
   *  ใช้หลังผู้อนุมัติ "ขอแก้ไข" เดิมคนขอไม่มีทางส่งกลับไปให้ดูใหม่เลย ต้องไปตามกันนอกระบบ */
  function canResubmit(taskId) {
    var t = task(taskId);
    if (!t || t.type !== 'approval' || t.approval !== 'changes') return false;
    if (!can('write')) return false;
    if (t.assigneeId === db.currentUserId) return false;
    return t.createdBy === db.currentUserId || can('write', taskId);
  }

  function resubmitApproval(taskId) {
    if (!canResubmit(taskId)) return denied('approval');
    var t = task(taskId);
    snapshot('ส่งขออนุมัติอีกครั้ง');
    /* ไม่ผ่าน updateTask เพราะข้อความแจ้งต้องถึงผู้อนุมัติ ("ขออนุมัติจากคุณ")
     * ไม่ใช่ถึงคนขอแบบผลอนุมัติทั่วไป */
    t.approval = 'pending';
    if (t.completed) { t.completed = false; t.completedAt = null; t.completedBy = null; }
    log(taskId, 'ส่งงานนี้ขออนุมัติอีกครั้ง', null, t.assigneeId ? [t.assigneeId] : null);
    if (t.assigneeId) notifyOnly(taskId, [t.assigneeId], 'ส่ง “{t}” ขออนุมัติจากคุณอีกครั้ง', 'assigned', { t: t.name });
    autoFire('approval', taskId, { v: 'pending' });
    commit();
    return t;
  }

  /* ---------- ด่านสร้างงาน (Sprint 1B) ----------
   *
   * เดิมแต่ละปุ่มตรวจสิทธิ์เอง และหลายทางลืมตรวจสิทธิ์รายโปรเจกต์ (ตรวจแค่บทบาทองค์กร)
   * คนที่มีสิทธิ์ "แสดงความเห็นได้" จึงพิมพ์ในช่อง + เพิ่มงาน แล้วกด Enter สร้างงานในโปรเจกต์ปิดได้
   * ย้ายมาตรวจที่ชั้นข้อมูลจุดเดียว ทุกทางที่ทำให้เกิดงานใหม่หรือเอางานเข้าโปรเจกต์
   * (เพิ่มในแถว Enter/วางหลายบรรทัด เพิ่มด่วน นำเข้า CSV สำเนา เทมเพลต ย้าย/เพิ่มเข้าโปรเจกต์)
   * ผ่านด่านนี้หมด ทางใหม่ที่เพิ่มทีหลังก็ใช้ฟังก์ชันเดียวกัน
   *
   * ยกเว้นโดยตั้งใจ: ส่งฟอร์ม (ฟอร์มเปิดให้คนนอกโปรเจกต์ส่งเรื่องเข้ามา) และระบบอัตโนมัติ
   * (กฎที่คนแก้โปรเจกต์ได้ตั้งไว้เอง) */
  function canCreateTask(projectId, parentId) {
    if (!can('write')) return false;
    if (parentId) return !!task(parentId) && can('write', parentId);
    if (projectId) return !!project(projectId) && canInProject(projectId, 'edit');
    return true;                                       // งานส่วนตัวในงานของฉัน
  }

  /** แก้ลำดับ/คอลัมน์ของงานในโปรเจกต์นี้ได้ไหม (ลากย้าย ย้ายหลายงาน) */
  function canArrangeIn(projectId) {
    return can('write') && canInProject(projectId, 'edit');
  }

  /* ---------- คนนอกโปรเจกต์ที่จะได้เห็นงาน (Sprint 1B) ----------
   *
   * คู่กรณีของงาน (ผู้รับผิดชอบ ผู้ติดตาม คนที่ถูก @ชื่อ ซึ่งกลายเป็นผู้ติดตาม) เห็นงานได้เสมอ
   * แม้ไม่ได้เป็นสมาชิกโปรเจกต์ (ดู canSeeTask) — เป็นกติกาที่ถูกต้อง แต่เดิมเกิดขึ้นเงียบ ๆ
   * มอบงานในโปรเจกต์ปิดให้คนนอกแล้วเขาเห็นทั้งงานและความเห็นทุกอัน (รวมราคาลับ)
   * โดยคนมอบไม่รู้ตัว จึงหาให้ก่อนว่าใครจะได้เห็นเพราะการกระทำนี้ ให้หน้าจอถามก่อนทำ
   *
   * @param taskIds งานเดียวหรือหลายงาน
   * @returns { users: [คนที่จะเห็นงานเพราะการกระทำนี้], projects: [โปรเจกต์ของงาน] } */
  function revealOutsiders(taskIds, userIds) {
    var out = { users: [], projects: [] }, seenU = {}, seenP = {};
    [].concat(taskIds || []).forEach(function (taskId) {
      var t = task(taskId);
      if (!t) return;
      var root = rootOf(t);
      var ms = index().memByTask[root.id] || [];
      if (!ms.length) return;              // งานส่วนตัว — มอบให้ใครก็ตั้งใจให้คนนั้นเห็นอยู่แล้ว
      (userIds || []).forEach(function (u) {
        if (!u || seenU[u] || u === db.currentUserId) return;
        var x = user(u);
        if (!x || x.active === false) return;
        if (isTaskParticipant(taskId, u) || isTaskParticipant(root.id, u)) return;   // เห็นอยู่แล้ว
        if (ms.some(function (m) { return !!projectAccess(m.projectId, u); })) return;
        seenU[u] = true;
        out.users.push(x);
      });
      ms.forEach(function (m) {
        var p = project(m.projectId);
        if (p && !seenP[p.id]) { seenP[p.id] = true; out.projects.push(p); }
      });
    });
    return out;
  }

  /* งานที่ยังไม่เกิด (สร้างจากภาระงาน หน้าเอกสาร เทมเพลต) หรือค่าที่จะมอบงานในอนาคต (ฟอร์ม อัตโนมัติ)
   * revealOutsiders ดูจากงานที่มีอยู่แล้ว ใช้ไม่ได้ ตัวนี้ดูจากโปรเจกต์ปลายทางตรง ๆ แทน
   * ใครที่ยังไม่มีสิทธิ์เห็นโปรเจกต์นั้น = จะได้เห็นงานเพราะถูกมอบ/ถูกตามงาน (คู่กรณีเห็นงานได้เสมอ)
   * โปรเจกต์เปิดทั้งองค์กรจึงมักไม่มีใครติด ยกเว้นบุคคลภายนอกที่ยังไม่ถูกเชิญ */
  function outsidersOf(projectId, userIds) {
    var out = { users: [], projects: [] }, seen = {};
    var p = projectId ? project(projectId) : null;
    if (!p) return out;
    out.projects.push(p);
    [].concat(userIds || []).forEach(function (u) {
      if (!u || seen[u] || u === db.currentUserId) return;
      var x = user(u);
      if (!x || x.active === false) return;
      if (projectAccess(p.id, u)) return;
      seen[u] = true;
      out.users.push(x);
    });
    return out;
  }

  /* เอางานที่มีอยู่แล้วเข้าโปรเจกต์ (ปิด) อีกโปรเจกต์ (เพิ่มเข้าโปรเจกต์ ทำให้เป็นสาธารณะ แก้หลายงาน อัตโนมัติ)
   * คู่กรณีของงาน (ผู้รับผิดชอบ คนสร้าง ผู้ติดตาม รวมงานย่อยทุกชั้น) เห็นงานได้เสมอ งานเข้าโปรเจกต์ปิดแล้ว
   * เขาจะเห็นทุกอย่างที่สมาชิกโปรเจกต์นั้นคุยกันในงานต่อจากนี้ทั้งที่ไม่ได้เป็นสมาชิก จึงต้องถามก่อน
   * ไม่นับคนที่เห็นงานนี้ผ่านโปรเจกต์อื่นที่ตัวเองเข้าได้อยู่แล้ว (เช่นงานอยู่โปรเจกต์เปิดด้วย = ทั้งองค์กรเห็นอยู่แล้ว)
   * @returns { users, projects: [โปรเจกต์ปลายทาง] } รูปเดียวกับ revealOutsiders/outsidersOf */
  function joinOutsiders(taskIds, projectId) {
    var out = { users: [], projects: [] }, seen = {};
    var p = projectId ? project(projectId) : null;
    if (!p) return out;
    out.projects.push(p);
    [].concat(taskIds || []).forEach(function (id) {
      var t = task(id);
      if (!t) return;
      var root = rootOf(t);
      var other = (index().memByTask[root.id] || []).filter(function (m) { return m.projectId !== p.id; });
      Object.keys(treeIds(id)).forEach(function (tid) {
        var x = task(tid);
        if (!x) return;
        [x.assigneeId, x.createdBy].concat(x.followers || []).forEach(function (u) {
          if (!u || seen[u] || u === db.currentUserId) return;
          var usr = user(u);
          if (!usr || usr.active === false) return;
          if (projectAccess(p.id, u)) return;
          if (other.some(function (m) { return !!projectAccess(m.projectId, u); })) return;
          seen[u] = true;
          out.users.push(usr);
        });
      });
    });
    return out;
  }

  /** ก่อนโอนงาน (ผู้ดูแลระบบ) — โปรเจกต์ที่งานที่จะโอนอยู่ แต่คนรับเข้าไม่ได้ เขาจะเห็นงานเพราะกลายเป็นผู้รับผิดชอบ
   *  งานที่เขาเห็นผ่านโปรเจกต์อื่นอยู่แล้วไม่นับ · withProj = โอนบทบาทผู้ดูแลไปด้วย โปรเจกต์ที่ handoverProjects
   *  จะเพิ่มเขาเป็นผู้ดูแลอยู่แล้ว (เคยเป็นผู้ดูแล หรือเป็นโปรเจกต์ปิด) ไม่ต้องนับ
   *  @returns [{ project, taskIds }] */
  function handoverOutsiders(fromId, toId, withProj) {
    if (!user(fromId) || !user(toId)) return [];
    var covered = {};
    if (withProj) projectRolesOf(fromId).forEach(function (p) {
      var wasAdmin = projectMembers(p.id).some(function (m) { return m.userId === fromId && m.access === 'admin'; });
      if (wasAdmin || p.visibility === 'private') covered[p.id] = true;
    });
    var byP = {}, out = [];
    openTasksOf(fromId).forEach(function (t) {
      var ms = index().memByTask[rootOf(t).id] || [];
      if (!ms.length) return;                       // งานส่วนตัว — คนรับเป็นคู่กรณีก็ตั้งใจให้เห็นอยู่แล้ว
      if (isTaskParticipant(t.id, toId)) return;      // เห็นงานนี้อยู่แล้ว
      if (ms.some(function (m) { return covered[m.projectId] || !!projectAccess(m.projectId, toId); })) return;
      ms.forEach(function (m) {
        var p = project(m.projectId);
        if (!p) return;
        if (!byP[p.id]) { byP[p.id] = { project: p, taskIds: [] }; out.push(byP[p.id]); }
        if (byP[p.id].taskIds.indexOf(t.id) < 0) byP[p.id].taskIds.push(t.id);
      });
    });
    return out;
  }

  /** เพิ่มคนเป็นสมาชิกโปรเจกต์ได้ไหม (หน้าต่างสมาชิก และตัวเลือก "เพิ่มเป็นสมาชิก" ในหน้าต่างถามก่อนมอบงาน)
   *
   * เดิมให้เฉพาะผู้ดูแลระบบ ทั้งที่คำอธิบายสิทธิ์ "ผู้ดูแลโปรเจกต์" บอกว่าจัดการสมาชิกได้ หน้าต่างก็โชว์ปุ่มให้
   * แต่กดแล้วโดนปฏิเสธ ตอนนี้ผู้ดูแลระบบ หรือคนที่มีสิทธิ์ผู้ดูแลในโปรเจกต์นั้น (ตามคำอธิบาย)
   * โปรเจกต์ที่ล็อกรายชื่อไว้ = ผู้ดูแลระบบเท่านั้น (ตามคำอธิบายของปุ่มล็อก)
   * สมาชิกทั่วไปเพิ่มคน (รวมตัวเอง) หรือยกสิทธิ์ตัวเองไม่ได้ เพราะไม่ผ่านด่าน admin ของโปรเจกต์ */
  function canAddMembers(projectId) {
    var p = project(projectId);
    if (!p || !isActive()) return false;
    if (can('manage')) return true;
    if (p.locked) return false;
    return can('write') && canInProject(projectId, 'admin');
  }

  /** ทำตามที่เลือกในหน้าต่างถาม — ไม่ snapshot/commit ให้ผู้เรียกครอบด้วย batch กับการกระทำจริง
   *  access = 'comment' | 'edit' เพิ่มเป็นสมาชิกโปรเจกต์แรกของงาน · null = ให้เห็นเฉพาะงานนี้ (ลงประวัติไว้)
   *  projectId — งานเพิ่งสร้าง (หรือยังไม่มีงาน) คนที่ถูกมอบเป็นคู่กรณีไปแล้ว revealOutsiders จะไม่เจอเขา
   *  จึงนับคนนอกจากสมาชิกของโปรเจกต์นี้แทน และลงประวัติเฉพาะงานที่คนนั้นเกี่ยวข้องจริง */
  function revealTo(taskIds, userIds, access, projectId) {
    var r = projectId ? outsidersOf(projectId, userIds) : revealOutsiders(taskIds, userIds);
    if (!r.users.length) return true;
    if (access) {
      var p = r.projects[0];
      if (!p || !canAddMembers(p.id) || !ACCESS_RANK[access]) return false;
      r.users.forEach(function (u) {
        setProjectMember(p.id, u.id, access, true);
        audit('project.member', p.name, u.name + ' → ' + access);
      });
      return true;
    }
    /* เลือกให้เห็นเฉพาะงาน — ทิ้งร่องรอยไว้ในประวัติของงาน คนที่มาดูทีหลังจะรู้ว่าใครเปิดให้คนนอกเห็น */
    var ids = [].concat(taskIds || []).filter(function (tid) { return !!task(tid); });
    r.users.forEach(function (u) {
      var where = !projectId ? ids : ids.filter(function (tid) {
        return isTaskParticipant(tid, u.id) || subtasks(tid).some(function (s) { return isTaskParticipant(s.id, u.id); });
      });
      if (projectId && !where.length) where = ids.slice(0, 1);
      where.forEach(function (tid) {
        log(tid, 'ให้ {who} เห็นงานนี้ (ไม่ได้เป็นสมาชิกโปรเจกต์)', { who: u.name });
      });
    });
    return true;
  }

  /* ชั้นหน้าจอลงทะเบียนไว้ ถูกปฏิเสธที่ชั้นข้อมูลเมื่อไหร่จะได้ขึ้นข้อความบอกเหตุผล
   * ไม่ใช่กดแล้วเงียบ (ทางที่ไม่ผ่านตัวจัดการคลิก เช่นกด Enter หรือวางข้อความ) */
  var denyFns = [];
  function onDeny(fn) { denyFns.push(fn); }
  function denied(why) {
    denyFns.forEach(function (fn) { try { fn(why || 'create'); } catch (e) { /* หน้าจอพังไม่ควรลากชั้นข้อมูลพังตาม */ } });
    return null;
  }

  function isAdmin(userId) { return role(userId) === 'admin'; }

  function adminCount() {
    return db.users.filter(function (u) { return u.role === "admin" && u.active !== false; }).length;
  }

  /** เปลี่ยนบทบาท — ห้ามเหลือศูนย์ผู้ดูแล ไม่งั้นไม่มีใครเข้าหน้าผู้ดูแลได้อีก */
  function setRole(userId, newRole) {
    var u = user(userId);
    if (!u || !ROLE_CAPS[newRole]) return false;
    if (u.role === 'admin' && newRole !== 'admin' && adminCount() <= 1) return false;
    snapshot('เปลี่ยนบทบาท');
    u.role = newRole;
    audit("user.role", u.name, 'เปลี่ยนเป็น {v}', { v: newRole });
    commit();
    return true;
  }


  /** ปิดหรือเปิดการใช้งานบัญชี
   *  ตัดสิทธิ์ได้ทันทีโดยไม่ต้องลบคนออก งานที่มอบหมายไว้จึงไม่หลุดหาย
   *  และเปิดกลับได้ถ้าเป็นการปิดชั่วคราว */
  function setActive(userId, active) {
    var u = user(userId);
    if (!u) return false;
    if (userId === db.currentUserId) return false;                     // ห้ามปิดตัวเอง
    if (u.role === 'admin' && !active && adminCount() <= 1) return false;
    snapshot(active ? 'เปิดใช้งานบัญชี' : 'ปิดใช้งานบัญชี');
    u.active = !!active;
    audit(active ? 'user.enable' : 'user.disable', u.name, u.email);
    commit();
    return true;
  }

  /* ---------- โอนงานต่อ ----------
   *
   * ปิดบัญชีเฉย ๆ ไม่พอ งานที่ค้างอยู่กับคนนั้นยังผูกกับบัญชีที่เข้าไม่ได้
   * ไม่มีใครได้รับแจ้ง งานจะเงียบหายไปจนกว่าจะมีคนไปตามหาเอง
   * ซึ่งมักเป็นตอนที่เลยกำหนดไปแล้ว
   */
  function openTasksOf(userId) {
    return db.tasks.filter(function (t) {
      return t.assigneeId === userId && !t.completed;
    });
  }

  /**
   * โอนงานที่ยังไม่เสร็จทั้งหมดของคนหนึ่งไปให้อีกคน
   * @param toUserId  null = ปล่อยว่าง ต้องเป็นการเลือกอย่างจงใจ ไม่ใช่ผลข้างเคียง
   * @returns จำนวนงานที่โอน
   */
  function handoverTasks(fromId, toUserId) {
    var from = user(fromId);
    if (!from) return 0;
    var list = openTasksOf(fromId);
    if (!list.length) return 0;
    var to = toUserId ? user(toUserId) : null;
    if (toUserId && !to) return 0;

    snapshot('โอนงานต่อ');
    var actor = me();
    list.forEach(function (t) {
      mtForget(t.id, t.assigneeId);
      t.assigneeId = to ? to.id : null;
      stampAssign(t);
      if (to && (t.followers || []).indexOf(to.id) < 0) t.followers.push(to.id);
      db.stories.push({
        id: uid('st'), taskId: t.id, actorId: db.currentUserId, type: 'log',
        text: to ? 'รับช่วงงานต่อจาก {who}' : 'ยกเลิกผู้รับผิดชอบ เดิมเป็นของ {who}',
        params: { who: from.name },
        createdAt: new Date().toISOString()
      });
    });

    /* แจ้งครั้งเดียวสำหรับทั้งชุด ไม่ใช่ยิงทีละงาน
     * คนที่รับช่วงงานสามสิบงานไม่ควรเจอสามสิบแถวในกล่องแจ้งเตือน */
    if (to) {
      notifyOnly(list[0].id, [to.id],
        'โอนงานที่ยังไม่เสร็จ {n} งาน จาก {who} มาให้คุณ', 'assigned',
        { n: list.length, who: from.name });
    }
    audit('user.handover', from.name,
      to ? 'โอนให้ {who} จำนวน {n} งาน' : 'ปล่อยว่างไว้ จำนวน {n} งาน',
      to ? { who: to.name, n: list.length } : { n: list.length });
    commit();
    return list.length;
  }

  /* Sprint 1B — โปรเจกต์ที่คนนี้เป็นเจ้าของหรือผู้ดูแลโปรเจกต์อยู่
   * ปิดบัญชีแล้วโปรเจกต์ปิดอาจเหลือแต่ผู้ดูแลที่เข้าไม่ได้ คำขอสิทธิ์ก็ไปตกที่บัญชีที่ปิดแล้ว
   * จึงให้โอนบทบาทเหล่านี้ไปพร้อมกับงานได้ในหน้าต่างเดียว */
  function projectRolesOf(userId) {
    return db.projects.filter(function (p) {
      return p.owner === userId || projectMembers(p.id).some(function (m) {
        return m.userId === userId && m.access === 'admin';
      });
    });
  }

  /** โอนความเป็นเจ้าของ/ผู้ดูแลโปรเจกต์ให้อีกคน (คนเดิมยังอยู่ในรายชื่อ เผื่อเปิดบัญชีกลับ) */
  function handoverProjects(fromId, toId) {
    var from = user(fromId), to = user(toId);
    if (!from || !to || fromId === toId) return 0;
    var list = projectRolesOf(fromId);
    if (!list.length) return 0;
    snapshot('โอนสิทธิ์ผู้ดูแลโปรเจกต์');
    list.forEach(function (p) {
      if (p.owner === fromId) p.owner = toId;
      var wasAdmin = projectMembers(p.id).some(function (m) { return m.userId === fromId && m.access === 'admin'; });
      if (wasAdmin || p.visibility === 'private') setProjectMember(p.id, toId, 'admin', true);
    });
    audit('user.handover', from.name, 'โอนความเป็นเจ้าของ/ผู้ดูแล {n} โปรเจกต์ให้ {who}', { n: list.length, who: to.name });
    commit();
    return list.length;
  }

  /** บัญชีนี้ใช้งานได้อยู่ไหม — ปิดแล้วต้องทำอะไรไม่ได้เลย */
  function isActive(userId) {
    var u = user(userId || db.currentUserId);
    return !!u && u.active !== false;
  }
  /** คนที่เคยล็อกอินจริง แยกจากผู้ใช้ตัวอย่าง */
  function signedInUsers() {
    return db.users.filter(function (u) { return !!u.lastSeenAt; });
  }

  /** กิจกรรมล่าสุด ใช้ทั้งหน้าแรกและหน้าผู้ดูแล
   *
   * กรองสิทธิ์ก่อนตัดจำนวน ไม่งั้นคนที่เห็นงานไม่กี่งานจะได้ลิสต์ว่างเปล่า
   * ทั้งที่มีกิจกรรมของตัวเองอยู่ท้าย ๆ
   */
  function recentActivity(limit) {
    var cache = {}, out = [], n = limit || 40;
    var list = db.stories.slice()
      .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    for (var i = 0; i < list.length && out.length < n; i++) {
      var s = list[i];
      if (!(s.taskId in cache)) cache[s.taskId] = canSeeTask(s.taskId);
      if (!cache[s.taskId]) continue;
      var t = task(s.taskId);
      out.push({ story: s, actor: user(s.actorId), taskName: t ? t.name : null });
    }
    return out;
  }

  function setSetting(key, value) {
    db.settings = db.settings || {};
    db.settings[key] = value;
    commit();
  }

  /* ---------- ค่าที่ตั้งไว้ของแต่ละคน ----------
   *
   * เก็บที่ตัวผู้ใช้ ไม่ใช่ที่ db.settings เพราะพอเข้าโหมดทีมแล้วฐานข้อมูลเป็นก้อนเดียว
   * ถ้าเก็บรวม คนหนึ่งเปลี่ยนธีมเป็นมืด ทุกคนจะมืดตาม
   */
  var PREF_DEFAULTS = {
    theme: 'auto',
    lang: null,               // null = เดาจากเบราว์เซอร์
    landing: 'home',          // home | mytasks | inbox
    firstDay: 'auto',         // auto | sun | mon
    compact: false,
    rowNumbers: false,
    shortcuts: true,
    confirmDelete: true
  };

  function pref(key) {
    var u = me();
    if (u && u.prefs && key in u.prefs && u.prefs[key] !== undefined) return u.prefs[key];
    if (db.settings && key in db.settings) return db.settings[key];   // ข้อมูลเก่า
    return PREF_DEFAULTS[key];
  }

  function setPref(key, value) {
    var u = me();
    if (!u) return;
    u.prefs = u.prefs || {};
    u.prefs[key] = value;
    commit();
  }

  function setNotifyPref(kind, on) {
    var u = me();
    if (!u) return;
    u.prefs = u.prefs || {};
    u.prefs.notify = u.prefs.notify || {};
    u.prefs.notify[kind] = !!on;
    commit();
  }

  /** แก้โปรไฟล์ของตัวเอง ชื่อว่างไม่ได้ เพราะชื่อคือสิ่งที่คนอื่นใช้เรียกในระบบ */
  /* ---------- โปรเจกต์ที่ปักหมุดไว้ ----------
   *
   * เก็บที่ตัวคน ไม่ใช่ที่โปรเจกต์ เพราะคนละคนทำงานกับโปรเจกต์คนละชุด
   * ถ้าเก็บที่โปรเจกต์ พอใครปักหมุด แถบข้างของทุกคนจะเปลี่ยนตาม
   *
   * พอมีโปรเจกต์หลายสิบ แถบข้างจะยาวจนต้องเลื่อนหาทุกครั้ง
   * ปักหมุดคือทางลัดไปที่ห้าหกอันที่เปิดจริงทุกวัน
   */
  function starred() {
    var u = me();
    var ids = (u && u.prefs && u.prefs.starred) || [];
    /* กรองโปรเจกต์ที่ถูกลบหรือหมดสิทธิ์เห็นออก ไม่งั้นจะมีหมุดค้างชี้ไปที่ว่าง */
    return ids.filter(function (id) { return !!project(id) && !!projectAccess(id); });
  }

  function isStarred(projectId) { return starred().indexOf(projectId) >= 0; }

  function toggleStar(projectId) {
    var u = me();
    if (!u || !project(projectId)) return false;
    u.prefs = u.prefs || {};
    var cur = (u.prefs.starred || []).slice();
    var i = cur.indexOf(projectId);
    if (i >= 0) cur.splice(i, 1); else cur.push(projectId);
    u.prefs.starred = cur;
    commit();
    return i < 0;                 // true = เพิ่งปักหมุด
  }

  /** โปรเจกต์ที่ปักหมุด เรียงตามลำดับที่ปัก */
  function starredProjects() {
    return starred().map(function (id) { return project(id); })
      .filter(function (p) { return p && !p.archived; });
  }

  function updateProfile(patch) {
    var u = me();
    if (!u) return null;
    ['name', 'title', 'dept', 'about', 'pronouns', 'color'].forEach(function (k) {
      if (k in patch && patch[k] !== undefined) u[k] = patch[k];
    });
    if (!u.name || !u.name.trim()) u.name = 'ผู้ใช้';
    commit();
    return u;
  }

  /* ---------- รูปโปรไฟล์ ----------
   *
   * เก็บเป็น data URI ในตัวฐานข้อมูลเลย ไม่มีที่เก็บไฟล์แยกให้ใช้ในเวอร์ชันนี้
   * แลกมาด้วยข้อจำกัดที่ต้องคุมเอง — พื้นที่ในเบราว์เซอร์มีราว 5 MB
   * ถ้าปล่อยให้อัปรูปจากมือถือดิบ ๆ รูปเดียวก็กินไปสองสามเมกะแล้ว
   * ฝั่งหน้าจอจึงย่อรูปก่อนส่งมา และที่นี่กันอีกชั้นไม่ให้เกินเพดาน
   * ต่อให้มีใครเรียกฟังก์ชันนี้ตรง ๆ ก็ยังผ่านด่านเดียวกัน
   */
  var PHOTO_PX = 240;          // ด้านยาวสุดหลังย่อ พอสำหรับรูปใหญ่ในหน้าโปรไฟล์
  var PHOTO_MAX_BYTES = 32000; /* วัดโควตาจริงของ Chrome ได้ราว 12 MB ต่อโดเมน
     * ข้อมูลงานของ 200 คนกินไปแล้วราว 1.4 MB
     * ตั้งเพดานไว้ 32 KB ต่อคน กรณีแย่ที่สุดคือทุกคนใส่รูปเต็มเพดาน
     * รวมแล้วราว 6.5 MB ยังเหลือที่ให้งานโตต่อได้อีกเท่าตัว
     * ที่ 240px คุณภาพระดับนี้ยังคมพอสำหรับรูปใหญ่ในหน้าโปรไฟล์ */

  function photoBytes(dataUri) {
    if (!dataUri) return 0;
    var i = dataUri.indexOf(',');
    return i < 0 ? dataUri.length : Math.round((dataUri.length - i - 1) * 3 / 4);
  }

  /** รวมขนาดรูปโปรไฟล์ทุกคน ใช้โชว์ในหน้าข้อมูลและสำรอง */
  function photoTotalBytes() {
    return db.users.reduce(function (n, u) { return n + photoBytes(u.photo); }, 0);
  }

  /** รวมขนาดไฟล์แนบทั้งหมด และนับจำนวนไฟล์
   *
   * ไฟล์แนบเป็นก้อนที่โตเร็วที่สุดในระบบ เพราะเก็บตัวไฟล์มาทั้งก้อน
   * ต้องเห็นตัวเลขได้ก่อนที่พื้นที่จะเต็ม ไม่ใช่รู้ตอนบันทึกไม่ลงแล้ว
   */
  function attachTotals() {
    var n = 0, bytes = 0;
    db.tasks.forEach(function (t) {
      (t.attachments || []).forEach(function (a) {
        n++;
        bytes += a.size || photoBytes(a.url);
      });
    });
    return { count: n, bytes: bytes };
  }

  /**
   * ตั้งรูปโปรไฟล์ของตัวเอง
   * @returns {{ok:boolean, reason?:string, bytes?:number}}
   */
  function setPhoto(dataUri) {
    var u = me();
    if (!u) return { ok: false, reason: 'ไม่พบผู้ใช้' };
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(dataUri || '')) {
      return { ok: false, reason: 'ไฟล์นี้ไม่ใช่รูปภาพที่รองรับ' };
    }
    var bytes = photoBytes(dataUri);
    if (bytes > PHOTO_MAX_BYTES) return { ok: false, reason: 'รูปใหญ่เกินไป', bytes: bytes };
    snapshot('เปลี่ยนรูปโปรไฟล์');
    u.photo = dataUri;
    audit('user.photo', u.name);
    commit();
    return { ok: true, bytes: bytes };
  }

  function removePhoto() {
    var u = me();
    if (!u || !u.photo) return false;
    snapshot('ลบรูปโปรไฟล์');
    u.photo = null;
    audit('user.photoClear', u.name);
    commit();
    return true;
  }

  /* ---------- คนที่ทำงานด้วยบ่อย ----------
   *
   * นับจากการอยู่ในงานเดียวกันจริง ไม่ใช่จากการอยู่โปรเจกต์เดียวกัน
   * โปรเจกต์ใหญ่ ๆ มีคนเป็นสิบที่ไม่เคยแตะงานเดียวกันเลย ถ้านับจากโปรเจกต์
   * รายชื่อจะกลายเป็นทะเบียนพนักงาน ไม่ใช่คนที่คุยด้วยจริง
   */
  function frequentCollaborators(userId, limit) {
    var uid = userId || (me() && me().id);
    if (!uid) return [];
    var i = index(), count = {};

    function bump(id) {
      if (!id || id === uid) return;
      count[id] = (count[id] || 0) + 1;
    }

    db.tasks.forEach(function (t) {
      var people = [t.assigneeId].concat(t.followers || []);
      (i.storyByTask[t.id] || []).forEach(function (s) { people.push(s.actorId); });
      if (people.indexOf(uid) < 0) return;
      /* กรองด้วยสายตาของคนที่กำลังเปิดดู ไม่ใช่ของเจ้าของโปรไฟล์
       * เปิดโปรไฟล์คนอื่นแล้วเห็นรายชื่อจากงานลับที่ตัวเองเข้าไม่ถึงไม่ได้ */
      if (!canSeeTask(t.id)) return;
      people.forEach(bump);
    });

    return Object.keys(count)
      .map(function (id) { return { user: user(id), n: count[id] }; })
      .filter(function (x) { return x.user && x.user.active !== false; })
      .sort(function (a, b) { return b.n - a.n || a.user.name.localeCompare(b.user.name); })
      .slice(0, limit || 5);
  }

  /* ---------- สถานะไม่อยู่ ----------
   *
   * หมดอายุเองตามวันที่ ไม่ต้องมีใครมาปิด
   * ถ้าต้องกดปิดเอง คนส่วนใหญ่จะลืม แล้วป้าย "ไม่อยู่" จะค้างจนไม่มีใครเชื่ออีก
   */
  function setAway(until, note) {
    var u = me();
    if (!u) return;
    /* 4b — สถานะไม่อยู่เป็นหลายช่วงแล้ว ปุ่มเดิม "ไม่อยู่ถึงวันที่" = แทนช่วงที่ครอบวันนี้ด้วยช่วงใหม่ที่เริ่มวันนี้ */
    var td0 = today();
    u.awayRanges = (u.awayRanges || []).filter(function (r) { return !((!r.from || r.from <= td0) && r.to >= td0); });
    if (until) u.awayRanges.push({ id: uid('aw'), from: td0, to: until, note: note || '' });
    u.away = until ? { until: until, note: note || '' } : null;
    /* ไม่ใส่ target เพราะเป็นการกระทำกับตัวเอง ชื่อผู้ทำอยู่หน้าบรรทัดแล้ว
     * ถ้าใส่ด้วยจะอ่านว่า "สมชาย ได้ตั้งสถานะไม่อยู่ สมชาย" */
    audit(until ? 'user.away' : 'user.back', null, until || null);
    commit();
  }

  /** 4b — ไม่อยู่ในวันนั้นไหม (ไม่ระบุ = วันนี้) ดูทุกช่วงใน awayRanges — ใช้ทั้งป้าย การมอบหมายแบบวนรอบ และภาระงาน */
  function isAway(userId, date) {
    return !!awayOn(userId, date);
  }

  /* ======================================================================
   * 2c — ค้นหา ฟิลด์ (รหัสงาน คลังฟิลด์) แท็ก นำเข้า/ส่งออก และงานดูแลโปรเจกต์
   * ====================================================================== */

  /* ---------- นิยามฟิลด์ ---------- */

  /** นิยามของฟิลด์จากรหัส — คลังก่อน แล้วไล่ทุกโปรเจกต์ */
  function fieldDef(fieldId) {
    if (!fieldId) return null;
    var lib = (db.fieldLib || []).filter(function (f) { return f.id === fieldId; })[0];
    if (lib) return lib;
    for (var i = 0; i < db.projects.length; i++) {
      var f = (db.projects[i].fields || []).filter(function (x) { return x.id === fieldId; })[0];
      if (f) return f;
    }
    return null;
  }

  /** { fieldId: true } ของฟิลด์รหัสงานทุกอัน */
  function idFieldSet() {
    var out = {};
    db.projects.forEach(function (p) {
      (p.fields || []).forEach(function (f) { if (f.type === 'id') out[f.id] = true; });
    });
    return out;
  }

  /** ค่าฟิลด์เป็นข้อความอ่านได้ — ใช้ใน CSV ค้นหา และที่ไม่ได้วาดเป็นป้ายสี */
  function fieldText(f, v) {
    if (v === null || v === undefined || v === '') return '';
    if (!f) return String(v);
    if (f.type === 'id') return (f.prefix || 'ID') + '-' + v;
    if (f.type === 'formula') return f.out === 'date' ? String(v) : formatNumber(f, v);
    if (f.type === 'ref') return refNames(v);
    if (f.type === 'number') return formatNumber(f, v);
    if (f.type === 'multi') return [].concat(v).join(' · ');
    if (f.type === 'person') { var pu = user(v); return pu ? pu.name : ''; }
    return String(v);
  }

  /** ออกเลขรหัสงานให้งานในโปรเจกต์ที่ยังไม่มี เรียงตามคอลัมน์แล้วตามลำดับในคอลัมน์
   *  ไม่ commit (commit เรียกเอง) คืน true ถ้ามีอะไรเปลี่ยน */
  function assignIds() {
    var changed = false;
    db.projects.forEach(function (p) {
      var idfs = (p.fields || []).filter(function (f) { return f.type === 'id'; });
      if (!idfs.length) return;
      var secOrder = {};
      p.sections.forEach(function (s, k) { secOrder[s.id] = k; });
      var list = tasksInProject(p.id).slice().sort(function (a, b) {
        return ((secOrder[a.membership.sectionId] || 0) - (secOrder[b.membership.sectionId] || 0)) ||
          (a.membership.position - b.membership.position);
      }).map(function (x) { return x.task.id; });
      idfs.forEach(function (f) {
        var have = {};
        db.fieldValues.forEach(function (v) { if (v.fieldId === f.id) have[v.taskId] = true; });
        list.forEach(function (tid) {
          if (have[tid]) return;
          db.fieldValues.push({ taskId: tid, fieldId: f.id, value: f.next });
          f.next = (f.next || 1) + 1;
          changed = true;
        });
      });
    });
    return changed;
  }

  /** รหัสงานทั้งหมดของงานหนึ่ง เช่น ['REQ-12'] */
  function taskCodes(t) {
    var out = [];
    var row = index().fvByTask[t.id] || {};
    Object.keys(row).forEach(function (fid) {
      var f = fieldDef(fid);
      if (f && f.type === 'id') out.push(fieldText(f, row[fid].value));
    });
    return out;
  }

  /** หางานจากรหัส (REQ-12) — เฉพาะงานที่คนนี้เห็น ใช้กับการ @อ้างถึงและค้นหา */
  function findByCode(code) {
    var m = String(code || '').trim().toUpperCase().match(/^([A-Z0-9]+)-(\d+)$/);
    if (!m) return [];
    var out = [];
    db.projects.forEach(function (p) {
      (p.fields || []).forEach(function (f) {
        if (f.type !== 'id' || f.prefix !== m[1]) return;
        db.fieldValues.forEach(function (v) {
          if (v.fieldId === f.id && String(v.value) === String(+m[2])) {
            var t = task(v.taskId);
            if (t && canSeeTask(t.id) && out.indexOf(t) < 0) out.push(t);
          }
        });
      });
    });
    return out;
  }

  /* ---------- คลังฟิลด์ขององค์กร ---------- */

  var LIB_KEYS = ['name', 'type', 'options', 'format', 'desc', 'notify'];

  function fieldLib() { return db.fieldLib || []; }
  function libField(id) { return fieldLib().filter(function (f) { return f.id === id; })[0] || null; }

  /** โปรเจกต์ที่ใช้ฟิลด์จากคลังนี้อยู่ */
  function libUsage(libId) {
    return db.projects.filter(function (p) {
      return (p.fields || []).some(function (f) { return f.id === libId && f.lib; });
    });
  }

  /** ฟิลด์จากคลัง — คัดลอกนิยามจากตัวที่เพิ่งแก้ไปให้คลังและทุกโปรเจกต์ที่ใช้ (ไม่ commit) */
  function propagateField(src) {
    if (!src) return;
    var lib = libField(src.id);
    if (!lib) return;
    var targets = [lib];
    db.projects.forEach(function (p) {
      (p.fields || []).forEach(function (f) { if (f.id === src.id && f.lib) targets.push(f); });
    });
    targets.forEach(function (f) {
      if (f === src) return;
      LIB_KEYS.forEach(function (k) { f[k] = clone(src[k] === undefined ? null : src[k]); });
      if (f.format === null && f.type !== 'number') delete f.format;
    });
  }

  /**
   * แก้นิยามฟิลด์ — ชื่อ คำอธิบาย ตัวเลือก (เปลี่ยนชื่อตัวเลือกแล้วค่าที่กรอกไว้เปลี่ยนตาม)
   * แจ้งเตือนเมื่อเปลี่ยน คำนำหน้ารหัสงาน รูปแบบตัวเลข
   * @param projectId  null = แก้ที่คลังฟิลด์โดยตรง
   * @param patch      { name, desc, notify, options: [{name, color, old}], prefix, format }
   */
  function updateFieldDef(projectId, fieldId, patch) {
    var f = projectId
      ? ((project(projectId) || {}).fields || []).filter(function (x) { return x.id === fieldId; })[0]
      : libField(fieldId);
    if (!f) return false;
    snapshot('แก้ไขฟิลด์ “{f}”', { f: f.name });
    if (typeof patch.name === 'string' && patch.name.trim()) f.name = patch.name.trim().slice(0, 80);
    if (typeof patch.desc === 'string') f.desc = patch.desc.trim().slice(0, 300);
    if ('notify' in patch) f.notify = !!patch.notify && (f.type === 'select' || f.type === 'multi');
    if (f.type === 'id' && patch.prefix) f.prefix = cleanPrefix(patch.prefix);
    if ((f.type === 'number' || f.type === 'formula') && 'format' in patch) f.format = normalizeFormat(patch.format);
    if (f.type === 'formula' && typeof patch.expr === 'string' && patch.expr) { f.expr = patch.expr; f.out = patch.out === 'date' ? 'date' : 'number'; }
    if (f.type === 'ref' && Array.isArray(patch.kinds) && patch.kinds.length) f.kinds = patch.kinds.slice(0, 3);
    if (Array.isArray(patch.options) && (f.type === 'select' || f.type === 'multi')) {
      var ren = {};
      patch.options.forEach(function (o) {
        if (o && o.old && o.name && o.old !== o.name) ren[o.old] = o.name;
      });
      f.options = normalizeOptions(patch.options.map(function (o) { return { name: String(o.name || '').trim(), color: o.color }; }));
      if (Object.keys(ren).length) {
        db.fieldValues.forEach(function (v) {
          if (v.fieldId !== f.id) return;
          if (Array.isArray(v.value)) v.value = v.value.map(function (x) { return ren[x] || x; });
          else if (ren[v.value]) v.value = ren[v.value];
        });
      }
    }
    propagateField(f);
    commit();
    return true;
  }

  /** สร้างฟิลด์ใหม่ในคลัง (รหัสงานเป็นของแต่ละโปรเจกต์ จึงอยู่ในคลังไม่ได้) */
  function createLibField(def) {
    if (!def || !def.name || def.type === 'id') return null;
    snapshot('สร้างฟิลด์ในคลัง');
    var f = normalizeFieldDef({
      id: uid('f'), name: String(def.name).trim().slice(0, 80), type: def.type || 'text',
      options: def.options, desc: def.desc || '', notify: !!def.notify
    });
    if (f.type === 'number') f.format = normalizeFormat(def.format);
    db.fieldLib = db.fieldLib || [];
    db.fieldLib.push(f);
    audit('field.lib-create', f.name);
    commit();
    return f;
  }

  /** ใช้ฟิลด์จากคลังในโปรเจกต์ — ค่าเดียวกันทุกโปรเจกต์ที่ใช้ (งานที่อยู่สองโปรเจกต์เห็นค่าเดียว) */
  function addLibFieldToProject(projectId, libId) {
    var p = project(projectId), lf = libField(libId);
    if (!p || !lf) return false;
    if (p.fields.some(function (f) { return f.id === libId; })) return false;
    snapshot('เพิ่มฟิลด์จากคลัง');
    var c = clone(lf);
    c.lib = true;
    p.fields.push(c);
    commit();
    return true;
  }

  /** ยกฟิลด์ของโปรเจกต์ขึ้นคลัง ใช้รหัสเดิม ค่าที่กรอกไว้จึงตามไปด้วย */
  function promoteFieldToLib(projectId, fieldId) {
    var p = project(projectId);
    var f = p && p.fields.filter(function (x) { return x.id === fieldId; })[0];
    if (!f || f.lib || f.type === 'id' || libField(fieldId)) return false;
    snapshot('บันทึกฟิลด์ลงคลัง');
    var c = clone(f);
    delete c.lib;
    db.fieldLib = db.fieldLib || [];
    db.fieldLib.push(c);
    f.lib = true;
    audit('field.lib-create', f.name, 'จากโปรเจกต์ {p}', { p: p.name });
    commit();
    return true;
  }

  /** เอาออกจากคลัง — โปรเจกต์ที่ใช้อยู่ยังมีฟิลด์และค่าเดิม แต่แก้แยกกันได้แล้ว */
  function deleteLibField(libId) {
    var lf = libField(libId);
    if (!lf) return false;
    snapshot('ลบฟิลด์ออกจากคลัง');
    db.fieldLib = db.fieldLib.filter(function (f) { return f.id !== libId; });
    db.projects.forEach(function (p) {
      (p.fields || []).forEach(function (f) { if (f.id === libId) delete f.lib; });
    });
    audit('field.lib-delete', lf.name);
    commit();
    return true;
  }

  /* ---------- ค้นหาแบบมีตัวดำเนินการ ----------
   *   "วลีตรงตัว"   a | b (หรือ a OR b)   -ไม่เอาคำนี้   คำนำ*   ( จัดกลุ่ม )
   * ช่องว่าง = และ  คำธรรมดาค้นแบบมีอยู่ในข้อความ (ภาษาไทยไม่มีช่องว่างคั่นคำ)
   * คำนำ* = ต้องขึ้นต้นคำ (ต้นข้อความหรือหลังช่องว่าง/เครื่องหมาย) */
  function hasOperators(q) {
    return /["|()]|\*(\s|$)|(^|\s)-\S|\sOR\s/.test(String(q || ''));
  }

  function parseQuery(q) {
    var s = String(q || ''), toks = [], i = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (/\s/.test(c)) { i++; continue; }
      if (c === '(' || c === ')' || c === '|') { toks.push({ k: c }); i++; continue; }
      var neg = false;
      if (c === '-' && i + 1 < s.length && !/\s/.test(s.charAt(i + 1))) { neg = true; i++; c = s.charAt(i); }
      if (c === '(') { if (neg) toks.push({ k: 'neg' }); continue; }
      if (c === '"') {
        var j = s.indexOf('"', i + 1);
        if (j < 0) j = s.length;
        var ph = s.slice(i + 1, j).trim().toLowerCase();
        i = j + 1;
        if (ph) toks.push({ k: 'w', v: ph, phrase: true, neg: neg });
        continue;
      }
      var j2 = i;
      while (j2 < s.length && !/[\s()|"]/.test(s.charAt(j2))) j2++;
      var w = s.slice(i, j2);
      i = j2;
      if (!neg && w === 'OR') { toks.push({ k: '|' }); continue; }
      w = w.toLowerCase();
      var pre = w.length > 1 && w.charAt(w.length - 1) === '*';
      if (pre) w = w.replace(/\*+$/, '');
      if (w) toks.push({ k: 'w', v: w, prefix: pre, neg: neg });
    }
    var pos = 0;
    function peek() { return toks[pos]; }
    function orE() {
      var c2 = [andE()];
      while (peek() && peek().k === '|') { pos++; c2.push(andE()); }
      return c2.length === 1 ? c2[0] : { t: 'or', c: c2 };
    }
    function andE() {
      var c3 = [];
      while (peek() && peek().k !== ')' && peek().k !== '|') { var u = unary(); if (u) c3.push(u); }
      return c3.length === 1 ? c3[0] : { t: 'and', c: c3 };
    }
    function unary() {
      var tk = toks[pos++];
      if (!tk) return null;
      if (tk.k === 'neg') { var n = unary(); return n ? { t: 'not', c: n } : null; }
      if (tk.k === '(') { var e = orE(); if (peek() && peek().k === ')') pos++; return e; }
      if (tk.k === 'w') {
        var node = { t: 'w', v: tk.v, prefix: !!tk.prefix, phrase: !!tk.phrase };
        return tk.neg ? { t: 'not', c: node } : node;
      }
      return null;
    }
    var out = [];
    while (pos < toks.length) {
      var e2 = orE();
      if (e2 && !(e2.t === 'and' && !e2.c.length)) out.push(e2);
      if (peek() && peek().k === ')') pos++;
    }
    return out.length === 1 ? out[0] : { t: 'and', c: out };
  }

  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function evalQuery(n, hay) {
    if (!n) return true;
    if (n.t === 'and') return n.c.every(function (x) { return evalQuery(x, hay); });
    if (n.t === 'or') return n.c.some(function (x) { return evalQuery(x, hay); });
    if (n.t === 'not') return !evalQuery(n.c, hay);
    if (n.prefix) {
      if (!n.re) n.re = new RegExp('(^|[\\s.,;:!?()\\[\\]{}"\'/\\\\|@#_\\-·])' + escRe(n.v));
      return n.re.test(hay);
    }
    return hay.indexOf(n.v) >= 0;
  }

  /** คำที่ต้องมี (ไม่นับคำที่ขึ้นต้นด้วย -) ใช้ให้คะแนนว่าตรงที่ชื่องานไหม */
  function queryTerms(n, out) {
    out = out || [];
    if (!n || n.t === 'not') return out;
    if (n.t === 'w') out.push(n.v);
    else (n.c || []).forEach(function (x) { queryTerms(x, out); });
    return out;
  }

  /** ข้อความทั้งหมดของงานที่ค้นได้ — ชื่อ รายละเอียด แท็ก คน โปรเจกต์ รหัสงาน และค่าฟิลด์ข้อความ/ตัวเลือก */
  function searchHay(t, i) {
    var parts = [t.name, plainText(t.notes, true), (t.tags || []).join(' ')];
    var u = i.user[t.assigneeId];
    if (u) parts.push(u.name);
    /* Sprint 3 — ค้นเจอจากข้อความในความเห็นด้วย (คนมักจำว่า "มีคนพูดเรื่องนี้ในงานไหน" มากกว่าชื่องาน) */
    (i.storyByTask[t.id] || []).forEach(function (s) {
      if (s.type === 'comment' && s.text) parts.push(plainText(s.text, true));
    });
    (i.memByTask[rootOf(t).id] || []).forEach(function (m) {
      var p = i.project[m.projectId];
      if (p) parts.push(p.name);
    });
    var row = i.fvByTask[t.id] || {};
    Object.keys(row).forEach(function (fid) {
      var f = fieldDef(fid);
      if (!f || f.type === 'person' || f.type === 'date') return;
      parts.push(fieldText(f, row[fid].value));
    });
    return parts.join(' \n ').toLowerCase();
  }

  /**
   * ค้นหาขั้นสูง
   * @param o { q, conds: [{f, op, v}], limit }
   *   q      ข้อความค้นหา รองรับตัวดำเนินการ (hasOperators) — ไม่มีตัวดำเนินการ = ให้คะแนนแบบเดิม
   *   conds  เงื่อนไขชุดเดียวกับตัวกรองของโปรเจกต์ (filterFields('*'))
   * เห็นเฉพาะงานที่ canSeeTask — งานส่วนตัวของคนอื่นไม่หลุดมา
   */
  function searchAdv(o) {
    o = o || {};
    var q = String(o.q || '').trim();
    var conds = (o.conds || []).filter(function (c) { return c && c.f; });
    if (!q && !conds.length) return [];
    var i = index();
    var ops = q && hasOperators(q);
    var ast = ops ? parseQuery(q) : null;
    var ql = q.toLowerCase();
    var terms = ast ? queryTerms(ast) : [ql];
    var codeHits = {};
    if (q && /^[A-Za-z0-9]+-\d+$/.test(q)) findByCode(q).forEach(function (t) { codeHits[t.id] = true; });
    var hits = [];
    db.tasks.forEach(function (t) {
      var score = 1;
      if (q) {
        if (ast) {
          if (!evalQuery(ast, searchHay(t, i))) return;
          var nm = t.name.toLowerCase();
          score = terms.some(function (w) { return nm.indexOf(w) >= 0; }) ? 60 : 30;
        } else {
          var name = t.name.toLowerCase();
          score = 0;
          if (codeHits[t.id]) score = 95;
          else if (name === ql) score = 100;
          else if (name.indexOf(ql) === 0) score = 80;
          else if (name.indexOf(ql) >= 0) score = 60;
          if (!score && plainText(t.notes, true).toLowerCase().indexOf(ql) >= 0) score = 30;
          if (!score) {
            var u = i.user[t.assigneeId];
            if (u && u.name.toLowerCase().indexOf(ql) >= 0) score = 25;
          }
          if (!score && (t.tags || []).some(function (g) {
            return String(g).toLowerCase().indexOf(ql) >= 0;
          })) score = 22;
          if (!score && (i.memByTask[rootOf(t).id] || []).some(function (m) {
            var p = i.project[m.projectId];
            return p && p.name.toLowerCase().indexOf(ql) >= 0;
          })) score = 15;
          if (!score && searchHay(t, i).indexOf(ql) >= 0) score = 12;   // ค่าฟิลด์ รหัสงาน
          if (!score) return;
        }
      }
      for (var k = 0; k < conds.length; k++) {
        if (!matchCond(t, conds[k], null)) return;
      }
      if (!canSeeTask(t.id)) return;
      if (t.completed) score -= 40;
      hits.push({ t: t, s: score });
    });
    return hits
      .sort(function (a, b) {
        if (b.s !== a.s) return b.s - a.s;
        return (a.t.dueOn || '9999') < (b.t.dueOn || '9999') ? -1 : 1;
      })
      .slice(0, o.limit || 300)
      .map(function (x) { return x.t; });
  }

  /* ---------- การค้นหาที่บันทึกไว้ (ของแต่ละคน ใน db.personal) ---------- */

  function savedSearches() { return personalOf().searches || []; }
  function savedSearch(id) { return savedSearches().filter(function (s) { return s.id === id; })[0] || null; }

  function saveSearch(o) {
    if (!me()) return null;
    var st = personalOf();
    st.searches = st.searches || [];
    if (st.searches.length >= 50) return null;
    snapshot('บันทึกการค้นหา');
    var s = {
      id: uid('ss'), name: String(o.name || '').trim().slice(0, 60) || 'การค้นหา',
      q: String(o.q || '').slice(0, 300), conds: clone(o.conds || []),
      mode: o.mode === 'calendar' ? 'calendar' : 'list'
    };
    st.searches.push(s);
    commit();
    return s;
  }

  function updateSavedSearch(id, patch) {
    var s = savedSearch(id);
    if (!s) return false;
    snapshot('แก้การค้นหาที่บันทึกไว้');
    if (typeof patch.name === 'string' && patch.name.trim()) s.name = patch.name.trim().slice(0, 60);
    if (typeof patch.q === 'string') s.q = patch.q.slice(0, 300);
    if (Array.isArray(patch.conds)) s.conds = clone(patch.conds);
    if (patch.mode) s.mode = patch.mode === 'calendar' ? 'calendar' : 'list';
    commit();
    return true;
  }

  function deleteSavedSearch(id) {
    var st = personalOf();
    if (!savedSearch(id)) return false;
    snapshot('ลบการค้นหาที่บันทึกไว้');
    st.searches = st.searches.filter(function (s) { return s.id !== id; });
    commit();
    return true;
  }

  /* ---------- แท็ก ---------- */

  /** งานที่มีแท็กนี้และคนนี้เห็นได้ */
  function tagTasks(name) {
    return db.tasks.filter(function (t) {
      return (t.tags || []).indexOf(name) >= 0 && canSeeTask(t.id);
    });
  }

  /** เปลี่ยนชื่อแท็กทั้งองค์กร (รวมกฎอัตโนมัติที่เติมแท็กนี้) — ชื่อใหม่ที่มีอยู่แล้ว = รวมแท็ก */
  function renameTag(oldName, newName) {
    var nw = String(newName || '').trim().slice(0, 40);
    if (!oldName || !nw || nw === oldName) return 0;
    snapshot('เปลี่ยนชื่อแท็ก');
    var n = 0;
    db.tasks.forEach(function (t) {
      var k = (t.tags || []).indexOf(oldName);
      if (k < 0) return;
      t.tags.splice(k, 1);
      if (t.tags.indexOf(nw) < 0) t.tags.push(nw);
      n++;
    });
    autoActsEach(function (a) { if ((a.type === 'tag' || a.type === 'untag') && a.tag === oldName) a.tag = nw; });
    audit('tag.rename', oldName, '→ {t} ({n})', { t: nw, n: n });
    commit();
    return n;
  }

  function deleteTag(name) {
    if (!name) return 0;
    snapshot('ลบแท็ก');
    var n = 0;
    db.tasks.forEach(function (t) {
      var k = (t.tags || []).indexOf(name);
      if (k >= 0) { t.tags.splice(k, 1); n++; }
    });
    autoActsEach(function (a) { if ((a.type === 'tag' || a.type === 'untag') && a.tag === name) a.tag = ''; });
    audit('tag.delete', name, '{n} งาน', { n: n });
    commit();
    return n;
  }

  /* ---------- นำเข้า CSV แบบจับคู่คอลัมน์ ---------- */

  var CSV_TARGETS = [
    { id: 'ignore',        label: 'ไม่นำเข้า' },
    { id: 'name',          label: 'ชื่องาน',               names: ['Name', 'Task Name', 'Task', 'ชื่องาน', 'ชื่อ'] },
    { id: 'notes',         label: 'รายละเอียด',            names: ['Notes', 'Description', 'รายละเอียด'] },
    { id: 'section',       label: 'เซกชัน (เซกชัน)',       names: ['Section/Column', 'Section', 'Column', 'เซกชัน', 'เซกชัน'] },
    { id: 'assignee',      label: 'ผู้รับผิดชอบ',           names: ['Assignee', 'ผู้รับผิดชอบ'] },
    { id: 'assigneeEmail', label: 'อีเมลผู้รับผิดชอบ',       names: ['Assignee Email'] },
    { id: 'collaborators', label: 'ผู้ร่วมงาน (ผู้ติดตาม)', names: ['Collaborators', 'Followers', 'ผู้ติดตาม', 'ผู้ร่วมงาน'] },
    { id: 'start',         label: 'วันเริ่ม',               names: ['Start Date', 'วันเริ่ม'] },
    { id: 'due',           label: 'กำหนดส่ง',              names: ['Due Date', 'กำหนดส่ง'] },
    { id: 'priority',      label: 'ความสำคัญ',             names: ['Priority', 'ความสำคัญ'] },
    { id: 'type',          label: 'ชนิดงาน',               names: ['Type', 'ชนิดงาน'] },
    { id: 'tags',          label: 'แท็ก',                  names: ['Tags', 'แท็ก'] },
    { id: 'blockedBy',     label: 'รองาน (ถูกบล็อกโดย)',     names: ['Blocked By', 'Blocked By (Dependencies)', 'Dependencies', 'รองาน', 'ถูกบล็อกโดย'] },
    { id: 'dependents',    label: 'งานที่รองานนี้ (กำลังบล็อก)', names: ['Blocking (Dependents)', 'Dependents', 'Blocking', 'กำลังบล็อก'] },
    { id: 'parent',        label: 'เป็นงานย่อยของ',         names: ['Parent task', 'Parent Task', 'Parent', 'งานหลัก'] },
    { id: 'completed',     label: 'ทำเสร็จเมื่อ',            names: ['Completed At', 'ทำเสร็จเมื่อ'] }
  ];
  var CSV_NEW_TYPES = ['text', 'number', 'select', 'date'];

  /** ดูไฟล์ก่อนนำเข้า — หัวตาราง ตัวอย่างห้าแถว และการจับคู่ที่เดาให้ */
  function csvPreview(projectId, text) {
    var rows = parseCsv(text);
    if (!rows.length) throw new Error('ไฟล์ว่างหรือไม่มีบรรทัดข้อมูล');
    var head = rows[0];
    var p = project(projectId);
    var used = {};
    var guess = head.map(function (h) {
      var hl = String(h || '').trim().toLowerCase();
      if (!hl || hl === 'task id') return 'ignore';
      for (var k = 0; k < CSV_TARGETS.length; k++) {
        var c = CSV_TARGETS[k];
        if (c.names && !used[c.id] && c.names.some(function (n) { return n.toLowerCase() === hl; })) {
          used[c.id] = true;
          return c.id;
        }
      }
      var f = ((p && p.fields) || []).filter(function (x) {
        return x.type !== 'id' && x.name.trim().toLowerCase() === hl;
      })[0];
      return f ? 'field:' + f.id : 'ignore';
    });
    return { head: head, sample: rows.slice(1, 6), total: rows.length - 1, guess: guess };
  }

  /** วันที่จากไฟล์ — 2026-11-25, 2026/11/25, 25/11/2026 หรือ 25/11/2569 (พ.ศ.) */
  function csvDate(v) {
    var s = String(v || '').trim();
    var m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) {
      var y = +m[3];
      if (y > 2400) y -= 543;
      return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    }
    return null;
  }

  function csvList(v) {
    return String(v || '').split(/\s*[·,;]\s*/).map(function (x) {
      return x.replace(/\s*\((FS|SS|FF|SF)\)\s*$/, '').trim();
    }).filter(Boolean);
  }

  /**
   * นำเข้างานตามการจับคู่คอลัมน์
   * @param map  อาร์เรย์ยาวเท่าหัวตาราง ค่า = id ใน CSV_TARGETS | 'field:<id>' | 'new:<text|number|select|date>'
   * ทุกแถวเป็นงานใหม่ ไม่แตะงานเดิม งานหลัก/ลำดับก่อนหลังจับคู่จากชื่องาน (ในไฟล์ก่อน แล้วในโปรเจกต์)
   */
  function importTasksCsvMapped(projectId, text, map) {
    var p = project(projectId);
    if (!p) throw new Error('ไม่พบโปรเจกต์');
    /* Sprint 1B — นำเข้า = สร้างงานหลายงานในโปรเจกต์ ต้องผ่านด่านเดียวกับการเพิ่มงาน */
    if (!canCreateTask(projectId)) throw new Error('คุณไม่มีสิทธิ์เพิ่มงานในโปรเจกต์นี้');
    var rows = parseCsv(text);
    if (rows.length < 2) throw new Error('ไฟล์ว่างหรือไม่มีบรรทัดข้อมูล');
    var head = rows[0];
    map = map || [];
    var col = {};
    map.forEach(function (tgt, k) { if (tgt && tgt !== 'ignore' && !(tgt in col)) col[tgt] = k; });
    if (!('name' in col)) throw new Error('ต้องเลือกคอลัมน์ที่เป็นชื่องาน');
    var res = { tasks: 0, sections: 0, fields: 0, subtasks: 0, deps: 0 };

    batch('นำเข้างานจาก CSV', null, function () {
      var byName = {}, byMail = {};
      db.users.forEach(function (u) {
        byName[u.name.trim().toLowerCase()] = u.id;
        if (u.email) byMail[u.email.trim().toLowerCase()] = u.id;
      });
      function who(v) {
        var k = String(v || '').trim().toLowerCase();
        return k ? (byMail[k] || byName[k] || null) : null;
      }
      var secByName = {};
      p.sections.forEach(function (s) { secByName[s.name.trim().toLowerCase()] = s.id; });
      function cell(r, k) { return k >= 0 && r[k] != null ? String(r[k]).trim() : ''; }

      /* ฟิลด์ใหม่จากคอลัมน์ที่เลือก "สร้างฟิลด์ใหม่" — ตัวเลือกเดียวได้ตัวเลือกจากค่าที่ไม่ซ้ำในไฟล์ */
      var fieldCols = [];
      map.forEach(function (tgt, k) {
        if (!tgt) return;
        if (tgt.indexOf('new:') === 0) {
          var ty = tgt.slice(4);
          if (CSV_NEW_TYPES.indexOf(ty) < 0) ty = 'text';
          var opts = [];
          if (ty === 'select') {
            rows.slice(1).forEach(function (r) {
              var v = cell(r, k);
              if (v && opts.indexOf(v) < 0 && opts.length < 50) opts.push(v);
            });
          }
          var nf = normalizeFieldDef({ id: uid('f'), name: String(head[k] || 'ฟิลด์').trim().slice(0, 80) || 'ฟิลด์',
            type: ty, options: opts });
          if (ty === 'number') nf.format = null;
          p.fields.push(nf);
          res.fields++;
          fieldCols.push({ k: k, f: nf });
        } else if (tgt.indexOf('field:') === 0) {
          var ef = p.fields.filter(function (x) { return 'field:' + x.id === tgt; })[0];
          if (ef && ef.type !== 'id') fieldCols.push({ k: k, f: ef });
        }
      });

      var made = [];
      for (var r = 1; r < rows.length; r++) {
        var row = rows[r];
        var name = cell(row, col.name);
        if (!name) continue;
        var secId = p.sections[0].id;
        var secLabel = cell(row, col.section);
        if (secLabel) {
          var key = secLabel.toLowerCase();
          if (!secByName[key]) {
            var ns = { id: uid('s'), name: secLabel.slice(0, 120) };
            p.sections.push(ns);
            secByName[key] = ns.id;
            res.sections++;
          }
          secId = secByName[key];
        }
        var prio = cell(row, col.priority).toLowerCase();
        if (['urgent', 'high', 'medium', 'low'].indexOf(prio) < 0) prio = 'none';
        var type = cell(row, col.type).toLowerCase();
        if (['task', 'milestone', 'approval'].indexOf(type) < 0) type = 'task';
        var assignee = who(cell(row, col.assigneeEmail)) || who(cell(row, col.assignee));
        var fol = csvList(cell(row, col.collaborators)).map(who).filter(Boolean);
        var doneAt = csvDate(cell(row, col.completed));
        var t = blankTask({
          name: name.slice(0, 500), notes: cell(row, col.notes),
          assigneeId: assignee,
          startOn: csvDate(cell(row, col.start)), dueOn: csvDate(cell(row, col.due)),
          priority: prio, type: type,
          tags: csvList(cell(row, col.tags)),
          createdBy: db.currentUserId
        });
        fol.forEach(function (u) { if (t.followers.indexOf(u) < 0) t.followers.push(u); });
        if (doneAt) { t.completed = true; t.completedAt = doneAt; }
        db.tasks.push(t);
        db.memberships.push({ id: uid('m'), taskId: t.id, projectId: projectId, sectionId: secId,
          position: nextPosition(projectId, secId) });
        fieldCols.forEach(function (fc) {
          var raw = cell(row, fc.k);
          if (!raw) return;
          var f = fc.f, val = null;
          if (f.type === 'number') {
            var n = parseFloat(raw.replace(/[^\d.\-]/g, ''));
            val = isNaN(n) ? null : n;
          } else if (f.type === 'date') val = csvDate(raw);
          else if (f.type === 'person') val = who(raw);
          else if (f.type === 'select' || f.type === 'multi') {
            var picks = f.type === 'multi' ? csvList(raw) : [raw];
            picks = picks.map(function (x) {
              var o = f.options.filter(function (y) { return y.name.toLowerCase() === x.toLowerCase(); })[0];
              if (!o && f.options.length < 100) {
                o = { name: x.slice(0, 60), color: OPTION_COLORS[f.options.length % OPTION_COLORS.length] };
                f.options.push(o);
                propagateField(f);
              }
              return o ? o.name : null;
            }).filter(Boolean);
            val = f.type === 'multi' ? picks : (picks[0] || null);
          } else val = raw.slice(0, 1000);
          if (val !== null && !(Array.isArray(val) && !val.length)) {
            db.fieldValues.push({ taskId: t.id, fieldId: f.id, value: val });
          }
        });
        made.push({ t: t, row: row });
        res.tasks++;
      }

      /* งานหลักและลำดับก่อนหลัง — หาจากชื่อในไฟล์ก่อน ไม่เจอค่อยหาในโปรเจกต์ */
      var nameMap = {};
      tasksInProject(projectId).forEach(function (x) {
        var k2 = x.task.name.trim().toLowerCase();
        if (!nameMap[k2]) nameMap[k2] = x.task;
      });
      made.forEach(function (x) { nameMap[x.t.name.trim().toLowerCase()] = x.t; });
      function byTaskName(n) { return nameMap[String(n || '').trim().toLowerCase()] || null; }
      made.forEach(function (x) {
        var par = byTaskName(cell(x.row, col.parent));
        if (par && par.id !== x.t.id && !treeIds(x.t.id)[par.id]) {
          x.t.parentId = par.id;
          db.memberships = db.memberships.filter(function (m) { return m.taskId !== x.t.id; });
          res.subtasks++;
        }
        csvList(cell(x.row, col.blockedBy)).forEach(function (n) {
          var b = byTaskName(n);
          if (b && b.id !== x.t.id && !x.t.dependsOn.some(function (d) { return d.id === b.id; }) &&
              !dependsOnDeep(b.id, x.t.id)) {
            x.t.dependsOn.push({ id: b.id, type: 'FS' });
            res.deps++;
          }
        });
        csvList(cell(x.row, col.dependents)).forEach(function (n) {
          var d = byTaskName(n);
          if (d && d.id !== x.t.id && !d.dependsOn.some(function (y) { return y.id === x.t.id; }) &&
              !dependsOnDeep(x.t.id, d.id)) {
            d.dependsOn.push({ id: x.t.id, type: 'FS' });
            res.deps++;
          }
        });
      });
      /* 3b — งานหลักที่นำเข้า = งานเข้าโปรเจกต์ (อัตโนมัติ "added" รันตอน commit หลังใส่ค่าฟิลด์และงานหลักครบ) */
      made.forEach(function (x) { if (!x.t.parentId) notifyNewTask(x.t, projectId); });
      audit('project.import', p.name, 'นำเข้า {n} งาน', { n: res.tasks });
      res.ids = made.map(function (x) { return x.t.id; });       // ให้หน้าจอลงประวัติ "ให้ … เห็นงานนี้" ได้
    });
    return res;
  }

  /** คนที่ไฟล์ CSV จะมอบงานให้หรือใส่เป็นผู้ติดตาม (คอลัมน์ผู้รับผิดชอบ อีเมล ผู้ร่วมงาน)
   *  จับคู่ชื่อ/อีเมลแบบเดียวกับตอนนำเข้า — ใช้ถามก่อนนำเข้าโปรเจกต์ปิด ว่าใครจะได้เห็นงานทั้งที่ไม่ได้เป็นสมาชิก */
  function csvPeople(text, map) {
    var rows = parseCsv(text || ''), col = {}, out = [];
    (map || []).forEach(function (tgt, k) { if (tgt && tgt !== 'ignore' && !(tgt in col)) col[tgt] = k; });
    var byName = {}, byMail = {};
    db.users.forEach(function (u) {
      byName[u.name.trim().toLowerCase()] = u.id;
      if (u.email) byMail[u.email.trim().toLowerCase()] = u.id;
    });
    function who(v) {
      var k = String(v || '').trim().toLowerCase();
      return k ? (byMail[k] || byName[k] || null) : null;
    }
    rows.slice(1).forEach(function (r) {
      var cell = function (k) { return k >= 0 && r[k] != null ? String(r[k]).trim() : ''; };
      var a = who(cell(col.assigneeEmail)) || who(cell(col.assignee));
      if (a) out.push(a);
      csvList(cell(col.collaborators)).forEach(function (x) { var u = who(x); if (u) out.push(u); });
    });
    return out;
  }

  /* ---------- ส่งออกโปรเจกต์เป็น JSON และปฏิทิน .ics ---------- */

  /** โปรเจกต์เดียวพร้อมงาน งานย่อย ค่าฟิลด์ และความเห็น — ไม่รวมข้อมูลของโปรเจกต์อื่นหรือของส่วนตัว */
  function projectJson(projectId) {
    var p = project(projectId);
    if (!p) return '';
    var set = {};
    tasksInProject(projectId).forEach(function (x) { treeIds(x.task.id, set); });
    var tasks = db.tasks.filter(function (t) { return set[t.id]; });
    var people = {};
    tasks.forEach(function (t) {
      [t.assigneeId, t.createdBy].concat(t.followers || []).forEach(function (u) { if (u) people[u] = true; });
    });
    var pc = clone(p);
    delete pc.accessRequests;
    var out = {
      orbit: 'project', schema: SCHEMA, exportedAt: new Date().toISOString(),
      project: pc,
      memberships: clone(db.memberships.filter(function (m) { return m.projectId === projectId; })),
      tasks: clone(tasks),
      fieldValues: clone(db.fieldValues.filter(function (v) { return set[v.taskId]; })),
      comments: clone(db.stories.filter(function (s) { return set[s.taskId] && s.type === 'comment' && !s.deleted; })),
      users: Object.keys(people).map(function (id) {
        var u = user(id);
        return u ? { id: u.id, name: u.name, email: u.email || '' } : null;
      }).filter(Boolean)
    };
    audit('project.export', p.name, 'ส่งออก {n} งานเป็น JSON', { n: tasks.length });
    commit();
    return JSON.stringify(out, null, 2);
  }

  function icsEsc(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  /** ตัดบรรทัดที่ 75 ไบต์ตามมาตรฐาน RFC 5545 (นับไบต์ UTF-8 ภาษาไทยตัวละ 3 ไบต์) */
  function icsFold(line) {
    var out = '', bytes = 0;
    for (var k = 0; k < line.length; k++) {
      var ch = line.charAt(k);
      var code = line.charCodeAt(k);
      if (code >= 0xD800 && code <= 0xDBFF && k + 1 < line.length) { ch += line.charAt(++k); }
      var b = ch.length > 1 ? 4 : code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
      if (bytes + b > 73) { out += '\r\n '; bytes = 1; }
      out += ch;
      bytes += b;
    }
    return out;
  }

  /** ปฏิทิน .ics — งานที่ยังไม่เสร็จและมีวัน เป็นกิจกรรมทั้งวัน (วันเริ่มถึงกำหนดส่ง) */
  function icsText(tasks, calName, baseUrl) {
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    var L2 = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Orbit//Tasks//TH', 'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEsc(calName)];
    var n = 0;
    tasks.forEach(function (t) {
      if (t.completed || (!t.dueOn && !t.startOn) || !canSeeTask(t.id)) return;
      var a = t.startOn || t.dueOn, b = t.dueOn || t.startOn;
      if (b < a) { var tmp = a; a = b; b = tmp; }
      var desc = plainText(t.notes).slice(0, 800);
      if (baseUrl) desc = (desc ? desc + '\n\n' : '') + baseUrl + '#/task/' + t.id;
      L2.push('BEGIN:VEVENT', 'UID:' + t.id + '@orbit', 'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + a.replace(/-/g, ''),
        'DTEND;VALUE=DATE:' + addDays(b, 1).replace(/-/g, ''),
        'SUMMARY:' + icsEsc(t.name));
      if (desc) L2.push('DESCRIPTION:' + icsEsc(desc));
      if (baseUrl) L2.push('URL:' + baseUrl + '#/task/' + t.id);
      L2.push('END:VEVENT');
      n++;
    });
    L2.push('END:VCALENDAR');
    return { text: L2.map(icsFold).join('\r\n') + '\r\n', count: n };
  }

  function myTasksIcs(baseUrl) {
    var list = db.tasks.filter(function (t) { return t.assigneeId === db.currentUserId; });
    return icsText(list, L('งานของฉัน') + ' · Orbit', baseUrl);
  }

  function projectIcs(projectId, baseUrl) {
    var p = project(projectId);
    if (!p) return { text: '', count: 0 };
    var set = {};
    tasksInProject(projectId).forEach(function (x) { treeIds(x.task.id, set); });
    var res = icsText(db.tasks.filter(function (t) { return set[t.id]; }), p.name + ' · Orbit', baseUrl);
    audit('project.export', p.name, 'ส่งออกปฏิทิน .ics {n} งาน', { n: res.count });
    commit();
    return res;
  }

  /* ---------- บทบาทในโปรเจกต์ (ข้อความอิสระ ไม่ใช่สิทธิ์) ---------- */

  function projectRoles(projectId) {
    var p = project(projectId);
    if (!p || !p.roles) return [];
    return Object.keys(p.roles).map(function (id) { return { user: user(id), role: p.roles[id] }; })
      .filter(function (x) { return x.user && x.role; })
      .sort(function (a, b) { return a.user.name.localeCompare(b.user.name, 'th'); });
  }

  function setProjectRole(projectId, userId, text) {
    var p = project(projectId);
    if (!p || !user(userId)) return false;
    var r = String(text || '').trim().slice(0, 60);
    if ((p.roles[userId] || '') === r) return false;
    snapshot('ตั้งบทบาทในโปรเจกต์');
    if (r) p.roles[userId] = r; else delete p.roles[userId];
    commit();
    return true;
  }

  /* ---------- ขอสิทธิ์เข้าโปรเจกต์ปิด ----------
   * คนที่ได้ลิงก์โปรเจกต์ปิดมาแต่ไม่ได้เป็นสมาชิก กดขอสิทธิ์ได้ → เกิดงานมอบหมายให้เจ้าของโปรเจกต์
   * (ไม่มีเจ้าของ = ผู้ดูแลโปรเจกต์คนแรก แล้วค่อยผู้ดูแลระบบ) งานนี้เป็นงานส่วนตัว เห็นเฉพาะสองฝั่ง */
  function accessOwner(p) {
    var ok = function (id) { var u = user(id); return u && u.active !== false ? u : null; };
    if (p.owner && ok(p.owner)) return ok(p.owner);
    var adm = projectMembers(p.id).filter(function (m) { return m.access === 'admin' && ok(m.userId); })[0];
    if (adm) return ok(adm.userId);
    return db.users.filter(function (u) { return u.role === 'admin' && u.active !== false; })[0] || null;
  }

  /** คำขอที่ยังรอตอบของคนนี้ — คำขอแบบเก่า (เป็นงาน) ที่งานถูกลบไปแล้วถือว่าหมดอายุ ขอใหม่ได้ */
  function pendingRequest(projectId, userId) {
    var p = project(projectId);
    var r = p ? (p.accessRequests || []).filter(function (x) { return x.userId === (userId || db.currentUserId); })[0] || null : null;
    return r && (!r.taskId || task(r.taskId)) ? r : null;
  }

  /* Sprint 1B — คำขอสิทธิ์เป็นรายการในกล่องแจ้งเตือนของเจ้าของ (มีปุ่มให้สิทธิ์/ปฏิเสธในแถวนั้นเลย)
   * เดิมสร้างเป็นงานมอบหมายให้เจ้าของ ได้สองรายการในกล่องแจ้งเตือน (มอบหมาย + สร้างงาน)
   * ชื่องานติดภาษาของคนขอ และค้างอยู่ในงานของฉันของผู้ดูแล ปนกับงานจริง
   * ตอนนี้เก็บแค่ { userId, at, note } ที่โปรเจกต์ ข้อความแจ้งเก็บเป็นคีย์ แปลตามภาษาคนอ่าน */
  function requestAccess(projectId, note) {
    var p = project(projectId), u = me();
    if (!p || !u) return { ok: false, reason: 'ไม่พบโปรเจกต์' };
    if (projectAccess(projectId)) return { ok: false, reason: 'คุณเข้าโปรเจกต์นี้ได้อยู่แล้ว' };
    if (pendingRequest(projectId)) return { ok: false, reason: 'ส่งคำขอไปแล้ว รอเจ้าของโปรเจกต์ตอบ' };
    var owner = accessOwner(p);
    if (!owner) return { ok: false, reason: 'โปรเจกต์นี้ไม่มีเจ้าของให้ส่งคำขอ' };
    batch('ขอสิทธิ์เข้าโปรเจกต์', null, function () {
      var msg = String(note || '').trim().slice(0, 1000);
      p.accessRequests = (p.accessRequests || []).filter(function (r) { return r.userId !== u.id; });
      p.accessRequests.push({ userId: u.id, at: new Date().toISOString(), note: msg || null });
      /* แจ้งครั้งเดียว ชนิด access — ไม่ใช่ "มอบหมายงาน" จึงไม่ไปปนในตัวกรอง "มอบหมายให้ฉัน" */
      notifyOnly(null, [owner.id], 'ขอสิทธิ์เข้าโปรเจกต์ {p}', 'access', { p: p.name }, false,
        { projectId: p.id, route: 'p-overview' });
      audit('project.access-request', p.name, u.name);
    });
    return { ok: true, owner: owner };
  }

  /** คำขอจากรายการในกล่องแจ้งเตือน — ยังรอตอบอยู่และคนที่เปิดดูตอบได้ไหม */
  function accessRequestFor(n) {
    if (!n || n.kind !== 'access' || !n.projectId || !n.actorId) return null;
    var r = pendingRequest(n.projectId, n.actorId);
    var p = project(n.projectId);
    return r && p ? { project: p, userId: n.actorId, note: r.note || '', canAnswer: canAnswerAccess(p.id) } : null;
  }

  /** งานนี้เป็นคำขอเข้าโปรเจกต์ที่ยังไม่ได้ตอบไหม คืน { project, userId } */
  function accessRequestOf(taskId) {
    for (var k = 0; k < db.projects.length; k++) {
      var r = (db.projects[k].accessRequests || []).filter(function (x) { return x.taskId === taskId; })[0];
      if (r) return { project: db.projects[k], userId: r.userId };
    }
    return null;
  }

  function canAnswerAccess(projectId) {
    var p = project(projectId);
    return !!p && (can('manage') || canInProject(projectId, 'admin') || p.owner === db.currentUserId);
  }

  /** ตอบคำขอ — grant = เพิ่มเป็นสมาชิกสิทธิ์ access (ค่าเริ่มต้นแก้ไขได้) แล้วปิดงานคำขอ */
  function answerAccess(projectId, userId, grant, access) {
    var p = project(projectId);
    var r = pendingRequest(projectId, userId);
    if (!p || !r || !canAnswerAccess(projectId)) return false;
    batch(grant ? 'ให้สิทธิ์เข้าโปรเจกต์' : 'ปฏิเสธคำขอเข้าโปรเจกต์', null, function () {
      if (grant) {
        setProjectMember(projectId, userId, ACCESS_RANK[access] ? access : 'edit', true);
        audit('project.member', p.name, (user(userId) || {}).name + ' → ' + (access || 'edit'));
      }
      p.accessRequests = p.accessRequests.filter(function (x) { return x !== r; });
      var t = task(r.taskId);
      if (t && !t.completed) updateTask(t.id, { completed: true }, { quiet: true });
      if (t) log(t.id, grant ? 'ให้สิทธิ์เข้าโปรเจกต์แล้ว' : 'ปฏิเสธคำขอเข้าโปรเจกต์');
      /* Sprint 2B — ข้อความต่อท้ายชื่อคนตอบ ("สมชาย ให้สิทธิ์คุณเข้าโปรเจกต์ X แล้ว")
       * เดิม "สมชาย คุณได้รับสิทธิ์เข้าโปรเจกต์ X" มีประธานสองตัว อ่านแล้วงงว่าใครทำอะไร */
      notifyOnly(null, [userId], grant ? 'ให้สิทธิ์คุณเข้าโปรเจกต์ {p} แล้ว' : 'ปฏิเสธคำขอเข้าโปรเจกต์ {p} ของคุณ',
        'activity', { p: p.name }, false, grant ? { projectId: projectId, route: 'p-overview' } : null);
    });
    return true;
  }

  /* ---------- แปลงงานเป็นโปรเจกต์ ----------
   * ชื่องาน → ชื่อโปรเจกต์  ผู้รับผิดชอบ → เจ้าของ  ผู้ติดตาม → สมาชิก  งานย่อย → งานในโปรเจกต์
   * รายละเอียดของงานเป็นคำอธิบายโปรเจกต์ และสองฝั่งลิงก์หากัน งานเดิมยังอยู่ (ไม่ลบ) */
  function convertToProject(taskId) {
    var t = task(taskId);
    if (!t) return null;
    var homes = projectsOfTask(rootOf(t).id).map(function (x) { return x.project; });
    var secret = !homes.length || homes.some(function (h) { return h.visibility === 'private'; });
    return batch('แปลงงานเป็นโปรเจกต์', null, function () {
      var owner = t.assigneeId && user(t.assigneeId) ? t.assigneeId : db.currentUserId;
      var p = createProjectRaw({
        name: t.name, owner: owner, dueOn: t.dueOn || null,
        description: (t.notes ? t.notes + '\n\n' : '') +
          L('แปลงมาจากงาน') + ' @[' + refLabel(t.name) + '](' + t.id + ')'
      });
      p.visibility = secret ? 'private' : 'org';
      var people = [owner, db.currentUserId].concat(t.followers || []);
      people.forEach(function (u, k) {
        if (!user(u) || people.indexOf(u) !== k) return;
        setProjectMember(p.id, u, u === owner || u === db.currentUserId ? 'admin' : 'edit', true);
      });
      var pos = 1;
      subtasks(taskId).slice().forEach(function (s) {
        s.parentId = null;
        db.memberships.push({ id: uid('m'), taskId: s.id, projectId: p.id, sectionId: p.sections[0].id, position: pos++ });
        log(s.id, 'ย้ายมาอยู่ในโปรเจกต์ {p}', { p: p.name });
      });
      t.notes = (t.notes ? t.notes + '\n\n' : '') + L('แปลงเป็นโปรเจกต์') + ' @[' + refLabel(p.name) + '](' + p.id + ')';
      log(taskId, 'แปลงเป็นโปรเจกต์ {p}', { p: p.name });
      audit('project.create', p.name, 'แปลงจากงาน “{t}”', { t: t.name });
      return p;
    });
  }

  /* ---------- แก้หลายงานพร้อมกัน (ย้อนกลับได้ครั้งเดียว) ---------- */

  function rootsOnly(ids) {
    return (ids || []).filter(function (id) { var t = task(id); return t && !t.parentId; });
  }

  function bulkAddToProject(ids, projectId, sectionId) {
    var list = rootsOnly(ids);
    if (!project(projectId) || !list.length) return 0;
    if (!canCreateTask(projectId)) { denied('create'); return 0; }   // Sprint 1B — บอกครั้งเดียว ไม่ใช่ทีละงาน
    return batch('เพิ่ม {n} งานเข้าโปรเจกต์', { n: list.length }, function () {
      list.forEach(function (id) { addTaskToProject(id, projectId, sectionId); });
      return list.length;
    });
  }

  /* Sprint 3 — เลื่อนงานที่เลยกำหนดไปวันเดียวกันรวดเดียว (ประชุมรอบหน้า) และนับ "เลื่อนมาแล้ว N ครั้ง" ต่องาน
   * คนเห็นว่างานไหนถูกเลื่อนซ้ำ ๆ (≥3 ครั้งไฮไลต์) เรื่องที่ค้างเพราะไม่มีใครทำจริงจะไม่หายเงียบ ๆ
   * ย้อนกลับครั้งเดียว วันที่เปลี่ยนผ่าน updateTask จึงลงบันทึกของแต่ละงานตามปกติ */
  function slipOverdue(projectId, newDate) {
    if (!project(projectId) || !newDate || !can('write') || !canInProject(projectId, 'edit')) return 0;
    var t0 = today();
    var ids = tasksInProject(projectId).filter(function (x) {
      return !x.task.completed && x.task.dueOn && x.task.dueOn < t0;
    }).map(function (x) { return x.task.id; });
    if (!ids.length) return 0;
    return batch('เลื่อนงานเลยกำหนดไปรอบถัดไป', null, function () {
      ids.forEach(function (id) { updateTask(id, { dueOn: newDate, slips: (task(id).slips || 0) + 1 }); });
      return ids.length;
    });
  }

  function bulkMoveSection(ids, projectId, sectionId) {
    var s = section(projectId, sectionId);
    if (!s) return 0;
    var list = rootsOnly(ids).filter(function (id) {
      return db.memberships.some(function (m) { return m.taskId === id && m.projectId === projectId; });
    });
    if (!list.length) return 0;
    return batch('ย้าย {n} งาน', { n: list.length }, function () {
      list.forEach(function (id) { applyGroupValue(id, projectId, 'section', sectionId, null); });
      return list.length;
    });
  }

  function bulkSetField(ids, fieldId, value) {
    var f = fieldDef(fieldId);
    if (!f || f.type === 'id' || !ids.length) return 0;
    return batch('ตั้ง {f} ให้ {n} งาน', { f: f.name, n: ids.length }, function () {
      ids.forEach(function (id) { setFieldValue(id, fieldId, clone(value)); });
      return ids.length;
    });
  }

  function bulkAddFollowers(ids, userIds) {
    var people = (userIds || []).filter(function (u) { return !!user(u); });
    if (!people.length || !ids.length) return 0;
    return batch('เพิ่มผู้ติดตามให้ {n} งาน', { n: ids.length }, function () {
      ids.forEach(function (id) {
        var t = task(id);
        if (!t) return;
        people.forEach(function (u) {
          if (t.followers.indexOf(u) >= 0) return;
          t.followers.push(u);
          autoFire('follower', id, { user: u });
        });
      });
      return ids.length;
    });
  }

  function bulkAddTag(ids, tag) {
    var tg = String(tag || '').trim().slice(0, 40);
    if (!tg || !ids.length) return 0;
    return batch('เพิ่มแท็กให้ {n} งาน', { n: ids.length }, function () {
      ids.forEach(function (id) {
        var t = task(id);
        if (t && t.tags.indexOf(tg) < 0) updateTask(id, { tags: t.tags.concat([tg]) }, { quiet: true });
      });
      return ids.length;
    });
  }

  /** ทุกงานที่เลือกรองานนี้ — คืนจำนวนที่ผูกได้ (ข้ามที่จะวนลูป) */
  function bulkDependOn(ids, blockerId) {
    if (!task(blockerId)) return 0;
    var n = 0;
    batch('ตั้งให้ {n} งานรองานอื่น', { n: ids.length }, function () {
      ids.forEach(function (id) { if (addDependency(id, blockerId, 'FS')) n++; });
    });
    return n;
  }

  /** รวมงานที่เลือกเข้ากับงานหลักหนึ่งชิ้น */
  function bulkMerge(ids, masterId) {
    var n = 0;
    batch('รวมงานซ้ำ', null, function () {
      ids.forEach(function (id) { if (id !== masterId && mergeDuplicate(id, masterId)) n++; });
    });
    return n;
  }

  /* ======================================================================
   * 3a — อัตโนมัติ (Automations)
   *
   * อัตโนมัติหนึ่งตัว = ทริกเกอร์หนึ่งอัน + เส้นทางหลายเส้น (เงื่อนไข AND → การกระทำ) + เส้นทาง "อื่น ๆ"
   * เส้นทางแรกที่เงื่อนไขตรงครบได้ทำ ไม่ตรงสักเส้นและมี "อื่น ๆ" ก็ทำ "อื่น ๆ"
   *
   * ทุกจุดที่ข้อมูลเปลี่ยน (updateTask, setSectionRaw, setFieldRaw, notifyNewTask, addComment …)
   * เรียก autoFire() ใส่คิวไว้เฉย ๆ แล้ว commit() เป็นคนรันคิวก่อนบันทึก (drainAuto)
   * สิ่งที่คนกดกับสิ่งที่อัตโนมัติทำตามจึงย้อนกลับได้ครั้งเดียวและบันทึกครั้งเดียว
   *
   * กันวนไม่รู้จบ — การกระทำของอัตโนมัติปลุกอัตโนมัติอื่นได้เฉพาะตัวที่เปิด chain ไว้
   * ลึกได้ไม่เกิน 3 ชั้น และอัตโนมัติตัวเดิมรันกับงานเดิมได้ครั้งเดียวต่อหนึ่งการกด
   *
   * ทริกเกอร์ตามเวลา (ใกล้ครบกำหนด เลยกำหนด ตามกำหนดเวลา) ไม่มีเซิร์ฟเวอร์คอยปลุก
   * ตรวจเฉพาะตอนมีคนเปิดแอปอยู่ (autoTick จาก main.js) และจดคีย์ที่รันแล้วไว้ใน db.autoFired
   * ซึ่งซิงก์ไปทุกเครื่อง เครื่องอื่นที่ได้ข้อมูลชุดนั้นแล้วจะไม่รันซ้ำ
   *
   * เพิ่มทริกเกอร์/การกระทำใหม่ (เช่น 3b ฟอร์ม สถานะของชนิดงาน):
   *   S.autoRegister('trigger', { id, label, match(tr, ev, t) })  แล้วเรียก S.autoFire(id, taskId, info)
   *   S.autoRegister('action',  { id, label, task: true, run(act, ctx) })
   *   และเพิ่มช่องตั้งค่าใน autoTrigParams / autoActParams ของ main.js
   * ====================================================================== */

  var AUTO_RUNS_MAX = 200, AUTO_MAX_DEPTH = 3, AUTO_MAX_ACTS = 20, AUTO_MAX_PATHS = 5,
      AUTO_MAX_CONDS = 10, AUTO_MAX = 50, AUTO_MANUAL_MAX = 50, AUTO_TIME_CAP = 50, AUTO_FIRED_DAYS = 60;

  function dateIs(tr, ev) {
    var m = tr.mode || 'any';
    return m === 'any' || (m === 'set' ? !!ev.info.now : !ev.info.now);
  }
  function always() { return true; }

  /* time: ตรวจตามเวลา  manual: กดรันเอง  personal: ใช้ในงานของฉันได้ */
  var AUTO_TRIGGERS = [
    { id: 'added',       label: 'งานถูกเพิ่มเข้าโปรเจกต์', match: always },
    { id: 'moved',       label: 'งานถูกย้ายเข้าเซกชัน',
      match: function (tr, ev) { return !tr.sec || ev.info.sec === tr.sec; } },
    { id: 'completed',   label: 'งานทำเสร็จ / เปิดใหม่', personal: true,
      match: function (tr, ev) { return (tr.v !== false) === !!ev.info.v; } },
    { id: 'assignee',    label: 'ผู้รับผิดชอบเปลี่ยน',
      match: function (tr, ev) {
        return !tr.user || (tr.user === '@none' ? !ev.info.user : ev.info.user === tr.user);
      } },
    { id: 'due',         label: 'กำหนดส่งเปลี่ยน', match: dateIs },
    { id: 'start',       label: 'วันเริ่มเปลี่ยน', match: dateIs },
    { id: 'field',       label: 'ค่าฟิลด์เปลี่ยน',
      match: function (tr, ev) {
        if (!tr.field || ev.info.field !== tr.field) return false;
        if (tr.val == null || tr.val === '') return true;
        var v = ev.info.value;
        return Array.isArray(v) ? v.indexOf(tr.val) >= 0 : String(v) === String(tr.val);
      } },
    { id: 'comment',     label: 'มีความเห็นใหม่', match: always },
    { id: 'attachment',  label: 'มีไฟล์แนบใหม่', match: always },
    { id: 'follower',    label: 'มีผู้ติดตามเพิ่ม', match: always },
    { id: 'unblocked',   label: 'งานไม่ถูกบล็อกแล้ว', match: always },
    { id: 'approval',    label: 'สถานะอนุมัติเปลี่ยน',
      match: function (tr, ev) { return !tr.v || ev.info.v === tr.v; } },
    { id: 'approaching', label: 'ใกล้ครบกำหนด', time: true, personal: true },
    { id: 'overdue',     label: 'เลยกำหนด', time: true, personal: true },
    { id: 'manual',      label: 'กดรันเอง', manual: true },
    { id: 'scheduled',   label: 'ตามกำหนดเวลา', time: true }
  ];

  function trigDef(id) { return AUTO_TRIGGERS.filter(function (x) { return x.id === id; })[0] || null; }
  function actDef(id) { return AUTO_ACTIONS.filter(function (x) { return x.id === id; })[0] || null; }

  /** ข้อผิดพลาดที่แปลได้ — เก็บเป็นคีย์ภาษาไทย + ค่า ลงประวัติการรัน */
  function autoErr(key, params) {
    var e = new Error(fill(key, params));
    e.autoKey = key;
    e.params = params || null;
    return e;
  }

  /** ลิงก์ตรงไปที่งาน (ใช้ในตัวแปร {link}) */
  function taskUrl(id) {
    try { return global.location.origin + global.location.pathname + '#/task/' + id; }
    catch (e) { return '#/task/' + id; }
  }

  /** เลื่อนวันแบบนับวันปฏิทินหรือวันทำงาน (วันทำงาน = ตามโปรเจกต์ ถ้าโปรเจกต์ไม่มีวันหยุดใช้ จ.–ศ.) */
  function shiftDate(base, n, unit, mode) {
    if (unit !== 'workdays') return addDays(base, n);
    var m = mode && mode !== 'all' ? mode : 'mon-fri';
    if (!n) return nextWorkday(base, m);
    var d = base, step = n < 0 ? -1 : 1, left = Math.abs(n), guard = 0;
    while (left > 0 && guard++ < 10000) {
      d = addDays(d, step);
      if (isWorkday(d, m)) left--;
    }
    return d;
  }

  /* ตัวแปรในข้อความ — {task} {link} {assignee} {creator} {triggerer} {due} {start} {created}
   * {project} {section} {field:ชื่อฟิลด์} แทนค่าตอนรัน แล้วเก็บเป็นข้อความธรรมดา */
  var AUTO_VARS = ['task', 'link', 'assignee', 'creator', 'triggerer', 'due', 'start', 'created',
                   'project', 'section'];

  function autoVars(text, ctx, md) {
    var t = ctx.t, p = ctx.p;
    function nm(id) { var u = user(id); return u ? u.name : ''; }
    return String(text || '').replace(/\{([a-z]+)(?::([^{}\n]{1,80}))?\}/g, function (all, k, arg) {
      switch (k) {
        case 'task':      return t ? t.name : '';
        case 'link':      return !t ? '' : md ? '@[' + refLabel(t.name) + '](' + t.id + ')' : taskUrl(t.id);
        case 'assignee':  return t ? nm(t.assigneeId) : '';
        case 'creator':   return t ? nm(t.createdBy) : '';
        case 'triggerer': return nm(ctx.ev && ctx.ev.by);
        case 'due':       return (t && t.dueOn) || '';
        case 'start':     return (t && t.startOn) || '';
        case 'created':   return t && t.createdAt ? String(t.createdAt).slice(0, 10) : '';
        case 'project':   return p ? p.name : '';
        case 'section': {
          var s = p && ctx.m ? section(p.id, ctx.m.sectionId) : null;
          return s ? s.name : '';
        }
        case 'field': {
          if (!t || !arg) return '';
          var want = arg.trim().toLowerCase();
          var f = ((p && p.fields) || []).filter(function (x) {
            return x.id === arg.trim() || String(x.name).toLowerCase() === want;
          })[0];
          if (!f) return '';
          var v = fieldValue(t.id, f.id);
          if (v === null || v === undefined || v === '') return '';
          if (f.type === 'person') return nm(v);
          if (f.type === 'number') return formatNumber(f, v);
          if (f.type === 'id') return fieldText(f, v);
          return [].concat(v).join(', ');
        }
      }
      return all;
    });
  }

  /** วันจากสเปกแบบสัมพัทธ์ { n, unit: days|workdays, dir: after|before, from } */
  function autoDate(spec, ctx) {
    var t = ctx.t, from = spec.from || 'trigger', base = null;
    if (from === 'trigger') base = today();
    else if (from === 'created') base = t && t.createdAt ? String(t.createdAt).slice(0, 10) : null;
    else if (from === 'due') base = t && t.dueOn;
    else if (from === 'start') base = t && t.startOn;
    else if (from.indexOf('field:') === 0 && t) {
      var fv = fieldValue(t.id, from.slice(6));
      base = typeof fv === 'string' && /^\d{4}-\d\d-\d\d/.test(fv) ? fv.slice(0, 10) : null;
    }
    if (!base) throw autoErr('ไม่มีวันตั้งต้นให้นับ');
    var n = Math.max(0, Math.min(3650, parseInt(spec.n, 10) || 0)) * (spec.dir === 'before' ? -1 : 1);
    return shiftDate(base, n, spec.unit, ctx.p && ctx.p.workDays);
  }

  /** หมุนเวียนรายชื่อ — ข้ามคนที่ปิดบัญชีหรือตั้งสถานะไม่อยู่ครอบวันนี้ จำตำแหน่งไว้ที่ act.ptr */
  function roundRobin(act) {
    var list = (act.list || []).filter(function (u) { var x = user(u); return x && x.active !== false; });
    if (!list.length) throw autoErr('ยังไม่ได้เลือกคนในรายการหมุนเวียน');
    var start = (parseInt(act.ptr, 10) || 0) % list.length;
    for (var k = 0; k < list.length; k++) {
      var i = (start + k) % list.length;
      if (!isAway(list[i])) { act.ptr = i + 1; return list[i]; }
    }
    throw autoErr('ทุกคนในรายการหมุนเวียนไม่อยู่');
  }

  /** คนจากสเปก { mode: user|var|rr|none, user, var, list } */
  function autoUser(spec, ctx) {
    var mode = spec.mode || 'user', t = ctx.t;
    if (mode === 'none') return null;
    if (mode === 'rr') return roundRobin(spec);
    var id = null;
    if (mode === 'var') {
      var v = spec['var'] || '';
      if (v === 'creator') id = t && t.createdBy;
      else if (v === 'triggerer') id = ctx.ev && ctx.ev.by;
      else if (v === 'assignee') id = t && t.assigneeId;
      else if (v.indexOf('field:') === 0 && t) id = fieldValue(t.id, v.slice(6));
    } else id = spec.user;
    var u = id ? user(id) : null;
    if (!u || u.active === false) throw autoErr('ไม่พบคนที่จะมอบหมาย');
    return u.id;
  }

  function needTask(ctx) { if (!ctx.t || !task(ctx.t.id)) throw autoErr('ไม่มีงานให้ทำ'); return ctx.t; }

  /* คนจาก "ตัวแปร" (คนสร้างงาน คนที่ทำให้ทำงาน ผู้รับผิดชอบเดิม ฟิลด์คน) รู้ตัวตอนรันเท่านั้น คนตั้งกฎไม่เคยถูกถาม
   * (ต่างจากคนที่ระบุชื่อ ซึ่งถามไปแล้วตอนบันทึกกฎ) ถ้าเขาจะได้เห็นงานในโปรเจกต์ (ปิด) ที่ไม่ได้เป็นสมาชิก
   * ห้ามเปิดให้เห็นเงียบ ๆ — โยนข้อผิดพลาดที่แปลได้ autoRun จะข้ามการกระทำนี้ ลงเหตุผลในประวัติการรัน
   * แล้วทำการกระทำที่เหลือในกฎต่อตามปกติ */
  function autoGuard(taskIds, who, key) {
    var r = revealOutsiders(taskIds, [who]);
    if (r.users.length) throw autoErr(key, { who: r.users[0].name, p: r.projects[0] ? r.projects[0].name : '' });
  }

  var AUTO_ACTIONS = [
    { id: 'section', label: 'ย้ายไปเซกชัน', task: true, run: function (a, ctx) {
      var t = needTask(ctx), p = ctx.p;
      var m = p && db.memberships.filter(function (x) { return x.taskId === t.id && x.projectId === p.id; })[0];
      if (!m) throw autoErr('งานไม่ได้อยู่ในโปรเจกต์นี้');
      if (!section(p.id, a.sec)) throw autoErr('เซกชันปลายทางถูกลบไปแล้ว');
      if (m.sectionId !== a.sec) setSectionRaw(m, a.sec, nextPosition(p.id, a.sec));
    } },
    { id: 'complete', label: 'ทำเครื่องหมายเสร็จ / เปิดใหม่', task: true, run: function (a, ctx) {
      var t = needTask(ctx), v = a.v !== false;
      if (!!t.completed !== v) updateTask(t.id, { completed: v }, { quiet: true });
    } },
    { id: 'assign', label: 'มอบหมายให้', task: true, run: function (a, ctx) {
      var t = needTask(ctx), who = autoUser(a, ctx);
      if (who && (a.mode || 'user') === 'var') autoGuard([t.id], who, 'ข้ามการมอบงาน: {who} ไม่ได้เป็นสมาชิกของ “{p}” จึงไม่เปิดให้เห็นงานนี้');
      if ((t.assigneeId || null) !== who) updateTask(t.id, { assigneeId: who }, { quiet: true });
    } },
    { id: 'due', label: 'ตั้งกำหนดส่ง', task: true, run: function (a, ctx) {
      var t = needTask(ctx), d = a.mode === 'clear' ? null : autoDate(a, ctx);
      if ((t.dueOn || null) !== d) updateTask(t.id, { dueOn: d }, { quiet: true });
    } },
    { id: 'start', label: 'ตั้งวันเริ่ม', task: true, run: function (a, ctx) {
      var t = needTask(ctx), d = a.mode === 'clear' ? null : autoDate(a, ctx);
      if ((t.startOn || null) !== d) updateTask(t.id, { startOn: d }, { quiet: true });
    } },
    { id: 'field', label: 'ตั้งค่าฟิลด์', task: true, run: function (a, ctx) {
      var t = needTask(ctx), p = ctx.p;
      var f = p && (p.fields || []).filter(function (x) { return x.id === a.field; })[0];
      if (!f || f.type === 'id') throw autoErr('ฟิลด์นี้ถูกลบไปแล้ว');
      var v = a.value;
      if (f.type === 'text') v = autoVars(v, ctx).slice(0, 2000);
      else if (f.type === 'number') {
        v = v === '' || v === null || v === undefined ? null : Number(v);
        if (v !== null && isNaN(v)) throw autoErr('ค่าตัวเลขไม่ถูกต้อง');
      } else if (f.type === 'select') {
        if (v && !(f.options || []).some(function (o) { return o.name === v; })) {
          throw autoErr('ตัวเลือก “{v}” ถูกลบไปแล้ว', { v: v });
        }
        v = v || null;
      } else if (f.type === 'multi') {
        v = [].concat(v || []).filter(function (x) {
          return (f.options || []).some(function (o) { return o.name === x; });
        });
      } else if (f.type === 'person') {
        v = a.mode === 'none' ? null : autoUser({ mode: a.mode || 'user', user: v, 'var': a['var'] }, ctx);
      } else if (f.type === 'date') {
        v = a.mode === 'clear' ? null : autoDate(a, ctx);
      }
      setFieldRaw(t.id, f.id, v);
    } },
    { id: 'comment', label: 'เพิ่มความเห็น', task: true, run: function (a, ctx) {
      var t = needTask(ctx), txt = autoVars(a.text, ctx, true).trim();
      if (!txt) throw autoErr('ข้อความว่าง');
      addComment(t.id, txt.slice(0, 5000));
    } },
    { id: 'followers', label: 'เพิ่มผู้ติดตาม', task: true, run: function (a, ctx) {
      var t = needTask(ctx), people = (a.users || []).slice(), skipped = null;
      (a.vars || []).forEach(function (v) {
        var id = v === 'creator' ? t.createdBy : v === 'triggerer' ? ctx.ev.by : v === 'assignee' ? t.assigneeId : null;
        if (!id) return;
        /* คนจากตัวแปรที่ไม่ได้เป็นสมาชิกโปรเจกต์ (ปิด) — ไม่เพิ่ม คนอื่นยังเพิ่มตามปกติ แล้วบอกในประวัติการรัน */
        var r = revealOutsiders([t.id], [id]);
        if (r.users.length) { skipped = skipped || r; return; }
        people.push(id);
      });
      people.forEach(function (u) {
        if (!user(u) || t.followers.indexOf(u) >= 0) return;
        t.followers.push(u);
        autoFire('follower', t.id, { user: u });
      });
      if (skipped) throw autoErr('ไม่ได้เพิ่ม {who} เป็นผู้ติดตาม: ไม่ได้เป็นสมาชิกของ “{p}”',
        { who: skipped.users[0].name, p: skipped.projects[0] ? skipped.projects[0].name : '' });
    } },
    { id: 'tag', label: 'เพิ่มแท็ก', task: true, run: function (a, ctx) {
      var t = needTask(ctx), tg = String(a.tag || '').trim().slice(0, 40);
      if (!tg) throw autoErr('ยังไม่ได้ใส่แท็ก');
      if (t.tags.indexOf(tg) < 0) updateTask(t.id, { tags: t.tags.concat([tg]) }, { quiet: true });
    } },
    { id: 'untag', label: 'เอาแท็กออก', task: true, run: function (a, ctx) {
      var t = needTask(ctx), tg = String(a.tag || '').trim();
      if (t.tags.indexOf(tg) >= 0) updateTask(t.id, { tags: t.tags.filter(function (x) { return x !== tg; }) }, { quiet: true });
    } },
    { id: 'priority', label: 'ตั้งความสำคัญ', task: true, run: function (a, ctx) {
      var t = needTask(ctx), v = PRIORITIES.some(function (x) { return x.id === a.v; }) ? a.v : 'none';
      if (t.priority !== v) updateTask(t.id, { priority: v }, { quiet: true });
    } },
    { id: 'create', label: 'สร้างงาน / งานย่อย / ขออนุมัติ', task: false, run: function (a, ctx) {
      var kind = a.kind || 'task', t = ctx.t, p = ctx.p;
      var name = autoVars(a.name, ctx).replace(/\s+/g, ' ').trim().slice(0, 300) || 'งานใหม่';
      var attrs = { name: name, notes: autoVars(a.notes || '', ctx, true).slice(0, 20000),
                    type: kind === 'approval' ? 'approval' : 'task' };
      if (a.assign && a.assign.mode && a.assign.mode !== 'none') attrs.assigneeId = autoUser(a.assign, ctx);
      if (a.due && a.due.on) attrs.dueOn = autoDate(a.due, ctx);
      /* ผู้รับผิดชอบจากตัวแปรที่ไม่ได้เป็นสมาชิกโปรเจกต์ (ปิด) — สร้างงานต่อแต่ไม่มอบให้เขา แล้วบอกในประวัติการรัน */
      var hidden = null;
      if (attrs.assigneeId && a.assign.mode === 'var') {
        var hr = kind === 'task' ? outsidersOf(p && p.id, [attrs.assigneeId]) : (t ? revealOutsiders([t.id], [attrs.assigneeId]) : null);
        if (hr && hr.users.length) { hidden = hr; attrs.assigneeId = null; }
      }
      var c;
      if (kind === 'task') {
        if (!p) throw autoErr('ไม่มีโปรเจกต์ให้สร้างงาน');
        var sec = section(p.id, a.sec) ? a.sec : (ctx.m && section(p.id, ctx.m.sectionId) ? ctx.m.sectionId : p.sections[0].id);
        c = createTaskRaw(attrs, p.id, sec);
      } else {
        needTask(ctx);
        attrs.parentId = t.id;
        c = createTaskRaw(attrs, null, null);
      }
      if (attrs.assigneeId && c.followers.indexOf(attrs.assigneeId) < 0) c.followers.push(attrs.assigneeId);
      if (hidden) throw autoErr('สร้างงานแล้วแต่ไม่ได้มอบให้ {who}: ไม่ได้เป็นสมาชิกของ “{p}”',
        { who: hidden.users[0].name, p: hidden.projects[0] ? hidden.projects[0].name : '' });
    } },
    { id: 'addproj', label: 'เพิ่มเข้าโปรเจกต์อื่น', task: true, run: function (a, ctx) {
      var t = needTask(ctx), q = project(a.pid);
      if (!q || q.archived) throw autoErr('โปรเจกต์ปลายทางถูกลบหรือเก็บเข้าคลังแล้ว');
      if (t.parentId) throw autoErr('งานย่อยเพิ่มเข้าโปรเจกต์ไม่ได้');
      var have = db.memberships.filter(function (m) { return m.taskId === t.id && m.projectId === q.id; })[0];
      if (have) {
        if (a.sec && section(q.id, a.sec) && have.sectionId !== a.sec) setSectionRaw(have, a.sec, nextPosition(q.id, a.sec));
        return;
      }
      /* คู่กรณีของงานที่ไม่ได้เป็นสมาชิกโปรเจกต์ปลายทาง (ปิด) จะเห็นทุกอย่างที่คุยกันในงานนั้นต่อ — ไม่มีคนกดให้ถาม
       * จึงไม่เพิ่ม แล้วบอกเหตุผลในประวัติการรัน (คนตั้งกฎเพิ่มเขาเป็นสมาชิกก่อน แล้วกฎจะทำงานรอบถัดไป) */
      var jr = joinOutsiders([t.id], q.id);
      if (jr.users.length) throw autoErr('ไม่ได้เพิ่มเข้า “{p}”: {who} (ผู้รับผิดชอบ/ผู้ติดตามของงาน) ไม่ได้เป็นสมาชิกของโปรเจกต์นี้',
        { p: q.name, who: jr.users.map(function (u) { return u.name; }).join(', ') });
      addTaskToProject(t.id, q.id, section(q.id, a.sec) ? a.sec : null);
    } },
    /* เฉพาะงานของฉัน — ย้ายเซกชันส่วนตัวของเจ้าของ ไม่แตะจุดสีฟ้า */
    { id: 'mtmove', label: 'ย้ายไปเซกชันในงานของฉัน', task: true, personal: true, run: function (a, ctx) {
      var t = needTask(ctx);
      if (t.assigneeId !== db.currentUserId) throw autoErr('งานนี้ไม่ได้มอบหมายให้คุณแล้ว');
      var st = personalOf(), seen = st.mt.seen[t.id];
      if (mtSectionOf(t) === a.sec) return;
      if (!mtMove(t.id, a.sec)) throw autoErr('เซกชันปลายทางถูกลบไปแล้ว');
      if (seen === undefined) delete st.mt.seen[t.id]; else st.mt.seen[t.id] = seen;
    } }
  ];

  /** ลงทะเบียนทริกเกอร์หรือการกระทำใหม่ (ชิ้นงานถัดไป) — id ซ้ำ = แทนของเดิม */
  function autoRegister(kind, def) {
    var list = kind === 'action' ? AUTO_ACTIONS : AUTO_TRIGGERS;
    if (!def || !def.id) return false;
    for (var i = 0; i < list.length; i++) if (list[i].id === def.id) { list[i] = def; return true; }
    list.push(def);
    return true;
  }

  /** ปลุกอัตโนมัติ — ใส่คิวไว้ commit() เป็นคนรัน (info.projectId จำกัดโปรเจกต์ info.only จำกัดตัวอัตโนมัติ) */
  function autoFire(type, taskId, info) {
    if (!db) return;
    info = info || {};
    autoQueue.push({
      type: type, taskId: taskId || null, info: info, projectId: info.projectId || null,
      only: info.only || null, personal: !!info.personal,
      depth: autoCtx ? autoCtx.depth + 1 : 0, by: db.currentUserId
    });
  }

  function drainAuto() {
    autoDraining = true;
    batchDepth++;
    var ran = {}, guard = 0;
    try {
      while (autoQueue.length && guard++ < 1000) {
        var ev = autoQueue.shift();
        try { autoProcess(ev, ran); } catch (e) { console.error('อัตโนมัติทำงานผิดพลาด', e); }
      }
      autoQueue.length = 0;
    } finally {
      autoCtx = null;
      batchDepth--;
      autoDraining = false;
      dropIndex();
    }
  }

  function autoProcess(ev, ran) {
    var t = ev.taskId ? task(ev.taskId) : null;
    if (ev.taskId && !t) return;
    if (ev.personal) {
      var pa = (personalOf().auto || []).filter(function (a) { return a.id === ev.only; })[0];
      if (pa) autoConsider(pa, null, t, ev, ran);
      return;
    }
    var pids = ev.projectId ? [ev.projectId]
      : t ? (index().memByTask[t.id] || []).map(function (m) { return m.projectId; }) : [];
    pids.forEach(function (pid) {
      var p = project(pid);
      if (!p || p.archived) return;
      (p.automations || []).slice().forEach(function (a) { autoConsider(a, p, t, ev, ran); });
    });
    /* งานของฉัน "ทำเสร็จ → ย้าย" ของเจ้าของงานที่กำลังเปิดแอป (เครื่องอื่นตามทันตอน autoTick) */
    if (ev.type === 'completed' && ev.info.v && t && t.assigneeId === db.currentUserId && !ev.only) {
      (personalOf().auto || []).forEach(function (a) {
        if (!a.on || a.trigger.type !== 'completed') return;
        var key = 'mtc:' + a.id + ':' + t.id;
        if (db.autoFired && db.autoFired[key]) return;
        if (!db.autoFired) db.autoFired = {};
        db.autoFired[key] = today();
        autoConsider(a, null, t, { type: 'completed', taskId: t.id, info: ev.info, only: a.id,
          depth: ev.depth, by: ev.by, personal: true }, ran);
      });
    }
  }

  function autoConsider(a, p, t, ev, ran) {
    if (!a || !a.on || !a.trigger) return;
    if (ev.only) {
      if (a.id !== ev.only) return;
    } else {
      var def = trigDef(a.trigger.type);
      if (!def || def.time || def.manual || a.trigger.type !== ev.type) return;
      if (def.match && !def.match(a.trigger, ev, t)) return;
      if (ev.depth > 0 && !a.chain) return;           // การกระทำของอัตโนมัติอื่นปลุกได้เฉพาะตัวที่ยอม
    }
    var key = a.id + ':' + (t ? t.id : '');
    if (ev.depth >= AUTO_MAX_DEPTH || (ev.depth > 0 && ran[key])) {
      autoLog(p, a, t, ev, 'loop', 0, autoErr('หยุดไว้เพื่อกันการวนไม่รู้จบ'), null);
      return;
    }
    ran[key] = true;
    autoRun(a, p, t, ev);
  }

  /** เลือกเส้นทาง แล้วทำการกระทำทีละอัน — อันไหนพังลงประวัติ อันที่เหลือยังทำต่อ */
  function autoRun(a, p, t, ev) {
    var m = t && p ? db.memberships.filter(function (x) { return x.taskId === t.id && x.projectId === p.id; })[0] : null;
    var acts = null, pathIdx = null;
    var paths = a.paths || [];
    for (var i = 0; i < paths.length; i++) {
      var conds = paths[i].conds || [];
      if (!t && conds.length) continue;
      if (conds.every(function (c) { return matchCond(t, c, m); })) { acts = paths[i].acts || []; pathIdx = i; break; }
    }
    if (!acts && a.els) { acts = a.els; pathIdx = -1; }
    if (!acts) return false;                       // ไม่ตรงเงื่อนไข ไม่ถือเป็นการรัน
    var prev = autoCtx;
    autoCtx = { depth: ev.depth, a: a, p: p, t: t, m: m, ev: ev };
    var done = 0, err = null;
    acts.slice(0, AUTO_MAX_ACTS).forEach(function (act) {
      try {
        var def = actDef(act.type);
        if (!def) throw autoErr('การกระทำนี้ใช้ไม่ได้แล้ว');
        if (def.task && !t) throw autoErr('ไม่มีงานให้ทำ');
        if (!p && !def.personal) throw autoErr('การกระทำนี้ใช้ในงานของฉันไม่ได้');
        def.run(act, autoCtx);
        done++;
      } catch (e) {
        if (!err) err = e && e.autoKey ? e : autoErr('ทำไม่สำเร็จ: {m}', { m: String((e && e.message) || e).slice(0, 80) });
        if (!(e && e.autoKey)) console.error('อัตโนมัติทำไม่สำเร็จ', e);
      }
    });
    autoCtx = prev;
    autoLog(p, a, t, ev, err ? 'err' : 'ok', done, err, pathIdx);
    return true;
  }

  /** ประวัติการรัน — สั้นที่สุดเท่าที่อ่านรู้เรื่อง เก็บ 200 ครั้งล่าสุดต่อโปรเจกต์ (งานของฉัน 50) */
  function autoLog(p, a, t, ev, s, n, err, path) {
    var list = p ? (p.autoRuns = p.autoRuns || []) : personalOf().autoRuns;
    list.push({
      at: new Date().toISOString(), a: a.id, an: (a.name || '').slice(0, 60),
      t: t ? t.id : null, tn: t ? String(t.name).slice(0, 60) : null,
      s: s, n: n, e: err ? err.autoKey : null, ep: err ? err.params : null,
      by: ev.by || null, tr: ev.type, p: path
    });
    var max = p ? AUTO_RUNS_MAX : 50;
    if (list.length > max) list.splice(0, list.length - max);
  }

  /* ---------- อัตโนมัติตามเวลา ---------- */

  function timeHit(tr, t, now, td) {
    if (tr.type === 'approaching') {
      var days = Math.max(0, Math.min(365, parseInt(tr.days, 10)));
      if (isNaN(days)) days = 1;
      return t.dueOn >= td && t.dueOn <= addDays(td, days);
    }
    if (tr.type === 'overdue') {
      var n = Math.max(0, Math.min(8760, parseInt(tr.n, 10) || 0));
      var unit = tr.unit === 'hours' ? 3600000 : 86400000;
      var dueMs = new Date(t.dueOn + 'T' + (t.dueTime || '23:59') + ':59').getTime();
      return now >= dueMs + n * unit;
    }
    return false;
  }

  /** คีย์ของรอบตามกำหนดเวลาที่ถึงแล้ว (null = ยังไม่ถึง) — วันที่พลาดไปเพราะไม่มีใครเปิดแอปจะรันตามหลังในรอบเดียวกัน */
  function schedKey(a, td) {
    var tr = a.trigger, created = a.at ? String(a.at).slice(0, 10) : '0000-00-00', fire, period;
    if (tr.freq === 'weekly') {
      var dow = new Date(td + 'T00:00:00').getDay(), mi = (dow + 6) % 7;
      var want = ((parseInt(tr.day, 10) || 0) + 6) % 7;
      period = addDays(td, -mi);
      fire = addDays(period, want);
    } else if (tr.freq === 'monthly') {
      var y = +td.slice(0, 4), mo = +td.slice(5, 7);
      var last = new Date(y, mo, 0).getDate();
      var dd = Math.min(Math.max(1, parseInt(tr.day, 10) || 1), last);
      period = td.slice(0, 7);
      fire = period + '-' + (dd < 10 ? '0' : '') + dd;
    } else {
      period = fire = td;
    }
    if (td < fire || fire < created) return null;
    return 'sch:' + a.id + ':' + period;
  }

  /**
   * ตรวจอัตโนมัติตามเวลา — main.js เรียกตอนเปิดแอป ทุก 5 นาที และหลังรับข้อมูลจากส่วนกลาง
   * @param opts.now  มิลลิวินาทีแทนเวลาจริง (ทดสอบ "เลยกำหนด N ชั่วโมง")
   * @returns จำนวนการรันที่ปลุก
   */
  function autoTick(opts) {
    if (!db || !isActive()) return 0;
    var now = (opts && opts.now) || Date.now(), td = today();
    var fired = db.autoFired || {};
    var out = [];
    db.projects.forEach(function (p) {
      if (p.archived) return;
      (p.automations || []).forEach(function (a) {
        if (!a.on || !a.trigger) return;
        var ty = a.trigger.type;
        if (ty === 'approaching' || ty === 'overdue') {
          var n = 0;
          tasksInProject(p.id).forEach(function (x) {
            var t = x.task;
            if (n >= AUTO_TIME_CAP || t.completed || !t.dueOn || !timeHit(a.trigger, t, now, td)) return;
            var key = (ty === 'approaching' ? 'apr:' : 'ovd:') + a.id + ':' + t.id + ':' + t.dueOn;
            if (fired[key]) return;
            n++;
            out.push({ key: key, type: ty, taskId: t.id, info: { projectId: p.id, only: a.id } });
          });
        } else if (ty === 'scheduled') {
          var sk = schedKey(a, td);
          if (!sk || fired[sk]) return;
          if (a.trigger.scope === 'tasks') {
            out.push({ key: sk });
            tasksInProject(p.id).filter(function (x) { return !x.task.completed; }).slice(0, 200)
              .forEach(function (x) {
                out.push({ type: 'scheduled', taskId: x.task.id, info: { projectId: p.id, only: a.id } });
              });
          } else {
            out.push({ key: sk, type: 'scheduled', taskId: null, info: { projectId: p.id, only: a.id } });
          }
        }
      });
    });
    /* งานของฉัน — เฉพาะของคนที่เปิดแอปอยู่ (ย้ายเซกชันส่วนตัวของคนอื่นไม่ได้) */
    var mine = db.personal && db.personal[db.currentUserId];
    ((mine && mine.auto) || []).forEach(function (a) {
      if (!a.on || !a.trigger) return;
      var ty = a.trigger.type, created = a.at ? String(a.at).slice(0, 10) : '';
      mtTasks().forEach(function (t) {
        var key;
        if (ty === 'completed') {
          if (!t.completed || !t.completedAt || String(t.completedAt).slice(0, 10) < created) return;
          key = 'mtc:' + a.id + ':' + t.id;
        } else if (ty === 'approaching' || ty === 'overdue') {
          if (t.completed || !t.dueOn || !timeHit(a.trigger, t, now, td)) return;
          key = (ty === 'approaching' ? 'mta:' : 'mto:') + a.id + ':' + t.id + ':' + t.dueOn;
        } else return;
        if (fired[key]) return;
        out.push({ key: key, type: ty, taskId: t.id, info: { only: a.id, personal: true } });
      });
    });
    if (!out.length) return 0;
    quietBatch(function () {
      if (!db.autoFired) db.autoFired = {};
      out.forEach(function (x) {
        if (x.key) db.autoFired[x.key] = td;
        if (x.type) autoFire(x.type, x.taskId, x.info);
      });
    });
    return out.filter(function (x) { return x.type; }).length;
  }

  function pruneFired(obj) {
    var out = {}, lim = addDays(today(), -AUTO_FIRED_DAYS);
    if (isObj(obj)) Object.keys(obj).forEach(function (k) { if (String(obj[k]) >= lim) out[k] = obj[k]; });
    return out;
  }

  /* ---------- จัดการอัตโนมัติ ---------- */

  function normalizeAuto(a) {
    if (typeof a.name !== 'string') a.name = '';
    a.on = a.on !== false;
    a.chain = !!a.chain;
    if (!isObj(a.trigger) || !a.trigger.type) a.trigger = { type: 'manual' };
    a.paths = Array.isArray(a.paths) && a.paths.length ? a.paths : [{ conds: [], acts: [] }];
    a.paths.forEach(function (pt) {
      if (!Array.isArray(pt.conds)) pt.conds = [];
      if (!Array.isArray(pt.acts)) pt.acts = [];
    });
    if (!Array.isArray(a.els)) a.els = null;
    if (!('by' in a)) a.by = null;
    if (!('at' in a)) a.at = null;
    return a;
  }

  /** ไล่ทุกการกระทำของทุกอัตโนมัติในทุกโปรเจกต์ (เปลี่ยนชื่อ/ลบแท็ก) */
  function autoActsEach(fn) {
    db.projects.forEach(function (p) {
      (p.automations || []).forEach(function (a) {
        (a.paths || []).forEach(function (pt) { (pt.acts || []).forEach(fn); });
        (a.els || []).forEach(fn);
      });
    });
  }

  /** สำเนาอัตโนมัติที่ชี้ไปหาคอลัมน์/ฟิลด์ชุดใหม่ (คัดลอกโปรเจกต์) */
  function remapAuto(a, idMap) {
    var s = JSON.stringify(a);
    Object.keys(idMap).forEach(function (k) {
      if (!k || k === idMap[k]) return;
      s = s.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_])', 'g'), idMap[k]);
    });
    var c = JSON.parse(s);
    c.id = uid('au');
    (c.paths || []).forEach(function (pt) { (pt.acts || []).forEach(function (x) { delete x.ptr; }); });
    return c;
  }

  /** '@me' = อัตโนมัติของงานของฉัน */
  function autoList(pid) {
    if (pid === '@me') return personalOf().auto;
    var p = project(pid);
    return p ? (p.automations = p.automations || []) : [];
  }
  function automations(pid) { return autoList(pid).slice(); }
  function automation(pid, id) { return autoList(pid).filter(function (a) { return a.id === id; })[0] || null; }

  /** แก้อัตโนมัติของโปรเจกต์ได้ไหม — คนที่แก้โครงสร้างโปรเจกต์นั้นได้ (งานของฉัน = ตัวเอง) */
  function canEditAutos(pid) {
    if (pid === '@me') return isActive();
    return !!project(pid) && can('structure') && canInProject(pid, 'edit');
  }

  /** สร้างหรือแก้ (มี id อยู่แล้ว = แทนของเดิม) คืนตัวที่บันทึก หรือ null */
  function saveAutomation(pid, input) {
    if (!canEditAutos(pid) || !input) return null;
    var list = autoList(pid);
    var a = normalizeAuto(clone(input));
    a.name = String(a.name || '').trim().slice(0, 120);
    a.paths = a.paths.slice(0, AUTO_MAX_PATHS).map(function (pt) {
      return { conds: pt.conds.slice(0, AUTO_MAX_CONDS), acts: pt.acts.slice(0, AUTO_MAX_ACTS) };
    });
    if (a.els) a.els = a.els.slice(0, AUTO_MAX_ACTS);
    var old = a.id ? list.filter(function (x) { return x.id === a.id; })[0] : null;
    if (old) {
      snapshot('แก้อัตโนมัติ');
      a.by = old.by; a.at = old.at;
      list[list.indexOf(old)] = a;
    } else {
      if (list.length >= AUTO_MAX) return null;
      snapshot('สร้างอัตโนมัติ');
      a.id = uid('au');
      a.by = db.currentUserId;
      a.at = new Date().toISOString();
      list.push(a);
    }
    commit();
    return a;
  }

  function setAutomationOn(pid, id, on) {
    var a = automation(pid, id);
    if (!a || !canEditAutos(pid)) return false;
    snapshot(on ? 'เปิดอัตโนมัติ' : 'ปิดอัตโนมัติ');
    a.on = !!on;
    commit();
    return true;
  }

  function duplicateAutomation(pid, id) {
    var a = automation(pid, id), list = autoList(pid);
    if (!a || !canEditAutos(pid) || list.length >= AUTO_MAX) return null;
    snapshot('ทำสำเนาอัตโนมัติ');
    var c = remapAuto(a, {});
    c.name = (a.name ? a.name + ' ' : '') + '(สำเนา)';
    c.on = false;                       // สำเนาเริ่มแบบปิด ไม่ให้ทำงานซ้อนกับตัวเดิมทันที
    c.by = db.currentUserId;
    c.at = new Date().toISOString();
    list.splice(list.indexOf(a) + 1, 0, c);
    commit();
    return c;
  }

  function deleteAutomation(pid, id) {
    var a = automation(pid, id), list = autoList(pid);
    if (!a || !canEditAutos(pid)) return false;
    snapshot('ลบอัตโนมัติ');
    list.splice(list.indexOf(a), 1);
    commit();
    return true;
  }

  /** อัตโนมัติแบบกดรันเองที่ใช้กับงานนี้ได้ [{ p, a }] */
  function manualAutomationsFor(taskId) {
    var out = [];
    projectsOfTask(taskId).forEach(function (x) {
      (x.project.automations || []).forEach(function (a) {
        if (a.on && a.trigger && a.trigger.type === 'manual') out.push({ p: x.project, a: a });
      });
    });
    return out;
  }

  /** รันอัตโนมัติแบบกดเองกับงานที่เลือก (สูงสุด 50) — ย้อนกลับได้ครั้งเดียว
   *  คนที่เห็นงานกดได้ทุกคน (รวมดูอย่างเดียว) การกระทำทำในนามอัตโนมัติที่คนแก้โปรเจกต์ตั้งไว้ */
  function runAutomation(pid, id, taskIds) {
    var a = automation(pid, id);
    if (!a || !a.on || !a.trigger || a.trigger.type !== 'manual' || !isActive()) return 0;
    var ids = (taskIds || []).filter(function (tid, i, arr) {
      return arr.indexOf(tid) === i && task(tid) && canSeeTask(tid) &&
        db.memberships.some(function (m) { return m.taskId === tid && m.projectId === pid; });
    }).slice(0, AUTO_MANUAL_MAX);
    if (!ids.length) return 0;
    batch('รันอัตโนมัติ “{a}”', { a: a.name || a.trigger.label || '' }, function () {
      ids.forEach(function (tid) { autoFire('manual', tid, { projectId: pid, only: a.id }); });
    });
    return ids.length;
  }

  /** ประวัติการรัน ใหม่สุดก่อน */
  function autoRuns(pid) {
    var list = pid === '@me' ? personalOf().autoRuns : ((project(pid) || {}).autoRuns || []);
    return list.slice().reverse();
  }

  /** อัตโนมัติ "ย้ายเข้าคอลัมน์นี้" ที่เปิดอยู่ (ไอคอนสายฟ้าบนหัวคอลัมน์) */
  function autoForSection(pid, secId) {
    return autoList(pid).filter(function (a) {
      return a.on && a.trigger && a.trigger.type === 'moved' && a.trigger.sec === secId;
    });
  }

  /* ======================================================================
   * 3b — ชนิดงานกำหนดเอง ฟอร์ม เทมเพลตงาน เทมเพลตโปรเจกต์ และรายงานสถานะ
   * ====================================================================== */

  /* ---------- ชนิดงานกำหนดเอง ----------
   * ของโปรเจกต์ (project.types) งานเก็บ ctype + cstatus ส่วน type ยังเป็นชนิดพื้นฐาน (task)
   * จึงอยู่ร่วมกับหมุดหมาย/ขออนุมัติได้ และโค้ดเดิมที่อ่าน t.type ยังถูกต้อง
   * สถานะที่ "นับว่าเสร็จ" ผูกกับการติ๊กเสร็จทั้งสองทาง (setStatusRaw / updateTask) */
  var TYPE_MAX = 20, STATUS_MAX = 12;

  function isBuiltinType(id) { return TASK_TYPES.some(function (x) { return x.id === id; }); }
  function typeDef(id) { return id ? (index().types[id] || null) : null; }
  /** { st, ty, p, k } ของสถานะ */
  function statusDef(sid) { return sid ? (index().statuses[sid] || null) : null; }
  function typeOf(t) { return t && t.ctype ? typeDef(t.ctype) : null; }
  function projectTypes(pid) { var p = project(pid); return (p && p.types) || []; }
  function visibleTypes() {
    var out = [];
    visibleProjects().forEach(function (p) { (p.types || []).forEach(function (ty) { out.push(ty); }); });
    return out;
  }

  /** ชนิดที่เลือกได้ [{ id, label, icon, custom, ty }] — pid '*' = ทุกโปรเจกต์ที่เห็น  null = ในตัวอย่างเดียว */
  function typeChoices(pid) {
    var out = TASK_TYPES.map(function (x) { return { id: x.id, label: x.label, icon: x.icon, custom: false }; });
    if (!pid) return out;
    (pid === '*' ? visibleTypes() : projectTypes(pid)).forEach(function (ty) {
      out.push({ id: ty.id, label: ty.name, icon: ty.icon || '◇', custom: true, ty: ty });
    });
    return out;
  }

  /** ชนิดที่ตั้งให้งานนี้ได้ — ของในตัว + ชนิดของทุกโปรเจกต์ที่งานต้นทางอยู่ */
  function typeChoicesFor(taskId) {
    var t = task(taskId);
    if (!t) return [];
    var out = typeChoices(null), seen = {};
    (index().memByTask[rootOf(t).id] || []).forEach(function (m) {
      projectTypes(m.projectId).forEach(function (ty) {
        if (seen[ty.id]) return;
        seen[ty.id] = true;
        out.push({ id: ty.id, label: ty.name, icon: ty.icon || '◇', custom: true, ty: ty });
      });
    });
    var own = typeOf(t);
    if (own && !seen[own.id]) out.push({ id: own.id, label: own.name, icon: own.icon || '◇', custom: true, ty: own });
    return out;
  }

  /** ชื่อชนิดของงาน (ชนิดในตัวคืนคีย์คำแปล ให้หน้าจอแปลเอง) */
  function typeName(t) {
    var ty = typeOf(t);
    if (ty) return ty.name;
    var b = TASK_TYPES.filter(function (x) { return x.id === (t.type || 'task'); })[0];
    return b ? b.label : '';
  }

  /** ตัวเลือกสถานะสำหรับตัวกรอง [[id, ป้าย, สี]] */
  function statusChoices(pid) {
    var tys = pid === '*' ? visibleTypes() : projectTypes(pid), out = [];
    tys.forEach(function (ty) {
      ty.statuses.forEach(function (s) {
        out.push([s.id, (tys.length > 1 ? ty.name + ' · ' : '') + s.name, s.color]);
      });
    });
    return out;
  }

  function statusRank(t) {
    var sd = statusDef(t.cstatus);
    if (!sd) return null;
    return (sd.p.types || []).indexOf(sd.ty) * 100 + sd.k;
  }

  /** สถานะแรกที่นับว่าเสร็จ (done) หรือยังไม่เสร็จ */
  function firstStatus(ty, done) {
    var list = (ty && ty.statuses) || [];
    return list.filter(function (s) { return !!s.done === !!done; })[0] || (done ? null : list[0]) || null;
  }

  function normalizeType(ty) {
    ty.name = String(ty.name || '').trim().slice(0, 60) || 'ชนิดงาน';
    ty.icon = String(ty.icon || '').trim().slice(0, 4) || '◇';
    ty.base = 'task';
    var seen = {};
    ty.statuses = (Array.isArray(ty.statuses) ? ty.statuses : []).filter(function (s) {
      return s && String(s.name || '').trim();
    }).slice(0, STATUS_MAX).map(function (s, i) {
      var id = s.id && !seen[s.id] ? s.id : uid('cs');
      seen[id] = true;
      return { id: id, name: String(s.name).trim().slice(0, 40),
        color: s.color || OPTION_COLORS[i % OPTION_COLORS.length], done: !!s.done };
    });
    if (!ty.statuses.length) {
      ty.statuses = [
        { id: uid('cs'), name: L('ยังไม่เริ่ม'), color: '#9ca0a8', done: false },
        { id: uid('cs'), name: L('กำลังทำ'), color: '#14aaf5', done: false },
        { id: uid('cs'), name: L('เสร็จแล้ว'), color: '#37c5ab', done: true }
      ];
    }
    return ty;
  }

  function canEditTypes(pid) { return !!project(pid) && can('structure') && canInProject(pid, 'edit'); }

  /** สร้าง/แก้ชนิดงาน (มี id = แก้) งานที่สถานะถูกลบไปย้ายไปสถานะแรกที่เหมาะ */
  function saveTaskType(pid, input) {
    var p = project(pid);
    if (!p || !input || !canEditTypes(pid)) return null;
    p.types = p.types || [];
    var ty = normalizeType(clone(input));
    var old = ty.id ? p.types.filter(function (x) { return x.id === ty.id; })[0] : null;
    if (!old && p.types.length >= TYPE_MAX) return null;
    snapshot(old ? 'แก้ชนิดงาน' : 'สร้างชนิดงาน');
    if (old) {
      var keep = {};
      ty.statuses.forEach(function (s) { keep[s.id] = s; });
      db.tasks.forEach(function (t) {
        if (t.ctype !== ty.id || keep[t.cstatus]) return;
        var ns = firstStatus(ty, t.completed);
        t.cstatus = ns ? ns.id : null;
      });
      p.types[p.types.indexOf(old)] = ty;
    } else {
      ty.id = uid('ty');
      p.types.push(ty);
    }
    audit('project.type', p.name, ty.name);
    commit();
    return ty;
  }

  function deleteTaskType(pid, id) {
    var p = project(pid);
    if (!p || !canEditTypes(pid) || !(p.types || []).some(function (x) { return x.id === id; })) return false;
    snapshot('ลบชนิดงาน');
    db.tasks.forEach(function (t) { if (t.ctype === id) { t.ctype = null; t.cstatus = null; } });
    p.types = p.types.filter(function (x) { return x.id !== id; });
    if (p.defaultType === id) p.defaultType = '';
    commit();
    return true;
  }

  function setDefaultType(pid, id) {
    var p = project(pid);
    if (!p || !canEditTypes(pid)) return false;
    if (id && !isBuiltinType(id) && !projectTypes(pid).some(function (x) { return x.id === id; })) return false;
    snapshot('ตั้งชนิดงานเริ่มต้น');
    p.defaultType = id || '';
    commit();
    return true;
  }

  /** ชนิดเริ่มต้นของโปรเจกต์สำหรับงานใหม่ที่ไม่ได้ระบุชนิด ("+ เพิ่ม…" ทุกทาง ฟอร์ม เทมเพลต) */
  function applyDefaultType(attrs, pid) {
    if (!pid || attrs.parentId || attrs.type !== undefined || attrs.ctype) return attrs;
    var p = project(pid), dt = p && p.defaultType;
    if (!dt) return attrs;
    var a = {};
    Object.keys(attrs).forEach(function (k) { a[k] = attrs[k]; });
    if (isBuiltinType(dt)) { a.type = dt; return a; }
    var ty = (p.types || []).filter(function (x) { return x.id === dt; })[0];
    if (!ty) return attrs;
    a.type = ty.base || 'task';
    a.ctype = ty.id;
    a.cstatus = (firstStatus(ty, !!a.completed) || {}).id || null;
    return a;
  }

  /** ตั้งชนิดงานโดยไม่ snapshot/commit (ใช้ใน batch) */
  function setTypeRaw(t, typeId) {
    if (!t || !typeId) return false;
    if (isBuiltinType(typeId)) {
      if (!t.ctype && t.type === typeId) return false;
      if (t.type !== typeId) { updateTask(t.id, { type: typeId }, { quiet: true }); return true; }
      t.ctype = null;
      t.cstatus = null;
      var bl = TASK_TYPES.filter(function (x) { return x.id === typeId; })[0];
      log(t.id, 'เปลี่ยนชนิดงานเป็น {p}', { p: bl ? bl.label : typeId });
      return true;
    }
    var ty = typeDef(typeId);
    if (!ty || t.ctype === typeId) return false;
    if (t.type !== ty.base) updateTask(t.id, { type: ty.base }, { quiet: true, keepCtype: true, noTypeLog: true });
    t.ctype = ty.id;
    var ns = firstStatus(ty, t.completed);
    t.cstatus = ns ? ns.id : null;
    log(t.id, 'เปลี่ยนชนิดงานเป็น {p}', { p: ty.name });
    return true;
  }

  function setTaskType(taskId, typeId) {
    var t = task(taskId);
    if (!t) return false;
    var ok = false;
    batch('เปลี่ยนชนิดงาน', null, function () { ok = setTypeRaw(t, typeId); });
    return ok;
  }

  /** ตั้งสถานะโดยไม่ snapshot/commit — ทางเดียวที่สถานะเปลี่ยน (แผงงาน รายการ ลากลงคอลัมน์ อัตโนมัติ)
   *  สถานะของชนิดอื่น = เปลี่ยนชนิดให้ด้วย  สถานะ "นับว่าเสร็จ" ติ๊กเสร็จให้ ไม่นับ = เปิดใหม่ */
  function setStatusRaw(t, sid) {
    var sd = statusDef(sid);
    if (!t || !sd) return false;
    if (t.ctype !== sd.ty.id) setTypeRaw(t, sd.ty.id);
    if (t.cstatus === sid) return false;
    var old = t.cstatus;
    t.cstatus = sid;
    log(t.id, 'ตั้งสถานะเป็น “{s}”', { s: sd.st.name });
    autoFire('cstatus', t.id, { type: sd.ty.id, v: sid, old: old || null });
    if (!!sd.st.done !== !!t.completed) updateTask(t.id, { completed: !!sd.st.done }, { quiet: true, keepStatus: true });
    return true;
  }

  function setTaskStatus(taskId, sid) {
    var t = task(taskId);
    if (!t || !statusDef(sid)) return false;
    var ok = false;
    batch('เปลี่ยนสถานะ', null, function () { ok = setStatusRaw(t, sid); });
    return ok;
  }

  /* ---------- รหัสใหม่ของโครงโปรเจกต์ (คัดลอกโปรเจกต์ / ใช้เทมเพลต) ---------- */

  /** แทนรหัสเก่าด้วยรหัสใหม่ทั้งก้อน (แบบเดียวกับ remapAuto) */
  function remapJson(obj, idMap) {
    var s = JSON.stringify(obj);
    Object.keys(idMap).forEach(function (k) {
      if (!k || k === idMap[k]) return;
      s = s.replace(new RegExp(escRe(k) + '(?![A-Za-z0-9_])', 'g'), idMap[k]);
    });
    return JSON.parse(s);
  }

  /** ชนิดงาน สถานะ ฟอร์ม และเทมเพลตงานได้รหัสใหม่ — เก็บคู่เก่า→ใหม่ไว้ใน idMap */
  function renewStructIds(p, idMap) {
    (p.types || []).forEach(function (ty) {
      var o = ty.id; ty.id = uid('ty'); idMap[o] = ty.id;
      (ty.statuses || []).forEach(function (s) { var os = s.id; s.id = uid('cs'); idMap[os] = s.id; });
    });
    (p.forms || []).forEach(function (f) {
      var o = f.id; f.id = uid('fm'); idMap[o] = f.id;
      f.n = 0; f.last = null; f.by = db.currentUserId; f.at = new Date().toISOString();
    });
    (p.taskTemplates || []).forEach(function (x) { var o = x.id; x.id = uid('tt'); idMap[o] = x.id; });
    /* 3c — วิดเจ็ตแดชบอร์ดและทรัพยากรสำคัญได้รหัสใหม่ (ส่วนที่ 2 เพิ่มหน้าเอกสาร) */
    if (p.dash) p.dash.forEach(function (w) { var o = w.id; w.id = uid('dw'); idMap[o] = w.id; });
    (p.resources || []).forEach(function (r) { r.id = uid('kr'); r.by = db.currentUserId; r.at = new Date().toISOString(); });
    if (renewHook) renewHook(p, idMap);
  }

  /** ฟอร์ม เทมเพลตงาน และชนิดเริ่มต้นชี้ไปคอลัมน์/ฟิลด์/ชนิดชุดใหม่ */
  function remapStruct(p, idMap) {
    p.forms = remapJson(p.forms || [], idMap);
    p.taskTemplates = remapJson(p.taskTemplates || [], idMap);
    if (p.defaultType && idMap[p.defaultType]) p.defaultType = idMap[p.defaultType];
    if (p.dash) p.dash = remapJson(p.dash, idMap).map(normalizeWidget);
    if (remapHook) remapHook(p, idMap);
  }

  /* ---------- ฟอร์ม ----------
   * คำถามเรียงเป็นแถวเดียว การแตกแขนงคือ cond = { q: คำถามตัวเลือกที่อยู่ก่อนหน้า, v: [ตัวเลือก] }
   * คำถามโผล่เมื่อคำถามต้นทางโผล่และคำตอบตรง ซ้อนได้ไม่เกิน 5 ชั้น
   * ส่งได้ทุกคนที่ล็อกอิน (หรือโหมดเครื่องเดียว) ฟอร์มสาธารณะสำหรับคนนอกรอเฟส 5 (ต้องมีเซิร์ฟเวอร์) */
  var FORM_MAX = 20, FORM_ITEMS_MAX = 60, FORM_DEPTH = 5, FORM_FILES_MAX = 5, FORM_FILE_BYTES = 2 * 1024 * 1024;
  var FORM_KINDS = [
    { id: 'heading', label: 'หัวข้อ / คำอธิบาย', icon: 'text' },
    { id: 'text',    label: 'ข้อความสั้น',      icon: 'text' },
    { id: 'long',    label: 'ข้อความยาว',      icon: 'note' },
    { id: 'select',  label: 'ตัวเลือกเดียว',    icon: 'chevronDown', opts: true },
    { id: 'multi',   label: 'หลายตัวเลือก',    icon: 'subtask', opts: true },
    { id: 'number',  label: 'ตัวเลข',          icon: 'hash' },
    { id: 'date',    label: 'วันที่',           icon: 'calendar' },
    { id: 'range',   label: 'ช่วงวันที่',        icon: 'calendar' },
    { id: 'person',  label: 'บุคคล',           icon: 'users' },
    { id: 'file',    label: 'ไฟล์แนบ',         icon: 'paperclip' }
  ];
  function formKind(id) { return FORM_KINDS.filter(function (x) { return x.id === id; })[0] || null; }

  function normalizeForm(f) {
    f.name = String(f.name || '').trim().slice(0, 120) || 'ฟอร์ม';
    f.desc = String(f.desc || '').slice(0, 4000);
    f.on = f.on !== false;
    var ids = {};
    f.items = (Array.isArray(f.items) ? f.items : []).filter(function (it) {
      if (!it || !formKind(it.kind)) return false;
      if (!it.id || ids[it.id]) it.id = uid('q');
      ids[it.id] = true;
      return true;
    }).slice(0, FORM_ITEMS_MAX);
    f.items.forEach(function (it) {
      it.label = String(it.label || '').slice(0, 300);
      it.help = String(it.help || '').slice(0, 1000);
      it.req = !!it.req && it.kind !== 'heading';
      var seen = {};
      it.opts = formKind(it.kind).opts ? (Array.isArray(it.opts) ? it.opts : []).map(function (s) {
        return String(s).trim().slice(0, 80);
      }).filter(function (s) { if (!s || seen[s]) return false; seen[s] = true; return true; }).slice(0, 50) : [];
      if (typeof it.map !== 'string' || it.kind === 'heading' || it.kind === 'file') it.map = '';
      it.cond = it.cond && it.cond.q ? { q: String(it.cond.q), v: [].concat(it.cond.v || []).map(String) } : null;
    });
    var pos = {};
    f.items.forEach(function (it, i) { pos[it.id] = i; });
    f.items.forEach(function (it, i) {
      if (!it.cond) return;
      var src = f.items[pos[it.cond.q]];
      if (!src || pos[it.cond.q] >= i || !formKind(src.kind).opts) it.cond = null;
      else it.cond.v = it.cond.v.filter(function (v) { return src.opts.indexOf(v) >= 0; });
    });
    f.items.forEach(function (it) { if (it.cond && formDepth(f, it) > FORM_DEPTH) it.cond = null; });
    ['sec', 'titleQ', 'assignee', 'confirm'].forEach(function (k) { f[k] = typeof f[k] === 'string' ? f[k] : ''; });
    f.confirm = f.confirm.slice(0, 1000);
    if (f.titleQ && !f.items.some(function (it) { return it.id === f.titleQ && (it.kind === 'text' || it.kind === 'long'); })) f.titleQ = '';
    f.copy = f.copy !== false;
    f.follow = f.follow !== false;
    f.again = f.again !== false;
    f.n = Math.max(0, parseInt(f.n, 10) || 0);
    if (!('last' in f)) f.last = null;
    if (!('by' in f)) f.by = null;
    if (!('at' in f)) f.at = null;
    return f;
  }

  /** ความลึกของการแตกแขนง (คำถามที่ไม่มีเงื่อนไข = 0) */
  function formDepth(f, it) {
    var d = 0, cur = it, guard = 0;
    while (cur && cur.cond && guard++ < 50) {
      d++;
      var q = cur.cond.q;
      cur = f.items.filter(function (x) { return x.id === q; })[0];
    }
    return d;
  }

  /** คำถามที่โผล่ตามคำตอบตอนนี้ { qid: true } */
  function formVisible(f, ans) {
    var vis = {};
    (f.items || []).forEach(function (it) {
      if (!it.cond) { vis[it.id] = true; return; }
      var a = ans ? ans[it.cond.q] : null;
      var pick = a === null || a === undefined || a === '' ? [] : [].concat(a);
      vis[it.id] = !!vis[it.cond.q] && (it.cond.v.length
        ? it.cond.v.some(function (v) { return pick.indexOf(v) >= 0; }) : pick.length > 0);
    });
    return vis;
  }

  function formById(id) {
    for (var i = 0; i < db.projects.length; i++) {
      var p = db.projects[i];
      var f = (p.forms || []).filter(function (x) { return x.id === id; })[0];
      if (f) return { p: p, f: f };
    }
    return null;
  }

  function canEditForms(pid) { return !!project(pid) && can('structure') && canInProject(pid, 'edit'); }

  /** ช่องในงานที่คำถามชนิดนี้ผูกได้ [[ค่า, ป้าย]] — ป้ายเป็นคีย์คำแปล (ชื่อฟิลด์ผ่านไปตามเดิม) */
  function formTargets(pid, kind) {
    var p = project(pid), out = [['', 'ไม่ผูกกับช่องไหน']];
    var fl = ((p && p.fields) || []);
    function add(types) {
      fl.forEach(function (f) { if (types.indexOf(f.type) >= 0) out.push(['field:' + f.id, f.name]); });
    }
    if (kind === 'text') { out.push(['name', 'ชื่องาน']); add(['text']); }
    else if (kind === 'long') { out.push(['notes', 'รายละเอียดงาน']); add(['text']); }
    else if (kind === 'select') add(['select']);
    else if (kind === 'multi') { out.push(['tags', 'แท็ก']); add(['multi']); }
    else if (kind === 'number') add(['number']);
    else if (kind === 'date') { out.push(['due', 'กำหนดส่ง'], ['start', 'วันเริ่ม']); add(['date']); }
    else if (kind === 'range') out.push(['dates', 'วันเริ่ม – กำหนดส่ง']);
    else if (kind === 'person') { out.push(['assignee', 'ผู้รับผิดชอบ'], ['followers', 'ผู้ติดตาม']); add(['person']); }
    else return [['', 'ไม่ผูกกับช่องไหน']];
    return out;
  }

  function saveForm(pid, input) {
    var p = project(pid);
    if (!p || !input || !canEditForms(pid)) return null;
    p.forms = p.forms || [];
    var f = normalizeForm(clone(input));
    var old = f.id ? p.forms.filter(function (x) { return x.id === f.id; })[0] : null;
    if (!old && p.forms.length >= FORM_MAX) return null;
    snapshot(old ? 'แก้ฟอร์ม' : 'สร้างฟอร์ม');
    if (old) {
      f.n = old.n; f.last = old.last; f.by = old.by; f.at = old.at;
      p.forms[p.forms.indexOf(old)] = f;
    } else {
      f.id = uid('fm'); f.n = 0; f.last = null; f.by = db.currentUserId; f.at = new Date().toISOString();
      p.forms.push(f);
    }
    audit('project.form', p.name, f.name);
    commit();
    return f;
  }

  function setFormOn(pid, id, on) {
    var x = formById(id);
    if (!x || x.p.id !== pid || !canEditForms(pid)) return false;
    snapshot(on ? 'เปิดรับฟอร์ม' : 'ปิดรับฟอร์ม');
    x.f.on = !!on;
    commit();
    return true;
  }

  function duplicateForm(pid, id) {
    var x = formById(id);
    if (!x || x.p.id !== pid || !canEditForms(pid) || x.p.forms.length >= FORM_MAX) return null;
    snapshot('ทำสำเนาฟอร์ม');
    var c = clone(x.f);
    c.id = uid('fm'); c.name = (c.name + ' ' + L('(สำเนา)')).slice(0, 120); c.on = false;
    c.n = 0; c.last = null; c.by = db.currentUserId; c.at = new Date().toISOString();
    x.p.forms.splice(x.p.forms.indexOf(x.f) + 1, 0, c);
    commit();
    return c;
  }

  function deleteForm(pid, id) {
    var x = formById(id);
    if (!x || x.p.id !== pid || !canEditForms(pid)) return false;
    snapshot('ลบฟอร์ม');
    x.p.forms = x.p.forms.filter(function (f) { return f.id !== id; });
    commit();
    return true;
  }

  /** คำตอบที่ใช้ได้ของคำถามหนึ่ง หรือ null (= ไม่ได้ตอบ) */
  function cleanAnswer(it, v) {
    if (v === undefined || v === null) return null;
    switch (it.kind) {
      case 'text': case 'long': {
        var s = String(v).replace(/\r\n/g, '\n').trim().slice(0, it.kind === 'text' ? 500 : 20000);
        return s || null;
      }
      case 'select': return it.opts.indexOf(String(v)) >= 0 ? String(v) : null;
      case 'multi': {
        var arr = [].concat(v).map(String).filter(function (x, i, a) { return it.opts.indexOf(x) >= 0 && a.indexOf(x) === i; });
        return arr.length ? arr : null;
      }
      case 'number': {
        if (v === '' || isNaN(Number(v))) return null;
        return Number(v);
      }
      case 'date': return /^\d{4}-\d\d-\d\d$/.test(String(v)) ? String(v) : null;
      case 'range': {
        var a = /^\d{4}-\d\d-\d\d$/.test(String((v || [])[0] || '')) ? v[0] : '';
        var b = /^\d{4}-\d\d-\d\d$/.test(String((v || [])[1] || '')) ? v[1] : '';
        if (!a && !b) return null;
        if (a && b && a > b) { var tmp = a; a = b; b = tmp; }
        return [a, b];
      }
      case 'person': { var u = user(v); return u && u.active !== false ? u.id : null; }
      case 'file': {
        var files = [].concat(v).filter(function (x) {
          return x && x.name && typeof x.url === 'string' && /^(data:|https?:)/.test(x.url) &&
            (!x.size || x.size <= FORM_FILE_BYTES);
        }).slice(0, FORM_FILES_MAX);
        return files.length ? files : null;
      }
    }
    return null;
  }

  function answerText(it, v) {
    if (it.kind === 'multi') return v.join(', ');
    if (it.kind === 'range') return (v[0] || '…') + ' – ' + (v[1] || '…');
    if (it.kind === 'person') { var u = user(v); return u ? u.name : ''; }
    if (it.kind === 'file') return v.map(function (x) { return x.name; }).join(', ');
    return String(v);
  }

  /** ค่าฟิลด์จากคำตอบ (ตัวเลือกต้องยังอยู่ในฟิลด์) หรือ null */
  function answerFieldValue(fd, v) {
    if (fd.type === 'select') return (fd.options || []).some(function (o) { return o.name === v; }) ? v : null;
    if (fd.type === 'multi') {
      var arr = [].concat(v).filter(function (x) { return (fd.options || []).some(function (o) { return o.name === x; }); });
      return arr.length ? arr : null;
    }
    if (fd.type === 'number') return typeof v === 'number' ? v : (isNaN(Number(v)) ? null : Number(v));
    if (fd.type === 'person') return user(v) ? v : null;
    if (fd.type === 'date') return /^\d{4}-\d\d-\d\d$/.test(String(v)) ? v : null;
    if (fd.type === 'text') return String(v).slice(0, 2000);
    return null;
  }

  /**
   * ส่งฟอร์ม — สร้างงานหนึ่งชิ้นในคอลัมน์ที่ตั้งไว้ ย้อนกลับได้ครั้งเดียว
   * @param ans { qid: คำตอบ }  text/long สตริง  select สตริง  multi อาร์เรย์  number  date 'YYYY-MM-DD'
   *            range [a, b]  person userId  file [{ name, url (data URI), size, mime }]
   * @returns { task } หรือ { err, params, q }
   */
  function submitForm(formId, ans) {
    var x = formById(formId);
    /* Sprint 1B — ไม่ผ่าน canCreateTask โดยตั้งใจ ฟอร์มมีไว้ให้คนที่แก้โปรเจกต์ไม่ได้ (รวมคนแสดงความเห็นได้)
     * ส่งเรื่องเข้ามาเป็นงาน คนแก้โปรเจกต์เป็นคนเปิดรับฟอร์มเอง ปิดฟอร์มได้ตลอด */
    if (!x || !isActive()) return { err: 'ไม่พบฟอร์มนี้' };
    var p = x.p, f = x.f;
    if (!f.on || p.archived) return { err: 'ฟอร์มนี้ปิดรับคำตอบแล้ว' };
    ans = ans || {};
    var vis = formVisible(f, ans), clean = {};
    for (var i = 0; i < f.items.length; i++) {
      var it = f.items[i];
      if (it.kind === 'heading' || !vis[it.id]) continue;
      var v = cleanAnswer(it, ans[it.id]);
      if (v === null) {
        if (it.req) return { err: 'กรอก “{q}” ก่อนส่ง', params: { q: it.label || '?' }, q: it.id };
        continue;
      }
      clean[it.id] = v;
    }
    var who = me();
    var attrs = { name: '', notes: '' }, fieldSets = [], tags = [], followers = [], files = [], lines = [];
    f.items.forEach(function (it) {
      if (!(it.id in clean)) return;
      var v = clean[it.id], m = it.map || '';
      if (m === 'name') { if (!attrs.name) attrs.name = String(v); }
      else if (m === 'notes') attrs.notes = (attrs.notes ? attrs.notes + '\n\n' : '') + String(v);
      else if (m === 'due') attrs.dueOn = v;
      else if (m === 'start') attrs.startOn = v;
      else if (m === 'dates') { attrs.startOn = v[0] || null; attrs.dueOn = v[1] || null; }
      else if (m === 'assignee') attrs.assigneeId = v;
      else if (m === 'followers') followers.push(v);
      else if (m === 'tags') tags = tags.concat(v);
      else if (m.indexOf('field:') === 0) fieldSets.push([m.slice(6), v]);
      if (it.kind === 'file') files = files.concat(v);
      if (f.copy && m !== 'name' && m !== 'notes') {
        lines.push('**' + String(it.label || '?').replace(/[*_`~\[\]]/g, '') + '**\n' + answerText(it, v));
      }
    });
    if (f.titleQ && typeof clean[f.titleQ] === 'string') attrs.name = clean[f.titleQ];
    attrs.name = String(attrs.name || '').replace(/\s+/g, ' ').trim().slice(0, 300) ||
      (f.name + ' — ' + (who ? who.name : ''));
    if (lines.length) attrs.notes = (attrs.notes ? attrs.notes + '\n\n' : '') + lines.join('\n\n');
    if (attrs.startOn && attrs.dueOn && attrs.startOn > attrs.dueOn) attrs.startOn = attrs.dueOn;
    if (!attrs.assigneeId && f.assignee) {
      var du = user(f.assignee);
      if (du && du.active !== false) attrs.assigneeId = du.id;
    }
    var sec = section(p.id, f.sec) ? f.sec : p.sections[0].id;
    var out = null;
    batch('ส่งฟอร์ม “{f}”', { f: f.name }, function () {
      var t = createTaskRaw(attrs, p.id, sec);
      function follow(u) { if (u && user(u) && t.followers.indexOf(u) < 0) t.followers.push(u); }
      follow(t.assigneeId);
      followers.forEach(follow);
      if (!f.follow && who && t.assigneeId !== who.id && followers.indexOf(who.id) < 0) {
        t.followers = t.followers.filter(function (u) { return u !== who.id; });
      }
      tags.forEach(function (tg) {
        var s = String(tg).trim().slice(0, 40);
        if (s && t.tags.indexOf(s) < 0) t.tags.push(s);
      });
      fieldSets.forEach(function (fs) {
        var fd = (p.fields || []).filter(function (y) { return y.id === fs[0]; })[0];
        if (!fd || fd.type === 'id') return;
        var fv = answerFieldValue(fd, fs[1]);
        if (fv !== null) setFieldRaw(t.id, fd.id, fv);
      });
      files.forEach(function (a) { addAttachment(t.id, String(a.name).slice(0, 200), a.url, a); });
      log(t.id, 'ส่งผ่านฟอร์ม “{f}”', { f: f.name });
      if (t.assigneeId) notifyOnly(t.id, [t.assigneeId], assignKey(t.type === 'approval'), 'assigned', { t: t.name });
      f.n = (f.n || 0) + 1;
      f.last = new Date().toISOString();
      autoFire('form', t.id, { projectId: p.id, form: f.id });
      out = t;
    });
    return { task: out };
  }

  /** ฟอร์มที่เปิดรับอยู่ในโปรเจกต์ที่เห็นได้ ใหม่สุดก่อน (วิดเจ็ตหน้าแรก) [{ p, f }] */
  function formsForHome() {
    var out = [];
    visibleProjects().forEach(function (p) {
      (p.forms || []).forEach(function (f) { if (f.on) out.push({ p: p, f: f }); });
    });
    return out.sort(function (a, b) {
      var x = a.f.last || a.f.at || '', y = b.f.last || b.f.at || '';
      return x < y ? 1 : x > y ? -1 : 0;
    });
  }

  /* ---------- เทมเพลตงาน (รายโปรเจกต์ + ของทั้งองค์กร) ----------
   * { id, name, by, at, t: { name, notes, type, ctype, prio, assignee: { mode: none|creator|user, user },
   *   followers, tags, fields: { fieldId: ค่า }, due / start: { n, unit: days|workdays } นับจากวันที่สร้างงาน,
   *   subs: [{ k, name, notes, assignee, due, deps: [k] }] } } */
  function relSpec(x) {
    if (!x || x.n === null || x.n === undefined || x.n === '') return null;
    return { n: Math.max(0, Math.min(3650, parseInt(x.n, 10) || 0)), unit: x.unit === 'workdays' ? 'workdays' : 'days' };
  }

  function normTT(t) {
    t = t || {};
    var ks = {};
    var subs = (Array.isArray(t.subs) ? t.subs : []).filter(function (s) { return s && String(s.name || '').trim(); })
      .slice(0, 50).map(function (s, i) {
        var k = s.k && !ks[s.k] ? String(s.k) : 'k' + i + '_' + Math.random().toString(36).slice(2, 5);
        ks[k] = true;
        return { k: k, name: String(s.name).trim().slice(0, 300), notes: String(s.notes || '').slice(0, 5000),
          assignee: s.assignee || null, due: relSpec(s.due), deps: [] , _deps: s.deps };
      });
    subs.forEach(function (s) {
      s.deps = [].concat(s._deps || []).filter(function (k) { return ks[k] && k !== s.k; });
      delete s._deps;
    });
    var am = t.assignee && t.assignee.mode;
    return {
      name: String(t.name || '').slice(0, 300), notes: String(t.notes || '').slice(0, 20000),
      type: isBuiltinType(t.type) ? t.type : 'task', ctype: t.ctype || null,
      prio: PRIORITIES.some(function (x) { return x.id === t.prio; }) ? t.prio : 'none',
      assignee: { mode: am === 'creator' || am === 'user' ? am : 'none', user: am === 'user' ? (t.assignee.user || null) : null },
      followers: Array.isArray(t.followers) ? t.followers.slice(0, 50) : [],
      tags: Array.isArray(t.tags) ? t.tags.map(String).slice(0, 30) : [],
      fields: isObj(t.fields) ? t.fields : {},
      due: relSpec(t.due), start: relSpec(t.start), subs: subs
    };
  }

  /** แบบเดิม { payload: { name, notes, type, priority, assigneeId, tags, subtaskNames } } → แบบใหม่ */
  function upgradeTaskTemplate(x) {
    if (!x || !x.id) return null;
    if (x.t) { x.t = normTT(x.t); x.name = String(x.name || x.t.name || 'เทมเพลต'); return x; }
    var pl = x.payload || {};
    return { id: x.id, name: String(x.name || pl.name || 'เทมเพลต'), by: x.by || null, at: x.at || null,
      t: normTT({ name: pl.name, notes: pl.notes, type: pl.type, prio: pl.priority,
        assignee: pl.assigneeId ? { mode: 'user', user: pl.assigneeId } : { mode: 'none' },
        tags: pl.tags, subs: (pl.subtaskNames || []).map(function (n, i) { return { k: 'k' + i, name: n }; }) }) };
  }

  /** เทมเพลตที่ใช้ในโปรเจกต์นี้ได้ [{ tpl, scope: pid | '*' }] — ของโปรเจกต์ก่อน */
  function taskTemplatesFor(pid) {
    var p = pid ? project(pid) : null, out = [];
    ((p && p.taskTemplates) || []).forEach(function (x) { out.push({ tpl: x, scope: p.id }); });
    (db.taskTemplates || []).forEach(function (x) { out.push({ tpl: x, scope: '*' }); });
    return out;
  }

  function findTaskTemplate(id) {
    var g = (db.taskTemplates || []).filter(function (x) { return x.id === id; })[0];
    if (g) return { tpl: g, list: db.taskTemplates, scope: '*' };
    for (var i = 0; i < db.projects.length; i++) {
      var p = db.projects[i];
      var h = (p.taskTemplates || []).filter(function (x) { return x.id === id; })[0];
      if (h) return { tpl: h, list: p.taskTemplates, scope: p.id };
    }
    return null;
  }

  /** ถอดแบบงานเป็นเทมเพลต วันนับจากวันนี้ ฟิลด์เฉพาะของโปรเจกต์ที่งานอยู่ */
  function captureTaskTemplate(taskId) {
    var t = task(taskId);
    if (!t) return null;
    var td = today();
    var rel = function (d) { return d ? { n: Math.max(0, daysBetween(td, d)), unit: 'days' } : null; };
    var fids = {};
    projectsOfTask(rootOf(t).id).forEach(function (x) {
      (x.project.fields || []).forEach(function (f) { if (f.type !== 'id') fids[f.id] = true; });
    });
    var fields = {};
    Object.keys(index().fvByTask[t.id] || {}).forEach(function (fid) {
      if (fids[fid]) fields[fid] = clone(index().fvByTask[t.id][fid].value);
    });
    var subs = subtasks(t.id), kOf = {};
    subs.forEach(function (s, i) { kOf[s.id] = 'k' + i; });
    return normTT({
      name: t.name, notes: t.notes, type: t.type, ctype: t.ctype, prio: t.priority,
      assignee: t.assigneeId ? { mode: 'user', user: t.assigneeId } : { mode: 'none' },
      followers: (t.followers || []).filter(function (u) { return u !== db.currentUserId && u !== t.assigneeId; }),
      tags: (t.tags || []).slice(), fields: fields,
      due: rel(t.dueOn), start: t.type === 'milestone' ? null : rel(t.startOn),
      subs: subs.map(function (s) {
        return { k: kOf[s.id], name: s.name, notes: s.notes, assignee: s.assigneeId, due: rel(s.dueOn),
          deps: (s.dependsOn || []).map(function (d) { return kOf[d.id]; }).filter(Boolean) };
      })
    });
  }

  /** บันทึกงานเป็นเทมเพลต  scope = รหัสโปรเจกต์ (เฉพาะโปรเจกต์นั้น) หรือ '*' (ทุกโปรเจกต์) */
  function saveTaskTemplate(taskId, name, scope) {
    var t = task(taskId);
    var tt = captureTaskTemplate(taskId);
    if (!t || !tt) return null;
    var p = scope && scope !== '*' ? project(scope) : null;
    var list = p ? (p.taskTemplates = p.taskTemplates || []) : (db.taskTemplates = db.taskTemplates || []);
    snapshot('บันทึกเทมเพลตงาน');
    var x = { id: uid('tt'), name: String(name || t.name).trim().slice(0, 120) || t.name, by: db.currentUserId,
              at: new Date().toISOString(), t: tt };
    list.push(x);
    commit();
    return x;
  }

  function updateTaskTemplate(id, input) {
    var x = findTaskTemplate(id);
    if (!x || !input) return null;
    snapshot('แก้เทมเพลตงาน');
    x.tpl.name = String(input.name || x.tpl.name).trim().slice(0, 120) || x.tpl.name;
    x.tpl.t = normTT(input.t || x.tpl.t);
    commit();
    return x.tpl;
  }

  function deleteTaskTemplate(id) {
    var x = findTaskTemplate(id);
    if (!x) return false;
    snapshot('ลบเทมเพลตงาน');
    x.list.splice(x.list.indexOf(x.tpl), 1);
    commit();
    return true;
  }

  /** สร้างงานจากเทมเพลตในคอลัมน์ที่ระบุ — วันนับจากวันนี้ (วันทำงานตามโปรเจกต์) ย้อนกลับได้ครั้งเดียว */
  function applyTaskTemplate(id, pid, secId) {
    var x = findTaskTemplate(id), p = project(pid);
    if (!x || !p) return null;
    if (!canCreateTask(pid)) return denied('create');   // Sprint 1B
    var tt = normTT(x.tpl.t), td = today();
    var day = function (r) { return r ? shiftDate(td, r.n, r.unit, p.workDays) : null; };
    var out = null;
    batch('สร้างงานจากเทมเพลต “{t}”', { t: x.tpl.name }, function () {
      var who = tt.assignee.mode === 'creator' ? db.currentUserId
        : tt.assignee.mode === 'user' && user(tt.assignee.user) && user(tt.assignee.user).active !== false ? tt.assignee.user : null;
      var attrs = { name: tt.name || x.tpl.name, notes: tt.notes, priority: tt.prio, tags: tt.tags.slice(),
        assigneeId: who, dueOn: day(tt.due), startOn: tt.type === 'milestone' ? null : day(tt.start) };
      if (attrs.startOn && attrs.dueOn && attrs.startOn > attrs.dueOn) attrs.startOn = attrs.dueOn;
      var ty = tt.ctype ? typeDef(tt.ctype) : null;
      if (ty) { attrs.type = ty.base; attrs.ctype = ty.id; attrs.cstatus = (firstStatus(ty, false) || {}).id || null; }
      else attrs.type = tt.type;
      var t = createTaskRaw(attrs, pid, section(pid, secId) ? secId : p.sections[0].id);
      [who].concat(tt.followers).forEach(function (u) { if (u && user(u) && t.followers.indexOf(u) < 0) t.followers.push(u); });
      Object.keys(tt.fields).forEach(function (fid) {
        var fd = (p.fields || []).filter(function (f) { return f.id === fid; })[0];
        if (fd && fd.type !== 'id') setFieldRaw(t.id, fid, clone(tt.fields[fid]));
      });
      var kMap = {};
      tt.subs.forEach(function (s) {
        var sa = s.assignee && user(s.assignee) ? s.assignee : null;
        var c = createTaskRaw({ name: s.name, notes: s.notes, assigneeId: sa, dueOn: day(s.due), parentId: t.id }, null, null);
        if (sa && c.followers.indexOf(sa) < 0) c.followers.push(sa);
        kMap[s.k] = c;
      });
      tt.subs.forEach(function (s) {
        s.deps.forEach(function (k) {
          var a = kMap[s.k], b = kMap[k];
          if (a && b && a !== b && !dependsOnDeep(b.id, a.id)) a.dependsOn.push({ id: b.id, type: 'FS' });
        });
      });
      log(t.id, 'สร้างจากเทมเพลต “{t}”', { t: x.tpl.name });
      if (who) notifyOnly(t.id, [who], assignKey(t.type === 'approval'), 'assigned', { t: t.name });
      out = t;
    });
    return out;
  }

  /* ---------- เทมเพลตโปรเจกต์ ----------
   * data = { description, workDays, defaultView, views, depShift, sections: [{ id, name }],
   *          fields (ฟิลด์จากคลังเก็บแค่ { id, lib: true }), automations, forms, types, defaultType,
   *          taskTemplates, roles: [{ k, name, user }], anchor,
   *          tasks: [{ k, name, notes, type, ctype, cstatus, prio, sec, role, s, d, st, dt, tags, fields, deps, subs }] }
   * วันเก็บเป็นระยะห่างจากวันเริ่มโปรเจกต์ (s, d) — skipWeekends = นับเฉพาะ จ.–ศ.
   * ผู้รับผิดชอบเก็บเป็นบทบาท (r0, r1 …) ตอนใช้เลือกคนให้แต่ละบทบาท
   * สิทธิ์ editors = แก้/ลบ/แชร์ได้  org = ทุกคนใช้ได้  users = ใช้ได้เฉพาะคนที่ระบุ */
  function workdaysBetween(a, b) {
    if (!a || !b || a === b) return 0;
    var step = b > a ? 1 : -1, d = a, n = 0, guard = 0;
    while (d !== b && guard++ < 4000) {
      d = addDays(d, step);
      if (isWorkday(d, 'mon-fri')) n += step;
    }
    return n;
  }

  function ptCanEdit(x) {
    if (!x || x.builtin || !isActive()) return false;
    return isAdmin() || (x.editors || []).indexOf(db.currentUserId) >= 0;
  }
  function ptCanUse(x) {
    if (!x || !isActive()) return false;
    if (x.builtin) return true;
    return ptCanEdit(x) || !!x.org || (x.users || []).indexOf(db.currentUserId) >= 0;
  }

  /* --- เทมเพลตตั้งต้นภาษาไทย (สร้างใหม่ทุกครั้งที่เรียก ชื่อจึงแปลตามภาษาที่เลือก) --- */
  function btBuild(o) {
    var id = o.id, data = {
      description: o.desc, workDays: 'mon-fri', defaultView: o.view || 'list', views: null, depShift: null,
      sections: o.secs.map(function (n, i) { return { id: 'bs_' + id + '_' + i, name: n }; }),
      fields: (o.fields || []).map(function (f, i) {
        return normalizeFieldDef({ id: 'bf_' + id + '_' + i, name: f[0], type: f[1],
          options: f[2] || [], format: f[3] || null });
      }),
      roles: (o.roles || []).map(function (n, i) { return { k: 'r' + i, name: n, user: null, text: true }; }),
      types: (o.types || []).map(function (ty, i) {
        return { id: 'bty_' + id + '_' + i, name: ty[0], icon: ty[1], base: 'task',
          statuses: ty[2].map(function (s, j) { return { id: 'bcs_' + id + '_' + i + '_' + j, name: s[0], color: s[1], done: !!s[2] }; }) };
      }),
      defaultType: o.defType != null ? 'bty_' + id + '_' + o.defType : '',
      forms: (o.forms || []).map(function (fm, i) {
        return normalizeForm({ id: 'bfm_' + id + '_' + i, name: fm.name, desc: fm.desc || '', on: true,
          sec: 'bs_' + id + '_0', assignee: fm.role != null ? 'role:r' + fm.role : '', copy: true, follow: true,
          confirm: fm.confirm || '', again: true, titleQ: '',
          items: fm.items.map(function (q, j) {
            return { id: 'bq' + j, kind: q[0], label: q[1], req: !!q[2], opts: q[3] || [],
              map: q[4] ? String(q[4]).replace('#', 'bf_' + id + '_') : '',
              cond: q[5] ? { q: 'bq' + q[5][0], v: q[5][1] } : null, help: q[6] || '' };
          }) });
      }),
      automations: (o.autos || []).map(function (a, i) {
        return normalizeAuto({ id: 'bau_' + id + '_' + i, name: '', on: true, chain: false, by: null, at: null,
          trigger: a.trigger, paths: [{ conds: [], acts: a.acts }], els: null });
      }),
      taskTemplates: [], anchor: null, tasks: []
    };
    var n = 0;
    function mk(x) {
      var k = 'k' + (n++);
      var out = { k: k, name: x[0], notes: '', type: x[5] || 'task', ctype: null, cstatus: null, prio: x[6] || 'none',
        sec: 'bs_' + id + '_' + x[1], role: x[2] == null ? null : 'r' + x[2], s: x[3], d: x[4],
        st: null, dt: null, tags: [], fields: {}, deps: [], subs: (x[7] || []).map(function (s) { return mk([s, x[1], x[2], null, x[4]]); }) };
      return out;
    }
    data.tasks = (o.tasks || []).map(mk);
    (o.deps || []).forEach(function (d) {
      var a = data.tasks[d[0]], b = data.tasks[d[1]];
      if (a && b) a.deps.push({ k: b.k, type: 'FS' });
    });
    return { id: 'bt_' + id, builtin: true, name: o.name, desc: o.desc, icon: o.icon, color: o.color,
             skipWeekends: true, org: true, editors: [], users: [], data: data };
  }

  function builtinTemplates() {
    var doneSec = function (i) { return { trigger: { type: 'moved', sec: null }, acts: [{ type: 'complete', v: true }], _sec: i }; };
    var list = [
      { id: 'launch', icon: '🚀', color: '#796eff', name: L('แผนเปิดตัวสินค้าใหม่'),
        desc: L('เตรียมสินค้า การตลาด และช่องทางขาย ไล่ไปจนถึงวันเปิดตัว'),
        secs: [L('เตรียมงาน'), L('การตลาด'), L('ช่องทางขาย'), L('วันเปิดตัว')],
        fields: [[L('ช่องทาง'), 'select', [L('ออนไลน์'), L('หน้าร้าน'), L('โซเชียล')]],
                 [L('งบประมาณ'), 'number', [], { kind: 'currency', currency: 'THB', unit: '', decimals: 0 }]],
        roles: [L('ผู้จัดการผลิตภัณฑ์'), L('ทีมการตลาด'), L('ทีมขาย')],
        tasks: [
          [L('สรุปกลุ่มเป้าหมายและจุดขาย'), 0, 0, 0, 2, null, 'high'],
          [L('ยืนยันราคาและโปรโมชันเปิดตัว'), 0, 0, 2, 5, null, 'high'],
          [L('ทำอาร์ตเวิร์กและภาพสินค้า'), 1, 1, 3, 10, null, null, [L('ถ่ายภาพสินค้า'), L('ออกแบบโพสต์เปิดตัว')]],
          [L('วางแผนคอนเทนต์ก่อนเปิดตัว'), 1, 1, 5, 12],
          [L('เตรียมหน้าร้านออนไลน์'), 2, 2, 6, 14],
          [L('อบรมทีมขาย'), 2, 2, 10, 15],
          [L('วันเปิดตัว'), 3, 0, null, 20, 'milestone', 'urgent']
        ], deps: [[6, 4], [6, 5], [4, 2]], autos: [doneSec(3)] },
      /* Sprint 3 — เทมเพลตประชุม: วาระ → งานที่ต้องตามต่อ → ยกยอดไปครั้งหน้า → เสร็จแล้ว
       * งานที่ยังค้างย้ายไป "ยกยอดไปครั้งหน้า" ด้วยการย้ายเซกชัน แล้วคัดลอกโปรเจกต์/สร้างรอบใหม่จากเทมเพลตต่อได้ */
      { id: 'meeting', icon: '🗓️', color: '#14aaf5', name: L('ประชุมประจำสัปดาห์'),
        desc: L('วาระ มติ และงานที่ต้องตามต่อ — เขียนงานแบบ “ส่งสไลด์ @ชื่อ ศุกร์” ได้เลย'),
        secs: [L('วาระ'), L('งานที่ต้องตามต่อ'), L('ยกยอดไปครั้งหน้า'), L('เสร็จแล้ว')], view: 'board',
        fields: [],
        roles: [L('ประธาน'), L('เลขา')],
        tasks: [
          [L('ทบทวนงานค้างจากครั้งที่แล้ว'), 0, null, 0, 0],
          [L('อัปเดตความคืบหน้าแต่ละฝ่าย'), 0, null, 0, 0],
          [L('สรุปมติและมอบหมายงาน'), 0, null, 0, 0]
        ], autos: [doneSec(3)] },
      { id: 'design', icon: '🎨', color: '#e362e3', name: L('คำขอฝ่ายออกแบบ'),
        desc: L('รับคำของานออกแบบจากทุกฝ่ายผ่านฟอร์มเดียว แล้วติดตามจนส่งมอบ'),
        secs: [L('คำขอใหม่'), L('กำลังออกแบบ'), L('รอตรวจ'), L('ส่งมอบแล้ว')], view: 'board',
        fields: [[L('ประเภทงาน'), 'select', [L('โพสต์โซเชียล'), L('แบนเนอร์'), L('บรรจุภัณฑ์'), L('อื่น ๆ')]],
                 [L('ขนาด / สเปก'), 'text']],
        roles: [L('หัวหน้าทีมออกแบบ')],
        forms: [{ name: L('ขอรับงานออกแบบ'), desc: L('กรอกให้ครบ ทีมออกแบบจะติดต่อกลับภายใน 1 วันทำงาน'), role: 0,
          confirm: L('ได้รับคำขอแล้ว ทีมออกแบบจะติดต่อกลับ'),
          items: [['text', L('ชื่องาน'), true, null, 'name'],
                  ['select', L('ประเภทงาน'), true, [L('โพสต์โซเชียล'), L('แบนเนอร์'), L('บรรจุภัณฑ์'), L('อื่น ๆ')], 'field:#0'],
                  ['text', L('ขนาด / สเปก'), false, null, 'field:#1', [1, [L('แบนเนอร์'), L('บรรจุภัณฑ์')]]],
                  ['long', L('รายละเอียดและข้อความที่ต้องใส่'), true, null, 'notes'],
                  ['date', L('ต้องการใช้งานวันที่'), true, null, 'due'],
                  ['file', L('ไฟล์อ้างอิง'), false]] }],
        tasks: [[L('ตัวอย่าง: แบนเนอร์โปรโมชันเดือนหน้า'), 0, null, null, 5]], autos: [doneSec(3)] },
      { id: 'content', icon: '📅', color: '#14aaf5', name: L('ปฏิทินคอนเทนต์'),
        desc: L('วางแผนและผลิตคอนเทนต์รายเดือนทุกช่องทาง'),
        secs: [L('ไอเดีย'), L('เขียนบท'), L('ผลิต'), L('ลงแล้ว')], view: 'calendar',
        fields: [[L('ช่องทาง'), 'select', ['Facebook', 'Instagram', 'TikTok', 'YouTube']],
                 [L('รูปแบบ'), 'select', [L('วิดีโอสั้น'), L('ภาพนิ่ง'), L('บทความ')]]],
        roles: [L('ผู้วางแผนคอนเทนต์'), L('ครีเอทีฟ')],
        types: [[L('คอนเทนต์'), '📝', [[L('ไอเดีย'), '#9ca0a8'], [L('กำลังผลิต'), '#14aaf5'], [L('รอตรวจ'), '#f5a623'], [L('เผยแพร่แล้ว'), '#37c5ab', true]]]],
        defType: 0,
        tasks: [
          [L('วางธีมคอนเทนต์ประจำเดือน'), 0, 0, 0, 1],
          [L('คอนเทนต์สัปดาห์ที่ 1'), 1, 1, 1, 4],
          [L('คอนเทนต์สัปดาห์ที่ 2'), 1, 1, 5, 9],
          [L('คอนเทนต์สัปดาห์ที่ 3'), 1, 1, 10, 14],
          [L('คอนเทนต์สัปดาห์ที่ 4'), 1, 1, 15, 19],
          [L('สรุปผลประจำเดือน'), 0, 0, 20, 21]
        ] },
      { id: 'event', icon: '🎪', color: '#fd612c', name: L('แผนงานอีเวนต์'),
        desc: L('วางแผน ประสานงาน วันงาน และสรุปผลหลังงาน'),
        secs: [L('วางแผน'), L('ประสานงาน'), L('วันงาน'), L('หลังงาน')], view: 'timeline',
        fields: [[L('งบประมาณ'), 'number', [], { kind: 'currency', currency: 'THB', unit: '', decimals: 0 }]],
        roles: [L('ผู้จัดงาน'), L('ฝ่ายประสานงาน')],
        tasks: [
          [L('กำหนดวัตถุประสงค์และงบประมาณ'), 0, 0, 0, 2, null, 'high'],
          [L('จองสถานที่'), 0, 1, 2, 5],
          [L('เชิญแขกและผู้ร่วมงาน'), 1, 1, 5, 12],
          [L('เตรียมป้ายและของที่ระลึก'), 1, 1, 6, 14],
          [L('ซ้อมใหญ่'), 2, 0, 17, 17],
          [L('วันงาน'), 2, 0, null, 18, 'milestone', 'urgent'],
          [L('สรุปผลและค่าใช้จ่าย'), 3, 0, 19, 22]
        ], deps: [[2, 1], [4, 3], [5, 4], [6, 5]] },
      { id: 'it', icon: '🛠️', color: '#37c5ab', name: L('รับเรื่อง IT'),
        desc: L('รับแจ้งปัญหาไอทีผ่านฟอร์ม ติดตามด้วยสถานะ ปิดเรื่องแล้วย้ายคอลัมน์เอง'),
        secs: [L('เรื่องใหม่'), L('กำลังดำเนินการ'), L('รอผู้แจ้ง'), L('ปิดแล้ว')], view: 'board',
        fields: [[L('หมวด'), 'select', [L('ฮาร์ดแวร์'), L('ซอฟต์แวร์'), L('บัญชีผู้ใช้'), L('เครือข่าย')]],
                 [L('ความเร่งด่วน'), 'select', [L('ด่วน'), L('ปกติ'), L('ไม่ด่วน')]],
                 [L('เลขครุภัณฑ์'), 'text']],
        roles: [L('เจ้าหน้าที่ IT')],
        types: [[L('คำขอ IT'), '🎫', [[L('ใหม่'), '#9ca0a8'], [L('กำลังดำเนินการ'), '#14aaf5'], [L('รอผู้แจ้ง'), '#f5a623'], [L('แก้ไขแล้ว'), '#37c5ab', true]]]],
        defType: 0,
        forms: [{ name: L('แจ้งปัญหา IT'), desc: L('บอกอาการให้ละเอียด แนบภาพหน้าจอได้'), role: 0,
          confirm: L('ได้รับเรื่องแล้ว เจ้าหน้าที่ IT จะติดต่อกลับ'),
          items: [['text', L('เรื่องที่แจ้ง'), true, null, 'name'],
                  ['select', L('หมวด'), true, [L('ฮาร์ดแวร์'), L('ซอฟต์แวร์'), L('บัญชีผู้ใช้'), L('เครือข่าย')], 'field:#0'],
                  ['text', L('เลขครุภัณฑ์'), false, null, 'field:#2', [1, [L('ฮาร์ดแวร์')]]],
                  ['select', L('ความเร่งด่วน'), true, [L('ด่วน'), L('ปกติ'), L('ไม่ด่วน')], 'field:#1'],
                  ['long', L('อาการที่พบ'), true, null, 'notes'],
                  ['file', L('ภาพหน้าจอ'), false]] }],
        autos: [{ trigger: { type: 'cstatus', ctype: 'bty_it_0', v: 'bcs_it_0_3' }, acts: [{ type: 'section', sec: 'bs_it_3' }] }],
        tasks: [] },
      { id: 'onboard', icon: '👋', color: '#f5a623', name: L('Onboarding พนักงานใหม่'),
        desc: L('เตรียมความพร้อมก่อนวันเริ่มงาน จนถึงประเมินผลทดลองงาน'),
        secs: [L('ก่อนวันเริ่มงาน'), L('สัปดาห์แรก'), L('เดือนแรก'), L('ครบทดลองงาน')],
        roles: [L('หัวหน้างาน'), L('ฝ่ายบุคคล'), L('ฝ่าย IT'), L('พนักงานใหม่')],
        tasks: [
          [L('เตรียมสัญญาและเอกสารพนักงาน'), 0, 1, 0, 2],
          [L('เตรียมคอมพิวเตอร์และบัญชีผู้ใช้'), 0, 2, 0, 3],
          [L('แนะนำทีมและพาชมสำนักงาน'), 1, 0, 5, 5],
          [L('อบรมระบบงานภายใน'), 1, 1, 5, 7, null, null, [L('นโยบายบริษัท'), L('ระบบลางานและสวัสดิการ')]],
          [L('ตั้งเป้าหมาย 30 วันแรก'), 1, 3, 6, 9],
          [L('ทบทวนงานเดือนแรก'), 2, 0, null, 25],
          [L('ประเมินผลทดลองงาน'), 3, 0, null, 64, 'approval', 'high']
        ], deps: [[2, 1], [6, 5]] }
    ];
    return list.map(function (o) {
      (o.autos || []).forEach(function (a) { if (a._sec != null) { a.trigger.sec = 'bs_' + o.id + '_' + a._sec; delete a._sec; } });
      return btBuild(o);
    });
  }

  function projectTemplates() {
    return builtinTemplates().concat((db.projectTemplates || []).filter(ptCanUse));
  }
  function projectTemplate(id) {
    if (String(id || '').indexOf('bt_') === 0) return builtinTemplates().filter(function (x) { return x.id === id; })[0] || null;
    return (db.projectTemplates || []).filter(function (x) { return x.id === id; })[0] || null;
  }

  /** ถอดแบบโครงโปรเจกต์ (และงานถ้า withTasks) เป็น data ของเทมเพลต */
  function captureProject(pid, withTasks, skipWE) {
    var p = project(pid);
    var data = {
      description: p.description || '', workDays: p.workDays, defaultView: p.defaultView,
      views: p.views ? p.views.slice() : null, depShift: p.depShift ? clone(p.depShift) : null,
      sections: p.sections.map(function (s) { return { id: s.id, name: s.name }; }),
      fields: (p.fields || []).map(function (f) {
        if (f.lib) return { id: f.id, lib: true, name: f.name, type: f.type };
        var c = clone(f);
        if (c.type === 'id') c.next = 1;
        return c;
      }),
      types: clone(p.types || []), defaultType: p.defaultType || '',
      forms: (p.forms || []).map(function (f) { var c = clone(f); c.n = 0; c.last = null; return c; }),
      automations: (p.automations || []).map(function (a) {
        var c = clone(a);
        (c.paths || []).forEach(function (pt) { (pt.acts || []).forEach(function (x) { delete x.ptr; }); });
        return c;
      }),
      taskTemplates: clone(p.taskTemplates || []), roles: [], anchor: null, tasks: [],
      resources: clone(p.resources || []), brief: p.brief || '', dash: p.dash ? clone(p.dash) : null, msShow: p.msShow || 'open'
    };
    if (captureHook) captureHook.capture(p, data);
    var roleOf = {};
    function role(u) {
      if (!u || !user(u)) return null;
      if (!roleOf[u]) {
        roleOf[u] = 'r' + data.roles.length;
        /* text = ชื่อบทบาทจริงของโปรเจกต์ (ไม่ใช่ชื่อคน) ตอนใช้จึงใส่เป็นบทบาทในโปรเจกต์ใหม่ */
        var rt = p.roles && p.roles[u];
        data.roles.push({ k: roleOf[u], name: rt || user(u).name, user: u, text: !!rt });
      }
      return roleOf[u];
    }
    data.forms.forEach(function (f) { if (f.assignee) { var r = role(f.assignee); f.assignee = r ? 'role:' + r : ''; } });
    if (withTasks) {
      var all = [], anchor = null;
      var walk = function (t) { all.push(t); subtasks(t.id).forEach(walk); };
      tasksInProject(pid).forEach(function (x) { walk(x.task); });
      all.forEach(function (t) {
        [t.startOn, t.dueOn].forEach(function (d) { if (d && (!anchor || d < anchor)) anchor = d; });
      });
      anchor = anchor || today();
      data.anchor = anchor;
      var kOf = {};
      all.forEach(function (t, i) { kOf[t.id] = 'k' + i; });
      var fids = {};
      (p.fields || []).forEach(function (f) { if (f.type !== 'id') fids[f.id] = true; });
      var off = function (d) { return !d ? null : skipWE ? workdaysBetween(anchor, d) : daysBetween(anchor, d); };
      var snap = function (t, m) {
        var fv = {}, have = index().fvByTask[t.id] || {};
        Object.keys(have).forEach(function (fid) { if (fids[fid]) fv[fid] = clone(have[fid].value); });
        var cst = statusDef(t.cstatus);
        return { k: kOf[t.id], name: t.name, notes: t.notes || '', type: t.type, ctype: t.ctype || null,
          cstatus: cst && !cst.st.done ? t.cstatus : null, prio: t.priority, sec: m ? m.sectionId : null,
          role: role(t.assigneeId), s: off(t.startOn), d: off(t.dueOn), st: t.startTime, dt: t.dueTime,
          tags: (t.tags || []).slice(), fields: fv,
          deps: (t.dependsOn || []).filter(function (d) { return kOf[d.id]; }).map(function (d) { return { k: kOf[d.id], type: d.type || 'FS' }; }),
          subs: subtasks(t.id).map(function (s) { return snap(s, null); }) };
      };
      data.tasks = tasksInProject(pid).map(function (x) { return snap(x.task, x.membership); });
    }
    return data;
  }

  function canSaveTemplate(pid) { return !!project(pid) && can('structure') && canInProject(pid, 'edit'); }

  /** o = { name, desc, withTasks, skipWeekends, org } */
  function saveProjectTemplate(pid, o) {
    var p = project(pid);
    if (!p || !canSaveTemplate(pid)) return null;
    o = o || {};
    snapshot('บันทึกเป็นเทมเพลตโปรเจกต์');
    var x = {
      id: uid('pt'), name: String(o.name || p.name).trim().slice(0, 120) || p.name,
      desc: String(o.desc || '').slice(0, 1000), icon: p.icon, color: p.color,
      by: db.currentUserId, at: new Date().toISOString(),
      editors: [db.currentUserId], users: [], org: o.org !== false, skipWeekends: !!o.skipWeekends,
      data: captureProject(pid, !!o.withTasks, !!o.skipWeekends)
    };
    db.projectTemplates = db.projectTemplates || [];
    db.projectTemplates.push(x);
    audit('template.save', x.name, 'จากโปรเจกต์ {p}', { p: p.name });
    commit();
    return x;
  }

  /** แก้ชื่อ คำอธิบาย การแชร์ — patch = { name, desc, org, skipWeekends } */
  function updateProjectTemplate(id, patch) {
    var x = projectTemplate(id);
    if (!x || !ptCanEdit(x) || !patch) return false;
    snapshot('แก้เทมเพลตโปรเจกต์');
    if ('name' in patch) x.name = String(patch.name || '').trim().slice(0, 120) || x.name;
    if ('desc' in patch) x.desc = String(patch.desc || '').slice(0, 1000);
    if ('org' in patch) x.org = !!patch.org;
    if ('skipWeekends' in patch) x.skipWeekends = !!patch.skipWeekends;
    commit();
    return true;
  }

  /** สิทธิ์ของคนหนึ่งในเทมเพลต — 'edit' แก้ได้  'use' ใช้ได้  null เอาออก (ผู้แก้ต้องเหลืออย่างน้อยหนึ่งคน) */
  function setTemplateAccess(id, userId, level) {
    var x = projectTemplate(id);
    if (!x || !ptCanEdit(x) || !user(userId)) return false;
    var ed = (x.editors || []).filter(function (u) { return u !== userId; });
    var us = (x.users || []).filter(function (u) { return u !== userId; });
    if (level === 'edit') ed.push(userId);
    else if (level === 'use') us.push(userId);
    if (!ed.length) return false;
    snapshot('แชร์เทมเพลตโปรเจกต์');
    x.editors = ed;
    x.users = us;
    commit();
    return true;
  }

  function deleteProjectTemplate(id) {
    var x = projectTemplate(id);
    if (!x || !ptCanEdit(x)) return false;
    snapshot('ลบเทมเพลตโปรเจกต์');
    db.projectTemplates = db.projectTemplates.filter(function (y) { return y.id !== id; });
    audit('template.delete', x.name);
    commit();
    return true;
  }

  /**
   * สร้างโปรเจกต์จากเทมเพลต — o = { name, start: 'YYYY-MM-DD', roles: { r0: userId }, skipWeekends, icon, color }
   * งานจากเทมเพลตไม่ปลุกอัตโนมัติ "งานถูกเพิ่ม" (แบบเดียวกับ Asana) ฟิลด์จากคลังใช้ตัวเดิม ฟิลด์อื่นได้รหัสใหม่
   */
  function useProjectTemplate(id, o) {
    var tpl = projectTemplate(id);
    if (!tpl || !ptCanUse(tpl) || !can('structure')) return null;
    o = o || {};
    var d = clone(tpl.data || {});
    var start = /^\d{4}-\d\d-\d\d$/.test(o.start || '') ? o.start : today();
    var skip = 'skipWeekends' in o ? !!o.skipWeekends : !!tpl.skipWeekends;
    var roles = o.roles || {};
    var who = function (k) { var u = user(roles[k]); return u && u.active !== false ? u.id : null; };
    var day = function (n) {
      if (n === null || n === undefined) return null;
      return skip ? shiftDate(start, n, 'workdays', 'mon-fri') : addDays(start, n);
    };
    var out = null;
    batch('สร้างโปรเจกต์จากเทมเพลต “{t}”', { t: tpl.name }, function () {
      var secs = (d.sections && d.sections.length ? d.sections : [{ id: '_s', name: 'ค้างอยู่' }]);
      var p = createProjectRaw({ name: String(o.name || tpl.name).trim().slice(0, 120) || tpl.name,
        color: o.color || tpl.color, icon: o.icon || tpl.icon, description: d.description || tpl.desc || '',
        defaultView: d.defaultView, sections: secs.map(function (s) { return s.name; }),
        startOn: start });     // Sprint 1C — วันเริ่มที่เลือกตอนใช้เทมเพลตเห็นได้ในตั้งค่าโปรเจกต์ภายหลัง
      var idMap = {};
      secs.forEach(function (s, i) { idMap[s.id] = p.sections[i].id; });
      (d.fields || []).forEach(function (f) {
        if (f.lib) {
          var lf = libField(f.id);
          if (!lf) return;
          var lc = clone(lf);
          lc.lib = true;
          p.fields.push(normalizeFieldDef(lc));
          idMap[f.id] = f.id;
          return;
        }
        var nf = clone(f), old = nf.id;
        nf.id = uid('f');
        delete nf.lib;
        normalizeFieldDef(nf);
        if (nf.type === 'id') nf.next = 1;
        p.fields.push(nf);
        idMap[old] = nf.id;
      });
      p.workDays = d.workDays || 'all';
      p.views = d.views || null;
      if (d.depShift) p.depShift = clone(d.depShift);
      p.types = (d.types || []).map(function (ty) { return normalizeType(clone(ty)); });
      p.forms = (d.forms || []).map(function (f) { return normalizeForm(clone(f)); });
      p.taskTemplates = (d.taskTemplates || []).map(upgradeTaskTemplate).filter(Boolean);
      p.defaultType = d.defaultType || '';
      p.resources = clone(d.resources || []); p.brief = d.brief || ''; p.dash = d.dash ? clone(d.dash) : null; p.msShow = d.msShow || 'open';
      if (captureHook) captureHook.use(p, d);
      renewStructIds(p, idMap);
      p.forms.forEach(function (f) {
        if (String(f.assignee || '').indexOf('role:') === 0) f.assignee = who(f.assignee.slice(5)) || '';
      });
      remapStruct(p, idMap);
      p.automations = (d.automations || []).map(function (a) {
        var c = remapAuto(normalizeAuto(a), idMap);
        c.by = db.currentUserId;
        c.at = new Date().toISOString();
        return c;
      });
      (d.roles || []).forEach(function (r) { var u = who(r.k); if (u && r.text && !p.roles[u]) p.roles[u] = String(r.name).slice(0, 80); });
      dropIndex();
      var kMap = {}, pending = [], pos = {};
      var make = function (x, parentId) {
        var ty = x.ctype && idMap[x.ctype] ? typeDef(idMap[x.ctype]) : null;
        var a = x.role ? who(x.role) : null;
        var t = blankTask({ name: String(x.name || '').slice(0, 500) || 'งานใหม่', notes: x.notes || '',
          type: ty ? ty.base : (isBuiltinType(x.type) ? x.type : 'task'), priority: x.prio || 'none',
          assigneeId: a, startOn: x.type === 'milestone' ? null : day(x.s), dueOn: day(x.d),
          startTime: x.st || null, dueTime: x.dt || null, tags: (x.tags || []).slice(),
          parentId: parentId, createdBy: db.currentUserId, followers: a ? [a] : [] });
        if (!ty && !parentId && p.defaultType && !x.type) { /* ไม่มีชนิดในเทมเพลต ใช้ของเดิม */ }
        if (ty) {
          var cs = x.cstatus && idMap[x.cstatus];
          t.ctype = ty.id;
          t.cstatus = ty.statuses.some(function (s) { return s.id === cs; }) ? cs : ((firstStatus(ty, false) || {}).id || null);
        }
        if (t.followers.indexOf(db.currentUserId) < 0) t.followers.push(db.currentUserId);
        if (t.startOn && t.dueOn && t.startOn > t.dueOn) t.startOn = t.dueOn;
        db.tasks.push(t);
        kMap[x.k] = t.id;
        if (!parentId) {
          var sid = idMap[x.sec] || p.sections[0].id;
          pos[sid] = (pos[sid] || 0) + 1;
          db.memberships.push({ id: uid('m'), taskId: t.id, projectId: p.id, sectionId: sid, position: pos[sid] });
        }
        Object.keys(x.fields || {}).forEach(function (fid) {
          var nf = idMap[fid];
          if (!nf || !p.fields.some(function (f) { return f.id === nf && f.type !== 'id'; })) return;
          db.fieldValues.push({ taskId: t.id, fieldId: nf, value: clone(x.fields[fid]) });
        });
        log(t.id, 'สร้างจากเทมเพลต “{t}”', { t: tpl.name });
        pending.push([t, x.deps || []]);
        (x.subs || []).forEach(function (s) { make(s, t.id); });
      };
      (d.tasks || []).forEach(function (x) { make(x, null); });
      pending.forEach(function (pr) {
        pr[1].forEach(function (dp) {
          var b = kMap[dp.k];
          if (b && b !== pr[0].id && !pr[0].dependsOn.some(function (y) { return y.id === b; })) {
            pr[0].dependsOn.push({ id: b, type: dp.type || 'FS' });
          }
        });
      });
      audit('project.create', p.name, 'จากเทมเพลต {t}', { t: tpl.name });
      out = p;
    });
    return out;
  }

  /* ---------- รายงานสถานะแบบบล็อก ----------
   * statusLog[] = { id, state, title, text (สรุป), blocks: [{ k, title, text }], hl: [{ k, … ภาพ ณ ตอนรายงาน }], period, by, at }
   * ไฮไลต์เก็บเป็นภาพนิ่งตอนรายงาน (ตัวเลขไม่เปลี่ยนตามงานทีหลัง) project.statusLayout จำบล็อก/ไฮไลต์ล่าสุด */
  var STATUS_BLOCKS = [
    { k: 'summary', label: 'สรุป' },
    { k: 'done',    label: 'สิ่งที่ทำได้' },
    { k: 'blocked', label: 'สิ่งที่ติดขัด' },
    { k: 'next',    label: 'ขั้นต่อไป' },
    { k: 'custom',  label: 'หัวข้อกำหนดเอง' }
  ];
  var STATUS_HL = [
    { k: 'milestones', label: 'หมุดหมายที่เสร็จแล้ว' },
    { k: 'overdue',    label: 'งานที่เลยกำหนด' },
    { k: 'completed',  label: 'งานที่เสร็จในช่วงนี้' },
    { k: 'chart',      label: 'ภาพรวมความคืบหน้า' }
  ];
  var STATUS_PERIODS = [7, 14, 30];

  function defaultStatusLayout() {
    return { blocks: [{ k: 'summary', title: '' }, { k: 'done', title: '' }, { k: 'blocked', title: '' }, { k: 'next', title: '' }],
             hl: ['completed', 'overdue'], period: 7 };
  }
  function statusLayoutOf(pid) {
    var p = project(pid);
    return p && p.statusLayout ? clone(p.statusLayout) : defaultStatusLayout();
  }

  /** ภาพนิ่งของไฮไลต์ที่เลือก (ใช้ทั้งตัวอย่างในตัวสร้างและตอนบันทึก) */
  function statusHighlights(pid, keys, days) {
    var td = today(), since = addDays(td, -(days || 7));
    var items = tasksInProject(pid).map(function (x) { return x.task; });
    var brief = function (t) { return { id: t.id, name: t.name, d: t.dueOn || null, a: t.assigneeId || null }; };
    var done = function (t) { return t.completed && t.completedAt && String(t.completedAt).slice(0, 10) >= since; };
    return (keys || []).filter(function (k) { return STATUS_HL.some(function (x) { return x.k === k; }); }).map(function (k) {
      if (k === 'milestones') {
        var ms = items.filter(function (t) { return t.type === 'milestone' && done(t); });
        return { k: k, n: ms.length, items: ms.slice(0, 8).map(brief) };
      }
      if (k === 'overdue') {
        var od = items.filter(function (t) { return !t.completed && t.dueOn && t.dueOn < td; })
          .sort(function (a, b) { return a.dueOn < b.dueOn ? -1 : 1; });
        return { k: k, n: od.length, items: od.slice(0, 8).map(brief) };
      }
      if (k === 'completed') {
        var cd = items.filter(done);
        return { k: k, n: cd.length, items: cd.slice(0, 8).map(brief) };
      }
      var st = projectStats(pid), p = project(pid);
      return { k: 'chart', total: st.total, done: st.done, pct: st.percent, overdue: st.overdue,
        secs: p.sections.map(function (s) {
          var inS = tasksInSection(pid, s.id).map(function (x) { return x.task; });
          return { name: s.name, total: inS.length, done: inS.filter(function (t) { return t.completed; }).length };
        }) };
    });
  }

  /**
   * รายงานสถานะจากตัวสร้าง — o = { state, title, blocks: [{ k, title, text }], hl: [keys], period }
   * จำบล็อกทั้งหมด (รวมที่ว่าง) เป็นเลย์เอาต์ครั้งหน้า เก็บเฉพาะบล็อกที่มีข้อความลงรายงาน
   */
  function postStatusUpdate(pid, o) {
    var p = project(pid);
    if (!p || !o || !PROJECT_STATES.some(function (x) { return x.id === o.state; })) return null;
    var period = STATUS_PERIODS.indexOf(+o.period) >= 0 ? +o.period : 7;
    var all = (o.blocks || []).filter(function (b) { return b && STATUS_BLOCKS.some(function (x) { return x.k === b.k; }); })
      .slice(0, 10).map(function (b) {
        return { k: b.k, title: b.k === 'custom' ? String(b.title || '').trim().slice(0, 80) : '',
                 text: String(b.text || '').replace(/\r\n/g, '\n').trim().slice(0, 5000) };
      });
    var hl = (o.hl || []).filter(function (k, i, a) { return a.indexOf(k) === i && STATUS_HL.some(function (x) { return x.k === k; }); });
    var blocks = all.filter(function (b) { return b.text; });
    var summary = (blocks.filter(function (b) { return b.k === 'summary'; })[0] || blocks[0] || {}).text || '';
    snapshot('อัปเดตสถานะโปรเจกต์');
    var entry = { id: uid('ps'), state: o.state, title: String(o.title || '').trim().slice(0, 120), text: summary,
      blocks: blocks, hl: statusHighlights(pid, hl, period), period: period,
      by: db.currentUserId, at: new Date().toISOString() };
    p.status = { state: o.state, text: summary, title: entry.title, by: db.currentUserId, at: entry.at };   // Sprint 1C — เวลาเดียวกับรายการในประวัติ
    p.statusLog = p.statusLog || [];
    p.statusLog.push(stampStatus(p.statusLog, entry, statusSnapOf(pid)));   // Sprint 2C — ก่อน push จะได้เทียบกับรอบก่อนจริง
    if (p.statusLog.length > 30) p.statusLog = p.statusLog.slice(-30);
    p.statusLayout ={ blocks: all.map(function (b) { return { k: b.k, title: b.title }; }), hl: hl, period: period };
    var watchers = projectWatchers(pid, 'status');
    if (watchers.length) {
      notifyOnly(null, watchers, 'อัปเดตสถานะของ {p}', 'status', { p: p.name }, false,
        { projectId: pid, route: 'p-overview', ref: entry.id });      // Sprint 2B — โชว์สถานะ+บรรทัดแรกในกล่องแจ้งเตือน
    }
    closeRemindTask(p);
    commit();
    return entry;
  }

  function statusTemplates() { return (db.statusTemplates || []).slice(); }

  function saveStatusTemplate(name, layout) {
    var nm = String(name || '').trim().slice(0, 80);
    if (!nm || !layout) return null;
    snapshot('บันทึกเทมเพลตรายงานสถานะ');
    var x = { id: uid('sx'), name: nm, by: db.currentUserId,
      blocks: (layout.blocks || []).slice(0, 10).map(function (b) { return { k: b.k, title: String(b.title || '').slice(0, 80) }; }),
      hl: (layout.hl || []).slice(), period: STATUS_PERIODS.indexOf(+layout.period) >= 0 ? +layout.period : 7 };
    db.statusTemplates = db.statusTemplates || [];
    db.statusTemplates.push(x);
    commit();
    return x;
  }

  function deleteStatusTemplate(id) {
    var x = (db.statusTemplates || []).filter(function (y) { return y.id === id; })[0];
    if (!x || !(x.by === db.currentUserId || isAdmin())) return false;
    snapshot('ลบเทมเพลตรายงานสถานะ');
    db.statusTemplates = db.statusTemplates.filter(function (y) { return y.id !== id; });
    commit();
    return true;
  }

  function setStatusRemind(pid, on) {
    var p = project(pid);
    if (!p) return false;
    snapshot(on ? 'เปิดเตือนรายงานสถานะ' : 'ปิดเตือนรายงานสถานะ');
    p.statusRemind = !!on;
    commit();
    return true;
  }

  /** รายงานแล้ว — งานเตือนของสัปดาห์นี้ติ๊กเสร็จเอง (ไม่ commit) */
  function closeRemindTask(p) {
    var t = p && p.remindTask ? task(p.remindTask) : null;
    if (!t || t.completed) return;
    t.completed = true;
    t.completedAt = today();
    log(t.id, 'ทำงานนี้เสร็จแล้ว');
  }

  /**
   * เตือนรายงานสถานะทุกวันศุกร์ — งานส่วนตัวมอบให้เจ้าของโปรเจกต์ที่เปิด "เตือนทุกวันศุกร์" ไว้
   * สร้างตอนมีคนเปิดแอปวันศุกร์ (ไม่มีเซิร์ฟเวอร์) ข้ามถ้ารายงานสัปดาห์นี้แล้ว กันซ้ำด้วย project.remindKey
   * @param opts.today  ใช้แทนวันนี้ (ทดสอบวันศุกร์ในวันอื่น)
   */
  function checkStatusReminders(opts) {
    if (!db || !isActive()) return 0;
    var td = (opts && opts.today) || today();
    if (new Date(td + 'T00:00:00').getDay() !== 5) return 0;
    var list = db.projects.filter(function (p) {
      var o = user(p.owner);
      return !p.archived && p.statusRemind && p.remindKey !== td && o && o.active !== false;
    });
    if (!list.length) return 0;
    var mon = addDays(td, -4), n = 0;
    quietBatch(function () {
      list.forEach(function (p) {
        p.remindKey = td;
        var last = (p.statusLog || [])[(p.statusLog || []).length - 1];
        if (last && String(last.at).slice(0, 10) >= mon) return;
        var t = blankTask({ name: L('อัปเดตสถานะโปรเจกต์ {p}', { p: p.name }),
          notes: L('ถึงเวลารายงานสถานะประจำสัปดาห์ของ') + ' @[' + refLabel(p.name) + '](' + p.id + ')',
          assigneeId: p.owner, dueOn: td, createdBy: p.owner, followers: [p.owner] });
        db.tasks.push(t);
        log(t.id, 'สร้างงานเตือนรายงานสถานะประจำสัปดาห์', null, [p.owner]);
        notifyOnly(t.id, [p.owner], 'มอบหมายงาน “{t}” ให้คุณ', 'assigned', { t: t.name });
        p.remindTask = t.id;
        n++;
      });
    });
    return n;
  }

  /* ---------- อัตโนมัติของ 3b ---------- */
  autoRegister('trigger', { id: 'form', label: 'มีคนส่งฟอร์ม',
    match: function (tr, ev) { return !tr.form || ev.info.form === tr.form; } });
  autoRegister('trigger', { id: 'cstatus', label: 'สถานะของชนิดงานเปลี่ยน',
    match: function (tr, ev) { return (!tr.ctype || ev.info.type === tr.ctype) && (!tr.v || ev.info.v === tr.v); } });
  autoRegister('action', { id: 'setstatus', label: 'ตั้งสถานะของชนิดงาน', task: true, run: function (a, ctx) {
    var t = needTask(ctx), sd = statusDef(a.v);
    if (!sd) throw autoErr('สถานะนี้ถูกลบไปแล้ว');
    setStatusRaw(t, sd.st.id);
  } });

  /* ---------- backup ---------- */

  /* สำรองทั้งก้อนสำหรับผู้ดูแล — สมุดโน้ตส่วนตัวของคนอื่นไม่ออกไปกับไฟล์ (2c)
   * สมุดโน้ตเป็นของเจ้าตัวคนเดียว ผู้ดูแลมีสิทธิ์สำรองระบบ ไม่ได้มีสิทธิ์อ่านโน้ตของใคร
   * ของตัวเองยังอยู่ในไฟล์ เพราะคนกดคือเจ้าของ */
  function exportJSON() {
    var out = JSON.parse(JSON.stringify(db));
    Object.keys(out.personal || {}).forEach(function (who) {
      if (who !== db.currentUserId && out.personal[who]) delete out.personal[who].notepad;
    });
    /* 3c — หน้าส่วนตัว (รวมสมุดโน้ต) ของคนอื่นไม่ออกไปกับไฟล์สำรอง */
    out.pages = (out.pages || []).filter(function (x) { return !x.private || x.owner === db.currentUserId; });
    return JSON.stringify(out, null, 2);
  }

  function importJSON(text) {
    var parsed = JSON.parse(text);
    if (!parsed.projects || !parsed.tasks) throw new Error('ไฟล์ไม่ถูกรูปแบบ');
    snapshot('กู้คืนข้อมูล');
    /* ไฟล์สำรองไม่มีสมุดโน้ตของคนอื่น (ดู exportJSON) — กู้คืนแล้วต้องไม่ล้างโน้ตที่มีอยู่ทิ้ง */
    if (!parsed.personal || typeof parsed.personal !== 'object' || Array.isArray(parsed.personal)) parsed.personal = {};
    Object.keys(db.personal || {}).forEach(function (who) {
      var cur = db.personal[who];
      if (!cur || !cur.notepad) return;
      var inc = parsed.personal[who];
      if (!inc || typeof inc !== 'object') parsed.personal[who] = inc = {};
      if (typeof inc.notepad !== 'string') inc.notepad = cur.notepad;
    });
    /* 3c — หน้าส่วนตัวของคนอื่นไม่อยู่ในไฟล์สำรอง เก็บของที่มีอยู่ไว้ */
    var incPages = Array.isArray(parsed.pages) ? parsed.pages : [];
    (db.pages || []).forEach(function (x) {
      if (x.private && x.owner !== db.currentUserId && !incPages.some(function (y) { return y.id === x.id; })) incPages.push(x);
    });
    parsed.pages = incPages;
    db = migrate(parsed);
    dropIndex();
    commit();
  }

  function reset() {
    snapshot('ล้างข้อมูล');
    db = migrate(seed());
    dropIndex();
    audit("system.reset", null, "ล้างข้อมูลทั้งหมดและเริ่มใหม่");
    commit();
  }

  /* ---------- init ---------- */

  global.I18N.setLang(global.I18N.detect());
  /* ====================== 3c — ภาพรวม แดชบอร์ด ประกาศ เส้นทางวิกฤต ======================
   *   project.resources[]  { id, kind: link|file, name, url, size, mime, by, at }  ทรัพยากรสำคัญ (ไฟล์ ≤ 2 MB data URI)
   *   project.brief        บรีฟโปรเจกต์ มาร์กดาวน์ย่อแบบบล็อก (หัวข้อ ตาราง @อ้างถึง)  briefBy / briefAt
   *   project.msShow       'open' | 'all'  แผงหมุดหมายบนภาพรวม
   *   project.dash         null = แดชบอร์ดตั้งต้น | [widget] (≤ 20) ดู normalizeWidget
   *   message.replies[] { id, by, at, body, atts }  message.followers[]  message.atts[] { id, name, url, size, mime } */
  var RES_MAX = 30, FILE_BYTES = 2 * 1024 * 1024, DASH_MAX = 20, MSG_ATT_MAX = 5;
  var renewHook = null, remapHook = null, captureHook = null;   // ส่วนที่ 2 (หน้าเอกสาร) เสียบเพิ่ม

  function migrate3c(d) {
    d.projects.forEach(function (p) {
      p.resources = Array.isArray(p.resources) ? p.resources.filter(function (r) { return r && r.id; }) : [];
      if (typeof p.brief !== 'string') p.brief = '';
      p.dash = Array.isArray(p.dash) ? p.dash.filter(function (w) { return w && w.id; }).map(normalizeWidget) : null;
      if (p.msShow !== 'all') p.msShow = 'open';
      (p.messages || []).forEach(function (m) {
        m.replies = Array.isArray(m.replies) ? m.replies.filter(function (r) { return r && r.id; }) : [];
        m.followers = Array.isArray(m.followers) ? m.followers : (m.by ? [m.by] : []);
        m.atts = Array.isArray(m.atts) ? m.atts : [];
      });
    });
    if (typeof migrate3cPart2 === 'function') migrate3cPart2(d);
  }

  function canEditOverview(pid) { return !!project(pid) && can('structure') && canInProject(pid, 'edit'); }

  function cleanFile(f) {
    if (!f || !f.name) return null;
    /* 4b — ไฟล์ที่อัปขึ้น SharePoint/OneDrive แล้ว เก็บแค่ข้อมูลอ้างอิง */
    if (f.driveItemId) return withRemote({ id: uid('fa'), name: String(f.name).slice(0, 200), size: f.size || null, mime: f.mime || null }, f);
    var url = String(f.url || '');
    if (!/^data:/.test(url) || url.length > FILE_BYTES * 1.4) return null;
    return { id: uid('fa'), name: String(f.name).slice(0, 200), url: url, size: f.size || null, mime: f.mime || null };
  }

  /* ---------- ทรัพยากรสำคัญ ---------- */
  function addResource(pid, r) {
    var p = project(pid);
    if (!p || !canEditOverview(pid) || !r) return null;
    if (p.resources.length >= RES_MAX) return null;
    var x;
    if (r.kind === 'file') {
      var f = cleanFile(r);
      if (!f) return null;
      x = withRemote({ id: uid('kr'), kind: 'file', name: f.name, url: f.url, size: f.size, mime: f.mime }, f);
    } else {
      var u = String(r.url || '').trim();
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(u)) return null;
      x = { id: uid('kr'), kind: 'link', name: String(r.name || u).trim().slice(0, 200) || u, url: u.slice(0, 2000) };
    }
    x.by = db.currentUserId; x.at = new Date().toISOString();
    snapshot('เพิ่มทรัพยากรสำคัญ');
    p.resources.push(x);
    commit();
    return x;
  }
  function removeResource(pid, id) {
    var p = project(pid);
    if (!p || !canEditOverview(pid)) return false;
    var n = p.resources.length;
    snapshot('ลบทรัพยากรสำคัญ');
    p.resources = p.resources.filter(function (r) { return r.id !== id; });
    commit();
    return p.resources.length < n;
  }
  function moveResource(pid, id, delta) {
    var p = project(pid);
    if (!p || !canEditOverview(pid)) return false;
    var i = p.resources.map(function (r) { return r.id; }).indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= p.resources.length) return false;
    snapshot('จัดลำดับทรัพยากรสำคัญ');
    var x = p.resources.splice(i, 1)[0];
    p.resources.splice(j, 0, x);
    commit();
    return true;
  }

  /* ---------- บรีฟโปรเจกต์ ---------- */
  function setBrief(pid, md) {
    var p = project(pid);
    if (!p || !canEditOverview(pid)) return false;
    md = String(md || '').slice(0, 60000);
    if (md === p.brief) return false;
    var before = p.brief;
    snapshot('แก้บรีฟโปรเจกต์');
    p.brief = md;
    p.briefBy = db.currentUserId;
    p.briefAt = new Date().toISOString();
    var was = parseMentions(before);
    var now = parseMentions(md).filter(function (u) { return was.indexOf(u) < 0; });
    if (now.length) notifyOnly(null, now, 'พูดถึงคุณในบรีฟของ {p}', 'mention', { p: p.name }, false,
      { projectId: pid, route: 'p-overview' });
    commit();
    return true;
  }

  /* ---------- หมุดหมายบนภาพรวม ---------- */
  function projectMilestones(pid, all) {
    var out = [];
    tasksInProject(pid).forEach(function (x) {
      var walk = function (t) {
        if (t.type === 'milestone' && canSeeTask(t.id) && (all || !t.completed)) out.push(t);
        subtasks(t.id).forEach(walk);
      };
      walk(x.task);
    });
    return out.sort(function (a, b) {
      var da = a.dueOn || '9999', dbb = b.dueOn || '9999';
      return da < dbb ? -1 : da > dbb ? 1 : a.name.localeCompare(b.name);
    });
  }
  function addMilestone(pid, name, due) {
    var p = project(pid);
    if (!p || !String(name || '').trim()) return null;
    return createTask({ name: String(name).trim().slice(0, 300), type: 'milestone', dueOn: due || null,
      createdBy: db.currentUserId }, pid, p.sections[0].id);
  }
  function setMsShow(pid, v) {
    var p = project(pid);
    if (!p) return;
    p.msShow = v === 'all' ? 'all' : 'open';
    commit();
  }

  /* ---------- แดชบอร์ดของโปรเจกต์ ----------
   * widget = { id:'dw_…', kind, title, x, y, split, filters:[{f,op,v}], full, text, bench, unit, n, date }
   *   kind   bar | stack | group | line | burnup | burndown | donut | number | lollipop | text
   *   x      assignee | section | priority | type | cstatus | completed | period | field:<id> (select/person/multi)
   *   y      count | sum:<fieldId> | avg:<fieldId> | est | actual (ชั่วโมง ตามเวลาที่ประมาณ/บันทึก)
   *   split  ชุดข้อมูลของแท่งซ้อน/แท่งกลุ่ม (ค่าเดียวกับ x ยกเว้น period)
   *   unit/n ช่วงเวลา day|week|month ย้อนหลัง n ช่วง (x = period, เบิร์นอัพ/เบิร์นดาวน์)
   *   date   วันที่ที่ใช้จัดลงช่วงเวลา created | completedOn | due
   * chartData(items, w, pid) คืน { cats, series, values, number, bench } ส่งต่อให้ Charts.svg ได้เลย (4b ใช้ซ้ำ) */
  var DASH_KINDS = [
    ['bar', 'แท่ง'], ['stack', 'แท่งซ้อน'], ['group', 'แท่งกลุ่ม'], ['line', 'เส้น'], ['burnup', 'เบิร์นอัพ'],
    ['burndown', 'เบิร์นดาวน์'], ['donut', 'โดนัท'], ['number', 'ตัวเลข'], ['lollipop', 'อมยิ้ม'], ['text', 'ข้อความ']
  ];
  var DASH_X = [['assignee', 'ผู้รับผิดชอบ'], ['section', 'เซกชัน'], ['priority', 'ความสำคัญ'], ['type', 'ชนิดงาน'],
    ['cstatus', 'สถานะ (ชนิดงาน)'], ['completed', 'เสร็จ/ยังไม่เสร็จ'], ['period', 'ช่วงเวลา']];
  var DASH_UNITS = [['day', 'วัน'], ['week', 'สัปดาห์'], ['month', 'เดือน']];
  var DASH_DATES = [['completedOn', 'วันที่ทำเสร็จ'], ['created', 'วันที่สร้าง'], ['due', 'กำหนดส่ง']];

  function normalizeWidget(w) {
    var k = DASH_KINDS.map(function (x) { return x[0]; });
    if (k.indexOf(w.kind) < 0) w.kind = 'bar';
    w.title = String(w.title || '').slice(0, 120);
    if (typeof w.x !== 'string' || !w.x) w.x = 'section';
    if (typeof w.y !== 'string' || !w.y) w.y = 'count';
    if (typeof w.split !== 'string') w.split = '';
    w.filters = Array.isArray(w.filters) ? w.filters.filter(function (c) { return c && c.f; }).slice(0, 10) : [];
    w.full = !!w.full;
    w.text = String(w.text || '').slice(0, 20000);
    w.bench = w.bench === '' || w.bench == null || isNaN(+w.bench) ? null : +w.bench;
    if (['day', 'week', 'month'].indexOf(w.unit) < 0) w.unit = 'week';
    w.n = Math.max(2, Math.min(36, parseInt(w.n, 10) || 8));
    if (['created', 'completedOn', 'due'].indexOf(w.date) < 0) w.date = 'completedOn';
    return w;
  }

  function defaultDash() {
    return [
      { id: 'dw_d1', kind: 'number', title: 'งานทั้งหมด', y: 'count' },
      { id: 'dw_d2', kind: 'number', title: 'เสร็จแล้ว', y: 'count', filters: [{ f: 'completed', op: 'yes', v: null }] },
      { id: 'dw_d3', kind: 'number', title: 'เลยกำหนด', y: 'count', filters: [{ f: 'due', op: 'overdue', v: null }, { f: 'completed', op: 'no', v: null }] },
      { id: 'dw_d4', kind: 'donut', title: 'ความคืบหน้ารวม', x: 'completed' },
      { id: 'dw_d5', kind: 'stack', title: 'งานตามผู้รับผิดชอบ', x: 'assignee', split: 'completed' },
      { id: 'dw_d6', kind: 'bar', title: 'งานตามเซกชัน', x: 'section' },
      { id: 'dw_d7', kind: 'burnup', title: 'เบิร์นอัพ', unit: 'week', n: 8, full: true }
    ].map(normalizeWidget);
  }

  function dashWidgets(pid) {
    var p = project(pid);
    if (!p) return [];
    return p.dash ? p.dash : defaultDash();
  }
  function canEditDash(pid) { return canEditOverview(pid); }
  function dashEdit(pid, label, fn) {
    var p = project(pid);
    if (!p || !canEditDash(pid)) return false;
    snapshot(label);
    if (!p.dash) p.dash = defaultDash();
    var out = fn(p.dash, p);
    commit();
    return out === undefined ? true : out;
  }
  function saveWidget(pid, w) {
    return dashEdit(pid, 'แก้แดชบอร์ด', function (list) {
      var c = normalizeWidget(clone(w));
      var at = list.map(function (x) { return x.id; }).indexOf(c.id);
      if (at >= 0) { list[at] = c; return c; }
      if (list.length >= DASH_MAX) return null;
      c.id = uid('dw');
      list.push(c);
      return c;
    });
  }
  function deleteWidget(pid, id) {
    return dashEdit(pid, 'ลบวิดเจ็ต', function (list, p) {
      p.dash = list.filter(function (x) { return x.id !== id; });
    });
  }
  function duplicateWidget(pid, id) {
    return dashEdit(pid, 'ทำสำเนาวิดเจ็ต', function (list) {
      var at = list.map(function (x) { return x.id; }).indexOf(id);
      if (at < 0 || list.length >= DASH_MAX) return null;
      var c = clone(list[at]);
      c.id = uid('dw');
      list.splice(at + 1, 0, c);
      return c;
    });
  }
  function moveWidget(pid, id, delta) {
    return dashEdit(pid, 'จัดลำดับวิดเจ็ต', function (list) {
      var i = list.map(function (x) { return x.id; }).indexOf(id), j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return false;
      var x = list.splice(i, 1)[0];
      list.splice(j, 0, x);
    });
  }
  function setWidgetFull(pid, id, full) {
    return dashEdit(pid, 'ปรับขนาดวิดเจ็ต', function (list) {
      list.forEach(function (x) { if (x.id === id) x.full = !!full; });
    });
  }
  function resetDash(pid) {
    return dashEdit(pid, 'คืนแดชบอร์ดตั้งต้น', function (list, p) { p.dash = null; });
  }

  /** ฟิลด์ที่ใช้เป็นแกน X / ชุดข้อมูล (ตัวเลือก คน หลายตัวเลือก) และแกน Y (ตัวเลข) ของโปรเจกต์ */
  function dashFieldChoices(pid, numeric) {
    var p = project(pid);
    return ((p && p.fields) || []).filter(function (f) {
      var k = fieldKind(f);
      return numeric ? k === 'number' : (k === 'select' || k === 'person' || k === 'multi');
    });
  }
  /** ชนิดของค่าฟิลด์ตอนกรอง/เรียง/สรุป (สูตรและฟิลด์อ้างอิงต่อยอดในส่วนที่ 2) */
  function fieldKind(f) {
    if (!f) return null;
    if (f.type === 'id') return 'text';
    if (fieldKindHook) { var k = fieldKindHook(f); if (k) return k; }
    return f.type;
  }
  var fieldKindHook = null;

  /** ค่า Y ของงานหนึ่งชิ้น */
  function yOf(t, y) {
    if (!y || y === 'count') return 1;
    if (yHook) { var hv = yHook(t, y); if (hv !== undefined) return hv; }
    var m = y.match(/^(sum|avg):(.+)$/);
    if (m) {
      var v = fieldValue(t.id, m[2]);
      return v === null || v === undefined || v === '' || isNaN(+v) ? null : +v;
    }
    return 1;
  }
  var yHook = null;

  function aggregate(vals, y) {
    var nums = vals.filter(function (v) { return v !== null && v !== undefined && isFinite(v); });
    if (/^avg:/.test(y || '')) return nums.length ? nums.reduce(function (a, b) { return a + b; }, 0) / nums.length : 0;
    return nums.reduce(function (a, b) { return a + b; }, 0);
  }

  /** หมวดของงานตามมิติ — คืนอาร์เรย์คีย์ (หลายตัวเลือกได้หลายหมวด) */
  function catKeys(t, m, by) {
    switch (by) {
      case 'assignee': return [t.assigneeId || ''];
      case 'section': return [m ? m.sectionId : ''];
      case 'priority': return [t.priority && t.priority !== 'none' ? t.priority : ''];
      case 'type': return [t.ctype || t.type || 'task'];
      case 'cstatus': return [t.cstatus || ''];
      case 'completed': return [t.completed ? 'done' : 'open'];
      case 'project': return [m ? m.projectId : ''];         // 4b — รายงานข้ามโปรเจกต์
    }
    if (by && by.indexOf('field:') === 0) {
      var v = fieldValue(t.id, by.slice(6));
      if (Array.isArray(v)) return v.length ? v.slice() : [''];
      return [v === null || v === undefined ? '' : String(v)];
    }
    return [''];
  }

  /** ป้าย สี และลำดับของหมวดทั้งหมดของมิติหนึ่ง */
  function catDefs(pid, by, seen) {
    var p = project(pid), out = [];
    var none = { key: '', label: L('ไม่ระบุ'), color: 'var(--fg-faint)' };
    if (by === 'completed') return [{ key: 'open', label: L('ยังไม่เสร็จ'), color: 'var(--chart-1)' },
      { key: 'done', label: L('เสร็จแล้ว'), color: 'var(--ok)' }];
    if (by === 'section') out = ((p && p.sections) || []).map(function (s) { return { key: s.id, label: s.name }; });
    else if (by === 'project') out = Object.keys(seen).filter(function (k) { return k && project(k); })
      .map(function (k) { var pp = project(k); return { key: k, label: pp.name, color: pp.color }; });
    else if (by === 'priority') out = PRIORITIES.filter(function (x) { return x.id !== 'none'; })
      .map(function (x) { return { key: x.id, label: L(x.label), color: x.color }; });
    else if (by === 'assignee' || (by.indexOf('field:') === 0 && (fieldDef(by.slice(6)) || {}).type === 'person')) {
      out = Object.keys(seen).filter(function (k) { return k && user(k); }).map(function (k) {
        var u = user(k); return { key: k, label: u.name, color: u.color };
      }).sort(function (a, b) { return a.label.localeCompare(b.label); });
    } else if (by === 'type') {
      out = typeChoices(pid).map(function (x) { return { key: x.id, label: (x.custom ? x.icon + ' ' : '') + L(x.label) }; });
    } else if (by === 'cstatus') {
      out = statusChoices(pid).map(function (x) { return { key: x[0], label: x[1], color: x[2] }; });
    } else if (by.indexOf('field:') === 0) {
      var f = fieldDef(by.slice(6));
      out = ((f && f.options) || []).map(function (o) { return { key: o.name, label: o.name, color: o.color }; });
    }
    var known = {};
    out.forEach(function (c) { known[c.key] = true; });
    Object.keys(seen).forEach(function (k) { if (k && !known[k]) out.push({ key: k, label: k }); });
    if (seen['']) out.push(none);
    return out.filter(function (c) { return seen[c.key]; });
  }

  /** จุดเริ่มของช่วงเวลาที่วันนี้อยู่ */
  function periodStart(d, unit) {
    if (unit === 'day') return d;
    if (unit === 'month') return d.slice(0, 8) + '01';
    var dt = new Date(d + 'T00:00:00');
    var dow = (dt.getDay() + 6) % 7;
    return addDays(d, -dow);
  }
  function periodNext(d, unit) {
    return unit === 'day' ? addDays(d, 1) : unit === 'month' ? addMonths(d, 1) : addDays(d, 7);
  }
  function periodCats(w) {
    var td = today(), cur = periodStart(td, w.unit), list = [cur];
    for (var i = 1; i < w.n; i++) {
      cur = w.unit === 'day' ? addDays(cur, -1) : w.unit === 'month' ? addMonths(cur, -1) : addDays(cur, -7);
      list.unshift(cur);
    }
    return list.map(function (s) { return { key: s, label: periodLabelOf(s, w.unit), end: periodNext(s, w.unit) }; });
  }
  /* Sprint 1C — ป้ายแกนของกราฟตามช่วงเวลา เดิมเป็น "10/05" (เดือน/วัน) ซึ่งคนไทยอ่านเป็นวันที่ 10 พ.ค.
   * ใช้ วัน + ชื่อเดือนย่อตามภาษา ("5 ต.ค." / "5 Oct") ช่วงรายเดือนใช้ เดือน + ปี ("ต.ค. 69" / "Oct 2026") */
  function periodLabelOf(s, unit) {
    var p = s.split('-'), mon = global.I18N.monthsShort()[parseInt(p[1], 10) - 1];
    if (unit === 'month') {
      var y = parseInt(p[0], 10);
      return mon + ' ' + (global.I18N.getLang() === 'en' ? y : global.I18N.yearShort(y));
    }
    return parseInt(p[2], 10) + ' ' + mon;
  }
  function dateOfTask(t, which) {
    if (which === 'created') return t.createdAt ? String(t.createdAt).slice(0, 10) : null;
    if (which === 'due') return t.dueOn || null;
    return t.completedAt ? String(t.completedAt).slice(0, 10) : null;
  }

  /** งานของโปรเจกต์ที่ผ่านตัวกรองของวิดเจ็ต [{ task, membership }] */
  function dashItems(pid, w) {
    return tasksInProject(pid).filter(function (x) {
      if (!canSeeTask(x.task.id)) return false;
      return (w.filters || []).every(function (c) { return matchCond(x.task, c, x.membership); });
    });
  }

  function chartData(items, w, pid) {
    w = normalizeWidget(clone(w));
    var out = { cats: [], series: [], values: [], number: null, bench: w.bench };
    if (w.kind === 'number') {
      out.number = { value: aggregate(items.map(function (x) { return yOf(x.task, w.y); }), w.y) };
      return out;
    }
    if (w.kind === 'burnup' || w.kind === 'burndown') {
      var cats = periodCats(w);
      out.cats = cats.map(function (c) { return { key: c.key, label: c.label }; });
      var scope = [], done = [];
      cats.forEach(function (c) {
        var s = 0, d = 0;
        items.forEach(function (x) {
          var t = x.task, cr = dateOfTask(t, 'created') || '0000', co = t.completed ? (dateOfTask(t, 'completedOn') || cr) : null;
          if (cr < c.end) { s += yOf(t, w.y) || 0; if (co && co < c.end) d += yOf(t, w.y) || 0; }
        });
        scope.push(s); done.push(d);
      });
      if (w.kind === 'burnup') {
        out.series = [{ key: 'scope', label: L('งานทั้งหมด'), color: 'var(--fg-faint)' }, { key: 'done', label: L('เสร็จแล้ว'), color: 'var(--ok)' }];
        out.values = cats.map(function (c, i) { return [scope[i], done[i]]; });
      } else {
        var rem = cats.map(function (c, i) { return scope[i] - done[i]; });
        var first = rem[0] || 0, n = Math.max(1, cats.length - 1);
        out.series = [{ key: 'left', label: L('คงเหลือ'), color: 'var(--chart-1)' }, { key: 'ideal', label: L('เส้นอุดมคติ'), color: 'var(--fg-faint)', dash: true }];
        out.values = cats.map(function (c, i) { return [rem[i], Math.max(0, first - first * i / n)]; });
      }
      return out;
    }
    var byPeriod = w.x === 'period';
    var split = (w.kind === 'stack' || w.kind === 'group') && w.split && w.split !== w.x && w.split !== 'period' ? w.split : '';
    var bucket = {}, seenX = {}, seenS = {}, pcats = byPeriod ? periodCats(w) : null;
    items.forEach(function (x) {
      var t = x.task, xs;
      if (byPeriod) {
        var d = dateOfTask(t, w.date);
        if (!d) return;
        var hit = pcats.filter(function (c) { return d >= c.key && d < c.end; })[0];
        if (!hit) return;
        xs = [hit.key];
      } else xs = catKeys(t, x.membership, w.x);
      var ss = split ? catKeys(t, x.membership, split) : ['v'];
      var yv = yOf(t, w.y);
      xs.forEach(function (xk) {
        seenX[xk] = true;
        ss.forEach(function (sk) {
          seenS[sk] = true;
          var key = xk + '\u0001' + sk;
          (bucket[key] = bucket[key] || []).push(yv);
        });
      });
    });
    out.cats = byPeriod ? pcats.map(function (c) { return { key: c.key, label: c.label }; }) : catDefs(pid, w.x, seenX);
    out.series = split ? catDefs(pid, split, seenS) : [{ key: 'v', label: '' }];
    out.values = out.cats.map(function (c) {
      return out.series.map(function (s) {
        var b = bucket[c.key + '\u0001' + s.key];
        return b ? aggregate(b, w.y) : 0;
      });
    });
    return out;
  }

  /** งานที่อยู่ในแท่ง/ชิ้นที่ถูกคลิก */
  function dashClickTasks(pid, wid, cat, ser) {
    var w = dashWidgets(pid).filter(function (x) { return x.id === wid; })[0];
    if (!w) return [];
    var items = dashItems(pid, w);
    if (w.kind === 'number' || cat === '' && w.kind !== 'donut') return items.map(function (x) { return x.task; });
    var unitW = normalizeWidget(clone(w));
    return items.filter(function (x) {
      var t = x.task;
      if (w.kind === 'burnup' || w.kind === 'burndown' || w.x === 'period') {
        var d = w.x === 'period' ? dateOfTask(t, unitW.date) : (dateOfTask(t, 'completedOn') || dateOfTask(t, 'created'));
        return !!d && d >= cat && d < periodNext(cat, unitW.unit);
      }
      if (catKeys(t, x.membership, w.x).indexOf(cat) < 0) return false;
      if (ser && ser !== 'v' && w.split) return catKeys(t, x.membership, w.split).indexOf(ser) >= 0;
      return true;
    }).map(function (x) { return x.task; });
  }

  /* ---------- ประกาศ: คำตอบ เข้าร่วม/ออก ไฟล์แนบ ---------- */
  function findMessage(pid, msgId) {
    var p = msgHost(pid);
    return p ? (p.messages || []).filter(function (m) { return m.id === msgId; })[0] || null : null;
  }
  function addMessageReply(pid, msgId, body, atts) {
    var p = msgHost(pid), m = findMessage(pid, msgId);
    if (!m || !String(body || '').trim() || !canInProject(pid, 'comment')) return null;
    snapshot('ตอบประกาศ');
    var r = { id: uid('pr'), by: db.currentUserId, at: new Date().toISOString(), body: String(body).trim().slice(0, 20000),
      atts: (atts || []).map(cleanFile).filter(Boolean).slice(0, MSG_ATT_MAX) };
    m.replies.push(r);
    if (m.followers.indexOf(db.currentUserId) < 0) m.followers.push(db.currentUserId);
    var men = parseMentions(r.body);
    men.forEach(function (u) { if (m.followers.indexOf(u) < 0) m.followers.push(u); });
    if (men.length) notifyOnly(null, men, 'พูดถึงคุณในประกาศของ {p}', 'mention', { p: p.name }, false, msgNotifExtra(pid));
    notifyOnly(null, m.followers.filter(function (u) { return men.indexOf(u) < 0; }), 'ตอบประกาศ “{t}” ใน {p}', 'message',
      { t: m.title || S_short(m.body), p: p.name }, false, msgNotifExtra(pid));
    commit();
    return r;
  }
  function S_short(s) { s = plainText(s || '').replace(/\s+/g, ' ').trim(); return s.length > 40 ? s.slice(0, 39) + '…' : s; }
  function deleteMessageReply(pid, msgId, replyId) {
    var m = findMessage(pid, msgId);
    if (!m) return false;
    var r = m.replies.filter(function (x) { return x.id === replyId; })[0];
    if (!r || (r.by !== db.currentUserId && !can('manage'))) return false;
    snapshot('ลบคำตอบ');
    m.replies = m.replies.filter(function (x) { return x !== r; });
    commit();
    return true;
  }
  function toggleMessageFollow(pid, msgId) {
    var m = findMessage(pid, msgId);
    if (!m) return null;
    snapshot('ติดตามประกาศ');
    var i = m.followers.indexOf(db.currentUserId);
    if (i >= 0) m.followers.splice(i, 1); else m.followers.push(db.currentUserId);
    commit();
    return i < 0;
  }

  /* ---------- เส้นทางวิกฤต ----------
   * สายงานที่ต่อกันด้วยลำดับก่อนหลัง (ทุกชนิด FS SS FF SF) ที่กินเวลาตามปฏิทินยาวที่สุด
   * นับจากวันเริ่มของงานแรกในสายถึงวันจบของงานสุดท้าย — งานในสายนี้เลื่อนเมื่อไรโปรเจกต์เลื่อนตาม
   * คืน { ids: {taskId: true}, edges: {'pred>succ': true}, days } (ว่างเมื่อไม่มีสายที่ยาวกว่าหนึ่งงาน) */
  function criticalPath(pid) {
    var inProj = {}, list = [];
    tasksInProject(pid).forEach(function (x) {
      var walk = function (t) {
        if (inProj[t.id]) return;
        if (t.startOn || t.dueOn) { inProj[t.id] = true; list.push(t); }
        subtasks(t.id).forEach(walk);
      };
      walk(x.task);
    });
    var memo = {}, guard = {};
    function st(t) { var a = t.startOn || t.dueOn, b = t.dueOn || t.startOn; return a < b ? a : b; }
    function en(t) { var a = t.startOn || t.dueOn, b = t.dueOn || t.startOn; return a > b ? a : b; }
    function best(t) {
      if (memo[t.id]) return memo[t.id];
      if (guard[t.id]) return { start: st(t), pred: null, len: 1 };
      guard[t.id] = true;
      var r = { start: st(t), pred: null, len: 1 };
      (t.dependsOn || []).forEach(function (d) {
        var b = task(d.id);
        if (!b || !inProj[b.id]) return;
        var bb = best(b);
        if (bb.start < r.start || (bb.start === r.start && bb.len + 1 > r.len)) r = { start: bb.start, pred: b.id, len: bb.len + 1 };
      });
      memo[t.id] = r;
      return r;
    }
    var top = null, topDays = -1;
    list.forEach(function (t) {
      var b = best(t);
      if (!b.pred) return;
      var days = daysBetween(b.start, en(t)) + 1;
      if (days > topDays || (days === topDays && b.len > memo[top].len)) { top = t.id; topDays = days; }
    });
    var out = { ids: {}, edges: {}, days: 0 };
    if (!top) return out;
    out.days = topDays;
    var cur = top, n = 0;
    while (cur && n++ < 500) {
      out.ids[cur] = true;
      var pr = memo[cur] && memo[cur].pred;
      if (pr) out.edges[pr + '>' + cur] = true;
      cur = pr;
    }
    return out;
  }

  /** ต่อลำดับก่อนหลังให้งานที่เลือกเป็นสายเดียว เรียงตามวันเริ่ม (ไม่มีวันใช้ลำดับที่เลือก) ย้อนกลับได้ครั้งเดียว */
  function bulkChain(ids) {
    var list = (ids || []).map(function (id, i) { return { t: task(id), i: i }; }).filter(function (x) { return x.t; });
    if (list.length < 2) return 0;
    list.sort(function (a, b) {
      var da = a.t.startOn || a.t.dueOn || '9999', dbb = b.t.startOn || b.t.dueOn || '9999';
      return da < dbb ? -1 : da > dbb ? 1 : a.i - b.i;
    });
    var n = 0;
    batch('ต่อลำดับก่อนหลัง {n} งาน', { n: list.length }, function () {
      for (var i = 1; i < list.length; i++) if (addDependency(list[i].t.id, list[i - 1].t.id, 'FS')) n++;
    });
    return n;
  }

  /* ---------- เลื่อนวันแล้วงานที่รออยู่ขยับตาม: ดูก่อนแล้วค่อยใช้ ----------
   * previewDates จำลองบนข้อมูลจริงแล้วคืนค่าเดิมทุกงาน (ไม่บันทึก) applyDates ทำจริงในจุดย้อนกลับเดียว */
  function depShiftOf(taskId) {
    var t = task(taskId);
    var hp = t ? projectsOfTask(rootOf(t).id)[0] : null;
    var pd = hp ? hp.project : null;
    var ds = (pd && pd.depShift) || { mode: 'consume', scope: 'downstream' };
    return { mode: ds.mode, scope: ds.scope, workDays: pd ? pd.workDays : 'all' };
  }
  function shiftDelta(t, patch) {
    var prevEnd = t.dueOn || t.startOn;
    var ns = 'startOn' in patch ? patch.startOn : t.startOn, nd = 'dueOn' in patch ? patch.dueOn : t.dueOn;
    var newEnd = nd || ns;
    return prevEnd && newEnd ? daysBetween(prevEnd, newEnd) : 0;
  }
  function previewDates(taskId, patch) {
    var t = task(taskId);
    if (!t) return [];
    var opts = depShiftOf(taskId);
    if (opts.mode === 'none') return [];
    if (!blocking(taskId).length && !(opts.mode === 'maintain' && opts.scope === 'all' && t.dependsOn.length)) return [];
    var saved = db.tasks.map(function (x) { return [x, x.startOn, x.dueOn]; });
    var delta = shiftDelta(t, patch);
    var out = [];
    batchDepth++;
    try {
      if ('startOn' in patch) t.startOn = patch.startOn;
      if ('dueOn' in patch) t.dueOn = patch.dueOn;
      autoSchedule(taskId, delta, opts);
      saved.forEach(function (s) {
        var x = s[0];
        if (x === t || (x.startOn === s[1] && x.dueOn === s[2])) return;
        out.push({ id: x.id, name: x.name, from: [s[1], s[2]], to: [x.startOn, x.dueOn] });
      });
    } finally {
      saved.forEach(function (s) { s[0].startOn = s[1]; s[0].dueOn = s[2]; });
      batchDepth--;
      dropIndex();
    }
    return out;
  }
  function applyDates(taskId, patch, shift) {
    var t = task(taskId);
    if (!t) return 0;
    var opts = depShiftOf(taskId), delta = shiftDelta(t, patch), n = 0;
    batch('เปลี่ยนวัน', null, function () {
      updateTask(taskId, patch);
      if (shift) n = autoSchedule(taskId, delta, opts).length;
    });
    return n;
  }

  /* ====================== 3c ส่วนที่ 2 — หน้าเอกสาร เวลา สูตร อ้างอิง ตรวจรูป ======================
   *   page = { id:'pg_…', title, icon, body (มาร์กดาวน์ย่อแบบบล็อก), imgs:[{ id:'im_…', name, url, bytes }],
   *            comments:[{ id, quote, text, by, at, resolved, replies:[{ id, by, at, text }] }],
   *            versions:[{ at, by, title, body }] (≤ 20 ล่าสุด), by, at, editedBy, editedAt, vAt }
   *   project.pages[]  หน้าของโปรเจกต์ (≤ 50)     db.pages[]  หน้าเดี่ยว + { owner, private, notepad }
   *   สมุดโน้ตส่วนตัว = หน้า private ของเจ้าของ notepad: true (ย้ายจาก personal.notepad ตอนโหลด)
   *   task.estimate  นาทีที่ประมาณ | null   task.time[]  { id, userId, date, minutes, note, billable: null, category: null }
   *   db.timers      { userId: { taskId, start } } นาฬิกาจับเวลาที่เดินอยู่ คนละหนึ่งตัว
   *   field.type 'formula' { expr (รหัสฟิลด์ใน {…}), out: number|date, format }  คำนวณตอนอ่าน ไม่เก็บค่าในงาน
   *   field.type 'ref'     { kinds: [task, project, portfolio] }  ค่า = [รหัส t_/p_/pf_ (g_ สำรองให้เป้าหมาย 4a)]
   *   attachment.pins[]    { n, x, y (0..1), text, taskId (งานย่อย), by, at } */
  var PAGE_MAX = 50, PAGE_VERSIONS = 20, PAGE_IMG_BYTES = 500 * 1024, PAGE_IMGS = 20, VERSION_GAP_MS = 10 * 60 * 1000;

  function migrate3cPart2(d) {
    d.pages = Array.isArray(d.pages) ? d.pages.filter(function (x) { return x && x.id; }) : [];
    d.pages.forEach(normalizePage);
    d.projects.forEach(function (p) {
      p.pages = Array.isArray(p.pages) ? p.pages.filter(function (x) { return x && x.id; }) : [];
      p.pages.forEach(normalizePage);
    });
    d.timers = isObj(d.timers) ? d.timers : {};
    d.tasks.forEach(function (t) {
      if (!('estimate' in t)) t.estimate = null;
      t.time = Array.isArray(t.time) ? t.time.filter(function (e) { return e && e.id; }) : [];
      (t.attachments || []).forEach(function (a) { if (a.pins && !Array.isArray(a.pins)) a.pins = []; });
    });
    /* สมุดโน้ตข้อความล้วนแบบเดิม (2a) กลายเป็นหน้าเอกสารส่วนตัวของเจ้าของ ทำครั้งเดียว แล้วล้างข้อความเดิม */
    Object.keys(d.personal || {}).forEach(function (uid0) {
      var per = d.personal[uid0];
      if (!per || typeof per.notepad !== 'string' || !per.notepad.trim()) return;
      var has = d.pages.filter(function (x) { return x.notepad && x.owner === uid0; })[0];
      if (has) { if (!has.body) has.body = per.notepad; }
      else d.pages.push(normalizePage({ id: 'pg_np_' + uid0, title: 'สมุดโน้ตส่วนตัว', body: per.notepad,
        owner: uid0, private: true, notepad: true, by: uid0, at: new Date().toISOString() }));
      per.notepad = '';
    });
  }

  function normalizePage(x) {
    x.title = String(x.title || '').slice(0, 200);
    x.icon = String(x.icon || '📄').slice(0, 4);
    x.body = String(x.body || '');
    x.imgs = Array.isArray(x.imgs) ? x.imgs.filter(function (i) { return i && i.id && /^data:image\//.test(i.url || ''); }) : [];
    x.comments = Array.isArray(x.comments) ? x.comments.filter(function (c) { return c && c.id; }) : [];
    x.comments.forEach(function (c) { c.replies = Array.isArray(c.replies) ? c.replies : []; c.resolved = !!c.resolved; });
    x.versions = Array.isArray(x.versions) ? x.versions.slice(-PAGE_VERSIONS) : [];
    return x;
  }

  /* ---------- หน้าเอกสาร ---------- */
  function pageLoc(id) {
    var i = (db.pages || []).filter(function (x) { return x.id === id; })[0];
    if (i) return { page: i, project: null };
    for (var k = 0; k < db.projects.length; k++) {
      var pg = (db.projects[k].pages || []).filter(function (x) { return x.id === id; })[0];
      if (pg) return { page: pg, project: db.projects[k] };
    }
    return null;
  }
  function canSeePage(id) {
    var l = pageLoc(id);
    if (!l) return false;
    if (l.project) return !!projectAccess(l.project.id);
    return !l.page.private || l.page.owner === db.currentUserId;
  }
  function canEditPage(id) {
    var l = pageLoc(id);
    if (!l || !canSeePage(id) || !isActive()) return false;
    if (l.project) return can('write') && canInProject(l.project.id, 'edit');
    if (l.page.private) return l.page.owner === db.currentUserId;
    return can('write');
  }
  function canCommentPage(id) {
    var l = pageLoc(id);
    if (!l || !canSeePage(id) || !isActive()) return false;
    return l.project ? canInProject(l.project.id, 'comment') : (l.page.private ? l.page.owner === db.currentUserId : true);
  }
  function projectPages(pid) { var p = project(pid); return ((p && p.pages) || []).slice(); }
  /** หน้าเดี่ยวที่คนนี้เห็น (ไม่รวมสมุดโน้ต) */
  function myPages() {
    return (db.pages || []).filter(function (x) { return !x.notepad && (!x.private || x.owner === db.currentUserId); });
  }
  function notepadPage(userId) {
    userId = userId || db.currentUserId;
    return (db.pages || []).filter(function (x) { return x.notepad && x.owner === userId; })[0] || null;
  }
  /** สร้างหน้าสมุดโน้ตของคนนี้ถ้ายังไม่มี (ไม่ลงจุดย้อนกลับ) */
  function ensureNotepadPage() {
    var me0 = db.currentUserId;
    if (!me0 || !user(me0) || notepadPage(me0)) return notepadPage(me0);
    db.pages = db.pages || [];
    var x = normalizePage({ id: 'pg_np_' + me0, title: 'สมุดโน้ตส่วนตัว', owner: me0, private: true, notepad: true,
      by: me0, at: new Date().toISOString() });
    db.pages.push(x);
    commit();
    return x;
  }

  function createPage(pid, o) {
    o = o || {};
    var p = pid ? project(pid) : null;
    if (pid && (!p || !can('write') || !canInProject(pid, 'edit'))) return null;
    if (!pid && !isActive()) return null;
    var list = p ? (p.pages = p.pages || []) : (db.pages = db.pages || []);
    if (list.filter(function (x) { return !x.notepad; }).length >= PAGE_MAX * (p ? 1 : 4)) return null;
    snapshot('สร้างหน้า');
    var x = normalizePage({ id: uid('pg'), title: String(o.title || '').trim().slice(0, 200), icon: o.icon || '📄',
      body: o.body || '', by: db.currentUserId, at: new Date().toISOString() });
    if (!p) { x.owner = db.currentUserId; x.private = !!o.private; }
    list.push(x);
    commit();
    return x;
  }

  /** บันทึกเนื้อหา — ไม่ลงจุดย้อนกลับทุกครั้งที่พิมพ์ ใช้ประวัติเวอร์ชันแทน
   *  เก็บเวอร์ชันเดิมเมื่อห่างจากครั้งก่อนเกิน 10 นาทีหรือคนแก้เปลี่ยน */
  function savePage(id, patch) {
    var l = pageLoc(id);
    if (!l || !canEditPage(id)) return false;
    var x = l.page;
    var title = 'title' in patch ? String(patch.title || '').slice(0, 200) : x.title;
    var body = 'body' in patch ? String(patch.body || '').slice(0, 200000) : x.body;
    if (title === x.title && body === x.body) return false;
    var now = Date.now();
    var by = x.editedBy || x.by;
    if (x.body !== body && (x.body || x.title) && (!x.vAt || now - Date.parse(x.vAt) > VERSION_GAP_MS || by !== db.currentUserId)) {
      x.versions.push({ at: x.editedAt || x.at, by: by, title: x.title, body: x.body });
      if (x.versions.length > PAGE_VERSIONS) x.versions = x.versions.slice(-PAGE_VERSIONS);
      x.vAt = new Date(now).toISOString();
    }
    var was = parseMentions(x.body);
    var now2 = parseMentions(body).filter(function (u) { return was.indexOf(u) < 0; });
    x.title = title; x.body = body;
    x.editedBy = db.currentUserId; x.editedAt = new Date(now).toISOString();
    if (now2.length && !x.private) notifyOnly(null, now2, 'พูดถึงคุณในหน้า “{t}”', 'mention', { t: title || L('ไม่มีชื่อ') }, false,
      { projectId: l.project ? l.project.id : null, route: 'page:' + id });
    commit();
    return true;
  }
  function restorePageVersion(id, idx) {
    var l = pageLoc(id);
    if (!l || !canEditPage(id)) return false;
    var x = l.page, v = x.versions[idx];
    if (!v) return false;
    snapshot('กู้คืนเวอร์ชันของหน้า');
    x.versions.push({ at: x.editedAt || x.at, by: x.editedBy || x.by, title: x.title, body: x.body });
    if (x.versions.length > PAGE_VERSIONS) x.versions = x.versions.slice(-PAGE_VERSIONS);
    x.title = v.title; x.body = v.body;
    x.editedBy = db.currentUserId; x.editedAt = new Date().toISOString(); x.vAt = x.editedAt;
    commit();
    return true;
  }
  function deletePage(id) {
    var l = pageLoc(id);
    if (!l || !canEditPage(id) || l.page.notepad) return false;
    snapshot('ลบหน้า');
    if (l.project) l.project.pages = l.project.pages.filter(function (x) { return x.id !== id; });
    else db.pages = db.pages.filter(function (x) { return x.id !== id; });
    commit();
    return true;
  }
  function setPagePrivate(id, on) {
    var l = pageLoc(id);
    if (!l || l.project || l.page.notepad || l.page.owner !== db.currentUserId) return false;
    snapshot(on ? 'ทำหน้าเป็นส่วนตัว' : 'แชร์หน้าให้ทั้งองค์กร');
    l.page.private = !!on;
    commit();
    return true;
  }
  /** เก็บรูปลงหน้า ไม่ commit — ตัวแก้ไขแทรกรูปแล้วบันทึกพร้อมเนื้อหาเอง (ไม่งั้นหน้าวาดใหม่กลางการแทรก) */
  function addPageImage(id, name, dataUri, meta) {
    var l = pageLoc(id);
    if (!l || !canEditPage(id)) return null;
    if (meta && meta.driveItemId) {           // 4b — รูปที่อัปขึ้น SharePoint/OneDrive แล้ว
      if (l.page.imgs.length >= PAGE_IMGS) return null;
      var rim = withRemote({ id: uid('im'), name: String(name || '').slice(0, 120), bytes: meta.size || null, mime: meta.mime || null }, meta);
      l.page.imgs.push(rim);
      return { id: rim.id, url: attImgSrc(rim) };
    }
    if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(dataUri || '')) return null;
    var bytes = Math.round((dataUri.length - dataUri.indexOf(',') - 1) * 0.75);
    if (bytes > PAGE_IMG_BYTES || l.page.imgs.length >= PAGE_IMGS) return null;
    var im = { id: uid('im'), name: String(name || '').slice(0, 120), url: dataUri, bytes: bytes };
    l.page.imgs.push(im);
    return im;
  }
  function pageImgMap(id) {
    var l = pageLoc(id), out = {};
    if (l) l.page.imgs.forEach(function (i) { out[i.id] = attImgSrc(i); });
    return out;
  }

  /* ความเห็นบนข้อความในหน้า */
  function pageComment(id, cid) {
    var l = pageLoc(id);
    return l ? l.page.comments.filter(function (c) { return c.id === cid; })[0] || null : null;
  }
  function pageNotify(l, c, key, extra) {
    var who = [l.page.by].concat(c ? [c.by] : []).concat(c ? c.replies.map(function (r) { return r.by; }) : []).concat(extra || []);
    var uniq = who.filter(function (u, i) { return u && who.indexOf(u) === i; });
    notifyOnly(null, uniq, key, 'comment', { t: l.page.title || L('ไม่มีชื่อ') }, false,
      { projectId: l.project ? l.project.id : null, route: 'page:' + l.page.id });
  }
  function addPageComment(id, quote, text) {
    var l = pageLoc(id);
    if (!l || !canCommentPage(id) || !String(text || '').trim()) return null;
    snapshot('แสดงความเห็นในหน้า');
    var c = { id: uid('pc'), quote: String(quote || '').replace(/\s+/g, ' ').trim().slice(0, 300), text: String(text).trim().slice(0, 5000),
      by: db.currentUserId, at: new Date().toISOString(), resolved: false, replies: [] };
    l.page.comments.push(c);
    pageNotify(l, null, 'แสดงความเห็นในหน้า “{t}”', parseMentions(c.text));
    commit();
    return c;
  }
  function replyPageComment(id, cid, text) {
    var l = pageLoc(id), c = pageComment(id, cid);
    if (!c || !canCommentPage(id) || !String(text || '').trim()) return null;
    snapshot('ตอบความเห็นในหน้า');
    var r = { id: uid('pr'), by: db.currentUserId, at: new Date().toISOString(), text: String(text).trim().slice(0, 5000) };
    c.replies.push(r);
    pageNotify(l, c, 'ตอบความเห็นในหน้า “{t}”', parseMentions(r.text));
    commit();
    return r;
  }
  function resolvePageComment(id, cid, on) {
    var c = pageComment(id, cid);
    if (!c || !canCommentPage(id)) return false;
    snapshot(on ? 'ปิดความเห็นในหน้า' : 'เปิดความเห็นในหน้าอีกครั้ง');
    c.resolved = !!on;
    c.resolvedBy = on ? db.currentUserId : null;
    commit();
    return true;
  }
  function deletePageComment(id, cid) {
    var l = pageLoc(id), c = pageComment(id, cid);
    if (!c || (c.by !== db.currentUserId && !canEditPage(id))) return false;
    snapshot('ลบความเห็นในหน้า');
    l.page.comments = l.page.comments.filter(function (x) { return x !== c; });
    commit();
    return true;
  }
  /** ข้อความที่เลือกในหน้า → งานใหม่ที่ลิงก์กลับมาหน้านี้ (หน้าของโปรเจกต์ = งานในคอลัมน์แรก หน้าเดี่ยว = งานส่วนตัว) */
  function taskFromPage(id, text) {
    var l = pageLoc(id);
    var name = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!l || !name || !canSeePage(id)) return null;
    var url = (global.location ? global.location.origin + global.location.pathname : '') + '#/page/' + id;
    var notes = L('จากหน้า') + ' [' + (l.page.title || L('ไม่มีชื่อ')).replace(/[\[\]]/g, '') + '](' + url + ')';
    if (l.project) {
      if (!can('write') || !canInProject(l.project.id, 'edit')) return null;
      return createTask({ name: name, notes: notes, assigneeId: db.currentUserId }, l.project.id, l.project.sections[0].id);
    }
    if (!can('write')) return null;
    return createTask({ name: name, notes: notes, assigneeId: db.currentUserId }, null, null);
  }

  /* Sprint 1C — เลือกหลายบรรทัดในหน้าเอกสารแล้วกด "สร้างงาน"
   * เดิมรวมทุกบรรทัดเป็นชื่องานเดียว (action item 3 ข้อกลายเป็นงานเดียวยาวเหยียด) แถมเป็นงานส่วนตัวในงานของฉัน
   * ตอนนี้หนึ่งบรรทัดหนึ่งงาน ตัดสัญลักษณ์หัวข้อ/เลขข้อ/ช่องติ๊กออก
   * และถ้าบรรทัดมี @ชื่อ ที่ตรงกับคนในระบบ มอบงานนั้นให้คนนั้นเลย (เอา @ชื่อ ออกจากชื่องาน) */
  var PG_BULLET = /^(?:[-*•·▪◦‣–—+]\s+|\d{1,3}[.)]\s+|\[[ xX✓]?\]\s*|[☐☑✅]\s*)+/;
  function pageTaskLines(raw) {
    var people = db.users.filter(function (u) { return u.active !== false && u.name; })
      .sort(function (a, b) { return b.name.length - a.name.length; });     // ชื่อยาวก่อน "@มานี" ไม่โดน "@มา" แย่ง
    return String(raw || '').split(/\r?\n/).map(function (line) {
      var src = line.trim();
      var s = src.replace(PG_BULLET, ''), who = null;
      people.some(function (u) {
        var tag = '@' + u.name, at = s.indexOf(tag);
        if (at < 0) return false;
        who = u.id;
        s = s.slice(0, at) + s.slice(at + tag.length);
        return true;
      });
      /* Sprint 3 — บรรทัดจากบันทึกประชุมอย่าง "ส่งสไลด์ @สมชาย ศุกร์" เก็บวันที่ไทยและ @ชื่อสั้นด้วย (ตัวเดียวกับช่องเพิ่มงาน) */
      var qa = quickAdd(s.replace(/\s+/g, ' ').trim(), null);
      return { name: qa.name.slice(0, 300), assigneeId: who || qa.assigneeId || null, dueOn: qa.dueOn || null, src: src };
    }).filter(function (x) { return x.name; }).slice(0, 100);
  }
  /** สร้างงานหลายชิ้นจากหน้าเอกสารในครั้งเดียว (ย้อนกลับได้ทีเดียว) — projectId ว่าง = งานส่วนตัวในงานของฉัน
   *  คืนอาร์เรย์งานเรียงตาม items */
  function tasksFromPage(id, items, projectId, sectionId) {
    var l = pageLoc(id);
    if (!l || !canSeePage(id) || !can('write')) return [];
    var p = projectId ? project(projectId) : null;
    if (projectId && (!p || !canInProject(projectId, 'edit'))) return [];
    var sec = p ? (section(projectId, sectionId) || p.sections[0]) : null;
    if (p && !sec) return [];
    var list = (items || []).filter(function (x) { return x && String(x.name || '').trim(); }).slice(0, 100);
    if (!list.length) return [];
    var url = (global.location ? global.location.origin + global.location.pathname : '') + '#/page/' + id;
    var notes = L('จากหน้า') + ' [' + (l.page.title || L('ไม่มีชื่อ')).replace(/[\[\]]/g, '') + '](' + url + ')';
    snapshot('สร้าง {n} งาน', { n: list.length });
    var out = list.map(function (x) {
      /* งานในโปรเจกต์ที่ไม่มี @ชื่อ ปล่อยว่างไว้ให้ทีมรับ งานส่วนตัวต้องเป็นของเรา ไม่งั้นหาไม่เจอในงานของฉัน */
      var who = x.assigneeId && user(x.assigneeId) ? x.assigneeId : (p ? null : db.currentUserId);
      /* ใส่ผู้รับผิดชอบเป็นผู้ติดตามหลังสร้าง ไม่งั้นเขาได้ทั้ง "สร้างงานนี้" และ "มอบหมายให้คุณ" ซ้ำสองข้อความ */
      var t = createTaskRaw({ name: String(x.name).trim().slice(0, 300), notes: notes, assigneeId: who, dueOn: x.dueOn || null, followers: [] },
        p ? p.id : null, sec ? sec.id : null);
      if (who && t.followers.indexOf(who) < 0) t.followers.push(who);
      if (who && who !== db.currentUserId) notifyOnly(t.id, [who], 'มอบหมายงาน “{t}” ให้คุณ', 'assigned', { t: t.name });
      return t;
    });
    commit();
    return out;
  }

  /* ---------- เวลา ----------
   * รูปแบบรายการเวลา { id, userId, date, minutes, note, billable: null, category: null } — billable/category
   * สำรองให้ไทม์ชีต (4b) นาฬิกาจับเวลาเก็บเวลาเริ่มใน db.timers จึงอยู่รอดหลังรีโหลดและเห็นจากเครื่องอื่น */
  function parseDuration(s) {
    s = String(s == null ? '' : s).trim().toLowerCase();
    if (!s) return null;
    var m = s.match(/^(\d+):(\d{1,2})$/);
    if (m) return +m[1] * 60 + +m[2];
    var h = s.match(/(\d+(?:\.\d+)?)\s*(h|ชม|ชั่วโมง)/), mi = s.match(/(\d+)\s*(m|น|นาที)/);
    if (h || mi) return Math.round((h ? +h[1] * 60 : 0) + (mi ? +mi[1] : 0));
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(+s * 60);      // ตัวเลขเปล่า = ชั่วโมง
    return null;
  }
  function fmtMinutes(n) {
    if (n === null || n === undefined || isNaN(n)) return '';
    n = Math.round(n);
    var h = Math.floor(n / 60), m = n % 60;
    return h && m ? h + 'h ' + m + 'm' : h ? h + 'h' : m + 'm';
  }
  function taskActualMinutes(t) { return (t.time || []).reduce(function (a, e) { return a + (+e.minutes || 0); }, 0); }
  /** ประมาณ/จริงรวมงานย่อยทุกชั้น { est, act, ownEst, ownAct } (นาที) */
  function timeRollup(t) {
    var out = { est: 0, act: 0, ownEst: t.estimate || 0, ownAct: taskActualMinutes(t), hasEst: t.estimate != null };
    var walk = function (x, guard) {
      out.est += x.estimate || 0;
      out.act += taskActualMinutes(x);
      if (x.estimate != null) out.hasEst = true;
      if (guard < 6) subtasks(x.id).forEach(function (s) { walk(s, guard + 1); });
    };
    walk(t, 0);
    return out;
  }
  function setEstimate(taskId, minutes) {
    var t = task(taskId);
    if (!t) return false;
    var v = minutes === null || minutes === '' || isNaN(minutes) ? null : Math.max(0, Math.round(minutes));
    if (v === (t.estimate == null ? null : t.estimate)) return false;
    snapshot('ตั้งเวลาประมาณ');
    t.estimate = v;
    log(taskId, v == null ? 'ล้างเวลาประมาณ' : 'ตั้งเวลาประมาณเป็น {v}', { v: fmtMinutes(v) });
    commit();
    return true;
  }
  function addTimeEntry(taskId, e) {
    var t = task(taskId);
    var mins = Math.round(+(e && e.minutes) || 0);
    if (!t || mins <= 0) return null;
    var who0 = (e.userId && user(e.userId)) ? e.userId : db.currentUserId;
    var day0 = /^\d{4}-\d\d-\d\d$/.test(e.date || '') ? e.date : today();
    if (tsLocked(who0, day0)) return null;           // 4b — สัปดาห์ที่ส่ง/อนุมัติไทม์ชีตแล้วถูกล็อก
    snapshot('บันทึกเวลา');
    var x = { id: uid('te'), userId: who0, date: day0, minutes: Math.min(mins, 24 * 60 * 7),
      note: String(e.note || '').slice(0, 500), billable: e.billable == null ? null : !!e.billable,
      category: e.category ? String(e.category).slice(0, 60) : null };
    t.time = t.time || [];
    t.time.push(x);
    log(taskId, 'บันทึกเวลา {v}', { v: fmtMinutes(x.minutes) });
    autoFire('timelog', taskId, { minutes: x.minutes, billable: x.billable });
    commit();
    return x;
  }
  function deleteTimeEntry(taskId, entryId) {
    var t = task(taskId);
    var e = t && (t.time || []).filter(function (x) { return x.id === entryId; })[0];
    if (!e || (e.userId !== db.currentUserId && !can('write', taskId))) return false;
    if (tsLocked(e.userId, e.date)) return false;
    snapshot('ลบรายการเวลา');
    t.time = t.time.filter(function (x) { return x !== e; });
    commit();
    return true;
  }
  function runningTimer(userId) {
    var x = (db.timers || {})[userId || db.currentUserId];
    return x && task(x.taskId) ? x : null;
  }
  function startTimer(taskId) {
    if (!task(taskId)) return false;
    var cur = runningTimer();
    if (cur && cur.taskId === taskId) return false;
    batch('เริ่มจับเวลา', null, function () {
      if (cur) stopTimerRaw();
      db.timers = db.timers || {};
      db.timers[db.currentUserId] = { taskId: taskId, start: new Date().toISOString() };
    });
    return true;
  }
  function stopTimerRaw() {
    var cur = runningTimer();
    delete db.timers[db.currentUserId];
    if (!cur) return null;
    var mins = Math.max(1, Math.round((Date.now() - Date.parse(cur.start)) / 60000));
    return addTimeEntry(cur.taskId, { minutes: mins, date: String(cur.start).slice(0, 10) === today() ? today() : today(), note: '' });
  }
  function stopTimer() {
    if (!runningTimer() && !(db.timers || {})[db.currentUserId]) return null;
    var out = null;
    batch('หยุดจับเวลา', null, function () { out = stopTimerRaw(); });
    return out;
  }
  function discardTimer() {
    if (!(db.timers || {})[db.currentUserId]) return false;
    snapshot('ทิ้งเวลาที่จับ');
    delete db.timers[db.currentUserId];
    commit();
    return true;
  }
  /** รายการเวลาทั้งโปรเจกต์ (รวมงานย่อย) เป็น CSV */
  function projectTimeCsv(pid) {
    var p = project(pid);
    if (!p) return '';
    var rows = [['date', 'user', 'task', 'task_id', 'minutes', 'hours', 'note', 'billable', 'category', 'project'].join(',')];
    var walk = function (t) {
      if (!canSeeTask(t.id)) return;
      (t.time || []).forEach(function (e) {
        var u = user(e.userId);
        rows.push([e.date, u ? u.name : e.userId, t.name, t.id, e.minutes, (e.minutes / 60).toFixed(2), e.note || '',
          e.billable == null ? '' : e.billable, e.category || '', p.name].map(csvCell).join(','));
      });
      subtasks(t.id).forEach(walk);
    };
    tasksInProject(pid).forEach(function (x) { walk(x.task); });
    return '﻿' + rows.join('\r\n');
  }

  /* ---------- ฟิลด์สูตร ----------
   * ไวยากรณ์: ตัวเลข  + − × ÷ ( )  {ฟิลด์}  ฟังก์ชัน DateAdd(วันที่, n) DateSubtract(วันที่, n) Today()
   *          Rollup(sum|avg|min|max|count, {ฟิลด์}) (งานย่อยชั้นเดียว)  วันที่ − วันที่ = จำนวนวัน
   * เก็บเป็นรหัส {f_…} หรือคีย์ในตัว {due} {start} {created} {completed} {estimate} {actual} แสดงเป็นชื่อตอนแก้
   * คำนวณตอนอ่าน (fieldValue) ไม่เก็บค่าในงาน แคชผลไว้ในดัชนีจนกว่าข้อมูลจะเปลี่ยน */
  var FORMULA_BUILTIN = [['due', 'กำหนดส่ง', 'date'], ['start', 'วันเริ่ม', 'date'], ['created', 'วันที่สร้าง', 'date'],
    ['completed', 'วันที่ทำเสร็จ', 'date'], ['estimate', 'เวลาประมาณ', 'number'], ['actual', 'เวลาจริง', 'number']];
  var FORMULA_FNS = ['DateAdd', 'DateSubtract', 'Today', 'Rollup'];

  function fErr(key, x) { var e = new Error(key); e.p = { x: x }; return e; }
  function fTokens(s) {
    var out = [], i = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (/\s/.test(c)) { i++; continue; }
      if (c === '{') {
        var j = s.indexOf('}', i);
        if (j < 0) throw new Error('ปีกกาไม่ครบ');
        out.push({ t: 'ref', v: s.slice(i + 1, j).trim() }); i = j + 1; continue;
      }
      var n = s.slice(i).match(/^\d+(\.\d+)?/);
      if (n) { out.push({ t: 'num', v: +n[0] }); i += n[0].length; continue; }
      var w = s.slice(i).match(/^[A-Za-z]+/);
      if (w) { out.push({ t: 'id', v: w[0] }); i += w[0].length; continue; }
      if ('+-*/(),×÷−'.indexOf(c) >= 0) { out.push({ t: 'op', v: c === '×' ? '*' : c === '÷' ? '/' : c === '−' ? '-' : c }); i++; continue; }
      throw fErr('อ่านไม่ออกตรง “{x}”', c);
    }
    return out;
  }
  function fParse(tokens) {
    var k = 0;
    function peek() { return tokens[k]; }
    function eat(v) { var x = tokens[k]; if (!x || (v && x.v !== v)) throw new Error('ไวยากรณ์ไม่ถูกต้อง'); k++; return x; }
    function expr() {
      var a = term();
      while (peek() && (peek().v === '+' || peek().v === '-')) { var op = eat().v; a = { op: op, a: a, b: term() }; }
      return a;
    }
    function term() {
      var a = factor();
      while (peek() && (peek().v === '*' || peek().v === '/')) { var op = eat().v; a = { op: op, a: a, b: factor() }; }
      return a;
    }
    function factor() {
      var x = peek();
      if (!x) throw new Error('สูตรไม่ครบ');
      if (x.v === '-') { eat(); return { op: 'neg', a: factor() }; }
      if (x.v === '(') { eat('('); var e = expr(); eat(')'); return e; }
      if (x.t === 'num') { eat(); return { num: x.v }; }
      if (x.t === 'ref') { eat(); return { ref: x.v }; }
      if (x.t === 'id') {
        eat();
        var fn = FORMULA_FNS.filter(function (f) { return f.toLowerCase() === x.v.toLowerCase(); })[0];
        if (!fn) throw fErr('ไม่รู้จักฟังก์ชัน {x}', x.v);
        eat('(');
        var args = [];
        if (peek() && peek().v !== ')') {
          if (fn === 'Rollup') { var agg = eat(); if (agg.t !== 'id') throw new Error('Rollup ต้องระบุ sum avg min max หรือ count'); args.push({ word: agg.v.toLowerCase() }); }
          else args.push(expr());
          while (peek() && peek().v === ',') { eat(','); args.push(expr()); }
        }
        eat(')');
        return { fn: fn, args: args };
      }
      throw new Error('ไวยากรณ์ไม่ถูกต้อง');
    }
    var root = expr();
    if (k < tokens.length) throw new Error('มีส่วนเกินท้ายสูตร');
    return root;
  }
  /** ชนิดผลลัพธ์ number | date (ตรวจตอนบันทึก) */
  function fType(n, refType) {
    if ('num' in n) return 'number';
    if (n.ref) return refType(n.ref);
    if (n.op === 'neg') return 'number';
    if (n.op) {
      var a = fType(n.a, refType), b = fType(n.b, refType);
      if (n.op === '-' && a === 'date' && b === 'date') return 'number';
      if ((n.op === '+' || n.op === '-') && a === 'date' && b === 'number') return 'date';
      if (n.op === '+' && a === 'number' && b === 'date') return 'date';
      if (a === 'date' || b === 'date') throw new Error('ใช้วันที่กับ × ÷ ไม่ได้');
      return 'number';
    }
    if (n.fn === 'Today' || n.fn === 'DateAdd' || n.fn === 'DateSubtract') {
      if (n.fn !== 'Today' && (n.args.length !== 2 || fType(n.args[0], refType) !== 'date')) throw fErr('{x}(วันที่, จำนวนวัน)', n.fn);
      return 'date';
    }
    if (n.fn === 'Rollup') {
      if (n.args.length !== 2 || ['sum', 'avg', 'min', 'max', 'count'].indexOf(n.args[0].word) < 0) throw new Error('Rollup(sum|avg|min|max|count, {ฟิลด์})');
      return 'number';
    }
    return 'number';
  }

  /** แปลงสูตรที่ผู้ใช้พิมพ์ (ชื่อฟิลด์) เป็นสูตรที่เก็บ (รหัส) และตรวจ — คืน { expr, out } หรือ { error } */
  function compileFormula(pid, text, selfId) {
    var p = project(pid);
    var fields = ((p && p.fields) || []);
    var byName = function (nm) {
      var key = String(nm).trim().toLowerCase();
      var b = FORMULA_BUILTIN.filter(function (x) { return x[0] === key || L(x[1]).toLowerCase() === key || x[1] === nm.trim(); })[0];
      if (b) return { id: b[0], type: b[2] };
      var f = fields.filter(function (x) { return x.id === nm.trim() || x.name.trim().toLowerCase() === key; })[0];
      if (!f) return null;
      return { id: f.id, type: f.type === 'date' ? 'date' : f.type === 'formula' ? (f.out || 'number') : 'number', f: f };
    };
    try {
      var toks = fTokens(String(text || ''));
      if (!toks.length) return { error: 'ยังไม่ได้พิมพ์สูตร' };
      toks.forEach(function (tk) {
        if (tk.t !== 'ref') return;
        var r = byName(tk.v);
        if (!r) throw fErr('ไม่พบฟิลด์ {x}', '{' + tk.v + '}');
        if (r.id === selfId) throw new Error('สูตรอ้างถึงตัวเองไม่ได้');
        if (r.f && r.f.type !== 'number' && r.f.type !== 'date' && r.f.type !== 'formula') throw fErr('{x} ไม่ใช่ตัวเลขหรือวันที่', '{' + tk.v + '}');
        tk.v = r.id;
      });
      var tree = fParse(toks);
      var out = fType(tree, function (id) {
        var b = FORMULA_BUILTIN.filter(function (x) { return x[0] === id; })[0];
        if (b) return b[2];
        var f = fields.filter(function (x) { return x.id === id; })[0];
        return f && (f.type === 'date' || (f.type === 'formula' && f.out === 'date')) ? 'date' : 'number';
      });
      var expr = toks.map(function (tk) { return tk.t === 'ref' ? '{' + tk.v + '}' : String(tk.v); }).join(' ')
        .replace(/ \( /g, '(').replace(/ \)/g, ')').replace(/ ,/g, ',').replace(/([A-Za-z]) \(/g, '$1(');
      return { expr: expr, out: out };
    } catch (e) { return { error: e.message, p: e.p || null }; }
  }
  /** สูตรที่เก็บ → ข้อความที่แสดงในช่องแก้ (รหัส → ชื่อ) */
  function formulaText(f) {
    return String((f && f.expr) || '').replace(/\{([^}]+)\}/g, function (m, id) {
      var b = FORMULA_BUILTIN.filter(function (x) { return x[0] === id; })[0];
      if (b) return '{' + L(b[1]) + '}';
      var d = fieldDef(id);
      return '{' + (d ? d.name : id) + '}';
    });
  }

  function formulaDefs() {
    var i = index();
    if (!i.formulas) {
      i.formulas = {}; i.fcache = {}; i.refFields = {};
      db.projects.forEach(function (p) {
        (p.fields || []).forEach(function (f) {
          if (f.type === 'formula') i.formulas[f.id] = f;
          if (f.type === 'ref') i.refFields[f.id] = f;
        });
      });
    }
    return i;
  }
  function fRefValue(t, id, depth) {
    switch (id) {
      case 'due': return t.dueOn || null;
      case 'start': return t.startOn || null;
      case 'created': return t.createdAt ? String(t.createdAt).slice(0, 10) : null;
      case 'completed': return t.completedAt ? String(t.completedAt).slice(0, 10) : null;
      case 'estimate': var tr = timeRollup(t); return tr.hasEst ? Math.round(tr.est / 6) / 10 : null;
      case 'actual': return Math.round(timeRollup(t).act / 6) / 10;
    }
    var fi = formulaDefs();
    if (fi.formulas[id]) return depth > 4 ? null : evalFormula(fi.formulas[id], t, depth + 1);
    var row = index().fvByTask[t.id], fv = row && row[id];
    var v = fv ? fv.value : null;
    return v === '' ? null : v;
  }
  function fEval(n, t, depth) {
    if ('num' in n) return n.num;
    if (n.ref) return fRefValue(t, n.ref, depth);
    if (n.op === 'neg') { var x = fEval(n.a, t, depth); return x == null ? null : -x; }
    if (n.op) {
      var a = fEval(n.a, t, depth), b = fEval(n.b, t, depth);
      if (a == null || b == null) return null;
      var da = typeof a === 'string', dbb = typeof b === 'string';
      if (n.op === '-' && da && dbb) return daysBetween(b, a);
      if ((n.op === '+' || n.op === '-') && da && !dbb) return addDays(a, Math.round(n.op === '+' ? +b : -b));
      if (n.op === '+' && !da && dbb) return addDays(b, Math.round(+a));
      a = +a; b = +b;
      if (n.op === '+') return a + b;
      if (n.op === '-') return a - b;
      if (n.op === '*') return a * b;
      if (n.op === '/') return b === 0 ? null : a / b;
    }
    if (n.fn === 'Today') return today();
    if (n.fn === 'DateAdd' || n.fn === 'DateSubtract') {
      var d = fEval(n.args[0], t, depth), k = fEval(n.args[1], t, depth);
      if (d == null || k == null) return null;
      return addDays(d, Math.round(n.fn === 'DateAdd' ? +k : -k));
    }
    if (n.fn === 'Rollup') {
      var vals = subtasks(t.id).map(function (s) { return fEval(n.args[1], s, depth); })
        .filter(function (v) { return v !== null && v !== undefined && !isNaN(+v); }).map(Number);
      var w = n.args[0].word;
      if (w === 'count') return vals.length;
      if (!vals.length) return null;
      if (w === 'avg') return vals.reduce(function (p, q) { return p + q; }, 0) / vals.length;
      if (w === 'min') return Math.min.apply(null, vals);
      if (w === 'max') return Math.max.apply(null, vals);
      return vals.reduce(function (p, q) { return p + q; }, 0);
    }
    return null;
  }
  function evalFormula(f, t, depth) {
    var fi = formulaDefs();
    var key = t.id + '|' + f.id;
    if (key in fi.fcache) return fi.fcache[key];
    fi.fcache[key] = null;          // กันวนระหว่างคำนวณ
    var v = null;
    try {
      if (!f._tree || f._src !== f.expr) {
        Object.defineProperty(f, '_tree', { value: fParse(fTokens(f.expr || '')), writable: true, enumerable: false, configurable: true });
        Object.defineProperty(f, '_src', { value: f.expr, writable: true, enumerable: false, configurable: true });
      }
      v = fEval(f._tree, t, depth || 0);
    } catch (e) { v = null; }
    if (typeof v === 'number') v = isFinite(v) ? Math.round(v * 10000) / 10000 : null;
    fi.fcache[key] = v;
    return v;
  }

  /* ---------- ฟิลด์อ้างอิง ---------- */
  var REF_KINDS = [['task', 'งาน'], ['project', 'โปรเจกต์'], ['portfolio', 'พอร์ตโฟลิโอ'], ['goal', 'เป้าหมาย']];
  function refItem(id) {
    if (/^t_/.test(id)) { var t = task(id); return t && canSeeTask(id) ? { id: id, kind: 'task', name: t.name, done: t.completed } : null; }
    if (/^p_/.test(id)) { var p = project(id); return p && projectAccess(id) ? { id: id, kind: 'project', name: p.name, color: p.color } : null; }
    if (/^pf_/.test(id)) { var f = portfolio(id); return f ? { id: id, kind: 'portfolio', name: f.name, color: f.color } : null; }
    if (/^g_/.test(id)) { var g = goal(id); return g && canSeeGoal(id) ? { id: id, kind: 'goal', name: g.name, color: '#37c5ab' } : null; }
    return null;
  }
  function refNames(v) {
    return [].concat(v || []).map(refItem).filter(Boolean).map(function (x) { return x.name; }).join(', ');
  }
  function refSearch(f, q) {
    var ql = String(q || '').toLowerCase().trim(), kinds = (f && f.kinds && f.kinds.length) ? f.kinds : ['task', 'project', 'portfolio', 'goal'];
    var out = [];
    /* 4a — เป้าหมายขึ้นก่อน (มีไม่มาก) */
    if (kinds.indexOf('goal') >= 0) visibleGoals().forEach(function (g) {
      if (!ql || g.name.toLowerCase().indexOf(ql) >= 0) out.push({ id: g.id, kind: 'goal', name: g.name, color: '#37c5ab' });
    });
    if (kinds.indexOf('project') >= 0) visibleProjects().forEach(function (p) {
      if (!ql || p.name.toLowerCase().indexOf(ql) >= 0) out.push({ id: p.id, kind: 'project', name: p.name, color: p.color });
    });
    if (kinds.indexOf('portfolio') >= 0) portfolios().forEach(function (pf) {
      if (!ql || pf.name.toLowerCase().indexOf(ql) >= 0) out.push({ id: pf.id, kind: 'portfolio', name: pf.name, color: pf.color });
    });
    if (kinds.indexOf('task') >= 0 && ql) {
      for (var i = 0; i < db.tasks.length && out.length < 40; i++) {
        var t = db.tasks[i];
        if (t.name.toLowerCase().indexOf(ql) >= 0 && canSeeTask(t.id)) out.push({ id: t.id, kind: 'task', name: t.name, done: t.completed });
      }
    }
    return out.slice(0, 30);
  }
  function toggleRef(taskId, fieldId, refId) {
    var cur = [].concat(fieldValue(taskId, fieldId) || []);
    var at = cur.indexOf(refId);
    if (at >= 0) cur.splice(at, 1); else cur.push(refId);
    setFieldValue(taskId, fieldId, cur.length ? cur : null);
  }

  /* ---------- ตรวจรูป (หมุดบนรูป → งานย่อย) ---------- */
  function attOf(taskId, attId) {
    var t = task(taskId);
    return t ? (t.attachments || []).filter(function (a) { return a.id === attId; })[0] || null : null;
  }
  function addProofPin(taskId, attId, x, y, text) {
    var t = task(taskId), a = attOf(taskId, attId);
    text = String(text || '').trim();
    if (!a || !text || !isImageAtt(a)) return null;
    if (!canCreateTask(null, taskId)) return denied('create');   // Sprint 1B — หมุดบนรูปเป็นงานย่อย
    var pin = null;
    batch('ปักหมุดบนรูป', null, function () {
      a.pins = a.pins || [];
      var n = a.pins.reduce(function (m, p) { return Math.max(m, p.n); }, 0) + 1;
      var sub = createTaskRaw({ name: '📍' + n + ' ' + text.slice(0, 200), parentId: taskId,
        notes: L('หมุดที่ {n} บนรูป “{f}”', { n: n, f: a.name }), createdBy: db.currentUserId }, null, null);
      pin = { n: n, x: Math.max(0, Math.min(1, +x || 0)), y: Math.max(0, Math.min(1, +y || 0)), text: text.slice(0, 1000),
        taskId: sub.id, by: db.currentUserId, at: new Date().toISOString() };
      a.pins.push(pin);
      log(taskId, 'ปักหมุดที่ {n} บนรูป “{f}”', { n: n, f: a.name });
    });
    return pin;
  }
  function removeProofPin(taskId, attId, n) {
    var a = attOf(taskId, attId);
    if (!a || !a.pins) return false;
    snapshot('เอาหมุดบนรูปออก');
    a.pins = a.pins.filter(function (p) { return p.n !== n; });
    commit();
    return true;
  }

  /* ---------- เสียบเข้าส่วนที่ 1 (แดชบอร์ด ชนิดฟิลด์ สำเนา/เทมเพลต) ---------- */
  var DASH_Y_EXTRA = [['est', 'เวลาประมาณ (ชม.)'], ['actual', 'เวลาจริง (ชม.)']];
  fieldKindHook = function (f) {
    if (f.type === 'formula') return f.out === 'date' ? 'date' : 'number';
    if (f.type === 'ref') return 'text';
    return null;
  };
  yHook = function (t, y) {
    if (y === 'est') return timeRollup(t).est / 60;
    if (y === 'actual') return timeRollup(t).act / 60;
    return undefined;
  };
  renewHook = function (p) {
    (p.pages || []).forEach(function (pg) {
      pg.id = uid('pg'); pg.comments = []; pg.versions = []; pg.vAt = null;
      pg.by = db.currentUserId; pg.at = new Date().toISOString(); pg.editedBy = null; pg.editedAt = null;
    });
  };
  remapHook = function (p, idMap) {
    (p.fields || []).forEach(function (f) { if (f.type === 'formula' && f.expr) f.expr = remapJson(f.expr, idMap); });
  };
  captureHook = {
    capture: function (p, data) {
      data.pages = (p.pages || []).map(function (pg) {
        return { id: pg.id, title: pg.title, icon: pg.icon, body: pg.body, imgs: clone(pg.imgs || []) };
      });
    },
    use: function (p, d) { p.pages = (d.pages || []).map(function (pg) { return normalizePage(clone(pg)); }); }
  };

  /* ====================== 4a — ทีม พอร์ตโฟลิโอแบบซ้อน (ส่วนที่ 1) ======================
   *   db.teams[]  { id:'tm_…', name, desc, color, icon, privacy: public|request|private,
   *                 members: [{u, role: admin|member}], requests: [{u, at}], pins: [p_…|pf_…],
   *                 resources: [{id, name, url, by, at}], messages: [ประกาศแบบเดียวกับโปรเจกต์], by, at }
   *   project.teams[]  [{ id: teamId, access: admin|edit|comment|view }] — สมาชิกทีมได้สิทธิ์นี้ (บวกเพิ่ม)
   *   portfolio.portfolioIds[]  พอร์ตโฟลิโอย่อย (ห้ามวน)   fields[] { id:'pff_…', name, type, options, format, src, fn }
   *   portfolio.values { itemId: { fieldId: ค่า } }  views[] { id:'pv_…', name, view }  defaultTab  messages[]
   *   personal.pfv { pfId: view }  มุมมองที่ทำงานอยู่ของแต่ละคน */
  var TEAM_PRIVACY = [
    { id: 'public',  label: 'สาธารณะ',        desc: 'ทุกคนในองค์กรเห็นและเข้าร่วมได้เอง' },
    { id: 'request', label: 'ต้องขอเข้าร่วม',  desc: 'ทุกคนเห็นทีม แต่ต้องให้ผู้ดูแลทีมอนุมัติก่อน' },
    { id: 'private', label: 'ส่วนตัว',         desc: 'เห็นเฉพาะสมาชิก เข้าได้เมื่อถูกเชิญเท่านั้น' }
  ];
  var TEAM_RES_MAX = 30, TEAM_PIN_MAX = 20;

  function normalizeMsgs(list) {
    return (Array.isArray(list) ? list : []).filter(function (m) { return m && m.id; }).map(function (m) {
      m.replies = Array.isArray(m.replies) ? m.replies.filter(function (r) { return r && r.id; }) : [];
      m.followers = Array.isArray(m.followers) ? m.followers : (m.by ? [m.by] : []);
      m.atts = Array.isArray(m.atts) ? m.atts : [];
      return m;
    });
  }
  function normalizeTeam(t) {
    t.name = String(t.name || 'ทีม');
    t.desc = typeof t.desc === 'string' ? t.desc : '';
    t.color = t.color || PALETTE[0];
    t.icon = t.icon || '👥';
    if (['public', 'request', 'private'].indexOf(t.privacy) < 0) t.privacy = 'public';
    var seen = {};
    t.members = (Array.isArray(t.members) ? t.members : []).filter(function (m) {
      if (!m || !m.u || seen[m.u]) return false;
      seen[m.u] = true;
      if (m.role !== 'admin') m.role = 'member';
      return true;
    });
    t.requests = (Array.isArray(t.requests) ? t.requests : []).filter(function (r) { return r && r.u && !seen[r.u]; });
    t.pins = Array.isArray(t.pins) ? t.pins.filter(function (x) { return typeof x === 'string'; }) : [];
    t.resources = Array.isArray(t.resources) ? t.resources.filter(function (r) { return r && r.id; }) : [];
    t.messages = normalizeMsgs(t.messages);
    return t;
  }
  function normalizePortfolio(f) {
    f.projectIds = Array.isArray(f.projectIds) ? f.projectIds : [];
    f.portfolioIds = Array.isArray(f.portfolioIds) ? f.portfolioIds.filter(function (x) { return x !== f.id; }) : [];
    f.fields = Array.isArray(f.fields) ? f.fields.filter(function (x) { return x && x.id; }) : [];
    f.fields.forEach(function (x) {
      if (PF_FIELD_TYPES.indexOf(x.type) < 0) x.type = 'text';
      if (x.type === 'select') x.options = normalizeOptions(x.options || []);
      if (x.type === 'rollup' && ROLLUP_FNS.indexOf(x.fn) < 0) x.fn = 'sum';
      if (!('format' in x)) x.format = null;
    });
    f.values = isObj(f.values) ? f.values : {};
    f.views = Array.isArray(f.views) ? f.views.filter(function (v) { return v && v.id; }) : [];
    f.views.forEach(function (v) { v.view = pfFillView(v.view); if (!v.name) v.name = 'มุมมอง'; });
    if (!('defaultTab' in f) || (f.defaultTab && !f.views.some(function (v) { return v.id === f.defaultTab; }))) f.defaultTab = null;
    f.messages = normalizeMsgs(f.messages);
    if (!('status' in f)) f.status = null;
    f.statusLog = f.statusLog || [];
    return f;
  }
  function migrate4a(d) {
    d.teams = Array.isArray(d.teams) ? d.teams.filter(function (t) { return t && t.id; }) : [];
    d.teams.forEach(normalizeTeam);
    var tids = {};
    d.teams.forEach(function (t) { tids[t.id] = true; });
    d.projects.forEach(function (p) {
      p.teams = Array.isArray(p.teams) ? p.teams.filter(function (s) { return s && tids[s.id] && ACCESS_RANK[s.access]; }) : [];
    });
    var pfIds = {};
    (d.portfolios || []).forEach(function (f) { pfIds[f.id] = true; });
    (d.portfolios || []).forEach(function (f) {
      normalizePortfolio(f);
      f.portfolioIds = f.portfolioIds.filter(function (x) { return pfIds[x]; });
    });
    if (typeof migrate4aGoals === 'function') migrate4aGoals(d);
  }

  /* ---------- ทีม ---------- */
  function teams() { return db.teams || []; }
  function team(id) { return (db.teams || []).filter(function (t) { return t.id === id; })[0] || null; }
  function teamRole(tid, userId) {
    var mm = index().teamMem[tid];
    return (mm && mm[userId || db.currentUserId]) || null;
  }
  function isTeamMember(tid, userId) { return !!teamRole(tid, userId); }
  function canSeeTeam(tid) {
    var t = team(tid);
    if (!t || !isActive()) return false;
    if (isAdmin() || isTeamMember(tid)) return true;
    if (role() === 'guest') return false;          // บุคคลภายนอกเห็นเฉพาะทีมที่ถูกเชิญ
    return t.privacy !== 'private';
  }
  function canManageTeam(tid) {
    return !!team(tid) && isActive() && (isAdmin() || teamRole(tid) === 'admin');
  }
  function visibleTeams() { return teams().filter(function (t) { return canSeeTeam(t.id); }); }
  function myTeams(userId) { return teams().filter(function (t) { return isTeamMember(t.id, userId); }); }
  function teamsOfUser(userId) { return myTeams(userId); }

  function createTeam(attrs) {
    attrs = attrs || {};
    if (!can('structure')) return null;
    var name = String(attrs.name || '').trim();
    if (!name) return null;
    snapshot('สร้างทีม');
    db.teams = db.teams || [];
    var t = normalizeTeam({
      id: uid('tm'), name: name.slice(0, 120), desc: String(attrs.desc || '').slice(0, 5000),
      color: attrs.color || PALETTE[db.teams.length % PALETTE.length], icon: attrs.icon || '👥',
      privacy: attrs.privacy, members: [{ u: db.currentUserId, role: 'admin' }],
      by: db.currentUserId, at: new Date().toISOString()
    });
    db.teams.push(t);
    audit('team.create', t.name);
    commit();
    return t;
  }
  function updateTeam(tid, patch) {
    var t = team(tid);
    if (!t || !canManageTeam(tid)) return false;
    snapshot('แก้ทีม');
    ['name', 'desc', 'color', 'icon', 'privacy'].forEach(function (k) {
      if (k in patch && patch[k] !== null && patch[k] !== undefined) t[k] = patch[k];
    });
    normalizeTeam(t);
    if ('privacy' in patch) audit('team.privacy', t.name, patch.privacy);
    commit();
    return true;
  }
  function deleteTeam(tid) {
    var t = team(tid);
    if (!t || !canManageTeam(tid)) return false;
    snapshot('ลบทีม');
    db.teams = db.teams.filter(function (x) { return x.id !== tid; });
    db.projects.forEach(function (p) { p.teams = (p.teams || []).filter(function (s) { return s.id !== tid; }); });
    (db.goals || []).forEach(function (g) { if (g.team === tid) g.team = null; });
    audit('team.delete', t.name);
    commit();
    return true;
  }
  function teamAdminsOf(t) { return t.members.filter(function (m) { return m.role === 'admin'; }).map(function (m) { return m.u; }); }
  function addTeamMember(tid, userId, roleId) {
    var t = team(tid);
    if (!t || !user(userId) || !canManageTeam(tid)) return false;
    snapshot('เพิ่มสมาชิกทีม');
    var m = t.members.filter(function (x) { return x.u === userId; })[0];
    if (m) m.role = roleId === 'admin' ? 'admin' : 'member';
    else t.members.push({ u: userId, role: roleId === 'admin' ? 'admin' : 'member' });
    t.requests = t.requests.filter(function (r) { return r.u !== userId; });
    notifyOnly(null, [userId], 'เพิ่มคุณเข้าทีม {p}', 'activity', { p: t.name }, false, { route: 'team:' + tid });
    audit('team.member', t.name, (user(userId) || {}).name);
    commit();
    return true;
  }
  /** เปลี่ยนบทบาทในทีม — ต้องเหลือผู้ดูแลทีมอย่างน้อยหนึ่งคนเสมอ */
  function setTeamRole(tid, userId, roleId) {
    var t = team(tid);
    if (!t || !canManageTeam(tid)) return false;
    var m = t.members.filter(function (x) { return x.u === userId; })[0];
    if (!m) return false;
    if (m.role === 'admin' && roleId !== 'admin' && teamAdminsOf(t).length <= 1) return false;
    snapshot('เปลี่ยนบทบาทในทีม');
    m.role = roleId === 'admin' ? 'admin' : 'member';
    commit();
    return true;
  }
  function removeTeamMember(tid, userId) {
    var t = team(tid);
    if (!t) return false;
    var self = userId === db.currentUserId;
    if (!self && !canManageTeam(tid)) return false;
    var m = t.members.filter(function (x) { return x.u === userId; })[0];
    if (!m) return false;
    if (m.role === 'admin' && teamAdminsOf(t).length <= 1) return false;
    snapshot(self ? 'ออกจากทีม' : 'ถอดสมาชิกออกจากทีม');
    t.members = t.members.filter(function (x) { return x.u !== userId; });
    audit('team.member-remove', t.name, (user(userId) || {}).name);
    commit();
    return true;
  }
  /** เข้าร่วมทีม — สาธารณะเข้าได้เลย ต้องขอ = ส่งคำขอให้ผู้ดูแลทีม ส่วนตัว = ไม่ได้ (ต้องถูกเชิญ)
   *  คืน 'joined' | 'requested' | null */
  function joinTeam(tid) {
    var t = team(tid);
    if (!t || !isActive() || isTeamMember(tid) || role() === 'guest') return null;
    if (t.privacy === 'public') {
      snapshot('เข้าร่วมทีม');
      t.members.push({ u: db.currentUserId, role: 'member' });
      audit('team.join', t.name);
      commit();
      return 'joined';
    }
    if (t.privacy === 'request') {
      if (t.requests.some(function (r) { return r.u === db.currentUserId; })) return 'requested';
      snapshot('ขอเข้าร่วมทีม');
      t.requests.push({ u: db.currentUserId, at: new Date().toISOString() });
      notifyOnly(null, teamAdminsOf(t), 'ขอเข้าร่วมทีม {p}', 'activity', { p: t.name }, false, { route: 'team:' + tid });
      commit();
      return 'requested';
    }
    return null;
  }
  function answerTeamRequest(tid, userId, ok) {
    var t = team(tid);
    if (!t || !canManageTeam(tid)) return false;
    if (!t.requests.some(function (r) { return r.u === userId; })) return false;
    snapshot(ok ? 'อนุมัติเข้าทีม' : 'ปฏิเสธคำขอเข้าทีม');
    t.requests = t.requests.filter(function (r) { return r.u !== userId; });
    if (ok && !t.members.some(function (m) { return m.u === userId; })) t.members.push({ u: userId, role: 'member' });
    notifyOnly(null, [userId], ok ? 'อนุมัติให้คุณเข้าทีม {p}' : 'ปฏิเสธคำขอเข้าทีม {p}', 'activity', { p: t.name }, false, { route: 'team:' + tid });
    commit();
    return true;
  }
  function toggleTeamPin(tid, itemId) {
    var t = team(tid);
    if (!t || !(canManageTeam(tid) || isTeamMember(tid))) return null;
    var at = t.pins.indexOf(itemId);
    if (at < 0 && t.pins.length >= TEAM_PIN_MAX) return null;
    snapshot(at >= 0 ? 'เอาหมุดออกจากทีม' : 'ปักหมุดในทีม');
    if (at >= 0) t.pins.splice(at, 1); else t.pins.push(itemId);
    commit();
    return at < 0;
  }
  function addTeamResource(tid, name, url) {
    var t = team(tid);
    if (!t || !isTeamMember(tid) && !canManageTeam(tid)) return null;
    var u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(u) || t.resources.length >= TEAM_RES_MAX) return null;
    snapshot('เพิ่มทรัพยากรของทีม');
    var r = { id: uid('kr'), name: String(name || u).trim().slice(0, 200) || u, url: u.slice(0, 2000),
      by: db.currentUserId, at: new Date().toISOString() };
    t.resources.push(r);
    commit();
    return r;
  }
  function removeTeamResource(tid, rid) {
    var t = team(tid);
    if (!t || !isTeamMember(tid) && !canManageTeam(tid)) return false;
    snapshot('ลบทรัพยากรของทีม');
    t.resources = t.resources.filter(function (r) { return r.id !== rid; });
    commit();
    return true;
  }
  /** แชร์โปรเจกต์ให้ทีม (access = null ถอดออก) — ต้องแก้โครงสร้างโปรเจกต์นั้นได้ */
  function shareProjectWithTeam(pid, tid, access) {
    var p = project(pid), t = team(tid);
    if (!p || !t || !can('structure') || !canInProject(pid, 'edit')) return false;
    if (access && !ACCESS_RANK[access]) return false;
    snapshot(access ? 'แชร์โปรเจกต์ให้ทีม' : 'เลิกแชร์โปรเจกต์ให้ทีม');
    p.teams = (p.teams || []).filter(function (s) { return s.id !== tid; });
    if (access) p.teams.push({ id: tid, access: access });
    audit('project.team', p.name, t.name + ' → ' + (access || '—'));
    if (access) {
      notifyOnly(null, t.members.map(function (m) { return m.u; }), 'แชร์โปรเจกต์ {p} ให้ทีมของคุณ', 'activity',
        { p: p.name }, false, { projectId: pid, route: 'p-overview' });
    }
    commit();
    return true;
  }
  function teamsOfProject(pid) {
    var p = project(pid);
    return ((p && p.teams) || []).map(function (s) { return { team: team(s.id), access: s.access }; })
      .filter(function (x) { return x.team; });
  }
  /** โปรเจกต์ที่แชร์ให้ทีมนี้และคนดูเห็นได้ */
  function teamProjects(tid) {
    return db.projects.filter(function (p) {
      return !p.archived && (p.teams || []).some(function (s) { return s.id === tid; }) && projectAccess(p.id);
    });
  }
  /** งานต้นทางทั้งหมดในโปรเจกต์ของทีม (ไม่ซ้ำ) */
  function teamTasks(tid) {
    var seen = {}, out = [];
    teamProjects(tid).forEach(function (p) {
      tasksInProject(p.id).forEach(function (x) {
        if (seen[x.task.id] || !canSeeTask(x.task.id)) return;
        seen[x.task.id] = true;
        out.push(x.task);
      });
    });
    return out;
  }

  /* ---------- ประกาศของโปรเจกต์ / พอร์ตโฟลิโอ / ทีม ---------- */
  function msgHost(id) {
    id = String(id || '');
    if (/^pf_/.test(id)) return portfolio(id);
    if (/^tm_/.test(id)) return team(id);
    return project(id);
  }
  function hostCan(id, need) {
    if (!isActive()) return false;
    if (/^pf_/.test(id)) return !!portfolio(id) && (need === 'view' || can(need === 'comment' ? 'comment' : 'structure'));
    if (/^tm_/.test(id)) {
      if (!team(id) || !canSeeTeam(id)) return false;
      if (need === 'view') return true;
      return can('comment') && (isTeamMember(id) || isAdmin());
    }
    return false;
  }
  function hostWatchers(id) {
    if (/^tm_/.test(id)) {
      var t = team(id);
      return t ? t.members.map(function (m) { return m.u; }).filter(function (u) { return u !== db.currentUserId; }) : [];
    }
    if (/^pf_/.test(id)) {
      var f = portfolio(id);
      return f && f.owner && f.owner !== db.currentUserId ? [f.owner] : [];
    }
    return projectWatchers(id, 'messages');
  }
  function msgNotifExtra(id) {
    if (/^tm_/.test(id)) return { route: 'team:' + id + ':messages' };
    if (/^pf_/.test(id)) return { route: 'portfolio:' + id + ':messages' };
    return { projectId: id };
  }
  /** ชื่อของปลายทางในกล่องแจ้งเตือน (route ของ 4a) */
  function routeLabel(r) {
    var m = /^(team|portfolio|goal):([^:]+)/.exec(String(r || ''));
    if (!m) return null;
    var o = m[1] === 'team' ? team(m[2]) : m[1] === 'portfolio' ? portfolio(m[2]) : (typeof goal === 'function' ? goal(m[2]) : null);
    return o ? o.name : null;
  }

  /* ---------- พอร์ตโฟลิโอซ้อน ---------- */
  var PF_FIELD_TYPES = ['number', 'text', 'select', 'date', 'person', 'rollup'];
  var ROLLUP_FNS = ['sum', 'avg', 'min', 'max', 'count'];
  var PF_FIELD_MAX = 30;

  /** พอร์ตโฟลิโอทั้งหมดที่อยู่ใต้ id (ทุกชั้น ไม่รวมตัวเอง) — กันวนด้วยชุดที่เคยเห็น */
  function pfDescendants(id) {
    var out = {}, stack = [id];
    while (stack.length) {
      var f = portfolio(stack.pop());
      (f ? f.portfolioIds || [] : []).forEach(function (c) {
        if (!out[c] && c !== id) { out[c] = true; stack.push(c); }
      });
    }
    return out;
  }
  function canNestPortfolio(parentId, childId) {
    if (!portfolio(parentId) || !portfolio(childId) || parentId === childId) return false;
    return !pfDescendants(childId)[parentId];        // ลูกต้องไม่ใช่บรรพบุรุษของแม่
  }
  /** ใส่พอร์ตโฟลิโอย่อย — คืน 'cycle' ถ้าจะทำให้วน */
  function addPortfolioToPortfolio(parentId, childId) {
    var f = portfolio(parentId), c = portfolio(childId);
    if (!f || !c || !can('structure')) return false;
    if (!canNestPortfolio(parentId, childId)) return 'cycle';
    if (f.portfolioIds.indexOf(childId) >= 0) return false;
    snapshot('ใส่พอร์ตโฟลิโอย่อย');
    f.portfolioIds.push(childId);
    audit('portfolio.nest', f.name, c.name);
    commit();
    return true;
  }
  function removePortfolioFromPortfolio(parentId, childId) {
    var f = portfolio(parentId);
    if (!f || f.portfolioIds.indexOf(childId) < 0) return false;
    snapshot('ถอดพอร์ตโฟลิโอย่อย');
    f.portfolioIds = f.portfolioIds.filter(function (x) { return x !== childId; });
    commit();
    return true;
  }
  function parentPortfolios(id) {
    return portfolios().filter(function (f) { return (f.portfolioIds || []).indexOf(id) >= 0; });
  }
  /** โปรเจกต์ที่เห็นได้ทั้งหมดใต้พอร์ตโฟลิโอนี้ ทุกชั้น ไม่ซ้ำ (4b ใช้เป็นขอบเขตของ workload/รายงาน) */
  function allProjectsUnder(id) {
    var ids = [id].concat(Object.keys(pfDescendants(id))), seen = {}, out = [];
    ids.forEach(function (fid) {
      portfolioProjects(fid).forEach(function (p) { if (!seen[p.id]) { seen[p.id] = true; out.push(p); } });
    });
    return out;
  }
  function hiddenUnder(id) {
    var ids = [id].concat(Object.keys(pfDescendants(id))), seen = {}, n = 0;
    ids.forEach(function (fid) {
      var f = portfolio(fid);
      (f ? f.projectIds : []).forEach(function (pid) {
        if (seen[pid] || !project(pid)) return;
        seen[pid] = true;
        if (!projectAccess(pid)) n++;
      });
    });
    return n;
  }
  /** แถวของพอร์ตโฟลิโอ = โปรเจกต์ที่เห็นได้ + พอร์ตโฟลิโอย่อย  [{ kind, id, o }] */
  function portfolioItems(id) {
    var f = portfolio(id);
    if (!f) return [];
    return portfolioProjects(id).map(function (p) { return { kind: 'project', id: p.id, o: p }; })
      .concat((f.portfolioIds || []).map(portfolio).filter(Boolean).map(function (c) { return { kind: 'portfolio', id: c.id, o: c }; }));
  }
  /** ตัวเลขของหนึ่งแถว — พอร์ตโฟลิโอย่อยรวมจากโปรเจกต์ทุกชั้นข้างใต้ */
  function pfItemInfo(it) {
    var projs = it.kind === 'project' ? [it.o] : allProjectsUnder(it.id);
    var s = { total: 0, done: 0, overdue: 0, msTotal: 0, msDone: 0, due: null, projects: projs.length };
    projs.forEach(function (p) {
      var st = projectStats(p.id);
      s.total += st.total; s.done += st.done; s.overdue += st.overdue;
      var ms = projectMilestones(p.id, true);
      s.msTotal += ms.length;
      s.msDone += ms.filter(function (t) { return t.completed; }).length;
      var d = it.kind === 'project' ? p.dueOn : (p.dueOn || (projectDates(p.id) || {}).to);
      if (d && (!s.due || d > s.due)) s.due = d;
    });
    s.percent = s.total ? Math.round(s.done * 100 / s.total) : 0;
    s.msPercent = s.msTotal ? Math.round(s.msDone * 100 / s.msTotal) : 0;
    s.status = it.o.status ? it.o.status.state : null;
    s.owner = it.o.owner || null;
    return s;
  }

  /* ---------- ฟิลด์ของพอร์ตโฟลิโอ + rollup ---------- */
  function pfField(f, fid) { return (f.fields || []).filter(function (x) { return x.id === fid; })[0] || null; }
  function savePfField(pfId, def) {
    var f = portfolio(pfId);
    if (!f || !can('structure') || !def || !String(def.name || '').trim()) return null;
    if (PF_FIELD_TYPES.indexOf(def.type) < 0) return null;
    var cur = def.id ? pfField(f, def.id) : null;
    if (!cur && f.fields.length >= PF_FIELD_MAX) return null;
    snapshot(cur ? 'แก้ฟิลด์พอร์ตโฟลิโอ' : 'เพิ่มฟิลด์พอร์ตโฟลิโอ');
    var x = cur || { id: uid('pff') };
    x.name = String(def.name).trim().slice(0, 80);
    x.type = cur ? cur.type : def.type;
    x.options = x.type === 'select' ? normalizeOptions(def.options || []) : [];
    x.format = (x.type === 'number' || x.type === 'rollup') ? (def.format || null) : null;
    if (x.type === 'rollup') { x.src = def.src || ''; x.fn = ROLLUP_FNS.indexOf(def.fn) >= 0 ? def.fn : 'sum'; }
    if (!cur) f.fields.push(x);
    commit();
    return x;
  }
  function deletePfField(pfId, fid) {
    var f = portfolio(pfId);
    if (!f || !pfField(f, fid) || !can('structure')) return false;
    snapshot('ลบฟิลด์พอร์ตโฟลิโอ');
    f.fields = f.fields.filter(function (x) { return x.id !== fid; });
    Object.keys(f.values).forEach(function (k) { delete f.values[k][fid]; });
    commit();
    return true;
  }
  function setPfValue(pfId, itemId, fid, v) {
    var f = portfolio(pfId), fd = f ? pfField(f, fid) : null;
    if (!fd || fd.type === 'rollup' || !can('structure')) return false;
    if (fd.type === 'number') v = (v === '' || v === null || v === undefined || isNaN(+v)) ? null : +v;
    if (v === '' || v === undefined) v = null;
    snapshot('แก้ค่าในพอร์ตโฟลิโอ');
    f.values[itemId] = f.values[itemId] || {};
    if (v === null) delete f.values[itemId][fid]; else f.values[itemId][fid] = v;
    if (!Object.keys(f.values[itemId]).length) delete f.values[itemId];
    commit();
    return true;
  }
  /** ฟิลด์ตัวเลขของงานที่ใช้เป็นต้นทางของ rollup ได้ — ฟิลด์ตัวเลข/สูตรตัวเลขในโปรเจกต์ใต้พอร์ตโฟลิโอ + คลังฟิลด์ */
  function pfRollupSources(pfId) {
    var out = [], seen = {};
    var add = function (fd, where) {
      if (seen[fd.id] || !(fd.type === 'number' || (fd.type === 'formula' && fd.out !== 'date'))) return;
      seen[fd.id] = true;
      out.push({ id: fd.id, name: fd.name + (where ? ' · ' + where : '') });
    };
    (db.fieldLib || []).forEach(function (fd) { add(fd, ''); });
    allProjectsUnder(pfId).forEach(function (p) { (p.fields || []).forEach(function (fd) { add(fd, p.name); }); });
    return out;
  }
  function rollupValue(it, fd) {
    var projs = it.kind === 'project' ? [it.o] : allProjectsUnder(it.id);
    var vals = [], seen = {};
    projs.forEach(function (p) {
      tasksInProject(p.id).forEach(function (x) {
        if (seen[x.task.id] || !canSeeTask(x.task.id)) return;
        seen[x.task.id] = true;
        var v = fieldValue(x.task.id, fd.src);
        if (typeof v === 'number' && isFinite(v)) vals.push(v);
      });
    });
    if (fd.fn === 'count') return vals.length;
    if (!vals.length) return null;
    var sum = vals.reduce(function (a, b) { return a + b; }, 0);
    if (fd.fn === 'avg') return Math.round(sum / vals.length * 100) / 100;
    if (fd.fn === 'min') return Math.min.apply(null, vals);
    if (fd.fn === 'max') return Math.max.apply(null, vals);
    return Math.round(sum * 10000) / 10000;
  }
  function pfFieldValue(f, it, fid) {
    var fd = pfField(f, fid);
    if (!fd) return null;
    if (fd.type === 'rollup') return rollupValue(it, fd);
    var v = f.values[it.id] && f.values[it.id][fid];
    return v === undefined ? null : v;
  }

  /* ---------- มุมมองของพอร์ตโฟลิโอ (ตัวกรอง เรียง จัดกลุ่ม แท็บที่บันทึก) ---------- */
  var PF_BUILTIN = [
    { id: 'name',     label: 'ชื่อ',              kind: 'text' },
    { id: 'kind',     label: 'ชนิด',              kind: 'select' },
    { id: 'status',   label: 'สถานะ',             kind: 'select' },
    { id: 'owner',    label: 'เจ้าของ',            kind: 'person' },
    { id: 'due',      label: 'กำหนดส่ง',           kind: 'date' },
    { id: 'progress', label: 'ความคืบหน้า (%)',     kind: 'number' },
    { id: 'msprog',   label: 'หมุดหมายที่เสร็จ (%)', kind: 'number' },
    { id: 'overdue',  label: 'งานเลยกำหนด',        kind: 'number' }
  ];
  var PF_GROUPS = [['none', 'ไม่จัดกลุ่ม'], ['status', 'สถานะ'], ['owner', 'เจ้าของ'], ['kind', 'ชนิด']];
  function pfDefaultView() { return { filters: [], sorts: [], group: 'none', hide: [] }; }
  function pfFillView(v) {
    var d = pfDefaultView();
    v = isObj(v) ? v : {};
    Object.keys(d).forEach(function (k) { if (!(k in v)) v[k] = clone(d[k]); });
    v.filters = Array.isArray(v.filters) ? v.filters.filter(function (c) { return c && c.f; }) : [];
    v.sorts = Array.isArray(v.sorts) ? v.sorts.filter(function (s) { return s && s.k; }).slice(0, 3) : [];
    v.hide = Array.isArray(v.hide) ? v.hide : [];
    return v;
  }
  function pfFilterFields(pfId) {
    var f = portfolio(pfId);
    var out = PF_BUILTIN.slice();
    ((f && f.fields) || []).forEach(function (fd) {
      var kind = fd.type === 'rollup' ? 'number' : fd.type;
      out.push({ id: 'pff:' + fd.id, label: fd.name, kind: kind, field: fd, custom: true });
    });
    return out;
  }
  function pfFilterChoices(pfId, fid) {
    var f = portfolio(pfId);
    if (fid === 'status') return PROJECT_STATES.map(function (x) { return [x.id, x.label, x.color]; });
    if (fid === 'kind') return [['project', 'โปรเจกต์', null], ['portfolio', 'พอร์ตโฟลิโอ', null]];
    if (fid === 'owner') return [[ME, 'ฉัน', null]].concat(db.users.filter(function (u) { return u.active !== false; })
      .map(function (u) { return [u.id, u.name, u.color]; }));
    var fd = f && fid.indexOf('pff:') === 0 ? pfField(f, fid.slice(4)) : null;
    if (fd && fd.type === 'person') return [[ME, 'ฉัน', null]].concat(db.users.map(function (u) { return [u.id, u.name, u.color]; }));
    if (fd && fd.type === 'select') return fd.options.map(function (o) { return [o.name, o.name, o.color]; });
    return [];
  }
  function pfItemValue(f, it, fid, info) {
    info = info || pfItemInfo(it);
    switch (fid) {
      case 'name': return it.o.name;
      case 'kind': return it.kind;
      case 'status': return info.status;
      case 'owner': return info.owner;
      case 'due': return info.due;
      case 'progress': return info.percent;
      case 'msprog': return info.msTotal ? info.msPercent : null;
      case 'overdue': return info.overdue;
    }
    if (fid.indexOf('pff:') === 0) return pfFieldValue(f, it, fid.slice(4));
    return null;
  }
  /** แถวที่ผ่านตัวกรองและเรียงแล้ว [{ it, info }] */
  function pfViewItems(pfId, view) {
    var f = portfolio(pfId);
    if (!f) return [];
    view = pfFillView(view);
    var defs = {};
    pfFilterFields(pfId).forEach(function (d) { defs[d.id] = d; });
    var rows = portfolioItems(pfId).map(function (it) { return { it: it, info: pfItemInfo(it) }; });
    rows = rows.filter(function (r) {
      return view.filters.every(function (c) {
        var d = defs[c.f];
        if (!d) return true;
        var val = pfItemValue(f, r.it, c.f, r.info);
        return matchValue(d.kind, val, c, c.f === 'due' && r.info.status && projectStateDone(r.info.status));
      });
    });
    if (view.sorts.length) {
      var rank = {};
      PROJECT_STATES.forEach(function (x, i) { rank[x.id] = i; });
      rows.sort(function (a, b) {
        for (var i = 0; i < view.sorts.length; i++) {
          var s = view.sorts[i];
          var va = pfItemValue(f, a.it, s.k, a.info), vb = pfItemValue(f, b.it, s.k, b.info);
          if (s.k === 'status') { va = va ? rank[va] : null; vb = vb ? rank[vb] : null; }
          if (s.k === 'owner') { va = va ? (user(va) || {}).name : null; vb = vb ? (user(vb) || {}).name : null; }
          var ea = va === null || va === undefined || va === '', eb = vb === null || vb === undefined || vb === '';
          if (ea && eb) continue;
          if (ea) return 1;                // ว่างไว้ท้ายเสมอ
          if (eb) return -1;
          var c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
          if (c) return s.d === 'desc' ? -c : c;
        }
        return 0;
      });
    }
    return rows;
  }
  function projectStateDone(id) {
    var s = PROJECT_STATES.filter(function (x) { return x.id === id; })[0];
    return !!(s && s.done);
  }
  /** จัดกลุ่ม [{ key, label, color, rows }] */
  function pfViewGroups(pfId, view) {
    view = pfFillView(view);
    var rows = pfViewItems(pfId, view), f = portfolio(pfId);
    var g = view.group;
    if (!g || g === 'none') return [{ key: '', label: '', rows: rows }];
    var map = {}, order = [];
    rows.forEach(function (r) {
      var k = g === 'kind' ? r.it.kind : g === 'status' ? (r.info.status || '') : g === 'owner' ? (r.info.owner || '')
        : String(pfItemValue(f, r.it, g, r.info) || '');
      if (!map[k]) { map[k] = []; order.push(k); }
      map[k].push(r);
    });
    if (g === 'status') {
      var pos = {};
      PROJECT_STATES.forEach(function (x, i) { pos[x.id] = i; });
      order.sort(function (a, b) { return (a ? pos[a] : 99) - (b ? pos[b] : 99); });
    }
    return order.map(function (k) {
      var label = k, color = null;
      if (g === 'status') { var st = PROJECT_STATES.filter(function (x) { return x.id === k; })[0]; label = st ? st.label : 'ยังไม่รายงาน'; color = st ? st.color : null; }
      else if (g === 'owner') { var u = user(k); label = u ? u.name : 'ยังไม่ระบุ'; color = u ? u.color : null; }
      else if (g === 'kind') label = k === 'portfolio' ? 'พอร์ตโฟลิโอ' : 'โปรเจกต์';
      else if (!k) label = 'ว่าง';
      return { key: k, label: label, color: color, rows: map[k] };
    });
  }
  function pfView(pfId) {
    var st = personalOf();
    return pfFillView(clone((st.pfv && st.pfv[pfId]) || {}));
  }
  /** มุมมองที่ทำงานอยู่ของแต่ละคน บันทึกเงียบ ๆ ไม่เป็นจุดย้อนกลับ (แบบ setProjView) */
  function setPfView(pfId, view) {
    if (!portfolio(pfId) || !me()) return false;
    var st = personalOf();
    if (!isObj(st.pfv)) st.pfv = {};
    st.pfv[pfId] = pfFillView(clone(view));
    persist();
    return true;
  }
  function pfSavedView(pfId, vid) {
    var f = portfolio(pfId);
    return f ? f.views.filter(function (v) { return v.id === vid; })[0] || null : null;
  }
  function pfSaveView(pfId, name, view) {
    var f = portfolio(pfId);
    if (!f || !can('structure') || !String(name || '').trim() || f.views.length >= SV_MAX) return null;
    snapshot('บันทึกมุมมองพอร์ตโฟลิโอ');
    var v = { id: uid('pv'), name: String(name).trim().slice(0, 60), view: pfFillView(clone(view)) };
    f.views.push(v);
    commit();
    return v;
  }
  function pfUpdateView(pfId, vid, patch) {
    var v = pfSavedView(pfId, vid);
    if (!v || !can('structure')) return false;
    snapshot('แก้มุมมองพอร์ตโฟลิโอ');
    if (patch.name) v.name = String(patch.name).trim().slice(0, 60);
    if (patch.view) v.view = pfFillView(clone(patch.view));
    commit();
    return true;
  }
  function pfDeleteView(pfId, vid) {
    var f = portfolio(pfId);
    if (!f || !pfSavedView(pfId, vid) || !can('structure')) return false;
    snapshot('ลบมุมมองพอร์ตโฟลิโอ');
    f.views = f.views.filter(function (v) { return v.id !== vid; });
    if (f.defaultTab === vid) f.defaultTab = null;
    commit();
    return true;
  }
  function pfSetDefaultTab(pfId, vid) {
    var f = portfolio(pfId);
    if (!f || !can('structure')) return false;
    snapshot('ตั้งแท็บเริ่มต้นของพอร์ตโฟลิโอ');
    f.defaultTab = vid && pfSavedView(pfId, vid) ? vid : null;
    commit();
    return true;
  }
  /** อัปเดตสถานะพอร์ตโฟลิโอพร้อมข้อความ (แท็บความคืบหน้า) */
  function postPortfolioUpdate(pfId, state, text) {
    if (!portfolio(pfId) || !can('structure') || !PROJECT_STATES.some(function (x) { return x.id === state; })) return false;
    /* Sprint 2B — แจ้งผู้ติดตามอยู่ใน setPortfolioStatus แล้ว (เดิมแจ้งเจ้าของซ้ำที่นี่) */
    setPortfolioStatus(pfId, state, String(text || '').slice(0, 20000));
    return true;
  }

  /* ====================== 4a ส่วนที่ 2 — เป้าหมาย แผนผังกลยุทธ์ ======================
   *   db.goals[]  { id:'g_…', name, owner, team: null(บริษัท)|teamId, period: { k: fy|h1|h2|q1..q4|custom, fy, from, to },
   *                 privacy: public|private, members: [uid], parent: gid|null, desc, fv: { gf_…: ค่า },
   *                 metric: { src: manual|subgoals|projects|tasks, unit: percent|number|currency, start, target, current,
   *                           currency, agg: avg|sum, weights: { gid: w } | null, projects: [pid], projBy: tasks|milestones, tasks: [tid] },
   *                 status: { state, at, by } | null, updates: [{ id, state, text, pct, by, at }] (≤ 60),
   *                 hist: [[YYYY-MM-DD, pct]] (≤ 180), closed: { outcome: achieved|partial|missed|dropped, note, by, at } | null,
   *                 rel: [p_…|pf_…|t_…] งานที่เกี่ยวข้อง, comments: [{ id, by, at, body }], act: [{ at, by, k, p }] (≤ 100),
   *                 remind: bool, by, at }
   *   db.goalFields[] { id:'gf_…', name, type: text|number|select, options }  ฟิลด์ของเป้าหมาย (ทั้งองค์กร)
   *   db.settings.fyStart (1–12)  mission / missionBy / missionAt */
  var GOAL_STATES = [
    { id: 'on_track',  label: 'ตามแผน',  color: '#37c5ab' },
    { id: 'at_risk',   label: 'เสี่ยง',   color: '#f5a623' },
    { id: 'off_track', label: 'หลุดแผน', color: '#e8384f' }
  ];
  var GOAL_OUTCOMES = [
    { id: 'achieved', label: 'สำเร็จ',          color: '#37c5ab' },
    { id: 'partial',  label: 'สำเร็จบางส่วน',   color: '#f5a623' },
    { id: 'missed',   label: 'ไม่สำเร็จ',        color: '#e8384f' },
    { id: 'dropped',  label: 'ยกเลิก',          color: '#9ca0a8' }
  ];
  var GOAL_PERIODS = [['fy', 'ทั้งปีงบ'], ['h1', 'ครึ่งปีแรก'], ['h2', 'ครึ่งปีหลัง'], ['q1', 'ไตรมาส 1'], ['q2', 'ไตรมาส 2'],
                      ['q3', 'ไตรมาส 3'], ['q4', 'ไตรมาส 4'], ['custom', 'กำหนดเอง']];
  var GOAL_SRCS = [['manual', 'กรอกเอง'], ['subgoals', 'จากเป้าหมายย่อย'], ['projects', 'จากโปรเจกต์'], ['tasks', 'จากงาน']];

  function fyStart() { var m = parseInt(((db && db.settings) || {}).fyStart, 10); return m >= 1 && m <= 12 ? m : 1; }
  /** ปีงบตั้งชื่อตามปีที่สิ้นสุด (เริ่ม ต.ค. 2025 → FY2026) เริ่มมกราคม = ปีปฏิทิน */
  function fyOf(dateIso) {
    var d = new Date((dateIso || today()) + 'T00:00:00'), m = fyStart();
    return m === 1 ? d.getFullYear() : (d.getMonth() + 1 >= m ? d.getFullYear() + 1 : d.getFullYear());
  }
  function monthStart(y, m0) { return iso(new Date(y, m0, 1)); }
  function periodRange(p) {
    p = p || {};
    if (p.k === 'custom') return { from: p.from || today(), to: p.to || p.from || today() };
    var fy = parseInt(p.fy, 10) || fyOf(), m = fyStart();
    var y0 = m === 1 ? fy : fy - 1, m0 = m - 1;            // วันแรกของปีงบ
    var off = { fy: [0, 12], h1: [0, 6], h2: [6, 6], q1: [0, 3], q2: [3, 3], q3: [6, 3], q4: [9, 3] }[p.k] || [0, 12];
    var from = monthStart(y0, m0 + off[0]);
    var to = addDays(monthStart(y0, m0 + off[0] + off[1]), -1);
    return { from: from, to: to };
  }
  function periodLabel(p) {
    p = p || {};
    if (p.k === 'custom') { var r = periodRange(p); return r.from + ' – ' + r.to; }
    var fy = 'FY' + String(parseInt(p.fy, 10) || fyOf()).slice(2);
    return p.k === 'fy' || !p.k ? fy : p.k.toUpperCase() + ' ' + fy;
  }

  function normalizeGoal(g) {
    g.name = String(g.name || 'เป้าหมาย').slice(0, 200);
    if (!g.owner) g.owner = null;
    if (!('team' in g)) g.team = null;
    g.period = isObj(g.period) ? g.period : { k: 'fy', fy: fyOf() };
    if (g.privacy !== 'private') g.privacy = 'public';
    g.members = Array.isArray(g.members) ? g.members : [];
    if (!('parent' in g)) g.parent = null;
    if (typeof g.desc !== 'string') g.desc = '';
    g.fv = isObj(g.fv) ? g.fv : {};
    var m = g.metric = isObj(g.metric) ? g.metric : {};
    if (['manual', 'subgoals', 'projects', 'tasks'].indexOf(m.src) < 0) m.src = 'manual';
    if (['percent', 'number', 'currency'].indexOf(m.unit) < 0) m.unit = 'percent';
    m.start = isFinite(+m.start) ? +m.start : 0;
    m.target = isFinite(+m.target) && m.target !== null && m.target !== '' ? +m.target : 100;
    m.current = isFinite(+m.current) ? +m.current : m.start;
    m.currency = m.currency || 'THB';
    if (m.agg !== 'sum') m.agg = 'avg';
    m.weights = isObj(m.weights) ? m.weights : null;
    m.projects = Array.isArray(m.projects) ? m.projects : [];
    if (m.projBy !== 'milestones') m.projBy = 'tasks';
    m.tasks = Array.isArray(m.tasks) ? m.tasks : [];
    if (!('status' in g)) g.status = null;
    g.updates = Array.isArray(g.updates) ? g.updates : [];
    g.hist = Array.isArray(g.hist) ? g.hist.filter(function (h) { return Array.isArray(h) && h.length === 2; }) : [];
    if (!('closed' in g)) g.closed = null;
    g.rel = Array.isArray(g.rel) ? g.rel : [];
    g.comments = Array.isArray(g.comments) ? g.comments : [];
    g.act = Array.isArray(g.act) ? g.act : [];
    g.remind = g.remind !== false;
    return g;
  }
  function migrate4aGoals(d) {
    d.goals = Array.isArray(d.goals) ? d.goals.filter(function (g) { return g && g.id; }) : [];
    d.goals.forEach(normalizeGoal);
    var ids = {};
    d.goals.forEach(function (g) { ids[g.id] = true; });
    d.goals.forEach(function (g) { if (g.parent && !ids[g.parent]) g.parent = null; });
    d.goalFields = Array.isArray(d.goalFields) ? d.goalFields.filter(function (f) { return f && f.id; }) : [];
    d.settings = d.settings || {};
    if (typeof d.settings.mission !== 'string') d.settings.mission = '';
  }

  /* ---------- สิทธิ์ ---------- */
  function goals() { return db.goals || []; }
  function goal(id) { return (db.goals || []).filter(function (g) { return g.id === id; })[0] || null; }
  function canSeeGoal(id) {
    var g = goal(id), me0 = db.currentUserId;
    if (!g || !isActive()) return false;
    if (isAdmin() || g.owner === me0 || g.members.indexOf(me0) >= 0) return true;
    if (g.privacy === 'private') return !!(g.team && isTeamMember(g.team));
    if (role() === 'guest') return !!(g.team && isTeamMember(g.team));
    return !g.team || canSeeTeam(g.team);
  }
  function canEditGoal(id) {
    var g = goal(id), me0 = db.currentUserId;
    if (!g || !can('write')) return false;
    return isAdmin() || g.owner === me0 || g.members.indexOf(me0) >= 0 || (!!g.team && canManageTeam(g.team));
  }
  function visibleGoals() { return goals().filter(function (g) { return canSeeGoal(g.id); }); }
  function subGoals(id) { return goals().filter(function (g) { return g.parent === id; }); }
  function goalAncestors(id) {
    var out = {}, g = goal(id), guard = 0;
    while (g && g.parent && guard++ < 50) { out[g.parent] = true; g = goal(g.parent); }
    return out;
  }
  function goalDescendants(id) {
    var out = {}, stack = [id];
    while (stack.length) subGoals(stack.pop()).forEach(function (c) { if (!out[c.id]) { out[c.id] = true; stack.push(c.id); } });
    return out;
  }
  function gAct(g, k, p) {
    g.act.push({ at: new Date().toISOString(), by: db.currentUserId, k: k, p: p || null });
    if (g.act.length > 100) g.act = g.act.slice(-100);
  }
  function goalPeople(g) {
    var out = [];
    [g.owner].concat(g.members).forEach(function (u) { if (u && out.indexOf(u) < 0 && user(u)) out.push(u); });
    return out;
  }

  /* ---------- ความคืบหน้า ---------- */
  function taskDone(t) {
    if (t.completed) return true;
    var sd = t.cstatus ? statusDef(t.cstatus) : null;
    return !!(sd && sd.st.done);                   // 3b — สถานะของชนิดงานที่นับว่าเสร็จ
  }
  /** { pct (0–100), value, start, target, unit, src, detail } — กันวนด้วย seen */
  function goalProgress(id, seen) {
    var g = goal(id);
    if (!g) return { pct: 0, value: 0 };
    seen = seen || {};
    if (seen[id]) return { pct: 0, value: 0 };
    seen[id] = true;
    var m = g.metric, out = { unit: m.unit, start: m.start, target: m.target, src: m.src, detail: '' };
    var fromValue = function (v) {
      if (m.unit === 'percent') return Math.max(0, Math.min(100, v));
      var span = m.target - m.start;
      return span ? Math.max(0, Math.min(100, (v - m.start) / span * 100)) : (v >= m.target ? 100 : 0);
    };
    if (m.src === 'subgoals') {
      var kids = subGoals(id).filter(function (c) { return !c.closed || c.closed.outcome !== 'dropped'; });
      if (!kids.length) { out.value = m.unit === 'percent' ? 0 : m.start; out.pct = 0; }
      else if (m.agg === 'sum' && m.unit !== 'percent') {
        var sum = 0;
        kids.forEach(function (c) { sum += goalProgress(c.id, seen).value || 0; });
        out.value = sum; out.pct = fromValue(sum);
      } else {
        var w = m.weights, tw = 0, acc = 0;
        kids.forEach(function (c) {
          var wt = w && isFinite(+w[c.id]) ? +w[c.id] : (w ? 0 : 1);
          tw += wt; acc += goalProgress(c.id, seen).pct * wt;
        });
        out.pct = tw ? acc / tw : 0;
        out.value = m.unit === 'percent' ? out.pct : m.start + (m.target - m.start) * out.pct / 100;
      }
      out.detail = kids.length;
    } else if (m.src === 'projects') {
      var done = 0, total = 0;
      m.projects.forEach(function (pid) {
        if (!project(pid)) return;
        if (m.projBy === 'milestones') {
          projectMilestones(pid, true).forEach(function (t) { total++; if (taskDone(t)) done++; });
        } else {
          tasksInProject(pid).forEach(function (x) { total++; if (taskDone(x.task)) done++; });
        }
      });
      out.pct = total ? done * 100 / total : 0; out.done = done; out.total = total;
      out.value = m.unit === 'percent' ? out.pct : m.start + (m.target - m.start) * out.pct / 100;
    } else if (m.src === 'tasks') {
      var d2 = 0, t2 = 0;
      m.tasks.forEach(function (tid) { var t = task(tid); if (!t) return; t2++; if (taskDone(t)) d2++; });
      out.pct = t2 ? d2 * 100 / t2 : 0; out.done = d2; out.total = t2;
      out.value = m.unit === 'percent' ? out.pct : m.start + (m.target - m.start) * out.pct / 100;
    } else {
      out.value = m.current;
      out.pct = fromValue(m.current);
    }
    out.pct = Math.round(out.pct * 10) / 10;
    out.value = Math.round(out.value * 100) / 100;
    return out;
  }
  function goalValueText(g, v) {
    var m = g.metric;
    if (m.unit === 'percent') return (Math.round(v * 10) / 10) + '%';
    if (m.unit === 'currency') return formatNumber({ format: { kind: 'currency', currency: m.currency } }, v);
    return formatNumber(null, v);
  }
  /** บันทึกจุดของกราฟวันนี้ (แทนจุดเดิมของวันเดียวกัน) — คืน true เมื่อเปลี่ยน */
  function stampHist(g) {
    var p = goalProgress(g.id).pct, td = today(), last = g.hist[g.hist.length - 1];
    if (last && last[0] === td) { if (last[1] === p) return false; last[1] = p; return true; }
    if (last && last[1] === p && g.hist.length > 1) return false;
    g.hist.push([td, p]);
    if (g.hist.length > 180) g.hist = g.hist.slice(-180);
    return true;
  }

  /* ---------- สร้าง แก้ ลบ ---------- */
  function createGoal(attrs) {
    attrs = attrs || {};
    if (!can('write') || !String(attrs.name || '').trim()) return null;
    if (attrs.team && !(isTeamMember(attrs.team) || isAdmin())) return null;
    snapshot('สร้างเป้าหมาย');
    db.goals = db.goals || [];
    var g = normalizeGoal({
      id: uid('g'), name: String(attrs.name).trim(), owner: attrs.owner || db.currentUserId, team: attrs.team || null,
      period: attrs.period, privacy: attrs.privacy, members: attrs.members || [], parent: attrs.parent && goal(attrs.parent) ? attrs.parent : null,
      desc: attrs.desc || '', metric: attrs.metric || {}, by: db.currentUserId, at: new Date().toISOString()
    });
    gAct(g, 'สร้างเป้าหมายนี้');
    db.goals.push(g);
    stampHist(g);
    if (g.parent) { var pg = goal(g.parent); stampHist(pg); }
    if (g.owner !== db.currentUserId) notifyOnly(null, [g.owner], 'ตั้งให้คุณเป็นเจ้าของเป้าหมาย “{t}”', 'assigned', { t: g.name }, false, { route: 'goal:' + g.id });
    audit('goal.create', g.name);
    commit();
    return g;
  }
  function updateGoal(id, patch) {
    var g = goal(id);
    if (!g || !canEditGoal(id)) return false;
    if ('parent' in patch && patch.parent && (patch.parent === id || goalDescendants(id)[patch.parent] || !goal(patch.parent))) return 'cycle';
    snapshot('แก้เป้าหมาย');
    var oldParent = g.parent;
    ['name', 'owner', 'team', 'period', 'privacy', 'members', 'parent', 'desc', 'remind'].forEach(function (k) {
      if (k in patch) g[k] = patch[k];
    });
    if (patch.metric) {
      Object.keys(patch.metric).forEach(function (k) { g.metric[k] = patch.metric[k]; });
      gAct(g, 'เปลี่ยนวิธีวัดความคืบหน้า');
    }
    normalizeGoal(g);
    if ('name' in patch || 'period' in patch || 'owner' in patch) gAct(g, 'แก้รายละเอียดเป้าหมาย');
    if ('parent' in patch && patch.parent !== oldParent) gAct(g, 'ย้ายไปอยู่ใต้ “{t}”', { t: g.parent ? goal(g.parent).name : '—' });
    [g.id, oldParent, g.parent].forEach(function (x) { var gg = x && goal(x); if (gg) stampHist(gg); });
    commit();
    return true;
  }
  function setGoalValue(id, v) {
    var g = goal(id);
    if (!g || !canEditGoal(id) || g.metric.src !== 'manual' || !isFinite(+v)) return false;
    snapshot('อัปเดตค่าเป้าหมาย');
    var before = g.metric.current;
    g.metric.current = +v;
    gAct(g, 'อัปเดตค่าจาก {a} เป็น {b}', { a: goalValueText(g, before), b: goalValueText(g, +v) });
    stampHist(g);
    var a = goalAncestors(id);
    Object.keys(a).forEach(function (x) { stampHist(goal(x)); });
    commit();
    return true;
  }
  function deleteGoal(id) {
    var g = goal(id);
    if (!g || !(isAdmin() || g.owner === db.currentUserId)) return false;
    snapshot('ลบเป้าหมาย');
    db.goals = db.goals.filter(function (x) { return x.id !== id; });
    db.goals.forEach(function (x) {
      if (x.parent === id) x.parent = g.parent;               // ลูกขึ้นไปอยู่ใต้แม่ของตัวที่ถูกลบ
      if (x.metric.weights) delete x.metric.weights[id];
    });
    audit('goal.delete', g.name);
    commit();
    return true;
  }
  function postGoalUpdate(id, state, text) {
    var g = goal(id);
    if (!g || !canEditGoal(id) || !GOAL_STATES.some(function (s) { return s.id === state; })) return null;
    snapshot('อัปเดตสถานะเป้าหมาย');
    var pct = goalProgress(id).pct;
    var u = { id: uid('gu'), state: state, text: String(text || '').slice(0, 20000), pct: pct, by: db.currentUserId, at: new Date().toISOString() };
    g.updates.push(u);
    if (g.updates.length > 60) g.updates = g.updates.slice(-60);
    g.status = { state: state, at: u.at, by: u.by };
    gAct(g, 'อัปเดตสถานะเป็น “{s}”', { s: (GOAL_STATES.filter(function (s) { return s.id === state; })[0] || {}).label });
    stampHist(g);
    notifyOnly(null, goalPeople(g), 'อัปเดตสถานะเป้าหมาย “{t}”', 'status', { t: g.name }, false, { route: 'goal:' + id });
    commit();
    return u;
  }
  function closeGoal(id, outcome, note) {
    var g = goal(id);
    if (!g || !canEditGoal(id) || !GOAL_OUTCOMES.some(function (o) { return o.id === outcome; })) return false;
    snapshot('ปิดเป้าหมาย');
    g.closed = { outcome: outcome, note: String(note || '').slice(0, 2000), by: db.currentUserId, at: new Date().toISOString() };
    stampHist(g);
    gAct(g, 'ปิดเป้าหมาย: {o}', { o: (GOAL_OUTCOMES.filter(function (o) { return o.id === outcome; })[0] || {}).label });
    notifyOnly(null, goalPeople(g), 'ปิดเป้าหมาย “{t}”', 'status', { t: g.name }, false, { route: 'goal:' + id });
    audit('goal.close', g.name, outcome);
    commit();
    return true;
  }
  function reopenGoal(id) {
    var g = goal(id);
    if (!g || !g.closed || !canEditGoal(id)) return false;
    snapshot('เปิดเป้าหมายอีกครั้ง');
    g.closed = null;
    gAct(g, 'เปิดเป้าหมายอีกครั้ง');
    commit();
    return true;
  }
  function addGoalComment(id, body) {
    var g = goal(id);
    body = String(body || '').trim();
    if (!g || !body || !canSeeGoal(id) || !can('comment')) return null;
    snapshot('แสดงความเห็นในเป้าหมาย');
    var c = { id: uid('gc'), by: db.currentUserId, at: new Date().toISOString(), body: body.slice(0, 20000) };
    g.comments.push(c);
    var men = parseMentions(body);
    if (men.length) notifyOnly(null, men, 'พูดถึงคุณในเป้าหมาย “{t}”', 'mention', { t: g.name }, false, { route: 'goal:' + id });
    notifyOnly(null, goalPeople(g).filter(function (u) { return men.indexOf(u) < 0; }), 'แสดงความเห็นในเป้าหมาย “{t}”', 'comment',
      { t: g.name }, false, { route: 'goal:' + id });
    commit();
    return c;
  }
  function deleteGoalComment(id, cid) {
    var g = goal(id), c = g && g.comments.filter(function (x) { return x.id === cid; })[0];
    if (!c || (c.by !== db.currentUserId && !can('manage'))) return false;
    snapshot('ลบความเห็น');
    g.comments = g.comments.filter(function (x) { return x.id !== cid; });
    commit();
    return true;
  }
  function toggleGoalRel(id, itemId) {
    var g = goal(id);
    if (!g || !canEditGoal(id) || !/^(p|pf|t)_/.test(itemId)) return null;
    var at = g.rel.indexOf(itemId);
    snapshot(at >= 0 ? 'เอางานที่เกี่ยวข้องออก' : 'เพิ่มงานที่เกี่ยวข้อง');
    if (at >= 0) g.rel.splice(at, 1); else g.rel.push(itemId);
    commit();
    return at < 0;
  }
  function setGoalField(id, fid, v) {
    var g = goal(id), fd = (db.goalFields || []).filter(function (f) { return f.id === fid; })[0];
    if (!g || !fd || !canEditGoal(id)) return false;
    if (fd.type === 'number') v = v === '' || v === null || !isFinite(+v) ? null : +v;
    snapshot('แก้ฟิลด์ของเป้าหมาย');
    if (v === null || v === '') delete g.fv[fid]; else g.fv[fid] = v;
    commit();
    return true;
  }
  function saveGoalField(def) {
    if (!isAdmin() || !def || !String(def.name || '').trim()) return null;
    snapshot('แก้ฟิลด์ของเป้าหมาย');
    db.goalFields = db.goalFields || [];
    var f = def.id ? db.goalFields.filter(function (x) { return x.id === def.id; })[0] : null;
    if (!f) { f = { id: uid('gf') }; db.goalFields.push(f); }
    f.name = String(def.name).trim().slice(0, 80);
    f.type = ['text', 'number', 'select'].indexOf(def.type) >= 0 ? def.type : 'text';
    f.options = f.type === 'select' ? normalizeOptions(def.options || []) : [];
    commit();
    return f;
  }
  function deleteGoalField(fid) {
    if (!isAdmin()) return false;
    snapshot('ลบฟิลด์ของเป้าหมาย');
    db.goalFields = (db.goalFields || []).filter(function (f) { return f.id !== fid; });
    goals().forEach(function (g) { delete g.fv[fid]; });
    commit();
    return true;
  }
  function setGoalSettings(patch) {
    if (!isAdmin()) return false;
    snapshot('ตั้งค่าเป้าหมาย');
    db.settings = db.settings || {};
    if ('fyStart' in patch) db.settings.fyStart = Math.max(1, Math.min(12, parseInt(patch.fyStart, 10) || 1));
    if ('mission' in patch) {
      db.settings.mission = String(patch.mission || '').slice(0, 2000);
      db.settings.missionBy = db.currentUserId;
      db.settings.missionAt = new Date().toISOString();
    }
    audit('settings.goals', null, 'fyStart' in patch ? 'ปีงบเริ่มเดือน {v}' : 'แก้พันธกิจ', { v: db.settings.fyStart });
    commit();
    return true;
  }

  /* ---------- ใช้ร่วมกับพอร์ตโฟลิโอ หน้าแรก อ้างอิง CSV ---------- */
  /** เป้าหมายที่ผูกกับโปรเจกต์/พอร์ตโฟลิโอนี้ (วัดผลจาก หรืออยู่ในงานที่เกี่ยวข้อง) */
  function goalsOfItem(itemId) {
    return visibleGoals().filter(function (g) { return (g.metric.src === 'projects' && g.metric.projects.indexOf(itemId) >= 0) || g.rel.indexOf(itemId) >= 0; });
  }
  function myGoals() {
    var me0 = db.currentUserId;
    return visibleGoals().filter(function (g) { return g.owner === me0 || g.members.indexOf(me0) >= 0; });
  }
  function goalsCsv(list) {
    var q = function (s) { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var fields = db.goalFields || [];
    var rows = [['name', 'owner', 'team', 'period', 'from', 'to', 'progress_pct', 'current', 'start', 'target', 'unit', 'source',
      'status', 'closed', 'parent'].concat(fields.map(function (f) { return f.name; }))];
    (list || visibleGoals()).forEach(function (g) {
      var p = goalProgress(g.id), r = periodRange(g.period);
      rows.push([g.name, (user(g.owner) || {}).name || '', g.team ? (team(g.team) || {}).name || '' : 'บริษัท', periodLabel(g.period),
        r.from, r.to, p.pct, p.value, g.metric.start, g.metric.target, g.metric.unit, g.metric.src,
        g.status ? g.status.state : '', g.closed ? g.closed.outcome : '', g.parent ? (goal(g.parent) || {}).name || '' : '']
        .concat(fields.map(function (f) { return g.fv[f.id] == null ? '' : g.fv[f.id]; })));
    });
    return '﻿' + rows.map(function (r) { return r.map(q).join(','); }).join('\r\n');
  }
  /** เตือนเจ้าของเป้าหมายที่ยังเปิดอยู่ให้อัปเดตสถานะ — ไม่ได้อัปเดตเกิน 7 วัน เตือนสัปดาห์ละครั้ง (dedupe ในกล่องแจ้งเตือน)
   *  และบันทึกจุดกราฟความคืบหน้าของวันนี้ (เงียบ ๆ ไม่เป็นจุดย้อนกลับ) */
  function checkGoalReminders(opts) {
    if (!db || !isActive() || !(db.goals || []).length) return 0;
    var td = (opts && opts.today) || today(), me0 = db.currentUserId, n = 0, changed = false;
    var d = new Date(td + 'T00:00:00');
    var wk = addDays(td, -((d.getDay() + 6) % 7));            // วันจันทร์ของสัปดาห์นี้
    var have = {};
    db.notifications.forEach(function (x) { if (x.dedupe && x.userId === me0) have[x.dedupe] = true; });
    db.goals.forEach(function (g) {
      if (g.closed) return;
      if (stampHist(g)) changed = true;
      if (g.owner !== me0 || !g.remind) return;
      var last = g.updates.length ? String(g.updates[g.updates.length - 1].at).slice(0, 10) : String(g.at || '').slice(0, 10);
      if (last && last > addDays(td, -7)) return;
      var key = 'goal:' + g.id + ':' + wk;
      if (have[key]) return;
      have[key] = true;
      db.notifications.push({ id: uid('n'), userId: me0, taskId: null, projectId: null, route: 'goal:' + g.id,
        text: fill('ถึงเวลาอัปเดตสถานะเป้าหมาย “{t}”', { t: g.name }), key: 'ถึงเวลาอัปเดตสถานะเป้าหมาย “{t}”', params: { t: g.name },
        kind: 'status', actorName: null, actorId: null, bookmarked: false, dedupe: key,
        createdAt: new Date().toISOString(), read: false, archived: false });
      n++; changed = true;
    });
    if (changed) { dropIndex(); persist(); listeners.forEach(function (fn) { fn(); }); }
    return n;
  }

  db = hydrate();

  global.Store = {
    PRIORITIES: PRIORITIES, TASK_TYPES: TASK_TYPES,
    APPROVAL_STATES: APPROVAL_STATES, PROJECT_STATES: PROJECT_STATES,
    FIELD_TYPES: FIELD_TYPES, OPTION_COLORS: OPTION_COLORS,
    RECUR_FREQ: RECUR_FREQ, DEP_TYPES: DEP_TYPES,
    PALETTE: PALETTE,
    DUE_FILTERS: DUE_FILTERS, SORTS: SORTS, GROUPS: GROUPS,
    GANTT_ZOOMS: GANTT_ZOOMS, COLOR_BYS: COLOR_BYS, GANTT_COLS: GANTT_COLS,
    PROJECT_VIEWS: PROJECT_VIEWS, projectViews: projectViews,
    toggleProjectView: toggleProjectView,
    WORK_DAYS: WORK_DAYS, DEP_SHIFT: DEP_SHIFT,
    projectCsv: projectCsv, importTasksCsv: importTasksCsv,
    isWorkday: isWorkday, nextWorkday: nextWorkday,

    get db() { return db; },
    storageKind: storage.kind,
    setRemoteSave: setRemoteSave, replaceDb: replaceDb, snapshotJSON: snapshotJSON,
    wipeLocal: wipeLocal,
    onChange: onChange, commit: commit,
    snapshot: snapshot, undo: undo, canUndo: canUndo, undoLabel: undoLabel,
    saveError: saveError_,

    uid: uid, today: today, addDays: addDays, addMonths: addMonths,
    iso: iso, clone: clone, daysBetween: daysBetween,

    user: user, me: me, project: project, task: task, section: section,
    activeProjects: activeProjects,
    tasksInProject: tasksInProject, tasksInSection: tasksInSection,
    subtasks: subtasks, projectsOfTask: projectsOfTask,
    storiesOfTask: storiesOfTask, fieldValue: fieldValue,
    blockers: blockers, isBlocked: isBlocked, blocking: blocking,
    myTasks: myTasks, search: search, allTags: allTags,
    canSeeTask: canSeeTask, visibleTasks: visibleTasks, isTaskParticipant: isTaskParticipant,
    assignedByMe: assignedByMe, myCompleted: myCompleted,
    dueSoonCount: dueSoonCount, homeStats: homeStats,
    overdueCount: overdueCount, needsWatch: needsWatch, statusAt: statusAt,          // Sprint 1C
    inbox: inbox, unreadCount: unreadCount,
    defaultView: defaultView, fillView: fillView,
    viewGroups: viewGroups, matchesFilter: matchesFilter,
    taskDuration: taskDuration, autoSchedule: autoSchedule,
    setBaseline: setBaseline, clearBaseline: clearBaseline, baselineOf: baselineOf,
    sortItems: sortItems, projectStats: projectStats,

    quickAdd: quickAdd, searchDocs: searchDocs, createTask: createTask, createTasks: createTasks, updateTask: updateTask, deleteTask: deleteTask,
    deleteTasks: deleteTasks, duplicateTask: duplicateTask, moveTask: moveTask,
    DUP_KEYS: DUP_KEYS, assignCopies: assignCopies, mergeDuplicate: mergeDuplicate,
    createFollowUp: createFollowUp, setParent: setParent, promoteSubtask: promoteSubtask,
    fitParentDates: fitParentDates, subtasksOutside: subtasksOutside,
    nextOccurrence: nextOccurrence, canApprove: canApprove, firstRecurDate: firstRecurDate,
    /* Sprint 1B — สิทธิ์สร้างงาน การอนุมัติ และการเห็นงานของคนนอกโปรเจกต์ปิด */
    canCreateTask: canCreateTask, canArrangeIn: canArrangeIn, onDeny: onDeny,
    approvalDecided: approvalDecided, canResubmit: canResubmit, resubmitApproval: resubmitApproval,
    revealOutsiders: revealOutsiders, revealTo: revealTo, canAddMembers: canAddMembers,
    outsidersOf: outsidersOf,                                   // งานที่ยังไม่เกิด — ดูจากโปรเจกต์ปลายทาง
    joinOutsiders: joinOutsiders, handoverOutsiders: handoverOutsiders,   // เอางานเดิมเข้าโปรเจกต์ปิด / โอนงาน
    mentionedIn: function (text) { return parseMentions(String(text || '')); },
    TRASH_DAYS: TRASH_DAYS, trashItems: trashItems, trashExpires: trashExpires,
    restoreTrash: restoreTrash, purgeTrash: purgeTrash,
    checkDueReminders: checkDueReminders,
    NUMBER_FORMATS: NUMBER_FORMATS, CURRENCIES: CURRENCIES,
    formatNumber: formatNumber, setFieldFormat: setFieldFormat,
    addTaskToProject: addTaskToProject, removeTaskFromProject: removeTaskFromProject,
    addDependency: addDependency, removeDependency: removeDependency,
    setDependencyType: setDependencyType,
    toggleFollower: toggleFollower, toggleLike: toggleLike,
    addAttachment: addAttachment, removeAttachment: removeAttachment,
    addComment: addComment, setFieldValue: setFieldValue,
    story: story, repliesOf: repliesOf, editComment: editComment,
    deleteComment: deleteComment, togglePinComment: togglePinComment,
    textRefs: textRefs, plainText: plainText,
    bulkUpdate: bulkUpdate, bulkMove: bulkMove,

    markRead: markRead, markAllRead: markAllRead,
    archiveNotification: archiveNotification, archiveAll: archiveAll,

    /* 2a — งานส่วนตัว งานของฉัน กล่องแจ้งเตือน หน้าแรก */
    rootOf: rootOf, isPrivate: isPrivate,
    MT_RECENT: MT_RECENT, MT_GROUPS: MT_GROUPS, MT_SORTS: MT_SORTS, NOTEPAD_MAX: NOTEPAD_MAX,
    personalOf: personalOf, mtTasks: mtTasks, mtGroups: mtGroups, mtSectionOf: mtSectionOf,
    mtIsNew: mtIsNew, mtMarkSeen: mtMarkSeen, mtSetView: mtSetView, mtSection: mtSection,
    mtAddSection: mtAddSection, mtRenameSection: mtRenameSection,
    mtMoveSection: mtMoveSection, mtDeleteSection: mtDeleteSection,
    mtMove: mtMove, mtCreateTasks: mtCreateTasks,
    filesOfTasks: filesOfTasks, moveTaskDates: moveTaskDates,
    HOME_WIDGETS: HOME_WIDGETS, homeLayout: homeLayout, setHomeLayout: setHomeLayout,
    setNotepad: setNotepad, recentProjects: recentProjects, statusFeed: statusFeed,
    completedStats: completedStats,
    inboxList: inboxList, inboxPeople: inboxPeople, notification: notification,
    setNotifRead: setNotifRead, toggleBookmark: toggleBookmark,
    unarchiveNotification: unarchiveNotification, setInboxPref: setInboxPref,
    dndOf: dndOf, isDnd: isDnd, setDnd: setDnd,
    PROJ_NOTIFY: PROJ_NOTIFY, projNotifyOf: projNotifyOf, setProjNotify: setProjNotify,

    portfolios: portfolios, portfolio: portfolio, portfolioProjects: portfolioProjects,
    portfolioHidden: portfolioHidden, portfoliosOfProject: portfoliosOfProject,
    createPortfolio: createPortfolio, updatePortfolio: updatePortfolio,
    deletePortfolio: deletePortfolio, addToPortfolio: addToPortfolio,
    removeFromPortfolio: removeFromPortfolio, portfolioStats: portfolioStats,
    setPortfolioStatus: setPortfolioStatus, projectDates: projectDates,

    createProject: createProject, updateProject: updateProject,
    deleteProject: deleteProject, duplicateProject: duplicateProject, projectFirstDate: projectFirstDate,
    setProjectStatus: setProjectStatus, statusLog: statusLog, archiveProject: archiveProject,
    addSection: addSection, renameSection: renameSection,
    deleteSection: deleteSection, moveSection: moveSection,
    addField: addField, renameField: renameField, deleteField: deleteField,
    colWidth: colWidth, setColWidth: setColWidth, resetColWidths: resetColWidths,
    saveView: saveView, deleteSavedView: deleteSavedView,
    /* 2b — มุมมองของโปรเจกต์ */
    SV_MAX: SV_MAX, SV_KINDS: SV_KINDS, savedView: savedView, updateSavedView: updateSavedView,
    renameSavedView: renameSavedView, moveSavedView: moveSavedView, setDefaultTab: setDefaultTab,
    ME: ME, FILTER_OPS: FILTER_OPS, filterFields: filterFields, filterField: filterField,
    filterChoices: filterChoices, filterCount: filterCount, matchCond: matchCond, taskValue: taskValue,
    lastModified: lastModified, setSorts: setSorts, viewDiff: viewDiff, groupItems: groupItems,
    viewItems: viewItems, LIST_COLS: LIST_COLS, listColumns: listColumns, FOOT_FNS: FOOT_FNS,
    footValue: footValue, CARD_PARTS: CARD_PARTS, cardShows: cardShows, dropToGroups: dropToGroups,
    colorChoices: colorChoices, projView: projView, setProjView: setProjView,
    calPrefs: calPrefs, setCalPrefs: setCalPrefs, SEC_DUP_KEYS: SEC_DUP_KEYS,
    duplicateSection: duplicateSection, isImageAtt: isImageAtt, setCover: setCover, coverOf: coverOf,
    createTaskNear: createTaskNear,
    saveTaskTemplate: saveTaskTemplate, applyTaskTemplate: applyTaskTemplate,
    deleteTaskTemplate: deleteTaskTemplate,

    addUser: addUser, removeUser: removeUser, setCurrentUser: setCurrentUser,
    adoptIdentity: adoptIdentity, ROLES: ROLES, ROLE_CAPS: ROLE_CAPS,
    PROJECT_ACCESS: PROJECT_ACCESS, projectMembers: projectMembers, projectAccess: projectAccess,
    visibleProjects: visibleProjects, canInProject: canInProject,
    setProjectVisibility: setProjectVisibility, setProjectLocked: setProjectLocked,
    setProjectMember: setProjectMember, removeProjectMember: removeProjectMember,
    isAdmin: isAdmin, setRole: setRole, can: can, role: role, adminCount: adminCount,
    openTasksOf: openTasksOf, handoverTasks: handoverTasks,
    projectRolesOf: projectRolesOf, handoverProjects: handoverProjects, emailProblem: emailProblem,   // Sprint 1B
    NOTIFY_KINDS: NOTIFY_KINDS, pref: pref, setPref: setPref, setNotifyPref: setNotifyPref,
    updateProfile: updateProfile, setAway: setAway, isAway: isAway,
    setPhoto: setPhoto, removePhoto: removePhoto,
    isStarred: isStarred, toggleStar: toggleStar, starredProjects: starredProjects,
    filesOfProject: filesOfProject,
    projectMessages: projectMessages, addProjectMessage: addProjectMessage,
    deleteProjectMessage: deleteProjectMessage,
    REACTIONS: REACTIONS, toggleReaction: toggleReaction,
    photoBytes: photoBytes, photoTotalBytes: photoTotalBytes, attachTotals: attachTotals,
    PHOTO_PX: PHOTO_PX, PHOTO_MAX_BYTES: PHOTO_MAX_BYTES,
    frequentCollaborators: frequentCollaborators,
    setActive: setActive, isActive: isActive,
    audit: audit, auditLog: auditLog, auditGroups: auditGroups, auditCsv: auditCsv,
    signedInUsers: signedInUsers, recentActivity: recentActivity,
    setSetting: setSetting,

    /* 2c — ค้นหา ฟิลด์ แท็ก นำเข้า/ส่งออก และงานดูแลโปรเจกต์ */
    batch: batch, searchAdv: searchAdv, parseQuery: parseQuery, hasOperators: hasOperators,
    SEARCH_BUILTIN: SEARCH_BUILTIN,
    savedSearches: savedSearches, savedSearch: savedSearch, saveSearch: saveSearch,
    updateSavedSearch: updateSavedSearch, deleteSavedSearch: deleteSavedSearch,
    fieldDef: fieldDef, fieldText: fieldText, taskCodes: taskCodes, findByCode: findByCode,
    fieldLib: fieldLib, libField: libField, libUsage: libUsage, updateFieldDef: updateFieldDef,
    createLibField: createLibField, addLibFieldToProject: addLibFieldToProject,
    promoteFieldToLib: promoteFieldToLib, deleteLibField: deleteLibField,
    tagTasks: tagTasks, renameTag: renameTag, deleteTag: deleteTag,
    CSV_TARGETS: CSV_TARGETS, CSV_NEW_TYPES: CSV_NEW_TYPES, csvPreview: csvPreview,
    importTasksCsvMapped: importTasksCsvMapped, csvPeople: csvPeople,
    projectJson: projectJson, myTasksIcs: myTasksIcs, projectIcs: projectIcs,
    projectRoles: projectRoles, setProjectRole: setProjectRole,
    requestAccess: requestAccess, pendingRequest: pendingRequest, accessRequestOf: accessRequestOf,
    accessRequestFor: accessRequestFor,
    canAnswerAccess: canAnswerAccess, answerAccess: answerAccess, accessOwner: accessOwner,
    convertToProject: convertToProject,
    slipOverdue: slipOverdue, bulkAddToProject: bulkAddToProject, bulkMoveSection: bulkMoveSection, bulkSetField: bulkSetField,
    bulkAddFollowers: bulkAddFollowers, bulkAddTag: bulkAddTag, bulkDependOn: bulkDependOn,
    bulkMerge: bulkMerge,

    /* 3a — อัตโนมัติ */
    AUTO_TRIGGERS: AUTO_TRIGGERS, AUTO_ACTIONS: AUTO_ACTIONS, AUTO_VARS: AUTO_VARS,
    AUTO_MAX_ACTS: AUTO_MAX_ACTS, AUTO_MAX_PATHS: AUTO_MAX_PATHS, AUTO_MAX_CONDS: AUTO_MAX_CONDS,
    AUTO_MANUAL_MAX: AUTO_MANUAL_MAX, AUTO_MAX_DEPTH: AUTO_MAX_DEPTH,
    automations: automations, automation: automation, canEditAutos: canEditAutos,
    saveAutomation: saveAutomation, setAutomationOn: setAutomationOn,
    duplicateAutomation: duplicateAutomation, deleteAutomation: deleteAutomation,
    manualAutomationsFor: manualAutomationsFor, runAutomation: runAutomation,
    autoRuns: autoRuns, autoForSection: autoForSection, autoTick: autoTick,
    autoFire: autoFire, autoRegister: autoRegister, shiftDate: shiftDate, quietBatch: quietBatch,

    /* 3b — ชนิดงาน ฟอร์ม เทมเพลต รายงานสถานะ */
    TYPE_MAX: TYPE_MAX, STATUS_MAX: STATUS_MAX, isBuiltinType: isBuiltinType, typeDef: typeDef, statusDef: statusDef,
    typeOf: typeOf, projectTypes: projectTypes, typeChoices: typeChoices, typeChoicesFor: typeChoicesFor,
    typeName: typeName, statusChoices: statusChoices, firstStatus: firstStatus, canEditTypes: canEditTypes,
    saveTaskType: saveTaskType, deleteTaskType: deleteTaskType, setDefaultType: setDefaultType,
    setTaskType: setTaskType, setTaskStatus: setTaskStatus,
    FORM_MAX: FORM_MAX, FORM_KINDS: FORM_KINDS, FORM_DEPTH: FORM_DEPTH, FORM_FILES_MAX: FORM_FILES_MAX,
    FORM_FILE_BYTES: FORM_FILE_BYTES, formKind: formKind, formById: formById, formVisible: formVisible,
    formDepth: formDepth, formTargets: formTargets, canEditForms: canEditForms, saveForm: saveForm,
    setFormOn: setFormOn, duplicateForm: duplicateForm, deleteForm: deleteForm, submitForm: submitForm,
    formsForHome: formsForHome, normalizeForm: normalizeForm,
    taskTemplatesFor: taskTemplatesFor, findTaskTemplate: findTaskTemplate, captureTaskTemplate: captureTaskTemplate,
    updateTaskTemplate: updateTaskTemplate, normTT: normTT,
    projectTemplates: projectTemplates, projectTemplate: projectTemplate, ptCanUse: ptCanUse, ptCanEdit: ptCanEdit,
    canSaveTemplate: canSaveTemplate, saveProjectTemplate: saveProjectTemplate,
    updateProjectTemplate: updateProjectTemplate, setTemplateAccess: setTemplateAccess,
    deleteProjectTemplate: deleteProjectTemplate, useProjectTemplate: useProjectTemplate,
    workdaysBetween: workdaysBetween,
    STATUS_BLOCKS: STATUS_BLOCKS, STATUS_HL: STATUS_HL, STATUS_PERIODS: STATUS_PERIODS,
    statusLayoutOf: statusLayoutOf, statusHighlights: statusHighlights, postStatusUpdate: postStatusUpdate,
    statusTemplates: statusTemplates, saveStatusTemplate: saveStatusTemplate,
    deleteStatusTemplate: deleteStatusTemplate, setStatusRemind: setStatusRemind,
    checkStatusReminders: checkStatusReminders,

    exportJSON: exportJSON, importJSON: importJSON, reset: reset
  };

  /* 3c — ภาพรวม แดชบอร์ด ประกาศ เส้นทางวิกฤต */
  var X3C = {
    RES_MAX: RES_MAX, FILE_BYTES: FILE_BYTES, DASH_MAX: DASH_MAX, MSG_ATT_MAX: MSG_ATT_MAX,
    canEditOverview: canEditOverview, addResource: addResource, removeResource: removeResource,
    moveResource: moveResource, setBrief: setBrief, projectMilestones: projectMilestones,
    addMilestone: addMilestone, setMsShow: setMsShow,
    DASH_KINDS: DASH_KINDS, DASH_X: DASH_X, DASH_UNITS: DASH_UNITS, DASH_DATES: DASH_DATES,
    normalizeWidget: normalizeWidget, dashWidgets: dashWidgets, canEditDash: canEditDash,
    saveWidget: saveWidget, deleteWidget: deleteWidget, duplicateWidget: duplicateWidget,
    moveWidget: moveWidget, setWidgetFull: setWidgetFull, resetDash: resetDash,
    dashFieldChoices: dashFieldChoices, fieldKind: fieldKind, dashItems: dashItems,
    chartData: chartData, dashClickTasks: dashClickTasks, catDefs: catDefs,
    findMessage: findMessage, addMessageReply: addMessageReply, deleteMessageReply: deleteMessageReply,
    toggleMessageFollow: toggleMessageFollow,
    criticalPath: criticalPath, bulkChain: bulkChain, previewDates: previewDates, applyDates: applyDates
  };
  Object.keys(X3C).forEach(function (k) { global.Store[k] = X3C[k]; });
  /* 3c ส่วนที่ 2 — หน้าเอกสาร เวลา สูตร อ้างอิง ตรวจรูป */
  var X3C2 = {
    PAGE_MAX: PAGE_MAX, PAGE_VERSIONS: PAGE_VERSIONS, PAGE_IMG_BYTES: PAGE_IMG_BYTES,
    pageLoc: pageLoc, canSeePage: canSeePage, canEditPage: canEditPage, canCommentPage: canCommentPage,
    projectPages: projectPages, myPages: myPages, notepadPage: notepadPage, ensureNotepadPage: ensureNotepadPage,
    createPage: createPage, savePage: savePage, restorePageVersion: restorePageVersion, deletePage: deletePage,
    setPagePrivate: setPagePrivate, addPageImage: addPageImage, pageImgMap: pageImgMap,
    addPageComment: addPageComment, replyPageComment: replyPageComment, resolvePageComment: resolvePageComment,
    deletePageComment: deletePageComment, taskFromPage: taskFromPage,
    pageTaskLines: pageTaskLines, tasksFromPage: tasksFromPage,          // Sprint 1C
    parseDuration: parseDuration, fmtMinutes: fmtMinutes, timeRollup: timeRollup, setEstimate: setEstimate,
    addTimeEntry: addTimeEntry, deleteTimeEntry: deleteTimeEntry, runningTimer: runningTimer,
    startTimer: startTimer, stopTimer: stopTimer, discardTimer: discardTimer, projectTimeCsv: projectTimeCsv,
    FORMULA_BUILTIN: FORMULA_BUILTIN, compileFormula: compileFormula, formulaText: formulaText,
    REF_KINDS: REF_KINDS, refItem: refItem, refNames: refNames, refSearch: refSearch, toggleRef: toggleRef,
    addProofPin: addProofPin, removeProofPin: removeProofPin, DASH_Y_EXTRA: DASH_Y_EXTRA
  };
  Object.keys(X3C2).forEach(function (k) { global.Store[k] = X3C2[k]; });
  /* 4a ส่วนที่ 1 — ทีม พอร์ตโฟลิโอแบบซ้อน ฟิลด์ rollup มุมมอง ประกาศของพอร์ตโฟลิโอ/ทีม */
  var X4A = {
    TEAM_PRIVACY: TEAM_PRIVACY, TEAM_RES_MAX: TEAM_RES_MAX, TEAM_PIN_MAX: TEAM_PIN_MAX,
    teams: teams, team: team, teamRole: teamRole, isTeamMember: isTeamMember, canSeeTeam: canSeeTeam,
    canManageTeam: canManageTeam, visibleTeams: visibleTeams, myTeams: myTeams, teamsOfUser: teamsOfUser,
    createTeam: createTeam, updateTeam: updateTeam, deleteTeam: deleteTeam, addTeamMember: addTeamMember,
    setTeamRole: setTeamRole, removeTeamMember: removeTeamMember, joinTeam: joinTeam,
    answerTeamRequest: answerTeamRequest, toggleTeamPin: toggleTeamPin, addTeamResource: addTeamResource,
    removeTeamResource: removeTeamResource, shareProjectWithTeam: shareProjectWithTeam,
    teamsOfProject: teamsOfProject, teamProjects: teamProjects, teamTasks: teamTasks,
    msgHost: msgHost, hostCan: hostCan, routeLabel: routeLabel, matchValue: matchValue,
    PF_FIELD_TYPES: PF_FIELD_TYPES, ROLLUP_FNS: ROLLUP_FNS, PF_FIELD_MAX: PF_FIELD_MAX, PF_GROUPS: PF_GROUPS,
    pfDescendants: pfDescendants, canNestPortfolio: canNestPortfolio, addPortfolioToPortfolio: addPortfolioToPortfolio,
    removePortfolioFromPortfolio: removePortfolioFromPortfolio, parentPortfolios: parentPortfolios,
    allProjectsUnder: allProjectsUnder, portfolioItems: portfolioItems, pfItemInfo: pfItemInfo,
    pfField: pfField, savePfField: savePfField, deletePfField: deletePfField, setPfValue: setPfValue,
    pfRollupSources: pfRollupSources, pfFieldValue: pfFieldValue,
    pfDefaultView: pfDefaultView, pfFillView: pfFillView, pfFilterFields: pfFilterFields, pfItemValue: pfItemValue,
    pfViewItems: pfViewItems, pfViewGroups: pfViewGroups, pfView: pfView, setPfView: setPfView,
    pfSavedView: pfSavedView, pfSaveView: pfSaveView, pfUpdateView: pfUpdateView, pfDeleteView: pfDeleteView,
    pfSetDefaultTab: pfSetDefaultTab, postPortfolioUpdate: postPortfolioUpdate
  };
  Object.keys(X4A).forEach(function (k) { global.Store[k] = X4A[k]; });
  /* 4a ส่วนที่ 2 — เป้าหมาย */
  var X4B = {
    GOAL_STATES: GOAL_STATES, GOAL_OUTCOMES: GOAL_OUTCOMES, GOAL_PERIODS: GOAL_PERIODS, GOAL_SRCS: GOAL_SRCS,
    fyStart: fyStart, fyOf: fyOf, periodRange: periodRange, periodLabel: periodLabel,
    goals: goals, goal: goal, canSeeGoal: canSeeGoal, canEditGoal: canEditGoal, visibleGoals: visibleGoals,
    subGoals: subGoals, goalAncestors: goalAncestors, goalDescendants: goalDescendants, goalProgress: goalProgress,
    goalValueText: goalValueText, createGoal: createGoal, updateGoal: updateGoal, setGoalValue: setGoalValue,
    deleteGoal: deleteGoal, postGoalUpdate: postGoalUpdate, closeGoal: closeGoal, reopenGoal: reopenGoal,
    addGoalComment: addGoalComment, deleteGoalComment: deleteGoalComment, toggleGoalRel: toggleGoalRel,
    setGoalField: setGoalField, saveGoalField: saveGoalField, deleteGoalField: deleteGoalField,
    setGoalSettings: setGoalSettings, goalsOfItem: goalsOfItem, myGoals: myGoals, goalsCsv: goalsCsv,
    checkGoalReminders: checkGoalReminders, taskDone: taskDone
  };
  Object.keys(X4B).forEach(function (k) { global.Store[k] = X4B[k]; });

  /* ======================================================================
   * 4b — ภาระงาน (workload) ช่วงไม่อยู่หลายช่วง ความจุ ไทม์ชีต รายงานรวม
   * ====================================================================== */

  /* ค่าคงที่ของ 4b อยู่บนสุดของไฟล์ (ใกล้ SCHEMA) เพราะ migrate() ถูกเรียกตอนโหลดก่อนถึงบรรทัดนี้ */
  function migrate4b(d) {
    d.users.forEach(function (u) {
      if (!Array.isArray(u.awayRanges)) {
        u.awayRanges = [];
        /* สถานะไม่อยู่แบบเดิมมีแค่ "ถึงวันไหน" — กลายเป็นช่วงที่ไม่มีวันเริ่ม (นับว่าเริ่มไปแล้ว) */
        if (u.away && u.away.until) u.awayRanges.push({ id: 'aw_' + String(u.id).slice(-8) + '_0', from: null, to: u.away.until, note: u.away.note || '' });
      }
      u.awayRanges = u.awayRanges.filter(function (r) { return r && r.id && ISO_RE.test(r.to || ''); });
      u.awayRanges.forEach(function (r) { if (r.from && !ISO_RE.test(r.from)) r.from = null; r.note = String(r.note || ''); });
      u.away = awayMirror(u);
    });
    d.timesheets = Array.isArray(d.timesheets) ? d.timesheets.filter(function (x) { return x && x.id && x.userId && ISO_RE.test(x.week || ''); }) : [];
    d.timesheets.forEach(function (x) {
      if (!TS_STATES.some(function (s) { return s.id === x.status; })) x.status = 'draft';
      x.hist = Array.isArray(x.hist) ? x.hist.slice(-30) : [];
    });
    d.reports = Array.isArray(d.reports) ? d.reports.filter(function (r) { return r && r.id; }) : [];
    d.reports.forEach(normalizeReport);
    d.settings = d.settings || {};
    if (!Array.isArray(d.settings.timeCats)) d.settings.timeCats = TIME_CATS_DEFAULT.slice();
    if (!Array.isArray(d.settings.tsReviewers)) d.settings.tsReviewers = [];
    d.projects.forEach(function (p) {
      p.embeds = Array.isArray(p.embeds) ? p.embeds.filter(function (e) { return e && e.id && e.url; }) : [];
    });
  }

  /* ---------- ช่วงไม่อยู่ (หลายช่วง) ----------
   * user.awayRanges = [{ id, from (null = เริ่มไปแล้ว), to, note }]
   * user.away ยังเก็บไว้เป็นสำเนาของช่วงที่ครอบวันนี้ ({ until, note }) ให้ข้อมูล/โค้ดเดิมอ่านได้ */
  function awayMirror(u, onDay) {
    var d = onDay || today();
    var r = (u.awayRanges || []).filter(function (x) { return (!x.from || x.from <= d) && x.to >= d; })[0];
    return r ? { until: r.to, note: r.note || '' } : null;
  }
  function awayRanges(userId) {
    var u = user(userId || db.currentUserId);
    return u && Array.isArray(u.awayRanges) ? u.awayRanges : [];
  }
  /** ช่วงที่ครอบวันนั้น (ไม่ระบุ = วันนี้) หรือ null */
  function awayOn(userId, date) {
    var d = date || today(), rs = awayRanges(userId);
    for (var i = 0; i < rs.length; i++) if ((!rs[i].from || rs[i].from <= d) && rs[i].to >= d) return rs[i];
    return null;
  }
  /** สำหรับป้าย "ไม่อยู่ถึง …" { until, note, from } หรือ null */
  function awayNow(userId) {
    var r = awayOn(userId);
    return r ? { until: r.to, note: r.note || '', from: r.from } : null;
  }
  function canEditPerson(userId) { return isActive() && !!user(userId) && (userId === db.currentUserId || isAdmin()); }
  function addAwayRange(userId, from, to, note) {
    var u = user(userId);
    if (!u || !canEditPerson(userId) || !ISO_RE.test(to || '') || (from && !ISO_RE.test(from))) return null;
    if (from && from > to) { var x = from; from = to; to = x; }
    snapshot('ตั้งช่วงไม่อยู่');
    var r = { id: uid('aw'), from: from || null, to: to, note: String(note || '').trim().slice(0, 140) };
    var td = today();
    /* ช่วงที่จบไปนานแล้วตัดทิ้งเมื่อเกินจำนวน เก็บที่ยังไม่จบไว้ก่อนเสมอ */
    u.awayRanges = (u.awayRanges || []).concat([r]).sort(function (a, b) { return (a.from || '') < (b.from || '') ? -1 : 1; });
    while (u.awayRanges.length > AWAY_MAX) {
      var old = u.awayRanges.filter(function (y) { return y.to < td; })[0];
      if (!old) break;
      u.awayRanges = u.awayRanges.filter(function (y) { return y !== old; });
    }
    u.away = awayMirror(u);
    audit('user.away', userId === db.currentUserId ? null : u.name, (r.from || '…') + ' – ' + r.to);
    commit();
    return r;
  }
  function removeAwayRange(userId, id) {
    var u = user(userId);
    if (!u || !canEditPerson(userId) || !(u.awayRanges || []).some(function (r) { return r.id === id; })) return false;
    snapshot('ลบช่วงไม่อยู่');
    u.awayRanges = u.awayRanges.filter(function (r) { return r.id !== id; });
    u.away = awayMirror(u);
    audit('user.back', userId === db.currentUserId ? null : u.name, null);
    commit();
    return true;
  }
  /** วันในช่วง [from, to] ที่ไม่อยู่ { iso: true } */
  function awayDays(userId, from, to) {
    var out = {};
    awayRanges(userId).forEach(function (r) {
      var a = r.from && r.from > from ? r.from : from, b = r.to < to ? r.to : to;
      for (var d = a, g = 0; d <= b && g < 800; d = addDays(d, 1), g++) out[d] = true;
    });
    return out;
  }

  /* ---------- ความจุงานต่อวัน ----------
   * user.prefs.capacity = { count, h, pt, pct } — จำนวนงาน / ชั่วโมง / พอยต์ / เปอร์เซ็นต์ ต่อวันทำงาน
   * เจ้าตัวกับผู้ดูแลระบบแก้ได้ */
  function capacityOf(userId) {
    var u = user(userId), c = (u && u.prefs && u.prefs.capacity) || {};
    var out = {};
    Object.keys(CAP_DEFAULT).forEach(function (k) {
      var v = +c[k];
      out[k] = isFinite(v) && v >= 0 && c[k] !== null && c[k] !== '' && c[k] !== undefined ? v : CAP_DEFAULT[k];
    });
    return out;
  }
  function setCapacity(userId, patch) {
    var u = user(userId);
    if (!u || !canEditPerson(userId) || !patch) return false;
    var cur = capacityOf(userId), next = {};
    Object.keys(CAP_DEFAULT).forEach(function (k) {
      var v = k in patch ? +patch[k] : cur[k];
      next[k] = isFinite(v) ? Math.max(0, Math.min(1000, Math.round(v * 100) / 100)) : cur[k];
    });
    if (JSON.stringify(next) === JSON.stringify(cur)) return false;
    snapshot('ตั้งความจุงาน');
    u.prefs = u.prefs || {};
    u.prefs.capacity = next;
    audit('user.capacity', u.name, '{h} ชม./วัน · {c} งาน/วัน', { h: next.h, c: next.count });
    commit();
    return true;
  }

  /* ---------- ภาระงาน ----------
   * scope = { kind: 'project', id } | { kind: 'portfolio', id } | { kind: 'all', team: '' | teamId }
   * cfg   = { measure: 'count' | 'effort', src: 'estimate' | 'field:<id>', unit: 'h' | 'pt' | 'pct', zoom: 'day' | 'week' | 'month', anchor }
   * งานที่ยังไม่เสร็จ มีผู้รับผิดชอบ และมีวัน — นับต่อวัน แล้วรวมเป็นช่องตามระดับซูม
   * แบบนับงาน: งานหนึ่งชิ้นนับ 1 ทุกวันทำงานในช่วงของมัน
   * แบบแรงงาน: ชั่วโมง/พอยต์กระจายเท่า ๆ กันบนวันทำงานในช่วง ส่วน % คือสัดส่วนต่อวัน (ไม่กระจาย) */
  var WL_ZOOMS = ['day', 'week', 'month'];
  function wlDefaultCfg() { return { measure: 'count', src: 'estimate', unit: 'h', zoom: 'week', anchor: null }; }
  function wlScopeKey(scope) { return scope.kind === 'all' ? 'all' : scope.kind + ':' + scope.id; }
  /** ตั้งค่าที่จำไว้ต่อคนต่อขอบเขต (เงียบ ๆ ไม่มีจุดย้อนกลับ) */
  function wlCfg(scope) {
    var st = personalOf(), c = (st.wl && st.wl[wlScopeKey(scope)]) || {};
    var out = wlDefaultCfg();
    if (c.measure === 'effort') out.measure = 'effort';
    if (typeof c.src === 'string' && (c.src === 'estimate' || c.src.indexOf('field:') === 0)) out.src = c.src;
    if (['h', 'pt', 'pct'].indexOf(c.unit) >= 0) out.unit = c.unit;
    if (WL_ZOOMS.indexOf(c.zoom) >= 0) out.zoom = c.zoom;
    if (typeof c.team === 'string') out.team = c.team;
    return out;
  }
  function setWlCfg(scope, patch) {
    if (!me()) return false;
    var st = personalOf();
    if (!isObj(st.wl)) st.wl = {};
    var k = wlScopeKey(scope), cur = st.wl[k] || {};
    Object.keys(patch || {}).forEach(function (x) { if (x !== 'anchor') cur[x] = patch[x]; });
    st.wl[k] = cur;
    persist();
    return true;
  }
  function wlProjects(scope) {
    if (scope.kind === 'project') return project(scope.id) && projectAccess(scope.id) ? [project(scope.id)] : [];
    if (scope.kind === 'portfolio') return portfolio(scope.id) ? allProjectsUnder(scope.id) : [];
    if (scope.kind === 'team' || (scope.kind === 'all' && scope.team)) return teamProjects(scope.team || scope.id);
    return visibleProjects();
  }
  function taskWorkMode(t) {
    var root = rootOf(t), ms = root ? (index().memByTask[root.id] || []) : [];
    var p = ms.length ? project(ms[0].projectId) : null;
    var m = p && p.workDays;
    return !m || m === 'all' ? 'mon-fri' : m;
  }
  /** วันทำงานในช่วงของงาน (ไม่มีวันทำงานเลย = ใช้ทุกวันในช่วง) */
  function taskDays(t) {
    var s = t.startOn || t.dueOn, e = t.dueOn || t.startOn;
    if (!s) return [];
    if (s > e) { var x = s; s = e; e = x; }
    if (daysBetween(s, e) > 400) s = addDays(e, -400);
    var mode = taskWorkMode(t), days = [], all = [];
    for (var d = s; d <= e; d = addDays(d, 1)) { all.push(d); if (isWorkday(d, mode)) days.push(d); }
    return days.length ? days : all;
  }
  /** ค่าแรงงานของงานหนึ่งชิ้น — null = ไม่มีค่า (ไม่นับในแบบแรงงาน) */
  function effortOf(t, cfg) {
    if (cfg.measure !== 'effort') return 1;
    if (cfg.src === 'estimate') return t.estimate == null ? null : t.estimate / 60;
    var fid = String(cfg.src || '').slice(6);
    var v = fid ? fieldValue(t.id, fid) : null;
    return v === null || v === undefined || v === '' || isNaN(+v) ? null : +v;
  }
  /** ฟิลด์ตัวเลขที่ใช้เป็นแรงงานได้ (ของโปรเจกต์ในขอบเขต + คลังฟิลด์) */
  function wlEffortFields(scope) {
    var seen = {}, out = [];
    var add = function (f, p) {
      if (!f || seen[f.id] || fieldKind(f) !== 'number') return;
      seen[f.id] = true;
      var lib = (db.fieldLib || []).some(function (x) { return x.id === f.id; });
      out.push({ id: f.id, name: f.name + (!lib && p && scope.kind !== 'project' ? ' (' + p.name + ')' : ''), lib: lib });
    };
    (db.fieldLib || []).forEach(function (f) { add(f, null); });
    /* ภาระงานรวมทั้งองค์กรใช้ได้เฉพาะคลังฟิลด์ — ฟิลด์ของโปรเจกต์เดียวมีค่าแค่ในโปรเจกต์นั้น */
    if (scope.kind !== 'all' || scope.team) {
      wlProjects(scope).forEach(function (p) { (p.fields || []).forEach(function (f) { add(fieldDef(f.id) || f, p); }); });
    }
    return out;
  }
  function wlCols(zoom, anchor) {
    var a = anchor && ISO_RE.test(anchor) ? anchor : today(), cols = [], i, s;
    var mon = function (d) { return addDays(d, -((new Date(d + 'T00:00:00').getDay() + 6) % 7)); };
    if (zoom === 'day') {
      s = mon(a);
      for (i = 0; i < 21; i++) { var dd = addDays(s, i); cols.push({ key: dd, from: dd, to: dd }); }
    } else if (zoom === 'month') {
      s = a.slice(0, 8) + '01';
      for (i = 0; i < 6; i++) { var m0 = addMonths(s, i); cols.push({ key: m0, from: m0, to: addDays(addMonths(m0, 1), -1) }); }
    } else {
      s = mon(a);
      for (i = 0; i < 12; i++) { var w0 = addDays(s, i * 7); cols.push({ key: w0, from: w0, to: addDays(w0, 6) }); }
    }
    return cols;
  }
  function wlStep(zoom, anchor, dir) {
    var a = anchor && ISO_RE.test(anchor) ? anchor : today();
    if (!dir) return today();
    if (zoom === 'day') return addDays(a, 7 * dir);
    if (zoom === 'month') return addMonths(a, 3 * dir);
    return addDays(a, 28 * dir);
  }
  /** งานในขอบเขต (ยังไม่เสร็จ มีผู้รับผิดชอบ มีวัน เห็นได้) รวมงานย่อยทุกชั้น ไม่ซ้ำ */
  function wlTasks(scope) {
    var out = [], seen = {};
    var walk = function (t, g) {
      if (seen[t.id]) return;
      seen[t.id] = true;
      if (!t.completed && t.assigneeId && (t.dueOn || t.startOn) && canSeeTask(t.id)) out.push(t);
      if (g < 6) subtasks(t.id).forEach(function (s) { walk(s, g + 1); });
    };
    if (scope.kind === 'all' && !scope.team) {
      db.tasks.forEach(function (t) {
        if (seen[t.id]) return;
        seen[t.id] = true;
        if (!t.completed && t.assigneeId && (t.dueOn || t.startOn) && canSeeTask(t.id)) out.push(t);
      });
      return out;
    }
    wlProjects(scope).forEach(function (p) { tasksInProject(p.id).forEach(function (x) { walk(x.task, 0); }); });
    return out;
  }
  /** คนที่แสดงเป็นแถว — ผู้รับผิดชอบงานในขอบเขต + สมาชิก (โปรเจกต์ที่มีรายชื่อ / ทีม) */
  function wlPeople(scope, tasks) {
    var seen = {}, out = [];
    var add = function (u) { if (u && !seen[u] && user(u) && user(u).active !== false) { seen[u] = true; out.push(u); } };
    if (scope.kind === 'project') projectMembers(scope.id).forEach(function (m) { add(m.userId); });
    var tid = scope.kind === 'all' ? scope.team : null;
    if (tid && team(tid)) team(tid).members.forEach(function (m) { add(m.u); });
    tasks.forEach(function (t) { if (!tid || isTeamMember(tid, t.assigneeId)) add(t.assigneeId); });
    if (scope.kind === 'all' && !tid) add(db.currentUserId);
    return out.sort(function (a, b) {
      if (a === db.currentUserId) return -1;
      if (b === db.currentUserId) return 1;
      return user(a).name.localeCompare(user(b).name);
    });
  }
  function workload(scope, cfg) {
    cfg = cfg || wlDefaultCfg();
    var cols = wlCols(cfg.zoom, cfg.anchor);
    var from = cols[0].from, to = cols[cols.length - 1].to;
    var tasks = wlTasks(scope);
    var people = wlPeople(scope, tasks);
    var capKey = cfg.measure === 'effort' ? cfg.unit : 'count';
    var noEffort = 0;
    /* Sprint 1C — งานเลยกำหนดที่ยังไม่เสร็จเดิมหลุดจากตารางเพราะวันของมันอยู่ก่อนช่วงที่แสดง
     * คนที่ค้าง 6 งานจึงดูว่างอยู่ (5/15) และไม่มีใครเกินความจุ ทั้งที่งานค้างยังต้องทำอยู่ดี
     * นับงานค้างไว้ที่ "วันนี้" (เมื่อวันนี้อยู่ในช่วงที่แสดง) และนับจำนวนค้างของแต่ละคนไว้ขึ้นป้ายเตือน */
    var td = today(), nowIn = td >= from && td <= to;
    var rows = people.map(function (u) {
      var cap = capacityOf(u)[capKey], away = awayDays(u, from, to);
      var daily = {}, list = [], warn = [], lateN = 0;
      tasks.forEach(function (t) {
        if (t.assigneeId !== u) return;
        var days = taskDays(t);
        var late = !!(t.dueOn && t.dueOn < td);
        if (late) { lateN++; if (nowIn) days = [td]; }
        if (!days.length || days[days.length - 1] < from || days[0] > to) return;
        var e = effortOf(t, cfg);
        if (late && nowIn) {
          if (e === null) { noEffort++; list.push({ t: t, s: td, e: td, v: null, late: true }); return; }
          daily[td] = (daily[td] || 0) + e;
          list.push({ t: t, s: td, e: td, v: e, late: true });
          if (away[td]) warn.push(t.id);
          return;
        }
        if (e === null) { noEffort++; list.push({ t: t, s: t.startOn || t.dueOn, e: t.dueOn || t.startOn, v: null }); return; }
        var per = cfg.measure === 'effort' && cfg.unit !== 'pct' ? e / days.length : e;
        var hitAway = false;
        days.forEach(function (d) {
          if (d < from || d > to) return;
          daily[d] = (daily[d] || 0) + per;
          if (away[d]) hitAway = true;
        });
        var s0 = t.startOn || t.dueOn, e0 = t.dueOn || t.startOn;
        list.push({ t: t, s: s0 < e0 ? s0 : e0, e: s0 < e0 ? e0 : s0, v: e });
        if (hitAway) warn.push(t.id);
      });
      var cells = cols.map(function (c) {
        var v = 0, capC = 0, awayN = 0, n = 0;
        for (var d = c.from; d <= c.to; d = addDays(d, 1)) {
          n++;
          v += daily[d] || 0;
          var wd = isWorkday(d, 'mon-fri');
          if (away[d]) awayN++;
          else if (wd) capC += cap;
        }
        v = Math.round(v * 100) / 100;
        return { v: v, cap: Math.round(capC * 100) / 100, away: awayN, days: n, over: v > capC + 1e-9 && v > 0 };
      });
      list.sort(function (a, b) { return a.s < b.s ? -1 : a.s > b.s ? 1 : 0; });
      return { uid: u, cells: cells, tasks: list, warn: warn, cap: cap, late: lateN,
        over: cells.some(function (c) { return c.over; }) };
    });
    return { cols: cols, rows: rows, from: from, to: to, cfg: cfg, capKey: capKey, noEffort: noEffort };
  }
  /** ลากในภาระงาน — เลื่อนวัน (คงความยาวช่วง) และ/หรือเปลี่ยนผู้รับผิดชอบ ย้อนกลับได้ในครั้งเดียว */
  function wlMove(taskId, delta, toUser) {
    var t = task(taskId);
    if (!t || !can('write', taskId)) return false;
    delta = parseInt(delta, 10) || 0;
    var reassign = toUser && toUser !== t.assigneeId && user(toUser);
    if (!delta && !reassign) return false;
    batch('ย้ายงานในภาระงาน', null, function () {
      var patch = {};
      if (delta) {
        if (t.startOn) patch.startOn = addDays(t.startOn, delta);
        if (t.dueOn) patch.dueOn = addDays(t.dueOn, delta);
      }
      if (reassign) patch.assigneeId = toUser;
      updateTask(taskId, patch);
    });
    return true;
  }

  /* ---------- ไทม์ชีต ----------
   * db.timesheets = [{ id, userId, week (วันจันทร์), status: draft|submitted|approved|rejected, submittedAt, minutes,
   *                    reviewedBy, reviewedAt, note, hist: [{ s, by, at, note }] }]
   * ส่งแล้วหรืออนุมัติแล้ว = ล็อก รายการเวลาของคนนั้นในสัปดาห์นั้นแก้/เพิ่ม/ลบไม่ได้ (ดึงกลับได้ก่อนมีคนตรวจ)
   * ผู้ตรวจ = ผู้ดูแลระบบ + รายชื่อผู้ตรวจที่ตั้งไว้ + ผู้ดูแลโปรเจกต์ของงานที่ลงเวลาไว้ในสัปดาห์นั้น */
  function weekOf(d) {
    d = d && ISO_RE.test(d) ? d : today();
    return addDays(d, -((new Date(d + 'T00:00:00').getDay() + 6) % 7));
  }
  function tsFind(userId, week) {
    return (db.timesheets || []).filter(function (x) { return x.userId === userId && x.week === week; })[0] || null;
  }
  function tsById(id) { return (db.timesheets || []).filter(function (x) { return x.id === id; })[0] || null; }
  function tsStatus(userId, week) { var x = tsFind(userId, week); return x ? x.status : 'draft'; }
  function tsLocked(userId, date) {
    if (!date || !ISO_RE.test(date)) return false;
    var x = tsFind(userId, weekOf(date));
    return !!x && (x.status === 'submitted' || x.status === 'approved');
  }
  function weekEntries(userId, week) {
    var end = addDays(week, 6), out = [];
    db.tasks.forEach(function (t) {
      (t.time || []).forEach(function (e) {
        if (e.userId === userId && e.date >= week && e.date <= end) out.push({ t: t, e: e });
      });
    });
    return out;
  }
  function taskProjectName(t) {
    var r = rootOf(t), ms = r ? (index().memByTask[r.id] || []) : [];
    var p = ms.length ? project(ms[0].projectId) : null;
    return p ? p.name : '';
  }
  /** ตารางรายสัปดาห์ { days[7], rows[{ t, see, project, cells[7], total, billable: true|false|null|'mixed', category }], col[7], total, billable, ts } */
  function timesheetGrid(userId, week, extraIds) {
    week = weekOf(week);
    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(week, i));
    var rows = {}, order = [];
    var row = function (t) {
      if (!rows[t.id]) {
        rows[t.id] = { t: t, see: canSeeTask(t.id), project: taskProjectName(t), cells: [0, 0, 0, 0, 0, 0, 0], total: 0,
          billable: undefined, category: undefined, n: 0 };
        order.push(t.id);
      }
      return rows[t.id];
    };
    weekEntries(userId, week).forEach(function (x) {
      var r = row(x.t), k = daysBetween(week, x.e.date);
      r.cells[k] += +x.e.minutes || 0;
      r.total += +x.e.minutes || 0;
      r.n++;
      var b = x.e.billable == null ? null : !!x.e.billable;
      r.billable = r.billable === undefined ? b : (r.billable === b ? b : 'mixed');
      var c = x.e.category || '';
      r.category = r.category === undefined ? c : (r.category === c ? c : '*');
    });
    (extraIds || []).forEach(function (id) { var t = task(id); if (t && !rows[id]) row(t); });
    var col = [0, 0, 0, 0, 0, 0, 0], total = 0, bill = 0;
    var list = order.map(function (id) {
      var r = rows[id];
      if (r.billable === undefined) r.billable = null;
      if (r.category === undefined) r.category = '';
      r.cells.forEach(function (m, k) { col[k] += m; });
      total += r.total;
      if (r.billable === true) bill += r.total;
      return r;
    });
    weekEntries(userId, week).forEach(function (x) { if (x.e.billable === true && rows[x.t.id] && rows[x.t.id].billable === 'mixed') bill += +x.e.minutes || 0; });
    return { userId: userId, week: week, days: days, rows: list, col: col, total: total, billable: bill,
      ts: tsFind(userId, week), status: tsStatus(userId, week), locked: tsLocked(userId, week) };
  }
  /** ตั้งเวลารวมของช่องตาราง (งาน × วัน) ของตัวเอง — ปรับรายการล่าสุด เพิ่มใหม่ หรือลบเมื่อเป็น 0 */
  function setTimeCell(taskId, date, minutes, meta) {
    var t = task(taskId), me0 = db.currentUserId;
    if (!t || !ISO_RE.test(date || '') || !can('comment', taskId) || tsLocked(me0, date)) return false;
    minutes = Math.max(0, Math.min(24 * 60, Math.round(+minutes || 0)));
    t.time = t.time || [];
    var mine = t.time.filter(function (e) { return e.userId === me0 && e.date === date; });
    var cur = mine.reduce(function (a, e) { return a + (+e.minutes || 0); }, 0);
    if (cur === minutes) return false;
    snapshot('แก้ไทม์ชีต');
    if (!minutes) t.time = t.time.filter(function (e) { return mine.indexOf(e) < 0; });
    else if (!mine.length) {
      var x = { id: uid('te'), userId: me0, date: date, minutes: minutes, note: '',
        billable: meta && meta.billable != null ? !!meta.billable : null, category: (meta && meta.category) || null };
      t.time.push(x);
      log(taskId, 'บันทึกเวลา {v}', { v: fmtMinutes(minutes) });
      autoFire('timelog', taskId, { minutes: minutes, billable: x.billable });
    } else {
      var diff = minutes - cur, last = mine[mine.length - 1];
      if ((+last.minutes || 0) + diff > 0) last.minutes = (+last.minutes || 0) + diff;
      else {
        mine[0].minutes = minutes;
        t.time = t.time.filter(function (e) { return mine.indexOf(e) <= 0; });
      }
    }
    commit();
    return true;
  }
  /** แก้รายการเวลา (เจ้าของ หรือคนที่แก้งานได้) — billable / category / note / minutes / date */
  function updateTimeEntry(taskId, entryId, patch) {
    var t = task(taskId);
    var e = t && (t.time || []).filter(function (x) { return x.id === entryId; })[0];
    if (!e || !patch || (e.userId !== db.currentUserId && !can('write', taskId))) return false;
    if (tsLocked(e.userId, e.date) || (patch.date && tsLocked(e.userId, patch.date))) return false;
    snapshot('แก้รายการเวลา');
    if ('billable' in patch) e.billable = patch.billable === null ? null : !!patch.billable;
    if ('category' in patch) e.category = patch.category ? String(patch.category).slice(0, 60) : null;
    if ('note' in patch) e.note = String(patch.note || '').slice(0, 500);
    if ('minutes' in patch && +patch.minutes > 0) e.minutes = Math.min(24 * 60 * 7, Math.round(+patch.minutes));
    if (patch.date && ISO_RE.test(patch.date)) e.date = patch.date;
    commit();
    return true;
  }
  /** ตั้งเก็บเงินได้/หมวดให้รายการของตัวเองทั้งแถว (งานเดียวในสัปดาห์นั้น) */
  function setTimeRowMeta(taskId, week, patch) {
    var t = task(taskId), me0 = db.currentUserId;
    week = weekOf(week);
    if (!t || !patch || tsLocked(me0, week)) return false;
    var end = addDays(week, 6);
    var list = (t.time || []).filter(function (e) { return e.userId === me0 && e.date >= week && e.date <= end; });
    if (!list.length) return false;
    snapshot('แก้ไทม์ชีต');
    list.forEach(function (e) {
      if ('billable' in patch) e.billable = patch.billable === null ? null : !!patch.billable;
      if ('category' in patch) e.category = patch.category || null;
    });
    commit();
    return true;
  }
  function tsReviewersFor(x) {
    var out = {};
    db.users.forEach(function (u) { if (u.role === 'admin' && u.active !== false) out[u.id] = true; });
    ((db.settings || {}).tsReviewers || []).forEach(function (u) { if (user(u)) out[u] = true; });
    var projs = {};
    weekEntries(x.userId, x.week).forEach(function (y) {
      var r = rootOf(y.t);
      (index().memByTask[r ? r.id : y.t.id] || []).forEach(function (m) { projs[m.projectId] = true; });
    });
    Object.keys(projs).forEach(function (pid) {
      db.users.forEach(function (u) { if (u.active !== false && projectAccess(pid, u.id) === 'admin') out[u.id] = true; });
    });
    delete out[x.userId];
    return Object.keys(out);
  }
  function canReviewTimesheet(x) {
    if (typeof x === 'string') x = tsById(x);
    if (!x || !isActive()) return false;
    if (x.userId === db.currentUserId) return false;
    return isAdmin() || tsReviewersFor(x).indexOf(db.currentUserId) >= 0;
  }
  function submitTimesheet(week) {
    var me0 = db.currentUserId;
    week = weekOf(week);
    if (!isActive()) return null;
    var x = tsFind(me0, week);
    if (x && (x.status === 'submitted' || x.status === 'approved')) return null;
    var list = weekEntries(me0, week);
    if (!list.length) return 'empty';
    snapshot('ส่งไทม์ชีต');
    var now = new Date().toISOString();
    if (!x) { x = { id: uid('ts'), userId: me0, week: week, status: 'draft', hist: [] }; db.timesheets = db.timesheets || []; db.timesheets.push(x); }
    x.status = 'submitted';
    x.submittedAt = now;
    x.minutes = list.reduce(function (a, y) { return a + (+y.e.minutes || 0); }, 0);
    x.reviewedBy = null; x.reviewedAt = null; x.note = '';
    x.hist.push({ s: 'submitted', by: me0, at: now });
    notifyOnly(null, tsReviewersFor(x), 'ส่งไทม์ชีตสัปดาห์ {w} รอตรวจ ({h})', 'timesheet', { w: week, h: fmtMinutes(x.minutes) }, false, { route: 'ts:' + x.id });
    audit('time.submit', null, week);
    commit();
    return x;
  }
  function recallTimesheet(week) {
    var x = tsFind(db.currentUserId, weekOf(week));
    if (!x || x.status !== 'submitted') return false;
    snapshot('ดึงไทม์ชีตกลับ');
    x.status = 'draft';
    x.hist.push({ s: 'recalled', by: db.currentUserId, at: new Date().toISOString() });
    audit('time.recall', null, x.week);
    commit();
    return true;
  }
  function reviewTimesheet(id, approve, note) {
    var x = tsById(id);
    if (!x || x.status !== 'submitted' || !canReviewTimesheet(x)) return false;
    snapshot(approve ? 'อนุมัติไทม์ชีต' : 'ตีกลับไทม์ชีต');
    var now = new Date().toISOString();
    x.status = approve ? 'approved' : 'rejected';
    x.reviewedBy = db.currentUserId;
    x.reviewedAt = now;
    x.note = String(note || '').slice(0, 500);
    x.hist.push({ s: x.status, by: db.currentUserId, at: now, note: x.note });
    if (x.hist.length > 30) x.hist = x.hist.slice(-30);
    notifyOnly(null, [x.userId], approve ? 'อนุมัติไทม์ชีตสัปดาห์ {w} แล้ว' : 'ตีกลับไทม์ชีตสัปดาห์ {w}', 'timesheet', { w: x.week }, false, { route: 'ts:' + x.id });
    var u = user(x.userId);
    audit(approve ? 'time.approve' : 'time.reject', u ? u.name : x.userId, x.week);
    commit();
    return true;
  }
  /** ปลดล็อกไทม์ชีตที่อนุมัติแล้ว (ผู้ดูแลระบบ) — กลับเป็นร่างให้เจ้าของแก้แล้วส่งใหม่ */
  function reopenTimesheet(id) {
    var x = tsById(id);
    if (!x || x.status !== 'approved' || !isAdmin()) return false;
    snapshot('ปลดล็อกไทม์ชีต');
    x.status = 'draft';
    x.hist.push({ s: 'reopened', by: db.currentUserId, at: new Date().toISOString() });
    var u = user(x.userId);
    audit('time.reopen', u ? u.name : x.userId, x.week);
    commit();
    return true;
  }
  /** คิวที่ฉันตรวจได้ (รอตรวจก่อน แล้วที่ตรวจล่าสุด) */
  function tsReviewQueue() {
    return (db.timesheets || []).filter(function (x) { return x.status !== 'draft' && canReviewTimesheet(x); })
      .sort(function (a, b) {
        var pa = a.status === 'submitted' ? 0 : 1, pb = b.status === 'submitted' ? 0 : 1;
        return pa - pb || (a.week < b.week ? 1 : a.week > b.week ? -1 : 0);
      }).slice(0, 200);
  }
  function myTimesheets() {
    return (db.timesheets || []).filter(function (x) { return x.userId === db.currentUserId; })
      .sort(function (a, b) { return a.week < b.week ? 1 : -1; });
  }
  function timeCats() { return ((db.settings || {}).timeCats || TIME_CATS_DEFAULT).slice(); }
  function setTsSettings(patch) {
    if (!isAdmin() || !patch) return false;
    snapshot('ตั้งค่าไทม์ชีต');
    db.settings = db.settings || {};
    if (Array.isArray(patch.cats)) {
      var seen = {};
      db.settings.timeCats = patch.cats.map(function (c) { return String(c || '').trim().slice(0, 60); })
        .filter(function (c) { if (!c || seen[c]) return false; seen[c] = true; return true; }).slice(0, 30);
    }
    if (Array.isArray(patch.reviewers)) db.settings.tsReviewers = patch.reviewers.filter(function (u) { return !!user(u); });
    audit('settings.timesheet', null, null);
    commit();
    return true;
  }
  /** CSV ของรายการเวลา — userId/week ระบุ = ไทม์ชีตสัปดาห์เดียว; ไม่ระบุ = ทุกคนในช่วง from–to (ผู้ดูแล/ผู้ตรวจ) */
  function timesheetCsv(opts) {
    opts = opts || {};
    var rows = [['date', 'user', 'email', 'project', 'task', 'task_id', 'minutes', 'hours', 'billable', 'category', 'note', 'week', 'status'].join(',')];
    var from = opts.week ? weekOf(opts.week) : (opts.from || '0000-00-00');
    var to = opts.week ? addDays(weekOf(opts.week), 6) : (opts.to || '9999-12-31');
    var n = 0;
    db.tasks.forEach(function (t) {
      (t.time || []).forEach(function (e) {
        if (e.date < from || e.date > to) return;
        if (opts.userId && e.userId !== opts.userId) return;
        var wk = weekOf(e.date), x = tsFind(e.userId, wk);
        if (!opts.userId && e.userId !== db.currentUserId && !isAdmin() && !(x && canReviewTimesheet(x))) return;
        var u = user(e.userId), see = canSeeTask(t.id) || e.userId === db.currentUserId || (x && canReviewTimesheet(x));
        rows.push([e.date, u ? u.name : e.userId, u ? u.email || '' : '', see ? taskProjectName(t) : '', see ? t.name : '—', t.id, e.minutes,
          ((+e.minutes || 0) / 60).toFixed(2), e.billable == null ? '' : (e.billable ? 'yes' : 'no'), e.category || '', see ? e.note || '' : '',
          wk, x ? x.status : 'draft'].map(csvCell).join(','));
        n++;
      });
    });
    audit('time.export', null, 'ส่งออก {n} รายการเวลา', { n: n });
    commit();
    return '﻿' + rows.join('\r\n');
  }
  /* 3a — ทริกเกอร์ "บันทึกเวลา" (store ปลุก autoFire('timelog') ทุกครั้งที่มีรายการเวลาใหม่)
   *   tr.min  อย่างน้อยกี่นาที (0 = ทุกครั้ง)   tr.bill  '' | 'yes' | 'no' */
  autoRegister('trigger', { id: 'timelog', label: 'บันทึกเวลา', match: function (tr, ev) {
    if (+tr.min && (+ev.info.minutes || 0) < +tr.min) return false;
    if (tr.bill === 'yes' && ev.info.billable !== true) return false;
    if (tr.bill === 'no' && ev.info.billable === true) return false;
    return true;
  } });

  /* ---------- รายงานรวม (แดชบอร์ดข้ามโปรเจกต์) ----------
   * report = { id:'rp_…', name, owner, scope: { k: org|team|portfolio|projects, id, ids[] },
   *            share: { org: bool, users[], teams[] }, widgets: [widget + src: tasks|projects|goals|portfolios], by, at }
   * ข้อมูลในกราฟคิดตามสิทธิ์ของคนที่เปิดดูเสมอ แชร์รายงานจึงไม่ทำให้ใครเห็นงานที่ตัวเองไม่มีสิทธิ์ */
  var REPORT_SRCS = [['tasks', 'งาน'], ['projects', 'โปรเจกต์'], ['portfolios', 'พอร์ตโฟลิโอ'], ['goals', 'เป้าหมาย']];
  var REPORT_SCOPES = [['org', 'ทั้งองค์กร'], ['team', 'ทีม'], ['portfolio', 'พอร์ตโฟลิโอ'], ['projects', 'เลือกโปรเจกต์']];
  function normalizeReport(r) {
    r.name = String(r.name || 'รายงาน').slice(0, 120);
    r.scope = isObj(r.scope) ? r.scope : { k: 'org' };
    if (['org', 'team', 'portfolio', 'projects'].indexOf(r.scope.k) < 0) r.scope.k = 'org';
    r.scope.ids = Array.isArray(r.scope.ids) ? r.scope.ids : [];
    if (!('id' in r.scope)) r.scope.id = null;
    r.share = isObj(r.share) ? r.share : {};
    r.share.org = !!r.share.org;
    r.share.users = Array.isArray(r.share.users) ? r.share.users : [];
    r.share.teams = Array.isArray(r.share.teams) ? r.share.teams : [];
    r.widgets = Array.isArray(r.widgets) ? r.widgets.filter(function (w) { return w && w.id; }).map(normalizeRWidget).slice(0, REPORT_W_MAX) : [];
    return r;
  }
  function normalizeRWidget(w) {
    normalizeWidget(w);
    if (['tasks', 'projects', 'portfolios', 'goals'].indexOf(w.src) < 0) w.src = 'tasks';
    if (typeof w.q !== 'string') w.q = 'all';       // ตัวกรองด่วน all | open | done | overdue
    return w;
  }
  function reports() { return db.reports || []; }
  function report(id) { return reports().filter(function (r) { return r.id === id; })[0] || null; }
  function canSeeReport(id) {
    var r = typeof id === 'string' ? report(id) : id, me0 = db.currentUserId;
    if (!r || !isActive()) return false;
    if (r.owner === me0 || r.share.users.indexOf(me0) >= 0) return true;
    if (r.share.teams.some(function (t) { return isTeamMember(t, me0); })) return true;
    return r.share.org && role() !== 'guest';
  }
  function canEditReport(id) {
    var r = typeof id === 'string' ? report(id) : id;
    return !!r && can('write') && (r.owner === db.currentUserId || r.share.editors === true && canSeeReport(r));
  }
  function visibleReports() { return reports().filter(function (r) { return canSeeReport(r); }); }
  function createReport(attrs) {
    attrs = attrs || {};
    if (!can('write') || reports().length >= REPORT_MAX * 10) return null;
    var name = String(attrs.name || '').trim();
    if (!name) return null;
    snapshot('สร้างรายงาน');
    db.reports = db.reports || [];
    var ws = (attrs.widgets || defaultReportWidgets()).map(function (w) { w = clone(w); w.id = uid('rw'); return w; });
    var r = normalizeReport({ id: uid('rp'), name: name, owner: db.currentUserId, scope: attrs.scope || { k: 'org' },
      share: attrs.share || {}, widgets: ws, by: db.currentUserId, at: new Date().toISOString() });
    db.reports.push(r);
    audit('report.create', r.name, null);
    commit();
    return r;
  }
  function defaultReportWidgets() {
    return [
      { kind: 'number', title: 'งานที่ยังไม่เสร็จ', src: 'tasks', y: 'count', q: 'open' },
      { kind: 'number', title: 'เลยกำหนด', src: 'tasks', y: 'count', q: 'overdue' },
      { kind: 'stack', title: 'งานตามโปรเจกต์', src: 'tasks', x: 'project', split: 'completed', full: true },
      { kind: 'donut', title: 'สถานะโปรเจกต์', src: 'projects', x: 'status' },
      { kind: 'bar', title: 'ความคืบหน้าเป้าหมาย', src: 'goals', x: 'owner', y: 'avg:progress' }
    ].map(normalizeRWidget);
  }
  function updateReport(id, patch) {
    var r = report(id);
    if (!r || !canEditReport(r) || !patch) return false;
    snapshot('แก้รายงาน');
    if ('name' in patch && String(patch.name || '').trim()) r.name = String(patch.name).trim().slice(0, 120);
    if (patch.scope) r.scope = patch.scope;
    if (patch.share && r.owner === db.currentUserId) r.share = patch.share;
    normalizeReport(r);
    if (patch.share) audit('report.share', r.name, null);
    commit();
    return true;
  }
  function deleteReport(id) {
    var r = report(id);
    if (!r || (r.owner !== db.currentUserId && !isAdmin())) return false;
    snapshot('ลบรายงาน');
    db.reports = reports().filter(function (x) { return x !== r; });
    audit('report.delete', r.name, null);
    commit();
    return true;
  }
  function saveReportWidget(id, w) {
    var r = report(id);
    if (!r || !canEditReport(r) || !w) return null;
    var c = normalizeRWidget(clone(w)), at = r.widgets.map(function (x) { return x.id; }).indexOf(c.id);
    if (at < 0 && r.widgets.length >= REPORT_W_MAX) return null;
    snapshot('แก้รายงาน');
    if (at >= 0) r.widgets[at] = c;
    else { c.id = uid('rw'); r.widgets.push(c); }
    commit();
    return c;
  }
  function deleteReportWidget(id, wid) {
    var r = report(id);
    if (!r || !canEditReport(r)) return false;
    snapshot('ลบวิดเจ็ต');
    r.widgets = r.widgets.filter(function (x) { return x.id !== wid; });
    commit();
    return true;
  }
  function moveReportWidget(id, wid, delta) {
    var r = report(id);
    if (!r || !canEditReport(r)) return false;
    var i = r.widgets.map(function (x) { return x.id; }).indexOf(wid), j = i + delta;
    if (i < 0 || j < 0 || j >= r.widgets.length) return false;
    snapshot('จัดลำดับวิดเจ็ต');
    var x = r.widgets.splice(i, 1)[0];
    r.widgets.splice(j, 0, x);
    commit();
    return true;
  }
  /** โปรเจกต์ในขอบเขตของรายงาน (เฉพาะที่คนเปิดดูเห็นได้) */
  function reportProjects(r) {
    var s = r.scope;
    if (s.k === 'team') return s.id && team(s.id) ? teamProjects(s.id) : [];
    if (s.k === 'portfolio') return s.id && portfolio(s.id) ? allProjectsUnder(s.id) : [];
    if (s.k === 'projects') return s.ids.map(project).filter(function (p) { return p && projectAccess(p.id); });
    return visibleProjects();
  }
  var REPORT_Q = {
    all: [], open: [{ f: 'completed', op: 'no', v: null }], done: [{ f: 'completed', op: 'yes', v: null }],
    overdue: [{ f: 'due', op: 'overdue', v: null }, { f: 'completed', op: 'no', v: null }]
  };
  /** งานในขอบเขต [{ task, membership }] ไม่ซ้ำ ผ่านตัวกรองด่วน + ตัวกรองของวิดเจ็ต */
  function reportTaskItems(r, w) {
    var seen = {}, out = [], conds = (REPORT_Q[w.q] || []).concat(w.filters || []);
    reportProjects(r).forEach(function (p) {
      tasksInProject(p.id).forEach(function (x) {
        if (seen[x.task.id] || !canSeeTask(x.task.id)) return;
        seen[x.task.id] = true;
        if (conds.every(function (c) { return matchCond(x.task, c, x.membership); })) out.push(x);
      });
    });
    return out;
  }
  /** แถวของแหล่งข้อมูลที่ไม่ใช่งาน [{ kind, id, name, keys: { status, owner, team, period }, y: { count, progress, open, overdue } }] */
  function reportRows(r, src) {
    var out = [];
    if (src === 'projects') {
      reportProjects(r).forEach(function (p) {
        var st = projectStats(p.id);
        out.push({ kind: 'project', id: p.id, name: p.name, color: p.color,
          keys: { status: p.status ? p.status.state : '', owner: p.owner || '' },
          y: { count: 1, progress: st.percent || 0, open: Math.max(0, (st.total || 0) - (st.done || 0)), overdue: st.overdue || 0 } });
      });
    } else if (src === 'portfolios') {
      var ids = null;
      if (r.scope.k === 'portfolio' && r.scope.id) { ids = pfDescendants(r.scope.id); ids[r.scope.id] = true; }
      portfolios().forEach(function (f) {
        if (ids && !ids[f.id]) return;
        if (portfolioHidden && portfolioHidden(f.id)) return;
        var st = portfolioStats(f.id);
        out.push({ kind: 'portfolio', id: f.id, name: f.name, color: f.color,
          keys: { status: f.status ? f.status.state : '', owner: f.owner || f.createdBy || '' },
          y: { count: 1, progress: st.percent || 0, open: Math.max(0, st.total - st.done), overdue: st.overdue || 0 } });
      });
    } else if (src === 'goals') {
      var pids = null;
      if (r.scope.k === 'portfolio' || r.scope.k === 'projects') {
        pids = {};
        reportProjects(r).forEach(function (p) { pids[p.id] = true; });
      }
      visibleGoals().forEach(function (g) {
        if (r.scope.k === 'team' && g.team !== r.scope.id) return;
        if (pids && !g.metric.projects.concat(g.rel).some(function (x) { return pids[x]; })) return;
        var pr = goalProgress(g.id);
        out.push({ kind: 'goal', id: g.id, name: g.name,
          keys: { status: g.closed ? g.closed.outcome : (g.status ? g.status.state : ''), owner: g.owner || '', team: g.team || '',
            period: periodLabel ? periodLabel(g.period) : '' },
          y: { count: 1, progress: Math.round(pr.pct || 0), open: g.closed ? 0 : 1, overdue: 0 } });
      });
    }
    return out;
  }
  function reportCatDefs(src, by, seen) {
    var out = [];
    if (by === 'status') {
      var states = PROJECT_STATES.concat(src === 'goals' ? (GOAL_STATES || []).concat(GOAL_OUTCOMES || []) : []);
      states.forEach(function (s) { if (seen[s.id] && !out.some(function (o) { return o.key === s.id; })) out.push({ key: s.id, label: L(s.label), color: s.color }); });
    } else if (by === 'owner') {
      Object.keys(seen).forEach(function (k) { var u = user(k); if (u) out.push({ key: k, label: u.name, color: u.color }); });
    } else if (by === 'team') {
      Object.keys(seen).forEach(function (k) { var t = team(k); if (t) out.push({ key: k, label: t.name, color: t.color }); });
    }
    var known = {};
    out.forEach(function (c) { known[c.key] = true; });
    Object.keys(seen).forEach(function (k) { if (k && !known[k]) out.push({ key: k, label: k }); });
    if (seen['']) out.push({ key: '', label: by === 'team' ? L('ระดับบริษัท') : L('ไม่ระบุ'), color: 'var(--fg-faint)' });
    return out;
  }
  /** ข้อมูลกราฟของวิดเจ็ตในรายงาน { cats, series, values, number } */
  function reportData(id, w) {
    var r = typeof id === 'string' ? report(id) : id;
    w = normalizeRWidget(clone(w));
    if (!r) return { cats: [], series: [], values: [], number: null };
    if (w.src === 'tasks') {
      var items = reportTaskItems(r, w);
      return chartData(items, w, null);
    }
    var rows = reportRows(r, w.src);
    var ym = /^(avg|sum):(\w+)$/.exec(w.y || '');
    var yk = ym ? ym[2] : 'count', agg = ym ? ym[1] : 'sum';
    var yv = function (x) { return x.y[yk] == null ? 0 : x.y[yk]; };
    var calc = function (list) {
      if (!list.length) return 0;
      var s = list.reduce(function (a, x) { return a + yv(x); }, 0);
      return agg === 'avg' ? Math.round(s / list.length * 10) / 10 : s;
    };
    if (w.kind === 'number') return { cats: [], series: [], values: [], number: { value: calc(rows) } };
    var by = ['status', 'owner', 'team', 'period'].indexOf(w.x) >= 0 ? w.x : 'status';
    var split = (w.kind === 'stack' || w.kind === 'group') && ['status', 'owner', 'team'].indexOf(w.split) >= 0 && w.split !== by ? w.split : '';
    var bucket = {}, seenX = {}, seenS = {};
    rows.forEach(function (x) {
      var xk = x.keys[by] || '', sk = split ? (x.keys[split] || '') : 'v';
      seenX[xk] = true; seenS[sk] = true;
      (bucket[xk + '\u0001' + sk] = bucket[xk + '\u0001' + sk] || []).push(x);
    });
    var cats = by === 'period' ? Object.keys(seenX).sort().map(function (k) { return { key: k, label: k || L('ไม่ระบุ') }; }) : reportCatDefs(w.src, by, seenX);
    var series = split ? reportCatDefs(w.src, split, seenS) : [{ key: 'v', label: '' }];
    return { cats: cats, series: series, number: null, bench: w.bench,
      values: cats.map(function (c) { return series.map(function (s) { return calc(bucket[c.key + '\u0001' + s.key] || []); }); }) };
  }
  /** ของที่อยู่ในแท่ง/ชิ้นที่คลิก [{ kind: task|project|portfolio|goal, id, name }] */
  function reportClick(id, wid, cat, ser) {
    var r = report(id), w = r && r.widgets.filter(function (x) { return x.id === wid; })[0];
    if (!r || !w) return [];
    if (w.src === 'tasks') {
      var items = reportTaskItems(r, w);
      return items.filter(function (x) {
        if (w.kind === 'number' || cat === undefined || cat === null) return true;
        if (w.kind === 'burnup' || w.kind === 'burndown' || w.x === 'period') return true;
        if (catKeys(x.task, x.membership, w.x).indexOf(cat) < 0) return false;
        if (ser && ser !== 'v' && w.split) return catKeys(x.task, x.membership, w.split).indexOf(ser) >= 0;
        return true;
      }).slice(0, 200).map(function (x) { return { kind: 'task', id: x.task.id, name: x.task.name }; });
    }
    var by = w.x || 'status';
    return reportRows(r, w.src).filter(function (x) {
      if (w.kind === 'number' || cat === undefined || cat === null) return true;
      if ((x.keys[by] || '') !== cat) return false;
      if (ser && ser !== 'v' && w.split) return (x.keys[w.split] || '') === ser;
      return true;
    }).map(function (x) { return { kind: x.kind, id: x.id, name: x.name }; });
  }

  var X4B2 = {
    TIME_CATS_DEFAULT: TIME_CATS_DEFAULT, TS_STATES: TS_STATES, CAP_DEFAULT: CAP_DEFAULT,
    awayRanges: awayRanges, awayOn: awayOn, awayNow: awayNow, addAwayRange: addAwayRange, removeAwayRange: removeAwayRange,
    awayDays: awayDays, canEditPerson: canEditPerson, capacityOf: capacityOf, setCapacity: setCapacity,
    WL_ZOOMS: WL_ZOOMS, wlCfg: wlCfg, setWlCfg: setWlCfg, wlEffortFields: wlEffortFields, wlCols: wlCols, wlStep: wlStep,
    wlTasks: wlTasks, wlProjects: wlProjects, taskDays: taskDays, effortOf: effortOf, workload: workload, wlMove: wlMove,
    weekOf: weekOf, tsFind: tsFind, tsById: tsById, tsStatus: tsStatus, tsLocked: tsLocked, weekEntries: weekEntries,
    timesheetGrid: timesheetGrid, setTimeCell: setTimeCell, updateTimeEntry: updateTimeEntry, setTimeRowMeta: setTimeRowMeta,
    tsReviewersFor: tsReviewersFor, canReviewTimesheet: canReviewTimesheet, submitTimesheet: submitTimesheet,
    recallTimesheet: recallTimesheet, reviewTimesheet: reviewTimesheet, reopenTimesheet: reopenTimesheet,
    tsReviewQueue: tsReviewQueue, myTimesheets: myTimesheets, timeCats: timeCats, setTsSettings: setTsSettings,
    timesheetCsv: timesheetCsv, taskProjectName: taskProjectName,
    REPORT_SRCS: REPORT_SRCS, REPORT_SCOPES: REPORT_SCOPES, REPORT_W_MAX: REPORT_W_MAX,
    reports: reports, report: report, visibleReports: visibleReports, canSeeReport: canSeeReport, canEditReport: canEditReport,
    createReport: createReport, updateReport: updateReport, deleteReport: deleteReport, saveReportWidget: saveReportWidget,
    deleteReportWidget: deleteReportWidget, moveReportWidget: moveReportWidget, reportProjects: reportProjects,
    reportData: reportData, reportClick: reportClick, normalizeRWidget: normalizeRWidget
  };
  Object.keys(X4B2).forEach(function (k) { global.Store[k] = X4B2[k]; });

  /* ======================================================================
   * Sprint 2C — มุมมองผู้บริหาร
   * ผู้บริหารถาม "ตอนนี้ทำอะไรถึงไหนแล้ว?" แล้วต้องได้คำตอบโดยไม่ต้องคลิกไล่ทีละโปรเจกต์
   * ทุกตัวเลขในนี้คิดจากสายตาของคนที่เปิดดู (โปรเจกต์/งานที่เห็นได้เท่านั้น)
   * ====================================================================== */

  /* ตัวเลข ณ ตอนรายงาน — t งานทั้งหมด d เสร็จแล้ว o เลยกำหนด (เก็บสั้น ๆ เพราะทุกรายงานพกไปด้วย) */
  function statusSnapOf(hostId) {
    if (/^pf_/.test(String(hostId || ''))) {
      var ps = portfolioStats(hostId);
      return { t: ps.total, d: ps.done, o: ps.overdue };
    }
    var st = projectStats(hostId);
    return { t: st.total, d: st.done, o: st.overdue };
  }
  /** ตัวเลขของรายงานเก่าที่ยังไม่มี snap — ไฮไลต์ "ภาพรวมความคืบหน้า" (3b) เก็บตัวเลขชุดเดียวกันไว้ */
  function snapOfEntry(e) {
    if (!e) return null;
    if (e.snap) return e.snap;
    var c = (e.hl || []).filter(function (x) { return x && x.k === 'chart'; })[0];
    return c ? { t: c.total, d: c.done, o: c.overdue } : null;
  }
  /** ติดตัวเลขและ "อะไรเปลี่ยนจากรอบก่อน" ให้รายงานใหม่ คิดตอนรายงานแล้วเก็บไว้เลย
   *  เปิดดูย้อนหลังเมื่อไรก็ได้ตัวเลขเดิม ไม่ใช่คิดใหม่จากงานวันนี้ซึ่งเปลี่ยนไปแล้ว */
  function stampStatus(log, entry, snap) {
    var prev = log && log.length ? log[log.length - 1] : null;
    var ps = snapOfEntry(prev);
    entry.replies = entry.replies || [];
    entry.snap = snap;
    entry.chg = prev ? {
      from: prev.state || null, since: prev.at || null,
      d: ps && snap ? snap.d - ps.d : null, o: ps && snap ? snap.o - ps.o : null
    } : null;
    return entry;
  }
  /** ที่เปลี่ยนจากรอบก่อนของรายงานหนึ่ง — รายงานเก่าที่ไม่ได้เก็บไว้ บอกได้แค่สถานะที่เปลี่ยน (ดูจากรายงานก่อนหน้าในประวัติ) */
  function statusChange(host, e) {
    if (!host || !e) return null;
    if (e.chg !== undefined) return e.chg;
    var log = host.statusLog || [], i = log.indexOf(e);
    if (i <= 0) return null;
    return { from: log[i - 1].state || null, since: log[i - 1].at || null, d: null, o: null };
  }

  /* ---------- คำตอบใต้รายงานสถานะ ---------- */
  var STATUS_REPLY_MAX = 100;
  function statusHost(id) { return /^pf_/.test(String(id || '')) ? portfolio(id) : project(id); }
  function statusEntry(hostId, entryId) {
    var h = statusHost(hostId);
    return h ? (h.statusLog || []).filter(function (e) { return e && e.id === entryId; })[0] || null : null;
  }
  /** ถาม/ตอบได้ = แสดงความเห็นในโปรเจกต์นั้นได้ (พอร์ตโฟลิโอ = แสดงความเห็นได้ในองค์กร) */
  function canReplyStatus(hostId) {
    return isActive() && !!statusHost(hostId) && canInProject(hostId, 'comment');
  }
  /** ปลายทางของการแจ้งเตือน — โปรเจกต์ไปหน้าภาพรวม พอร์ตโฟลิโอไปแท็บความคืบหน้า */
  function statusNotifExtra(hostId) {
    return /^pf_/.test(hostId) ? { route: 'portfolio:' + hostId + ':progress' } : { projectId: hostId, route: 'p-overview' };
  }
  function addStatusReply(hostId, entryId, body) {
    var h = statusHost(hostId), e = statusEntry(hostId, entryId);
    var text = String(body || '').replace(/\r\n/g, '\n').trim();
    if (!h || !e || !text || !canReplyStatus(hostId)) return null;
    e.replies = Array.isArray(e.replies) ? e.replies : [];
    if (e.replies.length >= STATUS_REPLY_MAX) return null;
    snapshot('ตอบรายงานสถานะ');
    var r = { id: uid('sr'), by: db.currentUserId, at: new Date().toISOString(), body: text.slice(0, 5000) };
    e.replies.push(r);
    var isPf = /^pf_/.test(hostId);
    /* แจ้งเฉพาะคนที่ยังเห็นที่นี่ได้ (โปรเจกต์ปิดที่ถูกถอดออกแล้วไม่ต้องได้) */
    var sees = function (u) { return isPf || !!projectAccess(hostId, u); };
    var men = parseMentions(text).filter(sees);
    /* คนที่ต้องรู้: คนเขียนรายงาน เจ้าของ และคนที่เคยถาม/ตอบในเธรดนี้แล้ว (คนที่ถูก @ ได้ข้อความแบบเจาะจงแยกไป) */
    var who = [e.by, h.owner].concat(e.replies.map(function (x) { return x.by; }))
      .filter(function (u, i, a) { return u && a.indexOf(u) === i && men.indexOf(u) < 0 && sees(u); });
    var extra = statusNotifExtra(hostId);
    if (men.length) notifyOnly(null, men, 'พูดถึงคุณในรายงานสถานะของ {p}', 'mention', { p: h.name }, false, extra);
    if (who.length) notifyOnly(null, who, 'ตอบรายงานสถานะของ {p}', 'status', { p: h.name }, false, extra);
    commit();
    return r;
  }
  function deleteStatusReply(hostId, entryId, replyId) {
    var e = statusEntry(hostId, entryId);
    var r = e && (e.replies || []).filter(function (x) { return x.id === replyId; })[0];
    if (!r || (r.by !== db.currentUserId && !can('manage'))) return false;
    snapshot('ลบคำตอบ');
    e.replies = e.replies.filter(function (x) { return x !== r; });
    commit();
    return true;
  }

  /* ---------- การ์ดภาพรวมผู้บริหารบนหน้าแรก ---------- */
  /* เงื่อนไขค้นหาขั้นสูงที่ตรงกับตัวเลขบนการ์ด — กดตัวเลขแล้วรายการที่เปิดต้องนับได้เท่ากันพอดี
   * (งานหลักที่อยู่ในโปรเจกต์ ยังไม่เสร็จ ไม่นับงานย่อยและงานส่วนตัว เหมือน projectStats) */
  function execConds(kind) {
    return [{ f: 'due', op: kind === 'week' ? 'week' : 'overdue', v: null }, { f: 'completed', op: 'no', v: null },
            { f: 'project', op: 'notempty', v: null }, { f: 'subtask', op: 'no', v: null }];
  }
  function execOverview() {
    var td = today(), risk = [], silent = [];
    visibleProjects().forEach(function (p) {
      var st = projectStats(p.id);
      var s = p.status ? p.status.state : null;
      var at = statusAt(p);
      var age = at ? daysBetween(String(at).slice(0, 10), td) : null;
      var row = { p: p, state: s, overdue: st.overdue, percent: st.percent, total: st.total, at: at, age: age };
      if (s === 'off_track' || s === 'at_risk') risk.push(row);
      /* "เงียบ" = ไม่ได้รายงานเกิน 7 วัน (หรือไม่เคย) แต่มีงานเลยกำหนด — โปรเจกต์ที่ปิดไปแล้วไม่นับ */
      else if (st.overdue > 0 && (age === null || age >= 7) && !(s && projectStateDone(s))) silent.push(row);
    });
    risk.sort(function (a, b) {
      if (a.state !== b.state) return a.state === 'off_track' ? -1 : 1;
      return b.overdue - a.overdue;
    });
    silent.sort(function (a, b) { return b.overdue - a.overdue; });
    /* คนที่งานล้นหรือค้างเยอะ — ใช้ตัวคำนวณเดียวกับหน้าภาระงาน (นับงานค้างไว้ที่วันนี้ ตาม Sprint 1C) */
    var people = [];
    try {
      workload({ kind: 'all' }, wlDefaultCfg()).rows.forEach(function (r) {
        var now = r.cells[0] || {}, next = r.cells[1] || {};
        var score = r.late * 10 + (now.over ? 5 : 0) + (next.over ? 2 : 0);
        if (!score) return;
        people.push({ uid: r.uid, late: r.late, over: !!now.over, overNext: !!next.over,
          v: now.v || 0, cap: now.cap || 0, score: score });
      });
    } catch (err) { people = []; }
    people.sort(function (a, b) { return b.score - a.score; });
    return {
      risk: risk, silent: silent, people: people,
      offTrack: risk.filter(function (x) { return x.state === 'off_track'; }).length,
      atRisk: risk.filter(function (x) { return x.state === 'at_risk'; }).length,
      overdue: searchAdv({ conds: execConds('overdue'), limit: 1e6 }).length,
      dueWeek: searchAdv({ conds: execConds('week'), limit: 1e6 }).length,
      projects: visibleProjects().length
    };
  }

  /* ---------- กิจกรรมล่าสุดบนหน้าแรก ----------
   * เดิมหนึ่งบรรทัดต่อหนึ่งความเคลื่อนไหว คนเดียวแก้งานเดียวห้าครั้งก็กินห้าบรรทัด เรื่องสำคัญหลุดจากการ์ดไปหมด
   * ตอนนี้รวมเป็นบรรทัดเดียวต่อ "คน + งาน + วัน" และรายงานสถานะขึ้นในฟีดเดียวกัน
   * mode 'decisions' = เฉพาะรายงานสถานะ การอนุมัติ และหมุดหมายที่เสร็จ (เรื่องที่ผู้บริหารต้องรู้) */
  var DECISION_KEYS = ['เปลี่ยนสถานะอนุมัติเป็น “{s}”', 'ส่งงานนี้ขออนุมัติอีกครั้ง'];
  function isDecisionStory(s, t) {
    if (s.type !== 'log') return false;
    if (DECISION_KEYS.indexOf(s.text) >= 0) return true;
    return s.text === 'ทำงานนี้เสร็จแล้ว' && !!t && t.type === 'milestone';
  }
  function activityFeed(limit, mode) {
    var n = limit || 6, decisions = mode === 'decisions';
    var out = [];
    visibleProjects().forEach(function (p) {
      (p.statusLog || []).forEach(function (e) {
        if (e && e.at) out.push({ kind: 'status', at: String(e.at), actorId: e.by, host: p, entry: e });
      });
    });
    if (role() !== 'guest') {
      (db.portfolios || []).forEach(function (f) {
        (f.statusLog || []).forEach(function (e) {
          if (e && e.at) out.push({ kind: 'pfstatus', at: String(e.at), actorId: e.by, host: f, entry: e });
        });
      });
    }
    var list = db.stories.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    var seeCache = {}, groups = {}, gl = [];
    for (var i = 0; i < list.length && i < 4000 && gl.length < n * 3; i++) {
      var s = list[i];
      if (!(s.taskId in seeCache)) seeCache[s.taskId] = canSeeTask(s.taskId);
      if (!seeCache[s.taskId]) continue;
      var t = task(s.taskId);
      if (decisions && !isDecisionStory(s, t)) continue;
      var key = (s.actorId || '') + '|' + s.taskId + '|' + String(s.createdAt).slice(0, 10);
      var g = groups[key];
      if (!g) {
        g = groups[key] = { kind: 'task', at: String(s.createdAt), actorId: s.actorId, taskId: s.taskId,
          taskName: t ? t.name : null, milestone: !!t && t.type === 'milestone', stories: [] };
        gl.push(g);
      }
      g.stories.push(s);
    }
    out = out.concat(gl);
    out.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
    return out.slice(0, n).map(function (x) { x.actor = user(x.actorId); return x; });
  }

  var X2C = {
    statusChange: statusChange, statusEntry: statusEntry, canReplyStatus: canReplyStatus,
    addStatusReply: addStatusReply, deleteStatusReply: deleteStatusReply, STATUS_REPLY_MAX: STATUS_REPLY_MAX,
    execOverview: execOverview, execConds: execConds, activityFeed: activityFeed, isDecisionStory: isDecisionStory
  };
  Object.keys(X2C).forEach(function (k) { global.Store[k] = X2C[k]; });

  /* ======================================================================
   * 4b ส่วนที่ 2 — ไฟล์แนบบน SharePoint/OneDrive และสื่อฝัง
   * ====================================================================== */

  /* ไฟล์ที่อยู่บนไดรฟ์แล้วเก็บแค่ข้อมูลอ้างอิง { driveId, driveItemId, webUrl, remote: true } (url = webUrl ไว้เปิดดู) */
  function withRemote(x, meta) {
    if (!meta || !meta.driveItemId) return x;
    x.driveId = String(meta.driveId || '').slice(0, 200) || null;
    x.driveItemId = String(meta.driveItemId).slice(0, 200);
    x.webUrl = String(meta.webUrl || meta.url || '').slice(0, 2000);
    x.url = x.webUrl;
    x.remote = true;
    if (meta.linked) x.linked = true;          // แนบจากไฟล์ที่มีอยู่แล้วในไดรฟ์ (ไม่ได้อัปใหม่)
    if (!x.size && meta.size) x.size = meta.size;
    if (!x.mime && meta.mime) x.mime = meta.mime;
    return x;
  }
  var PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  /** src ของรูปจากไฟล์แนบ — ไฟล์บนไดรฟ์ใช้รูปที่โหลดผ่าน Graph แล้ว ไม่งั้นพิกเซลใสพร้อมรหัสให้ files.js มาเติม */
  function attImgSrc(a) {
    if (!a) return '';
    if (!a.remote || !a.driveItemId) return a.url || '';
    var F = global.OrbitFiles, hit = F && F.cachedUrl ? F.cachedUrl(a) : null;
    return hit || PIXEL + '#gfile=' + encodeURIComponent((a.driveId || '') + '|' + a.driveItemId);
  }
  /** ไฟล์ที่ยังฝังเป็น data URI อยู่ในข้อมูลทุกที่ (งาน ทรัพยากร ประกาศ คำตอบ รูปในหน้าเอกสาร ฟอร์ม ถังขยะ)
   *  คืน [{ path, name, url, size, mime, entity }] — path คือเส้นทางคีย์จาก db ใช้ชี้กลับตอนแทนที่ */
  function inlineBlobs() {
    var out = [];
    var walk = function (o, path, entity, depth) {
      if (!o || typeof o !== 'object' || depth > 14) return;
      if (Array.isArray(o)) { o.forEach(function (x, i) { walk(x, path.concat([i]), entity, depth + 1); }); return; }
      if (typeof o.url === 'string' && o.url.indexOf('data:') === 0 && (o.name || o.id)) {
        var b64 = o.url.indexOf(',') >= 0 ? o.url.length - o.url.indexOf(',') - 1 : o.url.length;
        out.push({ path: path, name: o.name || (o.id + ''), url: o.url, size: o.size || o.bytes || Math.round(b64 * 0.75),
          mime: o.mime || (/^data:([^;,]+)/.exec(o.url) || [])[1] || null, entity: entity || 'misc' });
        return;
      }
      var ent = typeof o.id === 'string' && /^(t|p|pg|tm|pf|tr|g|rp|fm|m|pm|msg)_/.test(o.id) ? o.id : entity;
      Object.keys(o).forEach(function (k) {
        if (k === 'personal' && depth === 0) return;
        walk(o[k], path.concat([k]), ent, depth + 1);
      });
    };
    walk(db, [], null, 0);
    return out;
  }
  function objAt(path) {
    var o = db;
    for (var i = 0; i < path.length && o; i++) o = o[path[i]];
    return o || null;
  }
  /** แทน data URI ด้วยข้อมูลอ้างอิงบนไดรฟ์ (ผู้ดูแลระบบ) — [{ path, url (เดิม), meta }] ย้อนกลับได้ในครั้งเดียว
   *  คืน { n, before, after } ขนาดไฟล์ข้อมูลก่อน/หลัง (ไบต์ของ JSON) */
  function replaceInlineBlobs(list) {
    if (!isAdmin() || !list || !list.length) return null;
    var before = JSON.stringify(db).length, n = 0;
    batch('ย้ายไฟล์แนบออกจากไฟล์ข้อมูล', null, function () {
      list.forEach(function (x) {
        var o = objAt(x.path);
        if (!o || o.url !== x.url || !x.meta || !x.meta.driveItemId) return;   // ถูกแก้ระหว่างอัป — ข้าม
        withRemote(o, x.meta);
        if (!o.size && x.meta.size) o.size = x.meta.size;
        n++;
      });
      var mid = JSON.stringify(db).length;
      audit('files.migrate', null, 'ย้าย {n} ไฟล์ ลดขนาดไฟล์ข้อมูล {kb} KB', { n: n, kb: Math.round((before - mid) / 1024) });
    });
    return { n: n, before: before, after: JSON.stringify(db).length };
  }

  /* ---------- สื่อฝัง ----------
   * project.embeds = [{ id, name, url (ลิงก์ที่ผู้ใช้วาง), src (ลิงก์ฝังที่แปลงแล้ว), host, by, at }] ≤ 20
   * ฝังได้เฉพาะโฮสต์ในรายการ แปลงลิงก์แชร์ปกติเป็นลิงก์ฝังให้เมื่อรู้รูปแบบ */
  var EMBED_HOSTS = [
    { id: 'gdocs', label: 'Google Docs/Sheets/Slides', re: /^https:\/\/docs\.google\.com\// },
    { id: 'gdrive', label: 'Google Drive', re: /^https:\/\/drive\.google\.com\// },
    { id: 'figma', label: 'Figma', re: /^https:\/\/(www\.)?figma\.com\// },
    { id: 'miro', label: 'Miro', re: /^https:\/\/miro\.com\// },
    { id: 'loom', label: 'Loom', re: /^https:\/\/(www\.)?loom\.com\// },
    { id: 'youtube', label: 'YouTube', re: /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)\// },
    { id: 'm365', label: 'Microsoft 365 / SharePoint', re: /^https:\/\/([a-z0-9-]+\.sharepoint\.com|[a-z0-9-]+-my\.sharepoint\.com|onedrive\.live\.com|1drv\.ms|[a-z0-9-]+\.officeapps\.live\.com|forms\.office\.com|view\.officeapps\.live\.com)\// }
  ];
  var EMBED_MAX = 20;
  /** { ok, src, host } หรือ { ok: false, reason } — reason: invalid | https | host */
  function embedSrc(raw) {
    var u = String(raw || '').trim();
    var m = /<iframe[^>]+src=["']([^"']+)["']/i.exec(u);       // วางโค้ด <iframe> มาทั้งก้อนก็ได้
    if (m) u = m[1].replace(/&amp;/g, '&');
    if (!/^[a-z]+:\/\//i.test(u)) u = 'https://' + u;
    var url;
    try { url = new URL(u); } catch (e) { return { ok: false, reason: 'invalid' }; }
    if (url.protocol !== 'https:') return { ok: false, reason: 'https' };
    var s = url.href;
    var host = EMBED_HOSTS.filter(function (h) { return h.re.test(s); })[0];
    if (!host) return { ok: false, reason: 'host' };
    var g;
    if (host.id === 'youtube') {
      var vid = url.hostname === 'youtu.be' ? url.pathname.slice(1) : (url.searchParams.get('v') || ((/\/(embed|shorts|live)\/([\w-]+)/.exec(url.pathname) || [])[2]));
      if (!vid) return { ok: false, reason: 'invalid' };
      s = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(vid.replace(/[^\w-]/g, ''));
    } else if (host.id === 'loom') {
      s = s.replace('/share/', '/embed/');
    } else if (host.id === 'figma') {
      if (url.hostname !== 'www.figma.com' || url.pathname.indexOf('/embed') !== 0) s = 'https://www.figma.com/embed?embed_host=orbit&url=' + encodeURIComponent(url.href);
    } else if (host.id === 'miro') {
      g = /\/app\/board\/([^/?#]+)/.exec(url.pathname);
      if (g) s = 'https://miro.com/app/live-embed/' + g[1] + '/';
    } else if (host.id === 'gdocs') {
      g = /^\/(document|spreadsheets|presentation|forms)\/d\/(e\/)?([\w-]+)/.exec(url.pathname);
      if (g && !/\/(preview|embed|pubhtml|viewform)/.test(url.pathname)) {
        s = g[1] === 'presentation' ? 'https://docs.google.com/presentation/d/' + (g[2] || '') + g[3] + '/embed'
          : g[1] === 'forms' ? 'https://docs.google.com/forms/d/' + (g[2] || '') + g[3] + '/viewform?embedded=true'
          : 'https://docs.google.com/' + g[1] + '/d/' + (g[2] || '') + g[3] + '/preview';
      }
    } else if (host.id === 'gdrive') {
      g = /\/file\/d\/([\w-]+)/.exec(url.pathname);
      if (g) s = 'https://drive.google.com/file/d/' + g[1] + '/preview';
    } else if (host.id === 'm365') {
      /* ลิงก์แชร์ของ SharePoint/OneDrive แบบ Doc.aspx เปิดฝังได้ด้วย action=embedview */
      if (/\/_layouts\/15\/(Doc|WopiFrame)\.aspx/i.test(url.pathname)) {
        url.searchParams.set('action', 'embedview');
        s = url.href;
      }
    }
    return { ok: true, src: s, host: host.id, hostLabel: host.label };
  }
  function projectEmbeds(pid) { var p = project(pid); return p ? (p.embeds || []) : []; }
  function addEmbed(pid, name, raw) {
    var p = project(pid);
    if (!p || !can('structure') || !canInProject(pid, 'edit')) return { ok: false, reason: 'perm' };
    var e = embedSrc(raw);
    if (!e.ok) return e;
    if ((p.embeds || []).length >= EMBED_MAX) return { ok: false, reason: 'max' };
    snapshot('เพิ่มสื่อฝัง');
    p.embeds = p.embeds || [];
    var x = { id: uid('em'), name: String(name || '').trim().slice(0, 120) || e.hostLabel, url: String(raw).trim().slice(0, 2000), src: e.src.slice(0, 2000),
      host: e.host, by: db.currentUserId, at: new Date().toISOString() };
    p.embeds.push(x);
    commit();
    return { ok: true, embed: x };
  }
  function removeEmbed(pid, id) {
    var p = project(pid);
    if (!p || !can('structure') || !canInProject(pid, 'edit')) return false;
    if (!(p.embeds || []).some(function (x) { return x.id === id; })) return false;
    snapshot('ลบสื่อฝัง');
    p.embeds = p.embeds.filter(function (x) { return x.id !== id; });
    commit();
    return true;
  }
  function renameEmbed(pid, id, name) {
    var p = project(pid), x = p && (p.embeds || []).filter(function (y) { return y.id === id; })[0];
    if (!x || !can('structure') || !canInProject(pid, 'edit') || !String(name || '').trim()) return false;
    snapshot('แก้สื่อฝัง');
    x.name = String(name).trim().slice(0, 120);
    commit();
    return true;
  }

  var X4B3 = {
    withRemote: withRemote, attImgSrc: attImgSrc, inlineBlobs: inlineBlobs, replaceInlineBlobs: replaceInlineBlobs,
    EMBED_HOSTS: EMBED_HOSTS, EMBED_MAX: EMBED_MAX, embedSrc: embedSrc, projectEmbeds: projectEmbeds,
    addEmbed: addEmbed, removeEmbed: removeEmbed, renameEmbed: renameEmbed
  };
  Object.keys(X4B3).forEach(function (k) { global.Store[k] = X4B3[k]; });

  /* ====================== Sprint 2B — การแจ้งเตือน ศูนย์อนุมัติ การติดตามโปรเจกต์ ======================
   *
   * ผลทดสอบกับผู้ใช้: กล่องแจ้งเตือน "เสียงดังแต่อ่านไม่รู้เรื่อง" และหางานรออนุมัติไม่เจอ
   * การกระทำเดียวได้หลายรายการ (มอบหมาย + ตั้งวัน + แก้รายละเอียด = 3, ส่งฟอร์ม = 3, ขออนุมัติ = 5)
   *
   * รูปข้อมูลที่เพิ่ม (SCHEMA 19) ทุกช่องไม่บังคับ ไม่มี = แบบเดิม
   *   notification.more        [{ key, params, kind, story?, ref?, x? }] ส่วนที่รวมเข้ามาในรายการเดียวกัน
   *                             (คนเดียวกัน งานเดียวกัน ภายใน 10 นาที ยังไม่ได้อ่าน) ส่วนแรกคือ key/params/kind เดิม
   *   notification.x           ส่วนแรกเกิดซ้ำกี่ครั้ง (แสดงความเห็นสองครั้ง = 2)
   *   notification.story       ความเห็นที่ทำให้เกิดรายการนี้ — โชว์เนื้อหาและพาไปที่ความเห็น
   *   notification.ref         รายการในประวัติสถานะ (ps_…) — โชว์สถานะกับบรรทัดแรก
   *   notification.snoozeUntil ISO|null เลื่อนเตือน ซ่อนจนถึงเวลานั้น (migrate เติม null)
   *   notification.wokeAt      เวลาที่กลับมาจากการเลื่อน ใช้เรียงขึ้นบนสุด
   *   user.prefs.projNotify[pid].milestones  หมุดหมายสำเร็จ (ส่วนหนึ่งของ "ติดตามโปรเจกต์")
   *   user.prefs.pfFollow[pfId]  ติดตามพอร์ตโฟลิโอ (ไม่เคยตั้ง = เจ้าของติดตาม คนอื่นไม่)
   *
   * ทุกอย่างในบล็อกนี้เป็น function declaration เพราะ hydrate() (ซึ่งเรียก migrate/seed) รันก่อนถึงบรรทัดนี้ */

  function migrate2b(d) {
    d.notifications = (d.notifications || []).filter(function (n) { return !!n && typeof n === 'object'; });
    d.notifications.forEach(function (n) {
      if (!('snoozeUntil' in n)) n.snoozeUntil = null;
      if ('more' in n && !Array.isArray(n.more)) delete n.more;
      /* รายการ "พูดถึงคุณในความเห็น" ของข้อมูลตัวอย่างรุ่นเก่าเก็บเป็นประโยคตามภาษาตอนสร้าง (ไทยหรืออังกฤษ)
       * แปลงเป็นคีย์ + คนทำ จะได้แปลตามภาษาคนอ่าน (ไม่ขึ้น "Somchai mentioned you in a comment" ในหน้าภาษาไทย) */
      var m = !n.key && /^(.+?) (พูดถึงคุณในความเห็น|mentioned you in a comment)$/.exec(String(n.text || ''));
      var who = m && (d.users || []).filter(function (u) { return u && u.name === m[1]; })[0];
      if (who) {
        n.key = 'พูดถึงคุณในความเห็น'; n.params = null; n.kind = n.kind || 'mention';
        n.actorId = who.id; n.actorName = who.name;
        var cm = (d.stories || []).filter(function (s) {
          return s && s.type === 'comment' && s.taskId === n.taskId && s.actorId === who.id;
        })[0];
        if (cm && !n.story) n.story = cm.id;
      }
    });
  }

  /** ค่าเริ่มต้นของชนิดการแจ้งเตือนเมื่อผู้ใช้ไม่เคยตั้ง — ชนิดที่ def: false ปิดไว้ก่อน */
  function kindDefault(kind) {
    for (var i = 0; i < NOTIFY_KINDS.length; i++) {
      if (NOTIFY_KINDS[i].id === kind) return NOTIFY_KINDS[i].def !== false;
    }
    return true;
  }

  /** บันทึกความเคลื่อนไหวบางคีย์แจ้งเป็นชนิดของตัวเอง (ปิดแยกได้) ที่เหลือเป็น activity */
  function logKind(key) {
    return ({ 'บันทึกเวลา {v}': 'timelog', 'ตั้งเวลาประมาณเป็น {v}': 'timelog', 'ล้างเวลาประมาณ': 'timelog' })[key] || 'activity';
  }

  function isSnoozed(n, now) {
    return !!(n && n.snoozeUntil && Date.parse(n.snoozeUntil) > (now || Date.now()));
  }

  /** เวลาที่ใช้เรียง — รายการที่เพิ่งกลับจากการเลื่อนเตือนนับเป็นของใหม่ */
  function notifAt(n) {
    return n.wokeAt && n.wokeAt > n.createdAt ? n.wokeAt : n.createdAt;
  }

  /** ทุกส่วนของรายการ (ส่วนแรก = ช่องเดิมของรายการ ตามด้วย more) */
  function notifParts(n) {
    var head = { key: n.key || null, params: n.params || null, kind: n.kind || null };
    if (!n.key) head.text = n.text;            // ข้อมูลเก่าที่เก็บเป็นประโยค
    if (n.story) head.story = n.story;
    if (n.ref) head.ref = n.ref;
    if (n.x > 1) head.x = n.x;
    return [head].concat(Array.isArray(n.more) ? n.more : []);
  }

  function notifKinds(n) {
    return notifParts(n).map(function (p) { return p.kind; });
  }

  /**
   * ทางเดียวที่การแจ้งเตือนเข้า db.notifications (notify / notifyOnly / เตือนกำหนดส่ง)
   *
   * ไม่แจ้งคนที่เป็นคนทำเอง และรวมเข้ากับรายการเดิมเมื่อ "คนเดียวกันทำกับงานเดียวกันภายใน 10 นาที"
   * และผู้รับยังไม่ได้อ่าน — สมชายมอบหมาย ตั้งวัน แก้รายละเอียด ได้บรรทัดเดียว
   * "สมชาย มอบหมายงาน … ให้คุณ · ตั้งกำหนดส่ง 4 ธ.ค. · แก้ไขรายละเอียด"
   * อ่านไปแล้ว/เก็บไปแล้ว = เริ่มรายการใหม่ ไม่ปลุกของที่เคลียร์แล้วให้กลับมาพร้อมของเก่า
   */
  function pushNotif(rec) {
    if (!rec || !rec.userId) return null;
    if (rec.actorId && rec.actorId === rec.userId) return null;
    var now = new Date().toISOString();
    var part = { key: rec.key || null, params: rec.params || null, kind: rec.kind || null };
    if (rec.story) part.story = rec.story;
    if (rec.ref) part.ref = rec.ref;
    var g = (rec.taskId && rec.actorId && part.key && !rec.dedupe && rec.kind !== 'access')
      ? notifGroupTarget(rec, now) : null;
    if (g) { mergeNotif(g, part, now); return g; }
    var n = {
      id: uid('n'), userId: rec.userId, taskId: rec.taskId || null, projectId: rec.projectId || null,
      route: rec.route || null, text: rec.text != null ? rec.text : fill(part.key || '', part.params),
      kind: part.kind, key: part.key, params: part.params,
      actorName: rec.actorName || null, actorId: rec.actorId || null, bookmarked: false,
      createdAt: now, read: false, archived: false, snoozeUntil: null
    };
    if (rec.dedupe) n.dedupe = rec.dedupe;
    if (part.story) n.story = part.story;
    if (part.ref) n.ref = part.ref;
    db.notifications.push(n);
    return n;
  }

  /** รายการเดิมที่ควรรวมด้วย — ไล่จากท้าย (ใหม่สุด) ไม่เกิน 400 รายการ */
  function notifGroupTarget(rec, nowIso) {
    var cutoff = Date.parse(nowIso) - 10 * 60000;
    var list = db.notifications;
    for (var i = list.length - 1, k = 0; i >= 0 && k < 400; i--, k++) {
      var n = list[i];
      if (!n || n.userId !== rec.userId || n.taskId !== rec.taskId || n.actorId !== rec.actorId) continue;
      if (n.read || n.archived || n.dedupe || n.snoozeUntil || !n.key || n.kind === 'access') continue;
      if ((n.more || []).length >= 11) continue;          // ยาวเกินอ่านในบรรทัดเดียว เริ่มรายการใหม่
      if (Date.parse(n.createdAt) < cutoff) continue;
      return n;
    }
    return null;
  }

  function mergeNotif(n, part, nowIso) {
    var same = JSON.stringify(part.params || null);
    var parts = [], prev = null;
    notifParts(n).forEach(function (p) {
      /* ข้อความเดียวกันค่าเดียวกัน (แสดงความเห็นอีกครั้ง แก้รายละเอียดอีกรอบ) = นับเพิ่ม เก็บอันล่าสุด
       * ความเห็นอันล่าสุดจะเป็นอันที่โชว์และพาไป */
      if (p.key === part.key && JSON.stringify(p.params || null) === same) prev = p;
      else parts.push(p);
    });
    if (prev) part.x = (prev.x || 1) + 1;
    parts.push(part);
    /* ได้รับมอบหมายแล้ว ไม่ต้องบอกอีกว่า "สร้างงานนี้" (เรื่องเดียวกัน คนรับงานสนใจแค่ว่ามีงานเข้า) */
    if (parts.some(function (p) { return p.kind === 'assigned'; })) {
      parts = parts.filter(function (p) { return p.key !== 'สร้างงานนี้'; });
    }
    /* ส่วนที่สำคัญที่สุดขึ้นหน้า (พูดถึง > มอบหมาย/ขออนุมัติ > ผลอนุมัติ > ความเห็น > ความเคลื่อนไหว)
     * เท่ากันคงลำดับเวลา — ตัวกรอง "มอบหมายให้ฉัน" "@พูดถึงฉัน" ดูทุกส่วนอยู่แล้ว (notifKinds) */
    parts = parts.map(function (p, i) { return { p: p, i: i }; }).sort(function (a, b) {
      return ((INBOX_RANK[b.p.kind] || 0) - (INBOX_RANK[a.p.kind] || 0)) || (a.i - b.i);
    }).map(function (x) { return x.p; });
    var head = parts[0];
    n.key = head.key; n.params = head.params || null; n.kind = head.kind || null;
    n.text = fill(head.key || '', head.params);
    if (head.story) n.story = head.story; else delete n.story;
    if (head.ref) n.ref = head.ref; else delete n.ref;
    if (head.x > 1) n.x = head.x; else delete n.x;
    var rest = parts.slice(1).map(function (p) {
      var o = { key: p.key, params: p.params || null, kind: p.kind || null };
      if (p.story) o.story = p.story;
      if (p.ref) o.ref = p.ref;
      if (p.x > 1) o.x = p.x;
      return o;
    });
    if (rest.length) n.more = rest; else delete n.more;
    n.createdAt = nowIso;                      // ขึ้นบนสุดอีกครั้ง
    n.read = false;
  }

  /** หมุดหมายสำเร็จ — แจ้งคนที่ติดตามโปรเจกต์ (เปิด "หมุดหมายสำเร็จ") ไม่ commit */
  function notifyMilestone(t) {
    (index().memByTask[t.id] || []).forEach(function (m) {
      var p = project(m.projectId);
      if (!p) return;
      var w = projectWatchers(p.id, 'milestones');
      if (w.length) notifyOnly(t.id, w, 'ทำหมุดหมาย “{t}” ของ {p} สำเร็จ', 'milestone', { t: t.name, p: p.name });
    });
  }

  /* ---------- อ่าน/เก็บทีละกลุ่ม (แถวที่รวมหลายรายการของงานเดียวกัน) ---------- */

  function setNotifsRead(ids, read) {
    var list = (ids || []).map(notification).filter(function (n) { return n && n.read !== !!read; });
    if (!list.length) return 0;
    list.forEach(function (n) { n.read = !!read; });
    commit();
    return list.length;
  }

  function archiveNotifs(ids) {
    var list = (ids || []).map(notification).filter(function (n) { return n && !n.archived; });
    if (!list.length) return 0;
    snapshot('เก็บการแจ้งเตือน');
    list.forEach(function (n) { n.archived = true; n.read = true; });
    commit();
    return list.length;
  }

  /* ---------- เลื่อนเตือน ----------
   * ไม่มีเซิร์ฟเวอร์ตั้งเวลา — main.js เรียก wakeSnoozed() ตอนเปิดแอปและทุกนาทีที่เปิดค้างไว้
   * ระหว่างนั้นรายการถูกซ่อนด้วยเวลาอยู่แล้ว (isSnoozed) ถึงเวลาแล้วยังไม่ถูกปลุกก็โผล่ตามปกติ */

  /** เวลาที่เลือกได้ — 1 ชม. / พรุ่งนี้ 9:00 / สัปดาห์หน้า (จันทร์ 9:00) */
  function snoozeChoices(from) {
    var now = from ? new Date(from) : new Date();
    var hour = new Date(now.getTime() + 3600000);
    var tm = new Date(now); tm.setDate(tm.getDate() + 1); tm.setHours(9, 0, 0, 0);
    var wk = new Date(now); wk.setDate(wk.getDate() + (((8 - wk.getDay()) % 7) || 7)); wk.setHours(9, 0, 0, 0);
    return [
      { id: 'hour', label: 'อีก 1 ชั่วโมง', at: hour.toISOString() },
      { id: 'tomorrow', label: 'พรุ่งนี้ 9:00', at: tm.toISOString() },
      { id: 'week', label: 'สัปดาห์หน้า (จันทร์ 9:00)', at: wk.toISOString() }
    ];
  }

  function snoozeNotifs(ids, untilIso) {
    var at = Date.parse(untilIso);
    var list = (ids || []).map(notification).filter(Boolean);
    if (!list.length || !(at > Date.now())) return 0;
    snapshot('เลื่อนเตือน');
    list.forEach(function (n) { n.snoozeUntil = new Date(at).toISOString(); });
    commit();
    return list.length;
  }

  function unsnoozeNotifs(ids) {
    var list = (ids || []).map(notification).filter(function (n) { return n && n.snoozeUntil; });
    if (!list.length) return 0;
    snapshot('เลิกเลื่อนเตือน');
    var now = new Date().toISOString();
    list.forEach(function (n) { n.snoozeUntil = null; n.wokeAt = now; });
    commit();
    return list.length;
  }

  /** รายการของฉันที่ถึงเวลาแล้ว กลับมาเป็นยังไม่อ่านและขึ้นบนสุด @returns จำนวน */
  function wakeSnoozed() {
    var me0 = db && db.currentUserId;
    if (!me0) return 0;
    var now = Date.now(), iso = new Date(now).toISOString(), n = 0;
    db.notifications.forEach(function (x) {
      if (x.userId !== me0 || !x.snoozeUntil || Date.parse(x.snoozeUntil) > now) return;
      x.snoozeUntil = null; x.read = false; x.wokeAt = iso; n++;
    });
    if (n) commit();
    return n;
  }

  function snoozedCount(userId) {
    var who = userId || db.currentUserId;
    return db.notifications.filter(function (n) {
      return n.userId === who && !n.archived && isSnoozed(n) && notifVisible(n);
    }).length;
  }

  /* ---------- ศูนย์อนุมัติ "รออนุมัติจากฉัน" ----------
   * งานขออนุมัติที่ฉันเป็นผู้อนุมัติ (ผู้รับผิดชอบ) ยังรออนุมัติ — ขอแก้ไขแล้วไม่นับ เพราะรอคนขอส่งกลับมา
   * ครบกำหนดก่อนขึ้นก่อน ไม่มีกำหนดตามลำดับที่ขอเข้ามา */
  function approvalsWaiting(userId) {
    var who = userId || db.currentUserId;
    return db.tasks.filter(function (t) {
      return t.type === 'approval' && !t.completed && t.assigneeId === who &&
        (t.approval || 'pending') === 'pending' && canSeeTask(t.id);
    }).sort(function (a, b) {
      var x = a.dueOn || '9999-99-99', y = b.dueOn || '9999-99-99';
      if (x !== y) return x < y ? -1 : 1;
      var p = String(a.assignedAt || a.createdAt || ''), q = String(b.assignedAt || b.createdAt || '');
      return p < q ? -1 : p > q ? 1 : 0;
    });
  }

  /** คนขออนุมัติ = คนที่มอบงานให้ผู้อนุมัติ (ไม่รู้ = คนสร้างงาน) */
  function approvalRequester(t) {
    return user(t.assignedBy) || user(t.createdBy) || null;
  }

  /* ---------- ติดตามโปรเจกต์ / พอร์ตโฟลิโอ ----------
   * ติดตามโปรเจกต์ = เปิดสามหัวข้อในการแจ้งเตือนของโปรเจกต์พร้อมกัน (อัปเดตสถานะ งานใหม่ หมุดหมายสำเร็จ)
   * ใช้ค่าชุดเดิม (prefs.projNotify) ไม่มีที่เก็บใหม่ ปรับละเอียดทีละหัวข้อได้ที่ ⋯ → การแจ้งเตือนของโปรเจกต์นี้ */
  function projFollowing(projectId, userId) {
    var x = projNotifyOf(projectId, userId);
    return !!(x.status && x.newTasks && x.milestones);
  }

  function setProjFollow(projectId, on) {
    var u = me();
    if (!u || !project(projectId) || !projectAccess(projectId)) return false;
    u.prefs = u.prefs || {};
    u.prefs.projNotify = u.prefs.projNotify || {};
    var cur = u.prefs.projNotify[projectId] || {};
    cur.status = !!on; cur.newTasks = !!on; cur.milestones = !!on;
    u.prefs.projNotify[projectId] = cur;
    commit();
    return true;
  }

  function projFollowers(projectId) {
    return db.users.filter(function (u) {
      return u.active !== false && !!projectAccess(projectId, u.id) && projFollowing(projectId, u.id);
    });
  }

  function pfFollowing(pfId, userId) {
    var u = user(userId || db.currentUserId), f = portfolio(pfId);
    if (!u || !f) return false;
    var m = u.prefs && u.prefs.pfFollow;
    if (m && Object.prototype.hasOwnProperty.call(m, pfId)) return !!m[pfId];
    return f.owner === u.id;          // เดิมแจ้งเจ้าของอยู่แล้ว คงพฤติกรรมนั้นเป็นค่าเริ่มต้น
  }

  function setPfFollow(pfId, on) {
    var u = me();
    if (!u || !portfolio(pfId) || !isActive()) return false;
    u.prefs = u.prefs || {};
    u.prefs.pfFollow = u.prefs.pfFollow || {};
    u.prefs.pfFollow[pfId] = !!on;
    commit();
    return true;
  }

  function pfFollowers(pfId) {
    return db.users.filter(function (u) {
      return u.active !== false && u.role !== 'guest' && pfFollowing(pfId, u.id);
    });
  }

  /** คนที่ต้องได้ยินเรื่องสถานะของพอร์ตโฟลิโอ (ไม่รวมคนที่ทำเอง) */
  function pfWatchers(pfId) {
    return pfFollowers(pfId).map(function (u) { return u.id; })
      .filter(function (id) { return id !== db.currentUserId; });
  }

  var X2B = {
    notifParts: notifParts, notifKinds: notifKinds, isSnoozed: isSnoozed, notifAt: notifAt,
    setNotifsRead: setNotifsRead, archiveNotifs: archiveNotifs,
    snoozeChoices: snoozeChoices, snoozeNotifs: snoozeNotifs, unsnoozeNotifs: unsnoozeNotifs,
    wakeSnoozed: wakeSnoozed, snoozedCount: snoozedCount, wantsNotify: wantsNotify,
    approvalsWaiting: approvalsWaiting, approvalRequester: approvalRequester,
    projFollowing: projFollowing, setProjFollow: setProjFollow, projFollowers: projFollowers,
    pfFollowing: pfFollowing, setPfFollow: setPfFollow, pfFollowers: pfFollowers
  };
  Object.keys(X2B).forEach(function (k) { global.Store[k] = X2B[k]; });

})(window);

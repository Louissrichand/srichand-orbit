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
  var SCHEMA = 10;

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
    { id: 'number', label: 'ตัวเลข',        icon: 'hash' }
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
      parentId: attrs.parentId || null,
      tags: attrs.tags || [],
      followers: attrs.followers || (attrs.assigneeId ? [attrs.assigneeId] : []),
      likes: attrs.likes || [],
      dependsOn: attrs.dependsOn || [],
      attachments: attrs.attachments || [],
      recur: attrs.recur || null,
      coverId: attrs.coverId || null,
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
        by: 'u_me', at: t
      },
      rules: [
        { id: 'r_done', whenSection: 's_l4', setCompleted: true,
          setAssignee: null, setPriority: null, addTag: '' }
      ],
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
      status: null, rules: [], savedViews: []
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
      fields: [], status: null, rules: [], savedViews: []
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

    stories.push({
      id: uid('st'), taskId: byName[L('สรุปแนวทางแบรนด์ให้ทีมดีไซน์')].id,
      actorId: 'u_nan', type: 'comment',
      text: L('ขอไฟล์โลโก้เวอร์ชัน vector ด้วยนะครับ @ฉัน'),
      createdAt: new Date().toISOString()
    });
    notifications.push({
      id: uid('n'), userId: 'u_me',
      taskId: byName[L('สรุปแนวทางแบรนด์ให้ทีมดีไซน์')].id,
      text: L('สมชาย พูดถึงคุณในความเห็น'),
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
        p.rules = p.rules || [];
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
      p.statusLog = p.statusLog || [];
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
    /* v9 — งานของฉันแบบมีเซกชัน กล่องข้อความแบบบุ๊กมาร์ก หน้าแรกที่จัดเองได้
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
    prunePersonal(d);
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
  function commit() {
    dropIndex();          // ข้อมูลเปลี่ยนแล้ว ดัชนีเก่าใช้ไม่ได้
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
    function fieldText(t, f) {
      var v = fieldValue(t.id, f.id);
      if (v === null || v === undefined || v === '') return '';
      if (f.type === 'number') return formatNumber(f, v);
      if (f.type === 'multi') return [].concat(v).join(' · ');
      if (f.type === 'person') { var pu = user(v); return pu ? pu.name : ''; }
      return String(v);
    }
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
      ].concat(fields.map(function (f) { return fieldText(t, f); })).map(csvCell).join(','));
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
    var p = project(projectId);
    if (!p) throw new Error('ไม่พบโปรเจกต์');
    var rows = parseCsv(text);
    if (rows.length < 2) throw new Error('ไฟล์ว่างหรือไม่มีบรรทัดข้อมูล');

    var head = rows[0];
    var iName  = colIndex(head, ['Name', 'Task Name', 'ชื่องาน']);
    if (iName < 0) throw new Error('ไม่พบคอลัมน์ Name');
    var iSec   = colIndex(head, ['Section/Column', 'Section', 'คอลัมน์']);
    var iAss   = colIndex(head, ['Assignee', 'ผู้รับผิดชอบ']);
    var iMail  = colIndex(head, ['Assignee Email']);
    var iStart = colIndex(head, ['Start Date', 'วันเริ่ม']);
    var iDue   = colIndex(head, ['Due Date', 'กำหนดส่ง']);
    var iPrio  = colIndex(head, ['Priority', 'ความสำคัญ']);
    var iType  = colIndex(head, ['Type', 'ชนิดงาน']);
    var iTags  = colIndex(head, ['Tags', 'แท็ก']);
    var iNotes = colIndex(head, ['Notes', 'Description', 'รายละเอียด']);

    snapshot('นำเข้างานจาก CSV');

    var byName = {}, byMail = {};
    db.users.forEach(function (u) {
      byName[u.name.trim().toLowerCase()] = u.id;
      if (u.email) byMail[u.email.trim().toLowerCase()] = u.id;
    });
    var secByName = {};
    p.sections.forEach(function (s) { secByName[s.name.trim().toLowerCase()] = s.id; });

    function cell(r, i) { return i >= 0 && r[i] != null ? String(r[i]).trim() : ''; }
    function isoOrNull(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }

    var made = 0, newSections = 0;
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var name = cell(row, iName);
      if (!name) continue;

      var secId = p.sections[0].id;
      var secLabel = cell(row, iSec);
      if (secLabel) {
        var key = secLabel.toLowerCase();
        if (!secByName[key]) {
          var ns = { id: uid('s'), name: secLabel };
          p.sections.push(ns);
          secByName[key] = ns.id;
          newSections++;
        }
        secId = secByName[key];
      }

      var who = byMail[cell(row, iMail).toLowerCase()] ||
                byName[cell(row, iAss).toLowerCase()] || null;
      var prio = cell(row, iPrio).toLowerCase();
      if (['urgent', 'high', 'medium', 'low'].indexOf(prio) < 0) prio = 'none';
      var type = cell(row, iType).toLowerCase();
      if (['task', 'milestone', 'approval'].indexOf(type) < 0) type = 'task';

      var t = blankTask({
        name: name,
        notes: cell(row, iNotes),
        assigneeId: who,
        startOn: isoOrNull(cell(row, iStart)),
        dueOn: isoOrNull(cell(row, iDue)),
        priority: prio,
        type: type,
        tags: cell(row, iTags) ? cell(row, iTags).split(/[·,;]/).map(function (s) {
          return s.trim();
        }).filter(Boolean) : [],
        createdBy: db.currentUserId
      });
      db.tasks.push(t);
      db.memberships.push({
        id: uid('m'), taskId: t.id, projectId: projectId,
        sectionId: secId, position: nextPosition(projectId, secId)
      });
      made++;
    }

    audit('project.import', p.name, 'นำเข้า {n} งาน', { n: made });
    commit();
    return { tasks: made, sections: newSections };
  }
  /* ---------- undo ---------- */

  var undoStack = [];   // อยู่ในหน่วยความจำเท่านั้น ไม่ persist

  /* label คือคีย์คำแปล ไม่ใช่ประโยคสำเร็จรูป — เก็บ params แยกไว้
   * เพื่อให้ข้อความ "ย้อนกลับแล้ว: …" แปลตามภาษาที่คนอ่านตั้งไว้ ไม่ใช่ภาษาตอนที่กด */
  function snapshot(label, params) {
    undoStack.push({ label: label, params: params || null, data: JSON.stringify(db) });
    if (undoStack.length > 25) undoStack.shift();
  }

  function undo() {
    var s = undoStack.pop();
    if (!s) return null;
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
      pmByProject: {}, access: {}
    };
    db.users.forEach(function (u) { i.user[u.id] = u; });
    db.projects.forEach(function (p) { i.project[p.id] = p; });
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
  function search(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) return [];
    var i = index();
    var hits = [];

    db.tasks.forEach(function (t) {
      var name = t.name.toLowerCase();
      var score = 0;
      if (name === q) score = 100;
      else if (name.indexOf(q) === 0) score = 80;
      else if (name.indexOf(q) >= 0) score = 60;

      if (!score && plainText(t.notes, true).toLowerCase().indexOf(q) >= 0) score = 30;
      if (!score) {
        var u = i.user[t.assigneeId];
        if (u && u.name.toLowerCase().indexOf(q) >= 0) score = 25;
      }
      if (!score && (t.tags || []).some(function (g) {
        return String(g).toLowerCase().indexOf(q) >= 0;
      })) score = 22;
      if (!score && (i.memByTask[t.id] || []).some(function (m) {
        var p = i.project[m.projectId];
        return p && p.name.toLowerCase().indexOf(q) >= 0;
      })) score = 15;

      if (!score) return;
      if (!canSeeTask(t.id)) return;
      if (t.completed) score -= 40;
      hits.push({ t: t, s: score });
    });

    return hits
      .sort(function (a, b) {
        if (b.s !== a.s) return b.s - a.s;
        return (a.t.dueOn || '9999') < (b.t.dueOn || '9999') ? -1 : 1;
      })
      .slice(0, 60)
      .map(function (x) { return x.t; });
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

  /** จำนวนงานที่ยังไม่เสร็จและใกล้ครบกำหนดในโปรเจกต์ ใช้บนการ์ดหน้าแรก */
  function dueSoonCount(projectId) {
    var lim = addDays(today(), 7), n = 0;
    tasksInProject(projectId).forEach(function (x) {
      if (!x.task.completed && x.task.dueOn && x.task.dueOn <= lim) n++;
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
   * งานของฉัน (เซกชัน ลำดับ มุมมอง) หน้าแรก (วิดเจ็ต) กล่องข้อความ (เรียง ความหนาแน่น)
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
             show: 'open', due: 'any', project: '', cal: 'week' };
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
      notepad: '', pv: {}, cal: null
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
    { id: 'mine',     label: 'งานของฉัน',          icon: 'checkCircle' },
    { id: 'assigned', label: 'งานที่ฉันมอบหมาย',   icon: 'users' },
    { id: 'projects', label: 'โปรเจกต์ล่าสุด',     icon: 'grid' },
    { id: 'people',   label: 'คนที่ทำงานด้วย',      icon: 'users' },
    { id: 'status',   label: 'อัปเดตสถานะ',        icon: 'flag' },
    { id: 'notepad',  label: 'สมุดโน้ตส่วนตัว',     icon: 'note' },
    { id: 'drafts',   label: 'ร่างความเห็น',        icon: 'pencil' },
    { id: 'stats',    label: 'สถิติงานเสร็จ',       icon: 'chart' },
    { id: 'activity', label: 'กิจกรรมล่าสุด',       icon: 'bell' }
  ];
  var HOME_DEFAULT = [
    { w: 'mine', full: false }, { w: 'projects', full: false },
    { w: 'assigned', full: false }, { w: 'activity', full: false }
  ];

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

  /* ---------- กล่องข้อความ ---------- */

  /** การแจ้งเตือนของงานที่เห็นไม่ได้แล้ว (งานส่วนตัวของคนอื่น โปรเจกต์ปิดที่ถูกเอาออก) ไม่แสดง */
  function notifVisible(n) {
    if (!n.taskId || !task(n.taskId)) return true;
    return n.userId !== db.currentUserId || canSeeTask(n.taskId);
  }

  function inbox(userId, showArchived) {
    return db.notifications
      .filter(function (n) {
        return n.userId === userId && (showArchived ? n.archived : !n.archived) && notifVisible(n);
      })
      .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
  }

  function unreadCount(userId) {
    return db.notifications.filter(function (n) {
      return n.userId === userId && !n.archived && !n.read && notifVisible(n);
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

  var INBOX_RANK = { mention: 50, assigned: 45, approval: 40, unblock: 35, overdue: 30, due: 28,
                     comment: 20, message: 15, status: 15, newtask: 10, activity: 0 };

  /**
   * รายการในกล่องข้อความ
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
      if (tab === 'bookmarks') { if (!n.bookmarked) return false; }
      else if (tab === 'archive') { if (!n.archived) return false; }
      else if (n.archived) return false;
      if (opts.unread && n.read) return false;
      if (opts.mention && n.kind !== 'mention') return false;
      if (opts.toMe && n.kind !== 'assigned') return false;
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
        return (score(b) - score(a)) || (a.createdAt < b.createdAt ? 1 : -1);
      });
    }
    return list.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
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
   * เปิดกล่องข้อความดูเองเมื่อไรก็เห็นครบ ไม่มีอะไรหาย */
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
    { id: 'newTasks', label: 'งานใหม่ในโปรเจกต์',    desc: 'ทุกครั้งที่มีงานถูกเพิ่มเข้าโปรเจกต์นี้' }
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
      newTasks: !!p.newTasks
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
    var w = projectWatchers(projectId, 'newTasks');
    if (w.length) notifyOnly(t.id, w, 'งานใหม่ “{t}” ใน {p}', 'newtask', { t: t.name, p: p.name });
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
    { id: 'section',  label: 'คอลัมน์' },
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
    { id: 'files',     label: 'ไฟล์',     icon: 'paperclip',  desc: 'ไฟล์แนบทุกชิ้นในโปรเจกต์รวมไว้ที่เดียว' }
  ];

  /* ---------- ประกาศของโปรเจกต์ ----------
   *
   * ความเห็นต้องเกาะอยู่กับงานเสมอ แต่บางเรื่องไม่ได้เป็นของงานชิ้นไหนเลย
   * เช่น สรุปประชุมประจำสัปดาห์ หรือประกาศเลื่อนกำหนดทั้งโปรเจกต์
   * เดิมของพวกนี้ต้องไปแปะไว้ในงานสักชิ้นแบบฝืน ๆ แล้วก็หาไม่เจอในภายหลัง
   */
  function projectMessages(projectId) {
    var p = project(projectId);
    return ((p && p.messages) || []).slice().reverse();   // ใหม่สุดก่อน
  }

  function addProjectMessage(projectId, title, body) {
    var p = project(projectId);
    if (!p || !body || !body.trim()) return null;
    snapshot('ประกาศในโปรเจกต์');
    p.messages = p.messages || [];
    var m = {
      id: uid('pm'), title: (title || '').trim(), body: body.trim(),
      by: db.currentUserId, at: new Date().toISOString()
    };
    p.messages.push(m);

    /* แจ้งเตือนสมาชิกที่ระบุตัวได้ (เปิดไว้เป็นค่าเริ่มต้น) กับคนที่เปิดรับประกาศของโปรเจกต์นี้เอง
     * โปรเจกต์ที่เปิดให้ทั้งองค์กรไม่มีรายชื่อ ถ้ายิงหาทุกคนจะกลายเป็นสแปมทั้งบริษัท
     * สมาชิกที่ปิดไว้ในการแจ้งเตือนของโปรเจกต์จะไม่ได้รับ */
    var mem = projectWatchers(projectId, 'messages');
    if (mem.length) {
      notifyOnly(null, mem, 'ประกาศใหม่ใน {p}', 'message', { p: p.name }, false,
        { projectId: projectId });
    }
    audit('project.message', p.name, m.title || m.body.slice(0, 40));
    commit();
    return m;
  }

  function deleteProjectMessage(projectId, msgId) {
    var p = project(projectId);
    if (!p) return false;
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
    if (!ids || !ids.length) return PROJECT_VIEWS.map(function (v) { return v.id; });
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
    { id: 'section',     label: 'คอลัมน์',       kind: 'select' },
    { id: 'priority',    label: 'ความสำคัญ',    kind: 'select' },
    { id: 'type',        label: 'ชนิดงาน',      kind: 'select' },
    { id: 'tags',        label: 'แท็ก',         kind: 'multi' },
    { id: 'due',         label: 'กำหนดส่ง',     kind: 'date' },
    { id: 'start',       label: 'วันเริ่ม',      kind: 'date' },
    { id: 'created',     label: 'วันที่สร้าง',   kind: 'date' },
    { id: 'completedOn', label: 'วันที่ทำเสร็จ', kind: 'date' },
    { id: 'modified',    label: 'แก้ไขล่าสุด',   kind: 'date' },
    { id: 'completed',   label: 'ทำเสร็จแล้ว',  kind: 'bool' },
    { id: 'blocked',     label: 'ถูกบล็อกอยู่',  kind: 'bool' },
    { id: 'name',        label: 'ชื่องาน',      kind: 'text' }
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

  /** ฟิลด์ที่กรองได้ในโปรเจกต์นี้ — ของในตัวก่อน ตามด้วยฟิลด์ที่สร้างเอง */
  function filterFields(projectId) {
    var p = project(projectId);
    var out = FILTER_BUILTIN.slice();
    ((p && p.fields) || []).forEach(function (f) {
      out.push({ id: 'field:' + f.id, label: f.name, kind: f.type, field: f, custom: true });
    });
    return out;
  }

  function filterField(projectId, fid) {
    return filterFields(projectId).filter(function (x) { return x.id === fid; })[0] || null;
  }

  /** ตัวเลือกให้ติ๊กของเงื่อนไขชนิดคน/ตัวเลือก [[ค่า, ป้าย, สี]] */
  function filterChoices(projectId, fid) {
    var p = project(projectId);
    var def = filterField(projectId, fid);
    if (!def) return [];
    if (def.kind === 'person') {
      return [[ME, 'ฉัน', null]].concat(db.users.filter(function (u) { return u.active !== false; })
        .map(function (u) { return [u.id, u.name, u.color]; }));
    }
    if (fid === 'section') return (p ? p.sections : []).map(function (s) { return [s.id, s.name, null]; });
    if (fid === 'priority') return PRIORITIES.filter(function (x) { return x.id !== 'none'; })
      .map(function (x) { return [x.id, x.label, x.color]; });
    if (fid === 'type') return TASK_TYPES.map(function (x) { return [x.id, x.label, null]; });
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
      case 'type':        return t.type || 'task';
      case 'tags':        return t.tags || [];
      case 'due':         return t.dueOn || null;
      case 'start':       return t.startOn || null;
      case 'created':     return t.createdAt ? String(t.createdAt).slice(0, 10) : null;
      case 'completedOn': return t.completedAt ? String(t.completedAt).slice(0, 10) : null;
      case 'modified':    return lastModified(t.id);
      case 'completed':   return !!t.completed;
      case 'blocked':     return !t.completed && isBlocked(t.id);
      case 'name':        return t.name;
    }
    if (fid && fid.indexOf('field:') === 0) {
      var v = fieldValue(t.id, fid.slice(6));
      return v === undefined ? null : v;
    }
    return null;
  }

  function meIs(list) {
    return [].concat(list || []).map(function (x) { return x === ME ? db.currentUserId : x; });
  }

  function condKind(fid) {
    var b = FILTER_BUILTIN.filter(function (x) { return x.id === fid; })[0];
    if (b) return b.kind;
    if (fid && fid.indexOf('field:') === 0) {
      var hit = null;
      db.projects.forEach(function (p) {
        (p.fields || []).forEach(function (f) { if ('field:' + f.id === fid) hit = f.type; });
      });
      return hit;
    }
    return null;
  }

  /** ตรงเงื่อนไขหนึ่งแถวไหม — เงื่อนไขที่ยังกรอกไม่ครบถือว่าผ่าน ไม่ซ่อนงานทั้งหมดตอนกำลังเลือกค่า */
  function matchCond(t, c, m) {
    if (!c || !c.f) return true;
    var kind = condKind(c.f);
    if (!kind) return true;                         // ฟิลด์ถูกลบไปแล้ว
    var val = taskValue(t, c.f, m);
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
      if (op === 'overdue') return !!d && d < td && !(c.f === 'due' && t.completed);
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
    { id: 'blocking',    label: 'กำลังบล็อก',    w: 190, on: false }
  ];

  /** ทุกคอลัมน์ตามลำดับที่ผู้ใช้จัด พร้อมสถานะเปิด/ปิด */
  function listColumns(projectId, v) {
    var p = project(projectId);
    var all = LIST_COLS.map(function (c) {
      return { id: c.id, label: c.label, w: c.w, sort: c.sort || null, builtin: true,
        on: v.colShow && (c.id in v.colShow) ? !!v.colShow[c.id] : c.on, wkey: c.id };
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
      var moved = m.sectionId !== key;
      if (moved) log(taskId, 'ย้ายไปคอลัมน์ {c}', { c: section(projectId, key).name });
      m.sectionId = key;
      m.position = pos;
      if (moved) applyRules(projectId, key, taskId);
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
    if (by.indexOf('field:') === 0) {
      var fid = by.slice(6);
      var cur = fieldValue(taskId, fid);
      if ((cur || '') === (key || '')) return;
      setFieldRaw(taskId, fid, key || null);
      var f = null;
      db.projects.forEach(function (p) { (p.fields || []).forEach(function (x) { if (x.id === fid) f = x; }); });
      var who = f && f.type === 'person' ? user(key) : null;
      log(taskId, key ? 'ตั้ง {f} เป็น {v}' : 'ล้างค่า {f}', { f: f ? f.name : '', v: who ? who.name : key });
    }
  }

  /** ลากงาน (หนึ่งหรือหลายชิ้น) ลงกลุ่มบนบอร์ดหรือในรายการ — ย้อนกลับได้ในครั้งเดียว
   *  sets = [{ by, key }] เช่น คอลัมน์ + แถว (swimlane) */
  function dropToGroups(ids, projectId, sets, beforeId) {
    ids = (ids || []).filter(function (id) { return !!task(id); });
    sets = (sets || []).filter(function (s) { return s && s.by; });
    if (!ids.length || !sets.length) return false;
    snapshot(ids.length > 1 ? 'ย้าย {n} งาน' : 'ย้ายงาน', { n: ids.length });
    ids.forEach(function (id) {
      sets.forEach(function (s) { applyGroupValue(id, projectId, s.by, s.key, ids.length === 1 ? beforeId : null); });
    });
    commit();
    return true;
  }

  /** ใส่ค่าฟิลด์โดยไม่ commit */
  function setFieldRaw(taskId, fieldId, value) {
    var empty = (value === null || value === '' ||
                 (value && value.length === 0 && typeof value !== 'number'));
    var fv = db.fieldValues.filter(function (v) {
      return v.taskId === taskId && v.fieldId === fieldId;
    })[0];
    if (fv) {
      if (empty) db.fieldValues = db.fieldValues.filter(function (v) { return v !== fv; });
      else fv.value = value;
    } else if (!empty) {
      db.fieldValues.push({ taskId: taskId, fieldId: fieldId, value: value });
    }
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
   * จนเลิกอ่านกล่องข้อความไปเลย ซึ่งแย่กว่าไม่มีกล่องข้อความตั้งแต่แรก
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
      desc: 'เฉพาะโปรเจกต์ที่เปิด “งานใหม่ในโปรเจกต์” ไว้' }
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
      db.notifications.push({
        id: uid('n'), userId: uidMe, taskId: taskId, projectId: null,
        text: fill(key, params), kind: kind, key: key, params: params || null,
        actorName: null, actorId: null, bookmarked: false, dedupe: dedupe, route: route || null,
        createdAt: new Date().toISOString(), read: false, archived: false
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
    if (!n || !(kind in n)) return true;    // ไม่เคยตั้งค่า = เปิดทุกชนิด
    return !!n[kind];
  }

  function notify(taskId, text, exceptUserId, extraUserIds, kind, excludeIds,
                  key, params, actor) {
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
      db.notifications.push({
        id: uid('n'), userId: target, taskId: taskId, text: text,
        /* เก็บคีย์ไว้ด้วยเมื่อมี กล่องข้อความจะได้แปลตอนอ่าน
         * ไม่ใช่ค้างภาษาของคนที่ทำให้เกิดการแจ้งเตือน */
        key: key || null, params: params || null,
        actorName: actor ? actor.name : null, actorId: actor ? actor.id : null,
        kind: kind || null, bookmarked: false,
        createdAt: new Date().toISOString(), read: false, archived: false
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
    (userIds || []).forEach(function (target) {
      if (!target || target === db.currentUserId) return;
      if (!user(target)) return;
      if (!wantsNotify(target, kind)) return;
      db.notifications.push({
        id: uid('n'), userId: target, taskId: taskId,
        /* ประกาศของโปรเจกต์ไม่มีงานให้ชี้ เก็บรหัสโปรเจกต์ไว้แทน
         * กล่องข้อความจะได้พาไปที่หน้าประกาศ ไม่ใช่ขึ้นว่างานถูกลบแล้ว */
        projectId: (extra && extra.projectId) || null,
        route: (extra && extra.route) || null,
        text: fill(key, params), kind: kind || null,
        key: key, params: params || null,
        actorName: actor ? actor.name : null, actorId: actor ? actor.id : null, bookmarked: false,
        createdAt: new Date().toISOString(), read: false, archived: false
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
    db.stories.push({
      id: uid('st'), taskId: taskId, actorId: db.currentUserId,
      type: 'log', text: key, params: params || null,
      createdAt: new Date().toISOString()
    });
    var actor = me();
    /* ข้อความแจ้งเตือนก็ต้องแปลตอนอ่านเหมือนกัน จึงส่งคีย์กับค่าไปด้วย */
    notify(taskId, (actor ? actor.name : 'มีคน') + ' ' + fill(key, params),
      db.currentUserId, null, 'activity', exclude, key, params, actor);
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

  function createTask(attrs, projectId, sectionId) {
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
    if (c.followers.indexOf(db.currentUserId) < 0) c.followers.push(db.currentUserId);
    if (c.assigneeId && c.followers.indexOf(c.assigneeId) < 0) c.followers.push(c.assigneeId);
    /* เก็บรายชื่องานย่อยก่อน push เพราะดัชนีจะถูกสร้างใหม่ทันทีที่ความยาวอาเรย์เปลี่ยน */
    var kids = o.subtasks ? db.tasks.filter(function (x) { return x.parentId === src.id; }) : [];
    db.tasks.push(c);
    if (o.fields) {
      db.fieldValues.filter(function (v) { return v.taskId === src.id; }).forEach(function (v) {
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

  function updateTask(id, patch, opts) {
    var t = task(id);
    if (!t) return null;
    if (!opts || !opts.quiet) snapshot('แก้ไขงาน');

    if ('completed' in patch && patch.completed !== t.completed) {
      patch.completedAt = patch.completed ? today() : null;
      log(id, patch.completed ? 'ทำงานนี้เสร็จแล้ว' : 'เปิดงานนี้อีกครั้ง');
      if (patch.completed) {
        spawnRecurrence(t);
        // ปลดล็อกงานที่รออยู่ แล้วแจ้งผู้รับผิดชอบ
        blocking(id).forEach(function (b) {
          var others = blockers(b.id).filter(function (x) { return x.id !== id; });
          if (!others.length) {
            notifyOnly(b.id, b.assigneeId ? [b.assigneeId] : [],
              'งาน “{t}” พร้อมทำต่อแล้ว', 'unblock', { t: b.name }, true);
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
      /* คนที่เพิ่งได้รับงานไม่ต้องได้บรรทัด "มอบหมายให้ X" ซ้ำอีก
       * เพราะจะได้บรรทัดเจาะจงว่า "มอบหมายงาน … ให้คุณ" อยู่แล้ว
       * ถ้าไม่กัน คนที่เคยติดตามงานนี้อยู่แล้วจะเห็นสองบรรทัดสำหรับเรื่องเดียวกัน */
      log(id, u ? 'มอบหมายให้ {who}' : 'ยกเลิกผู้รับผิดชอบ', u ? { who: u.name } : null,
        patch.assigneeId ? [patch.assigneeId] : null);
      if (patch.assigneeId && t.followers.indexOf(patch.assigneeId) < 0) {
        t.followers.push(patch.assigneeId);
      }
      /* แจ้งคนที่เพิ่งได้รับงานเป็นการเฉพาะ แยกจากความเคลื่อนไหวทั่วไป
       * เพราะ "มีงานเข้า" เป็นเรื่องที่คนอยากรู้ทันที ต่างจาก "มีคนเปลี่ยนวัน" */
      if (patch.assigneeId) {
        var actorA = me();
        notifyOnly(id, [patch.assigneeId],
          'มอบหมายงาน “{t}” ให้คุณ', 'assigned', { t: t.name });
      }
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
    }
    if ('startOn' in patch && patch.startOn !== t.startOn) {
      if (patch.startOn && t.startOn) {
        log(id, 'เลื่อนวันเริ่มจาก {a} เป็น {b}', { a: t.startOn, b: patch.startOn });
      } else {
        log(id, patch.startOn ? 'ตั้งวันเริ่ม {d}' : 'ลบวันเริ่ม',
          patch.startOn ? { d: patch.startOn } : null);
      }
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
    if ('type' in patch && patch.type !== t.type) {
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

  function deleteTask(id) {
    snapshot('ลบงาน');
    trashTasks([id]);
    commit();
  }

  function deleteTasks(ids) {
    snapshot('ลบ {n} งาน', { n: ids.length });
    trashTasks(ids);
    commit();
  }

  /** ของในถังที่คนนี้เห็น — ของที่ตัวเองลบ ผู้ดูแลเห็นของทุกคน ใหม่สุดก่อน */
  function trashItems() {
    var mine = db.currentUserId, admin = isAdmin();
    return (db.trash || []).filter(function (x) {
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
  function duplicateTask(id, o) {
    var t = task(id);
    if (!t) return null;
    var raw = o || {};
    var opt = dupOpts(raw);
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
    snapshot('มอบสำเนาให้ {n} คน', { n: people.length });
    var made = [];
    if (!t.assigneeId) {
      var first = people.shift();
      t.assigneeId = first;
      stampAssign(t);
      if (t.followers.indexOf(first) < 0) t.followers.push(first);
      log(taskId, 'มอบหมายให้ {who}', { who: user(first).name }, [first]);
      notifyOnly(taskId, [first], 'มอบหมายงาน “{t}” ให้คุณ', 'assigned', { t: t.name });
    }
    people.forEach(function (u) {
      if (u === t.assigneeId) return;
      var c = duplicateTask(taskId, { quiet: true, name: t.name, assigneeId: u });
      notifyOnly(c.id, [u], 'มอบหมายงาน “{t}” ให้คุณ', 'assigned', { t: c.name });
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
    snapshot('สร้างงานติดตามผล');
    var t = createTaskRaw({
      name: name || (L('ติดตาม:') + ' ' + src.name),
      assigneeId: db.currentUserId,
      dueOn: dueOn || null,
      notes: L('ติดตามผลจาก') + ' @[' + refLabel(src.name) + '](' + src.id + ')'
    }, null, null);
    copyMemberships(srcId, t.id);
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
    snapshot('ย้ายออกเป็นงานหลัก');
    var root = p, d = 0;
    while (root && root.parentId && d++ < 20) root = task(root.parentId);
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

    var changedSection = m.sectionId !== toSectionId;
    if (changedSection) {
      var s = section(projectId, toSectionId);
      if (s) log(taskId, 'ย้ายไปคอลัมน์ {c}', { c: s.name });
    }
    m.sectionId = toSectionId;
    m.position = newPos;

    if (changedSection) applyRules(projectId, toSectionId, taskId);
    commit();
  }

  /** กฎอัตโนมัติ: เมื่อย้ายเข้าคอลัมน์ที่กำหนด ให้ทำอะไรบ้าง */
  function applyRules(projectId, sectionId, taskId) {
    var p = project(projectId);
    var t = task(taskId);
    if (!p || !t) return;
    p.rules.forEach(function (r) {
      if (r.whenSection !== sectionId) return;
      if (r.setCompleted && !t.completed) {
        t.completed = true;
        t.completedAt = today();
        log(taskId, 'ถูกทำเครื่องหมายเสร็จโดยกฎอัตโนมัติ');
        spawnRecurrence(t);
      }
      if (r.setAssignee && r.setAssignee !== t.assigneeId) {
        mtForget(t.id, t.assigneeId);
        t.assigneeId = r.setAssignee;
        stampAssign(t);
      }
      if (r.setPriority) t.priority = r.setPriority;
      if (r.addTag && t.tags.indexOf(r.addTag) < 0) t.tags.push(r.addTag);
    });
  }

  function addTaskToProject(taskId, projectId, sectionId) {
    var exists = db.memberships.filter(function (m) {
      return m.taskId === taskId && m.projectId === projectId;
    })[0];
    if (exists) return exists;
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
    var i = t.followers.indexOf(userId);
    if (i >= 0) t.followers.splice(i, 1);
    else t.followers.push(userId);
    commit();
  }

  function toggleLike(taskId) {
    var t = task(taskId);
    if (!t) return;
    var i = t.likes.indexOf(db.currentUserId);
    if (i >= 0) t.likes.splice(i, 1);
    else {
      t.likes.push(db.currentUserId);
      notify(taskId, (me() ? me().name : 'มีคน') + ' ถูกใจงานนี้', db.currentUserId, null, 'activity');
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
    t.attachments.push({
      id: uid('a'), name: name, url: url || '',
      size: (meta && meta.size) || null,
      mime: (meta && meta.mime) || null,
      addedBy: db.currentUserId, addedAt: new Date().toISOString()
    });
    log(taskId, 'แนบ “{f}”', { f: name });
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
    if (mentioned.length) {
      notifyOnly(taskId, mentioned, 'พูดถึงคุณในความเห็น', 'mention');
    }
    if (parent) {
      /* คำตอบในเธรดแจ้งเฉพาะคนที่อยู่ในบทสนทนานั้น ไม่กระจายไปหาผู้ติดตามทั้งงาน
       * งานที่มีคนติดตามยี่สิบคน ถ้าทุกคำตอบสั้น ๆ เด้งหาทุกคน กล่องข้อความจะไม่มีใครอ่าน */
      var inThread = [parent.actorId];
      repliesOf(parent.id).forEach(function (r) {
        if (inThread.indexOf(r.actorId) < 0) inThread.push(r.actorId);
      });
      notifyOnly(taskId, inThread.filter(function (u) { return mentioned.indexOf(u) < 0; }),
        'ตอบกลับความเห็นในงาน “{t}”', 'comment', { t: t.name });
    } else {
      notify(taskId, (actor ? actor.name : 'มีคน') + ' แสดงความเห็น',
        db.currentUserId, [], 'comment', mentioned, 'แสดงความเห็น', null, actor);
    }
    logConnected(taskId, '', clean);
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
      if (fresh.length) notifyOnly(s.taskId, fresh, 'พูดถึงคุณในความเห็น', 'mention');
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
    var empty = (value === null || value === '' ||
                 (value && value.length === 0 && typeof value !== 'number'));
    var fv = db.fieldValues.filter(function (v) {
      return v.taskId === taskId && v.fieldId === fieldId;
    })[0];
    if (fv) {
      if (empty) {
        db.fieldValues = db.fieldValues.filter(function (v) { return v !== fv; });
      } else { fv.value = value; }
    } else if (!empty) {
      db.fieldValues.push({ taskId: taskId, fieldId: fieldId, value: value });
    }
    commit();
  }

  /* ---------- bulk ---------- */

  function bulkUpdate(ids, patch) {
    snapshot('แก้ {n} งานพร้อมกัน', { n: ids.length });
    ids.forEach(function (id) { updateTask(id, clone(patch), { quiet: true }); });
    commit();
  }

  function bulkMove(ids, projectId, sectionId) {
    snapshot('ย้าย {n} งาน', { n: ids.length });
    ids.forEach(function (id) {
      var m = db.memberships.filter(function (x) {
        return x.taskId === id && x.projectId === projectId;
      })[0];
      if (m) {
        m.sectionId = sectionId;
        m.position = nextPosition(projectId, sectionId);
      }
    });
    commit();
  }

  /* ---------- notification mutations ---------- */

  function markRead(id) {
    var n = notification(id);
    if (n && !n.read) { n.read = true; commit(); }
  }
  function markAllRead(userId) {
    db.notifications.forEach(function (n) {
      if (n.userId === userId) n.read = true;
    });
    commit();
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
    f.projectIds.push(projectId);
    audit('portfolio.add', f.name, p.name);
    commit();
    return true;
  }

  function removeFromPortfolio(portfolioId, projectId) {
    var f = portfolio(portfolioId);
    if (!f) return false;
    var p = project(projectId);
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
    var list = portfolioProjects(portfolioId);
    var s = {
      projects: list.length, hidden: portfolioHidden(portfolioId),
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
      if (key) {
        s.byStatus[key] = (s.byStatus[key] || 0) + 1;
        if (key === 'at_risk' || key === 'off_track') s.atRisk++;
      } else s.noStatus++;
    });
    s.percent = s.total ? Math.round(s.done * 100 / s.total) : 0;
    return s;
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
      by: db.currentUserId, at: today()
    };
    f.statusLog = f.statusLog || [];
    f.statusLog.push({
      id: uid('ps'), state: state, text: f.status.text,
      by: db.currentUserId, at: new Date().toISOString()
    });
    if (f.statusLog.length > 30) f.statusLog = f.statusLog.slice(-30);
    commit();
  }

  /* ---------- projects ---------- */

  function createProject(attrs) {
    snapshot('สร้างโปรเจกต์');
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
      dueOn: attrs.dueOn || null,
      depShift: { mode: 'consume', scope: 'downstream' },
      workDays: 'all',
      baseline: null,
      fields: [], status: null, rules: [], savedViews: [], colWidths: {}
    };
    db.projects.push(p);
    audit("project.create", p.name);
    commit();
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
      at: today()
    };
    p.statusLog = p.statusLog || [];
    p.statusLog.push({
      id: uid('ps'), state: state, text: p.status.text,
      by: db.currentUserId, at: new Date().toISOString()
    });
    if (p.statusLog.length > 30) p.statusLog = p.statusLog.slice(-30);
    var watchers = projectWatchers(id, 'status');
    if (watchers.length) {
      notifyOnly(null, watchers, 'อัปเดตสถานะของ {p}', 'status', { p: p.name }, false,
        { projectId: id, route: 'p-overview' });
    }
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

  /** คัดลอกทั้งโปรเจกต์ (ใช้เป็นเทมเพลตได้) */
  function duplicateProject(id, withTasks) {
    var src = project(id);
    if (!src) return null;
    snapshot('คัดลอกโปรเจกต์');
    var p = clone(src);
    p.id = uid('p');
    p.name = src.name + ' (สำเนา)';
    p.status = null;
    p.archived = false;

    var sectionMap = {};
    p.sections.forEach(function (s) {
      var old = s.id;
      s.id = uid('s');
      sectionMap[old] = s.id;
    });
    var fieldMap = {};
    p.fields.forEach(function (f) {
      var old = f.id;
      f.id = uid('f');
      fieldMap[old] = f.id;
    });
    p.rules.forEach(function (r) {
      r.id = uid('r');
      r.whenSection = sectionMap[r.whenSection] || null;
    });
    p.savedViews = [];
    db.projects.push(p);
    audit("project.duplicate", p.name, "คัดลอกจากโปรเจกต์เดิม");

    if (withTasks) {
      tasksInProject(id).forEach(function (x) {
        var copy = blankTask(clone(x.task));
        copy.id = uid('t');
        copy.completed = false;
        copy.completedAt = null;
        copy.likes = [];
        copy.dependsOn = [];
        db.tasks.push(copy);
        db.memberships.push({
          id: uid('m'), taskId: copy.id, projectId: p.id,
          sectionId: sectionMap[x.membership.sectionId] || p.sections[0].id,
          position: x.membership.position
        });
        db.fieldValues.filter(function (v) { return v.taskId === x.task.id; })
          .forEach(function (v) {
            if (!fieldMap[v.fieldId]) return;
            db.fieldValues.push({
              taskId: copy.id, fieldId: fieldMap[v.fieldId], value: v.value
            });
          });
      });
    }
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
    p.sections.push({ id: uid('s'), name: name || 'คอลัมน์ใหม่' });
    commit();
  }

  function renameSection(projectId, sectionId, name) {
    var s = section(projectId, sectionId);
    if (s) { s.name = name; commit(); }
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
    var keep = {};
    SEC_DUP_KEYS.forEach(function (k) { keep[k] = !o.keep || !(k in o.keep) ? true : !!o.keep[k]; });
    if (toPid !== projectId) keep.fields = false;
    var opt = { assignee: keep.assignee, notes: keep.notes, subtasks: keep.subtasks,
      attachments: keep.attachments, tags: keep.tags, followers: keep.followers,
      projects: false, deps: false, dates: keep.dates, fields: keep.fields };
    var name = String(o.name || '').trim().slice(0, 120) || (src.name + ' ' + L('(สำเนา)'));
    var roots = tasksInSection(projectId, sectionId).map(function (x) { return x.task; });
    snapshot('ทำสำเนาคอลัมน์ “{s}”', { s: src.name });
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
    var nf = {
      id: uid('f'), name: field.name || 'ฟิลด์ใหม่',
      type: field.type || 'text', options: normalizeOptions(field.options)
    };
    if (nf.type === 'number') nf.format = normalizeFormat(field.format);
    p.fields.push(nf);
    commit();
  }

  function renameField(projectId, fieldId, name) {
    var p = project(projectId);
    var f = p.fields.filter(function (x) { return x.id === fieldId; })[0];
    if (f && name) { f.name = name; commit(); }
  }

  /** ลบฟิลด์ — ตัวฟิลด์กับค่าที่กรอกไว้ทั้งหมดไปพักในถังขยะ */
  function deleteField(projectId, fieldId) {
    var p = project(projectId);
    if (!p) return;
    var at = -1;
    p.fields.forEach(function (f, i) { if (f.id === fieldId) at = i; });
    if (at < 0) return;
    snapshot('ลบฟิลด์');
    var f = p.fields[at];
    trashPush('field', f.name, projectId, {
      field: clone(f), index: at,
      values: clone(db.fieldValues.filter(function (v) { return v.fieldId === fieldId; }))
    });
    p.fields = p.fields.filter(function (x) { return x.id !== fieldId; });
    db.fieldValues = db.fieldValues.filter(function (v) { return v.fieldId !== fieldId; });
    commit();
  }

  /** รูปแบบการแสดงของฟิลด์ตัวเลข — ค่าที่กรอกไว้ไม่เปลี่ยน เปลี่ยนแค่หน้าตา */
  function setFieldFormat(projectId, fieldId, format) {
    var p = project(projectId);
    var f = p && p.fields.filter(function (x) { return x.id === fieldId; })[0];
    if (!f || f.type !== 'number') return false;
    snapshot('ตั้งรูปแบบตัวเลข');
    f.format = normalizeFormat(format);
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

  /* ---------- rules ---------- */

  function addRule(projectId, rule) {
    var p = project(projectId);
    p.rules.push({
      id: uid('r'),
      whenSection: rule.whenSection,
      setAssignee: rule.setAssignee || null,
      setPriority: rule.setPriority || null,
      setCompleted: !!rule.setCompleted,
      addTag: rule.addTag || ''
    });
    commit();
  }

  function deleteRule(projectId, ruleId) {
    var p = project(projectId);
    p.rules = p.rules.filter(function (r) { return r.id !== ruleId; });
    commit();
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

  /* ---------- task templates ---------- */

  function saveTaskTemplate(taskId, name) {
    var t = task(taskId);
    if (!t) return;
    db.taskTemplates.push({
      id: uid('tt'), name: name || t.name,
      payload: {
        name: t.name, notes: t.notes, type: t.type, priority: t.priority,
        assigneeId: t.assigneeId, tags: t.tags.slice(),
        subtaskNames: subtasks(taskId).map(function (s) { return s.name; })
      }
    });
    commit();
  }

  function applyTaskTemplate(templateId, projectId, sectionId) {
    var tpl = db.taskTemplates.filter(function (x) { return x.id === templateId; })[0];
    if (!tpl) return null;
    var payload = clone(tpl.payload);
    var names = payload.subtaskNames || [];
    delete payload.subtaskNames;
    var t = createTask(payload, projectId, sectionId);
    names.forEach(function (n) {
      db.tasks.push(blankTask({ name: n, parentId: t.id, createdBy: db.currentUserId }));
    });
    commit();
    return t;
  }

  function deleteTaskTemplate(id) {
    db.taskTemplates = db.taskTemplates.filter(function (x) { return x.id !== id; });
    commit();
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
  function addUser(attrs) {
    var id = attrs.id || uid('u');
    var existing = user(id);
    if (existing) return existing;          // เลือกคนเดิมซ้ำ ไม่ต้องเพิ่มอีก
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
    { id: 'admin',   label: 'ผู้ดูแลโปรเจกต์', desc: 'จัดการสมาชิกและลบโปรเจกต์ได้' },
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

    /* ด่านแรก เห็นโปรเจกต์นี้ไหม
     * โปรเจกต์ปิดต้องเป็นสมาชิกเท่านั้น ส่วนบุคคลภายนอกต้องถูกเชิญเป็นรายโปรเจกต์เสมอ
     * แม้เป็นโปรเจกต์ที่เปิดให้ทั้งองค์กรก็ยังไม่เห็น */
    if (!m && (p.visibility === 'private' || u.role === 'guest')) return null;

    /* ด่านสอง เห็นแล้วทำอะไรได้
     * "ดูอย่างเดียว" เป็นเพดาน ไม่ใช่ค่าเริ่มต้น ถูกเชิญมาด้วยสิทธิ์ edit ก็ยังแก้ไม่ได้
     * ตรงกับ ROLE_CAPS ที่ can() ใช้ และกับ fn_VisibleProjects ฝั่งฐานข้อมูล */
    if (u.role === 'viewer') return 'view';

    return m ? m.access : 'edit';
  }

  /** โปรเจกต์ที่คนนี้เห็นได้ ใช้แทน activeProjects ทุกที่ที่แสดงรายการ */
  function visibleProjects(userId) {
    return db.projects.filter(function (p) {
      return !p.archived && projectAccess(p.id, userId);
    });
  }

  /** มีสิทธิ์ระดับที่ต้องการในโปรเจกต์นี้ไหม */
  function canInProject(projectId, needed) {
    var a = projectAccess(projectId);
    if (!a) return false;
    return (ACCESS_RANK[a] || 0) >= (ACCESS_RANK[needed] || 0);
  }

  function setProjectVisibility(projectId, visibility) {
    var p = project(projectId);
    if (!p) return false;
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
    if (!target) return false;
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
   * ผู้อนุมัติคือผู้รับผิดชอบงาน แบบเดียวกับ Asana — คนอื่นกดแทนไม่ได้
   * ยกเว้นคนที่แก้โปรเจกต์ของงานนั้นได้ (หัวหน้าทีมปิดเรื่องค้างแทนคนที่ลาไปได้)
   * งานที่ไม่อยู่โปรเจกต์ไหนและยังไม่มีผู้อนุมัติ ให้คนสร้างตั้งสถานะเองได้ */
  function canApprove(taskId) {
    var t = task(taskId);
    if (!t || t.type !== 'approval') return false;
    if (!can('write')) return false;                   // ดูอย่างเดียว/ปิดบัญชี กดอะไรไม่ได้เลย
    if (t.assigneeId === db.currentUserId) return true;
    var homes = (index().memByTask[taskId] || []);
    if (!homes.length) return !t.assigneeId && t.createdBy === db.currentUserId;
    return homes.some(function (m) { return canInProject(m.projectId, 'edit'); });
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
     * คนที่รับช่วงงานสามสิบงานไม่ควรเจอสามสิบแถวในกล่องข้อความ */
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
    u.away = until ? { until: until, note: note || '' } : null;
    /* ไม่ใส่ target เพราะเป็นการกระทำกับตัวเอง ชื่อผู้ทำอยู่หน้าบรรทัดแล้ว
     * ถ้าใส่ด้วยจะอ่านว่า "สมชาย ได้ตั้งสถานะไม่อยู่ สมชาย" */
    audit(until ? 'user.away' : 'user.back', null, until || null);
    commit();
  }

  function isAway(userId) {
    var u = user(userId);
    if (!u || !u.away || !u.away.until) return false;
    return u.away.until >= today();
  }

  /* ---------- backup ---------- */

  function exportJSON() { return JSON.stringify(db, null, 2); }

  function importJSON(text) {
    var parsed = JSON.parse(text);
    if (!parsed.projects || !parsed.tasks) throw new Error('ไฟล์ไม่ถูกรูปแบบ');
    snapshot('กู้คืนข้อมูล');
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
    inbox: inbox, unreadCount: unreadCount,
    defaultView: defaultView, fillView: fillView,
    viewGroups: viewGroups, matchesFilter: matchesFilter,
    taskDuration: taskDuration, autoSchedule: autoSchedule,
    setBaseline: setBaseline, clearBaseline: clearBaseline, baselineOf: baselineOf,
    sortItems: sortItems, projectStats: projectStats,

    createTask: createTask, createTasks: createTasks, updateTask: updateTask, deleteTask: deleteTask,
    deleteTasks: deleteTasks, duplicateTask: duplicateTask, moveTask: moveTask,
    DUP_KEYS: DUP_KEYS, assignCopies: assignCopies, mergeDuplicate: mergeDuplicate,
    createFollowUp: createFollowUp, setParent: setParent, promoteSubtask: promoteSubtask,
    fitParentDates: fitParentDates, subtasksOutside: subtasksOutside,
    nextOccurrence: nextOccurrence, canApprove: canApprove,
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

    /* 2a — งานส่วนตัว งานของฉัน กล่องข้อความ หน้าแรก */
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
    deleteProject: deleteProject, duplicateProject: duplicateProject,
    setProjectStatus: setProjectStatus, statusLog: statusLog, archiveProject: archiveProject,
    addSection: addSection, renameSection: renameSection,
    deleteSection: deleteSection, moveSection: moveSection,
    addField: addField, renameField: renameField, deleteField: deleteField,
    colWidth: colWidth, setColWidth: setColWidth, resetColWidths: resetColWidths,
    addRule: addRule, deleteRule: deleteRule,
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

    exportJSON: exportJSON, importJSON: importJSON, reset: reset
  };

})(window);

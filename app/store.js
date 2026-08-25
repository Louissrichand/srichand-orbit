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
  var SCHEMA = 4;

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

  var PROJECT_STATES = [
    { id: 'on_track',  label: 'ตามแผน',  color: '#37c5ab' },
    { id: 'at_risk',   label: 'เสี่ยง',   color: '#f5a623' },
    { id: 'off_track', label: 'หลุดแผน', color: '#e8384f' }
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

  var RECUR_FREQ = [
    { id: 'daily',   label: 'ทุกวัน' },
    { id: 'weekly',  label: 'ทุกสัปดาห์' },
    { id: 'monthly', label: 'ทุกเดือน' }
  ];

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
      createdBy: attrs.createdBy || 'u_me',
      createdAt: attrs.createdAt || today()
    };
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
    if (d.version < 3) {
      // เดิม dependsOn เก็บแค่ id ตอนนี้เก็บชนิดความสัมพันธ์มาด้วย
      d.tasks.forEach(function (t) { t.dependsOn = normalizeDeps(t.dependsOn); });
      d.version = 3;
    }
    /* v5 — บทบาทและเวลาเข้าใช้ล่าสุด สำหรับหน้าผู้ดูแล
     * ผู้ใช้ตัวอย่างจากข้อมูลตั้งต้นจะไม่มี lastSeenAt เลย
     * จึงใช้ฟิลด์นี้แยกคนที่ล็อกอินจริงออกจากคนสมมติได้ */
    d.users.forEach(function (u) {
      if (!u.role) u.role = 'member';
      if (!('lastSeenAt' in u)) u.lastSeenAt = null;
    });
    d.audit = d.audit || [];
    d.projectMembers = d.projectMembers || [];
    d.projects.forEach(function (p) {
      if (!p.visibility) p.visibility = 'org';   // ของเดิมทุกโปรเจกต์เปิดให้ทุกคน
      if (!('locked' in p)) p.locked = false;
      if (!('baseline' in p)) p.baseline = null; // เส้นฐานของ Gantt ยังไม่เคยตั้ง
      if (!('owner' in p)) p.owner = null;
      if (!('dueOn' in p)) p.dueOn = null;
      if (!p.depShift) p.depShift = { mode: 'consume', scope: 'downstream' };
      if (!p.workDays) p.workDays = 'all';
      (p.savedViews || []).forEach(function (v) { v.view = fillView(v.view); });
    });
    d.users.forEach(function (u) {
      if (!('active' in u)) u.active = true;      // ปิดใช้งานได้โดยไม่ต้องลบทิ้ง
      if (!('authBy' in u)) u.authBy = null;      // microsoft | password | null (ยังไม่เคยเข้า)
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
    suppressRemote = true;
    db = migrate(obj);
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
    commit();
    suppressRemote = false;
  }

  function persist() {
    try {
      storage.set(JSON.stringify(db));
    } catch (e) {
      console.error('บันทึกไม่สำเร็จ', e);
      if (global.Orbit && global.Orbit.toast) {
        global.Orbit.toast('บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็ม');
      }
    }
    if (remoteSave && !suppressRemote) remoteSave();
  }

  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function commit() {
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

  function audit(action, target, detail) {
    if (!db.audit) db.audit = [];
    db.audit.push({
      id: uid('a'),
      at: new Date().toISOString(),
      actorId: db.currentUserId,
      action: action,                       // เช่น user.role, project.delete
      target: target || null,               // ชื่อหรือรหัสของสิ่งที่ถูกกระทำ
      detail: detail || null
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

    var lines = [CSV_COLS.join(',')];
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
        (t.tags || []).join(' · '), blockers, t.notes || ''
      ].map(csvCell).join(','));
    });
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

    audit('project.import', p.name, 'นำเข้า ' + made + ' งาน');
    commit();
    return { tasks: made, sections: newSections };
  }
  /* ---------- undo ---------- */

  var undoStack = [];   // อยู่ในหน่วยความจำเท่านั้น ไม่ persist

  function snapshot(label) {
    undoStack.push({ label: label, data: JSON.stringify(db) });
    if (undoStack.length > 25) undoStack.shift();
  }

  function undo() {
    var s = undoStack.pop();
    if (!s) return null;
    db = JSON.parse(s.data);
    commit();
    return s.label;
  }

  function canUndo() { return undoStack.length > 0; }

  /* ---------- selectors ---------- */

  function user(id) {
    return db.users.filter(function (u) { return u.id === id; })[0] || null;
  }
  function me() { return user(db.currentUserId); }
  function project(id) {
    return db.projects.filter(function (p) { return p.id === id; })[0] || null;
  }
  function task(id) {
    return db.tasks.filter(function (t) { return t.id === id; })[0] || null;
  }
  function section(projectId, sectionId) {
    var p = project(projectId);
    if (!p) return null;
    return p.sections.filter(function (s) { return s.id === sectionId; })[0] || null;
  }
  function activeProjects() {
    return db.projects.filter(function (p) { return !p.archived; });
  }

  function tasksInProject(projectId) {
    return db.memberships
      .filter(function (m) { return m.projectId === projectId; })
      .map(function (m) {
        var t = task(m.taskId);
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
    return db.tasks.filter(function (t) { return t.parentId === taskId; });
  }

  function projectsOfTask(taskId) {
    return db.memberships
      .filter(function (m) { return m.taskId === taskId; })
      .map(function (m) { return { project: project(m.projectId), membership: m }; })
      .filter(function (x) { return x.project; });
  }

  function storiesOfTask(taskId) {
    return db.stories
      .filter(function (s) { return s.taskId === taskId; })
      .sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
  }

  function fieldValue(taskId, fieldId) {
    var fv = db.fieldValues.filter(function (v) {
      return v.taskId === taskId && v.fieldId === fieldId;
    })[0];
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
    return db.tasks.filter(function (t) {
      return t.dependsOn.filter(function (d) { return d.id === taskId; }).length > 0;
    });
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
    audit('project.baseline', p.name, 'จำนวนงานที่บันทึก ' + Object.keys(map).length);
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

    var ms = db.memberships.filter(function (m) { return m.taskId === taskId; });
    if (ms.length) {
      return ms.some(function (m) { return !!projectAccess(m.projectId); });
    }
    var t = task(taskId);
    if (t && t.parentId && (depth || 0) < 8) return canSeeTask(t.parentId, (depth || 0) + 1);
    return true;
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

  function search(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) return [];
    return db.tasks.filter(function (t) {
      if (t.name.toLowerCase().indexOf(q) < 0 &&
          (t.notes || '').toLowerCase().indexOf(q) < 0) return false;
      return canSeeTask(t.id);
    }).slice(0, 60);
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

  function inbox(userId, showArchived) {
    return db.notifications
      .filter(function (n) {
        return n.userId === userId && (showArchived ? n.archived : !n.archived);
      })
      .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
  }

  function unreadCount(userId) {
    return db.notifications.filter(function (n) {
      return n.userId === userId && !n.archived && !n.read;
    }).length;
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

  function defaultView() {
    return {
      assignee: '', priority: '', tag: '', due: 'any',
      showCompleted: true, sort: 'manual', sortDir: 'asc', group: 'section',

      /* --- Gantt --- */
      gZoom: 'month',
      gColorBy: 'theme',
      gCols: { due: true, blockedBy: true, duration: false, blocking: false },
      gSubtasks: 'collapsed',
      gShowBaseline: false
    };
  }

  /** เติมคีย์ที่ยังไม่มีให้มุมมองเก่า
   *
   * มุมมองที่ผู้ใช้บันทึกไว้ก่อนมีตัวเลือก Gantt จะขาดคีย์ใหม่ทั้งหมด
   * ถ้าไม่เติม พอโหลดมุมมองนั้นแล้ว Gantt จะอ่านค่า undefined แล้วหน้าพัง
   */
  function fillView(v) {
    var base = defaultView();
    if (!v) return base;
    Object.keys(base).forEach(function (k) {
      if (!(k in v)) v[k] = base[k];
    });
    v.gCols = v.gCols || base.gCols;
    Object.keys(base.gCols).forEach(function (k) {
      if (!(k in v.gCols)) v.gCols[k] = base.gCols[k];
    });
    return v;
  }

  function matchesFilter(t, f) {
    if (f.assignee && t.assigneeId !== f.assignee) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.tag && t.tags.indexOf(f.tag) < 0) return false;
    if (!f.showCompleted && t.completed) return false;
    if (f.due && f.due !== 'any') {
      var td = today();
      if (f.due === 'none' && t.dueOn) return false;
      if (f.due === 'overdue' && !(t.dueOn && t.dueOn < td && !t.completed)) return false;
      if (f.due === 'today' && t.dueOn !== td) return false;
      if (f.due === 'week' && !(t.dueOn && t.dueOn >= td && t.dueOn <= addDays(td, 7))) return false;
    }
    return true;
  }

  function prioRank(id) {
    var p = PRIORITIES.filter(function (x) { return x.id === id; })[0];
    return p ? p.rank : 9;
  }

  /** ค่าที่ใช้เทียบของฟิลด์ที่สร้างเอง แปลงให้เทียบกันได้ตามชนิด */
  function fieldSortKey(t, fieldId) {
    var v = null;
    db.fieldValues.forEach(function (x) {
      if (x.taskId === t.id && x.fieldId === fieldId) v = x.value;
    });
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    if (v.length && typeof v !== 'string') return v.join(', ');   // multi-select
    var u = user(v);
    return u ? u.name : String(v);
  }

  function sortItems(items, sort, dir) {
    if (!sort || sort === 'manual') return items;
    var sign = (dir === 'desc') ? -1 : 1;
    var fieldId = (sort.indexOf('field:') === 0) ? sort.slice(6) : null;
    var copy = items.slice();
    copy.sort(function (a, b) {
      var ta = a.task, tb = b.task;
      if (fieldId) {
        var va = fieldSortKey(ta, fieldId), vb = fieldSortKey(tb, fieldId);
        // ช่องว่างไปอยู่ท้ายเสมอ ไม่ว่าจะเรียงทางไหน
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return sign * (va - vb);
        return sign * String(va).localeCompare(String(vb), 'th');
      }
      if (sort === 'due') {
        return sign * ((ta.dueOn || '9999-99-99') < (tb.dueOn || '9999-99-99') ? -1 : 1);
      }
      if (sort === 'priority') return sign * (prioRank(ta.priority) - prioRank(tb.priority));
      if (sort === 'name') return sign * ta.name.localeCompare(tb.name, 'th');
      if (sort === 'created') return sign * (ta.createdAt < tb.createdAt ? 1 : -1);
      if (sort === 'assignee') {
        var na = (user(ta.assigneeId) || { name: 'ฮฮฮ' }).name;
        var nb = (user(tb.assigneeId) || { name: 'ฮฮฮ' }).name;
        return sign * na.localeCompare(nb, 'th');
      }
      return 0;
    });
    return copy;
  }

  /** คืน [{key, label, items}] ตามการจัดกลุ่มที่เลือก */
  function groupItems(projectId, items, group) {
    var out = [];
    if (group === 'assignee') {
      var seen = {};
      items.forEach(function (x) { seen[x.task.assigneeId || ''] = true; });
      db.users.forEach(function (u) {
        if (!seen[u.id]) return;
        out.push({
          key: u.id, label: u.name,
          items: items.filter(function (x) { return x.task.assigneeId === u.id; })
        });
      });
      if (seen['']) {
        out.push({
          key: '', label: 'ยังไม่มอบหมาย',
          items: items.filter(function (x) { return !x.task.assigneeId; })
        });
      }
    } else if (group === 'priority') {
      PRIORITIES.forEach(function (p) {
        var sub = items.filter(function (x) { return x.task.priority === p.id; });
        if (sub.length) out.push({ key: p.id, label: p.label, color: p.color, items: sub });
      });
    } else if (group === 'due') {
      var td = today();
      var defs = [
        ['overdue', 'เลยกำหนด', function (t) { return t.dueOn && t.dueOn < td && !t.completed; }],
        ['today', 'วันนี้', function (t) { return t.dueOn === td; }],
        ['week', 'ภายใน 7 วัน', function (t) { return t.dueOn && t.dueOn > td && t.dueOn <= addDays(td, 7); }],
        ['later', 'หลังจากนั้น', function (t) { return t.dueOn && t.dueOn > addDays(td, 7); }],
        ['none', 'ไม่มีกำหนด', function (t) { return !t.dueOn; }]
      ];
      defs.forEach(function (d) {
        var sub = items.filter(function (x) { return d[2](x.task); });
        if (sub.length) out.push({ key: d[0], label: d[1], items: sub });
      });
    } else if (group === 'none') {
      out.push({ key: 'all', label: 'ทั้งหมด', items: items });
    } else {
      var p = project(projectId);
      p.sections.forEach(function (s) {
        out.push({
          key: s.id, label: s.name, isSection: true,
          items: items.filter(function (x) { return x.membership.sectionId === s.id; })
        });
      });
    }
    return out;
  }

  /** filter + sort + group รวบเป็นก้อนเดียวให้ view เรียกใช้ */
  function viewGroups(projectId, view) {
    var items = tasksInProject(projectId).filter(function (x) {
      return matchesFilter(x.task, view);
    });
    var groups = groupItems(projectId, items, view.group);
    groups.forEach(function (g) { g.items = sortItems(g.items, view.sort, view.sortDir); });
    return groups;
  }

  function allTags() {
    var seen = {};
    db.tasks.forEach(function (t) {
      t.tags.forEach(function (tg) { seen[tg] = true; });
    });
    return Object.keys(seen).sort();
  }

  /* ---------- notifications ---------- */

  function notify(taskId, text, exceptUserId, extraUserIds) {
    var t = task(taskId);
    if (!t) return;
    var targets = {};
    (t.followers || []).forEach(function (u) { targets[u] = true; });
    (extraUserIds || []).forEach(function (u) { targets[u] = true; });
    delete targets[exceptUserId];
    Object.keys(targets).forEach(function (target) {
      if (!user(target)) return;
      db.notifications.push({
        id: uid('n'), userId: target, taskId: taskId, text: text,
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

  function log(taskId, text) {
    db.stories.push({
      id: uid('st'), taskId: taskId, actorId: db.currentUserId,
      type: 'log', text: text, createdAt: new Date().toISOString()
    });
    var actor = me();
    notify(taskId, (actor ? actor.name : 'มีคน') + ' ' + text, db.currentUserId);
  }

  /* ---------- task mutations ---------- */

  function nextPosition(projectId, sectionId) {
    var list = tasksInSection(projectId, sectionId);
    if (!list.length) return 1;
    return list[list.length - 1].membership.position + 1;
  }

  function createTask(attrs, projectId, sectionId) {
    snapshot('สร้างงาน');
    var t = blankTask(attrs);
    if (t.followers.indexOf(db.currentUserId) < 0) t.followers.push(db.currentUserId);
    t.createdBy = db.currentUserId;
    db.tasks.push(t);
    if (projectId && !t.parentId) {
      db.memberships.push({
        id: uid('m'), taskId: t.id, projectId: projectId,
        sectionId: sectionId, position: nextPosition(projectId, sectionId)
      });
    }
    commit();
    return t;
  }

  /** สร้างรอบถัดไปของงานที่ตั้งให้ทำซ้ำ */
  function spawnRecurrence(t) {
    if (!t.recur || !t.dueOn) return null;
    var n = t.recur.interval || 1;
    var nextDue;
    if (t.recur.freq === 'daily') nextDue = addDays(t.dueOn, n);
    else if (t.recur.freq === 'weekly') nextDue = addDays(t.dueOn, 7 * n);
    else nextDue = addMonths(t.dueOn, n);

    var shift = daysBetween(t.dueOn, nextDue);
    var copy = blankTask({
      name: t.name, notes: t.notes, type: t.type,
      assigneeId: t.assigneeId, priority: t.priority,
      dueOn: nextDue, dueTime: t.dueTime,
      startOn: t.startOn ? addDays(t.startOn, shift) : null,
      tags: t.tags.slice(), followers: t.followers.slice(),
      recur: { freq: t.recur.freq, interval: n },
      createdBy: db.currentUserId
    });
    db.tasks.push(copy);
    projectsOfTask(t.id).forEach(function (x) {
      db.memberships.push({
        id: uid('m'), taskId: copy.id, projectId: x.project.id,
        sectionId: x.membership.sectionId,
        position: nextPosition(x.project.id, x.membership.sectionId)
      });
    });
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
            notify(b.id, 'งาน “' + b.name + '” พร้อมทำต่อแล้ว', db.currentUserId,
              b.assigneeId ? [b.assigneeId] : []);
          }
        });
      }
    }
    if ('assigneeId' in patch && patch.assigneeId !== t.assigneeId) {
      var u = user(patch.assigneeId);
      log(id, u ? 'มอบหมายให้ ' + u.name : 'ยกเลิกผู้รับผิดชอบ');
      if (patch.assigneeId && t.followers.indexOf(patch.assigneeId) < 0) {
        t.followers.push(patch.assigneeId);
      }
    }
    if ('dueOn' in patch && patch.dueOn !== t.dueOn) {
      log(id, patch.dueOn ? 'ตั้งกำหนดส่ง ' + patch.dueOn : 'ลบกำหนดส่ง');
    }
    if ('approval' in patch && patch.approval !== t.approval) {
      var st = APPROVAL_STATES.filter(function (x) { return x.id === patch.approval; })[0];
      if (st) log(id, 'เปลี่ยนสถานะอนุมัติเป็น “' + st.label + '”');
    }

    Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
    if (t.type !== 'approval') t.approval = null;
    else if (!t.approval) t.approval = 'pending';

    commit();
    return t;
  }

  function deleteTaskRaw(id) {
    db.tasks = db.tasks.filter(function (t) { return t.id !== id; });
    db.tasks.forEach(function (t) {
      t.dependsOn = t.dependsOn.filter(function (d) { return d.id !== id; });
    });
    db.memberships = db.memberships.filter(function (m) { return m.taskId !== id; });
    db.stories = db.stories.filter(function (s) { return s.taskId !== id; });
    db.fieldValues = db.fieldValues.filter(function (v) { return v.taskId !== id; });
    db.notifications = db.notifications.filter(function (n) { return n.taskId !== id; });
  }

  /** ลบงานพร้อมงานย่อยทั้งหมด (ไม่ commit — ให้ผู้เรียกจัดการ) */
  function purgeTask(id) {
    subtasks(id).forEach(function (s) { deleteTaskRaw(s.id); });
    deleteTaskRaw(id);
  }

  function deleteTask(id) {
    snapshot('ลบงาน');
    purgeTask(id);
    commit();
  }

  function deleteTasks(ids) {
    snapshot('ลบ ' + ids.length + ' งาน');
    ids.forEach(purgeTask);
    commit();
  }

  /** คัดลอกงาน พร้อมงานย่อยและค่าฟิลด์ */
  function duplicateTask(id) {
    var t = task(id);
    if (!t) return null;
    snapshot('คัดลอกงาน');
    var copy = blankTask(clone(t));
    copy.id = uid('t');
    copy.name = t.name + ' (สำเนา)';
    copy.completed = false;
    copy.completedAt = null;
    copy.likes = [];
    db.tasks.push(copy);

    projectsOfTask(id).forEach(function (x) {
      db.memberships.push({
        id: uid('m'), taskId: copy.id, projectId: x.project.id,
        sectionId: x.membership.sectionId,
        position: nextPosition(x.project.id, x.membership.sectionId)
      });
    });
    subtasks(id).forEach(function (s) {
      var sc = blankTask(clone(s));
      sc.id = uid('t');
      sc.parentId = copy.id;
      sc.completed = false;
      sc.completedAt = null;
      db.tasks.push(sc);
    });
    db.fieldValues.filter(function (v) { return v.taskId === id; })
      .forEach(function (v) {
        db.fieldValues.push({ taskId: copy.id, fieldId: v.fieldId, value: v.value });
      });
    commit();
    return copy;
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
      if (s) log(taskId, 'ย้ายไปคอลัมน์ ' + s.name);
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
      if (r.setAssignee) t.assigneeId = r.setAssignee;
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
    log(taskId, 'เพิ่มเข้าโปรเจกต์ ' + p.name);
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
    log(taskId, 'รอ “' + task(blockerId).name + '” ให้เสร็จก่อน');
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
      notify(taskId, (me() ? me().name : 'มีคน') + ' ถูกใจงานนี้', db.currentUserId);
    }
    commit();
  }

  function addAttachment(taskId, name, url) {
    var t = task(taskId);
    if (!t || !name) return;
    snapshot('แนบไฟล์');
    t.attachments.push({ id: uid('a'), name: name, url: url || '' });
    log(taskId, 'แนบ “' + name + '”');
    commit();
  }

  function removeAttachment(taskId, attId) {
    var t = task(taskId);
    if (!t) return;
    snapshot('ลบไฟล์แนบ');
    t.attachments = t.attachments.filter(function (a) { return a.id !== attId; });
    commit();
  }

  function addComment(taskId, text) {
    if (!text || !text.trim()) return;
    var clean = text.trim();
    db.stories.push({
      id: uid('st'), taskId: taskId, actorId: db.currentUserId,
      type: 'comment', text: clean, createdAt: new Date().toISOString()
    });
    var t = task(taskId);
    var mentioned = parseMentions(clean);
    mentioned.forEach(function (u) {
      if (t.followers.indexOf(u) < 0) t.followers.push(u);
    });
    var actor = me();
    notify(taskId, (actor ? actor.name : 'มีคน') + ' แสดงความเห็น',
      db.currentUserId, mentioned);
    commit();
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
    snapshot('แก้ ' + ids.length + ' งานพร้อมกัน');
    ids.forEach(function (id) { updateTask(id, clone(patch), { quiet: true }); });
    commit();
  }

  function bulkMove(ids, projectId, sectionId) {
    snapshot('ย้าย ' + ids.length + ' งาน');
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
    var n = db.notifications.filter(function (x) { return x.id === id; })[0];
    if (n) { n.read = true; commit(); }
  }
  function markAllRead(userId) {
    db.notifications.forEach(function (n) {
      if (n.userId === userId) n.read = true;
    });
    commit();
  }
  function archiveNotification(id) {
    var n = db.notifications.filter(function (x) { return x.id === id; })[0];
    if (n) { n.archived = true; n.read = true; commit(); }
  }
  function archiveAll(userId) {
    snapshot('เก็บการแจ้งเตือนทั้งหมด');
    db.notifications.forEach(function (n) {
      if (n.userId === userId) { n.archived = true; n.read = true; }
    });
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

  function setProjectStatus(id, state, text) {
    var p = project(id);
    if (!p) return;
    snapshot('อัปเดตสถานะโปรเจกต์');
    p.status = { state: state, text: text, by: db.currentUserId, at: today() };
    commit();
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
    snapshot('ลบโปรเจกต์');
    var _dp = project(id);
    audit("project.delete", _dp ? _dp.name : id, "งานที่อยู่เฉพาะโปรเจกต์นี้ถูกลบไปด้วย");
    var ms = db.memberships.filter(function (m) { return m.projectId === id; });
    ms.forEach(function (m) {
      var others = db.memberships.filter(function (x) {
        return x.taskId === m.taskId && x.projectId !== id;
      });
      if (!others.length) purgeTask(m.taskId);
    });
    db.memberships = db.memberships.filter(function (m) { return m.projectId !== id; });
    db.projects = db.projects.filter(function (p) { return p.id !== id; });
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
    p.fields.push({
      id: uid('f'), name: field.name || 'ฟิลด์ใหม่',
      type: field.type || 'text', options: normalizeOptions(field.options)
    });
    commit();
  }

  function renameField(projectId, fieldId, name) {
    var p = project(projectId);
    var f = p.fields.filter(function (x) { return x.id === fieldId; })[0];
    if (f && name) { f.name = name; commit(); }
  }

  function deleteField(projectId, fieldId) {
    var p = project(projectId);
    p.fields = p.fields.filter(function (f) { return f.id !== fieldId; });
    db.fieldValues = db.fieldValues.filter(function (v) { return v.fieldId !== fieldId; });
    commit();
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

  function saveView(projectId, name, view, icon) {
    var p = project(projectId);
    /* ชื่อซ้ำให้ทับของเดิม ไม่งั้นกดบันทึกสองครั้งจะได้มุมมองชื่อเดียวกันสองอัน
     * แล้วผู้ใช้จะแยกไม่ออกว่าอันไหนใหม่ */
    var old = p.savedViews.filter(function (v) { return v.name === name; })[0];
    if (old) {
      old.view = clone(view);
      if (icon) old.icon = icon;
    } else {
      p.savedViews.push({ id: uid('v'), name: name, icon: icon || '📊', view: clone(view) });
    }
    commit();
  }

  function deleteSavedView(projectId, viewId) {
    var p = project(projectId);
    p.savedViews = p.savedViews.filter(function (v) { return v.id !== viewId; });
    commit();
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
    audit("user.add", u.name, u.email + " · บทบาท " + u.role);
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
    var u = user(uid);
    if (!u || u.active === false) return null;

    var p = project(projectId);
    if (!p) return null;

    if (u.role === 'admin') return 'admin';        // ผู้ดูแลระบบเห็นทุกโปรเจกต์

    var m = (db.projectMembers || []).filter(function (x) {
      return x.projectId === projectId && x.userId === uid;
    })[0];

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
      var ms = db.memberships.filter(function (m) { return m.taskId === taskId; });
      if (!ms.length) return true;                  // งานที่ยังไม่ผูกกับโปรเจกต์ใด

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
    audit("user.role", u.name, "เปลี่ยนเป็น " + newRole);
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

  /* ---------- backup ---------- */

  function exportJSON() { return JSON.stringify(db, null, 2); }

  function importJSON(text) {
    var parsed = JSON.parse(text);
    if (!parsed.projects || !parsed.tasks) throw new Error('ไฟล์ไม่ถูกรูปแบบ');
    snapshot('กู้คืนข้อมูล');
    db = migrate(parsed);
    commit();
  }

  function reset() {
    snapshot('ล้างข้อมูล');
    db = migrate(seed());
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
    WORK_DAYS: WORK_DAYS, DEP_SHIFT: DEP_SHIFT,
    projectCsv: projectCsv, importTasksCsv: importTasksCsv,
    isWorkday: isWorkday, nextWorkday: nextWorkday,

    get db() { return db; },
    storageKind: storage.kind,
    setRemoteSave: setRemoteSave, replaceDb: replaceDb, snapshotJSON: snapshotJSON,
    wipeLocal: wipeLocal,
    onChange: onChange, commit: commit,
    snapshot: snapshot, undo: undo, canUndo: canUndo,

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

    createTask: createTask, updateTask: updateTask, deleteTask: deleteTask,
    deleteTasks: deleteTasks, duplicateTask: duplicateTask, moveTask: moveTask,
    addTaskToProject: addTaskToProject, removeTaskFromProject: removeTaskFromProject,
    addDependency: addDependency, removeDependency: removeDependency,
    setDependencyType: setDependencyType,
    toggleFollower: toggleFollower, toggleLike: toggleLike,
    addAttachment: addAttachment, removeAttachment: removeAttachment,
    addComment: addComment, setFieldValue: setFieldValue,
    bulkUpdate: bulkUpdate, bulkMove: bulkMove,

    markRead: markRead, markAllRead: markAllRead,
    archiveNotification: archiveNotification, archiveAll: archiveAll,

    createProject: createProject, updateProject: updateProject,
    deleteProject: deleteProject, duplicateProject: duplicateProject,
    setProjectStatus: setProjectStatus, archiveProject: archiveProject,
    addSection: addSection, renameSection: renameSection,
    deleteSection: deleteSection, moveSection: moveSection,
    addField: addField, renameField: renameField, deleteField: deleteField,
    colWidth: colWidth, setColWidth: setColWidth, resetColWidths: resetColWidths,
    addRule: addRule, deleteRule: deleteRule,
    saveView: saveView, deleteSavedView: deleteSavedView,
    saveTaskTemplate: saveTaskTemplate, applyTaskTemplate: applyTaskTemplate,
    deleteTaskTemplate: deleteTaskTemplate,

    addUser: addUser, removeUser: removeUser, setCurrentUser: setCurrentUser,
    adoptIdentity: adoptIdentity, ROLES: ROLES, ROLE_CAPS: ROLE_CAPS,
    PROJECT_ACCESS: PROJECT_ACCESS, projectMembers: projectMembers, projectAccess: projectAccess,
    visibleProjects: visibleProjects, canInProject: canInProject,
    setProjectVisibility: setProjectVisibility, setProjectLocked: setProjectLocked,
    setProjectMember: setProjectMember, removeProjectMember: removeProjectMember,
    isAdmin: isAdmin, setRole: setRole, can: can, role: role, adminCount: adminCount,
    setActive: setActive, isActive: isActive,
    audit: audit, auditLog: auditLog, auditGroups: auditGroups, auditCsv: auditCsv,
    signedInUsers: signedInUsers, recentActivity: recentActivity,
    setSetting: setSetting,

    exportJSON: exportJSON, importJSON: importJSON, reset: reset
  };

})(window);

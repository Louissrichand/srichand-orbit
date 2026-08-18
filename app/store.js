/* Orbit — data layer
 *
 * ทุกอย่างเก็บผ่าน adapter ตัวเดียว (hydrate / persist)
 * เวลาจะย้ายไป server จริง ให้แก้แค่ 2 ฟังก์ชันนั้น UI ไม่ต้องแตะเลย
 */
(function (global) {
  'use strict';

  var L = global.I18N.t;

  var KEY = 'orbit.db.v3';
  var LEGACY_KEYS = ['orbit.db.v2', 'orbit.db.v1', 'taskflow.db.v1'];   // ชื่อ/เวอร์ชันเดิม
  var SCHEMA = 3;

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
    { id: 'text',   label: 'ข้อความ' },
    { id: 'number', label: 'ตัวเลข' },
    { id: 'select', label: 'ตัวเลือก' },
    { id: 'date',   label: 'วันที่' },
    { id: 'person', label: 'บุคคล' }
  ];

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
      archived: false, defaultView: 'board',
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
    if (d.version < 3) {
      // เดิม dependsOn เก็บแค่ id ตอนนี้เก็บชนิดความสัมพันธ์มาด้วย
      d.tasks.forEach(function (t) { t.dependsOn = normalizeDeps(t.dependsOn); });
      d.version = 3;
    }
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
    return seed();
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
  }

  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function commit() {
    persist();
    listeners.forEach(function (fn) { fn(); });
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

  function myTasks(userId) {
    var t = today();
    var buckets = { overdue: [], today: [], upcoming: [], later: [], nodate: [] };
    db.tasks.forEach(function (item) {
      if (item.assigneeId !== userId || item.completed) return;
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
      return t.name.toLowerCase().indexOf(q) >= 0 ||
             (t.notes || '').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 60);
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

  function defaultView() {
    return {
      assignee: '', priority: '', tag: '', due: 'any',
      showCompleted: true, sort: 'manual', group: 'section'
    };
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

  function sortItems(items, sort) {
    if (!sort || sort === 'manual') return items;
    var copy = items.slice();
    copy.sort(function (a, b) {
      var ta = a.task, tb = b.task;
      if (sort === 'due') {
        return (ta.dueOn || '9999-99-99') < (tb.dueOn || '9999-99-99') ? -1 : 1;
      }
      if (sort === 'priority') return prioRank(ta.priority) - prioRank(tb.priority);
      if (sort === 'name') return ta.name.localeCompare(tb.name, 'th');
      if (sort === 'created') return ta.createdAt < tb.createdAt ? 1 : -1;
      if (sort === 'assignee') {
        var na = (user(ta.assigneeId) || { name: 'ฮฮฮ' }).name;
        var nb = (user(tb.assigneeId) || { name: 'ฮฮฮ' }).name;
        return na.localeCompare(nb, 'th');
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
    groups.forEach(function (g) { g.items = sortItems(g.items, view.sort); });
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
    var fv = db.fieldValues.filter(function (v) {
      return v.taskId === taskId && v.fieldId === fieldId;
    })[0];
    if (fv) {
      if (value === null || value === '') {
        db.fieldValues = db.fieldValues.filter(function (v) { return v !== fv; });
      } else { fv.value = value; }
    } else if (value !== null && value !== '') {
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
      fields: [], status: null, rules: [], savedViews: []
    };
    db.projects.push(p);
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

  function addField(projectId, field) {
    var p = project(projectId);
    p.fields.push({
      id: uid('f'), name: field.name || 'ฟิลด์ใหม่',
      type: field.type || 'text', options: field.options || []
    });
    commit();
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

  function saveView(projectId, name, view) {
    var p = project(projectId);
    p.savedViews.push({ id: uid('v'), name: name, view: clone(view) });
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

  function addUser(attrs) {
    var u = {
      id: uid('u'), name: attrs.name, email: attrs.email || '',
      color: PALETTE[db.users.length % PALETTE.length]
    };
    db.users.push(u);
    commit();
    return u;
  }

  function removeUser(id) {
    if (id === db.currentUserId) return false;
    snapshot('ลบสมาชิก');
    db.tasks.forEach(function (t) {
      if (t.assigneeId === id) t.assigneeId = null;
      t.followers = t.followers.filter(function (f) { return f !== id; });
      t.likes = t.likes.filter(function (f) { return f !== id; });
    });
    db.notifications = db.notifications.filter(function (n) { return n.userId !== id; });
    db.users = db.users.filter(function (u) { return u.id !== id; });
    commit();
    return true;
  }

  function setCurrentUser(id) { db.currentUserId = id; commit(); }

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
    db = seed();
    commit();
  }

  /* ---------- init ---------- */

  global.I18N.setLang(global.I18N.detect());
  db = hydrate();

  global.Store = {
    PRIORITIES: PRIORITIES, TASK_TYPES: TASK_TYPES,
    APPROVAL_STATES: APPROVAL_STATES, PROJECT_STATES: PROJECT_STATES,
    FIELD_TYPES: FIELD_TYPES, RECUR_FREQ: RECUR_FREQ, DEP_TYPES: DEP_TYPES,
    PALETTE: PALETTE,
    DUE_FILTERS: DUE_FILTERS, SORTS: SORTS, GROUPS: GROUPS,

    get db() { return db; },
    storageKind: storage.kind,
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
    inbox: inbox, unreadCount: unreadCount,
    defaultView: defaultView, viewGroups: viewGroups, matchesFilter: matchesFilter,
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
    addField: addField, deleteField: deleteField,
    addRule: addRule, deleteRule: deleteRule,
    saveView: saveView, deleteSavedView: deleteSavedView,
    saveTaskTemplate: saveTaskTemplate, applyTaskTemplate: applyTaskTemplate,
    deleteTaskTemplate: deleteTaskTemplate,

    addUser: addUser, removeUser: removeUser, setCurrentUser: setCurrentUser,
    setSetting: setSetting,

    exportJSON: exportJSON, importJSON: importJSON, reset: reset
  };

})(window);

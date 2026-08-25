/* Orbit — ภาษา / i18n
 *
 * ใช้ข้อความภาษาไทยเป็นคีย์ตรง ๆ ไม่ต้องตั้งชื่อ slug
 * ถ้าคีย์ไหนยังไม่มีคำแปล จะคืนภาษาไทยกลับไป (ไม่มีทางกลายเป็นช่องว่าง)
 *
 * ใส่ค่าแทนที่ด้วยปีกกา:  t('ลบ {n} งาน?', { n: 5 })
 */
(function (global) {
  'use strict';

  var EN = {
    /* --- ทั่วไป --- */
    'ฉัน': 'Me', 'บันทึก': 'Save', 'ยกเลิก': 'Cancel', 'ปิด': 'Close',
    'ลบ': 'Delete', 'เพิ่ม': 'Add', 'ใช้': 'Use', 'ส่ง': 'Send',
    'สร้าง': 'Create', 'ย้อนกลับ': 'Undo', 'ทั้งหมด': 'All', 'ทุกคน': 'Everyone',
    'เลือก': 'Select', 'ไม่พบงาน': 'No tasks found', 'ยังไม่มี': 'None yet',
    'เมื่อครู่': 'just now', 'วันนี้': 'Today', 'พรุ่งนี้': 'Tomorrow',
    'เมื่อวาน': 'Yesterday', 'ไปวันนี้': 'Go to today',
    '{n} นาทีที่แล้ว': '{n} min ago', '{n} ชม.ที่แล้ว': '{n} hr ago',

    /* --- แถบซ้าย --- */
    'งานของฉัน': 'My Tasks', 'กล่องข้อความ': 'Inbox', 'ปฏิทินรวม': 'All calendars',
    'โปรเจกต์': 'Projects', 'เก็บเข้าคลัง': 'Archived', 'คีย์ลัด': 'Shortcuts',
    'สมาชิกทีม': 'Team members', 'ตั้งค่า / สำรองข้อมูล': 'Settings / Backup',

    /* --- แท็บมุมมอง --- */
    'รายการ': 'List', 'บอร์ด': 'Board', 'ไทม์ไลน์': 'Timeline',
    'ปฏิทิน': 'Calendar', 'สรุปผล': 'Dashboard',

    /* --- แถบบน --- */
    'ค้นหางาน…  (/)': 'Search tasks…  (/)', '+ เพิ่มงาน': '+ Add task',
    'เมนูโปรเจกต์': 'Project menu', 'อ่านทั้งหมด': 'Mark all read',
    'เก็บทั้งหมด': 'Archive all', 'ผลการค้นหา “{q}”': 'Results for “{q}”',
    'พบ': 'Found', 'ไม่พบงานที่ตรงกับ “{q}”': 'No tasks match “{q}”',

    /* --- ตัวกรอง --- */
    'ผู้รับผิดชอบ': 'Assignee', 'ความสำคัญ': 'Priority', 'แท็ก': 'Tags',
    'กำหนดส่ง': 'Due date', 'เรียง': 'Sort', 'จัดกลุ่ม': 'Group',
    'บันทึกมุมมอง': 'Save view', 'ล้างตัวกรอง': 'Clear filters',
    'ลบมุมมอง': 'Delete view', 'ตั้งชื่อมุมมองนี้': 'Name this view',
    'บันทึกมุมมองแล้ว': 'View saved',
    '☑ แสดงงานที่เสร็จ': '☑ Showing completed', '☐ ซ่อนงานที่เสร็จ': '☐ Hiding completed',
    'ไม่มีงานที่ตรงกับตัวกรอง': 'No tasks match these filters',

    'ทุกกำหนด': 'Any due date', 'เลยกำหนด': 'Overdue', 'ครบวันนี้': 'Due today',
    'ภายใน 7 วัน': 'Next 7 days', 'ไม่มีกำหนด': 'No due date',
    'ลำดับที่จัดเอง': 'Manual order', 'ชื่อ ก-ฮ': 'Name A–Z',
    'วันที่สร้าง': 'Date created', 'คอลัมน์': 'Section',
    'ช่วงกำหนดส่ง': 'Due date range', 'ไม่จัดกลุ่ม': 'No grouping',
    'ยังไม่มอบหมาย': 'Unassigned', 'สัปดาห์นี้': 'This week',
    'หลังจากนั้น': 'Later', 'ไม่มีงานค้างเลย': 'Nothing due — all clear',

    /* --- ความสำคัญ / ชนิดงาน --- */
    'ด่วนมาก': 'Urgent', 'สูง': 'High', 'กลาง': 'Medium', 'ต่ำ': 'Low',
    'ไม่ระบุ': 'None',
    'งานทั่วไป': 'Task', 'หมุดหมาย': 'Milestone', 'ขออนุมัติ': 'Approval',
    'รออนุมัติ': 'Pending', 'อนุมัติแล้ว': 'Approved',
    'ขอแก้ไข': 'Changes requested', 'ไม่อนุมัติ': 'Rejected',
    'ตามแผน': 'On track', 'เสี่ยง': 'At risk', 'หลุดแผน': 'Off track',
    'ทุกวัน': 'Daily', 'ทุกสัปดาห์': 'Weekly', 'ทุกเดือน': 'Monthly',
    'ทุก {n} วัน': 'Every {n} days', 'ทุก {n} สัปดาห์': 'Every {n} weeks',
    'ทุก {n} เดือน': 'Every {n} months',

    /* --- ชนิดความสัมพันธ์ --- */
    'จบ → เริ่ม': 'Finish → Start', 'เริ่ม → เริ่ม': 'Start → Start',
    'จบ → จบ': 'Finish → Finish', 'เริ่ม → จบ': 'Start → Finish',
    'งานก่อนต้องเสร็จ งานนี้จึงเริ่มได้': 'The earlier task must finish before this one starts',
    'เริ่มพร้อมกัน หรือหลังงานก่อนเริ่ม': 'Starts together with, or after, the earlier task',
    'จบพร้อมกัน หรือหลังงานก่อนจบ': 'Finishes together with, or after, the earlier task',
    'งานก่อนเริ่มแล้ว งานนี้จึงจบได้': 'The earlier task must start before this one finishes',

    /* --- การ์ด / แถวงาน --- */
    'ทำเสร็จ': 'Mark complete', 'ทำเครื่องหมายว่าเสร็จ': 'Mark complete',
    'ทำเสร็จแล้ว': 'Completed', 'ถูกบล็อก': 'Blocked',
    'รองานอื่นให้เสร็จก่อน': 'Waiting on another task', 'ทำซ้ำ': 'Repeats',
    'เพิ่มคอลัมน์': 'Add section', '+ เพิ่มคอลัมน์': '+ Add section',
    'เปลี่ยนชื่อ': 'Rename', 'ย้ายขึ้น': 'Move up', 'ย้ายลง': 'Move down',
    'ย้ายซ้าย': 'Move left', 'ย้ายขวา': 'Move right',
    'ชื่อคอลัมน์ใหม่': 'New section name', 'เปลี่ยนชื่อคอลัมน์': 'Rename section',
    'ลบคอลัมน์นี้? งานข้างในจะย้ายไปคอลัมน์แรก':
      'Delete this section? Its tasks move to the first section',
    'ต้องเหลืออย่างน้อย 1 คอลัมน์': 'At least one section must remain',
    'ชื่องาน แล้วกด Enter': 'Task name, then press Enter',
    'ชื่องานใหม่': 'New task name', 'ชื่องานย่อย': 'Subtask name',
    'เลือก {n} งาน': '{n} selected', 'มอบหมายให้…': 'Assign to…',
    'ความสำคัญ…': 'Priority…', 'ตั้งกำหนดส่ง': 'Set due date',
    'เปิดใหม่': 'Reopen',

    /* --- แผงรายละเอียด --- */
    'ชนิดงาน': 'Task type', 'การอนุมัติ': 'Approval',
    'วันเริ่ม': 'Start date', 'เวลา (ไม่บังคับ)': 'Time (optional)',
    'ไม่ทำซ้ำ': 'Does not repeat', 'ทุกกี่รอบ': 'Every N',
    'รายละเอียด': 'Description', 'เพิ่มรายละเอียด…': 'Add a description…',
    'ลำดับก่อนหลัง': 'Dependencies', 'ไฟล์แนบ': 'Attachments',
    'ผู้ติดตาม': 'Followers', 'งานย่อย': 'Subtasks',
    'ความเคลื่อนไหว': 'Activity', 'เพิ่มงานย่อย': 'Add subtask',
    '+ เพิ่มงานย่อย': '+ Add subtask', '+ เพิ่ม': '+ Add', '+ แท็ก': '+ Tag',
    '+ เพิ่มโปรเจกต์': '+ Add to project',
    'ยังไม่มีความสัมพันธ์กับงานอื่น': 'No dependencies yet',
    'ยังไม่มีไฟล์แนบ': 'No attachments yet', 'รอ': 'waits for', 'บล็อก': 'blocks',
    'ถูกใจ': 'Like', 'ติดตาม': 'Follow', 'เลิกติดตาม': 'Unfollow',
    'เมนู': 'Menu', 'ลบงาน': 'Delete task',
    'เขียนความเห็น… พิมพ์ @ชื่อ เพื่อแจ้งเตือน (Ctrl+Enter ส่ง)':
      'Write a comment… type @name to notify (Ctrl+Enter to send)',
    'ชื่อแท็ก': 'Tag name',
    'รออยู่: {list}': 'Waiting on: {list}',
    'งานต้องอยู่อย่างน้อย 1 โปรเจกต์': 'A task must belong to at least one project',

    /* --- Gantt --- */
    'ชื่องาน': 'Task name', 'รออะไรอยู่': 'Blocked by',
    'วัน': 'Day', 'สัปดาห์': 'Week', 'เดือน': 'Month', 'ไตรมาส': 'Quarter',
    'ขยายทุกกลุ่ม': 'Expand all', 'ย่อทุกกลุ่ม': 'Collapse all',
    'ย่อ/ขยาย': 'Collapse / expand',
    'ลากไปงานอื่นเพื่อสร้างลำดับ': 'Drag to another task to create a dependency',
    'ลากแท่ง = เลื่อนวัน · ลากขอบ = ยืด/หด · ลากจุดวงกลมปลายแท่งไปอีกงาน = สร้างลำดับ · คลิกเส้น = ลบลำดับ':
      'Drag a bar to move it · drag an edge to resize · drag an end dot onto another task to link · click a line to remove it',
    'ลากแท่งเพื่อเลื่อนวัน · ลากขอบเพื่อยืด/หด · ◆ = หมุดหมาย · เส้นประ = ลำดับก่อนหลัง':
      'Drag a bar to move it · drag an edge to resize · ◆ = milestone · dashed line = dependency',
    'ยังไม่มีงานที่มีวันที่': 'No dated tasks yet',
    'ใส่วันเริ่มหรือกำหนดส่งให้งาน แล้วจะเห็นแท่งเวลาที่นี่':
      'Give a task a start or due date and its bar appears here',
    'สร้างลำดับแบบ {type} แล้ว': 'Created a {type} dependency',
    'สร้างไม่ได้ — ซ้ำเดิม หรือจะทำให้เกิดการรอวนกัน':
      'Cannot link — already exists, or it would create a loop',
    'เพิ่มไม่ได้ — จะทำให้เกิดการรอวนกัน': 'Cannot add — it would create a loop',
    'เพิ่มลำดับก่อนหลังแล้ว': 'Dependency added',
    'ลบลำดับ “{a}” → “{b}” ?': 'Remove dependency “{a}” → “{b}”?',
    'ลบลำดับแล้ว': 'Dependency removed',
    'งานนี้ต้องรออะไรให้เสร็จก่อน': 'What must finish before this task?',
    'พิมพ์เพื่อค้นหางาน': 'Type to search tasks',
    'เสร็จแล้ว': 'Completed', 'ยังไม่เสร็จ': 'Not done',
    'เลื่อนวันแล้ว': 'Dates moved',

    /* --- สรุปผล --- */
    'สถานะโปรเจกต์': 'Project status', 'อัปเดตสถานะ': 'Update status',
    'ยังไม่มีการอัปเดตสถานะ': 'No status update yet',
    'งานทั้งหมด': 'Total tasks', 'ยังค้าง': 'Open',
    'ครบใน 7 วัน': 'Due in 7 days', 'ความคืบหน้ารวม {p}%': 'Overall progress {p}%',
    'ตามผู้รับผิดชอบ': 'By assignee', 'ตามความสำคัญ': 'By priority',
    'ตามคอลัมน์': 'By section', 'ยังไม่มีข้อมูล': 'No data yet',
    'แท่ง = สัดส่วนงานที่เสร็จของแต่ละคน': 'Bar = share of that person’s tasks completed',
    'สรุปให้ทีมอ่าน': 'Summary for the team',
    'งานเดินถึงไหน ติดอะไร ต้องการอะไร': 'Where things stand, what is blocked, what is needed',
    'อัปเดตสถานะแล้ว': 'Status updated',

    /* --- กล่องข้อความ --- */
    'ยังไม่เก็บ': 'Unarchived', 'เก็บแล้ว': 'Archived',
    'ไม่มีการแจ้งเตือนใหม่': 'No new notifications',
    'ยังไม่มีรายการที่เก็บไว้': 'Nothing archived yet',
    '(งานถูกลบแล้ว)': '(task deleted)', 'เก็บ': 'Archive',
    'เก็บทั้งหมดแล้ว': 'All archived',
    '{who} พูดถึงคุณในความเห็น': '{who} mentioned you in a comment',
    '{who} แสดงความเห็น': '{who} commented',
    '{who} ถูกใจงานนี้': '{who} liked this task',
    'งาน “{name}” พร้อมทำต่อแล้ว': '“{name}” is unblocked and ready',

    /* --- บันทึกกิจกรรม --- */
    'ทำงานนี้เสร็จแล้ว': 'completed this task',
    'เปิดงานนี้อีกครั้ง': 'reopened this task',
    'มอบหมายให้ {who}': 'assigned it to {who}',
    'ยกเลิกผู้รับผิดชอบ': 'removed the assignee',
    'ตั้งกำหนดส่ง {date}': 'set the due date to {date}',
    'ลบกำหนดส่ง': 'removed the due date',
    'เปลี่ยนสถานะอนุมัติเป็น “{state}”': 'set approval to “{state}”',
    'ย้ายไปคอลัมน์ {name}': 'moved it to {name}',
    'ถูกทำเครื่องหมายเสร็จโดยกฎอัตโนมัติ': 'was completed by an automation rule',
    'เพิ่มเข้าโปรเจกต์ {name}': 'added it to {name}',
    'รอ “{name}” ให้เสร็จก่อน': 'now waits for “{name}”',
    'แนบ “{name}”': 'attached “{name}”',

    /* --- โปรเจกต์ --- */
    'สร้างโปรเจกต์ใหม่': 'New project', 'แก้ไขโปรเจกต์': 'Edit project',
    'ชื่อโปรเจกต์': 'Project name', 'คำอธิบาย': 'Description',
    'ไอคอน': 'Icon', 'สี': 'Colour',
    'คอลัมน์เริ่มต้น (คั่นด้วยจุลภาค)': 'Starting sections (comma separated)',
    'เช่น เปิดตัวสินค้าใหม่ 2026': 'e.g. Product launch 2026',
    '✎ แก้ไขชื่อ / สี / ไอคอน': '✎ Edit name / colour / icon',
    '◆ อัปเดตสถานะโปรเจกต์': '◆ Update project status',
    '⊞ จัดการฟิลด์': '⊞ Manage fields', '⚡ กฎอัตโนมัติ': '⚡ Automation rules',
    '⧉ คัดลอกเป็นเทมเพลต': '⧉ Duplicate as template',
    '📦 เก็บเข้าคลัง': '📦 Archive', '↩ เอากลับจากคลัง': '↩ Restore from archive',
    '🗑 ลบโปรเจกต์': '🗑 Delete project',
    'สร้างโปรเจกต์แล้ว': 'Project created',
    'เก็บเข้าคลังแล้ว': 'Archived', 'เอากลับจากคลังแล้ว': 'Restored',
    'คัดลอกโปรเจกต์แล้ว': 'Project duplicated', 'ลบโปรเจกต์แล้ว': 'Project deleted',
    'เก็บเข้าคลังแล้ว ': 'Archived ',
    'คัดลอกงานทั้งหมดไปด้วยหรือไม่?\n\nตกลง = คัดลอกงานด้วย\nยกเลิก = เอาแค่โครงคอลัมน์และฟิลด์':
      'Copy all tasks too?\n\nOK = include tasks\nCancel = structure and fields only',
    'ลบโปรเจกต์ “{name}” ?\nงานที่อยู่เฉพาะในโปรเจกต์นี้จะถูกลบด้วย':
      'Delete project “{name}”?\nTasks that live only here will be deleted too',

    /* --- งาน (เมนู) --- */
    '⧉ คัดลอกงาน': '⧉ Duplicate task',
    '☆ บันทึกเป็นเทมเพลต': '☆ Save as template',
    '🔗 คัดลอกลิงก์ของงานนี้': '🔗 Copy link to this task',
    '🗑 ลบงาน': '🗑 Delete task',
    'ลบงาน “{name}” ?': 'Delete task “{name}”?',
    'ลบงานแล้ว': 'Task deleted', 'คัดลอกงานแล้ว': 'Task duplicated',
    'คัดลอกลิงก์แล้ว': 'Link copied', 'บันทึกเป็นเทมเพลตแล้ว': 'Saved as template',
    'ชื่อเทมเพลต': 'Template name',
    'ลบ {n} งาน?': 'Delete {n} tasks?', 'ลบแล้ว': 'Deleted',
    'เพิ่มเข้าโปรเจกต์แล้ว': 'Added to project',
    'เพิ่มงานนี้เข้าโปรเจกต์อื่น': 'Add this task to another project',
    'งานชิ้นเดียวอยู่ได้หลายโปรเจกต์ แก้ที่ไหนก็อัปเดตทุกที่':
      'One task can live in several projects — edit it anywhere, it updates everywhere',
    'อยู่ครบทุกโปรเจกต์แล้ว': 'Already in every project',
    'กำหนดส่งใหม่ (ปปปป-ดด-วว) เว้นว่างเพื่อลบ':
      'New due date (YYYY-MM-DD), leave blank to clear',

    /* --- ไฟล์แนบ --- */
    'แนบไฟล์หรือลิงก์': 'Attach a file or link',
    'ระบบยังไม่เก็บตัวไฟล์จริง ให้ใส่ชื่อไฟล์และวางลิงก์จาก SharePoint / OneDrive / Google Drive':
      'Files are not stored yet — give it a name and paste a link from SharePoint, OneDrive or Google Drive',
    'ชื่อไฟล์': 'File name', 'ลิงก์ (ไม่บังคับ)': 'Link (optional)',
    'เช่น brief.pdf': 'e.g. brief.pdf', 'แนบ': 'Attach',
    'ใส่ชื่อไฟล์ก่อน': 'Enter a file name first',

    /* --- ฟิลด์ --- */
    'ฟิลด์ของ {name}': 'Fields in {name}', 'ยังไม่มีฟิลด์': 'No fields yet',
    'ชื่อฟิลด์ใหม่': 'New field name', 'ชนิด': 'Type',
    'ตัวเลือก (เฉพาะชนิด “ตัวเลือก” คั่นด้วยจุลภาค)':
      'Options (dropdown type only, comma separated)',
    'เพิ่มฟิลด์': 'Add field', 'ใส่ชื่อฟิลด์ก่อน': 'Enter a field name first',
    'เช่น ช่องทาง, งบประมาณ': 'e.g. Channel, Budget',
    'ข้อความ': 'Text', 'ตัวเลข': 'Number', 'ตัวเลือก': 'Options',
    'วันที่': 'Date', 'บุคคล': 'Person',

    /* --- กฎอัตโนมัติ --- */
    'กฎอัตโนมัติ — {name}': 'Automation rules — {name}',
    'เมื่อลากงานเข้าคอลัมน์ที่กำหนด ให้ทำสิ่งเหล่านี้อัตโนมัติ':
      'When a task is dragged into a section, do this automatically',
    'ยังไม่มีกฎ': 'No rules yet', 'เมื่อย้ายเข้า “{name}”': 'When moved into “{name}”',
    'ยังไม่ได้ตั้งการกระทำ': 'No actions set',
    'เมื่อย้ายเข้าคอลัมน์': 'When moved into section',
    'ให้ทำเครื่องหมายเสร็จ': 'Mark complete', 'ไม่': 'No', 'ใช่': 'Yes',
    'มอบหมายให้': 'Assign to', 'ไม่เปลี่ยน': 'Leave unchanged',
    'ตั้งความสำคัญ': 'Set priority', 'ติดแท็ก': 'Add tag',
    'เว้นว่างถ้าไม่ต้องการ': 'Leave blank to skip', 'เพิ่มกฎ': 'Add rule',
    'เพิ่มกฎแล้ว': 'Rule added',
    'ทำเครื่องหมายเสร็จ': 'mark complete',
    'ตั้งความสำคัญเป็น {p}': 'set priority to {p}',
    'ติดแท็ก {tag}': 'add tag {tag}',

    /* --- เทมเพลต --- */
    'เทมเพลตงาน': 'Task templates',
    'ยังไม่มีเทมเพลต — เปิดงานที่ต้องการ กดปุ่ม ⋯ แล้วเลือก “บันทึกเป็นเทมเพลต”':
      'No templates yet — open a task, click ⋯ and choose “Save as template”',
    '{n} งานย่อย': '{n} subtasks',

    /* --- สมาชิก --- */
    'เพิ่มสมาชิกใหม่': 'Add member', 'ชื่อ': 'Name', 'อีเมล': 'Email',
    'ลบสมาชิกคนนี้?': 'Remove this member?', 'สลับผู้ใช้': 'Switch user',
    'สลับเป็น {who} แล้ว': 'Switched to {who}', 'ใส่ชื่อก่อน': 'Enter a name first',

    /* --- ตั้งค่า --- */
    'ตั้งค่า': 'Settings', 'ธีม': 'Theme', 'ภาษา': 'Language',
    'ตามระบบ': 'System', 'สว่าง': 'Light', 'มืด': 'Dark',
    'ข้อมูลปัจจุบัน': 'Current data',
    '{p} โปรเจกต์ · {t} งาน · {u} สมาชิก · {n} แจ้งเตือน':
      '{p} projects · {t} tasks · {u} members · {n} notifications',
    '⬇ ดาวน์โหลดสำรอง': '⬇ Download backup',
    '⬆ กู้คืนจากไฟล์': '⬆ Restore from file',
    '☆ เทมเพลตงาน': '☆ Task templates',
    '📋 คัดลอกข้อมูล': '📋 Copy data',
    '📥 วางข้อมูลกู้คืน': '📥 Paste to restore',
    'ล้างและเริ่มใหม่': 'Reset everything',
    'ข้อมูลเก็บอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น ควรกด “ดาวน์โหลดสำรอง” เก็บไว้สม่ำเสมอ ถ้าล้างข้อมูลเบราว์เซอร์ ข้อมูลจะหายทั้งหมด':
      'Data lives only in this browser. Download a backup regularly — clearing browsing data erases everything.',
    'โหมดทดลอง': 'Trial mode',
    'ข้อมูลจะหายเมื่อรีเฟรชหน้า': 'data is lost when the page reloads',
    'คัดลอกข้อมูลสำรอง': 'Copy backup data',
    'เลือกทั้งหมดแล้วคัดลอกไปเก็บไว้ในไฟล์ .json หรือโน้ตของคุณ':
      'Select all and copy it into a .json file or your notes',
    'คัดลอกทั้งหมด': 'Copy all', 'คัดลอกแล้ว': 'Copied',
    'คัดลอกอัตโนมัติไม่ได้ — กด Ctrl+C เอง': 'Auto-copy blocked — press Ctrl+C',
    'วางข้อมูลกู้คืน': 'Paste to restore',
    'วางข้อมูล JSON ที่สำรองไว้ แล้วกดกู้คืน — ข้อมูลปัจจุบันจะถูกแทนที่ทั้งหมด':
      'Paste your backup JSON and restore — this replaces everything currently here',
    'วางข้อมูลที่นี่': 'Paste data here', 'กู้คืน': 'Restore',
    'ยังไม่ได้วางข้อมูล': 'Nothing pasted yet',
    'กู้คืนข้อมูลสำเร็จ': 'Data restored',
    'ข้อมูลไม่ถูกต้อง: {msg}': 'Invalid data: {msg}',
    'ไฟล์ไม่ถูกต้อง: {msg}': 'Invalid file: {msg}',
    'ไฟล์ไม่ถูกรูปแบบ': 'Unrecognised file format',
    'ล้างข้อมูลทั้งหมดและเริ่มใหม่?\nแนะนำให้ดาวน์โหลดสำรองก่อน':
      'Erase everything and start over?\nDownload a backup first.',
    'ดาวน์โหลดไฟล์สำรองแล้ว': 'Backup downloaded',
    'บันทึกไฟล์สำรองแล้ว': 'Backup saved',
    'ยกเลิกการบันทึก': 'Save cancelled',
    'กำลังรอการยืนยันอยู่ ลองใหม่อีกครั้ง': 'A prompt is already open — try again',
    'บันทึกไม่สำเร็จ — ใช้ “คัดลอกข้อมูล” แทนได้':
      'Save failed — use “Copy data” instead',
    'บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็ม': 'Save failed — storage is full',
    'ย้อนกลับแล้ว: {what}': 'Undone: {what}',
    'ไม่มีอะไรให้ย้อนกลับ': 'Nothing to undo',
    'สลับธีมแล้ว': 'Theme switched',
    'มอบหมายให้ตัวเองแล้ว': 'Assigned to you',
    'โหมดทดลอง — ข้อมูลจะหายเมื่อรีเฟรช กด “ดาวน์โหลดสำรอง” เพื่อเก็บงานไว้':
      'Trial mode — data is lost on reload. Use “Download backup” to keep your work.',

    /* --- คีย์ลัด --- */
    'ไปที่ช่องค้นหา': 'Jump to search',
    'ปิดหน้าต่าง / ยกเลิกการเลือก': 'Close dialog / clear selection',
    'ส่งความเห็น': 'Post comment', 'เปิดหน้าคีย์ลัดนี้': 'Open this shortcut list',
    'ไปหน้าแรก': 'Go to Home',
    'ไปงานของฉัน': 'Go to My Tasks', 'ไปกล่องข้อความ': 'Go to Inbox',
    'เพิ่มงานด่วน': 'Quick add task',
    'มอบหมายงานที่เปิดอยู่ให้ตัวเอง': 'Assign the open task to me',
    'ไปที่ช่องความเห็น': 'Jump to the comment box',
    'สลับโหมดสว่าง/มืด': 'Toggle light / dark',
    'Enter ในช่องเพิ่มงาน': 'Enter in the add-task box',
    'บันทึกแล้วเปิดช่องต่อทันที': 'Saves and reopens the box',
    'ลบงานที่เลือกไว้': 'Delete selected tasks',
    'คลิกช่องสี่เหลี่ยม': 'Click a checkbox',
    'เลือกหลายงานเพื่อแก้พร้อมกัน': 'Select several tasks to edit at once',

    /* --- ข้อมูลตัวอย่าง --- */
    'สมชาย': 'Somchai', 'มานี': 'Manee', 'ปิติ': 'Piti',
    'เปิดตัวสินค้าใหม่': 'Product Launch',
    'ตัวอย่างแผนเปิดตัวสินค้า ทั้งช่องทางออนไลน์และออฟไลน์':
      'Sample launch plan covering both online and offline channels',
    'คอนเทนต์รายเดือนทุกช่องทาง': 'Monthly content across every channel',
    'งานระบบภายใน': 'Internal systems work',
    'กำลังทำ': 'In progress', 'รอตรวจ': 'In review', 'เสร็จแล้ว ': 'Done ',
    'ไอเดีย': 'Ideas', 'เขียนบท': 'Scripting', 'ถ่าย/ผลิต': 'Shooting',
    'ลงแล้ว': 'Published', 'ค้างอยู่': 'To do',
    'ช่องทาง': 'Channel', 'ออฟไลน์': 'Offline', 'งบ (บาท)': 'Budget (THB)',
    'รูปแบบ': 'Format',
    'งานเตรียมเปิดตัวเดินตามแผน รอผลตรวจข้อความโฆษณารอบสุดท้าย':
      'Launch prep is on track, pending the final copy review',
    'สรุปแนวทางแบรนด์ให้ทีมดีไซน์': 'Brief the design team on brand direction',
    'ใช้เอกสารแนวทางแบรนด์เป็นตัวตั้ง': 'Start from the brand guideline document',
    'เปิดร้านค้าออนไลน์อย่างเป็นทางการ': 'Open the official online store',
    'เตรียมเอกสารจดทะเบียนให้ครบก่อน': 'Get all registration documents ready first',
    'ถ่ายภาพสินค้า 12 รายการ': 'Shoot 12 product photos',
    'ทำอาร์ตเวิร์กแพ็กเกจตัวจริง': 'Produce final packaging artwork',
    'ตรวจข้อความโฆษณากับฝ่ายกฎหมาย': 'Legal review of advertising copy',
    'รอยืนยันรอบสุดท้ายก่อนใช้จริง': 'Awaiting final sign-off before going live',
    'วางงบสื่อรายไตรมาส': 'Plan quarterly media budget',
    'สรุปราคาขายและโปรโมชันเปิดตัว': 'Finalise pricing and launch promotion',
    'วันเปิดตัวอย่างเป็นทางการ': 'Official launch day',
    'คอนเทนต์ให้ความรู้ 8 ตอน': 'Eight-part educational series',
    'สคริปต์คลิปรีวิวจากผู้ใช้จริง': 'Script for real-user review clips',
    'ถ่ายคลิปสั้นชุดแรก 4 ตัว': 'Shoot the first four short clips',
    'ตารางลงคอนเทนต์เดือนหน้า': 'Next month posting schedule',
    'ตั้งระบบจัดการงานภายใน': 'Set up the internal task system',
    'ประเมินว่าทีมใช้งานได้จริงไหม': 'Check whether the team can really use it',
    'ต่อระบบล็อกอินขององค์กร': 'Connect company single sign-on',
    'สำรองข้อมูลอัตโนมัติรายวัน': 'Daily automatic backup',
    'จองสตูดิโอ': 'Book the studio',
    'เตรียม prop และฉาก': 'Prepare props and set',
    'รีทัชและส่งไฟล์': 'Retouch and deliver files',
    'ขอไฟล์โลโก้เวอร์ชัน vector ด้วยนะครับ @ฉัน': 'Could you send the vector logo too ',

    /* --- ชิ้นส่วนจากการต่อสตริง --- */
    'เพิ่มงาน': 'Add task', 'เพิ่มโปรเจกต์': 'Add to project',
    'โปรเจกต์ใหม่': 'New project', 'ลบโปรเจกต์': 'Delete project',
    'จัดการฟิลด์': 'Manage fields', 'กฎอัตโนมัติ': 'Automation rules',
    'กฎอัตโนมัติ —': 'Automation rules —',
    'คัดลอกงาน': 'Duplicate task', 'คัดลอกเป็นเทมเพลต': 'Duplicate as template',
    'คัดลอกลิงก์ของงานนี้': 'Copy link to this task',
    'บันทึกเป็นเทมเพลต': 'Save as template',
    'แก้ไขชื่อ / สี / ไอคอน': 'Edit name / colour / icon',
    'อัปเดตสถานะโปรเจกต์': 'Update project status', 'สถานะ': 'Status',
    'ฟิลด์ของ': 'Fields in', 'เมื่อย้ายเข้า “': 'When moved into “',
    'ตั้งความสำคัญเป็น': 'set priority to',
    'ความคืบหน้ารวม': 'Overall progress',
    'งาน': 'tasks', 'งาน ·': 'tasks ·', 'งาน?': 'tasks?',
    'โปรเจกต์ ·': 'projects ·', 'สมาชิก ·': 'members ·', 'แจ้งเตือน': 'notifications',
    'อื่น ๆ': 'more', 'แล้ว': '',
    'นาทีที่แล้ว': 'min ago', 'ชม.ที่แล้ว': 'hr ago',
    'ทุก {n} ': 'Every {n} ',
    'สลับเป็น': 'Switched to', 'ย้อนกลับแล้ว:': 'Undone:',
    'สร้างลำดับแบบ': 'Created dependency',
    'ลบลำดับ “': 'Remove dependency “', ') — คลิกเพื่อลบ': ') — click to remove',
    'ลบงาน “': 'Delete task “', 'ลบโปรเจกต์ “': 'Delete project “',
    'ผลการค้นหา “': 'Results for “', 'ไม่พบงานที่ตรงกับ “': 'No tasks match “',
    'ข้อมูลไม่ถูกต้อง:': 'Invalid data:', 'ไฟล์ไม่ถูกต้อง:': 'Invalid file:',
    'เช่น เปิดตัวสินค้าใหม่': 'e.g. Product launch',
    'ค้างอยู่, กำลังทำ, รอตรวจ, เสร็จแล้ว': 'To do, In progress, In review, Done',
    'เวลา (ไม่บังคับ': 'Time (optional',
    'ปิดหน้าต่าง / แผงรายละเอียด': 'Close dialog / detail panel',
    'ย้อนกลับการกระทำล่าสุด': 'Undo the last action',
    '◆ หมุดหมาย': '◆ Milestone', '⛔ ถูกบล็อก': '⛔ Blocked',
    '⛔ รออยู่:': '⛔ Waiting on:', '✓ งานของฉัน': '✓ My Tasks',
    '📅 ปฏิทินรวม': '📅 All calendars', '🔔 กล่องข้อความ': '🔔 Inbox',
    '— ลากเพื่อเลื่อนวัน': '— drag to move',
    '— ลากเพื่อเลื่อน ลากขอบเพื่อยืด/หด': '— drag to move, drag edges to resize',
    'ลากแท่ง = เลื่อนวัน · ลากขอบ = ยืด/หด ·':
      'Drag a bar to move · drag an edge to resize ·',
    'ลากจุดวงกลมปลายแท่งไปอีกงาน = สร้างลำดับ · คลิกเส้น = ลบลำดับ':
      'drag an end dot onto another task to link · click a line to remove it',
    'ข้อมูลเก็บอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น ควรกด “ดาวน์โหลดสำรอง” เก็บไว้สม่ำเสมอ':
      'Data lives only in this browser — download a backup regularly.',
    'ถ้าล้างข้อมูลเบราว์เซอร์ ข้อมูลจะหายทั้งหมด':
      'Clearing browsing data erases everything.',
    '— เบราว์เซอร์นี้ไม่อนุญาตให้เก็บข้อมูล': '— this browser will not store data',
    'ใช้งานได้ครบทุกอย่าง แต่': 'Everything works, but',
    'ถ้าอยากเก็บงานไว้ ให้กด “ดาวน์โหลดสำรอง” ก่อนปิดหน้า':
      'To keep your work, use “Download backup” before closing.',
    'สมชาย พูดถึงคุณในความเห็น': 'Somchai mentioned you in a comment',

    '” ?\nงานที่อยู่เฉพาะในโปรเจกต์นี้จะถูกลบด้วย': '”?\nTasks that live only here will be deleted too',

    'เอากลับจากคลัง': 'Restore from archive', 'เก็บโปรเจกต์เข้าคลัง': 'Archive project',
    /* --- ฟิลด์ในตาราง --- */
    'ตัวเลือกเดียว': 'Single-select', 'หลายตัวเลือก': 'Multi-select',
    'ชื่อฟิลด์': 'Field title', 'ชื่อตัวเลือก': 'Option name',
    'เช่น สถานะ, ผู้อนุมัติ, งบ': 'e.g. Status, Approver, Budget',
    'เพิ่มตัวเลือก': 'Add an option', 'สร้างฟิลด์': 'Create field',
    'ต้องมีอย่างน้อย 1 ตัวเลือก': 'At least one option is required',
    'ใส่ตัวเลือกอย่างน้อย 1 รายการ': 'Add at least one option',
    'เพิ่มฟิลด์แล้ว': 'Field added', 'เปลี่ยนชื่อฟิลด์': 'Rename field',
    'ลบฟิลด์นี้? ค่าที่กรอกไว้ทั้งหมดจะหายด้วย':
      'Delete this field? Every value in it will be lost.',
    'ลบฟิลด์แล้ว': 'Field deleted',

    'ดาวน์โหลดสำรอง': 'Download backup', 'กู้คืนจากไฟล์': 'Restore from file',
    'คัดลอกข้อมูล': 'Copy data', 'รออยู่:': 'Waiting on:',
    'ลากเพื่อปรับความกว้าง': 'Drag to resize',
    'คืนความกว้างคอลัมน์เดิม': 'Reset column widths',
    'คืนความกว้างคอลัมน์เดิมแล้ว': 'Column widths reset',
    'สลับทิศการเรียง': 'Flip sort direction',

    /* --- บัญชีบริษัทและการซิงก์ --- */
    'เข้าสู่ระบบด้วยบัญชีบริษัท': 'Sign in with your work account',
    'ใช้บัญชี Microsoft 365 ของบริษัท เพื่อให้ทั้งทีมเห็นงานชุดเดียวกัน':
      'Use your company Microsoft 365 account so the whole team sees the same work.',
    'เข้าสู่ระบบด้วย Microsoft': 'Sign in with Microsoft',
    'กำลังพาไปหน้าเข้าสู่ระบบ…': 'Taking you to sign in…',
    'กำลังตรวจสอบการเข้าสู่ระบบ…': 'Checking your sign-in…',
    'ลองใช้แบบเครื่องเดียวก่อน (ข้อมูลไม่แชร์กับทีม)':
      'Try it on this device only (not shared with the team)',
    'ข้อมูลเก็บอยู่ใน Microsoft 365 ของบริษัทเท่านั้น ไม่ผ่านเซิร์ฟเวอร์อื่น':
      'Data stays in your company Microsoft 365. No other server is involved.',
    'บัญชีบริษัท': 'Work account', 'ออกจากระบบ': 'Sign out',
    'ข้อมูลส่วนกลาง': 'Shared data', 'ซิงก์ล่าสุด': 'Last synced',
    'ดึงข้อมูลล่าสุดเดี๋ยวนี้': 'Sync now',
    'กำลังโหลดข้อมูล…': 'Loading…', 'กำลังบันทึก…': 'Saving…',
    'ซิงก์แล้ว': 'Synced', 'ออฟไลน์': 'Offline',
    'ข้อมูลชนกัน': 'Conflict', 'ซิงก์ไม่สำเร็จ': 'Sync failed',
    'มีคนแก้ข้อมูลชุดเดียวกันพร้อมกับเรา ต้องเลือกว่าจะเก็บชุดไหน':
      'Someone edited the same data at the same time. Choose which version to keep.',
    'บันทึกงานของฉันเป็นไฟล์ก่อน': 'Save my version to a file first',
    'ใช้ข้อมูลส่วนกลาง ทิ้งของฉัน': 'Use the shared version, discard mine',
    'เขียนทับส่วนกลางด้วยของฉัน': 'Overwrite shared with mine',
    'เขียนทับข้อมูลส่วนกลางด้วยงานของคุณแล้ว': 'Shared data overwritten with your version',
    'ใช้ข้อมูลจากส่วนกลางแล้ว': 'Now using the shared version',
    'เชื่อมกับข้อมูลส่วนกลางของบริษัทแล้ว': 'Connected to your company data',
    'ใช้งานแบบเครื่องเดียว ข้อมูลจะอยู่ในเบราว์เซอร์นี้เท่านั้น':
      'Single-device mode — data stays in this browser only',
    'เข้าสู่ระบบไม่สำเร็จ': 'Sign-in failed',
    'เริ่มระบบเข้าสู่ระบบไม่สำเร็จ': 'Could not start sign-in',
    'เข้าถึงที่เก็บข้อมูลส่วนกลางไม่ได้': 'Could not reach the shared storage',
    'บัญชีนี้ไม่มีสิทธิ์เข้าถึงที่เก็บข้อมูล': 'This account cannot access the storage location',
    'ไม่พบไซต์หรือโฟลเดอร์ที่ตั้งค่าไว้': 'The configured site or folder was not found',
    'สิทธิ์หมดอายุ ลองเข้าสู่ระบบใหม่': 'Your session expired — please sign in again',
    'ไฟล์ข้อมูลกลางเสียหาย อ่านไม่ออก': 'The shared data file is unreadable',
    'มีคนอื่นแก้ข้อมูลก่อนหน้านี้': 'Someone else changed the data first',
    'ยังไม่ได้ตั้งค่าการเข้าสู่ระบบ': 'Sign-in is not configured',
    'ยังไม่ได้เข้าสู่ระบบ': 'Not signed in',
    'ไม่ทราบสาเหตุ': 'Unknown error',
    'กำลังบันทึกงานที่ค้างก่อนออกจากระบบ…': 'Saving your pending work before signing out…',
    'บันทึกงานที่ค้างไม่สำเร็จ ยังไม่ออกจากระบบ ลองใหม่อีกครั้ง':
      'Could not save your pending work — still signed in. Please try again.',

    /* --- หน้าผู้ดูแลระบบ --- */
    'ผู้ดูแลระบบ': 'Admin', 'ผู้ดูแล': 'Admin', 'สมาชิก': 'Member',
    'สมาชิกและสิทธิ์': 'Members & permissions', 'คน': 'people',
    'ใครเข้าถึงโปรเจกต์นี้ได้': 'Who can access this project',
    'เปิดให้ทั้งองค์กร': 'Open to everyone',
    'พนักงานทุกคนเห็นและเข้าทำงานได้': 'All staff can see it and work in it',
    'ปิด เห็นเฉพาะคนที่เชิญ': 'Private — invited people only',
    'ไม่ขึ้นในเมนูของคนอื่น และเปิดจากลิงก์ตรงก็ไม่ได้':
      'Hidden from other people’s menus, and a direct link will not open it',
    'ล็อกรายชื่อสมาชิก': 'Lock the member list',
    'สมาชิกเชิญคนเพิ่มเองไม่ได้ ต้องให้ผู้ดูแลระบบทำเท่านั้น':
      'Members cannot invite anyone — only a system admin can',
    'สมาชิกของโปรเจกต์': 'Project members',
    'ยังไม่มีสมาชิก ยังไม่มีใครเข้าโปรเจกต์นี้ได้': 'No members yet — nobody can open this project',
    'โปรเจกต์นี้ถูกล็อก เฉพาะผู้ดูแลระบบเท่านั้นที่เพิ่มหรือถอดสมาชิกได้':
      'This project is locked — only a system admin can add or remove members',
    'ให้สิทธิ์ระดับ': 'Access level', 'เพิ่มเข้าโปรเจกต์': 'Add to project',
    'ถอดออกจากโปรเจกต์': 'Remove from project',
    'ถอด “{name}” ออกจากโปรเจกต์นี้?': 'Remove “{name}” from this project?',
    'ต้องเหลือผู้ดูแลโปรเจกต์อย่างน้อยหนึ่งคน': 'A project must keep at least one project admin',
    'ไม่มีคนให้เพิ่มแล้ว': 'Everyone has already been added',
    'ล็อกรายชื่อสมาชิกแล้ว': 'Member list locked', 'ปลดล็อกแล้ว': 'Unlocked',
    'โปรเจกต์ปิด': 'Private project',
    'ผู้ดูแลโปรเจกต์': 'Project admin', 'จัดการสมาชิกและลบโปรเจกต์ได้': 'Manage members and delete the project',
    'แก้ไขได้': 'Editor', 'สร้างและแก้งาน จัดโครงสร้างโปรเจกต์ได้': 'Create and edit tasks, change project structure',
    'แสดงความเห็นได้': 'Commenter', 'ดูและคอมเมนต์ได้ แต่แก้งานไม่ได้': 'View and comment, but cannot edit tasks',
    'เปิดดูได้ แก้และคอมเมนต์ไม่ได้': 'View only — cannot edit or comment',
    'ในเวอร์ชันนี้การกันสิทธิ์ทำที่หน้าจอ เมื่อย้ายไปฐานข้อมูลแล้วจะบังคับที่เซิร์ฟเวอร์จริง':
      'In this version access is enforced in the browser. Once we move to the database it will be enforced on the server.',
    'เปลี่ยนความเป็นส่วนตัว': 'Change privacy',
    'เปลี่ยนเป็นโปรเจกต์ปิด': 'made private', 'เปลี่ยนเป็นเปิดให้ทั้งองค์กร': 'made open to everyone',
    'ล็อกโปรเจกต์': 'locked project', 'ปลดล็อกโปรเจกต์': 'unlocked project',
    'ตั้งสิทธิ์ในโปรเจกต์': 'Set project access',
    'ถอดสมาชิกออกจากโปรเจกต์': 'Remove project member',
    'บันทึกการทำงาน': 'Activity log',
    '{n} รายการ': '{n} entries', 'พบ {n} รายการ': 'Found {n}',
    'ส่งออก CSV': 'Export CSV', 'ทั้งหมด': 'All',
    'ค้นหาในบันทึก…': 'Search the log…',
    'ยังไม่มีบันทึกที่ตรงกับเงื่อนไข': 'No entries match this filter',
    'แสดง {n} รายการล่าสุด กด “ส่งออก CSV” เพื่อดูทั้งหมด':
      'Showing the {n} most recent — use “Export CSV” to see everything',
    'กิจกรรมของงานล่าสุด': 'Recent task activity',
    'การเข้าใช้งาน': 'Sign-in', 'จัดการสมาชิก': 'Members',
    'บัญชีของคุณถูกปิดใช้งาน': 'Your account has been disabled',
    'บัญชีนี้ถูกผู้ดูแลระบบปิดการใช้งานไว้ จึงเข้าถึงข้อมูลงานไม่ได้':
      'An administrator disabled this account, so it cannot access any work data.',
    'หากคิดว่าเป็นความผิดพลาด กรุณาติดต่อฝ่ายเทคโนโลยีสารสนเทศ':
      'If you believe this is a mistake, please contact the IT department.',
    'ระบบ': 'System', 'ความปลอดภัย': 'Security',
    /* ข้อความในบันทึกการทำงาน ขึ้นต้นด้วย "ได้" ทุกอันเพื่อไม่ให้คีย์ชนกับปุ่ม
     * ดูคำอธิบายเต็มที่ AUDIT_TEXT ใน render.js */
    'ได้เข้าสู่ระบบ': 'signed in', 'ได้เข้าสู่ระบบครั้งแรก': 'signed in for the first time',
    'ได้ออกจากระบบ': 'signed out', 'ถูกปฏิเสธการเข้าถึง': 'was denied access',
    'ได้เพิ่มสมาชิก': 'added member', 'ได้ลบสมาชิก': 'removed member',
    'ได้เปลี่ยนบทบาทของ': 'changed the role of',
    'ได้ปิดใช้งานบัญชีของ': 'disabled the account of',
    'ได้เปิดใช้งานบัญชีของ': 'enabled the account of',
    'ได้โอนงานต่อจาก': 'handed over the open tasks of',
    'ได้ตั้งสถานะไม่อยู่': 'set themselves as away',
    'ได้ยกเลิกสถานะไม่อยู่': 'is back',
    'ได้สร้างโปรเจกต์': 'created project', 'ได้คัดลอกโปรเจกต์': 'duplicated project',
    'ได้ลบโปรเจกต์': 'deleted project',
    'ได้เปลี่ยนความเป็นส่วนตัวของ': 'changed the privacy of',
    'ได้ล็อกรายชื่อสมาชิกของ': 'locked the member list of',
    'ได้ปลดล็อกรายชื่อสมาชิกของ': 'unlocked the member list of',
    'ได้ตั้งสิทธิ์ในโปรเจกต์': 'set project access in',
    'ได้ถอดสมาชิกออกจากโปรเจกต์': 'removed a member from',
    'ได้ตั้งเส้นฐานของ': 'set the baseline of',
    'ได้ลบเส้นฐานของ': 'cleared the baseline of',
    'ได้นำเข้างานเข้าโปรเจกต์': 'imported tasks into',
    'ได้ส่งออกงานของโปรเจกต์': 'exported tasks from',
    'ได้สร้างพอร์ตโฟลิโอ': 'created portfolio',
    'ได้ลบพอร์ตโฟลิโอ': 'deleted portfolio',
    'ได้เพิ่มโปรเจกต์เข้าพอร์ตโฟลิโอ': 'added a project to portfolio',
    'ได้ถอดโปรเจกต์ออกจากพอร์ตโฟลิโอ': 'removed a project from portfolio',
    'ได้ล้างข้อมูลทั้งหมด': 'cleared all data',
    'ได้ส่งออกข้อมูล': 'exported data', 'ได้นำเข้าข้อมูล': 'imported data',
    'ปิดใช้งาน': 'Disabled', 'รหัสผ่าน': 'Password',
    'ปิดใช้งานบัญชี': 'Disable account', 'เปิดใช้งานอีกครั้ง': 'Enable again',
    'ปิดใช้งานบัญชีของ “{name}”?\nเขาจะเข้าระบบไม่ได้ทันที แต่งานที่มอบหมายไว้ยังอยู่ครบ':
      'Disable the account of “{name}”?\nThey lose access immediately, but their assigned tasks stay.',
    'ปิดบัญชีนี้ไม่ได้': 'Cannot disable this account',
    'ปิดใช้งานบัญชีแล้ว': 'Account disabled',
    'เปิดใช้งานบัญชีอีกครั้งแล้ว': 'Account enabled again',
    'ส่งออกบันทึกการทำงานเป็น CSV': 'Exported the activity log as CSV',
    'บทบาทที่จะให้': 'Role to assign',
    'ค้นหาจากรายชื่อพนักงานบริษัท': 'Search your company directory',
    'พิมพ์ชื่อหรืออีเมล อย่างน้อย 2 ตัวอักษร': 'Type a name or email — at least 2 characters',
    'ไม่เจอชื่อ? กรอกเอง': 'Not listed? Enter manually',
    'ไม่พบชื่อนี้ในบริษัท': 'No one in the directory matches that',
    'กำลังค้นหา…': 'Searching…',
    'ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง': 'Search failed — please try again',
    'บัญชีนี้ไม่มีสิทธิ์อ่านรายชื่อพนักงาน': 'This account cannot read the company directory',
    'มีอยู่แล้ว': 'Already added', 'เพิ่มแล้ว': 'Added',
    'เพิ่มด้วยข้อมูลที่กรอก': 'Add from the fields above',
    'กรอกอีเมลให้ตรงกับบัญชีบริษัท ไม่งั้นตอนเจ้าตัวล็อกอินจะกลายเป็นคนละรายการ':
      'Use their exact work email — otherwise they will appear as a separate person when they sign in.',
    'ยังไม่เคยเข้าใช้': 'Never signed in',
    'ลบออกจากรายชื่อ': 'Remove from list',
    'แต่ละระดับทำอะไรได้บ้าง': 'What each level can do',
    'จัดการสมาชิก สิทธิ์ และโปรเจกต์ได้ทั้งหมด': 'Manage members, permissions and all projects',
    'สร้างและแก้ไขงานได้ทุกงาน': 'Create and edit any task',
    'บุคคลภายนอก': 'External guest',
    'เห็นเฉพาะโปรเจกต์ที่ถูกเชิญ สร้างโปรเจกต์เองไม่ได้':
      'Sees only the projects they are invited to, and cannot create projects',
    'ดูอย่างเดียว': 'View only',
    'เปิดดูได้ทุกอย่าง แก้และแสดงความเห็นไม่ได้': 'Can see everything, but cannot edit or comment',
    'ตอนนี้ระดับ “ดูอย่างเดียว” ยังบังคับได้จริงก็ต่อเมื่อตั้งสิทธิ์บนไซต์ SharePoint ของคนนั้นเป็น Read ด้วย เมื่อย้ายไปฐานข้อมูลแล้ว API จะบังคับให้เอง':
      '“View only” is, for now, genuinely enforced only if that person’s SharePoint site permission is also set to Read. Once the data moves to the database, the API enforces it.',
    'การเพิ่มหรือลบที่นี่ไม่ได้ให้หรือถอนสิทธิ์เข้าถึงข้อมูล ต้องเพิ่มหรือเอาออกจากไซต์ SharePoint ควบคู่กันเสมอ':
      'Adding or removing here does not grant or revoke access to the data — always do the same on the SharePoint site.',
    'อย่าลืมเพิ่มคนนี้เข้าไซต์ SharePoint ด้วย ไม่งั้นเขาจะล็อกอินเข้ามาแล้วเปิดข้อมูลไม่ได้':
      'Remember to add this person to the SharePoint site too, or they will sign in but cannot open the data.',
    'บทบาทของคุณคือ “{role}” จึงทำสิ่งนี้ไม่ได้': 'Your role is “{role}”, so you cannot do this',
    'สิทธิ์ของคุณในโปรเจกต์นี้คือ “{acc}” จึงทำสิ่งนี้ไม่ได้':
      'Your access to this project is “{acc}”, so you cannot do this',
    'เพิ่ม “{name}” เข้ารายชื่อแล้ว': 'Added “{name}” to the list',
    'เอา “{name}” ออกจากรายชื่อ?\nงานที่มอบหมายไว้จะกลายเป็นยังไม่มอบหมาย':
      'Remove “{name}” from the list?\nTheir assigned tasks become unassigned.',
    'เอาออกจากรายชื่อแล้ว': 'Removed from the list',
    'ลบคนนี้ไม่ได้': 'Cannot remove this person',
    'ใส่ชื่อก่อน': 'Enter a name first',
    'บทบาท': 'Role', 'ชื่อ': 'Name', 'เข้าใช้ล่าสุด': 'Last active', 'รายชื่อสมาชิก': 'Members',
    '(คุณ)': '(you)', 'คนที่เคยล็อกอิน': 'signed in',
    'ต้องมีผู้ดูแลอย่างน้อยหนึ่งคน': 'There must be at least one admin',
    'บทบาทที่นี่ใช้จัดระเบียบ ไม่ใช่กำแพงความปลอดภัย':
      'Roles here organise the team — they are not a security boundary',
    'Orbit ทำงานในเบราว์เซอร์ จึงบังคับสิทธิ์จริงไม่ได้ ถ้าต้องการให้ใครแก้ไม่ได้จริง ให้ตั้งสิทธิ์บนไซต์ SharePoint เป็น Read แล้ว Microsoft จะปฏิเสธการบันทึกให้เอง':
      'Orbit runs in the browser, so it cannot enforce permissions. To truly stop someone editing, set their SharePoint site permission to Read — Microsoft will reject their writes.',
    'ที่เก็บข้อมูล': 'Data storage',
    'โหมดการทำงาน': 'Mode',
    'ทีม — ข้อมูลอยู่ส่วนกลาง': 'Team — shared storage',
    'เครื่องเดียว — ข้อมูลไม่แชร์กับทีม': 'Single device — not shared',
    'ที่อยู่ไฟล์': 'File location', 'ที่เก็บ': 'Stored in',
    'เบราว์เซอร์เครื่องนี้': 'This browser',
    'หน่วยความจำ (หายเมื่อรีเฟรช)': 'Memory (lost on refresh)',
    'ยังไม่เคย': 'Never', 'สถานะ': 'Status',
    'ขนาดข้อมูล': 'Data size', 'จำนวนงาน': 'Total tasks',
    'ยังไม่มีใครล็อกอินด้วยบัญชีบริษัท รายชื่อจะขึ้นเองเมื่อมีคนเข้าใช้งาน':
      'Nobody has signed in with a work account yet — names appear here automatically.',
    'มีผู้ใช้ตัวอย่างค้างอยู่ {n} รายการ — เป็นข้อมูลสมมติจากตอนทดลอง ลบทิ้งได้ที่ “สมาชิกทีม”':
      '{n} sample users left over from the demo data — remove them under “Team members”.',
    'กิจกรรมล่าสุด': 'Recent activity', 'ยังไม่มีกิจกรรม': 'No activity yet',
    'แสดงความเห็น': 'commented on',
    /* --- หน้าแรก --- */
    'หน้าแรก': 'Home',
    'สวัสดีตอนเช้า': 'Good morning', 'สวัสดีตอนบ่าย': 'Good afternoon',
    'สวัสดีตอนเย็น': 'Good evening',
    '{greet}, {name}': '{greet}, {name}',
    '{dow}ที่ {d} {mon}': '{dow}, {mon} {d}',
    '{n} งานเสร็จสัปดาห์นี้': '{n} tasks completed this week',
    '{n} งานเลยกำหนด': '{n} overdue',
    '{n} งานครบกำหนดใน 7 วัน': '{n} due in 7 days',
    '{n} เพื่อนร่วมงาน': '{n} collaborators',
    'กำลังจะถึง': 'Upcoming', 'เลยกำหนด ({n})': 'Overdue ({n})',
    'สัปดาห์นี้ ({n})': 'This week ({n})',
    'งานที่ฉันมอบหมาย': 'Tasks I’ve assigned',
    'ดูทั้งหมด': 'See all', 'ดูโปรเจกต์ทั้งหมด': 'Browse projects',
    'งานใกล้ครบกำหนด {n} งาน': '{n} due soon',
    'ไม่มีงานใกล้ครบกำหนด': 'Nothing due soon',
    'ดูเพิ่ม': 'Show more', 'ย่อกลับ': 'Show less',
    'ไม่มีงานในช่วงนี้': 'Nothing here',
    'ยังไม่ได้มอบหมายงานให้ใคร': 'You have not assigned any tasks yet',
    'ยังไม่มีโปรเจกต์': 'No projects yet',
    'เปิดหน้านี้เป็นหน้าแรกทุกครั้ง': 'Open this page on start',

    /* --- แถบเครื่องมือ Gantt --- */
    'ตัวกรอง': 'Filter', 'ตัวเลือก': 'Options', 'ค้นหาในผัง': 'Search this chart',
    'มุมมองที่บันทึกไว้': 'Saved views', 'ยังไม่ได้ตั้งชื่อมุมมอง': 'Name the view first',
    'เลื่อนไปทางซ้าย': 'Scroll left', 'เลื่อนไปทางขวา': 'Scroll right',
    'ดูช่วงกว้างขึ้น': 'Zoom out', 'ดูละเอียดขึ้น': 'Zoom in',
    'ครึ่งปี': 'Half-year', 'ปี': 'Years',
    'ระดับการซูม': 'Zoom',
    'ซ่อนไว้': 'Collapsed', 'กางออก': 'Expanded',
    'ชื่อมุมมอง': 'View name',
    'รูปแบบการแสดงผล': 'Layout options', 'ระบายสีแท่งงานตาม': 'Color tasks by',
    'สีของโปรเจกต์': 'Theme color', 'สถานะอนุมัติ': 'Approval status',
    'ความคืบหน้า': 'Progress',
    'สีช่วยให้กวาดตาแล้วเห็นภาพรวมทันที เช่น เลือก “ความคืบหน้า” แล้วแท่งแดงคืองานที่เลยกำหนด':
      'Color makes the whole plan readable at a glance — pick “Progress” and every red bar is a task past its due date.',
    'การจัดตารางและเส้นฐาน': 'Dependency settings',
    'เลื่อนงานที่รออยู่ให้อัตโนมัติ': 'Auto-schedule dependent tasks',
    'เมื่อเลื่อนงานหนึ่ง งานที่รอต่อจากมันจะถูกดันตามให้ลำดับยังถูกต้อง ไม่ดึงงานที่เว้นระยะไว้กลับมาชิด และไม่แตะงานที่ทำเสร็จแล้ว':
      'When you move a task, everything waiting on it shifts along so the sequence still holds. Gaps you left on purpose are kept, and completed tasks are never moved.',
    'เปิดการเลื่อนงานที่รออยู่ให้อัตโนมัติแล้ว': 'Auto-scheduling on',
    'ปิดการเลื่อนอัตโนมัติแล้ว': 'Auto-scheduling off',
    'เลื่อนวันแล้ว และดันงานที่รออยู่ต่ออีก {n} งาน': 'Dates moved · {n} dependent tasks shifted',
    'ตั้งเส้นฐานไว้เมื่อ {when}': 'Baseline set {when}',
    'ยังไม่ได้ตั้งเส้นฐาน': 'No baseline yet',
    'แสดงเส้นฐาน': 'Show baseline',
    'เส้นจาง ๆ ใต้แท่งคือแผนเดิม เทียบแล้วรู้ทันทีว่าหลุดไปกี่วัน':
      'The faint line under each bar is the original plan — the gap is how far it has slipped.',
    'ต้องตั้งเส้นฐานก่อนจึงจะแสดงได้': 'Set a baseline first',
    'ตั้งเส้นฐานจากวันปัจจุบัน': 'Set baseline from today’s dates',
    'ตั้งเส้นฐานใหม่จากวันปัจจุบัน': 'Reset baseline to today’s dates',
    'ลบเส้นฐาน': 'Clear baseline',
    'เส้นฐานคือภาพถ่ายวันที่ของทุกงาน ณ ตอนที่กด ใช้ตอบคำถามว่า “แผนเดิมบอกว่าเสร็จวันไหน” ตั้งใหม่ได้ทุกเมื่อ แต่ของเดิมจะถูกทับ':
      'A baseline is a snapshot of every task’s dates at the moment you press it — it answers “what did the original plan say?”. You can reset it any time, but the previous one is overwritten.',
    'ตั้งเส้นฐานใหม่? แผนเดิมที่บันทึกไว้จะถูกทับ':
      'Reset the baseline? The plan saved earlier will be overwritten.',
    'ลบเส้นฐานที่บันทึกไว้?': 'Delete the saved baseline?',
    'ตั้งเส้นฐานแล้ว': 'Baseline set', 'ลบเส้นฐานแล้ว': 'Baseline cleared',
    'แผนเดิม': 'Original plan',
    'ช้ากว่าแผน {n} วัน': '{n} days behind plan',
    'เร็วกว่าแผน {n} วัน': '{n} days ahead of plan',
    'แสดง/ซ่อนคอลัมน์': 'Show/hide columns',
    'เลือกคอลัมน์ที่จะแสดงในตารางฝั่งซ้าย': 'Choose which columns appear in the table on the left',
    'ระยะเวลา': 'Duration', 'บล็อกงานอะไร': 'Blocking', '{n} วัน': '{n} days',
    'ซ่อนอยู่ {n}': '{n} hidden', 'แสดงครบ': 'All shown',
    'ใช้อยู่ {n}': '{n} active', 'ไม่มี': 'None',
    'แสดงงานที่เสร็จแล้ว': 'Show completed tasks',
    'เรียงลำดับ': 'Sorts', 'เรียงตาม': 'Sort by', 'ไม่ได้เรียง': 'None',
    'น้อยไปมาก': 'Ascending', 'มากไปน้อย': 'Descending',
    'จัดกลุ่มตาม': 'Group by',

    /* --- เมนูและการตั้งค่าโปรเจกต์ --- */
    'ตั้งค่าโปรเจกต์': 'Project settings', 'ตั้งสีและไอคอน': 'Set colour & icon',
    'คัดลอกลิงก์โปรเจกต์': 'Copy project link', 'คัดลอกโปรเจกต์': 'Duplicate project',
    'นำเข้างานจาก CSV': 'Import tasks from CSV', 'ส่งออกเป็น CSV': 'Export to CSV',
    'ส่งออกไฟล์ CSV แล้ว': 'CSV exported', 'คัดลอกลิงก์แล้ว': 'Link copied',
    'นำเข้าไม่สำเร็จ:': 'Import failed:',
    'นำเข้า {n} งานแล้ว': 'Imported {n} tasks',
    'นำเข้า {n} งาน และสร้างคอลัมน์ใหม่ {s} คอลัมน์': 'Imported {n} tasks and created {s} new sections',
    'บันทึกการตั้งค่าแล้ว': 'Settings saved',

    'รายละเอียดโปรเจกต์': 'Project details', 'ลำดับก่อนหลัง': 'Dependencies',
    'ตารางวันทำงาน': 'Scheduling',
    'เจ้าของโปรเจกต์': 'Project owner', 'ยังไม่ระบุ': 'Not set',
    'กำหนดส่งของโปรเจกต์': 'Project due date',
    'มุมมองที่เปิดเป็นค่าเริ่มต้น': 'Default view',
    'คำอธิบายโปรเจกต์': 'Project description',
    'โปรเจกต์นี้เกี่ยวกับอะไร': 'What is this project about?',
    'สมาชิกโปรเจกต์': 'Project members',

    'การเลื่อนวันของงานที่พึ่งพากัน': 'Dependency date shifting',
    'เลือกว่าเมื่อเลื่อนงานหนึ่ง งานที่ผูกลำดับไว้กับมันควรขยับตามอย่างไร':
      'Choose how tasks linked by a dependency shift when you move one of them.',
    'กินระยะห่าง': 'Consume buffer',
    'ขยับงานที่รออยู่เฉพาะตอนที่วันชนกันจริง ระยะห่างที่เว้นไว้ทำหน้าที่เป็นกันชน':
      'Dependent tasks move only when the dates actually collide — the gap you left acts as a buffer.',
    'รักษาระยะห่าง': 'Maintain buffer',
    'ขยับงานที่พึ่งพากันด้วยระยะเท่ากับที่งานต้นทางขยับ ระยะห่างเดิมคงอยู่เท่าเดิม':
      'Linked tasks move by the same number of days, so the gap between them stays exactly as it was.',
    'ไม่ขยับ': 'None',
    'ปล่อยให้วันของงานอื่นอยู่ที่เดิม แม้จะทับซ้อนกับงานที่เพิ่งเลื่อน':
      'Leave every other task where it is, even if the dates now overlap.',
    'เฉพาะงานที่รออยู่ข้างหน้า': 'For downstream dependent tasks only',
    'งานที่พึ่งพากันทั้งสองทาง': 'For all dependent tasks',
    'ทุกโหมดคงระยะเวลาของงานไว้เท่าเดิม คือเลื่อนทั้งช่วง ไม่ยืดไม่หด และไม่แตะงานที่ทำเสร็จแล้ว':
      'Every mode keeps each task’s duration unchanged — the whole bar slides, it never stretches — and completed tasks are never touched.',

    'กำหนดวันทำงานของโปรเจกต์ เวลาระบบเลื่อนวันให้อัตโนมัติจะได้ไม่ไปตกวันหยุด':
      'Set the project’s working days so automatic date shifts do not land on a non-working day.',
    'วันทำงาน': 'Work days', 'ทุกวัน (ไม่มีวันหยุด)': 'Every day',
    'จันทร์ – ศุกร์': 'Monday – Friday', 'จันทร์ – เสาร์': 'Monday – Saturday',
    'ตอนนี้มี {n} งานที่ครบกำหนดตรงวันหยุด ระบบไม่ย้ายให้เอง เพราะวันที่คนตั้งไว้เองต้องเคารพไว้ก่อน':
      '{n} tasks are currently due on a non-working day. Orbit does not move them for you — a date a person set by hand is left alone.',
    'ไม่มีงานไหนครบกำหนดตรงวันหยุด': 'No task is due on a non-working day',
    'วันทำงานของโปรเจกต์': 'Project work days',
    'หรือพิมพ์อีโมจิเอง': 'Or type an emoji',


    /* --- สถานะโปรเจกต์ --- */
    'ตั้งสถานะ': 'Set status',
    'พักไว้ก่อน': 'On hold', 'เสร็จสมบูรณ์': 'Complete', 'ยกเลิกแล้ว': 'Dropped',
    'เขียนรายงานสถานะ': 'Write a status update', 'ล้างสถานะ': 'Clear status',
    'รายงานสถานะ': 'Status update', 'รายงานก่อนหน้า': 'Previous updates',
    'ตั้งสถานะเป็น “{s}” แล้ว': 'Status set to “{s}”',
    'ล้างสถานะแล้ว': 'Status cleared',

    /* --- เมนูบัญชีและตั้งค่าของฉัน --- */
    'ทำงานอยู่': 'Active', 'ไม่อยู่': 'Away',
    'ตั้งสถานะไม่อยู่': 'Set out of office',
    'ไม่อยู่ถึง {d}': 'Away until {d}',
    'ไม่อยู่ถึงวันที่': 'Away until',
    'ข้อความสั้น ๆ (ไม่บังคับ)': 'Short note (optional)',
    'เช่น ลาพักร้อน ติดต่อคุณมานีแทน': 'e.g. On leave — contact Manee instead',
    'ระหว่างนี้ชื่อของคุณจะมีจุดสีส้มกำกับ คนที่กำลังจะมอบหมายงานให้จะได้รู้ก่อน':
      'Your name gets an amber dot while you are away, so anyone about to assign you work sees it first.',
    'ยกเลิกสถานะไม่อยู่': 'Clear out of office',
    'ยกเลิกสถานะไม่อยู่แล้ว': 'Out of office cleared',
    'ตั้งสถานะไม่อยู่ถึง {d} แล้ว': 'Away until {d}',
    'เลือกวันที่กลับมาก่อน': 'Pick a return date first',
    'องค์กรของฉัน': 'My organisation', 'ตั้งค่า': 'Settings', 'โปรไฟล์': 'Profile',
    'สลับผู้ใช้ (ทดสอบ)': 'Switch user (testing)',

    'ทั่วไป': 'General', 'การแจ้งเตือน': 'Notifications',
    'บัญชี': 'Account', 'การแสดงผล': 'Display', 'ข้อมูลและสำรอง': 'Data & backup',
    'หน้าที่เปิดเมื่อเข้าแอป': 'Open this page on start',
    'เปิดใช้คีย์ลัด': 'Enable keyboard shortcuts',
    'กด Tab ค้างแล้วตามด้วยตัวอักษร เพื่อข้ามไปหน้าต่าง ๆ ปิดไว้ถ้าพิมพ์ไทยแล้วชนกัน':
      'Hold Tab then press a letter to jump between pages. Turn off if it clashes with your typing.',
    'ถามยืนยันก่อนลบงาน': 'Confirm before deleting a task',
    'ปิดไว้ถ้าลบงานบ่อยและมั่นใจว่ากด Ctrl+Z ทัน':
      'Turn off if you delete often and trust Ctrl+Z to catch mistakes.',
    'ดูคีย์ลัดทั้งหมด': 'See all shortcuts',

    'ชื่อที่แสดง': 'Display name', 'ตำแหน่งงาน': 'Job title',
    'ฝ่ายหรือทีม': 'Department or team', 'เกี่ยวกับฉัน': 'About me',
    'สีประจำตัว': 'Your colour', 'ยังไม่ได้ระบุตำแหน่ง': 'No job title yet',
    'เช่น ผู้จัดการฝ่ายพัฒนาธุรกิจ': 'e.g. Business Development Manager',
    'เช่น พัฒนาธุรกิจ': 'e.g. Business Development',
    'ทำอะไรอยู่ ถนัดเรื่องไหน ติดต่อยังไงเร็วที่สุด':
      'What you work on, what you are good at, the fastest way to reach you',
    'Orbit ใช้ตัวย่อชื่อบนวงกลมสี ไม่ใช้รูปถ่าย รูปถ่ายทำให้ไฟล์ข้อมูลใหญ่ขึ้นมากโดยไม่ช่วยให้หางานเจอเร็วขึ้น':
      'Orbit uses coloured initials rather than photos — photos bloat the data file a great deal without helping anyone find work faster.',
    'บันทึกโปรไฟล์แล้ว': 'Profile saved',

    'เลือกว่าเรื่องไหนควรขึ้นในกล่องข้อความ ปิดเรื่องที่ไม่สำคัญออก กล่องข้อความจะได้ยังน่าอ่าน':
      'Choose what lands in your inbox. Switch off what does not matter to you and the inbox stays worth reading.',
    'มีคนมอบหมายงานให้ฉัน': 'A task is assigned to me',
    'ได้รับงานใหม่ หรือถูกเปลี่ยนตัวผู้รับผิดชอบ': 'A new task, or the assignee changed to you',
    'มีคนพูดถึงฉันในความเห็น': 'Someone mentions me in a comment',
    'มีคนพิมพ์ @ชื่อ ของคุณไว้': 'Someone typed  name',
    'มีความเห็นใหม่ในงานที่ฉันติดตาม': 'New comments on tasks I follow',
    'ความเห็นที่ไม่ได้พูดถึงคุณโดยตรง': 'Comments that do not mention you directly',
    'งานที่รออยู่พร้อมทำต่อแล้ว': 'A task I was waiting on is ready',
    'งานที่บล็อกงานของคุณอยู่ถูกทำเสร็จ': 'The task blocking yours was completed',
    'ความเคลื่อนไหวอื่นในงานที่ฉันติดตาม': 'Other activity on tasks I follow',
    'เปลี่ยนวัน เปลี่ยนความสำคัญ ติ๊กว่าเสร็จ และอื่น ๆ':
      'Date changes, priority changes, completions and so on',
    'มีคนพูดถึงคุณในความเห็น': 'mentioned you in a comment',
    'การแจ้งเตือนทางอีเมลยังไม่เปิด จะทำได้เมื่อเชื่อมต่อระบบส่วนกลางแล้ว ตอนนี้ทุกอย่างอยู่ในกล่องข้อความของแอป':
      'Email notifications are not available yet — they need the central system. For now everything lands in the in-app inbox.',

    'องค์กร': 'Organisation', 'อีเมลที่ใช้เข้าระบบ': 'Sign-in email',
    'บทบาทในองค์กร': 'Role in the organisation',
    'ผู้ดูแลระบบเท่านั้นที่เปลี่ยนได้': 'Only an administrator can change this',
    'โหมดทีม': 'Team mode', 'โหมดเครื่องเดียว': 'Single device',
    'การเปลี่ยนรหัสผ่านและการยืนยันสองชั้น จะทำได้เมื่อเชื่อมต่อระบบส่วนกลางแล้ว ตอนนี้เข้าระบบด้วยบัญชี Microsoft ของบริษัทเป็นหลัก':
      'Changing your password and two-factor authentication need the central system. For now sign-in goes through your company Microsoft account.',

    'วันแรกของสัปดาห์': 'First day of the week',
    'อัตโนมัติ': 'Automatic', 'อาทิตย์': 'Sunday', 'จันทร์': 'Monday',
    'โหมดแน่น': 'Compact mode',
    'ลดระยะห่างของแถว เห็นงานได้มากขึ้นต่อหนึ่งหน้าจอ':
      'Tighter rows, so more tasks fit on one screen',
    'แสดงเลขบรรทัด': 'Show row numbers',
    'ใส่เลขลำดับหน้าแถวในมุมมองรายการ ใช้อ้างอิงตอนคุยกันได้':
      'Numbers each row in list views, handy for pointing at one in a conversation',

    /* --- โอนงานต่อ --- */
    'โอนงานต่อ': 'Hand over open tasks', 'ปิดบัญชีและโอนงานต่อ': 'Hand over and disable',
    'โอนงานที่ค้างอยู่ {n} งานให้คนอื่น': 'Hand over {n} open tasks to someone else',
    'มีงานที่ยังไม่เสร็จอยู่ {n} งาน ถ้าปล่อยไว้กับบัญชีที่ปิดแล้ว จะไม่มีใครได้รับแจ้งและงานจะค้างเงียบ ๆ':
      '{n} tasks are still open. Left on a disabled account, nobody gets notified and the work quietly stalls.',
    'โอนให้ใคร': 'Hand over to',
    'ไม่โอน ปล่อยว่างไว้ (ต้องมีคนมาหยิบเอง)': 'Leave unassigned — someone must pick them up',
    'งานที่จะโอน': 'Tasks to hand over',
    'โอนงานแล้วปิดบัญชี': 'Hand over and disable', 'โอนงาน': 'Hand over',
    'โอนงาน {n} งานแล้ว': 'Handed over {n} tasks',
    'โอนงาน {n} งาน และปิดบัญชีแล้ว': 'Handed over {n} tasks and disabled the account',

    /* --- พอร์ตโฟลิโอ --- */
    'พอร์ตโฟลิโอ': 'Portfolios', 'สร้างพอร์ตโฟลิโอ': 'New portfolio',
    'ชื่อพอร์ตโฟลิโอ': 'Portfolio name', 'พอร์ตโฟลิโอใหม่': 'New portfolio',
    'สร้างพอร์ตโฟลิโอแล้ว': 'Portfolio created',
    'คำอธิบายพอร์ตโฟลิโอ': 'Portfolio description',
    'เมนูพอร์ตโฟลิโอ': 'Portfolio menu', 'ลบพอร์ตโฟลิโอ': 'Delete portfolio',
    'ลบพอร์ตโฟลิโอแล้ว': 'Portfolio deleted',
    'ลบพอร์ตโฟลิโอ “{name}”?\nโปรเจกต์ข้างในจะยังอยู่ครบ ลบแค่กล่องที่ใช้จัดกลุ่ม':
      'Delete the portfolio “{name}”?\nEvery project inside stays — only the grouping is removed.',
    'ไม่พบพอร์ตโฟลิโอนี้': 'Portfolio not found',
    'เพิ่มเข้าพอร์ตโฟลิโอ': 'Add to portfolio',
    'เพิ่มโปรเจกต์เข้าพอร์ต': 'Add projects', '+ เพิ่มโปรเจกต์เข้าพอร์ต': '+ Add projects',
    'เพิ่มโปรเจกต์เข้าพอร์ตโฟลิโอ': 'Add projects to this portfolio',
    'เพิ่มโปรเจกต์เข้า': 'Add projects to',
    'ถอดออกจากพอร์ตโฟลิโอ': 'Remove from portfolio', 'ถอดออก': 'Remove',
    'ถอดออกจากพอร์ตโฟลิโอแล้ว': 'Removed from portfolio',
    'อยู่ในพอร์ตโฟลิโอแล้ว': 'Already in this portfolio',
    'พอร์ตโฟลิโอของ': 'Portfolios for',
    'เลือกโปรเจกต์ที่จะรวมไว้ในภาพรวมนี้ กดได้หลายอันติดกัน':
      'Pick the projects to roll up here — you can add several in a row.',
    'โปรเจกต์ที่คุณเข้าถึงได้ถูกใส่ไว้ในพอร์ตโฟลิโอนี้หมดแล้ว':
      'Every project you can reach is already in this portfolio.',
    'ยังไม่มีพอร์ตโฟลิโอเลย สร้างจากแถบซ้ายได้ที่หัวข้อ “พอร์ตโฟลิโอ”':
      'No portfolios yet — create one from the “Portfolios” heading in the sidebar.',
    'ยังไม่มีโปรเจกต์ในพอร์ตโฟลิโอนี้': 'No projects in this portfolio yet',
    'พอร์ตโฟลิโอนี้มีแต่โปรเจกต์ที่คุณไม่มีสิทธิ์เห็น':
      'This portfolio only contains projects you cannot access',
    'มีอีก {n} โปรเจกต์ในพอร์ตโฟลิโอนี้ที่คุณไม่มีสิทธิ์เห็น ตัวเลขข้างบนจึงไม่รวมของพวกนั้น':
      '{n} more projects in this portfolio are not visible to you, so the numbers above exclude them.',
    'ความคืบหน้ารวม': 'Overall progress', 'ต้องจับตา': 'Needs attention',
    'งานเลยกำหนด': 'Overdue tasks',
    'ความคืบหน้า': 'Progress', 'เจ้าของ': 'Owner', 'ยังไม่รายงาน': 'No update',
    'ตามสถานะโปรเจกต์': 'By project status',
    'ความคืบหน้าแต่ละโปรเจกต์': 'Progress by project',
    'แท่ง = สัดส่วนงานที่เสร็จ เรียงจากช้าที่สุดขึ้นก่อน':
      'Bars show completed share — slowest first',
    'ยังไม่มีโปรเจกต์ที่น่าห่วง': 'Nothing looks worrying yet',
    'คนที่ถือโปรเจกต์': 'Project owners',
    'เลยกำหนด {n}': '{n} overdue',
    'ยังไม่มีโปรเจกต์ไหนที่มีวันที่': 'No project has dates yet',
    'ไม่มีวันที่': 'No dates',
    '{n} งาน · เสร็จ {p}%': '{n} tasks · {p}% done',
    '{n} โปรเจกต์': '{n} projects',
    'แก้คำอธิบาย': 'Edit description',

    /* --- ชื่อเดือน / วัน --- */
    '__monthsShort': 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec',
    '__monthsFull': 'January,February,March,April,May,June,July,August,September,October,November,December',
    '__dow': 'Su,Mo,Tu,We,Th,Fr,Sa',
    '__dowFull': 'Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday'
  };

  var lang = 'th';

  function t(s, p) {
    var out = s;
    if (lang === 'en' && Object.prototype.hasOwnProperty.call(EN, s)) out = EN[s];
    if (p) {
      Object.keys(p).forEach(function (k) {
        out = out.split('{' + k + '}').join(p[k]);
      });
    }
    return out;
  }

  function setLang(l) { lang = (l === 'en') ? 'en' : 'th'; }
  function getLang() { return lang; }

  /** ภาษาเริ่มต้นเมื่อยังไม่เคยตั้งค่า — เดาจากเบราว์เซอร์ */
  function detect() {
    try {
      var n = (global.navigator.language || '').toLowerCase();
      return n.indexOf('th') === 0 ? 'th' : 'en';
    } catch (e) { return 'th'; }
  }

  var TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var TH_MON_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                     'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  var TH_DOW_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

  function monthsShort() { return lang === 'en' ? EN.__monthsShort.split(',') : TH_MON; }
  function monthsFull() { return lang === 'en' ? EN.__monthsFull.split(',') : TH_MON_FULL; }
  function dow() { return lang === 'en' ? EN.__dow.split(',') : TH_DOW; }
  function dowFull() { return lang === 'en' ? EN.__dowFull.split(',') : TH_DOW_FULL; }

  /** ไทยใช้ พ.ศ. อังกฤษใช้ ค.ศ. */
  function year(y) { return lang === 'en' ? y : y + 543; }
  function yearShort(y) { return String(year(y)).slice(2); }

  global.I18N = {
    t: t, setLang: setLang, getLang: getLang, detect: detect,
    monthsShort: monthsShort, monthsFull: monthsFull, dow: dow, dowFull: dowFull,
    year: year, yearShort: yearShort
  };

})(window);

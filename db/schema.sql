/* =============================================================
   Orbit — โครงสร้างฐานข้อมูล (Azure SQL)
   =============================================================

   หลักการที่ยึดไว้

   1. สิทธิ์ถูกบังคับที่ฐานข้อมูลและ API เท่านั้น ไม่ใช่ที่หน้าจอ
      ทุกคำสั่งอ่านต้องผ่าน fn_VisibleProjects ก่อนเสมอ

   2. งานหนึ่งชิ้นอยู่ได้หลายโปรเจกต์ ผ่านตาราง task_projects
      บริษัทใช้ท่านี้อยู่จริง จึงไม่ยุบเป็น project_id เดี่ยวในตาราง tasks

   3. ลบแบบซ่อน (deleted_at) ไม่ลบจริง เพื่อให้กู้คืนได้และตรวจย้อนหลังได้

   4. ทุกตารางหลักมี rowversion ไว้ตรวจว่ามีคนอื่นแก้ทับระหว่างทางไหม

   รันไฟล์นี้กับฐานข้อมูลเปล่า ตามลำดับบนลงล่าง
   ============================================================= */

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------------------------------------------------------------
   ผู้ใช้
   id = object id ของ Entra ตรง ๆ จึงจับคู่กับ Microsoft ได้เสมอ
   และเพิ่มคนไว้ล่วงหน้าก่อนเขาล็อกอินครั้งแรกได้โดยไม่เกิดรายการซ้ำ
   --------------------------------------------------------------- */
CREATE TABLE dbo.users (
    id              UNIQUEIDENTIFIER  NOT NULL PRIMARY KEY,      -- Entra oid
    email           NVARCHAR(320)     NOT NULL,
    display_name    NVARCHAR(200)     NOT NULL,
    job_title       NVARCHAR(200)     NULL,
    avatar_color    CHAR(7)           NOT NULL DEFAULT '#796eff',
    org_role        VARCHAR(10)       NOT NULL DEFAULT 'member', -- admin | member | guest | viewer
    is_active       BIT               NOT NULL DEFAULT 1,
    last_seen_at    DATETIME2(0)      NULL,                      -- NULL = ยังไม่เคยล็อกอิน
    auth_by         VARCHAR(10)       NULL,                      -- microsoft | password
    dept            NVARCHAR(200)     NULL,
    about           NVARCHAR(1000)    NULL,
    pronouns        NVARCHAR(40)      NULL,
    /* รูปโปรไฟล์ย่อแล้ว (ฝั่งเบราว์เซอร์เก็บเป็น data URI ≤ PHOTO_MAX_BYTES)
       ตอนย้ายขึ้นฐานข้อมูลจริงให้เก็บไฟล์ที่ Blob แล้วเหลือแค่ที่อยู่ไว้ตรงนี้ */
    photo_url       NVARCHAR(600)     NULL,
    /* สถานะไม่อยู่ (users.away = { until, note }) มีวันสิ้นสุดเสมอและหมดอายุเอง */
    away_until      DATE              NULL,
    away_note       NVARCHAR(300)     NULL,
    created_at      DATETIME2(0)      NOT NULL DEFAULT SYSUTCDATETIME(),
    /* ชุดนี้ต้องตรงกับ ROLES ใน app/store.js เสมอ
       guest  = บุคคลภายนอก เห็นเฉพาะโปรเจกต์ที่ถูกเชิญ
       viewer = ดูอย่างเดียวทั้งองค์กร เห็นเท่า member แต่แก้ไม่ได้เลย */
    CONSTRAINT ck_users_role CHECK (org_role IN ('admin','member','guest','viewer'))
);
CREATE UNIQUE INDEX ux_users_email ON dbo.users(email);
GO

/* การตั้งค่าส่วนตัว แยกตารางเพราะเปลี่ยนบ่อยและไม่เกี่ยวกับสิทธิ์ */
CREATE TABLE dbo.user_settings (
    user_id     UNIQUEIDENTIFIER NOT NULL PRIMARY KEY
                REFERENCES dbo.users(id) ON DELETE CASCADE,
    lang        VARCHAR(5)   NOT NULL DEFAULT 'th',
    theme       VARCHAR(10)  NOT NULL DEFAULT 'auto',
    prefs_json  NVARCHAR(MAX) NULL     -- ความกว้างคอลัมน์ มุมมองล่าสุด ฯลฯ
);
GO

/* ---------------------------------------------------------------
   โปรเจกต์
   visibility = org      เห็นได้ทั้งองค์กร (ยกเว้น guest · viewer เห็นได้แต่แก้ไม่ได้)
              = private  เห็นเฉพาะคนใน project_members
   is_locked = 1  สมาชิกเชิญคนเพิ่มเองไม่ได้ ต้องผ่านผู้ดูแลระบบ
   --------------------------------------------------------------- */
CREATE TABLE dbo.projects (
    id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    name          NVARCHAR(300)    NOT NULL,
    description   NVARCHAR(MAX)    NULL,
    icon          NVARCHAR(16)     NULL,
    color         CHAR(7)          NOT NULL DEFAULT '#796eff',
    visibility    VARCHAR(10)      NOT NULL DEFAULT 'org',
    is_locked     BIT              NOT NULL DEFAULT 0,
    default_view  VARCHAR(12)      NOT NULL DEFAULT 'list',
    owner_id      UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    archived_at   DATETIME2(0)     NULL,
    deleted_at    DATETIME2(0)     NULL,     -- ถังขยะเหมือนงาน (deleted_by คู่กัน)
    deleted_by    UNIQUEIDENTIFIER NULL,
    created_by    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at    DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    start_on      DATE             NULL,     -- Sprint 1C — วันเริ่มโปรเจกต์ (project.startOn)
    due_on        DATE             NULL,
    /* ตั้งค่าการเลื่อนงานที่รออยู่ (depShift) และวันทำงาน (workDays) ของ Gantt */
    dep_shift_json NVARCHAR(200)   NULL,
    work_days     VARCHAR(10)      NOT NULL DEFAULT 'all',
    /* มุมมองที่เปิดใช้ (NULL = ทุกมุมมอง) เก็บเป็นอาร์เรย์ JSON ของ PROJECT_VIEWS */
    views_json    NVARCHAR(300)    NULL,
    row_ver       ROWVERSION,
    CONSTRAINT ck_proj_vis  CHECK (visibility IN ('org','private')),
    /* ต้องตรงกับ PROJECT_VIEWS ใน app/store.js */
    CONSTRAINT ck_proj_view CHECK (default_view IN ('overview','list','board','timeline','gantt',
                                                    'calendar','dashboard','messages','pages','files','workload','embed'))
);
CREATE INDEX ix_projects_live ON dbo.projects(deleted_at, archived_at) INCLUDE (name, visibility);
GO

/* ---------------------------------------------------------------
   สมาชิกโปรเจกต์ — ตารางที่ทำให้ระบบสิทธิ์เป็นจริง
   access: admin  ผู้ดูแลโปรเจกต์ จัดการสมาชิกและลบโปรเจกต์ได้
           edit   แก้งานและโครงสร้างได้
           comment  ดูและแสดงความเห็นได้ แก้ไม่ได้
           view   ดูอย่างเดียว
   --------------------------------------------------------------- */
CREATE TABLE dbo.project_members (
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    access      VARCHAR(8)       NOT NULL DEFAULT 'edit',
    added_by    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    added_at    DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_project_members PRIMARY KEY (project_id, user_id),
    CONSTRAINT ck_pm_access CHECK (access IN ('admin','edit','comment','view'))
);
/* ดัชนีนี้สำคัญที่สุดในระบบ ทุกคำขออ่านวิ่งผ่านมันหมด */
CREATE INDEX ix_pm_user ON dbo.project_members(user_id) INCLUDE (project_id, access);
GO

/* ---------------------------------------------------------------
   เซกชัน (คอลัมน์ในบอร์ด / กลุ่มในรายการ)
   --------------------------------------------------------------- */
CREATE TABLE dbo.sections (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    name        NVARCHAR(200)    NOT NULL,
    position    DECIMAL(18,9)    NOT NULL,
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_sections_project ON dbo.sections(project_id, position);
GO

/* ---------------------------------------------------------------
   งาน
   ไม่มี project_id ที่นี่โดยตั้งใจ — ความสัมพันธ์อยู่ที่ task_projects
   เพราะงานหนึ่งชิ้นอยู่ได้หลายโปรเจกต์
   --------------------------------------------------------------- */
CREATE TABLE dbo.tasks (
    id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    name          NVARCHAR(1000)   NOT NULL,
    notes         NVARCHAR(MAX)    NULL,
    task_type     VARCHAR(10)      NOT NULL DEFAULT 'task',   -- task | milestone | approval
    approval      VARCHAR(10)      NULL,                      -- pending | approved | changes | rejected (ผู้อนุมัติ = assignee)
    assignee_id   UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    assigned_at   DATETIME2(0)     NULL,     -- มอบหมายครั้งล่าสุดเมื่อไร (2a) ใช้ตัดสิน "เพิ่งได้รับมอบหมาย" และจุดสีฟ้า
    assigned_by   UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    parent_id     UNIQUEIDENTIFIER NULL REFERENCES dbo.tasks(id),
    start_on      DATE             NULL,
    start_at      DATETIME2(0)     NULL,     -- วันเริ่ม + เวลาเริ่ม (startTime) ถ้าตั้งไว้
    due_on        DATE             NULL,
    due_at        DATETIME2(0)     NULL,
    priority      VARCHAR(10)      NOT NULL DEFAULT 'none',
    completed_at  DATETIME2(0)     NULL,
    completed_by  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    recur_json    NVARCHAR(500)    NULL,     -- {"freq":"daily|weekly|monthly|yearly|after","interval":N,"days":[0-6]}
    deleted_at    DATETIME2(0)     NULL,     -- ถังขยะ: ตั้งตอนลบ กู้คืน = ล้างกลับเป็น NULL ภายใน 30 วัน
    deleted_by    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_by    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at    DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    row_ver       ROWVERSION,
    CONSTRAINT ck_task_type CHECK (task_type IN ('task','milestone','approval')),
    CONSTRAINT ck_task_prio CHECK (priority IN ('none','low','medium','high','urgent'))
);
CREATE INDEX ix_tasks_assignee ON dbo.tasks(assignee_id, completed_at, due_on) WHERE deleted_at IS NULL;
CREATE INDEX ix_tasks_parent   ON dbo.tasks(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX ix_tasks_due      ON dbo.tasks(due_on) WHERE deleted_at IS NULL AND completed_at IS NULL;
GO

/* ---------------------------------------------------------------
   งานอยู่ในโปรเจกต์ไหนบ้าง — หัวใจของการอยู่หลายโปรเจกต์
   position เป็นทศนิยมเพื่อแทรกระหว่างสองแถวได้โดยแก้แถวเดียว
   ถ้าช่องว่างแคบกว่า 0.000001 ให้เรียกโพรซีเยอร์จัดลำดับใหม่
   --------------------------------------------------------------- */
CREATE TABLE dbo.task_projects (
    task_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    section_id  UNIQUEIDENTIFIER NULL REFERENCES dbo.sections(id),
    position    DECIMAL(18,9)    NOT NULL,
    added_at    DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_task_projects PRIMARY KEY (task_id, project_id)
);
CREATE INDEX ix_tp_project ON dbo.task_projects(project_id, section_id, position) INCLUDE (task_id);
GO

CREATE TABLE dbo.task_followers (
    task_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    user_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    CONSTRAINT pk_task_followers PRIMARY KEY (task_id, user_id)
);
CREATE INDEX ix_tf_user ON dbo.task_followers(user_id);
GO

CREATE TABLE dbo.task_likes (
    task_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    user_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    CONSTRAINT pk_task_likes PRIMARY KEY (task_id, user_id)
);
GO

/* ลำดับก่อนหลัง 4 แบบ ตรวจการวนซ้ำที่ชั้น API ก่อนเขียน */
CREATE TABLE dbo.task_dependencies (
    task_id        UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    depends_on_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id),
    dep_type       VARCHAR(2)       NOT NULL DEFAULT 'FS',
    CONSTRAINT pk_task_deps PRIMARY KEY (task_id, depends_on_id),
    CONSTRAINT ck_dep_type CHECK (dep_type IN ('FS','SS','FF','SF')),
    CONSTRAINT ck_dep_self CHECK (task_id <> depends_on_id)
);
CREATE INDEX ix_dep_reverse ON dbo.task_dependencies(depends_on_id);
GO

CREATE TABLE dbo.tags (
    id    UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    name  NVARCHAR(100)    NOT NULL,
    color CHAR(7)          NULL
);
CREATE UNIQUE INDEX ux_tags_name ON dbo.tags(name);

CREATE TABLE dbo.task_tags (
    task_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    tag_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tags(id) ON DELETE CASCADE,
    CONSTRAINT pk_task_tags PRIMARY KEY (task_id, tag_id)
);
GO

/* ---------------------------------------------------------------
   ฟิลด์กำหนดเอง — แยกชุดตามโปรเจกต์ เหมือนที่บริษัทใช้ใน Asana
   field_type: text | number | select | multi | date | person
   'multi' คือตัวเลือกหลายค่า ซึ่ง Asana เรียก multi_enum และบริษัทใช้อยู่จริง
   --------------------------------------------------------------- */
CREATE TABLE dbo.custom_fields (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    name        NVARCHAR(200)    NOT NULL,
    field_type  VARCHAR(10)      NOT NULL,
    format_json NVARCHAR(200)    NULL,     -- ฟิลด์ตัวเลข: {"kind":"number|currency|percent|unit","currency":"THB","unit":"","decimals":0-4}
    deleted_at  DATETIME2(0)     NULL,     -- ฟิลด์ในถังขยะ ค่าที่กรอกไว้ยังอยู่ กู้คืนแล้วกลับมาครบ
    deleted_by  UNIQUEIDENTIFIER NULL,
    position    DECIMAL(18,9)    NOT NULL,
    CONSTRAINT ck_field_type CHECK (field_type IN ('text','number','select','multi','date','person'))
);
CREATE INDEX ix_fields_project ON dbo.custom_fields(project_id, position);

CREATE TABLE dbo.custom_field_options (
    id        UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    field_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.custom_fields(id) ON DELETE CASCADE,
    label     NVARCHAR(200)    NOT NULL,
    color     CHAR(7)          NULL,
    position  DECIMAL(18,9)    NOT NULL
);
CREATE INDEX ix_field_options ON dbo.custom_field_options(field_id, position);

/* ค่าที่กรอกจริง เก็บเป็น JSON เพราะชนิดต่างกันไปตามฟิลด์
   ตัวเลือกหลายค่าเก็บเป็นอาร์เรย์ของ option id */
CREATE TABLE dbo.task_field_values (
    task_id    UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    field_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.custom_fields(id) ON DELETE CASCADE,
    value_json NVARCHAR(MAX)    NULL,
    CONSTRAINT pk_task_field_values PRIMARY KEY (task_id, field_id)
);
GO

/* ---------------------------------------------------------------
   ไฟล์แนบ — ไฟล์จริงอยู่ที่ Blob Storage ตารางนี้เก็บแค่ทะเบียน
   --------------------------------------------------------------- */
CREATE TABLE dbo.attachments (
    id           UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    task_id      UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    file_name    NVARCHAR(400)    NOT NULL,
    blob_path    NVARCHAR(600)    NOT NULL,
    content_type NVARCHAR(150)    NULL,
    size_bytes   BIGINT           NOT NULL,
    scan_status  VARCHAR(10)      NOT NULL DEFAULT 'pending', -- pending | clean | infected
    uploaded_by  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    uploaded_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_scan CHECK (scan_status IN ('pending','clean','infected'))
);
CREATE INDEX ix_attach_task ON dbo.attachments(task_id);
GO

/* ---------------------------------------------------------------
   ความเห็นและบันทึกกิจกรรมของงาน อยู่ตารางเดียวกัน
   ทำให้ได้ไทม์ไลน์ต่อเนื่องและร่องรอยการตรวจสอบฟรี
   --------------------------------------------------------------- */
CREATE TABLE dbo.stories (
    id          BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    task_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    actor_id    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    story_type  VARCHAR(10)      NOT NULL,          -- comment | log
    /* comment: ข้อความมาร์กดาวน์ย่อ (ดู "ข้อความมีรูปแบบ" ใน app/store.js) ไม่ใช่ HTML
       log:     คีย์คำแปล + params_json แปลตอนแสดงผล */
    body        NVARCHAR(MAX)    NOT NULL,
    params_json NVARCHAR(1000)   NULL,
    /* เธรดตอบกลับได้ชั้นเดียว — คำตอบชี้ไปที่ความเห็นหลัก ไม่ใช่คำตอบด้วยกัน */
    parent_story_id BIGINT       NULL REFERENCES dbo.stories(id),
    is_pinned   BIT              NOT NULL DEFAULT 0,
    edited_at   DATETIME2(0)     NULL,
    /* ลบความเห็นที่มีคนตอบแล้ว = ล้าง body แล้วตั้ง deleted_at ไว้เป็นป้าย "ถูกลบแล้ว" */
    deleted_at  DATETIME2(0)     NULL,
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_story_type CHECK (story_type IN ('comment','log'))
);
CREATE INDEX ix_stories_task ON dbo.stories(task_id, created_at DESC);
CREATE INDEX ix_stories_thread ON dbo.stories(parent_story_id) WHERE parent_story_id IS NOT NULL;
GO

/* อีโมจิตอบรับความเห็น — ชุดที่ยอมรับตรงกับ REACTIONS ใน app/store.js */
CREATE TABLE dbo.story_reactions (
    story_id  BIGINT           NOT NULL REFERENCES dbo.stories(id) ON DELETE CASCADE,
    user_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    emoji     NVARCHAR(8)      NOT NULL,
    CONSTRAINT pk_story_reactions PRIMARY KEY (story_id, user_id, emoji)
);
GO

/* ร่างความเห็นไม่ได้อยู่ในฐานข้อมูลโดยตั้งใจ — เก็บที่ localStorage ของเครื่อง (orbit.drafts) */

CREATE TABLE dbo.notifications (
    id           BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    user_id      UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    task_id      UNIQUEIDENTIFIER NULL REFERENCES dbo.tasks(id),
    kind         VARCHAR(20)      NULL,     -- assigned | mention | comment | unblock | activity | message | approval | due | overdue | status | newtask | milestone | timelog (Sprint 2B)
    dedupe_key   VARCHAR(120)     NULL,     -- กันเตือนกำหนดส่งซ้ำ เช่น due1:<task>:<date>
    /* Sprint 2B — รวมกลุ่ม/เนื้อหา/เลื่อนเตือน */
    parts_json   NVARCHAR(MAX)    NULL,     -- ส่วนที่รวมเข้ามา (คนเดียวกัน งานเดียวกัน ภายใน 10 นาที) [{ key, params, kind, story, ref, x }]
    story_id     UNIQUEIDENTIFIER NULL,     -- ความเห็นที่ทำให้เกิดรายการ (โชว์เนื้อหา + พาไปที่ความเห็น)
    status_ref   VARCHAR(40)      NULL,     -- รายการในประวัติสถานะ (โชว์สถานะ + บรรทัดแรก)
    snooze_until DATETIME2(0)     NULL,     -- เลื่อนเตือน ซ่อนจนถึงเวลานี้
    woke_at      DATETIME2(0)     NULL,     -- กลับมาจากการเลื่อน (ใช้เรียงขึ้นบนสุด)
    actor_id     UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),   -- ใช้กับตัวกรอง "จากใคร" ในกล่องข้อความ
    project_id   UNIQUEIDENTIFIER NULL REFERENCES dbo.projects(id), -- ประกาศ/สถานะที่ไม่มีงานให้ชี้
    route        VARCHAR(20)      NULL,     -- mytasks | p-overview
    bookmarked   BIT              NOT NULL DEFAULT 0,
    body         NVARCHAR(1000)   NOT NULL,
    read_at      DATETIME2(0)     NULL,
    archived_at  DATETIME2(0)     NULL,
    created_at   DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_notif_inbox ON dbo.notifications(user_id, archived_at, read_at, created_at DESC);
GO

/* อัปเดตสถานะโปรเจกต์ — เก็บย้อนหลังทุกครั้ง ไม่ทับของเดิม */
CREATE TABLE dbo.project_status_updates (
    id          BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    state       VARCHAR(10)      NOT NULL,   -- ตรงกับ PROJECT_STATES ใน app/store.js
    body        NVARCHAR(MAX)    NULL,
    author_id   UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_status_state CHECK (state IN ('on_track','at_risk','off_track','on_hold','complete','dropped'))
);
CREATE INDEX ix_status_project ON dbo.project_status_updates(project_id, created_at DESC);
GO

/* มุมมองที่บันทึกไว้ = แท็บของโปรเจกต์ (ชิ้นงาน 2b, SCHEMA 10) — ตรงกับ project.savedViews ใน app/store.js
   config_json เก็บเฉพาะคีย์ที่ต่างจากค่าเริ่มต้น: filters [{f,op,v}] (คนใช้ "@me" = คนที่เปิดดู) sorts [{k,d}]
   group showEmpty cols colShow foot collapsed bGroup bSwim bSize bCard bCollapsed cMode cWeekends cColorBy tColorBy g* */
CREATE TABLE dbo.saved_views (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_id  UNIQUEIDENTIFIER NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    owner_id    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    name        NVARCHAR(200)    NOT NULL,
    icon        NVARCHAR(8)      NULL,
    kind        VARCHAR(12)      NOT NULL DEFAULT 'list',   -- list | board | timeline | gantt | calendar
    position    INT              NOT NULL DEFAULT 0,        -- ลำดับแท็บ (สูงสุด 50 แท็บต่อโปรเจกต์)
    config_json NVARCHAR(MAX)    NOT NULL,
    CONSTRAINT ck_saved_view_kind CHECK (kind IN ('list','board','timeline','gantt','calendar'))
);
/* แท็บเริ่มต้นของโปรเจกต์ — NULL = ใช้ projects.default_view */
ALTER TABLE dbo.projects ADD default_tab_id UNIQUEIDENTIFIER NULL;
/* รูปปกของการ์ดบอร์ด — ไฟล์แนบที่เป็นรูปของงานนั้น */
ALTER TABLE dbo.tasks ADD cover_attachment_id UNIQUEIDENTIFIER NULL;
GO

/* ---------------------------------------------------------------
   บันทึกการตรวจสอบ — ทุกการแก้ไขที่สำคัญลงที่นี่
   ห้ามลบและห้ามแก้ ใช้ตอบคำถามว่าใครทำอะไรเมื่อไหร่
   --------------------------------------------------------------- */
CREATE TABLE dbo.audit_log (
    id          BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    actor_id    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    action      VARCHAR(60)      NOT NULL,   -- project.lock, member.add, task.delete ...
    target_type VARCHAR(30)      NULL,
    target_id   UNIQUEIDENTIFIER NULL,
    detail_json NVARCHAR(MAX)    NULL,
    ip          VARCHAR(45)      NULL,
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_audit_time  ON dbo.audit_log(created_at DESC);
CREATE INDEX ix_audit_actor ON dbo.audit_log(actor_id, created_at DESC);
GO

/* ---------------------------------------------------------------
   ของที่ฝั่งเบราว์เซอร์มีแล้วแต่ไฟล์นี้ยังไม่เคยบันทึกไว้
   ตรงกับรูปข้อมูลใน app/store.js (SCHEMA 9) — แก้ที่ไหนต้องแก้อีกที่ด้วย
   --------------------------------------------------------------- */

/* ประกาศของโปรเจกต์ (projects[].messages) — เรื่องที่ไม่ได้ผูกกับงานชิ้นไหน */
CREATE TABLE dbo.project_messages (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    title       NVARCHAR(300)    NULL,
    body        NVARCHAR(MAX)    NOT NULL,     -- มาร์กดาวน์ย่อชุดเดียวกับความเห็น
    author_id   UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_pmsg_project ON dbo.project_messages(project_id, created_at DESC);
GO

/* อัตโนมัติ (ชิ้นงาน 3a) แทนกฎแบบเดิม project_rules — กฎเดิมแปลงเป็นอัตโนมัติ "ย้ายเข้าคอลัมน์" ตอนย้ายข้อมูล
   ทริกเกอร์ เส้นทาง (เงื่อนไข {f, op, v} ชุดเดียวกับตัวกรองของมุมมอง) และการกระทำเก็บเป็น JSON ในแถวเดียว
   เพราะรูปร่างต่างกันมากตามชนิด และอ่าน/เขียนทั้งก้อนเสมอ
     trigger_json  { type: added|moved|completed|assignee|due|start|field|comment|attachment|follower|
                            unblocked|approval|approaching|overdue|manual|scheduled, …ค่าของชนิดนั้น }
     paths_json    [{ conds: [{f, op, v}], acts: [{ type, … }] }]   สูงสุด 5 เส้นทาง 20 การกระทำต่อเส้นทาง
     else_json     [{ type, … }] | NULL   เส้นทาง "อื่น ๆ"
   owner_user_id ไม่ว่าง = อัตโนมัติของงานของฉัน (ย้ายเซกชันส่วนตัว) project_id ว่าง */
CREATE TABLE dbo.automations (
    id             UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_id     UNIQUEIDENTIFIER NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    owner_user_id  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    name           NVARCHAR(120)    NOT NULL DEFAULT N'',
    is_on          BIT              NOT NULL DEFAULT 1,
    allow_chain    BIT              NOT NULL DEFAULT 0,      -- ให้การกระทำของอัตโนมัติอื่นปลุกได้ (ลึกสุด 3 ชั้น)
    trigger_json   NVARCHAR(MAX)    NOT NULL,
    paths_json     NVARCHAR(MAX)    NOT NULL,
    else_json      NVARCHAR(MAX)    NULL,
    created_by     UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at     DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_automation_scope CHECK ((project_id IS NULL) <> (owner_user_id IS NULL))
);
CREATE INDEX ix_automations_project ON dbo.automations(project_id);
GO

/* ประวัติการรัน — เก็บ 200 ครั้งล่าสุดต่อโปรเจกต์ (งานของฉัน 50) ทีมเห็นร่วมกัน */
CREATE TABLE dbo.automation_runs (
    id             BIGINT IDENTITY PRIMARY KEY,
    automation_id  UNIQUEIDENTIFIER NULL,                    -- อัตโนมัติถูกลบแล้วประวัติยังอยู่ (เก็บชื่อไว้ใน automation_name)
    automation_name NVARCHAR(60)    NULL,
    project_id     UNIQUEIDENTIFIER NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    task_id        UNIQUEIDENTIFIER NULL,
    task_name      NVARCHAR(60)     NULL,
    status         VARCHAR(4)       NOT NULL CHECK (status IN ('ok', 'err', 'loop')),
    actions_done   INT              NOT NULL DEFAULT 0,
    error_key      NVARCHAR(200)    NULL,                    -- คีย์คำแปล แปลตอนแสดง
    error_params   NVARCHAR(400)    NULL,
    trigger_type   VARCHAR(20)      NULL,
    path_index     INT              NULL,                    -- -1 = "อื่น ๆ"
    triggered_by   UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    ran_at         DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_autoruns_project ON dbo.automation_runs(project_id, ran_at DESC);
GO

/* กันอัตโนมัติตามเวลารันซ้ำ — คีย์ = ชนิด:รหัสอัตโนมัติ:รหัสงาน:วันครบกำหนด หรือ sch:รหัส:รอบ
   ตอนมีเซิร์ฟเวอร์ใช้ UNIQUE ของคีย์นี้เป็นตัวล็อกแทนการซิงก์ทั้งก้อน · ล้างแถวที่เก่ากว่า 60 วัน */
CREATE TABLE dbo.automation_fired (
    fire_key   NVARCHAR(200) NOT NULL PRIMARY KEY,
    fired_on   DATE          NOT NULL
);
GO

/* เทมเพลตงาน (db.taskTemplates = ทั้งองค์กร, project.taskTemplates = เฉพาะโปรเจกต์) — 3b
   payload_json = { name, notes, type, ctype, prio, assignee {mode,user}, followers, tags, fields {fieldId: ค่า},
   due/start {n, unit days|workdays} นับจากวันที่สร้างงาน, subs [{k, name, notes, assignee, due, deps [k]}] } */
CREATE TABLE dbo.task_templates (
    id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_id    UNIQUEIDENTIFIER NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,   -- NULL = ใช้ได้ทุกโปรเจกต์
    name          NVARCHAR(300)    NOT NULL,
    payload_json  NVARCHAR(MAX)    NOT NULL,
    created_by    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at    DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* ---------- 3b — ชนิดงานกำหนดเอง ----------
   งานเก็บ tasks.custom_type_id + custom_status_id ส่วน tasks.type ยังเป็นชนิดพื้นฐาน (task)
   สถานะที่ counts_complete = 1 ผูกกับ tasks.completed ทั้งสองทาง · โปรเจกต์ละไม่เกิน 20 ชนิด ชนิดละ 12 สถานะ */
CREATE TABLE dbo.task_types (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    name        NVARCHAR(60)     NOT NULL,
    icon        NVARCHAR(8)      NULL,
    base_type   NVARCHAR(12)     NOT NULL DEFAULT 'task',
    position    INT              NOT NULL DEFAULT 0
);
CREATE TABLE dbo.task_type_statuses (
    id               UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    type_id          UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.task_types(id) ON DELETE CASCADE,
    name             NVARCHAR(40)     NOT NULL,
    color            CHAR(7)          NOT NULL,
    counts_complete  BIT              NOT NULL DEFAULT 0,
    position         INT              NOT NULL DEFAULT 0
);
ALTER TABLE dbo.tasks ADD custom_type_id   UNIQUEIDENTIFIER NULL REFERENCES dbo.task_types(id),
                          custom_status_id UNIQUEIDENTIFIER NULL REFERENCES dbo.task_type_statuses(id);
ALTER TABLE dbo.projects ADD default_type NVARCHAR(40) NULL;          -- task | milestone | approval | รหัส task_types
GO

/* ---------- 3b — ฟอร์ม ----------
   items_json = [{ id, kind (heading|text|long|select|multi|number|date|range|person|file), label, help, req, opts,
                   map ('' | name | notes | due | start | dates | assignee | followers | tags | field:<id>),
                   cond { q, v[] } (แตกแขนงจากคำถามตัวเลือกก่อนหน้า ลึกสุด 5 ชั้น) }]
   ส่งได้เฉพาะผู้ใช้ที่ล็อกอิน · ฟอร์มสาธารณะ (คนนอก) รอเฟส 5 */
CREATE TABLE dbo.forms (
    id                UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_id        UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    name              NVARCHAR(120)    NOT NULL,
    description       NVARCHAR(4000)   NULL,
    is_open           BIT              NOT NULL DEFAULT 1,
    items_json        NVARCHAR(MAX)    NOT NULL,
    section_id        UNIQUEIDENTIFIER NULL REFERENCES dbo.sections(id),
    title_question    NVARCHAR(40)     NULL,
    default_assignee  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    copy_answers      BIT              NOT NULL DEFAULT 1,
    add_submitter     BIT              NOT NULL DEFAULT 1,
    allow_again       BIT              NOT NULL DEFAULT 1,
    confirm_text      NVARCHAR(1000)   NULL,
    submissions       INT              NOT NULL DEFAULT 0,
    last_submitted_at DATETIME2(0)     NULL,
    created_by        UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at        DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_forms_project ON dbo.forms(project_id);
GO

/* ---------- 3b — เทมเพลตโปรเจกต์ ----------
   data_json = { sections, fields (คลังฟิลด์เก็บแค่ id), automations, forms, types, defaultType, taskTemplates,
                 roles [{k, name, user, text}], tasks [{k, name, …, sec, role, s, d (ระยะห่างจากวันเริ่ม), deps, subs}] }
   เทมเพลตตั้งต้น 6 แบบอยู่ในโค้ด ไม่อยู่ในตาราง */
CREATE TABLE dbo.project_templates (
    id             UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    name           NVARCHAR(120)    NOT NULL,
    description    NVARCHAR(1000)   NULL,
    icon           NVARCHAR(8)      NULL,
    color          CHAR(7)          NULL,
    org_can_use    BIT              NOT NULL DEFAULT 1,
    skip_weekends  BIT              NOT NULL DEFAULT 0,
    data_json      NVARCHAR(MAX)    NOT NULL,
    created_by     UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at     DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE TABLE dbo.project_template_access (
    template_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.project_templates(id) ON DELETE CASCADE,
    user_id      UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    access       NVARCHAR(8)      NOT NULL CONSTRAINT ck_pt_access CHECK (access IN ('edit', 'use')),
    PRIMARY KEY (template_id, user_id)
);
GO

/* ---------- 3b — รายงานสถานะแบบบล็อก ----------
   project_status_updates ได้ title, blocks_json [{k, title, text}], highlights_json (ภาพนิ่ง), period_days
   projects: status_layout_json (เลย์เอาต์ล่าสุด), status_remind (เตือนวันศุกร์), remind_key, remind_task_id */
CREATE TABLE dbo.status_templates (
    id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    name          NVARCHAR(80)     NOT NULL,
    layout_json   NVARCHAR(MAX)    NOT NULL,
    created_by    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id)
);
ALTER TABLE dbo.project_status_updates ADD title NVARCHAR(120) NULL, blocks_json NVARCHAR(MAX) NULL,
                                           highlights_json NVARCHAR(MAX) NULL, period_days INT NULL;
ALTER TABLE dbo.projects ADD status_layout_json NVARCHAR(MAX) NULL,
                             status_remind      BIT          NOT NULL DEFAULT 0,
                             remind_key         DATE         NULL,
                             remind_task_id     UNIQUEIDENTIFIER NULL;
GO

/* เส้นฐานของ Gantt (projects[].baseline) — วันที่ของทุกงานตอนกดตั้ง เก็บไว้เทียบว่าหลุดแผนไปเท่าไร */
CREATE TABLE dbo.project_baselines (
    project_id  UNIQUEIDENTIFIER NOT NULL PRIMARY KEY REFERENCES dbo.projects(id) ON DELETE CASCADE,
    set_at      DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    set_by      UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id)
);
CREATE TABLE dbo.project_baseline_tasks (
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.project_baselines(project_id) ON DELETE CASCADE,
    task_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id),
    start_on    DATE NULL,
    due_on      DATE NULL,
    CONSTRAINT pk_baseline_tasks PRIMARY KEY (project_id, task_id)
);
GO

/* พอร์ตโฟลิโอ (db.portfolios) — กล่องรวมโปรเจกต์ สิทธิ์ยังยึดตามแต่ละโปรเจกต์
   สถานะใช้ชุดเดียวกับ PROJECT_STATES และเก็บย้อนหลังแบบเดียวกับ project_status_updates */
CREATE TABLE dbo.portfolios (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    name        NVARCHAR(300)    NOT NULL,
    description NVARCHAR(MAX)    NULL,
    icon        NVARCHAR(16)     NULL,
    color       CHAR(7)          NOT NULL DEFAULT '#796eff',
    owner_id    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_by  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    deleted_at  DATETIME2(0)     NULL
);
CREATE TABLE dbo.portfolio_projects (
    portfolio_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.portfolios(id) ON DELETE CASCADE,
    project_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    position     DECIMAL(18,9)    NOT NULL DEFAULT 0,
    CONSTRAINT pk_portfolio_projects PRIMARY KEY (portfolio_id, project_id)
);
CREATE TABLE dbo.portfolio_status_updates (
    id           BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    portfolio_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.portfolios(id) ON DELETE CASCADE,
    state        VARCHAR(10)      NOT NULL,
    body         NVARCHAR(MAX)    NULL,
    author_id    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at   DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* 4a — พอร์ตโฟลิโอซ้อน (portfolio.portfolioIds — ห้ามวน ตรวจด้วย CTE ก่อน INSERT)
   ฟิลด์ของพอร์ตโฟลิโอ + ค่าแยกต่อแถว (project หรือ portfolio ย่อย) และ rollup (คำนวณตอนอ่าน ไม่เก็บค่า)
   แท็บมุมมองที่บันทึก (view = JSON { filters, sorts, group, hide }) และประกาศของพอร์ตโฟลิโอ */
ALTER TABLE dbo.portfolios ADD default_view_id UNIQUEIDENTIFIER NULL;
CREATE TABLE dbo.portfolio_children (
    parent_id    UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.portfolios(id),
    child_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.portfolios(id),
    position     DECIMAL(18,9)    NOT NULL DEFAULT 0,
    CONSTRAINT pk_portfolio_children PRIMARY KEY (parent_id, child_id),
    CONSTRAINT ck_portfolio_children_self CHECK (parent_id <> child_id)
);
CREATE TABLE dbo.portfolio_fields (
    id           UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    portfolio_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.portfolios(id) ON DELETE CASCADE,
    name         NVARCHAR(80)     NOT NULL,
    type         VARCHAR(10)      NOT NULL CONSTRAINT ck_pff_type CHECK (type IN ('number','text','select','date','person','rollup')),
    options_json NVARCHAR(MAX)    NULL,      -- [{name,color}] ของ select
    format_json  NVARCHAR(400)    NULL,      -- { kind, currency, decimals } ของ number/rollup
    rollup_src   UNIQUEIDENTIFIER NULL,      -- custom_fields.id (ฟิลด์ตัวเลขของงาน)
    rollup_fn    VARCHAR(8)       NULL CONSTRAINT ck_pff_fn CHECK (rollup_fn IN ('sum','avg','min','max','count')),
    position     INT              NOT NULL DEFAULT 0
);
CREATE TABLE dbo.portfolio_field_values (
    field_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.portfolio_fields(id) ON DELETE CASCADE,
    item_id      UNIQUEIDENTIFIER NOT NULL,  -- project หรือ portfolio ย่อย
    value_json   NVARCHAR(4000)   NULL,
    CONSTRAINT pk_portfolio_field_values PRIMARY KEY (field_id, item_id)
);
CREATE TABLE dbo.portfolio_views (
    id           UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    portfolio_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.portfolios(id) ON DELETE CASCADE,
    name         NVARCHAR(60)     NOT NULL,
    view_json    NVARCHAR(MAX)    NOT NULL,
    position     INT              NOT NULL DEFAULT 0
);
/* ประกาศของพอร์ตโฟลิโอ/ทีมใช้ตารางประกาศเดียวกับโปรเจกต์ โดยเพิ่ม owner_kind */
GO

/* 4a — ทีม (db.teams) privacy: public | request | private
   สมาชิกทีม (admin|member) คำขอเข้าร่วม ปักหมุด ทรัพยากร และการแชร์โปรเจกต์ให้ทีม (project.teams)
   สิทธิ์ที่ได้ผ่านทีม "บวกเพิ่ม" — fn_VisibleProjects ต้องรวม project_teams ⋈ team_members ด้วย
   และระดับที่ได้ = MAX(ระดับสมาชิกโปรเจกต์, ระดับที่แชร์ให้ทีม) ภายใต้เพดานบทบาทองค์กร */
CREATE TABLE dbo.teams (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    name        NVARCHAR(120)    NOT NULL,
    description NVARCHAR(MAX)    NULL,
    icon        NVARCHAR(16)     NULL,
    color       CHAR(7)          NOT NULL DEFAULT '#796eff',
    privacy     VARCHAR(8)       NOT NULL DEFAULT 'public' CONSTRAINT ck_teams_privacy CHECK (privacy IN ('public','request','private')),
    created_by  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE TABLE dbo.team_members (
    team_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.teams(id) ON DELETE CASCADE,
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    role        VARCHAR(6)       NOT NULL DEFAULT 'member' CONSTRAINT ck_team_members_role CHECK (role IN ('admin','member')),
    CONSTRAINT pk_team_members PRIMARY KEY (team_id, user_id)
);
CREATE TABLE dbo.team_join_requests (
    team_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.teams(id) ON DELETE CASCADE,
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    requested_at DATETIME2(0)    NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_team_join_requests PRIMARY KEY (team_id, user_id)
);
CREATE TABLE dbo.team_pins (
    team_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.teams(id) ON DELETE CASCADE,
    item_id     UNIQUEIDENTIFIER NOT NULL,   -- project หรือ portfolio
    position    INT              NOT NULL DEFAULT 0,
    CONSTRAINT pk_team_pins PRIMARY KEY (team_id, item_id)
);
CREATE TABLE dbo.team_resources (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    team_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.teams(id) ON DELETE CASCADE,
    name        NVARCHAR(200)    NOT NULL,
    url         NVARCHAR(2000)   NOT NULL,
    created_by  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
/* 4a ส่วนที่ 2 — เป้าหมาย (db.goals) ความคืบหน้าคำนวณตอนอ่านเมื่อ metric_src ≠ manual
   (subgoals = เฉลี่ย/ถ่วงน้ำหนัก/รวมค่า, projects = งานหรือหมุดหมายที่เสร็จ, tasks = งานที่เลือก — สถานะกำหนดเองที่ done นับว่าเสร็จ)
   goal_history เก็บจุดกราฟวันละหนึ่งจุด (≤ 180) · ปีงบเริ่มเดือน settings.fy_start · พันธกิจ settings.mission (แก้ได้เฉพาะ OA) */
CREATE TABLE dbo.goals (
    id           UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    name         NVARCHAR(200)    NOT NULL,
    owner_id     UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    team_id      UNIQUEIDENTIFIER NULL,          -- NULL = เป้าหมายบริษัท (FK หลังสร้าง dbo.teams)
    parent_id    UNIQUEIDENTIFIER NULL REFERENCES dbo.goals(id),
    period_kind  VARCHAR(6)       NOT NULL DEFAULT 'fy' CONSTRAINT ck_goals_period CHECK (period_kind IN ('fy','h1','h2','q1','q2','q3','q4','custom')),
    fiscal_year  SMALLINT         NULL,
    period_from  DATE             NULL,
    period_to    DATE             NULL,
    privacy      VARCHAR(7)       NOT NULL DEFAULT 'public' CONSTRAINT ck_goals_privacy CHECK (privacy IN ('public','private')),
    description  NVARCHAR(MAX)    NULL,
    metric_src   VARCHAR(8)       NOT NULL DEFAULT 'manual' CONSTRAINT ck_goals_src CHECK (metric_src IN ('manual','subgoals','projects','tasks')),
    metric_unit  VARCHAR(8)       NOT NULL DEFAULT 'percent' CONSTRAINT ck_goals_unit CHECK (metric_unit IN ('percent','number','currency')),
    start_value  DECIMAL(18,4)    NOT NULL DEFAULT 0,
    target_value DECIMAL(18,4)    NOT NULL DEFAULT 100,
    current_value DECIMAL(18,4)   NOT NULL DEFAULT 0,
    currency     CHAR(3)          NULL,
    agg          VARCHAR(3)       NOT NULL DEFAULT 'avg',      -- avg | sum
    proj_by      VARCHAR(10)      NOT NULL DEFAULT 'tasks',    -- tasks | milestones
    status_state VARCHAR(10)      NULL,                        -- on_track | at_risk | off_track
    closed_outcome VARCHAR(8)     NULL CONSTRAINT ck_goals_outcome CHECK (closed_outcome IN ('achieved','partial','missed','dropped')),
    closed_note  NVARCHAR(2000)   NULL,
    closed_at    DATETIME2(0)     NULL,
    remind       BIT              NOT NULL DEFAULT 1,
    created_by   UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at   DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE TABLE dbo.goal_members (goal_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.goals(id) ON DELETE CASCADE,
    user_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id), CONSTRAINT pk_goal_members PRIMARY KEY (goal_id, user_id));
CREATE TABLE dbo.goal_weights (goal_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.goals(id), child_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.goals(id),
    weight DECIMAL(5,2) NOT NULL, CONSTRAINT pk_goal_weights PRIMARY KEY (goal_id, child_id));   -- รวมต้อง = 100
CREATE TABLE dbo.goal_sources (goal_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.goals(id) ON DELETE CASCADE,
    item_id UNIQUEIDENTIFIER NOT NULL,          -- project (src=projects) หรือ task (src=tasks)
    CONSTRAINT pk_goal_sources PRIMARY KEY (goal_id, item_id));
CREATE TABLE dbo.goal_related (goal_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.goals(id) ON DELETE CASCADE,
    item_id UNIQUEIDENTIFIER NOT NULL,          -- project | portfolio | task
    CONSTRAINT pk_goal_related PRIMARY KEY (goal_id, item_id));
CREATE TABLE dbo.goal_updates (id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY, goal_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.goals(id) ON DELETE CASCADE,
    state VARCHAR(10) NOT NULL, body NVARCHAR(MAX) NULL, progress DECIMAL(5,1) NOT NULL, author_id UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME());
CREATE TABLE dbo.goal_history (goal_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.goals(id) ON DELETE CASCADE, day DATE NOT NULL,
    progress DECIMAL(5,1) NOT NULL, CONSTRAINT pk_goal_history PRIMARY KEY (goal_id, day));
CREATE TABLE dbo.goal_comments (id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(), goal_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.goals(id) ON DELETE CASCADE,
    author_id UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id), body NVARCHAR(MAX) NOT NULL, created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME());
CREATE TABLE dbo.goal_activity (id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY, goal_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.goals(id) ON DELETE CASCADE,
    actor_id UNIQUEIDENTIFIER NULL, msg_key NVARCHAR(200) NOT NULL, params NVARCHAR(1000) NULL, created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME());
CREATE TABLE dbo.goal_fields (id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(), name NVARCHAR(80) NOT NULL,
    type VARCHAR(6) NOT NULL CONSTRAINT ck_goal_fields_type CHECK (type IN ('text','number','select')), options_json NVARCHAR(MAX) NULL);
CREATE TABLE dbo.goal_field_values (goal_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.goals(id) ON DELETE CASCADE,
    field_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.goal_fields(id) ON DELETE CASCADE, value_json NVARCHAR(4000) NULL,
    CONSTRAINT pk_goal_field_values PRIMARY KEY (goal_id, field_id));
-- custom_fields.ref_kinds ตอนนี้รวม goal ได้แล้ว (task,project,portfolio,goal)
GO

CREATE TABLE dbo.project_teams (
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    team_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.teams(id) ON DELETE CASCADE,
    access      VARCHAR(8)       NOT NULL CONSTRAINT ck_project_teams_access CHECK (access IN ('admin','edit','comment','view')),
    CONSTRAINT pk_project_teams PRIMARY KEY (project_id, team_id)
);
GO

/* ---------------------------------------------------------------
   งานขออนุมัติหลายผู้อนุมัติ (Sprint 4c) — ต้องอยู่ก่อน fn_VisibleTasks เพราะฟังก์ชันอ้างถึง
   t.approvers [userId] (≥ 2 คนจึงเก็บ ไม่งั้น = assignee_id เดี่ยวแบบเดิม) · t.approvalMode 'all'|'any'
   t.approvalVotes {userId: approved|changes|rejected} ของรอบปัจจุบัน ล้างเมื่อกลับไปรอ (pending) ·
   t.approvalTrail [{u,d,at,note}] เก็บ 100 รายการล่าสุด (เก็บถาวรในตาราง ตัดทิ้งตอนอ่านก็ได้)
   --------------------------------------------------------------- */
ALTER TABLE dbo.tasks ADD
    approval_mode VARCHAR(3) NOT NULL CONSTRAINT df_tasks_apmode DEFAULT 'all'
                  CONSTRAINT ck_tasks_apmode CHECK (approval_mode IN ('all','any')),
    slips         INT        NOT NULL CONSTRAINT df_tasks_slips DEFAULT 0;   -- จำนวนครั้งที่เลื่อนกำหนดส่งรวดเดียว (slipOverdue)
GO
CREATE TABLE dbo.task_approvers (
    task_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    user_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    position  INT              NOT NULL DEFAULT 0,     -- คนแรก = ผู้รับผิดชอบหลัก (= tasks.assignee_id)
    vote      VARCHAR(8)       NULL,                   -- approved | changes | rejected | NULL = ยังไม่โหวตรอบนี้ (approvalVotes)
    voted_at  DATETIME2(0)     NULL,
    CONSTRAINT pk_task_approvers PRIMARY KEY (task_id, user_id),
    CONSTRAINT ck_ap_vote CHECK (vote IS NULL OR vote IN ('approved','changes','rejected'))
);
CREATE INDEX ix_ap_user ON dbo.task_approvers(user_id) INCLUDE (task_id, vote);
CREATE TABLE dbo.task_approval_trail (
    id        BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    task_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    user_id   UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    decision  VARCHAR(8)       NOT NULL,
    note      NVARCHAR(500)    NULL,
    at        DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_aptrail_dec CHECK (decision IN ('approved','changes','rejected','pending'))
);
CREATE INDEX ix_aptrail_task ON dbo.task_approval_trail(task_id, at DESC);
GO

/* =============================================================
   ด่านสิทธิ์ — ทุกคำสั่งอ่านต้องผ่านฟังก์ชันนี้
   =============================================================

   คืนรายการโปรเจกต์ที่ผู้ใช้คนนี้เห็นได้ พร้อมระดับสิทธิ์
   กติกา — เรียงตามลำดับ ข้อที่อยู่บนกว่าชนะ
     - ผู้ดูแลระบบเห็นทุกโปรเจกต์ ระดับ admin
     - "ดูอย่างเดียว" เห็นเท่าที่ member เห็น แต่ได้ระดับ view เสมอ
       เป็นเพดาน ไม่ใช่ค่าเริ่มต้น ถูกเชิญเข้าโปรเจกต์ด้วยระดับ edit ก็ยังได้แค่ view
     - เป็นสมาชิกโปรเจกต์ ได้ระดับตามที่กำหนดไว้
     - โปรเจกต์เปิด และไม่ใช่บุคคลภายนอก ได้ระดับ edit
     - นอกนั้นไม่เห็นเลย

   คืน can_structure มาด้วย เป็นด่านที่สองแยกจากระดับสิทธิ์ ดูคำอธิบายในตัวฟังก์ชัน

   ตรงกับ projectAccess() ใน app/store.js ทีละข้อ แก้ที่ไหนต้องแก้อีกที่ด้วย
   ============================================================= */
CREATE OR ALTER FUNCTION dbo.fn_VisibleProjects (@user_id UNIQUEIDENTIFIER)
RETURNS TABLE
AS
RETURN
(
    /* Phase 5 sync — เพิ่มสิทธิ์ผ่านทีม (project_teams) และบังคับโปรเจกต์ private ที่ชั้นนี้
       ระดับที่ได้ = ค่าสูงสุดระหว่าง project_members กับทีมที่ผู้ใช้อยู่ (admin > edit > comment > view)
       โปรเจกต์ visibility = 'private' เห็นได้เฉพาะ ผู้ดูแลระบบ · สมาชิกโดยตรง · สมาชิกของทีมที่ผูกไว้
       (เจ้าของ owner_id ต้องมีแถวใน project_members เสมอ ตอนสร้างโปรเจกต์ API ต้องใส่ให้) */
    WITH me AS (
        SELECT org_role FROM dbo.users WHERE id = @user_id AND is_active = 1
    ),
    grants AS (
        SELECT pm.project_id,
               CASE pm.access WHEN 'admin' THEN 4 WHEN 'edit' THEN 3 WHEN 'comment' THEN 2 ELSE 1 END AS rk
        FROM dbo.project_members pm WHERE pm.user_id = @user_id
        UNION ALL
        SELECT pt.project_id,
               CASE pt.access WHEN 'admin' THEN 4 WHEN 'edit' THEN 3 WHEN 'comment' THEN 2 ELSE 1 END
        FROM dbo.project_teams pt
        INNER JOIN dbo.team_members tm ON tm.team_id = pt.team_id AND tm.user_id = @user_id
    ),
    best AS (SELECT project_id, MAX(rk) AS rk FROM grants GROUP BY project_id)
    SELECT
        p.id AS project_id,
        CASE
            WHEN u.org_role = 'admin'  THEN 'admin'
            WHEN u.org_role = 'viewer' THEN 'view'
            WHEN b.rk IS NOT NULL      THEN CASE b.rk WHEN 4 THEN 'admin' WHEN 3 THEN 'edit' WHEN 2 THEN 'comment' ELSE 'view' END
            ELSE 'edit'
        END AS access,

        /* แก้โครงสร้างได้ไหม — เซกชัน ฟิลด์กำหนดเอง ชื่อโปรเจกต์ มุมมองที่บันทึกไว้ ค่าเริ่มต้นมุมมอง
           ฟิลด์บังคับ ตั้งค่างานเงียบ อัตโนมัติ

           ต้องแยกเป็นบิตต่างหาก เพราะ "แก้งานได้ แต่แก้โครงสร้างไม่ได้" ไม่มีขั้นของ
           ตัวเองบนบันได admin > edit > comment > view — บุคคลภายนอกตกอยู่ระหว่าง
           edit กับ comment พอดี ถ้าไม่มีบิตนี้ guest ที่ถูกเชิญด้วยระดับ edit จะเปลี่ยน
           ชื่อโปรเจกต์ได้ ทั้งที่บทบาทระดับองค์กรไม่ให้

           เป็นเรื่องของบทบาทองค์กรล้วน ๆ ไม่เกี่ยวกับสิทธิ์ในโปรเจกต์ ปลายทางที่แก้
           โครงสร้างจึงต้องผ่านสองด่าน คือ access >= edit และ can_structure = 1
           ตรงกับ ROLE_CAPS ใน app/store.js ที่ guest กับ viewer ไม่มี cap 'structure' */
        CASE WHEN u.org_role IN ('admin','member') THEN 1 ELSE 0 END AS can_structure
    FROM dbo.projects p
    CROSS JOIN me u
    LEFT JOIN best b ON b.project_id = p.id
    WHERE p.deleted_at IS NULL
      AND (
            u.org_role = 'admin'
         OR b.project_id IS NOT NULL
         OR (p.visibility = 'org' AND u.org_role <> 'guest')
      )
);
GO

/* งานที่ผู้ใช้เห็นได้ = งานที่อยู่ในโปรเจกต์ที่เขาเห็นได้อย่างน้อยหนึ่งโปรเจกต์
   บวกกับงานที่เขาเป็นคู่กรณีโดยตรง คือถูกมอบหมาย เป็นคนสร้าง หรือเป็นผู้ติดตาม

   ที่ต้องบวกคู่กรณีเข้ามา เพราะไม่งั้นจะเกิดงานผี คือถูกสั่งงานในโปรเจกต์ปิด
   ที่ตัวเองไม่ได้เป็นสมาชิก แล้วเปิดงานนั้นไม่ได้เลย งานจะค้างโดยไม่มีใครรู้สาเหตุ
   เป็นกติกาเดียวกับ Asana และตรงกับ canSeeTask() ฝั่งเบราว์เซอร์

   เห็น "ตัวงาน" ได้ ไม่ได้แปลว่าเข้าโปรเจกต์นั้นได้ การเข้าโปรเจกต์ยังต้องผ่าน
   fn_VisibleProjects เหมือนเดิม และการแก้ไขยังคุมด้วยระดับสิทธิ์ในโปรเจกต์
   ยกเว้นกรณีที่ไม่ได้เป็นสมาชิกโปรเจกต์ใดของงานนั้นเลย จึงให้แก้งานของตัวเองได้

   หมายเหตุสำคัญ: ถ้างานหนึ่งอยู่ทั้งโปรเจกต์เปิดและโปรเจกต์ปิด
   คนที่เห็นแค่โปรเจกต์เปิดจะเห็นตัวงาน แต่ต้องไม่เห็นว่ามันไปอยู่โปรเจกต์ปิดด้วย
   การกรองรายชื่อโปรเจกต์ของงานทำที่ชั้น API */
/* งานส่วนตัว (2a) = งานต้นทางไม่อยู่ใน task_projects เลย เห็นเฉพาะคู่กรณีตามส่วนล่างของฟังก์ชันนี้
   งานย่อยต้องใช้สิทธิ์ของงานต้นทาง (ยังไม่ได้เขียนลงฟังก์ชันนี้ — ทำตอนย้ายไป API) */
CREATE OR ALTER FUNCTION dbo.fn_VisibleTasks (@user_id UNIQUEIDENTIFIER)
RETURNS TABLE
AS
RETURN
(
    SELECT DISTINCT tp.task_id
    FROM dbo.task_projects tp
    INNER JOIN dbo.fn_VisibleProjects(@user_id) vp ON vp.project_id = tp.project_id

    UNION

    SELECT t.id
    FROM dbo.tasks t
    WHERE t.deleted_at IS NULL
      AND (
            t.assignee_id = @user_id
         OR t.created_by  = @user_id
         OR EXISTS (SELECT 1 FROM dbo.task_followers f
                     WHERE f.task_id = t.id AND f.user_id = @user_id)
         /* Phase 5 sync — ผู้อนุมัติหลายคน (task_approvers) เป็นคู่กรณีของงานด้วย
            เห็นงานขออนุมัติได้แม้ไม่ได้อยู่ในโปรเจกต์ปิด */
         OR EXISTS (SELECT 1 FROM dbo.task_approvers ap
                     WHERE ap.task_id = t.id AND ap.user_id = @user_id)
         /* งานย่อยใช้สิทธิ์ของงานต้นทาง (งานย่อยไม่มีแถวใน task_projects) */
         OR EXISTS (SELECT 1 FROM dbo.task_projects tp2
                     INNER JOIN dbo.fn_VisibleProjects(@user_id) vp2 ON vp2.project_id = tp2.project_id
                     WHERE tp2.task_id = t.parent_id)
      )
);
GO

/* =============================================================
   จัดลำดับใหม่เมื่อช่องว่างของ position แคบเกินไป
   เรียกจาก API เมื่อพบว่าช่องว่างน้อยกว่า 0.000001
   ============================================================= */
CREATE PROCEDURE dbo.sp_RebalanceSection
    @project_id UNIQUEIDENTIFIER,
    @section_id UNIQUEIDENTIFIER = NULL
AS
BEGIN
    SET NOCOUNT ON;
    ;WITH ordered AS (
        SELECT tp.task_id,
               ROW_NUMBER() OVER (ORDER BY tp.position, tp.added_at) * 1000.0 AS new_pos
        FROM dbo.task_projects tp
        WHERE tp.project_id = @project_id
          AND (@section_id IS NULL OR tp.section_id = @section_id)
    )
    UPDATE tp
       SET tp.position = o.new_pos
      FROM dbo.task_projects tp
      INNER JOIN ordered o ON o.task_id = tp.task_id
     WHERE tp.project_id = @project_id;
END;
GO

/* =============================================================
   ค้นหา
   =============================================================
   ⚠️ ภาษาไทยไม่มีช่องว่างระหว่างคำ ตัวตัดคำของ SQL Server ทำงานได้ไม่ดี
      ต้องทดสอบจริงตั้งแต่ต้นโครงการ ถ้าผลไม่ดีพอให้ย้ายไป Azure AI Search
      ระหว่างนี้ใช้ LIKE '%คำค้น%' ซึ่งช้ากว่าแต่ได้ผลถูกต้องแน่นอน
      ที่ระดับ 20,000 งาน ยังเร็วพอ
   ============================================================= */
CREATE INDEX ix_tasks_name ON dbo.tasks(name) WHERE deleted_at IS NULL;
GO

/* =============================================================
   ของส่วนตัวของแต่ละคน (ชิ้นงาน 2a) — ตรงกับ db.personal[userId] ใน app/store.js (SCHEMA 9)
   งานของฉันแบบมีเซกชัน หน้าแรกที่จัดเอง กล่องข้อความ สมุดโน้ต
   ห้ามคืนแถวของคนอื่นเด็ดขาด — ทุกปลายทางกรองด้วย user_id = ผู้เรียก
   ============================================================= */
CREATE TABLE dbo.my_task_sections (
    id          VARCHAR(40)      NOT NULL,          -- 'recent' (เพิ่งได้รับมอบหมาย ลบไม่ได้) | today | next | later | ms_…
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    name        NVARCHAR(120)    NOT NULL DEFAULT N'',   -- ว่าง = ชื่อมาตรฐานตามภาษา
    position    INT              NOT NULL,
    CONSTRAINT pk_my_task_sections PRIMARY KEY (user_id, id)
);
GO

/* งานที่เจ้าตัวจัดลงเซกชันแล้ว — ไม่มีแถว หรือ placed_at < tasks.assigned_at = อยู่ "เพิ่งได้รับมอบหมาย"
   seen_at = เปิดดูแล้วหลังได้รับมอบหมาย (ไม่มีจุดสีฟ้า) */
CREATE TABLE dbo.my_task_placements (
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    task_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    section_id  VARCHAR(40)      NULL,
    position    FLOAT            NULL,
    placed_at   DATETIME2(3)     NULL,
    seen_at     DATETIME2(3)     NULL,
    CONSTRAINT pk_my_task_placements PRIMARY KEY (user_id, task_id)
);
GO

/* มุมมองงานของฉัน วิดเจ็ตหน้าแรก การเรียงกล่องข้อความ สมุดโน้ต — แถวเดียวต่อคน
   ห้ามรบกวนกับการแจ้งเตือนรายโปรเจกต์อยู่ใน users.prefs_json (dnd, projNotify) */
CREATE TABLE dbo.user_personal (
    user_id       UNIQUEIDENTIFIER NOT NULL PRIMARY KEY REFERENCES dbo.users(id) ON DELETE CASCADE,
    my_view_json  NVARCHAR(1000)   NULL,   -- {"mode","group","sort","dir","show","due","project","cal"}
    home_json     NVARCHAR(2000)   NULL,   -- [{"w":"mine","full":false},…]  NULL = ค่าเริ่มต้น
    inbox_json    NVARCHAR(200)    NULL,   -- {"sort":"new|relevance","dense":false}
    notepad       NVARCHAR(MAX)    NULL,   -- ไม่เกิน 20,000 ตัวอักษร
    cal_json      NVARCHAR(200)    NULL,   -- ปฏิทินรวม {"mode","weekends","colorBy"} (2b)
    updated_at    DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* มุมมองที่ทำงานอยู่ของแต่ละคนในแต่ละโปรเจกต์ (ชิ้นงาน 2b) — ตรงกับ db.personal[userId].pv[projectId]
   รูปแบบเดียวกับ saved_views.config_json แก้ได้เฉพาะเจ้าตัว ไม่มีผลกับคนอื่น */
CREATE TABLE dbo.user_project_views (
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    config_json NVARCHAR(MAX)    NOT NULL,
    updated_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_user_project_views PRIMARY KEY (user_id, project_id)
);
GO

/* ---------------------------------------------------------------
   ชิ้นงาน 2c (SCHEMA 11) — คลังฟิลด์ รหัสงาน บทบาท คำขอเข้าโปรเจกต์ การค้นหาที่บันทึกไว้
   --------------------------------------------------------------- */
/* ฟิลด์ชนิดรหัสงาน (id) เลขรันต่อโปรเจกต์ ค่าใน task_field_values เป็นตัวเลขล้วน แสดงเป็น prefix-เลข */
ALTER TABLE dbo.custom_fields DROP CONSTRAINT ck_field_type;
ALTER TABLE dbo.custom_fields ADD CONSTRAINT ck_field_type
    CHECK (field_type IN ('text','number','select','multi','date','person','id'));
ALTER TABLE dbo.custom_fields ADD
    description NVARCHAR(300) NULL,                 -- คำอธิบายฟิลด์
    notify_on_change BIT NOT NULL DEFAULT 0,        -- แจ้งผู้ติดตามเมื่อค่าเปลี่ยน (ตัวเลือก)
    id_prefix   VARCHAR(8)    NULL,                 -- รหัสงาน: คำนำหน้า เช่น REQ
    id_next     INT           NULL,                 -- รหัสงาน: เลขถัดไปของโปรเจกต์นี้
    library_field_id UNIQUEIDENTIFIER NULL;         -- ใช้ฟิลด์จากคลัง (ค่าเดียวกันทุกโปรเจกต์ที่ใช้)
GO
/* คลังฟิลด์ขององค์กร — โปรเจกต์ที่ใช้อ้างถึงผ่าน custom_fields.library_field_id แก้ที่คลังแล้วทุกโปรเจกต์เปลี่ยนตาม */
CREATE TABLE dbo.library_fields (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    name        NVARCHAR(200)    NOT NULL,
    field_type  VARCHAR(10)      NOT NULL,           -- ไม่มี 'id' (รหัสงานเป็นของแต่ละโปรเจกต์)
    format_json NVARCHAR(200)    NULL,
    options_json NVARCHAR(MAX)   NULL,               -- [{"name","color"}]
    description NVARCHAR(300)    NULL,
    notify_on_change BIT NOT NULL DEFAULT 0,
    created_by  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    CONSTRAINT ck_library_field_type CHECK (field_type IN ('text','number','select','multi','date','person'))
);
/* บทบาทในโปรเจกต์ (ข้อความอิสระ ไม่ใช่สิทธิ์) — ตรงกับ project.roles */
CREATE TABLE dbo.project_roles (
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    role_text   NVARCHAR(60)     NOT NULL,
    CONSTRAINT pk_project_roles PRIMARY KEY (project_id, user_id)
);
/* คำขอเข้าโปรเจกต์ปิด — ตรงกับ project.accessRequests
   Sprint 1B: แจ้งเจ้าของทางกล่องข้อความ (ชนิด access) ไม่สร้างงานแล้ว task_id มีเฉพาะคำขอแบบเก่า */
CREATE TABLE dbo.project_access_requests (
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    task_id     UNIQUEIDENTIFIER NULL REFERENCES dbo.tasks(id),
    note        NVARCHAR(1000)   NULL,
    requested_at DATETIME2(0)    NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_access_requests PRIMARY KEY (project_id, user_id)
);
/* การค้นหาที่บันทึกไว้ของแต่ละคน — ตรงกับ db.personal[userId].searches
   conds_json รูปแบบเดียวกับตัวกรองของมุมมอง [{f,op,v}] บวก project psection assignedBy followers attachment blocking subtask */
CREATE TABLE dbo.saved_searches (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    name        NVARCHAR(60)     NOT NULL,
    query_text  NVARCHAR(300)    NULL,
    conds_json  NVARCHAR(MAX)    NULL,
    mode        VARCHAR(10)      NOT NULL DEFAULT 'list',  -- list | calendar
    position    INT              NOT NULL DEFAULT 0
);
GO

/* ---------- 3c ส่วนที่ 1 — ภาพรวม แดชบอร์ด ประกาศ (SCHEMA 14) ---------- */
ALTER TABLE dbo.projects ADD
    brief_md     NVARCHAR(MAX)    NULL,           -- บรีฟโปรเจกต์ มาร์กดาวน์ย่อแบบบล็อก (project.brief)
    brief_by     UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    brief_at     DATETIME2(0)     NULL,
    ms_show      VARCHAR(8)       NOT NULL DEFAULT 'open';   -- open | all แผงหมุดหมายบนภาพรวม
GO
/* ทรัพยากรสำคัญ — ลิงก์หรือไฟล์ (ไฟล์ ≤ 2 MB จนกว่าชิ้นงาน 4b ย้ายไป SharePoint) */
CREATE TABLE dbo.project_resources (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    kind        VARCHAR(8)       NOT NULL,        -- link | file
    name        NVARCHAR(200)    NOT NULL,
    url         NVARCHAR(MAX)    NOT NULL,        -- https://… หรือ data URI / driveItem webUrl (4b)
    size_bytes  INT              NULL,
    mime        VARCHAR(100)     NULL,
    position    INT              NOT NULL DEFAULT 0,
    created_by  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_resource_kind CHECK (kind IN ('link','file'))
);
/* วิดเจ็ตแดชบอร์ดของโปรเจกต์ (ไม่มีแถว = แดชบอร์ดตั้งต้น) สูงสุด 20 ต่อโปรเจกต์ */
CREATE TABLE dbo.dashboard_widgets (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    kind        VARCHAR(12)      NOT NULL,        -- bar stack group line burnup burndown donut number lollipop text
    title       NVARCHAR(120)    NULL,
    x_axis      VARCHAR(80)      NULL,            -- assignee section priority type cstatus completed period field:<id>
    y_axis      VARCHAR(80)      NULL,            -- count sum:<fieldId> avg:<fieldId> est actual
    split_by    VARCHAR(80)      NULL,
    filters_json NVARCHAR(MAX)   NULL,            -- [{f,op,v}] ชุดเดียวกับตัวกรองของมุมมอง
    full_width  BIT              NOT NULL DEFAULT 0,
    text_md     NVARCHAR(MAX)    NULL,
    bench       FLOAT            NULL,
    period_unit VARCHAR(8)       NULL,            -- day | week | month
    period_n    INT              NULL,
    date_field  VARCHAR(16)      NULL,            -- created | completedOn | due
    position    INT              NOT NULL DEFAULT 0
);
/* ประกาศ: คำตอบ ผู้เข้าร่วม ไฟล์แนบ */
CREATE TABLE dbo.message_replies (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    message_id  UNIQUEIDENTIFIER NOT NULL,        -- อ้าง project_messages.id
    body_md     NVARCHAR(MAX)    NOT NULL,
    created_by  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE TABLE dbo.message_followers (
    message_id  UNIQUEIDENTIFIER NOT NULL,
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    CONSTRAINT pk_message_followers PRIMARY KEY (message_id, user_id)
);
CREATE TABLE dbo.message_attachments (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    message_id  UNIQUEIDENTIFIER NOT NULL,
    reply_id    UNIQUEIDENTIFIER NULL REFERENCES dbo.message_replies(id),
    name        NVARCHAR(200)    NOT NULL,
    url         NVARCHAR(MAX)    NOT NULL,
    size_bytes  INT              NULL,
    mime        VARCHAR(100)     NULL
);
GO

/* ---------- 3c ส่วนที่ 2 — หน้าเอกสาร เวลา สูตร อ้างอิง ตรวจรูป (SCHEMA 14) ---------- */
ALTER TABLE dbo.custom_fields DROP CONSTRAINT ck_field_type;
ALTER TABLE dbo.custom_fields ADD CONSTRAINT ck_field_type
    CHECK (field_type IN ('text','number','select','multi','date','person','id','formula','ref'));
ALTER TABLE dbo.custom_fields ADD
    formula_expr NVARCHAR(1000)  NULL,           -- สูตรที่เก็บเป็นรหัสฟิลด์ {f_…} / {due} … คำนวณตอนอ่าน ไม่เก็บค่าในงาน
    formula_out  VARCHAR(8)      NULL,           -- number | date
    ref_kinds    VARCHAR(60)     NULL;           -- task,project,portfolio (goal ตอนมีชิ้นงาน 4a)
ALTER TABLE dbo.tasks ADD
    estimate_minutes INT NULL;                   -- เวลาประมาณ (นาที)
GO
/* หน้าเอกสาร — project_id NULL = หน้าเดี่ยว (owner_id + is_private) สมุดโน้ตส่วนตัว = is_notepad */
CREATE TABLE dbo.pages (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_id  UNIQUEIDENTIFIER NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    owner_id    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    is_private  BIT              NOT NULL DEFAULT 0,
    is_notepad  BIT              NOT NULL DEFAULT 0,
    title       NVARCHAR(200)    NOT NULL DEFAULT N'',
    icon        NVARCHAR(4)      NULL,
    body_md     NVARCHAR(MAX)    NOT NULL DEFAULT N'',   -- มาร์กดาวน์ย่อแบบบล็อก รูปอ้าง ![…](img:<id>)
    created_by  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    edited_by   UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    edited_at   DATETIME2(0)     NULL
);
CREATE TABLE dbo.page_images (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    page_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.pages(id) ON DELETE CASCADE,
    name        NVARCHAR(120)    NULL,
    url         NVARCHAR(MAX)    NOT NULL,       -- data URI ≤ 500 KB (4b: driveItem)
    size_bytes  INT              NULL
);
/* เก็บ 20 เวอร์ชันล่าสุดต่อหน้า */
CREATE TABLE dbo.page_versions (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    page_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.pages(id) ON DELETE CASCADE,
    title       NVARCHAR(200)    NULL,
    body_md     NVARCHAR(MAX)    NOT NULL,
    saved_by    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    saved_at    DATETIME2(0)     NOT NULL
);
/* ความเห็นบนข้อความในหน้า (reply_to NULL = ความเห็นหลักพร้อมข้อความที่ยกมา) */
CREATE TABLE dbo.page_comments (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    page_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.pages(id) ON DELETE CASCADE,
    reply_to    UNIQUEIDENTIFIER NULL REFERENCES dbo.page_comments(id),
    quote       NVARCHAR(300)    NULL,
    body        NVARCHAR(MAX)    NOT NULL,
    resolved    BIT              NOT NULL DEFAULT 0,
    created_by  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
/* รายการเวลา — billable / category สำรองให้ไทม์ชีต (4b) */
CREATE TABLE dbo.time_entries (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    task_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    entry_date  DATE             NOT NULL,
    minutes     INT              NOT NULL CHECK (minutes > 0),
    note        NVARCHAR(500)    NULL,
    billable    BIT              NULL,
    category    NVARCHAR(60)     NULL
);
/* นาฬิกาจับเวลาที่เดินอยู่ คนละหนึ่งตัว */
CREATE TABLE dbo.running_timers (
    user_id     UNIQUEIDENTIFIER NOT NULL PRIMARY KEY REFERENCES dbo.users(id),
    task_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    started_at  DATETIME2(0)     NOT NULL
);
/* หมุดบนรูป (ตรวจรูป) — แต่ละหมุดคืองานย่อยหนึ่งชิ้น */
CREATE TABLE dbo.attachment_pins (
    attachment_id UNIQUEIDENTIFIER NOT NULL,
    pin_no      INT              NOT NULL,
    x_ratio     DECIMAL(6,5)     NOT NULL,
    y_ratio     DECIMAL(6,5)     NOT NULL,
    body        NVARCHAR(1000)   NOT NULL,
    subtask_id  UNIQUEIDENTIFIER NULL REFERENCES dbo.tasks(id),
    created_by  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_attachment_pins PRIMARY KEY (attachment_id, pin_no)
);
GO

/* ======================================================================
 * 4b — ภาระงาน ช่วงไม่อยู่ ความจุ ไทม์ชีต รายงานรวม (SCHEMA 17)
 * ====================================================================== */

/* ช่วงไม่อยู่หลายช่วงต่อคน (users.away_until / away_note เดิม = ช่วงที่ครอบวันนี้) — from_date NULL = เริ่มไปแล้ว */
CREATE TABLE dbo.user_away_ranges (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    from_date   DATE             NULL,
    to_date     DATE             NOT NULL,
    note        NVARCHAR(140)    NULL,
    CONSTRAINT ck_away_range CHECK (from_date IS NULL OR from_date <= to_date)
);
CREATE INDEX ix_away_user ON dbo.user_away_ranges(user_id, to_date);

/* ความจุต่อวันทำงาน (users.prefs.capacity) — เจ้าตัวหรือผู้ดูแลระบบแก้ */
CREATE TABLE dbo.user_capacity (
    user_id     UNIQUEIDENTIFIER NOT NULL PRIMARY KEY REFERENCES dbo.users(id) ON DELETE CASCADE,
    tasks_per_day  DECIMAL(7,2)  NOT NULL DEFAULT 3,
    hours_per_day  DECIMAL(7,2)  NOT NULL DEFAULT 8,
    points_per_day DECIMAL(7,2)  NOT NULL DEFAULT 5,
    pct_per_day    DECIMAL(7,2)  NOT NULL DEFAULT 100
);

/* ไทม์ชีตรายสัปดาห์ — ส่งแล้ว/อนุมัติแล้ว = ล็อกรายการเวลาของคนนั้นในสัปดาห์นั้น (ตรวจใน API ก่อนเขียน time_entries) */
CREATE TABLE dbo.timesheets (
    id           UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    user_id      UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    week_start   DATE             NOT NULL,          -- วันจันทร์
    status       NVARCHAR(12)     NOT NULL DEFAULT 'draft',
    minutes      INT              NULL,               -- ยอดตอนส่ง
    submitted_at DATETIME2(0)     NULL,
    reviewed_by  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    reviewed_at  DATETIME2(0)     NULL,
    note         NVARCHAR(500)    NULL,
    CONSTRAINT uq_timesheet UNIQUE (user_id, week_start),
    CONSTRAINT ck_ts_status CHECK (status IN ('draft','submitted','approved','rejected'))
);
CREATE TABLE dbo.timesheet_history (
    timesheet_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.timesheets(id) ON DELETE CASCADE,
    seq          INT              NOT NULL,
    action       NVARCHAR(12)     NOT NULL,          -- submitted|recalled|approved|rejected|reopened
    by_user      UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    at           DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    note         NVARCHAR(500)    NULL,
    CONSTRAINT pk_timesheet_history PRIMARY KEY (timesheet_id, seq)
);
/* หมวดของเวลา + ผู้ตรวจเพิ่มเติม (settings.timeCats / settings.tsReviewers) */
CREATE TABLE dbo.time_categories (
    name        NVARCHAR(60)     NOT NULL PRIMARY KEY,
    sort_order  INT              NOT NULL DEFAULT 0
);
CREATE TABLE dbo.timesheet_reviewers (
    user_id     UNIQUEIDENTIFIER NOT NULL PRIMARY KEY REFERENCES dbo.users(id) ON DELETE CASCADE
);

/* รายงานรวม (แดชบอร์ดข้ามโปรเจกต์) — ข้อมูลในกราฟคิดตามสิทธิ์ของผู้เปิดดูเสมอ */
CREATE TABLE dbo.reports (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    name        NVARCHAR(120)    NOT NULL,
    owner_id    UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    scope_kind  NVARCHAR(10)     NOT NULL DEFAULT 'org',   -- org|team|portfolio|projects
    scope_id    UNIQUEIDENTIFIER NULL,                     -- team / portfolio
    share_org   BIT              NOT NULL DEFAULT 0,
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_report_scope CHECK (scope_kind IN ('org','team','portfolio','projects'))
);
CREATE TABLE dbo.report_projects (
    report_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.reports(id) ON DELETE CASCADE,
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id),
    CONSTRAINT pk_report_projects PRIMARY KEY (report_id, project_id)
);
CREATE TABLE dbo.report_shares (
    report_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.reports(id) ON DELETE CASCADE,
    user_id     UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    team_id     UNIQUEIDENTIFIER NULL REFERENCES dbo.teams(id),
    CONSTRAINT ck_report_share CHECK ((user_id IS NULL) <> (team_id IS NULL))
);
/* วิดเจ็ต — config เป็น JSON รูปแบบเดียวกับ dashboard_widgets + src (tasks|projects|portfolios|goals) และ q (all|open|done|overdue) */
CREATE TABLE dbo.report_widgets (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    report_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.reports(id) ON DELETE CASCADE,
    sort_order  INT              NOT NULL,
    src         NVARCHAR(12)     NOT NULL DEFAULT 'tasks',
    config      NVARCHAR(MAX)    NOT NULL CHECK (ISJSON(config) = 1)
);
GO

/* ======================================================================
 * 4b ส่วนที่ 2 — ไฟล์บน SharePoint/OneDrive และสื่อฝัง
 * ====================================================================== */

/* ไฟล์แนบที่อยู่บนไดรฟ์ — ไม่มีเนื้อไฟล์ในฐานข้อมูล เก็บแค่รหัสไดรฟ์/ไอเท็มกับลิงก์เปิดดู
 * ใช้กับ attachments / message_attachments / project_resources / page_images (blob_path = NULL เมื่อเป็นไฟล์บนไดรฟ์) */
ALTER TABLE dbo.attachments ADD
    drive_id       NVARCHAR(200)  NULL,
    drive_item_id  NVARCHAR(200)  NULL,
    web_url        NVARCHAR(2000) NULL,
    is_linked      BIT            NOT NULL DEFAULT 0;   -- 1 = ลิงก์ไปไฟล์ที่มีอยู่แล้ว (เลือกจาก OneDrive/SharePoint) ไม่ได้อัปใหม่
ALTER TABLE dbo.attachments ALTER COLUMN blob_path NVARCHAR(600) NULL;
ALTER TABLE dbo.message_attachments ADD
    drive_id       NVARCHAR(200)  NULL,
    drive_item_id  NVARCHAR(200)  NULL,
    web_url        NVARCHAR(2000) NULL;
GO

/* สื่อฝังของโปรเจกต์ (มุมมอง embed) — src คือลิงก์ฝังที่แปลงแล้ว ต้องผ่านรายการโฮสต์ที่อนุญาตเท่านั้น */
CREATE TABLE dbo.project_embeds (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    name        NVARCHAR(120)    NOT NULL,
    source_url  NVARCHAR(2000)   NOT NULL,
    embed_url   NVARCHAR(2000)   NOT NULL,
    host        NVARCHAR(20)     NOT NULL,   -- gdocs|gdrive|figma|miro|loom|youtube|m365
    created_by  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_embed_host CHECK (host IN ('gdocs','gdrive','figma','miro','loom','youtube','m365'))
);
GO

/* ======================================================================
 * Sprint 2C — มุมมองผู้บริหาร (SCHEMA 19 ของ app/store.js)
 * ====================================================================== */

/* ตัวเลข ณ ตอนรายงาน และที่เปลี่ยนจากรายงานครั้งก่อน คิดตอนโพสต์แล้วเก็บไว้เลย (ไม่คิดใหม่ตอนเปิดดู)
 * snap = งานทั้งหมด/เสร็จ/เลยกำหนด  chg = สถานะครั้งก่อน + ส่วนต่างงานเสร็จ/เลยกำหนด */
ALTER TABLE dbo.project_status_updates ADD
    snap_total INT NULL, snap_done INT NULL, snap_overdue INT NULL,
    prev_state VARCHAR(10) NULL, delta_done INT NULL, delta_overdue INT NULL;
ALTER TABLE dbo.portfolio_status_updates ADD
    snap_total INT NULL, snap_done INT NULL, snap_overdue INT NULL,
    prev_state VARCHAR(10) NULL, delta_done INT NULL, delta_overdue INT NULL;
GO

/* ถาม/ตอบใต้รายงานสถานะ (statusLog[].replies ในแอป) — หนึ่งระดับ แจ้งคนเขียนรายงาน เจ้าของ คนที่เคยตอบ และคนที่ถูก @ */
CREATE TABLE dbo.status_update_replies (
    id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_update_id   BIGINT NULL REFERENCES dbo.project_status_updates(id) ON DELETE CASCADE,
    portfolio_update_id BIGINT NULL REFERENCES dbo.portfolio_status_updates(id),
    author_id     UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    body          NVARCHAR(MAX)    NOT NULL,   -- มาร์กดาวน์ย่อชุดเดียวกับความเห็น (@ชื่อ ได้)
    created_at    DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_sur_parent CHECK ((project_update_id IS NULL AND portfolio_update_id IS NOT NULL)
                                 OR (project_update_id IS NOT NULL AND portfolio_update_id IS NULL))
);
GO

/* =============================================================
   Phase 5 sync — ให้ตรงกับ app/store.js SCHEMA 19 (Sprint 1–4 และงานต่อเนื่อง)
   ส่วนนี้เขียนให้รันซ้ำได้ (IF COL_LENGTH / OBJECT_ID) เพื่อใช้กับฐานที่สร้างจากเวอร์ชันก่อนหน้า
   ที่แก้ในไฟล์ส่วนบนแล้ว: fn_VisibleProjects (ทีม + private), fn_VisibleTasks (ผู้อนุมัติ + งานย่อย),
   tasks.approval_mode/slips, task_approvers, task_approval_trail
   ============================================================= */

/* ---------- ผู้ใช้: หัวหน้า ธงข้อมูลตัวอย่าง และป้ายหลุมศพ ---------- */
IF COL_LENGTH('dbo.users','manager_id') IS NULL
    ALTER TABLE dbo.users ADD manager_id UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id);   -- หัวหน้า (user.managerId) ใช้เลือกผู้รับโอนงาน
IF COL_LENGTH('dbo.users','is_sample') IS NULL
    ALTER TABLE dbo.users ADD is_sample BIT NOT NULL CONSTRAINT df_users_sample DEFAULT 0;  -- user.sample = ข้อมูลตัวอย่างจาก seed()
GO
IF COL_LENGTH('dbo.projects','is_sample') IS NULL
    ALTER TABLE dbo.projects ADD is_sample BIT NOT NULL CONSTRAINT df_proj_sample DEFAULT 0; -- project.sample
GO
/* ผู้ใช้ตัวอย่างที่ล้างออกแล้ว (db.removedUsers) — ความเห็น/ประวัติเก่ายังอ้าง id นี้ จึงแสดงเป็น "ผู้ใช้ตัวอย่าง (ลบแล้ว)"
   ฐานจริงไม่ควรมีข้อมูลตัวอย่างหลังย้าย (ดูหัวข้อย้ายข้อมูลใน docs/API.md) ตารางนี้เก็บไว้ให้นำเข้าได้ครบ */
IF OBJECT_ID(N'dbo.removed_users','U') IS NULL
CREATE TABLE dbo.removed_users (
    id         UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    removed_at DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* ---------- ค่าตั้งระดับองค์กร (db.settings) ----------
   key ที่ใช้อยู่: orgLang (th|en) · orgPrivacy (org|private = ค่าเริ่มต้น "ใครเห็น" ของโปรเจกต์ใหม่) ·
   fyStart (1–12) · mission · missionBy · missionAt · timeCats · tsReviewers
   (time_categories / timesheet_reviewers เป็นตารางเฉพาะแล้ว ใช้ตารางนั้นเป็นหลัก) · แก้ได้เฉพาะผู้ดูแลระบบ */
IF OBJECT_ID(N'dbo.org_settings','U') IS NULL
CREATE TABLE dbo.org_settings (
    [key]       VARCHAR(40)    NOT NULL PRIMARY KEY,
    value_json  NVARCHAR(MAX)  NULL,
    updated_by  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    updated_at  DATETIME2(0)   NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_org_settings_json CHECK (value_json IS NULL OR ISJSON(value_json) = 1)
);
GO
/* วันหยุดราชการไทย — ตอนนี้ฝั่งแอปเป็นรายการคงที่ในโค้ด (แถบเทาใน Gantt/ปฏิทิน และการเลื่อนวันตาม work_days)
   ตารางนี้เผื่อให้ผู้ดูแลระบบเพิ่ม/ปิดวันหยุดพิเศษโดยไม่ต้องแก้โค้ด (ยังไม่มีหน้าจอ ไม่บังคับใช้) */
IF OBJECT_ID(N'dbo.org_holidays','U') IS NULL
CREATE TABLE dbo.org_holidays (
    on_date   DATE          NOT NULL PRIMARY KEY,
    name      NVARCHAR(120) NOT NULL,
    is_off    BIT           NOT NULL DEFAULT 1
);
GO

/* ---------- โปรเจกต์: งานเงียบ นัดประชุมถัดไป ฟิลด์บังคับ ค่าเริ่มต้นมุมมอง ---------- */
IF COL_LENGTH('dbo.projects','stale_days') IS NULL
    ALTER TABLE dbo.projects ADD
        stale_days     INT NULL CONSTRAINT ck_proj_stale CHECK (stale_days IS NULL OR stale_days BETWEEN 0 AND 365), -- 0/NULL = ปิด
        stale_move_to  UNIQUEIDENTIFIER NULL REFERENCES dbo.sections(id),   -- เงียบเกิน 30 วัน ย้ายไปเซกชันนี้
        next_meeting   DATE NULL;                                           -- project.nextMeeting สร้างหน้าบันทึกประชุมล่วงหน้า
GO
/* ฟิลด์ที่ต้องกรอกก่อนปิดงาน (project.requiredFields) — เฉพาะงานระดับบนสุด งานย่อยไม่บังคับ
   API ตรวจตอน PATCH completed = 1 → 422 พร้อมรายชื่อฟิลด์ที่ขาด (missingRequiredFields) */
IF OBJECT_ID(N'dbo.project_required_fields','U') IS NULL
CREATE TABLE dbo.project_required_fields (
    project_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    field_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.custom_fields(id),
    CONSTRAINT pk_project_required_fields PRIMARY KEY (project_id, field_id)
);
GO
/* ค่าเริ่มต้นของมุมมองต่อชนิด (project.viewDefaults[kind] = viewDiff) ผู้มีสิทธิ์โครงสร้างตั้ง · คนที่ยังไม่เคยปรับเห็นแบบนี้ */
IF OBJECT_ID(N'dbo.project_view_defaults','U') IS NULL
CREATE TABLE dbo.project_view_defaults (
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    kind        VARCHAR(12)      NOT NULL,
    config_json NVARCHAR(MAX)    NOT NULL,
    updated_by  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    updated_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_project_view_defaults PRIMARY KEY (project_id, kind),
    CONSTRAINT ck_pvd_kind CHECK (kind IN ('list','board','timeline','gantt','calendar'))
);
GO
/* ฟิลด์: ธง "สำคัญ" (แสดงบนการ์ด) และคำอธิบายฟิลด์ (คำใบ้) */
IF COL_LENGTH('dbo.custom_fields','is_important') IS NULL
    ALTER TABLE dbo.custom_fields ADD
        is_important BIT NOT NULL CONSTRAINT df_cf_important DEFAULT 0,
        description  NVARCHAR(500) NULL;
GO
/* หน้าบันทึกประชุม — หน้าเอกสารที่สร้างจากวันนัดประชุม (meetingPageRaw) ผูกกับวันที่ */
IF COL_LENGTH('dbo.pages','meeting_on') IS NULL
    ALTER TABLE dbo.pages ADD meeting_on DATE NULL;
GO

/* ---------- งาน: เตือนฉัน (เฉพาะตัวเอง) สถานะงานเงียบ ---------- */
IF OBJECT_ID(N'dbo.task_reminders','U') IS NULL
CREATE TABLE dbo.task_reminders (
    id        UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    task_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    user_id   UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),       -- ทุกคนเห็นเฉพาะของตัวเอง
    remind_at DATETIME2(0)     NOT NULL,
    done_at   DATETIME2(0)     NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_rem_due')
    CREATE INDEX ix_rem_due ON dbo.task_reminders(remind_at) INCLUDE (task_id, user_id) WHERE done_at IS NULL;  -- timer function สแกน
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_rem_open')
    CREATE UNIQUE INDEX ux_rem_open ON dbo.task_reminders(task_id, user_id) WHERE done_at IS NULL;               -- หนึ่งงานหนึ่งเตือนที่ค้างอยู่
GO
/* t.stale = { a, b, c } เวลาที่ทำแต่ละขั้นครั้งแรก เพื่อไม่เตือนซ้ำ
   a = เตือนผู้รับผิดชอบ (N วัน) · b = เพิ่มเจ้าของโปรเจกต์เป็นผู้ติดตาม (2N วัน) · c = ย้ายเซกชัน (30 วัน)
   ล้างแถวเมื่องานกลับมาเคลื่อนไหว */
IF OBJECT_ID(N'dbo.task_stale','U') IS NULL
CREATE TABLE dbo.task_stale (
    task_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY REFERENCES dbo.tasks(id) ON DELETE CASCADE,
    a_at DATETIME2(0) NULL, b_at DATETIME2(0) NULL, c_at DATETIME2(0) NULL
);
GO
/* ประวัติที่ระบบเขียนเอง (stories.sys = 1) ไม่นับเป็นความเคลื่อนไหวของงานเงียบ */
IF COL_LENGTH('dbo.stories','is_system') IS NULL
    ALTER TABLE dbo.stories ADD is_system BIT NOT NULL CONSTRAINT df_stories_sys DEFAULT 0;
GO

/* ---------- การแจ้งเตือน: ติดตามโปรเจกต์/พอร์ตโฟลิโอรายคน ----------
   user.prefs.projNotify[pid] = { status, messages, newTasks, milestones } · prefs.pfFollow[pfId] */
IF OBJECT_ID(N'dbo.user_project_notify','U') IS NULL
CREATE TABLE dbo.user_project_notify (
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    status      BIT NOT NULL DEFAULT 0, messages BIT NOT NULL DEFAULT 0,
    new_tasks   BIT NOT NULL DEFAULT 0, milestones BIT NOT NULL DEFAULT 0,
    CONSTRAINT pk_user_project_notify PRIMARY KEY (user_id, project_id)
);
GO
IF OBJECT_ID(N'dbo.user_portfolio_follow','U') IS NULL
CREATE TABLE dbo.user_portfolio_follow (
    user_id      UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    portfolio_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.portfolios(id) ON DELETE CASCADE,
    follows      BIT NOT NULL,   -- ไม่มีแถว = ค่าเริ่มต้น (เจ้าของติดตาม คนอื่นไม่)
    CONSTRAINT pk_user_portfolio_follow PRIMARY KEY (user_id, portfolio_id)
);
GO
/* ส่งแจ้งเตือนออกนอกระบบ (อีเมล / Teams) — ต้องขอสิทธิ์จาก IT (Mail.Send / ChatMessage.Send หรือ webhook ของช่อง)
   notification_deliveries เป็นคิว: timer function อ่านแถว status='queued' ส่ง แล้วบันทึกผล · ยังไม่เปิดใช้จนกว่า IT อนุมัติ */
IF OBJECT_ID(N'dbo.notification_deliveries','U') IS NULL
CREATE TABLE dbo.notification_deliveries (
    id              BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    notification_id BIGINT NOT NULL REFERENCES dbo.notifications(id) ON DELETE CASCADE,
    channel         VARCHAR(8)  NOT NULL,
    status          VARCHAR(8)  NOT NULL DEFAULT 'queued',
    attempts        INT         NOT NULL DEFAULT 0,
    last_error      NVARCHAR(400) NULL,
    sent_at         DATETIME2(0) NULL,
    CONSTRAINT ck_nd_channel CHECK (channel IN ('email','teams')),
    CONSTRAINT ck_nd_status  CHECK (status IN ('queued','sent','failed','skipped'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_nd_queue')
    CREATE INDEX ix_nd_queue ON dbo.notification_deliveries(status, id) WHERE status = 'queued';
/* เลื่อนเตือนที่ถึงเวลา (snooze_until <= now) กลับมาเป็นยังไม่อ่าน — ค้นเร็วด้วยดัชนีนี้ */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_notif_snooze')
    CREATE INDEX ix_notif_snooze ON dbo.notifications(snooze_until) INCLUDE (user_id) WHERE snooze_until IS NOT NULL;
GO

/* ---------- อัตโนมัติ: ชนิดทริกเกอร์ / การกระทำ / ประวัติ ----------
   ชนิดที่รองรับ (ตรงกับ AUTO_TRIGGERS / AUTO_ACTIONS ใน app/store.js)
   ทริกเกอร์: added moved completed assignee due start field comment tagadd tagdel subsdone movedout attachment
              follower unblocked approval approaching overdue manual scheduled
   การกระทำ: section complete assign due start field comment followers tag untag priority create addproj mtmove
             notify subtasks followup approvers
   ขีดจำกัด (AUTO_*) บังคับที่ API: 50 อัตโนมัติ/โปรเจกต์ · 5 เส้นทาง · 10 เงื่อนไข/เส้นทาง · 20 การกระทำ/เส้นทาง ·
             ลึกสุด 3 ชั้นเมื่อเปิด allow_chain · กดรันเอง ≤ 50 งานต่อครั้ง · ตามเวลา ≤ 50 งานต่อรอบ ·
             ประวัติการรัน 200 ล่าสุดต่อโปรเจกต์ · automation_fired เก็บ 60 วัน */
IF COL_LENGTH('dbo.automations','trigger_type') IS NULL
    ALTER TABLE dbo.automations ADD
        trigger_type AS CAST(JSON_VALUE(trigger_json, '$.type') AS VARCHAR(20)) PERSISTED;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_automation_json')
    ALTER TABLE dbo.automations ADD
        CONSTRAINT ck_automation_json CHECK (ISJSON(trigger_json) = 1 AND ISJSON(paths_json) = 1
                                             AND (else_json IS NULL OR ISJSON(else_json) = 1)),
        CONSTRAINT ck_automation_trigger CHECK (trigger_type IN
            ('added','moved','completed','assignee','due','start','field','comment','tagadd','tagdel','subsdone','movedout',
             'attachment','follower','unblocked','approval','approaching','overdue','manual','scheduled'));
GO
/* ประวัติการรัน: trace_json = รายการการกระทำที่ทำ (ac; ต่อท้าย ! = ไม่สำเร็จ) · is_dry = รันทดสอบ ไม่แก้ข้อมูลจริง */
IF COL_LENGTH('dbo.automation_runs','trace_json') IS NULL
    ALTER TABLE dbo.automation_runs ADD
        trace_json NVARCHAR(MAX) NULL,
        is_dry     BIT NOT NULL CONSTRAINT df_autoruns_dry DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_autoruns_task')
    CREATE INDEX ix_autoruns_task ON dbo.automation_runs(task_id, ran_at DESC) WHERE task_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_automations_timed')
    CREATE INDEX ix_automations_timed ON dbo.automations(trigger_type) INCLUDE (project_id) WHERE is_on = 1;   -- ตัวสแกนตามเวลา
GO

/* ---------- ดัชนีสำหรับคำค้นที่ใช้บ่อย ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_tasks_approval')   -- งานที่รออนุมัติของฉัน
    CREATE INDEX ix_tasks_approval ON dbo.tasks(approval, assignee_id) WHERE approval = 'pending' AND deleted_at IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_tasks_completed_by')   -- งานที่ฉันทำเสร็จ (รายงาน)
    CREATE INDEX ix_tasks_completed_by ON dbo.tasks(completed_by, completed_at DESC) WHERE completed_by IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_users_manager')   -- ลูกทีมของหัวหน้า
    CREATE INDEX ix_users_manager ON dbo.users(manager_id) WHERE manager_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_tm_user')   -- fn_VisibleProjects ผ่านทีม
    CREATE INDEX ix_tm_user ON dbo.team_members(user_id) INCLUDE (team_id, role);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_pt_team')
    CREATE INDEX ix_pt_team ON dbo.project_teams(team_id) INCLUDE (project_id, access);
GO

/* ---------- ล้างข้อมูลตัวอย่าง (ผู้ดูแลระบบ) ----------
   sampleSummary / clearSampleData ในแอป: ลบผู้ใช้ is_sample และโปรเจกต์ is_sample ที่ไม่มีข้อมูลจริงปนอยู่
   (ไม่มีงาน/ความเห็นที่คนจริงสร้าง มอบ หรือเขียน) โปรเจกต์ที่มีข้อมูลจริงปนจะถูกข้ามและแจ้งผู้ใช้
   @dry_run = 1 (ค่าเริ่มต้น) คืนเฉพาะสรุปจำนวน ไม่แก้อะไร */
CREATE OR ALTER PROCEDURE dbo.sp_ClearSampleData @actor_id UNIQUEIDENTIFIER, @dry_run BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE id = @actor_id AND org_role = 'admin' AND is_active = 1)
        THROW 50403, 'admin only', 1;

    DECLARE @real TABLE (id UNIQUEIDENTIFIER PRIMARY KEY);
    INSERT @real SELECT id FROM dbo.users WHERE is_sample = 0;

    DECLARE @del TABLE (id UNIQUEIDENTIFIER PRIMARY KEY);
    INSERT @del
    SELECT p.id FROM dbo.projects p
    WHERE p.is_sample = 1 AND p.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM dbo.task_projects tp
                      INNER JOIN dbo.tasks t ON t.id = tp.task_id OR t.parent_id = tp.task_id
                      WHERE tp.project_id = p.id
                        AND (t.created_by IN (SELECT id FROM @real) OR t.assignee_id IN (SELECT id FROM @real)
                             OR t.assigned_by IN (SELECT id FROM @real)))
      AND NOT EXISTS (SELECT 1 FROM dbo.task_projects tp
                      INNER JOIN dbo.stories s ON s.task_id = tp.task_id
                      WHERE tp.project_id = p.id AND s.actor_id IN (SELECT id FROM @real));

    SELECT (SELECT COUNT(*) FROM dbo.users WHERE is_sample = 1) AS sample_users,
           (SELECT COUNT(*) FROM @del) AS removable_projects,
           (SELECT COUNT(*) FROM dbo.projects WHERE is_sample = 1 AND deleted_at IS NULL) - (SELECT COUNT(*) FROM @del) AS skipped_projects;
    IF @dry_run = 1 RETURN;

    BEGIN TRAN;
        -- ลบแบบซ่อน (ถังขยะ 30 วัน) เพื่อกู้คืนได้ถ้าผิดพลาด
        UPDATE dbo.projects SET deleted_at = SYSUTCDATETIME(), deleted_by = @actor_id WHERE id IN (SELECT id FROM @del);
        UPDATE t SET deleted_at = SYSUTCDATETIME(), deleted_by = @actor_id
          FROM dbo.tasks t WHERE t.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM dbo.task_projects tp WHERE tp.task_id = t.id AND tp.project_id IN (SELECT id FROM @del));
        INSERT dbo.removed_users(id) SELECT id FROM dbo.users WHERE is_sample = 1
            AND id NOT IN (SELECT id FROM dbo.removed_users);
        UPDATE dbo.users SET is_active = 0 WHERE is_sample = 1;
        DELETE FROM dbo.project_members WHERE user_id IN (SELECT id FROM dbo.users WHERE is_sample = 1);
        DELETE FROM dbo.notifications   WHERE user_id IN (SELECT id FROM dbo.users WHERE is_sample = 1);
        INSERT dbo.audit_log(actor_id, action, target_type, detail_json)
        VALUES (@actor_id, 'sample.clear', 'org', N'{"note":"ล้างข้อมูลตัวอย่าง"}');
    COMMIT;
END;
GO

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
                                                    'calendar','dashboard','messages','files'))
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
    kind         VARCHAR(20)      NULL,     -- assigned | mention | comment | unblock | activity | message | approval | due | overdue | status | newtask
    dedupe_key   VARCHAR(120)     NULL,     -- กันเตือนกำหนดส่งซ้ำ เช่น due1:<task>:<date>
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

/* กฎอัตโนมัติแบบเดิม (projects[].rules) — ลากเข้าเซกชันไหนแล้วทำอะไร
   ชิ้นงาน 3a จะแทนด้วยตาราง automations ที่มีหลายเงื่อนไขหลายการกระทำ */
CREATE TABLE dbo.project_rules (
    id              UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_id      UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    when_section_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.sections(id),
    set_completed   BIT              NOT NULL DEFAULT 0,
    set_assignee_id UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    set_priority    VARCHAR(10)      NULL,
    add_tag         NVARCHAR(100)    NULL
);
GO

/* เทมเพลตงาน (db.taskTemplates) — payload เก็บชื่อ รายละเอียด ชนิด ความสำคัญ แท็ก และชื่องานย่อย */
CREATE TABLE dbo.task_templates (
    id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    name          NVARCHAR(300)    NOT NULL,
    payload_json  NVARCHAR(MAX)    NOT NULL,
    created_by    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at    DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME()
);
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
CREATE FUNCTION dbo.fn_VisibleProjects (@user_id UNIQUEIDENTIFIER)
RETURNS TABLE
AS
RETURN
(
    SELECT
        p.id AS project_id,
        CASE
            WHEN u.org_role = 'admin'      THEN 'admin'
            WHEN u.org_role = 'viewer'     THEN 'view'
            WHEN pm.access IS NOT NULL     THEN pm.access
            ELSE 'edit'
        END AS access,

        /* แก้โครงสร้างได้ไหม — เซกชัน ฟิลด์กำหนดเอง ชื่อโปรเจกต์ มุมมองที่บันทึกไว้

           ต้องแยกเป็นบิตต่างหาก เพราะ "แก้งานได้ แต่แก้โครงสร้างไม่ได้" ไม่มีขั้นของ
           ตัวเองบนบันได admin > edit > comment > view — บุคคลภายนอกตกอยู่ระหว่าง
           edit กับ comment พอดี ถ้าไม่มีบิตนี้ guest ที่ถูกเชิญด้วยระดับ edit จะเปลี่ยน
           ชื่อโปรเจกต์ได้ ทั้งที่บทบาทระดับองค์กรไม่ให้

           เป็นเรื่องของบทบาทองค์กรล้วน ๆ ไม่เกี่ยวกับสิทธิ์ในโปรเจกต์ ปลายทางที่แก้
           โครงสร้างจึงต้องผ่านสองด่าน คือ access >= edit และ can_structure = 1
           ตรงกับ ROLE_CAPS ใน app/store.js ที่ guest กับ viewer ไม่มี cap 'structure' */
        CASE WHEN u.org_role IN ('admin','member') THEN 1 ELSE 0 END AS can_structure
    FROM dbo.projects p
    CROSS JOIN (SELECT org_role FROM dbo.users WHERE id = @user_id AND is_active = 1) u
    LEFT JOIN dbo.project_members pm
           ON pm.project_id = p.id AND pm.user_id = @user_id
    WHERE p.deleted_at IS NULL
      AND (
            u.org_role = 'admin'
         OR pm.user_id IS NOT NULL
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
CREATE FUNCTION dbo.fn_VisibleTasks (@user_id UNIQUEIDENTIFIER)
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
/* คำขอเข้าโปรเจกต์ปิด — ตรงกับ project.accessRequests งานคำขอมอบให้เจ้าของโปรเจกต์ */
CREATE TABLE dbo.project_access_requests (
    project_id  UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id),
    task_id     UNIQUEIDENTIFIER NULL REFERENCES dbo.tasks(id),
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

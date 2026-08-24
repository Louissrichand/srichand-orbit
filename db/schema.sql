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
    org_role        VARCHAR(10)       NOT NULL DEFAULT 'member', -- admin | member | guest
    is_active       BIT               NOT NULL DEFAULT 1,
    last_seen_at    DATETIME2(0)      NULL,                      -- NULL = ยังไม่เคยล็อกอิน
    created_at      DATETIME2(0)      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_users_role CHECK (org_role IN ('admin','member','guest'))
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
   visibility = org      เห็นได้ทั้งองค์กร (ยกเว้น guest)
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
    deleted_at    DATETIME2(0)     NULL,
    created_by    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at    DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    row_ver       ROWVERSION,
    CONSTRAINT ck_proj_vis  CHECK (visibility IN ('org','private')),
    CONSTRAINT ck_proj_view CHECK (default_view IN ('list','board','calendar','timeline','gantt','dashboard'))
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
    approval      VARCHAR(10)      NULL,                      -- approved | changes | rejected
    assignee_id   UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    parent_id     UNIQUEIDENTIFIER NULL REFERENCES dbo.tasks(id),
    start_on      DATE             NULL,
    due_on        DATE             NULL,
    due_at        DATETIME2(0)     NULL,
    priority      VARCHAR(10)      NOT NULL DEFAULT 'none',
    completed_at  DATETIME2(0)     NULL,
    completed_by  UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    recur_json    NVARCHAR(500)    NULL,     -- กติกางานทำซ้ำ
    deleted_at    DATETIME2(0)     NULL,
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
    body        NVARCHAR(MAX)    NOT NULL,
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_story_type CHECK (story_type IN ('comment','log'))
);
CREATE INDEX ix_stories_task ON dbo.stories(task_id, created_at DESC);
GO

CREATE TABLE dbo.notifications (
    id           BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    user_id      UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    task_id      UNIQUEIDENTIFIER NULL REFERENCES dbo.tasks(id),
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
    state       VARCHAR(10)      NOT NULL,   -- on_track | at_risk | off_track
    body        NVARCHAR(MAX)    NULL,
    author_id   UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_status_state CHECK (state IN ('on_track','at_risk','off_track'))
);
CREATE INDEX ix_status_project ON dbo.project_status_updates(project_id, created_at DESC);
GO

/* มุมมองที่บันทึกไว้ ทั้งของส่วนตัวและของโปรเจกต์ */
CREATE TABLE dbo.saved_views (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    project_id  UNIQUEIDENTIFIER NULL REFERENCES dbo.projects(id) ON DELETE CASCADE,
    owner_id    UNIQUEIDENTIFIER NULL REFERENCES dbo.users(id),
    name        NVARCHAR(200)    NOT NULL,
    config_json NVARCHAR(MAX)    NOT NULL
);
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

/* =============================================================
   ด่านสิทธิ์ — ทุกคำสั่งอ่านต้องผ่านฟังก์ชันนี้
   =============================================================

   คืนรายการโปรเจกต์ที่ผู้ใช้คนนี้เห็นได้ พร้อมระดับสิทธิ์
   กติกา
     - ผู้ดูแลระบบเห็นทุกโปรเจกต์ ระดับ admin
     - เป็นสมาชิกโปรเจกต์ ได้ระดับตามที่กำหนดไว้
     - โปรเจกต์เปิด และไม่ใช่บุคคลภายนอก ได้ระดับ edit
     - นอกนั้นไม่เห็นเลย
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
            WHEN pm.access IS NOT NULL     THEN pm.access
            ELSE 'edit'
        END AS access
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

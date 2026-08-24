/* =============================================================
   Orbit — ตารางสำหรับการเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน
   รันหลัง schema.sql
   =============================================================

   ทำไมต้องมี
   ---------
   ทางหลักคือล็อกอินด้วยบัญชีบริษัทผ่าน Entra ซึ่งปลอดภัยกว่าเพราะ
   Microsoft ดูแลรหัสผ่านให้ และได้ MFA กับ Conditional Access มาด้วย
   ส่วนนี้เป็น "ทางสำรอง" สำหรับกรณีที่ Entra ใช้ไม่ได้

   ข้อจำกัดที่ยอมรับไว้ตั้งแต่ต้น
   ---------------------------
   1. คนที่เข้าด้วยรหัสผ่านจะ "ไม่ได้" MFA และนโยบายความปลอดภัยของบริษัท
   2. พนักงานลาออก ต้องปิดบัญชีใน Orbit ด้วย ไม่ใช่แค่ปิด M365
      (ระบบมีรายงานเตือนให้ผู้ดูแลตรวจทุกเดือน ดู vw_password_users_review)
   3. จึงตั้งใจให้ใช้เท่าที่จำเป็น ไม่ใช่ทางเข้าหลัก

   หลักที่ยึดในการออกแบบ
   -------------------
   - ไม่เก็บรหัสผ่าน เก็บเฉพาะค่าที่ผ่าน scrypt แล้ว พร้อม salt เฉพาะคน
   - โทเคนในอีเมลก็ไม่เก็บตัวจริง เก็บเฉพาะค่าที่ผ่าน hash
     ถ้าฐานข้อมูลหลุด คนที่ได้ไปก็ใช้โทเคนไม่ได้
   - ทุกโทเคนใช้ได้ครั้งเดียวและมีวันหมดอายุ
   - ห้ามสมัครเอง ผู้ดูแลต้องเชิญก่อนเสมอ
   ============================================================= */

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------------------------------------------------------------
   รหัสผ่าน — หนึ่งแถวต่อหนึ่งคน เฉพาะคนที่เปิดใช้ทางสำรองนี้
   คนที่ใช้ Entra อย่างเดียวจะไม่มีแถวที่นี่
   --------------------------------------------------------------- */
CREATE TABLE dbo.user_credentials (
    user_id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY
                       REFERENCES dbo.users(id) ON DELETE CASCADE,

    /* scrypt เป็นของที่มากับ Node อยู่แล้ว ไม่ต้องพึ่งไลบรารีภายนอก
       ที่ต้องคอมไพล์ ซึ่งเป็นปัญหาบน Azure Functions แบบ managed */
    pwd_hash           VARBINARY(64)  NOT NULL,
    pwd_salt           VARBINARY(32)  NOT NULL,
    kdf                VARCHAR(20)    NOT NULL DEFAULT 'scrypt',
    kdf_params         NVARCHAR(100)  NOT NULL DEFAULT 'N=32768,r=8,p=1',

    /* เวลาที่เปลี่ยนรหัสล่าสุด ใช้ตัดสินว่าคุกกี้ที่ออกก่อนหน้านี้หมดสภาพแล้ว
       ทำให้ "เปลี่ยนรหัสแล้วเตะทุกอุปกรณ์ออก" ได้โดยไม่ต้องมีตาราง session */
    pwd_changed_at     DATETIME2(0)   NOT NULL DEFAULT SYSUTCDATETIME(),

    email_verified_at  DATETIME2(0)   NULL,     -- NULL = ยังไม่ยืนยันอีเมล เข้าไม่ได้
    must_change        BIT            NOT NULL DEFAULT 0,

    failed_count       INT            NOT NULL DEFAULT 0,
    locked_until       DATETIME2(0)   NULL,

    created_at         DATETIME2(0)   NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* ---------------------------------------------------------------
   โทเคนที่ส่งไปในอีเมล
   purpose: verify   ยืนยันอีเมลตอนถูกเชิญครั้งแรก
            set      ตั้งรหัสผ่านครั้งแรก
            reset    ลืมรหัสผ่าน
            notify   แจ้งเตือนอย่างเดียว ไม่มีลิงก์ให้กด
   --------------------------------------------------------------- */
CREATE TABLE dbo.auth_tokens (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    user_id     UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    purpose     VARCHAR(10)      NOT NULL,

    /* เก็บเฉพาะ SHA-256 ของโทเคน ตัวจริงอยู่ในอีเมลเท่านั้น
       ผู้ดูแลฐานข้อมูลก็เอาไปใช้ไม่ได้ */
    token_hash  BINARY(32)       NOT NULL,

    expires_at  DATETIME2(0)     NOT NULL,
    used_at     DATETIME2(0)     NULL,
    created_ip  VARCHAR(45)      NULL,
    created_at  DATETIME2(0)     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_token_purpose CHECK (purpose IN ('verify','set','reset'))
);
CREATE UNIQUE INDEX ux_token_hash ON dbo.auth_tokens(token_hash);
CREATE INDEX ix_token_user ON dbo.auth_tokens(user_id, purpose, used_at);
GO

/* ---------------------------------------------------------------
   บันทึกการพยายามเข้าสู่ระบบ ใช้จำกัดอัตราและตรวจย้อนหลัง
   เก็บทั้งที่สำเร็จและไม่สำเร็จ
   --------------------------------------------------------------- */
CREATE TABLE dbo.auth_attempts (
    id          BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    email       NVARCHAR(320)  NOT NULL,
    ip          VARCHAR(45)    NULL,
    ok          BIT            NOT NULL,
    reason      VARCHAR(40)    NULL,
    attempted_at DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_attempt_email ON dbo.auth_attempts(email, attempted_at DESC);
CREATE INDEX ix_attempt_ip    ON dbo.auth_attempts(ip, attempted_at DESC);
GO

/* ---------------------------------------------------------------
   รายงานให้ผู้ดูแลตรวจทุกเดือน
   คนที่ใช้รหัสผ่านเข้าระบบ ต้องมีคนดูแลรายชื่อด้วยมือ
   เพราะปิดบัญชี M365 ไม่ได้ตัดคนกลุ่มนี้ออกโดยอัตโนมัติ
   --------------------------------------------------------------- */
CREATE VIEW dbo.vw_password_users_review
AS
SELECT
    u.id,
    u.email,
    u.display_name,
    u.org_role,
    u.is_active,
    u.last_seen_at,
    c.email_verified_at,
    c.pwd_changed_at,
    c.locked_until,
    DATEDIFF(DAY, ISNULL(u.last_seen_at, c.created_at), SYSUTCDATETIME()) AS days_idle
FROM dbo.user_credentials c
INNER JOIN dbo.users u ON u.id = c.user_id;
GO

/* ---------------------------------------------------------------
   ล้างโทเคนที่หมดอายุหรือใช้ไปแล้ว เรียกจากงานตามเวลาวันละครั้ง
   ไม่เก็บไว้ให้รก และลดของที่หลุดได้ถ้าฐานข้อมูลถูกเข้าถึง
   --------------------------------------------------------------- */
CREATE PROCEDURE dbo.sp_PurgeAuthTokens
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.auth_tokens
     WHERE used_at IS NOT NULL
        OR expires_at < DATEADD(DAY, -1, SYSUTCDATETIME());

    DELETE FROM dbo.auth_attempts
     WHERE attempted_at < DATEADD(DAY, -90, SYSUTCDATETIME());
END;
GO

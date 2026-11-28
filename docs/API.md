# Orbit API — ข้อกำหนดชั้นเชื่อมต่อ

ชั้นนี้คือ**จุดเดียว**ที่บังคับสิทธิ์จริง หน้าจอไม่มีสิทธิ์อะไรทั้งสิ้น
เป็นแค่ตัวแสดงผลของสิ่งที่ API ยอมให้

---

## กติกาที่ทุกปลายทางต้องทำตาม

1. **ระบุตัวตนจากส่วนหัวเท่านั้น** — Static Web Apps ส่ง `x-ms-client-principal`
   ที่ลงลายเซ็นมาให้ ห้ามรับ user id จาก body หรือ query ของผู้ใช้เด็ดขาด

2. **กรองด้วย `fn_VisibleProjects` ก่อนเสมอ** — ไม่มีคำสั่งอ่านใดที่ข้ามด่านนี้ได้
   ถ้าผู้ใช้เดา id ของโปรเจกต์ที่ไม่มีสิทธิ์ ต้องได้ `404` ไม่ใช่ `403`
   เพราะ `403` เป็นการยืนยันว่าของสิ่งนั้นมีอยู่จริง

3. **ตรวจสิทธิ์เขียนแยกจากสิทธิ์อ่าน** — เห็นได้ไม่ได้แปลว่าแก้ได้

4. **เขียนอะไรที่สำคัญ ต้องลง `audit_log`** — เปลี่ยนสิทธิ์ ล็อกโปรเจกต์
   เพิ่ม/ถอนสมาชิก ลบงาน ลบโปรเจกต์ ส่งออกข้อมูล

5. **ตรวจการแก้ชนกันด้วย `row_ver`** — ผู้ใช้ส่งค่าที่อ่านมากลับมาด้วย
   ถ้าไม่ตรงแปลว่ามีคนแก้ก่อน ตอบ `409` แล้วให้หน้าจอถามผู้ใช้

---

## ระดับสิทธิ์

### ระดับองค์กร (`users.org_role`)

| บทบาท | ความหมาย |
|---|---|
| `admin` | เห็นทุกโปรเจกต์ จัดการผู้ใช้ สิทธิ์ และตั้งค่าระบบ |
| `member` | พนักงานทั่วไป สร้างโปรเจกต์ได้ เห็นโปรเจกต์เปิดทั้งหมด |
| `guest` | บุคคลภายนอก เห็นเฉพาะโปรเจกต์ที่ถูกเชิญ สร้างโปรเจกต์ไม่ได้ ค้นสมุดรายชื่อไม่ได้ · เชิญเข้ากี่โปรเจกต์ก็ได้ แต่ต้องเชิญทีละโปรเจกต์เสมอ |
| `viewer` | ดูอย่างเดียวทั้งองค์กร เห็นเท่าที่ `member` เห็น แต่แก้ คอมเมนต์ และสร้างโปรเจกต์ไม่ได้เลย |

### ระดับโปรเจกต์ (`project_members.access`)

| ระดับ | อ่าน | คอมเมนต์ | แก้งาน | แก้โครงสร้าง | จัดการสมาชิก |
|---|:--:|:--:|:--:|:--:|:--:|
| `admin` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `edit` | ✓ | ✓ | ✓ | ✓ | — |
| `comment` | ✓ | ✓ | — | — | — |
| `view` | ✓ | — | — | — | — |

**โครงสร้าง** หมายถึง เซกชัน ฟิลด์กำหนดเอง ชื่อโปรเจกต์ มุมมองที่บันทึกไว้

**สองด่านต้องผ่านพร้อมกัน** — บทบาทองค์กรเป็น *เพดาน* สิทธิ์รายโปรเจกต์เป็นตัวจำกัดเพิ่ม
สิทธิ์ที่ได้จริงคือค่าที่ต่ำกว่าระหว่างสองอัน ไม่มีข้อยกเว้น

- `viewer` ที่ถูกเชิญเข้าโปรเจกต์ด้วยระดับ `edit` ยังได้แค่ `view`
- `guest` ที่ได้ระดับ `edit` แก้งานและคอมเมนต์ได้ แต่แก้โครงสร้างไม่ได้
  เพราะบทบาทระดับองค์กรไม่มีสิทธิ์นั้นตั้งแต่แรก
- ตรรกะชุดเดียวกันนี้อยู่ที่ `ROLE_CAPS` กับ `projectAccess()` ใน `app/store.js`
  และ `fn_VisibleProjects` ใน `db/schema.sql` — ทั้งสามที่ต้องตรงกันเสมอ
- **จัดการสมาชิก** (เพิ่ม/ถอด/เปลี่ยนระดับ เปลี่ยนเปิด–ปิดโปรเจกต์) = ผู้ดูแลระบบ หรือคนที่มีระดับ `admin` ในโปรเจกต์นั้น
  ยกเว้นโปรเจกต์ที่ล็อกรายชื่อ (`locked`) ซึ่งเหลือเฉพาะผู้ดูแลระบบ · สมาชิกระดับอื่นเพิ่มคน (รวมตัวเอง) ไม่ได้
  ในแอปคือ `canAddMembers()` ใช้ทั้งหน้าต่างสมาชิก ด่าน `NEEDS` และชั้นข้อมูล (`setProjectMember` / `removeProjectMember`)
- มอบงาน/สร้างงานให้คนที่ไม่ได้เป็นสมาชิกโปรเจกต์ปิด (คู่กรณีเห็นงานได้เสมอ) ต้องถามก่อนทุกทาง:
  งานที่มีอยู่แล้วใช้ `revealOutsiders()` งานที่ยังไม่เกิดหรือค่าที่จะมอบในอนาคต (ฟอร์ม อัตโนมัติ เทมเพลต นำเข้า CSV)
  ใช้ `outsidersOf(projectId, userIds)` แล้วทำตามที่เลือกด้วย `revealTo(…, projectId)`
  เอางานเดิมเข้าโปรเจกต์ปิด (เพิ่มเข้าโปรเจกต์ ทำให้เป็นสาธารณะ แก้หลายงาน) ใช้ `joinOutsiders(taskIds, projectId)`
  โอนงานใช้ `handoverOutsiders(from, to, withProj)` · อัตโนมัติไม่มีคนให้ถาม: คนจากตัวแปร (และคู่กรณีของงานใน `addproj`)
  ที่ไม่ได้เป็นสมาชิก = ข้ามการกระทำนั้น แล้วลงเหตุผลในประวัติการรัน การกระทำอื่นในกฎยังทำต่อ

ด่าน "แก้โครงสร้างได้ไหม" บังคับด้วย `can_structure` ที่ `fn_VisibleProjects` คืนมา
ไม่ใช่การไล่เช็ก `org_role` ซ้ำในแต่ละปลายทาง เพราะแบบหลังลืมที่เดียวก็รั่วทั้งระบบ

> **หมายเหตุ** — ปลายทางของเซกชัน ฟิลด์กำหนดเอง มุมมองที่บันทึกไว้ และเทมเพลต เป็น CRUD ปกติ ทุกอันต้องใช้ `E + ST` เพราะนับเป็นการแก้โครงสร้าง
> ปลายทางของ Sprint 1–4 อยู่ในหัวข้อ "ปลายทางเพิ่มเติมตาม SCHEMA 19" ด้านล่าง

---

## ปลายทาง

สัญลักษณ์ในคอลัมน์สิทธิ์
`ทุกคน` = ล็อกอินแล้วพอ ·
`R` = อ่านโปรเจกต์ได้ ·
`C` = comment ขึ้นไป ·
`E` = edit ขึ้นไป ·
`ST` = แก้โครงสร้างได้ คือ `can_structure = 1` จาก `fn_VisibleProjects` (`admin` หรือ `member` เท่านั้น) ·
`PA` = admin ของโปรเจกต์ ·
`OA` = admin ขององค์กร

### ตัวตน

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| GET | `/api/me` | ทุกคน | ข้อมูลตัวเอง บทบาท และการตั้งค่า สร้างแถวใน `users` ให้อัตโนมัติถ้าล็อกอินครั้งแรก |
| PATCH | `/api/me/settings` | ทุกคน | ภาษา ธีม ความกว้างคอลัมน์ |

### โปรเจกต์

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| GET | `/api/projects` | ทุกคน | คืนเฉพาะที่มองเห็น พร้อมระดับสิทธิ์ของตัวเองในแต่ละอัน |
| POST | `/api/projects` | `admin` หรือ `member` | ผู้สร้างได้เป็น `admin` ของโปรเจกต์อัตโนมัติ · `guest` และ `viewer` ได้ `403` |
| GET | `/api/projects/{id}` | R | รวมเซกชัน ฟิลด์ สมาชิก |
| PATCH | `/api/projects/{id}` | E + ST | ชื่อ สี ไอคอน มุมมองเริ่มต้น · `guest` ที่ได้ระดับ `edit` ต้องได้ `403` |
| PATCH | `/api/projects/{id}/visibility` | PA หรือ OA | เปิด/ปิดโปรเจกต์ · **ลง audit** |
| PATCH | `/api/projects/{id}/lock` | OA | ล็อก/ปลดล็อก · **ลง audit** |
| DELETE | `/api/projects/{id}` | PA หรือ OA | ลบแบบซ่อน · **ลง audit** |
| POST | `/api/projects/{id}/archive` | E + ST | เก็บเข้าคลัง |
| POST | `/api/projects/{id}/duplicate` | E + ST | คัดลอกเป็นเทมเพลต · ปลายทางนี้สร้างโปรเจกต์ใหม่ `ST` จึงกันไม่ให้ `guest` เลี่ยงข้อห้ามสร้างโปรเจกต์ |
| GET | `/api/projects/{id}/views` | R | แท็บมุมมองที่บันทึกไว้ (`saved_views`) เรียงตาม `position` · ตัวกรอง `@me` ไม่ตีความที่เซิร์ฟเวอร์ ส่งกลับตามที่เก็บ |
| POST · PATCH · DELETE | `/api/projects/{id}/views[/{viewId}]` | E + ST | สร้าง เปลี่ยนชื่อ บันทึกทับ ย้ายลำดับ ลบแท็บ · ไม่เกิน 50 แท็บต่อโปรเจกต์ (`409`) · ลง audit `project.view` |
| PUT | `/api/projects/{id}/default-tab` | E + ST | `{tab}` = มุมมองในตัว (`list`…) หรือรหัสแท็บ → `default_view` / `default_tab_id` |
| GET · PUT | `/api/projects/{id}/my-view` | R + ตัวเอง | มุมมองที่ทำงานอยู่ของตัวเอง (`user_project_views`) — ตัวกรอง เรียง จัดกลุ่ม คอลัมน์ การ์ด ปฏิทิน |
| POST | `/api/projects/{id}/sections/{sectionId}/duplicate` | E + ST (ทั้งต้นทางและปลายทาง) | `{to_project, name, keep:{assignee,dates,notes,subtasks,tags,followers,attachments,fields}}` · ค่าฟิลด์คัดลอกเฉพาะโปรเจกต์เดียวกัน · ลง audit `section.duplicate` |
| POST | `/api/projects/{id}/group-drop` | E (ทุกงาน) | `{task_ids[], sets:[{by,key}], before_id}` ลากงานลงคอลัมน์/แถวบนบอร์ด = ตั้งเซกชัน ผู้รับผิดชอบ ความสำคัญ หรือฟิลด์ตัวเลือก/คน ทีเดียวทั้งชุด |

### สมาชิกโปรเจกต์ — จุดที่ต้องระวังที่สุด

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| GET | `/api/projects/{id}/members` | R | — |
| POST | `/api/projects/{id}/members` | PA หรือ OA | **ถ้า `is_locked = 1` ต้องเป็น OA เท่านั้น** · ลง audit |
| PATCH | `/api/projects/{id}/members/{uid}` | PA หรือ OA | เปลี่ยนระดับสิทธิ์ · ลง audit |
| DELETE | `/api/projects/{id}/members/{uid}` | PA หรือ OA | **ห้ามถอด `admin` คนสุดท้ายออก** · ลง audit |

### งาน

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| GET | `/api/projects/{id}/tasks` | R | แบ่งหน้า กรอง เรียง จัดกลุ่ม |
| POST | `/api/tasks` | E ในโปรเจกต์ปลายทาง | สร้างพร้อมผูกเข้าโปรเจกต์ |
| GET | `/api/tasks/{id}` | R อย่างน้อยหนึ่งโปรเจกต์ | **รายชื่อโปรเจกต์ที่คืนมา ต้องกรองเหลือเฉพาะที่ผู้ใช้เห็นได้** |
| PATCH | `/api/tasks/{id}` | E | ส่ง `row_ver` มาด้วย ไม่ตรงตอบ `409` |
| DELETE | `/api/tasks/{id}` | E | ลบแบบซ่อน · ลง audit |
| POST | `/api/tasks/{id}/projects` | E ทั้งต้นทางและปลายทาง | ผูกงานเข้าอีกโปรเจกต์ |
| DELETE | `/api/tasks/{id}/projects/{pid}` | E | **ถ้าเหลือโปรเจกต์เดียว ต้องปฏิเสธ** ไม่งั้นงานจะลอย |
| POST | `/api/tasks/{id}/move` | E | ย้ายเซกชันหรือลำดับ คำนวณ position ฝั่งเซิร์ฟเวอร์ |
| POST | `/api/tasks/bulk` | E ทุกงานในชุด | แก้หลายงานพร้อมกัน ถ้ามีงานใดไม่ผ่านสิทธิ์ให้ปฏิเสธทั้งชุด · สร้างหลายงานจากการวางหลายบรรทัดก็ผ่านทางนี้ |
| POST | `/api/tasks/{id}/duplicate` | E | body เลือกได้ว่าเอาอะไรไปด้วย (`assignee notes subtasks attachments tags followers projects deps dates fields`) |
| POST | `/api/tasks/{id}/assign-copies` | E | `user_ids[]` — หนึ่งคนหนึ่งสำเนา งานเดิมที่ยังไม่มีผู้รับผิดชอบ ให้คนแรกรับตัวจริง |
| POST | `/api/tasks/{id}/merge-into/{masterId}` | E ทั้งสองงาน | ย้ายแท็ก ผู้ติดตาม ถูกใจไปที่งานหลัก · งานซ้ำถูกติ๊กเสร็จและเติม `[ซ้ำ]` · แจ้งคนในงานซ้ำ |
| POST | `/api/tasks/{id}/follow-up` | E | งานใหม่ "ติดตาม: ชื่อ" มอบให้คนเรียก โปรเจกต์/เซกชันเดียวกัน รายละเอียดมี `@[ชื่อ](t_…)` ชี้กลับ |
| POST | `/api/tasks/{id}/parent` | E ทั้งสองงาน | `parent_id` = แปลงเป็นงานย่อย (ถอดออกจาก `task_projects`) · `null` = ย้ายออกเป็นงานหลักในโปรเจกต์ของงานแม่ · **ปฏิเสธถ้าเกิดวง** |
| POST | `/api/tasks/{id}/approval` | assignee หรือ E ในโปรเจกต์ | `pending | approved | changes | rejected` · แจ้งคนสร้างงานและผู้ติดตาม (ชนิด `approval`) |
| POST | `/api/tasks/{id}/complete` | E | ถ้ามี `recur_json` สร้างรอบถัดไป (คัดลอกงานย่อย ค่าฟิลด์ ผู้ติดตาม แท็ก โปรเจกต์ ไม่รวมความเห็น/ไฟล์แนบ/ลำดับก่อนหลัง) แล้วย้ายกติกาทำซ้ำไปที่รอบใหม่ |

### ถังขยะ

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| GET | `/api/trash` | ทุกคน | ของที่ตัวเองลบ (`deleted_by = me`) · ผู้ดูแลเห็นทั้งหมด · เฉพาะ `deleted_at` ภายใน 30 วัน |
| POST | `/api/trash/{kind}/{id}/restore` | เป็นคนลบ หรือผู้ดูแล | `kind` = task / project / field / comment (Sprint 1B — ความเห็นกลับไปที่งานเดิม งานถูกลบอยู่ = 409 ให้กู้งานก่อน) · งานที่โปรเจกต์หรือเซกชันเดิมหายไปแล้วให้ตกไปเซกชันแรก/หลุดจากโปรเจกต์นั้น |
| DELETE | `/api/trash/{kind}/{id}` | เป็นคนลบ หรือผู้ดูแล | ลบถาวร · ลง audit สำหรับโปรเจกต์ |

งานตามเวลา (ทำทุกคืน): ลบถาวรของที่ `deleted_at` เกิน 30 วัน · สร้างแจ้งเตือน `due` (พรุ่งนี้/วันนี้) และ `overdue`
(ครั้งเดียวต่อวันครบกำหนด) ให้ผู้รับผิดชอบ และสรุปงานเลยกำหนดทุกวันจันทร์ — กันซ้ำด้วย `notifications.dedupe_key`
ตอนนี้ในโหมดไฟล์ทำฝั่งเบราว์เซอร์ตอนเปิดแอปและทุกชั่วโมง เฉพาะของคนที่เปิดแอปอยู่

**การแจ้งเตือน (Sprint 2B)** — ทางสร้างเดียว (`pushNotif`) ไม่แจ้งคนที่ทำเอง และรวมเข้ากับรายการเดิมเมื่อ
คนเดียวกันทำกับงานเดียวกันภายใน 10 นาทีและผู้รับยังไม่อ่าน (`parts_json`) — "ได้รับมอบหมาย" ตัด "สร้างงานนี้" ทิ้ง
ชนิด `timelog` (ลงเวลา/เวลาประมาณ) ปิดเป็นค่าเริ่มต้น · `story_id` ชี้ความเห็น · `status_ref` ชี้รายงานสถานะ

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| POST | `/api/notifications/snooze` | ตัวเอง | `{ ids, until }` ซ่อนจนถึงเวลา แล้วกลับมาเป็นยังไม่อ่าน (`woke_at`) · `until = null` = เลิกเลื่อน |
| POST | `/api/notifications/read` | ตัวเอง | `{ ids, read }` อ่าน/ยังไม่อ่านทีละกลุ่ม · ไม่ส่ง `ids` = อ่านทั้งหมด (ไม่แตะรายการที่เลื่อนอยู่) |
| GET | `/api/approvals/waiting` | ตัวเอง | งาน `approval` ที่ฉันเป็นผู้อนุมัติและยัง `pending` ครบกำหนดก่อนขึ้นก่อน |
| PUT | `/api/projects/{id}/follow` · `/api/portfolios/{id}/follow` | R | ติดตาม = อัปเดตสถานะ + งานใหม่ + หมุดหมายสำเร็จ (โปรเจกต์) / อัปเดตสถานะ (พอร์ตโฟลิโอ) · GET คืนรายชื่อผู้ติดตาม |

### ความเห็น ผู้ติดตาม ไฟล์แนบ

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| GET | `/api/tasks/{id}/stories` | R | ความเห็น + บันทึกกิจกรรม เรียงตามเวลา |
| POST | `/api/tasks/{id}/comments` | C | รองรับ @mention → สร้าง notification · ส่ง `parent_story_id` = ตอบในเธรด (ชั้นเดียว แจ้งเฉพาะคนในเธรด + คนที่ถูก @) · `@[ชื่อ](t_…)` ที่อ้างถึงงานอื่นลงบันทึก "อ้างถึงงานนี้" ที่งานปลายทาง |
| PATCH | `/api/stories/{id}` | C + เป็นเจ้าของ | แก้ข้อความความเห็นของตัวเอง → ตั้ง `edited_at` |
| DELETE | `/api/stories/{id}` | C + เป็นเจ้าของ | ถ้ามีคนตอบแล้ว ให้ตั้ง `deleted_at` และล้าง `body` แทนการลบ แถวจะหายเองเมื่อคำตอบสุดท้ายถูกลบ |
| POST | `/api/stories/{id}/pin` · `DELETE …/pin` | C | ปักหมุดความเห็นหลัก (ไม่ใช่คำตอบ) ไว้บนสุดของงาน |
| POST · DELETE | `/api/stories/{id}/reactions/{emoji}` | C | อีโมจิตอบรับ ชุดที่ยอมรับตรงกับ `REACTIONS` ใน store.js |
| POST | `/api/tasks/{id}/followers` | C | — |
| POST | `/api/tasks/{id}/attachments` | E | ขอ SAS URL อัปโหลดตรงเข้า Blob · จำกัดขนาดต่อไฟล์ |
| PUT | `/api/tasks/{id}/cover` | E | `{attachment_id}` ตั้งรูปปกของการ์ด (`null` = เอาออก) · ต้องเป็นไฟล์แนบรูปของงานนั้น → `tasks.cover_attachment_id` |
| GET | `/api/attachments/{id}` | R | คืน SAS อ่านอายุสั้น · **ปฏิเสธถ้า `scan_status <> 'clean'`** |

### ข้ามโปรเจกต์

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| GET | `/api/home` | ทุกคน | ข้อมูลหน้าแรกในคำขอเดียว — งานของฉัน โปรเจกต์ งานที่ฉันมอบหมาย กิจกรรม ตัวเลขสรุป |
| GET | `/api/my-tasks` | ทุกคน | งานที่มอบหมายให้ตัวเอง พร้อมเซกชันส่วนตัว (`my_task_sections`) และที่จัดไว้ (`my_task_placements`) · แถวที่ `placed_at < tasks.assigned_at` นับเป็น "เพิ่งได้รับมอบหมาย" · ส่ง `is_new` = มอบหมายโดยคนอื่นและ `seen_at < assigned_at` |
| POST | `/api/my-tasks` | W | สร้างงานส่วนตัว (ไม่ผูกโปรเจกต์) มอบให้ตัวเอง วางในเซกชันที่ระบุ |
| PUT | `/api/my-tasks/sections` · `PATCH/DELETE …/{id}` | ตัวเอง | เพิ่ม เปลี่ยนชื่อ เรียง ลบเซกชัน · ลบ `recent` ไม่ได้ · ลบแล้วงานกลับไป `recent` |
| POST | `/api/my-tasks/{taskId}/place` | ตัวเอง + เป็นผู้รับผิดชอบ | `{section_id, before_id}` ย้ายเข้าเซกชัน · ไม่ลงประวัติงาน (เรื่องส่วนตัว) |
| POST | `/api/my-tasks/{taskId}/seen` | ตัวเอง | เปิดงานแล้ว จุดสีฟ้าหาย |
| GET · PUT | `/api/me/personal` | ตัวเอง | มุมมองงานของฉัน วิดเจ็ตหน้าแรก การเรียง/ความหนาแน่นของกล่องข้อความ สมุดโน้ต (`user_personal`) |
| POST | `/api/tasks/{id}/make-public` | E ในโปรเจกต์ปลายทาง + คู่กรณีของงาน | = ผูกเข้าโปรเจกต์/เซกชันที่เลือก งานส่วนตัวจึงเห็นได้ทุกคนในโปรเจกต์ |
| GET | `/api/assigned-by-me` | ทุกคน | งานที่ตัวเองสร้างและมอบให้คนอื่น |
| GET | `/api/activity` | ทุกคน | ความเคลื่อนไหวล่าสุด **กรองด้วย `fn_VisibleTasks` ก่อนตัดจำนวน** ไม่ใช่หลัง |
| GET | `/api/inbox` | ทุกคน | แจ้งเตือนของตัวเอง · `tab=activity|bookmarks|archive` · กรอง `from`, `project`, `mention`, `to_me`, `by_me`, `unread` · `sort=new|relevance` · **ตัดรายการของงานที่ผู้เรียกมองไม่เห็นแล้วออก** (งานส่วนตัวของคนอื่น) |
| PATCH | `/api/inbox/{id}` | เจ้าของรายการ | `read`, `bookmarked`, `archived` |
| POST | `/api/inbox/archive` | ตัวเอง | `ids[]` เก็บเฉพาะที่เห็นอยู่ตามตัวกรอง |
| PUT | `/api/me/dnd` | ตัวเอง | ห้ามรบกวน `{until, from, to}` — ยังสร้างแจ้งเตือนตามปกติ แค่ไม่เด้ง/ไม่ขึ้นตัวเลข |
| PUT | `/api/projects/{id}/my-notify` | R ในโปรเจกต์ | `{status, messages, newTasks}` เฉพาะตัวเอง · สมาชิกได้สถานะ/ประกาศเป็นค่าเริ่มต้น งานใหม่ปิดไว้ |
| GET | `/api/search?q=` | ทุกคน | **ค้นเฉพาะในโปรเจกต์ที่มองเห็น** — จุดรั่วที่พบบ่อยที่สุด · `q` รองรับ `"วลี"` `a \| b` (หรือ `OR`) `-คำ` `คำ*` `( )` และรหัสงาน `REQ-12` · `conds` = JSON เงื่อนไขชุดเดียวกับตัวกรองของมุมมอง บวก `project psection assignedBy followers attachment blocking subtask` · งานส่วนตัวของคนอื่นไม่คืน (2c) |
| GET · POST · PUT · DELETE | `/api/me/saved-searches` | ตัวเอง | การค้นหาที่บันทึกไว้ (`saved_searches`) สูงสุด 50 |
| GET | `/api/projects/{id}/automations` | R | อัตโนมัติของโปรเจกต์ (`automations`) — ทริกเกอร์ เส้นทาง การกระทำ (3a) |
| POST · PUT · DELETE | `/api/projects/{id}/automations[/{aid}]` | E + ST | สร้าง แก้ เปิด/ปิด ทำสำเนา (สำเนาเริ่มแบบปิด) ลบ · สูงสุด 50 ต่อโปรเจกต์ 5 เส้นทาง 20 การกระทำ |
| POST | `/api/projects/{id}/automations/{aid}/run` | R + เห็นงาน | `ids[]` ≤ 50 รันอัตโนมัติแบบ "กดรันเอง" · การกระทำทำในนามอัตโนมัติ (ผู้ดูอย่างเดียวกดได้) |
| GET | `/api/projects/{id}/automation-runs` | R | ประวัติการรัน 200 ครั้งล่าสุด (`automation_runs`) |
| — | (งานเบื้องหลัง) | ระบบ | ทริกเกอร์ตามเวลา (ใกล้ครบกำหนด เลยกำหนด ตามกำหนดเวลา) ตอนนี้รันในเบราว์เซอร์ที่เปิดอยู่ · ตอนมีเซิร์ฟเวอร์ให้ย้ายไปตัวตั้งเวลา และใช้ `automation_fired` (UNIQUE) กันรันซ้ำ · ทริกเกอร์ตามเหตุการณ์ต้องรันในธุรกรรมเดียวกับการแก้ที่ปลุกมัน (ย้อนกลับได้ทั้งชุด) |
| GET · POST · PUT · DELETE | `/api/me/automations` | ตัวเอง | อัตโนมัติของงานของฉัน (ใกล้ครบกำหนด / เลยกำหนด / ทำเสร็จ → ย้ายเซกชันของตัวเอง) |
| GET · POST · PUT · DELETE | `/api/projects/{id}/forms[/{fid}]` | E + ST (อ่าน: R) | ฟอร์มของโปรเจกต์ (`forms`) สูงสุด 20 · คำถาม แตกแขนง 5 ชั้น ผูกฟิลด์ ตั้งค่า (3b) |
| GET | `/api/forms/{fid}` | ล็อกอินแล้ว | โครงฟอร์มสำหรับหน้า `#/form/{fid}` (ไม่ต้องเป็นสมาชิกโปรเจกต์) |
| POST | `/api/forms/{fid}/submit` | ล็อกอินแล้ว | `{ answers: { qid: ค่า } }` → สร้างงานหนึ่งชิ้นในธุรกรรมเดียว (ค่าฟิลด์ ไฟล์แนบ ≤ 2 MB ผู้ติดตาม) แล้วปลุกอัตโนมัติ `added` + `form` · ฟอร์มสาธารณะไม่ล็อกอิน = เฟส 5 |
| GET · POST · PUT · DELETE | `/api/projects/{id}/task-types[/{tid}]` | E + ST (อ่าน: R) | ชนิดงานกำหนดเองและสถานะ (`task_types`, `task_type_statuses`) · ลบชนิด = งานกลับเป็นงานทั่วไป · `PUT /api/projects/{id}` `default_type` |
| PUT | `/api/tasks/{id}/type` · `/api/tasks/{id}/status` | E | ตั้งชนิด/สถานะ — สถานะ `counts_complete` ติ๊กเสร็จ (และกลับกัน) ปลุกอัตโนมัติ `cstatus` |
| GET · POST · PUT · DELETE | `/api/project-templates[/{id}]` | ST (อ่าน/ใช้: org หรือ access ระบุตัว) | เทมเพลตโปรเจกต์ (`project_templates`, `project_template_access` edit/use) · เทมเพลตตั้งต้นอยู่ในโค้ด |
| POST | `/api/project-templates/{id}/use` | ST + use | `{ name, start, roles: { r0: userId }, skipWeekends }` → โปรเจกต์ใหม่ (รหัสคอลัมน์ ฟิลด์ ชนิด สถานะ ฟอร์ม เทมเพลตงาน ในอัตโนมัติชี้ของใหม่) |
| GET · POST · PUT · DELETE | `/api/task-templates` · `/api/projects/{id}/task-templates` | ST (ใช้: E) | เทมเพลตงานทั้งองค์กร / รายโปรเจกต์ · `POST …/{tid}/apply { sectionId }` |
| POST | `/api/projects/{id}/status-updates` | E + ST | `{ state, title, blocks[], highlights[], period }` ไฮไลต์คำนวณที่เซิร์ฟเวอร์ตอนโพสต์ (ภาพนิ่ง) · ปิดงานเตือนของสัปดาห์ · `GET/POST/DELETE /api/status-templates` |
| POST · DELETE | `/api/status-updates/{id}/replies[/{rid}]` | C ในโปรเจกต์ (พอร์ตโฟลิโอ: C) | ถาม/ตอบใต้รายงานสถานะ `{ body }` (@ชื่อ ได้) · แจ้งคนเขียนรายงาน เจ้าของ คนที่เคยตอบ (kind `status`) และคนที่ถูก @ (kind `mention`) · ลบได้เฉพาะของตัวเองหรือผู้ดูแล · รายงานใหม่เก็บ `snap` (งานทั้งหมด/เสร็จ/เลยกำหนด) และ `chg` (สถานะก่อนหน้า ส่วนต่าง) ตอนโพสต์ (Sprint 2C) |
| GET | `/api/exec-overview` | R | การ์ดภาพรวมผู้บริหาร — โปรเจกต์หลุดแผน/เสี่ยง ไม่ได้รายงาน ≥ 7 วันแต่มีงานเลยกำหนด จำนวนงานเลยกำหนด/ครบใน 7 วัน (เงื่อนไขเดียวกับค้นหาขั้นสูง) คนที่งานล้นหรือค้าง — นับเฉพาะที่ผู้เรียกเห็นได้ (Sprint 2C) |
| — | (งานเบื้องหลัง) | ระบบ | เตือนรายงานสถานะวันศุกร์ (`projects.status_remind`) ตอนนี้สร้างตอนมีคนเปิดแอปวันศุกร์ กันซ้ำด้วย `remind_key` · ตอนมีเซิร์ฟเวอร์ให้ย้ายไปตัวตั้งเวลา |
| GET | `/api/tags/{name}/tasks` | ทุกคน | งานที่มีแท็กนี้และผู้เรียกมองเห็น |
| PUT · DELETE | `/api/tags/{name}` | ST | เปลี่ยนชื่อ (ชื่อซ้ำ = รวมแท็ก) / เอาออกจากทุกงาน · ลง audit `tag.rename` `tag.delete` |
| GET · POST · PUT · DELETE | `/api/projects/{id}/resources[/{rid}]` | E + ST (อ่าน: R) | ทรัพยากรสำคัญบนภาพรวม (`project_resources`) ลิงก์หรือไฟล์ ≤ 2 MB สูงสุด 30 · `PUT …/{rid}/position` (3c) |
| PUT | `/api/projects/{id}/brief` | E + ST | `{ md }` บรีฟโปรเจกต์ (มาร์กดาวน์ย่อแบบบล็อก) แจ้งคนที่ถูก @อ้างถึงใหม่ (3c) |
| GET · POST · PUT · DELETE | `/api/projects/{id}/dashboard[/{wid}]` | E + ST (อ่าน: R) | วิดเจ็ตแดชบอร์ด (`dashboard_widgets`) ≤ 20 · ข้อมูลกราฟคำนวณจากงานที่ผู้เรียกมองเห็น (`chartData`) · `DELETE /dashboard` = คืนค่าตั้งต้น (3c) |
| POST · DELETE | `/api/projects/{id}/messages/{mid}/replies[/{rid}]` | C (ลบ: เจ้าของหรือ manage) | `{ body, attachments[] }` คำตอบใต้ประกาศ แจ้งผู้เข้าร่วม + คนที่ถูก @อ้างถึง (3c) |
| PUT · DELETE | `/api/projects/{id}/messages/{mid}/follow` | C | เข้าร่วม/ออกจากประกาศ (`message_followers`) (3c) |
| POST | `/api/tasks/chain` | E ทุกงาน | `{ ids[] }` ต่อลำดับก่อนหลัง FS เป็นสายเดียวเรียงตามวันเริ่ม ข้ามคู่ที่ทำให้รอวน ธุรกรรมเดียว (3c) |
| POST | `/api/tasks/{id}/dates/preview` · `/api/tasks/{id}/dates` | E | ดูงานที่จะขยับตามโหมด `dep_shift` ของโปรเจกต์ก่อน แล้ว `{ start, due, shift: bool }` ทำในธุรกรรมเดียว (3c) |
| GET | `/api/projects/{id}/critical-path` | R | สายลำดับก่อนหลังที่กินเวลาตามปฏิทินยาวที่สุด `{ ids[], edges[], days }` (3c) |
| GET · POST · PUT · DELETE | `/api/projects/{id}/pages[/{pgid}]` · `/api/pages[/{pgid}]` | หน้าของโปรเจกต์: E (อ่าน R, ความเห็น C) · หน้าเดี่ยว: เจ้าของ (ส่วนตัว) หรือ W | หน้าเอกสาร (`pages`) เนื้อหาเป็นมาร์กดาวน์ย่อแบบบล็อก · `PUT` สร้างเวอร์ชันเมื่อห่าง > 10 นาทีหรือคนแก้เปลี่ยน (เก็บ 20) · หน้าส่วนตัวของคนอื่นไม่เคยออกจากเซิร์ฟเวอร์ (3c) |
| GET · POST | `/api/pages/{pgid}/versions[/{vid}/restore]` | อ่าน: เห็นหน้า · กู้: แก้หน้าได้ | ประวัติเวอร์ชัน + กู้คืน (เวอร์ชันปัจจุบันถูกเก็บก่อน) (3c) |
| POST · DELETE | `/api/pages/{pgid}/images[/{iid}]` | แก้หน้าได้ | รูป ≤ 500 KB ต่อรูป ≤ 20 รูปต่อหน้า อ้างในเนื้อหาด้วย `img:<id>` (3c) |
| POST · PUT · DELETE | `/api/pages/{pgid}/comments[/{cid}]` | C ของหน้า (ลบ: เจ้าของความเห็นหรือแก้หน้าได้) | `{ quote, body }` · `{ reply_to }` · `PUT { resolved }` แจ้งเจ้าของหน้า คนในเธรด คนที่ถูก @อ้างถึง (3c) |
| POST | `/api/pages/{pgid}/tasks` | W (หน้าของโปรเจกต์: E) | `{ text }` ข้อความที่เลือก → งานใหม่ลิงก์กลับหน้า (หน้าเดี่ยว = งานส่วนตัว) (3c) |
| GET · POST · DELETE | `/api/tasks/{id}/time[/{eid}]` | อ่าน: เห็นงาน · บันทึก: C · ลบ: เจ้าของรายการหรือ E | รายการเวลา `{ date, minutes, note, billable, category }` (`time_entries`) · `PUT /api/tasks/{id}` `estimate_minutes` (E) (3c) |
| PUT · DELETE | `/api/me/timer` | ตัวเอง | `{ taskId }` เริ่ม (หยุดตัวเดิมแล้วบันทึกให้) · `DELETE ?log=1` หยุดแล้วบันทึก / ทิ้ง (`running_timers`) (3c) |
| GET | `/api/projects/{id}/time.csv` | R | รายการเวลาทั้งโปรเจกต์รวมงานย่อย (date, user, task, minutes, hours, note, billable, category) (3c) |
| POST · DELETE | `/api/tasks/{id}/attachments/{aid}/pins[/{n}]` | E | `{ x, y, text }` หมุดบนรูป → งานย่อยในธุรกรรมเดียว (`attachment_pins`) (3c) |
| — | (ฟิลด์สูตร) | — | `custom_fields.formula_expr/out` คำนวณตอนอ่านเสมอ (ไม่มีค่าใน `field_values`) เซิร์ฟเวอร์ต้องใช้ตัวประเมินชุดเดียวกับ `store.js` (`compileFormula` / `evalFormula`) ตอนกรอง/เรียง (3c) |
| GET · POST · PUT · DELETE | `/api/field-library` | ST (อ่าน: ทุกคน) | คลังฟิลด์ขององค์กร · แก้แล้ว `custom_fields` ที่อ้าง `library_field_id` เปลี่ยนตาม · ลง audit `field.lib-*` |
| GET | `/api/tasks/by-code/{code}` | ทุกคน | หางานจากรหัส `REQ-12` (ใช้กับ @อ้างถึง) — **ต้องกรองด้วย `fn_VisibleTasks`** |
| POST | `/api/projects/{id}/import` | E + ST | CSV + `map[]` ต่อคอลัมน์ (`name notes section assignee assigneeEmail collaborators start due priority type tags blockedBy dependents parent completed field:<id> new:<type> ignore`) · ลง audit |
| GET | `/api/projects/{id}/export.json` · `/export.ics` | R | โปรเจกต์เดียว (งาน งานย่อย ค่าฟิลด์ ความเห็น) / ปฏิทินกิจกรรมทั้งวันของงานที่ยังไม่เสร็จ · ลง audit `project.export` |
| GET | `/api/me/tasks.ics` | ตัวเอง | ปฏิทินงานของฉันที่มีวันและยังไม่เสร็จ |
| PUT | `/api/projects/{id}/roles` | E + ST | `{userId: "บทบาท"}` ข้อความอิสระ ไม่ใช่สิทธิ์ |
| POST | `/api/projects/{id}/access-requests` | ทุกคนที่ยังเข้าไม่ได้ | `{note}` แจ้งเจ้าของทางกล่องข้อความ ชนิด `access` (ไม่มีเจ้าของ = ผู้ดูแลโปรเจกต์ → ผู้ดูแลระบบ) ไม่สร้างงานแล้ว (Sprint 1B) · คำขอละหนึ่งต่อคน · ลง audit |
| POST | `/api/projects/{id}/access-requests/{userId}` | PA / เจ้าของ / OA | `{grant, access}` เพิ่มสมาชิก (คำขอแบบเก่าที่เป็นงาน ปิดงานคำขอด้วย) แจ้งผลคนขอ |
| POST | `/api/tasks/{id}/convert-to-project` | E + ST | ชื่อ → โปรเจกต์ ผู้รับผิดชอบ → เจ้าของ ผู้ติดตาม → สมาชิก งานย่อย → งาน · โปรเจกต์ปิดถ้างานต้นทางเป็นงานส่วนตัวหรืออยู่ในโปรเจกต์ปิด |
| GET | `/api/calendar` | ทุกคน | รวมทุกโปรเจกต์ที่มองเห็น |
| GET · POST · PATCH · DELETE | `/api/teams[/{id}]` | อ่าน: ทุกคน (ทีม `private` เฉพาะสมาชิก/OA) · สร้าง: ST · แก้/ลบ: ผู้ดูแลทีม/OA | `{name, description, icon, color, privacy}` · ลง audit `team.*` (4a) |
| POST · PATCH · DELETE | `/api/teams/{id}/members[/{userId}]` | ผู้ดูแลทีม/OA (ออกเอง: ตัวเอง) | `{role: admin|member}` · ห้ามเหลือศูนย์ผู้ดูแลทีม `409` (4a) |
| POST | `/api/teams/{id}/join` | ทุกคนยกเว้น guest | `public` → เป็นสมาชิกทันที · `request` → สร้างคำขอ + แจ้งผู้ดูแลทีม · `private` → `404` (4a) |
| POST | `/api/teams/{id}/requests/{userId}` | ผู้ดูแลทีม/OA | `{approve: bool}` (4a) |
| PUT · DELETE | `/api/teams/{id}/pins/{itemId}` · `/resources[/{rid}]` | สมาชิกทีม | ปักหมุดโปรเจกต์/พอร์ตโฟลิโอ ≤ 20 · ลิงก์ ≤ 30 (4a) |
| PUT · DELETE | `/api/projects/{id}/teams/{teamId}` | E + ST | `{access}` แชร์โปรเจกต์ให้ทีม — สิทธิ์บวกเพิ่ม (MAX) ภายใต้เพดานบทบาทองค์กร · `fn_VisibleProjects` ต้องรวมเส้นทางนี้ (4a) |
| GET | `/api/teams/{id}/tasks` · `/calendar` | สมาชิกทีม/ทีมที่มองเห็น | งานในโปรเจกต์ที่แชร์ให้ทีมและผู้ขอเห็นได้ (4a) |
| PUT · DELETE | `/api/portfolios/{id}/children/{childId}` | ST | พอร์ตโฟลิโอย่อย · ตรวจวนด้วย recursive CTE → `409` (4a) |
| GET · POST · PATCH · DELETE | `/api/portfolios/{id}/fields[/{fid}]` · `PUT …/values/{itemId}` | ST (อ่าน: ทุกคน) | ฟิลด์ number/text/select/date/person/rollup (`rollup_src` + `rollup_fn` คำนวณตอนอ่านจากงานที่ผู้ขอเห็นได้เท่านั้น) (4a) |
| GET · POST · PATCH · DELETE | `/api/portfolios/{id}/views[/{vid}]` | ST (อ่าน: ทุกคน) | แท็บมุมมอง `{name, view: {filters, sorts, group, hide}}` · `default_view_id` (4a) |
| GET · POST · PATCH · DELETE | `/api/goals[/{id}]` | อ่าน: ตาม privacy (private = เจ้าของ/สมาชิก/สมาชิกทีม/OA) · สร้าง: W (เป้าหมายทีมต้องเป็นสมาชิกทีม) · แก้: เจ้าของ/สมาชิก/ผู้ดูแลทีม/OA · ลบ: เจ้าของ/OA | ห้ามวนของ `parent_id` → `409` · ลบแล้วลูกขึ้นไปอยู่ใต้แม่ · ลง audit `goal.*` (4a) |
| PUT | `/api/goals/{id}/metric` · `/value` | แก้เป้าหมายได้ | วิธีวัด (manual/subgoals+weights รวม 100/projects+projBy/tasks) · ค่าปัจจุบัน (manual เท่านั้น) · เขียนจุด `goal_history` ของวันนั้น (4a) |
| POST | `/api/goals/{id}/updates` · `/close` · `/reopen` | แก้เป้าหมายได้ | สถานะ on_track/at_risk/off_track · ผล achieved/partial/missed/dropped · แจ้งเจ้าของ+สมาชิก (4a) |
| POST · DELETE | `/api/goals/{id}/comments[/{cid}]` · `PUT/DELETE …/related/{itemId}` | C / แก้เป้าหมายได้ | ความเห็น (@ แจ้งเตือน) · งานที่เกี่ยวข้อง project/portfolio/task (4a) |
| GET | `/api/goals.csv` · `/api/strategy-map` | ทุกคน (กรองตามสิทธิ์) | ส่งออก CSV · ต้นไม้ พันธกิจ → เป้าหมาย → เป้าหมายย่อย → โปรเจกต์ (4a) |
| PUT | `/api/settings/goals` | OA | `{fyStart, mission}` · `goal_fields` (4a) |
| — | (เตือนเป้าหมาย) | — | ตอนนี้สร้างตอนเปิดแอป สัปดาห์ละครั้งต่อเป้าหมายที่ไม่ได้อัปเดตเกิน 7 วัน (`notification.dedupe = goal:<id>:<วันจันทร์>`) — เฟส 5 ย้ายไปงานตามเวลา (4a) |
| POST | `/api/portfolios/{id}/status` · `/messages` | ST / C | อัปเดตสถานะพร้อมข้อความ · ประกาศของพอร์ตโฟลิโอ (ตารางประกาศเดียวกับโปรเจกต์) (4a) |
| GET | `/api/workload?scope=project:{id}\|portfolio:{id}\|all[&team=]&from&to&measure=count\|effort&src=estimate\|field:{fid}&unit=h\|pt\|pct` | ทุกคน (งานที่ผู้ขอเห็นได้) | แถวต่อคน ช่องต่อวัน → รวมตามซูม · แรงงานกระจายบนวันทำงานของโปรเจกต์ (`all` = จ–ศ) · ความจุ × วันทำงานที่ไม่ได้ลา (4b) |
| GET · POST · DELETE | `/api/users/{id}/away[/{rangeId}]` | ตัวเอง / OA | `{from, to, note}` หลายช่วง · การมอบหมายแบบวนรอบข้ามคนที่ไม่อยู่วันนั้น (4b) |
| PUT | `/api/users/{id}/capacity` | ตัวเอง / OA | `{count, h, pt, pct}` ต่อวันทำงาน · ลง audit `user.capacity` (4b) |
| PATCH | `/api/tasks/{id}/move` | W ของงาน | `{shiftDays, assigneeId}` ลากในภาระงาน — คงความยาวช่วง หนึ่งธุรกรรม (4b) |
| GET · PUT | `/api/timesheets/{userId}/{week}` · `…/cells/{taskId}/{date}` | ตัวเอง (อ่าน: + ผู้ตรวจ) | ตารางรายสัปดาห์ · ตั้งเวลารวมของช่อง (ปรับ/เพิ่ม/ลบรายการ) · `423` ถ้าสัปดาห์ส่งหรืออนุมัติแล้ว (4b) |
| PATCH | `/api/time-entries/{id}` | เจ้าของ / W ของงาน | `{billable, category, note, minutes, date}` · `423` ถ้าล็อก (4b) |
| POST | `/api/timesheets/{week}/submit` · `/recall` | ตัวเอง | ส่งตรวจ → แจ้งผู้ตรวจ (OA + `timesheet_reviewers` + PA ของโปรเจกต์ที่ลงเวลา) · ดึงกลับได้ก่อนตรวจ (4b) |
| POST | `/api/timesheets/{id}/approve` · `/reject` · `/reopen` | ผู้ตรวจ (ไม่ใช่เจ้าของ) · reopen: OA | `{note}` · อนุมัติแล้วล็อก · ลง audit `time.*` (4b) |
| GET | `/api/time-entries.csv?from&to[&userId]` | ตัวเอง / ผู้ตรวจ / OA | CSV พร้อม billable, category, สถานะไทม์ชีต (4b) |
| PUT | `/api/settings/timesheets` | OA | `{categories[], reviewers[]}` (4b) |
| GET · POST · PATCH · DELETE | `/api/reports[/{id}]` | อ่าน: เจ้าของ/คนที่แชร์/สมาชิกทีมที่แชร์/ทุกคนถ้า `share_org` (ยกเว้น guest) · แก้: เจ้าของ · ลบ: เจ้าของ/OA | `{name, scope:{k,id,ids}, share:{org,users,teams}}` ≤ 20 วิดเจ็ต · ข้อมูลกราฟคิดตามสิทธิ์ผู้ขอ (4b) |
| POST | `/api/attachments/upload-session` | W ของงาน (C สำหรับประกาศ/คำตอบ) | `{entityId, name, size}` → เซิร์ฟเวอร์สร้าง Graph upload session ใต้ `Orbit/attachments/<entityId>/` แล้วคืน `uploadUrl` (≤ 100 MB) · ตอนนี้เบราว์เซอร์เรียก Graph เอง (app/files.js) (4b) |
| POST · GET | `/api/tasks/{id}/attachments` · `/api/attachments/{id}/content` | W / ผู้เห็นงาน | บันทึก `{name, size, mime, driveId, driveItemId, webUrl, linked}` · ดาวน์โหลดผ่าน Graph ด้วยสิทธิ์ของแอป — ปิดช่องที่ไฟล์บนไดรฟ์เปิดได้ตามสิทธิ์ SharePoint แทนสิทธิ์โปรเจกต์ (4b) |
| POST | `/api/admin/attachments/migrate` | OA | ย้าย data URI ที่ค้างในข้อมูล (งาน ทรัพยากร ประกาศ รูปในหน้า ถังขยะ เทมเพลต) ขึ้นไดรฟ์ คืน `{moved, failed, bytesBefore, bytesAfter}` · ลง audit `files.migrate` (4b) |
| GET · POST · PATCH · DELETE | `/api/projects/{id}/embeds[/{eid}]` | อ่าน: ผู้เห็นโปรเจกต์ · แก้: E + ST | `{name, url}` → ตรวจรายการโฮสต์ที่อนุญาตแล้วแปลงเป็นลิงก์ฝัง (`embed_url`) ≤ 20 ต่อโปรเจกต์ · ห้ามรับ http หรือโฮสต์อื่น `422` (4b) |
| GET | `/api/reports/{id}/widgets/{wid}/data` | อ่านรายงานได้ | `{cats, series, values, number}` — src tasks (ตัวกรอง/แกนเหมือนแดชบอร์ด 3c + แกน `project`) projects/portfolios/goals (แกน status/owner/team/period, Y count/avg:progress/sum:open/sum:overdue) (4b) |

`/api/home` รวมทุกอย่างไว้ในคำขอเดียวโดยตั้งใจ ถ้าแยกเป็นห้าคำขอ หน้าแรกจะเปิด
คอนเนกชัน Azure SQL แบบ serverless พร้อมกันห้าเส้นทุกครั้งที่มีคนเปิดแอป
ช่วงเช้าที่ทุกคนเข้างานพร้อมกันจะกลายเป็นคอขวดทันที

### ผู้ดูแลระบบ

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| GET | `/api/admin/users` | OA | รายชื่อทั้งหมด พร้อมเวลาเข้าใช้ล่าสุด |
| GET | `/api/admin/directory?q=` | OA | ค้นสมุดรายชื่อบริษัทผ่าน Graph |
| POST | `/api/admin/users` | OA | เพิ่มล่วงหน้าด้วย Entra oid |
| PATCH | `/api/admin/users/{id}/role` | OA | **ห้ามลดจนเหลือศูนย์ admin** · ลง audit |
| POST | `/api/admin/users/{id}/deactivate` | OA | **ต้องระบุผู้รับช่วงงาน** ก่อนปิดบัญชี · ลง audit |
| GET | `/api/admin/audit` | OA | บันทึกการตรวจสอบ แบ่งหน้า |
| GET | `/api/admin/export` | OA | ส่งออกทั้งหมด · ลง audit |

---

## ปลายทางเพิ่มเติมตาม SCHEMA 19 (Sprint 1–4)

สิทธิ์ใช้สัญลักษณ์ชุดเดียวกับด้านบน เพิ่ม `ตัวเอง` = ทำได้เฉพาะแถวของตัวเอง
**หลักการแบ่งสิทธิ์:** โครงสร้าง (เซกชัน ฟิลด์ มุมมอง ค่าเริ่มต้นมุมมอง ฟิลด์บังคับ งานเงียบ อัตโนมัติ) = เจ้าของ / `PA` / `OA`
ที่ผ่าน `E + ST` · งาน ความเห็น การย้ายเซกชันของงาน = สมาชิกที่มี `E` (ความเห็น = `C`) · โครงสร้างองค์กร = `OA`

### อนุมัติหลายคน

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| PUT | `/api/tasks/{id}/approvers` | E | `{user_ids[], mode: all\|any}` → `task_approvers` + `tasks.approval_mode` · 1 คน = แบบเดี่ยว (`assignee_id`) · ตั้งใหม่ = ล้างโหวต กลับเป็น `pending` · ผู้อนุมัติต้องผ่านด่านคนนอกโปรเจกต์ปิด (`outsidersOf`) |
| POST | `/api/tasks/{id}/approval/vote` | ต้องอยู่ใน `task_approvers` (หรือ `assignee_id` แบบเดี่ยว) | `{decision: approved\|changes\|rejected, note?}` · **เห็นงานได้ไม่พอ** ต้องเป็นผู้อนุมัติของรอบนี้ · ลง `task_approval_trail` · `mode=all` ต้อง approved ครบทุกคนจึงเปลี่ยน `tasks.approval` · `changes/rejected` คนเดียวมีผลทันที · คำนวณและแจ้งผู้ขอฝั่งเซิร์ฟเวอร์ ธุรกรรมเดียว · ทริกเกอร์อัตโนมัติ `approval` |
| GET | `/api/tasks/{id}/approval` | R | โหวตปัจจุบัน + ประวัติ (100 ล่าสุด) |

### เตือนฉัน (รายบุคคล)

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| GET · POST | `/api/tasks/{id}/reminders` | R + ตัวเอง | คืนเฉพาะของตัวเอง · หนึ่งงานหนึ่งเตือนที่ค้างอยู่ (`ux_rem_open`) |
| DELETE | `/api/tasks/{id}/reminders/{rid}` | ตัวเอง | ถึงเวลา → timer `reminders-due` แจ้งเตือนและตั้ง `done_at` |

### โปรเจกต์: งานเงียบ ฟิลด์บังคับ ค่าเริ่มต้นมุมมอง นัดประชุม

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| PUT | `/api/projects/{id}/stale` | E + ST | `{days: 0–365, move_to: sectionId\|null}` |
| PUT | `/api/projects/{id}/required-fields` | E + ST | `{field_ids[]}` เฉพาะฟิลด์ของโปรเจกต์ · มีผลกับงานระดับบนสุดเท่านั้น · `PATCH /api/tasks/{id}` ที่ตั้ง `completed` ตอบ `422 {missing:[fieldId]}` ถ้ายังไม่กรอก |
| GET · PUT · DELETE | `/api/projects/{id}/view-defaults/{kind}` | R / E + ST | `kind` = list board timeline gantt calendar · `config_json` ชุดเดียวกับ `saved_views` |
| PUT | `/api/projects/{id}/next-meeting` | E | `{date\|null}` · `POST /api/projects/{id}/meeting-pages` สร้างหน้าบันทึกประชุมของวันนั้น (`pages.meeting_on`) |
| POST | `/api/projects/{id}/carry-over` | E | `{from_section_ids[], to_section_id}` ย้ายงานที่ยังไม่เสร็จพร้อมแท็ก “ยกมาจาก {วันที่}” |
| POST | `/api/projects/{id}/slip` | E | `{new_date}` เลื่อนงานที่เลยกำหนดทั้งหมด เพิ่ม `tasks.slips` ทีละ 1 |
| POST · DELETE | `/api/projects/{id}/baseline` | E + ST | บันทึก/ล้างแผนเดิมของ Gantt (`project_baselines`, `project_baseline_tasks`) |
| GET · POST | `/api/projects/{id}/status-updates` · `…/{uid}/replies` | R / C | รายงานสถานะ + ถาม/ตอบหนึ่งระดับ (`status_update_replies`) · ตัวเลข snapshot คิดตอนโพสต์ · แจ้งคนเขียน เจ้าของ คนที่เคยตอบ และคนที่ถูก `@` |
| PUT | `/api/projects/{id}/fields/{fid}` | E + ST | รวมธง `is_important` และ `description` · `POST /api/projects/{id}/fields/merge` (`{from, into, preview?}`) รวมฟิลด์ — ส่ง `preview=true` ก่อนเสมอ |

### อัตโนมัติ (เพิ่มจากตารางด้านบน)

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| POST | `/api/projects/{id}/automations/{aid}/dry-run` | R + เห็นงาน | `{task_id}` ประเมินเงื่อนไขและบอกว่าจะทำอะไร **ไม่แก้ข้อมูล** · บันทึกลง `automation_runs` แบบ `is_dry = 1` |
| POST | `/api/projects/{id}/automations/validate` | E + ST | ตรวจ JSON ตามขีดจำกัด `AUTO_*` (50 อัตโนมัติ · 5 เส้นทาง · 10 เงื่อนไข · 20 การกระทำ · ลึก 3 ชั้น) ก่อนบันทึก |
| GET | `/api/projects/{id}/automation-runs?task_id=` | R | ประวัติ 200 ล่าสุด รวม `trace_json` (ac) |

ชนิดทริกเกอร์ที่รับ: `added moved completed assignee due start field comment tagadd tagdel subsdone movedout attachment follower unblocked approval approaching overdue manual scheduled` ·
การกระทำ: `section complete assign due start field comment followers tag untag priority create addproj mtmove notify subtasks followup approvers`
(บังคับด้วย `ck_automation_trigger` และตรวจการกระทำที่ API) ·
การกระทำที่ **มอบงาน/เพิ่มคน** ให้คนนอกโปรเจกต์ปิดต้องผ่านกติกา `outsidersOf` เดิม — ไม่มีคนให้ถาม = ข้ามการกระทำนั้นและลงเหตุผลในประวัติ

### สมาชิก ทีม และผู้ใช้

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| POST | `/api/projects/{id}/members/bulk` | PA หรือ OA (ล็อกอยู่ = OA) | `{users:[{id,access}], teams:[{id,access}]}` เพิ่มรายคนและ/หรือทั้งทีมในครั้งเดียว · ทีมผูกผ่าน `project_teams` (ไม่คัดลอกสมาชิกลงตาราง) · ลง audit ครั้งเดียว · โปรเจกต์ที่ล็อก สมาชิกทั่วไปทำไม่ได้ |
| GET · POST · PATCH · DELETE | `/api/teams[/{id}]` · `/api/teams/{id}/members` | ทุกคน (อ่าน ตาม `privacy`) / ผู้ดูแลทีม / OA | ทีม `private` ไม่โผล่ให้คนนอกทีม (404) |
| PUT | `/api/users/{id}/manager` | OA | `users.manager_id` |
| GET | `/api/users/{id}/open-work` | OA | งานที่ค้างและบทบาทโปรเจกต์ของคนนั้น (ใช้ก่อนโอนงาน/ปิดบัญชี) |
| POST | `/api/users/{id}/handover` | OA | `{to, tasks: bool, projects: bool, with_projects_access: bool}` โอนงาน/ความเป็นเจ้าของ/ผู้ดูแล ในธุรกรรมเดียว · ลง audit `user.handover` |
| POST | `/api/users/bulk` | OA | นำเข้ารายชื่อ (CSV) ล่วงหน้าก่อนล็อกอิน · ตรวจรูปแบบอีเมล (`emailProblem`) · ซ้ำ = ข้าม ไม่ทับ |
| GET · PUT | `/api/admin/settings` | OA | `org_settings`: `orgLang`, `orgPrivacy`, `fyStart`, `mission` … · `orgPrivacy` เป็นแค่ค่าเริ่มต้นของโปรเจกต์ใหม่ ไม่แตะโปรเจกต์ที่มีอยู่ |
| GET · POST | `/api/admin/sample-data` | OA | `GET` = สรุปที่จะลบ/ข้าม · `POST {confirm:true}` เรียก `sp_ClearSampleData` (ลบแบบซ่อน กู้ได้ 30 วัน) · ข้ามโปรเจกต์ที่มีข้อมูลคนจริงปน |

### การแจ้งเตือน

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| GET | `/api/me/notifications?tab=&snoozed=` | ตัวเอง | รวมกลุ่ม (`parts_json`) · ซ่อนรายการที่เลื่อนเตือนอยู่ยกเว้น `snoozed=1` |
| POST | `/api/me/notifications/snooze` · `/unsnooze` | ตัวเอง | `{ids[], until}` |
| PUT | `/api/me/follow/projects/{id}` · `/portfolios/{id}` | R | `user_project_notify` / `user_portfolio_follow` |

**การส่งออกนอกระบบ (อีเมล / Teams)** — **ต้องขอสิทธิ์จาก IT** (Graph `Mail.Send` แบบ application หรือ webhook ของช่อง Teams
พร้อม admin consent) ก่อนเปิดใช้ ระหว่างนี้แจ้งเตือนอยู่ในแอปอย่างเดียว · ออกแบบเป็นคิว `notification_deliveries`
ผู้ใช้ปิดรายชนิดได้ จำกัดความถี่ต่อคน และห้ามใส่เนื้อหาโปรเจกต์ private ในข้อความที่ส่งออก (ส่งเป็นลิงก์) ·
ปลายทางตั้งค่า: `PUT /api/admin/delivery` (OA) เปิด/ปิดช่องทาง · ไม่ตั้งค่า = ไม่ส่ง

### งานเบื้องหลัง (Azure Functions timer) แทนตัวนับเวลาฝั่งเบราว์เซอร์

ตอนนี้ทั้งหมดทำงานเมื่อมีคนเปิดแอปเท่านั้น (`setInterval` ใน `app/main.js`) ฝั่งเซิร์ฟเวอร์ต้องรันเองทุกคืน/ทุกรอบ
ทุกตัวต้อง **idempotent** (ใช้ `automation_fired` / คอลัมน์ `*_at` กันซ้ำ) และรันด้วยตัวตนระบบ ไม่ใช่ผู้ใช้

| Timer | ความถี่ | ทำอะไร | แทนของเดิม |
|---|---|---|---|
| `automations-scheduled` | ทุก 5 นาที | ทริกเกอร์ `approaching overdue scheduled` (≤ 50 งาน/รอบ) กันซ้ำด้วย `automation_fired` | `runAutoTick` |
| `reminders-due` | ทุก 1 นาที | `task_reminders` ที่ถึงเวลา → แจ้งเตือน ตั้ง `done_at` | `runReminders` |
| `snooze-wake` | ทุก 1 นาที | `notifications.snooze_until <= now` → ยังไม่อ่าน ตั้ง `woke_at` | `runSnoozeWake` |
| `stale-check` | ทุกชั่วโมง | โปรเจกต์ที่ `stale_days > 0` ตามขั้น a/b/c (`task_stale`) | `runStale` |
| `status-remind` | วันศุกร์เช้า | โปรเจกต์ `status_remind = 1` สร้างงานเตือนอัปเดตสถานะ (`remind_key` กันซ้ำรายสัปดาห์) | `runRemind` |
| `due-notify` | ทุกชั่วโมง | เตือนครบกำหนด/เลยกำหนด (`dedupe_key`) | เตือนกำหนดส่ง |
| `recurring-tasks` | ทุก 15 นาที | สร้างงานซ้ำตาม `recur_json` ที่ยังไม่สร้าง | งานซ้ำ |
| `delivery-send` | ทุก 1 นาที | อ่านคิว `notification_deliveries` — **ปิดอยู่จนกว่า IT อนุมัติ** | — |
| `cleanup-nightly` | ทุกคืน | ลบถังขยะเกิน 30 วัน · `automation_fired` เก่ากว่า 60 วัน · `automation_runs` เกิน 200/โปรเจกต์ · ตัดเลขหมุนเวียน audit ตามนโยบาย | ล้างในแอป |

ถ้า timer สองเครื่องรันชนกัน ต้องมีล็อก (`sp_getapplock`) ต่อ timer หนึ่งตัวต่อครั้ง

### สิทธิ์สรุปต่อกลุ่มปลายทาง

| กลุ่ม | ทำได้ | ตัวตรวจ |
|---|---|---|
| โครงสร้างโปรเจกต์ (เซกชัน ฟิลด์ มุมมอง ค่าเริ่มต้น ฟิลด์บังคับ งานเงียบ อัตโนมัติ baseline) | เจ้าของ · `PA` · `OA` (และ `edit` ที่ `can_structure = 1`) | `E + ST` |
| งาน ความเห็น ย้ายเซกชัน ผู้ติดตาม เตือนฉัน | `E` (ความเห็น `C`) | `fn_VisibleTasks` + ระดับในโปรเจกต์ |
| อนุมัติ | เฉพาะผู้อนุมัติของรอบนั้น | `task_approvers` |
| สมาชิก / ทีมของโปรเจกต์ / ล็อก | `PA` · `OA` (ล็อก = `OA`) | ด่านสมาชิก |
| ผู้ใช้ หัวหน้า โอนงาน ตั้งค่าองค์กร ล้างข้อมูลตัวอย่าง ส่งออก | `OA` | `org_role = 'admin'` |

### ย้ายข้อมูลจาก SharePoint JSON (SCHEMA 19) ขึ้น Azure SQL

ไฟล์ต้นทางคือออบเจกต์ `db` เดียวใน `app/store.js` · ตัวนำเข้าเป็นสคริปต์ครั้งเดียว (Node หรือ Function ที่รันด้วยมือโดยผู้ดูแลระบบ)
ที่ **เรียก `migrate()` เดิมก่อนเสมอ** เพื่อให้ไฟล์เก่ากว่า 19 ได้ค่าเริ่มต้นครบ แล้วจึงแปลงเป็นแถว — ไม่เขียนตัวแปลงแยกอีกชุด

**หลักการ**

1. **คงรหัสเดิม** — รหัสในแอปเป็นสตริง (`p_…`, `t_…`, `au_…`) แต่ตารางใช้ `UNIQUEIDENTIFIER`
   สร้างตาราง `id_map(old_id VARCHAR(60) PRIMARY KEY, kind, new_id UNIQUEIDENTIFIER)` ชั่วคราว
   ใช้ UUID แบบกำหนดแน่นอน (UUID v5 จาก `old_id`) เพื่อให้รันซ้ำแล้วได้รหัสเดิม ·
   ลิงก์ที่คนบันทึกไว้ (`#/task/<id>`) ต้องแปลงผ่าน `id_map` ตอนเปิด (ให้ API มี `GET /api/resolve/{oldId}` ช่วงเปลี่ยนผ่าน)
   · ผู้ใช้ใช้ Entra `oid` เป็น `users.id` โดยจับคู่จากอีเมล (ใครไม่มี `oid` = สร้างล่วงหน้าแล้วอัปเดตตอนล็อกอินครั้งแรก)
2. **ไม่นำเข้าข้อมูลตัวอย่าง** — ข้าม `user.sample` / `project.sample` / `removedUsers` ตั้งแต่ต้น (ถ้ามีข้อมูลจริงปนในโปรเจกต์ตัวอย่าง ให้ผู้ดูแลระบบเคลียร์ในแอปเก่าก่อน)
3. **นำเข้าในธุรกรรมเดียวต่อขั้น** และหยุดทันทีถ้าตรวจไม่ผ่าน

**ลำดับนำเข้า** (ตามคีย์นอก)

1. `users` (+ `manager_id` ทีหลัง) → `org_settings` → `time_categories` / `timesheet_reviewers`
2. `teams` → `team_members` → `team_pins`
3. `projects` (+ `stale_days`, `next_meeting`, `status_layout_json`, `views_json`) → `project_members` → `project_teams`
4. `sections` (แล้วค่อยตั้ง `projects.stale_move_to`) → `custom_fields` + `custom_field_options` → `project_required_fields`
5. `tags` · `task_types` · `task_templates` · `forms` · `project_templates`
6. `tasks` (งานระดับบนสุดก่อน แล้วงานย่อยตาม `parent_id`) → `task_projects` (section/position) → `task_followers` `task_tags`
   `task_dependencies` `task_field_values` `task_approvers` (จาก `t.approvers/approvalVotes`) `task_approval_trail` `task_reminders` `task_stale`
   · `completed_by` / `slips` เก่าที่ไม่มีค่า = `NULL` / `0` (ไม่เดา)
7. `stories` (ความเห็น/ประวัติ; เธรด `parent_story_id` ทีหลัง) → `story_reactions` → `attachments` (ไฟล์ยังอยู่ที่ SharePoint/OneDrive: เก็บลิงก์ ไม่คัดลอกไฟล์)
8. `saved_views` `project_view_defaults` `user_project_views` `project_baselines` `project_baseline_tasks`
9. `project_status_updates` + `status_update_replies` → `portfolios` (+ ลูก) → `goals` (+ ลูก) → `reports` `dashboard_widgets`
10. `pages` `page_versions` `project_messages` `message_replies` · `time_entries` `timesheets`
11. `automations` (`trigger_json/paths_json/else_json`) → `automation_runs` → `automation_fired`
12. `notifications` (รวม `parts_json`, `snooze_until`) → `user_project_notify` `user_portfolio_follow` → `user_personal` `my_task_*`
13. `audit_log` เก่า (ถ้าต้องการ) — ใส่ตามเวลาเดิม ไม่ทับของใหม่

**ข้อควรระวังเรื่องรูปแบบ**: วันที่แบบ `YYYY-MM-DD` → `DATE` · เวลา ISO → `DATETIME2(0)` UTC · ข้อความที่เป็น JSON ในแอป (`config_json` ฯลฯ) ตรวจ `ISJSON` ก่อนใส่ ·
รูปโปรไฟล์ data URI → อัปโหลดไป Blob แล้วเก็บ URL ใน `users.photo_url` · ค่ากึ่งโครงสร้าง (`user.prefs`) → `users`/`user_settings.prefs_json`

**ขั้น dry-run และตรวจสอบก่อนใช้จริง**

1. รันตัวนำเข้าแบบ `--dry-run` กับ **สำเนา** ไฟล์ JSON ลงฐาน staging ที่ว่าง (ไม่แตะไฟล์จริงบน SharePoint ซึ่งอ่านอย่างเดียว) — ต้องจบโดยไม่มี error และรายงานจำนวนแถวต่อตาราง
2. **เทียบจำนวน**: ผู้ใช้ โปรเจกต์ งาน (รวมงานย่อย) ความเห็น ไฟล์แนบ อัตโนมัติ แจ้งเตือน ต่อโปรเจกต์ — ต้องเท่ากับ JSON (ลบข้อมูลตัวอย่างที่จงใจข้าม)
3. **เทียบเนื้อหาแบบสุ่ม**: งานอย่างน้อย 50 งาน/โปรเจกต์ (ชื่อ ผู้รับผิดชอบ กำหนดส่ง เซกชัน ฟิลด์ ผู้อนุมัติ) และรายงานสถานะ 1 ฉบับต่อโปรเจกต์
4. **เทียบสิทธิ์**: สำหรับผู้ใช้ตัวแทนอย่างน้อย 1 คนต่อบทบาท (admin member guest viewer) คำนวณรายชื่อโปรเจกต์/งานที่เห็นได้จากแอปเก่า (`projectAccess`, `canSeeTask`)
   เทียบกับ `fn_VisibleProjects` / `fn_VisibleTasks` — **ต้องตรงกันทุกแถว โดยเฉพาะโปรเจกต์ private** ก่อนเปิดให้ทีมลับ
5. ตรวจคีย์นอก กำพร้า (งานที่ไม่มีโปรเจกต์ก็ได้ถ้าเป็นงานส่วนตัว) และรหัสซ้ำ
6. วันตัดข้อมูลจริง: ตั้งแอปเก่าเป็นอ่านอย่างเดียว → นำเข้า (ครั้งเดียว) → ตรวจซ้ำข้อ 2–4 → เปิดแอปใหม่ · เก็บ JSON เดิมเป็นข้อมูลสำรองอย่างน้อย 90 วัน
   (ย้อนกลับ = เปิดแอปเก่ากลับ แต่การแก้ไขหลังตัดข้อมูลจะไม่ย้อนกลับมา จึงควรตัดข้อมูลช่วงนอกเวลางาน)

---

## จุดรั่วที่ต้องเขียนเทสต์คลุมทุกข้อ

| # | สถานการณ์ | ผลที่ถูกต้อง |
|---|---|---|
| 1 | ไม่ใช่สมาชิก เดา id โปรเจกต์ปิด | `404` ไม่ใช่ `403` |
| 2 | ค้นหาด้วยคำที่อยู่ในโปรเจกต์ปิด | ไม่ขึ้นในผลลัพธ์ |
| 3 | ระดับ `view` ยิง PATCH ตรงเข้า API | `403` |
| 4 | งานอยู่ทั้งโปรเจกต์เปิดและปิด คนนอกเปิดดูงาน | เห็นงาน แต่รายชื่อโปรเจกต์เหลือเฉพาะที่ตัวเองเห็น |
| 5 | ปฏิทินรวม / งานของฉัน / หน้าแรก | ไม่หลุดงานจากโปรเจกต์ที่ไม่มีสิทธิ์ |
| 5ก | คนนอกโปรเจกต์ปิด แต่ถูกมอบหมายงานในนั้น | เห็นและแก้ได้เฉพาะงานนั้น · เปิดโปรเจกต์ยังได้ `404` · งานอื่นในโปรเจกต์ยังมองไม่เห็น |
| 5ข | สมาชิกระดับ `view` ที่ถูกมอบหมายงานในโปรเจกต์นั้น | เห็นได้ แต่แก้ไม่ได้ — ระดับสิทธิ์โปรเจกต์ต้องชนะเสมอ |
| 5ง | `viewer` ระดับองค์กร ถูกเชิญเข้าโปรเจกต์ด้วยระดับ `edit` | ยังได้แค่ `view` · เขียนอะไรก็ `403` — บทบาทองค์กรเป็นเพดาน |
| 5จ | `guest` เปิดโปรเจกต์ที่ `visibility = org` แต่ไม่ได้ถูกเชิญ | `404` — โปรเจกต์เปิดไม่ได้แปลว่าคนนอกเห็น |
| 5ฉ | `guest` ที่ได้ระดับ `edit` ยิง `PATCH /api/projects/{id}` เปลี่ยนชื่อโปรเจกต์ | `403` — ผ่านด่าน `E` แต่ตก `ST` · แก้งานในโปรเจกต์ยังทำได้ตามปกติ |
| 5ค | กิจกรรมล่าสุด มีคอมเมนต์ในงานของโปรเจกต์ปิด | ไม่ขึ้นให้คนนอกเห็น |
| 5ช | งานส่วนตัว (ไม่อยู่โปรเจกต์ไหน) ของคนอื่น — ค้นหา ปฏิทิน หน้าแรก โปรไฟล์ กล่องข้อความ แท็ก งานย่อย | ไม่ขึ้นเลย · `GET /api/tasks/{id}` ได้ `404` · ถูก @ หรือถูกเพิ่มเป็นผู้ติดตามแล้วจึงเห็น |
| 6 | โปรเจกต์ล็อกอยู่ PA พยายามเพิ่มสมาชิก | `403` ต้องให้ OA ทำ |
| 7 | ถอด admin คนสุดท้ายของโปรเจกต์ | `409` |
| 8 | guest เรียก `/api/admin/directory` | `403` |
| 9 | สองคนแก้งานเดียวกันพร้อมกัน | คนที่สองได้ `409` ไม่ใช่เขียนทับ |
| 10 | ขอไฟล์แนบที่ยังสแกนไม่เสร็จ | ปฏิเสธ |
| 11 | ผู้ใช้ที่ไม่ได้เป็นสมาชิก/ทีมของโปรเจกต์ `private` เรียก `GET /api/projects/{id}` | `404` · ไม่ขึ้นในค้นหา กิจกรรม พอร์ตโฟลิโอ รายงาน แดชบอร์ด |
| 12 | สมาชิกของทีมที่ผูกกับโปรเจกต์ `private` ระดับ `view` พยายามแก้งาน | `403` · ถอดออกจากทีมแล้วต้องเห็นไม่ได้ทันที |
| 13 | โหวตอนุมัติโดยคนที่ไม่ใช่ผู้อนุมัติของรอบนั้น (แม้เห็นงานได้) | `403` |
| 14 | ปิดงานที่โปรเจกต์ตั้งฟิลด์บังคับไว้ แต่ยังไม่กรอก | `422` พร้อมรายชื่อฟิลด์ที่ขาด (งานย่อยไม่โดน) |
| 15 | อัตโนมัติมอบงานให้คนนอกโปรเจกต์ปิด | ข้ามการกระทำนั้น ลงเหตุผลในประวัติ ไม่รั่วงานให้คนนอก |
| 16 | `dry-run` อัตโนมัติ | ไม่มีการเปลี่ยนแปลงใด ๆ ในงาน ความเห็น แจ้งเตือน |
| 17 | เรียกเตือนฉัน/เลื่อนเตือนของคนอื่น | `404` |
| 18 | ล้างข้อมูลตัวอย่างโปรเจกต์ที่มีข้อมูลคนจริงปน | ข้ามโปรเจกต์นั้น ไม่ลบ |

---

## หมายเหตุการทำงาน

**การอัปเดตแบบสด** — เริ่มจากถาม `/api/projects/{id}/changes?since=` ทุก 20 วินาที
เฉพาะโปรเจกต์ที่เปิดดูอยู่ ถ้าไม่พอค่อยย้ายไป SignalR

**ตอนเน็ตหลุด** — เวอร์ชันนี้ทำงานต่อไม่ได้ ต่างจากของเดิม
ให้หน้าจอขึ้นแถบเตือนชัด ๆ และกันไม่ให้ผู้ใช้พิมพ์ทิ้งไว้แล้วหาย

**ลำดับงาน** — คำนวณ `position` ที่เซิร์ฟเวอร์เท่านั้น ห้ามให้หน้าจอส่งมา
ถ้าช่องว่างแคบกว่า `0.000001` ให้เรียก `sp_RebalanceSection`

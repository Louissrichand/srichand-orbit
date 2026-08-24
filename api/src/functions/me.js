/* GET /api/me — ผู้ใช้ปัจจุบันคือใคร
 *
 * หน้าจอเรียกอันนี้ตอนเปิดแอป เพื่อรู้ว่าตัวเองเป็นใครและมีบทบาทอะไร
 *
 * ตอนนี้ยังไม่มีฐานข้อมูล จึงคืนข้อมูลจากตัวตนที่ Entra ให้มาก่อน
 * เมื่อต่อฐานข้อมูลแล้วจะเพิ่ม: บันทึกผู้ใช้ลงตาราง users ถ้ายังไม่มี
 * อัปเดต last_seen_at และคืนบทบาทกับการตั้งค่าส่วนตัวมาด้วย
 */
'use strict';

const { app } = require('@azure/functions');
const P = require('../shared/principal');

app.http('me', {
  methods: ['GET'],
  authLevel: 'anonymous',   // Static Web Apps กันด้วย allowedRoles ใน config อยู่แล้ว
  route: 'me',
  handler: async (request, context) => {
    const me = P.readPrincipal(request);
    if (!me) return P.unauthorized();

    /* กันไว้อีกชั้น: ต้องมาจาก Entra ของบริษัทเท่านั้น
     * ถึงจะปิดผู้ให้บริการอื่นไว้ใน config แล้ว แต่ตรวจซ้ำที่นี่ไม่เสียหาย */
    if (me.provider !== 'aad') {
      context.warn('ปฏิเสธผู้ให้บริการ ' + me.provider);
      return P.forbidden();
    }

    /* ไม่มี oid แปลว่าจับคู่กับสมุดรายชื่อบริษัทไม่ได้ ใช้งานต่อไม่ได้ */
    if (!me.oid) {
      return P.json(500, {
        error: 'missing_oid',
        message: 'ไม่พบ object id จาก Entra — ตรวจการตั้งค่าแอปใน Entra'
      });
    }

    const bootstrapAdmins = (process.env.BOOTSTRAP_ADMIN_OIDS || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    return P.json(200, {
      id: me.id,
      email: me.email,
      name: me.name,
      tenantId: me.tenantId,
      orgRole: bootstrapAdmins.includes(me.id) ? 'admin' : 'member',
      roles: me.swaRoles,
      /* บอกหน้าจอว่ายังไม่มีฐานข้อมูล จะได้ขึ้นแถบเตือนว่ายังบันทึกงานไม่ได้ */
      backend: process.env.SQL_CONNECTION_STRING ? 'database' : 'identity-only'
    });
  }
});

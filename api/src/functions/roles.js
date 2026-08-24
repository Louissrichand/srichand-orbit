/* POST /api/roles — Static Web Apps เรียกอันนี้ทันทีหลังผู้ใช้ล็อกอินสำเร็จ
 *
 * หน้าที่เดียว: บอกว่าคนนี้ควรได้บทบาทอะไรบ้าง
 * ค่าที่คืนไปจะไปอยู่ใน userRoles ซึ่งใช้กับ allowedRoles ใน staticwebapp.config.json ได้
 *
 * ระวัง: ปลายทางนี้แพลตฟอร์มเรียกเอง ไม่ใช่ผู้ใช้เรียก
 * ห้ามเปิดให้เรียกจากภายนอกและห้ามเชื่อ body ที่ส่งมาถ้าไม่ได้มาจาก SWA
 *
 * ระยะแรกยังไม่มีฐานข้อมูล จึงกำหนดผู้ดูแลจากรายชื่อ oid ในการตั้งค่า
 * ทำให้ตั้งผู้ดูแลคนแรกได้โดยไม่ต้องรอฐานข้อมูล
 */
'use strict';

const { app } = require('@azure/functions');

app.http('roles', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'roles',
  handler: async (request, context) => {
    let body = {};
    try { body = await request.json(); } catch (e) { /* ไม่มี body ก็ให้บทบาทพื้นฐานไป */ }

    const claims = {};
    (body.claims || []).forEach(c => {
      const k = String(c.typ || '').split('/').pop().toLowerCase();
      if (!(k in claims)) claims[k] = c.val;
    });

    const oid = String(claims.objectidentifier || claims.oid || '').toLowerCase();
    const roles = ['authenticated'];

    /* ผู้ดูแลชุดตั้งต้น ใส่เป็น oid คั่นด้วยจุลภาคในการตั้งค่าของ Static Web App
       เมื่อฐานข้อมูลพร้อมแล้ว ให้ย้ายไปอ่านจากตาราง users แทน */
    const bootstrap = (process.env.BOOTSTRAP_ADMIN_OIDS || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    if (oid && bootstrap.includes(oid)) {
      roles.push('orbit-admin');
      context.log('ให้บทบาทผู้ดูแลกับ ' + oid);
    }

    return { jsonBody: { roles } };
  }
});

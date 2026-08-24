/* Orbit — อ่านตัวตนของผู้เรียก
 *
 * Static Web Apps ตรวจล็อกอินให้เสร็จแล้วส่งหัว x-ms-client-principal มาให้
 * เป็น JSON เข้ารหัส base64 ที่แพลตฟอร์มเป็นคนใส่ ผู้ใช้ปลอมไม่ได้
 *
 * กติกาเหล็ก: ห้ามรับ user id จาก body หรือ query ของผู้ใช้เด็ดขาด
 * ทุกอย่างต้องมาจากหัวนี้ทางเดียว
 */
'use strict';

/* ชื่อ claim ของ Entra ยาวและมีหลายรูปแบบ จึงเทียบเฉพาะส่วนท้าย */
function claimMap(claims) {
  var out = {};
  (claims || []).forEach(function (c) {
    var key = String(c.typ || '').split('/').pop().toLowerCase();
    if (!(key in out)) out[key] = c.val;
  });
  return out;
}

/** แปลง object id ของ Entra เป็นรหัสที่ Orbit ใช้ — ต้องตรงกับที่ฐานข้อมูลเก็บ */
function orbitId(oid) {
  return String(oid || '').toLowerCase();
}

/**
 * คืนตัวตนของผู้เรียก หรือ null ถ้ายังไม่ล็อกอิน
 * { id, email, name, oid, tenantId, provider, swaRoles }
 */
function readPrincipal(request) {
  var header = request.headers.get('x-ms-client-principal');
  if (!header) return null;

  var p;
  try {
    p = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!p || !p.userId) return null;

  var c = claimMap(p.claims);

  /* userId ที่ SWA ให้มาเป็นค่าเฉพาะของแพลตฟอร์ม ไม่ใช่ oid ของ Entra
   * Orbit ต้องใช้ oid เพราะเป็นค่าเดียวกับที่ Microsoft Graph คืนมาตอนค้นรายชื่อ
   * ถ้าใช้ค่าอื่น คนที่ถูกเพิ่มไว้ล่วงหน้าจะไม่เชื่อมกับตอนล็อกอินจริง */
  var oid = c.objectidentifier || c.oid || '';

  return {
    id: orbitId(oid),
    oid: oid,
    tenantId: c.tenantid || c.tid || '',
    email: (p.userDetails || c.preferred_username || c.emailaddress || '').toLowerCase(),
    name: c.name || c.givenname || p.userDetails || '',
    provider: p.identityProvider || '',
    swaRoles: p.userRoles || []
  };
}

/** ตอบกลับเป็น JSON พร้อมกันแคช เพราะข้อมูลผูกกับตัวบุคคล */
function json(status, body) {
  return {
    status: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    jsonBody: body
  };
}

/* ไม่มีสิทธิ์ให้ตอบ 404 ไม่ใช่ 403
 * เพราะ 403 เป็นการยืนยันกลาย ๆ ว่าของสิ่งนั้นมีอยู่จริง */
function notFound() { return json(404, { error: 'not_found' }); }
function forbidden() { return json(403, { error: 'forbidden' }); }
function unauthorized() { return json(401, { error: 'unauthenticated' }); }

module.exports = {
  readPrincipal: readPrincipal,
  orbitId: orbitId,
  json: json,
  notFound: notFound,
  forbidden: forbidden,
  unauthorized: unauthorized
};

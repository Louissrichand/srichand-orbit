/* Orbit — จัดการรหัสผ่านและโทเคนในอีเมล
 *
 * ใช้ scrypt ที่มากับ Node เอง ไม่พึ่งไลบรารีภายนอกที่ต้องคอมไพล์
 * เพราะ Azure Functions แบบ managed ของ Static Web Apps ติดตั้งของพวกนั้นยาก
 *
 * ค่าพารามิเตอร์ที่ใช้ N=32768 r=8 p=1 กินหน่วยความจำราว 32 MB ต่อครั้ง
 * และใช้เวลาราว 100 มิลลิวินาที ซึ่งช้าพอที่จะทำให้การไล่เดารหัสไม่คุ้ม
 * แต่เร็วพอสำหรับการล็อกอินปกติ
 */
'use strict';

const crypto = require('node:crypto');

const KDF = { N: 32768, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 };

/* ---------- รหัสผ่าน ---------- */

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(normalize(plain), salt, KDF.keylen, KDF);
  return { hash, salt, params: `N=${KDF.N},r=${KDF.r},p=${KDF.p}` };
}

/** เทียบแบบใช้เวลาคงที่ ไม่ให้เดาจากความเร็วในการตอบว่าถูกกี่ตัวอักษร */
function verifyPassword(plain, hash, salt) {
  let candidate;
  try {
    candidate = crypto.scryptSync(normalize(plain), salt, hash.length, KDF);
  } catch (e) {
    return false;
  }
  if (candidate.length !== hash.length) return false;
  return crypto.timingSafeEqual(candidate, hash);
}

/* รูปแบบ Unicode ต่างกันทำให้รหัสเดียวกันกลายเป็นคนละค่า
   โดยเฉพาะภาษาไทยและอักขระผสม จึงต้องทำให้เป็นรูปแบบเดียวกันก่อนเสมอ */
function normalize(s) {
  return String(s == null ? '' : s).normalize('NFKC');
}

/* ---------- ข้อกำหนดของรหัสผ่าน ----------
 *
 * ยึดแนวทางที่ยอมรับกันในปัจจุบัน: เน้นความยาว ไม่เน้นบังคับผสมสัญลักษณ์
 * เพราะการบังคับผสมทำให้คนตั้งรหัสที่เดาง่ายแบบ Passw0rd! กันหมด
 * และไม่บังคับเปลี่ยนรหัสตามรอบเวลา เพราะทำให้คนตั้งรหัสอ่อนลงเรื่อย ๆ
 */
const COMMON = new Set([
  'password', 'password1', '12345678', '123456789', '1234567890',
  'qwertyuiop', 'iloveyou', 'admin1234', 'letmein123', 'welcome123',
  'orbit1234', 'srichand', 'srichand123', 'abcd1234', '11111111'
]);

function checkStrength(plain, email, name) {
  const p = normalize(plain);
  const errs = [];

  if (p.length < 12) errs.push('too_short');
  if (p.length > 200) errs.push('too_long');
  if (COMMON.has(p.toLowerCase())) errs.push('too_common');

  /* ห้ามเอาอีเมลหรือชื่อตัวเองมาตั้ง เพราะเป็นสิ่งแรกที่คนเดา */
  const local = String(email || '').split('@')[0].toLowerCase();
  if (local.length >= 4 && p.toLowerCase().includes(local)) errs.push('contains_email');
  const first = String(name || '').split(/\s+/)[0].toLowerCase();
  if (first.length >= 4 && p.toLowerCase().includes(first)) errs.push('contains_name');

  /* ตัวเดียวซ้ำทั้งหมด หรือเรียงต่อกันตรง ๆ */
  if (/^(.)\1+$/.test(p)) errs.push('repeated');

  return { ok: errs.length === 0, errors: errs };
}

/** ข้อความอธิบายให้ผู้ใช้อ่านรู้เรื่อง ไม่ใช่รหัส error */
const STRENGTH_TEXT = {
  too_short: 'รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร',
  too_long: 'รหัสผ่านยาวเกินไป',
  too_common: 'รหัสผ่านนี้ถูกใช้กันทั่วไป เดาได้ง่ายเกินไป',
  contains_email: 'รหัสผ่านต้องไม่มีชื่ออีเมลของคุณอยู่ในนั้น',
  contains_name: 'รหัสผ่านต้องไม่มีชื่อของคุณอยู่ในนั้น',
  repeated: 'รหัสผ่านต้องไม่เป็นตัวอักษรเดียวซ้ำกันทั้งหมด'
};

/* ---------- โทเคนที่ส่งไปในอีเมล ---------- */

/** สร้างโทเคน คืนตัวจริงไว้ใส่ในอีเมล และค่า hash ไว้เก็บลงฐานข้อมูล */
function makeToken() {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw), 'utf8').digest();
}

/* ---------- คุกกี้เซสชันของทางสำรอง ----------
 *
 * ผู้ใช้ที่เข้าผ่าน Entra จะได้เซสชันจาก Static Web Apps อยู่แล้ว
 * ส่วนคนที่เข้าด้วยรหัสผ่านต้องมีเซสชันของเราเอง
 *
 * ใส่ pwdChangedAt ลงไปด้วย เพื่อให้ "เปลี่ยนรหัสแล้วเตะทุกอุปกรณ์ออก"
 * ทำได้โดยไม่ต้องมีตารางเซสชัน
 */
function signSession(payload, secret, ttlSeconds) {
  const body = {
    uid: payload.uid,
    pwd: payload.pwd,                                   // เวลาที่เปลี่ยนรหัสล่าสุด
    exp: Math.floor(Date.now() / 1000) + (ttlSeconds || 8 * 3600)
  };
  const data = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return data + '.' + sig;
}

function readSession(cookie, secret) {
  if (!cookie || cookie.indexOf('.') < 0) return null;
  const [data, sig] = cookie.split('.');
  let expected;
  try {
    expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  } catch (e) { return null; }

  const a = Buffer.from(sig || '', 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let body;
  try {
    body = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch (e) { return null; }

  if (!body || !body.uid) return null;
  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}

module.exports = {
  hashPassword, verifyPassword, checkStrength, STRENGTH_TEXT,
  makeToken, hashToken, signSession, readSession, normalize
};

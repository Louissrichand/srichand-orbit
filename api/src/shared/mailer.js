/* Orbit — ส่งอีเมลยืนยัน
 *
 * ส่งผ่านกล่องจดหมายของบริษัทเองด้วย Microsoft Graph
 * จึงไม่ต้องพึ่งผู้ให้บริการอีเมลภายนอก และอีเมลออกจากโดเมนบริษัทจริง
 * ทำให้ไม่ตกถังขยะและพนักงานเชื่อถือได้ว่ามาจากบริษัท
 *
 * ต้องตั้งค่าเหล่านี้ใน Application settings ของ Static Web App
 *   TENANT_ID              รหัสองค์กร
 *   AAD_CLIENT_ID          รหัสแอป (ตัวเดียวกับที่ใช้ล็อกอิน)
 *   AAD_CLIENT_SECRET      ความลับของแอป
 *   MAIL_FROM              กล่องจดหมายที่ใช้ส่ง เช่น orbit-noreply@srichand.co.th
 *   PUBLIC_BASE_URL        ที่อยู่เว็บ ใช้ประกอบลิงก์ในอีเมล
 *
 * สิทธิ์ที่ต้องขอเพิ่มใน Entra: Mail.Send แบบ Application
 * และ **ต้องจำกัดด้วย ApplicationAccessPolicy ให้ส่งได้เฉพาะกล่องเดียว**
 * ไม่งั้นแอปจะส่งอีเมลในนามใครก็ได้ทั้งองค์กร
 */
'use strict';

let cachedToken = null;   // { value, exp }

async function graphToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;

  const tenant = process.env.TENANT_ID;
  const body = new URLSearchParams({
    client_id: process.env.AAD_CLIENT_ID,
    client_secret: process.env.AAD_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new Error('ขอโทเคนสำหรับส่งอีเมลไม่สำเร็จ: ' + res.status);

  const j = await res.json();
  cachedToken = { value: j.access_token, exp: now + (j.expires_in || 3600) };
  return cachedToken.value;
}

/** ส่งอีเมลหนึ่งฉบับ คืน true ถ้าส่งสำเร็จ */
async function send(to, subject, html) {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error('ยังไม่ได้ตั้งค่า MAIL_FROM');

  const token = await graphToken();
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: to } }]
        },
        saveToSentItems: true      // เก็บไว้ในกล่องส่ง เพื่อให้ตรวจย้อนหลังได้
      })
    }
  );

  if (!res.ok) {
    const t = await res.text();
    throw new Error('ส่งอีเมลไม่สำเร็จ ' + res.status + ': ' + t.slice(0, 200));
  }
  return true;
}

/* ---------- แม่แบบอีเมล ----------
 * เขียนเป็น HTML ง่าย ๆ ที่แสดงผลได้ทุกโปรแกรมอีเมล
 * ไม่ใช้ CSS ภายนอกและไม่ใช้รูปจากที่อื่น เพราะโปรแกรมอีเมลส่วนใหญ่บล็อก
 */

function shell(title, bodyHtml) {
  return `<!doctype html><html lang="th"><body style="margin:0;padding:24px;background:#f7f5f6;
font-family:'Segoe UI',Tahoma,sans-serif;color:#17161a;line-height:1.7">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2dee1;border-radius:10px;padding:32px">
<div style="font-size:20px;font-weight:700;color:#ee0b3f;margin-bottom:4px">Orbit</div>
<div style="font-size:12px;color:#97949c;margin-bottom:24px">ระบบจัดการงานภายในของศรีจันทร์</div>
<h1 style="font-size:19px;margin:0 0 14px">${title}</h1>
${bodyHtml}
<div style="margin-top:28px;padding-top:18px;border-top:1px solid #eeebed;font-size:12px;color:#97949c">
อีเมลฉบับนี้ส่งอัตโนมัติ กรุณาอย่าตอบกลับ<br>
หากคุณไม่ได้เป็นผู้ดำเนินการ กรุณาแจ้งฝ่ายเทคโนโลยีสารสนเทศทันที
</div></div></body></html>`;
}

function button(url, label) {
  return `<p style="margin:22px 0"><a href="${url}"
style="display:inline-block;background:#ee0b3f;color:#fff;text-decoration:none;
padding:12px 22px;border-radius:8px;font-weight:600">${label}</a></p>
<p style="font-size:12px;color:#6d6a74;word-break:break-all">
ถ้าปุ่มกดไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์<br>${url}</p>`;
}

/** เชิญเข้าใช้งานครั้งแรก พร้อมลิงก์ตั้งรหัสผ่าน */
function invite(name, url) {
  return {
    subject: 'เชิญเข้าใช้งาน Orbit — กรุณาตั้งรหัสผ่าน',
    html: shell('ยินดีต้อนรับสู่ Orbit', `
<p>สวัสดีคุณ${escapeHtml(name)}</p>
<p>ฝ่ายเทคโนโลยีสารสนเทศได้เปิดสิทธิ์ให้คุณเข้าใช้งาน Orbit แล้ว
กรุณากดปุ่มด้านล่างเพื่อตั้งรหัสผ่านของคุณเอง</p>
${button(url, 'ตั้งรหัสผ่าน')}
<p style="font-size:13px;color:#6d6a74">ลิงก์นี้ใช้ได้ครั้งเดียวและหมดอายุใน 24 ชั่วโมง</p>`)
  };
}

/** ลืมรหัสผ่าน */
function reset(name, url) {
  return {
    subject: 'ตั้งรหัสผ่านใหม่สำหรับ Orbit',
    html: shell('ตั้งรหัสผ่านใหม่', `
<p>สวัสดีคุณ${escapeHtml(name)}</p>
<p>เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ กดปุ่มด้านล่างเพื่อดำเนินการต่อ</p>
${button(url, 'ตั้งรหัสผ่านใหม่')}
<p style="font-size:13px;color:#6d6a74">ลิงก์นี้ใช้ได้ครั้งเดียวและหมดอายุใน 1 ชั่วโมง<br>
<b>ถ้าคุณไม่ได้เป็นผู้ขอ ไม่ต้องทำอะไร</b> รหัสผ่านเดิมยังใช้ได้ตามปกติ</p>`)
  };
}

/** แจ้งหลังเปลี่ยนรหัสสำเร็จ — ไม่มีลิงก์ให้กด เพื่อไม่ให้ถูกใช้หลอกลวง */
function changed(name, whenText, ipText) {
  return {
    subject: 'รหัสผ่าน Orbit ของคุณถูกเปลี่ยนแล้ว',
    html: shell('รหัสผ่านของคุณถูกเปลี่ยนแล้ว', `
<p>สวัสดีคุณ${escapeHtml(name)}</p>
<p>รหัสผ่านสำหรับเข้าใช้งาน Orbit ของคุณถูกเปลี่ยนเมื่อ <b>${escapeHtml(whenText)}</b>
${ipText ? 'จากหมายเลข ' + escapeHtml(ipText) : ''}</p>
<p>อุปกรณ์ทั้งหมดที่เคยเข้าสู่ระบบไว้ถูกให้ออกจากระบบแล้ว
กรุณาเข้าสู่ระบบใหม่ด้วยรหัสผ่านล่าสุด</p>
<div style="background:#fbf2e2;border-left:3px solid #8a5a00;padding:12px 14px;margin-top:18px">
<b style="color:#8a5a00">ถ้าคุณไม่ได้เป็นผู้เปลี่ยน</b><br>
กรุณาแจ้งฝ่ายเทคโนโลยีสารสนเทศทันที บัญชีของคุณอาจถูกผู้อื่นเข้าถึง
</div>`)
  };
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  send,
  templates: { invite, reset, changed },
  enabled: () => !!(process.env.MAIL_FROM && process.env.AAD_CLIENT_SECRET)
};

/* Orbit — ชุดไอคอน
 *
 * SVG เส้นล้วน 16px ใช้ currentColor ทั้งหมด จึงเปลี่ยนสีตามข้อความที่ครอบอยู่เอง
 * แทนอีโมจิที่ใช้อยู่เดิม — อีโมจิเรนเดอร์ต่างกันทุกระบบและทำให้หน้าตาดูไม่เป็นทางการ
 */
(function (global) {
  'use strict';

  var P = {
    /* นำทาง */
    check:      'M13.5 4.5 6 12 2.5 8.5',
    checkCircle:'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z|M5.2 8.2 7 10l3.8-4',
    bell:       'M8 2a4 4 0 0 0-4 4v2.5L2.8 11h10.4L12 8.5V6a4 4 0 0 0-4-4z|M6.4 13a1.7 1.7 0 0 0 3.2 0',
    calendar:   'M3 4h10v9.5H3z|M3 6.8h10|M5.6 2.3v2.6|M10.4 2.3v2.6',
    users:      'M6 8a2.4 2.4 0 1 0 0-4.8A2.4 2.4 0 0 0 6 8z|M1.6 13.6c0-2 2-3.4 4.4-3.4s4.4 1.4 4.4 3.4|M10.6 3.6a2.2 2.2 0 0 1 0 4.3|M12 10.4c1.5.4 2.5 1.4 2.5 2.6',
    settings:   'M8 10.1a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2z|M13 8c0-.4 0-.7-.1-1l1.3-1-1.4-2.4-1.6.5a5 5 0 0 0-1.7-1L9.2 1.4H6.4L6.1 3a5 5 0 0 0-1.7 1l-1.6-.5L1.4 6l1.3 1a5.6 5.6 0 0 0 0 2l-1.3 1 1.4 2.4 1.6-.5a5 5 0 0 0 1.7 1l.3 1.6h2.8l.3-1.6a5 5 0 0 0 1.7-1l1.6.5 1.4-2.4-1.3-1c.1-.3.1-.6.1-1z',
    keyboard:   'M1.8 4h12.4v8H1.8z|M4 6.4h.01|M6.5 6.4h.01|M9 6.4h.01|M11.5 6.4h.01|M4.6 9.4h6.8',
    archive:    'M2 3.2h12v2.4H2z|M3 5.6h10V13H3z|M6.4 8.4h3.2',

    /* งาน */
    plus:       'M8 3.2v9.6|M3.2 8h9.6',
    close:      'M4 4l8 8|M12 4l-8 8',
    more:       'M3.6 8h.01|M8 8h.01|M12.4 8h.01',
    trash:      'M2.8 4.4h10.4|M6 4.4V2.8h4v1.6|M4.2 4.4 4.8 13.4h6.4l.6-9',
    pencil:     'M11.2 2.6 13.4 4.8 5.6 12.6 2.6 13.4l.8-3z',
    copy:       'M5.6 5.6h8v8h-8z|M2.4 10.4V2.4h8',
    link:       'M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.3-2.3a2.6 2.6 0 0 0-3.7-3.7l-1 1|M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.4 8.9a2.6 2.6 0 0 0 3.7 3.7l1-1',
    paperclip:  'M12.6 7.5 7.8 12.3a3 3 0 0 1-4.2-4.2l5.2-5.2a2 2 0 0 1 2.8 2.8L6.4 10.7a1 1 0 0 1-1.4-1.4l4.6-4.6',
    heart:      'M8 13.4S2.2 10 2.2 6.2a2.9 2.9 0 0 1 5.8-1 2.9 2.9 0 0 1 5.8 1c0 3.8-5.8 7.2-5.8 7.2z',
    star:       'M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4-2.9-2.8 4-.6z',
    flag:       'M4 14V2.6|M4 3.2h7.8l-1.4 2.6 1.4 2.6H4',
    diamond:    'M8 2.2 13.8 8 8 13.8 2.2 8z',
    repeat:     'M3 6.4a4.4 4.4 0 0 1 7.8-2.2|M13 9.6a4.4 4.4 0 0 1-7.8 2.2|M10.4 2v2.4h2.4|M5.6 14v-2.4H3.2',
    blocked:    'M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8z|M3.8 3.8l8.4 8.4',
    subtask:    'M4 3.4h8|M6.4 8h5.6|M6.4 12.6h5.6|M4 6.6v6',
    filter:     'M2.4 3.4h11.2l-4.3 5v4.4l-2.6 1.2V8.4z',
    text:       'M3.4 5.2V3.4h9.2v1.8|M8 3.4V13|M5.8 13h4.4',
    hash:       'M6 2.6 4.6 13.4|M11.4 2.6 10 13.4|M2.6 5.8h10.6|M2.2 10.2h10.6',

    /* ทิศทาง */
    chevronDown:'M4 6.2 8 10l4-3.8',
    chevronRight:'M6.2 3.6 10 8l-3.8 4.4',
    arrowUp:    'M8 12.6V3.4|M4.4 7 8 3.4 11.6 7',
    arrowDown:  'M8 3.4v9.2|M4.4 9 8 12.6 11.6 9',
    arrowLeft:  'M12.6 8H3.4|M7 4.4 3.4 8 7 11.6',
    arrowRight: 'M3.4 8h9.2|M9 4.4 12.6 8 9 11.6',
    menu:       'M2.4 4.4h11.2|M2.4 8h11.2|M2.4 11.6h11.2',
    search:     'M7.2 12a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6z|M10.8 10.8 14 14',
    send:       'M14 2 2 7.2l4.8 1.8L8.6 14z|M6.8 9 14 2',

    /* บัญชีและการซิงก์ */
    cloud:      'M4.8 12.6a3.1 3.1 0 0 1 .3-6.2 4.1 4.1 0 0 1 7.7 1 2.7 2.7 0 0 1-.4 5.2z',
    cloudCheck: 'M4.8 11.4a3.1 3.1 0 0 1 .3-6.2 4.1 4.1 0 0 1 7.7 1 2.7 2.7 0 0 1-.4 5.2|M5.6 12.6 7.2 14.2l3.4-3.4',
    cloudOff:   'M4.8 12.6a3.1 3.1 0 0 1 .3-6.2 4.1 4.1 0 0 1 3.3-1.9|M12.1 6.5a2.7 2.7 0 0 1 .3 6.1H7.4|M2.6 2.6l10.8 10.8',
    alert:      'M8 2.4 14.6 13.6H1.4z|M8 6.6v3.1|M8 11.6h.01',
    signIn:     'M9.6 2.4h3.2a1 1 0 0 1 1 1v9.2a1 1 0 0 1-1 1H9.6|M6.8 11.2 10 8 6.8 4.8|M10 8H2.4',
    signOut:    'M6.4 2.4H3.2a1 1 0 0 0-1 1v9.2a1 1 0 0 0 1 1h3.2|M11.2 11.2 14.4 8l-3.2-3.2|M14.4 8H6',
    shield:     'M8 1.8 13.4 4v4.2c0 3.2-2.3 5.5-5.4 6.4-3.1-.9-5.4-3.2-5.4-6.4V4z|M5.8 8.1 7.4 9.7l3-3.2',
    building:   'M3.2 14V3.2A1 1 0 0 1 4.2 2.2h5a1 1 0 0 1 1 1V14|M10.2 6.4h2.6a1 1 0 0 1 1 1V14|M2 14h12|M5.6 5.2h1.4|M5.6 8h1.4|M5.6 10.8h1.4',
    home:       'M2.4 7.2 8 2.4l5.6 4.8V13a.8.8 0 0 1-.8.8H3.2a.8.8 0 0 1-.8-.8z|M6.4 13.8V9.2h3.2v4.6',
    grid:       'M2.6 2.6h4.6v4.6H2.6z|M8.8 2.6h4.6v4.6H8.8z|M2.6 8.8h4.6v4.6H2.6z|M8.8 8.8h4.6v4.6H8.8z'
  };

  /** คืน SVG หนึ่งตัว — size เป็น px, cls ใส่คลาสเพิ่มได้ */
  function icon(name, size, cls) {
    var d = P[name];
    if (!d) return '';
    var s = size || 16;
    var paths = d.split('|').map(function (seg) {
      return '<path d="' + seg + '"/>';
    }).join('');
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" width="' + s + '" height="' + s +
      '" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  /** ไอคอนทึบ ใช้กับหมุดหมายและหัวใจที่กดแล้ว */
  function iconFilled(name, size, cls) {
    var d = P[name];
    if (!d) return '';
    var s = size || 16;
    var paths = d.split('|').map(function (seg) {
      return '<path d="' + seg + '"/>';
    }).join('');
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" width="' + s + '" height="' + s +
      '" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.2" ' +
      'stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  global.Icons = { icon: icon, iconFilled: iconFilled, has: function (n) { return !!P[n]; } };

})(window);

/* ---------- โลโก้ ----------
 * วาดใหม่เป็น SVG จากโลโก้ต้นฉบับ: วงแหวนขาว + วงโคจรพาดเฉียง + ดวงกลมเรืองแสง
 * บนพื้นแดงไล่เฉด — คมทุกขนาดและไม่ต้องพึ่งไฟล์ภาพภายนอก
 */
(function (global) {
  'use strict';

  /** id ต้องไม่ซ้ำเมื่อวางโลโก้หลายจุดในหน้าเดียว */
  var seq = 0;

  function logoMark(size) {
    var s = size || 26;
    var n = 'ob' + (++seq);
    return '<svg class="brand-mark" width="' + s + '" height="' + s +
      '" viewBox="0 0 32 32" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="' + n + 'bg" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="#F10B26"/>' +
          '<stop offset="1" stop-color="#E2176E"/>' +
        '</linearGradient>' +
        '<linearGradient id="' + n + 'dot" x1="0.3" y1="0" x2="0.7" y2="1">' +
          '<stop offset="0" stop-color="#ffffff"/>' +
          '<stop offset="1" stop-color="#FF93BE"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<rect width="32" height="32" rx="8" fill="url(#' + n + 'bg)"/>' +
      '<circle cx="16" cy="16.8" r="7.5" fill="none" stroke="#fff" stroke-width="2.9"/>' +
      '<ellipse cx="16" cy="16.8" rx="11.4" ry="4.3" fill="none" stroke="#fff" ' +
        'stroke-width="2" transform="rotate(-24 16 16.8)"/>' +
      '<circle cx="24.6" cy="7.7" r="2.75" fill="url(#' + n + 'dot)"/>' +
      '</svg>';
  }

  /** ตราสัญลักษณ์พร้อมชื่อ ใช้บนหัวแถบซ้าย */
  function logoLockup(size) {
    return '<span class="brand-lockup">' + logoMark(size) +
      '<span class="brand-word">ORBIT</span></span>';
  }

  global.Icons.logoMark = logoMark;
  global.Icons.logoLockup = logoLockup;

})(window);

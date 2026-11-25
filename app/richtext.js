/* Orbit — ข้อความมีรูปแบบ (รายละเอียดงาน ความเห็น)
 *
 * สิ่งที่เก็บลงข้อมูลคือมาร์กดาวน์ย่อชุดเดียวกับที่ความเห็นใช้มาตลอด (ดูหัวข้อใน store.js)
 * ไฟล์นี้ทำสามอย่าง
 *   toHtml    แปลงข้อความที่เก็บไว้เป็น HTML สำหรับแสดงผล หรือสำหรับใส่ในตัวแก้ไข
 *   fromNode  อ่านหน้าจอของตัวแก้ไข (หรือ HTML ที่วางมาจากที่อื่น) กลับเป็นข้อความที่เก็บได้
 *   ตัวแก้ไข  contenteditable + แถบเครื่องมือ คีย์ลัด จัดรูปแบบอัตโนมัติ และ @ อ้างถึง
 *
 * ความปลอดภัย: ไม่มี HTML ของผู้ใช้ไปถึงหน้าจอตรง ๆ เลย
 * ทุกอย่างถูกแปลงเป็นข้อความก่อน แล้วค่อยสร้างแท็กจากชุดที่เรากำหนดเองหลังกันอักขระแล้ว
 * HTML ที่วางเข้ามาก็อ่านผ่าน DOMParser ซึ่งไม่รันสคริปต์และไม่โหลดรูป แล้วเหลือแค่ข้อความ
 */
(function (global) {
  'use strict';

  var S = global.Store, L = global.I18N.t;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function icon(name, size) {
    return global.Icons ? global.Icons.icon(name, size) : '';
  }

  var REF_RE = /@\[([^\]\n]{1,200})\]\(([tp]_[A-Za-z0-9_]+)\)/g;
  var LINK_RE = /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g;
  var URL_RE = /https?:\/\/[^\s<>\u0001\u0002]+/g;

  function safeUrl(u) { return /^(https?:\/\/|mailto:)/i.test(u || '') ? u : ''; }

  function anchor(url, text) {
    var u = safeUrl(url);
    if (!u) return esc(text);
    return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(text) + '</a>';
  }

  /* ชื่อยาวก่อน — "@สมชาย ใจดี" ต้องจับได้ก่อน "@สมชาย" ไม่งั้นนามสกุลจะหลุดออกมาเป็นข้อความเปล่า */
  function usersByLength() {
    return (S.db.users || []).filter(function (u) { return u.name; })
      .slice().sort(function (a, b) { return b.name.length - a.name.length; });
  }

  function personHtml(u, editable) {
    if (editable) {
      return '<span class="mchip mchip-user" contenteditable="false" data-user="' + esc(u.id) +
        '">@' + esc(u.name) + '</span>';
    }
    return '<span class="men">@' + esc(u.name) + '</span>';
  }

  /** ป้ายอ้างถึงงาน/โปรเจกต์ — ชื่อดึงจากของจริงเสมอ เปลี่ยนชื่องานแล้วป้ายเปลี่ยนตาม
   *  ถ้าคนอ่านไม่มีสิทธิ์เห็นของชิ้นนั้น ใช้ชื่อตอนที่เขียนไว้ และกดเข้าไม่ได้ */
  function refHtml(label, id, editable) {
    var isTask = id.charAt(0) === 't';
    var obj = isTask ? S.task(id) : S.project(id);
    var visible = !!obj && (isTask ? (!S.canSeeTask || S.canSeeTask(id)) : !!S.projectAccess(id));
    var name = visible ? obj.name : label;
    var cls = 'mchip ' + (isTask ? 'mchip-task' : 'mchip-proj') +
      (isTask && visible && obj.completed ? ' done' : '') + (visible ? '' : ' gone');
    var act = !visible ? '' : isTask
      ? ' data-act="open-task" data-id="' + esc(id) + '"'
      : ' data-act="go" data-route="project" data-id="' + esc(id) + '"';
    var mark = isTask
      ? '<span class="mi">' + (visible && obj.completed ? '✓' : '○') + '</span>'
      : '<span class="mi sw" style="background:' + esc(visible ? obj.color : 'var(--fg-faint)') + '"></span>';
    return '<span class="' + cls + '"' + (editable ? ' contenteditable="false"' : '') +
      ' data-ref="' + esc(id) + '" data-label="' + esc(name) + '"' + act +
      ' title="' + esc(name) + '">' + mark + esc(name) + '</span>';
  }

  /* ---------- ข้อความ → HTML ---------- */

  /** หนึ่งบรรทัด — แยกส่วนที่ห้ามตีความ (โค้ด ลิงก์ ป้ายอ้างถึง ชื่อคน) ออกไปก่อน
   *  แล้วค่อยกันอักขระส่วนที่เหลือ จากนั้นจึงใส่ตัวหนา ตัวเอียง ฯลฯ */
  function inline(raw, editable) {
    var toks = [];
    function ph(html) { toks.push(html); return '\u0001' + (toks.length - 1) + '\u0002'; }
    var s = String(raw == null ? '' : raw);

    s = s.replace(/`([^`\n]+)`/g, function (m, c) { return ph('<code>' + esc(c) + '</code>'); });
    s = s.replace(REF_RE, function (m, label, id) { return ph(refHtml(label, id, editable)); });
    s = s.replace(LINK_RE, function (m, text, url) { return ph(anchor(url, text)); });
    s = s.replace(URL_RE, function (m) {
      var tail = (m.match(/[.,;:!?)\]]+$/) || [''])[0];
      var url = tail ? m.slice(0, -tail.length) : m;
      return ph(anchor(url, url)) + tail;
    });
    usersByLength().forEach(function (u) {
      var needle = '@' + u.name;
      if (s.indexOf(needle) < 0) return;
      s = s.split(needle).join(ph(personHtml(u, editable)));
    });

    s = esc(s);
    s = s.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '<b>$1</b>');
    s = s.replace(/~~(?=\S)([^~\n]*?\S)~~/g, '<s>$1</s>');
    s = s.replace(/\+\+(?=\S)([^+\n]*?\S)\+\+/g, '<u>$1</u>');
    s = s.replace(/(^|[\s(>\u0002])\*(?=[^\s*])([^*\n]*?[^\s*])?\*(?![\w*])/g, function (m, pre, body) {
      return body === undefined ? m : pre + '<i>' + body + '</i>';
    });
    return s.replace(/\u0001(\d+)\u0002/g, function (m, n) { return toks[+n]; });
  }

  /**
   * @param opts.editable  ใช้ใส่ในตัวแก้ไข — ทุกบรรทัดเป็น div และป้ายแก้ทีละตัวอักษรไม่ได้
   */
  function toHtml(md, opts) {
    var editable = !!(opts && opts.editable);
    var lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
    var h = '', stack = [];

    function closeLevel() { var lv = stack.pop(); h += '</li></' + lv.type + '>'; }
    function closeAll() { while (stack.length) closeLevel(); }

    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      var m = line.match(/^([ \t]*)([-*•]|\d{1,3}[.)])\s+(.*)$/);
      if (m) {
        var depth = Math.min(Math.floor(m[1].replace(/\t/g, '  ').length / 2), 3);
        var type = /\d/.test(m[2]) ? 'ol' : 'ul';
        while (stack.length && stack[stack.length - 1].depth > depth) closeLevel();
        var top = stack[stack.length - 1];
        if (top && top.depth === depth && top.type !== type) { closeLevel(); top = stack[stack.length - 1]; }
        if (top && top.depth === depth) h += '</li>';
        else { h += '<' + type + '>'; stack.push({ type: type, depth: depth }); }
        h += '<li>' + (inline(m[3], editable) || (editable ? '<br>' : ''));
        return;
      }
      closeAll();
      if (!line.trim()) { h += editable ? '<div><br></div>' : '<div class="rt-gap"></div>'; return; }
      /* หัวข้อแบบ # ใช้บ่อยเวลาวางสรุปประชุมมาจากที่อื่น */
      var hd = line.match(/^#{1,3}\s+(.*)$/);
      if (hd) {
        h += editable ? '<h3>' + inline(hd[1], true) + '</h3>'
                      : '<div class="rt-h">' + inline(hd[1]) + '</div>';
        return;
      }
      h += '<div>' + inline(line, editable) + '</div>';
    });
    closeAll();
    return editable ? h : '<div class="rt">' + h + '</div>';
  }

  /* ---------- หน้าจอ → ข้อความ ---------- */

  var BLOCK = /^(DIV|P|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER|ASIDE|NAV|TABLE|THEAD|TBODY|TFOOT|TR|DL|DT|DD|FIGURE|HR|ADDRESS|MAIN)$/;
  var SKIP = /^(SCRIPT|STYLE|META|LINK|TITLE|HEAD|TEMPLATE|NOSCRIPT|IMG|SVG|IFRAME|OBJECT|VIDEO|AUDIO|CANVAS|BUTTON|INPUT|SELECT|TEXTAREA)$/;
  var MARK = { B: '**', STRONG: '**', I: '*', EM: '*', U: '++', INS: '++', S: '~~', STRIKE: '~~', DEL: '~~' };

  /** HTML ที่วางมาจาก Google Docs / Word ใส่ตัวหนาตัวเอียงไว้ที่ style ไม่ใช่แท็ก */
  function markOf(n) {
    var st = (n.getAttribute && n.getAttribute('style')) || '';
    var tag = n.nodeName;
    /* Google Docs ห่อทั้งก้อนด้วย <b style="font-weight:normal"> ต้องไม่นับเป็นตัวหนา */
    if ((tag === 'B' || tag === 'STRONG') && /font-weight\s*:\s*(normal|[1-4]00)\b/i.test(st)) return '';
    if (MARK[tag]) return MARK[tag];
    if (/font-weight\s*:\s*(bold|[6-9]00)\b/i.test(st)) return '**';
    if (/font-style\s*:\s*italic/i.test(st)) return '*';
    if (/text-decoration[^;]*line-through/i.test(st)) return '~~';
    if (/text-decoration[^;]*underline/i.test(st)) return '++';
    return '';
  }

  function fromNode(root) {
    var out = [], buf = '', prefix = '', open = false, marks = [];

    function endLine() {
      if (open) out.push(prefix + buf.replace(/^[ \t]+/, '').replace(/\s+$/, ''));
      buf = ''; prefix = ''; open = false;
    }
    function text(t) { buf += t; open = true; }
    /* เริ่มบล็อกใหม่ — ถ้าบรรทัดที่เปิดค้างอยู่ยังว่างเพราะเป็นแค่กล่องห่อ (<div><ul>…)
     * ทิ้งมันไป ไม่งั้นจะได้บรรทัดว่างเกินมาหนึ่งบรรทัดทุกครั้งที่บล็อกซ้อนกัน
     * บรรทัดว่างจริง (<div><br></div>) ยังอยู่ เพราะถูกเก็บตอนปิดบล็อก ไม่ใช่ตอนเปิด */
    function startBlock() {
      if (open && !prefix && !buf.trim()) { open = false; buf = ''; }
      else endLine();
    }
    function isLast(n) {
      for (var x = n.nextSibling; x; x = x.nextSibling) {
        if (x.nodeType === 3 && !x.nodeValue.replace(/[\s​﻿]/g, '')) continue;
        return false;
      }
      return true;
    }
    function indent(d) { return new Array(Math.min(d, 3) + 1).join('  '); }

    function walk(node, depth) {
      for (var c = node.firstChild; c; c = c.nextSibling) visit(c, depth);
    }

    function list(n, depth) {
      startBlock();
      var d = depth + 1, num = 1, ordered = n.nodeName === 'OL';
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3 && !c.nodeValue.trim()) continue;
        if (c.nodeName === 'UL' || c.nodeName === 'OL') { list(c, d); continue; }
        endLine();
        prefix = indent(d) + (ordered ? (num++) + '. ' : '- ');
        open = true;
        if (c.nodeType === 1) walk(c, d); else visit(c, d);
        endLine();
      }
    }

    function visit(n, depth) {
      if (n.nodeType === 3) {
        var v = n.nodeValue.replace(/[​﻿]/g, '').replace(/[\r\n\t ]+/g, ' ')
          .replace(/ /g, ' ');
        if (v) text(v);
        return;
      }
      if (n.nodeType !== 1) return;
      var tag = n.nodeName;
      if (SKIP.test(tag)) return;

      if (n.classList && n.classList.contains('mchip')) {
        if (n.getAttribute('data-ref')) {
          var label = (n.getAttribute('data-label') || n.textContent).replace(/[\]\n]/g, '').trim();
          text('@[' + label + '](' + n.getAttribute('data-ref') + ')');
        } else if (n.getAttribute('data-user')) {
          var u = S.user(n.getAttribute('data-user'));
          text('@' + (u ? u.name : n.textContent.replace(/^@/, '')));
        } else text(n.textContent);
        return;
      }
      if (tag === 'BR') {
        if (isLast(n)) return;          // <div>ข้อความ<br></div> คือบรรทัดเดียว ไม่ใช่สอง
        endLine(); open = true;
        return;
      }
      if (tag === 'UL' || tag === 'OL') { list(n, depth); return; }
      if (/^H[1-6]$/.test(tag)) {
        startBlock(); prefix = '# '; open = true;
        walk(n, depth); endLine();
        return;
      }
      if (BLOCK.test(tag)) {
        /* <li><p>ข้อความ</p></li> ที่วางมาจาก Docs — อย่าทิ้งหัวข้อย่อยไว้เป็นบรรทัดว่าง */
        if (!(open && prefix && !buf.trim())) { startBlock(); open = true; }
        walk(n, depth);
        endLine();
        return;
      }
      if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP') {
        var ct = n.textContent.replace(/`/g, "'").replace(/\s+/g, ' ');
        if (ct.trim()) text('`' + ct + '`');
        return;
      }
      if (tag === 'A') {
        var href = n.getAttribute('href') || '';
        var lt = n.textContent.replace(/\s+/g, ' ').trim();
        if (safeUrl(href)) {
          text(!lt || lt === href ? href
            : '[' + lt.replace(/[\[\]]/g, '') + '](' + href.replace(/\)/g, '%29').replace(/\s/g, '%20') + ')');
        } else walk(n, depth);
        return;
      }
      var mark = markOf(n);
      if (mark && marks.indexOf(mark) < 0) {
        var before = buf;
        buf = '';
        marks.push(mark);
        walk(n, depth);
        marks.pop();
        var inner = buf;
        buf = before;
        if (inner.trim()) {
          var mm = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
          text(mm[1] + mark + mm[2] + mark + mm[3]);
        } else if (inner) text(inner);
        return;
      }
      if (tag === 'TD' || tag === 'TH') { walk(n, depth); text(' '); return; }
      walk(n, depth);
    }

    walk(root, -1);
    endLine();
    while (out.length && !out[out.length - 1].trim()) out.pop();
    while (out.length && !out[0].trim()) out.shift();
    return out.join('\n');
  }

  /* ---------- แถบเครื่องมือ ---------- */

  function toolbar(mini) {
    var B = [
      ['bold', '<b>B</b>', L('ตัวหนา'), 'Ctrl+B'],
      ['italic', '<i>I</i>', L('ตัวเอียง'), 'Ctrl+I'],
      ['underline', '<u>U</u>', L('ขีดเส้นใต้'), 'Ctrl+U'],
      ['strike', '<s>S</s>', L('ขีดฆ่า'), 'Ctrl+Shift+X'],
      ['code', '&lt;/&gt;', L('โค้ด'), 'Ctrl+Shift+M'],
      ['ul', '•&#8201;≡', L('หัวข้อย่อย'), 'Ctrl+Shift+8'],
      ['ol', '1.≡', L('ลำดับเลข'), 'Ctrl+Shift+7'],
      ['h', 'H', L('หัวข้อ'), ''],
      ['link', icon('link', 13), L('ลิงก์'), 'Ctrl+K'],
      ['mention', '@', L('อ้างถึงคน งาน หรือโปรเจกต์'), '@']
    ];
    var h = '<div class="rte-bar' + (mini ? ' mini' : '') + '">';
    B.forEach(function (b) {
      if (mini && (b[0] === 'underline' || b[0] === 'h')) return;
      h += '<button type="button" tabindex="-1" class="rte-b" data-rte="' + b[0] + '" title="' +
        esc(b[2] + (b[3] ? ' (' + b[3] + ')' : '')) + '">' + b[1] + '</button>';
    });
    return h + '</div>';
  }

  /* ---------- ตำแหน่งเคอร์เซอร์ ----------
   * นับเป็นจำนวนตัวอักษรจากต้นตัวแก้ไข ใช้คืนตำแหน่งหลังหน้าจอถูกวาดใหม่
   * หรือหลังหน้าต่างถามลิงก์ปิดลง เพราะโหนดเดิมอาจไม่อยู่แล้ว */

  function caretOffsets(ed) {
    var sel = global.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var r = sel.getRangeAt(0);
    if (!ed.contains(r.startContainer)) return null;
    var pre = document.createRange();
    pre.selectNodeContents(ed);
    pre.setEnd(r.startContainer, r.startOffset);
    var start = pre.toString().length;
    pre.setEnd(r.endContainer, r.endOffset);
    return { start: start, end: pre.toString().length };
  }

  function pointAt(ed, n) {
    var w = document.createTreeWalker(ed, 4 /* SHOW_TEXT */, null, false), t, acc = 0;
    while ((t = w.nextNode())) {
      var len = t.nodeValue.length;
      if (acc + len >= n) {
        var chip = t.parentNode && t.parentNode.closest ? t.parentNode.closest('.mchip') : null;
        if (chip && ed.contains(chip)) return { after: chip };
        return { node: t, off: n - acc };
      }
      acc += len;
    }
    return null;
  }

  function setPoint(r, p, ed, isStart) {
    if (!p) { var e2 = document.createRange(); e2.selectNodeContents(ed); e2.collapse(false);
      if (isStart) r.setStart(e2.startContainer, e2.startOffset); else r.setEnd(e2.endContainer, e2.endOffset); return; }
    if (p.after) { if (isStart) r.setStartAfter(p.after); else r.setEndAfter(p.after); return; }
    if (isStart) r.setStart(p.node, p.off); else r.setEnd(p.node, p.off);
  }

  function setOffsets(ed, off) {
    if (!off) return focusEnd(ed);
    var r = document.createRange();
    r.selectNodeContents(ed);
    setPoint(r, pointAt(ed, off.start), ed, true);
    setPoint(r, pointAt(ed, off.end), ed, false);
    var sel = global.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function focusEnd(ed) {
    if (!ed) return;
    ed.focus();
    var r = document.createRange();
    r.selectNodeContents(ed);
    r.collapse(false);
    var sel = global.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  /* ---------- ตัวแก้ไข ---------- */

  function editorOf(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentNode);
    if (!el || !el.closest) return null;
    var ed = el.closest('.rte');
    return ed && ed.isContentEditable ? ed : null;
  }
  function exec(cmd, val) {
    try { document.execCommand(cmd, false, val == null ? null : val); } catch (e) {}
  }
  function fire(ed) {
    try { ed.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
  }
  function closestIn(ed, node, sel) {
    var el = node && (node.nodeType === 1 ? node : node.parentNode);
    var hit = el && el.closest ? el.closest(sel) : null;
    return hit && ed.contains(hit) ? hit : null;
  }
  function selNode() {
    var sel = global.getSelection();
    return sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
  }

  function toggleCode(ed) {
    var sel = global.getSelection();
    if (!sel || !sel.rangeCount) return;
    var code = closestIn(ed, selNode(), 'code');
    if (code) {
      code.parentNode.replaceChild(document.createTextNode(code.textContent), code);
      fire(ed);
      return;
    }
    if (sel.isCollapsed) return;
    var txt = sel.toString().replace(/\n+/g, ' ');
    if (!txt.trim()) return;
    exec('insertHTML', '<code>' + esc(txt) + '</code>&#8203;');
  }

  function toggleHeading(ed) {
    var hd = closestIn(ed, selNode(), 'h1,h2,h3,h4,h5,h6');
    exec('formatBlock', hd ? 'div' : 'h3');
  }

  function askLink(ed) {
    var off = caretOffsets(ed);
    var a = closestIn(ed, selNode(), 'a');
    var key = ed.getAttribute('data-key');
    var ask = RT.ask || function (t, v, cb) { cb(null); };
    ask(L('ใส่ลิงก์'), a ? a.getAttribute('href') : 'https://', function (url) {
      var ed2 = (key && document.querySelector('.rte[data-key="' + key + '"]')) || ed;
      if (!document.body.contains(ed2)) return;
      ed2.focus();
      setOffsets(ed2, off);
      url = (url || '').trim();
      if (!url || url === 'https://') { if (a) exec('unlink'); fire(ed2); return; }
      if (!/^(https?:\/\/|mailto:)/i.test(url)) url = 'https://' + url;
      if (!off || off.start === off.end) {
        exec('insertHTML', '<a href="' + esc(url) + '">' + esc(url) + '</a>&nbsp;');
      } else {
        exec('createLink', url);
      }
      fire(ed2);
    });
  }

  function run(ed, cmd) {
    ed.focus();
    switch (cmd) {
      case 'bold': exec('bold'); break;
      case 'italic': exec('italic'); break;
      case 'underline': exec('underline'); break;
      case 'strike': exec('strikeThrough'); break;
      case 'code': toggleCode(ed); break;
      case 'ul': exec('insertUnorderedList'); break;
      case 'ol': exec('insertOrderedList'); break;
      case 'h': toggleHeading(ed); break;
      case 'link': askLink(ed); return;
      case 'mention': {
        var n = selNode();
        var prev = n && n.nodeType === 3 ? n.nodeValue.slice(0, global.getSelection().getRangeAt(0).startOffset) : '';
        exec('insertText', (prev && !/\s$/.test(prev) ? ' ' : '') + '@');
        checkMention(ed);
        return;
      }
    }
    syncBar(ed);
  }

  /** ไฮไลต์ปุ่มที่ตรงกับตำแหน่งเคอร์เซอร์ จะได้รู้ว่ากดตัวหนาไปแล้วหรือยัง */
  function syncBar(ed) {
    var wrap = ed && ed.closest('.rte-wrap');
    if (!wrap) return;
    ['bold', 'italic', 'underline', 'strikeThrough'].forEach(function (c, i) {
      var b = wrap.querySelector('[data-rte="' + ['bold', 'italic', 'underline', 'strike'][i] + '"]');
      var on = false;
      try { on = document.queryCommandState(c); } catch (e) {}
      if (b) b.classList.toggle('on', !!on);
    });
  }

  /** ข้อความจากต้นบรรทัดถึงเคอร์เซอร์ — ใช้ตัดสินจัดรูปแบบอัตโนมัติ (* ␣, 1. ␣, # ␣) */
  function lineHead(ed) {
    var sel = global.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
    var r = sel.getRangeAt(0), node = r.startContainer;
    if (node.nodeType !== 3) return null;
    if (closestIn(ed, node, 'li,h1,h2,h3,pre,code')) return null;
    var p = node.previousSibling;
    while (p && p.nodeType === 3 && !p.nodeValue) p = p.previousSibling;
    if (p && !(p.nodeType === 1 && /^(BR|DIV|P|H[1-6]|UL|OL)$/.test(p.nodeName))) return null;
    var par = node.parentNode;
    if (par !== ed && !/^(DIV|P)$/.test(par.nodeName)) return null;
    return { node: node, off: r.startOffset, text: node.nodeValue.slice(0, r.startOffset) };
  }

  function autoFormat(ed, e) {
    var head = lineHead(ed);
    if (!head) return false;
    var cmd = null;
    if (head.text === '*' || head.text === '-') cmd = 'insertUnorderedList';
    else if (/^1[.)]$/.test(head.text)) cmd = 'insertOrderedList';
    else if (head.text === '#') cmd = 'h';
    if (!cmd) return false;
    e.preventDefault();
    var r = document.createRange();
    r.setStart(head.node, 0);
    r.setEnd(head.node, head.off);
    var sel = global.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    exec('delete');
    if (cmd === 'h') exec('formatBlock', 'h3'); else exec(cmd);
    return true;
  }

  /* ---------- @ อ้างถึง ---------- */

  var mention = null;

  function candidates(q) {
    var ql = q.toLowerCase().trim();
    var out = [];
    (S.db.users || []).forEach(function (u) {
      if (u.active === false) return;
      if (!ql || u.name.toLowerCase().indexOf(ql) >= 0 ||
          (u.email || '').toLowerCase().indexOf(ql) === 0) out.push({ kind: 'user', id: u.id, name: u.name });
    });
    out = out.slice(0, ql ? 4 : 6);
    if (!ql) return out;
    var projs = (S.visibleProjects ? S.visibleProjects() : S.db.projects).filter(function (p) {
      return !p.archived && p.name.toLowerCase().indexOf(ql) >= 0;
    }).slice(0, 3);
    projs.forEach(function (p) { out.push({ kind: 'project', id: p.id, name: p.name, p: p }); });
    var hits = [];
    for (var i = 0; i < S.db.tasks.length && hits.length < 40; i++) {
      var t = S.db.tasks[i];
      if (t.name.toLowerCase().indexOf(ql) >= 0) hits.push(t);
    }
    hits = hits.filter(function (t) { return !S.canSeeTask || S.canSeeTask(t.id); });
    hits.sort(function (a, b) {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      var sa = a.name.toLowerCase().indexOf(ql) === 0, sb = b.name.toLowerCase().indexOf(ql) === 0;
      return sa === sb ? 0 : (sa ? -1 : 1);
    });
    hits.slice(0, 6).forEach(function (t) { out.push({ kind: 'task', id: t.id, name: t.name, t: t }); });
    return out;
  }

  function closeMention() {
    if (mention && mention.el && mention.el.parentNode) mention.el.parentNode.removeChild(mention.el);
    mention = null;
  }

  function checkMention(ed) {
    var sel = global.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return closeMention();
    var r = sel.getRangeAt(0), node = r.startContainer;
    if (node.nodeType !== 3 || !ed.contains(node) || closestIn(ed, node, 'code')) return closeMention();
    var before = node.nodeValue.slice(0, r.startOffset);
    var m = before.match(/(^|[\s (])@([^@\n]{0,40})$/);
    if (!m) return closeMention();
    var q = m[2].replace(/ /g, ' ');
    var items = candidates(q);
    if (!items.length && /\s/.test(q)) return closeMention();
    var el = mention && mention.el;
    mention = {
      ed: ed, node: node, start: r.startOffset - m[2].length - 1, end: r.startOffset,
      items: items, i: 0, el: el
    };
    drawMention(r);
  }

  function itemHtml(it, i) {
    var lead, sub = '';
    if (it.kind === 'user') {
      lead = global.Render ? global.Render.avatar(S.user(it.id), 'sm') : '@';
    } else if (it.kind === 'project') {
      lead = '<span class="mi sw" style="background:' + esc(it.p.color) + '"></span>';
      sub = L('โปรเจกต์');
    } else {
      lead = '<span class="mi">' + (it.t.completed ? '✓' : '○') + '</span>';
      var homes = S.projectsOfTask(it.id);
      sub = homes.length ? homes[0].project.name : L('งาน');
    }
    return '<button type="button" data-mi="' + i + '" class="' + (i === mention.i ? 'on' : '') + '">' +
      lead + '<span class="grow">' + esc(it.name) + '</span>' +
      (sub ? '<em>' + esc(sub) + '</em>' : '') + '</button>';
  }

  function drawMention(range) {
    if (!mention.el) {
      mention.el = document.createElement('div');
      mention.el.className = 'rte-mention';
      document.body.appendChild(mention.el);
    }
    var h = '';
    if (!mention.items.length) {
      h = '<div class="rte-mention-empty">' + esc(L('ไม่พบคน งาน หรือโปรเจกต์ที่ตรงกัน')) + '</div>';
    } else {
      var last = '';
      mention.items.forEach(function (it, i) {
        if (it.kind !== last) {
          h += '<div class="rte-mention-h">' + esc(it.kind === 'user' ? L('คน')
            : it.kind === 'project' ? L('โปรเจกต์') : L('งาน')) + '</div>';
          last = it.kind;
        }
        h += itemHtml(it, i);
      });
    }
    mention.el.innerHTML = h;
    var rect = range && range.getBoundingClientRect ? range.getBoundingClientRect() : null;
    if (!rect || (!rect.width && !rect.height && !rect.left)) rect = mention.ed.getBoundingClientRect();
    var el = mention.el;
    el.style.left = Math.max(8, Math.min(rect.left, global.innerWidth - el.offsetWidth - 8)) + 'px';
    var top = rect.bottom + 4;
    if (top + el.offsetHeight > global.innerHeight - 8) top = Math.max(8, rect.top - el.offsetHeight - 4);
    el.style.top = top + 'px';
  }

  function chooseMention(i) {
    if (!mention) return;
    var it = mention.items[i];
    var ed = mention.ed, node = mention.node;
    if (!it || !node.parentNode) return closeMention();
    var r = document.createRange();
    r.setStart(node, Math.max(0, mention.start));
    r.setEnd(node, Math.min(node.nodeValue.length, mention.end));
    r.deleteContents();
    var tmp = document.createElement('div');
    tmp.innerHTML = it.kind === 'user' ? personHtml(S.user(it.id), true) : refHtml(it.name, it.id, true);
    var chip = tmp.firstChild;
    var space = document.createTextNode(' ');
    r.insertNode(space);
    r.insertNode(chip);
    var after = document.createRange();
    after.setStartAfter(space);
    after.collapse(true);
    var sel = global.getSelection();
    sel.removeAllRanges();
    sel.addRange(after);
    closeMention();
    ed.focus();
    fire(ed);
  }

  /* ---------- ผูก event ----------
   * ผูกที่ document ครั้งเดียว ตัวแก้ไขถูกวาดใหม่ทุกครั้งที่แผงงานเปลี่ยน
   * ไฟล์นี้โหลดก่อน main.js จึงได้รับ keydown ก่อนเสมอ — Esc ที่ปิดรายการ @
   * ต้องหยุดตรงนี้ ไม่งั้นแผงงานทั้งแผงจะปิดตามไปด้วย */

  document.addEventListener('mousedown', function (e) {
    var b = e.target.closest && e.target.closest('[data-rte]');
    if (b) { e.preventDefault(); return; }
    var mi = e.target.closest && e.target.closest('.rte-mention [data-mi]');
    if (mi) { e.preventDefault(); chooseMention(+mi.getAttribute('data-mi')); return; }
    if (e.target.closest && e.target.closest('.rte-mention')) e.preventDefault();
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-rte]');
    if (!b) return;
    var wrap = b.closest('.rte-wrap');
    var ed = wrap && wrap.querySelector('.rte');
    if (ed && ed.isContentEditable) run(ed, b.getAttribute('data-rte'));
  });

  document.addEventListener('keydown', function (e) {
    var ed = editorOf(e.target);
    if (!ed) return;

    if (mention && mention.ed === ed) {
      var n = mention.items.length;
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); mention.i = (mention.i + 1) % n; drawMention(null); return; }
      if (e.key === 'ArrowUp' && n) { e.preventDefault(); mention.i = (mention.i + n - 1) % n; drawMention(null); return; }
      if ((e.key === 'Enter' || e.key === 'Tab') && n && !e.ctrlKey && !e.metaKey) {
        e.preventDefault(); e.stopImmediatePropagation(); chooseMention(mention.i); return;
      }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeMention(); return; }
    }

    var mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      var c = e.code, cmd = null;
      if (!e.shiftKey && c === 'KeyB') cmd = 'bold';
      else if (!e.shiftKey && c === 'KeyI') cmd = 'italic';
      else if (!e.shiftKey && c === 'KeyU') cmd = 'underline';
      else if (!e.shiftKey && c === 'KeyK') cmd = 'link';
      else if (e.shiftKey && c === 'KeyX') cmd = 'strike';
      else if (e.shiftKey && c === 'KeyM') cmd = 'code';
      else if (e.shiftKey && c === 'Digit8') cmd = 'ul';
      else if (e.shiftKey && c === 'Digit7') cmd = 'ol';
      if (cmd) { e.preventDefault(); run(ed, cmd); return; }
    }

    if (e.key === 'Tab' && !mod && closestIn(ed, selNode(), 'li')) {
      e.preventDefault();
      exec(e.shiftKey ? 'outdent' : 'indent');
      return;
    }
    if (e.key === ' ' && !mod) autoFormat(ed, e);
  }, true);

  document.addEventListener('input', function (e) {
    var ed = editorOf(e.target);
    if (!ed) return;
    /* ลบจนหมดแล้วเบราว์เซอร์ทิ้ง <br> ค้างไว้ ข้อความบอกใบ้จะไม่ขึ้น */
    if (!ed.textContent && !ed.querySelector('.mchip,li') &&
        /^(<br>|<div><br><\/div>)?$/i.test(ed.innerHTML)) ed.innerHTML = '';
    checkMention(ed);
  });

  /* วาง — ไม่ปล่อยให้เบราว์เซอร์ใส่ HTML ของคนอื่นลงมาตรง ๆ
   * HTML (จาก Docs, Word, หน้าเว็บ) อ่านผ่าน DOMParser ซึ่งไม่รันสคริปต์ไม่โหลดรูป
   * แปลงเป็นข้อความรูปแบบเดียวกับที่เก็บ แล้วสร้างหน้าจอใหม่จากข้อความนั้น
   * ข้อความล้วนที่เขียนแบบมาร์กดาวน์ (- หัวข้อ, **หนา**) ก็กลายเป็นรูปแบบจริงทันที */
  document.addEventListener('paste', function (e) {
    var ed = editorOf(e.target);
    if (!ed) return;
    var cd = e.clipboardData;
    if (!cd) return;
    var html = cd.getData('text/html'), txt = cd.getData('text/plain');
    var md = null;
    if (html) {
      try { md = fromNode(new DOMParser().parseFromString(html, 'text/html').body); } catch (er) { md = null; }
    }
    if (md == null || (!md.trim() && txt)) md = txt;
    if (md == null) return;
    e.preventDefault();
    md = md.replace(/\r\n?/g, '\n');
    if (!md.trim()) return;
    var oneLine = md.indexOf('\n') < 0 && !/^\s*([-*•]|\d{1,3}[.)])\s|^#{1,3}\s/.test(md);
    exec('insertHTML', oneLine ? inline(md, true) : toHtml(md, { editable: true }));
    closeMention();
  });

  document.addEventListener('focusout', function (e) {
    if (mention && e.target === mention.ed) setTimeout(function () {
      if (mention && document.activeElement !== mention.ed) closeMention();
    }, 120);
  });

  document.addEventListener('selectionchange', function () {
    var ed = editorOf(selNode());
    if (ed) syncBar(ed);
  });

  global.addEventListener('resize', closeMention);

  var RT = global.RichText = {
    toHtml: toHtml, inline: inline, fromNode: fromNode, toolbar: toolbar,
    caretOffsets: caretOffsets, setOffsets: setOffsets, focusEnd: focusEnd,
    closeMention: closeMention,
    plain: function (md) { return S.plainText(md); },
    /** main.js ใส่ตัวถามข้อความของแอปมาให้ (askText) ไม่ใช้ prompt() ของเบราว์เซอร์ */
    ask: null
  };

})(window);

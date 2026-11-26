/* Orbit — กราฟ (ชิ้นงาน 3c) ใช้ซ้ำในรายงานรวม (4b)
 *
 * วาดเป็น SVG ในหน้าเว็บล้วน ไม่มีไลบรารีกราฟ สีทุกสีอ้าง token ของธีม (var(--…))
 * จึงเปลี่ยนตามโหมดมืด/สว่างเอง ส่วนสีของข้อมูลที่ผู้ใช้ตั้งเอง (สีตัวเลือก สีคน) ใช้ค่าที่ส่งมา
 *
 * ใช้:
 *   Charts.svg(spec)            → สตริง SVG
 *   Charts.toPng(svgEl, name)   → ดาวน์โหลด PNG (แปลง var(--…) เป็นสีจริงก่อนวาดลงผืนผ้าใบ)
 *   Charts.color(i)             → สีลำดับที่ i ของชุดสีกราฟ
 *   Charts.TYPES                → ชนิดที่วาดได้
 *
 * spec = {
 *   type:   'bar' | 'stack' | 'group' | 'line' | 'burnup' | 'burndown' | 'donut' | 'number' | 'lollipop',
 *   cats:   [{ key, label, color? }]            แกน X (หรือชิ้นของโดนัท)
 *   series: [{ key, label, color?, dash? }]      ชุดข้อมูล (อย่างน้อยหนึ่ง)
 *   values: [[n, …], …]                          values[ลำดับ cat][ลำดับ series]
 *   bench:  ตัวเลข | null                        เส้นเป้าหมาย (กราฟเส้น)
 *   number: { value, label, sub }                การ์ดตัวเลข
 *   fmt:    function (n) → ข้อความ               รูปแบบตัวเลขบนแกน/ป้าย (ไม่ใส่ = ปัดทศนิยม 2 ตำแหน่ง)
 *   act:    ชื่อ data-act ของส่วนที่คลิกได้ ('' = คลิกไม่ได้)   wid: รหัสวิดเจ็ตที่แนบไปกับคลิก
 *   w, h:   ขนาด viewBox (ค่าเริ่ม 560 × 240)
 *   empty:  ข้อความเมื่อไม่มีข้อมูล   legend: true/false (ค่าเริ่ม = มีมากกว่าหนึ่งชุด)
 * }
 * ส่วนที่คลิกได้มี data-act, data-w, data-cat, data-ser — ผู้เรียกตีความเอง (เช่น เปิดรายการงานที่กรองแล้ว)
 */
(function (global) {
  'use strict';

  var TYPES = ['bar', 'stack', 'group', 'line', 'burnup', 'burndown', 'donut', 'number', 'lollipop'];
  var PAL = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)',
             'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function color(i) { return PAL[((i % PAL.length) + PAL.length) % PAL.length]; }
  function num(v) { v = +v; return isFinite(v) ? v : 0; }
  function defFmt(n) {
    n = Math.round(num(n) * 100) / 100;
    return Math.abs(n) >= 1000 ? n.toLocaleString() : String(n);
  }
  function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /** สเกลสวย ๆ 0 … max แบ่งประมาณ 4 ช่อง */
  function niceMax(max) {
    if (max <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log(max) / Math.LN10));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] * p * 4 >= max) return steps[i] * p * 4;
    }
    return 10 * p * 4;
  }

  function clickAttrs(spec, cat, ser) {
    if (!spec.act) return '';
    return ' data-act="' + esc(spec.act) + '" data-w="' + esc(spec.wid || '') + '" data-cat="' +
      esc(cat == null ? '' : cat) + '" data-ser="' + esc(ser == null ? '' : ser) + '" class="ch-hit"';
  }

  function legendHtml(items, x, y, maxW) {
    var h = '', cx = x, cy = y;
    items.forEach(function (it) {
      var w = 18 + Math.min(18, String(it.label).length) * 6.4 + 12;
      if (cx + w > x + maxW && cx > x) { cx = x; cy += 16; }
      h += '<rect x="' + cx + '" y="' + (cy - 8) + '" width="9" height="9" rx="2" style="fill:' + it.color + '"/>' +
        '<text x="' + (cx + 13) + '" y="' + cy + '" class="ch-lg">' + esc(trunc(it.label, 18)) + '</text>';
      cx += w;
    });
    return { html: h, h: cy - y + 14 };
  }

  function emptySvg(spec, W, H) {
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" xmlns="http://www.w3.org/2000/svg">' +
      '<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" class="ch-empty">' +
      esc(spec.empty || '—') + '</text></svg>';
  }

  function serColor(spec, si) {
    var s = spec.series[si];
    return (s && s.color) || color(si);
  }
  function catColor(spec, ci) {
    var c = spec.cats[ci];
    return (c && c.color) || color(ci);
  }

  /* ---------- การ์ดตัวเลข ---------- */
  function numberSvg(spec, W, H) {
    var n = spec.number || {};
    var fmt = spec.fmt || defFmt;
    return '<svg class="chart ch-number" viewBox="0 0 ' + W + ' ' + H + '" role="img" xmlns="http://www.w3.org/2000/svg">' +
      '<g' + clickAttrs(spec, '', '') + '><rect x="0" y="0" width="' + W + '" height="' + H + '" style="fill:transparent"/>' +
      '<text x="' + (W / 2) + '" y="' + (H / 2 + 10) + '" text-anchor="middle" class="ch-big">' +
      esc(n.value == null ? '—' : fmt(n.value)) + '</text>' +
      (n.label ? '<text x="' + (W / 2) + '" y="' + (H / 2 + 42) + '" text-anchor="middle" class="ch-sub">' + esc(n.label) + '</text>' : '') +
      (n.sub ? '<text x="' + (W / 2) + '" y="' + (H / 2 + 62) + '" text-anchor="middle" class="ch-lg">' + esc(n.sub) + '</text>' : '') +
      '</g></svg>';
  }

  /* ---------- โดนัท ---------- */
  function donutSvg(spec, W, H) {
    var vals = spec.cats.map(function (c, i) { return Math.max(0, num((spec.values[i] || [])[0])); });
    var total = vals.reduce(function (a, b) { return a + b; }, 0);
    if (!total) return emptySvg(spec, W, H);
    var fmt = spec.fmt || defFmt;
    var r = Math.min(H / 2 - 12, W / 4), cx = r + 16, cy = H / 2, ir = r * 0.6;
    var h = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" xmlns="http://www.w3.org/2000/svg">';
    var a0 = -Math.PI / 2;
    vals.forEach(function (v, i) {
      if (!v) return;
      var a1 = a0 + (v / total) * Math.PI * 2;
      var c = catColor(spec, i);
      var big = a1 - a0 > Math.PI ? 1 : 0;
      var d;
      if (v === total) {
        d = 'M' + cx + ' ' + (cy - r) + ' A' + r + ' ' + r + ' 0 1 1 ' + (cx - 0.01) + ' ' + (cy - r) +
          ' L' + (cx - 0.01) + ' ' + (cy - ir) + ' A' + ir + ' ' + ir + ' 0 1 0 ' + cx + ' ' + (cy - ir) + ' Z';
      } else {
        var p = function (a, rr) { return (cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2); };
        d = 'M' + p(a0, r) + ' A' + r + ' ' + r + ' 0 ' + big + ' 1 ' + p(a1, r) +
          ' L' + p(a1, ir) + ' A' + ir + ' ' + ir + ' 0 ' + big + ' 0 ' + p(a0, ir) + ' Z';
      }
      h += '<path d="' + d + '" style="fill:' + c + '"' + clickAttrs(spec, spec.cats[i].key, '') + '><title>' +
        esc(spec.cats[i].label + ': ' + fmt(v) + ' (' + Math.round(v * 100 / total) + '%)') + '</title></path>';
      a0 = a1;
    });
    h += '<text x="' + cx + '" y="' + (cy + 6) + '" text-anchor="middle" class="ch-mid">' + esc(fmt(total)) + '</text>';
    /* คำอธิบายด้านขวา */
    var lx = cx + r + 24, ly = Math.max(18, cy - spec.cats.length * 9);
    spec.cats.slice(0, 12).forEach(function (c, i) {
      var y = ly + i * 18;
      h += '<g' + clickAttrs(spec, c.key, '') + '><rect x="' + lx + '" y="' + (y - 9) + '" width="10" height="10" rx="2" style="fill:' +
        catColor(spec, i) + '"/><text x="' + (lx + 15) + '" y="' + y + '" class="ch-lg">' +
        esc(trunc(c.label, 22)) + ' · ' + esc(fmt(vals[i])) + '</text></g>';
    });
    if (spec.cats.length > 12) {
      h += '<text x="' + lx + '" y="' + (ly + 12 * 18) + '" class="ch-lg">+' + (spec.cats.length - 12) + '</text>';
    }
    return h + '</svg>';
  }

  /* ---------- แท่ง / แท่งซ้อน / แท่งกลุ่ม / อมยิ้ม / เส้น ---------- */
  function axisSvg(spec, W, H) {
    var type = spec.type;
    var fmt = spec.fmt || defFmt;
    var nC = spec.cats.length, nS = Math.max(1, spec.series.length);
    if (!nC) return emptySvg(spec, W, H);
    var isLine = type === 'line' || type === 'burnup' || type === 'burndown';
    var stacked = type === 'stack';
    var showLegend = spec.legend != null ? spec.legend : nS > 1;

    var max = 0;
    spec.values.forEach(function (row) {
      if (stacked) max = Math.max(max, (row || []).reduce(function (a, b) { return a + Math.max(0, num(b)); }, 0));
      else (row || []).forEach(function (v) { max = Math.max(max, num(v)); });
    });
    if (spec.bench != null && isFinite(+spec.bench)) max = Math.max(max, +spec.bench);
    var top = niceMax(max);

    var leg = showLegend ? legendHtml(spec.series.map(function (s, i) { return { label: s.label, color: serColor(spec, i) }; }),
      44, 14, W - 60) : { html: '', h: 0 };
    var padL = 44, padR = 12, padT = 12 + leg.h, padB = 38;
    var cw = W - padL - padR, ch = H - padT - padB;
    var y = function (v) { return padT + ch - (num(v) / top) * ch; };

    var h = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" xmlns="http://www.w3.org/2000/svg">';
    h += leg.html;
    /* เส้นตาราง + ตัวเลขแกน Y */
    for (var g = 0; g <= 4; g++) {
      var gv = top * g / 4, gy = y(gv);
      h += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) +
        '" class="ch-grid"/><text x="' + (padL - 6) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" class="ch-ax">' +
        esc(fmt(gv)) + '</text>';
    }
    var step = cw / nC;
    /* ป้ายแกน X — ข้ามบางป้ายเมื่อแน่นเกิน */
    var every = Math.max(1, Math.ceil(nC / Math.max(1, Math.floor(cw / 52))));
    var maxChars = Math.max(4, Math.floor(step * every / 6.2));
    spec.cats.forEach(function (c, ci) {
      if (ci % every) return;
      var cx = padL + step * ci + step / 2;
      h += '<text x="' + cx.toFixed(1) + '" y="' + (H - padB + 16) + '" text-anchor="middle" class="ch-ax">' +
        esc(trunc(c.label, maxChars)) + '<title>' + esc(c.label) + '</title></text>';
    });

    if (isLine) {
      spec.series.forEach(function (s, si) {
        var pts = spec.cats.map(function (c, ci) {
          return (padL + step * ci + step / 2).toFixed(1) + ',' + y((spec.values[ci] || [])[si]).toFixed(1);
        });
        var col = serColor(spec, si);
        h += '<polyline points="' + pts.join(' ') + '" class="ch-line" style="stroke:' + col + '"' +
          (s.dash ? ' stroke-dasharray="5 4"' : '') + '/>';
        if (!s.dash) {
          spec.cats.forEach(function (c, ci) {
            var v = (spec.values[ci] || [])[si];
            h += '<circle cx="' + (padL + step * ci + step / 2).toFixed(1) + '" cy="' + y(v).toFixed(1) +
              '" r="3.5" style="fill:' + col + '"' + clickAttrs(spec, c.key, s.key) + '><title>' +
              esc(c.label + ' · ' + s.label + ': ' + fmt(v)) + '</title></circle>';
          });
        }
      });
    } else {
      spec.cats.forEach(function (c, ci) {
        var row = spec.values[ci] || [];
        var x0 = padL + step * ci;
        var bw = Math.min(46, step * 0.66);
        if (stacked) {
          var acc = 0;
          spec.series.forEach(function (s, si) {
            var v = Math.max(0, num(row[si]));
            if (!v) return;
            var y1 = y(acc + v), y0 = y(acc);
            h += '<rect x="' + (x0 + (step - bw) / 2).toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bw.toFixed(1) +
              '" height="' + Math.max(0.5, y0 - y1).toFixed(1) + '" style="fill:' + serColor(spec, si) + '"' +
              clickAttrs(spec, c.key, s.key) + '><title>' + esc(c.label + ' · ' + s.label + ': ' + fmt(v)) + '</title></rect>';
            acc += v;
          });
          if (acc) h += '<text x="' + (x0 + step / 2).toFixed(1) + '" y="' + (y(acc) - 4).toFixed(1) +
            '" text-anchor="middle" class="ch-val">' + esc(fmt(acc)) + '</text>';
          return;
        }
        var groupN = type === 'group' ? nS : 1;
        var gw = Math.min(type === 'group' ? 64 : 46, step * 0.72), sw = gw / groupN;
        for (var si = 0; si < groupN; si++) {
          var v = num(row[si]);
          var bx = x0 + (step - gw) / 2 + sw * si, yv = y(Math.max(0, v));
          var col = groupN > 1 || nS > 1 ? serColor(spec, si) : (c.color || serColor(spec, 0));
          var sk = (spec.series[si] || {}).key;
          if (type === 'lollipop') {
            var lx = bx + sw / 2;
            h += '<line x1="' + lx.toFixed(1) + '" x2="' + lx.toFixed(1) + '" y1="' + y(0).toFixed(1) + '" y2="' + yv.toFixed(1) +
              '" class="ch-stem" style="stroke:' + col + '"/><circle cx="' + lx.toFixed(1) + '" cy="' + yv.toFixed(1) +
              '" r="6" style="fill:' + col + '"' + clickAttrs(spec, c.key, sk) + '><title>' + esc(c.label + ': ' + fmt(v)) + '</title></circle>';
          } else {
            h += '<rect x="' + (bx + 1).toFixed(1) + '" y="' + yv.toFixed(1) + '" width="' + Math.max(1, sw - 2).toFixed(1) +
              '" height="' + Math.max(0.5, y(0) - yv).toFixed(1) + '" rx="2" style="fill:' + col + '"' +
              clickAttrs(spec, c.key, sk) + '><title>' + esc(c.label + (nS > 1 ? ' · ' + spec.series[si].label : '') + ': ' + fmt(v)) +
              '</title></rect>';
          }
          if (groupN === 1 && v) h += '<text x="' + (bx + sw / 2).toFixed(1) + '" y="' + (yv - (type === 'lollipop' ? 10 : 4)).toFixed(1) +
            '" text-anchor="middle" class="ch-val">' + esc(fmt(v)) + '</text>';
        }
      });
    }
    if (spec.bench != null && isFinite(+spec.bench)) {
      var by = y(+spec.bench);
      h += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + by.toFixed(1) + '" y2="' + by.toFixed(1) +
        '" class="ch-bench"/><text x="' + (W - padR) + '" y="' + (by - 4).toFixed(1) + '" text-anchor="end" class="ch-ax">' +
        esc(fmt(+spec.bench)) + '</text>';
    }
    h += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '" class="ch-base"/>';
    return h + '</svg>';
  }

  function svg(spec) {
    spec = spec || {};
    spec.cats = spec.cats || [];
    spec.series = spec.series && spec.series.length ? spec.series : [{ key: 'v', label: '' }];
    spec.values = spec.values || [];
    var W = spec.w || 560, H = spec.h || 240;
    if (spec.type === 'number') return numberSvg(spec, W, H);
    if (spec.type === 'donut') return donutSvg(spec, W, H);
    return axisSvg(spec, W, H);
  }

  /* ---------- ส่งออก PNG ----------
   * SVG ที่อยู่บนหน้าใช้ var(--…) และคลาส CSS ซึ่งรูปที่วาดแยกออกไปมองไม่เห็น
   * จึงคัดลอก แล้วฝังสี/ฟอนต์ที่คำนวณได้จริงลงทุกชิ้นก่อน แล้ววาดลงผืนผ้าใบ ×2 ให้คมบนจอความละเอียดสูง */
  function inlineStyles(src, dst) {
    var cs = global.getComputedStyle(src);
    var keep = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-size', 'font-weight', 'font-family', 'opacity',
                'text-anchor', 'fill-opacity'];
    var st = '';
    keep.forEach(function (k) {
      var v = cs.getPropertyValue(k);
      if (v) st += k + ':' + v + ';';
    });
    dst.setAttribute('style', st);
    for (var i = 0; i < src.children.length; i++) {
      if (dst.children[i]) inlineStyles(src.children[i], dst.children[i]);
    }
  }

  function toPng(svgEl, filename, opts) {
    opts = opts || {};
    if (!svgEl) return false;
    var vb = (svgEl.getAttribute('viewBox') || '0 0 560 240').split(/\s+/).map(Number);
    var W = vb[2] || 560, H = vb[3] || 240, scale = opts.scale || 2;
    var title = opts.title || '';
    var clone = svgEl.cloneNode(true);
    inlineStyles(svgEl, clone);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', W);
    clone.setAttribute('height', H);
    var xml = new XMLSerializer().serializeToString(clone);
    var img = new Image();
    var bg = global.getComputedStyle(document.body).getPropertyValue('--bg-raise') ||
      global.getComputedStyle(document.body).backgroundColor || '#fff';
    var fg = global.getComputedStyle(document.body).color || '#000';
    var font = global.getComputedStyle(document.body).fontFamily || 'sans-serif';
    img.onload = function () {
      var head = title ? 34 : 0;
      var c = document.createElement('canvas');
      c.width = (W + 32) * scale;
      c.height = (H + 32 + head) * scale;
      var g = c.getContext('2d');
      g.scale(scale, scale);
      g.fillStyle = String(bg).trim() || '#fff';
      g.fillRect(0, 0, W + 32, H + 32 + head);
      if (title) {
        g.fillStyle = fg;
        g.font = '600 15px ' + font;
        g.fillText(title, 16, 26);
      }
      g.drawImage(img, 16, 16 + head, W, H);
      c.toBlob(function (blob) {
        if (!blob) return;
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (filename || 'chart') + '.png';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      }, 'image/png');
    };
    img.onerror = function () { if (opts.onError) opts.onError(); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    return true;
  }

  global.Charts = { svg: svg, toPng: toPng, color: color, TYPES: TYPES, PALETTE: PAL };

})(window);

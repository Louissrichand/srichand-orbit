/* Orbit — ที่เก็บไฟล์แนบบน SharePoint/OneDrive ผ่าน Microsoft Graph (4b)
 *
 * โหมดทีม: อัปไฟล์ไปไว้ไดรฟ์เดียวกับไฟล์ข้อมูล  <ไดรฟ์>/Orbit/attachments/<entityId>/<attId>-<ชื่อไฟล์>
 *   ≤ 4 MB  PUT …:/content ครั้งเดียว
 *   > 4 MB  createUploadSession แล้วส่งเป็นชิ้น (ชิ้นละ 3.75 MB = 12 × 320 KiB ตามที่ Graph กำหนด) สูงสุด 100 MB
 *   ในข้อมูลเก็บแค่ { id, name, size, mime, driveId, driveItemId, webUrl } — ไฟล์ข้อมูลจึงไม่บวม
 * โหมดเครื่องเดียว: ยังเป็น data URI ≤ 2 MB เหมือนเดิม
 *
 * ทุกการเรียก Graph ผ่าน transport ตัวเดียว (request) — ตั้งตัวปลอมได้ด้วย OrbitFiles.setTransport()
 * ใช้ทดสอบตอนที่ยังไม่ได้ตั้ง Entra (ดู dev/fake-graph.js ซึ่งไม่ได้อยู่ในแอปที่ส่งจริง)
 */
(function (global) {
  'use strict';

  var cfg = global.OrbitConfig || {};
  var GRAPH = 'https://graph.microsoft.com/v1.0';
  var LOCAL_MAX = 2 * 1024 * 1024;
  var REMOTE_MAX = 100 * 1024 * 1024;
  var SIMPLE_MAX = 4 * 1024 * 1024;
  var CHUNK = 320 * 1024 * 12;            // ต้องเป็นทวีคูณของ 320 KiB

  var injected = null;                     // transport ที่ตั้งเอง (ทดสอบ)
  var driveId = null;
  var cache = {};                          // driveItemId → object URL ของเนื้อไฟล์ที่โหลดมาแล้ว
  var pending = {};

  function err(code, msg, extra) {
    var e = new Error(msg || code);
    e.code = code;
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  /* ---------- transport ----------
   * request(method, url, { headers, body, auth (ค่าเริ่ม true), as: 'json'|'blob'|'text' })
   *   → Promise<{ status, data }>  status >= 400 โยน error code 'http' */
  var fetchTransport = {
    name: 'graph',
    request: function (method, url, opts) {
      opts = opts || {};
      var go = function (tok) {
        var headers = {};
        Object.keys(opts.headers || {}).forEach(function (k) { headers[k] = opts.headers[k]; });
        if (tok) headers.Authorization = 'Bearer ' + tok;
        return fetch(url.indexOf('http') === 0 ? url : GRAPH + url, { method: method, headers: headers, body: opts.body });
      };
      var p = opts.auth === false ? go(null) : global.OrbitAuth.token().then(go);
      return p.then(function (res) {
        if (res.status >= 400) {
          return res.text().then(function (t) { throw err('http', 'Graph ' + res.status + ': ' + String(t).slice(0, 200), { status: res.status }); });
        }
        if (opts.as === 'blob') return res.blob().then(function (b) { return { status: res.status, data: b }; });
        if (opts.as === 'text') return res.text().then(function (b) { return { status: res.status, data: b }; });
        if (res.status === 204) return { status: 204, data: null };
        return res.json().then(function (j) { return { status: res.status, data: j }; }, function () { return { status: res.status, data: null }; });
      });
    }
  };
  function transport() { return injected || fetchTransport; }
  function setTransport(t) { injected = t || null; driveId = null; cache = {}; }

  function teamReady() {
    var A = global.OrbitAuth, Y = global.OrbitSync;
    return !!(A && A.isSignedIn && A.isSignedIn() && Y && Y.state && Y.state.mode === 'team');
  }
  /** 'graph' = เก็บบนไดรฟ์ · 'local' = data URI ในไฟล์ข้อมูล */
  function mode() { return injected || teamReady() ? 'graph' : 'local'; }
  function online() { return global.navigator.onLine !== false; }
  /** สถานะสำหรับหน้าจอ { mode, ready, reason: null|'offline'|'signed-out'|'local', limit } */
  function status() {
    var A = global.OrbitAuth;
    if (mode() === 'graph') {
      return { mode: 'graph', ready: online(), reason: online() ? null : 'offline', limit: REMOTE_MAX, fake: !!injected };
    }
    var configured = !!(A && A.available && A.available());
    return { mode: 'local', ready: true, reason: configured ? 'signed-out' : 'local', limit: LOCAL_MAX };
  }
  function limit() { return mode() === 'graph' ? REMOTE_MAX : LOCAL_MAX; }

  function enc(p) { return String(p).split('/').map(encodeURIComponent).join('/'); }
  function safeName(s) {
    return String(s || 'file').replace(/[\\/:*?"<>|#%{}~&]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';
  }
  function baseFolder() {
    var fp = cfg.filePath || 'Orbit/orbit-db.json';
    var i = fp.lastIndexOf('/');
    return i > 0 ? fp.slice(0, i) : 'Orbit';
  }
  /** ไดรฟ์เดียวกับไฟล์ข้อมูล — ไซต์ของบริษัทถ้าตั้งไว้ ไม่งั้น OneDrive ของผู้ใช้ */
  function drive() {
    if (driveId) return Promise.resolve(driveId);
    var T = transport();
    var p;
    if (cfg.siteHostname && cfg.sitePath) {
      var sp = cfg.sitePath.charAt(0) === '/' ? cfg.sitePath : '/' + cfg.sitePath;
      p = T.request('GET', '/sites/' + cfg.siteHostname + ':' + sp).then(function (r) { return T.request('GET', '/sites/' + r.data.id + '/drive'); });
    } else p = T.request('GET', '/me/drive');
    return p.then(function (r) { driveId = r.data.id; return driveId; });
  }

  function rid() { return 'fa_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
  function metaOf(item, d, extra) {
    /* ไฟล์ที่อัปเองใช้ชื่อและชนิดเดิมจากเครื่อง (ชื่อบนไดรฟ์มีรหัสนำหน้ากันชนกัน) */
    var m = { id: (extra && extra.id) || rid(), name: (extra && extra.name) || item.name, size: item.size || null,
      mime: (extra && extra.mime) || (item.file && item.file.mimeType) || null,
      driveId: (item.parentReference && item.parentReference.driveId) || d, driveItemId: item.id, webUrl: item.webUrl, url: item.webUrl, remote: true };
    if (extra && extra.linked) m.linked = true;
    return m;
  }

  /** อัปโหลด Blob/File → meta  onProgress(sent, total) */
  function upload(blob, name, entityId, onProgress) {
    if (mode() !== 'graph') return Promise.reject(err('local', 'ไม่ได้อยู่ในโหมดทีม'));
    if (!online()) return Promise.reject(err('offline', 'ออฟไลน์อยู่'));
    if (blob.size > REMOTE_MAX) return Promise.reject(err('too-big', 'ไฟล์ใหญ่เกิน 100 MB'));
    var T = transport(), id = rid(), mime = blob.type || null;
    var path = baseFolder() + '/attachments/' + safeName(entityId || 'misc') + '/' + id + '-' + safeName(name);
    return drive().then(function (d) {
      if (blob.size <= SIMPLE_MAX) {
        return T.request('PUT', '/drives/' + d + '/root:/' + enc(path) + ':/content?@microsoft.graph.conflictBehavior=rename',
          { headers: { 'Content-Type': mime || 'application/octet-stream' }, body: blob }).then(function (r) {
          if (onProgress) onProgress(blob.size, blob.size);
          return metaOf(r.data, d, { id: id, mime: mime, name: name });
        });
      }
      return T.request('POST', '/drives/' + d + '/root:/' + enc(path) + ':/createUploadSession',
        { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }) })
        .then(function (r) {
          var url = r.data.uploadUrl, total = blob.size;
          var send = function (start) {
            var end = Math.min(start + CHUNK, total);
            return T.request('PUT', url, { auth: false, headers: { 'Content-Range': 'bytes ' + start + '-' + (end - 1) + '/' + total }, body: blob.slice(start, end) })
              .then(function (res) {
                if (onProgress) onProgress(end, total);
                if (res.status === 200 || res.status === 201) return res.data;
                if (end >= total) throw err('http', 'อัปโหลดไม่ครบ');
                return send(end);
              }, function (e) {
                /* ชิ้นใดพัง ยกเลิกเซสชัน ไม่ทิ้งไฟล์ครึ่ง ๆ ไว้ */
                return T.request('DELETE', url, { auth: false }).then(function () { throw e; }, function () { throw e; });
              });
          };
          return send(0);
        }).then(function (item) { return metaOf(item, d, { id: id, mime: mime, name: name }); });
    });
  }

  function itemPath(meta) {
    return '/drives/' + (meta.driveId || driveId) + '/items/' + meta.driveItemId;
  }
  /** เนื้อไฟล์เป็น Blob */
  function download(meta) {
    if (mode() !== 'graph') return Promise.reject(err('signed-out', 'ยังไม่ได้เข้าสู่ระบบบัญชีบริษัท'));
    if (!online()) return Promise.reject(err('offline', 'ออฟไลน์อยู่'));
    var go = function () { return transport().request('GET', itemPath(meta) + '/content', { as: 'blob' }).then(function (r) { return r.data; }); };
    return meta.driveId ? go() : drive().then(go);
  }
  function cachedUrl(meta) { return meta && cache[meta.driveItemId] || null; }
  /** object URL สำหรับแสดงรูป (จำไว้ตลอดการเปิดหน้า) */
  function previewUrl(meta) {
    if (cache[meta.driveItemId]) return Promise.resolve(cache[meta.driveItemId]);
    if (pending[meta.driveItemId]) return pending[meta.driveItemId];
    var p = download(meta).then(function (b) {
      var u = URL.createObjectURL(b);
      cache[meta.driveItemId] = u;
      delete pending[meta.driveItemId];
      return u;
    }, function (e) { delete pending[meta.driveItemId]; throw e; });
    pending[meta.driveItemId] = p;
    return p;
  }

  /* ---------- เลือกไฟล์ที่มีอยู่แล้ว ----------
   * source: 'site' = ไดรฟ์ของ Orbit (ไซต์ของบริษัท/OneDrive ตาม config) · 'me' = OneDrive ของฉัน */
  var SELECT = '$select=id,name,size,file,folder,webUrl,parentReference,lastModifiedDateTime';
  function driveBase(source) {
    if (source === 'me') return Promise.resolve('/me/drive');
    return drive().then(function (d) { return '/drives/' + d; });
  }
  function rows(list) {
    return (list || []).map(function (x) {
      return { id: x.id, name: x.name, size: x.size || 0, folder: !!x.folder, mime: x.file ? x.file.mimeType : null,
        webUrl: x.webUrl, driveId: x.parentReference && x.parentReference.driveId, at: x.lastModifiedDateTime || null, raw: x };
    });
  }
  function browse(source, itemId) {
    if (mode() !== 'graph') return Promise.reject(err('signed-out'));
    return driveBase(source).then(function (b) {
      return transport().request('GET', b + (itemId ? '/items/' + itemId : '/root') + '/children?$top=100&' + SELECT);
    }).then(function (r) { return rows(r.data && r.data.value); });
  }
  function search(source, q) {
    if (mode() !== 'graph') return Promise.reject(err('signed-out'));
    var s = String(q || '').replace(/'/g, "''").trim();
    if (!s) return browse(source, null);
    return driveBase(source).then(function (b) {
      return transport().request('GET', b + "/root/search(q='" + encodeURIComponent(s) + "')?$top=40&" + SELECT);
    }).then(function (r) { return rows(r.data && r.data.value).filter(function (x) { return !x.folder; }); });
  }
  /** แถวที่เลือกจากตัวเลือกไฟล์ → meta (ลิงก์ไปไฟล์เดิม ไม่คัดลอก) */
  function linkMeta(row) { return metaOf(row.raw || row, row.driveId, { linked: true }); }

  /* ---------- อ่านไฟล์จากเครื่อง ---------- */
  function readDataUrl(file) {
    return new Promise(function (ok, bad) {
      var fr = new FileReader();
      fr.onload = function () { ok(String(fr.result)); };
      fr.onerror = function () { bad(err('read', 'อ่านไฟล์ไม่สำเร็จ')); };
      fr.readAsDataURL(file);
    });
  }
  function dataUrlToBlob(u) {
    var i = u.indexOf(','), head = u.slice(5, i), b64 = /;base64/.test(head);
    var mime = head.replace(/;base64/, '').split(';')[0] || 'application/octet-stream';
    var raw = b64 ? atob(u.slice(i + 1)) : decodeURIComponent(u.slice(i + 1));
    var arr = new Uint8Array(raw.length);
    for (var k = 0; k < raw.length; k++) arr[k] = raw.charCodeAt(k);
    return new Blob([arr], { type: mime });
  }
  /** เก็บไฟล์ตามโหมด — graph: อัปแล้วคืน meta · local: data URI (≤ localMax) */
  function store(file, entityId, opts) {
    opts = opts || {};
    if (mode() === 'graph') return upload(file, file.name, entityId, opts.onProgress);
    var max = opts.localMax || LOCAL_MAX;
    if (file.size > max) return Promise.reject(err('too-big', 'ไฟล์ใหญ่เกิน', { max: max }));
    return readDataUrl(file).then(function (u) {
      return { id: rid(), name: file.name, url: u, size: file.size, mime: file.type || null };
    });
  }

  /* ---------- เติมรูปจากไดรฟ์ลงหน้าจอ ----------
   * ตัวแสดงผลใส่พิกเซลใสที่มี #gfile=<driveId>|<itemId> ไว้ก่อน (ดู Store.attImgSrc) ตรงนี้โหลดจริงแล้วแทนที่ */
  function hydrate(root) {
    if (mode() !== 'graph') return;
    Array.prototype.forEach.call((root || document).querySelectorAll('img[src*="#gfile="]'), function (img) {
      if (img.dataset.gload) return;
      img.dataset.gload = '1';
      var key = decodeURIComponent(img.getAttribute('src').split('#gfile=')[1] || '');
      var parts = key.split('|');
      previewUrl({ driveId: parts[0] || null, driveItemId: parts[1] }).then(function (u) { img.src = u; }, function () {
        img.classList.add('gfile-broken');
        img.title = 'โหลดรูปจาก SharePoint/OneDrive ไม่ได้';
      });
    });
  }
  var hydT = null;
  if (global.MutationObserver) {
    new MutationObserver(function () {
      clearTimeout(hydT);
      hydT = setTimeout(function () { hydrate(document); }, 30);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  global.OrbitFiles = {
    LOCAL_MAX: LOCAL_MAX, REMOTE_MAX: REMOTE_MAX, SIMPLE_MAX: SIMPLE_MAX, CHUNK: CHUNK,
    setTransport: setTransport, mode: mode, status: status, limit: limit, baseFolder: baseFolder,
    upload: upload, download: download, previewUrl: previewUrl, cachedUrl: cachedUrl,
    browse: browse, search: search, linkMeta: linkMeta, store: store,
    readDataUrl: readDataUrl, dataUrlToBlob: dataUrlToBlob, hydrate: hydrate, drive: drive
  };

})(window);

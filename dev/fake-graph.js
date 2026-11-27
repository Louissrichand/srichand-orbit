/* Orbit — Microsoft Graph ปลอม (เฉพาะตอนพัฒนา ไม่ได้อยู่ใน index.html หรือไฟล์ build)
 *
 * ใช้ทดสอบไฟล์แนบบน SharePoint/OneDrive ตอนที่ยังไม่ได้ตั้ง Entra:
 *   เปิดแอปบน http://localhost แล้วในคอนโซลพิมพ์
 *     var s = document.createElement('script'); s.src = 'dev/fake-graph.js'; document.head.appendChild(s);
 *   แล้ว FakeGraph.install()   (FakeGraph.uninstall() เพื่อกลับไปโหมดเดิม)
 *   FakeGraph.failNext = 1     ให้คำขอถัดไปพังหนึ่งครั้ง (ทดสอบหน้าจออัปโหลดไม่สำเร็จ)
 *   FakeGraph.log              รายการคำขอที่ได้รับ
 * เก็บไฟล์ไว้ในหน่วยความจำเท่านั้น รีเฟรชแล้วหาย
 */
(function (global) {
  'use strict';

  var drives = { drv_site: {}, drv_me: {} };   // driveId → { itemId: item }
  var blobs = {};                              // itemId → Blob
  var sessions = {};
  var seq = 0;

  function id(p) { return (p || 'it') + '_' + (++seq).toString(36) + Math.random().toString(36).slice(2, 6); }
  function res(status, data) { return Promise.resolve({ status: status, data: data }); }
  function fail(status, msg) { var e = new Error('Graph ' + status + ': ' + msg); e.code = 'http'; e.status = status; return Promise.reject(e); }

  function ensureFolder(d, path) {
    var parent = null, cur = '';
    path.split('/').filter(Boolean).forEach(function (seg) {
      cur += '/' + seg;
      var hit = Object.keys(drives[d]).map(function (k) { return drives[d][k]; })
        .filter(function (x) { return x.folder && x._path === cur; })[0];
      if (!hit) {
        hit = { id: id('fo'), name: seg, folder: { childCount: 0 }, _path: cur, _parent: parent,
          webUrl: 'https://fake.sharepoint.test' + cur, parentReference: { driveId: d } };
        drives[d][hit.id] = hit;
      }
      parent = hit.id;
    });
    return parent;
  }
  function putFile(d, path, blob) {
    var i = path.lastIndexOf('/'), dir = path.slice(0, i), name = decodeURIComponent(path.slice(i + 1));
    var parent = ensureFolder(d, decodeURIComponent(dir));
    var it = { id: id('fi'), name: name, size: blob.size, file: { mimeType: blob.type || 'application/octet-stream' },
      _parent: parent, _path: decodeURIComponent(path), webUrl: 'https://fake.sharepoint.test/' + encodeURI(decodeURIComponent(path)),
      parentReference: { driveId: d }, lastModifiedDateTime: new Date().toISOString() };
    drives[d][it.id] = it;
    blobs[it.id] = blob;
    return it;
  }
  function pub(x) {
    var o = {};
    Object.keys(x).forEach(function (k) { if (k.charAt(0) !== '_') o[k] = x[k]; });
    return o;
  }

  var FG = {
    log: [], failNext: 0, chunkPuts: 0,
    request: function (method, url, opts) {
      opts = opts || {};
      FG.log.push(method + ' ' + url.replace('https://graph.microsoft.com/v1.0', '').slice(0, 140));
      if (FG.failNext > 0) { FG.failNext--; return fail(503, 'fake outage'); }
      var m;
      if (method === 'GET' && url === '/me/drive') return res(200, { id: 'drv_me' });
      if (method === 'GET' && /^\/sites\/[^/]+:/.test(url)) return res(200, { id: 'site_fake' });
      if (method === 'GET' && url === '/sites/site_fake/drive') return res(200, { id: 'drv_site' });
      if (method === 'PUT' && (m = /^\/drives\/([^/]+)\/root:\/(.+):\/content/.exec(url))) {
        if (opts.body && opts.body.size > 4 * 1024 * 1024) return fail(413, 'too large for simple upload');
        return res(201, pub(putFile(m[1], m[2], opts.body)));
      }
      if (method === 'POST' && (m = /^\/drives\/([^/]+)\/root:\/(.+):\/createUploadSession$/.exec(url))) {
        var sid = id('up');
        sessions[sid] = { d: m[1], path: m[2], parts: [], got: 0 };
        return res(200, { uploadUrl: 'https://fake-upload.test/session/' + sid, expirationDateTime: new Date(Date.now() + 3600e3).toISOString() });
      }
      if ((m = /^https:\/\/fake-upload\.test\/session\/(.+)$/.exec(url))) {
        var s = sessions[m[1]];
        if (!s) return fail(404, 'no session');
        if (method === 'DELETE') { delete sessions[m[1]]; return res(204, null); }
        if (opts.auth !== false) return fail(400, 'upload URL must be called without Authorization');
        var r = /bytes (\d+)-(\d+)\/(\d+)/.exec((opts.headers || {})['Content-Range'] || '');
        if (!r || +r[1] !== s.got) return fail(416, 'bad range');
        FG.chunkPuts++;
        s.parts.push(opts.body);
        s.got = +r[2] + 1;
        if (s.got < +r[3]) return res(202, { nextExpectedRanges: [s.got + '-'] });
        delete sessions[m[1]];
        return res(201, pub(putFile(s.d, s.path, new Blob(s.parts, { type: s.parts[0] && s.parts[0].type }))));
      }
      if (method === 'GET' && (m = /^\/drives\/([^/]+)\/items\/([^/]+)\/content$/.exec(url))) {
        if (!blobs[m[2]]) return fail(404, 'itemNotFound');
        return res(200, blobs[m[2]]);
      }
      if (method === 'GET' && (m = /^(\/me\/drive|\/drives\/([^/]+))\/(root|items\/([^/]+))\/children/.exec(url))) {
        var dd = m[2] || 'drv_me', parent = m[4] || null;
        var list = Object.keys(drives[dd]).map(function (k) { return drives[dd][k]; }).filter(function (x) { return (x._parent || null) === parent; });
        return res(200, { value: list.map(pub) });
      }
      if (method === 'GET' && (m = /^(\/me\/drive|\/drives\/([^/]+))\/root\/search\(q='([^']*)'\)/.exec(url))) {
        var d2 = m[2] || 'drv_me', q = decodeURIComponent(m[3]).toLowerCase();
        var hits = Object.keys(drives[d2]).map(function (k) { return drives[d2][k]; }).filter(function (x) { return x.name.toLowerCase().indexOf(q) >= 0; });
        return res(200, { value: hits.map(pub) });
      }
      return fail(400, 'fake graph: unhandled ' + method + ' ' + url);
    },
    install: function () {
      global.OrbitFiles.setTransport(FG);
      if (!Object.keys(drives.drv_me).length) {
        putFile('drv_me', 'Documents/Brief%20Q1.docx', new Blob(['fake docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
        putFile('drv_me', 'Documents/Budget%202027.xlsx', new Blob(['fake xlsx'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        putFile('drv_me', 'Pictures/logo.png', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
      }
      return 'fake Graph installed';
    },
    uninstall: function () { global.OrbitFiles.setTransport(null); return 'fake Graph removed'; },
    files: function () { return Object.keys(blobs).length; }
  };
  global.FakeGraph = FG;

})(window);

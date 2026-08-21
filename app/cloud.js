/* Orbit — ที่เก็บข้อมูลกลางบน SharePoint ผ่าน Microsoft Graph
 *
 * เก็บฐานข้อมูลทั้งก้อนเป็นไฟล์ JSON ไฟล์เดียวในไลบรารีเอกสารของบริษัท
 * ใช้ eTag คุมการเขียนทับ: ถ้ามีคนแก้ก่อนเรา Graph จะตอบ 412 แทนที่จะเขียนทับเงียบ ๆ
 *
 * ข้อจำกัดที่ตั้งใจรับไว้ในเวอร์ชันนี้:
 * เก็บทั้งฐานข้อมูลเป็นไฟล์เดียว ไม่ได้แยกรายงาน จึงไม่มีการรวมการแก้ไขอัตโนมัติ
 * ถ้าสองคนแก้พร้อมกันจริง ๆ ระบบจะหยุดแล้วถามผู้ใช้ ไม่ทิ้งงานใครเงียบ ๆ
 */
(function (global) {
  'use strict';

  var cfg = global.OrbitConfig || {};
  var A = global.OrbitAuth;
  var GRAPH = 'https://graph.microsoft.com/v1.0';

  var driveId = null;
  var itemId = null;
  var eTag = null;
  var lastError = null;

  function enc(p) {
    return String(p).split('/').map(encodeURIComponent).join('/');
  }

  function call(path, opts) {
    opts = opts || {};
    return A.token().then(function (tok) {
      var headers = opts.headers || {};
      headers.Authorization = 'Bearer ' + tok;
      return fetch(path.indexOf('http') === 0 ? path : GRAPH + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body
      });
    });
  }

  function asJson(res) {
    if (!res.ok) {
      return res.text().then(function (t) {
        var err = new Error('Graph ' + res.status + ': ' + t.slice(0, 200));
        err.status = res.status;
        throw err;
      });
    }
    return res.json();
  }

  /** หาไดรฟ์ปลายทาง — ไซต์ของบริษัทถ้าตั้งไว้ ไม่งั้นใช้ OneDrive ของผู้ใช้ */
  function resolveDrive() {
    if (driveId) return Promise.resolve(driveId);

    if (cfg.siteHostname && cfg.sitePath) {
      var sitePath = cfg.sitePath.charAt(0) === '/' ? cfg.sitePath : '/' + cfg.sitePath;
      return call('/sites/' + cfg.siteHostname + ':' + sitePath)
        .then(asJson)
        .then(function (site) { return call('/sites/' + site.id + '/drive'); })
        .then(asJson)
        .then(function (d) { driveId = d.id; return driveId; });
    }
    return call('/me/drive').then(asJson).then(function (d) {
      driveId = d.id;
      return driveId;
    });
  }

  function filePath() { return cfg.filePath || 'Orbit/orbit-db.json'; }

  /** ข้อมูลไฟล์ปัจจุบัน คืน null ถ้ายังไม่มีไฟล์ */
  function stat() {
    return resolveDrive().then(function (id) {
      return call('/drives/' + id + '/root:/' + enc(filePath()) + '?select=id,eTag,lastModifiedDateTime,lastModifiedBy');
    }).then(function (res) {
      if (res.status === 404) return null;
      return asJson(res);
    });
  }

  /** อ่านข้อมูลทั้งก้อน คืน null ถ้ายังไม่มีไฟล์ (ยังไม่เคยใช้งาน) */
  function load() {
    return stat().then(function (meta) {
      if (!meta) { itemId = null; eTag = null; return null; }
      itemId = meta.id;
      eTag = meta.eTag;
      return call('/drives/' + driveId + '/items/' + itemId + '/content')
        .then(function (res) {
          if (!res.ok) throw new Error('อ่านไฟล์ไม่สำเร็จ ' + res.status);
          return res.text();
        })
        .then(function (txt) {
          try { return { db: JSON.parse(txt), meta: meta }; }
          catch (e) { throw new Error('ไฟล์ข้อมูลกลางเสียหาย อ่านไม่ออก'); }
        });
    });
  }

  /** สร้างไฟล์ครั้งแรก */
  function create(json) {
    return resolveDrive().then(function (id) {
      return call('/drives/' + id + '/root:/' + enc(filePath()) + ':/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: json
      });
    }).then(asJson).then(function (item) {
      itemId = item.id;
      eTag = item.eTag;
      return { eTag: eTag, created: true };
    });
  }

  /**
   * เขียนทับด้วย eTag ที่ถืออยู่
   * ถ้ามีคนแก้ก่อน Graph ตอบ 412 -> โยน error ที่มี conflict = true
   */
  function push(json) {
    if (!itemId) return create(json);
    return call('/drives/' + driveId + '/items/' + itemId + '/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': eTag },
      body: json
    }).then(function (res) {
      if (res.status === 412 || res.status === 409) {
        var err = new Error('มีคนอื่นแก้ข้อมูลก่อนหน้านี้');
        err.conflict = true;
        throw err;
      }
      return asJson(res);
    }).then(function (item) {
      eTag = item.eTag;
      return { eTag: eTag };
    });
  }

  /** เขียนทับโดยไม่สนใจว่าใครแก้มาก่อน ใช้เมื่อผู้ใช้ยืนยันเองเท่านั้น */
  function forcePush(json) {
    return stat().then(function (meta) {
      if (meta) { itemId = meta.id; eTag = meta.eTag; }
      if (!itemId) return create(json);
      return call('/drives/' + driveId + '/items/' + itemId + '/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: json
      }).then(asJson).then(function (item) {
        eTag = item.eTag;
        return { eTag: eTag };
      });
    });
  }

  /** มีใครแก้ไฟล์หลังจากที่เราอ่านมาไหม */
  function remoteChanged() {
    return stat().then(function (meta) {
      if (!meta) return false;
      return meta.eTag !== eTag;
    });
  }

  /** ใครแก้ล่าสุด ไว้บอกในข้อความขัดแย้ง */
  function lastEditor() {
    return stat().then(function (meta) {
      if (!meta || !meta.lastModifiedBy || !meta.lastModifiedBy.user) return null;
      return meta.lastModifiedBy.user.displayName || meta.lastModifiedBy.user.email || null;
    }).catch(function () { return null; });
  }


  /* ---------- ค้นหารายชื่อคนในองค์กร ----------
   * ใช้สมุดรายชื่อของ Entra ผ่าน Graph เพื่อให้ผู้ดูแลเลือกคนได้โดยไม่ต้องพิมพ์เอง
   * ใช้ startswith แทน $search เพราะไม่ต้องส่งหัว ConsistencyLevel เพิ่ม */
  function searchPeople(q) {
    var s = String(q || '').trim().replace(/'/g, "''");
    if (s.length < 2) return Promise.resolve([]);
    var fields = ['displayName', 'givenName', 'surname', 'mail', 'userPrincipalName'];
    var filter = fields.map(function (k) {
      return "startswith(" + k + ",'" + s + "')";
    }).join(' or ');
    return call('/users?$top=15&$select=id,displayName,mail,userPrincipalName,jobTitle' +
      '&$filter=' + encodeURIComponent(filter))
      .then(asJson)
      .then(function (r) {
        return (r.value || []).map(function (u) {
          return {
            oid: u.id,
            name: u.displayName || u.userPrincipalName || '',
            email: u.mail || u.userPrincipalName || '',
            title: u.jobTitle || ''
          };
        });
      });
  }
  function reset() { driveId = null; itemId = null; eTag = null; }

  global.OrbitCloud = {
    load: load, push: push, forcePush: forcePush,
    remoteChanged: remoteChanged, lastEditor: lastEditor,
    stat: stat, reset: reset, searchPeople: searchPeople,
    get eTag() { return eTag; },
    get lastError() { return lastError; },
    describeTarget: function () {
      if (cfg.siteHostname && cfg.sitePath) {
        return cfg.siteHostname + cfg.sitePath + '/' + filePath();
      }
      return 'OneDrive/' + filePath();
    }
  };

})(window);

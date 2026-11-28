/* Orbit — การโต้ตอบของ 4b ส่วนที่ 2
 * ไฟล์แนบบน SharePoint/OneDrive (อัป ดาวน์โหลด เลือกจากไดรฟ์ ย้ายไฟล์เก่า) แจ้งเตือนของเบราว์เซอร์ ติดตั้งแอป และสื่อฝัง
 * โหลดก่อน main.js เหมือน ui4b.js
 */
(function (global) {
  'use strict';

  global.OrbitExt = global.OrbitExt || [];
  global.OrbitExt.push(function (api) {
    var S = api.S, R = api.R, L = api.L, I = api.I, esc = api.esc, state = api.state, toast = api.toast;
    var F = global.OrbitFiles;

    api.needs('write:task', ['gpick-file']);
    api.needs('self', ['bn-toggle', 'bn-test', 'pwa-dismiss']);
    api.needs('manage', ['files-migrate', 'files-migrate-go']);
    api.needs('structure', ['emb-add', 'emb-save', 'emb-del', 'emb-rename']);

    function errText(e) {
      var c = e && e.code;
      if (c === 'offline') return L('ออฟไลน์อยู่ ลองใหม่เมื่อต่อเน็ตแล้ว');
      if (c === 'too-big') return L('ไฟล์ใหญ่เกินที่แนบได้');
      if (c === 'signed-out' || c === 'local') return L('ยังไม่ได้เข้าสู่ระบบบัญชีบริษัท');
      if (e && (e.status === 401 || e.status === 403)) return L('ไม่มีสิทธิ์เข้าถึงไดรฟ์นี้ (ตรวจสิทธิ์ Files.ReadWrite.All)');
      return L('อัปโหลดไม่สำเร็จ') + (e && e.status ? ' (' + e.status + ')' : '');
    }
    function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
    function progress(el, text, p) {
      if (!el) return;
      el.innerHTML = '<div class="att-prog"><span>' + esc(text) + '</span>' + (p != null ? '<i style="width:' + p + '%"></i>' : '') + '</div>';
    }

    /* ====================== แนบไฟล์ ====================== */
    function attModal(taskId) {
      var st = F.status(), graph = st.mode === 'graph';
      var dis = graph && st.reason ? ' disabled' : '';
      return '<h2>' + L('แนบไฟล์') + '</h2>' + R.attStateHtml() +
        '<button class="att-drop" data-act="pick-file"' + dis + '>' + I('paperclip', 22) + '<b>' + L('เลือกไฟล์จากเครื่อง') + '</b>' +
        '<em>' + esc(graph ? L('อัปขึ้นโฟลเดอร์ {f}/attachments ไฟล์ละไม่เกิน 100 MB', { f: F.baseFolder() })
          : L('ไฟล์ไม่เกิน {n} MB ต่อไฟล์ เก็บมาทั้งไฟล์และดาวน์โหลดกลับได้', { n: 2 })) + '</em></button>' +
        (graph ? '<button class="att-drop att-cloud-pick" data-act="gpick-open" data-id="' + esc(taskId) + '"' + dis + '>' + I('cloud', 22) +
          '<b>' + L('แนบจาก OneDrive/SharePoint') + '</b><em>' + L('ค้นหาหรือเลือกไฟล์ที่มีอยู่แล้ว ไม่ต้องอัปซ้ำ') + '</em></button>' : '') +
        '<input type="file" id="atFile" data-act="att-file" data-id="' + esc(taskId) + '" hidden>' +
        '<div id="attProg"></div>' +
        '<div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button></div>';
    }
    function uploadToTask(file, taskId) {
      var box = document.getElementById('attProg');
      var big = file.size > F.SIMPLE_MAX;
      progress(box, L('กำลังอัป “{f}”…', { f: file.name }), 0);
      return F.upload(file, file.name, taskId, function (a, b) {
        progress(document.getElementById('attProg'), (big ? L('อัปเป็นชิ้น {p}%', { p: pct(a, b) }) : L('กำลังอัป “{f}”…', { f: file.name })), pct(a, b));
      }).then(function (meta) {
        S.addAttachment(taskId, meta.name, meta.url, meta);
        api.closeModal();
        toast(L('แนบไฟล์ขึ้น SharePoint/OneDrive แล้ว'), L('ย้อนกลับ'), 'undo');
      }, function (e) {
        var b2 = document.getElementById('attProg');
        if (b2) b2.innerHTML = '<div class="att-err">' + I('alert', 14) + '<span>' + esc(errText(e)) + '</span>' +
          '<button class="btn btn-sm" data-act="pick-file">' + L('ลองใหม่') + '</button></div>';
        else toast(errText(e));
      });
    }

    /* โหมดทีม: readFiles ของ main.js (ทรัพยากร ประกาศ รูปในหน้า) อัปขึ้นไดรฟ์แทน */
    api.hook('readFiles', function (inputEl, max, cb) {
      if (F.mode() !== 'graph') return false;
      var files = Array.prototype.slice.call(inputEl.files || []);
      inputEl.value = '';
      if (!files.length) return true;
      var ent = inputEl.dataset.id || (state.route && state.route.id) || 'misc';
      var out = [], left = files.length, skipped = 0;
      toast(L('กำลังอัป {n} ไฟล์…', { n: files.length }));
      files.forEach(function (f) {
        F.upload(f, f.name, ent).then(function (m) { out.push(m); }, function (e) { skipped++; toast(errText(e)); })
          .then(function () { if (--left === 0) cb(out, 0); });
      });
      return true;
    });

    /* ====================== ตัวเลือกไฟล์จาก OneDrive/SharePoint ====================== */
    state.gp = null;
    function gpHtml() {
      var g = state.gp;
      var h = '<h2>' + L('แนบจาก OneDrive/SharePoint') + '</h2>' +
        '<div class="gp-bar">' + R.wlSeg('gpick-src', [['site', 'ไดรฟ์ของ Orbit'], ['me', 'OneDrive ของฉัน']], g.source) +
        '<input class="inp" id="gpq" value="' + esc(g.q) + '" placeholder="' + esc(L('ค้นหาไฟล์… (Enter)')) + '"></div>';
      if (g.trail.length) {
        h += '<div class="gp-trail"><button class="as-link" data-act="gpick-up" data-i="-1">' + L('ราก') + '</button>' + g.trail.map(function (t, i) {
          return ' / <button class="as-link" data-act="gpick-up" data-i="' + i + '">' + esc(t.name) + '</button>';
        }).join('') + '</div>';
      }
      h += '<div class="gp-list">';
      if (g.loading) h += '<div class="ovw-empty">' + L('กำลังโหลด…') + '</div>';
      else if (g.error) h += '<div class="att-err">' + I('alert', 14) + '<span>' + esc(g.error) + '</span><button class="btn btn-sm" data-act="gpick-reload">' + L('ลองใหม่') + '</button></div>';
      else if (!g.rows.length) h += '<div class="ovw-empty">' + L('ไม่พบไฟล์') + '</div>';
      else g.rows.forEach(function (x, i) {
        h += '<button class="pf-pick-row" data-act="' + (x.folder ? 'gpick-dir' : 'gpick-file') + '" data-i="' + i + '" data-id="' + esc(g.taskId) + '">' +
          I(x.folder ? 'archive' : (/^image\//.test(x.mime || '') ? 'image' : 'paperclip'), 14) +
          '<span class="grow"><b>' + esc(x.name) + '</b><em>' + esc(x.folder ? L('โฟลเดอร์') : R.fmtBytes4b(x.size)) + '</em></span>' +
          I(x.folder ? 'chevronRight' : 'plus', 13) + '</button>';
      });
      h += '</div><div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ปิด') + '</button></div>';
      return h;
    }
    function gpLoad() {
      var g = state.gp;
      g.loading = true; g.error = null;
      api.openModal(gpHtml(), true);
      var folder = g.trail.length ? g.trail[g.trail.length - 1].id : null;
      var p = g.q ? F.search(g.source, g.q) : F.browse(g.source, folder);
      p.then(function (rows) {
        if (state.gp !== g) return;
        g.rows = rows.sort(function (a, b) { return (b.folder ? 1 : 0) - (a.folder ? 1 : 0) || a.name.localeCompare(b.name); });
        g.loading = false;
        api.openModal(gpHtml(), true);
      }, function (e) {
        if (state.gp !== g) return;
        g.loading = false; g.error = errText(e);
        api.openModal(gpHtml(), true);
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.id === 'gpq' && e.key === 'Enter' && state.gp) {
        e.preventDefault();
        state.gp.q = e.target.value.trim();
        gpLoad();
      }
    });

    function saveBlob(blob, name) {
      var u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = name || 'file';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    }

    /* ====================== ย้ายไฟล์ออกจากไฟล์ข้อมูล ====================== */
    function migrate() {
      var list = S.inlineBlobs();
      if (!list.length) { toast(L('ไม่มีไฟล์ที่ฝังอยู่ในไฟล์ข้อมูลแล้ว')); return; }
      var done = [], failed = 0, i = 0, sent = 0, total = list.reduce(function (a, b) { return a + (b.size || 0); }, 0);
      var draw = function () {
        api.openModal('<h2>' + L('ย้ายไฟล์แนบออกจากไฟล์ข้อมูล') + '</h2><div id="migProg"></div>' +
          '<p class="prj-note">' + L('อย่าปิดหน้านี้จนกว่าจะเสร็จ ไฟล์ที่อัปไม่ผ่านจะยังอยู่ในไฟล์ข้อมูลเหมือนเดิม') + '</p>');
      };
      draw();
      var step = function () {
        if (i >= list.length) return finish();
        var x = list[i++];
        progress(document.getElementById('migProg'), L('{i}/{n} · {f}', { i: i, n: list.length, f: x.name }), pct(sent, total));
        var blob;
        try { blob = F.dataUrlToBlob(x.url); } catch (e) { failed++; return step(); }
        F.upload(blob, x.name, x.entity).then(function (meta) {
          done.push({ path: x.path, url: x.url, meta: meta });
        }, function () { failed++; }).then(function () { sent += x.size || 0; step(); });
      };
      var finish = function () {
        var r = done.length ? S.replaceInlineBlobs(done) : { n: 0, before: 0, after: 0 };
        api.openModal('<h2>' + L('ย้ายไฟล์แนบเสร็จแล้ว') + '</h2>' +
          '<div class="kv"><span class="k">' + L('ย้ายแล้ว') + '</span><span class="v">' + esc(L('{n} ไฟล์', { n: r ? r.n : 0 })) + '</span></div>' +
          (r && r.n ? '<div class="kv"><span class="k">' + L('ขนาดไฟล์ข้อมูล') + '</span><span class="v">' +
            esc(R.fmtBytes4b(r.before) + ' → ' + R.fmtBytes4b(r.after) + ' (' + L('ลดลง {s}', { s: R.fmtBytes4b(r.before - r.after) }) + ')') + '</span></div>' : '') +
          (failed ? '<div class="att-err">' + I('alert', 14) + '<span>' + esc(L('อัปไม่ผ่าน {n} ไฟล์ — ยังอยู่ในไฟล์ข้อมูล กดย้ายอีกครั้งเพื่อลองใหม่', { n: failed })) + '</span></div>' : '') +
          '<div class="modal-acts">' + (r && r.n ? '<button class="btn" data-act="undo">' + L('ย้อนกลับ') + '</button>' : '') +
          '<button class="btn btn-primary" data-act="close-modal">' + L('เสร็จแล้ว') + '</button></div>');
        state.lastMigration = { n: r ? r.n : 0, failed: failed, before: r && r.before, after: r && r.after };
      };
      step();
    }

    /* ====================== แจ้งเตือนของเบราว์เซอร์ ====================== */
    var NotifAPI = function () { return global.Notification; };
    var bnSeen = null;               // เวลาของการแจ้งเตือนล่าสุดที่ดูแล้ว (เปิดแอปแล้วไม่เด้งของเก่า)
    function bnOn() { return !!S.pref('browserNotify'); }
    function bnPerm() { var N = NotifAPI(); return N ? N.permission : 'unsupported'; }
    function bnText(n) {
      /* Sprint 1C — ใช้ตัวเดียวกับกล่องแจ้งเตือน วันที่ดิบ 2026-11-28 กลายเป็น "28 พ.ย." ตามภาษาคนอ่าน */
      if (global.Render && global.Render.notifText) return global.Render.notifText(n);
      var body = n.key ? L(n.key, n.params || undefined) : (n.text || '');
      return (n.actorName ? n.actorName + ' ' : '') + body;
    }
    function bnCheck() {
      var me = S.db.currentUserId;
      /* Sprint 2B — รายการที่เลื่อนเตือนไว้ไม่เด้ง จนกว่าจะถึงเวลา (กลับมาแล้วนับเวลาที่กลับมา — S.notifAt)
       * รายการที่รวมกลุ่มอัปเดตเวลาเอง แจ้งซ้ำด้วย tag เดิม เบราว์เซอร์แทนที่ของเดิมแทนการเด้งเพิ่ม */
      var at = S.notifAt || function (n) { return n.createdAt; };
      var mine = S.db.notifications.filter(function (n) {
        return n.userId === me && !n.read && !n.archived && !(S.isSnoozed && S.isSnoozed(n));
      });
      var latest = mine.reduce(function (a, n) { return at(n) > a ? at(n) : a; }, '');
      if (bnSeen === null || bnSeen.uid !== me) { bnSeen = { uid: me, at: latest }; return 0; }
      var fresh = mine.filter(function (n) { return at(n) > bnSeen.at; });
      if (latest > bnSeen.at) bnSeen.at = latest;
      if (!fresh.length || !bnOn() || bnPerm() !== 'granted' || S.isDnd()) return 0;
      /* เด้งเฉพาะตอนที่ไม่ได้ดูแอปอยู่ — ดูอยู่แล้วมีป้ายในแอปบอกเอง */
      if (document.visibilityState === 'visible' && document.hasFocus() && !state.bnForce) return 0;
      var N = NotifAPI();
      var show = fresh.slice(-3);
      show.forEach(function (n) {
        try {
          var x = new N('Orbit', { body: bnText(n), tag: 'orbit-' + n.id, icon: 'assets/icons/icon-192.png' });
          x.onclick = function () {
            global.focus();
            state.route = { type: 'inbox' };
            if (n.taskId && S.task(n.taskId) && S.canSeeTask(n.taskId)) {
              api.openTask(n.taskId);
              /* Sprint 2B — ความเห็น/การพูดถึง พาไปที่ความเห็นนั้นเหมือนกดจากกล่องแจ้งเตือน */
              var sp = S.notifParts ? S.notifParts(n).filter(function (p) { return p.story; })[0] : null;
              var st = sp ? S.story(sp.story) : null;
              if (st && !st.deleted && st.taskId === n.taskId) {
                state.actTab = 'comments';
                if (st.parentId) state.openThreads[st.parentId] = true;
                state.flashStory = st.id;
              }
            }
            api.renderAll();
            x.close();
          };
        } catch (e) { /* บางเบราว์เซอร์ให้ใช้ได้เฉพาะผ่าน service worker */ }
      });
      if (fresh.length > 3) { try { new N('Orbit', { body: L('และอีก {n} รายการในกล่องแจ้งเตือน', { n: fresh.length - 3 }), tag: 'orbit-more' }); } catch (e2) {} }
      return show.length;
    }
    S.onChange(bnCheck);
    global.addEventListener('orbit:replaced', bnCheck);
    setTimeout(bnCheck, 0);
    global.Orbit4b = { bnCheck: bnCheck, migrate: migrate };

    api.hook('settingsNotify', function () {
      var perm = bnPerm(), on = bnOn() && perm === 'granted';
      var desc = perm === 'unsupported' ? L('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน')
        : perm === 'denied' ? L('เบราว์เซอร์บล็อกการแจ้งเตือนของ Orbit อยู่ — อนุญาตในตั้งค่าของเว็บไซต์ก่อน')
        : L('เด้งบนเครื่องเมื่อมีรายการใหม่เข้ากล่องแจ้งเตือน เฉพาะตอนเปิด Orbit ค้างไว้ในแท็บ ไม่เด้งช่วงห้ามรบกวน และใช้ชนิดที่เลือกไว้ด้านบน');
      return '<label class="opt-lbl">' + L('แจ้งเตือนของเบราว์เซอร์') + '</label>' +
        '<div class="opt-toggle"><div class="grow"><b>' + esc(L('แจ้งเตือนบนเดสก์ท็อป/มือถือ')) + '</b><em>' + esc(desc) + '</em></div>' +
        '<button class="switch' + (on ? ' on' : '') + '" data-act="bn-toggle" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"' +
        (perm === 'unsupported' ? ' disabled' : '') + '><i></i></button></div>' +
        (on ? '<button class="btn btn-sm" data-act="bn-test">' + I('bell', 13) + ' ' + L('ทดสอบการแจ้งเตือน') + '</button>' : '');
    });

    /* ====================== คลิก ====================== */
    api.act(function (act, el, e) {
      var id = el.dataset.id;
      switch (act) {
        case 'add-attachment': api.openModal(attModal(id)); return true;
        case 'gpick-open':
          state.gp = { taskId: id, source: 'site', trail: [], q: '', rows: [], loading: false, error: null };
          gpLoad();
          return true;
        case 'gpick-src': state.gp.source = el.dataset.v; state.gp.trail = []; state.gp.q = ''; gpLoad(); return true;
        case 'gpick-reload': gpLoad(); return true;
        case 'gpick-dir': {
          var d = state.gp.rows[+el.dataset.i];
          state.gp.trail.push({ id: d.id, name: d.name });
          state.gp.q = '';
          gpLoad();
          return true;
        }
        case 'gpick-up': state.gp.trail = state.gp.trail.slice(0, +el.dataset.i + 1); state.gp.q = ''; gpLoad(); return true;
        case 'gpick-file': {
          var row = state.gp.rows[+el.dataset.i], meta = F.linkMeta(row);
          S.addAttachment(state.gp.taskId, meta.name, meta.url, meta);
          state.gp = null;
          api.closeModal();
          toast(L('แนบลิงก์ไฟล์ “{f}” แล้ว', { f: meta.name }), L('ย้อนกลับ'), 'undo');
          return true;
        }
        case 'att-dl': {
          if (e) e.preventDefault();
          var name = el.dataset.name;
          toast(L('กำลังดาวน์โหลด “{f}”…', { f: name }));
          F.download({ driveId: el.dataset.drive || null, driveItemId: el.dataset.item }).then(function (b) {
            saveBlob(b, name);
          }, function (er) { toast(er && er.code === 'http' ? L('ดาวน์โหลดไม่สำเร็จ') + (er.status ? ' (' + er.status + ')' : '') : errText(er)); });
          return true;
        }
        case 'files-migrate': {
          var n = S.inlineBlobs().length;
          api.askConfirm(L('ย้าย {n} ไฟล์ขึ้น SharePoint/OneDrive?', { n: n }),
            L('ไฟล์ทุกชิ้นที่ยังฝังในไฟล์ข้อมูล (งาน ทรัพยากร ประกาศ รูปในหน้าเอกสาร และในถังขยะ) จะถูกอัปขึ้น {f}/attachments แล้วในข้อมูลเหลือแค่ลิงก์ ย้อนกลับได้', { f: F.baseFolder() }),
            function () { migrate(); }, { ok: L('เริ่มย้าย'), safe: true });
          return true;
        }
        case 'bn-toggle': {
          var N = NotifAPI();
          if (!N) { toast(L('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน')); return true; }
          if (bnOn() && N.permission === 'granted') { S.setPref('browserNotify', false); api.openModal(api.settingsModal('notify'), true); return true; }
          if (N.permission === 'denied') { toast(L('เบราว์เซอร์บล็อกการแจ้งเตือนของ Orbit อยู่ — อนุญาตในตั้งค่าของเว็บไซต์ก่อน')); return true; }
          var after = function (p) {
            if (p === 'granted') { S.setPref('browserNotify', true); toast(L('เปิดแจ้งเตือนของเบราว์เซอร์แล้ว')); }
            else toast(L('ไม่ได้รับอนุญาตให้แจ้งเตือน'));
            api.openModal(api.settingsModal('notify'), true);
          };
          var r = N.requestPermission(after);
          if (r && r.then) r.then(after);
          return true;
        }
        case 'bn-test': {
          var N2 = NotifAPI();
          if (S.isDnd()) { toast(L('ห้ามรบกวนอยู่ — ไม่เด้งการแจ้งเตือน')); return true; }
          try { new N2('Orbit', { body: L('การแจ้งเตือนของเบราว์เซอร์ใช้ได้แล้ว'), tag: 'orbit-test', icon: 'assets/icons/icon-192.png' }); toast(L('ส่งการแจ้งเตือนทดสอบแล้ว')); }
          catch (er2) { toast(L('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน')); }
          return true;
        }
        case 'pwa-install': if (e && e.target.closest('.sb-x')) return false; global.OrbitPWA.prompt(); return true;
        case 'pwa-dismiss': if (e) e.stopPropagation(); global.OrbitPWA.dismiss(); api.renderAll(); return true;

        /* --- สื่อฝัง --- */
        case 'emb-pick': state.route.embed = id; api.renderViewBody(); return true;
        case 'emb-add':
          api.openModal('<h2>' + L('ฝังลิงก์') + '</h2><p class="prj-note">' +
            esc(L('วางลิงก์แชร์หรือโค้ด <iframe> จาก {h} — ลิงก์ปกติจะถูกแปลงเป็นลิงก์ฝังให้เอง', { h: S.EMBED_HOSTS.map(function (x) { return x.label; }).join(', ') })) + '</p>' +
            '<div class="field"><label>' + L('ลิงก์') + ' *</label><input id="embUrl" placeholder="https://docs.google.com/…"></div>' +
            '<div class="field"><label>' + L('ชื่อแท็บ') + '</label><input id="embName" maxlength="120" placeholder="' + esc(L('ไม่ใส่ = ใช้ชื่อบริการ')) + '"></div>' +
            '<div id="embErr"></div><div class="modal-acts"><button class="btn" data-act="close-modal">' + L('ยกเลิก') + '</button>' +
            '<button class="btn btn-primary" data-act="emb-save" data-id="' + esc(id) + '">' + L('ฝัง') + '</button></div>');
          return true;
        case 'emb-save': {
          var res = S.addEmbed(id, (document.getElementById('embName') || {}).value, (document.getElementById('embUrl') || {}).value);
          if (!res.ok) {
            var msg = { host: L('ฝังได้เฉพาะ Google Docs/Sheets/Slides, Figma, Miro, Loom, YouTube และ Microsoft 365/SharePoint'),
              https: L('ต้องเป็นลิงก์ https'), invalid: L('ลิงก์ไม่ถูกต้อง'), max: L('ครบจำนวนสื่อฝังแล้ว'), perm: L('คุณแก้โปรเจกต์นี้ไม่ได้') }[res.reason] || L('ฝังไม่ได้');
            var box = document.getElementById('embErr');
            if (box) box.innerHTML = '<div class="att-err">' + I('alert', 14) + '<span>' + esc(msg) + '</span></div>';
            return true;
          }
          api.closeModal();
          state.route.embed = res.embed.id;
          api.renderViewBody();
          toast(L('ฝังแล้ว'), L('ย้อนกลับ'), 'undo');
          return true;
        }
        case 'emb-del':
          if (S.removeEmbed(id, el.dataset.e)) { state.route.embed = null; toast(L('เอาสื่อฝังออกแล้ว'), L('ย้อนกลับ'), 'undo'); }
          return true;
        case 'emb-rename': {
          var ex = S.projectEmbeds(id).filter(function (x) { return x.id === el.dataset.e; })[0];
          api.askText(L('ชื่อแท็บ'), ex ? ex.name : '', function (v) { if (v && S.renameEmbed(id, el.dataset.e, v)) toast(L('เปลี่ยนชื่อแล้ว'), L('ย้อนกลับ'), 'undo'); });
          return true;
        }
      }
      return false;
    });

    /* ====================== change ====================== */
    api.change(function (act, el) {
      if (act === 'att-file' && F.mode() === 'graph') {
        var f = el.files && el.files[0], tid = el.dataset.id;
        el.value = '';
        if (f) uploadToTask(f, tid);
        return true;
      }
      if (act === 'ff-file' && F.mode() === 'graph' && state.ff) {
        var qid = el.dataset.q, files = Array.prototype.slice.call(el.files || []);
        el.value = '';
        var room = S.FORM_FILES_MAX - (state.ff.ans[qid] || []).length;
        files.slice(0, Math.max(0, room)).forEach(function (fl) {
          F.upload(fl, fl.name, state.ff.id).then(function (m) {
            if (!state.ff) return;
            state.ff.ans[qid] = (state.ff.ans[qid] || []).concat([m]);
            api.renderViewBody();
          }, function (er) { toast(errText(er)); });
        });
        return true;
      }
      return false;
    });

    /* สื่อฝังเป็นมุมมองของโปรเจกต์ */
    api.projView('embed', function (pid, r) { return R.embedView(pid, r.embed); });
  });

})(window);

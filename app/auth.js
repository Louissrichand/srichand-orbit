/* Orbit — เข้าสู่ระบบด้วยบัญชีบริษัท (Microsoft Entra ID)
 *
 * ใช้ MSAL v5 แบบ SPA + PKCE ไม่ต้องมี server และไม่มี client secret
 * ถ้าไม่ได้ตั้งค่า หรือโหลด MSAL ไม่ได้ (เช่นเปิดจากไฟล์ในเครื่อง)
 * จะรายงานว่าใช้ไม่ได้ แล้วให้แอปทำงานโหมดเครื่องเดียวต่อไป
 */
(function (global) {
  'use strict';

  var cfg = global.OrbitConfig || {};
  var app = null;      // PublicClientApplication
  var account = null;  // บัญชีที่ล็อกอินอยู่
  var ready = false;

  /* เปิดจากไฟล์ในเครื่อง (file://) ไม่มี origin ให้ลงทะเบียน redirect
   * MSAL จึงใช้ไม่ได้เลย ต้องตัดออกตั้งแต่ต้น ไม่ใช่ปล่อยให้ล้มตอนกดปุ่ม */
  function servedOverWeb() {
    var p = global.location.protocol;
    return p === 'https:' || p === 'http:';
  }

  /** ตั้งค่าครบ อยู่บนเว็บ และมีไลบรารีให้ใช้หรือยัง */
  function available() {
    return !!(cfg.clientId && cfg.tenantId && servedOverWeb() &&
              global.msal && global.msal.PublicClientApplication);
  }

  /** เหตุผลที่ใช้ไม่ได้ ไว้บอกผู้ใช้ให้ตรงจุด */
  function unavailableReason() {
    if (!cfg.clientId || !cfg.tenantId) return 'not-configured';
    if (!servedOverWeb()) return 'not-web';
    if (!global.msal || !global.msal.PublicClientApplication) return 'library-missing';
    return null;
  }

  var SCOPES = ['User.Read', 'User.ReadBasic.All', 'Files.ReadWrite.All'];

  /* รหัสประจำตัวใน Orbit ต้องมาจาก object id ของ Entra เท่านั้น
   * เพราะเป็นค่าเดียวกับที่ Microsoft Graph คืนมาตอนค้นหารายชื่อ
   * ถ้าใช้ค่าอื่น คนที่ผู้ดูแลเพิ่มไว้ล่วงหน้าจะไม่เชื่อมกับตอนเขาล็อกอินจริง */
  function orbitId(oid) {
    return 'u_' + String(oid || '').replace(/[^a-z0-9]/gi, '').slice(0, 32);
  }

  function redirectUri() {
    /* ต้องตรงกับที่ลงทะเบียนไว้ใน Entra เป๊ะ ๆ
     * ตัด index.html ออกด้วย ไม่งั้นเข้าจาก /orbit/ กับ /orbit/index.html
     * จะกลายเป็นคนละ URI แล้วติด AADSTS50011 */
    var path = global.location.pathname.replace(/index\.html?$/i, '');
    return global.location.origin + path;
  }

  /** เรียกครั้งเดียวตอนบูต คืน true ถ้าล็อกอินอยู่แล้ว */
  function init() {
    if (!available()) return Promise.resolve(false);

    app = new global.msal.PublicClientApplication({
      auth: {
        clientId: cfg.clientId,
        authority: 'https://login.microsoftonline.com/' + cfg.tenantId,
        redirectUri: redirectUri(),
        navigateToLoginRequestUrl: false
      },
      cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false }
    });

    return app.initialize()
      .then(function () { return app.handleRedirectPromise(); })
      .then(function (result) {
        if (result && result.account) account = result.account;
        else {
          var all = app.getAllAccounts();
          if (all.length) account = all[0];
        }
        if (account) app.setActiveAccount(account);
        ready = true;
        return !!account;
      })
      .catch(function (e) {
        console.error('เริ่ม MSAL ไม่สำเร็จ', e);
        ready = false;
        return false;
      });
  }

  function signIn() {
    if (!app) return Promise.reject(new Error('ยังไม่ได้ตั้งค่าการเข้าสู่ระบบ'));
    /* เคยล็อกอินในเครื่องนี้แล้ว (แค่หมดอายุ) ใช้บัญชีเดิมเลย ไม่ต้องเลือกบัญชีซ้ำ */
    if (account) return reauth();
    return app.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
  }

  function signOut() {
    if (!app || !account) return Promise.resolve();
    return app.logoutRedirect({ account: account, postLogoutRedirectUri: redirectUri() });
  }

  /* การเข้าสู่ระบบหมดอายุแบบที่ต้องให้คนกดเข้าสู่ระบบอีกครั้ง
   * ตั๋วต่ออายุของแอปแบบ SPA ใช้ได้ราว 24 ชั่วโมง พอหมด MSAL จะลองต่ออายุเงียบ ๆ ผ่าน iframe
   * ถ้าเบราว์เซอร์บล็อกคุกกี้ของเว็บอื่น (Safari, Chrome แบบเข้ม, เบราว์เซอร์ในแอป) จะรอจนหมดเวลา (timed_out)
   * ทั้งหมดนี้แก้ด้วยการเข้าสู่ระบบใหม่เท่านั้น จึงรวมเป็นเรื่องเดียว ไม่โชว์รหัส error ดิบให้คนอ่าน */
  var RELOGIN_CODES = ['timed_out', 'monitor_window_timeout', 'block_iframe_reload', 'login_required',
    'interaction_required', 'consent_required', 'no_tokens_found', 'invalid_grant', 'no_account_error'];

  function needsSignIn(e) {
    if (!e) return false;
    if (global.msal && e instanceof global.msal.InteractionRequiredAuthError) return true;
    return RELOGIN_CODES.indexOf(e.errorCode) >= 0 || RELOGIN_CODES.indexOf(e.subError) >= 0;
  }

  function expiredError(cause) {
    var err = new Error('การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
    err.authExpired = true;
    err.cause = cause;
    return err;
  }

  /** โทเคนสำหรับเรียก Graph — เงียบก่อน
   *
   * ต่ออายุไม่ได้ก็ไม่พาไปหน้าล็อกอินเองกลางคัน (เดิมทำแบบนั้น งานที่ยังไม่ได้ส่งขึ้นจะหาย
   * เพราะกลับมาแล้วแอปโหลดของกลางทับ) โยน error ที่ติดป้าย authExpired ให้ตัวซิงก์ตัดสินใจ
   * ตัวซิงก์จะจำไว้ว่ามีงานค้างส่ง แล้วให้คนกด "เข้าสู่ระบบอีกครั้ง" เอง */
  function token() {
    if (!app || !account) return Promise.reject(expiredError(null));
    return app.acquireTokenSilent({ scopes: SCOPES, account: account })
      .then(function (r) { return r.accessToken; })
      .catch(function (e) {
        if (needsSignIn(e)) throw expiredError(e);
        throw e;
      });
  }

  /** เข้าสู่ระบบอีกครั้งด้วยบัญชีเดิม ไม่ต้องเลือกบัญชีใหม่ถ้า Microsoft ยังจำได้ */
  function reauth() {
    if (!app) return Promise.reject(new Error('ยังไม่ได้ตั้งค่าการเข้าสู่ระบบ'));
    var hint = account ? account.username : '';
    try { if (hint) global.localStorage.setItem('orbit.auth.hint', hint); } catch (e) { /* ไม่มีที่เก็บ */ }
    return app.loginRedirect(hint ? { scopes: SCOPES, loginHint: hint } : { scopes: SCOPES, prompt: 'select_account' });
  }

  /** ข้อมูลผู้ใช้ที่ล็อกอินอยู่ แปลงเป็นรูปแบบที่ Orbit ใช้ */
  function profile() {
    if (!account) return null;
    var claims = account.idTokenClaims || {};
    // homeAccountId มีรูปแบบ {oid}.{tid} จึงใช้ส่วนหน้าเป็นตัวสำรองได้
    var oid = claims.oid || (account.homeAccountId || '').split('.')[0] || account.username;
    return {
      id: orbitId(oid),
      name: account.name || claims.name || account.username,
      email: account.username || claims.preferred_username || '',
      oid: oid
    };
  }

  global.OrbitAuth = {
    available: available,
    unavailableReason: unavailableReason,
    init: init,
    signIn: signIn,
    reauth: reauth,
    needsSignIn: needsSignIn,
    signOut: signOut,
    token: token,
    profile: profile,
    isSignedIn: function () { return !!account; },
    isReady: function () { return ready; },
    scopes: SCOPES, orbitId: orbitId,
    redirectUri: redirectUri
  };

})(window);

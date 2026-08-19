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

  var SCOPES = ['User.Read', 'Files.ReadWrite.All'];

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
    return app.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
  }

  function signOut() {
    if (!app || !account) return Promise.resolve();
    return app.logoutRedirect({ account: account, postLogoutRedirectUri: redirectUri() });
  }

  /** โทเคนสำหรับเรียก Graph — เงียบก่อน ถ้าไม่ได้ค่อยพาไปล็อกอินใหม่ */
  function token() {
    if (!app || !account) return Promise.reject(new Error('ยังไม่ได้เข้าสู่ระบบ'));
    return app.acquireTokenSilent({ scopes: SCOPES, account: account })
      .then(function (r) { return r.accessToken; })
      .catch(function (e) {
        if (e instanceof global.msal.InteractionRequiredAuthError) {
          return app.acquireTokenRedirect({ scopes: SCOPES, account: account });
        }
        throw e;
      });
  }

  /** ข้อมูลผู้ใช้ที่ล็อกอินอยู่ แปลงเป็นรูปแบบที่ Orbit ใช้ */
  function profile() {
    if (!account) return null;
    var claims = account.idTokenClaims || {};
    return {
      id: 'u_' + (account.homeAccountId || claims.oid || account.username).replace(/[^a-z0-9]/gi, '').slice(0, 24),
      name: account.name || claims.name || account.username,
      email: account.username || claims.preferred_username || '',
      oid: claims.oid || ''
    };
  }

  global.OrbitAuth = {
    available: available,
    unavailableReason: unavailableReason,
    init: init,
    signIn: signIn,
    signOut: signOut,
    token: token,
    profile: profile,
    isSignedIn: function () { return !!account; },
    isReady: function () { return ready; },
    scopes: SCOPES,
    redirectUri: redirectUri
  };

})(window);

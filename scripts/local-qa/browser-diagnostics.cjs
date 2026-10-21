'use strict';
const roles = new Set(['admin', 'merchant']);
const phases = new Set(['page-ready', 'toggle', 'fields', 'submit', 'session-response', 'navigation']);
const alerts = new Map([
  ['Kunne ikke logge ind. Prøv igen.', 'generic-login-rejected'],
  ['Kunne ikke logge ind. Kontrollér dine loginoplysninger og din adgang i mPanel.', 'login-or-access-rejected'],
  ['Login er midlertidigt utilgængeligt. Prøv igen.', 'session-unavailable'],
  ['For mange forsøg. Vent 10 minutter og prøv igen.', 'rate-limited'],
]);
const clientErrors = new Map([
  ['Local QA client configuration rejected', 'client-configuration-rejected'],
  ['Local QA client opt-in is required', 'client-opt-in-missing'],
  ['Local QA client runtime scope changed', 'client-scope-changed'],
  ['Local QA client binding state rejected', 'client-binding-state-rejected'],
  ['Local QA client Firestore instance changed', 'client-firestore-instance-changed'],
  ['auth/invalid-credential', 'auth-login-rejected'],
  ['auth/network-request-failed', 'auth-network-failed'],
  ['auth/invalid-api-key', 'auth-api-key-rejected'],
  ['auth/emulator-config-failed', 'auth-emulator-binding-rejected'],
]);
function diagnostics() {
  const state = { loginSubstage: null, admin: { loginPageStatus: null, authSignInStatus: null, sessionStatus: null, uiError: null, clientError: null },
    merchant: { loginPageStatus: null, authSignInStatus: null, sessionStatus: null, uiError: null, clientError: null } };
  const roleState = role => { if (!roles.has(role)) throw Error('QA0 diagnostic role rejected'); return state[role]; };
  return {
    mark(role, phase) { roleState(role); if (!phases.has(phase)) throw Error('QA0 diagnostic phase rejected'); state.loginSubstage = role + '-' + phase; },
    response(role, input, status) {
      const target = roleState(role); if (!Number.isInteger(status) || status < 100 || status > 599) return;
      let url; try { url = new URL(input); } catch { return; }
      if (url.username || url.password) return;
      if (url.origin === 'http://127.0.0.1:9099' && url.pathname === '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword') target.authSignInStatus = status;
      if (url.origin === 'http://127.0.0.1:3100' && url.pathname === '/admin-login') target.loginPageStatus = status;
      if (url.origin === 'http://127.0.0.1:3100' && url.pathname === '/api/admin/session') target.sessionStatus = status;
    },
    alert(role, text) { roleState(role).uiError = alerts.get(text) ?? 'other-ui-alert'; },
    clientError(role, message) { for (const [text, category] of clientErrors) if (typeof message === 'string' && message.includes(text)) roleState(role).clientError = category; },
    snapshot(error) {
      let failureCategory = 'browser-scenario-failed';
      if (error?.name === 'TimeoutError') failureCategory = 'timeout';
      else if (error?.name === 'AssertionError') failureCategory = 'assertion-failed';
      else if (error?.message === 'QA0 login UI rejected') failureCategory = 'ui-login-rejected';
      return { ...state, admin: { ...state.admin }, merchant: { ...state.merchant }, failureCategory };
    },
  };
}
function loginAlert(page) { return page.locator('form').getByRole('alert'); }
module.exports = { diagnostics, loginAlert };

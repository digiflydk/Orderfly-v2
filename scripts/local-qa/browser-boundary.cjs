'use strict';
const origins = new Set(['http://127.0.0.1:3100', 'http://127.0.0.1:9099', 'http://127.0.0.1:8088']);
function allowedRequest(value) {
  try { const url = new URL(value); return !url.username && !url.password && origins.has(url.origin); } catch { return false; }
}
function allowedSocket(value) {
  try { const url = new URL(value); return !url.username && !url.password && url.origin === 'ws://127.0.0.1:3100' && url.pathname === '/_next/webpack-hmr'; } catch { return false; }
}
async function guardedContext(browser, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: false });
  let blocked = 0;
  // Install both frontiers before creating a page or providing any credentials.
  await context.route('**/*', route => allowedRequest(route.request().url()) ? route.continue() : (blocked++, route.abort('blockedbyclient')));
  await context.routeWebSocket('**/*', socket => allowedSocket(socket.url()) ? socket.connectToServer() : (blocked++, socket.close()));
  return { context, blockedRequests: () => blocked };
}
module.exports = { allowedRequest, allowedSocket, guardedContext };

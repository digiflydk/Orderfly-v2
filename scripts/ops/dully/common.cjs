// Shared helpers for the daily Dully operations (feedback import, customer/purchase import, feedback drafts).
// Credentials come only from the environment and are never printed. The browser session is stored outside the repo.
const os = require('node:os');
const path = require('node:path');
// Prefer the container's preinstalled Playwright (matching its browser); fall back to the repo dependency.
const { chromium } = (() => { try { return require(require.resolve('playwright', { paths: ['/opt/node-tools/node_modules'] })); } catch { return require('playwright'); } })();
const { fromZonedTime, formatInTimeZone } = require('date-fns-tz');

const ORDERFLY = 'https://orderfly.dk';
const BRAND = 'oeypKaMyYcQjIwaa1PtV';
const LOCATION = 'eibiesSbluQTmp3mUqly';
const RESTAURANT_ID = 'esmeralda-amager';
const DULLY_CLIENT = 290;
const START = '2026-10-31';
const STATE = process.env.ORDERFLY_OPS_STATE || path.join(os.tmpdir(), 'orderfly-ops-state.json');
const TZ = 'Europe/Copenhagen';

const mask = s => String(s).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>').replace(/\+?\d[\d ]{6,}\d/g, '<phone>');
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());
// Dully times are Copenhagen wall-clock without offset, sometimes with 7 fraction digits.
const iso = s => fromZonedTime(String(s).replace(/\.\d+$/, ''), TZ).toISOString();
const isoCph = s => formatInTimeZone(fromZonedTime(String(s).replace(/\.\d+$/, ''), TZ), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
const byId = (a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true });

function need(name) { if (!process.env[name]) throw new Error('Missing environment variable ' + name); return process.env[name]; }

async function launch() { return chromium.launch(); }

/** Logs in to orderfly.dk as superadmin and saves the session. */
async function orderflyLogin(browser) {
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto(ORDERFLY + '/admin-login', { waitUntil: 'networkidle' });
  const submit = page.getByRole('button', { name: /^LOG IND$/ });
  const attempt = async () => {
    await page.fill('#identifier', need('ORDERFLY_TEST_ADMIN_NAME'));
    await page.fill('#password', need('ORDERFLY_TEST_ADMIN_PASSWORD'));
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'LOG IND')?.disabled);
    await submit.click();
    await page.waitForURL(u => !u.pathname.startsWith('/admin-login'), { timeout: 20000 }).catch(() => {});
  };
  await attempt();
  if (page.url().includes('/admin-login')) {
    const other = page.getByRole('button', { name: /Opsfly|separat Orderfly/ });
    if (await other.count()) { await other.first().click(); await attempt(); }
  }
  if (page.url().includes('/admin-login')) throw new Error('Orderfly login failed');
  await context.storageState({ path: STATE });
  await context.close();
}

/** An Orderfly page with the stored session; logs in again when the session has expired. */
async function orderflyPage(browser, pathname) {
  for (let round = 0; round < 2; round++) {
    let context;
    try { context = await browser.newContext({ storageState: STATE }); } catch { await orderflyLogin(browser); context = await browser.newContext({ storageState: STATE }); }
    const page = await context.newPage();
    await page.goto(ORDERFLY + pathname, { waitUntil: 'networkidle' });
    if (!page.url().includes('login')) { await page.waitForTimeout(2500); return page; }
    await context.close();
    await orderflyLogin(browser);
  }
  throw new Error('Could not open ' + pathname);
}

/** Logs in to admin.dully.io and returns a function that calls its API with the session's bearer token. */
async function dullySession(browser) {
  const page = await (await browser.newContext()).newPage();
  let auth = null;
  page.on('request', r => { if (r.url().includes('get-paginated-data')) auth = r.headers()['authorization']; });
  await page.goto('https://admin.dully.io/login', { waitUntil: 'networkidle' });
  await page.fill('input[name=email]', need('ADMIN_DULLY_EMAIL'));
  await page.fill('input[name=password]', need('ADMIN_DULLY_PASSWORD'));
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.locator('a[href="/order-list/orders"]').first().evaluate(a => a.click());
  for (let i = 0; i < 20 && !auth; i++) await page.waitForTimeout(500);
  if (!auth) throw new Error('Dully session token not captured');
  const call = (url, body) => page.evaluate(async ([url, body, auth]) => {
    const r = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth }, body: JSON.stringify(body) } : { headers: { authorization: auth } });
    return r.ok ? r.json() : null;
  }, [url, body, auth]);
  return {
    async orders(startDate, endDate = today()) {
      const all = new Map();
      for (const pre of [false, true]) {
        for (let pageNo = 0; pageNo < 50; pageNo++) {
          const res = await call('/api/order/get-paginated-data', { page: pageNo, pageSize: 100, filter: { paymentStatus: null, status: null, restaurantId: null, deliveryType: null, showActivePreOrders: pre, dateOption: 0, clientId: DULLY_CLIENT, startDate, endDate } });
          if (!res || !Array.isArray(res.data)) throw new Error('Dully order list failed');
          for (const o of res.data) all.set(o.id, o);
          if (res.data.length < 100) break;
        }
      }
      return [...all.values()].sort((a, b) => String(a.createdDate).localeCompare(String(b.createdDate)));
    },
    async full(id) {
      const m = await call('/api/order/get-full-model?orderId=' + id);
      const full = m && (m.data || m);
      if (!full || !full.order) throw new Error('Dully detail fetch failed for an order');
      // Dully returns lines in a random order; sort by line id so reimports compare equal.
      full.orderLines = [...(full.orderLines || [])].sort(byId);
      return full;
    },
  };
}

const experience = o => o.deliveryType === 0 ? 'pickup' : o.deliveryType === 10 ? 'delivery' : null;
const refunded = o => o.totalRefunded > 0 || o.isFullyRefunded;
function completedAt(o, full, orderedAt, toIso = iso) {
  if (o.status !== 1) return null;
  const done = (full?.orderStatusLogs || []).filter(l => l.status === 1).map(l => toIso(l.date)).sort().pop();
  let at = done || toIso(o.delivery || o.createdDate);
  if (Date.parse(at) < Date.parse(orderedAt)) at = orderedAt;
  if (Date.parse(at) > Date.now()) at = toIso(formatInTimeZone(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"));
  return at;
}
function lines(full) {
  const all = full.orderLines || [];
  return all.filter(l => l.parentId === null || l.parentId === undefined).slice(0, 100).map(l => {
    const kids = all.filter(c => c.parentId === l.id).map(c => String(c.productName || '').trim()).filter(Boolean);
    const base = String(l.productName || 'Vare').trim() || 'Vare';
    // Dully parent totals already include option prices.
    return { name: (kids.length ? base + ' (' + kids.join(', ') + ')' : base).slice(0, 160), quantity: Math.min(999, Math.max(1, Math.round(l.quantity || 1))), total: Math.round(Math.max(0, l.total || 0) * 100) / 100 };
  });
}
const nameOf = o => [o.firstName, o.lastName].map(x => (x || '').trim()).filter(Boolean).join(' ').slice(0, 160);
const phoneOf = o => (o.formattedPhone || o.phone || '').trim().slice(0, 40);

/** Opens the superadmin Dully page and checks it is bound to Esmeralda Amager. */
async function dullyAdmin(browser) {
  const page = await orderflyPage(browser, '/superadmin/feedback/dully');
  if (await page.locator('#dully-brand').inputValue() !== BRAND || await page.locator('#dully-location').inputValue() !== LOCATION) throw new Error('wrong scope');
  return page;
}
async function counts(page) {
  const dl = page.locator('dl').first();
  const text = (await dl.innerText()).split('\n').map(s => s.trim()).filter(Boolean);
  const out = {};
  for (let i = 0; i + 1 < text.length; i += 2) out[text[i]] = Number(text[i + 1]);
  return out;
}

module.exports = { ORDERFLY, BRAND, LOCATION, RESTAURANT_ID, START, STATE, TZ, mask, today, iso, isoCph, launch, orderflyLogin, orderflyPage, dullySession, experience, refunded, completedAt, lines, nameOf, phoneOf, dullyAdmin, counts };

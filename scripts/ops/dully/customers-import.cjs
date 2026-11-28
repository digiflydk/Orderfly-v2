// Daily Dully customer/purchase delta (#834). Usage: [BATCH=20] node scripts/ops/dully/customers-import.cjs import <YYYY-MM-DD>
// Imports Dully orders from the given date (normally three days back) as customer purchases for retention analysis.
// The import is idempotent. Prints counts only.
const c = require('./common.cjs');
const MODE = process.argv[2] || 'preview', SINCE = process.argv[3] || c.START, BATCH = Math.min(100, Number(process.env.BATCH || 20));
const ONLY = process.env.ONLY_ORDER || '';

(async () => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(SINCE)) throw new Error('Start date must be YYYY-MM-DD');
  const browser = await c.launch();
  try {
    const dully = await c.dullySession(browser);
    const orders = (await dully.orders(SINCE)).filter(o => !ONLY || String(o.orderNumber) === ONLY);
    const rows = [], skipped = {};
    for (const o of orders) {
      const exp = c.experience(o), email = (o.email || '').trim().toLowerCase(), phone = c.phoneOf(o);
      if (!exp || (!email && phone.length < 4)) { const k = !exp ? 'type' : 'nocontact'; skipped[k] = (skipped[k] || 0) + 1; continue; }
      const full = await dully.full(o.id);
      // Stored purchases use UTC ISO timestamps; reimports must match them exactly (order identity check).
      const orderedAt = c.iso(o.createdDate);
      const status = o.status === 1 ? 'completed' : 'pending';
      const row = { externalOrderId: String(o.id), orderNumber: String(o.orderNumber), externalRestaurantId: c.RESTAURANT_ID, experienceType: exp, orderedAt,
        completedAt: status === 'completed' ? c.completedAt(o, full, orderedAt) : null, status,
        paymentStatus: c.refunded(o) ? 'refunded' : (o.paymentStatus === 20 ? 'paid' : 'unpaid'),
        orderTotal: Math.round(Math.max(0, o.total || 0) * 100) / 100, orderLines: c.lines(full) };
      if (email) row.email = email;
      if (phone.length >= 4) row.phone = phone;
      const name = c.nameOf(o); if (name) row.customerName = name;
      if (o.totalRefunded > 0) row.refundedAmount = Math.round(o.totalRefunded * 100) / 100;
      const a = full.order || {};
      if (exp === 'delivery' && String(a.address || '').trim()) row.address = { street: String(a.address).trim().slice(0, 200), ...(String(a.zip || '').trim() ? { postalCode: String(a.zip).trim().slice(0, 20) } : {}), ...(String(a.city || '').trim() ? { city: String(a.city).trim().slice(0, 100) } : {}) };
      rows.push(row);
    }
    console.log('orders', orders.length, 'rows', rows.length, 'skipped', JSON.stringify(skipped));
    if (MODE === 'list') console.log('orderNumbers', rows.map(r => r.orderNumber + ':' + r.orderedAt.slice(0, 10)).join(' '));
    if (MODE !== 'import') return;
    const page = await c.dullyAdmin(browser);
    const sum = { customers: 0, linked: 0, created: 0, updated: 0, unchanged: 0, conflicts: 0 };
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      // The page shows only the latest result message, so start each batch from a fresh page.
      if (i > 0) { await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); }
      await page.locator('#dully-customers-json').fill(JSON.stringify(batch));
      await page.getByRole('button', { name: new RegExp('^Importér ' + batch.length + ' kundekøb$') }).click();
      await page.waitForFunction(() => /Kundeimport behandlet:|kunne ikke gennemføres/.test(document.body.innerText), null, { timeout: 300000 });
      const text = await page.locator('body').innerText();
      if (/kunne ikke gennemføres/.test(text)) throw new Error('Customer import failed in batch ' + (i / BATCH + 1));
      const all = text.match(/Kundeimport behandlet:[^\n]*/g), msg = all[all.length - 1];
      const n = msg.match(/(\d+) nye kunder, (\d+) køb koblet til eksisterende kunder, (\d+) nye, (\d+) opdaterede og (\d+) uændrede køb\. (\d+) køb afventer/);
      if (n) ['customers', 'linked', 'created', 'updated', 'unchanged', 'conflicts'].forEach((k, j) => { sum[k] += Number(n[j + 1]); });
      console.log('batch', i / BATCH + 1, new Date().toISOString().slice(11, 19), msg);
    }
    console.log('total', JSON.stringify(sum));
  } finally { await browser.close(); }
})().catch(e => { console.error('ERROR', c.mask(e.message)); process.exit(1); });

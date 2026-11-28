// Daily Dully feedback import (#824). Usage: node scripts/ops/dully/feedback-import.cjs [preview|import]
// Fetches Esmeralda orders from Dully since START, with details (name, phone, lines, real completion time),
// and imports them on the superadmin Dully page in batches of at most 100. Prints counts only.
const c = require('./common.cjs');
const MODE = process.argv[2] || 'preview';

(async () => {
  const browser = await c.launch();
  try {
    const dully = await c.dullySession(browser);
    const orders = await dully.orders(c.START);
    const rows = [], skipped = {};
    for (const o of orders) {
      const exp = c.experience(o);
      if (!exp || !o.email) { skipped[!exp ? 'type' : 'noemail'] = (skipped[!exp ? 'type' : 'noemail'] || 0) + 1; continue; }
      const full = await dully.full(o.id);
      const orderedAt = c.iso(o.createdDate);
      const status = o.status === 1 ? 'completed' : 'pending';
      const row = { externalOrderId: String(o.id), orderNumber: String(o.orderNumber), externalRestaurantId: c.RESTAURANT_ID, email: o.email.trim().toLowerCase(),
        experienceType: exp, orderedAt, completedAt: status === 'completed' ? c.completedAt(o, full, orderedAt) : null, status,
        paymentStatus: c.refunded(o) ? 'refunded' : (o.paymentStatus === 20 ? 'paid' : 'unpaid') };
      const name = c.nameOf(o); if (name) row.customerName = name;
      const phone = c.phoneOf(o); if (phone.length >= 4) row.customerPhone = phone;
      if (Number.isFinite(o.total)) row.orderTotal = Math.round(o.total * 100) / 100;
      row.orderLines = c.lines(full);
      rows.push(row);
    }
    console.log('orders', orders.length, 'rows', rows.length, 'skipped', JSON.stringify(skipped));
    if (MODE !== 'import') return;
    const page = await c.dullyAdmin(browser);
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      // The page shows only the latest result message, so start each batch from a fresh page.
      if (i > 0) { await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500); }
      await page.getByLabel('Ordreudtræk (JSON)').fill(JSON.stringify(batch));
      await page.getByRole('button', { name: 'Forhåndsvis import' }).click();
      await page.getByRole('button', { name: new RegExp('^Importér ' + batch.length + ' ordrer$') }).click();
      await page.waitForFunction(() => /Import behandlet:|kunne ikke gennemføres/.test(document.body.innerText), null, { timeout: 180000 });
      const text = await page.locator('body').innerText();
      if (/kunne ikke gennemføres/.test(text)) throw new Error('Import failed: ' + c.mask(text.match(/[^\n]*kunne ikke gennemføres[^\n]*/)[0]));
      const all = text.match(/Import behandlet:[^\n]*/g);
      console.log('batch', i / 100 + 1, all[all.length - 1]);
    }
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000);
    console.log('counts', JSON.stringify(await c.counts(page)));
  } finally { await browser.close(); }
})().catch(e => { console.error('ERROR', c.mask(e.message)); process.exit(1); });

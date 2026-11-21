// Feedback reply drafts (#901). Never sends: it only clicks "Gem kladde".
//   node scripts/ops/dully/feedback-drafts.cjs inbox            – newest feedback (source, rating, date, id), no names
//   node scripts/ops/dully/feedback-drafts.cjs detail <id>      – answers, reply card and Dully order, e-mail/phone masked
//   node scripts/ops/dully/feedback-drafts.cjs save <id> <file> – saves the file's text as a draft
const fs = require('node:fs');
const c = require('./common.cjs');
const [cmd, id, file] = process.argv.slice(2);

(async () => {
  const browser = await c.launch();
  try {
    if (cmd === 'inbox') {
      const page = await c.orderflyPage(browser, '/superadmin/feedback');
      const rows = page.locator('tbody tr'), n = Math.min(await rows.count(), Number(process.env.LIMIT || 10));
      for (let i = 0; i < n; i++) {
        const cells = (await rows.nth(i).locator('td').allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim());
        await rows.nth(i).locator('button').last().click();
        const menu = page.getByRole('menu').last();
        await menu.waitFor();
        const href = await menu.locator('a').first().getAttribute('href').catch(() => null);
        await page.keyboard.press('Escape'); await menu.waitFor({ state: 'hidden' }).catch(() => {});
        console.log([(href || '').split('/').pop(), cells[0].split(' ')[0], cells[1], cells[4]].join(' | '));
      }
    } else if (cmd === 'detail' && /^[a-f0-9]{64}$/.test(id || '')) {
      const page = await c.orderflyPage(browser, '/superadmin/feedback/' + id);
      const text = async loc => (await loc.count()) ? c.mask(await loc.innerText()).split('\n').filter(Boolean) : [];
      console.log('RESPONSES', JSON.stringify(await text(page.getByText('Customer Responses').locator('xpath=ancestor::div[contains(@class,"rounded")][1]'))));
      console.log('THREAD', JSON.stringify(await text(page.getByTestId('reply-thread'))));
      console.log('ORDER', JSON.stringify((await text(page.getByTestId('dully-order'))).slice(4)));
    } else if (cmd === 'save' && /^[a-f0-9]{64}$/.test(id || '') && file) {
      const page = await c.orderflyPage(browser, '/superadmin/feedback/' + id);
      const card = page.getByTestId('reply-thread'), box = card.locator('textarea');
      if (await box.count() !== 1) throw new Error('Expected one reply field');
      await box.fill(fs.readFileSync(file, 'utf8').trim());
      const approve = card.getByRole('checkbox');
      if (await approve.count() && await approve.isChecked()) throw new Error('Approval is checked; refusing');
      await card.getByRole('button', { name: 'Gem kladde' }).click();
      await page.waitForFunction(() => /Kladden er gemt|kunne ikke/.test(document.querySelector('[data-testid=reply-thread]')?.innerText || ''), null, { timeout: 30000 });
      console.log(c.mask(await card.innerText()).split('\n').filter(Boolean).slice(-2).join(' | '));
    } else throw new Error('Usage: inbox | detail <id> | save <id> <file>');
  } finally { await browser.close(); }
})().catch(e => { console.error('ERROR', c.mask(e.message)); process.exit(1); });

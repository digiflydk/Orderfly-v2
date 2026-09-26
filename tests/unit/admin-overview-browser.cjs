// Actual overview component and compiled admin CSS; only navigation and records are synthetic.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { chromium, expect } = require('@playwright/test');
const sharp = require('sharp');
const webpackModule = require('next/dist/compiled/webpack/webpack');
webpackModule.init();

const root = process.cwd();
let dir, server, browser, origin;
const brands = [{ id: 'a', name: 'Nord' }, { id: 'b', name: 'Syd' }];
const locations = [{ id: 'la', name: 'Nord Station', brandId: 'a' }, { id: 'lb', name: 'Syd Torv', brandId: 'b' }];

async function compareApprovedVisual(name, screenshot) {
  // Approved from the browser artifact of CI run 36242305336. Downsampling
  // tolerates small glyph differences while detecting palette and layout drift.
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'tests/visual-baselines', `admin-overview-${name}.json`), 'utf8'));
  const { data, info } = await sharp(screenshot).resize({ width: 96 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, baseline.width, `${name} visual width`);
  assert.equal(info.height, baseline.height, `${name} visual height`);
  const approved = zlib.inflateSync(Buffer.from(baseline.rgbDeflate, 'base64'));
  assert.equal(data.length, approved.length, `${name} visual sample length`);
  let error = 0, changed = 0;
  for (let i = 0; i < data.length; i += 3) {
    const difference = (Math.abs(data[i] - approved[i]) + Math.abs(data[i + 1] - approved[i + 1]) + Math.abs(data[i + 2] - approved[i + 2])) / 3;
    error += difference;
    if (difference > 24) changed++;
  }
  const pixels = data.length / 3;
  assert.ok(error / pixels < 6 && changed / pixels < .08, `${name} differs from approved overview: mean RGB error ${(error / pixels).toFixed(2)}, changed pixels ${(100 * changed / pixels).toFixed(1)}%`);
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orderfly-admin-visual-'));
  const entry = path.join(dir, 'entry.js');
  fs.writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';
    import {AdminOverview} from ${JSON.stringify(path.join(root, 'src/app/superadmin/overview-client.tsx'))};
    import {SuperAdminLayoutClient} from ${JSON.stringify(path.join(root, 'src/components/superadmin/superadmin-layout-client.tsx'))};
    const destinations=[{href:'/superadmin/dashboard',label:'Salgsoverblik',description:'Følg ordrer og omsætning.'},{href:'/superadmin/sales/orders',label:'Ordrer',description:'Find de seneste ordrer.'},{href:'/superadmin/products',label:'Produkter',description:'Vedligehold sortimentet.'}];
    const overview=<AdminOverview brands={${JSON.stringify(brands)}} locations={${JSON.stringify(locations)}} destinations={destinations}/>;
    createRoot(document.getElementById('root')).render(location.pathname==='/shell'
      ? <SuperAdminLayoutClient access={{superuser:false,permissions:['orderfly.analytics:view','orderfly.orders:view','orderfly.catalog:view']}}>{overview}</SuperAdminLayoutClient>
      : overview);`);
  const link = path.join(dir, 'link.js');
  fs.writeFileSync(link, `import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`);
  const navigation = path.join(dir, 'navigation.js');
  fs.writeFileSync(navigation, `export function usePathname(){return '/superadmin'};export function useRouter(){return {push(){}}};export function useSearchParams(){return new URLSearchParams()}`);
  const auth = path.join(dir, 'auth.js');
  fs.writeFileSync(auth, `export async function getSuperadminUserContext(){return null}`);
  const picture = path.join(dir, 'image.js');
  fs.writeFileSync(picture, `import React from 'react';export default function Image({alt}){return <span role="img" aria-label={alt}>Orderfly</span>}`);
  const loader = path.join(dir, 'loader.js');
  fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({
    mode: 'development', devtool: false, entry,
    output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: { '@/components/superadmin/admin-link': link, '@/lib/auth/superadmin-context': auth, 'next/navigation': navigation, 'next/image': picture, '@': path.join(root, 'src') }, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }, { test: /(?:admin-visual-|orderfly-admin-visual-).*\.js$/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  execFileSync(path.join(root, 'node_modules/.bin/tailwindcss'), ['-c', path.join(root, 'tailwind.config.ts'), '-i', path.join(root, 'src/app/globals.css'), '-o', path.join(dir, 'styles.css'), '--minify'], { cwd: root, stdio: 'pipe' });
  const styles = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/styles/admin-ui.css'), 'utf8');
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
    if (req.url === '/styles.css') { res.setHeader('content-type', 'text/css'); return res.end(styles); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body>' + (req.url === '/shell' ? '<div id="root"></div>' : '<main class="admin-shell min-h-screen bg-background p-4 md:p-8"><div id="root" class="mx-auto max-w-6xl"></div></main>') + '<script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  test(`shared Orderfly overview renders and filters at ${name} width`, async t => {
    const context = await browser.newContext({ viewport: { width, height } });
    t.after(() => context.close());
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await expect(page.getByRole('heading', { name: 'Overblik' })).toBeVisible();
    await expect(page.locator('.admin-shell')).toHaveCSS('color', 'rgb(23, 35, 46)');
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    const screenshot = await page.screenshot({ path: path.join(root, 'test-results', `admin-overview-${name}.png`), fullPage: true });
    await compareApprovedVisual(name, screenshot);
    // Radix mounts dialog/select/menu content under body, outside .admin-shell.
    const portalTheme = await page.evaluate(() => {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.className = 'bg-popover text-popover-foreground';
      const action = document.createElement('button');
      action.className = 'bg-primary text-primary-foreground';
      dialog.append(action);
      document.body.append(dialog);
      const styles = getComputedStyle(action);
      return { primary: styles.getPropertyValue('--primary').trim(), background: styles.backgroundColor, color: styles.color, font: styles.fontFamily };
    });
    assert.equal(portalTheme.primary, '195 88% 32.55%');
    assert.equal(portalTheme.background, 'rgb(10, 120, 156)');
    assert.equal(portalTheme.color, 'rgb(255, 255, 255)');
    assert.match(portalTheme.font, /Inter/);
    await expect(page.locator('.admin-shell')).toHaveCSS('background-color', 'rgb(247, 249, 251)');
    const brandSelect = page.locator('.admin-filter-bar select').first();
    const locationSelect = page.locator('.admin-filter-bar select').nth(1);
    await expect(brandSelect).toBeVisible();
    await brandSelect.selectOption('b');
    await expect(page.getByText('Brands i udvalget').locator('..').locator('..')).toContainText('1');
    await locationSelect.selectOption('lb');
    assert.equal(await locationSelect.inputValue(), 'lb');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, `${name} horizontal overflow: ${overflow}px`);
    const storefrontPrimary = await page.evaluate(() => {
      document.querySelector('.admin-shell').remove();
      return getComputedStyle(document.querySelector('[role="dialog"] button')).getPropertyValue('--primary').trim();
    });
    assert.equal(storefrontPrimary, '16 100% 66%');
    assert.deepEqual(errors, []);
  });
}

for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  test(`complete Orderfly admin shell stays consistent at ${name} width`, async t => {
    const context = await browser.newContext({ viewport: { width, height } });
    t.after(() => context.close());
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/shell');
    await expect(page.getByRole('heading', { name: 'Overblik' })).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 249, 251)');
    const sidebar = page.locator('[data-sidebar="sidebar"]');
    if (name === 'mobile') {
      await expect(page.locator('header a[href="/superadmin"]')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Log ud' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
    }
    await expect(sidebar).toHaveCount(1);
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator('[data-sidebar="content"]')).toHaveCSS('background-color', 'rgb(20, 38, 52)');
    await expect(sidebar.locator('a[href="/superadmin"] svg')).toHaveCSS('width', '20px');
    await expect(sidebar.locator('a[href="/superadmin"]')).toHaveCSS('font-size', '16px');
    await expect(sidebar.locator('a[href="/superadmin"]')).toHaveCSS('font-weight', '700');
    await expect(sidebar.getByRole('button', { name: 'Log ud' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, `${name} shell horizontal overflow: ${overflow}px`);
    assert.deepEqual(errors, []);
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    if (name === 'mobile') {
      await expect.poll(async () => Math.round((await sidebar.boundingBox())?.x ?? -999)).toBe(0);
      await page.screenshot({ path: path.join(root, 'test-results', 'admin-shell-mobile-menu.png'), fullPage: true });
      await page.keyboard.press('Escape');
      await expect(sidebar).toHaveCount(0);
    }
    await page.screenshot({ path: path.join(root, 'test-results', `admin-shell-${name}.png`), fullPage: true });
  });
}

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const sharp = require('sharp');
const jsQR = require('jsqr');
const QRCode = require('qrcode');
const { loadTs } = require('../helpers/load-ts.cjs');
const { qrScanUrl, qrSlugFromScanCode } = loadTs('src/lib/qr/scan-url.ts');
const { renderQr } = loadTs('src/lib/qr/render.ts', { sharp: { default: sharp }, jsqr: { default: jsQR } });
const code = url => new URL(url).pathname.split('/').at(-1);

test('scan URL preserves all 128 bits and distinguishes existing legacy and compact index keys', () => {
  for (const bytes of [Buffer.alloc(16), Buffer.alloc(16, 255), ...Array.from({ length: 100 }, () => randomBytes(16))]) {
    for (const slug of [bytes.toString('hex'), bytes.toString('base64url')]) {
      const url = qrScanUrl(slug);
      assert.equal(qrSlugFromScanCode(code(url)), slug);
      assert.match(url, /^HTTPS:\/\/ORDERFLY\.DK\/R\/[LC][0-9A-Z]{25}$/);
      assert.equal(QRCode.create(url, { errorCorrectionLevel: 'H' }).modules.size, 33);
    }
    assert.notEqual(qrScanUrl(bytes.toString('hex')), qrScanUrl(bytes.toString('base64url')));
  }
});

test('scan code rejects noncanonical, overflow and malformed inputs without truncating identity', () => {
  for (const value of ['', 'a'.repeat(32), 'C' + 'Z'.repeat(25), 'L' + '0'.repeat(24), 'C' + '0'.repeat(26), 'c' + '0'.repeat(25), 'X' + '0'.repeat(25), 'C' + 'a'.repeat(25), 'C' + '0'.repeat(24) + '/']) assert.equal(qrSlugFromScanCode(value), null);
  for (const value of ['', 'bad', 'A'.repeat(32), 'A'.repeat(21) + 'B']) assert.throws(() => qrScanUrl(value), /invalid_qr_slug/);
});

test('actual compact identity produces less dense H-level PNG and SVG that survive downscaling with a logo', async () => {
  const slug = 'OylCstsSz_yd1R2ZICbljg', payload = qrScanUrl(slug);
  assert.equal(qrSlugFromScanCode(code(payload)), slug);
  assert.equal(QRCode.create('https://orderfly.dk/q/' + slug, { errorCorrectionLevel: 'H' }).modules.size, 37);
  const logo = await sharp(Buffer.from('<svg width="104" height="76"><rect width="104" height="76" fill="white"/><path d="M5 25h94v4H5zm0 10h94v4H5zm0 10h94v4H5z" fill="black"/></svg>')).png().toBuffer();
  for (const moduleShape of ['square', 'rounded', 'dots']) {
    const result = await renderQr(payload, { moduleShape, cornerShape: 'extra-rounded', logo, logoSizePercent: 25 });
    assert.equal(result.moduleCount, 33);
    assert.equal(result.style.errorCorrectionLevel, 'H');
    for (const source of [result.png, Buffer.from(result.svg)]) for (const size of [512, 165, 128, 112, 96]) {
      const { data, info } = await sharp(source).resize(size, size).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data, payload, `${moduleShape} at ${size}px`);
    }
  }
});

test('new route delegates both GET and HEAD to the original stored slug, including invalid-input rejection', async () => {
  const calls = [];
  const route = loadTs('src/app/R/[code]/route.ts', { '@/app/q/[code]/route': { GET: async (request, context) => {
    calls.push([request, (await context.params).code]); return new Response(null, { status: 302 });
  } } });
  for (const slug of ['a'.repeat(32), 'OylCstsSz_yd1R2ZICbljg']) for (const method of ['GET', 'HEAD']) {
    const url = qrScanUrl(slug), request = new Request(url, { method });
    await route[method](request, { params: Promise.resolve({ code: code(url) }) });
    assert.deepEqual(calls.at(-1), [request, slug]);
  }
  await route.HEAD(new Request('https://orderfly.dk/R/invalid', { method: 'HEAD' }), { params: Promise.resolve({ code: 'invalid' }) });
  assert.equal(calls.at(-1)[1], '');
});

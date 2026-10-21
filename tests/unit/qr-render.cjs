const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const jsQR = require('jsqr');
const { loadTs } = require('../helpers/load-ts.cjs');
const { renderQr, QrRenderError } = loadTs('src/lib/qr/render.ts');

async function decode(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data;
}

test('PNG and SVG exports decode to the exact same UTF-8 payload at supported sizes', async () => {
  const payload = 'https://esmeralda.orderfly.dk/club/tilmeld?utm_source=skilt&utm_campaign=blåbær';
  for (const width of [256, 512, 1024]) {
    const result = await renderQr(payload, { width });
    assert.equal(await decode(result.png), payload);
    assert.equal(await decode(await sharp(Buffer.from(result.svg)).png().toBuffer()), payload);
    assert.equal((await sharp(result.png).metadata()).width, width);
    assert.equal(result.width, width);
    assert.ok(result.moduleCount >= 21);
    assert.equal(result.style.margin, 4);
    assert.equal(result.style.errorCorrectionLevel, 'H');
  }
});

test('all correction levels, custom quiet zones and high-contrast brand colours decode', async () => {
  for (const errorCorrectionLevel of ['L', 'M', 'Q', 'H']) {
    const result = await renderQr('WIFI:T:WPA;S:Esmeralda;P:abc12345;;', {
      errorCorrectionLevel, width: 512, margin: 8, dark: '#123322', light: '#fff9ef',
    });
    assert.equal(await decode(result.png), 'WIFI:T:WPA;S:Esmeralda;P:abc12345;;');
    // Corners remain the light colour, including its fully opaque alpha.
    const { data } = await sharp(result.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual(Array.from(data.subarray(0, 4)), [255, 249, 239, 255]);
  }
});

test('style, colour and capacity refusals do not produce unsafe or unreadable downloads', async () => {
  const rejects = async (options, code = 'invalid_style', payload = 'https://example.com') => {
    await assert.rejects(renderQr(payload, options), error => error instanceof QrRenderError && error.code === code);
  };
  for (const width of [0, 127, 4097, 256.5, NaN, Infinity, '512']) await rejects({ width });
  for (const margin of [-1, 0, 3, 33, 4.5, '4']) await rejects({ margin });
  for (const colour of ['red', '#fff', '#ffffff00', 'url(javascript:1)', '#fff\"/><script>1</script>']) await rejects({ dark: colour });
  await rejects({ dark: '#ffffff', light: '#000000' }, 'insufficient_contrast');
  await rejects({ dark: '#999999', light: '#ffffff' }, 'insufficient_contrast');
  await rejects({ errorCorrectionLevel: 'X' });
  await rejects({ logo: 'https://attacker.invalid/image' });
  await rejects(null);
  await rejects([]);
  await rejects({ width: 128 }, 'payload_too_dense', 'https://example.com/' + 'long'.repeat(50));
  await rejects({}, 'payload_too_dense', 'a'.repeat(1800));
});

test('invalid and oversized payloads fail while valid Unicode remains exact', async () => {
  for (const payload of ['', '   ', null, 123, 'a'.repeat(2049), '\ud800', '\udc00']) {
    await assert.rejects(renderQr(payload), error => error.code === 'invalid_payload');
  }
  const payload = 'Hej 👋 ÆØÅ æøå';
  assert.equal(await decode((await renderQr(payload)).png), payload);
});

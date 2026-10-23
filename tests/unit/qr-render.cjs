const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const jsQR = require('jsqr');
const { loadTs } = require('../helpers/load-ts.cjs');
const { renderQr, QrRenderError } = loadTs('src/lib/qr/render.ts', {
  sharp: { default: sharp }, jsqr: { default: jsQR },
});
const { qrPrintHtml } = loadTs('src/lib/qr/print.ts');

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
  await rejects({ logo: 'https://attacker.invalid/image' }, 'invalid_logo');
  await rejects(null);
  await rejects([]);
  await rejects({ width: 128 }, 'payload_too_dense', 'https://example.com/' + 'long'.repeat(50));
  await rejects({}, 'payload_too_dense', 'a'.repeat(1800));
});

test('bounded PNG and JPEG logos decode in the actual final PNG and SVG exports', async () => {
  const payload = 'https://esmeralda.orderfly.dk/club/tilmeld?utm_source=restaurant';
  for (const format of ['png', 'jpeg']) {
    const logo = await sharp({ create: { width: 80, height: 30, channels: 3, background: '#e55221' } })[format]().toBuffer();
    for (const width of [256, 512, 1024]) {
      const result = await renderQr(payload, { width, logo });
      assert.equal(await decode(result.png), payload);
      assert.equal(await decode(await sharp(Buffer.from(result.svg)).png().toBuffer()), payload);
      assert.match(result.svg, /href="data:image\/png;base64,/);
      assert.equal('logo' in result.style, false);
    }
  }
});

test('logo input refuses SVG, URLs, decompression dimensions and unsupported correction', async () => {
  const payload = 'https://example.com';
  const logo = await sharp({ create: { width: 30, height: 30, channels: 4, background: '#111111' } }).png().toBuffer();
  const tooWide = await sharp({ create: { width: 2049, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer();
  for (const bad of [Buffer.from('<svg></svg>'), 'https://example.com/logo.png', Buffer.alloc(2 * 1024 * 1024 + 1), tooWide,
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])]) {
    await assert.rejects(renderQr(payload, { logo: bad }), error => error.code === 'invalid_logo');
  }
  await assert.rejects(renderQr(payload, { logo, errorCorrectionLevel: 'M' }), error => error.code === 'invalid_logo');
  const failedDecoder = loadTs('src/lib/qr/render.ts', { sharp: { default: sharp }, jsqr: { default: () => null } });
  await assert.rejects(failedDecoder.renderQr(payload, { logo }), error => error.code === 'unreadable_logo');
});

test('print document escapes text, preserves quiet-zone image and bounds physical sizing', async () => {
  const qr = await renderQr('https://example.com');
  const title = '<img src=x onerror=alert(1)> & "title"';
  const html = qrPrintHtml(qr, { title, caption: '</p><script>alert(1)</script>', sizeMm: 50 });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;title&quot;'));
  assert.ok(html.includes('width:50mm;height:50mm'));
  assert.ok(html.includes(qr.png.toString('base64')));
  assert.ok(html.includes('default-src \'none\''));
  for (const options of [{ sizeMm: 0 }, { sizeMm: 151 }, { sizeMm: NaN }, { sizeMm: '50' },
    { title: 'x'.repeat(251) }, { caption: 'x'.repeat(501) }, { unknown: true }, null]) {
    assert.throws(() => qrPrintHtml(qr, options), /invalid_print_options/);
  }
  assert.throws(() => qrPrintHtml({ ...qr, moduleCount: 177 }, { sizeMm: 25 }), /invalid_print_options/);
  assert.throws(() => qrPrintHtml({ ...qr, width: '\" onerror=\"alert(1)' }), /invalid_print_options/);
});

test('invalid and oversized payloads fail while valid Unicode remains exact', async () => {
  for (const payload of ['', '   ', null, 123, 'a'.repeat(2049), '\ud800', '\udc00']) {
    await assert.rejects(renderQr(payload), error => error.code === 'invalid_payload');
  }
  const payload = 'Hej 👋 ÆØÅ æøå';
  assert.equal(await decode((await renderQr(payload)).png), payload);
});

test('six module patterns and all finder styles preserve the permanent payload in PNG and SVG with a saved logo', async () => {
  const payload='https://orderfly.dk/q/b31e5762cbadc412ca470823a28a87d5';
  const logo=await sharp({create:{width:300,height:180,channels:4,background:'#164e3b'}}).png().toBuffer();
  for(const moduleShape of ['square','dots','rounded','horizontal','vertical','diamond']) {
    const result=await renderQr(payload,{width:512,errorCorrectionLevel:'H',moduleShape,cornerShapes:['square','rounded','extra-rounded'],cornerColor:'#164e3b',logoBase64:logo.toString('base64')});
    assert.equal(await decode(result.png),payload,moduleShape);
    assert.equal(await decode(await sharp(Buffer.from(result.svg)).png().toBuffer()),payload,moduleShape+' SVG');
    assert.ok(result.svg.includes('<image'));
  }
});
test('style inputs reject invalid pattern, finder, color and logo bytes instead of serving unreadable assets',async()=>{
  for(const options of [{moduleShape:'script'},{cornerShape:'circle'},{cornerShapes:['square']},{cornerShapes:['square','rounded','bad']},{cornerColor:'#ffffff'},{cornerColor:'url(https://example.com)'},{logoBase64:'PHN2Zy8+'}])
    await assert.rejects(renderQr('https://example.com',options));
});


test('logo size is bounded and PNG/SVG geometry and payload match at 15, 25 and 30 percent', async () => {
  const logo=await sharp({create:{width:180,height:100,channels:4,background:'#123322'}}).png().toBuffer();
  const payload='https://orderfly.dk/q/b31e5762cbadc412ca470823a28a87d5';
  for(const logoSizePercent of [15,25,30]) {
    const result=await renderQr(payload,{logo,logoSizePercent,moduleShape:'dots',cornerShape:'extra-rounded'});
    assert.equal(await decode(result.png),payload);
    assert.equal(await decode(await sharp(Buffer.from(result.svg)).png().toBuffer()),payload);
    const image=result.svg.match(/<image[^>]*width="([^"]+)"/);
    assert.ok(image); const expected=Math.floor(result.moduleCount/(result.moduleCount+8)*512*logoSizePercent/100)/512*(result.moduleCount+8);
    assert.equal(Number(image[1]),expected);
  }
  const legacy=await renderQr(payload,{logo});
  const explicit=await renderQr(payload,{logo,logoSizePercent:15});
  assert.deepEqual(legacy.png,explicit.png);
  for(const logoSizePercent of [14,31,25.5,NaN,Infinity,'25',null])
    await assert.rejects(renderQr(payload,{logo,logoSizePercent}),e=>e.code==='invalid_style');
});

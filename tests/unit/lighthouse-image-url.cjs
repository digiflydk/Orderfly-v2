const {test}=require('node:test');
const assert=require('node:assert/strict');
const {menuImageKindFromRequest}=require('../../scripts/lighthouse-image-url.cjs');

test('Lighthouse correctly classifies direct and Next-optimized Esmeralda image requests',()=>{
  const thumb='/images/esmeralda-v2/menu/pizza-example-192.webp';
  const full='/images/esmeralda-v2/menu/pizza-example.webp';
  for(const url of [
    thumb,
    'https://esmeralda.orderfly.dk'+thumb,
    'https://esmeralda.orderfly.dk/_next/image?url=%2Fimages%2Fesmeralda-v2%2Fmenu%2Fpizza-example-192.webp&w=256&q=75',
    'https://esmeralda.orderfly.dk/_next/image?url='+encodeURIComponent(thumb)+'&w=256&q=75',
  ]) assert.equal(menuImageKindFromRequest(url),'thumb',url);
  assert.equal(menuImageKindFromRequest(full),'full');
  assert.equal(menuImageKindFromRequest('https://esmeralda.orderfly.dk/_next/image?url='+encodeURIComponent(full)+'&w=1080&q=75'),'full');
  for(const invalid of ['/images/esmeralda-v2/menu/secret', '/images/other/menu/pizza-192.webp','https://example.com/foo.webp','/_next/image?w=256&q=75','/_next/image?url=https%3A%2F%2Fevil.example%2Ffood.webp&w=256','',null]) {
    assert.equal(menuImageKindFromRequest(invalid),null,String(invalid));
  }
});

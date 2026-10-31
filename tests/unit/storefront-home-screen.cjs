const {test} = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const {loadTs} = require('../helpers/load-ts.cjs');
const {fixture,brand,resolvedMetadata} = require('../helpers/storefront-home-screen-fixture.cjs');
const image = loadTs('src/lib/server/home-screen-icon.ts', {'server-only':{},sharp:{default:sharp}});
const context = (slug='esmeralda',size='180') => ({params:Promise.resolve({brandSlug:slug,size})});
const request = (host='esmeralda.orderfly.dk') => new Request('https://orderfly.dk/api/storefront/brands/esmeralda/manifest.webmanifest',{headers:{host}});

test('real brand layout supplies brand title, Apple title and only brand icon metadata on root and nested pages',async()=>{
  const f=fixture();
  const metadata=await f.metadata(context());
  const result=await resolvedMetadata(metadata);
  assert.equal(result.title.absolute,brand.name);
  assert.equal(result.appleWebApp.title,brand.name);
  assert.equal(result.applicationName,brand.name);
  assert.match(result.manifest,/^\/api\/storefront\/brands\/esmeralda\//);
  assert.equal(result.icons.icon.length,1);
  for(const icon of [...result.icons.icon,...result.icons.apple]) assert.match(icon.url,/^\/api\/storefront\/brands\/esmeralda\/icon\//);
  assert.ok(!JSON.stringify(result.icons).includes('/icon.png'));
});

test('platform root keeps its existing icon and Club overrides parent install identity',async()=>{
  const platform=await resolvedMetadata();
  assert.equal(platform.title.absolute,'Orderfly Studio');
  assert.equal(platform.icons.icon[0].url,'/icon.png');
  const f=fixture();
  const club=await resolvedMetadata(await f.metadata(context()),await f.clubMetadata(context()));
  assert.equal(club.title.absolute,'Esmeralda Club');
  assert.equal(club.appleWebApp.title,'Esmeralda Club');
  assert.equal(club.manifest,'/club/manifest.webmanifest');
  assert.equal(club.icons.apple[0].url,'/club/ikon/180');
  assert.ok(!JSON.stringify(club.icons).includes('/api/storefront/brands/'));
});

for(const [host,base] of [['esmeralda.orderfly.dk','/'],['esmeralda2.orderfly.dk','/'],['orderfly.dk','/esmeralda'],['esmeralda.localhost:3000','/']]) {
  test(`manifest remains on its own storefront (${host})`,async()=>{
    const f=fixture();const response=await f.manifest(request(host),context());const manifest=await response.json();
    assert.equal(response.status,200);assert.equal(manifest.name,brand.name);assert.equal(manifest.short_name,brand.name);
    assert.equal(manifest.start_url,base);assert.equal(manifest.scope,base);assert.equal(manifest.id,base);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.match(response.headers.get('content-type'),/application\/manifest\+json/);
    assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192','512x512','512x512']);
  });
}

test('unknown, suspended, mismatched and invalid brands have no install resources',async()=>{
  for(const currentBrand of [null,{...brand,status:'suspended'},{...brand,slug:'another'}]) {
    const f=fixture({currentBrand});assert.deepEqual(await f.metadata(context()),{});
    assert.equal((await f.manifest(request(),context())).status,404);
    assert.equal((await f.icon(request(),context())).status,404);
  }
  for(const slug of ['../esmeralda','superadmin','Esmeralda','x']) {
    const f=fixture();assert.equal((await f.manifest(request(),context(slug))).status,404);assert.deepEqual(f.reads,[]);
  }
});

test('a brand host cannot request another brand icon or manifest, including forwarded hosts',async()=>{
  const f=fixture({host:'another.orderfly.dk'});
  assert.deepEqual(await f.metadata(context()),{});
  assert.equal((await f.manifest(request('another.orderfly.dk'),context())).status,404);
  const req=new Request(request(),{headers:{host:'orderfly.dk','x-forwarded-host':'another.orderfly.dk'}});
  assert.equal((await f.icon(req,context())).status,404);assert.deepEqual(f.reads,[]);
});

test('limited runtime omits install metadata without a database read',async()=>{
  const f=fixture({ready:false});assert.deepEqual(await f.metadata(context()),{});assert.deepEqual(f.reads,[]);
});

test('inline brand upload is rasterized as square PNG from only the resolved brand record',async()=>{
  const logo=await sharp({create:{width:120,height:60,channels:4,background:'#de1322'}}).png().toBuffer();
  for(const size of ['180','192','512']) {
    const f=fixture({stored:{...brand,logoUrl:'data:image/png;base64,'+logo.toString('base64')}});
    const response=await f.icon(request(),context('esmeralda',size));assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/png');
    const png=Buffer.from(await response.arrayBuffer());const metadata=await sharp(png).metadata();
    assert.equal(metadata.width,Number(size));assert.equal(metadata.height,Number(size));assert.equal(metadata.format,'png');
    const center=await sharp(png).extract({left:Number(size)/2,top:Number(size)/2,width:1,height:1}).raw().toBuffer();
    assert.deepEqual([...center.subarray(0,3)],[222,19,34]);assert.deepEqual(f.reads,[['slug','esmeralda'],['brands','brand-a']]);
  }
});

test('raw inline record is rechecked for brand identity and suspension',async()=>{
  for(const stored of [{...brand,slug:'another'},{...brand,status:'suspended'}]) {
    const f=fixture({stored});assert.equal((await f.icon(request(),context())).status,404);
  }
});

test('unsupported icon sizes reject before reads',async()=>{
  for(const size of ['100','999999','0180','1e3','-192','512.png']) {
    const f=fixture();assert.equal((await f.icon(request(),context('esmeralda',size))).status,404);assert.deepEqual(f.reads,[]);
  }
});

test('logo fetch does not accept internal hosts, credentials, redirects or unlimited images',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error('Must not fetch')};
  for(const source of ['http://localhost/image.png','https://127.0.0.1/image.png','https://evil.test/logo.png','https://firebasestorage.googleapis.com:444/logo','https://user:pass@firebasestorage.googleapis.com/logo','/api/private','data:text/html;base64,PHNjcmlwdD4=']) assert.equal(await image.logoBuffer(source,fetcher),null);
  assert.equal(calls,0);
  await image.logoBuffer('https://firebasestorage.googleapis.com/logo',async(_url,options)=>{assert.equal(options.redirect,'error');assert.ok(options.signal);return new Response('large',{headers:{'content-length':'2000001'}})}).then(result=>assert.equal(result,null));
  await image.logoBuffer('https://cdn.prod.website-files.com/logo',async()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1'}})).then(result=>assert.equal(result,null));
});

test('unusable logo still returns a valid square background without Orderfly assets',async()=>{
  const png=await image.homeScreenIcon(180,null,'#123456');const meta=await sharp(png).metadata();assert.equal(meta.width,180);
  const center=await sharp(png).extract({left:90,top:90,width:1,height:1}).raw().toBuffer();assert.deepEqual([...center.subarray(0,3)],[18,52,86]);
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');

const paths=loadTs('src/lib/loyalty/portal-path.ts');
const texts=loadTs('src/app/[brandSlug]/club/texts.ts');
const {portalPreset}=loadTs('src/app/[brandSlug]/club/brand-preset.ts');
const {locationSlugError,brandSlugError}=loadTs('src/lib/brand-subdomain.ts');

test('the real brand layout selects the club footer only for Esmeralda club paths and keeps cookie settings wired',()=>{
  const fs=require('node:fs'),ts=require('typescript');
  let pathname,opened=0;
  const mocks={
    'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
    react:{useState:()=>[false,()=>{opened++;}]},
    'next/navigation':{usePathname:()=>pathname},
    '@/components/cookie-consent':{CookieConsent:'Cookies'},
    '@/components/layout/header':{Header:'Header'},
    '@/components/layout/footer':{Footer:'Footer'},
    '@/components/layout/menu-header':{MenuHeader:'MenuHeader'},
    '@/lib/loyalty/portal-path':paths,
    '@/lib/brand-subdomain':loadTs('src/lib/brand-subdomain.ts'),
    './club/portal-frame':{EsmeraldaClubFooter:'EsmeraldaClubFooter'},
  };
  const code=ts.transpileModule(fs.readFileSync('src/app/[brandSlug]/layout-client.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod={exports:{}};
  new Function('require','module','exports',code)(name=>{assert.ok(name in mocks,`unexpected dependency ${name}`);return mocks[name];},mod,mod.exports);
  for(const [slug,path,expected] of [['esmeralda','/club/login','EsmeraldaClubFooter'],['esmeralda','/esmeralda/club/tilmeld','EsmeraldaClubFooter'],
    ['other','/club/login','Footer'],['esmeralda','/esmeralda/amager','Footer']]){
    pathname=path;
    const tree=mod.exports.BrandLayoutClient({brand:{id:slug,slug},children:'form'}),children=tree.props.children;
    const footer=children.find(c=>c?.type===expected),cookies=children.find(c=>c?.type==='Cookies');
    assert.ok(footer,`${slug} ${path}`);assert.equal(children.filter(c=>['Footer','EsmeraldaClubFooter'].includes(c?.type)).length,1);
    footer.props.onOpenCookieSettings();assert.ok(cookies);
    if(path.includes('/club'))assert.equal(children.find(c=>c?.props?.children==='form').type,'div','club owns its single main');
  }
  assert.equal(opened,4);
});

test('club paths are recognised on the brand subdomain and on orderfly.dk/{slug}',()=>{
  for(const p of ['/club','/club/login','/esmeralda/club','/esmeralda/club/tilmeld']) assert.equal(paths.isClubPath(p,'esmeralda'),true,p);
  for(const p of ['/','/esmeralda','/esmeralda/amager','/amager','/esmeralda/amager/club','/clubs',null]) assert.equal(paths.isClubPath(p,'esmeralda'),false,String(p));
  // "club" can never be a brand slug, so /club on a subdomain is always the portal.
  assert.match(brandSlugError('club'),/reserveret/);
  assert.equal(paths.clubBase(true,'esmeralda'),'/club');assert.equal(paths.clubBase(false,'esmeralda'),'/esmeralda/club');
});

test('the reserved location slug is explained in Danish',()=>{
  assert.match(locationSlugError(' Club '),/"Club" er reserveret/);assert.equal(locationSlugError('amager'),null);
});

test('reward text is built from the numbers and description the API returns',()=>{
  assert.equal(texts.nextRewardText(5,8,'Gratis pizza'),'3 stempler til gratis pizza');
  assert.equal(texts.nextRewardText(7,8,'en gratis pizza'),'1 stempel til en gratis pizza');
  assert.equal(texts.nextRewardText(2,8,'  '),'6 stempler til næste belønning');
  assert.equal(texts.nextRewardText(5,8,'VIP-menu for to'),'3 stempler til VIP-menu for to');
  assert.equal(texts.nextRewardText(5,8,'TEST – gratis pizza'),'3 stempler til TEST – gratis pizza');
  assert.equal(texts.nextRewardText(5,8,'Ølpakke'),'3 stempler til ølpakke');
  assert.equal(texts.nextRewardText(5,8,'2 gratis pizzaer'),'3 stempler til 2 gratis pizzaer');
  assert.equal(texts.firstName('  Anna  Hansen '),'Anna');
  // Danish time: 23:30 UTC on 30 April is already 1 May in Copenhagen.
  assert.equal(texts.danishDate(Date.parse('2027-04-30T23:30:00Z')),'1. maj 2027');
});

test('Esmeralda gets the white logo and its Bourton/Brandon font files; other brands use their own logo',()=>{
  const esmeralda=portalPreset({slug:'esmeralda',name:'Esmeralda',logoUrl:'https://x/dark.png'});
  assert.match(esmeralda.logoUrl,/esmeralda-logo\.png$/);
  assert.match(esmeralda.fontCss,/font-family:'Bourton Base'.*bourtonbase\.woff2/);
  assert.match(esmeralda.fontCss,/font-family:'Brandon Text Office Regular'.*BrandonTextOffice-Regular\.ttf/);
  assert.equal(esmeralda.background,'#000000');
  assert.deepEqual(portalPreset({slug:'other',name:'Other',logoUrl:'https://x/logo.png',background:'#FAF0E6'}),{logoUrl:'https://x/logo.png',logoAlt:'Other',fontCss:null,background:'#FAF0E6'});
  // Only a hex colour can paint the icon; anything else falls back to white.
  assert.equal(portalPreset({slug:'other',name:'Other',background:'0 0% 100%'}).background,'#ffffff');
  assert.equal(portalPreset({slug:'other',name:'Other'}).logoUrl,null);
});

class LoyaltyError extends Error{constructor(code,status){super(code);this.code=code;this.status=status;}}
function loadData({cookie,host,session}){
  const calls=[];
  const data=loadTs('src/app/[brandSlug]/club/data.ts',{'server-only':{},
    'next/headers':{cookies:async()=>({get:name=>name==='__Host-orderfly-loyalty'&&cookie?{value:cookie}:undefined}),headers:async()=>new Headers(host?{host}:{})},
    'next/navigation':{notFound:()=>{throw Error('NOT_FOUND');}},
    '@/lib/firebase-admin':{getAdminDb:()=>({})},
    '@/lib/loyalty/stamp-card/counter':{LoyaltyError},
    '@/lib/loyalty/stamp-card/portal-http':{SESSION_COOKIE:'__Host-orderfly-loyalty'},
    '@/lib/loyalty/discount-card/portal':{memberDiscountCard:async(db,brand,s)=>{calls.push(['discount',brand.brandId,s.memberId]);return null;}},
    '@/lib/loyalty/stamp-card/membership':{
      resolveBrand:async(db,slug)=>{if(slug!=='esmeralda')throw new LoyaltyError('brand_not_found',404);return{brandId:'b',slug,brandName:'Esmeralda',companyId:'c'};},
      programForPortal:async()=>({active:true,name:'Esmeralda Club'}),
      readSession:async(db,brand,token)=>{calls.push(['session',token]);if(!session)throw new LoyaltyError('unauthorized',401);return session;},
      memberView:async(db,brand,s)=>({member:{name:'Anna'},session:s}),
    }});
  return {data,calls};
}

test('portal pages read the member through the phase 1 session check and fail closed',async()=>{
  assert.equal(await loadData({}).data.loadMember('esmeralda'),null);
  const expired=loadData({cookie:'a'.repeat(64)});
  assert.equal(await expired.data.loadMember('esmeralda'),null);assert.deepEqual(expired.calls,[['session','a'.repeat(64)]]);
  const ok=loadData({cookie:'b'.repeat(64),session:{memberId:'m'}});
  assert.deepEqual(await ok.data.loadMember('esmeralda'),{member:{name:'Anna'},session:{memberId:'m'},discountCard:null});
  assert.deepEqual(ok.calls,[['session','b'.repeat(64)],['discount','b','m']]);
  await assert.rejects(loadData({}).data.loadPortal('unknown'),/NOT_FOUND/);
  assert.equal(await loadData({}).data.findPortal('unknown'),null);
});

test('portal links stay on the address the customer uses',async()=>{
  assert.equal(await loadData({host:'esmeralda.orderfly.dk'}).data.portalBase('esmeralda'),'/club');
  assert.equal(await loadData({host:'orderfly.dk'}).data.portalBase('esmeralda'),'/esmeralda/club');
  // Another brand's subdomain never shortens the path.
  assert.equal(await loadData({host:'other.orderfly.dk'}).data.portalBase('esmeralda'),'/esmeralda/club');
});

const sharp=require('sharp');
const home=loadTs('src/app/[brandSlug]/club/home-screen.ts',{'server-only':{},sharp:{default:sharp},'@/lib/firebase-admin':{getAdminDb:()=>({})},'./data':{}});

test('the web app manifest names the program and starts on the portal address',()=>{
  const m=home.manifest('Esmeralda Club','/club','#000000');
  assert.equal(m.name,'Esmeralda Club');assert.equal(m.start_url,'/club');assert.equal(m.scope,'/club');assert.equal(m.display,'standalone');
  assert.equal(m.theme_color,'#000000');assert.equal(m.lang,'da');
  assert.deepEqual(m.icons.map(i=>[i.src,i.sizes,i.purpose]),[['/club/ikon/192','192x192','any'],['/club/ikon/512','512x512','any'],['/club/ikon/512','512x512','maskable']]);
  assert.equal(home.manifest('X Club','/x/club','#ffffff').icons[0].src,'/x/club/ikon/192');
});

test('home-screen icons are square, on the brand colour, with the logo centred; a bad logo gives a plain icon',async()=>{
  const logo=await sharp({create:{width:300,height:100,channels:4,background:'#ffffff'}}).png().toBuffer();
  const fetched=[];
  const png=await home.homeScreenIcon(192,'https://cdn/logo.png','#000000',async url=>{fetched.push(url);return logo;});
  assert.deepEqual(fetched,['https://cdn/logo.png']);
  const {data,info}=await sharp(png).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,192);assert.equal(info.height,192);
  const pixel=(x,y)=>[...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)];
  assert.deepEqual(pixel(2,2),[0,0,0]);assert.deepEqual(pixel(96,96),[255,255,255]);
  // The logo stays within the 60% safe area (192 * 0.6 = 115 px wide).
  assert.deepEqual(pixel(96-60,96),[0,0,0]);assert.deepEqual(pixel(96-55,96),[255,255,255]);
  for(const bad of [async()=>null,async()=>Buffer.from('not an image')]){
    const plain=await sharp(await home.homeScreenIcon(180,'https://cdn/x.png','#112233',bad)).raw().toBuffer({resolveWithObject:true});
    assert.equal(plain.info.width,180);assert.deepEqual([...plain.data.subarray(90*180*plain.info.channels+90*plain.info.channels).subarray(0,3)],[0x11,0x22,0x33]);
  }
  assert.deepEqual([...home.ICON_SIZES],[180,192,512]);
});

test('history rows name the event and channel in Danish, never staff',()=>{
  assert.deepEqual(texts.historyText({type:'stamp_added',quantity:1,channel:'dine_in'}),{label:'Stempel',channel:'Spis her'});
  assert.deepEqual(texts.historyText({type:'stamp_added',quantity:2,channel:'takeaway'}),{label:'Stempel (2 stempler)',channel:'Takeaway'});
  assert.deepEqual(texts.historyText({type:'reward_redeemed',quantity:0,channel:null}),{label:'Belønning indløst',channel:null});
  assert.deepEqual(texts.historyText({type:'stamps_expired',quantity:5,channel:null}),{label:'Stempler udløbet (5 stempler)',channel:null});
  assert.equal(texts.historyText({type:'reward_expired',quantity:0,channel:'pickup'}).channel,'Afhentning');
  assert.equal(texts.historyText({type:'something_new',quantity:0,channel:'wolt'}).label,'Hændelse');
  assert.equal(texts.historyText({type:'something_new',quantity:0,channel:'wolt'}).channel,null);
});

test('the counter sign QR in docs leads to the sign-up page',async()=>{
  const QRCode=require('qrcode'),fs=require('node:fs');
  const expected=await QRCode.toString('https://esmeralda.orderfly.dk/club/tilmeld',{type:'svg',errorCorrectionLevel:'H',margin:4,color:{dark:'#000000',light:'#ffffff'}});
  assert.equal(fs.readFileSync('docs/stempelkort/skilt-qr-tilmelding.svg','utf8'),expected);
});

test('logos are fetched only from public image hosts, without redirects, and cut off at 2 MB',async()=>{
  const png=await sharp({create:{width:4,height:4,channels:4,background:'#ff0000'}}).png().toBuffer();
  const calls=[];
  const stream=(chunks,length)=>async(url,options)=>{calls.push([String(url),options.redirect]);
    return new Response(new ReadableStream({pull(c){const next=chunks.shift();if(next)c.enqueue(next);else c.close();}}),{headers:length?{'content-length':String(length)}:{}});};
  // An inline logo (served to browsers via /api/storefront-image) is decoded, never fetched.
  assert.deepEqual(await home.logoBuffer('data:image/png;base64,'+png.toString('base64'),stream([])),png);
  assert.equal(calls.length,0);
  for(const blocked of ['http://cdn.prod.website-files.com/x.png','https://169.254.169.254/latest','https://localhost/x.png','https://internal.example/x.png',
    'https://cdn.prod.website-files.com:8443/x.png','https://user@cdn.prod.website-files.com/x.png','/api/storefront-image?x=1','not a url'])
    assert.equal(await home.logoBuffer(blocked,stream([png])),null,blocked);
  assert.equal(calls.length,0);
  assert.deepEqual(await home.logoBuffer('https://cdn.prod.website-files.com/logo.png',stream([png.subarray(0,10),png.subarray(10)])),png);
  assert.deepEqual(calls,[['https://cdn.prod.website-files.com/logo.png','error']]);
  // No or false Content-Length: the stream is abandoned once it passes the limit.
  const mb=new Uint8Array(1_000_000);let pulled=0;
  const endless=async()=>new Response(new ReadableStream({pull(c){pulled++;c.enqueue(mb);}}));
  assert.equal(await home.logoBuffer('https://res.cloudinary.com/logo.png',endless),null);
  assert.ok(pulled<=4,String(pulled));
  assert.equal(await home.logoBuffer('https://res.cloudinary.com/logo.png',stream([png],3_000_000)),null);
  // Redirects and network errors give no logo.
  assert.equal(await home.logoBuffer('https://res.cloudinary.com/logo.png',async()=>{throw new TypeError('redirect');}),null);
});

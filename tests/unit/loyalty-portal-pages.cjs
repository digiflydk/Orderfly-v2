const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');

const paths=loadTs('src/lib/loyalty/portal-path.ts');
const texts=loadTs('src/app/[brandSlug]/club/texts.ts');
const {portalPreset}=loadTs('src/app/[brandSlug]/club/brand-preset.ts');
const {locationSlugError,brandSlugError}=loadTs('src/lib/brand-subdomain.ts');

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
  assert.equal(texts.firstName('  Anna  Hansen '),'Anna');
  // Danish time: 23:30 UTC on 30 April is already 1 May in Copenhagen.
  assert.equal(texts.danishDate(Date.parse('2027-04-30T23:30:00Z')),'1. maj 2027');
});

test('Esmeralda gets the white logo and its Bourton/Brandon font files; other brands use their own logo',()=>{
  const esmeralda=portalPreset({slug:'esmeralda',name:'Esmeralda',logoUrl:'https://x/dark.png'});
  assert.match(esmeralda.logoUrl,/esmeralda-logo\.png$/);
  assert.match(esmeralda.fontCss,/font-family:'Bourton Base'.*bourtonbase\.woff2/);
  assert.match(esmeralda.fontCss,/font-family:'Brandon Text Office Regular'.*BrandonTextOffice-Regular\.ttf/);
  assert.deepEqual(portalPreset({slug:'other',name:'Other',logoUrl:'https://x/logo.png'}),{logoUrl:'https://x/logo.png',logoAlt:'Other',fontCss:null});
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
  assert.deepEqual(await ok.data.loadMember('esmeralda'),{member:{name:'Anna'},session:{memberId:'m'}});
  await assert.rejects(loadData({}).data.loadPortal('unknown'),/NOT_FOUND/);
});

test('portal links stay on the address the customer uses',async()=>{
  assert.equal(await loadData({host:'esmeralda.orderfly.dk'}).data.portalBase('esmeralda'),'/club');
  assert.equal(await loadData({host:'orderfly.dk'}).data.portalBase('esmeralda'),'/esmeralda/club');
  // Another brand's subdomain never shortens the path.
  assert.equal(await loadData({host:'other.orderfly.dk'}).data.portalBase('esmeralda'),'/esmeralda/club');
});

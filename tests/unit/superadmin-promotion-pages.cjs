const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { loadTs } = require('../helpers/load-ts.cjs');

class AuthorityError extends Error {
  constructor(code, status = 403) { super(code); this.status = status; }
}

function fixture() {
  let access = 'allowed', reads = 0;
  const redirect = href => { throw Object.assign(new Error('redirect'), { href }); };
  const gate = loadTs('src/lib/access/superadmin-page.ts', {
    'server-only': {},
    'next/navigation': { redirect },
    './authority': { AuthorityError },
    './orderfly-session': { orderflyReadGrants: async () => {
      if (access === 'expired') throw new AuthorityError('unauthorized', 401);
      if (access === 'denied') throw new AuthorityError('forbidden');
      if (access === 'broken') throw new Error('Firestore unavailable');
      return [{brandId:'esmeralda',locationIds:null}];
    } },
  });
  const read = value => async () => { reads++; return value; };
  const brands = [{id:'esmeralda',name:'Esmeralda'}];
  const locations = [{id:'amager',brandId:'esmeralda',name:'Amager'}];
  const mock = {
    'next/navigation': { notFound: () => { throw Error('notFound'); } },
    'react/jsx-runtime': { jsx: (type, props) => ({type, props}), jsxs: (type, props) => ({type, props}) },
    '@/lib/access/superadmin-page': gate,
    '@/components/superadmin/access-denied-page': { AccessDeniedPage: function AccessDeniedPage() {} },
    '@/lib/runtime': { isAdminReady: () => true },
    '@/components/ui/empty-state': { default: function EmptyState() {} },
    '@/lib/upsell-serialization': { upsellClientData: x => x },
    '@/app/superadmin/brands/actions': { getBrands: read(brands) },
    '@/app/superadmin/locations/actions': { getAllLocations: read(locations) },
    '../locations/actions': { getAllLocations: read(locations) },
    '../brands/actions': { getBrands: read(brands) },
    './actions': {
      getAllLocations: read(locations),
      getDiscounts: read([{id:'summer',brandId:'esmeralda',code:'SUMMER20'}]),
      getStandardDiscounts: read([{id:'pizza',brandId:'esmeralda',discountName:'Pizza Pizza'}]),
      getCombos: read([{id:'combo',brandId:'esmeralda',comboName:'Meal',locationIds:undefined}]),
      getUpsells: read([{id:'upsell',brandId:'esmeralda',upsellName:'Side'}]),
      gameBrands: read(brands),
    },
    '@/app/superadmin/discounts/actions': {getDiscountById: read({id:'summer',brandId:'esmeralda',code:'SUMMER20'})},
    '@/app/superadmin/standard-discounts/actions': {getStandardDiscountById: read({id:'pizza',brandId:'esmeralda',discountName:'Pizza Pizza'})},
    '@/app/superadmin/products/actions': {getProducts: read([])},
    '@/app/superadmin/categories/actions': {getCategories: read([])},
    '@/lib/next/resolve-props': {resolveParams: async params => params},
    '@/components/superadmin/discount-form-page': {DiscountFormPage: function DiscountFormPage() {}},
    '@/components/superadmin/standard-discount-form-page': {StandardDiscountFormPage: function StandardDiscountFormPage() {}},
    './client-page': {
      LocationsClientPage: function LocationsClientPage() {},
      DiscountsClientPage: function DiscountsClientPage() {},
      StandardDiscountsClientPage: function StandardDiscountsClientPage() {},
      CombosClientPage: function CombosClientPage() {},
      UpsellsClientPage: function UpsellsClientPage() {},
    },
    '@/lib/firebase-admin': {getAdminDb: () => ({})},
    '@/lib/games/scratch-card': {scratchCardDraftSchema: {parse: () => ({})}},
    '@/lib/games/campaign': {brandCampaigns: async () => [],campaignStatus: () => 'draft'},
    '@/components/games/GamesDashboard': {GamesDashboard: function GamesDashboard() {}},
    'firebase-admin/firestore': {AggregateField: {}},
  };
  function page(path) {
    const mod = {exports:{}};
    const code = ts.transpileModule(fs.readFileSync(path,'utf8'), {
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
    }).outputText;
    new Function('require','module','exports',code)(name => {
      if (!(name in mock)) throw new Error(`Unexpected import ${name} from ${path}`);
      return mock[name];
    },mod,mod.exports);
    return mod.exports.default;
  }
  return {page,gate,read,reads:()=>reads,setAccess:value=>{access=value;}};
}

const lists = [
  ['discounts','DiscountsClientPage'],
  ['standard-discounts','StandardDiscountsClientPage'],
  ['combos','CombosClientPage'],
  ['locations','LocationsClientPage'],
  ['upsells','UpsellsClientPage'],
  ['games','GamesDashboard'],
];

for (const [route,client] of lists) test(`${route}: expired session redirects before data reads; valid session renders`,async()=>{
  const f=fixture(),page=f.page(`src/app/superadmin/${route}/page.tsx`);
  const render=async()=>{
    const outer=await page();
    return typeof outer.type==='function' && outer.type.name.endsWith('PageContent') ? outer.type() : outer;
  };
  f.setAccess('expired');
  await assert.rejects(render(),error=>error.href==='/admin-login');
  assert.equal(f.reads(),0);
  f.setAccess('denied');
  assert.equal((await render()).type.name,'AccessDeniedPage');
  assert.equal(f.reads(),0);
  f.setAccess('allowed');
  const result=await render();
  assert.equal(result.type.name,client);
  if(route==='combos')assert.equal(result.props.initialCombos[0].locationNames,'');
  if(route==='discounts')assert.equal(result.props.initialDiscounts[0].code,'SUMMER20');
  if(route==='standard-discounts')assert.equal(result.props.initialDiscounts[0].discountName,'Pizza Pizza');
});

test('unexpected database errors remain visible to operators',async()=>{
  const f=fixture();f.setAccess('broken');
  await assert.rejects(f.gate.loadSuperadminPage('orderfly.discounts:view',f.read([])),/Firestore unavailable/);
  assert.equal(f.reads(),0);
});

test('session revocation during a page read also redirects',async()=>{
  const f=fixture();
  await assert.rejects(f.gate.loadSuperadminPage('orderfly.website:view',async()=>{
    throw new AuthorityError('unauthorized',401);
  }),error=>error.href==='/admin-login');
});

for(const [route,id,name] of [
  ['discounts','uP2DDd0J0zao4GSi5zmp','SUMMER20'],
  ['discounts','raSE3kQxIEUSPPmM8RI2','NEWSLETTER_SIGNUP'],
  ['standard-discounts','Fk5pCg8dvTeA8jBC2jzQ','Pizza Pizza'],
])test(`legacy ${name} editor respects session and renders historical record`,async()=>{
  const f=fixture(),page=f.page(`src/app/superadmin/${route}/edit/[discountId]/page.tsx`);
  f.setAccess('expired');
  await assert.rejects(page({params:Promise.resolve({discountId:id})}),error=>error.href==='/admin-login');
  assert.equal(f.reads(),0);
  f.setAccess('allowed');
  const result=await page({params:Promise.resolve({discountId:id})});
  assert.match(result.type.name,/DiscountFormPage/);
  assert.equal(result.props.discount.brandId,'esmeralda');
});

test('legacy combo date formats and absent locations are safe on list and detail',async()=>{
  const row={comboName:'Legacy meal',brandId:'esmeralda',locationIds:undefined,
    startDate:'2026-09-01T10:00:00Z',endDate:{_seconds:1790877600,_nanoseconds:0},createdAt:'2026-08-01T10:00:00Z'};
  const snapshot={id:'legacy-meal',data:()=>row,updateTime:{toDate:()=>new Date('2026-09-02T10:00:00Z')}};
  const actions=loadTs('src/app/superadmin/combos/actions.ts',{
    'next/cache':{revalidatePath(){},revalidateTag(){}},
    'next/navigation':{redirect(){}},
    '@/lib/firebase-admin':{getAdminDb:()=>({})},
    '@/lib/access/orderfly-session':{verifiedOrderflyIdentity:async()=>({})},
    '@/lib/access/scoped-data':{
      listScopedDocuments:async()=>[snapshot],getScopedDocument:async()=>snapshot,
    },
    '@/lib/combo-eligibility':{},'@/lib/storefront-cache':{},
    '../products/actions':{},
  });
  for(const value of [(await actions.getCombos())[0],await actions.getComboById('legacy-meal')]){
    assert.deepEqual(value.locationIds,[]);
    assert.equal(value.startDate,'2026-09-01T10:00:00.000Z');
    assert.equal(value.endDate,'2026-10-01T18:00:00.000Z');
    assert.equal(value.createdAt.toISOString(),'2026-08-01T10:00:00.000Z');
    assert.equal(value.updatedAt.toISOString(),'2026-09-02T10:00:00.000Z');
  }
});

test('new discount route renders the real form boundary; expired sessions redirect and denied grants remain denied',async()=>{
 const f=fixture(),page=f.page('src/app/superadmin/discounts/new/page.tsx');
 assert.equal((await page()).type.name,'DiscountFormPage');
 f.setAccess('expired');await assert.rejects(page(),e=>e.href==='/admin-login');
 f.setAccess('denied');assert.equal((await page()).type.name,'AccessDeniedPage');
});

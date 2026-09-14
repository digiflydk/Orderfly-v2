const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function fixture({invitation=null,customer='customer',status='Completed',brandId='brand',locationId='location'}={}){
 const jsx=(type,props)=>({type,props});
 const order={id:'order',brandId:'brand',locationId:'location',brandName:'Restaurant',customerDetails:{id:customer,email:'private@example.test'},deliveryType:'Pickup',status};
 const mocks={
  'react/jsx-runtime':{jsx,jsxs:jsx},
  '@/lib/next/resolve-props':{resolveSearchParams:async p=>p},
  'next/navigation':{notFound:()=>{throw Error('not-found');},redirect:()=>{throw Error('redirect');}},
  '@/app/checkout/order-actions':{getOrderById:async()=>order},
  './actions':{getActiveFeedbackQuestionsForBrand:async()=>({id:'questions'})},
  './form-client':{FeedbackFormClient:'FeedbackForm'},
  '@/lib/integrations/esmeralda-feedback-integration':{resolveBookingFeedbackInvitationToken:async()=>null},
  '@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({doc:()=>({get:async()=>({data:()=>({logoUrl:'https://example.test/logo.png',privateKey:'private'})})})})})},
  '@/lib/feedback/order-invitations':{resolveOrderFeedbackInvitation:async()=>invitation&&({...invitation,brandId,locationId}),completedFeedbackOrder:o=>o.status==='Completed'},
 };
 const code=ts.transpileModule(fs.readFileSync('src/app/feedback/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',code)(name=>{assert.ok(name in mocks,'unexpected dependency '+name);return mocks[name];},mod,mod.exports);
 return mod.exports.default;
}
test('guest feedback renders its finite context without an administrative session',async()=>{
 const page=await fixture()({searchParams:Promise.resolve({orderId:'order',customerId:'customer'})});
 const context=page.props.children.props.context;
 assert.equal(context.sourceId,'order');assert.equal(context.customerId,'customer');assert.equal(context.brandLogoUrl,'https://example.test/logo.png');
 assert.equal(JSON.stringify(context).includes('private'),false);
});
test('guest feedback rejects mismatched customers, incomplete orders and invalid invitations',async()=>{
 for(const options of [{customer:'other'},{status:'Pending'}])await assert.rejects(fixture(options)({searchParams:{orderId:'order',customerId:'customer'}}),/not-found/);
 await assert.rejects(fixture()({searchParams:{orderToken:'invalid'}}),/not-found/);
 const invitation={sourceId:'order',customerId:'customer',status:'pending'};
 for(const options of [{brandId:'foreign'},{locationId:'foreign'}])await assert.rejects(fixture({invitation,...options})({searchParams:{orderToken:'valid'}}),/not-found/);
 const page=await fixture({invitation})({searchParams:{orderToken:'valid'}});assert.equal(page.props.children.props.context.invitationToken,'valid');
});

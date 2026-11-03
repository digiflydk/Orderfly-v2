const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {overviewRow,campaignDiscountLabel,discountValueLabel}=loadTs('src/app/superadmin/loyalty/club/overview-row.ts',{});
const bonus=(enabled)=>({enabled,activeNow:enabled,stamps:1,startsAt:null,endsAt:null});
const discount=(id,changes={})=>({id,applicationType:'club_signup',description:'',discountType:'percentage',discountValue:15,endsAt:null,usedInCheckout:true,inactiveReason:null,...changes});
const base=(changes={})=>({brandId:'b',brandName:'Brand',checkoutMode:'club',campaignSaved:true,live:true,createdAt:5,programName:'Club',
 permissions:{settings:true,discountsView:true,discountsEdit:true,discountsCreate:false},
 campaign:{version:3,checkoutMode:'club',clubSuppressed:null,saved:true,invalid:false,welcome:bonus(false),profile:{...bonus(false),requiredFields:['phone']}},
 discounts:[],texts:null,omnisend:null,...changes});

test('discount labels show only what checkout offers, with a count of further offers',()=>{
 assert.equal(discountValueLabel({discountType:'percentage',discountValue:15}),'Procent · 15 %');
 assert.equal(discountValueLabel({discountType:'fixed_amount',discountValue:50}),'Beløb · 50 kr.');
 assert.equal(campaignDiscountLabel({discounts:null}),null);
 assert.equal(campaignDiscountLabel({discounts:[discount('a',{usedInCheckout:false,inactiveReason:'mode_newsletter'})]}),'');
 assert.equal(campaignDiscountLabel({discounts:[discount('a',{usedInCheckout:false}),discount('b',{discountType:'fixed_amount',discountValue:50}),discount('c')]}),'Beløb · 50 kr. · +1 flere');
});
test('rows map campaign type, permissions and delete availability',()=>{
 let row=overviewRow(base());
 assert.deepEqual({type:row.type,canEdit:row.canEdit,canDelete:row.canDelete,version:row.version,discount:row.discount,omnisend:row.omnisend},
  {type:'club',canEdit:true,canDelete:true,version:3,discount:'',omnisend:null});
 assert.equal(overviewRow(base({checkoutMode:'newsletter',campaignSaved:false})).type,'newsletter_default');
 assert.equal(overviewRow(base({checkoutMode:'newsletter'})).type,'newsletter');
 // An empty campaign has nothing to delete; stamps alone still count.
 row=overviewRow(base({checkoutMode:'none',live:false}));assert.equal(row.type,'none');assert.equal(row.canDelete,false);
 assert.equal(overviewRow(base({checkoutMode:'none',campaign:{...base().campaign,welcome:bonus(true)}})).canDelete,true);
 assert.equal(overviewRow(base({campaign:{...base().campaign,invalid:true}})).canDelete,false,'an unreadable campaign cannot be saved');
 row=overviewRow(base({campaign:null,discounts:null}));assert.equal(row.canEdit,false);assert.equal(row.canDelete,false);assert.equal(row.version,0);assert.equal(row.discount,null);
 assert.equal(overviewRow(base({omnisend:'connected'})).omnisend,'active');assert.equal(overviewRow(base({omnisend:'not_configured'})).omnisend,'inactive');
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs'),{memoryDb}=require('../helpers/marketing-db.cjs');
const mocks={'server-only':{}};
const {memberDiscountCard}=loadTs('src/lib/loyalty/discount-card/portal.ts',mocks);
const {discountCardAssignmentId}=loadTs('src/lib/loyalty/discount-card/model.ts',mocks);
const NOW=Date.parse('2026-10-24T20:00:00Z'),brand={brandId:'brand',slug:'esmeralda',brandName:'Esmeralda',companyId:'co'},id=discountCardAssignmentId('brand','customer');
function setup(){
 const db=memoryDb(),member={brandId:'brand',companyId:'co',customerId:'customer',status:'active',normalizedEmail:'owner@example.com',sessionEpoch:2,currentCardId:'stamp-card'};
 db.rows.set('loyaltyMembers/member',member);
 db.rows.set('loyaltySessions/session',{brandId:'brand',memberId:'member',epoch:2,expiresAt:NOW+60000,revokedAt:null});
 db.rows.set('brands/brand',{name:'Esmeralda',status:'active'});
 db.rows.set('customers/customer',{brandId:'brand',normalizedEmail:'owner@example.com',email:'owner@example.com'});
 db.rows.set('platformAdminControl/access-v1',{principals:[],roles:[],memberships:[],companies:[{id:'co',active:true,orderflyBrandIds:['brand'],locationIds:['loc'],opsflyOrganizationId:null}]});
 db.rows.set('locations/loc',{name:'Amager',brandId:'brand'});
 db.rows.set('discountCardFeatures/brand',{brandId:'brand',companyId:'co',version:1,enabled:true,locationScope:{mode:'all',locationIds:[]},updatedAt:NOW});
 db.rows.set('discountCardGroups/group',{id:'group',brandId:'brand',companyId:'co',version:1,name:'Familie',percentage:20,active:true,updatedAt:NOW});
 db.rows.set('discountCardAssignments/'+id,{id,brandId:'brand',companyId:'co',customerId:'customer',memberId:'member',groupId:'group',version:1,status:'active',startsAt:null,expiresAt:null,updatedAt:NOW});
 return {db,session:{sessionId:'session',memberId:'member',member}};
}
const view=({db,session})=>memberDiscountCard(db,brand,session,NOW);
test('owner sees minimal discount projection, with existing stamps preserved and no writes',async()=>{
 const f=setup(),before=structuredClone([...f.db.rows]);
 assert.deepEqual(await view(f),{groupName:'Familie',percentage:20,status:'active',startsAt:null,expiresAt:null,locations:{all:true,names:[]},showStampCard:true});
 assert.deepEqual([...f.db.rows],before);
});
test('no assignment and disabled feature without assignment show no card',async()=>{
 for(const disabled of [true,false]){const f=setup();f.db.rows.delete('discountCardAssignments/'+id);f.db.rows.get('discountCardFeatures/brand').enabled=!disabled;assert.equal(await view(f),null);}
});
test('session, ownership and company boundaries fail closed without private projections',async()=>{
 const cases=[
  db=>db.rows.get('loyaltySessions/session').memberId='other',db=>db.rows.get('loyaltySessions/session').expiresAt=NOW,
  db=>db.rows.get('loyaltySessions/session').revokedAt=NOW,db=>db.rows.get('loyaltySessions/session').epoch=1,
  db=>db.rows.get('loyaltyMembers/member').status='deleted',db=>db.rows.get('loyaltyMembers/member').brandId='other',
  db=>db.rows.get('loyaltyMembers/member').companyId='other',db=>db.rows.get('customers/customer').brandId='other',
  db=>Object.assign(db.rows.get('customers/customer'),{email:'someone@example.com',normalizedEmail:'someone@example.com'}),
  db=>db.rows.get('discountCardAssignments/'+id).memberId='other',db=>db.rows.get('discountCardAssignments/'+id).memberId=null,
  db=>db.rows.get('discountCardAssignments/'+id).customerId='other',db=>db.rows.get('discountCardAssignments/'+id).brandId='other',
  db=>db.rows.get('discountCardAssignments/'+id).id='different',db=>db.rows.get('discountCardGroups/group').brandId='other',
  db=>db.rows.get('discountCardFeatures/brand').companyId='other',db=>db.rows.get('platformAdminControl/access-v1').companies[0].active=false,
  db=>db.rows.get('brands/brand').status='suspended',db=>db.rows.get('discountCardGroups/group').percentage=101,
 ];
 for(const mutate of cases){const f=setup();mutate(f.db);assert.equal(await view(f),null,mutate.toString());}
});
test('selected locations use authorized names without IDs, invalid foreign location fails closed',async()=>{
 const f=setup();f.db.rows.get('discountCardFeatures/brand').locationScope={mode:'selected',locationIds:['loc']};
 assert.deepEqual((await view(f)).locations,{all:false,names:['Amager']});
 f.db.rows.get('locations/loc').brandId='other';assert.equal(await view(f),null);
 f.db.rows.get('locations/loc').brandId='brand';f.db.rows.get('platformAdminControl/access-v1').companies[0].locationIds=[];assert.equal(await view(f),null);
});
test('precise blocked pending expired upcoming and inactive states never claim active benefit',async()=>{
 for(const [state,mutate] of [
  ['blocked',db=>db.rows.get('discountCardAssignments/'+id).status='blocked'],
  ['pending',db=>db.rows.get('discountCardAssignments/'+id).status='pending'],
  ['expired',db=>db.rows.get('discountCardAssignments/'+id).expiresAt=NOW],
  ['upcoming',db=>db.rows.get('discountCardAssignments/'+id).startsAt=NOW+1],
  ['inactive',db=>db.rows.get('discountCardFeatures/brand').enabled=false],
  ['inactive',db=>db.rows.get('discountCardGroups/group').active=false],
 ]){const f=setup();mutate(f.db);assert.equal((await view(f)).status,state);}
});
test('discount invitation works without active stamp program and preserves old card when present',async()=>{
 const f=setup();Object.assign(f.db.rows.get('loyaltyMembers/member'),{membershipOrigin:'discount_invitation',currentCardId:null});
 assert.equal((await view(f)).showStampCard,false);assert.equal((await view(f)).status,'active');
 f.db.rows.get('loyaltyMembers/member').currentCardId='old';assert.equal((await view(f)).showStampCard,true);
});

test('shared membership QR works for discount-only member and contains no discount credential',async()=>{
 const f=setup(),{issueQrToken}=loadTs('src/lib/loyalty/stamp-card/counter.ts',mocks),{hashKey}=loadTs('src/lib/loyalty/stamp-card/model.ts',mocks);
 const first=await issueQrToken(f.db,'brand','member',NOW),second=await issueQrToken(f.db,'brand','member',NOW+1);
 assert.match(first.token,/^[a-f0-9]{64}$/);assert.notEqual(first.token,second.token);
 assert.equal(first.expiresAt,NOW+60000);
 assert.equal(f.db.rows.get('loyaltyMembers/member').qrTokenId,hashKey('qr',second.token));
 const stored=f.db.rows.get('loyaltyQrTokens/'+hashKey('qr',second.token));
 assert.deepEqual(Object.keys(stored).sort(),['brandId','createdAt','expiresAt','memberId','usedAt']);
 assert.equal([...f.db.rows.keys()].filter(k=>k.startsWith('loyaltyCards/')).length,0);
 assert.equal([...f.db.rows.keys()].filter(k=>k.startsWith('loyaltyEvents/')).length,0);
});
test('membership QR rejects deleted and foreign members without issuing tokens',async()=>{
 const {issueQrToken}=loadTs('src/lib/loyalty/stamp-card/counter.ts',mocks);
 for(const mutate of [db=>db.rows.get('loyaltyMembers/member').status='deleted',db=>db.rows.get('loyaltyMembers/member').brandId='other']){
 const f=setup();mutate(f.db);await assert.rejects(issueQrToken(f.db,'brand','member',NOW),e=>e.code==='member_not_found');
 assert.equal([...f.db.rows.keys()].filter(k=>k.startsWith('loyaltyQrTokens/')).length,0);
 }
});

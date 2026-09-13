const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,formData,brand,location}=require('../helpers/brand-location-fixture.cjs');
const {loadTs}=require('../helpers/load-ts.cjs');
const {isMissingServerAction}=loadTs('src/lib/server-action-error.ts');
const redirected=result=>assert.rejects(result,error=>error.digest?.startsWith('NEXT_REDIRECT;'));

test('brand reads use canonical document IDs, retain nameless records and join location brands',async()=>{
 const f=fixture([['brands/b',{...brand,id:'obsolete'}],['brands/c',{companyName:'Other Pizza',id:''}],['locations/l',{...location,id:'obsolete-location',brandId:'b'}]]);
 const brands=await f.brands.getBrands();assert.equal(brands.length,2);
 assert.deepEqual(brands.map(b=>[b.id,b.name]),[['b','Esmeralda QA'],['c','Other Pizza']]);
 assert.equal((await f.brands.getBrandById('b')).id,'b');assert.equal((await f.brands.getBrandBySlug(brand.slug)).id,'b');
 const loc=await f.locations.getLocationById('l');assert.equal(loc.id,'l');
 assert.equal(new Map(brands.map(b=>[b.id,b.name])).get(loc.brandId),'Esmeralda QA');
 assert.equal((await f.locations.getAllLocations())[0].id,'l');
 delete f.records.get('locations/l').deliveryTypes;
 const legacy=(await f.locations.getAllLocations())[0];
 assert.equal(legacy.supportsDelivery,false);assert.equal(legacy.supportsPickup,false);
});

test('changing a missing location brand saves the selected canonical brand and preserves false switches and closed days',async()=>{
 const f=fixture();
 await redirected(f.locations.createOrUpdateLocation(null,formData({...location,brandId:'b',name:'Updated Amager'})));
 const saved=await f.locations.getLocationById('l');
 assert.equal(saved.brandId,'b');assert.equal(saved.name,'Updated Amager');
 assert.equal(saved.isActive,false);assert.equal(saved.allowPreOrder,false);
 assert.equal(saved.openingHours.monday.isOpen,true);assert.equal(saved.openingHours.tuesday.isOpen,false);
 assert.deepEqual(saved.deliveryTypes,['pickup']);assert.equal(f.writes.length,1);
 // Historical and catalog records are not migrated by a brand assignment.
 assert.equal(f.records.get('brands/b').name,'Esmeralda QA');
});

for(const [name,patch] of [['missing brand',{brandId:'deleted'}],['empty brand',{brandId:''}],['deleted location',{id:'deleted',brandId:'b'}]])
 test(`server rejects ${name} without creating or updating data`,async()=>{
 const f=fixture();const result=await f.locations.createOrUpdateLocation(null,formData({...location,...patch}));
 assert.equal(result.error,true);assert.equal(f.writes.length,0);
 });

test('location creation still accepts a real brand and checkbox on values',async()=>{
 const f=fixture();const form=formData({...location,id:undefined,brandId:'b'});form.set('isActive','on');
 await redirected(f.locations.createOrUpdateLocation(null,form));
 assert.equal(f.records.get('locations/new').brandId,'b');assert.equal(f.records.get('locations/new').isActive,true);
});

test('brand information updates the existing record and invalidates location labels',async()=>{
 const f=fixture();await redirected(f.brands.createOrUpdateBrand(null,formData({...brand,name:'New brand name',ownerName:'QA Owner',ownerEmail:'qa@example.test'})));
 assert.equal((await f.brands.getBrandById('b')).name,'New brand name');
 assert.equal(f.records.get('brands/b').ownerId,'u');assert.deepEqual(f.writes,['brands/b']);
 assert.ok(f.invalidations.some(([path])=>path==='/superadmin/locations'));
});

test('a deleted brand cannot be recreated by a stale edit, and duplicate slugs are rejected',async()=>{
 for(const change of [{id:'deleted',companyRegNo:'11112222',slug:'new-qa'},{slug:'cph-qa'}]){
 const f=fixture();const result=await f.brands.createOrUpdateBrand(null,formData({...brand,...change,ownerName:'QA Owner',ownerEmail:'qa@example.test'}));
 assert.equal(result.error,true);assert.equal(f.writes.length,0);
 }
});

test('denied edit permissions stop both mutations before database writes',async()=>{
 const f=fixture(undefined,false);
 for(const result of [await f.brands.createOrUpdateBrand(null,formData(brand)),await f.locations.createOrUpdateLocation(null,formData(location))])assert.equal(result.error,true);
 assert.equal(f.writes.length,0);
});

test('both missing-action messages trigger reload recovery; ordinary failures do not',()=>{
 assert.equal(isMissingServerAction(Error('Server Action "605e1859edd4a82193e6303c893d662808f1a083f4" was not found on the server.')),true);
 assert.equal(isMissingServerAction(Error('Failed to find Server Action "abc". This request might be from an older deployment.')),true);
 assert.equal(isMissingServerAction(Error('Network unavailable')),false);
 assert.equal(isMissingServerAction(Error('Validation failed')),false);
});


test('central cutover requires existing owners and plans and serializes brand references',async()=>{
 const old=process.env.MPANEL_PLATFORM_ADMIN_ENABLED;process.env.MPANEL_PLATFORM_ADMIN_ENABLED='true';
 try {
  const seed=[['users/u',{name:'QA Owner',email:'QA@example.test'}],['users/u2',{name:'Other owner',email:'qa@example.test'}],['subscription_plans/p',{name:'Basic'}]];
  const f=fixture(seed);
  await redirected(f.brands.createOrUpdateBrand(null,formData({...brand,id:undefined,subscriptionPlanId:'p',ownerName:'QA Owner',ownerEmail:'qa@example.test'})));
  assert.equal(f.records.get('brands/new').ownerId,'u');assert.equal(f.records.get('brands/new').subscriptionPlanId,'p');
  assert.ok(f.writes.includes('platformAdminControl/catalog'));
  const noId=fixture(seed);assert.equal((await noId.brands.createOrUpdateBrand(null,formData({...brand,id:undefined,ownerId:undefined,subscriptionPlanId:'p',ownerName:'QA Owner',ownerEmail:'qa@example.test'}))).error,true);assert.equal(noId.writes.length,0);assert.ok(!f.writes.some(p=>p.startsWith('users/')));
  for(const records of [[],[['users/u',{email:'qa@example.test'}]]]){
   const rejected=fixture(records);const result=await rejected.brands.createOrUpdateBrand(null,formData({...brand,id:undefined,subscriptionPlanId:'p',ownerName:'QA Owner',ownerEmail:'qa@example.test'}));
   assert.equal(result.error,true);assert.equal(rejected.writes.length,0);
  }
 } finally {if(old===undefined)delete process.env.MPANEL_PLATFORM_ADMIN_ENABLED;else process.env.MPANEL_PLATFORM_ADMIN_ENABLED=old;}
});


test('catalogue readers retain canonical IDs even when stored IDs point to another existing record',async()=>{
 const f=fixture([
  ['users/u',{id:'u2',name:'Selected Owner',email:'QA@example.test'}],
  ['users/u2',{id:'u2',name:'Other Owner',email:'qa@example.test'}],
  ['subscription_plans/p',{id:'p2',name:'Selected plan',priceMonthly:10}],
  ['subscription_plans/p2',{id:'p2',name:'Other plan',priceMonthly:20}],
  ['roles/r',{id:'r2',name:'Selected role'}],
  ['roles/r2',{id:'r2',name:'Other role'}]
 ]);
 const owner=(await f.users.getUsers()).find(u=>u.name==='Selected Owner');
 const plan=(await f.plans.getSubscriptionPlans()).find(p=>p.name==='Selected plan');
 assert.equal(owner.id,'u');assert.equal((await f.users.getUserById('u')).id,'u');
 assert.equal(plan.id,'p');assert.equal((await f.roles.getRoles()).find(r=>r.name==='Selected role').id,'r');
 assert.equal((await f.roles.getRoleById('r')).id,'r');
 const old=process.env.MPANEL_PLATFORM_ADMIN_ENABLED;process.env.MPANEL_PLATFORM_ADMIN_ENABLED='true';
 try {
  await redirected(f.brands.createOrUpdateBrand(null,formData({...brand,id:undefined,ownerId:owner.id,ownerName:owner.name,ownerEmail:owner.email,subscriptionPlanId:plan.id})));
  assert.equal(f.records.get('brands/new').ownerId,'u');assert.equal(f.records.get('brands/new').subscriptionPlanId,'p');
 } finally {if(old===undefined)delete process.env.MPANEL_PLATFORM_ADMIN_ENABLED;else process.env.MPANEL_PLATFORM_ADMIN_ENABLED=old;}
});

test('web role readers also preserve Firestore document identity over embedded IDs',async()=>{
 const snap={id:'r',data:()=>({id:'other',name:'Selected role'}),exists:true};
 const roles=loadTs('src/app/superadmin/roles/actions.ts',{
  'server-only':{},'next/cache':{revalidatePath:()=>{}},'next/navigation':{},
  '@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({orderBy:()=>({get:async()=>({docs:[snap]})}),doc:()=>({get:async()=>snap})})})},
  '@/lib/permissions':{ALL_PERMISSIONS:[]}
 });
 assert.equal((await roles.getRoles())[0].id,'r');assert.equal((await roles.getRoleById('r')).id,'r');
});

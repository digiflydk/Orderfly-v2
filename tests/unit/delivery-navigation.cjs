const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {canNavigate,filterNavigation}=loadTs('src/lib/access/navigation.ts');
const viewer={superuser:false,permissions:['orderfly.catalog:view']};
const paths=['/superadmin/delivery','/merchant/delivery'];
test('delivery administration is available to catalog viewers and superusers',()=>{
 for(const prefix of paths) for(const suffix of ['', '/settings', '/providers', '/log']) {
  assert.equal(canNavigate(prefix+suffix,viewer),true,prefix+suffix);
  assert.equal(canNavigate(prefix+suffix,{superuser:true,permissions:[]}),true);
 }
});
test('delivery administration denies missing session and unrelated permissions',()=>{
 for(const access of [null,{superuser:false,permissions:[]},{superuser:false,permissions:['orderfly.orders:view']},{superuser:false,permissions:['orderfly.catalog:edit']},{superuser:false,permissions:['orderfly.stamp_cards:counter']}])
  for(const prefix of paths) for(const suffix of ['', '/settings']) assert.equal(canNavigate(prefix+suffix,access),false);
 for(const prefix of paths) assert.equal(canNavigate(prefix+'-other',viewer),false,'path prefix must match a segment');
});
test('delivery group disappears when no child is permitted',()=>{
 const menu=[{label:'Levering',children:[{href:'/superadmin/delivery'},{href:'/superadmin/delivery/settings'}]}];
 assert.deepEqual(filterNavigation(menu,viewer),menu);
 assert.deepEqual(filterNavigation(menu,{superuser:false,permissions:['orderfly.orders:view']}),[]);
 assert.deepEqual(filterNavigation(menu,null),[]);
});

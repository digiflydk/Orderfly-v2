const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {canNavigate,filterNavigation}=loadTs('src/lib/access/navigation.ts');
test('nested menus hide denied links and empty groups for delegated users',()=>{
 const access={superuser:false,permissions:['orderfly.orders:view']};
 const menu=[{href:'/superadmin/sales/orders'},{label:'System',children:[{href:'/superadmin/settings'}]},{href:'/superadmin/customers'}];
 assert.deepEqual(filterNavigation(menu,access),[{href:'/superadmin/sales/orders'}]);
 assert.equal(canNavigate('/superadmin/sales/orders/order-1',access),true);assert.equal(canNavigate('/superadmin/sales/orders-foreign',access),false);
});
test('website routes require their own permission and unknown routes deny',()=>{
 const access={superuser:false,permissions:['orderfly.catalog:view']};
 assert.equal(canNavigate('/superadmin/brands',access),true);assert.equal(canNavigate('/superadmin/brands/websites',access),false);assert.equal(canNavigate('/superadmin/new-private-module',access),false);
});
test('sales overview is listed only for analytics viewers',()=>{
 assert.equal(canNavigate('/superadmin/dashboard',{superuser:false,permissions:['orderfly.orders:view']}),false);
 assert.equal(canNavigate('/superadmin/dashboard',{superuser:false,permissions:['orderfly.analytics:view']}),true);
});
test('overview selectors work for an orders-only user without an analytics grant',async()=>{
 const {getFiltersData}=loadTs('src/app/superadmin/_filters-data.ts',{
  '@/lib/access/native-catalog':{
   selectorCatalog:async()=>({superuser:false,brands:[{id:'own',name:'Own brand'}],locations:[{id:'own-location',name:'Own location',brandId:'own'}]}),
   nativeCatalog:async()=>{throw Error('analytics catalog must not be requested');},
  },
 });
 const result=await getFiltersData();
 assert.deepEqual(result.brands,[{id:'own',name:'Own brand'}]);
 assert.deepEqual(result.locations,[{id:'own-location',name:'Own location',brandId:'own'}]);
});
test('missing sessions show no private navigation and mPanel requires member or role administration',()=>{
 assert.equal(canNavigate('/superadmin'),false);
 const url='https://www.esmeraldapizza.dk/mpanel#platform';
 assert.equal(canNavigate(url,{superuser:false,permissions:['orderfly.orders:view']}),false);
 assert.equal(canNavigate(url,{superuser:false,permissions:['platform.members:view']}),true);
 assert.equal(canNavigate('/superadmin/settings',{superuser:true,permissions:[]}),true);
});

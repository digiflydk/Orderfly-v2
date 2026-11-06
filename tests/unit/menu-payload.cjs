const {test} = require('node:test');
const assert = require('node:assert/strict');
const {loadTs} = require('../helpers/load-ts.cjs');
const {createMenuPayload, menuCombo} = loadTs('src/lib/server/menu-payload.ts', {'server-only': {}});
const {readMenuPayload} = loadTs('src/lib/menu-payload.ts');
const {resolveToppingOptions} = loadTs('src/lib/topping-options.ts');

test('menu transport preserves overrides, boundaries and selection rules without admin/import fields', () => {
  const product = {id:'p',brandId:'b',locationIds:['l'],categoryId:'c',productName:'Pizza',price:79,priceDelivery:89,isActive:true,
    description:'Searchable description',allergenIds:['milk'],toppingGroupIds:['g'],toppingGroupConditions:{conditional:['free']},
    toppingOverrides:{blocked:{isAvailable:false,isDefault:false},free:{price:0,isAvailable:true,isDefault:false,defaultQuantity:2},default:{isDefault:true},falseDefault:{isDefault:false}},
    creationFingerprint:'private-import',creationKey:'private-key',internal:{secret:'private'},createdAt:'private-date'};
  const menu = {categories:[{id:'c',brandId:'b',locationIds:['l'],categoryName:'Pizza',isActive:true,privateNote:'private-note'}],productsByCategory:{c:[product,{...product,id:'second',toppingOverrides:{free:{price:5,isDefault:true}}}]},fallbackUsed:false};
  const payload = createMenuPayload(menu);
  const restored = readMenuPayload(JSON.parse(JSON.stringify(payload)));
  assert.doesNotMatch(JSON.stringify(payload),/private/);
  const {creationFingerprint,creationKey,internal,createdAt,...expected} = product;
  assert.deepEqual(restored.productsByCategory.c[0],expected);
  assert.deepEqual(restored.productsByCategory.c[1].toppingOverrides,{free:{price:5,isDefault:true}});
  assert.deepEqual(restored.categories,[{id:'c',brandId:'b',locationIds:['l'],categoryName:'Pizza',isActive:true}]);
  const groups=[{id:'g',minSelection:0,maxSelection:5}];
  const tops=Object.keys(product.toppingOverrides).map(id=>({id,groupId:'g',toppingName:id,price:10,maxQuantity:3,isActive:true,locationIds:['l'],isDefault:true}));
  assert.deepEqual(resolveToppingOptions(restored.productsByCategory.c[0],groups,tops),resolveToppingOptions(product,groups,tops));
  assert.equal(resolveToppingOptions(restored.productsByCategory.c[0],groups,tops).some(t=>t.id==='blocked'),false);
  assert.equal(restored.fallbackUsed,false);
});

test('repeated option IDs and values are interned, with empty and virtual categories retained', () => {
  const overrides=Object.fromEntries(Array.from({length:50},(_,i)=>['option-'+String(i).padStart(20,'0'),{isAvailable:false,isDefault:false}]));
  const products=Array.from({length:40},(_,i)=>({id:'p'+i,brandId:'b',locationIds:['l'],categoryId:'c',productName:'Pizza',price:79,isActive:true,toppingOverrides:overrides}));
  const menu={categories:[{id:'__virtual_menu__',categoryName:'Menu',isActive:true}],productsByCategory:{__virtual_menu__:products,empty:[]},fallbackUsed:true};
  const compact=createMenuPayload(menu), restored=readMenuPayload(compact);
  assert.ok(JSON.stringify(compact).length<JSON.stringify(menu).length*.3);
  assert.equal(compact.optionIds.length,50);assert.equal(compact.overrideValues.length,1);
  assert.deepEqual(restored,menu);
  assert.deepEqual(readMenuPayload(createMenuPayload({...menu,productsByCategory:{c:[{...products[0],toppingOverrides:null}]}})).productsByCategory.c[0].toppingOverrides,undefined);
});

test('combo projection preserves eligibility, prices, group modifiers and upgrade contracts', () => {
  const combo={id:'combo',brandId:'b',locationIds:['l'],comboName:'Menu',pickupPrice:95,deliveryPrice:105,calculatedNormalPricePickup:110,calculatedNormalPriceDelivery:120,productGroups:[{id:'main',groupName:'Pizza',productIds:['p'],minSelection:1,maxSelection:1,productPriceAdjustments:{p:10}}],storefrontVersions:['v2'],upgradeProductIds:['p'],activeDays:['monday'],activeTimeSlots:[{start:'11:00',end:'23:00'}],orderTypes:['pickup'],tags:['Popular'],startDate:'2026-01-01',endDate:'2027-01-01',isActive:true,createdAt:'date',updatedAt:'date',setupMigration:'private'};
  const {setupMigration,...expected}=combo;
  assert.deepEqual(menuCombo(combo),expected);
});

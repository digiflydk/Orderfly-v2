const {test}=require('node:test');
const assert=require('node:assert/strict');
const plan=require('../../scripts/data/ashiqs-product-options.json');
test('Ashiqs plan consolidates exactly 37 dishes and preserves every variant price',()=>{
 const bases=plan.products.filter(p=>p.patch.productName);
 assert.equal(bases.length,37);
 assert.equal(plan.products.filter(p=>p.delete===true).length,43);
 assert.equal(new Set(plan.products.map(p=>p.id)).size,80);
 for(const base of bases){
  const group=plan.groups.find(g=>g.id===base.patch.toppingGroupIds[0]);
  assert.equal(group.minSelection,1);assert.equal(group.maxSelection,1);
  const options=plan.toppings.filter(t=>t.groupId===group.id);
  const variants=plan.products.filter(p=>p.sourceId===base.sourceId);
  assert.equal(options.length,variants.length);
  for(const variant of variants){
   assert.equal(variant.before.brandId,plan.brandId);
   assert.deepEqual(variant.before.locationIds,[plan.locationId]);
   const label=variant.before.productName.match(/\(([^()]*)\)$/)[1];
   const option=options.find(t=>t.toppingName===label);
   assert.ok(option,variant.before.productName);
   for(const field of ['price','priceDelivery'])assert.equal(base.before[field]+option.price,variant.before[field]);
  }
  for(const [conditional,ids] of Object.entries(base.patch.toppingGroupConditions)){
   assert.ok(base.patch.toppingGroupIds.includes(conditional));
   assert.ok(ids.length);assert.ok(ids.every(id=>options.some(t=>t.id===id)));
  }
 }
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {validateToppingConditions:validate,toppingConditionsSchema}=loadTs('src/lib/topping-condition-validation.ts');
const groups=['choice','drink','fries'].map(id=>({id,groupName:id,locationIds:['l'],minSelection:1,maxSelection:1}));
const toppings=[{id:'menu',groupId:'choice',isActive:true,locationIds:['l']}];
const check=(rules,gs=groups,ts=toppings,locations=['l'])=>validate(rules,gs.map(g=>g.id),gs,ts,locations);
test('one menu choice opens several groups, with no brand-specific configuration',()=>{
 assert.equal(check({drink:['menu'],fries:['menu']}),null);
 assert.equal(check({}),null);
});
test('rejects missing, inactive, foreign-location and unattached triggers',()=>{
 assert.ok(check({drink:['missing']}));
 assert.ok(check({drink:['menu']},groups,[{...toppings[0],isActive:false}]));
 assert.ok(check({drink:['menu']},groups,[{...toppings[0],locationIds:['other']}]));
 assert.ok(check({drink:['menu']},groups.slice(1)));
 assert.ok(check({drink:['menu']},groups,toppings,['l','other']));
 assert.ok(check({missing:['menu']}));
});
test('rejects self references, conditional chains, empty and malformed rules',()=>{
 assert.ok(check({choice:['menu']}));
 assert.ok(check({choice:['menu'],drink:['menu']}));
 assert.ok(check({drink:[]}));
 for(const value of [null,[],{drink:'menu'},{drink:['bad/id']}]) assert.equal(toppingConditionsSchema.safeParse(value).success,false);
});

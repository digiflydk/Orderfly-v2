const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { orderPresentedOptions, presentOptionChoices } = loadTs('src/lib/option-presentation.ts');
const option = (id, toppingName, extra={}) => ({id,toppingName,...extra});
test('explicit ranks and equal-rank catalog order win; unranked defaults and Danish alphabet follow', () => {
 const options=[option('z','Æble'),option('a','Ananas'),option('default','Bund',{isDefault:true}),option('ranked','Z',{sortOrder:2}),option('first','Y',{sortOrder:1}),option('tie','X',{sortOrder:1})];
 assert.deepEqual(orderPresentedOptions(options).map(o=>o.id),['first','tie','ranked','default','a','z']);
 assert.equal(options[0].id,'z');
});
test('search ranks exact then prefix and retains selected nonmatches', () => {
 const options=[option('mixed','Ekstra ost'),option('prefix','Ostesauce'),option('exact','Ost'),option('selected','Løg')];
 const result=presentOptionChoices(options,new Set(['selected']),' OST ',false);
 assert.deepEqual(result.matches.map(o=>o.id),['exact','prefix','mixed']);
 assert.deepEqual(result.visible.map(o=>o.id),['exact','prefix','mixed','selected']);
 assert.deepEqual(presentOptionChoices(options,new Set(['selected']),'xxx',false).visible.map(o=>o.id),['selected']);
});
test('collapsed list keeps all chosen options once and show-all restores the configured ordering', () => {
 const options=Array.from({length:12},(_,i)=>option(String(i),`Choice ${i}`));
 assert.deepEqual(presentOptionChoices(options,new Set(['0','9']),'',false).visible.map(o=>o.id),['0','1','2','3','4','5','9']);
 assert.deepEqual(presentOptionChoices(options,new Set(['9']),'',true).visible,options);
});

test('removal searches match the displayed Uden label', () => {
 const { toppingLabel } = loadTs('src/lib/topping-options.ts');
 const options=[option('onion','Løg',{kind:'removal'}),option('cheese','Ost',{kind:'addition'})];
 assert.deepEqual(presentOptionChoices(options,new Set(),'uden',false,toppingLabel).matches.map(o=>o.id),['onion']);
 assert.deepEqual(presentOptionChoices(options,new Set(),'uden løg',false,toppingLabel).matches.map(o=>o.id),['onion']);
});

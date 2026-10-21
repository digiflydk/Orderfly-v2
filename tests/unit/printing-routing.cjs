const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { previewPrinterRouting: preview, PrinterRoutingError, PRINT_ROUTING_LIMITS } = loadTs('src/lib/printing/routing-preview.ts', { 'server-only': {} });
const scope = { brandId: 'brand', locationId: 'location' };
const printer = (id, patch = {}) => ({ configuration: { ...scope, id, name: id, manufacturer: 'star', model: 'mc-print3',
  transport: 'cloudprnt-http', state: 'active', paperWidthMm: 80, ...patch }, deleted: false });
const line = (lineId, productId, categoryId, patch = {}) => ({ ...scope, lineId, itemType: 'product', productId, categoryId,
  name: 'Pizza ÆØÅ', quantity: 2, modifiers: ['Uden ost', 'Ekstra løg'], kitchenNote: 'Skær i 8', ...patch });
const rule = (id, printerId, match = { type: 'all' }, effect = 'include', patch = {}) => ({ ...scope, id, printerId, match, effect, ...patch });
const fixture = patch => ({ scope, deliveryType: 'Pickup', printers: [printer('pizza'), printer('kitchen'), printer('packing')],
  rules: [rule('pizza-category', 'pizza', { type: 'category', id: 'pizzas' }), rule('pasta-category', 'kitchen', { type: 'category', id: 'pastas' }), rule('pack-all', 'packing')],
  lines: [line('l1', 'margherita', 'pizzas'), line('l2', 'pasta', 'pastas'), line('l3', 'cola', 'drinks')], ...patch });
function invalid(input, code = 'invalid_input') { assert.throws(() => preview(input), e => e instanceof PrinterRoutingError && e.code === code && e.message === code); }

test('pizza/pasta/drink order fans out to stations plus one complete packing target', () => {
  const input = fixture(), before = structuredClone(input), result = preview(input);
  assert.deepEqual(result.targets.map(t => [t.printerId, t.lines.map(l => l.lineId)]), [['kitchen', ['l2']], ['packing', ['l1','l2','l3']], ['pizza',['l1']]]);
  assert.deepEqual(result.unrouted, []); assert.equal(result.decisions.length, 9);
  assert.equal(result.dispatchAuthorized, false); assert.equal(result.mode, 'preview');
  for (const target of result.targets) assert.equal(target.dispatchAuthorized, false);
  assert.deepEqual(input, before);
  result.targets[1].lines[0].modifiers.push('changed');
  assert.deepEqual(result.targets[2].lines[0].modifiers, ['Uden ost', 'Ekstra løg'], 'sibling printer snapshots stay independent');
  assert.deepEqual(input, before, 'result cannot mutate caller-owned snapshots');
});
test('product overrides category overrides all and shadowed rules are explained', () => {
  const result = preview(fixture({ printers:[printer('pizza')], lines:[line('l1','special','pizzas')], rules:[
    rule('default','pizza'),rule('category','pizza',{type:'category',id:'pizzas'},'exclude'),rule('product','pizza',{type:'product',id:'special'})
  ] }));
  assert.deepEqual(result.decisions[0], {lineId:'l1',printerId:'pizza',outcome:'included',selectedRuleIds:['product'],shadowedRuleIds:['category','default']});
  assert.equal(result.targets[0].lines.length,1);
});
test('equal-specificity exclusion wins regardless of rule order and records both IDs', () => {
  const rules=[rule('a','pizza',{type:'product',id:'special'}),rule('b','pizza',{type:'product',id:'special'},'exclude')];
  for(const ordered of [rules,[...rules].reverse()]){
    const result=preview(fixture({printers:[printer('pizza')],lines:[line('l1','special','pizzas')],rules:ordered}));
    assert.deepEqual(result.targets,[]);assert.equal(result.decisions[0].outcome,'excluded');assert.deepEqual(result.decisions[0].selectedRuleIds,['a','b']);
    assert.deepEqual(result.unrouted,[{lineId:'l1',reason:'no_included_printer'}]);
  }
});
test('overlapping rules never duplicate a line, but separate cart line identities remain separate', () => {
  const result=preview(fixture({printers:[printer('pizza')],lines:[line('l1','special','pizzas'),line('l2','special','pizzas',{modifiers:['Uden tomat']})],rules:[
    rule('a','pizza',{type:'product',id:'special'}),rule('b','pizza',{type:'product',id:'special'}),rule('c','pizza',{type:'category',id:'pizzas'})
  ]}));
  assert.deepEqual(result.targets[0].lines.map(l=>[l.lineId,l.modifiers]),[['l1',['Uden ost','Ekstra løg']],['l2',['Uden tomat']]]);
});
test('fulfillment filters apply before precedence; absent filter means both existing order types', () => {
  const rules=[rule('all','pizza'),rule('delivery-exclude','pizza',{type:'product',id:'special'},'exclude',{deliveryTypes:['Delivery']})];
  for(const deliveryType of ['Pickup','Delivery']){
    const result=preview(fixture({printers:[printer('pizza')],lines:[line('l1','special','pizzas')],rules,deliveryType}));
    assert.equal(result.decisions[0].outcome,deliveryType==='Pickup'?'included':'excluded');
  }
});
test('disabled does not route; paused preserves intent eligibility but never permits dispatch', () => {
  for(const state of ['disabled','paused']){
    const result=preview(fixture({printers:[printer('pizza',{state})],lines:[line('l1','p','pizzas')],rules:[rule('all','pizza')]}));
    assert.equal(result.targets.length,state==='disabled'?0:1);
    assert.equal(result.decisions[0].outcome,state==='disabled'?'printer_disabled':'included');
    if(state==='paused'){assert.equal(result.targets[0].state,'paused');assert.equal(result.targets[0].dispatchAuthorized,false);}
  }
});
test('no rules/no printers produce explicit unrouted lines, never invented defaults',()=>{
  const result=preview(fixture({printers:[],rules:[]}));assert.deepEqual(result.targets,[]);assert.equal(result.unrouted.length,3);
  const withoutRules=preview(fixture({rules:[]}));assert.ok(withoutRules.decisions.every(d=>d.outcome==='no_matching_rule'));
});
test('unprojected combo stays explicitly unrouted even with an all-products packing rule',()=>{
  const combo={...scope,lineId:'combo',itemType:'combo',name:'Burger menu',quantity:1};
  const result=preview(fixture({lines:[combo]}));assert.deepEqual(result.targets,[]);
  assert.deepEqual(result.unrouted,[{lineId:'combo',reason:'combo_requires_projection'}]);
  assert.ok(result.decisions.every(d=>d.outcome==='combo_requires_projection'));
});
test('foreign printer, rule and line scopes fail closed without leaking input',()=>{
  for(const input of [fixture({printers:[printer('pizza',{brandId:'foreign'})],rules:[]}),fixture({rules:[rule('r','pizza',{type:'all'},'include',{locationId:'foreign'})]}),fixture({lines:[line('l','p','c',{brandId:'foreign'})]})])invalid(input,'scope_mismatch');
});
test('deleted printers and orphan rule references reject the entire candidate preview',()=>{
  invalid(fixture({printers:[{...printer('pizza'),deleted:true}],rules:[]}),'invalid_reference');
  invalid(fixture({rules:[rule('r','absent')]}),'invalid_reference');
});
test('duplicate printer/rule/line identities and duplicate fulfillment filters are rejected',()=>{
  for(const input of [fixture({printers:[printer('pizza'),printer('pizza')]}),fixture({rules:[rule('r','pizza'),rule('r','packing')]}),fixture({lines:[line('l','a','b'),line('l','c','d')]}),fixture({rules:[rule('r','pizza',{type:'all'},'include',{deliveryTypes:['Pickup','Pickup']})]})])invalid(input,'duplicate_identity');
});
test('strict runtime DTOs reject credentials, arbitrary order/customer fields and malformed references',()=>{
  for(const input of [null,[],fixture({customerName:'PRIVATE'}),fixture({deliveryType:'DineIn'}),fixture({lines:[line('l','p','c',{categoryId:undefined})]}),fixture({rules:[rule('r','pizza',{type:'all',id:'extra'})]}),fixture({printers:[{...printer('pizza'),credentials:'PRIVATE'}]}),fixture({lines:[line('l','bad/path','c')]}),fixture({lines:[line('l','p','c',{name:'evil\ncut'})]})])invalid(input);
});
test('configured hardware schema is retained and malformed model combinations reject',()=>{
  invalid(fixture({printers:[printer('pizza',{model:'mc-print2',paperWidthMm:80})],rules:[]}));
  invalid(fixture({printers:[printer('pizza',{model:'mc-print2',paperWidthMm:58,transport:'cloudprnt-mqtt'})],rules:[]}));
});
test('limits cap input collections and text budget without truncating or partially planning',()=>{
  invalid(fixture({rules:Array.from({length:257},(_,i)=>rule(`r${i}`,'pizza'))}));
  invalid(fixture({lines:Array.from({length:51},(_,i)=>line(`l${i}`,'p','c'))}));
  invalid(fixture({printers:Array.from({length:17},(_,i)=>printer(`p${i}`)),rules:[]}));
  const input=fixture({rules:[],lines:Array.from({length:50},(_,i)=>line(`l${i}`,'p','c',{modifiers:Array(8).fill('x'.repeat(160)),kitchenNote:'y'.repeat(400)}))});
  invalid(input,'input_too_large');assert.equal(PRINT_ROUTING_LIMITS.lines,50);
});
test('oversized nested arrays reject before Zod reads any element or parses earlier fields',()=>{
  const oversized = length => {
    const values = new Array(length);
    Object.defineProperty(values, '0', { get() { assert.fail('oversized nested elements must not be read'); } });
    return values;
  };
  for (const modifiers of [oversized(9), oversized(1000000)]) {
    const item = line('l','p','c',{modifiers});
    Object.defineProperty(item, 'name', { get() { assert.fail('schema parsing must not start before nested preflight'); } });
    invalid(fixture({lines:[item]}));
  }
  for (const deliveryTypes of [oversized(3), oversized(1000000)]) {
    const candidate = rule('r','pizza',{type:'all'},'include',{deliveryTypes});
    Object.defineProperty(candidate, 'id', { get() { assert.fail('schema parsing must not start before nested preflight'); } });
    invalid(fixture({rules:[candidate]}));
  }
  // Exact maxima still reach normal validation and retain routing semantics.
  const result=preview(fixture({lines:[line('l','p','c',{modifiers:Array(8).fill('Extra')})],
    rules:[rule('r','pizza',{type:'all'},'include',{deliveryTypes:['Pickup','Delivery']})]}));
  assert.equal(result.targets[0].lines[0].modifiers.length,8);
});
test('printer/rule ordering is canonical while original line order and quantities are retained',()=>{
 const input=fixture();const a=preview(input),b=preview({...input,printers:[...input.printers].reverse(),rules:[...input.rules].reverse()});
 assert.deepEqual(a,b);assert.equal(a.targets[1].lines[0].quantity,2);assert.equal(a.targets[1].lines[0].kitchenNote,'Skær i 8');
});

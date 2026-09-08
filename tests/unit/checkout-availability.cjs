const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const {loadTs}=require('../helpers/load-ts.cjs');
function load(path, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', code)(name => name in mocks ? mocks[name] : require(name), mod, mod.exports);
  return mod.exports;
}
const { calculateTimeSlots } = load('src/lib/time-slots.ts');
const location = {
  isActive:true, deliveryTypes: ['pickup', 'delivery'], allowPreOrder: true, prep_time: 20, delivery_time: 20,
  openingHours: Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { isOpen: true, open: '12:00', close: '22:00' }])),
};
function serverSlots() {
  const path = 'src/app/superadmin/locations/actions.ts';
  const imports = [...fs.readFileSync(path,'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>m[1]);
  const mocks = Object.fromEntries(imports.map(name=>[name,{}]));
  mocks.zod = require('zod');
  mocks['@/lib/time-slots'] = {calculateTimeSlots};
  mocks['@/lib/firebase-admin'] = {getAdminDb:()=>({collection:()=>({doc:()=>({get:async()=>({id:'l',exists:true,data:()=>location})})})})};
  return load(path,mocks).getTimeSlots;
}
test('Change dialog uses server calculator: expired day cannot be selected, next day can', async () => {
  const RealDate = Date;
  let now='2026-09-06T21:00:00Z';
  global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now(){return new RealDate(now).getTime();} };
  try {
    const getTimeSlots = serverSlots();
    const state = [], effects = []; let index = 0, saved;
    const hooks = {
      useState:initial=>{const i=index++; if (!(i in state)) state[i]=initial; return [state[i],v=>{state[i]=v;}];},
      useRef:initial=>{const i=index++; return state[i] ||= {current:initial};},
      useEffect:fn=>{effects.push(fn);}, useMemo:fn=>fn(),
    };
    const ui = new Proxy({}, {get:(_,key)=>key});
    const path = 'src/components/checkout/timeslot-dialog.tsx';
    const mocks = Object.fromEntries([...fs.readFileSync(path,'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>[m[1],ui]));
    Object.assign(mocks, {react:hooks,'date-fns':require('date-fns'),'date-fns-tz':require('date-fns-tz'),
      '@/app/superadmin/locations/actions':{getTimeSlots},
      '@/lib/fulfillment-time':loadTs('src/lib/fulfillment-time.ts'),
      '@/context/cart-context':{useCart:()=>({location,deliveryType:'pickup',selectedTime:'asap',setSelectedTime:v=>saved=v})},
    });
    const {TimeSlotDialog} = load(path,mocks);
    const render = () => {index=0;return TimeSlotDialog({isOpen:true,setIsOpen:()=>{},locationId:'l'});};
    const find = (node,type) => { if (!node || typeof node !== 'object') return null; if (node.type===type) return node; for (const child of [node.props?.children].flat(Infinity)) {const found=find(child,type);if(found)return found;}return null; };
    render(); effects[1](); await new Promise(resolve=>setImmediate(resolve));
    let tree=render();
    assert.equal(find(tree,'SelectItem'),null);
    assert.equal(find(tree,'Button').props.disabled,true);
    find(tree,'Button').props.onClick(); assert.equal(saved,undefined);
    await find(tree,'Calendar').props.onSelect(new Date('2026-09-07T12:00:00Z'));
    tree=render();
    assert.equal(find(tree,'SelectItem').props.value,'2026-09-07T10:20:00.000Z');
    assert.equal(find(tree,'Button').props.disabled,true);
    find(tree,'Select').props.onValueChange('2026-09-07T10:20:00.000Z');
    tree=render(); find(tree,'Button').props.onClick();
    assert.equal(saved,'2026-09-07T10:20:00.000Z');
    // The dialog remains open in this fixture. Time passing between render and
    // Save must invalidate the old choice without changing the saved value.
    saved=undefined;now='2026-09-07T10:05:00Z';
    find(tree,'Button').props.onClick();assert.equal(saved,undefined);
    assert.equal(find(render(),'Button').props.disabled,true);
    assert.deepEqual((await getTimeSlots('l','2026-09-05T12:00:00Z')).pickup_times,[]);
  } finally {global.Date=RealDate;}
});
test('email effect coalesces typing, rejects incomplete email and ignores stale replies', async () => {
  const source=fs.readFileSync('src/components/checkout/checkout-client.tsx','utf8');
  const start=source.indexOf('    let cancelled = false;',source.indexOf('const newsletterEmail'));
  const end=source.indexOf('\n  }, [',start);
  const effect = new Function('newsletterEmail','brand','location','deliveryType','subtotal','setNewsletterOffer','getNewsletterSignupDiscountAction','setTimeout','clearTimeout','z',source.slice(start,end));
  const timers=new Map(); let id=0,calls=0,offer,resolve;
  const run=email=>effect(email,{id:'b'},{id:'l'},'pickup',100,v=>offer=v,()=>{calls++;return new Promise(r=>resolve=r);},(fn,delay)=>{assert.equal(delay,500);timers.set(++id,fn);return id;},key=>timers.delete(key),require('zod').z);
  assert.equal(run('a@'),undefined); assert.equal(timers.size,0);
  let cleanup;
  for(const email of ['a@e.co','a@ex.co','a@example.com']) {cleanup?.();cleanup=run(email);}
  assert.equal(calls,0);assert.equal(timers.size,1);
  [...timers.values()][0](); assert.equal(calls,1);
  cleanup(); run('different@example.com'); resolve({id:'old-offer'});
  await Promise.resolve(); assert.equal(offer,null);
});
test('after closing defaults to next opening plus 20 / 40 minutes, not old slots', () => {
  const slots = calculateTimeSlots(location, undefined, new Date('2026-09-06T21:00:00Z'));
  assert.equal(slots.asap_pickup, 'Tomorrow - 12:20');
  assert.equal(slots.asap_delivery, 'Tomorrow - 12:40');
  assert.deepEqual(slots.pickup_times, []);
  assert.deepEqual(slots.delivery_times, []);
});
test('closed next day is skipped and not labelled tomorrow; preorder policy respected', () => {
  const closed = structuredClone(location); closed.openingHours.monday.isOpen = false;
  const now = new Date('2026-09-06T21:00:00Z');
  assert.equal(calculateTimeSlots(closed, undefined, now).asap_pickup, 'Tue, Sep 8 - 12:20');
  assert.equal(calculateTimeSlots({...closed, allowPreOrder:false}, undefined, now).asap_pickup, '');
});
test('before and exactly at opening, winter Copenhagen and explicit date', () => {
  assert.equal(calculateTimeSlots(location, undefined, new Date('2026-01-05T10:00:00Z')).asap_delivery, 'Today - 12:40');
  assert.equal(calculateTimeSlots(location, undefined, new Date('2026-01-05T11:00:00Z')).asap_pickup, 'ASAP (20-25 min)');
  const slots = calculateTimeSlots(location, '2026-09-06T12:00:00Z', new Date('2026-09-06T21:00:00Z'));
  assert.equal(slots.asap_pickup, '');
});
test('delivery rolls to tomorrow independently of remaining pickup capacity', () => {
  const slots = calculateTimeSlots(location, undefined, new Date('2026-09-06T19:10:00Z'));
  assert.equal(slots.asap_pickup, 'ASAP (20-25 min)');
  assert.equal(slots.asap_delivery, 'Tomorrow - 12:40');
});
test('newsletter offer checks actual customer and keeps canceled retry eligible', async () => {
  let customer = { totalOrders: 1, marketingConsent: false };
  let discount = { brandId:'b', applicationType:'newsletter_signup', isActive:true, locationIds:['l'], orderTypes:['pickup'], activeDays:[], activeTimeSlots:[], usedCount:0, usageLimit:0, perCustomerLimit:1 };
  const imports = [...fs.readFileSync('src/app/checkout/actions.ts','utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>m[1]);
  const mocks = Object.fromEntries(imports.map(name=>[name,{}]));
  mocks['@/lib/promotion-rules'] = load('src/lib/promotion-rules.ts');
  mocks['@/lib/checkout-customer-identity'] = {findCheckoutCustomer:async()=>({ref:{id:'c'},exists:()=>true,data:()=>customer})};
  mocks['firebase/firestore'] = {collection:()=>null,where:()=>null,query:()=>null,getDocs:async()=>({docs:[{id:'d',data:()=>discount}]})};
  const api = load('src/app/checkout/actions.ts',mocks);
  const offer = () => api.getNewsletterSignupDiscountAction('b','l',100,'pickup','a@example.com');
  assert.equal((await offer()).id,'d'); // Returning customer may newly subscribe.
  discount.firstTimeCustomerOnly = true;
  assert.equal(await offer(),null);
  discount.firstTimeCustomerOnly = false;
  customer.marketingConsent = true;
  assert.equal(await offer(),null);
  customer.pendingNewsletterDiscountId = 'd';
  assert.equal((await offer()).id,'d');
  customer.discountUsage = {d:1};
  assert.equal(await offer(),null);
});

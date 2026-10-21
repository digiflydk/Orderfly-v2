const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { loadTs } = require('../helpers/load-ts.cjs');
const { createSyntheticTestBonContent: create, readSyntheticTestBonContent: read, PrintJobContentError } =
  loadTs('src/lib/printing/job-content.ts', { 'server-only': {} });
const { encodeKitchenPng, KITCHEN_PNG_LIMITS } = loadTs('src/lib/printing/kitchen-png.ts');
const target = patch => ({ brandId:'brand1',locationId:'location1',printerId:'printer1',printerRevision:1,
  model:'mc-print3',paperWidthMm:58,...patch });
const clone = value => JSON.parse(JSON.stringify(value));
const rejected = (fn, code='invalid_content') => assert.throws(fn, error => error instanceof PrintJobContentError && error.code===code);

test('synthetic 58/80mm Danish testbon has exact PNG digest/dimensions and no output authority',async()=>{
  for(const [model,paperWidthMm] of [['mc-print2',58],['mc-print3',58],['mc-print3',80]]) {
    const expected=target({model,paperWidthMm}), a=create(expected), b=create(expected), result=read(a,expected);
    assert.deepEqual(a,b);assert.equal(a.schemaVersion,1);assert.equal(a.purpose,'synthetic-testbon');
    assert.equal(a.contentVersion,'orderfly-testbon-v1');assert.equal(a.encoderVersion,'orderfly-kitchen-png-v1');
    assert.equal(a.sha256,createHash('sha256').update(result.payload).digest('hex'));
    assert.equal(a.byteLength,result.payload.length);assert.equal(result.contentType,'image/png');
    const info=await sharp(result.payload).metadata();
    assert.equal(info.width,paperWidthMm===58?384:576);assert.equal(info.height,a.raster.heightDots);
    assert.equal(result.raster.physicalFitVerified,false);assert.equal(result.dispatchAuthorized,false);
    assert.ok(a.byteLength<=KITCHEN_PNG_LIMITS.payloadBytes);
  }
});

test('creation snapshots and deeply freezes binding/raster; downloads own independently mutable buffers',()=>{
  const expected=target(), envelope=create(expected), original=read(envelope,target()).payload;
  expected.brandId='foreign';
  assert.equal(envelope.binding.brandId,'brand1');
  for(const item of [envelope,envelope.binding,envelope.raster])assert.equal(Object.isFrozen(item),true);
  assert.equal(Reflect.set(envelope.binding,'printerRevision',2),false);
  const first=read(envelope,target()), second=read(envelope,target());
  assert.notEqual(first.payload,second.payload);assert.deepEqual(first.payload,second.payload);
  first.payload.fill(0);assert.notDeepEqual(first.payload,second.payload);
  assert.deepEqual(read(envelope,target()).payload,original);
  const serialized=clone(envelope), loaded=read(serialized,target());
  serialized.binding.brandId='foreign';serialized.payloadBase64='AAAA';serialized.raster.heightDots=1;
  assert.equal(loaded.binding.brandId,'brand1');assert.deepEqual(loaded.payload,original);
});

test('expected native binding mismatch rejects every scope/profile/config revision field',()=>{
  const content=create(target());
  for(const patch of [{brandId:'other'},{locationId:'other'},{printerId:'other'},{printerRevision:2},
    {model:'mc-print2'},{paperWidthMm:80}]) rejected(()=>read(content,target(patch)));
  for(const patch of [{brandId:'other'},{locationId:'other'},{printerId:'other'},{printerRevision:2},
    {model:'mc-print2'},{paperWidthMm:80}]) {
    const changed=clone(content);Object.assign(changed.binding,patch);rejected(()=>read(changed,target()));
  }
});

test('malformed bindings, secret/customer fields, unsafe integers and unsupported profiles reject',()=>{
  for(const input of [null,{},target({printerRevision:0}),target({printerRevision:-1}),target({printerRevision:1.5}),
    target({printerRevision:Number.MAX_SAFE_INTEGER+1}),target({printerRevision:Infinity}),target({printerRevision:NaN}),
    target({printerId:'../other'}),target({brandId:'x'.repeat(129)}),target({model:'epson'}),target({paperWidthMm:79}),
    target({model:'mc-print2',paperWidthMm:80}),{...target(),secret:'hidden'}, {...target(),customerEmail:'private'}]) {
    rejected(()=>create(input),'invalid_binding');rejected(()=>read(create(target()),input),'invalid_binding');
  }
});

test('strict content fields, version, length, media/profile and unsupported metadata mutations reject',()=>{
  const content=create(target());
  for(const patch of [{schemaVersion:2},{purpose:'order'},{contentVersion:'orderfly-testbon-v2'},
    {encoderVersion:'other'},{contentType:'text/plain'},{byteLength:content.byteLength+1},
    {sha256:'0'.repeat(64)},{sha256:'A'.repeat(64)},{payloadBase64:'!!!!'},
    {raster:{...content.raster,widthDots:576}},{raster:{...content.raster,heightDots:1}},
    {raster:{...content.raster,font:'other'}},{raster:{...content.raster,physicalFitVerified:true}},
    {secret:'private'},{customerEmail:'private'},{dispatchAuthorized:true}]) rejected(()=>read({...clone(content),...patch},target()));
  for(const key of Object.keys(content)) {
    const missing=clone(content);delete missing[key];rejected(()=>read(missing,target()));
  }
});

test('changed PNG bytes reject even when attacker updates length and recomputes digest',()=>{
  const content=clone(create(target())), bytes=Buffer.from(content.payloadBase64,'base64');
  bytes[bytes.length-1]^=1;content.payloadBase64=bytes.toString('base64');
  rejected(()=>read(content,target()));
  content.sha256=createHash('sha256').update(bytes).digest('hex');rejected(()=>read(content,target()));
  // A valid arbitrary PNG is also not this version's fixed synthetic receipt.
  const other=encodeKitchenPng({orderReference:'PRIVATE',fulfillmentLabel:'Other',fulfillmentTime:'Other',
    items:[{quantity:1,name:'Arbitrary caller data'}]}, {model:'mc-print3',paperWidthMm:58});
  Object.assign(content,{payloadBase64:other.payload.toString('base64'),byteLength:other.payload.length,
    sha256:createHash('sha256').update(other.payload).digest('hex'),
    raster:{widthDots:other.raster.widthDots,heightDots:other.raster.heightDots,font:other.raster.font,physicalFitVerified:false}});
  rejected(()=>read(content,target()));
});

test('canonical base64 only; oversized input is rejected before decoding or schema regex work',()=>{
  const content=create(target());
  for(const value of [' '+content.payloadBase64,content.payloadBase64+'\n',content.payloadBase64.replace(/=+$/,''),
    'A'.repeat(4*Math.ceil(KITCHEN_PNG_LIMITS.payloadBytes/3)+4),'A'.repeat(1000000)]) {
    // Unpadded data is only a mutation if this PNG required padding.
    if(value!==content.payloadBase64)rejected(()=>read({...content,payloadBase64:value},target()));
  }
  rejected(()=>read({...content,sha256:'a'.repeat(1000000)},target()));
  rejected(()=>read({...content,binding:{...target(),printerId:'x'.repeat(1000000)}},target()));
  rejected(()=>read({...content,raster:{...content.raster,heightDots:KITCHEN_PNG_LIMITS.heightDots+1}},target()));
  rejected(()=>read({...content,byteLength:KITCHEN_PNG_LIMITS.payloadBytes+1},target()));
});

test('accessors, prototype pollution, arrays, symbols, deep data and errors never expose rejected input',()=>{
  const content=create(target());let getterCalls=0;
  const hostile={...content};Object.defineProperty(hostile,'payloadBase64',{get(){getterCalls++;throw Error('PRIVATE');}});
  rejected(()=>read(hostile,target()));assert.equal(getterCalls,0);
  const badTarget=target();Object.defineProperty(badTarget,'brandId',{get(){getterCalls++;return 'PRIVATE';}});
  rejected(()=>create(badTarget),'invalid_binding');assert.equal(getterCalls,0);
  for(const value of [[],new Date(),Object.assign(Object.create({secret:'PRIVATE'}),content),
    {...content,[Symbol('PRIVATE')]:true},{...content,binding:[]},
    {...content,raster:{...content.raster,nested:{too:{deep:'PRIVATE'}}}}]) rejected(()=>read(value,target()));
  assert.throws(()=>read({...content,secret:'PRIVATE'},target()),error=>!error.message.includes('PRIVATE'));
});

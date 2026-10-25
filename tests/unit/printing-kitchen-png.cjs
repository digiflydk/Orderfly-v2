const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const fs = require('node:fs');
const { loadTs } = require('../helpers/load-ts.cjs');
const { encodeKitchenPng, KitchenPngError, KITCHEN_PNG_LIMITS } = loadTs('src/lib/printing/kitchen-png.ts');
const protocol = loadTs('src/lib/printing/cloudprnt-http.ts');
const { kitchenBitmapGlyph } = loadTs('src/lib/printing/kitchen-bitmap-font.ts');
const snapshot = patch => ({ orderReference:'TEST 42',fulfillmentLabel:'Afhentning',fulfillmentTime:'21.10.2026 18:30',
 items:[{quantity:2,name:'Pizza med bøffelmozzarella',modifiers:['Uden løg','Ekstra ost'],kitchenNote:'Skær i otte stykker'}],
 kitchenNote:'ÆØÅ æøå',...patch });
const profile = (paperWidthMm=58,model='mc-print3') => ({paperWidthMm,model});
async function decoded(encoded) { return sharp(encoded.payload).raw().toBuffer({resolveWithObject:true}); }

test('both paper profiles are valid monochrome PNGs, exact dimensions, deterministic and bounded',async()=>{
 for(const paperWidthMm of [58,80]) {
  const input=snapshot(), before=structuredClone(input), a=encodeKitchenPng(input,profile(paperWidthMm));
  const b=encodeKitchenPng(input,profile(paperWidthMm));
  assert.equal(a.contentType,'image/png');assert.deepEqual(a.payload,b.payload);assert.deepEqual(input,before);
  assert.deepEqual([...a.payload.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const {data,info}=await decoded(a);
  assert.equal(info.width,paperWidthMm===58?384:576);assert.equal(info.height,a.raster.heightDots);
  assert.ok(info.height<=KITCHEN_PNG_LIMITS.heightDots);assert.ok(a.payload.length<KITCHEN_PNG_LIMITS.payloadBytes);
  assert.deepEqual(new Set(data),new Set([255,0]));assert.equal(a.raster.physicalFitVerified,false);
  assert.equal(a.raster.font,'orderfly-kitchen-bitmap-v1');
  fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync(`test-results/kitchen-png-${paperWidthMm}.png`,a.payload);
 }
});

test('Danish uppercase and lowercase glyphs render distinct marks, including ring and slash',async()=>{
 const image=encodeKitchenPng(snapshot({orderReference:'ÆØÅæøå'}),profile(80));
 const {data,info}=await decoded(image), channels=info.channels;
 const black=(x,y)=>data[(y*info.width+x)*channels]===0;
 // Order line index1, prefix "Order: " seven cells. Å starts at cell9: its top ring is present.
 const origin=9*24, top=4+48;
 assert.equal(black(origin+8,top),true);assert.equal(black(origin,top),false);
 assert.equal(black(origin+4,top+4),true);assert.equal(black(origin+12,top+4),true);
 // Uppercase Ø is not O; the center diagonal crosses a position that O leaves white.
 assert.equal(black(8*24+8,top+12+8),true);
 for(const [a,b]of [['Æ','A'],['Ø','O'],['Å','A'],['æ','a'],['ø','o'],['å','a']])assert.notDeepEqual(kitchenBitmapGlyph(a),kitchenBitmapGlyph(b));
 assert.deepEqual(encodeKitchenPng(snapshot({orderReference:'A\u030a'}),profile()).payload,
  encodeKitchenPng(snapshot({orderReference:'Å'}),profile()).payload);
});

test('all printable ASCII is available without silently uppercasing or replacing glyphs',()=>{
 for(let code=32;code<=126;code++)assert.equal(kitchenBitmapGlyph(String.fromCharCode(code))?.length,10);
 assert.notDeepEqual(kitchenBitmapGlyph('a'),kitchenBitmapGlyph('A'));
 for(const character of ['é','🙂','中','\u0301'])assert.equal(kitchenBitmapGlyph(character),undefined);
 for(const name of ['Crème','Pizza 🙂','中文'])assert.throws(()=>encodeKitchenPng(snapshot({items:[{quantity:1,name}]}),profile()),
  error=>error instanceof KitchenPngError&&error.code==='unsupported_character'&&!error.message.includes(name));
});

test('unsupported models/widths, unknown keys, private data and controls reject before a payload exists',()=>{
 for(const input of [null,{},profile(80,'mc-print2'),profile(58,'epson'),{...profile(),columns:80},{...profile(),secret:'no'}])
  assert.throws(()=>encodeKitchenPng(snapshot(),input),/invalid_profile/);
 for(const input of [null,{...snapshot(),phone:'private'},{...snapshot(),items:[{quantity:1,name:'Pizza',email:'private'}]},
  snapshot({kitchenNote:'\x1b\x40'}),snapshot({orderReference:'A\u202eB'}),snapshot({items:[{quantity:0,name:'Pizza'}]})])
  assert.throws(()=>encodeKitchenPng(input,profile()));
 assert.equal(encodeKitchenPng(snapshot(),profile(58,'mc-print2')).raster.widthDots,384);
});

test('excessively tall receipts reject without clipping/truncating instructions',()=>{
 const input=snapshot({items:Array.from({length:50},()=>({quantity:1,name:'Pizza',modifiers:Array(8).fill('Ost')}))});
 assert.throws(()=>encodeKitchenPng(input,profile()),error=>error.code==='image_too_large');
 assert.throws(()=>encodeKitchenPng(snapshot({items:Array.from({length:51},()=>({quantity:1,name:'Pizza'}))}),profile()),/invalid_snapshot/);
});

test('encoded PNG negotiates through actual CloudPRNT parsers with byte-stable simulated GET',()=>{
 const encoded=encodeKitchenPng(snapshot(),profile());
 const poll=protocol.parseCloudPrntPoll(JSON.stringify({statusCode:'200 OK',printerMAC:'00:11:e5:06:04:ff'}),'application/json');
 const offer=protocol.cloudPrntPollResponse(poll,{jobToken:'png-fixture',mediaTypes:[encoded.contentType]});
 assert.deepEqual(offer,{jobReady:true,jobToken:'png-fixture',mediaTypes:['image/png'],deleteMethod:'DELETE'});
 const simulatedGet=query=>{
  const parsed=protocol.parseCloudPrntJobQuery(query);
  assert.equal(parsed.token,offer.jobToken);assert.equal(parsed.mediaType,'image/png');
  return {headers:{'Content-Type':encoded.contentType},body:Buffer.from(encoded.payload)};
 };
 const query='mac=00%3A11%3Ae5%3A06%3A04%3Aff&token=png-fixture&type=image%2Fpng';
 const first=simulatedGet(query), second=simulatedGet(query);
 assert.equal(first.headers['Content-Type'],'image/png');assert.deepEqual(first.body,second.body);
 assert.notEqual(first.body,second.body);first.body.fill(0);assert.notDeepEqual(first.body,encoded.payload);
 assert.equal(protocol.parseCloudPrntConfirmation('mac=00%3A11%3Ae5%3A06%3A04%3Aff&token=png-fixture&code=200+OK').outcome,'confirmed');
});

test('larger raster doubles body strokes and wraps at physical capacity without edge clipping',async()=>{
 const {renderKitchenReceipt}=loadTs('src/lib/printing/kitchen-receipt.ts');
 for(const width of [58,80]){
  const input=snapshot(), image=encodeKitchenPng(input,profile(width));
  const columns=width===58?16:24;
  const text=renderKitchenReceipt(input,{paperWidthMm:width,columns}).text.trimEnd().split('\n');
  assert.equal(image.raster.heightDots,text.length*48+8);
  const {data,info}=await decoded(image);
  for(let y=0;y<info.height;y++) for(let x=info.width-4;x<info.width;x++)assert.equal(data[(y*info.width+x)*info.channels],255);
  // K's first body stroke now fills four horizontal pixels and four vertical pixels.
  for(let y=16;y<20;y++)for(let x=0;x<4;x++)assert.equal(data[(y*info.width+x)*info.channels],0);
 }
});

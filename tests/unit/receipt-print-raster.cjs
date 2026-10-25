const {test}=require('node:test');
const assert=require('node:assert/strict');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
const sharp=require('sharp');
const load=moduleGraph({'server-only':{},sharp:{default:sharp}});
const {rasterizeReceipt,resolveReceiptLogo,receiptLogoUrl}=load('src/lib/receipts/print-raster.ts');
const {renderKitchenReceiptSvg,renderCustomerReceiptSvg}=load('src/lib/receipts/print-layout.ts');
const {SAMPLE_KITCHEN_RECEIPT}=load('src/lib/receipts/kitchen-preview.ts');
const {SAMPLE_RECEIPT}=load('src/lib/receipts/preview.ts');
const {DEFAULT_KITCHEN_SETTINGS}=load('src/lib/receipts/kitchen-settings.ts');
const {DEFAULT_RECEIPT_SETTINGS}=load('src/lib/receipts/settings.ts');
test('actual bundled font raster: both kinds and widths, stable monochrome complete PNG',async()=>{
 for(const width of [58,80]) for(const kind of ['kitchen','customer']){
  const doc=kind==='kitchen'?renderKitchenReceiptSvg({...DEFAULT_KITCHEN_SETTINGS,paperWidthMm:width},SAMPLE_KITCHEN_RECEIPT):renderCustomerReceiptSvg({...DEFAULT_RECEIPT_SETTINGS,paperWidthMm:width},SAMPLE_RECEIPT);
  const a=await rasterizeReceipt(doc),b=await rasterizeReceipt(doc); assert.equal(a.sha256,b.sha256); assert.deepEqual(a.payload,b.payload);
  const meta=await sharp(a.payload).metadata(); assert.equal(meta.width,width===80?576:384);assert.equal(meta.height,doc.height);assert.ok(a.payload.length<262144);
  const {data}=await sharp(a.payload).removeAlpha().grayscale().raw().toBuffer({resolveWithObject:true}); const values=new Set(data);assert.deepEqual([...values].sort((a,b)=>a-b),[0,255]);assert.ok(data.filter(x=>x===0).length>5000,'font text actually rendered');
 }
});
test('renderer rejects oversized/unresolved image payloads',async()=>{
 const doc=renderKitchenReceiptSvg(DEFAULT_KITCHEN_SETTINGS,SAMPLE_KITCHEN_RECEIPT);
 await assert.rejects(rasterizeReceipt({...doc,height:8193}),/receipt_render_unavailable/);
 await assert.rejects(rasterizeReceipt({...doc,svg:doc.svg.replace('</svg>','<image href="https://example.com/private.png" width="10" height="10"/></svg>')}),/receipt_render_unavailable/);
});
test('logo allows known HTTPS origins only and bounded raster decoding',async t=>{
 for(const url of ['http://firebasestorage.googleapis.com/a','https://127.0.0.1/a','https://example.org/a','https://firebasestorage.googleapis.com:444/a','https://user:pw@firebasestorage.googleapis.com/a']) assert.throws(()=>receiptLogoUrl(url));
 const saved=global.fetch;t.after(()=>global.fetch=saved);
 const png=await sharp({create:{width:20,height:20,channels:3,background:'black'}}).png().toBuffer();
 global.fetch=async(url,options)=>{assert.equal(options.redirect,'error');return new Response(png,{headers:{'content-type':'image/png'}})};
 assert.match(await resolveReceiptLogo('https://firebasestorage.googleapis.com/a'),/^data:image\/png;base64,/);
 global.fetch=async()=>new Response('<svg/>',{headers:{'content-type':'image/svg+xml'}});await assert.rejects(resolveReceiptLogo('https://firebasestorage.googleapis.com/a'));
 global.fetch=async()=>new Response(Buffer.alloc(524289),{headers:{'content-type':'image/png'}});await assert.rejects(resolveReceiptLogo('https://firebasestorage.googleapis.com/a'));
});


test('paper checkboxes rasterize as empty black outlines at both paper widths', async () => {
 for (const paperWidthMm of [58, 80]) {
  const doc = renderKitchenReceiptSvg({ ...DEFAULT_KITCHEN_SETTINGS, paperWidthMm }, SAMPLE_KITCHEN_RECEIPT);
  const boxes = [...doc.svg.matchAll(/<rect data-paper-checkbox="true" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)].map(match => match.slice(1).map(Number));
  assert.equal(boxes.length, 9);
  const { payload } = await rasterizeReceipt(doc);
  const { data, info } = await sharp(payload).removeAlpha().grayscale().raw().toBuffer({ resolveWithObject: true });
  for (const [x, y, width, height] of boxes) {
   const pixel = (px, py) => data[py * info.width + px];
   assert.equal(pixel(x, y + height / 2), 0, 'left outline is black');
   assert.equal(pixel(x + width / 2, y), 0, 'top outline is black');
   assert.equal(pixel(x + width / 2, y + height / 2), 255, 'box remains empty for pen marking');
  }
 }
});

/* Generate smaller AVIF variants of the website's dish images (shown at ~360-400 CSS px).
 * Variants live beside the pinned payload (preview/esmeralda/variants/), so the payload's
 * size budget and route inventory are unchanged. Output names follow the asset convention:
 * the first 24 hex characters of the variant's SHA256. Run: node scripts/preview-image-variants.cjs */
const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto'),sharp=require('sharp');
const {chromium}=require('playwright');
// sharp's bundled libheif cannot decode some AVIF profiles; Chromium can. Decode there, encode with sharp.
async function decodeResized(page,bytes,mime,width){
 const dataUrl=`data:${mime};base64,${bytes.toString('base64')}`;
 const png=await page.evaluate(async([url,w])=>{const img=new Image();img.src=url;await img.decode();
  const h=Math.round(img.naturalHeight*w/img.naturalWidth),c=document.createElement('canvas');c.width=w;c.height=h;
  const ctx=c.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,w,h);
  return {data:c.toDataURL('image/png').split(',')[1],natural:img.naturalWidth};},[dataUrl,width]);
 return {png:Buffer.from(png.data,'base64'),natural:png.natural};
}
const dir='preview/esmeralda',out=`${dir}/variants`,WIDTH=760,hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(`${dir}/manifest.json`));
 const packed=Buffer.concat([0,1,2].map(i=>fs.readFileSync(`${dir}/payload.json.gz.part-00${i}`)));
 if(hash(packed)!==manifest.payload_sha256)throw Error('Input payload integrity mismatch');
 const payload=JSON.parse(zlib.gunzipSync(packed));
 const sources=new Set();
 for(const entry of Object.values(payload)){
  if(!entry.file.endsWith('.html'))continue;
  for(const tag of Buffer.from(entry.data,'base64').toString().match(/<img\b[^>]*>/g)||[])
   if(/class="[^"]*\b(?:dishes_image|menu-product-image|recommend-image|product_template-image)\b/.test(tag)){const src=tag.match(/\bsrc="(\/_assets\/[^"]+)"/);if(src)sources.add(src[1]);}
 }
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']}),page=await browser.newPage();
 const routes={};
 for(const source of [...sources].sort()){
  const bytes=Buffer.from(payload[source].data,'base64');
  if(hash(bytes)!==manifest.routes[source].sha256)throw Error('Source integrity mismatch '+source);
  const mime={avif:'image/avif',webp:'image/webp',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'}[source.split('.').pop()];
  if(!mime)continue;
  const probe=await decodeResized(page,bytes,mime,WIDTH);
  const meta={width:probe.natural};
  if(!meta.width||meta.width<=WIDTH*1.2)continue;
  const variant=await sharp(probe.png).avif({quality:50,effort:6}).toBuffer();
  if(variant.length>=bytes.length*0.8)continue;
  const vm=await sharp(variant).metadata(),sha=hash(variant),route=`/_assets/${sha.slice(0,24)}.avif`;
  fs.writeFileSync(`${out}/${sha.slice(0,24)}.avif`,variant);
  routes[route]={sha256:sha,size:variant.length,width:vm.width,height:vm.height,source,sourceWidth:meta.width,sourceBytes:bytes.length};
 }
 await browser.close();
 for(const file of fs.readdirSync(out))if(file.endsWith('.avif')&&!routes[`/_assets/${file}`])fs.unlinkSync(`${out}/${file}`);
 fs.writeFileSync(`${dir}/variants.json`,JSON.stringify({version:1,width:WIDTH,source_payload_sha256:manifest.payload_sha256,routes},null,2)+'\n');
 const before=Object.values(routes).reduce((n,r)=>n+r.sourceBytes,0),after=Object.values(routes).reduce((n,r)=>n+r.size,0);
 console.log(JSON.stringify({dishSources:sources.size,variants:Object.keys(routes).length,sourceKB:Math.round(before/1024),variantKB:Math.round(after/1024)}));
})().catch(e=>{console.error(e);process.exit(1);});

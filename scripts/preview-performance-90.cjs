/* Reproducible homepage-only delivery patch. Existing source assets/routes stay pinned. */
const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib'),sharp=require('sharp');
const dir='preview/esmeralda',manifest=JSON.parse(fs.readFileSync(`${dir}/manifest.json`));
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`${dir}/payload.json.gz.part-00${i}`)))));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=k=>Buffer.from(payload[k].data,'base64');
const css=['/_assets/35bcf5deb637f8de14c02ad4.css','/_assets/28105a59fc9c2fd50cc83d1f.css'];
const photos=['a0d1273deaf4aee98f5aaeb5.webp','136fa7864ea41c342d69547e.jpeg','586bd71bca149b42d73325b8.avif','4a2de651d080f5c13feefd7d.webp','32177a40775747475536f010.webp','725894228d4a0a2348a9cecf.webp','fee0e20939516ef0378f9b09.avif','23686dd052ee2a5182738a74.avif','176687f7da9b80564ca50baf.avif','b610e32661ae72c42217ac27.webp'];
function entry(route,data,file){payload[route]={data:data.toString('base64'),sha256:hash(data),size:data.length,file};manifest.routes[route]={sha256:hash(data),size:data.length,file};}
(async()=>{
 let html=bytes('/').toString();if(html.includes('data-home-delivery-css'))throw Error('Homepage delivery patch already applied');
 for(const path of css){const source=bytes(path).toString();if(/url\((?!['"]?(?:\/_assets\/|data:))/.test(source))throw Error('Relative CSS URL must be rebased');const re=new RegExp('<link[^>]*href="'+path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"[^>]*>');if(!re.test(html))throw Error('Missing stylesheet '+path);html=html.replace(re,()=>`<style data-home-delivery-css="${path}">${source}</style>`);}
 const variants={},added={};
 for(const sourceName of [...photos,'cbdfddea996fb10f5850db63.png']){
  const source='/_assets/'+sourceName,input=bytes(source),meta=await sharp(input).metadata(),widths=[640,1024,1536].filter(w=>w<meta.width);
  widths.push(meta.width);const unique=[...new Set(widths)];if(meta.width<640)unique.splice(0,unique.length,meta.width);
  variants[source]={width:meta.width,height:meta.height,items:[]};
  for(const width of unique){const image=sharp(input).rotate().resize({width,withoutEnlargement:true});const format=sourceName.endsWith('.png')?'webp':'avif';const output=await(format==='webp'?image.webp({quality:80}):image.avif({quality:50,effort:4})).toBuffer();const actual=await sharp(output).metadata();const route='/_assets/'+hash(output).slice(0,24)+'.'+format;entry(route,output,route.slice(1));variants[source].items.push({route,width:actual.width,height:actual.height,bytes:output.length});added[route]={source,source_sha256:hash(input),width:actual.width,height:actual.height,format};}
 }
 html=html.replace(/<img\b[^>]*>/g,tag=>{
  const src=tag.match(/\bsrc="([^"]+)"/)?.[1],v=variants[src];if(!v)return tag;
  const cls=tag.match(/\bclass="([^"]+)"/)?.[1]||'',hero=cls.includes('es-club-hero__art');
  const fallback=v.items[v.items.length-1];let result=tag.replace(/\bsrc="[^"]+"/,`src="${fallback.route}"`).replace(/\s+(?:width|height|srcset|sizes)="[^"]*"/g,'');
  const attrs=` width="${v.width}" height="${v.height}" srcset="${v.items.map(x=>`${x.route} ${x.width}w`).join(', ')}" sizes="${hero?'(max-width: 767px) 150vw, 100vw':cls.includes('home_hero-image')?'(max-width: 479px) 220vw, 100vw':cls.includes('es-header')?'182px':cls.includes('dishes_image')?'(max-width: 767px) calc(100vw - 32px), 400px':'(max-width: 767px) calc(100vw - 32px), 665px'}"`;
  return result.replace(/\/?>(?=$)/,attrs+'/>');
 });
 html=html.replace(/(<svg\b[^>]*?)width="auto" height="auto"/g,'$1width="24" height="24"');
 html=html.replace(/<script src="(\/_assets\/(?:c20b9103a46c955dbf875b86|7dd5e0f0d6218a923ffff42c|999ae0b6130b0d3228f7376f)\.js)"/g,'<script defer src="$1"');
 // The Club section is a direct child of the CMS list, as are the other slides.
 html=html.replace('<section id="pizza-club"','<section role="listitem" id="pizza-club"');
 const row="<style data-home-carousel-controls>.es-home-hero-controls{display:contents}@media(max-width:767px){.es-home-hero-controls{display:flex;box-sizing:border-box;justify-content:space-between;align-items:center;width:100%;height:60px;padding:8px 16px;background:#000}.section_home-hero .es-home-hero-controls .swiper-button-prev,.section_home-hero .es-home-hero-controls .swiper-button-next{position:static;inset:auto;transform:none;margin:0;width:44px;height:44px}}</style>";
 html=html.replace('</head>',row+'</head>').replace('<div class="swiper-button-prev">','<div class="es-home-hero-controls"><div class="swiper-button-prev">').replace('<div class="pagination-dot">','</div><div class="pagination-dot">');
 html=html.replace("el.dataset.swiperReady='1';swiper()","el.dataset.swiperReady='1';if(el.querySelector('.swiper-wrapper[role=\"list\"]'))opt.a11y=Object.assign({},opt.a11y,{slideRole:'listitem'});swiper()");
 // This synchronously parsed safety layer stays first; no provider consent gate is deferred.
 if(!html.includes('<head><script src="/_assets/website-consent.js"></script>'))throw Error('Consent bootstrap order changed');
 entry('/',Buffer.from(html),payload['/'].file);
 manifest.homepage_delivery={version:2,inline_css:css.map(route=>({route,sha256:hash(bytes(route))})),responsive_images:variants};
 manifest.added_assets={...manifest.added_assets,...Object.fromEntries(Object.entries(added).map(([route,value])=>[route,{...value,activation:'homepage-responsive-image',upstream:'Esmeralda-Website#18; scripts/preview-performance-90.cjs'}]))};
 const packed=zlib.gzipSync(Buffer.from(JSON.stringify(payload)),{level:9});if(packed.length>18*1024*1024)throw Error('Payload exceeds three-part limit');
 for(let i=0;i<3;i++)fs.writeFileSync(`${dir}/payload.json.gz.part-00${i}`,packed.subarray(i*6*1024*1024,(i+1)*6*1024*1024));
 manifest.payload_sha256=hash(packed);fs.writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({routes:Object.keys(payload).length,added:Object.keys(added).length,payloadBytes:packed.length,images:variants},null,2));
})();

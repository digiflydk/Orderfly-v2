/* One-page repair of the public category filter, never a provider form. */
const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const dir='preview/esmeralda',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(`${dir}/manifest.json`));
const packed=Buffer.concat([0,1,2].map(i=>fs.readFileSync(`${dir}/payload.json.gz.part-00${i}`)));
if(hash(packed)!==manifest.payload_sha256)throw Error('Input payload integrity mismatch');
if(manifest.menu_filter_accessibility)throw Error('Menu filter patch already applied');
const payload=JSON.parse(zlib.gunzipSync(packed)),entry=payload['/menu'];
if(entry.sha256!=='6e2ad876a89f0e017838ab98c6048d39ad3da0c389084f19c4e9967e96efec59')throw Error('Unexpected menu source');
let html=Buffer.from(entry.data,'base64').toString();
const form=/<form id="wf-form-Dish-category"[^>]*>/g,forms=[...html.matchAll(form)];
if(forms.length!==1||!forms[0][0].includes('fs-cmsfilter-element="filters"'))throw Error('Unexpected filter form');
html=html.replace(form,tag=>{
 const next=tag.replace(/ data-turnstile-sitekey="[^"]+"/,'');
 if(next===tag)throw Error('Expected inert category form CAPTCHA metadata');return next;
});
const clear='<div fs-cmsfilter-element="clear" class="all-text-wrapper"><div class="text-size-medium">all</div></div>';
if(html.split(clear).length!==2)throw Error('Unexpected clear control');
html=html.replace(clear,'<button type="button" fs-cmsfilter-element="clear" class="all-text-wrapper"><span class="text-size-medium">all</span></button>');
const css='<style data-menu-filter-accessibility="v1">#wf-form-Dish-category .radio-button{display:block;position:absolute;width:1px;height:1px;padding:0;margin:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}#wf-form-Dish-category .menu-wrap:focus-within,#wf-form-Dish-category button[fs-cmsfilter-element="clear"]:focus-visible{outline:2px solid #fbb931;outline-offset:3px}#wf-form-Dish-category button[fs-cmsfilter-element="clear"]{background:none;border:0;color:inherit;font-size:inherit;font-weight:inherit;line-height:inherit;text-align:inherit;padding-bottom:0}#wf-form-Dish-category button[fs-cmsfilter-element="clear"].is-active{color:var(--color-orange)}</style>';
html=html.replace('</head>',css+'</head>');
const body=Buffer.from(html);payload['/menu']={...entry,data:body.toString('base64'),size:body.length,sha256:hash(body)};
manifest.routes['/menu']={...manifest.routes['/menu'],size:body.length,sha256:hash(body)};
manifest.menu_filter_accessibility={version:1,route:'/menu',source_sha256:entry.sha256,scope:'native-keyboard-filter-and-no-inert-captcha'};
const output=zlib.gzipSync(Buffer.from(JSON.stringify(payload)),{level:9});
if(output.length>18*1024*1024)throw Error('Payload exceeds three-part limit');
for(let i=0;i<3;i++)fs.writeFileSync(`${dir}/payload.json.gz.part-00${i}`,output.subarray(i*6*1024*1024,(i+1)*6*1024*1024));
manifest.payload_sha256=hash(output);fs.writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({changedRoutes:['/menu'],payloadBytes:output.length}));

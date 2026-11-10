const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const {loadTs}=require('../helpers/load-ts.cjs');
const routes=loadTs('src/lib/website-booking-routes.ts'),page=loadTs('src/lib/website-booking-page.ts'),server=loadTs('src/lib/web-design-preview-server.ts');
const req=p=>new Request('https://backend.internal'+p,{headers:{host:'www.esmeraldapizza.dk','x-forwarded-proto':'https'}});
test('all three URLs serve the maintained booking flow and substeps are not indexable',async()=>{process.env.ESMERALDA_PUBLIC_ENABLED='true';try{
 for(const path of ['/bordbooking','/bordbooking/informationer','/bordbooking/bekr%C3%A6ftelse']){const response=await server.webDesignPreviewResponse(req(path));assert.equal(response.status,200,path);assert.match(await response.text(),/src="\/_booking\/flow.js"/);assert.match(response.headers.get('content-security-policy'),/booking-api/);assert.equal(response.headers.get('cache-control'),'no-store');if(path!=='/bordbooking')assert.match(response.headers.get('x-robots-tag'),/noindex/);}
 const redirect=await server.webDesignPreviewResponse(req('/bordbooking/Bekr%C3%A6ftelse?utm_campaign=test%2Fbooking'));assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'/bordbooking/bekr%C3%A6ftelse?utm_campaign=test%2Fbooking');
 const js=await server.webDesignPreviewResponse(req('/_booking/flow.js'));assert.equal(await js.text(),fs.readFileSync('preview/esmeralda/adapters/website-booking.js','utf8'));
 for(const path of ['/bordbooking/unknown','/bordbooking%2Finformationer','/bordbooking/informationer/extra'])assert.equal((await server.webDesignPreviewResponse(req(path))).status,404,path);
}finally{delete process.env.ESMERALDA_PUBLIC_ENABLED}});
test('the captured page transformation replaces exactly one script and preserves all other markup',()=>{
 const packed=Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`))),html=Buffer.from(JSON.parse(zlib.gunzipSync(packed))['/bordbooking'].data,'base64').toString();
 const old=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(x=>x[1].includes("const root = document.getElementById('esmeralda-direct-booking')"))[0];
 assert.equal(page.insertWebsiteBooking(html),html.replace(old,'<script src="/_booking/flow.js" defer></script>').replace("location.pathname.replace(/\\/$/,'')==='/bordbooking'", "document.getElementById('esmeralda-direct-booking')"));
 assert.throws(()=>page.insertWebsiteBooking('<html>missing</html>'));
 assert.equal(routes.websiteBookingStep('/bordbooking/%E0%A4%A'),null);
});

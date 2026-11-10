const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {loadTs}=require('./load-ts.cjs');
/**
 * SHA256 of the bytes the public host serves for a packaged route. `/` gets the
 * customer-review section inserted at response time (src/lib/website-reviews-section.ts),
 * so its served bytes are the pinned manifest bytes plus that exact insertion.
 */
function servedSha(manifest){
 const {insertWebsiteReviews}=loadTs('src/lib/website-reviews-section.ts');
 const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`)))));
 const home=Buffer.from(payload['/'].data,'base64');
 if(crypto.createHash('sha256').update(home).digest('hex')!==manifest.routes['/'].sha256)throw Error('Homepage payload does not match its manifest pin');
 const served=Buffer.from(insertWebsiteReviews(home.toString('utf8')));
 const homeSha=crypto.createHash('sha256').update(served).digest('hex');
 const sha=route=>route==='/'?homeSha:manifest.routes[route].sha256;
 sha.size=route=>route==='/'?served.length:manifest.routes[route].size;
 return sha;
}
module.exports={servedSha};

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
 const {insertWebsiteBooking}=loadTs('src/lib/website-booking-page.ts');
 const booking=Buffer.from(payload['/bordbooking'].data,'base64');
 if(crypto.createHash('sha256').update(booking).digest('hex')!==manifest.routes['/bordbooking'].sha256)throw Error('Booking payload does not match its manifest pin');
 const bookingSha=crypto.createHash('sha256').update(Buffer.from(insertWebsiteBooking(booking.toString('utf8')))).digest('hex');
 const home=Buffer.from(payload['/'].data,'base64');
 if(crypto.createHash('sha256').update(home).digest('hex')!==manifest.routes['/'].sha256)throw Error('Homepage payload does not match its manifest pin');
 const servedHome=Buffer.from(insertWebsiteReviews(home.toString('utf8'))),servedBooking=Buffer.from(insertWebsiteBooking(booking.toString('utf8')));
 const homeSha=crypto.createHash('sha256').update(servedHome).digest('hex');
 const sha=route=>route==='/'?homeSha:route==='/bordbooking'?bookingSha:manifest.routes[route].sha256;
 sha.size=route=>route==='/'?servedHome.length:route==='/bordbooking'?servedBooking.length:manifest.routes[route].size;
 return sha;
}
module.exports={servedSha};

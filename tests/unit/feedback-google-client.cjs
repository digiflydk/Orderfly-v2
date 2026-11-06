const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {fetchGoogleReviews}=loadTs('src/lib/feedback/google-client.ts');
const review=(id,rating='FIVE')=>({reviewId:id,starRating:rating,comment:'Original text',createTime:'2026-11-01T12:00:00Z',updateTime:'2026-11-02T12:00:00Z',reviewer:{displayName:'Customer'}});
test('pagination filters five stars, preserves source and deduplicates',async()=>{
 let calls=0;
 const rows=await fetchGoogleReviews('accounts/123/locations/456','secret',async(url,opts)=>{
 assert.equal(url.origin,'https://mybusiness.googleapis.com');assert.equal(opts.cache,'no-store');assert.equal(opts.headers.Authorization,'Bearer secret');
 calls++;if(calls===2)assert.equal(url.searchParams.get('pageToken'),'next');
 return Response.json(calls===1?{reviews:[review('a'),review('b','FOUR')],nextPageToken:'next'}:{reviews:[review('a'),review('c')]});});
 assert.equal(calls,2);assert.deepEqual(rows.map(x=>x.reviewId),['a','c']);assert.equal(rows[0].comment,'Original text');
});
test('rejects path injection before sending credentials',async()=>{await assert.rejects(fetchGoogleReviews('accounts/1/locations/2?x=1','token',()=>{throw Error('unexpected request')}),/INVALID_LOCATION/);});
test('Google errors are sanitized and malformed pages fail closed',async()=>{
 for(const [status,code] of [[401,'GOOGLE_AUTH'],[403,'GOOGLE_ACCESS'],[429,'GOOGLE_QUOTA'],[500,'GOOGLE_UNAVAILABLE']]) await assert.rejects(fetchGoogleReviews('accounts/1/locations/2','token',async()=>new Response('secret provider message',{status})),new RegExp(code));
 await assert.rejects(fetchGoogleReviews('accounts/1/locations/2','token',async()=>Response.json({reviews:[{starRating:'FIVE'}]})));
});
test('repeated pagination token fails instead of committing incomplete data',async()=>{await assert.rejects(fetchGoogleReviews('accounts/1/locations/2','token',async()=>Response.json({reviews:[],nextPageToken:'same'})),/GOOGLE_PAGINATION/);});

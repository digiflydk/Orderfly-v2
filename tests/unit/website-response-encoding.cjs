const {test}=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const {loadTs}=require('../helpers/load-ts.cjs');
const {encodeWebsiteResponse}=loadTs('src/lib/website-response-encoding.ts');
const bytes=Buffer.from('This is website text. '.repeat(200));
for(const encoding of ['gzip','br, gzip;q=0.8','GZIP'])test(`compress negotiated text ${encoding}`,()=>{
 const headers=new Headers({'Content-Type':'text/html','Content-Length':String(bytes.length)});
 const result=encodeWebsiteResponse(bytes,headers,new Request('http://fixture.test',{headers:{'Accept-Encoding':encoding}}));
 assert.deepEqual(zlib.gunzipSync(result),bytes);assert.equal(headers.get('Content-Encoding'),'gzip');assert.equal(headers.get('Content-Length'),String(result.length));assert.equal(headers.get('Vary'),'Accept-Encoding');
});
for(const encoding of ['', 'br','gzip;q=0','gzip;q=0.000','gzip;q=invalid'])test(`identity when gzip unavailable ${encoding}`,()=>{
 const headers=new Headers({'Content-Type':'text/html','Content-Length':String(bytes.length)});
 assert.deepEqual(Buffer.from(encodeWebsiteResponse(bytes,headers,new Request('http://fixture.test',{headers:{'Accept-Encoding':encoding}}))),bytes);assert.equal(headers.get('Content-Encoding'),null);
});
test('images remain unchanged',()=>{
 const headers=new Headers({'Content-Type':'image/webp'});assert.deepEqual(Buffer.from(encodeWebsiteResponse(bytes,headers,new Request('http://fixture.test',{headers:{'Accept-Encoding':'gzip'}}))),bytes);assert.equal(headers.get('Content-Encoding'),null);
});

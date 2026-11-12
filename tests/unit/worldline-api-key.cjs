const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {parseWorldlineApiKey}=loadTs('src/lib/payments/worldline-api-key.ts',{'server-only':{}});
const encode=value=>Buffer.from(value).toString('base64');
test('official combined API key and Basic header decode into existing authentication tuple only',()=>{
 const expected={accessToken:'synthetic-access',merchantNumber:'T123',secretToken:'synthetic-secret'};
 for(const value of [encode('synthetic-access@T123:synthetic-secret'),'Basic '+encode('synthetic-access@T123:synthetic-secret')]){assert.deepEqual(parseWorldlineApiKey(value,'test'),expected);assert.equal(parseWorldlineApiKey(value,'test').md5Key,undefined);}
});
test('rejects wrong environment, malformed encoding, unknown key formats and header injection',()=>{
 assert.throws(()=>parseWorldlineApiKey(encode('a@P123:s'),'test'),e=>e.code==='api_key_environment_mismatch');
 for(const value of ['not-a-base64-key',encode('a@T123'),encode('a@T123:s\r\ninjected'),encode('a@T123:s')+'?',encode('a@T123:s')+'==','Bearer '+encode('a@T123:s'),encode('a@T123:'),'x'.repeat(4097)])assert.throws(()=>parseWorldlineApiKey(value,'test'));
});
test('errors contain neither supplied nor decoded credential material',()=>{
 const value=encode('private-access@P123:private-secret');assert.throws(()=>parseWorldlineApiKey(value,'test'),e=>!e.message.includes(value)&&!e.message.includes('private-access')&&!e.message.includes('private-secret'));
});

const {test}=require('node:test');const assert=require('node:assert/strict');const {loadTs}=require('../helpers/load-ts.cjs');
const schema=loadTs('src/lib/delivery/quotes/diagnostic-schema.ts');
test('diagnostics only classify fixed codes and never store provider messages or prototype keys',()=>{
 for(const reason of ['API_SECRET_123 user@example.com','constructor','__proto__',new Error('private address')])assert.equal(schema.quoteDiagnosticCode(reason),'unclassified');
 assert.equal(schema.quoteDiagnosticCode({name:'ZodError',message:'secret'}),'schema_invalid');
 assert.equal(schema.quoteDiagnosticCode({code:7,message:'secret'}),'permission_denied');
 assert.equal(schema.quoteDiagnosticSchema.safeParse({stage:'runtime',code:'secret_value',atMs:1}).success,false);
});
test('only matching managed scopes write a bounded throttled diagnostic; failures are non-blocking',async()=>{
 const rows=new Map(),db=require('../helpers/marketing-db.cjs').memoryDb(rows);
 const api=loadTs('src/lib/delivery/quotes/diagnostics.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db}});
 const scope={brandId:'a',locationId:'a1'},key=api.quoteDiagnosticId(scope),path='deliveryQuoteDiagnostics/'+key;
 const data={stage:'runtime',code:'schema_invalid',atMs:10000};
 await api.recordQuoteDiagnostic(scope,data);assert.equal(rows.has(path),false);
 rows.set('locations/a1',{brandId:'a'});rows.set('deliveryAdoptions/'+key,{...scope,mode:'managed'});
 await api.recordQuoteDiagnostic(scope,data);assert.deepEqual(rows.get(path),{...scope,...data});
 await api.recordQuoteDiagnostic(scope,{...data,code:'unclassified',atMs:11000});assert.equal(rows.get(path).atMs,10000);
 await api.recordQuoteDiagnostic(scope,{...data,atMs:16000});assert.equal(rows.get(path).atMs,16000);
 rows.get('locations/a1').brandId='b';await api.recordQuoteDiagnostic(scope,{...data,atMs:22000});assert.equal(rows.get(path).atMs,16000);
 await api.recordQuoteDiagnostic(scope,{...data,code:'secret'});assert.equal(rows.get(path).code,'schema_invalid');
 assert.equal([...rows.keys()].filter(k=>k.startsWith('deliveryQuoteDiagnostics/')).length,1);
});

const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {previewQrCsv,QR_CSV_MAX_BYTES}=loadTs('src/lib/qr/bulk.ts');
const scope={allowedScopes:[{brandId:'brand-a',locationIds:['loc-a'],allowBrandWide:true},{brandId:'brand-b',locationIds:['loc-b']}]};
const header='name,destination,brand_id,location_id,campaign,tags,utm_source';

test('valid BOM/quoted comma/doubled quotes CRLF input previews normalized entries',()=>{
 const result=previewQrCsv('\uFEFF'+header+'\r\n"Pizza, ""Pazza""",https://example.org/?a=1#menu,brand-a,loc-a,Autumn,pizza|print|pizza,flyer\r\n',scope);
 assert.equal(result.ok,true);assert.deepEqual(result.errors,[]);assert.equal(result.rows[0].row,2);
 assert.deepEqual(result.plan.entries,[{name:'Pizza, "Pazza"',destination:'https://example.org/?a=1&utm_source=flyer#menu',brandId:'brand-a',locationId:'loc-a',campaign:'Autumn',tags:['pizza','print']}]);
});
test('quoted multiline fields parse as one record then fail field validation, without partial plan',()=>{
 const result=previewQrCsv(header+'\nGood,https://example.org,brand-a,loc-a,,,\n"Bad\nname",https://example.org,brand-a,loc-a,,,',scope);
 assert.equal(result.ok,false);assert.equal(result.rows.length,2);assert.equal(result.rows[0].entry.name,'Good');assert.equal(result.rows[1].entry,null);assert.equal(result.plan,null);
 assert.deepEqual(result.errors,[{row:3,field:'name',code:'invalid_field'}]);
});
test('invalid quote grammar is a CSV error rather than repaired silently',()=>{
 for(const line of ['"Unclosed,https://example.org,brand-a','Bad"quote,https://example.org,brand-a','"closed"extra,https://example.org,brand-a']){
  const r=previewQrCsv('name,destination,brand_id\n'+line,scope);assert.equal(r.plan,null);assert.equal(r.errors[0].code,'invalid_csv');
 }
});
test('unknown, duplicate and missing headers reject the whole CSV; column mismatch is row-level',()=>{
 for(const csv of ['name,destination,brand_id,secret\nX,https://example.org,brand-a,x','name,name,destination,brand_id\nX,X,https://example.org,brand-a','name,destination\nX,https://example.org']) assert.equal(previewQrCsv(csv,scope).errors[0].code,'invalid_header');
 const r=previewQrCsv('name,destination,brand_id\nX,https://example.org',scope);assert.deepEqual(r.errors,[{row:2,field:'csv',code:'invalid_csv'}]);assert.equal(r.plan,null);
});
test('scopes are validated per row with brandwide separately authorized',()=>{
 const r=previewQrCsv('name,destination,brand_id,location_id\nA,https://example.org,brand-a,loc-b\nB,https://example.org,brand-b,\nC,https://example.org,brand-c,loc-c\nD,https://example.org,brand-b,loc-b',scope);
 assert.equal(r.errors.length,3);assert.ok(r.errors.every(e=>e.code==='forbidden_scope'));assert.equal(r.rows[3].entry.brandId,'brand-b');assert.equal(r.plan,null);
 assert.equal(previewQrCsv('name,destination,brand_id\nX,https://example.org,brand-a',scope).ok,true);
 assert.equal(previewQrCsv('name,destination,brand_id\nX,https://example.org,brand-a',{allowedScopes:[]}).ok,false);
});
test('unsafe destinations/oversize UTM and duplicate within-scope names fail',()=>{
 const r=previewQrCsv(header+'\nA,http://example.org,brand-a,loc-a,,,\nB,https://orderfly.dk/q/abc,brand-a,loc-a,,,\nC,https://example.org,brand-a,loc-a,,,'+'x'.repeat(201)+'\nD,https://example.org,brand-a,loc-a,,,\nD,https://example.org/other,brand-a,loc-a,,,',scope);
 assert.equal(r.plan,null);assert.equal(r.errors.filter(e=>e.code==='invalid_destination').length,3);assert.equal(r.errors.at(-1).code,'duplicate_row');
});
test('100-row bound and byte bound fail without truncation',()=>{
 const make=n=>'name,destination,brand_id\n'+Array.from({length:n},(_,i)=>`Name${i},https://example.org,brand-a`).join('\n');
 assert.equal(previewQrCsv(make(100),scope).plan.entries.length,100);assert.equal(previewQrCsv(make(101),scope).errors[0].code,'too_many_rows');
 assert.equal(previewQrCsv('x'.repeat(QR_CSV_MAX_BYTES+1),scope).errors[0].code,'too_large');
});
test('canonical plan is deterministic across equivalent header order, BOM, UTM and tags',()=>{
 const a=previewQrCsv(header+'\nMenu,https://example.org,brand-a,loc-a,Test,b|a,poster',scope);
 const b=previewQrCsv('\uFEFFbrand_id,name,location_id,destination,utm_source,tags,campaign\r\nbrand-a,Menu,loc-a,https://example.org,poster,a|b|a,Test\r\n',scope);
 assert.equal(a.plan.canonical,b.plan.canonical);assert.equal(a.plan.schemaVersion,1);
 const c=previewQrCsv(header+'\nMenu,https://example.org,brand-a,loc-a,Test,b|a,flyer',scope);assert.notEqual(a.plan.canonical,c.plan.canonical);
});
test('blank records, empty input, control bytes and extra cells are rejected',()=>{
 for(const csv of ['',header,header+'\n\n',header+'\nX,https://example.org,brand-a,loc-a,,,\u0000']) assert.equal(previewQrCsv(csv,scope).ok,false);
 const r=previewQrCsv('name,destination,brand_id\nX,https://example.org,brand-a,extra',scope);assert.equal(r.plan,null);assert.equal(r.errors[0].code,'invalid_csv');
});

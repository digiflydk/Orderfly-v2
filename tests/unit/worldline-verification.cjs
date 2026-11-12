const {test}=require('node:test'), assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
function load(path,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>mocks[n]||require(n)});return exports;}
const settings=load('src/lib/payments/worldline-settings.ts');
const {assertWorldlineTransaction,worldlineBindingSchema}=load('src/lib/payments/worldline-verification.ts',{'./worldline-settings':settings});
const expected={transactionId:'123',orderId:'ORD-123',merchantNumber:'T123',mode:'test',amountMinor:12500,currency:'DKK'};
const transaction={id:'123',orderid:'ORD-123',merchantnumber:'T123',status:'approved',currency:{code:'DKK',minorunits:2},total:{authorized:12500,captured:12500,credited:0}};
test('settlement requires exact captured transaction; authorization alone is not Paid',()=>{
 assert.equal(assertWorldlineTransaction(transaction,expected,true).id,'123');
 assert.throws(()=>assertWorldlineTransaction({...transaction,total:{...transaction.total,captured:0}},expected,true));
 assert.doesNotThrow(()=>assertWorldlineTransaction({...transaction,total:{...transaction.total,captured:0}},expected));
});
test('rejects wrong transaction, order, merchant, currency and environment',()=>{
 for(const patch of [{id:'456'},{orderid:'ORD-456'},{merchantnumber:'T456'},{currency:{code:'EUR',minorunits:2}},{currency:{code:'DKK',minorunits:0}}]) assert.throws(()=>assertWorldlineTransaction({...transaction,...patch},expected,true));
 assert.throws(()=>assertWorldlineTransaction(transaction,{...expected,mode:'live'},true));
});
test('rejects changed amounts, refunds, invalid status and unsafe totals',()=>{
 for(const total of [{authorized:12499,captured:12500,credited:0},{authorized:12500,captured:12500,credited:1},{authorized:12500,captured:12501,credited:0}])assert.throws(()=>assertWorldlineTransaction({...transaction,total},expected,true));
 for(const status of ['waiting','pending','deleted','declined','verificationapproved'])assert.throws(()=>assertWorldlineTransaction({...transaction,status},expected,true));
 for(const amountMinor of [0,-1,NaN,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>assertWorldlineTransaction(transaction,{...expected,amountMinor},true));
});
test('pinned binding rejects mutable versions and crossed environments',()=>{
 const binding={provider:'worldline',mode:'test',owner:{brandId:'b'},reference:`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/1`,merchantNumber:'T123',revision:1};
 assert.equal(worldlineBindingSchema.safeParse(binding).success,true);
 for(const patch of [{reference:binding.reference.replace('/1','/latest')},{mode:'live'},{merchantNumber:'P123'},{revision:0}])assert.equal(worldlineBindingSchema.safeParse({...binding,...patch}).success,false);
});

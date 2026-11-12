const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm'),{createHash}=require('node:crypto');
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/payments/worldline-callback.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,require:n=>n==='server-only'?{}:require(n),Buffer});
const key='synthetic-md5-key';
function signed(extra=[]){const q=new URLSearchParams([['txnid','123'],['orderid','ORD-123'],['amount','12500'],['currency','DKK'],...extra]);q.append('hash',createHash('md5').update([...q.values()].join('')+key).digest('hex'));return q;}
test('validates documented decoded wire order including new parameters',()=>{const q=signed([['future','æ + &']]);const v=api.verifyWorldlineCallback(q,key);assert.equal(v.transactionId,'123');assert.equal(v.amountMinor,12500);});
test('rejects missing, changed, duplicated or unsigned parameters',()=>{
 const cases=[];let q=signed();q.set('amount','1');cases.push(q);q=signed();q.append('orderid','ORD-other');cases.push(q);q=signed();q.append('future','unsigned');cases.push(q);q=signed();q.delete('hash');cases.push(q);q=signed();q.set('hash','bad');cases.push(q);
 for(const q of cases)assert.throws(()=>api.verifyWorldlineCallback(q,key));assert.throws(()=>api.verifyWorldlineCallback(signed(),'wrong'));
});
test('hash is not replay/settlement authority: parser only yields bounded references',()=>{const q=signed();assert.equal(api.verifyWorldlineCallback(q,key).orderId,'ORD-123');assert.equal(api.verifyWorldlineCallback(q,key).orderId,'ORD-123');assert.equal(api.verifyWorldlineCallback(q,key).paymentStatus,undefined);});

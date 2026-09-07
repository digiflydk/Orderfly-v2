const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(path,mocks={}) {
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>name in mocks?mocks[name]:require(name),mod,mod.exports);
 return mod.exports;
}
const calc=load('src/lib/automatic-discounts.ts');
const schema=load('src/lib/standard-discount-schema.ts');
const rules=load('src/lib/promotion-rules.ts');
const offer={brandId:'b',locationIds:['l'],discountName:'3 for 2',discountType:'category',referenceIds:['pizza'],discountMethod:'buy_x_pay_y',buyQuantity:3,payQuantity:2,isActive:true,orderTypes:['pickup','delivery'],activeDays:[],activeTimeSlots:[],timeSlotValidationType:'orderTime'};
const line=(quantity,unitPrice=100,id='p',categoryId='pizza')=>({id,categoryId,quantity,unitPrice});
test('3 for 2: incomplete groups, repeated groups and split lines',()=>{
 for(const [quantity,expected] of [[1,0],[2,0],[3,100],[4,100],[6,200],[7,200]]) assert.equal(calc.quantityDiscount(offer,[line(quantity)]),expected);
 assert.equal(calc.quantityDiscount(offer,[line(1,120),line(1,90),line(1,80)]),80);
 assert.equal(calc.quantityDiscount(offer,[line(2,100),line(1,100)]),100);
 assert.equal(calc.quantityDiscount({...offer,buyQuantity:2,payQuantity:1},[line(2,99.95)]),99.95);
});
test('scope, invalid quantities and cheapest items only',()=>{
 assert.equal(calc.quantityDiscount(offer,[line(2),line(10,10,'drink','drinks')]),0);
 assert.equal(calc.quantityDiscount({...offer,discountType:'product',referenceIds:['p']},[line(3),line(3,10,'other')]),100);
 assert.equal(calc.quantityDiscount(offer,[line(1.5),line(-1),line(0)]),0);
 assert.equal(calc.quantityDiscount({...offer,payQuantity:3},[line(6)]),0);
});
test('best automatic offer wins and never exceeds eligible subtotal',()=>{
 const cart={...offer,discountType:'cart',discountMethod:'percentage',discountValue:50,discountName:'50%'};
 assert.deepEqual(calc.bestAutomaticDiscount([offer,cart],300,[line(3)]),{name:'50%',amount:150});
 assert.equal(calc.bestAutomaticDiscount([offer],330,[line(3)]).amount,100); // toppings remain paid
 assert.equal(calc.bestAutomaticDiscount([{...offer,isActive:false}],300,[line(3)]),null);
 assert.equal(calc.bestAutomaticDiscount([{...offer,minOrderValue:400}],300,[line(3)]),null);
 assert.equal(calc.bestAutomaticDiscount([{...cart,discountMethod:'fixed_amount',discountValue:500}],300,[]).amount,300);
 assert.equal(rules.cartLineEligible(true,100,100,false),false);
 assert.equal(rules.cartLineEligible(false,100,90,false),false);
});
test('same form/server schema accepts supported scopes and rejects invalid deals',()=>{
 assert.equal(schema.standardDiscountSchema.safeParse({...offer,discountImageUrl:''}).success,true);
 for (const patch of [{payQuantity:3},{buyQuantity:2.5},{payQuantity:0},{discountType:'cart',minOrderValue:10},{referenceIds:[]},{locationIds:[]}]) assert.equal(schema.standardDiscountSchema.safeParse({...offer,...patch}).success,false);
 for(const discountType of ['product','category','cart']) for(const discountMethod of ['percentage','fixed_amount']) assert.equal(schema.standardDiscountSchema.safeParse({...offer,discountType,discountMethod,discountValue:10,minOrderValue:100}).success,true);
 assert.equal(schema.standardDiscountSchema.safeParse({...offer,discountMethod:'percentage',discountValue:101}).success,false);
});
test('real action persists quantity fields, retains location on edit, rejects cross-brand references',async()=>{
 let saved; const records={'brands/b':{},'locations/l':{brandId:'b'},'categories/pizza':{locationIds:['l']},'products/foreign':{brandId:'other'}};
 const api=load('src/app/superadmin/standard-discounts/actions.ts',{
  '@/lib/standard-discount-schema':schema,'@/lib/promotion-rules':rules,'@/lib/firebase':{db:{}},'next/cache':{revalidatePath:()=>{},revalidateTag:()=>{}},'next/navigation':{redirect:()=>{throw Error('REDIRECT');}},
  'firebase/firestore':{collection:(_,p)=>p,doc:(db,p,id)=>typeof db==='string'?{id:'new',path:db+'/new'}:{id,path:p+'/'+id},getDoc:async ref=>({exists:()=>ref.path in records,data:()=>records[ref.path]}),Timestamp:{now:()=>0,fromDate:d=>d.toISOString()},setDoc:async(ref,data)=>{assert.ok(Object.values(data).every(v=>v!==undefined));saved=data;records[ref.path]=data;}}
 });
 const form=data=>{const f=new FormData();for(const[k,v]of Object.entries(data)){if(k==='activeTimeSlots')f.set(k,JSON.stringify(v));else if(Array.isArray(v))v.forEach(x=>f.append(k,x));else if(v!==undefined&&v!==false)f.set(k,String(v));}return f;};
 await assert.rejects(api.createOrUpdateStandardDiscount(null,form(offer)),/REDIRECT/);
 assert.equal(saved.buyQuantity,3);assert.deepEqual(saved.locationIds,['l']);assert.equal('discountValue'in saved,false);
 await assert.rejects(api.createOrUpdateStandardDiscount(null,form({...offer,id:'new',buyQuantity:4})),/REDIRECT/);
 assert.equal(saved.buyQuantity,4);assert.deepEqual(saved.locationIds,['l']);
 const rejected=await api.createOrUpdateStandardDiscount(null,form({...offer,discountType:'product',referenceIds:['foreign']}));assert.equal(rejected.error,true);assert.match(rejected.message,/brand/);
});

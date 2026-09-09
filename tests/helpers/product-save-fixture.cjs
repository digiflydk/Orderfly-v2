const {loadTs}=require('./load-ts.cjs');
const sharp=require('sharp');
const {randomUUID}=require('node:crypto');
function fixture(){
 const records=new Map([
  ['brands/b',{name:'Esmeralda QA'}],['brands/c',{name:'CPH QA'}],
  ['locations/l',{brandId:'b',name:'QA Amager'}],['locations/l2',{brandId:'b',name:'QA Hellerup'}],['locations/foreign',{brandId:'c',name:'QA CPH'}],
  ['categories/water',{categoryName:'QA Vand',locationIds:['l','l2']}],['categories/amager-only',{categoryName:'QA Amager only',locationIds:['l']}],['categories/foreign',{categoryName:'QA CPH Vand',locationIds:['foreign']}],
  ['topping_groups/g',{groupName:'QA Extras',locationIds:['l']}],['topping_groups/g2',{groupName:'QA Sauce',locationIds:['l','l2']}],['topping_groups/foreign',{groupName:'QA CPH Extras',locationIds:['foreign']}],
  ['allergens/a',{allergenName:'QA Milk'}],['allergens/a2',{allergenName:'QA Wheat'}],
  ['products/hellerup',{brandId:'b',categoryId:'water',productName:'Existing Hellerup',price:50,priceDelivery:60,locationIds:['l2'],imageUrl:'https://existing.example/keep.jpg'}],
 ]);
 const objects=new Map(), writes=[], storageCalls=[];
 const revisions=new Map();
 const failure={upload:false,write:false,afterWrite:false,permission:false};
 const snap=key=>({updateTime:revisions.get(key)||1,id:key.split('/')[1],exists:records.has(key),data:()=>records.has(key)?{...records.get(key)}:undefined});
 const db={collection:name=>({
  get:async()=>({docs:[...records.keys()].filter(k=>k.startsWith(name+'/')).map(snap)}),
  where:(field,op,value)=>({get:async()=>{
   if(failure.readCollection===name)throw Error('Synthetic reference lookup failure');
   return{docs:[...records.keys()].filter(k=>k.startsWith(name+'/')&&records.get(k)[field]===value).map(snap)};
  }}),
  doc:(id=randomUUID())=>{
   const key=name+'/'+id;
   async function write(data,create,precondition){
    if(failure.beforeUpdate && !create){failure.beforeUpdate(records,key);revisions.set(key,(revisions.get(key)||1)+1);}
    if(precondition && precondition.lastUpdateTime!==(revisions.get(key)||1))throw Object.assign(Error('The product changed while saving. Reload before trying again.'),{code:9});
    if(failure.write)throw Error('Synthetic database failure');
    if(create&&records.has(key))throw Error('Already exists');
    if(Object.values(data).some(v=>v===undefined))throw Error('Undefined Firestore field');
    const next={...(create?{}:records.get(key))};
    for(const[field,value]of Object.entries(data))value?.constructor?.name==='DeleteTransform'?delete next[field]:next[field]=value;
    records.set(key,next);revisions.set(key,(revisions.get(key)||1)+1);writes.push(key);
    if(failure.afterWrite)throw Error('Synthetic lost acknowledgement');
   }
   return{id,get:async()=>snap(key),create:data=>write(data,true),update:(data,precondition)=>write(data,false,precondition)};
  }
 })};
 const storage={getStorage:()=>({bucket:name=>({file:path=>({name:path,bucket:{name},save:async(bytes,options)=>{
  storageCalls.push({operation:'save',bucket:name});
  if(failure.upload)throw typeof failure.upload==='object'?failure.upload:Error('Synthetic storage failure');
  objects.set(path,{bytes:Buffer.from(bytes),options});
 }})})}),getDownloadURL:async()=>{storageCalls.push({operation:'metadata'});throw Object.assign(Error('Synthetic Firebase metadata permission denied after GCS save'),{code:403});}};
 const mocks={'server-only':{},'next/cache':{revalidatePath:()=>{},revalidateTag:()=>{}},'next/navigation':{},
  '@/lib/firebase-admin':{getAdminDb:()=>db,getAdminApp:()=>({options:{projectId:'orderfly-test'}})},'firebase-admin/storage':storage,
  '@/lib/permissions':{hasPermission:()=>!failure.permission},sharp:{default:sharp}};
 const actions=loadTs('src/app/superadmin/products/actions.ts',mocks);
 const upload=loadTs('src/lib/superadmin/product-image-storage.ts',mocks).uploadProductImage;
 function props(id){
  const list=name=>[...records.entries()].filter(([k])=>k.startsWith(name+'/')).map(([k,v])=>({...v,id:k.split('/')[1]}));
  return{product:id?{...records.get('products/'+id),id}:undefined,brands:list('brands'),locations:list('locations'),categories:list('categories'),toppingGroups:list('topping_groups'),allergens:list('allergens')};
 }
 return{records,objects,writes,storageCalls,failure,actions,upload,props};
}
function form(overrides={}){
 const values={brandId:'b',categoryId:'water',productName:'Kildevand 0,5 l',price:'20',priceDelivery:'20',locationIds:['l'],isActive:'true',creationKey:randomUUID(),...overrides};
 const data=new FormData();
 for(const[k,v]of Object.entries(values))for(const item of Array.isArray(v)?v:[v])if(item!==undefined)data.append(k,item);
 return data;
}
async function image(format='jpeg'){
 return sharp({create:{width:24,height:24,channels:3,background:'#458eff'}}).toFormat(format).toBuffer();
}
module.exports={fixture,form,image};

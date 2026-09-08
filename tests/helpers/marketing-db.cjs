// In-memory Firestore contract for atomic consent/outbox and competing workers.
exports.memoryDb=(rows=new Map())=>{
 let tail=Promise.resolve();
 const ref=path=>({path,id:path.split('/').at(-1),get:async()=>snap(path),update:async data=>rows.set(path,{...rows.get(path),...data})});
 const snap=path=>({exists:rows.has(path),id:path.split('/').at(-1),ref:ref(path),data:()=>rows.has(path)?structuredClone(rows.get(path)):undefined});
 const query=(name,filters=[],order=null,count=Infinity)=>({
  doc:id=>ref(name+'/'+id),where:(field,op,value)=>query(name,[...filters,{field,op,value}],order,count),
  orderBy:(field,dir)=>query(name,filters,{field,dir},count),limit:n=>query(name,filters,order,n),
  get:async()=>{let values=[...rows].filter(([key,value])=>key.startsWith(name+'/')&&filters.every(f=>f.op==='=='?value[f.field]===f.value:value[f.field]<=f.value));
   if(order)values.sort((a,b)=>(a[1][order.field]-b[1][order.field])*(order.dir==='desc'?-1:1));return {docs:values.slice(0,count).map(([key])=>snap(key))};},
 });
 return {rows,collection:name=>query(name),runTransaction:async fn=>{
  let unlock;const previous=tail;tail=new Promise(resolve=>unlock=resolve);await previous;
  const changes=[];try{const result=await fn({get:r=>r.get(),create:(r,data)=>{if(rows.has(r.path))throw Error('Exists');changes.push(()=>rows.set(r.path,structuredClone(data)));},
    set:(r,data,opts)=>changes.push(()=>rows.set(r.path,opts?.merge?{...rows.get(r.path),...structuredClone(data)}:structuredClone(data))),
    update:(r,data)=>changes.push(()=>rows.set(r.path,{...rows.get(r.path),...structuredClone(data)})),
   });changes.forEach(apply=>apply());return result;}finally{unlock();}
 }};
};

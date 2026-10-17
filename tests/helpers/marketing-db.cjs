// In-memory Firestore contract for atomic consent/outbox and competing workers.
exports.memoryDb=(rows=new Map())=>{
 let tail=Promise.resolve();
 const ref=path=>({path,id:path.split('/').at(-1),get:async()=>snap(path),set:async data=>rows.set(path,structuredClone(data)),update:async data=>rows.set(path,{...rows.get(path),...data})});
 const snap=path=>({exists:rows.has(path),id:path.split('/').at(-1),ref:ref(path),get:field=>rows.has(path)?structuredClone(rows.get(path)?.[field]):undefined,data:()=>rows.has(path)?structuredClone(rows.get(path)):undefined});
 const query=(name,filters=[],order=null,count=Infinity)=>({
  doc:id=>ref(name+'/'+(id??require('node:crypto').randomBytes(10).toString('hex'))),where:(field,op,value)=>query(name,[...filters,{field,op,value}],order,count),
  orderBy:(field,dir)=>query(name,filters,{field,dir},count),limit:n=>query(name,filters,order,n),
  count:()=>({get:async()=>{const n=(await query(name,filters,order,count).get()).docs.length;return {data:()=>({count:n})};}}),
  get:async()=>{let values=[...rows].filter(([key,value])=>key.startsWith(name+'/')&&filters.every(f=>{
   const actual=value[f.field];
   if(f.op==='==')return actual===f.value;
   if(f.op==='in')return f.value.includes(actual);
   if(f.op==='array-contains')return Array.isArray(actual)&&actual.includes(f.value);
   if(f.op==='array-contains-any')return Array.isArray(actual)&&actual.some(v=>f.value.includes(v));
   if(f.op==='>=')return actual>=f.value;
   if(f.op==='>')return actual>f.value;
   if(f.op==='<')return actual<f.value;
   return actual<=f.value;
  }));
   if(order)values.sort((a,b)=>(a[1][order.field]-b[1][order.field])*(order.dir==='desc'?-1:1));return {docs:values.slice(0,count).map(([key])=>snap(key))};},
 });
 return {rows,collection:name=>query(name),getAll:async(...refs)=>refs.map(r=>snap(r.path)),runTransaction:async fn=>{
  let unlock;const previous=tail;tail=new Promise(resolve=>unlock=resolve);await previous;
  const changes=[];try{const result=await fn({get:r=>r.get(),create:(r,data)=>{if(rows.has(r.path))throw Error('Exists');changes.push(()=>rows.set(r.path,structuredClone(data)));},
    set:(r,data,opts)=>changes.push(()=>rows.set(r.path,opts?.merge?{...rows.get(r.path),...structuredClone(data)}:structuredClone(data))),
    update:(r,data)=>changes.push(()=>rows.set(r.path,{...rows.get(r.path),...structuredClone(data)})),
    delete:r=>changes.push(()=>rows.delete(r.path)),
   });changes.forEach(apply=>apply());return result;}finally{unlock();}
 }};
};

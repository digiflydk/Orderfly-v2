const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { createRequire } = require('node:module');
const {AsyncLocalStorage}=require('node:async_hooks');
const { createHash, randomBytes } = require('node:crypto');

function copy(value) {
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
}

/** Strict local persistence fake, not an authorization mock. Production auth modules
 * execute normally. Transactions stage writes atomically and can discard/retry once
 * after a concurrent native credential change. Query predicates are executed. */
function createTerminalAuthFixture(initial = []) {
  const rows = new Map(initial.map(([key, value]) => [key, copy(value)]));
  const commits = [], reads = [], cookies = new Map(), cookieWrites = [];
  const options = { beforeCommit: null, retry: null, failCommit: false, afterRead: null };
  let clock = Date.parse('2026-10-25T21:00:00Z'), serial = Promise.resolve();
  const transactionContext=new AsyncLocalStorage();
  const snapshot = (reference, data) => { const captured=copy(data); return { id: reference.id, ref: reference, exists: data !== undefined,
    data: () => copy(captured), updateTime: { toMillis: () => 1 } }; };
  const getField = (value, field, identifier) => field === '__name__' ? identifier : String(field).split('.').reduce((v, key) => v?.[key], value);
  function result(query, source) {
    reads.push({ collection: query.path, filters: copy(query.filters), limit: query.maximum });
    let values = [...source].filter(([path]) => path.startsWith(query.path + '/') && !path.slice(query.path.length + 1).includes('/'));
    for (const [field, op, expected] of query.filters) values = values.filter(([path, value]) => {
      const actual = getField(value, field, path.split('/').at(-1));
      switch(op) { case '==': return actual === expected; case 'in': return expected.includes(actual);
        case '>': return actual > expected; case '>=': return actual >= expected; case '<': return actual < expected; case '<=': return actual <= expected;
        default: throw Error('Unsupported fixture query operator: ' + op); }
    });
    values.sort(([a,av],[b,bv]) => {
      const aa=getField(av,query.sortField,a.split('/').at(-1)),bb=getField(bv,query.sortField,b.split('/').at(-1));
      return (aa<bb?-1:aa>bb?1:0)*(query.sortDirection==='desc'?-1:1);
    });
    if(query.after!==undefined)values=values.filter(([path,value])=>getField(value,query.sortField,path.split('/').at(-1))>query.after);
    values=values.slice(0,query.maximum);
    const docs=values.map(([path,value])=>snapshot(ref(path),value));return {docs,size:docs.length,empty:!docs.length};
  }
  function collection(path, state = {}) {
    const query={path,filters:[],sortField:'__name__',sortDirection:'asc',maximum:Infinity,...state};
    return { ...query, isQuery:true, doc:(id=randomBytes(12).toString('hex'))=>ref(path+'/'+id),
      where:(...filter)=>collection(path,{...query,filters:[...query.filters,filter]}),
      orderBy:(field,direction='asc')=>collection(path,{...query,sortField:typeof field==='string'?field:'__name__',sortDirection:direction}),
      limit:maximum=>collection(path,{...query,maximum}), startAfter:after=>collection(path,{...query,after}),
      get:async()=>result(query,rows) };
  }
  function ref(path) { return {path,id:path.split('/').at(-1),collection:name=>collection(path+'/'+name),
    get:async()=>{reads.push(path);const result=snapshot(ref(path),rows.get(path));if(options.afterRead)await options.afterRead(path,rows);return result;},
    set:async(value,opt)=>{rows.set(path,opt?.merge?{...rows.get(path),...copy(value)}:copy(value));},
    update:async value=>{assert.ok(rows.has(path));rows.set(path,{...rows.get(path),...copy(value)});},
    delete:async()=>{rows.delete(path);} }; }
  const fieldValue = {serverTimestamp:()=>new Date(clock),increment:value=>({__increment:value}),delete:()=>({__delete:true})};
  function writeValue(previous, value) {
    const output=copy(value);
    for(const [key,item] of Object.entries(output)){
      if(item?.__increment!==undefined)output[key]=(previous?.[key]||0)+item.__increment;
      if(item?.__delete)delete output[key];
    }return output;
  }
  const db={collection,doc:ref,runTransaction:async(run,config)=>{
    const operation=async()=>{
      async function attempt(commit){
        const staged=new Map([...rows].map(([p,v])=>[p,copy(v)])),writes=[];let writing=false;
        const tx={get:async r=>{assert.equal(writing,false,'native transaction reads precede writes');
          if(r.isQuery)return result(r,staged);reads.push(r.path);return snapshot(r,staged.get(r.path));},
          getAll:async(...refs)=>Promise.all(refs.map(r=>tx.get(r))),
          create:(r,v)=>{assert.notEqual(config?.readOnly,true,'read-only transaction cannot write');assert.equal(staged.has(r.path),false,'create rejects existing document');writing=true;staged.set(r.path,writeValue(undefined,v));writes.push(['create',r.path,copy(v)]);},
          set:(r,v,opt)=>{assert.notEqual(config?.readOnly,true,'read-only transaction cannot write');writing=true;staged.set(r.path,writeValue(staged.get(r.path),opt?.merge?{...staged.get(r.path),...v}:v));writes.push(['set',r.path,copy(v)]);},
          update:(r,v)=>{assert.notEqual(config?.readOnly,true,'read-only transaction cannot write');assert.ok(staged.has(r.path),'update requires existing document');writing=true;staged.set(r.path,writeValue(staged.get(r.path),{...staged.get(r.path),...v}));writes.push(['update',r.path,copy(v)]);},
          delete:r=>{assert.notEqual(config?.readOnly,true,'read-only transaction cannot write');writing=true;staged.delete(r.path);writes.push(['delete',r.path]);}};
        const result=await run(tx);
        if(commit){if(options.failCommit)throw Error('synthetic atomic commit failure');if(options.beforeCommit)await options.beforeCommit({rows,staged,writes});rows.clear();for(const row of staged)rows.set(...row);commits.push(writes);}
        return result;
      }
      if(options.retry&&!config?.readOnly){await attempt(false);const retry=options.retry;options.retry=null;await retry(rows);}
      return attempt(true);
    };
    const nested=transactionContext.getStore();assert.ok(!nested||config?.readOnly,'nested writes are outside fixture contract');
    const job=nested?operation():serial.then(()=>transactionContext.run(true,operation));
    if(!nested)serial=job.catch(()=>{});return job;
  }};
  const cookieJar={get:name=>cookies.has(name)?{value:cookies.get(name)}:undefined,
    set:(name,value,settings)=>{if(typeof name==='object'){settings=name;value=name.value;name=name.name;}cookies.set(name,value);cookieWrites.push({name,value,settings});},
    delete:name=>{cookies.delete(name);cookieWrites.push({name,deleted:true});}};
  const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db,getAdminFieldValue:()=>fieldValue,getAdminApp:()=>({auth:()=>({verifySessionCookie:async value=>{if(value!==cookies.get('__session')||!value)throw Error('invalid synthetic admin cookie');return {uid:'terminal-config-admin'};}})})},
    'next/headers':{cookies:async()=>cookieJar,headers:async()=>new Headers()},
    '@/lib/url':{getOrigin:async()=> 'https://orderfly.dk'},
    'firebase-admin/firestore':{FieldPath:{documentId:()=> '__name__'},FieldValue:fieldValue}};
  // Production module identity matters: opaque WeakSet session capabilities must
  // share one loaded core, exactly as Node/Next's module cache does.
  const modules=new Map(), external=createRequire(path.join(process.cwd(),'package.json'));
  function load(file,extra={}) {
    const filename=path.resolve(file),key=filename;
    if(modules.has(key))return modules.get(key).exports;
    const mod={exports:{}};modules.set(key,mod);
    const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const replacements={...mocks,...extra};
    new Function('require','module','exports',source)(name=>{
      if(name in replacements)return replacements[name];
      if(name==='react')return external('next/dist/compiled/react');
      const local=name.startsWith('@/')?path.resolve('src',name.slice(2)):name.startsWith('.')?path.resolve(path.dirname(filename),name):null;
      return local?load(local+'.ts',extra):external(name);
    },mod,mod.exports);return mod.exports;
  }
  return {rows,commits,reads,cookies,cookieWrites,options,db,mocks,cookieJar,load,
    get now(){return clock;},set now(value){clock=value;},hash:value=>createHash('sha256').update(value).digest('hex'),
    async withClock(run){const original=Date.now,keys=['MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID','MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID'],saved=keys.map(key=>process.env[key]);keys.forEach(key=>process.env[key]='c651d0aa-c9ad-42dd-a2cc-fec269a64e89');Date.now=()=>clock;try{return await run();}finally{Date.now=original;keys.forEach((key,i)=>saved[i]===undefined?delete process.env[key]:process.env[key]=saved[i]);}}};
}
function seedTerminalAdmin(f) {
  const identity={provider:'firebase',subject:'terminal-config-admin'};
  const {principalKey}=loadTs('src/lib/access/authority.ts',{'server-only':{}});
  const actor=principalKey(identity);
  f.rows.set('platformAdminControl/access-v1',{
    principals:[{id:actor,active:true}],
    companies:[{id:'company',active:true,locationIds:['location','other'],orderflyBrandIds:['brand']}],
    roles:[{id:'role',name:'Fixture admin',companyId:'company',kind:'company_user',permissions:['orderfly.catalog:view','orderfly.catalog:edit','orderfly.orders:view','orderfly.orders:edit'],active:true}],
    memberships:[{id:'member',principalId:actor,companyId:'company',locationIds:['location'],roleIds:['role'],active:true}],
  });
  f.rows.set('brands/brand',{status:'active',name:'Fixture brand'});
  f.rows.set('locations/location',{brandId:'brand',name:'Fixture location',isActive:true});
  f.rows.set('locations/other',{brandId:'brand',name:'Other location',isActive:true});
  f.cookies.set('__session',randomBytes(32).toString('hex'));
  return identity;
}
module.exports={createTerminalAuthFixture,seedTerminalAdmin};

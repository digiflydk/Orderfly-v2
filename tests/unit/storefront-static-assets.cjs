const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const net=require('node:net');

test('standalone runtime serves the original Esmeralda logo through its brand host',async()=>{
 const probe=net.createServer();
 await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
 const port=probe.address().port;
 await new Promise(resolve=>probe.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:path.resolve('.next/standalone'),env:{...process.env,HOSTNAME:'127.0.0.1',PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const get=()=>new Promise((resolve,reject)=>{
  const request=http.get({hostname:'127.0.0.1',port,path:'/images/esmeralda-v2/logo.png',headers:{host:'esmeralda.orderfly.dk','x-forwarded-host':'esmeralda.orderfly.dk','x-forwarded-proto':'https'}},response=>{
   const chunks=[];response.on('data',b=>chunks.push(b));response.on('end',()=>resolve({status:response.statusCode,type:response.headers['content-type'],body:Buffer.concat(chunks)}));
  });
  request.setTimeout(10000,()=>request.destroy(new Error('Static logo request timed out')));
  request.on('error',reject);
 });
 try{
  let response;
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error(output);
   try{response=await get();break;}catch(error){if(i===99)throw error;await new Promise(resolve=>setTimeout(resolve,100));}
  }
  assert.equal(response.status,200,output);
  assert.match(response.type,/^image\/png/);
  assert.deepEqual(response.body,fs.readFileSync('public/images/esmeralda-v2/logo.png'));
 }finally{
  child.kill('SIGTERM');
  if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));
 }
});

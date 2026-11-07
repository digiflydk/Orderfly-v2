const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {subscribeTerminalEvents}=loadTs('src/app/merchant/orders/terminal-events-client.ts');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('SSE handles split frames, renews a closed channel and aborts on cleanup',async t=>{
 const original=global.fetch;let controller,requests=0,aborted=0;const seen=[];
 global.fetch=async(_url,{signal})=>{requests++;return new Response(new ReadableStream({start(c){controller=c;signal.addEventListener('abort',()=>{aborted++;c.close();});}}),{headers:{'content-type':'text/event-stream'}});};
 t.after(()=>{global.fetch=original;});
 const stop=subscribeTerminalEvents('/fixture',{signal:()=>seen.push('signal'),change:()=>seen.push('change'),disconnected:()=>seen.push('disconnected'),denied:status=>seen.push(status)});t.after(stop);
 const write=value=>controller.enqueue(new TextEncoder().encode(value));
 write('event: rea');await flush();assert.deepEqual(seen,[]);write('dy\ndata: {}\n\nevent: heartbeat\ndata: {}\n\n');await flush();assert.deepEqual(seen,['signal','change','signal']);
 write('event: change\ndata: {}\n\n');await flush();assert.deepEqual(seen.slice(-2),['signal','change']);
 write('event: reconnect\ndata: {}\n\n');await new Promise(r=>setTimeout(r,20));assert.equal(requests,2);assert.ok(!seen.includes('disconnected'));stop();assert.equal(aborted,2);
});
test('HTTP denial is reported and a stalled stream times out, without immediate retry loops',async t=>{
 const original=global.fetch;let requests=0;const seen=[];t.after(()=>{global.fetch=original;});
 t.mock.timers.enable({apis:['setTimeout']});
 global.fetch=async()=>{requests++;return new Response('{}',{status:401});};
 const handlers={signal(){},change(){},disconnected:()=>seen.push('disconnected'),denied:status=>seen.push(status)};
 const stop=subscribeTerminalEvents('/fixture',handlers);await flush();assert.deepEqual(seen,[401,'disconnected']);assert.equal(requests,1);
 t.mock.timers.tick(999);await flush();assert.equal(requests,1);t.mock.timers.tick(1);await flush();assert.equal(requests,2);stop();
 let aborted=false;
 global.fetch=async(_url,{signal})=>new Response(new ReadableStream({start(c){signal.addEventListener('abort',()=>{aborted=true;c.error(new DOMException('aborted','AbortError'));});}}),{headers:{'content-type':'text/event-stream'}});
 const close=subscribeTerminalEvents('/fixture',handlers);t.after(close);await flush();t.mock.timers.tick(45_000);await flush();assert.equal(aborted,true);close();
});

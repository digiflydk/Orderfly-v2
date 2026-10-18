const {test}=require('node:test'),assert=require('node:assert/strict');
const {waitForRelease}=require('../../.github/scripts/wait-for-release.cjs');

const MERGE='a'.repeat(40),LATER='b'.repeat(40),OLD='c'.repeat(40);
function harness({checks,releases,compare={}}){
  let tick=0,clock=0;const calls={compare:[]};
  const github={
    rest:{checks:{listForRef:'listForRef'},repos:{compareCommitsWithBasehead:async({basehead})=>{calls.compare.push(basehead);const status=compare[basehead];if(!status)throw Error('not found');return{data:{status}};}}},
    paginate:async()=>checks[Math.min(tick,checks.length-1)],
  };
  const fetchImpl=async()=>{const release=releases[Math.min(tick,releases.length-1)];return{ok:true,json:async()=>({ok:true,release})};};
  const run=(extra={})=>waitForRelease({github,owner:'o',repo:'r',mergeSha:MERGE,liveUrl:'https://example.test',self:'live-verify',log:()=>{},fetchImpl,
    sleep:async()=>{tick++;clock+=30_000;},now:()=>clock,timeoutMs:10*30_000,intervalMs:30_000,...extra});
  return{run,calls};
}
const ok=name=>({name,status:'completed',conclusion:'success'});

test('waits for CI on the merge commit and for the live build to run it',async()=>{
  const h=harness({checks:[[{name:'Typecheck and build',status:'in_progress'}],[ok('Typecheck and build'),ok('rules')]],releases:[OLD,OLD,MERGE]});
  assert.deepEqual(await h.run(),{release:MERGE});
});
test('a later main that contains the merge counts as deployed',async()=>{
  const h=harness({checks:[[ok('Typecheck and build')]],releases:[LATER],compare:{[`${MERGE}...${LATER}`]:'ahead'}});
  assert.deepEqual(await h.run(),{release:LATER});
});
test('an older or unrelated live build never counts as the merge',async()=>{
  const h=harness({checks:[[ok('Typecheck and build')]],releases:[OLD],compare:{[`${MERGE}...${OLD}`]:'behind'}});
  await assert.rejects(h.run(),/Timed out: CI passed \(Typecheck and build\), live release c+/);
});
test('failed CI on the merge commit stops verification at once',async()=>{
  const h=harness({checks:[[{name:'Typecheck and build',status:'completed',conclusion:'failure'}]],releases:[MERGE]});
  await assert.rejects(h.run(),/CI failed on merge commit a+: Typecheck and build: failure/);
});
test('the workflow\'s own check run is ignored, and no checks at all keeps waiting',async()=>{
  const h=harness({checks:[[{name:'live-verify',status:'in_progress'}]],releases:[MERGE]});
  await assert.rejects(h.run(),/Timed out: CI pending/);
});
test('a check that registers after CI first looked green still fails the gate',async()=>{
  const h=harness({checks:[[ok('rules')],[ok('rules'),{name:'Typecheck and build',status:'completed',conclusion:'failure'}]],releases:[OLD,MERGE]});
  await assert.rejects(h.run(),/CI failed on merge commit a+: Typecheck and build: failure/);
});
test('required checks must be reported before the gate passes',async()=>{
  const h=harness({checks:[[ok('rules')],[ok('rules')],[ok('rules'),ok('Typecheck and build')]],releases:[MERGE]});
  assert.deepEqual(await h.run({required:['Typecheck and build','rules']}),{release:MERGE});
  const missing=harness({checks:[[ok('rules')]],releases:[MERGE]});
  await assert.rejects(missing.run({required:['Typecheck and build']}),/not reported yet: Typecheck and build/);
});
test('a missing merge SHA is rejected',async()=>{
  const h=harness({checks:[[ok('x')]],releases:[MERGE]});
  await assert.rejects(h.run({mergeSha:''}),/no merge commit SHA/);
});

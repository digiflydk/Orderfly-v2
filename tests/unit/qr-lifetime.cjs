const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { emptyQrLifetime, readQrLifetime, incrementQrLifetime, QrLifetimeError } = loadTs('src/lib/qr/lifetime.ts');
const { classifyQrRequest } = loadTs('src/lib/qr/metrics.ts');
const at = Date.parse('2026-10-21T12:00:00Z');
const human = classifyQrRequest({method:'GET',userAgent:'Mozilla/5.0 (iPhone) Mobile Safari/604.1'});
const valid = () => ({openings:3,probableScans:2,excludedOpenings:1,firstOpenedAt:at-100,lastOpenedAt:at});
const error = code => err => err instanceof QrLifetimeError && err.code===code;

test('missing lifetime initializes to distinct zero projections without inventing timestamps',()=>{
  const zero={openings:0,probableScans:0,excludedOpenings:0,firstOpenedAt:null,lastOpenedAt:null};
  assert.deepEqual(emptyQrLifetime(),zero);assert.deepEqual(readQrLifetime(undefined),zero);assert.deepEqual(readQrLifetime(null),zero);assert.notEqual(emptyQrLifetime(),emptyQrLifetime());
});
test('first and subsequent probable GETs increase consistent totals',()=>{
  const first=incrementQrLifetime(undefined,human,at);assert.deepEqual(first,{openings:1,probableScans:1,excludedOpenings:0,firstOpenedAt:at,lastOpenedAt:at});
  assert.deepEqual(incrementQrLifetime(first,human,at+10),{openings:2,probableScans:2,excludedOpenings:0,firstOpenedAt:at,lastOpenedAt:at+10});
});
test('bot, prefetch and unknown-agent GETs increment only openings and exclusions',()=>{
  let previous=undefined;
  for(const request of [{method:'GET',userAgent:'Googlebot'},{method:'GET',userAgent:'Mozilla/5.0',purpose:'prefetch'},{method:'GET'}])previous=incrementQrLifetime(previous,classifyQrRequest(request),at);
  assert.deepEqual(previous,{openings:3,probableScans:0,excludedOpenings:3,firstOpenedAt:at,lastOpenedAt:at});
});
test('HEAD and unsupported methods leave values unchanged without mutating the input',()=>{
  const previous=Object.freeze(valid());
  for(const method of ['HEAD','POST','OPTIONS']){const next=incrementQrLifetime(previous,classifyQrRequest({method}),at+100);assert.deepEqual(next,previous);assert.notEqual(next,previous);}
  assert.deepEqual(incrementQrLifetime(undefined,classifyQrRequest({method:'HEAD'}),at),emptyQrLifetime());
});
test('present invalid counts fail closed instead of resetting historical totals',()=>{
  for(const previous of [{},[],true,0,'bad',{...valid(),openings:-1},{...valid(),openings:3.5},{...valid(),probableScans:NaN},{...valid(),excludedOpenings:Infinity},{...valid(),openings:4},{...valid(),openings:Number.MAX_SAFE_INTEGER+1}])
    assert.throws(()=>readQrLifetime(previous),error('invalid_lifetime'));
});
test('stored timestamps must match zero/nonzero count state and retain valid order',()=>{
  for(const previous of [{...emptyQrLifetime(),firstOpenedAt:at},{...emptyQrLifetime(),lastOpenedAt:at},{...valid(),firstOpenedAt:null},{...valid(),lastOpenedAt:NaN},{...valid(),firstOpenedAt:at+1},{...valid(),lastOpenedAt:'2026-10-21'},{...valid(),firstOpenedAt:-1}])
    assert.throws(()=>readQrLifetime(previous),error('invalid_lifetime'));
});
test('the exact projection never copies visitor or unrelated configuration fields',()=>{
  const previous={...valid(),email:'private@example.com',ip:'192.0.2.1',visitorKey:'secret',revision:99};const projected=readQrLifetime(previous);
  assert.deepEqual(Object.keys(projected).sort(),['excludedOpenings','firstOpenedAt','lastOpenedAt','openings','probableScans'].sort());assert.deepEqual(projected,valid());
  assert.equal(JSON.stringify(incrementQrLifetime(previous,human,at+1)).includes('private'),false);assert.equal(previous.openings,3);
});
test('out-of-order requests preserve min/max time without dropping valid increments',()=>{
  let value=incrementQrLifetime(undefined,human,at);value=incrementQrLifetime(value,human,at+10);value=incrementQrLifetime(value,human,at-10);
  assert.equal(value.openings,3);assert.equal(value.firstOpenedAt,at-10);assert.equal(value.lastOpenedAt,at+10);assert.equal(value.probableScans+value.excludedOpenings,value.openings);
});
test('unsafe or invalid supplied clock values are rejected even for a non-opening request',()=>{
  for(const time of [NaN,Infinity,-1,1.5,Number.MAX_SAFE_INTEGER,undefined,'123'])for(const classification of [human,classifyQrRequest({method:'HEAD'})])
    assert.throws(()=>incrementQrLifetime(valid(),classification,time),error('invalid_time'));
  assert.equal(incrementQrLifetime(undefined,human,0).firstOpenedAt,0);
});
test('inconsistent classifications and counter overflow fail rather than skew totals',()=>{
  for(const classification of [null,{}, {...human,opening:false},{...human,probableScan:false},{...human,exclusion:'bot'},{...human,opening:'true'},{...human,exclusion:'unknown'}])
    assert.throws(()=>incrementQrLifetime(valid(),classification,at),error('invalid_classification'));
  const maximum={openings:Number.MAX_SAFE_INTEGER,probableScans:Number.MAX_SAFE_INTEGER,excludedOpenings:0,firstOpenedAt:at,lastOpenedAt:at};
  assert.throws(()=>incrementQrLifetime(maximum,human,at),error('counter_overflow'));assert.deepEqual(incrementQrLifetime(maximum,classifyQrRequest({method:'HEAD'}),at),maximum);
});

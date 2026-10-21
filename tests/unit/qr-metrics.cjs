const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { classifyQrRequest, qrReferrerOrigin, qrLocalBuckets, aggregateQrMetrics, serializeQrCsv } = loadTs('src/lib/qr/metrics.ts');
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36';
const classification = (extra = {}) => classifyQrRequest({ method: 'GET', userAgent: IOS, ...extra });
const event = (iso, visitorKey, extra = {}) => ({ timestamp: Date.parse(iso), qrId: 'poster', classification: classification(), visitorKey, ...extra });
const range = { from: Date.parse('2026-01-01T00:00:00Z'), to: Date.parse('2027-01-01T00:00:00Z') };

test('real mobile/desktop families are classified without retaining raw UA', () => {
  const iphone = classification({ referrer: 'https://example.com/private?email=secret#token' });
  assert.equal(iphone.probableScan, true); assert.equal(iphone.device, 'mobile'); assert.equal(iphone.os, 'iOS'); assert.equal(iphone.browser, 'Safari');
  assert.equal(iphone.referrerOrigin, 'https://example.com'); assert.equal(JSON.stringify(iphone).includes('secret'), false); assert.equal(JSON.stringify(iphone).includes('Mozilla'), false);
  assert.equal(classification({userAgent: ANDROID}).os, 'Android');
  assert.equal(classification({userAgent: ANDROID}).browser, 'Chrome');
  assert.equal(classification({userAgent: ANDROID.replace(' Mobile', '')}).device, 'tablet');
  assert.equal(classification({userAgent: IOS.replace('iPhone', 'iPad')}).device, 'tablet');
  assert.equal(classification({userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/129 Safari/537 Edg/129'}).browser, 'Edge');
  assert.equal(classification({userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130'}).device, 'desktop');
  assert.equal(classification({userAgent: IOS.replace('Version/18.0', 'CriOS/129')}).browser, 'Chrome');
});

test('HEAD, unsupported methods, previews, robots and missing agents are excluded', () => {
  for (const [extra, exclusion, opening] of [
    [{method:'HEAD'}, 'head', false], [{method:'POST'}, 'method', false],
    [{purpose:'prefetch'}, 'prefetch', true], [{secPurpose:'prefetch;prerender'}, 'prefetch', true],
    [{userAgent:'facebookexternalhit/1.1'}, 'bot', true], [{userAgent:'Googlebot'}, 'bot', true],
    [{userAgent:'curl/8.0'}, 'bot', true], [{userAgent:'WhatsApp/2.0'}, 'bot', true],
    [{userAgent:'Mozilla/5.0 HeadlessChrome/128'}, 'bot', true], [{userAgent:''}, 'unknown-agent', true],
  ]) {
    const result=classification(extra); assert.equal(result.exclusion, exclusion); assert.equal(result.opening, opening); assert.equal(result.probableScan, false);
  }
  assert.equal(classification({method:'get'}).opening, true);
  assert.equal(classification({userAgent:'unrecognized-device'}).device, 'unknown');
  assert.equal(classification({userAgent:'x'.repeat(2048)+'Googlebot'}).device, 'unknown');
});

test('referrers are origin-only and malformed, credentials, opaque and oversized values vanish', () => {
  assert.equal(qrReferrerOrigin('https://example.com:8443/path?q=x'), 'https://example.com:8443');
  for (const value of [null, '', '/relative', 'not a URL', 'javascript:alert(1)', 'data:text/plain,x', 'https://user:pw@example.com/p', 'x'.repeat(4097)]) assert.equal(qrReferrerOrigin(value), null);
});

test('Danish day/month boundaries and spring/autumn DST hours are correct', () => {
  assert.deepEqual(qrLocalBuckets(Date.parse('2026-01-31T23:30:00Z')), {day:'2026-02-01',hour:'2026-02-01T00:00+01:00'});
  assert.equal(qrLocalBuckets(Date.parse('2026-03-29T00:30:00Z')).hour,'2026-03-29T01:00+01:00');
  assert.equal(qrLocalBuckets(Date.parse('2026-03-29T01:30:00Z')).hour,'2026-03-29T03:00+02:00');
  assert.equal(qrLocalBuckets(Date.parse('2026-10-25T00:30:00Z')).hour,'2026-10-25T02:00+02:00');
  assert.equal(qrLocalBuckets(Date.parse('2026-10-25T01:30:00Z')).hour,'2026-10-25T02:00+01:00');
  assert.throws(()=>qrLocalBuckets(NaN), RangeError);
});

test('whole-window uniqueness is a set union and opening totals include excluded robots', () => {
  const events=[event('2026-10-20T12:00:00Z','a'),event('2026-10-21T12:00:00Z','a'),event('2026-10-21T13:00:00Z','b'),
    event('2026-10-21T14:00:00Z',null,{classification:classification({userAgent:'Googlebot'})}),
    event('2026-10-21T14:01:00Z',null,{classification:classification({method:'HEAD'})})];
  const result=aggregateQrMetrics(events,range);
  assert.equal(result.totalOpenings,4); assert.equal(result.probableScans,3); assert.equal(result.excludedOpenings,1);
  assert.equal(result.estimatedUnique,2); assert.equal(result.knownUnique,2); assert.equal(result.unidentifiedScans,0);
  assert.equal(result.byDay.reduce((n,x)=>n+x.knownUnique,0),3);
  assert.equal(result.byDay.reduce((n,x)=>n+x.totalOpenings,0),result.totalOpenings);
  assert.equal(result.byDevice.reduce((n,x)=>n+x.count,0),result.probableScans);
});

test('unknown identifiers never produce a fabricated unique visitor count', () => {
  const result=aggregateQrMetrics([event('2026-10-20T12:00:00Z','a'),event('2026-10-20T12:01:00Z',null)],range);
  assert.equal(result.estimatedUnique,null); assert.equal(result.knownUnique,1); assert.equal(result.unidentifiedScans,1);
  assert.equal(aggregateQrMetrics([],range).estimatedUnique,0);
});

test('interval endpoints and QR filters apply consistently to totals and breakdowns', () => {
  const from=Date.parse('2026-10-21T10:00:00Z'),to=from+3600000;
  const events=[event('2026-10-21T09:59:59Z','a'),event('2026-10-21T10:00:00Z','b'),event('2026-10-21T11:00:00Z','c'),
    event('2026-10-21T10:30:00Z','d',{qrId:'other'})];
  const result=aggregateQrMetrics(events,{from,to,qrId:'poster'});
  assert.equal(result.totalOpenings,1);assert.equal(result.estimatedUnique,1);assert.equal(result.byQr.length,1); assert.equal(result.byQr[0].key,'poster');
  assert.equal(result.byReferrer[0].key,'unknown');
});

test('fall-back hours remain distinct and chronologically ordered even for shuffled events', () => {
  const result=aggregateQrMetrics([event('2026-10-25T01:30:00Z','a'),event('2026-10-25T00:30:00Z','a')],range);
  assert.deepEqual(result.byHour.map(x=>x.key),['2026-10-25T02:00+02:00','2026-10-25T02:00+01:00']);
  assert.equal(result.estimatedUnique,1);
});

test('untrusted classifications cannot retain referrer paths in a report', () => {
  const e=event('2026-10-21T10:00:00Z','a');e.classification.referrerOrigin='https://example.com/private?email=x';
  assert.deepEqual(aggregateQrMetrics([e],range).byReferrer,[{key:'https://example.com',count:1}]);
});

test('invalid measurement inputs fail rather than silently change totals', () => {
  for (const r of [{from:0,to:0},{from:2,to:1},{from:NaN,to:1},{from:0,to:Infinity}]) assert.throws(()=>aggregateQrMetrics([],r),RangeError);
  for (const bad of [{timestamp:NaN},{qrId:''},{visitorKey:'a b'},{visitorKey:'x'.repeat(257)}, {classification:{opening:false,probableScan:true}}])
    assert.throws(()=>aggregateQrMetrics([event('2026-10-21T10:00:00Z','a',bad)],range));
});

test('CSV quoting preserves cells and formula-leading strings become text', () => {
  assert.equal(serializeQrCsv([['a,b','line\nbreak','"quote"',null,3,-2,true]]),'"a,b","line\nbreak","""quote""","","3","-2","true"\r\n');
  for (const value of ['=SUM(1,2)','+cmd','-cmd','@SUM(A1)',' \t=1','\uFEFF=1','\u200B@x','\r\n+1']) assert.equal(serializeQrCsv([[value]]).startsWith('"\''),true,value);
  assert.equal(serializeQrCsv([['ordinary pizza']]),'"ordinary pizza"\r\n');
  assert.equal(serializeQrCsv([]),''); assert.throws(()=>serializeQrCsv([[Infinity]]),TypeError);
});

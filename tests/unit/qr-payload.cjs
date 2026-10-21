const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { normalizeDestination, applyUtm, buildStaticPayload, QrPayloadError } = loadTs('src/lib/qr/payload.ts');
const rejects = (fn, code) => assert.throws(fn, e => e instanceof QrPayloadError && e.code === code);

test('HTTPS URL normalization preserves URL meaning and external query/hash', () => {
  assert.equal(normalizeDestination('https://EXAMPLE.org:443/menu?a=1#pizza'), 'https://example.org/menu?a=1#pizza');
  assert.equal(normalizeDestination('https://esmeraldapizza.dk/bordbooking'), 'https://esmeraldapizza.dk/bordbooking');
});
test('unsafe URLs, credentials, local/private literal hosts and own QR loops are rejected', () => {
  for (const url of ['http://example.org','javascript:alert(1)','https://a:b@example.org','https://example.org:8443','https://example.org/ space','https://example.org\\@other.org','https://example.org/\t']) rejects(() => normalizeDestination(url), 'invalid_url');
  for (const host of ['localhost','a.local','a.internal','127.1','2130706433','0x7f000001','10.2.3.4','172.31.0.1','192.168.1.1','169.254.169.254','100.64.0.1','198.18.0.1','224.0.0.1','[::1]','[::ffff:8.8.8.8]']) rejects(() => normalizeDestination(`https://${host}/`),'blocked_destination');
  for (const url of ['https://orderfly.dk/q/a','https://esmeralda.orderfly.dk/q/a','https://orderfly.dk/%71/a','https://orderfly.dk/%2fq/a','https://orderfly.dk/a/../q/a']) rejects(() => normalizeDestination(url), 'blocked_destination');
  rejects(() => normalizeDestination('https://qr.esmeraldapizza.dk/q/a',{blockedOrigins:['https://qr.esmeraldapizza.dk']}),'blocked_destination');
  assert.equal(normalizeDestination('https://example.org/q/a'), 'https://example.org/q/a');
});
test('UTM values replace supplied tags without losing existing query/hash or injecting keys', () => {
  const url = new URL(applyUtm('https://example.org/?product=pizza&utm_source=old&utm_term=keep#menu', {source:'flyer',campaign:'Pizza & pasta=1'}));
  assert.equal(url.searchParams.get('product'),'pizza');assert.equal(url.searchParams.get('utm_source'),'flyer');
  assert.equal(url.searchParams.get('utm_term'),'keep');assert.equal(url.searchParams.get('utm_campaign'),'Pizza & pasta=1');assert.equal(url.hash,'#menu');
  rejects(() => applyUtm('https://example.org',{source:'x'.repeat(201)}),'invalid_input');
  rejects(() => applyUtm('https://example.org',{arbitrary:'x'}),'invalid_input');
});
test('static URL, multiline text, phone and SMS payloads preserve intended content', () => {
  assert.equal(buildStaticPayload({type:'url',url:'https://example.org',utm:{source:'menu'}}),'https://example.org/?utm_source=menu');
  assert.equal(buildStaticPayload({type:'text',text:'Hej\nPizza 🍕'}),'Hej\nPizza 🍕');
  assert.equal(buildStaticPayload({type:'phone',phone:'+45 26 14 71 57'}),'tel:+4526147157');
  assert.equal(buildStaticPayload({type:'sms',phone:'+45 26147157',body:'Hej & tak\n🍕'}),'sms:+4526147157?body=Hej%20%26%20tak%0A%F0%9F%8D%95');
  rejects(() => buildStaticPayload({type:'phone',phone:'+4526?body=bad'}),'invalid_input');
});
test('WiFi fields are escaped and never inject another field', () => {
  assert.equal(buildStaticPayload({type:'wifi',ssid:'Cafe;S:other',password:'a:b\\c',security:'WPA',hidden:true}),'WIFI:T:WPA;S:Cafe\\;S\\:other;P:a\\:b\\\\c;H:true;;');
  assert.equal(buildStaticPayload({type:'wifi',ssid:'Guest',security:'nopass'}),'WIFI:T:nopass;S:Guest;P:;H:false;;');
  rejects(() => buildStaticPayload({type:'wifi',ssid:'🍕'.repeat(9),security:'nopass'}),'invalid_input');
  rejects(() => buildStaticPayload({type:'wifi',ssid:'Guest',security:'WPA'}),'invalid_input');
});
test('vCard escapes components and rejects CRLF field injection', () => {
  const card=buildStaticPayload({type:'vcard',firstName:'Anne;Manager',lastName:'Hansen',organization:'Esmeralda, Pizza',email:'info@example.org',phone:'+45 26147157',url:'https://example.org'});
  assert.match(card,/N:Hansen;Anne\\;Manager;;;/);assert.match(card,/ORG:Esmeralda\\, Pizza/);assert.match(card,/\r\nEND:VCARD$/);
  rejects(() => buildStaticPayload({type:'vcard',firstName:'Anne\nTEL:999',lastName:'Hansen'}),'invalid_input');
});
test('email parameters encode separately; header injection and unsafe addresses fail', () => {
  const payload=buildStaticPayload({type:'email',to:'info+qr@example.org',subject:'Pizza & pasta',body:'Tak\nHej'});
  assert.match(payload,/^mailto:info%2Bqr@example.org\?/);const params=new URLSearchParams(payload.split('?')[1]);
  assert.equal(params.get('subject'),'Pizza & pasta');assert.equal(params.get('body'),'Tak\nHej');
  rejects(() => buildStaticPayload({type:'email',to:'info@example.org?bcc=other@example.org'}),'invalid_input');
  rejects(() => buildStaticPayload({type:'email',to:'info@example.org',subject:'Hi\r\nBcc: other@example.org'}),'invalid_input');
});
test('UTF-8 byte capacity, controls and malformed runtime input are bounded', () => {
  rejects(() => buildStaticPayload({type:'text',text:'🍕'.repeat(501)}),'payload_too_large');
  rejects(() => buildStaticPayload({type:'text',text:'a\u0000b'}),'invalid_input');
  rejects(() => buildStaticPayload({type:'unknown'}),'invalid_input');rejects(() => buildStaticPayload(null),'invalid_input');
  rejects(() => normalizeDestination(42),'invalid_input');
});

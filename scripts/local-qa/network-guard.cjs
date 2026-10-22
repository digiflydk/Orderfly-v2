// Loaded before app/seed code through NODE_OPTIONS; credentials are never logged.
'use strict';
const net = require('node:net'), dns = require('node:dns'), http2 = require('node:http2');
const marker = Symbol.for('orderfly.qa0.loopback-guard');
if (process.env.ORDERFLY_LOCAL_QA !== 'true') throw Error('Local QA guard requires explicit mode');
const local = host => host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === 'localhost';
const reject = () => { throw Error('Local QA blocked non-loopback network access'); };
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (first && typeof first === 'object') {
    if (first.path || !local(first.host || 'localhost')) reject();
  } else if (typeof first === 'number') {
    if (!local(typeof args[1] === 'string' ? args[1] : 'localhost')) reject();
  } else reject();
  return connect.apply(this, args);
};
const http2Connect = http2.connect;
http2.connect = function (authority, ...args) { if (!local(new URL(authority).hostname)) reject(); return http2Connect.call(this, authority, ...args); };
const fetch = globalThis.fetch;
globalThis.fetch = function (input, ...args) { const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!local(url.hostname)) reject(); return fetch.call(this, input, ...args); };
// Resolve only literal loopback/localhost without invoking a system resolver.
function lookupResult(host, options) {
  if (!local(host)) reject();
  const family = host === '::1' || host === '[::1]' || options?.family === 6 ? 6 : 4;
  const address = family === 6 ? '::1' : '127.0.0.1';
  return options?.all ? [{ address, family }] : { address, family };
}
dns.lookup = function(host, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  const result = lookupResult(host, options);
  queueMicrotask(() => options?.all ? callback(null, result) : callback(null, result.address, result.family));
};
dns.promises.lookup = async (host, options) => lookupResult(host, options);
for (const target of [dns, dns.promises, dns.Resolver?.prototype, dns.promises.Resolver?.prototype].filter(Boolean)) {
  for (const name of Object.getOwnPropertyNames(target)) if (/^resolve|^reverse$|^lookupService$/.test(name) && typeof target[name] === 'function') target[name] = reject;
}
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function(...args) {
  const first = args[0];
  const host = first && typeof first === 'object' ? first.host : typeof args[1] === 'string' ? args[1] : null;
  if (!local(host) || first?.path) reject();
  return listen.apply(this, args);
};
Object.defineProperty(globalThis, marker, { value: true, configurable: false, writable: false });

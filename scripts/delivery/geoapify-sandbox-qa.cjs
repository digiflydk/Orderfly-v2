// Opt-in routing-only acceptance. This PRIVATE LOCAL ledger is not the distributed runtime quota.
// Use an exclusive QA key while the runtime is unconfigured/inactive. No concurrent runtime/key use.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PICKUP = Object.freeze({ street: 'Borgergade 10', postalCode: '1300', city: 'København', countryCode: 'DK' });
const DROPOFF = Object.freeze({ street: 'Store Kongensgade 132', postalCode: '1264', city: 'København', countryCode: 'DK' });
const DAILY_LIMIT = 100;
const failure = () => Error('routing_qa_failed');
function readPrivate(filename) {
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || (st.mode & 0o777) !== 0o600 || st.size > 1000000) throw failure();
    return JSON.parse(fs.readFileSync(fd, 'utf8'));
  } finally { fs.closeSync(fd); }
}
function savePrivate(filename, value) {
  const tmp = `${filename}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(tmp, filename);
  const directory = fs.openSync(path.dirname(filename), 'r');
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}
function dayKey(now) { return now.toISOString().slice(0, 10); }
function validateJournal(journal) {
  if (journal?.version !== 1 || journal?.scope !== 'local-routing-qa-only' || !journal.days || typeof journal.days !== 'object' || Array.isArray(journal.days)) throw failure();
  for (const [day, value] of Object.entries(journal.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isSafeInteger(value.reservedRequests) || value.reservedRequests < 0 || value.reservedRequests > DAILY_LIMIT || !Array.isArray(value.runs)) throw failure();
  }
}
/** Holds a private exclusive lock for the complete bounded run. Never automatically removes a stale lock. */
async function runRoutingQa({ configFile, journalFile, createAdapter, fetchImpl = fetch, now = () => new Date() }) {
  if (!path.isAbsolute(configFile) || !path.isAbsolute(journalFile) || configFile === journalFile) throw failure();
  const config = readPrivate(configFile);
  if (Object.keys(config).length !== 1 || typeof config.apiKey !== 'string' || !/^[A-Za-z0-9_-]{16,300}$/.test(config.apiKey)) throw failure();
  const directory = fs.lstatSync(path.dirname(journalFile));
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077) !== 0) throw failure();
  const lock = `${journalFile}.lock`;
  const fd = fs.openSync(lock, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, 'routing-qa-exclusive'); fs.fsyncSync(fd);
    const journal = fs.existsSync(journalFile) ? readPrivate(journalFile) : { version: 1, scope: 'local-routing-qa-only', days: {} };
    validateJournal(journal);
    const day = dayKey(now());
    const bucket = journal.days[day] ??= { reservedRequests: 0, runs: [] };
    let reserved = false, allowed = 0, calls = 0, sendBeforeMs = 0;
    const run = { id: crypto.randomUUID(), at: now().toISOString(), state: 'prepared', requests: [] };
    const persist = () => savePrivate(journalFile, journal);
    const reserveQuote = async () => {
      if (reserved || dayKey(now()) !== day || bucket.reservedRequests + 3 > DAILY_LIMIT) return false;
      bucket.reservedRequests += 3; bucket.runs.push(run); reserved = true; run.state = 'reserved'; persist(); return true;
    };
    const reserveRequest = async () => {
      if (!reserved || allowed >= 3 || allowed !== calls || dayKey(now()) !== day) return null;
      sendBeforeMs = now().getTime() + 1000;
      allowed++; return { sendBeforeMs };
    };
    const guardedFetch = async (url, options) => {
      const parsed = new URL(url);
      const expected = calls < 2 ? '/v1/geocode/search' : '/v1/routing';
      if (!reserved || calls >= 3 || allowed !== calls + 1 || parsed.origin !== 'https://api-eu.geoapify.com' || parsed.pathname !== expected || parsed.username || parsed.password || parsed.hash || (options?.method ?? 'GET') !== 'GET' || options?.redirect !== 'error') throw failure();
      const entry = { kind: calls < 2 ? 'geocode' : 'route', state: 'outbound_intent', at: now().toISOString() };
      run.requests.push(entry); calls++; run.state = 'in_progress'; persist();
      try {
        if (now().getTime() >= sendBeforeMs) throw failure();
        const response = await fetchImpl(url, options);
        entry.state = 'response'; entry.httpStatus = response.status; persist(); return response;
      } catch {
        entry.state = 'unknown'; run.state = 'request_unknown'; persist(); throw failure();
      }
    };
    const adapter = createAdapter({ apiKey: config.apiKey, fetch: guardedFetch, reserveQuote, reserveRequest });
    if (adapter?.source !== 'geoapify') throw failure();
    const pickup = await adapter.resolve({ ...PICKUP });
    const dropoff = await adapter.resolve({ ...DROPOFF });
    let route = { kind: 'not_attempted' };
    if (pickup.kind === 'verified' && dropoff.kind === 'verified') route = await adapter.route({ pickup: pickup.address, dropoff: dropoff.address, profile: 'car' });
    const passed = pickup.kind === 'verified' && dropoff.kind === 'verified' && route.kind === 'route' && calls === 3 && Number.isSafeInteger(route.meters) && route.meters >= 0 && Number.isSafeInteger(route.durationSeconds) && route.durationSeconds >= 0;
    if (reserved) { run.state = passed ? 'passed' : 'failed'; persist(); }
    const statuses = new Set(['verified', 'invalid', 'ambiguous', 'unavailable', 'route', 'no_route', 'not_attempted']);
    const safe = value => statuses.has(value) ? value : 'unavailable';
    return { status: passed ? 'passed' : 'failed', source: 'geoapify', pickupStatus: safe(pickup.kind), dropoffStatus: safe(dropoff.kind), routeStatus: safe(route.kind), httpStatuses: run.requests.map(v => v.httpStatus ?? null), requests: calls, quotaScope: 'local-routing-qa-only', ...(passed ? { meters: route.meters, durationSeconds: route.durationSeconds } : {}) };
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
module.exports = { runRoutingQa, readPrivate, dayKey, PICKUP, DROPOFF };
if (require.main === module) (async () => {
  if (process.env.ORDERFLY_GEOAPIFY_QA !== 'approved-routing-only') throw failure();
  if (Object.keys(process.env).some(key => /SERVICE_ACCOUNT|GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_TOKEN|STRIPE|WOLT|SMTP|OMNISEND/.test(key) && process.env[key])) throw failure();
  const root = path.resolve(__dirname, '../..');
  const { loadTs } = require(path.join(root, 'tests/helpers/load-ts.cjs'));
  const { createGeoapifyRoutingAdapter } = loadTs(path.join(root, 'src/lib/delivery/routing/geoapify/adapter.ts'), { 'server-only': {} });
  const result = await runRoutingQa({ configFile: process.env.ORDERFLY_GEOAPIFY_QA_CONFIG, journalFile: process.env.ORDERFLY_GEOAPIFY_QA_JOURNAL, createAdapter: createGeoapifyRoutingAdapter });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== 'passed') process.exitCode = 1;
})().catch(() => { process.stderr.write('Routing QA failed. Inspect the private quota journal; no automatic retry.\n'); process.exitCode = 1; });

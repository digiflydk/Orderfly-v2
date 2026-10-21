const { loadTs } = require('./load-ts.cjs');
const assert = require('node:assert/strict');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const identity = { provider: 'firebase', subject: 'writer' };
const actorId = authority.principalKey(identity);
const path = 'locations/location/printers/p1';
const config = (patch = {}) => ({ id: 'p1', brandId: 'brand', locationId: 'location', name: 'Pizza ÆØÅ',
  manufacturer: 'star', model: 'mc-print3', transport: 'cloudprnt-http', state: 'disabled', paperWidthMm: 80, ...patch });
const record = (patch = {}) => ({ schemaVersion: 1, configuration: config(), revision: 1,
  deletedAt: null, createdAt: { seconds: 1 }, updatedAt: { seconds: 1 }, ...patch });
function policy(permissions = ['orderfly.catalog:create', 'orderfly.catalog:edit']) {
  return {
    principals: [{ id: actorId, active: true }],
    companies: [{ id: 'company', active: true, locationIds: ['location', 'other'], orderflyBrandIds: ['brand'] }],
    roles: [{ id: 'role', name: 'Printer writer', companyId: 'company', kind: 'company_user', permissions, active: true }],
    memberships: [{ id: 'member', principalId: actorId, companyId: 'company', locationIds: ['location'], roleIds: ['role'], active: true }],
  };
}
function fixture({ existing, permissions, anonymous = false, identityStatus, enabled = true, failAudit = false,
  beforeCommit, retry, extra = [], target = 'configuration' } = {}) {
  const records = new Map([
    ['platformAdminControl/access-v1', policy(permissions)], ['brands/brand', {}],
    ['locations/location', { brandId: 'brand' }], ['locations/other', { brandId: 'brand' }], ...extra,
  ]);
  if (existing !== undefined) records.set(path, existing);
  const events = [], commits = []; let dbCalls = 0, queue = Promise.resolve(), retried = false;
  function collection(path) { return { doc: id => ref(`${path}/${id}`), limit: count => ({ query: path, limit: count }) }; }
  function ref(path) { return { path, id: path.split('/').at(-1), collection: name => collection(`${path}/${name}`) }; }
  const db = {
    collection,
    runTransaction(run, options) {
      if (target === 'queue') assert.deepEqual(options, { readOnly: true }, 'queue summary must use SDK read-only mode');
      const job = queue.then(async () => {
        for (;;) {
          const staged = new Map(structuredClone([...records])), writes = []; let writing = false;
          const tx = {
            async get(ref) { assert.equal(writing, false, 'Firestore reads must precede writes'); events.push(['get', ref.path || ref.query]);
              if (ref.query) {
                assert.equal(ref.limit, 501, 'queue scans must be bounded and detect overflow');
                const rows = [...staged].filter(([key]) => key.startsWith(`${ref.query}/`) && !key.slice(ref.query.length + 1).includes('/')).slice(0, ref.limit);
                return { size: rows.length, docs: rows.map(([key, value]) => ({ id: key.split('/').at(-1), data: () => structuredClone(value) })) };
              }
              return { id: ref.id, exists: staged.has(ref.path), data: () => structuredClone(staged.get(ref.path)) }; },
            delete(ref) { assert.notEqual(target, 'queue', 'read-only queue must never delete'); writing = true; writes.push(['delete', ref.path]); staged.delete(ref.path); },
            create(ref, value) { assert.notEqual(target, 'queue', 'read-only queue must never create'); writing = true; if (staged.has(ref.path)) throw Error('PRIVATE_SENTINEL conflict');
              if (failAudit && ref.path.includes('/audit/')) throw Error('PRIVATE_SENTINEL audit failed');
              writes.push(['create', ref.path]); staged.set(ref.path, structuredClone(value)); },
            set(ref, value) { assert.notEqual(target, 'queue', 'read-only queue must never set'); writing = true; writes.push(['set', ref.path]); staged.set(ref.path, structuredClone(value)); },
          };
          const value = await run(tx);
          if (retry && !retried) { retried = true; retry(records); continue; }
          if (beforeCommit) await beforeCommit(staged);
          records.clear(); for (const row of staged) records.set(...row); commits.push(writes); return value;
        }
      });
      queue = job.catch(() => {}); return job;
    },
  };
  const mocks = {
    'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => { dbCalls++; return db; } },
    '@/lib/access/authority': authority, './authority': authority,
    '@/lib/access/orderfly-session': { verifiedOrderflyIdentity: async () => {
      if (identityStatus) throw new authority.AuthorityError('PRIVATE_SENTINEL', identityStatus);
      if (anonymous) throw new authority.AuthorityError('unauthorized', 401); return identity;
    } },
    '@/lib/url': { getOrigin: async () => 'https://orderfly.dk' },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => ({ serverTimestamp: true }) } },
  };
  const routePath = target === 'queue' ? 'src/app/api/merchant/printers/queue/route.ts' : target === 'lifecycle' ? 'src/app/api/merchant/printers/lifecycle/route.ts' : 'src/app/api/merchant/printers/route.ts';
  const routes = loadTs(routePath, mocks);
  const service = loadTs('src/lib/printing/writes.ts', mocks);
  const lifecycle = loadTs('src/lib/printing/lifecycle.ts', mocks);
  async function withFlag(run, flag = enabled ? 'true' : undefined) {
    const previous = process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
    if (flag === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
    else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = flag;
    try { return await run(); } finally {
      if (previous === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
      else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = previous;
    }
  }
  return { records, events, commits, get dbCalls() { return dbCalls; },
    transition: (input, flag) => withFlag(() => lifecycle.transitionPrinter(input), flag),
    direct: (operation, input, flag) => withFlag(() => service.writePrinterConfiguration(operation, input), flag),
    async request(method = 'POST', body = { configuration: config() }, options = {}) {
      return withFlag(async () => {
        const request = new Request(`https://orderfly.dk/api/merchant/printers${target === 'queue' ? '/queue' : target === 'lifecycle' ? '/lifecycle' : ''}${options.query || ''}`, {
          method, headers: { origin: 'https://orderfly.dk', 'content-type': 'application/json', ...options.headers },
          ...(method === 'GET' ? {} : { body: options.raw === undefined ? JSON.stringify(body) : options.raw }),
        });
        const response = await routes[method](request);
        return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control'), vary: response.headers.get('vary') };
      });
    },
  };
}

module.exports = { fixture, config, record, path, actorId, policy };

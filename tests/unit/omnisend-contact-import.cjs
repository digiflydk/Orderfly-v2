const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadTs } = require('../helpers/load-ts.cjs');
const { memoryDb } = require('../helpers/marketing-db.cjs');

const config = {
  brandId: 'brand-import-test',
  omnisendBrandId: 'omnisend-import-test',
  apiKey: 'synthetic-restricted-key',
  enabled: true,
  consentMode: 'single_opt_in',
};
const { runOmnisendContactImportWorker } = loadTs('src/lib/marketing/import-worker.ts', {
  'server-only': {},
});
const { runMarketingWorker } = loadTs('src/lib/marketing/worker.ts', { 'server-only': {} });
const { Omnisend } = loadTs('src/lib/marketing/provider.ts', { 'server-only': {} });

const emailHash = email => createHash('sha256').update(config.brandId + '\n' + email.trim().toLowerCase()).digest('hex');
const makeContact = (email, status, consent = null, statusChangedAt = '2026-10-01T10:00:00.000Z') => ({
  id: 'omni-contact-test',
  firstName: 'Anna',
  lastName: 'Jensen',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  identifiers: [{
    type: 'email',
    id: email,
    channels: { email: { status, statusChangedAt } },
    ...(consent ? { consent } : {}),
  }],
});

function providerFor(contacts) {
  return () => ({
    verifyBrand: async () => {},
    listContacts: async () => ({ contacts, after: null }),
  });
}

test('Omnisend contact pagination uses the dated API version and incremental cursor', async () => {
  let requestedUrl = '';
  let requestOptions;
  const provider = new Omnisend(config, async (url, init) => {
    requestedUrl = String(url);
    requestOptions = init;
    return Response.json({ contacts: [], paging: { cursors: { after: 'next-page' } } });
  });
  const result = await provider.listContacts({
    updatedAtFrom: '2026-10-01T10:00:00.000Z',
    after: 'previous-page',
    limit: 25,
  });
  const url = new URL(requestedUrl);
  assert.equal(url.origin, 'https://api.omnisend.com');
  assert.equal(url.pathname, '/api/contacts');
  assert.equal(url.searchParams.get('updatedAtFrom'), '2026-10-01T10:00:00.000Z');
  assert.equal(url.searchParams.get('after'), 'previous-page');
  assert.equal(url.searchParams.get('sort'), 'updatedAt');
  assert.equal(url.searchParams.get('direction'), 'asc');
  assert.equal(url.searchParams.get('limit'), '25');
  assert.equal(requestOptions.headers['Omnisend-Version'], '2026-03-15');
  assert.equal(requestOptions.headers['Authorization'], 'Omnisend-API-Key synthetic-restricted-key');
  assert.equal(result.after, 'next-page');
});

test('imports a subscribed Omnisend contact into the brand customer and records explicit consent provenance', async () => {
  const previous = process.env.ORDERFLY_OMNISEND_BRANDS;
  process.env.ORDERFLY_OMNISEND_BRANDS = JSON.stringify([config]);
  try {
    const db = memoryDb();
    const counts = await runOmnisendContactImportWorker(db, Date.now(), providerFor([
      makeContact('ANNA@example.test', 'subscribed', {
        source: 'omnisend-form',
        createdAt: '2026-09-30T09:00:00.000Z',
      }),
    ]));
    const customerId = 'cust-v2-' + emailHash('anna@example.test').slice(0, 32);
    const customer = db.rows.get('customers/' + customerId);
    assert.equal(counts.created, 1);
    assert.equal(customer.brandId, config.brandId);
    assert.equal(customer.normalizedEmail, 'anna@example.test');
    assert.equal(customer.marketingConsent, true);
    assert.equal(customer.totalOrders, 0);
    assert.equal(customer.integrationSources.omnisend.contactId, 'omni-contact-test');
    assert.equal(db.rows.get('marketingContacts/' + emailHash('anna@example.test')).providerStatus, 'subscribed');
    assert.equal([...db.rows.keys()].filter(key => key.startsWith('marketingConsentImports/')).length, 1);
  } finally {
    if (previous === undefined) delete process.env.ORDERFLY_OMNISEND_BRANDS;
    else process.env.ORDERFLY_OMNISEND_BRANDS = previous;
  }
});

test('the existing authenticated marketing worker runs the contact import', async () => {
  const previous = process.env.ORDERFLY_OMNISEND_BRANDS;
  process.env.ORDERFLY_OMNISEND_BRANDS = JSON.stringify([config]);
  try {
    const db = memoryDb();
    const result = await runMarketingWorker(db, Date.now(), providerFor([
      makeContact('worker@example.test', 'subscribed', {
        source: 'omnisend-form',
        createdAt: '2026-09-30T09:00:00.000Z',
      }),
    ]));
    assert.equal(result.importedContacts.created, 1);
    assert.equal(db.rows.get('customers/cust-v2-' + emailHash('worker@example.test').slice(0, 32)).marketingConsent, true);
  } finally {
    if (previous === undefined) delete process.env.ORDERFLY_OMNISEND_BRANDS;
    else process.env.ORDERFLY_OMNISEND_BRANDS = previous;
  }
});

test('subscribed status without recorded consent does not grant Orderfly marketing consent', async () => {
  const previous = process.env.ORDERFLY_OMNISEND_BRANDS;
  process.env.ORDERFLY_OMNISEND_BRANDS = JSON.stringify([config]);
  try {
    const db = memoryDb();
    await runOmnisendContactImportWorker(db, Date.now(), providerFor([
      makeContact('guest@example.test', 'subscribed'),
    ]));
    const customer = db.rows.get('customers/cust-v2-' + emailHash('guest@example.test').slice(0, 32));
    assert.equal(customer.marketingConsent, false);
    assert.equal(db.rows.get('marketingContacts/' + emailHash('guest@example.test')).state, 'suppressed');
  } finally {
    if (previous === undefined) delete process.env.ORDERFLY_OMNISEND_BRANDS;
    else process.env.ORDERFLY_OMNISEND_BRANDS = previous;
  }
});

test('a newer explicit Orderfly signup is not erased by an older provider unsubscribe', async () => {
  const previous = process.env.ORDERFLY_OMNISEND_BRANDS;
  process.env.ORDERFLY_OMNISEND_BRANDS = JSON.stringify([config]);
  try {
    const db = memoryDb();
    const email = 'new-optin@example.test';
    const customerId = 'recent-optin-customer';
    const eventId = 'consent-event-new';
    const contactHash = emailHash(email);
    db.rows.set('customers/' + customerId, {
      id: customerId, brandId: config.brandId, email, normalizedEmail: email,
      fullName: 'Recent Guest', marketingConsent: true, totalOrders: 1, totalSpend: 50,
    });
    db.rows.set('marketingContacts/' + contactHash, {
      brandId: config.brandId, customerId, latestEventId: eventId, state: 'pending',
    });
    db.rows.set('marketingConsents/' + eventId, {
      id: eventId, brandId: config.brandId, customerId,
      capturedAt: Date.parse('2026-10-10T10:00:00.000Z'),
    });
    db.rows.set('marketingOutbox/' + eventId, {
      brandId: config.brandId, customerId, state: 'pending', attempts: 0,
    });

    await runOmnisendContactImportWorker(db, Date.now(), providerFor([
      makeContact(email, 'unsubscribed', null, '2026-10-01T10:00:00.000Z'),
    ]));
    assert.equal(db.rows.get('customers/' + customerId).marketingConsent, true);
    assert.equal(db.rows.get('marketingContacts/' + contactHash).state, 'pending');
    assert.equal(db.rows.get('marketingOutbox/' + eventId).state, 'pending');
  } finally {
    if (previous === undefined) delete process.env.ORDERFLY_OMNISEND_BRANDS;
    else process.env.ORDERFLY_OMNISEND_BRANDS = previous;
  }
});

test('provider unsubscribe blocks older Orderfly consent and writes do not cross brand boundaries', async () => {
  const previous = process.env.ORDERFLY_OMNISEND_BRANDS;
  process.env.ORDERFLY_OMNISEND_BRANDS = JSON.stringify([config]);
  try {
    const db = memoryDb();
    const email = 'old-consent@example.test';
    const customerId = 'existing-customer';
    const eventId = 'consent-event-old';
    const hash = emailHash(email);
    db.rows.set('customers/' + customerId, {
      id: customerId, brandId: config.brandId, email, normalizedEmail: email,
      fullName: 'Existing Guest', marketingConsent: true, totalOrders: 3, totalSpend: 120,
    });
    db.rows.set('marketingContacts/' + hash, {
      brandId: config.brandId, customerId, latestEventId: eventId,
      state: 'synced', nextReconcileAt: Number.MAX_SAFE_INTEGER,
    });
    db.rows.set('marketingConsents/' + eventId, {
      id: eventId, brandId: config.brandId, customerId, capturedAt: Date.parse('2026-09-01T10:00:00.000Z'),
    });
    db.rows.set('marketingOutbox/' + eventId, {
      brandId: config.brandId, customerId, state: 'synced', attempts: 1,
    });
    db.rows.set('customers/another-brand-customer', {
      id: 'another-brand-customer', brandId: 'another-brand',
      email, normalizedEmail: email, fullName: 'Do not touch',
    });

    await runOmnisendContactImportWorker(db, Date.now(), providerFor([
      makeContact(email, 'unsubscribed', null, '2026-10-01T10:00:00.000Z'),
    ]));
    assert.equal(db.rows.get('customers/' + customerId).marketingConsent, false);
    assert.equal(db.rows.get('customers/' + customerId).totalOrders, 3);
    assert.equal(db.rows.get('customers/another-brand-customer').marketingConsent, undefined);
    assert.equal(db.rows.get('marketingContacts/' + hash).state, 'suppressed');
    assert.equal(db.rows.get('marketingOutbox/' + eventId).state, 'synced');
  } finally {
    if (previous === undefined) delete process.env.ORDERFLY_OMNISEND_BRANDS;
    else process.env.ORDERFLY_OMNISEND_BRANDS = previous;
  }
});

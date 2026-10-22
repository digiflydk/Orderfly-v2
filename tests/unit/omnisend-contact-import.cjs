const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadTs } = require('../helpers/load-ts.cjs');
const { memoryDb } = require('../helpers/marketing-db.cjs');
const { checkout } = require('../helpers/checkout-fixture.cjs');

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
const customerIdentity = loadTs('src/lib/customer-identity.ts');

const emailHash = email => createHash('sha256').update(config.brandId + '\n' + email.trim().toLowerCase()).digest('hex');
const makeContact = (
  email,
  status,
  consent = null,
  statusChangedAt = '2026-10-01T10:00:00.000Z',
  phone = null,
) => ({
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
  }, ...(phone ? [{ type: 'phone', id: phone }] : [])],
});


function compatFor(db) {
  return {
    collection: (_parent, path) => ({ path }),
    doc: (_parent, ...segments) => ({ path: segments.join('/') }),
    getDoc: async reference => {
      const [name, ...segments] = reference.path.split('/');
      const saved = await db.collection(name).doc(segments.join('/')).get();
      return {
        id: saved.id,
        ref: saved.ref,
        exists: () => saved.exists,
        data: saved.data,
      };
    },
    where: (field, op, value) => ({ field, op, value }),
    limit: count => ({ limit: count }),
    query: (reference, ...constraints) => ({ ...reference, constraints }),
    getDocs: async reference => {
      let query = db.collection(reference.path);
      for (const constraint of reference.constraints || []) {
        if (constraint.field) query = query.where(constraint.field, constraint.op, constraint.value);
        else if (constraint.limit) query = query.limit(constraint.limit);
      }
      return query.get();
    },
  };
}

function providerFor(contacts) {
  return () => ({
    verifyBrand: async () => {},
    listContacts: async () => ({ contacts, after: null }),
  });
}


test('shared customer identity matches either normalized email or phone and keeps secondary values as aliases', () => {
  const bookingCustomer = {
    id: 'booking-customer',
    normalizedEmail: 'booking@example.test',
    normalizedPhone: '+4512345678',
  };
  const byEmail = customerIdentity.selectCustomerByIdentity(
    [bookingCustomer], ' BOOKING@example.test ', null,
  );
  const byPhone = customerIdentity.selectCustomerByIdentity(
    [bookingCustomer], 'online@example.test', '0045 12 34 56 78',
  );
  assert.equal(byEmail.id, 'booking-customer');
  assert.equal(byPhone.id, 'booking-customer');

  const merged = customerIdentity.mergeCustomerIdentity(
    bookingCustomer, 'online@example.test', '+45 12 34 56 78',
  );
  assert.equal(merged.normalizedEmail, 'booking@example.test');
  assert.deepEqual(merged.emailAliases, ['online@example.test']);
  assert.equal(merged.normalizedPhone, '+4512345678');
  assert.deepEqual(merged.phoneAliases, []);
});

test('one customer profile accepts multiple email and phone aliases in either direction', () => {
  const customer = {
    id: 'single-customer',
    email: 'primary@example.test',
    normalizedEmail: 'primary@example.test',
    emailAliases: ['second@example.test', 'third@example.test'],
    phone: '+45 12 34 56 78',
    normalizedPhone: '+4512345678',
    phoneAliases: ['+4555555555'],
  };

  assert.equal(
    customerIdentity.selectCustomerByIdentity([customer], 'second@example.test', null)?.id,
    'single-customer',
  );
  assert.equal(
    customerIdentity.selectCustomerByIdentity([customer], 'new@example.test', '+45 55 55 55 55')?.id,
    'single-customer',
  );
  assert.equal(
    customerIdentity.selectCustomerByIdentity([customer], 'another@example.test', '+45 12 34 56 78')?.id,
    'single-customer',
  );

  const merged = customerIdentity.mergeCustomerIdentity(
    customer, 'fourth@example.test', '+45 66 66 66 66',
  );
  assert.equal(merged.normalizedEmail, 'primary@example.test');
  assert.deepEqual(merged.emailAliases, [
    'second@example.test', 'third@example.test', 'fourth@example.test',
  ]);
  assert.equal(merged.normalizedPhone, '+4512345678');
  assert.deepEqual(merged.phoneAliases, ['+4555555555', '+4566666666']);
});

test('conflicting email and phone identities are rejected instead of selecting a third customer', () => {
  assert.throws(
    () => customerIdentity.selectCustomerByIdentity([
      { id: 'email-customer', normalizedEmail: 'same@example.test', normalizedPhone: '+4511111111' },
      { id: 'phone-customer', normalizedEmail: 'other@example.test', normalizedPhone: '+4522222222' },
    ], 'same@example.test', '+4522222222'),
    error => error.code === 'customer_identity_conflict',
  );
});

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


test('public checkout rejects unknown email with a booking phone without changing customer or identities', async () => {
  const bookingCustomer = {
    id:'booking-customer',brandId:'b',email:'booking@example.test',normalizedEmail:'booking@example.test',
    phone:'12345678',normalizedPhone:'12345678',fullName:'Anna Jensen',locationIds:['l'],totalOrders:1,totalSpend:90,marketingConsent:false,
  };
  const phoneKey='integrationConsumerCustomerPhoneIdentities/'+customerIdentity.customerIdentityKey('b','12345678');
  const reservation={brandId:'b',customerId:'booking-customer'};
  const result=await checkout({seed:[['customers/booking-customer',bookingCustomer],[phoneKey,reservation]],customerOverrides:{email:'online@example.test',phone:'12345678'}});
  assert.equal(result.result.success,false);
  assert.deepEqual(result.writes,[]);assert.deepEqual(result.events,[]);
  assert.deepEqual(result.records.get('customers/booking-customer'),bookingCustomer);
  assert.deepEqual(result.records.get(phoneKey),reservation);
  assert.equal([...result.records.keys()].filter(key=>key.startsWith('customers/')).length,1);
  assert.equal([...result.records.keys()].some(key=>key.startsWith('integrationConsumerCustomerIdentities/')),false);
  assert.equal([...result.records.keys()].some(key=>key.startsWith('orders/')),false);
});

test('checkout reuses an email alias already established by the trusted booking import flow', async () => {
  const db=memoryDb(new Map([['brands/b',{id:'b'}],['locations/l',{id:'l',brandId:'b'}]]));
  const admin={firestore:{FieldValue:{serverTimestamp:()=>new Date('2026-10-13T12:00:00.000Z'),arrayUnion:(...values)=>values}}};
  const resolver=loadTs('src/lib/integrations/esmeralda-consumer-customer.ts',{'server-only':{},'@/lib/firebase-admin':{admin,getAdminDb:()=>db}});
  const input={organization_id:'b',location_id:'l',full_name:'Anna Jensen',phone:'12345678'};
  const first=await resolver.resolveOrUpsertEsmeraldaConsumerCustomer({...input,booking_id:'booking-primary',email:'booking@example.test'});
  const imported=await resolver.resolveOrUpsertEsmeraldaConsumerCustomer({...input,booking_id:'booking-alias',email:'online@example.test'});
  assert.equal(imported.customer_id,first.customer_id);
  assert.deepEqual(db.rows.get('customers/'+first.customer_id).emailAliases,['online@example.test']);
  const result=await checkout({seed:[...db.rows],customerOverrides:{email:'online@example.test',phone:'12345678'}});
  assert.equal(result.result.success,true,result.result.error);
  const customer=result.records.get('customers/'+first.customer_id);
  assert.equal(customer.normalizedEmail,'booking@example.test');assert.deepEqual(customer.emailAliases,['online@example.test']);
  assert.equal([...result.records.keys()].filter(key=>key.startsWith('customers/')).length,1);
  assert.equal(result.records.get('integrationConsumerCustomerIdentities/'+customerIdentity.customerIdentityKey('b','online@example.test')).customerId,first.customer_id);
  assert.equal(result.records.get('integrationConsumerCustomerPhoneIdentities/'+customerIdentity.customerIdentityKey('b','12345678')).customerId,first.customer_id);
  assert.equal(result.records.get('orders/ORD-TEST').customerDetails.id,first.customer_id);
});

test('checkout does not create a duplicate when email and phone belong to different customers', async () => {
  const result = await checkout({
    seed: [
      ['customers/email-customer', {
        id: 'email-customer', brandId: 'b',
        email: 'primary@example.test', normalizedEmail: 'primary@example.test',
        emailAliases: ['same@example.test'], phone: '+4511111111', normalizedPhone: '+4511111111',
      }],
      ['customers/phone-customer', {
        id: 'phone-customer', brandId: 'b',
        email: 'other@example.test', normalizedEmail: 'other@example.test',
        phone: '+4522222222', normalizedPhone: '+4522222222',
      }],
    ],
    customerOverrides: { email: 'same@example.test', phone: '+4522222222' },
  });
  assert.equal(result.result.success, false);
  assert.equal(result.events.includes('stripe'), false);
  assert.equal([...result.records.keys()].filter(key => key.startsWith('customers/')).length, 2);
});


test('newsletter signup accepts a customer email alias without granting the primary address consent', async () => {
  const db = memoryDb();
  const customerId = 'booking-customer';
  const aliasEmail = 'online@example.test';
  db.rows.set('customers/' + customerId, {
    id: customerId,
    brandId: config.brandId,
    email: 'booking@example.test',
    normalizedEmail: 'booking@example.test',
    emailAliases: [aliasEmail],
    marketingConsent: false,
  });
  const { recordNewsletterConsent } = loadTs('src/lib/marketing/store.ts', {
    'server-only': {},
  });
  const eventId = await recordNewsletterConsent(db, {
    brandId: config.brandId,
    brandName: 'Test brand',
    locationId: 'location-test',
    customerId,
    email: aliasEmail,
  });
  assert.ok(eventId);
  assert.equal(db.rows.get('customers/' + customerId).marketingConsent, false);
  assert.equal(db.rows.get('marketingContacts/' + emailHash(aliasEmail)).customerId, customerId);
});

test('unsubscribe for a secondary email does not clear primary-email consent', async () => {
  const previous = process.env.ORDERFLY_OMNISEND_BRANDS;
  process.env.ORDERFLY_OMNISEND_BRANDS = JSON.stringify([config]);
  try {
    const db = memoryDb();
    const aliasEmail = 'online@example.test';
    const contactHash = emailHash(aliasEmail);
    const customerId = 'booking-customer';
    const eventId = 'alias-consent-event';
    db.rows.set('customers/' + customerId, {
      id: customerId,
      brandId: config.brandId,
      email: 'booking@example.test',
      normalizedEmail: 'booking@example.test',
      emailAliases: [aliasEmail],
      marketingConsent: true,
    });
    db.rows.set('marketingOutbox/' + eventId, {
      brandId: config.brandId, customerId, eventId, contactKey: contactHash,
      state: 'pending', attempts: 0, nextAttemptAt: Date.now() - 1,
    });
    db.rows.set('marketingConsents/' + eventId, {
      id: eventId, brandId: config.brandId, customerId, email: aliasEmail,
      channel: 'email', source: 'checkout', capturedAt: Date.now(),
    });
    db.rows.set('marketingContacts/' + contactHash, {
      brandId: config.brandId, customerId, latestEventId: eventId,
      state: 'pending', nextReconcileAt: Number.MAX_SAFE_INTEGER,
    });
    const provider = () => ({
      verifyBrand: async () => {},
      sync: async () => 'suppressed',
      listContacts: async () => ({ contacts: [], after: null }),
    });
    await runMarketingWorker(db, Date.now(), provider);
    assert.equal(db.rows.get('customers/' + customerId).marketingConsent, true);
    assert.equal(db.rows.get('marketingContacts/' + contactHash).state, 'suppressed');
  } finally {
    if (previous === undefined) delete process.env.ORDERFLY_OMNISEND_BRANDS;
    else process.env.ORDERFLY_OMNISEND_BRANDS = previous;
  }
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

test('manual Omnisend import scopes to one brand and can bypass the scheduled interval', async () => {
  const other = { ...config, brandId: 'brand-import-other', omnisendBrandId: 'omnisend-other' };
  const previous = process.env.ORDERFLY_OMNISEND_BRANDS;
  process.env.ORDERFLY_OMNISEND_BRANDS = JSON.stringify([config, other]);
  try {
    const now = Date.now();
    const db = memoryDb(new Map([
      ['omnisendContactImportState/' + config.brandId, {
        backfillComplete: true,
        after: null,
        importedThrough: new Date(now).toISOString(),
        nextAttemptAt: now + 60_000,
      }],
    ]));
    const requestedBrands = [];
    const counts = await runOmnisendContactImportWorker(db, now, brand => {
      requestedBrands.push(brand.brandId);
      return providerFor([])();
    }, now + 45_000, { brandId: config.brandId, allowEarly: true });
    assert.deepEqual(requestedBrands, [config.brandId]);
    assert.equal(counts.pages, 1);
    assert.deepEqual(counts.results, [{
      brandId: config.brandId,
      status: 'imported',
      backfillComplete: true,
      hasMore: false,
      fetched: 0,
      imported: 0,
      skipped: 0,
      conflicts: 0,
    }]);
    assert.equal(db.rows.has('omnisendContactImportState/' + other.brandId), false);
  } finally {
    if (previous === undefined) delete process.env.ORDERFLY_OMNISEND_BRANDS;
    else process.env.ORDERFLY_OMNISEND_BRANDS = previous;
  }
});


test('resolves an Omnisend contact by phone and preserves the booking customer primary identity', async () => {
  const previous = process.env.ORDERFLY_OMNISEND_BRANDS;
  process.env.ORDERFLY_OMNISEND_BRANDS = JSON.stringify([config]);
  try {
    const db = memoryDb();
    db.rows.set('customers/booking-customer', {
      id: 'booking-customer',
      brandId: config.brandId,
      email: 'booking@example.test',
      normalizedEmail: 'booking@example.test',
      phone: '+45 12 34 56 78',
      normalizedPhone: '+4512345678',
      fullName: 'Anna Jensen',
      marketingConsent: false,
      totalOrders: 2,
      totalSpend: 180,
      integrationSources: { esmeralda: { lastBookingId: 'booking-1' } },
    });
    const counts = await runOmnisendContactImportWorker(db, Date.now(), providerFor([
      makeContact('online@example.test', 'subscribed', {
        source: 'omnisend-form',
        createdAt: '2026-10-10T09:00:00.000Z',
      }, undefined, '0045 12 34 56 78'),
    ]));
    const customer = db.rows.get('customers/booking-customer');
    assert.equal(counts.updated, 1);
    assert.equal([...db.rows.keys()].filter(key => key.startsWith('customers/')).length, 1);
    assert.equal(customer.normalizedEmail, 'booking@example.test');
    assert.deepEqual(customer.emailAliases, ['online@example.test']);
    assert.equal(customer.normalizedPhone, '+4512345678');
    assert.equal(customer.totalOrders, 2);
    assert.equal(customer.marketingConsent, false);
    assert.equal(customer.integrationSources.esmeralda.lastBookingId, 'booking-1');
    assert.equal(db.rows.get('marketingContacts/' + emailHash('online@example.test')).customerId, 'booking-customer');
    assert.equal(db.rows.get('integrationConsumerCustomerIdentities/' + emailHash('online@example.test')).customerId, 'booking-customer');
  } finally {
    if (previous === undefined) delete process.env.ORDERFLY_OMNISEND_BRANDS;
    else process.env.ORDERFLY_OMNISEND_BRANDS = previous;
  }
});

test('explicit Omnisend consent applies when the contact adds the first email to a phone-only booking profile', async () => {
  const previous = process.env.ORDERFLY_OMNISEND_BRANDS;
  process.env.ORDERFLY_OMNISEND_BRANDS = JSON.stringify([config]);
  try {
    const db = memoryDb();
    db.rows.set('customers/phone-only-booking', {
      id: 'phone-only-booking',
      brandId: config.brandId,
      email: '',
      normalizedEmail: '',
      phone: '+45 12 34 56 78',
      normalizedPhone: '+4512345678',
      fullName: 'Anna Jensen',
      marketingConsent: false,
      totalOrders: 0,
      totalSpend: 0,
      integrationSources: { esmeralda: { lastBookingId: 'booking-phone-only' } },
    });
    const email = 'anna@example.test';
    await runOmnisendContactImportWorker(db, Date.now(), providerFor([
      makeContact(email, 'subscribed', {
        source: 'omnisend-form',
        createdAt: '2026-10-10T09:00:00.000Z',
      }, undefined, '0045 12 34 56 78'),
    ]));

    const customer = db.rows.get('customers/phone-only-booking');
    assert.equal(customer.normalizedEmail, email);
    assert.equal(customer.email, email);
    assert.equal(customer.marketingConsent, true);
    assert.equal(db.rows.get('marketingContacts/' + emailHash(email)).state, 'synced');
    assert.equal([...db.rows.keys()].filter(key => key.startsWith('customers/')).length, 1);
  } finally {
    if (previous === undefined) delete process.env.ORDERFLY_OMNISEND_BRANDS;
    else process.env.ORDERFLY_OMNISEND_BRANDS = previous;
  }
});

test('Omnisend reports conflicting email and phone matches without creating another customer', async () => {
  const previous = process.env.ORDERFLY_OMNISEND_BRANDS;
  process.env.ORDERFLY_OMNISEND_BRANDS = JSON.stringify([config]);
  try {
    const db = memoryDb();
    db.rows.set('customers/email-customer', {
      id: 'email-customer', brandId: config.brandId,
      email: 'same@example.test', normalizedEmail: 'same@example.test',
      phone: '+4511111111', normalizedPhone: '+4511111111',
    });
    db.rows.set('customers/phone-customer', {
      id: 'phone-customer', brandId: config.brandId,
      email: 'other@example.test', normalizedEmail: 'other@example.test',
      phone: '+4522222222', normalizedPhone: '+4522222222',
    });
    const counts = await runOmnisendContactImportWorker(db, Date.now(), providerFor([
      makeContact('same@example.test', 'subscribed', null, undefined, '+4522222222'),
    ]));
    assert.equal(counts.conflicts, 1);
    assert.equal([...db.rows.keys()].filter(key => key.startsWith('customers/')).length, 2);
    assert.equal([...db.rows.keys()].filter(key => key.startsWith('omnisendContactImportErrors/')).length, 1);
    assert.equal([...db.rows.values()].find(row => row.code === 'customer_identity_conflict').code, 'customer_identity_conflict');
  } finally {
    if (previous === undefined) delete process.env.ORDERFLY_OMNISEND_BRANDS;
    else process.env.ORDERFLY_OMNISEND_BRANDS = previous;
  }
});


test('booking imports resolve an existing profile by phone and retain its primary email', async () => {
  const rows = new Map([
    ['brands/brand-import-test', { id: 'brand-import-test' }],
    ['locations/location-import-test', { id: 'location-import-test', brandId: config.brandId }],
    ['customers/booking-customer', {
      id: 'booking-customer',
      brandId: config.brandId,
      email: 'booking@example.test',
      normalizedEmail: 'booking@example.test',
      phone: '+45 12 34 56 78',
      normalizedPhone: '+4512345678',
      fullName: 'Anna Jensen',
      totalOrders: 2,
      totalSpend: 180,
      locationIds: [],
      integrationSources: {
        esmeralda: { lastBookingId: 'booking-1' },
        omnisend: { contactId: 'omni-contact-1' },
      },
    }],
  ]);
  const db = memoryDb(rows);
  const admin = { firestore: { FieldValue: {
    serverTimestamp: () => new Date('2026-10-13T12:00:00.000Z'),
    arrayUnion: (...values) => values,
  } } };
  const resolver = loadTs('src/lib/integrations/esmeralda-consumer-customer.ts', {
    'server-only': {},
    '@/lib/firebase-admin': { admin, getAdminDb: () => db },
  });
  const first = await resolver.resolveOrUpsertEsmeraldaConsumerCustomer({
    organization_id: config.brandId,
    location_id: 'location-import-test',
    booking_id: 'booking-2',
    full_name: 'Anna Jensen',
    email: 'online@example.test',
    phone: '0045 12 34 56 78',
  });
  const second = await resolver.resolveOrUpsertEsmeraldaConsumerCustomer({
    organization_id: config.brandId,
    location_id: 'location-import-test',
    booking_id: 'booking-3',
    full_name: 'Anna Jensen',
    email: 'online@example.test',
    phone: '+45 12 34 56 78',
  });
  assert.equal(first.customer_id, 'booking-customer');
  assert.equal(second.customer_id, 'booking-customer');
  assert.equal(first.operation, 'updated');
  assert.deepEqual(db.rows.get('customers/booking-customer').emailAliases, ['online@example.test']);
  assert.equal(db.rows.get('customers/booking-customer').integrationSources.omnisend.contactId, 'omni-contact-1');
  assert.equal([...db.rows.keys()].filter(key => key.startsWith('customers/')).length, 1);
});

test('booking resolver rejects email and phone identities that point to different customers', async () => {
  const rows = new Map([
    ['brands/brand-import-test', { id: 'brand-import-test' }],
    ['locations/location-import-test', { id: 'location-import-test', brandId: config.brandId }],
    ['customers/email-customer', {
      id: 'email-customer', brandId: config.brandId,
      email: 'same@example.test', normalizedEmail: 'same@example.test',
      phone: '+4511111111', normalizedPhone: '+4511111111',
    }],
    ['customers/phone-customer', {
      id: 'phone-customer', brandId: config.brandId,
      email: 'other@example.test', normalizedEmail: 'other@example.test',
      phone: '+4522222222', normalizedPhone: '+4522222222',
    }],
  ]);
  const db = memoryDb(rows);
  const admin = { firestore: { FieldValue: {
    serverTimestamp: () => new Date(),
    arrayUnion: (...values) => values,
  } } };
  const resolver = loadTs('src/lib/integrations/esmeralda-consumer-customer.ts', {
    'server-only': {},
    '@/lib/firebase-admin': { admin, getAdminDb: () => db },
  });
  await assert.rejects(
    resolver.resolveOrUpsertEsmeraldaConsumerCustomer({
      organization_id: config.brandId,
      location_id: 'location-import-test',
      booking_id: 'booking-conflict',
      full_name: 'Anna Jensen',
      email: 'same@example.test',
      phone: '+4522222222',
    }),
    error => error.code === 'customer_identity_conflict',
  );
  assert.equal([...db.rows.keys()].filter(key => key.startsWith('customers/')).length, 2);
});

test('phone-only booking creates one customer and a later email resolves to that same profile', async () => {
  const rows = new Map([
    ['brands/brand-import-test', { id: 'brand-import-test' }],
    ['locations/location-import-test', { id: 'location-import-test', brandId: config.brandId }],
  ]);
  const db = memoryDb(rows);
  const admin = { firestore: { FieldValue: {
    serverTimestamp: () => new Date('2026-10-13T12:00:00.000Z'),
    arrayUnion: (...values) => values,
  } } };
  const resolver = loadTs('src/lib/integrations/esmeralda-consumer-customer.ts', {
    'server-only': {},
    '@/lib/firebase-admin': { admin, getAdminDb: () => db },
  });
  const booking = await resolver.resolveOrUpsertEsmeraldaConsumerCustomer({
    organization_id: config.brandId,
    location_id: 'location-import-test',
    booking_id: 'booking-phone-only',
    full_name: 'Phone Guest',
    email: null,
    phone: '+45 12 34 56 78',
  });
  const emailThenBooking = await resolver.resolveOrUpsertEsmeraldaConsumerCustomer({
    organization_id: config.brandId,
    location_id: 'location-import-test',
    booking_id: 'booking-with-email',
    full_name: 'Phone Guest',
    email: 'guest@example.test',
    phone: '0045 12 34 56 78',
  });
  assert.equal(booking.operation, 'created');
  assert.equal(booking.normalized_email, null);
  assert.equal(emailThenBooking.customer_id, booking.customer_id);
  assert.equal(emailThenBooking.operation, 'updated');
  const customer = db.rows.get('customers/' + booking.customer_id);
  assert.equal(customer.normalizedPhone, '+4512345678');
  assert.equal(customer.normalizedEmail, 'guest@example.test');
  assert.equal([...db.rows.keys()].filter(key => key.startsWith('customers/')).length, 1);
  assert.equal([...db.rows.keys()].filter(key => key.startsWith('integrationConsumerCustomerIdentities/')).length, 1);
  assert.equal([...db.rows.keys()].filter(key => key.startsWith('integrationConsumerCustomerPhoneIdentities/')).length, 1);
});

test('checkout customer lookup resolves email aliases and phone aliases within one brand', async () => {
  const db = memoryDb(new Map([
    ['customers/booking-customer', {
      id: 'booking-customer', brandId: config.brandId,
      email: 'booking@example.test', normalizedEmail: 'booking@example.test',
      emailAliases: ['online@example.test'],
      phone: '+45 12 34 56 78', normalizedPhone: '+4512345678',
    }],
  ]));
  const lookup = loadTs('src/lib/checkout-customer-identity.ts', {
    '@/lib/server/firestore-compat': compatFor(db),
  });
  const match = await lookup.findCheckoutCustomer(
    config.brandId, 'online@example.test', '0045 12 34 56 78',
  );
  assert.equal(match.id, 'booking-customer');
});

test('checkout lookup rejects email and phone matches to different customer records', async () => {
  const db = memoryDb(new Map([
    ['customers/email-customer', {
      id: 'email-customer', brandId: config.brandId,
      emailAliases: ['same@example.test'], normalizedEmail: 'primary@example.test',
    }],
    ['customers/phone-customer', {
      id: 'phone-customer', brandId: config.brandId,
      normalizedEmail: 'other@example.test', normalizedPhone: '+4522222222',
    }],
  ]));
  const lookup = loadTs('src/lib/checkout-customer-identity.ts', {
    '@/lib/server/firestore-compat': compatFor(db),
  });
  await assert.rejects(
    lookup.findCheckoutCustomer(config.brandId, 'same@example.test', '+4522222222'),
    error => error.code === 'customer_identity_conflict',
  );
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

test('manual Omnisend import stops if the provider cursor does not advance', async () => {
  const previous = process.env.ORDERFLY_OMNISEND_BRANDS;
  process.env.ORDERFLY_OMNISEND_BRANDS = JSON.stringify([config]);
  try {
    const now = Date.now();
    const db = memoryDb(new Map([
      ['omnisendContactImportState/' + config.brandId, { backfillComplete: false, after: 'same-cursor', nextAttemptAt: now + 60_000 }],
    ]));
    const result = await runOmnisendContactImportWorker(db, now, () => ({
      verifyBrand: async () => {},
      listContacts: async () => ({ contacts: [], after: 'same-cursor' }),
    }), now + 45_000, { brandId: config.brandId, allowEarly: true });
    assert.equal(result.results[0].status, 'failed');
    assert.equal(result.results[0].error, 'provider_pagination_stalled');
    assert.equal(db.rows.get('omnisendContactImportState/' + config.brandId).after, 'same-cursor');
  } finally {
    if (previous === undefined) delete process.env.ORDERFLY_OMNISEND_BRANDS;
    else process.env.ORDERFLY_OMNISEND_BRANDS = previous;
  }
});

test('manual Omnisend sync has enough budget to finish a page and persist its cursor', async () => {
  const previous = process.env.ORDERFLY_OMNISEND_BRANDS;
  const originalDateNow = Date.now;
  process.env.ORDERFLY_OMNISEND_BRANDS = JSON.stringify([config]);
  const contacts = Array.from({ length: 25 }, (_value, index) =>
    makeContact('page-' + index + '@example.test', 'unsubscribed'),
  );
  const makeProvider = () => ({
    verifyBrand: async () => {},
    listContacts: async () => ({ contacts, after: 'cursor-page-2' }),
  });

  async function runWithBudget(allowEarly) {
    let clock = 0;
    Date.now = () => {
      clock += 1_000;
      return clock;
    };
    try {
      const db = memoryDb();
      const result = await runOmnisendContactImportWorker(
        db,
        1_000,
        makeProvider,
        45_000,
        { brandId: config.brandId, ...(allowEarly ? { allowEarly: true } : {}) },
      );
      return { result, state: db.rows.get('omnisendContactImportState/' + config.brandId) };
    } finally {
      Date.now = originalDateNow;
    }
  }

  try {
    const scheduled = await runWithBudget(false);
    assert.equal(scheduled.result.results[0].status, 'failed');
    assert.equal(scheduled.result.results[0].error, 'import_deadline');
    assert.equal(scheduled.state.after, null);

    const manual = await runWithBudget(true);
    assert.equal(manual.result.results[0].status, 'imported');
    assert.equal(manual.result.results[0].fetched, 25);
    assert.equal(manual.result.results[0].imported, 25);
    assert.equal(manual.result.results[0].skipped, 0);
    assert.equal(manual.result.results[0].conflicts, 0);
    assert.equal(manual.result.results[0].hasMore, true);
    assert.equal(manual.state.after, 'cursor-page-2');
    assert.equal(manual.state.backfillComplete, false);
  } finally {
    Date.now = originalDateNow;
    if (previous === undefined) delete process.env.ORDERFLY_OMNISEND_BRANDS;
    else process.env.ORDERFLY_OMNISEND_BRANDS = previous;
  }
});

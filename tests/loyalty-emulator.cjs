// Run only against isolated local emulators. Never uses service-account credentials.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const admin = require('firebase-admin');
const PROJECT = 'demo-orderfly-loyalty';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9098') throw Error('Local emulators required');
const app = admin.initializeApp({ projectId: PROJECT }, 'loyalty-regression');
const db = app.firestore();
const cache = new Map();
const mocks = { 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db, getAdminApp: () => app } };
function load(file) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const mod = { exports: {} }; cache.set(absolute, mod);
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
    if (name.startsWith('.')) return load(path.resolve(path.dirname(absolute), name) + '.ts');
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}
const model = load('src/lib/loyalty/model.ts');
const rewards = load('src/lib/loyalty/rewards.ts');
const payments = load('src/lib/payments/settlement.ts');
const refunds = load('src/lib/payments/refunds.ts');
const identity = load('src/lib/loyalty/identity.ts');
const program = { ...model.defaultProgram, enabled: true };
let token;
async function client(method, document, bearer) {
  return fetch(`http://127.0.0.1:8088/v1/projects/${PROJECT}/databases/(default)/documents/${document}`, {
    method, headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    ...(method === 'PATCH' ? { body: JSON.stringify({ fields: { balanceOre: { integerValue: '99999999' } } }) } : {}),
  });
}
before(async () => {
  await fetch(`http://127.0.0.1:8088/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await app.auth().createUser({ uid: 'customer', email: 'loyalty@example.test', emailVerified: true, password: 'local-fixture-password' });
  const login = await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-fixture', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'loyalty@example.test', password: 'local-fixture-password', returnSecureToken: true }),
  });
  assert.equal(login.status, 200); token = (await login.json()).idToken;
  await db.doc('brands/b').set({ name: 'Local QA brand' });
  await db.doc('loyalty_programs/b').set({ program });
});
after(async () => { await app.delete(); });
test('client rules deny financial access recursively and preserve unrelated access', async () => {
  const privatePaths = ['loyalty_programs/b', 'loyalty_orders/o', 'loyalty_wallets/w', 'loyalty_wallets/w/entries/e', 'loyalty_audit/a',
    'checkout_customer_capacity/c', 'checkout_discount_capacity/d', 'checkout_customer_discount_capacity/p', 'platform_settings/payment_gateway'];
  for (const doc of privatePaths) await db.doc(doc).set(doc === 'loyalty_programs/b' ? { program } : { balanceOre: 7 });
  for (const bearer of [undefined, token]) {
    for (const document of privatePaths) for (const method of ['GET', 'PATCH', 'DELETE']) {
      const result = await client(method, document, bearer);
      assert.equal(result.status, 403, `${bearer ? 'customer' : 'anonymous'} ${method} ${document}`);
    }
    for (const document of ['loyalty_wallets/new', 'orders/o', 'orders/o/financial/data', 'customers/c', 'customers/c/financial/data', 'platform_settings/loyalty']) {
      for (const method of ['PATCH', 'DELETE']) assert.equal((await client(method, document, bearer)).status, 403, `${method} ${document}`);
    }
    assert.equal((await client('GET', 'brands/b', bearer)).status, 200);
    assert.equal((await client('PATCH', 'qa_unrelated/control', bearer)).status, 200);
  }
  assert.equal((await db.doc('loyalty_wallets/w').get()).data().balanceOre, 7);
});
test('verified identity accepts owner and rejects unverified email and mismatched checkout', async () => {
  assert.equal((await identity.verifiedCustomer(token, 'LOYALTY@example.test')).uid, 'customer');
  await assert.rejects(identity.verifiedCustomer(token, 'different@example.test'));
  await app.auth().updateUser('customer', { emailVerified: false });
  const login = await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-fixture', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'loyalty@example.test', password: 'local-fixture-password', returnSecureToken: true }),
  });
  await assert.rejects(identity.verifiedCustomer((await login.json()).idToken));
  await app.auth().updateUser('customer', { emailVerified: true });
});
test('trusted payment, native transaction contention, cancellation and cumulative refund stay compatible', async () => {
  await db.doc('customers/customer').set({ brandId: 'b', totalOrders: 0, totalSpend: 0 });
  await db.doc('orders/seed').create({ brandId: 'b', locationId: 'l', customerDetails: { id: 'customer' }, totalAmount: 1000, paymentStatus: 'Pending', appliedDiscountId: null, psp: { checkoutSessionId: 'cs_seed' } });
  await rewards.reserveRewards('seed', 'b', 'customer', 0, 100000, 100000, program);
  const paid = { id: 'cs_seed', created: Math.floor(Date.now()/1000), metadata: { orderId: 'seed', brandId: 'b', locationId: 'l' }, payment_status: 'paid', status: 'complete', currency: 'dkk', amount_total: 100000, payment_intent: 'pi_seed' };
  await payments.fulfillPaidSession(paid); await payments.fulfillPaidSession(paid);
  assert.equal((await db.doc('customers/customer').get()).data().totalOrders, 1);
  assert.equal((await rewards.walletView('b', 'customer')).balanceOre, 5000);
  const results = await Promise.allSettled(['a', 'b'].map(id => rewards.reserveRewards(id, 'b', 'customer', 4000, 10000, 10000, program)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, 'real Firestore transactions cannot overspend');
  const winner = results[0].status === 'fulfilled' ? 'a' : 'b';
  await rewards.settleRewards(winner, 'b', false); await rewards.settleRewards(winner, 'b', false);
  assert.equal((await rewards.walletView('b', 'customer')).heldOre, 0);
  const charge = { metadata: paid.metadata, currency: 'dkk', amount: 100000, payment_intent: 'pi_seed', amount_refunded: 40000 };
  await refunds.processRefund(charge); await refunds.processRefund(charge);
  assert.equal((await rewards.walletView('b', 'customer')).balanceOre, 3000);
  await refunds.processRefund({ ...charge, amount_refunded: 100000 }); await refunds.processRefund(charge);
  assert.equal((await rewards.walletView('b', 'customer')).balanceOre, 0);
  assert.equal((await db.doc('customers/customer').get()).data().totalSpend, 0);
  assert.equal((await db.doc('customers/customer').get()).data().totalOrders, 0);
  assert.equal((await rewards.walletView('other-brand', 'customer')).balanceOre, 0);
});

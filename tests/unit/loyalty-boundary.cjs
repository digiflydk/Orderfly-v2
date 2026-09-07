const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, mocks) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(n => n in mocks ? mocks[n] : require(n), mod, mod.exports);
  return mod.exports;
}
test('financial mutations reject missing/revoked/unlisted sessions before accessing data', async () => {
  let cookie, claims = { uid: 'ordinary', email_verified: true }, revoked = false, writes = 0;
  const original = process.env.LOYALTY_ADMIN_UIDS;
  process.env.LOYALTY_ADMIN_UIDS = 'approved';
  try {
    const session = load('src/lib/loyalty/admin-session.ts', {
      'server-only': {}, 'next/headers': { cookies: async () => ({ get: () => cookie }) },
      '@/lib/firebase-admin': { getAdminApp: () => ({ auth: () => ({ verifySessionCookie: async (_, checkRevoked) => {
        assert.equal(checkRevoked, true); if (revoked) throw Error('revoked'); return claims;
      } }) }) },
    });
    const actions = load('src/app/superadmin/sales/orders/actions.ts', {
      'next/cache': { revalidatePath() {} }, '@/lib/loyalty/admin-session': session,
      '@/lib/firebase-admin': { getAdminDb: () => { writes++; throw Error('unexpected database access'); } },
    });
    for (const value of [undefined, { value: 'ordinary-token' }]) {
      cookie = value; assert.equal((await actions.updateOrderStatus('order', 'Delivered')).success, false);
    }
    claims.uid = 'approved'; revoked = true;
    assert.equal((await actions.updateOrderStatus('order', 'Delivered')).success, false);
    revoked = false; claims.email_verified = false;
    assert.equal((await actions.updateOrderStatus('order', 'Delivered')).success, false);
    assert.equal(writes, 0);
    claims.email_verified = true;
    assert.equal((await session.requireFinancialAdmin()).uid, 'approved');
    assert.equal((await actions.updateOrderStatus('order', 'Paid')).success, false);
    assert.equal(writes, 0, 'status field cannot be used as an arbitrary payment mutation');
  } finally {
    if (original === undefined) delete process.env.LOYALTY_ADMIN_UIDS; else process.env.LOYALTY_ADMIN_UIDS = original;
  }
});
test('customer sorting uses computed last purchase and retains customers without purchases', async () => {
  const customers = [{ id: 'z', brandId: 'b' }, { id: 'a', brandId: 'b' }, { id: 'new', brandId: 'b' }];
  const model = load('src/lib/loyalty/model.ts', {});
  const settingsApi = load('src/app/superadmin/loyalty/actions.ts', {
    'next/cache': {}, '@/lib/firebase': { db: {} }, 'firebase/firestore': { doc: () => ({}), getDoc: async () => ({ exists: () => false }) },
    '@/lib/loyalty/model': model, '@/lib/loyalty/identity': {}, '@/lib/firebase-admin': {},
  });
  const api = load('src/app/superadmin/customers/actions.ts', {
    'next/cache': {}, '@/lib/firebase': { db: {} }, '@/lib/firebase-admin': {}, '@/lib/loyalty/admin-session': {},
    '@/lib/loyalty/model': model, '../loyalty/actions': settingsApi,
    'firebase/firestore': { collection: (_, c) => c, query: c => c, getDocs: async c => ({ docs: (c === 'customers' ? customers : [
      { id: 'old', brandId: 'b', customerDetails: { id: 'a' }, paymentStatus: 'Paid', totalAmount: 100, createdAt: new Date('2025-01-01') },
      { id: 'recent', brandId: 'b', customerDetails: { id: 'z' }, paymentStatus: 'Paid', totalAmount: 100, createdAt: new Date('2026-01-01') },
    ]).map(d => ({ id: d.id, data: () => d })) }) },
  });
  assert.deepEqual((await api.getCustomers()).map(c => c.id), ['z', 'a', 'new']);
});
test('runtime readiness keeps a stored enabled program inactive until rules are verified',async()=>{
 const model=load('src/lib/loyalty/model.ts',{}),program={...model.defaultProgram,enabled:true};
 const api=load('src/lib/loyalty/rewards.ts',{'server-only':{},'./model':model,'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>({program})})})})})}});
 const previous=process.env.LOYALTY_FINANCIAL_RULES_READY;
 try {
  delete process.env.LOYALTY_FINANCIAL_RULES_READY;assert.equal((await api.getProgram('b')).enabled,false);
  process.env.LOYALTY_FINANCIAL_RULES_READY='false';assert.equal((await api.getProgram('b')).enabled,false);
  process.env.LOYALTY_FINANCIAL_RULES_READY='true';assert.equal((await api.getProgram('b')).enabled,true);
 } finally {if(previous===undefined)delete process.env.LOYALTY_FINANCIAL_RULES_READY;else process.env.LOYALTY_FINANCIAL_RULES_READY=previous;}
});

import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { knownBaseline, prepareRules, internalCollections, legacyCollections } from '../../scripts/prepare-platform-firestore-rules.mjs';

let env;
const paths = [...internalCollections, ...legacyCollections, 'marketingOrderOutbox', 'brands', 'locations', 'orders', 'customers', 'products', 'discounts', 'standard_discounts', 'checkout_attempts', 'settings'];
before(async () => {
  // No production fallback: require the dedicated local demo emulator explicitly.
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8088');
  env = await initializeTestEnvironment({ projectId: 'demo-orderfly-platform', firestore: {
    host: '127.0.0.1', port: 8088, rules: readFileSync(new URL('../../firestore.access.rules',import.meta.url),'utf8'),
  } });
  await env.withSecurityRulesDisabled(async context => {
    for (const name of paths) {
      await setDoc(doc(context.firestore(), name, 'existing'), { name: 'Fixture' });
      await setDoc(doc(context.firestore(), name, 'existing', 'history', 'entry'), { name: 'Nested' });
    }
  });
});
after(async () => { await env?.cleanup(); });

for (const identity of ['anonymous', 'signed-in', 'admin-claim']) {
  test(`${identity}: internal collections and outbox deny reads, queries and all writes including descendants`, async () => {
    const db = identity === 'anonymous' ? env.unauthenticatedContext().firestore()
      : env.authenticatedContext(identity, { admin: identity === 'admin-claim' }).firestore();
    for (const name of paths) {
      await assertFails(getDocs(collection(db, name)));
      for (const path of [`${name}/existing`, `${name}/existing/history/entry`]) {
        await assertFails(getDoc(doc(db, path)));
        await assertFails(setDoc(doc(db, path + '-new'), { name: 'Create' }));
        await assertFails(updateDoc(doc(db, path), { name: 'Update' }));
        await assertFails(deleteDoc(doc(db, path)));
      }
    }
  });
}

test('trusted server operations can maintain protected catalogue records', async () => {
  await env.withSecurityRulesDisabled(async context => {
    for (const name of paths) {
      const ref = doc(context.firestore(), name, 'server-only');
      await setDoc(ref, { name: 'Server write' });
      assert.equal((await getDoc(ref)).data().name, 'Server write');
      await deleteDoc(ref);
    }
  });
});

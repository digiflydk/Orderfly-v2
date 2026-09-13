import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { knownBaseline, prepareRules, internalCollections, legacyCollections } from '../../scripts/prepare-platform-firestore-rules.mjs';

let env;
const paths = [...internalCollections, ...legacyCollections, 'marketingOrderOutbox', 'brands', 'orders'];
before(async () => {
  // No production fallback: require the dedicated local demo emulator explicitly.
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8088');
  env = await initializeTestEnvironment({ projectId: 'demo-orderfly-platform', firestore: {
    host: '127.0.0.1', port: 8088, rules: prepareRules(knownBaseline),
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
    for (const name of [...internalCollections, 'marketingOrderOutbox']) {
      await assertFails(getDocs(collection(db, name)));
      for (const path of [`${name}/existing`, `${name}/existing/history/entry`]) {
        await assertFails(getDoc(doc(db, path)));
        await assertFails(setDoc(doc(db, path + '-new'), { name: 'Create' }));
        await assertFails(updateDoc(doc(db, path), { name: 'Update' }));
        await assertFails(deleteDoc(doc(db, path)));
      }
    }
  });
  test(`${identity}: legacy catalogue reads survive, all direct writes reject`, async () => {
    const db = identity === 'anonymous' ? env.unauthenticatedContext().firestore()
      : env.authenticatedContext(identity, { admin: identity === 'admin-claim' }).firestore();
    for (const name of legacyCollections) {
      await assertSucceeds(getDocs(collection(db, name)));
      for (const path of [`${name}/existing`, `${name}/existing/history/entry`]) {
        await assertSucceeds(getDoc(doc(db, path)));
        await assertFails(setDoc(doc(db, path + '-new'), { name: 'Create' }));
        await assertFails(updateDoc(doc(db, path), { name: 'Update' }));
        await assertFails(deleteDoc(doc(db, path)));
      }
    }
  });
}

test('unrelated legacy operations retain their baseline behavior', async () => {
  const db = env.unauthenticatedContext().firestore();
  for (const name of ['brands', 'orders']) {
    await assertSucceeds(getDocs(collection(db, name)));
    const ref = doc(db, name, 'temporary');
    await assertSucceeds(setDoc(ref, { name: 'Create' }));
    await assertSucceeds(updateDoc(ref, { name: 'Update' }));
    await assertSucceeds(deleteDoc(ref));
  }
});

test('trusted server operations can maintain protected catalogue records', async () => {
  await env.withSecurityRulesDisabled(async context => {
    for (const name of [...internalCollections, ...legacyCollections]) {
      const ref = doc(context.firestore(), name, 'server-only');
      await setDoc(ref, { name: 'Server write' });
      assert.equal((await getDoc(ref)).data().name, 'Server write');
      await deleteDoc(ref);
    }
  });
});

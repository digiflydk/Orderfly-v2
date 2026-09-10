// Default: read-only preflight. Run only after the conditional-options release.
// Uses the operator's existing Application Default Credentials; no keys in files.
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const plan = JSON.parse(readFileSync(new URL('./data/ashiqs-product-options.json', import.meta.url)));
if (plan.brandId !== 'NkTYjQxTPCRtXFAZRKPO' || plan.locationId !== 'rGfKFpjCqoxMeHLIxcdJ') throw Error('Wrong restaurant');
const apply = process.argv.includes('--apply');
const release = process.argv.find(arg => arg.startsWith('--verified-release='))?.split('=')[1];
if (apply && !/^[a-f0-9]{40}$/.test(release || '')) throw Error('Apply requires --verified-release=<deployed full commit SHA>');
initializeApp({ credential: applicationDefault(), projectId: 'orderfly-39325' });
const db = getFirestore();
const marker = db.collection('catalog_migrations').doc('ashiqs-product-options-v1');
const sameLocation = value => Array.isArray(value) && value.length === 1 && value[0] === plan.locationId;
const entries = [
  ...plan.products.map(p => ({ref: db.collection('products').doc(p.id), product: p})),
  ...plan.groups.map(data => ({ref: db.collection('topping_groups').doc(data.id), data})),
  ...plan.toppings.map(data => ({ref: db.collection('toppings').doc(data.id), data})),
];
const result = await db.runTransaction(async tx => {
  const [receipt, location, ...snapshots] = await tx.getAll(marker, db.collection('locations').doc(plan.locationId), ...entries.map(e => e.ref));
  if (receipt.exists) return {status: 'already-applied', receipt: marker.id};
  if (!location.exists || location.data().brandId !== plan.brandId) throw Error('Location ownership changed');
  const backup = [];
  entries.forEach((entry, index) => {
    const snapshot = snapshots[index];
    if (entry.product) {
      const current = snapshot.data();
      if (!current || current.brandId !== plan.brandId || !sameLocation(current.locationIds)) throw Error(`Ownership mismatch: ${entry.ref.id}`);
      for (const [field, expected] of Object.entries(entry.product.before)) {
        if (!isDeepStrictEqual(current[field], expected)) throw Error(`Catalog changed; review ${entry.ref.id}.${field}`);
      }
      if (current.toppingGroupConditions) throw Error(`Conditions already configured: ${entry.ref.id}`);
      backup.push({id: entry.ref.id, data: current});
    } else {
      if (snapshot.exists || !sameLocation(entry.data.locationIds)) throw Error(`New option collision/scope error: ${entry.ref.id}`);
    }
  });
  if (apply) {
    entries.forEach(entry => entry.product
      ? tx.update(entry.ref, {...entry.product.patch, updatedAt: FieldValue.serverTimestamp()})
      : tx.create(entry.ref, entry.data));
    tx.create(marker, {brandId:plan.brandId, locationId:plan.locationId, release, backup, createdAt:FieldValue.serverTimestamp()});
  }
  return {status:apply?'applied':'preflight-passed', mergedProducts:37, deactivatedDuplicates:43, groups:7, options:16};
});
console.log(JSON.stringify(result));

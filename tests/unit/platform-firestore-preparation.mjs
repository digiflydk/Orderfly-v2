import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knownBaseline, prepareRules } from '../../scripts/prepare-platform-firestore-rules.mjs';

test('accepts reviewed baseline with harmless whitespace/comments', () => {
  const candidate = prepareRules(knownBaseline);
  assert.equal(prepareRules('// operator export\n' + knownBaseline.replace('service', '/* saved rules */ service')), candidate);
});

test('refuses changed access policies, extra overlapping grants and truncated exports', () => {
  for (const source of [
    knownBaseline.replace("collection != 'marketingOrderOutbox'", "collection != 'marketingOrderOutbox' && request.auth != null"),
    knownBaseline.replace("'marketingOrderOutbox'", "'marketingOutbox'"),
    knownBaseline.replace('allow read, write: if false;', 'allow read, write: if true;'),
    knownBaseline.replace('service cloud.firestore {', 'service cloud.firestore { match /{all=**} { allow read, write: if true; }'),
    knownBaseline.slice(0, -2), '',
  ]) assert.throws(() => prepareRules(source));
});

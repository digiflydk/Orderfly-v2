const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

const ESMERALDA = 'oeypKaMyYcQjIwaa1PtV';
function fixture(initial = {}) {
  const docs = new Map(Object.entries({ [`brands/${ESMERALDA}`]: { name: 'Esmeralda' }, ...initial }));
  const ref = path => ({ path });
  const db = {
    collection: c => ({ doc: id => ref(`${c}/${id}`) }),
    runTransaction: async fn => fn({
      get: async r => ({ exists: docs.has(r.path), data: () => docs.get(r.path) }),
      create: (r, v) => { if (docs.has(r.path)) throw Error('exists'); docs.set(r.path, v); },
      set: (r, v) => docs.set(r.path, { ...docs.get(r.path), ...v }),
    }),
  };
  let activeForm = true;
  const mod = loadTs('src/lib/feedback/esmeralda-booking-setup.ts', {
    'server-only': {},
    '@/lib/firebase-admin': { getAdminDb: () => db, getAdminFieldValue: () => ({ serverTimestamp: () => 'now' }) },
    './question-store': { readActiveQuestionsForBrand: async (brandId, type, language) => activeForm && type === 'booking' && language === 'da' ? { id: 'x' } : null },
  });
  return { docs, db, mod, setActive: value => { activeForm = value; } };
}

test('#144 Esmeralda gets one brand-scoped, booking-only Danish questionnaire with all eight questions', async () => {
  const f = fixture();
  assert.equal(await f.mod.ensureBookingFeedbackQuestions(ESMERALDA, { db: f.db }), true);
  const saved = f.docs.get('feedbackQuestionsVersion/esmeralda-booking-da-v1');
  assert.equal(saved.scope, 'brand');
  assert.equal(saved.brandId, ESMERALDA);
  assert.deepEqual(saved.orderTypes, ['booking']);
  assert.equal(saved.language, 'da');
  assert.deepEqual(saved.questions.map(q => q.questionId), ['rating', 'food', 'service', 'wait', 'atmosphere', 'value', 'nps', 'comment']);
  assert.deepEqual(saved.questions.filter(q => q.isRequired).map(q => q.questionId), ['rating', 'food', 'service']);
});

test('#144 retries never overwrite operator edits or a deliberate deactivation', async () => {
  const edited = { versionLabel: 'Operator edit', isActive: false, scope: 'brand', brandId: ESMERALDA, language: 'da', orderTypes: ['booking'], questions: [] };
  const f = fixture({ 'feedbackQuestionsVersion/esmeralda-booking-da-v1': edited });
  f.setActive(false);
  assert.equal(await f.mod.ensureBookingFeedbackQuestions(ESMERALDA, { db: f.db }), false);
  assert.deepEqual(f.docs.get('feedbackQuestionsVersion/esmeralda-booking-da-v1'), edited);
});

test('#144 other brands are not given the Esmeralda form, and a missing brand is not seeded', async () => {
  const other = fixture();
  other.setActive(false);
  assert.equal(await other.mod.ensureBookingFeedbackQuestions('other-brand', { db: other.db }), false);
  assert.equal(other.docs.has('feedbackQuestionsVersion/esmeralda-booking-da-v1'), false);
  const missing = fixture();
  missing.docs.delete(`brands/${ESMERALDA}`);
  await missing.mod.ensureBookingFeedbackQuestions(ESMERALDA, { db: missing.db });
  assert.equal(missing.docs.has('feedbackQuestionsVersion/esmeralda-booking-da-v1'), false);
});

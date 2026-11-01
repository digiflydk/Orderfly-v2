const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, responseForm } = require('../helpers/feedback-fixture.cjs');
const { loadTs } = require('../helpers/load-ts.cjs');
const BRAND = 'oeypKaMyYcQjIwaa1PtV';
const NOW = Date.parse('2026-11-01T21:05:00+01:00');
const scope = { brandId: BRAND, locationId: 'l' };
function setup(t) {
  const previous = Date.now; Date.now = () => NOW; t.after(() => { Date.now = previous; });
  process.env.ORDERFLY_FEEDBACK_TOKEN_SECRET = 'synthetic-dully-token-secret-at-least-32-characters';
  process.env.ORDERFLY_NOTIFICATION_ENDPOINT = 'https://mail.example.test/send';
  process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
  process.env.ORDERFLY_NOTIFICATION_SECRET = 'synthetic-mail-secret-at-least-32-characters';
  const f = fixture();
  f.records.set('feedbackSettings/' + BRAND, { emailEnabled: true });
  f.records.set('brands/' + BRAND, { name: 'Esmeralda', status: 'active' });
  f.records.set('locations/l', { name: 'Amager', brandId: BRAND, isActive: true });
  f.records.get('feedbackQuestionsVersion/v1').orderTypes = ['pickup', 'delivery', 'booking'];
  const rights = { edit: true, brandIds: null };
  f.mocks['./access'] = {
    requireFeedbackAccess: async permission => { if (permission === 'feedback:edit' && !rights.edit) throw Error('Denied'); return { uid: 'qa', permissions: rights.edit ? ['feedback:view', 'feedback:edit'] : ['feedback:view'], brandIds: rights.brandIds }; },
    assertFeedbackBrand: (access, id) => { if (access.brandIds && !access.brandIds.includes(id)) throw Error('Denied'); },
    canEditFeedbackBrand: () => rights.edit,
  };
  return { ...f, rights, adminDully: loadTs('src/lib/feedback/dully-admin.ts', f.mocks), worker: loadTs('src/lib/feedback/dully-worker.ts', f.mocks), source: loadTs('src/lib/feedback/dully-source.ts', f.mocks), contract: loadTs('src/lib/feedback/dully-contract.ts', f.mocks) };
}
const row = (overrides = {}) => ({ externalOrderId: '2594108', orderNumber: '2154', externalRestaurantId: 'restaurant1', email: 'guest@example.test', experienceType: 'delivery', orderedAt: '2026-10-31T19:00:00+01:00', completedAt: '2026-10-31T20:00:00+01:00', status: 'completed', paymentStatus: 'paid', ...overrides });
async function configure(f) { await f.adminDully.configureDullyFeedback({ ...scope, accountId: 'account1', restaurantId: 'restaurant1' }); }
async function approved(f) {
  await configure(f);
  const result = await f.adminDully.sendDullyFeedbackTest({ ...scope, experienceType: 'delivery' });
  const sends = [];
  await f.worker.runDullyFeedbackWorker(() => ({ eligible: async () => true, send: async (...args) => sends.push(args) }), NOW);
  assert.equal(sends.length, 1); assert.equal(sends[0][2], 'ok@esmeraldapizza.dk');
  await f.adminDully.approveDullyFeedback({ ...scope, testSourceId: result.sourceId });
  await f.adminDully.setDullyFeedbackPaused({ ...scope, paused: false });
  return result.sourceId;
}
test('Dully daily schedule handles Copenhagen DST and after21 carryover', () => {
  const c = loadTs('src/lib/feedback/dully-contract.ts');
  assert.equal(new Date(c.dullyDueAt('2026-10-31T19:00:00+01:00')).toISOString(), '2026-10-31T20:00:00.000Z');
  assert.equal(new Date(c.dullyDueAt('2027-06-01T20:00:00+02:00')).toISOString(), '2027-06-01T19:00:00.000Z');
  assert.equal(new Date(c.dullyDueAt('2026-10-31T21:01:00+01:00')).toISOString(), '2026-11-01T20:00:00.000Z');
  assert.equal(c.dullyEligible(row({ orderedAt: '2026-10-30T20:00:00+01:00' }), NOW), false);
  assert.equal(c.dullyEligible(row({ paymentStatus: 'refunded' }), NOW), false);
});
test('import is bounded, immutable, tenant checked, idempotent and does not create sales/customers/mail jobs', async t => {
  const f = setup(t); await configure(f);
  await Promise.all([f.adminDully.importDullyFeedback({ ...scope, rows: [row()] }), f.adminDully.importDullyFeedback({ ...scope, rows: [row()] })]);
  assert.equal([...f.records.keys()].filter(k => k.startsWith('dullyFeedbackSources/')).length, 1);
  assert.equal([...f.records.keys()].filter(k => k.startsWith('orders/')).length, 1);
  assert.equal([...f.records.keys()].filter(k => k.startsWith('customers/')).length, 1);
  assert.equal([...f.records.keys()].filter(k => k.startsWith('feedbackMailJobs/')).length, 0);
  await assert.rejects(f.adminDully.importDullyFeedback({ ...scope, rows: [row({ email: 'other@example.test' })] }));
  await assert.rejects(f.adminDully.importDullyFeedback({ ...scope, rows: [row({ externalRestaurantId: 'wrong' })] }));
  await assert.rejects(f.adminDully.configureDullyFeedback({ ...scope, accountId: 'new-alias', restaurantId: 'restaurant1' }));
  await assert.rejects(f.adminDully.getDullyFeedbackState(BRAND, 'foreign'));
  f.rights.edit = false; await assert.rejects(f.adminDully.importDullyFeedback({ ...scope, rows: [row()] }));
  await assert.rejects(f.adminDully.sendDullyFeedbackTest({ ...scope, brandId: 'other', experienceType: 'pickup' }));
});
test('test-first approval is server enforced and changed forms invalidate it', async t => {
  const f = setup(t); await configure(f);
  const testRow = await f.adminDully.sendDullyFeedbackTest({ ...scope, experienceType: 'delivery' });
  await assert.rejects(f.adminDully.approveDullyFeedback({ ...scope, testSourceId: testRow.sourceId }));
  await assert.rejects(f.adminDully.setDullyFeedbackPaused({ ...scope, paused: false }));
  await f.worker.runDullyFeedbackWorker(() => ({ eligible: async () => true, send: async () => {} }), NOW);
  await f.adminDully.approveDullyFeedback({ ...scope, testSourceId: testRow.sourceId });
  f.records.get('feedbackQuestionsVersion/v1').questions = [{ questionId: 'rating', type: 'stars', label: 'Changed', isRequired: true }];
  await assert.rejects(f.adminDully.setDullyFeedbackPaused({ ...scope, paused: false }));
});
test('customer backlog sends once, concurrent workers and reimport cannot duplicate', async t => {
  const f = setup(t); await approved(f);
  await f.adminDully.importDullyFeedback({ ...scope, rows: [row()] });
  let sent = 0; const provider = () => ({ eligible: async () => true, send: async () => { sent++; } });
  await Promise.all([f.worker.runDullyFeedbackWorker(provider, NOW), f.worker.runDullyFeedbackWorker(provider, NOW)]);
  assert.equal(sent, 1);
  await f.adminDully.importDullyFeedback({ ...scope, rows: [row()] });
  await f.worker.runDullyFeedbackWorker(provider, NOW);
  assert.equal(sent, 1);
});
test('pause defers, refund during provider preflight prevents dispatch, future completion stays excluded', async t => {
  const f = setup(t); await approved(f);
  await f.adminDully.importDullyFeedback({ ...scope, rows: [row()] });
  await f.adminDully.setDullyFeedbackPaused({ ...scope, paused: true });
  let sent = 0; const provider = () => ({ eligible: async () => true, send: async () => { sent++; } });
  const result = await f.worker.runDullyFeedbackWorker(provider, NOW); assert.equal(result.deferred, 1); assert.equal(sent, 0);
  await f.adminDully.setDullyFeedbackPaused({ ...scope, paused: false });
  await f.worker.runDullyFeedbackWorker(() => ({ eligible: async () => { await f.adminDully.importDullyFeedback({ ...scope, rows: [row({ paymentStatus: 'refunded' })] }); return true; }, send: async () => { sent++; } }), NOW + 6 * 60000);
  assert.equal(sent, 0);
  await assert.rejects(f.adminDully.importDullyFeedback({ ...scope, rows: [row({ externalOrderId: 'future', completedAt: '2026-11-02T20:00:00+01:00' })] }));
});
test('unknown provider outcome is terminal and cannot approve or blind resend test', async t => {
  const f = setup(t); await configure(f);
  const r = await f.adminDully.sendDullyFeedbackTest({ ...scope, experienceType: 'pickup' });
  let sent = 0;
  await f.worker.runDullyFeedbackWorker(() => ({ eligible: async () => true, send: async () => { sent++; throw Error('network timeout'); } }), NOW);
  assert.equal(f.records.get('dullyFeedbackSources/' + r.sourceId).mailState, 'uncertain');
  await assert.rejects(f.adminDully.approveDullyFeedback({ ...scope, testSourceId: r.sourceId }));
  await assert.rejects(f.adminDully.sendDullyFeedbackTest({ ...scope, experienceType: 'pickup' }));
  await f.worker.runDullyFeedbackWorker(() => ({ eligible: async () => true, send: async () => { sent++; } }), NOW + 999999);
  assert.equal(sent, 1);
});
test('signed Dully invitation rejects tampering, ordinary order tokens and source revocation', async t => {
  const f = setup(t), id = await approved(f), src = f.records.get('dullyFeedbackSources/' + id);
  const token = f.source.signDullyInvitation(id, src.expiresAt);
  assert.equal((await f.source.resolveDullyInvitation(token)).id, id);
  assert.equal(await f.source.resolveDullyInvitation(token + 'x'), null);
  assert.equal(await f.source.resolveDullyInvitation(f.invitations.signOrderFeedbackInvitation(id, src.expiresAt)), null);
  src.paymentStatus = 'refunded'; assert.equal(await f.source.resolveDullyInvitation(token), null);
});
test('test reply exercises real form submission but does not enter feedback, reviews or mail jobs', async t => {
  const f = setup(t), id = await approved(f), src = f.records.get('dullyFeedbackSources/' + id);
  const token = f.source.signDullyInvitation(id, src.expiresAt);
  await assert.rejects(f.public.submitFeedbackAction(null, responseForm({ sourceType: 'dully_order', sourceId: id, customerId: id, invitationToken: token })), e => e.digest === 'NEXT_REDIRECT');
  assert.equal([...f.records.keys()].filter(k => k.startsWith('dullyFeedbackTests/')).length, 1);
  assert.equal([...f.records.keys()].filter(k => k.startsWith('feedback/')).length, 0);
  assert.equal([...f.records.keys()].filter(k => k.startsWith('feedbackMailJobs/')).length, 0);
  assert.equal(f.cookieJar.size, 0);
  assert.equal(f.records.get('dullyFeedbackSources/' + id).invitationStatus, 'submitted');
  const state = await f.adminDully.getDullyFeedbackState(BRAND, 'l');
  assert.equal(typeof state.rows[0].updatedAt, 'number');
  assert.equal(state.test.sourceId, id);
});
test('history overflow keeps configuration controls available with explicit bounded history', async t => {
  const f = setup(t); await configure(f);
  const scopeId = f.contract.dullyScopeId(BRAND, 'l');
  for (let i = 0; i < 510; i++) f.records.set('dullyFeedbackSources/h' + i, { ...row(), id: 'h' + i, scopeId, historyKey: scopeId + ':' + (NOW + i), updatedAt: NOW + i, mailState: 'pending' });
  const state = await f.adminDully.getDullyFeedbackState(BRAND, 'l');
  assert.equal(state.rows.length, 500); assert.equal(state.hasMore, true); assert.equal(state.configuration.accountId, 'account1');
  await f.adminDully.setDullyFeedbackPaused({ ...scope, paused: true });
});
test('form changed during preflight invalidates approval before send', async t => {
  const f = setup(t); await approved(f); await f.adminDully.importDullyFeedback({ ...scope, rows: [row()] });
  let sent = 0;
  await f.worker.runDullyFeedbackWorker(() => ({ eligible: async () => { f.records.get('feedbackQuestionsVersion/v1').questions[0].label = 'Edited'; return true; }, send: async () => { sent++; } }), NOW);
  assert.equal(sent, 0);
  assert.equal((await f.adminDully.getDullyFeedbackState(BRAND, 'l')).configuration.approvedAt, null);
});
test('stale evidence requires reimport and more than10 due orders drain without loss', async t => {
  const f = setup(t); await approved(f);
  const rows = Array.from({ length: 23 }, (_, i) => row({ externalOrderId: 'batch' + i, orderNumber: String(i) }));
  await f.adminDully.importDullyFeedback({ ...scope, rows });
  const sources = [...f.records.values()].filter(v => v.sourceType === 'dully_order' && !v.isTest);
  sources[0].lastVerifiedAt = NOW - 25 * 3600000;
  const staleState=await f.adminDully.getDullyFeedbackState(BRAND,'l');
  const staleRow=staleState.rows.find(r=>r.id===sources[0].id);
  assert.equal(staleRow.waitingReason,'stale_source');assert.equal(staleRow.externalOrderId,sources[0].externalOrderId);assert.equal(staleRow.lastVerifiedAt,NOW-25*3600000);
  const sends = []; const provider = () => ({ eligible: async () => true, send: async (...args) => sends.push(args[3].sourceId) });
  for (let i = 0; i < 3; i++) await f.worker.runDullyFeedbackWorker(provider, NOW);
  assert.equal(sends.length, 22); assert.equal(new Set(sends).size, 22);
  await f.adminDully.importDullyFeedback({ ...scope, rows });
  assert.equal((await f.adminDully.getDullyFeedbackState(BRAND,'l')).rows.find(r=>r.id===sources[0].id).waitingReason,'waiting');
  await f.worker.runDullyFeedbackWorker(provider, NOW);
  assert.equal(sends.length, 23); assert.equal(new Set(sends).size, 23);
});
test('known retryable provider rejection retries at most3; expired dispatch lease becomes uncertain', async t => {
  const f = setup(t); await configure(f);
  const { sourceId } = await f.adminDully.sendDullyFeedbackTest({ ...scope, experienceType: 'delivery' });
  let sends = 0;
  const provider = () => ({ eligible: async () => true, send: async () => { sends++; throw new f.mailProvider.FeedbackMailError('provider_429', false, true); } });
  for (let i = 0; i < 4; i++) await f.worker.runDullyFeedbackWorker(provider, NOW + i * 6 * 60000);
  assert.equal(sends, 3); assert.equal(f.records.get('dullyFeedbackSources/' + sourceId).mailState, 'failed');
  await f.adminDully.sendDullyFeedbackTest({ ...scope, experienceType: 'delivery' });
  const source = f.records.get('dullyFeedbackSources/' + sourceId); source.mailState = 'dispatching'; source.dueAt = NOW - 1;
  await f.worker.runDullyFeedbackWorker(provider, NOW);
  assert.equal(sends, 3); assert.equal(source.mailState, 'dispatching');
  assert.equal(f.records.get('dullyFeedbackSources/' + sourceId).mailState, 'uncertain');
});
test('normal Dully feedback enters reporting and preserves admin notification, duplicate is ignored', async t => {
  const f = setup(t); await approved(f); await f.adminDully.importDullyFeedback({ ...scope, rows: [row()] });
  await f.worker.runDullyFeedbackWorker(() => ({ eligible: async () => true, send: async () => {} }), NOW);
  const source = [...f.records.values()].find(v => v.sourceType === 'dully_order' && !v.isTest);
  const token = f.source.signDullyInvitation(source.id, source.expiresAt);
  process.env.ORDERFLY_FEEDBACK_ADMIN_NOTIFICATIONS = JSON.stringify({ [BRAND]: { organizationId: '22222222-2222-4222-8222-222222222222', email: 'owner@example.test' } });
  t.after(() => { delete process.env.ORDERFLY_FEEDBACK_ADMIN_NOTIFICATIONS; });
  const form = responseForm({ sourceType: 'dully_order', sourceId: source.id, customerId: source.id, invitationToken: token });
  for (let i = 0; i < 2; i++) await assert.rejects(f.public.submitFeedbackAction(null, form), e => e.digest === 'NEXT_REDIRECT');
  const feedback = [...f.records.entries()].filter(([k]) => k.startsWith('feedback/'));
  assert.equal(feedback.length, 1); assert.equal(feedback[0][1].sourceType, 'dully_order');
  const jobs = [...f.records.entries()].filter(([k]) => k.startsWith('feedbackMailJobs/'));
  assert.equal(jobs.length, 1); assert.equal(jobs[0][1].kind, 'adminNotification');
});

test('master email switch suppresses customer dispatch while an explicit test is allowed', async t => {
 const f=setup(t); f.records.set('feedbackSettings/'+BRAND,{emailEnabled:false}); await configure(f);
 const {sourceId}=await f.adminDully.sendDullyFeedbackTest({...scope,experienceType:'delivery'}); let sent=0;
 const provider=()=>({eligible:async()=>true,send:async()=>{sent++;}});
 await f.worker.runDullyFeedbackWorker(provider,NOW);assert.equal(sent,1);
 await f.adminDully.approveDullyFeedback({...scope,testSourceId:sourceId});
 await assert.rejects(f.adminDully.setDullyFeedbackPaused({...scope,paused:false}));
 f.records.set('feedbackSettings/'+BRAND,{emailEnabled:true});await f.adminDully.setDullyFeedbackPaused({...scope,paused:false});
 await f.adminDully.importDullyFeedback({...scope,rows:[row()]});
 f.records.set('feedbackSettings/'+BRAND,{emailEnabled:false});
 await f.worker.runDullyFeedbackWorker(provider,NOW);assert.equal(sent,1);
 assert.equal((await f.adminDully.getDullyFeedbackState(BRAND,'l')).masterEmailEnabled,false);
});

test('expired accepted test can be renewed once under concurrent clicks without retrying uncertain outcomes', async t => {
 const f=setup(t); const originalId=await approved(f);
 const original=f.records.get('dullyFeedbackSources/'+originalId); original.invitationStatus='submitted';
 const later=NOW+31*86400000; Date.now=()=>later;
 const requests=await Promise.all([f.adminDully.sendDullyFeedbackTest({...scope,experienceType:'delivery'}),f.adminDully.sendDullyFeedbackTest({...scope,experienceType:'delivery'})]);
 assert.notEqual(requests[0].sourceId,originalId);assert.equal(requests[0].sourceId,requests[1].sourceId);
 const replacement=f.records.get('dullyFeedbackSources/'+requests[0].sourceId);
 assert.equal(replacement.mailState,'pending');assert.equal(replacement.invitationStatus,'active');assert.ok(replacement.expiresAt>later);
 assert.notEqual(replacement.eventId,original.eventId);assert.equal(original.mailState,'accepted');
 await assert.rejects(f.adminDully.approveDullyFeedback({...scope,testSourceId:originalId}));
 let sends=0;await f.worker.runDullyFeedbackWorker(()=>({eligible:async()=>true,send:async()=>{sends++;}}),later);assert.equal(sends,1);
 await f.adminDully.approveDullyFeedback({...scope,testSourceId:replacement.id});
 assert.equal((await f.adminDully.getDullyFeedbackState(BRAND,'l')).configuration.approvedTestSourceId,replacement.id);
 const latest=f.records.get('dullyFeedbackSources/'+replacement.id);latest.mailState='uncertain';latest.expiresAt=later-1;
 await assert.rejects(f.adminDully.sendDullyFeedbackTest({...scope,experienceType:'delivery'}));
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('dullyFeedbackSources/')).length,2);
});

test('real Dully reply above threshold gets the Google/Trustpilot step once; below threshold and test replies never do', async t => {
  const review = { emailEnabled: true, externalReviewsEnabled: true, externalReviewsMinRating: 4.7, googleReviewUrl: 'https://g.page/r/example/review', trustpilotReviewUrl: 'https://www.trustpilot.com/evaluate/example.com' };
  const submitOnce = async (f, form) => assert.rejects(f.public.submitFeedbackAction(null, form), e => e.digest === 'NEXT_REDIRECT');
  const prepared = async (rows) => {
    const f = setup(t); f.records.set('feedbackSettings/' + BRAND, review);
    const testId = await approved(f); await f.adminDully.importDullyFeedback({ ...scope, rows });
    await f.worker.runDullyFeedbackWorker(() => ({ eligible: async () => true, send: async () => {} }), NOW);
    const receipt = loadTs('src/lib/feedback/external-review-receipt.ts', f.mocks);
    return { f, testId, receipt };
  };
  const formFor = (f, source, rating) => responseForm({ sourceType: 'dully_order', sourceId: source.id, customerId: source.id, invitationToken: f.source.signDullyInvitation(source.id, source.expiresAt), responses: JSON.stringify({ rating: { answer: rating } }) });

  const { f, testId, receipt } = await prepared([row()]);
  const source = [...f.records.values()].find(v => v.sourceType === 'dully_order' && !v.isTest);
  await submitOnce(f, formFor(f, source, 5));
  assert.deepEqual(await receipt.readExternalReviewReceipt(BRAND), { googleReviewUrl: review.googleReviewUrl, trustpilotReviewUrl: review.trustpilotReviewUrl });
  const saved = [...f.records.entries()].filter(([k]) => k.startsWith('feedback/'));
  assert.equal(saved.length, 1); assert.equal(saved[0][1].sourceType, 'dully_order'); assert.equal(saved[0][1].externalReviewReceipt.hash.length, 64);
  await submitOnce(f, formFor(f, source, 5));
  assert.equal(f.cookieJar.size, 0); assert.equal(await receipt.readExternalReviewReceipt(BRAND), null);

  const testSource = f.records.get('dullyFeedbackSources/' + testId);
  await submitOnce(f, formFor(f, testSource, 5));
  assert.equal(f.cookieJar.size, 0);

  const low = await prepared([row({ externalOrderId: '2594109', orderNumber: '2155' })]);
  const lowSource = [...low.f.records.values()].find(v => v.sourceType === 'dully_order' && !v.isTest);
  await submitOnce(low.f, formFor(low.f, lowSource, 4));
  assert.equal(low.f.cookieJar.size, 0); assert.equal(await low.receipt.readExternalReviewReceipt(BRAND), null);
});

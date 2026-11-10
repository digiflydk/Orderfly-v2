const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('../helpers/feedback-fixture.cjs');
const { loadTs } = require('../helpers/load-ts.cjs');
const BRAND = 'brand1', FEEDBACK = 'f'.repeat(64), NOW = Date.parse('2026-11-10T12:00:00+01:00');
function setup(t, { access = { edit: true, brandIds: null } } = {}) {
  process.env.ORDERFLY_NOTIFICATION_ENDPOINT = 'https://mail.example.test/send';
  process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
  process.env.ORDERFLY_NOTIFICATION_SECRET = 'synthetic-mail-secret-at-least-32-characters';
  process.env.ORDERFLY_FEEDBACK_TOKEN_SECRET = 'synthetic-feedback-token-secret-at-least-32-characters';
  process.env.ORDERFLY_FEEDBACK_ADMIN_NOTIFICATIONS = JSON.stringify({ [BRAND]: { organizationId: '33333333-3333-4333-8333-333333333333', email: 'admin@example.test' } });
  const f = fixture();
  f.records.set('brands/' + BRAND, { name: 'Esmeralda Pizza', status: 'active' });
  f.records.set('feedback/' + FEEDBACK, { brandId: BRAND, locationId: 'l', sourceType: 'dully_order', sourceId: 'src1', customerId: 'src1', comment: 'Posegebyr uden pose' });
  f.records.set('dullyFeedbackSources/src1', { brandId: BRAND, email: 'guest@example.test', customerName: 'Daniel Ørum' });
  const rights = { ...access };
  f.mocks['./access'] = {
    requireFeedbackAccess: async permission => { if (permission === 'feedback:edit' && !rights.edit) throw Error('Denied'); return { uid: 'staff1', permissions: [], brandIds: rights.brandIds }; },
    assertFeedbackBrand: (a, id) => { if (a.brandIds && !a.brandIds.includes(id)) throw Error('Denied'); },
    canEditFeedbackBrand: () => rights.edit,
  };
  const sent = [];
  const request = async (_url, init) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: 'm', status: 'accepted' }), { status: 202 }); };
  return { ...f, rights, sent, request, lib: loadTs('src/lib/feedback/replies.ts', f.mocks) };
}
const docs = (f, prefix) => [...f.records.entries()].filter(([k]) => k.startsWith(prefix + '/')).map(([, v]) => v);

test('a Claude draft is only stored; approval sends the exact text to the server-resolved guest and keeps only a token hash', async t => {
  const f = setup(t);
  await f.lib.saveReplyDraft({ feedbackId: FEEDBACK, body: 'Første udkast', origin: 'assistant' });
  await f.lib.saveReplyDraft({ feedbackId: FEEDBACK, body: 'Rettet udkast', origin: 'assistant' });
  assert.equal(docs(f, 'feedbackReplyMessages').length, 1); assert.equal(f.sent.length, 0);
  let thread = await f.lib.getReplyThread(FEEDBACK);
  assert.equal(thread.draft.body, 'Rettet udkast'); assert.equal(thread.draft.origin, 'assistant'); assert.equal(thread.recipient, 'g•••@example.test');
  await f.lib.approveAndSendReply({ feedbackId: FEEDBACK, body: 'Hej\nVi har refunderet 20 kr.' }, f.request);
  assert.equal(f.sent.length, 1);
  const mail = f.sent[0];
  assert.equal(mail.template_key, 'orderfly.feedback.reply'); assert.equal(mail.recipient.email, 'guest@example.test'); assert.equal(mail.recipient.name, 'Daniel');
  assert.equal(mail.variables.message, 'Hej\nVi har refunderet 20 kr.'); assert.equal(mail.related_entity.type, 'feedback_reply');
  const token = mail.variables.reply_url.match(/^https:\/\/orderfly\.dk\/feedback\/reply#token=([a-f0-9]{64})$/)[1];
  assert.ok(!JSON.stringify([...f.records.values()]).includes(token), 'raw token must not be stored');
  const [message] = docs(f, 'feedbackReplyMessages'); assert.equal(message.state, 'sent'); assert.equal(message.approvedBy, 'staff1'); assert.equal(message.origin, 'assistant');
  thread = await f.lib.getReplyThread(FEEDBACK); assert.equal(thread.draft, null); assert.equal(thread.messages.length, 1); assert.equal(thread.status, 'open');
});

test('guest can read and answer with the personal link; staff get a notice; closing revokes the link', async t => {
  const f = setup(t);
  await f.lib.approveAndSendReply({ feedbackId: FEEDBACK, body: 'Svar fra os' }, f.request);
  const token = f.sent[0].variables.reply_url.split('token=')[1];
  const view = await f.lib.loadGuestThread(token);
  assert.equal(view.brandName, 'Esmeralda Pizza'); assert.deepEqual(view.messages.map(m => [m.direction, m.body]), [['staff', 'Svar fra os']]);
  assert.ok(!JSON.stringify(view).includes('staff1'));
  await f.lib.submitGuestReply({ token, body: 'Tak for svaret' }, f.request);
  assert.equal(f.sent[1].template_key, 'orderfly.feedback.customer_reply'); assert.equal(f.sent[1].recipient.email, 'admin@example.test');
  assert.equal(f.sent[1].variables.admin_url, 'https://orderfly.dk/superadmin/feedback/' + FEEDBACK);
  const staffView = await f.lib.getReplyThread(FEEDBACK); assert.deepEqual(staffView.messages.map(m => m.direction), ['staff', 'guest']);
  await assert.rejects(f.lib.submitGuestReply({ token: 'a'.repeat(64), body: 'x' }, f.request), /udløbet/);
  await assert.rejects(f.lib.submitGuestReply({ token: 'not-a-token', body: 'x' }, f.request), /udløbet/);
  await f.lib.setReplyThreadStatus(FEEDBACK, 'closed');
  assert.equal(await f.lib.loadGuestThread(token), null);
  await assert.rejects(f.lib.submitGuestReply({ token, body: 'efter lukning' }, f.request), /udløbet|lukket/);
  await assert.rejects(f.lib.approveAndSendReply({ feedbackId: FEEDBACK, body: 'x' }, f.request), /lukket/);
});

test('links expire after 90 days and guests are rate limited', async t => {
  const f = setup(t);
  await f.lib.approveAndSendReply({ feedbackId: FEEDBACK, body: 'Svar' }, f.request);
  const token = f.sent[0].variables.reply_url.split('token=')[1];
  assert.equal(await f.lib.loadGuestThread(token, Date.now() + 91 * 86400000), null);
  for (let i = 0; i < 10; i++) await f.lib.submitGuestReply({ token, body: 'besked ' + i }, f.request);
  await assert.rejects(f.lib.submitGuestReply({ token, body: 'for mange' }, f.request), /mange beskeder/);
});

test('access: view-only and foreign-brand staff cannot draft or send; anonymous dine-in cannot be answered', async t => {
  const f = setup(t);
  f.rights.edit = false;
  await assert.rejects(f.lib.saveReplyDraft({ feedbackId: FEEDBACK, body: 'x' })); await assert.rejects(f.lib.approveAndSendReply({ feedbackId: FEEDBACK, body: 'x' }, f.request));
  f.rights.edit = true; f.rights.brandIds = ['other'];
  await assert.rejects(f.lib.getReplyThread(FEEDBACK)); await assert.rejects(f.lib.approveAndSendReply({ feedbackId: FEEDBACK, body: 'x' }, f.request));
  f.rights.brandIds = null;
  f.records.set('feedback/' + 'd'.repeat(64), { brandId: BRAND, sourceType: 'dine_in', comment: 'anon' });
  const anon = await f.lib.getReplyThread('d'.repeat(64)); assert.equal(anon.canReply, false); assert.match(anon.reason, /anonym/);
  await assert.rejects(f.lib.approveAndSendReply({ feedbackId: 'd'.repeat(64), body: 'x' }, f.request), /anonym/);
  assert.equal(f.sent.length, 0);
});

test('an uncertain provider result is recorded and never retried automatically', async t => {
  const f = setup(t);
  await assert.rejects(f.lib.approveAndSendReply({ feedbackId: FEEDBACK, body: 'Svar' }, async () => { throw new TypeError('network'); }), /uafklaret/);
  const [message] = docs(f, 'feedbackReplyMessages'); assert.equal(message.state, 'uncertain');
});

test('customer history links Dully feedback by e-mail and lists the conversation', async t => {
  const f = setup(t);
  f.records.set('customers/c1', { brandId: BRAND, email: 'other@example.test', emailAliases: ['guest@example.test'] });
  const history = loadTs('src/lib/feedback/customer-history.ts', f.mocks);
  const rows = await history.customerFeedbackHistory(BRAND, 'c1');
  assert.deepEqual(rows.map(r => r.id), [FEEDBACK]);
  await f.lib.approveAndSendReply({ feedbackId: FEEDBACK, body: 'Svar' }, f.request);
  const threads = await f.lib.customerReplyHistory(BRAND, [FEEDBACK]);
  assert.equal(threads[FEEDBACK][0].body, 'Svar');
  f.records.set('customers/c2', { brandId: 'other', email: 'guest@example.test' });
  assert.deepEqual(await history.customerFeedbackHistory(BRAND, 'c2'), []);
});

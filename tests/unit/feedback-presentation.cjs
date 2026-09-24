const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {feedbackVisitDate,feedbackThankYouHref,isEsmeraldaFeedback,ESMERALDA_BRAND_ID}=loadTs('src/lib/feedback/presentation.ts');
test('booking time uses Copenhagen including winter and summer offsets',()=>{
 assert.match(feedbackVisitDate('2026-09-24T10:40:00Z','da'),/12[.:]40/);
 assert.match(feedbackVisitDate('2026-01-24T10:40:00Z','da'),/11[.:]40/);
 assert.equal(feedbackVisitDate('invalid','da'),'');
});
test('thank-you URL carries public brand and normalized language only',()=>{
 assert.equal(feedbackThankYouHref('b','da'),'/feedback/thank-you?brand=b&lang=da');
 assert.equal(feedbackThankYouHref('b','en'),'/feedback/thank-you?brand=b&lang=en');
 assert.equal(feedbackThankYouHref('b','unknown'),'/feedback/thank-you?brand=b&lang=da');
 assert.equal(isEsmeraldaFeedback(ESMERALDA_BRAND_ID),true);
 assert.equal(isEsmeraldaFeedback('other-brand'),false);
});

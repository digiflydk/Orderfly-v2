const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {fixture}=require('../helpers/feedback-fixture.cjs');
const {externalReviewSettingsSchema:schema,externalReviewSettings:settings,eligibleExternalReviewLinks:eligible}=loadTs('src/lib/feedback/external-review-settings.ts');
const config={externalReviewsEnabled:true,externalReviewsMinRating:4.7,googleReviewUrl:'https://g.page/r/example/review',trustpilotReviewUrl:'https://dk.trustpilot.com/review/example.dk'};
test('defaults disabled; strict threshold and missing scores fail closed',()=>{
 assert.equal(settings({}).externalReviewsEnabled,false);assert.equal(settings({}).externalReviewsMinRating,4.7);
 for(const score of [undefined,null,'5',NaN,Infinity,-1,0,4.69,4.7,5.01])assert.equal(eligible(config,score),null,String(score));
 assert.deepEqual(eligible(config,4.71),{googleReviewUrl:config.googleReviewUrl,trustpilotReviewUrl:config.trustpilotReviewUrl});
 assert.ok(eligible(config,5));assert.equal(eligible({...config,externalReviewsMinRating:5},5),null);
 assert.equal(eligible({...config,externalReviewsEnabled:false},5),null);
 assert.equal(eligible({...config,googleReviewUrl:'',trustpilotReviewUrl:''},5),null);
 assert.equal(eligible({...config,externalReviewsMinRating:'4.7'},5),null);
 assert.equal(eligible({...config,googleReviewUrl:'javascript:alert(1)'},5),null);
 assert.deepEqual(eligible({...config,trustpilotReviewUrl:''},5),{googleReviewUrl:config.googleReviewUrl,trustpilotReviewUrl:''});
});
test('valid provider URLs normalize whitespace and reject lookalikes, credentials and redirect endpoints',()=>{
 for(const url of ['https://g.page/r/abc/review','https://maps.app.goo.gl/abc','https://goo.gl/maps/abc','https://search.google.com/local/writereview?placeid=abc','https://www.google.com/maps/place/Example','https://www.google.dk/maps?cid=123'])assert.equal(schema.safeParse({googleReviewUrl:url}).success,true,url);
 for(const url of ['https://trustpilot.com/review/example.dk','https://www.trustpilot.com/evaluate/example.dk','https://dk.trustpilot.com/review/example.dk'])assert.equal(schema.safeParse({trustpilotReviewUrl:url}).success,true,url);
 for(const url of ['http://g.page/r/abc/review','javascript:alert(1)','https://google.com.evil.test/maps','https://evil.test/google.com/maps','https://user:password@www.google.com/maps','https://www.google.com:444/maps','https://www.google.com/url?q=https://evil.test','https://www.google.com/maps#fragment','https://g.page/abc','https://trustpilot.com/review/example.dk'])assert.equal(schema.safeParse({googleReviewUrl:url}).success,false,url);
 for(const url of ['https://trustpilot.com.evil.test/review/example.dk','https://user@trustpilot.com/review/example.dk','https://trustpilot.com/redirect?url=https://evil.test'])assert.equal(schema.safeParse({trustpilotReviewUrl:url}).success,false,url);
 assert.equal(schema.parse({googleReviewUrl:'  '+config.googleReviewUrl+'  '}).googleReviewUrl,config.googleReviewUrl);
 for(const score of [-1,5.1,NaN,Infinity,'4.7'])assert.equal(schema.safeParse({externalReviewsMinRating:score}).success,false);
});
test('settings persist only for authorized brand editors and retain unrelated fields',async()=>{
 const f=fixture();f.auth.uid='qa-editor';f.records.set('feedbackSettings/b',{publicReviewsEnabled:true,language:'da'});
 await f.settings.writeFeedbackSettings({brandId:'b',...config});
 const saved=f.records.get('feedbackSettings/b');assert.equal(saved.publicReviewsEnabled,true);assert.equal(saved.updatedBy,'qa-editor');assert.ok(saved.updatedAt);
 assert.equal((await f.settings.readFeedbackSettings('b')).externalReviewsMinRating,4.7);
 await f.settings.writeFeedbackSettings({brandId:'b',externalReviewsEnabled:false});assert.equal(f.records.get('feedbackSettings/b').googleReviewUrl,config.googleReviewUrl);
 f.auth.uid='qa-viewer';await assert.rejects(f.settings.writeFeedbackSettings({brandId:'b',externalReviewsEnabled:true}));
 f.auth.uid='qa-editor';await assert.rejects(f.settings.writeFeedbackSettings({brandId:'other',...config}));
 assert.equal(f.records.has('feedbackSettings/other'),false);
 f.auth.cookie=false;await assert.rejects(f.settings.writeFeedbackSettings({brandId:'b',...config}));
});
test('invalid and empty-link activation cannot persist; partial edits validate effective settings',async()=>{
 const f=fixture();
 await assert.rejects(f.settings.writeFeedbackSettings({brandId:'b',externalReviewsEnabled:true}));
 await assert.rejects(f.settings.writeFeedbackSettings({brandId:'b',...config,googleReviewUrl:'https://evil.test/'}));
 assert.equal(f.records.has('feedbackSettings/b'),false);
 await f.settings.writeFeedbackSettings({brandId:'b',...config,trustpilotReviewUrl:''});
 await assert.rejects(f.settings.writeFeedbackSettings({brandId:'b',googleReviewUrl:''}));
 assert.equal(f.records.get('feedbackSettings/b').googleReviewUrl,config.googleReviewUrl);
 await f.settings.writeFeedbackSettings({brandId:'b',externalReviewsEnabled:false,googleReviewUrl:''});
 assert.equal(f.records.get('feedbackSettings/b').googleReviewUrl,'');
});

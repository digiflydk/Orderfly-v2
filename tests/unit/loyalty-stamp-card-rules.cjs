const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const rules=loadTs('src/lib/loyalty/stamp-card/rules.ts');
const active=(changes={})=>({...rules.defaultProgramSettings('Esmeralda'),active:true,reward:{type:'free_product',productIds:['pizza'],categoryIds:[]},
  rewardDescription:'Gratis pizza',terms:'Vilkår',consentText:'Ja tak til nyhedsbrev på e-mail. Du kan altid afmelde dig.',...changes});
const buy=(settings,changes={})=>rules.evaluatePurchase(settings,{channel:{source:'counter',channel:'dine_in'},amountOre:10_000,discountUsed:false,stampsToday:0,...changes});

test('defaults follow the specification and start inactive',()=>{
  const s=rules.defaultProgramSettings('Esmeralda');
  assert.equal(s.active,false);assert.equal(s.name,'Esmeralda Club');assert.equal(s.stampsRequired,8);assert.equal(s.minimumAmountOre,10_000);
  assert.equal(s.cardValidityMonths,6);assert.equal(s.rewardValidityMonths,3);assert.equal(s.crossLocation,true);
  assert.equal(s.discountedOrdersQualify,false);assert.equal(s.sessionDays,180);assert.deepEqual(s.counterChannels,['dine_in','takeaway']);
  assert.equal(s.maxStampsPerDay,null);assert.equal(s.counterIdleMinutes,5);assert.ok(rules.programSettingsSchema.safeParse(s).success);
});

test('settings saved before the counter idle period existed still parse, with 5 minutes',()=>{
  const {counterIdleMinutes,...stored}=active();
  const parsed=rules.programSettingsSchema.safeParse(stored);
  assert.ok(parsed.success);assert.equal(parsed.data.counterIdleMinutes,5);
  assert.equal(rules.programSettingsSchema.parse(active({counterIdleMinutes:60})).counterIdleMinutes,60);
});

test('an active program requires reward, texts and at least one channel',()=>{
  assert.ok(rules.programSettingsSchema.safeParse(active()).success);
  for(const changes of [{reward:null},{rewardDescription:''},{terms:''},{consentText:' '},{counterChannels:[],orderTypes:[]}])
    assert.equal(rules.programSettingsSchema.safeParse(active(changes)).success,false,JSON.stringify(changes));
  assert.ok(rules.programSettingsSchema.safeParse(active({counterChannels:[],orderTypes:['delivery']})).success);
});

test('settings reject non-positive values and unknown or third-party channels',()=>{
  for(const changes of [{stampsRequired:0},{stampsPerPurchase:0},{cardValidityMonths:0},{rewardValidityMonths:0},{sessionDays:0},{counterIdleMinutes:0},{counterIdleMinutes:61},{counterIdleMinutes:2.5},{counterIdleMinutes:null},
    {minimumAmountOre:-1},{stampsRequired:1.5},{maxStampsPerDay:0},{counterChannels:['wolt']},{counterChannels:['uber_eats']},
    {orderTypes:['wolt']},{counterChannels:['dine_in','dine_in']},{reward:{type:'percentage',percent:101}},
    {reward:{type:'free_product',productIds:[],categoryIds:[]}},{extra:true}])
    assert.equal(rules.programSettingsSchema.safeParse(active(changes)).success,false,JSON.stringify(changes));
});

test('purchases below the minimum never qualify; the boundary does',()=>{
  const s=active();
  assert.deepEqual(buy(s,{amountOre:9_999}),{qualifies:false,reason:'below_minimum'});
  assert.deepEqual(buy(s,{amountOre:10_000}),{qualifies:true,stamps:1});
  assert.deepEqual(buy(s,{amountOre:Number.NaN}),{qualifies:false,reason:'below_minimum'});
  assert.deepEqual(buy(active({minimumAmountOre:0}),{amountOre:0}),{qualifies:true,stamps:1});
});

test('an inactive program gives no stamps',()=>{
  assert.deepEqual(buy(active({active:false})),{qualifies:false,reason:'program_inactive'});
});

test('only configured channels qualify, at the counter and from Orderfly orders',()=>{
  const takeawayOnly=active({counterChannels:['takeaway'],orderTypes:['delivery']});
  assert.deepEqual(buy(takeawayOnly),{qualifies:false,reason:'channel_not_allowed'});
  assert.equal(buy(takeawayOnly,{channel:{source:'counter',channel:'takeaway'}}).qualifies,true);
  assert.deepEqual(buy(takeawayOnly,{channel:{source:'order',channel:'pickup'}}),{qualifies:false,reason:'channel_not_allowed'});
  assert.equal(buy(takeawayOnly,{channel:{source:'order',channel:'delivery'}}).qualifies,true);
  for(const channel of ['wolt','uber_eats'])
    for(const source of ['counter','order'])assert.deepEqual(buy(active({counterChannels:['dine_in','takeaway'],orderTypes:['pickup','delivery']}),{channel:{source,channel}}),{qualifies:false,reason:'channel_not_allowed'});
});

test('discounted purchases follow the setting in both directions',()=>{
  assert.deepEqual(buy(active(),{discountUsed:true}),{qualifies:false,reason:'discount_excluded'});
  assert.deepEqual(buy(active({discountedOrdersQualify:true}),{discountUsed:true}),{qualifies:true,stamps:1});
  assert.equal(buy(active(),{discountUsed:false}).qualifies,true);
});

test('daily stamp limit is optional and counts stamps per purchase',()=>{
  assert.equal(buy(active(),{stampsToday:1000}).qualifies,true);
  const limited=active({maxStampsPerDay:3,stampsPerPurchase:2});
  assert.deepEqual(buy(limited,{stampsToday:1}),{qualifies:true,stamps:2});
  assert.deepEqual(buy(limited,{stampsToday:2}),{qualifies:false,reason:'daily_limit'});
});

test('the Nth stamp earns a reward and starts a new card, with overflow',()=>{
  assert.deepEqual(rules.applyStamps({stamps:6,stampsRequired:8},1,8),{rewards:0,card:{stamps:7,stampsRequired:8},newCard:false});
  assert.deepEqual(rules.applyStamps({stamps:7,stampsRequired:8},1,8),{rewards:1,card:{stamps:0,stampsRequired:8},newCard:true});
  assert.deepEqual(rules.applyStamps({stamps:7,stampsRequired:8},3,8),{rewards:1,card:{stamps:2,stampsRequired:8},newCard:true});
  assert.deepEqual(rules.applyStamps({stamps:0,stampsRequired:1},3,1),{rewards:3,card:{stamps:0,stampsRequired:1},newCard:true});
  assert.throws(()=>rules.applyStamps({stamps:0,stampsRequired:8},0,8),/invalid_stamp_count/);
});

test('changed settings apply forward only: a running card keeps its requirement',()=>{
  // The card was issued at 8; the program now requires 10. It completes at 8 and the next card needs 10.
  assert.deepEqual(rules.applyStamps({stamps:7,stampsRequired:8},1,10),{rewards:1,card:{stamps:0,stampsRequired:10},newCard:true});
  assert.deepEqual(rules.applyStamps({stamps:7,stampsRequired:10},1,6),{rewards:0,card:{stamps:8,stampsRequired:10},newCard:false});
});

test('manual removal cannot go below zero',()=>{
  assert.deepEqual(rules.removeStamps({stamps:3,stampsRequired:8},2),{stamps:1,stampsRequired:8});
  for(const removed of [0,4,1.5])assert.throws(()=>rules.removeStamps({stamps:3,stampsRequired:8},removed),/invalid_stamp_count/);
});

test('expiry uses calendar months and each stamp resets the card deadline',()=>{
  assert.equal(rules.cardExpiresAt(new Date('2026-03-15T10:00:00Z'),6).toISOString(),'2026-09-15T10:00:00.000Z');
  assert.equal(rules.cardExpiresAt(new Date('2026-08-31T10:00:00Z'),6).toISOString(),'2027-02-28T10:00:00.000Z');
  assert.equal(rules.rewardExpiresAt(new Date('2026-11-30T23:00:00Z'),3).toISOString(),'2027-02-28T23:00:00.000Z');
  assert.ok(rules.cardExpiresAt(new Date('2026-05-01T00:00:00Z'),6)>rules.cardExpiresAt(new Date('2026-04-01T00:00:00Z'),6));
});

test('a reward can be redeemed once, before expiry and at an allowed location',()=>{
  const now=new Date('2026-10-20T12:00:00Z'),reward={status:'available',expiresAt:new Date('2026-10-21T00:00:00Z'),locationId:null};
  assert.deepEqual(rules.canRedeem(reward,now,'a1'),{allowed:true});
  assert.deepEqual(rules.canRedeem({...reward,status:'redeemed'},now,'a1'),{allowed:false,reason:'not_available'});
  assert.deepEqual(rules.canRedeem({...reward,status:'cancelled'},now,'a1'),{allowed:false,reason:'not_available'});
  assert.deepEqual(rules.canRedeem({...reward,expiresAt:now},now,'a1'),{allowed:false,reason:'expired'});
  assert.deepEqual(rules.canRedeem({...reward,locationId:'a2'},now,'a1'),{allowed:false,reason:'wrong_location'});
});

test('without cross-location validity a card binds to its first stamp location',()=>{
  assert.deepEqual(rules.stampLocation(true,{stamps:3,locationId:null},'a2'),{allowed:true,locationId:null});
  assert.deepEqual(rules.stampLocation(false,{stamps:0,locationId:null},'a1'),{allowed:true,locationId:'a1'});
  assert.deepEqual(rules.stampLocation(false,{stamps:2,locationId:'a1'},'a1'),{allowed:true,locationId:'a1'});
  assert.deepEqual(rules.stampLocation(false,{stamps:2,locationId:'a1'},'a2'),{allowed:false,reason:'wrong_location'});
});

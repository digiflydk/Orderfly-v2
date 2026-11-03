const test = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

// Exercise the actual draft schema without booting Firebase or sending a prize.
const source = pathToFileURL(path.resolve('src/lib/games/scratch-card.ts')).href;
function validate(payload) {
  const script = `import(${JSON.stringify(source)}).then(m=>process.stdout.write(JSON.stringify(m.scratchCardDraftSchema.safeParse(${JSON.stringify(payload)}).success)))`;
  return JSON.parse(execFileSync(process.execPath,['--no-warnings','--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'}));
}
const base = {brandId:'brand_a',title:'Skrab her',instruction:'Afslør resultatet',revealText:'Testresultat',placement:'selected',paths:['/menu'],prizes:[{name:'Pizza',type:'item',value:0,probabilityPercent:10,maxWinners:100}]};
test('campaign dates reject invalid order and malformed timestamps',()=>{
  assert.equal(validate({...base,campaignName:'Efterår',startsAt:'2026-10-01T10:00:00.000Z',endsAt:'2026-10-01T10:00:00.000Z'}),false);
  assert.equal(validate({...base,campaignName:'Efterår',startsAt:'2026-10-02T10:00:00.000Z',endsAt:'2026-10-01T10:00:00.000Z'}),false);
  assert.equal(validate({...base,startsAt:'2026-10-01',endsAt:null}),false);
  assert.equal(validate({...base,campaignName:'Efterår',startsAt:'2026-10-01T10:00:00.000Z',endsAt:'2026-10-02T10:00:00.000Z'}),true);
});
test('campaign windows open at start, close at end, and adjacent bookings do not overlap',()=>{
  const schedule=pathToFileURL(path.resolve('src/lib/games/schedule.ts')).href;
  const script=`import(${JSON.stringify(schedule)}).then(m=>{const a={startsAt:'2026-10-01T10:00:00Z',endsAt:'2026-10-02T10:00:00Z'},b={startsAt:'2026-10-02T10:00:00Z',endsAt:'2026-10-03T10:00:00Z'};process.stdout.write(JSON.stringify({before:m.campaignStatus('live',a,Date.parse(a.startsAt)-1),start:m.campaignStatus('live',a,Date.parse(a.startsAt)),end:m.campaignStatus('live',a,Date.parse(a.endsAt)),adjacent:m.overlaps(a,b),overlap:m.overlaps(a,{...b,startsAt:'2026-10-02T09:00:00Z'})}))})`;
  assert.deepEqual(JSON.parse(execFileSync(process.execPath,['--no-warnings','--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'})),{before:'scheduled',start:'live',end:'ended',adjacent:false,overlap:true});
});
test('Danish calendar input converts across daylight saving time',()=>{
  const dates=pathToFileURL(path.resolve('src/lib/games/dates.ts')).href;
  const script=`import(${JSON.stringify(dates)}).then(m=>{let gap=false;try{m.copenhagenInstant('2026-03-29T02:30')}catch{gap=true}process.stdout.write(JSON.stringify({summer:m.copenhagenInstant('2026-07-01T12:00'),winter:m.copenhagenInstant('2026-12-01T12:00'),gap}))})`;
  assert.deepEqual(JSON.parse(execFileSync(process.execPath,['--no-warnings','--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'})),{summer:'2026-07-01T10:00:00.000Z',winter:'2026-12-01T11:00:00.000Z',gap:true});
});
test('a selected placement requires at least one explicit page',()=>{
  assert.equal(validate({...base,paths:[]}),false);
  assert.equal(validate(base),true);
});
test('page paths reject external URLs, double slashes and duplicates',()=>{
  for (const paths of [['https://example.com'],['//other'],['/menu','/menu'],['/menu?token=x']])
    assert.equal(validate({...base,paths}),false);
});
test('shared Promotions codes require a supported website discount and external origins are exact',()=>{
  const shared={...base,prizes:[{name:'Ti procent',type:'percent',value:10,probabilityPercent:10,maxWinners:100,codeMode:'shared',sharedCode:'SAVE10',redemption:'website'}],allowedOrigins:['https://www.example.com']};
  assert.equal(validate(shared),true);
  assert.equal(validate({...shared,prizes:[{...shared.prizes[0],sharedCode:undefined}]}),false);
  assert.equal(validate({...shared,prizes:[{...shared.prizes[0],redemption:'restaurant'}]}),false);
  assert.equal(validate({...shared,allowedOrigins:['https://www.example.com/path']}),false);
});
test('redemption channels support a product on Orderfly and external-only uploaded codes',()=>{
  const prize={name:'Pizza',type:'item',value:0,probabilityPercent:10,maxWinners:100,codeMode:'generated',redemptionChannels:['restaurant','orderfly','external'],productId:'pizza_01'};
  assert.equal(validate({...base,prizes:[prize]}),true);
  assert.equal(validate({...base,prizes:[{...prize,productId:undefined}]}),false);
  assert.equal(validate({...base,prizes:[{...prize,codeMode:'uploaded'}]}),false);
  assert.equal(validate({...base,prizes:[{...prize,codeMode:'uploaded',redemptionChannels:['restaurant','external'],productId:undefined}]}),true);
});
test('public game payload never exposes shared codes or email settings',()=>{
  const script=`import(${JSON.stringify(source)}).then(m=>{const game=m.scratchCardDraftSchema.parse(${JSON.stringify({...base,prizes:[{name:'Ti procent',type:'percent',value:10,probabilityPercent:10,maxWinners:100,codeMode:'shared',sharedCode:'SAVE10',redemption:'website'}],emailSubject:'Subject',emailMessage:'Secret email body',allowedOrigins:['https://www.example.com']})});process.stdout.write(JSON.stringify(m.publicScratchGame(game)))})`;
  const publicGame=JSON.parse(execFileSync(process.execPath,['--no-warnings','--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'}));
  assert.equal(publicGame.prizes[0].sharedCode,undefined);
  assert.equal(publicGame.emailSubject,undefined);
  assert.equal(publicGame.emailMessage,undefined);
  assert.equal(publicGame.allowedOrigins,undefined);
});
test('configured odds and winner caps cannot exceed campaign limits',()=>{
  const settings={...base,cardsPerPlay:3,totalCardLimit:50,prizes:[
    {name:'Dessert',type:'item',value:0,probabilityPercent:60,maxWinners:20},
    {name:'Rabat',type:'percent',value:10,probabilityPercent:41,maxWinners:20},
  ]};
  assert.equal(validate(settings),false);
  assert.equal(validate({...settings,prizes:[{...settings.prizes[0],probabilityPercent:10,maxWinners:51}]}),false);
  assert.equal(validate({...settings,prizes:[{...settings.prizes[0],probabilityPercent:10,maxWinners:20}]}),true);
  const valid={...settings,prizes:[{...settings.prizes[0],probabilityPercent:10,maxWinners:20}]};
  assert.equal(validate({...valid,cardsPerPlay:9}),true);
  assert.equal(validate({...valid,cardsPerPlay:10}),false);
});
test('Esmeralda test game draws one outcome per play with 10/25/65 boundaries',()=>{
  const board = pathToFileURL(path.resolve('src/lib/games/scratch-card-preview.ts')).href;
  const script = `Promise.all([import(${JSON.stringify(source)}),import(${JSON.stringify(board)})]).then(([config,preview])=>{const game=config.esmeraldaScratchTest('esmeralda');const rolls=[0,.0999,.1,.3499,.35,.9999];process.stdout.write(JSON.stringify({game,boards:rolls.map(roll=>preview.drawScratchBoard(game.prizes,3,game.revealText,roll))}));})`;
  const {game,boards}=JSON.parse(execFileSync(process.execPath,['--no-warnings','--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'}));
  assert.equal(game.cardsPerPlay,3);
  assert.deepEqual(game.prizes.map(p=>p.probabilityPercent),[10,25,65]);
  assert.deepEqual(boards.map(b=>b[0]),['Pizza','Pizza','Tiramisu','Tiramisu','Pommes frites','Pommes frites']);
  for(const b of boards)assert.equal(new Set(b).size,1);
});

test('no win never displays a matching prize when winner cap is exhausted',()=>{
  const board=pathToFileURL(path.resolve('src/lib/games/scratch-card-preview.ts')).href;
  const script=`import(${JSON.stringify(board)}).then(m=>process.stdout.write(JSON.stringify([m.drawNoWinBoard(3,'Intet'),m.drawNoWinBoard(1,'Intet')])))`;
  const [three,one]=JSON.parse(execFileSync(process.execPath,['--no-warnings','--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'}));
  assert.equal(new Set(three).size,3);assert.deepEqual(one,['Intet']);
});
test('boards use prize names or plain no-win text, never decorative heart or star symbols',()=>{
  const board=pathToFileURL(path.resolve('src/lib/games/scratch-card-preview.ts')).href;
  const script=`import(${JSON.stringify(board)}).then(m=>process.stdout.write(JSON.stringify(m.drawWinBoard('Pommes frites',9,.33,['Pizza','Tiramisu','Pommes frites'].map(name=>({name}))))))`;
  const symbols=JSON.parse(execFileSync(process.execPath,['--no-warnings','--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'}));
  const allowed=new Set(['Pizza','Tiramisu','Pommes frites','Prøv igen','Ingen gevinst','Næste gang','Tæt på','Ærgerligt']);
  assert.ok(symbols.every(s=>allowed.has(s)));
  assert.ok(symbols.every(s=>!/[♥♡★☆♦◆]/.test(s)));
});

test('one ticket of 3, 6 or 9 fields wins with exactly three matching symbols and never shows a second match',()=>{
  const board=pathToFileURL(path.resolve('src/lib/games/scratch-card-preview.ts')).href;
  const script=`import(${JSON.stringify(board)}).then(m=>{const sets=[['Pizza'],['Pizza','Tiramisu','Pommes frites'],['Pizza','Tiramisu','Pommes frites','Burger','Pasta']].map(names=>names.map(name=>({name})));const out=[];for(const prizes of sets)for(const count of [3,6,9])for(const roll of [0,.13,.42,.77,.9999])out.push({count,won:m.drawWinBoard(prizes[0].name,count,roll,prizes),lost:m.drawNoWinBoard(count,'Intet',prizes,'',roll),winner:prizes[0].name});process.stdout.write(JSON.stringify(out))})`;
  const rows=JSON.parse(execFileSync(process.execPath,['--no-warnings','--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'}));
  const counts=b=>b.reduce((o,s)=>(o[s]=(o[s]||0)+1,o),{});
  for(const {count,won,lost,winner} of rows){
    assert.equal(won.length,count);assert.equal(lost.length,count);
    const w=counts(won),l=counts(lost);
    assert.equal(w[winner],3);
    assert.ok(Object.entries(w).every(([symbol,n])=>symbol===winner||n<=2));
    assert.ok(Object.values(l).every(n=>n<=2));
    if(count===3)assert.equal(new Set(lost).size,3);
  }
  const placements=new Set(rows.filter(r=>r.count===9).map(r=>r.won.map((s,i)=>s===r.winner?i:'').join('')));
  assert.ok(placements.size>1,'winning symbols are not always in the same positions');
});
test('admin preview test plays are allowed on draft, test, scheduled, live and paused campaigns but not ended ones',()=>{
  const schedule=pathToFileURL(path.resolve('src/lib/games/schedule.ts')).href;
  const script=`import(${JSON.stringify(schedule)}).then(m=>{const now=Date.parse('2026-10-02T12:00:00Z'),open={startsAt:null,endsAt:null},future={startsAt:'2026-10-03T00:00:00Z',endsAt:null},past={startsAt:null,endsAt:'2026-10-01T00:00:00Z'};process.stdout.write(JSON.stringify({draft:m.testPlayAllowed('draft',open,now),test:m.testPlayAllowed('test',open,now),live:m.testPlayAllowed('live',open,now),scheduled:m.testPlayAllowed('live',future,now),paused:m.testPlayAllowed('paused',open,now),ended:m.testPlayAllowed('ended',open,now),expired:m.testPlayAllowed('live',past,now)}))})`;
  assert.deepEqual(JSON.parse(execFileSync(process.execPath,['--no-warnings','--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'})),{draft:true,test:true,live:true,scheduled:true,paused:true,ended:false,expired:false});
});

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

test('five prize products fill three tickets while exactly one ticket wins',()=>{
  const board=pathToFileURL(path.resolve('src/lib/games/scratch-card-preview.ts')).href;
  const script=`import(${JSON.stringify(board)}).then(m=>{const prizes=['Pizza','Tiramisu','Pommes frites','Burger','Pasta'].map(name=>({name}));process.stdout.write(JSON.stringify({won:m.drawWinBoard('Pizza',9,.42,prizes),lost:m.drawNoWinBoard(9,'Intet',prizes)}))})`;
  const {won,lost}=JSON.parse(execFileSync(process.execPath,['--no-warnings','--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'}));
  assert.equal(won.length,9);
  assert.equal(won.filter(symbol=>symbol==='Pizza').length,3);
  assert.equal(lost.length,9);
  const products=new Set(['Pizza','Tiramisu','Pommes frites','Burger','Pasta']);
  assert.ok(won.every(symbol=>products.has(symbol)));
  assert.ok(lost.every(symbol=>products.has(symbol)));
  const winningTickets=[0,3,6].filter(start=>new Set(won.slice(start,start+3)).size===1);
  assert.equal(winningTickets.length,1);
  for(const start of [0,3,6])assert.equal(new Set(lost.slice(start,start+3)).size,3);
});

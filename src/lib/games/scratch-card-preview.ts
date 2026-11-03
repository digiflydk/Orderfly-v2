import type { ScratchCardDraft } from './scratch-card';
type Prize = ScratchCardDraft['prizes'][number];

// A play shows one ticket with 3, 6 or 9 fields. Three identical prize symbols
// anywhere on the ticket win; every other symbol appears at most twice, so a
// board never shows an accidental second match. Plain filler texts make up the
// remaining fields when a game has too few prize names.
const FILLERS=['Prøv igen','Ingen gevinst','Næste gang','Tæt på','Ærgerligt'];

function shuffle<T>(items:T[],seed:number):T[] {
  const result=[...items];
  let state=(Math.floor(Math.abs(seed)*2**32)>>>0)||1;
  for(let i=result.length-1;i>0;i--){
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    const j=state%(i+1);
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}
function filler(count:number,prizes:Prize[],excluded:string,total=count):string[] {
  const names=[...new Set(prizes.map(prize=>prize.name).filter(name=>name!==excluded))];
  const pool=[...names,...FILLERS.filter(text=>!names.includes(text)&&text!==excluded)];
  // Small boards use distinct symbols; larger boards allow a near miss (two of a kind).
  const perSymbol=total<=3?1:2,fields:string[]=[];
  for(const symbol of pool){
    for(let n=0;n<perSymbol&&fields.length<count;n++)fields.push(symbol);
    if(fields.length>=count)break;
  }
  return fields;
}
export function drawNoWinBoard(count:number,noWinText:string,prizes:Prize[]=[],excludedPrize='',seed=0):string[] {
  if(count===1)return [noWinText];
  return shuffle(filler(count,prizes,excludedPrize),seed);
}
export function drawWinBoard(prizeName:string,count:number,roll:number,prizes:Prize[]=[]):string[] {
  const matches=Math.min(3,count);
  return shuffle([...Array(matches).fill(prizeName),...filler(count-matches,prizes,prizeName,count)],roll);
}
// Preview samples one outcome per play. The public server uses the same
// boundaries with a cryptographic roll and enforces winner caps in a transaction.
export function drawScratchBoard(prizes:Prize[],count:number,noWinText:string,roll:number):string[] {
  if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('Invalid preview roll');
  let cumulative=0;
  for(const prize of prizes) {
    cumulative+=Math.max(0,Number(prize.probabilityPercent)||0);
    if(roll*100<cumulative)return drawWinBoard(prize.name,count,roll,prizes);
  }
  return drawNoWinBoard(count,noWinText,prizes,'',roll);
}

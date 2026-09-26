import type { ScratchCardDraft } from './scratch-card';
type Prize = ScratchCardDraft['prizes'][number];

export function drawNoWinBoard(count:number,noWinText:string,prizes:Prize[]=[],excludedPrize=''):string[] {
  if(count===1)return [noWinText];
  const names=[...new Set(prizes.map(prize=>prize.name).filter(name=>name!==excludedPrize))];
  return Array.from({length:Math.ceil(count/3)},(_,ticket)=>{
    const options=names.length>=2?names:[...names,...['Prøv igen','Ingen gevinst','Næste gang'].filter(text=>!names.includes(text)).slice(0,3-names.length)];
    return Array.from({length:Math.min(3,count-ticket*3)},(_,slot)=>options[(ticket*2+slot)%options.length]);
  }).flat();
}
export function drawWinBoard(prizeName:string,count:number,roll:number,prizes:Prize[]=[]):string[] {
  const ticketCount=Math.max(1,Math.floor(count/3));
  const winningTicket=Math.floor(roll*ticketCount);
  const board=drawNoWinBoard(count,'',prizes,prizeName);
  const start=winningTicket*3;
  board.splice(start,Math.min(3,count-start),...Array(Math.min(3,count-start)).fill(prizeName));
  return board;
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
  return drawNoWinBoard(count,noWinText,prizes);
}

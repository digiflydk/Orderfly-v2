import type { ScratchCardDraft } from './scratch-card';
type Prize = ScratchCardDraft['prizes'][number];

export function drawNoWinBoard(count:number,noWinText:string):string[] {
  if(count===1)return [noWinText];
  return Array.from({length:count},(_,index)=>['★','●','◆','♥','✦','▲'][index]);
}
// Preview samples one outcome per play. The public server uses the same
// boundaries with a cryptographic roll and enforces winner caps in a transaction.
export function drawScratchBoard(prizes:Prize[],count:number,noWinText:string,roll:number):string[] {
  if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('Invalid preview roll');
  let cumulative=0;
  for(const prize of prizes) {
    cumulative+=Math.max(0,Number(prize.probabilityPercent)||0);
    if(roll*100<cumulative)return Array(count).fill(prize.name);
  }
  return drawNoWinBoard(count,noWinText);
}

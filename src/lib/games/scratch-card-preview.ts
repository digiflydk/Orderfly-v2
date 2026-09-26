import type { ScratchCardDraft } from './scratch-card';
type Prize = ScratchCardDraft['prizes'][number];
const filler = ['★','●','◆','♥','✦','▲','■','✚','⬟'];

export function drawNoWinBoard(count:number,noWinText:string):string[] {
  if(count===1)return [noWinText];
  return filler.slice(0,count);
}
export function drawWinBoard(prizeName:string,count:number,roll:number):string[] {
  const matching=Math.min(3,count);
  const board=[...Array(matching).fill(prizeName),...filler.slice(0,count-matching)];
  // The result is selected before rendering. This shuffle only changes the visual placement.
  let seed=Math.floor(roll*0x100000000)>>>0;
  for(let i=board.length-1;i>0;i--){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const j=seed%(i+1);
    [board[i],board[j]]=[board[j],board[i]];
  }
  return board;
}
// Preview samples one outcome per play. The public server uses the same
// boundaries with a cryptographic roll and enforces winner caps in a transaction.
export function drawScratchBoard(prizes:Prize[],count:number,noWinText:string,roll:number):string[] {
  if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('Invalid preview roll');
  let cumulative=0;
  for(const prize of prizes) {
    cumulative+=Math.max(0,Number(prize.probabilityPercent)||0);
    if(roll*100<cumulative)return drawWinBoard(prize.name,count,roll);
  }
  return drawNoWinBoard(count,noWinText);
}

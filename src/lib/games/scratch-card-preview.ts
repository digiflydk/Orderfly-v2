import type { ScratchCardDraft } from './scratch-card';
type Prize = ScratchCardDraft['prizes'][number];

// Client-only illustration of a *single* draw per play. Production prize
// allocation must happen on the server and enforce caps atomically.
export function drawScratchBoard(prizes:Prize[], count:number, noWinText:string, roll:number):string[] {
  if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('Invalid preview roll');
  let cumulative=0;
  for(const prize of prizes) {
    cumulative+=Math.max(0,Number(prize.probabilityPercent)||0);
    if(roll*100<cumulative)return Array(count).fill(prize.name);
  }
  const symbols=[...new Set([...prizes.map(p=>p.name),'★','●','◆',noWinText])];
  return Array.from({length:count},(_,index)=>symbols[index%symbols.length]);
}

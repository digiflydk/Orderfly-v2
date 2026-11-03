import type { ScratchCardDraft } from './scratch-card';
type Prize = ScratchCardDraft['prizes'][number];

// A play shows one ticket laid out in rows of three (3, 6 or 9 fields). A win is
// three identical prize symbols in a line: a row, a column or a diagonal. Every
// field shows a prize symbol; a winning board has exactly one such line and a
// nonwinning board has none. Three identical symbols outside a line never win.
const GRID_LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

/** The lines that exist on a board of `count` fields in rows of three. */
export function boardLines(count:number):number[][] {
  return GRID_LINES.filter(line=>line.every(index=>index<count));
}
/** The winning line of a revealed board, or null. Boards of 1–2 fields win when all fields match. */
export function winningLine(board:string[]):number[]|null {
  if(board.length>0&&board.length<3)return board.every(symbol=>symbol===board[0])?board.map((_,index)=>index):null;
  return boardLines(board.length).find(line=>line.every(index=>board[index]===board[line[0]]))||null;
}

function random(seed:number){
  let state=(Math.floor(Math.abs(seed)*2**32)>>>0)||1;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
}
function shuffled<T>(items:T[],next:()=>number):T[] {
  const result=[...items];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
// Fill the board field by field with shuffled prize symbols and backtrack
// whenever a completed line is identical, except the fixed winning line.
function fill(count:number,symbols:string[],seed:number,win?:{line:number[];symbol:string}):string[]|null {
  const next=random(seed),board:string[]=Array(count).fill(''),lines=boardLines(count);
  if(win)for(const index of win.line)board[index]=win.symbol;
  const open=board.map((value,index)=>value?-1:index).filter(index=>index>=0);
  const valid=(index:number)=>lines.filter(line=>line.includes(index)&&line!==win?.line).every(line=>
    line.some(cell=>!board[cell])||!line.every(cell=>board[cell]===board[line[0]]));
  const place=(position:number):boolean=>{
    if(position===open.length)return true;
    const index=open[position];
    for(const symbol of shuffled(symbols,next)){
      board[index]=symbol;
      if(valid(index)&&place(position+1))return true;
    }
    board[index]='';
    return false;
  };
  return place(0)?board:null;
}
function symbolsFor(prizes:Prize[],fallback:string):string[] {
  const names=[...new Set(prizes.map(prize=>prize.name))];
  // A board needs two different symbols to avoid an accidental line; a legacy
  // single-prize game falls back to its configured no-win text.
  if(names.length>=2)return names;
  return [...new Set([...names,fallback||'Ingen gevinst','Ingen gevinst','Næste gang'])].slice(0,2);
}
export function drawNoWinBoard(count:number,noWinText:string,prizes:Prize[]=[],seed=0):string[] {
  if(count===1)return [noWinText];
  const symbols=symbolsFor(prizes,noWinText);
  if(count===2)return shuffled(symbols,random(seed)).slice(0,2);
  return fill(count,symbols,seed)!;
}
export function drawWinBoard(prizeName:string,count:number,roll:number,prizes:Prize[]=[],noWinText=''):string[] {
  if(count<3)return Array(count).fill(prizeName);
  const lines=boardLines(count),line=lines[Math.floor(roll*lines.length)%lines.length];
  const symbols=symbolsFor(prizes.some(prize=>prize.name===prizeName)?prizes:[...prizes,{name:prizeName} as Prize],noWinText);
  return fill(count,symbols,roll,{line,symbol:prizeName})!;
}
// Preview samples one outcome per play. The public server uses the same
// boundaries with a cryptographic roll and enforces winner caps in a transaction.
export function drawScratchBoard(prizes:Prize[],count:number,noWinText:string,roll:number):string[] {
  if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('Invalid preview roll');
  let cumulative=0;
  for(const prize of prizes) {
    cumulative+=Math.max(0,Number(prize.probabilityPercent)||0);
    if(roll*100<cumulative)return drawWinBoard(prize.name,count,roll,prizes,noWinText);
  }
  return drawNoWinBoard(count,noWinText,prizes,roll);
}

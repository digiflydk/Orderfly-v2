import type { ScratchCardDraft } from './scratch-card';
type Prize = ScratchCardDraft['prizes'][number];

// A play shows one ticket laid out in rows of three (3, 6 or 9 fields). A win is
// three identical prize symbols in a line: a row, a column or a diagonal. Every
// field shows a prize symbol; a winning board has exactly one such line and a
// nonwinning board has none. Three identical symbols outside a line never win.
// Among valid boards the most even one is chosen: the won prize appears only in
// its line, other prizes are spread evenly and identical symbols avoid touching.
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
// Orthogonal and diagonal neighbours on the three-column grid.
function neighbours(count:number):Array<[number,number,number]> {
  const pairs:Array<[number,number,number]>=[];
  for(let a=0;a<count;a++)for(let b=a+1;b<count;b++){
    const dr=Math.floor(b/3)-Math.floor(a/3),dc=b%3-a%3;
    if(dr===0&&dc===1||dr===1&&dc===0)pairs.push([a,b,10]);
    else if(dr===1&&Math.abs(dc)===1)pairs.push([a,b,3]);
  }
  return pairs;
}
// Lower is better: the won prize only in its line, no identical neighbours,
// and the other prizes spread as evenly as possible.
function score(board:string[],win?:{line:number[];symbol:string}):number {
  let total=0;
  if(win)board.forEach((symbol,index)=>{if(symbol===win.symbol&&!win.line.includes(index))total+=1000;});
  for(const [a,b,weight] of neighbours(board.length))
    if(board[a]===board[b]&&!(win&&win.line.includes(a)&&win.line.includes(b)))total+=weight;
  const counts=new Map<string,number>();
  board.forEach((symbol,index)=>{if(!win||!win.line.includes(index))counts.set(symbol,(counts.get(symbol)||0)+1);});
  for(const n of counts.values())total+=n*n;
  return total;
}
const CANDIDATES=300,EXHAUSTIVE_LIMIT=20000;
// Every valid board for a small search space (at most EXHAUSTIVE_LIMIT fillings).
function all(count:number,symbols:string[],win?:{line:number[];symbol:string}):string[][] {
  const board:string[]=Array(count).fill(''),lines=boardLines(count),result:string[][]=[];
  if(win)for(const index of win.line)board[index]=win.symbol;
  const open=board.map((value,index)=>value?-1:index).filter(index=>index>=0);
  const valid=(index:number)=>lines.filter(line=>line.includes(index)&&line!==win?.line).every(line=>
    line.some(cell=>!board[cell])||!line.every(cell=>board[cell]===board[line[0]]));
  const place=(position:number)=>{
    if(position===open.length){result.push([...board]);return;}
    for(const symbol of symbols){board[open[position]]=symbol;if(valid(open[position]))place(position+1);}
    board[open[position]]='';
  };
  place(0);
  return result;
}
// Choose the best-scoring valid board. Small games are searched exhaustively and
// the seed picks among the equally good boards; larger games sample candidates.
function best(count:number,symbols:string[],seed:number,win?:{line:number[];symbol:string}):string[] {
  const next=random(seed),others=win?symbols.filter(symbol=>symbol!==win.symbol):symbols;
  const pools=win&&others.length>=2?[others,symbols]:[symbols];
  const open=count-(win?win.line.length:0);
  for(const pool of pools){
    const boards=pool.length**open<=EXHAUSTIVE_LIMIT?all(count,pool,win):
      Array.from({length:CANDIDATES},()=>fill(count,pool,next(),win)).filter((board):board is string[]=>!!board);
    if(!boards.length)continue;
    const scores=boards.map(board=>score(board,win)),lowest=Math.min(...scores);
    const top=boards.filter((_,index)=>scores[index]===lowest);
    return top[Math.floor(next()*top.length)];
  }
  return fill(count,symbols,seed,win)!;
}
export function drawNoWinBoard(count:number,noWinText:string,prizes:Prize[]=[],seed=0):string[] {
  if(count===1)return [noWinText];
  const symbols=symbolsFor(prizes,noWinText);
  if(count===2)return shuffled(symbols,random(seed)).slice(0,2);
  return best(count,symbols,seed);
}
export function drawWinBoard(prizeName:string,count:number,roll:number,prizes:Prize[]=[],noWinText=''):string[] {
  if(count<3)return Array(count).fill(prizeName);
  const lines=boardLines(count),line=lines[Math.floor(roll*lines.length)%lines.length];
  const symbols=symbolsFor(prizes.some(prize=>prize.name===prizeName)?prizes:[...prizes,{name:prizeName} as Prize],noWinText);
  return best(count,symbols,roll,{line,symbol:prizeName});
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

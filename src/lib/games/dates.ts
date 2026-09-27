const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function copenhagenLocal(value:string|null):string {
  return value?formatter.format(new Date(value)).replace(' ','T'):'';
}
export function copenhagenInstant(value:string):string|null {
  if(!value)return null;
  const wall=Date.parse(`${value}:00Z`);
  if(!Number.isFinite(wall))throw new Error('Ugyldig dato.');
  let instant=wall;
  for(let i=0;i<3;i++){
    const observed=Date.parse(`${copenhagenLocal(new Date(instant).toISOString())}:00Z`);
    instant+=wall-observed;
  }
  const result=new Date(instant).toISOString();
  if(copenhagenLocal(result)!==value)throw new Error('Tidspunktet findes ikke ved skift til sommertid.');
  return result;
}

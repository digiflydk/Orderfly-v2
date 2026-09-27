export type CampaignStatus='draft'|'test'|'scheduled'|'live'|'paused'|'ended';
export type Window={startsAt:string|null;endsAt:string|null};
export function campaignStatus(status:unknown,game:Window,now=Date.now()):CampaignStatus {
  if(status==='ended')return 'ended';
  if(status==='paused')return 'paused';
  if(status!=='live')return status==='test'?'test':'draft';
  if(game.endsAt&&Date.parse(game.endsAt)<=now)return 'ended';
  if(game.startsAt&&Date.parse(game.startsAt)>now)return 'scheduled';
  return 'live';
}
export function overlaps(a:Window,b:Window):boolean {
  return (a.startsAt?Date.parse(a.startsAt):-Infinity)<(b.endsAt?Date.parse(b.endsAt):Infinity)
    &&(b.startsAt?Date.parse(b.startsAt):-Infinity)<(a.endsAt?Date.parse(a.endsAt):Infinity);
}

import {z} from 'zod';
const googleUrl=z.string().url().max(2000).refine(s=>{const u=new URL(s);return u.protocol==='https:' && u.hostname==='www.google.com' && u.pathname.startsWith('/maps/');});
const schema=z.array(z.object({reviewId:z.string().min(1).max(300),starRating:z.literal('FIVE'),comment:z.string().max(10000).default(''),dateLabel:z.string().min(1).max(100),reviewUrl:googleUrl,reviewer:z.object({displayName:z.string().min(1).max(300),profilePhotoUrl:z.string().url().max(2000).refine(s=>/^https:\/\/(?:[a-z0-9-]+\.)*googleusercontent\.com\//i.test(s)).optional()})})).min(1).max(100);
export function parseManualGoogleReviews(raw:string,now=new Date()){
 if(Buffer.byteLength(raw,'utf8')>800000)throw Error('IMPORT_SIZE');
 const rows=schema.parse(JSON.parse(raw));
 if(new Set(rows.map(r=>r.reviewId)).size!==rows.length)throw Error('DUPLICATE_REVIEW');
 return rows.map(r=>{
  const label=r.dateLabel.replace(/\s+/g,' ').replace(/\s*\(redigeret\)/i,'').trim();
  const months=['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
  const absolute=label.match(/^(\d{1,2})\. (\w+)\.? (\d{4})$/i), relative=label.match(/^For (\d+) (dag|dage|uge|uger) siden$/i);
  let date:Date, approximate=false;
  if(absolute){const m=months.indexOf(absolute[2].toLowerCase());if(m<0)throw Error('DATE');date=new Date(Date.UTC(+absolute[3],m,+absolute[1],12));if(date.getUTCDate()!==+absolute[1])throw Error('DATE');}
  else if(relative){date=new Date(now.getTime()-(+relative[1])*(relative[2].startsWith('uge')?7:1)*86400000);approximate=true;}
  else throw Error('DATE');
  return {...r,createTime:date.toISOString(),updateTime:date.toISOString(),dateApproximate:approximate};
 });
}

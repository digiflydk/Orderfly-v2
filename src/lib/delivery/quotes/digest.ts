import { createHash } from 'node:crypto';
function canonical(value:unknown, depth=0):string {
  if(depth>30)throw new Error('quote_digest_depth');
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(v=>canonical(v,depth+1)).join(',')}]`;
  if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype){
    return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k],depth+1)}`).join(',')}}`;
  }
  throw new Error('quote_digest_non_json');
}
/** Integrity binding, not a signature or authorization credential. */
export function quoteContentDigest(value:Record<string,unknown>):string {
  const {contentDigest:ignored,...envelope}=value;
  return createHash('sha256').update(canonical(envelope)).digest('hex');
}

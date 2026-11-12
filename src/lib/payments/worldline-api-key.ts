import 'server-only';

export class WorldlineApiKeyError extends Error {
  constructor(readonly code:'invalid_api_key'|'api_key_environment_mismatch') {
    super(code==='invalid_api_key'?'API-koden skal være Worldlines samlede Base64-kode (eventuelt med Basic foran).':'API-kodens Merchant Number passer ikke til det valgte test/live-miljø.');
    this.name='WorldlineApiKeyError';
  }
}
/** Europe API key = Base64(accessToken@merchantNumber:secretToken).
 * Decode only on the server. This does not contain or replace the callback MD5 key.
 */
export function parseWorldlineApiKey(input:string,mode:'test'|'live') {
  const invalid=()=>new WorldlineApiKeyError('invalid_api_key');
  if(typeof input!=='string'||input.length>4096)throw invalid();
  const encoded=input.trim().replace(/^Basic +/i,'');
  if(!encoded||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||encoded.length%4===1)throw invalid();
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.toString('base64').replace(/=+$/,'')!==encoded.replace(/=+$/,''))throw invalid();
  const decoded=bytes.toString('utf8');
  if(!Buffer.from(decoded,'utf8').equals(bytes))throw invalid();
  const match=/^([^@:\s\p{Cc}]+)@([TP][A-Za-z0-9]+):([^\s\p{Cc}]+)$/u.exec(decoded);
  if(!match||match.slice(1).some(value=>value.length>512))throw invalid();
  if(!match[2].startsWith(mode==='test'?'T':'P'))throw new WorldlineApiKeyError('api_key_environment_mismatch');
  return {accessToken:match[1],merchantNumber:match[2],secretToken:match[3]};
}

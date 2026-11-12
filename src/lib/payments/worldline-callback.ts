import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Europe Handle Responses: decoded values in wire order, followed by MD5 key.
 * Reject duplicate parameters and anything after hash; no unsigned value may be consumed.
 * Never persist the query: it can contain card data and customer return capabilities.
 */
export function verifyWorldlineCallback(query: URLSearchParams, md5Key: string) {
  const entries = [...query.entries()];
  if (!md5Key || entries.length > 64 || entries.length < 5 || entries.at(-1)?.[0] !== 'hash'
    || new Set(entries.map(([key]) => key)).size !== entries.length
    || entries.some(([key,value]) => key.length > 128 || value.length > 2048)) throw new Error('Invalid Worldline callback');
  const hash = query.get('hash')!;
  if (!/^[a-fA-F0-9]{32}$/.test(hash)) throw new Error('Invalid Worldline callback');
  const digest = createHash('md5').update(entries.slice(0,-1).map(([,value])=>value).join('') + md5Key, 'utf8').digest();
  if (!timingSafeEqual(digest,Buffer.from(hash,'hex'))) throw new Error('Invalid Worldline callback');
  const transactionId = query.get('txnid') || '', orderId = query.get('orderid') || '';
  const amount = query.get('amount') || '', currency = query.get('currency') || '';
  if (!/^[0-9]{1,32}$/.test(transactionId) || !/^[A-Za-z0-9_-]{1,50}$/.test(orderId)
    || !/^[1-9][0-9]{0,9}$/.test(amount) || !/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid Worldline callback');
  return { transactionId, orderId, amountMinor:Number(amount), currency };
}

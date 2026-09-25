import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { getOrigin } from '@/lib/url';

export const runtime = 'nodejs';
import { consentIdentityCookie, consentSecretHash, readConsentIdentity, ownsConsent } from '@/lib/server/consent-identity';
const schema = z.object({
  anon_user_id: z.string().uuid(), marketing: z.boolean(), statistics: z.boolean(),
  functional: z.boolean(), necessary: z.literal(true), consent_version: z.string().min(1).max(100),
  origin_brand: z.string().min(1).max(160), brand_id: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  shared_scope: z.literal('orderfly'), choice_revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: {'Cache-Control':'no-store'} });
export async function POST(req: Request) {
  if (req.headers.get('origin') !== await getOrigin() || req.headers.get('sec-fetch-site') === 'cross-site' || req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return reply({error:'Forbidden'},403);
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply({error:'Invalid request'},400);
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const {done,value} = await reader.read(); if(done) break; size += value.byteLength; if(size > 4096) return reply({error:'Invalid request'},413); chunks.push(value); } }
    finally { await reader.cancel().catch(()=>{}); }
    const parsed = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!parsed.success) return reply({error:'Invalid request'},400);
    const input = parsed.data, db = getAdminDb();
    const existingIdentity = await readConsentIdentity();
    // A caller-provided UUID is never proof of ownership. Old browsers get a new
    // server identity; existing customer-linked records cannot be claimed.
    const id = existingIdentity?.id || randomUUID();
    const secret = existingIdentity?.secret || randomBytes(32).toString('hex');
    const secretHash = consentSecretHash(secret);
    const ref = db.collection('anonymous_cookie_consents').doc(id);
    const saved = await db.runTransaction(async tx => {
      const [snapshot, brand] = await Promise.all([tx.get(ref),tx.get(db.collection('brands').doc(input.brand_id))]);
      if (!brand.exists || brand.data()?.isActive === false) return false;
      const previous = snapshot.data();
      if (snapshot.exists) {
        if (!ownsConsent(previous,secret)) return false;
        // A timed-out older request must not reverse a newer withdrawal.
        if (Number(previous?.choice_revision || 0) > Number(input.choice_revision || 0)) return true;
      } else if (existingIdentity) return false;
      tx.set(ref, {...input,choice_revision:input.choice_revision || 0,anon_user_id:id,origin_brand:previous?.origin_brand || input.brand_id,
        linked_to_customer:previous?.linked_to_customer === true,identityTokenHash:secretHash,
        last_seen:getAdminFieldValue().serverTimestamp(),
        ...(!snapshot.exists?{first_seen:getAdminFieldValue().serverTimestamp()}:{}),
      },{merge:true});
      return true;
    });
    if (!saved) return reply({error:'Consent identity or brand rejected'},403);
    const response = reply({success:true,anon_user_id:id});
    response.cookies.set(consentIdentityCookie,`${id}.${secret}`,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:365*24*60*60});
    return response;
  } catch { return reply({error:'Consent could not be saved'},400); }
}

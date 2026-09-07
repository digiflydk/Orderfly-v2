import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { doc, runTransaction, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type CheckoutResult = { success: boolean; url?: string | null; orderId?: string; error?: string; retryable?: boolean };
type AttemptResult = CheckoutResult & { pending?: boolean };

// The raw random key stays in the browser/request. The document ID and request
// fingerprint are hashes; the cached payment URL is encrypted with that key.
// Reading the attempt document alone must not disclose a hosted payment URL.
export async function runCheckoutAttempt(key: string, input: unknown, create: () => Promise<CheckoutResult>): Promise<AttemptResult> {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const encryptionKey = digest(`checkout-result:${key}`);
  const ref = doc(db, 'checkout_attempts', digest(`checkout-attempt:${key}`).toString('hex'));
  const fingerprint = digest(JSON.stringify(input)).toString('hex');
  const previous = await runTransaction(db, async tx => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists()) return snapshot.data();
    tx.set(ref, { fingerprint, state: 'pending', createdAt: serverTimestamp() });
    return null;
  });
  if (previous) {
    if (previous.fingerprint !== fingerprint) return { success: false, retryable: false, error: 'This payment attempt belongs to a different basket.' };
    if (previous.state !== 'complete') return { success: false, retryable: false, pending: true };
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(previous.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(previous.tag, 'hex'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(previous.result, 'hex')), decipher.final()]).toString('utf8'));
  }
  let result: CheckoutResult;
  try { result = await create(); }
  catch { result = { success: false, retryable: false, error: 'Payment status could not be confirmed. Please contact the restaurant.' }; }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(result)), cipher.final()]);
  const completed = { state: 'complete', iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), result: encrypted.toString('hex') };
  try { await updateDoc(ref, completed); }
  catch {
    // A failed cache write must not discard a known usable payment URL. Retry
    // only this idempotent write; never re-run the order/payment operation.
    try { await updateDoc(ref, completed); } catch { /* Later retries remain pending. */ }
  }
  return result;
}

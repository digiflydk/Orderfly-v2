import 'server-only';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import { NativePrinterDeviceAuthenticationError, verifyNativePrinterDevice,
  type NativePrinterDeviceIdentitySnapshot } from './device-auth-native';

type ErrorCode = 'invalid_cloudprnt_authorization' | 'device_unverified' | 'device_unavailable';
export class CloudPrntHttpAuthenticationError extends Error {
  constructor(readonly code: ErrorCode) { super(code); }
}
const invalid = (): never => { throw new CloudPrntHttpAuthenticationError('invalid_cloudprnt_authorization'); };
const validId = (value: unknown): value is string => typeof value === 'string'
  && value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);

// Internal extraction only. Syntax is not device identity and plaintext is never returned.
function command(input: unknown) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return invalid();
    const keys = Reflect.ownKeys(input), allowed = ['authorization', 'brandId', 'locationId', 'printerId'];
    if (keys.length !== allowed.length || keys.some(key => typeof key !== 'string' || !allowed.includes(key))) return invalid();
    const field = (key: string) => {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !('value' in descriptor)) return invalid();
      return descriptor.value as unknown;
    };
    const authorization = field('authorization'), brandId = field('brandId'), locationId = field('locationId'), printerId = field('printerId');
    // Bounds precede regex/Base64 allocation and native I/O. Fixed credentials encode
    // to 52 ASCII octets and exactly 72 canonical Base64 characters, including ==.
    if (typeof authorization !== 'string' || authorization.length < 78 || authorization.length > 256
      || !validId(brandId) || !validId(locationId) || !validId(printerId)) return invalid();
    const match = /^Basic +([A-Za-z0-9+/]{70}==)$/i.exec(authorization);
    if (!match) return invalid();
    const bytes = Buffer.from(match[1], 'base64');
    if (bytes.length !== 52 || bytes.toString('base64') !== match[1]
      || bytes.some(byte => byte < 0x21 || byte > 0x7e)) return invalid();
    // Explicit byte validation above prevents lossy ASCII conversion/high-bit aliases.
    const text = bytes.toString('utf8');
    if (!text.startsWith('orderfly:')) return invalid();
    const secret = text.slice(9);
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)
      || Buffer.from(secret, 'base64url').toString('base64url') !== secret) return invalid();
    return { brandId, locationId, printerId, secret };
  } catch { return invalid(); }
}

/** Fresh identity-only verification in a trusted caller's CURRENT native transaction.
 * Invoke inside every operation/retry. No header/secret DTO, cache or output authority.
 * The future HTTP endpoint must enforce HTTPS and request/dispatch policy separately.
 */
export async function verifyCloudPrntHttpDevice(context: NativeTransactionContext, input: unknown): Promise<NativePrinterDeviceIdentitySnapshot> {
  const request = command(input);
  try {
    return await verifyNativePrinterDevice(context, request);
  } catch (error) {
    const code = error instanceof NativePrinterDeviceAuthenticationError && error.code === 'device_unverified'
      ? 'device_unverified' : 'device_unavailable';
    throw new CloudPrntHttpAuthenticationError(code);
  }
}

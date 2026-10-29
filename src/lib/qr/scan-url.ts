/** QR alphanumeric mode packs uppercase URLs more efficiently than byte mode.
 * This is a reversible representation of the existing 128-bit identifier, not
 * a new database key. The format marker keeps legacy and compact keys distinct.
 */
export function qrScanUrl(slug: string): string {
  const legacy = /^[a-f0-9]{32}$/.test(slug);
  if (!legacy && !/^[A-Za-z0-9_-]{21}[AQgw]$/.test(slug)) throw new Error('invalid_qr_slug');
  const hex = legacy ? slug : Buffer.from(slug, 'base64url').toString('hex');
  const token = BigInt(`0x${hex}`).toString(36).toUpperCase().padStart(25, '0');
  return `HTTPS://ORDERFLY.DK/R/${legacy ? 'L' : 'C'}${token}`;
}

export function qrSlugFromScanCode(code: string): string | null {
  if (!/^[LC][0-9A-Z]{25}$/.test(code)) return null;
  let value = BigInt(0);
  for (const char of code.slice(1)) value = value * BigInt(36) + BigInt(parseInt(char, 36));
  if (value >= BigInt(2) ** BigInt(128)) return null;
  const hex = value.toString(16).padStart(32, '0');
  return code[0] === 'L' ? hex : Buffer.from(hex, 'hex').toString('base64url');
}

/** Node/Next represents DELETE as a stream even when no bytes were sent.
 * Check the bytes, not the existence of that stream. Never buffer a payload.
 */
export async function requireEmptyCloudPrntBody(request: Request): Promise<void> {
  const invalid = () => { throw new Error('invalid_empty_body'); };
  if (request.bodyUsed || (request.headers.has('content-length') && request.headers.get('content-length') !== '0')) invalid();
  if (!request.body) return;
  const reader = request.body.getReader();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        for (let reads = 0; reads < 16; reads++) {
          const chunk = await reader.read();
          if (chunk.done) return;
          if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength !== 0) invalid();
        }
        invalid();
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('invalid_empty_body')), 2000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

import 'server-only';

/** Only observations may be passed here. A lost money reply must never retry its
 * POST; its existing journal and a fresh provider read own reconciliation. */
export async function readWorldlinePaymentState<T>(read: () => Promise<T>, retry = false): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await read(); }
    catch (error) {
      if (!retry || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
}

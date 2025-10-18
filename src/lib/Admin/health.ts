export async function adminHealthProbe() {
  return { ok: true, ts: Date.now() };
}

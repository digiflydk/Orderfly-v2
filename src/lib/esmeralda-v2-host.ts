// Explicit presentation alias, never a second tenant or a catalog copy.
export const ESMERALDA_V2_HOST = 'esmeralda2.orderfly.dk';

export function isEsmeraldaV2Host(host: string | null | undefined): boolean {
  return (host ?? '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '') === ESMERALDA_V2_HOST;
}

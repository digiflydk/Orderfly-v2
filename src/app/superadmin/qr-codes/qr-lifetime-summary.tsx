'use client';

import React from 'react';
import type { QrLifetime } from '@/lib/qr/lifetime';
import type { QrBrandChoice, QrCodeSummary } from './qr-manager';

export type QrLifetimeSummaryProps = { codes: QrCodeSummary[]; brands: QrBrandChoice[]; allTime?: Record<string, QrLifetime | null> };
const number = (value: number) => new Intl.NumberFormat('da-DK').format(value);
const time = (value: number | null) => value === null ? '—' : new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
function valid(value: QrLifetime | null | undefined): value is QrLifetime {
  return !!value && ['openings', 'probableScans', 'excludedOpenings'].every(key => {
    const count = value[key as 'openings' | 'probableScans' | 'excludedOpenings']; return Number.isSafeInteger(count) && count >= 0;
  }) && [value.firstOpenedAt, value.lastOpenedAt].every(at => at === null || Number.isSafeInteger(at) && Number.isFinite(new Date(at).getTime()));
}

/** Only explicitly server-projected keys are visible; no period-derived totals. */
export function QrLifetimeSummary({ codes, brands, allTime }: QrLifetimeSummaryProps) {
  if (!allTime || typeof allTime !== 'object') return null;
  const rows = codes.filter(code => Object.prototype.hasOwnProperty.call(allTime, `${code.brandId}/${code.id}`));
  if (!rows.length) return null;
  return <section aria-label="Samlede scanninger" className="space-y-3 rounded-lg border p-4" style={{ minWidth: 0 }}>
    <h2 className="text-xl font-semibold">Samlede scanninger</h2>
    <p className="text-sm text-muted-foreground">Samlede registreringer pr. kode siden tællerens start. Tallene følger ikke det valgte datofilter. Ukendt betyder, at en samlet historik ikke er tilgængelig.</p>
    <div style={{ overflowX: 'auto' }}><table className="w-full text-sm" aria-label="Samlede scanninger pr. QR-kode"><thead><tr><th scope="col">QR-kode</th><th scope="col">Brand</th><th scope="col">Åbninger</th><th scope="col">Sandsynlige scanninger</th><th scope="col">Udeladte åbninger</th><th scope="col">Første åbning</th><th scope="col">Seneste åbning</th></tr></thead>
      <tbody>{rows.map(code => {
        const value = allTime[`${code.brandId}/${code.id}`], known = valid(value);
        return <tr key={`${code.brandId}/${code.id}`}><th scope="row">{code.name}</th><td>{brands.find(brand => brand.id === code.brandId)?.name || code.brandId}</td><td>{known ? number(value.openings) : 'Ukendt'}</td><td>{known ? number(value.probableScans) : 'Ukendt'}</td><td>{known ? number(value.excludedOpenings) : 'Ukendt'}</td><td>{known ? time(value.firstOpenedAt) : 'Ukendt'}</td><td>{known ? time(value.lastOpenedAt) : 'Ukendt'}</td></tr>;
      })}</tbody>
    </table></div>
  </section>;
}

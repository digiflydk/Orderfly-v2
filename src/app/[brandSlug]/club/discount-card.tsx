import { Button } from '@/components/ui/button';
import type { PortalDiscountCard } from '@/lib/loyalty/discount-card/portal';
import { danishDate } from './texts';

const statusText: Record<PortalDiscountCard['status'], string> = {
  active: 'Aktivt rabatkort', pending: 'Afventer aktivering', blocked: 'Kortet er spærret',
  inactive: 'Kortet er ikke aktivt lige nu', upcoming: 'Kortet er endnu ikke gyldigt', expired: 'Kortet er udløbet',
};

export function DiscountCard({ card, base }: { card: PortalDiscountCard; base: string }) {
  const shop = base.replace(/\/club$/, '') || '/';
  return <section aria-labelledby="club-discount-card" className="club-stamp-card flex flex-col items-center gap-4 rounded-xl border p-4 text-center">
    <h2 id="club-discount-card" className="text-2xl">Dit personlige rabatkort</h2>
    <p className="text-lg font-semibold break-words">{card.groupName}</p>
    <p className="text-4xl font-semibold">{card.percentage.toLocaleString('da-DK')} % rabat</p>
    <p role="status">{statusText[card.status]}</p>
    <p>{card.locations.all ? 'Gælder alle brandets lokationer.' : card.locations.names.length ? `Gælder hos: ${card.locations.names.join(', ')}.` : 'Ingen aktive lokationer er tilgængelige lige nu.'}</p>
    {card.startsAt !== null && <p>Gyldig fra {danishDate(card.startsAt)}.</p>}
    <p>{card.expiresAt !== null ? `Gyldig til ${danishDate(card.expiresAt)}.` : 'Gælder, indtil kortet bliver deaktiveret.'}</p>
    <p className="text-sm">Rabatten beregnes i Orderfly, når du er logget ind. Den gælder varer til normalpris og kan ikke kombineres med andre tilbud. Levering og gebyrer er ikke omfattet.</p>
    <p className="text-sm">Køb med kortrabatten giver ikke samtidig stempler. Dine tidligere stempler og belønninger er gemt.</p>
    {card.status === 'active' && <Button asChild variant="brand" size="lg" className="min-h-12"><a href={shop}>Bestil med dit rabatkort</a></Button>}
  </section>;
}

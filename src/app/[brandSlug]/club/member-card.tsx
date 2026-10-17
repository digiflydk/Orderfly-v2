import { Check } from 'lucide-react';
import type { PortalMember } from './data';
import { MemberQr } from './member-qr';
import { danishDate, firstName, nextRewardText, stampWord } from './texts';

// Mit stempelkort (spec §4.3). Everything shown comes from GET me; the QR code
// is fetched in the browser so it is always fresh.
export function MemberCard({ member, slug, base }: { member: PortalMember; slug: string; base: string }) {
  const { card, rewards, program } = member;
  const filled = Math.min(card.stamps, card.stampsRequired);
  // Even rows: 8 stamps as 2 × 4, at most 5 per row on a phone.
  const columns = card.stampsRequired <= 5 ? card.stampsRequired : card.stampsRequired <= 10 ? Math.ceil(card.stampsRequired / 2) : 5;
  return (
    <>
      <section aria-labelledby="club-card" className="flex flex-col items-center gap-4 text-center">
        <div>
          <h1 id="club-card" className="text-3xl">{program.name}</h1>
          <p>Hej {firstName(member.member.name)}</p>
        </div>
        {!program.active && <p className="rounded-md border p-3">Klubben giver ikke nye stempler lige nu. Dine stempler og belønninger er gemt.</p>}
        <div role="img" aria-label={`${card.stamps} af ${card.stampsRequired} ${stampWord(card.stampsRequired)}`} data-stamps={card.stamps}
          className="grid w-full justify-center gap-3 rounded-xl border p-4" style={{ gridTemplateColumns: `repeat(${columns}, 2.75rem)` }}>
          {Array.from({ length: card.stampsRequired }, (_, i) => (
            <span key={i} aria-hidden="true" data-stamp={i < filled ? 'filled' : 'empty'}
              className={`flex h-11 w-11 items-center justify-center rounded-full border-2 border-primary ${i < filled ? 'bg-primary text-primary-foreground' : ''}`}>
              {i < filled && <Check className="h-6 w-6" strokeWidth={3} />}
            </span>
          ))}
        </div>
        <p className="text-xl font-semibold">{card.stamps} af {card.stampsRequired} {stampWord(card.stampsRequired)}</p>
        <p>{nextRewardText(card.stamps, card.stampsRequired, card.rewardDescription)}</p>
      </section>

      <MemberQr slug={slug} base={base} />

      {rewards.length > 0 && (
        <section aria-labelledby="club-rewards" className="flex flex-col gap-3">
          <h2 id="club-rewards" className="text-center text-2xl">Dine belønninger</h2>
          <ul className="flex flex-col gap-3">
            {rewards.map(reward => (
              <li key={reward.id} className="commerce-newsletter flex flex-col gap-1 rounded-xl border p-4" data-newsletter-offer="true">
                <strong className="text-lg">{reward.description || 'Belønning'}</strong>
                <span>Udløber {danishDate(reward.expiresAt)}</span>
                <span>Vis QR-koden ved kassen for at indløse</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {card.expiresAt && (
        <p className="text-center">Dine stempler udløber, hvis du ikke har fået et nyt stempel inden {danishDate(card.expiresAt)}.</p>
      )}
    </>
  );
}

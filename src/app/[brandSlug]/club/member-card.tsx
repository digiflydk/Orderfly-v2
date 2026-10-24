import { Check } from 'lucide-react';
import type { PortalMember } from './data';
import { HomeScreenHint } from './home-screen-hint';
import { MemberBenefits, type MemberCampaigns } from './club-benefits';
import { MemberQr } from './member-qr';
import { DiscountCard } from './discount-card';
import { danishDate, firstName, nextRewardText, stampWord } from './texts';

// Mit stempelkort (spec §4.3). Everything shown comes from GET me; the QR code
// is fetched in the browser so it is always fresh.
export function MemberCard({ member, slug, base }: { member: PortalMember; slug: string; base: string }) {
  const { card, rewards, program, discountCard } = member;
  const campaigns = (member as PortalMember & { campaigns?: MemberCampaigns }).campaigns;
  const filled = Math.min(card.stamps, card.stampsRequired);
  // Even rows: 8 stamps as 2 × 4, at most 5 per row on a phone.
  const columns = card.stampsRequired <= 5 ? card.stampsRequired : card.stampsRequired <= 10 ? Math.ceil(card.stampsRequired / 2) : 5;
  return (
    <div className="club-member-card flex flex-col gap-6">
      {discountCard && <DiscountCard card={discountCard} base={base} />}
      {(!discountCard || discountCard.showStampCard) && <section className="club-stamp-card flex flex-col items-center gap-4 text-center" aria-labelledby="club-card">
        <div>
          <h1 id="club-card" className="text-3xl">{program.name}</h1>
          <p>Hej {firstName(member.member.name)}</p>
        </div>
        {!program.active && <p className="rounded-md border p-3">Klubben giver ikke nye stempler lige nu. Dine stempler og belønninger er gemt.</p>}
        <div className="club-stamp-grid grid w-full justify-center gap-3 rounded-xl border p-4" role="img" aria-label={`${card.stamps} af ${card.stampsRequired} ${stampWord(card.stampsRequired)}`} data-stamps={card.stamps}
          style={{ gridTemplateColumns: `repeat(${columns}, ${slug === 'esmeralda' ? 'minmax(0, 2.75rem)' : '2.75rem'})` }}>
          {Array.from({ length: card.stampsRequired }, (_, i) => (
            <span key={i} aria-hidden="true" data-stamp={i < filled ? 'filled' : 'empty'}
              className={`flex h-11 w-11 items-center justify-center rounded-full border-2 border-primary ${i < filled ? 'bg-primary text-primary-foreground' : ''}`}>
              {i < filled && <Check className="h-6 w-6" strokeWidth={3} />}
            </span>
          ))}
        </div>
        <p className="club-stamp-count text-xl font-semibold">{card.stamps} af {card.stampsRequired} {stampWord(card.stampsRequired)}</p>
        <p>{nextRewardText(card.stamps, card.stampsRequired, card.rewardDescription)}</p>
        {slug === 'esmeralda' && <progress className="club-stamp-progress" aria-label="Fremdrift på dit stempelkort" value={filled} max={card.stampsRequired} />}
      </section>}

      <MemberQr slug={slug} base={base} discountCard={!!discountCard} />

      {rewards.length > 0 && (
        <section aria-labelledby="club-rewards" className="club-member-rewards flex flex-col gap-3">
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
        <p className="club-card-expiry text-center">Dine stempler udløber, hvis du ikke har fået et nyt stempel inden {danishDate(card.expiresAt)}.</p>
      )}

      <MemberBenefits campaigns={campaigns} base={base} />
      <HomeScreenHint slug={slug} />
    </div>
  );
}

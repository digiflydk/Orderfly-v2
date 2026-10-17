import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { loadMember, loadPortal, portalBase } from './data';
import { ProgramClosed } from './program-closed';
import { firstName, nextRewardText, stampWord } from './texts';

type Props = { params: Promise<{ brandSlug: string }> };

export default async function ClubPage({ params }: Props) {
  const { brandSlug } = await params;
  const [{ brand, program }, member, base] = await Promise.all([loadPortal(brandSlug), loadMember(brandSlug), portalBase(brandSlug)]);

  if (member) {
    const { card } = member;
    return (
      <section aria-labelledby="club-card" className="flex flex-col gap-3 text-center">
        <h1 id="club-card" className="text-3xl">{member.program.name}</h1>
        <p>Hej {firstName(member.member.name)}</p>
        <p className="text-xl font-semibold">{card.stamps} af {card.stampsRequired} {stampWord(card.stampsRequired)}</p>
        <p>{nextRewardText(card.stamps, card.stampsRequired, card.rewardDescription)}</p>
      </section>
    );
  }

  if (!program.active) return <ProgramClosed name={program.name} />;

  return (
    <section aria-labelledby="club-intro" className="flex flex-col gap-4 text-center">
      <h1 id="club-intro" className="text-3xl">{program.name}</h1>
      <p>
        Saml stempler, når du handler hos {brand.brandName}. Når du har {program.stampsRequired} {stampWord(program.stampsRequired)},
        {program.rewardDescription.trim() ? <> får du: <strong>{program.rewardDescription}</strong>.</> : ' får du en belønning.'}
      </p>
      <div className="flex flex-col gap-3">
        <Button asChild variant="brand" size="lg" className="min-h-12 text-base"><Link href={`${base}/tilmeld`}>Bliv medlem</Link></Button>
        <Button asChild variant="outline" size="lg" className="min-h-12 text-base"><Link href={`${base}/login`}>Log ind</Link></Button>
      </div>
    </section>
  );
}

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { loadMember, loadPortal, portalBase } from './data';
import { SignupBenefits, type SignupCampaigns } from './club-benefits';
import { MemberCard } from './member-card';
import { ProgramClosed } from './program-closed';
import { stampWord } from './texts';

type Props = { params: Promise<{ brandSlug: string }> };

export default async function ClubPage({ params }: Props) {
  const { brandSlug } = await params;
  const [{ brand, program }, member, base] = await Promise.all([loadPortal(brandSlug), loadMember(brandSlug), portalBase(brandSlug)]);

  if (member) return <MemberCard member={member} slug={brandSlug} base={base} />;

  if (!program.active) return <ProgramClosed name={program.name} />;

  return (
    <section aria-labelledby="club-intro" className="flex flex-col gap-4 text-center">
      <h1 id="club-intro" className="text-3xl">{program.name}</h1>
      <p>
        Saml stempler, når du handler hos {brand.brandName}. Når du har {program.stampsRequired} {stampWord(program.stampsRequired)},
        {program.rewardDescription.trim() ? <> får du: <strong>{program.rewardDescription}</strong>.</> : ' får du en belønning.'}
      </p>
      <SignupBenefits campaigns={(program as typeof program & { campaigns?: SignupCampaigns }).campaigns} />
      <div className="flex flex-col gap-3">
        <Button asChild variant="brand" size="lg" className="min-h-12 text-base"><Link href={`${base}/tilmeld`}>Bliv medlem</Link></Button>
        <Button asChild variant="outline" size="lg" className="min-h-12 text-base"><Link href={`${base}/login`}>Log ind</Link></Button>
      </div>
    </section>
  );
}

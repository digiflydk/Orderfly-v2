import { redirect } from 'next/navigation';
import { loadMember, loadPortal, portalBase } from '../data';
import { ProfileSettings } from './profile-settings';

type Props = { params: Promise<{ brandSlug: string }> };

export default async function ProfilePage({ params }: Props) {
  const { brandSlug } = await params;
  const [{ program }, member, base] = await Promise.all([loadPortal(brandSlug), loadMember(brandSlug), portalBase(brandSlug)]);
  if (!member) redirect(`${base}/login`);
  return <ProfileSettings slug={brandSlug} base={base} programName={member.program.name}
    member={{ name: member.member.name, email: member.member.email }}
    newsletter={{ subscribed: member.newsletter.subscribed, consentVersion: program.consentVersion, consentText: program.consentText }} />;
}

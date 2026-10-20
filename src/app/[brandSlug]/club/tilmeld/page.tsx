import { redirect } from 'next/navigation';
import { loadMember, loadPortal, portalBase } from '../data';
import { ProgramClosed } from '../program-closed';
import { SignupForm } from './signup-form';

type Props = { params: Promise<{ brandSlug: string }> };

export default async function SignupPage({ params }: Props) {
  const { brandSlug } = await params;
  const [{ program }, member, base] = await Promise.all([loadPortal(brandSlug), loadMember(brandSlug), portalBase(brandSlug)]);
  if (member) redirect(base);
  if (!program.active) return <ProgramClosed name={program.name} />;
  return <SignupForm slug={brandSlug} base={base} program={{ name: program.name, consentText: program.consentText, consentHelp: program.consentHelp,
    termsAccept: program.termsAccept, consentVersion: program.consentVersion, termsVersion: program.termsVersion }} />;
}

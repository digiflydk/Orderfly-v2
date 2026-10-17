import { loadMember, loadPortal, portalBase } from '../data';
import { LoginFlow } from './login-flow';

type Props = { params: Promise<{ brandSlug: string }> };

// Also the target of the login mail (…/club/login#token=…), so it works even
// while the program is closed: existing members can still open their card.
export default async function LoginPage({ params }: Props) {
  const { brandSlug } = await params;
  const [{ program }, member, base] = await Promise.all([loadPortal(brandSlug), loadMember(brandSlug), portalBase(brandSlug)]);
  return <LoginFlow slug={brandSlug} base={base} programName={program.name} signedIn={!!member} />;
}

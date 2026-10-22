import { redirect } from 'next/navigation';
import { loadMember, portalBase } from '../data';
import { HistoryView } from './history-view';

type Props = { params: Promise<{ brandSlug: string }> };

export default async function HistoryPage({ params }: Props) {
  const { brandSlug } = await params;
  const [member, base] = await Promise.all([loadMember(brandSlug), portalBase(brandSlug)]);
  if (!member) redirect(`${base}/login`);
  return <HistoryView history={member.history} />;
}

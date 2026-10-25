import { redirect } from 'next/navigation';
import { loadMember, loadOrderHistory, portalBase } from '../data';
import { HistoryView } from './history-view';

type Props = { params: Promise<{ brandSlug: string }> };

export default async function HistoryPage({ params }: Props) {
  const { brandSlug } = await params;
  const [member, base] = await Promise.all([loadMember(brandSlug), portalBase(brandSlug)]);
  if (!member) redirect(`${base}/login`);
  const orders = await loadOrderHistory(brandSlug);
  return <HistoryView history={member.history} orders={orders} />;
}

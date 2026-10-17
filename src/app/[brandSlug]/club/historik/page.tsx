import { redirect } from 'next/navigation';
import { loadMember, portalBase } from '../data';
import { danishDate, historyText } from '../texts';

type Props = { params: Promise<{ brandSlug: string }> };

export default async function HistoryPage({ params }: Props) {
  const { brandSlug } = await params;
  const [member, base] = await Promise.all([loadMember(brandSlug), portalBase(brandSlug)]);
  if (!member) redirect(`${base}/login`);
  return (
    <section aria-labelledby="club-history" className="flex flex-col gap-4">
      <h1 id="club-history" className="text-center text-3xl">Historik</h1>
      {member.history.length === 0
        ? <p className="text-center">Du har ingen stempler eller belønninger endnu.</p>
        : (
          <ul className="flex flex-col divide-y rounded-xl border">
            {member.history.map((event, index) => {
              const { label, channel } = historyText(event);
              return (
                <li key={index} className="flex items-baseline justify-between gap-3 p-4">
                  <span className="flex flex-col">
                    <span className="font-semibold">{label}</span>
                    {channel && <span className="text-sm">{channel}</span>}
                  </span>
                  <time dateTime={new Date(event.createdAt).toISOString()} className="shrink-0 text-sm">{danishDate(event.createdAt)}</time>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

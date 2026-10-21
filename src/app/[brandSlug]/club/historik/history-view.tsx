import type { PortalMember } from '../data';
import { danishDate, historyText } from '../texts';

// Pure presentation shared by the authenticated page and isolated browser QA.
export function HistoryView({ history }: { history: PortalMember['history'] }) {
  return (
    <section aria-labelledby="club-history" className="club-member-history flex flex-col gap-4">
      <h1 id="club-history" className="text-center text-3xl">Historik</h1>
      {history.length === 0
        ? <p className="text-center">Du har ingen stempler eller belønninger endnu.</p>
        : (
          <ul className="flex flex-col divide-y rounded-xl border">
            {history.map((event, index) => {
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

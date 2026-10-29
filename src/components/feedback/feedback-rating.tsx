import { Star } from 'lucide-react';

/** Present the saved average without rounding it up to a whole star. */
export function FeedbackRating({ rating }: { rating?: number | null }) {
  if (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    return <span className="text-muted-foreground">Ingen bedømmelse</span>;
  }
  const label = rating.toLocaleString('da-DK', { maximumFractionDigits: 2 });
  return (
    <span role="img" aria-label={`${label} ud af 5 stjerner`} className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className="inline-flex">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} style={{ display: 'inline-block', position: 'relative', width: 16, height: 16 }}>
            <Star size={16} className="text-muted-foreground" />
            <span style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: `${Math.min(1, Math.max(0, rating - index)) * 100}%` }}>
              <Star size={16} className="fill-yellow-400 text-yellow-400" style={{ minWidth: 16 }} />
            </span>
          </span>
        ))}
      </span>
      <span aria-hidden="true">{label} / 5</span>
    </span>
  );
}

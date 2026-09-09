import Link from 'next/link';
import type { PublicReview } from '@/lib/feedback/public-reviews';
export function PublicReviewsView({ locationName, menuHref, reviews, nextHref }: { locationName: string; menuHref: string; reviews: PublicReview[]; nextHref?: string | null }) {
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
    <Link href={menuHref} className="inline-flex min-h-11 items-center underline">Tilbage til menuen</Link>
    <div><h1 className="text-3xl font-bold">Anmeldelser</h1><p className="mt-2 text-muted-foreground">{locationName}</p><p className="mt-2 text-sm text-muted-foreground">Her vises anmeldelser, som restauranten har godkendt til offentlig visning.</p></div>
    {reviews.length === 0 && <p role="status" className="rounded-lg border p-6">Der er endnu ingen offentliggjorte anmeldelser.</p>}
    <div className="space-y-4">{reviews.map(review => <article key={review.id} className="space-y-3 rounded-xl border bg-background p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{review.displayName}</h2>{review.rating !== null && <p aria-label={`Rating ${review.rating.toLocaleString('da-DK')} af 5`} className="font-semibold">★ {review.rating.toLocaleString('da-DK', { maximumFractionDigits: 1 })} / 5</p>}</div>
      {review.comment && <p className="whitespace-pre-wrap break-words">{review.comment}</p>}
      {review.receivedAt && <time dateTime={review.receivedAt} className="block text-sm text-muted-foreground">{new Date(review.receivedAt).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen' })}</time>}
    </article>)}</div>
    {nextHref && <Link className="inline-flex min-h-11 items-center rounded-md border px-4" href={nextHref}>Flere anmeldelser</Link>}
  </main>;
}

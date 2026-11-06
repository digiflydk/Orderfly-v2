import { z } from 'zod';
const reviewSchema = z.object({
  reviewId: z.string().min(1).max(300), starRating: z.enum(['ONE','TWO','THREE','FOUR','FIVE']),
  comment: z.string().max(10000).optional(), createTime: z.string().datetime(), updateTime: z.string().datetime(),
  reviewer: z.object({ displayName: z.string().max(300).optional(), profilePhotoUrl: z.string().url().optional(), isAnonymous: z.boolean().optional() }),
});
export type GoogleReview = z.infer<typeof reviewSchema>;
const pageSchema = z.object({reviews: z.array(reviewSchema).max(50).default([]), nextPageToken: z.string().max(4096).optional()});
export async function fetchGoogleReviews(parent: string, token: string, request: typeof fetch = fetch) {
  if (!/^accounts\/\d+\/locations\/\d+$/.test(parent)) throw new Error('INVALID_LOCATION');
  const reviews: GoogleReview[] = [], seen = new Set<string>();
  let pageToken = '';
  for (let page = 0; page < 100; page++) {
    const url = new URL(`https://mybusiness.googleapis.com/v4/${parent}/reviews`);
    url.searchParams.set('pageSize','50'); url.searchParams.set('orderBy','updateTime desc');
    if (pageToken) url.searchParams.set('pageToken',pageToken);
    const response = await request(url, {headers:{Authorization:`Bearer ${token}`}, cache:'no-store', redirect:'error', signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(response.status === 401 ? 'GOOGLE_AUTH' : response.status === 403 ? 'GOOGLE_ACCESS' : response.status === 429 ? 'GOOGLE_QUOTA' : 'GOOGLE_UNAVAILABLE');
    const data = pageSchema.parse(await response.json());
    for (const review of data.reviews) if (review.starRating === 'FIVE' && !reviews.some(r=>r.reviewId===review.reviewId) && reviews.length < 100) reviews.push(review);
    if (!data.nextPageToken) return reviews;
    if (seen.has(data.nextPageToken)) throw new Error('GOOGLE_PAGINATION');
    seen.add(data.nextPageToken); pageToken = data.nextPageToken;
  }
  throw new Error('GOOGLE_LIMIT');
}

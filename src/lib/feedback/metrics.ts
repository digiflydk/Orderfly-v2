/** Shared definitions for saved feedback, the internal report and public ratings. */
export function feedbackMetrics(feedback: { responses?: unknown; rating?: unknown; npsScore?: unknown }) {
  const responses = feedback.responses && typeof feedback.responses === 'object' && !Array.isArray(feedback.responses)
    ? Object.values(feedback.responses) as Array<{ type?: unknown; answer?: unknown }> : [];
  const stars = responses.filter(r => r?.type === 'stars').map(r => r.answer)
    .filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5);
  const nps = responses.filter(r => r?.type === 'nps').map(r => r.answer)
    .find((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 10);
  const legacyRating = typeof feedback.rating === 'number' && Number.isFinite(feedback.rating) && feedback.rating >= 1 && feedback.rating <= 5 ? feedback.rating : null;
  const legacyNps = typeof feedback.npsScore === 'number' && Number.isInteger(feedback.npsScore) && feedback.npsScore >= 0 && feedback.npsScore <= 10 ? feedback.npsScore : null;
  return {
    // Each reply has equal weight, regardless of how many star questions it contains.
    rating: stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : legacyRating,
    nps: nps ?? legacyNps,
  };
}

export function feedbackTime(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') value = value.toDate();
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export type FeedbackMetricRow = { responses?: unknown; rating?: unknown; npsScore?: unknown; receivedAt?: unknown; brandId?: string; locationId?: string; sourceType?: string };
export function summarizeFeedback(rows: FeedbackMetricRow[]) {
  const metrics = rows.map(feedbackMetrics);
  const ratings = metrics.map(m => m.rating).filter((n): n is number => n !== null);
  const nps = metrics.map(m => m.nps).filter((n): n is number => n !== null);
  const promoters = nps.filter(n => n >= 9).length;
  const detractors = nps.filter(n => n <= 6).length;
  return {
    responses: rows.length,
    ratedResponses: ratings.length,
    averageRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    lowRatings: ratings.filter(n => n <= 2).length,
    npsResponses: nps.length,
    promoters, detractors, passives: nps.length - promoters - detractors,
    nps: nps.length ? 100 * (promoters - detractors) / nps.length : null,
    bookings: rows.filter(r => r.sourceType === 'booking').length,
    orders: rows.filter(r => r.sourceType !== 'booking').length,
  };
}

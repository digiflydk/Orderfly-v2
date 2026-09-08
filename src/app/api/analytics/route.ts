

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { metricPayload } from '@/lib/commerce-metrics';
import { recordCommerceMetric } from '@/lib/server/record-commerce-metric';

export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  try {
    if (Number(req.headers.get('content-length') || 0) > 8192) {
      return NextResponse.json({ error: 'Event is too large.' }, { status: 413 });
    }
    const origin = req.headers.get('origin');
    if (origin && origin !== req.nextUrl.origin) {
      return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
    }
    const raw = await req.json() as Record<string, unknown>;
    const eventId = typeof raw.eventId === 'string' ? raw.eventId : randomUUID();
    const event = metricPayload(raw.name, { ...raw, eventId });
    if (!event?.sessionId || !event.eventId) {
      return NextResponse.json({ error: 'Missing required event data.' }, { status: 400 });
    }
    await recordCommerceMetric(raw.name, event);
    return NextResponse.json({ success: true, eventId });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error tracking event';
    console.error("Failed to track analytics event:", error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}



import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import type { AnalyticsEvent } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const eventData: Omit<AnalyticsEvent, 'id' | 'ts'> = await req.json();

    if (!eventData.name || !eventData.sessionId) {
      return NextResponse.json({ error: 'Missing required event data.' }, { status: 400 });
    }

    const eventRef = doc(collection(db, 'analytics_events'));

    const finalEvent: AnalyticsEvent = {
      ...eventData,
      id: eventRef.id,
      ts: serverTimestamp() as any, // Firestore will replace this
    };
    
    // We use setDoc to ensure the id is the same as the document's ID
    await setDoc(eventRef, finalEvent);

    return NextResponse.json({ success: true, eventId: eventRef.id });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error tracking event';
    console.error("Failed to track analytics event:", error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

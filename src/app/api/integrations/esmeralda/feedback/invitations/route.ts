import { NextResponse } from 'next/server';

import { isValidMachineSecret } from '@/lib/integrations/esmeralda-customer-contract';
import { esmeraldaBookingFeedbackInvitationSchema } from '@/lib/integrations/esmeralda-feedback-contract';
import { createBookingFeedbackInvitation } from '@/lib/integrations/esmeralda-feedback-integration';
import { IntegrationBoundaryError } from '@/lib/integrations/esmeralda-consumer-customer';
import { queueBookingFeedback } from '@/lib/feedback/mail-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SECRET_HEADER = 'x-esmeralda-integration-secret';

export async function POST(request: Request) {
  if (!isValidMachineSecret(
    process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET,
    request.headers.get(SECRET_HEADER),
  )) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = esmeraldaBookingFeedbackInvitationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { invitation, token } = await createBookingFeedbackInvitation(parsed.data);
    const mailJob = invitation.status === 'active' ? await queueBookingFeedback({ brandId: invitation.organization_id, locationId: invitation.location_id, customerId: invitation.customer_id, sourceId: invitation.booking_id, sourceType: 'booking', invitationId: invitation.invitation_id, invitationToken: token }, invitation.starts_at).catch(() => null) : null;
    const origin = new URL(request.url).origin;
    const feedbackPath = `/feedback?token=${encodeURIComponent(token)}`;
    return NextResponse.json(
      {
        invitation_id: invitation.invitation_id,
        status: invitation.status,
        feedback_id: invitation.feedback_id,
        expires_at: invitation.expires_at,
        feedback_path: feedbackPath,
        feedback_url: `${origin}${feedbackPath}`,
        email_queue: mailJob ? 'queued' : 'not_queued',
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof IntegrationBoundaryError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 404 },
      );
    }
    console.error('[esmeralda-feedback-integration] invitation failed', error);
    return NextResponse.json({ error: 'integration_failure' }, { status: 500 });
  }
}

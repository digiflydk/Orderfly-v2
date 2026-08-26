import { NextResponse } from 'next/server';

import { isValidMachineSecret } from '@/lib/integrations/esmeralda-customer-contract';
import { esmeraldaCustomerHistorySchema } from '@/lib/integrations/esmeralda-feedback-contract';
import { getEsmeraldaConsumerCustomerHistory } from '@/lib/integrations/esmeralda-feedback-integration';
import { IntegrationBoundaryError } from '@/lib/integrations/esmeralda-consumer-customer';

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

  const parsed = esmeraldaCustomerHistorySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await getEsmeraldaConsumerCustomerHistory(parsed.data),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof IntegrationBoundaryError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 404 },
      );
    }
    console.error('[esmeralda-customer-integration] history failed', error);
    return NextResponse.json({ error: 'integration_failure' }, { status: 500 });
  }
}

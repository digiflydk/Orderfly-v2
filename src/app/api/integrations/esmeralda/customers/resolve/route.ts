import { NextResponse } from 'next/server';

import {
  esmeraldaConsumerCustomerSchema,
  isValidMachineSecret,
} from '@/lib/integrations/esmeralda-customer-contract';
import {
  IntegrationBoundaryError,
  IntegrationConflictError,
  resolveOrUpsertEsmeraldaConsumerCustomer,
} from '@/lib/integrations/esmeralda-consumer-customer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SECRET_HEADER = 'x-esmeralda-integration-secret';

export async function POST(request: Request) {
  const suppliedSecret = request.headers.get(SECRET_HEADER);
  const expectedSecret = process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET;

  if (!isValidMachineSecret(expectedSecret, suppliedSecret)) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_json' },
      { status: 400 },
    );
  }

  const parsed = esmeraldaConsumerCustomerSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_payload',
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const resolution = await resolveOrUpsertEsmeraldaConsumerCustomer(
      parsed.data,
    );

    return NextResponse.json(resolution, { status: 200 });
  } catch (error) {
    if (error instanceof IntegrationBoundaryError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 404 },
      );
    }

    if (error instanceof IntegrationConflictError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: 409 },
      );
    }

    console.error('[esmeralda-customer-integration] resolve failed', error);
    return NextResponse.json(
      { error: 'integration_failure' },
      { status: 500 },
    );
  }
}

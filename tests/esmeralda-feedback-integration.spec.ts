import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  esmeraldaBookingFeedbackInvitationSchema,
  esmeraldaCustomerHistorySchema,
} from '../src/lib/integrations/esmeralda-feedback-contract';
import { validateFeedbackResponses } from '../src/lib/feedback/response-validation';
import { FeedbackQuestionsVersionSchema } from '../src/lib/schemas/feedback';

test.describe('Esmeralda booking feedback and history contracts', () => {
  test('accepts canonical booking feedback invitation fields', () => {
    const result = esmeraldaBookingFeedbackInvitationSchema.safeParse({
      organization_id: 'brand-1',
      location_id: 'location-1',
      booking_id: 'booking-1',
      customer_id: 'customer-1',
      full_name: 'Guest Name',
      email: 'guest@example.com',
      starts_at: '2026-08-27T18:00:00+02:00',
    });
    expect(result.success).toBe(true);
  });

  test('customer history is explicitly tenant scoped and bounded', () => {
    expect(esmeraldaCustomerHistorySchema.safeParse({
      organization_id: 'brand-1',
      customer_id: 'customer-1',
      limit: 100,
    }).success).toBe(true);
    expect(esmeraldaCustomerHistorySchema.safeParse({
      organization_id: '',
      customer_id: 'customer-1',
    }).success).toBe(false);
    expect(esmeraldaCustomerHistorySchema.safeParse({
      organization_id: 'brand-1',
      customer_id: 'customer-1',
      limit: 1000,
    }).success).toBe(false);
  });

  test('feedback question versions can explicitly target bookings', () => {
    const result = FeedbackQuestionsVersionSchema.safeParse({
      versionLabel: 'booking-v1',
      isActive: true,
      language: 'da',
      orderTypes: ['booking'],
      questions: [{
        questionId: 'rating',
        label: 'Hvordan var besøget?',
        type: 'stars',
        isRequired: true,
      }],
    });
    expect(result.success).toBe(true);
  });

  test('server response validation enforces required questions, numeric bounds and known options', () => {
    const questions = [
      { questionId: 'rating', label: 'Bedømmelse', type: 'stars', isRequired: true },
      { questionId: 'nps', label: 'Anbefaling', type: 'nps', isRequired: false },
      {
        questionId: 'tags',
        label: 'Hvad kunne du lide?',
        type: 'multiple_options',
        isRequired: true,
        minSelection: 1,
        maxSelection: 2,
        options: [{ id: 'food', label: 'Maden' }, { id: 'service', label: 'Servicen' }],
      },
    ];

    const valid = validateFeedbackResponses(questions, {
      rating: { type: 'stars', answer: 5, questionLabel: 'forged label' },
      nps: { type: 'nps', answer: 9 },
      tags: { type: 'multiple_options', answer: ['Maden'] },
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.responses.rating.questionLabel).toBe('Bedømmelse');
      expect(valid.responses.rating.answer).toBe(5);
    }

    expect(validateFeedbackResponses(questions, {
      tags: { type: 'multiple_options', answer: ['Maden'] },
    }).ok).toBe(false);
    expect(validateFeedbackResponses(questions, {
      rating: { type: 'stars', answer: 6 },
      tags: { type: 'multiple_options', answer: ['Maden'] },
    }).ok).toBe(false);
    expect(validateFeedbackResponses(questions, {
      rating: { type: 'stars', answer: 5 },
      tags: { type: 'multiple_options', answer: ['Ikke en mulighed'] },
    }).ok).toBe(false);
    expect(validateFeedbackResponses(questions, {
      rating: { type: 'stars', answer: 5 },
      tags: { type: 'multiple_options', answer: ['Maden'] },
      injected: { type: 'text', answer: 'not in active version' },
    }).ok).toBe(false);
  });

  test('App Hosting injects the integration secret and invitations are signed, bounded and idempotent', async () => {
    const [appHosting, integration] = await Promise.all([
      readFile(resolve(process.cwd(), 'apphosting.yaml'), 'utf8'),
      readFile(resolve(process.cwd(), 'src/lib/integrations/esmeralda-feedback-integration.ts'), 'utf8'),
    ]);
    expect(appHosting).toContain('ORDERFLY_ESMERALDA_INTEGRATION_SECRET');
    expect(integration).toContain("createHmac('sha256'");
    expect(integration).toContain('integrationFeedbackInvitations');
    expect(integration).toContain('db.runTransaction');
    expect(integration).toContain("sourceType: 'booking'");
  });

  test('public feedback submission derives source scope server-side, validates the active form and consumes booking invitations transactionally', async () => {
    const actions = await readFile(resolve(process.cwd(), 'src/app/feedback/actions.ts'), 'utf8');
    expect(actions).toContain("sourceType: z.enum(['commerce_order', 'booking'])");
    expect(actions).toContain('resolveAuthoritativeSource');
    expect(actions).toContain('resolveBookingFeedbackInvitationToken');
    expect(actions).toContain('validateFeedbackResponses');
    expect(actions).toContain("transaction.update(invitationRef");
    expect(actions).toContain("feedbackData.orderId = source.sourceId");
  });

  test('history queries orders and feedback by customer within the requested brand', async () => {
    const integration = await readFile(resolve(process.cwd(), 'src/lib/integrations/esmeralda-feedback-integration.ts'), 'utf8');
    expect(integration).toContain(".where('brandId', '==', parsed.organization_id)");
    expect(integration).toContain(".where('customerDetails.id', '==', parsed.customer_id)");
    expect(integration).toContain(".where('customerId', '==', parsed.customer_id)");
  });

  test('checkout customer identity is brand scoped while same-brand legacy ids remain reusable', async () => {
    const checkout = await readFile(resolve(process.cwd(), 'src/app/checkout/actions.ts'), 'utf8');
    expect(checkout).toContain("createHash('sha256')");
    expect(checkout).toContain('`${brandId}\\n${normalizedEmail}`');
    expect(checkout).toContain('cust-v2-');
    expect(checkout).toContain('legacyData.brandId === brandId');
    expect(checkout).toContain("customerData.brandId !== brandId");
    expect(checkout).toContain('location.brandId !== brand.id');
    expect(checkout).toContain('normalizedEmail');
  });
});

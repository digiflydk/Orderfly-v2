import type { FeedbackQuestion } from '@/types';

export type FeedbackSourceType = 'commerce_order' | 'booking' | 'dine_in';
export type FeedbackExperienceType = 'pickup' | 'delivery' | 'booking';

export type ExperienceFeedbackQuestionsVersion = {
  id: string;
  versionLabel: string;
  isActive: boolean;
  scope?: 'default' | 'brand';
  brandId?: string | null;
  language: string;
  orderTypes: FeedbackExperienceType[];
  questions: FeedbackQuestion[];
};

export type FeedbackSourceContext = {
  sourceType: FeedbackSourceType;
  sourceId: string;
  customerId: string;
  locationId: string;
  brandId: string;
  brandName: string;
  brandLogoUrl?: string | null;
  displayReference: string;
  experienceType: FeedbackExperienceType;
  invitationToken?: string;
};

export type CanonicalFeedbackRecord = {
  id: string;
  sourceType: FeedbackSourceType;
  sourceId: string;
  orderId?: string;
  customerId: string;
  locationId: string;
  brandId: string;
  receivedAt: Date;
  rating: number;
  npsScore?: number;
  comment?: string;
  tags?: string[];
  questionVersionId: string;
  language: string;
  showPublicly: boolean;
  maskCustomerName: boolean;
  answeredVia?: 'email' | 'webshop' | 'app' | 'qr';
  internalNote?: string;
  autoResponseSent: boolean;
  responses: unknown;
};

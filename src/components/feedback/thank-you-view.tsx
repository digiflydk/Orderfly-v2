import { Check } from 'lucide-react';
import { ExperienceShell } from '@/components/feedback/experience-shell';
import { feedbackCopy, isEsmeraldaFeedback } from '@/lib/feedback/presentation';

export function FeedbackThankYouView({ brandId, brandName, logoUrl, href, language }: { brandId: string; brandName: string; logoUrl?: string | null; href: string; language: 'da' | 'en' }) {
  const copy = feedbackCopy[language];
  const esmeralda = isEsmeraldaFeedback(brandId);
  return <ExperienceShell brandId={brandId} brandName={brandName} logoUrl={logoUrl}>
    <div className="px-5 py-10 text-left sm:px-10 sm:py-12">
      <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-full border border-[var(--feedback-accent)] bg-transparent"><Check aria-hidden="true" className="h-7 w-7 text-[var(--feedback-accent)]" /></div>
      <h1 className="heading-style-h1">{copy.thanks}</h1>
      <p className="mt-5 text-size-regular text-[var(--feedback-muted)]">{copy.received}</p>
      <p className="mt-4 text-size-regular text-[var(--feedback-muted)]">{copy.welcome}</p>
      <a href={href} className={`mt-9 inline-flex items-center justify-center ${esmeralda ? "button" : "rounded-md bg-primary px-4 py-2 text-primary-foreground"}`}>{copy.home}</a>
    </div>
  </ExperienceShell>;
}

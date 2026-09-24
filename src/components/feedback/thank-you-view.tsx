import { Check } from 'lucide-react';
import { ExperienceShell } from '@/components/feedback/experience-shell';
import { feedbackCopy } from '@/lib/feedback/presentation';

export function FeedbackThankYouView({ brandId, brandName, logoUrl, href, language }: { brandId: string; brandName: string; logoUrl?: string | null; href: string; language: 'da' | 'en' }) {
  const copy = feedbackCopy[language];
  return <ExperienceShell brandId={brandId} brandName={brandName} logoUrl={logoUrl}>
    <div className="px-5 py-10 text-left sm:px-10 sm:py-12">
      <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-full border border-[#e9aa3f] bg-transparent"><Check aria-hidden="true" className="h-7 w-7 text-[#e9aa3f]" /></div>
      <h1 className="heading-style-h1">{copy.thanks}</h1>
      <p className="mt-5 text-size-regular text-white/80">{copy.received}</p>
      <p className="mt-4 text-size-regular text-white/80">{copy.welcome}</p>
      <a href={href} className="button mt-9 inline-flex items-center justify-center">{copy.home}</a>
    </div>
  </ExperienceShell>;
}

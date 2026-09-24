import { Check } from 'lucide-react';
import { ExperienceShell } from '@/components/feedback/experience-shell';
import { feedbackCopy } from '@/lib/feedback/presentation';

export function FeedbackThankYouView({ brandId, brandName, logoUrl, href, language }: { brandId: string; brandName: string; logoUrl?: string | null; href: string; language: 'da' | 'en' }) {
  const copy = feedbackCopy[language];
  return <ExperienceShell brandId={brandId} brandName={brandName} logoUrl={logoUrl}>
    <div className="px-6 py-14 text-center sm:px-12 sm:py-16">
      <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-full border border-[#d3bd8b] bg-[#f2e8d0]"><Check aria-hidden="true" className="h-7 w-7 text-[#806326]" /></div>
      <h1 className="font-serif text-3xl leading-tight sm:text-4xl">{copy.thanks}</h1>
      <p className="mt-5 text-base leading-7 text-[#65665b]">{copy.received}</p>
      <p className="mt-4 text-base leading-7 text-[#65665b]">{copy.welcome}</p>
      <a href={href} className="mt-9 inline-flex min-h-12 items-center justify-center rounded-lg bg-[#c5a358] px-7 py-3 font-semibold text-[#171c19] hover:bg-[#d4b778] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">{copy.home}</a>
    </div>
  </ExperienceShell>;
}

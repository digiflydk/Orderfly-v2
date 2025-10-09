
import type { SectionPadding, SectionVisibility } from "@/types/settings";

export type SectionKey = keyof SectionVisibility;

const ALL_SECTIONS: SectionKey[] = ['feature', 'services', 'aiProject', 'cases', 'about', 'customers', 'contact'];


export function ensureAllSectionPadding(
  partial: Partial<Record<SectionKey, SectionPadding>> | undefined,
  defaultPadding: SectionPadding
): Record<SectionKey, SectionPadding> {
  const full: Partial<Record<SectionKey, SectionPadding>> = { ...partial };

  for (const key of ALL_SECTIONS) {
    if (!full[key]) {
      full[key] = { ...defaultPadding };
    } else {
        full[key] = { ...defaultPadding, ...full[key] };
    }
  }

  return full as Record<SectionKey, SectionPadding>;
}

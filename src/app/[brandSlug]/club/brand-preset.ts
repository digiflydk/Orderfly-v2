import { esmeraldaFeedbackAssets } from '@/lib/feedback/brand-styles';

// Brand look for the customer portal, gathered here so it can later come from
// dynamic brand settings. Colours come from the brand layout (and the fixed
// Esmeralda preset in commerce-ui.css); this adds the logo variant and font files.
export type PortalPreset = { logoUrl: string | null; logoAlt: string; fontCss: string | null };

export function portalPreset(brand: { slug: string; name: string; logoUrl?: string | null }): PortalPreset {
  if (brand.slug === 'esmeralda') return {
    // The white logo for black surfaces, as on Esmeralda's own site header.
    logoUrl: esmeraldaFeedbackAssets.logo, logoAlt: 'Esmeralda Pizza & Restaurant',
    // Bourton for headings and Brandon for body text, named as in commerce-ui.css.
    fontCss: `@font-face{font-family:'Bourton Base';src:url('${esmeraldaFeedbackAssets.headingFont}') format('woff2');font-weight:400;font-style:normal;font-display:swap}`
      + `@font-face{font-family:'Brandon Text Office Regular';src:url('${esmeraldaFeedbackAssets.bodyFont}') format('truetype');font-weight:400;font-style:normal;font-display:swap}`,
  };
  return { logoUrl: brand.logoUrl || null, logoAlt: brand.name, fontCss: null };
}

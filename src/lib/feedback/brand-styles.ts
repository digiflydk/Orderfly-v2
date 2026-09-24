// Verified against Webflow site 6a6c7110638d57d95365ad1c and its published CSS.
// Source: rules/universal-layout-and-typography.md, heading-style-h1, .button,
// es-header-v2__logo, booking-page-shell and booking-widget-card (2026-09-24).
export const esmeraldaFeedbackAssets = {
  logo: 'https://cdn.prod.website-files.com/6a6c7110638d57d95365ad1c/6a6c7110638d57d95365ad49_esmeralda-logo.png',
  headingFont: 'https://cdn.prod.website-files.com/6a6c7110638d57d95365ad1c/6a6c7110638d57d95365ad5f_bourtonbase.woff2',
  bodyFont: 'https://cdn.prod.website-files.com/6a6c7110638d57d95365ad1c/6a6c7110638d57d95365adaf_6a646c4127950450c3d25664-BrandonTextOffice-Regular.ttf',
};
export const esmeraldaFeedbackStyles = `
@font-face{font-family:'Bourton Base';src:url('${esmeraldaFeedbackAssets.headingFont}') format('woff2');font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:'Brandon Text Office Regular';src:url('${esmeraldaFeedbackAssets.bodyFont}') format('truetype');font-weight:400;font-style:normal;font-display:swap}
[data-brand="restaurant"]{--feedback-accent:hsl(var(--primary));--feedback-muted:hsl(var(--muted-foreground));--feedback-border:hsl(var(--border));--feedback-input:hsl(var(--background));--feedback-ink:hsl(var(--foreground));--feedback-hover:hsl(var(--accent));--feedback-selected-ink:hsl(var(--primary-foreground))}
[data-brand="restaurant"] .heading-style-h1{font-size:1.5rem;font-weight:700;line-height:1.2}
[data-brand="esmeralda"]{--feedback-accent:#e9aa3f;--feedback-muted:#cccccc;--feedback-border:#555555;--feedback-input:#000000;--feedback-ink:#ffffff;--feedback-hover:#2d2d2d;--feedback-selected-ink:#000000;font-family:'Brandon Text Office Regular',Arial,sans-serif;font-size:16px;line-height:1.5;text-align:left}
[data-brand="esmeralda"] footer{color:#cccccc}
[data-brand="esmeralda"] .heading-style-h1{font-family:'Bourton Base',Impact,sans-serif;font-size:38px;font-weight:400;line-height:1.1;text-align:left}
[data-brand="esmeralda"] .text-size-regular{font-family:'Brandon Text Office Regular',Arial,sans-serif;font-size:16px;line-height:1.5}
[data-brand="esmeralda"] .button{font-family:'Bourton Base',Impact,sans-serif;font-size:16px;font-weight:400;text-transform:uppercase;color:#2a1000;background:#e9aa3f;border-radius:10px;padding:14px 40px;height:auto;min-height:50px;white-space:normal}
[data-brand="esmeralda"] .button:hover{background:#2a1000;color:white}
[data-brand="esmeralda"] .button:focus-visible{outline:2px solid white;outline-offset:4px}
[data-brand="esmeralda"] .es-header-v2__logo{display:block;width:142px;height:auto;max-height:96px;object-fit:contain}
@media(max-width:479px){[data-brand="esmeralda"] .es-header-v2__logo{width:104px;max-height:62px}[data-brand="esmeralda"] .button{padding-left:16px;padding-right:16px}}
`;

// Copy for the Orderfly marketing landing on orderfly.dk/ (#814).
// Only features that exist in the codebase are listed. Prices, binding terms
// and company details are intentionally absent until the owner provides them.

/** Public contact address for "Book en demo". Must be confirmed by the owner before release (#814). */
export const ORDERFLY_CONTACT_EMAIL = 'kontakt@orderfly.dk';

export const DEMO_MAILTO = `mailto:${ORDERFLY_CONTACT_EMAIL}?subject=${encodeURIComponent('Demo af Orderfly')}`;

/** Merchant/admin login. */
export const LOGIN_HREF = '/admin-login';

/** A real, public Orderfly webshop shown as an example. */
export const EXAMPLE_SHOP_HREF = 'https://esmeralda.orderfly.dk';

export type IconName =
  | 'globe' | 'options' | 'card' | 'terminal' | 'printer' | 'star'
  | 'tag' | 'gift' | 'chat' | 'users' | 'store' | 'truck';

export type Feature = { icon: IconName; title: string; text: string; comingSoon?: boolean };

export const FEATURES: Feature[] = [
  { icon: 'globe', title: 'Egen webshop', text: 'Mobilvenlig menu på din egen adresse (ditbrand.orderfly.dk). Afhentning, levering og forudbestilling – med dit logo og dine farver.' },
  { icon: 'options', title: 'Tilvalg og menutilbud', text: 'Ekstra toppings, valg af bund, min./maks.-regler og “Gør det til en menu” med drikke og tilbehør, så kurven bliver større.' },
  { icon: 'card', title: 'Online betaling', text: 'Sikker betaling i checkout via Stripe. Kunden får kvittering på mail.' },
  { icon: 'terminal', title: 'Ordreterminal', text: 'Touchskærm til køkkenet med nye, igangværende og klare ordrer. Forudbestillinger og historik med søgning.' },
  { icon: 'printer', title: 'Automatisk bonprint', text: 'Køkken- og kundebon printes automatisk på Star CloudPRNT-printere. Genudskriv med ét tryk.' },
  { icon: 'star', title: 'Digitalt stempelkort', text: 'Kunderne samler stempler i en Club-portal på mobilen. Personalet scanner QR-koden ved kassen og giver stempel eller indløser.' },
  { icon: 'tag', title: 'Rabatter og kampagner', text: 'Rabatkoder, automatiske tilbud som “3 for 2”, gratis levering over et beløb, tidsstyrede tilbud og personlige rabatkort.' },
  { icon: 'gift', title: 'Spil og skrabelodder', text: 'Engagér kunderne med digitale skrabelodder. Gevinster kan bruges online eller indløses i restauranten.' },
  { icon: 'chat', title: 'Feedback og anmeldelser', text: 'Saml feedback via QR-kode ved bordet eller efter ordren, og inviter tilfredse kunder videre til Google eller Trustpilot.' },
  { icon: 'users', title: 'Kunder og nyhedsbrev', text: 'Samlet kundeliste med samtykker og cookiestyring. Synkronisering med Omnisend til nyhedsbreve og automatiske mails.' },
  { icon: 'store', title: 'Flere brands og afdelinger', text: 'Styr flere restauranter fra ét login, med roller og rettigheder til ejere, ledere og personale.' },
  { icon: 'truck', title: 'Levering med Wolt Drive', text: 'Book bud direkte fra ordren – uden egne chauffører.', comingSoon: true },
];

export const BENEFITS = [
  { title: 'Dit brand, dine kunder', text: 'Kunderne bestiller på din egen webshop – ikke på en markedsplads. Kundeliste og samtykker bliver hos dig.' },
  { title: 'Én platform til driften', text: 'Menu, ordrer, print, rabatter og loyalitet styres samme sted – for én eller flere afdelinger.' },
  { title: 'Kunder der kommer igen', text: 'Digitalt stempelkort, kampagner og nyhedsbrev gør førstegangskunden til stamkunde.' },
];

export const STEPS = [
  { title: 'Vi sætter din menu op', text: 'Send dit menukort. Vi lægger retter, priser, billeder og tilvalg ind og tilpasser webshoppen til dit brand.' },
  { title: 'Tilslut betaling og printer', text: 'Forbind betalingen, sæt ordreterminalen op på en tablet og tilslut bonprinteren i køkkenet.' },
  { title: 'Gå live og del linket', text: 'Del din adresse på hjemmesiden, Google og sociale medier – og tag imod ordrer.' },
];

export const LOYALTY_POINTS = [
  'Antal stempler, minimumsbeløb, belønning og gyldighed sættes pr. brand',
  'Kassevisning til tablet med medarbejder-PIN og automatisk log ud',
  'Overblik over medlemmer, stempler og indløsninger – med fuld log',
  'Færdige vilkår og versionerede samtykketekster',
];

export const PLANS = [
  { name: 'Basis', text: 'Webshop, online betaling, ordreterminal og bonprint.', highlighted: false },
  { name: 'Plus', text: 'Alt i Basis plus stempelkort, rabatter, kampagner, spil og feedback.', highlighted: true },
  { name: 'Kæde', text: 'Flere brands og afdelinger, roller og rettigheder samt hjælp til opsætning.', highlighted: false },
];

export const FAQ = [
  { q: 'Hvilken adresse får min webshop?', a: 'Alle restauranter får en adresse som ditbrand.orderfly.dk, som du kan linke til fra din egen hjemmeside, Google og sociale medier.' },
  { q: 'Hvilken hardware skal jeg bruge?', a: 'En tablet til ordreterminalen og en Star-bonprinter med CloudPRNT. Kassevisningen til stempelkort virker på iPad og Android-tablets.' },
  { q: 'Kan jeg have flere restauranter?', a: 'Ja. Du kan have flere brands og afdelinger under ét login og give medarbejderne præcis de rettigheder, de skal bruge.' },
  { q: 'Hvad koster det?', a: 'Prisen afhænger af antal afdelinger og moduler. Book en demo, så får du et konkret tilbud.' },
];

export const NAV_LINKS = [
  { href: '#funktioner', label: 'Funktioner' },
  { href: '#saadan', label: 'Sådan virker det' },
  { href: '#loyalitet', label: 'Loyalitet' },
  { href: '#pakker', label: 'Pakker' },
  { href: '#faq', label: 'FAQ' },
];

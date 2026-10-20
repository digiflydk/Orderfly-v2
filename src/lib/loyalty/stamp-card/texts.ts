// Standard texts for the stamp card: consent, terms acceptance and terms.
// Pure and free of I/O so the admin preview and the customer portal render
// exactly the same text from the same input.
//
// Templates are versioned here. A published version is never edited; a change
// is a new entry at the end of TEMPLATE_VERSIONS. Brands copy the current
// version when they create a stamp card and keep their copy until they restore it.

export const TEXT_FIELDS = ['consentText', 'consentHelp', 'termsAccept', 'terms'] as const;
export type TextField = typeof TEXT_FIELDS[number];
export type ProgramTexts = Record<TextField, string>;

export const TEXT_FIELD_LABELS: Record<TextField, string> = {
  consentText: 'Samtykketekst', consentHelp: 'Forklaring under samtykket', termsAccept: 'Accept af vilkår', terms: 'Vilkår',
};

export const PLACEHOLDERS = {
  brand_navn: 'Brandets navn',
  programnavn: 'Programnavn',
  virksomhed_navn: 'Juridisk virksomhedsnavn',
  virksomhed_adresse: 'Virksomhedens adresse',
  cvr: 'CVR-nr.',
  kontakt_email: 'Kontakt-e-mail',
  privatlivspolitik_url: 'Link til privatlivspolitik',
  'minimumsbeløb': 'Minimumsbeløb pr. køb (kr.)',
  antal_stempler: 'Stempler til belønning',
  'belønning': 'Beskrivelse af belønning',
  'belønning_gyldighed': 'Belønningens gyldighed (måneder)',
  stempel_gyldighed: 'Kortets gyldighed ved inaktivitet (måneder)',
  'aldersgrænse': 'Aldersgrænse',
  'stempler_pr_køb': 'Stempler pr. kvalificerende køb',
  maks_stempler_pr_dag: 'Maks. stempler pr. medlem pr. dag',
  version: 'Tekstens versionsnummer',
  'gældende_fra': 'Tekstens gældende-fra-dato',
} as const;
export type Placeholder = keyof typeof PLACEHOLDERS;

export const CONDITIONS = {
  rabat_giver_stempel: 'Rabat- og kampagneordrer giver stempel',
  'flere_stempler_pr_køb': 'Et køb giver mere end ét stempel',
  'dagsgrænse': 'Der er en grænse for stempler pr. dag',
  restaurant_og_takeaway: 'Både køb i restauranten og takeaway giver stempel',
  kun_restaurant: 'Kun køb i restauranten giver stempel',
  kun_takeaway: 'Kun takeaway bestilt direkte giver stempel',
  flere_afdelinger: 'Kortet gælder på tværs af flere afdelinger',
} as const;
export type Condition = keyof typeof CONDITIONS;

// Values that come from the brand's master data, edited under Brands.
export const BRAND_PLACEHOLDERS: readonly Placeholder[] = [
  'brand_navn', 'virksomhed_navn', 'virksomhed_adresse', 'cvr', 'kontakt_email', 'privatlivspolitik_url',
];

const TOKEN = /\{([^{}\n]*)\}/g;
const isPlaceholder = (name: string): name is Placeholder => Object.prototype.hasOwnProperty.call(PLACEHOLDERS, name);
const isCondition = (name: string): name is Condition => Object.prototype.hasOwnProperty.call(CONDITIONS, name);

type Token = { kind: 'value'; name: Placeholder } | { kind: 'if'; name: Condition; negate: boolean } | { kind: 'end' };

function token(raw: string): Token | null {
  if (raw === '/hvis') return { kind: 'end' };
  const conditional = /^#hvis (ikke )?([a-zæøå_]+)$/.exec(raw);
  if (conditional) return isCondition(conditional[2]) ? { kind: 'if', name: conditional[2], negate: !!conditional[1] } : null;
  return isPlaceholder(raw) ? { kind: 'value', name: raw } : null;
}

// A Danish message for the first problem in a template, or null when it is valid.
// Conditional sections open and close on the same line, cannot be nested, and
// every brace must belong to a known placeholder, so a typo never reaches a customer.
export function checkTemplate(text: string): string | null {
  for (const line of text.split('\n')) {
    let open = false, last = 0;
    for (const match of line.matchAll(TOKEN)) {
      if (/[{}]/.test(line.slice(last, match.index))) return 'En krøllet parentes står alene. Brug kun de viste pladsholdere.';
      last = match.index! + match[0].length;
      const t = token(match[1]);
      if (!t) return `Ukendt pladsholder: {${match[1]}}`;
      if (t.kind === 'if') { if (open) return 'Et betinget afsnit kan ikke stå inde i et andet.'; open = true; }
      if (t.kind === 'end') { if (!open) return '{/hvis} mangler et {#hvis …} før sig.'; open = false; }
    }
    if (/[{}]/.test(line.slice(last))) return 'En krøllet parentes står alene. Brug kun de viste pladsholdere.';
    if (open) return 'Et betinget afsnit skal afsluttes med {/hvis} på samme linje.';
  }
  return null;
}

export type TextValues = { values: Record<Placeholder, string | null>; conditions: Record<Condition, boolean> };

// Fills one template. A placeholder without a value is reported in `missing`;
// the caller must not show the text then. A line that held only conditional
// sections and renders empty is dropped, so a hidden sentence leaves no gap.
export function renderTemplate(text: string, input: TextValues): { text: string; missing: Placeholder[] } {
  if (checkTemplate(text)) throw new Error('invalid_template');
  const missing = new Set<Placeholder>(), lines: string[] = [];
  for (const line of text.split('\n')) {
    let out = '', last = 0, show = true, conditional = false;
    for (const match of line.matchAll(TOKEN)) {
      if (show) out += line.slice(last, match.index);
      last = match.index! + match[0].length;
      const t = token(match[1])!;
      if (t.kind === 'if') { conditional = true; show = input.conditions[t.name] !== t.negate; }
      else if (t.kind === 'end') show = true;
      else if (show) {
        const value = input.values[t.name];
        if (value === null || value.trim() === '') { missing.add(t.name); out += `{${t.name}}`; } else out += value;
      }
    }
    out += line.slice(last);
    if (!(conditional && out.trim() === '')) lines.push(out);
  }
  return { text: lines.join('\n'), missing: [...missing] };
}

// Every text the customer sees, filled. `missing` lists placeholders without a
// value and `invalid` templates that cannot be read; either means the texts
// must not be shown.
export function renderProgramTexts(texts: ProgramTexts, input: TextValues) {
  const missing = new Map<Placeholder, TextField[]>(), rendered = {} as ProgramTexts, invalid: TextField[] = [];
  for (const field of TEXT_FIELDS) {
    if (checkTemplate(texts[field])) { invalid.push(field); rendered[field] = ''; continue; }
    const result = renderTemplate(texts[field], input);
    rendered[field] = result.text;
    for (const name of result.missing) missing.set(name, [...(missing.get(name) || []), field]);
  }
  return { texts: rendered, invalid, missing: [...missing].map(([placeholder, fields]) => ({ placeholder, fields })) };
}

// ---------- Values ----------

export type BrandTextSource = Partial<Record<'name' | 'companyName' | 'street' | 'zipCode' | 'city' | 'companyRegNo' | 'supportEmail' | 'privacyUrl', unknown>>;
export type TextSettings = {
  name: string; minimumAmountOre: number; stampsRequired: number; rewardDescription: string; rewardValidityMonths: number;
  cardValidityMonths: number; minimumAge: number; discountedOrdersQualify: boolean; crossLocation: boolean; stampsPerPurchase: number;
  counterChannels: readonly string[]; maxStampsPerDay: number | null;
};

const str = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

// Same composition as the seller address on invoices (order-invoice.ts), without the country code.
export function brandAddress(brand: BrandTextSource) {
  const street = str(brand.street), postal = [str(brand.zipCode), str(brand.city)].filter(Boolean).join(' ');
  return street && str(brand.zipCode) && str(brand.city) ? `${street}, ${postal}` : null;
}

export function formatKr(ore: number) {
  return new Intl.NumberFormat('da-DK', { minimumFractionDigits: ore % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(ore / 100);
}

const DATE = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Copenhagen' });
// Dates as Danish customers read them, in Danish time.
export const danishDate = (epochMs: number) => DATE.format(new Date(epochMs));

// "Gratis pizza" reads as "gratis pizza" mid-sentence; acronyms such as "VIP-menu" keep their capitals.
export const lowerFirst = (text: string) => /^\p{Lu}\p{Ll}/u.test(text) ? text[0].toLocaleLowerCase('da-DK') + text.slice(1) : text;

export function textValues(input: { brand: BrandTextSource; settings: TextSettings; activeLocations: number; version: number | null; effectiveFrom: number | null }): TextValues {
  const { brand, settings: s } = input, reward = s.rewardDescription.trim();
  // The terms name the channels that give stamps today: dine-in and takeaway at the counter.
  // Stamps from Orderfly orders (orderTypes) are not switched on yet, so they are not promised;
  // when they are, this and textKey must include them.
  const restaurant = s.counterChannels.includes('dine_in'), takeaway = s.counterChannels.includes('takeaway');
  return {
    values: {
      brand_navn: str(brand.name), programnavn: str(s.name), virksomhed_navn: str(brand.companyName), virksomhed_adresse: brandAddress(brand),
      cvr: str(brand.companyRegNo), kontakt_email: str(brand.supportEmail), privatlivspolitik_url: str(brand.privacyUrl),
      'minimumsbeløb': formatKr(s.minimumAmountOre), antal_stempler: String(s.stampsRequired), 'belønning': reward ? lowerFirst(reward) : null,
      'belønning_gyldighed': String(s.rewardValidityMonths), stempel_gyldighed: String(s.cardValidityMonths), 'aldersgrænse': String(s.minimumAge),
      'stempler_pr_køb': String(s.stampsPerPurchase), maks_stempler_pr_dag: s.maxStampsPerDay === null ? null : String(s.maxStampsPerDay),
      version: input.version ? String(input.version) : null, 'gældende_fra': input.effectiveFrom ? danishDate(input.effectiveFrom) : null,
    },
    conditions: { rabat_giver_stempel: s.discountedOrdersQualify, flere_afdelinger: s.crossLocation && input.activeLocations > 1,
      'flere_stempler_pr_køb': s.stampsPerPurchase > 1, 'dagsgrænse': s.maxStampsPerDay !== null,
      restaurant_og_takeaway: restaurant && takeaway, kun_restaurant: restaurant && !takeaway, kun_takeaway: takeaway && !restaurant },
  };
}

// What a published text version consists of: the templates and every setting a
// placeholder or condition reads. Brand master data is not part of it, so
// changing an address does not create a new version (owner decision 2026-10-19).
export function textKey(settings: ProgramTexts & TextSettings) {
  const s = settings;
  return JSON.stringify([TEXT_FIELDS.map(f => s[f]), s.name, s.minimumAmountOre, s.stampsRequired, s.rewardDescription.trim(),
    s.rewardValidityMonths, s.cardValidityMonths, s.minimumAge, s.discountedOrdersQualify, s.crossLocation, s.stampsPerPurchase,
    [...s.counterChannels].sort(), s.maxStampsPerDay]);
}

type PublishedTexts = { version: number; effectiveFrom: number | null; key: string | null };

// The text version customers will see once the settings are saved: a changed
// textKey on an active program publishes the next version from that moment.
export function nextTextMeta(settings: ProgramTexts & TextSettings & { active: boolean }, texts: PublishedTexts, now: number) {
  return settings.active && textKey(settings) !== texts.key ? { version: texts.version + 1, effectiveFrom: now } : { version: texts.version, effectiveFrom: texts.effectiveFrom };
}

// The admin preview. Customers only see the texts of an active program, so it
// shows them as they will read once the program is active and saved.
export function previewTexts(settings: ProgramTexts & TextSettings, texts: PublishedTexts, context: { brand: BrandTextSource; activeLocations: number }, now: number) {
  const next = nextTextMeta({ ...settings, active: true }, texts, now);
  return renderProgramTexts(settings, textValues({ brand: context.brand, settings, activeLocations: context.activeLocations,
    version: next.version || null, effectiveFrom: next.effectiveFrom }));
}

// ---------- Templates ----------

export const TERMS_ACCEPT_DEFAULT = 'Jeg accepterer vilkårene for {programnavn}.';

export type TemplateVersion = { version: string; publishedAt: string; note: string; texts: ProgramTexts };

export const TEMPLATE_VERSIONS: readonly TemplateVersion[] = [
  {
    version: 'stamp-card-da-2026-10-19',
    publishedAt: '2026-10-19',
    note: 'Første standardtekst. Afsnit 8 beskriver deaktivering og sletning på anmodning i stedet for en fast slettefrist.',
    texts: {
      consentText: 'Ja tak, jeg vil gerne modtage nyhedsbreve fra {brand_navn} på e-mail med tilbud, nyheder, konkurrencer og medlemsfordele. Jeg kan til enhver tid afmelde mig via linket i nyhedsbrevet.',
      consentHelp: 'Medlemskab af {programnavn} kræver tilmelding til vores nyhedsbrev. Afmelder du dig nyhedsbrevet senere, beholder du dit stempelkort og dine stempler. Læs mere om, hvordan vi behandler dine oplysninger, i vores privatlivspolitik ({privatlivspolitik_url}).',
      termsAccept: TERMS_ACCEPT_DEFAULT,
      terms: `1. Hvem står bag
{programnavn} drives af {virksomhed_navn}, {virksomhed_adresse}, CVR-nr. {cvr} ("{brand_navn}", "vi"). Du kan kontakte os på {kontakt_email}.

2. Medlemskab
Medlemskab er gratis og personligt. Du skal være mindst {aldersgrænse} år for at blive medlem. Der kan kun oprettes ét medlemskab pr. person og pr. e-mailadresse, og stempler og belønninger kan ikke overdrages til andre.

Medlemskab kræver, at du tilmelder dig vores nyhedsbrev. Afmelder du dig senere nyhedsbrevet, beholder du dit medlemskab, dine stempler og dine belønninger.

3. Sådan optjener du stempler
{#hvis ikke flere_stempler_pr_køb}Du får ét stempel{/hvis}{#hvis flere_stempler_pr_køb}Du får {stempler_pr_køb} stempler{/hvis}, hver gang du køber for mindst {minimumsbeløb} kr. hos {brand_navn}. Beløbet er det betalte beløb inkl. moms efter eventuel rabat.{#hvis dagsgrænse} Du kan højst få {maks_stempler_pr_dag} stempler pr. dag.{/hvis}

{#hvis restaurant_og_takeaway}Stempler gives ved køb i restauranten og ved takeaway, som du bestiller direkte hos os. Køb via Wolt, Uber Eats og andre udbydere giver ikke stempler.{/hvis}
{#hvis kun_restaurant}Stempler gives ved køb i restauranten. Takeaway og køb via Wolt, Uber Eats og andre udbydere giver ikke stempler.{/hvis}
{#hvis kun_takeaway}Stempler gives ved takeaway, som du bestiller direkte hos os. Køb i restauranten og køb via Wolt, Uber Eats og andre udbydere giver ikke stempler.{/hvis}
{#hvis rabat_giver_stempel}Køb med rabatkode eller kampagnetilbud giver også stempler.{/hvis}
{#hvis ikke rabat_giver_stempel}Køb med rabatkode eller kampagnetilbud giver ikke stempler.{/hvis}

Du skal vise din QR-kode i {programnavn} ved betalingen. {#hvis ikke flere_stempler_pr_køb}Stemplet registreres{/hvis}{#hvis flere_stempler_pr_køb}Stemplerne registreres{/hvis} af vores medarbejder ved købet og kan ikke gives efterfølgende.

4. Belønninger
Når du har samlet {antal_stempler} stempler, får du {belønning}, og et nyt stempelkort starter. Belønningen er gyldig i {belønning_gyldighed} måneder og indløses ved at vise din QR-kode ved kassen.

Belønninger kan ikke ombyttes til kontanter og kan ikke kombineres med andre rabatter eller tilbud.
{#hvis flere_afdelinger}Dit stempelkort og dine belønninger kan bruges i alle {brand_navn}s restauranter.{/hvis}

5. Udløb
Dine stempler udløber, hvis du ikke har fået et nyt stempel inden for {stempel_gyldighed} måneder. Hvert nyt stempel forlænger fristen. Du kan altid se udløbsdatoen i {programnavn}. Udløbne stempler og belønninger kan ikke genoprettes.

6. Refusion og annullering
Bliver et køb refunderet eller annulleret, fjernes {#hvis ikke flere_stempler_pr_køb}det stempel{/hvis}{#hvis flere_stempler_pr_køb}de stempler{/hvis}, købet gav.

7. Misbrug
Ved misbrug eller forsøg på misbrug, fx deling af QR-kode eller flere medlemskaber pr. person, kan vi fjerne stempler og belønninger og lukke medlemskabet.

8. Dine personoplysninger
Vi er dataansvarlige for de oplysninger, vi behandler om dig i {programnavn}: navn, e-mailadresse, stempler, belønninger og de køb, der er registreret i programmet, samt dit samtykke til nyhedsbrevet.

Vi bruger oplysningerne til at administrere dit medlemskab. Grundlaget er aftalen om medlemskab. Nyhedsbreve sender vi på baggrund af dit samtykke, som du kan trække tilbage når som helst. Nyhedsbrevene sendes via vores e-mailudbyder, som behandler dine oplysninger på vores vegne.

Vi opbevarer oplysningerne, så længe du er medlem. Lukker vi dit medlemskab eller programmet, bliver medlemskabet deaktiveret. Du kan til enhver tid slette dit medlemskab og dine oplysninger i {programnavn} eller ved at skrive til {kontakt_email}. Når du sletter dit medlemskab, fjerner vi dit navn og din e-mailadresse fra programmet. Hændelser som stempler og indløsninger gemmes uden oplysninger, der kan føre tilbage til dig. Du har ret til indsigt, berigtigelse, sletning, begrænsning, indsigelse og dataportabilitet og kan klage til Datatilsynet. Læs mere i vores privatlivspolitik ({privatlivspolitik_url}).

9. Opsigelse
Du kan til enhver tid slette dit medlemskab i {programnavn} eller ved at skrive til {kontakt_email}. Ikke-indløste stempler og belønninger bortfalder.

10. Ændringer og ophør
Vi kan ændre vilkårene eller lukke {programnavn} med mindst 30 dages varsel på e-mail eller i {programnavn}. Ændringer påvirker ikke stempler og belønninger, du allerede har optjent. Lukker programmet, kan optjente belønninger indløses i varslingsperioden.

11. Lovvalg og klager
Vilkårene er underlagt dansk ret. Har du en klage, så kontakt os på {kontakt_email}. Du kan også klage til Forbrugerklagenævnet via forbrug.dk.

Version {version}, gældende fra {gældende_fra}.`,
    },
  },
];

export const CURRENT_TEMPLATE = TEMPLATE_VERSIONS[TEMPLATE_VERSIONS.length - 1];

// The standard version these texts are an unchanged copy of, or null for the brand's own text.
export function matchingTemplateVersion(texts: ProgramTexts): string | null {
  for (let i = TEMPLATE_VERSIONS.length - 1; i >= 0; i--) {
    const template = TEMPLATE_VERSIONS[i];
    if (TEXT_FIELDS.every(f => template.texts[f] === texts[f].trim())) return template.version;
  }
  return null;
}

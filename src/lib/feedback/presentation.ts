/** Public presentation only. Never use branding parameters for authorization. */
export const ESMERALDA_BRAND_ID = 'oeypKaMyYcQjIwaa1PtV';
export function isEsmeraldaFeedback(brandId: string) { return brandId === ESMERALDA_BRAND_ID; }
export function feedbackThankYouHref(brandId: string, language: string) {
  return `/feedback/thank-you?${new URLSearchParams({ brand: brandId, lang: language === 'en' ? 'en' : 'da' })}`;
}
export function feedbackVisitDate(value: string, language: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'da-DK', {
    timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(date);
}
export const feedbackCopy = {
  da: { visit: 'Tak for dit besøg', order: 'Tak for din bestilling', intro: 'Hvordan var din oplevelse? Vi læser alle svar og bruger dem til at gøre dit næste besøg endnu bedre.', placeholder: 'Fortæl os, hvad der var godt, eller hvad vi kan gøre bedre…', optional: 'Valgfrit', send: 'Send din feedback', sending: 'Sender…', star: 'stjerner', low: 'Slet ikke sandsynligt', high: 'Meget sandsynligt', private: 'Dine svar deles med restauranten. Dit navn vises ikke offentligt uden særskilt godkendelse.', thanks: 'Tak for din feedback', received: 'Vi har modtaget dine svar. Tak, fordi du tog dig tid til at fortælle os om din oplevelse.', welcome: 'Vi glæder os til at se dig igen.', home: 'Besøg vores hjemmeside', error: 'Kunne ikke sende feedback. Dine svar er bevaret. Prøv igen.', required: 'Besvar venligst alle spørgsmål markeret med *.', unavailable: 'Spørgeskemaet er ikke tilgængeligt lige nu.' },
  en: { visit: 'Thank you for visiting', order: 'Thank you for your order', intro: 'How was your experience? We read every response and use it to make your next visit even better.', placeholder: 'Tell us what you enjoyed or what we could do better…', optional: 'Optional', send: 'Send your feedback', sending: 'Sending…', star: 'stars', low: 'Not at all likely', high: 'Extremely likely', private: 'Your answers are shared with the restaurant. Your name is not shown publicly without separate approval.', thanks: 'Thank you for your feedback', received: 'We have received your answers. Thank you for taking the time to tell us about your experience.', welcome: 'We look forward to welcoming you again.', home: 'Visit our website', error: 'Unable to send feedback. Your answers have been kept. Please try again.', required: 'Please answer all questions marked with *.', unavailable: 'The feedback form is currently unavailable.' },
};

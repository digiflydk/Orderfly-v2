/** Floor/door ("Etage/dør") limit; matches the delivery contract's `unit` (provider-contract.ts). */
export const DELIVERY_UNIT_MAX = 60;
const STREET_PATTERN = /^(.+?)\s+(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)(?:,\s*(.{1,60}))?$/;
const tidy = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ');
/** Explicit checkout floor/door value, normalised; null when empty. Rejects control/format characters and overlong text. */
export function normalizeDeliveryUnit(input: string | null | undefined): string | null {
 if (input == null) return null;
 if (/[\p{Cc}\p{Cf}\p{Cs}]/u.test(input.replace(/[\t\n\r]/g, ' '))) throw Error('ambiguous_delivery_address');
 const unit = tidy(input);
 if (unit.length > DELIVERY_UNIT_MAX) throw Error('ambiguous_delivery_address');
 return unit || null;
}
/**
 * Conservative Danish textual split; actual coordinate verification remains the routing adapter's responsibility.
 * `unit` is the explicit "Etage/dør" field. When it is empty, a floor/door after a comma in the street line
 * ("Store Kongensgade 50, 2. th.") is the fallback. When both are given, the explicit field wins.
 */
export function normalizeDanishDeliveryAddress(input:{street:string;postcode:string;city:string;country:string;unit?:string|null}){
 const country=input.country.trim().toUpperCase();if(!['DK','DANMARK','DENMARK'].includes(country))throw Error('unsupported_address_country');
 const street=tidy(input.street),match=STREET_PATTERN.exec(street);
 if(!match||!/^[0-9]{4}$/.test(input.postcode)||!input.city.trim()||input.city.length>120)throw Error('ambiguous_delivery_address');
 const unit=normalizeDeliveryUnit(input.unit)??match[3]??null;
 return {country:'DK',postcode:input.postcode,city:input.city.trim(),street:match[1],building:match[2],unit};
}
/**
 * The order's display address (receipt, merchant terminal, kitchen print). With an explicit floor/door the
 * street-line comma suffix is replaced, so the stored address shows the same unit the courier receives.
 */
export function deliveryAddressLine(input:{street:string;zipCode:string;city:string;unit?:string|null}):string{
 let unit:string|null=null;try{unit=normalizeDeliveryUnit(input.unit);}catch{unit=null;}
 const match=unit?STREET_PATTERN.exec(tidy(input.street)):null;
 const street=match?`${match[1]} ${match[2]}`:input.street;
 return `${street}${unit?`, ${unit}`:''}, ${input.zipCode} ${input.city}`;
}

export const deliveryPhoneMessage='Kontrollér telefonnummeret. Brug 8 danske cifre eller et gyldigt internationalt nummer med landekode.';
/** Danish presentation formats normalize to E.164; other countries must already be valid E.164. */
export function normalizeDeliveryPhone(value:string):string{
 const phone=value.trim();
 if(/^\+[1-9]\d{7,14}$/.test(phone))return phone;
 const compact=phone.replace(/[ ()-]/g,'');
 if(/^\d{8}$/.test(compact))return `+45${compact}`;
 if(/^(?:\+45|0045)\d{8}$/.test(compact))return `+45${compact.slice(-8)}`;
 throw Error(deliveryPhoneMessage);
}

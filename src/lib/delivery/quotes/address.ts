/** Conservative Danish textual split; actual coordinate verification remains the routing adapter's responsibility. */
export function normalizeDanishDeliveryAddress(input:{street:string;postcode:string;city:string;country:string}){
 const country=input.country.trim().toUpperCase();if(!['DK','DANMARK','DENMARK'].includes(country))throw Error('unsupported_address_country');
 const street=input.street.normalize('NFKC').trim().replace(/\s+/g,' '),match=/^(.+?)\s+(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?)(?:,\s*(.{1,60}))?$/.exec(street);
 if(!match||!/^[0-9]{4}$/.test(input.postcode)||!input.city.trim()||input.city.length>120)throw Error('ambiguous_delivery_address');
 return {country:'DK',postcode:input.postcode,city:input.city.trim(),street:match[1],building:match[2],unit:match[3]??null};
}

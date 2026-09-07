export function calculateTimeSlots(){const future=new Date(Date.now()+3600000).toISOString();return {pickup_times:[future],delivery_times:[future],asap_pickup:future,asap_delivery:future};}

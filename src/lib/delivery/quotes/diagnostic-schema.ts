import {z} from 'zod';
const diagnosticCodes=['basket_changed','product_unavailable','price_unavailable','invalid_basket','runtime_unavailable','routing_adapter_unavailable','provider_adapter_unavailable','draft_invalid','quote_missing_expiry','schema_invalid','permission_denied','invalid_request','authentication','configuration','unavailable','rate_limited','provider_error','invalid_response','network_error','invalid_native_quote','configuration_or_storage_unavailable','delivery_scope_invalid','delivery_disabled','delivery_kitchen_closed','delivery_environment_unconfigured','delivery_environment_changed','delivery_customer_draft_changed','delivery_customer_quote_scope','delivery_customer_quote_disabled','delivery_customer_settings_changed','delivery_customer_draft_expiry','binding_unavailable','secret_unavailable','quote_unavailable','quote_changed','closed','paused','outside_area','invalid_address','ambiguous_address','routing_unavailable','routing_unconfigured','no_route','unsupported_schedule','provider_closed','provider_outside_area','provider_unsupported_schedule','provider_invalid_address','minimum_not_met','caps_conflict','provider_unconfigured','claim_rejected','unclassified'] as const;
const codes=new Set<string>(diagnosticCodes);
export const quoteDiagnosticSchema=z.object({stage:z.enum(['request','configuration','pricing','time','draft','runtime','quote','claim']),code:z.enum(diagnosticCodes),atMs:z.number().int().nonnegative().safe().max(8640000000000000),field:z.enum(['cart','customer','scope','payment','discount','brand_slug','location_slug','time','unknown']).optional()}).strict();
export type QuoteDiagnostic=z.infer<typeof quoteDiagnosticSchema>;
export type QuoteTrace=(stage:QuoteDiagnostic['stage'],reason?:unknown)=>void;

export function quoteDiagnosticCode(reason:unknown):QuoteDiagnostic['code']{
 if(reason&&typeof reason==='object'){
  if('name' in reason&&reason.name==='ZodError')return 'schema_invalid';
  if('code' in reason&&(reason.code===7||reason.code==='permission-denied'))return 'permission_denied';
  if(reason instanceof Error){
   const messages=new Map([['Basket selections have changed. Please review your basket.','basket_changed'],['A product, combo or option is no longer available. Please review your basket.','basket_changed'],['Option prices have changed. Please refresh your basket.','basket_changed'],['Varen kan ikke bestilles fra denne restaurant.','product_unavailable'],['Varen har ingen tilgængelig pris. Genindlæs menuen.','price_unavailable'],['Invalid basket price or quantity.','invalid_basket']]);
   reason=messages.get(reason.message)??reason.message;
  }
 }
 return typeof reason==='string'&&codes.has(reason)?reason as QuoteDiagnostic['code']:'unclassified';
}

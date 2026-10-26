import {createHash} from 'node:crypto';
import {z} from 'zod';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const recordId=z.string().regex(/^[a-f0-9]{64}$/);
const environment=z.enum(['sandbox','production']);
const time=z.number().int().nonnegative().safe();
const revision=z.number().int().nonnegative().safe().max(Number.MAX_SAFE_INTEGER-1);
const text=z.string().trim().min(1).max(120).refine(v=>!/[\p{Cc}\p{Cf}]/u.test(v));
export const merchantPickupSchema=z.object({name:text,phone:z.string().regex(/^\+[1-9]\d{7,14}$/),verifiedAt:z.string().max(40).refine(v=>Number.isFinite(Date.parse(v)))}).strict();
const metadata={displayName:text,merchantId:id,venueId:id,pickupContact:merchantPickupSchema};
const credential=z.string().min(16).max(2000).refine(v=>!/[\s\p{Cc}\p{Cf}]/u.test(v));
const credentials=z.object({apiKey:credential.optional(),webhookSigningSecret:credential.refine(value=>value.length>=32,'Webhook signing secret must contain at least 32 characters').optional()}).strict().optional();
export const deliveryMerchantCreateSchema=z.object({brandId:id,locationId:id,environment,...metadata,credentials}).strict();
export const deliveryMerchantUpdateSchema=z.object({...metadata,expectedRevision:revision,credentials}).strict();
export const deliveryMerchantActionSchema=z.object({action:z.enum(['activate','deactivate','delete','restore','test','register_callback']),expectedRevision:revision,productionApproved:z.literal(true).optional(),pickupVenueConfirmed:z.boolean().optional()}).strict();
export const deliveryMerchantRecordSchema=z.object({version:z.literal(1),id:recordId,brandId:id,locationId:id,environment,...metadata,
 status:z.enum(['draft','active','inactive','archived']),revision:revision.refine(v=>v>0),
 secretRefs:z.object({api:z.string().nullable(),webhook:z.string().nullable()}).strict(),
 callbackKey:z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),callbackStatus:z.enum(['unregistered','registered','unknown']),
 providerWebhookId:z.string().max(300).nullable(),connectionStatus:z.enum(['untested','verified','failed']),connectionCheckedAtMs:time.nullable(),productionApproved:z.boolean(),
 operation:z.object({id:z.string().uuid(),kind:z.enum(['test','register_callback']),state:z.enum(['running','unknown']),startedAtMs:time}).strict().nullable(),
 provisioned:z.boolean(),createdAtMs:time,updatedAtMs:time,
}).strict();
export type DeliveryMerchantRecord=z.infer<typeof deliveryMerchantRecordSchema>;
export function deliveryMerchantId(scope:{brandId:string;locationId:string},env:'sandbox'|'production'){
 return createHash('sha256').update(JSON.stringify([id.parse(scope.brandId),id.parse(scope.locationId),environment.parse(env)])).digest('hex');
}
export function deliveryMerchantDto(row:DeliveryMerchantRecord){
 const {secretRefs,callbackKey,operation,version,provisioned,...publicFields}=row;
 return {...publicFields,credentials:{apiConfigured:!!secretRefs.api,webhookConfigured:!!secretRefs.webhook},operationPending:operation?.state==='running'&&Date.now()-operation.startedAtMs<60000};
}
export type DeliveryMerchantDto=ReturnType<typeof deliveryMerchantDto>;
export const deliveryMerchantIdSchema=recordId;
export const deliveryMerchantListSchema=z.object({brandId:id.optional(),locationId:id.optional(),cursor:recordId.optional(),includeArchived:z.enum(['true','false']).optional()}).strict().refine(v=>!v.locationId||!!v.brandId);

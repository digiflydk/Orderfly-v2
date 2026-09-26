import 'server-only';
import { z } from 'zod';
import { notificationPlatformConfig } from '@/lib/feedback/mail-config';

const brandMail = z.record(z.string(), z.object({
  organizationId:z.string().uuid(),
  senderProfile:z.string().regex(/^[a-z0-9_-]{1,80}$/),
}).strict());

// The mapping is managed by operations, not by merchant-provided form data.
export function gameMailConfig(brandId:string){
  if(!notificationPlatformConfig() || !String(process.env.ORDERFLY_GAMES_EMAIL_ENABLED_BRANDS||'').split(',').map(s=>s.trim()).includes(brandId))return null;
  try{return brandMail.parse(JSON.parse(process.env.ORDERFLY_GAMES_NOTIFICATION_BRANDS||'{}'))[brandId]||null;}
  catch{return null;}
}

import { z } from 'zod';

// A draft has no public endpoint and cannot issue a voucher. Placement is stored
// now so the eventual public mount can be explicitly limited to selected pages.
export const scratchCardDraftSchema = z.object({
  brandId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  title: z.string().trim().min(3).max(100),
  instruction: z.string().trim().min(3).max(240),
  revealText: z.string().trim().min(3).max(160),
  logoUrl: z.union([z.literal(''), z.string().url().startsWith('https://').max(500)]).default(''),
  cardsPerPlay: z.number().int().min(1).max(6).default(1),
  totalCardLimit: z.number().int().min(1).max(1000000).default(1000),
  prizes: z.array(z.object({
    name: z.string().trim().min(3).max(100),
    type: z.enum(['percent', 'amount', 'item']),
    value: z.number().finite().min(0).max(10000),
    probabilityPercent: z.number().finite().min(0).max(100),
    maxWinners: z.number().int().min(1).max(1000000),
  })).min(1).max(12).default([{name:'Testpræmie',type:'item',value:0,probabilityPercent:10,maxWinners:100}]),
  placement: z.enum(['all', 'selected']),
  paths: z.array(z.string().trim().max(180).regex(/^\/(?!\/)[a-zA-Z0-9/_-]*$/))
    .max(30),
}).superRefine((draft, ctx) => {
  if (draft.placement === 'selected' && draft.paths.length === 0)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paths'], message: 'Vælg mindst én side.' });
  if (new Set(draft.paths).size !== draft.paths.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paths'], message: 'En side må kun stå én gang.' });
  if (draft.prizes.reduce((sum,p)=>sum+p.probabilityPercent,0) > 100)
    ctx.addIssue({ code:z.ZodIssueCode.custom, path:['prizes'], message:'Samlet vinderchance må højst være 100 % pr. kort.' });
  if (draft.prizes.some(p=>p.maxWinners>draft.totalCardLimit))
    ctx.addIssue({ code:z.ZodIssueCode.custom, path:['prizes'], message:'Et præmieloft kan ikke overstige kampagnens antal kort.' });
  if (draft.prizes.some(p => p.type === 'percent' && (p.value <= 0 || p.value > 100) || p.type === 'amount' && p.value <= 0 || p.type === 'item' && p.value !== 0))
    ctx.addIssue({ code:z.ZodIssueCode.custom, path:['prizes'], message:'Ugyldig værdi for præmietypen.' });
});
export type ScratchCardDraft = z.infer<typeof scratchCardDraftSchema>;

export function scratchCardOnPage(draft: ScratchCardDraft, pathname: string): boolean {
  return draft.placement === 'all' || draft.paths.includes(pathname);
}

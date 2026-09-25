import { z } from 'zod';

// A draft has no public endpoint and cannot issue a voucher. Placement is stored
// now so the eventual public mount can be explicitly limited to selected pages.
export const scratchCardDraftSchema = z.object({
  brandId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  title: z.string().trim().min(3).max(100),
  instruction: z.string().trim().min(3).max(240),
  revealText: z.string().trim().min(3).max(160),
  placement: z.enum(['all', 'selected']),
  paths: z.array(z.string().trim().max(180).regex(/^\/(?!\/)[a-zA-Z0-9/_-]*$/))
    .max(30),
}).superRefine((draft, ctx) => {
  if (draft.placement === 'selected' && draft.paths.length === 0)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paths'], message: 'Vælg mindst én side.' });
  if (new Set(draft.paths).size !== draft.paths.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paths'], message: 'En side må kun stå én gang.' });
});
export type ScratchCardDraft = z.infer<typeof scratchCardDraftSchema>;

export function scratchCardOnPage(draft: ScratchCardDraft, pathname: string): boolean {
  return draft.placement === 'all' || draft.paths.includes(pathname);
}

import { z } from 'zod';

const httpsUrl = z.union([z.literal(''), z.string().url().startsWith('https://').max(1000)]);
export const scratchCardDraftSchema = z.object({
  brandId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  title: z.string().trim().min(3).max(100),
  instruction: z.string().trim().min(3).max(240),
  revealText: z.string().trim().min(3).max(160),
  logoUrl: httpsUrl.default(''),
  backgroundUrl: httpsUrl.default(''),
  fontUrl: httpsUrl.default(''),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffbd02'),
  surfaceColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#111111'),
  cardsPerPlay: z.number().int().min(1).max(9).default(3),
  totalCardLimit: z.number().int().min(1).max(1000000).default(1000),
  prizes: z.array(z.object({
    name: z.string().trim().min(3).max(100),
    imageUrl: httpsUrl.default(''),
    type: z.enum(['percent', 'amount', 'item']),
    value: z.number().finite().min(0).max(10000),
    probabilityPercent: z.number().finite().min(0).max(100),
    maxWinners: z.number().int().min(1).max(1000000),
    codeMode: z.enum(['generated', 'shared', 'uploaded']).default('generated'),
    sharedCode: z.string().trim().regex(/^[A-Za-z0-9_-]{5,40}$/).optional(),
    redemption: z.enum(['restaurant', 'website', 'both']).default('restaurant'),
    redemptionChannels: z.array(z.enum(['restaurant', 'orderfly', 'external'])).max(3).optional(),
    productId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  })).min(1).max(12),
  placement: z.enum(['all', 'selected']),
  paths: z.array(z.string().trim().max(180).regex(/^\/(?!\/)[a-zA-Z0-9/_-]*$/)).max(30),
  collectPhone: z.boolean().default(false),
  newsletterText: z.string().trim().min(10).max(320).default('Ja tak, jeg vil modtage nyheder og tilbud via e-mail. Jeg kan altid afmelde mig.'),
  emailSubject: z.string().trim().min(3).max(140).default('Din gevinst er klar'),
  emailMessage: z.string().trim().min(10).max(1200).default('Tak fordi du spillede med! Her er din præmie og din personlige kode.'),
  displayCooldownDays: z.number().int().min(0).max(365).default(30),
  allowedOrigins: z.array(z.string().url().startsWith('https://').max(250)).max(20).default([]),
}).superRefine((draft, ctx) => {
  if (draft.placement === 'selected' && draft.paths.length === 0)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paths'], message: 'Vælg mindst én side.' });
  if (new Set(draft.paths).size !== draft.paths.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paths'], message: 'En side må kun stå én gang.' });
  if (new Set(draft.prizes.map(p=>p.name.toLowerCase())).size !== draft.prizes.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['prizes'], message: 'Præmier skal have forskellige navne.' });
  if (draft.prizes.reduce((sum,p)=>sum+p.probabilityPercent,0) > 100.000001)
    ctx.addIssue({ code:z.ZodIssueCode.custom, path:['prizes'], message:'Samlet vinderchance må højst være 100 % pr. spil.' });
  if (draft.prizes.some(p=>p.maxWinners>draft.totalCardLimit))
    ctx.addIssue({ code:z.ZodIssueCode.custom, path:['prizes'], message:'Et præmieloft kan ikke overstige kampagnens antal spil.' });
  if (draft.prizes.some(p => p.type === 'percent' && (p.value <= 0 || p.value > 100) || p.type === 'amount' && p.value <= 0 || p.type === 'item' && p.value !== 0))
    ctx.addIssue({ code:z.ZodIssueCode.custom, path:['prizes'], message:'Ugyldig værdi for præmietypen.' });
  if(draft.prizes.some(p=>!prizeChannels(p).length || new Set(prizeChannels(p)).size!==prizeChannels(p).length))
    ctx.addIssue({code:z.ZodIssueCode.custom,path:['prizes'],message:'Vælg mindst ét indløsningssted uden dubletter.'});
  if(draft.prizes.some(p=>p.type==='item'&&prizeChannels(p).includes('orderfly')&&!p.productId))
    ctx.addIssue({code:z.ZodIssueCode.custom,path:['prizes'],message:'Vælg det konkrete produkt, der skal være gratis i Orderfly.'});
  if(draft.prizes.some(p=>p.codeMode==='uploaded'&&prizeChannels(p).includes('orderfly')))
    ctx.addIssue({code:z.ZodIssueCode.custom,path:['prizes'],message:'Uploadede koder kan ikke indløses i Orderfly Promotions.'});
  if(draft.prizes.some(p=>p.codeMode==='shared'&&(p.type==='item'||!p.sharedCode||!prizeChannels(p).includes('orderfly'))))
    ctx.addIssue({code:z.ZodIssueCode.custom,path:['prizes'],message:'En fælles Promotions-kode kræver Orderfly-indløsning og en beløbs- eller procentrabat.'});
  if(draft.prizes.some(p=>p.codeMode==='shared'&&prizeChannels(p).includes('restaurant')))
    ctx.addIssue({code:z.ZodIssueCode.custom,path:['prizes'],message:'Fælles Promotions-koder kan ikke registreres enkeltvis i restauranten. Vælg unikke koder.'});
  const shared=draft.prizes.filter(p=>p.codeMode==='shared').map(p=>p.sharedCode?.toUpperCase());
  if(new Set(shared).size!==shared.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:['prizes'],message:'En fælles kode må kun bruges til én præmie i kampagnen.'});
  if (new Set(draft.allowedOrigins).size !== draft.allowedOrigins.length || draft.allowedOrigins.some(value => {try{return new URL(value).origin !== value;}catch{return true;}}))
    ctx.addIssue({ code:z.ZodIssueCode.custom, path:['allowedOrigins'], message:'Angiv unikke HTTPS-domæner uden sti.' });
});
export type ScratchCardDraft = z.infer<typeof scratchCardDraftSchema>;
type RedemptionPrize = {redemption:'restaurant'|'website'|'both';redemptionChannels?:Array<'restaurant'|'orderfly'|'external'>};
export function prizeChannels(prize:RedemptionPrize):Array<'restaurant'|'orderfly'|'external'> {
  return prize.redemptionChannels ?? (prize.redemption==='both'?['restaurant','orderfly']:prize.redemption==='website'?['orderfly']:['restaurant']);
}
export function redemptionText(channels:Array<'restaurant'|'orderfly'|'external'>):string {
  return channels.map(channel=>({restaurant:'i restauranten',orderfly:'på Orderfly hjemmesiden',external:'på den eksterne hjemmeside'}[channel])).join(', ');
}
export type PublicScratchGame = Omit<ScratchCardDraft,'prizes'|'emailSubject'|'emailMessage'|'allowedOrigins'> & {prizes:Array<Omit<ScratchCardDraft['prizes'][number],'sharedCode'>>};
export function publicScratchGame(game:ScratchCardDraft):PublicScratchGame {
  const {emailSubject,emailMessage,allowedOrigins,prizes,...publicFields}=game;
  return {...publicFields,prizes:prizes.map(({sharedCode,...prize})=>prize)};
}
export function esmeraldaScratchTest(brandId: string): ScratchCardDraft {
  return scratchCardDraftSchema.parse({
    brandId, title:'Skrab 3 felter og vind hos Esmeralda',
    instruction:'Skrab alle tre felter. Tre ens symboler viser din præmie.',
    revealText:'Ingen gevinst denne gang', logoUrl:'', cardsPerPlay:3,totalCardLimit:3000,
    newsletterText:'Ja tak, jeg vil modtage nyheder og tilbud fra Esmeralda via e-mail. Jeg kan altid afmelde mig.',
    prizes:[
      {name:'Pizza',type:'item',value:0,probabilityPercent:10,maxWinners:1000},
      {name:'Tiramisu',type:'item',value:0,probabilityPercent:25,maxWinners:1000},
      {name:'Pommes frites',type:'item',value:0,probabilityPercent:65,maxWinners:1000},
    ], placement:'selected',paths:['/'],
  });
}
export function scratchCardOnPage(draft: ScratchCardDraft, pathname: string): boolean {
  return draft.placement === 'all' || draft.paths.includes(pathname);
}

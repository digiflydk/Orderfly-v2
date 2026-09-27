import { getAdminDb } from '@/lib/firebase-admin';
import { gameBrands } from './actions';
import { scratchCardDraftSchema } from '@/lib/games/scratch-card';
import { brandCampaigns, campaignStatus } from '@/lib/games/campaign';
import { GamesDashboard, type GameCampaignRow } from '@/components/games/GamesDashboard';
export const dynamic='force-dynamic';
export default async function GamesPage(){
  const brands=await gameBrands(),db=getAdminDb();
  const campaigns:GameCampaignRow[]=(await Promise.all(brands.map(async brand=>(await brandCampaigns(db,brand.id)).map(doc=>({doc,brand}))))).flat()
    .map(({doc,brand})=>{const game=scratchCardDraftSchema.parse(doc.data());return {
      id:doc.id,brandId:brand.id,brandName:brand.name,name:game.campaignName,status:campaignStatus(doc.data().status,game),
      startsAt:game.startsAt,endsAt:game.endsAt,createdAt:doc.data().createdAt?.toDate?.()?.toISOString()||doc.createTime?.toDate().toISOString()||null,
      updatedAt:doc.data().updatedAt?.toDate?.()?.toISOString()||doc.updateTime?.toDate().toISOString()||null,
      participants:Number(doc.data().playedCount||0),limit:game.totalCardLimit,
    };});
  return <GamesDashboard campaigns={campaigns} brands={brands.map(brand=>({id:brand.id,name:brand.name,hasBase:campaigns.some(row=>row.brandId===brand.id&&row.id===brand.id)}))}/>;
}

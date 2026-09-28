import { getAdminDb } from '@/lib/firebase-admin';
import { gameBrands } from './actions';
import { scratchCardDraftSchema } from '@/lib/games/scratch-card';
import { brandCampaigns, campaignStatus } from '@/lib/games/campaign';
import { GamesDashboard, type GameCampaignRow } from '@/components/games/GamesDashboard';
import { AggregateField } from 'firebase-admin/firestore';
export const dynamic='force-dynamic';
export default async function GamesPage(){
  const brands=await gameBrands(),db=getAdminDb();
  const campaigns:GameCampaignRow[]=await Promise.all((await Promise.all(brands.map(async brand=>(await brandCampaigns(db,brand.id)).map(doc=>({doc,brand}))))).flat()
    .map(async ({doc,brand})=>{const game=scratchCardDraftSchema.parse(doc.data());
      // The original campaign predates campaignId; do not assign later campaigns to it.
      let completed:number,paidOrders:number,revenue:number;
      if(doc.id===brand.id){
        const [events,conversions]=await Promise.all([
          db.collection('gameEvents').where('brandId','==',brand.id).get(),
          db.collection('gameConversions').where('brandId','==',brand.id).get(),
        ]);
        const belongs=(row:{campaignId?:string})=>(row.campaignId||brand.id)===doc.id;
        completed=events.docs.filter(row=>belongs(row.data())&&row.data().event==='game_complete').length;
        const paid=conversions.docs.filter(row=>belongs(row.data())&&row.data().status==='paid');
        paidOrders=paid.length;
        revenue=paid.reduce((sum,row)=>sum+Number(row.data().amount||0),0);
      }else{
        const [events,paid]=await Promise.all([
          db.collection('gameEvents').where('campaignId','==',doc.id).where('event','==','game_complete').count().get(),
          db.collection('gameConversions').where('campaignId','==',doc.id).where('status','==','paid').aggregate({orders:AggregateField.count(),revenue:AggregateField.sum('amount')}).get(),
        ]);
        completed=events.data().count;
        paidOrders=Number(paid.data().orders||0);
        revenue=Number(paid.data().revenue||0);
      }
      return {
      id:doc.id,brandId:brand.id,brandName:brand.name,name:game.campaignName,status:campaignStatus(doc.data().status,game),
      startsAt:game.startsAt,endsAt:game.endsAt,createdAt:doc.data().createdAt?.toDate?.()?.toISOString()||doc.createTime?.toDate().toISOString()||null,
      updatedAt:doc.data().updatedAt?.toDate?.()?.toISOString()||doc.updateTime?.toDate().toISOString()||null,
      participants:Number(doc.data().playedCount||0),completed,paidOrders,revenue,limit:game.totalCardLimit,
    };}));
  return <GamesDashboard campaigns={campaigns} brands={brands.map(brand=>({id:brand.id,name:brand.name,hasBase:campaigns.some(row=>row.brandId===brand.id&&row.id===brand.id)}))}/>;
}


import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
export const dynamic="force-dynamic"; export const runtime="nodejs"; export const fetchCache="default-no-store";

/* ---------- POST (commit) ---------- */
export async function POST(req:Request){
  const token=process.env.DEBUG_TOKEN, hdr=(req.headers.get("x-debug-token")||"").trim();
  if(!token || hdr!==token) return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});
  const body = await req.json().catch(()=>({}));
  const brandSlug = String(body.brandSlug||"").trim();
  const dryRun = body.dryRun !== false;
  const reassignIfInvalid = body.reassignIfInvalid !== false;
  const setSortOrder = body.setSortOrder !== false;
  if(!brandSlug) return NextResponse.json({ok:false,error:"brandSlug is required"},{status:400});
  try{
    const db=getAdminDb();
    // brandId
    let brandId:string|null=null;
    const bySlug=await db.collection("brands").where("slug","==",brandSlug).limit(1).get();
    if(!bySlug.empty) brandId=bySlug.docs[0].id;
    if(!brandId){ const d=await db.collection("brands").doc(brandSlug).get(); if(d.exists) brandId=d.id; }
    if(!brandId) return NextResponse.json({ok:false,error:"Brand not found"},{status:404});

    // ensure category "Menu"
    const name="Menu";
    const catQ=await db.collection("categories").where("brandId","==",brandId).where("name","==",name).limit(1).get();
    let categoryId = catQ.empty ? "DRY_RUN_CATEGORY_ID" : catQ.docs[0].id;

    const allCats=await db.collection("categories").where("brandId","==",brandId).get();
    const validIds=new Set(allCats.docs.map(d=>d.id));
    const prodsSnap=await db.collection("products").where("brandId","==",brandId).get();
    const products=prodsSnap.docs.map(d=>({id:d.id,ref:d.ref,data:d.data() as any}));
    const withoutCategory=products.filter(p=>!p.data.categoryId);
    const withInvalid=reassignIfInvalid?products.filter(p=>p.data.categoryId && !validIds.has(String(p.data.categoryId))):[];
    const needSort=setSortOrder?products.filter(p=>typeof p.data.sortOrder!=="number"):[];

    let createdCategory=0, updated=0, updatedSort=0;
    if(!dryRun){
      if(catQ.empty){ const ref=db.collection("categories").doc(); await ref.set({brandId,name,order:1,createdAt:new Date(),updatedAt:new Date()}); categoryId=ref.id; createdCategory=1; }
      const B=450;
      for(let i=0;i<withoutCategory.length;i+=B){ const s=withoutCategory.slice(i,i+B); const b=db.batch(); s.forEach(p=>b.update(p.ref,{categoryId,updatedAt:new Date()})); await b.commit(); updated+=s.length; }
      if(withInvalid.length){ for(let i=0;i<withInvalid.length;i+=B){ const s=withInvalid.slice(i,i+B); const b=db.batch(); s.forEach(p=>b.update(p.ref,{categoryId,updatedAt:new Date()})); await b.commit(); updated+=s.length; } }
      if(needSort.length){ const sorted=[...products].sort((a,b)=>((typeof a.data.sortOrder==="number"?a.data.sortOrder:999999)-(typeof b.data.sortOrder==="number"?b.data.sortOrder:999999)) || String(a.id).localeCompare(String(b.id)));
        let i=1; for(let j=0;j<sorted.length;j+=B){ const s=sorted.slice(j,j+B); const b=db.batch(); s.forEach(p=>{ if(typeof p.data.sortOrder!=="number"){ b.update(p.ref,{sortOrder:i,updatedAt:new Date()}); updatedSort++; } i++; }); await b.commit(); }
      }
    }

    return NextResponse.json({ok:true,brandId,categoryId,dryRun,stats:{createdCategory,productsTotal:products.length,withoutCategory:withoutCategory.length,withInvalidCategory:withInvalid.length,updatedProducts:updated,setSortOrder:needSort.length,updatedSortOrder:updatedSort}});
  }catch(e:any){ return NextResponse.json({ok:false,error:String(e?.message??e)},{status:500}); }
}

/* ---------- GET (dry-run/preview) ---------- */
export async function GET(req:Request){
  const url=new URL(req.url); const brandSlug=url.searchParams.get("brandSlug")?.trim();
  if(!brandSlug) return NextResponse.json({ok:false,error:"Missing brandSlug",usage:{dryRun:"/api/ops/catalog/ensure-menu?brandSlug=<slug>",post:{url:"/api/ops/catalog/ensure-menu",headers:{"x-debug-token":"$DEBUG_TOKEN","Content-Type":"application/json"},body:{brandSlug:"<slug>",dryRun:false}}}},{status:400});
  try{
    const db=getAdminDb();
    let brandId:string|null=null;
    const bySlug=await db.collection("brands").where("slug","==",brandSlug).limit(1).get();
    if(!bySlug.empty) brandId=bySlug.docs[0].id;
    if(!brandId){ const d=await db.collection("brands").doc(brandSlug).get(); if(d.exists) brandId=d.id; }
    if(!brandId) return NextResponse.json({ok:false,error:"Brand not found",brandSlug},{status:404});
    const name="Menu";
    const catQ=await db.collection("categories").where("brandId","==",brandId).where("name","==",name).limit(1).get();
    const allCats=await db.collection("categories").where("brandId","==",brandId).get();
    const validIds=new Set(allCats.docs.map(d=>d.id));
    const prodsSnap=await db.collection("products").where("brandId","==",brandId).get();
    const products=prodsSnap.docs.map(d=>({id:d.id,data:d.data() as any}));
    const withoutCategory=products.filter(p=>!p.data.categoryId);
    const withInvalid=products.filter(p=>p.data.categoryId && !validIds.has(String(p.data.categoryId)));
    const needSort=products.filter(p=>typeof p.data.sortOrder!=="number");
    return NextResponse.json({ok:true,dryRun:true,brandId,category:catQ.empty?"(vil blive oprettet ved POST)":catQ.docs[0].id,stats:{productsTotal:products.length,withoutCategory:withoutCategory.length,withInvalidCategory:withInvalid.length,missingSortOrder:needSort.length},howToCommit:{method:"POST",url:"/api/ops/catalog/ensure-menu",headers:{"Content-Type":"application/json","x-debug-token":"$DEBUG_TOKEN"},body:{brandSlug,dryRun:false}}});
  }catch(e:any){ return NextResponse.json({ok:false,error:String(e?.message??e)},{status:500}); }
}

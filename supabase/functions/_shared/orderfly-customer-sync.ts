import { hasBookingCustomerIdentity } from "./orderfly-customer-identity.ts";

const emailOk=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const cleanError=(value:unknown)=>String(value instanceof Error?value.message:value||"Ukendt fejl").replace(/[\r\n]+/g," ").slice(0,500);
const retryDelaySeconds=(attempt:number)=>Math.min(3600,Math.max(60,60*Math.pow(2,Math.max(0,attempt-1))));
const asEmail=(value:unknown)=>String(value||"").trim().toLowerCase();
const asText=(value:unknown,max=500)=>String(value||"").trim().slice(0,max);

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function markJob(db:any,organizationId:string,id:string,patch:Record<string,unknown>){
  const{error}=await db.from("orderfly_customer_sync_jobs").update({...patch,updated_at:new Date().toISOString()}).eq("organization_id",organizationId).eq("id",id);
  if(error)throw error;
}

async function pauseForConfiguration(db:any,job:any,attempt:number,message:string,httpStatus:number|null=null){
  await markJob(db,job.organization_id,job.id,{
    status:"pending",
    attempt_count:Math.max(0,attempt-1),
    next_attempt_at:new Date(Date.now()+15*60*1000).toISOString(),
    last_http_status:httpStatus,
    last_error:message
  });
  return{booking_id:job.booking_id,status:"paused",error:message};
}

async function failPermanently(db:any,job:any,attempt:number,message:string,httpStatus:number|null=null){
  await markJob(db,job.organization_id,job.id,{
    status:"failed",
    attempt_count:attempt,
    next_attempt_at:new Date().toISOString(),
    last_http_status:httpStatus,
    last_error:message
  });
  return{booking_id:job.booking_id,status:"failed",error:message,http_status:httpStatus};
}

async function retryOrFail(db:any,job:any,attempt:number,message:string,httpStatus:number|null=null){
  if(attempt>=8)return failPermanently(db,job,attempt,message,httpStatus);
  const seconds=retryDelaySeconds(attempt);
  await markJob(db,job.organization_id,job.id,{
    status:"pending",
    attempt_count:attempt,
    next_attempt_at:new Date(Date.now()+seconds*1000).toISOString(),
    last_http_status:httpStatus,
    last_error:message
  });
  return{booking_id:job.booking_id,status:"retrying",retry_in_seconds:seconds,error:message,http_status:httpStatus};
}

async function claimJob(db:any,job:any){
  const attempt=Number(job.attempt_count||0)+1;
  const{data,error}=await db.from("orderfly_customer_sync_jobs")
    .update({status:"processing",attempt_count:attempt,updated_at:new Date().toISOString(),last_error:null,last_http_status:null})
    .eq("organization_id",job.organization_id).eq("id",job.id)
    .eq("status","pending")
    .select("id")
    .maybeSingle();
  if(error)throw error;
  return data?attempt:null;
}

async function processOne(db:any,job:any){
  const attempt=await claimJob(db,job);
  if(attempt===null)return{booking_id:job.booking_id,status:"not_claimed"};

  try{
    const[{data:booking,error:bErr},{data:organizationMapping,error:oErr},{data:locationMapping,error:lErr},{data:existingLink,error:linkErr}]=await Promise.all([
      db.from("bookings")
        .select("id,organization_id,location_id,guest_name,guest_email,guest_phone")
        .eq("id",job.booking_id)
        .eq("organization_id",job.organization_id)
        .eq("location_id",job.location_id)
        .maybeSingle(),
      db.from("orderfly_organization_mappings")
        .select("orderfly_brand_id,is_active")
        .eq("organization_id",job.organization_id)
        .eq("is_active",true)
        .maybeSingle(),
      db.from("orderfly_location_mappings")
        .select("orderfly_location_id,organization_id,is_active")
        .eq("restaurant_location_id",job.location_id)
        .eq("organization_id",job.organization_id)
        .eq("is_active",true)
        .maybeSingle(),
      db.from("booking_consumer_customer_links")
        .select("booking_id,organization_id,location_id,orderfly_customer_id")
        .eq("booking_id",job.booking_id)
        .maybeSingle()
    ]);
    if(bErr||oErr||lErr||linkErr)throw bErr||oErr||lErr||linkErr;

    if(!booking){
      return await failPermanently(db,job,attempt,"Booking was not found in the job organization/location scope.");
    }
    if(booking.organization_id!==job.organization_id||booking.location_id!==job.location_id){
      return await failPermanently(db,job,attempt,"Booking scope mismatch prevented Orderfly sync.");
    }
    if(existingLink){
      if(existingLink.organization_id!==job.organization_id||existingLink.location_id!==job.location_id){
        return await failPermanently(db,job,attempt,"Existing consumer customer link has a scope mismatch.");
      }
      await markJob(db,job.organization_id,job.id,{status:"succeeded",orderfly_customer_id:existingLink.orderfly_customer_id,synced_at:new Date().toISOString(),last_error:null,last_http_status:200});
      return{booking_id:job.booking_id,status:"already_linked",customer_id:existingLink.orderfly_customer_id};
    }
    if(!organizationMapping){
      return await pauseForConfiguration(db,job,attempt,"Active Orderfly organization mapping is not configured.");
    }
    if(!locationMapping){
      return await pauseForConfiguration(db,job,attempt,"Active Orderfly restaurant location mapping is not configured.");
    }
    if(locationMapping.organization_id!==job.organization_id){
      return await failPermanently(db,job,attempt,"Orderfly location mapping organization mismatch prevented sync.");
    }

    const email=asEmail(booking.guest_email);
    const phone=asText(booking.guest_phone,80);
    const validEmail=emailOk(email);
    if(!hasBookingCustomerIdentity(validEmail?email:"",phone)){
      await markJob(db,job.organization_id,job.id,{status:"skipped",attempt_count:attempt,next_attempt_at:new Date().toISOString(),last_error:"Booking has no valid email or phone for consumer identity resolution.",last_http_status:null});
      return{booking_id:job.booking_id,status:"skipped",reason:"missing_valid_identity"};
    }

    const baseUrl=asText(Deno.env.get("ORDERFLY_INTEGRATION_BASE_URL"),500).replace(/\/+$/g,"");
    const secret=String(Deno.env.get("ORDERFLY_ESMERALDA_INTEGRATION_SECRET")||"");
    if(!/^https:\/\//i.test(baseUrl)||secret.length<32){
      return await pauseForConfiguration(db,job,attempt,"Orderfly integration runtime configuration is incomplete.");
    }

    const brandId=asText(organizationMapping.orderfly_brand_id,200);
    const orderflyLocationId=asText(locationMapping.orderfly_location_id,200);
    if(!brandId||!orderflyLocationId){
      return await pauseForConfiguration(db,job,attempt,"Orderfly integration mapping contains an empty native id.");
    }

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),5000);
    let response:Response;
    let raw:string;
    try{
      response=await fetch(`${baseUrl}/api/integrations/esmeralda/customers/resolve`,{
        method:"POST",
        headers:{"content-type":"application/json","x-esmeralda-integration-secret":secret},
        body:JSON.stringify({
          organization_id:brandId,
          location_id:orderflyLocationId,
          booking_id:String(booking.id),
          full_name:asText(booking.guest_name,200)||"Ikke oplyst",
          email:validEmail?email:null,
          phone:phone||null
        }),
        signal:controller.signal
      });
      raw=await response.text();
    }catch(error){
      return await retryOrFail(db,job,attempt,`Orderfly request failed: ${cleanError(error)}`);
    }finally{clearTimeout(timer)}

    let body:any={};
    try{body=raw?JSON.parse(raw):{}}catch{body={}};

    if(!response.ok){
      const providerError=asText(body?.error||body?.message||raw||`HTTP ${response.status}`,300);
      const message=`Orderfly ${response.status}: ${providerError}`;
      if([401,403,404].includes(response.status))return await pauseForConfiguration(db,job,attempt,message,response.status);
      if(response.status===409||response.status===400||response.status===422)return await failPermanently(db,job,attempt,message,response.status);
      return await retryOrFail(db,job,attempt,message,response.status);
    }

    const customerId=asText(body?.customer_id,200);
    if(!customerId){
      return await retryOrFail(db,job,attempt,"Orderfly success response did not contain customer_id.",response.status);
    }

    const{data:linkNow,error:linkNowError}=await db.from("booking_consumer_customer_links")
      .select("orderfly_customer_id,organization_id,location_id")
      .eq("booking_id",job.booking_id)
      .maybeSingle();
    if(linkNowError)throw linkNowError;
    if(linkNow&&linkNow.orderfly_customer_id!==customerId){
      return await failPermanently(db,job,attempt,"Booking was concurrently linked to a different Orderfly customer id.",response.status);
    }
    if(linkNow&&(linkNow.organization_id!==job.organization_id||linkNow.location_id!==job.location_id)){
      return await failPermanently(db,job,attempt,"Concurrent booking customer link scope mismatch prevented sync.",response.status);
    }

    if(!linkNow){
      const{error:insertError}=await db.from("booking_consumer_customer_links").insert({
        booking_id:job.booking_id,
        organization_id:job.organization_id,
        location_id:job.location_id,
        orderfly_customer_id:customerId,
        linked_at:new Date().toISOString(),
        last_synced_at:new Date().toISOString()
      });
      if(insertError){
        const{data:afterRace,error:afterRaceError}=await db.from("booking_consumer_customer_links").select("orderfly_customer_id,organization_id,location_id").eq("booking_id",job.booking_id).maybeSingle();
        if(afterRaceError)throw afterRaceError;
        if(!afterRace||afterRace.orderfly_customer_id!==customerId||afterRace.organization_id!==job.organization_id||afterRace.location_id!==job.location_id)throw insertError;
      }
    }

    await markJob(db,job.organization_id,job.id,{
      status:"succeeded",
      attempt_count:attempt,
      next_attempt_at:new Date().toISOString(),
      orderfly_customer_id:customerId,
      synced_at:new Date().toISOString(),
      last_error:null,
      last_http_status:response.status
    });

    return{booking_id:job.booking_id,status:"succeeded",customer_id:customerId,operation:asText(body?.operation,40)||null};
  }catch(error){
    return await retryOrFail(db,job,attempt,cleanError(error));
  }
}

export async function processOrderflyCustomerSyncJobs(db:any,organizationId:string,maxJobs=10){
  if(!UUID_RE.test(organizationId))throw new Error("organization_id is required");
  const qty=Math.min(20,Math.max(1,Number(maxJobs||10)));
  const now=new Date();
  const staleBefore=new Date(now.getTime()-10*60*1000).toISOString();

  const{error:recoverError}=await db.from("orderfly_customer_sync_jobs")
    .update({status:"pending",next_attempt_at:now.toISOString(),last_error:"Recovered stale processing job.",updated_at:now.toISOString()})
    .eq("organization_id",organizationId)
    .eq("status","processing")
    .lt("updated_at",staleBefore);
  if(recoverError)throw recoverError;

  const{data:jobs,error}=await db.from("orderfly_customer_sync_jobs")
    .select("id,booking_id,organization_id,location_id,status,attempt_count,next_attempt_at,created_at")
    .eq("organization_id",organizationId)
    .eq("status","pending")
    .lte("next_attempt_at",now.toISOString())
    .order("created_at",{ascending:true})
    .limit(qty);
  if(error)throw error;

  const results=[];
  for(const job of jobs||[])results.push(await processOne(db,job));
  return{processed:results.length,results};
}

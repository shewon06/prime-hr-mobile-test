// PRIME HR — server-only web push dispatcher
// Called by a private database cron token. No employee/admin browser may invoke this.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const url=Deno.env.get("SUPABASE_URL")||"";
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const response=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{
 status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});
type QueueRow={notification_id:string;attempts:number};
type Notice={id:string;recipient_id:string;title:string;body:string};
type Device={id:string;user_id:string;endpoint:string;p256dh:string;auth_key:string};
function constantTimeEquals(a:string,b:string):boolean{
 if(a.length!==b.length)return false;
 let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);
 return d===0;
}
Deno.serve(async req=>{
 if(req.method!=="POST")return response({error:"Method not allowed"},405);
 const supplied=req.headers.get("x-prime-push-token")||"";
 if(supplied.length<40)return response({error:"Unauthorized"},401);
 if(!service||!url)return response({error:"Server unavailable"},503);
 const {data:cfg,error:cfgError}=await db.from("push_server_config")
  .select("vapid_public,vapid_private,dispatch_token").eq("id",1).maybeSingle();
 if(cfgError||!cfg||!constantTimeEquals(supplied,cfg.dispatch_token))
  return response({error:"Unauthorized"},401);
 webpush.setVapidDetails("https://primeagriplantation.lk",cfg.vapid_public,cfg.vapid_private);
 const stamp=new Date().toISOString();
 const {data:tasks,error:queueError}=await db.from("push_delivery_queue")
  .select("notification_id,attempts").is("delivered_at",null)
  .lte("next_attempt_at",stamp).order("next_attempt_at",{ascending:true}).limit(12);
 if(queueError)return response({error:"Queue unavailable"},500);
 if(!tasks?.length)return response({ok:true,processed:0});
 const ids=tasks.map((x:QueueRow)=>x.notification_id);
 const {data:notices,error:noticeError}=await db.from("employee_notifications")
  .select("id,recipient_id,title,body").in("id",ids);
 if(noticeError)return response({error:"Notifications unavailable"},500);
 const owners=[...new Set((notices||[]).map((n:Notice)=>n.recipient_id))];
 const {data:devices,error:deviceError}=owners.length
  ?await db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth_key").in("user_id",owners)
  :{data:[],error:null};
 if(deviceError)return response({error:"Subscriptions unavailable"},500);
 const byNotice=new Map((notices||[]).map((n:Notice)=>[n.id,n]));
 let processed=0,delivered=0,failed=0;
 for(const task of tasks as QueueRow[]){
  const note=byNotice.get(task.notification_id) as Notice|undefined;
  if(!note){await db.from("push_delivery_queue").update({
     delivered_at:new Date().toISOString(),last_error:"Notification unavailable"
    }).eq("notification_id",task.notification_id);continue}
  const subs=(devices||[]).filter((x:Device)=>x.user_id===note.recipient_id);
  if(!subs.length){
   // Notification stays in the employee inbox; no push without an opted-in device.
   await db.from("push_delivery_queue").update({
    delivered_at:new Date().toISOString(),last_error:"No subscribed device"
   }).eq("notification_id",task.notification_id);
   processed++;continue;
  }
  let successes=0;let lastError="";
  for(const sub of subs as Device[]){
   try{
    const payload=JSON.stringify({
     title:note.title,body:note.body,
     notificationId:note.id,url:"./employee.html#alerts"
    });
    await webpush.sendNotification(
     {endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_key}},
     payload,{TTL:86400,urgency:"normal",timeout:15000}
    );
    successes++;
   }catch(err){
    const http=(err as {statusCode?:number}).statusCode||0;
    lastError="Push HTTP "+String(http||"failed");
    if(http===404||http===410)await db.from("push_subscriptions").delete().eq("id",sub.id);
   }
  }
  const attempts=task.attempts+1;
  const delayMinutes=Math.min(Math.max(2,2**Math.min(attempts,6)),60);
  await db.from("push_delivery_queue").update({
   attempts,
   delivered_at:successes?new Date().toISOString():null,
   next_attempt_at:new Date(Date.now()+delayMinutes*60000).toISOString(),
   last_error:successes?null:lastError||"Push provider failure"
  }).eq("notification_id",task.notification_id);
  processed++;if(successes)delivered++;else failed++;
 }
 return response({ok:true,processed,delivered,failed});
});

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const url=Deno.env.get("SUPABASE_URL")||"";
const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const publishable=Deno.env.get("SUPABASE_ANON_KEY")||"";
const admin=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const out=(obj:unknown,status=200)=>new Response(JSON.stringify(obj),{status,headers});
type Row=Record<string,unknown>;
const str=(value:unknown,max=200):string=>String(value??"").trim().slice(0,max);
const maybe=(value:unknown,max=200):string|null=>str(value,max)||null;
const toMoney=(v:unknown):number|null=>{
 if(v===undefined||v===null||str(v)==="")return null;
 const n=Number(String(v).replace(/[, Rs]/gi,""));if(!Number.isFinite(n)||n<0||n>10000000000)throw Error("Invalid salary/allowance");
 return Math.round(n*100)/100;
};
const normalizeStaff=(s:unknown)=>{
 const code=str(s,35).toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9_-]{1,24}$/.test(code))throw Error("Employee number must be 2–25 letters/digits (optionally - or _)");
 return code;
};
const synthetic=(code:string)=>"staff-"+code.toLowerCase()+"@employees.primehr.example.com";
const randomSecret=()=>{
 const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
 const arr=new Uint32Array(24);crypto.getRandomValues(arr);
 return Array.from(arr,n=>alphabet[n%alphabet.length]).join("");
};
const uuidOk=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str(v,60));
const safeDate=(value:unknown)=>{
 const t=str(value,12);if(!t)return null;
 if(!/^\d{4}-\d\d-\d\d$/.test(t))throw Error("Dates must use YYYY-MM-DD");
 const [y,m,d]=t.split("-").map(Number);
 const date=new Date(Date.UTC(y,m-1,d));
 if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw Error("Invalid date");
 return t;
};
const ensureBranch=async(nameOrId:unknown)=>{
 const b=str(nameOrId,140);
 if(!b)throw Error("Branch is required");
 if(uuidOk(b)){
   const {data,error}=await admin.from("branches").select("id").eq("id",b).maybeSingle();
   if(error||!data)throw Error("Unknown branch ID");return data.id as string;
 }
 const {data:found,error:findErr}=await admin.from("branches").select("id").ilike("name",b).limit(1);
 if(findErr)throw Error("Branch lookup failed");
 if(found?.length)return found[0].id as string;
 // Admin-only: create missing branch names during Excel import.
 const {data:branch,error}=await admin.from("branches").insert({name:b}).select("id").single();
 if(error)throw Error("Branch could not be created: "+error.message);
 return branch.id as string;
};
const buildRecord=async(row:Row,actor:string)=>{
 const staff_code=normalizeStaff(row.staff_code??row.employee_no);
 const full_name=str(row.full_name,180),designation=str(row.designation,120);
 if(full_name.length<3||!designation)throw Error("Full Name and Designation are required");
 const branch_id=await ensureBranch(row.branch??row.branch_name??row.branch_id);
 const status=str(row.status||"active",30).toLowerCase();
 if(!["active","on_leave","exited"].includes(status))throw Error("Invalid employee status");
 return {
  staff_code,full_name,designation,branch_id,status,
  department:maybe(row.department,120),phone:maybe(row.phone,45),
  national_id:maybe(row.national_id,45),address:maybe(row.address,500),
  date_of_birth:safeDate(row.date_of_birth),emergency_contact:maybe(row.emergency_contact,100),
  employment_type:maybe(row.employment_type,80),
  bank_name:maybe(row.bank_name,110),bank_branch:maybe(row.bank_branch,110),bank_account:maybe(row.bank_account,80),
  epf_no:maybe(row.epf_no,80),etf_no:maybe(row.etf_no,80),
  basic_salary:toMoney(row.basic_salary),vehicle_allowance:toMoney(row.vehicle_allowance),
  joined_on:safeDate(row.joined_on),hired_by:actor,
 };
};
const log=async(actor:string,action:string,id:string|null,detail:Row={})=>{
 await admin.from("audit_log").insert({actor_id:actor,action,entity:"employee_provisioning",record_id:id,details:detail});
};
const provision=async(raw:Row,actor:string)=>{
 const row=await buildRecord(raw,actor);
 const {data:existing,error:lookErr}=await admin.from("employees")
  .select("id,staff_code,auth_user_id").eq("staff_code",row.staff_code).maybeSingle();
 if(lookErr)throw Error("Cannot look up employee");
 if(existing?.auth_user_id){
   const patch={...row};
   delete (patch as Partial<typeof row>).hired_by;
   const {error}=await admin.from("employees").update(patch).eq("id",existing.id);
   if(error)throw Error("Employee update failed: "+error.message);
   await log(actor,"employee_updated",existing.id,{staff_code:row.staff_code});
   return {staff_code:row.staff_code,full_name:row.full_name,result:"updated",password:null};
 }
 const password=randomSecret();
 const {data:created,error:createError}=await admin.auth.admin.createUser({
   email:synthetic(row.staff_code),password,email_confirm:true,
   user_metadata:{full_name:row.full_name,staff_code:row.staff_code}
 });
 if(createError||!created.user)throw Error("Account creation failed: "+(createError?.message||"unknown"));
 const uid=created.user.id;
 try{
  const {data:emp,error:empErr}=existing?
    await admin.from("employees").update({...row,auth_user_id:uid}).eq("id",existing.id).select("id").single():
    await admin.from("employees").insert({...row,auth_user_id:uid}).select("id").single();
  if(empErr||!emp)throw Error("Staff master save failed: "+(empErr?.message||"unknown"));
  const {error:profileErr}=await admin.from("profiles").update({
    full_name:row.full_name,is_active:row.status==="active",must_change_password:true,role:"employee"
  }).eq("id",uid);
  if(profileErr)throw Error("Account approval failed: "+profileErr.message);
  await log(actor,"employee_provisioned",emp.id,{staff_code:row.staff_code});
  return {staff_code:row.staff_code,full_name:row.full_name,result:"created",password};
 }catch(err){
   // Best effort rollback avoids orphaned login accounts if HR master cannot be saved.
   await admin.auth.admin.deleteUser(uid).catch(()=>{});
   throw err;
 }
};

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return out({error:"POST required"},405);
 if(!url||!secret||!publishable)return out({error:"Server configuration unavailable"},503);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!token)return out({error:"Sign in first"},401);
 const {data:{user},error:userError}=await admin.auth.getUser(token);
 if(userError||!user||!user.email_confirmed_at)return out({error:"Authenticated verified account required"},401);
 const {data:actor,error:actorErr}=await admin.from("profiles").select("id,role,is_active").eq("id",user.id).maybeSingle();
 if(actorErr||!actor?.is_active)return out({error:"Account not approved"},403);
 let body:Row;
 try{body=await req.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error()}catch{return out({error:"Invalid JSON"},400)}
 const action=str(body.action,40);
 try{
  // A staff member may change their own first-use password, but only after old-password proof.
  if(action==="change_password"){
   const current=str(body.current_password,256),next=str(body.new_password,256);
   if(next.length<12||next.length>128||!/^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/.test(next))
     return out({error:"New password needs 12+ characters, uppercase, lowercase and a number."},400);
   if(!current)return out({error:"Enter your current password"},400);
   if(!user.email)return out({error:"Missing login identity"},400);
   const client=createClient(url,publishable,{auth:{autoRefreshToken:false,persistSession:false}});
   const {data:verified,error:passErr}=await client.auth.signInWithPassword({email:user.email,password:current});
   if(passErr||verified.user?.id!==user.id)return out({error:"Current password incorrect"},403);
   const {error:resetError}=await admin.auth.admin.updateUserById(user.id,{password:next});
   if(resetError)throw Error(resetError.message);
   const {error:profileErr}=await admin.from("profiles").update({must_change_password:false}).eq("id",user.id);
   if(profileErr)throw Error(profileErr.message);
   await log(user.id,"password_changed",null,{self:true});
   return out({ok:true});
  }
  if(actor.role!=="admin")return out({error:"Only an approved Admin can manage staff accounts"},403);
  if(action==="provision"){
   if(!Array.isArray(body.rows)||body.rows.length<1||body.rows.length>25)
     return out({error:"Upload 1–25 rows per batch"},400);
   const rows=body.rows as Row[];
   const processed:Row[]=[];
   const seen=new Set<string>();
   for(let i=0;i<rows.length;i++){
    const raw=rows[i];
    try{
     if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Invalid row");
     const code=normalizeStaff(raw.staff_code??raw.employee_no);
     if(seen.has(code))throw Error("Duplicate employee number inside batch");
     seen.add(code);
     processed.push(await provision(raw,user.id));
    }catch(err){processed.push({row:i+1,staff_code:str(raw?.staff_code??raw?.employee_no,40),result:"error",message:String((err as Error).message).slice(0,230)})}
   }
   return out({ok:true,results:processed});
  }
  if(action==="reset_password"){
    const employee_id=str(body.employee_id,70);
    if(!uuidOk(employee_id))return out({error:"Invalid employee ID"},400);
    const {data:emp}=await admin.from("employees").select("id,staff_code,auth_user_id").eq("id",employee_id).maybeSingle();
    if(!emp?.auth_user_id)return out({error:"No linked staff login"},404);
    const password=randomSecret();
    const {error}=await admin.auth.admin.updateUserById(emp.auth_user_id,{password});
    if(error)throw Error(error.message);
    const {error:profileErr}=await admin.from("profiles").update({must_change_password:true}).eq("id",emp.auth_user_id);
    if(profileErr)throw Error(profileErr.message);
    await log(user.id,"password_reset",emp.id,{staff_code:emp.staff_code});
    return out({ok:true,staff_code:emp.staff_code,password});
  }
  if(action==="set_access"){
    const employee_id=str(body.employee_id,70);
    if(!uuidOk(employee_id)||typeof body.enabled!=="boolean")return out({error:"Invalid request"},400);
    const {data:emp}=await admin.from("employees").select("id,staff_code,status,auth_user_id").eq("id",employee_id).maybeSingle();
    if(!emp?.auth_user_id)return out({error:"No linked staff account"},404);
    if(body.enabled&&emp.status!=="active")return out({error:"Staff status must be active first"},400);
    const {error}=await admin.from("profiles").update({is_active:body.enabled}).eq("id",emp.auth_user_id);
    if(error)throw Error(error.message);
    await log(user.id,body.enabled?"staff_login_enabled":"staff_login_disabled",emp.id,{staff_code:emp.staff_code});
    return out({ok:true,staff_code:emp.staff_code,enabled:body.enabled});
  }
  return out({error:"Unknown action"},400);
 }catch(err){
  return out({error:String((err as Error).message||"Unexpected error").slice(0,400)},400);
 }
});

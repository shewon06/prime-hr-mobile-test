/* PRIME HR NEXT LEVEL — Employee Mobile. No email input; Admin-only provisioning.
 * Access credentials are checked by Supabase Auth using a non-routable synthetic
 * internal email derived from the Employee Number. Passwords are never logged.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const safe=s=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const state={client:null,user:null,profile:null,employee:null,attendance:[],leaves:[],notices:[],reads:[],fieldReports:[],busy:false,fieldBusy:false,screen:"home",installPrompt:null,locationPermission:"unknown",locationPermissionStatus:null};
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const time=s=>s?new Date(s).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Colombo"}):"—";
const day=s=>s?String(s).slice(0,10):"—";
let toastTimer;
function toast(message){const e=$("toast");e.textContent=String(message);e.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove("show"),4600)}
function view(name){
 for(const id of ["setupScreen","loginScreen","pendingScreen","passwordScreen","appScreen"])$(id).classList.toggle("hidden",id!==name);
}
function page(name){
 state.screen=name;
 ["home","attendance","field","leave","notices","profile"].forEach(n=>$("page"+n[0].toUpperCase()+n.slice(1)).classList.toggle("hidden",n!==name));
 document.querySelectorAll("[data-screen]").forEach(b=>b.classList.toggle("active",b.dataset.screen===name));
 window.scrollTo({top:0,behavior:"smooth"});
}
function employeeEmail(number){
 const code=String(number||"").trim().toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9_-]{1,24}$/.test(code))throw Error("Use the exact Employee Number given by HR (e.g. M010).");
 return "staff-"+code.toLowerCase()+"@employees.primehr.example.com";
}
async function loadData(){
 const user=state.user;if(!user)return;
 const tasks=[
  state.client.from("profiles").select("id,email,full_name,role,is_active,must_change_password").eq("id",user.id).maybeSingle(),
  state.client.from("employees").select("id,staff_code,full_name,phone,designation,department,branch_id,status,joined_on,staff_group").eq("auth_user_id",user.id).maybeSingle()
 ];
 const results=await Promise.all(tasks);
 if(results.some(r=>r.error))throw Error(results.find(r=>r.error).error.message);
 state.profile=results[0].data;state.employee=results[1].data;
 if(state.profile?.role==="admin"||state.profile?.role==="hr"){location.replace("./");return}
 if(!state.profile?.is_active||!state.employee||state.employee.status!=="active"){view("pendingScreen");return}
 if(state.profile.must_change_password){view("passwordScreen");return}
 const res=await Promise.all([
  state.client.from("attendance").select("id,work_date,check_in,check_out,mode").eq("employee_id",state.employee.id).order("work_date",{ascending:false}).limit(100),
  state.client.from("leave_requests").select("id,kind,from_date,to_date,reason,status").eq("employee_id",state.employee.id).order("created_at",{ascending:false}).limit(100),
  state.client.from("hr_notices").select("id,title,content,published,created_at").eq("published",true).order("created_at",{ascending:false}).limit(100),
  state.client.from("notice_reads").select("notice_id,acknowledged_at").eq("employee_user_id",user.id).limit(500),
  ...(state.employee.staff_group!=="office" ? [state.client.from("field_activity_reports")
    .select("id,activity_type,location_name,notes,created_at,staff_group")
    .eq("employee_id",state.employee.id).order("created_at",{ascending:false}).limit(100)] : [])
 ]);
 if(res.some(r=>r.error))throw Error(res.find(r=>r.error).error.message);
 [state.attendance,state.leaves,state.notices,state.reads]=res.slice(0,4).map(r=>r.data||[]);
 state.fieldReports=res[4]?.data||[];
 render();view("appScreen");page(state.screen||"home");
}
function render(){
 const e=state.employee;if(!e)return;
 $("mobileGreeting").textContent="Hello, "+(e.full_name?.split(" ")[0]||"Employee");
 $("mobileSubtitle").textContent=e.designation+" · "+e.staff_code;
 $("todayDate").textContent=today();$("homeStaffNo").textContent=e.staff_code;
 $("homeDetails").textContent=e.full_name+" · "+e.designation+" · "+(e.phone||"Phone not recorded");
 const group=["office","sales","plantation"].includes(e.staff_group)?e.staff_group:"office";
 const isField=group!=="office";
 const groupLabel={office:"Office Staff",sales:"Sales Team",plantation:"Plantation Team"}[group];
 $("homeTeam").textContent="Team: "+groupLabel;
 $("homeFieldAction").classList.toggle("hidden",!isField);
 $("navField").classList.toggle("hidden",!isField);
 $("workMode").value=isField?"field":"office";
 $("fieldTitle").textContent=group==="sales"?"Sales Work Updates":"Plantation Work Updates";
 $("fieldLocationLabel").firstChild.textContent=group==="sales"?"Customer / Visit Location":"Estate / Site Name";
 if($("fieldActivityType").dataset.team!==group){
   const types=group==="sales"?[
     ["customer_visit","Customer Visit"],["prospecting","Prospecting"],["follow_up","Follow-up"],["collection","Collection"],["other_sales","Other Sales Work"]
   ]:group==="plantation"?[
     ["site_visit","Site Visit"],["field_inspection","Field Inspection"],["planting","Planting Work"],["maintenance","Maintenance"],["other_plantation","Other Plantation Work"]
   ]:[];
   $("fieldActivityType").innerHTML=types.map(([v,n])=>'<option value="'+v+'">'+n+'</option>').join("");
   $("fieldActivityType").dataset.team=group;
 }
 const isCurrentlyWorking=state.attendance.some(a=>a.work_date===today()&&a.check_in&&!a.check_out);
 $("fieldSubmit").disabled=!isField||state.fieldBusy||!isCurrentlyWorking||state.locationPermission==="denied";
 $("fieldAccessMessage").textContent=!isField?"Only Sales and Plantation staff can submit field reports.":
   !isCurrentlyWorking?"First Check In to submit a work update.":
   state.locationPermission==="denied"?"Allow phone Location to submit a work update.":"";
 $("fieldReportHistory").innerHTML=state.fieldReports.length?state.fieldReports.map(x=>
   '<div class="entry"><div class="row"><b>'+safe(x.location_name)+'</b><span class="chip">'+safe(x.activity_type.replaceAll("_"," "))+'</span></div><p>'+safe(new Date(x.created_at).toLocaleString("en-GB",{timeZone:"Asia/Colombo"}))+'</p>'+(x.notes?'<p>'+safe(x.notes)+'</p>':"")+'</div>'
 ).join(""):'<p class="soft">No work updates submitted yet.</p>';
 const record=state.attendance.find(a=>a.work_date===today());
 const locationBlocked=state.locationPermission==="denied";
 $("attendanceAccessMessage").textContent=locationBlocked
   ?"Check In / Check Out කිරීමට phone/browser settings වල Location Allow කරන්න."
   :"";
 $("attendanceState").textContent=record?(record.check_out?"Completed":"Checked In"):"Not In";
 $("employeeCheckIn").disabled=state.busy||locationBlocked||!!record;
 $("employeeCheckOut").disabled=state.busy||locationBlocked||!record||!!record.check_out;
 $("attendanceMessage").textContent=record?"In: "+time(record.check_in)+"  ·  Out: "+time(record.check_out)+" · "+record.mode:"No check-in recorded today.";
 $("attendanceHistory").innerHTML=state.attendance.length?state.attendance.slice(0,30).map(a=>
  '<div class="entry"><div class="row"><b>'+safe(a.work_date)+'</b><span class="chip">'+safe(a.mode)+'</span></div><p>In '+safe(time(a.check_in))+' · Out '+safe(time(a.check_out))+'</p></div>').join(""):'<p class="soft">No attendance records yet.</p>';
 $("leaveHistory").innerHTML=state.leaves.length?state.leaves.map(l=>
  '<div class="entry"><div class="row"><b>'+safe(l.kind)+'</b><span class="chip">'+safe(l.status)+'</span></div><p>'+safe(day(l.from_date))+' to '+safe(day(l.to_date))+'</p></div>').join(""):'<p class="soft">No leave applications yet.</p>';
 $("noticeList").innerHTML=state.notices.length?state.notices.map(n=>{
  const done=state.reads.some(r=>r.notice_id===n.id);
  return '<article class="notice"><h3>'+safe(n.title)+'</h3><small>'+safe(day(n.created_at))+'</small><p>'+safe(n.content)+'</p>'+
  (done?'<span class="chip">✓ Acknowledged</span>':'<button class="btn outline" data-notice="'+safe(n.id)+'">Acknowledge Notice</button>')+'</article>';
 }).join(""):'<p class="soft">No published notices yet.</p>';
 const props=[["Employee Number",e.staff_code],["Name",e.full_name],["Phone",e.phone||"—"],
 ["Designation",e.designation],["Department",e.department||"—"],["Joining Date",e.joined_on||"—"]];
 $("profileList").innerHTML=props.map(([k,v])=>'<div class="entry row"><span class="soft">'+safe(k)+'</span><strong>'+safe(v)+'</strong></div>').join("");
}
// Restore the saved Supabase session; opening and closing the app never calls signOut.
async function checkSession(){
 const {data:{session},error}=await state.client.auth.getSession();
 if(error)throw error;
 if(!session){view("loginScreen");return}
 state.user=session.user;
 await loadData();
 if(state.profile?.is_active && state.employee?.status==="active"){
   await observeLocationPermission();
   requestNativeLocationOnce();
 }
}
// Request the standard phone/browser permission exactly once for each installed
// employee account. Login only asks permission; GPS is NOT recorded or sent to HR.
// getCurrentPosition triggers the OS dialog; no custom alert/toast is displayed.
// Observe the browser permission state without triggering an additional request.
async function observeLocationPermission(){
 if(!state.user||!state.employee||!state.profile?.is_active)return;
 if(!window.isSecureContext||!navigator.geolocation){
   state.locationPermission="denied";render();return;
 }
 if(!navigator.permissions?.query)return;
 try{
   const status=await navigator.permissions.query({name:"geolocation"});
   state.locationPermissionStatus=status;
   state.locationPermission=status.state;
   status.onchange=()=>{
     state.locationPermission=status.state;
     if(state.employee)render();
   };
   render();
 }catch{
   // iOS/browser versions without Permissions API still enforce GPS permission
   // through getCurrentPosition before submitting attendance.
   state.locationPermission="unknown";
 }
}
function requestNativeLocationOnce(){
 if(!state.user || !state.profile?.is_active || state.employee?.status!=="active")return;
 if(!window.isSecureContext || !navigator.geolocation)return;
 const key="prime_hr_location_requested_"+state.user.id;
 if(localStorage.getItem(key)==="yes")return;
 localStorage.setItem(key,"yes");
 navigator.geolocation.getCurrentPosition(
   ()=>{state.locationPermission="granted";if(state.employee)render();},
   ()=>{observeLocationPermission();},
   {enableHighAccuracy:true,maximumAge:0,timeout:20000}
 );
}
function gps(){
 return new Promise((resolve,reject)=>{
  if(!window.isSecureContext||!navigator.geolocation)return reject(Error("Location requires HTTPS and a supported phone."));
  navigator.geolocation.getCurrentPosition(p=>{
   const {latitude,longitude,accuracy}=p.coords;
   if(![latitude,longitude,accuracy].every(Number.isFinite)||accuracy>1000)
    return reject(Error("Location accuracy is too low. Enable Precise Location or move outside."));
   state.locationPermission="granted";
   resolve({latitude,longitude,accuracy});
  },err=>{
    if(err.code===1)state.locationPermission="denied";
    reject(Error(err.code===1?"Attendance requires Location Allow. Enable it in phone/browser settings.":err.code===2?"Location unavailable. Turn on phone location services.":"Location timeout. Try again outside."));
  },
  {enableHighAccuracy:true,maximumAge:0,timeout:20000});
 });
}
async function submitFieldReport(ev){
 ev.preventDefault();
 if(state.fieldBusy||!state.employee||!["sales","plantation"].includes(state.employee.staff_group))return;
 const activeToday=state.attendance.some(a=>a.work_date===today()&&a.check_in&&!a.check_out);
 if(!activeToday)return toast("Check In before submitting a field work update.");
 if(state.locationPermission==="denied")return toast("Location Allow is required to save the work update.");
 const f=new FormData(ev.target);
 const location_name=String(f.get("location_name")||"").trim();
 const notes=String(f.get("notes")||"").trim();
 if(location_name.length<2||location_name.length>180)return toast("Enter a customer or site name.");
 if(notes.length>1000)return toast("Notes are too long.");
 const activity_type=String(f.get("activity_type")||"");
 state.fieldBusy=true;render();
 try{
   const p=await gps();
   const {error}=await state.client.from("field_activity_reports").insert({
    employee_id:state.employee.id,staff_group:state.employee.staff_group,
    activity_type,location_name,notes:notes||null,latitude:p.latitude,longitude:p.longitude,accuracy_m:p.accuracy
   });
   if(error)throw Error(error.message);
   ev.target.reset();
   toast("Work update saved.");
   await loadData();
 }catch(err){toast(err.message);await observeLocationPermission()}
 finally{state.fieldBusy=false;render()}
}
async function markAttendance(action){
 if(state.busy||!state.employee)return;
 if(state.locationPermission==="denied"){
   toast("Location Allow is required to mark attendance. Enable it in phone/browser settings.");
   return;
 }
 state.busy=true;render();
 try{
  const p=await gps();
  const {error}=await state.client.rpc("hr_mark_attendance",{
   p_action:action,p_lat:p.latitude,p_lng:p.longitude,p_accuracy:p.accuracy,p_mode:$("workMode").value
  });
  if(error)throw Error(error.message);

  toast("Attendance saved successfully.");
  await loadData();
 }catch(e){toast(e.message);await observeLocationPermission()}
 finally{state.busy=false;render()}
}
async function login(ev){
 ev.preventDefault();const b=$("loginButton");b.disabled=true;
 try{
  const f=new FormData(ev.target);
  const email=employeeEmail(f.get("number"));const password=String(f.get("password")||"");
  const {data,error}=await state.client.auth.signInWithPassword({email,password});
  if(error)throw Error("Employee Number or password is incorrect.");
  if(!data.user)throw Error("Login failed.");
  state.user=data.user;await loadData();
  if(state.profile?.is_active && state.employee?.status==="active"){
    await observeLocationPermission();
    requestNativeLocationOnce();
  }
 }catch(e){toast(e.message)}finally{b.disabled=false}
}
async function passwordChange(ev){
 ev.preventDefault();
 const f=new FormData(ev.target);const current=String(f.get("current_password")||""),next=String(f.get("new_password")||"");
 if(next!==String(f.get("confirm_password")||""))return toast("New passwords do not match.");
 if(next.length<12)return toast("New password must contain at least 12 characters.");
 const btn=ev.target.querySelector('button[type="submit"]');btn.disabled=true;
 try{
  const {data,error}=await state.client.functions.invoke("prime-staff-admin",{body:{action:"change_password",current_password:current,new_password:next}});
  if(error)throw Error(error.message);if(data?.error)throw Error(data.error);
  await state.client.auth.refreshSession();
  ev.target.reset();toast("Password updated. Welcome to PRIME HR.");
  await checkSession();
 }catch(e){toast(e.message)}finally{btn.disabled=false}
}
async function leave(ev){
 ev.preventDefault();
 const f=new FormData(ev.target);
 const from=String(f.get("from_date")),to=String(f.get("to_date"));
 if(to<from)return toast("End date cannot be earlier than start date.");
 const {error}=await state.client.from("leave_requests").insert({
  employee_id:state.employee.id,kind:String(f.get("kind")),from_date:from,to_date:to,
  reason:String(f.get("reason")).trim().slice(0,600),status:"pending"
 });
 if(error)return toast(error.message);
 ev.target.reset();toast("Leave request submitted for HR approval.");await loadData();
}
async function ack(id){
 const {error}=await state.client.from("notice_reads").insert({notice_id:id,employee_user_id:state.user.id});
 if(error)return toast(error.message);
 toast("Notice acknowledged.");await loadData();
}
function setupInstall(){
 const already=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
 if(already){$("installApp").textContent="✓ App Installed";$("installApp").disabled=true}
 window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();state.installPrompt=e;
  $("installApp").textContent="⬇ Install PRIME HR Now";
 });
 $("installApp").addEventListener("click",async()=>{
  if(state.installPrompt){
   const p=state.installPrompt;state.installPrompt=null;
   await p.prompt();
   const decision=await p.userChoice;
   if(decision.outcome==="accepted"){toast("PRIME HR added to Home Screen");$("installApp").textContent="✓ Installed";$("installApp").disabled=true}
   else toast("Install cancelled. Try the Chrome browser menu.");
   return;
  }
  const iphone=/iPhone|iPad|iPod/i.test(navigator.userAgent);
  toast(iphone?"iPhone: Safari Share icon → Add to Home Screen → Add":"Android: Open in Chrome, then ⋮ → Install app / Add to Home Screen.");
 });
 window.addEventListener("appinstalled",()=>{$("installApp").textContent="✓ Installed";$("installApp").disabled=true});
}
async function init(){
 setupInstall();
 $("employeeLogin").addEventListener("submit",login);
 $("passwordForm").addEventListener("submit",passwordChange);
 $("leaveForm").addEventListener("submit",leave);
 $("fieldForm").addEventListener("submit",submitFieldReport);

 $("employeeCheckIn").addEventListener("click",()=>markAttendance("check_in"));
 $("employeeCheckOut").addEventListener("click",()=>markAttendance("check_out"));
 document.addEventListener("visibilitychange",()=>{
   if(document.visibilityState==="visible"&&state.user&&state.employee)observeLocationPermission();
 });
 // No employee sign-out: device stores the login session across app closes.
 // Admin can revoke staff access server-side if their phone is lost.
 $("changePasswordButton").addEventListener("click",()=>view("passwordScreen"));
 document.querySelectorAll("[data-screen]").forEach(b=>b.addEventListener("click",()=>page(b.dataset.screen)));
 $("noticeList").addEventListener("click",e=>{const b=e.target.closest("[data-notice]");if(b)ack(b.dataset.notice)});
 const cfg=window.PRIME_HR_CONFIG||{};
 if(!cfg.supabaseUrl||!cfg.supabasePublishableKey||!window.supabase?.createClient){view("setupScreen");return}
 state.client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}});
 if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js",{scope:"./"}).catch(()=>{});
 try{await checkSession()}catch(err){toast("Unable to load HR account: "+err.message);view("loginScreen")}
}
document.addEventListener("DOMContentLoaded",init);
})();
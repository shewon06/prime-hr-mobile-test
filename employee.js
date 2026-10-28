/* PRIME HR NEXT LEVEL — Employee Mobile. No email input; Admin-only provisioning.
 * Access credentials are checked by Supabase Auth using a non-routable synthetic
 * internal email derived from the Employee Number. Passwords are never logged.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const safe=s=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const state={client:null,user:null,profile:null,employee:null,attendance:[],leaves:[],notices:[],reads:[],notifications:[],alertChannel:null,alertChannelUser:null,alertsInitialized:false,pushSubscribed:false,busy:false,sessionValidationPending:false,endingInvalidSession:false,screen:(location.hash==="#alerts"?"alerts":"home"),installPrompt:null,locationPermission:"unknown",locationPermissionStatus:null};
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
 ["home","attendance","leave","alerts","notices","profile"].forEach(n=>$("page"+n[0].toUpperCase()+n.slice(1)).classList.toggle("hidden",n!==name));
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
  state.client.from("employee_notifications")
    .select("id,kind,title,body,source_id,read_at,created_at")
    .eq("recipient_id",user.id).order("created_at",{ascending:false}).limit(100)
 ]);
 if(res.some(r=>r.error))throw Error(res.find(r=>r.error).error.message);
 [state.attendance,state.leaves,state.notices,state.reads]=res.slice(0,4).map(r=>r.data||[]);
 state.notifications=res[res.length-1]?.data||[];
 state.alertsInitialized=true;
 render();view("appScreen");page(state.screen||"home");
 subscribeToAlerts();
 restorePushSubscription();
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
 $("employeeFieldDuty").classList.toggle("hidden",!isField);
 $("attendanceStartActions").style.gridTemplateColumns=isField?"repeat(2,minmax(0,1fr))":"1fr";
 const record=state.attendance.find(a=>a.work_date===today());
 const locationBlocked=state.locationPermission==="denied";
 $("attendanceAccessMessage").textContent=locationBlocked
   ?"Check In / Field Duty / Check Out කිරීමට phone/browser settings වල Location Allow කරන්න."
   :"";
 $("attendanceState").textContent=record?(record.check_out?"Completed":record.mode==="field"?"Field Duty":"Checked In"):"Not In";
 $("employeeCheckIn").disabled=state.busy||locationBlocked||!!record;
 $("employeeFieldDuty").disabled=state.busy||locationBlocked||!!record||!isField;
 $("employeeCheckOut").disabled=state.busy||locationBlocked||!record||!!record.check_out;
 $("attendanceMessage").textContent=record?(record.mode==="field"?"Field Duty":"Office Attendance")+" · In: "+time(record.check_in)+"  · Out: "+time(record.check_out):"No check-in recorded today.";
 $("attendanceHistory").innerHTML=state.attendance.length?state.attendance.slice(0,30).map(a=>
  '<div class="entry"><div class="row"><b>'+safe(a.work_date)+'</b><span class="chip">'+safe(a.mode==="field"?"Field Duty":"Office") +'</span></div><p>In '+safe(time(a.check_in))+' · Out '+safe(time(a.check_out))+'</p></div>').join(""):'<p class="soft">No attendance records yet.</p>';
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
 renderAlerts();
}

function renderAlerts(){
 const unread=state.notifications.filter(n=>!n.read_at).length;
 $("alertsUnreadCount").textContent=unread+" new";
 $("homeUnreadCount").textContent=String(unread);
 $("navUnreadCount").textContent=String(unread);
 $("homeUnreadCount").classList.toggle("hidden",unread===0);
 $("navUnreadCount").classList.toggle("hidden",unread===0);
 if("setAppBadge" in navigator){
  (unread?navigator.setAppBadge(unread):navigator.clearAppBadge?.())?.catch?.(()=>{});
 }
 $("alertsList").innerHTML=state.notifications.length?state.notifications.map(n=>{
  const when=new Date(n.created_at).toLocaleString("en-GB",{timeZone:"Asia/Colombo"});
  return '<article class="notice" style="'+(!n.read_at?'border-left:4px solid #176143;':'')+'">'+
    '<div class="row"><h3>'+safe(n.title)+'</h3><span class="chip">'+(n.read_at?"Read":"New")+'</span></div>'+
    '<small>'+safe(when)+'</small><p>'+safe(n.body)+'</p>'+
    '<button class="btn outline" type="button" data-alert-open="'+safe(n.id)+'">'+
       (n.kind==="hr_notice"?"Open Notice":n.kind.startsWith("attendance_")?"Open Attendance":"View Leave Request")+'</button></article>';
 }).join(""):'<p class="soft">No notifications yet. Leave decisions and HR notices will appear here.</p>';
 if(!("Notification" in window)){
  $("alertsPermissionButton").disabled=true;
  $("alertsPermissionStatus").textContent="This browser cannot enable phone alerts. On iPhone (iOS 16.4+), open PRIME HR in Safari, use Share → Add to Home Screen, then launch the installed app and enable alerts there. In-app alerts still work.";
  return;
 }
 const permission=Notification.permission;
 $("alertsPermissionButton").disabled=permission==="granted"&&state.pushSubscribed;
 $("alertsPermissionButton").textContent=state.pushSubscribed?"✓ Background Push Enabled":"Enable Phone Alerts";
 $("alertsPermissionStatus").textContent=state.pushSubscribed?
  "Background notifications are enabled on this device, even when the app is closed. Phone/OS battery and notification settings can affect delivery.":
  permission==="granted"?"Permission granted. Tap Enable Phone Alerts to connect this device for background push.":
  permission==="denied"?"Phone alerts are blocked in your browser settings. Your in-app inbox still works.":
  "Tap Enable Phone Alerts to allow standard phone/browser alerts while the app is running.";
}
function decodePushKey(b64){
 const padded=b64.replace(/-/g,"+").replace(/_/g,"/");
 const data=atob(padded+"=".repeat((4-padded.length%4)%4));
 return Uint8Array.from(data,ch=>ch.charCodeAt(0));
}
async function storeDeviceSubscription(sub){
 const json=sub.toJSON();
 if(!json.keys?.p256dh||!json.keys?.auth)throw Error("Device encryption keys missing.");
 const {error}=await state.client.from("push_subscriptions").upsert({
  user_id:state.user.id,
  endpoint:sub.endpoint,
  p256dh:json.keys.p256dh,
  auth_key:json.keys.auth
 },{onConflict:"endpoint"});
 if(error)throw Error("Could not register this phone: "+error.message);
 state.pushSubscribed=true;
 renderAlerts();
}
async function restorePushSubscription(){
 if(!state.user||!navigator.serviceWorker||!window.PushManager||!("Notification" in window))return;
 if(Notification.permission!=="granted")return;
 try{
  const reg=await navigator.serviceWorker.ready;
  const sub=await reg.pushManager.getSubscription();
  if(sub)await storeDeviceSubscription(sub);
 }catch(e){console.warn("Push restore",e)}
}
async function enablePhoneAlerts(){
 if(!window.isSecureContext||!("Notification" in window)||
    !("serviceWorker" in navigator)||!("PushManager" in window)){
  return toast("Background push is unsupported on this phone/browser. On iPhone, use Safari Add to Home Screen (iOS 16.4+).");
 }
 const key=window.PRIME_HR_CONFIG?.pushPublicKey;
 if(!key)return toast("Push server configuration is missing. Contact HR.");
 try{
  // Ask for notification permission directly inside the user-tap handler.
  let permission=Notification.permission;
  if(permission==="default")permission=await Notification.requestPermission();
  if(permission!=="granted"){
   toast("Phone Notifications need Allow permission. Check your phone settings.");
   return;
  }
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub){
   sub=await reg.pushManager.subscribe({
     userVisibleOnly:true,
     applicationServerKey:decodePushKey(key)
   });
  }
  await storeDeviceSubscription(sub);
  toast("Background notifications enabled on this phone.");
 }catch(err){
  state.pushSubscribed=false;
  toast("Could not enable background alerts: "+err.message);
  renderAlerts();
 }
}
async function showBrowserAlert(n){
 if(!("Notification" in window)||Notification.permission!=="granted")return;
 // A device with a Web Push subscription receives the remote service-worker
 // notification; don't show a duplicate foreground-local notification.
 if(state.pushSubscribed)return;
 try{
  const opt={body:n.body,icon:"./icon-192.png",badge:"./icon-192.png",tag:"prime-hr-"+n.id,data:{target:"alerts"}};
  if("serviceWorker" in navigator){
   const reg=await navigator.serviceWorker.getRegistration("./");
   if(reg&&"showNotification" in reg){await reg.showNotification(n.title,opt);return}
  }
  const notice=new Notification(n.title,opt);
  notice.onclick=()=>{window.focus();page("alerts");notice.close()};
 }catch{/* The authenticated in-app inbox remains available. */}
}
// Show freshly published HR Notices prominently while this app is open.
// Do not replay old notifications on login or when reopening the app.
const hrPopupQueue=[];
const hrPopupSeen=new Set();
function showNextHRNoticePopup(){
 const dialog=$("hrNoticePopup");
 if(!dialog||dialog.open||document.visibilityState!=="visible"||!state.employee)return;
 const next=hrPopupQueue.shift();
 if(!next)return;
 dialog.dataset.notificationId=next.id;
 $("hrPopupTitle").textContent=next.title||"New HR Notice";
 $("hrPopupBody").textContent=next.body||"A new HR notice has been published.";
 if(typeof dialog.showModal==="function")dialog.showModal();
 else{dialog.setAttribute("open","");}
}
function queueHRNoticePopup(n){
 if(n?.kind!=="hr_notice"||!n.id||document.visibilityState!=="visible"||!state.employee)return;
 if(hrPopupSeen.has(n.id))return;
 hrPopupSeen.add(n.id);
 hrPopupQueue.push({id:n.id,title:n.title,body:n.body});
 showNextHRNoticePopup();
}
function closeHRNoticePopup(){
 const d=$("hrNoticePopup");
 if(d.open&&typeof d.close==="function")d.close();
 else d.removeAttribute("open");
}
function acceptNewAlert(n){
 if(!n?.id||state.notifications.some(x=>x.id===n.id))return;
 state.notifications.unshift(n);
 state.notifications=state.notifications.slice(0,100);
 renderAlerts();
 if(n.kind==="hr_notice")queueHRNoticePopup(n);
 else toast(n.title);
 showBrowserAlert(n);
 if(n.kind==="hr_notice"){
  state.client.from("hr_notices").select("id,title,content,published,created_at")
   .eq("published",true).order("created_at",{ascending:false}).limit(100)
   .then(({data,error})=>{if(!error){state.notices=data||[];render()}});
 }else if(n.kind.startsWith("leave_")){
  state.client.from("leave_requests").select("id,kind,from_date,to_date,reason,status")
   .eq("employee_id",state.employee.id).order("created_at",{ascending:false}).limit(100)
   .then(({data,error})=>{if(!error){state.leaves=data||[];render()}});
 }
}
async function refreshAlerts(){
 if(!state.user||!state.employee)return;
 const {data,error}=await state.client.from("employee_notifications")
  .select("id,kind,title,body,source_id,read_at,created_at")
  .eq("recipient_id",state.user.id).order("created_at",{ascending:false}).limit(100);
 if(error)return;
 const known=new Set(state.notifications.map(n=>n.id));
 const fresh=(data||[]).filter(n=>!known.has(n.id));
 state.notifications=data||[];
 renderAlerts();
 if(state.alertsInitialized){
  for(const n of fresh.slice(0,3)){
   if(n.kind==="hr_notice")queueHRNoticePopup(n);
   else toast(n.title);
   showBrowserAlert(n);
  }
 }
 state.alertsInitialized=true;
 if(fresh.some(n=>n.kind==="hr_notice"||n.kind.startsWith("leave_"))){
  const [notices,leaves]=await Promise.all([
   state.client.from("hr_notices").select("id,title,content,published,created_at").eq("published",true).order("created_at",{ascending:false}).limit(100),
   state.client.from("leave_requests").select("id,kind,from_date,to_date,reason,status").eq("employee_id",state.employee.id).order("created_at",{ascending:false}).limit(100)
  ]);
  if(!notices.error)state.notices=notices.data||[];
  if(!leaves.error)state.leaves=leaves.data||[];
  render();
 }
}
function subscribeToAlerts(){
 if(!state.user||state.alertChannelUser===state.user.id)return;
 if(state.alertChannel)state.client.removeChannel(state.alertChannel);
 const uid=state.user.id;
 state.alertChannelUser=uid;
 state.alertChannel=state.client.channel("prime-employee-alerts-"+uid)
   .on("postgres_changes",{
     event:"INSERT",schema:"public",table:"employee_notifications",filter:"recipient_id=eq."+uid
   },payload=>acceptNewAlert(payload.new))
   .subscribe();
}
async function markAlertRead(id){
 const n=state.notifications.find(n=>n.id===id);
 if(!n)return;
 if(!n.read_at){
  const when=new Date().toISOString();
  const {error}=await state.client.from("employee_notifications")
   .update({read_at:when}).eq("id",id).eq("recipient_id",state.user.id);
  if(error){toast("Unable to mark notification read: "+error.message);return}
  n.read_at=when;
  renderAlerts();
 }
 page(n.kind==="hr_notice"?"notices":n.kind.startsWith("attendance_")?"attendance":"leave");
}

// Restore the saved Supabase session; opening and closing the app never calls signOut.

/* Server-side session revocation can leave a stale login visible on an already-open PWA.
   This client-side guard clears only the expired/revoked local session.
   No staff-facing Logout button is added. */
async function endRevokedEmployeeSession(){
 if(state.endingInvalidSession)return;
 state.endingInvalidSession=true;
 if(state.alertChannel&&state.client){
  try{state.client.removeChannel(state.alertChannel)}catch(_){}
 }
 state.alertChannel=null;
 state.alertChannelUser=null;
 state.user=null;
 state.profile=null;
 state.employee=null;
 state.attendance=[];state.leaves=[];state.notices=[];state.reads=[];
 state.notifications=[];
 state.alertsInitialized=false;
 state.pushSubscribed=false;
 state.screen="home";
 const popup=$("hrNoticePopup");
 if(popup?.open&&typeof popup.close==="function")popup.close();
 view("loginScreen");
 try{
  // Local scope: do not affect other devices or employee accounts.
  await state.client.auth.signOut({scope:"local"});
 }catch(e){
  console.warn("Local session sign out",e);
 }
 // Revoked server sessions sometimes make the Auth sign-out API reject the request.
 // Clear only this project's cached login key, not other site/app data.
 try{
  const projectHost=String(window.PRIME_HR_CONFIG?.supabaseUrl||"").split("/")[2]||"";
  if(projectHost){
   const storageKey="sb-"+projectHost.split(".")[0]+"-auth-token";
   window.localStorage.removeItem(storageKey);
  }
 }catch(e){console.warn("Local login cache",e)}
 state.endingInvalidSession=false;
 toast("Your previous login session has ended. Please sign in again.");
}
async function verifyEmployeeServerSession(){
 if(!state.client||!state.user||state.endingInvalidSession)return false;
 if(state.sessionValidationPending)return true;
 state.sessionValidationPending=true;
 try{
  const {data,error}=await state.client.rpc("prime_is_current_employee_session_active");
  if(error){
   // A temporary network interruption must not log out all legitimate staff.
   if(/expired.*jwt|invalid.*jwt|refresh token.*(not found|invalid)|session.*(not found|expired)|not authenticated/i.test(String(error.message||""))){
    await endRevokedEmployeeSession();
    return false;
   }
   console.warn("Employee session check delayed",error.message);
   return !!state.user;
  }
  if(data===false){
   await endRevokedEmployeeSession();
   return false;
  }
  return !!state.user;
 }catch(err){
  console.warn("Employee session verification unavailable",err);
  return !!state.user;
 }finally{
  state.sessionValidationPending=false;
 }
}

async function checkSession(){
 const {data:{session},error}=await state.client.auth.getSession();
 if(error)throw error;
 if(!session){view("loginScreen");return}
 state.user=session.user;
 if(!await verifyEmployeeServerSession())return;
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
async function markAttendance(action,mode="office"){
 if(state.busy||!state.employee)return;
 if(state.locationPermission==="denied"){
   toast("Location Allow is required to mark attendance. Enable it in phone/browser settings.");
   return;
 }
 state.busy=true;render();
 try{
  const p=await gps();
  const current=state.attendance.find(a=>a.work_date===today());
  const attendanceMode=action==="check_out"?(current?.mode||"office"):mode;
  const {error}=await state.client.rpc("hr_mark_attendance",{
   p_action:action,p_lat:p.latitude,p_lng:p.longitude,p_accuracy:p.accuracy,p_mode:attendanceMode
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
  state.user=data.user;
  if(!await verifyEmployeeServerSession())return;
  await loadData();
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
 $("alertsPermissionButton").addEventListener("click",enablePhoneAlerts);
 $("hrPopupLater").addEventListener("click",closeHRNoticePopup);
 $("hrPopupOpen").addEventListener("click",()=>{
  const id=$("hrNoticePopup").dataset.notificationId;
  closeHRNoticePopup();
  if(id)markAlertRead(id);
  else page("notices");
 });
 $("hrNoticePopup").addEventListener("close",()=>{
  // Keep a series of incoming Notices sequential instead of losing them.
  if(hrPopupQueue.length)showNextHRNoticePopup();
 });
 $("alertsList").addEventListener("click",e=>{
  const b=e.target.closest("[data-alert-open]");
  if(b)markAlertRead(b.dataset.alertOpen);
 });

 $("employeeCheckIn").addEventListener("click",()=>markAttendance("check_in","office"));
 $("employeeFieldDuty").addEventListener("click",()=>markAttendance("check_in","field"));
 $("employeeCheckOut").addEventListener("click",()=>markAttendance("check_out"));
 document.addEventListener("visibilitychange",()=>{
   if(document.visibilityState==="visible"&&state.user&&state.employee){
    void verifyEmployeeServerSession().then(valid=>{
     if(valid&&state.employee){observeLocationPermission();refreshAlerts()}
    });
   }
 });
 // Validate revoked sessions even if the mobile app stays open for hours.
 window.setInterval(()=>{
  if(!document.hidden&&state.user&&state.employee){
   void verifyEmployeeServerSession();
  }
 },15000);
 // Fallback check for browsers where Realtime is suspended.
 window.setInterval(()=>{if(!document.hidden&&state.user&&state.employee)refreshAlerts()},60000);
 if("serviceWorker" in navigator)navigator.serviceWorker.addEventListener("message",event=>{
  if(event.data?.type==="PRIME_HR_OPEN_ALERTS"&&state.employee)page("alerts");
 });
 // No employee-facing sign-out button: sessions persist until revoked, expired, or explicitly cleared by HR.
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
/* PRIME HR NEXT LEVEL • Cloud-first HR frontend
   Public source code contains NO private HR records or secret database keys.
   RLS policies in schema.sql enforce authorization on the database server. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const state = {client:null,user:null,profile:null,view:"dashboard",branches:[],employees:[],attendance:[],leaves:[],candidates:[],profiles:[],locations:[],fieldReports:[],payroll:[],entitlements:[],letterTemplates:[],letterDrafts:[],notices:[],reads:[],kpis:[],assets:[],letters:[],signup:false,loading:false,gpsBusy:false,staffUploadRows:[],staffCredentials:[],staffImportProgress:false};
  const nameOf = e => e ? e.full_name : "Unknown employee";
  const esc = input => String(input ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const dateText = s => s ? new Date(s + (String(s).length===10?"T12:00:00":"")).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"Asia/Colombo"}) : "—";
  const timeText = s => s ? new Date(s).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Colombo"}) : "—";
  const localDate = () => new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const isHR = () => !!state.profile && state.profile.is_active && ["admin","hr"].includes(state.profile.role);
  const isAdmin = () => !!state.profile && state.profile.is_active && state.profile.role === "admin";
  const mine = () => state.employees.find(e=>e.auth_user_id===state.user?.id && e.status==="active");
  const branchName = id => state.branches.find(b=>b.id===id)?.name || "Unassigned";
  const employeeName = id => nameOf(state.employees.find(e=>e.id===id));
  const empty = (col,text) => '<tr><td colspan="'+col+'" class="empty">'+esc(text)+'</td></tr>';
  let toastTimer;

  function toast(msg, err=false) {
    const t=$("toast"); t.textContent=String(msg); t.className="show"+(err?" error":"");
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.className="",4500);
  }
  function screen(id) {
    ["loader","setup-screen","auth-screen","pending-screen","workspace"].forEach(x=>$(x).classList.toggle("hidden",x!==id));
  }
  function fmtStatus(value) {
    const s=String(value||"unknown").toLowerCase();
    return '<span class="pill '+esc(s)+'">'+esc(value)+'</span>';
  }
  function normalizeErr(error) {
    const text=String(error?.message||error||"Request failed");
    return text.length>180?text.slice(0,180)+"…":text;
  }
  function toggleAuth() {
    state.signup=!state.signup;
    $("auth-title").textContent=state.signup?"Request employee access":"Welcome back";
    $("name-wrap").classList.toggle("hidden",!state.signup);
    $("auth-name").required=state.signup;
    $("auth-submit").textContent=state.signup?"Request account":"Sign in";
    $("toggle-auth").textContent=state.signup?"Already registered? Sign in":"New employee? Request an account";
  }
  async function submitAuth(event) {
    event.preventDefault();
    const email=$("auth-email").value.trim().toLowerCase();
    const password=$("auth-password").value;
    const b=$("auth-submit"); b.disabled=true;
    try{
      if (state.signup) {
        const full_name=$("auth-name").value.trim();
        if (!full_name) throw Error("Please enter your full name.");
        const {error}=await state.client.auth.signUp({email,password,options:{emailRedirectTo:new URL("./",window.location.href).href,data:{full_name}}});
        if(error) throw error;
        toast("Registration received. Check your email for confirmation and wait for administrator approval.");
        state.signup=true; toggleAuth(); // revert to login
        $("auth-form").reset();
      } else {
        const {error}=await state.client.auth.signInWithPassword({email,password});
        if(error) throw error;
        await loadSession();
      }
    }catch(err){toast(normalizeErr(err),true)}finally{b.disabled=false}
  }
  async function loadSession() {
    try{
      const {data:{session},error}=await state.client.auth.getSession();
      if(error) throw error;
      if(!session){state.user=null;state.profile=null;screen("auth-screen");return}
      state.user=session.user;
      const {data:profile,error:perr}=await state.client.from("profiles").select("id,email,full_name,role,is_active,must_change_password").eq("id",state.user.id).maybeSingle();
      if(perr) throw perr;
      if(!profile) {screen("pending-screen");$("pending-user").textContent="No employee profile found. Contact the administrator.";return}
      state.profile=profile;
      if(!profile.is_active){$("pending-user").textContent=profile.email||state.user.email;screen("pending-screen");return}
      $("user-name").textContent=profile.full_name||profile.email;
      $("user-role").textContent=profile.role.toUpperCase();
      $("side-role").textContent="Role: "+profile.role.toUpperCase();
      $("user-initial").textContent=(profile.full_name||profile.email||"P")[0].toUpperCase();
      document.querySelectorAll(".hr-only").forEach(el=>el.classList.toggle("hidden",!isHR()));
      document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",!isAdmin()));
      if(!isHR()){window.location.replace("./employee.html");return}
      screen("workspace");
      await fetchData();
      await offerLocationOnboarding();
    }catch(err){console.error("Session error",err);toast("Account loading failed. Check your database setup and permissions.",true);screen("auth-screen")}
  }
  async function fetchData() {
    if(state.loading)return;
    state.loading=true;
    try {
      const all=[
        state.client.from("branches").select("id,name").order("name"),
        state.client.from("employees").select("id,staff_code,full_name,email,phone,designation,department,branch_id,joined_on,status,staff_group,auth_user_id,national_id,address,date_of_birth,emergency_contact,employment_type,bank_name,bank_branch,bank_account,epf_no,etf_no,basic_salary,vehicle_allowance").order("full_name").limit(1000),
        state.client.from("attendance").select("id,employee_id,work_date,check_in,check_out,mode").order("check_in",{ascending:false}).limit(500),
        state.client.from("leave_requests").select("id,employee_id,kind,from_date,to_date,reason,status").order("created_at",{ascending:false}).limit(500)
      ];
      if(isHR()) all.push(state.client.from("candidates").select("id,full_name,email,position,branch_id,stage,notes").order("created_at",{ascending:false}).limit(500));
      if(isHR()) all.push(state.client.from("profiles").select("id,email,full_name,role,is_active").order("email").limit(1000));
      
      if(isHR())all.push(state.client.from("attendance_locations").select("id,attendance_id,employee_id,event_type,latitude,longitude,accuracy_m,recorded_at").order("recorded_at",{ascending:false}).limit(700));
      all.push(state.client.from("hr_notices").select("id,title,content,published,created_at,created_by").order("created_at",{ascending:false}).limit(200));
      all.push(state.client.from("notice_reads").select("notice_id,employee_user_id,acknowledged_at").limit(1500));
      all.push(state.client.from("kpis").select("id,employee_id,period_month,target_amount,achieved_amount,notes").order("period_month",{ascending:false}).limit(500));
      all.push(state.client.from("assets").select("id,asset_tag,description,assigned_to,status,notes").limit(500));
      all.push(state.client.from("letter_register").select("id,employee_id,letter_type,document_no,issued_on,status,notes").limit(500));
      if(isHR())all.push(state.client.from("field_activity_reports")
        .select("id,employee_id,staff_group,activity_type,location_name,notes,latitude,longitude,accuracy_m,created_at")
        .order("created_at",{ascending:false}).limit(1500));
      if(isHR()){
       all.push(state.client.from("hr_payroll_entries").select("id,employee_id,period_month,basic_pay,allowance_pay,overtime_pay,other_earnings,employee_epf,income_tax,other_deductions,employer_epf,employer_etf,gross_pay,net_pay,status,notes,approved_at,paid_at,created_at").order("period_month",{ascending:false}).limit(1200));
       all.push(state.client.from("hr_leave_entitlements").select("id,employee_id,leave_year,leave_type,entitled_days,carried_days,notes").limit(2000));
       all.push(state.client.from("hr_letter_templates").select("id,template_name,designation_match,language,subject,body,status,version,updated_at").order("template_name").limit(300));
       all.push(state.client.from("hr_letter_drafts").select("id,template_id,employee_id,document_no,template_version,subject,rendered_body,status,created_at,issued_at").order("created_at",{ascending:false}).limit(600));
      }
      const result=await Promise.all(all);
      for(const r of result)if(r.error)throw r.error;
      [state.branches,state.employees,state.attendance,state.leaves]=result.slice(0,4).map(r=>r.data||[]);
      state.candidates=isHR()?result[4].data||[]:[];
      state.profiles=isHR()?result[5].data||[]:[];
      let at=isHR()?7:4;
      state.locations=isHR()?result[6].data||[]:[];
      state.notices=result[at++].data||[];
      state.reads=result[at++].data||[];
      state.kpis=result[at++].data||[];
      state.assets=result[at++].data||[];
      state.letters=result[at++].data||[];
      state.fieldReports=isHR()?result[at++].data||[]:[];
      state.payroll=isHR()?result[at++].data||[]:[];
      state.entitlements=isHR()?result[at++].data||[]:[];
      state.letterTemplates=isHR()?result[at++].data||[]:[];
      state.letterDrafts=isHR()?result[at++].data||[]:[];
      renderAll();
    } catch(err){console.error("Data access error",err);toast("Unable to load HR data: "+normalizeErr(err),true)}
    finally{state.loading=false}
  }
  function renderAll() {
    $("today-label").textContent=new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Colombo"});
    const today=localDate();
    $("m-employees").textContent=state.employees.filter(e=>e.status==="active").length;
    $("m-present").textContent=state.attendance.filter(a=>a.work_date===today&&!!a.check_in).length;
    $("m-leave").textContent=state.leaves.filter(l=>l.status==="pending").length;
    $("m-hiring").textContent=isHR()?state.candidates.filter(c=>!["Rejected","Hired"].includes(c.stage)).length:"—";
    $("welcome-summary").textContent=isHR()?"HR access active. Company-wide records are available for your authorised role.":"Employee access active. Your personal records and leave requests are available.";
    $("branch-list").innerHTML=state.branches.length?state.branches.map(b=>'<div><b>'+esc(b.name)+'</b><span>'+state.employees.filter(e=>e.branch_id===b.id).length+' employees</span></div>').join(""):"No branches set up";
    renderEmployees();renderAttendance();renderLeave();renderCandidates();renderAccounts();
    renderLocations();renderFieldReports();renderNotices();renderProfile();renderKpi();renderAssets();renderLetters();renderStaffAccounts();
    if(isHR()){renderPayroll();renderLeaveBalances();renderLetterTemplates();renderLetterDrafts();renderOperationsSummary()}
  }
  function switchView(view) {
    if(["employees","recruitment","locations","field-work","kpi","assets","letters","payroll"].includes(view)&&!isHR())return toast("HR access required.",true);
    if(["accounts","staff-import"].includes(view)&&!isAdmin())return toast("Administrator access required.",true);
    if(!$( "view-"+view))return;
    state.view=view;
    document.querySelectorAll(".view").forEach(el=>el.classList.toggle("hidden",el.id!=="view-"+view));
    document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
    const titles={dashboard:["MANAGEMENT CENTRE","Workforce overview","Live, permission-controlled people operations."],employees:["PEOPLE OPERATIONS","Employee directory","Manage the master record of PRIME team members."],attendance:["TIME & ATTENDANCE","Attendance tracker","Check in, check out and review times."],leave:["WORKFORCE PLANNING","Leave management","Apply, monitor and approve leave requests."],payroll:["FINANCE & HR","Monthly Payroll","Draft calculations with Admin approval and payment confirmation."],recruitment:["TALENT ACQUISITION","Recruitment pipeline","Manage applicants and interview stages."],locations:["GPS REPORT","Staff locations","Check-in/out GPS snapshots visible to HR/Admin only."],"field-work":["FIELD OPERATIONS","Sales & Plantation Work Reports","Customer visits, site inspections, field work and submission location."],notices:["COMPANY UPDATES","HR Notices","Read and acknowledge company circulars."],profile:["SELF SERVICE","My Profile","Your personal HR account."],kpi:["SALES PERFORMANCE","Sales KPI","Targets and monthly results."],assets:["COMPANY RESOURCES","Asset Register","Allocated equipment, vehicle and devices."],letters:["HR DOCUMENTATION","Letter Register","Draft and issued HR correspondence."],accounts:["ACCESS & SECURITY","Admin role permissions","Manage internal HR administrators."],"staff-import":["STAFF PROVISIONING","Staff Accounts & Excel Import","Employee Number login, secure Admin creation and bulk upload."],roadmap:["PRODUCT DEVELOPMENT","Upcoming modules","Planned functionality—not live yet."]};
    const t=titles[view];
    $("page-eyebrow").textContent=t[0];$("page-title").textContent=t[1];$("page-subtitle").textContent=t[2];$("crumb-label").textContent=t[1];
    document.querySelector(".sidebar").classList.remove("open");
  }
  function renderEmployees() {
    const q=$("employee-search").value.toLowerCase();
    const rows=state.employees.filter(e=>!q||[e.full_name,e.staff_code,e.designation,branchName(e.branch_id)].join(" ").toLowerCase().includes(q));
    $("employee-rows").innerHTML=rows.map(e=>'<tr><td><b>'+esc(e.staff_code)+'</b></td><td>'+esc(e.full_name)+'<div class="muted">'+esc(e.phone||"")+'</div></td><td>'+esc(e.designation)+'</td><td>'+esc(e.staff_group||'office')+'</td><td>'+esc(branchName(e.branch_id))+'</td><td>'+fmtStatus(e.status)+'</td><td><button class="btn tiny outline" data-edit-employee="'+esc(e.id)+'">Edit</button></td></tr>').join("")||empty(7,"No employee records found");
  }
  function formValue(form,name){return form.elements.namedItem(name)?.value||""}
  function setFormValue(form,name,value){const e=form.elements.namedItem(name);if(e)e.value=value??""}
  function fillBranchOptions() {
    ["employee-branch","candidate-branch"].forEach(id=>{
      $(id).innerHTML='<option value="">Select location</option>'+state.branches.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join("");
    });
  }
  function editEmployee(id) {
    if(!isHR())return;
    if(!id){if(isAdmin())openStaffAdd();else toast("Only Admin can create employee accounts.",true);return}
    fillBranchOptions();
    const e=state.employees.find(x=>x.id===id);
    const f=$("employee-form");f.reset();
    ["id","staff_code","full_name","phone","designation","department","staff_group","branch_id","joined_on","status"].forEach(k=>setFormValue(f,k,e?.[k]||(k==="status"?"active":k==="staff_group"?"office":"")));
    $("employee-modal-title").textContent=e?"Edit employee":"New employee";
    $("employee-dialog").showModal();
  }
  async function saveEmployee(event) {
    event.preventDefault();if(!isHR())return;
    const f=event.target,id=formValue(f,"id");
    if(!id)return toast("Create employee accounts through the Admin-only Staff Accounts panel.",true);
    const record={full_name:formValue(f,"full_name").trim(),phone:formValue(f,"phone").trim()||null,
      designation:formValue(f,"designation").trim(),department:formValue(f,"department").trim()||null,staff_group:formValue(f,"staff_group")||"office",
      branch_id:formValue(f,"branch_id"),joined_on:formValue(f,"joined_on")||null,status:formValue(f,"status")};
    const {error}=await state.client.from("employees").update(record).eq("id",id);
    if(error)return toast(normalizeErr(error),true);
    $("employee-dialog").close();toast("Employee details updated.");await fetchData();
  }
  function exportCSV() {
    if(!isHR())return;
    const fields=["staff_code","full_name","email","designation","department","staff_group","branch","joined_on","status"];
    const safe=value=>{
      let s=String(value??"");
      if(/^[\t\r=+\-@]/.test(s))s="'"+s;
      return '"'+s.replace(/"/g,'""')+'"';
    };
    const rows=[fields,...state.employees.map(e=>[e.staff_code,e.full_name,e.email,e.designation,e.department,e.staff_group||"office",branchName(e.branch_id),e.joined_on,e.status])];
    const csv="\ufeff"+rows.map(r=>r.map(safe).join(",")).join("\r\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="prime-employee-directory-"+localDate()+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);
  }
  function renderAttendance() {
    const today=localDate(),self=mine(),record=state.attendance.find(a=>a.employee_id===self?.id&&a.work_date===today);
    const txt=!self?"An employee profile has not been linked to this login. HR must link your email to a staff record.":record?"Checked in at "+timeText(record.check_in)+(record.check_out?" · Out "+timeText(record.check_out):" · Currently checked in"):"No check-in recorded today.";
    $("attendance-info").textContent=txt;
    $("attendance-state").textContent=!self?"NOT LINKED":record?(record.check_out?"COMPLETED":"CHECKED IN"):"NOT CHECKED IN";
    $("checkin").disabled=!self||!!record;
    $("checkout").disabled=!self||!record||!!record.check_out;
    const rows=filteredAttendance();
    $("attendance-rows").innerHTML=rows.map(a=>'<tr><td>'+esc(employeeName(a.employee_id))+'</td><td>'+esc(dateText(a.work_date))+'</td><td>'+esc(timeText(a.check_in))+'</td><td>'+esc(timeText(a.check_out))+'</td><td>'+esc(a.mode)+'</td></tr>').join("")||empty(5,"No attendance history available");
    $("attendance-summary").textContent=(isHR()?"Company-wide: ":"Your records: ")+state.attendance.filter(a=>a.work_date===today).length+" check-ins recorded for "+dateText(today)+".";
  }
  function getCurrentGPS(){
    return new Promise((resolve,reject)=>{
      if(!window.isSecureContext||!navigator.geolocation)
        return reject(new Error("Location requires HTTPS and a compatible phone browser."));
      navigator.geolocation.getCurrentPosition(
        pos=>{
          const {latitude,longitude,accuracy}=pos.coords;
          if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!Number.isFinite(accuracy))
            return reject(new Error("GPS coordinates unavailable. Try outdoors with GPS enabled."));
          if(accuracy>1000)return reject(new Error("GPS accuracy is too low ("+Math.round(accuracy)+" m). Enable Precise Location and try again."));
          resolve({latitude,longitude,accuracy});
        },
        error=>{
          const reason=error?.code===1?"Location denied. Enable location in phone Settings / browser site permissions.":
            error?.code===2?"GPS position unavailable. Turn on Location Services and try again.":
            "Location timed out. Try outside or move to an area with GPS coverage.";
          reject(new Error(reason));
        },
        {enableHighAccuracy:true,maximumAge:0,timeout:20000}
      );
    });
  }
  async function offerLocationOnboarding(){
    if(!state.user||!state.profile?.is_active||!mine())return;
    const key="prime_hr_location_intro_v1_"+state.user.id;
    if(localStorage.getItem(key))return;
    const dialog=$("location-dialog"); if(!dialog.open)dialog.showModal();
  }
  async function askLocationPermission(){
    const status=$("location-dialog-status");const btn=$("enable-location");btn.disabled=true;
    status.textContent="Asking phone for location permission…";
    try{
      const pos=await getCurrentGPS();
      localStorage.setItem("prime_hr_location_intro_v1_"+state.user.id,"allowed");
      $("gps-status").textContent="GPS enabled · accuracy about "+Math.round(pos.accuracy)+"m";
      status.textContent="Location enabled! GPS will be refreshed only when you mark attendance.";
      toast("Location allowed for attendance.");
      $("location-dialog").close();
    }catch(err){status.textContent=err.message;toast(err.message,true)}
    finally{btn.disabled=false}
  }
  async function markAttendance(action) {
    if(!mine())return toast("An approved active employee record must be linked first.",true);
    if(state.gpsBusy)return;
    state.gpsBusy=true;
    const cin=$("checkin"),cout=$("checkout");
    cin.disabled=true;cout.disabled=true;
    $("gps-status").textContent="📍 Requesting current GPS location…";
    try{
      const pos=await getCurrentGPS();
      $("gps-status").textContent="GPS accuracy ±"+Math.round(pos.accuracy)+" m · sending securely…";
      const {error}=await state.client.rpc("hr_mark_attendance",{
        p_action:action==="in"?"check_in":"check_out",
        p_lat:pos.latitude,p_lng:pos.longitude,p_accuracy:pos.accuracy,
        p_mode:$("attendance-mode").value
      });
      if(error)throw error;
      toast("Attendance "+(action==="in"?"Check In":"Check Out")+" saved with GPS location.");
      $("gps-status").textContent="✓ GPS attendance saved at "+timeText(new Date().toISOString());
      await fetchData();
    }catch(err){$("gps-status").textContent=normalizeErr(err);toast(normalizeErr(err),true)}
    finally{state.gpsBusy=false;renderAttendance()}
  }
  function renderLeave() {
    const rows=state.leaves;
    $("leave-rows").innerHTML=rows.map(l=>{
      const act=isHR()&&l.status==="pending"?'<div class="button-row"><button class="btn tiny" data-leave-action="approved" data-leave-id="'+esc(l.id)+'">Approve</button><button class="btn tiny danger" data-leave-action="rejected" data-leave-id="'+esc(l.id)+'">Reject</button></div>':"—";
      return '<tr><td>'+esc(employeeName(l.employee_id))+'</td><td>'+esc(l.kind)+'</td><td>'+esc(dateText(l.from_date))+' – '+esc(dateText(l.to_date))+'</td><td>'+fmtStatus(l.status)+'</td><td>'+esc(l.reason)+'</td><td>'+act+'</td></tr>';
    }).join("")||empty(6,"No leave requests found");
  }
  async function submitLeave(event) {
    event.preventDefault();const e=mine();if(!e)return toast("HR must link your account to an employee record.",true);
    const f=event.target, from=formValue(f,"from_date"),to=formValue(f,"to_date");
    if(to<from)return toast("Leave end date cannot be before start date.",true);
    const record={employee_id:e.id,kind:formValue(f,"kind"),from_date:from,to_date:to,reason:formValue(f,"reason").trim(),status:"pending"};
    const {error}=await state.client.from("leave_requests").insert(record);
    if(error)return toast(normalizeErr(error),true);
    f.reset();toast("Leave request submitted for HR review.");await fetchData();
  }
  async function decideLeave(id,status) {
    if(!isHR())return;
    if(!confirm("Set this leave request to "+status+"?"))return;
    const {error}=await state.client.from("leave_requests").update({status,decided_by:state.user.id,decided_at:new Date().toISOString()}).eq("id",id).eq("status","pending");
    if(error)return toast(normalizeErr(error),true);
    toast("Leave request "+status+".");await fetchData();
  }
  function renderCandidates() {
    $("candidate-rows").innerHTML=state.candidates.map(c=>'<tr><td><b>'+esc(c.full_name)+'</b><div class="muted">'+esc(c.email||"")+'</div></td><td>'+esc(c.position)+'</td><td>'+esc(branchName(c.branch_id))+'</td><td>'+fmtStatus(c.stage)+'</td><td>'+esc(c.notes||"—")+'</td><td><button class="btn tiny outline" data-edit-candidate="'+esc(c.id)+'">Edit</button></td></tr>').join("")||empty(6,"No candidate records yet");
  }
  function editCandidate(id) {
    if(!isHR())return;
    fillBranchOptions();
    const c=state.candidates.find(x=>x.id===id),f=$("candidate-form");f.reset();
    ["id","full_name","email","position","branch_id","stage","notes"].forEach(k=>setFormValue(f,k,c?.[k]||(k==="stage"?"Applied":"")));
    $("candidate-dialog").showModal();
  }
  async function saveCandidate(event) {
    event.preventDefault();if(!isHR())return;
    const f=event.target,id=formValue(f,"id");
    const record={full_name:formValue(f,"full_name").trim(),email:formValue(f,"email").trim()||null,position:formValue(f,"position").trim(),branch_id:formValue(f,"branch_id")||null,stage:formValue(f,"stage"),notes:formValue(f,"notes").trim()||null};
    const q=id?state.client.from("candidates").update(record).eq("id",id):state.client.from("candidates").insert(record);
    const {error}=await q;if(error)return toast(normalizeErr(error),true);
    $("candidate-dialog").close();toast("Candidate saved.");await fetchData();
  }
  function renderAccounts() {
    if(!isAdmin())return;
    $("account-rows").innerHTML=state.profiles.filter(p=>p.role!=="employee"||!String(p.email).endsWith("@employees.primehr.example.com")).map(p=>{
      const self=p.id===state.user.id;
      const roles=['employee','hr','admin'].map(r=>'<option value="'+r+'" '+(p.role===r?'selected':'')+'>'+r+'</option>').join("");
      const action=self?'Your account':'<button class="btn tiny '+(p.is_active?'danger':'primary')+'" data-account-id="'+esc(p.id)+'" data-account-active="'+(!p.is_active)+'">'+(p.is_active?'Disable':'Approve')+'</button>';
      return '<tr><td>'+esc(p.email)+'</td><td>'+esc(p.full_name)+'</td><td><select class="role-picker" data-role-id="'+esc(p.id)+'" '+(self?'disabled':'')+'>'+roles+'</select></td><td>'+fmtStatus(p.is_active?'active':'pending')+'</td><td>'+action+'</td></tr>';
    }).join("")||empty(5,"No accounts registered");
  }
  async function updateRole(id,role) {
    if(!isAdmin()||id===state.user.id)return;
    if(!confirm("Change this user's access role to "+role+"?")){renderAccounts();return}
    const {error}=await state.client.from("profiles").update({role}).eq("id",id);
    if(error)return toast(normalizeErr(error),true);toast("Role changed.");await fetchData();
  }
  async function setApproval(id,active) {
    if(!isAdmin()||id===state.user.id)return;
    if(!confirm((active?"Approve":"Disable")+" this account?"))return;
    const {error}=await state.client.from("profiles").update({is_active:active}).eq("id",id);
    if(error)return toast(normalizeErr(error),true);toast("Account updated.");await fetchData();
  }

  // Live HR location register: server-verified attendance timestamp + client GPS coordinates.
  function filteredLocations(){
    const day=$("gps-filter")?.value;
    return state.locations.filter(l=>!day||String(l.recorded_at).slice(0,10)===day);
  }
  function renderLocations(){
    if(!isHR())return;
    const records=filteredLocations();
    $("location-rows").innerHTML=records.map(l=>{
      const e=state.employees.find(x=>x.id===l.employee_id);
      const name=esc(e?.full_name||"Unknown");
      const code=esc(e?.staff_code||"—");
      const link="https://www.google.com/maps?q="+encodeURIComponent(l.latitude+","+l.longitude);
      return '<tr><td><b>'+name+'</b><div class="muted">'+code+'</div></td><td>'+esc(l.event_type==="check_in"?"Check In":"Check Out")+'</td><td>'+esc(dateText(l.recorded_at))+' '+esc(timeText(l.recorded_at))+'</td><td>±'+esc(Math.round(l.accuracy_m))+' m</td><td><a class="map-link" href="'+link+'" target="_blank" rel="noopener noreferrer">📍 Open Maps</a></td></tr>';
    }).join("")||empty(5,"No GPS attendance records for this date");
  }

  // Read-only HR view of discrete, employee-submitted Sales / Plantation work reports.
  const groupName=group=>({sales:"Sales",plantation:"Plantation",office:"Office"}[group]||group);
  const fieldTypeName=type=>String(type||"").replaceAll("_"," ").replace(/\b\w/g,m=>m.toUpperCase());
  function filteredFieldReports(){
    if(!isHR())return [];
    const team=$("field-team-filter").value,selectedDay=$("field-date-filter").value;
    return state.fieldReports.filter(x=>(!team||x.staff_group===team)&&
      (!selectedDay||new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"})
        .format(new Date(x.created_at))===selectedDay));
  }
  function renderFieldReports(){
    if(!isHR())return;
    $("field-report-rows").innerHTML=filteredFieldReports().map(x=>{
      const emp=state.employees.find(e=>e.id===x.employee_id);
      const point=Number(x.latitude)+","+Number(x.longitude);
      const link="https://www.google.com/maps?q="+encodeURIComponent(point);
      return '<tr><td>'+esc(dateText(x.created_at))+' '+esc(timeText(x.created_at))+'</td>'+
        '<td><b>'+esc(emp?.full_name||"Unknown")+'</b><div class="muted">'+esc(emp?.staff_code||"")+'</div></td>'+
        '<td>'+esc(groupName(x.staff_group))+'</td><td>'+esc(fieldTypeName(x.activity_type))+'</td>'+
        '<td>'+esc(x.location_name)+'</td><td>'+esc(x.notes||"—")+'</td>'+
        '<td><a class="map-link" target="_blank" rel="noopener noreferrer" href="'+link+'">Map</a> <span class="muted">±'+esc(Math.round(x.accuracy_m))+' m</span></td></tr>';
    }).join("")||empty(7,"No work reports for these filters.");
  }
  function exportFieldReports(){
    if(!isHR())return;
    const records=filteredFieldReports().map(x=>{
      const emp=state.employees.find(e=>e.id===x.employee_id);
      return {
        date_time:x.created_at,employee_no:emp?.staff_code||"",employee_name:emp?.full_name||"",
        team:x.staff_group,activity_type:x.activity_type,client_or_site:x.location_name,
        notes:x.notes||"",latitude:x.latitude,longitude:x.longitude,accuracy_m:x.accuracy_m
      };
    });
    staffCSV(records,["date_time","employee_no","employee_name","team","activity_type","client_or_site","notes","latitude","longitude","accuracy_m"],"PRIME_Field_Work_"+localDate()+".csv");
  }

  function exportLocations(){
    if(!isHR())return;
    const header=["staff_code","employee","event","timestamp","latitude","longitude","accuracy_m"];
    const csvSafe=(v)=>{
      let text=String(v??"");if(/^[\s]*[=+\-@\t\r]/.test(text))text="'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    };
    const data=[header,...filteredLocations().map(l=>{
      const e=state.employees.find(x=>x.id===l.employee_id);
      return [e?.staff_code,e?.full_name,l.event_type,l.recorded_at,l.latitude,l.longitude,l.accuracy_m];
    })];
    const blob=new Blob(["\ufeff"+data.map(row=>row.map(csvSafe).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="PRIME_Attendance_GPS_"+localDate()+".csv";
    a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function renderNotices(){
    const notices=state.notices.filter(n=>isHR()||n.published);
    $("notice-items").innerHTML=notices.map(n=>{
      const ack=state.reads.some(r=>r.notice_id===n.id&&r.employee_user_id===state.user?.id);
      const button=ack?'<span class="pill approved">✓ Acknowledged</span>':'<button class="btn tiny outline" data-ack="'+esc(n.id)+'">Acknowledge</button>';
      return '<article class="notice"><h3>'+esc(n.title)+'</h3><p>'+esc(n.content)+'</p><div class="meta">'+esc(dateText(n.created_at))+' · '+(n.published?"Published":"Draft")+'</div><div class="notice-actions">'+button+'</div></article>';
    }).join("")||'<p class="muted">No HR notices yet.</p>';
  }
  async function acknowledge(id){
    const notice=state.notices.find(n=>n.id===id);
    if(!notice?.published)return toast("Notice not yet published.",true);
    const {error}=await state.client.from("notice_reads").insert({notice_id:id,employee_user_id:state.user.id});
    if(error)return toast(normalizeErr(error),true);
    toast("Notice acknowledged.");await fetchData();
  }
  function renderProfile(){
    const e=mine();
    const items=[["Name",state.profile?.full_name],["Email",state.profile?.email],
     ["Staff code",e?.staff_code||"Not linked"],["Designation",e?.designation||"—"],
     ["Branch",e?branchName(e.branch_id):"—"],["Joined",e?.joined_on?dateText(e.joined_on):"—"],
     ["Account role",state.profile?.role||"—"]];
    $("profile-details").innerHTML=items.map(([key,val])=>'<div class="profile-field"><span>'+esc(key)+'</span><strong>'+esc(val||"—")+'</strong></div>').join("");
  }
  const money=n=>"Rs. "+Number(n||0).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:2});
  function renderKpi(){
    if(!isHR())return;
    $("kpi-rows").innerHTML=state.kpis.map(k=>{
      const pct=Number(k.target_amount)>0?Math.round(100*Number(k.achieved_amount)/Number(k.target_amount)):0;
      return '<tr><td>'+esc(employeeName(k.employee_id))+'</td><td>'+esc(dateText(k.period_month))+'</td><td class="stat-money">'+esc(money(k.target_amount))+'</td><td class="stat-money">'+esc(money(k.achieved_amount))+'</td><td>'+pct+'%</td></tr>';
    }).join("")||empty(5,"No KPI records yet");
  }
  function renderAssets(){
    if(!isHR())return;
    $("asset-rows").innerHTML=state.assets.map(a=>'<tr><td>'+esc(a.asset_tag)+'</td><td>'+esc(a.description)+'</td><td>'+esc(a.assigned_to?employeeName(a.assigned_to):"Unassigned")+'</td><td>'+fmtStatus(a.status)+'</td><td><button class="btn tiny outline" data-asset-edit="'+esc(a.id)+'">Edit / Reassign</button></td></tr>').join("")||empty(5,"No assets in register");
  }
  function editAsset(id){
    if(!isHR())return;
    const a=state.assets.find(x=>x.id===id);if(!a)return;
    showQuick("asset");state.editAssetId=id;
    const f=$("quick-form");
    setFormValue(f,"asset_tag",a.asset_tag);
    setFormValue(f,"description",a.description);
    setFormValue(f,"assigned_to",a.assigned_to||"none");
    setFormValue(f,"status",a.status);
    setFormValue(f,"notes",a.notes||"");
    $("quick-title").textContent="Edit / Reassign Asset";
  }
  function renderLetters(){
    if(!isHR())return;
    $("letter-rows").innerHTML=state.letters.map(l=>'<tr><td>'+esc(l.document_no)+'</td><td>'+esc(employeeName(l.employee_id))+'</td><td>'+esc(l.letter_type)+'</td><td>'+esc(l.issued_on?dateText(l.issued_on):"—")+'</td><td>'+fmtStatus(l.status)+'</td></tr>').join("")||empty(5,"No HR letters recorded");
  }
  function showQuick(type){
    if(!isHR())return;
    const employeeOpts='<option value="">Select staff member</option>'+state.employees.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.staff_code+" – "+e.full_name)+'</option>').join("");
    const input=(label,name,type="text",required=true)=>'<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" '+(required?'required':'')+' maxlength="300"></label>';
    const select=(label,name,opts)=>'<label>'+esc(label)+'<select name="'+name+'" required>'+opts+'</select></label>';
    const fieldSets={
      notice:['Publish HR Notice',input("Title","title")+'<label>Notice content<textarea name="content" rows="6" required maxlength="8000"></textarea></label>'],
      kpi:['Sales KPI Record',select("Employee","employee_id",employeeOpts)+input("Period (1st of month)","period_month","date")+input("Target amount (LKR)","target_amount","number")+input("Achieved amount (LKR)","achieved_amount","number")],
      asset:['Asset Record',input("Asset tag","asset_tag")+input("Description","description")+select("Assigned employee","assigned_to",'<option value="none">Unassigned</option>'+state.employees.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.full_name)+'</option>').join(""))+select("Status","status",["available","assigned","repair","returned"].map(x=>'<option>'+x+'</option>').join(""))+'<label>Notes<textarea name="notes" rows="3" maxlength="1000"></textarea></label>'],
      letter:['HR Letter Register',select("Employee","employee_id",employeeOpts)+input("Document number","document_no")+input("Letter type","letter_type")+input("Issue date (optional)","issued_on","date",false)+select("Status","status",["draft","approved","issued","void"].map(x=>'<option>'+x+'</option>').join(""))]
    };
    state.quickType=type;
    state.editAssetId=null;
    $("quick-title").textContent=fieldSets[type][0];
    $("quick-fields").innerHTML=fieldSets[type][1];
    $("quick-form").reset();
    $("quick-dialog").showModal();
  }
  async function saveQuick(event){
    event.preventDefault();if(!isHR())return;
    const f=new FormData(event.target),type=state.quickType;
    let table,record;
    if(type==="notice"){
      table="hr_notices";record={title:String(f.get("title")).trim(),content:String(f.get("content")).trim(),published:true,created_by:state.user.id};
    }else if(type==="kpi"){
      table="kpis";const d=String(f.get("period_month"));record={employee_id:String(f.get("employee_id")),period_month:d.slice(0,7)+"-01",target_amount:Number(f.get("target_amount")),achieved_amount:Number(f.get("achieved_amount"))};
      if(record.target_amount<0||record.achieved_amount<0)return toast("Amounts cannot be negative.",true);
    }else if(type==="asset"){
      table="assets";record={asset_tag:String(f.get("asset_tag")).trim(),description:String(f.get("description")).trim(),assigned_to:f.get("assigned_to")==="none"?null:f.get("assigned_to"),status:String(f.get("status")),notes:String(f.get("notes")||"").trim()||null};
      if(record.status==="assigned"&&!record.assigned_to)return toast("Choose a staff member for an Assigned asset.",true);
      if(record.status==="available"&&record.assigned_to)return toast("Unassign the employee when an asset is Available.",true);
    }else if(type==="letter"){
      table="letter_register";record={employee_id:String(f.get("employee_id")),document_no:String(f.get("document_no")).trim(),letter_type:String(f.get("letter_type")).trim(),issued_on:String(f.get("issued_on"))||null,status:String(f.get("status"))};
    }else return;
    const request=type==="kpi"
      ?state.client.from(table).upsert(record,{onConflict:"employee_id,period_month"})
      :type==="asset"&&state.editAssetId
        ?state.client.from(table).update(record).eq("id",state.editAssetId)
        :state.client.from(table).insert(record);
    const {error}=await request;
    if(error)return toast(normalizeErr(error),true);
    state.editAssetId=null;
    $("quick-dialog").close();toast("Record saved securely.");await fetchData();
  }


  // Admin-only staff import and account provisioning.
  const staffColumns=[
    "staff_code","full_name","phone","designation","department","staff_group","branch","joined_on",
    "status","national_id","address","date_of_birth","emergency_contact","employment_type",
    "bank_name","bank_branch","bank_account","epf_no","etf_no","basic_salary","vehicle_allowance"
  ];
  function columnName(value){
    const x=String(value??"").toLowerCase().replace(/[^a-z0-9]/g,"");
    const aliases={
      staffcode:"staff_code",staffno:"staff_code",staffnumber:"staff_code",
      employeeno:"staff_code",employeenumber:"staff_code",employeeid:"staff_code",empno:"staff_code",empid:"staff_code",
      fullname:"full_name",employeename:"full_name",name:"full_name",
      phone:"phone",phoneno:"phone",telephone:"phone",contact:"phone",
      mobile:"phone",mobileno:"phone",mobilenumber:"phone",contactno:"phone",contactnumber:"phone",whatsapp:"phone",
      designation:"designation",position:"designation",jobtitle:"designation",jobrole:"designation",
      department:"department",dept:"department",staffgroup:"staff_group",staffteam:"staff_group",team:"staff_group",teamtype:"staff_group",group:"staff_group",
      branch:"branch",branchname:"branch",office:"branch",zone:"branch",zonal:"branch",
      joiningdate:"joined_on",joinedon:"joined_on",dateofjoining:"joined_on",startdate:"joined_on",appointeddate:"joined_on",
      status:"status",employmentstatus:"status",
      nic:"national_id",nationalid:"national_id",nationalidentitycard:"national_id",idno:"national_id",
      address:"address",permanentaddress:"address",
      dateofbirth:"date_of_birth",dob:"date_of_birth",
      emergencycontact:"emergency_contact",emergencyphoneno:"emergency_contact",
      employmenttype:"employment_type",contracttype:"employment_type",
      bank:"bank_name",bankname:"bank_name",bankbranch:"bank_branch",
      bankaccount:"bank_account",bankaccountnumber:"bank_account",accountnumber:"bank_account",
      epf:"epf_no",epfno:"epf_no",etf:"etf_no",etfno:"etf_no",
      basicsalary:"basic_salary",salary:"basic_salary",basic:"basic_salary",
      vehicleallowance:"vehicle_allowance",vehicle:"vehicle_allowance"
    };
    return aliases[x]||null;
  }
  function excelDate(value){
    const t=String(value??"").trim();
    if(!t)return "";
    if(/^\d{4}-\d{2}-\d{2}$/.test(t))return t;
    const match=t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if(match){
      const first=Number(match[1]),second=Number(match[2]),year=Number(match[3]);
      const day=first>12?first:second>12?second:first;
      const month=first>12?second:second>12?first:second;
      return String(year)+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
    }
    if(/^\d{5}$/.test(t)&&window.XLSX?.SSF?.parse_date_code){
      const d=XLSX.SSF.parse_date_code(Number(t));
      if(d)return String(d.y)+"-"+String(d.m).padStart(2,"0")+"-"+String(d.d).padStart(2,"0");
    }
    return t;
  }
  function normalizeImportRow(raw){
    const mapped={};
    Object.entries(raw||{}).forEach(([header,val])=>{
      const key=columnName(header);
      if(key&&mapped[key]===undefined)mapped[key]=String(val??"").trim();
    });
    mapped.staff_code=String(mapped.staff_code||"").toUpperCase().trim();
    if(mapped.joined_on)mapped.joined_on=excelDate(mapped.joined_on);
    if(mapped.date_of_birth)mapped.date_of_birth=excelDate(mapped.date_of_birth);
    mapped.status=mapped.status?String(mapped.status).toLowerCase():"";
    mapped.staff_group=String(mapped.staff_group||"").toLowerCase().trim();
    return mapped;
  }
  function renderStaffPreview(){
    const rows=state.staffUploadRows;
    $("staff-file-status").textContent=rows.length+" employee row(s) prepared for Admin import.";
    $("staff-import-btn").disabled=!rows.length||state.staffImportProgress;
    const display=rows.slice(0,25);
    $("staff-preview").innerHTML=rows.length?'<table><thead><tr><th>Employee No.</th><th>Full Name</th><th>Phone</th><th>Designation</th><th>Team</th><th>Branch</th></tr></thead><tbody>'+
      display.map(r=>'<tr><td>'+esc(r.staff_code)+'</td><td>'+esc(r.full_name)+'</td><td>'+esc(r.phone||"—")+'</td><td>'+esc(r.designation)+'</td><td>'+esc(r.staff_group||'office')+'</td><td>'+esc(r.branch)+'</td></tr>').join("")+
      '</tbody></table><p class="fineprint">'+(rows.length>25?"First 25 rows previewed. All "+rows.length+" will be submitted.":"Review the rows before you create accounts.")+'</p>':"";
  }
  async function readStaffFile(event){
    if(!isAdmin())return;
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>7*1024*1024)return toast("Excel file exceeds 7MB.",true);
    if(!window.XLSX){toast("Excel reader failed to load. Check internet connection.",true);return}
    try{
      const buffer=await file.arrayBuffer(),wb=XLSX.read(new Uint8Array(buffer),{type:"array",cellText:true,cellDates:false});
      const sheet=wb.Sheets[wb.SheetNames.find(n=>n.toLowerCase()==="employees")||wb.SheetNames[0]];
      if(!sheet)throw Error("No worksheet found");
      const records=XLSX.utils.sheet_to_json(sheet,{raw:false,defval:"",blankrows:false});
      const rows=records.map(normalizeImportRow).filter(r=>r.staff_code||r.full_name);
      if(!rows.length)throw Error("No employee records found; header row must be the first row.");
      if(rows.length>1000)throw Error("Import maximum is 1,000 staff per file.");
      const missing=rows.findIndex(r=>!r.staff_code||!r.full_name||!r.designation||!r.branch);
      if(missing>=0)throw Error("Row "+(missing+2)+" missing Employee Number, Name, Designation or Branch.");
      const badTeam=rows.findIndex(r=>r.staff_group&&!["office","sales","plantation"].includes(r.staff_group));
      if(badTeam>=0)throw Error("Row "+(badTeam+2)+" has an invalid Team. Choose office, sales or plantation.");
      const codes=new Set(rows.map(r=>r.staff_code));
      if(codes.size!==rows.length)throw Error("Duplicate employee numbers found in Excel.");
      state.staffUploadRows=rows;renderStaffPreview();
      $("staff-import-status").textContent="Ready: "+rows.length+" employee records. Existing employee numbers update their details; passwords are not reset on re-import.";
    }catch(err){state.staffUploadRows=[];renderStaffPreview();toast("Excel error: "+normalizeErr(err),true)}
  }
  function staffCSV(records,keys,filename){
    const csvEscape=v=>{
      let text=String(v??"");
      if(/^\s*[=+\-@\t\r]/.test(text))text="'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    };
    const blob=new Blob(["\ufeff"+[keys,...records.map(x=>keys.map(k=>x[k]??""))].map(x=>x.map(csvEscape).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
    const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=filename;link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }

  function exportCompleteStaffMaster(){
    if(!isAdmin())return toast("Administrator access required.",true);
    if(!confirm("Export the complete staff master including NIC, salary and bank details? Store this sensitive file securely."))return;
    const fields=["staff_code","full_name","phone","designation","department","staff_group","branch","joined_on","status",
      "national_id","address","date_of_birth","emergency_contact","employment_type",
      "bank_name","bank_branch","bank_account","epf_no","etf_no","basic_salary","vehicle_allowance"];
    const records=state.employees.map(e=>({
      ...e,staff_group:e.staff_group||"office",branch:branchName(e.branch_id)
    }));
    staffCSV(records,fields,"PRIME_Full_Staff_Master_"+localDate()+".csv");
    toast("Complete staff master exported. Protect the downloaded file.");
  }
  function downloadStaffTemplate(){
    if(window.XLSX){
      const wb=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([staffColumns]);
      XLSX.utils.book_append_sheet(wb,sheet,"Employees");
      const info=XLSX.utils.aoa_to_sheet([
        ["PRIME HR — Employee Bulk Import"],
        ["Mandatory fields: staff_code,full_name,designation,branch."],["staff_group (Team): office / sales / plantation. Default office for new staff."],
        ["Employee Number is the login ID. Email is NOT required."],
        ["Phone,NIC and Bank Account columns should be formatted as TEXT to keep leading zeros."],
        ["Dates must use YYYY-MM-DD. The Admin imports accounts, staff cannot self-register."],
        ["After import, save one-time generated temporary passwords securely. Never share a group password list."]
      ]);
      XLSX.utils.book_append_sheet(wb,info,"Instructions");
      XLSX.writeFile(wb,"PRIME_HR_Employee_Bulk_Import_Template.xlsx");
    }else staffCSV([],staffColumns,"PRIME_HR_Employee_Import_Template.csv");
  }
  async function staffCall(body){
    if(!isAdmin())throw Error("Admin only");
    const {data,error}=await state.client.functions.invoke("prime-staff-admin",{body});
    if(error){
      let reason=error.message;
      try{const j=await error.context?.json();if(j?.error)reason=j.error}catch{}
      throw Error(reason);
    }
    if(data?.error)throw Error(data.error);
    return data;
  }
  // Passwords cannot be retrieved from Supabase Auth: only the last credentials
  // generated/reset by this Admin session are available, in volatile memory.
  function lastGeneratedPassword(staffCode){
    return [...state.staffCredentials].reverse().find(c=>c.staff_code===staffCode&&c.password)?.password||"";
  }
  function showStaffPassword(staffCode){
    if(!isAdmin())return;
    const emp=state.employees.find(e=>e.staff_code===staffCode);
    const password=lastGeneratedPassword(staffCode);
    if(!password){
      toast("Earlier passwords are securely hashed and cannot be retrieved. Click Reset Password to issue a new one.",true);
      return;
    }
    $("staff-password-employee").textContent=(emp?.full_name||staffCode)+" · "+staffCode;
    $("staff-password-value").value=password;
    $("staff-password-value").type="password";
    $("staff-password-show").textContent="Show Password";
    $("staff-password-dialog").showModal();
  }
  function renderCredentialResults(){
    $("staff-import-results").innerHTML=state.staffCredentials.map(c=>
      '<tr><td><b>'+esc(c.staff_code||"—")+'</b></td><td>'+esc(c.full_name||"")+'</td><td>'+esc(c.result)+'</td><td>'+
      (c.password?'<button type="button" class="btn tiny outline" data-staff-show="'+esc(c.staff_code)+'">View / Copy</button>':esc(c.message||"—"))+'</td></tr>').join("")||empty(4,"No new employee logins created during this session.");
    $("staff-credentials-download").disabled=!state.staffCredentials.some(c=>c.password);
  }
  async function processStaffRecords(rows){
    if(!isAdmin()||state.staffImportProgress)return;
    if(!rows?.length)return toast("No staff data selected.",true);
    if(!confirm("Create / update "+rows.length+" staff accounts? New employees receive temporary passwords. Existing employee accounts will keep their passwords."))return;
    state.staffImportProgress=true;$("staff-import-btn").disabled=true;
    try{
      for(let i=0;i<rows.length;i+=25){
        $("staff-import-status").textContent="Uploading employees "+(i+1)+"–"+Math.min(i+25,rows.length)+" of "+rows.length+"…";
        const result=await staffCall({action:"provision",rows:rows.slice(i,i+25)});
        const list=result.results||[];
        state.staffCredentials.push(...list);
        renderCredentialResults();
      }
      const errors=state.staffCredentials.filter(r=>r.result==="error").length;
      $("staff-import-status").textContent="Import complete. "+rows.length+" processed. Current session recorded "+errors+" error(s). Review the credentials table and export the new passwords only once.";
      toast("Staff accounts processed: "+rows.length+".");
      state.staffUploadRows=[];$("staff-file").value="";
      await fetchData();
    }catch(err){$("staff-import-status").textContent="Import interrupted: "+normalizeErr(err)+". Previously created accounts remain in the database.";toast(normalizeErr(err),true)}
    finally{state.staffImportProgress=false;renderStaffPreview()}
  }
  function openStaffAdd(){
    if(!isAdmin())return;
    $("staff-add-branch").innerHTML='<option value="">Choose Branch</option>'+state.branches.map(b=>'<option value="'+esc(b.name)+'">'+esc(b.name)+'</option>').join("");
    $("staff-add-form").reset();$("staff-add-dialog").showModal();
  }
  async function staffAdd(event){
    event.preventDefault();if(!isAdmin())return;
    const form=new FormData(event.target),row=Object.fromEntries(form.entries());
    $("staff-add-dialog").close();
    await processStaffRecords([{...row,status:"active"}]);
  }
  function renderStaffAccounts(){
    if(!isAdmin())return;
    const q=($("staff-account-search")?.value||"").toLowerCase();
    const rows=state.employees.filter(e=>!q||[e.staff_code,e.full_name,e.phone].join(" ").toLowerCase().includes(q));
    $("staff-account-rows").innerHTML=rows.map(e=>{
      const p=state.profiles.find(p=>p.id===e.auth_user_id);
      const active=!!p?.is_active;
      const status=!e.auth_user_id?"No login":active?(p?.must_change_password?"Temp password":"Active"):"Disabled";
      return '<tr><td><b>'+esc(e.staff_code)+'</b></td><td>'+esc(e.full_name)+'</td><td>'+esc(e.phone||"—")+'</td><td>'+esc(status)+'</td><td>'+
       (e.auth_user_id?(lastGeneratedPassword(e.staff_code)?'<button class="btn tiny outline" data-staff-show="'+esc(e.staff_code)+'">View Password</button> ':'')+'<button class="btn tiny outline" data-staff-reset="'+esc(e.id)+'">Reset Password</button> <button class="btn tiny '+(active?'danger':'primary')+'" data-staff-toggle="'+esc(e.id)+'" data-staff-enable="'+(!active)+'">'+(active?"Disable":"Enable")+'</button>':
        '<button class="btn tiny primary" data-staff-repair="'+esc(e.id)+'">Create Login</button>')+'</td></tr>';
    }).join("")||empty(5,"No employee accounts found.");
  }
  async function staffManage(action,id,enabled){
    if(!isAdmin())return;
    const emp=state.employees.find(e=>e.id===id);if(!emp)return;
    if(action==="reset_password"){
      if(!confirm("Reset password for "+emp.staff_code+"? Their current password will stop working immediately."))return;
      try{
        const r=await staffCall({action:"reset_password",employee_id:id});
        state.staffCredentials.push({staff_code:emp.staff_code,full_name:emp.full_name,result:"password reset",password:r.password});
        renderCredentialResults();toast("New password generated. View and share privately.");await fetchData();showStaffPassword(emp.staff_code);
      }catch(err){toast(normalizeErr(err),true)}
    }
    if(action==="set_access"){
      if(!confirm((enabled?"Enable":"Disable")+" login for "+emp.staff_code+"?"))return;
      try{await staffCall({action:"set_access",employee_id:id,enabled});toast("Login access updated.");await fetchData()}
      catch(err){toast(normalizeErr(err),true)}
    }
    if(action==="repair"){
      if(!confirm("Create login for existing employee "+emp.staff_code+"?"))return;
      await processStaffRecords([{
        staff_code:emp.staff_code,full_name:emp.full_name,phone:emp.phone||"",designation:emp.designation,
        department:emp.department||"",branch:branchName(emp.branch_id),joined_on:emp.joined_on||"",status:emp.status
      }]);
    }
  }


  // All finance and HR workflows are guarded again in Supabase Row Level Security.
  function optionsForEmployees(current=""){
    return '<option value="">Select employee</option>'+state.employees.map(e=>'<option value="'+esc(e.id)+'" '+(e.id===current?'selected':'')+'>'+esc(e.staff_code+" · "+e.full_name)+'</option>').join("");
  }
  function ensureEmployeeDropdown(id){
    const el=$(id),value=el.value;
    const keys=state.employees.map(e=>e.id).join(",");
    if(el.dataset.staffList!==keys){
      el.innerHTML=optionsForEmployees(value);
      el.dataset.staffList=keys;
    }
  }
  const payrollKeys=["basic_pay","allowance_pay","overtime_pay","other_earnings","employee_epf","income_tax","other_deductions","employer_epf","employer_etf"];
  function payrollFormTotals(){
    const f=$("payroll-form");
    const num=n=>Number(formValue(f,n)||0);
    const gross=num("basic_pay")+num("allowance_pay")+num("overtime_pay")+num("other_earnings");
    const net=gross-num("employee_epf")-num("income_tax")-num("other_deductions");
    $("payroll-live-summary").textContent="Gross: "+money(gross)+" · Net: "+money(net)+" · Employer EPF/ETF costs: "+money(num("employer_epf")+num("employer_etf"));
  }
  function fillPayrollFromMaster(){
    const f=$("payroll-form");
    const e=state.employees.find(x=>x.id===formValue(f,"employee_id"));
    if(!e)return;
    const month=formValue(f,"period");
    const existing=state.payroll.find(x=>x.employee_id===e.id&&x.period_month.slice(0,7)===month);
    if(existing){
      for(const key of payrollKeys)setFormValue(f,key,Number(existing[key]));
      setFormValue(f,"notes",existing.notes||"");
      $("payroll-form").querySelector('button[type="submit"]').disabled=existing.status!=="draft";
      $("payroll-form").querySelector('button[type="submit"]').textContent=existing.status==="draft"?"Update Draft Payroll":"Payroll Locked — "+existing.status;
    }else{
      f.querySelector('button[type="submit"]').disabled=false;
      f.querySelector('button[type="submit"]').textContent="Save / Update Draft Payroll";
      payrollKeys.forEach(k=>setFormValue(f,k,k==="basic_pay"?Number(e.basic_salary||0):k==="allowance_pay"?Number(e.vehicle_allowance||0):0));
      setFormValue(f,"notes","");
    }
    payrollFormTotals();
  }
  function filteredPayroll(){
    const m=$("payroll-period-filter").value,status=$("payroll-status-filter").value;
    return state.payroll.filter(x=>(!m||x.period_month.startsWith(m))&&(!status||x.status===status));
  }
  function renderPayroll(){
    if(!isHR())return;
    ensureEmployeeDropdown("payroll-employee");
    if(!$("payroll-month").value)$("payroll-month").value=localDate().slice(0,7);
    const rows=filteredPayroll();
    const gross=rows.reduce((n,x)=>n+Number(x.gross_pay),0);
    const net=rows.reduce((n,x)=>n+Number(x.net_pay),0);
    $("payroll-totals").textContent="Records: "+rows.length+" · Gross: "+money(gross)+" · Net: "+money(net)+" · Approval is required before marking paid.";
    $("payroll-rows").innerHTML=rows.map(x=>{
      let actions='<button class="btn tiny outline" data-payroll-print="'+esc(x.id)+'">Payslip Preview</button>';
      if(isAdmin()&&x.status==="draft")actions+=' <button class="btn tiny" data-payroll-action="approved" data-payroll-id="'+esc(x.id)+'">Approve</button>';
      if(isAdmin()&&x.status==="approved")actions+=' <button class="btn tiny primary" data-payroll-action="paid" data-payroll-id="'+esc(x.id)+'">Mark Paid</button>';
      return '<tr><td>'+esc(employeeName(x.employee_id))+'</td><td>'+esc(x.period_month.slice(0,7))+'</td><td>'+esc(money(x.gross_pay))+'</td><td>'+esc(money(x.net_pay))+'</td><td>'+fmtStatus(x.status)+'</td><td>'+actions+'</td></tr>';
    }).join("")||empty(6,"No payroll records found.");
    payrollFormTotals();
  }
  async function savePayroll(ev){
    ev.preventDefault();if(!isHR())return;
    const f=ev.target,employee_id=formValue(f,"employee_id"),month=formValue(f,"period");
    if(!employee_id||!/^\d{4}-\d{2}$/.test(month))return toast("Choose an employee and valid month.",true);
    const values={};
    for(const key of payrollKeys){
      const raw=formValue(f,key);
      if(raw===""||!Number.isFinite(Number(raw))||Number(raw)<0)return toast("Check non-negative amount: "+key,true);
      values[key]=Math.round(Number(raw)*100)/100;
    }
    const gross=values.basic_pay+values.allowance_pay+values.overtime_pay+values.other_earnings;
    const deductions=values.employee_epf+values.income_tax+values.other_deductions;
    if(deductions>gross)return toast("Deductions cannot exceed gross earnings.",true);
    const record={...values,employee_id,period_month:month+"-01",notes:formValue(f,"notes").trim()||null};
    const prev=state.payroll.find(x=>x.employee_id===employee_id&&x.period_month===record.period_month);
    if(prev&&prev.status!=="draft")return toast("Approved payroll is locked.",true);
    const q=prev?state.client.from("hr_payroll_entries").update(record).eq("id",prev.id).eq("status","draft"):
      state.client.from("hr_payroll_entries").insert({...record,status:"draft",created_by:state.user.id});
    const {error}=await q;
    if(error)return toast(normalizeErr(error),true);
    toast("Payroll draft saved. Admin approval required.");await fetchData();
  }
  async function decidePayroll(id,newStatus){
    if(!isAdmin())return;
    const x=state.payroll.find(p=>p.id===id);
    if(!x||!((x.status==="draft"&&newStatus==="approved")||(x.status==="approved"&&newStatus==="paid")))return;
    if(!confirm((newStatus==="paid"?"Confirm payment was completed externally":"Approve manually verified payroll")+
     " for "+employeeName(x.employee_id)+" "+x.period_month+"?"))return;
    const {error,data}=await state.client.from("hr_payroll_entries").update({status:newStatus})
     .eq("id",x.id).eq("status",x.status).select("id");
    if(error||!data?.length)return toast(error?normalizeErr(error):"Record changed — refresh.",true);
    toast("Payroll marked "+newStatus+".");await fetchData();
  }
  function printPayroll(id){
    if(!isHR())return;
    const x=state.payroll.find(p=>p.id===id);
    if(!x)return;
    const employee=state.employees.find(e=>e.id===x.employee_id);
    const lines=[
      ["Basic Salary",x.basic_pay],["Allowances",x.allowance_pay],["Overtime",x.overtime_pay],
      ["Other Earnings",x.other_earnings],["Gross Pay",x.gross_pay],
      ["Employee EPF",x.employee_epf],["APIT / Income Tax",x.income_tax],
      ["Other Deductions",x.other_deductions],["Net Pay",x.net_pay],
      ["Employer EPF (company cost)",x.employer_epf],["Employer ETF (company cost)",x.employer_etf]
    ];
    const html='<html><head><title>PRIME HR Payslip Preview</title><style>body{font:14px Arial,sans-serif;max-width:720px;margin:40px auto;color:#203527}h1{color:#16513a}table{width:100%;border-collapse:collapse}td{padding:10px;border-bottom:1px solid #ddd}td:last-child{text-align:right}.small{color:#666;font-size:12px}@media print{button{display:none}}</style></head><body>'+
      '<h1>PRIME HR · Payroll Statement</h1><p><b>'+esc(employee?.full_name||"Employee")+'</b> · '+esc(employee?.staff_code||"")+'</p>'+
      '<p>Period: '+esc(x.period_month.slice(0,7))+' · Status: <b>'+esc(x.status.toUpperCase())+'</b></p>'+
      (x.status==="draft"?'<h2>UNAPPROVED DRAFT — NOT PROOF OF PAYMENT</h2>':x.status==="approved"?'<p>APPROVED — NOT PROOF OF PAYMENT</p>':'')+
      '<table>'+lines.map(([label,value])=>'<tr><td>'+esc(label)+'</td><td>'+esc(money(value))+'</td></tr>').join("")+'</table>'+
      '<p class="small">Manual calculations: verify EPF, ETF, APIT, tax rules and final figures independently. No bank transaction was initiated by PRIME HR.</p><button onclick="window.print()">Print / Save PDF</button></body></html>';
    const w=window.open("","_blank");if(!w)return toast("Allow popup to view payslip.",true);
    w.document.open();w.document.write(html);w.document.close();
  }
  function exportPayroll(){
    if(!isHR())return;
    const keys=["staff_code","employee","period_month",...payrollKeys,"gross_pay","net_pay","status","notes"];
    const rows=filteredPayroll().map(x=>({
     ...x,staff_code:state.employees.find(e=>e.id===x.employee_id)?.staff_code||"",
     employee:employeeName(x.employee_id)
    }));
    staffCSV(rows,keys,"PRIME_Payroll_"+localDate()+".csv");
  }



  function filteredAttendance(){
    const self=mine(),date=$("attendance-date-filter").value,team=$("attendance-team-filter").value;
    return state.attendance.filter(a=>{
      if(!isHR())return a.employee_id===self?.id;
      const e=state.employees.find(x=>x.id===a.employee_id);
      return (!date||a.work_date===date)&&(!team||e?.staff_group===team);
    });
  }
  function exportAttendance(){
    if(!isHR())return;
    const rows=filteredAttendance().map(a=>({
      staff_code:state.employees.find(e=>e.id===a.employee_id)?.staff_code||"",
      employee_name:employeeName(a.employee_id),
      team:state.employees.find(e=>e.id===a.employee_id)?.staff_group||"office",
      work_date:a.work_date,check_in:a.check_in||"",check_out:a.check_out||"",mode:a.mode
    }));
    staffCSV(rows,["staff_code","employee_name","team","work_date","check_in","check_out","mode"],
      "PRIME_Attendance_"+localDate()+".csv");
  }

  function calendarOverlapDays(start,end,year){
    const from=Math.max(Date.parse(start+"T00:00:00Z"),Date.UTC(year,0,1));
    const to=Math.min(Date.parse(end+"T00:00:00Z"),Date.UTC(year+1,0,1)-86400000);
    return Number.isFinite(from)&&Number.isFinite(to)&&to>=from?Math.round((to-from)/86400000)+1:0;
  }
  function leaveBalanceRows(){
    const year=Number($("balance-year").value)||new Date().getFullYear();
    return state.entitlements.filter(x=>x.leave_year===year).map(x=>{
      const approved=state.leaves.filter(l=>l.employee_id===x.employee_id&&l.kind===x.leave_type&&l.status==="approved")
        .reduce((n,l)=>n+calendarOverlapDays(l.from_date,l.to_date,year),0);
      return {
        staff_code:state.employees.find(e=>e.id===x.employee_id)?.staff_code||"",
        employee_name:employeeName(x.employee_id),
        leave_type:x.leave_type,leave_year:x.leave_year,
        entitled_days:x.entitled_days,carried_days:x.carried_days,
        approved_calendar_days:approved,
        remaining_calendar_days:Number(x.entitled_days)+Number(x.carried_days)-approved
      };
    });
  }
  function renderLeaveBalances(){
    if(!isHR())return;
    ensureEmployeeDropdown("entitlement-employee");
    const year=new Date().getFullYear();
    if(!$("balance-year").value)$("balance-year").value=String(year);
    if(!$("entitlement-year").value)$("entitlement-year").value=String(year);
    $("leave-balance-rows").innerHTML=leaveBalanceRows().map(r=>
      '<tr><td>'+esc(r.employee_name)+' <span class="muted">'+esc(r.staff_code)+'</span></td><td>'+esc(r.leave_type)+'</td><td>'+r.leave_year+'</td><td>'+
      (Number(r.entitled_days)+Number(r.carried_days))+'</td><td>'+r.approved_calendar_days+'</td><td>'+
      (r.remaining_calendar_days<0?'<b style="color:#9b2d32">':'<b>')+r.remaining_calendar_days+'</b></td></tr>'
    ).join("")||empty(6,"No company-approved leave entitlements entered for this year.");
  }
  async function saveEntitlement(ev){
    ev.preventDefault();if(!isHR())return;
    const f=ev.target;
    const r={
      employee_id:formValue(f,"employee_id"),
      leave_year:Number(formValue(f,"leave_year")),
      leave_type:formValue(f,"leave_type"),
      entitled_days:Number(formValue(f,"entitled_days")),
      carried_days:Number(formValue(f,"carried_days"))
    };
    if(!r.employee_id||r.leave_year<2020||r.leave_year>2100||[r.entitled_days,r.carried_days].some(x=>!Number.isFinite(x)||x<0||x>366))
      return toast("Enter a valid staff member, year and approved entitlement.",true);
    const {error}=await state.client.from("hr_leave_entitlements")
      .upsert(r,{onConflict:"employee_id,leave_year,leave_type"});
    if(error)return toast(normalizeErr(error),true);
    toast("Leave entitlement updated.");await fetchData();
  }
  function exportLeaveBalances(){
    if(!isHR())return;
    staffCSV(leaveBalanceRows(),
      ["staff_code","employee_name","leave_type","leave_year","entitled_days","carried_days","approved_calendar_days","remaining_calendar_days"],
      "PRIME_Leave_Balances_"+$("balance-year").value+".csv");
  }
  function renderOperationsSummary(){
    if(!isHR())return;
    const groups={office:0,sales:0,plantation:0};
    state.employees.filter(e=>e.status==="active").forEach(e=>{groups[e.staff_group||"office"]=(groups[e.staff_group||"office"]||0)+1});
    const pendingPay=state.payroll.filter(x=>x.status==="draft").length;
    const pendingLetters=state.letterDrafts.filter(x=>x.status==="draft").length;
    const pendingLeave=state.leaves.filter(x=>x.status==="pending").length;
    $("admin-operations").textContent="Teams — Office: "+groups.office+" · Sales: "+groups.sales+
      " · Plantation: "+groups.plantation+" | Payroll drafts: "+pendingPay+
      " | Letter drafts: "+pendingLetters+" | Leave awaiting HR: "+pendingLeave;
  }
  function exportCandidates(){
    if(!isHR())return;
    staffCSV(state.candidates.map(x=>({...x,branch:branchName(x.branch_id)})),
      ["full_name","email","position","branch","stage","notes"],
      "PRIME_Recruitment_"+localDate()+".csv");
  }
  function exportKpis(){
    if(!isHR())return;
    staffCSV(state.kpis.map(x=>({
      staff_code:state.employees.find(e=>e.id===x.employee_id)?.staff_code||"",
      employee:employeeName(x.employee_id),period_month:x.period_month,
      target_amount:x.target_amount,achieved_amount:x.achieved_amount,
      completion_pct:Number(x.target_amount)>0?Math.round(10000*Number(x.achieved_amount)/Number(x.target_amount))/100:0
    })),["staff_code","employee","period_month","target_amount","achieved_amount","completion_pct"],
    "PRIME_KPI_"+localDate()+".csv");
  }
  function exportAssets(){
    if(!isHR())return;
    staffCSV(state.assets.map(x=>({
      asset_tag:x.asset_tag,description:x.description,
      assigned_to:x.assigned_to?employeeName(x.assigned_to):"Unassigned",
      status:x.status,notes:x.notes||""
    })),["asset_tag","description","assigned_to","status","notes"],
    "PRIME_Assets_"+localDate()+".csv");
  }


  function renderLetterTemplates(){
    if(!isHR())return;
    const picker=$("letter-template-select"),selected=picker.value;
    picker.innerHTML='<option value="">New template</option>'+state.letterTemplates.map(t=>
      '<option value="'+esc(t.id)+'" '+(selected===t.id?'selected':'')+'>'+esc(t.template_name+" (v"+t.version+")")+'</option>'
    ).join("");
    const draftSel=$("letter-draft-template"),chosen=draftSel.value;
    draftSel.innerHTML='<option value="">Select approved template</option>'+state.letterTemplates.filter(t=>t.status==="approved").map(t=>
      '<option value="'+esc(t.id)+'" '+(chosen===t.id?'selected':'')+'>'+esc(t.template_name+" · v"+t.version)+'</option>'
    ).join("");
    $("letter-template-rows").innerHTML=state.letterTemplates.map(t=>
      '<tr><td>'+esc(t.template_name)+'</td><td>'+esc(t.designation_match||"Any")+'</td><td>'+esc(t.language)+'</td><td>'+esc(t.version)+'</td><td>'+fmtStatus(t.status)+'</td></tr>'
    ).join("")||empty(5,"No company-approved letter templates entered.");
  }
  function loadTemplateEditor(){
    if(!isAdmin())return;
    const t=state.letterTemplates.find(x=>x.id===$("letter-template-select").value);
    const f=$("letter-template-form");
    f.reset();
    for(const key of ["template_name","designation_match","language","subject","body","status"])
      setFormValue(f,key,t?.[key]||(key==="language"?"en":key==="status"?"draft":""));
  }
  async function saveTemplate(ev){
    ev.preventDefault();if(!isAdmin())return;
    const f=ev.target;
    const record={
      template_name:formValue(f,"template_name").trim(),
      designation_match:formValue(f,"designation_match").trim()||null,
      language:formValue(f,"language"),
      subject:formValue(f,"subject").trim(),
      body:formValue(f,"body"),
      status:formValue(f,"status"),
      updated_by:state.user.id
    };
    if(record.body.length<30)return toast("Paste the full approved wording before saving.",true);
    if(record.status==="approved"&&!confirm("Confirm this is the exact company-approved wording, including all unchanged common clauses?"))
      return;
    const id=$("letter-template-select").value;
    const q=id?state.client.from("hr_letter_templates").update(record).eq("id",id):
      state.client.from("hr_letter_templates").insert(record);
    const {error}=await q;
    if(error)return toast(normalizeErr(error),true);
    toast("Template saved. Revision/version recorded.");await fetchData();
  }
  function letterMerge(text,employee,number){
    const dict={
      employee_name:employee.full_name,
      staff_code:employee.staff_code,
      designation:employee.designation,
      branch:branchName(employee.branch_id),
      date:localDate(),
      joined_on:employee.joined_on||"To be confirmed",
      company_name:"Prime Agri Business & Plantations (Pvt) Ltd",
      document_no:number
    };
    const unknown=new Set();
    const merged=String(text).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi,(token,key)=>{
      if(!Object.prototype.hasOwnProperty.call(dict,key)){unknown.add(key);return token}
      return String(dict[key]??"");
    });
    if(unknown.size)throw Error("Unknown template placeholders: "+[...unknown].join(", "));
    if(merged.includes("{{"))throw Error("A placeholder is not resolved in the template.");
    return merged;
  }
  async function draftLettersBulk(ev){
    ev.preventDefault();if(!isHR())return;
    const f=ev.target,template=state.letterTemplates.find(t=>t.id===formValue(f,"template_id")&&t.status==="approved");
    if(!template)return toast("Choose an approved letter template.",true);
    const codes=[...new Set(formValue(f,"staff_codes").split(/[\s,;]+/).map(x=>x.trim().toUpperCase()).filter(Boolean))];
    if(!codes.length||codes.length>100)return toast("Enter 1–100 employee codes.",true);
    const prefix=formValue(f,"prefix").trim();
    if(!/^[A-Za-z0-9/_-]{3,45}$/.test(prefix))return toast("Prefix: 3–45 letters/numbers, slash, hyphen or underscore.",true);
    const rows=[];
    try{
      for(const code of codes){
        const e=state.employees.find(x=>x.staff_code.toUpperCase()===code);
        if(!e)throw Error("Unknown employee number: "+code);
        if(template.designation_match&&!e.designation.toLowerCase().includes(template.designation_match.toLowerCase()))
          throw Error("Template designation does not match "+code+": "+e.designation);
        const number=prefix+code;
        rows.push({
          employee_id:e.id,template_id:template.id,template_version:template.version,
          document_no:number,subject:letterMerge(template.subject,e,number),
          rendered_body:letterMerge(template.body,e,number),status:"draft",created_by:state.user.id
        });
      }
    }catch(err){return toast(err.message,true)}
    if(!confirm("Create "+rows.length+" UNSIGNED letter drafts? Nothing will be issued or signed."))return;
    const {error}=await state.client.from("hr_letter_drafts").insert(rows);
    if(error)return toast("Draft generation failed: "+normalizeErr(error),true);
    toast(rows.length+" unsigned letter drafts created.");f.reset();await fetchData();
  }
  function renderLetterDrafts(){
    if(!isHR())return;
    $("letter-draft-rows").innerHTML=state.letterDrafts.map(d=>{
      let controls='<button class="btn tiny outline" data-draft-print="'+esc(d.id)+'">Preview / Print</button>';
      if(isAdmin()&&d.status==="draft")controls+=' <button class="btn tiny" data-draft-action="approved" data-draft-id="'+esc(d.id)+'">Approve</button>';
      if(isAdmin()&&d.status==="approved")controls+=' <button class="btn tiny primary" data-draft-action="issued" data-draft-id="'+esc(d.id)+'">Mark Issued</button>';
      return '<tr><td>'+esc(d.document_no)+'</td><td>'+esc(employeeName(d.employee_id))+'</td><td>'+esc(d.subject)+'</td><td>'+fmtStatus(d.status)+'</td><td>'+controls+'</td></tr>';
    }).join("")||empty(5,"No generated drafts. Select an approved template above.");
  }
  async function decideLetterDraft(id,newStatus){
    if(!isAdmin())return;
    const d=state.letterDrafts.find(x=>x.id===id);
    if(!d||!((d.status==="draft"&&newStatus==="approved")||(d.status==="approved"&&newStatus==="issued")))return;
    if(!confirm((newStatus==="issued"?"Mark this letter as actually issued?":"Approve the complete unchanged wording of")+" "+d.document_no+"?"))return;
    const {error,data}=await state.client.from("hr_letter_drafts").update({status:newStatus})
      .eq("id",id).eq("status",d.status).select("id");
    if(error||!data?.length)return toast(error?normalizeErr(error):"Draft status was changed elsewhere.",true);
    toast(newStatus==="issued"?"Letter issued and atomically recorded in HR Register.":"Letter approved. No signature was added.");
    await fetchData();
  }
  function printDraftLetter(id){
    if(!isHR())return;
    const d=state.letterDrafts.find(x=>x.id===id);
    if(!d)return;
    const e=state.employees.find(x=>x.id===d.employee_id);
    const formatted=esc(d.rendered_body).replace(/\r?\n/g,"<br>");
    const html='<html><head><meta charset="utf-8"><title>PRIME HR Letter '+esc(d.document_no)+'</title>'+
     '<style>body{font:15px/1.65 Georgia,serif;color:#22362d;margin:32px auto;max-width:780px;padding:28px}h1{text-align:center;color:#14513e}p{margin:5px 0 16px}.small{font:12px Arial;color:#777}.text{margin:30px 0;white-space:normal}.sign{margin-top:80px}button{padding:12px}@media print{button{display:none}}</style></head><body>'+
     '<h1>PRIME</h1><p style="text-align:center">Prime Agri Business &amp; Plantations (Pvt) Ltd</p><hr>'+
     '<p class="small">'+esc(d.document_no)+' · '+esc(localDate())+' · '+esc(d.status.toUpperCase())+'</p>'+
     '<p>To: <b>'+esc(e?.full_name||"Staff")+'</b></p><h2>'+esc(d.subject)+'</h2>'+
     (d.status==="draft"?'<p><b>UNAPPROVED DRAFT — NOT ISSUED</b></p>':d.status==="approved"?'<p><b>APPROVED — NOT YET ISSUED</b></p>':'')+
     '<div class="text">'+formatted+'</div><div class="sign">____________________________<br>Authorized Signatory (signature not generated)</div>'+
     '<p class="small">Check against your company letterhead, authorized signatures, and applicable legal requirements before delivery.</p>'+
     '<button onclick="window.print()">Print / Save PDF</button></body></html>';
    const w=window.open("","_blank");if(!w)return toast("Enable popups to preview letter.",true);
    w.document.open();w.document.write(html);w.document.close();
  }

  function events() {
    $("auth-form").addEventListener("submit",submitAuth);
    $("toggle-auth").addEventListener("click",toggleAuth);
    ["logout","pending-logout"].forEach(id=>$(id).addEventListener("click",async()=>{await state.client.auth.signOut();state.user=null;state.profile=null;screen("auth-screen")}));
    $("refresh").addEventListener("click",fetchData);
    $("field-team-filter").addEventListener("change",renderFieldReports);
    $("field-date-filter").addEventListener("change",renderFieldReports);
    $("field-export").addEventListener("click",exportFieldReports);
    $("payroll-form").addEventListener("submit",savePayroll);
    $("payroll-form").addEventListener("input",payrollFormTotals);
    $("payroll-employee").addEventListener("change",fillPayrollFromMaster);
    $("payroll-month").addEventListener("change",fillPayrollFromMaster);
    $("payroll-period-filter").addEventListener("change",renderPayroll);
    $("payroll-status-filter").addEventListener("change",renderPayroll);
    $("payroll-export").addEventListener("click",exportPayroll);
    $("entitlement-form").addEventListener("submit",saveEntitlement);
    $("balance-year").addEventListener("change",renderLeaveBalances);
    $("leave-balance-export").addEventListener("click",exportLeaveBalances);
    $("candidate-export").addEventListener("click",exportCandidates);
    $("kpi-export").addEventListener("click",exportKpis);
    $("asset-export").addEventListener("click",exportAssets);
    $("letter-template-select").addEventListener("change",loadTemplateEditor);
    $("letter-template-form").addEventListener("submit",saveTemplate);
    $("letter-draft-form").addEventListener("submit",draftLettersBulk);
    $("attendance-export").addEventListener("click",exportAttendance);
    $("attendance-team-filter").addEventListener("change",renderAttendance);
    $("attendance-date-filter").addEventListener("change",renderAttendance);
    $("nav").addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(b)switchView(b.dataset.view)});
    $("workspace").addEventListener("click",e=>{const b=e.target.closest("[data-go]");if(b)switchView(b.dataset.go)});
    $("menu-toggle").addEventListener("click",()=>document.querySelector(".sidebar").classList.toggle("open"));
    $("employee-add").addEventListener("click",openStaffAdd);
    $("staff-new-open").addEventListener("click",openStaffAdd);
    $("staff-add-form").addEventListener("submit",staffAdd);
    $("staff-template").addEventListener("click",downloadStaffTemplate);
    $("staff-master-export").addEventListener("click",exportCompleteStaffMaster);
    $("staff-file").addEventListener("change",readStaffFile);
    $("staff-import-btn").addEventListener("click",()=>processStaffRecords(state.staffUploadRows));
    $("staff-clear").addEventListener("click",()=>{state.staffUploadRows=[];$("staff-file").value="";renderStaffPreview()});
    $("staff-refresh").addEventListener("click",fetchData);
    $("staff-account-search").addEventListener("input",renderStaffAccounts);
    $("staff-credentials-download").addEventListener("click",()=>staffCSV(state.staffCredentials.filter(c=>c.password),["staff_code","full_name","password"],"PRIME_HR_ONE_TIME_CREDENTIALS.csv"));
    $("staff-password-show").addEventListener("click",()=>{
      const input=$("staff-password-value");
      input.type=input.type==="password"?"text":"password";
      $("staff-password-show").textContent=input.type==="password"?"Show Password":"Hide Password";
    });
    $("staff-password-copy").addEventListener("click",async()=>{
      if(!isAdmin())return;
      try{await navigator.clipboard.writeText($("staff-password-value").value);toast("Password copied. Share privately and clear clipboard after use.");}
      catch{toast("Clipboard unavailable; use Show Password and select it.",true)}
    });
    $("staff-password-dialog").addEventListener("close",()=>{$("staff-password-value").value="";$("staff-password-value").type="password";});
    $("candidate-add").addEventListener("click",()=>editCandidate(""));
    $("employee-search").addEventListener("input",renderEmployees);
    $("employee-export").addEventListener("click",exportCSV);
    $("employee-form").addEventListener("submit",saveEmployee);
    $("candidate-form").addEventListener("submit",saveCandidate);
    $("leave-form").addEventListener("submit",submitLeave);
    $("checkin").addEventListener("click",()=>markAttendance("in"));
    
    $("checkout").addEventListener("click",()=>markAttendance("out"));
    $("enable-location").addEventListener("click",askLocationPermission);
    $("later-location").addEventListener("click",()=>{localStorage.setItem("prime_hr_location_intro_v1_"+state.user.id,"later");$("location-dialog").close()});
    $("location-settings").addEventListener("click",()=>{$("location-dialog").showModal()});
    $("profile-location-settings").addEventListener("click",()=>{$("location-dialog").showModal()});
    $("gps-filter").addEventListener("change",renderLocations);
    $("gps-export").addEventListener("click",exportLocations);
    $("notice-add").addEventListener("click",()=>showQuick("notice"));
    $("kpi-add").addEventListener("click",()=>showQuick("kpi"));
    $("asset-add").addEventListener("click",()=>showQuick("asset"));
    $("letter-add").addEventListener("click",()=>showQuick("letter"));
    $("quick-form").addEventListener("submit",saveQuick);
    document.querySelectorAll(".mobile-bottom-nav [data-go]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.go)));

    document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
    $("workspace").addEventListener("click",e=>{
      let b=e.target.closest("[data-edit-employee]");if(b)return editEmployee(b.dataset.editEmployee);
      b=e.target.closest("[data-edit-candidate]");if(b)return editCandidate(b.dataset.editCandidate);
      b=e.target.closest("[data-leave-action]");if(b)return decideLeave(b.dataset.leaveId,b.dataset.leaveAction);
      b=e.target.closest("[data-account-id]");if(b)return setApproval(b.dataset.accountId,b.dataset.accountActive==="true");
      b=e.target.closest("[data-ack]");if(b)return acknowledge(b.dataset.ack);
      b=e.target.closest("[data-staff-show]");if(b)return showStaffPassword(b.dataset.staffShow);
      b=e.target.closest("[data-staff-reset]");if(b)return staffManage("reset_password",b.dataset.staffReset);
      b=e.target.closest("[data-staff-toggle]");if(b)return staffManage("set_access",b.dataset.staffToggle,b.dataset.staffEnable==="true");
      b=e.target.closest("[data-staff-repair]");if(b)return staffManage("repair",b.dataset.staffRepair);
      b=e.target.closest("[data-payroll-action]");if(b)return decidePayroll(b.dataset.payrollId,b.dataset.payrollAction);
      b=e.target.closest("[data-payroll-print]");if(b)return printPayroll(b.dataset.payrollPrint);
      b=e.target.closest("[data-draft-action]");if(b)return decideLetterDraft(b.dataset.draftId,b.dataset.draftAction);
      b=e.target.closest("[data-draft-print]");if(b)return printDraftLetter(b.dataset.draftPrint);
      b=e.target.closest("[data-asset-edit]");if(b)return editAsset(b.dataset.assetEdit);
    });
    $("workspace").addEventListener("change",e=>{const s=e.target.closest("[data-role-id]");if(s)updateRole(s.dataset.roleId,s.value)});
  }
  async function init() {
    events();
    const config=window.PRIME_HR_CONFIG||{};
    if(!config.supabaseUrl||!config.supabasePublishableKey||config.supabaseUrl.includes("REPLACE_")||config.supabasePublishableKey.includes("REPLACE_")) {screen("setup-screen");return}
    if(!window.supabase?.createClient){screen("setup-screen");toast("Supabase browser library did not load. Check your internet connection.",true);return}
    try{
      state.client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js",{scope:"./"}).catch(()=>{});
      await loadSession();
    }catch(err){console.error(err);screen("setup-screen");toast("Cloud initialization failed. Check configuration.",true)}
  }
  document.addEventListener("DOMContentLoaded",init);
})();
/* PRIME HR Next Level — Appointment Builder V2.
 * Uses existing private hr_letter_templates and hr_letter_drafts, with RLS.
 * No source appointment documents, employee data or signed contracts are committed.
 */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const norm=v=>String(v??"").trim().replace(/\s+/g," ").toLowerCase();
const code=v=>String(v??"").trim().toUpperCase();
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const allowed=new Set(["employee_name","staff_code","designation","branch","date","letter_date","effective_date","joined_on","company_name","document_no","nic","address","basic_salary","vehicle_allowance","fuel_allowance","monthly_target","notes"]);
let parsed=[],validated=[],bound=false,previewApproved=false;

function bridge(){
 const b=window.PrimeAppointmentBridge;
 if(!b)return null;
 const c=b();
 return c&&c.isHR?c:null;
}
function notify(message,error=false){
 const c=bridge();
 if(c)c.toast(message,error);
 const st=$("appointment-v2-status");
 if(st){st.textContent=message;st.style.color=error?"#9b3328":""}
}
function params(f){return Object.fromEntries(new FormData(f).entries())}
function excelFile(file){
 if(!file)throw Error("Select an Excel or CSV file.");
 if(!/\.(xlsx|xls|csv)$/i.test(file.name)||file.size>3*1024*1024)
   throw Error("Use an .xlsx, .xls or .csv file up to 3MB.");
 if(!window.XLSX)throw Error("Spreadsheet library unavailable. Reload and try again.");
 return file.arrayBuffer().then(bytes=>{
  const wb=XLSX.read(bytes,{type:"array",cellDates:false});
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:"",raw:false});
  return rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[
   norm(key).replace(/[\s\-\/]+/g,"_").replace(/[^a-z_]/g,""),String(value??"").trim()
  ]))).filter(row=>Object.values(row).some(v=>v!==""));
 });
}
function sheet(filename,columns,rows){
 if(!window.XLSX)return notify("Spreadsheet library unavailable.",true);
 const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet([columns,...rows]);
 ws["!cols"]=columns.map(x=>({wch:Math.min(48,Math.max(18,x.length+7))}));
 XLSX.utils.book_append_sheet(wb,ws,"PRIME Appointments");
 XLSX.writeFile(wb,filename);
}
function approvedTemplates(c){return c.state.letterTemplates.filter(t=>t.status==="approved")}
function matchesDesignation(t,e){
 const match=norm(t.designation_match);
 return !match||norm(e.designation)===match||norm(e.designation).includes(match);
}
function findTemplate(c,e,name){
 const templates=approvedTemplates(c);
 if(name){
  const result=templates.filter(t=>norm(t.template_name)===norm(name));
  if(result.length!==1)throw Error("Approved template not found or ambiguous: "+name);
  if(!matchesDesignation(result[0],e))throw Error("Template designation does not match "+e.designation);
  return result[0];
 }
 // Automatic mapping must be unambiguous. Generic templates are never silently chosen.
 const exact=templates.filter(t=>norm(t.designation_match)===norm(e.designation)&&norm(t.designation_match));
 if(exact.length===1)return exact[0];
 if(exact.length>1)throw Error("Multiple templates match "+e.designation+"; specify Template Name.");
 const partial=templates.filter(t=>norm(t.designation_match)&&norm(e.designation).includes(norm(t.designation_match)));
 if(partial.length===1)return partial[0];
 throw Error("No unique approved template for "+e.designation+"; enter Template Name.");
}
function getEmployee(c,staffCode){
 const e=c.state.employees.find(x=>code(x.staff_code)===code(staffCode));
 if(!e)throw Error("Employee code not found in Staff Master: "+staffCode);
 if(e.status!=="active")throw Error("Employee "+staffCode+" is not active.");
 return e;
}
function ensureDate(s,label){
 const v=String(s??"").trim();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(new Date(v+"T12:00:00").getTime())
  ||new Date(v+"T12:00:00").toISOString().slice(0,10)!==v)throw Error(label+" must be a valid YYYY-MM-DD date.");
 return v;
}
function money(s,label){
 const v=String(s??"").trim();
 if(!v)return "";
 const n=Number(v.replace(/,/g,""));
 if(!Number.isFinite(n)||n<0)throw Error(label+" must be a non-negative amount.");
 return new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(n);
}
function contentFields(c,e,row,no){
 const letterDate=ensureDate(row.letter_date||row.date||today(),"Letter date");
 // Joining date is deliberately NOT treated as the appointment effective date.
 const effective=ensureDate(row.effective_date,"Effective appointment date");
 const value=(key,fallback)=>String(row[key]??"").trim()||String(fallback??"").trim();
 return {
   employee_name:e.full_name,staff_code:e.staff_code,designation:e.designation,
   branch:c.branchName(e.branch_id),date:letterDate,letter_date:letterDate,effective_date:effective,
   joined_on:e.joined_on||"",company_name:"Prime Agri Business & Plantations (Pvt) Ltd",
   document_no:no,nic:value("nic",e.national_id),address:value("address",e.address),
   basic_salary:money(value("basic_salary",e.basic_salary),"Basic salary"),
   vehicle_allowance:money(value("vehicle_allowance",e.vehicle_allowance),"Vehicle allowance"),
   fuel_allowance:value("fuel_allowance"),monthly_target:money(value("monthly_target"),"Monthly target"),
   notes:value("notes")
 };
}
function mergeStrict(text,data){
 const unresolved=new Set();
 const output=String(text??"").replace(/\{\{\s*([^{}]+)\s*\}\}/g,(token,k)=>{
  const field=k.trim().toLowerCase();
  if(!allowed.has(field)){unresolved.add(field+" (unknown)");return token}
  if(data[field]===undefined||data[field]===null||String(data[field]).trim()===""){
   unresolved.add(field+" (missing)");return token
  }
  return String(data[field]);
 });
 if(unresolved.size)throw Error("Template fields: "+[...unresolved].join(", "));
 if(output.includes("{{")||output.includes("}}"))throw Error("Unresolved template placeholder.");
 return output;
}
function createRow(c,row){
 const e=getEmployee(c,row.staff_code),template=findTemplate(c,e,row.template_name);
 const no=String(row.document_no||"PRIME-AP-"+ensureDate(row.letter_date||today(),"Letter date").slice(0,4)+"-"+code(e.staff_code)).trim();
 if(no.length<3||no.length>100||!/^[A-Za-z0-9/_-]+$/.test(no))throw Error("Invalid Document Number.");
 const fields=contentFields(c,e,row,no);
 const subject=mergeStrict(template.subject,fields),body=mergeStrict(template.body,fields);
 if(!subject.trim()||body.trim().length<30)throw Error("Template subject/body must contain approved wording.");
 const existing=[...c.state.letterDrafts,...c.state.letters].some(x=>norm(x.document_no)===norm(no));
 if(existing)throw Error("Document Number already exists: "+no);
 return {employee:e,template,entry:{employee_id:e.id,template_id:template.id,template_version:template.version,
    document_no:no,subject,rendered_body:body,status:"draft",created_by:c.state.user.id}};
}
function render(){
 const c=bridge();
 if(!c||!$("ap-v2-templates"))return;
 const templates=c.state.letterTemplates;
 $("ap-v2-template-summary").textContent=templates.filter(t=>t.status==="approved").length+
   " approved / "+templates.filter(t=>t.status==="draft").length+" awaiting approval.";
 $("ap-v2-templates").innerHTML=templates.map(t=>
  "<tr><td>"+escapeHtml(t.template_name)+"</td><td>"+escapeHtml(t.designation_match||"Any")+
  "</td><td>"+escapeHtml(t.version)+"</td><td>"+escapeHtml(t.status)+"</td></tr>"
 ).join("")||'<tr><td colspan="4">No updated templates yet. Admin can import them using one workbook above.</td></tr>';
 const staff=$("ap-v2-employee"),prev=staff.value;
 staff.innerHTML='<option value="">Select employee</option>'+
  c.state.employees.filter(e=>e.status==="active").map(e=>
  '<option value="'+escapeHtml(e.staff_code)+'">'+escapeHtml(e.staff_code+" — "+e.full_name)+"</option>").join("");
 if([...staff.options].some(o=>o.value===prev))staff.value=prev;
 const templateInput=$("ap-v2-manual-template"),selected=templateInput.value;
 templateInput.innerHTML='<option value="">Select approved template</option>'+approvedTemplates(c).map(t=>
  '<option value="'+escapeHtml(t.id)+'">'+escapeHtml(t.template_name+" · "+(t.designation_match||"Any"))+"</option>").join("");
 if([...templateInput.options].some(o=>o.value===selected))templateInput.value=selected;
 const drafts=c.state.letterDrafts.filter(d=>d.template_id&&templates.some(t=>t.id===d.template_id)).slice(0,30);
 $("ap-v2-drafts").innerHTML=drafts.map(d=>{
  const e=c.state.employees.find(x=>x.id===d.employee_id);
  return '<tr><td>'+escapeHtml(d.document_no)+'</td><td>'+escapeHtml(e?.full_name||"Unknown")+
   '</td><td>'+escapeHtml(d.subject)+'</td><td>'+escapeHtml(d.status)+'</td><td><button class="btn tiny outline" data-draft-print="'+escapeHtml(d.id)+'">Preview / Print</button></td></tr>'
 }).join("")||'<tr><td colspan="5">No new appointment drafts yet.</td></tr>';
 const manual=$("ap-v2-manual");
 if(!manual.elements.namedItem("letter_date").value)manual.elements.namedItem("letter_date").value=today();
 if(c.state.letterTemplates.length===0)notify("Ready for new appointment templates. Import the 15 updated versions; no old templates are used.");
 else notify("Appointment Builder V2 ready. Only approved updated templates can generate letters.");
}
function employeeChanged(){
 const c=bridge();if(!c)return;
 const sc=$("ap-v2-employee").value;
 if(!sc)return;
 const e=c.state.employees.find(x=>code(x.staff_code)===code(sc));if(!e)return;
 const f=$("ap-v2-manual");
 f.elements.namedItem("nic").value=e.national_id||"";
 f.elements.namedItem("address").value=e.address||"";
 f.elements.namedItem("basic_salary").value=e.basic_salary??"";
 f.elements.namedItem("vehicle_allowance").value=e.vehicle_allowance??"";
 f.elements.namedItem("effective_date").value=""; // Cannot assume joining equals official appointment date.
 $("ap-v2-document").value="PRIME-AP-"+today().slice(0,4)+"-"+code(e.staff_code);
 const exact=approvedTemplates(c).filter(t=>norm(t.designation_match)===norm(e.designation)&&norm(t.designation_match));
 $("ap-v2-manual-template").value=exact.length===1?exact[0].id:"";
}
async function submitManual(ev){
 ev.preventDefault();
 const c=bridge();if(!c)return;
 const row=params(ev.target);
 const tpl=c.state.letterTemplates.find(t=>t.id===row.template_id&&t.status==="approved");
 if(!tpl)return notify("Select one approved updated template.",true);
 row.template_name=tpl.template_name;
 try{
  const {entry}=createRow(c,row);
  if(!window.confirm("Create ONE unsigned appointment draft for "+row.staff_code+"?"))return;
  const {error}=await c.state.client.from("hr_letter_drafts").insert([entry]);
  if(error)throw error;
  notify("Unsigned appointment draft created; review it in Letter Register.");
  ev.target.reset();validated=[];previewApproved=false;
  await c.refresh();
 }catch(err){notify(err.message||String(err),true)}
}
async function importTemplates(){
 const c=bridge();if(!c?.isAdmin)return notify("Only Admin can import official templates.",true);
 const button=$("ap-v2-template-import");button.disabled=true;
 try{
  const rows=await excelFile($("ap-v2-template-file").files[0]);
  if(!rows.length||rows.length>100)throw Error("Template workbook must contain 1–100 rows.");
  const existing=new Set(c.state.letterTemplates.map(t=>norm(t.template_name))),names=new Set();
  const records=rows.map((r,i)=>{
    const name=String(r.template_name||"").trim(),designation=String(r.designation_match||"").trim();
    const language=String(r.language||"en").trim().toLowerCase();
    const subject=String(r.subject||"").trim(),body=String(r.body||"");
    if(!name||name.length>130||!designation||designation.length>130)throw Error("Template row "+(i+2)+": template_name and designation_match required.");
    if(existing.has(norm(name))||names.has(norm(name)))throw Error("Duplicate template name in upload or database: "+name);
    if(!["en","si","ta"].includes(language))throw Error("Template row "+(i+2)+": invalid language.");
    if(!subject||subject.length>250||body.trim().length<30||body.length>30000)throw Error("Template row "+(i+2)+": enter complete approved subject/body text.");
    for(const value of [subject,body]){
      for(const m of value.matchAll(/\{\{\s*([^{}]+)\s*\}\}/g))
       if(!allowed.has(norm(m[1])))throw Error("Template "+name+": unsupported placeholder "+m[1]);
    }
    names.add(norm(name));
    return {template_name:name,designation_match:designation,language,subject,body,status:"draft",updated_by:c.state.user.id};
  });
  if(!window.confirm("Import "+records.length+" new appointment templates as DRAFT? Exact wording must be checked and separately approved by Admin."))return;
  const {error}=await c.state.client.from("hr_letter_templates").insert(records);
  if(error)throw error;
  $("ap-v2-template-file").value="";
  notify(records.length+" updated templates imported as DRAFT. Approve in Letter Register after checking every clause.");
  await c.refresh();
 }catch(err){notify("Import failed: "+(err.message||err),true)}
 finally{button.disabled=false}
}
function downloadTemplateSample(){
 sheet("PRIME_Appointment_V2_15_Template_Import.xlsx",
  ["template_name","designation_match","language","subject","body"],
  Array.from({length:15},()=>["","","en","",""]));
}
function downloadBulkSample(){
 sheet("PRIME_Appointment_V2_15_Employees.xlsx",
  ["staff_code","template_name","document_no","letter_date","effective_date","nic","address","basic_salary","vehicle_allowance","fuel_allowance","monthly_target","notes"],
  Array.from({length:15},()=>["","","",today(),"","","","","","","",""]));
}
async function validateBulk(){
 const c=bridge();if(!c)return;
 previewApproved=false;validated=[];parsed=[];$("ap-v2-save").disabled=true;
 try{
  parsed=await excelFile($("ap-v2-bulk-file").files[0]);
  if(!parsed.length||parsed.length>100)throw Error("Upload 1–100 employee appointment rows.");
  const seen=new Set(),out=[];
  for(let i=0;i<parsed.length;i++){
   const row=parsed[i];let item=null,error="";
   try{
    if(!row.staff_code)throw Error("Staff Code required.");
    item=createRow(c,row);
    const n=norm(item.entry.document_no);
    if(seen.has(n))throw Error("Document Number repeated within Excel file.");
    seen.add(n);
   }catch(err){error=err.message||String(err)}
   out.push({line:i+2,row,item,error});
  }
  validated=out;
  const failures=out.filter(x=>x.error);
  $("ap-v2-preview-rows").innerHTML=out.map(x=>
   "<tr><td>"+x.line+"</td><td>"+escapeHtml(x.row.staff_code||"")+"</td><td>"+escapeHtml(x.item?.employee.full_name||"—")+
   "</td><td>"+escapeHtml(x.item?.template.template_name||x.row.template_name||"—")+"</td><td>"+
   escapeHtml(x.item?.entry.document_no||x.row.document_no||"—")+"</td><td>"+
   (x.error?'<span style="color:#9b3328">'+escapeHtml(x.error)+"</span>":"Valid draft")+"</td></tr>"
  ).join("");
  $("ap-v2-upload-info").textContent=out.length+" rows scanned · "+(out.length-failures.length)+" valid · "+failures.length+" need correction.";
  previewApproved=failures.length===0;
  $("ap-v2-save").disabled=!previewApproved;
  notify(previewApproved?"All "+out.length+" appointments validated. Review before creating drafts.":"Correct Excel errors before generating any drafts.",!previewApproved);
 }catch(err){$("ap-v2-preview-rows").innerHTML='<tr><td colspan="6">No valid file preview available.</td></tr>';notify("Validation failed: "+(err.message||err),true)}
}
async function saveBulk(){
 const c=bridge();
 if(!c||!previewApproved||validated.length===0||validated.some(r=>r.error))return;
 const rows=validated.map(x=>x.item.entry);
 if(!window.confirm("Create "+rows.length+" UNSIGNED appointment draft records? No appointments will be approved or issued."))return;
 const button=$("ap-v2-save");button.disabled=true;
 try{
  const {error}=await c.state.client.from("hr_letter_drafts").insert(rows);
  if(error)throw error;
  parsed=[];validated=[];previewApproved=false;$("ap-v2-bulk-file").value="";
  $("ap-v2-preview-rows").innerHTML='<tr><td colspan="6">Batch created. Upload another workbook to continue.</td></tr>';
  $("ap-v2-upload-info").textContent=rows.length+" unsigned appointment drafts created.";
  notify(rows.length+" appointment drafts saved. Admin must approve each before issue.");
  await c.refresh();
 }catch(err){notify("Bulk creation failed: "+(err.message||err),true)}
 finally{button.disabled=!previewApproved}
}
function init(){
 if(bound||!$("ap-v2-manual"))return;
 bound=true;
 $("ap-v2-manual").addEventListener("submit",submitManual);
 $("ap-v2-employee").addEventListener("change",employeeChanged);
 $("ap-v2-template-import").addEventListener("click",importTemplates);
 $("ap-v2-template-sample").addEventListener("click",downloadTemplateSample);
 $("ap-v2-bulk-sample").addEventListener("click",downloadBulkSample);
 $("ap-v2-preview").addEventListener("click",validateBulk);
 $("ap-v2-save").addEventListener("click",saveBulk);
 $("ap-v2-bulk-file").addEventListener("change",()=>{previewApproved=false;validated=[];$("ap-v2-save").disabled=true;$("ap-v2-upload-info").textContent="New file selected. Click Validate / Preview.";});
}
window.PrimeAppointmentV2={render:()=>{init();render();}};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
/* PRIME HR — original Word appointment generator (v4). No templates are exposed in public source. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const bridge=()=>window.PrimeAppointmentBridge?.();
const bucket="prime-appointment-templates",folder="original-word";
const roles=[
"Client Relation Consultant","Client Relation Executive","Client Relation Manager",
"Senior Client Relation Manager","Team Marketing Executive","Senior Team Marketing Executive",
"Team Manager","Assistant Branch Sales Manager","Branch Sales Manager",
"Regional Sales Manager","Senior Regional Sales Manager","Zonal Sales Manager",
"Senior Zonal Sales Manager","Cluster Manager","Assistant General Manager"
];
const aliases={"agm":"Assistant General Manager","cluster sales manager":"Cluster Manager"};
const norm=value=>String(value||"").toLowerCase().trim().replace(/\s+/g," ");
const originalRole=designation=>roles.find(r=>norm(r)===norm(aliases[norm(designation)]||designation))||null;
const pathForRole=role=>folder+"/Appointment_Letter_"+role.replace(/\s+/g,"_")+".docx";
const setStatus=(id,text)=>{if($(id))$(id).textContent=text};
let current=null, ready=false, available=new Set();
const requirements=["[EMPLOYEE FULL NAME]","[EMPLOYEE ADDRESS LINE 1]","[EMPLOYEE ADDRESS LINE 2]",
"[LETTER ISSUE DATE]","[APPOINTMENT EFFECTIVE DATE]","[NIC NUMBER]"];
function dateString(input){
 const iso=String(input||"").slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return "";
 const [y,m,d]=iso.split("-").map(Number);
 const months=["January","February","March","April","May","June","July","August","September","October","November","December"];
 return String(d).padStart(2,"0")+" "+months[m-1]+" "+y;
}
function today(){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Colombo",day:"2-digit",month:"2-digit",year:"numeric"}).formatToParts(new Date());
 const read=key=>parts.find(p=>p.type===key)?.value||"";
 return dateString(read("year")+"-"+read("month")+"-"+read("day"));
}
function replacements(e){
 const addr=String(e.address||"").split(/\r?\n|,/).map(v=>v.trim()).filter(Boolean);
 return {
 "[EMPLOYEE FULL NAME]":e.full_name,
 "[EMPLOYEE ADDRESS LINE 1]":addr[0]||"",
 "[EMPLOYEE ADDRESS LINE 2]":addr.slice(1).join(", "),
 "[LETTER ISSUE DATE]":today(),
 "[APPOINTMENT EFFECTIVE DATE]":dateString(e.joined_on),
 "[NIC NUMBER]":e.national_id
 };
}
function incomplete(e){
 const list=[];
 if(!e.full_name)list.push("Name");
 if(!e.national_id)list.push("NIC");
 if(!e.address)list.push("Address");
 if(!e.joined_on)list.push("Joining Date");
 return list;
}
function xmlEscape(v){
 return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function patchXml(xml,data){
 const changed=new Set();
 const next=xml.replace(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g,element=>{
  let out=element;
  for(const [placeholder,value] of Object.entries(data)){
   if(out.includes(placeholder)){out=out.split(placeholder).join(xmlEscape(value));changed.add(placeholder)}
  }
  return out;
 });
 return {xml:next,changed};
}
async function templateReady(){
 const b=bridge();if(!b?.isHR)return;
 const {data,error}=await b.state.client.storage.from(bucket).list(folder,{limit:100});
 if(error)throw Error(error.message);
 available=new Set((data||[]).filter(x=>x.name?.endsWith(".docx")).map(x=>x.name));
 ready=true;
 setStatus("ap-word-upload-status",available.size+" of 15 original Word templates installed in private storage.");
}

async function generate(){
 const b=bridge();
 if(!b?.isHR||!current)return;
 const employee=b.state.employees.find(e=>e.id===current.id);
 const role=employee&&originalRole(employee.designation);
 if(!role)return setStatus("ap-v3-status","No original Word letter matches this designation.");
 const missing=incomplete(employee);
 if(missing.length)return setStatus("ap-v3-status","Complete in Staff Master: "+missing.join(", "));
 if(!window.JSZip)return setStatus("ap-v3-status","Word ZIP library unavailable; reload the app.");
 const button=$("ap-v3-generate");button.disabled=true;
 try{
  setStatus("ap-v3-status","Preparing the original "+role+" Word letter...");
  const {data,error}=await b.state.client.storage.from(bucket).download(pathForRole(role));
  if(error||!data)throw Error("Original Word template not installed. Admin: open Letters and upload the 15-file ZIP once.");
  const zip=await JSZip.loadAsync(data);
  const part=zip.file("word/document.xml");
  if(!part)throw Error("Original Word file is invalid");
  const source=await part.async("string");
  const {xml,changed}=patchXml(source,replacements(employee));
  const unfilled=requirements.filter(x=>!changed.has(x));
  if(unfilled.length)throw Error("Original Word placeholder missing: "+unfilled.join(", "));
  if(/\[AMOUNT TO BE COMPLETED\]/.test(xml))throw Error("Original template contains an unapproved salary amount. Complete the approved source letter first.");
  zip.file("word/document.xml",xml);
  const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6},
   mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download="PRIME_Appointment_"+employee.staff_code+"_"+role.replace(/\s+/g,"_")+".docx";
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  setStatus("ap-v3-status","Downloaded original editable Word document. Review and authorize before issuing.");
 }catch(e){setStatus("ap-v3-status","Word generation failed: "+e.message)}
 finally{button.disabled=false}
}
function choose(){
 const b=bridge();
 current=b?.state.employees.find(e=>e.id===$("ap-v3-employee")?.value)||null;
 const role=current&&originalRole(current.designation);
 const missing=current?incomplete(current):[];
 const details=$("ap-v3-details");
 details.classList.toggle("hidden",!current);
 if(current)details.textContent=current.staff_code+" — "+current.full_name+" | "+current.designation+
 " | Original Word: "+(role||"NOT AVAILABLE")+(missing.length?" | Missing: "+missing.join(", "):"");
 $("ap-v3-generate").disabled=!current||!role||missing.length>0;
 setStatus("ap-v3-status",!current?"Select employee.":!role?"No original Word letter for this designation.":missing.length?
 "Complete missing fields in Staff Master before download.":"Original "+role+" Word letter selected automatically.");
}
function render(){
 const b=bridge(),el=$("ap-v3-employee");
 if(!b?.isHR||!el)return;
 const old=el.value;
 el.replaceChildren(new Option("Select Employee",""),...b.state.employees.filter(e=>e.status==="active")
   .map(e=>new Option(e.staff_code+" — "+e.full_name,e.id)));
 el.value=old;
 el.onchange=choose;
 $("ap-v3-generate").onclick=generate;
 choose();
}

async function uploadOriginals(){
 const b=bridge(),input=$("ap-word-zip"),button=$("ap-word-upload");
 if(!b?.isAdmin)return setStatus("ap-word-upload-status","Only Admin can install official Word templates.");
 if(!window.JSZip)return setStatus("ap-word-upload-status","JSZip could not load. Reload app.");
 const file=input?.files?.[0];
 if(!file)return setStatus("ap-word-upload-status","Select the updated 15 Appointment Letters ZIP first.");
 button.disabled=true;
 try{
  setStatus("ap-word-upload-status","Checking original Word ZIP...");
  const archive=await JSZip.loadAsync(file);
  const verified=[];
  for(const role of roles){
   const original="Editable_DOCX/Appointment_Letter_"+role.replace(/\s+/g,"_")+".docx";
   const item=archive.file(original);
   if(!item)throw Error("Missing updated original Word file for "+role);
   const bytes=await item.async("uint8array");
   const doc=await JSZip.loadAsync(bytes);
   const part=doc.file("word/document.xml");
   if(!part)throw Error("Corrupt original Word file for "+role);
   const xml=await part.async("string");
   for(const token of requirements)if(!xml.includes(token))throw Error("Missing original Word marker "+token+" in "+role);
   verified.push({role,bytes});
  }
  for(let i=0;i<verified.length;i++){
   const {role,bytes}=verified[i];
   setStatus("ap-word-upload-status","Saving original Word templates: "+(i+1)+"/15 — "+role);
   const {error}=await b.state.client.storage.from(bucket).upload(pathForRole(role),bytes,
    {contentType:"application/octet-stream",upsert:true,cacheControl:"0"});
   if(error)throw Error(role+": "+error.message);
  }
  await templateReady();
  setStatus("ap-word-upload-status","All 15 original Word documents securely installed. Appointment tab is now ready.");
  input.value="";
 }catch(e){setStatus("ap-word-upload-status","Setup failed: "+e.message)}
 finally{button.disabled=false}
}
window.PrimeAppointmentV2={render};
if(document.readyState==="loading"){
 document.addEventListener("DOMContentLoaded",()=>{
  $("ap-word-upload")?.addEventListener("click",uploadOriginals);
  $("appointment-word-setup")?.addEventListener("toggle",()=>{if($("appointment-word-setup").open&&bridge()?.isAdmin)templateReady().catch(e=>setStatus("ap-word-upload-status",e.message))});
 });
}else{
 $("ap-word-upload")?.addEventListener("click",uploadOriginals);
}

})();
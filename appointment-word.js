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
 return d+" "+months[m-1]+" "+y;
}
function today(){
 return dateString(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()));
}
function replacements(e){
 const addr=String(e.address||"").split(/\r?\n|,/).map(v=>v.trim()).filter(Boolean);
 return {
 "[EMPLOYEE FULL NAME]":e.full_name,
 "[EMPLOYEE ADDRESS LINE 1]":addr[0]||"",
 "[EMPLOYEE ADDRESS LINE 2]":addr.slice(1).join(", "),
 "[LETTER ISSUE DATE]":today(),
 "[APPOINTMENT EFFECTIVE DATE]":dateString(e.appointment_effective_date),
 "[NIC NUMBER]":e.national_id
 };
}
function incomplete(e){
 const list=[];
 if(!e.full_name)list.push("Name");
 if(!e.national_id)list.push("NIC");
 if(!e.address)list.push("Address");
 if(!e.appointment_effective_date)list.push("Appointment Effective Date");
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

})();
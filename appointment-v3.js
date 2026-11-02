(function(){
const $=x=>document.getElementById(x),B=()=>window.PrimeAppointmentBridge?.();
let roles=[],chosen;
function select(){
const b=B(),e=b.state.employees.find(e=>e.id===$("ap-v3-employee").value);chosen=e;
const role=e&&roles.find(x=>x.toLowerCase()===(({"AGM":"Assistant General Manager","Cluster Sales Manager":"Cluster Manager"})[e.designation]||e.designation).trim().toLowerCase());
$("ap-v3-generate").disabled=!role;
$("ap-v3-details").textContent=e?e.full_name+" — "+e.designation+" — "+(role||"No matching letter"):"";
$("ap-v3-details").classList.toggle("hidden",!e);
$("ap-v3-status").textContent=role?"Updated letter selected: "+role:e?"No matching updated letter":"Select employee";
}
async function call(action,position){
const b=B(),{data,error}=await b.state.client.functions.invoke("prime-appointment-documents",{body:{action,position}});
if(error||data?.error)throw Error(error?.message||data.error);return data;
}
function fill(line,employee){
 const addr=String(employee.address||"").split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean);
 const date=new Date().toLocaleDateString("en-GB",{timeZone:"Asia/Colombo"});
 const data={
 "[EMPLOYEE FULL NAME]":employee.full_name||"",
 "[EMPLOYEE ADDRESS LINE 1]":addr[0]||"[EMPLOYEE ADDRESS LINE 1]",
 "[EMPLOYEE ADDRESS LINE 2]":addr.slice(1).join(", ")||"[EMPLOYEE ADDRESS LINE 2]",
 "[LETTER ISSUE DATE]":date,
 "[APPOINTMENT EFFECTIVE DATE]":employee.appointment_effective_date||"[APPOINTMENT EFFECTIVE DATE]",
 "[NIC NUMBER]":employee.national_id||"[NIC NUMBER]"
 };
 return Object.entries(data).reduce((v,[key,val])=>v.split(key).join(val),String(line||""));
}
function createPreview(template,employee,page){
 if(!page)throw Error("Allow popups to preview the letter.");
 const doc=page.document;
 doc.title="PRIME Appointment Letter - "+employee.staff_code;
 const style=doc.createElement("style");
 style.textContent="@page{size:A4;margin:16mm}body{font:13px/1.45 Georgia,serif;max-width:800px;margin:16px auto;color:#222}p{margin:0 0 9px;white-space:pre-wrap}table{border-collapse:collapse;width:100%;margin:16px 0;font:12px Arial}td{padding:6px;border:1px solid #999}header{font:bold 25px Arial;text-align:center;padding:10px 0;border-bottom:2px solid #b49a4e;color:#987b1f}@media print{button,.notice{display:none}body{margin:0;max-width:none}}";
 doc.head.appendChild(style);
 const hasUnfilled=template.paragraphs.some(p=>/\[[A-Z][A-Z0-9 ]+\]/.test(fill(p,employee)))||template.tables.some(t=>t.some(row=>row.some(cell=>/\[[A-Z][A-Z0-9 ]+\]/.test(fill(cell,employee)))));
 const action=doc.createElement("button");action.type="button";action.textContent=hasUnfilled?"Complete Staff Master fields before printing":"Print / Save PDF";action.disabled=hasUnfilled;action.addEventListener("click",()=>page.print());doc.body.appendChild(action);
 const banner=doc.createElement("header");banner.textContent="PRIME AGRI BUSINESS & PLANTATIONS";doc.body.appendChild(banner);
 const note=doc.createElement("p");note.className="notice";note.textContent=hasUnfilled?"DRAFT ONLY: Missing Staff Master details or unapproved placeholder. Complete them before printing.":"Preview from updated Word letter. Verify all fields and legal clauses before issuing.";doc.body.appendChild(note);
 let paragraphCount=0;
 function addTable(rows){
  const table=doc.createElement("table");
  for(const cells of rows){
   const tr=doc.createElement("tr");
   for(const cell of cells){const td=doc.createElement("td");td.textContent=fill(cell,employee);tr.appendChild(td)}
   table.appendChild(tr);
  }
  doc.body.appendChild(table);
 }
 for(const line of template.paragraphs){
  const p=doc.createElement("p");p.textContent=fill(line,employee);doc.body.appendChild(p);
  paragraphCount++;
  const index=paragraphCount-92;
  if(index>=0&&index<template.tables.length)addTable(template.tables[index]);
 }

}
window.PrimeAppointmentV2={render:async()=>{
const b=B();if(!b?.isHR)return;
const s=$("ap-v3-employee"),old=s.value;s.replaceChildren(new Option("Select Employee",""),...b.state.employees.filter(e=>e.status==="active").map(e=>new Option(e.staff_code+" — "+e.full_name,e.id)));s.value=old;
s.onchange=select;
$("ap-v3-generate").onclick=async()=>{
 const btn=$("ap-v3-generate");
 try{
  if(!chosen)return;
  const current=B().state.employees.find(e=>e.id===chosen.id);
  if(!current)throw Error("Employee not found in Staff Master");
  const role=roles.find(r=>r.toLowerCase()===(({"AGM":"Assistant General Manager","Cluster Sales Manager":"Cluster Manager"})[current.designation]||current.designation).trim().toLowerCase());
  if(!role)throw Error("No matching updated letter for designation");
  btn.disabled=true;
  $("ap-v3-status").textContent="Preparing "+role+" letter...";
  const popup=window.open("about:blank","_blank");
  if(!popup)throw Error("Please enable popups for appointment previews.");
  const result=await call("document",role);
  createPreview(result.template,current,popup);
  $("ap-v3-status").textContent="Appointment letter preview ready. Review before issuing.";
 }catch(error){$("ap-v3-status").textContent="Could not generate: "+error.message}
 finally{const message=$("ap-v3-status").textContent;select();$("ap-v3-status").textContent=message}
};
if(!roles.length){try{roles=(await call("list")).positions;select()}catch(e){$("ap-v3-status").textContent=e.message}}
}};
})();
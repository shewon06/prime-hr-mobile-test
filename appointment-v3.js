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
window.PrimeAppointmentV2={render:async()=>{
const b=B();if(!b?.isHR)return;
const s=$("ap-v3-employee"),old=s.value;s.replaceChildren(new Option("Select Employee",""),...b.state.employees.filter(e=>e.status==="active").map(e=>new Option(e.staff_code+" — "+e.full_name,e.id)));s.value=old;
s.onchange=select;
$("ap-v3-generate").onclick=async()=>{if(!chosen)return;const role=roles.find(r=>r.toLowerCase()===chosen.designation.toLowerCase());if(!role)return;const data=await call("document",role);$("ap-v3-status").textContent="Letter loaded: "+data.template.position};
if(!roles.length){try{roles=(await call("list")).positions;select()}catch(e){$("ap-v3-status").textContent=e.message}}
}};
})();
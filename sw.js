// PRIME HR v4 — cache ONLY public static app assets. Never store Auth/API/private data.
const CACHE="prime-hr-shell-v8-20261027";
const ASSETS=["./","./index.html","./app.js","./employee.html","./employee.js","./styles.css","./config.js","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}));self.skipWaiting()});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("prime-hr-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",event=>{
 const req=event.request;if(req.method!=="GET")return;const u=new URL(req.url);
 if(u.origin!==self.location.origin||!u.pathname.startsWith(new URL("./",self.location.href).pathname))return;
 event.respondWith(fetch(req).then(res=>{
   if(res.ok&&["document","script","style","image","manifest"].includes(req.destination)){
     const clone=res.clone();caches.open(CACHE).then(c=>c.put(req,clone));
   }return res;
 }).catch(()=>caches.match(req,{ignoreSearch:req.mode==="navigate"}).then(r=>r||(req.mode==="navigate"?caches.match("./employee.html"):Response.error()))));
});
// PRIME HR NEXT LEVEL • app shell cache
// DO NOT cache any Supabase API responses, login tokens or private employee data.
const CACHE="prime-hr-live-shell-v3-20261026";
const SHELL=["./","./index.html","./styles.css","./app.js","./config.js","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));
 self.skipWaiting();
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("prime-hr-live-shell-")||k.startsWith("prime-hr-mobile-install-test-")).filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
 const req=event.request;if(req.method!=="GET")return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin||!url.pathname.startsWith(new URL("./",self.location.href).pathname))return;
 // Network-first HTML/script; offline app shell only (no employee records).
 event.respondWith(fetch(req).then(res=>{
   if(res.ok&&["document","script","style","manifest","image"].includes(req.destination)){
     const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));
   }
   return res;
 }).catch(()=>caches.match(req,{ignoreSearch:req.mode==="navigate"}).then(v=>v||(req.mode==="navigate"?caches.match("./index.html"):Response.error()))));
});

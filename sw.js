// PRIME HR v4 — cache ONLY public static app assets. Never store Auth/API/private data.
const CACHE="prime-hr-shell-v14-20261027";
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

// True background Web Push: a provider can wake this worker after the PWA is closed.
self.addEventListener("push",event=>{
 let data={};
 try{data=event.data?.json()||{}}
 catch{data={body:event.data?.text()||"You have a new HR notification."}}
 const title=String(data.title||"PRIME HR Notification").slice(0,180);
 const body=String(data.body||"Open PRIME HR to read your update.").slice(0,800);
 const id=String(data.notificationId||"").slice(0,90);
 event.waitUntil(
  self.registration.showNotification(title,{
   body,icon:"./icon-192.png",badge:"./icon-192.png",
   tag:id?"prime-hr-"+id:"prime-hr-update",
   renotify:true,
   data:{url:"./employee.html#alerts"},
   timestamp:Date.now()
  })
 );
});

// Foreground-created system alerts can be tapped to open the mobile inbox.
// Actual app-closed push delivery requires a separate Push API subscription + sender.
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 event.waitUntil(
  self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async windows=>{
   for(const client of windows){
    if(new URL(client.url).origin===self.location.origin&&new URL(client.url).pathname.endsWith("/employee.html")){
      await client.focus();
      client.postMessage({type:"PRIME_HR_OPEN_ALERTS"});
      return;
    }
   }
   if(self.clients.openWindow)await self.clients.openWindow("./employee.html#alerts");
  })
 );
});
